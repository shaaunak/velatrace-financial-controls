"""VelaTrace REST API Router — all endpoints backed by PostgreSQL calculations."""

import csv
import io
import json
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.audit.service import record_audit_event, verify_audit_chain
from app.core.config import get_settings
from app.core.security import ActorContext, ActorRole, get_current_actor, require_roles
from app.controls.engine import sync_control_rules_to_db
from app.db.session import get_db
from app.models.entities import (
    AuditEvent,
    ControlException,
    ControlExecutionResult,
    ControlRule,
    ExceptionComment,
    FailureLabRun,
    MartAccountBalance,
    MartAdvisorSummary,
    PipelineStageLog,
    PublishedReport,
    RawRecord,
    RawSourceFile,
    ReconciliationBatch,
    StgCustodyBalance,
    StgLedgerTransaction,
    WaiverRequest,
    Workspace,
)
from app.pipelines.ingestion import ingest_raw_file
from app.reporting.publication import PublicationBlockedError, publish_report_for_batch
from app.services.failure_lab import (
    SCENARIO_CATALOG,
    correct_and_rerun_failure_lab,
    run_failure_lab_injection,
)

router = APIRouter()
settings = get_settings()

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "OPEN": {"INVESTIGATING", "RESOLVED", "WAIVER_REQUESTED", "FALSE_POSITIVE"},
    "INVESTIGATING": {"RESOLVED", "WAIVER_REQUESTED", "FALSE_POSITIVE", "OPEN"},
    "WAIVER_REQUESTED": {"WAIVED", "INVESTIGATING", "OPEN"},
    "RESOLVED": {"OPEN"},
    "WAIVED": set(),
    "FALSE_POSITIVE": {"OPEN"},
}


# ---------------------------------------------------------------------------
# Request / Response Schemas
# ---------------------------------------------------------------------------

class ExceptionTransitionRequest(BaseModel):
    new_status: str
    assigned_to: str | None = None
    resolution_notes: str | None = None


class ExceptionCommentRequest(BaseModel):
    body: str = Field(min_length=2, max_length=2000)


class WaiverCreateRequest(BaseModel):
    justification: str = Field(min_length=10, max_length=2000)
    supporting_evidence: str | None = None


class WaiverReviewRequest(BaseModel):
    decision: str = Field(pattern="^(APPROVED|REJECTED)$")
    review_notes: str = Field(min_length=5, max_length=2000)


class PublishReportRequest(BaseModel):
    batch_id: str
    diagnostic_only: bool = False
    notes: str | None = None


class FailureLabInjectRequest(BaseModel):
    scenario_key: str
    seed: int = 20261112
    reporting_date: date = date(2026, 10, 30)


class ControlUpdateRequest(BaseModel):
    tolerance_abs: Decimal | None = None
    is_blocking: bool | None = None
    owner_team: str | None = None


# ---------------------------------------------------------------------------
# Health & Readiness
# ---------------------------------------------------------------------------

@router.get("/health/ready")
def readiness_check(db: Session = Depends(get_db)):
    ws_count = db.execute(select(func.count(Workspace.id))).scalar_one()
    batch_count = db.execute(select(func.count(ReconciliationBatch.id))).scalar_one()
    return {
        "status": "ready",
        "database": "connected",
        "workspaces": ws_count,
        "batches": batch_count,
    }


# ---------------------------------------------------------------------------
# Overview Dashboard
# ---------------------------------------------------------------------------

