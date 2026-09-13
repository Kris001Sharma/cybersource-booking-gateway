import { injectThemeCSS } from "../client/theme.js";
import { nightsBetween } from "../client/utils.js";

export function renderPage(url) {
  const metaScript = `
    const PACKAGES = ${JSON.stringify({
      "package-3night-retreat": {
        type: "package", name: "3-Night Wellness Retreat", theme: "Wellness", nights: 3,
        description: "A restorative stay with guided practices, healthy meals, and time to reconnect with nature.",
        includes: ["Daily breakfast", "3 spa sessions", "Sunset yoga"],
        priceRange: "$280 – $340", skus: ["room-double", "act-spa", "act-hike"], image: "gradient-1"
      },
      "package-5night-deep": {
        type: "package", name: "5-Night Deep Retreat", theme: "Wellness", nights: 5,
        description: "Extended immersion with deeper bodywork, silent mornings, and personalized guidance.",
        includes: ["Daily breakfast & dinner", "5 spa sessions", "Private hike"],
        priceRange: "$420 – $520", skus: ["room-suite", "act-spa", "act-hike", "act-dinner"], image: "gradient-2"
      },
      "package-weekend-escape": {
        type: "package", name: "Weekend Escape", theme: "Rest", nights: 2,
        description: "A quick reset: comfortable room, spa session, and a guided hike to start the week fresh.",
        includes: ["Breakfast", "1 spa session", "Guided hike"],
        priceRange: "$160 – $200", skus: ["room-single", "act-spa", "act-hike"], image: "gradient-3"
      }
    })};
    const ACTIVITIES = ${JSON.stringify({
      "act-hike": { type: "activity", name: "Guided Hike", durations: [{label:"Half-day",durationNights:0,price:20},{label:"Full-day",durationNights:1,price:35}], image: "gradient-2" },
      "act-spa": { type: "activity", name: "Spa Session", durations: [{label:"60 min",durationNights:0,price:30},{label:"90 min",durationNights:0,price:45}], image: "gradient-1" },
      "act-dinner": { type: "activity", name: "Private Dinner", durations: [{label:"Evening",durationNights:0,price:25}], image: "gradient-4" }
    })};
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
.card { background: var(--warm-white); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-card); border: 1px solid var(--warm-gray); transition: transform 0.15s ease, box-shadow 0.15s ease; }
.card:hover { transform: translateY(-2px); box-shadow: var(--shadow-elevated); }
.card h3 { font-size: 1.35rem; margin-bottom: 6px; }
.card .theme-tag { display: inline-block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); font-weight: 600; margin-bottom: 8px; }
.card p { color: var(--text-secondary); font-size: 0.95rem; line-height: 1.55; margin-bottom: 12px; }
.card .includes { list-style: none; padding: 0; margin: 0 0 14px; }
.card .includes li { font-size: 0.88rem; color: var(--text-muted); padding: 2px 0; }
.card .includes li::before { content: "— "; color: var(--accent); }
.card .price-range { font-weight: 600; color: var(--text-primary); font-size: 1.05rem; margin-bottom: 14px; }
.card .img-placeholder { height: 120px; border-radius: var(--radius-md); background: linear-gradient(135deg, #e8ddd0 0%, #d6c9b6 100%); display: flex; align-items: center; justify-content: center; font-family: "Playfair Display", serif; font-size: 1.8rem; color: var(--text-secondary); opacity: 0.65; margin-bottom: 16px; }
.btn { display: inline-block; padding: 10px 20px; border-radius: var(--radius-md); background: var(--accent); color: #fff; text-decoration: none; font-size: 0.9rem; font-weight: 600; border: none; cursor: pointer; }
.btn:hover { background: var(--accent-hover); }
.btn-outline { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.btn-outline:hover { background: var(--accent-light); }
.cart-footer { position: sticky; bottom: 0; background: rgba(250,247,242,0.92); backdrop-filter: blur(8px); border-top: 1px solid var(--warm-gray); padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; max-width: 1120px; margin: 40px auto 0; border-radius: var(--radius-md) var(--radius-md) 0 0; box-shadow: 0 -4px 20px rgba(0,0,0,0.03); }
.cart-footer .total { font-weight: 600; font-size: 1.05rem; }
.activity-section { margin-top: 60px; }
.activity-section h2 { font-size: 1.8rem; margin-bottom: 6px; }
.activity-section p.subtitle { color: var(--text-secondary); margin-bottom: 20px; }
.empty-state { color: var(--text-muted); font-style: italic; padding: 16px 0; }
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
    <div class="date-row">
      <label>Check-in <input type="date" id="date-checkin"></label>
      <label>Check-out <input type="date" id="date-checkout"></label>
    </div>
  </section>

  <section aria-label="Packages">
    <h2>Packages</h2>
    <div id="packages-grid" class="catalog-grid"></div>
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
  function nightsBetween(checkin, checkout) {
    const d1 = new Date(checkin + "T00:00:00");
    const d2 = new Date(checkout + "T00:00:00");
    const diff = (d2 - d1) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.round(diff));
  } // consolidated from client/utils.js
  function renderPackages() {
    const grid = document.getElementById("packages-grid"); grid.innerHTML = "";
    const nights = 0;
    const checkin = document.getElementById("date-checkin").value;
    const checkout = document.getElementById("date-checkout").value;
    const selectedNights = checkin && checkout ? nightsBetween(checkin, checkout) : 0;
    const filteredPackages = selectedNights > 0 ? Object.entries(PACKAGES).filter(([k, pkg]) => pkg.nights <= selectedNights) : Object.entries(PACKAGES);
    if (filteredPackages.length === 0 && selectedNights > 0) {
      grid.innerHTML = '<div class="empty-state">No packages available for these dates — try adjusting your stay.</div>';
      return;
    }
    for (const [key, pkg] of filteredPackages) {
      const card = document.createElement("div");
      card.className = "card";
      const includesHtml = pkg.includes.map(i => '<li>' + i + '</li>').join('');
      card.innerHTML = '<div class="img-placeholder">' + pkg.image + '</div>' +
        '<div class="theme-tag">' + pkg.theme + '</div>' +
        '<h3>' + pkg.name + '</h3>' +
        '<p>' + pkg.description + '</p>' +
        '<ul class="includes">' + includesHtml + '</ul>' +
        '<div class="price-range">' + pkg.priceRange + '</div>';
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Add package';
      btn.addEventListener('click', () => addPackage(key));
      card.appendChild(btn);
      grid.appendChild(card);
    }
  }
  function renderActivities() {
    const grid = document.getElementById("activities-grid"); grid.innerHTML = "";
    for (const [key, act] of Object.entries(ACTIVITIES)) {
      const card = document.createElement("div");
      card.className = "card";
      const variantsHtml = act.durations.map(v => '<span style="display:inline-block; padding:4px 8px; background:var(--warm-gray); border-radius:var(--radius-sm); margin-right:6px; font-size:0.8rem; font-weight:500;">' + v.label + '</span>').join('');
      card.innerHTML = '<div class="img-placeholder">' + act.image + '</div>' +
        '<h3>' + act.name + '</h3>' +
        '<div style="margin-bottom:10px;">' + variantsHtml + '</div>';
      const btn2 = document.createElement('button');
      btn2.className = 'btn btn-outline';
      btn2.textContent = 'Add activity';
      btn2.addEventListener('click', () => addActivity(key));
      card.appendChild(btn2);
      grid.appendChild(card);
    }
  }
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
    window.location.href = "/checkout?items=" + itemsStr;
  }
  document.getElementById("date-checkin").addEventListener("change", () => {
    const params = new URLSearchParams(window.location.search);
    params.set("checkin", document.getElementById("date-checkin").value);
    const url = new URL(window.location.href); url.search = params.toString(); window.history.replaceState({}, "", url.toString());
  });
  document.getElementById("date-checkout").addEventListener("change", () => {
    const params = new URLSearchParams(window.location.search);
    params.set("checkout", document.getElementById("date-checkout").value);
    const url = new URL(window.location.href); url.search = params.toString(); window.history.replaceState({}, "", url.toString());
  });
  renderPackages();
  renderActivities();
  updateCartUI();

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
    if (checkin) document.getElementById('date-checkin').value = checkin;
    if (checkout) document.getElementById('date-checkout').value = checkout;
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

</script>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
