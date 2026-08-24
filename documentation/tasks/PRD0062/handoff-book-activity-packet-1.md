# Handoff: PRD0062 Packet 1 Activity Domain And Security Foundation

Status: CLOSED
Created: 2026-07-10
Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
Branch: `main`
HEAD at packet start: `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`

## Mission Ledger

Original mission: implement Packet 1 only for Activity domain and security foundation.

Current slice:
- Material Capability Registry.
- Activity schema/types.
- Candidate, draft, publish, projection, diff, and scoring services.
- Immutable publish behavior.
- Student-safe Activity projection.
- Hidden Interaction ID generation/preservation rules.
- RTDB `book_activity/*` rules.
- Backup/restore inventory for `book_activity`.
- Typed Material Catalog Book integration wrapper.
- Focused service, rules, backup/restore, boundary, and regression tests.
- Packet 1 docs, findings, traceability, and contract reconciliation.

Explicit non-actions:
- Packet 2 not started.
- No source PDF upload/rendition/grants touched.
- No Assembly UI, student runtime UI, Book Homework, updates/checkpoints/notifications, Course/Class/public delivery, or Live execution.
- No import/call/wrap/dependency on `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js`.
- No `ActivityBook` product or parallel Book storage system created.
- No staging or commit performed.

## Current State

Implemented owner paths:
- `src/types/bookActivity.types.ts`
- `src/services/book-activity/activitySchema.service.ts`
- `src/services/book-activity/activityCandidate.service.ts`
- `src/services/book-activity/activityPublish.service.ts`
- `src/services/book-activity/activityProjection.service.ts`
- `src/services/book-activity/activityDiff.service.ts`
- `src/services/book-activity/activityScoring.service.ts`
- `src/services/materialCatalog/materialCapabilityRegistry.service.ts`
- `src/services/materialCatalog/bookActivityBookIntegration.service.ts`
- `database.rules.json`
- `r2-backup-worker/src/backup/data-backup.ts`
- `r2-backup-worker/src/restore/restore-execute.ts`

Supporting touched paths:
- `src/types/materialCatalog.types.ts`
- `src/services/materialCatalog/materialSummaryPort.service.ts`
- `src/services/materialCatalog/materialIntegrationRegistry.ts`
- Packet 1 focused tests under `src/services/book-activity/`, `src/services/materialCatalog/`, `src/__tests__/security/`, and `r2-backup-worker/src/`.
- Packet 1 docs: `findings-book-activity-baseline.md`, `traceability-book-activity-v1.md`, `contracts-book-activity-packet-1.md`, `tasks-book-activity-01-domain-security-foundation.md`, this handoff.

Preserved unrelated dirty paths:
- `AGENTS.md`
- `README.md`
- `package.json`
- `playwright.config.js`
- `src/__tests__/setup.ts`
- `vitest.config.ts`
- `vitest.scripts.config.ts`
- PRD0062 Packet 2+ task docs and master orchestration docs that were dirty before this packet.

## Decisions And Constraints

- Packet 1 Activity domain stores use RTDB under `book_activity/*`.
- No Packet 1 Firestore store or `firestore.indexes.json` change.
- Editable Activity JSON rejects system/provenance fields and hidden Interaction IDs.
- V1 interaction families are only `choice`, `text-entry`, `matching`, `ordering`, `long-response`.
- Presentation modes are only `structured` and `source-assisted`.
- Context requirements are only `none`, `optional`, `required`.
- Generic Task Group, Task Set, and first-class Resource payloads are rejected.
- Hidden Interaction IDs are generated internally and preserved only when structure is exact-position safe.
- Published versions are create-only/immutable by service and RTDB rule.
- Student-safe projections strip answers, author-only fields, provenance internals, candidate data, and hidden IDs.
- Projection read is limited to `student` role plus owner/super-admin preview; delivery-grant narrowing remains Packet 7.
- Source-assisted concrete Book page mapping remains Packet 3 because placement/page-group contracts do not exist in Packet 1.

## Verification

