"""VelaTrace Failure Lab — Deterministic, isolated synthetic failure injection & recovery engine."""

import copy
import json
import random
import sys
import uuid
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any
from sqlalchemy import select
from sqlalchemy.orm import Session

# Allow importing data/synthetic_generators
ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from data.synthetic_generators.generator import (
    GeneratedDataset,
    generate_northbridge_dataset,
    to_csv_string,
)
from app.audit.service import record_audit_event
from app.models.entities import FailureLabRun, ReconciliationBatch
from app.pipelines.ingestion import (
    ensure_workspace_and_reference_data,
    run_batch_pipeline,
)

SCENARIO_CATALOG: list[dict[str, Any]] = [
    {
        "scenario_key": "duplicate_transaction",
        "name": "The $125,000 Discrepancy (Duplicate Transaction)",
        "category": "Uniqueness",
        "expected_rule": "CTL-UNIQ-001",
        "description": "Duplicates wire deposit TXN-20261030-000001 ($125,000.00) in ledger_transactions.csv, creating a $125,000.00 overstatement vs custody.",
        "is_signature": True,
    },
    {
        "scenario_key": "missing_account_id",
        "name": "Missing Account Identifier",
        "category": "Referential Integrity",
        "expected_rule": "CTL-REF-001",
        "description": "Clears account_external_id on a custody balance row so canonical account resolution fails.",
        "is_signature": False,
    },
    {
        "scenario_key": "missing_source_file",
        "name": "Missing Required Source File",
        "category": "Completeness",
        "expected_rule": "CTL-COMP-001",
        "description": "Omits trades.json from the ingested batch payload, triggering completeness blocking.",
        "is_signature": False,
    },
    {
        "scenario_key": "truncated_source_file",
        "name": "Truncated Source File (Empty Feed)",
        "category": "Completeness",
        "expected_rule": "CTL-COMP-002",
        "description": "Delivers a header-only custody_balances.csv with zero data rows.",
        "is_signature": False,
    },
    {
        "scenario_key": "balance_discrepancy",
        "name": "Unexplained Custody Balance Discrepancy",
        "category": "Balance Continuity",
        "expected_rule": "CTL-BAL-001",
        "description": "Alters closing custody total_value by +$42,500.00 without a corresponding ledger cash flow.",
        "is_signature": False,
    },
    {
        "scenario_key": "sign_reversal",
        "name": "Transaction Sign Reversal",
        "category": "Reasonableness",
        "expected_rule": "CTL-RSN-002",
        "description": "Flips a client withdrawal from negative (-$18,500) to positive (+$18,500), violating sign conventions.",
        "is_signature": False,
    },
    {
        "scenario_key": "thousand_times_error",
        "name": "Thousand-Times Amount Scaling Error",
        "category": "Reasonableness",
        "expected_rule": "CTL-RSN-001",
        "description": "Multiplies a $12,000 deposit by 1000x ($12,000,000), breaching the $5M reasonableness ceiling.",
        "is_signature": False,
    },
    {
        "scenario_key": "missing_market_price",
        "name": "Missing Closing Market Price",
        "category": "Referential Integrity",
        "expected_rule": "CTL-REF-004",
        "description": "Removes SEC-AAPL from market_prices.csv while trades reference SEC-AAPL.",
        "is_signature": False,
    },
    {
        "scenario_key": "missing_fx_rate",
        "name": "Missing FX Conversion Rate",
        "category": "Referential Integrity",
        "expected_rule": "CTL-REF-003",
        "description": "Removes EUR/USD from fx_rates.csv while EUR accounts exist in custody.",
        "is_signature": False,
    },
    {
        "scenario_key": "backdated_transaction",
        "name": "Backdated Transaction Beyond Cut-Off",
        "category": "Reasonableness",
        "expected_rule": "CTL-RSN-003",
        "description": "Sets a transaction trade_date 95 days prior to reporting_date, triggering a non-blocking cut-off warning.",
        "is_signature": False,
    },
    {
        "scenario_key": "schema_drift",
        "name": "Source Schema Drift",
        "category": "Structural Controls",
        "expected_rule": "CTL-STR-001",
        "description": "Renames required column 'net_amount' to 'amt_net' in ledger_transactions.csv.",
        "is_signature": False,
    },
]


