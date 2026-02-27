# PRD: Role-Based Access Control (RBAC) Security Hardening

**PRD Number:** 0016  
**Feature Name:** RBAC Security Hardening  
**Author:** Antigravity AI (Security Auditor)  
**Created:** 2026-02-02  
**Status:** Draft  

---

## 1. Introduction/Overview

Following a security audit that identified **10 vulnerabilities** across the teacher/student account features, this PRD defines the comprehensive security hardening required to establish a solid, scalable foundation for role-based access control (RBAC).

### Problem Statement

The current application has security gaps at three levels:
1. **Route Level**: Unprotected student session routes, unclear URL semantics
2. **Service Level**: Backend services return all data without role validation
3. **Database Level**: Firebase rules allow any authenticated user to read sensitive data

### Root Causes Identified

| Cause | Impact | Evidence |
|-------|--------|----------|
| No formal route security policy | Routes added without security review | Teacher could access `/admin/users` |
| Client-side filtering only | Backend exposes all data | `getAllUsers()` returns all users |
| Overly permissive Firebase rules | Database doesn't enforce role-based reads | `".read": "auth != null"` everywhere |
| Missing ownership validation | Users could access others' data by ID | `/result/:resultId` lacks ownership check |

---

## 2. Goals

### Primary Goals

1. **G1**: Zero unauthorized route access - All routes enforce role-based access
2. **G2**: Service-layer security - All data access validates caller authorization
3. **G3**: Database-level defense - Firebase rules enforce role-based reads
4. **G4**: Ownership validation - Users can only access their own/assigned data
5. **G5**: Full audit logging - All CRUD operations logged with user context

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Security test failures | 0 | Automated test suite passes |
| Unprotected routes | 0 | Route security config validation |
| Firebase rule violations | 0 | Rule simulation tests pass |
| Unauthorized access attempts | Logged 100% | Audit log coverage |

---

## 3. User Stories

### US-1: Route Protection
**As a** student  
**I want to** be unable to access teacher routes  
**So that** I cannot see other students' data or teacher-only features  

**Acceptance Criteria:**
- Navigating to `/teacher/*` redirects to Access Denied page
- Navigating to `/admin/*` redirects to Access Denied page
- Error page shows helpful message and return button

### US-2: Teacher Data Isolation
**As a** teacher  
**I want to** only see my assigned students' data  
**So that** other teachers' students' data remains private  

**Acceptance Criteria:**
- `/teacher/students` only shows my assigned students
- `/teacher/student/:studentId/history` verifies I have assignment
- Test results only show for my assigned students
- Cannot view courses/classes I don't own

### US-3: Student Data Isolation
**As a** student  
**I want to** only see my own academic data  
**So that** other students cannot see my results  

**Acceptance Criteria:**
- `/result/:resultId` verifies I am the result owner
- `/student/courses/:courseId` verifies I am enrolled
- Cannot access other students' history or records

### US-4: Admin Override
**As a** super_admin  
**I want to** access all data when needed  
**So that** I can manage the entire system  

**Acceptance Criteria:**
- Super admin can access any route
- Super admin inherits teacher permissions automatically
- All admin actions are logged

### US-5: Blocked User Enforcement
**As a** system administrator  
**I want** blocked users to be logged out immediately  
**So that** they cannot continue accessing the system  

**Acceptance Criteria:**
- Setting user status to 'blocked' triggers session termination
- Blocked user sees "Account blocked" message on next action
- Re-login is prevented until unblocked

### US-6: Security Audit Trail
**As a** super_admin  
**I want to** see a log of all data access and changes  
**So that** I can audit for security issues  

**Acceptance Criteria:**
- All CRUD operations are logged
- Logs include: user, action, target, timestamp
- Logs are tamper-resistant (write-only for clients)

---

## 4. Functional Requirements

### 4.1 Route Protection (V-002)

| ID | Requirement |
|----|-------------|
| FR-001 | Add `<PrivateRoute allowedRoles={['student']}>` to all unprotected student session routes |
| FR-002 | Routes affected: `/student-wait/:id`, `/student-quiz/:id`, `/student-test/:code`, `/student-test-results/:code`, `/student-feedback/:id`, `/student-results/:id` |
| FR-003 | Create `AccessDeniedPage` component showing friendly error message |
| FR-004 | Modify `PrivateRoute` to redirect to `AccessDeniedPage` instead of home |

### 4.2 Role Hierarchy (Q7-B)

| ID | Requirement |
|----|-------------|
| FR-005 | Implement role hierarchy: `super_admin` > `teacher` > `student` |
| FR-006 | Create `hasPermission(userRole, requiredRoles)` utility function |
| FR-007 | Super admin automatically has access to teacher routes |
| FR-008 | Design for future permission-based system (document capability mapping) |

### 4.3 Service Layer Security (V-003)

