# PRD-0037: Production Reporting & Observability System

**Status:** Draft  
**Created:** 2026-03-18  
**Revised:** 2026-03-18 (Rev 2 — full re-read of all user messages)  
**Author:** Antigravity AI  
**Priority:** High  
**Target Users:** Admin (primary consumer), All users (data source)  
**Primary Focus:** Catching errors with enough logs, data samples, and context to enable immediate fixing

---

## 1. Introduction / Overview

### Problem

The application currently has **zero production visibility**. All error handling, performance monitoring, and diagnostic logging utilities exist exclusively on the client side — errors are caught by `ErrorBoundary`, logged by `DiagnosticLogger`, and tracked by `PerformanceMonitor`, but **none of this data ever leaves the user's browser**. The admin has no way to know:

- What errors users encounter
- Which features are working vs. broken
- How often features are used
- What sequence of actions led to a crash
- Whether a deployed fix actually resolved the issue

The existing codebase has `// TODO: Send to error tracking service` comments in `ErrorBoundary.tsx` and `performance.ts` — these TODOs have been waiting since the code was written.

### Solution

Build a **full-stack observability system** that:

1. **Captures** all errors, feature usage events, and performance metrics on the client
2. **Reports** summaries to Firebase RTDB for real-time admin viewing
3. **Stores** full diagnostic bundles in the existing **backup-storage Cloudflare R2** stack (the second R2 setup, via `r2-backup-worker`), not the user-upload R2, for deep debugging
4. **Displays** everything on a dedicated Admin Reports page with actionable views
5. **Integrates** with Firebase Analytics for long-term trend analysis
6. **Enforces** feature registration through AI rules and a centralized feature registry
7. **Provides** a one-click "Copy for Antigravity" button that packages error context into a ready-to-paste debugging prompt

### Current Scale

- **< 10 users** in testing phase
- **Rarely > 2 concurrent** users
- RTDB free tier (1GB storage, 10GB/month transfer) is more than sufficient
- Full tracking is safe to enable — the kill switch exists for when scale increases

---

## 2. Goals

1. **G1:** Every uncaught error, unhandled promise rejection, and ErrorBoundary crash is automatically reported to RTDB with enough context (logs, data samples, breadcrumbs, stack traces) to diagnose and fix it without needing to reproduce
2. **G2:** Every user-facing feature action (page view, form submit, test start, homework assign, etc.) is tracked and visible on the admin dashboard
3. **G3:** Full diagnostic data (500-entry log history, breadcrumbs, browser info, data samples) is stored in the existing **backup-storage R2** on every error, retrievable from the admin page
4. **G4:** Admin can view feature health, error lists, and live event feeds from a dedicated Admin Reports page
5. **G5:** New features are automatically tracked at the route level; action-level tracking is enforced by AI rules, skills, and a feature registry
6. **G6:** The tracking system MUST auto-keep up with feature changes — route-level tracking is inherently automatic, and AI enforcement rules + skills ensure action-level tracking stays current when features are modified
7. **G7:** The entire reporting system can be toggled off (Full / Errors Only / Off) from Admin Settings
8. **G8:** Admin can copy a COMPLETE pre-formatted error report (including inline diagnostic logs, not just a URL) to clipboard for pasting into AI debugging sessions — one click gives ALL content needed for fixing
9. **G9:** The reporting system NEVER interferes with the actual application — all reporting failures are silently swallowed

---

## 3. User Stories

### Admin Stories

- **US-1:** As an admin, I want to see a dashboard of all features with their error counts and health status (🟢🟡🔴), so I can instantly identify what's broken.
- **US-2:** As an admin, I want to click on a feature and see a chronological list of its errors with filters (severity, date, user), so I can investigate specific issues.
- **US-3:** As an admin, I want to click on an individual error and see the full diagnostic bundle (500 log entries, breadcrumbs, browser info, stack trace), so I can reproduce and fix the bug.
- **US-4:** As an admin, I want a live feed tab showing events as they happen in real-time, so I can monitor testing sessions.
- **US-5:** As an admin, I want to click "Copy for Antigravity" on any error and get a formatted debugging prompt on my clipboard, so I can paste it into AI chat for immediate diagnosis.
- **US-6:** As an admin, I want to toggle reporting between Full / Errors Only / Off from Admin Settings, so I can control the system's overhead.
- **US-7:** As an admin, I want to purge reports older than a configurable threshold (default 30 days), so RTDB doesn't grow unbounded.
- **US-8:** As an admin, I want a "Reports" link/tab on the Admin Dashboard that navigates to the full Reports page, and a back button to return.

### System Stories

- **US-9:** As the system, I want to automatically capture all uncaught errors (window.onerror, unhandledrejection) and ErrorBoundary crashes without any per-feature code.
- **US-10:** As the system, I want to batch events and write them to RTDB every 5 seconds (or when 10 events accumulate), to minimize write frequency.
- **US-11:** As the system, I want to rate-limit identical errors to max 5 per minute per user, to prevent error loops from flooding RTDB.
- **US-12:** As the system, I want to upload full diagnostic bundles to the **backup-storage R2** via the existing backup worker when errors occur, and store the R2 URL in the RTDB error record.
- **US-13:** As the system, I want to implement a circuit breaker: if RTDB writes fail 3 times consecutively, pause all reporting for 5 minutes, then retry.
- **US-14:** As the system, I want to send basic analytics events (page_view, feature usage) to Firebase Analytics alongside the custom RTDB reporting.

### Developer Stories

- **US-15:** As a developer (AI agent), when I create a new page, the route wrapper automatically tracks page views without any manual step.
- **US-16:** As a developer (AI agent), when I create or modify a feature's user-facing actions, I MUST update the feature registry and add `trackAction()` calls, as enforced by the AI rules in AGENTS.md/GEMINI.md/CLAUDE.md.

---

