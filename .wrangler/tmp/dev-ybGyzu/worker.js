var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-Z6kOdW/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/catalog.js
var CATALOG = {
  "room-single": { name: "Single Room", price: 50, type: "room" },
  "room-double": { name: "Double Room", price: 70, type: "room" },
  "room-suite": { name: "Suite", price: 120, type: "room" },
  "act-hike": { name: "Guided Hike", price: 20, type: "activity" },
  "act-spa": { name: "Spa Session", price: 30, type: "activity" },
  "act-dinner": { name: "Private Dinner", price: 25, type: "activity" }
};
function priceCart(skus) {
  const items = [];
  let total = 0;
  for (const sku of skus) {
    const item = CATALOG[sku];
    if (!item) continue;
    items.push({ sku, name: item.name, price: item.price });
    total += item.price;
  }
  return { items, total: round2(total) };
}
__name(priceCart, "priceCart");
function computeDepositOptions(total) {
  let minDeposit;
  if (total <= 100) minDeposit = 10;
  else if (total <= 200) minDeposit = 20;
  else if (total <= 300) minDeposit = 30;
  else minDeposit = Math.round(total * 0.1);
  const pct10 = Math.max(minDeposit, round2(total * 0.1));
  return {
    deposit: round2(pct10),
    full: round2(total)
  };
}
__name(computeDepositOptions, "computeDepositOptions");
function round2(n) {
  return Math.round(n * 100) / 100;
}
__name(round2, "round2");

// src/cybersource.js
var HOSTS = {
  sandbox: "apitest.cybersource.com",
  production: "api.cybersource.com"
};
async function cybersourceRequest(env, method, path, bodyObj) {
  const host = HOSTS[env.CYBS_ENV] || HOSTS.sandbox;
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const date = (/* @__PURE__ */ new Date()).toUTCString();
  const digest = body ? `SHA-256=${await sha256Base64(body)}` : void 0;
  const requestTarget = `${method.toLowerCase()} ${path}`;
  const headerNames = digest ? ["host", "date", "(request-target)", "digest", "v-c-merchant-id"] : ["host", "date", "(request-target)", "v-c-merchant-id"];
  const lines = {
    host,
    date,
    "(request-target)": requestTarget,
    digest,
    "v-c-merchant-id": env.CYBS_MERCHANT_ID
  };
  const signingString = headerNames.map((h) => `${h}: ${lines[h]}`).join("\n");
  const signature = await hmacSha256Base64(env.CYBS_SHARED_SECRET, signingString);
  const signatureHeader = `keyid="${env.CYBS_KEY_ID}", algorithm="HmacSHA256", headers="${headerNames.join(" ")}", signature="${signature}"`;
  const headers = {
    Host: host,
    Date: date,
    "v-c-merchant-id": env.CYBS_MERCHANT_ID,
    Signature: signatureHeader,
    "Content-Type": "application/json"
  };
  if (digest) headers["Digest"] = digest;
  const resp = await fetch(`https://${host}${path}`, {
    method,
    headers,
    body: body || void 0
  });
  const text = await resp.text();
  let json2;
  try {
    json2 = JSON.parse(text);
  } catch {
    json2 = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, data: json2 };
}
__name(cybersourceRequest, "cybersourceRequest");
async function sha256Base64(str) {
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return arrayBufferToBase64(hash);
}
__name(sha256Base64, "sha256Base64");
async function hmacSha256Base64(secretBase64, message) {
  const keyBytes = base64ToArrayBuffer(secretBase64.trim());
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return arrayBufferToBase64(sig);
}
__name(hmacSha256Base64, "hmacSha256Base64");
function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
__name(arrayBufferToBase64, "arrayBufferToBase64");
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
__name(base64ToArrayBuffer, "base64ToArrayBuffer");

