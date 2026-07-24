from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import get_current_user
from db import get_db
from schemas.auth import CurrentUser
from services.push_notifications import (
    VAPID_PUBLIC_KEY,
    endpoint_hash,
    ensure_push_subscriptions_table,
    send_push_to_user_codes,
    web_push_enabled,
)


router = APIRouter(prefix="/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


class PushSubscriptionPayload(BaseModel):
    endpoint: str = Field(min_length=1)
    expirationTime: int | None = None
    keys: PushKeys


class PushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=1)


@router.get("/vapid-public-key")
def get_vapid_public_key(_: CurrentUser = Depends(get_current_user)):
    return {
        "enabled": web_push_enabled(),
        "public_key": VAPID_PUBLIC_KEY,
    }


@router.post("/subscriptions")
def save_push_subscription(
    payload: PushSubscriptionPayload,
    user_agent: str | None = Header(default=None),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if not web_push_enabled():
        raise HTTPException(status_code=503, detail="web push is not configured")

    ensure_push_subscriptions_table(db)
    db.execute(
        text("""
            INSERT INTO push_subscriptions (
                user_code, endpoint, endpoint_hash, p256dh, auth, user_agent
            )
            VALUES (
                :user_code, :endpoint, :endpoint_hash, :p256dh, :auth, :user_agent
            )
            ON CONFLICT (endpoint)
            DO UPDATE SET
                user_code = EXCLUDED.user_code,
                endpoint_hash = EXCLUDED.endpoint_hash,
                p256dh = EXCLUDED.p256dh,
                auth = EXCLUDED.auth,
                user_agent = EXCLUDED.user_agent,
                updated_at = NOW(),
                last_seen_at = NOW()
        """),
        {
            "user_code": current_user.user_code,
            "endpoint": payload.endpoint,
            "endpoint_hash": endpoint_hash(payload.endpoint),
            "p256dh": payload.keys.p256dh,
            "auth": payload.keys.auth,
            "user_agent": user_agent,
        },
    )
    db.commit()
    return {"message": "push subscription saved"}


@router.delete("/subscriptions")
def delete_push_subscription(
    payload: PushSubscriptionDelete,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    ensure_push_subscriptions_table(db)
    db.execute(
        text("""
            DELETE FROM push_subscriptions
            WHERE user_code = :user_code
              AND endpoint = :endpoint
        """),
        {
            "user_code": current_user.user_code,
            "endpoint": payload.endpoint,
        },
    )
    db.commit()
    return {"message": "push subscription deleted"}


@router.post("/test")
def send_test_push(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if not web_push_enabled():
        raise HTTPException(status_code=503, detail="web push is not configured")

    result = send_push_to_user_codes(
        db,
        [current_user.user_code],
        title="Fighters Academy",
        body="Push notifications are ready on this device.",
    )
    return {"message": "test push sent", **result}
