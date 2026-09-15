// Single source of truth for prices. The front end/URL only ever sends SKUs,
// never amounts. Swap this for a Sheet/DB lookup later without touching
// anything else.

// Catalog prices defined here; new SKUs synchronized with src/config.js rooms array.
// For full customization (prices, descriptions, SKUs), edit src/config.js and reload the module.
// The embedded config module (src/config.js) is the single source of truth — site-config.json has been removed.
import { packages, rooms } from "./config.js";

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

const PACKAGE_CATALOG = Object.fromEntries(packages.map((pkg) => [pkg.slug, pkg]));
const ROOM_CATALOG = Object.fromEntries(rooms.map((room) => [room.slug, room]));
for (const room of rooms) {
  CATALOG[room.slug] = { name: room.name, price: Number(room.pricePerNight) || 0, type: "room" };
}

export function getPackageFromSku(sku) {
  if (!sku || !sku.startsWith("pkg|")) return null;
  const [, slug, plan = "bb"] = sku.split("|");
  const pkg = PACKAGE_CATALOG[slug];
  if (!pkg) return null;
  return { pkg, plan: plan === "full" ? "full" : "bb" };
}

function numericPrice(value) {
  return Number(String(value ?? "").replace(/[^0-9.]/g, "")) || 0;
}

export function priceCart(skus, options = {}) {
  const items = [];
  let total = 0;
  const adults = Math.max(1, Number(options.adults) || 1);
  const children = Math.max(0, Number(options.children) || 0);
  const nights = Math.max(0, Number(options.nights) || 0);
  for (const sku of skus) {
    if (sku.startsWith("pkg|")) {
      const parsed = getPackageFromSku(sku);
      if (!parsed) continue;
      const { pkg, plan } = parsed;
      const adultPrice = numericPrice(plan === "full" ? pkg.fullBoard : pkg.bb);
      const lineTotal = round2(adultPrice * adults + adultPrice * 0.4 * children);
      items.push({ sku, name: pkg.name + " (" + (plan === "full" ? "Full Board" : "B&B") + ")", price: adultPrice, quantity: adults, children, nights: pkg.nights, total: lineTotal, type: "package" });
      total += lineTotal;
      continue;
    }
    const item = CATALOG[sku];
    if (!item) continue; // unknown SKU is silently dropped, not trusted
    const room = ROOM_CATALOG[sku];
    const quantity = room && nights > 0 ? nights : 1;
    const lineTotal = round2(item.price * quantity);
    items.push({ sku, name: item.name, price: item.price, quantity, nights: room ? nights : undefined, total: lineTotal, type: item.type });
    total += lineTotal;
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
