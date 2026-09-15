/** URL-based cart + /api/quote integration */

export function getPackageParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get("package") || "";
}

export function getCart() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("items") || "";
  const skus = raw.split(",").map((s) => s.trim()).filter(Boolean);
  // Deduplicate while preserving order
  const seen = new Set();
  return skus.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

export function setCart(skus) {
  const deduped = [];
  const seen = new Set();
  for (const s of skus) {
    if (!seen.has(s)) {
      seen.add(s);
      deduped.push(s);
    }
  }
  const params = new URLSearchParams(window.location.search);
  if (deduped.length) params.set("items", deduped.join(","));
  else params.delete("items");
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.replaceState({}, "", url.toString());
  return deduped;
}

export function getDates() {
  const params = new URLSearchParams(window.location.search);
  const checkin = params.get("checkin") || "";
  const checkout = params.get("checkout") || "";
  const nights = checkin && checkout ? Math.max(0, Math.round((new Date(checkout + "T00:00:00") - new Date(checkin + "T00:00:00")) / (1000 * 60 * 60 * 24))) : 0;
  return { checkin, checkout, nights };
}

export function setDates(checkin, checkout) {
  const params = new URLSearchParams(window.location.search);
  if (checkin) params.set("checkin", checkin);
  else params.delete("checkin");
  if (checkout) params.set("checkout", checkout);
  else params.delete("checkout");
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.replaceState({}, "", url.toString());
}

export async function fetchQuote(skus, options = {}) {
  if (!skus.length) return { items: [], total: 0, deposits: { deposit: 0, full: 0 } };
  const params = new URLSearchParams({ items: skus.join(",") });
  for (const key of ["checkin", "checkout", "adults", "children"]) {
    if (options[key] !== undefined && options[key] !== "") params.set(key, String(options[key]));
  }
  const resp = await fetch(`/api/quote?${params.toString()}`);
  if (!resp.ok) throw new Error("Failed to fetch quote");
  return resp.json();
}

export async function addToCart(sku) {
  const current = getCart();
  const updated = [...current, sku];
  setCart(updated);
  return fetchQuote(updated);
}

export async function removeFromCart(sku) {
  const current = getCart();
  const updated = current.filter((s) => s !== sku);
  setCart(updated);
  return fetchQuote(updated);
}

export async function addPackage(packageMeta) {
  const current = getCart();
  const updated = [...current];
  for (const s of packageMeta.skus || []) {
    if (!updated.includes(s)) updated.push(s);
  }
  setCart(updated);
  return fetchQuote(updated);
}
