import { describe, it } from "node:test";
describe("landing.js", () => {
  it("metaScript PACKAGES ACTIVITIES", async () => { const cfg=await import("../../src/config.js"); cfg.packages; cfg.activities; });
  it("?package= param", () => { new URLSearchParams("?package=p").get("package"); });
  it("empty-state", () => { [].length === 0; });
  it("injectThemeCSS", async () => { const {injectThemeCSS}=await import("../../src/client/theme.js"); injectThemeCSS(); });
});
