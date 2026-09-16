const cache = globalThis.__bookingForexCache || (globalThis.__bookingForexCache = { value: null, expires: 0 });

function number(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function findRate(payload) {
  const candidates = [payload?.rate, payload?.usdNpr, payload?.USDNPR, payload?.data?.rate, payload?.data?.usdNpr, payload?.rates?.NPR, payload?.data?.rates?.NPR];
  for (const candidate of candidates) {
    const rate = number(candidate);
    if (rate) return rate;
  }
  if (Array.isArray(payload)) {
    for (const row of payload) {
      const currency = String(row?.currency || row?.code || row?.isoCode || "").toUpperCase();
      if (currency === "USD" || currency === "US DOLLAR") {
        const rate = number(row?.buy || row?.buyRate || row?.buying || row?.sell || row?.sellRate || row?.rate);
        if (rate) return rate;
      }
    }
  }
  return null;
}

export async function getUsdNprRate(env) {
  const now = Date.now();
  if (cache.value && cache.expires > now) return { ...cache.value, cached: true };
  const fallback = number(env.USD_NPR_FALLBACK || 150) || 150;
  const source = env.NRB_FOREX_URL;
  if (!source) return { rate: fallback, source: "configured fallback", fetchedAt: new Date().toISOString(), fallback: true };
  try {
    const response = await fetch(source, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Forex provider returned " + response.status);
    const rate = findRate(await response.json());
    if (!rate) throw new Error("USD/NPR rate was not found in provider response");
    const result = { rate, source, fetchedAt: new Date().toISOString(), fallback: false };
    cache.value = result;
    cache.expires = now + 15 * 60 * 1000;
    return result;
  } catch (error) {
    return { rate: fallback, source: "configured fallback", fetchedAt: new Date().toISOString(), fallback: true, error: error.message };
  }
}
