# Tasks: PRD-0037 — Production Reporting & Observability System

> **Source PRD:** `documentation/tasks/0037-prd-production-reporting-observability.md`
> **Generated:** 2026-03-18
> **Target Audience:** Junior developer with codebase awareness

## Relevant Files

### Documentation Updates
- `documentation/tasks/0037-prd-production-reporting-observability.md` — Source PRD for PRD-0037. Clarifies that observability diagnostics must use the backup-storage R2 stack (`r2-backup-worker`), not the user-upload R2.
- `documentation/tasks/tasks-0037-prd-production-reporting-observability.md` — Implementation checklist for PRD-0037. Clarifies the same backup-storage R2 requirement so future subtasks stay aligned.

### Implementation Progress
- `documentation/rules/observability.md` - Mandatory feature tracking registration rule referenced by AGENTS.md, GEMINI.md, and CLAUDE.md.
- `.agent/skills/observability-tracking/SKILL.md` - Observability tracking skill with PRD-aligned validation steps and a Knowns-surfacing reference for page/action work.
- `src/components/admin/StudentCard.tsx` - Added an accessible label to the release action while unblocking repo-wide verification on current admin flows.
- `src/components/admin/AdminToolbar.tsx` - Added stable filter control labels/test hooks so the current student-scope UI can be exercised in tests.
- `src/pages/AdminUserManagementPage.test.jsx` - Realigned admin user-management coverage with secure service hooks, batched assignment loading, and select-based filter flows.
- `src/components/assignment/AssignmentModal.test.tsx` - Reworked Mantine assignment-modal coverage with deterministic Select/MultiSelect test doubles and unambiguous field helpers so the current admin assignment flows verify cleanly.
- `src/pages/AdminSettingsPage.tsx` - Added the Reporting settings section, instrumented reporting controls, and linked Settings directly to the Reports workspace for purge/diagnostic management.
- src/components/DiagnosticViewerModal.tsx - Full-screen diagnostic bundle viewer with log filtering, breadcrumb timeline, and Antigravity copy entry point.
- `src/components/navigation/AdminSidebar.tsx` - Added the Reports item to the admin System navigation section.
- `src/pages/AdminDashboardPage.tsx` - Added the Reports quick-link card and reports route map entry.
- `src/pages/AdminMaterialsPage.tsx` - Added the reports route map entry.
- `src/pages/AdminSessionsPage.tsx` - Added the reports route map entry.
- `src/pages/AdminUserManagementPage.jsx` - Added the reports route map entry.
- `src/pages/AdminCoursesPage.tsx` - Added the reports route map entry.
- `src/pages/AdminClassesPage.tsx` - Added the reports route map entry.
- `src/pages/AdminBackupPage.tsx` - Added the reports route map entry.
- `src/App.jsx` - Wired ReportingService and breadcrumbs at the app root, added the `/admin/reports` route, and wrapped authenticated routes with `TrackedRoute`.
- `src/config/routeSecurity.ts` - Added the `/admin/reports` admin-only security entry to keep the route matrix aligned with App.jsx.
- `database.rules.json` - Added the `/reports` RTDB security rules for errors, events, and config access.
- `src/services/reportingService.ts` - Hardened queue flushing, analytics-only degradation, reserved RTDB error paths, and diagnostic URL synchronization from the review pass.
- `src/services/reportingService.test.ts` - Added regression coverage for reserved error paths and analytics-only fallback behavior.
- `src/services/testResults.service.test.ts` - Mocked notification delivery at the boundary so result-storage unit tests assert storage behavior without extra feed-write side effects.
- `src/services/test-creation/validator.service.test.ts` - Updated stale weighted-confidence expectations to match the current 50/50 validator implementation during repo-wide verification.
- `src/services/firebase.js` - Switched Firebase Analytics initialization to an ESM import, then hardened test-mode bootstrap to skip analytics and verbose connection logging during verification.
- `src/components/ErrorBoundary.tsx` - Uses `import.meta.env.DEV` for development-only diagnostics while continuing to report boundary crashes.
- `src/hooks/useFeatureTracking.test.ts` - Unit tests for mount-time page tracking, route auto-resolution, and `trackAction()` forwarding.
- `src/hooks/useBreadcrumbs.test.ts` - Unit tests for breadcrumb buffer limits, delegated listeners, and navigation timer resets.
- `src/config/featureRegistry.ts` - Expanded the admin-panel action registry so reporting settings controls and the Settings-to-Reports handoff stay tracked.
- `src/pages/AdminReportsPage.tsx` - Added the admin reports shell, RTDB-backed health/error/live surfaces, expanded diagnostics, retention warning, and purge flow.
- `src/pages/AdminReportsPage.css` - Added the missing reports stylesheet with tab-bar, grid, list, status, scroll-shell, modal, and responsive layout classes.
- `src/services/navigation.service.ts` - Added an invalid-route guard while repo-wide verification exposed stale navigation-service assumptions.
- `src/services/navigation.service.test.ts` - Replaced stale navigation-service coverage with current contract tests for guards, retry behavior, history, and delayed navigation.
- `src/hooks/useNavigation.test.ts` - Replaced stale hook expectations with tests for service delegation, snapshot reads on rerender, polling history, and debug logging.
- `src/services/ai/router.service.test.ts` - Isolated provider mocks per test and realigned unavailable-provider/retry expectations with the current router fallback contract.
- `src/constants/routes.ts` - Tightened route parameter extraction so empty segments, mismatched static routes, and query-string paths no longer validate accidentally.
- `src/constants/routes.test.ts` - Updated stale route expectations and kept coverage aligned with the corrected parser behavior and current route names.
- `src/store/ui.store.test.ts` - Replaced fake-timer hangs with async timer advancement so notification auto-dismiss coverage no longer times out.
- `src/components/access/AccessControlWrapper.test.tsx` - Hardened the access-revocation tests with async timer advancement to remove full-suite flake around security rechecks.
- `src/components/assignment/AssignmentHistoryTab.test.tsx` - Updated stale duplicate-text selectors and status assertions so assignment-history coverage matches the current repeated-entry UI.
- `src/components/navigation/Breadcrumbs.test.tsx` - Replaced a brittle style matcher with direct DOM-style assertions so breadcrumb styling coverage matches the live inline-style output.
- `src/__tests__/services/resultsService.test.ts` - Replaced live RTDB dependencies with an in-memory Firebase mock so teacher/student result access tests stay isolated from permissions.
- `src/__tests__/auth/AuthContext.test.tsx` - Realigned auth-provider loading expectations and async Firebase mocks with the current AuthProvider contract so verification no longer exits on stale assumptions.
- `src/__tests__/integration/store-integration.test.ts` - Removed obsolete integration coverage for deleted `quiz.store` and `draft.store` modules that no longer exist in `src/store`.
- `src/services/test-creation/__tests__/paste-parse-regression.test.ts` - Converted the legacy script-style regression check into a real Vitest suite so repo-wide verification no longer exits the process.
- `src/services/test-creation/thcs-external-retry.test.ts` - Updated stale provider-chain expectations to the current two-step external retry flow.
- `src/services/test-creation/thcs-prompt-builder.test.ts` - Replaced brittle exact-count assertions with baseline-presence checks so prompt-registry growth stops breaking verification.
- `src/services/homeworkManager.ts` - Strips undefined fields before Firestore writes so optional homework fields no longer break writes during verification.
- `src/services/homeworkManager.test.ts` - Rebuilt the homework manager suite around the current API surface with isolated Firestore/class-manager mocks.
- `src/services/file-extractor/file.extractor.test.ts` - Replaced stale extractor assertions with jsdom-safe file doubles and current extension-based contract coverage so repo-wide verification can keep advancing.
- `src/services/ai/groq.provider.test.ts` - Updated Groq provider coverage for lazy initialization, ESM-safe env mocking, and isolated API-key test setup.
- `src/pages/LoginPage.test.jsx` - Replaced the stale session-code-era suite with coverage for the current login UI and switched fetch mocking to the repo's current test-harness pattern.
- `src/components/PrivateRoute.jsx` - Added an explicit accessible loading-state contract so protected-route checks expose a stable status target instead of relying on Mantine internals.
- `src/components/PrivateRoute.test.tsx` - Repaired the unauthenticated-state mock so route-guard coverage follows the active hoisted auth mock instead of a late no-op remock.
- `src/__tests__/auth/PrivateRoute.test.tsx` - Rebuilt the auth-route harness around concrete redirect routes and the new accessible loading-state contract so redirect cases no longer hang under Vitest.
- `src/components/test/StudentDetailModal.tsx` - Removed leftover debug noise, fixed zero-question progress handling, and added progressbar accessibility semantics while preserving the current submitted-vs-working question-list behavior.
- `src/components/test/__tests__/StudentDetailModal.test.tsx` - Realigned modal coverage with the live status badge, submitted-only full question list, accessible progressbar contract, and realistic render-time threshold.
- `src/components/test-creation/TestCreationModal.test.tsx` - Added the current router/auth test harness and updated unavailable-type expectations so the modal suite matches the live wizard behavior.
- `src/__tests__/services/sessionAccess.test.ts` - Replaced live RTDB dependencies with an in-memory database mock so session-access verification covers the current contract without permission failures.
- `src/pages/StudentTestResultsPage.test.tsx` - Mocked the writing-submission boundary so student results tests stop booting real Firestore-backed services.
- `src/pages/TestReviewPage.test.tsx` - Updated stale review-page expectations for role-aware back navigation and publishable drafts so current publish and visibility behavior stays covered during repo-wide verification.
- `src/parsers/pdfParser.test.js` - Realigned parser mocks and jsdom file doubles with the current PDF parser API and error messages.
- `src/utils/errorHandling.test.ts` - Attached rejection expectations before advancing fake timers so retry failure tests stop triggering unhandled-rejection noise in Vitest.
- `src/utils/antiCheatPresets.test.ts` - Updated stale session-context expectations to match the current anti-cheat preset contract where live sessions keep teacher-configured warnings and auto-submit behavior.
- `src/components/navigation/TeacherHeader.test.tsx` - Rebuilt the teacher-header suite around the active navigation context, current mobile resize behavior, and unambiguous role-based selectors so verification matches the live header contract.
- `src/pages/StudentDashboardPage.teachers.test.jsx` - Removed obsolete student-sidebar expectations, stubbed class-session unsubscribe behavior, and isolated the dashboard from live review widgets so current student activity-stream coverage passes cleanly.
- `src/__tests__/integration/StudentTestPage.test.tsx` - Replaced stale StudentTestPage harness assumptions with current connection-listener, scrolling, anti-cheat/no-op hook, async submit, and footer-based passage-navigation expectations so repo-wide verification can continue.
- `src/pages/TeacherCourseProfilePage.test.tsx` - Mocked class and announcement services and aligned course-profile expectations with the live overview/tab structure to stop verification from hitting RTDB.
- `src/pages/TeacherHomeworkListPage.test.tsx` - Replaced stale homework-page expectations with current targets-first coverage and aligned the mocked homework component surface with the live page.

