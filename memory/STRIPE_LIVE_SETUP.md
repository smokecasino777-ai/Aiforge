# Stripe Live Mode — How to receive REAL money in AiForge

This app is currently configured with the **Emergent Stripe sandbox key** (`sk_test_emergent`) so you can test the checkout flow without setting up an account. To actually receive money from real customers, follow these steps.

---

## 1. Create a real Stripe account
1. Go to https://dashboard.stripe.com/register
2. Verify your email and complete onboarding (legal entity, bank account for payouts, tax info, etc.).
3. Once activated, your account can accept real cards.

## 2. Grab your live secret key
1. Dashboard → **Developers → API keys**
2. Toggle to **Live mode** (top-right switch)
3. Copy the **Secret key** — it starts with `sk_live_...`

> ⚠️ Treat this key like a password. Never commit it to git or share it.

## 3. Paste it into your backend `.env`
Open `/app/backend/.env` and replace the test key:

```env
STRIPE_API_KEY=sk_live_51XXXXXXXXXXXXXXXXX
```

Restart the backend:
```bash
sudo supervisorctl restart backend
```

That's it on the AiForge side — the code uses `STRIPE_API_KEY` from `.env` so no source changes are required.

## 4. Configure the webhook (so plan upgrades happen automatically even if the user closes the tab)
1. Dashboard → **Developers → Webhooks → Add endpoint**
2. **Endpoint URL**:
   ```
   https://<your-production-domain>/api/webhook/stripe
   ```
3. **Events to send**: choose `checkout.session.completed` (and optionally `payment_intent.succeeded`).
4. After creation, Stripe shows a **Signing secret** that starts with `whsec_...`. (Not strictly required for our current implementation, but you can add it later for signature validation.)

## 5. (Recommended) Add real product pricing
Our current code charges variable amounts per plan, which is fine. If you want recurring subscriptions instead of one-time payments, do this later:
- Create **Products** in Stripe Dashboard for Spark / Forge / Neon / Quantum / Singularity
- Switch `CheckoutSessionRequest.amount` → `stripe_price_id=<the price id>` in `server.py:create_checkout`
- Change `mode='payment'` → `mode='subscription'` (this requires also patching the integration library or using the raw stripe SDK).
- Tell me when you want this and I'll wire it up.

## 6. Update the success / cancel URLs
The code already builds the success/cancel URLs from `origin_url` sent by the client. In production this should be your real domain (e.g. `https://aiforge.app`). No code change needed if your domain is consistent.

## 7. Tax & compliance reminders
- Enable **Stripe Tax** (Dashboard → Tax) so US sales tax and EU VAT are auto-collected.
- Add a **Privacy Policy** and **Terms of Service** in the app (a Profile menu entry can link to them).
- For Apple App Store, in-app digital goods MUST use Apple In-App Purchase. **Stripe is allowed on Google Play** for digital content as of March 2024 (alternative billing).

## 8. Test it
1. With your `sk_live_...` key in `.env`, restart backend.
2. From the app → Plans → Upgrade Spark.
3. Use a real card (or a Stripe test card like `4242 4242 4242 4242` — but note Live mode rejects test cards). For a live-mode safe test, use Stripe's [test clocks & live-mode test cards](https://stripe.com/docs/testing#test-cards).
4. Check Stripe Dashboard → Payments — you should see the new payment.

## Money flow summary
1. Customer taps **Upgrade** in the app.
2. We POST to `/api/checkout/create` → Stripe creates a Checkout Session → returns hosted URL.
3. The app opens the Stripe page (in-app browser or WebView).
4. Customer pays → Stripe redirects them to `/payment/success?session_id=...`.
5. Our `/api/checkout/status/{session_id}` confirms with Stripe and **flips the user's plan in MongoDB**.
6. Independently, Stripe POSTs to our `/api/webhook/stripe` so plan upgrade happens **even if the customer closes the browser** during the redirect.
7. Stripe pays YOU on a rolling 2-day schedule into the bank account you connected in step 1.

---

If anything in the flow ever feels off, hit the Plans tab in dev, watch `tail -f /var/log/supervisor/backend.out.log`, and trace the calls. Reach out and I'll dig in.
