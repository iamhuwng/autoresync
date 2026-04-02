---
id: b8qpe0
title: 'Fix: Prevent stale session notification navigation to waiting lobby'
status: done
priority: high
labels:
  - bugfix
  - session
  - navigation
  - security
createdAt: '2026-04-02T00:08:55.090Z'
updatedAt: '2026-04-02T00:09:03.152Z'
timeSpent: 0
---
# Fix: Prevent stale session notification navigation to waiting lobby

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prevent students from accessing the waiting lobby for sessions that have been ended or deleted via stale notification cards on the dashboard. Two-layer fix: (1) Pre-navigation validation in StudentDashboardPage via Firebase get(), (2) Defense-in-depth status guard in StudentWaitingRoomPage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implementation (2026-04-02)

### Files Changed:
1. `src/pages/StudentDashboardPage.jsx`
   - Added Firebase `database`, `ref`, `get` imports
   - Added `useCallback` import
   - Added `sessionUnavailableMsg` state for toast feedback
   - Made `handleNotificationClick` async
   - Added pre-navigation `get()` check against `game_sessions/{sessionCode}`
   - Added inline toast UI with auto-dismiss

2. `src/pages/StudentWaitingRoomPage.jsx`
   - Added defense-in-depth status check in `onValue` listener
   - Redirects to `STUDENT_DASHBOARD` (not LOGIN) for ended sessions

### Documentation Updated:
- `documentation/rules/navigation.md` — Added Rule 4
- `documentation/architecture/student-dashboard-architecture.md` — Added Session Navigation Guards section
- `documentation/integration-safety-rules.md` — Added Rule 4 to index
- `.knowns/docs/patterns/session-navigation-guard-pattern.md` — New pattern doc
<!-- SECTION:NOTES:END -->

