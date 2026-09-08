// PAYMENT METHOD MODULE: Unified Checkout (POST /up/v1/sessions)
//
// Status: session creation implemented, NOT YET POSTMAN-VERIFIED — test the
// endpoint directly before trusting this code, same discipline as the other
// two modules.
//
// IMPORTANT: Unified Checkout's actual charge step ultimately calls the
// same /pts/v2/payments endpoint that's currently blocked for Microform
// (DAGGREJECTED). A working capture-context session here only confirms the
// widget itself is entitled — it will NOT bypass that account-side issue.
// The charge() function below is deliberately left unimplemented until
// that's resolved, to avoid duplicating a call we already know is blocked.

import { priceCart, computeDepositOptions } from "../../catalog.js";
import { cybersourceRequest } from "../../cybersource.js";
import { createBooking } from "../../bookings.js";

export async function createSession(request, env) {
  const { skus, payAmount, guest } = await request.json();
  const { items, total } = priceCart(skus);
  const { deposit, full } = computeDepositOptions(total);
  const amount = payAmount === "full" ? full : deposit;
  const bookingId = crypto.randomUUID();

  await createBooking(env, { bookingId, items, total, amountDue: amount, guest });

  const origin = env.CHECKOUT_ORIGIN || new URL(request.url).origin;
  const result = await cybersourceRequest(env, "POST", "/up/v1/sessions", {
    targetOrigins: [origin],
    clientVersion: "v1",
    allowedCardNetworks: ["VISA", "MASTERCARD"],
    country: "US",
    locale: "en_US",
    orderInformation: { amountDetails: { totalAmount: String(amount), currency: env.CYBS_CURRENCY || "USD" } },
  });

  if (!result.ok) {
    return json({ error: "Could not start Unified Checkout session", detail: result.data }, 502);
  }

  const captureContext = result.data.raw ?? result.data; // likely a raw JWT, same pattern as Microform
  return json({ bookingId, amount, captureContext });
}

export function renderCheckoutPage(url) {
  // Not yet built — session creation should be verified via Postman first.
  // Once confirmed, this follows the same shape as microform.js's page,
  // but loads CyberSource's Unified Checkout v1 JS bundle and calls
  // VAS.UnifiedCheckout(session) / checkout.mount(target) instead of Flex.
  return new Response("Unified Checkout — session API implemented, checkout page pending Postman verification", { status: 501 });
}

export async function notImplemented() {
  return json({ error: "Unified Checkout charge not implemented — shares the blocked /pts/v2/payments endpoint with Microform" }, 501);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}