## 4. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLIENT SIDE                              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ ErrorBoundary │  │ window.on    │  │ trackAction()        │   │
│  │ .component    │  │ error +      │  │ (manual per-feature) │   │
│  │ DidCatch()    │  │ unhandled    │  │                      │   │
│  └──────┬───────┘  │ rejection    │  └──────────┬───────────┘   │
│         │          └──────┬───────┘             │               │
│         │                 │                      │               │
│         ▼                 ▼                      ▼               │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   reportingService.ts                      │  │
│  │                                                            │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ Event Queue │  │ Rate Limiter │  │ Circuit Breaker  │  │  │
│  │  │ (memory)    │  │ (5/min/user  │  │ (3 fails → 5min  │  │  │
│  │  │             │  │  per error)  │  │    pause)        │  │  │
│  │  └──────┬──────┘  └──────────────┘  └──────────────────┘  │  │
│  │         │                                                  │  │
│  │         ▼                                                  │  │
│  │  ┌─────────────────┐                                      │  │
│  │  │ Batch Flush     │ ← Every 5s OR 10 events              │  │
│  │  │ (fire-and-forget)│                                     │  │
│  │  └──┬──────────┬───┘                                      │  │
│  │     │          │                                          │  │
│  └─────┼──────────┼──────────────────────────────────────────┘  │
│        │          │                                              │
│        │          │  ┌────────────────────────────────┐          │
│        │          └──│ DiagnosticLogger.getLogsAsJSON()│          │
│        │             │ (full 500-entry snapshot)       │          │
│        │             └───────────────┬────────────────┘          │
│        │                             │                           │
└────────┼─────────────────────────────┼───────────────────────────┘
         │                             │
         ▼                             ▼
