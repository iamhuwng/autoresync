# Contract: PRD0062 Packet 1 Activity Domain And Security Foundation

Status: Packet 1 CLOSED.
Created: 2026-07-09

Primary PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

Storage design:
- `documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md`

## Mission Ledger

```text
ORIGINAL MISSION:
Implement Activity domain and security foundation for PRD0062.

CURRENT SLICE:
Packet 1 only: material capability registry, Activity schema/candidate/draft/version/projection/diff/scoring, rules, indexes, backup contract, typed boundaries, regression preservation.

PHASE STATE:
CLOSED. Source, tests, RTDB rules, backup/restore inventory, findings, traceability, review, and handoff agree for Packet 1.

IN SCOPE:
src/types/materialCatalog.types.ts
src/services/materialCatalog/materialCapabilityRegistry.service.ts
src/services/materialCatalog/materialSummaryPort.service.ts
src/services/materialCatalog/bookValidation.service.ts
src/services/materialCatalog/bookActivityBookIntegration.service.ts
src/types/bookActivity.types.ts
src/services/book-activity/activitySchema.service.ts
src/services/book-activity/activityCandidate.service.ts
src/services/book-activity/activityPublish.service.ts
src/services/book-activity/activityProjection.service.ts
src/services/book-activity/activityDiff.service.ts
src/services/book-activity/activityScoring.service.ts
database.rules.json
r2-backup-worker/src/backup/data-backup.ts
r2-backup-worker/src/restore/restore-execute.ts
new focused tests under src/services/book-activity/, src/services/materialCatalog/, src/__tests__/security/, and r2-backup-worker/src/

OUT OF SCOPE:
Assembly UI, source PDF upload/rendition/grants, student runtime UI, Book Homework, updates/checkpoints/notifications, Course/Class/public delivery, Live execution, legacy PDF parser.

COMPLETION BOUNDARY:
Packet 1 closes only when domain source, rules, tests, findings, traceability, storage design, and Packet 1 handoff agree.

SEPARATE APPROVAL GATES:
Packet 1 source changes, staging/commit, Packet 2 start, remote/deployed proof.

CURRENT BLOCKERS:
None for Packet 1. Delivery-grant narrowing and concrete Book page mapping remain later-packet scope.

NEXT DEPENDENCY:
Packet 2 source PDF delivery may depend on source/version identifiers but must not start here.

NON-ACTIONS:
Do not mark Packet 2+ taskboxes complete. Do not import or wrap `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js`.
```

## Entry State Proof

- `rtk git status --short --branch`: `## main...origin/main [ahead 7]` with dirty/untracked paths recorded in `findings-book-activity-baseline.md`.
- `rtk git status --short --untracked-files=all`: same dirty/untracked inventory.
- `rtk git rev-parse HEAD`: `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`.
- `git diff --name-only`: recorded in Packet 0 handoff; no staged paths.
- `git diff --cached --name-only`: empty.

Dirty path classification for Packet 1 start was refreshed before source edits; final dirty-path inventory remains required before PASS/BLOCKED response.

## Storage Contract

Packet 1 must implement or explicitly defer only these rows from `storage-design-book-activity-packet-0.md`:

