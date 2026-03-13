# PRD-0034 Knowledge Extraction
## Teacher Homework Management Overhaul — Complete Post-Mortem

**Date:** 2026-03-13
**PRD Scope:** 17 task groups, 112+ sub-tasks across 4 Phases
**Timeline:** Multi-session implementation (March 2026)

---

## 1. Events (Key Milestones)

### Phase 1 → Phase 2 Transition
| Event | Impact |
|-------|--------|
| **N+1 `updateHomeworkStatus` discovered** | Every page load triggered N Firestore writes + 2N reads. Identified in first assessment, fixed by switching to `homeworkAutoTransitionService` |
| **Toast architecture mismatch** | Original implementation used per-component `<ToastNotification>` instead of PRD-specified `useSyncExternalStore` singleton. Required full rewrite |
| **Placeholder epidemic** | `VanillaTabs`, `VanillaLoader`, `HomeworkScoreDistribution` were all empty stubs (`<div>Placeholder</div>`). Blocked downstream features |
| **Mantine audit revealed leak** | `UpcomingHomeworkWidget` still imported 8 Mantine components. Required full rewrite to vanilla |
| **`HomeworkResultsSummary` dead code** | 318-line file remained in codebase despite being replaced. Created backup then deleted |

### Phase 2 → Phase 3 Transition
| Event | Impact |
|-------|--------|
| **Per-student actions gap** | Task 11.0 (9 sub-tasks) was identified as Phase 2's largest gap — backend APIs existed but entire UI layer was missing |
| **`clearSubsumedOverrides` vanished** | Function was reportedly added but grep found zero results. Either never committed or removed in later edit |
| **`isLateSubmission` override check missing** | Late submissions didn't respect per-student deadline overrides |
| **Route ordering critical** | `/teacher/homework/student/:studentId` MUST come before `/:homeworkId` or "student" is parsed as homework ID |

### Phase 3 → Phase 4 Completion
| Event | Impact |
|-------|--------|
| **Firestore `undefined` crash** | Homework assignment button broke because `thcsConfig` contained `undefined` values — Firestore rejects these |
| **Bulk reminder edge cases** | "Remind All" needed 4 filters: not submitted, <3 reminders, >24h cooldown, not exempted |
| **Mobile CSS `display: table` bug** | Used `display: table` on a `<div>` wrapping the desktop table — should be `display: block` |
| **Duplicate bulk action bar rules** | `HomeworkMobilePolish.css` duplicated rules already in `HomeworkBulkActionBar.css` |

---

## 2. Features Implemented

### Phase 1: Foundation (Tasks 1–6)
- **Shared UI Kit:** `VanillaTabs`, `VanillaLoader`, `ToastNotification` (singleton pattern with `useSyncExternalStore`)
- **Data Hooks:** `useHomeworkDetail` (real-time onSnapshot + 500ms debounce), `useHomeworkList` (client-side filter/sort/paginate), `useClassRoster`
- **Pages:** `TeacherHomeworkDetailPage` (full detail view), `TeacherHomeworkListPage` (rewrite, Mantine-free)
- **Components:** `HomeworkSummaryStats`, `HomeworkSubmissionTable`, `HomeworkScoreDistribution`, `HomeworkAlertBanner`, `HomeworkBreadcrumb`
- **Mantine Audit:** Zero `@mantine/*` imports across all homework components

### Phase 2: Power Tools (Tasks 7–11)
- **Services:** Archive/restore/permanentDelete lifecycle, `updateStudentOverride`, auto-archive (30-day trash)
- **Bulk Operations:** `useBulkSelection` hook, `HomeworkBulkActionBar`, `BulkExtendModal`, `BulkDeleteConfirmModal`
- **Tags System:** `useHomeworkTags` (Firestore `onSnapshot`), `HomeworkTagChips`, `AdminTagManager`
- **Per-Student Actions:** `StudentActionMenu` (embedded dropdown), `ExtendStudentDeadlineModal`, `ExemptStudentModal`

