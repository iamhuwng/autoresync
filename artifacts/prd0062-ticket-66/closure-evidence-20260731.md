# PRD0062 #66 closure evidence — 2026-07-31

## Acceptance result

PASS. One selected component-PDF Unit now publishes atomically through #64's
canonical publication boundary with a complete immutable `NormalizedActivity`
and student-safe projection for every Activity slot.

The publication preserves component ownership, authoritative `sourceOrder`,
source-version pins, and source-qualified local pages. The adapter canonicalizes
component arrays and aggregate pages by `sourceOrder`, including when the
validated candidate's source array is not already ordered.

## Root-cause implementation

- The component adapter supplies canonical Activity Version payloads and safe
  projections to `createCanonicalBookAssemblyPublicationService`.
- The trusted command re-reads current candidate, authority, Activity payloads,
  source readiness, and preview approval, then binds the approval to exact
  canonical Activity fingerprints before publication.
- The Worker uses cryptographically random production IDs and the durable #64
  operation ledger. It binds an exact SHA-256 fingerprint of actor plus request
  to the operation. A successful exact retry replays from the ledger before
  mutable candidate/approval reads; changed reuse returns HTTP 409.
- Missing, extra, mis-keyed, changed, cross-component, stale, unauthorized,
  disabled, and source-not-ready inputs fail before the current pointer moves.
- The local teacher fixture reads every prepared canonical Activity Version and
  persists derived identity/version/fingerprint, operation, placement, Book
  provenance, component-order, ownership, and source-page evidence across
  reload.

## Verification

All commands ran from
`C:\Users\The Lord\Desktop\luyentap-writing-prd0062-reconciled`.

- Focused #66 adapter/command/Worker:
  `node scripts/harness/run-tool.mjs vitest . run
  src/services/book-assembly/componentPdfPublication.adapter.test.ts
  src/services/book-assembly/componentPdfPublication.command.test.ts
  src/__tests__/cloudflare/bookComponentPdfPublicationWorker.test.ts
  --typecheck.enabled --reporter=dot`
  — PASS, 3 files / 15 tests, no type errors.
- Adjacent canonical, transaction, security, full-PDF, and component-PDF
  regression matrix — PASS, 9 files / 52 tests.
- Cloudflare publication route composition:
  `node scripts/harness/run-tool.mjs vitest cloudflare run
  test/book-publication-route-handlers.test.ts --typecheck.enabled
  --reporter=dot`
  — PASS, 1 file / 8 tests, no type errors.
- `npm run lint -- --quiet` — PASS; Mantine boundary PASS.
- `npm run build` — PASS; 9,452 modules transformed; bundle budget PASS
  (root entry 241 KB).
- `node node_modules/@playwright/test/cli.js test
  --config=playwright.prd0062-ticket66.config.mjs`
  — PASS, 1/1 at `http://localhost:5173`, teacher quick-login, reload
  persistence, no console errors.
- Direct repository TypeScript audit — zero diagnostics in #66-owned adapter,
  command, Worker, route, smoke, and test paths. The remaining 50 diagnostics
  are pre-existing and outside #66 ownership.
- Independent acceptance review — PASS, no #66-owned blocker.
- Independent code review — PASS, no #66-owned blocker.

Browser evidence:

- `artifacts/prd0062-ticket-66/browser/desktop-1440.png`
- `artifacts/prd0062-ticket-66/browser/desktop-1440.json`

## Safety and scope

- Mode 1 remains rejected by the component-PDF adapter.
- Full-PDF publication regression evidence remains green.
- Feature gates and role checks remain default-deny.
- Disabling the component publication gate after a successful write does not
  remove the committed pointer or immutable manifest.
- No deployment, production activation, assembled student-shell, private-B2,
  or downstream final-suite claim is made.
- Generated rules/emulator proof remains transferred to #118; student runtime
  assembly remains #73; deployed/canary proof remains #134; destination route
  composition remains #59.
