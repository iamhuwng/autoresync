# Findings: PRD0062 Book Activity Baseline

Status: Packet 0 baseline expanded. Packet 1 CLOSED.
Created: 2026-07-09

Primary PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Durable architecture:
- `documentation/architecture/book-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

## Working Folder

- Worktree path: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Packet: `0 - Baseline And Ownership Map`
- Branch: `main`
- Commit: `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`
- `git status --short --branch`: `## main...origin/main [ahead 7]` plus dirty/untracked paths listed below.
- `git status --short --untracked-files=all`: same dirty/untracked inventory.
- `git diff --name-only`: `README.md`, PRD0062 task docs, PRD0062 findings, PRD, `package.json`, `playwright.config.js`, `src/__tests__/setup.ts`, `vitest.config.ts`, `vitest.scripts.config.ts`.
- `git diff --cached --name-only`: empty.
- PRD tracked/untracked status: tracked; dirty before Packet 0 write (`documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`).
- Task-list tracked/untracked status: master and component task lists tracked; `contracts-book-activity-packet-template.md` and `traceability-book-activity-v1.md` were untracked at Packet 0 kickoff.
- Untracked PRD0062 planning files that must be explicitly included in diff/check/review evidence:
  - `documentation/tasks/PRD0062/contracts-book-activity-packet-template.md`
  - `documentation/tasks/PRD0062/traceability-book-activity-v1.md`

Dirty path classification:

| Path | Classification | Owner | Packet 0 action |
|---|---|---|---|
| `README.md` | user-owned unrelated work | unknown/pre-existing | must not touch |
| `documentation/tasks/PRD0062/findings-book-activity-baseline.md` | owned by this packet, with pre-existing scaffold edits | Packet 0 | expanded |
| `documentation/tasks/PRD0062/traceability-book-activity-v1.md` | owned by this packet, untracked at kickoff | Packet 0 | expanded |
| `documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md` | owned by this packet | Packet 0 | created |
| `documentation/tasks/PRD0062/contracts-book-activity-packet-1.md` | owned by this packet | Packet 0 / Packet 1 gate | created |
| `documentation/tasks/PRD0062/handoff-book-activity-packet-0.md` | owned by this packet | Packet 0 | created |
| `documentation/tasks/PRD0062/contracts-book-activity-packet-template.md` | pre-existing untracked work | PRD0062 template scaffold | classified, not edited |
| `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md` | pre-existing unstaged PRD0062 planning work | sequencing authority | read, not edited in Packet 0 baseline pass |
| `documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md` | pre-existing unstaged later-packet planning work | Packet 1 task list | read, not edited; no taskboxes marked complete |
| `documentation/tasks/PRD0062/tasks-book-activity-02-source-pdf-delivery.md` | pre-existing unstaged later-packet planning work | Packet 2 task list | read, not edited |
| `documentation/tasks/PRD0062/tasks-book-activity-03-book-assembly-workspace.md` | pre-existing unstaged later-packet planning work | Packet 3 task list | read, not edited |
| `documentation/tasks/PRD0062/tasks-book-activity-04-activity-runtime.md` | pre-existing unstaged later-packet planning work | Packet 4 task list | read, not edited |
| `documentation/tasks/PRD0062/tasks-book-activity-05-book-homework.md` | pre-existing unstaged later-packet planning work | Packet 5 task list | read, not edited |
| `documentation/tasks/PRD0062/tasks-book-activity-06-updates-checkpoints-notifications.md` | pre-existing unstaged later-packet planning work | Packet 6 task list | read, not edited |
| `documentation/tasks/PRD0062/tasks-book-activity-07-cross-feature-delivery-results.md` | pre-existing unstaged later-packet planning work | Packet 7 task list | read, not edited |
| `documentation/tasks/PRD0062/tasks-book-activity-08-pilot-hardening-release.md` | pre-existing unstaged later-packet planning work | Packet 8 task list | read, not edited |
| `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md` | pre-existing unstaged PRD authority work | PRD authority | read, not edited |
| `package.json` | user-owned unrelated work | unknown/pre-existing | must not touch |
| `playwright.config.js` | user-owned unrelated work | unknown/pre-existing | must not touch |
| `src/__tests__/setup.ts` | user-owned unrelated work | unknown/pre-existing | must not touch |
| `vitest.config.ts` | user-owned unrelated work | unknown/pre-existing | must not touch |
| `vitest.scripts.config.ts` | user-owned unrelated work | unknown/pre-existing | must not touch |

## Source Documents Read

- [x] `AGENTS.md`
- [x] `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`
- [x] `documentation/tasks/generate-tasks.md`
- [x] `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`
- [x] `documentation/architecture/book-activity-runtime-and-assembly.md`
- [x] `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`
- [x] Component task lists in `documentation/tasks/PRD0062/`
- [x] Triggered security/rules/storage docs as applicable: `database.rules.json`, `firestore.rules`, `firestore.indexes.json`, `documentation/rules/infrastructure.md` trigger noted for Packet 1 DB writes.

## Current Repository Owner Map

### Book and Material Catalog

Expected inspection targets:

- `src/types/materialCatalog.types.ts`
- `src/services/materialCatalog/materialBooks.service.ts`
- `src/services/materialCatalog/bookEditor.service.ts`
- `src/services/materialCatalog/bookValidation.service.ts`
- `src/components/books/CreateBookModal.tsx`
- `src/components/books/BookEditorModal.tsx`
- `src/components/books/BookEditorWorkspace.tsx`
- `src/components/books/BookNodeTree.tsx`
- `src/components/books/BookMaterialPicker.tsx`

Findings:

- [x] Current owner paths confirmed.
- [x] Current `unit` support status recorded.
- [x] Current material kind/capability support status recorded.
- [x] Existing Book regressions identified.

