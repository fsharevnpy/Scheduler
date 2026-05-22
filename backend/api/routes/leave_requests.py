from fastapi import APIRouter, Depends, HTTPException
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
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import LeaveRequestCreate


router = APIRouter()


def get_leave_request_or_404(request_id: str, db: Session):
    leave_row = db.execute(
        text("""
            SELECT request_id, class_id, teacher_id, reason, status
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
                WHEN teacher_id IS NULL THEN 'OPEN'
                ELSE 'ASSIGNED'
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
    query = """
        SELECT request_id, class_id, teacher_id, request_date, reason, status
        FROM leave_requests
    """
    params = {}

    if current_user.role == ROLE_TEACHER:
        if not current_user.teacher_id:
            raise HTTPException(status_code=403, detail="teacher account is not linked")
        query += " WHERE teacher_id = :teacher_id"
        params["teacher_id"] = current_user.teacher_id

    query += " ORDER BY request_date, request_id"
    rows = db.execute(text(query), params).mappings().all()
    return [dict(row) for row in rows]


@router.post("/leave-requests")
def create_leave_request(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
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
            SELECT class_id, teacher_id, status
            FROM classes
            WHERE class_id = :class_id
        """),
        {"class_id": payload.class_id},
    ).mappings().first()

    if not class_row:
        raise HTTPException(status_code=404, detail="class not found")

    if class_row["teacher_id"] != payload.teacher_id:
        raise HTTPException(status_code=400, detail="teacher is not assigned to the class")

    db.execute(
        text("""
            INSERT INTO leave_requests (request_id, class_id, teacher_id, request_date, reason, status)
            VALUES (:request_id, :class_id, :teacher_id, :request_date, :reason, :status)
        """),
        {
            "request_id": payload.request_id,
            "class_id": payload.class_id,
            "teacher_id": payload.teacher_id,
            "request_date": payload.request_date,
            "reason": payload.reason,
            "status": payload.status,
        },
    )

    mark_class_needs_replacement(payload.class_id, db)

    db.commit()
    return {"message": "leave request created", "request_id": payload.request_id}


@router.put("/leave-requests/{request_id}/approve")
def approve_leave_request(
    request_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    leave_row = get_leave_request_or_404(request_id, db)

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
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    leave_row = get_leave_request_or_404(request_id, db)

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
