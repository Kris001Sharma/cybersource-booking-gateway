// Shared across every payment method module — the Sheet doesn't care which
// payment product created or completed a booking.

export async function createBooking(env, { bookingId, items, totalUsd, paidUsd = 0, remainingUsd, totalNpr, paidNpr = 0, remainingNpr, guest, status = "pending", paymentMethod, nights, adults, children }) {
  const normalizedGuest = {
    firstName: guest?.firstName?.trim() || "",
    lastName: guest?.lastName?.trim() || "",
    email: guest?.email?.trim() || "",
    phone: guest?.phone?.trim() || "",
    country: guest?.country?.trim() || "",
    notes: guest?.notes?.trim() || "",
  };
  return postToSheet(env, {
    action: "create_booking",
    bookingId,
    items,
    totalUsd,
    paidUsd,
    remainingUsd: remainingUsd ?? Math.max(0, Number(totalUsd) - Number(paidUsd)),
    totalNpr,
    paidNpr,
    remainingNpr: remainingNpr ?? Math.max(0, Number(totalNpr) - Number(paidNpr)),
    guest: normalizedGuest,
    status,
    paymentMethod,
    nights,
    adults,
    children,
    createdAt: new Date().toISOString(),
  });
}

export async function updateBookingStatus(env, { bookingId, status, guest, paymentMethod, errorMessage, paidUsd, paidNpr }) {
  console.log(`[updateBookingStatus] Sending to Sheet: bookingId=${bookingId}, status=${status}, paymentMethod=${paymentMethod}`);
  return postToSheet(env, { action: "update_booking_status", bookingId, status, guest, paymentMethod, errorMessage, paidUsd, paidNpr });
}

export async function updateBookingGuest(env, { bookingId, guest }) {
  return postToSheet(env, { action: "update_booking_guest", bookingId, guest });
}

export async function getBooking(env, bookingId) {
  const resp = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "get_booking", bookingId }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.ok === false ? null : data.booking;
}

async function postToSheet(env, body) {
  const resp = await fetch(env.SHEET_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.ok;
}