Notes:

```text
2026-07-09 / Packet 0 planning docs:
Added durable PRD0062 architecture authority at documentation/architecture/book-activity-runtime-and-assembly.md.
This document is planning authority only, not implementation proof.
It fixes the product boundary: extend the existing Book system, add Book Activity-owned modules, forbid ActivityBook, forbid legacy PDF parser dependency, and require Book Delivery projections before runtime.

2026-07-09 / Packet 0 baseline:
Current Book owner paths confirmed:
- src/types/materialCatalog.types.ts
- src/services/materialCatalog/materialCatalogPaths.ts
- src/services/materialCatalog/materialBooks.service.ts
- src/services/materialCatalog/bookEditor.service.ts
- src/services/materialCatalog/bookValidation.service.ts
- src/services/materialCatalog/materialIntegrationRegistry.ts
- src/services/materialCatalog/materialSummaryPort.service.ts
- src/components/books/CreateBookModal.tsx
- src/components/books/BookEditorModal.tsx
- src/components/books/BookEditorWorkspace.tsx
- src/components/books/BookEditorPage.tsx
- src/components/books/BookNodeTree.tsx
- src/components/books/BookMaterialPicker.tsx

Current `unit` support:
- Not implemented. `MATERIAL_BOOK_NODE_TYPES` includes intro/toc/note placeholders, section, chapter, test only.
- Existing test `src/services/materialCatalog/bookValidation.service.test.ts` currently treats `unit` as invalid in `rejects invalid node types, self-parenting, cycles, duplicate sibling order, orphan children, descendant moves, and depth 6`.

Current material kind/capability support:
- `interactive-activity` is not in `MATERIAL_CATALOG_MATERIAL_KINDS`.
- Existing registry is producer/taxonomy oriented (`materialIntegrationRegistry.ts`), not the required capability registry with playable/assignable/embeddableInBook/gradable/source/placement adapters.

Regression tests to preserve:
- src/types/materialCatalog.types.test.ts / `models Book metadata, nodes, and material refs without nested child arrays`
- src/services/materialCatalog/materialBooks.service.test.ts / `writes initial nodes and marks structural Books ready`
- src/services/materialCatalog/bookEditor.service.test.ts / `creates stable Book nodes and tracks placeholder-only draft readiness separately`
- src/services/materialCatalog/bookValidation.service.test.ts / `allows all node types to contain child nodes and material refs`
- src/components/books/CreateBookModal.test.tsx / `saves an empty draft Book with required metadata only`
- src/components/books/BookEditorWorkspace.test.tsx / `renders Content as structure tree plus selected item detail and assignment workflow`
- src/__tests__/security/materialCatalogFirebaseRules.test.ts / `gates Book nodes and denies hidden fields inside node payloads`
```

## 2026-08-23 #126 production-shaped local finding

| Finding | State | Evidence / boundary |
|---|---|---|
| `F-126-LOCAL-RULE-COMPOSITION` | `LOCAL_RULE_ENFORCED_PASS_REMOTE_PROOF_BLOCKED` | `evidence/126-production-normal-rule-enforced-rerun-2026-08-23.json`: clean docs-only source `2c77efff`, with test/config blobs unchanged from product source `36ce82eb`; harness 3.7.0/protocol 5 passed 1/1 files and 4/4 tests, zero failed/skipped. The explicit 503 completion-read test retained the committed recipient row with `completion: null`. No assignment replay, projector write, or remote mutation occurred. |

No local causal source change is selected. The remaining #126 boundary is
Wrangler OAuth reauthorization followed by an authorized exact-artifact
deployment/readback and real browser verification. This finding does not close
Component 08 browser, deployed, pilot, or Full-V1 gates.

### Activity Domain

Expected new or confirmed owner paths:

- `src/types/bookActivity.types.ts`
- `src/services/book-activity/*`
- `src/services/materialCatalog/*`

Findings:

- [x] Activity domain owner path chosen.
- [x] Capability registry owner path chosen.
- [x] Student-safe projection owner path chosen.
- [x] Semantic diff owner path chosen.

Notes:

```text
2026-07-09 / Packet 0 planning docs:
- rtk git status --short --branch
- rtk git status --short --untracked-files=all
- rtk git rev-parse HEAD
Purpose: record baseline before staging PRD0062 documentation package.

2026-07-09 / Packet 0 baseline:
Chosen Packet 1 owner paths:
- src/types/bookActivity.types.ts
- src/services/book-activity/activitySchema.service.ts
- src/services/book-activity/activityCandidate.service.ts
- src/services/book-activity/activityPublish.service.ts
- src/services/book-activity/activityProjection.service.ts
- src/services/book-activity/activityDiff.service.ts
- src/services/book-activity/activityScoring.service.ts
- src/services/materialCatalog/materialCapabilityRegistry.service.ts

New tests required because no Activity domain exists yet:
- src/types/bookActivity.types.test.ts
- src/services/book-activity/activitySchema.service.test.ts
- src/services/book-activity/activityCandidate.service.test.ts
- src/services/book-activity/activityPublish.service.test.ts
- src/services/book-activity/activityProjection.service.test.ts
- src/services/book-activity/activityDiff.service.test.ts
- src/services/book-activity/activityScoring.service.test.ts
- src/__tests__/security/bookActivityFirebaseRules.test.ts.
```

### Source PDF Storage And Delivery

Expected inspection targets:

- R2 upload/delivery Worker code after actual repository location is confirmed.
- `database.rules.json`
- `firestore.rules`
- backup/worker test files.

Findings:

- [x] Current R2/Cloudflare Worker owner path confirmed.
- [x] Private source storage boundary confirmed.
- [x] PDF extraction engine spike owner recorded.
- [x] Obsolete parser exclusion recorded.

