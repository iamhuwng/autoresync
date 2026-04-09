# Class-Code Join Approval Gating

## Purpose

This document defines the current contract for authenticated students joining a class by class code.

It exists because the join flow now has two distinct enrollment modes:
- self-service join by class code, which is teacher-approved
- teacher/admin direct add-to-class, which is immediately active

The two modes share `enrollStudent()` but must not grant the same student-facing access at the same time.

## Enrollment Modes

### 1. Self-Service Join By Class Code

Current flow:
1. student submits a class code from `StudentDashboardPage.jsx`
2. `classManager.enrollStudent()` writes class membership with `status: 'pending_approval'`
3. the membership projection under `student_classes/{studentId}/{classId}` is also written as `pending_approval`
4. the dashboard shows a "request sent, waiting for teacher approval" message
5. the student remains blocked from student shell class visibility and class-linked course access until approval

Required rules:
- pending self-joins must not appear in `getStudentClasses()`
- pending self-joins must not trigger class-linked course auto-enrollment
- pending self-joins must not refresh homework or other shell-owned coursework surfaces as if the class were active

### 2. Teacher/Admin Direct Add To Class

Current flow:
1. teacher or admin selects a student and adds them to a class
2. `classManager.enrollStudent()` is called with `approvalMode: 'active'`
3. the roster entry is written as `status: 'active'`
4. the student class projection is immediately student-visible
5. linked class-course inheritance is applied immediately

Required rule:
- direct staff-driven add-to-class remains an immediate enrollment path and must not be forced through the pending approval gate

## Status Contract

The class membership record and the `student_classes` projection must use the same visibility contract.

Supported statuses:
- `active` - student-visible and eligible for linked class-course inheritance
- `pending_approval` - teacher-visible only, hidden from student shell reads
- `removed` - not student-visible and not eligible for inheritance

Student-facing readers must treat only `active` memberships as visible.

## Data Path Ownership

Primary paths:
- `classes/{classId}/students/{studentId}`
- `student_classes/{studentId}/{classId}`
- class-linked course enrollment records created by `autoEnrollStudentInClassCourses()`

Required rules:
- `classes/.../students` is the roster source of truth
- `student_classes/...` is the student shell projection and must mirror membership visibility
- class-linked course enrollment inheritance only activates from an `active` class membership
- reject and remove flows must clean up stale class-based course enrollments if they exist

## Teacher Approval Actions

Teacher class management owns the transition out of `pending_approval`.

### Approve

`approveClassStudent()` must:
- flip the roster membership to `active`
- promote the `student_classes` projection to `active`
- create the student-teacher assignment if needed
- trigger linked class-course inheritance at approval time

### Reject

`rejectClassStudent()` must:
- remove the pending roster member
- remove the projection entry
- clean up any stale class-based course inheritance

### Remove

`removeStudentFromClass()` must:
- remove active or pending membership records
- remove the projection entry
- clean up class-based course inheritance

## Student Shell Read Contract

Student shell pages consume class membership through the shared shell owner.

Required rules:
- shell-owned enrolled class summaries must exclude `pending_approval`
- fallback legacy scans must also exclude `pending_approval`
- helper services that enrich data from shell-owned class summaries must not treat pending membership as active access

Current repo anchors:
- `src/services/classManager.ts`
- `src/hooks/useStudentShellData.ts`
- `src/services/enrollmentManager.ts`

## Observability

Teacher class-management approval actions are tracked under the `classes` feature.

Tracked actions:
- `approveStudent`
- `rejectStudent`
- `removeStudent`

This keeps approval-flow outcomes visible in the production observability model.

## Verification Anchors

Current regression anchors:
- `src/__tests__/services/classManager.test.ts`
- `src/hooks/useStudentShellData.test.ts`
- `src/services/enrollmentInheritance.test.ts`
- `src/pages/StudentDashboardPage.teachers.test.jsx`
- `src/pages/TeacherClassDetailPage.test.tsx`

## Related Docs

- `documentation/architecture/course-class-management.md`
- `documentation/architecture/student-shell-data-loading.md`
- `documentation/architecture/student-dashboard-architecture.md`
