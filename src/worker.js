import { priceCart, computeDepositOptions } from "./catalog.js";
import { updateBookingStatus } from "./bookings.js";
import { cybersourceRequest } from "./cybersource.js";
import * as microform from "./methods/embedded/microform.js";
import * as unifiedCheckout from "./methods/embedded/unified-checkout.js";
import * as paylink from "./methods/hosted/paylink.js";

// Which module a plain /checkout?items=... link uses when no method is
// specified. Change this one line to switch the site-wide default without
// touching any button links on the actual website.
const DEFAULT_METHOD = "microform";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/debug-env") return handleDebugEnv(env);
    if (p === "/api/quote") return handleQuote(url);

    // ---- Method-specific routes ----
    if (p === "/checkout/microform") return microform.renderCheckoutPage(url);
    if (p === "/api/microform/session" && request.method === "POST") return microform.createSession(request, env);
    if (p === "/api/microform/charge" && request.method === "POST") return microform.charge(request, env);

    if (p === "/api/paylink/create" && request.method === "POST") return paylink.createLink(request, env, ctx);
    if (p === "/checkout/paylink") return paylink.renderCheckoutPage(url);

    if (p === "/checkout/unified") return unifiedCheckout.renderCheckoutPage(url);
    if (p === "/api/unified/session" && request.method === "POST") return unifiedCheckout.createSession(request, env);
    if (p === "/api/unified/charge" && request.method === "POST") return unifiedCheckout.charge(request, env);

    // ---- Generic entry point: /checkout?items=...&method=paylink|microform|unified ----
    if (p === "/checkout") {
      const method = url.searchParams.get("method") || DEFAULT_METHOD;
      if (method === "microform") return microform.renderCheckoutPage(url);
      if (method === "unified") return unifiedCheckout.renderCheckoutPage(url);
      return paylink.renderCheckoutPage(url);
    }

    // ---- Shared webhook endpoint — one URL for all methods, dispatches by
    // recognizing which module's resource shape the payload matches. ----
    if (p === "/api/webhook/health") return new Response("ok");
    if (p === "/" || p === "/landing") return renderMinimalLanding();
    if ((p === "/api/webhook/cybersource" || p === "/api/webhook/cybersource-v2") && request.method === "POST")
      return handleWebhook(request, env);

    // Manual trigger for testing reconciliation without waiting for the cron
    if (p === "/api/reconcile" && request.method === "POST") return runReconciliation(env);

    return new Response("Not found", { status: 404 });
  },

  // Runs on the cron schedule set in wrangler.toml — reconciliation backup
  // for while the webhook is PENDING_REVIEW, and permanently afterward as
  // a safety net in case a webhook delivery is ever missed.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReconciliation(env));
  },
};

// Polling-based auto-reconciliation was confirmed NOT VIABLE: neither the
// payment-link status field nor the transaction record carries our
// purchaseNumber/bookingId back (verified against real completed
// transactions). Rather than silently do nothing useful, this now reports
// what's pending so it can be checked manually against Business Center
// while the webhook subscription is still PENDING_REVIEW.
async function runReconciliation(env) {
  const listResp = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list_pending" }),
  });
  const { pending } = await listResp.json();
  console.log(`[reconcile] ${pending?.length || 0} bookings still pending manual verification in Business Center`);
  return json({ pendingCount: pending?.length || 0, pending, note: "Auto-verification not possible via API — check Business Center Transaction Search by amount/date/name until webhook is ACTIVE." });
}

function handleQuote(url) {
  const skus = (url.searchParams.get("items") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { items, total } = priceCart(skus);
  return json({ items, total, deposits: computeDepositOptions(total) });
}

async function handleWebhook(request, env) {
  const rawBody = await request.text();
  const valid = await verifyWebhookSignature(request, rawBody, env.CYBS_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const payload = JSON.parse(rawBody);

  // Dispatch by shape: Pay by Link resources carry purchaseInformation;
  // direct Payments API resources carry clientReferenceInformation.code.
  // Add another branch here once Unified Checkout is built.
  if (payload?.purchaseInformation?.purchaseNumber) {
    await paylink.handleWebhookEvent(payload, env);
  } else if (payload?.clientReferenceInformation?.code) {
    const status = payload?.transactionInformation?.status;
    await updateBookingStatus(env, {
      bookingId: payload.clientReferenceInformation.code,
      status: status === "AUTHORIZED" ? "paid" : "failed",
    });
  }

  return new Response("ok");
}

async function verifyWebhookSignature(request, rawBody, secretBase64) {
  const sigHeader = request.headers.get("v-c-signature");
  if (!sigHeader || !secretBase64) return false;
  const keyBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = Uint8Array.from(atob(sigHeader), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(rawBody));
}

function handleDebugEnv(env) {
  const keys = ["CYBS_MERCHANT_ID", "CYBS_KEY_ID", "CYBS_SHARED_SECRET", "CYBS_ENV", "SHEET_WEBAPP_URL"];
  const report = {};
  for (const k of keys) {
    const v = env[k];
    report[k] = v === undefined ? "MISSING" : v === "" ? "EMPTY_STRING" : `OK (length=${v.length})`;
  }
  return json(report);
}

// Bare-bones smoke test for the full click-through shape (landing -> pick
// items -> checkout -> pay). NOT the real UI — that's handed off separately
// per HANDOFF_BOOKING_UI.md. No dates, no styling, just proves the wiring.
function renderMinimalLanding() {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sapana Village — Book (test)</title></head>
<body>
  <h2>Pick items (smoke test — not final UI)</h2>
  <label><input type="checkbox" value="room-double"> Double Room — $70</label><br>
  <label><input type="checkbox" value="room-suite"> Suite — $120</label><br>
  <label><input type="checkbox" value="act-hike"> Guided Hike — $20</label><br>
  <label><input type="checkbox" value="act-spa"> Spa Session — $30</label><br>
  <label><input type="checkbox" value="test-item"> Connectivity Test — $1</label><br><br>
  <button onclick="go()">Continue to checkout</button>
  <script>
    function go() {
      const checked = [...document.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
      if (!checked.length) { alert('Pick at least one item'); return; }
      location.href = '/checkout?items=' + checked.join(',');
    }
  </script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}