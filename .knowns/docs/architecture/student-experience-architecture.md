---
title: Student Experience Architecture
description: 'Student-facing system overview: 20 pages, design standard, adaptive layout, UX patterns, color/typography system.'
createdAt: '2026-02-27T16:18:36.604Z'
updatedAt: '2026-03-31T20:45:00.700Z'
tags:
  - architecture
  - student
  - design
  - ux
  - core
---

# Student Experience Architecture

## Overview

The student experience spans dashboard, homework, courses, classes, library, results, academic record, practice, and profile surfaces.

The current student-facing system follows the editorial academic workspace model defined in @doc/design/student-view-design-standard, not the older social-feed paradigm.

Shared architectural intent:
- one composed student shell across shell-hosted pages
- a quieter right rail owned by the shell
- center-column layouts that favor hierarchy, spacing, and typographic rhythm over widget/card density
- dashboard and academic record sharing the same editorial center-canvas language, even though their data models differ
## Student Pages Map

```
┌─────────────────────────────────────────────────────────────┐
│                    STUDENT PAGES (20)                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Hub Pages:                                                  │
│  ├── StudentDashboardPage.jsx  ← CANONICAL reference         │
│  ├── StudentCoursesPage.tsx    ← Course enrollment            │
│  ├── StudentClassDetailPage.jsx ← Class detail + assignments │
│  └── StudentLibraryPage.tsx    ← Personal test library        │
│                                                              │
│  Test-Taking:                                                │
│  ├── StudentTestPage.tsx       ← IELTS test-taking           │
│  ├── StudentQuizPage.jsx       ← Legacy quiz (Kahoot-style)  │
│  ├── StudentWaitingRoomPage.jsx ← Pre-test lobby             │
│  └── TestPageRouter.tsx        ← Routes IELTS vs THCS        │
│                                                              │
│  Practice & Homework:                                        │
│  ├── StudentPracticePage.tsx   ← Solo practice hub           │
│  ├── StudentHomeworkListPage.tsx ← Homework assignments       │
│  └── StudentHomeworkDetailPage.tsx ← Single homework          │
│                                                              │
│  Results & Records:                                          │
│  ├── StudentTestResultsPage.tsx ← Post-test results          │
│  ├── StudentResultsPage.jsx   ← Results history              │
│  └── AcademicRecordPage (shared) ← Full academic record      │
│                                                              │
│  Other:                                                      │
│  ├── StudentFeedbackPage.jsx  ← Post-quiz feedback           │
│  └── CourseCatalogPage.tsx    ← Browse available courses      │
└─────────────────────────────────────────────────────────────┘
```

## Design Standard Summary

All student pages follow the shared student design system documented in @doc/design/student-view-design-standard.

### Layout: Shared Student Shell
```text
Desktop:
- fixed left rail
- editorial center canvas capped around 960px
- contextual right rail owned by the shell
- the shell should feel like one workspace, not three boxed columns

Tablet/mobile:
- feed-first layout with shell-owned off-canvas drawers
```

### Dashboard Feed Pattern
- sticky workspace masthead
- frameless metric strip using typographic columns
- slim editorial tab row
- timeline-style activity feed with left node rail, quiet metadata line, strong title, and one restrained content treatment per row

### Academic Record Pattern
- primary visual anchor for tonal layering, section hierarchy, and flatter data presentation
- dashboard and records intentionally share the same center-column visual family

### Enforcement Mechanism
- `student-view-root` activates the override layer
- `StudentLayout` owns the shell composition and drawer behavior
- `StudentRightRail` owns the shared right rail
- `StudentDashboardPage.jsx` and `AcademicRecordPage.tsx` are implementation anchors for the two primary center-column patterns
## Key Patterns

### Adaptive Layout (Quiz Views)
- `useAdaptiveLayout` hook: auto-adjusts font size + grid columns based on content
- 4 font scales: Normal → Medium → Small → Compact
- Grid: 1-3 columns based on text length and option count
- Mobile: Direct Event Handler Pattern (prevents touch double-fire)
- See @doc/sop/student-view-adaptive-layout

### Navigation
- Left sidebar with SVG icons (not emoji)
- Active state: bold + dark color
- Tab arrows (↗) for items that navigate away from current page
- Mobile: hamburger → off-canvas slide from left

### Feed Articles
- Feed pages now follow an editorial timeline model rather than social-feed cards
- Each activity row uses a left icon/node rail, a quiet uppercase meta line, a strong title, and one content treatment beneath it
- Test-result rows should favor score + insight composition instead of nested action panels
- Homework rows may use one restrained inset quote/detail treatment, not stacked helper cards
- Class/update rows should read as plain body copy with a small inline action when needed
- Hover remains a light background shift only
- Used for: notifications, assignments, live sessions, scores
### Empty States
- Center-aligned, large emoji (3.5rem), bold heading, muted subtitle
- Primary CTA button guiding to next action

