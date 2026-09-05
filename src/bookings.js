// Shared across every payment method module — the Sheet doesn't care which
// payment product created or completed a booking.

export async function createBooking(env, { bookingId, items, total, amountDue, guest, status = "pending" }) {
  return postToSheet(env, {
    action: "create_booking",
    bookingId,
    items,
    total,
    amountDue,
    guest: guest || {},
    status,
    createdAt: new Date().toISOString(),
  });
}

export async function updateBookingStatus(env, { bookingId, status }) {
  return postToSheet(env, { action: "update_booking_status", bookingId, status });
}

async function postToSheet(env, body) {
  const resp = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.ok;
}
