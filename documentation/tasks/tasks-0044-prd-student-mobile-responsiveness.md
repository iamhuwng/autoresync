# Tasks — PRD-0044: Student Module Mobile Responsiveness

> **PRD:** `documentation/tasks/0044-prd-student-mobile-responsiveness.md`
> **Assessment:** `documentation/tasks/assessment-0044-mobile-foundation.md`
> **Generated:** 2026-04-10

---

## Relevant Files

### Core Layout Files (Phase 1)
- `src/components/layout/StudentLayout.tsx` — The master layout shell. Phase 1 now includes verified mobile feed padding, a true 320px-safe right-rail width cap, and the scoped scrollbar-hidden helper class here. (207 lines)
- `src/components/layout/studentLayoutStyles.ts` — Design token constants (`studentTokens`) and shared style objects (`S`). Phase 1 adds the shared `mobileStyles` export here. (277 lines)

### Tier 3 Pages (Phase 2)
- `src/pages/StudentCoursesPage.tsx` — Course enrollment list. Has 2 grids using `repeat(auto-fill, minmax(300px, 1fr))` at lines 367 and 411. (567 lines)
- `src/pages/StudentLibraryPage.tsx` - Material library. Phase 2 now uses `useNavigation('student')`, async platform `storage`, shared mobile header/tab styles, stacked mobile filters, centered touch-friendly pagination, and single-column mobile cards. (403 lines)
- `src/components/test/SoloResumeModal.tsx` - Resume-practice confirmation modal. Phase 2 now constrains the dialog to the mobile viewport, enables scrolling, and enforces 44px touch targets. (139 lines)
- `src/pages/AcademicRecordPage.tsx` — Academic record with tab switching. (843 lines)
- `src/components/academicRecord/THCSProgressTab.tsx` — THCS sub-tab rendered inside AcademicRecordPage.
- `src/components/academicRecord/ResultTimeline.tsx` — Timeline sub-component.
- `src/components/academicRecord/ResultsBySkill.tsx` — Skill-view sub-component.
- `src/components/academicRecord/ResultsByCourse.tsx` — Course-view sub-component.

### Tier 2 Pages (Phase 3)
- `src/pages/StudentDashboardPage.jsx` — Main student dashboard. Already uses `StudentLayout`.
- `src/pages/StudentHomeworkListPage.tsx` — Homework list. Has stray `import { Loader } from '@mantine/core'` on line 3, used on line 476. Has `useNavigate` on lines 2/354. (740 lines)

### Route & Config Files (Phase 4)
- `src/routes/studentRoutes.tsx` — Student route definitions. Shell children end at line 83. Homework detail is at line 122 (outside shell). Test results is at lines 98–99 and 110–111 (both outside shell). (134 lines)
- `src/routes/StudentShellRoute.tsx` — The shell route wrapper that provides sidebar/layout context.
- `src/constants/routes.ts` — Route name constants and `buildRoute` utility.
- `src/config/routeSecurity.ts` — Route security configuration.
- `src/config/featureRegistry.ts` — Feature tracking registry.

### Tier 1 Pages (Phase 5)
- `src/pages/StudentHomeworkDetailPage.tsx` — FULL REWRITE target. Uses 13 Mantine components (lines 31–46), 14 Tabler icons (lines 47–65), `useNavigate` (line 30), legacy gradient background. (871 lines)
- `src/pages/StudentTestResultsPage.tsx` — FULL REWRITE target. Uses `Center`/`Loader` from Mantine (line 20), `useNavigate` (line 15), standalone layout (no `StudentLayout`). (1147 lines)

### Test Files
- `src/pages/StudentHomeworkDetailPage.test.tsx` — Must update route-mount assertions if Phase 4 changes nesting.
- `src/pages/StudentTestResultsPage.test.tsx` — Must preserve `/student/results/:sessionCode` coverage.
- `src/pages/StudentHomeworkListPage.test.tsx` — May need mock updates after Mantine removal.
- `src/pages/AcademicRecordPage.test.tsx` — May need mock updates.

### Reference Patterns (Read-Only — Do NOT modify)
- `src/pages/StudentLibraryPage.tsx` lines 15–20 — Inline SVG icon pattern (`SvgBook`, `SvgClock`, etc.). Copy this pattern for new icons.
- `src/hooks/useMediaQuery.ts` — The standard responsive hook. Use `useMediaQuery('(max-width: 768px)')`.
- `src/hooks/useNavigation.ts` — The `useNavigation()` → `navigateTo(ROUTE_NAME)` abstraction. Use instead of `useNavigate`.
- `src/core/platform/storage.ts` — Platform storage abstraction. Use instead of raw `localStorage`.
- `src/core/platform/index.ts` — Platform barrel export.

### Rules Files (Read Before Coding)
- `documentation/rules/codebase-hygiene.md` — `@mantine/*` is BANNED for new imports.
- `documentation/rules/mobile-portability.md` — No raw `localStorage`, `useNavigate`, `window.*`, `document.*`.
- `documentation/rules/navigation.md` — All navigation must use `buildRoute()`.
- `documentation/rules/observability.md` — Feature registry must stay synchronized.
- `documentation/rules/react-patterns.md` — Component creation patterns.

### Tracking Files
- `documentation/tasks/findings-of-tasks-0044-prd-student-mobile-responsiveness.md` - Append-only implementation findings and task-list deltas discovered while executing PRD-0044.

### Notes

- Run `npm run build` after completing each parent task to verify zero build errors.
- The pre-commit hook will block any NEW `@mantine/*` imports. Existing ones in Tier 1 pages will be removed during Phase 5.
- Desktop viewport (≥1025px) must remain pixel-identical after every change. Verify by resizing browser to 1440px wide.
- Mobile viewport for testing: use Chrome DevTools device toolbar, select "iPhone SE" (375px) and "iPad Mini" (768px).

---

## Tasks

---

### Phase 1: Shared Foundation (StudentLayout + studentLayoutStyles only)

- [x] **1.0 Add mobile feed padding override to `StudentLayout.tsx`**

  > **Goal:** Reduce the horizontal padding of the `<main>` content area from `48px` to `12px` on mobile/tablet viewports, per FR-001. This is a single-line addition inside the existing mobile conditional block.

  - [x] 1.1 Open `src/components/layout/StudentLayout.tsx`. Navigate to the `<main>` element starting at **line 145**. Inside the mobile/tablet conditional style block (lines 153–160), you will see this exact code:
    ```tsx
    ...((isMobile || isTablet)
        ? {
            marginTop: 56,
            maxWidth: '100%',
            width: '100%',
            boxShadow: 'none',
        }
        : {}),
    ```
    Add `padding: '16px 12px 24px',` as a new property **after** `boxShadow: 'none',` and **before** the closing `}`. The resulting block must be:
    ```tsx
    ...((isMobile || isTablet)
        ? {
            marginTop: 56,
            maxWidth: '100%',
            width: '100%',
            boxShadow: 'none',
            padding: '16px 12px 24px',
        }
        : {}),
    ```
    **Why `16px 12px 24px`?** — `16px` top (breathing room below the 56px fixed header), `12px` left/right (matches IELTS mobile scaffold density), `24px` bottom (scroll breathing room).

  - [x] 1.2 **Verify desktop is unchanged:** Open Chrome DevTools → toggle device toolbar OFF → set browser window to **1440px wide**. Navigate to any student page (e.g., `/student/courses`). Confirm the feed area still has its original `24px 48px 48px` padding. The change you made is gated behind `(isMobile || isTablet)` so desktop must be identical.

  - [x] 1.3 **Verify mobile padding:** In Chrome DevTools → toggle device toolbar ON → select **"iPhone SE" (375×667)**. Navigate to any student page. Confirm the feed content area now has `16px 12px 24px` padding instead of `24px 48px 48px`. Content should be closer to the screen edges.

  - [x] 1.4 Run `npm run build`. Confirm zero errors. This work shipped in the shared Phase 1 foundation commit because tasks 1.0-4.0 all touched the same two layout files.

