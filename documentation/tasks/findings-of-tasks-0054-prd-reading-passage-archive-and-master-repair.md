# Findings - PRD-0054 Reading Passage Archive And Master Repair

## Packet 0 Baseline

- Packet: 0 - Baseline And Dependency Map
- Status: COMPLETE for baseline only
- Date/time: 2026-06-09 17:50:38 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- Commit: `d4738a4289921fefdb7edea665ac4e3592e1d9a0`
- Initial `git status --short`: clean output
- PRD-0052 Part 2 tasklist status: pending, not complete. No Phase 8 dependency handoff marks PRD-0054 master-repair dependency ready.

## Source Docs Read

- `AGENTS.md` - tracked
- `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md` - tracked
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md` - tracked
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md` - tracked
- `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md` - tracked
- `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md` - tracked
- `documentation/architecture/reading-v2-audit-trail.md` - tracked
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md` - tracked
- `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md` - tracked
- `documentation/tasks/PRD0048/reading-v2-test-making-pipeline.md` - tracked
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md` - tracked

## Required Phase 0 Commands

PASS:

```powershell
git status --short
```

Output: clean.

PASS:

```powershell
rg "archiveReadingV2PassageMaterial|archived|restore|broken|unavailable|delete|remove from library|where-used|duplicate|similarity" src documentation database.rules.json firestore.rules
```

Baseline signal: current archive function and UI call exist; docs define new PRD-0054 services; no source `restoreReadingV2PassageMaterial`, `readingV2BrokenReference.service.ts`, or PRD-0054 duplicate guard service exists.

PASS:

```powershell
rg "material_catalog|reading_passage_materials|full_test_compositions|Book|book_nodes|published_snapshots|material_indexes" src database.rules.json
```

Baseline signal: material catalog, Book, Reading Passage, full-test composition, and published snapshot paths exist; archive index, audit events, and duplicate index paths are absent from source/rules.

PASS:

```powershell
rg -n "restoreReadingV2|listArchivedReadingV2|archiveReadingV2|readingV2Audit|audit_events|duplicate_indexes|PassageDuplicate|BrokenReference|MasterEditModal|UpdateReferences|CompositionNumbering|assignment_payloads|RepairPanel" src functions database.rules.json firestore.rules documentation/tasks
```

Baseline signal: missing source owners confirmed. Hits are task docs plus pre-existing `archiveReadingV2PassageMaterial`.

## Current Owner Map

| Concern | Current owner | Evidence | Status |
|---|---|---|---|
| Reading Passage library/listing | `src/services/reading-v2/readingV2PassageLibrary.service.ts` | `listTeacherReadingPassages`, material catalog index paths | Existing |
| Reading Passage archive | `src/services/reading-v2/readingV2PassageLibrary.service.ts` | `archiveReadingV2PassageMaterial` at current owner; writes `state: archived`, `archivedAt`, `archivedBy`, removes active material indexes | Partial, not full PRD-0054 service |
| Archive UI call | `src/pages/TeacherLobbyPage.jsx` | imports and calls `archiveReadingV2PassageMaterial`; tracks `archiveReadingPassage` and `teacher_materials_reading_passage_archived` | Existing partial |
| Restore | none | no source `restoreReadingV2PassageMaterial` | Missing |
| Archive tab/list index | none | no dedicated owner-scoped archive index path found | Missing |
| Audit path/service | none in source | approved doc names `reading_v2/audit_events/{eventId}` and `readingV2AuditTrail.service.ts`; file/rules absent | Missing |
| Duplicate guard/index | none | no `readingV2PassageDuplicateGuard.service.ts`; no `reading_v2/duplicate_indexes/...` rules | Missing |
| Existing duplicate diagnostics | `src/config/readingV2Observability.ts` and import/studio diagnostics | `duplicateStructuredLayoutQuestion` style diagnostics only | Not PRD-0054 duplicate warning |
| Broken reference service | none | no `readingV2BrokenReference.service.ts` | Missing |
| Published master repair UI | none | `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx` missing | Missing and blocked |
| Existing edit frame internals | `src/components/test/editor/EditTestFrame.tsx` | generic frame chrome with `children`, tabs, `onSave`; `src/components/TestEditor.tsx` blocks Reading V2 payloads from legacy editor | Reuse not proven safe for ref-only composition |
| Master composition | `src/services/reading-v2/readingV2TeacherComposition.service.ts`, `src/services/reading-v2/readingV2FullTestComposition.service.ts` | composition refs exist but current selected-passage flow publishes full merged document | Partial |
| Master edit routing | `src/pages/TeacherLobbyPage.jsx` | Reading V2 edit goes to `TEACHER_READING_V2_REVISE` | Risk, no modal split |
| Book editor | `src/components/books/BookEditorWorkspace.tsx`, `BookNodeTree.tsx`, `BookMaterialPicker.tsx` | unavailable/fallback display paths and material ref editing exist | Partial |
| Book validation/services | `src/services/materialCatalog/bookValidation.service.ts`, `bookEditor.service.ts`, `materialBooks.service.ts` | Book node/ref validation, structure writes, public projection helpers | Partial |
| Book broken-ref repair | none dedicated | no restore/replace/remake flow owner for broken Book refs found | Missing |
| Assignment guards | `src/services/reading-v2/readingV2PassageHomework.service.ts` | blocks archived/inaccessible/missing projection for passage assignment | Partial, not master broken-ref guard |
| Runtime/launch | `src/services/reading-v2/readingV2LaunchIntegration.service.ts`, `src/pages/StudentPracticePage.tsx` | existing Reading V2 launch decisions and passage-set composition | Partial |
| Result/review | `src/services/reading-v2/readingV2ResultAdapter.service.ts`, `src/components/results/ReadingV2ReviewContentAdapter.tsx`, `functions/src/readingV2SubmitCore.ts` | frozen saved review payload and passage-set submission support | Existing |
| Routes | `src/constants/routes.ts`, `src/routes/teacherRoutes.tsx` | create/import/draft/revise routes only | Existing |
| Security rules | `database.rules.json`, `firestore.rules`, `src/__tests__/security/readingV2FirebaseRules.test.ts`, `materialCatalogFirebaseRules.test.ts`, `homeworkFirestoreRules.test.ts` | Reading V2/material catalog/security tests exist; audit/duplicate/archive-specific rule paths missing | Partial |
| Observability | `src/config/featureRegistry.ts`, `BookEditorWorkspace.tsx`, `TeacherLobbyPage.jsx`, `ReadingV2ReviewContentAdapter.tsx` | archive and Book actions exist; broken-ref repair/duplicate-warning actions absent | Partial |

## Current Archive Behavior

- `readingV2PassageLibrary.service.ts` owns a pre-existing `archiveReadingV2PassageMaterial`.
- `TeacherLobbyPage.jsx` calls that function from the Reading Passage row archive action.
- Current archive writes metadata/material/version `state: archived`, `archivedAt`, and `archivedBy`, then removes active material catalog index paths.
- Current archive does not write PRD-0054 audit events.
- Current archive does not expose a restore function.
- Current archive does not create a dedicated archive-subtab owner-scoped index.
- Current archive behavior must be reviewed in Packet 6 before reuse because PRD-0054 says immutable published snapshots must not be deleted or mutated unsafely.

