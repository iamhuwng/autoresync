## Relevant Files

- `documentation/tasks/0040-prd-unified-result-view-architecture-and-governance.md` - Governing PRD and final source of phase scope, acceptance gates, forbidden moves, and open questions.
- `tasks/tasks-0040-prd-unified-result-view-architecture-and-governance.md` - Generator-compliant task-list location for PRD-0040.
- `documentation/tasks/tasks-0040-prd-unified-result-view-architecture-and-governance.md` - Synced documentation copy of the PRD-0040 task list for existing repo references.
- `documentation/architecture/result-view-map.md` - Canonical surface inventory and domain classification that must stay aligned with implementation.
- `documentation/architecture/result-view-permission-matrix.md` - Canonical route, host, app-layer, and backend-rule permission truth.
- `documentation/architecture/result-view-fr-closure-matrix.md` - FR-by-FR closure status that must be updated when implementation status changes.
- `documentation/rules/result-view-reuse.md` - Review gate and pre-coding checklist for all result-related work.
- `package.json` - Source of the repo's actual verification commands and enforcement scripts.
- `scripts/pre-commit-enforcement.js` - Enforcement hook that must fail review when required result-view docs are missing.
- `scripts/run-security-tests.js` - Security test runner that must remain aligned with result-path verification.
- `src/components/results/SharedSavedResultCore.tsx` - New shared presentation core for active saved-result shells.
- `src/components/results/SharedSavedResultCore.test.tsx` - Add or update shared-core coverage before wiring all shells to it.
- `src/components/results/ResultSlidePanel.tsx` - Student saved-result shell that must keep parent-owned behavior.
- `src/components/results/ResultSlidePanel.test.tsx` - Regression coverage for the student shell.
- `src/components/results/ResultDetailModal.tsx` - Teacher saved-result modal shell that must keep homework-specific behavior.
- `src/components/results/ResultDetailModal.test.tsx` - Regression coverage for the teacher modal shell.
- `src/components/results/LegacyResultDetailView.tsx` - Full-page saved-result shell body to be refactored into the shared core.
- `src/components/results/LegacyResultDetailView.test.tsx` - Regression coverage for the full-page saved-result shell.
- `src/pages/ResultDetailPage.tsx` - Full-page route wrapper that must remain wrapper-only, not a fourth shell.
- `src/pages/ResultDetailPage.test.tsx` - Route-wrapper regression coverage for saved-result access.
- `src/pages/AcademicRecordPage.tsx` - Student host that owns `?result=` opening and closing behavior.
- `src/pages/AcademicRecordPage.test.tsx` - Regression coverage for academic-record saved-result entry.
- `src/pages/StudentDashboardPage.jsx` - Notification-driven student entry point into saved results.
- `src/pages/StudentDashboardPage.teachers.test.jsx` - Regression coverage for dashboard notification entry behavior.
- `src/pages/StudentHomeworkListPage.tsx` - Student homework list host for saved-result access.
- `src/pages/StudentHomeworkListPage.test.tsx` - Regression coverage for homework-list entry behavior.
- `src/pages/StudentHomeworkDetailPage.tsx` - Student homework detail host for saved-result access.
- `src/pages/StudentHomeworkDetailPage.test.tsx` - Regression coverage for homework-detail entry behavior.
- `src/pages/TeacherHomeworkDetailPage.tsx` - Teacher homework host for the teacher modal shell and feedback-timing behavior.
- `src/pages/TeacherHomeworkDetailPage.test.tsx` - Regression coverage for teacher homework entry behavior.
- `src/pages/TeacherStudentHistoryPage.tsx` - Teacher deep-link owner for permanent saved results.
- `src/pages/TeacherStudentHistoryPage.test.tsx` - Regression coverage for teacher history deep-link behavior.
- `src/config/routeSecurity.ts` - Declared route and ownership metadata that must match runtime behavior.
- `src/components/PrivateRoute.jsx` - Route-level auth and role gate that must stay separate from presentation logic.
- `src/components/PrivateRoute.test.tsx` - Primary component-level route gate regression coverage.
- `src/__tests__/auth/PrivateRoute.test.tsx` - Additional auth-focused route gate regression coverage.
- `src/__tests__/security/routeAccess.test.ts` - Supporting route regression test only; useful but not authoritative runtime permission truth.
- `src/__tests__/security/prd0040-security.emulator.test.ts` - Emulator-backed backend-rule verification for result-path ownership and tamper scenarios.
- `src/pages/StudentWaitingRoomPage.jsx` - Current waiting-room-first student review host for live-session flows.
- `src/pages/StudentWaitingRoomPage.test.jsx` - Regression coverage for waiting-room review behavior.
- `src/components/test/TestResultsModal.tsx` - Existing waiting-room review surface to be redesigned under the release-state contract.
- `src/components/test/TestResultsModal.test.tsx` - Add or update focused review-state coverage if this surface changes.
- `src/pages/StudentTestResultsPage.tsx` - Session-first student result page that must obey the same release state.
- `src/pages/StudentTestResultsPage.test.tsx` - Regression coverage for session-first student review behavior.
- `src/pages/TeacherTestResultsPage.tsx` - Teacher session-result page and writing-result bridge.
- `src/pages/TeacherTestResultsPage.test.tsx` - Regression coverage for teacher session-result behavior.
- `src/pages/StudentResultsPage.jsx` - Adjacent student result page that must be classified correctly during session-adjacent work.
- `src/pages/StudentResultsPage.test.jsx` - Regression coverage for the adjacent student result page if kept active.
- `src/pages/StudentFeedbackPage.jsx` - Adjacent student feedback surface that must be classified during release-governance work.
- `src/pages/TeacherFeedbackPage.jsx` - Adjacent teacher feedback surface that must be classified during release-governance work.
- `src/pages/TeacherFeedbackPage.test.jsx` - Regression coverage for teacher feedback classification or retention work.
- `src/pages/TeacherResultsDashboard.jsx` - Teacher aggregate session-results surface that remains outside saved-result shell unification.
- `src/services/resultsService.ts` - Aggregate teacher-results loader used by the results dashboard.
- `src/services/resultsService.test.ts` - Primary service coverage for teacher-results aggregation behavior.
- `src/__tests__/services/resultsService.test.ts` - Additional service coverage for teacher-results aggregation behavior.
- `src/pages/TeacherTestMonitorPage.tsx` - Teacher monitor workflow that must own release controls and remain separate from long-form result viewers.
- `src/pages/TeacherTestMonitorPage.test.tsx` - Add or update monitor release-control tests if this workflow changes.
- `src/components/test/StudentDetailModal.tsx` - Active live-monitor student detail surface that must remain in the monitor domain.
- `src/components/test/__tests__/StudentDetailModal.test.tsx` - Regression coverage for the live-monitor student detail surface if retained.
- `src/hooks/test/useTeacherEndRedirect.ts` - End-of-session redirect logic that hands students into waiting-room review flows.
- `src/hooks/test/useTestSubmission.ts` - Submission flow that hands students into waiting-room and session review paths.
- `src/hooks/test/useTestSubmission.test.ts` - Regression coverage for submission-to-review handoff behavior.
- `src/services/testResults.service.ts` - Session and post-test loader plus fallback logic that must stay separate from saved-result loading.
- `src/services/testResults.service.test.ts` - Regression coverage for session and post-test loading behavior.
- `src/pages/GuestResultsPage.tsx` - Public guest-result lookup surface that currently has CTA and route-consistency risk.
- `src/pages/GuestResultsPage.test.tsx` - Add or update guest-result page coverage if this surface changes.
- `src/pages/ProfileCompletionPage.tsx` - Guest-result claim and recovery flow entry point.
- `src/pages/ProfileCompletionPage.test.tsx` - Add or update focused claim and recovery coverage if this surface changes.
- `src/components/guest/ClaimResultsModal.tsx` - Guest-result claim modal that must stay explicit in the guest domain.
- `src/components/guest/ClaimResultsModal.test.tsx` - Add or update claim-modal coverage if this surface changes.
- `src/services/guestResultsService.ts` - Non-canonical guest-result claim storage path and claim behavior.
- `src/services/guestResultsService.test.ts` - Regression coverage for guest-result claim behavior.
- `src/pages/TeacherGradingPage.tsx` - Writing grading queue front door.
- `src/pages/TeacherGradingPage.test.tsx` - Add or update queue coverage if writing triage behavior changes.
- `src/pages/WritingGradingPage.tsx` - Active writing grading editor.
- `src/pages/WritingGradingPage.test.tsx` - Add or update grading-editor coverage if this workflow changes.
- `src/pages/SubmissionCompletePage.tsx` - Writing submission-complete bridge into result review.
- `src/pages/SubmissionCompletePage.test.tsx` - Add or update bridge coverage if this surface changes.
- `src/components/writing-results/WritingResultDetailModal.tsx` - Writing result modal that must remain in the writing domain.
- `src/components/writing-results/WritingResultDetailModal.test.tsx` - Add or update writing-result modal coverage if this surface changes.
- `src/components/writing-monitor/WritingPeekModal.tsx` - Active writing-monitor peek surface that must stay in the monitor domain.
- `src/components/writing-monitor/WritingPeekModal.test.tsx` - Add or update monitor-bridge coverage if this surface changes.
- `src/components/writing-results/WritingResultView.tsx` - Writing result-view artifact that must be explicitly classified.
- `src/components/writing-results/WritingResultView.test.tsx` - Add or update focused coverage only if this surface is retained.
- `src/components/writing-results/WritingTestResultsSection.tsx` - Writing test-results artifact that must be explicitly classified.
- `src/components/writing-results/WritingTestResultsSection.test.tsx` - Add or update focused coverage only if this surface is retained.
- `src/components/writing-grading/WritingGradingModal.tsx` - Alternate or dormant writing grading toolchain that must be explicitly triaged.
- `src/components/writing-grading/WritingGradingModal.test.tsx` - Add or update alternate-toolchain coverage only if the surface is retained.
- `src/components/writing-results/StudentResultOverview.tsx` - Unwired or dormant writing result component that must be explicitly classified.
- `src/components/writing-results/StudentResultOverview.test.tsx` - Add or update focused coverage only if the surface is retained.
- `src/components/writing-results/StudentDetailedMarkup.tsx` - Unwired or dormant writing markup component that must be explicitly classified.
- `src/components/writing-results/StudentDetailedMarkup.test.tsx` - Add or update focused coverage only if the surface is retained.
- `src/pages/FeedbackComponentsDemo.tsx` - Public demo surface with live-path write risk that must be explicitly resolved.
- `src/pages/FeedbackComponentsDemo.test.tsx` - Add or update demo-risk coverage if this surface is retained.
- `src/pages/FeedbackDemoPage.tsx` - Demo-only feedback surface that must be classified or removed.
- `src/pages/FeedbackDemoPage.test.tsx` - Add or update demo-page coverage only if retained.
- `src/pages/AcademicRecordDemoPage.tsx` - Demo-only academic-record surface that must be classified or removed.
- `src/pages/AcademicRecordDemoPage.test.tsx` - Add or update demo-page coverage only if retained.
- `src/pages/DemoIndexPage.tsx` - Demo route hub that may keep stale public or demo links alive.
- `src/pages/DemoIndexPage.test.tsx` - Add or update demo-index coverage only if retained.

