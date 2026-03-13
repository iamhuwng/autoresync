# PRD-0034: Teacher Homework Management Overhaul

**Status:** Draft
**Author:** AI Assistant + Product Owner
**Created:** 2026-03-13
**Related PRDs:** PRD-0016 (Solo Study & Homework System), PRD-0030 (IELTS Writing Test System)
**Supersedes:** Current `TeacherHomeworkListPage` + `HomeworkResultsSummary` component

---

## 1. Introduction / Overview

The current teacher homework management system (PRD-0016) provides only a flat list view of homework assignments with limited visibility into student progress. Teachers cannot drill into individual homework to see who has started, submitted, or is overdue. There are no analytics, no bulk operations UI, no archive/trash system, and critical actions like extending deadlines use `window.prompt()` instead of proper UI components.

This PRD defines a **comprehensive overhaul** of the teacher's homework management experience — from list to detail, from individual to bulk, from micro (single student) to macro (class-wide analytics). The redesign removes all Mantine dependencies (Rule 15 compliance), replaces `AppShell` with the vanilla layout pattern, and introduces proper data lifecycle management (archive, trash, soft-delete).

### Problem Statement

Teachers currently have no efficient way to:
1. See which students have/haven't started a specific homework
2. View class-wide analytics across multiple homework assignments
3. Perform bulk operations (extend deadlines, close multiple homework)
4. Archive or recover deleted homework
5. Track at-risk students with low completion rates
6. Send reminders to students who haven't submitted
7. Manage homework at scale (1000+ assignments accumulate over a school year)

### Scope

This PRD covers a **4-phase** redesign of the entire teacher homework management experience:
- **Phase 1:** Homework Detail Page + Submission Table + List Page Redesign + Mantine Removal
- **Phase 2:** Bulk Operations UI + Archive/Trash System + Tags/Labels + Per-Student Actions
- **Phase 3:** Class Analytics + Student Profile Homework View + Alert System
- **Phase 4:** Template Management UI Improvement + Reminder Notifications + Mobile Polish

---

## 2. Goals

| # | Goal | Measurable Outcome |
|---|------|--------------------|
| G1 | Provide drill-down visibility into student submissions | Teacher can see all student statuses for any homework in < 2 clicks |
| G2 | Enable class-wide analytics | Teacher can view completion rates, averages, at-risk students per class |
| G3 | Support bulk operations | Teacher can extend/close/delete multiple homework in one action |
| G4 | Implement data lifecycle management | Soft-delete with 30-day trash, auto-archive closed homework after 30 days |
| G5 | Remove all Mantine dependencies | Zero `@mantine/*` imports in homework-related components (Rule 15) |
| G6 | Handle scale (1000+ homework) | Default view loads < 50 documents; archived content loads on demand via pagination |
| G7 | Mobile-first responsive design | All features usable on mobile devices |
| G8 | Enable per-student actions | Teachers can extend deadlines, exempt, add notes, remind individual students |

---

## 3. User Stories

### Phase 1 User Stories

**US-1: Homework Detail Drill-Down**
> As a teacher, I want to click on a homework card and see a full detail page showing all assigned students with their submission status, score, and actions, so that I can monitor individual student progress.

**Acceptance Criteria:**
- AC-1.1: Clicking a homework card navigates to `/teacher/homework/:homeworkId` with breadcrumb `Homework → [Homework Title] → Details`
- AC-1.2: The detail page shows a summary stats bar (total students, submitted count, completion %, average score, on-time vs late count, "needs attention" indicators)
- AC-1.3: A student submission table shows ALL assigned students including those who haven't started
- AC-1.4: Table columns: Student Name, Status (not started / in progress / submitted / graded), Score (%), Attempt # (e.g., "2 of 3"), Time Spent, Submitted At, Late Flag (on-time / late)
- AC-1.5: Each student row has actions: View Result, Reset Homework
- AC-1.6: The detail page updates in real-time via Firestore `onSnapshot` listener as students submit (debounced at 500ms to handle burst submissions)
- AC-1.7: "Not started" students are dynamically computed from the current class roster (students who joined after assignment appear; students who left disappear)
- AC-1.8: THCS-specific homework shows a conditional config info section at the top with timer mode, penalty settings, etc.
- AC-1.9: Score display in the table shows percentage. Full type-specific score (IELTS band, THCS thang điểm 10) is visible in the result modal.
- AC-1.10: "View Result" action opens the existing `ResultDetailModal` (confirmed Mantine-free) as a modal overlay on the detail page
- AC-1.11: A score distribution mini-chart (5 bars: 0-20%, 20-40%, 40-60%, 60-80%, 80-100%) rendered with pure CSS (no charting library)
- AC-1.12: In-table search bar to filter the submission table by student name (client-side, accent-insensitive for Vietnamese names using `String.normalize('NFD')`)

**US-2: Redesigned List Page**
> As a teacher, I want a redesigned homework list page that shows summary statistics, supports search across titles/classes/students, sorting, and handles 1000+ homework without performance issues.

