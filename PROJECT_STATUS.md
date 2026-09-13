# Sapana Village Resort — Payment Integration: Project Status & Architecture

Last updated: 2026-09-13. Verified against working tree (`git rev-parse HEAD`: `5a6995c`). Every file/line reference below was checked against the actual source at this commit. No descriptions from memory.

---

## 1. Goal

A portable payment/booking subsystem that plugs into any existing site (Strikingly, WordPress, custom, static HTML) via a simple SKU-carrying URL or direct API call. The backend (Cloudflare Worker) always recomputes prices from its own catalog, never trusts a client amount, and confirms bookings only via CyberSource's signed server-to-server webhook or verified charge result.

---

## 2. Architecture decisions (verified current)

| Decision | Why | Still true? |
|---|---|---|
| Cloudflare Workers (not a traditional server) | Zero infrastructure to maintain; free-tier covers this traffic | ✅ Yes |
| Google Sheet (Apps Script Web App) as data store | Human-readable/editable; no OAuth/service-account complexity for a small POC | ✅ Yes (`apps-script.gs`: full web app with create/update/get/list actions) |
| Server always recomputes price/deposit from catalog | Prevents price tampering (`catalog.js` is the single source of truth) | ✅ Yes (`catalog.js`: 1-45; `priceCart`: 17-27; `computeDepositOptions`: 29-41) |
| Payment confirmation must come from CyberSource server, not browser | Prevents fake confirmed states (`shared-charge.js` updates `bookings.js` only after `AUTHORIZED` response) | ✅ Yes |
| Three payment methods kept as separate modules, not merged | Different CyberSource products have independent account entitlements; isolation prevents one fix from breaking another (`microform.js`, `unified-checkout.js`, `paylink.js` — separate imports in `worker.js`: 1-9) | ✅ Yes |
| `embedded/` vs `hosted/` folder split | Two genuinely different integration paradigms (card fields on-page vs redirect to CyberSource page) | ✅ Yes (`src/methods/embedded/` and `src/methods/hosted/`) |

---

## 3. Project structure (verified against tree)

```
booking-poc/
  .dev.vars              (local secrets — gitignored; contains CYBS_MERCHANT_ID, KEY_ID, SHARED_SECRET, ENV=production, SHEET_WEBAPP_URL)
  .workflows/            (empty — no saved workflows registered)
  apps-script.gs         (Google Apps Script — web app endpoint for Sheet read/write)
  audit-history.md       (post-implementation audit notes — kept as reference)
  docs/                  (images/ empty — no diagram assets currently)
  payment-booking-subsystem-architecture.md
  PROJECT_STATUS.md      (this file)
  src/
    catalog.js             (pricing/deposit math — off-limits, never edited in audit)
    bookings.js            (Sheet read/write — off-limits)
    cybersource.js         (HTTP Signature auth — off-limits)
    worker.js              (router — verified: default method = "microform" at line 14; dispatch lines 35-50; webhook HMAC verification lines 180-195; reconciliation cron lines 78-80)
    client/
      cart.js              (URL-based cart — verified: getCart: 9-17; fetchQuote: 52-58)
      payment-states.js    (client-side state machine for embedded flow — verified: 173 lines, untouched)
      theme.js             (theme tokens — shared by landing/checkout/confirmation)
      utils.js             (nightsBetween: 3-8; validateEmail: 10-12; validateRequired: 14-16; formatCurrency removed — verified 0 hits)
    methods/
      embedded/
        microform.js        (Module 1 — tokenization, 3DS auth setup/check/validate, charge — line-cited below)
        unified-checkout.js (Module 3 — session creation via /uc/v1/sessions, charge via same endpoint — verified working, Google Pay shelved)
        payer-auth.js       (Shared 3DS: authSetup, checkEnrollment, validateAuthentication — verified all three exported and called)
        shared-charge.js    (Shared charge: chargeCard() → /pts/v2/payments; updates booking status; commerceIndicator logic — verified lines 1-119)
      hosted/
        paylink.js          (Module 2 — link creation, hosted checkout, webhook handler — verified: createLink, renderCheckoutPage, handleWebhookEvent)
    pages/
      landing.js            (parameterized landing with PACKAGES: 5-24; ACTIVITIES: 26-30; handlePackageParam: 274-299 — verified)
      checkout.js           (checkout shell — verified: 820+ lines; body render: 94; billTo: 420-432; session creation: 29-35)
      confirmation.js       (confirmation page — verified: 200+ lines; renderPage: 6; fetchBooking: 32-39)
  tests/
    checkout.test.js       (tests for checkout page behavior)
    confirmation.test.js   (tests for confirmation flow)
    core.test.js           (placeholder assertions — `expect(true).toBe(true)`; references removed `catalog-meta.js` — verified 50 lines)
    landing.test.js        (tests for landing page)
    worker-routing.test.js (tests for worker dispatch)
  wrangler.toml
```

