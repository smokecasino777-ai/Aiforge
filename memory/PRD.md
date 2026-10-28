# AiForge — current product requirements and status

## User request
Build Phase1 of the approved sustainable pricing plan and prepare a compliant
Google Play AAB. Verify purchases and fulfillment, upgrade video editing,
CAD/STL import/export and avatar tools. Preserve the dark neon mobile identity.
Only existing purchased provider funds are authorized; no new charges/top-ups.
See PHASE1_IMPLEMENTATION.md for the approved catalog and implementation detail.

## Architecture
- Expo SDK54 / React Native0.81.5 / Expo Router. Native iOS/Android target;
  web preview is a development view, not evidence of native billing success.
- FastAPI, Motor/MongoDB via core.MongoProxy. Private APIs under /api.
- Existing email/password JWT auth and owner password re-confirmation retained.
- RevenueCat RN10.15.1 -> hybrid19.14.1 -> Android10.28.1 -> Play Billing8.3.0.
  Android purchases use Play Billing, not Stripe/Razorpay. Legacy web checkout
  remains separate; native callbacks/clients do not open it.
- Private managed object storage for new media. Existing blob records remain
  readable. Native files upload only through uploadForm; exports use Expo File.

## Implemented
1. Five monthly plans and eight one-time packs exactly as approved; free100 once
   for30days only when funded. No new daily unlimited or automatic +20/day offers.
2. Integer USD-micro credit ledger: promo/monthly/purchased lots, expiring-first
   usage, fixed accepted quotes, one active operation/account, replay and ownership
   guards, refunds, conservative cost liability accounting and stale recovery.
3. Provider actions require quotes/funding. No silent model fallback. Bounded
   context/output/image input and actual audio duration; no application retries.
4. $25 monthly promotional/owner ceiling, separate paid liabilities, funding holds
   before new purchases, evidence-based owner funding/rate controls protected by
   existing short-lived admin unlock. No auto provider top-ups.
5. Verified RevenueCat events grant new allowances separately from legacy terms;
   duplicate transactions cannot re-credit, monthly periods come from receipts,
   refunds revoke unused credits. Sandbox grants use promotional funding.
6. Plans show accurate references vs live localized prices, readiness guards,
   cautious regional margin floors, More packs confirmation, restore/pending
   wording and balance/history screens. Unconfigured products cannot be bought.
7. Real FFmpeg MP4 trim/rotation/flip/speed/mute export (<=60s, <=60MB).
8. Real STL import/export, primitive creation, dimensions/watertight inspection,
   scale/axis rotation, preserved originals, native SVG preview and undo history.
   SCAD source editable/exportable; approximate preview is not a real compiler.
9. Avatar background/framing controls, fresh quote per generation/retry, private
   normalized profile-image storage. No paid avatar call made during this work.
10. Build configuration uses clean Expo prebuild instead of stale native trees;
    excess media/overlay permissions blocked, TypeScript blockers corrected,
    Sentry invalid configuration fails safely off and source-map upload disabled.

## Validation
- TypeScript, Python lint, frontend lint and Expo dependency checks passed.
- Android JS export with bytecode disabled passed after Phase1 changes.
- Earlier isolated Android prebuild passed; a final prebuild/export is pending
  the last small navigation/admin-write fixes. Neither check is a signed AAB.
- Report iteration_20: 15 backend tests passed, including real private STL
  storage/transform/ownership, malformed files, local FFmpeg render and API guards.
- Initial UI testing incomplete: onboarding/billing connection timing affected
  navigation; fixes now separate auth from queued billing binding, synchronize
  onboarding state, improve Skip target and expose active-screen testIDs.
- Deeper isolated money-ledger and final focused UI regression still pending.
- Testing browser needed process-only DBus environment workaround. Public app
  endpoints healthy; do not change protected supervisor/Metro to suppress logs.

## P0 / release blockers
- New Play/RevenueCat multi-tier and consumable catalog is NOT provisioned or
  verified live. Matching products/base plans/entitlement, credentials and real
  license-tester fulfillment/restore/refund tests remain required.
- Provider funds/rates NOT verified: live funding envelope0, no rates, sales off.
  A user message 'Credits Recharged' does NOT state a provider USD balance.
  Do not invent balances or enable costly actions. Cost controls fail closed.
- Video generation has no verified supported/priced replacement. Sora retired;
  no assumption that Veo is included. Local video editing works independently.
- No signed AAB/cloud build performed. Build workflow access/signing and current
  highest Play versionCode are unverified. Keep package unchanged:
  app.emergent.fierceforgeios2c75fc60. Neither20 nor139 is treated as current.
- Google developer-account/policy declarations and internal/closed-track gates
  need actual Console evidence; no submission or appeal has occurred.
- Repo history operations stopped on branch mismatch: active
  codespace-special-spork-4qq7969947963v4j; remotes match smokecasino777-ai/Aiforge,
  but not one of four specifically authorized purge branches. No Git writes,
  force pushes, repo deletion or history-cleanup claim. Ignore rules do not purge
  existing tracked reports. Exposed credentials need rotation and 2FA re-enabled.

## P1
- Complete/regress ledger crash/concurrency and UI flows. Fix all discovered bugs.
- Confirm legal/data-safety/support-contact facts and native purchase behavior.
- Credential-backed provider pricing/access/funding verification; configure only
  supported store catalog through supported service workflow, then test on track.

## P2 (not authorized for new external charges)
Real cost/margin optimization, more verified video options, advanced voice/research,
annual pricing only after evidence; scalable financial journal archival and richer
CAD operations. Do not silently reduce existing purchased contractual benefits.

## Private test access
Use /app/memory/test_credentials.md. Never duplicate credentials in reports or
public summaries. Tests must isolate financial fixtures from the app database.