# Result View Permission Matrix

Canonical unified result-view permission matrix for the PRD-0040 shell architecture and the PRD-0041 Phase 1 visibility policy.

Scope note:
- PRD-0040 remains the macro owner of saved-result shell, route, and host-surface architecture.
- PRD-0041 records the current teacher-visibility, unresolved-reporting, and outer-gate policy within that architecture.
- Changes that alter either layer must update this matrix together with the matching PRD and closure matrix.

Companion docs:
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/result-visibility-producer-consumer-contract.md`
- `documentation/rules/result-visibility-review-checklist.md`
- `documentation/architecture/result-view-fr-closure-matrix.md`

## PRD-0049 Reconciliation Note

PRD-0049 brings the already-verified live-parity local `main` result and writing-surface history into `origin/main`. The reconciliation does not change the permission model in this matrix: teacher access still starts with the outer assignment gate, writing linked results still depend on linked-source ownership, and unresolved rows remain excluded from teacher-owned surfaces.

## PRD-0043 External Writing Import Note

PRD-0043 imported homework Writing submissions remain governed by the existing `writing_submission` linked-result row below. The authoritative owner remains the linked homework assignment (`homework_assignments/{homeworkId}.createdBy`); `context.externalImport`, `administrativeImport`, `importedByTeacherId`, and grading/import teacher metadata are audit signals, not ownership signals.

## Global Rules

- Teacher access always starts with the outer `student_teacher_assignments` gate.
- That outer gate never proves per-result ownership.
- Original test authorship, raw `result.teacherId`, blank-`teacherId` fallthrough, and assignment-context promotion are banned as visibility signals.
- `session.teacherId` is never authoritative.
- Later-phase policy-surface changes must update this matrix in the same change set as `result-visibility-ownership-governance.md`, `result-visibility-producer-consumer-contract.md`, and `result-visibility-review-checklist.md`.

## Canonical Matrix

| Context | Outer gate required | Authoritative source | Owner precedence | Teacher include rule | Teacher exclude rule | Teacher index rule | Analytics rule | Archived/deleted behavior |
|---|---|---|---|---|---|---|---|---|
| `homework` | Yes | `homework_assignments/{homeworkId}` | `createdBy` | Include when homework owner resolves and matches the teacher | Exclude when lookup fails or owner cannot be proven | Teacher-owned rows may be indexed | Included in teacher-owned analytics | Visible with snapshot label if ownership was proven at submission time |
| `class_session` | Yes | `game_sessions/{sessionCode}` | `createdByUserId`, then safe `createdBy` fallback only | Include when session owner resolves and matches the teacher | Exclude when only `session.teacherId` exists or owner cannot be proven | Teacher-owned rows may be indexed | Included in teacher-owned analytics | Visible with snapshot label if ownership was proven at submission time |
| `course_material` linked to class | Yes | `classes/{classId}` | `createdBy` | Include when class owner resolves and matches the teacher | Exclude when class owner is missing or unsafe | Teacher-owned rows may be indexed | Included in teacher-owned analytics | Visible with snapshot label if ownership was proven at submission time |
| `course_material` standalone | Yes | `courses/{courseId}` | `ownerId` | Include when course owner resolves and matches the teacher | Exclude when owner cannot be proven | Teacher-owned rows may be indexed | Included in teacher-owned analytics | Visible with snapshot label if ownership was proven at submission time |
| `writing_submission` linked result | Yes | `writing_submissions/{submissionId}` plus linked homework/session/class/course source | linked-source precedence only | Include only after linked-source ownership resolves to the teacher, including external/admin imports whose homework owner is proven | Exclude when only grading/selected/importing teacher metadata exists | Follows the linked-source verdict only | Follows the linked-source verdict only | Follows the linked-source snapshot only when ownership was proven |
| `solo_practice` | Yes | no teacher-owner source | no teacher owner | Visible to any currently assigned teacher | Exclude only when outer assignment gate fails | Never indexed in `test_results_by_teacher/*` | Always excluded from teacher-owned analytics | Show student-owned snapshot metadata and `Solo Practice` label |
| `unresolved` | Yes for teacher surface, student rules remain separate | none proven | none | Never included in teacher-owned views | Always excluded from teacher history, detail, and analytics | Never indexed in `test_results_by_teacher/*` | Always excluded | Hidden from teacher surfaces; reported to admin diagnostics only |

## Consumer Rules

| Consumer | Allowed classifier | Forbidden classifier | Required UI behavior |
|---|---|---|---|
| `TeacherStudentHistoryPage` | `src/services/resultVisibility.service.ts` | page-local `teacherId` filter | teacher shell, `Solo Practice` tag only, unresolved rows absent |
| `ResultDetailPage` teacher/admin branch | `src/services/resultVisibility.service.ts` | student-only ownership hook as final authority | teacher shell, full source metadata, deleted-source status |
| `LegacyResultDetailView` | shared verdict + outer assignment gate | local ownership heuristics | solo-practice view-only, no teacher-owned actions |
| `AdminReportsPage` unresolved diagnostics | unresolved report records | raw result scans with ad hoc classification | read-only diagnostics under admin reporting |

## Explicit Bans

- `result.teacherId === auth.uid` page filters
- include-on-blank rows because `teacherId` is missing
- `session.teacherId` fallback
- original public-library author as owner
- `selectedTeacherId` or `assigningTeacherId` as owner
