/** Confirmation page — Phase 3 implementation */

import * as utils from "../client/utils.js";
import { injectThemeCSS } from "../client/theme.js";

export async function renderPage(url) {
  const params = new URLSearchParams(url.search);
  const bookingId = params.get("bookingId");
  const checkin = params.get("checkin");
  const checkout = params.get("checkout");

  // If no booking ID, show error
  if (!bookingId) {
    showError("Booking ID not found. Please check your email for booking details.");
    return;
  }

  // Fetch booking details
  let booking;
  try {
    booking = await fetchBooking(bookingId);
  } catch (error) {
    console.error("Failed to fetch booking:", error);
    showError("Failed to load booking details. Please try again.");
    return;
  }

  // Render confirmation page
  renderConfirmationPage(booking, checkin, checkout);
}

async function fetchBooking(bookingId) {
  const response = await fetch(`/api/booking?bookingId=${bookingId}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch booking");
  }
  return response.json();
}

function renderConfirmationPage(booking, checkin, checkout) {
  // Guard against empty or malformed booking data
  if (!booking || !booking.guest || !Array.isArray(booking.items) || booking.items.length === 0) {
    const html = `<div class="error-state"><h2>Booking Details Not Available</h2><p>We couldn't retrieve full booking details. Please use your booking reference (${checkin ? 'checkin: ' + checkin : ''}) to verify.</p><a href="/landing" class="back-link">Back to Home</a></div>`;
    document.body.innerHTML = html;
    applyDesignTokens();
    return;
  }
  const money = (value, currency = "USD") => `${currency} ${Number(value || 0).toFixed(2)}`;
  const guestName = [booking.guest.firstName, booking.guest.lastName].filter(Boolean).join(" ") || "Guest";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
  const itemName = (item) => item?.name || item?.title || item?.sku || "Booked item";
  const itemTotal = (item) => Number(item?.total ?? item?.price ?? 0);
  const itemQuantity = (item) => Number(item?.quantity || 1);
  // Prefer the persisted booking duration, with URL dates as a fallback.
  let nights = Number(booking.nights) || 0;
  if (checkin && checkout) {
    const checkinDate = new Date(checkin + "T00:00:00");
    const checkoutDate = new Date(checkout + "T00:00:00");
    nights = nights || Math.max(0, Math.round((checkoutDate - checkinDate) / (1000 * 60 * 60 * 24)));
  }

  // Format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Build page HTML
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmed - ${escapeHtml(guestName)}</title>

      <!-- Google Fonts -->
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">

      <style>
        ${injectThemeCSS()}

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'DM Sans', sans-serif;
          background: linear-gradient(135deg, var(--sand) 0%, var(--cream) 100%);
          min-height: 100vh;
          color: var(--text-primary);
          line-height: 1.6;
        }

        .confirmation-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 40px 20px;
        }

        .confirmation-card {
          background: var(--glass-white);
          backdrop-filter: var(--glass-blur);
          -webkit-backdrop-filter: var(--glass-blur);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--glass-shadow);
          overflow: hidden;
          animation: slideUp 0.5s ease;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .confirmation-header {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
          color: white;
          padding: 40px;
          text-align: center;
        }

        .confirmation-header h1 {
          font-family: 'DM Sans', sans-serif;
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .confirmation-header .subtitle {
          font-size: 1.125rem;
          opacity: 0.9;
        }

        .confirmation-content {
          padding: 40px;
        }

        .guest-name {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.5rem;
          color: var(--accent);
          margin: 20px 0;
          text-align: center;
        }

        .guest-contact {
          color: var(--text-secondary);
          text-align: center;
          font-size: 0.9rem;
          margin-top: -12px;
        }

        .booking-reference {
          background: var(--cream);
          border: 2px dashed var(--accent);
          border-radius: var(--radius-md);
          padding: 20px;
          margin: 20px 0;
          text-align: center;
        }

        .booking-reference label {
          display: block;
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .booking-reference .reference {
          font-family: 'Courier New', monospace;
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--accent);
          letter-spacing: 2px;
        }

        .dates-section {
          background: var(--cream);
          border-radius: var(--radius-md);
          padding: 20px;
          margin: 24px 0;
          text-align: center;
        }

        .dates-section .label {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .dates {
          font-size: 1.125rem;
          font-weight: 500;
        }

        .nights {
          color: var(--accent);
          font-weight: 600;
        }

        .items-summary {
          margin: 32px 0;
        }

        .items-summary h3 {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.25rem;
          margin-bottom: 16px;
          color: var(--text-primary);
        }

        .item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid var(--warm-gray);
        }

        .item:last-child {
          border-bottom: none;
        }

        .item-name {
          font-weight: 500;
        }

        .item-price {
          color: var(--text-secondary);
          font-weight: 500;
        }

        .item-meta {
          color: var(--text-muted);
          font-size: 0.82rem;
          margin-top: 2px;
        }

        .npr-total-row {
          color: var(--accent);
          font-weight: 600;
        }

        .total-section {
          background: linear-gradient(135deg, var(--cream) 0%, var(--sand) 100%);
          border-radius: var(--radius-md);
          padding: 20px;
          margin: 24px 0;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 1.125rem;
          margin-bottom: 8px;
        }

        .total-row.final {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--accent);
          border-top: 2px solid var(--accent);
          padding-top: 12px;
          margin-top: 12px;
        }

        .next-steps {
          margin: 32px 0;
          padding: 24px;
          background: var(--success-bg);
          border-radius: var(--radius-md);
          border-left: 4px solid var(--success);
        }

        .next-steps h3 {
          font-family: 'DM Sans', sans-serif;
          color: var(--success);
          margin-bottom: 12px;
        }

        .next-steps p {
          margin-bottom: 8px;
          line-height: 1.7;
        }

        .calendar-btn {
          background: var(--success);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: var(--radius-md);
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 16px;
          display: block;
          width: 100%;
          max-width: 300px;
          margin-left: auto;
          margin-right: auto;
        }

        .calendar-btn:hover {
          background: #2e6e4f;
          transform: translateY(-1px);
          box-shadow: var(--shadow-card);
        }

        .error-state {
          text-align: center;
          padding: 60px 20px;
          background: white;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          max-width: 600px;
          margin: 60px auto;
        }

        .error-state h2 {
          color: var(--error);
          margin-bottom: 16px;
        }

        .error-state p {
          margin-bottom: 24px;
          color: var(--text-secondary);
        }

        .back-link {
          display: inline-block;
          background: var(--accent);
          color: white;
          padding: 12px 24px;
          border-radius: var(--radius-md);
          text-decoration: none;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .back-link:hover {
          background: var(--accent-hover);
          transform: translateY(-1px);
        }

        .logo {
          text-align: center;
          margin-bottom: 24px;
        }

        .logo img {
          width: 60px;
          height: 60px;
          opacity: 0.8;
        }

        /* Responsive design */
        @media (max-width: 640px) {
          .confirmation-container {
            padding: 20px 16px;
          }

          .confirmation-header {
            padding: 30px 20px;
          }

          .confirmation-header h1 {
            font-size: 2rem;
          }

          .confirmation-content {
            padding: 24px;
          }

          .item {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
        }
      </style>
    </head>
    <body>
      <div class="confirmation-container">
        <div class="confirmation-card">
          <div class="confirmation-header">
            <div class="logo">
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14 8 10"></polyline>
              </svg>
            </div>
            <h1>Booking Confirmed!</h1>
            <div class="subtitle">Your reservation is secure and ready</div>
          </div>

          <div class="confirmation-content">
            <div class="guest-name">Thank you, ${escapeHtml(guestName)}</div>
            <div class="guest-contact">${escapeHtml(booking.guest.email || "")}${booking.guest.phone ? ` · ${escapeHtml(booking.guest.phone)}` : ""}</div>

            <div class="booking-reference">
              <label>Booking Reference</label>
              <div class="reference">${bookingId}</div>
            </div>

            ${checkin && checkout ? `
            <div class="dates-section">
              <div class="label">Your Stay</div>
              <div class="dates">
                ${formatDate(checkin)} • <span class="nights">${nights} nights</span> • ${formatDate(checkout)}
              </div>
            </div>
            ` : ''}

            <div class="items-summary">
              <h3>Booking Details</h3>
              ${booking.items.map(item => `
                <div class="item">
                  <div><div class="item-name">${escapeHtml(itemName(item))}</div><div class="item-meta">${itemQuantity(item)} ${itemQuantity(item) === 1 ? "guest" : "guests"}${item.nights ? ` · ${item.nights} nights` : ""}</div></div>
                  <div class="item-price">${money(itemTotal(item))}</div>
                </div>
              `).join('')}
            </div>

            <div class="total-section">
              <div class="total-row">
                <span>Subtotal</span>
                <span>${money(booking.totalUsd)}</span>
              </div>
              ${Number(booking.paidUsd) || Number(booking.totalNpr) ? `
                <div class="total-row">
                  <span>Paid now</span>
                  <span>${money(booking.paidUsd)}</span>
                </div>
                <div class="total-row">
                  <span>Remaining balance</span>
                  <span>${money(booking.remainingUsd)}</span>
                </div>
              ` : ''}
              <div class="total-row final">
                <span>Total booking value</span>
                <span>${money(booking.totalUsd)}</span>
              </div>
              <div class="total-row npr-total-row">
                <span>NPR paid</span>
                <span>${money(booking.paidNpr, "NPR")}</span>
              </div>
            </div>

            <div class="next-steps">
              <h3>Next Steps</h3>
              <p>✓ Your booking is confirmed and secured</p>
              <p>✓ Payment has been processed successfully</p>
              <p>✓ Save this page for your records</p>
              <p>✓ You'll need your booking reference for any changes</p>

              <button class="calendar-btn" onclick="downloadICalendar()">
                Add to Calendar
              </button>
            </div>
          </div>
        </div>
      </div>

      <script>
        // Download iCalendar file
        function downloadICalendar() {
          if (!checkin || !checkout) {
            alert('Calendar dates not available');
            return;
          }

          const events = [];

          // Create event for check-in
          const checkinDate = new Date(checkin + 'T00:00:00');
          const checkoutDate = new Date(checkout + 'T00:00:00');

          const event = {
            title: 'Your Booking at Sapana Village',
            description: 'Thank you for booking with us. Your reservation is confirmed.',
            location: 'Sapana Village, Nepal',
            start: checkinDate,
            end: checkoutDate,
            reminders: ['email', 'popup']
          };

          events.push(event);

          // Create iCalendar content
          let icalContent = 'BEGIN:VCALENDAR\r\n';
          icalContent += 'VERSION:2.0\r\n';
          icalContent += 'PRODID:-//Booking System//EN\r\n';
          icalContent += 'CALSCALE:GREGORIAN\r\n';

          events.forEach((event, index) => {
            const uid = 'booking-' + bookingId + '-' + index + '@booking-system.com';
            const startStr = event.start.toISOString().replace(/[-]/g, '').replace(/[:]/g, '').replace(/[.]/g, '');
            const endStr = event.end.toISOString().replace(/[-]/g, '').replace(/[:]/g, '').replace(/[.]/g, '');

            icalContent += 'BEGIN:VEVENT\r\n';
            icalContent += 'UID:' + uid + '\r\n';
            icalContent += 'DTSTART:' + startStr + '\r\n';
            icalContent += 'DTEND:' + endStr + '\r\n';
            icalContent += 'SUMMARY:' + event.title + '\r\n';
            icalContent += 'DESCRIPTION:' + event.description + '\r\n';
            icalContent += 'LOCATION:' + event.location + '\r\n';
            icalContent += 'BEGIN:VALARM\r\n';
            icalContent += 'TRIGGER:-PT15M\r\n';
            icalContent += 'DESCRIPTION:Reminder\r\n';
            icalContent += 'ACTION:DISPLAY\r\n';
            icalContent += 'END:VALARM\r\n';
            icalContent += 'END:VEVENT\r\n';
          });

          icalContent += 'END:VCALENDAR\r\n';

          // Download file
          const blob = new Blob([icalContent], { type: 'text/calendar' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'booking-' + bookingId + '.ics';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        // Add iCalendar utility function to global scope
        window.downloadICalendar = downloadICalendar;
      </script>
    </body>
    </html>
  `;

  document.body.innerHTML = html;

  // Apply design tokens if not already present
  if (!document.head.querySelector('style[data-design-tokens]')) {
    const style = document.createElement('style');
    style.setAttribute('data-design-tokens', 'true');
    style.textContent = injectThemeCSS();
    document.head.appendChild(style);
  }

  // Add Google Fonts if not already loaded
  if (!document.querySelector('link[href*="fonts.googleapis.com"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }
}

function showError(message) {
  const html = `
    <div class="error-state">
      <h2>Error</h2>
      <p>${message}</p>
      <a href="/landing" class="back-link">Back to Home</a>
    </div>
  `;
  document.body.innerHTML = html;
  applyDesignTokens();
}

function applyDesignTokens() {
  const style = document.createElement('style');
  style.textContent = injectThemeCSS();
  document.head.appendChild(style);
}

// Module export is already defined in the export statement above