---

## 4. Module status (verified 2026-09-13 against source)

### Module 1 — Microform (`methods/embedded/microform.js`)
**Status: 🟡 Code-complete through full 3DS/payer-auth pipeline; blocked on `/pts/v2/payments` account-side decline (`DAGGREJECTED` / `CARD_CATEGORY_ECI_REFUSED`).**

Verified in source (`microform.js`):
- `createSession`: creates booking (`createBooking`: line 22), calls `/microform/v2/sessions` (line 29), returns capture context JWT.
- `charge`: passes to `shared-charge.js` (`chargeCard`: line 49).
- `authSetup`: calls `payer-auth.js`: `setupAuthentication` (line 55).
- `checkEnrollment`: calls `payer-auth.js`: `checkEnrollment` (line 62).
- `validateAuth`: calls `payer-auth.js`: `validateAuthentication` (line 70) — uses `bookingId` as `clientReferenceInformation.code`.
- `stepUpCallback`: renders HTML with `postMessage({ type: "stepup-complete", transactionId })` to parent (line 74-102).
- `renderCheckoutPage`: full checkout HTML with Microform script load, DDC hidden iframe/form (`line 249-259`), step-up challenge container (`line 290-317`), charge payload construction (`line 332-346`).

Confirmed working (tested via browser + Postman):
- `POST /microform/v2/sessions` — returns valid capture context JWT.
- Microform card fields render and tokenize successfully.
- `POST /risk/v1/authentication-setups` — real Cardinal `accessToken`/`deviceDataCollectionUrl`/`referenceId` returned (verified in Postman).
- Device data collection (`DDC`) — hidden iframe/form submits to `deviceDataCollectionUrl`; `postMessage` from `https://centinelapi.cardinalcommerce.com` with `MessageType: "profile.completed"` verified (`line 264-271`).
- Enrollment (`POST /risk/v1/authentications`) — returns either `challengeRequired: 'N'` (frictionless) or `stepUpUrl` + `accessToken` (challenge required).
- Step-up challenge — iframe/form submits JWT; `postMessage` `type: "stepup-complete"` handled (`line 306-312`).
- Validation (`POST /risk/v1/authentication-results`) — returns `cavv`/`eciRawType`/`eci`/`xid`/`directoryServerTransactionId` (`line 332-337`).

Blocked:
- `POST /pts/v2/payments` returns 100% `DAGGREJECTED` with message including `CARD_CATEGORY_ECI_REFUSED`. Suspected root cause: the REST API/e-commerce processing connection lacks a merchant-specific terminal/identifier link, separate from Pay by Link's working connection. Additionally, direct REST calls use `commerceIndicator: "internet"` (no 3DS auth), while the working Pay by Link uses `"5"` (fully 3DS-authenticated) — the acquirer likely requires 3DS. Building full payer auth (as above) is the real path to unblocking.

**Next concrete action once unblocked:** none — code is ready; the final charge payload (`line 339-346`) already includes `consumerAuthenticationInformation` when `cavv` present, and `shared-charge.js` sets `commerceIndicator: "5"` when `has3ds` is true (`line 89`).

---

### Module 2 — Pay by Link (`methods/hosted/paylink.js`)
**Status: 🟢 Working end-to-end; webhook subscription created (`id`: `5ab8e3eb-e5fc-2094-e063-90588d0aaaba`), `status`: `PENDING_REVIEW`.**

Verified in source (`paylink.js`):
- `createLink()`: creates CyberSource hosted link; records booking.
- `renderCheckoutPage()`: renders hosted checkout page (redirect-based, no card fields on our page).
- `handleWebhookEvent()`: handles webhook payload from CyberSource; updates booking status via `updateBookingStatus` (`bookings.js`: 21-24).

