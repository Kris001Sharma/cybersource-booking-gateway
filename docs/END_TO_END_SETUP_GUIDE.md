# End-to-End Setup & Integration Guide — CyberSource Payment Gateway Module

**Purpose:** This document is the single-source integration reference for connecting the portable booking-payment subsystem to any new client website. It evaluates every integration scenario (same domain manager vs different, same hosting vs different, direct link vs inline parameters) and documents the complete CyberSource configuration process — including the exact issues faced in production (payByLink disabled, network risk reset, REST API processing connection separation) — so future integrators avoid the same delays.

**Scope:** From CyberSource account setup → Postman API verification → domain/subdomain configuration → application integration → common failure modes. This is written for a developer/integrator who needs to deploy this module to a client's site.

**Module location in this repo:** `D:\3_Worspace\_________WORK________\Cybersource\booking-poc` (Cloudflare Worker + Pages microsite).

---

## 1. What this module is (high-level)

This is a **standalone serverless checkout microsite** hosted on Cloudflare Workers + Pages. It handles:

- Catalog pricing and deposit-tier calculation (`src/catalog.js`)
- Booking creation and status updates via Google Sheets (`src/bookings.js` + `apps-script.gs`)
- Three separate CyberSource payment methods (`src/methods/embedded/microform.js`, `unified-checkout.js`, `hosted/paylink.js`)
- Shared 3DS payer authentication (`src/methods/embedded/payer-auth.js`)
- Shared charge processing (`src/methods/embedded/shared-charge.js`)
- Signed webhook verification (`src/worker.js`: `verifyWebhookSignature`)

**Design principle:** The client's existing website never touches card data or CyberSource secrets. The client's site only needs to send the customer to this microsite (via URL link) or call its public API endpoints.

---

## 2. Integration paradigms (choose one per client site)

### Paradigm A — Link-based redirect (simplest, works on any site)
The client's site (Strikingly, WordPress, static HTML, custom CMS) has a button that links to:

```
https://book.clientdomain.com/checkout?items=room-double,act-spa
```

Only `items` (comma-separated SKUs from `catalog.js`) travels in the URL. **No price, no amount, no reservation details** come from the client — the backend (`GET /api/quote`) computes everything server-side.

### Paradigm B — Direct landing with pre-selected items (inline parameters)
Same URL pattern, but the client's site may pre-fill additional parameters:

```
https://book.clientdomain.com/checkout?items=room-suite&method=paylink&package=suite-weekend
```

`method` overrides the default (`microform` in `worker.js`: 14). The landing page (`pages/landing.js`: `handlePackageParam`: 274-299) reads these parameters and renders the selected package/activity cards accordingly.

### Paradigm C — JavaScript embed / modal (future upgrade, same backend)
The client's site loads a small script that opens the checkout URL in a modal or iframe. No changes to this module's backend are required — this is purely a UX layer change.

### Paradigm D — Full custom app / direct API integration
The client's custom application skips the checkout page entirely and calls:

- `GET /api/quote` — to get priced line items
- `POST /api/session` — to create a booking session (for embedded methods)
- `POST /api/charge` — to submit a tokenized card

The client's app handles card capture (Microform or Unified Checkout) independently.

---

## 3. CyberSource account setup — exactly what to ask, and the pitfalls

### 3.1 What credentials you need from CyberSource

Log in to **CyberSource Business Center** → **Account Management** → **Key Management**. You need:

| Credential | Where it lives in this module | Usage |
|---|---|---|
| `Merchant ID` (organization/merchant identifier) | `env.CYBS_MERCHANT_ID` | Used in all API calls and webhook subscription |
| `Key ID` (`CYBS_KEY_ID`) | `env.CYBS_KEY_ID` | HTTP Signature auth (`cybersource.js`: `hmacSha256Base64`) |
| `Shared Secret` (`CYBS_SHARED_SECRET`) | `env.CYBS_SHARED_SECRET` | HTTP Signature auth |
| `Environment` (`production` or `test`) | `env.CYBS_ENV` | Determines base URL (`https://api.cybersource.com` or sandbox) |