## Current Broken-Ref Behavior

- `ReadingV2MasterEditModal.tsx` does not exist. PRD-0054 master repair UI tasks are blocked.
- `EditTestFrame.tsx` is a generic modal/frame shell that accepts children and settings tabs, but `TestEditor.tsx` explicitly blocks Reading V2 canonical payloads from entering the legacy editor. Packet 0 cannot prove `EditTestFrame` internals are safe for ref-only composition repair without Packet 4/5 PRD-0052 modal implementation.
- Book surfaces show unavailable refs enough to avoid crashes: `BookEditorWorkspace.tsx` classifies unavailable snapshot errors, `BookNodeTree.tsx` shows `Unavailable: {ref.availability}` and `needs repair`, and material refs carry availability states. This is not a complete PRD-0054 repair flow.

## Expected PRD-0052 Dependency Behavior

- Published master repair must happen in PRD-0052 `ReadingV2MasterEditModal`, not full-test Studio.
- Healthy passage edit/publish uses `Update references?` for owned masters/Books.
- Broken-ref remake auto-updates only its originating broken ref after the replacement passage is published.
- Because PRD-0052 Phase 8 is not ready, PRD-0054 Phase 5 must remain blocked.

## Missing Owners

- `src/services/reading-v2/readingV2AuditTrail.service.ts`
- `src/services/reading-v2/readingV2AuditTrail.service.test.ts`
- `src/services/reading-v2/readingV2PassageArchive.service.ts`
- `restoreReadingV2PassageMaterial`
- `listArchivedReadingV2PassagesForOwner`
- Owner-scoped archive index path, likely `material_catalog/material_archive_indexes/by_owner/{ownerId}/reading-passage/{materialId}` unless later architecture changes it
- `src/services/reading-v2/readingV2BrokenReference.service.ts`
- `src/services/reading-v2/readingV2BrokenReference.service.test.ts`
- `src/services/reading-v2/readingV2PassageDuplicateGuard.service.ts`
- `src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts`
- `reading_v2/audit_events/{eventId}` rules and tests
- `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}` rules and tests
- `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx`
- `src/components/reading-v2/master/ReadingV2MasterRepairPanel.tsx`
- Book broken-ref replacement/restore/remake flow owner
- Observability action ids for broken master refs, broken Book refs, ref repair, duplicate warning, and repair publish

## Blockers And Deferred Risks

- PRD-0054 Phase 5 blocked: `ReadingV2MasterEditModal.tsx` missing and PRD-0052 Phase 8 dependency is not ready.
- PRD-0054 duplicate foundation absent; Packet 2 must implement audit/duplicate foundations before PRD-0052 final acceptance can use duplicate warnings.
- PRD-0054 audit foundation absent; no append-only `reading_v2/audit_events/{eventId}` service/rules/tests exist.
- Current archive has no restore/audit/archive index behavior.
- Current Book behavior is fallback-visible, not repair-complete.
- Security rules lack PRD-0054 audit and duplicate index validations.
- Frozen result/review looks compatible, but archive/delete regression proof is deferred to later packets.

## Packet 0 Decision

Packet 0 baseline is complete. No PRD-0054 implementation phase is ready. Next recommended packet remains Packet 1 because PRD-0052 schema/numbering foundation must precede PRD-0054 master repair work. Packet 2 can later handle PRD-0054 audit and duplicate foundation.

## Packet 1 Dependency Note

- Packet: 1 - PRD-0052 Schema And Composition Numbering Foundation
- Date/time: 2026-06-09 18:13:19 +07:00
- PRD-0054 master repair dependency status: `BLOCKED`
- Reason: Packet 1 added the shared composition numbering owner and ref-only master schema/rules evidence only. `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx` is still absent, and PRD-0052 Phase 8 has not marked PRD-0054 dependency `READY`.
- New PRD-0054-compatible evidence: `src/services/reading-v2/readingV2CompositionNumbering.service.ts` owns `composeReadingV2CompositionNumbering()`, including `preserveBeforeOrder` repair semantics for "auto-renumber from this passage forward".
- Deferred PRD-0054 work remains unchanged: archive/audit/duplicate foundation, broken-reference service, master repair UI, Book repair UI, and duplicate warning surfaces.

## Packet 2 Findings - Audit And Duplicate Index Foundation

- Packet: 2 - PRD-0054 Audit And Duplicate Index Foundation
- Status: COMPLETE for PRD-0054 Phase 1A and Phase 1B scope only
- Date/time: 2026-06-09 18:30:22 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- Commit before packet: `d4738a4289921fefdb7edea665ac4e3592e1d9a0`

### Source Docs Read

- `AGENTS.md`
- `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md`
- `documentation/tasks/handoff-0052-0054-packet-1.md`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/architecture/reading-v2-audit-trail.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/tasks/process-task-list.md`

### Phase 1A Implementation Evidence

- Audit writer owner added: `src/services/reading-v2/readingV2AuditTrail.service.ts`.
- Approved audit path: `getReadingV2AuditEventPath(eventId)` returns `reading_v2/audit_events/{eventId}`.
- Writer entrypoint: `writeReadingV2AuditEvent(input, options)` builds and validates event before writing.
- Required field guard: `validateReadingV2AuditEvent()` fails closed for missing `eventId`, `createdAt`, `actorUserId`, `actorRole`, `action`, `entityType`, `entityId`, `correlationId`, `sourceFeatureId`, or `sourceRoute`.
- Unsafe field guard rejects nested or top-level unsafe content including `passageBody`, `bodyText`, `questionText`, `canonicalPayload`, `document`, `answerKey`, `answerKeys`, `correctAnswers`, `studentAnswers`, `scoringRule`, `aiReviewEvidence`, `hiddenProvenance`, and `importEvidence`.
- Legacy audit path was not extended. Tests assert audit writes do not target `audit_logs`.
- RTDB rules added at `database.rules.json` for `reading_v2/audit_events/{eventId}`:
  - create only with authenticated actor or super admin
  - no update/delete through append-only `!data.exists() && newData.exists()`
  - read super-admin only
  - unsafe top-level payload fields rejected
- Important rule hardening: `reading_v2` parent `.write` changed from super-admin-wide allow to `"false"` because RTDB parent `.write` grants cascade and would otherwise make child append-only rules unenforceable. Existing child rules still carry path-specific write grants.

### Phase 1B Implementation Evidence

- Duplicate guard owner added: `src/services/reading-v2/readingV2PassageDuplicateGuard.service.ts`.
- Approved duplicate index path implemented by `getReadingV2DuplicateIndexPath(ownerId, passageMaterialId)`: `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`.
- Index row builder: `buildReadingV2DuplicateIndexRow()` stores metadata, `currentVersionId`, active/archive state, owner id, title, source, test type, visibility, question count, updated timestamp, `bodyShingleHashes`, and `questionShingleHashes`.
- Index row guard: `validateReadingV2DuplicateIndexRow()` rejects unsafe payload fields including body text, question text, canonical payload, answers, scoring rules, AI evidence, hidden provenance, and import evidence.
- Formula implemented:
  - Unicode NFKC plus accent folding, lowercase, punctuation removal, whitespace collapse, stable token split
  - SHA-256 hex hashes for contiguous five-word body shingles
  - SHA-256 hex hashes for contiguous three-word question shingles
  - Sorensen-Dice for body and question hash sets
  - combined score `round((bodySimilarity * 0.5 + questionSimilarity * 0.5) * 100)`
  - warning threshold `>= 80`
- Guard behavior implemented:
  - excludes `currentMaterialId`
  - includes active accessible rows
  - includes the teacher's own archived rows
  - excludes non-owned archived rows
  - returns warning-only results with `blockPublish: false`
  - returns `use-existing`, `restore-and-use`, and `create-new-anyway` suggestions according to row state/ownership
- RTDB rules added at `database.rules.json` for `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`:
  - owner or super-admin read/write
  - row `ownerId` must match path owner id
  - row `passageMaterialId` must match path material id
  - `bodyShingleSize` must be `5`
  - `questionShingleSize` must be `3`
  - unsafe top-level payload fields rejected

### Tests Run

RED then PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2AuditTrail.service.test.ts src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic
```

