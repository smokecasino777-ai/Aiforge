# AiForge — Sustainable Pricing and Google Play Release

AiForge is a mobile AI studio for images, editing, chat, voice, research, video and 3D creation where supported.
Monthly subscriptions and optional credit packs provide predictable customer spending without unlimited AI costs for the owner.

## Who it's for
- Casual users who want a free introduction or a small, non-subscription purchase.
- Regular creators who want a predictable monthly allowance.
- Heavy creators who need larger allowances without enterprise contracts.
- An owner who needs sustainable margins, transparent expenses and no unexpected provider purchases.

## Core features and experience

### Recommended business model
Replace the proposed **500 generations per day** offer with **fixed monthly credits** for new subscriptions. Different actions consume different amounts: a short text reply must not cost the same as a premium video.

Subscription customers receive better credit value than one-time buyers. Neither option requires the other. All tiers use the same clearly explained credit system; no plan promises unlimited generation.

The existing 500/day allowance is not a safe pricing benchmark. For illustration, 500 images daily over 30 days at Google's published $0.067 image-output rate would cost about **$1,005 monthly**, before input charges, video or other expenses. Actual charges through the connected service can differ.

### Proposed monthly subscriptions
USD reference prices; customers see their store's localized price and renewal terms.

| Plan | Monthly price | Credits per billing month | Maximum AI-cost allocation for that allowance* |
|---|---:|---:|---:|
| Free | $0 | 100 introductory credits, once | $0.10 per eligible account |
| Spark | $9.99 | 2,000 | $2 |
| Creator | $19.99 | 4,500 | $4.50 |
| Pro | $49.99 | 12,000 | $12 |
| Studio | $99.99 | 25,000 | $25 |
| Max | $199.99 | 50,000 | $50 |

*These are proposed spending allocations, not provider price quotes or guaranteed generation counts. They depend on the cost-based credit rules below.

- Monthly credits refresh on the paid billing anniversary, not every day. Unused monthly credits expire at the end of that billing period; this is disclosed before purchase.
- Free starter credits expire after 30 days and do not replenish daily. Local editing and browsing remain free. Starter grants are limited by the funded promotional budget and abuse controls.
- No new weekly or annual plans in the initial catalog. Existing purchased terms are not silently changed.
- New promotional and referral grants follow the same limited promotional budget; the old automatic +20/day referral promise is not offered to new users.

### Optional one-time packs
Available without a subscription. Purchased credits do not expire and are used after expiring promotional or monthly credits.

| Price | Credits |
|---:|---:|
| $2.99 | 400 |
| $9.99 | 1,500 |
| $24.99 | 4,000 |
| $49.99 | 8,500 |
| $99.99 | 18,000 |
| $249.99 | 47,500 |
| $499.99 | 95,000 |
| $999.99 | 190,000 |

The requested approximately $1,000 pack is **$999.99**, avoiding an assumption that this developer account qualifies for a higher Play price ceiling. Local store limits still apply. Larger packs appear under “More packs,” with a clear second confirmation and no preselection. Unsupported or unfunded packs cannot be purchased.

### Cost-based AI usage
- **Economy** is the default: the least-expensive currently supported model that meets the task's quality requirements. **Higher quality** is an explicit, more expensive choice.
- Every action shows its credit quote before it starts, including image size, video duration, text limits and voice duration where relevant.
- One credit has an internal maximum AI-cost allocation of **$0.001**. The customer price is not a cash conversion rate: credits cannot be withdrawn, transferred or traded.
- Charge enough credits to cover the estimated upper-bound connected-provider cost **plus a 25% safety allowance**, rounded upward. Include prompt/context, output, audio, video length and any provider surcharge—not just a headline output price.
- Quotes are fixed for the accepted request. More expensive fallback models require a new customer-approved quote; they cannot run silently. Long chats, retries and parallel requests are bounded.
- Failed or cancelled-before-processing requests release the customer's reservation. Provider costs already incurred remain owner expenses and count against the budget. There are no uncontrolled automatic retries.
- Do not promise a fixed number of images or videos across models. Before purchase, show examples using currently available model quotes. Credit quantities from competitors are not directly comparable.
- Deprecated, unavailable or unpriced models are not sold as working features. The currently documented Sora 2 retirement makes a supported, priced video replacement a release condition for selling video generation. The available managed integration guidance does not establish that Veo video is included; no such coverage is assumed.
- Basic voice uses a cost-effective supported route. Premium voices and research services are metered separately and enabled only with valid existing provider access and known costs.

