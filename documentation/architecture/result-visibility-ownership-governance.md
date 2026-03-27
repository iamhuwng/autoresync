# Result Visibility Ownership Governance

Canonical technical source of truth for PRD-0041 Phase 1.

Companion docs:
- `documentation/tasks/0041-prd-result-visibility-ownership-governance.md`
- `documentation/tasks/tasks-0041-prd-result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`
- `documentation/rules/result-visibility-review-checklist.md`
- `documentation/architecture/result-view-permission-matrix.md`
- `documentation/architecture/result-view-fr-closure-matrix.md`
- `documentation/architecture/ui-design-standards.md`

## Binding Rule

Result visibility is determined by teaching-context ownership and the permitted solo-practice policy, never by original test authorship, raw `result.teacherId`, assignment context promotion, or blank-field fallthrough.

## Phase 1 Execution Boundary

- Current approved implementation slice is Tasks `1.x` through `6.x` only.
- Parent-task order is fixed: `1.x` -> `2.x` -> `3.x` -> `4.x` -> `5.x` -> `6.x`.
- Do not start Tasks `7.x` through `11.x` until `6.6` passes and later-phase work is explicitly re-approved.

## Authority Model

### Outer Access Gate

- `student_teacher_assignments` remains the outer teacher-student access gate only.
- Assignment status may allow a teacher to open the student surface, but it must never by itself prove per-result ownership.
- `useOwnershipCheck`, `useStudentDataAccessCheck`, `validateOwnership`, `validateResultOwnership`, and `AccessControlWrapper` remain outer-gate-only concerns.

### Write-side Canonical Services

- `src/services/resultOwnershipResolver.ts` is the only write-side ownership normalizer.
- `src/services/resultVisibility.service.ts` is the only read-side teacher visibility classifier.
- `src/services/resultVisibilityReporting.service.ts` owns unresolved reporting to `/reports/result_visibility/unresolved/{resultId}`.
- `src/services/resultVisibilityReindex.service.ts` owns stale `test_results_by_teacher/*`, `test_results_by_course/*`, and `test_results_by_class/*` detection, rebuild, and safe-backfill eligibility.
- After these services exist, no page, component, hook, or secondary service may perform local ownership resolution, local legacy enrichment, or page-level teacher filtering.

## Authoritative Source Decision Matrix

| Context | Source lookup | Owner field precedence | Required snapshot source | Teacher include rule | Teacher exclude rule | Notes |
|---|---|---|---|---|---|---|
| `homework` | `homework_assignments/{homeworkId}` via `src/services/homeworkManager.ts` | `createdBy` | homework title at submission time | Include when homework record resolves and `createdBy` matches the teacher | Exclude when homework lookup fails or owner cannot be proven | Homework beats all weaker contexts. |
| `class_session` | `game_sessions/{sessionCode}` via `src/services/sessionManager.js` | `createdByUserId`, then `createdBy` only if it stores a real Firebase Auth UID | session/test title at submission time | Include when session owner resolves and matches the teacher | Exclude when only `session.teacherId` exists, lookup fails, or owner cannot be proven | `session.teacherId` is synthetic tracking data, never ownership authority. |
| `course_material` linked to class | `classes/{classId}` via `src/services/classManager.ts` | `createdBy` | class name or linked material name at submission time | Include when class owner resolves and matches the teacher | Exclude when class record is missing or `createdBy` is unsafe | Applies only when no authoritative homework or session context exists. |
| `course_material` standalone | `courses/{courseId}` via `src/services/courseManager.ts` | `ownerId` | course/material name at submission time | Include when course owner resolves and matches the teacher | Exclude when course record is missing or owner cannot be proven | Applies only when no stronger context exists. |
| `writing_submission` linkage | `writing_submissions/{submissionId}` plus linked homework/session/class/course source via `src/services/writingSubmissionService.ts` | linked-source precedence only | writing prompt/test title plus linked source snapshot | Include only after the linked authoritative source resolves to the teacher | Exclude when the writing submission exists but the linked authoritative source is missing or unresolved | Writing metadata supports linkage. It does not replace the authoritative source. |
| `solo_practice` / `self_study` | no teacher-owner lookup | no teacher owner | submission-time material snapshot | Visible only after the teacher passes the outer assignment gate | Excluded from teacher-owned indexes and analytics | Student-owned, view-only in teacher surfaces. |
| `unresolved` | report only | none | strongest known source clue | Never included in teacher-owned views | Always excluded from teacher-owned views and analytics | Visible to the student if their normal result access still applies. |