### Notes

- Treat this file as the execution script for PRD-0040. If a code change, new file, migration step, or architectural shortcut is not explicitly allowed here, in the PRD, or in the living docs, stop and update the docs first.
- Parent tasks are hard phase gates. Do not reorder them, merge them together, skip ahead, or clean up nearby code outside the parent task's explicit scope.
- Every parent task must end with all four artifacts complete: code, docs, tests, and a change record in `documentation`, Knowns, or Antigravity Knowledge when the implementation deviates from the prior PRD or living-doc truth.
- Tasks `0.0` through `3.0` are strictly sequential. Task `4.0` follows them. Tasks `5.0`, `6.0`, `7.0`, and `8.0` may run in parallel or in any order only after `4.0` is complete. Task `9.0` is always last.
- Do not start coding if any result surface is uncategorized, if a fourth active saved-result shell appears, or if the canonical surface and parent owner are not named.
- Do not broaden phase-1 scope beyond PRD sections `8.1`, `8.1A`, `8.2`, `8.3`, and `8.4`.
- Do not merge session or post-test, guest-result, writing, or live-monitoring loaders into the saved-result shared core during phase 1.
- Do not move authorization into shared presentation code. Shared code may render states, but it may not decide who can access a result.
- If access is lost while a result is open, the implementation must remove sensitive content immediately and show an access-lost state. Testing this behavior is not optional.
- The task-generation template mentions `npx jest [optional/path/to/test/file]`. In this repo, use the repo-equivalent Vitest command: `cmd /c npx vitest run [optional/path/to/test/file] --reporter=basic`.
- Per FR-006, living-doc updates must be part of the same PR or equivalent change set as the code changes they document. Do not batch doc updates into a later cleanup change.
- Use the exact verification bundles listed in task `0.3`. Do not substitute a smaller or different set of tests unless this task file is updated first.
- If a listed test file does not exist yet, create it before closing the parent task that depends on it.
- `src/__tests__/security/routeAccess.test.ts` is supporting evidence only. Do not use it by itself to claim ownership or backend-rule truth.
- `src/__tests__/security/prd0040-security.emulator.test.ts` is the required verification anchor whenever the task depends on backend-rule truth rather than route-only behavior.
- Manual checks required by the PRD are part of completion criteria. A passing automated test bundle does not waive a required manual check.
- For unwired or demo surfaces, default to removal. Retention is allowed only when a named future task, concrete removal gate, and target phase are recorded.
- Prefer one parent task per PR. Multiple small commits inside that PR are acceptable only if code, docs, tests, and change-record updates stay together.
- When a task says stop, stop code changes immediately, record the stop reason in the change record, notify the lead or reviewer, and do not resume until the blocking condition is resolved and documented. Do not invent a workaround. Do not hide partial changes in a follow-up commit without reviewer direction.
- Appendix A writing findings remain preserved investigation input until this task list converts them into named follow-up tasks, accepted current behaviors, or explicit fixes.

