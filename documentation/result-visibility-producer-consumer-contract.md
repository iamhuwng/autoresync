# Result Visibility Producer Consumer Contract

Companion docs:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/architecture/homework-result-visibility-repair.md`
- `documentation/rules/result-visibility-review-checklist.md`
- `documentation/architecture/result-view-permission-matrix.md`

## Producer Contract

### Producers in Scope

- `src/services/testResults.service.ts`
- `src/services/writingSubmissionService.ts`
- any writer calling the canonical result service in Phase 1

### Producer Requirements

- Producers pass raw context identifiers and submission-time labels only.
- Producers do not resolve ownership in pages, hooks, or components.
- Producers do not write teacher-owned indexes from raw `teacherId`.
- Producers persist normalized visibility only under `result.visibility`.
- Producers write unresolved reports only through `src/services/resultVisibilityReporting.service.ts`.

### Required Snapshot Fields

- `contextType`
- `sourceType`
- `sourceId`
- `sourceNameSnapshot`
- `visibilityOwnerTeacherId`
- `ownerResolutionSource`
- `ownershipResolved`
- `unresolvedReason`
- `homeworkId`
- `sessionCode`
- `courseId`
- `classId`
- `assignmentId`

## Lookup Contract

| Context | Required lookup | Allowed fallback | Forbidden shortcut |
|---|---|---|---|
| Homework | `homework_assignments/{homeworkId}` | none beyond the authoritative record | `result.teacherId`, test author |
| Class session | `game_sessions/{sessionCode}` | `createdBy` only when it stores a real auth UID | `session.teacherId` |
| Class-linked course material | `classes/{classId}` | none beyond the authoritative record | assignment-only access |
| Standalone course material | `courses/{courseId}` | none beyond the authoritative record | original material author |
| Writing | `writing_submissions/{submissionId}` plus linked authoritative source | linked source fallback only | `grading.teacherId`, `selectedTeacherId`, `assigningTeacherId` |
| Solo practice | no teacher-owner lookup | assignment gate only for read-time visibility | any teacher-owner write |

### Identifier Classification Rule

`context.source.submissionId` is not a Writing identity by default. It can identify a generic homework/listening/reading attempt.

Allowed Writing identifiers:
- resolver input `writingSubmissionId`
- `result.writingData.submissionId`

Forbidden classification:
- deriving `writingSubmissionId` from generic `context.source.submissionId`

Homework writers should pass or persist `homeworkId` through `context.assignment.homeworkId` or explicit resolver input, then let the ownership resolver read `homework_assignments/{homeworkId}.createdBy`.

## Consumer Contract

- `getStudentResults(studentId)` remains student-complete.
- Teacher-facing consumers obtain visibility verdicts only from `src/services/resultVisibility.service.ts`.
- Teacher-facing pages must not implement local `teacherId` filters or ownership heuristics.
- `ResultFilters` options must be derived from the classified result set returned by the teacher-facing service path.

## Unresolved Report Contract

Path:

- `/reports/result_visibility/unresolved/{resultId}`

Minimum fields:

- `resultId`
- `studentId`
- `contextType`
- `unresolvedReason`
- `sourceLookupAttempted`
- `strongestKnownSourceClue`
- `ownershipResolved`
- `reportVersion`
- `createdAt`
- `updatedAt`

## Banned Shortcuts

- raw `result.teacherId` as ownership authority
- `session.teacherId`
- original test author as visibility owner
- blank-`teacherId` include fallthrough
- assignment context promotion to top-level ownership
- local page-level visibility filtering once the shared services exist
- solo-practice teacher index writes
- generic homework `context.source.submissionId` treated as `writing_submission`
