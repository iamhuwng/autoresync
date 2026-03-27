---
title: Session Test Modes
description: Live/offline/solo/homework session modes, timer sync, teacher monitor, session lifecycle, RTDB schema.
createdAt: '2026-02-27T17:10:31.878Z'
updatedAt: '2026-03-24T23:04:08.558Z'
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

The session system orchestrates real-time test-taking. A teacher creates a session, students join, the timer syncs, and results are collected. Multiple modes change how the session behaves. In live sessions, the teacher monitor is also the primary integrity-review surface: it combines progress tracking with real-time anti-cheat visibility.

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

Real-time dashboard showing student progress, integrity risk, and teacher controls during live sessions:

```
TeacherTestMonitorPage.tsx
├── Student cards (name, status, progress %, integrity badge)
├── Session Integrity summary (flagged students, high-risk count, total counted violations)
├── Incremental teacher toasts when a student's violation count increases
├── Integrity detail panel opened from summary alert chips or per-student badges
├── "Refresh Logs" control to request student clients flush integrity state
└── RTDB-backed player state for progress + integrity review
```

### Live Integrity Monitoring

- The monitor must normalize two payload shapes: a full integrity report with an event timeline, or a summary-only payload with aggregate counts.
- Summary UI should always show risk level, counted violations, and aggregate evidence even when no event timeline is present yet.
- Teacher alerts are incremental: initial page load reflects current status, but toast alerts only fire when `violationCount` increases after the monitor is already open.
- Teachers can inspect the same detail panel from two entry points: the session-level alert summary and the per-student integrity badge.
- In live sessions, `strict` means stronger detection for teacher review, not necessarily student warnings or automatic punishment. Session-context defaults may disable auto-submit and student warnings.
- Manual refresh is a recovery path for suspected stale integrity state. It asks student clients to flush current integrity data for review.

## Key Services

| Service | Purpose |
|---------|---------|
| `sessionService.ts` | Session CRUD, join, start, end |
| `resultService.ts` | Result saving and retrieval |
| `sessionStudentControlService.ts` | Teacher-triggered session control actions such as integrity log refresh and force-submit |
| `utils/integrityUtils.ts` | Shared normalization for full-report and summary-only integrity payloads |

## RTDB Session Path

```
/game_sessions/{sessionCode}/
  ├── testId: string
  ├── teacherId: string
  ├── mode: "live" | "offline" | "solo" | "homework"
  ├── status: "waiting" | "active" | "completed"
  ├── sessionCode: string
  ├── players/
  │   └── {studentId}/
  │       ├── name: string
  │       ├── joinedAt: number
  │       ├── submitted: boolean
  │       ├── progress: number
  │       └── integrity/
  │           ├── violationCount: number
  │           ├── riskLevel: "low" | "medium" | "high"
  │           ├── tabSwitchCount: number
  │           ├── totalTimeAwayMs: number
  │           ├── forceSubmitted: boolean
  │           └── events?: IntegrityEvent[]
  └── timer/
      ├── totalTime: number
      ├── startedAt: number
      └── status: string
```

> The live teacher monitor should assume `integrity` may be stored either as a full report (`events` present) or as an aggregate-only summary payload.

## Related Docs
- @doc/architecture/test-system-architecture — Test lifecycle (parent)
- @doc/patterns/test-taking-flow-pattern — Student test-taking pattern
- @doc/patterns/pattern-live-session-integrity-visibility — Reusable teacher integrity visibility pattern
- @doc/sop/timer-bug-fix-retrospective — Timer bug
- @doc/sop/test-end-flow-debug-retrospective — End flow bug
- @doc/prd/prd-test-duration-end-flow — End flow PRD


## Student-Safe Payload Contract (2026-03-25)

Live session start performs two separate operations in sequence:
1. Build and cache `session_test_payloads/{sessionCode}` from the full test document.
2. Update `game_sessions/{sessionCode}` with `status`, `startTime`, and `antiCheatConfig`.

`antiCheatConfig` is session metadata. It does not change the payload schema and is consumed later by student clients for runtime behavior such as fullscreen enforcement, copy/paste detection, and client-side shuffling.

### Shape Rules
- IELTS and legacy tests expose a flat root `questions[]` array.
- THCS tests expose `sections[].questions` and do not have a root `questions` array.
- The student-safe payload builder must preserve whichever document shape the student surface expects while stripping answer-bearing fields from the question containers that actually exist.

### March 25, 2026 Regression
A session-start failure occurred because the payload builder assumed `testData.questions` always existed. Starting a THCS live session crashed before the session status update because THCS tests store questions under `sections[].questions`.

### Guardrail
When a new test type can be started in live mode, update both the start-path payload sanitizer and the regression tests for that test type. See @doc/patterns/pattern-shape-aware-student-safe-test-payloads.