---

- [x] **2.0 Cap mobile right-rail drawer at `max-width: 85vw`**

  > **Goal:** Prevent the 320px-wide right-rail drawer from overflowing on very narrow devices (≤320px viewport), per edge case EC-6.

  - [x] 2.1 In src/components/layout/StudentLayout.tsx, navigate to the right-rail <aside> element starting at **line 166**. Inside the mobile/tablet conditional style block (lines 177-193), replace the fixed mobile width rules with a real responsive cap: use width: 'min(320px, 85vw)', minWidth: 0, and maxWidth: '85vw' so the drawer can shrink on 320px devices instead of letting minWidth: 320 override the cap.

    **Implementation note:** The original task wording (maxWidth: '85vw' added after minWidth: 320) was not sufficient in the browser because minWidth won on a 320px viewport. The final implementation preserves the 320px behavior at 375px while fitting at 320px.
  - [x] 2.2 **Verify:** On "iPhone SE" (375px) in DevTools, open the right-rail drawer by tapping the right header icon. The drawer should render at roughly 320px wide (no visual change from current behavior on 375px screens). The drawer content must not cause horizontal overflow of the viewport.

  - [x] 2.3 Run `npm run build`. Confirm zero errors. This work shipped in the shared Phase 1 foundation commit because tasks 1.0-4.0 all touched the same two layout files.

---

- [x] **3.0 Export `mobileStyles` shared token object from `studentLayoutStyles.ts`**

  > **Goal:** Provide a centralized set of reusable mobile CSS primitives that all subsequent phases will import, per PRD Section 7.2. This is a definition-only export — no page uses it yet.

  - [x] 3.1 Open `src/components/layout/studentLayoutStyles.ts`. Navigate to the **end of the file** (after line 277, which is the closing `};` of the `S` export).

  - [x] 3.2 Append the following code block **after** the `S` export, separated by one blank line:
    ```tsx
    /** Reusable mobile style primitives for student pages (PRD-0044). */
    export const mobileStyles = {
        /** Standard mobile content padding: 16px top, 12px sides, 24px bottom */
        feedPadding: { padding: '16px 12px 24px' } as React.CSSProperties,
        /** Full-width button with 44px touch target */
        fullWidthButton: { width: '100%', minHeight: 44 } as React.CSSProperties,
        /** Single-column grid for mobile card layouts */
        singleColumnGrid: { gridTemplateColumns: '1fr' } as React.CSSProperties,
        /** Flex direction column for vertical stacking */
        stackVertical: { flexDirection: 'column' as const } as React.CSSProperties,
        /** Minimum 44px touch target for interactive elements */
        touchTarget: { minHeight: 44, minWidth: 44 } as React.CSSProperties,
        /** Hide scrollbar for horizontal-scroll filter bars */
        hiddenScrollbar: {
            scrollbarWidth: 'none' as const,
            msOverflowStyle: 'none' as const,
        } as React.CSSProperties,
        /** Hide feed subtitle on mobile (duplicated in mobile header) */
        feedSubtitleHidden: { display: 'none' } as React.CSSProperties,
    };
    ```
    **Important:** The file already imports `React` on line 1 (`import React from 'react';`), so the `React.CSSProperties` type references work without a new import.

  - [x] 3.3 **Verify:** Run `npm run build`. Confirm zero errors. The new export is definition-only and has no side effects.

  - [x] 3.4 Commit: This work shipped in the shared Phase 1 foundation commit because tasks 1.0-4.0 all touched the same two layout files.

---

- [x] **4.0 Add scoped scrollbar-hidden CSS class to `StudentLayout.tsx`**

  > **Goal:** Provide a CSS class that hides scrollbars (for horizontal-scroll filter bars on mobile). Using a scoped class instead of a global override avoids hiding all scrollbars.

  - [x] 4.1 In `src/components/layout/StudentLayout.tsx`, navigate to the `<style>` block starting at **line 67**. Find the closing `\`}</style>` at **line 83**. Insert the following two CSS rules **before** the closing backtick-brace on line 83:
    ```css
    .student-mobile-scrollbar-hidden::-webkit-scrollbar { display: none; }
    .student-mobile-scrollbar-hidden { scrollbar-width: none; -ms-overflow-style: none; }
    ```
    The full `<style>` block should now end like:
    ```tsx
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        .student-mobile-scrollbar-hidden::-webkit-scrollbar { display: none; }
        .student-mobile-scrollbar-hidden { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
    ```

  - [x] 4.2 **Verify:** This CSS class is now defined but **no element applies it yet**. It will be used in Phase 2/3 when pages add `className="student-mobile-scrollbar-hidden"` to their filter bars. Confirm `npm run build` passes.

  - [x] 4.3 Commit: This work shipped in the shared Phase 1 foundation commit because tasks 1.0-4.0 all touched the same two layout files.

---

### ✅ Phase 1 Verification Checklist

Before proceeding to Phase 2, verify ALL of the following:

1. Desktop at 1440px: all student pages render exactly as before (zero visual changes).
2. Mobile at 375px (iPhone SE): feed content area has visibly reduced side padding (~12px).
3. Mobile right-rail drawer: opens and doesn't overflow the viewport.
4. `npm run build` passes clean with zero errors.
5. `mobileStyles` is exported from `studentLayoutStyles.ts` but not imported by any page yet.
6. The CSS class `.student-mobile-scrollbar-hidden` exists in the `<style>` block but is not applied to any element yet.
7. On a 375px viewport and a 320px viewport, open the mobile right rail and confirm the drawer still fits the screen and `PendingReviewsWidget` remains readable and tappable.

**Clarification:** FR-002 through FR-005 are shared consumer-page requirements. Because `S` is a static style object, each in-scope page that renders `S.feedHeaderTitle`, `S.feedHeaderSubtitle`, `S.filterBar`, or `S.filterTab` must apply its own mobile overrides in the page tasks below. Do NOT assume Phase 1 alone completes FR-002 through FR-005.

---
### Phase 2: Tier 3 — Grid Fixes (Lowest Risk)

