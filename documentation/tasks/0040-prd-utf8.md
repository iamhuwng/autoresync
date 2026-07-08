# PRD-0040: Unified Result View Architecture and Governance

> **Status:** Draft v5 (Reassessed against live workflows; verification pack published; writing-toolchain appendix preserved)
> **Created:** 2026-03-24
> **Updated:** 2026-03-24
> **Related Research:** `C:/Users/The Lord/Desktop/component_overlap_analysis.md`
> **Related PRDs:** `0039-prd-test-results-slide-panel.md`, `0016-prd-rbac-security-hardening.md`
> **Related Closure Docs:** `documentation/architecture/changelog/result-view-map.md`, `documentation/architecture/changelog/result-view-permission-matrix.md`, `documentation/rules/result-view-reuse.md`, `documentation/architecture/changelog/result-view-fr-closure-matrix.md`
> **Audience:** Junior developer implementing result-view architecture without inventing new patterns

---

## 1. Introduction / Overview

The app currently shows saved test results through multiple surfaces that overlap in purpose but drift in implementation:
- `ResultSlidePanel` for students
- `ResultDetailModal` for teachers
- `LegacyResultDetailView` through `/result/:resultId` for teacher and `super_admin`

Adjacent result-like surfaces also exist, but they are not the same domain:
- session/post-test views such as `StudentTestResultsPage`, `TestResultsModal`, and `TeacherResultsDashboard`
- guest-result and claim flows such as `GuestResultsPage`, `ProfileCompletionPage`, and `ClaimResultsModal`
- writing workflows spanning drafting, monitoring, grading, writing-result review, and submission-complete handoff
- live monitoring views such as `StudentDetailModal`
- unwired or demo-only components

The goal of this PRD is to create one coherent result architecture that:
- unifies all active saved-result shells behind a shared core
- preserves role- and workflow-specific shells
- prevents future drift through documentation, rules, and review gates
- resolves dead/unwired result components instead of letting them linger
- gives junior developers exact scope boundaries and explicit prohibitions

This is a **master PRD** covering all phases of the program. Only Phase 1 is implementation-locked in exact file scope. Later phases are included now so the program has a complete direction and juniors cannot improvise architecture outside the planned roadmap.

### 1.1 Reassessment Corrections

This draft is amended against the current codebase and must be read as a correction of earlier overreach, not as a blank-slate redesign.
- existing parent-owned entry points and homework/dashboard flows are first-class contracts, not incidental wrappers around the shells
- the current student ownership gap on `/result/:resultId` is a known defect/risk, not a preserved guarantee
- phase 2 is a restriction and release-governance migration over already-permissive live-session review flows, not a missing capability being introduced from zero
- writing remains a separate lifecycle domain, and the deeper writing editing/grading findings are preserved intact in Appendix A for later investigation

### 1.2 Verification Pack

This PRD is now paired with a living verification pack and must not be read in isolation.
- `result-view-map.md` is the canonical surface inventory and domain classifier
- `result-view-permission-matrix.md` records route/app/backend access truth, including mismatches
- `result-view-reuse.md` defines the governance gate for future result-view work
- `result-view-fr-closure-matrix.md` records which FRs are already proven, only partially proven, or still unverified

These artifacts close the static architecture audit for PRD-0040. They do not erase the remaining runtime-proof gap: emulator-backed backend-rule verification and tampering checks still need execution when the local environment can run the Firebase emulators.

---

## 2. Product Vision

### 2.1 What "Unified" Means

For this initiative, "unified" means:
- shared code for the saved-result body and duplicated presentation helpers
- shared core result features across active saved-result shells
- role-specific layout, controls, permissions, and parent workflow ownership preserved in separate shells

It does **not** mean forcing all result-like pages in the app into one loader, one giant component, or one flattened workflow.

### 2.2 Domain Taxonomy

All result-related UI must be classified into one of these domains:

1. **Saved-result domain**
- Displays an existing permanent result record by `resultId`
- Phase-1 canonical shells live here

2. **Session/post-test domain**
- Loads from session state, retries, fallback scoring, or post-submission workflows
- Not merged into the saved-result loader in phase 1

3. **Guest-result/claim adjacency**
- Public or guest listing/claim flows that touch result data but are not phase-1 canonical shells
- Must be mapped explicitly because their storage/read contract is not canonical

4. **Writing domain**
- Uses writing-specific draft, autosave, submission, grading, and result-review primitives across RTDB and Firestore
- Must remain a separate architecture path until explicitly unified inside its own domain
- Only lifecycle-defining constraints belong in the main PRD body; defect-level findings stay preserved in Appendix A or named follow-up tasks until explicitly promoted

5. **Live-monitoring domain**
- Teacher monitoring or live classroom workflows, including writing-monitor operations
- Not part of the saved-result shell/core in phase 1

6. **Unwired/demo domain**
- Not active production architecture or not yet classified as a supported workflow
- Must be explicitly classified and resolved

### 2.3 Active Saved-Result Shells Known Today

The current audit still finds these active saved-result shells:
- `src/components/results/ResultSlidePanel.tsx`
- `src/components/results/ResultDetailModal.tsx`
- `src/components/results/LegacyResultDetailView.tsx`

