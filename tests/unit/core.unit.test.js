import { describe, it } from "node:test";
describe("core modules", () => {
  it("theme exports", async () => { const {theme,injectThemeCSS}=await import("../../src/client/theme.js"); injectThemeCSS(); });
  it("cart loads", async () => { const c=await import("../../src/client/cart.js"); typeof c.getCart; });
  it("catalog exports", async () => { const cfg=await import("../../src/config.js"); cfg.packages; cfg.activities; });
  it("utils load", async () => { const u=await import("../../src/client/utils.js"); u.nightsBetween("2026-09-10","2026-09-13"); });
});
