"""Iter18 race probe: N concurrent small TTS calls on a free user (cap 300) to detect
non-atomic quota reservation (over-cap successes / lost updates). Run: python race_voice_quota_iter18.py"""
import asyncio
import os
import sys
import uuid

import httpx

API = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 25
TEXT = "Race probe text okay"  # 20 chars -> cap allows 15


async def main():
    async with httpx.AsyncClient(timeout=90) as c:
        r = await c.post(f"{API}/auth/register", json={"email": f"test_race.{uuid.uuid4().hex[:8]}@aiforgeqa.dev",
                                                       "password": "Passw0rd!x", "name": "race"})
        tok = r.json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        try:
            # warm the cache so concurrent calls are cheap cache hits
            res = await asyncio.gather(*[c.post(f"{API}/voice/tts", json={"text": TEXT}, headers=h) for _ in range(N)])
            codes = [x.status_code for x in res]
            ok = codes.count(200)
            q = (await c.get(f"{API}/voice/quota", headers=h)).json()
            print(f"N={N} codes={codes}")
            print(f"successes={ok} (max allowed {300 // len(TEXT)}), chars served={ok * len(TEXT)}, recorded used={q['tts_chars_used']}")
            if ok * len(TEXT) > 300:
                print("BUG: over-cap successes -> reservation not atomic")
            if q["tts_chars_used"] != ok * len(TEXT):
                print("BUG: lost updates -> counter under-records actual usage")
        finally:
            print("cleanup", (await c.delete(f"{API}/auth/me", headers=h)).status_code)


asyncio.run(main())