### Files to Create
- `src/services/reportingService.ts` — Core singleton service handling error reporting, event tracking, queue management, batching, and resilience (circuit breaker, canary, quota). This is the heart of the entire system.
- `src/services/reportingService.test.ts` — Unit tests for reportingService.
- `src/config/featureRegistry.ts` — Centralized TypeScript registry of all tracked features: IDs, names, routes, actions, descriptions. Also exports `resolveFeatureFromRoute()` and `validateFeatureId()`.
- `src/config/featureRegistry.test.ts` — Unit tests for featureRegistry.
- `src/hooks/useFeatureTracking.ts` — React hook that auto-tracks page views on mount and returns a `trackAction()` function for instrumentation.
- `src/hooks/useFeatureTracking.test.ts` — Unit tests for useFeatureTracking.
- `src/hooks/useBreadcrumbs.ts` — Breadcrumb tracker module implementing a circular buffer of last 10 user actions with a single delegated event listener on `document.body`.
- `src/hooks/useBreadcrumbs.test.ts` — Unit tests for useBreadcrumbs.
- `src/pages/AdminReportsPage.tsx` — Admin-only reports page with 3 tabs: Feature Health Dashboard, Error Log, Live Feed.
- `src/pages/AdminReportsPage.css` — Styles for the AdminReportsPage.
- `src/components/TrackedRoute.tsx` — Wrapper component that calls `useFeatureTracking()` and renders children unchanged. Used to auto-track page views on every route.
- `src/components/DiagnosticViewerModal.tsx` — Full-screen modal for viewing diagnostic bundles fetched from the backup-storage R2. Shows log entries, breadcrumbs, and environment info.
- `documentation/rules/observability.md` — AI enforcement rules document for feature tracking registration.
- `.agent/skills/observability-tracking/SKILL.md` — Antigravity skill for feature tracking enforcement with examples and validation steps.

