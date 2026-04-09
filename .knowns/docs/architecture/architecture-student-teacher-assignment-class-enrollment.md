---
title: 'Architecture: Student-Teacher Assignment & Class Enrollment'
description: 'Documents the two distinct systems for managing student-teacher relationships: assignment requests vs direct class enrollment. Covers data flows, service functions, RTDB paths, and the 2026-03-04 fix that removed the admin approval gate for teacher-initiated additions.'
createdAt: '2026-03-04T16:15:06.090Z'
updatedAt: '2026-04-09T08:00:08.813Z'
tags:
  - architecture
  - enrollment
  - assignment
  - teacher
  - student
---

# Architecture: Student-Teacher Assignment & Class Enrollment

## Overview

The system has two distinct relationship layers. Confusing them is a common source of bugs.

| Layer | Purpose | Primary RTDB Path | Notes |
|------|---------|-------------------|-------|
| **Assignment** | Links student ↔ teacher for access control and ownership | `student_teacher_assignments/{id}` | Independent of whether the student is in a class |
| **Class Enrollment** | Adds student to a specific class roster | `classes/{classId}/students/{studentId}` | Can be active immediately or pending teacher approval depending on entry path |

The approval gate now applies only to self-service class-code joins.

## Current Enrollment Modes

| Mode | Entry path | Initial status | Gate | Student-visible when |
|------|------------|----------------|------|----------------------|
| **Teacher/admin direct add** | `TeacherStudentsPage` or `AdminUserManagementPage` → `enrollStudent(..., { approvalMode: 'active' })` | `active` | None | Immediately |
| **Student self-service join by code** | `StudentDashboardPage` → `enrollStudent(classCode, studentId, ...)` | `pending_approval` | Teacher approval in `TeacherClassDetailPage` | After `approveClassStudent()` |

Assignment and class enrollment remain separate operations.

Required rules:
- staff-driven add-to-class remains immediate
- self-service class-code join remains pending until teacher approval
- approval is the point where class-linked course inheritance becomes active
- pending memberships must stay out of student-visible class reads

## Data Flow: Teacher Adds Student by Email

Current flow:
```text
TeacherStudentsPage → handleAddStudent(email)
  → getUserByEmail(email)
  → createAssignment(studentUid, teacherUid, teacherUid)
  → Student appears in teacher student list immediately
```

This creates the student-teacher relationship, not a class membership.

## Data Flow: Teacher/Admin Adds Student to Class

```text
TeacherStudentsPage/AdminUserManagementPage → handleConfirmAddToClass(classId)
  → enrollStudent(classId, student.uid, name, email, { approvalMode: 'active' })
  → Writes classes/{classId}/students/{studentUid} with status: 'active'
  → Writes student_classes/{studentUid}/{classId} with status: 'active'
  → Auto-enrolls linked class courses immediately
```

## Data Flow: Student Joins Class by Code

```text
StudentDashboardPage → submitJoinClass(classCode)
  → enrollStudent(classCode, student.uid, name, email)
  → Writes classes/{classId}/students/{studentUid} with status: 'pending_approval'
  → Writes student_classes/{studentUid}/{classId} with status: 'pending_approval'
  → Shows request-submitted message
  → Student remains blocked from shell class visibility and class-linked course access
```

## Data Flow: Teacher Approves or Rejects Pending Student

### Approve
```text
TeacherClassDetailPage → approveClassStudent(classId, studentId, teacherUid)
  → Updates roster membership to status: 'active'
  → Promotes student_classes projection to status: 'active'
  → Creates assignment if missing
  → Auto-enrolls linked class courses
```

### Reject
```text
TeacherClassDetailPage → rejectClassStudent(classId, studentId)
  → Removes pending roster member
  → Removes student_classes projection
  → Cleans stale class-based course inheritance
```

## Key Service Functions

### assignmentManager.ts
| Function | Purpose |
|----------|---------|
| `createAssignment(studentId, teacherId, assignedBy)` | Creates RTDB record linking student to teacher |
| `removeAssignment(id, reason)` | Soft-deletes assignment (status → `removed`) |
| `getAssignmentsByTeacher(teacherId)` | Gets all active assignments for a teacher |
| `getAllAssignments()` | Batch fetch avoiding N+1 (returns byStudent + byTeacher maps) |
| `createStudentRequest()` | Legacy admin-reviewed request path |
| `approveStudentRequest()` | Legacy admin approval path |

