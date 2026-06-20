# PRD 0061: Reading V2 Runtime Visual Alignment

Status: Draft child PRD - implementation blocked pending Task 1.11 parent acceptance, Task 1.12 approval/HARD STOP, Task 3 shared-authoring stability, dedicated Reading V2 runtime tests, and product-owner review
Created: 2026-06-20
Task number: 0061
Parent PRD: `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
Parent task: Task 1.7 Reading V2 runtime visual-alignment child-PRD portion only

## Source References

This child PRD is governed by:

- `AGENTS.md`
- `DESIGN.md`
- `documentation/tasks/create-prd.md`
- `documentation/tasks/process-task-list.md`
- `tasks/0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/0056-prd-listening-upload-worker-security-gate-s0.md`
- `tasks/0057-prd-listening-authoring-draft-publish-version-behavior.md`
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`
- `tasks/0059-prd-listening-solo-homework-runtime-alignment.md`
- `tasks/0060-prd-listening-live-session-authority-runtime-load-test-plan.md`
- `documentation/architecture/ielts-reading-v2-listening-unification.md`
- `documentation/architecture/reading-v2-runtime-integrations.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-runtime-v1-parity-verification-notes.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-ui-port-audit.md`
- `documentation/tasks/PRD0048/reading-v2-trusted-submit-backend-decision.md`
- `documentation/tasks/PRD0048/reading-v2-review-and-assessment.md`
- `documentation/tasks/PRD0048/reading-v2-result-feedback-integration.md`
- `src/services/reading-v2/readingV2TaskComponentContracts.service.ts`
- `src/services/reading-v2/readingV2TaskComponentContracts.service.test.ts`
- `documentation/rules/student-mobile-design.md`
- `documentation/rules/student-data-loading.md`
- `documentation/rules/mobile-portability.md`
- `documentation/rules/observability.md`
- `documentation/rules/announcements.md`

## Clarification Handling

The user prompt, PRD-0055 approved decisions, current architecture documents, PRD-0048 runtime contracts, prior child PRDs, current source, and current tests are treated as clarification answers. No unanswered question blocks creation of this planning document. Remaining implementation choices are recorded under Open Questions with defaults and stop conditions.

This packet creates planning documentation only. It does not authorize or implement source, tests, runtime behavior, projections, Firebase, routes, deployment, traceability work, or Task 1.8 implementation.

## 1. Introduction / Overview

Reading V2 already has a projection-bound student runtime with separate desktop/tablet and phone presentations, task-type rendering, answer persistence, review-before-submit, timer/lifecycle integration, trusted submission, result compatibility, mobile utilities, and host-level launch/return behavior.

The current runtime is also concentrated in large files:

- `ReadingV2RuntimeShell.tsx`: 3,408 lines
- `ReadingV2RuntimeShell.css`: 2,022 lines
- `ReadingV2RuntimeShell.test.tsx`: 1,385 lines

Visual alignment must improve coherence, accessibility, responsive behavior, and maintainability without turning a presentation packet into a runtime rewrite.

This child PRD defines:

- exact runtime and host boundaries;
- preserved projection, answer, submit, scoring, result, review, feedback, audit, and navigation contracts;
- desktop/tablet and phone visual contracts;
- neutral shared-presentation eligibility;
- owned and protected files;
- bounded module homes and facade limits;
- large-file comprehension maps and size budgets;
- characterization, mutation, browser, rollout, rollback, acceptance, regression, risk, and stop-condition requirements.

Central rule:

> Align Reading V2 runtime presentation without changing what data the runtime accepts, who owns platform behavior, how answers are submitted, how results are produced, or where users launch and return.

## 2. Goals

1. Preserve `ReadingV2RuntimeShell` as the projection-bound Reading V2 renderer and answer collector.
2. Improve visual consistency across non-live, homework/course, and live Reading V2 launches.
3. Preserve desktop/tablet two-column and phone passage-first interaction contracts.
4. Preserve passage, task-group, task-type, answer, review, submit, timer, lifecycle, and result behavior.
5. Preserve host ownership in `StudentPracticePage` and `TestPageRouter`.
6. Preserve exact non-live and live projection paths and rejection rules.
7. Preserve accessibility semantics, keyboard behavior, focus restoration, screen-reader structure, and 44px mobile targets.
8. Prevent visual work from changing projection, submission, scoring, result, feedback, audit, anti-cheat, trusted-submit, or navigation contracts.
9. Reduce future large-file growth through bounded Reading V2-owned presentation seams.
10. Permit neutral shared assessment presentation only after authoring stability and a real two-consumer contract are proven.
11. Define reproducible characterization, mutation, browser, rollout, and rollback evidence.
12. Keep Listening, authoring, parser/import normalization, Firebase, routes, and deployment out of scope.

## 3. User Stories

1. As a student, I want Reading V2 to look and behave consistently whether launched from homework, course material, library practice, or a live session.
2. As a desktop student, I want passage and questions visible in a stable two-column exam layout with predictable navigation.
3. As a phone student, I want a passage-first layout with a reachable Questions action and accessible question sheet.
4. As a keyboard user, I want every runtime control, dialog, menu, question, answer, and review action reachable with visible focus.
5. As a screen-reader user, I want passage, navigation, answer, status, dialog, and review regions named and announced correctly.
6. As a student switching viewport size, I want answers, active passage/question, review state, and scroll context preserved.
7. As a student submitting, I want review-before-submit and failure recovery to preserve my answers.
8. As a teacher launching a live test, I want the existing timer, anti-cheat, trusted-submit, integrity, result, and return flow unchanged.
9. As a product owner, I want visual alignment to be independently revertible without data migration or contract rollback.
10. As a junior developer, I want exact owned files, protected contracts, module homes, line budgets, tests, browser scenarios, and stop conditions.

## 4. Functional Requirements

### Runtime Boundary And Accepted Data

FR-001. `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx` must remain the Reading V2 projection-bound runtime shell.

FR-002. The runtime must accept only runtime-safe Reading V2 derived projections through the existing runtime boundary.

FR-003. Non-live launch must preserve:

```text
reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}
```

FR-004. Live launch must preserve:

```text
reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}
```

