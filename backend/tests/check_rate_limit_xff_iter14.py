"""Iter14 - re-verify X-Forwarded-For / X-Real-IP spoofing cannot bypass /api/auth/login rate limits.

Usage: PUB_URLS="https://a,https://b" LOCAL_URL=http://localhost:8001 python check_rate_limit_xff_iter14.py
"""
import os
import random
import uuid

import requests

PUB_URLS = [u.strip().rstrip("/") for u in os.environ["PUB_URLS"].split(",") if u.strip()]
LOCAL = os.environ.get("LOCAL_URL", "").rstrip("/")


def login(base, headers=None):
    email = f"TEST_nobody_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{base}/api/auth/login", json={"email": email, "password": "bad12345"},
                      headers=headers or {}, timeout=20)
    return r.status_code


def run(base, label, hdr_fn, n=15):
    codes = [login(base, hdr_fn(i)) for i in range(1, n + 1)]
    first429 = codes.index(429) + 1 if 429 in codes else None
    print(f"[{label}] {base}\n   codes={codes}\n   401s={codes.count(401)} 429s={codes.count(429)} first_429_at={first429}")
    return codes


for pub in PUB_URLS:
    print("health", pub, requests.get(f"{pub}/api/", timeout=20).status_code)
    run(pub, "no-spoof", lambda i: {})
    run(pub, "spoof XFF rotating", lambda i: {"X-Forwarded-For": f"10.0.0.{i}"})
    run(pub, "spoof XFF multi-hop rotating", lambda i: {"X-Forwarded-For": f"10.0.0.{i}, 10.1.1.{i}"})
    run(pub, "spoof X-Real-IP rotating", lambda i: {"X-Real-IP": f"198.51.100.{i}"})
    run(pub, "spoof XRI+XFF rotating", lambda i: {"X-Real-IP": f"198.51.100.{i+50}", "X-Forwarded-For": f"10.9.9.{i}"})

if LOCAL:
    # Regression: simulate a FRESH client IP (as the ingress would set X-Real-IP) -> 10x401 then 429
    fresh = f"192.0.2.{random.randint(1, 254)}"
    run(LOCAL, f"local fresh-IP {fresh} (X-Real-IP)", lambda i: {"X-Real-IP": fresh}, n=13)
    fresh2 = f"203.0.113.{random.randint(1, 254)}"
    run(LOCAL, f"local fresh-IP {fresh2} (XFF last entry)", lambda i: {"X-Forwarded-For": f"1.2.3.{i}, {fresh2}"}, n=13)