Notes:

```text
2026-07-09 / Packet 0 baseline:
Current R2/Worker owner paths:
- cloudflare/src/upload-worker/*
- cloudflare/src/upload-worker/listening-delivery.ts as private delivery prior art.
- cloudflare/src/upload-worker/listening-upload-session.ts and repository/types as upload-session prior art.
- src/services/r2UploadClient.ts, src/services/r2Storage.ts, src/services/r2WorkerEndpoint.ts as app-side R2 client prior art.
- r2-backup-worker/ as backup/restore owner.

Chosen Packet 2 source owner paths:
- src/types/bookSource.types.ts
- src/services/book-source-delivery/sourceVersion.service.ts
- src/services/book-source-delivery/sourceUpload.service.ts
- src/services/book-source-delivery/pdfExcerptAdapter.ts
- src/services/book-source-delivery/sourceRendition.service.ts
- src/services/book-source-delivery/sourceGrant.service.ts

Obsolete parser exclusion:
- `rg` shows existing legacy references in `src/services/test-creation/document-converter.service.ts`, `src/components/test/DocumentUploadSection.tsx`, and parser/file-extractor tests.
- No PRD0062 source path exists yet. Packet 1+ must add a boundary scan/test proving new Book Activity paths do not import `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js`.

Open blocker for Packet 2 only:
- backend PDF excerpt engine is not selected; edge-case spike remains required.
```

### Homework

Expected inspection targets:

- `src/types/homework.types.ts`
- `src/services/homeworkManager.ts`
- `src/services/homeworkSubmissionService.ts`
- `src/components/homework/HomeworkCreateModal.tsx`
- `src/pages/TeacherHomeworkDetailPage.tsx`
- `src/pages/StudentHomeworkListPage.tsx`
- `src/pages/StudentHomeworkDetailPage.tsx`

Findings:

- [x] Current one-material assumptions recorded.
- [x] Book Homework manifest owner path chosen.
- [x] Activity-level submission/progress owner path chosen.
- [x] Nested schedule owner path chosen.

Notes:

```text
2026-07-09 / Packet 0 baseline:
Current homework owners:
- src/types/homework.types.ts
- src/services/homeworkManager.ts
- src/services/homeworkSubmissionService.ts
- src/components/homework/HomeworkCreateModal.tsx
- src/pages/TeacherHomeworkDetailPage.tsx
- src/pages/StudentHomeworkListPage.tsx
- src/pages/StudentHomeworkDetailPage.tsx
- firestore.rules / homework_assignments, homework_submissions
- firestore.indexes.json / homework assignment/submission indexes

Current one-material assumptions:
- Homework assignment records are centered on one material target with Reading Passage sets as prior multi-item art.
- `homework_submissions` stores attempt rows for one homework, not Activity-level Book attempts.

Chosen Packet 5 owners:
- src/services/book-homework/bookHomeworkManifest.service.ts
- src/services/book-homework/bookHomeworkSchedule.service.ts
- src/services/book-homework/bookHomeworkProgress.service.ts
- src/services/book-homework/bookHomeworkIntegrity.service.ts
- src/services/book-homework/bookHomeworkUpdatePlanner.service.ts
- src/services/book-homework/bookHomeworkUpdateApply.service.ts
- src/services/book-homework/bookHomeworkCheckpoint.service.ts
- src/services/book-homework/bookHomeworkRegrade.service.ts

Regression tests:
- src/components/homework/HomeworkCreateModal.test.tsx / `creates a Reading Passage set from selected passage summaries`
- src/pages/TeacherHomeworkDetailPage.test.tsx / `refreshes a composition-backed Reading V2 assignment before any raw submission starts`
- src/__tests__/security/homeworkFirestoreRules.test.ts / `allows narrow student progress-stat updates and rejects assignment-shape mutation`
```

### Student Launcher And Runtime

Expected inspection targets:

- `src/pages/StudentPracticePage.tsx`
- `src/routes/studentRoutes.tsx`
- `src/components/test/QuestionNavigator.tsx`
- `src/hooks/solo/useSoloResume.ts`
- `src/hooks/solo/useSoloSubmission.ts`
- `src/components/reading-v2/runtime/`

Findings:

- [x] Thin Book dispatch seam chosen.
- [x] Book Runtime owner path chosen.
- [x] Autosave/reload context key owner chosen.
- [x] Existing launcher regression set recorded.

Notes:

```text
2026-07-09 / Packet 0 baseline:
Current launcher/runtime owners:
- src/pages/StudentPracticePage.tsx
- src/routes/studentRoutes.tsx
- src/components/test/QuestionNavigator.tsx as sticky navigator prior art.
- src/hooks/solo/useSoloResume.ts
- src/hooks/solo/useSoloSubmission.ts
- src/hooks/solo/useSoloAutoSave.ts
- src/components/reading-v2/runtime/* as projection/runtime prior art only.

Chosen Packet 4 owners:
- src/services/book-delivery/bookDelivery.service.ts
- src/types/bookDelivery.types.ts
- src/components/book-runtime/BookRuntimeShell.tsx
- src/components/book-runtime/BookPdfPageViewer.tsx
- src/components/book-runtime/BookActivityPanel.tsx
- src/components/book-runtime/BookActivityNavigator.tsx
- src/components/book-runtime/ActivityRenderer.tsx
- src/hooks/book-runtime/useBookRuntimeState.ts
- src/hooks/book-runtime/useBookActivityAutosave.ts

Regression tests:
- src/pages/StudentPracticePage.test.tsx / `routes explicitly marked Reading V2 materials to the Reading V2 runtime`
- src/pages/StudentPracticePage.test.tsx / `launches Reading Passage set homework from the pinned frozen assignment payload before reading current source projections`
- src/services/reading-v2/readingV2LaunchIntegration.service.test.ts / `routes non-live launches only from student-safe projections when rollout is public`
```

