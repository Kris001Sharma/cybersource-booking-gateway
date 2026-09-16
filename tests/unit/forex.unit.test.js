import test from "node:test";
import assert from "node:assert/strict";
import { parseUsdBuyRate } from "../../src/forex.js";

test("NRB forex parser selects latest modified USD buy rate", () => {
  const result = parseUsdBuyRate({ data: { payload: [
    { date: "2026-09-15", published_on: "2026-09-15 00:00:00", modified_on: "2026-09-14 15:58:51", rates: [{ currency: { iso3: "USD" }, buy: "152.59", sell: "153.19" }] },
    { date: "2026-09-16", published_on: "2026-09-16 00:00:43", modified_on: "2026-09-15 16:11:18", rates: [{ currency: { iso3: "USD" }, buy: "153.24", sell: "153.84" }] },
  ] } });
  assert.deepEqual(result, { rate: 153.24, date: "2026-09-16", publishedOn: "2026-09-16 00:00:43", modifiedOn: "2026-09-15 16:11:18" });
});

test("NRB forex parser ignores sell and non-USD records", () => {
  assert.equal(parseUsdBuyRate({ data: { payload: [{ date: "2026-09-16", rates: [{ currency: { iso3: "EUR" }, buy: "176.80" }] }] } }), null);
});
