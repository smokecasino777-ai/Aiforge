"""AiForge backend integration tests covering auth, generation, creations, plans, and Stripe."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "https://fierce-forge-ios.preview.emergentagent.com")).rstrip("/")
API = f"{BASE_URL}/api"

# Module-level shared state
STATE: dict = {}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(session):
    """Login the seeded demo user."""
    r = session.post(f"{API}/auth/login", json={"email": "demo@example.com", "password": "demo1234"})
    assert r.status_code == 200, f"Demo login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def auth_h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# -------- Health --------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("name") == "AiForge API"


# -------- Plans --------
class TestPlans:
    def test_plans_six_tiers(self, session):
        r = session.get(f"{API}/plans")
        assert r.status_code == 200
        plans = r.json()
        ids = [p["id"] for p in plans]
        assert ids == ["free", "spark", "forge", "neon", "quantum", "singularity"], f"got {ids}"
        limits = {p["id"]: p["limit"] for p in plans}
        assert limits == {"free": 5, "spark": 50, "forge": 200, "neon": 500, "quantum": 2000, "singularity": 99999}, f"got {limits}"
        prices = {p["id"]: p["price"] for p in plans}
        assert prices["spark"] == 9.99
        assert prices["forge"] == 29.99
        assert prices["neon"] == 49.99
        assert prices["quantum"] == 99.99
        assert prices["singularity"] == 199.99


# -------- Auth --------
class TestAuth:
    def test_register_new_user(self, session):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "Tester"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        u = data["user"]
        assert u["email"].lower() == email.lower()
        assert u["plan"] == "free"
        assert u["daily_limit"] == 5
        assert u["daily_used"] == 0
        STATE["new_email"] = email
        STATE["new_token"] = data["token"]
        STATE["new_user_id"] = u["id"]

    def test_register_duplicate(self, session):
        if "new_email" not in STATE:
            pytest.skip("registration didn't run")
        r = session.post(f"{API}/auth/register", json={"email": STATE["new_email"], "password": "X1234567"})
        assert r.status_code == 400

    def test_login_demo(self, session, demo_token):
        assert demo_token  # fixture already validates

    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "demo@example.com", "password": "wrong"})
        assert r.status_code == 401

    def test_me_returns_user(self, session, demo_token):
        r = session.get(f"{API}/auth/me", headers=auth_h(demo_token))
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == "demo@example.com"
        assert "plan" in u and "daily_used" in u and "daily_limit" in u
        STATE["demo_initial_used"] = u["daily_used"]
        STATE["demo_limit"] = u["daily_limit"]

    def test_me_no_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_google_auth_invalid_session(self, session):
        r = session.post(f"{API}/auth/google", json={"session_id": "BOGUS_SESSION_DOES_NOT_EXIST_xyz"})
        assert r.status_code == 401


# -------- Creations stats + list (initial) --------
class TestCreationsBasic:
    def test_stats_returns_counts(self, session, demo_token):
        r = session.get(f"{API}/creations/stats", headers=auth_h(demo_token))
        assert r.status_code == 200
        data = r.json()
        for k in ("image", "video", "model3d", "chat"):
            assert k in data
            assert isinstance(data[k], int)

    def test_list_creations_only_own(self, session, demo_token):
        r = session.get(f"{API}/creations", headers=auth_h(demo_token))
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)


# -------- Generation (uses a fresh user to avoid hitting demo's quota) --------
@pytest.fixture(scope="session")
def fresh_user(session):
    email = f"TEST_gen_{uuid.uuid4().hex[:8]}@example.com"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "GenTester"})
    assert r.status_code == 200, r.text
    return {"email": email, "token": r.json()["token"], "id": r.json()["user"]["id"]}


class TestGeneration:
    def test_image_generation(self, session, fresh_user):
        r = session.post(
            f"{API}/generate",
            headers=auth_h(fresh_user["token"]),
            json={"type": "image", "prompt": "a small red cube on a white background"},
            timeout=180,
        )
        assert r.status_code == 200, f"Image gen failed: {r.status_code} {r.text[:300]}"
        c = r.json()
        assert c["type"] == "image"
        assert c["status"] == "ready"
        assert c.get("media_data") and len(c["media_data"]) > 100
        assert c.get("media_mime", "").startswith("image/")
        STATE["image_id"] = c["id"]

    def test_model3d_generation(self, session, fresh_user):
        r = session.post(
            f"{API}/generate",
            headers=auth_h(fresh_user["token"]),
            json={"type": "model3d", "prompt": "a tiny robot toy"},
            timeout=180,
        )
        assert r.status_code == 200, f"3D gen failed: {r.status_code} {r.text[:300]}"
        c = r.json()
        assert c["type"] == "model3d"
        assert c["status"] == "ready"
        assert c.get("media_data") and len(c["media_data"]) > 100
        STATE["model_id"] = c["id"]

    def test_chat_endpoint(self, session, fresh_user):
        r = session.post(
            f"{API}/chat",
            headers=auth_h(fresh_user["token"]),
            json={"prompt": "Say hi in one short sentence."},
            timeout=60,
        )
        assert r.status_code == 200, f"Chat failed: {r.text[:300]}"
        data = r.json()
        assert isinstance(data.get("reply"), str) and len(data["reply"]) > 0

    def test_scad_generation(self, session, fresh_user):
        r = session.post(
            f"{API}/generate/scad",
            headers=auth_h(fresh_user["token"]),
            json={"prompt": "a 20mm cube with a 10mm hole through center"},
            timeout=180,
        )
        assert r.status_code == 200, f"SCAD failed: {r.text[:300]}"
        c = r.json()
        assert c["type"] == "model3d"
        assert c["status"] == "ready"
        assert c.get("media_mime") == "application/x-openscad"
        import base64 as b64
        decoded = b64.b64decode(c["media_data"]).decode(errors="ignore")
        assert any(k in decoded.lower() for k in ("cube", "cylinder", "difference", "module"))
        # New requirement: SCAD must include preview_image (PNG base64) generated by Nano Banana
        assert c.get("preview_image"), "SCAD response missing preview_image"
        assert len(c["preview_image"]) > 500, "preview_image looks too small to be a real PNG"
        STATE["scad_id"] = c["id"]

    def test_chat_multiturn_session_continuity(self, session):
        """Two-message conversation: second must reference first via shared session_id.
        Uses a brand-new user to avoid quota collisions with prior tests."""
        email = f"TEST_mt_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"})
        assert reg.status_code == 200
        tok = reg.json()["token"]
        sid = f"test-session-{uuid.uuid4().hex[:10]}"
        r1 = session.post(
            f"{API}/chat",
            headers=auth_h(tok),
            json={"prompt": "Remember code FALCON-99. Acknowledge briefly.", "session_id": sid},
            timeout=60,
        )
        assert r1.status_code == 200, r1.text[:300]
        d1 = r1.json()
        assert d1.get("session_id") == sid
        assert isinstance(d1.get("reply"), str) and len(d1["reply"]) > 0
        # Second turn references first
        r2 = session.post(
            f"{API}/chat",
            headers=auth_h(tok),
            json={"prompt": "What was the code I told you? Answer with just the code.", "session_id": sid},
            timeout=60,
        )
        assert r2.status_code == 200, r2.text[:300]
        d2 = r2.json()
        assert d2.get("session_id") == sid
        reply2 = d2.get("reply", "")
        assert "FALCON" in reply2.upper(), f"multi-turn lost context, reply: {reply2[:200]}"

    def test_video_generation_processing(self, session):
        """Use a fresh user so daily limit doesn't interfere."""
        email = f"TEST_vid_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"})
        assert reg.status_code == 200
        tok = reg.json()["token"]
        r = session.post(
            f"{API}/generate",
            headers=auth_h(tok),
            json={"type": "video", "prompt": "a cat walking", "duration": 4, "size": "1280x720"},
            timeout=30,
        )
        assert r.status_code == 200, f"Video kickoff failed: {r.text[:300]}"
        c = r.json()
        assert c["type"] == "video"
        assert c["status"] == "processing"
        assert c["duration"] == 4
        STATE["video_id"] = c["id"]


