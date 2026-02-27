---
title: Auth RBAC Architecture
createdAt: '2026-02-27T16:20:02.503Z'
updatedAt: '2026-02-27T16:20:13.197Z'
description: >-
  Authentication flow, role-based access control, route protection matrix,
  security vulnerabilities from audit.
tags:
  - architecture
  - auth
  - rbac
  - security
  - core
---
# Auth & RBAC Architecture

## Overview

The application uses Firebase Authentication with a custom RBAC system. Three user roles (super_admin, teacher, student) with route-level protection enforced by a centralized route security matrix.

## Authentication Flow

```
User enters credentials → Firebase Auth (email/password)
  → Auth success → Read /users/{uid}/role from RTDB
  → AuthContext stores: user, role, profile
  → RouteGuard checks routeSecurity.ts
  → Role-appropriate dashboard rendered
```

### Key Files
| File | Purpose |
|------|---------|
| `src/contexts/AuthContext.jsx` | Auth state management, login/logout |
| `src/hooks/useAuth.js` | Auth hook for components |
| `src/config/routeSecurity.ts` | Central route-role permission matrix |
| `src/config/roleHierarchy.ts` | Role permission inheritance |

## RBAC System

### Roles
| Role | URL Pattern | Access |
|------|-------------|--------|
| `super_admin` | `/admin/*` | Full platform access |
| `teacher` | `/teacher/*` | Class/test management + admin-shared features |
| `student` | `/student/*` | Dashboard, tests, courses, results |
| Guest | `/guest-*` | Guest test-taking only |

### Route Protection Matrix
```
Public:        /, /guest-join, /guest-results, /teacher-invite
Admin only:    /admin/users, /admin/migration
Teacher only:  /teacher/students
Teacher+Admin: /lobby, /teacher/*, /sessions, /create-test
Student only:  /student/*
Any auth:      /result/*, /profile/*
⚠️ UNPROTECTED: /student-test/:id, /student-quiz/:id (session routes)
```

### PrivateRoute Component
Wraps protected routes, checks `allowedRoles` against user's role from AuthContext.

### Route Security Config (`routeSecurity.ts`)
Centralized route-role matrix created after security audit:
- 468 lines, comprehensive coverage
- Type-safe route building
- Development-mode validation

## Security Vulnerabilities (from Audit)

| ID | Severity | Issue | Status |
|----|----------|-------|--------|
| V-001 | 🔴 Critical | Teacher access to admin routes | ✅ FIXED |
| V-002 | 🟠 High | Student session routes unprotected | ⚠️ Needs fix |
| V-003 | 🟠 High | `getAllUsers()` returns all data to any caller | ⚠️ Needs fix |
| V-004 | 🟠 High | Demo routes publicly accessible | ⚠️ Needs fix |
| V-006 | 🟡 Medium | Result page allows cross-student viewing | ⚠️ Needs fix |

### Key Lessons (from Security Audit)
1. **Route-level protection > UI-level filtering** — Don't rely on hiding buttons
2. **Backend services need role validation** — Client-side filtering is insufficient
3. **URL naming must match role** — `/admin/*` routes must require admin role
4. **Guest detection** — Only use `startsWith('guest_')`, never pattern-match UIDs

## Firebase Auth Data

```
/users/{uid}/
  ├── role: "teacher" | "student" | "super_admin"
  ├── email: string
  ├── displayName: string
  ├── photoURL: string (optional)
  └── profile: { ... extended profile data }
```

## Related Docs
- @doc/sop/security-audit-rbac — Full security audit report
- @doc/sop/security-fix-assignment-permissions — Fix for assignment access
- @doc/prd/prd-login-system — Login system PRD
- @doc/prd/prd-rbac-security — RBAC security PRD
- @doc/conventions — Integration safety rules reference
- @doc/sop/test-end-flow-debug-retrospective — Guest detection bug (related)