### Results And Visibility

Expected inspection targets:

- `src/components/results/AttemptHistory.tsx`
- `src/components/results/ResultSlidePanel.tsx`
- `src/pages/TeacherResultsPage.jsx`
- `src/pages/TeacherTestResultsPage.tsx`
- `src/pages/ResultDetailPage.tsx`
- `src/components/results/ResultDetailModal.tsx`
- `src/hooks/useTestAttempts.ts`
- `src/services/testResults.service.ts`
- `src/services/resultVisibility.service.ts`
- `src/services/resultOwnershipResolver.ts`
- `src/services/academicRecordService.ts`

Findings:

- [x] Current attempt grouping behavior recorded.
- [x] Book Activity result identity owner chosen.
- [x] Teacher/student result visibility boundaries recorded.
- [x] Regression tests identified.

Notes:

```text
2026-07-09 / Packet 0 baseline:
Current result owners:
- src/services/testResults.service.ts
- src/services/resultVisibility.service.ts
- src/services/resultOwnershipResolver.ts
- src/hooks/useTestAttempts.ts
- src/components/results/AttemptHistory.tsx
- src/components/results/ResultSlidePanel.tsx
- src/components/results/ResultDetailModal.tsx
- src/pages/TeacherResultsPage.jsx
- src/pages/TeacherTestResultsPage.tsx
- src/pages/ResultDetailPage.tsx
- src/services/academicRecordService.ts

Current attempt grouping:
- Existing result UI has attempt dropdown prior art. Persistence identity remains result/attempt row identity, not viewer grouping.

Chosen Packet 4/7 owners:
- src/services/book-activity/bookActivitySubmission.service.ts
- src/services/book-delivery/bookDelivery.service.ts
- src/services/book-activity/bookActivityResultAdapter.service.ts

Regression tests:
- src/components/results/AttemptHistory.test.tsx / `renders attempt label and improvement text for multiple attempts`
- src/services/resultVisibility.service.test.ts / `keeps solo practice visible but view-only and analytics-excluded`
- src/services/testResults.service.test.ts / `should exclude solo-practice rows from teacher-owned index reads`
- src/services/resultOwnershipResolver.test.ts / `classifies self-study rows as solo practice with no teacher-owner lookup`
```

### Course And Class

Expected inspection targets:

- `src/types/course.types.ts`
- `src/services/courseMaterialAccessService.ts`
- `src/services/courseSyncService.ts`
- `src/services/materialLinkManager.ts`
- `src/pages/StudentCourseDetailPage.tsx`
- `src/pages/TeacherClassDetailPage.tsx`
- `src/pages/StudentClassDetailPage.jsx`

Findings:

- [x] Current ambiguous `materialId` resolution behavior recorded.
- [x] Exact Placement binding owner path chosen.
- [x] Course/Class progress owner path chosen.
- [x] Sync/update boundary recorded.

Notes:

```text
2026-07-09 / Packet 0 baseline:
Current Course/Class owners:
- src/types/course.types.ts
- src/services/courseMaterialAccessService.ts
- src/services/courseSyncService.ts
- src/services/materialLinkManager.ts
- src/pages/StudentCourseDetailPage.tsx
- src/pages/TeacherClassDetailPage.test.tsx / page source exists in project search scope
- src/pages/StudentClassDetailPage.jsx

PRD baseline records current Course access resolves primarily by `materialId`; Book Activity must not copy this ambiguity.

Chosen Packet 7 owners:
- src/services/book-delivery/bookDelivery.service.ts
- src/types/bookDelivery.types.ts
- src/services/book-assembly/placement.service.ts
- src/services/book-composition/contentCatalogBrowse.service.ts if created for future composition seams.

Regression tests:
- src/services/resultOwnershipResolver.test.ts / `resolves class-linked course material from class.createdBy`
- src/services/resultOwnershipResolver.test.ts / `resolves standalone course material from course.ownerId`
```

### Notifications

Expected inspection targets:

- `src/types/notification.types.ts`
- `src/services/notificationService.ts`
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationPanel.tsx`
- `documentation/rules/announcements.md`

Findings:

- [x] Persistent notification type/metadata owner chosen.
- [x] Action announcement boundary recorded.
- [x] Notification Bell regression tests identified.

Notes:

```text
2026-07-09 / Packet 0 baseline:
Current notification owners:
- src/types/notification.types.ts
- src/services/notificationService.ts
- src/components/notifications/NotificationBell.tsx
- src/components/notifications/NotificationPanel.tsx
- database.rules.json / `notifications/{userId}/{notificationId}`
- documentation/rules/announcements.md for transient action announcements.

Chosen Packet 6 owners:
- src/services/book-homework/bookHomeworkNotification.service.ts adapter over notificationService.
- notification metadata must link safely to updated homework/checkpoint without answer content, PDF content, full diff payload, private refs, or source keys.

Regression tests:
- src/components/notifications/NotificationBell.test.tsx
- new Packet 6 tests must prove retry idempotency and one notification per student/update action.
```

### Routes, Observability, Security

Expected inspection targets:

- `src/routes/teacherRoutes.tsx`
- `src/routes/studentRoutes.tsx`
- `src/constants/routes.ts`
- `src/config/featureRegistry.ts`
- `src/config/routeSecurity.ts`
- `database.rules.json`
- `firestore.rules`
- `.agent/skills/observability-tracking/SKILL.md` when triggered

Findings:

- [x] New route registry requirements recorded.
- [x] New action tracking requirements recorded.
- [x] New data nodes and rule test coverage recorded.
- [x] Backup/index requirements recorded.

Notes:

```text
2026-07-09 / Packet 0 baseline:
Current route/observability/security owners:
- src/routes/teacherRoutes.tsx
- src/routes/studentRoutes.tsx
- src/constants/routes.ts
- src/config/featureRegistry.ts
- src/config/routeSecurity.ts
- database.rules.json
- firestore.rules
- firestore.indexes.json
- .agent/skills/observability-tracking/SKILL.md must be loaded in any packet adding routes/actions.

