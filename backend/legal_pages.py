"""Static HTML for AiForge legal pages — served at /legal/privacy and /legal/terms.

Mirrors the in-app pages (app/legal/privacy.tsx and terms.tsx) so we can give
Google Play Console a public URL.
"""

_BASE_CSS = """
:root {
  color-scheme: dark;
  --bg: #020208;
  --bg2: #0A0A14;
  --card: #12121C;
  --border: rgba(255,255,255,0.12);
  --text: #FFFFFF;
  --dim: #A1A1AA;
  --cyan: #00F0FF;
  --green: #00FF66;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; -webkit-font-smoothing: antialiased; }
body {
  background:
    radial-gradient(circle at 20% 10%, rgba(176,38,255,0.10), transparent 50%),
    radial-gradient(circle at 90% 80%, rgba(0,240,255,0.10), transparent 50%),
    var(--bg);
  min-height: 100vh;
}
.wrap { max-width: 760px; margin: 0 auto; padding: 56px 22px 80px; }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 26px; }
.brand .b { font-weight: 900; font-size: 22px; letter-spacing: -0.5px; }
.brand .b .a { color: var(--cyan); }
.brand .b .f { color: var(--green); }
h1 { font-size: 38px; font-weight: 900; letter-spacing: -0.8px; margin: 0 0 6px; }
.updated { color: rgba(255,255,255,0.4); font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 800; margin-bottom: 22px; }
.intro { color: var(--dim); font-size: 16px; line-height: 1.55; margin-bottom: 24px; }
.section { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 18px 20px; margin: 14px 0; }
.section h2 { margin: 0 0 10px; font-size: 17px; font-weight: 900; letter-spacing: 0.3px; }
.privacy .section h2 { color: var(--cyan); }
.terms .section h2 { color: var(--green); }
.section p { white-space: pre-line; line-height: 1.6; font-size: 15px; color: var(--text); margin: 0; }
.footer { margin-top: 48px; color: rgba(255,255,255,0.35); font-size: 12px; text-align: center; }
.footer a { color: var(--cyan); text-decoration: none; }
"""


PRIVACY_SECTIONS = [
    ("1. Who we are", "AiForge (\"we\", \"us\") is a multi-AI creation app operated by the developer behind the Google Play listing for `com.aiforge.app`. Contact: support@aiforge.app."),
    ("2. What we collect", "• Account: email address and a hashed password (we never see your raw password).\n• Content: text prompts you submit and the resulting media (images, video, 3D renders, OpenSCAD code, chat replies). These are stored under your account so you can retrieve them in your Library.\n• Usage: daily generation counts and plan/tier.\n• Payment: when you upgrade we send the request to Stripe; Stripe (not us) handles the card. We store only the Stripe session id, the amount, the plan, and your paid timestamp.\n• Device: standard server logs (IP, user-agent) for security and abuse prevention.\n• Referrals: your unique referral code and the user-id of whoever referred you, if applicable."),
    ("3. How we use it", "• To run AiForge: authenticate you, generate AI content, save your creations, count your daily usage, and apply your plan limits.\n• To bill you: hand over payment data to Stripe and update your plan when payment succeeds.\n• To grow: when you redeem a referral code, we award the bonus to both accounts.\n• We do NOT sell your data. We do NOT show third-party ads."),
    ("4. Third-party services we send data to", "• Stripe — to process payments. See https://stripe.com/privacy.\n• OpenAI (Sora 2) — your video-generation prompts.\n• Google Gemini (Nano Banana) — your image/3D prompts.\n• Anthropic (Claude) — your chat and SCAD-code prompts.\n\nThese providers process your prompts only to fulfill the request. We send only what is necessary (prompt + minimal metadata)."),
    ("5. Storage & security", "Data is stored in a managed MongoDB instance. Passwords are hashed with bcrypt. All traffic between the app and our backend is HTTPS. Stripe keys live only on the server (never in the app bundle)."),
    ("6. Your rights", "You can:\n• View your data — every creation is visible in the Library.\n• Delete a single creation — open it and tap Delete.\n• Delete your entire account — Profile → \"Delete my account\" (this is irreversible and erases creations, chats, usage history, and payment records).\n• Export your data — email support@aiforge.app and we will return a JSON archive within 14 days.\n• Withdraw consent — uninstall the app and trigger account deletion."),
    ("7. Children", "AiForge is not directed to children under 13. If you believe a child has signed up, contact support@aiforge.app and we will remove the account."),
    ("8. Changes", "We may update this policy. The \"Last updated\" date below tracks revisions. Material changes are announced in-app before they take effect."),
    ("9. Contact", "support@aiforge.app — we reply within 5 business days."),
]