Important clarifications:
- `src/pages/ResultDetailPage.tsx` is a route wrapper around the full-page shell, not a fourth saved-result shell
- `ResultSlidePanel` is parent-owned by existing student entry points such as academic record, homework, dashboard/notification flows, and attempt switching
- `ResultDetailModal` already carries homework-specific teacher workflow behavior and cannot be reduced to a generic placeholder wrapper
- `LegacyResultDetailView` remains the full-page saved-result shell body for teacher/admin deep links until phase-1 extraction absorbs that body into the shared core

If a fourth active saved-result shell is discovered during the pre-implementation audit, coding must pause until the result-view map and phase-1 scope are updated.

---
## 3. Goals

| # | Goal | Target |
|---|------|--------|
| G1 | Unify all active saved-result shells behind a shared core | Every active saved-result shell renders the same core result body |
| G2 | Preserve role/workflow separation | Student, teacher modal, and teacher/admin page shells remain distinct |
| G3 | Prevent future architecture drift | Result-view map, permission matrix, reuse rule, and review checklist become mandatory |
| G4 | Resolve dead and unwired result components | Each unwired/demo result component is tested, classified, and removed or explicitly retained |
| G5 | Support current team habits without losing structure | PRD baseline plus living docs plus conversation logs/Knowns/Antigravity Knowledge tracking |
| G6 | Give juniors zero room to invent architecture | Exact file scope, phase gates, forbidden moves, and required tests are documented |
| G7 | Keep security intact | Shared presentation stays separate from authorization, routing, and loader contracts |
| G8 | Provide a complete roadmap | This PRD defines phase direction through saved-result, session/post-test, writing, and enforcement work |

---

## 4. User Stories

| # | As a... | I want to... | So that... |
|---|---------|-------------|-----------|
| US-1 | Student | Open a saved result from any supported student entry point and see a consistent core result experience | result features do not drift by entry point |
| US-2 | Teacher | Open saved results in modal or full-page flows and see the same underlying result body | teacher result features stay aligned |
| US-3 | Super admin | View saved results through the full-page shell with additional diagnostics but without creating a separate body implementation | admin power does not cause architecture duplication |
| US-4 | Developer | Know exactly which result surface is canonical before building or changing result features | I do not invent a fourth implementation |
| US-5 | Reviewer | Block result-related changes that bypass the map, matrix, or reuse rule | architecture drift is caught before merge |
| US-6 | Product owner | Add a saved-result feature once and have it appear logically across intended shells | product behavior stays coherent |
| US-7 | Maintainer | Remove dead result components safely with evidence and rollback history | the codebase does not accumulate stale result viewers |
| US-8 | Student in a live teacher-monitored session | See my score and which questions were right or wrong without seeing the correct answers or explanations too early | I still reflect on mistakes while the session is active |
| US-9 | Teacher | Control when live-session students can see review details and later feedback from the monitor workflow | classroom pacing stays intentional |

---

## 5. Functional Requirements

### 5.1 Governance and Living Documentation

| ID | Requirement |
|----|-------------|
| FR-001 | Create `documentation/architecture/changelog/result-view-map.md` as the living structural map for all result surfaces. |
| FR-002 | Create `documentation/architecture/changelog/result-view-permission-matrix.md` as the living access/action matrix for all roles and result shells. |
| FR-003 | Create `documentation/rules/result-view-reuse.md` as the reuse-before-new-view rule for all future result work. |
| FR-004 | The result-view map must classify every known result-related surface as `active`, `legacy`, `unwired`, or `demo-only`. |
| FR-005 | The result-view map must record domain type: saved-result, session/post-test, guest-result/claim, writing, live-monitoring, or unwired/demo. |
| FR-005A | For the writing domain, the result-view map must also record lifecycle role for each active surface: `draft`, `monitor`, `queue`, `editor`, `result`, or `alternate/dormant`. |
| FR-006 | Every future result-related change must update the result-view map and permission matrix in the same change set. |
| FR-007 | Every future result-related deviation from the PRD must also be recorded in the team?s existing change-tracking habit: conversation log in `documentation`, or Knowns, or Antigravity Knowledge. |
| FR-008 | Reviewer guidance must state that a result-related merge is blocked if the map, matrix, and required change record are missing. |
| FR-009 | The reuse rule must require each result-related PRD/task to name the canonical surface, target roles, target entry points, and explicit non-goals before coding starts. |
| FR-010 | The reuse rule must require a usage/import/route/test audit before any component is treated as active migration scope. |

### 5.2 Shared Saved-Result Architecture

| ID | Requirement |
|----|-------------|
| FR-011 | Build one shared saved-result render core used by all active saved-result shells. |
| FR-012 | The shared core must be pure presentation plus shared result-derived display logic; it must not perform permission decisions. |
| FR-013 | The shared core must support common saved-result concerns: score summary, attempt context display, answer review, feedback display, and shared empty/error states. |
| FR-014 | Separate shells must remain for student slide panel, teacher modal, and teacher/admin full-page route. |
| FR-015 | The student shell must preserve student-specific workflow chrome, student-safe actions, and existing parent-owned entry contracts including academic-record query-param opens, homework entry points, dashboard/notification entry points, and attempt switching. |
| FR-016 | The teacher modal shell must preserve teacher homework/context controls, including homework feedback-timing behavior and teacher homework detail entry contracts. |
| FR-017 | The teacher/admin full-page shell must remain the canonical deep-link page shell for non-student result access. `ResultDetailPage.tsx` is a route wrapper around this shell, not a fourth shell. |
| FR-018 | `super_admin` must reuse the teacher/admin full-page shell, not a separate result body implementation. |
| FR-019 | Admin power in this initiative is additive through shell-level diagnostics and safe controls, not through a separate admin body. |
| FR-020 | Risky admin mutation actions are out of scope for this initiative. This includes ownership edit, general metadata edit, raw payload edit, score edit, and answer edit from the result screen. |