Packet 1:
- no UI route expected.
- new DB paths require infrastructure rule, rules, indexes, backup coverage, and emulator tests before closure.

Packet 3+:
- UI work must read design gate docs before editing UI.
```

## Read-Only Analog Owner Map From Subagent

Carson ran a read-only source/rules/test owner scan. These are current analogs, not Book Activity implementation proof.

| Surface | Existing owner path or N/A | Rules/security boundary | Existing exact test title or N/A | Packet implication |
|---|---|---|---|---|
| Book materials | `material_catalog/books/{bookId}`; `material_catalog/book_nodes/{bookId}/{nodeId}` | `database.rules.json` / `material_catalog/books`, `book_nodes`, `book_indexes` | `src/services/materialCatalog/materialBooks.service.test.ts` / `writes an empty draft Book and indexes through material_catalog paths`; `src/__tests__/security/materialCatalogFirebaseRules.test.ts` / `allows only owners/super admins to write Books and keeps published public state admin-only` | Packet 1/3 extend existing Book/material system, no parallel product. |
| Draft/candidate analog | `reading_v2/drafts/{draftId}` | `database.rules.json` / `reading_v2/drafts/$draftId` | `src/services/reading-v2/readingV2Repository.service.test.ts` / `creates, loads, saves, autosaves, lists, discards, and duplicates isolated V2 drafts`; `src/__tests__/security/readingV2FirebaseRules.test.ts` / `allows teacher-owned canonical drafts but denies students and other teachers` | Packet 1 needs new Activity candidates/drafts; Reading V2 is only prior art. |
| Version/source-version analogs | `reading_v2/reading_passage_material_versions/{materialId}/{versionId}`; `reading_v2/passage_assets/{assetId}/versions/{versionId}`; `reading_v2/full_test_composition_versions/{compositionId}/{versionId}` | `database.rules.json` / Reading V2 version paths | `src/services/reading-v2/readingV2StoragePaths.service.test.ts` / `returns exact PRD-0052 Reading Passage and composition paths`; `src/__tests__/security/readingV2FirebaseRules.test.ts` / `requires Reading Passage version records to validate owner, passage id, and current snapshot id` | Packet 1 needs Activity version store; Packet 2 needs Source Version store. |
| Manifest/Page Group/Placement | N/A | N/A | N/A | No dedicated store exists; Packet 3 must create explicit contracts. |
| Homework manifests | `homework_assignments/{assignmentId}`; `reading_v2/projections/assignment_payloads/{homeworkId}:{compositionVersionId}` | `firestore.rules` homework assignments; `database.rules.json` Reading V2 assignment payloads | `src/services/homeworkManager.test.ts` / `creates Reading Passage set homework with assignment-owned material id and ordered snapshots`; `src/services/reading-v2/readingV2AssignmentRefreshRepository.service.test.ts` / `loads latest composition/projections and writes frozen payload before homework patch` | Packet 5 needs Book Homework manifest, not hidden one-material homework. |
| Attempts/autosave | `homework_submissions/{submissionId}`; `reading_v2/attempts/{attemptId}`; autosave analog `reading_v2/drafts/{draftId}` | `firestore.rules`; `database.rules.json` Reading V2 attempts | `src/services/homeworkSubmissionService.test.ts` / `reuses an in-progress homework attempt for an external import`; `src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.test.ts` / `scores and persists a runtime submission without exposing canonical data to the browser payload` | Packet 4/7 need Activity attempt identity and context-scoped autosave. |
| Review checkpoints | parser `parsingCache/{cacheId}` only | `firestore.rules` / `parsingCache` | `src/services/test-creation/offline-parser.service.test.ts` / `sanitizes undefined fields before saving checkpoints` | No Activity Review Checkpoint exists; Packet 6 creates it. |
| Integrity/update audits | `audit_logs/{pushId}`; `reading_v2/audit_events/{eventId}`; `homework_submissions/{submissionId}.integrity` | `database.rules.json`; `firestore.rules` | `src/services/auditService.test.ts` / `should log UPDATE operations with change details`; `src/services/reading-v2/readingV2AuditTrail.service.test.ts` / `writes through the approved path without touching legacy audit logs`; `src/services/homeworkSubmissionService.test.ts` / `persists integrity data and nullifies attempts on homework auto-submit` | Packet 5 integrity adapter must forbid auto-submit/nullify; Packet 6 update audit must be append-only/idempotent. |
| Notifications | `notifications/{userId}/{notificationId}` | `database.rules.json` / `notifications/$userId` | `src/services/notificationService.test.ts` / `should create notification successfully` | Packet 6 uses existing notification service through Book update adapter. |
| Public/student-safe projections | `material_catalog/public_book_projections/{bookId}`; `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}` | `database.rules.json` projection paths | `src/__tests__/security/materialCatalogFirebaseRules.test.ts` / `keeps public Book projections teacher-readable and super-admin writable only`; `src/__tests__/security/readingV2FirebaseRules.test.ts` / `lets students read sanitized projections but not canonical snapshots` | Packet 1 projection and Packet 7 public projection must preserve safe boundary. |

## Technical Spikes

- [ ] PDF excerpt engine selection. Owner: Packet 2. Blocks production source delivery, not Packet 1.
- [ ] Source rendition latency/cost/cache behavior. Owner: Packet 2.
- [ ] Activity interaction-family renderer reuse boundaries. Owner: Packet 4; Packet 1 defines schema only.
- [ ] Cross-system idempotent update action design. Owner: Packet 6.
- [ ] Course/Class exact placement resolution. Owner: Packet 7; binding shape planned in storage design.

## Regression Inventory

Record exact test files and test names before implementation.

- [x] Existing Book create/edit/publish tests: `CreateBookModal.test.tsx`, `BookEditorPage.test.tsx`, `BookEditorWorkspace.test.tsx`, `materialBooks.service.test.ts`, exact titles recorded above.
- [x] Existing Book ref repair tests: `BookEditorWorkspace.test.tsx` / `lists and repairs broken Reading Passage refs inside the existing Content tab`; `bookValidation.service.test.ts` / `reports broken Reading Passage refs with PRD-0054 reason codes while preserving structure`.
- [x] Existing homework create/detail/list tests: exact titles under Homework above.
- [x] Existing Reading V2 pinned assignment launch tests: `StudentPracticePage.test.tsx` / `launches Reading Passage set homework from the pinned frozen assignment payload before reading current source projections`.
- [x] Existing IELTS Listening/Reading/Writing/THCS StudentPracticePage routing tests: `StudentPracticePage.test.tsx` includes THCS, Writing, legacy IELTS Reading, and Reading V2 route titles; Packet 4/8 must preserve exact list.
- [x] Existing Notification Bell tests: `src/components/notifications/NotificationBell.test.tsx` exists; Packet 6 must record exact relevant titles after modification.
- [x] Existing result visibility and ownership tests: exact titles under Results above.
- [x] Reading V2 and Listening dependency-boundary tests: `src/__tests__/readingV2BoundaryImports.test.ts` / `keeps V2 core folders independent from legacy Reading editor/runtime/parser/scoring helpers`; Listening boundary tests must be chosen in Packet 1/8 if Book Activity imports touch shared assessment features.

## Decisions

Append decisions here with date, packet, source, and rationale.

```text
2026-07-09 / Packet 0:
Storage design path created: documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md.
Packet 1 contract path created: documentation/tasks/PRD0062/contracts-book-activity-packet-1.md.
Activity domain DB product is chosen by Packet 0 tightening: RTDB under `book_activity/*`, rules in `database.rules.json`, backup owner `r2-backup-worker/src/backup/data-backup.ts`, restore owner `r2-backup-worker/src/restore/restore-execute.ts`, and no Packet 1 `firestore.indexes.json` change.
Existing material Book services `src/services/materialCatalog/bookEditor.service.ts` and `src/services/materialCatalog/materialBooks.service.ts` currently have `// @ts-nocheck`; Packet 1 must not hide new invariants there without typed wrapper or cleanup.
```

## Blockers

Append blockers here with owner, required decision, and affected packet.

```text
F-P1-001 Packet 0 historical blocker: Capability registry owner chosen; Packet 1 implementation evidence below supersedes the pre-code state.
F-P1-002 Packet 0 historical blocker: Activity candidate/draft/version owner paths chosen; Packet 1 implementation evidence below supersedes the pre-code state.
F-P1-003 Packet 0 historical blocker: Hidden Interaction ID preservation rules chosen; Packet 1 implementation evidence below supersedes the pre-code state.
F-P1-004 Packet 0 historical blocker: Student-safe projection boundary chosen; Packet 1 implementation evidence below supersedes the pre-code state.
F-P1-005 Packet 0 historical blocker: Semantic diff/scoring owner paths chosen; Packet 1 implementation evidence below supersedes the pre-code state.
F-P1-006 Rules/index/backup coverage required for every Activity path. Packet 1 Activity domain uses RTDB under `book_activity/*`, rules in `database.rules.json`, backup inventory in `r2-backup-worker/src/backup/data-backup.ts`, restore inventory in `r2-backup-worker/src/restore/restore-execute.ts`, and no Packet 1 `firestore.indexes.json` change.
F-P1-007 Existing Book owner seams include `// @ts-nocheck`. Packet 1 must type-wrap or clean touched seams.
F-P1-008 Existing Book/material regressions identified and must remain green.
F-P1-009 Forbidden legacy parser paths have existing legacy references outside PRD0062; Packet 1+ must prove no new PRD0062 dependency.
```

## Packet 1 Implementation Evidence

2026-07-10 / Packet 1 local implementation:

| Finding | State | Evidence |
|---|---|---|
| F-P1-001 | closed | `src/services/materialCatalog/materialCapabilityRegistry.service.ts`; `src/services/materialCatalog/materialCapabilityRegistry.service.test.ts` `returns complete interactive-activity capabilities and fails closed when adapter is missing`; `interactive-activity` added to `src/types/materialCatalog.types.ts`, material summary surface family, and material integration taxonomy. |
| F-P1-002 | closed | `src/types/bookActivity.types.ts`; `src/services/book-activity/activitySchema.service.ts`; `activityCandidate.service.ts`; `activityPublish.service.ts`; tests for schema, candidate, and immutable publish passed. |
| F-P1-003 | closed | `activitySchema.service.ts` rejects editable hidden/system IDs and preserves hidden IDs only for exact-structure-safe revisions; `activityDiff.service.ts` classifies add/remove/reorder/material interaction changes as redo-required. |
| F-P1-004 | closed | `activityProjection.service.ts` emits student-safe projections without answers/authoring/provenance/hidden IDs; RTDB rules deny student/cross-owner canonical access and deny unsafe projection writes. |
| F-P1-005 | closed | `activityDiff.service.ts` and `activityScoring.service.ts` added; diff test covers no-redo, recalculation, regrade, teacher regrade, and redo-required outcomes; scoring test covers objective families and rubric teacher review. |
| F-P1-006 | closed | `database.rules.json` adds RTDB `book_activity/materials`, `drafts`, `candidates`, `versions`, `student_safe_projections`; writes bind to existing owner/material owner instead of accepting spoofed `ownerId`; `r2-backup-worker/src/backup/data-backup.ts` and `r2-backup-worker/src/restore/restore-execute.ts` include `book_activity`; no Packet 1 `firestore.indexes.json` change. |
| F-P1-007 | closed | Activity-specific Book integration is isolated in `src/services/materialCatalog/bookActivityBookIntegration.service.ts`; no new `// @ts-nocheck` added in Book Activity modules. |
| F-P1-008 | closed | Adjacent Material Catalog/Book regression command passed with `materialSummaryPort`, `materialSummaryAdapters`, `materialIntegrationRegistry`, `materialCatalog.types`, `bookValidation`, `materialBooks`, and `CreateBookModal` tests. |
| F-P1-009 | closed | `src/services/book-activity/bookActivityDependencyBoundary.test.ts` proves production Book Activity owner files do not import or reference `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js`. |
| F-P1-010 | closed | Post-closure review found browser owners could create `book_activity/versions` and `student_safe_projections` through a permissive ancestor/child-rule combination. Root `book_activity` writes now cannot inherit the super-admin ancestor grant, both immutable output paths are browser-write false, and emulator tests deny direct owner creation. Trusted server mutations retain Admin SDK authority. |
| F-P1-011 | closed | Post-closure review found malformed objective answer rules could reach `scoreActivityAttempt` and silently produce zero. Schema validation now requires complete/in-range objective keys, and scorer defense rejects malformed persisted versions. Focused schema/scoring tests prove both boundaries. |

