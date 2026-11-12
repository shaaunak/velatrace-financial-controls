import hashlib
import json
import uuid
from datetime import datetime, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models.entities import AuditEvent

GENESIS_HASH = "0" * 64


def _canonical_json(data: dict | None) -> str:
    if data is None:
        return "null"
    return json.dumps(data, sort_keys=True, separators=(",", ":"), default=str)


def compute_event_hash(
    prev_hash: str,
    sequence_num: int,
    workspace_id: str,
    actor_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    timestamp_iso: str,
    prior_state: dict | None,
    new_state: dict | None,
    reason: str | None,
) -> str:
    payload = "|".join(
        [
            prev_hash,
            str(sequence_num),
            workspace_id,
            actor_id,
            action,
            entity_type,
            entity_id,
            timestamp_iso,
            _canonical_json(prior_state),
            _canonical_json(new_state),
            reason or "",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def record_audit_event(
    db: Session,
    *,
    workspace_id: str,
    actor_id: str,
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: str,
    prior_state: dict | None = None,
    new_state: dict | None = None,
    reason: str | None = None,
    batch_id: str | None = None,
    correlation_id: str | None = None,
) -> AuditEvent:
    last_event = db.execute(
        select(AuditEvent)
        .where(AuditEvent.workspace_id == workspace_id)
        .order_by(AuditEvent.sequence_num.desc())
        .limit(1)
    ).scalar_one_or_none()

    seq = (last_event.sequence_num + 1) if last_event else 1
    prev_hash = last_event.event_hash if last_event else GENESIS_HASH
    ts = datetime.now(timezone.utc).replace(microsecond=0)
    ts_iso = ts.isoformat()

    event_hash = compute_event_hash(
        prev_hash=prev_hash,
        sequence_num=seq,
        workspace_id=workspace_id,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        timestamp_iso=ts_iso,
        prior_state=prior_state,
        new_state=new_state,
        reason=reason,
    )

    event = AuditEvent(
        id=f"aud_{uuid.uuid4().hex[:16]}",
        sequence_num=seq,
        workspace_id=workspace_id,
        actor_id=actor_id,
        actor_role=actor_role,
        timestamp=ts,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        prior_state_json=prior_state,
        new_state_json=new_state,
        reason=reason,
        batch_id=batch_id,
        correlation_id=correlation_id or f"corr_{uuid.uuid4().hex[:12]}",
        prev_hash=prev_hash,
        event_hash=event_hash,
    )
    db.add(event)
    db.flush()
    return event


def verify_audit_chain(db: Session, workspace_id: str) -> dict:
    events = db.execute(
        select(AuditEvent)
        .where(AuditEvent.workspace_id == workspace_id)
        .order_by(AuditEvent.sequence_num.asc())
    ).scalars().all()

    if not events:
        return {
            "workspace_id": workspace_id,
            "total_events": 0,
            "valid": True,
            "broken_at_sequence": None,
            "details": "No audit events recorded yet.",
        }

    expected_prev = GENESIS_HASH
    expected_seq = 1

    for ev in events:
        if ev.sequence_num != expected_seq:
            return {
                "workspace_id": workspace_id,
                "total_events": len(events),
                "valid": False,
                "broken_at_sequence": ev.sequence_num,
                "details": f"Sequence gap detected: expected {expected_seq}, got {ev.sequence_num}.",
            }
        if ev.prev_hash != expected_prev:
            return {
                "workspace_id": workspace_id,
                "total_events": len(events),
                "valid": False,
                "broken_at_sequence": ev.sequence_num,
                "details": f"Previous hash mismatch at sequence {ev.sequence_num}.",
            }
        ts_utc = ev.timestamp.astimezone(timezone.utc).replace(microsecond=0)
        recomputed = compute_event_hash(
            prev_hash=ev.prev_hash,
            sequence_num=ev.sequence_num,
            workspace_id=ev.workspace_id,
            actor_id=ev.actor_id,
            action=ev.action,
            entity_type=ev.entity_type,
            entity_id=ev.entity_id,
            timestamp_iso=ts_utc.isoformat(),
            prior_state=ev.prior_state_json,
            new_state=ev.new_state_json,
            reason=ev.reason,
        )
        if recomputed != ev.event_hash:
            return {
                "workspace_id": workspace_id,
                "total_events": len(events),
                "valid": False,
                "broken_at_sequence": ev.sequence_num,
                "details": f"Event hash mismatch at sequence {ev.sequence_num} (id={ev.id}).",
            }
        expected_prev = ev.event_hash
        expected_seq += 1

    return {
        "workspace_id": workspace_id,
        "total_events": len(events),
        "valid": True,
        "broken_at_sequence": None,
        "latest_hash": expected_prev,
        "details": "All audit events verified against SHA-256 hash chain.",
    }
