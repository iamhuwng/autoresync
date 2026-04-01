---
title: Student View Design Standard
description: Design standards and patterns for all student-facing pages and views
createdAt: '2026-02-27T15:25:53.999Z'
updatedAt: '2026-04-01T21:36:36.576Z'
tags:
  - design
  - student
  - standards
  - ui
---

# Student View Design Standard v2.0
## Editorial Academic Workspace For Student-Facing Pages

**Established:** 2026-03-31
**Status:** ACTIVE - Mandatory for all student views
**Supersedes:** Student View Design Standard v1.0 social-feed language and any previous gradient, glass, or AppShell patterns
**CSS Enforcement:** `src/styles/student-view-override.css` (imported globally in `index.css`)
**Root Class:** All student page wrappers MUST use `className="student-view-root"`

---

## 1. Design Philosophy

The student interface follows a calm editorial academic workspace model derived from the approved Academic Record direction, with Dashboard using the approved Stitch dashboard export as its feed-specific companion anchor.

It prioritizes:
- Composure - the UI should feel analytical, intentional, and quiet
- Structural clarity - the 3-part student shell remains intact, but it should read as one composed workspace rather than three boxed columns
- Content hierarchy - page title, section labels, metrics, lists, and actions should carry the visual hierarchy, not decorative containers
- Consistency - Dashboard, Homework, Courses, Library, Academic Record, Course Detail, Class Detail, and Profile must look like members of the same family

This standard is not a social-media clone. It does not use Twitter/X metaphors as the primary design model anymore.

---

## 2. Non-Negotiable Preservation Rules

These remain mandatory even under the overhaul:
- Preserve the shared student shell architecture: left navigation, center work area, right contextual rail
- Preserve mobile drawer behavior and mutual exclusion between left/right drawers
- Preserve page information architecture and interaction contracts from the real app
- Preserve the right rail as part of the shell; it is not optional for shell pages
- Preserve the real app information architecture even when following Stitch visual anchors
- Preserve the ban on `AppShell`, glassmorphism, gradients, decorative hover-lift, and emoji navigation
- Preserve Inter as the UI typeface
- Preserve student-safe flat HTML/CSS patterns over new Mantine additions

---

## 3. Core Visual Language

### Mood
- Editorial
- Academic
- Quiet
- Analytical
- Restrained

### What It Must Feel Like
- A digital academic workspace
- Soft tonal layers instead of hard card stacks
- Clear hierarchy through spacing and typography
- Calm surfaces with minimal visual noise

### What It Must Not Feel Like
- Social feed clone
- KPI dashboard
- Retail/storefront UI
- Learning app toy aesthetic
- Gradient/glass marketing surface

---

## 4. Color System

### Background & Surfaces
| Token | Value | Usage |
|---|---|---|
| `bg-page` | `#f8f9fa` | global page background |
| `bg-shell` | `#f1f4f6` | tonal shell regions, nav, subdued rail zones |
| `bg-surface` | `#ffffff` | primary content panels and focus surfaces |
| `bg-surface-muted` | `#eaeff1` | nested quiet surfaces |
| `bg-surface-strong` | `#e3e9ec` | subtle emphasis blocks |

### Text
| Token | Value | Usage |
|---|---|---|
| `text-primary` | `#2b3437` | titles, primary numbers, strong labels |
| `text-secondary` | `#586064` | body text, descriptions, metadata |
| `text-muted` | `#737c7f` | lighter metadata |
| `text-dim` | `#9b9d9e` | passive tertiary text |

### Accent
| Token | Value | Usage |
|---|---|---|
| `accent-primary` | `#4d44e3` | active tabs, primary actions, focused highlights |
| `accent-soft` | `#e2dfff` | restrained accent container use |
| `accent-ink` | `#3f34d6` | darker accent text or emphasis |

### Outline
| Token | Value | Usage |
|---|---|---|
| `outline-soft` | `#abb3b7` | subtle separators and ghost borders |
| `outline-strong` | `#737c7f` | rare stronger boundary needs |

### Hard Rules
- `#4d44e3` is the only strong accent for student shell pages
- Use accent sparingly
- Prefer tonal separation over visible borders
- Do not introduce page-specific primary colors

### Banned Colors & Effects
- No `#667eea`
- No `#764ba2`
- No gradient backgrounds
- No glassmorphism or translucent cards as a visual language
- No candy-color palettes or bright SaaS semantic colors unless muted to this system