Initial RED result:

- Audit service module missing.
- Duplicate guard service module missing.
- `reading_v2/audit_events` rules missing.
- `reading_v2/duplicate_indexes` rules missing.

Final PASS result:

- 3 test files passed.
- 23 tests passed.
- 7 Firebase emulator behavior tests skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set in this run.

### Deferred / Still Blocked

- No archive UI, restore UI, repair UI, Book repair UI, or duplicate warning UI surface was implemented in Packet 2.
- No PRD-0052 Packet 3 publish integration was implemented. Packet 3 can consume the duplicate guard/index.
- PRD-0054 master repair UI remains `BLOCKED`: `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx` is still absent, and PRD-0052 Phase 8 has not marked the dependency `READY`.
- Archive/restore data lifecycle remains for Packet 6.

## Packet 3 Dependency Note

- Packet: 3 - PRD-0052 Composition-First Publish Core
- Date/time: 2026-06-10 08:03:31 +07:00
- PRD-0054 duplicate guard/index dependency status for PRD-0052 Phase 2B: `CONSUMED`
- Evidence: `src/services/reading-v2/readingV2PublishPipeline.service.ts` now uses `findReadingV2PassageDuplicateMatches()`, `buildReadingV2DuplicateIndexRow()`, and `getReadingV2DuplicateIndexPath()` from `src/services/reading-v2/readingV2PassageDuplicateGuard.service.ts`.
- Auto-split publish writes generated passage duplicate index rows at `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}` and exposes warning-only duplicate matches through `duplicateWarnings`.
- Missing or stale duplicate index state blocks auto-split publish instead of falling back to broad canonical scans.
- PRD-0054 master repair dependency remains `BLOCKED`: `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx` is still absent, and PRD-0052 Phase 8 has not marked the dependency `READY`.

## Packet 4 Dependency Note

- Packet: 4 - PRD-0052 Published Master Modal And Draft Creation
- Date/time: 2026-06-10 08:42:47 +07:00
- PRD-0054 master repair dependency status changed from `modal absent` to `modal owner exists, repair still BLOCKED`.
- Evidence: `src/components/reading-v2/master/ReadingV2MasterEditModal.tsx` now exists and owns published/draft master metadata, passage order, owned-passage Studio handoff, draft save callback, publish callback, and refresh-version callback.
- Evidence: Teacher Lobby opens published Reading V2 master rows in the modal and creates unpublished draft masters from selected published Reading Passages.
- PRD-0054 master repair remains `BLOCKED` because Packet 4 intentionally did not implement assignment freeze UI, update references modal, archive/restore UI, repair UI, or PRD-0052 Phase 8 readiness marking.

## Packet 5 Dependency Note

- Packet: 5 - PRD-0052 Update References, Assignment Freeze, Runtime, Result, Handoff
- Date/time: 2026-06-10 10:46:00 +07:00
- PRD-0054 master repair dependency status: `READY`
- Evidence now available:
  - `src/components/reading-v2/master/ReadingV2UpdateReferencesModal.tsx` exists.
  - `src/services/reading-v2/readingV2ReferenceUpdate.service.ts` finds and applies selected owned master/book reference updates without mutating frozen assignments or result snapshots.
  - `src/services/reading-v2/readingV2ReferenceUpdateRepository.service.ts` durably applies selected owned full-test composition and Book node updates.
  - `src/pages/ReadingV2StudioPage.tsx` and `src/components/reading-v2/studio/ReadingV2StudioModalAdapter.tsx` now open update-reference choice UI after revised single-passage publish.
  - `src/services/reading-v2/readingV2PassageHomework.service.ts` adds assignment payload freeze and refresh-before-start helpers.
  - `src/services/reading-v2/readingV2AssignmentRefreshRepository.service.ts` loads latest composition/projections, writes frozen assignment payload first, then patches the homework pointer.
  - `src/pages/TeacherHomeworkDetailPage.tsx` exposes refresh-before-start UI for composition-backed Reading V2 homework using raw submission records.
  - `src/pages/StudentPracticePage.tsx` prefers frozen assignment payloads through `readingPassageSet.assignmentPayloadPath`.
  - `database.rules.json` includes sanitized RTDB rules for `reading_v2/projections/assignment_payloads/{assignmentPayloadId}`.
- Test/browser evidence:
  - `cmd /c npx vitest run src/services/reading-v2/readingV2ReferenceUpdate.service.test.ts src/services/reading-v2/readingV2ReferenceUpdateRepository.service.test.ts src/components/reading-v2/master/ReadingV2UpdateReferencesModal.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/services/reading-v2/readingV2StoragePaths.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2AssignmentRefreshRepository.service.test.ts src/pages/TeacherHomeworkDetailPage.test.tsx --reporter=basic` passed: 8 files, 27 tests.
  - Broader Packet 5 regression command passed: 13 files, 69 tests, 7 Firebase emulator behavior tests skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.
  - Browser proof loaded `http://localhost:5173/lobby` with title `Materials | MySTUdent Workspace`, Teacher Lobby tabs, and Materials list.
- Dependency decision:
  - PRD-0054 archive/repair Packet 6 may continue. Archive UI, restore UI, repair UI, and Book repair UI were intentionally not implemented in Packet 5.

## Packet 6 Findings - Archive Data And Broken Reference Services

- Packet: 6 - PRD-0054 Archive Data And Broken Reference Services
- Status: `COMPLETE`
- Date/time: 2026-06-10 13:18:09 +07:00
- Worktree: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/prd0052-material-tabs-inline`
- Commit before packet: `d4738a42`
- Scope attempted: PRD-0054 Phase 2 and Phase 3 only.

### Source Docs Read

- `AGENTS.md`
- `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md`
- `documentation/tasks/handoff-0052-0054-packet-5.md`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/rules/infrastructure.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/architecture/reading-v2-audit-trail.md`

### Phase 2 Implementation Evidence