┌──────────────────┐     ┌──────────────────────────┐
│   Firebase RTDB  │     │  R2 Backup Worker        │
│                  │     │  (POST /diagnostic)      │
│ /reports/        │     │                          │
│   errors/{date}  │     │  diagnostic-reports/     │
│   events/{date}  │     │    {date}/{errorId}.json │
│   config/        │     │                          │
└──────────────────┘     └──────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│   Admin Reports Page             │
│   /admin/reports                 │
│                                  │
│   ┌───────┬────────┬──────────┐  │
│   │Health │Error   │Live Feed │  │
│   │Board  │Log     │          │  │
│   └───────┴────────┴──────────┘  │
│                                  │
│   [Copy for Antigravity] button  │
└──────────────────────────────────┘
```

---

## 5. Functional Requirements

### 5.1. Reporting Service Core (`src/services/reportingService.ts`)

**FR-1:** Create a singleton `ReportingService` class that manages all reporting logic.

**FR-2:** The service MUST expose these public methods:
- `reportError(error, context)` — report an error with context
- `trackAction(featureName, actionName, metadata?)` — track a user action
- `trackPageView(pageName, route)` — track a page view
- `getConfig()` — get current reporting configuration
- `setMode(mode: 'full' | 'errors-only' | 'off')` — set reporting level
- `flush()` — immediately flush the event queue

**FR-3:** Event Queue — All events are added to an in-memory array. The queue is flushed:
- Every 5 seconds (via `setInterval`)
- When 10 events accumulate
- When `flush()` is called manually
- When `window.beforeunload` fires (last-chance flush)

**FR-4:** On flush, events are written to RTDB in a single `update()` call using fan-out writes:
```
{
  "/reports/errors/2026-03-17/{pushId1}": { ...errorEvent },
  "/reports/events/2026-03-17/{pushId2}": { ...actionEvent },
  "/reports/events/2026-03-17/{pushId3}": { ...pageViewEvent }
}
```

**FR-5:** The service MUST be initialized in the app's root component (e.g., `App.tsx`) after Firebase auth is ready. It reads its configuration from RTDB `/reports/config/`.

**FR-6:** ALL code in the service MUST be wrapped in try/catch. Errors within the reporting service are logged via `console.warn('[Reporting] ...')` and NEVER propagated to the calling code. This is a **hard architectural rule — zero exceptions**.

### 5.2. Error Capture Layer

**FR-7:** Install a global `window.onerror` handler that captures:
- Uncaught synchronous errors in event handlers
- Script errors from loaded chunks
- Calling `reportingService.reportError()` for each

**FR-8:** Install a global `window.addEventListener('unhandledrejection', ...)` handler that captures:
- Uncaught async errors (forgotten `await`, unhandled promise rejections)
- Calling `reportingService.reportError()` for each

**FR-9:** Modify the existing `ErrorBoundary.componentDidCatch()` to call `reportingService.reportError()` with:
- The error object
- The component stack from `errorInfo`
- A flag `isBoundary: true` to distinguish from global catches

**FR-10:** Each error report MUST include these fields:

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `id` | string | `crypto.randomUUID()` or fallback | Unique error ID |
| `timestamp` | number | `Date.now()` | When the error occurred |
| `feature` | string | Determined from current route → feature registry mapping | Which feature the error belongs to |
| `severity` | string | `'crash'` / `'error'` / `'warning'` | Severity level |
| `message` | string | `error.message` | Error message |
| `stack` | string | `error.stack` (truncated to 2000 chars) | Stack trace |
| `page` | string | `window.location.pathname` | Current page URL |
| `userId` | string | Firebase Auth `currentUser.uid` or `'guest'` | Who hit the error |
| `userName` | string | Firebase Auth `currentUser.displayName` or `'Guest'` | Display name |
| `userRole` | string | From auth context (`'admin'` / `'teacher'` / `'student'`) | User role |
| `browser` | string | `navigator.userAgent` (truncated to 200 chars) | Browser info |
| `screenSize` | string | `${window.innerWidth}x${window.innerHeight}` | Screen dimensions |
| `isBoundary` | boolean | Set by ErrorBoundary catch | Whether caught by ErrorBoundary |
| `contextData` | object | Extracted from URL params + known state | Data samples at time of error: entity IDs (testId, homeworkId, classId, courseId) parsed from URL path/params, plus any metadata passed via `reportError()` context argument. This is the "sample" that tells the developer WHAT data was being processed when the error occurred. |
| `breadcrumbs` | array | Last 10 user actions from breadcrumb tracker | Actions leading to error |
| `diagnosticUrl` | string | R2 URL after upload | Link to full diagnostic bundle |
| `componentStack` | string | From ErrorBoundary errorInfo, if available | React component tree |

**FR-11:** Rate Limiting — For each unique error signature (message + page combination):
- Allow max **5 reports per minute per user**
- After the limit, increment a counter but do NOT create new RTDB entries
- The counter is stored as `duplicateCount` on the first occurrence's RTDB record
- Reset the counter every 60 seconds

### 5.3. Feature Tracking Layer

**FR-12:** Create a React hook `useFeatureTracking(featureName: string)` that:
- Automatically tracks a `pageView` event when the component mounts
- Returns a `trackAction(actionName, metadata?)` function for tracking user actions within the feature
- Reads the feature name from the feature registry to validate it exists
- Logs a `console.warn` in development if the feature name is not in the registry

**FR-13:** Create a route-level wrapper component or modify the existing route configuration so that ALL page-level components automatically have page view tracking. This ensures new pages are tracked without manual instrumentation.

**FR-14:** All `trackAction()` calls MUST include:

| Field | Type | Description |
|-------|------|-------------|
| `feature` | string | Feature ID from registry |
| `action` | string | Action name (e.g., `submitTest`, `assignHomework`) |
| `timestamp` | number | When the action occurred |
| `userId` | string | Current user ID |
| `userName` | string | Current display name |
| `userRole` | string | Current role |
| `page` | string | Current page URL |
| `metadata` | object? | Optional action-specific data (e.g., `{ testId: 'abc' }`) |

### 5.4. User Action Breadcrumbs

**FR-15:** Implement a breadcrumb tracker that records the last **10 user actions** before an error:
- Page navigations (route changes)
- Button/link clicks (capture the button text or `data-track` attribute and the element type)
- Form submissions

**FR-16:** Breadcrumbs are stored in a circular buffer in memory (array of max 10 entries). When an error is reported, the current breadcrumb buffer is attached to the error report.

**FR-17:** Each breadcrumb entry contains:
- `type`: `'navigation'` / `'click'` / `'submit'`
- `target`: page URL (for navigation) or element description (for clicks: button text, link text)
- `timestamp`: when it happened
- `timeSincePageLoad`: milliseconds since last page navigation

**FR-18:** Click tracking MUST be implemented via a single delegated event listener on `document.body`, filtering for `button`, `a`, and `[data-track]` elements. Do NOT add individual listeners to every element.

### 5.5. Diagnostic Bundle (R2 Storage)

**Clarification:** This PRD assumes the project already has **two** Cloudflare R2 setups. All observability diagnostic uploads, reads, and purge operations in this PRD MUST use the **second R2 setup**: the existing **backup-storage R2** behind `r2-backup-worker`. The **user-upload R2** is out of scope for this feature and MUST NOT be reused.

**FR-19:** When an error of severity `'crash'` or `'error'` is reported, the service MUST:
1. Capture the full `DiagnosticLogger` snapshot (up to 500 entries) via `getDiagnosticLogger().getLogs()`
2. Package it with the error context into a JSON diagnostic bundle
3. Upload the bundle to the **backup-storage R2** via the backup worker's new `/diagnostic` endpoint
4. Store the returned R2 URL in the RTDB error record's `diagnosticUrl` field

**FR-20:** The diagnostic bundle JSON structure:
```json
{
  "errorId": "abc123",
  "timestamp": 1710700000000,
  "error": {
    "message": "Cannot read property 'text' of undefined",
    "stack": "...",
    "componentStack": "..."
  },
  "user": {
    "id": "uid123",
    "name": "Nguyen Van A",
    "role": "student"
  },
  "environment": {
    "browser": "Chrome 120 / Windows 10",
    "screenSize": "1920x1080",
    "page": "/test/xyz789",
    "buildVersion": "from import.meta.env.VITE_BUILD_VERSION or package.json version"
  },
  "breadcrumbs": [
    { "type": "navigation", "target": "/test/xyz789", "timestamp": 1710699990000 },
    { "type": "click", "target": "Next Question button", "timestamp": 1710699999000 }
  ],
  "diagnosticLogs": [
    { "time": "2026-03-17T14:23:40Z", "level": "log", "message": "...", "data": "..." },
    "... up to 500 entries ..."
  ]
}
```

**FR-21:** Diagnostic upload is **fire-and-forget**. If the upload fails:
- Log `console.warn('[Reporting] Diagnostic upload failed')`
- Set `diagnosticUrl` to `'upload-failed'` in the RTDB record
- Do NOT retry — the RTDB summary still has enough context for basic debugging

**FR-22:** Modify the existing `r2-backup-worker` for the **backup-storage R2** (not the user-upload R2 flow) to add a new HTTP route `POST /diagnostic`:
- Accepts the diagnostic bundle JSON in the request body
- Stores it in the R2 bucket at key: `diagnostic-reports/{YYYY-MM-DD}/{errorId}.json`
- Returns `{ success: true, url: "https://..." }` on success
- Authentication: Accept a shared secret token (stored as a Wrangler secret `DIAGNOSTIC_TOKEN`) in the `Authorization` header. The client sends this token (stored in env var `VITE_DIAGNOSTIC_TOKEN`).
- Max bundle size: **500KB** (reject larger payloads with 413)

### 5.6. Admin Reports Page (`/admin/reports`)

**FR-23:** Create a new page `AdminReportsPage.tsx` accessible at route `/admin/reports`. Only users with `role === 'admin'` or `role === 'super_admin'` can access it.

**FR-24:** The page has **3 tabs**:

#### Tab 1: Feature Health Dashboard (Default Landing)

**FR-25:** Display a grid/table of all features from the feature registry, showing:

| Column | Description |
|--------|-------------|
| Feature Name | Human-readable name from registry |
| Errors (24h) | Count of errors in last 24 hours |
| Last Error | Relative time of most recent error (e.g., "5m ago") |
| Status | 🟢 (0 errors in 24h) / 🟡 (1-5 errors) / 🔴 (>5 errors or a crash) |
| Usage (24h) | Count of trackAction events in last 24 hours |

**FR-26:** The health status formula:
- 🟢 Green: 0 errors in last 24 hours
- 🟡 Yellow: 1-5 errors OR no errors but a crash in last 72 hours
- 🔴 Red: >5 errors in 24h OR any crash in last 24h

**FR-27:** Clicking a feature row navigates to Tab 2 (Error Log) pre-filtered to that feature.

#### Tab 2: Error Log

**FR-28:** A chronological list of error reports with these filter controls:
- **Feature filter:** dropdown of all features from registry
- **Severity filter:** checkboxes for crash / error / warning
- **Date range:** date picker for start and end date
- **User filter:** search-by-name input
- **Sort:** by time (newest first, default), by frequency

**FR-29:** Each error row shows:
- Severity icon (🔴 crash, 🟠 error, 🟡 warning)
- Error message (truncated to 100 chars)
- Feature name
- User name + role badge
- Relative timestamp
- Duplicate count badge (if >1)

**FR-30:** Clicking an error row expands an inline detail panel showing:
- Full error message and stack trace
- Breadcrumbs list (last 10 actions)
- Browser and screen info
- User details
- **"View Full Diagnostic"** button (if `diagnosticUrl` exists) — fetches the R2 bundle and displays it in a modal with:
  - Scrollable log viewer (syntax-highlighted, filterable by log level)
  - Breadcrumbs timeline visualization
  - Environment details
- **"Copy for Antigravity" button** (see FR-38)

#### Tab 3: Live Feed

**FR-31:** A real-time streaming view using RTDB `onChildAdded` listeners on `/reports/errors/{today}` and `/reports/events/{today}`.

**FR-32:** Events appear in a scrollable list, newest at top, with auto-scroll. Each entry shows:
- Timestamp
- Type icon (🔴 error, 📊 event, 👀 pageView)
- Feature name
- Action/error message
- User name

**FR-33:** The live feed has a **pause/resume** toggle button. When paused, new events accumulate but the list doesn't scroll — a badge shows "12 new events" that the admin can click to catch up.

### 5.7. Navigation Integration

**FR-34:** Add a "Reports" card or button on the existing `AdminDashboardPage` that navigates to `/admin/reports`. The card should show a mini-summary:
- Total errors in last 24h
- Number of features in 🔴 status
- "View Reports →" link

**FR-35:** The `AdminReportsPage` MUST have a back button / breadcrumb that navigates back to `/admin/dashboard` (or wherever the admin dashboard route is).

### 5.8. Copy for Antigravity Button

**FR-36:** Every error detail panel has a **"📋 Copy for Antigravity"** button.

**FR-37:** When clicked, the button copies a **COMPLETE** debugging prompt to clipboard. The admin said: *"I click once and I can have all content I need to give to Antigravity for fixing the error."* This means the clipboard content MUST be self-contained — the AI receiving it should NOT need to follow URLs or request additional information.

The copied markdown format:

```markdown
## Error Report [ERR-{errorId}]
**Feature:** {featureName} | **Severity:** {severity}
**User:** {userName} ({userRole}) | **Page:** {page}
**Time:** {ISO timestamp}