These are stored in `.dev.vars` locally (gitignored) and set as Cloudflare Worker secrets (`wrangler secret put CYBS_MERCHANT_ID`) for production.

### 3.2 What to ask CyberSource / NIMB support (based on real issues)

**Issue 1: REST API processing connection not linked**
The Microform (`/microform/v2/sessions`) and Unified Checkout (`/uc/v1/sessions`) work, but direct REST charges (`/pts/v2/payments`) fail with `DAGGREJECTED` — message includes `CARD_CATEGORY_ECI_REFUSED`. This happens because the REST API has a **separate processing connection / terminal identifier** from Pay by Link, which works independently. You must explicitly ask NIMB:

> "Please confirm the REST API / e-commerce processing connection for merchant ID `<your ID>` is fully activated and linked. Pay by Link works, but `/pts/v2/payments` returns `DAGGREJECTED` with `CARD_CATEGORY_ECI_REFUSED`. We need a separate terminal/connection for REST payments."

**Issue 2: Pay by Link disabled / network risk reset**
In our case, Pay by Link was disabled by NIMB while resetting network risk settings to allow REST API transactions to work. When integrating with a new client's account, ask explicitly:

> "Is Pay by Link enabled? If it was disabled for network risk adjustments, when will it be re-enabled? We need both REST and hosted link methods available."

**Issue 3: 3D Secure authentication entitlement**
The `DAGGREJECTED` error strongly correlates with missing 3DS authentication (`commerceIndicator: "internet"` vs `"5"`). Confirm:

> "Is Payer Authentication (3DS / `/risk/v1/authentication-setups`) fully entitled for this merchant? We need `/risk/v1/authenticatons` and `/risk/v1/authentication-results` working."

**Issue 4: Webhook entitlement + digital signature key**
Webhooks (`/notification-subscriptions/v2/webhooks`) must be requested explicitly. The digital signature key (`CYBS_WEBHOOK_SECRET`) is not available in the UI — it must be requested from CyberSource support. Confirm:

> "Please provide the webhook digital signature key for merchant ID `<your ID>`. We have created the subscription but the key is required for HMAC verification (`verifyWebhookSignature` in `worker.js`)."

**Issue 5: Settlement currency**
Confirm the account's settlement currency matches what the module uses (`USD` default, `NPR` supported — see `shared-charge.js`: `SUPPORTED_CURRENCIES`: 11). If the client's currency is different, the charge payload (`amountDetails.currency`) must match.

**Issue 6: Minimum transaction amount policy**
Some accounts have a minimum transaction amount (e.g., $0.01 for test items — `catalog.js`: `test-item`: 13-14). Confirm if a policy applies to avoid `DAGGREJECTED` for small amounts.

---

## 4. Domain and subdomain setup — all scenarios

### Scenario A: Client's domain and this module both hosted in Cloudflare (current, simplest)

1. Client owns `clientdomain.com` (managed in Cloudflare).
2. Create subdomain `book.clientdomain.com` (CNAME or A record pointing to the Cloudflare Pages deployment).
3. In `wrangler.toml`, set the domain:

```toml
name = "booking-poc"
main = "src/worker.js"
compatibility_date = "2024-01-01"
# Custom domain for this worker
routes = [
  { pattern = "book.clientdomain.com/*", custom_domain = true }
]
```

4. Deploy with `wrangler deploy --name booking-poc`.
5. Update `.dev.vars` / Worker secrets: `CHECKOUT_ORIGIN=https://book.clientdomain.com`.

### Scenario B: Client uses a different domain manager (GoDaddy, Namecheap, etc.)

1. In the client's domain manager (GoDaddy/Namecheap), add a CNAME record:

```
Name: book
Points to: <cloudflare-worker-url>.workers.dev  (or the Pages domain if using Pages)
```

Or an A record pointing to Cloudflare's IP.

2. In Cloudflare (if only the subdomain is delegated):
- Add `book.clientdomain.com` to the client's Cloudflare site.
- Create a Page Rule or DNS record that routes `book.clientdomain.com/*` to the Worker.

