# 🚀 AiForge Google Play Store Launch Checklist

**Launch Target**: 9 days  
**Current Status**: Ready for production deployment

---

## ✅ CRITICAL PATH (Must Complete)

### 1. Backend Production Environment
- [ ] MongoDB Atlas connection URL configured in `backend/.env` (MONGO_URL)
- [ ] Verify all required environment variables are set:
  ```
  MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true
  DB_NAME=aiforge
  EMERGENT_LLM_KEY=<valid key from Emergent>
  JWT_SECRET=<strong random secret>
  ADMIN_EMAIL=<owner email>
  ADMIN_PASSWORD=<owner password>
  STRIPE_API_KEY=sk_live_<your live key>  # NOT sk_test_*
  ```

### 2. Stripe Live Mode Configuration
- [ ] Create Stripe Live account at https://dashboard.stripe.com
- [ ] Obtain live secret key (starts with `sk_live_`)
- [ ] Configure in production backend `.env` as `STRIPE_API_KEY`
- [ ] Set up webhook endpoint: `https://<your-domain>/api/webhook/stripe`
- [ ] Subscribe to event: `checkout.session.completed`
- [ ] Test with real card (use separate test device, NOT Play Console test)
- [ ] Verify payouts configured to your bank account

### 3. Frontend Configuration
- [ ] Set `EXPO_PUBLIC_BACKEND_URL` to production domain
  - Currently: `https://fierce-forge-ios.preview.emergentagent.com`
  - Or: Your custom domain (e.g., `https://aiforge.app`)
- [ ] Verify no hardcoded localhost URLs
- [ ] Test login flow in production environment
- [ ] Confirm checkout redirects to correct success/cancel URLs

### 4. API Verification (Core Tests PASSING ✅)
```
✅ Login & Auth Tests: 8/8 PASS
   - Valid login, wrong password handling
   - User /auth/me endpoint
   - Register with duplicate detection
   - Plans listing
   - User creations endpoint
   - Admin status check (non-admin users correctly return false)

✅ Core Functionality: 44+ tests passing
   - Authentication flow
   - User registration
   - Plan queries
   - Referral system
```

### 5. Public Legal Pages (Live URLs)
- [ ] Privacy Policy: `https://<backend>/api/legal/privacy`
  - [ ] Verify page loads correctly
  - [ ] All required sections present:
    - Data collection practices
    - Third-party providers (Stripe, OpenAI, Google, Anthropic)
    - User rights and deletion
    - Children's privacy
    - Acceptable use policy
- [ ] Terms of Service: `https://<backend>/api/legal/terms`
- [ ] Both pages use correct domain for Play Console submission

### 6. Account Management Features
- [ ] Test account deletion flow in production
  - Navigate to Profile → Delete my account
  - Verify cascading deletion of: user, creations, chat sessions, usage records
  - Verify referred-by pointers are cleaned up
- [ ] Test password reset functionality (if applicable)

### 7. Payment Flow Testing
- [ ] Login as test user
- [ ] Test each plan upgrade (Spark → Singularity)
- [ ] Complete Stripe checkout with test card on production
  - Test card: `4242 4242 4242 4242` (use real test card for production, NOT sandbox)
- [ ] Verify plan auto-upgrades on success
- [ ] Verify webhook properly updates user plan
- [ ] Check daily usage limits are enforced
- [ ] Verify daily limit resets at correct time

### 8. Android App Bundle (AAB) Build
- [ ] Ensure all environment variables are set in Emergent deployment
- [ ] Build signed AAB with correct package name: `com.aiforge.app`
- [ ] Verify app version code/name matches play store submission
- [ ] Test AAB locally (if possible) for obvious errors
- [ ] Get AAB file from Emergent's publish pipeline

---

## 📋 GOOGLE PLAY CONSOLE SETUP

### Prerequisites (do these FIRST)
- [ ] Create Google Play Developer account ($25 one-time fee)
- [ ] Setup payment method for Play Console

### App Listing
- [ ] Create new app with package name: `com.aiforge.app`
- [ ] Default language: English (US)
- [ ] App category: Multimedia/Creative tools
- [ ] Contact email: support@aiforge.app
- [ ] Privacy policy URL: `https://<backend>/api/legal/privacy`
- [ ] Terms URL: `https://<backend>/api/legal/terms`

### Store Listing
- [ ] Short description (≤80 chars):
  ```
  "Forge AI images, videos, 3D & code. Multi-AI cyberpunk creation studio."
  ```
- [ ] Full description (≤4000 chars): 
  - Pitch the 6 plan tiers
  - Highlight multi-AI capabilities
  - Mention SCAD/STL exports
  - Explain referral system
- [ ] Category: Multimedia or Creativity
- [ ] Content rating: Likely "Teen" (user-generated content)

### Graphics & Media
- [ ] App icon (512x512 PNG) - uses your dark theme logo
- [ ] Feature graphic (1024x500 PNG) - creates in Canva
- [ ] 2+ phone screenshots (1080x1920 portrait):
  - Creation flow screenshot
  - Library/results screenshot
