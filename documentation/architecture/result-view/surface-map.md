# Result View Surface Map

This file answers one question: which surface owns which part of the result-view runtime.

## PRD0062 #104 Observability Note

PRD0062 #104 registers Book runtime launch, denial, and return telemetry in
`src/config/featureRegistry.ts`. These actions belong to the specialized Book
runtime and do not add or alter a result-view route, host, shell, data path, or
ownership boundary. The canonical result-view surface map below is unchanged.

## Shared Body

- `SharedSavedResultCore` is the canonical saved-result content body.
- It renders score summary, tabs, review content, formative feedback, and teacher feedback sections when the shell enables them.

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
