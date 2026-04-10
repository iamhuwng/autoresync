---
title: Test System Architecture
description: 'Complete test lifecycle architecture: IELTS + THCS creation, editing, session management, test-taking, grading, results. The single entry point for understanding the test system.'
createdAt: '2026-02-27T16:15:16.855Z'
updatedAt: '2026-04-10T08:35:06.301Z'
tags:
  - architecture
  - test
  - ielts
  - thcs
  - core
---

# Test System Architecture

## Overview

The test system is the core feature of the platform. It supports two test types (IELTS and THCS) across three modes (live session, solo practice, homework). The system spans the full lifecycle: creation → editing → session management → student test-taking → grading → results.

## Test Types

### IELTS Tests (English Proficiency)
- **Reading:** 3 passages, 40 questions, multiple question types
- **Listening:** Multi-part audio-based questions
- **Question types:** Multiple choice, True/False/Yes/No/Not Given, matching, summary completion, gap fill, sentence completion, short answer
- **Scoring:** Band scoring (1.0-9.0), per-question type breakdown
- **Creation:** AI-powered extraction from uploaded documents (PDF, Word)

### THCS Tests (Vietnamese Curriculum)
- **Multi-choice:** Standard A/B/C/D format
- **Fill-in-the-blank:** Text input answers
- **Cloze:** Word bank gap-fill
- **Writing:** Long-form text responses
- **Error identification:** Find and correct errors
- **Pronunciation:** Stress/sound identification
- **Scoring:** Raw score → scaled score (out of 10)
- **Creation:** Manual wizard-based builder with templates

