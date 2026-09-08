// PAYMENT METHOD MODULE: Microform (direct REST /pts/v2/payments)
//
// Status: code-complete and verified up through Microform tokenization.
// The final charge call is currently blocked by an account-side issue
// (DAGGREJECTED) — see project notes. Kept as its own module, not deleted,
// so it can be switched back on the moment that's resolved, without
// touching the other methods.

import { priceCart, computeDepositOptions } from "../../catalog.js";
import { cybersourceRequest } from "../../cybersource.js";
import { createBooking, updateBookingStatus } from "../../bookings.js";
import { setupAuthentication, checkEnrollment as checkPayerEnrollment } from "./payer-auth.js";

const SUPPORTED_CURRENCIES = ["USD"]; // update only after NIMB confirms others

export async function createSession(request, env) {
  const { skus, payAmount, guest } = await request.json();
  const { items, total } = priceCart(skus);
  const { deposit, full } = computeDepositOptions(total);
  const amount = payAmount === "full" ? full : deposit;
  const bookingId = crypto.randomUUID();

  await createBooking(env, { bookingId, items, total, amountDue: amount, guest });

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
  const { bookingId, transientToken, amount, currency = "USD", billTo } = await request.json();

  if (!SUPPORTED_CURRENCIES.includes(currency)) {
    return json({ error: "Unsupported currency", detail: currency }, 400);
  }

  const required = ["firstName", "lastName", "email", "address1", "locality", "country"];
  const missing = required.filter((f) => !billTo?.[f]);
  if (missing.length) {
    return json({ error: "Missing billing fields", detail: missing }, 400);
  }

  const paymentPayload = {
    clientReferenceInformation: { code: bookingId },
    processingInformation: { commerceIndicator: "internet", capture: false },
    tokenInformation: { transientTokenJwt: transientToken },
    orderInformation: {
      amountDetails: { totalAmount: Number(amount).toFixed(2), currency },
      billTo,
    },
  };

  const result = await cybersourceRequest(env, "POST", "/pts/v2/payments", paymentPayload);
  const authorized = result.ok && result.data.status === "AUTHORIZED";

  // billTo is the first point guest info is actually available in this
  // flow (collected at charge time, not session time) — capture it
  // regardless of outcome, since it's just contact info, not tied to
  // whether the charge succeeded.
  await updateBookingStatus(env, { bookingId, status: authorized ? "paid" : "failed", guest: billTo });

  if (!authorized) {
    return json({ error: "Charge failed", detail: result.data }, 402);
  }
  return json({ status: "paid", cybsResponse: result.data });
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

export function renderCheckoutPage(url) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Checkout — Microform</title></head>
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
          body: JSON.stringify({ skus: items.split(','), payAmount: 'deposit' })
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
      }, (err, token) => {
        if (err) { document.getElementById('msg').textContent = 'Card error: ' + err.message; return; }
        fetch('/api/microform/charge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: sessionInfo.bookingId, transientToken: token, amount, billTo })
        })
          .then(r => r.json())
          .then(res => {
            document.getElementById('msg').textContent =
              res.error ? ('Payment failed: ' + JSON.stringify(res.detail)) : 'Payment confirmed — booking is paid.';
          });
      });
    });
  </script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}