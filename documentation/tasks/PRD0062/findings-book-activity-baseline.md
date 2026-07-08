# Findings: PRD0062 Book Activity Baseline

Status: Baseline shell. Fill during Packet 0 before feature implementation.
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
- Branch:
- Commit:
- `git status --short --branch`:
- `git status --short --untracked-files=all`:
- PRD tracked/untracked status:
- Task-list tracked/untracked status:

## Source Documents Read

- [ ] `AGENTS.md`
- [ ] `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`
- [ ] `documentation/tasks/generate-tasks.md`
- [ ] `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`
- [ ] `documentation/architecture/book-activity-runtime-and-assembly.md`
- [ ] `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`
- [ ] Component task lists in `documentation/tasks/PRD0062/`
- [ ] Triggered UI/design/routing/observability/security/rules docs as applicable

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

- [ ] Current owner paths confirmed.
- [ ] Current `unit` support status recorded.
- [ ] Current material kind/capability support status recorded.
- [ ] Existing Book regressions identified.

Notes:

```text
2026-07-09 / Packet 0 planning docs:
Added durable PRD0062 architecture authority at documentation/architecture/book-activity-runtime-and-assembly.md.
This document is planning authority only, not implementation proof.
It fixes the product boundary: extend the existing Book system, add Book Activity-owned modules, forbid ActivityBook, forbid legacy PDF parser dependency, and require Book Delivery projections before runtime.
```

### Activity Domain

Expected new or confirmed owner paths:

- `src/types/bookActivity.types.ts`
- `src/services/book-activity/*`
- `src/services/materialCatalog/*`

Findings:

- [ ] Activity domain owner path chosen.
- [ ] Capability registry owner path chosen.
- [ ] Student-safe projection owner path chosen.
- [ ] Semantic diff owner path chosen.

Notes:

```text
2026-07-09 / Packet 0 planning docs:
- rtk git status --short --branch
- rtk git status --short --untracked-files=all
- rtk git rev-parse HEAD
Purpose: record baseline before staging PRD0062 documentation package.
```

### Source PDF Storage And Delivery

Expected inspection targets:

- R2 upload/delivery Worker code after actual repository location is confirmed.
- `database.rules.json`
- `firestore.rules`
- backup/worker test files.

Findings:

- [ ] Current R2/Cloudflare Worker owner path confirmed.
- [ ] Private source storage boundary confirmed.
- [ ] PDF extraction engine spike owner recorded.
- [ ] Obsolete parser exclusion recorded.

Notes:

```text
TBD
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

- [ ] Current one-material assumptions recorded.
- [ ] Book Homework manifest owner path chosen.
- [ ] Activity-level submission/progress owner path chosen.
- [ ] Nested schedule owner path chosen.

Notes:

```text
TBD
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

- [ ] Thin Book dispatch seam chosen.
- [ ] Book Runtime owner path chosen.
- [ ] Autosave/reload context key owner chosen.
- [ ] Existing launcher regression set recorded.

Notes:

```text
TBD
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

- [ ] Current attempt grouping behavior recorded.
- [ ] Book Activity result identity owner chosen.
- [ ] Teacher/student result visibility boundaries recorded.
- [ ] Regression tests identified.

Notes:

```text
TBD
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

- [ ] Current ambiguous `materialId` resolution behavior recorded.
- [ ] Exact Placement binding owner path chosen.
- [ ] Course/Class progress owner path chosen.
- [ ] Sync/update boundary recorded.

Notes:

```text
TBD
```

### Notifications

Expected inspection targets:

- `src/types/notification.types.ts`
- `src/services/notificationService.ts`
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationPanel.tsx`
- `documentation/rules/announcements.md`

Findings:

- [ ] Persistent notification type/metadata owner chosen.
- [ ] Action announcement boundary recorded.
- [ ] Notification Bell regression tests identified.

Notes:

```text
TBD
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

- [ ] New route registry requirements recorded.
- [ ] New action tracking requirements recorded.
- [ ] New data nodes and rule test coverage recorded.
- [ ] Backup/index requirements recorded.

Notes:

```text
TBD
```

## Technical Spikes

- [ ] PDF excerpt engine selection.
- [ ] Source rendition latency/cost/cache behavior.
- [ ] Activity interaction-family renderer reuse boundaries.
- [ ] Cross-system idempotent update action design.
- [ ] Course/Class exact placement resolution.

## Regression Inventory

Record exact test files and test names before implementation.

- [ ] Existing Book create/edit/publish tests.
- [ ] Existing Book ref repair tests.
- [ ] Existing homework create/detail/list tests.
- [ ] Existing Reading V2 pinned assignment launch tests.
- [ ] Existing IELTS Listening/Reading/Writing/THCS StudentPracticePage routing tests.
- [ ] Existing Notification Bell tests.
- [ ] Existing result visibility and ownership tests.
- [ ] Reading V2 and Listening dependency-boundary tests.

## Decisions

Append decisions here with date, packet, source, and rationale.

```text
TBD
```

## Blockers

Append blockers here with owner, required decision, and affected packet.

```text
TBD
```

## Verification Log

Append commands and results here. Do not replace historical entries.

```text
TBD
```
