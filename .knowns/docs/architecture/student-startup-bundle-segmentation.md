---
title: Student Startup Bundle Segmentation
description: 'Startup-bundle contract for the public and student-first paths: thin public bootstrap, lazy authenticated route groups, deferred reporting bootstrap, route-module warmup, and bundle guardrails.'
createdAt: '2026-03-31T08:59:42.077Z'
updatedAt: '2026-03-31T08:59:42.077Z'
tags:
  - architecture
  - student
  - performance
  - startup
  - routing
  - bundles
---

# Student Startup Bundle Segmentation

## Purpose

This document defines the startup-bundle contract for the public and student-first paths.

The core rule is:
- the public bootstrap loads only public and auth-critical code
- authenticated role trees, student shell warm routes, and optional heavy student features stay behind explicit lazy boundaries

## Problem This Solves

After the 2026-03-31 student shell data-loading repair, the main remaining bottleneck was startup JavaScript cost rather than repeated tab-owned data reads.

The root app shell still owned too much authenticated routing and startup behavior, and warmed student routes still leaked optional UI/runtime code into first login.

## Canonical Bootstrap Model

Current repo shape:
- `src/main.jsx` mounts a minimal root path
- `src/App.jsx` is a thin bootstrapper
- `src/routes/PublicRoutes.tsx` owns the eager public path
- `src/routes/AuthenticatedRoutes.tsx` owns the authenticated gate and deferred authenticated bootstrap
- role trees load through lazy route groups:
  - `src/routes/StudentRoleRoutes.tsx`
  - `src/routes/TeacherRoleRoutes.tsx`
  - `src/routes/AdminRoleRoutes.tsx`

This keeps public entry from importing student, teacher, or admin route trees just to reach login.

## Authenticated Bootstrap Split

Authenticated startup is split into two phases.

Immediate phase:
- auth gate
- route resolution
- global error capture

Deferred authenticated phase:
- analytics wiring
- auth-bound reporting listeners
- RTDB reporting config listeners
- canary and flush timers

Current anchors:
- `src/routes/AuthenticatedRoutes.tsx`
- `src/core/platform/hooks/useDeferredIdleTask.ts`
- `src/services/reportingService.ts`

## Student Warmup Boundary

Student shell warmup has two separate layers:
- shell-shared data warmup
- route-module and page-cache warmup

Rules:
- shell-shared data stays owned by the persistent student shell provider
- route warmup may preload selected student shell pages and their page-owned caches
- warmup must not create a second owner for shell-shared summaries
- Courses should warm only after shell-owned class membership is ready so it stays on the student-safe read path

Current anchors:
- `src/context/StudentShellDataContext.tsx`
- `src/context/studentShellPrefetch.ts`

## Optional Feature Boundary

Heavy optional student features must stay below the warmed route entry boundary.

Current examples:
- `DeferredResultSlidePanel` wraps the result slide panel entry
- writing-result internals in `ResultSlidePanel` load lazily on demand
- warmed student shell pages no longer import Mantine loader, badge, progress, or modal primitives for first login

Current anchors:
- `src/components/results/DeferredResultSlidePanel.tsx`
- `src/components/results/ResultSlidePanel.tsx`
- `src/components/test/SoloResumeModal.tsx`
- `src/pages/StudentDashboardPage.jsx`
- `src/pages/StudentCoursesPage.tsx`
- `src/pages/StudentLibraryPage.tsx`

## Bundle Guardrail Contract

Startup performance is protected by explicit build checks, not convention.

Current anchors:
- `scripts/check-bundle-budget.mjs`
- `vite.config.js`
- `package.json`

Required guardrails:
- root entry stays below the enforced budget
- public login does not fetch teacher/admin/test bundles
- authenticated student login does not fetch `chart-vendor`, `pdf`, `jspdf`, or `html2canvas` before explicit navigation to those features

## Verification Standard

When startup segmentation changes, verify with production build output and a live browser run.

Minimum pass condition:
- build passes
- bundle budget passes
- public `/` fetches only public/auth-critical chunks
- student login does not fetch `chart-vendor`, `pdf`, `jspdf`, or `html2canvas`
- warmed first entry into Courses, Library, and Records avoids blocking loaders in the sampled window

Current evidence anchor:
- `output/student-startup-bundle-verification.json`

## Related Docs

- @doc/architecture/student-shell-data-loading-architecture
- @doc/architecture/academic-record/academic-record-page-architecture
- @doc/architecture/auth-rbac-architecture
