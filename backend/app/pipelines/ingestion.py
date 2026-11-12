"""End-to-end VelaTrace data pipeline: Raw -> Staging -> Reporting Marts -> Control Engine."""

import csv
import hashlib
import io
import json
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit.service import record_audit_event
from app.controls.engine import execute_controls_for_batch
from app.models.entities import (
    Account,
    Advisor,
    Client,
    MartAccountBalance,
    MartAdvisorSummary,
    PipelineStageLog,
    RawRecord,
    RawSourceFile,
    ReconciliationBatch,
    StgCrmAccount,
    StgCustodyBalance,
    StgFxRate,
    StgLedgerTransaction,
    StgMarketPrice,
    StgTrade,
    Workspace,
)

QUANT_4 = Decimal("0.0001")

EXPECTED_COLUMNS: dict[str, set[str]] = {
    "custody_balances": {
        "reporting_date",
        "account_external_id",
        "opening_value",
        "cash_balance",
        "securities_value",
        "total_value",
        "market_movement",
        "currency",
    },
    "ledger_transactions": {
        "external_txn_id",
        "account_external_id",
        "trade_date",
        "settlement_date",
        "value_date",
        "txn_type",
        "flow_classification",
        "gross_amount",
        "fee_amount",
        "net_amount",
        "currency",
    },
    "crm_accounts": {
        "account_external_id",
        "client_external_id",
        "advisor_external_id",
        "account_type",
        "base_currency",
        "status",
    },
    "market_prices": {"price_date", "security_id", "ticker", "currency", "close_price"},
    "fx_rates": {"rate_date", "from_currency", "to_currency", "rate"},
}


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _q4(val: Decimal) -> Decimal:
    return val.quantize(QUANT_4, rounding=ROUND_HALF_UP)


def _safe_dec(val: Any, default: Decimal = Decimal("0.0000")) -> Decimal:
    if val is None or val == "":
        return default
    try:
        return Decimal(str(val).strip())
    except (InvalidOperation, ValueError):
        return default


def ensure_workspace_and_reference_data(
    db: Session,
    *,
    workspace_id: str,
    workspace_name: str,
    is_demo: bool,
    is_sandbox: bool,
    advisors: list[dict[str, Any]],
    clients: list[dict[str, Any]],
    accounts: list[dict[str, Any]],
) -> None:
    ws = db.get(Workspace, workspace_id)
    if not ws:
        ws = Workspace(
            id=workspace_id,
            name=workspace_name,
            is_demo=is_demo,
            is_sandbox=is_sandbox,
            reporting_currency="USD",
        )
        db.add(ws)
        db.flush()

    existing_adv = {
        a.external_advisor_id: a
        for a in db.execute(select(Advisor).where(Advisor.workspace_id == workspace_id)).scalars().all()
    }
    for adv in advisors:
        if adv["external_advisor_id"] not in existing_adv:
            obj = Advisor(
                id=f"{workspace_id}_{adv['external_advisor_id']}",
                workspace_id=workspace_id,
                external_advisor_id=adv["external_advisor_id"],
                full_name=adv["full_name"],
                region=adv["region"],
                team=adv["team"],
            )
            db.add(obj)
            existing_adv[adv["external_advisor_id"]] = obj
    db.flush()

    existing_cli = {
        c.external_client_id: c
        for c in db.execute(select(Client).where(Client.workspace_id == workspace_id)).scalars().all()
    }
    for cli in clients:
        if cli["external_client_id"] not in existing_cli:
            adv_obj = existing_adv[cli["advisor_external_id"]]
            obj = Client(
                id=f"{workspace_id}_{cli['external_client_id']}",
                workspace_id=workspace_id,
                external_client_id=cli["external_client_id"],
                full_name=cli["full_name"],
                segment=cli["segment"],
                advisor_id=adv_obj.id,
                risk_profile=cli["risk_profile"],
            )
            db.add(obj)
            existing_cli[cli["external_client_id"]] = obj
    db.flush()

    existing_acc = {
        a.external_account_id: a
        for a in db.execute(select(Account).where(Account.workspace_id == workspace_id)).scalars().all()
    }
    for acc in accounts:
        if acc["account_external_id"] not in existing_acc:
            cli_obj = existing_cli[acc["client_external_id"]]
            adv_obj = existing_adv[acc["advisor_external_id"]]
            obj = Account(
                id=f"{workspace_id}_{acc['account_external_id']}",
                workspace_id=workspace_id,
                external_account_id=acc["account_external_id"],
                client_id=cli_obj.id,
                advisor_id=adv_obj.id,
                account_type=acc["account_type"],
                base_currency=acc["base_currency"],
                status=acc["status"],
                opened_date=date.fromisoformat(acc["opened_date"]),
            )
            db.add(obj)
            existing_acc[acc["account_external_id"]] = obj
    db.flush()


