// Implements CyberSource's HTTP Signature auth scheme for the REST API
// using the shared-secret Key ID/Secret Key pair (not certificate auth).
// Reference: CyberSource REST API "HTTP Signature" authentication.
//
// NOTE: verify header names/host against your sandbox docs before relying
// on this in production — CyberSource has changed field names between API
// versions before (see community reports on Microform v2 capture-context
// mismatches). Test every call against the sandbox first.

const HOSTS = {
  sandbox: "apitest.cybersource.com",
  production: "api.cybersource.com",
};

export async function cybersourceRequest(env, method, path, bodyObj) {
  const host = HOSTS[env.CYBS_ENV] || HOSTS.sandbox;
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const date = new Date().toUTCString();
  const digest = body ? `SHA-256=${await sha256Base64(body)}` : undefined;

  const requestTarget = `${method.toLowerCase()} ${path}`;
  const headerNames = digest
    ? ["host", "date", "(request-target)", "digest", "v-c-merchant-id"]
    : ["host", "date", "(request-target)", "v-c-merchant-id"];

  const lines = {
    host,
    date,
    "(request-target)": requestTarget,
    digest,
    "v-c-merchant-id": env.CYBS_MERCHANT_ID,
  };

  const signingString = headerNames.map((h) => `${h}: ${lines[h]}`).join("\n");
  const signature = await hmacSha256Base64(env.CYBS_SHARED_SECRET, signingString);

  const signatureHeader =
    `keyid="${env.CYBS_KEY_ID}", algorithm="HmacSHA256", ` +
    `headers="${headerNames.join(" ")}", signature="${signature}"`;

  const headers = {
    Host: host,
    Date: date,
    "v-c-merchant-id": env.CYBS_MERCHANT_ID,
    Signature: signatureHeader,
    "Content-Type": "application/json",
  };
  if (digest) headers["Digest"] = digest;

  const resp = await fetch(`https://${host}${path}`, {
    method,
    headers,
    body: body || undefined,
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: resp.ok, status: resp.status, data: json };
}

async function sha256Base64(str) {
  const enc = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return arrayBufferToBase64(hash);
}

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

function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
