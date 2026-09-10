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

export async function createSession(request, env) {
  const { skus, payAmount, guest } = await request.json();
  const { items, total } = priceCart(skus);
  const { deposit, full } = computeDepositOptions(total);
  const amount = payAmount === "full" ? full : deposit;
  const bookingId = crypto.randomUUID();

  await createBooking(env, { bookingId, items, total, amountDue: amount, guest, paymentMethod: "microform" });

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
<html><head><meta charset="utf-8"><title>Checkout — Microform</title></head>
<!-- payment-method: microform -->
<body>
  <h2>Your booking (Microform)</h2>
  <div id="cart"></div>
  <div id="deposit-options" style="display:none">
    <label><input type="radio" name="pay" value="deposit" checked> Pay deposit: $<span id="dep-amt"></span></label><br>
    <label><input type="radio" name="pay" value="full"> Pay in full: $<span id="full-amt"></span></label>
  </div>

  <h3>Billing details</h3>
  <input id="bill-first" placeholder="First name"><br>
  <input id="bill-last" placeholder="Last name"><br>
  <input id="bill-email" placeholder="Email" type="email"><br>
  <input id="bill-address" placeholder="Address line 1"><br>
  <input id="bill-city" placeholder="City"><br>
  <input id="bill-state" placeholder="State/Province (e.g. CA)"><br>
  <input id="bill-zip" placeholder="Postal code"><br>
  <input id="bill-country" placeholder="Country code (e.g. US)" value="US"><br>
  <select id="currency" style="margin-top:4px;width:100%;box-sizing:border-box;">
    <option value="USD" selected>USD</option>
    <option value="NPR">NPR</option>
  </select>

  <h3>Card details</h3>
  <div id="card-number" style="height:40px;border:1px solid #ccc;margin:8px 0"></div>
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
    <div id="security-code" style="height:40px;width:80px;border:1px solid #ccc"></div>
  </div>
  <button id="pay-btn" disabled>Pay</button>
  <div id="msg"></div>

  <!-- Step-Up Challenge container (visible when challenge required) -->
  <div id="stepup-section" style="display:none;margin-top:20px;border-top:2px solid #ccc;padding-top:15px;">
    <h3>Step-Up Challenge Frame (OTP)</h3>
    <p>Issuing bank challenge prompt rendered below. Check your phone for the OTP!</p>
    <iframe name="microform-stepup-iframe" width="420" height="420" style="border:1px solid #999;border-radius:4px;"></iframe>
    <form id="microform-stepup-form" target="microform-stepup-iframe" method="POST" style="display:none;">
      <input type="hidden" name="JWT" id="microform-stepup-jwt">
    </form>
  </div>

  <script>
    const params = new URLSearchParams(location.search);
    const items = params.get('items') || '';
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

    fetch('/api/quote?items=' + encodeURIComponent(items))
      .then(r => r.json())
      .then(q => {
        quote = q;
        document.getElementById('cart').innerHTML =
          q.items.map(i => i.name + ' - $' + i.price).join('<br>') + '<br><b>Total: $' + q.total + '</b>';
        document.getElementById('dep-amt').textContent = q.deposits.deposit;
        document.getElementById('full-amt').textContent = q.deposits.full;
        document.getElementById('deposit-options').style.display = 'block';
        return fetch('/api/microform/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skus: items.split(','), payAmount: 'deposit',
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