Final Packet 1 owner paths:
- `src/services/materialCatalog/materialCapabilityRegistry.service.ts`
- `src/services/materialCatalog/bookActivityBookIntegration.service.ts`
- `src/types/bookActivity.types.ts`
- `src/services/book-activity/activitySchema.service.ts`
- `src/services/book-activity/activityCandidate.service.ts`
- `src/services/book-activity/activityPublish.service.ts`
- `src/services/book-activity/activityProjection.service.ts`
- `src/services/book-activity/activityDiff.service.ts`
- `src/services/book-activity/activityScoring.service.ts`
- `database.rules.json`
- `r2-backup-worker/src/backup/data-backup.ts`
- `r2-backup-worker/src/restore/restore-execute.ts`

Unresolved Packet 1 risks:
- Delivery-grant narrowing for Activity safe projections is deferred to Packet 7; Packet 1 rules allow users with role `student` and owner/super-admin preview to read sanitized projections only.
- Source-assisted concrete Book page mapping cannot be fully enforced until Packet 3 placement/page-group contracts exist; Packet 1 validates source metadata and context requirement only.
- Independent review evidence exists from Euler re-check and the subsequent post-closure re-review; no Packet 1 closure blocker remains.

Reviewer blocker reconciliation:
- Euler found owner-spoof write takeover risk in `database.rules.json`; fixed by binding existing records to `data.ownerId` and new child records to the existing Activity material owner where present, plus emulator tests for spoofed material/draft/version/projection writes.
- Euler found missing scoring coverage for accepted objective families; fixed by adding `activityScoring.service.test.ts` and scoring support for multiple-choice, matching, and ordering, while rubric long response requires teacher review.
- Euler found draft lineage could lose published base version; fixed by adding `previousPublishedVersionId` to `saveActivityDraft` and asserting `baseVersionId` preservation in `activityCandidate.service.test.ts`.
- Euler re-check result: PASS; all three findings closed.