FR-005. Visual alignment must not add fallback reads from canonical drafts, owner metadata, packaged material records, legacy V1 test rows, or flat-question payloads.

FR-006. The runtime must continue rejecting:

- canonical drafts;
- packaged materials;
- unsupported or invalid projections;
- review or analytics projections;
- unsupported schema versions;
- legacy flat-question payloads.

FR-007. Rejection must remain fail-closed before renderer selection.

FR-008. Invalid-projection presentation may be visually aligned, but its acceptance/rejection decision must remain service-owned.

### Passage, Task-Type, And Answer Rendering

FR-009. Passage rendering must preserve source-backed content, paragraph-label behavior, Markdown/rich-content behavior, structured table/flowchart/diagram stimuli, and safe anchor context.

FR-010. Task-group rendering must preserve:

- stable `taskGroupId`;
- stable `interactionId`;
- visible `displayNumber`;
- source-backed instructions;
- task-group ranges;
- group word limits;
- option-set identity;
- layout hints already supported by current projections.

FR-011. Every currently supported Reading V2 task type must remain renderable.

FR-012. Binary-judgement vocabulary must remain task-type correct and must not be visually normalized across TFNG and YNNG.

FR-013. Choice, matching, completion, summary, note, table, flowchart, diagram, and other supported families must preserve current answer shapes.

FR-014. Visual components must not convert scalar answers to arrays, arrays to scalars, option IDs to labels, or labels to option IDs.

FR-015. Answer state must remain keyed by stable interaction identity.

FR-016. Answer persistence and rehydration must remain remount-safe.

FR-017. Switching passages, sections, task groups, question layers, review state, or viewport presentation must not clear or remap answers.

FR-018. Phone question-sheet scrolling and passage scrolling must remain scoped to their current contexts.

### Submit, Review, Scoring, And Results

FR-019. Review-before-submit must remain part of the runtime flow.

FR-020. Review must preserve answered/unanswered state by visible question number and stable interaction identity.

FR-021. Review open/close must preserve focus return to the triggering control.

FR-022. Async submit must remain locked against duplicate confirmation while pending.

FR-023. Submit failure must preserve answers and review context and expose an accessible failure message.

FR-024. Browser submit payloads must continue containing only projection-bound client-safe fields:

- `projectionId`;
- `sourceSnapshotVersionId`;
- `materialId`;
- answer rows with `interactionId`, `taskGroupId`, visible/display number, and value;
- optional `integrityReport`;
- host-owned platform context.

FR-025. Visual alignment must not add answer keys, scoring rules, canonical content, browser-calculated score, or review truth to the browser submit payload.

FR-026. Trusted scoring must remain backend-owned and snapshot-bound.

FR-027. Result persistence, existing result indexes, grouped review payload, release-policy sanitation, append-only regrade artifacts, and existing review/feedback shells must remain compatible.

FR-028. Visual alignment must not create a standalone Reading V2 result route, review page, or feedback store.

FR-029. AI-feedback integration must continue consuming saved `result.readingV2.reviewPayload`; it must not reconstruct Reading V2 context from legacy V1 rows.

FR-030. Existing Reading V2 audit contracts and audit paths must remain unchanged.

### Host Ownership

FR-031. `src/pages/StudentPracticePage.tsx` must remain host owner for non-live Reading V2 launch, settings, anti-cheat configuration, trusted-submit handoff, result transition, and return routing.

FR-032. `src/pages/TestPageRouter.tsx` must remain host owner for live Reading V2 launch, game-session context, timer/lifecycle state, anti-cheat configuration, integrity refresh, trusted-submit handoff, and waiting/result transition.

FR-033. `ReadingV2RuntimeShell` may render host-provided state and invoke host callbacks; it must not infer route destinations or platform context from projection content.

FR-034. Timer duration, start time, pause/running state, expiry behavior, and force-submit token must remain host-provided lifecycle inputs.

FR-035. Anti-copy/paste containment, fullscreen/integrity hooks, integrity flush, `integrityReport`, and live integrity refresh must remain host-owned.

FR-036. Trusted-submit endpoint configuration and authentication must remain host/service-owned and fail closed when unavailable.

FR-037. Return navigation must remain host-owned:

- homework returns to student homework;
- class/course material returns to owning course detail;
- solo/public/private library launches return to student library;
- live submit follows the existing waiting/result handoff.

FR-038. Visual alignment must not use `window.history.back()`, direct `useNavigate()`, or projection-derived route guesses.

### Desktop And Tablet Presentation

FR-039. Desktop and tablet must preserve the two-column exam contract:

- passage/stimulus column;
- resizable divider where currently supported;
- grouped question column;
- section/part navigation;
- question navigation;
- timer and submit controls;
- status/lifecycle presentation.

FR-040. Visual changes must improve scan order, spacing, hierarchy, focus visibility, and responsive containment without changing task order or answer semantics.

FR-041. Passage and question columns must remain independently usable at supported tablet widths.

FR-042. Structured content may scroll only inside intentional owned containers; the page must not gain unintended horizontal overflow.

FR-043. Long titles, section labels, task instructions, option labels, and status copy must wrap or truncate without covering controls.

### Phone Presentation

FR-044. Phone must preserve the passage-first contract:

- compact runtime header;
- timer and submit access;
- passage/section navigation;
- floating or fixed Questions action;
- bottom-sheet question surface;
- question-number navigation;
- full-screen or viewport-safe pre-submit review.

FR-045. Phone must not force desktop split view.

FR-046. Question sheet, overflow menu, mobile utility panel, and review dialog must preserve Escape behavior and focus restoration.

FR-047. Visible phone controls must meet a minimum 44px by 44px target.

FR-048. Phone input text must remain readable without browser zoom.

FR-049. Safe-area insets must keep floating, fixed, sheet, review, and submit controls reachable.

FR-050. Orientation or viewport-width changes must not create a second answer state or clear the existing state.

FR-050A. Phone layout selection must preserve the current rendered-layout contract keyed by runtime layout state, including the `[data-layout="phone"]` CSS boundary. Visual alignment must not replace it with conflicting ad hoc width checks.

### Accessibility

