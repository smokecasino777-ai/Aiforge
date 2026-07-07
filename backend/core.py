"""AiForge Backend - shared configuration, helpers, and DB handles.

Everything that is imported by more than one route module lives here.
Keeping this module small + dependency-free of any route logic.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import httpx
import jwt as pyjwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
# IMPORTANT: do NOT pass override=True here. In production (Kubernetes), real
# env vars (MONGO_URL, DB_NAME, EMERGENT_LLM_KEY, JWT_SECRET, …) are injected
# at runtime and MUST win over anything in the local .env file. We only fill in
# values that aren't already set.
load_dotenv(ROOT_DIR / ".env", override=False)

# ----- Configuration -----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_SECRET = os.environ.get("JWT_SECRET", "aiforge-secret-change-me")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 7
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
ADMIN_EMAIL = (os.environ.get("ADMIN_EMAIL") or "").lower().strip()

# Runtime container so /api/admin endpoints can hot-swap the live Stripe key
# without restarting the backend.
RUNTIME = {
    "stripe_api_key": STRIPE_API_KEY,
    "stripe_updated_at": os.environ.get("STRIPE_KEY_UPDATED_AT") or "",
    "stripe_fingerprint": os.environ.get("STRIPE_KEY_FINGERPRINT") or "",
}


def current_stripe_key() -> str:
    return RUNTIME["stripe_api_key"] or "sk_test_emergent"


def stripe_mode_of(key: str) -> str:
    if not key:
        return "unknown"
    if key.startswith("sk_live_"):
        return "live"
    if key.startswith("sk_test_") and key != "sk_test_emergent":
        return "test"
    if key == "sk_test_emergent":
        return "sandbox"
    return "unknown"


# ----- DB -----
# Which database are we actually allowed to use? It differs by environment:
#   • Local dev: mongodb://localhost:27017 (no URI db) + DB_NAME from .env.
#   • Emergent production: Atlas URI whose path db (get_default_database())
#     may NOT match the db the scoped Atlas user is authorized on — seen as
#     `OperationFailure: not authorized on <db> to execute command { find … }`.
# We therefore start from a best guess and, at startup, PROBE candidates
# (URI default, DB_NAME env, and the dbs granted in the user's Mongo roles)
# with a cheap `find`, then re-point to the first authorized one.
mongo_client = AsyncIOMotorClient(MONGO_URL)


class MongoProxy:
    """Stable `db` handle for `from core import db` importers.

    Forwards all attribute/collection access to the currently selected
    database, and can be re-pointed once select_authorized_db() discovers
    which database the connected Mongo user can actually read.
    """

    def __init__(self, initial):
        object.__setattr__(self, "_db", initial)

    def point_to(self, real_db) -> None:
        object.__setattr__(self, "_db", real_db)

    @property
    def name(self) -> str:
        return self._db.name

    def __getattr__(self, item):
        return getattr(object.__getattribute__(self, "_db"), item)

    def __getitem__(self, item):
        return object.__getattribute__(self, "_db")[item]


try:
    _uri_default_db = mongo_client.get_default_database()
except Exception:
    _uri_default_db = None

db = MongoProxy(_uri_default_db if _uri_default_db is not None else mongo_client[DB_NAME])


async def select_authorized_db() -> None:
    """Probe candidate databases and point `db` at the first authorized one.

    Runs once at startup, BEFORE index creation and admin seeding. Candidates,
    in order: the URI's default database, the DB_NAME env var, then any
    database granted in the connected user's roles (via connectionStatus,
    which any authenticated user may run). Never raises.
    """
    candidates: List[str] = []
    if _uri_default_db is not None:
        candidates.append(_uri_default_db.name)
    if DB_NAME and DB_NAME not in candidates:
        candidates.append(DB_NAME)
    try:
        status = await mongo_client.admin.command({"connectionStatus": 1})
        roles = (status.get("authInfo") or {}).get("authenticatedUserRoles") or []
        for role in roles:
            role_db = role.get("db")
            if role_db and role_db not in ("admin", "local", "config") and role_db not in candidates:
                candidates.append(role_db)
    except Exception as e:
        logger.warning(f"connectionStatus probe failed: {type(e).__name__}: {str(e)[:120]}")

    for name in candidates:
        try:
            await mongo_client[name].users.find_one({}, {"_id": 1})
            db.point_to(mongo_client[name])
            logger.info(f"Using MongoDB database '{name}'")
            return
        except Exception as e:
            logger.warning(
                f"DB candidate '{name}' not usable: {type(e).__name__}: {str(e)[:120]}"
            )
    logger.warning(
        f"No authorized DB found among {candidates}; keeping '{db.name}'"
    )

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("aiforge")

# ----- Plan config -----
PLAN_LIMITS = {
    "free": 5,
    "spark": 50,
    "forge": 200,
    "neon": 500,
    "quantum": 2000,
    "singularity": 99999,
}
PLAN_PRICES = {
    "spark": 9.99,
    "forge": 29.99,
    "neon": 49.99,
    "quantum": 99.99,
    "singularity": 199.99,
}
PLAN_NAMES = {
    "free": "Free",
    "spark": "Spark",
    "forge": "Forge",
    "neon": "Neon Pro",
    "quantum": "Quantum",
    "singularity": "Singularity",
}

# ----- HTTP security -----
security = HTTPBearer(auto_error=False)


# ----- Time helpers -----
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ----- JWT helpers -----
def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now_utc() + timedelta(days=JWT_EXP_DAYS)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing token")
    token = credentials.credentials
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ----- Usage tracking -----
async def daily_used(user_id: str) -> int:
    today = now_utc().date().isoformat()
    rec = await db.usage.find_one(
        {"user_id": user_id, "day": today}, {"_id": 0}
    )
    return int(rec["count"]) if rec else 0


async def increment_usage(user_id: str) -> None:
    today = now_utc().date().isoformat()
    await db.usage.update_one(
        {"user_id": user_id, "day": today},
        {"$inc": {"count": 1}, "$set": {"updated_at": iso(now_utc())}},
        upsert=True,
    )


# Imported here to keep models.py loadable from anywhere.
from models import UserOut  # noqa: E402


async def user_to_out(user: dict) -> UserOut:
    used = await daily_used(user["user_id"])
    plan = user.get("plan", "free")
    base_limit = PLAN_LIMITS.get(plan, 5)
    bonus_amount = 0
    bonus_until_iso: Optional[str] = None
    bonus_until = user.get("bonus_until")
    if bonus_until:
        try:
            ts = datetime.fromisoformat(bonus_until)
            if ts > now_utc():
                bonus_amount = int(user.get("bonus_amount", 0) or 0)
                bonus_until_iso = bonus_until
        except Exception:
            pass
    return UserOut(
        id=user["user_id"],
        email=user["email"],
        name=user.get("name"),
        picture=user.get("picture"),
        plan=plan,
        daily_used=used,
        daily_limit=base_limit + bonus_amount,
        referral_code=user.get("referral_code"),
        bonus_until=bonus_until_iso,
        bonus_amount=bonus_amount,
    )


def make_referral_code(user_id: str) -> str:
    suffix = (user_id.split("_")[-1] or user_id)[-6:].upper()
    return f"AF-{suffix}"


# ----- Admin helpers -----
SUDO_EXP_MINUTES = 15


def is_admin(user: dict) -> bool:
    if ADMIN_EMAIL and (user.get("email") or "").lower() == ADMIN_EMAIL:
        return True
    return bool(user.get("is_admin"))


async def ensure_admin(user: dict) -> dict:
    if is_admin(user):
        return user
    raise HTTPException(status_code=403, detail="Admin access required")


def make_sudo_token(user_id: str) -> str:
    """Short-lived second-factor token for the sensitive admin panel."""
    payload = {
        "sub": user_id,
        "sudo": True,
        "exp": now_utc() + timedelta(minutes=SUDO_EXP_MINUTES),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def verify_sudo_token(token: str, user_id: str) -> bool:
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return bool(payload.get("sudo")) and payload.get("sub") == user_id
    except Exception:
        return False


# ----- Stripe-key admin utilities -----
def key_fingerprint(key: str) -> str:
    if not key:
        return ""
    head = key[:8]
    tail = key[-4:]
    return f"{head}…{tail}"


def persist_env_var(name: str, value: str) -> None:
    """Update or append KEY=VALUE in backend/.env, atomically."""
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        env_path.write_text(f"{name}={value}\n")
        return
    lines = env_path.read_text().splitlines()
    found = False
    new_lines: List[str] = []
    for line in lines:
        if line.strip().startswith(f"{name}=") or line.strip().startswith(f"{name} ="):
            new_lines.append(f"{name}={value}")
            found = True
        else:
            new_lines.append(line)
    if not found:
        new_lines.append(f"{name}={value}")
    tmp_path = env_path.with_suffix(".env.tmp")
    tmp_path.write_text("\n".join(new_lines) + "\n")
    tmp_path.replace(env_path)


async def validate_stripe_key(key: str) -> tuple[bool, str]:
    """Hit a cheap Stripe endpoint with the key to confirm it's valid."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as h:
            r = await h.get(
                "https://api.stripe.com/v1/balance",
                auth=(key, ""),
            )
        if r.status_code == 200:
            return True, "Key validated against Stripe."
        try:
            err = r.json().get("error", {}).get("message") or f"HTTP {r.status_code}"
        except Exception:
            err = f"HTTP {r.status_code}"
        return False, err
    except Exception as e:
        return False, str(e)[:200]
