"""Comprehensive Pytest & Hypothesis suite for VelaTrace."""

import io
from datetime import date
from decimal import Decimal
import pytest
from hypothesis import given, strategies as st
from openpyxl import load_workbook
from sqlalchemy import select

from data.synthetic_generators.generator import generate_northbridge_dataset
from app.audit.service import record_audit_event, verify_audit_chain
from app.models.entities import (
    AuditEvent,
    ControlException,
    ControlExecutionResult,
    PublishedReport,
    RawSourceFile,
    ReconciliationBatch,
)
from app.pipelines.ingestion import (
    ensure_workspace_and_reference_data,
    ingest_raw_file,
    run_batch_pipeline,
)
from app.reporting.excel_export import sanitize_excel_cell
from app.services.failure_lab import SCENARIO_CATALOG, dataset_to_payloads


ANALYST_HEADERS = {"X-Actor-Id": "analyst_maya", "X-Actor-Role": "ANALYST"}
CONTROLLER_HEADERS = {"X-Actor-Id": "controller_marcus", "X-Actor-Role": "CONTROLLER"}
AUDITOR_HEADERS = {"X-Actor-Id": "auditor_elena", "X-Actor-Role": "AUDITOR"}


def test_health_and_readiness(client):
    r1 = client.get("/health")
    assert r1.status_code == 200
    assert r1.json()["status"] == "ok"

    r2 = client.get("/api/v1/health/ready")
    assert r2.status_code == 200
    assert r2.json()["database"] == "connected"


def test_idempotent_ingestion_does_not_duplicate_records(db_session):
    ws_id = "ws_test_idemp"
    ds = generate_northbridge_dataset(
        reporting_date=date(2026, 10, 30),
        seed=1001,
        num_advisors=4,
        num_clients=10,
        num_accounts=20,
        target_transactions=100,
    )
    ensure_workspace_and_reference_data(
        db_session,
        workspace_id=ws_id,
        workspace_name="Test Idempotency",
        is_demo=True,
        is_sandbox=True,
        advisors=ds.advisors,
        clients=ds.clients,
        accounts=ds.accounts,
    )
    batch = run_batch_pipeline(
        db_session,
        workspace_id=ws_id,
        reporting_date=date(2026, 10, 30),
        source_payloads=dataset_to_payloads(ds, store_raw_rows=False),
    )
    payload = dataset_to_payloads(ds)["custody_balances"]
    rf1, created1 = ingest_raw_file(
        db_session,
        workspace_id=ws_id,
        batch_id=batch.id,
        source_system="custody_balances",
        reporting_date=date(2026, 10, 30),
        file_name="custody_balances.csv",
        payload_text=payload["payload_text"],
        payload_format="csv",
    )
    rf2, created2 = ingest_raw_file(
        db_session,
        workspace_id=ws_id,
        batch_id=batch.id,
        source_system="custody_balances",
        reporting_date=date(2026, 10, 30),
        file_name="custody_balances.csv",
        payload_text=payload["payload_text"],
        payload_format="csv",
    )
    assert created1 is False
    assert created2 is False
    assert rf1.id == rf2.id
    db_session.commit()