def ingest_raw_file(
    db: Session,
    *,
    workspace_id: str,
    batch_id: str,
    source_system: str,
    reporting_date: date,
    file_name: str,
    payload_text: str,
    payload_format: str,
    declared_control_total: Decimal | None = None,
    declared_currency: str | None = "USD",
    parser_version: str = "v1.0.0",
    store_raw_rows: bool = True,
) -> tuple[RawSourceFile, bool]:
    """
    Idempotently ingest a raw source file.
    Returns (RawSourceFile, created_new: bool).
    If the exact idempotency key already exists in this workspace, returns existing record without duplicating.
    """
    source_hash = _sha256(payload_text)
    idempotency_key = _sha256(
        f"{workspace_id}:{batch_id}:{source_system}:{reporting_date.isoformat()}:{source_hash}:{parser_version}"
    )

    existing = db.execute(
        select(RawSourceFile).where(
            RawSourceFile.workspace_id == workspace_id,
            RawSourceFile.idempotency_key == idempotency_key,
        )
    ).scalar_one_or_none()
    if existing:
        return existing, False

    rows: list[dict[str, Any]] = []
    schema_drift = False

    if payload_format.lower() == "csv":
        reader = csv.DictReader(io.StringIO(payload_text))
        headers = set(reader.fieldnames or [])
        expected = EXPECTED_COLUMNS.get(source_system, set())
        if expected and not expected.issubset(headers):
            schema_drift = True
        for row in reader:
            rows.append(dict(row))
    elif payload_format.lower() == "json":
        parsed = json.loads(payload_text) if payload_text.strip() else []
        if isinstance(parsed, list):
            rows = parsed
        else:
            schema_drift = True

    raw_file = RawSourceFile(
        id=f"raw_{uuid.uuid4().hex[:16]}",
        workspace_id=workspace_id,
        batch_id=batch_id,
        source_system=source_system,
        reporting_date=reporting_date,
        file_name=file_name,
        source_hash=source_hash,
        row_count=len(rows),
        declared_control_total=declared_control_total,
        declared_currency=declared_currency,
        parser_version=parser_version,
        payload_format=payload_format.lower(),
        raw_payload_text=payload_text,
        processing_status="SCHEMA_DRIFT" if schema_drift else "INGESTED",
        idempotency_key=idempotency_key,
    )
    db.add(raw_file)
    db.flush()

    if store_raw_rows and rows:
        # Batch insert raw records (limit to first 2500 rows for raw_records JSONB if huge, or store all for standard dataset)
        raw_rec_objs = [
            RawRecord(
                raw_file_id=raw_file.id,
                row_number=idx + 1,
                raw_data_json=r,
                record_hash=_sha256(json.dumps(r, sort_keys=True, default=str)),
            )
            for idx, r in enumerate(rows)
        ]
        db.add_all(raw_rec_objs)
        db.flush()

    return raw_file, True