- Added archive lifecycle owner: `src/services/reading-v2/readingV2PassageArchive.service.ts`.
- Implemented `archiveReadingV2PassageMaterial()`, `restoreReadingV2PassageMaterial()`, `listArchivedReadingV2PassagesForOwner()`, and `getReadingV2PassageUsageSummary()`.
- Archive writes only current material/metadata state fields and the lightweight archive index. It removes active material catalog index rows and writes an audit event through `reading_v2/audit_events/{eventId}`.
- Archive does not write to `reading_v2/published_snapshots/*` or `reading_v2/reading_passage_material_versions/*`, preserving immutable snapshots and published versions.
- Restore validates current version and student-safe projection before recreating active catalog indexes.
- Restore writes selected visibility as `private` or `public` active index rows, writes canonical public metadata as `public`, keeps legacy `library-eligible` read/rule compatibility, removes the archive index row, and writes a restore audit event.
- Added archive index path: `material_catalog/material_archive_indexes/by_owner/{ownerId}/reading-passage/{materialId}`.
- Archive index stores safe metadata only: material id, owner id, title, source/test-type strings when known, visibility, archived fields, current version id, question count, and optional `hasBrokenRefs`.
- Updated `src/services/reading-v2/readingV2PassageLibrary.service.ts` so active `private`/`public` lists exclude archived metadata and explicit `scope: 'archived'` returns owner archive rows.
- Updated `src/types/materialCatalog.types.ts` so `ReadingPassageListScope` includes `archived` without changing private/public visibility semantics.

### Phase 3 Implementation Evidence

- Added broken-reference owner: `src/services/reading-v2/readingV2BrokenReference.service.ts`.
- Broken-ref detector returns safe per-ref reasons: `archived`, `deleted`, `missing-version`, `missing-projection`, `inaccessible`, and `unknown`.
- Broken-ref detector returns repair affordances: `restore`, `choose-existing`, `remove-ref`, `clone-remake`, or `blocked`.
- Added `assertReadingV2MasterHasNoBrokenRefs()` and summary helper for assignment/publish guards.
- Added soft master remove owner: `removeReadingV2MasterComposition()` in `src/services/reading-v2/readingV2TeacherComposition.service.ts`.
- Soft master remove writes `state: removed`, `removedAt`, `removedBy`, removes active full-test catalog indexes, and writes `reading_master_removed` audit. It does not delete linked Reading Passage materials, immutable snapshots, assignments, or results.
- Assignment guard: `createReadingV2MasterHomeworkSet()` blocks removed/archived masters and masters with broken-ref summary fields.
- Launch guard: `resolveReadingV2LaunchDecision()` blocks removed/archived or broken current master metadata, while frozen assignment payload projections with `assignmentManifest` can continue without writing summary state.
- Publish guard: `publishReadingV2Material()` accepts optional `masterComposition` and blocks unresolved broken refs before creating writes.
- Broken-ref summary ownership decision: Phase 6 keeps listing badge writeback deferred. Archive, restore, repair, visibility-change, and reference-update services are the future write owners. Student launch paths and listing/card reads do not write broken-ref summary state.

### Rules Evidence

- `database.rules.json` adds `material_catalog/material_archive_indexes/by_owner/{ownerId}/reading-passage/{materialId}` rules with owner/admin read/write and unsafe-field rejection.
- `database.rules.json` hardens Reading V2 current material/master records toward soft state writes by requiring `newData.exists()` for `reading_passage_materials`, `material_metadata`, and `full_test_compositions`.
- Immutable published snapshots and material versions remain create-only through `!data.exists()` write rules.
- `src/__tests__/security/materialCatalogFirebaseRules.test.ts` verifies safe archive index rules.
- `src/__tests__/security/readingV2FirebaseRules.test.ts` verifies archive/restore/remove soft-state rules and immutable snapshot/version protection.

### Files Changed In Packet 6

- `src/services/reading-v2/readingV2PassageArchive.service.ts`
- `src/services/reading-v2/readingV2PassageArchive.service.test.ts`
- `src/services/reading-v2/readingV2BrokenReference.service.ts`
- `src/services/reading-v2/readingV2BrokenReference.service.test.ts`
- `src/services/reading-v2/readingV2PassageLibrary.service.ts`
- `src/services/reading-v2/readingV2PassageLibrary.service.test.ts`
- `src/services/reading-v2/readingV2TeacherComposition.service.ts`
- `src/services/reading-v2/readingV2TeacherComposition.service.test.ts`
- `src/services/reading-v2/readingV2PassageHomework.service.ts`
- `src/services/reading-v2/readingV2PassageHomework.service.test.ts`
- `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
- `src/services/reading-v2/readingV2LaunchIntegration.service.test.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
- `src/types/materialCatalog.types.ts`
- `src/types/materialCatalog.types.test.ts`
- `database.rules.json`
- `src/__tests__/security/readingV2FirebaseRules.test.ts`
- `src/__tests__/security/materialCatalogFirebaseRules.test.ts`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/handoff-0052-0054-packet-6.md`

### Deferred / Still Blocked

- Teacher Lobby archive UI, restore UI, master repair UI, Book repair UI, duplicate warning UI, and browser archive/repair proof remain deferred to Packet 7/8/9.
- No teacher master restore UI was added. V1 soft remove remains data/admin-recoverable only.
- No broken-ref summary list-card writeback was added in Packet 6; modal/service detection is the safe owner for now.
- Browser proof was not run for Packet 6 because no visible UI surface was exposed or changed. Archive/restore/repair UI proof belongs to Packet 7.

### Tests Run

RED then PASS:

```powershell
cmd /c npx vitest run src/types/materialCatalog.types.test.ts src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts --reporter=basic
```

Initial RED result: missing archive/broken service modules, missing master remove export, active lists still returned archived rows, no assignment/launch/publish broken-master guards, missing archive-index rules, and hard-delete-friendly current-record rules.

Final PASS result: 10 files passed, 90 tests passed, 13 Firebase emulator behavior tests skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.

## Packet 7 - Archive UI And Master Repair UI

- Packet: 7 - PRD-0054 Archive UI And Master Repair UI
- Status: `COMPLETE` for implemented UI/test scope; live restore/repair browser proof was partially blocked by current dev data/rules.
- Date/time: 2026-06-10 13:54:07 +07:00

### Phase 4 Implementation Evidence

- Teacher Lobby Reading Passage rows now use the active action label `Remove from library`.
- Reading Passage archive now opens an in-app confirmation modal instead of `window.confirm`.
- Archive confirmation shows usage counts for affected masters, Books, and assigned homework, plus a frozen-result safety note.
- Reading Passage scope control now supports `Private`, `Public`, and `Archive`.
- Archive-scope rows map to restore-only primary action behavior and no bulk selection.
- Restore UI opens an in-app restore modal with `Restore as Private` and `Restore as Public`.
- Restore calls `restoreReadingV2PassageMaterial()` and returns the restored row to the selected active scope.

### Phase 5 Implementation Evidence

- `ReadingV2MasterEditModal` now renders broken-ref warning state inside the existing master edit modal.
- Repair UI is in `ReadingV2MasterRepairPanel.tsx`; it receives broken-ref summary and callbacks from the modal and does not fetch canonical payloads.
- Broken-ref actions implemented: add existing passage, remove passage, remake manually, and restore source when the `restore` affordance is present.
- Mixed-Test-Type replacement requires explicit checkbox confirmation.
- Same-Test-Type replacement candidates sort first.
- Numbering review appears after add/remove/remake changes and publish is blocked until changed numbering is acknowledged.
- Publish is blocked while unresolved broken refs remain.
- Remake manually opens single-passage Studio through `TEACHER_READING_V2_CREATE` in a new tab target and does not invoke the normal full-test Studio repair path.
- Broken-ref remake publish does not show the normal `Update references?` modal.

### Observability Evidence

- Added feature-registry actions:
  - `reading_v2_master_broken_refs_viewed`
  - `reading_v2_master_ref_repair_started`
  - `reading_v2_master_ref_repaired_existing`
  - `reading_v2_master_ref_removed`
  - `reading_v2_master_ref_remake_started`
  - `reading_v2_master_repair_publish_submitted`

### Browser Proof Evidence

- Surface: in-app Browser / Chrome DevTools MCP.
- URL: `http://localhost:5173/lobby`.
- Server: Vite restarted on exact teacher port `5173` with PRD0052 material feature flags enabled.
- Session: already authenticated as Teacher dev account `teacher@test.com`.
- Active Reading Passage proof:
  - Expected: Reading Passage tab shows Private/Public/Archive scope controls and active rows use `Remove from library`.
  - Actual: PASS. Snapshot showed `Reading Passage` tab, `Private`, `Public`, `Archive`, six private Reading Passage rows, and `Remove from library` actions.
