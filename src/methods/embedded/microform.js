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
  :root { --ink: #2c241f; --muted: #75685e; --line: #e6ddd3; --panel: rgba(255,255,255,.72); }
  * { box-sizing: border-box; }
  html, body { min-height: 100%; }
  body { margin: 0; background: var(--cream); color: var(--text-primary); font-family: "DM Sans", system-ui, sans-serif; }
  body::before { content: ""; position: fixed; inset: 0; pointer-events: none; background: radial-gradient(circle at 12% 0%, rgba(184,92,56,.12), transparent 34%), radial-gradient(circle at 90% 90%, rgba(232,226,217,.7), transparent 35%); }
  button, input, select, textarea { font: inherit; }
  button { cursor: pointer; }
  .checkout-page { position: relative; max-width: 1160px; margin: 0 auto; padding: 34px 24px 64px; }
  .checkout-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 34px; }
  .brand { color: var(--accent); font-family: "DM Sans", system-ui, sans-serif; font-size: 1.45rem; font-weight: 700; letter-spacing: -.02em; }
  .secure-note { color: var(--text-muted); font-size: .8rem; display: flex; align-items: center; gap: 6px; }
  .secure-note span { color: var(--success); font-size: 1rem; }
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
  .cart-line strong { display: block; font-size: .92rem; font-weight: 600; }
  .cart-line small { color: var(--muted); font-size: .78rem; }
  .cart-line .remove-item { border: 0; background: transparent; color: var(--text-muted); font-size: .75rem; padding: 5px; }
  .cart-line .remove-item:hover { color: var(--error); }
  .cart-total { display: flex; justify-content: space-between; border-top: 1px solid var(--line); margin-top: 15px; padding-top: 16px; font-size: 1.08rem; font-weight: 700; }
  .cart-total strong, #cart-total { color: var(--accent); font-size: 1.3rem; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; color: var(--muted); font-size: .78rem; font-weight: 600; margin: 0 0 7px; }
  .form-group input, .form-group textarea, .form-group select, .checkout-card input:not([type="radio"]), .checkout-card textarea, .checkout-card select { width: 100%; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,.78); color: var(--ink); padding: 11px 12px; outline: 0; transition: border-color .2s, box-shadow .2s; }
  .card-input { min-height: 44px; border: 1px solid var(--line) !important; border-radius: 10px !important; background: rgba(255,255,255,.78); padding: 10px 12px; }
  .form-group input:focus, .form-group textarea:focus, .form-group select:focus, .checkout-card input:not([type="radio"]):focus, .checkout-card textarea:focus, .checkout-card select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(184,92,56,.12); }
  .payment-choice { display: grid; gap: 9px; }
  .payment-choice label { display: flex; align-items: center; gap: 9px; padding: 12px 14px; background: rgba(255,255,255,.58); border: 1px solid var(--line); border-radius: 10px; color: var(--muted); font-size: .86rem; }
  .payment-choice input { accent-color: var(--accent); }
  .primary-action { width: 100%; border: 0; border-radius: 11px; background: var(--accent); color: #fff; padding: 14px 18px; font-weight: 700; box-shadow: 0 8px 18px rgba(184,92,56,.22); transition: background .2s, transform .2s; }
  .primary-action:hover { background: var(--accent-hover); transform: translateY(-1px); }
  .summary-card { position: sticky; top: 20px; }
  .summary-card h2 { margin-bottom: 16px; }
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
<body><main class="checkout-page">
  <header class="checkout-header"><div class="brand">Krishna Sharma</div><div class="secure-note"><span>●</span> Secure checkout</div></header>
  <section class="checkout-intro"><p class="eyebrow">Your reservation</p><h1>Complete your booking</h1><p>Review your selection and enter your details below. Your payment is processed securely.</p></section>
  <div class="checkout-layout"><section class="checkout-card">
  <h2>Booking details</h2>
  <h3>Your selection</h3><div id="cart" class="cart-list">Loading your selection...</div>
  <div id="deposit-options" style="display:none"><span id="dep-amt"></span><span id="full-amt"></span></div>

  <h3>Guest information</h3><div class="form-grid">
  <div class="form-group"><label for="bill-first">First name</label><input id="bill-first" placeholder="First name"></div>
  <div class="form-group"><label for="bill-last">Last name</label><input id="bill-last" placeholder="Last name"></div></div>
  <div class="form-group"><label for="bill-email">Email address</label><input id="bill-email" placeholder="you@example.com" type="email"></div>
  <div class="form-grid"><div class="form-group"><label for="bill-address">Address line 1</label><input id="bill-address" placeholder="Street address"></div>
  <div class="form-group"><label for="bill-city">City</label><input id="bill-city" placeholder="City"></div></div>
  <div class="form-grid"><div class="form-group"><label for="bill-state">State / province</label><input id="bill-state" placeholder="State or province"></div>
  <div class="form-group"><label for="bill-zip">Postal code</label><input id="bill-zip" placeholder="Postal code"></div></div>
  <div class="form-grid"><div class="form-group"><label for="bill-country">Country code</label><input id="bill-country" placeholder="e.g. US" value="US"></div>
  <div class="form-group"><label for="currency">Currency</label><select id="currency">
    <option value="USD" selected>USD</option>
    <option value="NPR">NPR</option>
  </select></div></div>

  <h3>Payment method</h3><div class="payment-choice">
    <label><input type="radio" name="pay" value="deposit" checked> <span>Pay deposit: $<span id="dep-amt-copy"></span></span></label>
    <label><input type="radio" name="pay" value="full"> <span>Pay in full: $<span id="full-amt-copy"></span></span></label>
  </div>
  <h3>Card details</h3>
  <div id="card-number" class="card-input"></div>
  <div style="display:flex;gap:8px;margin:8px 0">
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
  <button id="pay-btn" class="primary-action" disabled>Pay securely</button>
  <div id="msg"></div>

  <!-- Step-Up Challenge container (visible when challenge required) -->
  <div id="stepup-section" style="display:none;margin-top:20px;border-top:2px solid #ccc;padding-top:15px;">
    <h3>Step-Up Challenge Frame (OTP)</h3>
    <p>Issuing bank challenge prompt rendered below. Check your phone for the OTP!</p>
    <iframe name="microform-stepup-iframe" width="420" height="420" style="border:1px solid #999;border-radius:4px;"></iframe>
    <form id="microform-stepup-form" target="microform-stepup-iframe" method="POST" style="display:none;">
      <input type="hidden" name="JWT" id="microform-stepup-jwt">
    </form>
  </div></section><aside class="checkout-card summary-card"><h2>Order summary</h2><p class="summary-copy">Your reservation details and payment amount are shown here before you continue.</p><div class="trust-item"><b>✓</b><span>Secure payment processing</span></div><div class="trust-item"><b>✓</b><span>Your details are kept private</span></div><div class="trust-item"><b>✓</b><span>Instant booking confirmation</span></div><hr class="summary-rule"><p class="summary-copy">Questions about your reservation? Contact us before completing payment.</p></aside></div>
</main>
  <script>
    const params = new URLSearchParams(location.search);
    const items = params.get('items') || '';
    const quoteOptions = {
      checkin: params.get('checkin') || '', checkout: params.get('checkout') || '',
      adults: Number(params.get('adults')) || 1, children: Number(params.get('children')) || 0
    };
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
         document.getElementById('cart').innerHTML =
           q.items.map(i => '<div class="cart-line"><div><strong>' + i.name + '</strong><small>Reservation item</small></div><span>$' + i.price + '</span></div>').join('') +
           '<div class="cart-total"><span>Total</span><strong id="cart-total">$' + q.total + '</strong></div>';
         document.getElementById('dep-amt').textContent = q.deposits.deposit;
         document.getElementById('full-amt').textContent = q.deposits.full;
         document.getElementById('dep-amt-copy').textContent = q.deposits.deposit;
         document.getElementById('full-amt-copy').textContent = q.deposits.full;
        document.getElementById('deposit-options').style.display = 'block';
        return fetch('/api/microform/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skus: items.split(','), payAmount: 'deposit', ...quoteOptions,
            guest: {
              firstName: document.getElementById('bill-first').value,
              lastName: document.getElementById('bill-last').value,
              email: document.getElementById('bill-email').value
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
        });
      })
      .catch(e => { document.getElementById('msg').textContent = 'Setup error: ' + e.message; console.error(e); });

    document.getElementById('pay-btn').addEventListener('click', () => {
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
