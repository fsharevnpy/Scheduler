from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.routes.common import VALID_LEAVE_STATUS
from core.permissions import (
    ROLE_DEVELOPER,
    ROLE_MANAGER,
    ROLE_TEACHER,
    get_current_user,
    require_roles,
    require_teacher_identity,
)
from core.security import decode_access_token
from db import get_db
from db import SessionLocal
from schemas.auth import CurrentUser
from schemas.scheduling import LeaveRequestCreate
from services.class_assignments import ensure_class_teachers_table
from services.user_event_broker import user_event_broker


router = APIRouter()


def ensure_leave_request_constraints(db: Session) -> None:
    db.execute(text("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS assigned_manager_code VARCHAR(7) REFERENCES users(user_code) ON DELETE SET NULL"))
    db.execute(text("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"))
    db.execute(text("ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS manager_read_at TIMESTAMPTZ NULL"))
    db.execute(text("DROP INDEX IF EXISTS ux_leave_requests_teacher_class"))
    db.execute(
        text("""
            CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_requests_active_teacher_class
                ON leave_requests (teacher_id, class_id)
                WHERE status IN ('REQUESTED', 'APPROVED')
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_leave_requests_assigned_manager_unread
                ON leave_requests(assigned_manager_code, manager_read_at, created_at DESC)
                WHERE assigned_manager_code IS NOT NULL AND manager_read_at IS NULL
        """)
    )
    db.commit()


