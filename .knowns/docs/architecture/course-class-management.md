---
title: Course Class Management
createdAt: '2026-02-27T17:02:32.879Z'
updatedAt: '2026-03-20T02:28:32.512Z'
description: >-
  Course and class CRUD, enrollment flow, student-teacher assignments, access
  control, 8 services mapped.
tags:
  - architecture
  - course
  - class
  - enrollment
  - assignment
---
# Course & Class Management Architecture

## Overview

The course/class system manages the organizational structure: teachers create courses and classes, students enroll, and materials are organized within this hierarchy.

## Domain Model

```
Course (courseManager.ts)
├── Created by teacher
├── Has enrolled students (via requests)
├── Contains classes (instances)
└── Has materials (tests, quizzes)

Class (classManager.ts)
├── Instance of a course (or standalone)
├── Has teacher + students
├── Has sessions (live, offline)
├── Has announcements
└── Has homework assignments

Student-Teacher Assignment (assignmentManager.ts)
├── Links student ↔ teacher
├── Used for access control
└── Used for results visibility
```

## Key Services

| Service | Purpose | Lines |
|---------|---------|-------|
| `courseManager.ts` | Course CRUD, enrollment, status | Core |
| `courseRequestManager.ts` | Student enrollment requests (pending → approved/rejected) | Request flow |
| `classManager.ts` | Class CRUD, student management | Core |
| `assignmentManager.ts` | Student ↔ teacher bidirectional links | Access control |
| `courseAnnouncementService.ts` | Class announcements with attachments | Communication |
| `courseMaterialAccessService.ts` | Verify student access to materials | Security |
| `courseProgressService.ts` | Track student progress through course | Analytics |
| `courseTypeService.ts` | Course type/category management | Metadata |

## Pages

### Teacher Side
| Page | Purpose |
|------|---------|
| `TeacherClassesPage.tsx` | Class list management |
| `TeacherClassDetailPage.tsx` | Single class view (students, materials) |
| `TeacherStudentsPage.tsx` | View assigned students |
| `TeacherStudentHistoryPage.tsx` | Individual student test history |

### Student Side
| Page | Purpose |
|------|---------|
| `StudentCoursesPage.tsx` | My enrolled courses |
| `StudentClassDetailPage.jsx` | Single class view (assignments, announcements) |
| `CourseCatalogPage.tsx` | Browse available courses |

## Enrollment Flow

```
Student → CourseCatalogPage → "Request to Join"
  → courseRequestManager.createRequest()
  → Teacher sees pending request → Approve/Reject
  → On approve: assignmentManager.createAssignment()
  → Student now appears in class, can see materials
```

## RTDB Paths

```
/courses/{courseId}/      — Course definitions
/classes/{classId}/       — Class definitions + student lists
/student_teacher_assignments/{id}/ — Assignment links
  ├── teacherId, studentId, status
  └── .indexOn: ["teacherId", "studentId", "status"]
/course_requests/{id}/    — Pending enrollment requests
/course_announcements/{classId}/{id}/ — Announcements
```

## Security Gotchas

1. **Assignment permissions bug (FIXED):** Teachers couldn't read `/student_teacher_assignments` — needed collection-level read permission for teacher role. Fixed by adding `teacher` to parent `.read` rule.
   See @doc/sop/security-fix-assignment-permissions

2. **Access control on unassignment:** When teacher unassigns a student, results are preserved in DB but teacher access is revoked immediately via `AccessControlWrapper` periodic rechecks.

## Related Docs
- @doc/sop/security-fix-assignment-permissions — Assignment permission fix
- @doc/prd/prd-student-teacher-assignment — Assignment system PRD
- @doc/architecture/auth-rbac-architecture — Auth/RBAC (cross-ref)
- @doc/architecture/homework-solo-practice-architecture — Homework uses courses



## Course Sync System (Added 2026-03-14)

When a course is linked to a class, a **deep copy** is created (point-in-time snapshot). The sync system detects and surfaces new additions to the original course template.

**Key components:**
- `courseSyncService.ts` — detection, apply, dismiss logic
- `ModuleSyncBanner.tsx` — per-module inline sync notification
- `NewModuleSyncBanner.tsx` — banner for entirely new modules
- `ModuleList.tsx` — canonical component for rendering modules+materials (used by BOTH `TeacherCourseProfilePage` and `TeacherClassDetailPage`)

**Data model additions:**
- `Module.originalModuleId` — lineage tracking for copied modules
- `Module.lastSyncedAt` — timestamp-based sync filtering

See @doc/patterns/pattern-course-class-sync-thcs-title-resolution for full implementation details, lessons learned, and standards.



### Sync Button Fix (2026-03-19)
The Sync