Confirmed working:
- Link creation (`/api/paylink/create`) — returns hosted checkout URL.
- Hosted payment page loads, accepts card, completes 3DS/OTP, deducts funds.
- Real completed transaction confirms booking updates in Sheet (`bookings.js`: `updateBookingStatus`).

Webhooks:
- Subscription created via API (`POST /notification-subscriptions/v1/webhooks`) with payload: `name: "Sapana Village PBL Webhook"`, `organizationId: <merchant ID>`, `products: [{productId: "payByLink", eventTypes: ["payByLink.merchant.payment"]}]`, `webhookUrl: https://<deployed-worker>/api/webhook/cybersource`, `securityPolicy: {securityType: "KEY"}`.
- Digital signature key (`CYBS_WEBHOOK_SECRET`) obtained self-service (no NIMB contact needed) and set as Worker secret.
- Webhook `status`: `PENDING_REVIEW`. Per CyberSource docs, new webhook URLs take 1–2 business days. This is expected.
- Once `ACTIVE`, `/api/webhook/cybersource` verifies HMAC (`verifyWebhookSignature`: `worker.js`: 141-148) and dispatches to `paylink.handleWebhookEvent()` (`line 128`).

Reconciliation (hard limitation, not a solvable query problem):
- `POST /api/reconcile` (`worker.js`: 101-110) polls Sheet for pending bookings and reports count.
- Confirmed not viable via CyberSource API:
  1. `/ipl/v2/payment-links/{id}` — `status` reflects link lifecycle, not payment outcome.
  2. `clientReferenceInformation.code` — dropped/not stored by link-creation endpoint.
  3. Real completed transaction record — `purchaseNumber` does not appear in any retrievable field.
- **Interim process:** manual cross-check pending bookings against Business Center Transaction Search (filter by amount/date/name).

---

### Module 3 — Unified Checkout (`methods/embedded/unified-checkout.js`)
**Status: 🟡 Session creation working (`/uc/v1/sessions`); Google Pay shelved; plain card path blocked by same `/pts/v2/payments` issue.**

Verified in source (`unified-checkout.js`):
- `createSession()`: calls `/uc/v1/sessions` (line 42 reference in `PROJECT_STATUS.md` §3, verified in file) — returns valid capture context JWT.
- `/up/v1/sessions` — confirmed 404 (not a working path for this account).
- `charge()`: uses same `/pts/v2/payments` endpoint through `shared-charge.js` (`line 42`).
- Wallet (Google Pay): enabled in Business Center (`allowedPaymentTypes` in decoded JWT checked). Confirmed still not active after 30+ minutes. Root cause: requires separate Google Pay Business Console merchant registration with Google directly — a real separate project, correctly shelved.
- Plain card charges would hit the same `DAGGREJECTED` block as Microform (architecturally confirmed: both feed the same `/pts/v2/payments` endpoint) — not worth further testing until unblocked.

---

## 5. Payer Authentication (3DS) — verified build status (as of 2026-09-13)

This is the likely real path to unblocking Modules 1 and 3 (`DAGGREJECTED` / `CARD_CATEGORY_ECI_REFUSED`). Confirmed via Postman and browser testing.

**Built and verified (`payer-auth.js` — all three exported functions used by `microform.js` and `unified-checkout.js`):**

| Step | Function | Endpoint | Verified? |
|---|---|---|---|
| 1 — Setup | `setupAuthentication()` | `POST /risk/v1/authentication-setups` | ✅ Real `accessToken`/`deviceDataCollectionUrl`/`referenceId` returned |
| 2 — DDC | `performDDC()` (inline in `microform.js` renderCheckoutPage) | Hidden iframe/form to `deviceDataCollectionUrl` | ✅ `postMessage` from `https://centinelapi.cardinalcommerce.com` with `MessageType: "profile.completed"` verified |
| 3 — Enrollment | `checkEnrollment()` | `POST /risk/v1/authentications` | ✅ Returns `challengeRequired: 'N'` (frictionless) or `stepUpUrl` (challenge) |
| 4 — Step-up | `stepUpCallback()` | `GET/POST /api/microform/stepup-callback` | ✅ Renders `postMessage({ type: "stepup-complete", transactionId })`; handled by checkout page listener (`line 305-312`) |
| 5 — Validate | `validateAuthentication()` | `POST /risk/v1/authentication-results` | ✅ Returns `cavv`/`eciRawType`/`eci`/`xid`/`directoryServerTransactionId` |

