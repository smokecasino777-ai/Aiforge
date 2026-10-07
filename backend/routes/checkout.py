"""Plans + Stripe checkout + webhook."""
from typing import Optional

from emergentintegrations.payments.stripe.checkout import (
    CheckoutSessionRequest,
    StripeCheckout,
)
from fastapi import APIRouter, Depends, Header, HTTPException, Request

from core import (
    BACKEND_PUBLIC_URL,
    PLAN_LIMITS,
    PLAN_PRICES,
    STRIPE_WEBHOOK_SECRET,
    current_stripe_key,
    db,
    get_current_user,
    iso,
    logger,
    now_utc,
)
from models import CheckoutRequest, CheckoutResponse

router = APIRouter(tags=["checkout"])


@router.get("/plans")
async def plans_list():
    return [
        {
            "id": "free",
            "name": "Free",
            "price": 0.0,
            "limit": PLAN_LIMITS["free"],
            "features": [
                "5 generations / day",
                "Image, Video, 3D, Chat",
                "Save to Library",
                "Watermarked exports",
            ],
        },
        {
            "id": "spark",
            "name": "Spark",
            "price": PLAN_PRICES["spark"],
            "limit": PLAN_LIMITS["spark"],
            "features": [
                "50 generations / day",
                "No watermark",
                "Priority queue",
                "HD outputs",
                "Save unlimited",
            ],
        },
        {
            "id": "forge",
            "name": "Forge",
            "price": PLAN_PRICES["forge"],
            "limit": PLAN_LIMITS["forge"],
            "features": [
                "200 generations / day",
                "Fast priority lane",
                "4K image exports",
                "Mesh SCAD export",
                "Video up to 12s",
                "CapCut-style editor",
            ],
        },
        {
            "id": "neon",
            "name": "Neon Pro",
            "price": PLAN_PRICES["neon"],
            "limit": PLAN_LIMITS["neon"],
            "features": [
                "500 generations / day",
                "Top priority",
                "Commercial license",
                "Advanced video editor",
                "Multi-AI assistant",
                "STL mesh export",
            ],
        },
        {
            "id": "quantum",
            "name": "Quantum",
            "price": PLAN_PRICES["quantum"],
            "limit": PLAN_LIMITS["quantum"],
            "features": [
                "2000 generations / day",
                "Fastest GPU lane",
                "All future models",
                "Beta features early",
                "Pro support",
                "Team sharing",
            ],
        },
        {
            "id": "singularity",
            "name": "Singularity",
            "price": PLAN_PRICES["singularity"],
            "limit": PLAN_LIMITS["singularity"],
            "features": [
                "Unlimited generations",
                "Dedicated GPU pod",
                "White-glove support",
                "Early model access",
                "Commercial + reseller license",
                "API access (beta)",
            ],
        },
    ]


@router.post("/checkout/create", response_model=CheckoutResponse)
async def create_checkout(
    req: CheckoutRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    amount = PLAN_PRICES.get(req.plan)
    if amount is None:
        raise HTTPException(status_code=400, detail="Invalid plan")
    origin = req.origin_url.rstrip("/")
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment/cancel"
    # Stripe webhooks must land on a stable https backend URL. NEVER trust the
    # client-supplied origin for webhook_url (native apps pass app deep links
    # which Stripe can't reach). Prefer BACKEND_PUBLIC_URL env, else derive
    # from the incoming request's host header.
    backend_base = BACKEND_PUBLIC_URL or str(request.base_url).rstrip("/")
    webhook_url = f"{backend_base}/api/webhook/stripe"
    sc = StripeCheckout(api_key=current_stripe_key(), webhook_url=webhook_url)
    sess_req = CheckoutSessionRequest(
        amount=amount,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "plan": req.plan,
            "purpose": "aiforge_subscription",
        },
    )
    try:
        sess = await sc.create_checkout_session(sess_req)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {str(e)[:200]}")
    await db.payments.insert_one(
        {
            "session_id": sess.session_id,
            "user_id": user["user_id"],
            "plan": req.plan,
            "amount": amount,
            "currency": "usd",
            "status": "initiated",
            "payment_status": "pending",
            "created_at": iso(now_utc()),
        }
    )
    return CheckoutResponse(url=sess.url, session_id=sess.session_id)


