// PAYMENT METHOD MODULE: Unified Checkout — NOT YET IMPLEMENTED.
// Placeholder so the three-module structure is visible and ready to build
// into, without blocking on it. Wire this up the same way as paylink.js /
// microform.js once prioritized: a create-session function, a checkout
// page, and a webhook-shape handler.

export async function notImplemented() {
  return new Response(
    JSON.stringify({ error: "Unified Checkout module not yet implemented" }),
    { status: 501, headers: { "Content-Type": "application/json" } }
  );
}

export function renderCheckoutPage() {
  return new Response("Unified Checkout — coming soon", { status: 501 });
}
