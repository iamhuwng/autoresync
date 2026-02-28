---
title: 'Pattern: Resilient RTDB Batch Fetching'
createdAt: '2026-02-28T11:51:35.657Z'
updatedAt: '2026-02-28T12:13:45.666Z'
description: >-
  Pattern for batch-fetching Firebase RTDB records via index lookups without one
  permission-denied or missing record killing the entire query
tags:
  - pattern
  - firebase
  - rtdb
  - resilience
  - error-handling
---
# Pattern: Resilient RTDB Batch Fetching

## Problem

Firebase RTDB uses an **index → record** pattern where:
1. An index node (`test_results_by_student/{studentId}`) lists result IDs
2. Each result is fetched individually from `test_results/{resultId}`

Security rules restrict reads at the record level (e.g., `data.child('studentId').val() === auth.uid`). This creates a fragile chain:

- **Orphaned index entries** — an index points to a result that belongs to another student (data corruption, migration bug)
- **Deleted records** — index entry exists but the record was deleted
- **Race conditions** — record written but security rule data not yet consistent

When using `Promise.all`, **one** failed read rejects the entire batch, causing cascading errors that retry endlessly.

### Real-World Symptom

```
📊 [TestResultsModal] Loading result for student G5yDXm... (attempt 1)
Error getting test result: Permission denied
Error getting student results: Permission denied
[TestResultsModal] Error loading result: Permission denied
📊 [TestResultsModal] Loading result for student G5yDXm... (attempt 2)
... repeats 8 times ...
```

## Solution

### 1. Make the unit fetcher resilient

Return `null` on permission denied instead of throwing:

```typescript
export async function getTestResult(resultId: string): Promise<TestResultRecord | null> {
  try {
    const resultRef = ref(database, `test_results/${resultId}`);
    const snapshot = await get(resultRef);
    return snapshot.exists() ? snapshot.val() as TestResultRecord : null;
  } catch (error: any) {
    // Permission denied = orphaned index entry or mismatched studentId
    if (error?.message?.includes('Permission denied') || error?.code === 'PERMISSION_DENIED') {
      console.warn(`⚠️ [getTestResult] Permission denied for ${resultId} — skipping`);
      return null;
    }
    throw error; // Re-throw non-permission errors
  }
}
```

### 2. Use `Promise.allSettled` in batch fetchers

```typescript
export async function getStudentResults(studentId: string): Promise<TestResultRecord[]> {
  const indexRef = ref(database, `test_results_by_student/${studentId}`);
  const indexSnapshot = await get(indexRef);
  if (!indexSnapshot.exists()) return [];

  const resultIds = Object.keys(indexSnapshot.val());

  // allSettled: one failure doesn't kill the batch
  const settled = await Promise.allSettled(
    resultIds.map((id) => getTestResult(id))
  );

  const results: TestResultRecord[] = [];
  for (const entry of settled) {
    if (entry.status === 'fulfilled' && entry.value) {
      results.push(entry.value);
    }
    // rejected = silently skipped (already logged in getTestResult)
  }
  return results;
}
```

## Anti-Pattern

### ❌ Wrong: `Promise.all` with throwing fetcher

```typescript
// ONE permission denied → entire array rejects → caller gets nothing
const results = await Promise.all(
  resultIds.map((id) => getTestResult(id)) // throws on Permission denied!
);
```

### ❌ Wrong: Swallowing ALL errors

```typescript
// Don't swallow network errors, only permission errors
catch (error) {
  return null; // BAD: hides real bugs like network failures
}
```

### ✅ Correct: Selective error handling

```typescript
catch (error: any) {
  if (error?.message?.includes('Permission denied')) {
    return null; // Expected: orphaned index entry
  }
  throw error; // Unexpected: network error, auth expired, etc.
}
```

## When to Apply

Apply this pattern whenever:
- Fetching RTDB records via a **fan-out index** (index node → N individual reads)
- Security rules restrict reads per-record (not per-index)
- The index can potentially contain stale/orphaned entries

## Files Changed (Source)

| File | Function | Change |
|------|----------|--------|
| `testResults.service.ts` | `getTestResult` | Catch permission denied → return null |
| `testResults.service.ts` | `getStudentResults` | `Promise.all` → `Promise.allSettled` |
| `testResults.service.ts` | `getSessionResults` | `Promise.all` → `Promise.allSettled` |
| `testResults.service.ts` | `getTeacherResults` | `Promise.all` → `Promise.allSettled` |
| `academicRecordService.ts` | `getResultsByStudent` | `Promise.allSettled` + per-item catch |

## Self-Check

When writing RTDB fan-out index → record fetching:
- [ ] Unit fetcher catches `Permission denied` and returns null
- [ ] Batch fetcher uses `Promise.allSettled`, NOT `Promise.all`
- [ ] Non-permission errors are still thrown/propagated
- [ ] Each skipped entry is logged with a warning (for debugging data integrity)

## Related

- @doc/patterns/pattern-firestore-query-safety — Covers Firestore query field name mismatches
- @doc/patterns/pattern-fire-and-forget-notification-wiring — Similar fire-and-forget error handling pattern
- @doc/integration-safety-rules — Rule 12 (Backup Coverage Check)


- @doc/patterns/pattern-rtdb-multi-path-write-obligation — Handles the WRITE side (ensuring records exist in all required paths so the read side doesn't get nulls)
