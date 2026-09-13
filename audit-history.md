# Audit / Refactor — History & Improvement Notes (post-implementation)

Status: Implemented. Verbose step files removed; this is the retained reference.

## What was kept (and why)
- Internal routes (`/checkout/microform`, `/checkout/unified`, `/checkout/paylink`) — kept as default test playgrounds for module-level work; future improvements start at microform and replicate from there (`worker.js` lines 35, 37-42, unchanged).
- `/debug/phase1-test` — retained with `DEBUG_ENABLED` gate (`worker.js`:25-27); used for payer-auth troubleshooting.
- `renderMinimalLanding()` — already deleted before this pass (confirmed via grep); no action needed.
- Off-limits protected: `catalog.js`, `bookings.js`, `cybersource.js`, `methods/embedded/*`, `methods/hosted/paylink.js` — never touched.

## What was removed (dead code, confirmed via citation)
- `src/client/catalog-meta.js` — never imported (`grep -rn "catalog-meta" src/` → 0 hits); `landing.js` has inline `PACKAGES` (`metaScript`:5-24).
- `formatCurrency()` (`client/utils.js`:3-9) — never called; only reference was definition.

## What was consolidated (duplicate, behavior preserved)
- `nightsBetween()` — `landing.js` now imports from `client/utils.js` (`landing.js`:2); embedded logic matches `client/utils.js`:11 exactly.
- `injectThemeCSS()` — already shared via `theme.js`; all 3 pages (landing, checkout, confirmation) import same module.

## What can still be improved
- Font preload discrepancy: `checkout.js` uses dynamic `document.body.innerHTML` (no static `<head>` preload), unlike `landing.js`/`confirmation.js` which preload `fonts.googleapis.com` links. Not edited this pass to avoid structural behavior change in the checkout rendering path. If consistent preload is needed, inject links into the dynamic checkout head or adopt a shared preload wrapper.
- Internal method routes (`microform`/`unified`/`paylink`) are unreferenced by the current UI (`pages/*.js` has no links to them) but kept for independent module testing. If they're no longer needed for future builds, a clean removal would simplify `worker.js` route mapping.
- `tests/core.test.js` references removed `catalog-meta.js` but uses placeholder assertions (`expect(true).toBe(true)`); real test coverage could be added for validated behavior rather than placeholders.