FR-051. Existing region names and semantic landmarks must remain stable unless an accessibility test proves an improved replacement.

FR-052. Passage, runtime header, question panel, question navigator, review, mobile menu, dialogs, and status regions must retain accessible names.

FR-053. Icon-only controls must have stable accessible names.

FR-054. Status, success, warning, loading, and failure states must use the shared semantic rules:

- `role="status"` for success, info, warning, and non-blocking progress;
- `role="alert"` for failures requiring immediate attention.

FR-055. State must not be communicated by color alone.

FR-056. Keyboard order must follow visual/task order.

FR-057. Focus must never be lost behind a closed menu, sheet, dialog, utility panel, or review surface.

FR-058. New motion must be subtle and respect reduced-motion preferences.

### State Continuity

FR-059. Mobile/desktop presentation changes must preserve:

- answer values;
- active section;
- active task group;
- active interaction;
- review state;
- passage font size;
- answer persistence key;
- submit phase;
- lifecycle lock state.

FR-060. Viewport switching must not trigger a submit, autoscore, result write, route change, or answer reset.

FR-061. Reload must preserve current answer persistence behavior and host rehydration behavior.

FR-062. Visual alignment must not introduce a new storage key, storage technology, or persistence schema.

### Neutral Shared Assessment Presentation

FR-063. Runtime visual alignment may use existing neutral shared assessment primitives only when their current prop contract fits without runtime ownership leakage.

FR-064. A new neutral shared runtime presentation primitive is allowed only when:

1. Reading V2 and one named second assessment consumer need the same semantic and accessibility contract;
2. both consumers are implemented in the same pull request or explicitly named adjacent pull requests;
3. existing authoring shared primitives are stable under focused tests;
4. the primitive accepts presentation props and callbacks only;
5. the primitive has no Reading V2 or Listening imports;
6. the primitive does not branch on skill, module, projection, route, session, or storage state.

FR-065. Shared components must not own or receive:

- passages or passage models;
- projection objects or projection paths;
- answers or answer persistence;
- timers or force-submit authority;
- submit payload construction;
- scoring or result payloads;
- anti-cheat or integrity telemetry;
- trusted-submit transport;
- route or return navigation;
- live-session state;
- Listening audio or teacher authority.

FR-066. Shared components may own only neutral:

- heading and copy slots;
- generic action slots;
- visual status semantics;
- layout and spacing;
- accessible dialog/menu/surface presentation;
- generic loading/error/empty/ready/blocked visuals.

FR-067. No shared extraction may be justified only by similar appearance.

FR-068. If the two-consumer proof is absent, presentation stays Reading V2-owned.

### Portability, Observability, And Announcements

FR-069. New runtime presentation code must not introduce direct `window.innerWidth` or `window.matchMedia()` layout decisions.

FR-070. New code must not introduce direct `useNavigate()`, raw `window.location`, or browser-back routing.

FR-071. New code must not introduce `dangerouslySetInnerHTML`; existing rich content must continue through the approved rendering abstraction.

FR-072. Existing runtime action telemetry must remain host- or feature-owned.

FR-073. Visual-only refactors must not rename existing action events without an observability migration approved in a separate packet.

FR-074. Submit success/failure, exit, review, mobile tool actions, and runtime diagnostics must remain behaviorally equivalent.

FR-075. No new one-off banner, `alert()`, or silent action outcome may be introduced.

FR-076. Existing inline blocking states and runtime status regions may be restyled only if their semantics and recovery actions remain intact.

## 5. Non-Goals / Out Of Scope

This child PRD does not authorize:

1. Listening imports, behavior, styling ownership, audio, headphones, or teacher monitor work.
2. Shared Reading/Listening runtime state.
3. Parser or import-normalization changes.
4. Projection schema, projection kind, projection ID, storage path, or read-plan changes.
5. Canonical draft, snapshot, packaged-material, or publication changes.
6. Scoring-rule or result-payload changes.
7. Trusted-submit endpoint, authentication, backend, payload, or processor changes.
8. Anti-cheat, integrity telemetry, fullscreen, copy/paste, or force-submit changes.
9. Route, launch, waiting-room, result, or return-navigation changes.
10. Authoring or preview work.
11. Firebase rules, indexes, data nodes, or deployment.
12. Cloudflare Worker or Functions changes.
13. AI-feedback storage or prompt reconstruction changes.
14. Audit path, event shape, or admin-monitor changes.
15. A universal assessment runtime abstraction.
16. A shared answer-input abstraction.
17. Speculative component extraction.
18. A new student shell or mobile-only route.
19. A standalone Reading V2 result/review product.
20. Traceability-matrix creation or Task 1.8 implementation.

## 6. Verified Current Baseline

### Runtime And Host Baseline

- `ReadingV2RuntimeShell.tsx` renders derived Reading V2 projections and collects answers.
- `StudentPracticePage.tsx` hosts non-live Reading V2.
- `TestPageRouter.tsx` hosts live Reading V2.
- Hosts provide timers, lifecycle locks, force-submit tokens, launch context, anti-cheat/integrity behavior, submit handoff, results, and routing.
- The runtime exposes `onSubmit`, `onExit`, `onAnswersChange`, timer, lifecycle, persistence, and runtime-action boundaries.

### Projection Baseline

- `readingV2RuntimeBoundary.service.ts` accepts runtime-safe projections and rejects canonical drafts and non-runtime projection classes.
- `readingV2Projection.service.ts` produces student-safe and session-safe projections with stable IDs and sanitized content.
- Non-live and live paths are namespaced and version-bound.
- Legacy V1 launches remain on the V1 interface without probing Reading V2 storage.

### Runtime Presentation Baseline

- Desktop/tablet renders a V1-like two-column runtime.
- Phone renders a passage-first runtime with bottom-sheet questions.
- Mobile overflow provides review, text size, and instructions.
- Review is an accessible modal surface.
- Phone question selection, passage scroll, question-sheet scroll, answer state, focus restoration, and safe-area CSS have focused tests.

### Submission And Result Baseline

