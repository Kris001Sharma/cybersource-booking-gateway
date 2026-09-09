// Shared module for CyberSource Payer Authentication (3D Secure).
// Shared by both embedded payment methods: Microform and Unified Checkout.
// Follows the exact pattern established by shared-charge.js.

import { cybersourceRequest } from "../../cybersource.js";

/**
 * Step 1 of Payer Authentication: Setup
 * Calls POST /risk/v1/authentication-setups with the transient token.
 * Returns { accessToken, deviceDataCollectionUrl, referenceId }.
 */
export async function setupAuthentication(env, { transientToken }) {
  const payload = {
    tokenInformation: {
      transientTokenJwt: transientToken,
    },
  };

  const result = await cybersourceRequest(env, "POST", "/risk/v1/authentication-setups", payload);
  const cai = result.data?.consumerAuthenticationInformation || {};

  return {
    accessToken: cai.accessToken,
    deviceDataCollectionUrl: cai.deviceDataCollectionUrl,
    referenceId: cai.referenceId,
    raw: result.data,
  };
}

/**
 * Step 3 of Payer Authentication: Enrollment Check
 * Calls POST /risk/v1/authentications with the token, referenceId, full billTo, and amount/currency.
 * Returns the full response.
 */
/**
 * Step 5 of Payer Authentication: Validate Authentication Result
 * Calls POST /risk/v1/authentication-results with the authenticationTransactionId.
 * Returns the full response (includes cavv, eciRawType/eci, xid, directoryServerTransactionId, etc.).
 */
export async function validateAuthentication(env, { authenticationTransactionId }) {
  const payload = {
    clientReferenceInformation: { code: crypto.randomUUID() },
    consumerAuthenticationInformation: {
      authenticationTransactionId,
    },
  };

  const result = await cybersourceRequest(env, "POST", "/risk/v1/authentication-results", payload);
  return result.data;
}

export async function checkEnrollment(env, { transientToken, referenceId, amount, currency = "USD", billTo, returnUrl }) {
  const payload = {
    clientReferenceInformation: {
      code: crypto.randomUUID(),
    },
    orderInformation: {
      amountDetails: {
        totalAmount: Number(amount).toFixed(2),
        currency: currency || env.CYBS_CURRENCY || "USD",
      },
      billTo,
    },
    tokenInformation: {
      transientTokenJwt: transientToken,
    },
    consumerAuthenticationInformation: {
      referenceId,
      returnUrl: returnUrl || `${env.CHECKOUT_ORIGIN}/api/microform/stepup-callback`,
    },
  };

  const result = await cybersourceRequest(env, "POST", "/risk/v1/authentications", payload);
  return result.data;
}