## Tasks

- [x] 0.0 Complete the readiness gate before any implementation work starts.
  - [x] 0.1 Build a preflight ledger for every surface touched by PRD-0040, naming for each one: domain, canonical surface, exact route or host page, exact parent owner, exact data path, exact backend-rule dependency, exact tests to run, exact manual checks to perform, exact docs to update, and exact forbidden moves. Minimum named coverage: the 3 saved-result shells, `ResultDetailPage`, `StudentWaitingRoomPage`, `TestResultsModal`, `StudentTestResultsPage`, `TeacherTestResultsPage`, `TeacherResultsDashboard`, `GuestResultsPage`, `ProfileCompletionPage`, `ClaimResultsModal`, `StudentResultsPage`, `StudentFeedbackPage`, `TeacherFeedbackPage`, `StudentDetailModal`, `WritingPeekModal`, `WritingResultView`, `WritingTestResultsSection`, writing lifecycle surfaces, live-monitor surfaces, and public or demo result surfaces.
  - [x] 0.2 Compare the preflight ledger against `documentation/architecture/result-view-map.md`, `documentation/architecture/result-view-permission-matrix.md`, `documentation/architecture/result-view-fr-closure-matrix.md`, and `documentation/rules/result-view-reuse.md`. Update the docs first if any current repo truth differs. Verify that `result-view-map.md` contains a status field (`active`, `legacy`, `unwired`, or `demo-only`) and a domain field for every surface, and that writing surfaces also have a lifecycle role. Verify that `result-view-reuse.md` contains the pre-coding checklist requiring canonical surface name, target roles, target entry points, explicit non-goals, and a usage/import/route/test audit step. Do not start feature implementation while docs and code disagree or while any required governance field is missing.
  - [x] 0.3 Freeze the exact verification baseline the junior must use:
    - [x] 0.3.1 Phase-1 baseline bundle: `cmd /c npx vitest run src/pages/AcademicRecordPage.test.tsx src/pages/StudentDashboardPage.teachers.test.jsx src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/pages/TeacherHomeworkDetailPage.test.tsx src/pages/TeacherStudentHistoryPage.test.tsx src/pages/ResultDetailPage.test.tsx src/pages/StudentWaitingRoomPage.test.jsx src/pages/TeacherTestResultsPage.test.tsx --reporter=basic`
    - [x] 0.3.2 Saved-result shell bundle: `cmd /c npx vitest run src/components/results/LegacyResultDetailView.test.tsx src/components/results/ResultSlidePanel.test.tsx src/components/results/ResultDetailModal.test.tsx src/components/results/SharedSavedResultCore.test.tsx --reporter=basic`
    - [x] 0.3.3 Session-review bundle: `cmd /c npx vitest run src/pages/StudentWaitingRoomPage.test.jsx src/pages/StudentTestResultsPage.test.tsx src/pages/TeacherTestResultsPage.test.tsx src/hooks/test/useTestSubmission.test.ts --reporter=basic`
    - [x] 0.3.4 Security and adjacency bundle: `cmd /c npx vitest run src/components/PrivateRoute.test.tsx src/__tests__/auth/PrivateRoute.test.tsx src/services/guestResultsService.test.ts src/services/testResults.service.test.ts src/__tests__/security/routeAccess.test.ts src/__tests__/security/prd0040-security.emulator.test.ts --reporter=basic`
    - [x] 0.3.5 Enforcement bundle: `cmd /c npm run test:security`, `cmd /c npm run enforce:check`, and `cmd /c npm run check:utf8 -- <changed-paths>`
    - [x] 0.3.6 Confirm whether each test file in the verification bundles already exists. If a file does not exist yet, record which parent task creates it before that parent task starts. `SharedSavedResultCore.test.tsx` is a mandatory deliverable of task `2.2`.
  - [x] 0.4 Freeze the exact stop conditions before coding: stop immediately if a fourth active saved-result shell appears, if any result surface is uncategorized, if any task needs a new result data path, if any task needs a new result route not named in the PRD, if a deprecated wrapper would survive without a concrete removal gate, or if backend-rule truth is being claimed without emulator-backed proof.
  - [x] 0.5 Record the blocking architectural decisions the PRD leaves explicit: whether phase 1 fixes or carries the `/result/:resultId` student ownership gap, whether guest-result claim stays compatibility-mapped or starts a migration path, how public or demo feedback routes are classified or removed, which manual checks will be used when the PRD requires them, and what runtime-proof work remains blocked on emulator availability. The `/result/:resultId` decision must be made here, not deferred to task `3.1`. Task `3.1` implements the chosen decision.
  - [x] 0.6 Create the initial change record for this implementation packet in the team's approved change-tracking channel and link the readiness ledger, the exact test bundles, the exact manual checks, and any carried risks. Do not begin `1.0` until the preflight ledger, docs, test bundles, stop conditions, manual checks, and change record all exist.