---

## 5. Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Hierarchy
| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | `1.875rem` to `2.25rem` | 700-800 | tight, editorial |
| Section title | `1rem` to `1.125rem` | 600-700 | compact and clear |
| Metric value | `1.75rem` to `2.7rem` | 300-800 | high-contrast, sparse use |
| Body | `0.875rem` to `0.938rem` | 400-500 | calm readable density |
| Metadata | `0.75rem` to `0.8125rem` | 500-600 | subdued |
| Micro-label | `0.625rem` to `0.75rem` | 700 | uppercase with letter spacing |

### Rules
- Inter only by default
- Use uppercase micro-labels for sidebar labels, tabs, metrics, metadata labels, and small headings
- Favor strong title hierarchy over oversized button styling
- Avoid friendly-app typography tricks or playful oversized labels

---

## 6. Shell Architecture

### Desktop
The 3-part structure is preserved:
- Left navigation rail
- Center work canvas
- Right contextual rail

But the shell must be rendered as one composed workspace.

#### Rules
- Do not visually isolate the 3 regions as hard boxed columns
- Use tonal background shifts, spacing, and quiet separators instead of repeated panel borders
- The center region is the primary editorial canvas
- The right rail is quieter and secondary but always structurally present on shell pages

### Width Strategy
The old rigid `max-width: 600px` center rule is replaced with page-class widths:
- Feed-heavy pages may stay narrower
- Data/list/detail pages may open wider
- The shell composition must remain visually balanced

### Mobile / Tablet
- Keep current mobile header + off-canvas drawer behavior
- Left and right drawers remain mutually exclusive
- The mobile shell should inherit the same tonal language, not revert to older student-feed styling

---

## 7. Shared Component Rules

### Navigation
- Navigation should feel integrated into the shell, not like a stack of pills
- Sidebar labels should be smaller uppercase editorial labels, not large product-nav copy
- Active state should be calm and precise: a tonal highlight plus a thin accent-edge cue, not a heavy pill treatment
- `Join Class` is a utility action, not a dominant dashboard CTA block
- Preserve the real route set and sidebar IA; do not literal-copy placeholder Stitch nav labels
- No emoji icons
- Use SVG icons only

### Headers
- Sticky page headers are still allowed, but should feel lighter and more editorial
- Prefer soft bottom separators or tonal contrast over heavy header boxes
- Dashboard utility controls should stay visually light: search, unread filter, and academic-history action live in the masthead without turning it into a toolbar

### Tabs
- Tabs should be slim and editorial
- Active state should use a thin accent underline or restrained tonal emphasis
- Do not use heavy segmented-control styling unless the page specifically needs it

### Panels & Cards
- Panels are near-flat and quiet
- Prefer white or tonal surface blocks with little or no shadow
- Repeated framed cards should be avoided when a tonal grouping can do the job
- No double-framed widgets

### Buttons
- Buttons are compact and restrained
- Favor small rectangular-soft radii instead of fully pill-shaped controls as the default
- Primary buttons use `#4d44e3`
- Outline and tonal buttons should stay quiet

### Lists & Tables
- Use soft separators and whitespace instead of loud borders
- Rows should read cleanly and support quick scanning
- High-density tables may use very faint lines only
- Dashboard timeline rows must use concise metadata-derived copy rather than raw notification-body dumps
- Homework timeline metadata should read as quiet microtext, not stacked chip rows
- Test/result rows should stay sparse and spacious, with score-led hierarchy and restrained actions

### Metrics
- Large metric numerals are encouraged for summary strips and record views
- Pair metrics with uppercase micro-labels and quiet metadata
- Dashboard summary values should read as a frameless strip above tabs, not boxed KPI widgets

### Right Rail
- Right rails should read as quiet contextual composition, not a stack of reusable widgets
- All variants (dashboard, default, academic-record) must use the unified v2 editorial tokens — no variant may use legacy styling
- Section headers: 10px / 800wt / uppercase / `#2b3437` / 0.12em letter-spacing
- Two item patterns exist:
  - **Dot-list** (Up Next, Pending Reviews, Upcoming Deadlines): 6px dot + truncated title + right-aligned time label inside a flat white card
  - **Thumbnail-list** (Live Now, My Classes): 36×36 gradient thumbnail (grayscale filter, color on hover) + name + meta line