def dataset_to_payloads(ds: GeneratedDataset, store_raw_rows: bool = False) -> dict[str, dict[str, Any]]:
    return {
        "custody_balances": {
            "file_name": "custody_balances.csv",
            "payload_text": to_csv_string(ds.custody_balances),
            "payload_format": "csv",
            "declared_control_total": ds.manifest["sources"]["custody_balances"]["declared_control_total_usd"],
            "declared_currency": "USD",
            "store_raw_rows": store_raw_rows,
        },
        "ledger_transactions": {
            "file_name": "ledger_transactions.csv",
            "payload_text": to_csv_string(ds.ledger_transactions),
            "payload_format": "csv",
            "declared_control_total": ds.manifest["sources"]["ledger_transactions"]["declared_control_total_usd"],
            "declared_currency": "USD",
            "store_raw_rows": store_raw_rows,
        },
        "trades": {
            "file_name": "trades.json",
            "payload_text": json.dumps(ds.trades),
            "payload_format": "json",
            "store_raw_rows": False,
        },
        "crm_accounts": {
            "file_name": "crm_accounts.csv",
            "payload_text": to_csv_string(ds.crm_accounts),
            "payload_format": "csv",
            "store_raw_rows": False,
        },
        "market_prices": {
            "file_name": "market_prices.csv",
            "payload_text": to_csv_string(ds.market_prices),
            "payload_format": "csv",
            "store_raw_rows": False,
        },
        "fx_rates": {
            "file_name": "fx_rates.csv",
            "payload_text": to_csv_string(ds.fx_rates),
            "payload_format": "csv",
            "store_raw_rows": False,
        },
    }


def _apply_scenario_corruption(
    scenario_key: str,
    ds: GeneratedDataset,
    seed: int,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any], Decimal]:
    """Mutate a fresh copy of synthetic payloads deterministically for the requested scenario."""
    payloads = dataset_to_payloads(ds, store_raw_rows=False)
    rng = random.Random(seed)
    expected_var = Decimal("0.0000")
    details: dict[str, Any] = {"scenario_key": scenario_key, "seed": seed}

    if scenario_key == "duplicate_transaction":
        txns = copy.deepcopy(ds.ledger_transactions)
        target = txns[0]  # TXN-20261030-000001: $125,000.00 DEPOSIT on NB-ACC-0001
        dup = copy.deepcopy(target)
        txns.insert(1, dup)
        payloads["ledger_transactions"]["payload_text"] = to_csv_string(txns)
        expected_var = Decimal("125000.0000")
        details.update(
            {
                "affected_file": "ledger_transactions.csv",
                "duplicated_txn_id": target["external_txn_id"],
                "account_external_id": target["account_external_id"],
                "amount_usd": target["net_amount"],
                "original_row": 1,
                "injected_row": 2,
                "expected_blocking_rule": "CTL-UNIQ-001",
            }
        )

    elif scenario_key == "missing_account_id":
        cust = copy.deepcopy(ds.custody_balances)
        idx = rng.randint(0, min(20, len(cust) - 1))
        orig_acct = cust[idx]["account_external_id"]
        expected_var = Decimal(cust[idx]["total_value"])
        cust[idx]["account_external_id"] = ""
        payloads["custody_balances"]["payload_text"] = to_csv_string(cust)
        details.update(
            {
                "affected_file": "custody_balances.csv",
                "original_account_id": orig_acct,
                "row_number": idx + 1,
                "expected_blocking_rule": "CTL-REF-001",
            }
        )

    elif scenario_key == "missing_source_file":
        payloads.pop("trades")
        details.update(
            {
                "missing_source": "trades.json",
                "expected_blocking_rule": "CTL-COMP-001",
            }
        )

    elif scenario_key == "truncated_source_file":
        headers = list(ds.custody_balances[0].keys())
        payloads["custody_balances"]["payload_text"] = to_csv_string([], fieldnames=headers)
        expected_var = Decimal(ds.manifest["sources"]["custody_balances"]["declared_control_total_usd"])
        details.update(
            {
                "affected_file": "custody_balances.csv",
                "rows_remaining": 0,
                "expected_blocking_rule": "CTL-COMP-002",
            }
        )

    elif scenario_key == "balance_discrepancy":
        cust = copy.deepcopy(ds.custody_balances)
        target = cust[0]
        orig_val = Decimal(target["total_value"])
        new_val = orig_val + Decimal("42500.0000")
        target["total_value"] = f"{new_val:.4f}"
        payloads["custody_balances"]["payload_text"] = to_csv_string(cust)
        expected_var = Decimal("42500.0000")
        details.update(
            {
                "affected_file": "custody_balances.csv",
                "account_external_id": target["account_external_id"],
                "original_total": f"{orig_val:.4f}",
                "corrupted_total": f"{new_val:.4f}",
                "expected_blocking_rule": "CTL-BAL-001",
            }
        )

    elif scenario_key == "sign_reversal":
        txns = copy.deepcopy(ds.ledger_transactions)
        target = next(t for t in txns if t["txn_type"] == "WITHDRAWAL")
        orig_amt = Decimal(target["net_amount"])
        target["net_amount"] = f"{abs(orig_amt):.4f}"
        payloads["ledger_transactions"]["payload_text"] = to_csv_string(txns)
        expected_var = abs(orig_amt) * 2
        details.update(
            {
                "affected_file": "ledger_transactions.csv",
                "external_txn_id": target["external_txn_id"],
                "original_net_amount": str(orig_amt),
                "corrupted_net_amount": target["net_amount"],
                "expected_blocking_rule": "CTL-RSN-002",
            }
        )

    elif scenario_key == "thousand_times_error":
        txns = copy.deepcopy(ds.ledger_transactions)
        target = next(t for t in txns if t["txn_type"] == "DEPOSIT" and t["currency"] == "USD")
        orig_amt = Decimal(target["net_amount"])
        scaled = orig_amt * Decimal("1000")
        target["gross_amount"] = f"{scaled:.4f}"
        target["net_amount"] = f"{scaled:.4f}"
        payloads["ledger_transactions"]["payload_text"] = to_csv_string(txns)
        expected_var = scaled - orig_amt
        details.update(
            {
                "affected_file": "ledger_transactions.csv",
                "external_txn_id": target["external_txn_id"],
                "original_amount": str(orig_amt),
                "corrupted_amount": str(scaled),
                "expected_blocking_rule": "CTL-RSN-001",
            }
        )

    elif scenario_key == "missing_market_price":
        prices = [p for p in ds.market_prices if p["security_id"] != "SEC-AAPL"]
        payloads["market_prices"]["payload_text"] = to_csv_string(prices)
        details.update(
            {
                "affected_file": "market_prices.csv",
                "removed_security": "SEC-AAPL",
                "expected_blocking_rule": "CTL-REF-004",
            }
        )

    elif scenario_key == "missing_fx_rate":
        rates = [r for r in ds.fx_rates if r["from_currency"] != "EUR"]
        payloads["fx_rates"]["payload_text"] = to_csv_string(rates)
        details.update(
            {
                "affected_file": "fx_rates.csv",
                "removed_currency_pair": "EUR/USD",
                "expected_blocking_rule": "CTL-REF-003",
            }
        )

    elif scenario_key == "backdated_transaction":
        txns = copy.deepcopy(ds.ledger_transactions)
        target = txns[2]
        old_date = (ds.reporting_date - timedelta(days=95)).isoformat()
        target["trade_date"] = old_date
        payloads["ledger_transactions"]["payload_text"] = to_csv_string(txns)
        details.update(
            {
                "affected_file": "ledger_transactions.csv",
                "external_txn_id": target["external_txn_id"],
                "backdated_trade_date": old_date,
                "expected_rule": "CTL-RSN-003",
            }
        )

    elif scenario_key == "schema_drift":
        csv_text = payloads["ledger_transactions"]["payload_text"]
        payloads["ledger_transactions"]["payload_text"] = csv_text.replace(",net_amount,", ",amt_net,", 1)
        details.update(
            {
                "affected_file": "ledger_transactions.csv",
                "renamed_column": "net_amount -> amt_net",
                "expected_blocking_rule": "CTL-STR-001",
            }
        )
    else:
        raise ValueError(f"Unknown Failure Lab scenario: {scenario_key}")

    return payloads, details, expected_var