Post-closure re-review reconciliation:
- Direct browser creation of immutable versions/projections violated PRD section 24.4. `database.rules.json` now protects the root ancestor and denies browser writes to both canonical output paths; emulator proof includes direct owner creation denials.
- Incomplete objective answer rules could silently score zero. `activitySchema.service.ts` rejects incomplete/out-of-range keys and `activityScoring.service.ts` throws for malformed persisted objective versions.
- Focused 12-file Vitest proof, RTDB emulator proof, full R2 suite, script suite, TypeScript, and lint reran after the correction.

## Packet 2A Source Delivery Discovery

2026-07-10 / docs-only discovery. Packet 1 remains CLOSED; Packet 2 production work is not started.

| Finding | State | Evidence / decision |
|---|---|---|
| F-P2-001 | planned | Exact owners: `src/types/bookSource.types.ts`; `src/services/book-source-delivery/sourceVersion.service.ts`, `sourceUpload.service.ts`, `pdfExcerptAdapter.ts`, `sourceRendition.service.ts`, `sourceGrant.service.ts`; `database.rules.json`; `src/__tests__/security/bookSourceFirebaseRules.test.ts`; Cloudflare isolated modules/routes; backup/restore owners. Canonical metadata decision: RTDB `book_source/source_versions/{bookId}/{sourceVersionId}` and `book_source/source_renditions/{sourceVersionId}/{renditionId}`; browser direct canonical reads/writes false, owner-safe metadata separate. |
| F-P2-002 | blocked | PDF engine unselected. Candidate spike matrix in `contracts-book-activity-packet-2.md`; reject prohibited parser paths, public/full-PDF path, no deterministic page-only output, unsafe resource/deploy fit, OCR requirement, or missing cleanup/retry evidence. |
| F-P2-003 | blocked | Current `cloudflare/wrangler.jsonc` uses `kahoot-media` plus public `PUBLIC_URL`; generic upload returns public URLs. It is unsafe for source originals/renditions. Need separately private bucket/binding or equivalent remote direct-object denial evidence before Packet 2B. Listening delivery Worker is pattern-only precedent, not reusable source authority. |
| F-P2-004 | planned | RTDB root backup/restore already names `book_activity`, but `r2-backup-worker/src/backup/media-delta.ts` only scans `audio/`, `images/`, `avatars/`. Packet 2 must add source/rendition prefix backup coverage or document a separate private bucket lifecycle, then prove restore/retry. |
| F-P2-005 | blocked | Student delivery needs immutable Unit/Page Group and Book Delivery authorization inputs absent until Packet 3/4. Packet 2B may make teacher-side metadata/private upload skeleton only; no student grant/runtime delivery. |