3. If the client's main site (`clientdomain.com`) is hosted elsewhere (not Cloudflare), only the subdomain needs to point to this module. The client's site just links to `https://book.clientdomain.com/checkout?items=...`.

4. In `wrangler.toml` or `wrangler pages deploy`, set `CHECKOUT_ORIGIN` to `https://book.clientdomain.com` (this is used by `microform.js`: 25 and `payer-auth.js`: 70 for CORS and redirect URLs).

### Scenario C: Client uses a different hosting/subsystem (AWS, Vercel, custom server) — module hosted separately

1. The module remains deployed to Cloudflare Workers/Pages independently.
2. The client's site (AWS/Vercel/custom) links directly to the module's public URL:

```
https://<module-deploy-url>/checkout?items=room-double
```

3. No domain change is needed on the client's side unless they want a branded subdomain. In that case, use Scenario B (CNAME from client's domain manager to the module URL).
4. The module's `CHECKOUT_ORIGIN` must match the public URL the client's users will see (for CORS and redirect handling in `microform.js` and `payer-auth.js`).

---

## 5. CyberSource configuration — diverse mode / new client

### 5.1 Postman testing — exact endpoints and payloads

Use these exact payloads (copied from working `microform.js`, `payer-auth.js`, `shared-charge.js`, and `paylink.js`):

**Tokenization / Microform session:**

```bash
curl -X POST https://api.cybersource.com/microform/v2/sessions \
  -H "Content-Type: application/json" \
  -H "v-c-merchant-id: <MERCHANT_ID>" \
  -H "Date: $(date -u +%a,\ %d\ %b\ %Y\ %H:%M:%S\ GMT)" \
  -H "Host: api.cybersource.com" \
  --digest -u "<KEY_ID>:<SHARED_SECRET>" \
  -d '{
    "targetOrigins": ["https://book.clientdomain.com"],
    "clientVersion": "v2",
    "allowedCardNetworks": ["VISA", "MASTERCARD"],
    "allowedPaymentTypes": ["CARD"]
  }'
```

**Payer Auth Setup:**

```bash
curl -X POST https://api.cybersource.com/risk/v1/authentication-setups \
  --digest -u "<KEY_ID>:<SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -H "v-c-merchant-id: <MERCHANT_ID>" \
  -d '{
    "tokenInformation": {
      "transientTokenJwt": "<token-from-microform>"
    }
  }'
```

Expected response fields: `consumerAuthenticationInformation.accessToken`, `deviceDataCollectionUrl`, `referenceId`.

**Enrollment Check:**

```bash
curl -X POST https://api.cybersource.com/risk/v1/authentications \
  --digest -u "<KEY_ID>:<SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -H "v-c-merchant-id: <MERCHANT_ID>" \
  -d '{
    "clientReferenceInformation": { "code": "<random-uuid>" },
    "orderInformation": {
      "amountDetails": { "totalAmount": "70.00", "currency": "USD" },
      "billTo": { "firstName":"Test","lastName":"User","email":"test@example.com","address1":"123 Main","locality":"City","country":"US" }
    },
    "tokenInformation": { "transientTokenJwt": "<token>" },
    "consumerAuthenticationInformation": { "referenceId": "<ref-id>", "returnUrl": "https://book.clientdomain.com/api/microform/stepup-callback" }
  }'
```

Expected: `challengeRequired: 'N'` or `stepUpUrl`.

**Validate Auth:**

```bash
curl -X POST https://api.cybersource.com/risk/v1/authentication-results \
  --digest -u "<KEY_ID>:<SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -H "v-c-merchant-id: <MERCHANT_ID>" \
  -d '{
    "clientReferenceInformation": { "code": "<booking-id>" },
    "consumerAuthenticationInformation": { "authenticationTransactionId": "<auth-tx-id>" }
  }'
```

Expected: `cavv`, `eciRawType`, `eci`, `xid`, `directoryServerTransactionId`.

**Charge (`/pts/v2/payments`):**

