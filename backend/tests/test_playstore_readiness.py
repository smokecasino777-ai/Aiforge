"""Smoke tests for Play Store readiness: legal pages, asset gallery, editor, avatar, referrals."""
import os
import base64
import requests
import pytest

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    os.environ.get("EXPO_BACKEND_URL", "https://fierce-forge-ios.preview.emergentagent.com"),
).rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def demo_token(session):
    r = session.post(f"{API}/auth/login", json={"email": "demo@example.com", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth_h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ----- Legal (required for Play Store + App Store) -----
class TestLegalPages:
    def test_privacy_returns_html(self, session):
        r = session.get(f"{API}/legal/privacy")
        assert r.status_code == 200
        ctype = r.headers.get("content-type", "").lower()
        assert "html" in ctype, f"expected html, got {ctype}"
        body = r.text.lower()
        assert "privacy" in body

    def test_terms_returns_html(self, session):
        r = session.get(f"{API}/legal/terms")
        assert r.status_code == 200
        assert "html" in r.headers.get("content-type", "").lower()
        assert "terms" in r.text.lower()


# ----- Play Store asset gallery -----
class TestPlayStoreAssets:
    def test_gallery_renders(self, session):
        r = session.get(f"{API}/assets/playstore")
        assert r.status_code == 200, r.text[:300]
        assert "html" in r.headers.get("content-type", "").lower()

    def test_icon_512_png(self, session):
        # Actual filename in /app/playstore_assets is aiforge_play_icon_512.png
        r = session.get(f"{API}/assets/playstore/aiforge_play_icon_512.png?inline=1")
        assert r.status_code == 200, r.text[:300]
        ctype = r.headers.get("content-type", "")
        assert ctype.startswith("image/"), f"expected image, got {ctype}"
        # PNG signature
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
        # Verify it's 512x512 via PNG IHDR (bytes 16-24 = width,height big-endian)
        width = int.from_bytes(r.content[16:20], "big")
        height = int.from_bytes(r.content[20:24], "big")
        assert (width, height) == (512, 512), f"expected 512x512, got {width}x{height}"


def _post_with_retry(session, url, headers, payload, timeout=180, retries=3, sleep_s=3):
    """LLM endpoints occasionally 5xx (budget-throttle, gateway). Retry a few times."""
    import time
    last = None
    for i in range(retries):
        r = session.post(url, headers=headers, json=payload, timeout=timeout)
        last = r
        if r.status_code < 500:
            return r
        time.sleep(sleep_s * (i + 1))
    return last


# ----- Editor caption helper -----
class TestEditorCaption:
    def test_caption_returns_hook_caption_hashtags(self, session, demo_token):
        r = _post_with_retry(
            session,
            f"{API}/editor/caption",
            auth_h(demo_token),
            {"prompt": "sunset over a glacier"},
            timeout=60,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        for k in ("hook", "caption", "hashtags"):
            assert k in data, f"missing {k} in {list(data.keys())}"
        # hashtags should be a list of strings starting with '#'
        assert isinstance(data["hashtags"], list)
        assert len(data["hashtags"]) >= 1
        assert all(isinstance(t, str) for t in data["hashtags"])


# ----- Avatar generation -----
class TestAvatarGeneration:
    def test_generate_avatar(self, session, demo_token):
        r = _post_with_retry(
            session,
            f"{API}/avatar/generate",
            auth_h(demo_token),
            {"prompt": "cyber warrior", "style": "cyberpunk"},
            timeout=180,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        assert "image_b64" in data
        # Validate it's base64-decodable and looks like a PNG/JPEG
        raw = base64.b64decode(data["image_b64"])
        assert len(raw) > 1000, "avatar image too small"
        assert raw[:3] in (b"\x89PN", b"\xff\xd8\xff", b"GIF", b"RIF"), (
            f"unexpected image header: {raw[:8]!r}"
        )


# ----- Referrals -----
class TestReferrals:
    def test_referrals_me(self, session, demo_token):
        r = session.get(f"{API}/referrals/me", headers=auth_h(demo_token))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "code" in data
        assert "share_text" in data
        assert isinstance(data["code"], str) and data["code"].startswith("AF-")
        assert isinstance(data["share_text"], str) and len(data["share_text"]) > 10
