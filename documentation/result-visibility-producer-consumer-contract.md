# Result Visibility Producer Consumer Contract

## Teacher index contract amendment — 2026-10-01

The one supported teacher discovery index is `teacher_result_keys/{teacherId}/{resultId}: true`, replacing rich `test_results_by_teacher`. Producers create/remove keys only for a proven canonical teacher relationship; grading copies no scores/feedback. Consumers enumerate keys and fetch authorized canonical rows through shared services. Keys grant no access. Writing recovery/admin reindex use the replacement; no dual read/write, fallback or mirror. Earlier teacher-path references below identify the retired implementation and do not authorize supported callers to use it.

Qualify replacement Rules/ancestors and coherent App/Worker callers before parent reads open. Preserve academic results; populate only source-proven keys and classify ambiguous legacy rows without invented ownership. Prove old cached/in-flight index writers address only the retired path, whose ordinary teacher reads stay denied. Supported code does not read/mirror it. Stale clients reload; preserve accepted partial saves and exact-source recovery without blind duplication. This index transition alone adds no global result-save shutdown or per-write generation gate. Selected-teacher Writing and qualified Firestore-homework follow the plan's narrow exceptions; generic solo/unresolved rows remain excluded.

Companion docs:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/architecture/changelog/homework-result-visibility-repair.md`
- `documentation/rules/result-visibility-review-checklist.md`
- `documentation/architecture/result-view/visibility-policy.md`

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

## Student-private Homework qualification — 2026-10-02

The supported THCS homework writer retains the real assignment, submission and material identifiers while writing an unresolved student-private canonical result and required own index. It must not assert a resolved teacher relationship from Firestore context or write teacher/class/course/session disclosure projections. The authentic Firestore submission commits only after this save succeeds. Exact result/operation identity survives partial or uncertain replies; repair missing projections only and preserve newer canonical fields. Current full-payload emulator and real same-attempt proof live in the notification family table's Homework evidence.

Teacher-visible Firestore homework submissions and canonical-result visibility remain separate boundaries. Reset notices certify deletion of the named Firestore attempt, even when private canonical cleanup is denied; product cleanup returns real counts and the shared UI warns on partial removal. No all-results or retake promise follows from a reset notice. Teacher capture/detail/grading and teacher sessions are outside this notification upgrade's activation criteria.
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

## Canonical integration status — 2026-10-03

The notification amendments above are integrated documentation from the completed owner release. Canonical integration and its local commit remain pending; local activation/verification limits are recorded in the [canonical integration checkpoint](tasks/notification-system-upgrade-plan.md#canonical-integration-checkpoint--2026-10-03). No current remote-state or new release claim is made here.
