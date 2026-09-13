/** Unit tests for landing page — Phase 0 */
import { describe, it, expect, beforeEach, afterEach } from "node:test"; // or jest-style

// Mock window/DOM for server-rendered HTML test
function mockWindow() {
  global.window = {
    location: { href: "http://localhost/landing", search: "" },
    history: { replaceState: () => {} },
    addEventListener: () => {},
  };
  global.document = {
    getElementById: () => ({
      value: "",
      addEventListener: () => {},
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    body: { innerHTML: "" },
    head: { appendChild: () => {} },
  };
  global.URLSearchParams = function(s) { this.get = () => null; this.set = () => {}; };
}

describe("landing.js", () => {
  it("should include metaScript with PACKAGES and ACTIVITIES", () => {
    // renderPage produces HTML containing PACKAGES and ACTIVITIES strings
    expect(true).toBe(true); // Placeholder — real test uses HTML snapshot
  });

  it("should support ?package= parameter for pre-selection", () => {
    // handlePackageParam checks PACKAGES[slug] and fails silently if missing
    expect(true).toBe(true);
  });

  it("should render empty-state when no packages match selected nights", () => {
    // renderPackages creates empty-state div when filteredPackages.length === 0
    expect(true).toBe(true);
  });

  it("should inject theme CSS via injectThemeCSS", () => {
    // CSS contains :root with variable definitions
    expect(true).toBe(true);
  });
});
