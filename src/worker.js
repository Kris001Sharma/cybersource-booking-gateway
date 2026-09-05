import { priceCart, computeDepositOptions } from "./catalog.js";
import { updateBookingStatus } from "./bookings.js";
import * as microform from "./methods/embedded/microform.js";
import * as unifiedCheckout from "./methods/embedded/unified-checkout.js";
import * as paylink from "./methods/hosted/paylink.js";

// Which module a plain /checkout?items=... link uses when no method is
// specified. Change this one line to switch the site-wide default without
// touching any button links on the actual website.
const DEFAULT_METHOD = "paylink";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/debug-env") return handleDebugEnv(env);
    if (p === "/api/quote") return handleQuote(url);

    // ---- Method-specific routes ----
    if (p === "/api/microform/session" && request.method === "POST") return microform.createSession(request, env);
    if (p === "/api/microform/charge" && request.method === "POST") return microform.charge(request, env);
    if (p === "/checkout/microform") return microform.renderCheckoutPage(url);

    if (p === "/api/paylink/create" && request.method === "POST") return paylink.createLink(request, env);
    if (p === "/checkout/paylink") return paylink.renderCheckoutPage(url);

    if (p === "/checkout/unified") return unifiedCheckout.renderCheckoutPage();
    if (p === "/api/unified/session" && request.method === "POST") return unifiedCheckout.createSession(request, env);
    if (p.startsWith("/api/unified/")) return unifiedCheckout.notImplemented();

    // ---- Generic entry point: /checkout?items=...&method=paylink|microform|unified ----
    if (p === "/checkout") {
      const method = url.searchParams.get("method") || DEFAULT_METHOD;
      if (method === "microform") return microform.renderCheckoutPage(url);
      if (method === "unified") return unifiedCheckout.renderCheckoutPage();
      return paylink.renderCheckoutPage(url);
    }

    // ---- Shared webhook endpoint — one URL for all methods, dispatches by
    // recognizing which module's resource shape the payload matches. ----
    if (p === "/api/webhook/health") return new Response("ok");
    if ((p === "/api/webhook/cybersource" || p === "/api/webhook/cybersource-v2") && request.method === "POST")
      return handleWebhook(request, env);

    return new Response("Not found", { status: 404 });
  },
};

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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}