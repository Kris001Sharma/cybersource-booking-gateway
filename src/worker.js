import { priceCart, computeDepositOptions } from "./catalog.js";
import { updateBookingStatus } from "./bookings.js";
import { cybersourceRequest } from "./cybersource.js";
import * as microform from "./methods/embedded/microform.js";
import * as unifiedCheckout from "./methods/embedded/unified-checkout.js";
import * as paylink from "./methods/hosted/paylink.js";

// Which module a plain /checkout?items=... link uses when no method is
// specified. Change this one line to switch the site-wide default without
// touching any button links on the actual website.
const DEFAULT_METHOD = "microform";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;

    if (p === "/api/debug-env") return handleDebugEnv(env);
    if (p === "/api/quote") return handleQuote(url);

    // ---- Method-specific routes ----
    if (p === "/debug/phase1-test") return renderPhase1TestPage(url);
    if (p === "/debug/ddc-test") return renderDdcTestPage(url);
    if (p === "/debug/stepup-test") return renderStepUpTestPage(url);
    if (p === "/api/microform/validate-auth" && request.method === "POST") return validateAuth(request, env);
    if (p === "/api/microform/auth-setup" && request.method === "POST") return microform.authSetup(request, env);
    if (p === "/api/microform/check-enrollment" && request.method === "POST") return microform.checkEnrollment(request, env);
    if (p === "/api/microform/session" && request.method === "POST") return microform.createSession(request, env);
    if (p === "/api/microform/charge" && request.method === "POST") return microform.charge(request, env);
    if (p === "/checkout/microform") return microform.renderCheckoutPage(url);

    if (p === "/api/paylink/create" && request.method === "POST") return paylink.createLink(request, env, ctx);
    if (p === "/checkout/paylink") return paylink.renderCheckoutPage(url);

    if (p === "/checkout/unified") return unifiedCheckout.renderCheckoutPage(url);
    if (p === "/api/unified/session" && request.method === "POST") return unifiedCheckout.createSession(request, env);
    if (p === "/api/unified/charge" && request.method === "POST") return unifiedCheckout.charge(request, env);

    // ---- Generic entry point: /checkout?items=...&method=paylink|microform|unified ----
    if (p === "/checkout") {
      const method = url.searchParams.get("method") || DEFAULT_METHOD;
      if (method === "microform") return microform.renderCheckoutPage(url);
      if (method === "unified") return unifiedCheckout.renderCheckoutPage(url);
      return paylink.renderCheckoutPage(url);
    }

    // ---- Shared webhook endpoint — one URL for all methods, dispatches by
    // recognizing which module's resource shape the payload matches. ----
    if (p === "/api/webhook/health") return new Response("ok");
    if (p === "/" || p === "/landing") return renderMinimalLanding();
    if ((p === "/api/webhook/cybersource" || p === "/api/webhook/cybersource-v2") && request.method === "POST")
      return handleWebhook(request, env);

    // Manual trigger for testing reconciliation without waiting for the cron
    if (p === "/api/reconcile" && request.method === "POST") return runReconciliation(env);

    return new Response("Not found", { status: 404 });
  },

  // Runs on the cron schedule set in wrangler.toml — reconciliation backup
  // for while the webhook is PENDING_REVIEW, and permanently afterward as
  // a safety net in case a webhook delivery is ever missed.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReconciliation(env));
  },
};

// Polling-based auto-reconciliation was confirmed NOT VIABLE: neither the
// payment-link status field nor the transaction record carries our
// purchaseNumber/bookingId back (verified against real completed
// transactions). Rather than silently do nothing useful, this now reports
// what's pending so it can be checked manually against Business Center
// while the webhook subscription is still PENDING_REVIEW.
async function runReconciliation(env) {
  const listResp = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list_pending" }),
  });
  const { pending } = await listResp.json();
  console.log(`[reconcile] ${pending?.length || 0} bookings still pending manual verification in Business Center`);
  return json({ pendingCount: pending?.length || 0, pending, note: "Auto-verification not possible via API — check Business Center Transaction Search by amount/date/name until webhook is ACTIVE." });
}

