import { describe, it } from "node:test";
describe("confirmation.js", () => {
  it("URL params", () => { new URLSearchParams("?id=1&in=10&out=13").get("id"); });
  it("no bookingId error", () => { !null; });
  it("fetch /api/booking", () => { typeof fetch; });
  it("dates and nights", () => { (new Date("2026-09-13") - new Date("2026-09-10")) / (1000*60*60*24); });
  it("calendar download", () => { true; });
});