- Browser submission is projection-bound and client-safe.
- Trusted backend validates bindings and scores from canonical published data.
- Existing result consumers receive compatible saved result records and indexes.
- Reading V2 review uses grouped, result-bound review payload.
- Release policy can hide score, answer keys, and explanations.
- Regrade artifacts are append-only.

### Current File Sizes

| File | Current lines | Current role | Packet classification |
| --- | ---: | --- | --- |
| `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx` | 3,408 | rendering, state, navigation, review, lifecycle presentation | owned large facade; map required |
| `src/components/reading-v2/runtime/ReadingV2RuntimeShell.css` | 2,022 | runtime visual and responsive rules | owned large stylesheet; map required |
| `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx` | 1,385 | runtime characterization and behavior tests | owned large test; map required |
| `src/components/reading-v2/runtime/ReadingV2RuntimeShell.mobile-css.test.ts` | 31 | phone CSS contract | owned focused test |
| `src/components/reading-v2/runtime/ReadingV2MobileUtilities.tsx` | 136 | mobile text-size and instruction dialogs | conditionally owned |
| `src/components/reading-v2/runtime/ReadingV2MobileUtilities.test.tsx` | 60 | mobile utility semantics | conditionally owned |
| `src/components/reading-v2/runtime/task-type-components/ReadingV2TaskTypeComponents.tsx` | 145 | bounded task-type presentation helpers | conditionally owned |
| `src/pages/StudentPracticePage.tsx` | 1,021 | non-live host | protected host |
| `src/pages/StudentPracticePage.test.tsx` | 2,009 | non-live host integration | protected regression anchor |
| `src/pages/TestPageRouter.tsx` | 739 | live host | protected host |
| `src/pages/TestPageRouter.test.tsx` | 543 | live host integration | protected regression anchor |
| `src/services/reading-v2/readingV2ResultAdapter.service.ts` | 1,135 | scoring/result/review compatibility | protected service |
| `src/services/reading-v2/readingV2ResultAdapter.service.test.ts` | 1,058 | result compatibility proof | protected regression anchor |
| `src/services/reading-v2/readingV2TaskComponentContracts.service.ts` | 298 | canonical task-type/answer-surface contract matrix | protected service |

## 7. Target Runtime Presentation Contract

The target keeps one Reading V2 runtime state and two responsive presentations:

```text
host context
  -> runtime-safe projection
  -> ReadingV2RuntimeShell state/orchestration
  -> desktop/tablet presentation OR phone presentation
  -> same answers/review/submit boundary
```

Rules:

1. Projection and host props remain the only runtime inputs.
2. Responsive presentation may select layout, not data authority.
3. Task-type rendering remains Reading V2-owned.
4. Answer state remains single-source within the runtime attempt.
5. Review and submit operate on the same stable answer records regardless of layout.
6. Host callbacks remain unchanged unless a separately approved contract migration exists.
7. Visual state must not become persisted domain state.

## 8. Visual Alignment Principles

1. Academic exam clarity over decorative treatment.
2. Tonal layers, borders, spacing, and typography before shadow or motion.
3. Stable scan order and predictable action placement.
4. No gradients, glassmorphism, hover lift, emoji navigation, or marketing-style hero treatment.
5. No nested-card proliferation.
6. No fake controls for unsupported capabilities.
7. No color-only status.
8. No visual change that hides task instructions, word limits, passage context, answer state, or submit state.
9. Existing V1 parity references remain bounded visual references, not permission to import legacy runtime logic.
10. Intentional deviations from the V1 reference require written reason and browser evidence.

## 9. File Architecture And Facade Limits

### Allowed Module Homes

Reading V2-owned runtime presentation code may live only under:

```text
src/components/reading-v2/runtime/
src/components/reading-v2/runtime/presentation/
src/components/reading-v2/runtime/task-type-components/
```

Neutral shared presentation may live under:

```text
src/features/assessment/shared/components/
```

only after FR-064 is proven.

### Facade Rules

`ReadingV2RuntimeShell.tsx` remains the public runtime facade. It may own:

- runtime prop contract;
- projection-bound orchestration;
- answer-state coordination;
- active section/task/question coordination;
- submit/review orchestration;
- lifecycle presentation coordination;
- composition of Reading V2-owned presentation components.

It must not gain:

- host routing;
- projection loading;
- anti-cheat hooks;
- trusted transport;
- scoring;
- result persistence;
- feedback loading;
- audit writes;
- Listening behavior.

### Extraction Rules

Extraction is allowed only when all are true:

1. characterization tests cover the current seam;
2. extracted responsibility is coherent and named;
3. extracted props do not expose full projection or host objects unless the component is the existing runtime facade;
4. extraction reduces facade responsibility or stylesheet coupling;
5. no duplicate state owner is created;
6. no behavior change is hidden inside a visual move;
7. before/after line counts and responsibility deltas are recorded.

No file is created merely to satisfy a target module map.

## 10. Size Budgets

Future implementation must use these budgets:

| File category | Target | Hard limit without approved exception |
| --- | ---: | ---: |
| New runtime presentation component | 200 lines | 300 lines |
| New runtime hook/helper | 150 lines | 250 lines |
| New focused component test | 250 lines | 400 lines |
| New CSS module/section file | 300 lines | 450 lines |
| New neutral shared primitive | 150 lines | 220 lines |

Existing large-file rules:

- no new domain algorithm may be appended to a file already above 800 lines;
- `ReadingV2RuntimeShell.tsx` must not grow in net lines across the completed implementation unless an approved exception proves why extraction is riskier;
- `ReadingV2RuntimeShell.css` must not grow in net lines across the completed implementation;
- `ReadingV2RuntimeShell.test.tsx` may grow only for characterization before a split, and the completed implementation must move focused new coverage into bounded test files where practical;
- every touched large file requires before/after line counts and a responsibility delta.

## 11. Required Large-File Maps

Before implementation touches a mapped file, create or update a map under:

```text
tasks/large-file-maps-0055/reading-v2-runtime/
```

Required maps:

