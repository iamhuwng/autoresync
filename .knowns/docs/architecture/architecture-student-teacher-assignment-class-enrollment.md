---
title: 'Architecture: Student-Teacher Assignment & Class Enrollment'
createdAt: '2026-03-04T16:15:06.090Z'
updatedAt: '2026-03-04T16:27:22.241Z'
description: >-
  Documents the two distinct systems for managing student-teacher relationships:
  assignment requests vs direct class enrollment. Covers data flows, service
  functions, RTDB paths, and the 2026-03-04 fix that removed the admin approval
  gate for teacher-initiated additions.
tags:
  - architecture
  - enrollment
  - assignment
  - teacher
  - student
---
# Architecture: Student-Teacher Assignment & Class Enrollment

## Overview

The system has **two distinct mechanisms** for managing student-teacher relationships. Confusing them is a common source of bugs.

| System | Purpose | RTDB Path | Gate |
|--------|---------|-----------|------|
| **Assignment** | Links student ↔ teacher | `student_teacher_assignments/{id}` | None (direct) |
| **Class Enrollment** | Adds student to a class roster | `classes/{classId}/students/{studentId}` | None (direct) |

There is also a **legacy request system** (now bypassed) at `student_requests/{id}` that was the original admin-approval gate.

## Data Flow: Teacher Adds Student by Email

**Current flow (after 2026-03-04 fix):**
```
TeacherStudentsPage → handleAddStudent(email)
  → getUserByEmail(email)              // userService.ts
  → createAssignment(studentUid, teacherUid, teacherUid)  // assignmentManager.ts
  → Student appears in teacher's list immediately
```

**Previous flow (admin-gated, now bypassed):**
```
TeacherStudentsPage → handleRequestStudent(email)
  → createStudentRequest(teacherId, email)  // assignmentManager.ts
  → Writes to student_requests/{id} with status: 'pending'
  → Admin approves → approveStudentRequest() → creates assignment
```

## Data Flow: Teacher Adds Student to Class

Once a student is in the teacher's student list, they can be added to a class:
```
TeacherStudentsPage → handleConfirmAddToClass(classId)
  → enrollStudent(classCode, student.uid, name, email)  // classManager.ts
  → Writes to classes/{classCode}/students/{studentUid}
  → Also writes legacy gameSessions/{classCode}/players/{studentUid}
  → Auto-enrolls in class courses via autoEnrollStudentInClassCourses()
```

## Key Service Functions

### assignmentManager.ts
| Function | Purpose |
|----------|---------|
| `createAssignment(studentId, teacherId, assignedBy)` | Creates RTDB record linking student to teacher |
| `removeAssignment(id, reason)` | Soft-deletes assignment (status → 'removed') |
| `getAssignmentsByTeacher(teacherId)` | Gets all active assignments for a teacher |
| `getAllAssignments()` | Batch fetch avoiding N+1 (returns byStudent + byTeacher maps) |
| `createStudentRequest()` | **Legacy** - creates pending admin request |
| `approveStudentRequest()` | **Legacy** - admin approves and creates assignment |

### classManager.ts
| Function | Purpose |
|----------|---------|
| `enrollStudent(classCode, uid, name, email)` | Enrolls authenticated user in a class |
| `addStudent(classId, name, email?)` | Adds guest/anonymous student to a class |

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
  "status": "active"  // or "removed"
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
  "assignments": {}
}
```

### student_requests/{requestId} (Legacy)
```json
{
  "id": "requestId",
  "teacherId": "firebase-uid",
  "studentEmail": "student@example.com",
  "requestedAt": 1709568000000,
  "status": "pending",  // "approved" | "denied"
  "reviewedBy": null,
  "reviewedAt": null
}
```

## Key Files

| File | Responsibility |
|------|---------------|
| `services/assignmentManager.ts` | All assignment CRUD + request system |
| `services/classManager.ts` | Class enrollment (`enrollStudent`, `addStudent`) |
| `services/userService.ts` | `getUserByEmail()` for email lookup |
| `pages/TeacherStudentsPage.tsx` | Teacher UI for managing students |
| `components/assignment/TeacherRequestModal.tsx` | "Add Student" modal (email input) |
| `components/assignment/AddToClassModal.tsx` | "Add to Class" modal (class picker) |
| `hooks/admin/useStudentRequests.ts` | Hook for legacy request management |

## Common Pitfalls

1. **Assignment ≠ Class Enrollment**: A student can be assigned to a teacher but not enrolled in any class. They are separate operations.
2. **The "Add Student" button opens TeacherRequestModal**, not AddToClassModal. These are two different modals serving different purposes.
3. **`enrollStudent()` uses classCode as the path key**, not a separate classId. The classCode IS the class identifier in RTDB.
4. **Guest vs Authenticated**: `addStudent()` generates a new ID for guests; `enrollStudent()` uses the Firebase Auth UID.
5. **"Already enrolled" is a soft success, not an error** (fixed 2026-03-04): When a student is already in the class (e.g., teacher added them by email), `enrollStudent()` returns `{ success: true, alreadyEnrolled: true }` instead of a hard error. The UI shows a friendly message ("You're already in this class!") and still refreshes the class list. This prevents confusing error messages when students try to join a class they were already added to through a different mechanism.
6. **Dashboard class list is a one-shot fetch**: `getStudentClasses()` runs once on mount. If a teacher adds a student after the dashboard loads, the student won't see the class until they navigate away and back (or refresh). This is why students may try to "join" a class they're already in — they can't see it yet.
## Change History

- **2026-03-04 (b)**: Fixed "Already enrolled" error → soft success. `enrollStudent()` now returns `{ success: true, alreadyEnrolled: true }` when student is already in the class, instead of `{ success: false, error: 'Already enrolled...' }`. UI in `StudentDashboardPage.jsx` handles this with a friendly message and class list refresh. Root cause: teacher-added students couldn't see the class on their dashboard (one-shot fetch), tried to join via code, got a confusing error.
- **2026-03-04**: Removed admin approval gate. Teachers can now directly add students by email via `createAssignment()`. The `student_requests` system remains intact for audit/history but is no longer used for new additions.