- Archive confirmation proof:
  - Expected: clicking `Remove from library` opens in-app confirmation modal.
  - Actual: PASS. Modal `Archive Reading Passage?` opened with usage counts `0 affected masters`, `0 affected Books`, `0 assigned homework`, frozen-result note, `Cancel`, and `Remove from library`. Action was cancelled to avoid mutating live dev data.
- Archive subtab proof:
  - Expected: Archive subtab loads archived rows with restore action when archived index is readable.
  - Actual: BLOCKED by live rules/data. Clicking Archive rendered `Reading Passages unavailable` / `Failed to load Reading Passages`; console logged `Failed to load Reading Passages: Error: Permission denied`. Screenshot: `output/packet7-archive-subtab-permission.png`.
- Master modal proof:
  - Expected: Reading V2 full-test edit opens existing `ReadingV2MasterEditModal`, not full-test Studio.
  - Actual: PASS. `Selected Reading Passages`, `PRD0052 QA Reading V2 Full Test 2026-06-03`, and `IELTS Cambridge 20 - Test 1: Reading` opened `Edit Reading V2 master` modal.
- Broken master repair proof:
  - Expected: broken-ref warning/actions appear when live master has broken refs.
  - Actual: BLOCKED by current live dev data. Visible live Reading V2 master rows opened with `No passage references yet`; no broken refs were present to repair in browser without seeding live data.

### Tests Run

PASS:

```powershell
cmd /c npx vitest run src/components/modern/SearchFilterBar.test.jsx src/components/modern/materialListAdapter.test.js src/pages/TeacherLobbyPage.test.jsx src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterRepairPanel.test.tsx src/config/featureRegistry.test.ts --reporter=basic
```

Result: 6 files passed, 71 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts --reporter=basic
```

Result: 3 files passed, 14 tests passed.

PASS:

```powershell
cmd /c npm run check:utf8 -- src/components/modern/SearchFilterBar.jsx src/components/modern/SearchFilterBar.test.jsx src/components/modern/materialListAdapter.js src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListRow.jsx src/components/reading-v2/master/ReadingV2MasterEditModal.tsx src/components/reading-v2/master/ReadingV2MasterEditModal.css src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterRepairPanel.tsx src/components/reading-v2/master/ReadingV2MasterRepairPanel.test.tsx src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.css src/pages/TeacherLobbyPage.test.jsx src/services/reading-v2/readingV2PassageLibrary.service.ts src/config/featureRegistry.ts src/config/featureRegistry.test.ts documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md documentation/tasks/handoff-0052-0054-packet-7.md
```

Result: UTF-8 check passed for 21 text files.

PASS:

```powershell
git diff --check
```

Result: no whitespace errors.

## Packet 8 - Book Repair And Duplicate Warning Surfaces

- Packet: 8 - PRD-0054 Book Repair And Duplicate Warning Surfaces
- Status: `COMPLETE` for Phase 6 and Phase 7 implementation/test/browser-proof scope.
- Date/time: 2026-06-10 15:08:52 +07:00

### Phase 6 Implementation Evidence

- `MaterialBookMetadata` now carries safe broken-ref index fields: `hasBrokenRefs`, `brokenRefCount`, and `brokenRefReasons`.
- Book validation detects archived, deleted/missing, inaccessible, missing-version, and missing-projection Reading Passage refs.
- Broken Books derive `needs-repair` status before ready/draft publishability.
- Book list rows and card rows copy only safe broken-ref summaries and do not hydrate canonical Reading V2 payloads.
- Book cards show broken-ref badges and a `Fix broken refs` action that opens the existing Book editor modal with repair focus.
- `BookEditorWorkspace` renders `Book broken refs` inside the existing Content tab, even when no node is selected.
- Book repair actions support replacing a broken ref with a published active passage, removing the broken ref while preserving sibling order, and showing `Restore source` only for owned archived refs.
- `BookNodeTree` shows broken ref reason labels beside affected refs.
- `BookMaterialPicker` supports repair mode with archived candidate visibility where needed.

### Phase 7 Implementation Evidence

- `ReadingV2DuplicateWarningPanel` renders non-blocking duplicate warnings from `ReadingV2AutoSplitDuplicateWarning`.
- `ReadingV2StudioShell`, `ReadingV2StudioModalAdapter`, `ReadingV2StudioPage`, and `readingV2StudioWorkflow.service.ts` preserve and surface `duplicateWarnings` from the Phase 1B duplicate guard/publish pipeline.
- Duplicate UI exposes active and archived matches with safe fields only: title, material id, state, similarity percent, and allowed actions.
- Duplicate UI actions implemented: `Use existing`, `Restore and use`, and `Create new anyway`.
- Feature registry includes visible Packet 8 actions:
  - `teacher_materials_book_ref_repaired_existing`
  - `teacher_materials_book_ref_removed`
  - `teacher_materials_book_ref_restore_started`
  - `reading_passage_duplicate_warning_shown`
  - `reading_passage_duplicate_use_existing`
  - `reading_passage_duplicate_restore_and_use`
  - `reading_passage_duplicate_create_new_anyway`
- Existing duplicate formula/index service was consumed; Packet 8 did not reimplement similarity or run broad canonical content scans.

### Browser Proof Evidence

- Browser surface: in-app Browser was attempted first; it reached `http://localhost:5173/lobby` but returned an empty DOM snapshot after reload while blocked telemetry logs flooded the bridge. Chrome DevTools MCP was used for reliable DOM/screenshot proof on the same localhost server.
- Server: existing Vite listener on exact teacher port `5173`.
- Session: Teacher dev session already active.
- Book repair modal proof:
  - URL: `http://localhost:5173/lobby`.
  - Viewport: desktop 1280 x 720, mobile 390 x 844.
  - Material id/title: visible live Book `Testing Book`.
  - Expected: Book editor opens as modal, not route page; Content tab keeps 3-tab contract and exposes repair surface.
  - Actual: PASS. Dialog `Testing Book` opened on `/lobby`; tabs `Overview`, `Content`, `Settings` rendered; Content tab contained region `Book broken refs` and healthy state `All Book refs are usable.`
  - Screenshots: `artifacts/packet-8-book-repair-modal.png`, `artifacts/packet-8-book-repair-modal-mobile.png`.