- [x] **5.0 `StudentCoursesPage.tsx` â€” Mobile grid + touch targets**

  > **Goal:** Make the courses page fully mobile-safe by covering shared shell header/filter refinements (FR-002 through FR-005), single-column grids (FR-050), bottom-sheet unenroll modal behavior (FR-051), overflow-safe card content (FR-052), and full-width mobile CTAs (FR-053).

  - [x] 5.1 **Read rules first:** Open and read `documentation/rules/react-patterns.md` (you are creating state / using hooks). Open and read `documentation/rules/mobile-portability.md` (you will be checking for portability violations).

  - [x] 5.2 **Add `useMediaQuery` import.** At the top of `src/pages/StudentCoursesPage.tsx`, add this import (it is NOT currently imported in this file):
    ```tsx
    import { useMediaQuery } from '../hooks/useMediaQuery';
    ```
    Place it after the existing imports (e.g., after line 12). Do NOT import `useScreenSize`. Do NOT import from `@mantine/hooks`.

  - [x] 5.3 **Add `mobileStyles` import.** Update the existing import from `studentLayoutStyles` (currently on line 11):
    ```tsx
    // BEFORE:
    import { S, studentTokens } from '../components/layout/studentLayoutStyles';
    // AFTER:
    import { S, studentTokens, mobileStyles } from '../components/layout/studentLayoutStyles';
    ```

  - [x] 5.4 **Add `isMobile` hook call.** Inside the component function body (after the existing hook calls like `useAuth`, `useNavigation`, etc.), add:
    ```tsx
    const isMobile = useMediaQuery('(max-width: 768px)');
    ```
    Place it near the top of the component, alongside other hooks.

  - [x] 5.5 **Feed header mobile adjustments (FR-002, FR-003).** This page renders `S.feedHeaderTitle` and `S.feedHeaderSubtitle`. Update the title/subtitle styles inline at the usage site:
    ```tsx
    <h2 style={{ ...S.feedHeaderTitle, ...(isMobile ? { fontSize: '1.5rem' } : {}) }}>My Courses</h2>
    <p style={{ ...S.feedHeaderSubtitle, ...(isMobile ? mobileStyles.feedSubtitleHidden : {}) }}>...</p>
    ```
    Do not change the desktop typography.

  - [x] 5.6 **Filter tab mobile treatment (FR-004, FR-005).** This page renders a tab strip with `S.filterBar` and `S.filterTab`. On mobile:
    - Add `className={isMobile ? 'student-mobile-scrollbar-hidden' : undefined}` to the `S.filterBar` container.
    - Reduce the gap to `16`.
    - Add `...(isMobile ? mobileStyles.touchTarget : {})` to each tab button style.
    - Preserve `whiteSpace: 'nowrap'` so labels stay on one line and the tab strip scrolls horizontally instead of wrapping.

  - [x] 5.7 **Fix pending requests grid (FR-050).** Find this code:
    ```tsx
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, padding: 16, animation: 'dashFadeIn 0.3s ease-out' }}>
    ```
    Replace `gridTemplateColumns` with a mobile conditional and reduce extra inner padding on mobile:
    ```tsx
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: isMobile ? 12 : 16, padding: isMobile ? '0' : 16, animation: 'dashFadeIn 0.3s ease-out' }}>
    ```

  - [x] 5.8 **Fix enrolled courses grid (FR-050).** Find the identical grid pattern for enrolled courses and apply the same conditional override as 5.7.

  - [x] 5.9 **Prevent course card content overflow (FR-052).** In the course card render block, search for the title, teacher/meta rows, progress section, and action row. On mobile:
    - Add `minWidth: 0` to any flex child that owns text.
    - Add `overflow: 'hidden'`, `textOverflow: 'ellipsis'`, and `whiteSpace: 'nowrap'` to long one-line labels such as the course title or teacher name.
    - If the action row overflows, add `flexWrap: 'wrap'` or `...(isMobile ? mobileStyles.stackVertical : {})` so buttons stack instead of pushing the card wider than the viewport.
    The requirement is no horizontal overflow, not a pixel-perfect rewrite.

  - [x] 5.10 **Convert the unenroll confirmation modal into a mobile bottom sheet (FR-051).** The modal is rendered in the `unenrollConfirm` block near the bottom of `StudentCoursesPage.tsx`. Keep the backdrop overlay, but on mobile change the modal container to a bottom-sheet style:
    ```tsx
    ...(isMobile ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        top: 'auto',
        width: '100%',
        maxHeight: '60vh',
        borderRadius: '20px 20px 0 0',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
    } : {})
    ```
    If the modal action row becomes cramped, stack or wrap the buttons and give each mobile button `minHeight: 44`.

  - [x] 5.11 **Make "Browse Course Catalog" button full-width on mobile (FR-053).** Find the empty-state button and change it from `width: 'auto'` to a conditional:
    ```tsx
    <button style={{ ...localStyles.primaryBtn, width: isMobile ? '100%' : 'auto', ...(isMobile ? mobileStyles.touchTarget : {}) }} onClick={() => navigateTo('STUDENT_COURSE_CATALOG')}>Browse Course Catalog</button>
    ```

  - [x] 5.12 **Verify:** Tested at 375px and 1440px. Verified the smaller title, hidden subtitle, horizontal-scroll tabs with 44px touch targets, single-column grids, and overflow-safe course text in-browser. The unenroll bottom-sheet styling was verified from the implemented code path, but the current seeded data did not expose a public-course unenroll action to trigger that modal interactively.

  - [x] 5.13 Run `npm run build`. Commit: This work shipped in the Phase 2 Courses commit after the mobile browser verification pass.