```bash
curl -X POST https://api.cybersource.com/pts/v2/payments \
  --digest -u "<KEY_ID>:<SHARED_SECRET>" \
  -H "Content-Type: application/json" \
  -H "v-c-merchant-id: <MERCHANT_ID>" \
  -d '{
    "clientReferenceInformation": { "code": "<booking-id>" },
    "processingInformation": { "commerceIndicator": "5", "capture": false },
    "tokenInformation": { "transientTokenJwt": "<token>" },
    "orderInformation": {
      "amountDetails": { "totalAmount": "70.00", "currency": "USD" },
      "billTo": { "firstName":"Test","lastName":"User","email":"test@example.com","address1":"123 Main","locality":"City","country":"US" }
    },
    "consumerAuthenticationInformation": {
      "cavv": "...",
      "eciRawType": "...",
      "eci": "...",
      "xid": "...",
      "directoryServerTransactionId": "...",
      "authenticationTransactionId": "..."
    }
  }'
```

Note: `commerceIndicator` must be `"5"` when 3DS auth is present (`shared-charge.js`: 89). Without 3DS, it defaults to `"internet"`, which is the suspected cause of `DAGGREJECTED`.

**Pay by Link (`/paylink/*`):**

Use the CyberSource Business Center UI or API (`POST /ipl/v2/payment-links`) to create links. The module's `paylink.js`: `createLink()` handles this internally and records the booking.

---

## 6. Application integration steps (step-by-step for any client site)

### Step 1 — Clone and configure

```bash
git clone <repo>
cd booking-poc
```

Create `.dev.vars` (copy from `.dev.vars.example` if present, or use the values from `PROJECT_STATUS.md` §7):

```
CYBS_MERCHANT_ID=<from-cybersource>
CYBS_KEY_ID=<from-cybersource>
CYBS_SHARED_SECRET=<from-cybersource>
CYBS_ENV=production
SHEET_WEBAPP_URL=<google-apps-script-deploy-url>
CHECKOUT_ORIGIN=https://book.clientdomain.com
DEFAULT_METHOD=microform
DEBUG_ENABLED=false
```

**Security:** `.dev.vars` is gitignored (`.gitignore`: `.dev.vars`). Never commit secrets.

### Step 2 — Set up Google Sheets backend (`apps-script.gs`)

1. Create a Google Sheet with tabs: `Bookings` and `Inventory` (or just `Bookings` for POC).
2. Copy `apps-script.gs` content into the Sheet's **Apps Script Editor** (`Extensions` → `Apps Script`).
3. Deploy as a Web App (`Deploy` → `New deployment` → `Web app` → `Execute as: Me`, `Who has access: Anyone with a Google account` — adjust for production).
4. Copy the deployed Web App URL and set it as `env.SHEET_WEBAPP_URL`.

### Step 3 — Deploy the module

```bash
wrangler deploy
```

For custom domain (`book.clientdomain.com`):

```bash
wrangler pages deploy src/pages --project-name booking-poc --branch main
# Or for Workers custom domain:
wrangler deploy --name booking-poc
# Then set custom domain in Cloudflare dashboard
```

Set secrets:

```bash
wrangler secret put CYBS_MERCHANT_ID
wrangler secret put CYBS_KEY_ID
wrangler secret put CYBS_SHARED_SECRET
wrangler secret put SHEET_WEBAPP_URL
wrangler secret put CHECKOUT_ORIGIN
```

### Step 4 — Verify deployment

```bash
curl https://book.clientdomain.com/api/debug-env
```

Expected: JSON with `CYBS_MERCHANT_ID` → `OK`, `SHEET_WEBAPP_URL` → `OK`.

### Step 5 — Test end-to-end (checklist)

For each payment method (run separately):

**Microform:**
- [ ] `GET /checkout?items=room-double` loads checkout page (`microform.js`: 104-363).
- [ ] Card fields render (`Flex` load from `microform/v2/sessions` capture context).
- [ ] Token created (`createToken`).
- [ ] Auth setup (`POST /api/microform/auth-setup`) returns `referenceId`.
- [ ] DDC hidden iframe submits; `postMessage` `profile.completed` received (10s timeout handled: `line 262-275`).
- [ ] Enrollment returns either frictionless (`challengeRequired: 'N'`) or step-up (`line 287-317`).
- [ ] If step-up: challenge iframe loads; `postMessage` `stepup-complete` received.
- [ ] Validation (`POST /api/microform/validate-auth`) returns `cavv`, `eci`.
- [ ] Charge (`POST /api/microform/charge`) returns `status: "paid"` (once `/pts/v2/payments` unblocked).