def get_leave_request_or_404(request_id: str, db: Session):
    leave_row = db.execute(
        text("""
            SELECT request_id, class_id, teacher_id, assigned_manager_code, reason, status
            FROM leave_requests
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    ).mappings().first()

    if not leave_row:
        raise HTTPException(status_code=404, detail="leave request not found")

    return leave_row


def set_leave_request_status(request_id: str, status: str, db: Session) -> None:
    db.execute(
        text("""
            UPDATE leave_requests
            SET status = :status
            WHERE request_id = :request_id
        """),
        {
            "request_id": request_id,
            "status": status,
        },
    )


def ensure_manager_can_review(leave_row, current_user: CurrentUser) -> None:
    if current_user.role == ROLE_DEVELOPER:
        return

    if leave_row["assigned_manager_code"] is None:
        return

    if leave_row["assigned_manager_code"] != current_user.user_code:
        raise HTTPException(status_code=403, detail="leave request is assigned to another manager")


def mark_class_needs_replacement(class_id: str, db: Session) -> None:
    db.execute(
        text("""
            UPDATE classes
            SET status = 'NEED_REPLACEMENT'
            WHERE class_id = :class_id
        """),
        {"class_id": class_id},
    )


def reset_class_status_if_no_active_leave(class_id: str, db: Session) -> None:
    ensure_class_teachers_table(db)
    remaining_active_requests = db.execute(
        text("""
            SELECT COUNT(*)
            FROM leave_requests
            WHERE class_id = :class_id
              AND status IN ('REQUESTED', 'APPROVED')
        """),
        {"class_id": class_id},
    ).scalar_one()

    if remaining_active_requests > 0:
        return

    db.execute(
        text("""
            UPDATE classes
            SET status = CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM class_teachers ct
                    WHERE ct.class_id = classes.class_id
                ) THEN 'ASSIGNED'
                ELSE 'OPEN'
            END
            WHERE class_id = :class_id
        """),
        {"class_id": class_id},
    )


@router.get("/leave-requests")
def get_leave_requests(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    ensure_leave_request_constraints(db)
    ensure_class_teachers_table(db)

    query = """
        SELECT
            lr.request_id,
            lr.class_id,
            c.day_of_week AS class_day_of_week,
            lr.teacher_id,
            lr.assigned_manager_code,
            u.display_name AS assigned_manager_name,
            lr.request_date,
            lr.reason,
            lr.status,
            lr.created_at,
            lr.manager_read_at
        FROM leave_requests lr
        JOIN classes c ON c.class_id = lr.class_id
        LEFT JOIN users u ON u.user_code = lr.assigned_manager_code
    """
    params = {}

    if current_user.role == ROLE_TEACHER:
        if not current_user.teacher_id:
            raise HTTPException(status_code=403, detail="teacher account is not linked")
        query += " WHERE lr.teacher_id = :teacher_id"
        params["teacher_id"] = current_user.teacher_id

    query += " ORDER BY lr.request_date, lr.request_id"
    rows = db.execute(text(query), params).mappings().all()
    return [dict(row) for row in rows]


@router.get("/leave-request-managers")
def get_leave_request_managers(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_TEACHER)),
):
    rows = db.execute(
        text("""
            SELECT user_code, display_name, profile_image_url
            FROM users
            WHERE role = 'manager'
              AND active = TRUE
            ORDER BY display_name, user_code
        """)
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("/leave-requests")
def create_leave_request(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    ensure_leave_request_constraints(db)

    if payload.status not in VALID_LEAVE_STATUS:
        raise HTTPException(status_code=400, detail="invalid leave request status")

    if current_user.role == ROLE_TEACHER:
        teacher_user = require_teacher_identity(current_user)
        if payload.teacher_id != teacher_user.teacher_id:
            raise HTTPException(status_code=403, detail="teachers can only create their own leave requests")
    elif current_user.role not in {ROLE_DEVELOPER, ROLE_MANAGER}:
        raise HTTPException(status_code=403, detail="forbidden")

    existing = db.execute(
        text("SELECT 1 FROM leave_requests WHERE request_id = :request_id"),
        {"request_id": payload.request_id},
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="request_id already exists")

    class_row = db.execute(
        text("""
            SELECT c.class_id, c.status, c.day_of_week, t.name AS teacher_name
            FROM classes c
            JOIN class_teachers ct ON ct.class_id = c.class_id
            JOIN teachers t ON t.teacher_id = ct.teacher_id
            WHERE c.class_id = :class_id
              AND ct.teacher_id = :teacher_id
        """),
        {"class_id": payload.class_id, "teacher_id": payload.teacher_id},
    ).mappings().first()

    if not class_row:
        raise HTTPException(status_code=400, detail="teacher is not assigned to the class")

    assigned_manager = db.execute(
        text("""
            SELECT user_code, display_name, role, active
            FROM users
            WHERE user_code = :user_code
              AND role = 'manager'
              AND active = TRUE
        """),
        {"user_code": payload.assigned_manager_code},
    ).mappings().first()

    if not assigned_manager:
        raise HTTPException(status_code=404, detail="assigned manager not found")

    active_duplicate_for_class = db.execute(
        text("""
            SELECT request_id, status
            FROM leave_requests
            WHERE class_id = :class_id
              AND teacher_id = :teacher_id
              AND status IN ('REQUESTED', 'APPROVED')
            ORDER BY request_date DESC, request_id DESC
            LIMIT 1
        """),
        {
            "class_id": payload.class_id,
            "teacher_id": payload.teacher_id,
        },
    ).mappings().first()

    if active_duplicate_for_class:
        raise HTTPException(
            status_code=409,
            detail="active leave request already exists for this class",
        )

    created_leave_request = db.execute(
        text("""
            INSERT INTO leave_requests (
                request_id, class_id, teacher_id, assigned_manager_code,
                request_date, reason, status
            )
            VALUES (
                :request_id, :class_id, :teacher_id, :assigned_manager_code,
                :request_date, :reason, :status
            )
            RETURNING request_id, class_id, teacher_id, assigned_manager_code,
                      request_date, reason, status, created_at, manager_read_at
        """),
        {
            "request_id": payload.request_id,
            "class_id": payload.class_id,
            "teacher_id": payload.teacher_id,
            "assigned_manager_code": payload.assigned_manager_code,
            "request_date": payload.request_date,
            "reason": payload.reason,
            "status": payload.status,
        },
    ).mappings().first()

    mark_class_needs_replacement(payload.class_id, db)

    db.commit()
    user_event_broker.publish(
        payload.assigned_manager_code,
        {
            "event_type": "LEAVE_REQUEST",
            **dict(created_leave_request),
            "teacher_name": class_row["teacher_name"],
            "class_day_of_week": class_row["day_of_week"],
        },
    )
    return {"message": "leave request created", "request_id": payload.request_id}


@router.websocket("/manager-events/ws")
async def manager_events_websocket(websocket: WebSocket):
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
                SELECT user_code, role, active
                FROM users
                WHERE user_code = :user_code
            """),
            {"user_code": user_code},
        ).mappings().first()
    finally:
        db.close()

    if not user or not user["active"] or user["role"] != ROLE_MANAGER:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    queue, loop = user_event_broker.subscribe(user["user_code"])

    try:
        await websocket.send_json({"type": "connected"})
        while True:
            event = await queue.get()
            await websocket.send_json({"type": "manager_event", "event": event})
    except WebSocketDisconnect:
        pass
    finally:
        user_event_broker.unsubscribe(user["user_code"], loop, queue)