### Owner budget and margins
- Plan allowances target approximately **20–25% of sticker price** for maximum AI usage. Retain at least **50% of net sales after store/billing fees and AI costs**, before hosting, support and other business expenses, wherever the regional economics permit.
- Budget conservatively for **up to 30% store fees, 1% billing-management fees and a 5% refund reserve** until the account's actual terms are confirmed. Reduced fees improve the outcome; they are not assumed.
- Example: the $9.99 plan reserves $2 for AI. After those conservative fee/refund allowances, about **$4.39 remains before taxes, hosting and support**. This is an illustration, not a profit guarantee.
- Start with a **$25 monthly ceiling for promotional and owner-funded AI usage**, drawn only from already-purchased provider credit. No automatic top-ups, new subscriptions or additional provider charges are authorized.
- Paid allowances need their own fully funded usage reserve. Outstanding customer credits are liabilities, not free profit. Pending store payouts do not count as immediately available cash.
- Do not sell additional allowances when existing provider funds cannot cover them. Existing customers' reserved service has priority over new sales or giveaways.
- Apply per-request, per-account and app-wide spending safeguards, including owner/admin usage. Provider-side spending limits are used when available. In-app estimates alone cannot guarantee an exact external bill because reporting can lag.
- Owner-visible spending, outstanding credit obligations and low-budget warnings make the pricing understandable without relying on generation counts alone.

### Payments, existing customers and release boundaries
- Android digital purchases remain on **Google Play Billing through RevenueCat**, including subscriptions and consumable credit packs. No Stripe or Razorpay checkout is introduced into the Android purchase flow.
- The current installed billing SDK already supports Billing Library 8.3.0. Keep a Google-supported billing version; billing-library compliance does not resolve a separate developer-account rejection.
- Customers receive credits only after verified payment. Pending payments do not unlock spending. Duplicate notifications cannot grant credits twice; renewals, cancellations, refunds and restores have explicit outcomes.
- Restore recovers eligible subscriptions; consumed purchases are not repurchased or recreated. Remaining purchased credits stay linked to the customer's AiForge account.
- Existing purchased balances and paid contractual benefits are preserved. Any migration distinguishes actual purchases from promotional allowances and uses required notice or consent. New plan names do not overwrite legacy benefits merely because names overlap.
- A connected billing account does **not** prove all products are live. The managed subscription setup does not automatically cover this full multi-tier and consumable catalog. Matching products, active base plans, store credentials and supported billing-service configuration remain required; incomplete products stay unavailable, not falsely purchasable.
- The goal is a signed AAB and a Google Play release. Production publication remains conditional on the correct upload signing, a versionCode above every existing upload, working purchase fulfillment, the required internal/closed-track gate and Google's account/policy approval. The highest existing versionCode is still unverified; neither “20” nor the PDF's “139” is treated as current fact.
- Developer-account and financial-feature declarations must describe actual features. Noncash credits alone do not justify guessing the correct declaration. Any appeal uses verified facts and is shown verbatim before submission.
- Repository history changes remain stopped because the active branch differs from the specifically authorized cleanup branches. No repository or Play listing is deleted. Potentially exposed credentials require rotation and two-step verification should be re-enabled; credentials are never repeated publicly.