def run_failure_lab_injection(
    db: Session,
    *,
    scenario_key: str,
    seed: int = 20261112,
    reporting_date: date = date(2026, 10, 30),
    actor_id: str = "analyst_maya",
    actor_role: str = "ANALYST",
) -> FailureLabRun:
    """
    Execute an isolated Failure Lab simulation:
      1. Ensures sandbox workspace exists with synthetic reference data.
      2. Runs or reuses a clean baseline sandbox batch (PASS).
      3. Injects the deterministic corruption and executes the full pipeline.
      4. Persists FailureLabRun and audit trail.
    """
    scenario_meta = next((s for s in SCENARIO_CATALOG if s["scenario_key"] == scenario_key), None)
    if not scenario_meta:
        raise ValueError(f"Unknown scenario '{scenario_key}'")

    sandbox_ws = "ws_velatrace_sandbox"
    ds = generate_northbridge_dataset(
        reporting_date=reporting_date,
        seed=seed,
        num_advisors=12,
        num_clients=60,
        num_accounts=120,
        target_transactions=1200,
    )
    ensure_workspace_and_reference_data(
        db,
        workspace_id=sandbox_ws,
        workspace_name="Northbridge Wealth — Failure Lab Sandbox (Synthetic)",
        is_demo=True,
        is_sandbox=True,
        advisors=ds.advisors,
        clients=ds.clients,
        accounts=ds.accounts,
    )

    # Clean baseline batch
    baseline_batch = run_batch_pipeline(
        db,
        workspace_id=sandbox_ws,
        reporting_date=reporting_date,
        source_payloads=dataset_to_payloads(ds, store_raw_rows=False),
        triggered_by=actor_id,
        actor_role=actor_role,
        is_sandbox=True,
        scenario_key=f"{scenario_key}_baseline",
        notes=f"Failure Lab clean baseline for {scenario_key} (seed={seed})",
    )

    # Corrupted batch
    corrupted_payloads, injected_details, expected_var = _apply_scenario_corruption(scenario_key, ds, seed)
    corrupted_batch = run_batch_pipeline(
        db,
        workspace_id=sandbox_ws,
        reporting_date=reporting_date,
        source_payloads=corrupted_payloads,
        triggered_by=actor_id,
        actor_role=actor_role,
        is_sandbox=True,
        scenario_key=scenario_key,
        parent_batch_id=baseline_batch.id,
        notes=f"Failure Lab injected scenario: {scenario_meta['name']}",
    )

    fl_run = FailureLabRun(
        id=f"flr_{uuid.uuid4().hex[:14]}",
        workspace_id=sandbox_ws,
        scenario_key=scenario_key,
        scenario_name=scenario_meta["name"],
        seed=seed,
        baseline_batch_id=baseline_batch.id,
        corrupted_batch_id=corrupted_batch.id,
        corrected_batch_id=None,
        injected_details_json=injected_details,
        expected_variance_usd=expected_var,
        actual_variance_usd=abs(corrupted_batch.financial_variance_usd),
        status="BLOCKED_VERIFIED" if corrupted_batch.status == "BLOCKED" else "INJECTED",
    )
    db.add(fl_run)
    db.flush()

    record_audit_event(
        db,
        workspace_id=sandbox_ws,
        actor_id=actor_id,
        actor_role=actor_role,
        action="FAILURE_LAB_INJECTION",
        entity_type="FAILURE_LAB_RUN",
        entity_id=fl_run.id,
        prior_state={"baseline_batch": baseline_batch.batch_code, "status": baseline_batch.status},
        new_state={
            "corrupted_batch": corrupted_batch.batch_code,
            "status": corrupted_batch.status,
            "scenario_key": scenario_key,
            "expected_variance_usd": str(expected_var),
        },
        reason=f"Executed Failure Lab scenario '{scenario_key}' with seed {seed}.",
        batch_id=corrupted_batch.id,
    )
    db.commit()
    return fl_run


