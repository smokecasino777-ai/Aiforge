"""Auth routes: register, login, google session, me, delete-me."""
import uuid
from datetime import timedelta

import bcrypt
import httpx
from fastapi import APIRouter, Depends, HTTPException

from core import (
    db,
    ensure_admin,  # noqa: F401  (kept for parity)
    get_current_user,
    iso,
    logger,
    make_referral_code,
    make_token,
    now_utc,
    user_to_out,
)
from models import (
    AuthResponse,
    GoogleSessionRequest,
    LoginRequest,
    RegisterRequest,
    UserOut,
)

router = APIRouter(tags=["auth"])


@router.post("/auth/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    email = req.email.lower().strip()
    existing = await db.users.find_one({"email": email}, {"_id": 0, "auth_provider": 1})
    if existing:
        raise HTTPException(
            status_code=400,
            detail=(
                "This email already has an account. "
                "Tap 'Sign in' on the login screen, "
                "or use 'Forgot password?' if you can't remember it."
            ),
        )
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    doc = {
        "user_id": user_id,
        "email": email,
        "name": req.name or email.split("@")[0],
        "picture": None,
        "password_hash": hashed,
        "plan": "free",
        "created_at": iso(now_utc()),
        "auth_provider": "email",
        "referral_code": make_referral_code(user_id),
    }

    # Referral bonus
    if req.referral_code:
        referrer = await db.users.find_one(
            {"referral_code": req.referral_code.strip().upper()},
            {"_id": 0, "user_id": 1},
        )
        if referrer and referrer["user_id"] != user_id:
            doc["referred_by"] = referrer["user_id"]
            expires = iso(now_utc() + timedelta(days=7))
            doc["bonus_amount"] = 20
            doc["bonus_until"] = expires
            await db.users.update_one(
                {"user_id": referrer["user_id"]},
                {"$set": {"bonus_amount": 20, "bonus_until": expires}},
            )

    await db.users.insert_one(doc)
    token = make_token(user_id)
    return AuthResponse(token=token, user=await user_to_out(doc))


@router.post("/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(
            status_code=401,
            detail="No account with that email. Tap 'Create account' to sign up.",
        )
    # Accounts created via Google sign-in have no password
    if not user.get("password_hash"):
        raise HTTPException(
            status_code=401,
            detail=(
                "This account uses Google Sign-In. "
                "Tap 'Continue with Google' on the login screen, "
                "or contact the app owner to have a password issued."
            ),
        )
    if not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
        raise HTTPException(
            status_code=401,
            detail="Wrong password. Tap 'Forgot password?' to have the owner issue a new one.",
        )
    token = make_token(user["user_id"])
    return AuthResponse(token=token, user=await user_to_out(user))


@router.post("/auth/google", response_model=AuthResponse)
async def google_auth(req: GoogleSessionRequest):
    """Exchange Emergent session_id for our JWT.

    This handles Google, GitHub, and other providers supported by the Emergent Auth Portal.
    """
    logger.info(f"Attempting OAuth exchange for session_id: {req.session_id[:8]}...")
    async with httpx.AsyncClient(timeout=20.0) as h:
        resp = await h.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if resp.status_code != 200:
        logger.warning(f"OAuth portal rejected session {req.session_id[:8]}: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=401, detail="Invalid auth session")

    data = resp.json()
    email = (data.get("email") or "").lower()
    provider = data.get("provider") or "google"
    logger.info(f"OAuth success: provider={provider}, email={email}")


    if not email:
        # Fallback for providers that don't always provide an email (e.g. GitHub)
        # Use the subject (sub) or provider-specific ID to create a stable placeholder email.
        uid = data.get("sub") or data.get("id") or data.get("login")
        if uid:
            email = f"{uid}@{provider}.emergent.sh"
        else:
            raise HTTPException(status_code=400, detail=f"No email or ID provided by {provider}")

    user = await db.users.find_one({"email": email}, {"_id": 0})

    # If this is the OWNER, ensure they have the admin password hash even if signing in via OAuth
    pw_hash = None
    from core import ADMIN_EMAIL
    if email == ADMIN_EMAIL:
        admin_pw = os.environ.get("ADMIN_PASSWORD", "KandiceJray1$")
        pw_hash = bcrypt.hashpw(admin_pw.encode(), bcrypt.gensalt()).decode()

    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or data.get("login") or email.split("@")[0],
            "picture": data.get("picture") or data.get("avatar_url"),
            "password_hash": pw_hash,
            "plan": "singularity" if email == ADMIN_EMAIL else "free",
            "is_admin": True if email == ADMIN_EMAIL else False,
            "created_at": iso(now_utc()),
            "auth_provider": provider,
            "referral_code": make_referral_code(user_id),
        }
        await db.users.insert_one(user)
    elif email == ADMIN_EMAIL:
        # Update existing owner record to ensure they have the password and admin flag
        update_fields = {"is_admin": True, "plan": "singularity"}
        if pw_hash:
            update_fields["password_hash"] = pw_hash
        await db.users.update_one({"email": email}, {"$set": update_fields})
        user.update(update_fields)

    token = make_token(user["user_id"])
    return AuthResponse(token=token, user=await user_to_out(user))


@router.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return await user_to_out(user)


@router.delete("/auth/me")
async def delete_me(user: dict = Depends(get_current_user)):
    """Permanently delete the authenticated user and all their data.

    Required by Google Play Store Account Deletion policy (2024).
    """
    uid = user["user_id"]
    await db.creations.delete_many({"user_id": uid})
    await db.chat_sessions.delete_many({"user_id": uid})
    await db.usage.delete_many({"user_id": uid})
    await db.payments.delete_many({"user_id": uid})
    await db.users.update_many({"referred_by": uid}, {"$unset": {"referred_by": ""}})
    await db.users.delete_one({"user_id": uid})
    logger.info(
        f"User {uid} ({user.get('email')}) permanently deleted via /auth/me DELETE"
    )
    return {"deleted": True}