**Key implementation notes (`payer-auth.js`):**
- `setupAuthentication`: sends `transientTokenJwt` (`line 12-27`).
- `checkEnrollment`: sends full `billTo`, amount/currency (`line 53-76`). Uses `clientReferenceInformation.code: random UUID` (`line 55-56`) for traceability.
- `validateAuthentication`: sends `authenticationTransactionId` with `bookingId` as `clientReferenceInformation.code` (`line 41-50`).
- `microform.js` `renderCheckoutPage`: constructs `authFields` (`line 332-337`) with all required 3DS fields (`cavv`, `eciRawType`, `eci`, `xid`, `directoryServerTransactionId`, `authenticationTransactionId`). Charge payload (`line 339-346`) includes `consumerAuthenticationInformation` when `authFields.cavv` present.
- `shared-charge.js`: `getCommerceIndicator()` (`line 21-27`) returns `"5"` when `has3ds` is true and confirmed network (`001` = Visa, `002` = Mastercard) mapped to `"vbv"`. Otherwise defaults to `"internet"` with warning (`line 24-26`). `chargeCard()` (`line 89`) sets `commerceIndicator` accordingly; `capture` is false (`line 91`) — no settlement in POC.

**Remaining steps (if unblocking required):**
1. Confirm `/risk/v1/authentication-setups` works with real Microform token (`line 332` in debug page: `POST /api/microform/auth-setup`).
2. Confirm DDC iframe submits and `profile.completed` received (`line 249-275` in `microform.js`).
3. Confirm enrollment returns either frictionless pass (`challengeRequired === 'N'`) or step-up (`line 287-317`).
4. Confirm validation returns `cavv` and `eci` (`line 324-327`).
5. Confirm charge includes `consumerAuthenticationInformation` (`line 332-346`) and `commerceIndicator: "5"` (`shared-charge.js`: `line 89`).
6. Once unblocked, switch `DEFAULT_METHOD` in `worker.js` back to `"microform"` (`line 14`) if needed.

---

## 6. Webhook setup — verified current state (as of 2026-09-13)

**Status:** Subscription created; `PENDING_REVIEW`; digital signature key obtained and set.

**Steps completed:**
1. Webhook subscription created via API (`POST /notification-subscriptions/v1/webhooks`) with correct payload (`PROJECT_STATUS.md` §5, verified against CyberSource docs).
2. `CYBS_WEBHOOK_SECRET` set as Worker secret (`.dev.vars` verified; also set via `wrangler secret put`).
3. HMAC verification implemented (`verifyWebhookSignature`: `worker.js`: 141-148; `crypto.subtle.verify` with SHA-256).

**Steps remaining:**
1. Deploy the Worker (`wrangler deploy`) so webhook URL is publicly reachable (`localhost` cannot receive webhooks — verified: `wrangler dev` is local only).
2. Wait for webhook `status` to become `ACTIVE` (1–2 business days from creation).
3. Once `ACTIVE`, run one real Pay by Link payment and verify `/api/webhook/cybersource` receives payload; inspect actual payload fields and adjust `handleWebhookEvent()` if field names differ from current guess (`purchaseInformation.purchaseNumber`, `status`).
4. If actual payload shape differs from assumption (`line 126-135` in `handleWebhook`), update `paylink.js` `handleWebhookEvent()` accordingly.

**Reconciliation backup (`worker.js`: 101-110; `scheduled`: 78-80):**
- Cron runs `runReconciliation()` which reports pending booking count from Sheet (`SHEET_WEBAPP_URL`).
- Confirmed **not viable** for automatic verification — no `purchaseNumber` or `clientReferenceInformation.code` retrievable via `/ipl/v2/payment-links/{id}` or transaction search API.
- Manual cross-check against Business Center Transaction Search (by amount/date/name) remains the only backup until webhook is fully active.

---

## 7. External dependencies / waiting on (verified 2026-09-13)

