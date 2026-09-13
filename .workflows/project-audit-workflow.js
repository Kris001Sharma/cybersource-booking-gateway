export const meta = {
  name: 'project-audit-and-integration-guide',
  description: 'Verify PROJECT_STATUS.md against code/architecture and create end-to-end integration/setup guide for new clients',
  phases: [
    { title: 'Audit', detail: 'Compare code, architecture, commits, status doc for discrepancies' },
    { title: 'UpdateStatus', detail: 'Update PROJECT_STATUS.md with verified/current state' },
    { title: 'CreateGuide', detail: 'Write comprehensive integration/setup guide' },
    { title: 'Verify', detail: 'Adversarial review of both outputs' }
  ],
}

phase('Audit')

const auditResults = await parallel([
  () => agent('Read the full source tree (all .js files in src/), the architecture doc (payment-booking-subsystem-architecture.md), PROJECT_STATUS.md, audit-history.md, .dev.vars content, wrangler.toml, apps-script.gs. Identify ALL discrepancies: files mentioned in status but missing, files present but unmentioned, changed line references, outdated module statuses, missing webhook/credential info, new routes/features not documented. Also check git log vs documented commits. Return structured JSON-like report with categories: file_structure, module_status, webhook_state, credentials, architecture_divergence, updates_needed.', { label: 'audit:code-vs-doc', phase: 'Audit', schema: { type: 'object', properties: { file_structure: { type: 'object' }, module_status: { type: 'object' }, webhook_state: { type: 'object' }, credentials: { type: 'object' }, architecture_divergence: { type: 'array' }, updates_needed: { type: 'array' } }, required: ['file_structure','module_status','updates_needed'] } }),
  () => agent('Read .dev.vars (secrets), wrangler.toml, and check for any environment/config changes. Read apps-script.gs to understand the data layer. Read all pages (landing, checkout, confirmation). Identify any new routes, new environment variables, or changed configurations since Sep 5. Note the domain/subdomain setup, webhook URLs, and any client-facing URL patterns. Return structured findings.', { label: 'audit:config-env', phase: 'Audit' }),
  () => agent('Read all test files, docs/images/, .workflows/, .kilo/plans/, memory/ references. Check what documentation assets exist and what is missing. Note empty directories. Check if there are memory files that reference outdated info. Return findings.', { label: 'audit:docs-assets', phase: 'Audit' })
])

const audit = auditResults.filter(Boolean)
log('Audit complete. ' + audit.length + ' reports.')

phase('UpdateStatus')

// Read the current status file content to reference
const statusFilePath = 'D:\\3_Worspace\\_________WORK________\\Cybersource\\booking-poc\\PROJECT_STATUS.md'

const statusUpdatePrompt = 'Update PROJECT_STATUS.md at ' + statusFilePath + '. Read the full current file, then bring it fully current as of 2026-09-13. Key updates needed: (1) Update last-updated date. (2) Verify module statuses match actual code: Microform blocked on DAGGREJECTED / CARD_CATEGORY_ECI_REFUSED but tokenization/DDC/enrollment/step-up/validate all verified; Pay by Link working end-to-end with webhook PENDING_REVIEW (id 5ab8e3eb-e5fc-2094-e063-90588d0aaaba) and automated reconciliation NOT VIABLE; Unified Checkout session works (/uc/v1/sessions, NOT /up/v1/sessions), Google Pay shelved. (3) Update payer-auth section (authSetup/checkEnrollment/validateAuth all built and working). (4) Verify all file:line references in the status doc match current source. (5) Note completed audit: dead code removed (catalog-meta.js, formatCurrency), nightsBetween consolidated, injectThemeCSS shared. (6) Update webhook, external dependencies, next steps, and route map sections. Write FULL updated document.'

const updatedStatusAgent = await agent(statusUpdatePrompt, { label: 'update:project-status', phase: 'UpdateStatus', schema: { type: 'object', properties: { summary: { type: 'string' }, updates_applied: { type: 'array' }, file_path: { type: 'string' } }, required: ['summary','updates_applied'] } })

log('Status update submitted.')

phase('CreateGuide')

const guidePath = 'D:\\3_Worspace\\_________WORK________\\Cybersource\\booking-poc\\docs\\END_TO_END_SETUP_GUIDE.md'

const guidePrompt = 'Create a comprehensive end-to-end setup/integration guide at ' + guidePath + '. The guide must cover: (1) Overview of the module (Cloudflare Worker, CyberSource Microform/Unified Checkout/Pay by Link, Google Sheets). (2) Prerequisites and CyberSource account setup — exactly what to ask CyberSource/NIMB (REST API connection separate from Pay by Link; webhooks entitlement + digital signature key; settlement currency; minimum amount; network risk / payByLink disabled issue). (3) Domain/subdomain setup — Scenario A (Cloudflare domain + Cloudflare worker), Scenario B (external domain manager like GoDaddy/Namecheap), Scenario C (client uses different hosting/subsystem like AWS/Vercel/custom). Include exact DNS steps (CNAME/A records) and wrangler.toml custom domain config. (4) CyberSource configuration for diverse mode / new clients — Postman testing of /microform/v2/sessions, /uc/v1/sessions, /pts/v2/payments, /paylink/*; HTTP Signature auth; organization IDs and shared keys; sandbox vs production. (5) Integration with existing websites — link-based (Strikingly, WordPress, static HTML) with SKU URLs; inline parameter integration (?items=..., ?method=...); JavaScript embed/modal option; full API integration. Emphasize prices never come from client. (6) Module architecture — three separate payment modules explained, embedded vs hosted split, data flow. (7) Environment variables and secrets — complete list, how to set with wrangler secret put. (8) Deployment and testing — wrangler deploy, independent module testing, debug routes, reconciliation, end-to-end checklist. (9) Common issues and troubleshooting — DAGGREJECTED / CARD_CATEGORY_ECI_REFUSED, 3DS payer auth fix, webhook PENDING_REVIEW, reconciliation limitation, Google Pay needs separate console, payByLink disabled/network risk reset. (10) Security and PCI scope. (11) Next steps / expansion. Use professional structure with headings, bullet points, code blocks, exact URLs, exact Postman payload shapes, and clear step-by-step instructions. Make it easy to scan and implement. Write FULL file.'

const guideAgent = await agent(guidePrompt, { label: 'create:integration-guide', phase: 'CreateGuide', schema: { type: 'object', properties: { file_path: { type: 'string' }, sections_created: { type: 'number' }, word_estimate: { type: 'number' } }, required: ['file_path','sections_created'] } })

log('Guide creation submitted.')

phase('Verify')

const verifyPrompt = 'Read the updated PROJECT_STATUS.md (at ' + statusFilePath + ') and docs/END_TO_END_SETUP_GUIDE.md (at ' + guidePath + '). Check for accuracy of line references, truth of module statuses, completeness of guide sections, clarity of instructions, and missing information. Provide a verdict: CONFIRM or NEEDS_FIX with specific references.'

const verifyAgent = await agent(verifyPrompt, { label: 'verify:outputs', phase: 'Verify', schema: { type: 'object', properties: { verdict: { type: 'string' }, issues: { type: 'array' }, recommendations: { type: 'array' } }, required: ['verdict'] } })

log('Verification: ' + (verifyAgent ? verifyAgent.verdict : 'unknown'))

return {
  audit: audit,
  statusAgent: updatedStatusAgent,
  guideAgent: guideAgent,
  verifyAgent: verifyAgent
}