---
- [x] **6.0 `StudentLibraryPage.tsx` - Mobile grid, filter stacking, and `localStorage` migration**

  > **Goal:** Make the library page fully mobile-safe by covering shared shell header/filter refinements (FR-002 through FR-005), single-column cards (FR-060), stacked controls (FR-061, FR-062), centered touch-friendly pagination (FR-063), `SoloResumeModal` mobile behavior (FR-064), and `localStorage` migration (FR-065).

  - [x] 6.1 **Read rules first:** Re-checked `documentation/rules/mobile-portability.md` before replacing the page's raw `localStorage` access and `useNavigate` usage.

  - [x] 6.2 **Add imports.** `src/pages/StudentLibraryPage.tsx` now imports `SoloSessionProgress`, `useMediaQuery`, `useNavigation`, `storage`, and `mobileStyles`.

  - [x] 6.3 **Replace `useNavigate` with `useNavigation`.** Replaced `useNavigate` with `const { navigateTo } = useNavigation('student');` and centralized the practice redirect in `navigateToLibraryPractice(...)` so both fresh starts and resume flows use the route abstraction and preserve the existing `context` state.

  - [x] 6.4 **Add `isMobile` hook call.** Added `const isMobile = useMediaQuery('(max-width: 768px)');` inside the component and used it to gate all mobile-only layout overrides.

  - [x] 6.5 **Feed header mobile adjustments (FR-002, FR-003).** The page title now drops to `1.5rem` on mobile and the subtitle is hidden with `mobileStyles.feedSubtitleHidden`.

  - [x] 6.6 **Top tab strip mobile treatment (FR-004, FR-005).** The top tab strip now uses `className={isMobile ? 'student-mobile-scrollbar-hidden' : undefined}`, reduces the mobile gap to `16px`, and applies `mobileStyles.touchTarget` to each tab button while preserving horizontal scrolling.

  - [x] 6.7 **Fix material cards grid (FR-060).** The materials grid now collapses to a single `1fr` column with a tighter `16px` gap on mobile, while desktop keeps the existing multi-column layout.

  - [x] 6.8 **Fix dropdown filter row for mobile (FR-061).** The expanded Skill / Type / Difficulty filter controls now stack at full width on mobile by switching each wrapper to `flex: '1 1 100%'` plus `width: '100%'`.

  - [x] 6.9 **Fix search input (FR-062).** The search/filter control row now stacks vertically on mobile, the search wrapper grows to the full available width, and the Filters / Clear buttons expand to full-width 44px touch targets.

  - [x] 6.10 **Fix pagination controls (FR-063).** The pagination row now keeps `justifyContent: 'center'`, enables wrapping, and gives both Previous / Next buttons 44px minimum touch targets on mobile.

  - [x] 6.11 **Make `SoloResumeModal` mobile-safe (FR-064).** `src/components/test/SoloResumeModal.tsx` now constrains the dialog to `calc(100vw - 24px)` / `calc(100vh - 24px)`, enables `overflowY: 'auto'` with `WebkitOverflowScrolling: 'touch'`, and gives the close / action buttons 44px touch targets while preserving backdrop click-to-close behavior.

  - [x] 6.12 **Migrate `localStorage` to platform `storage` (FR-065, EC-7).** The library page now reads saved progress through `await storage.get<SoloSessionProgress>(key)`, caches the parsed result in `pendingProgress`, and passes that object through the resume/start-new modal flow instead of re-reading raw JSON inline.

  - [x] 6.13 **Verify:** Tested `/student/library` at 375px and 1440px against the built app. Confirmed the mobile title drops to `1.5rem`, subtitle hides, top tabs scroll with hidden scrollbar and 44px touch targets, the search/filter controls stack full width, the materials grid becomes single-column, pagination stays centered with 44px buttons, and `SoloResumeModal` stays centered and scrollable. The modal verification used a seeded `solo_progress_<materialId>_<studentId>` entry for a visible card, then triggered the real Start Practice flow.

  - [x] 6.14 Ran `cmd /c npx vitest run src/components/practice/IELTSPracticeView.test.tsx --reporter=basic`, ran `npm run build`, ran `npm run check:utf8 -- src/pages/StudentLibraryPage.tsx src/components/test/SoloResumeModal.tsx`, staged the Library phase files, and shipped the work in the Phase 2 Library commit.

---
- [ ] **7.0 `AcademicRecordPage.tsx` — Mobile filter wrapping and full-width cards**

  > **Goal:** Make Academic Record fully mobile-safe by covering shared feed-header refinements (FR-002, FR-003), view-tab/date-selector wrapping (FR-070), full-width result cards (FR-071), single-column THCS content (FR-072), and full-width AI banner behavior (FR-073).

  - [ ] 7.1 **Add imports** to `src/pages/AcademicRecordPage.tsx`:
    ```tsx
    import { useMediaQuery } from '../hooks/useMediaQuery';
    import { mobileStyles } from '../components/layout/studentLayoutStyles';
    ```
    Add `mobileStyles` to the existing import if `studentTokens`/`S` are already imported from that file:
    ```tsx
    import { S, studentTokens, mobileStyles } from '../components/layout/studentLayoutStyles';
    ```

  - [ ] 7.2 **Add `isMobile` hook call** in the component body:
    ```tsx
    const isMobile = useMediaQuery('(max-width: 768px)');
    ```

  - [ ] 7.3 **Feed header mobile adjustments (FR-002, FR-003).** This page renders `S.feedHeaderTitle` and `S.feedHeaderSubtitle`. Update the usage site so the title becomes `1.5rem` on mobile and the subtitle is hidden with `mobileStyles.feedSubtitleHidden`.

  - [ ] 7.4 **Fix view tabs + date range layout (FR-070).** Find the container that holds the view-switching buttons (Overview / THCS / IELTS / Course) and the date-range selector. On mobile, make it stack vertically:
    ```tsx
    style={{
        ...existingStyle,
        ...(isMobile ? { flexDirection: 'column', gap: 12, alignItems: 'stretch' } : {}),
    }}
    ```
    This should make the date-range selector drop below the view tabs on narrow screens.

  - [ ] 7.5 **Fix result cards (FR-071).** Search for any grid or flex container that holds result timeline cards or result-by-skill cards. If they use a multi-column layout, add:
    ```tsx
    ...(isMobile ? mobileStyles.singleColumnGrid : {})
    ```
    If the container is flex-based rather than grid-based, use a mobile `flexDirection: 'column'` equivalent instead.

  - [ ] 7.6 **Pass `isMobile` to `THCSProgressTab` (FR-072).** If `THCSProgressTab` renders multi-column content, add an `isMobile` prop:
    ```tsx
    <THCSProgressTab ... isMobile={isMobile} />
    ```
    Then inside `src/components/academicRecord/THCSProgressTab.tsx`, accept the prop and apply single-column mobile layout to any internal grid containers. If the component already owns its own `useMediaQuery`, that is also acceptable — just do not mix `useMediaQuery` and `useScreenSize` in the same file.

  - [ ] 7.7 **AI Maintenance Banner (FR-073).** The `<AIMaintenanceBanner />` component is imported and rendered on this page. Verify it renders full-width on mobile without text overflow. If it has a `maxWidth`, fixed horizontal padding, or non-wrapping text, make that behavior conditional for mobile.

  - [ ] 7.8 **Verify:** Test at 375px — title is smaller, subtitle hidden, tabs and date picker stack cleanly, result cards are full-width, THCS content is single-column, and the AI banner remains readable. Test at 1440px — unchanged.

  - [ ] 7.9 Run `npm run build`. Commit: `feat(academic-record): mobile header, filter wrapping, and full-width cards [PRD-0044 Phase 2]`.