- [ ] Optional: Promotional video link (YouTube)

### APK/Bundle Upload
- [ ] Upload signed AAB under "Production → Create new release"
- [ ] Add release notes (describe new features)
- [ ] Target API level 34+ (check app.json)
- [ ] Verify bundle is signed correctly

### Content Rating Questionnaire
- [ ] Fill out "Content rating questionnaire"
- [ ] Answer honestly about user-generated content
- [ ] Content likely rated: PEGI 3+ or ESRB E (everyone)

### Data Safety Form
- [ ] Data collected:
  - ✅ Email address
  - ✅ User-generated prompts & media
  - ✅ Purchase history
- [ ] Data NOT sold or shared with marketers
- [ ] Data shared with third parties: Stripe, AI providers
- [ ] Encryption in transit: ✅ HTTPS enforced
- [ ] User data deletion: Available via Profile → Delete account

### Pricing & Distribution
- [ ] Free app (in-app purchases via Stripe)
- [ ] Distribute to: All countries (except sanctioned)
- [ ] Target countries/regions as needed

### Review Requirements
- [ ] Test account credentials (if sign-in required):
  ```
  Email: testaccount@example.com
  Password: <test password>
  ```
- [ ] Provide instructions if flows are non-obvious
- [ ] Note: In-app purchases via Stripe (not Play Store)

---

## ✅ PRE-LAUNCH TESTING CHECKLIST (FINAL 48 HOURS)

### Device Testing
- [ ] Install APK on Android device (not emulator)
- [ ] Test complete user flow:
  1. Launch app → onboarding
  2. Sign up with new email
  3. Navigate to all tabs (Create, Library, Plans, Profile)
  4. Generate one creation (image)
  5. View in Library
  6. Upgrade to Spark plan → Stripe checkout
  7. Complete payment with test card
  8. Verify plan upgrade succeeded
  9. Try to delete account
  10. Confirm deletion

### Regression Testing (Run on staging/production)
```bash
# Core API tests (these should ALL PASS)
pytest backend/tests/test_login_regression_iter7.py -v
pytest backend/tests/test_admin_lockdown_iter8.py -v  # If OWNER configured
```

### Network & Performance
- [ ] Test on WiFi
- [ ] Test on cellular 4G/5G
- [ ] Monitor logs for errors on production backend
- [ ] Check backend uptime

### Edge Cases
- [ ] Restart app mid-checkout (verify graceful recovery)
- [ ] Test with user who has no creations yet
- [ ] Test with user who has hit daily limit
- [ ] Test expired user session (force login)

---

## 🚨 LAUNCH DAY FINAL STEPS

1. **Submit to Google Play Review**
   - Upload AAB + assets
   - Submit for review (usually 1-7 days)

2. **Monitor Review Process**
   - Check Play Console daily for review feedback
   - Be ready to fix any issues within 24h
   - Common rejections: missing privacy policy, broken payment flow

3. **Once Approved: Release to Production**
   - Start with 10% rollout (if Play Console allows)
   - Monitor crash rates & reviews
   - Ramp to 50% after 12h with no major issues
   - Full rollout after 24h

4. **Post-Launch Monitoring**
   - Daily: Check crash reports in Play Console
   - Daily: Monitor Stripe payouts
   - Weekly: Review user ratings and comments
   - Daily: Check backend logs for errors: `tail -f /var/log/supervisor/backend.out.log`

---

## 📞 SUPPORT SETUP

Before launch, set up these:
- [ ] Support email: support@aiforge.app (create forwarding address or mailbox)
- [ ] Privacy policy mentions support@aiforge.app
- [ ] Add to Privacy Policy link in Play Console

---

## 🔐 SECURITY CHECKLIST (Final Review)

- [ ] All sensitive secrets in `.env` files (NOT in code)
- [ ] JWT_SECRET is strong (32+ random chars)
- [ ] MONGO_URL uses strong password
- [ ] Stripe key is live, not sandbox
- [ ] HTTPS enforced everywhere
- [ ] No console.logs in production (check frontend build)
- [ ] Rate limiting enabled on auth endpoints
- [ ] CORS properly configured (not wide open)

---

## 📞 CONTACTS & RESOURCES

- **Google Play Console**: https://play.google.com/console
- **Stripe Dashboard**: https://dashboard.stripe.com
- **Emergent Integrations**: (contact your Emergent representative)
- **App Store Assets**: Canva (for graphics), YouTube (for video links)

---

## TIMELINE

| Day | Task |
|-----|------|
| Day 1-3 | ✅ Verify backend production environment |
| Day 3-4 | ✅ Complete Stripe live mode setup |
| Day 5 | ✅ Final device testing (all user flows) |
| Day 6 | ✅ Create Google Play Console assets |
| Day 7 | ✅ Submit to Google Play Review |
| Day 8 | 🔄 Address review feedback (if any) |
| Day 9 | 🚀 Approve & release to users |

---

**Questions?** Check `memory/LAUNCH_CHECKLIST.md` for additional details on Stripe setup.