### 5.3 Feedback Parity for Saved-Result Shells

| ID | Requirement |
|----|-------------|
| FR-021 | Feedback display parity across active saved-result shells is a phase-1 target state, not an assumption about the current implementation. If feedback exists and the current role/release state allows it, approved shells should render the same core feedback content. |
| FR-022 | Phase-1 feedback generation parity applies only to approved saved-result shells and must be implemented as an explicit contract change. Existing test expectations or workflow restrictions may not be silently overwritten in the name of parity. |
| FR-023 | Feedback generation must dedupe centrally so opening the same result in multiple shells or through multiple parent entry points does not start duplicate jobs. |
| FR-024 | Shells may differ in presentation chrome and approved workflow actions, but the underlying saved-result contract must be documented explicitly rather than inferred from one shell. |
| FR-025 | Admin-only feedback capabilities in this initiative are limited to safe diagnostics and approved trigger/retry actions; no separate admin editing workflow is included. |
| FR-026 | If feedback generation is triggered from the admin-capable page shell, the action must be auditable. |

### 5.4 Utility and Presentation Reuse

| ID | Requirement |
|----|-------------|
| FR-027 | Extract only genuinely duplicated result presentation helpers used by more than one active result surface. |
| FR-028 | Do not create a new helper just to centralize band-score math for this initiative. Reuse must follow the current scoring-configuration path and must not freeze the deprecated `calculateBandScore()` helper into long-term governance. |
| FR-029 | Shared helpers must remain domain-specific and must not absorb session-only, monitoring-only, guest-only, or writing-only logic to inflate consolidation metrics. |

### 5.5 Security and Permission Boundaries

| ID | Requirement |
|----|-------------|
| FR-030 | Authorization remains at the route, shell, or authorized data-hook boundary. |
| FR-031 | Shared presentation must never decide whether a user may access a result. |
| FR-032 | The `/result/:resultId` route and any student redirect or query-param path that opens the same saved result must honor the intended RBAC and ownership contract. The current student ownership gap is a known defect/risk to preserve or fix explicitly, not a behavior to ignore. |
| FR-033 | Student-only controls must never leak into teacher/admin shells. |
| FR-034 | Teacher/admin-only controls must never leak into the student shell. |
| FR-035 | If access is lost while a result is open, the shell must revoke access immediately and show an access-lost state. |
| FR-036 | Consolidation must not broaden database read permissions, introduce new result data paths, or silently normalize adjacent non-canonical paths such as guest-claim storage without explicit security and migration review. |

### 5.6 Unwired, Legacy, and Demo Resolution

| ID | Requirement |
|----|-------------|
| FR-037 | Every unwired or demo-only result component must be tested for actual relevance through imports, routes, lazy imports, tests, and demo references. |
| FR-038 | Each unwired/demo component must be classified as exactly one of: `remove now`, `keep for named future task`, or `convert to documented legacy wrapper`. |
| FR-039 | The default outcome for unwired/demo result components in this initiative is removal unless a named approved future task keeps them. |
| FR-040 | Before removing any result component, the implementer must record a recoverable git version and a removal note in living docs and change logs. |
| FR-041 | Deprecated components may remain only as thin wrappers with a concrete removal gate and target phase. Open-ended deprecation is not allowed. |

### 5.7 Permanent Practice Requirements

| ID | Requirement |
|----|-------------|
| FR-042 | Result-view map and permission matrix become permanent living docs for all result-related work. |
| FR-043 | The implementer updates the map and matrix; the reviewer blocks merge if missing. |
| FR-044 | Every result-related task must declare exact in-scope files, exact out-of-scope files, exact tests, exact docs to update, and exact forbidden moves. |
| FR-045 | Result-related implementation may not begin if the canonical surface is not named. |
| FR-045A | Naming the canonical surface is not enough; each task must also name the existing parent entry points and workflow owners that open or host that surface. |
| FR-045B | When writing-domain findings are attached to this PRD, only lifecycle-defining constraints become main-body requirements. Defect-level findings remain preserved in Appendix A or follow-up tasks until a dedicated writing task promotes them. |

### 5.8 Live-Session Review Release Model

Phase 2 must be treated as a controlled restriction and release-state migration over existing permissive student review flows, not as a net-new review capability.

