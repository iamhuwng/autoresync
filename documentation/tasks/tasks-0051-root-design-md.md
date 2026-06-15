# Task List: Root DESIGN.md Source-Of-Truth Synthesis

> **Source request:** Create a root `DESIGN.md` that reflects the current teacher and student app design state.
> **Generated:** 2026-05-31
> **Target artifact:** `DESIGN.md`
> **Audience:** AI agent executing without human visual judgment
> **Scope:** Teacher and student views only. Admin is out of scope.

## Purpose

Create a concise root `DESIGN.md` that becomes the app-level design index and current-state design ledger.

The file must not invent a new design system. It must synthesize and cite the current app design state from canonical docs plus live code anchors, while explicitly labeling real implementation drift.

## Non-Negotiable Outcome

`DESIGN.md` is done only when an AI can use it to answer:

1. Which design source wins for teacher UI?
2. Which design source wins for student UI?
3. Which surfaces are in scope and out of scope?
4. Which code paths represent the current implementation?
5. Which design-doc claims are not yet true in code?
6. Which checks prove the file is source-grounded and not invented?

## Required Source Packet

Read these files before writing `DESIGN.md`.

### Root And Rules

1. `AGENTS.md`
2. `documentation/architecture/ui-design-standards.md`
3. `documentation/rules/codebase-hygiene.md`
4. `documentation/rules/student-mobile-design.md`
5. `documentation/rules/student-data-loading.md`
6. `documentation/rules/mobile-portability.md`
7. `documentation/rules/observability.md`

### Teacher Design Sources

1. `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
2. `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
3. `documentation/architecture/teacher-materials-list-view-contract.md`
4. `documentation/architecture/teacher-material-visual-taxonomy.md`
5. `documentation/architecture/teacher-route-runtime-resilience.md`
6. `documentation/architecture/teacher-test-creation-parsing-and-review.md`
7. `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md`

### Student Design Sources

1. `documentation/design/student-view-design-standard.md`
2. `documentation/architecture/student-experience-architecture.md`
3. `documentation/architecture/student-dashboard-architecture.md`
4. `documentation/architecture/student-mobile-responsiveness-architecture.md`
5. `documentation/architecture/student-shell-right-rail-architecture.md`
6. `documentation/architecture/student-shell-data-loading.md`
7. `documentation/architecture/browser-document-title-architecture.md`
8. `documentation/architecture/academic-record/page-architecture.md`
9. `documentation/architecture/academic-record/README.md`

### Reading V2 Visual Sources

1. `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
2. `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`
3. `documentation/tasks/PRD0048/reading-v2-studio-ui-assessment.md`
4. `documentation/tasks/PRD0048/design/reading-v2-build-workspace-handoff.md`
5. `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/design.md`
6. `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/academic_precision/DESIGN.md`
7. `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/each_question_task_type_design/academic_precision/DESIGN.md`

### Live Code Anchors

1. `src/components/navigation/TeacherHeader.tsx`
2. `src/components/navigation/TeacherNavigation.tsx`
3. `src/components/navigation/MobileMenu.tsx`
4. `src/pages/TeacherLobbyPage.jsx`
5. `src/components/modern/SearchFilterBar.jsx`
6. `src/components/modern/SearchFilterBar.css`
7. `src/components/modern/MaterialListView.jsx`
8. `src/components/modern/MaterialListRow.jsx`
9. `src/components/modern/materialListAdapter.js`
10. `src/components/modern/materialVisualTaxonomy.js`
11. `src/components/test-creation/TestCreationModal.tsx`
12. `src/routes/teacherRoutes.tsx`
13. `src/components/layout/StudentLayout.tsx`
14. `src/components/layout/studentLayoutStyles.ts`
15. `src/components/layout/StudentSidebar.tsx`
16. `src/components/layout/StudentRightRail.tsx`
17. `src/context/StudentShellDataContext.tsx`
18. `src/hooks/useStudentShellData.ts`
19. `src/pages/StudentDashboardPage.jsx`
20. `src/components/dashboard/StudentDashboardFeedView.jsx`
21. `src/components/dashboard/PendingReviewsWidget.tsx`
22. `src/pages/AcademicRecordPage.tsx`
23. `src/pages/StudentHomeworkListPage.tsx`
24. `src/pages/StudentCoursesPage.tsx`
25. `src/pages/StudentLibraryPage.tsx`
26. `src/pages/StudentTestResultsPage.tsx`
27. `src/routes/StudentShellRoute.tsx`
28. `src/routes/studentRoutes.tsx`
29. `src/styles/student-view-override.css`
30. `src/constants/routes.ts`

## Source Precedence

When sources conflict, use this order:

1. Root `DESIGN.md`, after this tasklist is complete, becomes the app-level index and conflict ledger.
2. `documentation/design/student-view-design-standard.md` is canonical for student visual language.
3. Student architecture docs are canonical for student ownership, layout behavior, routing, data ownership, and mobile contracts.
4. `documentation/architecture/ui-design-standards.md` is canonical for global teacher/student UI safety rules.
5. `documentation/architecture/teacher-lobby-authoring-and-navigation.md` is canonical for teacher header, lobby, and creation entry.
6. Teacher architecture docs are canonical for teacher material listing, list view, visual taxonomy, route resilience, and creation parsing/review.
7. Reading V2 Stitch/design files are visual sources only for Reading V2 Studio/build-workspace surfaces.
8. PRDs and task docs are secondary evidence, not app-level design authority.
9. Live code is current-state evidence. If code contradicts canonical docs, record it in `Known Drift`, do not silently make it design truth.

## Required DESIGN.md Shape

The new root `DESIGN.md` must use this structure:

```markdown
# DESIGN.md