- [x] 1.0 Lock the saved-result baseline and phase-1 boundaries with no room for reinterpretation.
  - [x] 1.1 Reconfirm that the only active saved-result shells are `ResultSlidePanel`, `ResultDetailModal`, and `LegacyResultDetailView`, and that `ResultDetailPage` is wrapper-only. If any fourth shell is discovered, stop and return to `0.0`.
  - [x] 1.2 Reconfirm the exact host owners for saved-result behavior: `AcademicRecordPage`, `StudentDashboardPage`, `StudentHomeworkListPage`, `StudentHomeworkDetailPage`, `TeacherHomeworkDetailPage`, and `TeacherStudentHistoryPage`. Record which shell each host owns and which route, query param, notification payload, or parent state opens it.
  - [x] 1.3 Reconfirm the exact risk paths before extraction: `/result/:resultId`, academic-record `?result=` opening, dashboard notification opening, homework-owned opening, and teacher-history deep linking. For each path, record the exact enforcement layer that owns access: route wrapper, parent owner, authorized data hook, backend rule, or an explicit delegation chain between them.
  - [x] 1.4 Reconfirm the phase-1 non-goals from the PRD in the task artifact itself: no session loader unification, no guest loader unification, no writing loader unification, no live-monitor loader unification, no new admin-only result body, no risky admin mutation tools, and no new result storage path.
  - [x] 1.5 Reconfirm the current FR rows that this phase can affect directly: FR-014 through FR-017, FR-021 through FR-027, FR-030 through FR-036, FR-042 through FR-045A. Update `result-view-fr-closure-matrix.md` first if the current status is stale before code changes begin.
  - [x] 1.6 Close `1.0` only when the shell count, host-owner list, path-by-path enforcement ledger, phase-1 non-goals, FR baseline, and initial change record are all written down and match the living docs exactly.
- [x] 2.0 Extract the shared saved-result core in a shell-by-shell rollout with exact owner preservation.
  - [x] 2.1 Define the `SharedSavedResultCore` contract in writing before coding: exact sections allowed in the shared core, exact props and fallback states, exact presentation-only helpers allowed to move, exact logic that must stay outside the core, exact stale-state refresh behavior on shell open, exact handling for legacy results missing expected fields, and exact compatibility expectations for all 3 saved-result shells. Explicitly list permission decisions as logic that must stay outside the shared core. Explicitly prohibit creating a new centralized band-score helper. The deprecated `calculateBandScore()` helper must not be frozen into the shared core or its helpers; scoring must continue to follow the current scoring-configuration path.
  - [x] 2.2 Create or update `src/components/results/SharedSavedResultCore.tsx` and `src/components/results/SharedSavedResultCore.test.tsx` first. The shared core must cover score summary, attempt context, answer review, feedback display, empty states, error states, fresh-result refresh hooks needed to avoid shell drift, and graceful hiding of unsupported sections when legacy saved results lack fields. Any compatibility gap must be recorded in docs and logs.
  - [x] 2.3 Migrate `LegacyResultDetailView.tsx` to the shared core first. Preserve full-page shell responsibilities, keep access gating outside the shared core, and do not convert `ResultDetailPage.tsx` into a fourth shell or a smart loader.
  - [x] 2.4 Migrate `ResultSlidePanel.tsx` next. Preserve academic-record query-param behavior, student homework entry behavior, dashboard notification behavior, open and close handling, and attempt switching exactly as they work today unless the PRD names an explicit change.
  - [x] 2.5 Migrate `ResultDetailModal.tsx` last. Preserve teacher-homework modal behavior, homework feedback-timing behavior, and teacher modal actions exactly as they work today unless the PRD names an explicit change.
  - [x] 2.6 After each shell migration, run the relevant owner-flow tests before touching the next shell. Do not stack all shell refactors together and test only at the end.
  - [x] 2.7 When all 3 shells are wired, run the full phase-1 verification bundle from `0.3.1` and `0.3.2`, then update `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md`, and the change record with the final shared-core architecture and preserved owner contracts.
  - [x] 2.8 Stop and revert to docs if extraction requires a new loader, a new route, a new result data path, a fourth shell, or any placeholder replacement of a working owner flow.
  - [x] 2.9 Close `2.0` only when one shared core exists, all 3 shells consume it, owner behavior is unchanged, stale-state refresh and legacy-result degradation rules are implemented, docs are updated, the change record is updated, and the exact shell and owner-flow bundles pass.
