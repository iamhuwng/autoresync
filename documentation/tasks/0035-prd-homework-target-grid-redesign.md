# PRD-0035: Homework Target Grid Redesign

**Author:** AI Assistant  
**Date:** 2026-03-13  
**Status:** Draft  
**Depends On:** PRD-0016 (Solo Study & Homework System), PRD-0034 (Teacher Homework Management Overhaul)

---

## 1. Introduction / Overview

The current `/teacher/homework` page displays homework assignments in a flat chronological list. While functional, this approach becomes unwieldy as teachers accumulate homework across multiple classes and individual students. Teachers primarily think in terms of **"who do I need to check on?"** rather than **"what homework did I create?"**

This PRD redesigns the page to be **target-centric**: the default view shows classes and individual students as grid cards, sorted by urgency. Teachers can drill into a class to see per-student progress, then click a student to see their homework in a modal. The existing advanced search/filter tools are relocated into the homework list modal, while the main page gets a clean, simple search bar.

### Problem Statement

- The flat homework list forces teachers to mentally map homework → class → student
- The current search bar exposes too many controls (sort, status filter, tag filter, bulk select, show closed/archived) at the top level — overwhelming for the primary use case
- There is no quick at-a-glance view of **per-class** or **per-student** progress without clicking into individual homework detail pages
- Teachers cannot quickly identify which classes or students need attention

### Solution

A three-level navigation model:
1. **Target Grid** (default) — Cards for each class and individual student, sorted by urgency
2. **Student Grid** (drill-down) — Cards for each student in a class, showing per-student homework stats
3. **Homework List Modal** — Full-featured modal showing all homework for the selected target/student

---

## 2. Goals

1. **Reduce cognitive load** by organizing homework around targets (classes, students) instead of individual assignments
2. **Surface urgency** — overdue and due-soon items appear first with visual indicators
3. **Enable quick drill-down** — two clicks to see any student's full homework status
4. **Simplify the main page** — move advanced search/filter controls into the modal context where they're needed
5. **Maintain full functionality** — all existing actions (edit, duplicate, delete, extend, reset, bulk operations) remain accessible within the modal
6. **Preserve alternative views** — Timeline and By Status tabs remain available for teachers who prefer them

---

## 3. User Stories

### US-1: At-a-Glance Class Overview
> As a teacher, I want to see all my classes as cards on the homework page so I can quickly identify which classes have overdue or upcoming assignments.

### US-2: Class Drill-Down to Students
> As a teacher, I want to click a class card and see all students in that class with their homework stats (completion rate, overdue count, average score) so I can identify struggling students without navigating away.

### US-3: Student Homework Modal
> As a teacher, I want to click a student card and see all their homework assignments in a modal so I can review, edit, or take action on their assignments in context.

### US-4: Individual Student Visibility
> As a teacher, I want to see students who have unique individual assignments (not via a class) as separate cards on the target grid so I don't lose track of personal one-on-one assignments.

### US-5: Urgency-First Sorting
> As a teacher, I want the most urgent targets (overdue homework, homework due within 48 hours) to appear first on the grid so I can prioritize my attention.

### US-6: Simple Search
> As a teacher, I want a simple search bar on the main page to quickly find a class or student by name, without being overwhelmed by advanced filter options.

### US-7: Advanced Search in Context
> As a teacher, I want advanced search/filter options (status, tags, sort, show closed/archived) available inside the homework modal when I need to dig deeper into a specific student's assignments.

### US-8: Alternative List Views
> As a teacher, I want to switch to Timeline or By Status views when I need a chronological or status-grouped perspective of all my homework.

---

## 4. Functional Requirements

### 4.1 Target Grid (Default View)

#### 4.1.1 Data Source & Grouping
- **FR-1**: The page MUST group all loaded homework by their `target` field to produce unique target cards.
- **FR-2**: For `target.type === 'class'`: One card per unique `target.classId`. The card label is `target.className`.
- **FR-3**: For `target.type === 'students'`: One card per unique `studentId` within `target.studentIds`. The card label is the student's name from `target.studentNames[index]` (or the `studentId` as fallback).
- **FR-4**: For `target.type === 'course'` and `target.type === 'group'`: These target types are **excluded** from the target grid in this version. Their homework is still accessible via Timeline/By Status tabs.
- **FR-5**: If a student appears in BOTH a class-based homework AND an individual (`students`-type) homework, the student appears in the class drill-down AND as a separate individual card on the main grid. This is intentional — they represent different assignment contexts.

#### 4.1.2 Target Card Content
Each target card MUST display:

| Field | Source | Description |
|-------|--------|-------------|
| **Target name** | `target.className` or student name | Bold title with SVG icon prefix, e.g., "[ClassIcon] Class 9A" or "[StudentIcon] Nguyen Van A" |
| **Active homework count** | Count of homework with `status === 'active'` for this target | e.g., "5 active" |
| **Overdue homework count** | Count of homework with `status === 'past_due'` for this target | Red badge, e.g., "2 overdue" |
| **Overall completion rate** | Average `stats.completionRate` across all non-closed homework for this target | Displayed as a progress bar with percentage |
| **Latest homework date** | `createdAt` of the most recently assigned homework for this target | e.g., "Latest: Mar 13" |
| **Total homework count** | Total count of all homework (all statuses) for this target | e.g., "12 total" |
| **Student count** (class cards only) | Count of `stats.totalAssigned` from the most recent homework, OR roster count if available | e.g., "32 students" |

#### 4.1.3 Target Card Visual Design
- **FR-6**: Cards MUST use glass-morphism style matching the existing app design system (`Card variant="glass"`).
- **FR-7**: Cards MUST be displayed in a **responsive grid layout**: 3 columns on desktop (≥1024px), 2 columns on tablet (≥768px), 1 column on mobile (<768px).
- **FR-8**: Class cards MUST show the `ClassIcon` SVG as a title prefix. Individual student cards MUST show the `StudentIcon` SVG. Overdue badges MUST use the `OverdueFlashIcon` SVG. All icons are defined in Section 6.6 — NO emoji characters are used in the production UI.
- **FR-9**: Cards with overdue homework MUST have a **glowing/pulsing red border animation** to draw attention.
- **FR-10**: Cards where ALL homework is completed (no active, no past_due, no scheduled) MUST be visually de-prioritized and sorted to the bottom of the grid.

#### 4.1.4 Urgency-First Sorting
- **FR-11**: Target cards MUST be sorted using this priority algorithm:
  1. **Tier 1 — Overdue**: Targets that have at least one `past_due` homework. Sorted by how many are overdue (most first). Among equal counts, sort by which has been overdue the longest.
  2. **Tier 2 — Due within 48 hours**: Targets that have at least one active homework with `dueDate` within 48 hours from now. Sorted by the most imminent deadline.
  3. **Tier 3 — Newly created**: Targets whose most recent homework was created within the last 48 hours. Sorted by `createdAt` descending.
  4. **Tier 4 — Other active**: Targets with active homework but no urgency. Sorted by nearest `dueDate`.
  5. **Tier 5 — All completed**: Targets where all homework is closed/completed. Sorted by most recent `closedAt` descending.
- **FR-12**: Users MUST be able to change the sort order via a sort dropdown (same options as current: due date, created date, completion rate, title).

### 4.2 Student Grid (Class Drill-Down)

#### 4.2.1 Navigation
- **FR-13**: Clicking a class target card MUST transition the main content area to show a **student grid** for that class.
- **FR-14**: The student grid view MUST display a **breadcrumb** at the top: "All Targets > Class 9A" where "All Targets" is clickable to return.
- **FR-15**: The student grid view MUST also display a **back arrow button** at the top-left for returning to the target grid.
- **FR-16**: The search bar MUST persist in the student grid view and filter by student name.

#### 4.2.2 Student Card Content
Each student card MUST display:

| Field | Source | Description |
|-------|--------|-------------|
| **Student name** | Class roster or submission `studentName` | Bold title |
| **Student avatar** | `avatarUrl` from profile (if available) | Circular avatar or initials fallback |
| **Homework assigned count** | Count of homework targeting this class | e.g., "8 assigned" |
| **Completed count / total** | Submissions with `status === 'submitted'` or `'graded'` vs total | e.g., "6/8 completed" |
| **Completion rate** | Percentage of completed homework | Displayed as mini progress ring |
| **Overdue count** | Homework that is `past_due` AND this student has NOT submitted | Red text, e.g., "2 overdue" |
| **Average score** | Average `percentage` across all submitted assignments | e.g., "Avg: 78%" |
| **Last submission date** | Most recent `submittedAt` from their submissions | e.g., "Last: Mar 12" |

#### 4.2.3 Student Card Visual Design
- **FR-17**: Student cards MUST use the same glass-morphism card style as target cards.
- **FR-18**: Student cards with overdue homework MUST have a **glowing/pulsing red border animation**.
- **FR-19**: Students who have completed ALL assigned homework MUST be sorted to the bottom of the grid.
- **FR-20**: Student cards follow the same responsive grid: 3 columns desktop, 2 tablet, 1 mobile.

#### 4.2.4 Data Loading Strategy (Lazy-Load Hybrid)
- **FR-21**: Student stats MUST NOT be pre-fetched on page load. They load only when a class card is clicked (drill-down).
- **FR-22**: When drilling into a class, the system MUST:
  1. Fetch the class roster via `useClassRoster(classId)` — 1 RTDB read (may be cached).
  2. For each homework assigned to this class (already loaded in memory), call `getHomeworkSubmissions(homeworkId)` — 1 Firestore query per homework.
  3. Compute per-student stats client-side by cross-referencing roster with submissions.
  4. Cache the computed stats in React state — subsequent views of the same class reuse cached data without re-fetching.
