---
title: Student Experience Architecture
createdAt: '2026-02-27T16:18:36.604Z'
updatedAt: '2026-02-27T16:18:44.236Z'
description: >-
  Student-facing system overview: 20 pages, design standard, adaptive layout, UX
  patterns, color/typography system.
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

All student pages follow @doc/design/student-view-design-standard:

### Layout: 3-Column Social Feed
```
Desktop (≥1025px):
┌──────────┬──────────────────────────┬───────────────────┐
│  LEFT    │      CENTER FEED         │   RIGHT PANEL     │
│  256px   │      max-width: 600px    │   320px           │
│  sticky  │      border-left/right   │   sticky          │
│  nav     │      content scrolls     │   widgets         │
└──────────┴──────────────────────────┴───────────────────┘

Tablet (769-1024px): Feed only, sidebars hidden
Mobile (≤768px): Feed + off-canvas sidebars
```

### Color System
- **Backgrounds:** Light gray (`#f3f4f6`) page, white (`#ffffff`) cards
- **Text:** Dark (`#111827`) headings, gray body/muted
- **Accent:** Indigo (`#4f46e5`) for primary actions
- **NO gradients, NO glassmorphism, NO purple**
- CSS override layer: `student-view-override.css` auto-neutralizes legacy patterns

### Enforcement Mechanism
1. Root class: `className="student-view-root"` activates CSS overrides
2. Legacy files have deprecation banners at top
3. CSS custom properties: `--sv-bg-page`, `--sv-accent`, `--sv-text-primary`, etc.
4. Reference implementation: `StudentDashboardPage.jsx`

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
