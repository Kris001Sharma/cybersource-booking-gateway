# Sapana Village Resort — Payment Integration: Project Status & Architecture

Last updated: Sep 5, 2026. This is a living reference — update the status sections as things move, rather than re-deriving them from chat history.

## 1. Goal

A portable payment/booking subsystem that plugs into the existing Strikingly site (and any future site) via a simple link, with server-side pricing, deposit-tier logic, and payment confirmation that's never trusted from the client.

## 2. Architecture decisions (chronological, why we landed here)

| Decision | Why |
|---|---|
| Cloudflare Workers, not a traditional server | No infrastructure to patch/scale; matches "least effort, most reliable" goal |
| Google Sheet (via Apps Script Web App) as the data store | Human-readable/editable, no OAuth/service-account complexity for a Worker to manage |
| Server always recomputes price/deposit from the catalog | Never trust a client-supplied amount — prevents tampering |
| Payment confirmation must come from CyberSource's server, not the browser | Prevents fake/forced "booking confirmed" states |
| Three payment methods kept as separate modules, not one replacing another | Different CyberSource products have turned out to have independent account entitlements — keeping them isolated means fixing/enabling one never risks breaking another |
| `embedded/` (Microform, Unified Checkout) vs `hosted/` (Pay by Link) folder split | These are two genuinely different integration paradigms (card fields on your page vs. redirect to CyberSource's page), not three interchangeable options |

## 3. Project structure

```
poc-booking/
  wrangler.toml
  .dev.vars              (local secrets only, gitignored)
  apps-script.gs          (paste into the Sheet's Apps Script editor)
  src/
    catalog.js            shared: pricing + deposit-tier math
    cybersource.js         shared: signed-request helper (HTTP Signature auth)
    bookings.js             shared: Sheet read/write
    worker.js                thin router only
    methods/
      embedded/
        microform.js        Module 1 — direct REST /pts/v2/payments
        unified-checkout.js Module 3 — stub, not yet built
      hosted/
        paylink.js          Module 2 — Pay by Link, current default
```

## 4. Payment method status

### Module 1 — Microform (`methods/embedded/microform.js`)
**Status: 🟡 Code-complete, blocked on account activation.**
- ✅ Confirmed working: Microform tokenization (`/microform/v2/sessions`), card field rendering, transient token creation.
- ❌ Blocked: the actual charge (`/pts/v2/payments`) is rejected 100% of the time with `DAGGREJECTED — "Acquirer or another higher control Denies processing of transactions based on Custom Rules Set"`, regardless of card, card origin, or currency tested.
- **Waiting on:** NIMB/CyberSource support response (email sent — see §6). Suspected cause: the REST API/e-commerce processing connection isn't fully linked for this merchant ID, separately from Pay by Link's connection (which works).
- **Next action once unblocked:** none needed — code is ready to test as-is.

### Module 2 — Pay by Link (`methods/hosted/paylink.js`)
**Status: 🟢 Working end-to-end; webhook subscription created, awaiting CyberSource approval.**
- ✅ Confirmed working: link creation, hosted payment page, full 3DS/OTP, real fund deduction.
- ✅ Webhook subscription created: `webhookId: 5ab8e3eb-e5fc-2094-e063-90588d0aaaba`, `status: PENDING_REVIEW`. Per CyberSource docs, new webhook URLs take 1–2 business days to validate/approve — this is expected, not an error. Check status via `GET /notification-subscriptions/v2/webhooks/{webhookId}`.
- ✅ Digital signature key obtained self-service (no NIMB contact needed) and set as `CYBS_WEBHOOK_SECRET`.
- 🆕 **Reconciliation polling added as a backup** (`/api/reconcile`, plus a cron trigger every 5 minutes in `wrangler.toml`) — doesn't depend on the webhook being active, works today. Polls pending bookings and checks their Pay by Link status directly. **Not yet verified:** the exact `status` value CyberSource returns for a completed link (currently guessing `COMPLETED`/`PAID` — confirm against a real completed link's response and fix if wrong).
- **Next action:** wait out the webhook review window; in the meantime, rely on the reconciliation cron + manual Business Center checks.

### Module 3 — Unified Checkout (`methods/embedded/unified-checkout.js`)
**Status: ⚪ Not started.** Stub only, returns 501. Not prioritized while Pay by Link is the working path — revisit only if embedded (non-redirect) checkout becomes a priority later.

## 5. Webhook setup — remaining steps

This is the main open technical task right now.

1. **Deploy the Worker** so it has a public HTTPS URL (`wrangler deploy`). Local `wrangler dev` cannot receive webhooks — CyberSource's servers can't reach `localhost`.
2. **Create the subscription via API call** (not Business Center UI — confirmed this doesn't exist as a UI feature). Endpoint and payload shape below are taken directly from CyberSource's docs, but **test via Postman first**, the same way Microform/Pay by Link were verified, since exact request shape has varied across CyberSource's own doc examples:
   ```json
   POST https://api.cybersource.com/notification-subscriptions/v1/webhooks
   {
     "name": "Sapana Village PBL Webhook",
     "organizationId": "<your organization/merchant ID>",
     "products": [
       { "productId": "payByLink", "eventTypes": ["payByLink.merchant.payment"] }
     ],
     "webhookUrl": "https://<your-deployed-worker-url>/api/webhook/cybersource",
     "securityPolicy": { "securityType": "KEY" }
   }
   ```
3. **Get the digital signature key** — CyberSource's webhook guide says this must be explicitly requested (already included as ask #3 in the email sent to NIMB, §6).
4. Set `CYBS_WEBHOOK_SECRET` as a Worker secret once you have that key.
5. Run one real (or minimal) Pay by Link payment, then check: did `/api/webhook/cybersource` get hit? What did the payload actually look like? Update `handleWebhookEvent` in `paylink.js` if the field names differ from the current guess (`purchaseInformation.purchaseNumber`, `status`).

## 6. External dependencies / waiting on

| Item | Sent to | Status |
|---|---|---|
| REST API processing connection activation check | NIMB (email sent) | Awaiting response |
| Pay by Link REST API entitlement confirmation | NIMB (email sent) | Resolved — confirmed working via direct testing, faster than waiting for the reply |
| Webhooks entitlement + digital signature key | NIMB (email sent) | Awaiting response |
| Confirmed settlement currency | Not yet formally asked | Ask alongside the above |
| Minimum transaction amount policy | Not yet formally asked | Low priority — not blocking |

## 7. Immediate next steps (in order)

1. Deploy the Worker (`wrangler deploy`).
2. Create the webhook subscription (§5) — verify via Postman first.
3. Run one real Pay by Link payment end-to-end, confirm the Sheet updates automatically.
4. Once confirmed, this is a legitimate end-to-end working POC. Everything after this point (booking selector UI, guest-detail prefill, catalog expansion) is additive, not blocking.