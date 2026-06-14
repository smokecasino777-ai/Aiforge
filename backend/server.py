"""AiForge Backend - slim FastAPI entrypoint.

All route logic lives in `routes/*.py`. Shared config, DB handles, JWT,
admin helpers and Stripe-key utilities live in `core.py`. Pydantic models
live in `models.py`.
"""
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from core import db, logger, mongo_client
from routes import admin, assets, auth, avatar, checkout, editor, generation, legal, referrals

app = FastAPI(title="AiForge API")
api = APIRouter(prefix="/api")


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


@app.on_event("startup")
async def on_startup():
    await _safe_create_index(db.users, "email", unique=True)
    await _safe_create_index(db.users, "user_id", unique=True)
    await _safe_create_index(db.creations, [("user_id", 1), ("created_at", -1)])
    await _safe_create_index(db.creations, "creation_id", unique=True)
    await _safe_create_index(db.usage, [("user_id", 1), ("day", 1)], unique=True)
    await _safe_create_index(db.payments, "session_id", unique=True)
    logger.info("AiForge backend started")


@app.on_event("shutdown")
async def on_shutdown():
    mongo_client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