| ID | Requirement |
|----|-------------|
| FR-046 | Teacher-monitored live-session student results must use a three-state release model: `locked-review`, `review-released`, and `feedback-released`. |
| FR-047 | While the live session is active and no teacher release override is applied, student-facing result surfaces default to `locked-review`. |
| FR-048 | In `locked-review`, student-facing surfaces may show score, percentage/band, correct/incorrect counts, answer-map or question-status indicators, and the student's own submitted answer when available. They must not show the correct answer, AI explanations, teacher feedback, or student-facing feedback-generation controls. |
| FR-049 | Because current result records do not consistently carry question-stem snapshots, phase 2 must not promise question-stem display in `locked-review` unless a later explicit data-contract change adds that snapshot. The default locked-review contract is question number/status plus the student's own answer only. |
| FR-050 | The teacher monitor workflow must own live-session release controls for the current test, including early release during the session and automatic release after the session ends, applied to all submitted students for that current test. |
| FR-051 | All student entry points that can open the same live-session result must respect the same release state, including waiting-room review, dashboard/academic-record cards, and saved-result route/panel entry points. |
| FR-052 | Teacher and admin result surfaces may view explanations and feedback during the live session. The monitor page itself remains operational and does not become the canonical long-form feedback viewer. |
| FR-053 | Unreleased AI feedback, teacher feedback, and explanations must not be written to a student-readable result path. They must remain in a restricted path or remain ungenerated until the release state allows student access. |
| FR-054 | When the teacher ends the live session, student-facing review becomes released automatically. Feedback becomes student-visible only under the approved `feedback-released` contract, and may remain pending if generation has not finished yet. |

---

## 6. Non-Goals (Out of Scope)
| # | Non-Goal | Reason |
|---|----------|--------|
| NG-1 | Forcing session/post-test loaders into the same abstraction as saved-result loaders in phase 1 | Different contracts would create a brittle oversized abstraction |
| NG-2 | Unifying writing-result pages into the same core as saved-result pages in phase 1 | Writing is a distinct domain |
| NG-3 | Adding risky admin editing actions to the result screen | Too much security and data-integrity risk for this initiative |
| NG-4 | Creating a separate admin-only result body | Would duplicate architecture |
| NG-5 | Leaving deprecated or unwired result components in indefinite limbo | The initiative must resolve them |
| NG-6 | Depending on PRD updates alone for ongoing truth | The team already uses logs/Knowns/Antigravity Knowledge, so living docs and change records must coexist |
| NG-7 | Turning every preserved Appendix A writing finding into an immediate normative requirement in this PRD | The main body should capture only the lifecycle/boundary/classification constraints needed to protect the architecture; defect-level follow-up belongs in named tasks |

---

## 7. Design Considerations

### 7.1 Target Architecture Shape

Use a shell-and-core model:
- **Shared core:** saved-result body and result-derived presentation helpers
- **Student shell:** slide-panel shell for student entry points that already own the workflow
- **Teacher modal shell:** teacher contextual/modal shell, including homework-specific hosts
- **Teacher/admin page shell:** full-page shell for deep links and admin-capable access

Adjacent domains keep their own operational contracts unless a later phase explicitly changes them:
- session/post-test surfaces keep session lookup, retry, and fallback scoring behavior
- guest-result/claim surfaces remain mapped and governed, but are not phase-1 migration anchors
- writing work begins from draft, monitor, queue, editor, and result lifecycle analysis, not from the result viewer alone
- live-monitoring surfaces stay operational, not long-form result viewers

### 7.2 Admin-Capable Shell Guidance

Admin must be more powerful without creating a second implementation. In this initiative that means:
- admin may view additional diagnostics inside an `Admin Tools` section of the page shell
- admin may use safe feedback trigger/retry controls where approved
- admin may not edit ownership, arbitrary metadata, scores, answers, or raw payloads from this screen

If later product direction requires corrective admin mutations, that must be a separate audited PRD.

### 7.3 Living Docs Practice

Permanent practice after this PRD:
1. PRD sets baseline scope and constraints.
2. Result-view map records current structural truth.
3. Permission matrix records current access truth.
4. Conversation log or Knowns or Antigravity Knowledge records change rationale.

No single document is sufficient on its own.

### 7.4 Live-Session Student Review Shape

Use the existing result-review vocabulary already present in the codebase instead of inventing a new student live-session artifact:
- current waiting-room and post-test student flows are already permissive; phase 2 intentionally redesigns and restricts them under release-state governance instead of assuming an empty surface
- session loaders stay session-first and keep their own lookup, retry, latest-result, and fallback-scoring behavior instead of collapsing into a plain saved-result `resultId` loader
- the current waiting-lobby flow stays session-first; students remain in the waiting room after submission
- the legacy waiting-lobby modal must be redesigned into a student-safe review surface for live sessions
- the default locked view is not a full rich reader; it is a restricted review surface
- restricted review should reuse stable primitives that already exist in current result flows: score summary, correct/incorrect distribution, answer map or question status pills, and answer-comparison cards that can show the student's own answer
- restricted review must not promise question-stem rendering unless the result data contract is extended to carry question snapshots
- rich explanations, correct answers, AI feedback, and teacher feedback remain outside the locked student view until release

---

## 8. Technical Considerations

### 8.1 Phase-1 Files In Scope

| File | Reason |
|------|--------|
| `src/components/results/ResultSlidePanel.tsx` | Student saved-result shell |
| `src/components/results/ResultDetailModal.tsx` | Teacher modal saved-result shell |
| `src/components/results/LegacyResultDetailView.tsx` | Full-page saved-result shell body to be absorbed into shared core |
| `src/pages/ResultDetailPage.tsx` | Route-backed wrapper for the full-page shell, not a separate saved-result shell |
| Shared child files under `src/components/results/` used by these shells | Needed to extract shared saved-result core |
| Existing tests for the above shells/pages | Required for regression protection |