## Scope
## Source Hierarchy
## Global Design Rules
## Teacher View
## Student View
## Reading V2 And Feature-Specific Design Packets
## Known Drift
## Verification Contract
## Update Rules
```

## Execution Rules

1. Do not edit app code while creating `DESIGN.md`.
2. Do not fix drift discovered during this task.
3. Do not include admin except under `Out of scope`.
4. Do not add new design decisions not traceable to source docs or live code.
5. Do not quote large doc sections. Summarize with file paths.
6. Do not use conversation logs as authority unless a canonical doc links to them.
7. Do not use PRD/task docs to override architecture docs.
8. Do not treat Stitch mock content as real product information architecture.
9. Use `Known Drift` for contradictions between design docs and current code.
10. Every normative sentence must be either source-backed or explicitly marked as unresolved.

## Task 0: Preflight And Scope Custody

**Goal:** Prove the AI is operating in the correct root and will only create/update the intended file.

**Files:**
- Read: `AGENTS.md`
- Create or modify: `DESIGN.md`

- [x] Step 0.1: Confirm exact root.

Run:

```powershell
git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" status --short --branch
```

Expected:

```text
## main...origin/main
```

Pass criteria:
- Command runs against `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`.
- No sibling checkout path appears in output.
- Dirty files, if any, are recorded and not reverted.

- [x] Step 0.2: Confirm target path.

Run:

```powershell
Test-Path -LiteralPath "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\DESIGN.md"
```

Expected:
- `False` if creating fresh.
- `True` if updating an existing file.

Pass criteria:
- If `True`, read existing file first and update in place.
- If `False`, create only `DESIGN.md`.

- [x] Step 0.3: Confirm root-only write scope.

Pass criteria:
- No files outside `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased` are modified.
- No files except `DESIGN.md` are modified unless this tasklist itself is being updated by explicit request.

## Task 1: Build Source Inventory

**Goal:** Create a reliable source map before drafting any design claims.

**Files:**
- Read: all files in `Required Source Packet`
- Create or modify: none yet

- [x] Step 1.1: Verify required docs exist.

Run:

```powershell
$paths = @(
  "AGENTS.md",
  "documentation/architecture/ui-design-standards.md",
  "documentation/design/student-view-design-standard.md",
  "documentation/architecture/teacher-lobby-authoring-and-navigation.md",
  "documentation/architecture/student-experience-architecture.md",
  "documentation/architecture/student-dashboard-architecture.md",
  "documentation/architecture/student-mobile-responsiveness-architecture.md",
  "documentation/architecture/student-shell-right-rail-architecture.md",
  "documentation/tasks/PRD0048/design/reading-v2-build-workspace-handoff.md"
)
$root = "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased"
$paths | ForEach-Object {
  $full = Join-Path $root $_
  if (-not (Test-Path -LiteralPath $full)) { "MISSING $_" }
}
```

Expected:
- No `MISSING` lines.

Pass criteria:
- Any missing canonical source is added to `Known Drift` or the task stops for source repair.

- [x] Step 1.2: Inventory design docs without broad trust.

Run:

```powershell
rg --files "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation" -g "*.md" | rg "design|student|teacher|ui|mobile|dashboard|lobby|reading-v2"
```

Pass criteria:
- Candidate files are used only to find canonical docs already listed above.
- Conversation logs and old PRDs are not promoted to authority.

- [x] Step 1.3: Inventory live teacher/student surfaces.

Run:

```powershell
rg -n "TeacherHeader|TeacherNavigation|StudentLayout|student-view-root|StudentRightRail|SearchFilterBar|MaterialListView|@mantine|AppShell" "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\src" -g "*.tsx" -g "*.jsx" -g "*.css"
```

Pass criteria:
- Teacher and student implementation anchors are identified.
- Mantine/AppShell residue is captured for drift analysis, not fixed here.

## Task 2: Define DESIGN.md Source Hierarchy

**Goal:** Make conflict resolution explicit so future AI agents do not average conflicting docs.

**Files:**
- Create or modify: `DESIGN.md`

- [x] Step 2.1: Add `Scope`.

Required content:
- Teacher view is in scope.
- Student view is in scope.
- Admin is out of scope.
- Reading V2 design packets are feature-specific addenda, not global design system authority.

Pass criteria:
- `rg -n "Admin|admin" DESIGN.md` shows admin only as out of scope or excluded.

- [x] Step 2.2: Add `Source Hierarchy`.

Required content:
- Ordered hierarchy from `Source Precedence`.
- Explicit conflict policy:
  - current architecture docs beat old PRDs/tasks
  - live code is current-state evidence
  - doc/code conflict goes to `Known Drift`
  - unsupported claims must be removed or marked unresolved

Pass criteria:
- Every canonical source path from this tasklist appears at least once in `DESIGN.md` or in a compact source table.

## Task 3: Write Global Design Rules

**Goal:** Capture app-wide design constraints shared by teacher and student surfaces.

**Files:**
- Read: `documentation/architecture/ui-design-standards.md`
- Read: `documentation/rules/codebase-hygiene.md`
- Modify: `DESIGN.md`

- [x] Step 3.1: Add global implementation rules.

Required content:
- No new `@mantine/*` imports.
- Existing Mantine in touched teacher/student UI is transitional residue.
- Prefer native HTML/CSS and repo shared primitives.
- Do not create nested Mantine providers.
- Do not create new standalone surfaces when architecture says reuse existing shell.

Pass criteria:
- `DESIGN.md` says Mantine residue exists and must not be copied.
- `DESIGN.md` does not present Mantine as an approved design option.

- [x] Step 3.2: Add visual anti-patterns.

Required content:
- Student baseline bans gradient/glass/AppShell/emoji navigation.
- Teacher has transitional glass/modern-component legacy styling, but new work must follow current architecture docs and no-Mantine rule.
- Cards must not become nested card stacks.
- Source-specific exceptions must point to the owning architecture doc.

Pass criteria:
- No rule is generalized beyond its source. Example: do not ban all teacher gradients unless source docs support it; instead label current teacher gradient/glass as legacy/current-state where code proves it.

## Task 4: Write Teacher View Section

**Goal:** Capture current teacher design truth and active code anchors.

**Files:**
- Read: teacher source packet
- Read: teacher code anchors
- Modify: `DESIGN.md`

- [x] Step 4.1: Add teacher shell and header contract.

Required content:
- `TeacherHeader` owns shared teacher chrome.
- Header stays attached to top page/shell edge.
- Page padding/max-width/content spacing belongs below header in `main` or content wrapper.
- Breakpoints:
  - `width <= 768`: mobile drawer
  - `769 <= width < 1280`: compact teacher nav dropdown
  - `width >= 1280`: full inline nav tabs
- Profile and notification controls remain visible.

Pass criteria:
- The breakpoints match `TeacherHeader.tsx` and `teacher-lobby-authoring-and-navigation.md`.

- [x] Step 4.2: Add teacher lobby/materials contract.

Required content:
- `/lobby` is the teacher material entry surface.
- Header title `Materials` and page title `Test Dashboard` are current-state code facts.
- Search/filter row belongs to `SearchFilterBar`.
- `Create New Test` opens `TestCreationModal`.
- Grid cards are summary cards and clamp long titles to two lines.
- List mode is fixed-grid scan mode with `Material`, `Items`, `Updated`, `Actions`.
- Material row icon/accent semantics come from taxonomy, not row order.
- Lobby cards/list rows must not hydrate canonical Reading V2 or student-safe payloads just to render listing summaries.

Pass criteria:
- `TeacherLobbyPage.jsx`, `SearchFilterBar.jsx`, `MaterialListView.jsx`, `MaterialListRow.jsx`, `materialListAdapter.js`, and `materialVisualTaxonomy.js` are named.

- [x] Step 4.3: Add teacher creation and route contract.

Required content:
- `TestCreationModal` owns family/skill selection.
- THCS and Reading V2 branch inside the shared creation flow.
- Legacy direct routes may remain compatibility paths but are not the normal lobby create path.
- Teacher routes are centralized in `src/routes/teacherRoutes.tsx`.

Pass criteria:
- DESIGN.md does not instruct creating a second teacher creation page or second THCS-only modal.

## Task 5: Write Student View Section

**Goal:** Capture current student design truth and active code anchors.

**Files:**
- Read: student source packet
- Read: student code anchors
- Modify: `DESIGN.md`

- [x] Step 5.1: Add student design identity.

Required content:
- Student UI is an editorial academic workspace.
- It is not a social feed clone, KPI dashboard, retail UI, toy learning app, or gradient/glass marketing surface.
- Academic Record is the primary visual anchor.
- Dashboard is the feed-specific companion anchor.
- Inter is the UI typeface.

Pass criteria:
- The section cites `student-view-design-standard.md`.

- [x] Step 5.2: Add student token and shell contract.

Required content:
- `StudentLayout` owns shared shell.
- `.student-view-root`, `studentTokens`, `S`, `mobileStyles`, and `student-view-override.css` are implementation anchors.
- Three regions are preserved:
  - left navigation rail
  - center editorial canvas
  - right contextual rail
- Desktop shell uses fixed left rail, center canvas, and 320px right rail.
- Mobile/tablet compresses the same shell into drawers.

Pass criteria:
- The student palette includes only source-backed values:
  - `#f8f9fa`
  - `#f1f4f6`
  - `#ffffff`
  - `#2b3437`
  - `#586064`
  - `#4d44e3`

- [x] Step 5.3: Add student mobile contract.

Required content:
- `<=768px` phone treatment.
- `769px-1024px` collapsed shell treatment.
- `>=1025px` desktop reference.
- Mobile header is 56px.
- Mobile feed inset is `16px 12px 24px`.
- Visible controls must meet 44px x 44px floor.
- Left and right drawers are mutually exclusive.
- Right rail drawer width is `min(320px, 85vw)`.
- Tabs/filter rows may scroll horizontally only as intentional hidden-scrollbar rows.
- No unintended horizontal overflow.

Pass criteria:
- The section cites `student-mobile-responsiveness-architecture.md` and `student-mobile-design.md`.

- [x] Step 5.4: Add student page-family contracts.

Required content:
- Dashboard order:
  - sticky masthead
  - frameless metric strip
  - recent grades chart where present
  - slim editorial tabs
  - vertical timeline feed
- Dashboard right rail:
  - shell-owned `Live Now`
  - shell-owned `Up Next`
  - shell-owned `My Classes`
  - page supplemental `Pending Reviews`
- Homework is list-first workboard.
- Courses and Library are restrained academic resource pages, not marketplace/storefront pages.
- Academic Record remains primary visual anchor.
- Detail pages are detail-first vertical reading flows.

Pass criteria:
- `StudentDashboardPage.jsx`, `StudentDashboardFeedView.jsx`, `PendingReviewsWidget.tsx`, `AcademicRecordPage.tsx`, `StudentHomeworkListPage.tsx`, `StudentCoursesPage.tsx`, and `StudentLibraryPage.tsx` are named.

## Task 6: Write Reading V2 And Feature-Specific Section

**Goal:** Keep feature-specific design packets available without letting them override global teacher/student design.

**Files:**
- Read: PRD0048 source packet
- Modify: `DESIGN.md`

- [x] Step 6.1: Add Reading V2 source boundary.

Required content:
- Reading V2 Stitch/design files are visual references for Reading V2 Studio/build-workspace only.
- Reading V2 behavior still follows PRD0048 architecture/task docs.
- Reading V2 teacher entry still starts from Teacher Lobby/TestCreationModal.
- Reading V2 student runtime remains a standalone student delivery surface where its architecture says so.

Pass criteria:
- DESIGN.md does not apply Reading V2 Stitch layout to unrelated student dashboard, teacher lobby, or general shell surfaces.

## Task 7: Write Known Drift Ledger

**Goal:** Make current doc/code mismatches explicit and non-deceptive.

**Files:**
- Modify: `DESIGN.md`

- [x] Step 7.1: Add required teacher drift entries.

Required entries:
- `src/components/test-creation/TestCreationModal.tsx` still imports `@mantine/core`.
- `src/pages/TestReviewPage.tsx` remains standalone/Mantine and lacks shared `TeacherHeader`.
- `src/pages/TeacherClassesPage.tsx` wraps `TeacherHeader` in Mantine `AppShell`.
- `src/pages/TeacherCoursesPage.tsx` wraps `TeacherHeader` in Mantine `AppShell`.
- `src/pages/TeacherGradingPage.tsx` wraps `TeacherHeader` in Mantine `AppShell`.
- `src/components/navigation/TeacherHeader.tsx` mobile drawer item list still uses emoji icons.

Pass criteria:
- Each drift entry includes:
  - file path
  - what design says
  - what code does now
  - status: `known drift`, not `approved baseline`

- [x] Step 7.2: Add required student drift entries.

Required entries:
- `src/components/layout/StudentRightRail.tsx` still uses gradient thumbnail squares / emoji-like glyph treatments where docs describe stricter v2 rail language.
- `src/components/navigation/StudentHeader.tsx` is legacy and not the current shell authority.
- `src/pages/StudentCourseDetailPage.tsx` has Mantine residue.
- `src/pages/StudentTestResultsPage.tsx` has Mantine or legacy styling residue.
- `src/pages/StudentWaitingRoomPage.jsx` has Mantine or legacy standalone delivery styling residue.
- Some standalone delivery surfaces remain visually divergent and must not define the shared student shell baseline.

Pass criteria:
- Drift ledger separates shared shell pages from standalone delivery routes.

## Task 8: Add Verification Contract

**Goal:** Define AI-only checks with objective pass/fail criteria.

**Files:**
- Modify: `DESIGN.md`

- [x] Step 8.1: Add document checks.

Required commands:

```powershell
cmd /c npm run check:utf8 -- DESIGN.md
git diff --check -- DESIGN.md
rg -n "[T]BD|[T]ODO|[m]aybe|[p]robably|[s]hould be|[n]ice to have" DESIGN.md
```

Pass criteria:
- UTF-8 check passes.
- Diff whitespace check passes.
- No unresolved placeholder language appears unless under an explicit `Open Questions` heading.

- [x] Step 8.2: Add source-grounding checks.

Required checks:

```powershell
rg -n "student-view-design-standard|teacher-lobby-authoring-and-navigation|ui-design-standards|student-experience-architecture|student-dashboard-architecture|student-mobile-responsiveness-architecture|teacher-materials-list-view-contract|teacher-material-visual-taxonomy" DESIGN.md
rg -n "Known Drift|Source Hierarchy|Teacher View|Student View|Verification Contract|Update Rules" DESIGN.md
```

Pass criteria:
- All required canonical source names appear.
- All required sections appear.

- [x] Step 8.3: Add targeted teacher test command.

Required command:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/navigation/TeacherHeader.test.tsx src/components/navigation/TeacherNavigation.test.tsx src/components/modern/SearchFilterBar.test.jsx src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/components/test-creation/TestCreationModal.test.tsx --reporter=basic"
```

Pass criteria:
- Tests pass, or failures are recorded as unrelated/current drift with exact failing test names.

- [x] Step 8.4: Add targeted student test command.

Required command:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/layout/StudentLayout.test.tsx src/components/layout/StudentSidebar.test.tsx src/pages/StudentDashboardPage.navigation.test.jsx src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentCoursesPage.test.tsx src/pages/AcademicRecordPage.test.tsx src/pages/StudentTestResultsPage.test.tsx --reporter=basic"
```

Pass criteria:
- Tests pass, or failures are recorded as unrelated/current drift with exact failing test names.

- [x] Step 8.5: Add browser verification matrix.

Required teacher checks:
- `/lobby` at 1440px: full teacher tabs visible.
- `/lobby` at 1208px: compact teacher nav dropdown visible and no tab overflow.
- `/lobby` at 768px: mobile drawer path visible.
- Search input exists: `input[placeholder="Search by title or keyword..."]`.
- Profile button exists: `button[aria-label="Open profile menu"]`.
- Compact nav button exists when expected: `button[aria-label="Open teacher navigation menu"]`.

Required student checks:
- `/student/dashboard` at 1440px: shared shell with left nav, center canvas, right rail.
- `/student/dashboard` at 375px and 320px: mobile header visible, drawers open/close, no unintended horizontal overflow.
- Student shell selector exists: `.student-view-root`.
- Right rail selector exists: `[data-testid="student-layout-right-rail"]`.
- Overflow assertion passes:

```javascript
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

Pass criteria:
- Every browser check is pass/fail, not visual preference.

## Task 9: Add Update Rules

**Goal:** Prevent root `DESIGN.md` from becoming stale or bloated.

**Files:**
- Modify: `DESIGN.md`

- [x] Step 9.1: Add maintenance protocol.

Required content:
- Update `DESIGN.md` when:
  - teacher/student shell contract changes
  - canonical design docs change
  - global visual tokens change
  - known drift is fixed or new drift is found
  - feature-specific design packets become app-level design authority
- Do not update `DESIGN.md` for:
  - admin-only design changes
  - isolated feature mockups that do not change app-level design rules
  - one-off PRD exploration

Pass criteria:
- Future AI can decide whether a change needs `DESIGN.md` update without asking a human.

## Task 10: Final AI Pass

**Goal:** Prove the artifact is complete enough for AI use.

**Files:**
- Read: `DESIGN.md`
- Modify: `DESIGN.md` only if a gate fails

- [x] Step 10.1: Run required checks.

Run:

```powershell
cmd /c npm run check:utf8 -- DESIGN.md
git diff --check -- DESIGN.md
rg -n "[T]BD|[T]ODO|[m]aybe|[p]robably|[n]ice to have" DESIGN.md
rg -n "Admin|admin" DESIGN.md
rg -n "Known Drift|Source Hierarchy|Teacher View|Student View|Verification Contract|Update Rules" DESIGN.md
```

Pass criteria:
- UTF-8 and whitespace checks pass.
- Placeholder grep returns no unresolved planning placeholders.
- Admin appears only as explicit out-of-scope text.
- Required sections exist.

- [x] Step 10.2: Validate source traceability.

Pass criteria:
- Every teacher rule traces to teacher architecture docs or teacher code.
- Every student rule traces to student design/architecture docs or student code.
- Every Reading V2 rule is scoped to Reading V2.
- Every current code contradiction appears in `Known Drift`.

- [x] Step 10.3: Validate no scope creep.

Pass criteria:
- DESIGN.md does not include admin design.
- DESIGN.md does not redesign app surfaces.
- DESIGN.md does not assign implementation work except through drift notes and update rules.
- DESIGN.md does not instruct fixing Mantine/glass/gradient residue as part of this docs task.

## Task 11: Define Market-Standard DESIGN.md Contract

**Goal:** Convert the root file from an internal source ledger into a market-standard product design-system document while preserving source-grounded authority.

**Files:**
- Read: `DESIGN.md`
- Read: all canonical docs already listed in `Required Source Packet`
- Modify: `DESIGN.md`
- Modify: this tasklist only to mark completed work

- [x] Step 11.1: Define target document shape before editing.

Required target structure:

```markdown
# DESIGN.md

## Product Design Thesis
## Audience And Jobs
## Brand Personality
## Design Principles
## Design Tokens
## Layout System
## Component Patterns
## Responsive And Mobile Rules
## Accessibility And Interaction Standards
## Content And Tone
## Surface Guidance
## Do And Do Not
## Implementation Sources
## Known Drift
## Verification Contract
## Update Rules
```

Pass criteria:
- The target structure is written into the task notes or implementation scratch before editing `DESIGN.md`.
- Existing source hierarchy, known drift, and verification content are preserved as support sections, not deleted.
- `DESIGN.md` still starts with app design guidance, not implementation archaeology.

- [x] Step 11.2: Classify current `DESIGN.md` content.

Required classification buckets:
- Keep as market-facing design guidance.
- Move into `Implementation Sources`.
- Move into `Known Drift`.
- Collapse because it duplicates linked source docs.
- Remove because it is not useful for a design-system reader.

Pass criteria:
- Every current top-level section is assigned to one bucket before rewrite.
- No current source-backed rule disappears unless its source path remains in `Implementation Sources`.
- No live-code drift entry is converted into approved design guidance.

Completion note:
- `Scope`, `Global Design Rules`, `Teacher View`, `Student View`, and `Reading V2` content moved into market-facing thesis/principles/tokens/layout/components/surface guidance.
- `Source Hierarchy` moved into `Implementation Sources`.
- `Known Drift`, verification commands, and update rules were preserved as support sections.
- Duplicate source detail was collapsed into source tables and anchors.
- No drift entry was converted into approved baseline.

- [x] Step 11.3: Define market-standard acceptance rubric.

Rubric must score these areas as `pass`, `partial`, or `fail`:
- Product/design thesis is clear in the first screen.
- Brand personality is explicit and usable by AI.
- Audience and jobs are concrete.
- Tokens include color, typography, spacing, radius, elevation, and motion.
- Component guidance includes buttons, forms, navigation, cards/panels, tables/lists, modals/drawers, tabs/filters, empty/loading/error states.
- Responsive rules include desktop, tablet, phone, touch targets, overflow, and drawers.
- Accessibility covers contrast, focus, keyboard, labels, target size, reduced motion, and semantic structure.
- Content/tone covers labels, microcopy, error messages, helper text, and no in-app feature exposition.
- Surface guidance separates teacher, student, Reading V2, and out-of-scope admin.
- Do/Do Not examples are actionable and source-backed.
- Implementation sources and drift remain traceable.

Pass criteria:
- The rubric appears in `DESIGN.md` or in this tasklist under verification.
- Each rubric row has objective pass/fail evidence that an AI can check without subjective taste.

## Task 12: Comprehensive Source And Market Scan

**Goal:** Gather enough evidence to make the rewritten `DESIGN.md` both market-standard and repo-true.

**Files:**
- Read: `DESIGN.md`
- Read: required source packet from this tasklist
- Read: `src/styles/**/*.css`, `src/components/**/*.tsx`, `src/components/**/*.jsx`, `src/pages/**/*.tsx`, `src/pages/**/*.jsx` only as needed for visible UI anchors
- Modify: `DESIGN.md` only after scan is complete

- [x] Step 12.1: Run a repo design-token scan.

Run:

```powershell
rg -n "#[0-9a-fA-F]{3,8}|rgba?\(|linear-gradient|box-shadow|border-radius|font-family|font-size|letter-spacing|@mantine|AppShell|glass|emoji|aria-label|data-testid" "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\src" -g "*.css" -g "*.ts" -g "*.tsx" -g "*.jsx"
```

Pass criteria:
- Token families in `DESIGN.md` match canonical docs or live token files.
- One-off colors/effects are not promoted unless a canonical doc approves them.
- Mantine/AppShell/glass/emoji findings go to `Known Drift`, not approved rules.

Completion note:
- Ran scan on 2026-05-31. Result: `token_scan_exit=0 count=14128`.
- Findings confirmed many one-off colors/effects/Mantine/AppShell/glass/emoji hits; root tokens stayed source-scoped.

- [x] Step 12.2: Run a component-pattern scan.

Run:

```powershell
rg -n "button|input|select|textarea|role=|aria-|data-testid|modal|drawer|tabs|filter|empty|loading|error|toast|notification|Card|Table|List|SearchFilterBar|MaterialList|StudentLayout|TeacherHeader" "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\src" -g "*.tsx" -g "*.jsx"
```

Pass criteria:
- `Component Patterns` names concrete approved patterns and owners.
- Every pattern says when to use it and when not to use it.
- Component state guidance covers default, hover/focus, active/selected, disabled, loading, empty, error, success, and destructive states where the repo has evidence.

Completion note:
- Ran scan on 2026-05-31. Result: `component_scan_exit=0 count=16098`.
- Component guidance now covers usage, state, owners, and known non-baseline drift.

- [x] Step 12.3: Run a docs authority scan.

Run:

```powershell
rg -n "canonical|source of truth|must|must not|banned|approved|owner|owns|shell|token|palette|typography|spacing|mobile|desktop|accessibility|focus|touch target|overflow|drift|Mantine|AppShell|Reading V2|TeacherHeader|StudentLayout" "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation" -g "*.md"
```

Pass criteria:
- Architecture docs outrank PRDs/task docs in the rewrite.
- Reading V2 design packets stay scoped to Reading V2.
- Transcript/conversation files are not used as authority unless a canonical doc explicitly says to use them.

Completion note:
- Ran scan on 2026-05-31. Result: `docs_scan_exit=0 count=11592`.
- Rewrite keeps architecture docs above PRDs/task docs and keeps Reading V2 packets feature-scoped.

- [x] Step 12.4: Optional market-reference scan.

Use only if local docs are insufficient for document shape, not for product-specific design decisions.

Allowed references:
- Public design-system documentation from mature products or frameworks.
- Internal repo docs in `documentation/design` and `documentation/architecture`.

Forbidden references:
- Generic blog posts that cannot be traced to real design-system practice.
- Competitor screenshots copied as product direction.
- Any source that contradicts canonical repo docs without recording conflict.

Pass criteria:
- Market references affect only document organization and completeness checks.
- Product-specific tokens, routes, surfaces, and rules remain repo-sourced.

Completion note:
- No external market references used. Local docs were sufficient for structure and product-specific authority.

## Task 13: Rewrite DESIGN.md Into Market-Standard Design-System Doc

**Goal:** Produce a polished `DESIGN.md` that a new designer, engineer, or AI agent can use without reading the whole repo first.

**Files:**
- Modify: `DESIGN.md`

- [x] Step 13.1: Add first-screen design thesis.

Required content:
- Product category and purpose.
- Teacher and student audiences.
- Core design promise.
- Explicit statement that admin is out of scope.
- One-sentence relationship between market-facing design guidance and repo source authority.

Pass criteria:
- First 40 lines answer: what product is this, who uses it, what should it feel like, and what surfaces are covered.
- No implementation drift table appears before the design thesis.

- [x] Step 13.2: Add brand personality and design principles.

Required content:
- 4-6 brand attributes with direct UI implications.
- 5-8 principles written as decision rules, not slogans.
- Teacher and student differences are explicit.

Pass criteria:
- Each principle includes `Use this when...` or equivalent actionable guidance.
- No principle conflicts with `student-view-design-standard.md` or teacher architecture docs.

- [x] Step 13.3: Add design tokens.

Required token families:
- Color: page/shell/surface/text/accent/outline/semantic colors.
- Typography: font family, sizes, weights, line-height rules.
- Spacing: page, shell, content, card, list, and mobile insets.
- Radius: buttons, cards/panels, pills, drawers/modals.
- Elevation: flat surfaces, borders, shadows, forbidden glass/decorative depth.
- Motion: allowed transitions, reduced-motion rule, forbidden decorative hover-lift.

Pass criteria:
- Every token value is source-backed or marked `unresolved`.
- Student token values include the approved palette from `student-view-design-standard.md`.
- Teacher tokens do not invent a new global palette where source docs only define local/current-state behavior.

- [x] Step 13.4: Add component patterns.

Required component groups:
- Buttons and icon buttons.
- Navigation and headers.
- Search, filters, tabs, and segmented controls.
- Cards, panels, rows, tables, and lists.
- Forms and input validation.
- Modals, drawers, overlays, and confirmation flows.
- Loading, empty, error, success, warning, disabled, and permission states.
- Notifications/toasts and observability-required actions.

Pass criteria:
- Every component group includes usage guidance, state guidance, and source anchors.
- No component group treats known drift as the preferred pattern.

- [x] Step 13.5: Add surface guidance.

Required surfaces:
- Teacher shell/header.
- Teacher Lobby materials grid/list.
- Teacher creation flow.
- Student shared shell.
- Student Dashboard.
- Homework.
- Courses.
- Library.
- Academic Record.
- Student detail/result pages.
- Reading V2 Studio/Build Workspace/runtime boundaries.

Pass criteria:
- Each surface includes owner component/file, core layout, allowed visual language, forbidden drift, and verification selector or route.
- Admin remains out of scope only.

- [x] Step 13.6: Add content and tone standards.

Required content:
- Button labels.
- Empty states.
- Error messages.
- Helper text.
- Form labels.
- Micro-labels.
- Teacher operational language.
- Student academic language.

Pass criteria:
- Rules ban visible in-app explanations of features, implementation, keyboard shortcuts, or visual styling unless the product workflow requires it.
- Error guidance includes actionable next step and avoids internal implementation names unless meant for diagnostics.

## Task 14: Vision And Browser Design Verification

**Goal:** Confirm the market-standard doc describes the real product and catches visual drift objectively.

**Files:**
- Read: `DESIGN.md`
- Use browser screenshots and DOM checks.
- Modify: `DESIGN.md` only if vision/browser evidence contradicts the doc.

- [x] Step 14.1: Prepare local browser run.

Run app using the repo's normal dev command. If port is occupied, use another port and record it.

Pass criteria:
- Browser reaches login page.
- Dev quick-login is used for teacher and student flows unless unavailable.
- Any quick-login failure is recorded with runtime/config evidence.

Completion note:
- Vite reached login at `http://localhost:5173/` and `http://127.0.0.1:5181/`.
- Quick-login failed on port 5181 due Firebase referer restriction: `auth/requests-from-referer-http://127.0.0.1:5181-are-blocked` and `auth/requests-from-referer-http://localhost:5181-are-blocked`.
- Existing same-root Vite server on `http://localhost:5173/` allowed Teacher and Student dev quick-login.

