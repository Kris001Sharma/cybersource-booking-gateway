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
export async function checkEnrollment(env, { transientToken, referenceId, amount, currency = "USD", billTo }) {
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
    },
  };

  const result = await cybersourceRequest(env, "POST", "/risk/v1/authentications", payload);
  return result.data;
}