**Acceptance Criteria:**
- AC-2.1: Page uses vanilla layout pattern (no `AppShell` from Mantine), consistent with `TeacherLobbyPage`
- AC-2.2: Summary stats bar at the top: Total count, Active/Scheduled/Past Due/Closed breakdown, overall average completion rate, "needs attention" count, quick action buttons (Create, Close All Past Due)
- AC-2.3: Default view loads only non-archived, non-closed homework (typically 5-30 items, fast load). If a teacher has more than 25 active/scheduled/past_due/draft homework, the default view paginates at 25 items with a "Load More" button (same cursor pagination mechanism as archived view).
- AC-2.4: "Show Closed" and "Show Archived" toggles/filters load additional data via Firestore cursor pagination (25 items per page, "Load More" button)
- AC-2.5: Search bar searches across homework title, material title, class name, and student names (client-side search on loaded data, debounced 300ms, accent-insensitive for Vietnamese)
- AC-2.6: Sort options: Due date (newest/oldest), Created date, Last updated (newest first), Completion rate (highest/lowest), Title alphabetical
- AC-2.7: Status filter buttons (All, Active, Scheduled, Past Due, Draft, Closed) with counts
- AC-2.8: View mode toggle (Timeline, By Class, By Status) — preserved from current design
- AC-2.9: Client-side pagination with 25 items per page for loaded homework, page controls at bottom
- AC-2.10: Inline badges on homework cards for time-sensitive alerts: "⚡ Goes live in 2h", "🔥 Deadline in 3h", "⚠️ Overdue"
- AC-2.11: "Needs attention" banner at top of page showing homework becoming active soon + newly past-due, with "[View All]" and "[Close All Past Due]" quick actions
- AC-2.12: Vietnamese labels where appropriate (matching existing app pattern)
- AC-2.13: Mobile responsive: compact cards on mobile (title + status + due date only, tap to expand)
- AC-2.14: All empty states use professional/neutral tone (e.g., "No submissions yet for this homework")
- AC-2.15: Error handling: toast notification for minor errors, modal with retry for critical failures (e.g., "Failed to load homework")
- AC-2.16: Remove all `@mantine/core` imports: `AppShell`, `Tabs`, `Loader`, `Stack`, `Text`, `Center`. Replace with modern components and vanilla CSS equivalents.
- AC-2.17: Remove `@mantine/notifications` import. Replace with a vanilla toast notification system or integrate with existing notification pattern.

**US-3: Mantine Removal**
> As a developer maintaining Rule 15 compliance, I want all Mantine dependencies removed from homework components, so that the codebase follows the established pattern.

**Acceptance Criteria:**
- AC-3.1: `TeacherHomeworkListPage` has zero `@mantine/*` imports (currently imports `AppShell, Tabs, Loader, Stack, Text, Center` from `@mantine/core` and `notifications` from `@mantine/notifications` — **must migrate**)
- AC-3.2: `HomeworkCard` has zero `@mantine/*` imports (already Mantine-free — verify only)
- AC-3.3: `HomeworkCreateModal` — already Mantine-free (verified). No migration needed. Verify only.
- AC-3.4: `HomeworkEditModal` — already Mantine-free (verified). No migration needed. Verify only.
- AC-3.5: `HomeworkResultsSummary` is fully replaced by the new Detail Page's submission table and is deleted from the codebase (currently imports from `@mantine/core` — **delete entire component**)
- AC-3.6: `HomeworkConfigPanel` — already Mantine-free (verified). No migration needed. Verify only.
- AC-3.7: All replacement components use the project's `Card`, `CardBody`, `Button`, `Input` modern components + vanilla CSS
- AC-3.8: `UpcomingHomeworkWidget` — currently imports from `@mantine/core`. Either migrate to vanilla CSS or replace with the new `HomeworkAlertBanner` component if functionality overlaps.
- AC-3.9: `HomeworkStatusBadge` — verify Mantine-free status and consider reuse in the new alert badge system.

### Phase 2 User Stories

**US-4: Bulk Operations**
> As a teacher, I want to select multiple homework assignments and perform bulk actions (extend deadline, close, delete, duplicate), so that I can manage homework efficiently at scale.

**Acceptance Criteria:**
- AC-4.1: Each homework card on the list page has a checkbox for multi-select
- AC-4.2: When one or more cards are selected, a floating action bar appears at the bottom of the screen with available bulk actions
- AC-4.3: "Select all matching filter" shortcut (e.g., "Select all 12 Past Due")
- AC-4.4: Bulk actions available: Extend Deadline, Close, Delete, Duplicate
- AC-4.5: Bulk extend deadline offers both absolute date picker ("set new deadline to March 20") and relative extension ("extend by 24h / 3 days / 1 week")
- AC-4.6: Bulk delete requires typing "DELETE" in a confirmation input before the action is executed
- AC-4.7: Bulk delete performs soft-delete (sets `archived: true` + `archivedAt` timestamp), does NOT cascade to submissions or test results
- AC-4.8: "Close All Past Due" one-click action available on the "needs attention" banner and floating action bar
- AC-4.9: Floating action bar shows count of selected items and a "Deselect All" button
- AC-4.10: Partial failure handling: if bulk extending 5 deadlines and 1 fails, show toast "Extended 4 of 5 deadlines. 1 failed: [error detail]"

**US-5: Archive & Trash System**
> As a teacher, I want deleted homework to go to a 30-day trash, so that I can recover accidentally deleted assignments.

**Acceptance Criteria:**
- AC-5.1: Deleting homework sets `archived: true`, `archivedAt: Date.now()`, `trashExpiresAt: Date.now() + 30*24*60*60*1000` on the document (soft-delete)
- AC-5.2: Homework submissions and test results are NEVER deleted when homework is archived (submission independence principle)
- AC-5.3: "Show archived" toggle/filter on the list page shows archived homework with a visual indicator (dimmed, strikethrough, or "Archived" badge)
- AC-5.4: "Restore" action on archived homework sets `archived: false`, removes `archivedAt`/`trashExpiresAt`, and sets status to `draft` (teacher must review before re-activating, since deadline may have passed)
- AC-5.5: "Permanently Delete" action on archived homework removes the document permanently (with "DELETE" typing confirmation). Submissions remain as independent records.
- AC-5.6: Client-side check on page load: any archived homework where `trashExpiresAt < Date.now()` is permanently deleted (lazy auto-purge)
- AC-5.7: Auto-archive: closed homework with `closedAt` or last `updatedAt` older than 30 days is automatically set to `archived: true` during the auto-transition check (extend `homeworkAutoTransitionService`)

