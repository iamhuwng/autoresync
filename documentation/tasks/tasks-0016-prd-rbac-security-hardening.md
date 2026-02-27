# Task List: RBAC Security Hardening

**Source PRD:** `0016-prd-rbac-security-hardening.md`  
**Created:** 2026-02-02  
**Status:** Complete - Sub-tasks Generated

---

## Relevant Files

### Core Security Infrastructure
- `src/components/PrivateRoute.jsx` - Enhanced route protection with role hierarchy and AccessDenied redirect
- `src/components/PrivateRoute.test.tsx` - Extended tests for new functionality
- `src/components/AccessDeniedPage.tsx` - **NEW**: User-friendly access denied error page
- `src/components/AccessDeniedPage.test.tsx` - **NEW**: Tests for AccessDeniedPage
- `src/config/routeSecurity.ts` - Route security configuration (already exists)
- `src/config/roleHierarchy.ts` - **NEW**: Role hierarchy and permission utilities

### Auth & Session Management
- `src/contexts/AuthContext.jsx` - Enhanced with forceReauth, blocked user detection, multi-role support
- `src/contexts/AuthContext.test.tsx` - **NEW**: Auth context security tests
- `src/hooks/useAuth.d.ts` - Updated TypeScript definitions
- `src/types/security.types.ts` - **NEW**: Security-related type definitions

### Service Layer Security
- `src/hooks/useSecureService.ts` - **NEW**: Auth context injection for services
- `src/hooks/useSecureService.test.ts` - **NEW**: Tests for secure service hook
- `src/hooks/useOwnershipCheck.ts` - **NEW**: Ownership validation hook
- `src/hooks/useOwnershipCheck.test.ts` - **NEW**: Tests for ownership checks
- `src/services/securityMiddleware.ts` - **NEW**: Central security validation layer
- `src/services/securityMiddleware.test.ts` - **NEW**: Middleware tests

### Ownership Validation Pages
- `src/pages/ResultDetailPage.tsx` - Add ownership check before displaying result
- `src/pages/TeacherStudentHistoryPage.tsx` - Add assignment verification

### Audit System
- `src/services/auditService.ts` - **NEW**: Audit logging service
- `src/services/auditService.test.ts` - **NEW**: Audit service tests

### Firebase Configuration
- `database.rules.json` - Hardened Firebase security rules
- `database.rules.test.json` - **NEW**: Rule testing configuration

### App Routes
- `src/App.jsx` - Add PrivateRoute to unprotected student session routes

### Notes

- Unit tests should be placed alongside the code files they are testing
- Use `npm test` or `npx vitest` to run tests
- Firebase rules can be tested with `firebase emulators:exec --only database "npm run test:rules"`
- Security tests should be run as part of CI/CD pipeline

---

## Tasks

### Task 1.0: Route Protection & Access Control Foundation

- [x] 1.0 Route Protection & Access Control Foundation ✅ COMPLETED
  - [x] 1.1 Create `AccessDeniedPage.tsx` component with clear error message, role-appropriate redirect buttons, and reason display
  - [x] 1.2 Update `PrivateRoute.jsx` to redirect to `/access-denied` instead of `/` when role check fails
  - [x] 1.3 Add `/access-denied` route to `App.jsx` (public route, no auth required)
  - [x] 1.4 Wrap `/student-wait/:gameSessionId` with `<PrivateRoute allowedRoles={['student']}>`
  - [x] 1.5 Wrap `/student-quiz/:gameSessionId` with `<PrivateRoute allowedRoles={['student']}>`
  - [x] 1.6 Wrap `/student-test/:sessionCode` with `<PrivateRoute allowedRoles={['student']}>`
  - [x] 1.7 Wrap `/student-test-results/:sessionCode` with `<PrivateRoute allowedRoles={['student']}>`
  - [x] 1.8 Wrap `/student-feedback/:gameSessionId` with `<PrivateRoute allowedRoles={['student']}>`
  - [x] 1.9 Wrap `/student-results/:gameSessionId` with `<PrivateRoute allowedRoles={['student']}>`
  - [x] 1.10 Create tests for `AccessDeniedPage` component
  - [x] 1.11 Update `PrivateRoute.test.tsx` to test new redirect behavior

