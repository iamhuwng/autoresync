# PRD0062 #63 local closure evidence

Date: 2026-07-27

## Owned implementation

- Candidate-scoped, answer-safe Unit preview projection and approval fingerprint:
  `src/services/book-assembly/unitPreview.service.ts`.
- Teacher-only shared-frame preview host with memory-only response state:
  `src/components/books/assembly/BookAssemblyUnitPreview.tsx`.
- Exact candidate/source-set/registry identity mount guard:
  `src/components/books/BookAssemblyWorkspace.tsx`.
- Local preview/approval Worker handlers with current authority, candidate, source,
  activity, and request checks:
  `cloudflare/src/upload-worker/book-assembly/preview-worker.ts`.

## Local proof

- `rtk npm run test -- src/services/book-assembly/unitPreview.service.test.ts src/components/books/assembly/BookAssemblyUnitPreview.test.tsx src/components/books/BookAssemblyWorkspace.test.tsx src/components/books/BookMode2EditorShell.test.tsx`
  passed: 4 files, 32 tests.
- `rtk npm --prefix cloudflare test -- test/book-assembly-preview-worker.test.ts`
  passed: 1 file, 6 tests.
- `rtk node node_modules/@playwright/test/cli.js test --config=playwright.prd0062-ticket63.config.mjs --timeout=90000`
  passed: 3 teacher quick-login local-fixture browser tests at 1440px, 375px,
  and 320px. Each checks keyboard response entry, exit/reload state clearing,
  console errors, mobile 44px target, and 200%-reflow overflow safety.
- `rtk npm run lint -- --quiet` passed, including Mantine boundary.
- `rtk git diff --check` passed.

## Security and rollback boundary

- Projection exposes selected Unit only; tests deny answer keys, source-version
  IDs, provider URLs, and authoring-only fields.
- Worker tests deny unauthenticated/revoked role, foreign Book/candidate/Activity,
  stale candidate, unavailable source, malformed/oversized identifiers, and
  approval writes after any denial.
- Preview replies remain isolated in memory and clear on exit, reload, candidate
  revision, source-set revision, or registry revision change. When no exact
  preview projection is supplied, the control does not mount.
- Approval fingerprint changes when source-set or registry input changes.

## Destination-owned proof deliberately not claimed

- #59: canonical preview/approval route composition, dispatcher enforcement,
  route readback/probes/rollback.
- #128: activated canonical teacher-browser journey and full integration suite.
- #134: deployed/canary Firebase/private-B2 preview drill.

No canonical Worker route, source transport, delivery entitlement, publication,
student persistence, #50A capability, or #03B capability was enabled.