**US-6: Tags & Labels**
> As a teacher, I want to tag homework with labels (practice, midterm, revision, etc.) so that I can organize and filter my assignments.

**Acceptance Criteria:**
- AC-6.1: Homework documents gain an optional `tags: string[]` field. Missing field treated as `[]` (no migration needed)
- AC-6.2: Predefined default tags: `practice` (Luyện tập), `midterm` (Giữa kỳ), `final` (Cuối kỳ), `revision` (Ôn tập), `extra` (Bổ sung), `homework` (Bài tập về nhà), `test-prep` (Ôn thi)
- AC-6.3: Admin page gains a "Tags" sidebar tab for managing the tag list (add new predefined tags, remove unused ones)
- AC-6.4: Tags are selectable during homework creation and editing (multi-select, one homework can have multiple tags)
- AC-6.5: Tag filter on the list page (alongside status filter) — clicking a tag chip filters the list
- AC-6.6: Tag chips display with distinct colors on homework cards
- AC-6.7: Tags stored in Firestore as `array` type. Filtering uses `array-contains` query for server-side filtering when loading archived/closed homework. Client-side filtering for default (non-archived) view.

**US-7: Per-Student Actions (Detail Page)**
> As a teacher, I want to take individual actions on students from the homework detail page — extend their deadline, exempt them, add notes, or send reminders.