| Store/path | Owner service/module | Immutable fields | Mutable fields | Indexes | Read authority | Write authority | Student-safe projection boundary | Archive/delete behavior | Backup coverage | Migration behavior | Per-store negative security tests |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `book_activity/materials/{activityId}` | `activitySchema.service.ts`; `activityPublish.service.ts` | `activityId`, `ownerId`, `createdAt`, origin/provenance pointer | title snapshot, lifecycle state, current draft/version pointers, archive state | RTDB `.indexOn`: `ownerId`, `lifecycleState`, `materialKind` | owner teacher/super_admin; public only through safe projection | owner service only | no student read; projection only | soft archive, referenced rows retained | `r2-backup-worker/src/backup/data-backup.ts` and `r2-backup-worker/src/restore/restore-execute.ts` RTDB inventory | new rows only | cross-owner/student read/write denied |
| `book_activity/drafts/{activityId}/{draftId}` | `activityCandidate.service.ts`; `activityPublish.service.ts` | `activityId`, `draftId`, `ownerId`, base version | editable JSON, validation state, revision counter | RTDB `.indexOn`: `ownerId`, `activityId`, `updatedAt` | owner only | owner service with expected revision | no student read | abandoned draft delete allowed | `r2-backup-worker/src/backup/data-backup.ts` and `r2-backup-worker/src/restore/restore-execute.ts` RTDB inventory | new rows only | stale revision and forbidden system IDs rejected |
| `book_activity/candidates/{candidateId}` | `activityCandidate.service.ts` | `candidateId`, owner, target, createdAt | validation status/errors, normalized payload | RTDB `.indexOn`: `ownerId`, `status`, `targetActivityId` | owner only | owner service only | no student read | expire abandoned candidates | `r2-backup-worker/src/backup/data-backup.ts` and `r2-backup-worker/src/restore/restore-execute.ts` RTDB inventory | none | invalid candidate cannot mutate draft/version |
| `book_activity/versions/{activityId}/{versionId}` | `activityPublish.service.ts`; `activityDiff.service.ts`; `activityScoring.service.ts` | `activityId`, `versionId`, normalized content, hidden Interaction IDs, publish metadata | none | RTDB `.indexOn`: `ownerId`, `publishedAt` | owner canonical read; students via projection only | publish service create-only | projected runtime payload strips answers/authoring | immutable while referenced | `r2-backup-worker/src/backup/data-backup.ts` and `r2-backup-worker/src/restore/restore-execute.ts` RTDB inventory | none | mutation denied; student canonical read denied |
| `book_activity/student_safe_projections/{activityId}/{versionId}` | `activityProjection.service.ts` | version binding, projection kind, safe runtime payload | regenerated only from canonical | RTDB `.indexOn`: `activityId`, `versionId`, `projectionKind` | students and owner/super-admin preview through safe projection only; delivery-specific narrowing is Packet 7 | projection service only | excludes answers, authoring, provenance, candidates | regenerate/delete only if no reference break | `r2-backup-worker/src/backup/data-backup.ts` and `r2-backup-worker/src/restore/restore-execute.ts` RTDB inventory | none | unsafe-field injection fails |
| planned `book_assembly/placements/...` binding shape | `placement.service.ts` later; Packet 1 type refs only if needed | placement identity/version refs | N/A in Packet 1 | N/A | N/A | N/A | N/A | N/A | N/A | N/A | bare `materialId` assumptions rejected in tests if shape appears |

## Rules / Security Contract

| Boundary | Positive authorization proof | Negative/mutation proof | Rules path/test | Required before PASS |
|---|---|---|---|---|
| Owner authoring | Owner teacher can create candidate/draft/publish via service | other teacher/student cannot read/write owner records | `database.rules.json` RTDB `book_activity/materials`, `drafts`, `candidates`, `versions`; `src/__tests__/security/bookActivityFirebaseRules.test.ts` | yes |
| Immutable versions | publish creates version and owner can read canonical | update/delete of published version denied while referenced | `database.rules.json` RTDB `book_activity/versions/$activityId/$versionId`; `src/__tests__/security/bookActivityFirebaseRules.test.ts` | yes |
| Student-safe projection | authorized runtime can read safe projection | canonical Activity, draft, candidate, answers, provenance, teacher notes denied | `database.rules.json` RTDB `book_activity/student_safe_projections/$activityId/$versionId`; `src/__tests__/security/bookActivityFirebaseRules.test.ts` | yes |
| Forbidden editable fields | service rejects `activityId`, `versionId`, `placementId`, owner/provenance, hidden Interaction IDs | mutation attempts fail closed and current draft/version unchanged | `src/services/book-activity/activitySchema.service.test.ts`; `src/services/book-activity/activityCandidate.service.test.ts` | yes |
| Capability registry order | `interactive-activity` appears only after registry support | direct unchecked kind use or missing capability fails closed | `src/services/materialCatalog/materialCapabilityRegistry.service.test.ts` | yes |
| Legacy parser exclusion | N/A positive | dependency scan rejects PRD0062 imports of forbidden parser paths | `src/services/book-activity/bookActivityDependencyBoundary.test.ts` | yes |

## UI Contract

- UI surfaces touched: N/A for Packet 1, except no visible UI if capability registry changes are purely service/type level.
- Triggered design/routing/observability/announcement/mobile rules: N/A unless Packet 1 adds user-visible actions or routes; then read matching rule first.
- Accessibility requirements: N/A.
- Browser proof required: not required for pure domain/security Packet 1.
- Browser proof not applicable because Packet 1 must not build Assembly or runtime UI.

## Migration / Compatibility Contract