| ID | Requirement |
|----|-------------|
| FR-009 | Create `AuthContext` interface: `{ userId, role, assignments }` |
| FR-010 | All sensitive services require `AuthContext` parameter |
| FR-011 | Create role-specific service functions (e.g., `getTeacherStudents(teacherId)`) |
| FR-012 | Create `useSecureService()` hook that injects auth context |
| FR-013 | Existing `getAllUsers()` to throw if caller is not super_admin |

### 4.4 Ownership Validation (V-006, V-007)

| ID | Requirement |
|----|-------------|
| FR-014 | Create `useOwnershipCheck(resourceType, resourceId)` hook |
| FR-015 | `ResultDetailPage`: Verify `result.studentId === currentUser.uid` OR teacher has assignment |
| FR-016 | `TeacherStudentHistoryPage`: Verify `isStudentAssignedToTeacher(studentId, currentUser.uid)` |
| FR-017 | Show `AccessDeniedPage` if ownership check fails |
| FR-018 | Add ownership check to service layer as backup |

### 4.5 Firebase Rules Hardening (V-003)

| ID | Requirement |
|----|-------------|
| FR-019 | Update `users` read rule: Only own profile OR admin OR teacher with assignment |
| FR-020 | Update `student_teacher_assignments` read: Filter by own studentId/teacherId OR admin |
| FR-021 | Update `results` read: Only own results OR teacher with assignment OR admin |
| FR-022 | Update `test_results` read: Apply same pattern |
| FR-023 | Create Firebase rule tests to validate security |

### 4.6 Session Management (Q9-C, Q22-A)

| ID | Requirement |
|----|-------------|
| FR-024 | On role change, set `forceReauth: true` flag in user profile |
| FR-025 | AuthContext checks `forceReauth` flag on each action |
| FR-026 | If `forceReauth`, log user out with message "Your account was updated" |
| FR-027 | On user status change to 'blocked', set `forceReauth: true` |
| FR-028 | Add real-time listener for own user profile status changes |

### 4.7 Audit Logging (Q11-D)

| ID | Requirement |
|----|-------------|
| FR-029 | Create `auditLog` Firebase path with write-only rules |
| FR-030 | Create `logAuditEvent(action, details)` service function |
| FR-031 | Log all CRUD operations on sensitive data (users, assignments, results) |
| FR-032 | Log format: `{ action, userId, userRole, target, targetId, timestamp, details }` |
| FR-033 | Super admin can read audit logs via admin console |

### 4.8 Multi-Role Context Switching (Q8-C)

| ID | Requirement |
|----|-------------|
| FR-034 | Add `activeRole` field to user session state |
| FR-035 | If user has multiple roles, show role selector at login |
| FR-036 | Store selected role in session storage |
| FR-037 | All permission checks use `activeRole` not stored `role` |
| FR-038 | Allow role switch without full logout (verify all roles in profile) |

### 4.9 Error Handling (Q12-B)

| ID | Requirement |
|----|-------------|
| FR-039 | Create `AccessDeniedPage` with clear error message |
| FR-040 | Show: "You don't have permission to access this page" |
| FR-041 | Include button to go back or go to appropriate dashboard |
| FR-042 | Log access denied events for security monitoring |

### 4.10 Data Visibility Matrix (Q13, Q17)

| ID | Requirement |
|----|-------------|
| FR-043 | Teacher can only view assigned students' test results |
| FR-044 | Course owner sees all students enrolled in their course |
| FR-045 | Teacher with class sees students who joined course via their class |
| FR-046 | Student in multiple classes maintains separate enrollment contexts |
| FR-047 | Implement `canViewStudent(teacherId, studentId)` check function |

---

## 5. Non-Goals (Out of Scope)

| Item | Reason |
|------|--------|
| Demo route protection (V-004) | User will remove demos later |
| External API backend (Cloud Functions) | Requires Blaze plan upgrade |
| Real-time security event alerts | Focus on logging first |
| Permission-based system (full) | Design for it, but implement role-based for now |
| Third-party auth providers | Focus on existing Firebase Auth |

---

## 6. Design Considerations

### 6.1 Access Denied Page UI

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                        🔒                                   │
│                                                             │
│              Access Denied                                  │
│                                                             │
│   You don't have permission to access this page.            │
│                                                             │
│   This could be because:                                    │
│   • You're trying to access an admin-only page              │
│   • You're trying to view data that belongs to someone else │
│   • Your session has expired                                │
│                                                             │
│   ┌─────────────────┐  ┌─────────────────┐                 │
│   │ Go to Dashboard │  │     Log Out     │                 │
│   └─────────────────┘  └─────────────────┘                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Security Middleware Flow

```
Request → PrivateRoute → Ownership Hook → Service Layer → Firebase Rules
    │           │              │               │              │
    │     Check role      Check assignment  Check context   Final filter
    │           │              │               │              │
    └───────────┴──────────────┴───────────────┴──────────────┘
                    Multiple layers of defense
```

### 6.3 File Structure

