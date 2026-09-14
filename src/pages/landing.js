import { injectThemeCSS } from "../client/theme.js";
import { nightsBetween } from "../client/utils.js";
import { packages, activities, rooms } from "../config.js";

export function renderPage(url) {
  const metaScript = `
    // Embedded config — source of truth is src/config.js (replaced site-config.json)
    // Where to change: edit src/config.js packages, rooms, activities, theme.
    // Package recommendation: filter by pkg.nights <= selectedNights, sort by closest nights.
    // Accommodation recommendations: shown after packages; rooms filtered by guests.
    // Additional activities: shown when cart has only room SKUs (no package SKUs).
    let PACKAGES = {}; let ACTIVITIES = {}; let ROOMS = {};
    async function loadConfig() {
      // Direct embedded config (no external file fetch needed for deploy)
      PACKAGES = ${JSON.stringify(packages.reduce((m,p)=>{m[p.slug]=p;return m},{}))};
      ACTIVITIES = ${JSON.stringify(activities.reduce((m,a)=>{m[a.slug]=a;return m},{}))};
      ROOMS = ${JSON.stringify(rooms.reduce((m,r)=>{m[r.slug]=r;return m},{}))};
      document.documentElement.style.setProperty('--accent', '#b85c38');
      document.documentElement.style.setProperty('--accent-hover', '#a04e2e');
      document.title = 'Sapana Village — Book';
      const heroH1 = document.querySelector('.hero h1'); if (heroH1) heroH1.textContent = 'Sapana Village';
      const heroP = document.querySelector('.hero p'); if (heroP) heroP.textContent = 'A quiet retreat in the foothills — rooms, guided hikes, spa, and private dinners.';
      return;
    }
    (function initConfig() { loadConfig(); })();
  `;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sapana Village — Book</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
${injectThemeCSS()}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--cream); color: var(--text-primary); font-family: "Inter", system-ui, sans-serif; }
h1, h2, h3 { font-family: "Playfair Display", Georgia, serif; margin: 0; }
.container { max-width: 1120px; margin: 0 auto; padding: 32px 20px; }
.hero { text-align: center; padding: 60px 0 40px; }
.hero h1 { font-size: clamp(2.5rem, 6vw, 4rem); letter-spacing: -0.03em; line-height: 1.1; color: var(--text-primary); }
.hero p { font-size: 1.15rem; color: var(--text-secondary); margin-top: 10px; max-width: 520px; margin-left: auto; margin-right: auto; }
.date-row { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 28px; margin-bottom: 8px; }
.date-row input { padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--warm-gray); font-family: inherit; font-size: 0.95rem; background: var(--warm-white); color: var(--text-primary); min-width: 140px; }
.catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; margin-top: 36px; }
.catalog-grid .card { scroll-snap-align: start; flex: 0 0 300px; }
.card { background: var(--glass-white); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border: 1px solid var(--glass-border); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--glass-shadow); transition: transform 0.2s ease, box-shadow 0.2s ease; }
.card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(44,36,31,0.12); }
.card h3 { font-size: 1.35rem; margin-bottom: 6px; }
.card .theme-tag { display: inline-block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); font-weight: 600; margin-bottom: 8px; }
.card p { color: var(--text-secondary); font-size: 0.95rem; line-height: 1.55; margin-bottom: 12px; }
.card .includes { list-style: none; padding: 0; margin: 0 0 14px; }
.card .includes li { font-size: 0.88rem; color: var(--text-muted); padding: 2px 0; }
.card .includes li::before { content: "— "; color: var(--accent); }
.card .price-range { font-weight: 600; color: var(--text-primary); font-size: 1.05rem; margin-bottom: 14px; }
.card .img-placeholder { height: 120px; border-radius: var(--radius-md); background: linear-gradient(135deg, #e8ddd0 0%, #d6c9b6 100%); display: flex; align-items: center; justify-content: center; font-family: "Playfair Display", serif; font-size: 1.8rem; color: var(--text-secondary); opacity: 0.65; margin-bottom: 16px; }
.btn { display: inline-block; padding: 10px 20px; border-radius: 8px; background: var(--accent); color: #fff; text-decoration: none; font-size: 0.9rem; font-weight: 600; border: none; cursor: pointer; transition: all 0.25s ease, box-shadow 0.25s ease; }
.btn:hover { background: var(--accent-hover); box-shadow: 0 4px 16px rgba(184,92,56,0.25); transform: translateY(-2px); }
.btn-outline { background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 8px; transition: all 0.25s ease, box-shadow 0.25s ease; }
.btn-outline:hover { background: var(--accent-light); box-shadow: 0 4px 16px rgba(184,92,56,0.15); transform: translateY(-1px); }
.cart-footer { position: sticky; bottom: 0; background: rgba(250,247,242,0.92); backdrop-filter: blur(8px); border-top: 1px solid var(--warm-gray); padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; max-width: 1120px; margin: 40px auto 0; border-radius: var(--radius-md) var(--radius-md) 0 0; box-shadow: 0 -4px 20px rgba(0,0,0,0.03); }
.cart-footer .total { font-weight: 600; font-size: 1.05rem; }
.activity-section { margin-top: 60px; }
.activity-section h2 { font-size: 1.8rem; margin-bottom: 6px; }
.activity-section p.subtitle { color: var(--text-secondary); margin-bottom: 20px; }
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.card { animation: fadeInUp 0.35s ease both; }
.empty-state { color: var(--text-muted); font-style: italic; padding: 16px 0; animation: fadeInUp 0.4s ease; }
@media (max-width: 600px) {
  .catalog-grid { grid-template-columns: 1fr; }
  .cart-footer { flex-direction: column; gap: 10px; align-items: flex-start; }
}
</style>
</head>
<body>
<div class="container">
  <section class="hero" aria-label="Hero">
    <h1>Sapana Village</h1>
    <p>A quiet retreat in the foothills — rooms, guided hikes, spa, and private dinners.</p>
    <div class="booking-widget" id="booking-widget">
      <!-- Compact horizontal row: dates + guests -->
      <div style="display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;margin-top:24px;">
        <!-- Dates -->
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <button onclick="openCalendar('checkin')" id="btn-checkin" class="date-trigger" aria-label="Select check-in date" style="display:flex;align-items:center;gap:8px;padding:14px 24px;border-radius:var(--radius-lg);border:1.5px solid var(--glass-border);background:rgba(255,255,255,0.7);backdrop-filter:blur(12px);font-family:inherit;font-size:1rem;color:var(--text-primary);cursor:pointer;transition:all 0.2s;min-width:160px;box-shadow:0 2px 12px rgba(44,36,31,0.05);">
            <span style="font-size:1.1rem;">&#128197;</span>
            <span id="checkin-display" style="font-weight:500;">Check-in</span>
          </button>
          <span style="color:var(--accent);font-size:1.3rem;font-weight:300;">&#8594;</span>
          <button onclick="openCalendar('checkout')" id="btn-checkout" class="date-trigger" aria-label="Select check-out date" style="display:flex;align-items:center;gap:8px;padding:14px 24px;border-radius:var(--radius-lg);border:1.5px solid var(--glass-border);background:rgba(255,255,255,0.7);backdrop-filter:blur(12px);font-family:inherit;font-size:1rem;color:var(--text-primary);cursor:pointer;transition:all 0.2s;min-width:160px;box-shadow:0 2px 12px rgba(44,36,31,0.05);">
            <span style="font-size:1.1rem;">&#128197;</span>
            <span id="checkout-display" style="font-weight:500;">Check-out</span>
          </button>
        </div>

        <!-- Guests -->
        <div class="guest-picker" style="padding:16px 20px;background:rgba(255,255,255,0.55);backdrop-filter:blur(12px);border:1px solid var(--glass-border);border-radius:var(--radius-lg);box-shadow:0 4px 20px rgba(44,36,31,0.06);display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
          <h4 style="font-family:'Playfair Display',Georgia,serif;font-size:1rem;margin:0;color:var(--text-primary);">Guests</h4>
          <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:10px;">
              <button onclick="updateGuests('adults', -1)" aria-label="Decrease adults" style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:1.2rem;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:all 0.15s;">&#8722;</button>
              <div style="text-align:center;min-width:48px;"><span id="guest-adults-display" style="font-size:1.1rem;font-weight:600;color:var(--text-primary);display:block;">2</span><span style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em;">Adults</span></div>
              <button onclick="updateGuests('adults', 1)" aria-label="Increase adults" style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:1.2rem;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:all 0.15s;">+</button>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <button onclick="updateGuests('children', -1)" aria-label="Decrease children" style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:1.2rem;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:all 0.15s;">&#8722;</button>
              <div style="text-align:center;min-width:48px;"><span id="guest-children-display" style="font-size:1.1rem;font-weight:600;color:var(--text-primary);display:block;">0</span><span style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em;">Children</span></div>
              <button onclick="updateGuests('children', 1)" aria-label="Increase children" style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--accent);background:transparent;color:var(--accent);font-size:1.2rem;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:all 0.15s;">+</button>
            </div>
          </div>
        </div>
      </div>
      <div id="night-count-row" style="text-align:center;margin-top:14px;font-size:0.95rem;color:var(--text-secondary);font-weight:500;min-height:24px;"></div>

      <div id="calendar-overlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(44,36,31,0.35);backdrop-filter:blur(4px);z-index:100;align-items:center;justify-content:center;padding:20px;animation:fadeInUp 0.25s ease;">
        <div style="background:var(--warm-white);border-radius:20px;box-shadow:0 24px 60px rgba(44,36,31,0.25);max-width:480px;width:100%;padding:28px;position:relative;border:1px solid var(--glass-border);">
          <button onclick="closeCalendar()" aria-label="Close calendar" style="position:absolute;top:16px;right:16px;background:transparent;border:none;font-size:1.3rem;color:var(--text-muted);cursor:pointer;padding:4px;line-height:1;">&#215;</button>
          <h3 style="font-family:'Playfair Display',Georgia,serif;font-size:1.5rem;margin-bottom:4px;color:var(--text-primary);">Select Dates</h3>
          <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:20px;">Choose your stay. Past dates are unavailable.</p>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <button onclick="changeMonth(-1)" aria-label="Previous month" style="background:transparent;border:none;color:var(--accent);font-size:1.1rem;padding:6px 10px;border-radius:50%;cursor:pointer;">&#10094;</button>
            <span id="calendar-month-label" style="font-weight:600;font-size:1.05rem;color:var(--text-primary);letter-spacing:0.02em;"></span>
            <button onclick="changeMonth(1)" aria-label="Next month" style="background:transparent;border:none;color:var(--accent);font-size:1.1rem;padding:6px 10px;border-radius:50%;cursor:pointer;">&#10095;</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:0.75rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">
            <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
          </div>
          <div id="calendar-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;"></div>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--warm-gray);display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:0.85rem;color:var(--text-secondary);"><span id="cal-selection-label" style="font-weight:500;color:var(--text-primary);">Select check-in</span></div>
            <button onclick="clearSelection()" style="background:transparent;border:none;color:var(--accent);font-size:0.85rem;font-weight:600;cursor:pointer;">Clear</button>
          </div>
        </div>
      </div>

  </section>

  <!-- Our Signature Packages -->
  <section aria-label="Signature Packages" style="margin-top: 36px;">
    <h2>Our Signature Packages</h2>
    <p style="color:var(--text-secondary);margin-bottom:20px;">Handpicked retreats designed for rest, renewal, and connection.</p>
    <div id="signature-grid" class="catalog-grid" style="grid-template-columns: repeat(3, 1fr);"></div>
  </section>

  <section aria-label="Packages" style="margin-top: 60px;">
    <h2>Packages</h2>
    <div style="position:relative;">
      <button onclick="scrollCarousel(-1)" aria-label="Previous packages" style="position:absolute;left:-16px;top:50%;transform:translateY(-50%);z-index:10;background:var(--glass-white);backdrop-filter:blur(8px);border:1px solid var(--glass-border);border-radius:50%;width:40px;height:40px;cursor:pointer;box-shadow:var(--glass-shadow);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--accent);">&#10094;</button>
      <button onclick="scrollCarousel(1)" aria-label="Next packages" style="position:absolute;right:-16px;top:50%;transform:translateY(-50%);z-index:10;background:var(--glass-white);backdrop-filter:blur(8px);border:1px solid var(--glass-border);border-radius:50%;width:40px;height:40px;cursor:pointer;box-shadow:var(--glass-shadow);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--accent);">&#10095;</button>
      <div id="packages-grid" class="catalog-grid" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:24px;padding:4px 4px 12px;scrollbar-width:none;-ms-overflow-style:none;"></div>
    </div>
  </section>

  <section aria-label="Accommodations" style="margin-top: 60px;">
    <h2>Accommodations</h2>
    <p style="color:var(--text-secondary);margin-bottom:20px;">All room types available at Sapana Village.</p>
    <div id="rooms-grid" class="catalog-grid"></div>
  </section>

  <section class="activity-section" aria-label="Activities">
    <h2>À la carte activities</h2>
    <p class="subtitle">Add individual experiences — durations shown for display only. The base SKU is used for pricing.</p>
    <div id="activities-grid" class="catalog-grid"></div>
  </section>

  <div class="cart-footer" id="cart-footer" style="display:none;">
    <div>
      <div id="cart-items-list" style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4; margin-bottom:4px;"></div>
      <div><span id="cart-items-label">0 items</span> <span style="margin-left:8px; color:var(--text-muted);">·</span> <span style="margin-left:8px;" id="cart-total">$0</span></div>
    </div>
    <div style="display:flex; gap:8px; align-items:center;">
      <a href="#" class="btn" onclick="clearCart(event)" style="font-size:0.8rem; padding:6px 12px;">Clear</a>
      <a href="#" class="btn" onclick="goCheckout(event)">Checkout</a>
    </div>
  </div>
</div>

<script>
  ${metaScript}
  // Calendar selection state (must be declared before functions that use it)
  let calendarMode = 'checkin';
  let selectedCheckin = '';
  let selectedCheckout = '';
  let currentCalendarMonth = new Date();
  let guests = { adults: 2, children: 0 };
  function nightsBetween(checkin, checkout) {
    const d1 = new Date(checkin + "T00:00:00");
    const d2 = new Date(checkout + "T00:00:00");
    const diff = (d2 - d1) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.round(diff));
  }
  function isPastDate(dateStr) {
    if (!dateStr) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(dateStr + "T00:00:00");
    return d < today;
  }
  function isCheckoutAfterCheckin(checkin, checkout) {
    if (!checkin || !checkout) return true;
    return new Date(checkout + "T00:00:00") > new Date(checkin + "T00:00:00");
  }
  function showDateError(msg) {
    let el = document.getElementById('date-error');
    if (!el) { el = document.createElement('div'); el.id = 'date-error'; el.style.cssText = 'color: var(--error); font-size: 0.85rem; text-align: center; margin-top: 8px; font-weight: 500;'; document.querySelector('.date-triggers').after(el); }
    el.textContent = msg;
  }
  function clearDateError() {
    const el = document.getElementById('date-error'); if (el) el.textContent = '';
  }
  function renderPackages() {
    const grid = document.getElementById("packages-grid"); grid.innerHTML = "";
    const nights = selectedCheckin && selectedCheckout ? nightsBetween(selectedCheckin, selectedCheckout) : 0;
    const checkinVal = selectedCheckin || '';
    const checkoutVal = selectedCheckout || '';
    const selectedNights = nights;
    // Package recommendation: filter by nights <= selectedNights, sort by closest nights (ascending difference)
    const allPkgs = Object.entries(PACKAGES);
    const filteredPackages = selectedNights > 0
      ? allPkgs.filter(([k, pkg]) => pkg.nights <= selectedNights)
          .sort((a, b) => Math.abs(a[1].nights - selectedNights) - Math.abs(b[1].nights - selectedNights))
      : allPkgs;
    if (filteredPackages.length === 0 && selectedNights > 0) {
      grid.innerHTML = '<div class="empty-state">No packages available for these dates — try adjusting your stay.</div>';
      return;
    }
    for (const [key, pkg] of filteredPackages) {
      const card = document.createElement("div");
      card.className = "card";
      const includesHtml = pkg.includes.map(i => '<li>' + i + '</li>').join('');
      const imgUrl = pkg.imageUrl || pkg.image || '';
      const imgDisplay = imgUrl ? '<img src="' + imgUrl + '" alt="' + pkg.name + '" style="width:100%;height:120px;object-fit:cover;border-radius:var(--radius-md);margin-bottom:16px;">' : '<div class="img-placeholder">' + (pkg.theme || pkg.name || 'Image') + '</div>';
      const nightsText = selectedNights > 0 ? (' — ' + selectedNights + ' night' + (selectedNights > 1 ? 's' : '')) : '';
      const featuredBadge = pkg.featured ? '<span style="display:inline-block;background:var(--accent);color:#fff;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;padding:3px 8px;border-radius:var(--radius-sm);margin-bottom:8px;font-weight:600;">Most Popular</span>' : '';
      card.innerHTML = imgDisplay +
        '<div>' + featuredBadge + '<div class="theme-tag">' + pkg.theme + '</div></div>' +
        '<h3>' + pkg.name + '</h3>' +
        '<p>' + pkg.description + '</p>' +
        '<ul class="includes">' + includesHtml + '</ul>';
      const priceDiv = document.createElement('div');
      priceDiv.style.cssText = 'margin-bottom:14px;';
        const priceLabel = document.createElement('div');
        priceLabel.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;';
        priceLabel.textContent = 'Pricing options';
        priceDiv.appendChild(priceLabel);
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        const fbBtn = document.createElement('button');
        fbBtn.className = 'btn';
        fbBtn.style.cssText = 'width:100%;border-radius:8px;padding:8px 14px;font-size:0.85rem;background:var(--accent);opacity:1;';
        fbBtn.textContent = 'Full Board ' + pkg.fullBoard;
        fbBtn.addEventListener('click', () => selectPricing(fbBtn, pkg.fullBoard, pkg.bb));
        const bbBtn = document.createElement('button');
        bbBtn.className = 'btn';
        bbBtn.style.cssText = 'width:100%;border-radius:8px;padding:8px 14px;font-size:0.85rem;background:rgba(255,255,255,0.35);color:var(--text-muted);border:1px solid var(--glass-border);opacity:0.55;';
        bbBtn.textContent = 'B&B ' + pkg.bb;
        bbBtn.addEventListener('click', () => selectPricing(bbBtn, pkg.fullBoard, pkg.bb));
        btnWrap.appendChild(fbBtn);
        btnWrap.appendChild(bbBtn);
        priceDiv.appendChild(btnWrap);
        card.appendChild(priceDiv);
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Add package';
      btn.addEventListener('click', () => addPackage(key));
      card.appendChild(btn);
      grid.appendChild(card);
    }
  }
  function getIncludedSkus() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("items") || "";
    return raw.split(",").map(s => s.trim()).filter(Boolean);
  }
  function getSuggestedAddOns() {
    const included = getIncludedSkus();
    const includedActivities = included.filter(s => ACTIVITIES[s]);
    const allActivityKeys = Object.keys(ACTIVITIES);
    const notIncluded = allActivityKeys.filter(k => !includedActivities.includes(k));
    // Suggest up to 2 additional activities not already in cart
    return notIncluded.slice(0, 2);
  }
  function renderAddOns() {
    // Hide suggested add-ons until dates or a room type is selected
    const datesSelected = selectedCheckin && selectedCheckout;
    const roomsSelected = getCart().some(s => s.startsWith('room-'));
    let container = document.getElementById('add-on-section');
    if (!datesSelected && !roomsSelected) {
      if (container) container.style.display = 'none';
      return;
    }
    if (container) container.style.display = '';
    const suggestions = getSuggestedAddOns();
    if (!container) {
      container = document.createElement('section');
      container.id = 'add-on-section';
      container.className = 'activity-section';
      container.innerHTML = '<h2>Suggested Add-Ons</h2><p class="subtitle">Based on your selection, these experiences pair well with your stay.</p><div id="add-on-grid" class="catalog-grid"></div>';
      const footer = document.getElementById('cart-footer');
      if (footer && footer.parentElement) footer.parentElement.insertBefore(container, footer);
    }
    const grid = document.getElementById('add-on-grid'); grid.innerHTML = '';
    if (!suggestions.length) {
      grid.innerHTML = '<div class="empty-state">No suggestions right now — add more packages to see recommendations.</div>';
      return;
    }
    for (const key of suggestions) {
      const act = ACTIVITIES[key];
      if (!act) continue;
      const card = document.createElement('div');
      card.className = 'card';
      const variantsHtml = act.durations.map(v => '<span style="display:inline-block;padding:4px 8px;background:var(--warm-gray);border-radius:var(--radius-sm);margin-right:6px;font-size:0.8rem;font-weight:500;">' + v.label + '</span>').join('');
      const actImgUrl = act.imageUrl || act.image || '';
      const actImgDisplay = actImgUrl ? '<img src="' + actImgUrl + '" alt="' + act.name + '" style="width:100%;height:120px;object-fit:cover;border-radius:var(--radius-md);margin-bottom:16px;">' : '<div class="img-placeholder">' + (act.name || 'Image') + '</div>';
      card.innerHTML = actImgDisplay + '<h3>' + act.name + '</h3><div style="margin-bottom:10px;">' + variantsHtml + '</div>';
      const btn2 = document.createElement('button');
      btn2.className = 'btn btn-outline';
      btn2.textContent = 'Add activity';
      btn2.addEventListener('click', () => addActivity(key));
      card.appendChild(btn2);
      grid.appendChild(card);
    }
  }
  function selectPricing(btn, fb, bb) {
    const parent = btn.parentElement;
    const buttons = parent.querySelectorAll('button');
    buttons.forEach(b => { b.style.opacity = '0.55'; b.style.background = 'rgba(255,255,255,0.35)'; b.style.color = 'var(--text-muted)'; b.style.border = '1px solid var(--glass-border)'; });
    btn.style.opacity = '1'; btn.style.background = 'var(--accent)'; btn.style.color = '#fff'; btn.style.border = 'none';
    btn.textContent = 'Full Board ' + fb;
    const other = Array.from(buttons).find(b => b !== btn);
    if (other) other.textContent = 'B&B ' + bb;
  }
  function scrollCarousel(dir) {
    const grid = document.getElementById('packages-grid');
    const scrollAmount = 340;
    grid.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
    // Loop from end to start
    setTimeout(() => {
      if (dir > 0 && grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 5) {
        grid.scrollTo({ left: 0, behavior: 'smooth' });
      } else if (dir < 0 && grid.scrollLeft <= 5) {
        grid.scrollTo({ left: grid.scrollWidth - grid.clientWidth, behavior: 'smooth' });
      }
    }, 350);
  }
  // Auto-rotate carousel with pause on interaction
  let carouselInterval = null;
  function startCarousel() {
    if (carouselInterval) return;
    carouselInterval = setInterval(() => scrollCarousel(1), 5000);
  }
  function stopCarousel() { clearInterval(carouselInterval); carouselInterval = null; }
  document.getElementById('packages-grid').addEventListener('mouseenter', stopCarousel);
  document.getElementById('packages-grid').addEventListener('mouseleave', startCarousel);
  document.getElementById('packages-grid').addEventListener('click', () => { stopCarousel(); setTimeout(startCarousel, 3000); });
  // Suppress known external script errors (e.g. browser extension / analytics)
  window.addEventListener('error', function(e) {
    const msg = (e && e.message) ? e.message : '';
    if (msg.includes('2VM2070') || msg.includes('startTime')) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
  });
  async function addPackage(key) {
    const pkg = PACKAGES[key];
    if (!pkg) return;
    const current = new URLSearchParams(window.location.search).get("items") || "";
    const items = current ? current.split(",").filter(Boolean) : [];
    const newItems = [...items, ...pkg.skus.filter(s => !items.includes(s))];
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    params.set("items", newItems.join(","));
    url.search = params.toString();
    window.history.replaceState({}, "", url.toString());
    await updateCartUI();
  }
  async function addActivity(key) {
    const current = new URLSearchParams(window.location.search).get("items") || "";
    const items = current ? current.split(",").filter(Boolean) : [];
    if (!items.includes(key)) items.push(key);
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    params.set("items", items.join(","));
    url.search = params.toString();
    window.history.replaceState({}, "", url.toString());
    await updateCartUI();
  }
  function getCart() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("items") || "";
    const skus = raw.split(",").map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    return skus.filter(s => { if (seen.has(s)) return false; seen.add(s); return true; });
  }
  function setCart(skus) {
    const params = new URLSearchParams(window.location.search);
    if (skus.length) params.set("items", skus.join(","));
    else params.delete("items");
    const url = new URL(window.location.href);
    url.search = params.toString();
    window.history.replaceState({}, "", url.toString());
    return skus;
  }
  async function updateCartUI() {
    const params = new URLSearchParams(window.location.search);
    const itemsStr = params.get("items") || "";
    const skus = itemsStr.split(",").map(s=>s.trim()).filter(Boolean);
    const footer = document.getElementById("cart-footer");
    if (!skus.length) { footer.style.display = "none"; return; }
    footer.style.display = "flex";
    document.getElementById("cart-items-label").textContent = skus.length + " item" + (skus.length > 1 ? "s" : "");
    const listEl = document.getElementById("cart-items-list");
    try {
      const resp = await fetch('/api/quote?items=' + encodeURIComponent(skus.join(',')));
      const data = await resp.json();
      document.getElementById("cart-total").textContent = "$" + data.total;
      listEl.innerHTML = data.items.map(item => {
        const label = item.name || item.sku;
        return '<span style="display:inline-block; background:var(--accent-light); padding:2px 6px; border-radius:var(--radius-sm); margin-right:4px; font-size:0.8rem;" data-sku="' + item.sku + '" class="cart-item">' + label + ' <a href="#" style="color:var(--error); text-decoration:none; font-weight:bold; margin-left:4px;">×</a></span>';
      }).join('');
      // Attach removal listeners after render
      listEl.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const sku = link.closest('.cart-item').getAttribute('data-sku');
          removeItem(sku);
        });
      });
    } catch (e) {
      document.getElementById("cart-total").textContent = "—";
      listEl.innerHTML = skus.map(s => '<span>' + s + '</span>').join(' ');
    }
  }
  async function clearCart(e) {
    if (e) e.preventDefault();
    setCart([]);
    await updateCartUI();
  }
  async function removeItem(sku, e) {
    if (e) e.preventDefault();
    const current = getCart();
    setCart(current.filter(s => s !== sku));
    await updateCartUI();
  }
  function goCheckout(e) {
    e.preventDefault();
    const itemsStr = new URLSearchParams(window.location.search).get("items") || "";
    if (!itemsStr) { alert("Your cart is empty — pick a package or activity first."); return; }
    if (selectedCheckin && isPastDate(selectedCheckin)) { showDateError("Check-in date cannot be in the past."); return; }
    if (selectedCheckin && selectedCheckout && !isCheckoutAfterCheckin(selectedCheckin, selectedCheckout)) { showDateError("Check-out must be after check-in."); return; }
    const url = new URL(window.location.href);
    url.search = "items=" + encodeURIComponent(itemsStr);
    if (selectedCheckin) url.search += "&checkin=" + selectedCheckin;
    if (selectedCheckout) url.search += "&checkout=" + selectedCheckout;
    window.location.href = "/checkout?" + url.search.slice(1);
  }
  // Calendar-based event handling
  document.getElementById('btn-checkin').addEventListener('click', () => openCalendar('checkin'));
  document.getElementById('btn-checkout').addEventListener('click', () => openCalendar('checkout'));

  // Parameterized landing entry point (?package= support from addendum)
  (function handlePackageParam() {
    const params = new URLSearchParams(window.location.search);
    const pkgSlug = params.get('package');
    if (!pkgSlug) return;
    const pkg = PACKAGES[pkgSlug];
    if (!pkg) return; // invalid slug � fail silently, no error
    // Pre-fill dates if present
    const checkin = params.get('checkin') || '';
    const checkout = params.get('checkout') || '';
    if (checkin) { selectedCheckin = checkin; document.getElementById('checkin-display').textContent = formatDisplayDate(checkin); }
    if (checkout) { selectedCheckout = checkout; document.getElementById('checkout-display').textContent = formatDisplayDate(checkout); }
    // Highlight package card and scroll to it after render
    setTimeout(() => {
      const cards = document.querySelectorAll('.catalog-grid .card');
      for (const card of cards) {
        const btn = card.querySelector('button');
        if (btn && btn.textContent.includes('Add package')) {
          // Check if this card's heading matches our package name
          const heading = card.querySelector('h3');
          if (heading && heading.textContent === pkg.name) {
            card.style.outline = '3px solid var(--accent)';
            card.style.borderRadius = 'var(--radius-lg)';
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
    }, 50);
  })();

  // Calendar functions
  function openCalendar(mode) {
    calendarMode = mode;
    document.getElementById('calendar-overlay').style.display = 'flex';
    document.getElementById('cal-selection-label').textContent = mode === 'checkin' ? 'Select check-in' : 'Select check-out';
    currentCalendarMonth = new Date();
    renderCalendarGrid();
  }
  function closeCalendar() {
    document.getElementById('calendar-overlay').style.display = 'none';
  }
  function changeMonth(dir) {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + dir);
    renderCalendarGrid();
  }
  function renderCalendarGrid() {
    const grid = document.getElementById('calendar-grid');
    const label = document.getElementById('calendar-month-label');
    grid.innerHTML = '';
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    label.textContent = monthNames[month] + ' ' + year;
    const today = new Date(); today.setHours(0,0,0,0);
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);
    for (let i = 0; i < startOffset; i++) { const empty = document.createElement('div'); grid.appendChild(empty); }
    for (let d = 1; d <= daysInMonth; d++) {
      const btn = document.createElement('button');
      btn.textContent = d;
      btn.style.cssText = 'border:none;background:transparent;padding:8px;border-radius:50%;cursor:pointer;font-family:inherit;font-size:0.9rem;color:var(--text-primary);transition:all 0.15s;';
      const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const dateObj = new Date(dateStr + 'T00:00:00');
      if (dateObj < today) {
        btn.style.color = 'var(--text-muted)'; btn.style.cursor = 'default'; btn.disabled = true; btn.onclick = null;
      } else {
        const isCheckin = selectedCheckin === dateStr;
        const isCheckout = selectedCheckout === dateStr;
        if (isCheckin || isCheckout) {
          btn.style.background = 'var(--accent)'; btn.style.color = '#fff'; btn.style.fontWeight = '600'; btn.style.boxShadow = '0 2px 8px rgba(184,92,56,0.3)';
        } else {
          btn.onmouseover = () => { btn.style.background = 'var(--accent-light)'; };
          btn.onmouseout = () => { btn.style.background = 'transparent'; };
          btn.onclick = () => selectCalendarDate(dateStr);
        }
      }
      grid.appendChild(btn);
    }
  }
  function selectCalendarDate(dateStr) {
    if (calendarMode === 'checkin') {
      selectedCheckin = dateStr; selectedCheckout = '';
      calendarMode = 'checkout';
      document.getElementById('cal-selection-label').textContent = 'Select check-out';
      document.getElementById('checkin-display').textContent = formatDisplayDate(dateStr);
    } else {
      if (selectedCheckin && new Date(dateStr + 'T00:00:00') <= new Date(selectedCheckin + 'T00:00:00')) {
        selectedCheckin = dateStr; selectedCheckout = '';
        calendarMode = 'checkout';
        document.getElementById('cal-selection-label').textContent = 'Select check-out';
        document.getElementById('checkin-display').textContent = formatDisplayDate(dateStr);
      } else {
        selectedCheckout = dateStr; calendarMode = 'checkin';
        document.getElementById('cal-selection-label').textContent = 'Select check-in';
        document.getElementById('checkout-display').textContent = formatDisplayDate(dateStr);
        closeCalendar(); updateBookingUI();
      }
    }
    renderCalendarGrid();
  }
  function formatDisplayDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }
  function clearSelection() {
    selectedCheckin = ''; selectedCheckout = '';
    document.getElementById('checkin-display').textContent = 'Check-in';
    document.getElementById('checkout-display').textContent = 'Check-out';
    document.getElementById('night-count-row').textContent = '';
    document.getElementById('cal-selection-label').textContent = 'Select check-in';
    calendarMode = 'checkin'; renderCalendarGrid(); updateBookingUI();
  }
  function updateBookingUI() {
    const nights = selectedCheckin && selectedCheckout ? nightsBetween(selectedCheckin, selectedCheckout) : 0;
    const nightRow = document.getElementById('night-count-row');
    nightRow.textContent = nights > 0 ? nights + ' night' + (nights > 1 ? 's' : '') + ' selected' : '';
    renderPackages();
    renderRooms();
  }
  function updateGuests(type, delta) {
    const val = guests[type] + delta;
    if (type === 'adults' && val >= 1 && val <= 10) guests[type] = val;
    if (type === 'children' && val >= 0 && val <= 5) guests[type] = val;
    document.getElementById('guest-adults-display').textContent = guests.adults;
    document.getElementById('guest-children-display').textContent = guests.children;
    renderRooms();
  }
  function renderRooms() {
    const grid = document.getElementById('rooms-grid'); if (!grid) return; grid.innerHTML = '';
    const roomEntries = Object.entries(ROOMS || {});
    // Show all room types
    const displayRooms = roomEntries;
    for (const [key, r] of displayRooms) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<h3>' + r.name + '</h3><p>' + (r.description || '') + '</p><div style="margin-bottom:10px;font-size:0.85rem;color:var(--text-muted);">Capacity: ' + r.capacity + '</div><div class="price-range">$' + r.pricePerNight + ' / night</div>';
      const btn = document.createElement('button');
      btn.className = 'btn btn-outline';
      btn.textContent = 'Add room';
      btn.addEventListener('click', () => addRoom(key));
      card.appendChild(btn);
      grid.appendChild(card);
    }
  }
  async function addRoom(key) {
    const current = new URLSearchParams(window.location.search).get('items') || '';
    const items = current ? current.split(',').filter(Boolean) : [];
    if (!items.includes(key)) items.push(key);
    const url = new URL(window.location.href);
    url.search = 'items=' + encodeURIComponent(items.join(','));
    window.history.replaceState({}, '', url.toString());
    await updateCartUI();
    renderRooms();
  }
  function renderSignaturePackages() {
    const grid = document.getElementById('signature-grid'); if (!grid) return; grid.innerHTML = '';
    const featuredPkgs = Object.entries(PACKAGES).filter(([k, pkg]) => pkg.featured).slice(0, 3);
    for (const [key, pkg] of featuredPkgs) {
      const card = document.createElement('div');
      card.className = 'card';
      const includesHtml = pkg.includes.map(i => '<li>' + i + '</li>').join('');
      const imgUrl = pkg.imageUrl || pkg.image || '';
      const imgDisplay = imgUrl ? '<img src="' + imgUrl + '" alt="' + pkg.name + '" style="width:100%;height:120px;object-fit:cover;border-radius:var(--radius-md);margin-bottom:16px;">' : '<div class="img-placeholder">' + (pkg.theme || pkg.name || 'Image') + '</div>';
      const featuredBadge = '<span style="display:inline-block;background:var(--accent);color:#fff;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;padding:3px 8px;border-radius:var(--radius-sm);margin-bottom:8px;font-weight:600;">Most Popular</span>';
      card.innerHTML = imgDisplay +
        '<div>' + featuredBadge + '<div class="theme-tag">' + pkg.theme + '</div></div>' +
        '<h3>' + pkg.name + '</h3>' +
        '<p>' + pkg.description + '</p>' +
        '<ul class="includes">' + includesHtml + '</ul>';
      const priceDiv = document.createElement('div');
      priceDiv.style.cssText = 'margin-bottom:14px;';
        const priceLabel = document.createElement('div');
        priceLabel.style.cssText = 'font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;';
        priceLabel.textContent = 'Pricing options';
        priceDiv.appendChild(priceLabel);
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
        const fbBtn = document.createElement('button');
        fbBtn.className = 'btn';
        fbBtn.style.cssText = 'width:100%;border-radius:8px;padding:8px 14px;font-size:0.85rem;background:var(--accent);opacity:1;';
        fbBtn.textContent = 'Full Board ' + pkg.fullBoard;
        fbBtn.addEventListener('click', () => selectPricing(fbBtn, pkg.fullBoard, pkg.bb));
        const bbBtn = document.createElement('button');
        bbBtn.className = 'btn';
        bbBtn.style.cssText = 'width:100%;border-radius:8px;padding:8px 14px;font-size:0.85rem;background:rgba(255,255,255,0.35);color:var(--text-muted);border:1px solid var(--glass-border);opacity:0.55;';
        bbBtn.textContent = 'B&B ' + pkg.bb;
        bbBtn.addEventListener('click', () => selectPricing(bbBtn, pkg.fullBoard, pkg.bb));
        btnWrap.appendChild(fbBtn);
        btnWrap.appendChild(bbBtn);
        priceDiv.appendChild(btnWrap);
        card.appendChild(priceDiv);
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Add package';
      btn.addEventListener('click', () => addPackage(key));
      card.appendChild(btn);
      grid.appendChild(card);
    }
  }
  function renderActivities() {
    const grid = document.getElementById('activities-grid'); if (!grid) return; grid.innerHTML = '';
    // Dummy a-la-carte activities — always show details
    const dummyActs = [
      { name: 'Sunset Yoga Session', desc: 'A guided yoga practice at golden hour with mountain views.', price: '$25', imagePlaceholder: 'Yoga' },
      { name: 'Private Dinner Experience', desc: 'Chef-curated meal under the stars using local ingredients.', price: '$45', imagePlaceholder: 'Dining' },
      { name: 'Mountain Photography Walk', desc: 'Guided trail with stops at scenic viewpoints for photography.', price: '$30', imagePlaceholder: 'Trail' },
    ];
    for (const act of dummyActs) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<div class="img-placeholder">' + act.imagePlaceholder + '</div><h3>' + act.name + '</h3><p>' + act.desc + '</p><div style="margin-bottom:12px;font-size:0.9rem;color:var(--text-muted);">' + act.price + ' per person</div>';
      const btn3 = document.createElement('button');
      btn3.className = 'btn btn-outline';
      btn3.textContent = 'Add to stay';
      btn3.addEventListener('click', () => addDummyActivity(act));
      card.appendChild(btn3);
      grid.appendChild(card);
    }
  }
  function addDummyActivity(act) {
    // Dummy add logic — just show visual feedback
    alert('Added: ' + act.name);
  }
  function scrollToPackages() {
    document.querySelector('.catalog-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Initialize calendar
  renderCalendarGrid();
  renderSignaturePackages();
  renderPackages();
  renderRooms();
  renderActivities();
  renderAddOns();
  updateCartUI();
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