---

### Task 2.0: Role Hierarchy & Permission System

- [x] 2.0 Role Hierarchy & Permission System ✅ COMPLETED
  - [x] 2.1 Create `src/types/security.types.ts` with `UserRole`, `Permission`, `RoleConfig` type definitions
  - [x] 2.2 Create `src/config/roleHierarchy.ts` with role hierarchy definition: `super_admin > teacher > student`
  - [x] 2.3 Implement `hasPermission(userRole: UserRole, requiredRoles: UserRole[]): boolean` utility
  - [x] 2.4 Implement `getRoleLevel(role: UserRole): number` utility for hierarchy comparison
  - [x] 2.5 Implement `canAccessAsRole(userRole: UserRole, targetRole: UserRole): boolean` for inheritance check
  - [x] 2.6 Update `PrivateRoute.jsx` to use `hasPermission()` instead of direct array includes
  - [x] 2.7 Add `PERMISSIONS` constant mapping future capability-based permissions
  - [x] 2.8 Create unit tests for all role hierarchy utility functions
  - [x] 2.9 Document role hierarchy in code comments for future permission-based migration

---

### Task 3.0: Service Layer Security & Auth Context

- [x] 3.0 Service Layer Security & Auth Context ✅ COMPLETED
  - [x] 3.1 Create `AuthContext` interface in `security.types.ts`: `{ userId, userRole, assignments, activeRole }` ✅
  - [x] 3.2 Create `src/hooks/useSecureService.ts` hook that builds AuthContext from useAuth ✅
  - [x] 3.3 Create `src/services/securityMiddleware.ts` with `validateAccess(authContext, requiredRole)` function ✅
  - [x] 3.4 Add `validateOwnership(authContext, resourceType, resourceId)` to middleware ✅
  - [x] 3.5 Create `src/hooks/useOwnershipCheck.ts` hook for component-level validation ✅
  - [x] 3.6 Implement `useOwnershipCheck('result', resultId)` pattern returning `{ allowed, loading, error }` ✅
  - [x] 3.7 Update `ResultDetailPage.tsx` to use `useOwnershipCheck` before rendering ✅
  - [x] 3.8 Implement ownership check: result owner OR teacher with assignment to student ✅
  - [x] 3.9 Update `TeacherStudentHistoryPage.tsx` to verify teacher has assignment to student ✅
  - [x] 3.10 Create `canViewStudent(teacherId, studentId)` helper using `isStudentAssignedToTeacher` ✅
  - [x] 3.11 Modify `getAllUsers()` in userService to require super_admin role context ✅
  - [x] 3.12 Create `getTeacherStudents(teacherId)` as role-appropriate alternative ✅
  - [x] 3.13 Create comprehensive tests for useSecureService hook ✅
  - [x] 3.14 Create tests for useOwnershipCheck hook ✅
  - [x] 3.15 Create tests for securityMiddleware functions ✅

---

### Task 4.0: Firebase Rules Hardening

- [x] 4.0 Firebase Rules Hardening ✅ COMPLETED (pending deploy)
  - [x] 4.1 Backup current `database.rules.json` before modifications ✅ (database.rules.backup-2026-02-02.json)
  - [x] 4.2 Update `users` read rule: `$uid === auth.uid || role === 'super_admin' || (role === 'teacher' && hasAssignment)` ✅
  - [x] 4.3 Create helper function reference in rules for assignment checking ✅
  - [x] 4.4 Update `student_teacher_assignments` read: filter by `studentId === auth.uid` OR `teacherId === auth.uid` OR super_admin ✅
  - [x] 4.5 Update `results` read: `userId === auth.uid` OR teacher with assignment OR super_admin ✅
  - [x] 4.6 Update `test_results` read: same pattern as results ✅
  - [x] 4.7 Update `test_results_by_student` read: validate student access own data or teacher/admin ✅
  - [x] 4.8 Update `test_results_by_teacher` read: validate teacher owns the path or admin ✅
  - [x] 4.9 Add write-only `audit_logs` path for audit system ✅
  - [x] 4.10 Create Firebase rules test file with emulator-based testing ✅
  - [x] 4.11 Test: Student cannot read other student's results ✅ (specification test)
  - [x] 4.12 Test: Teacher cannot read unassigned student's data ✅ (specification test)
  - [x] 4.13 Test: Super admin can read all data ✅ (specification test)
  - [x] 4.14 Deploy updated rules to Firebase ✅ DEPLOYED 2026-02-02

