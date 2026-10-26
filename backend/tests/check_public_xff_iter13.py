"""Iter13 - public preview URL auth + X-Forwarded-For rate-limit bypass check."""
import os, uuid, requests

PUB = os.environ["PUB_URL"].rstrip("/")
DEMO = {"email": "demo@example.com", "password": "demo1234"}

print("health", requests.get(f"{PUB}/api/").status_code)
r = requests.post(f"{PUB}/api/auth/login", json={"email": "jraycwalker@gmail.com", "password": "KandiceJray1$"})
print("owner login public", r.status_code, r.json().get("user", {}).get("plan"))
r = requests.post(f"{PUB}/api/auth/login", json=DEMO)
print("demo login public", r.status_code)

# Without spoofing: real IP bucket
codes = [requests.post(f"{PUB}/api/auth/login", json={"email": "demo@example.com", "password": "bad12345"}).status_code for _ in range(12)]
print("public no-spoof codes", codes)

# With spoofed XFF rotated per request
codes = [requests.post(f"{PUB}/api/auth/login", json={"email": "demo@example.com", "password": "bad12345"},
                       headers={"X-Forwarded-For": f"203.0.113.{i}"}).status_code for i in range(1, 16)]
print("public spoofed-XFF codes", codes)