@router.get("/overview")
def get_overview(
    workspace_id: str = Query(default=settings.demo_workspace_id),
    reporting_date: date | None = Query(default=None),
    batch_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    batches_q = (
        select(ReconciliationBatch)
        .where(ReconciliationBatch.workspace_id == workspace_id)
        .order_by(desc(ReconciliationBatch.reporting_date), desc(ReconciliationBatch.started_at))
    )
    all_batches = db.execute(batches_q).scalars().all()

    if batch_id:
        selected = next((b for b in all_batches if b.id == batch_id), None)
    elif reporting_date:
        selected = next((b for b in all_batches if b.reporting_date == reporting_date), None)
    else:
        selected = all_batches[0] if all_batches else None

    if not selected:
        return {
            "workspace_id": workspace_id,
            "selected_batch": None,
            "recent_batches": [],
            "severity_breakdown": [],
            "source_coverage": [],
            "last_publication": None,
            "available_dates": [],
        }

    open_exc = db.execute(
        select(func.count(ControlException.id)).where(
            ControlException.batch_id == selected.id,
            ControlException.status.in_(["OPEN", "INVESTIGATING", "WAIVER_REQUESTED"]),
        )
    ).scalar_one()

    sev_rows = db.execute(
        select(ControlException.severity, func.count(ControlException.id))
        .where(ControlException.batch_id == selected.id)
        .group_by(ControlException.severity)
    ).all()

    raw_files = db.execute(
        select(RawSourceFile).where(RawSourceFile.batch_id == selected.id)
    ).scalars().all()

    last_pub = db.execute(
        select(PublishedReport)
        .where(
            PublishedReport.workspace_id == workspace_id,
            PublishedReport.publication_status == "OFFICIAL",
        )
        .order_by(desc(PublishedReport.published_at))
        .limit(1)
    ).scalar_one_or_none()

    reconciled_records = selected.records_validated
    coverage_pct = (
        round((reconciled_records / selected.records_ingested) * 100, 2)
        if selected.records_ingested > 0
        else 0.0
    )

    available_dates = sorted({b.reporting_date.isoformat() for b in all_batches}, reverse=True)

    return {
        "workspace_id": workspace_id,
        "available_dates": available_dates,
        "selected_batch": {
            "id": selected.id,
            "batch_code": selected.batch_code,
            "reporting_date": selected.reporting_date.isoformat(),
            "status": selected.status,
            "total_assets_usd": float(selected.total_assets_usd),
            "custody_total_usd": float(selected.custody_total_usd),
            "calculated_total_usd": float(selected.calculated_total_usd),
            "financial_variance_usd": float(selected.financial_variance_usd),
            "records_ingested": selected.records_ingested,
            "records_validated": selected.records_validated,
            "reconciliation_coverage_pct": coverage_pct,
            "open_exceptions": open_exc,
            "critical_exceptions": selected.critical_exceptions_count,
            "sources_processed": selected.sources_processed,
            "duration_ms": selected.duration_ms,
        },
        "recent_batches": [
            {
                "id": b.id,
                "batch_code": b.batch_code,
                "reporting_date": b.reporting_date.isoformat(),
                "status": b.status,
                "total_assets_usd": float(b.total_assets_usd),
                "financial_variance_usd": float(b.financial_variance_usd),
                "records_ingested": b.records_ingested,
                "exceptions_count": b.exceptions_count,
                "duration_ms": b.duration_ms,
                "started_at": b.started_at.isoformat(),
            }
            for b in all_batches[:10]
        ],
        "severity_breakdown": [{"severity": r[0], "count": r[1]} for r in sev_rows],
        "source_coverage": [
            {
                "source_system": f.source_system,
                "file_name": f.file_name,
                "row_count": f.row_count,
                "status": f.processing_status,
                "source_hash": f.source_hash[:12],
            }
            for f in raw_files
        ],
        "last_publication": (
            {
                "id": last_pub.id,
                "version_number": last_pub.version_number,
                "reporting_date": last_pub.reporting_date.isoformat(),
                "published_by": last_pub.published_by,
                "published_at": last_pub.published_at.isoformat(),
                "publication_status": last_pub.publication_status,
                "content_fingerprint": last_pub.content_fingerprint[:16],
            }
            if last_pub
            else None
        ),
    }


# ---------------------------------------------------------------------------
# Reconciliation Runs
# ---------------------------------------------------------------------------

@router.get("/batches")
def list_batches(
    workspace_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    include_sandbox: bool = Query(default=True),
    limit: int = Query(default=25, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    q = select(ReconciliationBatch)
    if workspace_id:
        q = q.where(ReconciliationBatch.workspace_id == workspace_id)
    if not include_sandbox:
        q = q.where(ReconciliationBatch.is_sandbox.is_(False))
    if status_filter:
        q = q.where(ReconciliationBatch.status == status_filter)
    if search:
        q = q.where(ReconciliationBatch.batch_code.ilike(f"%{search}%"))

    total = db.execute(select(func.count()).select_from(q.subquery())).scalar_one()
    rows = db.execute(
        q.order_by(desc(ReconciliationBatch.started_at)).limit(limit).offset(offset)
    ).scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": b.id,
                "workspace_id": b.workspace_id,
                "batch_code": b.batch_code,
                "reporting_date": b.reporting_date.isoformat(),
                "status": b.status,
                "is_sandbox": b.is_sandbox,
                "scenario_key": b.scenario_key,
                "sources_processed": b.sources_processed,
                "records_ingested": b.records_ingested,
                "records_validated": b.records_validated,
                "exceptions_count": b.exceptions_count,
                "financial_variance_usd": float(b.financial_variance_usd),
                "total_assets_usd": float(b.total_assets_usd),
                "duration_ms": b.duration_ms,
                "started_at": b.started_at.isoformat(),
                "completed_at": b.completed_at.isoformat() if b.completed_at else None,
            }
            for b in rows
        ],
    }


