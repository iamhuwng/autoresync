# Student Startup Bundle Segmentation

## Purpose

This document defines the startup-bundle contract for the public and student-first paths.

It exists to keep first authenticated entry fast as the app grows, while preserving clean ownership boundaries for auth, routing, reporting, and student shell warmup.

The central rule is:
- the public bootstrap must load only public and auth-critical code
- authenticated role trees, student shell warm routes, and optional heavy student features must stay behind explicit lazy boundaries

## Problem This Solves

After the 2026-03-31 student shell data-loading repair, left-column tab churn was no longer the main bottleneck.

The remaining problem was startup JavaScript cost:
- the root app shell still owned too much authenticated routing and student-specific behavior
- authenticated reporting side effects still started too early
- warmed student routes still leaked optional Mantine and chart code into first login
- route-module warmup and data warmup were not explicitly separated

This meant first authenticated entry still paid more download, parse, and execute cost than the student path needed.

## Scope

This architecture applies to:
- public entry and login bootstrap
- authenticated route grouping
- student-first startup after login
- deferred observability initialization
- warmed student routes such as Courses, Library, and Academic Record

This architecture does not require every teacher or admin surface to be optimized immediately, but those surfaces must remain outside the public and student-first boot graph unless explicitly entered.

## Canonical Bootstrap Model

The root shell is now a thin bootstrapper.

Current repo shape:
- `src/main.jsx` mounts the app with a minimal root path
- `src/App.jsx` owns only the thin bootstrap, public routes, and top-level lazy route-group boundaries
- `src/routes/PublicRoutes.tsx` owns the eager public path
- `src/routes/AuthenticatedRoutes.tsx` owns the authenticated gate and deferred authenticated bootstrap work
- role trees live inside lazy route groups:
  - `src/routes/StudentRoleRoutes.tsx`
  - `src/routes/TeacherRoleRoutes.tsx`
  - `src/routes/AdminRoleRoutes.tsx`

This means public entry no longer imports student shell route trees just to reach login.

## Public Path Contract

The public path should load:
- root entry chunk
- React vendor chunk
- auth-critical Firebase vendor chunk
- public page modules such as Login, Guest Join, Guest Results, Access Denied, and Blocked User

The public path must not eagerly load:
- teacher route groups
- admin route groups
- test-taking bundles
- chart, PDF, or export bundles
- student shell-only supplemental code

Current acceptance anchor:
- `dist/index.html` preloads only the public-critical modules and must not unconditionally preload Mantine-wide or misc feature bundles

## Authenticated Bootstrap Contract

Authenticated startup is split into two phases.

### Core Phase

The core phase starts immediately and is safe for first paint:
- auth gate
- route resolution
- global error capture

Current anchors:
- `src/routes/AuthenticatedRoutes.tsx`
- `src/services/reportingService.ts` via `initCore()`

### Deferred Authenticated Phase

The deferred authenticated phase starts after first authenticated paint:
- analytics wiring
- auth-bound reporting listeners
- RTDB reporting config listeners
- canary and flush timers

Current anchors:
- `src/routes/AuthenticatedRoutes.tsx`
- `src/core/platform/hooks/useDeferredIdleTask.ts`
- `src/services/reportingService.ts` via `initAuthenticated(auth, database)`

This keeps observability complete without letting non-critical startup listeners block student-first paint.

## Student Warmup Boundary

Student shell warmup now has two separate layers:
- shell-shared data warmup
- route-module and page-cache warmup

Current anchors:
- `src/context/StudentShellDataContext.tsx`
- `src/context/studentShellPrefetch.ts`

Rules:
- shell-shared data stays owned by the persistent student shell provider
- route warmup may preload selected student shell pages and their page-owned caches
- warmup must not create a second owner for shell-shared summaries
- warmup order matters; Courses should wait until shell-owned class membership is available so it can stay on the student-safe class projection

## Optional Feature Boundary

Heavy optional student features must stay behind deeper lazy boundaries than the warmed shell routes.

Current examples:
- result slide panel wrapper lives behind `DeferredResultSlidePanel`
- writing-result internals inside `ResultSlidePanel` load lazily only when needed
- resume-practice modal no longer depends on Mantine
- warmed student shell pages no longer import Mantine loader, badge, progress, or modal primitives for first login

Current anchors:
- `src/components/results/DeferredResultSlidePanel.tsx`
- `src/components/results/ResultSlidePanel.tsx`
- `src/components/test/SoloResumeModal.tsx`
- `src/pages/StudentDashboardPage.jsx`
- `src/pages/StudentCoursesPage.tsx`
- `src/pages/StudentLibraryPage.tsx`

The purpose is not “never use heavy code.” The purpose is “do not charge the student-first boot path for code the user has not asked for yet.”

## Bundle Guardrail Contract

Startup performance must be protected by explicit build checks, not memory or convention.

Current anchors:
- `scripts/check-bundle-budget.mjs`
- `vite.config.js`
- `package.json`

Required guardrails:
- root entry raw size must stay below the enforced budget
- `dist/index.html` must not unconditionally preload broad non-public feature bundles
- public login must not fetch teacher/admin/test bundles
- authenticated student login must not fetch `chart-vendor`, `pdf`, `jspdf`, or `html2canvas` before explicit navigation to those features

## Verification Standard

When startup segmentation changes, verify with both production build output and a live browser run.

Minimum pass condition:
- build passes
- bundle budget passes
- public `/` fetches only public/auth-critical chunks
- student login does not fetch `chart-vendor`, `pdf`, `jspdf`, or `html2canvas`
- warmed first entry into Courses, Library, and Records avoids blocking loaders in the sampled window

Current evidence anchor from the 2026-03-31 implementation:
- `output/student-startup-bundle-verification.json`

## Related Docs

- `documentation/architecture/student-shell-data-loading.md`
- `documentation/architecture/academic-record/page-architecture.md`
- `documentation/rules/student-data-loading.md`
