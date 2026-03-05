---
id: 3az3ao
title: Service — Create updateThcsWritingGrade() for permanent records
status: done
priority: high
labels:
  - writing-grading
  - service
createdAt: '2026-03-01T16:56:33.905Z'
updatedAt: '2026-03-01T17:34:07.867Z'
timeSpent: 194
assignee: '@me'
spec: specs/spec-teacher-name-in-grading-results
fulfills:
  - AC-10
  - AC-11
---
# Service — Create updateThcsWritingGrade() for permanent records

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create `updateThcsWritingGrade()` in testResults.service.ts. This function: (1) finds the permanent TestResultRecord for student+session, (2) updates the specific writing question's score/isCorrect/gradedBy fields, (3) recalculates totalScore and percentage across ALL questions, (4) counts remaining ungraded writing Qs and updates markingStatus accordingly (0 left → fully-graded).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New exported function `updateThcsWritingGrade()` exists in testResults.service.ts
- [x] #2 Function finds permanent record by sessionCode+studentId via test_results_by_session index
- [x] #3 Function updates specific question's score, isCorrect, feedback, gradedByName, gradedByUid, gradedAt
- [x] #4 Function recalculates totalScore, percentage, correct/incorrect/partialCredit counts across ALL questions
- [x] #5 Function updates markingStatus: 'pending-review' if ungraded writing remains, 'reviewed' if all writing graded
- [x] #6 Function updates the updatedAt timestamp
- [x] #7 No side effects outside the permanent record (RTDB write handled separately by caller)
- [x] #8 Build succeeds with no new TypeScript errors
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Implementation Plan

### Context
Need a function that updates a single writing question's grade in the permanent `test_results/{resultId}` record and recalculates aggregate scores.

### Data flow
```
Caller passes: sessionCode, studentId, questionNumber, grade object
    │
    ├─ 1. Look up resultId from `test_results_by_session/{sessionCode}` index
    │     → filter by studentId to find the right result
    │
    ├─ 2. Read full record from `test_results/{resultId}`
    │
    ├─ 3. Find the question in questionResults[] by questionNumber
    │     → Update: score, isCorrect (score >= maxScore), teacherFeedback, 
    │               gradedByName, gradedByUid, gradedAt
    │
    ├─ 4. Recalculate aggregates across ALL questions:
    │     → totalScore = sum of all question scores
    │     → percentage = (totalScore / maxScore) * 100
    │     → correct = count where isCorrect && score > 0
    │     → incorrect = count where !isCorrect && score === 0
    │     → partialCredit = count where score > 0 && score < maxScore
    │
    ├─ 5. Check markingStatus:
    │     → count writing questions still ungraded (no gradedAt && type has 'writing')
    │     → if 0 ungraded writing left → markingStatus = 'reviewed'
    │     → else → keep 'pending-review'
    │
    └─ 6. Write updated record back via `update()`
```

### Function signature
```typescript
export async function updateThcsWritingGrade(
  sessionCode: string,
  studentId: string,
  questionNumber: number,
  grade: {
    score: number;
    maxScore: number;
    feedback: string;
    teacherName: string;
    teacherUid: string;
  }
): Promise<void>
```

### Location
Append to end of `testResults.service.ts` (after `saveGuestTestResult`, line ~945).

### Imports needed
None new — `ref`, `get`, `update` already imported from firebase/database.

### Risk
Medium — modifying permanent records. Function must handle:
- Result not found → throw descriptive error
- Question not found in array → throw error
- Writing question detection → check questionType includes 'sentence-rewrite'
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented 2026-03-02:
- Added updateThcsWritingGrade() at end of testResults.service.ts (~line 948-1098)
- Finds record via test_results_by_session index, filters by studentId
- Updates question score/isCorrect/feedback/gradedBy fields explicitly (no spread to avoid TS issues)
- Recalculates totalScore, percentage, correct/incorrect/partialCredit, bandScore
- Transitions markingStatus: 'reviewed' when all writing Qs graded, else 'pending-review'
- Writing types detected: 'sentence-rewrite', 'sentence-rewrite-keyword'
- Build verified: no new TS errors in this file

2026-03-02: HOTFIX — Fixed critical bug: WRITING_TYPES was ['sentence-rewrite', 'sentence-rewrite-keyword'] but permanent record stores questionType as 'writing' (mapped via mapQuestionType). Changed to ['writing']. Also added modelAnswers and originalSentence persistence to permanent record via thcsResultToTestMarkingResult mapping.
<!-- SECTION:NOTES:END -->