### 8.1A Regression-Critical Entry Owners

Phase 1 must preserve these working entry owners even when the shared core is extracted:

| File | Reason |
|------|--------|
| `src/pages/AcademicRecordPage.tsx` | Student query-param owner for `ResultSlidePanel` and attempt navigation |
| `src/pages/StudentHomeworkListPage.tsx` | Student saved-result entry point |
| `src/pages/StudentHomeworkDetailPage.tsx` | Student saved-result entry point |
| `src/pages/StudentDashboardPage.jsx` | Student dashboard/notification entry owner for saved results |
| `src/pages/TeacherHomeworkDetailPage.tsx` | Teacher homework detail host for `ResultDetailModal` |
| `src/pages/TeacherStudentHistoryPage.tsx` | Teacher deep-link owner for saved-result route navigation |

### 8.2 Phase-1 Files Explicitly Out of Scope for Loader Unification

| File | Reason |
|------|--------|
| `src/pages/StudentTestResultsPage.tsx` | Session/post-test domain with session-based review and writing-result contracts |
| `src/components/test/TestResultsModal.tsx` | Session/post-test domain with session lookup, retry, and fallback-scoring behavior |
| `src/components/test/StudentDetailModal.tsx` or equivalent live-monitoring file | Live-monitoring domain |
| `src/pages/GuestResultsPage.tsx` | Guest-result/claim adjacency; not a phase-1 saved-result shell |
| `src/pages/ProfileCompletionPage.tsx` | Guest-result claim/recovery workflow |
| `src/components/guest/ClaimResultsModal.tsx` | Guest-result claim workflow |
| `src/pages/TeacherTestResultsPage.tsx` | Adjacent active teacher results route; classify in the map, do not absorb blindly in phase 1 |
| `src/pages/TeacherFeedbackPage.jsx` | Adjacent active feedback route |
| `src/pages/StudentFeedbackPage.jsx` | Adjacent active feedback route |
| `src/pages/StudentResultsPage.jsx` | Adjacent active student results route |
| `src/pages/TeacherGradingPage.tsx` | Writing queue/triage workflow |
| `src/pages/WritingGradingPage.tsx` | Writing grading/editor workflow |
| `src/pages/TeacherTestMonitorPage.tsx` | Live monitoring and writing-monitor workflow |
| `src/components/writing-monitor/WritingPeekModal.tsx` | Writing monitor draft viewer |
| `src/components/writing-results/WritingResultView.tsx` | Writing domain |
| `src/components/writing-results/WritingResultDetailModal.tsx` | Writing domain |
| `src/components/writing-results/WritingTestResultsSection.tsx` | Writing result workflow |
| `src/components/writing-results/StudentResultOverview.tsx` | Unwired; must be classified, not merged blindly |
| `src/components/writing-results/StudentDetailedMarkup.tsx` | Unwired; must be classified, not merged blindly |
| `src/components/writing-grading/WritingGradingModal.tsx` | Alternate/dormant writing grading architecture; classify before reuse or removal |
| `src/pages/FeedbackComponentsDemo.tsx` | Public demo route that writes live app paths; classify explicitly as demo/public risk, not a migration anchor |
| `src/pages/FeedbackDemoPage.tsx` | Demo-only feedback route; not a production migration anchor |
| `src/pages/AcademicRecordDemoPage.tsx` | Demo-only academic-record/result route; not a production migration anchor |
| `src/pages/DemoIndexPage.tsx` | Public demo entry route that exposes demo result/feedback surfaces |

### 8.3 Documentation Deliverables

| File | Purpose |
|------|---------|
| `documentation/architecture/changelog/result-view-map.md` | Permanent result architecture map |
| `documentation/architecture/changelog/result-view-permission-matrix.md` | Permanent role/action matrix |
| `documentation/rules/result-view-reuse.md` | Reuse-before-new-view rule |
| Change record in conversation log and/or Knowns/Antigravity Knowledge | Required rationale trail |

### 8.4 Verification Baseline

The previous four-file audit baseline is no longer sufficient because it misses active parent entry contracts and adjacent release-state behavior.

The minimum regression baseline for phase 1 must cover both the saved-result shells and the parent entry points that already open them, including the teacher-owned hosts and route wrappers that are part of the current contract:

```bash
cmd /c npx vitest run src/components/results/ResultDetailModal.test.tsx src/components/results/ResultSlidePanel.test.tsx src/components/results/LegacyResultDetailView.test.tsx src/pages/ResultDetailPage.test.tsx src/pages/AcademicRecordPage.test.tsx src/pages/StudentDashboardPage.teachers.test.jsx src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/pages/TeacherHomeworkDetailPage.test.tsx src/pages/TeacherStudentHistoryPage.test.tsx src/pages/StudentWaitingRoomPage.test.jsx src/pages/TeacherTestResultsPage.test.tsx --reporter=basic
```

This command, or a stricter equivalent split across multiple runs, must continue to pass after phase-1 work. If implementation intentionally changes any current assertion such as feedback-trigger timing, the task must name that behavior change explicitly before tests are updated.

---

## 9. Phase Plan

## Phase 0: Inventory, Governance, and Scope Lock

### Goal
Establish the permanent operating model before refactoring code, using the current live workflows rather than an abstracted result-view ideal.