---
- [ ] **8.0 `StudentDashboardPage.jsx` — Mobile refinements**

  > **Goal:** Complete the dashboard mobile pass by covering shared header/filter refinements (FR-002 through FR-005), scrollable filter tabs (FR-031), notification-card padding (FR-032), scrollable join-class modal behavior (FR-030), and right-rail `PendingReviewsWidget` usability (FR-033).

  - [ ] 8.1 **Add imports** to `src/pages/StudentDashboardPage.jsx`:
    ```tsx
    import { useMediaQuery } from '../hooks/useMediaQuery';
    ```
    Also import `mobileStyles` if not already present:
    ```tsx
    import { mobileStyles } from '../components/layout/studentLayoutStyles';
    ```
    Note: This file is `.jsx`, so TypeScript type annotations are not available. Import values only.

  - [ ] 8.2 **Add `isMobile` hook call:**
    ```tsx
    const isMobile = useMediaQuery('(max-width: 768px)');
    ```

  - [ ] 8.3 **Filter tabs scrollbar (FR-031).** Find the filter bar container (the element using `S.filterBar`). On mobile, add the hidden-scrollbar class:
    ```tsx
    <div
        style={S.filterBar}
        className={isMobile ? 'student-mobile-scrollbar-hidden' : undefined}
    >
    ```

  - [ ] 8.4 **Filter tab gap (FR-004).** On mobile, reduce the `S.filterBar` gap to `16`:
    ```tsx
    <div
        style={{
            ...S.filterBar,
            ...(isMobile ? { gap: 16 } : {}),
        }}
        className={isMobile ? 'student-mobile-scrollbar-hidden' : undefined}
    >
    ```

  - [ ] 8.5 **Filter tab touch targets (FR-005).** For each filter tab button (elements using `S.filterTab`), add:
    ```tsx
    style={{
        ...S.filterTab,
        ...(isActive ? S.filterTabActive : {}),
        ...(isMobile ? mobileStyles.touchTarget : {}),
    }}
    ```
    Keep the labels on one line; do not allow the tab strip to wrap.

  - [ ] 8.6 **Feed header mobile adjustments (FR-002, FR-003).** Find the feed header title/subtitle and apply page-level overrides so the title becomes `1.5rem` on mobile and the subtitle is hidden with `mobileStyles.feedSubtitleHidden`.

  - [ ] 8.7 **Join-class modal (FR-030).** Find the "Join a Class" modal/overlay in `StudentDashboardPage.jsx`. If it uses `position: fixed` without internal scroll handling, add mobile-safe scrolling:
    ```tsx
    style={{
        ...existingModalContentStyle,
        ...(isMobile ? { overflowY: 'auto', maxHeight: '80vh', WebkitOverflowScrolling: 'touch' } : {}),
    }}
    ```

  - [ ] 8.8 **Reduce notification-card inset padding (FR-032).** The dashboard feed cards are rendered through `src/components/dashboard/StudentDashboardFeedView.jsx`. Update the mobile feed-card or inset style there so mobile horizontal padding is `12px` instead of the wider desktop inset. The exact style name may be `inset` or the top-level article/card container; update the real owner rather than layering extra padding in the page wrapper.

  - [ ] 8.9 **Verify the mobile right rail and `PendingReviewsWidget` (FR-033).** `StudentDashboardPage.jsx` passes `PendingReviewsWidget` into the right rail. At 375px and 320px widths, open the right-rail drawer and confirm the widget remains readable, scrollable, and tappable. If the narrower `85vw` drawer exposes a spacing problem, make the smallest possible mobile-only fix in `src/components/dashboard/PendingReviewsWidget.tsx` or the drawer container without changing desktop behavior.

  - [ ] 8.10 **Verify:** Test at 375px — title is smaller, subtitle hidden, filter tabs scroll horizontally with hidden scrollbar, tab text is touchable at 44px, notification cards use tighter side padding, the Join a Class modal scrolls, and the right rail still comfortably renders `PendingReviewsWidget`. Test at 1440px — unchanged.

  - [ ] 8.11 Run `npm run build`. Commit: `feat(dashboard): mobile header, feed, filter tabs, and rail refinements [PRD-0044 Phase 3]`.

---
- [ ] **9.0 `StudentHomeworkListPage.tsx` — Mantine cleanup + mobile overrides**

  > **Goal:** Remove the stray Mantine `Loader` (FR-039), replace `useNavigate` with `useNavigation`, apply shared feed-header refinements (FR-002, FR-003), add mobile card padding (FR-040), full-width action buttons (FR-041, FR-043), and wrapping badge rows (FR-042).

  - [ ] 9.1 **Read rules first:** Open `documentation/rules/codebase-hygiene.md` — `@mantine/*` is banned. Open `documentation/rules/mobile-portability.md` — `useNavigate` is banned.

  - [ ] 9.2 **Remove Mantine `Loader` import (FR-039).** Delete:
    ```tsx
    import { Loader } from '@mantine/core';
    ```

  - [ ] 9.3 **Replace `<Loader />` usage.** Find the JSX `<Loader />` usage and replace it with a native CSS spinner. Use this pattern (same as used in `StudentLibraryPage.tsx` loading states):
    ```tsx
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
        <div style={{
            width: 32,
            height: 32,
            border: `3px solid ${studentTokens.borderSoft}`,
            borderTop: `3px solid ${studentTokens.accent}`,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        }} />
    </div>
    ```
    Add a matching `@keyframes spin` if the file or a shared shell style does not already define one.

  - [ ] 9.4 **Replace `useNavigate` with `useNavigation`.**
    - Remove `import { useNavigate } from 'react-router-dom';`
    - Add `import { useNavigation } from '../hooks/useNavigation';`
    - Replace `const navigate = useNavigate();` with `const { navigateTo } = useNavigation();`
    - Search the file for all `navigate(` calls and replace them with route-registry-safe navigation helpers.

  - [ ] 9.5 **Add `useMediaQuery` and `mobileStyles` imports:**
    ```tsx
    import { useMediaQuery } from '../hooks/useMediaQuery';
    import { S, studentTokens, mobileStyles } from '../components/layout/studentLayoutStyles';
    ```

  - [ ] 9.6 **Add `isMobile` hook call:**
    ```tsx
    const isMobile = useMediaQuery('(max-width: 768px)');
    ```

  - [ ] 9.7 **Feed header mobile adjustments (FR-002, FR-003).** This page renders `S.feedHeaderTitle` and `S.feedHeaderSubtitle`. Update the usage site so the title becomes `1.5rem` on mobile and the subtitle is hidden with `mobileStyles.feedSubtitleHidden`.

  - [ ] 9.8 **Mobile card padding (FR-040).** Find the homework card containers. Reduce their mobile padding to:
    ```tsx
    padding: isMobile ? '12px 12px 16px' : /* existing value */
    ```

  - [ ] 9.9 **Full-width action buttons (FR-041, FR-043).** Find the "View Details" / "Start" / "View Results" buttons inside homework cards. On mobile, make them full-width:
    ```tsx
    style={{
        ...existingButtonStyle,
        ...(isMobile ? mobileStyles.fullWidthButton : {}),
    }}
    ```

  - [ ] 9.10 **Wrapping badges (FR-042).** Find the status badge + time-remaining indicator row. Add mobile wrapping:
    ```tsx
    style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        ...(isMobile ? { flexWrap: 'wrap' } : {}),
    }}
    ```

  - [ ] 9.11 **Verify:** After removing the Mantine import, run `npm run build` immediately to confirm no build errors. Then test at 375px — title is smaller, subtitle hidden, homework cards have reduced padding, buttons are full-width, and badges wrap. Test at 1440px — unchanged.

  - [ ] 9.12 **Run existing tests:** `npx vitest run src/pages/StudentHomeworkListPage.test.tsx`. If the test mocks `@mantine/core`, remove or update those mocks since `Loader` is no longer imported.

  - [ ] 9.13 Commit: `fix(homework-list): remove Mantine Loader and add mobile header/card overrides [PRD-0044 Phase 3]`.

