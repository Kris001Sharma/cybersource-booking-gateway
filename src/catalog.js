// Single source of truth for prices. The front end/URL only ever sends SKUs,
// never amounts. Swap this for a Sheet/DB lookup later without touching
// anything else.

// Catalog prices defined here; new SKUs synchronized with src/config.js rooms array.
// For full customization (prices, descriptions, SKUs), edit src/config.js and reload the module.
// The embedded config module (src/config.js) is the single source of truth — site-config.json has been removed.
// Note: rooms/activities from config.js are referenced conceptually but not imported here to avoid redundant coupling.
export const CATALOG = {
  "room-single": { name: "Single Room", price: 50, type: "room" },
  "room-double": { name: "Double Room", price: 70, type: "room" },
  "room-suite": { name: "Suite", price: 120, type: "room" },
  "act-hike": { name: "Guided Hike", price: 20, type: "activity" },
  "act-spa": { name: "Spa Session", price: 30, type: "activity" },
  "act-dinner": { name: "Private Dinner", price: 25, type: "activity" },
  // Room SKUs from src/config.js rooms array (deluxe, twin, triple, family added per customization)
  "room-deluxe": { name: "Deluxe Room", price: 120, type: "room" },
  "room-twin": { name: "Twin Room", price: 90, type: "room" },
  "room-triple": { name: "Triple Room", price: 110, type: "room" },
  "room-family": { name: "Family Room", price: 130, type: "room" },
  // Not a real bookable item — only for validating gateway connectivity
  // with a minimal, safe amount. Remove before real production use.
  "test-item": { name: "Connectivity Test", price: 1, type: "test" },
};

export function priceCart(skus) {
  const items = [];
  let total = 0;
  for (const sku of skus) {
    const item = CATALOG[sku];
    if (!item) continue; // unknown SKU is silently dropped, not trusted
    items.push({ sku, name: item.name, price: item.price });
    total += item.price;
  }
  return { items, total: round2(total) };
}

export function computeDepositOptions(total) {
  let minDeposit;
  if (total <= 100) minDeposit = 1;
  else if (total <= 200) minDeposit = 20;
  else if (total <= 300) minDeposit = 30;
  else minDeposit = Math.round(total * 0.1);

  const pct10 = Math.max(minDeposit, round2(total * 0.1));
  return {
    deposit: round2(pct10),
    full: round2(total),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}