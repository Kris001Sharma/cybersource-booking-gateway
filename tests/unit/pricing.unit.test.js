import test from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/catalog.js";

test("package pricing charges adults at full price and children at 40 percent", () => {
  const quote = priceCart(["pkg|package-3night-retreat|bb"], { nights: 3, adults: 2, children: 1 });
  assert.equal(quote.total, 672);
  assert.equal(quote.items[0].total, 672);
});

test("room pricing multiplies the nightly rate by selected nights", () => {
  const quote = priceCart(["room-deluxe"], { nights: 2, adults: 2, children: 0 });
  assert.equal(quote.total, 240);
  assert.equal(quote.items[0].nights, 2);
});
