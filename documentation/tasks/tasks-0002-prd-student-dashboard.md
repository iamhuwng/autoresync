# Tasks: Student Dashboard Activity Stream Migration

> Generated from [0002-prd-student-dashboard.md](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/documentation/tasks/0002-prd-student-dashboard.md)

## Relevant Files

### Core Files (Modified)
- `src/pages/StudentDashboardPage.jsx` - Primary file being refactored. Contains all current dashboard UI, state hooks, tab logic, and inline styles. This is the most heavily modified file.
- `src/services/notificationService.ts` - Notification CRUD service. Needs: new per-user path for all functions, new `getPaginatedUserNotifications`, updated `subscribeToNotifications`, updated `createNotification`, updated `createBulkNotifications`.
- `src/services/notificationService.test.ts` - Unit tests for notification service. All mocks must be updated for new per-user path + new pagination tests added.
- `src/types/notification.types.ts` - TypeScript interfaces. `userId` field becomes optional in `Notification` interface (present in migrated data, absent in new data since it's encoded in path).
- `src/services/classManager.ts` - `enrollStudent()` function (lines 468–555). A non-blocking `createNotification` call must be injected after the successful enrollment block (after line 549, before the `return { success: true }` on line 551).
- `src/services/testResults.service.ts` - `saveTestResult()` function. A non-blocking `createNotification` call must be injected after line 303 (`console.log('💾 Test result saved')`), before the `return resultId` on line 304.
- `src/components/notifications/NotificationBell.tsx` - Header bell component. Needs: cap displayed notifications at 5 items, update `subscribeToNotifications` call for new path.
- `src/components/notifications/NotificationPanel.tsx` - Bell popover panel. Needs: "See All Activity →" link at bottom.
- `firebase.json` - Firebase Realtime Database rules. Needs updated security rules for `notifications/{userId}` path.

### New Files
- `src/services/migrations/migrateNotifications.ts` - **[NEW]** One-time migration script. Follow existing migration pattern from `addProfileCompletedAt.js` (supports `--dry-run` flag).

### Notes
- Unit tests should be placed alongside the code files they are testing.
- Use `npx jest [optional/path/to/test/file]` to run tests.
- **CRITICAL ORDER:** Task 1 (Firebase Migration) MUST be completed and run before Tasks 2–7 can function with real data. Deploy the migration script first, run it manually, validate, then deploy the remaining code changes.
- All diagnostic logs MUST follow the project pattern: emoji prefix + bracketed module name (e.g., `📢 [NotificationService]`, `🏫 [ClassManager]`, `✅ [TestResults]`).

---

## Tasks

### Phase A: Backend / Data Layer

- [ ] 1.0 Firebase Schema Migration — Refactor notifications from flat list to per-user path (FR-13)
  - [x] 1.1 **Update `notification.types.ts`:** Make the `userId` field optional in the `Notification` interface. Change `userId: string;` to `userId?: string;`. This is required because new notifications written to the per-user path will NOT store `userId` in the body (it's encoded in the path), but old migrated data still has it. Add a JSDoc comment explaining this: `/** @deprecated Stored in path after migration. Present in legacy data only. */`
  - [x] 1.2 **Create migration script** `src/services/migrations/migrateNotifications.ts`. Follow the exact pattern of the existing `addProfileCompletedAt.js`: support a `--dry-run` CLI flag. The script must:
    - Read ALL nodes from `notifications/` (the flat list).
    - For each notification, extract its `userId` value.
    - Group notifications by `userId`.
    - Write each notification to `notifications/{userId}/{notificationId}`, removing the `userId` field from the body.
    - After successful write, delete the original flat node `notifications/{notificationId}`.
    - Log progress: `📦 [Migration] Processing notification {id} for user {userId}...`
    - Log completion: `✅ [Migration] Migrated {count} notifications for {userCount} users.`
    - In dry-run mode, log what WOULD happen but write nothing.
    - Handle edge case: if a notification has no `userId` field, log a warning (`⚠️ [Migration] Skipping notification {id}: no userId found`) and skip it.
    - Handle edge case: if the target path `notifications/{userId}/{notifId}` already exists, skip it (idempotency). Log: `⏭️ [Migration] Skipping {id}: already migrated.`
  - [x] 1.3 **Update `migrations/README.md`:** Add a new entry to the Migration Log table and document the dry-run + actual run commands for `migrateNotifications.ts`.
  - [x] 1.4 **Update Firebase security rules** in `firebase.json` (or the Realtime Database rules console). Add read/write rules for `notifications/$userId` so that authenticated users can only read/write their own notifications. Example rule structure:
    ```json
    "notifications": {
      "$userId": {
        ".read": "auth != null && auth.uid == $userId",
        ".write": "auth != null && auth.uid == $userId"
      }
    }
    ```
    Also allow server/admin writes for the notification triggers (classManager, testResults). Log: `🔒 [Firebase] Updated security rules for notifications/{userId} path.`
  - [x] 1.5 **Run the migration** (manually, in a development environment first):
    - Run dry-run: `npx ts-node src/services/migrations/migrateNotifications.ts --dry-run`
    - Verify output looks correct (expected number of notifications, correct user grouping).
    - Run actual migration: `npx ts-node src/services/migrations/migrateNotifications.ts`
    - Verify in Firebase console that `notifications/{userId}/{notifId}` nodes exist and old flat nodes are deleted.

- [x] 2.0 Notification Service Refactoring — Update all functions for per-user path + add pagination (FR-12, FR-03)
  - [x] 2.1 **Update `NOTIFICATIONS_REF` usage in `createNotification()`:** Change the write path from `notifications/{notificationId}` to `notifications/{data.userId}/{notificationId}`. Remove `userId` from the notification body object (it's now in the path). Add diagnostic log: `📢 [NotificationService] Created notification {id} for user {userId} at path notifications/{userId}/{id}`.
  - [x] 2.2 **Update `getUserNotifications()`:** Change from querying the flat `notifications/` collection with `orderByChild('userId')` + `equalTo(userId)` to directly reading `notifications/{userId}/`. Sort results by `createdAt` descending (newest first). Add log: `📢 [NotificationService] Fetched {count} notifications for user {userId}`.
  - [x] 2.3 **Update `getUnreadNotifications()`:** No logic change needed — it calls `getUserNotifications()` which is now updated. Add log: `📢 [NotificationService] Found {count} unread notifications for user {userId}`.
  - [x] 2.4 **Update `markNotificationAsRead()`:** This function currently uses `notifications/{notificationId}`. It now needs the `userId` to construct the path `notifications/{userId}/{notificationId}`. Change the function signature to accept `userId: string` as the first parameter: `markNotificationAsRead(userId: string, notificationId: string)`. Update all callers (search for `markNotificationAsRead` in the entire codebase). Add log: `📢 [NotificationService] Marked notification {id} as read for user {userId}`.
  - [x] 2.5 **Update `markAllNotificationsAsRead()`:** Now reads from `notifications/{userId}/` directly instead of fetching all then filtering. Add log: `📢 [NotificationService] Marked {count} notifications as read for user {userId}`.
  - [x] 2.6 **Update `subscribeToNotifications()`:** Change the listener path from querying the flat list to `onValue(ref(database, 'notifications/{userId}'), ...)`. This now directly listens to the per-user node. No `orderByChild`/`equalTo` needed. Add log: `📢 [NotificationService] Subscribed to real-time notifications for user {userId}`.
  - [x] 2.7 **Update `createBulkNotifications()`:** Change multi-write paths. For each userId in the list, write to `notifications/{userId}/{notifId}`. Remove `userId` from each notification body. Add log: `📢 [NotificationService] Bulk-created {count} notifications for {userCount} users`.
  - [x] 2.8 **Update ALL specialized notification functions** (`sendFeedbackNotification`, `sendReviewedNotification`, `sendHomeworkAssignedNotification`, `sendHomeworkDueSoonNotification`, `sendHomeworkSubmittedNotification`, `sendHomeworkGradedNotification`): These all call `createNotification()` internally, so they will work automatically after 2.1. No changes needed to their logic — just verify they still pass `userId` in the `NotificationCreate` data object (the `createNotification` function reads it from there for the path). Run their tests to confirm.
  - [x] 2.9 **Create `getPaginatedUserNotifications()` function.** Add this new exported function to `notificationService.ts`:
    ```ts
    export async function getPaginatedUserNotifications(
      userId: string,
      limitCount: number = 20,
      lastKey?: string
    ): Promise<{ notifications: Notification[]; hasMore: boolean; lastKey?: string }>
    ```
    Implementation:
    - Query path: `notifications/{userId}`.
    - Use Firebase `query()` with `limitToLast(limitCount + 1)`. If `lastKey` is provided, add `endBefore(null, lastKey)` to paginate backwards.
    - Convert snapshot to array, sort by `createdAt` descending.
    - If result length > `limitCount`, set `hasMore = true` and pop the extra item.
    - Return the `lastKey` as the `id` of the oldest notification in the current page (last item in the sorted array).
    - Add logs: `📢 [NotificationService] Paginated fetch: {count} notifications for user {userId}, hasMore={hasMore}, cursor={lastKey}`.
  - [x] 2.10 **Update `notificationService.test.ts`:** Update all existing test mocks to use the new per-user path (`notifications/{userId}/{notifId}`). Add new test cases:
    - Test `getPaginatedUserNotifications` returns max `limitCount` items.
    - Test `getPaginatedUserNotifications` with `lastKey` cursor returns older items.
    - Test `getPaginatedUserNotifications` returns `hasMore: false` when fewer items exist.
    - Test `markNotificationAsRead` with new `userId` parameter signature.
  - [x] 2.11 **Remove unused imports:** After updating all functions, remove `orderByChild` and `equalTo` from the firebase import if they are no longer used anywhere in the file. Keep `limitToLast` and `endBefore`.

- [x] 3.0 Notification Triggers — Inject feed events into classManager and testResults (FR-11)
  - [x] 3.1 **Inject notification trigger into `enrollStudent()` in `classManager.ts`:** After the successful enrollment block (after line 549: auto-enroll catch block), before `return { success: true, classId: classCode }` on line 551, add:
    ```ts
    // PRD-0002: Dashboard feed notification
    try {
      const { createNotification } = await import('./notificationService');
      await createNotification({
        userId: studentUid,
        type: 'success',
        title: '🏫 Joined Class',
        message: `You joined ${classData.name || classCode}!`,
        link: '/student/dashboard',
        metadata: { className: classData.name || classCode, classCode }
      });
      console.log(`📢 [ClassManager] Feed notification sent for student ${studentUid} joining class ${classCode}`);
    } catch (notifError) {
      console.warn('⚠️ [ClassManager] Failed to send join-class notification (non-blocking):', notifError);
    }
    ```
    **CRITICAL:** This MUST be in a `try/catch`. It MUST NOT affect the `return { success: true }` that follows. Use dynamic `import()` to avoid circular dependency risk.
  - [x] 3.2 **Inject notification trigger into `saveTestResult()` in `testResults.service.ts`:** After line 303 (`console.log('💾 Test result saved: ${resultId}')`), before `return resultId` on line 304, add:
    ```ts
    // PRD-0002: Dashboard feed notification (non-guest only)
    if (!isGuest) {
      try {
        const { createNotification } = await import('./notificationService');
        await createNotification({
          userId: studentId,
          type: 'success',
          title: '✅ Test Complete',
          message: `You completed "${testMetadata.title}". Score: ${markingResult.totalScore}/${markingResult.maxScore}`,
          link: `/result/${resultId}`,
          metadata: { resultId, testName: testMetadata.title, score: markingResult.totalScore, maxScore: markingResult.maxScore }
        });
        console.log(`📢 [TestResults] Feed notification sent for student ${studentId} completing test ${resultId}`);
      } catch (notifError) {
        console.warn('⚠️ [TestResults] Failed to send test-complete notification (non-blocking):', notifError);
      }
    }
    ```
    **CRITICAL:** The `if (!isGuest)` guard is essential — guest users have no persistent userId, so creating a notification for them would create orphan data.
  - [x] 3.3 **Verify no circular imports:** After adding both triggers, run `npx jest` to ensure no import cycle errors. If dynamic `import()` causes issues, refactor to a top-level import from `notificationService` instead (both `classManager` and `testResults.service` do NOT import each other, so there is no cycle risk with `notificationService`).

---

### Phase B: Component Layer

- [x] 4.0 NotificationBell Integration — Cap at 5 items + "See All" link (FR-12)
  - [x] 4.1 **Cap displayed notifications in `NotificationBell.tsx`:** In the `useEffect` callback where `setNotifications(newNotifications)` is called (line 29), change it to `setNotifications(newNotifications.slice(0, 5))`. This ensures the bell popover only ever shows the 5 most recent items. Add log: `📢 [NotificationBell] Received ${newNotifications.length} notifications, displaying top 5.`
  - [x] 4.2 **Update the unread count logic:** Change `setUnreadCount(newNotifications.filter(n => !n.read).length)` to use the FULL array for the unread badge count (so it accurately reflects ALL unread), but the popover list only shows 5. So the logic splits: `setUnreadCount(newNotifications.filter(n => !n.read).length)` stays as-is on the full array. Only `setNotifications(newNotifications.slice(0, 5))` changes.
  - [x] 4.3 **Update `subscribeToNotifications` call path:** After Task 2.6, `subscribeToNotifications` uses the new per-user path. The `NotificationBell` calls it with `userId` which is the same — so no argument changes needed, but verify it still works after the service refactor.
  - [x] 4.4 **Update `markNotificationAsRead` calls:** In `NotificationBell.tsx`, `handleMarkAsRead` calls `markNotificationAsRead(id)`. After Task 2.4, the signature changed to `markNotificationAsRead(userId, id)`. Update to: `await markNotificationAsRead(userId, id)`. The `userId` is available from the component's props.
  - [x] 4.5 **Add "See All Activity →" link to `NotificationPanel.tsx`:** At the bottom of the `NotificationPanel` component (after the `ScrollArea.Autosize`, before the closing `</Stack>`), add a Mantine `Button` with `variant="subtle"`, `fullWidth`, text "See All Activity →". `onClick`: call `onClose()`, then `navigate('/student/dashboard?view=feed')`. Import `useNavigate` from `react-router-dom` (already imported in this file). Add log: `📢 [NotificationPanel] User clicked "See All Activity" — navigating to dashboard feed.`
  - [x] 4.6 **Pass `onClose` through to the "See All" link:** `NotificationPanel` already receives `onClose` as a prop. The "See All" button should call `onClose?.()` before navigating, so the popover closes before navigation starts.

---

### Phase C: Dashboard UI

- [x] 5.0 Dashboard UI Overhaul — Build the 3-column Activity Stream layout (FR-01 through FR-08)
  - [x] 5.1 **Remove the old purple gradient `AppShell` wrapper.** Replace the `style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}` on the `<AppShell>` (line 138) with `style={{ background: '#f8fafc' }}` (neutral light gray). This eliminates the purple gradient per the PRD's design considerations.
  - [x] 5.2 **Add new state variables** at the top of the `StudentDashboardPage` component, after the existing `useState` declarations:
    ```jsx
    const [activeView, setActiveView] = useState('feed'); // 'feed' | 'classes' | 'history'
    const [feedFilter, setFeedFilter] = useState('all'); // 'all' | 'homework' | 'tests' | 'classes'
    const [showMobileLeft, setShowMobileLeft] = useState(false);
    const [showMobileRight, setShowMobileRight] = useState(false);
    const [allNotifications, setAllNotifications] = useState([]);
    const [notifCursor, setNotifCursor] = useState(undefined);
    const [hasMoreNotifs, setHasMoreNotifs] = useState(false);
    const [joinSuccessMessage, setJoinSuccessMessage] = useState('');
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    ```
  - [x] 5.3 **Read `?view=feed` query param on mount.** Add a `useEffect` that reads `new URLSearchParams(window.location.search).get('view')`. If it equals `'feed'`, set `activeView` to `'feed'`. This enables the "See All Activity →" link from the `NotificationBell` to auto-select the feed tab. Add log: `📢 [Dashboard] Loaded with query param view=${viewParam}`.
  - [x] 5.4 **Add notification fetching on mount.** Add a `useEffect` that calls `getPaginatedUserNotifications(user.uid, 20)` when the component mounts. Store the result in `allNotifications`, `hasMoreNotifs`, and `notifCursor`. Add log: `📢 [Dashboard] Initial feed fetch: ${result.notifications.length} items, hasMore=${result.hasMore}`.
  - [x] 5.5 **Implement "Load More" handler.** Create a `handleLoadMore` async function that calls `getPaginatedUserNotifications(user.uid, 20, notifCursor)`, appends the new items to `allNotifications`, updates `notifCursor` and `hasMoreNotifs`. While loading, set `isLoadingMore` to `true` to show a spinner on the button. Add log: `📢 [Dashboard] Load More: appended ${newItems.length} items, total now ${allNotifications.length}`.
  - [x] 5.6 **Implement feed filter logic.** Create a `useMemo` or derived variable `filteredNotifications` that filters `allNotifications` based on `feedFilter`:
    - `'all'` → return all.
    - `'homework'` → filter where `n.metadata?.homeworkId` exists.
    - `'tests'` → filter where (`n.metadata?.resultId` exists OR `n.metadata?.testName` exists) AND `n.metadata?.homeworkId` does NOT exist.
    - `'classes'` → filter where `n.metadata?.className` exists OR `n.title` includes "Joined Class".
    Add log when filter changes: `📢 [Dashboard] Feed filter changed to '${feedFilter}', showing ${filteredNotifications.length} of ${allNotifications.length} items`.
  - [x] 5.7 **Build the Layout Grid JSX.** Replace the entire content inside `<AppShell.Main>`. The new structure:
    ```jsx
    <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr 320px', gap: '0', maxWidth: '1400px', margin: '0 auto', minHeight: 'calc(100vh - 70px)' }}>
      {/* Left Sidebar */}
      <aside style={{ ... }}>...</aside>
      {/* Center Column */}
      <main style={{ ... }}>...</main>
      {/* Right Panel */}
      <aside style={{ ... }}>...</aside>
    </div>
    ```
    Use `position: sticky; top: 70px; height: calc(100vh - 70px);` on both sidebars. Center column gets `overflow-y: auto`.
  - [x] 5.8 **Build the Left Sidebar component.** Inside the left `<aside>`, render:
    - App logo/header at the top.
    - **Group 1** links: "Activity Feed", "My Classes", "Recent History". Each is a clickable `<div>` or Mantine `Button` with `variant="subtle"`. On click, set `activeView` to the corresponding value. The active item gets BOTH a `borderLeft: '3px solid var(--mantine-color-blue-6)'` AND `backgroundColor: 'rgba(59, 130, 246, 0.08)'`. Non-active items have no left border and transparent background.
    - A visual separator (thin `<hr>` or Mantine `Divider`).
    - **Group 2** links: "Courses", "Homework", "Library", "Academic Record", "Profile & Settings". Each calls `navigate(route)`. Each shows a small `↗` icon to the right of the label.
    Add log on sidebar click: `📢 [Dashboard] Sidebar: activeView changed to '${view}'`.
  - [x] 5.9 **Build the Center Column.** Inside the center `<main>`, render (in order, top to bottom):
    1. **Join Class Bar** (FR-04): A compact input + button bar. On submit, call `handleJoinClass`. On success, set `joinSuccessMessage` to `"✅ Successfully joined [className]!"` and `setTimeout(() => setJoinSuccessMessage(''), 3000)`. Remove the existing `alert('Successfully joined class!')` call from `handleJoinClass`. Display `joinSuccessMessage` as green text below the input. Display `enrollError` as red text below the input.
    2. **Filter Tabs** (FR-03a): A Mantine `Tabs` component with values `all`, `homework`, `tests`, `classes`. Active tab is the `feedFilter` state. `onChange` sets `feedFilter`.
    3. **Feed List / Classes View / History View** (depending on `activeView`): Wrap in a `<div>` with the transition animation — `transition: 'opacity 200ms ease-out, transform 200ms ease-out'`. When `activeView` changes, briefly set opacity to 0 + translateY(8px), then back to 1 + translateY(0). If `activeView === 'feed'`: render `filteredNotifications` as a list of cards. If `activeView === 'classes'`: render `enrolledClasses` grid. If `activeView === 'history'`: render `studentHistory` cards. Filter tabs should only be visible when `activeView === 'feed'`.
    4. **Load More Button** (at bottom of feed view only): Mantine `Button`, `variant="light"`, `fullWidth`. Visible only when `hasMoreNotifs && activeView === 'feed'`. On click, call `handleLoadMore`. Shows a `Loader` spinner when `isLoadingMore` is true.
    5. **Empty state** (FR-08): If `allNotifications.length === 0 && enrolledClasses.length === 0`, show the large Join Class card + public sessions list fallback.
  - [x] 5.10 **Build each Feed Item card.** Each notification card renders:
    - Left: A colored `ThemeIcon` based on `notification.type` (reuse the `getIcon()` and `getColor()` pattern already in `NotificationPanel.tsx`).
    - Middle: Title (bold), Message (dimmed), relative time string (use a helper: `new Date(notification.createdAt).toLocaleString()` or a `timeAgo()` utility).
    - Right: If `notification.link` exists, the entire card is clickable. On click: call `markNotificationAsRead(user.uid, notification.id)` (non-blocking, fire-and-forget), then `navigate(notification.link)`. Add log: `📢 [Dashboard] Feed item clicked: ${notification.id}, navigating to ${notification.link}`.
  - [x] 5.11 **Build the Right Panel.** Inside the right `<aside>`, render:
    1. **"Up Next" section** (FR-06): Header text "Up Next". Map `teacherAssignments` sorted by `dueDate` ascending. Each item: homework title, due date string, and a "View" link to `/student/homework`. If `item.dueDate < Date.now()`, render a red `Badge` with "Overdue" and color the date text red. If `teacherAssignments.length === 0`, show "No upcoming deadlines 🎉".
    2. **"Live Now / HOT" section** (FR-07): Header text "Live Now 🔥". Map `publicSessions` sorted by `playerCount` descending, then `createdAt` ascending as tiebreaker. `.slice(0, 5)` to cap at 5. Each item: session name, `Badge` with player count, and a "Join" button. If `publicSessions.length === 0`, do NOT render this section at all (hide both heading and container).
  - [x] 5.12 **Implement the center column loading spinner** (FR-05). When `isLoading` is true AND `activeView !== 'feed'` (feed has its own empty state), show a centered `Loader` component from Mantine. This covers the case where the user clicks "My Classes" before `enrolledClasses` has been fetched.

---

### Phase D: Mobile & Cleanup

- [x] 6.0 Mobile Responsiveness — Off-canvas sidebars and mutual exclusion (FR-10)
  - [x] 6.1 **Add CSS media query.** At viewport `< 768px`, both the left and right `<aside>` elements get `display: none`. The center `<main>` gets `gridColumn: '1 / -1'` (spans full width). Approach: use inline styles with a `useMediaQuery` hook from Mantine (`@mantine/hooks`) or a simple `window.innerWidth` check in a `useEffect`.
  - [x] 6.2 **Build the mobile header bar.** On mobile only, render a fixed top bar with:
    - Left: Hamburger icon (☰) using `IconMenu2` from `@tabler/icons-react`. `onClick`: `setShowMobileLeft(prev => !prev); setShowMobileRight(false);` (mutual exclusion).
    - Center: App name text.
    - Right: Calendar icon using `IconCalendarEvent` from `@tabler/icons-react`. `onClick`: `setShowMobileRight(prev => !prev); setShowMobileLeft(false);` (mutual exclusion).
    Add log: `📢 [Dashboard] Mobile: toggled ${side} sidebar, closed other.`
  - [x] 6.3 **Build mobile overlay for Left Sidebar.** When `showMobileLeft` is true, render the Left Sidebar content in a `position: fixed; top: 0; left: 0; width: 280px; height: 100vh; z-index: 1000; background: white;` container with a slide-in animation (`transform: translateX(0)`). When hidden: `transform: translateX(-100%)`.
  - [x] 6.4 **Build mobile overlay for Right Panel.** Same pattern but from the right side. `position: fixed; top: 0; right: 0; width: 320px;`. Slide-in from right.
  - [x] 6.5 **Build the backdrop.** When either sidebar is open, render a semi-transparent backdrop `<div>` (`position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 999`). `onClick`: close both sidebars (`setShowMobileLeft(false); setShowMobileRight(false)`).
  - [x] 6.6 **Test mutual exclusion:** Verify that opening the left sidebar closes the right, and vice versa. Verify backdrop tap closes the open sidebar.

- [x] 7.0 Teacher Invite Migration — Remove from dashboard, add to Profile page (FR-09)
  - [x] 7.1 **Remove `showTeacherInvite` state** and its `setShowTeacherInvite` from `StudentDashboardPage.jsx`. Remove the `useState(false)` declaration on line 30.
  - [x] 7.2 **Remove all Teacher Invite JSX** from `StudentDashboardPage.jsx`. Search for all references to `showTeacherInvite` in the JSX — there is a conditional block that renders the invite card and a toggle button. Remove the entire block.
  - [x] 7.3 **Add Teacher Invite card to Profile page.** Locate the profile page component (at `/profile` route). Add a small Mantine `Card` below the main profile info section with title "Connect with a Teacher" and the invitation form/link. This is a low-prominence card — match the existing profile page styling.
  - [x] 7.4 **Verify no broken references.** Search the entire codebase for `showTeacherInvite` to ensure no other files reference this state. If found, remove those references.

---

### Phase E: Verification & Diagnostics

- [x] 8.0 Final Verification and Diagnostic Logging Audit
  - [x] 8.1 **Run all existing tests:** `npx jest` — ensure zero regressions from the notification service refactor and path migration.
  - [x] 8.2 **Manual smoke test — Feed:** Log into a student account. Verify the Activity Feed loads 20 items. Click "Load More" — verify 20 more append. Verify no scroll position jump. Check browser console for `📢 [Dashboard]` and `📢 [NotificationService]` diagnostic logs.
  - [x] 8.3 **Manual smoke test — Filter tabs:** Click each filter tab (All, Homework, Tests, Classes). Verify items change. Verify "Load More" still works across filters. Check console for `📢 [Dashboard] Feed filter changed` log.
  - [x] 8.4 **Manual smoke test — Join Class:** Enter a valid class code, click Join. Verify inline success message appears and auto-dismisses after 3 seconds. Verify NO browser `alert()` appears. Check console for `📢 [ClassManager] Feed notification sent` log.
  - [x] 8.5 **Manual smoke test — Notification triggers:** Complete a test as a student. Check the Activity Feed — a "Test Complete" notification should appear. Join a class — a "Joined Class" notification should appear. Check console for `📢 [TestResults]` and `📢 [ClassManager]` logs.
  - [x] 8.6 **Manual smoke test — NotificationBell:** Click the bell icon in the header. Verify max 5 items shown. Verify "See All Activity →" link at the bottom. Click it — verify navigation to dashboard feed view. Check console for `📢 [NotificationBell]` and `📢 [NotificationPanel]` logs.
  - [x] 8.7 **Manual smoke test — Right Panel:** Verify "Up Next" shows assignments sorted by due date. Verify overdue items have red badge. Verify "Live Now" shows public sessions sorted by player count, max 5. Verify empty states display correctly.
  - [x] 8.8 **Manual smoke test — Mobile:** Resize browser to < 768px. Verify sidebars disappear. Tap hamburger — left sidebar slides in. Tap calendar icon — right panel slides in AND left closes. Tap backdrop — sidebar closes.
  - [x] 8.9 **Manual smoke test — Teacher Invite:** Navigate to `/profile`. Verify "Connect with a Teacher" card is present. Navigate to dashboard — verify NO teacher invite banner appears anywhere.
  - [x] 8.10 **Console log audit:** Open browser console and navigate through all features. Confirm all expected `📢` diagnostic logs appear with correct module names and data. Confirm NO `console.error` or Firebase permission denied errors appear.