```
src/
├── config/
│   └── routeSecurity.ts      # Centralized route security config
├── components/
│   ├── PrivateRoute.jsx      # Enhanced with redirect
│   └── AccessDeniedPage.tsx  # NEW: Error page
├── hooks/
│   ├── useOwnershipCheck.ts  # NEW: Ownership validation
│   └── useSecureService.ts   # NEW: Auth-injected services
├── services/
│   ├── securityMiddleware.ts # NEW: Central auth check
│   └── auditService.ts       # NEW: Audit logging
└── types/
    └── security.types.ts     # NEW: Security type definitions
```

---

## 7. Technical Considerations

### 7.1 Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| Firebase Realtime Database Rules | Database-level security | Requires update |
| Firebase Auth | User authentication | Existing |
| React Router | Route protection | Existing |
| Vitest | Security testing | Existing |

### 7.2 Firebase Spark Plan Constraints

Since Cloud Functions require Blaze plan, implement security at:
1. **Client middleware** - `useSecureService()` hook
2. **Firebase Rules** - Most restrictive read rules possible
3. **Real-time listeners** - For blocked user detection

### 7.3 Breaking Changes

| Change | Migration |
|--------|-----------|
| Services require AuthContext | Update all service calls to use `useSecureService()` |
| Routes redirect to AccessDeniedPage | Users see new error page instead of home |
| Firebase rules restrict reads | Some existing queries may fail - test thoroughly |

### 7.4 Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Ownership checks add latency | Cache assignment data in session |
| Audit logging overhead | Batch writes, async logging |
| Role hierarchy lookup | Pre-compute at login, store in context |

---

## 8. Success Metrics

### 8.1 Quantitative Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Security test coverage | 245 lines | 800+ lines | Test file line count |
| Unprotected routes | 6 | 0 | Route audit |
| Firebase rule gaps | 10+ nodes | 0 | Rule review |
| Unauthorized access logs | Unknown | 100% captured | Audit log volume |

### 8.2 Test Cases Required

```markdown
## Route Access Tests
- [ ] Student cannot access /admin/*
- [ ] Student cannot access /teacher/*
- [ ] Teacher cannot access /admin/users
- [ ] Teacher cannot access /admin/migration
- [ ] Teacher can access /teacher/students
- [ ] Super admin can access all routes

## Ownership Tests
- [ ] Student can view own result
- [ ] Student cannot view other's result
- [ ] Teacher can view assigned student's history
- [ ] Teacher cannot view unassigned student's history

## Session Tests
- [ ] Blocked user is logged out immediately
- [ ] Role change triggers re-auth
- [ ] Context switch updates permissions

## Audit Tests
- [ ] All CRUD operations are logged
- [ ] Logs contain required fields
- [ ] Logs are write-only for clients
```

---

## 9. Open Questions

| ID | Question | Owner | Status |
|----|----------|-------|--------|
| OQ-1 | Should we implement rate limiting for security events? | TBD | Open |
| OQ-2 | How long should audit logs be retained? | TBD | Open |
| OQ-3 | Should we add CAPTCHA after repeated access denied? | TBD | Open |
| OQ-4 | What happens if a teacher views a student, then assignment is removed mid-session? | TBD | Open |

---

## 10. Implementation Phases

### Phase 1: Route & Access Control (Week 1)
- [ ] FR-001 to FR-004: Protect student session routes
- [ ] FR-005 to FR-008: Implement role hierarchy
- [ ] FR-039 to FR-042: Create AccessDeniedPage
- [ ] Update PrivateRoute to use new error page

### Phase 2: Service Layer Security (Week 2)
- [ ] FR-009 to FR-013: Service layer auth context
- [ ] FR-014 to FR-018: Ownership validation hooks
- [ ] FR-043 to FR-047: Data visibility matrix implementation

### Phase 3: Database & Session (Week 3)
- [ ] FR-019 to FR-023: Firebase rules hardening
- [ ] FR-024 to FR-028: Session management improvements
- [ ] FR-034 to FR-038: Multi-role context switching

### Phase 4: Audit & Testing (Week 4)
- [ ] FR-029 to FR-033: Audit logging system
- [ ] Create comprehensive security test suite
- [ ] Perform penetration testing
- [ ] Documentation and training

---

## 11. Appendix

### A. Current Firebase Rules Analysis

| Path | Current Rule | Risk | Proposed Fix |
|------|-------------|------|--------------|
| `users` | `.read: auth != null` | Any user sees all users | Add role check |
| `student_teacher_assignments` | `.read: auth != null` | Any user sees all assignments | Filter by userId |
| `results` | `.read: auth != null` | Any user sees all results | Owner/teacher check |
| `test_results` | `.read: auth != null` | Any user sees all test results | Owner/teacher check |

### B. Route Security Reference

See `src/config/routeSecurity.ts` for complete route-role mapping.

### C. Related Documents

- `documentation/sop/security-audit-rbac-2026-02-02.md` - Initial audit findings
- `documentation/conversation_2026-02-02_log.md` - Implementation discussion

---

*This PRD was generated based on security audit findings and clarifying questions answered by the product owner.*