- Broken Book repair proof:
  - Expected: broken refs list replacement/removal/restore affordances.
  - Actual: PASS in automated UI tests. Live dev Book had no broken refs, so browser proof did not mutate or seed live data.
- Duplicate warning proof:
  - URL: `http://localhost:5173/__smoke/reading-v2-studio?fixture=task-true-false-not-given&duplicateWarning=both`.
  - Viewport: desktop 1280 x 720, mobile 390 x 844.
  - Expected: publish completes, duplicate warning is visible/non-blocking, active duplicate offers `Use existing`, archived duplicate offers `Restore and use`, and both allow `Create new anyway`.
  - Actual: PASS. After `Publish`, status showed `Published successfully` and region `Duplicate Reading Passage warning` showed `non-blocking`, `Existing active passage` at `94% similar`, `Archived matching passage` at `91% similar`, buttons `Use existing`, `Restore and use`, and `Create new anyway`.
  - Action proof: clicked `Use existing`, `Restore and use`, and `Create new anyway`; smoke action logs grouped under `[Diag][ReadingV2PasteImportGate] studio_action`.
  - Screenshots: `artifacts/packet-8-duplicate-warning.png`, `artifacts/packet-8-duplicate-warning-mobile.png`.

### Tests Run

PASS:

```powershell
cmd /c npx vitest run src/pages/ReadingV2StudioSmokePage.test.tsx src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/reading-v2/studio/ReadingV2DuplicateWarningPanel.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx --reporter=basic
```

Result: 10 files passed, 66 tests passed.

PASS:

```powershell
cmd /c npx vitest run src/components/books/BookEditorModal.test.tsx --reporter=basic
```

Result: 1 file passed, 8 tests passed.

PASS:

```powershell
cmd /c npm run check:utf8 -- documentation/tasks/handoff-0052-0054-packet-8.md
```

Result: UTF-8 check passed for 1 text file after final handoff update. Earlier full Packet 8 UTF-8 check passed for 33 text files.

PASS:

```powershell
git diff --check
```

Result: no whitespace errors.

### Files Changed In Packet 8

- `src/types/materialCatalog.types.ts`
- `src/services/materialCatalog/bookValidation.service.ts`
- `src/services/materialCatalog/bookValidation.service.test.ts`
- `src/services/materialCatalog/bookEditor.service.ts`
- `src/services/materialCatalog/bookEditor.service.test.ts`
- `src/services/materialCatalog/materialBooks.service.ts`
- `src/services/materialCatalog/materialBooks.service.test.ts`
- `src/components/modern/BookCard.jsx`
- `src/components/modern/BookCard.css`
- `src/components/modern/BookCardGrid.jsx`
- `src/components/modern/BookCardGrid.test.jsx`
- `src/components/books/BookEditorWorkspace.tsx`
- `src/components/books/BookEditorWorkspace.css`
- `src/components/books/BookEditorWorkspace.test.tsx`
- `src/components/books/BookNodeTree.tsx`
- `src/components/books/BookNodeTree.test.tsx`
- `src/components/books/BookMaterialPicker.tsx`
- `src/components/books/BookMaterialPicker.test.tsx`
- `src/components/reading-v2/studio/ReadingV2DuplicateWarningPanel.tsx`
- `src/components/reading-v2/studio/ReadingV2DuplicateWarningPanel.css`
- `src/components/reading-v2/studio/ReadingV2DuplicateWarningPanel.test.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioModalAdapter.tsx`
- `src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx`
- `src/services/reading-v2/readingV2StudioWorkflow.service.ts`
- `src/pages/ReadingV2StudioPage.tsx`
- `src/pages/ReadingV2StudioSmokePage.tsx`
- `src/config/featureRegistry.ts`
- `documentation/tasks/tasks-0052-0054-master-implementation-orchestration.md`
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`
- `documentation/tasks/handoff-0052-0054-packet-8.md`

### Deferred / Still Open

- Packet 9 still owns assignment/runtime/result/security/docs final sweep.
- Live browser Book repair with actual broken refs was not seeded because Packet 8 avoided live data mutation; automated UI tests cover broken replacement, removal, restore visibility, and unsafe payload non-exposure.

### Follow-up Mock Data Added For Browser Testing

- Added dev/test-only route: `http://localhost:5173/__smoke/book-editor`.
- Supported fixtures:
  - `fixture=healthy`
  - `fixture=broken-refs`
  - `fixture=non-owned-archived-ref`
  - `fixture=all-broken-ref-reasons`
  - direct single-reason aliases: `missing`, `inaccessible`, `missing-version`, `missing-projection`
- Fixture coverage:
  - owned archived source shows `Removed`, replacement selector, `Replace broken ref`, `Remove broken ref`, and `Restore source`.
  - non-owned archived source shows `Removed`, replacement/removal actions, and hides `Restore source`.
  - all-reasons fixture shows `Removed`, `Missing`, `No access`, `Missing version`, and `Missing projection`.
  - replacement candidates include hidden mock fields `canonical-payload-secret` and `answer-key-secret`; UI tests verify these strings are not exposed.
- Browser proof:
  - `http://localhost:5173/__smoke/book-editor?fixture=all-broken-ref-reasons` rendered all reason labels, six `Replace broken ref` actions, six `Remove broken ref` actions, and one owned `Restore source`.
  - `http://localhost:5173/__smoke/book-editor?fixture=non-owned-archived-ref` rendered the non-owned archived warning and no `Restore source` action.
  - Screenshots: `artifacts/book-editor-smoke-all-broken-ref-reasons.png`, `artifacts/book-editor-smoke-non-owned-archived.png`.

PASS:

```powershell
cmd /c npx vitest run src/pages/BookEditorSmokePage.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookEditorModal.test.tsx src/config/featureRegistry.test.ts --reporter=basic
```

Result: 4 files passed, 38 tests passed.

Final Packet 8 PASS:

```powershell
cmd /c npx vitest run src/pages/BookEditorSmokePage.test.tsx src/pages/ReadingV2StudioSmokePage.test.tsx src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/reading-v2/studio/ReadingV2DuplicateWarningPanel.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/config/featureRegistry.test.ts --reporter=basic
```

Result: 13 files passed, 91 tests passed.

## Packet 9 Safety Sweep, Docs, And Final Integration

- Packet: 9 - PRD-0054 Safety Sweep, Docs, And Final Integration
- Date/time: 2026-06-10 18:36-22:27 +07:00
- Status: `COMPLETE`

### Implementation Evidence

- Audit service validation now rejects unknown `actorRole`, unknown `action`, and unknown `entityType`.
- Database rules now enforce PRD-0054 audit action, actor role, and entity-type allowlists for `reading_v2/audit_events/{eventId}` creates.
- Duplicate-warning decisions now write append-only Reading V2 audit events for use-existing, restore-and-use, and create-new-anyway decisions. `reading_passage_duplicate_warning_shown` remains feature/observability-only.
- Book repair actions write audit events for replace, remove, and restore-start decisions from `BookEditorWorkspace`.
- Master broken-ref repair actions write audit events for replace-existing, remove-ref, and restore-source-started decisions from `TeacherLobbyPage`.
- Audit failure from duplicate-decision audit write emits observability action `reading_passage_duplicate_audit_failed`; it does not create a second audit path.
- Frozen assignment safety was strengthened with tests for assignment-pinned payload reads and missing-payload fail-closed behavior.