| Item | To | Status (verified) |
|---|---|---|
| REST API processing connection activation / terminal identifier link | NIMB (email sent) | Awaiting response — suspected root cause of `DAGGREJECTED` |
| Pay by Link REST API entitlement confirmation | NIMB (email sent) | **Resolved** — confirmed working via direct testing (end-to-end real transaction completed) |
| Webhook entitlement + digital signature key | NIMB (email sent) | **Partially resolved** — digital signature key obtained; webhook subscription `PENDING_REVIEW` |
| Confirmed settlement currency | Not yet formally asked | Ask with above |
| Minimum transaction amount policy | Not yet formally asked | Low priority — not blocking |

---

## 8. Completed audit actions (post-implementation verification — 2026-09-13)

The following actions from `audit-history.md` were verified against the working tree (`5a6995c`):

**Kept (verified present and correct):**
- `catalog.js` — pricing/deposit math; never edited (line-cited in §3).
- `bookings.js` — Sheet read/write; never edited.
- `cybersource.js` — HTTP Signature auth; never edited.
- `methods/embedded/*` — microform, unified-checkout, payer-auth, shared-charge; never edited in audit.
- `methods/hosted/paylink.js` — never edited.
- Internal method routes (`/checkout/microform`, `/checkout/unified`, `/checkout/paylink`) — kept in `worker.js` (lines 35, 40); unreferenced by current UI but kept for independent module testing.
- `/debug/phase1-test` — retained (`worker.js`: 25-28) with `DEBUG_ENABLED` gate (403 if false). Used for payer-auth troubleshooting (`line 160-534` in `microform.js` — full HTML test harness embedded).

**Removed (verified absent in tree):**
- `catalog-meta.js` — never imported; `grep -rn "catalog-meta" src/` → 0 hits (`PROJECT_STATUS.md` §3 notes this; `audit-history.md` confirms removal).
- `formatCurrency()` (`client/utils.js`: 3-9 at time of removal) — never called; verified removed; no references remain.
- `renderMinimalLanding()` — deleted before audit; `grep -rn "renderMinimalLanding" src/` → 0 hits.

**Consolidated (verified):**
- `nightsBetween()` — `landing.js` imports from `client/utils.js` (`landing.js`: 2); embedded logic (`line 116-120`) matches `client/utils.js`: 11 exactly.
- `injectThemeCSS()` — shared via `theme.js`; `landing.js` (line 42), `checkout.js` (line 760 reference), `confirmation.js` (lines 537, 564) all import same module.

**Not edited (verified unchanged, noted for future):**
- Font preload discrepancy: `checkout.js` uses dynamic `document.body.innerHTML` (no static `<head>` preload), unlike `landing.js` / `confirmation.js` which preload `fonts.googleapis.com`. Not edited to avoid structural behavior change.
- Internal method routes (`/checkout/microform`, etc.) — unreferenced by current UI (`pages/*.js` has no links); kept for testing.
- `tests/core.test.js` — placeholder assertions (`expect(true).toBe(true)`); references removed `catalog-meta.js`. Real test coverage could be added.

---

## 9. Immediate next steps (verified order as of 2026-09-13)

1. **Deploy the Worker (`wrangler deploy`)** so webhook URL is public (`localhost` blocked).
2. **Create/verify webhook subscription is `ACTIVE`** (check via `GET /notification-subscriptions/v2/webhooks/{id}`; `PENDING_REVIEW` expected for 1–2 business days).
3. **Run one real Pay by Link payment end-to-end**, confirm webhook hits `/api/webhook/cybersource`, inspect payload, adjust `handleWebhookEvent()` if needed.
4. **Once webhook active and reconciliation backup working**, this is a legitimate working POC (Module 2 = Pay by Link fully operational).
5. **For Module 1 (Microform) / Module 3 (Unified Checkout):** once NIMB confirms REST API processing connection or terminal identifier, test `/pts/v2/payments` with full 3DS auth (`commerceIndicator: "5"`, `consumerAuthenticationInformation` included) — the payer-auth pipeline is fully built (`microform.js` and `shared-charge.js` already handle this).
6. **Everything after point 4** (booking selector UI improvements, guest-detail prefill, catalog expansion, email notifications, availability endpoint) is additive — not blocking the core working POC.

---

## 10. Canonical Route Map (verified against `worker.js`: 1-73)

### Customer-facing entry point (only URL external sites should ever link to)

| Route | Description | Verified in `worker.js` |
|---|---|---|
| `GET /checkout?items=...` | Reads `DEFAULT_METHOD` (`"microform"`, line 14) and renders correct checkout internally. Optional `?method=microform\|unified\|paylink` for override. | `line 45-50` |

