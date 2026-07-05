"""Owner-only Secrets management (Stripe key rotation, audit, mode check).

All sensitive endpoints require BOTH the admin JWT *and* a short-lived
sudo token (X-Admin-Unlock header) obtained by re-entering the admin
password via POST /admin/unlock. This keeps the panel locked even if an
admin session token leaks.
"""
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr

from core import (
    RUNTIME,
    current_stripe_key,
    db,
    ensure_admin,
    get_current_user,
    iso,
    key_fingerprint,
    logger,
    make_sudo_token,
    now_utc,
    persist_env_var,
    stripe_mode_of,
    validate_stripe_key,
    verify_sudo_token,
)
from models import StripeKeyRequest

router = APIRouter(tags=["admin"])


class AdminResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str


class AdminUnlockRequest(BaseModel):
    password: str


def ensure_sudo(user: dict, x_admin_unlock: Optional[str]) -> None:
    """Second factor: sensitive admin ops need a fresh sudo token."""
    if not x_admin_unlock or not verify_sudo_token(x_admin_unlock, user["user_id"]):
        raise HTTPException(
            status_code=403,
            detail="Admin panel is locked. Re-enter your admin password to unlock.",
        )


@router.post("/admin/unlock")
async def admin_unlock(
    req: AdminUnlockRequest, user: dict = Depends(get_current_user)
):
    """Re-authenticate the admin to mint a 15-minute sudo token."""
    await ensure_admin(user)
    ph = user.get("password_hash") or ""
    if not ph or not bcrypt.checkpw((req.password or "").encode(), ph.encode()):
        raise HTTPException(status_code=401, detail="Wrong admin password")
    logger.info(f"Admin panel unlocked by {user.get('email')}")
    return {"sudo_token": make_sudo_token(user["user_id"]), "expires_in_minutes": 15}


@router.get("/admin/me")
async def admin_me(user: dict = Depends(get_current_user)):
    """Lightweight check the frontend uses to decide whether to show admin UI."""
    try:
        await ensure_admin(user)
        return {"is_admin": True, "email": user.get("email")}
    except HTTPException:
        return {"is_admin": False, "email": user.get("email")}


@router.get("/admin/stripe-key")
async def admin_stripe_key_get(
    user: dict = Depends(get_current_user),
    x_admin_unlock: Optional[str] = Header(None, alias="X-Admin-Unlock"),
):
    await ensure_admin(user)
    ensure_sudo(user, x_admin_unlock)
    key = current_stripe_key()
    return {
        "mode": stripe_mode_of(key),
        "fingerprint": RUNTIME.get("stripe_fingerprint") or key_fingerprint(key),
        "updated_at": RUNTIME.get("stripe_updated_at") or "",
        "is_sandbox": key == "sk_test_emergent",
        "is_live": key.startswith("sk_live_"),
    }


@router.post("/admin/stripe-key")
async def admin_stripe_key_set(
    req: StripeKeyRequest,
    user: dict = Depends(get_current_user),
    x_admin_unlock: Optional[str] = Header(None, alias="X-Admin-Unlock"),
):
    await ensure_admin(user)
    ensure_sudo(user, x_admin_unlock)
    key = (req.key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="Empty key")
    if not (key.startswith("sk_live_") or key.startswith("sk_test_")):
        raise HTTPException(
            status_code=400, detail="Key must start with sk_live_ or sk_test_"
        )
    if key == "sk_test_emergent":
        ok, msg = True, "Sandbox key configured (test mode)."
    else:
        ok, msg = await validate_stripe_key(key)
    if not ok:
        raise HTTPException(
            status_code=400, detail=f"Stripe rejected this key: {msg}"
        )
    fp = key_fingerprint(key)
    now = iso(now_utc())
    persist_env_var("STRIPE_API_KEY", key)
    persist_env_var("STRIPE_KEY_FINGERPRINT", fp)
    persist_env_var("STRIPE_KEY_UPDATED_AT", now)
    RUNTIME["stripe_api_key"] = key
    RUNTIME["stripe_fingerprint"] = fp
    RUNTIME["stripe_updated_at"] = now
    logger.info(
        f"Stripe key rotated by {user.get('email')} \u2192 mode={stripe_mode_of(key)}, fp={fp}"
    )
    return {
        "ok": True,
        "mode": stripe_mode_of(key),
        "fingerprint": fp,
        "updated_at": now,
        "message": msg,
    }


@router.delete("/admin/stripe-key")
async def admin_stripe_key_revoke(
    user: dict = Depends(get_current_user),
    x_admin_unlock: Optional[str] = Header(None, alias="X-Admin-Unlock"),
):
    """Roll back to the sandbox test key."""
    await ensure_admin(user)
    ensure_sudo(user, x_admin_unlock)
    key = "sk_test_emergent"
    fp = key_fingerprint(key)
    now = iso(now_utc())
    persist_env_var("STRIPE_API_KEY", key)
    persist_env_var("STRIPE_KEY_FINGERPRINT", fp)
    persist_env_var("STRIPE_KEY_UPDATED_AT", now)
    RUNTIME["stripe_api_key"] = key
    RUNTIME["stripe_fingerprint"] = fp
    RUNTIME["stripe_updated_at"] = now
    logger.info(f"Stripe key reset to sandbox by {user.get('email')}")
    return {"ok": True, "mode": "sandbox", "fingerprint": fp, "updated_at": now}


# ---------------------------------------------------------------------------
# User account management (owner-only)
# ---------------------------------------------------------------------------
@router.get("/admin/users")
async def admin_list_users(
    user: dict = Depends(get_current_user),
    x_admin_unlock: Optional[str] = Header(None, alias="X-Admin-Unlock"),
):
    """Compact list of every account in the system (owner-only).

    Used by the Admin Secrets page to populate the "Reset User Password"
    picker so the owner can recover a locked-out account without ever
    pasting passwords into chat.
    """
    await ensure_admin(user)
    ensure_sudo(user, x_admin_unlock)
    cursor = db.users.find(
        {},
        {
            "_id": 0,
            "user_id": 1,
            "email": 1,
            "name": 1,
            "plan": 1,
            "auth_provider": 1,
            "created_at": 1,
            "is_admin": 1,
        },
    ).sort("created_at", -1)
    users = await cursor.to_list(500)
    return {"users": users, "count": len(users)}


@router.post("/admin/reset-user-password")
async def admin_reset_user_password(
    req: AdminResetPasswordRequest,
    user: dict = Depends(get_current_user),
    x_admin_unlock: Optional[str] = Header(None, alias="X-Admin-Unlock"),
):
    """Owner-initiated password reset for any email/password account.

    This is the in-app recovery path: a locked-out customer emails the
    owner, and the owner issues a new password here — no email service.
    """
    await ensure_admin(user)
    ensure_sudo(user, x_admin_unlock)
    email = req.email.lower().strip()
    pw = (req.new_password or "").strip()
    if len(pw) < 6:
        raise HTTPException(
            status_code=400, detail="New password must be at least 6 characters"
        )
    target = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "auth_provider": 1})
    if not target:
        raise HTTPException(status_code=404, detail="No account with that email")
    if target.get("auth_provider") == "google":
        raise HTTPException(
            status_code=400,
            detail="That account is Google-only; cannot reset email/password.",
        )
    new_hash = bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one(
        {"user_id": target["user_id"]},
        {"$set": {"password_hash": new_hash, "password_reset_at": iso(now_utc())}},
    )
    logger.info(
        f"Admin {user.get('email')} reset password for {email} (user_id={target['user_id']})"
    )
    return {"ok": True, "email": email, "message": "Password updated."}
