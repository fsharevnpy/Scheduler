from datetime import date
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER, get_current_user, require_roles, require_teacher_identity
from core.security import decode_access_token
from db import get_db
from db import SessionLocal
from schemas.auth import CurrentUser
from schemas.scheduling import TeacherScoreEventCreate
from services.push_notifications import send_push_to_teacher
from services.teacher_event_broker import teacher_event_broker
from services.teacher_events import ensure_teacher_events_table


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
    ensure_teacher_events_table(db)
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
                FROM teacher_events
                WHERE score_month = :score_month
                  AND event_type = 'SCORE'
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
    ensure_teacher_events_table(db)
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
            FROM teacher_events e
            JOIN teachers t ON t.teacher_id = e.teacher_id
            JOIN users u ON u.user_code = e.created_by
            WHERE e.teacher_id = :teacher_id
              AND e.event_type = 'SCORE'
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
    ensure_teacher_events_table(db)
    teacher = get_teacher_or_404(teacher_id, db)
    event_id = str(uuid4())
    score_month = normalize_score_month(payload.score_month)

    event = db.execute(
        text("""
            INSERT INTO teacher_events (
                event_id, teacher_id, event_type, score_month, delta, reason,
                evidence_text, evidence_url, created_by
            )
            VALUES (
                :event_id, :teacher_id, 'SCORE', :score_month, :delta, :reason,
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
    event_dict = dict(event)
    teacher_event_broker.publish(teacher_id, event_dict)
    send_push_to_teacher(
        db,
        teacher_id,
        title=f"{teacher['name']} monthly score updated",
        body=f"{score_month:%m/%Y}: {payload.delta:+d} points. Reason: {payload.reason}. Evidence: {payload.evidence_text or '-'}",
    )
    return event_dict


@router.websocket("/teacher-events/ws")
async def teacher_events_websocket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_access_token(token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_code = payload.get("sub")
    db = SessionLocal()
    try:
        user = db.execute(
            text("""
                SELECT user_code, role, teacher_id, active
                FROM users
                WHERE user_code = :user_code
            """),
            {"user_code": user_code},
        ).mappings().first()
    finally:
        db.close()

    if not user or not user["active"] or user["role"] != ROLE_TEACHER or not user["teacher_id"]:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    teacher_id = user["teacher_id"]
    await websocket.accept()
    queue, loop = teacher_event_broker.subscribe(teacher_id)

    try:
        await websocket.send_json({"type": "connected"})
        while True:
            event = await queue.get()
            await websocket.send_json({"type": "teacher_event", "event": event})
    except WebSocketDisconnect:
        pass
    finally:
        teacher_event_broker.unsubscribe(teacher_id, loop, queue)


@router.get("/teacher-events/unread")
def get_unread_teacher_events(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_TEACHER)),
):
    ensure_teacher_events_table(db)
    teacher_user = require_teacher_identity(current_user)

    rows = db.execute(
        text("""
            SELECT event_id, teacher_id, event_type, score_month, delta, reason,
                   evidence_text, evidence_url, profile_field, old_value, new_value,
                   created_by, created_at, teacher_read_at
            FROM teacher_events
            WHERE teacher_id = :teacher_id
              AND teacher_read_at IS NULL
            ORDER BY created_at DESC
        """),
        {"teacher_id": teacher_user.teacher_id},
    ).mappings().all()
    return [dict(row) for row in rows]


@router.put("/teacher-events/{event_id}/read")
def mark_teacher_event_read(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_TEACHER)),
):
    ensure_teacher_events_table(db)
    teacher_user = require_teacher_identity(current_user)

    event = db.execute(
        text("""
            SELECT teacher_id
            FROM teacher_events
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
            UPDATE teacher_events
            SET teacher_read_at = NOW()
            WHERE event_id = :event_id
        """),
        {"event_id": event_id},
    )
    db.commit()
    return {"message": "teacher event marked as read", "event_id": event_id}


@router.put("/teacher-events/read-all")
def mark_all_teacher_events_read(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_TEACHER)),
):
    ensure_teacher_events_table(db)
    teacher_user = require_teacher_identity(current_user)

    result = db.execute(
        text("""
            UPDATE teacher_events
            SET teacher_read_at = NOW()
            WHERE teacher_id = :teacher_id
              AND teacher_read_at IS NULL
        """),
        {"teacher_id": teacher_user.teacher_id},
    )
    db.commit()
    return {"message": "teacher events marked as read", "count": result.rowcount}
