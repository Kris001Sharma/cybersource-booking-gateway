// PAYMENT METHOD MODULE: Microform (direct REST /pts/v2/payments)
//
// Status: code-complete and verified up through Microform tokenization.
// The final charge call is currently blocked by an account-side issue
// (DAGGREJECTED) — see project notes. Kept as its own module, not deleted,
// so it can be switched back on the moment that's resolved, without
// touching the other methods.

import { priceCart, computeDepositOptions } from "../../catalog.js";
import { createBooking } from "../../bookings.js";
import { cybersourceRequest } from "../../cybersource.js";
import { setupAuthentication, checkEnrollment as checkPayerEnrollment, validateAuthentication } from "./payer-auth.js";
import { chargeCard } from "./shared-charge.js";
import { injectThemeCSS } from "../../client/theme.js";
import { siteInfo } from "../../config.js";

export async function createSession(request, env) {
  const { skus, payAmount, guest, checkin, checkout, adults, children } = await request.json();
  const nights = checkin && checkout ? Math.max(0, Math.round((new Date(checkout + "T00:00:00") - new Date(checkin + "T00:00:00")) / (1000 * 60 * 60 * 24))) : 0;
  const { items, total } = priceCart(skus, { nights, adults, children });
  const { deposit, full } = computeDepositOptions(total);
  const amount = payAmount === "full" ? full : deposit;
  const bookingId = crypto.randomUUID();

  await createBooking(env, { bookingId, items, total, amountDue: amount, guest, paymentMethod: "microform", nights, adults, children });

  const reqUrl = new URL(request.url);
  const targetOrigins = [env.CHECKOUT_ORIGIN || reqUrl.origin];
  if (reqUrl.hostname === "localhost" && !targetOrigins.includes(reqUrl.origin)) {
    targetOrigins.push(reqUrl.origin);
  }
  const capture = await cybersourceRequest(env, "POST", "/microform/v2/sessions", {
    targetOrigins,
    clientVersion: "v2",
    allowedCardNetworks: ["VISA", "MASTERCARD"],
    allowedPaymentTypes: ["CARD"],
  });

  if (!capture.ok) {
    return json({ error: "Could not start payment session", detail: capture.data }, 502);
  }

  // /microform/v2/sessions returns the capture context as a raw JWT string,
  // not JSON — cybersourceRequest falls back to { raw } when parsing fails.
  const captureContext = capture.data.raw ?? capture.data;

  return json({ bookingId, amount, captureContext });
}

export async function charge(request, env) {
  const { bookingId, transientToken, amount, currency = "USD", billTo, consumerAuthenticationInformation } = await request.json();
  const result = await chargeCard(env, { bookingId, transientToken, amount, currency, billTo, consumerAuthenticationInformation, paymentMethod: "microform" });
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json" } });
}

export async function authSetup(request, env) {
  const body = await request.json();
  const res = await setupAuthentication(env, body);
  return json(res);
}

export async function checkEnrollment(request, env) {
  const body = await request.json();
  const res = await checkPayerEnrollment(env, body);
  return json(res);
}

// Calls payer-auth.js:validateAuthentication() — the canonical implementation.
// Replaces the inline stub that was previously in worker.js (which had a
// hardcoded test-3ds-001 reference code — not production-correct).
export async function validateAuth(request, env) {
  const { authenticationTransactionId, bookingId } = await request.json();
  const result = await validateAuthentication(env, { authenticationTransactionId, bookingId });
  return json(result);
}

