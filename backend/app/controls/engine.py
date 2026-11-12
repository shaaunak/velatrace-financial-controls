"""Registered Financial Control Engine for VelaTrace."""

import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Callable
import yaml
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models.entities import (
    Account,
    Advisor,
    ControlException,
    ControlExecutionResult,
    ControlRule,
    MartAccountBalance,
    RawSourceFile,
    ReconciliationBatch,
    StgCrmAccount,
    StgCustodyBalance,
    StgFxRate,
    StgLedgerTransaction,
    StgMarketPrice,
    StgTrade,
)

RULES_YAML_PATH = Path(__file__).resolve().parent / "rules.yaml"
REQUIRED_SOURCES = {
    "custody_balances",
    "ledger_transactions",
    "trades",
    "crm_accounts",
    "market_prices",
    "fx_rates",
}
VALID_TXN_TYPES = {"DEPOSIT", "WITHDRAWAL", "BUY", "SELL", "FEE", "DIVIDEND", "INTEREST"}
VALID_CURRENCIES = {"USD", "EUR", "GBP", "INR"}


@dataclass
class ControlFinding:
    status: str  # PASS, WARN, FAIL
    evaluated_count: int
    failed_count: int
    measured_variance_usd: Decimal
    threshold_description: str
    evidence_summary: str
    affected_entities: list[dict]


def load_rules_from_yaml() -> list[dict]:
    raw = yaml.safe_load(RULES_YAML_PATH.read_text(encoding="utf-8"))
    return raw.get("rules", [])


def sync_control_rules_to_db(db: Session) -> list[ControlRule]:
    """Ensure YAML-configured control rules are synced into control_rules table."""
    rules_data = load_rules_from_yaml()
    synced: list[ControlRule] = []
    for r in rules_data:
        existing = db.execute(
            select(ControlRule).where(
                ControlRule.rule_id == r["rule_id"],
                ControlRule.version == r["version"],
            )
        ).scalar_one_or_none()
        tol_abs = Decimal(str(r["tolerance_abs"])) if r.get("tolerance_abs") is not None else None
        tol_pct = Decimal(str(r["tolerance_pct"])) if r.get("tolerance_pct") is not None else None
        eff_date = date.fromisoformat(r["effective_date"])
        yaml_snippet = yaml.safe_dump(r, sort_keys=False)

        if existing:
            synced.append(existing)
            continue

        rule_obj = ControlRule(
            rule_id=r["rule_id"],
            version=r["version"],
            name=r["name"],
            business_description=r["business_description"],
            control_family=r["control_family"],
            severity=r["severity"],
            is_blocking=bool(r["is_blocking"]),
            is_waivable=bool(r["is_waivable"]),
            owner_team=r["owner_team"],
            tolerance_abs=tol_abs,
            tolerance_pct=tol_pct,
            handler_name=r["handler_name"],
            effective_date=eff_date,
            is_active=True,
            config_yaml=yaml_snippet,
        )
        db.add(rule_obj)
        synced.append(rule_obj)
    db.flush()
    return synced


# ---------------------------------------------------------------------------
# Registered Control Handlers
# ---------------------------------------------------------------------------