### Error
{error.message}
{error.stack (full stack trace, not truncated)}

### Component Stack
{componentStack if available, else "N/A"}

### Context Data (Samples)
- Test ID: {contextData.testId or "N/A"}
- Homework ID: {contextData.homeworkId or "N/A"}
- Class ID: {contextData.classId or "N/A"}
- Route params: {JSON.stringify(contextData)}

### Last 10 User Actions (Breadcrumbs)
1. [{timestamp}] {type}: {target}
2. [{timestamp}] {type}: {target}
...

### Environment
- Browser: {browser}
- Screen: {screenSize}
- Build: {buildVersion}

### Recent Diagnostic Logs (Last 50 Entries)
[{time}] [{level}] {message} {data}
[{time}] [{level}] {message} {data}
... (last 50 entries from DiagnosticLogger, included INLINE — not a URL)

### Full Diagnostic Bundle URL
{diagnosticUrl or "Upload failed"}
(Contains full 500-entry log if you need more context)

---
Diagnose this error and suggest a fix. Check the stack trace for the source file and line number, review the breadcrumbs for the user's action sequence, review the diagnostic logs for the execution flow, and identify the root cause.
```

**FR-37a:** The diagnostic logs are included **inline** (last 50 entries) in the clipboard content, NOT just as a URL. The full 500-entry bundle URL is provided as supplementary. This ensures the AI can immediately start debugging without needing to fetch external resources.

**FR-37b:** If the diagnostic bundle was loaded (admin clicked "View Full Diagnostic" first), include all 500 entries instead of just 50.

**FR-38:** After copying, show a brief toast/tooltip "✅ Copied to clipboard" confirmation.

### 5.9. Feature Registry (`src/config/featureRegistry.ts`)

**FR-39:** Create a centralized TypeScript file that defines all tracked features:

```typescript
export interface FeatureDefinition {
  id: string;           // Unique feature ID (e.g., 'testTaking')
  name: string;         // Human-readable name (e.g., 'Test Taking')
  routes: string[];     // Route patterns this feature covers (e.g., ['/test/:id', '/test/practice/:id'])
  actions: string[];    // Known actions (e.g., ['startTest', 'submitAnswer', 'finishTest'])
  description: string;  // Brief description of what this feature does
}

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  {
    id: 'testTaking',
    name: 'Test Taking',
    routes: ['/test/:id', '/test/practice/:id', '/thcs-practice/:id'],
    actions: ['startTest', 'submitAnswer', 'nextQuestion', 'previousQuestion', 'finishTest', 'timeOut', 'abandonTest'],
    description: 'Student test-taking experience including practice and timed tests'
  },
  {
    id: 'testCreation',
    name: 'Test Creation',
    routes: ['/teacher/tests', '/teacher/test/create', '/teacher/test/edit/:id'],
    actions: ['createTest', 'editTest', 'publishTest', 'deleteTest', 'uploadDocument', 'parseDocument', 'aiGenerate'],
    description: 'Teacher test creation and management'
  },
  {
    id: 'homework',
    name: 'Homework Management',
    routes: ['/teacher/homework', '/student/homework'],
    actions: ['assignHomework', 'submitHomework', 'reviewHomework', 'archiveHomework', 'bulkAssign'],
    description: 'Homework assignment, submission, and review'
  },
  {
    id: 'courses',
    name: 'Course Management',
    routes: ['/teacher/courses', '/teacher/course/:id', '/student/courses'],
    actions: ['createCourse', 'editCourse', 'enrollStudent', 'syncCourse', 'addMaterial', 'addAnnouncement'],
    description: 'Course creation, management, and enrollment'
  },
  {
    id: 'aiOperations',
    name: 'AI Operations',
    routes: [],  // AI runs in the background, not tied to a specific route
    actions: ['generateFeedback', 'parseDocument', 'classifyQuestion', 'generateQuiz', 'aiRetry', 'aiFailure'],
    description: 'AI-powered operations including feedback generation and document parsing'
  },
  {
    id: 'authentication',
    name: 'Authentication',
    routes: ['/login', '/register', '/forgot-password'],
    actions: ['login', 'logout', 'register', 'resetPassword', 'roleSwitch'],
    description: 'User authentication and account management'
  },
  {
    id: 'adminPanel',
    name: 'Admin Panel',
    routes: ['/admin/*'],
    actions: ['viewDashboard', 'manageUsers', 'manageClasses', 'viewBackups', 'triggerBackup', 'purgeReports'],
    description: 'Admin management pages'
  },
  {
    id: 'academicRecords',
    name: 'Academic Records',
    routes: ['/student/records', '/teacher/records'],
    actions: ['viewRecords', 'viewFeedback', 'requestFeedback', 'downloadCertificate'],
    description: 'Student academic record viewing and feedback'
  },
  {
    id: 'profile',
    name: 'User Profile',
    routes: ['/profile', '/settings'],
    actions: ['editProfile', 'changePassword', 'updateAvatar', 'deleteAccount'],
    description: 'User profile and settings management'
  },
  // NOTE TO DEVELOPERS (AI AGENTS):
  // When adding a new feature or page, you MUST add an entry to this registry.
  // See AI enforcement rules in AGENTS.md, GEMINI.md, CLAUDE.md.
  // Each entry must have: id, name, at least one route OR be a background feature,
  // a list of known actions, and a description.
];

