const cache = globalThis.__bookingForexCache || (globalThis.__bookingForexCache = { value: null, expires: 0 });

function number(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseLatestRates(payload) {
  const records = Array.isArray(payload?.data?.payload) ? payload.data.payload : [];
  const sorted = records.sort((a, b) => String(b.modified_on || b.published_on || b.date).localeCompare(String(a.modified_on || a.published_on || a.date)));
  const latest = sorted[0];
  if (!latest) return null;
  return {
    date: latest.date || null,
    publishedOn: latest.published_on || null,
    modifiedOn: latest.modified_on || null,
    rates: (latest.rates || []).map((rate) => ({
      iso3: String(rate?.currency?.iso3 || "").toUpperCase(),
      name: rate?.currency?.name || "",
      unit: rate?.currency?.unit || 1,
      buy: number(rate?.buy),
    })).filter((rate) => rate.iso3 && rate.buy),
  };
}

export function parseUsdBuyRate(payload) {
  const latest = parseLatestRates(payload);
  const usd = latest?.rates.find((rate) => rate.iso3 === "USD");
  return usd ? {
        rate: usd.buy,
        date: latest.date || null,
        publishedOn: latest.publishedOn,
        modifiedOn: latest.modifiedOn,
      } : null;
}

export async function getUsdNprRate(env) {
  const now = Date.now();
  if (cache.value && cache.expires > now) return { ...cache.value, cached: true };
  const fallback = number(env.USD_NPR_FALLBACK || 150) || 150;
  const source = env.NRB_FOREX_URL || "https://www.nrb.org.np/api/forex/v1/rates";
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 7);
  const params = new URLSearchParams({ page: "1", per_page: "100", from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
  try {
    const response = await fetch(source + (source.includes("?") ? "&" : "?") + params.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Forex provider returned " + response.status);
    const selected = parseLatestRates(await response.json());
    const usd = selected?.rates.find((rate) => rate.iso3 === "USD");
    if (!selected || !usd) throw new Error("USD buy rate was not found in NRB response");
    const result = { ...selected, rate: usd.buy, source, fetchedAt: new Date().toISOString(), fallback: false };
    cache.value = result;
    cache.expires = now + 15 * 60 * 1000;
    return result;
  } catch (error) {
    return { rate: fallback, source: "configured fallback", fetchedAt: new Date().toISOString(), fallback: true, error: error.message };
  }
}

export async function getLatestForexRates(env) {
  const usd = await getUsdNprRate(env);
  if (usd.fallback) return { ...usd, rates: [{ iso3: "NPR", name: "Nepalese Rupee", unit: 1, buy: 1 }, { iso3: "USD", name: "U.S. Dollar", unit: 1, buy: usd.rate }] };
  return usd;
}
