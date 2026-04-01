# 🔐 Security Audit Report — 2026-03-01

> **Scope:** Full codebase scan across `src/`, `cloudflare/`, `r2-backup-worker/`, `functions/`, Firestore rules, RTDB rules, `package.json`, and `.env`  
> **Auditor:** Automated deep-scan via Antigravity  
> **Date:** 2026-03-01T20:53+07:00

---

## Executive Summary

| Category | Severity | Findings |
|----------|----------|----------|
| 1. Database Security (RLS / Rules) | 🟡 MEDIUM | 8 findings |
| 2. Missing Server-Side Validation | 🔴 HIGH | 6 findings |
| 3. Outdated/Hallucinated Packages | 🟡 MEDIUM | 2 findings |
| 4. Authentication Middleware Gaps | 🔴 HIGH | 5 findings |
| **Total Findings** | | **21 findings** |

## Status Update — 2026-03-31

This file remains a historical audit snapshot from `2026-03-01`. Several findings in section 2 changed state on `2026-03-31`:

- `Finding 2.1` is remediated. The shipped `AdminLoginModal` client-side admin flow was removed.
- `Finding 2.2` is remediated in active `src/` code. The browser `sessionStorage.isAdmin` flag is no longer trusted by the live admin entry flow or the live teacher waiting-room route, and the stale logout cleanup references were removed from active source files.
- `Finding 2.5` is only partially improved. Browser-exposed admin credentials were removed with the deletion of `VITE_ADMIN_USERNAME` and `VITE_ADMIN_PASSWORD`, but browser-exposed AI key risk remains open until those calls move behind a trusted backend boundary.

For the concrete March 31, 2026 closeout covering both the Firebase custom-domain auth failure and the client-side admin remediation, see `documentation/firebase-custom-domain-auth-security-closeout-2026-03-31.md`.

---

## 1. Database Security (RLS / Row-Level Security)

> [!NOTE]
> Firebase uses Security Rules instead of traditional SQL RLS. This section audits both **Firestore** and **RTDB** rules.

### ✅ What's Working Well

- **Default deny** in Firestore (`allow read, write: if false` at root) — good baseline
- Owner-enforced create/update/delete on `drafts`, `thcs_drafts`, `thcs_library`, `thcs_templates`, `writing_drafts`, `homework_assignments`, `homework_submissions` — properly validates `request.resource.data.ownerId == request.auth.uid` on creates
- RTDB `users/{uid}` — properly scoped to `$uid === auth.uid`
- RTDB role-validate rules on `role` and `status` fields prevent self-promotion

### 🔴 Finding 1.1: CRITICAL — `guest_results` allows UNAUTHENTICATED writes