---
- [ ] **10.0 Move `StudentHomeworkDetailPage` route under `StudentShellRoute`**

  > **Goal:** Move the `/student/homework/:homeworkId` route from its current position (outside the shell, line 122 of `studentRoutes.tsx`) to inside the `StudentShellRoute` children array, while **preserving the exact public URL**.

  - [ ] 10.1 **Read rules first:** Open `documentation/rules/navigation.md`. Open `documentation/rules/observability.md`.

  - [ ] 10.2 Open `src/routes/studentRoutes.tsx`. The `StudentShellRoute` children array starts at line 46 and ends at line 83 (the closing `]`). The homework detail route is currently at lines 121–124:
    ```tsx
    {
        path: '/student/homework/:homeworkId',
        element: asStudentPage(<StudentHomeworkDetailPage />, 'homework'),
    },
    ```

  - [ ] 10.3 **Move the route inside the shell children.** Cut lines 121–124 and paste them inside the children array (before the closing `]` on line 83). When moving inside the shell, the path becomes **relative** to the parent `/student` path. Change:
    ```tsx
    // INSIDE StudentShellRoute children:
    {
        path: 'homework/:homeworkId',
        element: asStudentPage(<StudentHomeworkDetailPage />, 'homework'),
    },
    ```
    Note: The path changed from `/student/homework/:homeworkId` (absolute) to `homework/:homeworkId` (relative to the `/student` parent). The resulting public URL remains `/student/homework/:homeworkId`.

  - [ ] 10.4 **Also move the homework test route.** The route at lines 125–128:
    ```tsx
    {
        path: '/student/homework/:homeworkId/test',
        element: asStudentPage(<StudentPracticePage />, 'testTaking'),
    },
    ```
    Move inside the shell children and change to relative path:
    ```tsx
    {
        path: 'homework/:homeworkId/test',
        element: asStudentPage(<StudentPracticePage />, 'testTaking'),
    },
    ```

  - [ ] 10.5 **Verify route contract:** Open browser → navigate directly to `/student/homework/test-id-123`. The page must load. Refresh the page. It must still load. The URL in the browser bar must remain `/student/homework/test-id-123`.

  - [ ] 10.6 **Verify route registries.** Open each of these files and confirm the route path `/student/homework/:homeworkId` is still listed:
    - `src/constants/routes.ts` — Look for `STUDENT_HOMEWORK_DETAIL`. Confirm the path matches.
    - `src/config/routeSecurity.ts` — Confirm the route is listed.
    - `src/config/featureRegistry.ts` — Confirm the `homework` feature maps to this route.

  - [ ] 10.7 **Update test file if needed.** Open `src/pages/StudentHomeworkDetailPage.test.tsx`. If the test explicitly mounts the route at a specific path or tests route structure, update it to match the new nesting.

  - [ ] 10.8 Run `npm run build` and `npx vitest run src/pages/StudentHomeworkDetailPage.test.tsx`. Commit: `refactor(routes): move homework detail under StudentShellRoute [PRD-0044 Phase 4]`.

---