def run_batch_pipeline(
    db: Session,
    *,
    workspace_id: str,
    reporting_date: date,
    source_payloads: dict[str, dict[str, Any]],
    triggered_by: str = "analyst_maya",
    actor_role: str = "ANALYST",
    is_sandbox: bool = False,
    scenario_key: str | None = None,
    parent_batch_id: str | None = None,
    notes: str | None = None,
) -> ReconciliationBatch:
    """
    Execute the complete VelaTrace pipeline on a set of source payloads:
      1. Create ReconciliationBatch
      2. Raw Ingestion (immutable, idempotent)
      3. Staging Normalization & Canonical ID Mapping & FX Conversion
      4. Reporting Marts (Account & Advisor level)
      5. Financial Control Engine & Publication Gate Status
      6. Audit Trail Event
    """
    pipeline_start = datetime.now(timezone.utc)
    batch_id = f"bat_{uuid.uuid4().hex[:14]}"
    suffix = "SBX" if is_sandbox else "PRD"
    batch_code = f"VT-{reporting_date.strftime('%Y%m%d')}-{suffix}-{uuid.uuid4().hex[:4].upper()}"

    batch = ReconciliationBatch(
        id=batch_id,
        workspace_id=workspace_id,
        batch_code=batch_code,
        reporting_date=reporting_date,
        status="RUNNING",
        is_sandbox=is_sandbox,
        scenario_key=scenario_key,
        parent_batch_id=parent_batch_id,
        started_at=pipeline_start,
        triggered_by=triggered_by,
        notes=notes,
    )
    db.add(batch)
    db.flush()

    # ------------------------------------------------------------------
    # Stage 1: Raw Ingestion
    # ------------------------------------------------------------------
    s1_start = datetime.now(timezone.utc)
    raw_files: dict[str, RawSourceFile] = {}
    total_ingested = 0
    for src_sys, info in source_payloads.items():
        rf, _ = ingest_raw_file(
            db,
            workspace_id=workspace_id,
            batch_id=batch.id,
            source_system=src_sys,
            reporting_date=reporting_date,
            file_name=info["file_name"],
            payload_text=info["payload_text"],
            payload_format=info["payload_format"],
            declared_control_total=_safe_dec(info.get("declared_control_total"))
            if info.get("declared_control_total") is not None
            else None,
            declared_currency=info.get("declared_currency", "USD"),
            store_raw_rows=info.get("store_raw_rows", True),
        )
        raw_files[src_sys] = rf
        total_ingested += rf.row_count
    s1_end = datetime.now(timezone.utc)
    db.add(
        PipelineStageLog(
            batch_id=batch.id,
            stage_name="RAW_INGESTION",
            status="COMPLETED",
            started_at=s1_start,
            completed_at=s1_end,
            duration_ms=int((s1_end - s1_start).total_seconds() * 1000),
            records_in=total_ingested,
            records_out=total_ingested,
            details_json={"sources": list(raw_files.keys())},
        )
    )

    # ------------------------------------------------------------------
    # Stage 2: Staging Normalization
    # ------------------------------------------------------------------
    s2_start = datetime.now(timezone.utc)
    canonical_accounts = {
        a.external_account_id: a
        for a in db.execute(select(Account).where(Account.workspace_id == workspace_id)).scalars().all()
    }

    # 2a. FX Rates
    fx_map: dict[str, Decimal] = {"USD": Decimal("1.00000000")}
    if "fx_rates" in raw_files and raw_files["fx_rates"].processing_status != "SCHEMA_DRIFT":
        rf = raw_files["fx_rates"]
        reader = csv.DictReader(io.StringIO(rf.raw_payload_text))
        fx_objs = []
        for row in reader:
            from_c = (row.get("from_currency") or "").strip().upper()
            to_c = (row.get("to_currency") or "USD").strip().upper()
            rate = _safe_dec(row.get("rate"), Decimal("1.0"))
            if from_c and to_c == "USD":
                fx_map[from_c] = rate
            fx_objs.append(
                StgFxRate(
                    workspace_id=workspace_id,
                    batch_id=batch.id,
                    raw_file_id=rf.id,
                    rate_date=date.fromisoformat(row["rate_date"]),
                    from_currency=from_c,
                    to_currency=to_c,
                    rate=rate,
                )
            )
        db.add_all(fx_objs)

    # 2b. Market Prices
    if "market_prices" in raw_files and raw_files["market_prices"].processing_status != "SCHEMA_DRIFT":
        rf = raw_files["market_prices"]
        reader = csv.DictReader(io.StringIO(rf.raw_payload_text))
        px_objs = [
            StgMarketPrice(
                workspace_id=workspace_id,
                batch_id=batch.id,
                raw_file_id=rf.id,
                price_date=date.fromisoformat(row["price_date"]),
                security_id=row["security_id"].strip(),
                ticker=row["ticker"].strip(),
                currency=row["currency"].strip().upper(),
                close_price=_safe_dec(row["close_price"]),
            )
            for row in reader
            if row.get("security_id")
        ]
        db.add_all(px_objs)

    # 2c. CRM Accounts
    if "crm_accounts" in raw_files and raw_files["crm_accounts"].processing_status != "SCHEMA_DRIFT":
        rf = raw_files["crm_accounts"]
        reader = csv.DictReader(io.StringIO(rf.raw_payload_text))
        crm_objs = [
            StgCrmAccount(
                workspace_id=workspace_id,
                batch_id=batch.id,
                raw_file_id=rf.id,
                row_number=idx + 1,
                account_external_id=row["account_external_id"].strip(),
                client_external_id=row["client_external_id"].strip(),
                advisor_external_id=row["advisor_external_id"].strip(),
                account_type=row["account_type"].strip(),
                base_currency=row["base_currency"].strip().upper(),
                status=row["status"].strip().upper(),
            )
            for idx, row in enumerate(reader)
        ]
        db.add_all(crm_objs)

    # 2d. Custody Balances
    custody_objs: list[StgCustodyBalance] = []
    if "custody_balances" in raw_files and raw_files["custody_balances"].processing_status != "SCHEMA_DRIFT":
        rf = raw_files["custody_balances"]
        reader = csv.DictReader(io.StringIO(rf.raw_payload_text))
        for idx, row in enumerate(reader):
            ext_acct = (row.get("account_external_id") or "").strip()
            ccy = (row.get("currency") or "USD").strip().upper()
            fx_rate = fx_map.get(ccy)
            open_orig = _safe_dec(row.get("opening_value"))
            cash_orig = _safe_dec(row.get("cash_balance"))
            sec_orig = _safe_dec(row.get("securities_value"))
            tot_orig = _safe_dec(row.get("total_value"))
            mkt_orig = _safe_dec(row.get("market_movement"))
            canon = canonical_accounts.get(ext_acct)
            custody_objs.append(
                StgCustodyBalance(
                    workspace_id=workspace_id,
                    batch_id=batch.id,
                    raw_file_id=rf.id,
                    row_number=idx + 1,
                    reporting_date=date.fromisoformat(row["reporting_date"]),
                    account_external_id=ext_acct,
                    canonical_account_id=canon.id if canon else None,
                    opening_value_orig=open_orig,
                    cash_balance_orig=cash_orig,
                    securities_value_orig=sec_orig,
                    total_value_orig=tot_orig,
                    market_movement_orig=mkt_orig,
                    original_currency=ccy,
                    reporting_currency="USD",
                    fx_rate_applied=fx_rate,
                    opening_value_usd=_q4(open_orig * fx_rate) if fx_rate is not None else None,
                    total_value_usd=_q4(tot_orig * fx_rate) if fx_rate is not None else None,
                    market_movement_usd=_q4(mkt_orig * fx_rate) if fx_rate is not None else None,
                )
            )
        db.add_all(custody_objs)

    # 2e. Ledger Transactions
    ledger_objs: list[StgLedgerTransaction] = []
    if "ledger_transactions" in raw_files and raw_files["ledger_transactions"].processing_status != "SCHEMA_DRIFT":
        rf = raw_files["ledger_transactions"]
        reader = csv.DictReader(io.StringIO(rf.raw_payload_text))
        for idx, row in enumerate(reader):
            ext_acct = (row.get("account_external_id") or "").strip()
            ccy = (row.get("currency") or "USD").strip().upper()
            fx_rate = fx_map.get(ccy)
            gross_orig = _safe_dec(row.get("gross_amount"))
            fee_orig = _safe_dec(row.get("fee_amount"))
            net_orig = _safe_dec(row.get("net_amount"))
            canon = canonical_accounts.get(ext_acct)
            ledger_objs.append(
                StgLedgerTransaction(
                    workspace_id=workspace_id,
                    batch_id=batch.id,
                    raw_file_id=rf.id,
                    row_number=idx + 1,
                    external_txn_id=(row.get("external_txn_id") or "").strip(),
                    account_external_id=ext_acct,
                    canonical_account_id=canon.id if canon else None,
                    trade_date=date.fromisoformat(row["trade_date"]),
                    settlement_date=date.fromisoformat(row["settlement_date"]),
                    value_date=date.fromisoformat(row["value_date"]),
                    txn_type=(row.get("txn_type") or "").strip().upper(),
                    flow_classification=(row.get("flow_classification") or "").strip().upper(),
                    security_id=(row.get("security_id") or "").strip() or None,
                    quantity=_safe_dec(row.get("quantity")) if row.get("quantity") else None,
                    price=_safe_dec(row.get("price")) if row.get("price") else None,
                    gross_amount_orig=gross_orig,
                    fee_amount_orig=fee_orig,
                    net_amount_orig=net_orig,
                    original_currency=ccy,
                    reporting_currency="USD",
                    fx_rate_applied=fx_rate,
                    net_amount_usd=_q4(net_orig * fx_rate) if fx_rate is not None else None,
                    fee_amount_usd=_q4(fee_orig * fx_rate) if fx_rate is not None else None,
                    description=(row.get("description") or "")[:255],
                )
            )
        db.add_all(ledger_objs)

    # 2f. Trades
    trade_objs: list[StgTrade] = []
    if "trades" in raw_files and raw_files["trades"].processing_status != "SCHEMA_DRIFT":
        rf = raw_files["trades"]
        parsed_trades = json.loads(rf.raw_payload_text) if rf.raw_payload_text.strip() else []
        for idx, row in enumerate(parsed_trades):
            ext_acct = (row.get("account_external_id") or "").strip()
            ccy = (row.get("currency") or "USD").strip().upper()
            fx_rate = fx_map.get(ccy)
            gross_orig = _safe_dec(row.get("gross_amount"))
            canon = canonical_accounts.get(ext_acct)
            trade_objs.append(
                StgTrade(
                    workspace_id=workspace_id,
                    batch_id=batch.id,
                    raw_file_id=rf.id,
                    row_number=idx + 1,
                    external_trade_id=row["external_trade_id"],
                    account_external_id=ext_acct,
                    canonical_account_id=canon.id if canon else None,
                    trade_date=date.fromisoformat(row["trade_date"]),
                    settlement_date=date.fromisoformat(row["settlement_date"]),
                    side=row["side"].strip().upper(),
                    security_id=row["security_id"].strip(),
                    quantity=_safe_dec(row["quantity"]),
                    price=_safe_dec(row["price"]),
                    gross_amount_orig=gross_orig,
                    commission_orig=_safe_dec(row.get("commission")),
                    currency=ccy,
                    gross_amount_usd=_q4(gross_orig * fx_rate) if fx_rate is not None else None,
                )
            )
        db.add_all(trade_objs)

    db.flush()
    s2_end = datetime.now(timezone.utc)
    staged_total = len(custody_objs) + len(ledger_objs) + len(trade_objs)
    db.add(
        PipelineStageLog(
            batch_id=batch.id,
            stage_name="STAGING_NORMALIZATION",
            status="COMPLETED",
            started_at=s2_start,
            completed_at=s2_end,
            duration_ms=int((s2_end - s2_start).total_seconds() * 1000),
            records_in=total_ingested,
            records_out=staged_total,
            details_json={"fx_currencies": list(fx_map.keys())},
        )
    )

    # ------------------------------------------------------------------
    # Stage 3: Reporting Marts (Account & Advisor level)
    # ------------------------------------------------------------------
    s3_start = datetime.now(timezone.utc)
    # Aggregate ledger flows per account_external_id
    acct_flows: dict[str, dict[str, Decimal]] = {}
    for txn in ledger_objs:
        bucket = acct_flows.setdefault(
            txn.account_external_id,
            {"inflows": Decimal("0.0000"), "outflows": Decimal("0.0000"), "fees": Decimal("0.0000")},
        )
        amt = txn.net_amount_usd or Decimal("0.0000")
        if txn.flow_classification == "EXTERNAL_INFLOW":
            bucket["inflows"] += amt
        elif txn.flow_classification == "EXTERNAL_OUTFLOW":
            bucket["outflows"] += abs(amt)
        elif txn.flow_classification == "FEE":
            bucket["fees"] += abs(amt)

    mart_accts: list[MartAccountBalance] = []
    advisor_agg: dict[str, dict[str, Any]] = {}
    advisors_by_id = {
        a.id: a
        for a in db.execute(select(Advisor).where(Advisor.workspace_id == workspace_id)).scalars().all()
    }

    custody_total_usd = Decimal("0.0000")
    calculated_total_usd = Decimal("0.0000")

    for cb in custody_objs:
        flows = acct_flows.get(
            cb.account_external_id,
            {"inflows": Decimal("0.0000"), "outflows": Decimal("0.0000"), "fees": Decimal("0.0000")},
        )
        open_usd = cb.opening_value_usd or Decimal("0.0000")
        inflow = _q4(flows["inflows"])
        outflow = _q4(flows["outflows"])
        net_flow = _q4(inflow - outflow)
        mkt = cb.market_movement_usd or Decimal("0.0000")
        fees = _q4(flows["fees"])
        expected_closing = _q4(open_usd + inflow - outflow + mkt - fees)
        custody_closing = cb.total_value_usd or Decimal("0.0000")
        variance = _q4(expected_closing - custody_closing)

        custody_total_usd += custody_closing
        calculated_total_usd += expected_closing

        canon = canonical_accounts.get(cb.account_external_id)
        adv_id = canon.advisor_id if canon else None
        cli_id = canon.client_id if canon else None

        mart_accts.append(
            MartAccountBalance(
                workspace_id=workspace_id,
                batch_id=batch.id,
                reporting_date=reporting_date,
                account_id=cb.canonical_account_id or cb.account_external_id,
                account_external_id=cb.account_external_id,
                client_id=cli_id,
                advisor_id=adv_id,
                opening_assets_usd=open_usd,
                external_inflows_usd=inflow,
                external_outflows_usd=outflow,
                net_external_flows_usd=net_flow,
                market_movement_usd=mkt,
                fees_usd=fees,
                expected_closing_usd=expected_closing,
                custody_closing_usd=custody_closing,
                variance_usd=variance,
                control_status="FAIL" if abs(variance) > Decimal("0.05") else "PASS",
            )
        )

        if adv_id and adv_id in advisors_by_id:
            adv_obj = advisors_by_id[adv_id]
            ab = advisor_agg.setdefault(
                adv_id,
                {
                    "advisor_name": adv_obj.full_name,
                    "region": adv_obj.region,
                    "account_count": 0,
                    "total_assets": Decimal("0.0000"),
                    "inflows": Decimal("0.0000"),
                    "outflows": Decimal("0.0000"),
                    "mkt": Decimal("0.0000"),
                    "fees": Decimal("0.0000"),
                },
            )
            ab["account_count"] += 1
            ab["total_assets"] += custody_closing
            ab["inflows"] += inflow
            ab["outflows"] += outflow
            ab["mkt"] += mkt
            ab["fees"] += fees

    db.add_all(mart_accts)

    mart_advisors = [
        MartAdvisorSummary(
            workspace_id=workspace_id,
            batch_id=batch.id,
            reporting_date=reporting_date,
            advisor_id=adv_id,
            advisor_name=vals["advisor_name"],
            region=vals["region"],
            account_count=vals["account_count"],
            total_assets_usd=_q4(vals["total_assets"]),
            net_inflows_usd=_q4(vals["inflows"]),
            net_outflows_usd=_q4(vals["outflows"]),
            net_flows_usd=_q4(vals["inflows"] - vals["outflows"]),
            market_movement_usd=_q4(vals["mkt"]),
            fees_usd=_q4(vals["fees"]),
            open_exceptions_count=0,
        )
        for adv_id, vals in advisor_agg.items()
    ]
    db.add_all(mart_advisors)

    ledger_total_usd = sum(((t.net_amount_usd or Decimal("0.0000")) for t in ledger_objs), Decimal("0.0000"))
    batch.sources_processed = len(raw_files)
    batch.records_ingested = total_ingested
    batch.records_validated = staged_total
    batch.custody_total_usd = _q4(custody_total_usd)
    batch.total_assets_usd = _q4(custody_total_usd)
    batch.ledger_total_usd = _q4(ledger_total_usd)
    batch.calculated_total_usd = _q4(calculated_total_usd)
    batch.financial_variance_usd = _q4(calculated_total_usd - custody_total_usd)
    db.flush()

    s3_end = datetime.now(timezone.utc)
    db.add(
        PipelineStageLog(
            batch_id=batch.id,
            stage_name="REPORTING_MARTS",
            status="COMPLETED",
            started_at=s3_start,
            completed_at=s3_end,
            duration_ms=int((s3_end - s3_start).total_seconds() * 1000),
            records_in=staged_total,
            records_out=len(mart_accts) + len(mart_advisors),
            details_json={"accounts_modeled": len(mart_accts), "advisors_modeled": len(mart_advisors)},
        )
    )

    # ------------------------------------------------------------------
    # Stage 4: Financial Control Engine & Publication Gate
    # ------------------------------------------------------------------
    s4_start = datetime.now(timezone.utc)
    final_status, _ = execute_controls_for_batch(db, batch)
    s4_end = datetime.now(timezone.utc)

    batch.completed_at = s4_end
    batch.duration_ms = int((s4_end - pipeline_start).total_seconds() * 1000)

    db.add(
        PipelineStageLog(
            batch_id=batch.id,
            stage_name="CONTROL_EXECUTION",
            status=final_status,
            started_at=s4_start,
            completed_at=s4_end,
            duration_ms=int((s4_end - s4_start).total_seconds() * 1000),
            records_in=len(mart_accts),
            records_out=batch.exceptions_count,
            details_json={
                "final_status": final_status,
                "exceptions_count": batch.exceptions_count,
                "critical_exceptions_count": batch.critical_exceptions_count,
            },
        )
    )

    record_audit_event(
        db,
        workspace_id=workspace_id,
        actor_id=triggered_by,
        actor_role=actor_role,
        action="BATCH_RECONCILIATION_COMPLETED",
        entity_type="RECONCILIATION_BATCH",
        entity_id=batch.id,
        prior_state={"status": "RUNNING"},
        new_state={
            "status": final_status,
            "batch_code": batch.batch_code,
            "total_assets_usd": str(batch.total_assets_usd),
            "financial_variance_usd": str(batch.financial_variance_usd),
            "exceptions_count": batch.exceptions_count,
        },
        reason=notes or f"Pipeline executed for reporting date {reporting_date.isoformat()}",
        batch_id=batch.id,
    )

    db.flush()
    return batch
