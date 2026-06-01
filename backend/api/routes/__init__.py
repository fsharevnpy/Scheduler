from fastapi import APIRouter

from api.routes.admin import router as admin_router
from api.routes.attendance import router as attendance_router
from api.routes.classes import router as classes_router
from api.routes.leave_requests import router as leave_requests_router
from api.routes.password_reset_requests import router as password_reset_requests_router
from api.routes.replacements import router as replacements_router
from api.routes.system import router as system_router
from api.routes.teacher_scores import router as teacher_scores_router
from api.routes.teachers import router as teachers_router
from api.routes.users import router as users_router


router = APIRouter()
router.include_router(admin_router)
router.include_router(system_router)
router.include_router(password_reset_requests_router)
router.include_router(users_router)
router.include_router(teachers_router)
router.include_router(classes_router)
router.include_router(leave_requests_router)
router.include_router(replacements_router)
router.include_router(attendance_router)
router.include_router(teacher_scores_router)

__all__ = ["router"]
