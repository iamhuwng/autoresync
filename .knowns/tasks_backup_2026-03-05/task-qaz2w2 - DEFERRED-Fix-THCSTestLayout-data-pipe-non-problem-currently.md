---
id: qaz2w2
title: DEFERRED — Fix THCSTestLayout data pipe (non-problem currently)
status: blocked
priority: low
labels:
  - writing-grading
  - bugfix
createdAt: '2026-03-01T16:57:01.084Z'
updatedAt: '2026-03-01T17:19:23.612Z'
timeSpent: 0
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-15
---
# DEFERRED — Fix THCSTestLayout data pipe (non-problem currently)

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fix THCSTestLayout.tsx to pass `writingResult` prop to THCSQuestionRenderer when in review mode (isSubmitted). Currently the writingResult is never passed, so students cannot see grading info during in-session review. Also update THCSWritingRenderer.tsx to display "Graded by {teacherName}" when gradingTier === 'teacher-graded'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Store full QuestionResult map in THCSTestLayout state (not just boolean)
- [ ] #2 Pass writingResult prop from stored map to THCSQuestionRenderer
- [ ] #3 THCSWritingRenderer displays 'Graded by {gradedByName}' when present
- [ ] #4 No visual regression for MCQ/fill-in questions
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Current State
THCSTestLayout.tsx stores `questionResults` as `Record<string, boolean>` (just isCorrect). The full `QuestionResult` with `writingResult` is computed but thrown away. THCSQuestionRenderer already accepts `writingResult?: WritingGradingResult` but it's never passed.

### Changes

#### 1. Store full QuestionResult map in THCSTestLayout
```typescript
// Change from:
const [questionResults, setQuestionResults] = useState<Record<string, boolean>>({});

// To: add a parallel map
const [fullQuestionResults, setFullQuestionResults] = useState<Record<string, QuestionResult>>({});
```
In the grading callback (line ~412-417), also store the full results:
```typescript
const fullResults: Record<string, QuestionResult> = {};
for (const [qNum, qr] of Object.entries(gradingResult.questionResults)) {
    fullResults[qNum] = qr;
}
setFullQuestionResults(fullResults);
```

#### 2. Pass writingResult to THCSQuestionRenderer
At both render sites (lines 897-905 and 931-939):
```tsx
<THCSQuestionRenderer
    question={q}
    // ... existing props
    writingResult={fullQuestionResults[q.questionNumber.toString()]?.writingResult}
/>
```

#### 3. Update THCSWritingRenderer
Add "Graded by {gradedByName}" display when `writingResult.gradedByName` exists and `gradingTier === 'teacher-graded'`.

### Files
- `src/components/thcs-student/THCSTestLayout.tsx` — store full results + pass prop
- `src/components/thcs-student/THCSWritingRenderer.tsx` — show "Graded by" badge

### Risk: Low
Additive changes. No existing behavior is modified — we just pass an additional prop that was already defined but never used.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-03-02: DEPRIORITIZED — Independent assessment found this solves a non-problem. Students never see THCSTestLayout review mode because they navigate to waiting room immediately after submission. Real student result display happens in ResultDetailPage (task h1nooy) which reads from permanent records. This task only matters if we later add a 'review your test' feature that navigates back to THCSTestLayout.
<!-- SECTION:NOTES:END -->

