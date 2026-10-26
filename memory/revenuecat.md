# RevenueCat — integrated (2026-10-26)

This file is memory for a later agent that may need to call the integration proxy for AiForge's RevenueCat account. Keep it in sync whenever you touch RevenueCat setup or products.

## Identifiers (from /setup response — copy verbatim)
- rc_project_id: proj63cca90c
- apple_app_id: app040e9fa706
- play_app_id: app76f3827b77
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages (package -> product_id, current price):
  - $rc_monthly -> prod77b31683df   ($9.99 / P1M, **7-day free trial P1W**)
  - $rc_annual  -> prod8cf02917ae   ($79.99 / P1Y, no trial, SAVE 33% positioning)
  - $rc_weekly  -> prod69670b4e17   ($4.99 / P1W, impulse-buy tier)
- Dashboard: https://app.revenuecat.com/projects/proj63cca90c
- Bundle id / Android package: `app.emergent.fierceforgeios2c75fc60`

## Backend plumbing
- `/api/subscription/sync` (POST, auth required) — mirrors the client's RevenueCat entitlement onto `user.plan` so server-side daily-limit enforcement sees pro users correctly.
  - entitlement_active=true → plan='pro', daily_limit=500 (unless legacy Stripe tier — grandfathered untouched)
  - entitlement_active=false → plan='free', daily_limit=5 (unless legacy tier)
- Backed by `routes/subscription.py` → wired in `server.py` → mounted on `api` router.
- `PLAN_LIMITS` / `PLAN_PRICES` / `PLAN_NAMES` in `core.py` now contain a `pro` entry alongside the legacy Stripe tiers.

## Frontend plumbing
- `src/lib/revenuecat.tsx`: SDK init at module scope, SubscriptionProvider, useSubscription hook, rcLogIn / rcLogOut.
- `app/_layout.tsx`: calls `initializeRevenueCat()` at module scope; wraps app in `QueryClientProvider` + `SubscriptionProvider`.
- `src/context/AuthContext.tsx`: calls `rcLogIn(user.id)` on every auth path (signIn, signUp, refresh) and `rcLogOut()` on signOut. Surfaces identity errors via `purchaseIdentityError`.
- `app/(tabs)/plans.tsx`: single-tier "AiForge Pro" paywall driven by `useSubscription`, with Restore Purchases button and a dev-mode confirmation modal before Test Store purchases.
- `.env` keys: `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` (REAL values, NOT placeholders — do not blank them).

## Status check (should always be `connected`)
```
AUTH='Authorization: Bearer sk-emergent-d77811747164296007'
curl -sS -H "$AUTH" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/03054408-b3a7-4c6e-b972-4db75114faff/status"
```

## Later updates to user's products (integration proxy APIs ONLY — NEVER call RevenueCat REST)
- Change price/duration/trial OR add a package (upsert):
  ```
  POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/03054408-b3a7-4c6e-b972-4db75114faff/products
  body: {"products":[{"package":"$rc_monthly","price":14.99,"currency":"USD","period":"P1M","trial":"P1W","prices":[{"amount_micros":14990000,"currency":"USD"}]}]}
  ```
  (amount_micros = price × 1,000,000; omit "trial" for none)
- Remove a package:
  ```
  DELETE $INTEGRATION_PROXY_URL/internal/revenuecat/projects/03054408-b3a7-4c6e-b972-4db75114faff/products/%24rc_monthly
  ```
  ($ → %24)
- Recover identifiers / repopulate .env: re-run the idempotent /setup call.

## Taking in-app purchases LIVE — store-side steps (USER does these — agent cannot verify or perform)
Needed ONLY for REAL purchases in published store builds. Test Store (Expo Go / web preview / dev build) needs none of this.

- Step 1 — Upload Play Store credentials to the RevenueCat dashboard
  (Home → project → Apps → App name → Google Play configuration)
  - Google Play service-account credentials JSON (user already has one via Firebase project aiforge-15b38; may need Android Publisher API role added)
  - Reference: https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials
- Step 2 — Set up a Google Play payments profile (if not already done)
  - https://support.google.com/googleplay/android-developer/answer/7161426
- Step 3 — Create matching in-app purchase products in Google Play Console
  using the SAME product IDs shown in the RevenueCat dashboard:
  - **prod77b31683df** — monthly auto-renew subscription at **$9.99**, with a **7-day FREE TRIAL** base plan (RevenueCat already set `trial: P1W`; the Play Console product must also offer a 7-day free trial as a base plan or offer tag so Google Play surfaces it)
  - **prod8cf02917ae** — annual auto-renew subscription at **$79.99** (no trial)
  - Both subscriptions share the same subscription group so users can upgrade/downgrade between them without re-purchasing
  - Reference: https://support.google.com/googleplay/android-developer/answer/140504
- Step 4 — Build + closed testing track upload. Test with license tester accounts, then submit for review.
- iOS steps are DEFERRED (user is Android-only for now).

All store-side setup FAQs are in Emergent's payments panel.
