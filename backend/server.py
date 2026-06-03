"""AiForge Backend - FastAPI server."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, BackgroundTasks, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import uuid
import base64
import bcrypt
import jwt as pyjwt
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ----- Configuration -----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_SECRET = os.environ.get("JWT_SECRET", "aiforge-secret-change-me")
JWT_ALG = "HS256"
JWT_EXP_DAYS = 7
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("aiforge")

# ----- Plan config -----
PLAN_LIMITS = {"free": 5, "spark": 30, "forge": 100, "neon": 500, "quantum": 9999}
PLAN_PRICES = {"spark": 4.99, "forge": 9.99, "neon": 19.99, "quantum": 39.99}
PLAN_NAMES = {"free": "Free", "spark": "Spark", "forge": "Forge", "neon": "Neon Pro", "quantum": "Quantum"}

# ----- Models -----
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class GoogleSessionRequest(BaseModel):
    session_id: str

class UserOut(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    plan: str = "free"
    daily_used: int = 0
    daily_limit: int = 5

class AuthResponse(BaseModel):
    token: str
    user: UserOut

class GenerateRequest(BaseModel):
    type: Literal["image", "video", "model3d", "chat"]
    prompt: str
    title: Optional[str] = None
    # video options
    duration: Optional[int] = 4
    size: Optional[str] = "1280x720"

class ChatRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

class CreationOut(BaseModel):
    id: str
    type: str
    title: str
    prompt: str
    status: str  # "ready" | "processing" | "failed"
    media_data: Optional[str] = None  # base64
    media_mime: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[int] = None

class CheckoutRequest(BaseModel):
    plan: Literal["spark", "forge", "neon"]
    origin_url: str

class CheckoutResponse(BaseModel):
    url: str
    session_id: str

# ----- App -----
app = FastAPI(title="AiForge API")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


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


async def daily_used(user_id: str) -> int:
    today = now_utc().date().isoformat()
    rec = await db.usage.find_one({"user_id": user_id, "day": today}, {"_id": 0})
    return int(rec["count"]) if rec else 0


async def increment_usage(user_id: str) -> None:
    today = now_utc().date().isoformat()
    await db.usage.update_one(
        {"user_id": user_id, "day": today},
        {"$inc": {"count": 1}, "$set": {"updated_at": iso(now_utc())}},
        upsert=True,
    )


async def user_to_out(user: dict) -> UserOut:
    used = await daily_used(user["user_id"])
    plan = user.get("plan", "free")
    return UserOut(
        id=user["user_id"],
        email=user["email"],
        name=user.get("name"),
        picture=user.get("picture"),
        plan=plan,
        daily_used=used,
        daily_limit=PLAN_LIMITS.get(plan, 5),
    )


# ----- Health -----
@api.get("/")
async def root():
    return {"name": "AiForge API", "status": "ok"}


# ----- Auth -----
@api.post("/auth/register", response_model=AuthResponse)
async def register(req: RegisterRequest):
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    doc = {
        "user_id": user_id,
        "email": req.email.lower(),
        "name": req.name or req.email.split("@")[0],
        "picture": None,
        "password_hash": hashed,
        "plan": "free",
        "created_at": iso(now_utc()),
        "auth_provider": "email",
    }
    await db.users.insert_one(doc)
    token = make_token(user_id)
    return AuthResponse(token=token, user=await user_to_out(doc))


@api.post("/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest):
    user = await db.users.find_one({"email": req.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_token(user["user_id"])
    return AuthResponse(token=token, user=await user_to_out(user))


@api.post("/auth/google", response_model=AuthResponse)
async def google_auth(req: GoogleSessionRequest):
    """Exchange Emergent session_id for our JWT."""
    async with httpx.AsyncClient(timeout=20.0) as h:
        resp = await h.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = resp.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="No email from Google")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "password_hash": None,
            "plan": "free",
            "created_at": iso(now_utc()),
            "auth_provider": "google",
        }
        await db.users.insert_one(user)
    token = make_token(user["user_id"])
    return AuthResponse(token=token, user=await user_to_out(user))


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return await user_to_out(user)


# ----- Generation -----
async def _generate_image_sync(prompt: str, style_3d: bool = False) -> tuple[str, str]:
    """Returns (base64_data, mime). Raises on failure."""
    final_prompt = prompt
    if style_3d:
        final_prompt = (
            f"Isometric 3D render, octane render, studio lighting, ultra detailed 3D model of: {prompt}. "
            f"Solid object on neutral background, photorealistic 3D, sharp details."
        )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"gen-{uuid.uuid4().hex}",
        system_message="You are an AI artist generating high-quality images.",
    ).with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    msg = UserMessage(text=final_prompt)
    _text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        raise RuntimeError("No image returned")
    img = images[0]
    return img["data"], img.get("mime_type", "image/png")


def _generate_video_blocking(prompt: str, duration: int, size: str) -> tuple[bytes, str]:
    gen = OpenAIVideoGeneration(api_key=EMERGENT_LLM_KEY)
    video_bytes = gen.text_to_video(
        prompt=prompt,
        model="sora-2",
        size=size if size in OpenAIVideoGeneration.SIZES else "1280x720",
        duration=duration if duration in OpenAIVideoGeneration.DURATIONS else 4,
        max_wait_time=600,
    )
    if not video_bytes:
        raise RuntimeError("No video returned")
    return video_bytes, "video/mp4"


async def _process_video_job(creation_id: str, prompt: str, duration: int, size: str):
    try:
        loop = asyncio.get_event_loop()
        video_bytes, mime = await loop.run_in_executor(
            None, _generate_video_blocking, prompt, duration, size
        )
        b64 = base64.b64encode(video_bytes).decode()
        await db.creations.update_one(
            {"creation_id": creation_id},
            {"$set": {
                "status": "ready",
                "media_data": b64,
                "media_mime": mime,
                "completed_at": iso(now_utc()),
            }},
        )
        logger.info(f"Video creation {creation_id} completed")
    except Exception as e:
        logger.exception("Video generation failed")
        await db.creations.update_one(
            {"creation_id": creation_id},
            {"$set": {"status": "failed", "error": str(e)[:300]}},
        )


def _doc_to_creation(doc: dict) -> CreationOut:
    return CreationOut(
        id=doc["creation_id"],
        type=doc["type"],
        title=doc.get("title", "Untitled"),
        prompt=doc.get("prompt", ""),
        status=doc.get("status", "ready"),
        media_data=doc.get("media_data"),
        media_mime=doc.get("media_mime"),
        error=doc.get("error"),
        created_at=doc.get("created_at", iso(now_utc())),
        width=doc.get("width"),
        height=doc.get("height"),
        duration=doc.get("duration"),
    )


@api.post("/generate", response_model=CreationOut)
async def generate(req: GenerateRequest, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, 5)
    used = await daily_used(user["user_id"])
    if used >= limit:
        raise HTTPException(status_code=402, detail=f"Daily limit reached ({limit}). Upgrade your plan.")

    creation_id = f"cr_{uuid.uuid4().hex[:14]}"
    title = (req.title or req.prompt[:60]).strip()
    base_doc = {
        "creation_id": creation_id,
        "user_id": user["user_id"],
        "type": req.type,
        "title": title,
        "prompt": req.prompt,
        "created_at": iso(now_utc()),
        "status": "processing",
    }

    if req.type in ("image", "model3d"):
        try:
            b64, mime = await _generate_image_sync(req.prompt, style_3d=(req.type == "model3d"))
        except Exception as e:
            logger.exception("Image generation failed")
            raise HTTPException(status_code=502, detail=f"Generation failed: {str(e)[:200]}")
        base_doc.update({
            "status": "ready",
            "media_data": b64,
            "media_mime": mime,
        })
        await db.creations.insert_one(base_doc)
        await increment_usage(user["user_id"])
        return _doc_to_creation(base_doc)

    if req.type == "video":
        base_doc.update({
            "status": "processing",
            "duration": req.duration or 4,
        })
        await db.creations.insert_one(base_doc)
        await increment_usage(user["user_id"])
        background.add_task(_process_video_job, creation_id, req.prompt, req.duration or 4, req.size or "1280x720")
        return _doc_to_creation(base_doc)

    if req.type == "chat":
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"chat-{user['user_id']}",
                system_message="You are AiForge Assistant, a helpful AI creative partner. Help users brainstorm prompts for images, videos and 3D models.",
            ).with_model("anthropic", "claude-sonnet-4-6")
            reply = await chat.send_message(UserMessage(text=req.prompt))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Chat failed: {str(e)[:200]}")
        base_doc.update({
            "status": "ready",
            "media_mime": "text/plain",
            "media_data": base64.b64encode(reply.encode()).decode(),
        })
        await db.creations.insert_one(base_doc)
        await increment_usage(user["user_id"])
        return _doc_to_creation(base_doc)

    raise HTTPException(status_code=400, detail="Unknown type")


@api.post("/chat", response_model=dict)
async def chat_endpoint(req: ChatRequest, user: dict = Depends(get_current_user)):
    session = req.session_id or f"chat-{user['user_id']}"
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session,
            system_message="You are AiForge Assistant, an energetic creative AI partner. Help users craft amazing prompts and answer their questions about AI generation. Be concise and helpful.",
        ).with_model("anthropic", "claude-sonnet-4-6")
        reply = await chat.send_message(UserMessage(text=req.prompt))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chat failed: {str(e)[:200]}")
    return {"reply": reply, "session_id": session}


class ScadRequest(BaseModel):
    prompt: str


@api.post("/generate/scad")
async def generate_scad(req: ScadRequest, user: dict = Depends(get_current_user)):
    """Generate OpenSCAD code for a 3D mesh from a description."""
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, 5)
    used = await daily_used(user["user_id"])
    if used >= limit:
        raise HTTPException(status_code=402, detail=f"Daily limit reached ({limit}). Upgrade your plan.")
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"scad-{uuid.uuid4().hex}",
            system_message=(
                "You are an OpenSCAD code expert. Given a description, return ONLY valid OpenSCAD code "
                "(no markdown fences, no explanations). Use parameters and modules. Output should be ready "
                "to render with openscad CLI to produce STL."
            ),
        ).with_model("anthropic", "claude-sonnet-4-6")
        code = await chat.send_message(UserMessage(text=f"Generate OpenSCAD code for: {req.prompt}"))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"SCAD generation failed: {str(e)[:200]}")
    # strip code fences if model added them
    code = code.strip()
    if code.startswith("```"):
        code = code.split("\n", 1)[1] if "\n" in code else code
        if code.endswith("```"):
            code = code.rsplit("```", 1)[0]
    creation_id = f"cr_{uuid.uuid4().hex[:14]}"
    doc = {
        "creation_id": creation_id,
        "user_id": user["user_id"],
        "type": "model3d",
        "title": (req.prompt[:60]).strip(),
        "prompt": req.prompt,
        "status": "ready",
        "media_data": base64.b64encode(code.encode()).decode(),
        "media_mime": "application/x-openscad",
        "created_at": iso(now_utc()),
        "scad_code": code,
    }
    await db.creations.insert_one(doc)
    await increment_usage(user["user_id"])
    return _doc_to_creation(doc)


# ----- Creations -----
@api.get("/creations", response_model=List[CreationOut])
async def list_creations(user: dict = Depends(get_current_user), type: Optional[str] = None, limit: int = 50):
    q: dict = {"user_id": user["user_id"]}
    if type:
        q["type"] = type
    docs = await db.creations.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return [_doc_to_creation(d) for d in docs]


@api.get("/creations/stats")
async def creation_stats(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
    ]
    counts = {"image": 0, "video": 0, "model3d": 0, "chat": 0}
    async for d in db.creations.aggregate(pipeline):
        counts[d["_id"]] = d["count"]
    return counts


@api.get("/creations/{creation_id}", response_model=CreationOut)
async def get_creation(creation_id: str, user: dict = Depends(get_current_user)):
    doc = await db.creations.find_one({"creation_id": creation_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return _doc_to_creation(doc)


@api.delete("/creations/{creation_id}")
async def delete_creation(creation_id: str, user: dict = Depends(get_current_user)):
    res = await db.creations.delete_one({"creation_id": creation_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


# ----- Plans / Stripe -----
@api.get("/plans")
async def plans_list():
    return [
        {"id": "free", "name": "Free", "price": 0.0, "limit": PLAN_LIMITS["free"], "features": ["5 generations / day", "Image, Video, 3D, Chat", "Save to Library", "Watermarked exports"]},
        {"id": "spark", "name": "Spark", "price": PLAN_PRICES["spark"], "limit": PLAN_LIMITS["spark"], "features": ["30 generations / day", "No watermark", "Priority queue", "HD outputs"]},
        {"id": "forge", "name": "Forge", "price": PLAN_PRICES["forge"], "limit": PLAN_LIMITS["forge"], "features": ["100 generations / day", "Fast priority lane", "4K image exports", "Mesh SCAD export", "Video up to 12s"]},
        {"id": "neon", "name": "Neon Pro", "price": PLAN_PRICES["neon"], "limit": PLAN_LIMITS["neon"], "features": ["500 generations / day", "Top priority", "Commercial license", "Editor + extended trim", "Multi-AI assistant"]},
        {"id": "quantum", "name": "Quantum", "price": PLAN_PRICES["quantum"], "limit": PLAN_LIMITS["quantum"], "features": ["Unlimited generations", "Fastest GPU lane", "All future models", "Beta features early", "Pro support"]},
    ]


@api.post("/checkout/create", response_model=CheckoutResponse)
async def create_checkout(req: CheckoutRequest, user: dict = Depends(get_current_user)):
    amount = PLAN_PRICES.get(req.plan)
    if amount is None:
        raise HTTPException(status_code=400, detail="Invalid plan")
    origin = req.origin_url.rstrip("/")
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/payment/cancel"
    webhook_url = f"{origin}/api/webhook/stripe"
    sc = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
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
    await db.payments.insert_one({
        "session_id": sess.session_id,
        "user_id": user["user_id"],
        "plan": req.plan,
        "amount": amount,
        "currency": "usd",
        "status": "initiated",
        "payment_status": "pending",
        "created_at": iso(now_utc()),
    })
    return CheckoutResponse(url=sess.url, session_id=sess.session_id)


@api.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, user: dict = Depends(get_current_user)):
    pay = await db.payments.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if not pay:
        raise HTTPException(status_code=404, detail="Payment not found")
    sc = StripeCheckout(api_key=STRIPE_API_KEY)
    try:
        status_obj = await sc.get_checkout_status(session_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {str(e)[:200]}")
    # Apply plan upgrade on first paid event
    if status_obj.payment_status == "paid" and pay.get("payment_status") != "paid":
        plan = pay["plan"]
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"plan": plan, "plan_updated_at": iso(now_utc())}})
        await db.payments.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "status": status_obj.status, "paid_at": iso(now_utc())}},
        )
    else:
        await db.payments.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": status_obj.payment_status, "status": status_obj.status}},
        )
    return {
        "session_id": session_id,
        "status": status_obj.status,
        "payment_status": status_obj.payment_status,
        "amount_total": status_obj.amount_total,
        "currency": status_obj.currency,
        "plan": pay["plan"],
    }


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request, stripe_signature: Optional[str] = Header(None)):
    body = await request.body()
    sc = StripeCheckout(api_key=STRIPE_API_KEY)
    try:
        event = await sc.handle_webhook(body, stripe_signature or "")
    except Exception as e:
        logger.warning(f"Webhook parse failed: {e}")
        return {"received": True}
    md = event.metadata or {}
    user_id = md.get("user_id")
    plan = md.get("plan")
    if event.payment_status == "paid" and user_id and plan:
        await db.users.update_one({"user_id": user_id}, {"$set": {"plan": plan, "plan_updated_at": iso(now_utc())}})
        if event.session_id:
            await db.payments.update_one(
                {"session_id": event.session_id},
                {"$set": {"payment_status": "paid", "status": "complete", "paid_at": iso(now_utc())}},
            )
    return {"received": True}


# ----- Startup -----
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
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