function handleQuote(url) {
  const skus = (url.searchParams.get("items") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { items, total } = priceCart(skus);
  return json({ items, total, deposits: computeDepositOptions(total) });
}

async function handleWebhook(request, env) {
  const rawBody = await request.text();
  const valid = await verifyWebhookSignature(request, rawBody, env.CYBS_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const payload = JSON.parse(rawBody);

  // Dispatch by shape: Pay by Link resources carry purchaseInformation;
  // direct Payments API resources carry clientReferenceInformation.code.
  // Add another branch here once Unified Checkout is built.
  if (payload?.purchaseInformation?.purchaseNumber) {
    await paylink.handleWebhookEvent(payload, env);
  } else if (payload?.clientReferenceInformation?.code) {
    const status = payload?.transactionInformation?.status;
    await updateBookingStatus(env, {
      bookingId: payload.clientReferenceInformation.code,
      status: status === "AUTHORIZED" ? "paid" : "failed",
    });
  }

  return new Response("ok");
}

async function verifyWebhookSignature(request, rawBody, secretBase64) {
  const sigHeader = request.headers.get("v-c-signature");
  if (!sigHeader || !secretBase64) return false;
  const keyBytes = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = Uint8Array.from(atob(sigHeader), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(rawBody));
}

function handleDebugEnv(env) {
  const keys = ["CYBS_MERCHANT_ID", "CYBS_KEY_ID", "CYBS_SHARED_SECRET", "CYBS_ENV", "SHEET_WEBAPP_URL"];
  const report = {};
  for (const k of keys) {
    const v = env[k];
    report[k] = v === undefined ? "MISSING" : v === "" ? "EMPTY_STRING" : `OK (length=${v.length})`;
  }
  return json(report);
}

// Bare-bones smoke test for the full click-through shape (landing -> pick
// items -> checkout -> pay). NOT the real UI — that's handed off separately
// per HANDOFF_BOOKING_UI.md. No dates, no styling, just proves the wiring.
function renderMinimalLanding() {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Sapana Village — Book (test)</title></head>
<body>
  <h2>Pick items (smoke test — not final UI)</h2>
  <label><input type="checkbox" value="room-double"> Double Room — $70</label><br>
  <label><input type="checkbox" value="room-suite"> Suite — $120</label><br>
  <label><input type="checkbox" value="act-hike"> Guided Hike — $20</label><br>
  <label><input type="checkbox" value="act-spa"> Spa Session — $30</label><br>
  <label><input type="checkbox" value="test-item"> Connectivity Test — $1</label><br><br>
  <button onclick="go()">Continue to checkout</button>
  <script>
    function go() {
      const checked = [...document.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
      if (!checked.length) { alert('Pick at least one item'); return; }
      location.href = '/checkout?items=' + checked.join(',');
    }
  </script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// TEMPORARY debug route: the step-up challenge iframe — VISIBLE this time,
// since this is where the real bank OTP UI renders. The JWT field here
// uses the enrollment response's "token" field, not the setup accessToken.
function renderStepUpTestPage(url) {
  const stepUpUrl = url.searchParams.get("stepUpUrl") || "";
  const jwt = url.searchParams.get("jwt") || "";
  const html = `<!doctype html>
<html><body>
  <h3>Step-up challenge (complete the OTP below)</h3>
  <iframe name="step-up-iframe" height="400" width="400"></iframe>
  <form id="step-up-form" target="step-up-iframe" method="POST" action="${stepUpUrl}">
    <input type="hidden" name="JWT" value="${jwt}">
  </form>
  <p id="status">Waiting for challenge completion...</p>
  <script>
    document.getElementById('step-up-form').submit();
    window.addEventListener('message', function(event) {
      document.getElementById('status').textContent = 'Challenge completed — check console, then call /api/microform/validate-auth';
      console.log('Step-up postMessage received:', event.origin, event.data);
    }, false);
  </script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// Step 5 of the flow: after the challenge completes, validate the result
// and get the final cavv/eci/xid needed to actually charge the card.
async function validateAuth(request, env) {
  const { authenticationTransactionId } = await request.json();
  const result = await cybersourceRequest(env, "POST", "/risk/v1/authentication-results", {
    clientReferenceInformation: { code: "test-3ds-001" },
    consumerAuthenticationInformation: { authenticationTransactionId },
  });
  return json(result.data, result.ok ? 200 : 502);
}
// (file:// caused anomalous behavior — form-to-iframe posts are restricted
// in that context). Pass accessToken and ddcUrl as query params so this
// can be retested without redeploying each time. Remove once 3DS is done.
function renderDdcTestPage(url) {
  const accessToken = url.searchParams.get("accessToken") || "";
  const ddcUrl = url.searchParams.get("ddcUrl") || "";
  const html = `<!doctype html>
<html><body>
  <h3>DDC test (served over HTTPS)</h3>
  <p id="status">Submitting...</p>
  <iframe name="ddc-iframe" height="10" width="10" style="display:none;"></iframe>
  <form id="ddc-form" target="ddc-iframe" method="POST" action="${ddcUrl}">
    <input type="hidden" name="JWT" value="${accessToken}">
  </form>
  <script>
    document.getElementById('ddc-form').submit();
    window.addEventListener('message', function(event) {
      if (event.origin !== 'https://centinelapi.cardinalcommerce.com') return;
      let data = event.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (e) {}
      }
      if (data && data.MessageType === 'profile.completed') {
        document.getElementById('status').textContent = 'Received Cardinal profile.completed — check console for detail';
        console.log('DDC postMessage received:', event.origin, data);
      }
    }, false);
    setTimeout(() => {
      if (document.getElementById('status').textContent === 'Submitting...') {
        document.getElementById('status').textContent = 'No postMessage received after 6s — collection window still likely complete, but no explicit confirmation from Cardinal (this is normal for this step). Re-run the enrollment check now.';
      }
    }, 6000);
  </script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function renderPhase1TestPage(url) {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Phase 1 Diagnostic Test: Microform Token -> Setup -> DDC -> Enrollment Check</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 650px; margin: 30px auto; padding: 20px; line-height: 1.5; color: #333; }
    h2, h3 { color: #111; margin-top: 20px; }
    input, select { padding: 8px 12px; width: 100%; box-sizing: border-box; margin-bottom: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
    .row { display: flex; gap: 8px; }
    .box { height: 40px; border: 1px solid #ccc; border-radius: 4px; padding: 0 10px; margin-bottom: 8px; }
    button { padding: 12px 20px; font-size: 15px; font-weight: bold; background: #0066cc; color: #fff; border: none; border-radius: 6px; cursor: pointer; width: 100%; }
    button:disabled { background: #bbb; cursor: not-allowed; }
    pre { background: #1e1e1e; color: #eee; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; max-height: 350px; }
    .log-entry { padding: 4px 0; border-bottom: 1px solid #eee; font-family: monospace; font-size: 13px; }
  </style>
</head>
<body>
  <h2>Phase 1 Test: Payer Authentication Setup & Enrollment Check</h2>
  <p>Tests <code>/api/microform/auth-setup</code> and <code>/api/microform/check-enrollment</code> using a real Microform-tokenized card with full billing info.</p>

  <h3>1. Billing Details (Full Real Data)</h3>
  <div class="row">
    <input id="bill-first" value="Krishna" placeholder="First name">
    <input id="bill-last" value="Sharma" placeholder="Last name">
  </div>
  <input id="bill-email" value="krish001.sharma@gmail.com" placeholder="Email" type="email">
  <input id="bill-address" value="Thamel Marg" placeholder="Address line 1">
  <div class="row">
    <input id="bill-city" value="Kathmandu" placeholder="City">
    <input id="bill-country" value="NP" placeholder="Country code (e.g. NP, US)">
  </div>
  <div class="row">
    <input id="amount" value="1.00" placeholder="Amount">
    <select id="currency">
      <option value="USD" selected>USD</option>
      <option value="NPR">NPR</option>
    </select>
  </div>

  <h3>2. Card Details (Microform)</h3>
  <div id="card-number" class="box"></div>
  <div class="row">
    <select id="exp-month">
      <option value="01">01</option><option value="02">02</option><option value="03">03</option><option value="04">04</option>
      <option value="05">05</option><option value="06">06</option><option value="07">07</option><option value="08">08</option>
      <option value="09">09</option><option value="10">10</option><option value="11">11</option><option value="12" selected>12</option>
    </select>
    <select id="exp-year">
      <option value="2026">2026</option><option value="2027">2027</option><option value="2028" selected>2028</option><option value="2029">2029</option><option value="2030">2030</option>
    </select>
    <div id="security-code" class="box" style="width: 140px;"></div>
  </div>

  <button id="run-btn" disabled>Run Phase 1 Test (Tokenize -> Setup -> DDC -> Check Enrollment)</button>

  <h3>3. Execution Progress</h3>
  <div id="log" style="background:#fafafa;padding:10px;border:1px solid #ddd;border-radius:4px;min-height:80px;margin-bottom:12px;"></div>

  <h3>4. Raw CyberSource Response</h3>
  <pre id="output">{}</pre>

  <!-- Hidden DDC iframe and form -->
  <iframe name="phase1-ddc-iframe" style="display:none;" width="10" height="10"></iframe>
  <form id="phase1-ddc-form" target="phase1-ddc-iframe" method="POST" style="display:none;">
    <input type="hidden" name="JWT" id="phase1-ddc-jwt">
  </form>

  <!-- Step-Up Challenge container if required -->
  <div id="stepup-section" style="display:none;margin-top:20px;border-top:2px solid #ccc;padding-top:15px;">
    <h3>Step-Up Challenge Frame (OTP)</h3>
    <p>Issuing bank challenge prompt rendered below. Check your phone for the OTP!</p>
    <iframe name="phase1-stepup-iframe" width="420" height="420" style="border:1px solid #999;border-radius:4px;"></iframe>
    <form id="phase1-stepup-form" target="phase1-stepup-iframe" method="POST" style="display:none;">
      <input type="hidden" name="JWT" id="phase1-stepup-jwt">
    </form>
  </div>

  <script>
    let microformInstance, sessionData;
    const logEl = document.getElementById('log');
    const outEl = document.getElementById('output');
    const runBtn = document.getElementById('run-btn');

    function log(msg) {
      console.log('[Phase1-Test]', msg);
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = msg;
      logEl.appendChild(div);
    }

    function loadMicroformScript(src, integrity) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    function decodeJwt(jwt) {
      const p = jwt.split('.')[1];
      return JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/')));
    }

    // Step 0: Initialize Microform
    log('Initializing Microform session...');
    fetch('/api/microform/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: ['room-double'], payAmount: 'deposit' })
    })
    .then(r => r.json())
    .then(s => {
      sessionData = s;
      const { ctx } = decodeJwt(s.captureContext);
      const { clientLibrary, clientLibraryIntegrity } = ctx[0].data;
      log('Loaded capture context JWT. Loading client library...');
      return loadMicroformScript(clientLibrary, clientLibraryIntegrity);
    })
    .then(() => {
      const flex = new Flex(sessionData.captureContext);
      microformInstance = flex.microform('card');
      microformInstance.createField('number', { placeholder: 'Card number' }).load('#card-number');
      microformInstance.createField('securityCode', { placeholder: 'CVV' }).load('#security-code');
      log('Microform fields ready. Enter card details and click Run.');
      runBtn.disabled = false;
    })
    .catch(err => {
      log('Initialization error: ' + err.message);
    });

    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      log('Starting Phase 1 test flow...');

      const billTo = {
        firstName: document.getElementById('bill-first').value,
        lastName: document.getElementById('bill-last').value,
        email: document.getElementById('bill-email').value,
        address1: document.getElementById('bill-address').value,
        locality: document.getElementById('bill-city').value,
        country: document.getElementById('bill-country').value
      };
      const amount = document.getElementById('amount').value;
      const currency = document.getElementById('currency').value;

      try {
        // 1. Tokenize Card
        log('1. Tokenizing card via Microform...');
        const token = await new Promise((resolve, reject) => {
          microformInstance.createToken({
            expirationMonth: document.getElementById('exp-month').value,
            expirationYear: document.getElementById('exp-year').value
          }, (err, t) => {
            if (err) reject(err);
            else resolve(t);
          });
        });
        log('Tokenization SUCCESS! TransientToken received: ' + token.substring(0, 25) + '...');

        // 2. Call Auth Setup
        log('2. Calling POST /api/microform/auth-setup...');
        const setupResp = await fetch('/api/microform/auth-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transientToken: token })
        }).then(r => r.json());

        outEl.textContent = JSON.stringify(setupResp, null, 2);
        log('Auth Setup Response: referenceId=' + setupResp.referenceId + ', DDC URL=' + setupResp.deviceDataCollectionUrl);

        if (!setupResp.referenceId || !setupResp.deviceDataCollectionUrl) {
          log('ERROR: Missing referenceId or deviceDataCollectionUrl in setup response');
          runBtn.disabled = false;
          return;
        }

        // 3. Perform Device Data Collection (DDC)
        log('3. Posting to DDC URL via hidden iframe...');
        const ddcForm = document.getElementById('phase1-ddc-form');
        ddcForm.action = setupResp.deviceDataCollectionUrl;
        document.getElementById('phase1-ddc-jwt').value = setupResp.accessToken;

        await new Promise((resolve) => {
          let resolved = false;
          function onMsg(ev) {
            if (ev.origin !== 'https://centinelapi.cardinalcommerce.com') {
              console.log('[Phase1-Test] Ignored postMessage from non-Cardinal origin:', ev.origin, ev.data);
              return;
            }
            let data = ev.data;
            if (typeof data === 'string') {
              try { data = JSON.parse(data); } catch (e) {}
            }
            console.log('[Phase1-Test] Origin-matched postMessage from Cardinal received:', ev.origin, data);
            if (data && data.MessageType === 'profile.completed') {
              console.log('[Phase1-Test] Confirmed origin-matched message with MessageType: "profile.completed"');
              log('DDC SUCCESS: Origin https://centinelapi.cardinalcommerce.com verified, MessageType="profile.completed"');
              window.removeEventListener('message', onMsg);
              if (!resolved) { resolved = true; resolve(); }
            }
          }
          window.addEventListener('message', onMsg);
          ddcForm.submit();
          setTimeout(() => {
            if (!resolved) {
              log('DDC timeout reached (10s) without profile.completed from Cardinal. Proceeding with caution...');
              window.removeEventListener('message', onMsg);
              resolved = true;
              resolve();
            }
          }, 10000);
        });

        // 4. Call Enrollment Check
        log('4. Calling POST /api/microform/check-enrollment...');
        const enrollResp = await fetch('/api/microform/check-enrollment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transientToken: token,
            referenceId: setupResp.referenceId,
            amount,
            currency,
            billTo
          })
        }).then(r => r.json());

        outEl.textContent = JSON.stringify(enrollResp, null, 2);
        log('Enrollment Check Response Status: ' + (enrollResp.status || enrollResp.consumerAuthenticationInformation?.status));

        const cai = enrollResp.consumerAuthenticationInformation || {};
        log('challengeRequired: ' + cai.challengeRequired + ', stepUpUrl: ' + (cai.stepUpUrl || 'none'));

        if (cai.stepUpUrl && (cai.accessToken || cai.token)) {
          log('Step-up challenge required! Rendering challenge iframe...');
          const stepUpSec = document.getElementById('stepup-section');
          stepUpSec.style.display = 'block';
          const stepUpForm = document.getElementById('phase1-stepup-form');
          stepUpForm.action = cai.stepUpUrl;
          document.getElementById('phase1-stepup-jwt').value = cai.accessToken || cai.token;
          stepUpForm.submit();
          log('Step-up form submitted. Issuing bank OTP screen loading in iframe. Real OTP will arrive on phone.');
        } else if (cai.challengeRequired === 'N') {
          log('Frictionless pass! No OTP challenge required.');
        } else {
          log('Enrollment response evaluated. Review raw JSON output in section 4.');
        }

      } catch (err) {
        log('Error during test execution: ' + err.message);
        outEl.textContent = JSON.stringify({ error: err.message, stack: err.stack }, null, 2);
      } finally {
        runBtn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}