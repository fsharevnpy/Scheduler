from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER, get_current_user, require_roles, require_teacher_identity
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import TeacherScoreEventCreate


router = APIRouter()
BASE_SCORE = 100
MIN_SCORE = 0
MAX_SCORE = 110


def normalize_score_month(value: date | None) -> date:
    today = value or date.today()
    return today.replace(day=1)


def clamp_score(value: int) -> int:
    return max(MIN_SCORE, min(MAX_SCORE, value))


def apply_score_events(deltas: list[int]) -> int:
    score = BASE_SCORE
    for delta in deltas:
        score = clamp_score(score + delta)
    return score


def ensure_teacher_score_table(db: Session) -> None:
    db.execute(
        text("""
            CREATE TABLE IF NOT EXISTS teacher_score_events (
                event_id UUID PRIMARY KEY,
                teacher_id VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id) ON DELETE CASCADE,
                score_month DATE NOT NULL,
                delta INT NOT NULL CHECK (delta <> 0),
                reason TEXT NOT NULL,
                evidence_text TEXT NOT NULL,
                evidence_url TEXT,
                created_by VARCHAR(7) NOT NULL REFERENCES users(user_code) ON DELETE RESTRICT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                teacher_read_at TIMESTAMPTZ NULL,
                CHECK (score_month = date_trunc('month', score_month)::date)
            )
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_teacher_score_events_teacher_month
                ON teacher_score_events(teacher_id, score_month, created_at DESC)
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_teacher_score_events_unread
                ON teacher_score_events(teacher_id, teacher_read_at)
                WHERE teacher_read_at IS NULL
        """)
    )
    db.commit()


def get_teacher_or_404(teacher_id: str, db: Session):
    teacher = db.execute(
        text("""
            SELECT teacher_id, name
            FROM teachers
            WHERE teacher_id = :teacher_id
        """),
        {"teacher_id": teacher_id},
    ).mappings().first()

    if not teacher:
        raise HTTPException(status_code=404, detail="teacher not found")

    return teacher


def require_score_access(teacher_id: str, current_user: CurrentUser) -> None:
    if current_user.role in {ROLE_DEVELOPER, ROLE_MANAGER}:
        return

    teacher_user = require_teacher_identity(current_user)
    if teacher_user.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="teachers can only view their own score")


