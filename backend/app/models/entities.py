from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base


# ---------------------------------------------------------------------------
# 1. Workspaces & Canonical Wealth Management Reference Model
# ---------------------------------------------------------------------------

class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_sandbox: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Advisor(Base):
    __tablename__ = "advisors"
    __table_args__ = (
        UniqueConstraint("workspace_id", "external_advisor_id", name="uq_advisor_ext"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    external_advisor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    team: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Client(Base):
    __tablename__ = "clients"
    __table_args__ = (
        UniqueConstraint("workspace_id", "external_client_id", name="uq_client_ext"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    external_client_id: Mapped[str] = mapped_column(String(64), nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    segment: Mapped[str] = mapped_column(String(64), nullable=False)
    advisor_id: Mapped[str] = mapped_column(ForeignKey("advisors.id"), nullable=False, index=True)
    risk_profile: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("workspace_id", "external_account_id", name="uq_account_ext"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    external_account_id: Mapped[str] = mapped_column(String(64), nullable=False)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), nullable=False, index=True)
    advisor_id: Mapped[str] = mapped_column(ForeignKey("advisors.id"), nullable=False, index=True)
    account_type: Mapped[str] = mapped_column(String(48), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="ACTIVE", nullable=False)
    opened_date: Mapped[date] = mapped_column(Date, nullable=False)


# ---------------------------------------------------------------------------
# 2. Reconciliation Batches & Pipeline Stage Logs
# ---------------------------------------------------------------------------

class ReconciliationBatch(Base):
    __tablename__ = "reconciliation_batches"
    __table_args__ = (
        Index("ix_batches_ws_date", "workspace_id", "reporting_date"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", nullable=False)  # PENDING, RUNNING, PASS, PASS_WITH_WARNINGS, BLOCKED
    is_sandbox: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    scenario_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    parent_batch_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sources_processed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_ingested: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_validated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    exceptions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    critical_exceptions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_assets_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    custody_total_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    ledger_total_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    calculated_total_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    financial_variance_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    triggered_by: Mapped[str] = mapped_column(String(64), default="system", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class PipelineStageLog(Base):
    __tablename__ = "pipeline_stage_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_name: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    records_in: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    records_out: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    details_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


# ---------------------------------------------------------------------------
# 3. Immutable Raw Layer
# ---------------------------------------------------------------------------

class RawSourceFile(Base):
    __tablename__ = "raw_source_files"
    __table_args__ = (
        UniqueConstraint("workspace_id", "idempotency_key", name="uq_raw_idempotency"),
        Index("ix_raw_batch_source", "batch_id", "source_system"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    source_system: Mapped[str] = mapped_column(String(64), nullable=False)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False)
    declared_control_total: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    declared_currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    parser_version: Mapped[str] = mapped_column(String(32), default="v1.0.0", nullable=False)
    payload_format: Mapped[str] = mapped_column(String(16), nullable=False)
    raw_payload_text: Mapped[str] = mapped_column(Text, nullable=False)
    processing_status: Mapped[str] = mapped_column(String(32), default="INGESTED", nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)


class RawRecord(Base):
    __tablename__ = "raw_records"
    __table_args__ = (
        Index("ix_raw_rec_file_row", "raw_file_id", "row_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    raw_file_id: Mapped[str] = mapped_column(ForeignKey("raw_source_files.id", ondelete="CASCADE"), nullable=False, index=True)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_data_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    record_hash: Mapped[str] = mapped_column(String(64), nullable=False)


# ---------------------------------------------------------------------------
# 4. Staging Layer (Normalized & Traceable)
# ---------------------------------------------------------------------------

class StgFxRate(Base):
    __tablename__ = "stg_fx_rates"
    __table_args__ = (
        Index("ix_stg_fx_batch_pair", "batch_id", "from_currency", "to_currency"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_file_id: Mapped[str] = mapped_column(ForeignKey("raw_source_files.id", ondelete="CASCADE"), nullable=False)
    rate_date: Mapped[date] = mapped_column(Date, nullable=False)
    from_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    to_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)


class StgMarketPrice(Base):
    __tablename__ = "stg_market_prices"
    __table_args__ = (
        Index("ix_stg_price_batch_sec", "batch_id", "security_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_file_id: Mapped[str] = mapped_column(ForeignKey("raw_source_files.id", ondelete="CASCADE"), nullable=False)
    price_date: Mapped[date] = mapped_column(Date, nullable=False)
    security_id: Mapped[str] = mapped_column(String(32), nullable=False)
    ticker: Mapped[str] = mapped_column(String(24), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    close_price: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)


class StgCustodyBalance(Base):
    __tablename__ = "stg_custody_balances"
    __table_args__ = (
        Index("ix_stg_custody_batch_acct", "batch_id", "account_external_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_file_id: Mapped[str] = mapped_column(ForeignKey("raw_source_files.id", ondelete="CASCADE"), nullable=False)
    raw_record_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    account_external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    canonical_account_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    opening_value_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    cash_balance_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    securities_value_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    total_value_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    market_movement_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    original_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    fx_rate_applied: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    opening_value_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    total_value_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    market_movement_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)


class StgLedgerTransaction(Base):
    __tablename__ = "stg_ledger_transactions"
    __table_args__ = (
        Index("ix_stg_ledger_batch_acct", "batch_id", "account_external_id"),
        Index("ix_stg_ledger_batch_txn", "batch_id", "external_txn_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_file_id: Mapped[str] = mapped_column(ForeignKey("raw_source_files.id", ondelete="CASCADE"), nullable=False)
    raw_record_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    external_txn_id: Mapped[str] = mapped_column(String(64), nullable=False)
    account_external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    canonical_account_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date] = mapped_column(Date, nullable=False)
    txn_type: Mapped[str] = mapped_column(String(32), nullable=False)  # DEPOSIT, WITHDRAWAL, BUY, SELL, FEE, DIVIDEND, INTEREST
    flow_classification: Mapped[str] = mapped_column(String(32), nullable=False)  # EXTERNAL_INFLOW, EXTERNAL_OUTFLOW, INTERNAL_REALLOCATION, FEE, INCOME
    security_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    gross_amount_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    fee_amount_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    net_amount_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    original_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    reporting_currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    fx_rate_applied: Mapped[Decimal | None] = mapped_column(Numeric(18, 8), nullable=True)
    net_amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    fee_amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)


class StgTrade(Base):
    __tablename__ = "stg_trades"
    __table_args__ = (
        Index("ix_stg_trades_batch_acct", "batch_id", "account_external_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_file_id: Mapped[str] = mapped_column(ForeignKey("raw_source_files.id", ondelete="CASCADE"), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    external_trade_id: Mapped[str] = mapped_column(String(64), nullable=False)
    account_external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    canonical_account_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    side: Mapped[str] = mapped_column(String(16), nullable=False)
    security_id: Mapped[str] = mapped_column(String(32), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    gross_amount_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    commission_orig: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    gross_amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)


class StgCrmAccount(Base):
    __tablename__ = "stg_crm_accounts"
    __table_args__ = (
        Index("ix_stg_crm_batch_acct", "batch_id", "account_external_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    raw_file_id: Mapped[str] = mapped_column(ForeignKey("raw_source_files.id", ondelete="CASCADE"), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    account_external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    client_external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    advisor_external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    account_type: Mapped[str] = mapped_column(String(48), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)


# ---------------------------------------------------------------------------
# 5. Control Library & Execution Results
# ---------------------------------------------------------------------------

class ControlRule(Base):
    __tablename__ = "control_rules"
    __table_args__ = (
        UniqueConstraint("rule_id", "version", name="uq_rule_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    business_description: Mapped[str] = mapped_column(Text, nullable=False)
    control_family: Mapped[str] = mapped_column(String(48), nullable=False)
    severity: Mapped[str] = mapped_column(String(24), nullable=False)  # CRITICAL, HIGH, MEDIUM, LOW
    is_blocking: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_waivable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    owner_team: Mapped[str] = mapped_column(String(64), nullable=False)
    tolerance_abs: Mapped[Decimal | None] = mapped_column(Numeric(20, 4), nullable=True)
    tolerance_pct: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    handler_name: Mapped[str] = mapped_column(String(64), nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config_yaml: Mapped[str] = mapped_column(Text, nullable=False)


class ControlExecutionResult(Base):
    __tablename__ = "control_execution_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    rule_version: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # PASS, WARN, FAIL
    is_blocking: Mapped[bool] = mapped_column(Boolean, nullable=False)
    evaluated_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    measured_variance_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    threshold_description: Mapped[str] = mapped_column(String(255), nullable=False)
    evidence_summary: Mapped[str] = mapped_column(Text, nullable=False)
    affected_entity_ids_json: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ---------------------------------------------------------------------------
# 6. Exception Queue & Maker-Checker Waivers
# ---------------------------------------------------------------------------

class ControlException(Base):
    __tablename__ = "exceptions"
    __table_args__ = (
        Index("ix_exc_ws_status", "workspace_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    exception_code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    rule_version: Mapped[str] = mapped_column(String(16), nullable=False)
    control_execution_id: Mapped[int] = mapped_column(ForeignKey("control_execution_results.id", ondelete="CASCADE"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source_system: Mapped[str] = mapped_column(String(64), nullable=False)
    source_record_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    severity: Mapped[str] = mapped_column(String(24), nullable=False)
    is_blocking: Mapped[bool] = mapped_column(Boolean, nullable=False)
    variance_amount_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), default=Decimal("0.0000"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="OPEN", nullable=False)  # OPEN, INVESTIGATING, RESOLVED, WAIVER_REQUESTED, WAIVED, FALSE_POSITIVE
    assigned_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sla_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class ExceptionComment(Base):
    __tablename__ = "exception_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exception_id: Mapped[str] = mapped_column(ForeignKey("exceptions.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id: Mapped[str] = mapped_column(String(64), nullable=False)
    author_role: Mapped[str] = mapped_column(String(32), nullable=False)
    comment_type: Mapped[str] = mapped_column(String(32), default="NOTE", nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class WaiverRequest(Base):
    __tablename__ = "waiver_requests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    exception_id: Mapped[str] = mapped_column(ForeignKey("exceptions.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by: Mapped[str] = mapped_column(String(64), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    supporting_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="PENDING", nullable=False)  # PENDING, APPROVED, REJECTED
    reviewed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# 7. Reporting Marts & Versioned Published Reports
# ---------------------------------------------------------------------------

class MartAccountBalance(Base):
    __tablename__ = "mart_account_balances"
    __table_args__ = (
        Index("ix_mart_acct_batch", "batch_id", "account_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    account_id: Mapped[str] = mapped_column(String(64), nullable=False)
    account_external_id: Mapped[str] = mapped_column(String(64), nullable=False)
    client_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    advisor_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    opening_assets_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    external_inflows_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    external_outflows_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    net_external_flows_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    market_movement_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    fees_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    expected_closing_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    custody_closing_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    variance_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    control_status: Mapped[str] = mapped_column(String(24), nullable=False)


class MartAdvisorSummary(Base):
    __tablename__ = "mart_advisor_summary"
    __table_args__ = (
        Index("ix_mart_adv_batch", "batch_id", "advisor_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    advisor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    advisor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    account_count: Mapped[int] = mapped_column(Integer, nullable=False)
    total_assets_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    net_inflows_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    net_outflows_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    net_flows_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    market_movement_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    fees_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    open_exceptions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class PublishedReport(Base):
    __tablename__ = "published_reports"
    __table_args__ = (
        UniqueConstraint("workspace_id", "reporting_date", "version_number", name="uq_pub_report_version"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    batch_id: Mapped[str] = mapped_column(ForeignKey("reconciliation_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reporting_date: Mapped[date] = mapped_column(Date, nullable=False)
    report_title: Mapped[str] = mapped_column(String(200), nullable=False)
    publication_status: Mapped[str] = mapped_column(String(24), nullable=False)  # OFFICIAL, DIAGNOSTIC
    total_assets_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    net_external_flows_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    market_movement_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    financial_variance_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    content_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    published_by: Mapped[str] = mapped_column(String(64), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    xlsx_artifact_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)


# ---------------------------------------------------------------------------
# 8. Hash-Chained Append-Only Audit Trail & Failure Lab Runs
# ---------------------------------------------------------------------------

class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_ws_seq", "workspace_id", "sequence_num"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sequence_num: Mapped[int] = mapped_column(Integer, nullable=False)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(32), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(48), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    prior_state_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_state_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    batch_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    correlation_id: Mapped[str] = mapped_column(String(64), nullable=False)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    event_hash: Mapped[str] = mapped_column(String(64), nullable=False)


class FailureLabRun(Base):
    __tablename__ = "failure_lab_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    scenario_key: Mapped[str] = mapped_column(String(64), nullable=False)
    scenario_name: Mapped[str] = mapped_column(String(160), nullable=False)
    seed: Mapped[int] = mapped_column(Integer, nullable=False)
    baseline_batch_id: Mapped[str] = mapped_column(String(64), nullable=False)
    corrupted_batch_id: Mapped[str] = mapped_column(String(64), nullable=False)
    corrected_batch_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    injected_details_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    expected_variance_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    actual_variance_usd: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)  # INJECTED, BLOCKED_VERIFIED, CORRECTED_PASSED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