1. `ReadingV2RuntimeShell.tsx.md`
2. `ReadingV2RuntimeShell.css.md`
3. `ReadingV2RuntimeShell.test.tsx.md`
4. `StudentPracticePage.tsx.md` only if that protected host is proposed for touch
5. `StudentPracticePage.test.tsx.md` only if that protected host test is proposed for touch
6. `readingV2ResultAdapter.service.ts.md` only if a discovered visual dependency proposes touching the protected result service; such a proposal is otherwise a stop condition
7. `readingV2ResultAdapter.service.test.ts.md` under the same stop condition

Each map must contain:

- current line count;
- imports and dependency direction;
- top-level types/functions/components;
- state/effect/ref ownership;
- render regions;
- CSS selector groups or test fixture groups;
- public props/exports;
- touch regions;
- protected regions;
- current characterization tests;
- proposed seam;
- before/after responsibility;
- expected line delta;
- rollback boundary.

## 12. Decomposition Seams

These are allowed seams, not mandatory file-creation instructions:

1. runtime state/status presentation;
2. desktop/tablet header and action presentation;
3. phone header and overflow presentation;
4. passage/stimulus pane presentation;
5. grouped question panel presentation;
6. question navigator presentation;
7. pre-submit review presentation;
8. mobile question-sheet presentation;
9. responsive CSS sections;
10. task-type-specific presentation already bounded under `task-type-components`.

Protected orchestration that must not be split casually:

- answer identity and answer-state writes;
- projection validation;
- submit-payload construction;
- timer/force-submit effects;
- lifecycle locks;
- host callbacks;
- result/scoring integration.

## 13. Exact Owned Files

Future implementation may own:

- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.css`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx`
- `src/components/reading-v2/runtime/ReadingV2RuntimeShell.mobile-css.test.ts`
- `src/components/reading-v2/runtime/ReadingV2MobileUtilities.tsx`
- `src/components/reading-v2/runtime/ReadingV2MobileUtilities.test.tsx`
- `src/components/reading-v2/runtime/task-type-components/ReadingV2TaskTypeComponents.tsx`
- focused new Reading V2 runtime presentation files under the allowed module homes;
- focused new Reading V2 runtime tests under the same runtime tree;
- neutral shared presentation files only after FR-064 approval.

Ownership means visual implementation authority only. It does not override protected behavior in those files.

## 14. Exact Protected Files And Contracts

### Protected Host Files

- `src/pages/StudentPracticePage.tsx`
- `src/pages/StudentPracticePage.test.tsx`
- `src/pages/TestPageRouter.tsx`
- `src/pages/TestPageRouter.test.tsx`

Default: no modification. A host test may be extended only to characterize unchanged integration. A host implementation touch requires a written proof that visual alignment cannot be completed through existing props and must not change route, launch, timer, anti-cheat, submit, result, or return behavior.

### Protected Projection And Boundary Files

- `src/services/reading-v2/readingV2RuntimeBoundary.service.ts`
- `src/services/reading-v2/readingV2RuntimeBoundary.service.test.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `src/services/reading-v2/readingV2Projection.service.test.ts`
- `src/services/reading-v2/readingV2TaskComponentContracts.service.ts`
- `src/services/reading-v2/readingV2TaskComponentContracts.service.test.ts`

No schema, path, kind, sanitization, ID, source binding, task taxonomy, answer-surface contract, or rejection change is allowed.

### Protected Submission Files

- `src/services/reading-v2/readingV2RuntimeSubmission.service.ts`
- `src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts`
- `src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.ts`
- `src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.test.ts`

No payload, endpoint, auth, ownership validation, persistence order, or trusted-submit change is allowed.

### Protected Result, Review, And Scoring Files

- `src/services/reading-v2/readingV2ResultAdapter.service.ts`
- `src/services/reading-v2/readingV2ResultAdapter.service.test.ts`
- `src/services/reading-v2/readingV2Result.service.ts`
- `src/services/reading-v2/readingV2Result.service.test.ts`
- `src/services/reading-v2/readingV2Scoring.service.ts`
- `src/services/reading-v2/readingV2Scoring.service.test.ts`

No score, result, index, release-policy, review-payload, feedback, regrade, or persistence change is allowed.

### Protected Boundary Test

- `src/__tests__/readingV2BoundaryImports.test.ts`

This test may be strengthened only to block newly discovered forbidden dependencies. It must not be weakened, skipped, or narrowed.

### Protected External Contracts

- non-live and live projection paths;
- host-owned timer and lifecycle;
- anti-cheat and integrity telemetry;
- trusted submit;
- result and review compatibility;
- AI-feedback payload;
- audit path `reading_v2/audit_events/{eventId}` and event contracts;
- return navigation;
- legacy V1 routing separation;
- Listening runtime and authoring boundaries.

Protected integration owners and regression anchors include:

- `src/services/reading-v2/readingV2LaunchIntegration.service.ts`
- `src/services/reading-v2/readingV2LaunchIntegration.service.test.ts`
- `src/services/reading-v2/readingV2AuditTrail.service.ts`
- `src/services/reading-v2/readingV2AuditTrail.service.test.ts`
- `src/services/resultFeedbackPayload.service.ts`
- `src/services/resultFeedbackPayload.service.test.ts`
- `src/hooks/test/useTestIntegrity.ts`
- `src/hooks/test/useTestIntegrity.test.ts`
- `src/hooks/test/useAntiCopyPaste.ts`
- `src/hooks/test/useAntiCopyPaste.test.ts`
- `src/hooks/test/useFullscreenMode.ts`
- `src/hooks/test/useFullscreenMode.test.ts`
- `src/hooks/test/useIntegrityRefreshRequest.ts`
- `src/hooks/test/useIntegrityRefreshRequest.test.ts`

Default: no modification. These files may be run as regression proof; a requested implementation touch is a stop condition for this visual-alignment scope.

## 15. Testing Strategy

### Characterization Baseline

Before changing visual implementation, focused tests must characterize:

1. desktop/tablet two-column projection rendering;
2. phone passage-first rendering;
3. every supported task-type family;
4. stable IDs and display numbers;
5. answer entry and answer persistence;
6. passage and question navigation;
7. phone question-sheet scroll preservation;
8. passage scroll preservation;
9. review open/close and focus restoration;
10. mobile menu and utility focus restoration;
11. submit locking and submit failure recovery;
12. timer and force-submit lifecycle behavior;
13. lifecycle pause locks;
14. projection rejection;
15. non-live host projection path and return behavior;
16. live host projection path and lifecycle integration;
17. anti-cheat/integrity report handoff;
18. trusted-submit client-safe payload;
19. result/review compatibility;
20. boundary-import rules.

Required focused suite:

```powershell
npx vitest run `
  src/components/reading-v2/runtime/ReadingV2RuntimeShell.test.tsx `
  src/components/reading-v2/runtime/ReadingV2RuntimeShell.mobile-css.test.ts `
  src/components/reading-v2/runtime/ReadingV2MobileUtilities.test.tsx `
  src/services/reading-v2/readingV2RuntimeBoundary.service.test.ts `
  src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts `
  src/services/reading-v2/readingV2Projection.service.test.ts `
  src/services/reading-v2/readingV2TaskComponentContracts.service.test.ts `
  src/services/reading-v2/readingV2ResultAdapter.service.test.ts `
  src/services/reading-v2/readingV2Result.service.test.ts `
  src/services/reading-v2/readingV2Scoring.service.test.ts `
  src/services/reading-v2/readingV2TrustedSubmissionProcessor.service.test.ts `
  src/services/reading-v2/readingV2LaunchIntegration.service.test.ts `
  src/services/reading-v2/readingV2AuditTrail.service.test.ts `
  src/services/resultFeedbackPayload.service.test.ts `
  src/hooks/test/useTestIntegrity.test.ts `
  src/hooks/test/useAntiCopyPaste.test.ts `
  src/hooks/test/useFullscreenMode.test.ts `
  src/hooks/test/useIntegrityRefreshRequest.test.ts `
  src/pages/StudentPracticePage.test.tsx `
  src/pages/TestPageRouter.test.tsx `
  src/__tests__/readingV2BoundaryImports.test.ts `
  --reporter=basic
