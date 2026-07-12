# 🚀 AiForge Google Play Store Launch - 9-Day Action Plan

## STATUS: ✅ APP IS PRODUCTION READY

Your app is feature-complete and tested. Here's what needs to happen in the next 9 days.

---

## 🎯 TODAY'S PRIORITIES (Next 24 hours)

### 1. Contact Emergent Team
**Critical** - You cannot proceed without this
```
Tell them:
- You're launching to Google Play Store in 9 days
- Need production backend deployed with live Stripe key
- Need signed Android App Bundle (AAB) built
- Current package ID: app.emergent.fierceforgeios2c75fc60

Ask them to set these .env variables on production:
  MONGO_URL=<your-atlas-connection>
  DB_NAME=aiforge
  EMERGENT_LLM_KEY=<valid-key>
  JWT_SECRET=<strong-secret>
  STRIPE_API_KEY=sk_live_<YOUR_LIVE_KEY>
  ADMIN_EMAIL=<your-email>
  ADMIN_PASSWORD=<your-password>
```

### 2. Get Stripe Live Key
- Go to https://dashboard.stripe.com
- Sign up or log in
- Copy your **live secret key** (starts with `sk_live_`)
- Send it to Emergent (don't share publicly!)

### 3. Create Google Play Developer Account
- Go to https://play.google.com/console
- Pay $25 (one-time fee)
- Create app with package: `app.emergent.fierceforgeios2c75fc60`

---

## 📋 DAYS 1-3: SETUP

### Stripe Setup (30 mins)
- [ ] Create Stripe Live account
- [ ] Copy live secret key
- [ ] Add webhook endpoint: `https://<your-domain>/api/webhook/stripe`
- [ ] Subscribe to `checkout.session.completed` event
- [ ] Connect bank account for payouts

### Google Play Store Setup (2 hours)
1. Create new app (already bought account)
2. Fill in app listing:
   - App name: **AiForge**
   - Category: **Multimedia/Creativity**
   - Contact: **support@aiforge.app**
   - Privacy: **https://[your-domain]/api/legal/privacy**
   - Terms: **https://[your-domain]/api/legal/terms**
3. Upload graphics:
   - App icon: 512x512 (dark theme logo)
   - Feature graphic: 1024x500 (use Canva)
   - Screenshots: 4 (1080x1920 portrait)
     - Onboarding screen
     - Creation result
     - Library view
     - Plans/payment screen
4. Fill questionnaire:
   - Content rating: **Teen** (user-generated content)
   - Data safety: Fill honestly about data collection
5. Set as **Free with in-app purchases**

### Wait for Emergent Deployment
- They should deploy production backend
- You'll get production domain (or use theirs)
- Update `frontend/.env` with backend URL if different

---

## 📱 DAYS 4-6: TESTING

### Device Testing (2-3 hours)
Get a real Android device (not emulator). Run through this flow:

1. **Install App**
   - Get AAB from Emergent
   - Install on device

2. **First Time User**
   - Launch → see onboarding
   - Click "Create Account"
   - Sign up with test email
   - Complete profile setup

3. **Create Something**
   - Go to Create tab
   - Type prompt: "A cool red robot"
   - Click Generate
   - Wait for result
   - Verify it shows in Library

4. **Upgrade Plan** (with real test card)
   - Go to Plans tab
   - Click "Spark Plan" ($9.99)
   - Proceed to Stripe checkout
   - Use test card: **4242 4242 4242 4242**
   - Any future date, any CVC
   - Complete payment
   - Should see plan upgraded immediately

5. **More Features**
   - Generate another creation in new plan
   - Share referral code
   - Delete account (Profile → Delete Account)
   - Confirm everything deletes

6. **Verify Legal Pages**
   - Open Privacy Policy link
   - Open Terms of Service link
   - Make sure both load correctly

### Backend Testing (1 hour)
```bash
# Run this once before launch to verify everything still works
cd /workspaces/Aiforge
python -m pytest backend/tests/test_login_regression_iter7.py -v

# Should show:
# 8/8 PASS ✅
```

---

## 📦 DAYS 7-8: FINAL SUBMISSION

### Pre-Flight Checklist
Before uploading to Play Store, verify:

- [ ] Stripe live key is set in production (NOT sandbox)
- [ ] Backend is responding: `curl https://[your-domain]/api/`
- [ ] Privacy Policy loads: `https://[your-domain]/api/legal/privacy`
- [ ] Terms load: `https://[your-domain]/api/legal/terms`
- [ ] Test card checkout works end-to-end
- [ ] Account deletion works
- [ ] All screenshots are 1080x1920

### Upload to Google Play Console

1. **Create Release**
   - Go to Production → Create New Release
   - Upload AAB file

2. **Add Release Notes**
   ```
   "AiForge launches with:
   - Multi-AI creation (images, videos, 3D models, code)
   - Share-to-earn referral system
   - Cyberpunk dark theme with neon effects
   - Real-time generation with various AI models
   - Persistent chat memory
   - Daily generation limits per plan"
   ```

3. **Add Test Account (if needed)**
   ```
   Email: testaccount@example.com
   Password: testpassword123
   ```

4. **Submit for Review**
   - Click "Submit for Review"
   - Wait for email confirmation
   - Review typically takes 1-7 days

---

## 🚀 DAY 9: LAUNCH & MONITORING

### After Approval
1. **Release to Users**
   - Start with 10% rollout
   - Wait 12 hours
   - Ramp to 50% if no crashes
   - Full rollout after 24h

2. **Monitor Everything**
   ```bash
   # Daily checks:
   tail -f /var/log/supervisor/backend.out.log
   ```
   - Watch for errors
   - Check Stripe dashboard for payments
   - Reply to user reviews

---

## 🆘 QUICK REFERENCE

### Critical Contacts
- **Stripe Support**: https://support.stripe.com
- **Google Play Support**: https://support.google.com/googleplay
- **Emergent Support**: (your account manager)

### Critical URLs
- **Stripe Dashboard**: https://dashboard.stripe.com
- **Play Console**: https://play.google.com/console
- **Backend Health**: https://[your-domain]/api/
- **Privacy Policy**: https://[your-domain]/api/legal/privacy

### Critical Variables
```env
# For Emergent to set on production:
STRIPE_API_KEY=sk_live_<YOUR_LIVE_STRIPE_KEY>
MONGO_URL=<YOUR_ATLAS_CONNECTION>
ADMIN_EMAIL=<YOUR_EMAIL>
```

### Critical Filenames
- `.env` - **NEVER commit this to git**
- `AAB` - Your signed Android App Bundle
- Screenshots - 1080x1920 PNG format

---

## ✅ WHAT'S ALREADY DONE

Your development team already completed:
- ✅ Complete multi-AI generation platform
- ✅ Stripe checkout integration (working end-to-end)
- ✅ User authentication & registration
- ✅ Referral system with bonuses
- ✅ Daily usage limits
- ✅ Account deletion flow
- ✅ 6-tier pricing plans
- ✅ Privacy Policy & Terms (hosted on backend)
- ✅ All core tests passing
- ✅ Dark theme with animations
- ✅ App icons and graphics prepared
- ✅ Backend API fully functional

---

## 🎯 SUCCESS CRITERIA

You're ready to launch when:
1. ✅ Emergent has deployed production backend
2. ✅ Stripe live key is active in production
3. ✅ Test payment flow works end-to-end
4. ✅ Google Play Store listing is complete
5. ✅ App rating is good (no crashes in testing)
6. ✅ All screenshots are correct
7. ✅ Privacy/Terms pages load correctly
8. ✅ Final pytest passes: 8/8 tests pass

---

## 📊 TIMELINE SUMMARY

| Days | What | Who |
|------|------|-----|
| Day 1 | Get Stripe live key, contact Emergent | You |
| Days 1-3 | Production deployment | Emergent |
| Days 2-3 | Google Play Store setup | You |
| Days 4-6 | Device testing | You |
| Days 6-7 | Fix any issues | You/Emergent |
| Days 7-8 | Submit to Play Store | You |
| Day 8+ | Monitor review process | You |
| Day 9+ | Released to public! 🎉 | You |

---

## 💡 PRO TIPS

1. **Don't Skip Device Testing**
   - Emulator is NOT sufficient
   - Test on real device with real Stripe test card
   - Catch issues before Google Play sees them

2. **Be Ready for Play Store Feedback**
   - Common issues: Privacy policy format, broken links
   - Can usually fix in 24h and resubmit
   - Keep Emergent on standby

3. **Monitor Stripe Dashboard Daily**
   - Watch for payment failures
   - Verify payouts are scheduled
   - Check transaction logs

4. **Set Up Email Monitoring**
   - Google Play review emails
   - Crash reports
   - User reviews
   - Support requests → support@aiforge.app

---

**You've got this! The app is ready. Now just execute the launch plan.** 🚀

Good luck! 🎉

