# PRD-0040 FR Closure Matrix

This matrix records current closure status for PRD-0040 against the live repo. Status reflects what is proven today, not the intended future architecture.

Status keys:
- `verified`
- `partial`
- `unverified`

## 5.1 Governance and Living Documentation

| FR | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| `FR-001` | verified | `documentation/architecture/result-view-map.md` exists | this doc pack | Living result-view map is now published. |
| `FR-002` | verified | `documentation/architecture/result-view-permission-matrix.md` exists | this doc pack | Living permission matrix is now published. |
| `FR-003` | verified | `documentation/rules/result-view-reuse.md` exists | this doc pack | Reuse-before-new-view rule is now published. |
| `FR-004` | verified | result-view map classifies active, unwired, and demo-only surfaces | `result-view-map.md` | Classification exists as a living doc now. |
| `FR-005` | verified | result-view map records domain type per surface | `result-view-map.md` | Domain taxonomy is published. |
| `FR-005A` | verified | writing surfaces are classified by lifecycle role | `result-view-map.md` | Includes `draft`, `monitor`, `queue`, `editor`, `result`, `alternate/dormant`. |
| `FR-006` | verified | map and matrix exist as paired deliverables | this doc pack | Future changes must update both. |
| `FR-007` | partial | PRD and `documentation/conversation_2026-03-21_log.md` show documented change tracking; `.knowns` history also exists | PRD, conversation log, `.knowns` | Existing habit is visible, but future task discipline is still procedural. |
| `FR-008` | verified | reuse rule now says reviewers block merge when required artifacts are missing | `result-view-reuse.md` | Review guidance is now explicit. |
| `FR-009` | verified | reuse rule requires canonical surface, roles, entry owners, data paths, tests, and non-goals | `result-view-reuse.md` | Closure artifact now exists. |
| `FR-010` | verified | reuse rule requires usage/import/route/test audit before migration scope | `result-view-reuse.md` | Explicitly documented. |

## 5.2 Shared Saved-Result Architecture

| FR | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| `FR-011` | verified | all 3 active shells delegate content to `SharedSavedResultCore` | `SharedSavedResultCore.test.tsx`, shell tests | Task 2.0 complete: shared core extracts common presentation. |
| `FR-012` | verified | access checks remain in shells and route wrappers, not in `SharedSavedResultCore` | `SharedSavedResultCore.tsx` (presentation-only), `LegacyResultDetailView.tsx`, `PrivateRoute.jsx` | Core is explicitly contract-bound to never decide access. |
| `FR-013` | verified | `SharedSavedResultCore` renders score summary, answer map, section breakdown, question review, feedback display via `OverviewTab`, `ReviewTab`, `FeedbackTab` | `SharedSavedResultCore.test.tsx` | Common concern set is now a unified contract. |
| `FR-014` | verified | exactly three active saved-result shells remain | result shell tests, `ResultDetailPage.test.tsx` | No fourth active shell found. |
| `FR-015` | verified | student entry owners preserved; `ResultSlidePanel` delegates to shared core while keeping panel chrome and attempt switching | `ResultSlidePanel.test.tsx`, `AcademicRecordPage.test.tsx`, dashboard/homework tests | Preservation documented and verified post-migration. |
| `FR-016` | verified | teacher modal + homework host behavior preserved; `ResultDetailModal` delegates to shared core while keeping modal chrome, data loading, and auto-trigger | `TeacherHomeworkDetailPage.test.tsx`, `ResultDetailModal.test.tsx` | Behavior preserved and verified post-migration. |
| `FR-017` | verified | teacher/admin full-page route remains canonical non-student deep link | `ResultDetailPage.test.tsx` | Students are redirected out. |
| `FR-018` | partial | route hierarchy admits `super_admin`; full-page shell is reused for teacher/admin | `App.jsx`, `PrivateRoute.jsx`, `ResultDetailPage.tsx` | Super-admin runtime path is present but not extensively tested. |
| `FR-019` | partial | current admin behavior is additive via role hierarchy, not separate body | `App.jsx`, `ResultDetailPage.tsx` | Diagnostics contract is a PRD target more than current code artifact. |
| `FR-020` | verified | no risky admin mutation result screen found in active saved-result shells | static audit | PRD out-of-scope boundary matches repo reality. |

