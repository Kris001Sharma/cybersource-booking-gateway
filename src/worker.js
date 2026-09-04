import { CATALOG, priceCart, computeDepositOptions } from "./catalog.js";
import { cybersourceRequest } from "./cybersource.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/debug-env") return handleDebugEnv(env);
    if (url.pathname === "/checkout") return handleCheckoutPage(url);
    if (url.pathname === "/api/quote") return handleQuote(url);
    if (url.pathname === "/api/session" && request.method === "POST")
      return handleSession(request, env);
    if (url.pathname === "/api/charge" && request.method === "POST")
      return handleCharge(request, env);
    if (url.pathname === "/api/webhook/cybersource" && request.method === "POST")
      return handleWebhook(request, env);

    return new Response("Not found", { status: 404 });
  },
};

// ---- /api/quote : pure catalog math, no CyberSource call needed ----
function handleQuote(url) {
  const skus = (url.searchParams.get("items") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { items, total } = priceCart(skus);
  const deposits = computeDepositOptions(total);

  return json({ items, total, deposits });
}

// ---- /api/session : create a pending booking + get a Microform capture context ----
async function handleSession(request, env) {
  const { skus, payAmount, guest } = await request.json();
  const { items, total } = priceCart(skus);
  const { deposit, full } = computeDepositOptions(total);

  // Server re-validates: the amount charged must be one of the two valid
  // options, never whatever the client sends.
  const amount = payAmount === "full" ? full : deposit;
  const bookingId = crypto.randomUUID();

  // 1. Write a pending booking row via the Apps Script web app.
  await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_booking",
      bookingId,
      items,
      total,
      amountDue: amount,
      guest,
      status: "pending",
      createdAt: new Date().toISOString(),
    }),
  });

  // 2. Ask CyberSource for a Microform capture context (sandbox).
  // Use an explicit configured origin in production (never trust the Host
  // header for anything security-relevant); fall back to the request's own
  // origin for local dev. Access the dev server via "localhost", not
  // "127.0.0.1" — CyberSource only allows http:// for the literal host
  // "localhost".
  const origin = env.CHECKOUT_ORIGIN || url_origin(request);
  const capture = await cybersourceRequest(env, "POST", "/microform/v2/sessions", {
    targetOrigins: [origin],
    clientVersion: "v2",
    allowedCardNetworks: ["VISA", "MASTERCARD"],
    allowedPaymentTypes: ["CARD"],
  });

  if (!capture.ok) {
    return json({ error: "Could not start payment session", detail: capture.data }, 502);
  }

  // The /microform/v2/sessions endpoint returns the capture context as a
  // raw JWT string (not JSON) — cybersourceRequest falls back to { raw }
  // when JSON.parse fails, so unwrap that here.
  const captureContext = capture.data.raw ?? capture.data;

  return json({ bookingId, amount, captureContext });
}

// ---- /api/charge : take the Microform transient token, actually charge ----
async function handleCharge(request, env) {
  const { bookingId, transientToken, amount, currency = "USD", billTo } = await request.json();

  // Only currencies NIMB has actually confirmed the merchant account can
  // settle in should ever reach CyberSource. Sending an unconfirmed
  // currency has produced acquirer-level rejections in testing — treat
  // this as a hard allow-list, not a default.
  const SUPPORTED_CURRENCIES = ["USD"]; // update only after NIMB confirms others
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
    processingInformation: {
      commerceIndicator: "internet",
      // Auth-only — validates the gateway/processor connection without
      // capturing (settling) real funds. Void the resulting authorization
      // in Business Center right after testing.
      capture: false,
    },
    tokenInformation: { transientTokenJwt: transientToken },
    orderInformation: {
      amountDetails: { totalAmount: Number(amount).toFixed(2), currency },
      billTo,
    },
  };

  const result = await cybersourceRequest(env, "POST", "/pts/v2/payments", paymentPayload);

  // The Payments API call is synchronous — CyberSource tells us right here
  // whether it was authorized. This is the primary confirmation signal for
  // this flow (unlike Pay by Link, where the charge happens later/elsewhere
  // and a webhook is the only way to find out). The webhook stays wired up
  // as a secondary reconciliation check, not the thing we wait on.
  const authorized = result.ok && result.data.status === "AUTHORIZED";

  await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "update_booking_status",
      bookingId,
      status: authorized ? "paid" : "failed",
    }),
  });

  if (!authorized) {
    return json({ error: "Charge failed", detail: result.data }, 402);
  }

  return json({ status: "paid", cybsResponse: result.data });
}

