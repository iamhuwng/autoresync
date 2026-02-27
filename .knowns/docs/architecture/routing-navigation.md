---
title: Routing Navigation
createdAt: '2026-02-27T17:10:27.255Z'
updatedAt: '2026-02-27T17:10:56.238Z'
description: >-
  React Router v6 route map, PrivateRoute, routeSecurity.ts, useNavigation hook,
  breadcrumbs, mobile menu.
tags:
  - architecture
  - routing
  - navigation
  - routes
  - core
---
# Routing & Navigation Architecture

## Overview

React Router v6 with role-based navigation. Routes are defined in `routes.ts`, protected by `PrivateRoute` with RBAC, navigated via `useNavigation` hook, and use a breadcrumb hierarchy config.

## Route Structure

```
/ (root)
├── /login                            — LoginPage (public)
├── /lobby                            — TeacherLobbyPage (teacher/admin)
├── /sessions                         — SessionManagementPage (teacher)
│
├── /teacher/*                        — Teacher routes
│   ├── /teacher/classes              — TeacherClassesPage
│   ├── /teacher/classes/:classId     — TeacherClassDetailPage
│   ├── /teacher/students             — TeacherStudentsPage
│   ├── /teacher/student/:id/history  — TeacherStudentHistoryPage
│   ├── /teacher/results              — TeacherResultsDashboard ⚠️ NO NAV BUTTON
│   └── /teacher/homework             — TeacherHomeworkListPage
│
├── /student/*                        — Student routes
│   ├── /student                      — StudentDashboardPage
│   ├── /student/library              — StudentLibraryPage
│   ├── /student/practice             — StudentPracticePage
│   ├── /student/homework             — StudentHomeworkListPage
│   ├── /student/academic-record      — AcademicRecordPage
│   ├── /student/results/history      — StudentResultsHistoryPage
│   └── /student/solo-test/:id        — StudentSoloTestPage
│
├── /admin/*                          — Admin routes
│   ├── /admin/users                  — AdminUserManagementPage
│   └── /admin/courses                — AdminCoursesPage
│
├── /test/*                           — Test routes (during tests)
│   ├── /student-quiz/:code           — IELTS test taking
│   ├── /student-thcs-quiz/:code      — THCS test taking
│   ├── /student-test-results/:code   — Post-test results
│   └── /teacher-test-results/:code   — Teacher session results
│
└── /create/*                         — Test creation
    ├── /create-test                  — Test creation wizard
    └── /create-thcs-test             — THCS test creation
```

## Route Protection

### PrivateRoute Component
**File:** `src/components/PrivateRoute.jsx`

```jsx
<PrivateRoute allowedRoles={['teacher', 'super_admin']}>
  <TeacherPage />
</PrivateRoute>
```

### Route Security Config
**File:** `src/config/routeSecurity.ts`

Centralized route → role mapping:
```typescript
export const ROUTE_SECURITY = {
  '/teacher/*': ['teacher', 'super_admin'],
  '/admin/*': ['super_admin'],
  '/student/*': ['student'],
  '/sessions': ['teacher', 'super_admin'],
  '/create-test': ['teacher', 'super_admin'],
};
```

### Known Vulnerability (V-002)
⚠️ Student session routes (`/student-quiz/:code`, `/student-thcs-quiz/:code`) lack `PrivateRoute` wrappers. Anyone with the URL can access.
See @doc/architecture/auth-rbac-architecture

## Navigation System

### useNavigation Hook
**File:** `src/hooks/useNavigation.js`

```typescript
const { navigateTo } = useNavigation();
navigateTo('TEACHER_CLASSES', { classId: '123' }, { reason: 'teacher_nav' });
```

### Navigation Components
| Component | Role | Layout |
|-----------|------|--------|
| `TeacherHeader` | Teacher | Horizontal header with inline buttons |
| `AdminLayout` + `AdminSidebar` | Admin | Fixed sidebar |
| `Breadcrumbs` | All | Route hierarchy trail |
| `MobileMenu` | All | Slide-in drawer (≤768px) |

### Responsive Breakpoint
- **Desktop:** > 768px (full nav)
- **Mobile:** ≤ 768px (hamburger + drawer)

## Integration Safety Rule #1
**Before writing ANY `navigate()`, link, or redirect URL:** validate against route registry.
See @doc/conventions (Integration Safety Rules)

## Integration Safety Rule #2
**Before navigating to a page that reads prerequisite state:** ensure the state is set before navigation.

## Related Docs
- @doc/system/navigation-ux-guide — Full navigation system guide
- @doc/prd/prd-navigation-ux — Navigation UX PRD
- @doc/architecture/auth-rbac-architecture — Route protection
- @doc/conventions — Integration safety rules #1, #2
- @doc/integration-safety-rules — Full safety rules