- [x] 3.0 Complete saved-result security hardening, feedback parity, and access-loss behavior.
  - [x] 3.1 Make the `/result/:resultId` ownership disposition explicit and final for this implementation packet: either fix the student ownership gap now or carry it as a named documented risk with a follow-up task. Do not leave the decision implicit.
  - [x] 3.2 For each saved-result entry path, name the responsible enforcement layer and wire the implementation to that layer explicitly: `ResultDetailPage` route access, academic-record `?result=` opens, dashboard notification opens, homework-owned opens, and teacher-history deep links. Route protection alone is not sufficient unless the parent owner or authorized data hook explicitly delegates ownership and the docs say so.
  - [x] 3.3 Implement the access-lost behavior required by FR-035: if access is revoked while a saved result is open, the shell must remove sensitive content immediately and render an access-lost state. This is product behavior, not only a verification scenario.
  - [x] 3.4 Harden all non-route saved-result opens so the panel or shell does not trust raw incoming identifiers. Query params, notification metadata, and parent-provided identifiers must flow through the approved ownership-aware data path.
  - [x] 3.5 Bring saved-result feedback display to the approved parity contract across `ResultSlidePanel`, `ResultDetailModal`, and `LegacyResultDetailView`, while preserving shell-specific chrome and actions. Refresh result state on shell open or after feedback generation and retry so shell-to-shell drift cannot persist from stale local state.
  - [x] 3.6 Centralize feedback-generation dedupe and retry behavior only where the PRD allows it, and ensure teacher or admin trigger and retry actions are auditable.
  - [x] 3.7 Confirm that `super_admin` reuses the same teacher/admin full-page shell rather than a separate body. Define the exact `Admin Tools` diagnostics that appear in that shared shell, list the exact safe feedback trigger or retry actions admins receive, and explicitly prohibit ownership, metadata, score, answer, and payload editing.
  - [x] 3.8 Document the saved-result contract explicitly instead of leaving it inferred from one shell: which fields are shared-core data, which fields are optional, which fields are legacy-only compatibility inputs, and which items are shell-specific chrome or actions.
  - [x] 3.9 Audit every touched data path and rule dependency after extraction and parity work. Confirm that no new database read permissions were added, no new result data path was introduced, and no non-canonical path such as guest-claim storage was silently normalized. Compare the relevant Firestore and RTDB rule dependencies before and after the work.
  - [x] 3.10 Audit every shell action and explicitly prevent cross-role leakage: student-only controls stay out of teacher and admin shells; teacher and admin controls stay out of the student shell; risky admin mutation actions remain out of scope.
  - [x] 3.11 Run `0.3.1`, `0.3.2`, and `0.3.4` after the hardening work. If the implementation relies on backend-rule truth, also run the emulator-backed test. Do not close this phase on route-only tests.
  - [x] 3.12 Update `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md`, the governing PRD if architecture truth changed, and the change record with the final ownership decision, responsible enforcement layers, access-lost behavior, feedback-parity scope, admin-tool scope, saved-result contract, and any carried security risks.
  - [x] 3.13 Stop if any ownership claim is being justified by `routeAccess.test.ts` alone, if any shell still trusts raw query or notification data, if access-lost behavior is tested but not implemented, if stale feedback drift can still happen after reopening a shell, or if the work broadened data access or normalized a non-canonical path without explicit approval.
  - [x] 3.14 Close Phase 1 only when extraction, approved feedback generation parity, intact permission boundaries, explicit `/result/:resultId` disposition, tests, living docs, manual checks, and change records satisfy the PRD's phase-1 acceptance gate.