# -------- Creation CRUD verification --------
class TestCreationsCRUD:
    def test_list_includes_new(self, session, fresh_user):
        r = session.get(f"{API}/creations", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        for k in ("image_id", "model_id", "scad_id"):
            if STATE.get(k):
                assert STATE[k] in ids

    def test_get_creation_detail(self, session, fresh_user):
        if not STATE.get("image_id"):
            pytest.skip("image not created")
        r = session.get(f"{API}/creations/{STATE['image_id']}", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        c = r.json()
        assert c["id"] == STATE["image_id"]
        assert c.get("media_data")

    def test_get_other_user_blocked(self, session, demo_token):
        if not STATE.get("image_id"):
            pytest.skip("image not created")
        r = session.get(f"{API}/creations/{STATE['image_id']}", headers=auth_h(demo_token))
        assert r.status_code == 404

    def test_stats_updated(self, session, fresh_user):
        r = session.get(f"{API}/creations/stats", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        data = r.json()
        assert data["image"] >= 1
        assert data["model3d"] >= 1

    def test_delete_creation(self, session, fresh_user):
        if not STATE.get("scad_id"):
            pytest.skip("scad not created")
        r = session.delete(f"{API}/creations/{STATE['scad_id']}", headers=auth_h(fresh_user["token"]))
        assert r.status_code == 200
        assert r.json().get("deleted") is True
        # verify it's gone
        r2 = session.get(f"{API}/creations/{STATE['scad_id']}", headers=auth_h(fresh_user["token"]))
        assert r2.status_code == 404


# -------- Daily limit --------
class TestDailyLimit:
    def test_free_limit_enforced(self, session):
        """Register a user, exhaust 5 gens via chat (cheap), expect 402 on 6th."""
        email = f"TEST_lim_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"})
        assert reg.status_code == 200
        tok = reg.json()["token"]
        h = auth_h(tok)
        for i in range(5):
            r = session.post(f"{API}/generate", headers=h, json={"type": "chat", "prompt": f"hi {i}"}, timeout=60)
            assert r.status_code == 200, f"gen {i} failed: {r.text[:200]}"
        r6 = session.post(f"{API}/generate", headers=h, json={"type": "chat", "prompt": "overflow"}, timeout=60)
        assert r6.status_code == 402, f"expected 402, got {r6.status_code} {r6.text[:200]}"
        me = session.get(f"{API}/auth/me", headers=h).json()
        assert me["daily_used"] == 5
        assert me["daily_limit"] == 5

    def test_scad_endpoint_also_402_when_exhausted(self, session):
        """Exhaust 5 generations then /generate/scad must also return 402."""
        email = f"TEST_scadlim_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"})
        assert reg.status_code == 200
        tok = reg.json()["token"]
        h = auth_h(tok)
        for i in range(5):
            r = session.post(f"{API}/generate", headers=h, json={"type": "chat", "prompt": f"q{i}"}, timeout=60)
            assert r.status_code == 200
        r6 = session.post(f"{API}/generate/scad", headers=h, json={"prompt": "a tiny cube"}, timeout=30)
        assert r6.status_code == 402, f"expected 402 from SCAD, got {r6.status_code} {r6.text[:200]}"