```

Heavy suites may be split into named commands, but every listed file must pass before rollout.

## 16. RED, GREEN, And Mutation Proof

Every implementation packet must record:

### RED

- the new or tightened test;
- exact command;
- expected failure;
- actual failure proving the test detects the missing visual/accessibility contract.

### GREEN

- exact command;
- passing result;
- relevant artifact path.

### Mutation

At least one intentional reversible mutation per packet must prove the focused test detects the protected behavior. Valid mutations include:

- reduce a mobile target below 44px;
- remove a required accessible name;
- break Escape close or focus restoration;
- clear answer state during layout switch;
- remove invalid-projection rejection;
- alter display-number mapping;
- omit `integrityReport`;
- change a projection path;
- let duplicate submit confirmation through;
- create unintended horizontal overflow.

The mutation must fail, then be fully restored. Final diff must not contain mutation residue.

## 17. Browser Proof Plan

### Environment And Contexts

- Student natural launch: `http://localhost:5174`
- Teacher launch where required: `http://localhost:5173`
- Teacher and student must use separate browser contexts.
- Use built-in dev quick-login controls.
- Direct deep links are prohibited except when denial/invalid-projection behavior is the scenario under test.

### Required Viewports

- desktop: `1366x900` and `1440x900`;
- tablet: `1024x768`;
- phone: `390x844`, `375x812`, and `320x720`;
- phone landscape for continuity proof.

### Required Scenarios

1. non-live solo or library launch through natural student flow;
2. homework launch through student homework;
3. course-material launch where current fixtures support it;
4. teacher-created live launch through teacher flow, then student join;
5. invalid or unavailable projection denial;
6. passage and section navigation;
7. question navigation;
8. each representative task-type family;
9. answer entry and answer preservation;
10. review open, return, and confirm;
11. submit success;
12. submit failure and retry where a controlled fixture exists;
13. reload before submit;
14. reload after persisted answers;
15. desktop-to-phone and phone-to-desktop viewport switch;
16. phone orientation switch;
17. mobile keyboard with focused answer input and visible active control;
18. Escape and focus restoration for menu, utility panel, question sheet, and review;
19. anti-cheat/integrity integration remains active on homework and live surfaces;
20. trusted-submit network request remains projection-bound;
21. result/review recovery uses existing shells;
22. homework, course, library, and live return behavior remains correct.

### Required Evidence

- screenshots for each required viewport and major state;
- V1 reference side-by-side where the parity contract requires it;
- console log with no uncaught runtime error;
- network capture proving unchanged projection read and trusted-submit endpoints;
- persisted answer/reload evidence;
- durable accepted-result record and expected existing consumer indexes;
- student result/review recovery evidence;
- teacher-facing result/review recovery evidence when the launch surface produces teacher-visible results;
- overflow assertion:

```javascript
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

- 44px target measurements for visible phone controls;
- focus-order and accessible-name notes;
- artifact index in findings.

### Playwright Command

Every Playwright run must use:

```powershell
npx playwright test --reporter=json > report.json
```

Preserve or rename `report.json` before another run overwrites it.

## 18. Observability And Announcement Contract

1. Existing runtime action tracking stays feature/host-owned.
2. Existing exit tracking stays host-owned.
3. Mobile text-size, instructions, review, question navigation, submit, and lifecycle diagnostics keep current names and metadata unless a separate observability review approves migration.
4. No projection payload, answer content, answer key, integrity event detail, token, or signed credential may be logged.
5. Visual-only rollout needs no new persistent analytics event solely to prove CSS changed.
6. If a new user-facing action is unavoidable, observability registry/tracking must be updated in the same approved implementation packet.
7. Submit outcomes remain in existing runtime status/review surfaces. No page-level one-off notification system is added.

## 19. Rollout Plan

### Phase 0: Approval And Maps

- approve PRD-0061;
- complete Task 1.8 child-PRD completeness audit;
- create required large-file maps;
- record baseline line counts;
- run characterization suites;
- capture baseline browser artifacts.

### Phase 1: Low-Risk Presentation Tokens

- align typography, spacing, borders, focus visibility, wrapping, and contained overflow;
- no extraction unless required;
- no host or service touch;
- prove desktop/tablet/phone baseline.

### Phase 2: Runtime-Owned Presentation Seams

- extract only proven coherent seams;
- preserve one runtime state owner;
- keep facade public contract stable;
- record line and responsibility deltas.

### Phase 3: Accessibility And Mobile Hardening

- close verified focus, target-size, safe-area, keyboard, screen-reader, and viewport-continuity gaps;
- rerun full runtime and host regression suites.

### Phase 4: Conditional Neutral Sharing

- enter only if FR-064 has named two-consumer proof;
- land Reading V2 and second-consumer adoption together or in named adjacent packets;
- run both consumers' focused suites;
- otherwise skip this phase.

### Phase 5: Cohort Proof

- internal fixtures;
- selected student/teacher flows;
- natural launch routes;
- supported viewport and browser matrix;
- no percentage rollout until all stop conditions remain clear.

### Phase 6: Full Rollout

- proceed only after browser, network, result/review, accessibility, and rollback evidence passes;
- retain previous presentation implementation for immediate code rollback through the normal deployment window.

## 20. Rollback Plan

Rollback is code-only and must not require data migration.

1. Revert the current visual-alignment packet or disable its presentation-only cohort switch if one was approved.
2. Preserve projection paths, payloads, answers, results, review payloads, and routes.
3. Do not delete or rewrite stored attempts/results during rollback.
4. Restore prior CSS/presentation composition.
5. Rerun focused runtime, host, boundary, submission, and result suites.
6. Re-prove one non-live and one live natural launch.
7. Stop rollback if it would require projection, result, Firebase, route, trusted-submit, or audit changes; escalate as a contract regression.

Immediate rollback triggers:

- answer loss or remapping;
- wrong passage/task rendering;
- submit duplication or failure regression;
- invalid projection rendered;
- anti-cheat or trusted-submit bypass;
- broken result/review;
- wrong return route;
- keyboard trap or inaccessible critical action;
- mobile control below 44px where it blocks use;
- unintended horizontal overflow blocking content;
- Listening dependency introduced.

## 21. Acceptance Criteria

1. Runtime remains projection-bound through `ReadingV2RuntimeShell`.
2. Exact non-live and live projection paths remain unchanged.
3. Drafts, packaged materials, invalid projections, and legacy flat payloads remain rejected.
4. All supported passages, stimuli, task types, answer shapes, and visible numbers remain compatible.
5. Answer state survives navigation, reload, viewport switch, orientation switch, review, and submit failure.
6. Desktop/tablet two-column and phone passage-first contracts pass.
7. `StudentPracticePage` and `TestPageRouter` retain host ownership.
8. Timer, lifecycle, anti-cheat, integrity, trusted submit, result, feedback, audit, and return contracts remain unchanged.
9. Keyboard, focus, screen-reader, reduced-motion, and 44px mobile requirements pass.
10. Large-file maps exist for every touched large file.
11. New files remain within size budgets or have approved exceptions.
12. `ReadingV2RuntimeShell.tsx` and CSS do not grow in net lines without approved evidence.
13. Shared extraction, if any, has real two-consumer proof and no module-specific ownership.
14. Required characterization, RED, GREEN, mutation, static, boundary, and diff checks pass.
15. Browser proof uses natural launch routes, separate contexts, exact localhost ports, and JSON Playwright reports.
16. Rollback is tested and data-neutral.
17. No non-goal file or contract changes.

## 22. Regression Checklist

### Projection And Boundary

- [ ] non-live student-safe path unchanged
- [ ] live session-safe path unchanged
- [ ] canonical draft rejected
- [ ] packaged material rejected
- [ ] invalid projection rejected
- [ ] review/analytics projection rejected
- [ ] unsupported schema rejected
- [ ] legacy flat payload rejected
- [ ] V1 launch remains V1

### Rendering

- [ ] passages render
- [ ] structured stimuli render
- [ ] task groups render in source order
- [ ] display numbers stay stable
- [ ] instructions and word limits render
- [ ] every supported task family renders
- [ ] binary-judgement vocabulary stays correct
- [ ] scalar and array answer shapes stay correct

### State And Navigation

- [ ] answers persist and rehydrate
- [ ] section navigation preserves answers
- [ ] question navigation preserves answers
- [ ] phone sheet preserves answers and scroll
- [ ] passage scroll stays scoped
- [ ] viewport switch preserves state
- [ ] orientation switch preserves state
- [ ] reload preserves expected state

### Submit And Results

- [ ] review-before-submit works
- [ ] review focus enters and returns
- [ ] duplicate submit remains locked
- [ ] submit failure preserves answers
- [ ] trusted request stays client-safe
- [ ] integrity report remains attached
- [ ] trusted backend remains authoritative
- [ ] result indexes remain compatible
- [ ] review payload remains grouped and result-bound
- [ ] release-policy sanitation remains correct
- [ ] AI feedback uses saved Reading V2 review payload
- [ ] regrade remains append-only

### Hosts And Routes

- [ ] non-live launch remains host-owned
- [ ] live launch remains host-owned
- [ ] timer remains host-owned
- [ ] anti-cheat remains host-owned
- [ ] trusted submit remains host/service-owned
- [ ] homework return works
- [ ] course return works
- [ ] library return works
- [ ] live waiting/result transition works
- [ ] no new route exists

### Accessibility And Responsive

- [ ] semantic regions remain named
- [ ] icon buttons have accessible names
- [ ] status and failure roles are correct
- [ ] keyboard order follows task order
- [ ] Escape closes owned overlays
- [ ] focus returns to triggers
- [ ] no keyboard trap
- [ ] no color-only state
- [ ] reduced motion respected
- [ ] mobile targets are at least 44px
- [ ] phone inputs remain readable
- [ ] safe-area controls remain reachable
- [ ] no unintended horizontal overflow

### Architecture

- [ ] no Listening import
- [ ] no shared runtime state
- [ ] no parser/import change
- [ ] no projection/service change
- [ ] no scoring/result change
- [ ] no trusted-submit/anti-cheat change
- [ ] no route/navigation change
- [ ] no authoring change
- [ ] no speculative extraction
- [ ] boundary-import test passes
- [ ] large-file maps and line deltas recorded

## 23. Risks

1. Visual refactor can accidentally change answer identity through component remounting.
2. Splitting the shell can create duplicate state owners.
3. CSS reordering can break intentional nested scrolling.
4. Phone overlays can trap focus or lose trigger restoration.
5. Viewport changes can remount layout-specific trees and lose state.
6. Similar-looking task types can be incorrectly generalized.
7. Shared extraction can leak projection, answer, timer, or submit ownership.
8. Host changes can silently alter anti-cheat, timer, result, or return behavior.
9. Large tests can hide missing focused coverage.
10. V1 visual parity can be mistaken for permission to import V1 logic.
11. Snapshot-heavy visual tests can pass while keyboard or network behavior regresses.
12. Dirty-tree overlap can absorb unrelated user work.

Mitigations:

- characterize before changing;
- keep one state owner;
- require mutation proof;
- map large files;
- keep host/services protected;
- use natural launch browser proof;
- record line/responsibility deltas;
- review exact diff paths;
- revert presentation-only packets independently.

## 24. Open Questions

OQ-1. Which visual reference wins when current Reading V2 runtime differs from historical V1 screenshots?

Default: current canonical `DESIGN.md`, PRD-0048 parity contract, current accessibility rules, and current projection-safe runtime behavior win. V1 remains a bounded visual reference. Any intentional deviation is documented with side-by-side evidence.

Stop condition: conflicting canonical design instructions must be resolved in the owning architecture document before implementation.

OQ-2. Does any proposed neutral runtime primitive currently have a proven second consumer?

Default: no. Keep the implementation Reading V2-owned.

Stop condition: do not create a neutral shared runtime primitive until FR-064 names the second consumer and proves semantic equivalence.

OQ-3. Is a feature flag required?

Default: no for presentation-only changes, consistent with PRD-0055. Use review-sized revertible packets. A behavior-changing discovery requires a separately approved flag/rollout decision.

Stop condition: if a packet changes runtime state, payload, routing, or host behavior, stop and re-scope it.

OQ-4. Which existing fixtures cover every natural launch scenario?

Default: implementation planning must inventory existing non-live, homework, course, and live fixtures before browser work. It may add test data through existing supported workflows, but it may not add a route or production data path for proof.

Stop condition: do not claim browser acceptance for a scenario without a natural-route fixture and captured evidence.

OQ-5. Should scroll position become durable attempt/session state?

Default: no. Preserve current component-state behavior. Durable persistence is outside visual alignment.

Stop condition: any request to change persistence requires a separate runtime-state contract.

## 25. Stop Conditions

Stop the affected implementation packet immediately if:

1. a projection path, schema, kind, ID, or sanitization change appears necessary;
2. a host route, launch, timer, anti-cheat, trusted-submit, result, or return change appears necessary;
3. a service or protected result/scoring file appears necessary for visual alignment;
4. answer identity or shape changes;
5. a neutral shared primitive lacks a proven second consumer;
6. a proposed extraction creates duplicate runtime state;
7. a large file is touched without a current map;
8. line budgets are exceeded without approved evidence;
9. a Listening import or behavior appears;
10. a browser scenario cannot be reached through a natural launch route;
11. teacher/student contexts cannot remain separate for live proof;
12. mutation proof fails to detect the protected behavior;
13. browser proof shows answer loss, wrong result/review, wrong return route, or accessibility failure;
14. implementation overlaps unrelated dirty user changes and cannot be isolated safely;
15. Task 1.8 completeness audit finds this child PRD missing a required owned/protected path, contract, test, rollback, observability, or stop condition.

## 26. Definition Of Done

### Packet 1H Planning Done

Packet 1H is complete when:

1. this file exists as `tasks/0061-prd-reading-v2-runtime-visual-alignment.md`;
2. task number `0061` is unique;
3. all six Task 1.7 child PRDs exist;
4. the tasklist registers PRD-0061;
5. Task 1.7 is marked complete only after child presence and structural validation pass;
6. findings append Packet 1H evidence;
7. Task 1.8 remains unstarted and is named as the next permitted packet;
8. required-section scan passes;
9. placeholder scan passes;
10. protected-scope scan proves only planning files changed;
11. trailing-whitespace and UTF-8 checks pass;
12. uniqueness and `git diff --check` checks pass;
13. independent read-only review finds no blocking omission;
14. no source, tests, runtime, projection, Firebase, routes, deployment, or traceability file changes.

### Future Implementation Done

Future runtime visual alignment is complete only when:

1. Task 1.8 and required approval gates are complete;
2. large-file maps exist;
3. characterization baseline passes;
4. approved review-sized packets implement only this PRD;
5. RED/GREEN/mutation evidence exists per packet;
6. all required focused tests pass;
7. natural-route browser proof passes;
8. desktop/tablet/phone visual and accessibility contracts pass;
9. network evidence proves projection and trusted-submit contracts unchanged;
10. result/review and return-navigation proof passes;
11. line budgets and responsibility deltas pass;
12. rollback proof passes;
13. independent verification passes;
14. no protected contract or non-goal changed.

## 27. Task 1.10 Canonical Dependency Synchronization - 2026-06-20

Canonical edge set, identical across the PRD-0055 dependency registry and every child PRD:

```text
DAG-00->{DAG-03,DAG-20,DAG-80}
DAG-03->{DAG-50,DAG-90,DAG-99}
DAG-20->DAG-21->DAG-40
DAG-40->{DAG-50,DAG-60}
DAG-50->{DAG-51,DAG-70,DAG-81}
DAG-51->DAG-60
DAG-60->{DAG-71,DAG-81}
DAG-70->DAG-71
DAG-80->DAG-81
{DAG-71,DAG-81,DAG-90}->DAG-99
```

| Local node | Upstream | Output | Downstream |
| --- | --- | --- | --- |
| `DAG-90` PRD-0061 | `DAG-03` shared-authoring stability plus dedicated Reading V2 runtime characterization/tests | Projection-bound Reading V2 runtime visual alignment and phase-local cohort acceptance | `DAG-99` |

PRD-0061 remains independent from Listening storage, solo, and live internals. Rollback is code-only presentation rollback with no projection/result/data migration. Historical Packet 1H/1I wording above remains historical; no implementation completion or Task 1.12 approval is claimed.