## 5.3 Feedback Parity for Saved-Result Shells

| FR | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| `FR-021` | verified | all 3 shells show identical feedback rendering via `FeedbackTab` inside `SharedSavedResultCore` | shell tests, `FeedbackTab.test.tsx`, `SharedSavedResultCore.test.tsx` | Feedback parity achieved through shared core. |
| `FR-022` | verified | current tests encode non-identical feedback/generation behavior | `ResultSlidePanel.test.tsx`, `ResultDetailModal.test.tsx` | Prevents silent parity claims. |
| `FR-023` | partial | feedback generation services exist, but cross-shell dedupe is not fully proven | feedback generation service tests | No end-to-end cross-shell proof. |
| `FR-024` | verified | PRD and current shells both preserve shell-specific chrome/actions | shell implementations | Current architecture supports this statement. |
| `FR-025` | verified | no separate admin feedback editing workflow found | static audit | Boundary matches repo. |
| `FR-026` | partial | audit services exist, but admin-capable feedback trigger auditing was not fully traced | audit service + feedback services | Needs runtime confirmation if implemented later. |

## 5.4 Utility and Presentation Reuse

| FR | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| `FR-027` | verified | `SharedSavedResultCore` extracts `OverviewTab`, `ReviewTab`, `FeedbackTab`, `StudyRecommendations`, and presentation helpers into shared components | `SharedSavedResultCore.tsx`, shared component files | Duplicate helpers consolidated into shared core. |
| `FR-028` | verified | scoring config path exists; `calculateBandScore()` is deprecated | static audit of scoring files | PRD wording matches code reality. |
| `FR-029` | verified | session-only, guest-only, and writing-only logic remain separate today | domain audit docs | Existing code strongly supports this boundary. |

## 5.5 Security and Permission Boundaries

| FR | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| `FR-030` | partial | route/shell/data-hook boundaries exist, but not uniformly | `PrivateRoute.jsx`, `LegacyResultDetailView.tsx`, service loaders | Some paths are stronger than others. |
| `FR-031` | verified | shared presentation is not the access authority where checks exist | `PrivateRoute.jsx`, `useOwnershipCheck.ts` | Matches current structure. |
| `FR-032` | partial | route config says ownership-sensitive, runtime student path does not fully enforce it | `routeSecurity.ts`, `ResultDetailPage.tsx`, `AcademicRecordPage.tsx` | Known live mismatch. |
| `FR-033` | partial | student-only controls appear segregated today | shell implementations | Full leakage audit not exhaustive. |
| `FR-034` | partial | teacher/admin-only controls appear segregated today | shell implementations | Full leakage audit not exhaustive. |
| `FR-035` | unverified | no targeted access-lost mid-session/result test was run | static audit only | No strong proof. |
| `FR-036` | verified | guest claim and demo/public paths are now explicitly documented as non-canonical risks | `result-view-permission-matrix.md`, `result-view-map.md` | Consolidation warning is grounded in concrete code and rules. |

## 5.6 Unwired, Legacy, and Demo Resolution

| FR | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| `FR-037` | verified | import/route/test/demo relevance audit completed and documented, including `TeacherResultsDashboard` and `SubmissionCompletePage` | `result-view-map.md` | Major surfaces classified. |
| `FR-038` | verified | each known unwired/demo surface now has an explicit resolution disposition in the map | `result-view-map.md` | Includes `remove now`, `keep for named future task`, or `convert to documented legacy wrapper`. |
| `FR-039` | verified | default-removal rule is explicitly documented in the reuse rule and current unwired/demo rows are triaged | `result-view-reuse.md`, `result-view-map.md` | Governance closure is documented even though code cleanup remains future work. |
| `FR-040` | verified | reuse rule now requires recoverable git reference plus removal note and change record before deletion | `result-view-reuse.md` | Procedural rule is now explicit. |
| `FR-041` | partial | alternate/dormant writing surfaces are classified, but no removal gate is yet tracked in code | `result-view-map.md` | Classification exists; lifecycle gate remains future work. |