### Phase 3: Intelligence (Tasks 12–14)
- **Class Analytics:** `ClassAnalyticsHeader`, `AtRiskStudentList` — visual completion tracking
- **Student Homework Profile:** `useStudentHomework` hook, dedicated profile page with cross-homework view
- **Alert System:** `HomeworkAlertBanner` wired into list page

### Phase 4: Polish (Tasks 15–17)
- **Template Save:** `TemplateSaveModal` replacing `window.prompt()` for template naming
- **Reminder Infrastructure:** `sendHomeworkReminderNotification`, "Remind All" bulk action, 3-reminder limit, 24h cooldown
- **Mobile Polish:** Card layout for submission table, bottom sheet action menu, full-screen modals, compact list cards with expand/collapse

---

## 3. Implementation Details

### Architecture Patterns Used

#### A. Hook-First Data Architecture
```
Service Layer (Firebase) → Custom Hook (state + subscription) → Component (render)
```
- `homeworkManager.ts` → `useHomeworkDetail.ts` → `TeacherHomeworkDetailPage.tsx`
- `homeworkBulkOperations.ts` → `useBulkSelection.ts` → `HomeworkBulkActionBar.tsx`
- Clean separation: services don't know about React, hooks don't know about DOM

#### B. Toast Singleton via `useSyncExternalStore`
```typescript
// Module-level queue (outside React)
let toastQueue: Toast[] = [];
let listeners: Set<() => void> = new Set();

// Singleton API
export const toast = {
    success: (msg: string) => addToast('success', msg),
    error: (msg: string) => addToast('error', msg),
};

// React binding
export function ToastContainer() {
    const queue = useSyncExternalStore(subscribe, getSnapshot);
    return <div className="toast-container">{queue.map(renderToast)}</div>;
}
```

#### C. Soft Delete Lifecycle
```
Active → Archived (archived: true, archivedAt: Date.now(), trashExpiresAt: +30 days)
Archived → Restored (archived: false, status: 'draft')
Archived (30 days) → Auto-purged (permanent delete with owner check)
```

#### D. CSS-Only Mobile Responsiveness (No JS breakpoints)
```css
/* Desktop: show table, hide cards */
.hw-desktop-table { display: block; }
.hw-mobile-cards { display: none; }

@media (max-width: 768px) {
    .hw-desktop-table { display: none; }
    .hw-mobile-cards { display: flex; flex-direction: column; }
}
```

#### E. Bottom Sheet Action Menu Pattern
```tsx
// Always render backdrop + dropdown with class names
<div className="action-menu-backdrop" onClick={close} />  {/* display: none on desktop */}
<div className="action-menu-dropdown" style={inlineDesktopStyles}>
    {/* menu items */}
</div>

// CSS handles the mode switch
@media (max-width: 768px) {
    .action-menu-backdrop { display: block; /* overlay */ }
    .action-menu-dropdown {
        position: fixed !important;
        bottom: 0; left: 0; right: 0;  /* bottom sheet */
        animation: slideUpSheet 0.25s;
    }
}
```

#### F. Firestore `undefined` Sanitization
```typescript
// Firestore rejects undefined values — conditionally spread
const config = {
    ...(payload.timerMinutes !== undefined && { timerMinutes: payload.timerMinutes }),
    ...(payload.maxAttempts !== undefined && { maxAttempts: payload.maxAttempts }),
};
```

#### G. Accent-Insensitive Vietnamese Search
```typescript
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// "Nguyễn" matches query "nguyen"
```

---

## 4. Lessons Learned from Trials & Failures

### L1: Placeholder Components Are Technical Debt Bombs
**What happened:** `VanillaTabs`, `VanillaLoader`, and `HomeworkScoreDistribution` were all created as empty stubs (`<div>Placeholder</div>`). Downstream tasks depended on them (list page needed tabs, detail page needed the loader, etc.) and used workarounds.
**Lesson:** Never commit placeholder components. Either implement fully or don't create the file. Stubs create false progress signals and hidden blockers.

