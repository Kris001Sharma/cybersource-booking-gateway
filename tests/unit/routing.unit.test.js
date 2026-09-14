import { describe, it } from "node:test";
describe("worker routing", () => {
  it("routes landing", async () => { const l=await import("../../src/pages/landing.js"); typeof l.renderPage; });
  it("routes checkout", async () => { const c=await import("../../src/pages/checkout.js"); typeof c.renderPage; });
  it("routes confirmation", async () => { const co=await import("../../src/pages/confirmation.js"); typeof co.renderPage; });
  it("routes api/quote", () => { typeof fetch; });
  it("routes webhook", () => { typeof Request; });
});