@router.get("/teacher-scores")
def get_teacher_scores(
    month: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    ensure_teacher_score_table(db)
    score_month = normalize_score_month(month)

    teacher_params = {}
    teacher_query = """
        SELECT teacher_id, name
        FROM teachers
    """

    if current_user.role == ROLE_TEACHER:
        teacher_user = require_teacher_identity(current_user)
        teacher_query += " WHERE teacher_id = :teacher_id"
        teacher_params["teacher_id"] = teacher_user.teacher_id
    elif current_user.role not in {ROLE_DEVELOPER, ROLE_MANAGER}:
        raise HTTPException(status_code=403, detail="forbidden")

    teacher_query += " ORDER BY teacher_id"
    teachers = db.execute(text(teacher_query), teacher_params).mappings().all()
    teacher_ids = [teacher["teacher_id"] for teacher in teachers]

    events_by_teacher_id = {teacher_id: [] for teacher_id in teacher_ids}
    if teacher_ids:
        event_params = {
            "score_month": score_month,
            **{f"teacher_{index}": teacher_id for index, teacher_id in enumerate(teacher_ids)},
        }
        teacher_placeholders = ", ".join(f":teacher_{index}" for index in range(len(teacher_ids)))
        events = db.execute(
            text(f"""
                SELECT teacher_id, delta, teacher_read_at
                FROM teacher_score_events
                WHERE score_month = :score_month
                  AND teacher_id IN ({teacher_placeholders})
                ORDER BY created_at ASC, event_id ASC
            """),
            event_params,
        ).mappings().all()

        for event in events:
            events_by_teacher_id[event["teacher_id"]].append(event)

    return [
        {
            **dict(teacher),
            "score_month": score_month,
            "base_score": BASE_SCORE,
            "score": apply_score_events([int(event["delta"]) for event in events_by_teacher_id[teacher["teacher_id"]]]),
            "min_score": MIN_SCORE,
            "max_score": MAX_SCORE,
            "event_count": len(events_by_teacher_id[teacher["teacher_id"]]),
            "unread_count": sum(1 for event in events_by_teacher_id[teacher["teacher_id"]] if event["teacher_read_at"] is None),
        }
        for teacher in teachers
    ]


@router.get("/teachers/{teacher_id}/score-events")
def get_teacher_score_events(
    teacher_id: str,
    month: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    ensure_teacher_score_table(db)
    require_score_access(teacher_id, current_user)
    get_teacher_or_404(teacher_id, db)

    score_month = normalize_score_month(month)
    rows = db.execute(
        text("""
            SELECT
                e.event_id,
                e.teacher_id,
                t.name AS teacher_name,
                e.score_month,
                e.delta,
                e.reason,
                e.evidence_text,
                e.evidence_url,
                e.created_by,
                u.display_name AS created_by_name,
                e.created_at,
                e.teacher_read_at
            FROM teacher_score_events e
            JOIN teachers t ON t.teacher_id = e.teacher_id
            JOIN users u ON u.user_code = e.created_by
            WHERE e.teacher_id = :teacher_id
              AND e.score_month = :score_month
            ORDER BY e.created_at DESC
        """),
        {"teacher_id": teacher_id, "score_month": score_month},
    ).mappings().all()

    return [dict(row) for row in rows]


@router.post("/teachers/{teacher_id}/score-events")
def create_teacher_score_event(
    teacher_id: str,
    payload: TeacherScoreEventCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    ensure_teacher_score_table(db)
    get_teacher_or_404(teacher_id, db)
    event_id = str(uuid4())
    score_month = normalize_score_month(payload.score_month)

    event = db.execute(
        text("""
            INSERT INTO teacher_score_events (
                event_id, teacher_id, score_month, delta, reason,
                evidence_text, evidence_url, created_by
            )
            VALUES (
                :event_id, :teacher_id, :score_month, :delta, :reason,
                :evidence_text, :evidence_url, :created_by
            )
            RETURNING event_id, teacher_id, score_month, delta, reason,
                      evidence_text, evidence_url, created_by, created_at, teacher_read_at
        """),
        {
            "event_id": event_id,
            "teacher_id": teacher_id,
            "score_month": score_month,
            "delta": payload.delta,
            "reason": payload.reason,
            "evidence_text": payload.evidence_text,
            "evidence_url": payload.evidence_url,
            "created_by": current_user.user_code,
        },
    ).mappings().first()
    db.commit()
    return dict(event)


@router.get("/teacher-score-events/unread")
def get_unread_teacher_score_events(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_TEACHER)),
):
    ensure_teacher_score_table(db)
    teacher_user = require_teacher_identity(current_user)

    rows = db.execute(
        text("""
            SELECT event_id, teacher_id, score_month, delta, reason,
                   evidence_text, evidence_url, created_by, created_at, teacher_read_at
            FROM teacher_score_events
            WHERE teacher_id = :teacher_id
              AND teacher_read_at IS NULL
            ORDER BY created_at DESC
        """),
        {"teacher_id": teacher_user.teacher_id},
    ).mappings().all()
    return [dict(row) for row in rows]


@router.put("/teacher-score-events/{event_id}/read")
def mark_teacher_score_event_read(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_TEACHER)),
):
    ensure_teacher_score_table(db)
    teacher_user = require_teacher_identity(current_user)

    event = db.execute(
        text("""
            SELECT teacher_id
            FROM teacher_score_events
            WHERE event_id = :event_id
        """),
        {"event_id": event_id},
    ).mappings().first()

    if not event:
        raise HTTPException(status_code=404, detail="score event not found")

    if event["teacher_id"] != teacher_user.teacher_id:
        raise HTTPException(status_code=403, detail="teachers can only mark their own score events as read")

    db.execute(
        text("""
            UPDATE teacher_score_events
            SET teacher_read_at = NOW()
            WHERE event_id = :event_id
        """),
        {"event_id": event_id},
    )
    db.commit()
    return {"message": "score event marked as read", "event_id": event_id}