# -------- Stripe checkout --------
class TestCheckout:
    def test_checkout_create_returns_url(self, session, demo_token):
        r = session.post(
            f"{API}/checkout/create",
            headers=auth_h(demo_token),
            json={"plan": "spark", "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, f"checkout failed: {r.text[:300]}"
        data = r.json()
        assert data.get("url", "").startswith("http")
        assert data.get("session_id")

    def test_checkout_quantum(self, session, demo_token):
        r = session.post(
            f"{API}/checkout/create",
            headers=auth_h(demo_token),
            json={"plan": "quantum", "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, f"quantum checkout failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("url", "").startswith("http")
        assert data.get("session_id")

    def test_checkout_singularity(self, session, demo_token):
        r = session.post(
            f"{API}/checkout/create",
            headers=auth_h(demo_token),
            json={"plan": "singularity", "origin_url": BASE_URL},
            timeout=30,
        )
        assert r.status_code == 200, f"singularity checkout failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("url", "").startswith("http")
        assert data.get("session_id")

    def test_checkout_invalid_plan(self, session, demo_token):
        r = session.post(
            f"{API}/checkout/create",
            headers=auth_h(demo_token),
            json={"plan": "nonexistent", "origin_url": BASE_URL},
        )
        # Pydantic Literal will reject -> 422
        assert r.status_code in (400, 422)