## Architecture — Full Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                    1. TEST CREATION                              │
│                                                                  │
│  IELTS Path:                    THCS Path:                       │
│  TestCreationPage.tsx           THCSTestEditorPage.tsx            │
│  ├── TestUploadWizard           ├── THCSWizardLayout              │
│  ├── TypeClassifierService      ├── THCSSetupStep (metadata)      │
│  ├── AIExtractorService         ├── THCSQuestionsStep (editor)    │
│  ├── ValidationService          ├── THCSAnswerKeyStep             │
│  └── ParseReviewPanel           └── THCSReviewStep (preview)      │
│                                                                  │
│  Output → /tests/{testId} in RTDB                               │
├──────────────────────────────────────────────────────────────────┤
│                    2. TEST EDITING                               │
│                                                                  │
│  IELTS: EditQuizModal.jsx (legacy, 42KB)                        │
│  THCS: THCSTestEditorModal.tsx (tabbed: Context, Questions,     │
│         Answer Key, Settings)                                    │
│                                                                  │
│  Both support: version history, template save/load              │
├──────────────────────────────────────────────────────────────────┤
│                    3. SESSION MANAGEMENT                        │
│                                                                  │
│  Teacher starts session → /sessions/{sessionId} in RTDB         │
│  Session modes:                                                  │
│    • Live (online class) — real-time sync                       │
│    • Offline class — teacher-paced                              │
│    • Solo practice — student self-directed                      │
│    • Homework — teacher-assigned, deadline-based                │
│                                                                  │
│  Key hooks: useMonitorState, useMonitorControls                 │
│  Monitor page: TeacherTestMonitorPage.tsx                       │
├──────────────────────────────────────────────────────────────────┤
│                    4. STUDENT TEST-TAKING                       │
│                                                                  │
│  Router: TestPageRouter.tsx (detects IELTS vs THCS)             │
│                                                                  │
│  IELTS: StudentTestPage.tsx                                     │
│    ├── Passage panel (reading text)                             │
│    ├── Question panel (answer inputs by type)                   │
│    └── Timer (synced with RTDB)                                 │
│                                                                  │
│  THCS: THCSTestLayout.tsx                                       │
│    ├── THCSPassagePanel (context/resources)                     │
│    ├── THCSQuestionRenderer → per-type renderers:               │
│    │   THCSClozeRenderer, THCSFillInRenderer,                   │
│    │   THCSWritingRenderer                                      │
│    ├── THCSSectionNav (section navigation)                      │
│    └── Timer (synced with RTDB)                                 │
│                                                                  │
│  Key hooks: useTestSession, useTestTimer, useTestSubmission     │
├──────────────────────────────────────────────────────────────────┤
│                    5. SUBMISSION & GRADING                      │
│                                                                  │
│  Auto-submit on timer expiry (useTestTimer → onTimeUp)          │
│  Teacher can end test early → autoSubmitAllUnsubmitted()        │
│                                                                  │
│  IELTS: Auto-graded (answer key matching + band calculation)    │
│  THCS: Auto-graded for MC/fill-in, manual for writing          │
│                                                                  │
│  Results saved to: /test_results/{resultId}                     │
│  Indexes: /test_results_by_session/, /test_results_by_student/  │
│                                                                  │
│  ⚠️ Known bug (fixed): Guest detection used to route            │
│     authenticated users to guest_results/ — fixed by            │
│     checking only startsWith('guest_')                          │
│     See @doc/sop/test-end-flow-debug-retrospective              │
├──────────────────────────────────────────────────────────────────┤
│                    6. RESULTS & ANALYTICS                       │
│                                                                  │
│  Teacher view: TeacherTestResultsPage.tsx                       │
│    • Per-student scores, class averages                         │
│    • Question-by-question analysis                              │
│                                                                  │
│  Student view: StudentTestResultsPage.tsx                       │
│    • Score breakdown, band score (IELTS)                        │
│    • Scaled score (THCS)                                        │
│    • TestReviewPage.tsx — detailed answer review                │
│                                                                  │
│  Academic record: AcademicRecordPage → ResultDetailModal        │
│  See @doc/prd/prd-academic-record, @doc/prd/prd-saved-result-system │
└──────────────────────────────────────────────────────────────────┘
```

## Key Files

### Pages
| Page | Purpose |
|------|---------|
| `TestCreationPage.tsx` | IELTS test creation (AI-powered upload) |
| `THCSTestEditorPage.tsx` | THCS test creation (wizard) |
| `TestPageRouter.tsx` | Routes to correct test-taking UI |
| `StudentTestPage.tsx` | IELTS test-taking interface |
| `TeacherTestMonitorPage.tsx` | Teacher live session monitor |
| `TestReviewPage.tsx` | Post-test answer review |

### Components
| Folder | Count | Purpose |
|--------|-------|---------|
| `components/test/` | 39 files | Shared test UI components |
| `components/thcs-editor/` | 31 files | THCS test builder |
| `components/thcs-student/` | 8 files | THCS test-taking renderers |
| `components/thcs-grading/` | 1 file | THCS grading UI |

### Services
| Service | Purpose |
|---------|---------|
| `services/test-creation/type-classifier.service.ts` | Rule-based test type detection |
| `services/test-creation/ai-extractor.service.ts` | AI-powered question extraction |
| `services/test-creation/validator.service.ts` | IELTS validation rules |
| `services/testStorage.ts` | Test CRUD operations |
| `services/resultsService.ts` | Results aggregation |
| `utils/monitor/autoSubmitDisconnected.ts` | Auto-submit unsubmitted students |

### Hooks
| Hook | Purpose |
|------|---------|
| `hooks/test/useTestSession.ts` | Test session state management |
| `hooks/test/useTestTimer.ts` | Timer sync with RTDB |
| `hooks/test/useTestSubmission.ts` | Answer submission pipeline |
| `hooks/test/useTestCreation.ts` | Test creation state machine |
| `hooks/monitor/useMonitorState.ts` | Live monitor state |
| `hooks/monitor/useMonitorControls.ts` | Monitor actions (end test, etc.) |

## Data Flow — RTDB Paths

```
/tests/{testId}                          — Test definition (questions, passages, metadata)
/sessions/{sessionId}                    — Active session state
/sessions/{sessionId}/participants/      — Connected students
/test_results/{resultId}                 — Individual result records
/test_results_by_session/{sessionId}/    — Session → results index
/test_results_by_student/{studentId}/    — Student → results index
/guest_results/{resultId}               — Guest user results (separate bucket)
```

## Known Patterns & Gotchas

### Timer Synchronization
- Timer state lives in RTDB `/sessions/{id}/timer`
- Both teacher and student read same timer
- ⚠️ `TimerDisplay` must NOT render with `totalTime=0` (causes instant `onTimeUp`)
- See @doc/sop/timer-bug-fix-retrospective

### Auto-Submit Pipeline
- Teacher clicks "End Test" → `endFullSession()` in `useMonitorControls`
- Identifies unsubmitted students → `autoSubmitAllUnsubmittedStudents()`
- ⚠️ Guest detection: ONLY use `startsWith('guest_')`, never pattern-match on UID format
- See @doc/sop/test-end-flow-debug-retrospective

### Test Creation Pipeline (IELTS)
- Upload -> document conversion -> AI extraction -> independent rules classification -> validator merge -> review
- AI uses Gemini primary and Groq fallback for the teacher Reading creator path
- `extractReadingTest()` returning `success: false` is treated as extraction failure, not as partial success
- AI extraction failure routes into offline/rules fallback; fallback output must still hydrate reviewable passages and merged questions
- Parser success requires at least one merged question; blank parse output must fail before draft save or review navigation
- Checkpoint/resume still applies for long documents
- See @doc/architecture/ai-parsing-extraction and @doc/system/project-structure-test-creation
## Related PRDs
- @doc/prd/prd-thcs-phase-1 — THCS test system foundation
- @doc/prd/prd-thcs-phase-2 — THCS live session & monitoring
- @doc/prd/prd-thcs-phase-3 — THCS solo practice & homework
- @doc/prd/prd-test-creation-modal — Unified test creation modal
- @doc/prd/prd-test-duration-end-flow — Timer & end flow redesign
- @doc/prd/prd-automated-ielts-reading — AI-powered IELTS creation

## Related SOPs
- @doc/sop/test-creation-page-analysis — Creation page deep review
- @doc/sop/test-end-flow-debug-retrospective — End flow debugging journey
- @doc/sop/timer-bug-fix-retrospective — Timer bug investigation
- @doc/sop/tfynng-implementation — True/False/Yes/No/Not Given question type


## 2026-03-28 Amendment — Auto-Submit Result Durability

The auto-submit pipeline does not end at grading. For class-session tests, the durable completion boundary is the successful atomic persistence of the canonical result row plus all required discovery indexes.

### Additional RTDB paths that matter
```text
/test_results_by_teacher/{teacherId}/{resultId}   — Teacher visibility index
/game_sessions/{sessionCode}/players/{studentId}/latestResultId   — Waiting-room recovery pointer
```

### New gotcha
A session can be marked submitted while the product still cannot discover the saved result if ownership resolution or secondary indexes fail. This creates a cross-surface failure where the waiting-room modal, academic record, and teacher history all miss the same attempt.

### Current standard
- Treat canonical row + indexes as one persistence unit.
- Prefer session ownership metadata first.
- Fall back to canonical `result.teacherId` for class-session ownership when session ownership cannot be resolved.
- Plan for historical backfill of orphaned canonical rows.

See @doc/patterns/pattern-canonical-result-persistence-invariants and @doc/architecture/results-academic-record.


## 2026-03-28 Amendment — IELTS Writing Grading Access State

The IELTS writing grading flow depends on a single Firestore collection, `writing_submissions`, across multiple teacher-facing surfaces.

### Current read path
- `TeacherGradingPage` loads the queue through `getPendingSubmissions()` using a `markingStatus == 'pending-review'` query plus client-side teacher filtering.
- `WritingGradingPage` loads a single submission through `getSubmission()`.
- `updateGrading()` performs a pre-update `getDoc()` on the same submission before writing grading data.

### Current ownership model
- Live session: teacher ownership should come from the session/test owner and be persisted as `context.assigningTeacherId` on new submissions.
- Homework: ownership comes from `context.assigningTeacherId`.
- Solo practice: ownership comes from `context.selectedTeacherId`.

### Current operational state
- The hosted project must have the compatible `writing_submissions` Firestore rule deployed or the teacher queue fails before client-side filtering runs.
- Because queue, detail, and save all read the same collection, a permission regression here is cross-surface, not isolated to one page.
- Broad authenticated reads currently keep the grading queue stable for hosted Firebase use.
- Historical live-session submissions may still miss teacher ownership metadata, so rule strategy cannot assume perfect backfill.

See @doc/sop/ielts-writing-grading-permission-retrospective and @doc/patterns/pattern-firestore-rules-vs-collection-queries.


## 2026-03-29 Amendment — Session End Source of Truth and Interaction Boundaries

### Current state of the live test flow
- Starting a test from the Teacher Lobby materials card is a supported entry path into an active monitored session.
- For active in-progress tests, the Teacher Monitor flow is now the only supported finalization path.
- Session Management remains a session inventory and control surface, but not a substitute result-finalization surface for active tests.

### Cross-feature interaction boundaries

#### Teacher Lobby ↔ Teacher Monitor
Teacher Lobby is allowed to create or attach to the session. Teacher Monitor owns finish-time responsibilities: auto-submit, academic-context normalization, durable result persistence, and player completion updates.

#### Teacher Monitor ↔ Session Management
Session Management can view and manage sessions, but if it finalizes an active test through a generic end-session utility it bypasses result-generation guarantees. The architecture now explicitly rejects that interaction for in-progress tests.

#### Result persistence ↔ Waiting-room UI
Waiting-room result UX is downstream from persistence. It must never be treated as the primary source of truth. If result persistence fails, the waiting room will only expose that absence; it cannot repair it.

#### Session model ↔ Academic context
Live sessions may carry academic context in more than one shape:
- embedded `academicContext`
- linked class / course / module identifiers on the session root

Any auto-submit or end-flow logic must normalize both forms before building result context.

### Problems this feature has with neighboring interactions
- A generic session-completion utility is too weak for an active test because it does not inherently know about result durability obligations.
- UI completion flags are shared by routing, waiting-room gating, and monitor state; when written prematurely they create cross-surface false positives.
- Reader surfaces such as waiting room, academic record, and teacher history depend on result indexes and `latestResultId`, so a persistence defect propagates as multiple independent UI failures.

### Operational rule going forward
When a feature ends a live test, it must own the full chain below or delegate to the code path that does:
1. identify all unsubmitted students
2. grade or synthesize fallback results
3. persist canonical result plus indexes
4. update player/session completion metadata
5. release waiting-room/result UI

Any path that skips step 3 but still performs steps 4 or 5 is architecturally invalid.

See @doc/patterns/pattern-canonical-result-persistence-invariants, @doc/sop/test-end-flow-debug-retrospective, and @doc/architecture/results-academic-record.


## 2026-03-29 Amendment — IELTS Reading/Listening Saved-Result Feedback Hardening

### Current state of the feature

IELTS Reading and Listening saved results now follow the same durability model as THCS saved feedback, but with IELTS-specific adaptation.

Current lifecycle:
- canonical result is persisted through `saveTestResult()`
- the writer owns initial formative-feedback triggering for eligible auto-marked saves
- shared result shells auto-heal missing eligible feedback when release governance allows it
- shared result shells auto-upgrade weak saved feedback
- listening breakdown is rendered as `Part Breakdown`; reading remains `Passage Breakdown`
- historical missing IELTS feedback can be repaired through the backfill utility

### What was wrong before

The feature was previously split across unrelated paths:
- normal student submit triggered feedback
- teacher-end auto-submit could save the result without triggering feedback
- legacy student quiz flow had its own save behavior
- emergency/disconnect fallback could bypass the canonical saved-result flow
- THCS had missing-feedback auto-heal, but IELTS missing-feedback recovery was weaker

This meant the product promise was "auto-generated with upgrade", but the actual behavior depended on which writer path created the row.

### Cross-feature interaction boundary

This feature interacts with more than the feedback engine.

Affected neighbors:
- result persistence
- teacher monitor auto-submit
- solo/practice submission
- legacy quiz submission
- saved-result shells and release-state governance
- academic-record and teacher-history result readers

Operational lesson: missing feedback on a saved result is often an orchestration bug, not an AI-model bug.

### Current interaction risks that still matter

- Saved-result feedback is still client-triggered; there is no durable backend worker.
- Release-state governance still controls when student shells may auto-heal or upgrade feedback.
- Any future result writer that bypasses `saveTestResult()` risks reintroducing the gap.
- Classification drift between save path and result shells will cause either false negatives (missing feedback) or false positives (wrong feature family).

### Architectural rule going forward

Any new path that can create an auto-marked saved result must either:
- call `saveTestResult()` directly, or
- preserve the same writer-owned trigger and metadata contract if a lower-level save utility is introduced later

Do not reintroduce feedback triggering in submit hooks as the primary contract.

### Related docs
- @doc/patterns/pattern-rtdb-real-time-auto-load-with-fire-and-forget-generation
- @doc/patterns/pattern-deterministic-first-ai-enhancement
- @doc/architecture/results-academic-record
- @doc/patterns/pattern-canonical-result-persistence-invariants


## 2026-03-29 Amendment — IELTS Writing Live Session Routing Contract

### Current state of the feature

The live student test flow now has a two-stage routing contract:

1. `testType` selects the delivery family boundary.
2. For IELTS-family tests, `skill` selects the concrete student page.

This matters because IELTS Writing shares the same top-level `testType: 'IELTS'` value as other IELTS surfaces but uses a different payload contract (`tasks` instead of reader-style `passages` and `questions`).

### Cross-feature interaction boundary

#### Router ↔ Published test contract

Publishing must be treated as a routing contract producer. If publish writes:

- `testType`
- `skill`
- skill-specific payload shape

then route resolution must consume enough of that contract to choose a page that matches the payload shape.

#### Router ↔ Generic IELTS page

The generic IELTS page owns reading/listening-style render contracts. It must not be the default target for all IELTS-family tests when some IELTS skills have their own dedicated payload and page contracts.

#### Session payload ↔ Page renderer

A session-safe payload being present is not sufficient. The selected page must match the payload contract. A valid payload on the wrong page is still a broken interaction.

### Problems this feature has with neighboring interactions

- `testType` is a family discriminator, not always a page discriminator.
- A fallback chosen before `skill` resolution can silently send a valid payload to the wrong renderer.
- Generic pages can mask architecture mistakes if they are treated as universal fallbacks instead of contract-bound surfaces.
- New resume/deep-link/waiting-room entry surfaces can reintroduce the bug if they reuse only the family discriminator.

### Operational rule going forward

- Resolve routing in discriminator layers, not in one shortcut branch.
- Use `testType` to split broad families like THCS vs IELTS.
- Within a family, resolve `skill` before selecting a concrete page or fallback.
- Tie fallback rules to payload compatibility, not only to missing enum values.
- Add regression coverage for any feature where multiple surfaces share the same top-level discriminator.

### Related docs

- @doc/sop/ielts-writing-grading-permission-runtime-state
- @doc/patterns/pattern-test-router-must-resolve-render-contract-before-fallback
- @task-nszwf2


## 2026-03-29 Amendment — IELTS Writing Post-Submission Student Contract

### Current state of the feature
- Pure IELTS Writing live-session submissions no longer route into the waiting-room `TestResultsModal` after submit or auto-submit.
- `WritingTestPage` now sends all successful submit paths to `/submission-complete`, including:
  - manual student submit
  - timer-expiry auto-submit
  - teacher-ended early auto-submit
- The submission-complete surface now states that IELTS Writing is manually graded by the teacher and does not show instant score or AI feedback.

### Cross-feature interaction boundary

#### Writing submit path ↔ waiting-room result surface
The waiting-room review modal is a session-first result surface for flows that already have an immediately reviewable result artifact. Pure IELTS Writing does not meet that contract at submission time because the student-facing outcome is still pending teacher review.

#### Writing submit path ↔ writing result viewer
The first student-facing post-submit surface for pure IELTS Writing is an acknowledgement page, not a result viewer. `StudentTestResultsPage` and `WritingResultView` remain valid later entry points once the student intentionally opens the Writing result surface.

#### Submission acknowledgement ↔ grading workflow
The acknowledgement page must not imply auto-grading. It exists to confirm persistence and set expectation for the teacher-owned grading workflow.

### Operational rule going forward
- Do not navigate pure IELTS Writing submit/auto-submit directly to `StudentWaitingRoomPage` with `showResults: true`.
- Do not auto-open `TestResultsModal` for pure IELTS Writing immediately after submit.
- Keep manual submit, timer expiry, and teacher-ended early submit on the same destination contract.
- Keep the acknowledgement copy explicit: teacher hand-grading only, no instant score, no AI feedback.

### Related docs
- @doc/prd/ielts-writing-test-system-prd
- @doc/prd/prd-test-duration-end-flow
- @doc/architecture/results-academic-record
- @doc/architecture/scheme/ielts-writing-current-state-scheme


## 2026-03-29 Amendment — IELTS Writing Grading Submit Compatibility State

### Current state of the feature
- IELTS Writing teacher grading still uses Firestore `writing_submissions` as the canonical grading artifact.
- RTDB `test_results` and its indexes remain compatibility and discoverability projections for existing readers.
- Teacher final grading can no longer assume a pre-existing readable RTDB compatibility row.

### Cross-feature interaction boundary
#### Firestore grading artifact ↔ RTDB compatibility result
- The teacher grading workflow must succeed from the canonical Firestore artifact even if the RTDB compatibility row is missing.
- The RTDB result should be reconstructed from Firestore submission state plus session context when necessary.

#### Materialization helper ↔ submission and grading flows
- `autoSubmitFromRTDB()` and teacher final grading both depend on the same writing-result materialization layer.
- A persistence regression there affects both submission-time and grading-time behavior.

#### Compatibility result ↔ result readers
- Academic record, teacher history, and session-based readers still depend on RTDB compatibility rows and indexes.
- This creates a shared failure mode: canonically graded but not discoverable.

### Operational rule going forward
- Firestore remains canonical for IELTS Writing grading.
- RTDB remains projection-only for writing results.
- Persist the canonical RTDB root row first, then fan out secondary indexes.
- Never make teacher grading depend on an already-existing compatibility row.

### Related docs
- @doc/architecture/architecture-ielts-writing-grading-submit-compatibility-audit-2026-03-29
- @doc/architecture/results-academic-record
- @doc/architecture/scheme/ielts-writing-current-state-scheme
- @doc/architecture/firebase-infrastructure


## 2026-04-03 Amendment - IELTS Writing Edit Shell And Publish Contract

## 2026-04-03 Amendment - IELTS Writing Edit Shell And Publish Contract

### Current state of the feature

- `TeacherLobbyPage` opens `WritingTestEditModal` for both published Writing material edits and Writing draft resume actions.
- Writing edit no longer reuses `TestCreationModal`.
- The Writing editor now sits inside the shared `Modal` plus `EditTestFrame` shell and keeps `questions`, `context`, and `settings` behavior aligned with the other editor surfaces.
- Published Writing material uses one primary `Save Changes` action.
- Unpublished Writing drafts keep `Save Draft` plus `Publish Test`.
- The shared `Settings` tab owns the writing `Public Test` toggle, and `isPublic` must survive draft save, publish, and edit-resume hydration.

### Cross-feature interaction boundary

#### Teacher lobby -> Writing editor

- Lobby owns the decision to open Writing edit directly instead of routing published edits back through creation review.
- The edit modal is part of the primary materials workflow, not an optional utility dialog.

#### Writing draft -> published RTDB test

- Firestore draft state remains the authoring source.
- Publish remains the operation that updates the RTDB test record.
- For published Writing material, the primary save action now runs that publish path directly so the teacher does not see a redundant second publish control.

#### Shared shell -> Writing-specific panes

- `EditTestFrame` owns shell chrome and the `settings` tab.
- Writing-specific panes own task selection, metadata editing, validation, and right-pane scroll behavior.

### Operational rule going forward

- Do not route Writing edit and resume flows back into `TestCreationModal`.
- Do not reintroduce a separate `Publish Updates` action for already-published Writing materials.
- Keep `isPublic` wired through draft hydration, save, publish, and editable-draft recreation.
- Treat right-pane scroll and full-height layout as part of the edit contract, not a cosmetic detail.

### Related docs

- @doc/architecture/ielts-writing/ielts-writing-authoring-edit-shell-and-publish-contract-2026-04-03


## 2026-04-09 Amendment - Teacher Reading Creation Parsing And Review Contract

### Current state of the feature

The teacher reading creation modal now depends on a fail-closed parsing contract before a draft can enter review.

Current operational rules:
- The parsing flow is `TestCreationModal -> testCreationService -> aiExtractor/offline parser -> validator -> testDraftService.saveParsedContent -> review route`.
- Review transition requires non-empty merged questions. Blank parse output is not a valid intermediate success state.
- Draft persistence is part of the success boundary. If `saveParsedContent()` fails, the modal must stay in error/retry state and must not advance to review.
- Passages may come from AI extraction or offline parsing, but teacher review requires questions first; passage-only success is not enough.

### Cross-feature interaction boundary

#### AI provider failure -> teacher review route

Gemini/Groq provider failures must be resolved before route transition. The modal and parser service must not convert provider outages into blank review drafts.

#### Parser result -> draft persistence

`testDraftService.saveParsedContent()` is the final write gate before review. A failed write must block navigation even if parsing itself succeeded.

### Operational rule going forward

Teacher-side reading creation must fail closed whenever the system cannot produce and persist reviewable question content. Retriable provider failures, offline fallback, and save errors are allowed; empty review drafts are not.

Related implementation anchors:
- `src/components/test-creation/TestCreationModal.tsx`
- `src/services/test-creation/index.ts`
- `src/services/draftCloudService.ts`
- `src/components/test-creation/TestCreationModal.test.tsx`
- `src/services/test-creation/index.test.ts`

Source: @task-1bch3u

## 2026-04-10 Amendment - Teacher Reading Question Extraction Resilience

### Current state of the feature

Teacher IELTS Reading creation now retries transient Gemini `503` / `high demand` failures across the remaining Gemini keys before it degrades to Groq. If Groq question extraction fails because the request is too large, the provider retries with smaller output budgets instead of immediately marking the key exhausted. The local offline parser also accepts markdown-numbered IELTS questions so markdown paste input can still produce reviewable question content.

### Cross-feature interaction boundary

#### Provider transient failure -> question extraction stage

A temporary Gemini high-demand response is now a stage-local retry event, not an immediate provider handoff.

#### Provider prompt budget -> fallback path

A Groq `413` oversized request is now treated as a prompt-shaping problem first. Key benching only belongs to actual provider rate-limit exhaustion.

#### Markdown paste -> offline fallback

Markdown numbering is now part of the accepted teacher authoring input shape, so offline fallback can still rescue pasted IELTS reading content when AI parsing fails.

### Operational rule going forward

The reading creator must prefer stage-local recovery before cross-provider fallback, and its non-AI rescue path must understand the markdown formats teachers actually paste into the creation modal.
