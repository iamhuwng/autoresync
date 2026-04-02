---
title: Session Navigation Guard Pattern
description: 'Pattern for preventing navigation to session pages from stale/cached references. Two-layer guard: pre-navigation Firebase get() + in-page status check.'
createdAt: '2026-04-02T00:08:55.109Z'
updatedAt: '2026-04-02T00:08:55.109Z'
tags:
  - session
  - navigation
  - security
  - guard
  - firebase
---

# Session Navigation Guard Pattern

## Problem (2026-04-01)

Students could access the waiting lobby by clicking notification cards on the dashboard even after the teacher had ended or deleted the session. The notification metadata contained a `sessionCode` that was valid at creation time but pointed to a session that no longer existed or had moved to `completed` status.

## Root Cause

`handleNotificationClick` in `StudentDashboardPage.jsx` directly called `navigateTo('STUDENT_WAITING', ...)` when a `sessionCode` was present in notification metadata, without checking the session's current state in RTDB.

`StudentWaitingRoomPage.jsx` redirected to LOGIN when `sessionData` was null (deleted), but did not handle `completed` sessions — it only checked for active transitions (`waiting` → `in-progress`).

## Solution: Two-Layer Guard

### Layer 1: Pre-Navigation Check (Dashboard)

In `handleNotificationClick`, before navigating:

```js
const snapshot = await get(ref(database, `game_sessions/${sessionCode}`));
if (!snapshot.exists()) {
  // Session deleted — show toast, abort
  return;
}
if (!['waiting', 'in-progress'].includes(snapshot.val().status)) {
  // Session ended — show toast, abort
  return;
}
// Safe to navigate
```

**Key decisions:**
- Uses one-shot `get()` instead of `onValue` — we only need a point-in-time check
- On network error, allows navigation as fallback (waiting room has its own guards)
- Toast auto-dismisses after 5 seconds
- Tracked via `sessionNotificationBlocked` action for observability

### Layer 2: Defense-in-Depth (Waiting Room)

In `StudentWaitingRoomPage.jsx`, inside the `onValue` listener:

```js
if (sessionData.status && !['waiting', 'in-progress'].includes(sessionData.status)) {
  navigateTo('STUDENT_DASHBOARD', {}, { reason: 'session_ended', replace: true });
  return;
}
```

**Key decisions:**
- Redirects to `STUDENT_DASHBOARD` (not LOGIN) since the student is authenticated
- Uses `replace: true` to prevent back-button loops
- Acts as a safety net for race conditions between dashboard check and page mount

## When This Pattern Applies

Use this pre-navigation validation when navigation to a session page is triggered from:
- Stored notification metadata
- Cached links
- Deep links with session codes
- Any non-real-time source

**Exception:** Real-time RTDB listeners (e.g., `onValue` in `StudentRightRail`) do NOT need this check — their data is inherently current.

## Files Modified

- `src/pages/StudentDashboardPage.jsx` — async `handleNotificationClick` with `get()` validation
- `src/pages/StudentWaitingRoomPage.jsx` — defense-in-depth status guard in `onValue` listener

## Related Documentation

- `documentation/rules/navigation.md` (Rule 4)
- `documentation/architecture/student-dashboard-architecture.md` (Session Navigation Guards section)
- `documentation/integration-safety-rules.md` (Rule 4 in Quick Trigger Table)