// src/worker.js
var worker_default = {
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
  }
};
function handleQuote(url) {
  const skus = (url.searchParams.get("items") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { items, total } = priceCart(skus);
  const deposits = computeDepositOptions(total);
  return json({ items, total, deposits });
}
__name(handleQuote, "handleQuote");
async function handleSession(request, env) {
  const { skus, payAmount, guest } = await request.json();
  const { items, total } = priceCart(skus);
  const { deposit, full } = computeDepositOptions(total);
  const amount = payAmount === "full" ? full : deposit;
  const bookingId = crypto.randomUUID();
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
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    })
  });
  const capture = await cybersourceRequest(env, "POST", "/microform/v2/sessions", {
    targetOrigins: [url_origin(request)],
    // targetOrigins: ["http://localhost:8787"],
    clientVersion: "v2",
    allowedCardNetworks: ["VISA", "MASTERCARD"],
    allowedPaymentTypes: ["CARD"]
  });
  if (!capture.ok) {
    return json({ error: "Could not start payment session", detail: capture.data }, 502);
  }
  const captureContext = capture.data.raw ?? capture.data;
  return json({ bookingId, amount, captureContext });
}
__name(handleSession, "handleSession");
async function handleCharge(request, env) {
  const { bookingId, transientToken, amount, currency = "USD" } = await request.json();
  const paymentPayload = {
    clientReferenceInformation: { code: bookingId },
    tokenInformation: { transientTokenJwt: transientToken },
    orderInformation: {
      amountDetails: { totalAmount: String(amount), currency }
    }
  };
  const result = await cybersourceRequest(env, "POST", "/pts/v2/payments", paymentPayload);
  if (!result.ok) {
    return json({ error: "Charge failed", detail: result.data }, 402);
  }
  return json({ status: "submitted", cybsResponse: result.data });
}
__name(handleCharge, "handleCharge");
async function handleWebhook(request, env) {
  const rawBody = await request.text();
  const valid = await verifyWebhookSignature(request, rawBody, env.CYBS_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", { status: 401 });
  const payload = JSON.parse(rawBody);
  const bookingId = payload?.clientReferenceInformation?.code;
  const status = payload?.transactionInformation?.status;
  if (bookingId && status) {
    await fetch(env.SHEET_WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_booking_status",
        bookingId,
        status: status === "AUTHORIZED" ? "paid" : "failed"
      })
    });
  }
  return new Response("ok");
}
__name(handleWebhook, "handleWebhook");
async function verifyWebhookSignature(request, rawBody, secretBase64) {
  const sigHeader = request.headers.get("v-c-signature");
  if (!sigHeader || !secretBase64) return false;
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
__name(verifyWebhookSignature, "verifyWebhookSignature");
function url_origin(request) {
  return new URL(request.url).origin;
}
__name(url_origin, "url_origin");
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json, "json");
function handleDebugEnv(env) {
  const keys = ["CYBS_MERCHANT_ID", "CYBS_KEY_ID", "CYBS_SHARED_SECRET", "CYBS_ENV", "SHEET_WEBAPP_URL"];
  const report = {};
  for (const k of keys) {
    const v = env[k];
    if (v === void 0) report[k] = "MISSING";
    else if (v === "") report[k] = "EMPTY_STRING";
    else report[k] = `OK (length=${v.length})`;
  }
  return json(report);
}
__name(handleDebugEnv, "handleDebugEnv");
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
  <div id="card-number" style="height:40px;border:1px solid #ccc;margin:8px 0"></div>
  <div id="security-code" style="height:40px;border:1px solid #ccc;margin:8px 0"></div>
  <button id="pay-btn" disabled>Pay</button>
  <div id="msg"></div>

  <script>
    const params = new URLSearchParams(location.search);
    const items = params.get('items') || '';
    let quote, sessionInfo, microform;

    // Microform v2 (PCI DSS 4.0.1) requires the library to be loaded
    // dynamically using clientLibrary/clientLibraryIntegrity decoded from
    // the capture-context JWT \u2014 never hardcode the script URL.
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
        const { clientLibrary, clientLibraryIntegrity } = ctx[0];

        return loadMicroformScript(clientLibrary, clientLibraryIntegrity).then(() => {
          const flex = new Flex(jwt);
          microform = flex.microform('card');
          microform.createField('number', { placeholder: 'Card number' }).load('#card-number');
          microform.createField('securityCode', { placeholder: 'CVV' }).load('#security-code');
          document.getElementById('pay-btn').disabled = false;
        });
      });

    document.getElementById('pay-btn').addEventListener('click', () => {
      const payAmount = document.querySelector('input[name=pay]:checked').value;
      const amount = payAmount === 'full' ? quote.deposits.full : quote.deposits.deposit;

      microform.createToken({}, (err, token) => {
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
            amount
          })
        })
          .then(r => r.json())
          .then(res => {
            document.getElementById('msg').textContent =
              res.error ? ('Payment failed: ' + JSON.stringify(res.detail)) : 'Payment submitted \u2014 confirming...';
          });
      });
    });
  <\/script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
__name(handleCheckoutPage, "handleCheckoutPage");

// C:/Users/kris0/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// C:/Users/kris0/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Z6kOdW/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// C:/Users/kris0/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Z6kOdW/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
