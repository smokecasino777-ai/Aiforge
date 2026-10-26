"""AiForge Backend - slim FastAPI entrypoint.

All route logic lives in `routes/*.py`. Shared config, DB handles, JWT,
admin helpers and Stripe-key utilities live in `core.py`. Pydantic models
live in `models.py`.
"""
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.middleware.cors import CORSMiddleware

import os
import uuid

import bcrypt

from core import (
    ADMIN_EMAIL,
    APP_ENV,
    CORS_ORIGINS,
    db,
    iso,
    limiter,
    logger,
    make_referral_code,
    mongo_client,
    now_utc,
    select_authorized_db,
)
from routes import admin, assets, auth, avatar, checkout, editor, generation, legal, referrals, subscription, tokens, voice

# AiForge API - Triggering deployment
# In production, hide the admin API surface from drive-by probes.
_IS_PROD = APP_ENV == "production"
app = FastAPI(
    title="AiForge API",
    docs_url=None if _IS_PROD else "/docs",
    redoc_url=None if _IS_PROD else "/redoc",
    openapi_url=None if _IS_PROD else "/openapi.json",
)

# Rate limiter (slowapi) — attached before any routes mount.
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please slow down and try again shortly."
        },
    )


api = APIRouter(prefix="/api")


@app.get("/")
async def root_health():
    """Deployment/LB health probes hit the bare root path — must return 200."""
    return {"status": "ok", "service": "AiForge API"}


@app.get("/health")
async def health():
    """Kubernetes/EAS liveness probe path — must return 200."""
    return {"status": "ok", "service": "AiForge API"}


# ----- Health -----
@api.get("/")
async def root():
    return {"name": "AiForge API", "status": "ok"}


# ----- Routers -----
api.include_router(legal.router)
api.include_router(assets.router)
api.include_router(auth.router)
api.include_router(referrals.router)
api.include_router(generation.router)
api.include_router(checkout.router)
api.include_router(subscription.router)
api.include_router(tokens.router)
api.include_router(voice.router)
api.include_router(editor.router)
api.include_router(avatar.router)
api.include_router(admin.router)


# ----- Startup / Shutdown -----
async def _safe_create_index(collection, keys, **opts):
    """Create an index but never crash startup if the DB user is unprivileged.

    Atlas-managed users on shared/serverless tiers often have `readWrite` but
    not `dbAdmin`, so `createIndexes` returns code 13 (Unauthorized). Indexes
    are an optimization, not a correctness requirement, so we log and move on.
    """
    try:
        await collection.create_index(keys, **opts)
    except Exception as e:
        # OperationFailure code 13 == Unauthorized; also catch anything else
        # the driver throws so a bad index never bricks the deployment.
        logger.warning(
            f"Index skipped on {collection.name} ({keys}): {type(e).__name__}: {str(e)[:160]}"
        )


async def _seed_admin():
    """Idempotently guarantee the single owner/admin account exists.

    - Creates the ADMIN_EMAIL account with ADMIN_PASSWORD on first boot in
      any environment (local dev AND fresh production DBs).
    - Never overwrites an existing password on restart.
    - Strips stale `is_admin` flags from every other account (e.g. the old
      demo owner) so exactly one admin exists.
    """
    if not ADMIN_EMAIL:
        return
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    try:
        existing = await db.users.find_one(
            {"email": ADMIN_EMAIL}, {"_id": 0, "user_id": 1, "is_admin": 1}
        )
        if existing:
            # Enforce owner privileges even if the row predates this seed
            # (fixes owner stuck on 'free' plan and throttled at 5/day).
            await db.users.update_one(
                {"email": ADMIN_EMAIL},
                {"$set": {"is_admin": True, "plan": "singularity"}},
            )
        elif admin_password:
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            await db.users.insert_one(
                {
                    "user_id": user_id,
                    "email": ADMIN_EMAIL,
                    "name": "Owner",
                    "picture": None,
                    "password_hash": bcrypt.hashpw(
                        admin_password.encode(), bcrypt.gensalt()
                    ).decode(),
                    "plan": "singularity",
                    "created_at": iso(now_utc()),
                    "auth_provider": "email",
                    "referral_code": make_referral_code(user_id),
                    "is_admin": True,
                }
            )
            logger.info(f"Seeded owner/admin account {ADMIN_EMAIL}")
        await db.users.update_many(
            {"is_admin": True, "email": {"$ne": ADMIN_EMAIL}},
            {"$unset": {"is_admin": ""}},
        )
    except Exception as e:
        logger.warning(f"Admin seed skipped: {type(e).__name__}: {str(e)[:160]}")