- `Live Now` only renders when active sessions exist; otherwise the section is hidden entirely
- CTA buttons use the flat `#dce4e8` button style with `#cdd6da` hover
- Empty states use 11px / `#737c7f` text
- No shadows, no bordered cards around individual items, no pill rows, no date-badge squares

---
## 8. Page Family Rules

### Dashboard
- The dashboard is an editorial academic activity workspace, not a social feed clone or KPI dashboard
- Use the approved Stitch dashboard export in `.stitch/designs/student-overhaul-from-academic-record-20260331/dashboard.html` as the feed companion anchor to Academic Record
- The center column should follow this sequence:
  `masthead with light utilities/search -> frameless metric strip -> slim editorial tabs -> timeline feed`
- The metric strip sits above the tab row
- Activity items should read as timeline/editorial rows with a left node rail, quiet metadata, strong titles, and restrained inline actions
- Tests should be score-led timeline rows
- Homework rows should use one quiet inset excerpt or meta surface
- Class updates should stay mostly textual with one restrained action
- Avoid nested CTA cards, stacked widget boxes, and boxed three-column emphasis; keep the shell soft and composed

### Homework
- List-first workboard
- Summary strip + tabs + vertical assignment list
- Homework snapshot can live in the right rail supplement

### Courses
- Grid/list states are allowed
- Cards must remain restrained and academic, not marketplace-like

### Library
- Resource browsing page, not a storefront
- Search/filter host should be quiet and editorial

### Academic Record
- This page is the primary visual anchor for the system
- Use it as the reference for tonal layering, metric treatment, and section hierarchy

### Course Detail / Class Detail
- Detail-first vertical reading flow
- Summary first, modules/assignments second
- Avoid turning detail pages into analytics dashboards

### Profile
- Account workspace, not social profile
- Hero section should stay calm and administrative

---

## 9. Banned Patterns

- `AppShell`
- New `@mantine/*` imports
- Glass classes: `.glass*`
- Gradient backgrounds
- Decorative hover lift and floating cards
- Purple/lavender primary themes
- Emoji navigation icons
- Mantine `Tabs`
- Hard center-column left/right border framing as the default shell treatment
- Treating the right rail as optional on shell pages
- Reintroducing generic event-card renderers for dashboard feed rows
- Reintroducing dashboard widget stacks as separate boxed modules

---

## 10. Reference Sources

Primary Stitch anchors:
- `academic-record.html` in `.stitch/designs/student-overhaul-20260331/`
- `dashboard.html` in `.stitch/designs/student-overhaul-from-academic-record-20260331/`

What they govern:
- Academic Record is the primary tonal, spacing, and hierarchy anchor for the whole student system
- Dashboard is the feed-specific companion anchor for the editorial activity timeline, metric strip, lighter masthead utilities, and softer shell treatment

Implementation anchors:
- `src/components/layout/StudentLayout.tsx`
- `src/components/layout/StudentSidebar.tsx`
- `src/components/layout/StudentRightRail.tsx`
- `src/components/layout/studentLayoutStyles.ts`
- `src/pages/AcademicRecordPage.tsx`
- `src/pages/StudentDashboardPage.jsx`
- `src/components/dashboard/StudentDashboardFeedView.jsx`
- `src/components/dashboard/StudentDashboardRightRail.jsx`

---

## 11. Migration Checklist

Before considering a student page complete under v2.0:
- [ ] Uses the shared student shell with `student-view-root`
- [ ] Follows the editorial academic workspace model rather than the v1 social-feed model
- [ ] Uses the v2 token set (`#f8f9fa`, `#f1f4f6`, `#ffffff`, `#2b3437`, `#586064`, `#4d44e3`)
- [ ] Preserves page structure and interaction logic
- [ ] Preserves the right rail structurally on shell pages
- [ ] Uses softer shell treatment instead of boxed three-column framing
- [ ] Avoids gradients, glass, AppShell, emoji icons, and decorative hover lift
- [ ] Keeps tabs, buttons, metrics, and lists inside the same visual family as Academic Record
- [ ] Dashboard metric strip sits above tabs
- [ ] Dashboard masthead utilities remain light instead of becoming a heavy toolbar
- [ ] Dashboard right rail does not regress into a widget stack
- [ ] Dashboard feed rows read as editorial timeline rows rather than generic cards

