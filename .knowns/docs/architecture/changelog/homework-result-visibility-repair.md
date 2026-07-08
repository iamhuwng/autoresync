---
title: Homework Result Visibility Repair
description: Historical repair note for Teacher Homework Detail Access Revoked failures caused by unresolved or misclassified result visibility.
createdAt: '2026-05-11T17:43:00.026Z'
updatedAt: '2026-07-09T00:00:00.000Z'
tags:
  - changelog
  - results
  - homework
  - visibility
  - bugfix
---

# Homework Result Visibility Repair

Repo source: `documentation/architecture/changelog/homework-result-visibility-repair.md`.

This is a repair/history note, not a bare architecture contract.

Current authority:

- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/architecture/result-view/visibility-policy.md`
- `documentation/result-visibility-producer-consumer-contract.md`
- `documentation/rules/result-visibility-review-checklist.md`

Repair invariant:

- normal homework result ownership resolves through `context.assignment.homeworkId`
  -> `homework_assignments/{homeworkId}.createdBy`
  -> `result.visibility.visibilityOwnerTeacherId`
  -> `test_results_by_teacher/{teacherId}/{resultId}`
- generic `context.source.submissionId` is not Writing submission proof
- `ResultDetailModal` must not bypass denied RTDB reads with modal-local
  fallback ownership