### Deliverables
- publish result-view map
- publish result-view permission matrix
- publish result-view reuse rule
- classify every known result surface by domain and status
- perform pre-implementation audit for any additional active saved-result shell
- document the current student ownership gap on `/result/:resultId` as a carried defect/risk or fix it explicitly before implementation depends on it
- classify guest-result/claim flows, teacher/student feedback routes, teacher test results, writing queue/editor/monitor surfaces, and demo/public result surfaces, including the live-path write risk on `FeedbackComponentsDemo`
- decide removal or retention path for all unwired/demo result components

### Acceptance Gate
Phase 1 may not start until:
- all known result surfaces are mapped
- role/action matrix exists
- no uncategorized result component remains
- parent-owned saved-result entry points are named and mapped, not implied
- any newly discovered active saved-result shell has been scoped in or excluded explicitly
- the student ownership gap on `/result/:resultId` is either fixed or explicitly documented as a carried risk

## Phase 1: Saved-Result Unification

### Goal
Unify all active saved-result shells behind one shared core while preserving shell boundaries and the working entry contracts that already host those shells.

### Scope
- all active saved-result shells known at implementation lock
- existing parent-owned student and teacher entry contracts for those shells
- display parity for feedback
- generation parity for missing/failed feedback where explicitly approved
- shared presentation/helper extraction
- no session loader unification
- no guest-result, writing, or live-monitoring loader unification

### Mandatory Deliverables
- shared saved-result render core
- updated student shell
- updated teacher modal shell
- updated teacher/admin page shell
- preserved academic-record, homework, dashboard/notification, teacher-homework, and teacher-student-history entry behavior
- feedback display and approved generation parity across active saved-result shells
- explicit documentation of the route/ownership decision if the current student `/result` gap remains outside phase 1
- updated tests
- updated living docs

### Acceptance Gate
Phase 1 is complete only when:
- every active saved-result shell uses the shared core
- no working entry point has been reduced to placeholder behavior
- parent-owned student and teacher entry points still work across their existing flows
- feedback display parity exists across approved saved-result shells
- approved feedback generation parity for missing/failed feedback exists across those shells
- permission boundaries remain intact
- any continued student ownership gap is documented explicitly rather than implied away by the PRD
- test baseline passes
- living docs and change records are updated

## Phase 2: Session/Post-Test Selective Reuse

### Goal
Restrict and govern the already-permissive session/post-test student review flows, redesign the live-session student review experience, and add teacher-controlled release without forcing session flows into the saved-result loader contract.

### Scope
- `StudentTestResultsPage`
- `TestResultsModal`
- `StudentWaitingRoomPage`
- teacher monitor release controls for the current live-session test
- any adjacent student entry point that can open the same live-session result while the session is still active
- any saved-result route or panel entry path that can surface the same live-session result before release

### Rules
- this phase starts from currently permissive student review behavior; any reduced visibility must be an explicit release-policy change, not an accidental regression
- session loaders stay separate
- retry logic stays local
- fallback scoring stays local
- only proven-safe presentational pieces may be reused
- teacher-monitored live sessions default to `locked-review` for students until release state changes
- the waiting-room result surface is redesigned as a session-first student review surface; it must not remain a generic final-report modal
- because current result payloads do not consistently contain question-stem snapshots, locked student review must use question number/status and the student's own answer only unless a later explicit data-contract change adds question snapshots
- teacher/admin explanations and feedback stay in teacher/admin result surfaces, not in the teacher monitor page itself
- if a common view-model contract is proposed, it must be justified by a dedicated audit inside this phase

### Mandatory Deliverables
- redesigned waiting-room student review surface replacing the current old modal experience
- teacher monitor release controls for current-test student visibility
- release-state enforcement across all student entry points for the same live-session result
- restricted storage/read contract for unreleased explanations and feedback
- explicit migration note for current permissive behavior that is being restricted by release state
- updated tests and living docs for release behavior

### Acceptance Gate
Phase 2 is complete only when:
- reused fragments are pure presentation
- no saved-result loader assumptions leaked into session flows
- while a live session remains locked, students cannot see correct answers, explanations, AI feedback, or teacher feedback from any student entry point
- teacher/admin can still access approved explanations and feedback from teacher/admin result surfaces
- early release and automatic end-of-session release work for the current test and all submitted students
- release-state restrictions are documented as intentional policy, not inferred from regressions
- session-specific behavior still passes tests and manual checks
- living docs reflect the release-state and reuse decisions

## Phase 3: Writing-Domain Architecture

### Goal
Map and formalize the full writing workflow as its own architecture track, from student drafting through monitoring, grading, and writing-result review.

### Scope
- student writing draft, edit, autosave, and submission promotion flows
- writing monitor peek, reopen, and auto-submit flows
- teacher grading queue, grading editor, re-open loop, and writing-result surfaces
- RTDB draft -> Firestore submission seam and alternate/dormant grading-tool classification
- THCS inline writing grading classification
- Appendix A as the preserved investigation baseline for this phase