## Snapshot Contract

Persist normalized visibility only under `result.visibility`, and in RTDB only under `test_results/{resultId}/visibility/*`.

Required fields:

| Field | Meaning |
|---|---|
| `contextType` | `homework`, `class_session`, `course_material`, `solo_practice`, or `unresolved` |
| `sourceType` | canonical source family such as `homework`, `session`, `class`, `course`, `writing_submission`, or `solo_practice` |
| `sourceId` | authoritative source record id, or `null` for solo/unresolved cases that have no source row |
| `sourceNameSnapshot` | submission-time historical label |
| `visibilityOwnerTeacherId` | teacher UID for teacher-owned rows only |
| `ownerResolutionSource` | exact authority used to resolve ownership |
| `ownershipResolved` | `true` only when ownership is proven safely |
| `unresolvedReason` | explicit reason when ownership is not proven |
| `homeworkId` | homework linkage when applicable |
| `sessionCode` | session linkage when applicable |
| `courseId` | course linkage when applicable |
| `classId` | class linkage when applicable |
| `assignmentId` | secondary metadata only; never a top-level ownership tier |

Additional deleted-source display fields may be added only in `src/types/results.types.ts` before code uses them anywhere else.

## Write Rules

- Producers pass raw source/context identifiers to the service layer. They do not construct visibility snapshots locally.
- `src/services/testResults.service.ts` and `src/services/writingSubmissionService.ts` must call the write-side resolver before any canonical result row, unresolved report row, or teacher index row is written.
- `test_results_by_teacher/{teacherId}/{resultId}` may be created only from `result.visibility.visibilityOwnerTeacherId` when `ownershipResolved === true`.
- Never create teacher index rows for solo-practice or unresolved results.
- Live quiz canonical writes must use the same canonical store, student indexes, and ownership normalization path as other result writers.

## Read Rules

- `getStudentResults(studentId)` remains student-complete.
- Shared read-time enrichment for legacy rows runs in the service layer only.
- Teacher-facing consumers call the shared visibility service after the outer assignment gate is satisfied.
- Pages and components must not filter by raw `result.teacherId`, blank-`teacherId` fallthrough, original test authorship, or assignment-only access.

## Historical Display and Deleted Source Rules

- Submission-time snapshot metadata is the primary historical label.
- Current source names are supplemental only.
- Deleted/archived source rows remain teacher-visible only when submission-time ownership was proven.
- Deleted source plus unresolved ownership stays excluded from teacher history and teacher result detail.

## Solo Practice Rules

- Solo practice is student-owned.
- Any currently assigned teacher may view a solo-practice result after the outer access gate.
- Solo-practice rows must display a `Solo Practice` tag in teacher history.
- Solo-practice detail view is view-only.
- Solo-practice rows are excluded from `test_results_by_teacher/*` and all teacher-owned analytics.

## Reassignment and Access-Loss Rules

- If assignment access is revoked mid-view, teacher history and detail surfaces must clear sensitive result data immediately and show an access-lost state inside the teacher shell.
- If the same teacher is later reassigned, previously eligible teacher-owned and solo-practice rows become visible again through the normal shared visibility path.

## Unresolved Reporting Contract

Unresolved rows are reported to:

- RTDB path: `/reports/result_visibility/unresolved/{resultId}`

Minimum report fields:

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

The admin surface for this data is `src/pages/AdminReportsPage.tsx`. Do not create a second admin destination in Phase 1.

## Reindex Rules

- Stale `test_results_by_teacher/*` rows built from raw `teacherId` semantics are not authoritative.
- Stale `test_results_by_course/*` and `test_results_by_class/*` rows are also not authoritative once normalized visibility is available.
- Reindexing must rebuild teacher-owned, class-owned, and course-owned rows from normalized visibility data only.
- Reindexing must skip solo-practice and unresolved backfill, while still deleting stale nested index rows that no longer match the canonical result location.
- Reindexing must log rebuilt, deleted, skipped, and unresolved counts, including class/course breakdowns when those indexes are repaired.

## Teacher Full-Page Shell Requirement

Teacher-facing history and result detail pages opened from Teacher view must follow `documentation/architecture/ui-design-standards.md`:

- `AppShell` + `TeacherHeader`
- result body inside the teacher page container
- access-lost and error states rendered inside the teacher shell
- no detached full-screen gradient wrapper

## Stop Rule

If any required field, lookup path, helper API, migration behavior, or test placement is undefined, stop and resolve it in these governance docs and `src/types/results.types.ts` before writing runtime code.