**Acceptance Criteria:**
- AC-7.1: Data model: `HomeworkAssignment` gains optional `studentOverrides?: { [studentId: string]: { dueDate?: number, exempted?: boolean, exemptReason?: string, notes?: string } }` field. Missing field treated as `{}`.
- AC-7.2: **Extend deadline for one student:** Teacher selects a student → "Extend Deadline" action → **opens `ExtendStudentDeadlineModal`** (date picker modal) → saves to `studentOverrides[studentId].dueDate`. Visual indicator on student row: "📌 Extended to [date]". This is NOT inline editing — always a modal.
- AC-7.3: **Exempt/excuse student:** Teacher selects a student → "Exempt" action → **opens `ExemptStudentModal`** with optional reason text input → sets `studentOverrides[studentId].exempted = true`. Student shows as "Exempted" status in a separate group at the bottom of the table. Exempted students are excluded from completion rate calculations (`completionRate = submitted / (totalStudents - exemptedCount) * 100`). This is NOT inline editing — always a modal.
- AC-7.4: **Teacher notes:** Teacher clicks "Add Note" on a student row → text input → saves to `studentOverrides[studentId].notes`. Notes are visible only to the teacher (not to students). Displayed as a small icon on the row that shows the note on hover/click.
- AC-7.5: **Send reminder:** Teacher clicks "Send Reminder" on a student row OR uses "Remind All" bulk action (reminds all students who haven't submitted). Sends an in-app notification via `notificationService` AND sets a visual flag on the student's homework list ("⚡ Teacher sent a reminder"). Maximum 3 reminders per student per homework (prevent spam). Counter tracked in `studentOverrides[studentId].reminderCount`. **Cooldown:** Teacher cannot send another reminder to the same student within 24 hours of the last reminder. Check `lastRemindedAt` timestamp before allowing — if `Date.now() - lastRemindedAt < 24 * 60 * 60 * 1000`, the "Send Reminder" button is disabled with tooltip "Reminder sent recently. Try again in [Xh]".
- AC-7.6: Firestore writes for `studentOverrides` use dot-notation paths for surgical field-level updates: `updateDoc(homeworkRef, { ['studentOverrides.student123.notes']: 'Great work!' })`. This is a single field update, not a full document rewrite.
- AC-7.7: If teacher extends the GLOBAL deadline past an individual student's override deadline, the override is auto-cleared (flagged as redundant) and the student reverts to the global deadline.
- AC-7.8: Student submission service checks extended deadline: `const dueDate = assignment.studentOverrides?.[studentId]?.dueDate ?? assignment.scheduling.dueDate`
- AC-7.9: Mobile: per-student actions accessible via a "⋮" (three-dot) menu on each student card in the card-based layout

### Phase 3 User Stories

**US-8: Class Analytics**
> As a teacher, I want to see aggregate statistics per class across all homework — completion rate, average score, and at-risk students — so that I can identify classes and students needing attention.

**Acceptance Criteria:**
- AC-8.1: Summary stats cards on the list page show overall metrics: total homework, active/scheduled/past_due/closed breakdown, overall avg completion rate, "needs attention" count
- AC-8.2: In "By Class" view mode, each class group header shows: total homework assigned to this class, average completion rate, average score, number of overdue homework, count of at-risk students (<50% completion)
- AC-8.3: At-risk students list: students with average submission completion rate < 50% across all homework for a given class. Displayed as a collapsible warning section within the class group.
- AC-8.4: Metrics computed client-side from loaded homework + submission data. No new Firestore indexes or aggregation infrastructure required.
- AC-8.5: Completion rate computation: `stats.submitted / liveClassRosterCount * 100` on the detail page (live roster for accuracy); `stats.submitted / stats.totalAssigned * 100` on the list page (stored stats for speed, approximate)
- AC-8.6: Score distribution mini-chart (5 bars, pure CSS) on the detail page's summary section
- AC-8.7: Future-phase flag: time-based trends (completion rate improving/declining) and histogram-style score distribution are deferred to a future PRD. Note them as "nice to have" but do not implement.

**US-9: Student Profile Homework View**
> As a teacher, I want to see all homework assigned to a specific student across all assignments — their completion rate, scores, and history — so that I can assess individual student performance.

**Acceptance Criteria:**
- AC-9.1: Accessible from the homework detail page: clicking a student name in the submission table opens their profile homework view
- AC-9.2: Also accessible from the class management page (students tab → click student → homework tab) — route to same view
- AC-9.3: Summary header: Student name, overall completion rate, average score, late submission count, total homework assigned
- AC-9.4: Homework list: each homework the student was assigned to, with status, best/latest score (percentage), attempt count, submitted date
- AC-9.5: Lazy expand: click a homework row to see all attempts for that homework
- AC-9.6: Data loading: query `homework_submissions` by `studentId` (single Firestore query, already indexed), group client-side by `homeworkId`, lazy-load homework titles from cache
- AC-9.7: Performance guard: if student has 50+ homework, load first 25 and show "Load more" button
- AC-9.8: Route: `/teacher/homework/student/:studentId`

**US-10: Alert System — Badges & Banner**
> As a teacher, I want to see inline badges on homework cards and a summary banner showing homework that needs my attention, so that I can quickly act on urgent items.

**Acceptance Criteria:**
- AC-10.1: Inline badges on homework cards: "⚡ Goes live in [Xh]" (scheduled, becoming active within 24h), "🔥 Deadline in [Xh]" (active, deadline within 24h), "⚠️ Overdue [Xd]" (past due)
- AC-10.2: Alert banner at top of list page (below stats bar): two columns — "Going live soon" (list of scheduled homework becoming active within 24h) and "Past deadline" (list of past-due homework)
- AC-10.3: Banner includes quick action buttons: "[View All]" scrolls to relevant section, "[Close All Past Due]" triggers bulk close
- AC-10.4: Banner is dismissible per session (dismissed state stored in sessionStorage)
- AC-10.5: Badge and banner data sourced from `getHomeworkNeedingAttention()` in `homeworkAutoTransitionService` (already exists, just needs UI wiring)
- AC-10.6: Auto-refresh: the alert data refreshes when the homework list data refreshes (via the existing `useHomeworkList` auto-refresh mechanism)

### Phase 4 User Stories

**US-11: Template Save Flow Improvement**
> As a teacher, I want to save homework configurations as templates with a proper name and description input instead of a browser prompt(), so that the template creation experience is polished.

**Acceptance Criteria:**
- AC-11.1: Replace `window.prompt()` in `HomeworkCreateModal` with a vanilla CSS modal asking for template name and optional description
- AC-11.2: Template name is required, description is optional
- AC-11.3: Validation: template name must be unique among the teacher's templates (check via `getTemplatesByTeacher()`)
- AC-11.4: Success feedback via toast notification: "Template '[name]' saved successfully"
- AC-11.5: No template browsing/editing/deleting UI in this phase — preserve current behavior for applying templates during creation

**US-12: Reminder Notifications**
> As a teacher, I want the reminder notifications I send to actually appear for students in their homework list and dashboard, so that reminders are effective.

**Acceptance Criteria:**
- AC-12.1: When teacher sends a reminder, an in-app notification is created via `notificationService.create()` with type `homework_reminder`, targeting the specific `studentId`
- AC-12.2: Student's homework list shows a "⚡ Teacher sent a reminder" badge on the relevant homework card
- AC-12.3: Reminder data stored on the homework submission (or in `studentOverrides`): `lastRemindedAt: number`. The visual flag appears if `lastRemindedAt` is within the last 48h.
- AC-12.4: Max 3 reminders per student per homework (tracked in `studentOverrides[studentId].reminderCount`). After 3, the "Send Reminder" button is disabled with tooltip "Maximum reminders sent".
- AC-12.5: "Remind All" bulk action sends reminders to all students who haven't submitted AND haven't reached the 3-reminder limit
- AC-12.6: FCM push notifications are deferred to a future PRD (stretch goal)

**US-13: Mobile Polish**
> As a teacher using a phone, I want the homework detail page's submission table to display as student cards instead of a table, so that I can review submissions comfortably on a small screen.

**Acceptance Criteria:**
- AC-13.1: Mobile breakpoint: `max-width: 768px`
- AC-13.2: List page: compact cards (title + status + due date, tap to expand full card)
- AC-13.3: Detail page submission table: card-based layout (one card per student) showing name, status, score, late flag
- AC-13.4: Per-student actions accessible via "⋮" three-dot menu on each student card
- AC-13.5: Floating action bar for bulk operations adapts to mobile (full-width, fixed to bottom)
- AC-13.6: All modals (result, edit, create) are full-screen on mobile with proper back navigation

---

## 4. Non-Goals (Out of Scope)

| # | Non-Goal | Reason |
|---|----------|--------|
| NG-1 | CSV/PDF export of submission data | Deferred — may be a future PRD |
| NG-2 | FCM push notifications | Infrastructure-heavy — deferred |
| NG-3 | WCAG 2.1 AA full compliance | Handled in a separate accessibility initiative |
| NG-4 | Semester/academic year filtering | Teacher has other plans for this feature |
| NG-5 | Co-teaching (multiple teachers per homework) | Current model is single-teacher-owned |
| NG-6 | Time-series analytics (trends over time) | Requires historical aggregation infrastructure |
| NG-7 | Score distribution histograms (per-class) | Deferred as "nice to have" |
| NG-8 | Separate grading panel for writing homework | Existing `WritingGradingPanel` (PRD-0030) handles this; detail page links to it |
| NG-9 | Template browsing/editing/deleting UI | Only improving the save flow in this PRD |
| NG-10 | Student-side changes | This PRD is teacher-facing only |
| NG-11 | Schema versioning | Lazy-default approach handles field evolution |

---

## 5. Data Model Changes

### 5.1 Modified Type: `HomeworkAssignment`

```typescript
// Additions to existing HomeworkAssignment interface in homework.types.ts
// NOTE: The existing field for teacher ownership is `createdBy` (NOT `teacherId`)

interface HomeworkAssignment {
    // ... ALL existing fields preserved ...

    // NEW — Phase 2: Tags
    tags?: string[];                    // Default: [] (missing = empty array)

    // NEW — Phase 2: Soft Delete / Archive
    archived?: boolean;                 // Default: false (missing = not archived)
    archivedAt?: number;                // Timestamp when archived
    trashExpiresAt?: number;            // Timestamp for auto-purge (archivedAt + 30 days)
    closedAt?: number;                  // Timestamp when homework was closed (used for auto-archive 30-day check)

    // NEW — Phase 2: Per-Student Overrides
    studentOverrides?: {
        [studentId: string]: {
            dueDate?: number;           // Per-student extended deadline
            exempted?: boolean;         // Student exempted from this homework
            exemptReason?: string;      // Reason for exemption
            notes?: string;             // Teacher's private notes about this student
            reminderCount?: number;     // Number of reminders sent (max 3)
            lastRemindedAt?: number;    // Timestamp of last reminder
        };
    };
}
```

**Migration strategy:** No migration needed. All new code reads these fields with nullish coalescing:
```typescript
const tags = homework.tags ?? [];
const archived = homework.archived ?? false;
const overrides = homework.studentOverrides ?? {};
const studentDueDate = overrides[studentId]?.dueDate ?? homework.scheduling.dueDate;
const isExempted = overrides[studentId]?.exempted ?? false;
const reminderCount = overrides[studentId]?.reminderCount ?? 0;
```

### 5.2 Unchanged Types

- `HomeworkSubmission` — No changes. Submissions remain independent entities.
- `TestResultRecord` (RTDB) — No changes. Results are permanent academic records.
- `HomeworkConfig`, `HomeworkTarget`, `HomeworkStatus` — No changes.

### 5.3 Firestore Queries Required

| Query | Purpose | Index Needed? |
|-------|---------|---------------|
| `where('createdBy','==',uid).where('archived','!=',true)` | Default list view | Possible composite index on `createdBy` + `archived` |
| `where('createdBy','==',uid).where('archived','==',true)` | Trash/archived view | Same index |
| `where('createdBy','==',uid).where('status','==',status)` | Status filter | Already exists |
| `where('createdBy','==',uid).where('tags','array-contains',tag)` | Tag filter | Composite index on `createdBy` + `tags` |
| `where('homeworkId','==',hwId)` on `homework_submissions` | Detail page submissions | Already exists |
| `where('studentId','==',studentId)` on `homework_submissions` | Student profile view | Already exists (`getStudentSubmissions`) |
| `orderBy('scheduling.dueDate','desc').startAfter(cursor).limit(25)` | Cursor pagination | Already exists on `dueDate` |

**⚠️ IMPORTANT:** The teacher ownership field in `HomeworkAssignment` is `createdBy`, NOT `teacherId`. The `getHomeworkByTeacher()` function in `homeworkManager.ts` uses `where('createdBy', '==', teacherId)`. All new queries must use `createdBy`.

**Note on `archived` filter query:** Firestore's `!=` operator requires a composite index. Alternative approach: query WITHOUT the `archived` filter and filter client-side (since the default view typically returns < 50 documents). This avoids index creation. When loading archived content explicitly, use `where('archived','==',true)`.

### 5.4 Admin Tag Storage

Tags are stored in a Firestore document: `app_config/homework_tags`

```typescript
interface HomeworkTagConfig {
    tags: Array<{
        id: string;       // slug: "practice", "midterm", etc.
        label: string;    // Display: "Luyện tập", "Giữa kỳ", etc.
        color?: string;   // Hex color for chip display
    }>;
    updatedAt: number;
    updatedBy: string;    // Admin UID
}
```

Default document is created on first access with the 7 predefined tags.

---

## 6. Technical Architecture

### 6.1 New Route Structure

```typescript
// Additions to constants/routes.ts
export const ROUTES = {
    // ... existing routes ...

    // Phase 1 (existing routes, redesigned pages)
    TEACHER_HOMEWORK: '/teacher/homework',                    // Exists (redesigned list page)
    TEACHER_HOMEWORK_CREATE: '/teacher/homework/create',      // Exists (unchanged — used by create modal)
    TEACHER_HOMEWORK_DETAIL: '/teacher/homework/:homeworkId',  // Exists (NEW detail page replaces unused route)
    TEACHER_HOMEWORK_EDIT: '/teacher/homework/:homeworkId/edit', // Exists (unchanged — used by edit modal)

    // Phase 3 (new route)
    TEACHER_HOMEWORK_STUDENT: '/teacher/homework/student/:studentId', // NEW

    // Note: Analytics are inline on the list page (By Class view), not a separate route
};
```

**⚠️ Route ordering in React Router:** `/teacher/homework/student/:studentId` MUST be registered BEFORE `/teacher/homework/:homeworkId` in the router config. Otherwise, React Router will match `student` as a `:homeworkId` parameter. Example:

```typescript
// In App.tsx or router config — ORDER MATTERS
<Route path="/teacher/homework/student/:studentId" element={<StudentHomeworkProfile />} />
<Route path="/teacher/homework/create" element={...} />
<Route path="/teacher/homework/:homeworkId/edit" element={...} />
<Route path="/teacher/homework/:homeworkId" element={<TeacherHomeworkDetailPage />} />
<Route path="/teacher/homework" element={<TeacherHomeworkListPage />} />
```

### 6.2 New Components (by Phase)

#### Phase 1

| Component | Location | Purpose |
|-----------|----------|---------|
| `TeacherHomeworkListPage` | `src/pages/TeacherHomeworkListPage.tsx` | **REWRITE** — Vanilla layout, no AppShell |
| `TeacherHomeworkDetailPage` | `src/pages/TeacherHomeworkDetailPage.tsx` | **NEW** — Full detail page |
| `HomeworkSummaryStats` | `src/components/homework/HomeworkSummaryStats.tsx` | **NEW** — Stats bar (reusable) |
| `HomeworkSubmissionTable` | `src/components/homework/HomeworkSubmissionTable.tsx` | **NEW** — Student submission table |
| `HomeworkAlertBanner` | `src/components/homework/HomeworkAlertBanner.tsx` | **NEW** — "Needs attention" banner |
| `HomeworkScoreDistribution` | `src/components/homework/HomeworkScoreDistribution.tsx` | **NEW** — 5-bar mini-chart (pure CSS) |
| `HomeworkBreadcrumb` | `src/components/homework/HomeworkBreadcrumb.tsx` | **NEW** — Breadcrumb navigation |
| `VanillaTabs` | `src/components/modern/VanillaTabs.tsx` | **NEW** — Vanilla CSS tabs (replaces Mantine Tabs) |
| `VanillaLoader` | `src/components/modern/VanillaLoader.tsx` | **NEW** — Vanilla CSS loader (replaces Mantine Loader) |
| `ToastNotification` | `src/components/modern/ToastNotification.tsx` | **NEW or existing** — Vanilla toast (replaces Mantine notifications) |

#### Phase 2

| Component | Location | Purpose |
|-----------|----------|---------|
| `HomeworkBulkActionBar` | `src/components/homework/HomeworkBulkActionBar.tsx` | **NEW** — Floating action bar |
| `BulkExtendModal` | `src/components/homework/BulkExtendModal.tsx` | **NEW** — Bulk extend deadline modal |
| `BulkDeleteConfirmModal` | `src/components/homework/BulkDeleteConfirmModal.tsx` | **NEW** — Type "DELETE" confirmation |
| `HomeworkTagChips` | `src/components/homework/HomeworkTagChips.tsx` | **NEW** — Tag display + filter chips |
| `StudentActionMenu` | `src/components/homework/StudentActionMenu.tsx` | **NEW** — Per-student action dropdown |
| `ExtendStudentDeadlineModal` | `src/components/homework/ExtendStudentDeadlineModal.tsx` | **NEW** — Per-student extend modal |
| `ExemptStudentModal` | `src/components/homework/ExemptStudentModal.tsx` | **NEW** — Exempt with reason input |
| `StudentNoteEditor` | `src/components/homework/StudentNoteEditor.tsx` | **NEW** — Inline note editor |
| `AdminTagManager` | `src/components/admin/AdminTagManager.tsx` | **NEW** — Tag CRUD in admin sidebar |

#### Phase 3

| Component | Location | Purpose |
|-----------|----------|---------|
| `ClassAnalyticsHeader` | `src/components/homework/ClassAnalyticsHeader.tsx` | **NEW** — Per-class stats in "By Class" view |
| `AtRiskStudentList` | `src/components/homework/AtRiskStudentList.tsx` | **NEW** — Collapsible at-risk warning |
| `StudentHomeworkProfile` | `src/pages/StudentHomeworkProfile.tsx` | **NEW** — Student's full homework history |

#### Phase 4

| Component | Location | Purpose |
|-----------|----------|---------|
| `TemplateSaveModal` | `src/components/homework/TemplateSaveModal.tsx` | **NEW** — Replaces `window.prompt()` |

### 6.3 New/Modified Hooks

| Hook | Location | Purpose | Phase |
|------|----------|---------|-------|
| `useHomeworkDetail` | `src/hooks/useHomeworkDetail.ts` | **NEW** — Loads single homework + real-time submissions via `onSnapshot`. Debounces at 500ms for burst protection. Returns `{ homework, submissions, loading, error, refetch }`. | 1 |
| `useHomeworkList` | `src/hooks/useHomeworkList.ts` | **MODIFY** — Add support for: default non-archived filter, Firestore cursor pagination (25/page), sort options, tag filter. Add `loadMore()`, `hasMore`, `sort`, `tagFilter` to return value. | 1 |
| `useClassRoster` | `src/hooks/useClassRoster.ts` | **NEW or existing** — Loads current class members for a given classId. Used for "not started" student computation. Check for existing hook first. | 1 |
| `useHomeworkTags` | `src/hooks/useHomeworkTags.ts` | **NEW** — Loads tag config from `app_config/homework_tags`. Returns `{ tags, loading }`. | 2 |
| `useBulkSelection` | `src/hooks/useBulkSelection.ts` | **NEW** — Generic multi-select state management. Returns `{ selected, toggle, selectAll, deselectAll, isSelected }`. | 2 |
| `useStudentHomework` | `src/hooks/useStudentHomework.ts` | **NEW** — Loads all submissions for a student. Cursor-paginated (25/page). Returns grouped-by-homework data. | 3 |

### 6.4 Modified Services

| Service | Modification | Phase |
|---------|-------------|-------|
| `homeworkManager.ts` | Add `archiveHomework(id)`, `restoreHomework(id)`, `permanentlyDeleteHomework(id)`, `updateStudentOverride(homeworkId, studentId, override)`. Modify `deleteHomework` to call `archiveHomework` instead of `deleteDoc`. Modify `closeHomework()` to set `closedAt: Date.now()` when closing (needed for auto-archive 30-day check). | 2 |
| `homeworkAutoTransitionService.ts` | Add auto-archive check: closed homework with `closedAt` older than 30 days (fallback to `updatedAt` if `closedAt` missing for legacy data) is automatically set to `archived: true`. Also update `getHomeworkNeedingAttention()` window from 1 hour → 24 hours to match PRD alert requirements (AC-10.1). | 2 |
| `homeworkSubmissionService.ts` | Modify `isLateSubmission()` to check `studentOverrides[studentId].dueDate` before `assignment.scheduling.dueDate`. Add `isStudentExempted(assignment, studentId)` helper. | 2 |

**Existing services to reuse (DO NOT duplicate):**

| Service | Existing Function | Reuse For |
|---------|------------------|-----------| 
| `homeworkBulkOperations.ts` | `getHomeworkStatistics(teacherId)` | `HomeworkSummaryStats` component — provides `total`, `byStatus`, `overdueCount`, `activeCount`, `upcomingCount` |
| `homeworkBulkOperations.ts` | `selectHomeworkForBulkOperation(teacherId, criteria)` | "Select all matching filter" feature (AC-4.3) — already supports filtering by status, classIds, date ranges |
| `homeworkBulkOperations.ts` | `bulkExtendDeadlines(input)` | Bulk extend (AC-4.5) — interface uses `extendByHours`, so UI must convert days→hours (3 days = 72 hours) |
| `homeworkBulkOperations.ts` | `bulkCloseHomework(input)` | Bulk close (AC-4.4) |
| `homeworkBulkOperations.ts` | `closeAllPastDueHomework(teacherId)` | "Close All Past Due" quick action (AC-4.8) |

### 6.5 Real-Time Update Architecture (Detail Page)

```typescript
// In useHomeworkDetail hook
useEffect(() => {
    if (!homeworkId) return;

    // Single onSnapshot listener for all submissions of this homework
    const submissionsQuery = query(
        collection(db, 'homework_submissions'),
        where('homeworkId', '==', homeworkId)
    );

    // Debounce: batch rapid snapshot changes within 500ms
    let debounceTimer: NodeJS.Timeout;
    const unsubscribe = onSnapshot(submissionsQuery, (snapshot) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const submissions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setSubmissions(submissions);
        }, 500);
    });

    return () => {
        clearTimeout(debounceTimer);
        unsubscribe();
    };
}, [homeworkId]);
```

**Edge case: 40 students submit within 10 seconds (timed test ending)**
- The 500ms debounce batches all 40 changes into ~1-2 state updates
- Firestore onSnapshot already batches multiple doc changes into a single snapshot event
- Net result: teacher sees the table update once or twice, not 40 times

---

## 7. Design Considerations

### 7.1 Layout Pattern

Follow the vanilla layout pattern established in the recently refactored `TeacherLobbyPage`:
- `TeacherHeader` component for navigation
- No `AppShell` wrapper
- `div` with `maxWidth: 1400px`, `margin: 0 auto`, `padding: 2rem 1rem`
- Background: `linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)` with `backgroundAttachment: fixed`

### 7.2 Component Styling

- All components use project's existing `Card`, `CardBody`, `Button`, `Input` modern components
- Custom components use vanilla CSS (inline styles or CSS modules)
- No external CSS frameworks (no Tailwind, no Mantine)
- Color palette follows existing design tokens (purple #8b5cf6, green #10b981, red #ef4444, amber #f59e0b, slate #64748b)

### 7.3 Mobile Responsive Rules

- Breakpoint: `768px`
- List page: stack cards vertically, compact layout
- Detail page: submission table → card layout
- Modals: full-screen on mobile
- Floating action bar: full-width, fixed bottom

### 7.4 Animation

Preserve existing animation patterns:
- `slideDown` for page headers
- `slideUp` for cards (staggered with `0.05s` delay per item)
- `scaleIn` for empty/loading states

---

## 8. Edge Cases & Error Handling

### 8.1 Data Edge Cases

| # | Edge Case | Handling |
|---|-----------|----------|
| E1 | Student joins class AFTER homework was assigned | They appear in "not started" list (computed from live roster) |
| E2 | Student leaves class AFTER homework was assigned | They disappear from the submission table (not in current roster) |
| E3 | Student submitted but then left the class | Their submission exists but they don't appear in the table (by design — submission is an independent record) |
| E4 | Homework assigned to a class that is later deleted | Homework shows "Unknown Class" for target. Submission table shows no students (empty roster). |
| E5 | Teacher extends global deadline past a student's individual override | Individual override is auto-cleared. Code: if `newGlobalDeadline >= override.dueDate`, remove the override. |
| E6 | Teacher exempts a student who already submitted | Exemption still sets, but submission is preserved. Status shows "Submitted (Exempted)". Completion rate still excludes them. |
| E7 | Homework has no submissions and is archived | Shown in "archived" filter. Can be restored or permanently deleted. |
| E8 | `totalAssigned` counter is stale (class roster changed) | List page uses `stats.totalAssigned` (fast, approximate). Detail page uses live roster count (accurate). |
| E9 | 1000+ homework in default view | Not possible — default excludes archived+closed. Only active/scheduled/past_due/draft load (typically 5-30). |
| E10 | Search for Vietnamese names with diacritics | Normalize with `str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')` for accent-insensitive matching |
| E11 | Orphaned submissions (homework deleted before soft-delete was implemented) | Submissions continue to exist. They reference a `homeworkId` that no longer has a document. Accept this as legacy data. |
| E12 | Trash auto-purge races with teacher restoring | Check `trashExpiresAt` before restoring. If expired during purge cycle, show "This homework has been permanently deleted." |
| E13 | 40 students submit simultaneously (timed test ends) | Firestore `onSnapshot` debounced at 500ms, batches updates. Teacher sees 1-2 refreshes, not 40. |
| E14 | Reminder sent to student who already submitted | Don't send — check submission status before sending. Show disabled "Remind" button with tooltip "Already submitted". |
| E15 | Teacher sends 4th reminder (exceeds limit) | Button disabled after 3 reminders. Tooltip: "Maximum reminders sent (3/3)". |

### 8.2 Error Handling Matrix

| Error Type | Severity | UI Treatment |
|------------|----------|-------------|
| Failed to load homework list | Critical | Modal with "Failed to load homework" + Retry button |
| Failed to load single homework detail | Critical | Modal with error + Back to List button |
| Failed to extend single deadline | Minor | Toast: "Failed to extend deadline: [error]" |
| Partial bulk operation failure | Medium | Toast: "Extended 4 of 5 deadlines. 1 failed." |
| Failed to send reminder | Minor | Toast: "Failed to send reminder to [student name]" |
| Failed to save student note | Minor | Toast: "Failed to save note" |
| Failed to archive homework | Minor | Toast: "Failed to archive homework" |
| Network offline during bulk operation | Critical | Modal: "Connection lost. Some operations may not have completed." |
| Student roster failed to load (for "not started" computation) | Medium | Show only students WITH submissions. Banner: "Could not load class roster — some students may not appear." |

---

## 9. Success Metrics

| # | Metric | Target |
|---|--------|--------|
| SM-1 | Default list page load time | < 2 seconds for teachers with < 50 active homework |
| SM-2 | Detail page load time | < 1.5 seconds (including submission data) |
| SM-3 | Homework card clicks → detail page navigation | Measurable increase in drill-down usage |
| SM-4 | Bulk operation adoption | Teachers use bulk actions instead of individual actions |
| SM-5 | Zero Mantine imports | 0 `@mantine/*` imports in any `src/components/homework/*` or `src/pages/TeacherHomework*` file |
| SM-6 | Archive usage | Teachers use archive/restore instead of permanent delete |

---

## 10. Phasing Summary

### Phase 1: Foundation (High complexity)
- Homework Detail Page with submission table and real-time updates
- Redesigned List Page — vanilla layout, summary stats, search, sort, pagination
- Mantine removal from all homework components
- Mobile responsive list page (compact cards)
- Inline alert badges on cards
- Alert banner on list page
- Score distribution mini-chart on detail page

### Phase 2: Power Tools (Medium complexity)
- Bulk operations UI (checkboxes + floating action bar)
- Archive/trash system with 30-day auto-purge
- Tags/labels system with admin management
- Per-student actions (extend, exempt, notes, remind)
- Auto-archive for closed homework > 30 days

### Phase 3: Intelligence (Medium complexity)
- Class analytics (stats per class in "By Class" view)
- At-risk student detection (< 50% completion)
- Student profile homework view (all homework for one student)
- Full alert system wiring

### Phase 4: Polish (Low-Medium complexity)
- Template save flow improvement (proper modal instead of prompt())
- Reminder notification infrastructure (in-app + visual flag)
- Mobile detail page (card-based submission layout)
- Three-dot menu for mobile per-student actions
- Full-screen modals on mobile

---

## 11. Open Questions

| # | Question | Status |
|---|----------|--------|
| OQ-1 | Should `HomeworkCreateModal` and `HomeworkEditModal` Mantine migration be part of Phase 1 or tracked separately? | Recommend Phase 1 for consistency |
| OQ-2 | The existing `useHomeworkList` hook loads ALL homework. Should Phase 1 immediately refactor to server-side filtered queries, or keep the hook and add client-side filtering as a bridge? | Recommend server-side filter in Phase 1 (required for scale) |
| OQ-3 | Should the admin tag management (US-6 AC-6.3) be in a new admin page sidebar tab, or a modal accessible from the homework list page? | User specified: admin page sidebar tab |
| OQ-4 | How should the `notificationService.create()` call structure the reminder notification? Need to verify the existing notification type system. | Research needed during Phase 4 implementation |
| OQ-5 | The `THCSHomeworkAssignDialog` is currently hardcoded with `testId=""`. Is this intentional, or a bug to fix? | Likely Phase 3 Task 2.2 artifact — investigate during implementation |

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Homework Assignment** | A teacher-created instruction to complete a specific material by a deadline. Stored in Firestore `homework_assignments` collection. |
| **Homework Submission** | A student's attempt record for a homework assignment. Independent entity. Stored in Firestore `homework_submissions` collection. |
| **Test Result** | A permanent record of a student's performance on a test/quiz. Independent entity. Stored in RTDB `test_results` node. |
| **Soft Delete / Archive** | Setting `archived: true` on a document instead of deleting it. The document remains in Firestore but is excluded from default queries. |
| **Student Override** | Per-student customization on a homework assignment (extended deadline, exemption, notes). Stored as a map field on the homework assignment document. |
| **At-Risk Student** | A student with average homework completion rate below 50% for a given class. |
| **Vanilla Layout** | The project's standard page layout using `TeacherHeader` + direct `div` styling, without Mantine's `AppShell` component. |
