---
title: 'Pattern: Live Session Integrity Visibility'
description: Reusable pattern for surfacing live-session integrity signals to teachers through badges, summary alerts, and on-demand detail panels.
createdAt: '2026-03-24T23:00:39.032Z'
updatedAt: '2026-03-24T23:01:29.127Z'
tags:
  - pattern
  - live-session
  - integrity
  - teacher
  - monitor
  - alerts
---

# Pattern: Live Session Integrity Visibility

## Problem

Student-side anti-cheat can be working while teachers still see nothing actionable if the live monitor only exposes passive counters or hides integrity review behind a separate workflow. Live-session monitoring needs immediate visibility without replaying old alerts as if they were new incidents.

## Solution

Surface integrity in three layers:

1. Passive status on each student card.
2. Aggregated session-level summary with flagged counts and high-risk alert chips.
3. On-demand detail panel for investigation.

The teacher UI must normalize and render both payload shapes that can appear in live monitoring:

- A full integrity report with an `events` timeline.
- A summary-only payload with aggregate counts and risk metadata.

## Alerting Rules

- Do not replay historical alerts on initial page load.
- Emit teacher toasts only when `violationCount` increases after the monitor subscription is active.
- Treat opening integrity details as a first-class teacher action worth tracking.

## Manual Recovery

- Provide a teacher-triggered refresh control that asks student clients to flush current integrity state.
- Use this when the teacher suspects reconnect lag or stale monitor data.

## Constraints

- In live sessions, a `strict` preset can still mean aggressive detection for teacher review without enabling student warnings or auto-submit.
- Risk messaging should emphasize both severity (`low` / `medium` / `high`) and counted violations.
- Detail UI should degrade gracefully when only an aggregate summary is available.

## Example

```typescript
const report = normalizeIntegrityReport(rawIntegrity)
  ?? normalizeHomeworkIntegrity(rawIntegrity);

const flaggedStudents = students
  .map((student) => ({
    student,
    report: getIntegrityViewData(student.studentId),
  }))
  .filter((entry) => entry.report && entry.report.violationCount > 0);

const shouldToast = nextViolationCount > previousViolationCount;
```

## Moving Forward Standard

- Any live teacher monitor that surfaces suspicious behavior should implement all three layers.
- Summary UI must work even when no event timeline is present.
- Detail entry should be reusable from both summary alerts and per-student cards.
- Manual refresh should exist wherever live integrity state depends on client flush timing.

## Related Docs

- @doc/architecture/session-test-modes
- @doc/architecture/test-system-architecture