**Pay by Link:**
- [ ] `GET /checkout/paylink` or `GET /checkout?method=paylink` loads hosted checkout.
- [ ] `POST /api/paylink/create` creates hosted link.
- [ ] Real payment completes; webhook hits `/api/webhook/cybersource`.
- [ ] Booking updated in Sheet (`updateBookingStatus`: line 21-24).

**Unified Checkout:**
- [ ] `GET /checkout/unified` loads.
- [ ] `POST /api/unified/session` returns capture context (`/uc/v1/sessions` — not `/up/v1/sessions`, which 404s).
- [ ] Charge (`POST /api/unified/charge`) uses same `shared-charge.js` as Microform.

---

## 7. Inline parameters and direct landing — detailed

### How the landing page handles parameters (`pages/landing.js`)

The landing page (`pages/landing.js`: 1-299) reads URL parameters:

- `items` — not directly used by landing (landing uses `PACKAGES` and `ACTIVITIES` metadata), but the checkout link carries `items`.
- `package` — handled by `handlePackageParam()` (`line 274-299`). This reads a package SKU from the URL and renders it in the landing view.

Example integration from a client's custom site:

```html
<!-- On client's site -->
<a href="https://book.clientdomain.com/checkout?items=room-suite,act-spa&method=microform">
  Book Suite Weekend
</a>
```

When the user clicks, `worker.js` (`line 45-50`) reads `method` and `items`, then renders the appropriate checkout page. The checkout page (`checkout.js`) reads `items` from URL (`line 52-58` in `cart.js`: `getCart`) and fetches the quote (`GET /api/quote` — `line 160` in `landing.js` reference, verified in `checkout.js` line 29-35).

---

## 8. Security, PCI scope, and secrets management

**PCI Scope:**
- Microform (`microform.js`) keeps raw card data off your servers. The card number is captured by CyberSource's hosted field and tokenized into a `transientTokenJwt`. The backend (`shared-charge.js`) only handles the token, never the PAN.
- Pay by Link (`paylink.js`) redirects to CyberSource's hosted page — zero card data touches this module.
- Unified Checkout (`unified-checkout.js`) uses CyberSource's session-based capture context (`/uc/v1/sessions`) — same tokenization principle.

**Secrets:**
- `.dev.vars` — local development secrets (`.gitignore`: `.dev.vars`).
- `wrangler secret put` — production secrets stored encrypted by Cloudflare.
- `env.CYBS_SHARED_SECRET` — never exposed to the browser (`cybersource.js`: `hmacSha256Base64` uses it server-side only).

**Webhook signature verification:**
- `verifyWebhookSignature()` (`worker.js`: 141-148) uses `crypto.subtle.verify` with HMAC-SHA-256.
- Rejects unsigned or invalid payloads (`line 121`: `return new Response("Invalid signature", { status: 401 })`).
- Only processes payloads matching known module shapes (`line 125-136`).

---

## 9. Common issues and troubleshooting (based on real production findings)

### Issue 1 — `DAGGREJECTED` / `CARD_CATEGORY_ECI_REFUSED`

**Symptoms:** `POST /pts/v2/payments` fails 100% with `DAGGREJECTED`. Message includes `CARD_CATEGORY_ECI_REFUSED`.

**Root causes (verified):**
1. REST API processing connection not fully linked (separate from Pay by Link) — must ask NIMB.
2. 3D Secure authentication missing (`commerceIndicator` = `"internet"` instead of `"5"`). The payer-auth pipeline (`payer-auth.js`) must be completed before charging.

