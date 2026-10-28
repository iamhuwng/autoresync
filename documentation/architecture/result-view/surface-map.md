# Result View Surface Map

## 2026-10-28 Listening acceptance permissions

The existing saved-result shells and mapped hosts remain unchanged. The shared
recording note reads only `tests/{testId}/audioReplacedAt`, permitted for private
Listening homework through its existing access grant. Generated feedback keeps
its existing `test_results/{resultId}/formativeFeedback` and
`feedbackGenerationMeta` paths and shared service. No new route or action.

## 2026-10-28 Listening completion candidate

PR #183 keeps the three saved-result shells and their existing Academic Record,
dashboard, homework and teacher-history entry owners. `SharedSavedResultCore`
adds a small recording-replacement note; it subscribes only to
`tests/{testId}/audioReplacedAt` through the shared Listening notice. Result
ownership and release-state decisions stay in the shells and Firebase rules.
New Listening result audio uses `/listening-delivery/result-review`, which
checks the caller's canonical `test_results/{resultId}` read permission before
issuing audio. The original result text, answers and scores remain intact.
Session/post-test hosts keep their session lifecycle; trusted submission writes
the canonical result before completion and reload reads that saved result.
No route, fourth shell, Writing surface or guest-claim storage is added.

This file answers one question: which surface owns which part of the result-view runtime.

## PRD0062 #104 Observability Note

PRD0062 #104 registers Book runtime launch, denial, and return telemetry in
`src/config/featureRegistry.ts`. These actions belong to the specialized Book
runtime and do not add or alter a result-view route, host, shell, data path, or
ownership boundary. The canonical result-view surface map below is unchanged.

## Shared Body

- `SharedSavedResultCore` is the canonical saved-result content body.
- It renders score summary, tabs, review content, formative feedback, and teacher feedback sections when the shell enables them.
- Its `ReadingV2ReviewContentAdapter` keeps a multi-slot prompt as one review interaction and displays its full question-number range; the saved `questionResults` rows retain one scored answer slot per number.

## Canonical Saved-Result Shells

| Surface | Audience | Role | Entry Point | Primary Data | Notes |
| --- | --- | --- | --- | --- | --- |
| `ResultSlidePanel` | student | canonical saved-result student shell | slide-out result panel | `test_results/{resultId}` plus live session release state | Owns student chrome, attempt context, and release-state gating for session-scoped results. |
| `ResultDetailModal` | teacher | canonical homework result shell | teacher homework detail flow | `test_results/{resultId}` | Teacher modal shell around the shared body. |
| `LegacyResultDetailView` | teacher/admin | canonical full-page teacher shell | `ResultDetailPage` | `test_results/{resultId}` | Full-page teacher/admin shell that now participates in the shared feedback pipeline. |

## Routing and Entry Surfaces

| Surface | Audience | Role | Notes |
| --- | --- | --- | --- |
| `TeacherStudentHistoryPage` | teacher | teacher history entry | Consumes shared visibility classification and opens result detail routes. |
| `ResultDetailPage` | mixed | route gate | Resolves auth and role, then mounts the correct saved-result shell. |
| `TeacherHomeworkDetailPage` | teacher | homework entry | Opens the teacher modal shell for saved-result detail. |

## Adjacent and Legacy Surfaces

| Surface | Audience | Status | Notes |
| --- | --- | --- | --- |
| `StudentTestResultsPage` | student | legacy runtime | Immediate post-submit page. Still separate from the shared saved-result shell set. It now prefers stored formative feedback when available, but the shell is still not unified. |
| Writing or speaking result views mounted from submission flows | student/teacher | adjacent domain | They can materialize into the same saved-result model, but their workflow contracts remain separate. |

## Canonical Data Paths

- Saved result rows live under `test_results/{resultId}`.
- Canonical teacher feedback for saved-result rendering lives on the saved result row:
  - `overallFeedback`
  - `feedbackUpdatedAt`
  - `feedbackUpdatedBy`
  - `questionResults[].teacherFeedback`
- Legacy feedback nodes still exist for compatibility:
  - `test_results/{resultId}/overallFeedback`
  - `test_results/{resultId}/questionFeedback/{questionKey}`
- Formative feedback lives at `test_results/{resultId}/formativeFeedback`.

## Ownership Boundaries

- Shells decide whether sections are visible and whether teacher actions are allowed.
- Shared services own storage shape, ownership resolution, and feedback generation.
- History pages and analytics consume the shared visibility verdict; they do not redefine it.


## 2026-10-18 Reading backend source reconciliation

Saved-result hosts and shared shells are unchanged. Reading trusted submit now preserves the active Worker contract: saved homework owner plus boolean teacher_result_keys membership, consumed by testResults.service.getTeacherResults. Teacher homework detail and student history remain the existing entry owners.

See [the dated remaining-work record](../../release-audits/2026-10-18-remaining-nonbook-work.md).

## 2026-10-20 Reading V2 multiple-slot review

Reading V2 saved-result review displays one prompt spanning multiple answer slots as one interaction with a number range (for example, `25-26`). Scoring remains represented by one `questionResults` row per answer slot inside the existing saved-result body. The shared shells, entry owners, and stored-result ownership boundaries are unchanged.
