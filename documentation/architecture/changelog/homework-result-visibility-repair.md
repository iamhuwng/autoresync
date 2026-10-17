# Homework Result Visibility Repair

Changelog ID: `CL-20260512-HOMEWORK-RESULT-VISIBILITY-REPAIR`
Moved from: `documentation/architecture/homework-result-visibility-repair.md`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

Canonical incident and repair note for teacher homework detail result access failures.

Companion docs:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`
- `documentation/architecture/changelog/result-view-permission-matrix.md`
- `documentation/architecture/result-view/visibility-policy.md`
- `documentation/architecture/changelog/result-view-map.md`
- `documentation/architecture/homework-solo-practice-architecture.md`

## Symptom

Teacher opens a student submission from `TeacherHomeworkDetailPage` and the result modal shows:

```text
Access Revoked
You no longer have access to this result. This may happen if permissions were changed.
```

Console evidence for this class:

```text
permission_denied at /test_results/{resultId}
```

This is not a modal-rendering failure. `ResultDetailModal` is a thin reader of `test_results/{resultId}`. The denial is produced by RTDB rules when the canonical result visibility snapshot does not prove teacher ownership.

## Root Cause Class

The confirmed homework-detail failure was caused by a homework result whose generic homework submission id was treated as an IELTS Writing submission id.

Bad persisted shape:

```json
{
  "context": {
    "type": "homework",
    "assignment": {
      "homeworkId": "..."
    },
    "source": {
      "submissionId": "homeworkId_studentId_timestamp"
    }
  },
  "visibility": {
    "contextType": "homework",
    "sourceType": "writing_submission",
    "ownershipResolved": false,
    "unresolvedReason": "writing_submission_not_found",
    "sourceDeleted": true
  }
}
```

That shape makes teacher RTDB access fail because the teacher-read rule requires `visibility.ownershipResolved === true` and `visibility.visibilityOwnerTeacherId === auth.uid` for teacher-owned homework rows.

## Correct Ownership Path

Homework result ownership must resolve through:

1. `context.assignment.homeworkId` or explicit `homeworkId`
2. `homework_assignments/{homeworkId}`
3. `homework.createdBy`
4. `result.visibility.visibilityOwnerTeacherId`
5. `test_results_by_teacher/{visibilityOwnerTeacherId}/{resultId}`

Writing submission ownership must resolve through `writing_submissions/{submissionId}` only when the result carries an explicit Writing submission identifier such as `writingData.submissionId` or resolver input `writingSubmissionId`.

Generic `context.source.submissionId` is not enough to classify a row as `writing_submission`. Homework, Reading, Listening, and other non-Writing attempts can use this field for their own attempt/submission identifier.

## Repair Contract

New saves:

- `src/services/resultOwnershipResolver.ts` must not infer `writingSubmissionId` from generic `context.source.submissionId`.
- `src/services/testResults.service.ts` must persist `visibility.sourceType: "homework"` for normal homework results.
- Teacher index rows may be created only from resolved visibility ownership.

Historical/bad rows:

- `ensureResultVisibility()` must treat `visibility` with `ownershipResolved !== true` as repairable, not final.
- `rebuildTeacherResultIndexes()` is the canonical repair surface. It should re-resolve unresolved canonical rows, update `test_results/{resultId}/visibility`, clear unresolved reports when ownership becomes resolved, and rebuild teacher/class/course indexes from normalized visibility.
- Rows that remain unresolved after re-resolution must stay excluded from teacher-owned history, detail, indexes, and analytics.

## Obsolete Interpretations

These interpretations are obsolete and must not guide future work:

- "Access Revoked" in homework detail means `ResultDetailModal` needs a teacher fallback read.
- `context.source.submissionId` means `writing_submission`.
- Existing `result.visibility` is always final, even when `ownershipResolved === false`.
- A one-off live row patch is enough for this failure class.

Correct rule: fix the canonical resolver and repair path, then let the existing result shells and RTDB rules consume the corrected visibility snapshot.

## Verification

Required focused checks for this failure class:

```powershell
cmd /c npx vitest run src/services/resultOwnershipResolver.test.ts src/services/testResults.service.test.ts --reporter=basic
npm run check:utf8 -- src/services/resultOwnershipResolver.ts src/services/resultOwnershipResolver.test.ts src/services/testResults.service.ts src/services/testResults.service.test.ts
git diff --check -- src/services/resultOwnershipResolver.ts src/services/resultOwnershipResolver.test.ts src/services/testResults.service.ts src/services/testResults.service.test.ts documentation/architecture/changelog/homework-result-visibility-repair.md
```

Operational closeout for existing live rows requires deploying the resolver/reindex fix and then running the teacher result index rebuild/repair path. Code changes alone prevent new bad rows, but do not mutate already-persisted rows until the repair runs.
