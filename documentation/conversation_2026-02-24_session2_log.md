# Conversation Log — 2026-02-24

## Session: Implementing Side-Effect Prevention & Integration (continuation of PRD-0026)

---

## 1. Side-Effect Prevention (Task 6.0)

### 6.1 — Created `withRestoreGuard` utility
- **File:** `src/services/restoreGuard.ts`
- Created a higher-order function that wraps async service functions with a restore flag check
- Reads `system_flags/restore_in_progress` from RTDB
- Includes a 5-second cache to minimize RTDB reads during rapid service calls
- Pattern: `withRestoreGuard('ServiceName', safeReturn)(originalFn)`
- Exports `clearRestoreGuardCache()` for post-restore cleanup

### 6.2 — Wrapped notificationService.ts
- Wrapped `createNotification` with `withRestoreGuard('Notification', { success: true, notificationId: undefined })`
- Wrapped `createBulkNotifications` with `withRestoreGuard('BulkNotification', { success: true, notificationIds: [] })`
- Both return safe no-op results during restore (no actual writes)

### 6.3 — Wrapped badgeService.ts
- Wrapped `checkAndAwardBadges` with `withRestoreGuard('Badge', [])`
- Returns empty badge array during restore (no badges awarded)

### 6.4 — Wrapped studentStreakService.ts
- Wrapped `recordActivity` with `withRestoreGuard('Streak', { ...dummyStreakData })`
- Returns a zeroed-out StreakData object during restore

---

## 2. Admin UI — Backup Page (Task 5.0)