| Existing behavior/data | Compatibility requirement | Test/proof | Fallback/rollback behavior |
|---|---|---|---|
| Existing Book node types and refs | `section`, `chapter`, `test`, placeholders still validate; Packet 1 must not add `unit` unless explicitly moved from Packet 3 | `src/services/materialCatalog/bookValidation.service.test.ts` exact titles from traceability | revert by removing new Activity-only registry/storage rows; no legacy data mutation |
| Existing material kinds | `grammar-worksheet`, `vocabulary-set`, `book`, Reading V2, Listening, Writing, THCS remain registered | `materialIntegrationRegistry` and material summary tests | fail closed for unknown producer |
| Existing public Book projection | remains public-safe and admin/super_admin controlled | `materialCatalogFirebaseRules.test.ts` public projection tests | do not loosen current rules |
| Existing Reading V2/Listening | no import dependency on Book Activity module | boundary scan/test | remove dependency; no shared-module backflow |

## Test Contract

| Proof class | Required? | Command | Working directory | Runner/config | Files/tests in scope | Notes |
|---|---|---|---|---|---|---|
| Local source proof | yes | `rtk npm test -- src/services/book-activity/activitySchema.service.test.ts src/services/book-activity/activityCandidate.service.test.ts src/services/book-activity/activityPublish.service.test.ts src/services/book-activity/activityProjection.service.test.ts src/services/book-activity/activityDiff.service.test.ts src/services/book-activity/activityScoring.service.test.ts src/services/book-activity/bookActivityDependencyBoundary.test.ts src/services/materialCatalog/materialCapabilityRegistry.service.test.ts src/services/materialCatalog/bookActivityBookIntegration.service.test.ts` | repo root | Vitest | new Book Activity service tests | exit 0 |
| Type/build proof | yes | `rtk npx tsc --noEmit`; `rtk npm run build` | repo root | TypeScript/Vite | touched TS files and production build | both exit 0 |
| Focused tests | yes | same focused service command above | repo root | Vitest | schema/candidate/publish/projection/diff/scoring/capability/boundary | exit 0 |
| Adjacent/regression tests | yes | `rtk npm test -- src/types/materialCatalog.types.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialIntegrationRegistry.test.ts src/services/materialCatalog/materialBooks.service.test.ts` | repo root | Vitest | Material Catalog/Book regression | preserve existing exact titles |
| Emulator/rules proof | yes | `rtk npx firebase emulators:exec --only database "npm test -- src/__tests__/security/bookActivityFirebaseRules.test.ts"` | repo root | Firebase database emulator/Vitest | `src/__tests__/security/bookActivityFirebaseRules.test.ts` | exit 0; denies student/cross-owner canonical access, denies cross-owner projection preview, allows student/owner safe projections |
| Browser proof | no | N/A | N/A | N/A | N/A | no UI in Packet 1 |
| Remote/deployed proof | no | N/A | N/A | N/A | N/A | no remote claim in Packet 1 |
| Rollback/recovery proof | partial | service-level rollback/idempotency tests | repo root | Vitest | publish/candidate failure tests | no deploy rollback |

## Authority Reconciliation

