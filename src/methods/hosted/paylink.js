// PAYMENT METHOD MODULE: Pay by Link (POST /ipl/v2/payment-links/)
//
// Status: confirmed working on production — link creation verified, hosted
// payment page reaches full 3DS/OTP flow. This is the current default.

import { priceCart, computeDepositOptions } from "../../catalog.js";
import { cybersourceRequest } from "../../cybersource.js";
import { createBooking, updateBookingStatus } from "../../bookings.js";

export async function createLink(request, env) {
  const { skus, payAmount } = await request.json();
  const { items, total } = priceCart(skus);
  const { deposit, full } = computeDepositOptions(total);
  const amount = payAmount === "full" ? full : deposit;
  const bookingId = crypto.randomUUID();

  await createBooking(env, { bookingId, items, total, amountDue: amount });

  const result = await cybersourceRequest(env, "POST", "/ipl/v2/payment-links/", {
    processingInformation: { linkType: "PURCHASE" },
    purchaseInformation: { purchaseNumber: bookingId.replace(/-/g, "").slice(0, 20) },
    orderInformation: {
      amountDetails: { currency: env.CYBS_CURRENCY || "USD", totalAmount: String(amount) },
      lineItems: items.map((i) => ({ productName: i.name, unitPrice: String(i.price) })),
    },
  });

  if (!result.ok) {
    return json({ error: "Could not create payment link", detail: result.data }, 502);
  }

  return json({ bookingId, url: result.data.purchaseInformation?.paymentLink });
}

// Handles the webhook payload shape specific to Pay by Link. Called from
// the shared webhook dispatcher in worker.js once it recognizes this shape.
export async function handleWebhookEvent(payload, env) {
  const bookingId = payload?.purchaseInformation?.purchaseNumber;
  const status = payload?.status; // verify actual values against a real delivery
  if (bookingId && status) {
    await updateBookingStatus(env, { bookingId, status: status === "COMPLETED" ? "paid" : status });
  }
}

export function renderCheckoutPage(url) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Checkout</title></head>
<body>
  <h2>Your booking</h2>
  <div id="cart">Loading...</div>
  <div id="deposit-options" style="display:none">
    <label><input type="radio" name="pay" value="deposit" checked> Pay deposit: <span id="dep-amt"></span></label><br>
    <label><input type="radio" name="pay" value="full"> Pay in full: <span id="full-amt"></span></label>
  </div>
  <button id="continue-btn" disabled>Continue to payment</button>
  <div id="msg"></div>

  <script>
    const params = new URLSearchParams(location.search);
    const items = params.get('items') || '';
    let quote;

    fetch('/api/quote?items=' + encodeURIComponent(items))
      .then(r => r.json())
      .then(q => {
        quote = q;
        document.getElementById('cart').innerHTML =
          q.items.map(i => i.name + ' - ' + i.price).join('<br>') + '<br><b>Total: ' + q.total + '</b>';
        document.getElementById('dep-amt').textContent = q.deposits.deposit;
        document.getElementById('full-amt').textContent = q.deposits.full;
        document.getElementById('deposit-options').style.display = 'block';
        document.getElementById('continue-btn').disabled = false;
      });

    document.getElementById('continue-btn').addEventListener('click', () => {
      document.getElementById('continue-btn').disabled = true;
      document.getElementById('msg').textContent = 'Creating your payment link...';
      const payAmount = document.querySelector('input[name=pay]:checked').value;
      fetch('/api/paylink/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: items.split(','), payAmount })
      })
        .then(r => r.json())
        .then(res => {
          if (res.error || !res.url) {
            document.getElementById('msg').textContent = 'Could not start payment: ' + JSON.stringify(res.detail || res.error);
            document.getElementById('continue-btn').disabled = false;
            return;
          }
          location.href = res.url;
        });
    });
  </script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