### L2: The N+1 Write Pattern Hides in Data Hooks
**What happened:** `useHomeworkList` called `updateHomeworkStatus()` for every homework on every fetch — N writes + 2N reads per page load. This was buried inside the hook and invisible from the page component.
**Lesson:** Data hooks must be PURE READERS unless explicitly named otherwise (e.g., `useHomeworkListWithSync`). Side effects in data-fetching hooks violate the principle of least surprise.
**Standard:** `useFoo` hooks that fetch data should NEVER write to the database as a side effect. Transition logic belongs in dedicated services (`homeworkAutoTransitionService`).

### L3: Toast Architecture — Singleton vs Component Pattern
**What happened:** Initial implementation used per-component `<ToastNotification>` requiring state prop-drilling. PRD specified a `toast.success()` singleton callable from anywhere.
**Lesson:** Notification systems must be fire-and-forget singletons. The `useSyncExternalStore` pattern enables framework-agnostic state management that any module can trigger without React context.
**Standard:** Global UI feedback (toasts, alerts) → module-level singleton + `useSyncExternalStore`. Component-level UI feedback (inline errors) → local state.

### L4: Firestore Rejects `undefined` Values — Always Sanitize
**What happened:** The "Assign Homework" button silently failed because `thcsConfig` object contained `undefined` fields that Firestore rejected.
**Lesson:** Any object written to Firestore must be sanitized. Use conditional spreading (`...(value !== undefined && { key: value })`) for optional fields.
**Standard:** Every Firestore write function must have an `undefined` guard. No exceptions.

### L5: Route Parameter Ordering Matters
**What happened:** `/teacher/homework/student/:studentId` must be registered BEFORE `/teacher/homework/:homeworkId` in React Router. Otherwise, "student" is parsed as a homework ID.
**Lesson:** Specific routes must come before parameterized catch-all routes. This is a React Router fundamental but easy to forget when adding routes incrementally.
**Standard:** When adding new routes under an existing parameterized parent, always check route ordering in `App.jsx`.

### L6: CSS `display: table` on `<div>` Breaks Layout
**What happened:** Used `display: table` as the default for the desktop table wrapper div, which is incorrect — it should be `display: block` since the actual `<table>` element handles its own display.
**Lesson:** Only `<table>` elements should use `display: table`. Wrapping divs should use `display: block` or `display: contents`.

### L7: Duplicate CSS Rules Across Files Create Maintenance Nightmares
**What happened:** `HomeworkMobilePolish.css` duplicated bulk action bar mobile rules already present in `HomeworkBulkActionBar.css`.
**Lesson:** Before adding mobile rules to a shared CSS file, check if the component's own CSS already handles the responsive case.
**Standard:** Shared mobile CSS files should only contain CROSS-COMPONENT rules. Component-specific responsive rules belong in the component's own CSS file.

### L8: "Function Was Reportedly Added But Grep Found Nothing"
**What happened:** `clearSubsumedOverrides` was mentioned in commit messages but never found in the codebase. Either never committed or removed in a later edit.
**Lesson:** Always verify critical function existence via grep AFTER claiming implementation. Transient edits in AI-assisted sessions can be overwritten by subsequent operations.
**Standard:** After implementing a critical function, run `grep -r "functionName" src/` to verify it persists in the final codebase.

---

## 5. Logic Patterns

### Reminder Eligibility Logic (4-way filter)
```typescript
const isEligible = (student) =>
    !hasSubmitted(student) &&           // Don't remind already-submitted
    reminderCount < 3 &&                // Hard limit per homework
    (Date.now() - lastRemindedAt) > 24h && // Cooldown period
    !isExempted(student);               // Skip exempted students
```

