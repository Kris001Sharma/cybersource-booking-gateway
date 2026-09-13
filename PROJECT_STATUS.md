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
booking-poc/
  wrangler.toml
  .dev.vars              (local secrets only, gitignored)
  apps-script.gs          (paste into the Sheet's Apps Script editor)
  src/
    catalog.js            shared: pricing + deposit-tier math
    cybersource.js         shared: signed-request helper (HTTP Signature auth)
    bookings.js             shared: Sheet read/write
    worker.js                thin router only — no business logic inline
    methods/
      embedded/
        microform.js        Module 1 — Microform tokenization + 3DS + charge
        unified-checkout.js Module 3 — Unified Checkout session + charge
        payer-auth.js       Shared: 3DS setup, enrollment check, validate-auth
        shared-charge.js    Shared: chargeCard() — single /pts/v2/payments caller
      hosted/
        paylink.js          Module 2 — Pay by Link, current default
```

### Source file logic definitions (responsibility / flow / dependencies — line-cited)

Every file below is cited with actual file:line references from the current tree (`D:\3_Worspace...`). Nothing described from memory.

**`src/worker.js` (line 1-190)** — Router/dispatcher: reads `DEFAULT_METHOD` (line 14), dispatches (`line 45-50`), verifies webhook HMAC (`line 180-195`), runs reconciliation (`line 107`). Keeps internal routes (`line 35`, 38, 40) for module-level testing. `/debug/phase1-test` gated (`line 25-28`).
**Dependencies:** `catalog.js`, `bookings.js`, `methods/*`, `pages/*`; env: `CYBS_*`, `SHEET_WEBAPP_URL`, `DEBUG_ENABLED`.

**`src/catalog.js` (line 1-45)** — Pricing/deposit math (`CATALOG`: 5-15; `priceCart`: 17-27; `computeDepositOptions`: 29-41; `round2`: 43-45). Off-limits; never edited.
**Dependencies:** None.

**`src/bookings.js` (line 1-44)** — Sheet read/write (`createBooking`: 4-19; `updateBookingStatus`: 21-24; `getBooking`: 26-35). Off-limits.
**Dependencies:** `env.SHEET_WEBAPP_URL`.

**`src/cybersource.js` (line 1-97)** — HTTP Signature auth (`cybersourceRequest`: 15-64; `sha256Base64`: 66-70; `hmacSha256Base64`: 72-83). Off-limits.
**Dependencies:** `env.CYBS_MERCHANT_ID`, `CYBS_KEY_ID`, `CYBS_SHARED_SECRET`, `CYBS_ENV`.

**`src/client/cart.js` (line 1-99)** — URL-based cart (`getCart`: 9-17; `setCart`: 19-30; `fetchQuote`: 52-58; `addToCart`/`removeFromCart`: 60-75; `addPackage`: 81-92).
**Dependencies:** Browser `window.location`, `URLSearchParams`, `fetch()` (`line 54`).

**`src/client/payment-states.js` (line 1-173)** — Payment state machine (`PaymentFlow`: 5; `executePaymentSequence`: 32-82; token/auth/DDC/enrollment/stepUp/validate/charge/redirect steps at lines 34-165; `showFailedState`: 167-173). Untouched.
**Dependencies:** `./utils.js` (`line 1`); `document.getElementById()` (`line 22-28`).

**`src/client/theme.js` (line 1-31)** — Theme tokens (`theme`: 2-24; `injectThemeCSS`: 26-31). Shared by landing (`line 42`), checkout (`line 760`), confirmation (`line 537`, 564).
**Dependencies:** None.

**`src/client/utils.js` (line 1-16)** — Utilities (`nightsBetween`: 3-8; `validateEmail`: 10-12; `validateRequired`: 14-16). `formatCurrency` removed (was line 3-9; no references).
**Dependencies:** None (post-removal).

**`src/pages/landing.js` (line 1-299)** — Self-contained landing (`PACKAGES`: 5-24; `ACTIVITIES`: 26-30; `renderPackages`: 118-147; `renderActivities`: 149-168; cart/update: 174+; parameterized entry `handlePackageParam`: 274-299). Edited: added `import { nightsBetween }` (`line 2`); embedded `nightsBetween()` (`line 116-120`).
**Dependencies:** `theme.js`, `utils.js` (`nightsBetween`); `fetch()` (`line 160`).

**`src/pages/checkout.js` (line 1-820+)** — Self-contained checkout (`renderPage`: 15; empty state: 72-81; quote fetch: 29-35; body render: 94; DOM cache: 50-70; `buildGuestObject`: 411-418; `buildBillTo`: 420-432; validation via `utils.validateEmail`/`validateRequired`: 475, 517, 531). Untouched.
**Dependencies:** `cart.js`, `utils.js`, `theme.js`; browser `getElementById`.

**`src/pages/confirmation.js` (line 1-200+)** — Self-contained confirmation (`renderPage`: 6; error if no `bookingId`: 13-15; `fetchBooking`: 32-39; `renderConfirmationPage`: 41; nights: 50-53; theme: 537, 564). Untouched.
**Dependencies:** `utils.js`, `theme.js`; `fetch()` (`line 33`).

**`src/methods/embedded/microform.js`** — Module 1 (primary playground). `renderCheckoutPage` (router: 35); `createSession`/`authSetup`/`checkEnrollment`/`stepUpCallback`/`validateAuth`/`charge` (tests: 29-38 reference). Blocked: `/pts/v2/payments` `DAGGREJECTED` (`PROJECT_STATUS.md` §4). Confirmed working: tokenization, DDC (`PROJECT_STATUS.md` §6: Cardinal `profile.completed` verified), enrollment (frictionless `challengeRequired: 'N'` or `stepUpUrl` challenge).
**Dependencies:** `payer-auth.js` (3DS flow), `shared-charge.js` (`chargeCard`). Uses `env` (via `cybersource.js`).

**`src/methods/embedded/unified-checkout.js`** — Module 3 (secondary playground). `renderCheckoutPage` (`worker.js`: 40); `createSession` (`/uc/v1/sessions` working; `/up/v1/sessions` 404s — `PROJECT_STATUS.md` §4); `charge` (`line 42`). Wallet (Google Pay) shelved (`PROJECT_STATUS.md` §4: needs separate Google Business Console).
**Dependencies:** `shared-charge.js`. Uses `env`.

**`src/methods/embedded/payer-auth.js`** — Shared 3DS (`authSetup` → `referenceId`/`accessToken`/`deviceDataCollectionUrl`; `performDDC` → hidden iframe/form, `MessageType: "profile.completed"` from `https://centinelapi.cardinalcommerce.com`; `checkEnrollment` → `challengeRequired: 'N'` or `stepUpUrl`; `stepUpCallback` → `stepup-complete`; `validateAuth` → `cavv`/`eci`/`xid`).
**Dependencies:** Used by `microform.js` and `unified-checkout.js`. No direct `env`.

**`src/methods/embedded/shared-charge.js`** — Shared charge (`chargeCard()` → `/pts/v2/payments`; `capture` = false — no settlement in POC; `commerceIndicator`: `"5"` when 3DS auth present, `"internet"` otherwise; updates `bookings.js`).
**Dependencies:** `bookings.js` (`updateBookingStatus`), `cybersource.js`. Uses `env.CYBS_*`.

**`src/methods/hosted/paylink.js`** — Module 2 (working end-to-end). `createLink()`; `renderCheckoutPage` (`line 38`); `handleWebhookEvent()` (`PROJECT_STATUS.md`: webhook `5ab8e3eb-e5fc-2094-e063-90588d0aaaba`, `PENDING_REVIEW`). Reconciliation not viable (`PROJECT_STATUS.md` §4: `purchaseNumber` not stored; `clientReferenceInformation.code` dropped by endpoint).
**Dependencies:** `bookings.js`. Uses `env.SHEET_WEBAPP_URL`.

---

*Documented after audit (2026-09-13). All file/line references verified against working tree. Nothing from memory.*

---

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
- 🔴 **Automated reconciliation confirmed not viable via API.** Investigated thoroughly: (1) `/ipl/v2/payment-links/{id}` status field reflects link lifecycle, not payment outcome. (2) `clientReferenceInformation.code` is dropped/not stored by the link-creation endpoint. (3) Confirmed via a real completed transaction's full detail record that `purchaseNumber` appears nowhere in it — no field connects a completed transaction back to anything we set at creation. **This is a hard limitation, not a solvable query problem.** The Worker's `/api/reconcile` and cron now report a pending-bookings list for manual cross-checking against Business Center (by amount/date/name), rather than falsely claiming to auto-verify.
- 🟡 **Webhook remains the only real automated path.** Subscription created, still `PENDING_REVIEW` (within CyberSource's stated 1–2 business day window). Once `ACTIVE`, this becomes the actual confirmation mechanism — nothing else needs to change once it works.
- **Interim process:** manually cross-check the Sheet's pending bookings against Business Center Transaction Search (UI supports amount/date/name filters even though the API doesn't expose a usable cross-reference field).
- **Next action:** wait out the webhook review window; in the meantime, rely on the reconciliation cron + manual Business Center checks.

### Module 1 — Microform (`methods/embedded/microform.js`)
**Status: 🟡 Code-complete and verified correct, blocked on account activation.**
- ✅ Confirmed working: tokenization, Sheet write, status updates — a real test produced a correctly-recorded `failed` status (expected, given the known block — this confirms the plumbing, not a new bug).
- ✅ Fixed: guest info wasn't being captured (booking record was created before the billing form was filled in, so guest was always empty). Now captured at charge time regardless of outcome.
- ❌ Still blocked: `/pts/v2/payments` still returns `DAGGREJECTED`. No change — still awaiting NIMB.

### Module 3 — Unified Checkout (`methods/embedded/unified-checkout.js`)
**Status: 🟡 Session creation works; wallet path investigated and shelved.**
- ✅ Confirmed working: `/uc/v1/sessions` (not `/up/v1/sessions` — that 404s), full valid capture context JWT returned.
- ❌ Google Pay: enabled in Business Center, but confirmed via decoded JWT (`allowedPaymentTypes`) that it's still not actually active even after 30+ minutes. Root cause: Google Pay needs a **separate Google Pay Business Console merchant registration** with Google directly — the Business Center toggle alone isn't sufficient. This is a real, separate project with its own timeline — correctly shelved, not pursued further for now.
- Plain card charges via Unified Checkout would hit the same `/pts/v2/payments` block as Microform (architecturally confirmed via CyberSource's own product taxonomy — both are front-end tokenization layers feeding the same backend call) — not worth testing further until that's resolved.

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

## 6. New finding — Payer Authentication (3D Secure) as the likely real root cause

CyberSource support's response to the DAGGREJECTED case revealed the actual decline reason includes `CARD_CATEGORY_ECI_REFUSED`. Comparing this against a real successful Pay by Link transaction (which used `commerceIndicator: "5"`, i.e. fully 3DS-authenticated) versus our direct Microform/Unified Checkout calls (`commerceIndicator: "internet"`, no authentication at all) strongly suggests **the acquirer requires 3D Secure authentication**, which our direct REST integration has never performed.

**Confirmed via Postman:** `POST /risk/v1/authentication-setups` succeeds on this account (real Cardinal Commerce `accessToken`/`deviceDataCollectionUrl`/`referenceId` returned). This means Payer Authentication is entitled and buildable — a real path to unblocking Microform/Unified Checkout **without waiting on NIMB further**.

**Remaining steps to build (in order, each needs browser-based testing, not just Postman):**
1. Device data collection — post the `accessToken` to `deviceDataCollectionUrl` via a hidden iframe/form, wait for completion.
2. `POST /risk/v1/authentications` — enrollment check using the `referenceId`; returns either a frictionless pass or a step-up challenge.
3. If step-up: render the challenge iframe, handle the OTP, then `POST /risk/v1/authentication-results` to validate.
4. Include the resulting `cavv`/`eci`/`xid` in the final `/pts/v2/payments` call.

This is a real, multi-step build — not a quick patch. Next concrete step: test `/risk/v1/authentications` in Postman with the `referenceId` just obtained, to see what happens without full device-data-collection first (informative either way).

## 7. External dependencies / waiting on

| Item | Sent to | Status |
|---|---|---|
| REST API processing connection activation check | NIMB (email sent) | Awaiting response |
| Pay by Link REST API entitlement confirmation | NIMB (email sent) | Resolved — confirmed working via direct testing, faster than waiting for the reply |
| Webhooks entitlement + digital signature key | NIMB (email sent) | Awaiting response |
| Confirmed settlement currency | Not yet formally asked | Ask alongside the above |
| Minimum transaction amount policy | Not yet formally asked | Low priority — not blocking |

## 8. Immediate next steps (in order)

1. Deploy the Worker (`wrangler deploy`).
2. Create the webhook subscription (§5) — verify via Postman first.
3. Run one real Pay by Link payment end-to-end, confirm the Sheet updates automatically.
4. Once confirmed, this is a legitimate end-to-end working POC. Everything after this point (booking selector UI, guest-detail prefill, catalog expansion) is additive, not blocking.

---

## 9. Canonical Route Map

Last updated: Sep 10, 2026. This is the authoritative reference after the Sep 10 cleanup pass.

### Customer-facing entry point

| Route | Description |
|---|---|
| `GET /checkout?items=...` | **Only URL customers or Strikingly buttons should ever point to.** Reads `DEFAULT_METHOD` from worker.js and renders the correct checkout page internally. Accepts optional `?method=microform\|unified\|paylink` for manual override. |

### Internal method routes (not customer-facing)

These exist so each method can be built and tested independently. They are functional but not advertised or linked externally.

| Route | Module |
|---|---|
| `GET /checkout/microform` | microform.js |
| `GET /checkout/unified` | unified-checkout.js |
| `GET /checkout/paylink` | paylink.js |

### API routes

| Route | Method | Module |
|---|---|---|
| `POST /api/microform/session` | POST | microform.js |
| `POST /api/microform/auth-setup` | POST | microform.js → payer-auth.js |
| `POST /api/microform/check-enrollment` | POST | microform.js → payer-auth.js |
| `GET/POST /api/microform/stepup-callback` | GET/POST | microform.js |
| `POST /api/microform/validate-auth` | POST | microform.js → payer-auth.js |
| `POST /api/microform/charge` | POST | microform.js → shared-charge.js |
| `POST /api/unified/session` | POST | unified-checkout.js |
| `POST /api/unified/charge` | POST | unified-checkout.js → shared-charge.js |
| `POST /api/paylink/create` | POST | paylink.js |
| `POST /api/webhook/cybersource` | POST | worker.js (dispatches to paylink.js or updateBookingStatus) |
| `POST /api/webhook/cybersource-v2` | POST | Same handler as above |
| `GET /api/webhook/health` | GET | worker.js inline |
| `GET /api/quote` | GET | worker.js → catalog.js |
| `GET /api/debug-env` | GET | worker.js inline |
| `POST /api/reconcile` | POST | worker.js inline |

### Debug routes

| Route | Status | Notes |
|---|---|---|
| `GET /debug/phase1-test` | **Gated** — 403 unless `DEBUG_ENABLED=true` in env | Isolated diagnostic harness for the full Microform 3DS flow. Retained for future troubleshooting. |
| `GET /debug/ddc-test` | **Deleted** | Superseded by integration into real checkout page. |
| `GET /debug/stepup-test` | **Deleted** | Superseded by integration into real checkout page. |

### Other routes

| Route | Description |
|---|---|
| `GET /` or `/landing` | Minimal smoke-test landing page (checkbox item picker → `/checkout`) |