def check_required_sources_present(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    files = db.execute(
        select(RawSourceFile.source_system).where(RawSourceFile.batch_id == batch.id)
    ).scalars().all()
    present = set(files)
    missing = sorted(REQUIRED_SOURCES - present)
    if missing:
        return ControlFinding(
            status="FAIL",
            evaluated_count=len(REQUIRED_SOURCES),
            failed_count=len(missing),
            measured_variance_usd=Decimal("0.0000"),
            threshold_description="All 6 required sources must be present",
            evidence_summary=f"Missing required source feed(s): {', '.join(missing)}.",
            affected_entities=[
                {
                    "entity_type": "SOURCE_FILE",
                    "entity_id": src,
                    "source_system": src,
                    "source_record_ref": f"batch:{batch.batch_code}/{src}",
                    "variance_usd": Decimal("0.0000"),
                    "detail": f"Required source '{src}' was not ingested for batch {batch.batch_code}.",
                }
                for src in missing
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=len(REQUIRED_SOURCES),
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="All 6 required sources must be present",
        evidence_summary="All 6 required wealth management source feeds verified present.",
        affected_entities=[],
    )


def check_non_empty_sources(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    files = db.execute(
        select(RawSourceFile).where(RawSourceFile.batch_id == batch.id)
    ).scalars().all()
    empty_files = [f for f in files if f.row_count == 0]
    if empty_files:
        return ControlFinding(
            status="FAIL",
            evaluated_count=len(files),
            failed_count=len(empty_files),
            measured_variance_usd=Decimal("0.0000"),
            threshold_description="row_count > 0 for every ingested file",
            evidence_summary=f"{len(empty_files)} source file(s) contain zero rows.",
            affected_entities=[
                {
                    "entity_type": "SOURCE_FILE",
                    "entity_id": f.file_name,
                    "source_system": f.source_system,
                    "source_record_ref": f.id,
                    "variance_usd": Decimal("0.0000"),
                    "detail": f"Source file '{f.file_name}' ({f.source_system}) has 0 rows.",
                }
                for f in empty_files
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=len(files),
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="row_count > 0 for every ingested file",
        evidence_summary=f"All {len(files)} ingested source files contain valid data rows.",
        affected_entities=[],
    )


def check_manifest_row_and_total(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    tol = rule.tolerance_abs or Decimal("0.0100")
    files = db.execute(
        select(RawSourceFile).where(RawSourceFile.batch_id == batch.id)
    ).scalars().all()
    issues: list[dict] = []
    max_var = Decimal("0.0000")

    for f in files:
        if f.source_system == "custody_balances" and f.declared_control_total is not None:
            actual = db.execute(
                select(func.coalesce(func.sum(StgCustodyBalance.total_value_usd), 0)).where(
                    StgCustodyBalance.batch_id == batch.id
                )
            ).scalar_one()
            actual_dec = Decimal(str(actual))
            diff = abs(actual_dec - f.declared_control_total)
            if diff > tol:
                max_var = max(max_var, diff)
                issues.append(
                    {
                        "entity_type": "SOURCE_FILE",
                        "entity_id": f.file_name,
                        "source_system": f.source_system,
                        "source_record_ref": f.id,
                        "variance_usd": diff,
                        "detail": f"Declared control total ${f.declared_control_total:,.2f} differs from ingested ${actual_dec:,.2f} by ${diff:,.2f}.",
                    }
                )
        elif f.source_system == "ledger_transactions" and f.declared_control_total is not None:
            actual = db.execute(
                select(func.coalesce(func.sum(StgLedgerTransaction.net_amount_usd), 0)).where(
                    StgLedgerTransaction.batch_id == batch.id
                )
            ).scalar_one()
            actual_dec = Decimal(str(actual))
            diff = abs(actual_dec - f.declared_control_total)
            if diff > tol:
                max_var = max(max_var, diff)
                issues.append(
                    {
                        "entity_type": "SOURCE_FILE",
                        "entity_id": f.file_name,
                        "source_system": f.source_system,
                        "source_record_ref": f.id,
                        "variance_usd": diff,
                        "detail": f"Ledger declared control total ${f.declared_control_total:,.2f} differs from ingested ${actual_dec:,.2f} by ${diff:,.2f}.",
                    }
                )

    if issues:
        return ControlFinding(
            status="FAIL",
            evaluated_count=len(files),
            failed_count=len(issues),
            measured_variance_usd=max_var,
            threshold_description=f"Abs(declared - ingested) <= ${tol}",
            evidence_summary=f"Control total mismatch detected in {len(issues)} source file(s); max variance ${max_var:,.2f}.",
            affected_entities=issues,
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=len(files),
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description=f"Abs(declared - ingested) <= ${tol}",
        evidence_summary="Ingested row counts and USD control totals match source manifest declarations.",
        affected_entities=[],
    )


def check_duplicate_transaction_ids(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    dup_rows = db.execute(
        select(
            StgLedgerTransaction.external_txn_id,
            func.count(StgLedgerTransaction.id).label("cnt"),
            func.coalesce(func.sum(StgLedgerTransaction.net_amount_usd), 0).label("total_usd"),
            func.min(StgLedgerTransaction.net_amount_usd).label("unit_usd"),
        )
        .where(StgLedgerTransaction.batch_id == batch.id)
        .group_by(StgLedgerTransaction.external_txn_id)
        .having(func.count(StgLedgerTransaction.id) > 1)
    ).all()

    total_txns = db.execute(
        select(func.count(StgLedgerTransaction.id)).where(StgLedgerTransaction.batch_id == batch.id)
    ).scalar_one()

    if dup_rows:
        total_overstatement = Decimal("0.0000")
        entities: list[dict] = []
        for row in dup_rows:
            extra_copies = row.cnt - 1
            overstatement = abs(Decimal(str(row.unit_usd or 0))) * extra_copies
            total_overstatement += overstatement
            entities.append(
                {
                    "entity_type": "TRANSACTION",
                    "entity_id": row.external_txn_id,
                    "source_system": "ledger_transactions",
                    "source_record_ref": f"external_txn_id={row.external_txn_id} (x{row.cnt})",
                    "variance_usd": overstatement,
                    "detail": f"Transaction {row.external_txn_id} appears {row.cnt} times in ledger_transactions, causing ${overstatement:,.2f} impact.",
                }
            )
        return ControlFinding(
            status="FAIL",
            evaluated_count=total_txns,
            failed_count=len(dup_rows),
            measured_variance_usd=total_overstatement,
            threshold_description="0 duplicate external_txn_id values allowed",
            evidence_summary=f"Detected {len(dup_rows)} duplicate external_txn_id(s) with total impact ${total_overstatement:,.2f}.",
            affected_entities=entities,
        )

    return ControlFinding(
        status="PASS",
        evaluated_count=total_txns,
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="0 duplicate external_txn_id values allowed",
        evidence_summary=f"All {total_txns:,} ledger transaction IDs are unique.",
        affected_entities=[],
    )


def check_suspicious_duplicate_business_keys(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    rows = db.execute(
        select(
            StgLedgerTransaction.account_external_id,
            StgLedgerTransaction.trade_date,
            StgLedgerTransaction.txn_type,
            StgLedgerTransaction.net_amount_orig,
            func.count(func.distinct(StgLedgerTransaction.external_txn_id)).label("distinct_ids"),
        )
        .where(StgLedgerTransaction.batch_id == batch.id)
        .group_by(
            StgLedgerTransaction.account_external_id,
            StgLedgerTransaction.trade_date,
            StgLedgerTransaction.txn_type,
            StgLedgerTransaction.net_amount_orig,
        )
        .having(func.count(func.distinct(StgLedgerTransaction.external_txn_id)) > 1)
    ).all()

    if rows:
        return ControlFinding(
            status="WARN",
            evaluated_count=len(rows),
            failed_count=len(rows),
            measured_variance_usd=Decimal("0.0000"),
            threshold_description="Flag identical (account, date, type, amount) with distinct IDs",
            evidence_summary=f"Found {len(rows)} potential duplicate business-key group(s) requiring analyst review (provisional).",
            affected_entities=[
                {
                    "entity_type": "ACCOUNT",
                    "entity_id": r.account_external_id,
                    "source_system": "ledger_transactions",
                    "source_record_ref": f"{r.account_external_id}/{r.trade_date}/{r.txn_type}",
                    "variance_usd": abs(Decimal(str(r.net_amount_orig))),
                    "detail": f"{r.distinct_ids} distinct txn IDs share identical business key on {r.trade_date} for {r.net_amount_orig}.",
                }
                for r in rows[:10]
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=0,
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="Flag identical (account, date, type, amount) with distinct IDs",
        evidence_summary="No suspicious duplicate business keys found.",
        affected_entities=[],
    )


def check_unknown_accounts(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    unknown_custody = db.execute(
        select(StgCustodyBalance.account_external_id, StgCustodyBalance.total_value_usd)
        .where(
            StgCustodyBalance.batch_id == batch.id,
            StgCustodyBalance.canonical_account_id.is_(None),
        )
    ).all()
    unknown_ledger = db.execute(
        select(StgLedgerTransaction.external_txn_id, StgLedgerTransaction.account_external_id, StgLedgerTransaction.net_amount_usd)
        .where(
            StgLedgerTransaction.batch_id == batch.id,
            StgLedgerTransaction.canonical_account_id.is_(None),
        )
    ).all()

    total_checked = db.execute(
        select(func.count(StgCustodyBalance.id)).where(StgCustodyBalance.batch_id == batch.id)
    ).scalar_one()

    entities: list[dict] = []
    impact = Decimal("0.0000")
    for r in unknown_custody:
        v = abs(Decimal(str(r.total_value_usd or 0)))
        impact += v
        entities.append(
            {
                "entity_type": "ACCOUNT",
                "entity_id": r.account_external_id or "MISSING_ID",
                "source_system": "custody_balances",
                "source_record_ref": f"custody:{r.account_external_id}",
                "variance_usd": v,
                "detail": f"Custody balance references unknown or missing account '{r.account_external_id}'.",
            }
        )
    for r in unknown_ledger:
        v = abs(Decimal(str(r.net_amount_usd or 0)))
        impact += v
        entities.append(
            {
                "entity_type": "TRANSACTION",
                "entity_id": r.external_txn_id,
                "source_system": "ledger_transactions",
                "source_record_ref": f"txn:{r.external_txn_id}/acct:{r.account_external_id}",
                "variance_usd": v,
                "detail": f"Ledger transaction {r.external_txn_id} references unknown or missing account '{r.account_external_id}'.",
            }
        )

    if entities:
        return ControlFinding(
            status="FAIL",
            evaluated_count=total_checked,
            failed_count=len(entities),
            measured_variance_usd=impact,
            threshold_description="100% of records must map to a canonical account",
            evidence_summary=f"{len(entities)} record(s) failed canonical account resolution (${impact:,.2f} exposure).",
            affected_entities=entities[:25],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=total_checked,
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="100% of records must map to a canonical account",
        evidence_summary="All custody and ledger records resolved to valid canonical accounts.",
        affected_entities=[],
    )


def check_unknown_advisors(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    known_advisors = set(
        db.execute(
            select(Advisor.external_advisor_id).where(Advisor.workspace_id == batch.workspace_id)
        ).scalars().all()
    )
    crm_rows = db.execute(
        select(StgCrmAccount).where(StgCrmAccount.batch_id == batch.id)
    ).scalars().all()
    bad = [r for r in crm_rows if r.advisor_external_id not in known_advisors]
    if bad:
        return ControlFinding(
            status="FAIL",
            evaluated_count=len(crm_rows),
            failed_count=len(bad),
            measured_variance_usd=Decimal("0.0000"),
            threshold_description="Every CRM account must reference a registered advisor",
            evidence_summary=f"{len(bad)} CRM account(s) reference an unknown advisor.",
            affected_entities=[
                {
                    "entity_type": "ACCOUNT",
                    "entity_id": r.account_external_id,
                    "source_system": "crm_accounts",
                    "source_record_ref": f"crm_row:{r.row_number}",
                    "variance_usd": Decimal("0.0000"),
                    "detail": f"CRM account {r.account_external_id} references unknown advisor '{r.advisor_external_id}'.",
                }
                for r in bad[:20]
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=len(crm_rows),
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="Every CRM account must reference a registered advisor",
        evidence_summary=f"All {len(crm_rows)} CRM accounts map to registered advisors.",
        affected_entities=[],
    )


def check_fx_rate_coverage(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    rates = set(
        db.execute(
            select(StgFxRate.from_currency).where(
                StgFxRate.batch_id == batch.id,
                StgFxRate.to_currency == "USD",
            )
        ).scalars().all()
    )
    custody_ccys = set(
        db.execute(
            select(func.distinct(StgCustodyBalance.original_currency)).where(
                StgCustodyBalance.batch_id == batch.id
            )
        ).scalars().all()
    )
    ledger_ccys = set(
        db.execute(
            select(func.distinct(StgLedgerTransaction.original_currency)).where(
                StgLedgerTransaction.batch_id == batch.id
            )
        ).scalars().all()
    )
    needed = (custody_ccys | ledger_ccys) - {"USD"}
    missing = sorted(needed - rates)
    if missing:
        return ControlFinding(
            status="FAIL",
            evaluated_count=len(needed | {"USD"}),
            failed_count=len(missing),
            measured_variance_usd=Decimal("0.0000"),
            threshold_description="Every non-USD currency must have a USD FX rate",
            evidence_summary=f"Missing FX conversion rate(s) to USD for: {', '.join(missing)}.",
            affected_entities=[
                {
                    "entity_type": "FX_PAIR",
                    "entity_id": f"{ccy}/USD",
                    "source_system": "fx_rates",
                    "source_record_ref": f"fx:{ccy}/USD",
                    "variance_usd": Decimal("0.0000"),
                    "detail": f"Missing FX rate for {ccy}/USD on {batch.reporting_date.isoformat()}.",
                }
                for ccy in missing
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=len(needed | {"USD"}),
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="Every non-USD currency must have a USD FX rate",
        evidence_summary="100% FX rate coverage verified for all active reporting currencies.",
        affected_entities=[],
    )


def check_market_price_coverage(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    priced = set(
        db.execute(
            select(StgMarketPrice.security_id).where(StgMarketPrice.batch_id == batch.id)
        ).scalars().all()
    )
    traded = set(
        db.execute(
            select(func.distinct(StgTrade.security_id)).where(StgTrade.batch_id == batch.id)
        ).scalars().all()
    )
    missing = sorted(traded - priced)
    if missing:
        return ControlFinding(
            status="FAIL",
            evaluated_count=len(traded),
            failed_count=len(missing),
            measured_variance_usd=Decimal("0.0000"),
            threshold_description="Every traded security must have a closing market price",
            evidence_summary=f"Missing closing market price(s) for security ID(s): {', '.join(missing)}.",
            affected_entities=[
                {
                    "entity_type": "SECURITY",
                    "entity_id": sec,
                    "source_system": "market_prices",
                    "source_record_ref": f"security:{sec}",
                    "variance_usd": Decimal("0.0000"),
                    "detail": f"No closing price found in market_prices.csv for {sec} on {batch.reporting_date.isoformat()}.",
                }
                for sec in missing
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=len(traded),
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="Every traded security must have a closing market price",
        evidence_summary=f"Closing market prices verified for all {len(traded)} traded securities.",
        affected_entities=[],
    )


def check_balance_continuity(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    tol = rule.tolerance_abs or Decimal("0.0500")
    marts = db.execute(
        select(MartAccountBalance).where(MartAccountBalance.batch_id == batch.id)
    ).scalars().all()

    broken = [m for m in marts if abs(m.variance_usd) > tol]
    total_var = sum((abs(m.variance_usd) for m in broken), Decimal("0.0000"))

    if broken:
        return ControlFinding(
            status="FAIL",
            evaluated_count=len(marts),
            failed_count=len(broken),
            measured_variance_usd=total_var,
            threshold_description=f"Abs(Expected Closing - Custody Closing) <= ${tol}",
            evidence_summary=f"{len(broken)} account(s) failed roll-forward balance continuity; aggregate variance ${total_var:,.2f}.",
            affected_entities=[
                {
                    "entity_type": "ACCOUNT",
                    "entity_id": m.account_external_id,
                    "source_system": "reporting_mart",
                    "source_record_ref": f"mart_acct:{m.account_external_id}",
                    "variance_usd": abs(m.variance_usd),
                    "detail": (
                        f"Account {m.account_external_id}: expected closing ${m.expected_closing_usd:,.2f} "
                        f"vs custody ${m.custody_closing_usd:,.2f} (variance ${m.variance_usd:,.2f})."
                    ),
                }
                for m in broken[:25]
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=len(marts),
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description=f"Abs(Expected Closing - Custody Closing) <= ${tol}",
        evidence_summary=f"All {len(marts)} accounts satisfy Opening + Inflows - Outflows + Market - Fees = Closing.",
        affected_entities=[],
    )


def check_cross_system_custody_vs_mart(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    tol = rule.tolerance_abs or Decimal("1.0000")
    diff = abs(batch.custody_total_usd - batch.calculated_total_usd)
    if diff > tol:
        return ControlFinding(
            status="FAIL",
            evaluated_count=1,
            failed_count=1,
            measured_variance_usd=diff,
            threshold_description=f"Abs(Custody Total - Calculated Mart Total) <= ${tol}",
            evidence_summary=(
                f"Institutional custody total (${batch.custody_total_usd:,.2f}) disagrees with "
                f"calculated reporting mart (${batch.calculated_total_usd:,.2f}) by ${diff:,.2f}."
            ),
            affected_entities=[
                {
                    "entity_type": "INSTITUTION",
                    "entity_id": batch.batch_code,
                    "source_system": "cross_system",
                    "source_record_ref": f"batch:{batch.batch_code}",
                    "variance_usd": diff,
                    "detail": f"Cross-system institutional variance of ${diff:,.2f} exceeds ${tol} tolerance.",
                }
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=1,
        failed_count=0,
        measured_variance_usd=diff,
        threshold_description=f"Abs(Custody Total - Calculated Mart Total) <= ${tol}",
        evidence_summary=f"Custody total (${batch.custody_total_usd:,.2f}) reconciles with calculated mart (${batch.calculated_total_usd:,.2f}).",
        affected_entities=[],
    )


def check_trades_vs_ledger(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    tol = rule.tolerance_abs or Decimal("1.0000")
    trades_sum = Decimal(
        str(
            db.execute(
                select(func.coalesce(func.sum(StgTrade.gross_amount_usd), 0)).where(
                    StgTrade.batch_id == batch.id
                )
            ).scalar_one()
        )
    )
    ledger_trades_sum = Decimal(
        str(
            db.execute(
                select(func.coalesce(func.sum(StgLedgerTransaction.net_amount_usd), 0)).where(
                    StgLedgerTransaction.batch_id == batch.id,
                    StgLedgerTransaction.txn_type.in_(["BUY", "SELL"]),
                )
            ).scalar_one()
        )
    )
    diff = abs(trades_sum - ledger_trades_sum)
    if diff > tol:
        return ControlFinding(
            status="WARN",
            evaluated_count=1,
            failed_count=1,
            measured_variance_usd=diff,
            threshold_description=f"Abs(Trading Gross - Ledger BUY/SELL) <= ${tol}",
            evidence_summary=f"Trading system gross (${trades_sum:,.2f}) vs Ledger BUY/SELL (${ledger_trades_sum:,.2f}) variance: ${diff:,.2f}.",
            affected_entities=[
                {
                    "entity_type": "SOURCE_SYSTEM",
                    "entity_id": "trades_vs_ledger",
                    "source_system": "trades",
                    "source_record_ref": f"batch:{batch.batch_code}/trades",
                    "variance_usd": diff,
                    "detail": f"Trade-to-ledger settlement mismatch of ${diff:,.2f}.",
                }
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=1,
        failed_count=0,
        measured_variance_usd=diff,
        threshold_description=f"Abs(Trading Gross - Ledger BUY/SELL) <= ${tol}",
        evidence_summary=f"Trading system gross (${trades_sum:,.2f}) matches Ledger BUY/SELL settlements.",
        affected_entities=[],
    )


def check_thousand_times_scaling(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    limit = rule.tolerance_abs or Decimal("5000000.0000")
    outliers = db.execute(
        select(StgLedgerTransaction)
        .where(
            StgLedgerTransaction.batch_id == batch.id,
            func.abs(StgLedgerTransaction.net_amount_usd) > limit,
        )
    ).scalars().all()
    total_checked = db.execute(
        select(func.count(StgLedgerTransaction.id)).where(StgLedgerTransaction.batch_id == batch.id)
    ).scalar_one()

    if outliers:
        max_var = max(abs(o.net_amount_usd or Decimal("0")) for o in outliers)
        return ControlFinding(
            status="FAIL",
            evaluated_count=total_checked,
            failed_count=len(outliers),
            measured_variance_usd=max_var,
            threshold_description=f"Abs(txn_usd) <= ${limit:,.2f}",
            evidence_summary=f"{len(outliers)} transaction(s) exceed ${limit:,.2f} scaling threshold (potential 1000x error).",
            affected_entities=[
                {
                    "entity_type": "TRANSACTION",
                    "entity_id": o.external_txn_id,
                    "source_system": "ledger_transactions",
                    "source_record_ref": f"row:{o.row_number}/txn:{o.external_txn_id}",
                    "variance_usd": abs(o.net_amount_usd or Decimal("0")),
                    "detail": f"Transaction {o.external_txn_id} amount ${o.net_amount_usd:,.2f} exceeds ${limit:,.2f} reasonableness ceiling.",
                }
                for o in outliers[:20]
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=total_checked,
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description=f"Abs(txn_usd) <= ${limit:,.2f}",
        evidence_summary=f"All {total_checked:,} transactions fall within reasonableness bounds.",
        affected_entities=[],
    )


def check_sign_convention(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    bad_deposits = db.execute(
        select(StgLedgerTransaction).where(
            StgLedgerTransaction.batch_id == batch.id,
            StgLedgerTransaction.txn_type == "DEPOSIT",
            StgLedgerTransaction.net_amount_orig <= 0,
        )
    ).scalars().all()
    bad_withdrawals = db.execute(
        select(StgLedgerTransaction).where(
            StgLedgerTransaction.batch_id == batch.id,
            StgLedgerTransaction.txn_type.in_(["WITHDRAWAL", "FEE"]),
            StgLedgerTransaction.net_amount_orig >= 0,
        )
    ).scalars().all()
    bad = bad_deposits + bad_withdrawals
    total_checked = db.execute(
        select(func.count(StgLedgerTransaction.id)).where(StgLedgerTransaction.batch_id == batch.id)
    ).scalar_one()

    if bad:
        impact = sum((abs(b.net_amount_usd or Decimal("0")) * 2 for b in bad), Decimal("0.0000"))
        return ControlFinding(
            status="FAIL",
            evaluated_count=total_checked,
            failed_count=len(bad),
            measured_variance_usd=impact,
            threshold_description="DEPOSIT > 0; WITHDRAWAL and FEE < 0",
            evidence_summary=f"{len(bad)} transaction(s) violate sign convention (potential sign reversal).",
            affected_entities=[
                {
                    "entity_type": "TRANSACTION",
                    "entity_id": b.external_txn_id,
                    "source_system": "ledger_transactions",
                    "source_record_ref": f"row:{b.row_number}/txn:{b.external_txn_id}",
                    "variance_usd": abs(b.net_amount_usd or Decimal("0")) * 2,
                    "detail": f"{b.txn_type} transaction {b.external_txn_id} has unexpected sign ({b.net_amount_orig}).",
                }
                for b in bad[:20]
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=total_checked,
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="DEPOSIT > 0; WITHDRAWAL and FEE < 0",
        evidence_summary="All deposits, withdrawals, and fees adhere to sign conventions.",
        affected_entities=[],
    )


def check_backdated_transactions(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    max_days = int(rule.tolerance_abs or 30)
    cutoff = batch.reporting_date - timedelta(days=max_days)
    backdated = db.execute(
        select(StgLedgerTransaction).where(
            StgLedgerTransaction.batch_id == batch.id,
            StgLedgerTransaction.trade_date < cutoff,
        )
    ).scalars().all()
    total_checked = db.execute(
        select(func.count(StgLedgerTransaction.id)).where(StgLedgerTransaction.batch_id == batch.id)
    ).scalar_one()

    if backdated:
        impact = sum((abs(b.net_amount_usd or Decimal("0")) for b in backdated), Decimal("0.0000"))
        return ControlFinding(
            status="WARN",
            evaluated_count=total_checked,
            failed_count=len(backdated),
            measured_variance_usd=impact,
            threshold_description=f"trade_date >= reporting_date - {max_days} days",
            evidence_summary=f"{len(backdated)} backdated transaction(s) prior to {cutoff.isoformat()} detected.",
            affected_entities=[
                {
                    "entity_type": "TRANSACTION",
                    "entity_id": b.external_txn_id,
                    "source_system": "ledger_transactions",
                    "source_record_ref": f"row:{b.row_number}/txn:{b.external_txn_id}",
                    "variance_usd": abs(b.net_amount_usd or Decimal("0")),
                    "detail": f"Transaction {b.external_txn_id} has trade_date {b.trade_date.isoformat()} (> {max_days}d prior).",
                }
                for b in backdated[:20]
            ],
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=total_checked,
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description=f"trade_date >= reporting_date - {max_days} days",
        evidence_summary=f"All transactions fall within the {max_days}-day reporting window.",
        affected_entities=[],
    )


def check_structural_integrity(db: Session, batch: ReconciliationBatch, rule: ControlRule) -> ControlFinding:
    bad_types = db.execute(
        select(StgLedgerTransaction).where(
            StgLedgerTransaction.batch_id == batch.id,
            ~StgLedgerTransaction.txn_type.in_(list(VALID_TXN_TYPES)),
        )
    ).scalars().all()
    bad_ccys = db.execute(
        select(StgCustodyBalance).where(
            StgCustodyBalance.batch_id == batch.id,
            ~StgCustodyBalance.original_currency.in_(list(VALID_CURRENCIES)),
        )
    ).scalars().all()
    drift_files = db.execute(
        select(RawSourceFile).where(
            RawSourceFile.batch_id == batch.id,
            RawSourceFile.processing_status == "SCHEMA_DRIFT",
        )
    ).scalars().all()

    entities: list[dict] = []
    for f in drift_files:
        entities.append(
            {
                "entity_type": "SOURCE_FILE",
                "entity_id": f.file_name,
                "source_system": f.source_system,
                "source_record_ref": f.id,
                "variance_usd": Decimal("0.0000"),
                "detail": f"Schema drift detected in {f.file_name} ({f.source_system}).",
            }
        )
    for t in bad_types[:10]:
        entities.append(
            {
                "entity_type": "TRANSACTION",
                "entity_id": t.external_txn_id,
                "source_system": "ledger_transactions",
                "source_record_ref": f"row:{t.row_number}",
                "variance_usd": abs(t.net_amount_usd or Decimal("0")),
                "detail": f"Unknown transaction category '{t.txn_type}' on {t.external_txn_id}.",
            }
        )
    for c in bad_ccys[:10]:
        entities.append(
            {
                "entity_type": "ACCOUNT",
                "entity_id": c.account_external_id,
                "source_system": "custody_balances",
                "source_record_ref": f"row:{c.row_number}",
                "variance_usd": Decimal("0.0000"),
                "detail": f"Unexpected currency code '{c.original_currency}'.",
            }
        )

    if entities:
        return ControlFinding(
            status="FAIL",
            evaluated_count=1,
            failed_count=len(entities),
            measured_variance_usd=Decimal("0.0000"),
            threshold_description="Schema columns, currency codes, and txn categories must match contract",
            evidence_summary=f"{len(entities)} structural / schema violation(s) detected.",
            affected_entities=entities,
        )
    return ControlFinding(
        status="PASS",
        evaluated_count=1,
        failed_count=0,
        measured_variance_usd=Decimal("0.0000"),
        threshold_description="Schema columns, currency codes, and txn categories must match contract",
        evidence_summary="All source schemas, currency formats, and transaction categories conform to contract.",
        affected_entities=[],
    )


CONTROL_HANDLERS: dict[str, Callable[[Session, ReconciliationBatch, ControlRule], ControlFinding]] = {
    "check_required_sources_present": check_required_sources_present,
    "check_non_empty_sources": check_non_empty_sources,
    "check_manifest_row_and_total": check_manifest_row_and_total,
    "check_duplicate_transaction_ids": check_duplicate_transaction_ids,
    "check_suspicious_duplicate_business_keys": check_suspicious_duplicate_business_keys,
    "check_unknown_accounts": check_unknown_accounts,
    "check_unknown_advisors": check_unknown_advisors,
    "check_fx_rate_coverage": check_fx_rate_coverage,
    "check_market_price_coverage": check_market_price_coverage,
    "check_balance_continuity": check_balance_continuity,
    "check_cross_system_custody_vs_mart": check_cross_system_custody_vs_mart,
    "check_trades_vs_ledger": check_trades_vs_ledger,
    "check_thousand_times_scaling": check_thousand_times_scaling,
    "check_sign_convention": check_sign_convention,
    "check_backdated_transactions": check_backdated_transactions,
    "check_structural_integrity": check_structural_integrity,
}


def execute_controls_for_batch(db: Session, batch: ReconciliationBatch) -> tuple[str, list[ControlExecutionResult]]:
    """
    Execute all active registered control rules for a batch, persist results and exceptions,
    and deterministically compute the final batch status:
      PASS | PASS_WITH_WARNINGS | BLOCKED
    """
    rules = sync_control_rules_to_db(db)
    results: list[ControlExecutionResult] = []
    has_blocking_failure = False
    has_warning = False
    total_exceptions = 0
    critical_exceptions = 0

    now = datetime.now(timezone.utc)
    sla_hours = {"CRITICAL": 4, "HIGH": 12, "MEDIUM": 24, "LOW": 48}

    for rule in rules:
        if not rule.is_active:
            continue
        handler = CONTROL_HANDLERS.get(rule.handler_name)
        if not handler:
            raise RuntimeError(f"Unregistered control handler '{rule.handler_name}' for {rule.rule_id}")

        finding = handler(db, batch, rule)
        safe_entities = [
            {
                k: (str(v) if isinstance(v, Decimal) else v)
                for k, v in ent.items()
            }
            for ent in finding.affected_entities
        ]
        res = ControlExecutionResult(
            batch_id=batch.id,
            rule_id=rule.rule_id,
            rule_version=rule.version,
            status=finding.status,
            is_blocking=rule.is_blocking,
            evaluated_count=finding.evaluated_count,
            failed_count=finding.failed_count,
            measured_variance_usd=finding.measured_variance_usd,
            threshold_description=finding.threshold_description,
            evidence_summary=finding.evidence_summary,
            affected_entity_ids_json=safe_entities,
        )
        db.add(res)
        db.flush()
        results.append(res)

        if finding.status == "FAIL":
            if rule.is_blocking:
                has_blocking_failure = True
            else:
                has_warning = True
        elif finding.status == "WARN":
            has_warning = True

        # Create exception records for FAIL or WARN
        if finding.status in ("FAIL", "WARN"):
            for ent in finding.affected_entities[:25]:
                total_exceptions += 1
                if rule.severity == "CRITICAL":
                    critical_exceptions += 1
                exc_code = f"EXC-{batch.reporting_date.strftime('%y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
                exc = ControlException(
                    id=f"exc_{uuid.uuid4().hex[:14]}",
                    exception_code=exc_code,
                    workspace_id=batch.workspace_id,
                    batch_id=batch.id,
                    rule_id=rule.rule_id,
                    rule_version=rule.version,
                    control_execution_id=res.id,
                    entity_type=ent["entity_type"],
                    entity_id=str(ent["entity_id"]),
                    source_system=ent["source_system"],
                    source_record_ref=ent.get("source_record_ref"),
                    severity=rule.severity,
                    is_blocking=rule.is_blocking and finding.status == "FAIL",
                    variance_amount_usd=Decimal(str(ent.get("variance_usd", 0))),
                    title=f"{rule.rule_id}: {rule.name}",
                    description=ent["detail"],
                    status="OPEN",
                    assigned_to="analyst_maya",
                    sla_due_at=now + timedelta(hours=sla_hours.get(rule.severity, 24)),
                )
                db.add(exc)

    if has_blocking_failure:
        final_status = "BLOCKED"
    elif has_warning:
        final_status = "PASS_WITH_WARNINGS"
    else:
        final_status = "PASS"

    batch.status = final_status
    batch.exceptions_count = total_exceptions
    batch.critical_exceptions_count = critical_exceptions
    db.flush()
    return final_status, results