@router.get("/checkout/status/{session_id}")
async def checkout_status(
    session_id: str, user: dict = Depends(get_current_user)
):
    pay = await db.payments.find_one(
        {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")

    if pay.get("payment_status") == "paid":
        return {
            "session_id": session_id,
            "status": pay.get("status") or "complete",
            "payment_status": "paid",
            "amount_total": int(pay["amount"] * 100),
            "currency": pay.get("currency", "usd"),
            "plan": pay["plan"],
        }

    sc = StripeCheckout(api_key=current_stripe_key())
    stripe_status = None
    stripe_payment_status = None
    try:
        status_obj = await sc.get_checkout_status(session_id)
        stripe_status = status_obj.status
        stripe_payment_status = status_obj.payment_status
    except Exception as e:
        logger.warning(f"Stripe status lookup failed for {session_id}: {e}")

    # SECURITY: Only Stripe is authoritative. We do NOT trust the browser
    # redirect, the "recent" timestamp, or the owner match. If Stripe cannot
    # confirm payment, the plan stays as-is. The webhook (verified by signing
    # secret) is the only other path that can mark a session paid.
    paid = stripe_payment_status == "paid"

    if paid:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"plan": pay["plan"], "plan_updated_at": iso(now_utc())}},
        )
        await db.payments.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "payment_status": "paid",
                    "status": stripe_status or "complete",
                    "paid_at": iso(now_utc()),
                }
            },
        )

    return {
        "session_id": session_id,
        "status": stripe_status or pay.get("status", "initiated"),
        "payment_status": stripe_payment_status or pay.get("payment_status", "pending"),
        "amount_total": int(pay["amount"] * 100),
        "currency": pay.get("currency", "usd"),
        "plan": pay["plan"],
    }


@router.post("/webhook/stripe")
async def stripe_webhook(
    request: Request, stripe_signature: Optional[str] = Header(None)
):
    """Stripe webhook — authoritative source for plan upgrades.

    SECURITY: We require a webhook signing secret (`STRIPE_WEBHOOK_SECRET`
    from Stripe dashboard). Without it, no plan upgrades happen — fail
    secure. This blocks the "anonymous attacker forges a webhook" attack.
    """
    body = await request.body()

    if not STRIPE_WEBHOOK_SECRET:
        # Not configured yet. We ACK so Stripe doesn't retry forever, but we
        # do NOT touch any plan. The owner must set STRIPE_WEBHOOK_SECRET
        # before paid upgrades will work via webhook.
        logger.error(
            "Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set — "
            "ignoring event. Set it from the Stripe dashboard."
        )
        return {"received": True, "verified": False}

    if not stripe_signature:
        logger.warning("Stripe webhook missing Stripe-Signature header; rejecting.")
        raise HTTPException(status_code=400, detail="Missing signature")

    sc = StripeCheckout(
        api_key=current_stripe_key(),
        webhook_secret=STRIPE_WEBHOOK_SECRET,
    )
    try:
        event = await sc.handle_webhook(body, stripe_signature)
    except Exception as e:
        logger.warning(f"Stripe webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    md = event.metadata or {}
    user_id = md.get("user_id")
    plan = md.get("plan")
    if event.payment_status != "paid" or not user_id or not plan:
        return {"received": True, "verified": True, "processed": False}

    # Idempotency: Stripe retries webhooks on 5xx and sometimes duplicates.
    # If the payment row is already marked paid we must not re-apply.
    if event.session_id:
        existing = await db.payments.find_one(
            {"session_id": event.session_id},
            {"_id": 0, "payment_status": 1, "plan": 1, "user_id": 1},
        )
        if existing and existing.get("payment_status") == "paid":
            return {"received": True, "verified": True, "processed": False, "reason": "already_paid"}
        # Also sanity-check the user_id/plan match our stored intent so a
        # tampered metadata field can't upgrade the wrong account.
        if existing and (
            existing.get("user_id") != user_id or existing.get("plan") != plan
        ):
            logger.warning(
                f"Webhook metadata mismatch for session {event.session_id}: "
                f"stored=({existing.get('user_id')},{existing.get('plan')}) "
                f"event=({user_id},{plan}); ignoring."
            )
            return {"received": True, "verified": True, "processed": False, "reason": "metadata_mismatch"}

    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"plan": plan, "plan_updated_at": iso(now_utc())}},
    )
    if event.session_id:
        await db.payments.update_one(
            {"session_id": event.session_id},
            {
                "$set": {
                    "payment_status": "paid",
                    "status": "complete",
                    "paid_at": iso(now_utc()),
                }
            },
        )
    logger.info(f"Webhook upgraded {user_id} to plan {plan}")
    return {"received": True, "verified": True, "processed": True}
