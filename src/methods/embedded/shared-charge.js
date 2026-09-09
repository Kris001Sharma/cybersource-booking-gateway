// Shared by every embedded method (Microform, Unified Checkout) — both
// ultimately produce a transient token that gets charged through the exact
// same /pts/v2/payments call. Extracting this once means a fix here (e.g.
// once NIMB unblocks the account, or a field requirement changes) applies
// to both methods automatically instead of needing to be mirrored by hand.

import { cybersourceRequest } from "../../cybersource.js";
import { updateBookingStatus } from "../../bookings.js";

const SUPPORTED_CURRENCIES = ["USD", "NPR"]; // update only after NIMB confirms others

export async function chargeCard(env, { bookingId, transientToken, amount, currency = "NPR", billTo, consumerAuthenticationInformation }) {
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return { ok: false, status: 400, body: { error: "Unsupported currency", detail: currency } };
  }

  const required = ["firstName", "lastName", "email", "address1", "locality", "country"];
  const missing = required.filter((f) => !billTo?.[f]);
  if (missing.length) {
    return { ok: false, status: 400, body: { error: "Missing billing fields", detail: missing } };
  }

  // When 3DS authentication data is present, commerceIndicator must reflect
  // the actual authentication outcome — NOT remain "internet". The real
  // successful Pay by Link transaction used "5" (label "vbv") for VBV-authenticated.
  const commerceIndicator = consumerAuthenticationInformation ? "vbv" : "internet";

  const paymentPayload = {
    clientReferenceInformation: { code: bookingId },
    processingInformation: { commerceIndicator, capture: false },
    tokenInformation: { transientTokenJwt: transientToken },
    orderInformation: {
      amountDetails: { totalAmount: Number(amount).toFixed(2), currency },
      billTo,
    },
  };

  if (consumerAuthenticationInformation) {
    // IMPORTANT: Confirm exact field names (`cavv`, `eciRawType` vs `eci`,
    // `xid` / `directoryServerTransactionId`, `paSpecificationVersion`)
    // against the real /risk/v1/authentication-results response before
    // relying on this attachment. Attach generically for now; verify
    // against confirmed fields during Phase A test.
    paymentPayload.consumerAuthenticationInformation = consumerAuthenticationInformation;
  }

  // TEMPORARY — for capturing evidence for the CyberSource support case.
  // Safe to log: no raw card number/CVV ever reaches this code, only the
  // already-tokenized transientTokenJwt and non-sensitive billing fields.
  // Remove once the support case is resolved.
  console.log("[support-evidence] REQUEST:", JSON.stringify(paymentPayload));

  const result = await cybersourceRequest(env, "POST", "/pts/v2/payments", paymentPayload);

  console.log("[support-evidence] RESPONSE:", JSON.stringify(result.data));
  console.log("[support-evidence] Request ID:", result.data?.id);

  const authorized = result.ok && result.data.status === "AUTHORIZED";

  await updateBookingStatus(env, { bookingId, status: authorized ? "paid" : "failed", guest: billTo });

  if (!authorized) {
    return { ok: false, status: 402, body: { error: "Charge failed", detail: result.data } };
  }
  return { ok: true, status: 200, body: { status: "paid", cybsResponse: result.data } };
}