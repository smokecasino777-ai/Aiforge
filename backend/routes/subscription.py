"""RevenueCat subscription integration — authoritative via webhooks only.

Design:
- The CLIENT CANNOT grant itself Pro by calling our API. The old
  `/subscription/sync` with `entitlement_active=true` → plan=pro was a
  server-side trust bug (see testing_agent iteration 15). It is now
  REWRITTEN to be read-only — the client calls it to pick up the latest
  plan from DB, nothing more.
- The AUTHORITATIVE path is `/api/webhook/revenuecat`, which RevenueCat
  calls on every real entitlement change (purchase, renewal, cancellation,
  expiration, billing issue, …). The webhook is protected by a shared
  secret the user configures in the RevenueCat dashboard and sets as
  REVENUECAT_WEBHOOK_SECRET in the backend env.

Server-side plan enforcement (daily_limit in /generate) relies on this —
without it, our API spend could be drained by a hacked client claiming Pro.
"""
import hmac
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from core import (
    PLAN_LIMITS,
    REVENUECAT_WEBHOOK_SECRET,
    db,
    get_current_user,
    iso,
    limiter,
    logger,
    now_utc,
)

router = APIRouter(tags=["subscription"])

# Legacy Stripe-era tiers. Never touched by the RevenueCat path so paying
# users from before the switch keep their original limits.
LEGACY_TIERS = {"spark", "forge", "neon", "quantum", "singularity"}

# RevenueCat event types that activate / deactivate the pro entitlement.
# See https://www.revenuecat.com/docs/webhooks for the full list.
ACTIVATE_EVENTS = {
    "INITIAL_PURCHASE",
    "RENEWAL",
    "PRODUCT_CHANGE",
    "UNCANCELLATION",
    "NON_RENEWING_PURCHASE",
    "TRIAL_STARTED",
    "TRIAL_CONVERTED",
}
# RevenueCat semantics: CANCELLATION means auto-renew turned off — the user
# STILL has access until the paid period expires. Only EXPIRATION should
# actually downgrade. BILLING_ISSUE and SUBSCRIPTION_PAUSED are also
# soft-states where the user might still have time left; we wait for the
# follow-up EXPIRATION to downgrade.
DEACTIVATE_EVENTS = {
    "EXPIRATION",
}


class SubscriptionSyncRequest(BaseModel):
    """Legacy-shape request kept for client compatibility. All fields are
    IGNORED — the server only consults its own authoritative DB. The client
    typically calls this right after a RevenueCat purchase to re-fetch the
    plan it already wrote via webhook."""

    entitlement_active: Optional[bool] = None
    product_id: Optional[str] = None
    expires_at: Optional[str] = None


@router.post("/subscription/sync")
@limiter.limit("30/minute")
async def sync_subscription(
    request: Request,
    _req: Optional[SubscriptionSyncRequest] = None,
    user: dict = Depends(get_current_user),
):
    """READ-ONLY: returns the user's current plan (which was set by the
    RevenueCat webhook, not by the client). The request body is ignored.

    Clients call this right after a purchase to pick up the plan the
    webhook just wrote — if the webhook hasn't landed yet, the response
    reflects the pre-purchase plan and the client should retry briefly.
    """
    plan = (user.get("plan") or "free").lower()
    return {
        "ok": True,
        "plan": plan,
        "daily_limit": PLAN_LIMITS.get(plan, 5),
        "subscription_source": user.get("subscription_source"),
        "subscription_expires_at": user.get("subscription_expires_at"),
    }


async def _apply_entitlement(user_id: str, *, active: bool, event: dict) -> dict:
    """Writes `user.plan` based on an authenticated RevenueCat event.

    Returns a summary dict for logging. Grandfathers legacy Stripe tiers.
    """
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "plan": 1, "email": 1})
    if not doc:
        logger.warning(f"RC webhook: unknown user_id={user_id}; dropping event")
        return {"status": "unknown_user"}

    current_plan = (doc.get("plan") or "free").lower()
    if current_plan in LEGACY_TIERS:
        # Grandfathered — RevenueCat should never touch these users.
        logger.info(
            f"RC webhook: legacy user {user_id} ({doc.get('email')}) on {current_plan}; "
            f"ignoring {event.get('type')}"
        )
        return {"status": "grandfathered", "plan": current_plan}

    target_plan = "pro" if active else "free"
    update = {
        "plan": target_plan,
        "plan_updated_at": iso(now_utc()),
        "subscription_source": "revenuecat",
    }
    product_id = event.get("product_id")
    if product_id:
        update["subscription_product_id"] = product_id
    exp_ms = event.get("expiration_at_ms")
    update["subscription_expires_at"] = (
        None if not exp_ms else iso(datetime.fromtimestamp(exp_ms / 1000, tz=timezone.utc))
    )
    await db.users.update_one({"user_id": user_id}, {"$set": update})
    if current_plan != target_plan:
        logger.info(
            f"RC webhook: user {user_id} ({doc.get('email')}) {current_plan} → "
            f"{target_plan} (event={event.get('type')}, product={product_id})"
        )
    return {"status": "updated", "plan": target_plan}


@router.post("/webhook/revenuecat")
async def revenuecat_webhook(
    request: Request, authorization: Optional[str] = Header(None)
):
    """Authoritative entitlement updates from RevenueCat.

    Security:
      - MUST have `REVENUECAT_WEBHOOK_SECRET` set in env, else all events
        are ACKed but DROPPED (fail-secure).
      - Validates the Authorization header against the shared secret using
        a constant-time comparison. The user configures the exact string
        in RevenueCat dashboard → Integrations → Webhooks.
    """
    if not REVENUECAT_WEBHOOK_SECRET:
        logger.error(
            "RevenueCat webhook received but REVENUECAT_WEBHOOK_SECRET is "
            "not set — ignoring event. Configure it from the Emergent "
            "secrets panel + RevenueCat dashboard."
        )
        return {"received": True, "verified": False}

    provided = (authorization or "").strip()
    expected = REVENUECAT_WEBHOOK_SECRET
    # Also accept "Bearer <secret>" since that's what people usually paste.
    if provided.lower().startswith("bearer "):
        provided = provided[len("bearer "):].strip()
    if not hmac.compare_digest(provided, expected):
        logger.warning("RevenueCat webhook: bad Authorization header; rejecting.")
        raise HTTPException(status_code=401, detail="Invalid webhook authorization")

    try:
        payload = await request.json()
    except Exception as e:
        logger.warning(f"RevenueCat webhook: unparsable JSON: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")

    if not isinstance(payload, dict):
        logger.warning("RevenueCat webhook: payload is not an object")
        raise HTTPException(status_code=400, detail="Payload must be a JSON object")

    event = payload.get("event") or {}
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="event must be an object")
    event_type = (event.get("type") or "").upper()
    app_user_id = event.get("app_user_id")
    if not app_user_id:
        logger.warning(f"RC webhook: missing app_user_id in {event_type}")
        return {"received": True, "verified": True, "processed": False, "reason": "no_user_id"}

    if event_type in ACTIVATE_EVENTS:
        result = await _apply_entitlement(app_user_id, active=True, event=event)
    elif event_type in DEACTIVATE_EVENTS:
        result = await _apply_entitlement(app_user_id, active=False, event=event)
    else:
        # TEST events and other informational types we just ACK.
        logger.info(f"RC webhook: ignored event type {event_type} for {app_user_id}")
        return {"received": True, "verified": True, "processed": False, "reason": "ignored_type"}

    return {"received": True, "verified": True, "processed": True, **result}