### Auto-Archive Decision Logic
```typescript
const shouldAutoArchive = (hw) =>
    hw.status === 'closed' &&
    !hw.archived &&
    (hw.closedAt || hw.scheduling?.dueDate) &&
    (Date.now() - (hw.closedAt || hw.scheduling.dueDate)) > 30_DAYS;
```

### Late Submission Detection (with per-student override)
```typescript
const isLate = (submission, homework) => {
    const effectiveDeadline = homework.studentOverrides?.[submission.studentId]?.dueDate
        || homework.scheduling.dueDate;
    return submission.submittedAt > effectiveDeadline;
};
```

### Bulk Operation Safety Pattern
```typescript
const results = await Promise.allSettled(
    items.map(item => processItem(item))
);
const succeeded = results.filter(r => r.status === 'fulfilled').length;
const failed = results.filter(r => r.status === 'rejected').length;
toast.success(`${succeeded} updated, ${failed} failed`);
```

### Owner-Guarded Auto-Purge
```typescript
const purgeExpiredArchived = async (homework, userId) => {
    if (hw.createdBy !== userId) return; // Owner check
    if (!hw.trashExpiresAt || hw.trashExpiresAt > Date.now()) return;
    try {
        await permanentlyDeleteHomework(hw.id);
    } catch (e) {
        // Fire-and-forget: don't block UI on cleanup failures
    }
};
```

---

## 6. Patterns (Reusable)

### P1: Mobile Card ↔ Desktop Table Pattern
**Use case:** Any data table that needs mobile responsiveness.
**Pattern:** Render both layouts in the DOM, toggle visibility via CSS media query.
```
<div className="desktop-view">  {/* display: block / none */}
    <table>...</table>
</div>
<div className="mobile-cards">  {/* display: none / flex */}
    {data.map(renderCard)}
</div>
```
**Benefit:** Zero JS breakpoint detection, no re-rendering on resize.

### P2: Mobile Bottom Sheet for Dropdown Menus
**Use case:** Any action menu that should be a dropdown on desktop and a bottom sheet on mobile.
**Pattern:** Always render backdrop + menu with class names. CSS toggles behavior.
- Desktop: backdrop hidden, menu positioned absolutely
- Mobile: backdrop visible, menu fixed to bottom with slide-up animation

### P3: `modal-fullscreen-mobile` Shared Class
**Use case:** Any modal that should go full-screen on mobile.
**Pattern:** Add `className="modal-fullscreen-mobile"` to the modal panel div.
```css
@media (max-width: 768px) {
    .modal-fullscreen-mobile {
        width: 100vw !important; height: 100vh !important;
        max-width: none !important; border-radius: 0 !important;
    }
}
```

### P4: Compact Card with Expand Toggle
**Use case:** List pages with information-dense cards that overwhelm mobile screens.
**Pattern:** Hide non-essential sections on mobile. Add a "▼ Show more" button visible only on mobile.
- Toggle adds/removes `.mobile-expanded` class
- CSS uses `display: none` / `display: grid` for sections

### P5: `useSyncExternalStore` for Global UI State
**Use case:** Toast notifications, global loading indicators, connection status.
**Pattern:** Module-level state + subscriber pattern, consumed via `useSyncExternalStore`.
**Benefit:** Callable from non-React code (services, event handlers), no Context needed.

### P6: Conditional Spread for Firestore Safety
**Use case:** Any Firestore write with optional fields.
```typescript
const data = {
    required: value,
    ...(optional !== undefined && { optional }),
};
```

---

## 7. Moving Forward Standards

### S1: Data Hook Purity
> `useFoo` hooks that fetch data MUST be pure readers. No database writes as side effects.
> Write operations belong in services or dedicated mutation hooks (`useFooMutation`).

### S2: Component File Integrity
> Never commit placeholder/stub components. A component file either:
> - Has a full working implementation, OR
> - Does not exist yet
> Empty stubs create false progress signals and hidden downstream blockers.

