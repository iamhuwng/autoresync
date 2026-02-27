---
title: Database Schema Reference
createdAt: '2026-02-27T17:02:46.653Z'
updatedAt: '2026-02-27T17:03:11.010Z'
description: >-
  Complete RTDB schema: all top-level nodes, TypeScript types, security rules,
  indexes, denormalization strategy.
tags:
  - architecture
  - database
  - schema
  - rtdb
  - core
---
# Database Schema Reference

## Overview

Complete Firebase Realtime Database schema reference. All data is stored in RTDB (no Firestore in production). This document maps every top-level node, its structure, security rules, and indexes.

## Top-Level Nodes

```
/ (RTDB root)
├── users/                         — User profiles & roles
├── tests/                         — Test definitions
├── sessions/                      — Active live sessions
├── classes/                       — Class definitions
├── courses/                       — Course definitions
├── course_requests/               — Enrollment requests
├── course_announcements/          — Class announcements
├── student_teacher_assignments/   — Student ↔ teacher links
├── test_results/                  — Individual test results
├── test_results_by_session/       — Session → results index
├── test_results_by_student/       — Student → results index
├── guest_results/                 — Guest user results
├── homework_assignments/          — Homework definitions
├── homework_submissions/          — Student homework attempts
├── homework_templates/            — Reusable homework configs
├── student_groups/                — Saved student groups
├── solo_sessions/                 — Solo practice sessions
├── notifications/                 — Per-user notifications
├── notification_preferences/      — Notification settings
├── system_flags/                  — System state flags
└── backups/                       — Backup metadata
```

## Node Details

### `/users/{uid}`
```typescript
{
  email: string,
  displayName: string,
  role: "student" | "teacher" | "super_admin",
  photoURL?: string,
  profile: { ... extended data }
}
```
**Security:** Auth'd user can read/write own. Super_admin can read all.

### `/tests/{testId}`
```typescript
{
  title: string,
  type: "ielts_reading" | "ielts_listening" | "thcs",
  passages: [...],
  questions: [...],
  metadata: { createdBy, createdAt, skill, ... },
  soloEnabled?: boolean,
  soloConfig?: { ... }
}
```
**Security:** Teacher (creator) can read/write. Students read via session.

### `/sessions/{sessionId}`
```typescript
{
  testId: string,
  teacherId: string,
  mode: "live" | "offline" | "solo" | "homework",
  status: "waiting" | "active" | "completed",
  participants: { [uid]: { name, joinedAt, submitted } },
  timer: { totalTime, startedAt, remaining }
}
```
**Security:** Teacher can read/write. Students read own session.

### `/homework_assignments/{homeworkId}`
Full schema: See @doc/system/database-schema-homework-solo
- Includes target, scheduling, config, visibility, stats
- Indexes: createdBy, target/classId, status, scheduling/dueDate

### `/homework_submissions/{submissionId}`
Full schema: See @doc/system/database-schema-homework-solo
- Tracks attempt number, timing, late status, result link
- Indexes: homeworkId, studentId

### `/student_teacher_assignments/{assignmentId}`
```typescript
{
  teacherId: string,
  studentId: string,
  status: "active" | "inactive",
  createdAt: number
}
```
**Indexes:** teacherId, studentId, status
**Security:** Teachers can read collection. Individual records: teacher or student.

### `/test_results/{resultId}`
```typescript
{
  studentId: string,
  sessionId: string,
  testId: string,
  answers: { [questionId]: answer },
  score: number,
  maxScore: number,
  percentage: number,
  bandScore?: number,       // IELTS
  scaledScore?: number,     // THCS
  context?: ResultContext,  // homework/solo/live
  submittedAt: number
}
```

### `/notifications/{userId}/{notificationId}`
```typescript
{
  type: string,
  title: string,
  message: string,
  read: boolean,
  createdAt: number,
  data: { ... },
  actionUrl?: string
}
```

### `/system_flags`
```typescript
{
  restore_in_progress: boolean  // Controls RestoreBanner
}
```

## Security Rules Summary

| Node | Read | Write |
|------|------|-------|
| `/users/{uid}` | Own + super_admin | Own |
| `/tests/{testId}` | Creator + session participants | Creator |
| `/sessions/{id}` | Teacher + participants | Teacher |
| `/student_teacher_assignments` | Teacher + super_admin (collection) | Teacher + super_admin |
| `/test_results/{id}` | Owner + teacher of session | System |
| `/homework_assignments/{id}` | Creator + target students | Creator |
| `/notifications/{userId}` | Own | Own + system |
| `/system_flags` | All authenticated | Super_admin |

## Denormalization Strategy

The RTDB schema uses strategic denormalization for read performance:
- `materialTitle` denormalized in homework assignments (avoids join)
- `studentName` denormalized in submissions
- `className` denormalized in targets
- `stats` object denormalized in homework (updated on submission)

## Related Docs
- @doc/system/database-schema-homework-solo — Full homework schema
- @doc/architecture/firebase-infrastructure — Firebase ops
- @doc/architecture/auth-rbac-architecture — Security rules context
- @doc/sop/security-fix-assignment-permissions — Permission fix
- @doc/guides/firebase-storage-rules — Firebase Storage rules