### Rules
- do not merge writing into the saved-result core
- do not start the writing domain map from `WritingResultView` as if it were the front door
- document the draft artifact, submission artifact, and the bridge between them as separate architecture nodes; do not collapse them into a single result abstraction
- resolve unwired writing components immediately in this phase
- classify each active writing surface as `draft`, `monitor`, `queue`, `editor`, `result`, or `alternate/dormant`
- promote only lifecycle-defining constraints into the normative phase text; keep defect-level findings preserved in Appendix A until they are intentionally turned into named tasks
- keep Appendix A intact until each preserved finding becomes a named task, an accepted current behavior, or a resolved fix
- define active writing canonical shells and writing-specific reuse rules only after the full lifecycle map exists
### Acceptance Gate
Phase 3 is complete only when:
- the active writing lifecycle from draft to result is documented
- monitor, queue, editor, result, and THCS inline variants are classified
- unwired or alternate writing components are removed or explicitly retained by named task
- preserved findings from Appendix A are converted into named tasks or explicit recorded decisions
- writing-role behaviors are documented in living docs

## Phase 4: Enforcement Hardening

### Goal
Strengthen the process so documentation and architecture stay aligned across future changes.

### Scope
- review checklist hardening
- optional automated checks after the living docs format stabilizes
- removal of thin legacy wrappers that have passed their removal gates

### Rules
- automation is added only after the taxonomy and file conventions are stable
- automation must fail the merge when required living-doc updates are missing
- removal of any remaining deprecated wrapper requires tests, docs, and rollback history

### Acceptance Gate
Phase 4 is complete only when:
- legacy wrappers scheduled for removal are either removed or have updated gates
- enforcement process is operating consistently across result-related tasks

## 10. Edge Cases and Required Preventions

| Edge Case | Required Prevention |
|----------|---------------------|
| Same result opened in multiple shells triggers duplicate feedback generation | Central in-flight dedupe and idempotent generation contract |
| Feedback exists in one shell but not another due to stale local state | Shared display contract plus fresh result refresh on shell open |
| Access is revoked while the result is open | Shell immediately removes sensitive content and shows access-lost state |
| Legacy result lacks fields needed by the shared core | Hide unsupported sections gracefully and record compatibility gap in logs/docs |
| Fourth active saved-result shell discovered mid-implementation | Stop coding, update map/scope, then continue |
| Unwired component is referenced only in a forgotten test or demo | Removal audit must include imports, routes, lazy imports, tests, and demo references |
| Deprecated wrapper still has a unique entry point | It cannot be removed until the entry point is migrated or retired |
| Session/post-test page accidentally consumes saved-result loader abstractions | Blocked by forbidden moves and phase boundary rules |
| Student reaches the same saved result through a query-param or redirect owner that bypasses route-level assumptions | Parent owners and data hooks must enforce or explicitly delegate ownership; route protection alone is not enough |
| Guest-result claim flow writes to a non-canonical result path | Classify and document migration/compatibility behavior before consolidation touches guest-result flows |
| Admin-capable shell gains risky edit controls during implementation | Blocked as out of scope unless a new audited PRD approves them |
| Student opens the same locked live-session result through a different student entry point | Every student entry point must obey the same release state before rendering review or feedback |
| Unreleased AI or teacher feedback is written into a student-readable result node | Blocked by restricted storage/read contract and security review |
| Implementer assumes question text exists in result payload during locked review | Locked-review contract must default to question number/status plus student answer only unless snapshot support is explicitly added |
| Session or waiting-room flows are flattened into a plain `resultId` loader | Blocked by session-loader separation and regression tests covering lookup, retry, latest-result, and fallback behavior |
| Public demo result/feedback route is treated as harmless while still writing live application paths | Classify and document it as demo/public risk before reuse, retention, or removal decisions |
| Writing architecture is simplified as a single result-view flow | Blocked by the lifecycle map, cross-store seam requirement, and Appendix A preservation |

---

## 11. Forbidden Moves

The implementer must **not** do any of the following:

1. Create a new result viewer without first updating the result-view map and naming the canonical surface.
2. Merge session/post-test loader logic into the saved-result loader abstraction in phase 1.
3. Treat unwired or demo-only components as production migration anchors without explicit classification.
4. Move permission checks into shared presentational code.
5. Add admin ownership edit, metadata edit, score edit, answer edit, or raw payload edit to the result screen in this initiative.
6. Leave a deprecated component without a concrete removal gate and target phase.
7. Skip living-doc updates because a conversation log exists, or skip change logs because the PRD exists.
8. Start coding if an uncategorized active saved-result shell is discovered.
9. Remove a result component without recorded rollback history and removal notes.
10. Write unreleased AI feedback, teacher feedback, or explanations into a student-readable result node.
11. Promise question-stem rendering in locked live-session review unless the result data contract explicitly stores question snapshots.
12. Treat parent-owned entry pages as disposable wrappers or replace working flows with placeholders during shared-core extraction.
13. Pretend the live-session release model already existed historically and therefore does not need explicit migration notes for currently permissive student review behavior.
14. Start writing-domain architecture from result viewers only while ignoring draft, monitor, queue, grading, audit, or THCS inline workflows.

---

## 12. Success Metrics

