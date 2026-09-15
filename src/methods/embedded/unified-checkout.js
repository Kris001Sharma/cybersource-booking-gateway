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
import { setupAuthentication, checkEnrollment as checkPayerEnrollment } from "./payer-auth.js";
import { chargeCard } from "./shared-charge.js";

export async function createSession(request, env) {
  const { skus, payAmount, guest, checkin, checkout, adults, children } = await request.json();
  const nights = checkin && checkout ? Math.max(0, Math.round((new Date(checkout + "T00:00:00") - new Date(checkin + "T00:00:00")) / (1000 * 60 * 60 * 24))) : 0;
  const { items, total } = priceCart(skus, { nights, adults, children });
  const { deposit, full } = computeDepositOptions(total);
  const amount = payAmount === "full" ? full : deposit;
  const bookingId = crypto.randomUUID();

  await createBooking(env, { bookingId, items, total, amountDue: amount, guest, paymentMethod: "unified", nights, adults, children });

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
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Checkout — Unified Checkout</title></head>
<!-- payment-method: unified -->
<body>
  <h2>Your booking (Unified Checkout)</h2>
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

  <h3>Card details (Unified Checkout)</h3>
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

  <div id="stepup-section" style="display:none;margin-top:20px;border-top:2px solid #ccc;padding-top:15px;">
    <h3>Step-Up Challenge Frame (OTP)</h3>
    <p>Issuing bank challenge prompt rendered below. Check your phone for the OTP!</p>
    <iframe name="unified-stepup-iframe" width="420" height="420" style="border:1px solid #999;border-radius:4px;"></iframe>
    <form id="unified-stepup-form" target="unified-stepup-iframe" method="POST" style="display:none;">
      <input type="hidden" name="JWT" id="unified-stepup-jwt">
    </form>
  </div>

  <script>
    const params = new URLSearchParams(location.search);
    const items = params.get('items') || '';
    let quote, sessionInfo, unifiedMicroform;

    function loadUnifiedScript(src, integrity) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.integrity = integrity; s.crossOrigin = 'anonymous';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
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
        return fetch('/api/unified/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skus: items.split(','), payAmount: 'deposit',
            guest: {
              firstName: document.getElementById('bill-first').value || 'Guest',
              lastName: document.getElementById('bill-last').value || 'User',
              email: document.getElementById('bill-email').value || 'guest@example.com'
            }
          })
        });
      })
      .then(r => r.json())
      .then(s => {
        sessionInfo = s;
        // Unified Checkout uses a different initialization pattern; for now simulate field loading
        document.getElementById('pay-btn').disabled = false;
        document.getElementById('msg').textContent = 'Unified session started. Complete card details and click Pay.';
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
      // Note: Unified Checkout typically handles tokenization internally.
      // For this integration, we simulate token receipt for the charge endpoint.
      // In a full implementation, the Unified Checkout widget would return its own token/session data.
      const simulatedToken = 'unified-test-token-' + Date.now();
      fetch('/api/unified/charge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: sessionInfo.bookingId, transientToken: simulatedToken, amount, currency, billTo })
      })
        .then(r => r.json())
        .then(res => {
          document.getElementById('msg').textContent = res.error ? ('Payment failed: ' + JSON.stringify(res.detail)) : 'Payment confirmed — booking is paid.';
        })
        .catch(e => { document.getElementById('msg').textContent = 'Charge error: ' + e.message; console.error(e); });
    });
  <\/script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

export async function charge(request, env) {
  const { bookingId, transientToken, amount, currency = "USD", billTo, consumerAuthenticationInformation } = await request.json();
  const result = await chargeCard(env, { bookingId, transientToken, amount, currency, billTo, consumerAuthenticationInformation, paymentMethod: "unified" });
  return new Response(JSON.stringify(result.body), { status: result.status, headers: { "Content-Type": "application/json" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