TERMS_SECTIONS = [
    ("1. Acceptance", "By creating an account or using AiForge (\"the App\") you agree to these Terms. If you do not agree, do not use the App."),
    ("2. The service", "AiForge is an AI-powered creation tool. You send text prompts; we route them through third-party AI models (OpenAI Sora 2 for video, Google Gemini Nano Banana for images and 3D, Anthropic Claude for chat and OpenSCAD code) and return the result. Generated content is saved to your private Library."),
    ("3. Your account", "You must be at least 13 years old (or the age of majority in your country, whichever is higher). You are responsible for keeping your password safe. You may not share your account or sell access to it."),
    ("4. Acceptable use", "You agree NOT to use AiForge to generate:\n• CSAM, deepfake non-consensual sexual content, or content that exploits minors;\n• harassment, doxxing, or material targeting a specific real person without consent;\n• content that infringes copyright or trademarks you do not own;\n• disinformation or impersonation of real public figures in misleading contexts;\n• malware, instructions for weapons, or content that violates applicable law.\n\nWe enforce the safety policies of our upstream model providers (OpenAI, Google, Anthropic). Repeated or severe violations result in account termination without refund."),
    ("5. Your content", "You retain ownership of every prompt you write and every output you generate. By using the App you grant us a non-exclusive license to store the content on our servers so we can show it back to you. We do not use your content to train AI models. Paid-plan users receive a commercial-use license on outputs they generate while subscribed."),
    ("6. Subscriptions & payments", "Plans (Free / Spark / Forge / Neon Pro / Quantum / Singularity) are billed monthly through Stripe. Plan upgrades take effect immediately on payment success. You may downgrade at any time from the Plans tab; downgrade takes effect at the end of the current period. We do not refund partial periods."),
    ("7. Daily limits", "Each plan includes a daily generation quota. When you hit the cap, generation requests return HTTP 402 until the next UTC day or until you upgrade. We may adjust limits to keep the service available for everyone; we will not silently lower YOUR plan unless we publicly announce the change."),
    ("8. Referral program", "Each user gets a unique referral code (e.g. AF-XXXXXX). When a friend signs up using your code, both accounts receive a +20 generations/day bonus for 7 days. Referral bonuses are non-transferable and have no cash value. We may modify or end the program at any time with reasonable notice."),
    ("9. Termination", "You can delete your account at any time from Profile → \"Delete my account\". Deletion is irreversible. We can suspend or close accounts that violate Section 4 (\"Acceptable use\") or attempt fraud against the payment system."),
    ("10. Disclaimers", "AiForge is provided \"AS IS\". AI outputs may be inaccurate, offensive, or unsuitable for a specific use case. You are responsible for reviewing outputs before publishing or distributing them. We do not guarantee uptime; downstream AI providers may have outages."),
    ("11. Limitation of liability", "To the maximum extent permitted by law, AiForge's total liability for any claim related to the service is capped at the amount you paid us in the 12 months before the claim. We are not liable for indirect, incidental, or consequential damages."),
    ("12. Changes", "We may update these Terms. We post the new version with a fresh \"Last updated\" date. Continuing to use the App after a change means you accept the new Terms."),
    ("13. Contact", "support@aiforge.app — we reply within 5 business days."),
]


def _render(kind: str, title: str, intro: str, sections: list) -> str:
    body = "".join(
        f'<div class="section"><h2>{h}</h2><p>{txt}</p></div>'
        for h, txt in sections
    )
    return f"""<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AiForge — {title}</title>
  <style>{_BASE_CSS}</style>
</head>
<body class="{kind}">
  <div class="wrap">
    <div class="brand"><div class="b"><span class="a">Ai</span><span class="f">Forge</span></div></div>
    <h1>{title}</h1>
    <div class="updated">Last updated: June 2026</div>
    <div class="intro">{intro}</div>
    {body}
    <div class="footer">
      © 2026 AiForge · <a href="/legal/privacy">Privacy</a> · <a href="/legal/terms">Terms</a> · support@aiforge.app
    </div>
  </div>
</body></html>
"""


PRIVACY_HTML = _render(
    "privacy",
    "Privacy Policy",
    "This policy explains what data AiForge collects when you use the app, why we collect it, and what your rights are. We wrote it in plain English on purpose.",
    PRIVACY_SECTIONS,
)


TERMS_HTML = _render(
    "terms",
    "Terms of Service",
    "These are the rules of the road for using AiForge. Plain English, no surprises.",
    TERMS_SECTIONS,
)