- [x] Step 14.2: Capture teacher viewport matrix.

Required routes/viewports:
- `/lobby` at 1440px.
- `/lobby` at 1208px.
- `/lobby` at 768px.
- `/lobby` at 375px.

Required checks:
- `TeacherHeader` attached to top edge.
- Full tabs at desktop.
- Compact nav at 1208px.
- Mobile drawer at 768px/375px.
- Search/filter/create row matches documented ownership.
- Grid/list material patterns match documented purpose.
- No header/tab/profile overlap.

Pass criteria:
- Screenshot evidence exists for each viewport.
- DOM selectors from `Verification Contract` pass.
- Any mismatch is added to `Known Drift` with screenshot path and exact selector/route.

Completion note:
- Screenshots: `output/playwright/teacher-lobby-1440.png`, `output/playwright/teacher-lobby-1208.png`, `output/playwright/teacher-lobby-768.png`, `output/playwright/teacher-lobby-375.png`.
- DOM checks passed for search input and expected teacher nav mode at 1440, 1208, 768, and 375.
- `/lobby` 375px horizontal overflow mismatch recorded in `DESIGN.md` `Known Drift`: `.content-tabs` / `Drafts` button, `scrollWidth=369`, `clientWidth=365`.

- [x] Step 14.3: Capture student viewport matrix.

