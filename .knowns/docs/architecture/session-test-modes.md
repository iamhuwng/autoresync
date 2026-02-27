---
title: Session Test Modes
createdAt: '2026-02-27T17:10:31.878Z'
updatedAt: '2026-02-27T17:11:00.865Z'
description: >-
  Live/offline/solo/homework session modes, timer sync, teacher monitor, session
  lifecycle, RTDB schema.
tags:
  - architecture
  - session
  - modes
  - timer
  - live
  - monitor
---
# Live Session & Test Modes Architecture

## Overview

The session system orchestrates real-time test-taking. A teacher creates a session, students join, the timer syncs, and results are collected. Multiple modes change how the session behaves.

## Session Modes

| Mode | Description | Timer | Teacher Monitor | Auto-Submit |
|------|-------------|-------|-----------------|-------------|
| **Live (Exam)** | Teacher controls session, students take simultaneously | Server-synced | Yes, real-time | Yes, on timer end |
| **Live (Standard)** | Same as exam but with immediate feedback | Server-synced | Yes | Yes |
| **Offline** | Students take whenever, teacher reviews later | Client-side | No | No (submit manually) |
| **Solo Practice** | Student picks from library, self-paced | Client-side (optional) | No | Optional |
| **Homework** | Teacher assigns with deadline | Client-side (if set) | Submission tracking | On deadline (if enabled) |

## Session Lifecycle

```
Teacher: Create Session (from test)
  → sessionService.createSession()
  → Session state: WAITING
  → Share session code with students

Students: Join via code
  → sessionService.joinSession(code)
  → RTDB: /sessions/{id}/participants/{uid}
  → Session state changes to ACTIVE when teacher starts

Teacher: Start Test
  → sessionService.startSession()
  → Timer starts (synced via RTDB: /sessions/{id}/timer)
  → All students see countdown simultaneously

During Test:
  → Students answer questions
  → Answers saved to sessionStorage (client) + RTDB (on submit)
  → Teacher Monitor shows real-time progress

End of Test:
  → Timer reaches 0 → auto-submit all students
  → OR student clicks "Submit" manually
  → OR teacher ends session manually
  → Results saved to /test_results
  → Session state: COMPLETED
```

## Timer Synchronization

Two timer implementations:
1. **IELTS:** `StudentQuizPage.jsx` — server-synced via RTDB `/sessions/{id}/timer`
2. **THCS:** `StudentSoloTestPage.tsx` — client-side timer with RTDB fallback

### Timer RTDB Path
```
/sessions/{sessionId}/timer/
  ├── totalTime: number     — Total seconds
  ├── startedAt: number     — Server timestamp
  ├── remaining: number     — Seconds remaining (updated periodically)
  └── status: "running" | "paused" | "ended"
```

### Known Timer Gotcha
**Integration Safety Rule #6:** When using `useEffect` with `setInterval` + state variables in deps, use refs to avoid stale closures.
See @doc/sop/timer-bug-fix-retrospective

## Teacher Monitor

Real-time dashboard showing student progress during live sessions:

```
TeacherTestMonitorPage.tsx
├── Student cards (name, status, progress %)
├── Timer display (synced with students)
├── "End Test" button (force-submits all)
└── RTDB listener: /sessions/{id}/participants
```

## Key Services

| Service | Purpose |
|---------|---------|
| `sessionService.ts` | Session CRUD, join, start, end |
| `resultService.ts` | Result saving and retrieval |

## RTDB Session Path

```
/sessions/{sessionId}/
  ├── testId: string
  ├── teacherId: string
  ├── mode: "live" | "offline" | "solo" | "homework"
  ├── status: "waiting" | "active" | "completed"
  ├── sessionCode: string       — 6-digit join code
  ├── participants/
  │   └── {uid}/
  │       ├── name: string
  │       ├── joinedAt: number
  │       ├── submitted: boolean
  │       └── progress: number  — Questions answered
  └── timer/
      ├── totalTime: number
      ├── startedAt: number
      └── status: string
```

## Related Docs
- @doc/architecture/test-system-architecture — Test lifecycle (parent)
- @doc/patterns/test-taking-flow-pattern — Student test-taking pattern
- @doc/sop/timer-bug-fix-retrospective — Timer bug
- @doc/sop/test-end-flow-debug-retrospective — End flow bug
- @doc/prd/prd-test-duration-end-flow — End flow PRD