// ---- /api/webhook/cybersource : source of truth for "did payment succeed" ----
async function handleWebhook(request, env) {
  const rawBody = await request.text();

  const valid = await verifyWebhookSignature(request, rawBody, env.CYBS_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const payload = JSON.parse(rawBody);
  const bookingId = payload?.clientReferenceInformation?.code;
  const status = payload?.transactionInformation?.status; // e.g. "AUTHORIZED"

  if (bookingId && status) {
    await fetch(env.SHEET_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_booking_status",
        bookingId,
        status: status === "AUTHORIZED" ? "paid" : "failed",
      }),
    });
  }

  return new Response("ok");
}

async function verifyWebhookSignature(request, rawBody, secretBase64) {
  const sigHeader = request.headers.get("v-c-signature");
  if (!sigHeader || !secretBase64) return false;
  // CyberSource webhook signature = base64(HMAC-SHA256(rawBody, webhookSecret))
  const keyBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = Uint8Array.from(atob(sigHeader), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(rawBody));
}

function url_origin(request) {
  return new URL(request.url).origin;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---- /api/debug-env : shows which env vars are present (never their values) ----
// Remove this route before deploying to production.
function handleDebugEnv(env) {
  const keys = ["CYBS_MERCHANT_ID", "CYBS_KEY_ID", "CYBS_SHARED_SECRET", "CYBS_ENV", "SHEET_WEBAPP_URL"];
  const report = {};
  for (const k of keys) {
    const v = env[k];
    if (v === undefined) report[k] = "MISSING";
    else if (v === "") report[k] = "EMPTY_STRING";
    else report[k] = `OK (length=${v.length})`;
  }
  return json(report);
}

// ---- Checkout page: minimal HTML/JS, reads ?items=sku1,sku2 from the URL ----
function handleCheckoutPage(url) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Checkout</title></head>
<body>
  <h2>Your booking</h2>
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

    // Microform v2 (PCI DSS 4.0.1) requires the library to be loaded
    // dynamically using clientLibrary/clientLibraryIntegrity decoded from
    // the capture-context JWT — never hardcode the script URL.
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
          q.items.map(i => i.name + ' - $' + i.price).join('<br>') +
          '<br><b>Total: $' + q.total + '</b>';
        document.getElementById('dep-amt').textContent = q.deposits.deposit;
        document.getElementById('full-amt').textContent = q.deposits.full;
        document.getElementById('deposit-options').style.display = 'block';

        return fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus: items.split(','), payAmount: 'deposit' })
        });
      })
      .then(r => r.json())
      .then(s => {
        sessionInfo = s;
        const jwt = s.captureContext; // the raw JWT string from /api/session
        const { ctx } = decodeJwtPayload(jwt);
        // NOTE: clientLibrary/clientLibraryIntegrity are nested under
        // ctx[0].data, not ctx[0] directly — this was the earlier bug that
        // caused the script src to be "undefined".
        const { clientLibrary, clientLibraryIntegrity } = ctx[0].data;

        return loadMicroformScript(clientLibrary, clientLibraryIntegrity).then(() => {
          const flex = new Flex(jwt);
          microform = flex.microform('card');
          microform.createField('number', { placeholder: 'Card number' }).load('#card-number');
          microform.createField('securityCode', { placeholder: 'CVV' }).load('#security-code');
          document.getElementById('pay-btn').disabled = false;
        });
      })
      .catch(e => {
        document.getElementById('msg').textContent = 'Setup error: ' + e.message;
        console.error(e);
      });

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
        if (err) {
          document.getElementById('msg').textContent = 'Card error: ' + err.message;
          return;
        }
        fetch('/api/charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: sessionInfo.bookingId,
            transientToken: token,
            amount,
            billTo
          })
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