- [ ] **11.0 Move `StudentTestResultsPage` routes under `StudentShellRoute`**

  > **Goal:** Move both `/student-test-results/:sessionCode` (line 98) and `/student/results/:sessionCode` (line 110) under the shell, preserving both public URLs.

  - [ ] 11.1 **This is trickier than 10.0** because:
    - The canonical path `/student-test-results/:sessionCode` is NOT under `/student` (it's a top-level path).
    - The legacy path `/student/results/:sessionCode` IS logically under `/student` but is currently outside the shell.

  - [ ] 11.2 **Strategy:** Move the legacy path `/student/results/:sessionCode` inside the shell children as `results/:sessionCode`. For the canonical `/student-test-results/:sessionCode`, it CANNOT be a relative child of `/student` since its path doesn't start with `/student`. **Keep it as a top-level route** but wrap the component in `<StudentLayout>` with `shellData` prop self-provided. Alternatively, if `StudentLayout` can work without shell context (using `<ConnectedStudentRightRail>` which fetches its own data), simply wrap it directly.

  - [ ] 11.3 **Move legacy route into shell.** Cut lines 110–112 from `studentRoutes.tsx`:
    ```tsx
    {
        path: '/student/results/:sessionCode',
        element: asStudentPage(<StudentTestResultsPage />, 'results'),
    },
    ```
    Paste inside the shell children and change to relative:
    ```tsx
    {
        path: 'results/:sessionCode',
        element: asStudentPage(<StudentTestResultsPage />, 'results'),
    },
    ```

  - [ ] 11.4 **Keep canonical route at top-level.** Lines 97–100 stay as-is:
    ```tsx
    {
        path: '/student-test-results/:sessionCode',
        element: asStudentPage(<StudentTestResultsPage />, 'results'),
    },
    ```
    This route will be wrapped in `<StudentLayout>` inside the page component itself during Phase 5 (using `shellData` or `<ConnectedStudentRightRail>`).

  - [ ] 11.5 **Verify route contract:**
    - Navigate to `/student-test-results/abc123` — must load.
    - Navigate to `/student/results/abc123` — must load.
    - Refresh both URLs — must still work.

  - [ ] 11.6 **Verify registries.** Check `routes.ts`, `routeSecurity.ts`, `featureRegistry.ts` for both `STUDENT_TEST_RESULTS` and the legacy path.

  - [ ] 11.7 **Update test file.** Open `src/pages/StudentTestResultsPage.test.tsx`. Verify legacy `/student/results/:sessionCode` compatibility test cases still pass.

  - [ ] 11.8 Run `npm run build` and `npx vitest run src/pages/StudentTestResultsPage.test.tsx`. Commit: `refactor(routes): move test results legacy path under shell [PRD-0044 Phase 4]`.

---

### ✅ Phase 4 Verification Checklist

Before proceeding to Phase 5, verify ALL of the following:

1. `/student/homework/:homeworkId` loads correctly via direct URL, refresh, and in-app navigation.
2. `/student/homework/:homeworkId/test` loads correctly.
3. `/student-test-results/:sessionCode` loads correctly.
4. `/student/results/:sessionCode` loads correctly.
5. All route registries are synchronized (`routes.ts`, `routeSecurity.ts`, `featureRegistry.ts`).
6. All test files pass.
7. `npm run build` passes clean.

---

### Phase 5: Tier 1 — Full Rewrites (Highest Risk)

> ⚠️ **Phase 5A and 5B should be done by one developer each.** Do NOT split a single page between developers. Work incrementally: desktop migration first, then mobile overrides.

- [ ] **12.0 `StudentHomeworkDetailPage.tsx` — Remove Mantine `AppShell` wrapper (Desktop First)**

  > **Goal:** Replace the Mantine `AppShell` with `StudentLayout`, preserving all desktop behavior exactly.

  - [ ] 12.1 **Read the entire current file first.** Open `src/pages/StudentHomeworkDetailPage.tsx` (871 lines). Read and understand the full structure before making changes. Note all Mantine component usages and their desktop rendering.

  - [ ] 12.2 **Replace `AppShell` with `StudentLayout`.** The current return JSX starts with `<AppShell header={{ height: 70 }} ...>`. Replace this outer wrapper with:
    ```tsx
    <StudentLayout
        sidebar={<StudentSidebar />}
        mobileTitle="Homework Details"
    >
    ```
    Add the necessary imports:
    ```tsx
    import { StudentLayout } from '../components/layout/StudentLayout';
    import { StudentSidebar } from '../components/layout/StudentSidebar';
    import { S, studentTokens, mobileStyles } from '../components/layout/studentLayoutStyles';
    ```
    Remove the matching `</AppShell>` closing tag and replace with `</StudentLayout>`.

  - [ ] 12.3 **Remove `linear-gradient` background (FR-013).** Find `background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'` and remove it entirely. The `StudentLayout` already provides `studentTokens.bgPage` (`#f8f9fa`) as the page background.

  - [ ] 12.4 **Remove the AppShell header.** The AppShell has a custom `header` element with the purple gradient. Delete the entire header section. `StudentLayout` provides its own mobile header.

  - [ ] 12.5 **STOP and verify desktop.** Build the project (`npm run build`). Open the page at 1440px desktop width. Confirm the homework detail content is rendered correctly inside the new shell layout. The sidebar should be visible. The content should be in the feed area. Fix any layout issues before proceeding.

---

- [ ] **13.0 `StudentHomeworkDetailPage.tsx` — Replace Mantine component imports (One at a Time)**

  > **Goal:** Remove all 13 `@mantine/core` imports and 14 `@tabler/icons-react` imports, replacing with native HTML/CSS. Per FR-011 and FR-012.

  - [ ] 13.1 **CRITICAL: Work one import at a time.** Remove ONE import from the Mantine import block (lines 31–46), replace ALL usages of that component in the file, then run `npm run build` to confirm zero errors. Only then proceed to the next import.

  - [ ] 13.2 **Replacement mapping** (follow this order exactly):
    | Mantine Component | Replace With | Token/Style |
    |---|---|---|
    | `Center` | `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>` | — |
    | `Loader` | CSS spinner (same pattern as task 9.3) | `studentTokens.accent` for border-top |
    | `Group` | `<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>` | Adjust gap as needed |
    | `Stack` | `<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>` | Adjust gap as needed |
    | `Text` | `<p>` or `<span>` with inline style | Use `studentTokens.textPrimary` / `.textBody` / `.textMuted` for colors |
    | `Badge` | `<span style={{ padding: '4px 10px', borderRadius: studentTokens.radiusPill, fontSize: '0.75rem', fontWeight: 700, background: studentTokens.accentSoft, color: studentTokens.accentHover }}>` | Match original badge colors |
    | `Divider` | `<hr style={{ border: 'none', borderTop: '1px solid ${studentTokens.borderWhisper}', margin: '16px 0' }} />` | — |
    | `Alert` | `<div style={{ padding: 16, borderRadius: studentTokens.radiusSoft, border: '1px solid ...', background: '...' }}>` | Match original alert colors |
    | `Grid` | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>` | Will be made responsive later |
    | `Timeline` | Native CSS vertical timeline: parent `<div>` with children, each child has `borderLeft: '2px solid ${studentTokens.borderSoft}'`, `paddingLeft: 20`, and a `::before` dot (or an inline dot element) | — |
    | `Modal` | Custom modal: `<div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>` with backdrop + content div. Add `onClick` on backdrop for close. | Use same pattern as Courses unenroll modal |
    | `List` | Native `<ul>` / `<ol>` with `padding-left: 20px` | — |
    | `ThemeIcon` | `<span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: studentTokens.accentSoft, color: studentTokens.accent }}>` + inline SVG inside | — |

  - [ ] 13.3 **Replace Tabler icons (FR-012).** For each `@tabler/icons-react` icon (listed on lines 47–65), create an inline SVG component using the same pattern as `StudentLibraryPage.tsx` lines 15–20. Example:
    ```tsx
    const SvgArrowLeft = () => (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
        </svg>
    );
    ```
    Place all SVG components near the top of the file (after imports, before the main component). You can find the SVG path data for each icon at https://tabler.io/icons or by inspecting the rendered HTML.

  - [ ] 13.4 **Delete the entire `@mantine/core` import block** (lines 31–46) after ALL replacements are done.
  - [ ] 13.5 **Delete the entire `@tabler/icons-react` import block** (lines 47–65) after ALL replacements are done.

  - [ ] 13.6 **Replace `useNavigate` with `useNavigation` (EC-10).** Line 30 imports `useNavigate`. Replace with `useNavigation` (which is already imported on line 68). Remove the `useNavigate` import from line 30.

  - [ ] 13.7 Run `npm run build`. Verify zero Mantine imports remain in this file.

  - [ ] 13.8 Commit: `refactor(homework-detail): remove all Mantine imports [PRD-0044 Phase 5A]`.

---

- [ ] **14.0 `StudentHomeworkDetailPage.tsx` — Add mobile responsive overrides**

  > **Goal:** Apply mobile-specific layout (FR-015 through FR-017) now that Mantine is removed and `StudentLayout` is in place.

  - [ ] 14.1 **Add `useMediaQuery` and `isMobile`:**
    ```tsx
    import { useMediaQuery } from '../hooks/useMediaQuery';
    // ...
    const isMobile = useMediaQuery('(max-width: 768px)');
    ```

  - [ ] 14.2 **Homework info card stacking (FR-015).** Find the main homework info card. On mobile, stack its elements vertically:
    - Title: full width
    - Badges row: `flexWrap: 'wrap'`, gap: 8
    - Instructions: `fontSize: '0.938rem'`, `lineHeight: 1.6`
    - CTA button: `...(isMobile ? mobileStyles.fullWidthButton : {})`

  - [ ] 14.3 **Submission timeline single-column (FR-016).** The Timeline (now a native CSS timeline from task 13.2) should already be single-column. Verify it renders correctly on mobile at 375px.

  - [ ] 14.4 **Start-attempt modal mobile (FR-017).** The modal (now a custom div from task 13.2) on mobile should:
    ```tsx
    ...(isMobile ? {
        position: 'fixed',
        inset: 0,
        borderRadius: 0,
        maxHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
    } : {})
    ```
    Content area: `flex: 1`, `overflowY: 'auto'`, `WebkitOverflowScrolling: 'touch'`
    Bottom buttons: `position: 'sticky'`, `bottom: 0`, both buttons `minHeight: 44`.

  - [ ] 14.5 **Back button styling (FR-014).** The "Back" button should use `studentTokens` styling, not Mantine Button. On mobile, ensure it has `minHeight: 44`.

  - [ ] 14.6 **Verify:** Test at 375px — info card stacks vertically, buttons are full-width, modal fills viewport. Test at 1440px — desktop unchanged from after task 12/13.

  - [ ] 14.7 Run `npm run build`. Run tests: `npx vitest run src/pages/StudentHomeworkDetailPage.test.tsx`. Commit: `feat(homework-detail): add mobile responsive overrides [PRD-0044 Phase 5A]`.

---

- [ ] **15.0 `StudentTestResultsPage.tsx` — Mantine removal + `StudentLayout` wrap**

  > **Goal:** Replace Mantine `Center`/`Loader` (FR-021), replace `useNavigate` (FR-022), wrap in `StudentLayout` (FR-020).

  - [ ] 15.1 **Read the entire file first.** At 1147 lines, this is the largest page in scope. Understand the structure: score summary, question-by-question review, writing results (lazy-loaded), IELTS band display.

  - [ ] 15.2 **Wrap in `StudentLayout` (FR-020).** The page currently has no layout wrapper. Wrap the return JSX:
    ```tsx
    import { StudentLayout } from '../components/layout/StudentLayout';
    import { StudentSidebar } from '../components/layout/StudentSidebar';
    // ...
    return (
        <StudentLayout
            sidebar={<StudentSidebar />}
            mobileTitle="Test Results"
        >
            {/* existing page content */}
        </StudentLayout>
    );
    ```
    **Note:** Since the canonical route `/student-test-results/:sessionCode` is still outside the shell (from Phase 4 task 11.4), the `StudentLayout` here will use `<ConnectedStudentRightRail>` which self-provides its data. This works without `shellData`.

  - [ ] 15.3 **Remove Mantine `Center`/`Loader` (FR-021).** Line 20: `import { Center, Loader } from '@mantine/core';`. Delete this import. Replace all `<Center>` usages with flex-center divs. Replace all `<Loader />` with native CSS spinners (same as task 9.3).

  - [ ] 15.4 **Replace `useNavigate` with `useNavigation` (FR-022).** Line 15 imports `useNavigate`. Remove it. The file already imports `buildRoute` (line 19). Add:
    ```tsx
    import { useNavigation } from '../hooks/useNavigation';
    ```
    Replace `const navigate = useNavigate()` with `const { navigateTo } = useNavigation()`. Update all `navigate(...)` calls.

  - [ ] 15.5 **STOP and verify desktop.** `npm run build`. Open page at 1440px. Confirm all content renders: score, questions, feedback, certificates. Fix issues before proceeding.

  - [ ] 15.6 Commit: `refactor(test-results): remove Mantine + wrap in StudentLayout [PRD-0044 Phase 5B]`.

---

- [ ] **16.0 `StudentTestResultsPage.tsx` — Mobile responsive overrides**

  > **Goal:** Apply mobile-specific layout (FR-023 through FR-027).

  - [ ] 16.1 **Add `isMobile`:**
    ```tsx
    import { useMediaQuery } from '../hooks/useMediaQuery';
    import { mobileStyles } from '../components/layout/studentLayoutStyles';
    // ...
    const isMobile = useMediaQuery('(max-width: 768px)');
    ```

  - [ ] 16.2 **Score summary card (FR-023).** On mobile, stack vertically:
    ```tsx
    ...(isMobile ? {
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
    } : {})
    ```
    Score circle: `maxWidth: isMobile ? 120 : /* existing */`

  - [ ] 16.3 **Question review cards (FR-024).** Each question card on mobile:
    - Full-width: `width: '100%'`
    - Answer comparison stacked (not side-by-side): `flexDirection: isMobile ? 'column' : 'row'`
    - Expand/collapse toggle: `...(isMobile ? mobileStyles.touchTarget : {})`

  - [ ] 16.4 **Full-width buttons (FR-025).** "Download Certificate" and "Back to Dashboard" buttons:
    ```tsx
    ...(isMobile ? mobileStyles.fullWidthButton : {})
    ```

  - [ ] 16.5 **Writing result width (FR-026).** The `WritingResultView` is lazy-loaded via `<Suspense>`. Pass width context if needed. If `WritingResultView` handles its own responsive layout, no change needed. Verify at 375px that writing results don't overflow.

  - [ ] 16.6 **Course average stacking (FR-027).** If there's a score-vs-average comparison layout, on mobile:
    ```tsx
    flexDirection: isMobile ? 'column' : 'row'
    ```

  - [ ] 16.7 **Verify:** Test at 375px — score card stacked vertically, question cards full-width, buttons full-width, no horizontal overflow. Test at 1440px — desktop unchanged.

  - [ ] 16.8 Run `npm run build`. Run tests: `npx vitest run src/pages/StudentTestResultsPage.test.tsx`. Commit: `feat(test-results): add mobile responsive overrides [PRD-0044 Phase 5B]`.

---

## Final Verification (After All Phases)

After completing all 16 parent tasks:

1. **Full build:** `npm run build` — zero errors.
2. **Pre-commit hook:** Stage all files, attempt commit — hook must not flag any new `@mantine/*` imports.
3. **Manual visual regression at 1440px desktop:** Visit all 7 pages. Every page must look IDENTICAL to before this PRD's work started.
4. **Manual visual testing at 375px (iPhone SE):** Visit all 7 pages:
   - [ ] Dashboard: feed padded at 12px, title reduced to `1.5rem`, subtitle hidden, filter tabs scrollable with hidden scrollbar, notification cards use tighter side padding, Join a Class modal scrolls, no horizontal overflow.
   - [ ] Courses: title reduced to `1.5rem`, subtitle hidden, filter tabs scrollable and touch-friendly, cards single-column, long course text truncates, unenroll modal opens as a bottom sheet, empty-state button full-width.
   - [ ] Library: title reduced to `1.5rem`, subtitle hidden, top tabs scrollable and touch-friendly, dropdown filters stack full-width, search full-width, pagination centered with touch-friendly buttons, `SoloResumeModal` centered and scrollable.
   - [ ] Academic Record: title reduced to `1.5rem`, subtitle hidden, tabs and date range stack cleanly, result cards full-width, THCS content single-column, AI banner readable.
   - [ ] Homework List: title reduced to `1.5rem`, subtitle hidden, cards padded `12px 12px 16px`, buttons full-width, badges wrap, no Mantine Loader.
   - [ ] Homework Detail: `StudentLayout` shell, no gradient, stacked info card, full-viewport modal.
   - [ ] Test Results: `StudentLayout` shell, stacked score card, full-width buttons.
5. **Mobile right-rail verification:**
   - [ ] Open the right rail at 375px and 320px.
   - [ ] Drawer does not overflow the viewport.
   - [ ] `PendingReviewsWidget` remains readable, scrollable, and tappable.
6. **Route contract testing:**
   - [ ] Directly load `/student/homework/any-id` — works.
   - [ ] Directly load `/student-test-results/any-code` — works.
   - [ ] Directly load `/student/results/any-code` — works (legacy path).
   - [ ] Refresh each URL — still works.
7. **Touch target testing:** On a real mobile device (or DevTools touch simulation), tap every button and link. Each must be easily tappable (≥44px target).