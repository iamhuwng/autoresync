---
title: Homework Result Visibility Repair
description: Repair contract for Teacher Homework Detail Access Revoked failures caused by unresolved or misclassified result visibility.
createdAt: '2026-05-11T17:43:00.026Z'
updatedAt: '2026-05-11T17:43:00.026Z'
tags:
  - architecture
  - results
  - homework
  - visibility
  - bugfix
---

# Homework Result Visibility Repair

## Symptom

Teacher Homework Detail can list a student submission, but opening the result detail shows:

> Access Revoked
> You no longer have access to this result. This may happen if permissions were changed.

Console evidence usually includes `permission_denied at /test_results/{resultId}` from `ResultDetailModal`.

## Root Cause

The result row was not teacher-readable because canonical `result.visibility` was unresolved or misclassified. The critical failure class was treating generic homework `context.source.submissionId` as a Writing submission id. Normal Reading/Listening homework attempts may carry that field as an attempt/submission identifier, but it is not proof that `writing_submissions/{submissionId}` exists.

Bad persisted shape:

- `visibility.sourceType: "writing_submission"`
- `ownershipResolved: false`
- `unresolvedReason: "writing_submission_not_found"`
- missing `visibilityOwnerTeacherId`
- no usable `test_results_by_teacher/{teacherId}/{resultId}` path

## Canonical Rule

Normal homework result ownership resolves through:

1. `context.assignment.homeworkId`
2. `homework_assignments/{homeworkId}`
3. `homework.createdBy`
4. `result.visibility.visibilityOwnerTeacherId`
5. `test_results_by_teacher/{teacherId}/{resultId}`

Writing ownership may load `writing_submissions/{submissionId}` only when the id came from an explicit Writing field such as `context.writingData.submissionId`, `writingSubmissionId`, or another typed Writing id.

## Repair Contract

- New result saves must not infer Writing ownership from generic `context.source.submissionId`.
- `ensureResultVisibility()` must treat unresolved rows as repairable and re-run canonical resolution.
- `rebuildTeacherResultIndexes()` must repair historical unresolved/misclassified rows and backfill the teacher index only after ownership resolves.
- `ResultDetailModal` must not add a modal-local fallback that bypasses RTDB read permission. A denied read is repaired upstream in visibility, not downstream in UI.

## Root Docs

- `documentation/architecture/homework-result-visibility-repair.md`
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`
- `documentation/architecture/result-view-permission-matrix.md`
- `documentation/rules/result-visibility-review-checklist.md`

## Verification

Use the focused repair pack:

```bash
cmd /c npx vitest run src/services/resultOwnershipResolver.test.ts src/services/testResults.service.test.ts --reporter=basic
npm run check:utf8 -- src/services/resultOwnershipResolver.ts src/services/resultOwnershipResolver.test.ts src/services/testResults.service.ts src/services/testResults.service.test.ts
```