Required routes/viewports:
- `/student/dashboard` at 1440px, 1024px, 768px, 375px, and 320px.
- `/student/homework` at 375px.
- `/student/courses` at 375px.
- `/student/library` at 375px.
- `/student/academic-record` at 375px.

Required checks:
- `.student-view-root` exists.
- Left nav, center canvas, and right rail are present or drawerized per breakpoint.
- Mobile header is visible and controls meet 44px target.
- Left/right drawers are mutually exclusive.
- Right rail drawer width is `min(320px, 85vw)`.
- No unintended horizontal overflow.
- Dashboard order matches documented anatomy.

Pass criteria:
- Screenshot evidence exists for each route/viewport.
- Overflow assertion passes on every mobile viewport:

```javascript
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

- Any mismatch is added to `Known Drift`; do not silently rewrite design truth to match bad code.

Completion note:
- Screenshots: `output/playwright/student-dashboard-1440.png`, `student-dashboard-1024.png`, `student-dashboard-768.png`, `student-dashboard-375.png`, `student-dashboard-320.png`.
- Mobile route screenshots: `student-homework-375.png`, `student-courses-375.png`, `student-library-375.png`, `student-academic-record-375.png`.
- Right rail drawer screenshots: `student-dashboard-375-right-drawer-open.png`, `student-dashboard-320-right-drawer-open.png`.
- `.student-view-root` exists on checked student routes.
- Right rail selector exists on dashboard checks.
- Student mobile overflow assertion passed on 375px and 320px dashboard plus 375px Homework, Courses, Library, and Academic Record.
- Right rail drawer visual width matched `min(320px, 85vw)` behavior: 319px at 375px viewport and 272px at 320px browser client width.

- [x] Step 14.4: Run AI vision review on screenshots.

Prompt the vision-capable reviewer with:

```text
Review these screenshots against DESIGN.md only. Return a table with:
route, viewport, pass/fail, evidence, mismatch, required DESIGN.md update or Known Drift entry.
Do not propose code fixes.
Do not judge taste beyond the written standard.
```

Vision check criteria:
- Text does not overlap.
- Header/nav controls do not collide.
- Mobile drawers and panels remain readable.
- Material rows/cards remain scan-friendly.
- Student surfaces read as academic workspace, not social/KPI/retail/toy/glass/gradient.
- Teacher transitional styling is labeled as drift where it conflicts with docs.

Pass criteria:
- Vision review returns zero undocumented mismatches.
- If mismatches exist, `DESIGN.md` gains `Known Drift` entries or corrected sourced guidance.
- Screenshots and review notes are referenced in final handoff.

Completion note:
- Vision pass inspected teacher 375, student dashboard 320, student right rail drawers at 375/320, student nav/right mutual drawer screenshots, and Academic Record 375.
- Student screenshots had no undocumented text overlap, header collision, drawer readability, or mobile overflow mismatch.
- Teacher 375 content tab overflow was the only vision/browser mismatch and is documented in `DESIGN.md` `Known Drift`.

## Task 15: Final Market-Standard AI Compliance Pass

**Goal:** Prove the rewritten file is both market-standard and source-grounded.

**Files:**
- Read: `DESIGN.md`
- Modify: `DESIGN.md` only if a gate fails

- [x] Step 15.1: Run structure checks.

Run:

```powershell
rg -n "^## (Product Design Thesis|Audience And Jobs|Brand Personality|Design Principles|Design Tokens|Layout System|Component Patterns|Responsive And Mobile Rules|Accessibility And Interaction Standards|Content And Tone|Surface Guidance|Do And Do Not|Implementation Sources|Known Drift|Verification Contract|Update Rules)$" DESIGN.md
rg -n "Color|Typography|Spacing|Radius|Elevation|Motion|Buttons|Navigation|Forms|Modals|Drawers|Loading|Empty|Error|Focus|Keyboard|Contrast|Reduced motion|Touch target" DESIGN.md
```

Pass criteria:
- All required market-standard sections exist.
- All required token/component/accessibility keywords appear in appropriate sections.

Completion note:
- Structure grep found all required H2 sections in `DESIGN.md`.
- Keyword grep found required token, component, and accessibility terms.

- [x] Step 15.2: Run source-grounding checks.

Run:

```powershell
rg -n "student-view-design-standard|teacher-lobby-authoring-and-navigation|ui-design-standards|student-experience-architecture|student-dashboard-architecture|student-mobile-responsiveness-architecture|student-shell-right-rail-architecture|teacher-materials-list-view-contract|teacher-material-visual-taxonomy|reading-v2-build-workspace-handoff" DESIGN.md
rg -n "Known Drift|not approved baseline|unresolved|source-backed|Implementation Sources" DESIGN.md
```

Pass criteria:
- Canonical source names appear.
- Drift is still explicit.
- Any unresolved claim appears only under an explicit unresolved/open-question area.

Completion note:
- Source-grounding grep found canonical source names plus `Known Drift`, `not approved baseline`, `unresolved`, `source-backed`, and `Implementation Sources`.

- [x] Step 15.3: Run quality gates.

Run:

```powershell
cmd /c npm run check:utf8 -- DESIGN.md documentation/tasks/tasks-0051-root-design-md.md
git diff --check -- DESIGN.md documentation/tasks/tasks-0051-root-design-md.md
rg -n "[T]BD|[T]ODO|[m]aybe|[p]robably|[s]hould be|[n]ice to have" DESIGN.md
rg -n "Admin|admin" DESIGN.md
```

Pass criteria:
- UTF-8 and whitespace checks pass.
- Placeholder grep returns no unresolved planning language.
- Admin appears only as out-of-scope/excluded text.

Completion note:
- `cmd /c npm run check:utf8 -- DESIGN.md documentation/tasks/tasks-0051-root-design-md.md` passed.
- `git diff --check -- DESIGN.md documentation/tasks/tasks-0051-root-design-md.md` passed.
- Placeholder grep returned no matches.
- `Admin|admin` appears only in out-of-scope/excluded/update-rule context.

- [x] Step 15.4: Run targeted regression tests.

Required commands:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/navigation/TeacherHeader.test.tsx src/components/navigation/TeacherNavigation.test.tsx src/components/modern/SearchFilterBar.test.jsx src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/components/test-creation/TestCreationModal.test.tsx --reporter=basic"
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/layout/StudentLayout.test.tsx src/components/layout/StudentSidebar.test.tsx src/pages/StudentDashboardPage.navigation.test.jsx src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentCoursesPage.test.tsx src/pages/AcademicRecordPage.test.tsx src/pages/StudentTestResultsPage.test.tsx --reporter=basic"
```