| Requirement / invariant | PRD section | Source owner path | Rules/security boundary | Test file + test title | Negative/mutation proof | Architecture/current-state doc | Findings row | Traceability row | Taskbox ID | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Central Material Capability Registry precedes `interactive-activity` | 6, 7, 9, 29 | `src/services/materialCatalog/materialCapabilityRegistry.service.ts` | N/A for registry module; Activity data uses `database.rules.json` `book_activity/*` | `src/services/materialCatalog/materialCapabilityRegistry.service.test.ts` `returns complete interactive-activity capabilities and fails closed when adapter is missing` | Missing capability/adapter denies picker/assignment/launch/result/projection | `documentation/architecture/book-activity-runtime-and-assembly.md`; this contract | Findings `F-P1-001` | `T-001`, `AC-ASM-02` | Component 01 / 1.0 | CLOSED |
| Activity schema/candidate/draft/version contracts | 6, 9 | `src/types/bookActivity.types.ts`; `src/services/book-activity/activitySchema.service.ts`; `src/services/book-activity/activityCandidate.service.ts`; `src/services/book-activity/activityPublish.service.ts` | `database.rules.json` RTDB `book_activity/materials`, `drafts`, `candidates`, `versions` | `src/services/book-activity/activitySchema.service.test.ts` `rejects mixed interaction families and multiple answer rules`; `src/services/book-activity/activityCandidate.service.test.ts` `validates declared Activity schema without semantic guessing or silent generation`; `src/services/book-activity/activityPublish.service.test.ts` `publishes immutable Activity versions and rejects version mutation` | Invalid candidate cannot mutate draft/publication; version mutation denied | same | `F-P1-002` | `T-002`, `AC-RUN-01`..`AC-RUN-06` | Component 01 / 2.0-4.0 | CLOSED |
| Hidden Interaction IDs app-managed | 6, 9, 14, 31 | `src/services/book-activity/activitySchema.service.ts`; `src/services/book-activity/activityPublish.service.ts`; `src/services/book-activity/activityDiff.service.ts` | `database.rules.json` RTDB `book_activity/candidates`, `drafts`, `versions`, `student_safe_projections` | `src/services/book-activity/activitySchema.service.test.ts` `rejects hidden Interaction IDs in editable JSON and preserves IDs only for exact-structure-safe revisions` | Hidden IDs not accepted from teacher JSON; unsafe reorder/new prompt gets redo classification | same | `F-P1-003` | `T-002`, `T-003`, `AC-RUN-06` | Component 01 / 3.0 | CLOSED |
| Student-safe Activity projections exclude answers/authoring/provenance | 9, 24, 31 | `src/services/book-activity/activityProjection.service.ts` | `database.rules.json` RTDB `book_activity/student_safe_projections/$activityId/$versionId`; canonical `book_activity` authoring paths deny students | Existing prior art: `src/services/reading-v2/readingV2Projection.service.test.ts` `generates student-safe and session-safe projections without answer keys or author-only fields`; new: `src/services/book-activity/activityProjection.service.test.ts` `generates student-safe Activity projections without answer keys or author-only fields` | Projection leak mutation with answer/provenance fields fails | same | `F-P1-004` | `T-003` | Component 01 / 5.0 | CLOSED |
| Semantic diff and grading/regrading classification | 20, 21, 31 | `src/services/book-activity/activityDiff.service.ts`; `src/services/book-activity/activityScoring.service.ts` | N/A; Packet 1 diff/scoring classification is pure service proof, update audits are Packet 6 | `src/services/book-activity/activityDiff.service.test.ts` `classifies Activity changes into no-redo regrade and redo-required outcomes`; `src/services/book-activity/activityScoring.service.test.ts` `scores supported objective Activity families and requires review for long-response rubric scoring` | prompt/choices/response-shape/source-context mutation classified redo; point/key/rubric no-redo/regrade as specified; supported objective families score without silent zero | same | `F-P1-005` | `T-011`, `AC-UPD-*` references for later dependency | Component 01 / 6.0 | CLOSED |
| Rules, indexes, backup coverage for Activity data | 29, 31 | `database.rules.json`; `r2-backup-worker/src/backup/data-backup.ts`; `r2-backup-worker/src/restore/restore-execute.ts` | `database.rules.json` RTDB `book_activity/materials`, `drafts`, `candidates`, `versions`, `student_safe_projections`; no `firestore.indexes.json` change for Packet 1 | `src/__tests__/security/bookActivityFirebaseRules.test.ts` `denies student and cross-owner access to Activity authoring records while allowing safe projections`; `r2-backup-worker/src/backup/data-backup.test.ts` `includes book_activity in RTDB backup coverage`; `r2-backup-worker/src/restore/restore-execute.test.ts` `restores book_activity RTDB data through the approved restore inventory` | owner/cross-owner/cross-student/canonical-vs-projection denial | same plus `documentation/rules/infrastructure.md` | `F-P1-006` | `AC-QS-05` | Component 01 / 7.0 | CLOSED |
| Typed integration boundaries | 31 | `src/services/materialCatalog/bookActivityBookIntegration.service.ts` | N/A | `src/services/materialCatalog/bookActivityBookIntegration.service.test.ts` `rejects invalid Activity-capable Book integration shapes through typed boundary` | no new invariant hidden in untyped seam | same | `F-P1-007` | `AC-QS-06` | Component 01 / 8.0 | CLOSED |
| Preserve existing Book/material behavior | 2, 31 | `src/types/materialCatalog.types.ts`; `src/services/materialCatalog/*`; `src/components/books/*` | `database.rules.json` material_catalog block | `src/services/materialCatalog/bookValidation.service.test.ts` `allows all node types to contain child nodes and material refs`; `src/services/materialCatalog/materialBooks.service.test.ts` `writes initial nodes and marks structural Books ready`; `src/components/books/CreateBookModal.test.tsx` `saves an empty draft Book with required metadata only` | existing public/private ref guards still reject unsafe rows | same | `F-P1-008` | `AC-ASM-01`, `AC-QS-06` | Component 01 / 9.0 | CLOSED |
| Forbidden legacy PDF parser not used | 2.6, 6, 28, 34 | N/A | N/A | `src/services/book-activity/bookActivityDependencyBoundary.test.ts` `keeps Book Activity independent from legacy PDF parser paths` | test rejects new PRD0062 production imports of `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js` | same | `F-P1-009` | `T-005`, `AC-QS-07` | Master stop condition | CLOSED |

## Evidence Acceptance Log

