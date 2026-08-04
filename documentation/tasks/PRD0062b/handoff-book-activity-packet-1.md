# PRD0062b Packet P1 Handoff

Status: `VERIFIED`

## Current live contract

- Authority: amendment `043a6d9b1f96a76f200ea753ca353e0376be65a7` over baseline `9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd`.
- Start state: branch `main`, HEAD `7386a8e5b7a60b8fc07018a9878fad467157266c`, upstream `origin/main`, ahead 10, staged 0, broadly dirty.
- Packet boundary: P1 only. P2 source/Assembly/runtime behavior was neither implemented nor activated.
- Production Activity capability: structural Book attachment plus trusted projection publication. Operational placement, immutable resolver, launch, standalone assignment, and result adapters remain `unsupported`; `operationalPlacementReady: false`.
- Canonical projections: active teacher owner/super-admin direct read only; students denied and require later context-bound Book Delivery.
- Activity summaries: private, producer/kind/surface/version/projection coherent in every canonical index; public or malformed rows fail closed.
- Book picker/ref boundary: central capability adapter preserves legacy candidates and requires registry-owned safe projection plus immutable version proof.

## Historical/superseded evidence

- PRD0062 and PRD0062b/recovered files remain non-execution evidence and were not edited by this execution.
- Earlier operational-readiness, skipped-emulator, 110-test, and 23/23 Material Catalog claims are superseded by final evidence below.
- Historical PRD0062 governance failure remains preserved and unmodified.

## Packet-exit proof record

Repository-root cwd is `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased` unless noted.

| Command / action | Runner/config | Exit / actually executed | Covered | Omitted / classification |
|---|---|---|---|---|
| `rtk node node_modules/vitest/vitest.mjs run` with 22 explicit Activity/Material/Book service/type files | Vitest 3.2.4, root config | 0; 22 files/164 tests | schema, candidate, authoring, publish, projection, diff, scoring, storage, capability, producer, summary, Test Type, Book validation/editor, dependency boundary | Local source only; no P2 runtime/deployment |
| Isolated `materialBookCapabilityAdapter.service.test.ts bookEditor.service.test.ts` | Vitest 3.2.4 | 0; 2 files/9 tests | typed and legacy seam projection/version fail-closed mutations | Local only |
| Isolated `BookMaterialPicker.test.tsx` | Vitest 3.2.4/jsdom | 0; 1 file/4 tests | final picker capability/projection/version filtering | Local component only |
| Isolated `BookEditorWorkspace.test.tsx` | Vitest 3.2.4/jsdom | 0; 1 file/24 tests | canonical index loading, prop re-filtering, assignment fail-closed, existing editor behavior | Local component only |
| `CreateBookModal`, `BookNodeTree`, `BookEditorPage`, `BookEditorModal` | Vitest 3.2.4/jsdom | 0; 4 files/33 tests | existing Book create/tree/edit/modal regressions | Local component only |
| `rtk firebase emulators:exec ... bookActivityFirebaseRules.test.ts` | Firebase Database Emulator + Vitest 3.2.4 single fork | 0; 1 file/5 tests | malicious student/two-student/cross-owner/ancestor/direct-write/projection secrecy | Local emulator; not deployed |
| `rtk firebase emulators:exec ... materialCatalogFirebaseRules.test.ts` | Firebase Database Emulator + Vitest 3.2.4 single fork | 0; 1 file/24 tests | all five Activity summary index paths, 25 public/mismatch/projection/version mutations, Book/material rules | Local emulator; not deployed |
| `$env:XDG_CONFIG_HOME='C:\tmp\codex-xdg'; <bundled-x64-node> node_modules/vitest/vitest.mjs run --config vitest.config.mjs test/book-activity-authoring-worker.test.ts --reporter=verbose` | cwd `cloudflare`; Vitest 4.1.9 | 0; 1 file/14 tests | Worker auth, bounds, ETag/CAS, idempotency, revocation, no partial publication | Local Worker; VPW/Wrangler logging warnings were harness-only |
| Focused strict `tsc --noEmit ... vite-env.d.ts ...materialBookCapabilityAdapter.typecheck.ts ...P1 owners` | TypeScript, strict/bundler | 0; no diagnostics | typed Activity/Material/Book boundaries and two `@ts-expect-error` mutations | Excludes unrelated P2/source transitive debt |
| `npm.cmd exec vitest run src/backup/data-backup.test.ts src/restore/restore-execute.test.ts -t book_activity --reporter=verbose` | cwd `r2-backup-worker`; Vitest 3.2.4 | 0; 2 files/6 tests | `book_activity` plus Activity summary-index backup/restore inventory; required-node and collision failures | Local inventory; no remote R2 rehearsal |
| `rtk node ... bookActivityDependencyBoundary.test.ts --reporter=verbose` | Vitest 3.2.4 | 0; 1 file/2 tests | Reading V2/Listening and legacy PDF dependency isolation | Static/local dependency proof |
| Teacher browser flow on `http://localhost:5173` | live Vite app, dev quick-login session | PASS | real private Book, final picker, legacy Reading Passage/full-test candidates, zero console warning/error; unsaved section discarded; Book remained `draft-empty` | No remote Activity summary existed, so no remote Activity-row claim |
| `rtk node documentation/tasks/PRD0062b/check-canonical-plan.mjs` | Node canonical validator | 0; 8 components/748 rows | wording/order, recovery/amendment byte equality, contract sections, parent nesting, links, governed status | PRD0062b only |
| `npm.cmd run check:prd0062` | historical governance checker | 1; expected two findings | confirms preserved PRD0062 C02 `7.0`/`7.6` checked-parent to open `7.6c` failure | Historical non-P1 failure; deliberately not repaired |

Harness classification: initial x64 root Vitest failed before discovery due missing x64 Rollup optional dependency; restricted-sandbox root runs failed to read config; first Worker run failed before tests on Wrangler log permissions; first focused TSC omitted `vite-env.d.ts`; one combined UI run passed 37 assertions but exited 1 from unrelated toast timers after jsdom teardown. Healthy isolated/escalated reruns above supersede these harness failures.

## Review record

Specification/boundary review inspected authority, live diff, untracked P1 files, source, rules, tests, and evidence. It initially blocked public Activity-summary leakage and missing projection/version picker/ref bypasses. Corrections were re-reviewed to PASS. Independent code-quality review inspected registry, rules, domain/Worker CAS, Book seams, backup/restore, test quality, and dirty overlap; verdict PASS with no blocking finding.

Residual nonblocking risks: Activity broken-ref repair UI is not generalized beyond Reading Passage; replacement adapter misuse remains possible outside the constrained workspace caller; legacy `bookEditor.service.ts` remains `@ts-nocheck` behind typed guards; full-root Activity CAS history growth remains later operational work. No remote/deployed proof is claimed.

## Dirty-path classification

P1-owned/reconciled: capability/producer/summary/Test Type/Book adapter and picker/ref boundaries; Activity authoring/publish/projection; RTDB rules and emulator tests; Worker proof; backup/restore Activity inventory; PRD0062b-local authority/evidence; architecture current-state docs. All other dirty tracked/untracked work remains user-owned. No staging, commit, push, reset, restore, clean, stash, rebase, deployment, cloud mutation, or worktree removal occurred.

## Next exact P2 boundary

Do not begin automatically. Next prerequisite consumer is Component 02 `T-P2B0-001`: “Prove a distinct non-public source R2 bucket/binding and direct arbitrary disposable-object denial before Packet 2B source metadata/upload skeleton.” Its remote/private-R2 proof boundary remains wholly outside P1.