- [x] 4.0 Implement the phase-2 live-session release model without flattening session loaders into saved-result architecture.
  - [x] 4.1 Define the persisted release-state contract exactly as `locked-review`, `review-released`, and `feedback-released`, naming where the state is stored, who can change it, and how current permissive student review behavior is being migrated.
  - [x] 4.2 Update `TeacherTestMonitorPage.tsx`, `useTeacherEndRedirect.ts`, and any related monitor-owned release controls so the teacher monitor workflow owns early release and end-of-session release for the current test and all submitted students. When review is auto-released at session end, feedback may still be pending. Students must receive the released review state even if feedback generation has not finished yet.
  - [x] 4.3 Redesign `StudentWaitingRoomPage.jsx` and `TestResultsModal.tsx` for `locked-review`. Allowed student-visible content is limited to score, counts, status indicators, and the student's own answer where available. Correct answers, AI explanations, teacher feedback, and feedback-generation controls must remain hidden. Do not render question stems or question text in `locked-review`. Current result payloads do not consistently store question-snapshot data, so any question text that happens to appear in some payloads must be ignored until a later explicit data-contract change approves question snapshots.
  - [x] 4.4 Lock the cross-entry release scope to exact files, not broad concepts. Minimum required student entry files: `StudentWaitingRoomPage.jsx`, `StudentTestResultsPage.tsx`, `AcademicRecordPage.tsx`, `StudentDashboardPage.jsx`, `StudentHomeworkListPage.tsx`, and `StudentHomeworkDetailPage.tsx` wherever they can surface the same live-session result before release.
  - [x] 4.5 Keep session and post-test loading local. `testResults.service.ts`, retry logic, latest-result lookup, fallback scoring, and session-specific lookup behavior stay separate from saved-result loading. If a shared presentational fragment is proposed, document and audit it separately before reuse.
  - [x] 4.6 Keep teacher and admin explanations plus feedback on teacher and admin result surfaces rather than moving them into the monitor page. The monitor page remains an operational control surface, not the canonical long-form feedback viewer.
  - [x] 4.7 Move unreleased explanations, AI feedback, and teacher feedback behind the approved restricted storage or delayed-generation contract so they are not written into student-readable paths before release.
  - [x] 4.8 Run `0.3.3`, the relevant parts of `0.3.4`, and `0.3.5`, then perform the manual checks named in `0.5` for locked-review, released review, teacher-admin exception paths, and same-result cross-entry behavior. Add missing tests for `TestResultsModal`, `TeacherTestMonitorPage`, or adjacent session-result pages if release-state behavior changes there.
  - [x] 4.9 Update `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md`, the PRD if architecture truth changed, and the change record with the final release-state contract, migration note, release-owner workflow, manual-check results, and cross-entry behavior.
  - [x] 4.10 Stop if any session flow is being rewritten as a plain `resultId` loader, if release-state policy is being treated as an accidental regression instead of an explicit contract change, or if one student entry point can still see more than another for the same locked result.
  - [x] 4.11 Close `4.0` only when live-session release-state behavior is consistent across the named student entry files, teacher or admin exceptions remain valid, session loaders remain local, docs are updated, automated tests pass, required manual checks are recorded, and the final checks explicitly confirm the PRD's live-session user-story outcomes for US-8 and US-9.
- [ ] 5.0 Resolve guest-result and claim behavior as an explicit adjacent domain, not as an accidental saved-result variant.
  - [ ] 5.1 Classify `GuestResultsPage.tsx`, `ProfileCompletionPage.tsx`, `ClaimResultsModal.tsx`, and `guestResultsService.ts` together as the guest-result and claim domain in the living docs and in the implementation notes for this phase.
  - [ ] 5.2 Make the guest-result storage decision explicit: either keep the current compatibility story for the non-canonical claim path or start an approved migration path. Do not silently normalize guest claims into canonical saved-result storage.
  - [ ] 5.3 Fix or explicitly cover the current invalid or stale guest CTA routes and route mismatches so the public guest flow cannot point users into dead paths.
  - [ ] 5.4 Add or update targeted tests for the guest-result page, claim flow, and service behavior. If a page or modal still has no focused test, add one before closing the parent task.
  - [ ] 5.5 Update `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md` if closure status changes, and the change record with the final guest-domain compatibility or migration decision.
  - [ ] 5.6 Stop if guest-result behavior is being folded into the saved-result shared core, if guest claim writes are changed without an explicit migration story, or if CTA mismatches remain undocumented.
  - [ ] 5.7 Close `5.0` only when guest flows are explicitly classified, CTA and route behavior are resolved or documented, tests exist for the chosen path, and the living docs plus change record are updated.
- [ ] 6.0 Resolve the writing domain as a separate lifecycle architecture with named follow-up work.
  - [ ] 6.1 Build the writing lifecycle map explicitly in the implementation notes and living docs: `draft`, `monitor`, `queue`, `editor`, `result`, and `alternate/dormant`. Minimum named surfaces: `TeacherGradingPage`, `WritingGradingPage`, `SubmissionCompletePage`, `WritingResultDetailModal`, `WritingPeekModal`, `WritingResultView`, `WritingTestResultsSection`, monitor-owned writing behavior, THCS inline writing, and the alternate or dormant writing redesign components.
  - [ ] 6.2 Keep the writing front doors correct. The writing architecture must start from queue, monitor, draft, and editor flows, not from result viewers only.
  - [ ] 6.3 Document the cross-store seam explicitly: RTDB draft and autosave state, Firestore `writing_submissions`, submission promotion, and the bridge back into result review. Do not collapse those artifacts into one generic result abstraction.
  - [ ] 6.4 Disposition Appendix A one finding at a time. For each preserved Appendix A item, record exactly one outcome: named follow-up task, accepted current behavior recorded in docs, or explicit fix in this implementation packet. Do not allow any item to remain unclassified, and do not promote every Appendix A finding into an immediate requirement by default.
    - [ ] 6.4.1 Appendix A #1: teacher grading queue is the writing front door, not a result viewer.
    - [ ] 6.4.2 Appendix A #2: the active grading draft path is not truly a draft path because autosave and save-draft mark work as graded.
    - [ ] 6.4.3 Appendix A #3: the student submit path has a last-edit loss race between pending save flush and Firestore snapshotting.
    - [ ] 6.4.4 Appendix A #4: writing is a cross-store lifecycle, not a normal saved-result shell.
    - [ ] 6.4.5 Appendix A #5: the writing monitor path is an active teacher control loop before a final result exists.
    - [ ] 6.4.6 Appendix A #6: monitor and grading or result paths use different artifacts and the seam must stay explicit.
    - [ ] 6.4.7 Appendix A #7: grading and result tools depend on metadata that the live editor does not durably persist.
    - [ ] 6.4.8 Appendix A #8: the tab-switch monitoring contract is incomplete.
    - [ ] 6.4.9 Appendix A #9: the teacher feedback and editing loop is bidirectional rather than terminal.
    - [ ] 6.4.10 Appendix A #10: the audit-trail workflow is underimplemented.
    - [ ] 6.4.11 Appendix A #11: there are two materially different grading-tool architectures that must be classified separately.
    - [ ] 6.4.12 Appendix A #12: THCS inline writing grading is a separate operational workflow and must stay distinct from IELTS writing.
  - [ ] 6.5 Classify alternate or dormant writing tooling explicitly, including `WritingGradingModal`, `StudentResultOverview`, and `StudentDetailedMarkup`, and decide whether each one is removed now, kept for a named future task, or converted into a documented legacy wrapper with a target removal phase.
  - [ ] 6.6 Add or update focused tests only for writing surfaces that are retained or modified. Do not spend time creating tests for components that are being removed immediately.
  - [ ] 6.7 Update `result-view-map.md`, `result-view-permission-matrix.md` if access truth changes, `result-view-fr-closure-matrix.md` if closure status changes, the PRD if lifecycle truth changed, and the change record with the final lifecycle map and Appendix A dispositions.
  - [ ] 6.8 Stop if writing is being rewritten as just another result shell, if the RTDB-to-Firestore seam is not documented, or if any Appendix A finding remains unclassified.
  - [ ] 6.9 Close `6.0` only when the full writing lifecycle is classified, Appendix A findings have named outcomes, retained writing surfaces have explicit status, and docs plus change records are updated.