def correct_and_rerun_failure_lab(
    db: Session,
    *,
    fl_run: FailureLabRun,
    actor_id: str = "analyst_maya",
    actor_role: str = "ANALYST",
) -> FailureLabRun:
    """Create a corrected input version in the sandbox (preserving prior raw versions) and revalidate."""
    baseline = db.get(ReconciliationBatch, fl_run.baseline_batch_id)
    if not baseline:
        raise ValueError("Baseline batch not found.")

    ds = generate_northbridge_dataset(
        reporting_date=baseline.reporting_date,
        seed=fl_run.seed,
        num_advisors=12,
        num_clients=60,
        num_accounts=120,
        target_transactions=1200,
    )
    corrected_batch = run_batch_pipeline(
        db,
        workspace_id=fl_run.workspace_id,
        reporting_date=baseline.reporting_date,
        source_payloads=dataset_to_payloads(ds, store_raw_rows=False),
        triggered_by=actor_id,
        actor_role=actor_role,
        is_sandbox=True,
        scenario_key=f"{fl_run.scenario_key}_corrected",
        parent_batch_id=fl_run.corrupted_batch_id,
        notes=f"Corrected input rerun for Failure Lab scenario {fl_run.scenario_key}",
    )

    fl_run.corrected_batch_id = corrected_batch.id
    fl_run.status = "CORRECTED_PASSED" if corrected_batch.status in ("PASS", "PASS_WITH_WARNINGS") else "INJECTED"

    record_audit_event(
        db,
        workspace_id=fl_run.workspace_id,
        actor_id=actor_id,
        actor_role=actor_role,
        action="FAILURE_LAB_CORRECTION_RERUN",
        entity_type="FAILURE_LAB_RUN",
        entity_id=fl_run.id,
        prior_state={"corrupted_batch_id": fl_run.corrupted_batch_id},
        new_state={
            "corrected_batch_id": corrected_batch.id,
            "status": corrected_batch.status,
            "financial_variance_usd": str(corrected_batch.financial_variance_usd),
        },
        reason=f"Corrected source input and revalidated Failure Lab run {fl_run.id}.",
        batch_id=corrected_batch.id,
    )
    db.commit()
    return fl_run
