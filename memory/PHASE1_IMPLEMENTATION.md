# AiForge Phase 1 — implementation record (2026-10-27)

## Approved scope
User explicitly approved sustainable credit pricing: 100 once-only introductory
credits (30 days, funded eligibility); Spark $9.99/2000, Creator $19.99/4500,
Pro $49.99/12000, Studio $99.99/25000, Max $199.99/50000 per billing month.
Packs: $2.99/400, $9.99/1500, $24.99/4000, $49.99/8500,
$99.99/18000, $249.99/47500, $499.99/95000, $999.99/190000.
Monthly credits expire, purchased credits do not. No new weekly/annual/daily
unlimited offers. Legacy purchased balances/terms are not converted.

## Implemented, regression testing pending
- Backend credit_catalog.py, credit_ledger.py, metering.py,
  credit_fulfillment.py and routes/credits.py. Integer USD-micro accounting,
  idempotent grants/refunds, expiring lots, one in-flight request per account,
  fixed five-minute quotes bound to user/path/body, failure release,
  conservative provider expense recording, 15-minute stale-request recovery.
- Every AI generation/chat/SCAD/editor/avatar/voice path requires a quote.
  No silent model fallback; text/output/context, image inputs and actual audio
  durations are bounded. Sora calls removed; video generation unavailable.
- $25 monthly promotional/owner-funded ceiling. Sandbox grants use this
  budget, not pretend paid revenue. No auto top-ups or provider purchases.
  Funding defaults to ZERO; rate attestations absent; sales disabled.
  This is intentional fail-closed behavior, NOT a live AI funding verification.
- Authenticated owner budget screen records existing prepaid funding evidence
  and bounded provider rates (expire after 7 days). It is manual attestation,
  not automatic provider-balance verification. Never enter API keys there.
- RevenueCat new-catalog mappings + purchase-intent funding hold; only verified
  webhook receipts fulfill. No direct RevenueCat REST/provisioning changes were
  made. Full multi-tier/consumable support and matching Play products remain
  external prerequisites. Current source keeps Billing Library 8.3.0.
- Native checkout callbacks/legacy Stripe UI remain separate/blocked on native.
- New Plans, quote modal, balances/history and spending dashboard. Large packs
  under More packs, explicit confirmation, no preselected expensive pack.
  Localized real prices only when matching SDK products exist; otherwise
  disabled reference-price cards, never a fake purchase.
- Local STL import (ASCII/binary), dimensions/watertight inspection, native SVG
  rotation preview, uniform scaling and axis rotation, copy-based history and
  STL export. OpenSCAD source editable/exportable, preview explicitly approximate.
- FFmpeg 7.0.2 native ARM executable verified via imageio-ffmpeg package.
  Real video trim/rotate/flip/speed/mute MP4 renderer; old metadata-only save
  removed. 60MB input and 60-second window cap. Image-only crop/text controls
  no longer imply unsupported video overlay exports.
- Avatar background/framing choices; fresh quote on each generation/retry;
  saved profile image normalized. New generated/edited images, profile images,
  STL and video files use private managed object storage, not Mongo blobs.
  Existing base64 records remain readable; network responses preserve client
  compatibility. Native uploads use uploadForm, exports use File/share sheet.
- New registrations do not get old daily/referral promises. Existing old
  records are unchanged. UI copy updated; remaining legal consistency must
  be checked in regression tests.

## Known launch gates — do not claim release/live payments
1. No verified connected-provider USD rates or allocated prepaid balance;
   AI is intentionally unavailable until real costs/funds are confirmed.
2. No active new Play catalog, matching base plans/consumables, store credentials
   or native test-track purchases verified. Products remain unavailable.
3. No verified video-generation replacement (Veo coverage not established).
4. No signed cloud AAB produced. EAS commands are unavailable/restricted in
   this environment; local Android JS export and clean prebuild are not an AAB.
5. Highest Play versionCode unknown (user guessed20, PDF mentions139); neither
   is treated as current. Package app.emergent.fierceforgeios2c75fc60 unchanged.
6. Upload signing, internal/closed-track gates and Google account/policy status
   need real account evidence. No listing, declaration or appeal submitted.
7. Repo history operations stopped: actual branch is
   codespace-special-spork-4qq7969947963v4j, not one of four authorized purge
   branches. Remotes match smokecasino777-ai/Aiforge. No force pushes or cleanup
   claims. Test report ignore does not remove existing tracked history.
8. Potentially exposed credentials require rotation and 2-step verification.
   Never repeat credential values. Read private test_credentials.md for tests.

## Validation so far
- Earlier Android JS export --no-bytecode and isolated Expo Android prebuild
  passed; need final export after all Phase1 changes.
- TypeScript, all frontend lint and all Python lint passed before final edits.
- API /api/health200. FFmpeg binary executes successfully on ARM.
- Screenshot tool browser crashed BEFORE navigation (Chromium SIGSEGV).
  Troubleshooter verified preview serves200 and independently launched browser
  using DBUS_SESSION_BUS_ADDRESS=unix:path=/dev/null,
  DBUS_SYSTEM_BUS_ADDRESS=unix:path=/dev/null, XDG_RUNTIME_DIR=''. Testing agent
  must apply those ENV ONLY to its own browser subprocess, not app env files.
- No paid AI generation or real purchase was run. Financial tests must use
  isolated DB fixtures; never credit/fund production accounts to make UI work.