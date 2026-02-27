# 0002-prd-student-dashboard.md
# PRD: Student Dashboard — Activity Stream Migration

## 1. Introduction/Overview

The current Student Dashboard (`StudentDashboardPage.jsx`) suffers from severe visual clutter, a non-scalable horizontal tab strip, an unreachable "History" view (routing bug), and a purple gradient aesthetic that violates project design guidelines.

This PRD defines the migration to an **Activity Stream** 3-column layout (Left Navigation | Center Feed | Right Info Panel). The center feed is powered by a refactored, paginated Firebase notification service. This is a UI-only migration — test-taking, homework submission, and grading logic are untouched.

---

## 2. Goals
- Redesign the Student Dashboard UI into a 3-column Activity Stream layout.
- Build a real chronological activity feed powered by `notificationService.ts`, paginated at 20 items per page with "Load More" appending.
- Refactor the Firebase `notifications` schema from a flat list to a per-user path to enable proper server-side pagination.
- Standardize the notification system so student actions (joining a class, completing a test) automatically generate feed entries.
- Categorize all horizontal tabs into a clean Left Sidebar with explicit behavior per link.
- Integrate the existing `NotificationBell` as a quick-access shortcut (capped at 5 items) with a "See All" link to the feed.
- Add filter tabs above the Activity Feed for domain-based filtering.
- Fix the unreachable "History" HTML bug.

---

## 3. User Stories

- **As a student**, I want to see a chronological feed of my recent activities so that I always know what is new.
- **As a student**, I want to filter my feed by category (Homework, Tests, Classes) so I can focus on what matters.
- **As a student**, I want to navigate between "Activity Feed", "My Classes", and "Recent History" without the page reloading.
- **As a student**, I want to see upcoming deadlines (with overdue items flagged in red) in an "Up Next" panel.
- **As a student**, I want to see active public sessions ranked by popularity in a "Live Now" panel and join them directly.
- **As a student**, I want a persistent "Enter Class Code" bar so I can join new classes without hunting for a button.
- **As a new student with no activity**, I want helpful fallback content so the dashboard does not feel empty.
- **As a student on mobile**, I want to toggle the left and right sidebars with icons, with only one overlay open at a time.

---

## 4. Functional Requirements

### FR-01: Layout Grid
The page MUST use CSS Grid with three columns:
- **Left Sidebar:** `250px` fixed width, no vertical scroll.
- **Center Column:** `1fr` flexible (max-width `42rem`), vertically scrollable.
- **Right Panel:** `320px` fixed width, sticky, no vertical scroll on panel itself.

---

### FR-02: Left Sidebar — Navigation Matrix

**Group 1 — Daily Operations** (center view swaps via transition animation, no URL change):

| Sidebar Label | Icon | Source Data | Sets `activeView` to |
|---|---|---|---|
| Activity Feed | 🏠 | `notifications` (paginated) | `feed` (default) |
| My Classes | 🏫 | `enrolledClasses` | `classes` |
| Recent History | 📜 | `studentHistory` | `history` |

**Group 2 — Study & Account** (navigates away from the dashboard, new URL):

| Sidebar Label | Icon | Route | Visual Tag |
|---|---|---|---|
| Courses | 📚 | `/student/courses` | ↗ |
| Homework | 📝 | `/student/homework` | ↗ |
| Library | 📖 | `/student/library` | ↗ |
| Academic Record | 📈 | `/student/academic-record` | ↗ |
| Profile & Settings | 👤 | `/profile` | ↗ |

**Active State Indicator (Group 1 only):** The currently active item MUST have BOTH:
1. A **3px left accent border** in the app's primary color.
2. A **soft background tint** (e.g., `rgba(primaryColor, 0.08)`) on the entire row.

---

### FR-03: Center Column — Activity Feed (Default View)

- On component mount, fetch the first 20 notifications by calling `getPaginatedUserNotifications(userId, 20)`.
- This is a **snapshot fetch** (not a real-time listener). The feed shows the state of the dashboard at load time.
- A **"Load More"** button at the bottom of the list appends the next 20 older items to the current `notifications` array. The user's scroll position MUST NOT jump.
- Each feed item renders: type icon, title, message body, and a relative time string (e.g., "2 hours ago").
- Feed items that have a `link` property are clickable. Clicking them **navigates to the link AND marks the notification as read** in the background (fire `markNotificationAsRead(id)` — do NOT await or block navigation).

---

### FR-03a: Feed Filter Tabs

A horizontal tab bar MUST appear between the Join Class bar and the feed list. Tabs:

| Tab Label | Filter Logic (based on `metadata` keys) |
|---|---|
| **All** | No filter — show everything (default) |
| **Homework** | Items where `metadata.homeworkId` exists |
| **Tests** | Items where `metadata.resultId` OR `metadata.testName` exists (but NOT `metadata.homeworkId`) |
| **Classes** | Items where `metadata.className` exists OR title contains "Joined Class" |

