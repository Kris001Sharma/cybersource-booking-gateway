// Shared by every embedded method (Microform, Unified Checkout) — both
// ultimately produce a transient token that gets charged through the exact
// same /pts/v2/payments call. Extracting this once means a fix here (e.g.
// once NIMB unblocks the account, or a field requirement changes) applies
// to both methods automatically instead of needing to be mirrored by hand.

import { cybersourceRequest } from "../../cybersource.js";
import { updateBookingStatus, getBooking } from "../../bookings.js";
import { priceCart, computeDepositOptions } from "../../catalog.js";

const SUPPORTED_CURRENCIES = ["USD", "NPR"];

// Confirmed network codes from CyberSource: 001=Visa, 002=Mastercard
// Only these have verified commerceIndicator mappings.
// For other networks with 3DS, we default to "internet" with a warning.
const CONFIRMED_NETWORK_MAP = { 
  "001": "vbv",  // Visa
  "002": "vbv"   // Mastercard
};

export function getCommerceIndicator(cardNetworkCode, has3ds) {
  if (!has3ds) return "internet";
  if (CONFIRMED_NETWORK_MAP[cardNetworkCode]) return CONFIRMED_NETWORK_MAP[cardNetworkCode];
  // Unknown network with 3DS: default to "internet" but log warning
  console.warn(`[chargeCard] Unknown card network "${cardNetworkCode}" with 3DS auth - defaulting commerceIndicator to "internet"`);
  return "internet";
}

function decodeTokenPayload(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch (e) {
    return null;
  }
}

export async function chargeCard(env, { bookingId, transientToken, amount, currency = "NPR", billTo, consumerAuthenticationInformation, paymentMethod }) {
  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return { ok: false, status: 400, body: { error: "Unsupported currency", detail: currency } };
  }

  const required = ["firstName", "lastName", "email", "address1", "locality", "country"];
  const missing = required.filter((f) => !billTo?.[f]);
  if (missing.length) {
    return { ok: false, status: 400, body: { error: "Missing billing fields", detail: missing } };
  }

  // Debug: log billTo for guest capture verification
  console.log(`[chargeCard] billTo received:`, JSON.stringify(billTo, null, 2));

  // Fetch booking to verify/recompute amount server-side
  const booking = await getBooking(env, bookingId);
  let serverAmount = amount;
  if (booking) {
    const skus = booking.items?.map(i => i.sku) || [];
    const { items, total } = priceCart(skus);
    const { deposit, full } = computeDepositOptions(total);
    console.log(`[chargeCard] Booking ${bookingId}: items=${JSON.stringify(items)}, total=${total}, deposit=${deposit}, full=${full}, clientAmount=${amount}`);
    const isValidAmount = Math.abs(amount - deposit) < 0.01 || Math.abs(amount - full) < 0.01;
    if (!isValidAmount) {
      return { ok: false, status: 400, body: { error: "Amount mismatch", detail: { clientAmount: amount, serverDeposit: deposit, serverFull: full } } };
    }
    serverAmount = amount;
  } else {
    console.warn(`[chargeCard] Booking ${bookingId} not found, using client amount ${amount}`);
  }

  const has3ds = !!consumerAuthenticationInformation;
  
  // Debug: log full consumerAuthenticationInformation for network detection debugging
  if (has3ds) {
    console.log(`[chargeCard] consumerAuthenticationInformation keys:`, Object.keys(consumerAuthenticationInformation));
    console.log(`[chargeCard] consumerAuthenticationInformation:`, JSON.stringify(consumerAuthenticationInformation, null, 2));
  }
  
  // Get card network: prefer from auth response, fall back to token's detectedCardTypes
  let networkFromAuth = consumerAuthenticationInformation ? (consumerAuthenticationInformation.cardNetwork || consumerAuthenticationInformation.networkCode || null) : null;
  if (!networkFromAuth && transientToken) {
    const tokenPayload = decodeTokenPayload(transientToken);
    const detected = tokenPayload?.ctx?.[0]?.data?.detectedCardTypes;
    if (detected && detected.length > 0) {
      networkFromAuth = detected[0];
      console.log(`[chargeCard] Card network from token detectedCardTypes: ${networkFromAuth}`);
    }
  }
  console.log(`[chargeCard] networkFromAuth: ${networkFromAuth}, has3ds: ${has3ds}`);
  
  const commerceIndicator = getCommerceIndicator(networkFromAuth || "", has3ds);

  const capture = env?.CYBS_CAPTURE_MODE === "true" ? true : false;

  const paymentPayload = {
    clientReferenceInformation: { code: bookingId },
    processingInformation: { commerceIndicator, capture },
    tokenInformation: { transientTokenJwt: transientToken },
    orderInformation: {
      amountDetails: { totalAmount: Number(serverAmount).toFixed(2), currency },
      billTo,
    },
  };

  if (consumerAuthenticationInformation) {
    paymentPayload.consumerAuthenticationInformation = consumerAuthenticationInformation;
  }

  const result = await cybersourceRequest(env, "POST", "/pts/v2/payments", paymentPayload);

  const authorized = result.ok && result.data.status === "AUTHORIZED";

  // Ensure guest/billTo is properly passed for Sheet update
  console.log(`[chargeCard] Calling updateBookingStatus with guest:`, JSON.stringify(billTo, null, 2));
  await updateBookingStatus(env, { bookingId, status: authorized ? "paid" : "failed", guest: billTo, paymentMethod });

  if (!authorized) {
    return { ok: false, status: 402, body: { error: "Charge failed", detail: result.data } };
  }
  return { ok: true, status: 200, body: { status: "paid", cybsResponse: result.data } };
}