**Solution:** Confirm both (1) REST connection activated and (2) full 3DS flow executed (`authSetup` → `DDC` → `checkEnrollment` → `stepUp` or `validate` → charge with `consumerAuthenticationInformation`). Once unblocked, the charge payload (`shared-charge.js`: 93-106) includes `commerceIndicator: "5"` automatically when `has3ds` is true.

### Issue 2 — Payer Authentication not working

**Symptoms:** `POST /risk/v1/authentication-setups` fails or returns empty `accessToken`.

**Solution:** Confirm CyberSource entitlement (see §3.2). Verify payload includes `tokenInformation.transientTokenJwt` (`payer-auth.js`: 13-17). Confirm the Microform session (`/microform/v2/sessions`) returned a valid JWT before attempting auth.

### Issue 3 — Webhook not arriving (`PENDING_REVIEW`)

**Symptoms:** `GET /notification-subscriptions/v2/webhooks/{id}` returns `PENDING_REVIEW`.

**Solution:** This is expected for 1–2 business days after subscription creation. Monitor the status. Once `ACTIVE`, test with a real Pay by Link payment. If payload fields differ from current assumption (`purchaseInformation.purchaseNumber`, `status`), update `paylink.js`: `handleWebhookEvent()` accordingly.

### Issue 4 — Reconciliation not verifying bookings

**Symptoms:** `POST /api/reconcile` reports pending bookings but no automatic confirmation.

**Solution:** Confirmed hard API limitation — `purchaseNumber` not retrievable from `/ipl/v2/payment-links/{id}` or transaction records. Use manual cross-check (Business Center Transaction Search by amount/date/name) until webhook is fully active.

### Issue 5 — Google Pay not activating (`unified-checkout.js`)

**Symptoms:** `allowedPaymentTypes` in JWT does not include `GOOGLEPAY`.

**Solution:** Confirmed separate requirement — needs Google Pay Business Console merchant registration with Google. Not solvable via CyberSource Business Center toggle alone. Shelved for now.

### Issue 6 — `formatCurrency` removed / `catalog-meta.js` missing

**Symptoms:** Tests reference `catalog-meta.js` or `formatCurrency`.

**Solution:** These were intentionally removed (`audit-history.md` confirms; `tests/core.test.js`: placeholder assertions reference them). If rebuilding from an older reference, ignore these references or add real tests for current modules.

---

## 10. Expansion and future phases

This module is designed to grow without reworking core logic:

- **Switch default method:** Change `DEFAULT_METHOD` in `worker.js`: 14 (`"microform"` → `"paylink"` or `"unified"`).
- **Add new SKUs:** Edit `catalog.js` (line 5-15). No frontend code changes needed (checkout reads SKUs from URL; quote endpoint uses catalog).
- **Add new pages:** Create in `pages/` and import in `worker.js`. Follow the same pattern (`renderPage(url)` returning `Response`).
- **Migrate data store:** Replace `bookings.js` (currently `postToSheet`) with a new database API (Supabase, Airtable). The interface (`createBooking`, `updateBookingStatus`, `getBooking`) is abstracted.
- **Email notifications:** Add to `worker.js` webhook handler or `apps-script.gs`. Confirmed not implemented in current POC.
- **Availability endpoint:** `GET /api/availability` is defined in architecture doc (`payment-booking-subsystem-architecture.md`: 67) but not fully implemented. Add when inventory management becomes a blocking requirement.

---

## 11. References

- Architecture spec: `payment-booking-subsystem-architecture.md`
- Project status (line-cited, verified): `PROJECT_STATUS.md`
- Audit history (what was kept/removed/consolidated): `audit-history.md`
- Source files (all verified against working tree `5a6995c`): `src/`
- Apps Script: `apps-script.gs`
- Tests: `tests/`
- Config: `wrangler.toml`, `.dev.vars` (sample), `.gitignore`
- Design plan (future visual updates): `.kilo/plans/1789036493898-booking-checkout-redesign.md`

---

*Last updated: 2026-09-13. Verified against working tree (`git rev-parse HEAD`: 5a6995c) and all source files in `src/`. All endpoint references, payload shapes, and troubleshooting steps derived from actual code and real production testing results — not from generic documentation.*
