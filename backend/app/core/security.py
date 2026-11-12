from enum import Enum
from dataclasses import dataclass
from fastapi import Header, HTTPException, status


class ActorRole(str, Enum):
    ANALYST = "ANALYST"
    CONTROLLER = "CONTROLLER"
    AUDITOR = "AUDITOR"


@dataclass(frozen=True)
class ActorContext:
    actor_id: str
    role: ActorRole
    display_name: str


DEFAULT_ACTORS: dict[str, ActorContext] = {
    "analyst_maya": ActorContext("analyst_maya", ActorRole.ANALYST, "Maya Lin (Operations Analyst)"),
    "controller_marcus": ActorContext("controller_marcus", ActorRole.CONTROLLER, "Marcus Vance (Financial Controller)"),
    "auditor_elena": ActorContext("auditor_elena", ActorRole.AUDITOR, "Elena Rostova (Internal Auditor)"),
}


def get_current_actor(
    x_actor_id: str | None = Header(default="analyst_maya", alias="X-Actor-Id"),
    x_actor_role: str | None = Header(default=None, alias="X-Actor-Role"),
) -> ActorContext:
    actor_id = (x_actor_id or "analyst_maya").strip()
    if actor_id in DEFAULT_ACTORS:
        base = DEFAULT_ACTORS[actor_id]
        if x_actor_role:
            try:
                requested_role = ActorRole(x_actor_role.upper())
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Invalid role '{x_actor_role}'.",
                )
            # Prevent privilege escalation on known actor IDs
            if requested_role != base.role:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Actor '{actor_id}' is not authorized to assume role '{requested_role.value}'.",
                )
        return base

    # Unknown custom actor defaults strictly to ANALYST unless explicitly rejected
    role = ActorRole.ANALYST
    if x_actor_role:
        try:
            role = ActorRole(x_actor_role.upper())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Invalid role '{x_actor_role}'.",
            )
    return ActorContext(actor_id=actor_id, role=role, display_name=actor_id)


def require_roles(*allowed_roles: ActorRole):
    def _dependency(
        x_actor_id: str | None = Header(default="analyst_maya", alias="X-Actor-Id"),
        x_actor_role: str | None = Header(default=None, alias="X-Actor-Role"),
    ) -> ActorContext:
        actor = get_current_actor(x_actor_id=x_actor_id, x_actor_role=x_actor_role)
        if actor.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Role '{actor.role.value}' is not authorized for this action. "
                    f"Required: {[r.value for r in allowed_roles]}."
                ),
            )
        return actor

    return _dependency