**Implementation rules:**
- Filtering is **client-side only** — applied against the already-fetched `notifications` array.
- The "Load More" button loads from the **unfiltered paginated source** (fetches next 20 of ALL types from Firebase). The filter is re-applied after appending.
- If the filtered result set is empty for the selected tab, show inline text: "No [Homework/Tests/Classes] activity yet."
- Active filter tab MUST be visually distinct (e.g., underline or filled background).

---

### FR-04: Center Column — Join Class Bar

- A compact "Join a Class" input bar MUST be pinned at the top of the center column, above the filter tabs and feed (visible in ALL center views: `feed`, `classes`, `history`).
- On successful `enrollStudent()` call, display a brief **inline success message** directly below the input ("✅ Successfully joined [Class Name]!"), replacing the current browser `alert()`. The message auto-dismisses after **3 seconds**.
- On error, display the error message inline below the input (red text).

---

### FR-05: Center Column — State-Flip Transition

- When `activeView` changes (e.g., clicking "My Classes"), the center column content MUST animate using a CSS transition.
- Implementation: `opacity: 0 → 1` with `translateY(8px) → translateY(0)` fade-in, duration `200ms`, easing `ease-out`.
- The sidebars MUST NOT re-render during this transition. They are rendered as sibling elements outside the animated container.
- While data is loading (e.g., `enrolledClasses` still fetching), the center column shows a **centered spinner** icon.

---

### FR-06: Right Panel — "Up Next" Deadlines

- Display items from `teacherAssignments` sorted by `dueDate` ascending (soonest first).
- **Overdue items** (where `dueDate < Date.now()`) MUST still appear in the list with a red ⚠️ badge and red text color for the due date string.
- **Empty state:** If there are no assignments (pending or overdue), display "No upcoming deadlines 🎉" as centered placeholder text.
- Each item shows: homework title, due date string, overdue badge (if applicable), and a "View" quick-link to `/student/homework`.

---

### FR-07: Right Panel — "Live Now / HOT" Sessions

- Displays active public sessions from `publicSessions`.
- Sort order: **Primary** = `playerCount` descending. **Secondary/Tiebreaker** = `createdAt` ascending (oldest first when player count is tied).
- Display cap: Show a **maximum of 5 sessions** in the widget.
- Each item shows: session name, player count badge, and a "Join" button.
- **Empty state:** If `publicSessions` is empty, hide the "Live Now" section entirely (do not render the heading or empty container).

---

### FR-08: Empty State (New Students)

Condition: `notifications.length === 0` AND `enrolledClasses.length === 0`.

Center column displays:
1. A large, prominent "Join a Class" card (with the class code input form).
2. Below it, a scrollable list using the `publicSessions` data styled as invitation cards.

If both notifications and classes are empty AND publicSessions is also empty, show a single centered illustration card: "Welcome! Ask your teacher for a class code to get started."

---

### FR-09: Teacher Invite Migration

- Remove the `showTeacherInvite` state and its entire JSX block from `StudentDashboardPage.jsx`.
- Re-implement as a small card within the existing `/profile` page body, positioned below the main profile info, labeled "Connect with a Teacher."

---

### FR-10: Mobile Responsiveness

- At viewport `< 768px`, both Left and Right columns are hidden by default.
- A **top mobile header bar** is rendered with:
  - Left: Hamburger icon (☰) — toggles `showMobileLeft`.
  - Center: App name/logo.
  - Right: Calendar/Tasks icon (🗓️) — toggles `showMobileRight`.
- Both sidebars appear as **full-height off-canvas overlays** (position: fixed, full-height, slides in from the respective side).
- **Mutual exclusion:** Opening one sidebar MUST automatically close the other.
- A semi-transparent backdrop behind the open overlay closes it on tap.

---

### FR-11: Notification System Standardization

Two new notification triggers (non-blocking, wrapped in try/catch):

| Service | Function | Event | Notification |
|---|---|---|---|
| `classManager.ts` | `enrollStudent` | After successful enrollment | `type: 'success'`, title: `"🏫 Joined Class"`, message: `"You joined [className]!"`, link: `/student/dashboard`, metadata: `{ className }` |
| `testResults.service.ts` | `saveTestResult` | After successful save (non-guest only) | `type: 'success'`, title: `"✅ Test Complete"`, message: `"You completed \"[testTitle]\". Score: [score]/[maxScore]"`, link: `/result/[resultId]`, metadata: `{ resultId, testName, score, maxScore }` |

**Rule:** A notification failure MUST NOT throw and MUST NOT roll back the primary action.

**Important for Feed Filters:** The `metadata` object MUST include the expected keys so FR-03a filter logic can categorize them. Existing homework notifications already include `homeworkId` — no change needed there.

---

### FR-12: NotificationBell — "See All" Integration

The existing `NotificationBell` component in `StudentHeader` stays as a real-time alert shortcut.

**Changes to `NotificationBell.tsx`:**
- Cap the displayed notifications at **5 most recent items** in the popover. Even though `subscribeToNotifications` streams all, only slice and render the first 5.

