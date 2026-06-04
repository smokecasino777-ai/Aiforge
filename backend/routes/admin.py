"""Owner-only Secrets management (Stripe key rotation, audit, mode check)."""
from fastapi import APIRouter, Depends, HTTPException

from core import (
    RUNTIME,
    current_stripe_key,
    ensure_admin,
    get_current_user,
    iso,
    key_fingerprint,
    logger,
    now_utc,
    persist_env_var,
    stripe_mode_of,
    validate_stripe_key,
)
from models import StripeKeyRequest

router = APIRouter(tags=["admin"])


@router.get("/admin/me")
async def admin_me(user: dict = Depends(get_current_user)):
    """Lightweight check the frontend uses to decide whether to show admin UI."""
    try:
        await ensure_admin(user)
        return {"is_admin": True, "email": user.get("email")}
    except HTTPException:
        return {"is_admin": False, "email": user.get("email")}


@router.get("/admin/stripe-key")
async def admin_stripe_key_get(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
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
    req: StripeKeyRequest, user: dict = Depends(get_current_user)
):
    await ensure_admin(user)
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
async def admin_stripe_key_revoke(user: dict = Depends(get_current_user)):
    """Roll back to the sandbox test key."""
    await ensure_admin(user)
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
