# Portable Payment & Booking Subsystem — Architecture Spec

**Goal:** One small, secure, self-contained service that handles "customer picks room + activities → pays a deposit or full amount via CyberSource → booking is confirmed only after verified payment." It should plug into *any* front end — a static Strikingly page today, WordPress or a custom app tomorrow — with minimal or zero changes on the front-end side.

---

## 1. Design principles

1. **One integration point, many front doors.** The subsystem is a standalone hosted service (its own subdomain). Any site — static or dynamic — talks to it the same way: a link, a form post, or an API call. Nothing CyberSource-specific ever lives on the front-end site itself.
2. **Never trust the client for money.** Prices, totals, and deposit amounts are always recalculated server-side from a catalog you control. The browser only ever *suggests* a cart; the backend decides the amount that actually gets charged.
3. **Payment confirmation is server-to-server, not client-reported.** A "thank you, payment received" message in the browser is never what confirms a booking. Only a signed webhook (or a verified poll of CyberSource's API) confirms it.
4. **No booking is confirmed before payment is confirmed.** Bookings start as `pending` and are held for a short window (e.g. 15 minutes) to prevent double-booking while the customer pays. If payment doesn't land in time, the hold releases automatically.
5. **Minimal moving parts.** No framework you have to babysit, no database server to patch. Managed, free-tier-friendly services throughout.

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Checkout front end | Static HTML/JS page (or a tiny React app), hosted on **Cloudflare Pages** or **Netlify/Vercel** | No server needed for the UI itself; deploys in seconds; free tier is plenty for this traffic level |
| Backend logic | **Cloudflare Workers** (or Vercel/Netlify serverless functions — pick one, don't mix) | Serverless = no servers to patch or scale; a handful of small functions is all you need |
| Payment processing | **CyberSource REST API + Microform** | Microform keeps raw card data off your servers (lower PCI scope); REST API gives you full control to attach your own booking reference and compute amounts server-side |
| Data store | **Google Sheets (via Sheets API)** to start; migrate to **Airtable** or a small Postgres (e.g. Supabase) only if volume grows | You explicitly want something simple to inspect/maintain; Sheets API lets you read/write programmatically while still being human-editable |
| Notifications | **Gmail API / SMTP via the Worker**, or a simple **Google Apps Script** trigger watching the Sheet | Confirmation emails without adding another paid service |
| Domain | `book.yourresort.com` (subdomain), pointed at Cloudflare Pages | Keeps this fully decoupled from Strikingly (or whatever the main site is) |

This whole stack has **no ongoing hosting cost** at your scale (free tiers cover it) and **no server to maintain** — everything is managed infrastructure.

---

## 3. How it plugs into any front end (the "link carries the cart" pattern)

This is the key to portability, and it directly answers your Strikingly question.

- Every bookable thing (a room type, an activity) has a stable **SKU** in your catalog (e.g. `room-double`, `act-hike`, `act-spa`).
- On any site — no matter how limited — you only need the ability to add a **hyperlink or button**. That link points to:
  ```
  https://book.yourresort.com/checkout?item=room-double
  ```
  or, for pre-bundling a package:
  ```
  https://book.yourresort.com/checkout?item=room-double&addons=act-hike,act-spa
  ```
- **The link never carries a price.** It only carries *what* was selected. The checkout subsystem looks up the real price for each SKU from its own catalog and does all the math (subtotal, deposit tiers, etc.) itself. This means a static site literally cannot be tricked into sending a wrong price — there's no price to tamper with in the URL.
- On Strikingly specifically: add one "Book Now" button per room/activity (Strikingly supports linking any button/image to an external URL), pointing to that room's checkout link. Zero JavaScript, zero embed code required. This is your Phase-1 integration.
- On a site that *can* embed JavaScript (WordPress, a custom app), you can later add a small embed script that opens the same checkout URL in a modal/iframe instead of a full redirect — purely a UX upgrade, same backend, same links underneath.
- On a fully custom app, skip the link entirely and call the subsystem's API directly (`POST /api/quote`, `POST /api/session`) — same backend, no redirect needed.

This is what makes it "repackageable": the contract between any front end and this subsystem is just **a URL with SKUs in it, or a small JSON API** — nothing front-end-technology-specific.

---

## 4. Components

**A. Catalog** (a Sheet tab, or hard-coded JSON to start)
Room types, activities, prices, and whether each is currently bookable. This is what the backend uses to price everything — never the front end.

**B. Checkout microsite** (`book.yourresort.com`)
Reads the SKUs from the URL, fetches real prices/availability from the backend, lets the customer add/remove activities, choose a deposit tier or full payment, and pay via embedded Microform card fields.

**C. Backend (Cloudflare Worker functions)**
- `GET /api/quote` — given SKUs, returns real prices, computed total, and valid deposit options.
- `POST /api/session` — creates a `pending` booking record, places a short inventory hold, and returns whatever CyberSource needs to initialize the Microform capture context.
- `POST /api/charge` — receives the Microform token, re-validates the amount server-side, calls CyberSource to actually charge it.
- `POST /api/webhook/cybersource` — receives CyberSource's signed payment notification, verifies the signature, marks the booking `paid`, finalizes the inventory hold, triggers the confirmation email.
- `GET /api/availability` — coarse (available/full) status per room type per date range, read by the checkout page before showing a room as selectable.

**D. Data store (Google Sheet)**
One tab for bookings (`booking_id, skus, guest info, total, deposit_paid, status, created_at`), one tab for inventory holds/availability.

**E. CyberSource**
Microform (card field tokenization) + Payments REST API (create/charge) + webhook notifications, all under the credentials from your Business Center (the Key Management screen you already found).

---

## 5. Deposit-tier logic (server-side, pseudocode)

```
function computeDeposit(total):
    if total <= 100: minDeposit = 10
    elif total <= 200: minDeposit = 20
    elif total <= 300: minDeposit = 30
    else: minDeposit = round(total * 0.10)

    return {
        deposit_10pct: max(minDeposit, round(total * 0.10)),
        full: total
    }
```
Adjust the brackets/percentages to your actual policy — the important part is this function lives on the server and is recomputed at charge time, never trusted from the browser.

---

## 6. Failure modes to design for up front

| Scenario | Handling |
|---|---|
| Customer closes browser after paying, before redirect back | Fine — the webhook already confirmed payment server-side independent of the browser. Redirect is just UX, not the source of truth. |
| Webhook never arrives (network blip) | Add a backup: a scheduled Worker (cron trigger) polls CyberSource's transaction search API every few minutes for any `pending` bookings older than X minutes and reconciles them. |
| Two customers try to book the same room simultaneously | The `POST /api/session` hold must be an atomic operation (e.g. a conditional update on the Sheet/DB row) — first one to hold wins; the second sees "unavailable." |
| Hold expires because customer abandoned checkout | A scheduled job releases holds older than 15 minutes back to available. |
| Someone replays an old webhook or forges a request to the webhook endpoint | Always verify CyberSource's payload signature before trusting it; reject anything unsigned or invalid outright. |
| Duplicate charge from a retried request | Use an idempotency key (your `booking_id`) on the charge call so retries don't double-charge. |
| Card declined | `POST /api/charge` returns an error to the checkout page; booking stays `pending`/hold remains briefly so they can retry with another card before it expires. |

---

## 7. Step-by-step build plan (for an agentic coding tool like Claude Code)

**Phase 0 — Accounts & credentials**
- [ ] Confirm CyberSource sandbox credentials (separate from production) are available.
- [ ] Generate REST API keys in Business Center → Key Management (sandbox first).
- [ ] Set up Cloudflare account (Pages + Workers), a Google Cloud service account for Sheets API access, and the `book.yourresort.com` subdomain DNS.

**Phase 1 — Catalog & quote endpoint**
- [ ] Define the catalog (rooms, activities, prices) as a Sheet tab or JSON file.
- [ ] Build `GET /api/quote` — takes SKUs, returns priced line items + total + deposit options.
- [ ] Build the checkout page skeleton that reads URL SKUs and calls `/api/quote`.

**Phase 2 — Payment integration (sandbox)**
- [ ] Wire up Microform on the checkout page (CyberSource sandbox capture context).
- [ ] Build `POST /api/session` (creates pending booking + hold) and `POST /api/charge` (validates amount server-side, charges via REST API).
- [ ] Test a full sandbox payment end to end.

**Phase 3 — Webhook & data store**
- [ ] Build `POST /api/webhook/cybersource`, verify signatures, mark bookings paid.
- [ ] Wire booking records into the Sheet (via Sheets API).
- [ ] Add the reconciliation cron job as a backup to the webhook.

**Phase 4 — Availability**
- [ ] Build the inventory-hold logic (atomic hold on session start, release on expiry or cancellation).
- [ ] Build `GET /api/availability` and wire it into the checkout page.

**Phase 5 — Notifications**
- [ ] Confirmation email on `paid` status (Gmail API from the Worker, or an Apps Script trigger watching the Sheet).

**Phase 6 — Strikingly integration**
- [ ] Add "Book Now" buttons per room/package on the Strikingly site, each linking to the appropriate `book.yourresort.com/checkout?item=...` URL.

**Phase 7 — Testing**
- [ ] Run sandbox transactions covering: success, decline, abandoned checkout, simultaneous double-booking attempt, webhook delay.

**Phase 8 — Go live**
- [ ] Swap sandbox CyberSource keys for production keys (stored only as Worker environment secrets, never in front-end code).
- [ ] Monitor the first few real bookings closely against Business Center before trusting it fully.

---

## 8. Starter brief for an agentic coding assistant

You can hand this paragraph directly to Claude Code (or a similar tool) to scaffold Phase 1–3:

> Build a serverless booking-and-payment microsite on Cloudflare Workers + Pages. Front end: a single checkout page that reads `item` and `addons` query params (comma-separated SKUs), fetches pricing from `/api/quote`, lets the user pick a deposit tier or full payment, and collects card details via CyberSource Microform. Backend: Worker functions for `/api/quote`, `/api/session` (creates a pending booking + inventory hold in a Google Sheet via the Sheets API, using a service account), `/api/charge` (re-validates the amount server-side against the catalog before calling the CyberSource REST Payments API), and `/api/webhook/cybersource` (verifies CyberSource's signature, marks the booking paid, releases/confirms the hold). Include a scheduled Worker that releases expired holds and reconciles any pending bookings older than 10 minutes against CyberSource's transaction search API. Store all secrets as environment variables. Use CyberSource sandbox credentials initially.

---

**Bottom line:** the whole system is one small hosted checkout service with five endpoints, a Google Sheet as the database, and CyberSource Microform for PCI-safe card capture. Any existing site — static or dynamic — integrates by linking to it or calling its API, so it drops into Strikingly today and into whatever you build next with no rework of the payment logic itself.