## UX Improvements Applied
- Native `alert()`/`confirm()` → custom modals and notifications
- Pending work badges on tabs
- Smart onboarding (collapsible for returning users)
- Mobile grid min-width 280px (fits 320px screens)
- Accessibility: `aria-label`, `role="button"`, keyboard navigation
- See @doc/sop/student-ux-improvements

## Key Files
| File | Purpose | Status |
|------|---------|--------|
| `src/pages/StudentDashboardPage.jsx` | Canonical reference | ✅ Active |
| `src/styles/student-view-override.css` | CSS enforcement layer | ✅ Active |
| `src/hooks/useAdaptiveLayout.js` | Layout engine | ✅ Active |
| `src/components/StudentAnswerInput.jsx` | All question type inputs | ✅ Active |

## Related Docs
- @doc/design/student-view-design-standard — Full design spec
- @doc/sop/student-view-adaptive-layout — Adaptive layout implementation
- @doc/sop/student-ux-improvements — UX improvements (Feb 2026)
- @doc/sop/adaptive-layout-implementation — Original layout implementation
- @doc/prd/prd-student-dashboard — Dashboard PRD
- @doc/prd/prd-academic-record — Academic record PRD
- @doc/architecture/test-system-architecture — Test system (cross-ref)


## Student Shell Platform

The student shell is now a shared layout platform rather than a dashboard-only composition. `StudentLayout` owns the structural 3-column shell and the global right rail across dashboard, homework, records, courses, course detail, class detail, library, and profile.

Updated shell contract:
- desktop grid: `220px / minmax(0, 1fr) / 280px`
- shell max width: `1440px`
- center feed cap: `860px`
- desktop column gap: `24px`
- mobile/tablet: feed-first with shell-owned off-canvas left and right drawers

The right rail is also platform-owned. `StudentRightRail` always renders shell modules for live sessions, upcoming homework, and enrolled classes. Individual pages may append supplemental widgets through `rightPanel`, but they should not own the right-column structure.

See @doc/architecture/student-shell-right-rail-architecture for the detailed shell contract, data ownership model, and extension pattern.

## Related Docs
- @doc/design/student-view-design-standard — Full design spec
- @doc/architecture/student-shell-right-rail-architecture — Shared student shell and right-rail contract
- @doc/sop/student-view-adaptive-layout — Adaptive layout implementation
- @doc/sop/student-ux-improvements — UX improvements (Feb 2026)
- @doc/sop/adaptive-layout-implementation — Original layout implementation
- @doc/prd/prd-student-dashboard — Dashboard PRD
- @doc/prd/prd-academic-record — Academic record PRD
- @doc/architecture/test-system-architecture — Test system (cross-ref)


## Student Data-Loading Contract

Student-facing list, tab, and widget work follows the same ownership rules across the app.

Required rules:
- every student surface must declare its canonical data owner
- every student list surface must declare whether it consumes summary/read-model data or full detail
- shell-shared data must be owned once and reused across shell consumers
- tab hosts own base datasets; child panels remain selectors or presentational surfaces
- page mount and list load must not perform write-on-read repairs or backfills
- secondary student history or progress data must be bulk-fetched and joined in memory rather than fetched once per card

Required governance companions for future student data-loading work:
- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/academic-record/academic-record-page-architecture
- @doc/patterns/pattern-student-shell-single-data-owner
- @doc/patterns/pattern-summary-first-detail-on-demand
- @doc/patterns/pattern-bulk-enrichment-from-shared-student-history

## Student Class Membership Projection

Student-facing class list surfaces now have a canonical bounded membership read path.

Required contract:
- student class membership is read from `student_classes/{studentId}/{classId}`
- `getStudentClasses()` may use a legacy broad `classes` scan only as a temporary compatibility fallback for older rows that have not been projected yet
- enrollment, approval, removal, and class delete flows own projection maintenance
- student pages are consumers of that projection and must not mutate or backfill it on mount

## Self-Framed Widget Rule

Student pages must preserve a single framing owner per surface.

Required rule:
- if a child component already renders its own card, border, title row, or progress shell, the parent page must provide spacing only
- do not nest a self-framed widget inside another bordered section or duplicate its heading
- before shipping a student page, scan for repeated titles or repeated frames that make one module look double-boxed

This rule applies across profile, results, homework, academic record, and right-rail supplements.
