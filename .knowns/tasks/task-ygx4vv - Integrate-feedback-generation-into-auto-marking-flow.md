---
id: ygx4vv
title: Integrate feedback generation into auto-marking flow
status: done
priority: high
labels:
  - from-spec
  - formative-feedback
createdAt: '2026-03-04T21:25:23.637Z'
updatedAt: '2026-03-04T21:59:45.095Z'
timeSpent: 160
spec: specs/ai-formative-assessment-feedback
fulfills:
  - AC-1
order: 4
---
# Integrate feedback generation into auto-marking flow

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After markThcsTest() completes and the result is saved, trigger generateFormativeFeedback() asynchronously. Save the feedback to the result record in RTDB. Ensure it's non-blocking — the test result should be immediately available to the student, with feedback arriving async. Also update testResults.service.ts to load formativeFeedback when reading results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Feedback generation triggered after auto-marking + result save completes
- [x] #2 Non-blocking — test result available immediately, feedback arrives async
- [x] #3 Feedback saved to test_results/{resultId}/formativeFeedback in RTDB
- [x] #4 testResults.service.ts loads formativeFeedback when reading results
- [x] #5 No new RTDB nodes created — stored as child of existing result
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan: Integrate Feedback Generation into Auto-Marking Flow

### Key Insight: Submission Runs Client-Side
Both `THCSTestLayout.tsx` (line 407-460) and `THCSPracticeView.tsx` (line 355-416) call `markThcsTest()` + `saveTestResult()` directly in the client. The feedback generation trigger must be fire-and-forget **after** `saveTestResult` returns the `resultId`.

### Integration Points (3 call sites)

#### 1. `THCSTestLayout.tsx` (live session — line ~460)
After `await saveTestResult(...)` returns `resultId` (line 460), add fire-and-forget:
```typescript
// Fire-and-forget: Formative feedback generation (async, non-blocking)
import('../../services/formativeFeedback.service').then(({ generateFormativeFeedback }) => {
    generateFormativeFeedback(gradingResult, testData.sections, {
        title: testData.metadata.title,
        gradeLevel: testData.metadata.gradeLevel || 9,
    }, resultId).catch(err => console.warn('[THCS] Formative feedback failed:', err));
}).catch(err => console.warn('Failed to load formativeFeedback service:', err));
```
**Placement**: After line 460, alongside the existing fire-and-forget blocks (stats update line 497, academic record line 517, writing grading line 539).

**CRITICAL**: `saveTestResult()` currently does NOT return `resultId` in `THCSTestLayout.tsx` — the return value is not captured. Must capture it:
```typescript
const resultId = await saveTestResult(...)
```

#### 2. `THCSPracticeView.tsx` (homework/self-study — line ~416)
Same pattern. `resultId` is already captured on line 389. Add fire-and-forget after line 416.

#### 3. `autoSubmitDisconnected.ts` (disconnected auto-submit — line ~354)
`resultId` already captured. Add same fire-and-forget pattern.

### Service: `formativeFeedback.service.ts` — `generateFormativeFeedback()` wrapper

The main function signature needs a `resultId` parameter to know where to write:
```typescript
export async function generateFormativeFeedback(
    gradingResult: THCSGradingResult,
    sections: THCSSection[],
    testMetadata: { title: string; gradeLevel: number },
    resultId: string, // <-- needed to write back
): Promise<void>
```

**Write logic** (at end of function):
```typescript
// Write feedback to existing result record
import { ref, update } from 'firebase/database';
import { database } from './firebase';

const feedbackRef = ref(database, `test_results/${resultId}/formativeFeedback`);
await update(ref(database, `test_results/${resultId}`), {
    formativeFeedback: feedback,
});
```

### Reading: testResults.service.ts

**No changes needed** — `getTestResult()` (line 355-375) reads the entire `test_results/{resultId}` record via `get()`, so it automatically includes `formativeFeedback` when it exists. The data is already returned as part of `TestResultRecord`.

However, we should **add the optional field to the TypeScript interface**:
```typescript
// In TestResultRecord (testResults.service.ts line ~128)
/** AI-generated formative feedback (async, may arrive after initial save) */
formativeFeedback?: FormativeFeedback;
```

### Edge Cases
- `saveTestResult` fails → feedback gen never triggers (correct: nothing to write to)
- Feedback gen fails → result still accessible, just no feedback (graceful degradation)
- Student views result before feedback arrives → UI shows no panel initially (handled by Task 1opvmj: conditional render)
- Both AI providers fail → deterministic-only feedback still written to RTDB
- Multiple submissions in same session → each gets its own feedback (tied to resultId, not session)
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Integrated formative feedback generation into the auto-marking flow at 2 call sites:

**1. THCSTestLayout.tsx (live session)**
- Captured `resultId` from `saveTestResult()` (was previously discarded)
- Added fire-and-forget `generateFormativeFeedback()` after writing grading block (line ~545)
- Uses dynamic import to avoid loading the service until needed

**2. THCSPracticeView.tsx (homework/self-study)**
- `resultId` was already captured on line 389
- Added fire-and-forget `generateFormativeFeedback()` after writing grading block (line ~467)
- Same dynamic import pattern

**3. autoSubmitDisconnected.ts**
- N/A — does not call `markThcsTest` or `saveTestResult`, so no integration needed

**testResults.service.ts**
- `formativeFeedback?: FormativeFeedback` already on `TestResultRecord` (from task cybx0j)
- `getTestResult()` reads full record via `get()` — automatically includes formativeFeedback when present
- No changes needed

**TypeScript compilation verified** — no new errors introduced.
<!-- SECTION:NOTES:END -->