Pass criteria:
- Tests pass, or failures are recorded with exact suite/test names and reason.
- Existing unrelated failures do not block docs completion if the failure is documented and not caused by `DESIGN.md`.

Completion note:
- Teacher target command passed: 6 files, 87 tests.
- Student target command: 6 files passed, 36 tests passed, 1 suite failed before tests.
- Failing suite: `src/pages/StudentTestResultsPage.test.tsx`.
- Reason: `[vitest] No "getDatabase" export is defined on the "firebase/database" mock`; stack at `src/services/firebaseCore.js:45:25` via `src/contexts/AuthContext.jsx:10:1`.
- This is an existing test mock issue and not caused by `DESIGN.md`.

- [x] Step 15.5: Run AI self-audit.

Ask a fresh AI reviewer or separate pass:

```text
Audit DESIGN.md for market-standard design-system completeness and repo-source accuracy.
Return only:
1. Missing market-standard sections.
2. Unsourced claims.
3. Claims contradicted by code/docs.
4. Known drift omitted from the ledger.
5. Visual/browser checks still missing.
6. Verdict: pass or fail.
```

Pass criteria:
- Reviewer verdict is `pass`.
- If reviewer returns `fail`, fix `DESIGN.md` or record the exact blocker before marking this task complete.

Completion note:
- Separate pass verdict: pass.
- Missing market-standard sections: none; required H2 structure present.
- Unsourced claims: no product-specific rule found without source path, code anchor, or `unresolved` marker.
- Claims contradicted by code/docs: contradictions remain in `Known Drift`, including browser-found teacher mobile overflow.
- Known drift omitted from this pass: none found in the checked teacher/student/browser scope.
- Visual/browser checks still missing: none for the matrix listed in Task 14.

