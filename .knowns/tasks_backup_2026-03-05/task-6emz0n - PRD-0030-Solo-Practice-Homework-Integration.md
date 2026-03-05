---
id: 6emz0n
title: 'PRD-0030: Solo Practice & Homework Integration'
status: done
priority: high
labels:
  - prd-0030
  - ielts-writing
  - phase-7
  - epic
  - student
  - solo-practice
  - homework
createdAt: '2026-02-27T20:03:57.232Z'
updatedAt: '2026-03-01T04:58:56.062Z'
timeSpent: 267
assignee: '@me'
---
# PRD-0030: Solo Practice & Homework Integration

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase 7 epic for IELTS Writing Test System (PRD-0030). Covers solo writing practice with teacher submission flow, homework integration with configurable policies, and student library updates. Students can practice writing tests independently, submit essays to enrolled teachers for grading, and complete writing homework assignments with pre-loaded previous attempts. Key components: WritingPracticeView (solo practice with localStorage auto-save, paste prevention, active time tracking), SubmitToTeacherModal (teacher selection dropdown for solo submissions), HomeworkCreateModal updates (writing-specific config fields), StudentPracticePage updates (Writing branch routing), homework writing view (isHomework flag + navigation), and StudentLibraryPage updates (writing test display with icon).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All 6 subtasks completed
- [ ] #2 Solo practice with localStorage auto-save
- [ ] #3 SubmitToTeacherModal shows enrolled teachers
- [ ] #4 Homework config in HomeworkCreateModal
- [ ] #5 StudentLibraryPage shows writing tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Phase 7 Epic Implementation Plan

### Execution Order & Dependencies

```mermaid
graph TD
  A[\"7.1 WritingPracticeView (jxyli5)\"] --> C[\"7.3 StudentPracticePage (rkow2c)\"]
  B[\"7.2 SubmitToTeacherModal (6ibc3h)\"] --> A
  A --> D[\"7.5 Homework writing view (7i9edq)\"]
  E[\"7.4 HomeworkCreateModal (dlfg5s)\"] --> D
  F[\"7.6 StudentLibraryPage (17z24x)\"]
```

### Build Order

**Step 1: @task-6ibc3h — SubmitToTeacherModal (dependency-free)**
- New file: `src/components/writing-practice/SubmitToTeacherModal.tsx` + `.css`
- Native HTML/CSS modal (NO Mantine)
- Props: `isOpen, onClose, onSubmit, studentTeachers, tasks`
- Teacher `<select>` dropdown (auto-select if single)
- Optional note `<textarea>`
- Word count summary per task
- Submit returns `{ teacherId, note }` to parent
- Safety Rule 16: register WebMCP tools

**Step 2: @task-jxyli5 — WritingPracticeView (depends on SubmitToTeacherModal)**
- New file: `src/components/writing-practice/WritingPracticeView.tsx` + `.css`
- Same 40/60 split layout as WritingTestPage
- Reuse hooks: `useExternalPastePrevention`, `useActiveTimeTracking`
- localStorage auto-save (key: `writing_practice_{materialId}_{studentUid}`)
- SoloResumeModal for session recovery
- Fetch teachers: `getStudentClasses(user.uid)` → for each class, `getClass(classId)` to get `createdBy` + class name → deduplicate teachers → pass to SubmitToTeacherModal
- Optional timer from testData.soloConfig
- Unlimited submissions (no dedup)
- No-teacher fallback: save for self-review
- Safety Rule 11: withRestoreGuard on writes
- Safety Rule 16: WebMCP tools

**Step 3: @task-rkow2c — StudentPracticePage Writing branch**
- Modify `src/pages/StudentPracticePage.tsx`
- Detect `skill === 'Writing'` from test metadata
- Add `testType: 'Writing'` detection in initialize()
- Lazy import WritingPracticeView
- Render with Suspense + CSS spinner (GAP-13)
- Safety Rule 8: verify rendered + props

**Step 4: @task-dlfg5s — HomeworkCreateModal writing config**
- Modify `src/components/homework/HomeworkCreateModal.tsx`
- When selected material `skill === 'writing'`: show config section
- `<input type=\"datetime-local\">` for due date
- Late policy radio buttons (allow-late/hard-deadline)
- Word minimum toggle + input
- Re-attempt config
- No Mantine DatePicker

**Step 5: @task-7i9edq — Homework writing view**
- Modify WritingPracticeView to support `isHomework` flag
- Detect from location.state.isHomework
- Display deadline header
- Strict word minimum enforcement
- Pre-load previous essay from Firestore on re-attempt
- Late check: hard-deadline blocks, allow-late marks late
- Post-submit: navigate to homework page
- Safety Rules 1 & 2: verify routes + state prerequisites

**Step 6: @task-17z24x — StudentLibraryPage writing tests**
- Modify `src/pages/StudentLibraryPage.tsx`
- Verify writing tests load from RTDB
- Add ✍️ icon for writing tests in cards
- Format info display (Task 1/2/Full)
- Practice button → `/student/practice/{testId}`
- Safety Rule 1: route from routes.ts

### Key Patterns & API Notes
- **Teacher IDs:** `getStudentClasses()` returns `ClassSummary[]` (no `createdBy`). Must call `getClass(classId)` per class to get `createdBy` for teacherId. Use `cls.name` as proxy for teacherName context.
- **localStorage key:** `writing_practice_{materialId}_{studentUid}`
- **Submission context.type:** `'solo-practice'` (not `'live-session'`)
- **Hooks reuse:** `useExternalPastePrevention`, `useActiveTimeTracking` from existing writing hooks
- **Auto-save:** localStorage-backed (NOT RTDB, unlike live sessions)
- **Safety Rule 16:** Each new component needs WebMCP tool registration in registry.ts
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Solo practice uses localStorage not RTDB. Unlimited resubmissions. Enrolled teachers via getStudentClasses. Homework = solo + deadline enforcement. Safety Rule 16: WebMCP tools for new features.

WebMCP removed from project - Safety Rule 16 requirements no longer apply
<!-- SECTION:NOTES:END -->