---

### Task 5.0: Session Management & Blocked User Enforcement

- [x] 5.0 Session Management & Blocked User Enforcement ✅ COMPLETED
  - [x] 5.1 Add `forceReauth: boolean` field schema to user profile type ✅ (already in security.types.ts)
  - [x] 5.2 Update `AuthContext.jsx` to listen for `forceReauth` flag via realtime listener ✅
  - [x] 5.3 Implement auto-logout when `forceReauth === true` with message "Your account was updated" ✅
  - [x] 5.4 After logout for forceReauth, clear the flag in database ✅
  - [x] 5.5 Update `updateUserProfile` service to set `forceReauth: true` on role change ✅ (updateUserProfileSecure, updateUserRole)
  - [x] 5.6 Update `toggleUserStatus` service to set `forceReauth: true` when blocking user ✅
  - [x] 5.7 Add realtime listener for `status` field - if changed to 'blocked', trigger immediate logout ✅
  - [x] 5.8 Create `BlockedUserPage.tsx` component showing "Your account has been blocked" message ✅
  - [x] 5.9 Add `/blocked` route for blocked user landing page ✅
  - [x] 5.10 Prevent login for blocked users - check status after auth before setting profile ✅
  - [x] 5.11 Create tests for forceReauth flow ✅ (in sessionManagement.test.ts)
  - [x] 5.12 Create tests for blocked user immediate logout ✅ (in sessionManagement.test.ts)

---

### Task 6.0: Audit Logging System

- [x] 6.0 Audit Logging System ✅ COMPLETED
  - [x] 6.1 Create `src/services/auditService.ts` with `logAuditEvent(action, details)` function ✅
  - [x] 6.2 Define audit event types: `CREATE`, `READ`, `UPDATE`, `DELETE`, `ACCESS_DENIED`, `LOGIN`, `LOGOUT` ✅ (in security.types.ts)
  - [x] 6.3 Define audit log schema: `{ id, action, userId, userRole, target, targetId, timestamp, details, ip? }` ✅
  - [x] 6.4 Add `audit_logs` path to Firebase with write-only rules (no client reads except super_admin) ✅ (in database.rules.json)
  - [x] 6.5 Integrate audit logging into `userService.ts` for user CRUD operations ✅
  - [x] 6.6 Integrate audit logging into `assignmentManager.ts` for assignment operations ✅
  - [x] 6.7 Integrate audit logging into `courseManager.ts` for course operations ✅
  - [x] 6.8 Add audit log on successful login in `AuthContext.jsx` ✅
  - [x] 6.9 Add audit log on logout in `AuthContext.jsx` ✅
  - [x] 6.10 Add audit log on access denied events in `PrivateRoute.jsx` ✅
  - [x] 6.11 Create `AuditLogViewer` component for super_admin dashboard ✅ (in components/admin/AuditLogViewer.tsx)
  - [x] 6.12 Create tests for auditService functions ✅ (in services/auditService.test.ts)
  - [x] 6.13 Ensure async audit logging doesn't block main operations (use fire-and-forget pattern) ✅

---

### Task 7.0: Multi-Role Context Switching