@router.get("/manager-events/unread")
def get_unread_manager_events(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_MANAGER)),
):
    ensure_leave_request_constraints(db)

    rows = db.execute(
        text("""
            SELECT
                lr.request_id,
                lr.class_id,
                c.day_of_week AS class_day_of_week,
                lr.teacher_id,
                t.name AS teacher_name,
                lr.assigned_manager_code,
                lr.request_date,
                lr.reason,
                lr.status,
                lr.created_at,
                lr.manager_read_at
            FROM leave_requests lr
            JOIN classes c ON c.class_id = lr.class_id
            JOIN teachers t ON t.teacher_id = lr.teacher_id
            WHERE lr.assigned_manager_code = :manager_code
              AND lr.manager_read_at IS NULL
              AND lr.status = 'REQUESTED'
            ORDER BY lr.created_at DESC, lr.request_id DESC
        """),
        {"manager_code": current_user.user_code},
    ).mappings().all()

    return [
        {
            "event_type": "LEAVE_REQUEST",
            **dict(row),
        }
        for row in rows
    ]


@router.put("/manager-events/{request_id}/read")
def mark_manager_event_read(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_MANAGER)),
):
    ensure_leave_request_constraints(db)

    result = db.execute(
        text("""
            UPDATE leave_requests
            SET manager_read_at = NOW()
            WHERE request_id = :request_id
              AND assigned_manager_code = :manager_code
        """),
        {"request_id": request_id, "manager_code": current_user.user_code},
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="manager notification not found")

    return {"message": "manager event marked as read", "request_id": request_id}


@router.put("/manager-events/read-all")
def mark_all_manager_events_read(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_MANAGER)),
):
    ensure_leave_request_constraints(db)

    result = db.execute(
        text("""
            UPDATE leave_requests
            SET manager_read_at = NOW()
            WHERE assigned_manager_code = :manager_code
              AND manager_read_at IS NULL
        """),
        {"manager_code": current_user.user_code},
    )
    db.commit()
    return {"message": "manager events marked as read", "count": result.rowcount}


@router.put("/leave-requests/{request_id}/approve")
def approve_leave_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    leave_row = get_leave_request_or_404(request_id, db)
    ensure_manager_can_review(leave_row, current_user)

    if leave_row["status"] == "APPROVED":
        return {"message": "leave request already approved", "request_id": request_id}

    if leave_row["status"] == "REJECTED":
        raise HTTPException(status_code=400, detail="cannot approve a rejected leave request")

    if leave_row["status"] != "REQUESTED":
        raise HTTPException(status_code=400, detail="only requested leave requests can be approved")

    set_leave_request_status(request_id, "APPROVED", db)
    mark_class_needs_replacement(leave_row["class_id"], db)

    db.commit()
    return {"message": "leave request approved", "request_id": request_id}


@router.put("/leave-requests/{request_id}/reject")
def reject_leave_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    leave_row = get_leave_request_or_404(request_id, db)
    ensure_manager_can_review(leave_row, current_user)

    if leave_row["status"] == "REJECTED":
        return {"message": "leave request already rejected", "request_id": request_id}

    if leave_row["status"] != "REQUESTED":
        raise HTTPException(status_code=400, detail="only requested leave requests can be rejected")

    set_leave_request_status(request_id, "REJECTED", db)
    reset_class_status_if_no_active_leave(leave_row["class_id"], db)

    db.commit()
    return {"message": "leave request rejected", "request_id": request_id}


@router.put("/leave-requests/{request_id}/cancel")
def cancel_leave_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_TEACHER)),
):
    teacher_user = require_teacher_identity(current_user)

    leave_row = get_leave_request_or_404(request_id, db)

    if leave_row["teacher_id"] != teacher_user.teacher_id:
        raise HTTPException(status_code=403, detail="teachers can only cancel their own leave requests")

    if leave_row["status"] == "CANCELLED":
        return {"message": "leave request already cancelled", "request_id": request_id}

    if leave_row["status"] != "REQUESTED":
        raise HTTPException(status_code=400, detail="teachers can only cancel requested leave requests")

    set_leave_request_status(request_id, "CANCELLED", db)
    reset_class_status_if_no_active_leave(leave_row["class_id"], db)

    db.commit()
    return {"message": "leave request cancelled", "request_id": request_id}