async def _backfill_free_gens():
    """One-time gift of 5 free gens (30-day window) for pre-existing free
    users who registered before the token system shipped.

    Idempotent — only touches rows that are MISSING both fields, so running
    this on every boot is safe. Admin, Pro, and legacy paid users are left
    alone because they already have unlimited (or large) daily caps.
    """
    try:
        from core import FREE_SIGNUP_GENS, FREE_SIGNUP_WINDOW_DAYS  # local import to avoid cycle
        from datetime import timedelta
        expires = iso(now_utc() + timedelta(days=FREE_SIGNUP_WINDOW_DAYS))
        res = await db.users.update_many(
            {
                "plan": "free",
                "free_gens_remaining": {"$exists": False},
            },
            {
                "$set": {
                    "free_gens_remaining": FREE_SIGNUP_GENS,
                    "free_gens_expires_at": expires,
                    "tokens_balance": 0,
                    "tokens_total_purchased": 0,
                    "backfilled_free_gens_at": iso(now_utc()),
                }
            },
        )
        if res.modified_count:
            logger.info(
                f"Backfilled {res.modified_count} free user(s) with "
                f"{FREE_SIGNUP_GENS} free gens (expires {expires})"
            )
    except Exception as e:
        logger.warning(
            f"Free-gen backfill skipped: {type(e).__name__}: {str(e)[:160]}"
        )


@app.on_event("startup")
async def on_startup():
    # Must run FIRST: points `db` at the database this Mongo user is actually
    # authorized on (Atlas users in production are scoped to a single db that
    # may not match the URI's default database).
    await select_authorized_db()
    await _safe_create_index(db.users, "email", unique=True)
    await _safe_create_index(db.users, "user_id", unique=True)
    await _safe_create_index(db.creations, [("user_id", 1), ("created_at", -1)])
    await _safe_create_index(db.creations, "creation_id", unique=True)
    await _safe_create_index(db.usage, [("user_id", 1), ("day", 1)], unique=True)
    await _safe_create_index(db.payments, "session_id", unique=True)
    # token_ledger: idempotency on transaction_id so RevenueCat retries never
    # double-credit a user's token pack.
    await _safe_create_index(
        db.token_ledger, "transaction_id", unique=True, sparse=True
    )
    await _safe_create_index(
        db.token_ledger, [("user_id", 1), ("created_at", -1)]
    )
    await _seed_admin()
    # Backfill free-gen gift for pre-existing free users who registered
    # before the token system shipped. Idempotent (only touches rows
    # missing both fields).
    await _backfill_free_gens()
    logger.info("AiForge backend started")


@app.on_event("shutdown")
async def on_shutdown():
    mongo_client.close()


app.include_router(api)

# CORS — mobile apps don't need CORS, but the web preview + Emergent custom
# domain do. In production we require an explicit allowlist via CORS_ORIGINS;
# in preview/dev we fall back to a permissive config so the live preview
# panel works out of the box.
if _IS_PROD and CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Preview / dev: wildcard origins. The combo with allow_credentials=True
    # is a no-op per the CORS spec, so we explicitly disable credentials to
    # avoid any implementation surprises.
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
