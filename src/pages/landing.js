import { injectThemeCSS } from "../client/theme.js";
import { nightsBetween } from "../client/utils.js";
import { packages, activities, rooms, siteInfo } from "../config.js";

export function renderPage(url) {
  const bgUrl = siteInfo && siteInfo.backgroundUrl ? siteInfo.backgroundUrl : '';
  const metaScript = `
    // Embedded config — source of truth is src/config.js (replaced site-config.json)
    // Where to change: edit src/config.js packages, rooms, activities, theme.
    // Package recommendation: filter by pkg.nights <= selectedNights, sort by closest nights.
    // Accommodation recommendations: shown after packages; rooms filtered by guests.
    // Additional activities: shown when cart has only room SKUs (no package SKUs).
    let PACKAGES = {}; let ACTIVITIES = {}; let ROOMS = {};
    const nightsBetween = ${nightsBetween.toString()};
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
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/icon?family=Material+Icons+Outlined" rel="stylesheet">
<style>
${injectThemeCSS()}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--cream); color: var(--text-primary); font-family: "DM Sans", system-ui, sans-serif; }
h1, h2, h3 { font-family: "DM Sans", system-ui, sans-serif; margin: 0; }
.container { max-width: 1120px; margin: 0 auto; padding: 32px 20px; }
.hero-shell { width: 100%; padding: 0; overflow: hidden; background: var(--cream); }
.hero { position: relative; width: 100%; min-height: 680px; text-align: center; padding: 30px 20px 112px; overflow: hidden; background: url('${bgUrl}') center top/cover no-repeat; color: #fff; display: flex; flex-direction: column; align-items: center; }
.hero::before { content: ''; position: absolute; inset: 0; background: linear-gradient(rgba(44,36,31,0.28), rgba(44,36,31,0.52)); z-index: 0; pointer-events: none; }
.hero > * { position: relative; z-index: 1; }
.hero-header { width: min(100%, 1120px); display: flex; align-items: center; justify-content: flex-start; }
.hero-logo { display: block; width: 172px; height: 88px; object-fit: contain; object-position: left center; filter: brightness(0) invert(1) drop-shadow(0 2px 8px rgba(0,0,0,.25)); }
.hero-copy { margin: auto 0 30px; }
.hero h1 { font-size: clamp(2.8rem, 7vw, 5rem); letter-spacing: -0.03em; line-height: 1.05; color: #fff; text-shadow: 0 2px 24px rgba(0,0,0,0.35); }
.hero p { font-size: 1.2rem; color: rgba(255,255,255,0.92); margin-top: 14px; max-width: 540px; margin-left: auto; margin-right: auto; }
.booking-widget { width: min(100%, 1040px); margin: 0 auto; }
.booking-panel { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 0; align-items: stretch; padding: 8px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.35); background: rgba(255,255,255,0.2); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); box-shadow: 0 12px 38px rgba(44,36,31,0.2); }
.booking-card { min-height: 112px; padding: 16px 22px; border-radius: 10px; background: transparent; border-right: 1px solid rgba(255,255,255,.3); display: flex; flex-direction: column; justify-content: space-between; }
.booking-card:last-child { border-right: 0; }
.booking-card-title { display: block; color: #fff; font-family: "DM Sans", system-ui, sans-serif; font-size: 1.05rem; font-weight: 600; letter-spacing: .01em; margin-bottom: 14px; text-align: left; }
.date-picker-card .date-row-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; column-gap: 18px; flex: 1; }
.date-field { min-width: 0; }
.date-field-label { display: none; }
.date-picker { display: flex; align-items: center; justify-content: center; gap: 12px; min-width: 0; }
.date-trigger { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; min-width: 132px; height: 48px; padding: 8px 12px; border: 0; background: transparent; color: #fff; font-family: "DM Sans", system-ui, sans-serif; font-size: 1.05rem; font-weight: 600; cursor: pointer; transition: color 0.2s ease, background .2s ease; white-space: nowrap; border-radius: 10px; }
.date-trigger:hover, .date-trigger:focus-visible { color: #ffe2d6; background: rgba(255,255,255,.12); outline: none; }
.date-trigger.selected { color: #fff; }
.date-trigger .material-icons-outlined { font-size: 1.25rem; }
.date-divider { color: #fff; font-size: 1.8rem; font-weight: 500; line-height: 1; text-shadow: 0 2px 8px rgba(44,36,31,.3); }
.guest-options { display: flex; align-items: center; justify-content: space-evenly; gap: 24px; flex: 1; flex-wrap: nowrap; }
.guest-control { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 48px; }
.guest-control button { width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.72); background: transparent; color: #fff; font-size: 1.2rem; font-weight: 300; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; transition: background 0.15s ease, color 0.15s ease; }
.guest-control button:hover, .guest-control button:focus-visible { background: #fff; color: var(--accent); outline: none; }
.guest-value { display: flex; align-items: center; justify-content: center; gap: 7px; text-align: center; min-width: 58px; }
.guest-icon { flex: 0 0 auto; width: 22px; height: 22px; color: rgba(255,255,255,.9); margin-right: 2px; }
.guest-value strong, .guest-value span { display: block; font-family: "DM Sans", system-ui, sans-serif; }
.guest-value strong { color: #fff; font-size: 1.05rem; font-weight: 600; }
.guest-value > span:last-child { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.guest-value span { color: rgba(255,255,255,0.78); font-size: 0.76rem; text-transform: none; letter-spacing: 0.01em; }
.guest-value strong { line-height: 1.1; font-size: 1.15rem; }
.guest-control > .guest-value { order: 2; }
.guest-control > .guest-icon { order: 1; }
.guest-control > button:last-child { order: 3; }
.packages-section { scroll-margin-top: 76px; }
.booking-summary-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 90; display: none; visibility: hidden; padding: 10px 20px; background: rgba(250,247,242,.92); border-bottom: 1px solid var(--warm-gray); box-shadow: 0 8px 24px rgba(44,36,31,.12); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
.booking-summary-bar.is-visible { display: block; visibility: visible; animation: slideDown .22s ease both; }
.booking-summary-inner { width: min(100%, 1120px); margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.booking-summary-details { display: flex; align-items: center; gap: 18px; min-width: 0; }
.booking-summary-item { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: .84rem; white-space: nowrap; }
.booking-summary-item strong { color: var(--text-primary); font-size: .9rem; }
.booking-summary-item.stay-date { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
.booking-summary-item.stay-date small { color: var(--text-muted); font-size: .68rem; letter-spacing: .08em; text-transform: uppercase; }
.booking-summary-icon { color: var(--accent); width: 18px; height: 18px; flex: 0 0 auto; }
.booking-summary-separator { width: 1px; height: 24px; background: var(--warm-gray); }
.cart-footer { position: fixed; left: 20px; right: 20px; bottom: 18px; z-index: 80; background: rgba(250,247,242,.94); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.85); padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; max-width: 1120px; margin: 0 auto; border-radius: var(--radius-lg); box-shadow: 0 12px 32px rgba(44,36,31,.16); }
.cart-footer-content { min-width: 0; }
.cart-items-list { display: flex; flex-wrap: wrap; gap: 5px; max-width: 720px; }
.cart-item { display: inline-flex; align-items: center; background: var(--accent-light); padding: 4px 8px; border-radius: var(--radius-sm); color: var(--text-primary); font-size: .78rem; }
.cart-item a { color: var(--error); text-decoration: none; font-weight: 700; margin-left: 5px; }
.cart-meta { color: var(--text-secondary); font-size: .84rem; margin-top: 5px; }
.cart-total { color: var(--accent); font-size: 1.05rem; font-weight: 700; }
.cart-actions { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
.cart-clear { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--warm-gray); border-radius: 50%; background: transparent; color: var(--error); cursor: pointer; }
.cart-clear:hover, .cart-clear:focus-visible { background: var(--error-bg); outline: none; }
.cart-clear svg { width: 18px; height: 18px; }
@keyframes slideDown { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
.night-count-row { min-height: 24px; margin-top: 14px; color: #fff; font-size: 0.95rem; font-weight: 600; text-align: center; text-shadow: 0 1px 10px rgba(44,36,31,0.35); }
.night-count-row.is-preview { color: #ffe2d6; }
.calendar-overlay { display: none; position: fixed; inset: 0; z-index: 100; align-items: center; justify-content: center; padding: 20px; background: rgba(44,36,31,0.42); backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px); animation: fadeInUp 0.25s ease; }
.calendar-modal { position: relative; width: 100%; max-width: 520px; padding: 24px; border: 1px solid var(--glass-border); border-radius: var(--radius-lg); background: var(--warm-white); box-shadow: 0 24px 60px rgba(44,36,31,0.28); }
.calendar-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.calendar-status { color: var(--text-primary); font-family: "DM Sans", system-ui, sans-serif; font-size: 1.05rem; font-weight: 600; }
.calendar-clear { border: none; background: transparent; color: var(--accent); cursor: pointer; font-family: inherit; font-size: 0.85rem; font-weight: 600; padding: 4px; }
.calendar-clear:hover, .calendar-clear:focus-visible { color: var(--accent-hover); outline: none; }
.calendar-select { width: 100%; margin-top: 22px; border: 0; border-radius: var(--radius-md); background: var(--accent); color: #fff; padding: 12px 18px; font-family: inherit; font-weight: 600; cursor: pointer; }
.calendar-select:disabled { background: var(--warm-gray); color: var(--text-muted); cursor: not-allowed; }
.calendar-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.calendar-nav button { width: 36px; height: 36px; border: none; border-radius: 50%; background: transparent; color: var(--accent); cursor: pointer; font-size: 1.1rem; }
.calendar-nav button:hover, .calendar-nav button:focus-visible { background: var(--accent-light); outline: none; }
.calendar-month-label { color: var(--text-primary); font-size: 1.05rem; font-weight: 600; letter-spacing: 0.02em; }
.calendar-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 6px; color: var(--text-muted); font-size: 0.75rem; font-weight: 600; text-align: center; text-transform: uppercase; letter-spacing: 0.05em; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.calendar-day { min-width: 0; aspect-ratio: 1; border: none; border-radius: 50%; background: transparent; color: var(--text-primary); cursor: pointer; font-family: inherit; font-size: 0.9rem; transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease; }
.calendar-day:hover:not(:disabled), .calendar-day:focus-visible:not(:disabled) { background: var(--accent-light); outline: none; transform: scale(1.04); }
.calendar-day:disabled { color: var(--text-muted); cursor: not-allowed; opacity: 0.42; }
.calendar-day.is-range { border-radius: 0; background: rgba(184,92,56,0.16); color: var(--accent); }
.calendar-day.is-range-start, .calendar-day.is-range-end { border-radius: 50%; background: var(--accent); color: #fff; font-weight: 600; box-shadow: 0 2px 8px rgba(184,92,56,0.3); }
.calendar-day.is-range-start.is-range-end { border-radius: 50%; }
.date-row { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; margin-top: 28px; margin-bottom: 8px; }
.date-row input { padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--warm-gray); font-family: inherit; font-size: 0.95rem; background: var(--warm-white); color: var(--text-primary); min-width: 140px; }
.catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; margin-top: 36px; }
.catalog-grid .card { scroll-snap-align: start; flex: 0 0 320px; overflow: hidden; position: relative; }
.card { background: var(--glass-white); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border: 1px solid var(--glass-border); border-radius: var(--radius-lg); padding: 0; box-shadow: var(--glass-shadow); transition: transform 0.2s ease, box-shadow 0.2s ease; overflow: hidden; position: relative; height: 420px; }
.card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(44,36,31,0.12); }
.card .card-img-wrap { position: relative; width: 100%; height: 260px; overflow: hidden; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
.card .card-img-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* Dark overlay over image for white text */
.card .card-img-wrap::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(44,36,31,0.65) 0%, rgba(44,36,31,0.35) 50%, rgba(44,36,31,0.2) 100%); pointer-events: none; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
/* Theme bookmark top-left */
.card .theme-badge { position: absolute; top: 14px; right: 14px; z-index: 3; background: rgba(255,255,255,0.92); color: var(--accent); font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 5px 12px; border-radius: 4px; box-shadow: 0 2px 8px rgba(44,36,31,0.12); }
/* Title over image - white with subtle shadow */
.card .img-title-overlay { position: absolute; bottom: 14px; left: 14px; right: 14px; z-index: 2; }
.card .img-title-overlay h3 { font-family: "DM Sans", system-ui, sans-serif; font-size: 1.35rem; color: #fff; text-shadow: 0 2px 12px rgba(44,36,31,0.6); margin: 0 0 4px; line-height: 1.15; }
.card .img-title-overlay .nights-info { font-size: 0.85rem; color: rgba(255,255,255,0.92); text-shadow: 0 1px 8px rgba(44,36,31,0.5); }
/* Default visible text area below image */
.card .card-body { padding: 14px 18px 10px; background: var(--glass-white); }
.card .card-body .card-sub { font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 6px; }
/* Details slide up from bottom inside fixed card */
.card .card-details { position: absolute; bottom: 0; left: 0; right: 0; padding: 0 18px 16px; display: none; animation: slideUp 0.35s ease both; background: linear-gradient(to top, var(--cream) 0%, rgba(250,247,242,0.75) 100%); border-top: 1px solid rgba(44,36,31,0.08); }
.card:hover .card-details,
.card.active .card-details { display: block; }
/* Price options and buttons */
.card .price-options { display: flex; gap: 8px; margin-bottom: 10px; }
.card .price-opt { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--glass-border); background: rgba(255,255,255,0.35); text-align: center; cursor: pointer; font-size: 0.78rem; font-weight: 600; transition: all 0.2s; color: var(--text-primary); }
.card .price-opt.selected { background: var(--accent); color: #fff; border-color: var(--accent); }
.card .btn { width: 100%; border-radius: 8px; padding: 10px; font-size: 0.85rem; text-align: center; }
/* Animation for slide-up */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.btn { display: inline-block; padding: 10px 20px; border-radius: 8px; background: var(--accent); color: #fff; text-decoration: none; font-size: 0.9rem; font-weight: 600; border: none; cursor: pointer; transition: all 0.25s ease, box-shadow 0.25s ease; }
.btn:hover { background: var(--accent-hover); box-shadow: 0 4px 16px rgba(184,92,56,0.25); transform: translateY(-2px); }
.btn-outline { background: transparent; color: var(--accent); border: 1px solid var(--accent); border-radius: 8px; transition: all 0.25s ease, box-shadow 0.25s ease; }
.btn-outline:hover { background: var(--accent-light); box-shadow: 0 4px 16px rgba(184,92,56,0.15); transform: translateY(-1px); }
.activity-section { margin-top: 60px; }
.activity-section h2 { font-size: 1.8rem; margin-bottom: 6px; }
.activity-section p.subtitle { color: var(--text-secondary); margin-bottom: 20px; }
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
.card { animation: fadeInUp 0.35s ease both; }
.empty-state { color: var(--text-muted); font-style: italic; padding: 16px 0; animation: fadeInUp 0.4s ease; }
@media (max-width: 760px) {
  .hero { min-height: 0; padding: 24px 16px 48px; }
  .hero-copy { margin: 92px 0 30px; }
  .hero-logo { width: 148px; height: 76px; }
  .booking-panel { grid-template-columns: 1fr; gap: 0; padding: 8px; }
  .booking-card { border-right: 0; border-bottom: 1px solid rgba(255,255,255,.3); }
  .booking-card:last-of-type { border-bottom: 0; }
  .booking-card { min-height: 0; }
  .booking-card-title { margin-bottom: 12px; }
  .date-picker-card .date-row-controls { grid-template-columns: 1fr; gap: 2px; }
  .date-divider { transform: rotate(90deg); margin: -2px auto; }
  .date-trigger { flex: 1 1 150px; }
  .guest-options { justify-content: space-between; gap: 14px; }
  .guest-options { gap: 14px; }
}
@media (max-width: 760px) {
  .booking-summary-bar { padding: 9px 12px; }
  .booking-summary-inner { display: block; }
  .booking-summary-details { justify-content: space-between; gap: 8px; overflow-x: auto; }
  .booking-summary-item { font-size: .72rem; gap: 5px; }
  .booking-summary-item strong { font-size: .76rem; }
  .booking-summary-separator { display: none; }
  .cart-footer { left: 10px; right: 10px; bottom: 10px; padding: 10px 12px; }
  .cart-items-list { max-width: calc(100vw - 150px); max-height: 42px; overflow: hidden; }
  .cart-actions .btn { padding: 9px 12px; font-size: .8rem; }
}
@media (max-width: 600px) {
  .catalog-grid { grid-template-columns: 1fr; }
  .cart-footer { flex-direction: column; gap: 10px; align-items: flex-start; }
  .calendar-modal { padding: 18px; }
  .calendar-day { font-size: 0.82rem; }
}
</style>
</head>
<body>
<div id="booking-summary-bar" class="booking-summary-bar" aria-live="polite">
  <div class="booking-summary-inner">
    <div class="booking-summary-details">
      <div class="booking-summary-item stay-date"><svg class="booking-summary-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M7 3.5v3M17 3.5v3M3.5 9h17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg><small>Check-in</small><strong id="summary-checkin">Select date</strong></div>
      <span class="booking-summary-separator" aria-hidden="true"></span>
      <div class="booking-summary-item stay-date"><svg class="booking-summary-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M7 3.5v3M17 3.5v3M3.5 9h17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg><small>Check-out</small><strong id="summary-checkout">Select date</strong></div>
      <span class="booking-summary-separator" aria-hidden="true"></span>
      <div class="booking-summary-item"><svg class="booking-summary-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.7 15.8A7.5 7.5 0 0 1 8.2 5.3 7.5 7.5 0 1 0 18.7 15.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path></svg><strong id="summary-nights">0 nights</strong></div>
      <span class="booking-summary-separator" aria-hidden="true"></span>
      <div class="booking-summary-item"><svg class="booking-summary-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M5.5 20c.7-3.4 2.8-5.2 6.5-5.2s5.8 1.8 6.5 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg><strong id="summary-adults">2 Adults</strong></div>
      <div class="booking-summary-item"><svg class="booking-summary-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="7.5" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M7.2 20c.4-3.1 2-4.8 4.8-4.8s4.4 1.7 4.8 4.8M8.1 12.5h7.8M10 12.5l-1.4 2.2M14 12.5l1.4 2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg><strong id="summary-children">0 Children</strong></div>
    </div>
  </div>
</div>
<section class="hero-shell">
  <section class="hero" aria-label="Hero">
    <header class="hero-header"><img class="hero-logo" src="${siteInfo.logoUrl || ''}" alt="${siteInfo.siteName || 'Sapana Village'}"></header>
    <div class="hero-copy"><h1>Sapana Village</h1>
    <p>A quiet retreat in the foothills — rooms, guided hikes, spa, and private dinners.</p></div>
    <div class="booking-widget" id="booking-widget">
      <div class="booking-panel">
        <div class="booking-card date-picker-card">
          <h3 class="booking-card-title">When would you like to stay?</h3>
          <div class="date-row-controls"><div class="date-field"><button onclick="openCalendar('checkin')" id="btn-checkin" class="date-trigger" aria-label="Select check-in date">
            <span class="material-icons-outlined">calendar_today</span>
            <span id="checkin-display">Check-in</span>
          </button></div>
          <span class="date-divider" aria-hidden="true">&#8594;</span>
          <div class="date-field"><button onclick="openCalendar('checkout')" id="btn-checkout" class="date-trigger" aria-label="Select check-out date">
            <span class="material-icons-outlined">calendar_today</span>
            <span id="checkout-display">Check-out</span>
          </button></div></div>
        </div>

        <div class="booking-card guest-picker">
          <h3 class="booking-card-title">Who are you traveling with?</h3>
          <div class="guest-options">
            <div class="guest-control">
              <button onclick="updateGuests('adults', -1)" aria-label="Decrease adults">&#8722;</button>
              <svg class="guest-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M5.5 20c.7-3.4 2.8-5.2 6.5-5.2s5.8 1.8 6.5 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg><div class="guest-value"><strong id="guest-adults-display">2</strong><span>Adults</span></div>
              <button onclick="updateGuests('adults', 1)" aria-label="Increase adults">+</button>
            </div>
            <div class="guest-control">
              <button onclick="updateGuests('children', -1)" aria-label="Decrease children">&#8722;</button>
              <svg class="guest-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="7.5" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8"></circle><path d="M7.2 20c.4-3.1 2-4.8 4.8-4.8s4.4 1.7 4.8 4.8M8.1 12.5h7.8M10 12.5l-1.4 2.2M14 12.5l1.4 2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg><div class="guest-value"><strong id="guest-children-display">0</strong><span>Children</span></div>
              <button onclick="updateGuests('children', 1)" aria-label="Increase children">+</button>
            </div>
          </div>
        </div>
      </div>
      <div id="night-count-row" aria-live="polite"></div>

      <div id="calendar-overlay" class="calendar-overlay">
        <div class="calendar-modal">
          <div class="calendar-header">
            <span id="cal-selection-label" class="calendar-status" aria-live="polite">Select check-in date</span>
            <button onclick="clearSelection()" class="calendar-clear">Clear</button>
          </div>
          <div class="calendar-nav">
            <button onclick="changeMonth(-1)" aria-label="Previous month">&#10094;</button>
            <span id="calendar-month-label"></span>
            <button onclick="changeMonth(1)" aria-label="Next month">&#10095;</button>
          </div>
          <div class="calendar-weekdays">
            <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
          </div>
          <div id="calendar-grid" class="calendar-grid"></div>
          <button type="button" onclick="confirmCalendarSelection()" id="calendar-select" class="calendar-select" disabled>Select dates</button>
        </div>
      </div>

  </section>
</div>

<div class="container">
  <!-- Our Signature Packages -->
  <section aria-label="Signature Packages" style="margin-top: 36px;">
    <h2>Our Signature Packages</h2>
    <p style="color:var(--text-secondary);margin-bottom:20px;">Handpicked retreats designed for rest, renewal, and connection.</p>
    <div id="signature-grid" class="catalog-grid" style="grid-template-columns: repeat(3, 1fr);"></div>
  </section>

  <section aria-label="Packages" class="packages-section" style="margin-top: 60px;">
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
    <div style="position:relative;">
      <button onclick="scrollRooms(-1)" aria-label="Previous rooms" style="position:absolute;left:-16px;top:50%;transform:translateY(-50%);z-index:10;background:var(--glass-white);backdrop-filter:blur(8px);border:1px solid var(--glass-border);border-radius:50%;width:40px;height:40px;cursor:pointer;box-shadow:var(--glass-shadow);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--accent);">&#10094;</button>
      <button onclick="scrollRooms(1)" aria-label="Next rooms" style="position:absolute;right:-16px;top:50%;transform:translateY(-50%);z-index:10;background:var(--glass-white);backdrop-filter:blur(8px);border:1px solid var(--glass-border);border-radius:50%;width:40px;height:40px;cursor:pointer;box-shadow:var(--glass-shadow);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--accent);">&#10095;</button>
      <div id="rooms-grid" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:24px;padding:4px 4px 12px;scrollbar-width:none;-ms-overflow-style:none;"></div>
    </div>
  </section>

  <section class="activity-section" aria-label="Activities">
    <h2>À la carte activities</h2>
    <p class="subtitle">Add individual experiences — durations shown for display only. The base SKU is used for pricing.</p>
    <div style="position:relative;">
      <button onclick="scrollActivities(-1)" aria-label="Previous activities" style="position:absolute;left:-16px;top:50%;transform:translateY(-50%);z-index:10;background:var(--glass-white);backdrop-filter:blur(8px);border:1px solid var(--glass-border);border-radius:50%;width:40px;height:40px;cursor:pointer;box-shadow:var(--glass-shadow);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--accent);">&#10094;</button>
      <button onclick="scrollActivities(1)" aria-label="Next activities" style="position:absolute;right:-16px;top:50%;transform:translateY(-50%);z-index:10;background:var(--glass-white);backdrop-filter:blur(8px);border:1px solid var(--glass-border);border-radius:50%;width:40px;height:40px;cursor:pointer;box-shadow:var(--glass-shadow);display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:var(--accent);">&#10095;</button>
      <div id="activities-grid" style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:24px;padding:4px 4px 12px;scrollbar-width:none;-ms-overflow-style:none;"></div>
    </div>
  </section>

  <div class="cart-footer" id="cart-footer" style="display:none;">
    <div class="cart-footer-content">
      <div id="cart-items-list" class="cart-items-list"></div>
      <div class="cart-meta"><span id="cart-items-label">0 items</span><span aria-hidden="true"> · </span><span>Total</span> <span class="cart-total" id="cart-total">$0</span></div>
    </div>
    <div class="cart-actions">
      <button type="button" class="cart-clear" onclick="clearCart(event)" aria-label="Clear cart" title="Clear cart"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14M10 11v6M14 11v6M8 7l1-2h6l1 2m-9 0 1 14h8l1-14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg></button>
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
  let hoveredCheckout = '';
  let currentCalendarMonth = new Date();
  let guests = { adults: 2, children: 0 };
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
    if (!el) { el = document.createElement('div'); el.id = 'date-error'; el.style.cssText = 'color: var(--error); font-size: 0.85rem; text-align: center; margin-top: 8px; font-weight: 500;'; document.getElementById('booking-widget').appendChild(el); }
    el.textContent = msg;
  }
  function clearDateError() {
    const el = document.getElementById('date-error'); if (el) el.textContent = '';
  }
  function renderPackages() {
    const grid = document.getElementById("packages-grid"); grid.innerHTML = "";
    const nights = selectedCheckin && selectedCheckout ? nightsBetween(selectedCheckin, selectedCheckout) : 0;
    const selectedNights = nights;
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
      card.style.cssText = 'flex:0 0 300px;min-width:260px;scroll-snap-align:start;';
      const includesHtml = pkg.includes.map(i => '<li>' + i + '</li>').join('');
      const imgUrl = pkg.imageUrl || pkg.image || '';
      const imgSrc = imgUrl ? imgUrl : 'https://res.cloudinary.com/devkrish/image/upload/v1789361425/svl-front_vszhbm.webp';
      const nightsInfo = pkg.nights > 0 ? pkg.nights + ' N / ' + (pkg.nights + 1) + ' Days' : '';
      const bbLabel = pkg.bb ? pkg.bb : (pkg.priceRange ? pkg.priceRange.split('–')[0].trim() : '');
      card.innerHTML =
        '<div class="card-img-wrap">' +
          '<img src="' + imgSrc + '" alt="' + pkg.name + '" class="card-img">' +
          '<span class="theme-badge">' + pkg.theme + '</span>' +
          '<div class="img-title-overlay">' +
            '<h3>' + pkg.name + '</h3>' +
            '<div class="nights-info">' + nightsInfo + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="from-price">From ' + bbLabel + ' / person</div>' +
        '</div>' +
        '<div class="card-details">' +
          '<p>' + (pkg.description ? (pkg.description.length > 120 ? pkg.description.substring(0, 120).trim() + '...' : pkg.description) : '') + '</p>' +
          '<ul class="includes">' + includesHtml + '</ul>' +
          '<div class="price-options">' +
            '<button class="price-opt" data-price="' + pkg.bb + '" data-key="' + key + '">B&amp;B<br><span style="font-size:0.7rem;font-weight:400;opacity:0.8;">' + bbLabel + '</span></button>' +
            '<button class="price-opt" data-price="' + pkg.fullBoard + '" data-key="' + key + '">Full Board<br><span style="font-size:0.7rem;font-weight:400;opacity:0.8;">' + (pkg.fullBoard || '') + '</span></button>' +
          '</div>' +
          '<button class="btn" data-key="' + key + '">Select</button>' +
        '</div>';
      card.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('.price-opt')) {
          card.classList.toggle('active');
        }
      });
      // Price option selection
      card.querySelectorAll('.price-opt').forEach(optBtn => {
        optBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          card.querySelectorAll('.price-opt').forEach(b => b.classList.remove('selected'));
          optBtn.classList.add('selected');
        });
      });
      // Select package
      const selectBtn = card.querySelector('.btn');
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addPackage(key);
      });
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
  // Room carousel rotation (separate from package carousel for independent rotation)
  let roomInterval = null;
  function startRoomCarousel() { if (roomInterval) return; roomInterval = setInterval(() => { const grid = document.getElementById('rooms-grid'); if (!grid) return; grid.scrollBy({ left: 320, behavior: 'smooth' }); }, 6000); }
  function stopRoomCarousel() { clearInterval(roomInterval); roomInterval = null; }
  document.getElementById('rooms-grid').addEventListener('mouseenter', stopRoomCarousel);
  document.getElementById('rooms-grid').addEventListener('mouseleave', startRoomCarousel);
  document.getElementById('rooms-grid').addEventListener('click', () => { stopRoomCarousel(); setTimeout(startRoomCarousel, 3000); });
  // Activities carousel rotation
  let actInterval = null;
  function startActCarousel() { if (actInterval) return; actInterval = setInterval(() => { const grid = document.getElementById('activities-grid'); if (!grid) return; grid.scrollBy({ left: 300, behavior: 'smooth' }); }, 5000); }
  function stopActCarousel() { clearInterval(actInterval); actInterval = null; }
  document.getElementById('activities-grid').addEventListener('mouseenter', stopActCarousel);
  document.getElementById('activities-grid').addEventListener('mouseleave', startActCarousel);
  document.getElementById('activities-grid').addEventListener('click', () => { stopActCarousel(); setTimeout(startActCarousel, 3000); });
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
  function selectPricingOption(btn, price, pkgKey) {
    const parent = btn.closest('.price-options');
    if (parent) {
      parent.querySelectorAll('.price-opt').forEach(b => b.classList.remove('selected'));
    }
    btn.classList.add('selected');
    btn.setAttribute('data-selected-price', price);
    btn.setAttribute('data-pkg-key', pkgKey);
  }
  function confirmSelectPackage(pkgKey, btn) {
    const parent = btn.closest('.card-details');
    const selectedBtn = parent ? parent.querySelector('.price-opt.selected') : null;
    const selectedPrice = selectedBtn ? selectedBtn.getAttribute('data-selected-price') : null;
    addPackage(pkgKey);
  }
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
  document.getElementById('calendar-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'calendar-overlay') closeCalendar();
  });
  document.querySelector('.calendar-modal').addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCalendar();
  });
  const summaryBar = document.getElementById('booking-summary-bar');
  const heroShell = document.querySelector('.hero-shell');
  function setSummaryVisibility(isVisible) {
    if (!summaryBar) return;
    summaryBar.classList.toggle('is-visible', isVisible);
    summaryBar.style.display = isVisible ? 'block' : 'none';
    summaryBar.style.visibility = isVisible ? 'visible' : 'hidden';
  }
  function updateSummaryVisibility() {
    if (!heroShell) return;
    setSummaryVisibility(heroShell.getBoundingClientRect().bottom <= 0);
  }
  if (summaryBar && heroShell && 'IntersectionObserver' in window) {
    const heroObserver = new IntersectionObserver(([entry]) => {
      setSummaryVisibility(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
    }, { threshold: 0 });
    heroObserver.observe(heroShell);
    window.addEventListener('scroll', updateSummaryVisibility, { passive: true });
    window.addEventListener('resize', updateSummaryVisibility, { passive: true });
    updateSummaryVisibility();
  } else {
    window.addEventListener('scroll', updateSummaryVisibility, { passive: true });
    updateSummaryVisibility();
  }

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
        if (btn && (btn.textContent.includes('Select') || btn.textContent.includes('Add package'))) {
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
    document.getElementById('calendar-select').disabled = !(selectedCheckin && selectedCheckout);
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
  function confirmCalendarSelection() {
    if (!selectedCheckin || !selectedCheckout) return;
    closeCalendar();
    updateBookingUI();
    window.setTimeout(() => {
      const packagesSection = document.querySelector('.packages-section');
      if (packagesSection) packagesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
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
      btn.className = 'calendar-day';
      const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const dateObj = new Date(dateStr + 'T00:00:00');
      if (dateObj < today) {
        btn.style.color = 'var(--text-muted)'; btn.style.cursor = 'default'; btn.disabled = true; btn.onclick = null;
      } else {
        const isCheckin = selectedCheckin === dateStr;
        const isCheckout = selectedCheckout === dateStr;
        const dateValue = dateObj.getTime();
        const checkinValue = selectedCheckin ? new Date(selectedCheckin + 'T00:00:00').getTime() : 0;
        const checkoutValue = selectedCheckout ? new Date(selectedCheckout + 'T00:00:00').getTime() : 0;
        if (isCheckin) {
          btn.classList.add('is-range-start');
        } else if (isCheckout) {
          btn.classList.add('is-range-end');
        } else if (checkinValue && checkoutValue && dateValue > checkinValue && dateValue < checkoutValue) {
          btn.classList.add('is-range');
        } else {
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
        document.getElementById('cal-selection-label').textContent = 'Dates selected';
        document.getElementById('checkout-display').textContent = formatDisplayDate(dateStr);
        document.getElementById('calendar-select').disabled = false;
      }
    }
    document.getElementById('calendar-select').disabled = !(selectedCheckin && selectedCheckout);
    renderCalendarGrid();
  }
  function formatDisplayDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }
  function clearSelection() {
    selectedCheckin = ''; selectedCheckout = '';
    document.getElementById('checkin-display').textContent = 'Check-in';
    document.getElementById('checkout-display').textContent = 'Check-out';
    document.getElementById('night-count-row').textContent = '';
    document.getElementById('cal-selection-label').textContent = 'Select check-in';
    document.getElementById('calendar-select').disabled = true;
    calendarMode = 'checkin'; renderCalendarGrid(); updateBookingUI();
  }
  function updateBookingUI() {
    const nights = selectedCheckin && selectedCheckout ? nightsBetween(selectedCheckin, selectedCheckout) : 0;
    const nightRow = document.getElementById('night-count-row');
    nightRow.textContent = nights > 0 ? nights + ' night' + (nights > 1 ? 's' : '') + ' selected' : '';
    updateBookingSummary(nights);
    renderPackages();
    renderRooms();
  }
  function updateBookingSummary(nights) {
    document.getElementById('summary-checkin').textContent = selectedCheckin ? formatDisplayDate(selectedCheckin) : 'Select date';
    document.getElementById('summary-checkout').textContent = selectedCheckout ? formatDisplayDate(selectedCheckout) : 'Select date';
    document.getElementById('summary-nights').textContent = nights + ' night' + (nights === 1 ? '' : 's');
    document.getElementById('summary-adults').textContent = guests.adults + ' Adult' + (guests.adults === 1 ? '' : 's');
    document.getElementById('summary-children').textContent = guests.children + ' Children';
  }
  function updateGuests(type, delta) {
    const val = guests[type] + delta;
    if (type === 'adults' && val >= 1 && val <= 10) guests[type] = val;
    if (type === 'children' && val >= 0 && val <= 5) guests[type] = val;
    document.getElementById('guest-adults-display').textContent = guests.adults;
    document.getElementById('guest-children-display').textContent = guests.children;
    updateBookingSummary(selectedCheckin && selectedCheckout ? nightsBetween(selectedCheckin, selectedCheckout) : 0);
    renderRooms();
  }
  function renderRooms() {
    const grid = document.getElementById('rooms-grid'); if (!grid) return; grid.innerHTML = '';
    const roomEntries = Object.entries(ROOMS || {});
    // Show 2-4 cards: featured first, then first 4 total
    const featured = roomEntries.filter(([k, r]) => r.featured);
    const others = roomEntries.filter(([k, r]) => !r.featured);
    let displayRooms = featured.concat(others).slice(0, 4);
    for (const [key, r] of displayRooms) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'flex:0 0 300px;min-width:260px;scroll-snap-align:start;';
      const shortDesc = (r.description || '').length > 80 ? (r.description || '').substring(0, 80).trim() + '...' : (r.description || '');
      card.innerHTML = '<h3>' + r.name + '</h3><p style="font-size:0.85rem;color:var(--text-secondary);line-height:1.45;">' + shortDesc + '</p><div style="margin-top:8px;font-size:0.85rem;color:var(--text-muted);">Capacity: ' + r.capacity + ' � $' + r.pricePerNight + ' / night</div>';
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
      card.style.cssText = 'flex:0 0 300px;min-width:260px;scroll-snap-align:start;';
      const includesHtml = pkg.includes.map(i => '<li>' + i + '</li>').join('');
      const imgUrl = pkg.imageUrl || pkg.image || '';
      const imgSrc = imgUrl ? imgUrl : 'https://res.cloudinary.com/devkrish/image/upload/v1789361425/svl-front_vszhbm.webp';
      const nightsInfo = pkg.nights > 0 ? pkg.nights + ' N / ' + (pkg.nights + 1) + ' Days' : '';
      const bbLabel = pkg.bb ? pkg.bb : (pkg.priceRange ? pkg.priceRange.split('–')[0].trim() : '');
      card.innerHTML =
        '<div class="card-img-wrap">' +
          '<img src="' + imgSrc + '" alt="' + pkg.name + '" class="card-img">' +
          '<span class="theme-badge">' + pkg.theme + '</span>' +
          '<div class="img-title-overlay">' +
            '<h3>' + pkg.name + '</h3>' +
            '<div class="nights-info">' + nightsInfo + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="from-price">From ' + bbLabel + ' / person</div>' +
        '</div>' +
        '<div class="card-details">' +
          '<p>' + (pkg.description ? (pkg.description.length > 120 ? pkg.description.substring(0, 120).trim() + '...' : pkg.description) : '') + '</p>' +
          '<ul class="includes">' + includesHtml + '</ul>' +
          '<div class="price-options">' +
            '<button class="price-opt" data-price="' + pkg.bb + '" data-key="' + key + '">B&amp;B<br><span style="font-size:0.7rem;font-weight:400;opacity:0.8;">' + bbLabel + '</span></button>' +
            '<button class="price-opt" data-price="' + pkg.fullBoard + '" data-key="' + key + '">Full Board<br><span style="font-size:0.7rem;font-weight:400;opacity:0.8;">' + (pkg.fullBoard || '') + '</span></button>' +
          '</div>' +
          '<button class="btn" data-key="' + key + '">Select</button>' +
        '</div>';
      card.addEventListener('click', (e) => {
        if (!e.target.closest('button') && !e.target.closest('.price-opt')) {
          card.classList.toggle('active');
        }
      });
      // Price option selection
      card.querySelectorAll('.price-opt').forEach(optBtn => {
        optBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          card.querySelectorAll('.price-opt').forEach(b => b.classList.remove('selected'));
          optBtn.classList.add('selected');
        });
      });
      // Select package
      const selectBtn = card.querySelector('.btn');
      selectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addPackage(key);
      });
      grid.appendChild(card);
    }
  }
  function renderActivities() {
    const grid = document.getElementById('activities-grid'); if (!grid) return; grid.innerHTML = '';
    const actEntries = Object.entries(ACTIVITIES || {});
    for (const [key, act] of actEntries) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cssText = 'flex:0 0 300px;min-width:260px;scroll-snap-align:start;';
      const durationsHtml = (act.durations || []).map(v => '<span style="display:inline-block;padding:4px 8px;background:var(--warm-gray);border-radius:var(--radius-sm);margin-right:6px;font-size:0.8rem;font-weight:500;">' + v.label + '</span>').join('');
      const actImgUrl = act.imageUrl || act.image || '';
      const imgDisplay = actImgUrl ? '<img src="' + actImgUrl + '" alt="' + act.name + '" style="width:100%;height:120px;object-fit:cover;border-radius:var(--radius-md);margin-bottom:16px;">' : '<div class="img-placeholder">' + (act.name || 'Image') + '</div>';
      card.innerHTML = imgDisplay + '<h3>' + act.name + '</h3><div style="margin-bottom:10px;">' + durationsHtml + '</div>';
      const btn3 = document.createElement('button');
      btn3.className = 'btn btn-outline';
      btn3.textContent = 'Add Activity';
      btn3.addEventListener('click', () => addActivity(key));
      card.appendChild(btn3);
      grid.appendChild(card);
    }
  }
  function scrollRooms(dir) {
    const grid = document.getElementById('rooms-grid');
    const scrollAmount = 340;
    grid.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
  }
  function scrollActivities(dir) {
    const grid = document.getElementById('activities-grid');
    const scrollAmount = 340;
    grid.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
  }
  let roomCarouselInterval = null;
  function startRoomCarousel() { if (roomCarouselInterval) return; roomCarouselInterval = setInterval(() => scrollRooms(1), 6000); }
  function stopRoomCarousel() { clearInterval(roomCarouselInterval); roomCarouselInterval = null; }
  let actCarouselInterval = null;
  function startActCarousel() { if (actCarouselInterval) return; actCarouselInterval = setInterval(() => scrollActivities(1), 5000); }
  function stopActCarousel() { clearInterval(actCarouselInterval); actCarouselInterval = null; }
  function scrollToPackages() {
    document.querySelector('.catalog-grid').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Carousel rotation for rooms (6s) and activities (5s)
  document.getElementById('rooms-grid').addEventListener('mouseenter', stopRoomCarousel);
  document.getElementById('rooms-grid').addEventListener('mouseleave', startRoomCarousel);
  document.getElementById('rooms-grid').addEventListener('click', () => { stopRoomCarousel(); setTimeout(startRoomCarousel, 3000); });
  document.getElementById('activities-grid').addEventListener('mouseenter', stopActCarousel);
  document.getElementById('activities-grid').addEventListener('mouseleave', startActCarousel);
  document.getElementById('activities-grid').addEventListener('click', () => { stopActCarousel(); setTimeout(startActCarousel, 3000); });
  // Initialize calendar
  renderCalendarGrid();
  renderSignaturePackages();
  renderPackages();
  renderRooms();
  renderActivities();
  renderAddOns();
  updateBookingUI();
  updateCartUI();
  startRoomCarousel();
  startActCarousel();
  startCarousel();
</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