---

## 12. CSS Override Layer

The override layer still exists to neutralize legacy student styling, but it must now enforce the v2 editorial token system.

Required CSS custom properties:
```css
--sv-bg-page: #f8f9fa;
--sv-bg-shell: #f1f4f6;
--sv-bg-surface: #ffffff;
--sv-bg-surface-muted: #eaeff1;
--sv-text-primary: #2b3437;
--sv-text-secondary: #586064;
--sv-text-muted: #737c7f;
--sv-accent: #4d44e3;
--sv-accent-soft: #e2dfff;
--sv-outline-soft: #abb3b7;
--sv-radius-soft: 8px;
--sv-radius-panel: 12px;
```

The override layer should neutralize legacy glass and gradient patterns and set the v2 shell colors automatically when `.student-view-root` is active.

## Vertical Alignment Contract (added 2026-04-01)

32px baseline rule: `S.feed` (24px) + `S.feedHeader` (8px) = 32px total. All student page titles must align with the sidebar brand and right rail headings. Verify all five shell pages after any layout padding change.


## Layout Integrity Rules (added 2026-04-01)

These rules were added following the Academic Record overflow audit (screenshots from 2026-04-01 showing summary cards clipping under the right rail and timeline grid rows misaligning in narrow containers).

### Rule 17 — Flat Row Standard
All list-based result views in student-facing surfaces must use `AcademicRecordFlatRow`. No new grid-based row components may be introduced for student table surfaces. This ensures uniform padding, typography, hover states, and responsive behavior.

**Canonical component:** `src/components/academicRecord/AcademicRecordResultRow.tsx` → `AcademicRecordFlatRow`

### Rule 18 — No Fixed Grid Columns
No `grid-template-columns` with fixed `repeat(N, 1fr)` or hardcoded pixel widths (e.g., `108px`, `96px`, `120px`) in student-facing table or card surfaces.

**Allowed patterns:**
- `repeat(auto-fit, minmax(160px, 1fr))` for card grids
- Flex layouts for row-based surfaces

**Banned patterns:**
- `gridTemplateColumns: 'repeat(4, 1fr)'`
- `gridTemplateColumns: 'minmax(0, 1.8fr) 108px 96px 120px 32px'`

### Rule 19 — Hover Consistency
All interactive rows must implement the `onMouseEnter`/`onMouseLeave` background-transition pattern from `AcademicRecordFlatRow`. No mixing of CSS `:hover` pseudo-classes with inline hover state management on the same surface.

### Files remediated in this audit
| File | Before | After |
|------|--------|-------|
| `ResultsBySkill.tsx` | `repeat(4, 1fr)` | `repeat(auto-fit, minmax(160px, 1fr))` |
| `ResultsByCourse.tsx` | `repeat(4, 1fr)` | `repeat(auto-fit, minmax(160px, 1fr))` |
| `ResultTimeline.tsx` | Grid-based `AcademicRecordResultRow` | Flex-based `AcademicRecordFlatRow` |
| `AcademicRecordResultRow.tsx` | Helpers unexported | Helpers exported for shared use |


## Changelog

### 2026-04-02: v2 Right Rail Unification
- Unified all three right-rail variants (dashboard, default, academic-record) to use the same v2 editorial token system
- Replaced legacy styling: date badges → dot-list, pill rows → time labels, bordered live-session cards → thumbnail rows, class-icon circles → gradient thumbnails
- Separated Live Sessions and My Classes into distinct sections (previously merged)
- Removed 175 lines of dead legacy CSS-in-JS (`localStyles`, `CLASS_COLORS`, `getLiveBadgeStyles`, `formatDueDateBadge`)
- Academic Advisor and Integrity Guide sections now use flat white cards with v2 typography
- Updated Section 7: Right Rail rules to codify the two item patterns (dot-list and thumbnail-list)

### 2026-04-02: Right Rail Item Conventions Added
- Added Section 7.5 "Right Rail Item Conventions" defining the unified pattern for all right-rail list modules
- Codifies: date badges (42×42 white, whisper border), lowercase pills with SVG icons, `rail-title-marquee` class, `S.widgetTitle` headers
- Bans: emoji squares, UPPERCASE pill labels, count badges in section headers, bordered cards around individual items
- Applied to: Up Next, Pending Reviews, and any future right-rail list modules