- [x] 7.0 Multi-Role Context Switching ✅ COMPLETED
  - [x] 7.1 Update user profile schema to support `roles: string[]` array (in addition to primary `role`) ✅ (in security.types.ts)
  - [x] 7.2 Add `activeRole` to AuthContext state ✅
  - [x] 7.3 Create `setActiveRole(role)` function in AuthContext ✅ (switchRole)
  - [x] 7.4 Store `activeRole` in sessionStorage for persistence across refreshes ✅
  - [x] 7.5 Create `RoleSwitcher` UI component for users with multiple roles ✅
  - [x] 7.6 Show role selector at login if user has multiple roles ✅ (RoleSelector.tsx component)
  - [x] 7.7 Update all permission checks to use `activeRole` instead of `profile.role` ✅ (role helpers updated)
  - [x] 7.8 Validate `activeRole` is in user's allowed roles list before setting ✅
  - [x] 7.9 Add audit log when user switches roles ✅
  - [x] 7.10 Create tests for multi-role context switching ✅ (in __tests__/security/multiRoleSwitch.test.ts - 404 lines)
  - [x] 7.11 Handle edge case: user's role list changes while session active ✅

---

### Task 8.0: Security Testing Suite

- [x] 8.0 Security Testing Suite ✅ COMPLETE
  - [x] 8.1 Create `src/__tests__/security/routeAccess.test.ts` for route access tests ✅
  - [x] 8.2 Test: Student cannot access `/admin/*` routes ✅
  - [x] 8.3 Test: Student cannot access `/teacher/*` routes ✅
  - [x] 8.4 Test: Teacher cannot access `/admin/users` ✅
  - [x] 8.5 Test: Teacher cannot access `/admin/migration` ✅
  - [x] 8.6 Test: Teacher CAN access `/teacher/students` ✅
  - [x] 8.7 Test: Super admin can access all routes ✅
  - [x] 8.8 Create `src/__tests__/security/ownership.test.ts` for ownership validation ✅
  - [x] 8.9 Test: Student can view own result ✅
  - [x] 8.10 Test: Student cannot view other student's result ✅
  - [x] 8.11 Test: Teacher can view assigned student's history ✅
  - [x] 8.12 Test: Teacher cannot view unassigned student's history ✅
  - [x] 8.13 Create `src/__tests__/security/sessionManagement.test.ts` for session security ✅
  - [x] 8.14 Test: Blocked user is logged out immediately ✅
  - [x] 8.15 Test: Role change triggers forceReauth ✅
  - [x] 8.16 Test: Context switch updates permissions correctly ✅ (in multiRoleSwitch.test.ts)
  - [x] 8.17 Create `src/__tests__/security/firebaseRules.test.ts` for Firebase rule testing ✅ (38 tests)
  - [x] 8.18 Test: Firebase rules enforce read restrictions per role ✅
  - [x] 8.19 Create security test runner script for CI/CD integration ✅ (scripts/run-security-tests.js)
  - [x] 8.20 Add security tests to pre-commit hooks ✅ (scripts/pre-commit-security.sh)

---

## Implementation Order (Recommended)

**Week 1: Foundation**
1. Task 1.0 - Route Protection (highest risk items)
2. Task 2.0 - Role Hierarchy (enables other tasks)

**Week 2: Data Security**
3. Task 3.0 - Service Layer Security (ownership validation)
4. Task 4.0 - Firebase Rules (database-level defense)

**Week 3: Session & Audit**
5. Task 5.0 - Session Management (blocked users)
6. Task 6.0 - Audit Logging (compliance)

**Week 4: Polish & Testing**
7. Task 7.0 - Multi-Role Context (user experience)
8. Task 8.0 - Security Testing (validation)

---

## Dependencies

```
Task 1.0 ──┐
           ├──> Task 3.0 ──> Task 8.0
Task 2.0 ──┘        │
                    v
              Task 4.0
                    │
Task 5.0 <──────────┘
    │
    v
Task 6.0 ──> Task 7.0
```

---

## Completion Checklist

Before marking RBAC Security Hardening as complete:

- [x] All unprotected routes are wrapped with PrivateRoute ✅
- [x] AccessDeniedPage is implemented and working ✅
- [x] Role hierarchy is enforced consistently ✅
- [x] Ownership validation is in place for sensitive data ✅
- [x] Firebase rules are updated and tested ✅
- [x] Blocked users are immediately logged out ✅
- [x] Audit logging captures all CRUD operations ✅
- [x] Multi-role users can switch context ✅
- [x] All security tests pass ✅
- [x] Documentation is updated ✅

---

*Generated from PRD 0016-prd-rbac-security-hardening.md*