| Claim | Command | Working directory | Runner/config | Exit code | Files/tests in scope | Tests actually executed | Product failure or harness failure | Result |
|---|---|---|---|---|---|---|---|---|
| Packet 1 contract prepared | documentation baseline | repo root | N/A | N/A | this file | N/A | N/A | Packet 0 output |
| Fresh source state proof | `rtk git status --short --branch`; `rtk git status --short --untracked-files=all`; `rtk git rev-parse HEAD`; `rtk git diff --name-only`; `rtk git diff --cached --name-only` | repo root | RTK/Git | 0 | full worktree | dirty/untracked inventory classified before source edits; HEAD `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`; staged diff empty | N/A | passed |
| Focused Activity and capability services | `rtk npm test -- src/services/book-activity/activitySchema.service.test.ts src/services/book-activity/activityCandidate.service.test.ts src/services/book-activity/activityPublish.service.test.ts src/services/book-activity/activityProjection.service.test.ts src/services/book-activity/activityDiff.service.test.ts src/services/book-activity/activityScoring.service.test.ts src/services/book-activity/bookActivityDependencyBoundary.test.ts src/services/materialCatalog/materialCapabilityRegistry.service.test.ts src/services/materialCatalog/bookActivityBookIntegration.service.test.ts` | repo root | Vitest | 0 | Packet 1 service/capability/boundary tests | 9 files, 14 tests passed | N/A | passed |
| RTDB emulator security proof | `rtk npx firebase emulators:exec --only database "npm test -- src/__tests__/security/bookActivityFirebaseRules.test.ts"` | repo root | Firebase database emulator + Vitest | 0 | `book_activity/*` rules | 1 file, 2 tests passed, including spoofed owner write denials | expected permission-denied denials only | passed |
| Backup/restore inventory proof | `rtk npm --prefix r2-backup-worker test -- src/backup/data-backup.test.ts src/restore/restore-execute.test.ts` | repo root | Vitest in worker package | 0 | backup and restore inventory tests | 2 files, 4 tests passed | N/A | passed |
| Material Catalog/Book regressions | `rtk npm test -- src/services/materialCatalog/materialSummaryPort.service.test.ts src/services/materialCatalog/materialSummaryAdapters.service.test.ts src/services/materialCatalog/materialIntegrationRegistry.test.ts src/types/materialCatalog.types.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/books/CreateBookModal.test.tsx` | repo root | Vitest | 0 | adjacent Material Catalog and Book regression tests | 7 files, 56 tests passed | N/A | passed |
| Type proof | `rtk npx tsc --noEmit` | repo root | TypeScript | 0 | full TS project | no errors | first run exposed one `unknown` test-value issue; fixed and rerun | passed |
| Build proof | `rtk npm run build` | repo root | TypeScript + Vite | 0 | production build | build completed | N/A | passed |
| Independent review re-check | Euler subagent, `gpt-5.4-mini` high | repo root | read-only review | 0 | prior three blocker fixes | `git diff --unified=0 ...`; focused Vitest commands for rules/scoring/candidate all passed in reviewer workspace | N/A | PASS; all three findings closed |
| Post-closure re-review correction | current worktree review | repo root | source/rules review + Vitest + Firebase emulator | 0 | direct browser publish/projection and malformed objective scoring | focused 12-file Vitest: 38 tests passed; `firebase emulators:exec` rules test: 2 tests passed | prior full-app command timed out without result; this row records only executed focused/emulator proof | browser versions/projections denied; malformed objective rules fail closed |

## Review Plan

- Review requested after Packet 1 source, tests, findings, traceability, and docs were inspectable.
- Euler inspected source/rules/test diff and reported three blockers; main thread fixed all three.
- Euler re-check result: PASS; no remaining findings on the reviewed blocker set.
- Post-closure re-review found and fixed direct browser publish/projection authority plus malformed objective-key silent-zero behavior; see `F-P1-010` and `F-P1-011`.
- Main agent remains final PASS/BLOCKED owner.

## Exit Gate

- Packet 1 closed after exact test commands, focused/adjacent/regression results, emulator/rules negative proof, findings rows `F-P1-001` through `F-P1-011`, traceability updates, independent review re-check, and Packet 1 handoff agreed.

## Append-only current authority reconciliation — 2026-08-24

This Packet 1 contract is historical provenance, not current implementation
authority. Its old `activityPublish.service.ts` and Packet 1 path references
are superseded by the accepted split authoring/canonical Activity architecture.
The current source owners and current rule/test proof are recorded in the
latest traceability and remaining-gates overlays. The superseded service slice
was unreferenced by production code and is not a current dependency; no Packet
1 historical row is being rewritten as if its old paths were current.
