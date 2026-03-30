---
title: Student Experience Architecture
description: 'Student-facing system overview: 20 pages, design standard, adaptive layout, UX patterns, color/typography system.'
createdAt: '2026-02-27T16:18:36.604Z'
updatedAt: '2026-03-30T03:15:29.339Z'
tags:
  - architecture
  - student
  - design
  - ux
  - core
---

# Student Experience Architecture

## Overview

The student experience spans 20 pages covering dashboard, courses, classes, test-taking, practice, homework, results, and academic records. All student-facing pages follow the Student View Design Standard v1.0 — a Twitter/X-inspired social feed paradigm.

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
Desktop (≥1025px):
┌──────────┬──────────────────────────────┬───────────────┐
│  LEFT    │         CENTER FEED          │   RIGHT RAIL  │
│  220px   │ minmax(0, 1fr), max 860px    │    280px      │
│  sticky  │ shell-owned center column    │ shell-owned   │
│  nav     │ content scrolls              │ global modules│
└──────────┴──────────────────────────────┴───────────────┘

Shell max width: 1440px
Desktop gap: 24px
Tablet/mobile: feed-first with shell-owned off-canvas drawers
```

### Color System
- page background: `#f3f4f6`
- surfaces: `#ffffff`
- text: `#111827` headings and `#6b7280` metadata
- accent: `#4f46e5`
- banned: gradients, glassmorphism, purple-primary styling

### Enforcement Mechanism
1. Root class: `className="student-view-root"` activates CSS overrides.
2. `StudentLayout` owns the shell structure and responsive drawer behavior.
3. `StudentRightRail` owns shared right-rail modules for live sessions, homework, and class summaries.
4. `rightPanel` is supplemental-only and appends page-specific widgets under the shared shell-owned modules.
5. Reference implementation: `StudentLayout`, `StudentRightRail`, and `StudentDashboardPage.jsx`.
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
- Avatar (48×48, round, colored bg per type) + title + timestamp
- Body text + optional nested action card
- Hover: light background change
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