### Targeted Tests

- PASS: `cmd /c npx vitest run src/services/reading-v2/readingV2AuditTrail.service.test.ts src/services/reading-v2/readingV2PassageDuplicateGuard.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic` - 3 files, 28 tests, 7 emulator-gated skipped.
- PASS: `cmd /c npx vitest run src/types/materialCatalog.types.test.ts src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts --reporter=basic` - 3 files, 19 tests. Initial stale enum expectations failed for `needs-repair`, `missing-version`, and `missing-projection`; expectations were corrected to match implemented PRD-0054 types, then rerun passed.
- PASS: `cmd /c npx vitest run src/pages/TeacherLobbyPage.test.jsx src/components/modern/SearchFilterBar.test.jsx src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListRow.test.jsx --reporter=basic` - 4 files, 52 tests.
- PASS: `cmd /c npx vitest run src/services/reading-v2/readingV2BrokenReference.service.test.ts src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/components/reading-v2/master/ReadingV2MasterEditModal.test.tsx src/components/reading-v2/master/ReadingV2MasterRepairPanel.test.tsx --reporter=basic` - 4 files, 21 tests.
- PASS: `cmd /c npx vitest run src/pages/BookEditorSmokePage.test.tsx src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx --reporter=basic` - 9 files, 72 tests.
- PASS: `cmd /c npx vitest run src/components/reading-v2/studio/ReadingV2DuplicateWarningPanel.test.tsx src/components/reading-v2/studio/ReadingV2StudioModalAdapter.test.tsx src/pages/ReadingV2StudioSmokePage.test.tsx --reporter=basic` - 3 files, 6 tests.
- PASS: `cmd /c npx vitest run src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts src/pages/StudentPracticePage.test.tsx src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/services/reading-v2/readingV2PublishPipeline.service.test.ts --reporter=basic` - 7 files, 75 tests.
- PASS: `cmd /c npx vitest run src/constants/routes.test.ts src/routes/teacherRoutes.test.tsx src/config/featureRegistry.test.ts src/services/reading-v2/readingV2AuditTrail.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic` - 7 files, 115 tests, 17 emulator-gated skipped.

### Browser Evidence

Browser surface: Chrome DevTools MCP on exact `http://localhost:5173/` for Teacher proof and `http://localhost:5174/` for Student proof per repo live-browser role-port rule. In-app browser API attach timed out during final proof setup, so Chrome DevTools was used. Teacher dev session was already active; Student proof used explicit logout and Student quick-login.

- Surface: Reading Passage live archive and restore.
  - URL: `http://localhost:5173/lobby`.
  - Viewport: 1440 x 960 desktop.
  - IDs: teacher `glMHCrzMnyS6AqFcb9I0nlOqQ6X2`; passage `packet9-live-20260610151227-passage`; snapshot `packet9-live-20260610151227-snapshot-v1`; composition version `packet9-live-20260610151227-composition-v1`.
  - Expected: active list shows disposable Reading Passage, archive dialog shows reversible warning, Archive subtab lists archived row with restore, restore returns row to active list, and successful re-archive removes it from active list.
  - Actual: PASS. Active row showed `Open`, `Assign homework`, `Revise`, `Remove from library`; archive dialog showed affected counts and frozen-snapshot safety copy; Archive subtab listed row with `View read-only` and `Restore`; restore dialog offered private/public restore; restored row returned to active list; final archive removed it from active list.
  - Screenshots: `artifacts/packet-9-browser-proof/13-live-active-before-archive-5173.png`, `14-live-archive-dialog-5173.png`, `15-live-archive-row-after-rule-fix-5173.png`, `16-live-restore-dialog-5173.png`, `17-live-restored-active-5173.png`, `18-live-active-after-successful-archive-5173.png`.
  - Audit evidence: `reading_passage_archived` and `reading_passage_restored` events were read from `reading_v2/audit_events` with actor role `teacher`, source route `/lobby`, and expected archive/restore feature IDs.
- Surface: Book broken-ref repair smoke fixture.
  - URL: `http://localhost:5173/__smoke/book-editor?fixture=all-broken-ref-reasons`.
  - Viewports: 1366 x 900, 848 x 900, 375 x 812, 320 x 812.
  - IDs: `Smoke Book - All Broken Ref Scenarios`; refs `Owned archived source`, `Other teacher archived source`, `Deleted source`, `Private source without access`, `Missing version source`, `Missing projection source`.
  - Expected: existing Book editor modal keeps Overview/Content/Settings tabs, shows reason labels, replace/remove actions, restore only for owned archived source, and blocks assignment for broken selected material.
  - Actual: PASS. Content tab showed `Book broken refs`, reason labels `Removed`, `Missing`, `No access`, `Missing version`, `Missing projection`, six `Replace broken ref`, six `Remove broken ref`, one `Restore source`, and disabled `Assign selected`.
  - Screenshots: `artifacts/packet-9-browser-proof/03-book-broken-ref-all-reasons-1366.png`, `04-book-broken-ref-848.png`, `05-book-broken-ref-375-mobile.png`, `06-book-broken-ref-320-mobile.png`.
- Surface: Duplicate warning smoke fixture.
  - URL: `http://localhost:5173/__smoke/reading-v2-studio?fixture=task-true-false-not-given&duplicateWarning=both`.
  - Viewports: 1366 x 900, 375 x 812, 320 x 812.
  - IDs: new passage `smoke-new-passage-1`; matches `smoke-duplicate-active`, `smoke-duplicate-archived`.
  - Expected: warning visible, non-blocking, safe metadata only, active/archived decision buttons visible.
  - Actual: PASS. `Published successfully` and `Duplicate Reading Passage warning` rendered; warning showed active 94 percent match, archived 91 percent match, `Use existing`, `Restore and use`, and `Create new anyway`.
  - Screenshots: `artifacts/packet-9-browser-proof/07-studio-duplicate-warning-1366.png`, `08-studio-duplicate-warning-375-mobile.png`, `09-studio-duplicate-warning-320-mobile.png`.
- Surface: assignment block and frozen-result live proof.
  - URL: `http://localhost:5174/student/homework`; runtime URL `http://localhost:5174/student/practice/reading-passage-set:packet9-live-20260610151227-hw-launch`.
  - Viewport: 1440 x 759, DPR 2.
  - IDs: student `x3hDfjYVN7cJtSbwq0ChIjl1Bk62`; homework launch `packet9-live-20260610151227-hw-launch`; homework result `packet9-live-20260610151227-hw-result`; result `packet9-live-20260610151227-result`.
  - Expected: archived/broken material cannot be assigned from unsafe surfaces; pre-archive homework/result remains frozen after archive/restore/repair.
  - Actual: PASS. Broken Book smoke proof showed `Assign selected` disabled for broken material. Student proof showed frozen homework card, runtime title/body/question from assignment-pinned payload, and result panel with `100%`, `1/1`, and `9.0` after source archive/restore/re-archive.
  - Screenshots: `artifacts/packet-9-browser-proof/03-book-broken-ref-all-reasons-1366.png`, `20-student-homework-frozen-cards-5174.png`, `21-student-frozen-runtime-5174.png`, `22-student-frozen-result-panel-5174.png`.