/**
 * Resolve current route to a feature ID.
 * Used by the auto-tracking route wrapper.
 */
export function resolveFeatureFromRoute(pathname: string): string | null {
  // Implementation: match pathname against each feature's routes
  // using route pattern matching (convert :param to regex wildcards)
  // Return the first matching feature ID, or null if no match
}

/**
 * Validate that a feature ID exists in the registry.
 * Logs a warning in development if not found.
 */
export function validateFeatureId(featureId: string): boolean {
  const exists = FEATURE_REGISTRY.some(f => f.id === featureId);
  if (!exists && process.env.NODE_ENV === 'development') {
    console.warn(`[FeatureRegistry] Unknown feature: "${featureId}". Add it to featureRegistry.ts`);
  }
  return exists;
}
```

**FR-40:** The `resolveFeatureFromRoute()` function is used by the route-level auto-tracking wrapper. When a page loads and its route doesn't match any feature in the registry, it:
- In development: logs a `console.warn` with the unmatched route
- In production: tracks it under a special feature ID `'unregistered'` so it still appears in the admin dashboard and can be identified

### 5.10. Kill Switch System

**FR-41:** Reporting mode is stored in RTDB at `/reports/config/mode` with values: `'full'` | `'errors-only'` | `'off'`.

**FR-42:** The `ReportingService` reads this config on initialization and subscribes to changes via `onValue()`. Mode changes take effect immediately without page reload.

**FR-43:** Mode behavior:
- **`full`**: All errors, all feature events, all page views, all performance metrics are reported
- **`errors-only`**: Only errors (FR-7, FR-8, FR-9) are reported. Feature events and page views are silently dropped.
- **`off`**: Nothing is reported. All `reportError()` and `trackAction()` calls return immediately.

**FR-44:** Additionally, within `full` mode, category-level toggles are available at `/reports/config/categories/`:
- `errors`: boolean (default true)
- `events`: boolean (default true)
- `performance`: boolean (default true)
- `diagnostics`: boolean (default true — controls R2 uploads)

**FR-45:** The Admin Settings page (existing `AdminSettingsPage.tsx`) gets a new section "Reporting & Observability" with:
- A preset selector (Full / Errors Only / Off)
- Expandable "Advanced" panel showing category toggles (only visible in Full mode)
- Current RTDB storage usage estimate

### 5.11. Data Retention & Cleanup

**FR-46:** RTDB data is structured by date:
```
/reports/
  errors/
    2026-03-17/
      {pushId1}: { ... }
      {pushId2}: { ... }
    2026-03-18/
      {pushId3}: { ... }
  events/
    2026-03-17/
      {pushId4}: { ... }
  config/
    mode: "full"
    categories/
      errors: true
      events: true
      performance: true
      diagnostics: true
    retention/
      autoPurgeDays: 30
