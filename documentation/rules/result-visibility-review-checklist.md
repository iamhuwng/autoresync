# Result Visibility Review Checklist

Reviewers block merge when any item below fails.

Companion docs:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`
- `documentation/architecture/result-view-permission-matrix.md`

## Absolute Rule

Result visibility is determined by teaching-context ownership and permitted solo-practice policy, never by original test authorship or raw `teacherId`.

## Reject Conditions

- A page, component, hook, or secondary service filters teacher visibility locally.
- Once the shared resolver and shared visibility service exist, a page, component, hook, or secondary service still performs ownership resolution or legacy read-time enrichment locally.
- A writer or consumer treats raw `result.teacherId` as authoritative.
- A writer or consumer uses `session.teacherId` for ownership.
- A writer or consumer promotes assignment context into result ownership.
- A writer or consumer uses original test authorship, selected reviewer, `selectedTeacherId`, or `assigningTeacherId` as ownership authority.
- A result writer persists visibility fields outside `result.visibility`.
- A teacher-facing consumer includes unresolved rows in history, detail, analytics, or teacher-owned indexes.
- A change introduces solo-practice rows into `test_results_by_teacher/*`.
- A change omits unresolved reporting to `/reports/result_visibility/unresolved/{resultId}`.
- A change touches teacher indexes without a stale-index reindex or cleanup path.
- A change touches reconciliation or index-repair behavior without matching verification coverage for unresolved reporting, deleted-source visibility, and safe backfill.
- A teacher-facing full-page surface opened from Teacher view is not rendered under `AppShell` + `TeacherHeader`.

## Required Checks

- The shared ownership resolver is the only write-side authority.
- The shared visibility service is the only read-side visibility classifier.
- `getStudentResults(studentId)` remains student-complete.
- Teacher-facing filters are derived from classified result data.
- Deleted-source rendering uses submission-time snapshot metadata first.
- Access-loss handling clears sensitive data immediately.

## Required Artifacts In The Same Change Set

- Later-phase policy-surface changes must update the governance doc, permission matrix, producer-consumer contract, and this reviewer checklist together.
- updated `documentation/architecture/result-visibility-ownership-governance.md`
- updated `documentation/architecture/result-view-permission-matrix.md`
- updated `documentation/result-visibility-producer-consumer-contract.md`
- updated `documentation/rules/result-visibility-review-checklist.md`
- updated `documentation/architecture/result-view-fr-closure-matrix.md` when closure mapping changes

## Grep Audit Prompts

- grep for `teacherId` filters in pages/components/services
- grep for `session.teacherId`
- grep for writes to `test_results_by_teacher`
- grep for direct `test_results/{resultId}` writes outside canonical services
