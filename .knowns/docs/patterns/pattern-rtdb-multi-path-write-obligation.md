---
title: 'Pattern: RTDB Multi-Path Write Obligation'
createdAt: '2026-02-28T12:13:04.062Z'
updatedAt: '2026-02-28T16:40:52.488Z'
description: >-
  When saving RTDB records that use index-based lookups, ALL required paths must
  be written — not just the index. Missing writes cause silent data loss.
tags:
  - pattern
  - rtdb
  - firebase
  - bug-prevention
  - data-integrity
---
# Pattern: RTDB Multi-Path Write Obligation

## Problem

Firebase RTDB uses a fan-out index architecture where data is stored redundantly across multiple paths for efficient querying:

```
test_results/{resultId}                          ← Main record
test_results_by_student/{studentId}/{resultId}   ← Student index
test_results_by_session/{sessionCode}/{resultId} ← Session index
test_results_by_teacher/{teacherId}/{resultId}   ← Teacher index
```

**The read side** (e.g., `academicRecordService.getResultsByStudent()`) follows a 2-step lookup:
1. Read IDs from index: `test_results_by_student/{studentId}` → `[id1, id2, ...]`
2. Fetch full record: `test_results/{resultId}` for each ID

If the **write side** only populates some of these paths (e.g., writes the index but not the main record), the read side silently returns `null` and the record disappears.

### Real-World Bug (2026-02-28)

**Writing test submissions** only wrote to:
- ✅ `test_results_by_student/{studentId}/{resultId}` (the index)
- ❌ `test_results/{resultId}` — **NEVER WRITTEN**

Result: Students submitted writing tests, saw the "Test Submitted" modal, but their Academic Record tab showed **nothing**. The index had the ID, but `getResultsByStudent()` couldn't fetch the actual record, so it silently dropped it.

**Affected code paths:**
- `writingSubmissionService.autoSubmitFromRTDB()` — live sessions
- `WritingPracticeView.handleSubmit()` — solo practice

## Solution

**When creating a new feature that stores RTDB records, audit ALL read paths and ensure the write side populates them all.**

### Canonical Write Example (`testResults.service.ts`)

```typescript
// 1. Write main record (REQUIRED — read side fetches from here)
const resultRef = ref(database, `test_results/${resultId}`);
await set(resultRef, resultRecord);

// 2. Write session index
const sessionIndexRef = ref(database, `test_results_by_session/${sessionCode}/${resultId}`);
await set(sessionIndexRef, { resultId, studentId, studentName, percentage, submittedAt });

// 3. Write student index
const studentIndexRef = ref(database, `test_results_by_student/${studentId}/${resultId}`);
await set(studentIndexRef, { resultId, sessionCode, testId, percentage, submittedAt });

// 4. Write teacher index (if teacherId present)
if (teacherId) {
    const teacherIndexRef = ref(database, `test_results_by_teacher/${teacherId}/${resultId}`);
    await set(teacherIndexRef, { resultId, sessionCode, studentId, studentName, percentage, submittedAt });
}
```

### The Fix

```typescript
// BEFORE (broken): Only wrote the index
await set(
    ref(database, `test_results_by_student/${studentId}/${resultId}`),
    resultRecord
);

// AFTER (fixed): Write main record THEN index
await set(ref(database, `test_results/${resultId}`), resultRecord);
await set(
    ref(database, `test_results_by_student/${studentId}/${resultId}`),
    resultRecord
);
```

## Anti-Pattern

### ❌ Wrong: Writing only the index

```typescript
// This creates an orphan index entry — read side will fetch the ID
// but then fail to find the actual record at test_results/{id}
await set(
    ref(database, `test_results_by_student/${studentId}/${resultId}`),
    fullRecord
);
// Missing: test_results/{resultId} write!
```

### ❌ Wrong: Assuming the index IS the record

The student index embeds the full record data, but the read side does NOT read it — it only reads the keys and then fetches from `test_results/`. Having data in the index does NOT substitute for the main record.

## Self-Check

When writing a new RTDB record (any feature, not just test results):

- [ ] Identify ALL read paths that will consume this data
- [ ] Trace each read function to find which RTDB path it fetches from
- [ ] Ensure your write function populates ALL of those paths
- [ ] Cross-reference with `saveTestResult()` in `testResults.service.ts` as the canonical pattern
- [ ] Test the full flow: write → read → display

### RTDB Paths Registry (Test Results)

| Path | Written by | Read by | Purpose |
|------|-----------|---------|---------|
| `test_results/{resultId}` | `saveTestResult`, `writingSubmissionService` | `getTestResult`, `getResultsByStudent` (academic record) | Main record |
| `test_results_by_student/{sid}/{rid}` | Same | `getStudentResults`, `getResultsByStudent` | Student index → ID lookup |
| `test_results_by_session/{code}/{rid}` | Same | `getSessionResults` | Session index |
| `test_results_by_teacher/{tid}/{rid}` | `saveTestResult` | `getTeacherResults` | Teacher index |

## Related

- @doc/patterns/pattern-resilient-rtdb-batch-fetching — Handles the READ side (resilient fetching when some records are missing/permission-denied)
- This pattern handles the WRITE side (ensuring records exist in all required paths)



## Root Cause: PRD-Level Spec Incompleteness

The code bug was a **symptom**. The root cause was at the PRD level:

1. **PRD §4.1.4 Storage Map** only showed `test_results_by_student` — never mentioned `test_results/{resultId}`
2. **Task 3.8** faithfully followed the incomplete spec → "creates RTDB result at `test_results_by_student`"
3. **Code** faithfully followed the task → only wrote to the index

### Lesson for PRD Authors

When designing a new data flow that touches existing data domains:

```markdown
<!-- ✅ CORRECT — PRD explicitly references existing pattern -->
> ⚠️ Writing test submissions MUST follow the same result storage
> pattern as `saveTestResult()` in `testResults.service.ts:124-338`.
> Write to: test_results/{id}, test_results_by_student/,
> test_results_by_session/, test_results_by_teacher/.

<!-- ❌ WRONG — PRD only shows one write location -->
> Submit → RTDB test_results_by_student/{studentId}/{resultId}
```

## Formalized as Integration Safety Rule 17

This pattern was generalized into **Rule 17 — Producer-Consumer Contract** in `documentation/integration-safety-rules.md`. Rule 17 extends beyond RTDB test results to cover ALL scenarios where new code writes data that existing code reads:

- New notification types must match existing notification document shapes
- New homework submissions must set ALL status fields the list component checks
- New user data writes must populate all sub-paths the profile page expects

**Trigger:** Writing new data to a path where existing code already reads.
**Self-check:** _"Have I traced every reader and confirmed my write satisfies all of them?"_