### Files to Modify
- `src/components/ErrorBoundary.tsx` — Add `reportingService.reportError()` call in `componentDidCatch` (L34-47). Replace the TODO comment at L44.
- `src/utils/diagnosticLogger.js` — Add `getLogsAsJSON()` method that returns logs as a JSON-serializable array (the existing `getLogs()` already returns the array, but verify it's JSON-safe).
- `src/services/firebase.js` — Add `import { getAnalytics } from 'firebase/analytics'` and export `analytics` instance.
- `src/config/routeSecurity.ts` — Add `/admin/reports` to the route security matrix so the new admin route is covered by the centralized role policy.
- `r2-backup-worker/src/index.ts` — Add `POST /api/diagnostic`, `GET /api/diagnostic/:errorId`, and `POST /api/purge-diagnostics` route handlers in the backup-storage R2 worker router (L287-393).
- `r2-backup-worker/src/utils/r2-client.ts` — Add deletion support for diagnostic bundle purging via the backup-storage R2 client.
- `r2-backup-worker/src/types.ts` — Add `DIAGNOSTIC_TOKEN` to the `WorkerEnv` interface.
- `r2-backup-worker/wrangler.toml` — No change needed for secrets (secrets are set via `wrangler secret put`), but document the required `DIAGNOSTIC_TOKEN` secret.
- `database.rules.json` — Add `/reports/` path with read (admin-only) and write (authenticated) rules as specified in FR-54.
- `src/pages/AdminDashboardPage.tsx` — Add a "Reports" quick-link card to the `quickLinks` array (L118-164) with error count summary.
- `src/pages/AdminSettingsPage.tsx` — Add a new "Reporting" section tab (alongside existing `api_keys` and `tags` tabs at L556-571) with mode selector and category toggles.
- `src/constants/routes.ts` — Add `ADMIN_REPORTS: '/admin/reports'` to the `ROUTES` object (L41-49 admin section).
- `src/App.jsx` — Add lazy import for `AdminReportsPage`, add `<Route>` at `/admin/reports` with `<PrivateRoute allowedRoles={['super_admin']}>` wrapper, and initialize `ReportingService` in the app root.
- `src/components/navigation/AdminSidebar.tsx` — Add `{ id: 'reports', label: 'Reports', icon: '📊' }` to the `navSections` 'System' section items array.
- `env.example.txt` — Example Vite environment values including `VITE_DIAGNOSTIC_TOKEN`, the existing `VITE_BACKUP_WORKER_URL` that points to the backup-storage R2 worker, and `VITE_BUILD_VERSION` for reporting.
- `AGENTS.md` — Add 3 rows to the integration safety rules table for observability enforcement and surface the observability skill in the Knowns guidance block.
- `GEMINI.md` — Add 3 rows to the integration safety rules table for observability enforcement and surface the observability skill in the Knowns guidance block.
- `CLAUDE.md` — Add 3 rows to the integration safety rules table for observability enforcement and surface the observability skill in the Knowns guidance block (if this file exists; verify first). If `CLAUDE.md` does not exist anywhere in the project, skip this file entirely and note it in the PR description.

### Notes

- Unit tests should be placed alongside the code files they are testing.
- Use `npx vitest run [optional/path]` to run tests. The project uses **Vitest**, not Jest.
- The project uses React Router v6 with `BrowserRouter` in `App.jsx`.
- Admin pages use `AdminLayout` component wrapping, `useAuth()` for auth state, and `useNavigation('admin')` for route navigation.
- RTDB is accessed via `firebase/database` from `src/services/firebase.js` which exports `database`.
- This feature MUST use the existing backup-storage Cloudflare R2 setup (`r2-backup-worker` / `VITE_BACKUP_WORKER_URL`). Do NOT use the separate user-upload R2 setup for observability diagnostics.
- The existing `DiagnosticLogger` at `src/utils/diagnosticLogger.js` is a singleton class with `getLogs()` (returns array of up to 500 entries), `getLogsAsText()`, `copyToClipboard()`, and `downloadLogs()`. It already intercepts `console.log/warn/error`. It uses `localStorage` with a fallback to memory-only mode (see `testLocalStorage()` in the constructor). This is fine — memory-only mode still captures logs for the current session.
- The existing `ErrorBoundary` at `src/components/ErrorBoundary.tsx` has a `TODO` comment at L44 for sending errors to a tracking service — this is the exact integration point.
- All routes are centralized in `src/constants/routes.ts` using a `ROUTES` constant object with `buildRoute()` and `extractParams()` helpers.
- The R2 backup worker at `r2-backup-worker/src/index.ts` uses a manual `if/else` route-matching pattern (L322-393), not a framework router. Follow this same pattern when adding new routes.
- Admin settings page (`AdminSettingsPage.tsx`) uses tab buttons for section switching (L556-571). It currently has `api_keys` and `tags` sections.
- Admin dashboard page (`AdminDashboardPage.tsx`) has a `quickLinks` array (L118-164) that renders cards in a grid. The Reports card should be added here. The icon imports come from `@tabler/icons-react` (see L16-22 of AdminDashboardPage.tsx).
- The `useNavigation` hook from `src/hooks/useNavigation` is used for all programmatic navigation. It takes a context string (e.g., `'admin'`) and returns `navigateTo(routeName, params, options)`.
- `PrivateRoute` component at `src/components/PrivateRoute.jsx` accepts `allowedRoles` prop for role-based access control.
- The `AdminSidebar` at `src/components/navigation/AdminSidebar.tsx` has **hardcoded** `navSections` array (L32-66) using emoji icons. Items follow the format: `{ id: string, label: string, icon: string (emoji) }`. When adding a new sidebar item, also update `handleSidebarNavigate` in ALL admin pages (see task 9.11 for details).
- **⚠️ MANTINE WARNING:** `AdminLayout.tsx` currently imports `{ Drawer } from '@mantine/core'` (line 2). This is a pre-existing rule violation (Rule 15: @mantine/* is banned). For PRD-0037, USE `AdminLayout` as-is to match existing admin pages. Do NOT add any new `@mantine/*` imports.
- **⚠️ VITE ENVIRONMENT:** This project uses **Vite**, not Webpack. Always use `import.meta.env.DEV` for development-only checks in new `.ts`/`.tsx` files. Never use `process.env.NODE_ENV` in new files (existing uses in the codebase are legacy patterns).
- **Toast notifications:** The project already has a toast system. Use `import { toast } from '../components/modern'` (or appropriate relative path) and call `toast.success('Title', 'Message')`. Do NOT create a custom toast implementation.
- **Environment variables for client-side code:** Any `VITE_*` variable used in code must also exist in the `.env` file (or `.env.local`). Reuse the existing backup-storage worker URL variable if one already exists under a different name (search `.env*` for `R2` or `BACKUP_WORKER`).
- **`crypto.randomUUID()` support:** Available in all modern browsers (Chrome 92+, Firefox 95+, Safari 15.4+). The task list includes a fallback at task 2.6 for older browsers. No polyfill needed.
- The `DiagnosticViewerModal.tsx` is a NEW file (listed in Files to Create). See task 7.3 for its full specification. It is a full-screen modal component, NOT a page — it's imported and rendered inside `AdminReportsPage.tsx`.

---

## Tasks

- [ ] 1.0 Core Infrastructure: Reporting Service, Feature Registry & Breadcrumbs
  - [x] 1.1 **Create `src/services/reportingService.ts` — Singleton class structure** (FR-1, FR-2, FR-6)
    - Create the file with a `ReportingService` class using a private constructor and a static `getInstance()` method (singleton pattern).
    - The class MUST expose these public methods: `reportError(error, context?)`, `trackAction(feature, action, metadata?)`, `trackPageView(feature, page)`, `getConfig()`, `setMode(mode)`, `flush()`.
    - Add a private `eventQueue: QueuedEvent[]` array and a private `isInitialized: boolean` flag.
    - Wrap the ENTIRE body of every public method in a `try/catch` block. The catch block MUST call `console.warn('[ReportingService] Internal error:', e)` and return silently. This is FR-6 — the reporting system must NEVER throw errors that could affect the host application.
    - Add an `init(auth, database)` method that accepts Firebase auth and database references, stores them, subscribes to config changes, sends the canary event, and sets `isInitialized = true`.
    - Export a singleton accessor: `export const reportingService = ReportingService.getInstance();`
    - **Do NOT implement queue flushing, RTDB writes, or resilience patterns in this sub-task** — those come in 1.2 and 9.5-9.8.
  - [x] 1.2 **Implement event queue and batch flushing** (FR-3, FR-4, FR-5)
    - Inside `reportingService.ts`, implement the queue flush mechanism:
      - `enqueue(event)` adds to `eventQueue`.
      - Flush triggers on: (a) queue reaches 10 events, OR (b) every 5 seconds via `setInterval`.
      - `flush()` method takes all events from the queue, groups them by type (`errors` vs `events`), and writes to RTDB using a single `update()` call.
      - The RTDB path for errors is `/reports/errors/{YYYY-MM-DD}/{pushId}`. The RTDB path for events is `/reports/events/{YYYY-MM-DD}/{pushId}`.
      - Use `push(ref(database, path))` to generate the pushId, then use `update()` to write the batch.
      - Date string format: `new Date().toISOString().split('T')[0]` → e.g., `'2026-03-17'`.
      - After flushing, clear the queue array.
      - Add a `window.addEventListener('beforeunload', () => this.flush())` in `init()` to flush on page close.
    - **Import pattern:** `import { ref, update, push } from 'firebase/database';` — use the `database` instance passed via `init()`.
  - [x] 1.3 **Create `src/config/featureRegistry.ts` — Feature definitions** (FR-39, FR-40)
    - Create the file with the `FeatureDefinition` interface: `{ id: string, name: string, routes: string[], actions: string[], description: string }`.
    - Export `FEATURE_REGISTRY: FeatureDefinition[]` with entries for ALL features listed in the PRD (L468-537):
      - `testTaking` (routes: `['/student-test/:sessionCode', '/student/practice/:materialId']`, actions: `['startTest', 'submitAnswer', 'nextQuestion', 'previousQuestion', 'finishTest', 'timeOut', 'abandonTest']`) — **NOTE:** The PRD listed `/thcs-practice/:id` but that route does NOT exist. The actual student practice route is `/student/practice/:materialId`. Verify against `src/constants/routes.ts`.
      - `testCreation` (routes: `['/teacher/test/create', '/teacher/test/review/:draftId', '/teacher/thcs-test/create', '/teacher/thcs-test/edit/:draftId']`, actions: `['createTest', 'editTest', 'publishTest', 'deleteTest', 'uploadDocument', 'parseDocument', 'aiGenerate']`)
      - `homework` (routes: `['/teacher/homework', '/teacher/homework/create', '/teacher/homework/:homeworkId', '/teacher/homework/:homeworkId/edit', '/student/homework', '/student/homework/:homeworkId']`, actions: `['assignHomework', 'submitHomework', 'reviewHomework', 'archiveHomework', 'bulkAssign']`)
      - `courses` (routes: `['/teacher/courses', '/teacher/courses/:courseId', '/student/courses', '/student/courses/:courseId', '/student/courses/catalog']`, actions: `['createCourse', 'editCourse', 'enrollStudent', 'syncCourse', 'addMaterial', 'addAnnouncement']`)
      - `aiOperations` (routes: `[]`, actions: `['generateFeedback', 'parseDocument', 'classifyQuestion', 'generateQuiz', 'aiRetry', 'aiFailure']`)
      - `authentication` (routes: `['/']`, actions: `['login', 'logout', 'register', 'resetPassword', 'roleSwitch']`)
      - `adminPanel` (routes: `['/admin/*']`, actions: `['viewDashboard', 'manageUsers', 'manageClasses', 'viewBackups', 'triggerBackup', 'purgeReports']`)
      - `academicRecords` (routes: `['/student/academic-record']`, actions: `['viewRecords', 'viewFeedback', 'requestFeedback']`) — **NOTE:** The PRD listed `/student/records` and `/teacher/records` but neither exists. The actual route is `/student/academic-record` (see `App.jsx` line ~332 and `routes.ts`). There is no teacher records page — teacher results are at `/teacher-results/:gameSessionId` which belongs to `testTaking` or a separate `results` feature. The `deleteAccount` and `downloadCertificate` actions were removed because these features currently do not exist in the codebase.
      - `results` (routes: `['/teacher-results/:gameSessionId', '/student-results/:gameSessionId']`, actions: `['viewResults', 'generateFeedback', 'viewQuestion']`) — **NOTE:** This is a NEW entry not in the PRD. These result pages exist in the codebase and should be tracked.
      - `profile` (routes: `['/profile', '/profile/complete']`, actions: `['editProfile', 'changePassword', 'updateAvatar']`) — **NOTE:** `deleteAccount` was removed because no account deletion feature exists in the codebase.
    - **IMPORTANT:** Cross-reference EVERY route pattern against `src/constants/routes.ts` (L10-92). If a PRD route doesn't match an actual route, use the actual route from `routes.ts`. For example, the PRD says `/test/:id` but the real route is `/student-test/:sessionCode`.
    - Add the developer note comment block at the end of the array (PRD L532-537).
    - Export `resolveFeatureFromRoute(pathname: string): string | null` — this function iterates `FEATURE_REGISTRY`, converts each route pattern's `:param` segments to regex wildcards (`[^/]+`), and tests against the pathname. Return the first matching `feature.id`, or `null` if none match.
      - **Special case for `/admin/*` wildcard:** Do NOT try to convert `*` to regex. Instead, handle this as a special case: `if (route === '/admin/*') return pathname.startsWith('/admin/')`. Place this check BEFORE the regex matching loop.
      - **Regex conversion for `:param` patterns:** For each route like `/student-test/:sessionCode`, convert to a regex like `^/student-test/[^/]+$` by replacing all `:[^/]+` segments with `[^/]+` and anchoring with `^` and `$`.
    - Export `validateFeatureId(featureId: string): boolean` — returns true if `featureId` exists in the registry. In development (`import.meta.env.DEV`), log `console.warn('[FeatureRegistry] Unknown feature ID: ' + featureId)` for unknown feature IDs.
  - [x] 1.4 **Create `src/hooks/useBreadcrumbs.ts` — Breadcrumb tracker** (FR-15, FR-16, FR-17, FR-18)
    - This is NOT a React hook — it's a plain TypeScript module that manages breadcrumbs in memory. **Keep the filename as `src/hooks/useBreadcrumbs.ts` per the PRD and the "Files to Create" section**, even though it's not a React hook. This is for consistency with the PRD naming. The exported functions are plain functions (`initBreadcrumbs`, `addBreadcrumb`, `addNavigationBreadcrumb`, `getBreadcrumbs`), NOT a hook that returns values.
    - Define `BreadcrumbEntry` type: `{ type: 'navigation' | 'click' | 'submit', target: string, timestamp: number, timeSincePageLoad: number }`.
    - Implement a circular buffer (max 10 entries) using a plain array with `push` + `shift` when length exceeds 10.
    - Export `initBreadcrumbs()` — call this once at app startup. It:
      - Stores `lastPageLoadTime = Date.now()`.
      - Adds a single delegated `click` event listener on `document.body`. The listener checks if the clicked element (or its closest ancestor) is a `button`, `a`, or has a `data-track` attribute. If so, extract the text content (`.textContent?.trim()?.substring(0, 80)` or `data-track` value) and call `addBreadcrumb('click', text)`.
      - Adds a single delegated `submit` event listener on `document.body` for `<form>` submissions.
      - Does NOT add individual listeners to every element.
    - Export `addBreadcrumb(type, target)` — creates a `BreadcrumbEntry` with `timestamp: Date.now()` and `timeSincePageLoad: Date.now() - lastPageLoadTime`, pushes to the buffer.
    - Export `addNavigationBreadcrumb(url)` — calls `addBreadcrumb('navigation', url)` and resets `lastPageLoadTime = Date.now()`.
    - Export `getBreadcrumbs(): BreadcrumbEntry[]` — returns a copy of the current buffer.
  - [x] 1.5 **Write unit tests for featureRegistry** 
    - Create `src/config/featureRegistry.test.ts`.
    - Test `resolveFeatureFromRoute`:
      - Known route `/student-test/ABC123` → `'testTaking'`
      - Known route `/teacher/homework` → `'homework'`
      - Known route `/admin/dashboard` → `'adminPanel'` (wildcard)
      - Unknown route `/unknown/page` → `null`
    - Test `validateFeatureId`:
      - Known ID `'testTaking'` → `true`
      - Unknown ID `'nonexistent'` → `false`
    - Test that ALL entries in `FEATURE_REGISTRY` have required fields (id, name, routes, actions, description).
  - [x] 1.6 **Write unit tests for reportingService**
    - Create `src/services/reportingService.test.ts`.
    - Test singleton pattern: `ReportingService.getInstance()` returns same instance.
    - Test that public methods (`reportError`, `trackAction`, `trackPageView`) do not throw even when service is not initialized.
    - Test queue mechanics: calling `trackAction` adds to the internal queue.
    - Test `flush()`: after adding events, flush empties the queue.
    - Mock Firebase `update` and `push` calls.
  - [x] 1.7 **Write unit tests for useBreadcrumbs**
    - Create `src/hooks/useBreadcrumbs.test.ts`.
    - Test the 10-entry circular buffer behavior.
    - Test delegated click and submit capture from `initBreadcrumbs()`.
    - Test that `addNavigationBreadcrumb()` resets the page-load timer used by subsequent breadcrumbs.

- [ ] 2.0 Error Capture Layer: Global Handlers, ErrorBoundary Integration & Diagnostic Bundles
  - [x] 2.1 **Add global `window.onerror` handler in reportingService** (FR-7)
    - In `reportingService.ts`'s `init()` method:
      - **First**, store a reference to any existing handler: `const previousOnError = window.onerror;`
      - **Then** register: `window.onerror = (message, source, lineno, colno, error) => { ... }`.
      - Inside the handler, call `this.reportError(error || new Error(String(message)), { source, lineno, colno })`.
      - **After** reporting, if `previousOnError` exists, call it: `if (previousOnError) previousOnError.call(window, message, source, lineno, colno, error);` — this chains handlers instead of overwriting.
      - Set severity to `'error'` for regular errors.
      - The handler MUST be wrapped in try/catch per FR-6.
  - [x] 2.2 **Add global `window.onunhandledrejection` handler** (FR-8)
    - In `init()`, register `window.addEventListener('unhandledrejection', (event) => { ... })`.
    - Extract the error from `event.reason` (handle case where reason is not an Error object — wrap in `new Error(String(event.reason))`).
    - Call `this.reportError(error, { type: 'unhandledPromiseRejection' })`.
    - Set severity to `'error'`.
  - [x] 2.3 **Modify `ErrorBoundary.tsx` — Add reportError call** (FR-9)
    - In `componentDidCatch` method (L34-47 of `src/components/ErrorBoundary.tsx`):
      - Import `reportingService` from `../services/reportingService`.
      - Replace the TODO comment at L44-46 with: `reportingService.reportError(error, { componentStack: errorInfo.componentStack, isBoundary: true });`
      - Do NOT remove the existing `console.error` or `this.props.onError` calls — add the reportingService call alongside them.
  - [x] 2.4 **Implement `contextData` extraction** (FR-10)
    - In the `reportError()` method of `reportingService.ts`, extract `contextData` from the current URL:
      - Parse `window.location.pathname` to extract entity IDs. Look for URL segments that follow known patterns:
        - `/student-test/:sessionCode` → `{ sessionCode }` 
        - `/teacher/homework/:homeworkId` → `{ homeworkId }`
        - `/teacher/courses/:courseId` → `{ courseId }`
        - `/teacher/thcs-test/edit/:draftId` → `{ draftId }`
      - Use the `extractParams` function from `src/constants/routes.ts` — iterate all route names, call `extractParams(routeName, pathname)`, and use the first non-null result.
      - Also include any `context` argument passed to `reportError()` (merged with URL-derived data).
      - Parse `window.location.search` into an object for `searchParams`.
    - The final `contextData` object in the error record should contain: `{ ...urlParams, ...userProvidedContext, routeParams: { ...urlParams }, searchParams: { ...parsedQueryString } }`.
  - [x] 2.5 **Implement error rate limiting** (FR-11)
    - In `reportError()`, before enqueuing:
      - Compute an error signature: `${error.message}::${window.location.pathname}`.
      - Maintain a `Map<string, { count: number, firstId: string, firstRtdbPath: string, resetTimer: ReturnType<typeof setTimeout> }>` in the service. Do NOT use `NodeJS.Timeout` — use `ReturnType<typeof setTimeout>` (this is browser code, not Node.js).
      - If this signature has been seen <5 times in the current minute, allow the report.
      - If ≥5 times, **update** the `duplicateCount` field on the **first** occurrence's RTDB record:
        - You stored the first occurrence's RTDB path as `firstRtdbPath` (e.g., `/reports/errors/2026-03-17/-Nxyz123`).
        - Read the current `duplicateCount` from the map's `count` field (do NOT re-read from RTDB).
        - Call `update(ref(database, firstRtdbPath), { duplicateCount: count })` to update the count in RTDB.
      - After 60 seconds, reset the counter for that signature (use `setTimeout`). In the timeout callback, delete the signature key from the Map.
      - When the first report for a signature is enqueued, store its generated `id` and RTDB path in the Map for later reference.
  - [x] 2.6 **Build the error report object** (FR-10)
    - In `reportError()`, construct the full error record object matching the schema in PRD §9 (L853-881):
      - `id`: Use `crypto.randomUUID()` if available, otherwise `Date.now().toString(36) + Math.random().toString(36).substring(2)`.
      - `timestamp`: `Date.now()`
      - `feature`: Call `resolveFeatureFromRoute(window.location.pathname)` from featureRegistry. If null, use `'unregistered'`.
      - `severity`: Determine from context — `'crash'` if from ErrorBoundary, `'error'` for global handlers, or accept from caller.
      - `message`: `error.message` (truncate to 500 chars).
      - `stack`: `error.stack` (truncate to 2000 chars).
      - `page`: `window.location.pathname`
      - `userId`: From stored auth reference — `this.auth.currentUser?.uid || 'pre-auth'`.
      - `userName`: `this.auth.currentUser?.displayName || 'Pre-authentication'`.
      - `userRole`: Read from the RTDB user profile. In `init()`, subscribe to the current user's role via `onValue(ref(database, 'users/' + uid + '/role'), (snapshot) => { this.currentUserRole = snapshot.val() || 'unknown'; })`. Use `onAuthStateChanged` to update the subscription when the user changes. Then use `this.currentUserRole` here.
      - `browser`: `navigator.userAgent.substring(0, 200)`.
      - `screenSize`: `${window.innerWidth}x${window.innerHeight}`.
      - `isBoundary`: From context argument.
      - `contextData`: From step 2.4.
      - `breadcrumbs`: Call `getBreadcrumbs()` from useBreadcrumbs.
      - `diagnosticUrl`: Set to `null` initially — updated after R2 upload.
      - `componentStack`: From context argument if available.
      - `duplicateCount`: `1`.
    - If the user is not authenticated (`this.auth.currentUser === null` and `userId === 'guest'`), log to `console.warn` only and do NOT write to RTDB (FR-54 note about guest users).
  - [x] 2.7 **Implement diagnostic bundle packaging and upload** (FR-19, FR-20, FR-21)
    - After building the error report in `reportError()`, if severity is `'crash'` or `'error'`:
      - Import `getDiagnosticLogger` from `../../utils/diagnosticLogger`.
      - Call `const logs = getDiagnosticLogger()?.getLogs() || []` to get up to 500 log entries.
      - Build the diagnostic bundle JSON object matching PRD §5.5 (L281-309):
        ```
        { errorId, timestamp, error: { message, stack, componentStack }, user: { id, name, role }, 
          environment: { browser, screenSize, page, buildVersion }, breadcrumbs, diagnosticLogs: logs }
        ```
      - `buildVersion`: Read from `import.meta.env.VITE_BUILD_VERSION || 'unknown'`.
      - Upload via `fetch()` to the backup-storage R2 worker: `POST {WORKER_URL}/api/diagnostic` with body = JSON string, headers = `{ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + import.meta.env.VITE_DIAGNOSTIC_TOKEN }`.
      - The worker URL must point to the existing backup-storage R2 worker, not the user-upload R2 worker. Reuse the repo's existing env variable name for that worker instead of inventing a parallel upload-worker variable.
      - This upload is **fire-and-forget** — use `.then()` and `.catch()`:
        - On success: parse response JSON, extract `url` field, update the RTDB error record's `diagnosticUrl` via `update(ref(database, path), { diagnosticUrl: url })`.
        - On failure: `console.warn('[Reporting] Diagnostic upload failed:', e)`, update RTDB with `{ diagnosticUrl: 'upload-failed' }`.
      - Do NOT `await` the upload — let it run in the background.

- [ ] 3.0 Backup-Storage R2 Worker: Diagnostic Upload & Purge Endpoints
  - [x] 3.1 **Add `POST /api/diagnostic` route to `r2-backup-worker/src/index.ts`** (FR-22)
    - In the `handleRequest` function (L289-393), add a new route block **before** the final `return errorResponse('Not found', 404)` at L393:
      ```
      if (method === 'POST' && path === '/api/diagnostic') {
          return handleDiagnosticUpload(request, env, r2);
      }
      ```
    - This route belongs to the backup-storage R2 worker, not the user-upload R2 flow.
    - This route does NOT require Firebase admin auth (unlike `/api/backup/*`). Instead, it uses a shared secret token:
      - Extract `Authorization` header, expect `Bearer <token>`.
      - Compare against `env.DIAGNOSTIC_TOKEN` (a Wrangler secret).
      - If mismatch, return `errorResponse('Unauthorized', 403)`.
    - **This means the route check must be placed BEFORE the existing `if (path.startsWith('/api/'))` admin auth block at L304**, OR the diagnostic route can be added as a special case inside that block with different auth logic. Recommended approach: add a separate check before the admin auth block:
      ```
      // Diagnostic upload uses shared secret, not Firebase admin auth
      if (method === 'POST' && path === '/api/diagnostic') {
          const token = request.headers.get('Authorization')?.replace('Bearer ', '');
          if (token !== env.DIAGNOSTIC_TOKEN) {
              return errorResponse('Unauthorized', 403);
          }
          return handleDiagnosticUpload(request, r2);
      }
      ```
  - [x] 3.2 **Implement `handleDiagnosticUpload` function**
    - Create an async function `handleDiagnosticUpload(request: Request, r2: BackupR2Client)`:
      - Check `Content-Length` header — if > 500 * 1024 (500KB), return `errorResponse('Payload too large', 413)`.
      - Parse request body as JSON: `const bundle = await request.json()`.
      - Validate that `bundle.errorId` exists.
      - Compute the R2 key: `diagnostic-reports/${new Date().toISOString().split('T')[0]}/${bundle.errorId}.json`.
      - Upload to R2: `await r2.putObject(key, JSON.stringify(bundle), 'application/json')` — check the existing `BackupR2Client` class methods in `r2-backup-worker/src/utils/r2-client.ts` for the correct method name and signature.
      - Construct the retrieval URL as a **worker proxy URL** (NOT a direct R2 public URL — the R2 bucket is NOT public). The URL format is: `${workerBaseUrl}/api/diagnostic/${bundle.errorId}` where `workerBaseUrl` is derived from the request URL origin (`new URL(request.url).origin`). This URL will be served by the GET endpoint in task 3.6.
      - Return `jsonResponse({ success: true, url: proxyUrl })`.
    - Wrap the entire function in try/catch, returning `errorResponse('Upload failed', 500)` on errors.
  - [x] 3.3 **Add `POST /api/purge-diagnostics` route** (FR-47)
    - Add another route block:
      ```
      if (method === 'POST' && path === '/api/purge-diagnostics') {
          return handlePurgeDiagnostics(request, env, r2);
      }
      ```
    - This route MUST use Firebase admin auth (same as other `/api/` routes) — so place it inside the admin-auth-protected section.
    - Implement `handlePurgeDiagnostics`:
      - Parse body: `{ cutoffDate: 'YYYY-MM-DD' }`.
      - List all objects in R2 with prefix `diagnostic-reports/`.
      - Filter objects whose date folder is older than `cutoffDate`.
      - Delete matching objects. **First check `r2-backup-worker/src/utils/r2-client.ts` for a `deleteObject` method.** If it doesn't exist, add one to the `BackupR2Client` class: `async deleteObject(key: string): Promise<void> { await this.bucket.delete(key); }`. Use this method: `await r2.deleteObject(key)`.
      - Return `jsonResponse({ success: true, deletedCount: count })`.
  - [x] 3.4 **Add `DIAGNOSTIC_TOKEN` secret documentation**
    - Add a comment in `r2-backup-worker/wrangler.toml` documenting: `# Required secret: DIAGNOSTIC_TOKEN — set via 'wrangler secret put DIAGNOSTIC_TOKEN'`.
    - Also add `DIAGNOSTIC_TOKEN` to the `WorkerEnv` interface in `r2-backup-worker/src/types.ts`.
  - [x] 3.5 **Ensure CORS headers for diagnostic route**
    - The existing `corsPreflightResponse()` at L45-55 handles OPTIONS. Verify that the `Access-Control-Allow-Headers` includes `Authorization` (it does — L51). No additional CORS work needed, but verify the diagnostic route also returns CORS headers in its JSON response (the existing `jsonResponse` helper at L29-38 already includes CORS headers).
  - [x] 3.6 **Add `GET /api/diagnostic/:errorId` route for fetching diagnostic bundles** (C7-fix)
    - This endpoint is REQUIRED for the "View Full Diagnostic" feature in the admin UI (task 7.3). Without it, the `diagnosticUrl` stored in RTDB has no way to retrieve the data.
    - Add a new route block inside the admin-auth-protected section (same auth as `/api/backup/*`):
      ```
      if (method === 'GET' && path.startsWith('/api/diagnostic/')) {
          const errorId = path.replace('/api/diagnostic/', '');
          return handleGetDiagnostic(errorId, r2);
      }
      ```
    - Implement `handleGetDiagnostic(errorId: string, r2: BackupR2Client)`:
      - Search for the diagnostic bundle in R2. Since bundles are stored by date (`diagnostic-reports/{date}/{errorId}.json`), list objects with prefix `diagnostic-reports/` and find the one matching `errorId.json`.
      - Alternatively, store a flat index: during upload (task 3.2), also store the key under `diagnostic-reports/index/${errorId}` with the full path. Then retrieval is: `const indexEntry = await r2.getObject('diagnostic-reports/index/' + errorId); const fullKey = await indexEntry.text(); const bundle = await r2.getObject(fullKey);`.
      - **Simpler approach (recommended):** List objects with prefix `diagnostic-reports/` and suffix filter for `/${errorId}.json`. R2's `list()` API supports prefix but not suffix, so list all objects under `diagnostic-reports/` and find the match client-side. Since diagnostic bundles are small in number (<100/day for <10 users), this is acceptable.
      - Return the bundle JSON: `return new Response(bundleBody, { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } })`.
      - If not found, return `errorResponse('Diagnostic bundle not found', 404)`.
  - [x] 3.7 **Add environment variables to `.env.example`**
    - Add the following entries to the project's `.env.example` (or `.env.local.example`) file:
      ```
      # Reporting & Observability (PRD-0037)
      VITE_DIAGNOSTIC_TOKEN=your_shared_secret_here
      VITE_R2_BACKUP_WORKER_URL=https://your-backup-storage-r2-worker.your-subdomain.workers.dev
      VITE_BUILD_VERSION=local-dev
      ```
    - Check if the backup-storage worker URL already exists under a different name by searching `.env*` files for `R2` or `BACKUP_WORKER` or `WORKER_URL`. If it exists, reuse the existing variable name in the reporting code instead of creating a duplicate.
    - Implementation note: the repo already uses `VITE_BACKUP_WORKER_URL` in `.env` and `reportingService.ts`, and that variable should continue pointing at the backup-storage R2 worker used by this observability feature.

- [ ] 4.0 Feature Tracking Layer: useFeatureTracking Hook, Route-Level Auto-Tracking & Firebase Analytics
  - [x] 4.1 **Create `src/hooks/useFeatureTracking.ts`** (FR-12)
    - Import `useEffect` from React, `resolveFeatureFromRoute` and `validateFeatureId` from featureRegistry, and `reportingService` from reportingService.
    - The hook accepts `featureName?: string` (optional — if not provided, auto-resolve from current route).
    - On mount (`useEffect` with empty deps):
      - If `featureName` is provided, call `validateFeatureId(featureName)`.
      - If not provided, call `resolveFeatureFromRoute(window.location.pathname)` to auto-detect.
      - Call `reportingService.trackPageView(resolvedFeature || 'unregistered', window.location.pathname)`.
    - Return `{ trackAction: (actionName: string, metadata?: Record<string, unknown>) => void }`.
    - The returned `trackAction` function calls `reportingService.trackAction(resolvedFeature, actionName, metadata)`.
  - [x] 4.2 **Create route-level auto-tracking wrapper** (FR-13)
    - Decide on approach: either (a) create a wrapper component `<TrackedRoute>` that wraps children and calls `useFeatureTracking()` on mount, OR (b) create a layout component that sits at the route level.
    - **Recommended approach (a):** Create a `TrackedRoute` component in `src/components/TrackedRoute.tsx` that:
      - Accepts `children` and optional `featureName` props.
      - Calls `useFeatureTracking(featureName)` internally.
      - Renders `children` unchanged.
    - In `App.jsx`, wrap each `<PrivateRoute>` content with `<TrackedRoute>`. Example:
      ```jsx
      <Route path="/admin/dashboard" element={
        <PrivateRoute allowedRoles={['super_admin']}>
          <TrackedRoute>
            <AdminDashboardPage />
          </TrackedRoute>
        </PrivateRoute>
      } />
      ```
    - If `featureName` is not passed, `TrackedRoute` auto-resolves via `resolveFeatureFromRoute`. This means new pages are tracked automatically without ANY code changes — only the registry needs updating.
    - Also add `addNavigationBreadcrumb(window.location.pathname)` call in this component's mount effect.
  - [x] 4.3 **Initialize Firebase Analytics** (FR-49)
    - In `src/services/firebase.js`:
      - Add `import { getAnalytics } from 'firebase/analytics';`
      - **Verify `firebase/analytics` is available:** Check `package.json` for `"firebase"` dependency version. The analytics module is included in the `firebase` package (v9+). If the import fails at runtime, it may be because no `measurementId` is present in `firebaseConfig`. In that case, wrap initialization in try/catch.
      - After `const app = initializeApp(firebaseConfig);` (L25), add:
        ```javascript
        let analytics = null;
        try {
          analytics = getAnalytics(app);
        } catch (e) {
          console.warn('[Firebase] Analytics initialization failed (likely no measurementId):', e.message);
        }
        ```
      - Add `analytics` to the export statement at L66: `export { database, auth, firestore, googleProvider, analytics };`
      - **IMPORTANT:** In all code that uses `analytics`, always check `if (analytics)` before calling `logEvent`. Analytics being `null` means it's unavailable (but NOT an error — the rest of the app works fine).
  - [x] 4.4 **Send subset of events to Firebase Analytics** (FR-50, FR-51)
    - In `reportingService.ts`, import `analytics` from firebase.js and `logEvent` from `firebase/analytics`.
    - In the `flush()` method, after RTDB writes, also send events to Firebase Analytics:
      - For errors: `logEvent(analytics, 'error_occurred', { feature, severity, error_code: message.substring(0, 40) })`.
      - For page views: `logEvent(analytics, 'screen_view', { firebase_screen: page, firebase_screen_class: feature })`.
      - For actions: `logEvent(analytics, 'feature_used', { feature, action })`.
    - Wrap Analytics calls in try/catch — Analytics failures should never block RTDB writes.
    - Check `this.currentMode` — if mode is `'off'`, do NOT send Analytics events either (FR-51).
  - [x] 4.5 **Write unit tests for useFeatureTracking**
    - Create `src/hooks/useFeatureTracking.test.ts`.
    - Test that mounting with a valid featureName calls `trackPageView`.
    - Test that mounting without featureName auto-resolves from the current route.
    - Test that `trackAction` calls `reportingService.trackAction` with correct arguments.
    - Mock `reportingService` and `window.location.pathname`.

- [ ] 5.0 Admin Reports Page: Feature Health Dashboard, Error Log & Live Feed
  - [x] 5.1 **Create `AdminReportsPage.tsx` — Page shell with 3 tabs** (FR-23, FR-24)
    - Create `src/pages/AdminReportsPage.tsx` following the exact same patterns as `AdminDashboardPage.tsx` and `AdminSettingsPage.tsx`:
      - Import `useAuth`, `useNavigation('admin')`, `AdminLayout`.
      - Check `profile?.role === 'super_admin'` — show "Access Denied" if not.
      - Render `<AdminLayout pageTitle="Production Reports" currentPage="reports" onNavigate={handleSidebarNavigate} onLogout={handleLogout} userRole={profile?.role}>`.
      - Copy the `handleLogout` and `handleSidebarNavigate` patterns exactly from `AdminDashboardPage.tsx` (L93-115).
    - Implement 3 tab buttons: "Feature Health" (default), "Error Log", "Live Feed".
    - Use `useState<'health' | 'errors' | 'live'>('health')` for active tab.
    - Render the corresponding tab content component based on active tab.
    - Add header with: page title "Production Reports 📊", back button (→ navigates to `'ADMIN_DASHBOARD'`), and a reporting mode indicator badge (🟢 Full / 🟡 Errors Only / 🔴 Off). Read mode from RTDB `/reports/config/mode` using `onValue` listener.
    - The `handleSidebarNavigate` function MUST include ALL admin page routes in its `pageRoutes` map. Copy the full map from `AdminDashboardPage.tsx` and add `'reports': 'ADMIN_REPORTS'`.
  - [x] 5.2 **Feature Health Dashboard tab** (FR-25, FR-26, FR-27)
    - Within AdminReportsPage (or as a separate component `FeatureHealthTab`):
    - Read ALL error records from `/reports/errors/{today}` and `/reports/errors/{yesterday}` via `onValue`.
    - Read ALL event records from `/reports/events/{today}` via `onValue`.
    - Import `FEATURE_REGISTRY` from featureRegistry.
    - For each feature in the registry, compute:
      - `errors24h`: Count of errors where `feature === featureId` and `timestamp > Date.now() - 86400000`.
      - `lastError`: Most recent error timestamp for this feature.
      - `status`: 🟢 if 0 errors in 24h, 🟡 if 1-5 errors OR crash in 72h, 🔴 if >5 errors OR crash in 24h.
      - `usage24h`: Count of action events for this feature in last 24h.
    - Render a grid/table with columns: Feature Name, Errors (24h), Last Error (relative time), Status (emoji), Usage (24h).
    - Clicking a feature row sets active tab to `'errors'` and sets a filter state for that feature.
    - Style with existing Card/glass patterns from the codebase.
  - [x] 5.3 **Error Log tab — List with filters** (FR-28, FR-29)
    - Create the error log tab component.
    - Read error records from RTDB `/reports/errors/` — initially load last 3 days.
    - Implement filter controls:
      - **Feature filter:** `<select>` populated from `FEATURE_REGISTRY.map(f => f.name)`.
      - **Severity filter:** checkboxes for crash/error/warning.
      - **Date range:** two `<input type="date">` fields.
      - **User filter:** text `<input>` that filters by `userName` (case-insensitive substring match).
      - **Sort:** dropdown: "Newest first" (default), "By frequency" (sort by `duplicateCount` desc).
    - Render each error as a row showing: severity icon (🔴🟠🟡), message (truncated to 100 chars), feature name, user name + role badge, relative timestamp ("5m ago"), duplicate count badge.
    - **Duplicate count badge display:** If error record has `duplicateCount > 1`, show a badge like `×3` (times 3) next to the severity icon. This indicates the same error was suppressed N-1 times by the rate limiter (task 2.5). The badge should be visually distinct — use a small rounded pill with a muted background (e.g., `background: #4b5563; color: white; border-radius: 12px; padding: 2px 8px; font-size: 0.75rem;`). If `duplicateCount` is 1 or undefined, do NOT show the badge.
    - Apply all filters client-side (the data is small at <10 users).
  - [x] 5.4 **Error detail expandable panel** (FR-30)
    - Clicking an error row toggles an inline detail panel (use `useState` to track which error ID is expanded).
    - The detail panel shows:
      - Full error message (not truncated).
      - Full stack trace in a `<pre>` block with horizontal scroll.
      - Breadcrumbs list (numbered, with timestamps and types).
      - Browser + screen info.
      - User details (ID, name, role).
      - `contextData` rendered as a formatted JSON block.
      - **"View Full Diagnostic" button** — only shown if `diagnosticUrl` exists and is not `'upload-failed'`. Clicking it fetches the diagnostic bundle from R2 and opens the DiagnosticViewerModal (see task 7.3).
      - **"📋 Copy for Antigravity" button** (see task 7.1).
  - [x] 5.5 **Live Feed tab** (FR-31, FR-32, FR-33)
    - Create the live feed tab component.
    - Subscribe to RTDB using `onChildAdded` on:
      - `query(ref(database, '/reports/errors/' + todayDate), limitToLast(50))` — use `limitToLast(50)` to avoid a burst of events when the listener first attaches on a date with many existing records. Import `query` and `limitToLast` from `firebase/database`.
      - `query(ref(database, '/reports/events/' + todayDate), limitToLast(50))`.
    - **IMPORTANT:** `onChildAdded` fires once for each EXISTING record matching the query, then once for each NEW record. This means the initial load will fire up to 50 times. Handle this by setting a `isInitialLoad = true` flag, switching it to `false` after a `setTimeout(0)` (next tick), and only auto-scrolling when `isInitialLoad` is false.
    - Display events in a scrollable list, newest at top.
    - Each entry shows: timestamp, type icon (🔴 error, 📊 event, 👀 pageView), feature name, action/error message, user name.
    - Implement pause/resume toggle:
      - When paused, events still accumulate in state but the list doesn't auto-scroll.
      - Show a badge: "12 new events" when paused with pending events.
      - Clicking the badge or resuming scrolls to top.
    - On component unmount, call `off()` to unsubscribe from RTDB listeners.
  - [x] 5.6 **Create `AdminReportsPage.css`**
    - Define styles for: tab bar, health grid, error list, expandable panels, filter controls, live feed, severity colors (red=#ef4444, orange=#f59e0b, yellow=#eab308, green=#22c55e), status badges, scrollable containers.
    - Follow existing CSS patterns in the codebase (check `AdminBackupPage.css` for reference).
    - Ensure responsive layout — cards on mobile (<768px), table on desktop.

- [ ] 6.0 Kill Switch System, Data Retention & Admin Settings Integration
  - [x] 6.1 **Implement mode reading and subscription in reportingService** (FR-41, FR-42, FR-43)
    - In `init()`, subscribe to `/reports/config/mode` via `onValue(ref(database, '/reports/config/mode'), (snapshot) => { this.currentMode = snapshot.val() || 'full'; })`.
    - Store `currentMode: 'full' | 'errors-only' | 'off'` as a private field, default `'full'`.
    - In `reportError()`: check `this.currentMode !== 'off'` before proceeding. Also check category toggles.
    - In `trackAction()` and `trackPageView()`: check `this.currentMode === 'full'` before proceeding. In `'errors-only'` mode, these calls return immediately.
    - When mode changes to `'off'`, immediately clear the event queue (do NOT flush pending events).
  - [x] 6.2 **Implement category-level toggles** (FR-44)
    - Subscribe to `/reports/config/categories/` via `onValue`.
    - Store as `{ errors: boolean, events: boolean, performance: boolean, diagnostics: boolean }`.
    - In `reportError()`: skip if `!categories.errors`.
    - In `trackAction()`/`trackPageView()`: skip if `!categories.events`.
    - In diagnostic bundle upload: skip if `!categories.diagnostics`.
  - [x] 6.3 **Add "Reporting & Observability" section to AdminSettingsPage** (FR-45)
    - In `src/pages/AdminSettingsPage.tsx`:
      - Add `'reporting'` to the `activeSection` state type (currently `'api_keys' | 'tags'`).
      - Add a new tab button "Reporting" alongside API Keys and Tags (L556-571).
      - Create a `ReportingSettingsSection` component (inline or separate file):
        - **Mode selector:** 3 buttons (Full / Errors Only / Off) that write to RTDB `/reports/config/mode`.
        - **Advanced panel** (collapsible, only shown in Full mode): 4 toggle switches for `errors`, `events`, `performance`, `diagnostics` categories. Each toggle writes to `/reports/config/categories/{name}`.
        - **Retention config:** number input for `autoPurgeDays` with save button (writes to `/reports/config/retention/autoPurgeDays`). Default value when the RTDB path doesn't exist yet: **30 days**. Show this as the placeholder in the input.
        - Use `set(ref(database, path), value)` from `firebase/database` for writes.
        - Read current values via `onValue` listeners on mount. If the values don't exist yet (first time), use defaults: `mode: 'full'`, all categories: `true`, `autoPurgeDays: 30`.
  - [x] 6.3a **Link reporting settings to the Reports workspace**
    - Add a direct "Open Reports Workspace" / manage-data CTA inside the Reporting settings section so admins can jump straight to the purge and diagnostics tools without searching the sidebar.
    - Keep the purge workflow centralized on `AdminReportsPage` instead of duplicating it in Settings.
  - [x] 6.4 **Implement data retention warning badge** (FR-48)
    - On the Admin Reports page header, show a warning badge when oldest data exceeds the configured `autoPurgeDays` threshold.
    - To check: query the first key from `/reports/errors/` (the date folders are sorted chronologically), parse the date, compare against `Date.now() - autoPurgeDays * 86400000`.
    - Display: "⚠️ Data older than 30 days exists. Consider purging." as a dismissible banner.
  - [x] 6.5 **Implement purge button with confirmation** (FR-47)
    - On the Admin Reports page, add a "🗑️ Purge Old Data" button.
    - On click, open a confirmation dialog/modal:
      - Show a number input for "Delete data older than ___ days" (default: 30).
      - Show "Cancel" and "Purge" buttons.
    - On confirm:
      - Iterate all date keys in `/reports/errors/` and `/reports/events/`.
      - For each date key older than the cutoff, call `remove(ref(database, '/reports/errors/' + dateKey))` and `remove(ref(database, '/reports/events/' + dateKey))`.
      - Also call `fetch(WORKER_URL + '/api/purge-diagnostics', { method: 'POST', body: JSON.stringify({ cutoffDate }) })` to purge R2 bundles.
      - Show a progress indicator and result summary ("Deleted 45 error records, 120 events, 12 diagnostic bundles").

- [ ] 7.0 Copy for Antigravity Button & Diagnostic Bundle Viewer Modal
  - [x] 7.1 **Implement "📋 Copy for Antigravity" button and markdown template** (FR-36, FR-37, FR-37a, FR-37b)
    - In the error detail panel (from task 5.4), add a button labeled "📋 Copy for Antigravity".
    - On click, build the markdown string exactly matching the template in PRD L407-447:
      - Header: `## Error Report [ERR-{errorId}]`, feature, severity, user, page, timestamp.
      - `### Error` — full message + full stack trace (NOT the truncated 2000-char version from RTDB — if the diagnostic bundle has been loaded, use the full stack from there).
      - `### Component Stack` — if available.
      - `### Context Data (Samples)` — render all key-value pairs from `contextData`.
      - `### Last 10 User Actions (Breadcrumbs)` — numbered list with timestamps.
      - `### Environment` — browser, screen, build version.
      - `### Recent Diagnostic Logs (Last 50 Entries)` — inline log entries in format `[{time}] [{level}] {message} {data}`.
        - If the admin has already clicked "View Full Diagnostic" and loaded the full bundle, include ALL 500 entries instead of 50 (FR-37b).
        - If the bundle hasn't been loaded, use the `getDiagnosticLogger().getLogs().slice(-50)` for the most recent 50 entries from the current session (these are local logs, not the erroring user's logs — note this limitation clearly in the markdown: "Note: These logs are from the admin's current session. For the original user's logs, see the Full Diagnostic Bundle URL below.").
        - **Correction:** The error record in RTDB does NOT contain the raw diagnostic logs — those are in R2. So the inline logs should be populated from the loaded R2 bundle if available, OR note that they're unavailable inline.
      - `### Full Diagnostic Bundle URL` — the `diagnosticUrl` or "Upload failed".
      - Footer: "Diagnose this error and suggest a fix..." prompt.
    - Copy the string to clipboard. Use this pattern with fallback:
      ```javascript
      try {
        await navigator.clipboard.writeText(markdown);
        toast.success('✅ Copied to clipboard', 'Error report ready for Antigravity');
      } catch (err) {
        // Fallback for non-HTTPS or older browsers
        const textarea = document.createElement('textarea');
        textarea.value = markdown;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        toast.success('✅ Copied to clipboard', 'Error report ready for Antigravity');
      }
      ```
      - **Why the fallback:** `navigator.clipboard.writeText()` requires HTTPS or `localhost`. If the app is opened via HTTP on a local network, the API will fail. The `document.execCommand('copy')` fallback handles this case.
  - [x] 7.2 **Show toast confirmation after copy** (FR-38)
    - After successful clipboard write, show a toast notification:
      - Import: `import { toast } from '../components/modern';` (adjust relative path as needed — the toast module is exported from `src/components/modern/index.js`).
      - Call: `toast.success('✅ Copied to clipboard', 'Error report ready for Antigravity');`
      - Do NOT create a custom toast implementation — the project already has a full toast system.
  - [x] 7.3 **Implement Diagnostic Bundle Viewer Modal** (PRD §8 L840-847)
    - Create the file `src/components/DiagnosticViewerModal.tsx` (this is listed in the "Files to Create" section).
    - The modal component `DiagnosticViewerModal` is rendered when admin clicks "View Full Diagnostic":
      - Fetch the diagnostic bundle from the `diagnosticUrl` (R2 URL).
      - Parse the JSON response.
      - **Left panel:** Scrollable log entries from `diagnosticLogs` array. Each entry shows `[time] [level] message`. Add a filter dropdown for log level (log/warn/error). Highlight errors in red, warnings in orange.
      - **Right panel:** Breadcrumbs timeline + environment info.
      - **Top bar:** Error summary (message + feature + severity) + "📋 Copy for Antigravity" button + Close (X) button.
    - The modal should be full-screen (use existing modal patterns in the codebase — check for modal components).
    - State: store the fetched bundle in `useState` so "Copy for Antigravity" can access the full 500 entries.

- [ ] 8.0 AI Enforcement: Rules, Documentation & Antigravity Skill
  - [x] 8.1 **Create `documentation/rules/observability.md`** (FR-56)
    - Create the file with the exact content specified in PRD L729-749:
      - Title: "Rule: Feature Tracking Registration (MANDATORY)"
      - 9 numbered steps for when creating/modifying pages, actions, or routes.
      - Self-check checklist (6 items).
    - This file is the reference that AGENTS.md/GEMINI.md/CLAUDE.md will point to.
  - [x] 8.2 **Create `.agent/skills/observability-tracking/SKILL.md`** (FR-56a)
    - Create the skill file with YAML frontmatter:
      ```yaml
      ---
      name: observability-tracking
      description: Enforce feature tracking registration when creating or modifying pages, actions, or routes
      ---
      ```
    - Include:
      1. **When to load:** triggers (creating/modifying page components, adding buttons/forms, changing routes).
      2. **Step-by-step instructions:** How to register in featureRegistry, add useFeatureTracking hook, instrument with trackAction.
      3. **Before/after example:** Show an uninstrumented page component vs. fully instrumented one.
      4. **Validation steps:** Grep commands to verify coverage.
      5. **Auto-keep-up rule:** When modifying existing features, ALSO update the registry.
  - [x] 8.2a **Surface the observability skill in Knowns guidance** (FR-56b)
    - Add an explicit reference to `.agent/skills/observability-tracking/SKILL.md` inside the Knowns-guidance / planning instructions so page-and-action work can discover the skill during task planning.
    - Tighten the skill validation steps so they explicitly grep route definitions plus `onClick` / `onSubmit` handlers, not just registry helpers.
  - [x] 8.3 **Update `AGENTS.md` — Add observability rules** (FR-55)
    - Open `AGENTS.md` and add 3 rows to the integration safety rules table:
      - `| Creating a new page component or route | [rules/observability.md](documentation/rules/observability.md) |`
      - `| Adding or modifying user-facing actions (buttons, forms, workflows) | [rules/observability.md](documentation/rules/observability.md) |`
      - `| Renaming, moving, or deleting a feature/page | [rules/observability.md](documentation/rules/observability.md) |`
  - [x] 8.4 **Update `GEMINI.md` — Add observability rules** (FR-55)
    - Same 3 rows as 8.3, added to GEMINI.md's integration safety rules table.
  - [x] 8.5 **Update `CLAUDE.md` — Add observability rules** (FR-55)
    - First verify `CLAUDE.md` exists in the project root or documentation folder. If it does, add the same 3 rows. If it doesn't exist, check if there's a `.claude` or `CLAUDE_RULES.md` file instead and update that.

- [ ] 9.0 Integration, Wiring & RTDB Security Rules
  - [x] 9.1 **Add `ADMIN_REPORTS` route to `src/constants/routes.ts`** 
    - Add `ADMIN_REPORTS: '/admin/reports'` to the `ROUTES` object in the "Admin Routes" section (after L49 `ADMIN_BACKUP`).
  - [x] 9.2 **Add route in `src/App.jsx`**
    - Add lazy import: `const AdminReportsPage = lazyWithRetry(() => import('./pages/AdminReportsPage.tsx'));`
    - Add route block in the admin section (after the backup route at L207-210):
      ```jsx
      <Route path="/admin/reports" element={
        <PrivateRoute allowedRoles={['super_admin']}>
          <AdminReportsPage />
        </PrivateRoute>
      } />
      ```
  - [x] 9.2a **Add `/admin/reports` to `src/config/routeSecurity.ts`**
    - Add a new `/admin/reports` entry to `ROUTE_SECURITY_CONFIG`.
    - Match the existing admin-only pattern used by `/admin/dashboard` and `/admin/backup`: `accessLevel: 'role-restricted'`, `allowedRoles: ['super_admin']`.
    - Keep this entry synchronized with the App route and `PrivateRoute` configuration so the centralized security matrix remains the source of truth.
  - [x] 9.3 **Initialize ReportingService in App.jsx** 
    - Import `auth` and `database` from `./services/firebase` (NOT `useAuth` — `useAuth()` is a React hook that can only be used inside components with the AuthProvider, and App.jsx is at the top level).
    - Import `reportingService` from `./services/reportingService`.
    - Import `initBreadcrumbs` from `./hooks/useBreadcrumbs`.
    - **Option A (recommended — module-level):** Call `reportingService.init(auth, database)` at module scope (before the component function), immediately after imports. The `init()` method will internally use `onAuthStateChanged(auth, ...)` to wait for auth state. Also call `initBreadcrumbs()` at module scope.
    - **Option B (useEffect):** Inside the `App` component, add:
      ```jsx
      useEffect(() => {
        reportingService.init(auth, database);
        initBreadcrumbs();
      }, []);
      ```
      This runs once on mount. The `init()` method internally handles auth not being ready yet by subscribing to `onAuthStateChanged`.
    - **CRITICAL for `init()` implementation (in task 1.1):** The `init()` method MUST:
      1. Accept `auth` and `database` as arguments and store them.
      2. Use `onAuthStateChanged(auth, (user) => { this.currentUser = user; })` to track auth state changes — do NOT read `auth.currentUser` synchronously at init time (it may be null).
      3. Subscribe to RTDB config paths.
      4. Send canary event ONLY after auth state resolves (inside the `onAuthStateChanged` callback, when `user !== null`).
- [x] 9.4 **Add Reports card to AdminDashboardPage** (FR-34)
    - In `src/pages/AdminDashboardPage.tsx`, add a new entry to the `quickLinks` array (L118-164).
    - **Import check:** Verify that `IconChartBar` is already imported from `@tabler/icons-react` at the top of the file (L16-22). If not present, add it to the existing import: `import { ..., IconChartBar } from '@tabler/icons-react';`
    - Add the card object:
      ```
      {
        id: 'reports',
        title: 'Production Reports',
        description: 'Monitor errors, feature usage, and system health',
        icon: <IconChartBar size={32} />,
        route: 'ADMIN_REPORTS',
        color: '#ef4444',
        bgColor: 'rgba(239, 68, 68, 0.1)'
      }
      ```
    - Optionally: show a mini-summary on the card (total errors in 24h, number of 🔴 features) — this requires a lightweight RTDB query. If this adds complexity, skip the mini-summary and just show the static description. The PRD says "should show a mini-summary" (FR-34) so attempt it, but it's acceptable to defer.
    - **Also:** Add `'reports': 'ADMIN_REPORTS'` to the `pageRoutes` map inside this page's `handleSidebarNavigate` function.
  - [x] 9.5 **Add back button / breadcrumb on AdminReportsPage** (FR-35)
    - In the AdminReportsPage header, add a back button that calls `navigateTo('ADMIN_DASHBOARD', {}, { reason: 'reports_back' })`.
    - Use the existing pattern from other admin pages (check `AdminBackupPage.tsx` for a back button example).
  - [x] 9.6 **Update `database.rules.json` — Add `/reports/` security rules** (FR-54)
    - Open `database.rules.json` in the project root.
    - **FIRST:** Read the existing file to understand the current structure and admin check pattern. Search for existing admin-only rules (e.g., for `/materials/` or `/sessions/`) to see the exact syntax used for admin role checks. Use the EXACT SAME pattern found in the existing file.
    - Add the `/reports/` rules object as specified in PRD L678-699:
      - `/reports/errors/$date`: read = admin only, write = authenticated (but NOT guests), validate required fields.
      - `/reports/events/$date`: read = admin only, write = authenticated.
      - `/reports/config`: read = authenticated, write = admin only.
    - The admin check pattern is LIKELY: `root.child('users/' + auth.uid + '/role').val() === 'admin' || root.child('users/' + auth.uid + '/role').val() === 'super_admin'` — **but verify by checking the existing rules file.** If the existing file uses a different path (e.g., `root.child('profiles/' + auth.uid + '/role')` or custom claims), use that instead.
    - **IMPORTANT:** Do NOT overwrite existing rules. Insert the `/reports/` block as a sibling of existing top-level nodes.
  - [x] 9.7 **Implement Circuit Breaker in reportingService** (FR-52, FR-53)
    - Add private fields: `circuitState: 'closed' | 'open' | 'half-open'`, `failureCount: number`, `circuitOpenedAt: number | null`.
    - In the `flush()` method, wrap the RTDB `update()` call:
      - If `circuitState === 'open'`: check if 5 minutes have passed since `circuitOpenedAt`. If yes, transition to `'half-open'` and allow ONE write. If no, silently drop all events.
      - If `circuitState === 'half-open'`: allow one write. On success → `'closed'`, reset `failureCount`. On failure → `'open'` again, reset 5-min timer.
      - If `circuitState === 'closed'`: proceed normally. On RTDB write failure, increment `failureCount`. If `failureCount >= 3`, transition to `'open'`, set `circuitOpenedAt = Date.now()`, log `console.warn('[Reporting] Circuit breaker OPEN — pausing for 5 minutes')`.
    - Circuit breaker state is memory-only — resets to `'closed'` on page refresh.
  - [x] 9.8 **Implement Canary Event** (FR-53a)
    - In `init()`, after auth is ready and config is loaded:
      - Write a canary event to RTDB: `set(ref(database, '/reports/events/' + todayDate + '/canary_' + Date.now()), { type: 'canary', timestamp: Date.now(), message: 'Reporting pipeline active' })`.
      - If the write fails (catch the error), immediately open the circuit breaker and log `console.warn('[Reporting] Canary failed — pipeline not operational')`.
      - If it succeeds, log `console.log('[Reporting] ✅ Pipeline verified')`.
  - [x] 9.9 **Implement Graceful Degradation Chain** (FR-53b)
    - In the flush/upload logic, implement the degradation chain:
      1. **Full mode:** RTDB + R2 + Analytics — default behavior.
      2. **R2 failure:** Set `diagnosticUrl = 'upload-failed'`, continue with RTDB + Analytics.
      3. **RTDB failure (circuit open):** Send Analytics events only (call `logEvent` directly).
      4. **Everything fails:** Console-only — log `console.warn('[Reporting] All pipelines failed — console-only mode')`.
    - Each degradation step logs via `console.warn` — NEVER shows anything to users.
  - [x] 9.10 **Implement Telemetry Quota** (FR-53c)
    - Add private field `sessionEventCount: number = 0`.
    - In `enqueue()`, increment `sessionEventCount`.
    - After 500 events: only allow error reports. Drop `trackAction` and `trackPageView` calls silently.
    - Log `console.warn('[Reporting] Session quota reached (500 events) — only errors will be reported')` once when the limit is first hit.
    - Counter resets on page refresh (memory-only).
  - [x] 9.10a **Harden reportingService review regressions**
    - Capture queued events before the circuit-open cooldown branch so analytics-only degradation clears the queue instead of accumulating events.
    - Preserve each error event's reserved RTDB path through `flush()` so later diagnostic URL updates target the correct record.
    - Prevent canary writes from re-firing on auth token refreshes within the same session.
- [x] 9.11 **Add `reports` to AdminSidebar navigation and ALL admin page route maps**
    - In `src/components/navigation/AdminSidebar.tsx`, add a new item to the **System** section of `navSections` (line ~63, after the `backup` entry):
      ```typescript
      { id: 'reports', label: 'Reports', icon: '📊' },
      ```
    - **CRITICAL — Update `handleSidebarNavigate` in ALL admin pages.** Each admin page has its OWN copy of a `pageRoutes` map inside `handleSidebarNavigate`. You MUST add `'reports': 'ADMIN_REPORTS'` to EVERY admin page. The affected files are:
      1. `src/pages/AdminDashboardPage.tsx`
      2. `src/pages/AdminMaterialsPage.tsx`
      3. `src/pages/AdminSessionsPage.tsx`
      4. `src/pages/AdminUserManagementPage.tsx`
      5. `src/pages/AdminCoursesPage.tsx`
      6. `src/pages/AdminClassesPage.tsx`
      7. `src/pages/AdminSettingsPage.tsx`
      8. `src/pages/AdminBackupPage.tsx`
      9. `src/pages/AdminReportsPage.tsx` (the new page)
    - **To find all instances:** Search the codebase for `handleSidebarNavigate` using grep/find: `grep -rn "handleSidebarNavigate" src/pages/Admin*`. Each result file needs the `'reports'` entry added.
    - If a page uses a different pattern (e.g., a switch/case instead of an object map), adapt accordingly but ensure the `'reports'` navigation works.
  - [x] 9.12 **Add `TrackedRoute` wrapper to all existing routes in App.jsx** (FR-13)
    - Once `TrackedRoute` is created (task 4.2), wrap page components in App.jsx with `<TrackedRoute>`.
    - This is a bulk edit affecting many `<Route>` elements in App.jsx (~30-40 routes).
    - The feature name is auto-resolved by `TrackedRoute` using `resolveFeatureFromRoute`, so no manual featureName prop is needed for most routes.
    - **Do NOT wrap these routes** (they are public/guest routes where tracking is inappropriate or auth is unavailable):
      - Login page (`/`)
      - Guest join (`/guest-join/:sessionCode`)
      - Guest test results (`/guest-results/:sessionId`)
      - Access denied (`/access-denied`)
      - Blocked user (`/blocked`)
      - Any route that can be accessed without authentication
    - **Testing protocol after wrapping:**
      1. Run the dev server: `npm run dev`.
      2. Navigate to each major route category: login, student dashboard, teacher lobby, admin dashboard, test taking page, homework page.
      3. Open browser DevTools console and check for:
         - `[Reporting] trackPageView` log messages — should appear exactly ONCE per navigation.
         - No `[Reporting]` error messages.
         - No blank screens or ErrorBoundary fallbacks.
      4. If any page shows duplicate `trackPageView` calls, it means `useFeatureTracking` is firing on re-renders. Check for missing empty dependency array in the hook's `useEffect`.
      5. If any page breaks (blank screen), the issue is likely that `TrackedRoute` uses `window.location.pathname` before the route has settled. Ensure the hook reads pathname inside `useEffect`, not during render.
    - **Dependency:** This task MUST be done AFTER tasks 1.1-1.4 (core services), 4.1-4.2 (hook + component), and 9.3 (init in App.jsx) are complete.