## Market-Standard Extension Done Criteria

Status note, 2026-05-31:
- Criteria 7 is satisfied after documenting the Teacher Lobby 375px overflow mismatch in `Known Drift`.
- Criteria 9 is satisfied with an unrelated/current student test mock failure recorded under Step 15.4.
- Criteria 10 is satisfied by the separate self-audit pass recorded under Step 15.5.

This extension is complete when all are true:

1. `DESIGN.md` reads first as a product design-system document, not a source-audit ledger.
2. Market-standard sections for brand, audience, principles, tokens, layout, components, responsive, accessibility, content tone, surface guidance, do/do-not, sources, drift, verification, and updates are present.
3. Every product-specific rule is source-backed or marked unresolved.
4. Teacher, student, and Reading V2 boundaries remain explicit.
5. Admin remains out of scope.
6. Known drift remains labeled as drift, not baseline.
7. Browser screenshot matrix and AI vision review produce no undocumented mismatches.
8. UTF-8 and `git diff --check` pass.
9. Targeted teacher/student tests pass or any unrelated/current failures are recorded with exact names.
10. Fresh AI self-audit verdict is `pass`.

## Market-Standard Extension Failure Conditions

The extension fails if any of these happen:

1. `DESIGN.md` becomes generic design-system advice without repo-specific truth.
2. `DESIGN.md` invents brand, token, component, or accessibility rules not supported by source docs or code evidence.
3. Implementation drift is hidden or reframed as approved baseline.
4. Reading V2 Stitch rules leak into unrelated teacher/student surfaces.
5. Admin design appears beyond out-of-scope notes.
6. Vision/browser mismatch exists without a `Known Drift` entry or sourced doc correction.
7. The final file cannot guide an AI to make visually coherent UI without reading the entire documentation folder.