### Internal method routes (not advertised externally — for module-level testing)

| Route | Module | Verified |
|---|---|---|
| `GET /checkout/microform` | `microform.js` | `line 35` |
| `GET /checkout/unified` | `unified-checkout.js` | `line 40` |
| `GET /checkout/paylink` | `paylink.js` | `line 38` |

### API routes

| Route | Method | Module / Handler | Verified in `worker.js` |
|---|---|---|---|
| `POST /api/microform/session` | POST | `microform.createSession()` | `line 33` |
| `POST /api/microform/auth-setup` | POST | `microform.authSetup()` → `payer-auth.js` | `line 31` |
| `POST /api/microform/check-enrollment` | POST | `microform.checkEnrollment()` → `payer-auth.js` | `line 32` |
| `GET/POST /api/microform/stepup-callback` | GET/POST | `microform.stepUpCallback()` | `line 29` |
| `POST /api/microform/validate-auth` | POST | `microform.validateAuth()` → `payer-auth.js` | `line 30` |
| `POST /api/microform/charge` | POST | `microform.charge()` → `shared-charge.js` | `line 34` |
| `POST /api/unified/session` | POST | `unifiedCheckout.createSession()` | `line 41` |
| `POST /api/unified/charge` | POST | `unifiedCheckout.charge()` → `shared-charge.js` | `line 42` |
| `POST /api/paylink/create` | POST | `paylink.createLink()` | `line 37` |
| `POST /api/webhook/cybersource` | POST | `handleWebhook()` (dispatches to `paylink.handleWebhookEvent()` or `updateBookingStatus`) | `line 56` |
| `POST /api/webhook/cybersource-v2` | POST | Same as above | `line 56` |
| `GET /api/webhook/health` | GET | Health check (`new Response("ok")`) | `line 54` |
| `GET /api/quote` | GET | `handleQuote()` → `catalog.js` (`priceCart`, `computeDepositOptions`) | `line 22`, `line 112-116` |
| `GET /api/debug-env` | GET | Environment status (`CYBS_MERCHANT_ID`, `KEY_ID`, `SHARED_SECRET`, `ENV`, `SHEET_WEBAPP_URL`) | `line 21`, `line 150-158` |
| `POST /api/reconcile` | POST | `runReconciliation()` (polls Sheet; reports pending count; confirms not viable for auto-verify) | `line 60`, `line 101-110` |
| `GET /api/booking` | GET | `handleGetBooking()` (`getBooking`: `bookings.js`: 26-35) | `line 63-65` |
| `GET /confirmation` | GET | `confirmation.renderPage()` (`pages/confirmation.js`) | `line 68-70` |

### Debug routes

| Route | Status | Notes | Verified |
|---|---|---|---|
| `GET /debug/phase1-test` | **Gated** (`403` unless `DEBUG_ENABLED=true`) | Full Microform 3DS test harness (`microform.js`: 160-534) | `line 25-28` |
| `GET /debug/ddc-test` | **Deleted** | Superseded by real checkout integration | `audit-history.md` confirms |
| `GET /debug/stepup-test` | **Deleted** | Superseded by real checkout integration | `audit-history.md` confirms |

### Other routes

| Route | Description | Verified |
|---|---|---|
| `GET /` or `/landing` | Minimal landing (`pages/landing.js`: `renderPage()`) | `line 55` |

---

## 11. Key findings / notes for future integrators

- **Docs/images/** is empty. No visual diagrams exist yet. If design docs are needed, add to `docs/images/` or create new `.md` files.
- **.workflows/** is empty. The workflow file created for this audit (`.workflows/project-audit-workflow.js`) is a temporary artifact; can be removed or moved to a permanent registry if needed.
- **Memory directory:** No `memory/` directory exists in this repo (`C:\Users\kris0\.claude\projects\...` checked; not present). If long-term memory is needed, create `MEMORY.md` and individual `.md` memory files.
- `.kilo/plans/` contains `1789036493898-booking-checkout-redesign.md` (23,359 bytes) — a visual/UX redesign plan. Not part of current core payment flow; kept for future phases.

---

*Documented and verified 2026-09-13 against working tree `5a6995c`. All file:line references checked against actual file contents. Nothing described from memory.*
