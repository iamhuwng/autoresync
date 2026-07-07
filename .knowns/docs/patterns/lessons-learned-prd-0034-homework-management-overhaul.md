---
title: 'Lessons Learned: PRD-0034 Homework Management Overhaul'
description: 'Consolidated lessons from PRD-0034 homework management overhaul: placeholder stubs as debt bombs, N+1 write patterns hiding in hooks, data hook purity rules, route ordering, CSS display:table bug, duplicate CSS rules, function existence verification.'
createdAt: '2026-03-13T19:20:55.832Z'
updatedAt: '2026-03-29T04:47:46.700Z'
tags:
  - lesson
  - pattern
  - homework
  - prd-0034
  - post-mortem
---

# Lessons Learned: PRD-0034 Homework Management Overhaul

## L1: Placeholder Components Are Technical Debt Bombs
**What happened:** `VanillaTabs`, `VanillaLoader`, `HomeworkScoreDistribution` were all empty stubs (`<div>Placeholder</div>`). Downstream tasks used workarounds.
**Standard:** Never commit placeholder components. Either implement fully or don't create the file.

## L2: N+1 Write Pattern Hides in Data Hooks
**What happened:** `useHomeworkList` called `updateHomeworkStatus()` for every homework on every fetch — N writes + 2N reads per page load.
**Standard:** `useFoo` hooks that fetch data MUST be pure readers. Write operations belong in services or dedicated mutation hooks.

## L3: Toast Architecture — Singleton vs Component
**What happened:** Initial implementation used per-component `<ToastNotification>` requiring prop-drilling. PRD specified `toast.success()` singleton.
**Standard:** Global UI feedback → module-level singleton + `useSyncExternalStore`. See @doc/patterns/pattern-toast-singleton-via-usesyncexternalstore

## L4: Firestore Rejects `undefined` — Always Sanitize
**What happened:** "Assign Homework" button silently failed. `thcsConfig` contained `undefined` fields.
**Standard:** Every Firestore write must sanitize `undefined` values. See @doc/patterns/pattern-firestore-undefined-sanitization

## L5: Route Parameter Ordering Matters
**What happened:** `/teacher/homework/student/:studentId` must be BEFORE `/teacher/homework/:homeworkId` — otherwise "student" is parsed as a homework ID.
**Standard:** Specific routes before parameterized catch-alls. Verify in `App.jsx` after every route addition.

## L6: CSS `display: table` on `<div>` Breaks Layout
**What happened:** Used `display: table` as default for desktop table wrapper div.
**Standard:** Only `<table>` elements should use `display: table`. Wrapping divs use `display: block`.

## L7: Duplicate CSS Rules Across Files
**What happened:** `HomeworkMobilePolish.css` duplicated rules from `HomeworkBulkActionBar.css`.
**Standard:** Component-specific responsive rules → component's own CSS. Shared mobile CSS → only cross-component rules.

## L8: "Function Was Reportedly Added But Grep Found Nothing"
**What happened:** `clearSubsumedOverrides` was mentioned in commit messages but not found in codebase.
**Standard:** After implementing a critical function, `grep -r "functionName" src/` to verify it persists.

## L9: `useMemo` for State Reset Is an Anti-Pattern
**What happened:** `useMemo(() => { setDisplayCount(PAGE_SIZE); }, [deps])` — side effect inside memoization.
**Standard:** `useMemo` for computations, `useEffect` for side effects. Will break in React concurrent mode.

## L10: Kebab Menu — Always `stopPropagation()`
**What happened:** Clicking "Edit" in kebab menu also triggered the card's onClick navigation.
**Standard:** Any clickable element inside a clickable container MUST call `e.stopPropagation()`.

---

## Moving Forward Standards

| # | Standard | Scope |
|---|----------|-------|
| S1 | Data hooks must be pure readers — no DB writes | All `useFoo` hooks |
| S2 | No placeholder/stub components — implement or don't create | All components |
| S3 | Sanitize `undefined` before Firestore writes | All Firestore writes |
| S4 | CSS-only responsive layouts — no JS breakpoints | All responsive UI |
| S5 | Specific routes before parameterized catch-alls | `App.jsx` routing |
| S6 | Component CSS owns its responsive rules | CSS architecture |
| S7 | Assess codebase before implementing large PRDs | PRD workflow |
| S8 | Post-implementation grep verification | Critical functions |
| S9 | `Promise.allSettled` for bulk operations | All bulk actions |
| S10 | Notification guard: limit + cooldown + state filter | All reminders |
| S11 | Target-based view as default for assignment lists | List pages |
| S12 | Module-level cache for async name resolution | ID → name mapping |
| S13 | 3-row compact card layout standard | High-density cards |
| S14 | Filter controls in drill-down modal, not main page | Drill-down UIs |

## Source

- `documentation/prd0034-knowledge-extraction.md` — full post-mortem
- PRD-0034 Teacher Homework Management Overhaul (17 task groups, 112+ sub-tasks)

## L11: TODO Stubs in Service Calls Are Silent Time Bombs