- [ ] 7.0 Preserve live-monitoring as its own operational domain with no accidental merge into result viewers.
  - [ ] 7.1 Identify every live-monitor surface touched by this program and record its operational role, data contract, and owner workflow in the living docs and implementation notes. Minimum named coverage: `TeacherTestMonitorPage`, `StudentDetailModal`, and monitor-owned writing surfaces such as `WritingPeekModal`.
  - [ ] 7.2 Keep monitor-owned actions, especially release-adjacent actions, inside monitor workflows such as `TeacherTestMonitorPage`. Long-form result viewers may consume release state, but they must not take over monitor ownership.
  - [ ] 7.3 If any presentational fragment is shared between monitor and result surfaces, audit it separately and keep it presentation-only. No shared monitor loader, no shared monitor permission logic, and no hidden cross-domain coupling.
  - [ ] 7.4 Add or update monitor-focused tests if monitor behavior changes. If monitor behavior does not change, document explicitly that the work was classification-only.
  - [ ] 7.5 Update the result-view map, permission matrix if access truth changes, FR closure matrix if status changes, and the change record with the final live-monitoring classification and retained boundaries.
  - [ ] 7.6 Stop if monitor workflows are being treated as disposable wrappers around result viewers or if release ownership is drifting out of the monitor workflow.
  - [ ] 7.7 Close `7.0` only when monitor surfaces are classified, release ownership remains in monitor workflows, any shared code is presentation-only, and docs plus change records are updated.
- [ ] 8.0 Triage every unwired, legacy, or demo result surface with explicit removal or retention decisions.
  - [ ] 8.1 Audit each unwired or demo surface through imports, routes, lazy imports, tests, demo links, and any other runtime reachability evidence. Minimum named surfaces: `FeedbackComponentsDemo`, `FeedbackDemoPage`, `AcademicRecordDemoPage`, `DemoIndexPage`, `WritingGradingModal`, `StudentResultOverview`, `StudentDetailedMarkup`, `WritingResultView`, and `WritingTestResultsSection`.
  - [ ] 8.2 Classify every audited surface as exactly one of: `remove now`, `keep for named future task`, or `convert to documented legacy wrapper`. The default is `remove now`.
  - [ ] 8.3 For every retained wrapper, record the exact removal gate and target phase. Open-ended keep-for-later language is not allowed. A wrapper with a unique remaining entry point may not be removed until that entry point is migrated or formally retired.
  - [ ] 8.4 Before removing any surface, record a recoverable git version reference, a removal note in the living docs, and a matching change record entry. Do not delete first and document later.
  - [ ] 8.5 Resolve the public or demo feedback-route risk explicitly. `FeedbackComponentsDemo.tsx` must not keep live-path write behavior without an approved documented reason and an explicit retention decision.
  - [ ] 8.6 Add, update, or delete focused tests to match the final triage decisions. Do not leave stale tests proving dead behavior or keep live code with no test or classification.
  - [ ] 8.7 Update `result-view-map.md`, `result-view-permission-matrix.md` if access truth changes, `result-view-fr-closure-matrix.md` if status changes, the PRD if architecture truth changed, and the change record with the final triage decisions.
  - [ ] 8.8 Stop if any unwired or demo surface remains uncategorized, if a retained wrapper has no removal gate, or if a public or demo route still carries live-path write risk without an explicit decision.
  - [ ] 8.9 Close `8.0` only when all targeted surfaces have explicit outcomes, removal history is recorded where needed, tests match reality, and docs plus change records are updated.