### 5.1 — Created AdminBackupPage.css
- **File:** `src/pages/AdminBackupPage.css`
- Glassmorphism cards, gradient buttons, animated progress bar
- Restore preview modal with diff grid
- Toast notifications with slide-in animation
- Color coding: green(#10b981)=success, red(#ef4444)=failed, amber(#f59e0b)=in-progress, blue(#3b82f6)=info
- Responsive breakpoints at 768px

### 5.2/5.3/5.4/5.5 — Created AdminBackupPage.tsx
- **File:** `src/pages/AdminBackupPage.tsx`
- Full admin page with AdminLayout integration
- **Dashboard Cards:** System health, total backups, last backup time, last backup size
- **Connectivity Section:** R2 primary, R2 backup, Firebase status with animated dots
- **Actions:** Manual backup trigger with async progress polling (3s interval), refresh button
- **Backup Progress:** Animated progress bar with phase text and current node
- **History Table:** Responsive table with backup ID, date, trigger type, status badges, size, Firestore inclusion, download/restore actions
- **Restore Preview Modal:** Diff grid (category, backup count, current count, difference, status), GDPR exclusion count, Firestore merge info, warnings
- **Toast Notifications:** Success/error/info toasts with auto-dismiss (5s)

---

## 3. Integration & Routing (Task 7.0)

### 7.1 — Created backupService.ts (Frontend API Client)
- **File:** `src/services/backupService.ts`
- All methods use Firebase ID token auth via `getIdToken()`
- Worker URL from `VITE_BACKUP_WORKER_URL` env var
- API methods: triggerBackup, getBackupStatus, getBackupHistory, downloadBackup, getHealthStatus, getMediaDelta, downloadMediaFile, getRestorePreview, executeRestore, getRestoreStatus

### 7.2 — Added sidebar entry
- **File:** `src/components/navigation/AdminSidebar.tsx`
- Added `{ id: 'backup', label: 'Backup & Recovery', icon: '🛡️' }` to System section

### 7.3 — Added route constant
- **File:** `src/constants/routes.ts`
- Added `ADMIN_BACKUP: '/admin/backup'` to ROUTES object

### 7.4 — Updated all 7 admin pages with backup route
- Added `backup: 'ADMIN_BACKUP'` to `handleSidebarNavigate` in:
  - AdminDashboardPage.tsx
  - AdminMaterialsPage.tsx
  - AdminClassesPage.tsx
  - AdminCoursesPage.tsx
  - AdminSessionsPage.tsx
  - AdminSettingsPage.tsx
  - AdminUserManagementPage.jsx

### 7.6 — Added route in App.jsx
- **File:** `src/App.jsx`
- Added lazy import for AdminBackupPage
- Added `/admin/backup` route with `PrivateRoute allowedRoles={['super_admin']}`

---

## Files Created
1. `src/services/restoreGuard.ts` — withRestoreGuard middleware
2. `src/services/backupService.ts` — Frontend API client for worker
3. `src/pages/AdminBackupPage.css` — Backup page styles
4. `src/pages/AdminBackupPage.tsx` — Backup admin page

## Files Modified
1. `src/services/notificationService.ts` — Added restore guard to createNotification, createBulkNotifications
2. `src/services/badgeService.ts` — Added restore guard to checkAndAwardBadges
3. `src/services/studentStreakService.ts` — Added restore guard to recordActivity
4. `src/components/navigation/AdminSidebar.tsx` — Added backup nav item
5. `src/constants/routes.ts` — Added ADMIN_BACKUP route
6. `src/App.jsx` — Added AdminBackupPage lazy import & route
7. `src/pages/AdminDashboardPage.tsx` — Added backup to pageRoutes
8. `src/pages/AdminMaterialsPage.tsx` — Added backup to pageRoutes
9. `src/pages/AdminClassesPage.tsx` — Added backup to pageRoutes
10. `src/pages/AdminCoursesPage.tsx` — Added backup to pageRoutes
11. `src/pages/AdminSessionsPage.tsx` — Added backup to pageRoutes
12. `src/pages/AdminSettingsPage.tsx` — Added backup to pageRoutes
13. `src/pages/AdminUserManagementPage.jsx` — Added backup to pageRoutes
14. `documentation/tasks/tasks-0026-prd-backup-disaster-recovery-system.md` — Marked tasks 5.1-5.5, 6.0-6.4, 7.0-7.4, 7.6 as complete

## Remaining Tasks (from task list)
- [ ] 7.8 — Environment variable setup (`VITE_BACKUP_WORKER_URL` in `.env`)
- [ ] 7.9 — E2E smoke test (manual, requires worker deployment)

---

## 2. Continuation Session — Completing All Tasks (2026-02-25)

### Phase 1: Critical Gaps — Side-Effect Prevention
- **6.5** — Added `isRestoreInProgress` guard to `homeworkManager.ts createHomework()` — throws error during restore
- **6.6** — Created `src/components/RestoreBanner.tsx` — real-time RTDB listener, fixed yellow banner, z-index 9999
  - Integrated in `src/App.jsx` — placed inside `<BrowserRouter>` above `<Suspense>`
- **restoreGuard.ts** — Exported `isRestoreInProgress` for direct use (was previously private)

### Phase 2: Remaining UI Features (5.6-5.11)
- **5.6** — Media Backup Flow: File System Access API with `showDirectoryPicker()` + fallback with `<a download>` tags, batched 3 concurrent downloads
- **5.7** — Full Restore Flow: scope selection with Select All/Deselect All, notifications unchecked by default, Smart Auto / Per-Entity mode radio buttons
- **5.8** — Media Status section handled via health endpoint
- **5.9** — Wake Lock: `acquireWakeLock()` / `releaseWakeLock()` with `navigator.wakeLock.request('screen')`, graceful fallback, active warning banner
- **5.10** — Settings section: read-only Auto-Backup, Schedule (with computed next Monday), Retention
- **5.11** — Notifications display: existing toast system reused for backup notifications

### Phase 2: Integration Fixes
- **7.5** — Verified `useNavigation.ts` auto-handles ADMIN_BACKUP via RouteName type — no code change needed
- **7.7** — `routeSecurity.ts` already existed — added missing admin routes including `/admin/backup`

### Phase 3: Compile Check
- **Main app**: `npx tsc --noEmit --skipLibCheck` → **0 new errors** (1 pre-existing error in `Academic RecordPage.tsx`)
- **Worker**: `npx tsc --noEmit` → **0 errors** (fixed `Zip.push()` → `Zip.add()` — fflate API correction)

### Files Created
1. `src/components/RestoreBanner.tsx` — System-wide restore maintenance banner

### Files Modified
1. `src/services/restoreGuard.ts` — Exported `isRestoreInProgress`
2. `src/services/homeworkManager.ts` — Added restore guard to `createHomework()`
3. `src/App.jsx` — Imported and rendered `RestoreBanner`
4. `src/pages/AdminBackupPage.tsx` — Added media backup, scope selection, mode selection, wake lock, settings section
5. `src/config/routeSecurity.ts` — Added all admin routes including backup
6. `r2-backup-worker/src/utils/zip.ts` — Fixed `Zip.push()` → `Zip.add()`
7. `documentation/tasks/tasks-0026-prd-backup-disaster-recovery-system.md` — Marked all tasks complete

### Task Completion Summary
| Category | Done | Total |
|----------|------|-------|
| 1.0 Infrastructure | 7/7 | ✅ |
| 2.0 Data Backup | 10/10 | ✅ |
| 3.0 Media Backup | 4/4 | ✅ |
| 4.0 Restore System | 6/6 | ✅ |
| 5.0 Admin UI | **11/11** | ✅ |
| 6.0 Side-Effect Prevention | **6/6** | ✅ |
| 7.0 Integration | **7/9** | ⚠️ |
| **Overall** | **51/53** | **96%** |

### Remaining (environment/deploy only)
- [ ] 7.8 — `.env` variable (requires deployed worker URL)
- [ ] 7.9 — E2E smoke test (requires deployed worker)

---

## 3. Deployment & Real-World Debugging (2026-02-25, 01:00–07:55 AM)

After initial code generation was complete, the worker was deployed to Cloudflare and the admin UI was connected. This phase uncovered **multiple critical issues** that only manifest in a real Cloudflare Workers environment — none were caught by `tsc --noEmit` or local testing.

---

### Problem 1: `@aws-sdk/client-s3` Incompatible with Workers

**Symptom:** Worker crashes on first R2 operation with `DOMParser is not defined`.

**Root Cause:** `@aws-sdk/client-s3` depends on Node.js-specific APIs (`DOMParser`, `XMLParser`) that don't exist in the Cloudflare Workers runtime.

**Initial Measure (AI-generated):** Used `@aws-sdk/client-s3` with `S3Client`, `PutObjectCommand`, `GetObjectCommand`, `ListObjectsV2Command`, `HeadObjectCommand` — the standard Node.js S3 SDK.

**Why It Failed:** Cloudflare Workers use the V8 isolate runtime, not Node.js. The AWS SDK's XML parser requires `DOMParser` which is a browser/Node API.

**Counter-Measure (Manual Fix):** Replaced the entire `r2-client.ts` with `aws4fetch` — Cloudflare's officially recommended library for S3-compatible API calls from Workers. `aws4fetch` handles AWS Signature V4 signing natively in the Workers runtime.

**Changes:**
- `r2-client.ts` — Complete rewrite:
  - `S3Client` → `AwsClient` from `aws4fetch`
  - `PutObjectCommand` → raw `fetch()` with `method: 'PUT'`
  - `GetObjectCommand` → raw `fetch()` with `method: 'GET'`
  - `ListObjectsV2Command` → raw `fetch()` with query params (`list-type=2`, `prefix`, `continuation-token`), manual XML parsing via regex (`/<Contents>[\s\S]*?<\/Contents>/g`)
  - `HeadObjectCommand` → raw `fetch()` with `method: 'HEAD'`
  - Removed `isNoSuchKeyError()` helper — replaced with simple `response.status === 404` checks
  - Constructor changes: `S3Client({ region, endpoint, credentials })` → `AwsClient({ accessKeyId, secretAccessKey, service: 's3' })` + manual `baseUrl` construction

**Lesson Learned:** 🔴 Never use `@aws-sdk/*` in Cloudflare Workers. Always use `aws4fetch` or Cloudflare's native R2 bindings.

---

### Problem 2: Firebase Auth — `access_token` Query Param Deprecated

**Symptom:** All RTDB reads return `401 Unauthorized` or `Permission denied`.

**Root Cause:** The AI-generated code used `?access_token=<token>` query parameter for RTDB auth. Google deprecated this method; it now requires OAuth2 Bearer tokens in the `Authorization` header.

**Initial Measure (AI-generated):** `fetch(url + '?access_token=' + token)` for all RTDB calls.

**Why It Failed:** Google Cloud's REST API now rejects query-parameter auth for service accounts. The `access_token` param only works with legacy API keys, not OAuth2 tokens.

**Counter-Measure (Manual Fix):** Changed ALL RTDB fetch calls to use `Authorization: Bearer <token>` header:
```typescript
// BEFORE (broken)
const url = `${env.FIREBASE_DB_URL}/${node}.json?access_token=${token}`;
const res = await fetch(url);

// AFTER (working)
const res = await fetch(`${env.FIREBASE_DB_URL}/${node}.json`, {
    headers: { 'Authorization': `Bearer ${token}` },
});
```

**Files Fixed:**
- `backup/data-backup.ts` — All RTDB reads (shallow discovery + node reads)
- `backup/health.ts` — Health check Firebase connectivity test
- `backup/auto-backup.ts` — Admin notification writes + restore flag reads/writes

**Lesson Learned:** 🔴 Always use `Authorization: Bearer` headers for Firebase REST API with service account tokens. Never use `?access_token=` query params.

---

### Problem 3: Firebase Auth — Custom Claims Don't Exist

**Symptom:** Admin authentication returns `403 Forbidden: super_admin required` even with a valid JWT.

**Root Cause:** The AI-generated auth code expected `role: 'super_admin'` as a custom claim in the Firebase ID token JWT payload. However, this app stores user roles in RTDB (`users/<uid>/role`), NOT in Firebase custom claims. The JWT never contains a `role` field.

**Initial Measure (AI-generated):** `const role = payload.role; if (role !== 'super_admin') return { valid: false }` — checking a JWT claim that doesn't exist.

**Why It Failed:** Firebase custom claims must be explicitly set via the Admin SDK. This app never sets them — roles live in RTDB only.

**Counter-Measure (Manual Fix):** Replaced custom claim check with direct UID comparison against `ADMIN_UID` env var:
```typescript
// BEFORE (broken — role claim doesn't exist in JWT)
const role = (payload as Record<string, unknown>).role;
if (role !== 'super_admin') return { valid: false, error: 'Forbidden' };

// AFTER (working — compare UID against known admin)
if (uid !== env.ADMIN_UID) return { valid: false, error: 'Forbidden' };
```

**Files Fixed:**
- `auth/firebase-auth.ts` — Complete rewrite of role verification logic
- `wrangler.toml` — Set `ADMIN_UID` env var

**Lesson Learned:** 🔴 Before writing auth code, verify WHERE roles are stored. Don't assume custom claims exist unless explicitly confirmed.

---

### Problem 4: Worker 30-Second CPU Timeout

**Symptom:** Manual backup triggers via admin UI, starts processing RTDB nodes, then silently fails at ~30 seconds with no response. Status polling returns stale data.

**Root Cause:** Cloudflare Workers have a **30-second CPU time limit** for paid plans (10s for free). The original `executeDataBackup()` ran all steps sequentially in a single invocation: lock → RTDB read → Firestore read → ZIP → upload → history update. With 20+ RTDB nodes and Firestore collections, this easily exceeded 30 seconds.

**Initial Measure (AI-generated):** Single `executeDataBackup()` function that runs everything in one `ctx.waitUntil()` call.

**Why It Failed:** Each RTDB node read is a separate `fetch()` call (~200-500ms each). With 20 nodes + Firestore discovery + collection reads + ZIP creation + upload, total time was ~45-90 seconds — well over the 30s limit.

**Counter-Measure (Manual Fix):** Refactored the entire backup into a **3-step client-driven pipeline**:

| Step | Function | What It Does | Time Budget |
|------|----------|--------------|-------------|
| 1 | `executeStep1_RTDB()` | Read all RTDB nodes → save to R2 as `steps/<id>/rtdb.json` | ~10-15s |
| 2 | `executeStep2_Firestore()` | Read Firestore collections → save to R2 as `steps/<id>/firestore.json` | ~5-10s |
| 3 | `executeStep3_Finalize()` | Load data from R2 → ZIP → upload → update history | ~5-8s |

**Client-side orchestration:** The `backupService.ts` status poller auto-detects `rtdb_complete` / `firestore_complete` phases and triggers the next step via `POST /api/backup/continue/:backupId`:

```typescript
// Client-side auto-continuation in backupService.getBackupStatus()
if (phase === 'rtdb_complete' && !continuationTriggered.has(key)) {
    continuationTriggered.add(key);
    continueBackup(backupId); // POST /api/backup/continue/:backupId
}
```

**Additional Optimizations:**
- RTDB reads: Changed from sequential to **parallel batches of 5** (`Promise.all(batch.map(...))`)
- Firestore reads: Changed from sequential to **parallel batches of 3**
- Firestore pagination: Increased `pageSize` from 100 to 300
- Removed `sleep(500)` delays between Firestore batches
- Step metadata persisted to R2 between invocations (`steps/<id>/meta.json`)

**Files Fixed:**
- `backup/data-backup.ts` — Complete architectural rewrite (single function → 3 exported step functions)
- `backup/auto-backup.ts` — Updated to call all 3 steps sequentially (auto-backup runs in cron, has 30s per step)
- `index.ts` — Added `/api/backup/continue/:backupId` route + `handleBackupContinue()` handler
- `src/services/backupService.ts` — Added `continueBackup()` + auto-continuation logic in `getBackupStatus()`

**Lesson Learned:** 🔴 Cloudflare Workers have a hard 30s CPU limit. Any operation that might exceed this MUST be split into multiple invocations with intermediate state persisted to R2/KV.

---

### Problem 5: Backup Lock Stale Timeout Too Long

**Symptom:** After a failed backup attempt, subsequent backup triggers fail with "Backup already in progress" for 30 minutes.

**Root Cause:** The lock stale threshold was set to 30 minutes — appropriate for a monolithic backup but far too long for the new 3-step pipeline where each step completes in ~15 seconds.

**Counter-Measure:** Reduced `STALE_THRESHOLD_MS` from 30 minutes to 2 minutes:
```typescript
const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
```

Also added a manual unlock endpoint (`POST /api/backup/unlock`) for emergency recovery.

**Files Fixed:**
- `backup/backup-lock.ts` — Reduced stale threshold
- `index.ts` — Added `/api/backup/unlock` endpoint

---

### Problem 6: Google OAuth `importPKCS8` Failures

**Symptom:** `importPKCS8 failed: Invalid or unsupported PEM` when trying to sign the JWT for Firebase access.

**Root Cause:** When the service account JSON key is stored as a Wrangler secret, newlines in the private key (`\n`) may get escaped or corrupted.

**Counter-Measure:** Added detailed error logging with key prefix preview to diagnose:
```typescript
try {
    privateKey = await importPKCS8(saKey.private_key, 'RS256');
} catch (err) {
    throw new Error(`importPKCS8 failed: ${err.message}. Key starts with: "${saKey.private_key.slice(0, 30)}"`);
}
```

Also added `userinfo.email` scope to the OAuth request (required by some Google APIs).

**Files Fixed:**
- `auth/google-oauth.ts` — Added error diagnostics + email scope

---

### Problem 7: Health Endpoint Swallowing Errors

**Symptom:** Health endpoint returns `{ status: 'ok' }` even when all 3 connectivity checks fail — no way to diagnose what's wrong.

**Counter-Measure:** Added `_errors` field to health response that captures detailed error info for each failed check:
```typescript
result._errors!.backupR2 = err instanceof Error ? err.message : String(err);
result._errors!.backupR2_config = JSON.stringify({
    hasEndpoint: !!env.BACKUP_R2_ENDPOINT,
    endpointLen: env.BACKUP_R2_ENDPOINT?.length,
    // ... etc
});
```

Also added `mediaChain` data to health response for the Media Backup Status UI section.

**Files Fixed:**
- `backup/health.ts` — Added `_errors` and `mediaChain` to health response, cleaned up empty errors before returning
- `index.ts` — Wrapped `handleBackupHealth` in try/catch with `_debug` info

---

### Problem 8: RestoreBanner Cleanup Redundancy

**Symptom:** TypeScript warning about unused `off` import.

**Root Cause:** Firebase v9's `onValue()` returns an unsubscribe function directly. The AI-generated code imported both `off` and used the returned unsubscribe — redundant cleanup.

**Counter-Measure:** Simplified to use only the returned unsubscribe function:
```typescript
// BEFORE
import { ref, onValue, off } from 'firebase/database';
return () => { off(flagRef); if (typeof unsubscribe === 'function') unsubscribe(); };

// AFTER
import { ref, onValue } from 'firebase/database';
return () => { unsubscribe(); };
```

---

### Problem 9: Admin Notification Missing `id` Field

**Symptom:** Notifications written to RTDB but not rendering correctly in the admin UI.

**Counter-Measure:** Added `id: notifId` field to the notification object written to RTDB.

---

### Problem 10: Media Chain UI + Toast Stacking

**Counter-Measure:** User manually added:
1. **Media chain CSS** (`AdminBackupPage.css`): `.media-chain-pills`, `.media-chain-pill.full`/`.delta`, `.media-chain-arrow`, `.media-chain-info`, `.media-chain-stat`
2. **Media chain UI** (`AdminBackupPage.tsx`): Visual pill chain `Full(1) → Delta(2) → Delta(3)...` with chain position, next full backup calculation, last backup date
3. **Toast stacking**: Each toast offset by `bottom: ${2 + idx * 4}rem` to prevent overlap
4. **Media download progress** moved inside main `<div>` (was accidentally placed outside)

---

### Problem 11: `clearStaleRestoreFlag` Not Exported

**Symptom:** `index.ts` tries to import `clearStaleRestoreFlag` from `auto-backup.ts` but it was a private function.

**Counter-Measure:** Changed from `async function` to `export async function` in `auto-backup.ts`. Also hooked it into the router as a fire-and-forget call on every request.

---

### Summary of All Manual Fixes

| # | Problem | Category | Root Cause | Fix |
|---|---------|----------|------------|-----|
| 1 | `@aws-sdk/client-s3` crashes | Runtime Compat | AWS SDK uses DOMParser (not in Workers) | Rewrote with `aws4fetch` |
| 2 | RTDB auth fails | API Deprecation | `?access_token=` param deprecated | Use `Authorization: Bearer` header |
| 3 | Admin auth rejected | Wrong Assumption | Custom claims don't exist in JWT | Compare UID against `ADMIN_UID` env var |
| 4 | 30s timeout kills backup | Architecture | Single-invocation too slow | 3-step client-driven pipeline |
| 5 | Lock stale too long | Config | 30min threshold for 15s operation | Reduced to 2 minutes |
| 6 | OAuth key parsing fails | Secret Management | PEM newlines corrupted | Added diagnostics |
| 7 | Health hides errors | Observability | Errors swallowed by catch blocks | Added `_errors` debug field |
| 8 | RestoreBanner cleanup | Code Quality | Redundant `off()` + `unsubscribe()` | Use only `unsubscribe()` |
| 9 | Missing notification ID | Data Shape | `id` field omitted | Added `id: notifId` |
| 10 | UI polish | UX | Missing chain viz + toast stacking | Manual CSS + JSX additions |
| 11 | Unexported function | Export | `clearStaleRestoreFlag` private | Made `export async function` |

### Files Modified (Manual Session)

**Worker (`r2-backup-worker/`):**
1. `src/utils/r2-client.ts` — Complete rewrite: `@aws-sdk` → `aws4fetch`
2. `src/backup/data-backup.ts` — Architecture rewrite: monolithic → 3-step pipeline
3. `src/backup/auto-backup.ts` — Updated for 3-step API, fixed auth headers, exported `clearStaleRestoreFlag`
4. `src/backup/health.ts` — Added `_errors`, `mediaChain`, Bearer auth
5. `src/backup/backup-lock.ts` — Stale threshold 30min → 2min
6. `src/auth/firebase-auth.ts` — Custom claims → ADMIN_UID check, added logging
7. `src/auth/google-oauth.ts` — Error diagnostics, added email scope
8. `src/index.ts` — Added `/continue`, `/unlock` routes, debug health, stale flag cleanup
9. `wrangler.toml` — Set ADMIN_UID

**Frontend (`src/`):**
10. `src/services/backupService.ts` — Added `continueBackup()`, auto-continuation, debug logging, `mediaChain` type
11. `src/components/RestoreBanner.tsx` — Simplified cleanup (removed `off` import)
12. `src/pages/AdminBackupPage.tsx` — Added `mediaChain` type, media chain UI section, toast stacking, progress section fix
13. `src/pages/AdminBackupPage.css` — Added media chain pill styles

### Lessons Learned (Aggregated)

1. **🔴 Never use `@aws-sdk/*` in Cloudflare Workers** — use `aws4fetch` instead
2. **🔴 Firebase REST API requires `Authorization: Bearer` headers** — `?access_token=` is deprecated
3. **🔴 Don't assume Firebase custom claims exist** — verify where roles are stored first
4. **🔴 Cloudflare Workers have a 30s CPU limit** — split long operations into multiple invocations
5. **🟡 Always add observability (error details) to health endpoints** — silent failures are undebuggable
6. **🟡 Test in the actual runtime environment** — `tsc --noEmit` catches type errors but not runtime API incompatibilities
7. **🟢 Firebase v9 `onValue()` returns its own unsubscribe** — don't also import `off()`
