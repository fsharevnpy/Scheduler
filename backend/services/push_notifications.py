import hashlib
import json
import logging
import os

from py_vapid import Vapid02 as Vapid
from pywebpush import WebPushException, webpush
from sqlalchemy import text
from sqlalchemy.orm import Session


logger = logging.getLogger(__name__)
VAPID_PUBLIC_KEY = os.getenv("WEB_PUSH_VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("WEB_PUSH_VAPID_PRIVATE_KEY", "").replace("\\n", "\n")
VAPID_SUBJECT = os.getenv("WEB_PUSH_CONTACT_EMAIL", "mailto:admin@fightersacademy.com.vn")
VAPID_PRIVATE = Vapid.from_pem(VAPID_PRIVATE_KEY.encode("utf-8")) if VAPID_PRIVATE_KEY else None


def web_push_enabled() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE)


def ensure_push_subscriptions_table(db: Session) -> None:
    db.execute(
        text("""
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                subscription_id BIGSERIAL PRIMARY KEY,
                user_code VARCHAR(7) NOT NULL REFERENCES users(user_code) ON DELETE CASCADE,
                endpoint TEXT NOT NULL UNIQUE,
                endpoint_hash VARCHAR(64) NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                user_agent TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_code
                ON push_subscriptions(user_code)
        """)
    )
    db.commit()


def endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()


def send_push_to_user_codes(
    db: Session,
    user_codes: list[str],
    *,
    title: str,
    body: str,
    url: str = "/monitor",
) -> dict:
    if not web_push_enabled() or not user_codes:
        return {"sent": 0, "failed": 0, "stale": 0}

    ensure_push_subscriptions_table(db)
    params = {f"user_code_{index}": user_code for index, user_code in enumerate(user_codes)}
    placeholders = ", ".join(f":user_code_{index}" for index in range(len(user_codes)))
    rows = db.execute(
        text(f"""
            SELECT subscription_id, endpoint, p256dh, auth
            FROM push_subscriptions
            WHERE user_code IN ({placeholders})
        """),
        params,
    ).mappings().all()

    stale_subscription_ids = []
    sent_count = 0
    failed_count = 0
    payload = json.dumps({"title": title, "body": body, "url": url})
    for row in rows:
        try:
            webpush(
                subscription_info={
                    "endpoint": row["endpoint"],
                    "keys": {
                        "p256dh": row["p256dh"],
                        "auth": row["auth"],
                    },
                },
                data=payload,
                vapid_private_key=VAPID_PRIVATE,
                vapid_claims={"sub": VAPID_SUBJECT},
            )
            sent_count += 1
        except WebPushException as exc:
            failed_count += 1
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                stale_subscription_ids.append(row["subscription_id"])
            logger.warning("Web push failed for subscription %s: %s", row["subscription_id"], exc)
        except Exception:
            failed_count += 1
            logger.exception("Unexpected web push failure for subscription %s", row["subscription_id"])

    if stale_subscription_ids:
        delete_params = {f"id_{index}": item_id for index, item_id in enumerate(stale_subscription_ids)}
        delete_placeholders = ", ".join(f":id_{index}" for index in range(len(stale_subscription_ids)))
        db.execute(
            text(f"DELETE FROM push_subscriptions WHERE subscription_id IN ({delete_placeholders})"),
            delete_params,
        )
        db.commit()

    return {"sent": sent_count, "failed": failed_count, "stale": len(stale_subscription_ids)}


def send_push_to_teacher(
    db: Session,
    teacher_id: str,
    *,
    title: str,
    body: str,
    url: str = "/monitor",
) -> dict:
    rows = db.execute(
        text("""
            SELECT user_code
            FROM users
            WHERE teacher_id = :teacher_id
              AND role = 'teacher'
              AND active = TRUE
        """),
        {"teacher_id": teacher_id},
    ).mappings().all()
    return send_push_to_user_codes(
        db,
        [row["user_code"] for row in rows],
        title=title,
        body=body,
        url=url,
    )
