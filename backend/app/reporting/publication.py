"""VelaTrace Publication Gate — enforces control status before official report issuance."""

import uuid
from decimal import Decimal
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit.service import record_audit_event
from app.models.entities import (
    ControlExecutionResult,
    MartAccountBalance,
    PublishedReport,
    ReconciliationBatch,
)
from app.reporting.excel_export import build_management_workbook


class PublicationBlockedError(Exception):
    def __init__(self, message: str, blocking_rules: list[dict]):
        super().__init__(message)
        self.message = message
        self.blocking_rules = blocking_rules


def publish_report_for_batch(
    db: Session,
    *,
    batch: ReconciliationBatch,
    actor_id: str,
    actor_role: str,
    diagnostic_only: bool = False,
    notes: str | None = None,
) -> PublishedReport:
    """
    Enforce the Publication Gate:
      - OFFICIAL reports require batch.status in ('PASS', 'PASS_WITH_WARNINGS').
      - BLOCKED batches are strictly rejected for OFFICIAL publication, and the attempt is audited.
      - DIAGNOSTIC previews are allowed for blocked batches for investigation, clearly labeled DIAGNOSTIC.
    """
    if not diagnostic_only and batch.status == "BLOCKED":
        failed_blocking = db.execute(
            select(ControlExecutionResult).where(
                ControlExecutionResult.batch_id == batch.id,
                ControlExecutionResult.status == "FAIL",
                ControlExecutionResult.is_blocking.is_(True),
            )
        ).scalars().all()
        blocking_summary = [
            {
                "rule_id": r.rule_id,
                "evidence_summary": r.evidence_summary,
                "measured_variance_usd": str(r.measured_variance_usd),
            }
            for r in failed_blocking
        ]
        record_audit_event(
            db,
            workspace_id=batch.workspace_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="PUBLICATION_BLOCKED",
            entity_type="RECONCILIATION_BATCH",
            entity_id=batch.id,
            prior_state={"status": batch.status},
            new_state={"publication_attempted": "OFFICIAL", "rejected": True, "blocking_rules": blocking_summary},
            reason=f"Official publication rejected: {len(failed_blocking)} blocking control(s) failed.",
            batch_id=batch.id,
        )
        db.commit()
        raise PublicationBlockedError(
            message=(
                f"Publication Gate BLOCKED: Batch {batch.batch_code} has {len(failed_blocking)} "
                f"failing blocking control(s) and cannot be published as an official management report."
            ),
            blocking_rules=blocking_summary,
        )

    pub_status = "DIAGNOSTIC" if (diagnostic_only or batch.status == "BLOCKED") else "OFFICIAL"

    max_ver = db.execute(
        select(func.coalesce(func.max(PublishedReport.version_number), 0)).where(
            PublishedReport.workspace_id == batch.workspace_id,
            PublishedReport.reporting_date == batch.reporting_date,
        )
    ).scalar_one()
    next_ver = int(max_ver) + 1

    xlsx_bytes, fingerprint = build_management_workbook(
        db,
        batch,
        publication_status=pub_status,
        version_number=next_ver,
    )

    marts = db.execute(
        select(MartAccountBalance).where(MartAccountBalance.batch_id == batch.id)
    ).scalars().all()
    net_flows = sum((m.net_external_flows_usd for m in marts), Decimal("0.0000"))
    mkt_move = sum((m.market_movement_usd for m in marts), Decimal("0.0000"))

    report = PublishedReport(
        id=f"rep_{uuid.uuid4().hex[:14]}",
        workspace_id=batch.workspace_id,
        batch_id=batch.id,
        version_number=next_ver,
        reporting_date=batch.reporting_date,
        report_title=f"Northbridge Wealth Management Report — {batch.reporting_date.isoformat()} (v{next_ver})",
        publication_status=pub_status,
        total_assets_usd=batch.total_assets_usd,
        net_external_flows_usd=net_flows,
        market_movement_usd=mkt_move,
        financial_variance_usd=batch.financial_variance_usd,
        content_fingerprint=fingerprint,
        published_by=actor_id,
        notes=notes,
        xlsx_artifact_bytes=xlsx_bytes,
    )
    db.add(report)
    db.flush()

    record_audit_event(
        db,
        workspace_id=batch.workspace_id,
        actor_id=actor_id,
        actor_role=actor_role,
        action=f"REPORT_PUBLISHED_{pub_status}",
        entity_type="PUBLISHED_REPORT",
        entity_id=report.id,
        prior_state=None,
        new_state={
            "version_number": next_ver,
            "publication_status": pub_status,
            "content_fingerprint": fingerprint,
            "total_assets_usd": str(report.total_assets_usd),
        },
        reason=notes or f"Issued {pub_status} report v{next_ver} for batch {batch.batch_code}.",
        batch_id=batch.id,
    )
    db.flush()
    return report