### S3: Firestore Write Safety
> Every function that writes to Firestore MUST sanitize `undefined` values.
> Use conditional spreading: `...(val !== undefined && { key: val })`.

### S4: Mobile Responsiveness — CSS-Only
> Use CSS media queries with display toggles for responsive layouts.
> Do NOT use JavaScript breakpoint detection or `window.innerWidth` checks.
> Shared mobile classes: `modal-fullscreen-mobile`, `action-menu-dropdown`, `action-menu-backdrop`.

### S5: Route Ordering
> When adding routes under parameterized parents:
> 1. Specific paths (e.g., `/student/:studentId`) BEFORE catch-all params (`/:homeworkId`)
> 2. Verify in `App.jsx` after every route addition

### S6: CSS Ownership
> - **Component-specific responsive rules** → component's own CSS file
> - **Cross-component shared mobile rules** → `HomeworkMobilePolish.css` (or equivalent shared file)
> - Never duplicate rules across files

### S7: Assessment Before Implementation
> Before starting a large PRD:
> 1. Run a full codebase assessment against the task list
> 2. Identify stubs, deviations, and gaps
> 3. Fix foundation issues (N+1 writes, architecture mismatches) FIRST
> 4. Then proceed phase-by-phase

### S8: Post-Implementation Verification
> After implementing a critical function:
> 1. `grep -r "functionName" src/` to verify it exists
> 2. `npx tsc --noEmit` to verify TypeScript compiles
> 3. Check task list accuracy against actual code

### S9: Bulk Operation UX
> All bulk operations MUST:
> 1. Use `Promise.allSettled` (not `Promise.all`) — partial success is valid
> 2. Report both success and failure counts: `"X succeeded, Y failed"`
> 3. Clear selection after operation completes