Remote-proof blockers: no deployed Worker version/binding, live R2 privacy/object, deployed capability expiry/refresh, or deployed Firebase/Cloudflare permission evidence was collected. Local tests/dry-run cannot close those claims.

Residual risks: signed Worker capability URL can be copied while valid; bind claims, short expiry, no-store response, refresh re-authorization, and replay handling reduce but do not promise capture prevention. Rights confirmation is required before upload and revalidated before publish; technical access does not establish copyright rights.

## Packet 2B0 Private R2 Boundary Evidence

2026-07-10 / Packet 2B0 evidence index. Detail authority: `findings-packet-2B0-private-r2-boundary.md`.

| Finding | State | Detail |
|---|---|---|
| `F-P2B0-001` | blocked | [local boundary](findings-packet-2B0-private-r2-boundary.md#f-p2b0-001) |
| `F-P2B0-002` | blocked | [Worker toolchain](findings-packet-2B0-private-r2-boundary.md#f-p2b0-002) |
| `F-P2B0-003` | blocked | [remote proof](findings-packet-2B0-private-r2-boundary.md#f-p2b0-003) |
| `F-P2B0-004` | planned | [backup lifecycle](findings-packet-2B0-private-r2-boundary.md#f-p2b0-004) |
| `F-P2B0-005` | partial | [supported runtime recovery](findings-packet-2B0-private-r2-boundary.md#f-p2b0-005) |
| `F-P2B0-006` | action required | [expired auth / remote discovery stop](findings-packet-2B0-private-r2-boundary.md#f-p2b0-006) |
| `F-P2B0-007` | closure blocked | [authority-reference chain drift](findings-packet-2B0-private-r2-boundary.md#f-p2b0-007) |

## Verification Log

Append commands and results here. Do not replace historical entries.

```text
2026-07-09 / Packet 0:
- rtk git status --short --branch => exit 0; main...origin/main ahead 7; dirty/untracked inventory recorded.
- rtk git status --short --untracked-files=all => exit 0; dirty/untracked inventory recorded.
- rtk git rev-parse HEAD => exit 0; 84167ea5cc3195689b8f3baebaa50fa0cbe50e9f.
- rtk git diff --name-only => exit 0; unstaged paths recorded.
- rtk git diff --cached --name-only => exit 0; empty.
- rtk rg scans for owner paths/test titles/security/storage/parser boundaries => exit 0 except one malformed regex retry; successful retry recorded.
- rtk rg stale-gate scan across Packet 0 outputs for conditional Packet 1 ownership/rules/test phrases => exit 1; no stale blockers found.
- rtk git diff --check -- Packet 0 output docs => exit 0.
- rtk rg -n "[ \t]+$" Packet 0 output docs => exit 1; no trailing whitespace found.
- rtk rg -n "\[x\]|\[X\]" master and component 01-08 task lists => exit 1; no later packet taskboxes marked complete.
Packet 0 historical note: feature code had not been implemented at that time, and no tests ran because Packet 0 was a documentation baseline.

2026-07-10 / Packet 1:
- rtk git status --short --branch => exit 0; `main...origin/main [ahead 7]`; dirty/untracked inventory classified before source edits.
- rtk git status --short --untracked-files=all => exit 0; dirty/untracked inventory classified before source edits.
- rtk git rev-parse HEAD => exit 0; `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`.
- rtk git diff --name-only => exit 0; unstaged dirty path list recorded before source edits.
- rtk git diff --cached --name-only => exit 0; empty.
- rtk npm test -- src/services/book-activity/activitySchema.service.test.ts src/services/book-activity/activityCandidate.service.test.ts src/services/book-activity/activityPublish.service.test.ts src/services/book-activity/activityProjection.service.test.ts src/services/book-activity/activityDiff.service.test.ts src/services/book-activity/activityScoring.service.test.ts src/services/book-activity/bookActivityDependencyBoundary.test.ts src/services/materialCatalog/materialCapabilityRegistry.service.test.ts src/services/materialCatalog/bookActivityBookIntegration.service.test.ts => exit 0; 9 files, 14 tests passed.
- rtk npx firebase emulators:exec --only database "npm test -- src/__tests__/security/bookActivityFirebaseRules.test.ts" => exit 0; database emulator ran, 1 file, 2 tests passed.
- rtk npm --prefix r2-backup-worker test -- src/backup/data-backup.test.ts src/restore/restore-execute.test.ts => exit 0; 2 files, 4 tests passed.
- rtk npm test -- src/services/materialCatalog/materialSummaryPort.service.test.ts src/services/materialCatalog/materialSummaryAdapters.service.test.ts src/services/materialCatalog/materialIntegrationRegistry.test.ts src/types/materialCatalog.types.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/books/CreateBookModal.test.tsx => exit 0; 7 files, 56 tests passed.
- rtk npx tsc --noEmit => exit 0; no TypeScript errors.
- rtk npm run build => exit 0; production build passed.
```