### Research basis
- [Adobe Firefly official plans](https://www.adobe.com/products/firefly/plans.html): $9.99, $19.99, $49.99 and $199.99 price points support the proposed range, not equivalent output allowances.
- [Leonardo pricing](https://www.leonardo.ai/pricing) and [Runway pricing](https://runway.com/pricing): credit-based subscriptions and optional additional usage are established market patterns; annual-discount prices are not treated as monthly billing prices.
- [Google AI pricing](https://ai.google.dev/gemini-api/docs/pricing): different models, resolutions and service tiers have materially different costs. Public direct-provider rates are not assumed identical to connected-account charges.
- [Google Play increased price limits](https://support.google.com/googleplay/android-developer/answer/16247119?hl=en) and [service fees](https://support.google.com/googleplay/android-developer/answer/112622?hl=en): price ceilings and fee eligibility require account/market-specific confirmation.
- [RevenueCat pricing](https://www.revenuecat.com/pricing): allow for a billing-management fee rather than assuming unlimited free processing.
- [Sora 2 model documentation](https://developers.openai.com/api/docs/models/sora-2): do not base a new paid offer on a retired model or stale per-second pricing.

## User flow
1. Explore AiForge free and see the available introductory allowance.
2. Choose a creative tool and an Economy or higher-quality option.
3. Review the exact credit charge and expected output before creating.
4. If more credits are needed, choose a monthly plan or a one-time pack; buying a pack never requires subscribing.
5. Confirm the localized price in Google Play. Credits appear after payment verification.
6. Create and save work, check remaining balances and distinguish expiring monthly credits from non-expiring purchased credits.
7. Manage or cancel subscriptions, restore eligible purchases and view purchase status without being told to buy again after a delay.

## UI/UX feel
Preserve AiForge's existing dark, neon mobile identity. Keep pricing calm and clear: “Monthly plans” and “One-time packs,” visible credit balances, renewal dates and upfront action costs. Highlight the $19.99 Creator plan as a suggested starting point, not as an unsupported “most popular” claim. Avoid fake savings, manufactured urgency, unlimited-use promises and hiding expensive video charges.

## Implementation phases

### Phase 1 — MVP: cost-controlled paid catalog and release preparation
The scope built after approval is the free introduction, the five monthly tiers, the eight optional pack sizes, upfront action quotes, funded spending limits and Google Play purchase/credit handling. Existing creative tools are retained with metering and truthful availability. AAB/release preparation is included; unavailable products, unfunded services and unresolved policy gates are not bypassed to appear live.

### Phase 2 — Optimize with real usage
Review actual provider cost, quality, refunds and customer demand before changing future offers. Improve affordable model choices, expand verified video options and assess whether annual plans or additional discounts remain profitable. No automatic reduction of existing purchased benefits.

### Phase 3 — Expand proven services
Broaden advanced voice, research and creator workflows only where demand and measured margins support them. Additional costly integrations or commercial commitments require separate authorization.

**Only Phase 1 is proposed for building now.**

## Assumptions
- USD is the reference currency because the requested price range and existing offers use dollars; store-localized prices are displayed to customers.
- The recommendation prioritizes predictable margins and reasonable entry pricing, not an unsupported promise of the absolute cheapest service or maximum possible revenue.
- Monthly subscriptions plus standalone packs are chosen because the user explicitly requested both after the initial pricing questions.
- The exact tier names, credit amounts, pack steps, one-time 100-credit trial, 30-day promotional expiry and $25 promotional ceiling are proposed defaults, not previously approved live changes.
- $999.99 satisfies the requested approximately $1,000 maximum without assuming special higher-price eligibility.
- Monthly credits do not roll over; purchased credits do not expire. No recurring unlimited free or referral grants are offered to new users.
- All enabled paid AI actions consume credits, including premium chat, research, voice, editing, video and 3D work. Ordinary local editing and browsing do not consume AI credits.
- Cost-based quotes can vary by model and output settings; rates for future requests are visible before confirmation. Existing paid terms are not silently changed.
- Existing purchased provider balances are the only authorized source of AI funding. Receiving app-store revenue does not authorize automatic new external charges.
- Google account access, live product readiness, signing and production approval are not assumed. Payment connection and an AAB alone cannot guarantee a live Google Play listing.
- No new pricing, products, charges or production submission occurs during this planning step.