- **FR-23**: While loading, card placeholders MUST show a skeleton/shimmer animation with approximate card layout.
- **FR-24**: If a class has 0 homework (edge case — shouldn't happen since cards are generated from homework), show an empty state message.
- **FR-25**: No Cloud Functions or Blaze Plan features are used. All computation is client-side.

### 4.3 Homework List Modal

#### 4.3.1 Trigger & Context
- **FR-26**: Clicking a **student card** (from either the student grid drill-down or an individual student card on the target grid) MUST open a large centered modal showing that student's homework.
- **FR-27**: The modal MUST display a title showing the student's name and context: e.g., "Homework — Nguyen Van A (Class 9A)".
- **FR-28**: Clicking an **individual student card** on the target grid MUST open the same modal but with context "Homework — Nguyen Van A (Individual)".

#### 4.3.2 Modal Layout
- **FR-29**: The modal MUST be a **large centered modal** (~80% viewport width, max 960px, 80vh max height with scrollable content).
- **FR-30**: The modal MUST have a close button (X) in the top-right corner and be closable by clicking the overlay backdrop.
- **FR-31**: The modal MUST have a sticky header containing: student name, context label, and the basic search bar.

#### 4.3.3 Homework Display
- **FR-32**: Homework items MUST use the **existing `HomeworkCard` component redesigned to be more compact** with SVG icons instead of emoji (see Section 6.2 for design spec).
- **FR-33**: When opened from a class drill-down, the modal MUST show **all homework assigned to that student** across all classes/targets, but with homework from the drilled-into class **sorted first** (priority grouping).
- **FR-34**: Each homework card in the modal MUST support **all current actions** via a kebab menu (⋮): Edit, Duplicate, Delete/Archive, Extend Deadline, Reset Student, Restore, Permanent Delete.
- **FR-35**: Clicking a homework card (not the kebab menu) MUST **navigate to the detail page** (`/teacher/homework/:homeworkId`) and close the modal.
- **FR-36**: The modal MUST show the **20 most recent homework** initially, with a "Load More" button to fetch additional items (matching existing `useHomeworkList` pagination pattern with `pageSize: 20`).

#### 4.3.4 Search & Filter (Advanced Search)
- **FR-37**: The modal MUST have a **basic search input** at the top (within the sticky header) that filters homework by title. Instant filtering with 300ms debounce.
- **FR-38**: Below the search input, there MUST be an **"Advanced Search" button** that toggles an expandable panel (slides down with CSS transition).
- **FR-39**: When filters are active (any non-default filter applied), the "Advanced Search" button MUST be visually highlighted (e.g., accent color background or border) to indicate active filters.
- **FR-40**: The Advanced Search panel MUST contain ALL current filter controls relocated from the main page:
  - Status filter buttons (All, Active, Scheduled, Past Due, Draft, Closed)
  - Sort dropdown (Due date newest/oldest, Created date, Last updated, Completion rate, Title A-Z)
  - Tag filter chips (`HomeworkTagChips` component)
  - Show Closed toggle
  - Show Archived toggle
  - Bulk Select toggle (with bulk action bar when items are selected)

### 4.4 Main Page Search Bar

- **FR-41**: The main page MUST have a **single search input** inside the existing glass card filter area.
- **FR-42**: The search bar MUST use **instant filtering** with 300ms debounce (matching current behavior).
- **FR-43**: The search MUST filter across:
  - Target names (class names, student names)
  - Homework titles (filters the target cards to only show those whose homework matches)
- **FR-44**: The search bar placeholder MUST read: "Search classes, students, or homework..."
- **FR-45**: When the search bar has a value, a clear (✕) button MUST appear to reset it.

### 4.5 View Tabs

- **FR-46**: The page MUST support three view modes via tabs:
  1. **Targets** (DEFAULT) — The new target grid described in 4.1. Tab uses `TargetPinIcon` SVG.
  2. **Timeline** — The existing chronological homework list (current `viewMode === 'chronological'`). Tab uses `CalendarIcon` SVG.
  3. **By Status** — The existing status-grouped homework list (current `viewMode === 'by_status'`). Tab uses `BarChartIcon` SVG.
- **FR-47**: The **"By Class" tab MUST be removed** — it is fully replaced by the Targets view.
- **FR-48**: When switching between view tabs:
  - The search query MUST persist
  - The class drill-down state MUST reset (return to target grid level)
- **FR-49**: The Timeline and By Status views MUST retain their current behavior and rendering. They continue to use the full `HomeworkCard` components.

### 4.6 Summary Stats Bar

- **FR-50**: The existing `HomeworkSummaryStats` component with 5 large cards MUST be **replaced with a compact single-row stats bar**.
- **FR-51**: The stats bar MUST display in a **single horizontal row** with the following stats, separated by dividers:
  - Total homework count (with "visible" helper)
  - Active + Scheduled count
  - Past Due count (red accent if > 0)
  - Average Completion rate (%)
  - Needs Attention count
- **FR-52**: The stats bar MUST include the action buttons that were in the old `HomeworkSummaryStats`:
  - "Close All Past Due" button (secondary)
  - "Create Homework" button (primary, green gradient)
  - "Create THCS Homework" button (primary, purple gradient)
- **FR-53**: The stats bar MUST be visually compact — approximately 60px tall, with small font sizes (0.8rem for labels, 1.1rem for values).

### 4.7 Alert Banner Removal

- **FR-54**: The `HomeworkAlertBanner` component MUST be **removed** from the main homework list page. Urgency is now communicated through:
  - Card sorting (overdue targets first)
  - Glowing/pulsing red border animation on urgent cards
  - Red badge counts on target cards
- **FR-55**: The `HomeworkAlertBanner` component itself MUST NOT be deleted from the codebase — it is still used on the `TeacherHomeworkDetailPage`.

### 4.8 Empty States

- **FR-56**: If the teacher has **no homework at all**, the page MUST show a friendly empty state with:
  - `EmptyHomeworkIcon` SVG at 64-96px (see Section 6.6.7)
  - Heading: "No homework yet"
  - Description: "Create your first homework assignment to get started."
  - "Create Homework" CTA button
- **FR-57**: If a class drill-down shows **no students** (empty roster + no submissions), show: "No students found in this class."
- **FR-58**: If the homework modal shows **no homework for a student**, show: "No homework assigned to this student."

---

## 5. Non-Goals (Out of Scope)

1. **Course and group target types** are not included in the target grid for this version. They remain accessible via Timeline/By Status views.
2. **Cloud Functions** or Blaze Plan features are NOT used. All data loading and computation is client-side.
3. **Pre-computed per-student summary documents** in Firestore are not created. Stats are computed on-the-fly.
4. **Real-time subscription** for the student grid is not implemented — data is fetched on drill-down and cached. Manual refresh is available.
5. **Drag-and-drop reordering** of target cards is not supported.
6. **Inline homework detail** in the modal — clicking navigates to the detail page.
7. **Creating homework from the modal** — the "Create Homework" button remains on the main page stats bar only.

---

## 6. Design Considerations

### 6.1 Target Grid Card Design

```
┌─────────────────────────────────────┐
│ [ClassIcon] Class 9A  [OverdueFlash]│  ← Overdue badge (pulsing red)
│                                     │
│ 5 active · 2 overdue · 32 students  │  ← Meta line (with inline SVG icons)
│                                     │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░ 78%             │  ← Completion bar
│                                     │
│ [CalendarIcon] 12 total · Latest: Mar 13 │  ← Footer
└─────────────────────────────────────┘
```

- Glass-morphism card with frosted background
- Overdue cards: `box-shadow` glow animation in red (`@keyframes pulseGlow`)
- Completed cards: reduced opacity (0.7), sorted to bottom
- Hover: slight elevation increase + shadow deepening

### 6.2 Compact HomeworkCard Redesign (Modal)

The existing `HomeworkCard` component is redesigned for use inside the modal:

```
┌──┬─────────────────────────────────────────────────────────────┬───┐
│  │ [DocumentIcon] Reading Test 3   [Active]  [ClassIcon] 9A   │[⋮]│
│▌ │ [ClockIcon] Mar 15 · [ClockIcon] 30min · [RetryIcon] 2 att │   │
│  │ ▓▓▓▓▓▓▓▓▓▓░░░░ 18/24 submitted · [BarChartIcon] Avg: 82%  │   │
└──┴─────────────────────────────────────────────────────────────┴───┘
 ↑ Status-colored left border (teal=active, purple=scheduled, red=overdue)
```

Key changes from current `HomeworkCard`:
- **More compact**: ~80px height instead of ~160px
- **SVG icons** replace emoji (document icon, clock icon, retry icon)
- **Left border accent** colored by status (teal=active, purple=scheduled, red=past_due, gray=draft, dark=closed)
- **Single row layout** for metadata instead of grid
- **Kebab menu** (⋮) replaces individual action buttons
- **Inline progress bar** with submission count

### 6.3 Glowing Overdue Animation

```css
@keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 8px rgba(239, 68, 68, 0.3); }
    50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.5); }
}

.target-card--overdue {
    border: 1.5px solid rgba(239, 68, 68, 0.4);
    animation: pulseGlow 2s ease-in-out infinite;
}
```

### 6.4 Student Card Design

```
┌──────────────────────────────────────────┐
│ [Avatar/Initials]  Nguyen Van A          │
│                                          │
│ [CheckCircleIcon] 6/8    ╭──╮  Avg: 78% │
│ [OverdueFlashIcon] 2     │75│  Last: 3/12│
│                          ╰──╯            │
│                    (progress ring SVG)    │
└──────────────────────────────────────────┘
```

### 6.5 Compact Stats Bar Design

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Total: 24 (18 visible) │ Active: 12 │ Past Due: 3 │ Avg: 78% │ Attention: 5   │ [Close Past Due] [Create HW] [Create THCS]
└─────────────────────────────────────────────────────────────────────────────────┘
```

- Horizontal flexbox, wrapping on mobile
- Dividers between stat items
- Action buttons right-aligned

### 6.6 SVG Icon Registry

All icons MUST be inline SVG React components (NOT emoji) following the existing project pattern in `src/components/modern/icons.jsx`. Icons accept `size`, `style`, and `className` props. Stroke-based icons use `currentColor` for theming.

All new icons MUST be added to a single new file: `src/components/homework/HomeworkIcons.tsx`.

#### 6.6.1 Target Card Icons

| Icon Name | Usage | Design | viewBox |
|-----------|-------|--------|---------|
| `ClassIcon` | Class target card title prefix | Book stack — two stacked rectangles with slight offset, top one open like a book. Stroke-based, 2px stroke. | `0 0 24 24` |
| `StudentIcon` | Individual student card title prefix | Person silhouette (head circle + shoulders arc). Stroke-based, 2px stroke. Matches existing `IconProfile` style. | `0 0 24 24` |
| `OverdueFlashIcon` | Overdue badge on target cards (replaces ⚡) | Lightning bolt — angular zigzag path. Filled, uses `currentColor`. Used with `color: var(--color-error)`. | `0 0 24 24` |
| `CalendarIcon` | "Latest: Mar 13" footer on target cards | Calendar outline with a small dot for today. Stroke-based, 2px stroke. | `0 0 24 24` |
| `UsersIcon` | "32 students" display on class cards | Two overlapping person silhouettes. Stroke-based, 2px stroke. | `0 0 24 24` |
| `CheckCircleIcon` | Completed homework / all-done indicator | Circle with inner checkmark. Stroke-based, 2px stroke. Slightly larger checkmark for readability at small sizes. | `0 0 24 24` |
| `TargetPinIcon` | "Targets" view tab icon | Map pin / location marker — teardrop shape with a small circle inside. Stroke-based, 2px stroke. | `0 0 24 24` |

#### 6.6.2 Compact Homework Card Icons (Modal)

| Icon Name | Usage | Design | viewBox |
|-----------|-------|--------|---------|
| `DocumentIcon` | Homework title prefix in compact card | Page with folded corner and 3 horizontal lines representing text. Stroke-based, 2px stroke. | `0 0 24 24` |
| `ClockIcon` | Due date / time display (reuse existing) | ✅ Already exists in `icons.jsx` — import and re-export. Circle with hour/minute hands. | `0 0 24 24` |
| `RetryIcon` | Attempts count display (replaces 🔄) | Circular arrow (refresh) — 270° arc with arrowhead. Stroke-based, 2px stroke. | `0 0 24 24` |
| `BarChartIcon` | Average score display | Three vertical bars of ascending height. Stroke-based, 2px stroke. | `0 0 24 24` |
| `ProgressIcon` | Submission progress inline display | Horizontal bar with partial fill using `currentColor`. Has both filled and unfilled portions. | `0 0 24 24` |

#### 6.6.3 Kebab Menu Action Icons

| Icon Name | Usage | Design | viewBox |
|-----------|-------|--------|---------|
| `KebabMenuIcon` | Menu trigger button (⋮) | Three vertically stacked circles (r=1.5 each), centered, spaced 6px apart. Filled `currentColor`. | `0 0 24 24` |
| `EditIcon` | "Edit" action | ✅ Already exists in `icons.jsx` — pencil on paper. Import and re-export. | `0 0 24 24` |
| `DuplicateIcon` | "Duplicate" action | ✅ Use existing `CloneIcon` from `icons.jsx`. Two overlapping pages. Import and re-export as `DuplicateIcon`. | `0 0 24 24` |
| `DeleteIcon` | "Delete/Archive" action | ✅ Already exists in `icons.jsx` — trash can. Import and re-export. | `0 0 24 24` |
| `ExtendIcon` | "Extend Deadline" action | Clock with a forward arrow extending from it — clockface (small) with an arrow curving rightward from 3 o'clock position. Stroke-based. | `0 0 24 24` |
| `ResetIcon` | "Reset Student" action | Circular arrow (counter-clockwise) with a small "x" or clearing indicator in center. Stroke-based. | `0 0 24 24` |
| `RestoreIcon` | "Restore" (from archive) action | Upward curved arrow emerging from a box/container. Stroke-based. | `0 0 24 24` |
| `PermanentDeleteIcon` | "Permanent Delete" action | Trash can with an "X" overlaid — combines DeleteIcon base with two crossing diagonal lines. Stroke-based, uses `color: var(--color-error)`. | `0 0 24 24` |
| `CloseAllIcon` | "Close All Past Due" action in stats bar | Square with diagonal line through it (stop/close). Stroke-based. | `0 0 24 24` |

#### 6.6.4 Search & Filter Icons

| Icon Name | Usage | Design | viewBox |
|-----------|-------|--------|---------|
| `SearchIcon` | Search input prefix icon | ✅ Already exists in `StudentIcons.tsx` as `IconSearch`. Import and re-export with configurable size. | `0 0 24 24` |
| `ClearIcon` | Search input clear (✕) button | Simple "X" — two diagonal crossing lines. Stroke-based, 2px stroke. Used at 12-16px size. | `0 0 24 24` |
| `FilterIcon` | "Advanced Search" button icon | Funnel/filter shape — wide top narrowing to a point at bottom. Three horizontal lines of decreasing width. Stroke-based. | `0 0 24 24` |
| `FilterActiveIcon` | "Advanced Search" button when filters active | Same funnel as `FilterIcon` but with a filled small circle (dot) at top-right corner indicating active state. Stroke + fill combo. | `0 0 24 24` |
| `SortIcon` | Sort dropdown trigger icon | Three horizontal lines of decreasing width stacked vertically (ascending sort visual). Stroke-based. | `0 0 24 24` |

#### 6.6.5 Navigation & UI Icons

| Icon Name | Usage | Design | viewBox |
|-----------|-------|--------|---------|
| `BackArrowIcon` | Back button in class drill-down | Left-pointing arrow — chevron left or full arrow with shaft. Stroke-based, 2px stroke. | `0 0 24 24` |
| `ChevronRightIcon` | Breadcrumb separator "All Targets > Class" | Small right-pointing chevron (>). Stroke-based, 2px stroke. Used at 12-16px. | `0 0 24 24` |
| `LoadMoreIcon` | "Load More" button icon | Downward chevron (∨) or three dots in horizontal line. Stroke-based. | `0 0 24 24` |
| `RefreshIcon` | Refresh button for student grid data | Circular arrow (same as RetryIcon but slightly different: full 360° with arrowhead). Stroke-based. | `0 0 24 24` |
| `ExternalLinkIcon` | Indicator on homework cards that clicking navigates away | Small square with arrow pointing to top-right corner. Stroke-based, 1.5px stroke. Used at 10-12px. | `0 0 24 24` |

#### 6.6.6 Stats Bar Icons

| Icon Name | Usage | Design | viewBox |
|-----------|-------|--------|---------|
| `TotalIcon` | "Total: 24" stat prefix | Stack of three pages/documents fanned slightly. Stroke-based. | `0 0 24 24` |
| `ActiveIcon` | "Active: 12" stat prefix | Circle with a play-triangle inside (indicates "running"). Stroke-based. | `0 0 24 24` |
| `WarningIcon` | "Past Due: 3" stat prefix (red accent) | Triangle with exclamation mark inside. Filled `currentColor` when used with error color. | `0 0 24 24` |
| `PercentIcon` | "Avg: 78%" stat prefix | Circle with a partial arc fill (like a donut chart showing completion). Stroke-based. | `0 0 24 24` |
| `AttentionIcon` | "Needs Attention: 5" stat prefix | Bell with a small dot at top-right (notification bell). Stroke-based. | `0 0 24 24` |
| `CreatePlusIcon` | "Create Homework" button icon | Circle with a centered plus (+) inside. Stroke-based, 2px stroke. | `0 0 24 24` |

#### 6.6.7 Empty State Icons

| Icon Name | Usage | Design | viewBox |
|-----------|-------|--------|---------|
| `EmptyHomeworkIcon` | No homework empty state (replaces 📋 emoji) | Large clipboard outline with a dotted horizontal line center (suggesting empty content). Stroke-based, 1.5px stroke. Should be used at 64-96px for visual impact. | `0 0 64 64` |
| `EmptyStudentsIcon` | Empty class drill-down | Two person silhouettes with a question mark between them. Stroke-based. Used at 64px. | `0 0 64 64` |
| `EmptyAssignmentsIcon` | No homework for student in modal | Document with a sad face or empty checkboxes. Stroke-based. Used at 48px. | `0 0 64 64` |

#### 6.6.8 Icon Component Standards

All icons MUST follow this TypeScript interface:

```typescript
interface HomeworkIconProps {
    size?: number;       // Default: 16 for inline, 20 for buttons, 24 for cards, 64 for empty states
    color?: string;      // Defaults to 'currentColor' (inherits from parent CSS color)
    className?: string;  // For additional CSS class styling
    style?: React.CSSProperties; // For inline style overrides
}
```

Implementation pattern (example):

```typescript
export const ClassIcon: React.FC<HomeworkIconProps> = ({ size = 20, color, className, style }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color || 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
    >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
);
```

#### 6.6.9 Icon Reuse Matrix

Icons that already exist in the codebase and MUST be re-exported (not recreated):

| New Export Name | Original Location | Original Name |
|----------------|-------------------|---------------|
| `ClockIcon` | `components/modern/icons.jsx` | `ClockIcon` |
| `EditIcon` | `components/modern/icons.jsx` | `EditIcon` |
| `DeleteIcon` | `components/modern/icons.jsx` | `DeleteIcon` |
| `DuplicateIcon` | `components/modern/icons.jsx` | `CloneIcon` |
| `SearchIcon` | `components/layout/StudentIcons.tsx` | `IconSearch` |
| `StudentIcon` | `components/layout/StudentIcons.tsx` | `IconProfile` |

**Total new icons to create: ~29**  
**Total reused icons: 6**  
**Total icons in `HomeworkIcons.tsx`: ~35**

---

## 7. Technical Considerations

### 7.1 Data Architecture

All data for the target grid is derived from the **existing `useHomeworkList` hook** which fetches all teacher homework in a single `getHomeworkByTeacher()` call. Target grouping is computed **client-side** using `useMemo`:

```
All Teacher Homework (already loaded)
  ↓ Group by target.classId / target.studentIds
  ↓ Compute per-target stats from homework.stats
  ↓ Sort by urgency algorithm
  = Target Cards (zero extra queries)
```

### 7.2 New Hooks Required

| Hook | Purpose | Queries |
|------|---------|---------|
| `useTargetGrid(homework[])` | Groups homework by target, computes card data, sorts by urgency | 0 (client-side only) |
| `useClassStudentStats(classId, homework[])` | Fetches roster + submissions, computes per-student stats | 1 RTDB + N Firestore (N = homework count for class) |
| `useStudentHomeworkModal(studentId, classId?)` | Filters homework for a specific student, with class priority sorting | 0 (uses data already in memory + cache from drill-down) |

### 7.3 Component Architecture

```
TeacherHomeworkListPage (refactored)
├── CompactStatsBar (new — replaces HomeworkSummaryStats usage)
├── SearchBar (simplified, reused from existing Input)
├── VanillaTabs (3 tabs: Targets, Timeline, By Status)
├── TargetGrid (new)
│   ├── TargetCard (new, repeated per target)
│   └── StudentGrid (new, shown on class drill-down)
│       ├── StudentCard (new, repeated per student)
│       └── ← Breadcrumb + Back Button
├── HomeworkListModal (new)
│   ├── ModalHeader (student name, search bar)
│   ├── AdvancedSearchPanel (expandable, relocated filters)
│   ├── CompactHomeworkCard (redesigned HomeworkCard)
│   │   └── KebabActionMenu (new — replaces inline action buttons)
│   └── LoadMoreButton
├── HomeworkCreateModal (existing)
├── HomeworkEditModal (existing)
├── BulkExtendModal (existing)
└── BulkDeleteConfirmModal (existing)
```

### 7.4 Performance Budget

| Action | Firestore Reads | RTDB Reads | Expected Latency |
|--------|----------------|-----------|------------------|
| Page load (target grid) | ~1 query (existing) | 0 | ~500ms |
| Drill into class | N queries (N = homework count for class, typically 5-12) | 1 (roster) | ~1-2s |
| Open student modal | 0 (cached data) | 0 | Instant |
| Search/filter in modal | 0 (client-side) | 0 | Instant |
| Switch tabs | 0 | 0 | Instant |

### 7.5 Caching Strategy

- **Level 1 (Target Grid)**: Computed from in-memory homework array. Re-computes on `useMemo` dependency change. No caching needed — it's already instant.
- **Level 2 (Student Grid)**: Cached in component state via `useState`. Keyed by `classId`. Survives until the component unmounts or the user navigates away. A "Refresh" button triggers re-fetch.
- **Level 3 (Homework Modal)**: Uses the same cached data from Level 2 plus in-memory homework data. No additional fetching.

### 7.6 Constraints

- **No Cloud Functions / Blaze Plan**: All computation is client-side.
- **No new Firestore collections or documents**: We only READ existing `homework` and `homework_submissions` collections.
- **No new Firestore indexes required**: Existing indexes (`homework` by `createdBy`, `homework_submissions` by `homeworkId`) are sufficient.
- **Existing components reused**: `VanillaTabs`, `Card`, `Button`, `Input`, `NativeSelect`, `VanillaLoader` from the modern component library.

---

## 8. Success Metrics

1. **Reduced time-to-action**: Teacher can identify the most urgent class/student within 3 seconds of page load (vs. scanning a flat list).
2. **Fewer navigation hops**: Student homework review requires 2 clicks (target card → student card) instead of navigating to each homework detail page individually.
3. **Search usage**: The simplified search bar on the main page handles 80% of lookup needs. Advanced search is used only when needed (inside modal).
4. **Performance**: Page load remains under 1 second. Class drill-down completes within 2 seconds for classes with up to 15 homework assignments.
5. **Mobile usability**: All views are fully functional on mobile with single-column responsive layout.

---

## 9. Open Questions

1. **Avatar data availability**: Do all student profiles have `avatarUrl`? If not, the student card will use initials-based fallback (first letter of name in a colored circle). *Resolution: Use initials fallback — this is safe and already used elsewhere in the app.*
2. **Notification integration**: Should clicking a target card with overdue homework show a quick "Send Reminder to All" action? *Deferred to future enhancement — the existing "Remind All" button on the detail page covers this.*
3. **Drag-and-drop priority**: Should teachers be able to manually pin/reorder target cards? *Out of scope for this version.*

---

## 10. Acceptance Criteria Summary

### AC-1: Target Grid Rendering
- [ ] Default view shows a responsive grid of target cards (3 cols desktop, 2 tablet, 1 mobile)
- [ ] Each class card shows: name, active count, overdue count, completion bar, student count, latest date, total count
- [ ] Each individual student card shows: name with `StudentIcon` SVG prefix, assignment count, urgency info
- [ ] Cards with overdue homework have glowing/pulsing red border animation
- [ ] All-completed targets are sorted to bottom with reduced opacity

### AC-2: Urgency-First Sorting
- [ ] Overdue targets appear first (most overdue count → longest overdue)
- [ ] Due-within-48h targets appear second (most imminent deadline first)
- [ ] Newly created (within 48h) targets appear third
- [ ] Other active targets appear fourth (by nearest due date)
- [ ] All-completed targets appear last
- [ ] Sort dropdown allows changing sort order

### AC-3: Class Drill-Down
- [ ] Clicking a class card transitions to student grid view
- [ ] Breadcrumb shows "All Targets > Class Name" with clickable "All Targets"
- [ ] Back arrow button returns to target grid
- [ ] Student cards show: name, avatar/initials, completed/total, completion ring, overdue count, avg score, last submission
- [ ] Skeleton shimmer displays while data loads (~1-2s)
- [ ] Data is cached — re-opening the same class is instant

### AC-4: Homework List Modal
- [ ] Clicking any student card opens a large centered modal (~80% width, max 960px)
- [ ] Modal title shows student name and context
- [ ] Homework uses redesigned compact cards with SVG icons and status-colored left border
- [ ] All actions available via kebab menu (Edit, Duplicate, Delete, Extend, Reset, Restore, Permanent Delete)
- [ ] Clicking a homework card navigates to detail page and closes modal
- [ ] Shows 20 items initially with "Load More" button
- [ ] From class drill-down: shows ALL student homework, class homework sorted first

### AC-5: Search
- [ ] Main page has a single clean search bar searching target names + homework titles
- [ ] Instant filtering with 300ms debounce
- [ ] Clear (✕) button appears when search has value
- [ ] Modal has basic search in sticky header
- [ ] Modal has "Advanced Search" expandable panel with all relocated filters
- [ ] Advanced Search button highlights when filters are active

### AC-6: View Tabs
- [ ] Three tabs: Targets (default), Timeline, By Status — with SVG tab icons from icon registry
- [ ] "By Class" tab is removed
- [ ] Search persists when switching tabs
- [ ] Drill-down resets when switching tabs

### AC-7: Compact Stats Bar
- [ ] Single-row stats bar replaces the old 5-card summary
- [ ] Shows: Total, Active+Scheduled, Past Due, Avg Completion, Needs Attention
- [ ] Action buttons: Close All Past Due, Create Homework, Create THCS Homework
- [ ] Responsive — wraps on mobile

### AC-8: Alert Banner Removed
- [ ] `HomeworkAlertBanner` is not rendered on the homework list page
- [ ] Component is NOT deleted from codebase (still used on detail page)
- [ ] Urgency communicated through card sorting + glowing borders + red badges

### AC-9: Empty States
- [ ] No homework: friendly empty state with Create CTA
- [ ] Empty class drill-down: "No students found" message
- [ ] Empty student modal: "No homework assigned" message

### AC-10: Performance
- [ ] Page load (target grid): < 1 second
- [ ] Class drill-down: < 2 seconds for ≤ 15 homework items
- [ ] No Cloud Functions or Blaze Plan features used
- [ ] No new Firestore indexes required