Commands already run with exit code 0:
- `rtk npm test -- src/services/book-activity/activitySchema.service.test.ts src/services/book-activity/activityCandidate.service.test.ts src/services/book-activity/activityPublish.service.test.ts src/services/book-activity/activityProjection.service.test.ts src/services/book-activity/activityDiff.service.test.ts src/services/book-activity/activityScoring.service.test.ts src/services/book-activity/bookActivityDependencyBoundary.test.ts src/services/materialCatalog/materialCapabilityRegistry.service.test.ts src/services/materialCatalog/bookActivityBookIntegration.service.test.ts`
- `rtk npx firebase emulators:exec --only database "npm test -- src/__tests__/security/bookActivityFirebaseRules.test.ts"`
- `rtk npm --prefix r2-backup-worker test -- src/backup/data-backup.test.ts src/restore/restore-execute.test.ts`
- `rtk npm test -- src/services/materialCatalog/materialSummaryPort.service.test.ts src/services/materialCatalog/materialSummaryAdapters.service.test.ts src/services/materialCatalog/materialIntegrationRegistry.test.ts src/types/materialCatalog.types.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/books/CreateBookModal.test.tsx`
- `rtk npx tsc --noEmit`
- `rtk npm run build`

Final closure proof completed after review fixes:
- Focused service, rules/emulator, backup/restore, regression, type, and build commands above passed with exit code 0.
- `rtk git diff --check` passed with exit code 0.
- Stale-claim scans over touched Packet 1 docs passed with no contradictory closure wording.
- Final dirty/untracked inventory and changed-file list were recorded.
- Euler independent review re-check returned PASS.

## Review Evidence

First reviewer attempt (`Kuhn`, `gpt-5.4-mini` high) failed because of usage limit and produced no usable findings.

Second reviewer (`Euler`, `gpt-5.4-mini` high) reported three blockers:
- `database.rules.json` owner spoof write takeover on `book_activity/*`.
- Missing scoring coverage for accepted matching/ordering families.
- Draft `baseVersionId` lineage not preserved from a previous published version.

Main-thread fixes:
- Tightened RTDB writes to existing owner/material owner and added spoofed write denial checks.
- Added `activityScoring.service.test.ts` and objective scoring support for multiple-choice, matching, and ordering; rubric long response requires teacher review.
- Added `previousPublishedVersionId` support and candidate test assertion for draft lineage.

Euler re-check result: PASS. Packet 1 review blockers are closed.

## Post-Closure Re-Review

Verified defects found after the Euler re-check:
- Browser owners could create immutable Activity versions and student-safe projections. This violated PRD section 24.4 because the root super-admin rule could grant through the child boundary.
- Incomplete objective answer rules could reach scoring and silently return zero.

Fixes and current local proof:
- `database.rules.json` prevents the root super-admin grant from changing `book_activity`; browser writes to `versions` and `student_safe_projections` are false. Firebase emulator proof denies direct owner creation.
- `activitySchema.service.ts` requires complete/in-range objective keys; `activityScoring.service.ts` throws for malformed persisted objective versions.
- Focused 12-file Vitest: 38 tests passed. RTDB emulator: 2 tests passed. Full R2: 39 tests passed. Script suites: 74 tests passed. TypeScript and lint passed.
- Full app Vitest did not finish before the 5-minute shell limit and is recorded as harness timeout, not product proof. Do not claim it passed.

## Authority Reconciliation

Live authority files:
- `documentation/tasks/PRD0062/contracts-book-activity-packet-1.md`
- `documentation/tasks/PRD0062/traceability-book-activity-v1.md`
- `documentation/tasks/PRD0062/findings-book-activity-baseline.md`
- `documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md`

Packet 1 taskboxes are marked complete where source/tests/docs agree. Review and final stale-proof boxes are complete.

## Remaining Work

Packet 1 has no remaining closure work.

Packet 2 is not started and must remain blocked until explicitly approved.

## Suggested Next Prompt

Start PRD0062 Packet 2 only after explicit approval. Read Packet 1 handoff, contract, traceability, findings, and Packet 2 task/contract docs first. Preserve Packet 1 closed state and do not reopen Packet 1 unless a new verified defect appears.

## Sensitive Data Handling

No secrets, credentials, student submissions, source PDFs, or private production data were read or written. Rules tests used emulator fixture users only.

## Append-only current authority reconciliation — 2026-08-24

This handoff remains a historical Packet 1 record. The old
`activityPublish.service.ts`/test and Packet 1 RTDB path references are not
current source owners; the accepted split-root implementation and current
proof are recorded in the latest traceability and remaining-gates overlays.
Do not use the historical Packet 1 command list as current acceptance evidence.