export async function stepUpCallback(request) {
  let transactionId = "";
  try {
    if (request.method === "POST") {
      try {
        const formData = await request.formData();
        transactionId = formData.get("TransactionId") || formData.get("transactionId") || formData.get("MD") || "";
      } catch (err) {
        console.error("[stepup-callback] Failed to parse form data:", err);
      }
    } else {
      const url = new URL(request.url);
      transactionId = url.searchParams.get("TransactionId") || url.searchParams.get("transactionId") || "";
    }
  } catch (unexpectedErr) {
    console.error("[stepup-callback] Unexpected error during parsing:", unexpectedErr);
  }

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Step-Up Callback</title></head>
<body>
<script>
  window.parent.postMessage({ type: "stepup-complete", transactionId: ${JSON.stringify(transactionId)} }, "*");
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

export function renderCheckoutPage(url) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Checkout — Microform</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${injectThemeCSS()}
  :root { --ink: #2c241f; --muted: #75685e; --line: #e6ddd3; --panel: rgba(255,255,255,.72); --checkout-label: .82rem; --checkout-value: .96rem; --checkout-hint: .74rem; --checkout-total: 1.28rem; }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; }
  body { margin: 0; background: var(--cream); color: var(--text-primary); font-family: "DM Sans", system-ui, sans-serif; }
  body::before { content: ""; position: fixed; inset: 0; pointer-events: none; background: radial-gradient(circle at 12% 0%, rgba(184,92,56,.12), transparent 34%), radial-gradient(circle at 90% 90%, rgba(232,226,217,.7), transparent 35%); }
  button, input, select, textarea { font: inherit; }
  button { cursor: pointer; }
  .checkout-page { position: relative; max-width: 1160px; margin: 0 auto; padding: 34px 24px 64px; }
  .checkout-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 34px; }
  .brand-logo { display: block; width: 180px; height: 70px; object-fit: contain; object-position: left center; }
  .secure-note { color: var(--text-muted); font-size: .78rem; display: grid; gap: 2px; justify-items: end; text-align: right; }
  .secure-note strong { color: var(--ink); font-size: .82rem; }
  .secure-note span { color: var(--success); font-size: 1rem; }
  @media (max-width: 760px) { .secure-note { display: none; } }
  .checkout-intro { margin-bottom: 28px; }
  .eyebrow { color: var(--accent); font-size: .72rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; margin: 0 0 9px; }
  .checkout-intro h1 { font-family: "DM Sans", system-ui, sans-serif; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.08; margin: 0 0 10px; letter-spacing: -.03em; }
  .checkout-intro p { color: var(--muted); margin: 0; max-width: 620px; line-height: 1.6; }
  .checkout-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 22px; align-items: start; }
  .checkout-card { background: var(--panel); border: 1px solid rgba(255,255,255,.85); border-radius: 22px; box-shadow: 0 16px 46px rgba(44,36,31,.09); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); padding: clamp(20px, 3vw, 32px); }
  .checkout-card h2 { font-family: "DM Sans", system-ui, sans-serif; font-size: 1.55rem; margin: 0 0 22px; }
  .checkout-card h3 { color: var(--ink); font-size: .82rem; letter-spacing: .1em; text-transform: uppercase; margin: 27px 0 14px; }
  .checkout-card h3:first-child { margin-top: 0; }
  .cart-list { display: grid; gap: 9px; }
  .cart-line { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 13px 14px; background: rgba(255,255,255,.68); border: 1px solid rgba(230,221,211,.8); border-radius: 12px; }
  .cart-line-media { display: flex; align-items: center; gap: 11px; min-width: 0; }
  .cart-line-media img { width: 52px; height: 52px; border-radius: 9px; object-fit: cover; background: var(--line); }
  .cart-line strong { display: block; font-size: var(--checkout-value); font-weight: 600; }
  .cart-line small { color: var(--muted); font-size: var(--checkout-hint); }
  .cart-line .remove-item { border: 0; background: transparent; color: var(--text-muted); font-size: .75rem; padding: 5px; }
  .cart-line .remove-item:hover { color: var(--error); }
  .cart-line .remove-item { border: 0; background: transparent; color: var(--error); font-size: 1rem; padding: 6px; }
  .confirm-modal { position: fixed; inset: 0; z-index: 100; display: none; place-items: center; padding: 20px; background: rgba(44,36,31,.35); }
  .confirm-modal.is-open { display: grid; }
  .confirm-dialog { width: min(100%, 390px); padding: 24px; border-radius: 16px; background: #fff; box-shadow: 0 20px 60px rgba(44,36,31,.24); }
  .confirm-dialog h3 { margin: 0 0 9px; color: var(--ink); font-size: 1.15rem; }
  .confirm-dialog p { color: var(--muted); font-size: .86rem; line-height: 1.5; margin: 0 0 18px; }
  .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .cart-total { display: flex; justify-content: space-between; border-top: 1px solid var(--line); margin-top: 15px; padding-top: 16px; font-size: 1.08rem; font-weight: 700; }
  .cart-total strong, #cart-total { color: var(--accent); font-size: var(--checkout-total); }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; color: var(--muted); font-size: var(--checkout-label); font-weight: 600; margin: 0 0 7px; }
  .form-group input, .form-group textarea, .form-group select, .checkout-card input:not([type="radio"]), .checkout-card textarea, .checkout-card select { width: 100%; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,.78); color: var(--ink); padding: 11px 12px; outline: 0; transition: border-color .2s, box-shadow .2s; }
  .card-input { height: 42px !important; min-height: 42px !important; max-height: 42px; border: 1px solid var(--line) !important; border-radius: 10px !important; background: rgba(255,255,255,.78); padding: 8px 12px; }
  .card-number-row iframe, .card-fields-row iframe { display: block; width: 100% !important; height: 24px !important; max-height: 24px !important; }
  .form-group input:focus, .form-group textarea:focus, .form-group select:focus, .checkout-card input:not([type="radio"]):focus, .checkout-card textarea:focus, .checkout-card select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(184,92,56,.12); }
  .payment-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .payment-choice label { display: flex; align-items: center; gap: 9px; min-height: 58px; padding: 12px 14px; background: rgba(255,255,255,.58); border: 1px solid var(--line); border-radius: 10px; color: var(--muted); font-size: var(--checkout-value); }
  .payment-choice label:has(input:checked) { border-color: var(--accent); background: rgba(184,92,56,.1); color: var(--ink); }
  .payment-choice input { accent-color: var(--accent); }
  .primary-action { width: 100%; border: 0; border-radius: 11px; background: var(--accent); color: #fff; padding: 14px 18px; font-weight: 700; box-shadow: 0 8px 18px rgba(184,92,56,.22); transition: background .2s, transform .2s; }
  .pay-button-lock { width: 17px; height: 17px; vertical-align: -3px; margin-right: 6px; }
  .primary-action:hover { background: var(--accent-hover); transform: translateY(-1px); }
  .checkout-sticky-pay { position: fixed; left: max(18px, calc((100vw - 1160px) / 2 + 24px)); width: min(calc(100vw - 36px), 696px); bottom: 16px; z-index: 80; display: none; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 14px; border: 1px solid rgba(255,255,255,.9); border-radius: 14px; background: rgba(250,247,242,.95); box-shadow: 0 12px 32px rgba(44,36,31,.16); backdrop-filter: blur(14px); }
  .checkout-sticky-pay.is-visible { display: flex; }
  .checkout-sticky-pay strong { color: var(--accent); font-size: 1rem; }
  .checkout-sticky-pay button { width: auto; padding: 10px 16px; }
  .session-loading { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: var(--checkout-hint); margin: 10px 0; }
  .session-loading::before { content: ''; width: 15px; height: 15px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: checkout-spin .8s linear infinite; }
  .field-note, .field-error { color: var(--error); font-size: var(--checkout-hint); line-height: 1.3; margin-top: 4px; }
  .phone-row { display: block; }
  @media (min-width: 761px) { .contact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .billing-compact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } }
  @keyframes checkout-spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) { .checkout-sticky-pay { left: 10px; right: 10px; bottom: 10px; } .checkout-sticky-pay button { padding: 9px 12px; font-size: .8rem; } }
  .summary-card { position: sticky; top: 20px; }
  .review-card { min-width: 0; }
  .review-card h2, .summary-card h2 { letter-spacing: -.02em; }
  .stay-overview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; margin: 0 0 24px; }
  .stay-stat { padding: 12px; border-radius: 12px; background: rgba(255,255,255,.58); border: 1px solid var(--line); }
  .stay-stat small { display: block; color: var(--muted); font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 4px; }
  .stay-stat strong { color: var(--ink); font-size: .96rem; }
  .summary-lines { display: grid; gap: 11px; margin: 0 0 18px; }
  .summary-line { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: var(--checkout-label); margin: 0 0 14px; padding-bottom: 2px; }
  .summary-line strong { color: var(--ink); text-align: right; font-size: var(--checkout-value); }
  .summary-card > .cart-total, .summary-card > .summary-line { margin-bottom: 12px; }
  .summary-card > .cart-total { margin-top: 2px; padding-bottom: 2px; }
  .summary-card > .summary-line + .summary-line { margin-top: 0; }
  #summary-remaining-row { margin-top: 10px; }
  .summary-line small { display: block; color: var(--text-muted); font-size: var(--checkout-hint); margin-top: 2px; }
  .currency-box { padding: 12px 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; background: transparent; margin: 14px 0 0; }
  .currency-box + .currency-box { margin-top: 10px; }
  .local-currency-toggle { display: block; width: 100%; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: var(--checkout-label); font-weight: 600; text-align: left; padding: 0; cursor: pointer; }
  .local-currency-panel { display: none; margin-top: 12px; }
  .currency-box.is-open .local-currency-panel { display: block; }
  .local-currency-toggle::after { content: '⌄'; float: right; font-size: 1.1rem; }
  .currency-box.is-open .local-currency-toggle::after { content: '⌃'; }
  .compact-security { display: grid; grid-template-columns: 22px 1fr; gap: 8px; padding: 16px; border: 1px solid rgba(230,221,211,.9); border-radius: 14px; background: rgba(255,255,255,.68); color: var(--muted); font-size: var(--checkout-hint); box-shadow: 0 8px 20px rgba(44,36,31,.06); }
  .compact-security svg { width: 20px; height: 20px; color: var(--success); grid-row: span 2; }
  .compact-security strong { color: var(--ink); font-size: var(--checkout-label); }
  .currency-box label { display: block; color: var(--muted); font-size: .76rem; font-weight: 600; margin-bottom: 7px; }
  .currency-box select { width: 100%; border: 1px solid var(--line); border-radius: 9px; background: #fff; color: var(--ink); padding: 9px; }
  .currency-box p { margin: 0; color: var(--muted); font-size: .73rem; line-height: 1.45; }
  .currency-box strong { color: var(--ink); }
  .npr-total { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; white-space: nowrap; margin-top: 10px; color: var(--accent); font-size: 1.12rem; font-weight: 700; }
  .rate-source { margin-top: 10px !important; }
  .rate-source a { color: var(--accent); font-weight: 600; }
  .summary-card h2 { margin-bottom: 18px; font-size: 1.7rem; }
  .payment-trust { display: grid; gap: 5px; color: var(--muted); font-size: var(--checkout-hint); line-height: 1.45; }
  .accepted-cards { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 9px; }
  .card-brand { display: block; width: 58px; height: 32px; object-fit: contain; border: 1px solid var(--line); border-radius: 6px; background: #fff; padding: 4px; }
  .payment-cards { margin: 10px 0 0; color: var(--muted); font-size: var(--checkout-hint); text-align: center; }
  .payment-trust-line { margin: 8px 0 0; color: var(--ink); font-size: var(--checkout-hint); text-align: center; }
  .card-brand.mastercard { color: #d22d2d; }
  .card-number-row { margin: 8px 0; width: 100%; }
  .card-fields-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; align-items: center; margin: 8px 0; width: 100%; }
  .card-fields-row select, .card-fields-row .card-input { height: 42px; min-height: 42px; margin: 0; }
  .card-fields-row .card-input, .card-number-row .card-input { display: flex; align-items: center; overflow: hidden; width: 100%; }
  .summary-copy { color: var(--muted); font-size: .88rem; line-height: 1.55; margin: 0 0 20px; }
  .summary-rule { border: 0; border-top: 1px solid var(--line); margin: 18px 0; }
  .trust-item { display: flex; gap: 10px; color: var(--muted); font-size: .8rem; line-height: 1.45; margin: 13px 0; }
  .trust-item b { color: var(--success); }
  #deposit-options { margin-top: 10px; }
  #msg { color: var(--error); font-size: .85rem; margin-top: 12px; }
  #stepup-section { margin-top: 20px; }
  @media (max-width: 760px) { .checkout-page { padding: 22px 15px 42px; } .checkout-header { margin-bottom: 25px; } .checkout-layout { grid-template-columns: 1fr; } .summary-card { position: static; } .form-grid { grid-template-columns: 1fr; gap: 0; } }
</style></head>
<!-- payment-method: microform -->
<body><div id="checkout-sticky-pay" class="checkout-sticky-pay"><strong id="checkout-sticky-label">NPR --</strong><button type="button" id="checkout-sticky-button" class="primary-action">Pay securely</button></div><div id="remove-confirm" class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="remove-confirm-title"><div class="confirm-dialog"><h3 id="remove-confirm-title">Remove this activity?</h3><p>This optional activity will be removed from your booking.</p><div class="confirm-actions"><button type="button" id="remove-cancel" class="btn btn-outline">Keep it</button><button type="button" id="remove-confirm-action" class="primary-action" style="width:auto">Remove</button></div></div></div><main class="checkout-page">
  <header class="checkout-header"><img class="brand-logo" src="${siteInfo.logoUrl}" alt="${siteInfo.siteName}"><div class="secure-note"><strong>Secure checkout</strong><span>Secured by Cybersource · Powered by Visa</span></div></header>
  <section class="checkout-intro"><p class="eyebrow">Your reservation</p><h1>Complete your booking</h1><p>Review your selection and enter your details below.</p></section>
  <div class="checkout-layout"><section class="checkout-card review-card">
  <h2>Review your booking</h2>
  <div class="stay-overview"><div class="stay-stat"><small>Check-in</small><strong id="review-checkin">Select date</strong></div><div class="stay-stat"><small>Check-out</small><strong id="review-checkout">Select date</strong></div><div class="stay-stat"><small>Duration</small><strong id="review-nights">0 nights</strong></div></div>
  <h3>Your selection</h3><div id="cart" class="cart-list">Loading your selection...</div>
  <div id="deposit-options" style="display:none"></div>

  <h3>Guest information</h3><p class="field-note">Fields marked with * are required.</p><div class="form-grid">
  <div class="form-group"><label for="bill-first">First name *</label><input id="bill-first" required placeholder="First name"></div>
  <div class="form-group"><label for="bill-last">Last name *</label><input id="bill-last" required placeholder="Last name"></div></div>
  <div class="form-group"><label for="bill-email">Email address *</label><input id="bill-email" required placeholder="you@example.com" type="email"></div>
  <div class="form-group"><label for="bill-phone">Phone number *</label><div class="phone-row"><input id="bill-phone" required placeholder="+977123456789" type="tel" inputmode="tel" pattern="\+[0-9]{7,18}"></div></div>
  <div class="form-group"><label for="guest-notes">Notes or remarks *</label><textarea id="guest-notes" required rows="3" placeholder="Anything we should know?"></textarea></div>
  <h3>Billing address</h3><div class="form-group"><label for="bill-address">Address line 1</label><input id="bill-address" placeholder="Street address"></div>
  <div class="billing-compact-row"><div class="form-group"><label for="bill-city">City</label><input id="bill-city" placeholder="City"></div><div class="form-group"><label for="bill-state">State / province</label><input id="bill-state" placeholder="State / province"></div><div class="form-group"><label for="bill-zip">Postal code</label><input id="bill-zip" placeholder="Postal code"></div><div class="form-group"><label for="bill-country">Country *</label><input id="bill-country" required placeholder="Country"></div></div>

  <h3>Payment options</h3><div class="payment-choice">
    <label><input type="radio" name="pay" value="deposit" checked> <span>Pay 30% deposit: $<span id="dep-amt-copy"></span></span></label>
    <label><input type="radio" name="pay" value="full"> <span>Pay in full: $<span id="full-amt-copy"></span></span></label>
  </div>
  <p id="remaining-balance-message" class="summary-copy" style="display:none;margin:10px 0 0;">The remaining balance can be conveniently paid during your stay at Sapana Village Resort.</p>
  <h3>Card details</h3>
  <div class="card-number-row">
    <div id="card-number" class="card-input"></div>
  </div><div class="card-fields-row">
    <select id="exp-month">
      <option value="01">01</option><option value="02">02</option><option value="03">03</option>
      <option value="04">04</option><option value="05">05</option><option value="06">06</option>
      <option value="07">07</option><option value="08">08</option><option value="09">09</option>
      <option value="10">10</option><option value="11">11</option><option value="12">12</option>
    </select>
    <select id="exp-year">
      <option value="2026">2026</option><option value="2027">2027</option><option value="2028">2028</option>
      <option value="2029">2029</option><option value="2030">2030</option>
    </select>
    <div id="security-code" class="card-input security-input"></div>
  </div>
  <button id="pay-btn" class="primary-action" disabled><svg class="pay-button-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg><span id="pay-button-label">Pay securely</span></button><div class="payment-cards">Accepted cards<div class="accepted-cards" aria-label="Accepted cards"><img class="card-brand" src="${siteInfo.visaLogoUrl}" alt="Visa"><img class="card-brand" src="${siteInfo.mastercardLogoUrl}" alt="Mastercard"></div><div class="payment-trust-line">Secured by Cybersource · Powered by Visa</div></div>
  <div id="msg"></div>

  <!-- Step-Up Challenge container (visible when challenge required) -->
  <div id="stepup-section" style="display:none;margin-top:20px;border-top:2px solid #ccc;padding-top:15px;">
    <h3>Step-Up Challenge Frame (OTP)</h3>
    <p>Issuing bank challenge prompt rendered below. Check your phone for the OTP!</p>
    <iframe name="microform-stepup-iframe" width="420" height="420" style="border:1px solid #999;border-radius:4px;"></iframe>
    <form id="microform-stepup-form" target="microform-stepup-iframe" method="POST" style="display:none;">
      <input type="hidden" name="JWT" id="microform-stepup-jwt">
    </form>
  </div></section><aside class="checkout-card summary-card"><h2>Booking summary</h2><div class="summary-lines"><div class="summary-line"><span>Check-in</span><strong id="summary-checkin">Select date</strong></div><div class="summary-line"><span>Check-out</span><strong id="summary-checkout">Select date</strong></div><div class="summary-line"><span>Guests</span><strong id="summary-guests">1 adult</strong></div><div class="summary-line"><span>Nights</span><strong id="summary-summary-nights">0 nights</strong></div></div><hr class="summary-rule"><div class="summary-lines" id="summary-line-items"></div><div class="cart-total"><span>Total USD</span><strong id="summary-total-usd">USD --</strong></div><div class="summary-line"><span>Net payable now</span><strong id="summary-payable-usd">USD --</strong></div><div class="summary-line"><span>Remaining at the resort</span><strong id="summary-remaining-usd">USD --</strong></div><div class="currency-box"><p><strong id="npr-rate">USD 1 = NPR --</strong></p><div class="npr-total"><span>NPR payable now</span><strong id="npr-total">NPR --</strong></div><p id="exchange-source" class="rate-source">Source: <a href="https://www.nrb.org.np/forex/" target="_blank" rel="noopener noreferrer">Nepal Rastra Bank</a><br>Rate date: --</p></div><div class="currency-box" id="local-currency-box"><button type="button" id="local-currency-toggle" class="local-currency-toggle">Check the payable in your currency?</button><div class="local-currency-panel"><label for="local-currency">Select currency</label><select id="local-currency"><option value="NPR">NPR</option></select><div class="npr-total"><span id="local-total-label">NPR payable now</span><strong id="local-total">NPR --</strong></div></div></div><div class="compact-security"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg><strong>Secure payment processing</strong><span>Payment details are encrypted and handled securely through authorized card networks.</span></div></aside></div>
</main>
  <script>
    const params = new URLSearchParams(location.search);
    const items = params.get('items') || '';
    const quoteOptions = {
      checkin: params.get('checkin') || '', checkout: params.get('checkout') || '',
      adults: Number(params.get('adults')) || 1, children: Number(params.get('children')) || 0
    };
    const paymentSection = document.querySelector('.card-number-row');
    const stickyPayBar = document.getElementById('checkout-sticky-pay');
    const stickyPayButton = document.getElementById('checkout-sticky-button');
    const payButton = document.getElementById('pay-btn');
    const updateStickyPay = () => {
      if (!paymentSection || !stickyPayBar) return;
      const hidden = paymentSection.getBoundingClientRect().top > window.innerHeight || paymentSection.getBoundingClientRect().bottom < 0;
      stickyPayBar.classList.toggle('is-visible', hidden && !payButton.disabled);
    };
    window.addEventListener('scroll', updateStickyPay, { passive: true });
    window.addEventListener('resize', updateStickyPay, { passive: true });
    if (stickyPayButton) stickyPayButton.addEventListener('click', () => {
      paymentSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      payButton?.focus({ preventScroll: true });
    });
    let quote, sessionInfo, microform;

    function loadMicroformScript(clientLibrary, clientLibraryIntegrity) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = clientLibrary;
        s.integrity = clientLibraryIntegrity;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    function decodeJwtPayload(jwt) {
      const payload = jwt.split('.')[1];
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    }

    const quoteParams = new URLSearchParams({ items, ...quoteOptions });
    fetch('/api/quote?' + quoteParams.toString())
      .then(r => r.json())
      .then(q => {
        quote = q;
        const nights = quoteOptions.checkin && quoteOptions.checkout
          ? Math.max(0, Math.round((new Date(quoteOptions.checkout + 'T00:00:00') - new Date(quoteOptions.checkin + 'T00:00:00')) / 86400000))
          : 0;
        const formatDate = (value) => value ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Select date';
        document.getElementById('review-checkin').textContent = formatDate(quoteOptions.checkin);
        document.getElementById('review-checkout').textContent = formatDate(quoteOptions.checkout);
        document.getElementById('review-nights').textContent = nights + ' night' + (nights === 1 ? '' : 's');
        document.getElementById('summary-checkin').textContent = formatDate(quoteOptions.checkin);
        document.getElementById('summary-checkout').textContent = formatDate(quoteOptions.checkout);
        document.getElementById('summary-guests').textContent = quoteOptions.adults + ' adult' + (quoteOptions.adults === 1 ? '' : 's') + (quoteOptions.children ? ' · ' + quoteOptions.children + ' children' : '');
        document.getElementById('summary-summary-nights').textContent = nights + ' night' + (nights === 1 ? '' : 's');
         document.getElementById('cart').innerHTML =
           q.items.map(i => '<div class="cart-line"><div class="cart-line-media"><img src="' + (i.image || '') + '" alt=""><div><strong>' + i.name + '</strong><small>' + (i.quantity || 1) + ' guest' + ((i.quantity || 1) === 1 ? '' : 's') + (i.nights ? ' · ' + i.nights + ' nights' : '') + '</small></div></div>' + (i.type === 'activity' ? '<button type="button" class="remove-item" data-remove-sku="' + i.sku + '" aria-label="Remove activity">&#215;</button>' : '') + '<span>$' + i.total + '</span></div>').join('') +
           '<div class="cart-total"><span>Total</span><strong id="review-total">$' + q.total + '</strong></div>';
         document.getElementById('summary-line-items').innerHTML = q.items.map(i => '<div class="summary-line"><span>' + i.name + '<small>' + (i.quantity || 1) + ' × $' + i.price + (i.nights ? ' · ' + i.nights + ' nights' : '') + '</small></span><strong>$' + i.total + '</strong></div>').join('');
         let pendingRemoval = null;
         const modal = document.getElementById('remove-confirm');
         document.querySelectorAll('[data-remove-sku]').forEach((button) => button.addEventListener('click', () => { pendingRemoval = button.dataset.removeSku; modal.classList.add('is-open'); }));
         document.getElementById('remove-cancel').addEventListener('click', () => { pendingRemoval = null; modal.classList.remove('is-open'); });
         document.getElementById('remove-confirm-action').addEventListener('click', () => { if (!pendingRemoval) return; const nextItems = items.split(',').filter((sku) => sku !== pendingRemoval); const nextUrl = new URL(location.href); nextUrl.searchParams.set('items', nextItems.join(',')); location.href = nextUrl.toString(); });
         document.getElementById('dep-amt-copy').textContent = q.deposits.deposit;
         document.getElementById('full-amt-copy').textContent = q.deposits.full;
         document.getElementById('deposit-options').style.display = 'block';
         document.getElementById('summary-total-usd').textContent = 'USD ' + Number(q.total).toFixed(2);
         document.getElementById('summary-payable-usd').textContent = 'USD ' + Number(q.deposits.deposit).toFixed(2);
         document.getElementById('summary-remaining-usd').textContent = 'USD ' + Math.max(0, Number(q.total) - Number(q.deposits.deposit)).toFixed(2);
         const updatePayableDisplay = () => {
           const selectedPay = document.querySelector('input[name=pay]:checked')?.value || 'deposit';
           const payableUsd = selectedPay === 'full' ? Number(q.deposits.full) : Number(q.deposits.deposit);
           document.getElementById('summary-payable-usd').textContent = 'USD ' + payableUsd.toFixed(2);
           document.getElementById('summary-remaining-usd').textContent = 'USD ' + Math.max(0, Number(q.total) - payableUsd).toFixed(2);
           const remainingRow = document.getElementById('summary-remaining-row') || document.getElementById('summary-remaining-usd')?.parentElement;
           if (remainingRow) remainingRow.style.display = selectedPay === 'deposit' ? 'flex' : 'none';
           document.getElementById('remaining-balance-message').style.display = selectedPay === 'deposit' ? 'block' : 'none';
           document.getElementById('pay-button-label').textContent = 'Pay securely · NPR --';
           document.getElementById('pay-button-label').dataset.payableUsd = String(payableUsd);
           document.getElementById('pay-button-label').dataset.payableNprRate = 'pending';
         };
         document.querySelectorAll('input[name=pay]').forEach((input) => input.addEventListener('change', updatePayableDisplay));
         updatePayableDisplay();
         fetch('/api/forex').then((response) => response.json()).then((forex) => {
          const currencySelect = document.getElementById('local-currency');
          document.getElementById('local-currency-toggle').addEventListener('click', () => document.getElementById('local-currency-box').classList.toggle('is-open'));
          const rates = forex.rates || [{ iso3: 'NPR', name: 'Nepalese Rupee', unit: 1, buy: forex.rate }];
          currencySelect.innerHTML = rates.map((rate) => '<option value="' + rate.iso3 + '">' + rate.iso3 + ' · ' + rate.name + '</option>').join('');
          const updateLocalTotal = () => {
            const selected = rates.find((rate) => rate.iso3 === currencySelect.value) || rates[0];
            const selectedPay = document.querySelector('input[name=pay]:checked')?.value || 'deposit';
            const payableUsd = selectedPay === 'full' ? Number(q.deposits.full) : Number(q.deposits.deposit);
            const nprTotal = payableUsd * Number(forex.rate);
            const selectedUnit = Number(selected.unit) || 1;
            const nprPerSelectedUnit = Number(selected.buy) / selectedUnit;
            const converted = selected.iso3 === 'NPR' ? nprTotal : nprTotal / nprPerSelectedUnit;
            document.getElementById('npr-rate').textContent = 'USD 1 = NPR ' + Number(forex.rate).toFixed(2);
            document.getElementById('npr-total').textContent = 'NPR ' + nprTotal.toFixed(2);
         const payableLabel = 'Pay securely · NPR ' + nprTotal.toFixed(2);
         document.getElementById('pay-button-label').textContent = payableLabel;
         document.getElementById('checkout-sticky-label').textContent = 'NPR ' + nprTotal.toFixed(2);
         document.getElementById('checkout-sticky-button').textContent = 'Pay securely';
           document.getElementById('pay-button-label').dataset.payableNprRate = String(forex.rate);
            document.getElementById('local-total-label').textContent = selected.iso3 + ' total';
            document.getElementById('local-total').textContent = selected.iso3 + ' ' + converted.toFixed(2);
          };
          currencySelect.addEventListener('change', updateLocalTotal);
          document.querySelectorAll('input[name=pay]').forEach((input) => input.addEventListener('change', updateLocalTotal));
          updateLocalTotal();
          document.getElementById('exchange-source').innerHTML = (forex.fallback ? 'Source: Fallback rate shown; live NRB rate unavailable.' : 'Source: <a href="https://www.nrb.org.np/forex/" target="_blank" rel="noopener noreferrer">Nepal Rastra Bank</a>') + '<br>Rate date: ' + (forex.date || '--');
        }).catch(() => { document.getElementById('exchange-source').textContent = 'Source: Nepal Rastra Bank · rate unavailable.'; });
        document.getElementById('card-number').innerHTML = '<div class="session-loading">Preparing secure card fields...</div>';
        document.getElementById('security-code').innerHTML = '<div class="session-loading">Loading...</div>';
        return fetch('/api/microform/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skus: items.split(','), payAmount: 'deposit', ...quoteOptions,
            guest: {
              firstName: document.getElementById('bill-first').value,
              lastName: document.getElementById('bill-last').value,
              email: document.getElementById('bill-email').value,
              phone: document.getElementById('bill-phone').value,
              notes: document.getElementById('guest-notes').value
            }
          })
        });
      })
      .then(r => r.json())
      .then(s => {
        sessionInfo = s;
        const jwt = s.captureContext;
        const { ctx } = decodeJwtPayload(jwt);
        const { clientLibrary, clientLibraryIntegrity } = ctx[0].data;
        return loadMicroformScript(clientLibrary, clientLibraryIntegrity).then(() => {
          const flex = new Flex(jwt);
          microform = flex.microform('card');
          microform.createField('number', { placeholder: 'Card number' }).load('#card-number');
          microform.createField('securityCode', { placeholder: 'CVV' }).load('#security-code');
          document.getElementById('pay-btn').disabled = false;
          updateStickyPay();
        });
      })
      .catch(e => { document.getElementById('msg').textContent = 'Setup error: ' + e.message; console.error(e); });

    function validateCheckoutFields() {
      const fields = [
        ['bill-first', value => /^[A-Za-z][A-Za-z .'-]*$/.test(value.trim()), 'Enter a valid first name.'],
        ['bill-last', value => /^[A-Za-z][A-Za-z .'-]*$/.test(value.trim()), 'Enter a valid last name.'],
        ['bill-email', value => /^[^ @]+@[^ @]+[.][^ @]+$/.test(value.trim()), 'Enter a valid email address.'],
        ['bill-phone', value => /^[+][0-9]{7,18}$/.test(value.trim()), 'Phone number must start with + and contain digits only.'],
        ['guest-notes', value => value.trim().length > 0, 'Add a note or remark.'],
        ['bill-address', value => value.trim().length > 0, 'Enter your address.'],
        ['bill-city', value => value.trim().length > 0, 'Enter your city.'],
        ['bill-state', value => value.trim().length > 0, 'Enter your state or province.'],
        ['bill-zip', value => value.trim().length > 0, 'Enter your postal code.'],
        ['bill-country', value => value.trim().length > 0, 'Select your country.'],
      ];
      for (const [id, check, message] of fields) {
        const field = document.getElementById(id);
        const oldError = field.parentElement.querySelector('.field-error');
        if (oldError) oldError.remove();
        if (!check(field.value)) {
          const error = document.createElement('span'); error.className = 'field-error'; error.textContent = message; field.parentElement.appendChild(error);
          field.scrollIntoView({ behavior: 'smooth', block: 'center' }); field.focus(); return false;
        }
      }
      if (!microform) { paymentSection?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.getElementById('msg').textContent = 'Secure card fields are still loading.'; return false; }
      return true;
    }
    document.querySelectorAll('#bill-first,#bill-last,#bill-email,#phone-country-code,#bill-phone,#guest-notes,#bill-address,#bill-city,#bill-state,#bill-zip,#bill-country').forEach((field) => {
      field.addEventListener('input', () => {
        const error = field.parentElement.querySelector('.field-error');
        if (error && field.value.trim()) error.remove();
        if (field.id === 'bill-phone') field.value = field.value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '').slice(0, 19);
      });
      field.addEventListener('blur', () => {
        if (!field.value.trim() && !field.parentElement.querySelector('.field-error')) {
          const error = document.createElement('span'); error.className = 'field-error'; error.textContent = field.labels?.[0]?.textContent.replace(' *', '') + ' is required.'; field.parentElement.appendChild(error);
        }
      });
    });
    document.getElementById('pay-btn').addEventListener('click', () => {
      if (!validateCheckoutFields()) return;
      const currency = document.getElementById('currency') ? document.getElementById('currency').value : 'USD';
      const payAmount = document.querySelector('input[name=pay]:checked').value;
      const amount = payAmount === 'full' ? quote.deposits.full : quote.deposits.deposit;
      const billTo = {
        firstName: document.getElementById('bill-first').value,
        lastName: document.getElementById('bill-last').value,
        email: document.getElementById('bill-email').value,
        address1: document.getElementById('bill-address').value,
        locality: document.getElementById('bill-city').value,
        administrativeArea: document.getElementById('bill-state').value,
        postalCode: document.getElementById('bill-zip').value,
        country: document.getElementById('bill-country').value
      };
      microform.createToken({
        expirationMonth: document.getElementById('exp-month').value,
        expirationYear: document.getElementById('exp-year').value
      }, async (err, token) => {
        if (err) { document.getElementById('msg').textContent = 'Card error: ' + err.message; return; }

        try {
          // Step 1: Auth Setup
          const setupResp = await fetch('/api/microform/auth-setup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transientToken: token })
          }).then(r => r.json());

          if (!setupResp.referenceId || !setupResp.deviceDataCollectionUrl) {
            document.getElementById('msg').textContent = 'Auth setup failed: missing referenceId or DDC URL';
            return;
          }

          // Step 2: DDC (hidden iframe)
          const ddcFrame = document.createElement('iframe');
          ddcFrame.name = 'microform-ddc-iframe';
          ddcFrame.style.display = 'none';
          document.body.appendChild(ddcFrame);
          const ddcForm = document.createElement('form');
          ddcForm.method = 'POST'; ddcForm.action = setupResp.deviceDataCollectionUrl;
          ddcForm.target = 'microform-ddc-iframe'; ddcForm.style.display = 'none';
          const ddcJwt = document.createElement('input');
          ddcJwt.type = 'hidden'; ddcJwt.name = 'JWT'; ddcJwt.value = setupResp.accessToken;
          ddcForm.appendChild(ddcJwt);
          document.body.appendChild(ddcForm);

          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { document.body.removeChild(ddcFrame); document.body.removeChild(ddcForm); resolve(); }, 10000);
            const listener = (ev) => {
              if (ev.origin !== 'https://centinelapi.cardinalcommerce.com') return;
              let data = ev.data;
              if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) {} }
              if (data && data.MessageType === 'profile.completed') {
                clearTimeout(timeout); window.removeEventListener('message', listener);
                document.body.removeChild(ddcFrame); document.body.removeChild(ddcForm);
                resolve();
              }
            };
            window.addEventListener('message', listener);
            ddcForm.submit();
          });

          // Step 3: Enrollment Check
          const enrollResp = await fetch('/api/microform/check-enrollment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transientToken: token, referenceId: setupResp.referenceId,
              amount: amount, currency: currency || 'USD', billTo: billTo,
              returnUrl: (location.origin + '/api/microform/stepup-callback')
            })
          }).then(r => r.json());

          const cai = enrollResp.consumerAuthenticationInformation || {};

          // Step 4: Step-Up (if required)
          let authTxId = '';
          if (cai.stepUpUrl && (cai.accessToken || cai.token)) {
            document.getElementById('stepup-section').style.display = 'block';
            const stepUpFrame = document.createElement('iframe');
            stepUpFrame.name = 'microform-stepup-iframe';
            stepUpFrame.style.display = 'none';
            document.body.appendChild(stepUpFrame);
            const stepUpForm = document.createElement('form');
            stepUpForm.method = 'POST'; stepUpForm.action = cai.stepUpUrl;
            stepUpForm.target = 'microform-stepup-iframe'; stepUpForm.style.display = 'none';
            const stepUpJwt = document.createElement('input');
            stepUpJwt.type = 'hidden'; stepUpJwt.name = 'JWT'; stepUpJwt.value = cai.accessToken || cai.token;
            stepUpForm.appendChild(stepUpJwt);
            document.body.appendChild(stepUpForm);

            const stepUpResult = await new Promise((resolve) => {
              const listener = (ev) => {
                let data = ev.data;
                if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) {} }
                if (data && data.type === 'stepup-complete') {
                  window.removeEventListener('message', listener);
                  document.body.removeChild(stepUpFrame); document.body.removeChild(stepUpForm);
                  resolve(data);
                }
              };
              window.addEventListener('message', listener);
              stepUpForm.submit();
            });
            authTxId = stepUpResult.transactionId || cai.authenticationTransactionId || cai.referenceId;
          } else {
            authTxId = cai.authenticationTransactionId || cai.referenceId;
          }

          // Step 5: Validate Auth
          const valResp = await fetch('/api/microform/validate-auth', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authenticationTransactionId: authTxId, bookingId: sessionInfo.bookingId })
          }).then(r => r.json());

          const vcai = valResp.consumerAuthenticationInformation || {};

          // Step 6: Charge with 3DS fields
          const authFields = valResp.consumerAuthenticationInformation ? {
            cavv: vcai.cavv, eciRawType: vcai.eciRawType, eci: vcai.eci,
            xid: vcai.xid,
            directoryServerTransactionId: vcai.directoryServerTransactionId || vcai.authenticationTransactionId,
            authenticationTransactionId: authTxId
          } : null;

          const chargePayload = {
            bookingId: sessionInfo.bookingId, transientToken: token, amount: amount,
            currency: currency || 'USD', billTo: billTo
          };
          if (authFields && authFields.cavv) {
            chargePayload.consumerAuthenticationInformation = authFields;
          }
          const chargeResp = await fetch('/api/microform/charge', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chargePayload)
          }).then(r => r.json());

          document.getElementById('msg').textContent = chargeResp.error
            ? ('Payment failed: ' + JSON.stringify(chargeResp.detail))
            : 'Payment confirmed — booking is paid.';
        } catch (e) {
          document.getElementById('msg').textContent = 'Payment flow error: ' + e.message;
          console.error('Checkout auth flow error:', e);
        }
      });
    });
  </script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