```

**FR-47:** The Admin Reports page shows a "🗑️ Purge Old Data" button that:
- Opens a confirmation dialog
- Allows the admin to set the cutoff (default: 30 days)
- Deletes all RTDB date nodes older than the cutoff
- Also deletes corresponding R2 diagnostic bundles (via a call to the backup worker's new `/purge-diagnostics` endpoint)
- Shows a progress indicator and result summary

**FR-48:** The default auto-purge threshold is stored at `/reports/config/retention/autoPurgeDays` (default 30). There is NO automatic purge — the admin must click the button. But the page shows a warning badge when the oldest data exceeds the threshold: "⚠️ Data older than 30 days exists. Consider purging."

### 5.12. Firebase Analytics Integration

**FR-49:** Initialize Firebase Analytics in the app's Firebase config module:
```typescript
import { getAnalytics, logEvent } from 'firebase/analytics';
const analytics = getAnalytics(app);
```

**FR-50:** The `ReportingService` sends a **subset** of events to Firebase Analytics in addition to RTDB:
- `page_view` (automatic via Analytics SDK)
- `screen_view` with screen name parameter
- Custom events: `error_occurred` (with error code + feature), `feature_used` (with feature + action)
- Do NOT send diagnostic details to Analytics — just event names and counts

**FR-51:** Firebase Analytics is controlled by the same kill switch: in `'off'` mode, Analytics events are also suppressed.

### 5.13. Self-Health & Resilience (Researched Patterns)

The reporting system must be invisible and bulletproof. Based on industry patterns from production telemetry systems (Sentry SDK, DataDog RUM, New Relic Browser Agent), the following resilience mechanisms are implemented:

#### Circuit Breaker Pattern

**FR-52:** The ReportingService implements a circuit breaker:

- **Closed (normal):** All writes proceed. Track consecutive failure count.
- **Open (after 3 consecutive RTDB write failures):** All reporting calls are silently dropped. Log `console.warn('[Reporting] Circuit breaker OPEN — pausing for 5 minutes')`. After 5 minutes, transition to half-open.
- **Half-open:** Allow ONE test write. Success → closed (reset counter). Failure → open again for 5 more minutes.

**FR-53:** Circuit breaker state is memory-only. Page refresh resets to closed.

#### Canary Event (Pipeline Health Check)

**FR-53a:** On ReportingService initialization (after auth is ready), send a single **canary event** to RTDB:
```json
{ "type": "canary", "timestamp": ..., "message": "Reporting pipeline active" }
```
This verifies the entire pipeline (auth → RTDB write → security rules) works end-to-end. If the canary fails, the circuit breaker immediately opens and the service logs `console.warn('[Reporting] Canary failed — pipeline not operational')`. This prevents the system from silently accumulating a queue of events that will never be written.

#### Graceful Degradation Chain

**FR-53b:** When components of the reporting pipeline fail, degrade gracefully in this order:
1. **Full mode:** RTDB summaries + R2 diagnostic bundles + Firebase Analytics
2. **R2 failure:** RTDB summaries + Firebase Analytics (diagnosticUrl = 'upload-failed')
3. **RTDB failure (circuit breaker open):** Firebase Analytics only (basic event counts still flow)
4. **Everything fails:** Console-only logging. The app continues to work perfectly.

Each degradation step is logged via `console.warn` so it's visible in the browser's DevTools but NEVER visible to users.

#### Telemetry Quota (Runaway Prevention)

**FR-53c:** Self-imposed limit: max **500 events per session** (per tab). After 500 events, only errors are reported (feature events/page views are dropped). This prevents edge cases like infinite re-render loops or stuck intervals from generating unbounded writes. The counter resets on page refresh.

### 5.14. RTDB Security Rules

**FR-54:** Add the following security rules to `database.rules.json`:

```json
"reports": {
  "errors": {
    "$date": {
      ".read": "auth != null && (root.child('users/' + auth.uid + '/role').val() === 'admin' || root.child('users/' + auth.uid + '/role').val() === 'super_admin')",
      ".write": "auth != null",
      "$errorId": {
        ".validate": "newData.hasChildren(['timestamp', 'message', 'feature', 'severity', 'userId'])"
      }
    }
  },
  "events": {
    "$date": {
      ".read": "auth != null && (root.child('users/' + auth.uid + '/role').val() === 'admin' || root.child('users/' + auth.uid + '/role').val() === 'super_admin')",
      ".write": "auth != null"
    }
  },
  "config": {
    ".read": "auth != null",
    ".write": "auth != null && (root.child('users/' + auth.uid + '/role').val() === 'admin' || root.child('users/' + auth.uid + '/role').val() === 'super_admin')"
  }
}
```

**Key rules:**
- Any authenticated user can **write** error reports and events (because any user can encounter errors)
- Only admin/super_admin can **read** reports (privacy)
- Only admin/super_admin can **write** config (kill switch, retention settings)
- Guest users (unauthenticated) CANNOT write reports. Their errors are logged to console only. This is an acceptable tradeoff — guest mode is limited in the app.
- Each error record must have required fields (validated by `.validate`)

### 5.15. AI Enforcement Rules & Skills

The user explicitly stated: *"I want infrastructure and tools for doing so as well as you must also add enforcement to do that in Antigravity using gemini's rules, claude's rules, global's rules, making skills if need to."*

This requires THREE enforcement layers:

#### Layer 1: Rule Files (AGENTS.md, GEMINI.md, CLAUDE.md)

**FR-55:** Add the following rules to the integration safety rules table in ALL THREE files — `AGENTS.md`, `GEMINI.md`, AND `CLAUDE.md`:

| When you are... | READ this file |
|----------------|----------------|
| Creating a new page component or route | [`rules/observability.md`](documentation/rules/observability.md) |
| Adding or modifying user-facing actions (buttons, forms, workflows) | [`rules/observability.md`](documentation/rules/observability.md) |
| Renaming, moving, or deleting a feature/page | [`rules/observability.md`](documentation/rules/observability.md) |

#### Layer 2: Rules Documentation

**FR-56:** Create `documentation/rules/observability.md` with the following content:

**Rule: Feature Tracking Registration (MANDATORY)**

When creating a new page, modifying feature actions, or changing routes:

1. **READ** `src/config/featureRegistry.ts` first — find the relevant feature entry
2. If feature does NOT exist: add a new `FeatureDefinition` entry with id, name, routes, actions, description
3. If feature EXISTS but actions changed: update the `actions` array to reflect new/removed/renamed actions
4. If feature EXISTS but routes changed: update the `routes` array
5. If feature was DELETED: remove the entry from the registry (old reports remain in RTDB under the old ID)
6. Ensure the page component calls `useFeatureTracking(featureId)` hook
7. Ensure ALL user-facing action handlers (button clicks, form submits, workflow transitions) call `trackAction(actionName, metadata?)` from the hook's returned function
8. Do NOT use hardcoded feature ID strings — always reference `FEATURE_REGISTRY` constants
9. When adding `trackAction()` to a new action, ALSO add the action name to the feature's `actions` array in the registry

Self-check (MUST complete all before marking work done):
- [ ] Feature exists in `featureRegistry.ts` with correct id, name, description
- [ ] All routes for this feature are listed in the `routes` array
- [ ] All user-facing actions are listed in the `actions` array
- [ ] `useFeatureTracking()` hook is called in the page component
- [ ] Every button, form, and workflow step calls `trackAction()`
- [ ] No hardcoded feature ID strings exist — all reference the registry

#### Layer 3: Antigravity Skill

**FR-56a:** Create a new Antigravity skill at `.agent/skills/observability-tracking/SKILL.md` that AI agents load when working on feature pages. The skill MUST contain:

1. **When to load:** Creating/modifying any page component, adding buttons/forms, changing routes
2. **Step-by-step instructions:** How to register a feature in the registry, how to add the `useFeatureTracking` hook, how to instrument action handlers with `trackAction()`
3. **Examples:** A complete before/after example showing an uninstrumented page vs. a fully instrumented one
4. **Validation:** After implementation, run a check: grep all route definitions and verify each maps to a registry entry. Grep all `onClick`/`onSubmit` handlers in the page and verify each has a `trackAction()` call.
5. **Auto-keep-up rule:** When modifying an existing feature (adding/removing/renaming actions or routes), the skill instructs the AI to ALSO update the registry entry. This is the mechanism that keeps tracking in sync with feature changes.

**FR-56b:** The skill file MUST also be referenced in the Knowns guidelines so that `knowns` MCP tools can surface it during task planning.

---

## 6. Non-Goals (Out of Scope)

1. **Session replay / screen recording** — this is LogRocket territory. We capture breadcrumbs and logs, not video.
2. **Success tracking / success rates** — will be added in Phase 2 after bug cleanup is complete.
3. **A/B testing or feature flags** — this system is for observability, not experimentation.
4. **Real-time alerting / push notifications** — admin must actively check the Reports page. Automated alerts are a future enhancement.
5. **Multi-project support** — this system is for this one Firebase project only.
6. **Automated fix suggestions** — the "Copy for Antigravity" button provides context for AI debugging, but the system does not attempt to diagnose errors itself.
7. **Performance monitoring dashboard** — while performance metrics are captured, a dedicated performance view is deferred to Phase 2. Errors are the priority.
8. **State snapshots** — we do NOT capture React component state. Strategic logging in critical flows + DiagnosticLogger history provides sufficient debugging context.

---

## 7. Technical Considerations

### Dependencies
- **New:** `firebase/analytics` (already bundled in the `firebase` package — no new npm install needed)
- **Modified:** `r2-backup-worker` (the existing backup-storage R2 worker; add `/diagnostic` and `/purge-diagnostics` routes there, not on the user-upload R2 path)
- **Modified:** `ErrorBoundary.tsx` (add `reportingService.reportError()` call)
- **Modified:** `AdminSettingsPage.tsx` (add Reporting section)
- **Modified:** `AdminDashboardPage.tsx` (add Reports card/link)
- **Modified:** `database.rules.json` (add `/reports/` rules)
- **No new npm packages** — everything uses existing Firebase SDK + the existing **backup-storage R2** worker infrastructure

### Integration Points
- `ErrorBoundary.tsx` — hook into `componentDidCatch`
- `DiagnosticLogger.js` — read logs via `getDiagnosticLogger().getLogs()`
- `PerformanceMonitor` (performance.ts) — optionally send slow operation reports
- Route configuration (wherever routes are defined) — add auto-tracking wrapper
- `r2-backup-worker/src/index.ts` — add `/diagnostic` route
- `database.rules.json` — add `/reports/` path rules
- `AdminDashboardPage.tsx` — add navigation card
- `AdminSettingsPage.tsx` — add configuration section

### Files to Create
1. `src/services/reportingService.ts` — core reporting service
2. `src/config/featureRegistry.ts` — feature registry
3. `src/hooks/useFeatureTracking.ts` — React hook for feature tracking
4. `src/hooks/useBreadcrumbs.ts` — breadcrumb tracker hook
5. `src/pages/AdminReportsPage.tsx` — admin reports page
6. `src/pages/AdminReportsPage.css` — admin reports page styles
7. `documentation/rules/observability.md` — AI enforcement rules document
8. `.agent/skills/observability-tracking/SKILL.md` — Antigravity skill for feature tracking enforcement

### Files to Modify
1. `src/components/ErrorBoundary.tsx` — add reporting call
2. `src/utils/diagnosticLogger.js` — add `getLogsAsJSON()` method
3. `src/services/firebase.js` — initialize Analytics
4. `r2-backup-worker/src/index.ts` — add diagnostic routes
5. `r2-backup-worker/wrangler.toml` — add diagnostic token secret reference
6. `database.rules.json` — add `/reports/` security rules
7. `src/pages/AdminDashboardPage.tsx` — add Reports link card
8. `src/pages/AdminSettingsPage.tsx` — add Reporting config section
9. Route configuration file — add auto-tracking wrapper
10. `AGENTS.md` — add observability enforcement rule to integration safety table
11. `GEMINI.md` — add observability enforcement rule to integration safety table
12. `CLAUDE.md` — add observability enforcement rule to integration safety table
13. `App.tsx` (or equivalent root) — initialize ReportingService

---

## 8. Design Considerations

### Admin Reports Page Layout

The page follows existing admin page design patterns. Key layout requirements:

- **Header:** Page title "Production Reports" + back button to Admin Dashboard + reporting mode indicator (🟢 Full / 🟡 Errors Only / 🔴 Off)
- **Tab bar:** Feature Health | Error Log | Live Feed
- **Content area:** Tab-specific content as described in FR-25 through FR-33
- **Feature Health tab:** responsive grid/table, cards on mobile
- **Error Log tab:** list view with expandable detail panels
- **Live Feed tab:** scrollable list with auto-scroll and pause control
- **Colors:** use existing app color palette, severity colors: red (crash), orange (error), yellow (warning), green (healthy)

### Diagnostic Bundle Viewer Modal

When "View Full Diagnostic" is clicked:
- Opens a full-screen modal (existing modal pattern)
- Left panel: log entries (scrollable, filterable by level: log/warn/error)
- Right panel: breadcrumbs timeline + environment info
- Top bar: error summary + Copy for Antigravity button + Close button

---

## 9. RTDB Data Schema

### Error Record (`/reports/errors/{YYYY-MM-DD}/{pushId}`)
```json
{
  "id": "abc123-def456",
  "timestamp": 1710700000000,
  "feature": "testTaking",
  "severity": "crash",
  "message": "Cannot read property 'text' of undefined",
  "stack": "TypeError: Cannot read property 'text'...\n  at QuestionCard.tsx:142...",
  "page": "/test/xyz789",
  "userId": "uid123",
  "userName": "Nguyen Van A",
  "userRole": "student",
  "browser": "Chrome/120.0 Windows 10",
  "screenSize": "1920x1080",
  "isBoundary": true,
  "componentStack": "\n  at QuestionCard\n  at TestPage\n  at App",
  "contextData": {
    "testId": "xyz789",
    "questionIndex": 14,
    "routeParams": { "id": "xyz789" },
    "searchParams": {}
  },
  "breadcrumbs": [
    { "type": "navigation", "target": "/test/xyz789", "timestamp": 1710699990000, "timeSincePageLoad": 0 },
    { "type": "click", "target": "Next Question button", "timestamp": 1710699999000, "timeSincePageLoad": 9000 }
  ],
  "diagnosticUrl": "https://pub-xxx.r2.dev/diagnostic-reports/2026-03-17/abc123-def456.json",
  "duplicateCount": 1
}
```

### Event Record (`/reports/events/{YYYY-MM-DD}/{pushId}`)
```json
{
  "type": "action",
  "feature": "homework",
  "action": "submitHomework",
  "timestamp": 1710700100000,
  "userId": "uid456",
  "userName": "Tran Thi B",
  "userRole": "student",
  "page": "/student/homework/abc",
  "metadata": { "homeworkId": "hw123" }
}
```

### Page View Event (`/reports/events/{YYYY-MM-DD}/{pushId}`)
```json
{
  "type": "pageView",
  "feature": "testTaking",
  "page": "/test/xyz789",
  "timestamp": 1710699990000,
  "userId": "uid123",
  "userName": "Nguyen Van A",
  "userRole": "student"
}
```

### Config (`/reports/config/`)
```json
{
  "mode": "full",
  "categories": {
    "errors": true,
    "events": true,
    "performance": true,
    "diagnostics": true
  },
  "retention": {
    "autoPurgeDays": 30
  }
}
```

---

## 10. Edge Cases & Preventions

| Edge Case | Prevention |
|-----------|------------|
| Error occurs before Firebase Auth is ready (user is null) | Report with `userId: 'pre-auth'`, `userName: 'Pre-authentication'`. These reports are still valuable. |
| Error occurs in the ReportingService itself | All reporting code is wrapped in try/catch. Self-errors are logged to console.warn only. Circuit breaker prevents cascading failures. |
| DiagnosticLogger not initialized when error occurs | Check if `getDiagnosticLogger()` returns null. If so, skip diagnostic bundle — the RTDB summary is still created. |
| Same error fires 1000 times in a tight loop (e.g., render loop crash) | Rate limiter: max 5 identical errors per minute per user. After limit, increment `duplicateCount` on existing record. |
| R2 worker is down / unreachable | Diagnostic upload is fire-and-forget. Set `diagnosticUrl: 'upload-failed'`. RTDB summary still has stack trace and breadcrumbs. |
| RTDB write fails due to network / rules | Circuit breaker: 3 failures → pause 5 min → retry one. Events during pause are silently dropped. |
| Admin changes mode from 'full' to 'off' while events are queued | On mode change, immediately clear the event queue. Do not flush pending events. |
| User navigates away while diagnostic is uploading | `window.beforeunload` triggers queue flush first. R2 upload may be interrupted — this is acceptable (RTDB summary exists). |
| Feature registry doesn't cover a page (developer forgot) | Auto-tracking reports it under feature ID `'unregistered'`. In development, a console.warn alerts the developer. The admin dashboard shows 'unregistered' as a feature, making the gap visible. |
| Error message contains PII (user types sensitive data that appears in error) | Stack traces and error messages are stored as-is. Diagnostic bundles may contain console.log output with sensitive data. This is acceptable in testing phase with known users. For production, consider sanitization rules. |
| Multiple tabs send duplicate events | Each tab has its own ReportingService instance. Duplicate events may appear in RTDB. The admin dashboard can show a "tab ID" field for disambiguation, but deduplication is NOT performed — it's unnecessary at <10 users. |
| RTDB `/reports/` grows large after months without purging | Warning badge on admin dashboard when oldest data > configured threshold. Manual purge button with confirmation dialog. No automatic purge to prevent accidental data loss. |
| Network flaps cause rapid online/offline transitions | RTDB has built-in offline sync — queued writes auto-sync on reconnect. The ReportingService does not add custom offline handling. |

---

## 11. Success Metrics

1. **100% of uncaught errors** are reported to RTDB (verifiable by triggering test errors)
2. **Every page** in the app registers a `pageView` event (verifiable by navigating all pages and checking the admin dashboard)
3. **Error-to-fix time** decreases — admin can identify and copy error context within 60 seconds of opening the Reports page
4. **Zero false interference** — the reporting system never causes a user-visible error or performance degradation
5. **Feature registry coverage** — 100% of pages map to a registered feature (no 'unregistered' events in production)

---

## 12. Open Questions

1. **Build version tracking:** Should we embed a build timestamp or git commit hash in the diagnostic bundle? This would help identify which deploy introduced a bug. (Recommendation: Yes, add `VITE_BUILD_TIMESTAMP` env var set during build.)
2. **R2 diagnostic purge:** When admin purges RTDB data older than 30 days, should corresponding R2 bundles also be deleted? (Recommendation: Yes, via a `/purge-diagnostics` endpoint on the backup worker.) — **Addressed in FR-47.**
3. **Performance metric threshold alerts:** In Phase 2, should the admin be alerted when average AI response time exceeds a threshold? (Deferred.)
4. **Existing `DiagnosticLogger` format:** The current logger stores entries with `userAgent` and `screenSize` on every entry (redundant with error context). Should we slim it down? (Recommendation: low priority, address later.)

---

## 13. Feature Change Auto-Detection Strategy

The user stated (in all caps): **"IT MUST BE ABLE TO AUTO KEEP UP WITH CHANGES OF A FEATURE."**

Here is exactly how the system handles each type of feature change:

| Change Type | How It's Detected | Action Required |
|-------------|-------------------|----------------|
| **New page added** | Route wrapper auto-tracks as `'unregistered'` → visible on admin dashboard | AI agent adds entry to `featureRegistry.ts` (enforced by skill + rules) |
| **Page route changed** | Route wrapper auto-tracks new route → old route stops appearing | AI agent updates `routes` array in registry (enforced by skill + rules) |
| **New action added** (new button/form) | NOT auto-detected at runtime | AI agent adds `trackAction()` call + updates `actions` array (enforced by skill + rules) |
| **Action renamed** | Old action name stops appearing in events, new one appears as unrecognized | AI agent updates `actions` array (enforced by skill + rules) |
| **Action removed** | Old action name stops appearing in events (natural) | AI agent removes from `actions` array (enforced by skill + rules) |
| **Feature deleted** | Route stops matching, events stop flowing | AI agent removes registry entry (old reports remain readable) |
| **Feature split into sub-features** | Original feature's events don't match expected patterns | AI agent creates new registry entries (enforced by skill + rules) |

**The "almost perfect" mechanism:** Route-level tracking is 100% automatic (zero developer action). Action-level tracking is enforced by THREE layers (Antigravity skill + rules in AGENTS.md/GEMINI.md/CLAUDE.md + documentation). The `'unregistered'` fallback ensures nothing is ever silently lost — untracked items are visible and flagged on the admin dashboard.

---

## 14. Future Enhancements (Phase 2+)

1. **Success tracking and success rate metrics** — once bug cleanup is complete (user explicitly deferred: "I should focus on cleaning up bugs and errors first")
2. **Performance monitoring dashboard** — dedicated view for API latency, parsing duration, Firebase operation timing
3. **Automated alerting** — email or FCM push when error rate spikes above threshold
4. **Session timeline view** — select a user, see their complete session: pages, actions, errors, timing
5. **Automated daily/weekly summary** — Cloud Function that compiles a report and emails it to admin
6. **Error grouping and deduplication** — intelligent grouping of similar errors (same stack trace signature) into "error groups" with occurrence counts
7. **Export to CSV** — download error and event data for external analysis
8. **Build version comparison** — compare error rates between deploys to identify regressions