@router.get("/batches/{batch_id}")
def get_batch_detail(batch_id: str, db: Session = Depends(get_db)):
    batch = db.get(ReconciliationBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")

    stages = db.execute(
        select(PipelineStageLog)
        .where(PipelineStageLog.batch_id == batch.id)
        .order_by(PipelineStageLog.id.asc())
    ).scalars().all()

    sources = db.execute(
        select(RawSourceFile)
        .where(RawSourceFile.batch_id == batch.id)
        .order_by(RawSourceFile.source_system.asc())
    ).scalars().all()

    controls = db.execute(
        select(ControlExecutionResult)
        .where(ControlExecutionResult.batch_id == batch.id)
        .order_by(ControlExecutionResult.rule_id.asc())
    ).scalars().all()

    exceptions = db.execute(
        select(ControlException)
        .where(ControlException.batch_id == batch.id)
        .order_by(desc(ControlException.variance_amount_usd))
    ).scalars().all()

    return {
        "batch": {
            "id": batch.id,
            "workspace_id": batch.workspace_id,
            "batch_code": batch.batch_code,
            "reporting_date": batch.reporting_date.isoformat(),
            "status": batch.status,
            "is_sandbox": batch.is_sandbox,
            "scenario_key": batch.scenario_key,
            "total_assets_usd": float(batch.total_assets_usd),
            "custody_total_usd": float(batch.custody_total_usd),
            "ledger_total_usd": float(batch.ledger_total_usd),
            "calculated_total_usd": float(batch.calculated_total_usd),
            "financial_variance_usd": float(batch.financial_variance_usd),
            "records_ingested": batch.records_ingested,
            "records_validated": batch.records_validated,
            "exceptions_count": batch.exceptions_count,
            "critical_exceptions_count": batch.critical_exceptions_count,
            "duration_ms": batch.duration_ms,
            "triggered_by": batch.triggered_by,
            "notes": batch.notes,
            "publication_eligible": batch.status in ("PASS", "PASS_WITH_WARNINGS"),
        },
        "stages": [
            {
                "stage_name": s.stage_name,
                "status": s.status,
                "started_at": s.started_at.isoformat(),
                "completed_at": s.completed_at.isoformat(),
                "duration_ms": s.duration_ms,
                "records_in": s.records_in,
                "records_out": s.records_out,
                "details": s.details_json,
            }
            for s in stages
        ],
        "sources": [
            {
                "id": f.id,
                "source_system": f.source_system,
                "file_name": f.file_name,
                "row_count": f.row_count,
                "declared_control_total": float(f.declared_control_total) if f.declared_control_total else None,
                "source_hash": f.source_hash,
                "idempotency_key": f.idempotency_key,
                "parser_version": f.parser_version,
                "processing_status": f.processing_status,
                "received_at": f.received_at.isoformat(),
            }
            for f in sources
        ],
        "controls": [
            {
                "id": c.id,
                "rule_id": c.rule_id,
                "rule_version": c.rule_version,
                "status": c.status,
                "is_blocking": c.is_blocking,
                "evaluated_count": c.evaluated_count,
                "failed_count": c.failed_count,
                "measured_variance_usd": float(c.measured_variance_usd),
                "threshold_description": c.threshold_description,
                "evidence_summary": c.evidence_summary,
                "affected_entities": c.affected_entity_ids_json or [],
            }
            for c in controls
        ],
        "exceptions": [
            {
                "id": e.id,
                "exception_code": e.exception_code,
                "rule_id": e.rule_id,
                "severity": e.severity,
                "is_blocking": e.is_blocking,
                "entity_type": e.entity_type,
                "entity_id": e.entity_id,
                "variance_amount_usd": float(e.variance_amount_usd),
                "status": e.status,
                "description": e.description,
            }
            for e in exceptions
        ],
    }


# ---------------------------------------------------------------------------
# Data Sources & Idempotent Upload
# ---------------------------------------------------------------------------

@router.get("/sources")
def list_sources(
    workspace_id: str = Query(default=settings.demo_workspace_id),
    batch_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = select(RawSourceFile).where(RawSourceFile.workspace_id == workspace_id)
    if batch_id:
        q = q.where(RawSourceFile.batch_id == batch_id)
    files = db.execute(q.order_by(desc(RawSourceFile.received_at)).limit(60)).scalars().all()
    return {
        "items": [
            {
                "id": f.id,
                "batch_id": f.batch_id,
                "source_system": f.source_system,
                "reporting_date": f.reporting_date.isoformat(),
                "file_name": f.file_name,
                "row_count": f.row_count,
                "declared_control_total": float(f.declared_control_total) if f.declared_control_total else None,
                "source_hash": f.source_hash,
                "idempotency_key": f.idempotency_key,
                "parser_version": f.parser_version,
                "payload_format": f.payload_format,
                "processing_status": f.processing_status,
                "received_at": f.received_at.isoformat(),
            }
            for f in files
        ]
    }


@router.get("/sources/{raw_file_id}/preview")
def preview_source_file(raw_file_id: str, db: Session = Depends(get_db)):
    rf = db.get(RawSourceFile, raw_file_id)
    if not rf:
        raise HTTPException(status_code=404, detail="Raw source file not found.")
    lines = rf.raw_payload_text.splitlines()[:15]
    return {
        "id": rf.id,
        "file_name": rf.file_name,
        "source_system": rf.source_system,
        "payload_format": rf.payload_format,
        "row_count": rf.row_count,
        "source_hash": rf.source_hash,
        "preview_lines": lines,
    }


@router.post("/sources/upload")
async def upload_source_file(
    source_system: str = Form(...),
    reporting_date: date = Form(...),
    batch_id: str = Form(...),
    file: UploadFile = File(...),
    actor: ActorContext = Depends(require_roles(ActorRole.ANALYST, ActorRole.CONTROLLER)),
    db: Session = Depends(get_db),
):
    batch = db.get(ReconciliationBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Target batch not found.")
    raw_bytes = await file.read()
    if len(raw_bytes) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds 10MB demo safety limit.")

    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ("csv", "json"):
        raise HTTPException(status_code=400, detail="Only .csv and .json source files are supported.")

    text_payload = raw_bytes.decode("utf-8", errors="strict")
    rf, created = ingest_raw_file(
        db,
        workspace_id=batch.workspace_id,
        batch_id=batch.id,
        source_system=source_system,
        reporting_date=reporting_date,
        file_name=file.filename or f"{source_system}.{ext}",
        payload_text=text_payload,
        payload_format=ext,
    )
    record_audit_event(
        db,
        workspace_id=batch.workspace_id,
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        action="SOURCE_FILE_INGESTED" if created else "SOURCE_FILE_IDEMPOTENT_HIT",
        entity_type="RAW_SOURCE_FILE",
        entity_id=rf.id,
        new_state={"file_name": rf.file_name, "source_hash": rf.source_hash, "created_new": created},
        batch_id=batch.id,
    )
    db.commit()
    return {
        "id": rf.id,
        "created_new": created,
        "idempotency_key": rf.idempotency_key,
        "row_count": rf.row_count,
        "processing_status": rf.processing_status,
    }


# ---------------------------------------------------------------------------
# Control Library
# ---------------------------------------------------------------------------

@router.get("/controls")
def list_controls(db: Session = Depends(get_db)):
    sync_control_rules_to_db(db)
    db.commit()
    rules = db.execute(
        select(ControlRule).where(ControlRule.is_active.is_(True)).order_by(ControlRule.rule_id.asc())
    ).scalars().all()
    items = []
    for r in rules:
        latest = db.execute(
            select(ControlExecutionResult)
            .where(ControlExecutionResult.rule_id == r.rule_id)
            .order_by(desc(ControlExecutionResult.executed_at))
            .limit(1)
        ).scalar_one_or_none()
        items.append(
            {
                "rule_id": r.rule_id,
                "version": r.version,
                "name": r.name,
                "business_description": r.business_description,
                "control_family": r.control_family,
                "severity": r.severity,
                "is_blocking": r.is_blocking,
                "is_waivable": r.is_waivable,
                "owner_team": r.owner_team,
                "tolerance_abs": float(r.tolerance_abs) if r.tolerance_abs is not None else None,
                "handler_name": r.handler_name,
                "effective_date": r.effective_date.isoformat(),
                "last_result": latest.status if latest else "NOT_RUN",
                "config_yaml": r.config_yaml,
            }
        )
    return {"items": items}


@router.patch("/controls/{rule_id}")
def update_control_rule_version(
    rule_id: str,
    payload: ControlUpdateRequest,
    actor: ActorContext = Depends(require_roles(ActorRole.CONTROLLER)),
    db: Session = Depends(get_db),
):
    current = db.execute(
        select(ControlRule)
        .where(ControlRule.rule_id == rule_id, ControlRule.is_active.is_(True))
        .order_by(desc(ControlRule.id))
        .limit(1)
    ).scalar_one_or_none()
    if not current:
        raise HTTPException(status_code=404, detail="Control rule not found.")

    major, minor, patch = current.version.split(".")
    new_version = f"{major}.{int(minor) + 1}.0"
    current.is_active = False

    new_rule = ControlRule(
        rule_id=current.rule_id,
        version=new_version,
        name=current.name,
        business_description=current.business_description,
        control_family=current.control_family,
        severity=current.severity,
        is_blocking=payload.is_blocking if payload.is_blocking is not None else current.is_blocking,
        is_waivable=current.is_waivable,
        owner_team=payload.owner_team or current.owner_team,
        tolerance_abs=payload.tolerance_abs if payload.tolerance_abs is not None else current.tolerance_abs,
        tolerance_pct=current.tolerance_pct,
        handler_name=current.handler_name,
        effective_date=date.today(),
        is_active=True,
        config_yaml=current.config_yaml,
    )
    db.add(new_rule)
    record_audit_event(
        db,
        workspace_id=settings.demo_workspace_id,
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        action="CONTROL_RULE_VERSION_CREATED",
        entity_type="CONTROL_RULE",
        entity_id=rule_id,
        prior_state={"version": current.version, "tolerance_abs": str(current.tolerance_abs)},
        new_state={"version": new_version, "tolerance_abs": str(new_rule.tolerance_abs)},
        reason=f"Updated {rule_id} to v{new_version} without altering historical batch evaluations.",
    )
    db.commit()
    return {"rule_id": new_rule.rule_id, "version": new_rule.version, "tolerance_abs": float(new_rule.tolerance_abs or 0)}


# ---------------------------------------------------------------------------
# Exception Management & Maker-Checker Waivers
# ---------------------------------------------------------------------------

@router.get("/exceptions")
def list_exceptions(
    workspace_id: str | None = Query(default=None),
    batch_id: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    severity: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = select(ControlException)
    if workspace_id:
        q = q.where(ControlException.workspace_id == workspace_id)
    if batch_id:
        q = q.where(ControlException.batch_id == batch_id)
    if status_filter:
        q = q.where(ControlException.status == status_filter)
    if severity:
        q = q.where(ControlException.severity == severity)

    rows = db.execute(q.order_by(desc(ControlException.created_at)).limit(100)).scalars().all()
    now = datetime.now(timezone.utc)
    return {
        "items": [
            {
                "id": e.id,
                "exception_code": e.exception_code,
                "workspace_id": e.workspace_id,
                "batch_id": e.batch_id,
                "rule_id": e.rule_id,
                "rule_version": e.rule_version,
                "entity_type": e.entity_type,
                "entity_id": e.entity_id,
                "source_system": e.source_system,
                "source_record_ref": e.source_record_ref,
                "severity": e.severity,
                "is_blocking": e.is_blocking,
                "variance_amount_usd": float(e.variance_amount_usd),
                "title": e.title,
                "description": e.description,
                "status": e.status,
                "assigned_to": e.assigned_to,
                "sla_due_at": e.sla_due_at.isoformat(),
                "age_hours": round((now - e.created_at).total_seconds() / 3600, 1),
                "created_at": e.created_at.isoformat(),
                "resolution_notes": e.resolution_notes,
            }
            for e in rows
        ]
    }


@router.get("/exceptions/{exc_id}")
def get_exception_detail(exc_id: str, db: Session = Depends(get_db)):
    exc = db.get(ControlException, exc_id)
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found.")
    comments = db.execute(
        select(ExceptionComment)
        .where(ExceptionComment.exception_id == exc.id)
        .order_by(ExceptionComment.created_at.asc())
    ).scalars().all()
    waivers = db.execute(
        select(WaiverRequest)
        .where(WaiverRequest.exception_id == exc.id)
        .order_by(desc(WaiverRequest.requested_at))
    ).scalars().all()
    rule = db.execute(
        select(ControlRule).where(
            ControlRule.rule_id == exc.rule_id,
            ControlRule.version == exc.rule_version,
        )
    ).scalar_one_or_none()
    return {
        "exception": {
            "id": exc.id,
            "exception_code": exc.exception_code,
            "workspace_id": exc.workspace_id,
            "batch_id": exc.batch_id,
            "rule_id": exc.rule_id,
            "rule_version": exc.rule_version,
            "is_waivable": rule.is_waivable if rule else False,
            "entity_type": exc.entity_type,
            "entity_id": exc.entity_id,
            "source_system": exc.source_system,
            "source_record_ref": exc.source_record_ref,
            "severity": exc.severity,
            "is_blocking": exc.is_blocking,
            "variance_amount_usd": float(exc.variance_amount_usd),
            "title": exc.title,
            "description": exc.description,
            "status": exc.status,
            "assigned_to": exc.assigned_to,
            "sla_due_at": exc.sla_due_at.isoformat(),
            "created_at": exc.created_at.isoformat(),
            "resolution_notes": exc.resolution_notes,
        },
        "comments": [
            {
                "id": c.id,
                "author_id": c.author_id,
                "author_role": c.author_role,
                "comment_type": c.comment_type,
                "body": c.body,
                "created_at": c.created_at.isoformat(),
            }
            for c in comments
        ],
        "waivers": [
            {
                "id": w.id,
                "requested_by": w.requested_by,
                "requested_at": w.requested_at.isoformat(),
                "justification": w.justification,
                "status": w.status,
                "reviewed_by": w.reviewed_by,
                "reviewed_at": w.reviewed_at.isoformat() if w.reviewed_at else None,
                "review_notes": w.review_notes,
            }
            for w in waivers
        ],
    }


@router.patch("/exceptions/{exc_id}/transition")
def transition_exception(
    exc_id: str,
    payload: ExceptionTransitionRequest,
    actor: ActorContext = Depends(require_roles(ActorRole.ANALYST, ActorRole.CONTROLLER)),
    db: Session = Depends(get_db),
):
    exc = db.get(ControlException, exc_id)
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found.")

    allowed = ALLOWED_TRANSITIONS.get(exc.status, set())
    if payload.new_status != exc.status and payload.new_status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid state transition from '{exc.status}' to '{payload.new_status}'. Allowed: {sorted(allowed)}.",
        )

    prior = {"status": exc.status, "assigned_to": exc.assigned_to}
    exc.status = payload.new_status
    if payload.assigned_to is not None:
        exc.assigned_to = payload.assigned_to
    if payload.resolution_notes is not None:
        exc.resolution_notes = payload.resolution_notes
    if payload.new_status in ("RESOLVED", "FALSE_POSITIVE", "WAIVED"):
        exc.resolved_at = datetime.now(timezone.utc)

    record_audit_event(
        db,
        workspace_id=exc.workspace_id,
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        action="EXCEPTION_TRANSITION",
        entity_type="CONTROL_EXCEPTION",
        entity_id=exc.id,
        prior_state=prior,
        new_state={"status": exc.status, "assigned_to": exc.assigned_to},
        reason=payload.resolution_notes or f"Transitioned {exc.exception_code} to {exc.status}.",
        batch_id=exc.batch_id,
    )
    db.commit()
    return {"id": exc.id, "status": exc.status, "assigned_to": exc.assigned_to}


@router.post("/exceptions/{exc_id}/comments")
def add_exception_comment(
    exc_id: str,
    payload: ExceptionCommentRequest,
    actor: ActorContext = Depends(require_roles(ActorRole.ANALYST, ActorRole.CONTROLLER)),
    db: Session = Depends(get_db),
):
    exc = db.get(ControlException, exc_id)
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found.")
    comment = ExceptionComment(
        exception_id=exc.id,
        author_id=actor.actor_id,
        author_role=actor.role.value,
        comment_type="INVESTIGATION_NOTE",
        body=payload.body,
    )
    db.add(comment)
    db.commit()
    return {"id": comment.id, "created_at": comment.created_at.isoformat()}


@router.post("/exceptions/{exc_id}/waivers")
def request_waiver(
    exc_id: str,
    payload: WaiverCreateRequest,
    actor: ActorContext = Depends(require_roles(ActorRole.ANALYST, ActorRole.CONTROLLER)),
    db: Session = Depends(get_db),
):
    exc = db.get(ControlException, exc_id)
    if not exc:
        raise HTTPException(status_code=404, detail="Exception not found.")

    rule = db.execute(
        select(ControlRule).where(
            ControlRule.rule_id == exc.rule_id,
            ControlRule.version == exc.rule_version,
        )
    ).scalar_one_or_none()
    if rule and not rule.is_waivable:
        raise HTTPException(
            status_code=403,
            detail=f"Control {exc.rule_id} ({rule.name}) is non-waivable by institutional reporting policy.",
        )

    waiver = WaiverRequest(
        id=f"waiv_{uuid.uuid4().hex[:14]}",
        exception_id=exc.id,
        requested_by=actor.actor_id,
        justification=payload.justification,
        supporting_evidence=payload.supporting_evidence,
        status="PENDING",
    )
    exc.status = "WAIVER_REQUESTED"
    db.add(waiver)
    record_audit_event(
        db,
        workspace_id=exc.workspace_id,
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
        action="WAIVER_REQUESTED",
        entity_type="WAIVER_REQUEST",
        entity_id=waiver.id,
        new_state={"exception_id": exc.id, "justification": payload.justification},
        batch_id=exc.batch_id,
    )
    db.commit()
    return {"id": waiver.id, "status": waiver.status}


@router.post("/waivers/{waiver_id}/review")
def review_waiver(
    waiver_id: str,
    payload: WaiverReviewRequest,
    actor: ActorContext = Depends(require_roles(ActorRole.CONTROLLER)),
    db: Session = Depends(get_db),
):
    """Maker-Checker enforcement: requires CONTROLLER role and reviewer != requester."""
    waiver = db.get(WaiverRequest, waiver_id)
    if not waiver:
        raise HTTPException(status_code=404, detail="Waiver request not found.")
    if waiver.status != "PENDING":
        raise HTTPException(status_code=400, detail="Waiver request has already been reviewed.")
    if waiver.requested_by == actor.actor_id:
        raise HTTPException(
            status_code=403,
            detail="Maker-Checker Violation: The same user cannot request and approve/reject a waiver.",
        )

    exc = db.get(ControlException, waiver.exception_id)
    waiver.status = payload.decision
    waiver.reviewed_by = actor.actor_id
    waiver.reviewed_at = datetime.now(timezone.utc)
    waiver.review_notes = payload.review_notes

    if exc:
        if payload.decision == "APPROVED":
            exc.status = "WAIVED"
            exc.resolved_at = datetime.now(timezone.utc)
            exc.resolution_notes = f"Approved waiver {waiver.id} by {actor.actor_id}: {payload.review_notes}"
        else:
            exc.status = "INVESTIGATING"
        record_audit_event(
            db,
            workspace_id=exc.workspace_id,
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
            action=f"WAIVER_{payload.decision}",
            entity_type="WAIVER_REQUEST",
            entity_id=waiver.id,
            prior_state={"status": "PENDING"},
            new_state={"status": waiver.status, "reviewed_by": actor.actor_id},
            reason=payload.review_notes,
            batch_id=exc.batch_id,
        )
    db.commit()
    return {"id": waiver.id, "status": waiver.status, "reviewed_by": waiver.reviewed_by}


# ---------------------------------------------------------------------------
# Financial Variance Investigator & Data Lineage
# ---------------------------------------------------------------------------

@router.get("/investigate/batch/{batch_id}")
def investigate_batch(batch_id: str, db: Session = Depends(get_db)):
    batch = db.get(ReconciliationBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")

    custody_raw_file = db.execute(
        select(RawSourceFile).where(
            RawSourceFile.batch_id == batch.id,
            RawSourceFile.source_system == "custody_balances",
        )
    ).scalar_one_or_none()

    source_declared = float(custody_raw_file.declared_control_total) if custody_raw_file and custody_raw_file.declared_control_total else float(batch.custody_total_usd)
    staging_sum = float(
        db.execute(
            select(func.coalesce(func.sum(StgCustodyBalance.total_value_usd), 0)).where(
                StgCustodyBalance.batch_id == batch.id
            )
        ).scalar_one()
    )
    mart_custody = float(batch.custody_total_usd)
    mart_calculated = float(batch.calculated_total_usd)

    pub_rep = db.execute(
        select(PublishedReport)
        .where(PublishedReport.batch_id == batch.id, PublishedReport.publication_status == "OFFICIAL")
        .limit(1)
    ).scalar_one_or_none()

    # Account-level discrepancies
    discrepant_accounts = db.execute(
        select(MartAccountBalance)
        .where(
            MartAccountBalance.batch_id == batch.id,
            func.abs(MartAccountBalance.variance_usd) > Decimal("0.05"),
        )
        .order_by(desc(func.abs(MartAccountBalance.variance_usd)))
        .limit(25)
    ).scalars().all()

    # Advisor-level rollups
    advisor_rollups = db.execute(
        select(MartAdvisorSummary)
        .where(MartAdvisorSummary.batch_id == batch.id)
        .order_by(desc(MartAdvisorSummary.total_assets_usd))
    ).scalars().all()

    # Deterministic root-cause explanation
    failed_controls = db.execute(
        select(ControlExecutionResult).where(
            ControlExecutionResult.batch_id == batch.id,
            ControlExecutionResult.status.in_(["FAIL", "WARN"]),
        )
    ).scalars().all()

    first_boundary = "All stages agree"
    if abs(source_declared - staging_sum) > 1.0:
        first_boundary = "Source File -> Staging Normalization"
    elif abs(mart_calculated - mart_custody) > 1.0 or failed_controls:
        first_boundary = "Validated Staging -> Reporting Mart (Balance Roll-Forward / Duplicate)"

    root_cause = {
        "observation": f"Batch {batch.batch_code} status is {batch.status} with institutional variance ${float(batch.financial_variance_usd):,.2f}.",
        "first_discrepancy_boundary": first_boundary,
        "scope": f"{len(discrepant_accounts)} account(s) show roll-forward variance > $0.05; {len(failed_controls)} control(s) flagged.",
        "failed_controls": [
            {"rule_id": c.rule_id, "status": c.status, "evidence": c.evidence_summary}
            for c in failed_controls
        ],
        "confirmed_findings": [
            c.evidence_summary for c in failed_controls if c.status == "FAIL"
        ],
        "provisional_hypotheses": [
            c.evidence_summary for c in failed_controls if c.status == "WARN"
        ],
        "recommended_action": (
            "Remediate failing source records and re-run validation before requesting Controller sign-off."
            if failed_controls
            else "No variance detected; batch is eligible for official publication."
        ),
    }

    return {
        "batch_id": batch.id,
        "batch_code": batch.batch_code,
        "reporting_date": batch.reporting_date.isoformat(),
        "stage_comparison": [
            {"stage": "1. Source Manifest (Custody)", "total_usd": source_declared},
            {"stage": "2. Staging Normalized (Custody)", "total_usd": staging_sum},
            {"stage": "3. Reporting Mart (Custody Closing)", "total_usd": mart_custody},
            {"stage": "4. Reporting Mart (Calculated Roll-Forward)", "total_usd": mart_calculated},
            {"stage": "5. Published Official Report", "total_usd": float(pub_rep.total_assets_usd) if pub_rep else None},
        ],
        "discrepant_accounts": [
            {
                "account_external_id": m.account_external_id,
                "advisor_id": m.advisor_id,
                "opening_assets_usd": float(m.opening_assets_usd),
                "external_inflows_usd": float(m.external_inflows_usd),
                "external_outflows_usd": float(m.external_outflows_usd),
                "market_movement_usd": float(m.market_movement_usd),
                "fees_usd": float(m.fees_usd),
                "expected_closing_usd": float(m.expected_closing_usd),
                "custody_closing_usd": float(m.custody_closing_usd),
                "variance_usd": float(m.variance_usd),
            }
            for m in discrepant_accounts
        ],
        "advisor_rollups": [
            {
                "advisor_id": a.advisor_id,
                "advisor_name": a.advisor_name,
                "region": a.region,
                "account_count": a.account_count,
                "total_assets_usd": float(a.total_assets_usd),
                "net_flows_usd": float(a.net_flows_usd),
            }
            for a in advisor_rollups
        ],
        "root_cause": root_cause,
    }


@router.get("/investigate/lineage/{batch_id}/{account_external_id}")
def get_account_lineage(batch_id: str, account_external_id: str, db: Session = Depends(get_db)):
    mart = db.execute(
        select(MartAccountBalance).where(
            MartAccountBalance.batch_id == batch_id,
            MartAccountBalance.account_external_id == account_external_id,
        )
    ).scalar_one_or_none()
    if not mart:
        raise HTTPException(status_code=404, detail="Account not found in reporting mart for this batch.")

    stg_custody = db.execute(
        select(StgCustodyBalance).where(
            StgCustodyBalance.batch_id == batch_id,
            StgCustodyBalance.account_external_id == account_external_id,
        )
    ).scalar_one_or_none()

    stg_txns = db.execute(
        select(StgLedgerTransaction)
        .where(
            StgLedgerTransaction.batch_id == batch_id,
            StgLedgerTransaction.account_external_id == account_external_id,
        )
        .order_by(StgLedgerTransaction.trade_date.asc(), StgLedgerTransaction.row_number.asc())
    ).scalars().all()

    custody_file = db.get(RawSourceFile, stg_custody.raw_file_id) if stg_custody else None

    return {
        "account_external_id": account_external_id,
        "batch_id": batch_id,
        "mart_summary": {
            "opening_assets_usd": float(mart.opening_assets_usd),
            "external_inflows_usd": float(mart.external_inflows_usd),
            "external_outflows_usd": float(mart.external_outflows_usd),
            "market_movement_usd": float(mart.market_movement_usd),
            "fees_usd": float(mart.fees_usd),
            "expected_closing_usd": float(mart.expected_closing_usd),
            "custody_closing_usd": float(mart.custody_closing_usd),
            "variance_usd": float(mart.variance_usd),
        },
        "custody_source": {
            "raw_file_id": custody_file.id if custody_file else None,
            "file_name": custody_file.file_name if custody_file else None,
            "source_hash": custody_file.source_hash if custody_file else None,
            "row_number": stg_custody.row_number if stg_custody else None,
            "original_currency": stg_custody.original_currency if stg_custody else None,
            "fx_rate_applied": float(stg_custody.fx_rate_applied) if stg_custody and stg_custody.fx_rate_applied else None,
        },
        "transactions": [
            {
                "id": t.id,
                "row_number": t.row_number,
                "raw_file_id": t.raw_file_id,
                "external_txn_id": t.external_txn_id,
                "trade_date": t.trade_date.isoformat(),
                "txn_type": t.txn_type,
                "flow_classification": t.flow_classification,
                "net_amount_orig": float(t.net_amount_orig),
                "original_currency": t.original_currency,
                "net_amount_usd": float(t.net_amount_usd or 0),
                "description": t.description,
            }
            for t in stg_txns
        ],
    }


# ---------------------------------------------------------------------------
# Failure Lab (Signature Simulation Environment)
# ---------------------------------------------------------------------------

@router.get("/failure-lab/scenarios")
def list_failure_lab_scenarios():
    return {"scenarios": SCENARIO_CATALOG}


@router.get("/failure-lab/runs")
def list_failure_lab_runs(db: Session = Depends(get_db)):
    runs = db.execute(select(FailureLabRun).order_by(desc(FailureLabRun.created_at)).limit(30)).scalars().all()
    items = []
    for r in runs:
        base_b = db.get(ReconciliationBatch, r.baseline_batch_id)
        corr_b = db.get(ReconciliationBatch, r.corrupted_batch_id)
        fix_b = db.get(ReconciliationBatch, r.corrected_batch_id) if r.corrected_batch_id else None
        items.append(
            {
                "id": r.id,
                "scenario_key": r.scenario_key,
                "scenario_name": r.scenario_name,
                "seed": r.seed,
                "status": r.status,
                "expected_variance_usd": float(r.expected_variance_usd),
                "actual_variance_usd": float(r.actual_variance_usd),
                "injected_details": r.injected_details_json,
                "baseline_batch": {
                    "id": base_b.id,
                    "batch_code": base_b.batch_code,
                    "status": base_b.status,
                    "total_assets_usd": float(base_b.total_assets_usd),
                }
                if base_b
                else None,
                "corrupted_batch": {
                    "id": corr_b.id,
                    "batch_code": corr_b.batch_code,
                    "status": corr_b.status,
                    "financial_variance_usd": float(corr_b.financial_variance_usd),
                    "exceptions_count": corr_b.exceptions_count,
                }
                if corr_b
                else None,
                "corrected_batch": {
                    "id": fix_b.id,
                    "batch_code": fix_b.batch_code,
                    "status": fix_b.status,
                    "financial_variance_usd": float(fix_b.financial_variance_usd),
                    "exceptions_count": fix_b.exceptions_count,
                }
                if fix_b
                else None,
                "created_at": r.created_at.isoformat(),
            }
        )
    return {"items": items}


@router.post("/failure-lab/inject")
def inject_failure_scenario(
    payload: FailureLabInjectRequest,
    actor: ActorContext = Depends(require_roles(ActorRole.ANALYST, ActorRole.CONTROLLER)),
    db: Session = Depends(get_db),
):
    try:
        fl_run = run_failure_lab_injection(
            db,
            scenario_key=payload.scenario_key,
            seed=payload.seed,
            reporting_date=payload.reporting_date,
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    corr_b = db.get(ReconciliationBatch, fl_run.corrupted_batch_id)
    base_b = db.get(ReconciliationBatch, fl_run.baseline_batch_id)
    return {
        "id": fl_run.id,
        "scenario_key": fl_run.scenario_key,
        "scenario_name": fl_run.scenario_name,
        "status": fl_run.status,
        "expected_variance_usd": float(fl_run.expected_variance_usd),
        "actual_variance_usd": float(fl_run.actual_variance_usd),
        "injected_details": fl_run.injected_details_json,
        "baseline_batch_id": base_b.id if base_b else None,
        "baseline_status": base_b.status if base_b else None,
        "corrupted_batch_id": corr_b.id if corr_b else None,
        "corrupted_status": corr_b.status if corr_b else None,
        "corrupted_exceptions_count": corr_b.exceptions_count if corr_b else 0,
    }


@router.post("/failure-lab/runs/{run_id}/correct")
def correct_failure_run(
    run_id: str,
    actor: ActorContext = Depends(require_roles(ActorRole.ANALYST, ActorRole.CONTROLLER)),
    db: Session = Depends(get_db),
):
    fl_run = db.get(FailureLabRun, run_id)
    if not fl_run:
        raise HTTPException(status_code=404, detail="Failure Lab run not found.")
    updated = correct_and_rerun_failure_lab(
        db,
        fl_run=fl_run,
        actor_id=actor.actor_id,
        actor_role=actor.role.value,
    )
    fix_b = db.get(ReconciliationBatch, updated.corrected_batch_id)
    return {
        "id": updated.id,
        "status": updated.status,
        "corrected_batch_id": updated.corrected_batch_id,
        "corrected_status": fix_b.status if fix_b else None,
        "corrected_variance_usd": float(fix_b.financial_variance_usd) if fix_b else 0.0,
    }


# ---------------------------------------------------------------------------
# Reports & Publication Gate
# ---------------------------------------------------------------------------

@router.get("/reports")
def list_published_reports(
    workspace_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    q = select(PublishedReport)
    if workspace_id:
        q = q.where(PublishedReport.workspace_id == workspace_id)
    reps = db.execute(q.order_by(desc(PublishedReport.published_at)).limit(50)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "workspace_id": r.workspace_id,
                "batch_id": r.batch_id,
                "version_number": r.version_number,
                "reporting_date": r.reporting_date.isoformat(),
                "report_title": r.report_title,
                "publication_status": r.publication_status,
                "total_assets_usd": float(r.total_assets_usd),
                "net_external_flows_usd": float(r.net_external_flows_usd),
                "market_movement_usd": float(r.market_movement_usd),
                "financial_variance_usd": float(r.financial_variance_usd),
                "content_fingerprint": r.content_fingerprint,
                "published_by": r.published_by,
                "published_at": r.published_at.isoformat(),
                "notes": r.notes,
            }
            for r in reps
        ]
    }


@router.post("/reports/publish")
def publish_report(
    payload: PublishReportRequest,
    actor: ActorContext = Depends(require_roles(ActorRole.CONTROLLER, ActorRole.ANALYST)),
    db: Session = Depends(get_db),
):
    batch = db.get(ReconciliationBatch, payload.batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")

    # Official report publication requires CONTROLLER role
    if not payload.diagnostic_only and actor.role != ActorRole.CONTROLLER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Official management report publication requires CONTROLLER authorization.",
        )

    try:
        report = publish_report_for_batch(
            db,
            batch=batch,
            actor_id=actor.actor_id,
            actor_role=actor.role.value,
            diagnostic_only=payload.diagnostic_only,
            notes=payload.notes,
        )
        db.commit()
    except PublicationBlockedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "PUBLICATION_BLOCKED",
                "message": exc.message,
                "blocking_rules": exc.blocking_rules,
            },
        )

    return {
        "id": report.id,
        "batch_id": report.batch_id,
        "version_number": report.version_number,
        "publication_status": report.publication_status,
        "content_fingerprint": report.content_fingerprint,
        "published_by": report.published_by,
        "published_at": report.published_at.isoformat(),
    }


@router.get("/reports/{report_id}/download")
def download_report_xlsx(report_id: str, db: Session = Depends(get_db)):
    report = db.get(PublishedReport, report_id)
    if not report or not report.xlsx_artifact_bytes:
        raise HTTPException(status_code=404, detail="Report artifact not found.")
    filename = f"VelaTrace_{report.publication_status}_{report.reporting_date.isoformat()}_v{report.version_number}.xlsx"
    return Response(
        content=report.xlsx_artifact_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Audit Trail & Hash Chain Verification
# ---------------------------------------------------------------------------

@router.get("/audit")
def list_audit_events(
    workspace_id: str | None = Query(default=None),
    batch_id: str | None = Query(default=None),
    limit: int = Query(default=100, le=250),
    db: Session = Depends(get_db),
):
    q = select(AuditEvent)
    if workspace_id:
        q = q.where(AuditEvent.workspace_id == workspace_id)
    if batch_id:
        q = q.where(AuditEvent.batch_id == batch_id)
    events = db.execute(q.order_by(desc(AuditEvent.timestamp), desc(AuditEvent.sequence_num)).limit(limit)).scalars().all()
    return {
        "items": [
            {
                "id": e.id,
                "sequence_num": e.sequence_num,
                "workspace_id": e.workspace_id,
                "actor_id": e.actor_id,
                "actor_role": e.actor_role,
                "timestamp": e.timestamp.isoformat(),
                "action": e.action,
                "entity_type": e.entity_type,
                "entity_id": e.entity_id,
                "prior_state": e.prior_state_json,
                "new_state": e.new_state_json,
                "reason": e.reason,
                "batch_id": e.batch_id,
                "correlation_id": e.correlation_id,
                "prev_hash": e.prev_hash,
                "event_hash": e.event_hash,
            }
            for e in events
        ]
    }


@router.post("/audit/verify")
def verify_audit_endpoint(
    workspace_id: str = Query(default=settings.demo_workspace_id),
    db: Session = Depends(get_db),
):
    return verify_audit_chain(db, workspace_id)


# ---------------------------------------------------------------------------
# Operations Analytics (Genuinely Measured Metrics)
# ---------------------------------------------------------------------------

@router.get("/analytics/operations")
def get_operations_analytics(
    workspace_id: str = Query(default=settings.demo_workspace_id),
    db: Session = Depends(get_db),
):
    prod_batches = db.execute(
        select(ReconciliationBatch).where(ReconciliationBatch.workspace_id == workspace_id)
    ).scalars().all()

    total_runs = len(prod_batches)
    passed_runs = sum(1 for b in prod_batches if b.status in ("PASS", "PASS_WITH_WARNINGS"))
    blocked_runs = sum(1 for b in prod_batches if b.status == "BLOCKED")
    recon_rate = round((passed_runs / total_runs) * 100, 1) if total_runs > 0 else 0.0

    # Control failure frequency
    ctl_failures = db.execute(
        select(ControlExecutionResult.rule_id, func.count(ControlExecutionResult.id))
        .where(ControlExecutionResult.status.in_(["FAIL", "WARN"]))
        .group_by(ControlExecutionResult.rule_id)
        .order_by(desc(func.count(ControlExecutionResult.id)))
    ).all()

    # Exception distribution & SLA breaches
    all_exc = db.execute(
        select(ControlException).where(ControlException.workspace_id == workspace_id)
    ).scalars().all()
    now = datetime.now(timezone.utc)
    sla_breaches = sum(
        1
        for e in all_exc
        if e.status in ("OPEN", "INVESTIGATING", "WAIVER_REQUESTED") and e.sla_due_at < now
    )
    resolved_durations = [
        (e.resolved_at - e.created_at).total_seconds() / 3600
        for e in all_exc
        if e.resolved_at is not None
    ]
    mttr_hours = round(sum(resolved_durations) / len(resolved_durations), 2) if resolved_durations else None

    # Failure Lab ground-truth detection metrics (separate from operational metrics)
    fl_runs = db.execute(select(FailureLabRun)).scalars().all()
    fl_total = len(fl_runs)
    fl_detected = sum(1 for f in fl_runs if f.status in ("BLOCKED_VERIFIED", "CORRECTED_PASSED"))

    active_rules_count = db.execute(
        select(func.count(ControlRule.id)).where(ControlRule.is_active.is_(True))
    ).scalar_one()

    return {
        "operational_metrics": {
            "total_runs": total_runs,
            "passed_runs": passed_runs,
            "blocked_runs": blocked_runs,
            "reconciliation_success_rate_pct": recon_rate,
            "total_exceptions": len(all_exc),
            "sla_breaches": sla_breaches,
            "mean_time_to_resolve_hours": mttr_hours,
            "active_control_rules": active_rules_count,
        },
        "control_failure_frequency": [
            {"rule_id": r[0], "failure_count": r[1]} for r in ctl_failures
        ],
        "failure_lab_metrics": {
            "known_injected_failures": fl_total,
            "successfully_detected_failures": fl_detected,
            "missed_injected_failures": fl_total - fl_detected,
        },
        "recommendations": [
            {
                "id": "REC-01",
                "finding": f"{blocked_runs} historical publishing block(s) prevented unverified management reporting.",
                "action": "Enforce pre-cut-off schema and duplicate transaction checks at the source ingestion boundary.",
            },
            {
                "id": "REC-02",
                "finding": f"Active library enforces {active_rules_count} registered control rules across 7 control families.",
                "action": "Review recurring warning-level exceptions (CTL-UNIQ-002, CTL-RSN-003) weekly with Trade Operations.",
            },
        ],
    }