**What happened:** HomeworkCreateModal called queryOptimizer.getClassesByTeacher() and queryOptimizer.getAssignedStudents() - methods marked with TODO comments that were never implemented. TypeScript compiled fine because queryOptimizer is a JS file (no type-checking on method existence). Modal crashed instantly on open with TypeError: X is not a function. **Standard:** Never commit calls to non-existent methods. If a service method does not exist yet, create it or use an existing one. Run grep to verify before committing.
## L12: Null-Safety on Firebase Data Shape Properties
**What happened:** `m.title.toLowerCase()` in `filteredMaterials` crashed because some Firebase records had no `title` field. Firebase does not enforce schemas.
**Standard:** Always use `(field || '').toLowerCase()` or optional chaining when filtering/searching Firebase data. Never assume field existence.

## L13: Redundant Entry Points for the Same Modal
**What happened:** Two buttons ('Create Homework' + 'Create THCS Homework') opened the same `HomeworkCreateModal` with different preset filters. The modal already had internal filter tabs (All/Quizzes/Tests/THCS-THPT).
**Standard:** One entry point per modal. Let users select within the modal using tabs/filters. Multiple buttons for the same modal = confusion + maintenance overhead. Matches the 'Create New Test' pattern in Lobby.


## L14: Teacher Material Visibility Rules Must Match Across All Selectors

**What happened:** The teacher-side `HomeworkCreateModal` loaded all tests and quizzes through the raw query optimizer, but then filtered the list to owned materials only. Public-library materials from other teachers were visible elsewhere in teacher workflows, but they disappeared inside homework creation.

**Concrete findings:**
- `TeacherLobbyPage` and related teacher filters already distinguish between owned materials and public-library materials.
- `MaterialSelectorModal` explicitly exposes public materials with the rule: `isPublic === true` and not owned by the current teacher.
- `HomeworkCreateModal` reimplemented its own selector logic and omitted the public branch entirely.
- Because the modal consumed raw records from `queryOptimizer.getAllTests()` and `queryOptimizer.getAllQuizzes()`, nothing at the service layer enforced a consistent visibility contract.

**Root cause:** Multiple teacher-facing material selectors were allowed to own their own filtering logic instead of sharing one visibility contract. The bug was not a missing database flag. It was cross-surface drift in client-side filtering.

**Solution applied:**
- `HomeworkCreateModal` now includes both:
  - owned materials
  - public materials from other teachers
- foreign private materials remain excluded
- public entries are visually marked so a merged list still communicates source

**Current feature state after the fix:**
- Teacher homework creation now shows the same broad material universe teachers expect from other selector surfaces: owned + public-shareable.
- Teacher lobby and course material linking remain the reference surfaces for teacher-side public-material behavior.
- Student library still uses a separate discovery contract and should not be treated as identical to teacher-shareable visibility.

**Interaction risks with other features:**
- Teacher-side `public` and student-side `public library` are related but not identical concepts. Teacher selectors rely on `isPublic` plus owner exclusion; student discovery still has partially separate solo/public semantics.
- Any new teacher modal, picker, or quick-action that fetches raw tests/quizzes can silently regress if it reimplements ownership/public filtering locally.
- THCS title/type mapping can also drift between selectors when each UI maps raw records independently.
- Merged lists without a source badge create ambiguity once owned and shared materials coexist.

**Standard:** Visibility rules for the same material domain must be treated as a shared contract, not per-component behavior. If one teacher-facing selector supports owned + public-shareable materials, every other teacher-facing selector for the same action domain must be audited for the same split.

**2026-07 Teacher Materials boundary:** Teacher Materials Public Library is a
visibility query over universal summaries and includes all active public rows,
including rows owned by the current teacher. Homework/course selectors that show
a merged owned-plus-shared list may still label or group current-teacher owned
rows separately, but must not redefine Public Library as "public and not mine."

**Self-check for future work:**
- [ ] Does this new teacher-facing selector use the same owned/public split as existing teacher surfaces?
- [ ] Are foreign private materials still excluded?
- [ ] If owned and public materials are merged, is the source visible in the UI?
- [ ] Have all other selectors for the same material domain been grep-audited for drift?

## L15: Runtime Stores Are Not Listing Authority

**What happened:** Teacher Materials mixed several discovery sources: legacy
`/tests`, Reading V2 relationship overlays, Reading Passage `material_indexes`,
Book `book_indexes`, and feature-specific loaders. After retiring Reading V1,
quiz, Google Drive, and session-tab paths, My Content and Public Library looked
plausible but were incomplete because no single active-list contract covered
every supported producer.

**Standard:** Teacher Materials discovery must use the shared universal
MaterialSummary catalog. Feature-specific stores remain canonical/runtime
stores, but every supported producer needs a registry entry, lifecycle summary
writes, rules coverage, reconciliation, and tests before it can claim Teacher
Materials integration.

**Visibility rule:** My Content is an owner query over active summaries and
includes private plus public rows owned by the teacher. Public Library is a
visibility query over active public summaries and includes current-teacher
public rows too. Do not redefine Public Library as "public and not mine."

**Repair rule:** Backfill/repair writes require a reviewed dry-run report,
explicit approval, matching digest/count checks, a bounded multi-location
update, and post-write zero-op verification. `/tests` bridge repair is separate
from summary-catalog repair and must never become listing authority again.
