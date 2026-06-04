"""AiForge Backend - slim FastAPI entrypoint.

All route logic lives in `routes/*.py`. Shared config, DB handles, JWT,
admin helpers and Stripe-key utilities live in `core.py`. Pydantic models
live in `models.py`.
"""
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from core import db, logger, mongo_client
from routes import admin, auth, checkout, generation, legal, referrals

app = FastAPI(title="AiForge API")
api = APIRouter(prefix="/api")


# ----- Health -----
@api.get("/")
async def root():
    return {"name": "AiForge API", "status": "ok"}


# ----- Routers -----
api.include_router(legal.router)
api.include_router(auth.router)
api.include_router(referrals.router)
api.include_router(generation.router)
api.include_router(checkout.router)
api.include_router(admin.router)


# ----- Startup / Shutdown -----
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.creations.create_index([("user_id", 1), ("created_at", -1)])
    await db.creations.create_index("creation_id", unique=True)
    await db.usage.create_index([("user_id", 1), ("day", 1)], unique=True)
    await db.payments.create_index("session_id", unique=True)
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