## 5.7 Permanent Practice Requirements

| FR | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| `FR-042` | verified | map and permission matrix now exist | doc pack | Deliverables published. |
| `FR-043` | verified | reuse rule now makes map/matrix/change-record updates review-critical and merge-blocking | `result-view-reuse.md` | Rule captured. |
| `FR-044` | verified | reuse rule requires files, tests, docs, and forbidden moves | `result-view-reuse.md` | Explicit task discipline documented. |
| `FR-045` | verified | reuse rule requires canonical surface naming before coding | `result-view-reuse.md` | Explicit. |
| `FR-045A` | verified | entry owners/workflow owners are now explicit in PRD and rule doc | PRD, `result-view-reuse.md` | Closed at doc level. |
| `FR-045B` | verified | PRD main body vs Appendix A split is preserved | PRD | Current structure matches rule. |

## 5.8 Live-Session Review Release Model

| FR | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| `FR-046` | unverified | no explicit release-state model implemented | session/post-test audit | Future implementation work. |
| `FR-047` | unverified | no default `locked-review` enforcement found | session/post-test audit | Current behavior is permissive. |
| `FR-048` | unverified | current student surfaces show richer review than locked-review target | `StudentTestResultsPage.tsx`, `TestResultsModal.tsx` | PRD is migration target only. |
| `FR-049` | verified | current result payloads do not consistently support question-stem snapshot guarantees | session/post-test audit | PRD warning matches current data contract. |
| `FR-050` | partial | teacher monitor owns end-of-session handoff mechanics today | `useMonitorControls.ts`, `useTeacherEndRedirect.ts` | Release controls are not implemented yet. |
| `FR-051` | unverified | same-result cross-entry release enforcement not implemented | session/post-test audit | Future implementation work. |
| `FR-052` | partial | teacher/admin surfaces can already see richer result details than students | `TeacherTestResultsPage.tsx`, full-page shell | Monitor-page boundary remains future governance work. |
| `FR-053` | unverified | backend does not currently enforce restricted unreleased-path storage | RTDB rules audit | Current rules are broader than target. |
| `FR-054` | unverified | no feedback-released policy state exists today | session/post-test audit | Future implementation work. |

## Edge Cases and Forbidden Moves

| Item | Status | Evidence | Verification anchor | Notes |
|---|---|---|---|---|
| Query-param owner bypass | partial | `/student/academic-record?result=` opens panel directly | `AcademicRecordPage.test.tsx` | Routing proven, ownership not runtime-proven. |
| Notification metadata bypass | partial | dashboard opens result panel from `metadata.resultId` | `StudentDashboardPage.teachers.test.jsx` | No tamper-proof test. |
| Guest claim writes non-canonical path | verified | `guestResultsService.ts` writes `test_results/{userId}` | `guestResultsService.test.ts` | Concrete mismatch established. |
| Session/post-test flattened into `resultId` loader | verified | current loaders remain session-first and fallback-heavy | `StudentTestResultsPage.test.tsx`, `TeacherTestResultsPage.test.tsx` | Strongly disproven by current code. |
| Writing simplified into single result-view flow | verified | draft/monitor/queue/editor/result/THCS inline all exist | static audit docs | Strongly disproven by current code. |
| Parent-owned entry pages treated as wrappers | verified | academic record, dashboard, homework, history all have real behavior | page tests | PRD warning grounded in code. |
| Demo/public surfaces ignored | verified | demo pages are reachable and classified | `result-view-map.md` | Public risk is concrete. |
| Stale route/config producers treated as surface truth | verified | invalid student class deep link, config-only route, and incomplete feature registry are all documented | `result-view-map.md` | Route config and observability metadata are not authoritative inventories. |

## Remaining Non-Doc Closure Work

- Run `src/__tests__/security/prd0040-security.emulator.test.ts` through RTDB + Firestore emulators once Java is available locally or on an external Java-capable runner/CI host.
- Add tamper-path tests for `?result=`, notification metadata/link, and legacy `/student/results/:sessionCode`.
- Decide whether to align backend rules with PRD ownership intent or weaken the PRD intentionally.