### S10: Reminder/Notification Guard Pattern
> Any automated notification system MUST implement:
> 1. **Hard limit** (e.g., max 3 reminders per student per homework)
> 2. **Cooldown period** (e.g., 24h between reminders)
> 3. **State filter** (don't notify completed/exempted users)
> 4. **Idempotency** (duplicate sends don't create duplicate notifications)

---

## 8. Post-PRD Refactoring: List Page Architecture Overhaul (2026-03-14)

After completing PRD-0034, the list page underwent a major UI architecture refactoring. This section captures the new patterns, components, and design decisions.

### 8.1 Events

| Event | Impact |
|-------|--------|
| **View mode changed from `timeline/byClass/byStatus` to `targets/chronological/by_status`** | Default view is now `targets` — groups homework by class/student assignment target instead of a flat list |
| **Filter controls moved into `AdvancedSearchPanel`** | Status filter, sort dropdown, tag chips, show closed/archived toggles, and bulk mode all moved from the main page into a collapsible panel inside the drill-down modal |
| **`handleBulkModeToggle`, `handleStatusSelect`, `handleClosedToggle`, `sortOptions` removed from page** | Page component simplified — these controls now live inside `AdvancedSearchPanel` within `HomeworkListModal` |
| **New component suite introduced** | 9 new components: `TargetCard`, `TargetGrid`, `StudentCard`, `StudentGrid`, `KebabActionMenu`, `CompactHomeworkCard`, `AdvancedSearchPanel`, `HomeworkListModal`, `CompactStatsBar` |
| **New hooks introduced** | `useTargetGrid`, `useStudentHomeworkModal`, `useClassStudentStats` — each with specific data transformation logic |

### 8.2 New Component Architecture

#### Navigation Flow
```
TeacherHomeworkListPage
  ├── CompactStatsBar (top: stats + create buttons)
  ├── SearchInput (debounced 300ms)
  ├── VanillaTabs (targets | chronological | by_status)
  │
  ├── [targets view] → TargetGrid
  │     └── TargetCard × N (class/student cards with urgency sorting)
  │           └── onClick → sets drillDownClass or opens StudentGrid
  │
  ├── [chronological view] → HomeworkCard × N (existing cards, sorted by creation)
  │
  ├── [by_status view] → grouped sections → HomeworkCard × N
  │
  ├── StudentGrid (when drillDownClass is set)
  │     └── StudentCard × N (avatar + progress ring + stats)
  │           └── onClick → opens HomeworkListModal
  │
  └── HomeworkListModal (full modal per student)
        ├── AdvancedSearchPanel (status filter, sort, tags, bulk mode)
        ├── CompactHomeworkCard × N (compact rows with kebab)
        └── Load More button
```

#### Key Components

| Component | Purpose | Props Pattern |
|-----------|---------|---------------|
| `TargetCard` | Displays class/student target with active count, overdue badge, completion progress bar, and footer stats | `target: TargetCardData`, `onClick` |
| `TargetGrid` | CSS grid container rendering `TargetCard` items | Wraps `TargetCard[]` |
| `StudentCard` | Avatar with SVG progress ring, name, completion stats, overdue count, avg score | `student: StudentStats`, `onClick` |
| `StudentGrid` | CSS grid container rendering `StudentCard` items for a drilled-down class | Wraps `StudentCard[]` |
| `KebabActionMenu` | ⋮ dropdown with Edit, Duplicate, Extend, Reset, Delete/Restore actions | `homework: HomeworkAssignment`, `on*` handlers |
| `CompactHomeworkCard` | 3-row compact card: (1) title + badge + target, (2) due date + timer + attempts, (3) progress + submitted + avg | `homework`, `onClick`, `on*` handlers |
| `AdvancedSearchPanel` | Collapsible filter panel: status chips, sort dropdown, tag chips, show closed/archived toggles, bulk mode | Many filter state props |
| `HomeworkListModal` | Full-screen modal showing a student's homework with search, filters, sort, pagination | `studentId`, `allHomework`, `on*` handlers |
| `CompactStatsBar` | Horizontal stats bar: Total, Active, Past Due, Avg Completion, Attention + action buttons | Stats values + `on*` handlers |

### 8.3 New Implementation Patterns

#### H. Urgency-Tiered Sorting (FR-11)
```typescript
// 5-tier urgency system for target cards
function getUrgencyTier(card: TargetCardData, now: number): number {
    if (card.overdueCount > 0) return 1;              // 🔴 Has overdue
    if (hasImminentDeadline(card, 48h)) return 2;      // 🟡 Deadline within 48h
    if (isRecentlyCreated(card, 48h)) return 3;        // 🟢 New homework
    if (card.activeCount > 0) return 4;                // ⚪ Active but calm
    return 5;                                           // ✅ All completed
}
// Within same tier: sort by overdue count, nearest deadline, or recency
```
**Lesson:** Multi-tier sorting replaces simple date sorting. Users see the most urgent items first without needing filters.

#### I. Async Name Resolution with Module-Level Cache
```typescript
// Module-level cache survives re-renders and remounts
const classNameCache = new Map<string, string>();
const studentNameCache = new Map<string, string>();

function useTargetGrid(homework, searchQuery) {
    const [resolvedNames, setResolvedNames] = useState(new Map());

    // Step 1: Build raw cards synchronously (fast)
    const rawCards = useMemo(() => { ... }, [homework]);

    // Step 2: Resolve missing names asynchronously (with cache + cancellation)
    useEffect(() => {
        for (const card of rawCards) {
            if (looksLikeRawId(card.targetName)) {
                // Check cache → skip | Else → fetch + cache
            }
        }
    }, [rawCards]);

    // Step 3: Apply resolved names + filter + urgency sort
    const targetCards = useMemo(() => { ... }, [rawCards, resolvedNames, searchQuery]);
}
```
**Key decisions:**
- `looksLikeRawId()` detects Firebase UIDs (28+ alphanumeric chars) vs human-readable names
- Cache is module-level (not `useRef`) so it persists across component unmount/remount
- `Promise.allSettled` for name resolution — one failed lookup doesn't block others
- Cancellation flag (`let cancelled = false`) prevents setState after unmount

#### J. SVG Progress Ring in StudentCard
```tsx
const RING_RADIUS = 24;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const progressOffset = RING_CIRCUMFERENCE - (completionRate / 100) * RING_CIRCUMFERENCE;

<svg viewBox="0 0 54 54">
    <circle className="ring-bg" cx="27" cy="27" r={RING_RADIUS} />
    <circle className="ring-fill" cx="27" cy="27" r={RING_RADIUS}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={progressOffset} />
</svg>
```
**Benefit:** Pure CSS/SVG — no canvas, no library, GPU-composited animation.

#### K. Deterministic Avatar Colors from Name Hash
```typescript
const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', ...]; // 12 colors
function getAvatarColor(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
```
**Benefit:** Same student always gets same color. No external avatar service needed.

#### L. "Controls Into Modal" Pattern
**Problem:** Main list page had too many controls (status filter, sort, tags, show closed, show archived, bulk mode) cluttering the UI.
**Solution:** Move ALL filter/sort/bulk controls into `AdvancedSearchPanel` component. Render that panel inside `HomeworkListModal` (per-student drill-down). Main page keeps only search bar + view mode tabs.
**Trade-off:** Filtering is now per-modal instead of global — acceptable because the Target Grid view makes global filtering less useful.

### 8.4 New Lessons Learned

#### L9: `useMemo` for State Reset Is an Anti-Pattern
```typescript
// ❌ BAD: Side effect inside useMemo
useMemo(() => {
    setDisplayCount(PAGE_SIZE);
}, [studentId, classId]);
```
**Why it works but is wrong:** `useMemo` is for memoizing computations, not triggering side effects. Use `useEffect` instead. This pattern will break if React's concurrent mode defers or replays memo computations.
**Current status:** Present in `useStudentHomeworkModal.ts` line 60-62. Should be refactored to `useEffect`.

#### L10: Kebab Menu — Always `stopPropagation()`
```typescript
// The card has an onClick that navigates. The kebab menu ALSO has clickable buttons.
// Without stopPropagation, clicking "Edit" also navigates to detail page.
onClick={(e) => { e.stopPropagation(); handleAction(onEdit); }}
```
**Standard:** Any clickable element inside a clickable container MUST call `e.stopPropagation()`.

### 8.5 New Standards

#### S11: Target-Based View as Default
> For list pages managing items assigned to different targets (classes, students, groups):
> - Default view should group by assignment target, NOT show a flat chronological list
> - Use urgency-tiered sorting within the target grid
> - Provide drill-down to individual items via click → modal or nested view

#### S12: Module-Level Cache for Async Name Resolution
> When display names need async resolution (e.g., Firebase UID → profile name):
> 1. Use module-level `Map` cache (persists across unmount/remount)
> 2. Detect raw IDs with `looksLikeRawId()` heuristic before fetching
> 3. Use `Promise.allSettled` — never let one failed lookup block others
> 4. Include cancellation flag in the `useEffect` cleanup

#### S13: Compact Card Design Standard
> High-density card layouts (like `CompactHomeworkCard`) should follow the 3-row pattern:
> - **Row 1:** Title + Status badge + Target icon (identity)
> - **Row 2:** Temporal info: due date, timer, attempts (constraints)
> - **Row 3:** Progress bar + submitted count + average score (outcomes)
> - **Right edge:** Kebab action menu (always `stopPropagation`)

#### S14: Filter Controls Placement
> For pages with drill-down navigation:
> - **Main page:** Keep only search + view mode tabs (low cognitive load)
> - **Drill-down modal:** Include all filter/sort/bulk controls via `AdvancedSearchPanel`
> - Filters reset when modal opens (`useEffect` on `isOpen`)
