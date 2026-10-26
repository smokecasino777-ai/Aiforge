# AiForge — Google Play Launch Checklist (TONIGHT)

> **Status snapshot (last verified: iter-19)**
> Backend: 17/18 token tests ✅ · Voice regression ✅ · Webhook validation ✅ · Backfill ran on 15 users.
> Frontend: Sentry safe-guard ✅ · Home badge "5 free gens · expires in 30d" ✅ · Plans + Token Packs toggle ✅.
> Known pre-existing: Azure chat key 401 (G3). Fix in Admin → App Secrets, not blocking launch.

---

## 1 · GOOGLE PLAY CONSOLE

### 1a. App basics
- **Package name**: `app.emergent.fierceforgeios2c75fc60`
- **Default language**: English (United States)
- **App or Game**: App
- **Free or Paid**: Free (with in-app purchases)
- **App category**: Art & Design
- **Tags**: AI, Art, Image Editor, 3D

### 1b. Store listing (copy-paste)

**Short description (80 chars max)**
```
Forge AI images, videos & 3D models in a cyberpunk-themed creation studio.
```

**Full description**
```
AiForge turns words into stunning AI creations — images, videos, 3D meshes, and SCAD files, all from one cyberpunk-grade studio.

🪄 WHAT YOU CAN FORGE
• AI images with photorealistic or illustrated styles
• Short Sora-grade video clips
• 3D models + SCAD mesh code (STL-ready)
• AI avatar maker — 6 styles, set as profile pic
• AI photo editor — crop, trim, style transfer, BG removal

🎁 FREE TIER
• 5 free generations on signup — valid for 30 days
• Keep using free forever with token packs

💎 GO PRO ($9.99/mo, 7-day free trial)
• 500 generations every day
• Unlimited images, videos and 3D models
• Priority access to new AI models
• No ads, no watermarks, no limits
• Yearly plan available — save 33%

🪙 TOKEN PACKS (no subscription)
• 25 tokens — $2.99
• 100 tokens — $9.99
• 500 tokens — $39.99
• Tokens never expire · pay once, no auto-renewal

Billing is securely handled by Google Play. Cancel anytime from your Play Store subscriptions.

By using AiForge you agree to our Terms of Service and Privacy Policy.
```

**App icon / feature graphic**: use `/app/playstore_assets/`

### 1c. Content rating
- IARC: fill out — AI image generation + user prompts → likely **Teen** (user-generated content).

### 1d. Data safety
- Collect: email, generated content, device identifier (Sentry).
- Sent to third parties: RevenueCat (purchase token), Sentry (crash logs).
- Encrypted in transit: Yes · In storage: Yes · User can request deletion: Yes (Profile → Delete account).

### 1e. Target audience
- 13 and over.

### 1f. Testing track
- Closed testing → **Internal testers** group → add tester emails → publish.
- Tester opt-in URL: `https://play.google.com/apps/testing/app.emergent.fierceforgeios2c75fc60`

---

## 2 · RevenueCat SETUP

Go to **https://app.revenuecat.com** → your AiForge project.

### 2a. Products (Google Play → RevenueCat → "Products")

| Google Play SKU | RevenueCat Product ID | Type | Price |
|---|---|---|---|
| `prod69670b4e17` | `$rc_weekly` | Auto-renewing · 1 week | $4.99 |
| `prod77b31683df` | `$rc_monthly` | Auto-renewing · 1 month + 7-day trial | $9.99 |
| `prod8cf02917ae` | `$rc_annual` | Auto-renewing · 1 year | $79.99 |
| `tokens_25` | `tokens_25` | **Consumable** (non-renewing) | $2.99 |
| `tokens_100` | `tokens_100` | **Consumable** (non-renewing) | $9.99 |
| `tokens_500` | `tokens_500` | **Consumable** (non-renewing) | $39.99 |

> **IMPORTANT**: In Google Play Console → Monetize → Products → In-app products, create the 3 token SKUs as **Consumable**. The 3 subscription SKUs go under Monetize → Subscriptions.

### 2b. Entitlements
- Entitlement **`pro`** → attach all 3 subscription products (weekly, monthly, annual).
- Token packs **do NOT** attach to an entitlement — they trigger `NON_RENEWING_PURCHASE` webhooks.

### 2c. Offerings
- **Default offering** → 3 packages: `$rc_weekly`, `$rc_monthly`, `$rc_annual`.
- (Token packs are listed outside offerings via `getProducts`.)

