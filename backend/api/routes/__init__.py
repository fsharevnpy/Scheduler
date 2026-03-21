from fastapi import APIRouter

from api.routes.classes import router as classes_router
from api.routes.leave_requests import router as leave_requests_router
from api.routes.replacements import router as replacements_router
from api.routes.system import router as system_router
from api.routes.teachers import router as teachers_router
from api.routes.users import router as users_router


router = APIRouter()
router.include_router(system_router)
router.include_router(users_router)
router.include_router(teachers_router)
router.include_router(classes_router)
router.include_router(leave_requests_router)
router.include_router(replacements_router)

__all__ = ["router"]
