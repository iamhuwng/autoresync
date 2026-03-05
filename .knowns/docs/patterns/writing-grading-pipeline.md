---
title: Writing Grading Pipeline
createdAt: '2026-03-01T18:05:14.234Z'
updatedAt: '2026-03-01T18:05:14.234Z'
description: >-
  Canonical pattern for implementing writing question grading across all test
  types
tags:
  - writing-grading
  - pattern
  - enforcement
  - dual-write
---
# Writing Grading Pipeline

> **Canonical pattern** for grading writing questions across all test types (THCS, IELTS, etc.)

## Overview

Any feature that grades student writing must implement a **4-layer pipeline** to ensure data integrity, auditability, and correct student-facing display.

## The 4 Layers

### Layer 1: Grading Identity
Every grade write includes:
- `gradedByUid` — Firebase UID of the grading teacher
- `gradedByName` — Display name of the grading teacher
- `gradedAt` — `Date.now()` timestamp

### Layer 2: Dual-Write
Every grade save writes to:
1. **RTDB session** — `sessions/{code}/results/{studentId}/writingGrading/{qIndex}` (real-time, teacher monitor)
2. **Permanent record** — `test_results/{resultId}` via `updateThcsWritingGrade()` (student academic records)

RTDB is the primary (time-critical). If permanent write fails, log warning but don't roll back RTDB.

### Layer 3: markingStatus State Machine
```
auto-marked → partially-graded (first writing Q graded)
partially-graded → reviewed (ALL writing Qs graded)
```
Managed by `updateThcsWritingGrade()` which counts remaining ungraded writing questions.

### Layer 4: Student Display
`ResultDetailPage.tsx` shows:
- "Graded by {teacherName}" when `gradedByName` exists
- Gracefully omits when absent (backward compat)
- Model answers only when `correctAnswer`/`modelAnswers` present

## Key Files

| File | Role |
|------|------|
| `src/components/thcs-grading/InlineWritingGrader.tsx` | Teacher grading UI |
| `src/services/testResults.service.ts` → `updateThcsWritingGrade()` | Permanent record write + markingStatus |
| `src/pages/ResultDetailPage.tsx` | Student result view |
| `src/types/thcs-test.types.ts` → `WritingGradingResult` | Type definitions |
| `src/services/thcsAutoMarking.service.ts` | Auto-marking bridge |

## Writing Question Types

Identified by `questionType`:
- `writing`
- `sentence-rewrite`
- `sentence-rewrite-keyword`

## Enforcement

This pattern is enforced by **Rule 18** in `documentation/integration-safety-rules.md`.

## Self-Check

Before marking any writing grading task as done:
1. Does grade data include `gradedByUid`, `gradedByName`, `gradedAt`?
2. Dual-write to RTDB + permanent record?
3. Does `markingStatus` transition correctly?
4. Does student view show "Graded by" with graceful degradation?