### classManager.ts
| Function | Purpose |
|----------|---------|
| `enrollStudent(classCode, uid, name, email, options?)` | Shared enrollment entry point for self-service join and staff-driven direct add |
| `approveClassStudent(classId, studentId, teacherUid)` | Promotes pending membership to active and triggers inheritance |
| `rejectClassStudent(classId, studentId)` | Removes pending membership and cleans stale inheritance |
| `removeStudentFromClass(classId, studentId)` | Removes membership and class-based inheritance |
| `addStudent(classId, name, email?)` | Adds guest or anonymous student |
| `getStudentClasses(studentUid)` | Returns student-visible classes only |

## RTDB Schema

### student_teacher_assignments/{assignmentId}
```json
{
  "id": "assignmentId",
  "studentId": "firebase-uid",
  "teacherId": "firebase-uid",
  "assignedBy": "firebase-uid",
  "assignedAt": 1709568000000,
  "unassignedAt": null,
  "coursesEnrolled": [],
  "status": "active"
}
```

### classes/{classId}/students/{studentId}
```json
{
  "id": "firebase-uid",
  "uid": "firebase-uid",
  "name": "Student Name",
  "email": "student@example.com",
  "joinedAt": 1709568000000,
  "lastActiveAt": 1709568000000,
  "isOnline": true,
  "status": "active",
  "assignments": {}
}
```

`status` may also be `pending_approval` or `removed`.

### student_classes/{studentId}/{classId}
```json
{
  "classId": "CLASS123",
  "name": "IELTS Reading Class",
  "teacherId": "teacher-uid",
  "status": "active",
  "joinedAt": 1709568000000
}
```

This is the student shell projection and must mirror the same visibility contract as the roster source.

### student_requests/{requestId} (Legacy)
```json
{
  "id": "requestId",
  "teacherId": "firebase-uid",
  "studentEmail": "student@example.com",
  "requestedAt": 1709568000000,
  "status": "pending",
  "reviewedBy": null,
  "reviewedAt": null
}
```

## Key Files

| File | Responsibility |
|------|---------------|
| `services/assignmentManager.ts` | Assignment CRUD plus legacy request system |
| `services/classManager.ts` | Class enrollment, approval, rejection, removal |
| `services/enrollmentManager.ts` | Course enrollment inheritance that consumes class visibility |
| `services/userService.ts` | `getUserByEmail()` for email lookup |
| `pages/TeacherStudentsPage.tsx` | Teacher student list and direct add-to-class UI |
| `pages/AdminUserManagementPage.jsx` | Admin direct add-to-class UI |
| `pages/TeacherClassDetailPage.tsx` | Teacher approval, reject, and remove UI |
| `pages/StudentDashboardPage.jsx` | Student class-code join request UI |

## Common Pitfalls

1. **Assignment ≠ Class Enrollment**: A student can be assigned to a teacher but not enrolled in any class.
2. **Staff add and self-service join are different**: both use `enrollStudent()`, but only self-service join is approval-gated.
3. **`pending_approval` is teacher-visible only**: if student shell reads show pending memberships, the approval contract is broken.
4. **Class-linked course inheritance must not happen on pending self-joins**: inheritance belongs to approval time, not request-submission time.
5. **`student_classes` is a projection, not a second source of truth**: it must mirror roster visibility and never drift into broader student access.
6. **Already enrolled remains a soft success**: if the student is already active in the class, `enrollStudent()` may return a soft success instead of a hard error.

## Related Docs

- @doc/architecture/class-code-join-approval-gating
- @doc/architecture/course-class-management
- @doc/architecture/student-shell-data-loading-architecture
- @doc/prd/prd-student-teacher-assignment

## Change History

- **2026-04-09**: Self-service class-code joins moved behind teacher approval. Pending memberships now stay out of student-visible class reads and linked class-course inheritance does not activate until `approveClassStudent()`.
- **2026-03-04 (b)**: Already-enrolled join attempts became a soft success instead of a hard error.
- **2026-03-04**: Removed the admin approval gate for teacher-initiated student additions by email; the legacy `student_requests` path remains only for historical or legacy use.
