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


@router.get("/leave-requests")
def get_leave_requests(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = """
        SELECT request_id, class_id, teacher_id, request_date, status
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
            INSERT INTO leave_requests (request_id, class_id, teacher_id, request_date, status)
            VALUES (:request_id, :class_id, :teacher_id, :request_date, :status)
        """),
        {
            "request_id": payload.request_id,
            "class_id": payload.class_id,
            "teacher_id": payload.teacher_id,
            "request_date": payload.request_date,
            "status": payload.status,
        },
    )

    db.execute(
        text("""
            UPDATE classes
            SET status = 'NEED_REPLACEMENT'
            WHERE class_id = :class_id
        """),
        {"class_id": payload.class_id},
    )

    db.commit()
    return {"message": "leave request created", "request_id": payload.request_id}


@router.put("/leave-requests/{request_id}/approve")
def approve_leave_request(
    request_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    leave_row = db.execute(
        text("""
            SELECT request_id, class_id, teacher_id, status
            FROM leave_requests
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    ).mappings().first()

    if not leave_row:
        raise HTTPException(status_code=404, detail="leave request not found")

    if leave_row["status"] == "APPROVED":
        return {"message": "leave request already approved", "request_id": request_id}

    if leave_row["status"] == "CANCELLED":
        raise HTTPException(status_code=400, detail="cannot approve a cancelled leave request")

    db.execute(
        text("""
            UPDATE leave_requests
            SET status = 'APPROVED'
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    )

    db.execute(
        text("""
            UPDATE classes
            SET status = 'NEED_REPLACEMENT'
            WHERE class_id = :class_id
        """),
        {"class_id": leave_row["class_id"]},
    )

    db.commit()
    return {"message": "leave request approved", "request_id": request_id}


@router.put("/leave-requests/{request_id}/cancel")
def cancel_leave_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    leave_row = db.execute(
        text("""
            SELECT request_id, class_id, teacher_id, status
            FROM leave_requests
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    ).mappings().first()

    if not leave_row:
        raise HTTPException(status_code=404, detail="leave request not found")

    if leave_row["status"] == "CANCELLED":
        return {"message": "leave request already cancelled", "request_id": request_id}

    if current_user.role == ROLE_TEACHER:
        teacher_user = require_teacher_identity(current_user)
        if leave_row["teacher_id"] != teacher_user.teacher_id:
            raise HTTPException(status_code=403, detail="teachers can only cancel their own leave requests")
        if leave_row["status"] != "REQUESTED":
            raise HTTPException(status_code=400, detail="teachers can only cancel requested leave requests")
    elif current_user.role not in {ROLE_DEVELOPER, ROLE_MANAGER}:
        raise HTTPException(status_code=403, detail="forbidden")

    db.execute(
        text("""
            UPDATE leave_requests
            SET status = 'CANCELLED'
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    )

    remaining_active_requests = db.execute(
        text("""
            SELECT COUNT(*)
            FROM leave_requests
            WHERE class_id = :class_id
              AND status IN ('REQUESTED', 'APPROVED')
        """),
        {"class_id": leave_row["class_id"]},
    ).scalar_one()

    if remaining_active_requests == 0:
        db.execute(
            text("""
                UPDATE classes
                SET status = CASE
                    WHEN teacher_id IS NULL THEN 'OPEN'
                    ELSE 'ASSIGNED'
                END
                WHERE class_id = :class_id
            """),
            {"class_id": leave_row["class_id"]},
        )

    db.commit()
    return {"message": "leave request cancelled", "request_id": request_id}