**Changes to `NotificationPanel.tsx`:**
- Add a **"See All Activity →"** link/button at the bottom of the panel.
- Clicking it: closes the popover (`onClose()`), then navigates to `/student/dashboard?view=feed`.
- The dashboard page reads the `?view=feed` query param on mount to ensure `activeView` is set to `'feed'` and scrolls the center column to the top.

**After the Firebase schema migration (FR-13):** `subscribeToNotifications` must be updated to use the new per-user path.

---

### FR-13: Firebase Schema Migration (CRITICAL)

**Current path:**
```
notifications/{notificationId}: { userId, type, title, ... }
```

**New path:**
```
notifications/{userId}/{notificationId}: { type, title, message, ... }
```
`userId` is removed from the notification object body since it is encoded in the path.

**Files requiring path updates:**
| File | What Changes |
|---|---|
| `notificationService.ts` | ALL read/write functions use new path |
| `notificationService.test.ts` | All test mocks updated |
| `notification.types.ts` | `userId` becomes optional (present in old data, absent in new) |
| Firebase DB security rules | Add rules for `notifications/{userId}` path |

**Migration Script (`src/services/migrations/migrateNotifications.ts`):**
- Reads every node from old `notifications/` flat path.
- Groups by `userId`, writes each to `notifications/{userId}/{notifId}`.
- Deletes old flat nodes after successful write.
- Idempotent (safe to run multiple times).
- Manually triggered by admin, not on app boot.

**New `getPaginatedUserNotifications` signature:**
```ts
getPaginatedUserNotifications(
  userId: string,
  limitCount: number = 20,
  lastKey?: string
): Promise<{ notifications: Notification[]; hasMore: boolean; lastKey?: string }>
```
- Queries `notifications/{userId}`, uses `limitToLast(limitCount + 1)` and `endBefore(null, lastKey)`.
- Returns `lastKey` (oldest item's ID) as cursor for next page.
- Returns `hasMore: true` if fetched count > `limitCount`.

---

## 5. Non-Goals (Out of Scope)

- Building brand-new dedicated pages (e.g., `/student/classes`).
- Changing test-taking, homework submission, or grading logic.
- Implementing browser push notifications (OS-level).
- Automatically migrating notifications on every app boot.
- Any changes to the Teacher or Admin dashboards.
- Server-side filtering for feed tabs (filtering is client-side only in this iteration).

---

## 6. Design Considerations

- **Aesthetic:** Activity Stream / Twitter/X vibe — neutral sidebar, clean card-based feed, minimal shadows.
- **No purple gradients.** Replace `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` with a neutral `#f8fafc` or `#f1f5f9` background.
- **Mantine components:** Use `Paper`, `Stack`, `Group`, `Badge`, `Button`, `Indicator`, `Tabs`, `Loader` for consistency.
- **Transition:** Center column uses `opacity + translateY` fade, 200ms, ease-out.
- **Reference mockup:** `option_c_feed.html` in planning artifacts.

---

## 7. Technical Considerations

- **Primary file:** `src/pages/StudentDashboardPage.jsx`
- **Services extended:** `notificationService.ts`, `classManager.ts`, `testResults.service.ts`
- **Components modified:** `NotificationPanel.tsx`, `NotificationBell.tsx`
- **New files:** `src/services/migrations/migrateNotifications.ts`
- **State variables:**

| Variable | Type | Purpose |
|---|---|---|
| `activeView` | `'feed' \| 'classes' \| 'history'` | Center column display mode |
| `feedFilter` | `'all' \| 'homework' \| 'tests' \| 'classes'` | Active feed filter tab |
| `showMobileLeft` | `boolean` | Mobile left sidebar toggle |
| `showMobileRight` | `boolean` | Mobile right sidebar toggle |
| `notifCursor` | `string \| undefined` | Pagination cursor for Load More |
| `hasMoreNotifs` | `boolean` | Whether more pages exist |
| `joinSuccessMessage` | `string` | Inline success text for Join Class |
| `allNotifications` | `Notification[]` | Full unfiltered feed array |

- **SPA integrity:** Left Sidebar, Right Panel, and Center Column are sibling elements. Only Center Column content re-renders on `activeView` or `feedFilter` change.
- **Firebase indexing:** After migration, remove old `userId` index rule. Per-user path needs no index (direct path access).

---

## 8. Success Metrics

- Dashboard loads first 20 feed items in under 1 second.
- 100% of existing dashboard functionality accessible with zero regression.
- `alert()` is completely removed from `StudentDashboardPage.jsx`.
- No Firebase permission denial errors in console.
- Mobile: only one sidebar overlay open at a time.
- Feed filter tabs correctly categorize all notification types.
- NotificationBell popover shows max 5 items with a "See All" link.

---

## 9. Open Questions

None. All design, routing, pagination, filtering, and interaction decisions were finalized across 4 rounds of Q&A with the product owner.