- [ ] 9.0 Close the enforcement and merge gate so future work cannot drift away from PRD-0040.
  - [ ] 9.1 Update enforcement and review checks so result-related changes fail review when `result-view-map.md`, `result-view-permission-matrix.md`, `result-view-fr-closure-matrix.md`, or the required change record are missing. Verify that the living-doc practice itself is operational: PRD, map, matrix, and change record must all be reviewable together as one workflow, not as disconnected artifacts.
  - [ ] 9.2 Make the runtime backend-rule verification path explicit and runnable. If local Java or emulator support is missing, record the exact external runner or CI requirement instead of pretending the proof exists locally.
  - [ ] 9.3 Add tamper-path verification for `?result=`, notification metadata and links, legacy direct-result routes, same-result cross-entry behavior, and access-lost behavior.
  - [ ] 9.4 Remove any thin legacy wrapper whose removal gate has been satisfied, or update that wrapper's gate and target phase explicitly if it must survive longer. Phase 4 is not complete while an expired wrapper gate remains unresolved.
  - [ ] 9.5 Run the exact enforcement bundle from `0.3.5`, rerun the affected Vitest bundles from `0.3.1` through `0.3.4`, and record which commands passed, which were blocked by environment, and which follow-up task owns any remaining runtime gap.
  - [ ] 9.6 Convert every unresolved risk into a named follow-up task or an explicit carried risk in the change record. Do not leave someone-should-check-this-later text without an owner.
  - [ ] 9.7 Reconcile the final implementation state against the PRD phase acceptance gates and forbidden moves. If a phase gate is not satisfied, do not mark that phase complete just because code exists.
  - [ ] 9.8 Update the final living docs, the governing PRD if architecture truth changed, and the final change record entry so the merge packet contains the exact current truth.
  - [ ] 9.9 Stop if any required doc is missing, if any required test bundle was not run or explicitly deferred with owner and reason, if UTF-8 checks fail on changed files, or if any carried risk lacks a named follow-up.
  - [ ] 9.10 Close `9.0` only when enforcement is active, runtime-proof strategy is explicit, tamper paths are covered, wrapper-removal gates are current, all required docs are current, UTF-8 checks pass, and the merge packet is complete without relying on tribal knowledge.

## Relevant Files

| File | Purpose |
|---|---|
| `src/utils/rtdbAccessLost.ts` | Task 3.3: Shared utility for detecting RTDB `PERMISSION_DENIED` errors and defining access-lost state types |
| `src/types/releaseState.types.ts` | Task 4.1: TypeScript type definitions for the three-state release model (locked-review, review-released, feedback-released), with utility functions for state validation, comparison, and visibility flag derivation |
| `src/components/results/ResultSlidePanel.tsx` | Task 3.3: Added PERMISSION_DENIED detection in RTDB `onValue` error handler and fallback; renders access-lost UI when triggered |
| `src/components/results/ResultDetailModal.tsx` | Task 3.3: Added PERMISSION_DENIED detection in RTDB `onValue` error handler; renders access-lost UI when triggered |
| `src/components/results/ResultSlidePanel.test.tsx` | Task 3.3: Added 3 FR-035 regression tests (initial PERMISSION_DENIED, mid-session revocation, non-permission error distinction) |
| `documentation/architecture/result-view-permission-matrix.md` | Task 3.2/3.4: Added named enforcement layers, data path audit, identifier trust model documentation |
| `documentation/architecture/result-view-fr-closure-matrix.md` | Task 3.3: Updated FR-035 from unverified to verified |
| `documentation/architecture/result-view-map.md` | Task 3.2: Cross-referenced enforcement layer documentation |
| `src/components/results/LegacyResultDetailView.tsx` | Task 3.5: Converted from one-shot `getTestResult` to real-time `onValue` listener for feedback refresh parity; added access-lost UI |
| `src/components/results/LegacyResultDetailView.test.tsx` | Task 3.5: Rewrote tests to use `onValue` mock pattern; added FR-035 access-lost tests and real-time refresh parity tests |
| `src/hooks/useFeedbackAutoTrigger.ts` | Task 3.6: Centralized feedback state, auto-trigger, and once-per-open dedupe hook. Used by ResultSlidePanel and ResultDetailModal. |
| `src/services/resultFeedbackGeneration.service.ts` | Task 3.6: Added in-flight dedupe map to prevent duplicate concurrent generation calls for the same resultId |
| `src/components/results/ResultSlidePanel.tsx` | Task 3.6: Replaced inline feedback logic with `useFeedbackAutoTrigger` hook |
| `src/components/results/ResultDetailModal.tsx` | Task 3.6: Replaced inline feedback logic with `useFeedbackAutoTrigger` hook |
| `src/hooks/monitor/useMonitorControls.ts` | Task 4.2: Added `setReviewReleaseState()` function, imports `ReviewReleaseState` type, writes `reviewReleaseState: 'locked-review'` during `endFullSession()` |
| `src/pages/TeacherTestMonitorPage.tsx` | Task 4.2: Destructures `setReviewReleaseState`, renders Review Release Control Bar with three-state toggle (Locked/Review/Full) |
| `src/hooks/test/useTeacherEndRedirect.ts` | Task 4.2: Reads session `reviewReleaseState` and passes it through to waiting room navigation state |
| `src/components/test/TestResultsModal.tsx` | Task 4.3: Added `reviewReleaseState` prop, imports `getReleaseVisibility` and `getEffectiveReleaseState`, conditionally renders content based on release tier (locked-review hides correct answers/feedback/scoring, review-released shows answers, feedback-released shows everything) |
| `src/pages/StudentWaitingRoomPage.jsx` | Task 4.3: Added `reviewReleaseState` state, reads initial value from navigation state, sets up live RTDB listener on `game_sessions/{code}/reviewReleaseState`, passes state to both `TestResultsModal` instances |
| `src/pages/StudentTestResultsPage.tsx` | Task 4.4: Added release-state governance — imports visibility helpers, adds `reviewReleaseState` to `TestSession` interface, derives visibility flags from `session.reviewReleaseState`, conditionally gates performance feedback, teacher feedback, correct answers, question scoring colors/text, and per-question feedback. Adds locked-review and review-released banners. |

## Discovered Findings

> **All findings have been moved to [`findings-of-tasks-0040-prd-unified-result-view-architecture-and-governance.md`](findings-of-tasks-0040-prd-unified-result-view-architecture-and-governance.md)**
> per `process-task-list.md` guidelines. New findings are appended to that file.
