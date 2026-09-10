// Shared across every payment method module — the Sheet doesn't care which
// payment product created or completed a booking.

export async function createBooking(env, { bookingId, items, total, amountDue, guest, status = "pending", paymentMethod }) {
  if (!guest || Object.keys(guest || {}).length === 0) {
    throw new Error("Guest information is required — booking cannot be created without contact details.");
  }
  return postToSheet(env, {
    action: "create_booking",
    bookingId,
    items,
    total,
    amountDue,
    guest: guest || {},
    status,
    paymentMethod,
    createdAt: new Date().toISOString(),
  });
}

export async function updateBookingStatus(env, { bookingId, status, guest, paymentMethod }) {
  console.log(`[updateBookingStatus] Sending to Sheet: bookingId=${bookingId}, status=${status}, guest=${JSON.stringify(guest)}, paymentMethod=${paymentMethod}`);
  return postToSheet(env, { action: "update_booking_status", bookingId, status, guest, paymentMethod });
}

export async function getBooking(env, bookingId) {
  const resp = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_booking", bookingId }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.booking;
}

async function postToSheet(env, body) {
  const resp = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.ok;
}