**File:** [database.rules.json#L375](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/database.rules.json#L375)

```json
"guest_results": {
    ".read": "auth != null",
    "$guestName": {
        ".write": true,
    }
}
```

**Impact:** Any unauthenticated user can write arbitrary data to `guest_results/{anything}`. This is a data poisoning vector — an attacker can flood the node with garbage data or overwrite existing guest results.

**Fix:** At minimum, add `.validate` rules to restrict the data shape. If guest access is intentional, add rate-limiting via Cloud Functions or restrict to valid session codes.

---

### 🟡 Finding 1.2: Overly permissive write rules — `game_sessions` (RTDB)

**File:** [database.rules.json#L251-258](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/database.rules.json#L251-L258)

```json
"game_sessions": {
    ".read": "auth != null",
    ".write": "auth != null"
}
```

**Impact:** ANY authenticated user (student, teacher) can create, modify, or delete ANY game session. A student could delete another teacher's session or modify session data mid-game.

---

### 🟡 Finding 1.3: Overly permissive write rules — `quizzes` (RTDB)

**File:** [database.rules.json#L260-267](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/database.rules.json#L260-L267)

```json
"quizzes": {
    ".read": "auth != null",
    ".write": "auth != null"
}
```

**Impact:** Any authenticated user can create/modify/delete any quiz. Students shouldn't be able to write quiz data.

---

### 🟡 Finding 1.4: Overly permissive write rules — `history` (RTDB)

**File:** [database.rules.json#L307-313](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/database.rules.json#L307-L313)

```json
"history": {
    ".read": "auth != null",
    ".write": "auth != null"
}
```

**Impact:** Any authenticated user can modify any user's history records.

---

### 🟡 Finding 1.5: `sessions` (Firestore) — no ownership enforcement

**File:** [firestore.rules#L38-42](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/firestore.rules#L38-L42)

```
match /sessions/{sessionId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```

**Impact:** Students can modify session data they don't own — potential cheating vector.

---

### 🟡 Finding 1.6: `writing_submissions` (Firestore) — overly broad write

**File:** [firestore.rules#L231-236](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/firestore.rules#L231-L236)

```
match /writing_submissions/{submissionId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
  allow delete: if false;
}
```

**Impact:** Any authenticated user can create submissions under another student's name, or modify grading data on existing submissions.

---

### 🟡 Finding 1.7: `game_sessions` (Firestore) — same issue as RTDB mirror

**File:** [firestore.rules#L152-155](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/firestore.rules#L152-L155)

---

### 🟡 Finding 1.8: Several RTDB nodes with broad read (data leaking)

The following RTDB nodes allow any authenticated user to read ALL records, not just their own:
- `student_requests`, `course_requests`, `enrollment_requests` — all visible to all users

---

## 2. Missing Server-Side Validation (Trusting Frontend)

### 🔴 Finding 2.1: CRITICAL — Admin login uses client-side env var comparison

**File:** [AdminLoginModal.jsx#L22-38](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/components/AdminLoginModal.jsx#L22-L38)

```jsx
const adminUsername = import.meta.env.VITE_ADMIN_USERNAME;
const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;

if (values.username === adminUsername && values.password === adminPassword) {
    sessionStorage.setItem('isAdmin', 'true');
    navigate('/sessions');
}
```

**Impact:** The `VITE_` prefix means these credentials are **embedded in the production JavaScript bundle** and visible to ANYONE who opens browser DevTools. The password is literally `admin` in `.env`. Any user can run `sessionStorage.setItem('isAdmin', 'true')` in their browser console.

---

### 🔴 Finding 2.2: CRITICAL — `isAdmin` session flag used for authorization decisions

**Files using `sessionStorage.getItem('isAdmin')`:**
- `sessionService.ts`, `draftCloudService.ts` (x4), `TeacherWaitingRoomPage.jsx`, `QuizPage.jsx`, `LoginPage.old.jsx`

**Impact:** A client-side `sessionStorage` value is being used to make authorization decisions. Since the user fully controls `sessionStorage`, this is trivially bypassable. The `draftCloudService.ts` uses it to decide query scope — a student could see ALL drafts.

---

### 🟡 Finding 2.3: No Zod/schema validation on service layer inputs

**Scan result:** Zero uses of `.parse()` or `.safeParse()` in `src/services/` directory.

Most service functions accept raw objects from the frontend and pass them directly to Firebase writes with no validation.

---

### 🟡 Finding 2.4: `registerWithEmail` accepts arbitrary role from frontend

**File:** [AuthContext.jsx#L336](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/contexts/AuthContext.jsx#L336)

```jsx
const registerWithEmail = async (email, password, role = 'student', ...) => {
    const newProfile = { role: role }; // Frontend-controlled!
    await set(userRef, newProfile);
};
```

**Impact:** A new user calling `registerWithEmail` with `role='teacher'` would succeed because RTDB validate rules only block role changes when `data.exists()`.

---

### 🔴 Finding 2.5: CRITICAL — ALL API keys exposed in client-side JS bundle

**File:** `.env` — All secrets use the `VITE_` prefix:
- `VITE_GEMINI_API_KEY_1`, `VITE_GEMINI_API_KEY_3` — Google Gemini keys
- `VITE_GROQ_API_KEY` — Groq API key
- `VITE_GOOGLE_API_KEY` — Google API key
- `VITE_ADMIN_USERNAME` / `VITE_ADMIN_PASSWORD` — hardcoded `admin`/`admin`

> [!IMPORTANT]
> The `.env` file IS in `.gitignore` ✅, but the `VITE_` prefix causes values to be embedded in the built JavaScript deployed to Firebase Hosting.

---

### 🟡 Finding 2.6: XOR "encryption" for API keys is obfuscation, not security

**File:** [api-keys.service.ts#L72](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/api-keys.service.ts#L72)

The encryption key `mstu-kahoot-api-keys-2026` is hardcoded in the JS bundle, making it trivially reversible.

---

## 3. Outdated / Hallucinated Packages

### 🟡 Finding 3.1: `react-floating-action-button` — abandoned (7+ years old)

**File:** [package.json#L60](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/package.json#L60)

Version `^1.0.5` — last published ~7 years ago. Not imported anywhere in `src/` (unused dependency).

**Fix:** Remove from `package.json`.

---

### 🟡 Finding 3.2: Mixing Bootstrap + Mantine (Mantine is banned per rule #15)

The project has BOTH `bootstrap`+`react-bootstrap` AND `@mantine/core`+`@mantine/form`+`@mantine/hooks`+`@mantine/notifications`. Per integration-safety-rules #15, Mantine is banned.

---

## 4. Authentication Middleware Gaps

### ✅ What's Working Well

- `useSecureService` hook properly builds `SecurityAuthContext` with role, assignments, blocked status
- `securityMiddleware.ts` provides `validateAccess`, `validateOwnership`, `assertAccess`
- `AuthContext.jsx` has real-time `forceReauth` and `blocked` status monitoring
- `r2-backup-worker` properly verifies admin Firebase tokens on ALL `/api/*` routes

### 🔴 Finding 4.1: CRITICAL — No `PrivateRoute`/route-level auth guard in production

`PrivateRoute` exists in tests but the actual component was apparently deleted. **Any unauthenticated user can navigate to any page** by typing the URL directly.

---

### 🔴 Finding 4.2: Security middleware only used in ONE service file

`validateAccess`/`assertAccess` are imported in ONLY `userService.ts` (2 calls). The other **50+ service files** have ZERO security middleware calls.

---

### 🟡 Finding 4.3: Cloudflare worker (`cloudflare/worker.js`) has NO authentication

```js
// No auth check — just processes POST requests
if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
}
```

With `Access-Control-Allow-Origin: '*'`, ANYONE can generate presigned upload URLs for your R2 bucket or move files.

---

### 🟡 Finding 4.4: CORS `Access-Control-Allow-Origin: *` on all workers

Both `cloudflare/worker.js` and `r2-backup-worker` use wildcard CORS. Best practice is to restrict to your Firebase Hosting domain.

---

### 🟡 Finding 4.5: Course/class access middleware has TODO stubs — always returns `allowed: true`

**File:** [securityMiddleware.ts#L296-345](file:///c:/Users/Sanctuary/Desktop/Homework%20App/kahoot/src/services/securityMiddleware.ts#L296-L345)

```ts
const validateCourseAccess = async (...) => {
    if (authContext.userRole === 'student') {
        // TODO: Check enrollment
        return { allowed: true };  // Always passes
    }
};
```

---

## Prioritized Action Items

| Priority | Finding | Effort | Impact |
|----------|---------|--------|---------|
| 🔴 P0 | 2.1+2.2: Remove `AdminLoginModal` client-side auth. Use Firebase Auth roles. | Medium | Eliminates admin hijack |
| 🔴 P0 | 2.5: Move AI API keys to Cloud Function/Worker proxy. Remove `VITE_` prefix. | High | Stops API key theft |
| 🔴 P0 | 4.1: Create and enforce `PrivateRoute` route guard component | Medium | Prevents URL-direct bypass |
| 🔴 P0 | 4.3: Add Firebase token verification to `cloudflare/worker.js` | Low | Prevents unauthorized upload |
| 🔴 P1 | 1.1: Fix `guest_results` unauthenticated write | Low | Prevents data poisoning |
| 🟡 P1 | 1.2-1.4: Tighten RTDB rules for `game_sessions`, `quizzes`, `history` | Medium | Prevents cross-user tampering |
| 🟡 P1 | 1.5-1.7: Tighten Firestore rules for `sessions`, `writing_submissions` | Medium | Prevents student cheating |
| 🟡 P2 | 2.3: Add Zod validation schemas to service layer | High | Defense-in-depth |
| 🟡 P2 | 2.4: Remove `role` parameter from `registerWithEmail` | Low | Prevents role escalation |
| 🟡 P2 | 4.2: Integrate security middleware into all service files | High | Defense-in-depth |
| 🟢 P3 | 3.1: Remove unused `react-floating-action-button` | Trivial | Clean dependencies |
| 🟢 P3 | 3.2: Remove Mantine packages per rule #15 | Medium | Rule compliance |
| 🟢 P3 | 4.4: Restrict CORS to Firebase domain | Low | Defense-in-depth |
| 🟢 P3 | 4.5: Implement course/class enrollment checks | Medium | Proper access control |

---

## Summary

The project has a **solid foundation** — Firebase Auth, real-time block detection, force-reauth, RBAC role hierarchy, and security middleware exist. The RTDB rules show thoughtful hardening (especially the 2026-02-27 security fixes).

However, there are **critical gaps** where the frontend is trusted as the single source of truth:
1. **Admin auth is entirely client-side** — bypassed with one console command
2. **API keys are in the JS bundle** — extractable by anyone
3. **No route guards** — pages accessible by URL
4. **Security middleware exists but is only used in 1 of 50+ service files**
5. **Several database nodes have overly permissive write rules**

The most urgent fixes (P0) can be completed in 2-3 focused sessions and would dramatically improve the security posture.