## Parent Done Criteria

This tasklist is complete when all are true:

1. `DESIGN.md` exists at repo root.
2. Teacher and student sections are both present.
3. Admin is explicitly out of scope.
4. Source hierarchy is explicit and conflict-safe.
5. Known drift ledger includes teacher and student code/doc mismatches.
6. Verification contract includes document, source, test, and browser gates.
7. UTF-8 and `git diff --check` pass for `DESIGN.md`.
8. No unsupported design claim remains in the file.
9. No app code was changed.
10. If the market-standard extension is in scope, all `Market-Standard Extension Done Criteria` are true.

## Failure Conditions

The AI pass fails if any of these happen:

1. `DESIGN.md` presents old PRDs or task docs as app-level design authority.
2. `DESIGN.md` omits known code drift.
3. `DESIGN.md` treats current Mantine residue as approved future design.
4. `DESIGN.md` imports Reading V2 Stitch decisions into unrelated app-wide design.
5. `DESIGN.md` includes admin design beyond an out-of-scope note.
6. `DESIGN.md` invents tokens, breakpoints, routes, owners, or UI components.
7. `DESIGN.md` becomes a full duplicate of the scattered docs instead of a compact source-of-truth index.
8. If the market-standard extension is in scope, any `Market-Standard Extension Failure Conditions` apply.