| Metric | Target |
|--------|--------|
| Shared saved-result adoption | Every active saved-result shell uses the shared core |
| Entry-point preservation | Academic record, homework, dashboard/notification, teacher-homework, and teacher-student-history entry contracts survive shared-core extraction without placeholder regressions |
| Feedback parity | Active saved-result shells show and can safely trigger feedback under the approved contract |
| Live-session release compliance | Locked student views never expose unreleased correct answers or explanations, and release-state behavior is consistent across student entry points |
| Governance compliance | Every result-related change updates map, matrix, and change record |
| Inventory hygiene | No result component remains uncategorized |
| Dead component reduction | Unwired/demo result components are resolved, not left ambiguous |
| Security preservation | No permission broadening, non-canonical path drift, or cross-role control leakage |
| Writing investigation preservation | Appendix A remains attached to the program until each preserved writing finding is resolved or tracked |
| Junior implementation safety | Phase scope, file scope, tests, and forbidden moves are explicit |

---

## 13. Open Questions

No blocking product questions remain for phase 1 saved-result unification, but the reassessment leaves explicit follow-up investigation items that must stay attached to the program:
- whether phase 1 also fixes the current student ownership gap on `/result/:resultId` or carries it as documented risk into later work
- how guest-result claim storage is normalized or compatibility-mapped without breaking current claim/recovery flows
- the exact release migration plan for currently permissive live-session review surfaces
- which preserved Appendix A writing findings become separate fixes before the full phase-3 architecture task starts
- how public/demo feedback routes are classified or removed once the living docs are published

Future work that would require a new or amended PRD:
- risky admin corrective actions from the result screen
- export workflows from result pages
- automated CI enforcement details after living-doc format stabilizes

---

## 14. Final Recommendation

Proceed with this program in order:
1. inventory and governance first, including parent entry points, guest-result adjacency, and writing workflow boundaries
2. saved-result unification second
3. session/post-test selective reuse and release-state restriction third
4. writing-domain architecture fourth, using Appendix A as preserved investigation input
5. enforcement hardening last

This sequencing gives the app a complete long-term direction while keeping phase-1 implementation narrow, safe, and concrete. It also matches your requirement that juniors have almost no room to imagine missing architecture for themselves.

---

## Appendix A. Preserved Writing Toolchain Findings

This appendix preserves the deeper writing editing/grading workflow findings intact so later context compaction does not erase them before the dedicated writing-domain pass. These items are preserved investigation input for phase 3, not automatic main-body requirements.

1. The active writing workflow starts at a teacher grading queue, not at a result viewer. The live route goes through `TeacherGradingPage`, which loads `writing_submissions` by `markingStatus === 'pending-review'` and triages by source, format, word count, test title, and integrity/paste signals. The architecture must not start from `WritingResultView` as if it were the front door.
2. The active "draft" grading path is not actually a draft path. In `WritingGradingPage`, autosave and `Save Draft` both call `updateGrading()`, and that service writes `markingStatus: 'graded'`. A submission can leave the pending queue before explicit grading submission.
3. The student submit path has a last-edit loss race. `WritingTestPage` calls `flushPendingSave()`, but `useWritingAutoSave` does not await the RTDB write before `writingSubmissionService` snapshots RTDB into the Firestore submission. Final keystrokes can be dropped from the artifact the teacher grades.
4. Writing is a cross-store lifecycle, not a normal saved-result shell. Draft/edit/autosave live in RTDB; submit materializes Firestore `writing_submissions` plus only a slim RTDB index; student results then re-fetch Firestore by session/student. Treating writing as "another result shell" is structurally wrong.
5. The writing monitor path is an active teacher control loop before any final result exists. `TeacherTestMonitorPage` switches into writing-session mode, renders `WritingMonitorCard`, supports `Peek` and `Reopen`, and auto-submits unfinished drafts. The architecture must account for this operational path.
6. The monitor and grading/result paths use different artifacts. `WritingPeekModal` streams live RTDB draft text; grading pages consume Firestore submissions; result pages consume the Firestore submission via a bridge. That seam is central to the writing architecture and cannot be hand-waved away.
7. Several metadata fields the grading/result tools rely on are not durably persisted by the live editor. The submission path expects activity time, paste attempts, elapsed time, and related integrity signals, while the student editor flow primarily persists essay text and active task. The grading UI still displays those signals, which makes the workflow more fragile than the current PRD implied.
8. The tab-switch monitoring contract is incomplete. The autosave hook exposes tab-switch recording, and monitor cards display tab switches, but task switching in `WritingTestPage` does not record them. Workflow assumptions already span editor and monitor components.
9. The teacher feedback/editing loop is bidirectional, not terminal. Submitting grades notifies students, but graded work can be reopened from `WritingResultDetailModal` back into the same grading editor. The result modal is not just an end-state viewer.
10. The audit trail workflow is underimplemented. The editor and result modal render `auditTrail`, and the types expect structured regrade reasons, but the live save path does not append audit entries. The PRD must treat this as a real workflow gap, not a completed capability.
11. There are two materially different grading-tool architectures, and the PRD must classify them rather than blurring them together. The canonical route uses `WritingGradingPage` with `AnnotatedEssayRenderer`, `AnnotationToolbar`, `FeedbackPanel`, `CategoryManager`, and `GradingAuditTrail`. Separately, `WritingGradingModal` and its related stack form a richer alternate or dormant toolchain with `EssayEditor`, `CommentSidebar`, `QuickCommentsDialog`, `CorrectionPopup`, `TabbedFeedbackEditor`, local draft recovery, and separate audit handling.
12. THCS inline writing grading is a separate operational workflow and should not be blurred into IELTS writing. `InlineWritingGrader` is mounted from `TeacherTestMonitorPage` only for THCS sessions and writes directly into live session result state.