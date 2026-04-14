from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image, ImageOps
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.object_storage import upload_profile_image
from core.permissions import get_current_user
from core.profile_images import build_profile_image_url
from core.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, hash_password, verify_password
from db import get_db
from schemas.auth import ChangePasswordRequest, CurrentUser, LoginRequest, TokenResponse


router = APIRouter(prefix="/auth", tags=["auth"])
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024
MAX_PROFILE_IMAGE_DIMENSION = 1600


def normalize_profile_image(content: bytes, content_type: str) -> tuple[bytes, str, str]:
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image file is empty")

    try:
        image = Image.open(BytesIO(content))
        image.load()
        image = ImageOps.exif_transpose(image)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid image file") from exc

    if len(content) <= MAX_PROFILE_IMAGE_SIZE:
        return content, content_type, ALLOWED_IMAGE_TYPES[content_type]

    working_image = image
    if max(working_image.size) > MAX_PROFILE_IMAGE_DIMENSION:
        working_image = working_image.copy()
        working_image.thumbnail((MAX_PROFILE_IMAGE_DIMENSION, MAX_PROFILE_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

    if working_image.mode not in ("RGB", "RGBA"):
        working_image = working_image.convert("RGBA")

    for dimension in (1600, 1280, 1024, 896, 768):
        resized = working_image.copy()
        if max(resized.size) > dimension:
            resized.thumbnail((dimension, dimension), Image.Resampling.LANCZOS)

        if resized.mode == "RGBA":
            resized = resized.convert("RGB")

        for quality in (85, 75, 65, 55, 45):
            buffer = BytesIO()
            resized.save(buffer, format="WEBP", quality=quality, method=6)
            optimized_content = buffer.getvalue()
            if len(optimized_content) <= MAX_PROFILE_IMAGE_SIZE:
                return optimized_content, "image/webp", ".webp"

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="image file is too large even after optimization",
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(
        text("""
            SELECT user_id, user_code, display_name, profile_image_url, password_hash, role, teacher_id, active
            FROM users
            WHERE user_code = :user_code
        """),
        {"user_code": payload.user_code},
    ).mappings().first()

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid user code or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not user or not user["active"]:
        raise invalid_credentials

    if not verify_password(payload.password, user["password_hash"]):
        raise invalid_credentials

    current_user = CurrentUser(
        user_id=user["user_id"],
        user_code=user["user_code"],
        display_name=user["display_name"],
        profile_image_url=build_profile_image_url(user["profile_image_url"]),
        role=user["role"],
        teacher_id=user["teacher_id"],
        active=user["active"],
    )

    access_token = create_access_token(
        {
            "sub": current_user.user_code,
            "role": current_user.role,
            "teacher_id": current_user.teacher_id,
        }
    )
    return TokenResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=current_user,
    )


@router.get("/me", response_model=CurrentUser)
def get_me(current_user: CurrentUser = Depends(get_current_user)):
    return current_user


@router.put("/profile/password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    user = db.execute(
        text("""
            SELECT user_code, password_hash, active
            FROM users
            WHERE user_code = :user_code
        """),
        {"user_code": current_user.user_code},
    ).mappings().first()

    if not user or not user["active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or inactive user",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="current password is incorrect")

    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="new password must be different from current password")

    db.execute(
        text("""
            UPDATE users
            SET password_hash = :password_hash
            WHERE user_code = :user_code
        """),
        {
            "password_hash": hash_password(payload.new_password),
            "user_code": current_user.user_code,
        },
    )
    db.commit()
    return {"message": "password changed", "user_code": current_user.user_code}


@router.put("/profile/image", response_model=CurrentUser)
async def update_profile_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported image type")

    content = await file.read()
    content, normalized_content_type, extension = normalize_profile_image(content, file.content_type)

    object_name = f"profile-imgs/{current_user.user_code}{extension}"
    upload_profile_image(object_name, content, normalized_content_type)

    db.execute(
        text("""
            UPDATE users
            SET profile_image_url = :profile_image_url
            WHERE user_code = :user_code
        """),
        {
            "profile_image_url": object_name,
            "user_code": current_user.user_code,
        },
    )
    db.commit()

    return CurrentUser(
        user_id=current_user.user_id,
        user_code=current_user.user_code,
        display_name=current_user.display_name,
        profile_image_url=build_profile_image_url(object_name),
        role=current_user.role,
        teacher_id=current_user.teacher_id,
        active=current_user.active,
    )
