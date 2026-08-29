import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.admin_roles import has_admin_role
from app.services.event_permissions import is_group_admin as _is_group_admin

router = APIRouter(prefix="/team-events", tags=["team-events"])

SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


async def _can_manage_team_event(db: AsyncSession, team_event_id: UUID, user_id: UUID) -> bool:
    if await has_admin_role(db, user_id, "event_manager"):
        return True
    row = await db.execute(
        text("SELECT 1 FROM team_event_organizers WHERE team_event_id = :id AND user_id = :user_id"),
        {"id": str(team_event_id), "user_id": str(user_id)},
    )
    return row.fetchone() is not None


async def _get_event_or_404(db: AsyncSession, team_event_id: UUID):
    result = await db.execute(
        text("""
            SELECT id, campaign_id, slug, title, description, status, starts_at, ends_at,
                   submission_mode, requires_photo, created_by
            FROM team_events WHERE id = :id
        """),
        {"id": str(team_event_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return row


class TeamInput(BaseModel):
    name: str
    color: str | None = None


class CreateTeamEventRequest(BaseModel):
    requesting_user_id: UUID
    campaign_id: UUID | None = None
    slug: str
    title: str
    description: str | None = None
    starts_at: datetime
    ends_at: datetime | None = None
    submission_mode: str = "manual_opt_in"
    requires_photo: bool = True
    teams: list[TeamInput]

    @field_validator("slug")
    @classmethod
    def _valid_slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("slug must be lowercase alphanumeric with single hyphens")
        return v

    @field_validator("submission_mode")
    @classmethod
    def _valid_mode(cls, v: str) -> str:
        if v not in ("automatic", "manual_opt_in"):
            raise ValueError("submission_mode must be 'automatic' or 'manual_opt_in'")
        return v

    @field_validator("teams")
    @classmethod
    def _at_least_two_teams(cls, v: list[TeamInput]) -> list[TeamInput]:
        if len(v) < 2:
            raise ValueError("An event needs at least two teams")
        return v


class PatchTeamEventRequest(BaseModel):
    requesting_user_id: UUID
    title: str | None = None
    description: str | None = None
    status: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    submission_mode: str | None = None
    requires_photo: bool | None = None

    @field_validator("status")
    @classmethod
    def _valid_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ("draft", "active", "completed", "cancelled"):
            raise ValueError("Invalid status")
        return v


class AddTeamRequest(BaseModel):
    requesting_user_id: UUID
    name: str
    color: str | None = None


class JoinEventRequest(BaseModel):
    team_id: UUID
    participant_type: str
    user_id: UUID | None = None
    group_id: UUID | None = None
    requesting_user_id: UUID

    @model_validator(mode="after")
    def _one_of(self):
        if self.participant_type == "user":
            if not self.user_id or self.group_id:
                raise ValueError("participant_type 'user' requires user_id and no group_id")
        elif self.participant_type == "group":
            if not self.group_id or self.user_id:
                raise ValueError("participant_type 'group' requires group_id and no user_id")
        else:
            raise ValueError("participant_type must be 'user' or 'group'")
        return self


class OrganizerRequest(BaseModel):
    requesting_user_id: UUID
    user_id: UUID


class PatchSubmissionRequest(BaseModel):
    requesting_user_id: UUID
    small_bags: int | None = None
    large_bags: int | None = None
    pounds: float | None = None
    value: float | None = None
    review_status: str | None = None

    @field_validator("review_status")
    @classmethod
    def _valid_review_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ("pending", "approved", "flagged"):
            raise ValueError("Invalid review_status")
        return v


@router.post("")
async def create_team_event(payload: CreateTeamEventRequest, db: AsyncSession = Depends(get_db)):
    if not await has_admin_role(db, payload.requesting_user_id, "event_manager"):
        raise HTTPException(status_code=403, detail="Only an event manager can create team events")

    existing = await db.execute(text("SELECT 1 FROM team_events WHERE slug = :slug"), {"slug": payload.slug})
    if existing.fetchone():
        raise HTTPException(status_code=409, detail="An event with this slug already exists")

    result = await db.execute(
        text("""
            INSERT INTO team_events
                (campaign_id, slug, title, description, starts_at, ends_at,
                 submission_mode, requires_photo, created_by)
            VALUES
                (:campaign_id, :slug, :title, :description, :starts_at, :ends_at,
                 :submission_mode, :requires_photo, :created_by)
            RETURNING id
        """),
        {
            "campaign_id": str(payload.campaign_id) if payload.campaign_id else None,
            "slug": payload.slug,
            "title": payload.title,
            "description": payload.description,
            "starts_at": payload.starts_at,
            "ends_at": payload.ends_at,
            "submission_mode": payload.submission_mode,
            "requires_photo": payload.requires_photo,
            "created_by": str(payload.requesting_user_id),
        },
    )
    event_id = result.fetchone()[0]

    team_ids = []
    for team in payload.teams:
        team_result = await db.execute(
            text("""
                INSERT INTO team_event_teams (team_event_id, name, color)
                VALUES (:team_event_id, :name, :color)
                RETURNING id
            """),
            {"team_event_id": str(event_id), "name": team.name, "color": team.color},
        )
        team_ids.append(str(team_result.fetchone()[0]))

    await db.commit()
    return {"id": str(event_id), "slug": payload.slug, "team_ids": team_ids}


@router.get("")
async def list_team_events(requesting_user_id: UUID | None = None, db: AsyncSession = Depends(get_db)):
    is_manager = requesting_user_id is not None and await has_admin_role(db, requesting_user_id, "event_manager")
    if is_manager:
        result = await db.execute(text("SELECT id, slug, title, status, starts_at, ends_at FROM team_events ORDER BY starts_at DESC"))
    else:
        result = await db.execute(
            text("SELECT id, slug, title, status, starts_at, ends_at FROM team_events WHERE status != 'draft' ORDER BY starts_at DESC")
        )
    return [
        {"id": str(r.id), "slug": r.slug, "title": r.title, "status": r.status, "starts_at": r.starts_at, "ends_at": r.ends_at}
        for r in result.fetchall()
    ]


@router.get("/{team_event_id}")
async def get_team_event(team_event_id: UUID, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, team_event_id)
    teams_result = await db.execute(
        text("SELECT id, name, color, geo_unit_id FROM team_event_teams WHERE team_event_id = :id ORDER BY name"),
        {"id": str(team_event_id)},
    )
    teams = [
        {"id": str(t.id), "name": t.name, "color": t.color, "has_boundary": t.geo_unit_id is not None}
        for t in teams_result.fetchall()
    ]
    return {
        "id": str(event.id),
        "campaign_id": str(event.campaign_id) if event.campaign_id else None,
        "slug": event.slug,
        "title": event.title,
        "description": event.description,
        "status": event.status,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "submission_mode": event.submission_mode,
        "requires_photo": event.requires_photo,
        "teams": teams,
    }


@router.patch("/{team_event_id}")
async def patch_team_event(team_event_id: UUID, payload: PatchTeamEventRequest, db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(db, team_event_id)
    if not await _can_manage_team_event(db, team_event_id, payload.requesting_user_id):
        raise HTTPException(status_code=403, detail="Not authorized to manage this event")

    fields = payload.model_dump(exclude={"requesting_user_id"}, exclude_none=True)
    if not fields:
        return {"updated": False}

    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    await db.execute(
        text(f"UPDATE team_events SET {set_clause}, updated_at = now() WHERE id = :id"),
        {**fields, "id": str(team_event_id)},
    )
    await db.commit()
    return {"updated": True}


@router.post("/{team_event_id}/teams")
async def add_team(team_event_id: UUID, payload: AddTeamRequest, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, team_event_id)
    if not await _can_manage_team_event(db, team_event_id, payload.requesting_user_id):
        raise HTTPException(status_code=403, detail="Not authorized to manage this event")
    if event.status != "draft":
        raise HTTPException(status_code=400, detail="Teams can only be added while the event is in draft")

    result = await db.execute(
        text("""
            INSERT INTO team_event_teams (team_event_id, name, color)
            VALUES (:team_event_id, :name, :color)
            RETURNING id
        """),
        {"team_event_id": str(team_event_id), "name": payload.name, "color": payload.color},
    )
    team_id = result.fetchone()[0]
    await db.commit()
    return {"id": str(team_id)}


@router.post("/{team_event_id}/join")
async def join_event(team_event_id: UUID, payload: JoinEventRequest, db: AsyncSession = Depends(get_db)):
    event = await _get_event_or_404(db, team_event_id)
    if event.status not in ("draft", "active"):
        raise HTTPException(status_code=400, detail="This event is no longer accepting participants")

    team_row = await db.execute(
        text("SELECT 1 FROM team_event_teams WHERE id = :team_id AND team_event_id = :event_id"),
        {"team_id": str(payload.team_id), "event_id": str(team_event_id)},
    )
    if not team_row.fetchone():
        raise HTTPException(status_code=404, detail="Team not found for this event")

    if payload.participant_type == "user":
        if payload.user_id != payload.requesting_user_id:
            raise HTTPException(status_code=403, detail="Users can only opt themselves in")
        await db.execute(
            text("""
                INSERT INTO team_event_participants (team_event_id, team_id, participant_type, user_id)
                VALUES (:team_event_id, :team_id, 'user', :user_id)
                ON CONFLICT (team_event_id, user_id) WHERE user_id IS NOT NULL
                DO UPDATE SET team_id = EXCLUDED.team_id
            """),
            {"team_event_id": str(team_event_id), "team_id": str(payload.team_id), "user_id": str(payload.user_id)},
        )
    else:
        if not await _is_group_admin(db, payload.group_id, payload.requesting_user_id):
            raise HTTPException(status_code=403, detail="Only a group admin can opt the group in")
        await db.execute(
            text("""
                INSERT INTO team_event_participants (team_event_id, team_id, participant_type, group_id)
                VALUES (:team_event_id, :team_id, 'group', :group_id)
                ON CONFLICT (team_event_id, group_id) WHERE group_id IS NOT NULL
                DO UPDATE SET team_id = EXCLUDED.team_id
            """),
            {"team_event_id": str(team_event_id), "team_id": str(payload.team_id), "group_id": str(payload.group_id)},
        )
    await db.commit()
    return {"joined": True, "team_id": str(payload.team_id)}


@router.post("/{team_event_id}/organizers")
async def add_organizer(team_event_id: UUID, payload: OrganizerRequest, db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(db, team_event_id)
    if not await has_admin_role(db, payload.requesting_user_id, "event_manager"):
        raise HTTPException(status_code=403, detail="Only an event manager can delegate organizers")

    await db.execute(
        text("""
            INSERT INTO team_event_organizers (team_event_id, user_id, granted_by)
            VALUES (:team_event_id, :user_id, :granted_by)
            ON CONFLICT (team_event_id, user_id) DO NOTHING
        """),
        {"team_event_id": str(team_event_id), "user_id": str(payload.user_id), "granted_by": str(payload.requesting_user_id)},
    )
    await db.commit()
    return {"added": True}


@router.delete("/{team_event_id}/organizers/{user_id}")
async def remove_organizer(team_event_id: UUID, user_id: UUID, requesting_user_id: UUID, db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(db, team_event_id)
    if not await has_admin_role(db, requesting_user_id, "event_manager"):
        raise HTTPException(status_code=403, detail="Only an event manager can remove organizers")
    await db.execute(
        text("DELETE FROM team_event_organizers WHERE team_event_id = :team_event_id AND user_id = :user_id"),
        {"team_event_id": str(team_event_id), "user_id": str(user_id)},
    )
    await db.commit()
    return {"removed": True}


@router.get("/{team_event_id}/scoreboard")
async def get_scoreboard(team_event_id: UUID, db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(db, team_event_id)
    result = await db.execute(
        text("""
            SELECT t.id AS team_id, t.name, t.color,
                   COALESCE(SUM(c.value), 0) AS total_value,
                   COUNT(c.id) AS submission_count
            FROM team_event_teams t
            LEFT JOIN contributions c
                ON c.team_event_team_id = t.id
                AND c.team_event_id = t.team_event_id
                AND (c.review_status IS DISTINCT FROM 'flagged')
            WHERE t.team_event_id = :id
            GROUP BY t.id, t.name, t.color
            ORDER BY total_value DESC
        """),
        {"id": str(team_event_id)},
    )
    return [
        {"team_id": str(r.team_id), "name": r.name, "color": r.color, "total_value": float(r.total_value), "submission_count": r.submission_count}
        for r in result.fetchall()
    ]


@router.get("/{team_event_id}/submissions")
async def list_submissions(team_event_id: UUID, requesting_user_id: UUID, db: AsyncSession = Depends(get_db)):
    await _get_event_or_404(db, team_event_id)
    if not await _can_manage_team_event(db, team_event_id, requesting_user_id):
        raise HTTPException(status_code=403, detail="Not authorized to review this event's submissions")

    result = await db.execute(
        text("""
            SELECT c.id, c.user_id, c.team_event_team_id, c.contribution_type, c.value,
                   cl.metrics_small_bags, cl.metrics_large_bags, cl.metrics_pounds,
                   c.photo_url, c.review_status, c.submitted_at
            FROM contributions c
            LEFT JOIN cleanups cl ON cl.id = c.cleanup_id
            WHERE c.team_event_id = :id
            ORDER BY c.submitted_at DESC
        """),
        {"id": str(team_event_id)},
    )
    return [
        {
            "id": str(r.id),
            "user_id": str(r.user_id) if r.user_id else None,
            "team_id": str(r.team_event_team_id) if r.team_event_team_id else None,
            "contribution_type": r.contribution_type,
            "value": float(r.value) if r.value is not None else None,
            "small_bags": r.metrics_small_bags,
            "large_bags": r.metrics_large_bags,
            "pounds": float(r.metrics_pounds) if r.metrics_pounds is not None else None,
            "photo_url": r.photo_url,
            "review_status": r.review_status,
            "created_at": r.submitted_at,
        }
        for r in result.fetchall()
    ]


@router.patch("/{team_event_id}/submissions/{contribution_id}")
async def patch_submission(
    team_event_id: UUID, contribution_id: UUID, payload: PatchSubmissionRequest, db: AsyncSession = Depends(get_db)
):
    await _get_event_or_404(db, team_event_id)
    if not await _can_manage_team_event(db, team_event_id, payload.requesting_user_id):
        raise HTTPException(status_code=403, detail="Not authorized to review this event's submissions")

    prior_result = await db.execute(
        text("""
            SELECT c.cleanup_id, cl.metrics_small_bags AS small_bags, cl.metrics_large_bags AS large_bags,
                   cl.metrics_pounds AS pounds, c.value, c.review_status
            FROM contributions c
            LEFT JOIN cleanups cl ON cl.id = c.cleanup_id
            WHERE c.id = :id AND c.team_event_id = :team_event_id
        """),
        {"id": str(contribution_id), "team_event_id": str(team_event_id)},
    )
    prior = prior_result.fetchone()
    if not prior:
        raise HTTPException(status_code=404, detail="Submission not found for this event")

    fields = payload.model_dump(exclude={"requesting_user_id"}, exclude_none=True)
    if not fields:
        return {"updated": False}

    contribution_fields = {k: v for k, v in fields.items() if k in ("value", "review_status")}
    cleanup_fields = {
        {"small_bags": "metrics_small_bags", "large_bags": "metrics_large_bags", "pounds": "metrics_pounds"}[k]: v
        for k, v in fields.items()
        if k in ("small_bags", "large_bags", "pounds")
    }

    if contribution_fields:
        set_clause = ", ".join(f"{k} = :{k}" for k in contribution_fields)
        await db.execute(
            text(f"UPDATE contributions SET {set_clause} WHERE id = :id"),
            {**contribution_fields, "id": str(contribution_id)},
        )
    if cleanup_fields:
        if not prior.cleanup_id:
            raise HTTPException(status_code=400, detail="This submission has no underlying cleanup to correct")
        set_clause = ", ".join(f"{k} = :{k}" for k in cleanup_fields)
        await db.execute(
            text(f"UPDATE cleanups SET {set_clause} WHERE id = :id"),
            {**cleanup_fields, "id": str(prior.cleanup_id)},
        )
    await db.execute(
        text("""
            INSERT INTO team_event_submission_edits
                (contribution_id, edited_by,
                 previous_small_bags, previous_large_bags, previous_pounds, previous_value, previous_review_status,
                 new_small_bags, new_large_bags, new_pounds, new_value, new_review_status)
            VALUES
                (:contribution_id, :edited_by,
                 :prev_small_bags, :prev_large_bags, :prev_pounds, :prev_value, :prev_review_status,
                 :new_small_bags, :new_large_bags, :new_pounds, :new_value, :new_review_status)
        """),
        {
            "contribution_id": str(contribution_id),
            "edited_by": str(payload.requesting_user_id),
            "prev_small_bags": prior.small_bags,
            "prev_large_bags": prior.large_bags,
            "prev_pounds": prior.pounds,
            "prev_value": prior.value,
            "prev_review_status": prior.review_status,
            "new_small_bags": fields.get("small_bags", prior.small_bags),
            "new_large_bags": fields.get("large_bags", prior.large_bags),
            "new_pounds": fields.get("pounds", prior.pounds),
            "new_value": fields.get("value", prior.value),
            "new_review_status": fields.get("review_status", prior.review_status),
        },
    )
    await db.commit()
    return {"updated": True}