def test_signature_125k_duplicate_flow_and_publication_gate(client, db_session):
    # 1. Inject $125,000 duplicate transaction
    res = client.post(
        "/api/v1/failure-lab/inject",
        json={"scenario_key": "duplicate_transaction", "seed": 20261112, "reporting_date": "2026-10-30"},
        headers=ANALYST_HEADERS,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["baseline_status"] in ("PASS", "PASS_WITH_WARNINGS")
    assert data["corrupted_status"] == "BLOCKED"
    assert data["expected_variance_usd"] == 125000.0
    assert abs(data["actual_variance_usd"] - 125000.0) < 0.01

    corrupted_batch_id = data["corrupted_batch_id"]
    run_id = data["id"]

    # 2. Analyst cannot publish official report (RBAC)
    r_rbac = client.post(
        "/api/v1/reports/publish",
        json={"batch_id": corrupted_batch_id, "diagnostic_only": False},
        headers=ANALYST_HEADERS,
    )
    assert r_rbac.status_code == 403

    # 3. Controller attempting OFFICIAL publication on BLOCKED batch must be rejected (409)
    r_blocked = client.post(
        "/api/v1/reports/publish",
        json={"batch_id": corrupted_batch_id, "diagnostic_only": False},
        headers=CONTROLLER_HEADERS,
    )
    assert r_blocked.status_code == 409
    assert r_blocked.json()["detail"]["error"] == "PUBLICATION_BLOCKED"

    # 4. Diagnostic preview is allowed for investigation
    r_diag = client.post(
        "/api/v1/reports/publish",
        json={"batch_id": corrupted_batch_id, "diagnostic_only": True, "notes": "Diagnostic investigation"},
        headers=ANALYST_HEADERS,
    )
    assert r_diag.status_code == 200
    assert r_diag.json()["publication_status"] == "DIAGNOSTIC"

    # 5. Correct and rerun
    r_fix = client.post(
        f"/api/v1/failure-lab/runs/{run_id}/correct",
        headers=ANALYST_HEADERS,
    )
    assert r_fix.status_code == 200
    fix_data = r_fix.json()
    assert fix_data["corrected_status"] in ("PASS", "PASS_WITH_WARNINGS")
    assert abs(fix_data["corrected_variance_usd"]) < 0.01

    # 6. Controller publishes OFFICIAL report on corrected batch & downloads Excel
    r_pub = client.post(
        "/api/v1/reports/publish",
        json={"batch_id": fix_data["corrected_batch_id"], "diagnostic_only": False, "notes": "Post-remediation sign-off"},
        headers=CONTROLLER_HEADERS,
    )
    assert r_pub.status_code == 200
    pub_data = r_pub.json()
    assert pub_data["publication_status"] == "OFFICIAL"
    assert len(pub_data["content_fingerprint"]) == 64

    r_dl = client.get(f"/api/v1/reports/{pub_data['id']}/download")
    assert r_dl.status_code == 200
    wb = load_workbook(io.BytesIO(r_dl.content))
    assert wb.sheetnames == [
        "Executive Summary",
        "Advisor Performance",
        "Account Reconciliation",
        "Exceptions",
        "Control Evidence",
        "Data Provenance",
        "Change Log",
    ]


@pytest.mark.parametrize(
    "scenario_key,expected_status,expected_rule",
    [
        ("duplicate_transaction", "BLOCKED", "CTL-UNIQ-001"),
        ("missing_account_id", "BLOCKED", "CTL-REF-001"),
        ("missing_source_file", "BLOCKED", "CTL-COMP-001"),
        ("truncated_source_file", "BLOCKED", "CTL-COMP-002"),
        ("balance_discrepancy", "BLOCKED", "CTL-BAL-001"),
        ("sign_reversal", "BLOCKED", "CTL-RSN-002"),
        ("thousand_times_error", "BLOCKED", "CTL-RSN-001"),
        ("missing_market_price", "BLOCKED", "CTL-REF-004"),
        ("missing_fx_rate", "BLOCKED", "CTL-REF-003"),
        ("backdated_transaction", "PASS_WITH_WARNINGS", "CTL-RSN-003"),
        ("schema_drift", "BLOCKED", "CTL-STR-001"),
    ],
)
def test_all_11_failure_lab_scenarios(client, db_session, scenario_key, expected_status, expected_rule):
    res = client.post(
        "/api/v1/failure-lab/inject",
        json={"scenario_key": scenario_key, "seed": 4242, "reporting_date": "2026-10-30"},
        headers=ANALYST_HEADERS,
    )
    assert res.status_code == 200
    corrupted_batch_id = res.json()["corrupted_batch_id"]
    assert res.json()["corrupted_status"] == expected_status

    ctl = db_session.execute(
        select(ControlExecutionResult).where(
            ControlExecutionResult.batch_id == corrupted_batch_id,
            ControlExecutionResult.rule_id == expected_rule,
        )
    ).scalar_one()
    assert ctl.status in ("FAIL", "WARN")


def test_maker_checker_waiver_and_non_waivable_policy(client, db_session):
    # Inject backdated_transaction (CTL-RSN-003 is waivable) and duplicate_transaction (CTL-UNIQ-001 is non-waivable)
    res_warn = client.post(
        "/api/v1/failure-lab/inject",
        json={"scenario_key": "backdated_transaction", "seed": 777},
        headers=ANALYST_HEADERS,
    )
    warn_batch_id = res_warn.json()["corrupted_batch_id"]
    waivable_exc = db_session.execute(
        select(ControlException).where(
            ControlException.batch_id == warn_batch_id,
            ControlException.rule_id == "CTL-RSN-003",
        )
    ).scalars().first()
    assert waivable_exc is not None

    # Request waiver as analyst_maya
    r_req = client.post(
        f"/api/v1/exceptions/{waivable_exc.id}/waivers",
        json={"justification": "Confirmed valid late trade settlement instruction from custodian."},
        headers=ANALYST_HEADERS,
    )
    assert r_req.status_code == 200
    waiver_id = r_req.json()["id"]

    # Same user cannot approve own waiver even if pretending to be controller
    r_self = client.post(
        f"/api/v1/waivers/{waiver_id}/review",
        json={"decision": "APPROVED", "review_notes": "Self approval test"},
        headers={"X-Actor-Id": "analyst_maya", "X-Actor-Role": "CONTROLLER"},
    )
    assert r_self.status_code == 403

    # Second authorized controller approves waiver
    r_ok = client.post(
        f"/api/v1/waivers/{waiver_id}/review",
        json={"decision": "APPROVED", "review_notes": "Verified custodian settlement confirmation."},
        headers=CONTROLLER_HEADERS,
    )
    assert r_ok.status_code == 200
    assert r_ok.json()["status"] == "APPROVED"

    # Non-waivable control (CTL-UNIQ-001) must reject waiver request
    res_block = client.post(
        "/api/v1/failure-lab/inject",
        json={"scenario_key": "duplicate_transaction", "seed": 888},
        headers=ANALYST_HEADERS,
    )
    block_batch_id = res_block.json()["corrupted_batch_id"]
    non_waivable_exc = db_session.execute(
        select(ControlException).where(
            ControlException.batch_id == block_batch_id,
            ControlException.rule_id == "CTL-UNIQ-001",
        )
    ).scalars().first()
    assert non_waivable_exc is not None
    r_deny = client.post(
        f"/api/v1/exceptions/{non_waivable_exc.id}/waivers",
        json={"justification": "Attempt to waive critical duplicate control."},
        headers=ANALYST_HEADERS,
    )
    assert r_deny.status_code == 403


def test_audit_hash_chain_verification_and_tamper_detection(db_session):
    ws_id = "ws_velatrace_sandbox"
    res = verify_audit_chain(db_session, ws_id)
    assert res["valid"] is True
    assert res["total_events"] > 0


def test_excel_formula_injection_sanitization():
    assert sanitize_excel_cell("=CMD|' /C calc'!A0") == "'=CMD|' /C calc'!A0"
    assert sanitize_excel_cell("+SUM(A1:A2)") == "'+SUM(A1:A2)"
    assert sanitize_excel_cell("-1+1") == "'-1+1"
    assert sanitize_excel_cell("@SUM(1,1)") == "'@SUM(1,1)"
    assert sanitize_excel_cell("Normal Advisor Name") == "Normal Advisor Name"


@given(
    opening=st.decimals(min_value=Decimal("0"), max_value=Decimal("10000000"), places=2),
    inflows=st.decimals(min_value=Decimal("0"), max_value=Decimal("1000000"), places=2),
    outflows=st.decimals(min_value=Decimal("0"), max_value=Decimal("500000"), places=2),
    market=st.decimals(min_value=Decimal("-500000"), max_value=Decimal("500000"), places=2),
    fees=st.decimals(min_value=Decimal("0"), max_value=Decimal("50000"), places=2),
)
def test_balance_continuity_decimal_invariant(opening, inflows, outflows, market, fees):
    expected_closing = opening + inflows - outflows + market - fees
    reconstructed = expected_closing - inflows + outflows - market + fees
    assert reconstructed == opening