Responsive proof: no horizontal overflow measured at 848, 375, and 320 for Book repair, duplicate warning, and lobby Reading Passage list surfaces.

Console/network notes: no Reading V2 app errors or failed Reading V2 network requests on touched proof surfaces. Student proof emitted one unrelated course-membership debug warning.

### Final PRD-0054 Acceptance Status

- Audit/security/observability sweep: PASS by service, rules, and registry tests.
- Architecture docs: updated in Packet 9.
- Targeted tests: PASS.
- Browser proof: PASS. Live disposable data completed archive, restore, assignment-block, frozen runtime, and frozen-result proof.
- Final acceptance checkboxes may be claimed for live browser archive/restore/student frozen-result proof.

### Live Fixes Found During Final Proof

- Live archive initially failed because audit payload validation rejected an optional `undefined` field. `buildReadingV2AuditEvent` now strips undefined optional fields before write while still rejecting unknown values.
- Live Archive subtab initially failed because parent archive-index reads were not covered by RTDB rules. `database.rules.json` now covers `material_catalog/material_archive_indexes/by_owner/$ownerId/reading-passage`, with a security test in `src/__tests__/security/materialCatalogFirebaseRules.test.ts`.
- Rules were deployed to `temp-a1437`; no non-disposable live data was destructively mutated.

## Packet 10 Follow-up Closure - PRD-0054

- Packet: 10 follow-up - PRD-0052/0054 E2E Foundation Repair
- Date/time: 2026-06-11 18:24:13 +07:00
- Status: `COMPLETE`

### Archive/Restore Foundation Repair

- `src/services/reading-v2/readingV2PassageArchive.service.ts` now uses owner-readable lifecycle preflight for metadata, material state, archive-index state, and duplicate-index state.
- Archive and restore still commit through one RTDB multi-location `update()` payload containing material state, active/archive indexes, duplicate-index state when present, and append-only audit event.
- Archive retry treats already-archived state as idempotent: it does not attempt active-index deletion when those rows are already absent.
- Restore retry treats already-restored state as idempotent: it does not require the archive index row to still exist, and it writes active indexes from canonical metadata/material state.
- Immutable snapshots and published versions are not touched.

### Live Disposable Retry Proof

- Disposable fixture: `e2e-prd0052-0054-20260611-1811`.
- Command: `npx vite-node --mode development tmp/prd0052-0054-live-archive-restore-proof.ts`.
- Archive proof: first archive changed 15 paths; retry archive changed 11 paths and removed 0 active index paths because state was already archived.
- Restore proof: first restore changed 17 paths; retry restore changed 16 paths and skipped archive-index removal because the archive index was already absent.
- Audit proof: 4 distinct append-only archive/restore audit rows were created.
- State proof: metadata/material state became `archived` after archive and `published` after restore; duplicate index state followed when the row existed.
- Snapshot safety: immutable snapshot paths touched count was 0.

### Broken Current Master Assignment Guard

- Disposable fixture: `e2e-prd0052-0054-broken-assignment-20260611-1820`.
- Command: `npx vite-node --mode development tmp/prd0052-0054-live-broken-assignment-proof.ts`.
- Result: broken current master assignment refresh blocked before projection writes or homework update.
- Counts: write attempt count 0; homework update attempt count 0.

### Focused Verification

PASS:

```powershell
npx vitest run src/services/reading-v2/readingV2PassageArchive.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts --reporter=basic
```

Result: 2 files passed, 18 tests passed.

PASS:

```powershell
npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic
```

Result: 1 file passed, 30 tests passed.

PASS:

```powershell
npx vitest run src/services/reading-v2/readingV2AssignmentRefreshRepository.service.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2LaunchIntegration.service.test.ts --reporter=basic
```

Result: 3 files passed, 22 tests passed.

### Final PRD-0054 Acceptance Status

- Archive/restore retry atomicity: PASS by tests and disposable live proof.
- Broken current master guard: PASS by focused tests and disposable live proof.
- Master/Book repair, duplicate warning, audit, rules, and frozen-result proof remain satisfied from Packets 7-9 plus Packet 10 follow-up.
- No PRD-0054 blocker remains.

## 2026-06-15 Master Removal Wiring And Rule Repair

- Status: COMPLETE.
- Trigger: live teacher delete for `IELTS Cambridge 10 - Test 02` removed only legacy `/tests/{materialId}` and left canonical `reading_v2/material_metadata`, `reading_v2/full_test_compositions`, and linked generated Reading Passages active.
- Root cause 1: `TeacherLobbyPage` still routed Reading V2 master delete through generic legacy `deleteTest`, which removes only `/tests/{testId}`.
- Root cause 2: `removeReadingV2MasterComposition` existed but did not remove legacy `/tests/{masterMaterialId}`, so a properly soft-removed Reading V2 master could still leak through legacy-backed Teacher Lobby rows.
- Root cause 3: RTDB Material Catalog cleanup rules required the existing index row's own `ownerId` to permit delete. Stale/missing active index rows caused owner cleanup to fail with `PERMISSION_DENIED` before canonical `reading_v2/material_metadata/{materialId}` ownership was considered.

### Implementation Evidence

- `TeacherLobbyPage` now opens a PRD-0054 modal for Reading V2 master delete instead of legacy `window.confirm`.
- Modal choices: `Remove master only`, `Remove master and linked passages`, and `Cancel`.
- Master-only path calls `removeReadingV2MasterComposition`, soft-removes master composition/metadata, removes active Material Catalog index rows, removes legacy `/tests/{masterMaterialId}`, writes audit, and refreshes the list.
- Linked-passage path first archives actor-owned linked Reading Passages through `archiveReadingV2PassageMaterial`; it blocks when any linked passage is not owner-owned.
- `database.rules.json` now permits owner cleanup of stale/missing Material Catalog active-index rows when canonical `reading_v2/material_metadata/{materialId}/ownerId === auth.uid`.
- Remote RTDB rules were deployed to Firebase project `temp-a1437` with `firebase deploy --only database --project temp-a1437`.

### Tests And Proof

PASS:

```powershell
cmd /c npx vitest run src/pages/TeacherLobbyPage.test.jsx src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic
```

Result: 4 files passed, 70 tests passed, 13 emulator-gated skipped.

PASS:

```powershell
cmd /c npm run build
cmd /c npm run check:utf8
node -e "JSON.parse(require('fs').readFileSync('database.rules.json','utf8')); console.log('database.rules.json OK')"
```

Live smoke proof:

- `http://localhost:5173/lobby` loaded via Teacher quick-login.
- Clicking Delete on Reading V2 master `Selected Reading Passages` opened `Remove Reading V2 master?` modal with both removal choices and frozen-assignment/result safety copy.
- Remote rules readback after deploy showed the canonical ownership fallback in all active Material Catalog cleanup buckets.

### Contract Update

- Obsolete interpretation retired: master removal always leaves all linked generated passages active.
- Current V1 contract: master-only removal is default; explicit linked-passage option archives only actor-owned linked passages; no hard delete of canonical Reading V2 materials, snapshots, projections, assignments, or completed results.
