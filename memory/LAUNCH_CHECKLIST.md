# 🚀 AiForge — Google Play Launch Checklist

## Before tapping Publish

### 1. Switch Stripe to LIVE mode (so you actually get paid)
- Follow `/app/memory/STRIPE_LIVE_SETUP.md`
- Replace `STRIPE_API_KEY=sk_test_emergent` with your `sk_live_…` key
- `sudo supervisorctl restart backend`
- Test a real purchase from a separate device before launch

### 2. Configure stable production domain (recommended, optional)
- Currently the backend lives at `https://fierce-forge-ios.preview.emergentagent.com`
- For your store listing, a custom domain (e.g. `https://aiforge.app`) is more trustworthy
- Update DNS → CNAME the domain to the Emergent host
- Update `EXPO_PUBLIC_BACKEND_URL` in `/app/frontend/.env` accordingly (when you do this, also update the success/cancel URLs Stripe expects)
- Update the Privacy Policy / Terms of Service links

### 3. ✅ Privacy Policy & Terms of Service — PUBLIC URLs LIVE
Both pages are now hosted **directly on your backend** with the AiForge dark theme — no DNS / hosting setup needed. Paste these into the Play Console **App content → Privacy policy** field:

- **Privacy Policy**: `https://fierce-forge-ios.preview.emergentagent.com/api/legal/privacy`
- **Terms of Service**: `https://fierce-forge-ios.preview.emergentagent.com/api/legal/terms`

Both pages cover everything Google Play requires (data collected, third-party processors Stripe / OpenAI / Google / Anthropic, user rights, account deletion, children, acceptable use, refund policy, liability cap).

The in-app versions (Profile → Privacy Policy / Terms of Service) are still there for offline reading. When you switch to a custom domain (e.g. `aiforge.app`), the URLs automatically become `https://aiforge.app/api/legal/privacy`.

**Support email** — the policies reference `support@aiforge.app`. Create that mailbox (Google Workspace, Zoho, or a Gmail forward) — that's the only thing you have to do yourself for this section.

### 4. ✅ Account-deletion flow (DONE)
Profile → bottom of screen → **Delete my account** button.
- Backend endpoint: `DELETE /api/auth/me`
- Cascade-deletes the user, all creations, chat sessions, daily usage records, and payment records.
- Also unsets `referred_by` pointers from anyone the user referred.
- Requires a confirmation dialog ("Delete forever") before firing.

### 5. ✅ App icon & graphics (DONE — replaceable any time)
The AiForge logo PNG you uploaded has been baked into:
- `/app/frontend/assets/images/icon.png` (1024×1024, full-bleed, dark BG)
- `/app/frontend/assets/images/adaptive-icon.png` (1024×1024, with 20 % safe-zone padding so Android can crop it for the round/squircle masks)
- `/app/frontend/assets/images/favicon.png` (256×256 for web)
- `/app/frontend/assets/images/splash-icon.png` (1024×1024 with 30 % padding for the splash screen)

If you want a custom artwork later, drop a new PNG into those paths and rebuild. The Play Store **feature graphic 1024×500** still needs to be made manually (Canva works).

### 6. Play Store listing assets you'll need
- Short description (≤80 chars): _"Forge AI images, videos, 3D & code. Multi-AI cyberpunk creation studio."_
- Long description (4000 chars max) — pitch the 6 plans, the multi-AI assistant, the SCAD/STL output, share-to-earn
- 2 phone screenshots minimum (1080×1920 portrait, no overlay text required)
- 1 feature graphic 1024×500
- Optional promo video (YouTube link)

### 7. Build the signed Android App Bundle
1. In Emergent's UI, hit the **Publish** button (top-right).
2. The platform builds a signed **.aab** using `com.aiforge.app`.
3. Download the .aab when the build completes.

### 8. Google Play Console upload
1. Create a developer account at https://play.google.com/console ($25 one-time).
2. Create a new app:
   - App name: **AiForge**
   - Default language: English (US)
   - App or game: **App**
   - Free or paid: **Free** (in-app purchases happen via Stripe)
3. Upload the `.aab` under **Production → Create new release**.
4. Fill out the **Store listing** with assets from step 6.
5. Fill out **Content rating** questionnaire (likely "Teen" because of user-generated content).
6. Fill out **Data safety form** — be honest:
   - Data collected: Email address, User content (prompts, generated media), Purchase history
   - Data shared with third parties: Stripe (purchases), AI providers (prompt content)
   - All data encrypted in transit (HTTPS), users can request deletion
7. **Pricing & distribution**: Free, all countries except sanctioned ones.
8. Submit for review. Initial reviews usually take 2–7 days.

### 9. Post-launch monitoring
- Daily: `tail -f /var/log/supervisor/backend.out.log` for errors
- Weekly: Stripe Dashboard → Payments → confirm payouts hit your bank
- Watch the Play Console **Crashes & ANRs** dashboard
- Reply to user reviews — it boosts ranking

---

## ✅ What's already done
- 6 plan tiers ($0 / $9.99 / $29.99 / $49.99 / $99.99 / $199.99)
- Stripe checkout works end-to-end (verified with `4242 4242 4242 4242`)
- Plan auto-upgrades on payment success and via webhook
- Daily usage limits enforced server-side (HTTP 402 over limit)
- Real multi-turn AI assistant with persistent conversation memory
- Image (Nano Banana), Video (Sora 2), 3D Render (Nano Banana), SCAD code (Claude) + PNG preview, Chat (Claude)
- Library, Creation detail with WebView video player + CapCut-style draggable trim editor + tabbed SCAD viewer
- Cyberpunk-galaxy theme: starfield, shooting stars, **breathing ghost AiForge logo backdrop**, neon gradient buttons, haptic press animations
- **Share-to-earn referral system**: every user gets a unique code (`AF-XXXXXX`), and when a friend signs up with it, BOTH users get +20 generations/day for 7 days
- `app.json` configured with `com.aiforge.app` Android package, dark theme, edge-to-edge, adaptive icon, scheme `aiforge`
- 28/28 backend pytest cases passing in latest run

You're ready. Hit Publish whenever you are.
