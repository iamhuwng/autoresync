# Navigation Safety Rules

> Rules for writing navigate() calls, links, redirects, and session entry points.
> **Load this file when:** writing any `navigate()`, `<Link>`, redirect URL, or notification link.

---

## Rule 1 — Route Registry Validation

**Trigger:** Writing any navigation path, redirect URL, notification link, or `navigate()` call.

**Why it exists:**
On 2026-02-22, a notification stored `link: '/student/join?code=XXXXXX'`. That path was never registered in React Router. Clicking "Start Now" opened a blank page — React Router renders nothing for unregistered paths, silently.

**The rule:**
Before writing any path string, verify it exists in `src/constants/routes.ts`.
Use `buildRoute(routeName, params)` for parameterized routes — never compose paths with string concatenation.

```js
// ❌ WRONG — blank page, no error
link: `/student/join?code=${sessionCode}`
navigate('/student/session/' + code)

// ✅ CORRECT — derived from the ROUTES registry
link: sessionMode === 'test'
  ? buildRoute('STUDENT_TEST', { sessionCode })
  : buildRoute('STUDENT_WAITING', { gameSessionId: sessionCode })
```

**Self-check:** *"Is this exact path string in `src/constants/routes.ts`?"*

---

## Rule 2 — Page-Entry Prerequisite Handshake

**Trigger:** Any code that navigates a student to `/student-test/*` or `/student-wait/*`.

**Why it exists:**
On 2026-02-22, a "Start Now" button called `navigate('/student-test/CODE')` directly. `StudentTestPage` reads player identity from `sessionStorage` (set by `sessionService.setPlayerData`). Without this data, the page failed silently.

**The rule:**
Every code path that navigates into a student test or waiting room MUST call `sessionService.setPlayerData()` first.

```js
// ✅ CORRECT — set player identity BEFORE routing
sessionService.setPlayerData(
  user.uid,
  user.displayName || user.email || 'Student',
  sessionCode
);
navigate(`/student-test/${sessionCode}`);

// ❌ WRONG — navigating without setting player data
navigate(`/student-test/${sessionCode}`);
```

**Canonical reference:** `src/pages/StudentClassDetailPage.jsx` lines 308–316.

**Self-check:** *"Did I call `sessionService.setPlayerData()` before this `navigate()` call?"*

---

## Rule 3 — Pattern-First Research Before New Integration Code

**Trigger:** Implementing any new: navigation handler, notification click handler, auth flow, session entry point, or permission check.

**Why it exists:**
On 2026-02-22, a new notification click handler was written from scratch. The `sessionService.setPlayerData` handshake was missed because the developer did not first search for existing implementations.

**The rule:**
Before writing any new integration code, GREP for existing implementations. Read what exists. Copy the established pattern.

```bash
# Run these before implementing any new navigation or session entry point:
grep -r "navigate.*student-test" src/
grep -r "navigate.*student-wait" src/
grep -r "setPlayerData" src/
```

**Protocol:**
1. Search — find all existing implementations
2. Read — understand how they handle edge cases
3. Copy — replicate the exact pattern
4. Diverge only with a code comment explaining why

**Self-check:** *"Have I searched the codebase for how this is already solved?"*

---

## Rule 4 — Pre-Navigation Session Existence Validation

**Trigger:** Any code that navigates a student to `STUDENT_WAITING` or `STUDENT_TEST` from a stored link, notification, or cached reference (not from a real-time RTDB listener).

**Why it exists:**
On 2026-04-01, students could still reach the waiting lobby by clicking stale notification cards on the dashboard after a teacher had ended or deleted the session. The notification metadata contained a `sessionCode` that was valid when the notification was created but pointed to a session that no longer existed or had moved to `completed` status.

**The rule:**
Before navigating to any session page from a stored/cached reference, perform a one-shot Firebase `get()` to verify:
1. The session node exists in `game_sessions/{sessionCode}`
2. The session status is active (`waiting` or `in-progress`)

If either check fails, abort navigation and show user feedback.

```js
// ✅ CORRECT — validate before navigating
const snapshot = await get(ref(database, `game_sessions/${sessionCode}`));
if (!snapshot.exists()) {
  showError('This session has been deleted.');
  return;
}
const sessionData = snapshot.val();
if (!['waiting', 'in-progress'].includes(sessionData.status)) {
  showError('This session has ended.');
  return;
}
sessionService.setPlayerData(user.uid, name, sessionCode);
navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: '...' });

// ❌ WRONG — navigating from stale metadata without checking
navigateTo('STUDENT_WAITING', { gameSessionId: notification.metadata.sessionCode });
```

**Exception:** Real-time RTDB listeners (e.g., `onValue` in `StudentRightRail` or `StudentWaitingRoomPage`) already receive live session data, so they do not need this pre-check — their data is inherently current.

**Defense-in-depth:** The `StudentWaitingRoomPage` also guards against ended sessions by checking `sessionData.status` in its `onValue` listener and redirecting to `STUDENT_DASHBOARD` if the session is no longer active.

**Canonical reference:** `src/pages/StudentDashboardPage.jsx` `handleNotificationClick` function.

**Self-check:** *"Is this navigation triggered from a cached/stored reference? If so, did I validate the session still exists and is active?"*