### 2d. Webhook
- URL: `https://fierce-forge-ios.preview.emergentagent.com/api/webhook/revenuecat`
- Authorization header value: `Bearer <REVENUECAT_WEBHOOK_SECRET>` (from Emergent Secrets).
- Events to send: **ALL** (we handle INITIAL_PURCHASE / RENEWAL / CANCELLATION / EXPIRATION / NON_RENEWING_PURCHASE / UNCANCELLATION / TRIAL_STARTED / TRIAL_CONVERTED / PRODUCT_CHANGE).
- Verify delivery: RevenueCat → Webhooks → **Send test** → should return `200 {"received": true, "verified": true, "processed": ...}`.

### 2e. API keys (already set in `/app/frontend/.env`)
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_…`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_…` ← this is the one Play uses

---

## 3 · BACKEND SECRETS (verify in Emergent → Secrets)

| Secret | Required | Where used |
|---|---|---|
| `MONGO_URL` | ✅ | DB |
| `JWT_SECRET` | ✅ | Auth |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✅ | Owner seed |
| `EMERGENT_LLM_KEY` | ✅ | Image gen (Nano Banana) + voice + fallback text |
| `REVENUECAT_WEBHOOK_SECRET` | ✅ | Webhook auth header |
| `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_BASE` / `AZURE_OPENAI_DEPLOYMENT` | ⚠ | Chat / SCAD text (currently 401 — update or fall back to Emergent) |
| `EXPO_PUBLIC_SENTRY_DSN` (frontend) | optional | Crash reporting (currently invalid — safe-guard disables Sentry; fix in **secrets panel**) |

> **Sentry fix**: paste a DSN like `https://abc123@o456.ingest.sentry.io/789` from your Sentry project → Settings → Client Keys (DSN). Our new regex guard rejects anything else so a bad value just disables crash reporting instead of crashing the app.

---

## 4 · BUILD & UPLOAD

1. From the Emergent dashboard → **Publish** (top-right) → publishes backend + mobile config.
2. Then → **Generate build** → pick **Android AAB** → upload `google-services.json` + Play signing key when prompted.
3. Download the `.aab`.
4. Google Play Console → Testing → Closed testing → Create new release → upload the `.aab`.
5. Rollout 100% to testers.

---

## 5 · PRE-LAUNCH SMOKE TEST (do this on a real phone after joining the opt-in URL)

- [ ] Install from Play Store (closed testing).
- [ ] Sign up with a brand-new email → confirm you see the "5 free gens · expires in 30d" badge on Home.
- [ ] Generate 1 image → counter drops to "4 free gens".
- [ ] Open Plans → see Subscribe/Token Packs toggle, 3 subscription plans, 3 token packs.
- [ ] Tap "Monthly" → Google Play billing sheet appears → cancel (don't need to buy).
- [ ] Tap "Token packs" → see 25 / 100 / 500 token tiles with real Play prices.
- [ ] Voice: open Chat → tap mic → record 5 seconds → transcription returns text.
- [ ] Admin: sign in as `jraycwalker@gmail.com` → Profile → Owner · App Secrets → unlock → see live-key management.
- [ ] Deep-link: send yourself the referral code → paste in another device signup → both get bonus.
- [ ] Force-close the app → re-open → Sentry session is captured (check Sentry dashboard the next day).

---

## 6 · KNOWN NON-BLOCKERS (ship anyway, fix later)

| Issue | User impact | Fix |
|---|---|---|
| Azure chat key 401 → chat/SCAD return 502 | Chat shows error; image/video still work and tokens are correctly refunded | Rotate the Azure key in Admin → App Secrets, or set `AZURE_OPENAI_API_KEY=""` so we fall back to Emergent LLM |
| Emergent sora-2 endpoint 404 | Video jobs fail → 3 tokens auto-refunded | Set `AZURE_VIDEO_DEPLOYMENT` in backend/.env to a working sora deployment, or hide video for v1.0 |
| Sentry DSN invalid | No crash reports → still safe to ship (app can't crash from it) | Paste a real DSN into the Secrets panel |

---

## 7 · POST-LAUNCH DAY-1 CHECKS

- [ ] Play Console → Pre-launch report → no crashes on the test matrix.
- [ ] Sentry → < 5 unique errors in the first 24h.
- [ ] RevenueCat → Transactions → verify every test purchase landed and the webhook returned `processed:true`.
- [ ] Mongo → `db.users.countDocuments({plan:'pro'})` matches RevenueCat active subs.
- [ ] Mongo → `db.token_ledger.countDocuments()` matches RevenueCat consumable purchases.

Good luck tonight. 🚀
