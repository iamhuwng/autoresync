# IELTS Reading V2 and IELTS Listening Unification Strategy

## Purpose

IELTS Reading test making and test taking are now being updated around the more stable Reading V2 implementation.

IELTS Listening should be unified with Reading V2 where appropriate so that teachers and students feel they are using one coherent IELTS testing system, not two unrelated products.

However, Listening must not be forced into Reading V2’s runtime model. Listening has a different test nature and a heavier live-session dependency.

The goal is:

> Unify the product experience, not the test construct.

Reading is text-first. Listening is audio-first. Reading V2 should guide the design language, authoring structure, shared UI patterns, and general exam experience. Listening must preserve audio handling, live teacher control, student synchronization, section movement, and playback authority.

---

## Core problem

Current IELTS Listening and Reading V2 flows differ too much in:

1. teacher test-making workflow,
2. student test-taking interface,
3. UI layout,
4. component structure,
5. save/autosave behavior,
6. review and submit experience,
7. mobile/desktop design language,
8. live-session behavior,
9. teacher monitor interaction.

This inconsistency makes the app feel fragmented.

Teachers should not feel that creating a Listening test is a completely separate product from creating a Reading V2 test.

Students should not feel that taking a Listening test belongs to a different system from Reading V2.

---

## Critical correction: Listening is live-session sensitive

Unlike Reading, IELTS Listening strongly interacts with the teacher monitor view during live sessions.

Listening student runtime can be controlled by the teacher in real time. The teacher may control or influence:

1. audio playback,
2. pause/resume,
3. movement between sections,
4. audio progress,
5. headphone readiness,
6. classroom synchronization,
7. session state,
8. student progression.

Therefore, Listening runtime must not be treated as just “Reading V2 with audio.”

A generic Reading-style independent student runtime may be acceptable for Reading, but it is dangerous for live Listening.

---

## Revised principle

The correct principle is:

> Unify the frame, not the authority model.

This means:

* unify layout language,
* unify visual hierarchy,
* unify authoring patterns,
* unify shared UI primitives,
* unify validation/review/submit patterns,
* unify mobile design rules,
* unify question rendering where genuinely compatible,

but do not remove or weaken:

* teacher-controlled audio authority,
* live session synchronization,
* Listening-specific audio state,
* headphone request/check flow,
* section skipping,
* teacher monitor control,
* live classroom timing behavior.

---

## Safe unification areas

The following areas are safe and desirable to unify between Reading V2 and Listening.

### 1. Teacher authoring frame

Reading V2’s authoring experience should become the design reference for Listening authoring.

Listening does not need the exact same fields, but it should share:

* page shell,
* step structure,
* header style,
* card layout,
* metadata section pattern,
* content section pattern,
* review/publish section pattern,
* validation summary,
* draft/save/publish affordances,
* error/loading states,
* spacing and typography.

Listening-specific authoring fields remain separate:

* audio upload,
* audio preview,
* Google Drive audio import,
* audio section setup,
* audio duration,
* transcript or section rubric,
* listening question parsing.

### 2. Shared UI primitives

Reading V2 and Listening should use shared components where the behavior is not skill-specific:

* page shell,
* section cards,
* question cards,
* answer input components,
* validation alert,
* save status indicator,
* loading state,
* empty state,
* error state,
* confirmation modal,
* review/submit modal,
* timer display,
* question navigator style,
* mobile bottom navigation,
* desktop header structure.

### 3. Student solo/homework shell

Solo/homework Listening can safely resemble Reading V2 more than live Listening can.

Shared patterns may include:

* test header,
* question navigator,
* answer sheet,
* submit confirmation,
* unanswered question review,
* autosave display,
* resume modal,
* time-up overlay,
* settings modal,
* mobile responsive spacing.

However, even solo Listening must preserve:

* audio playback,
* audio progress,
* current section,
* audio asset loading,
* playback restrictions if any exist.

### 4. Visual alignment for live Listening

Live Listening runtime can be visually aligned with Reading V2, but its control logic must remain Listening-specific.

Safe changes:

* header style,
* button style,
* question card style,
* navigator style,
* answer input style,
* spacing,
* mobile layout consistency,
* review/submit UI consistency.

Unsafe changes:

* replacing live Listening runtime with Reading V2 runtime,
* moving audio state into local-only student state,
* removing teacher authority,
* weakening synchronization with teacher monitor,
* merging live and solo Listening too early.

---

## Protected Listening-specific areas

These areas must remain Listening-specific unless there is a clear test-backed abstraction.

### 1. Audio playback authority

In live Listening, the student should not be the only authority over audio state.

The teacher monitor may control:

* play,
* pause,
* resume,
* skip to section,
* session pause,
* timing,
* audio progress.

Any refactor must preserve this authority model.

### 2. Teacher monitor integration

Teacher monitor is a core part of Listening live testing.

Do not remove or weaken:

* `TeacherTestMonitorPage`,
* `AudioProgressPanel`,
* headphone request handling,
* current audio section tracking,
* audio paused state,
* skip-to-section behavior,
* session pause/resume behavior.

### 3. Student synchronization

Student Listening runtime must react correctly to teacher-controlled changes.

Required behavior:

* if teacher pauses, student view reflects pause;
* if teacher resumes, student view resumes;
* if teacher skips section, student section/audio state updates;
* if session is paused, audio must not continue locally;
* student state must not drift away from teacher session state.

### 4. Audio section model

Listening sections are not the same as Reading passages.

Reading sections are mainly navigation/stimulus containers.

Listening sections are tied to:

* audio file or audio segment,
* timing,
* playback state,
* teacher controls,
* question timing,
* student synchronization.

Do not generalize Reading passage navigation into Listening section control without a clear adapter.

### 5. Headphone and offline mode behavior

If the app supports headphone checks or offline listening readiness, this must remain separate from Reading V2.

There is no Reading equivalent.

---

## Target architecture

The target architecture should be:

```text
Shared Assessment UI Layer
├── shared page shell
├── shared authoring frame
├── shared validation summary
├── shared question card styling
├── shared answer input primitives
├── shared review/submit modal
├── shared timer/status display
├── shared loading/error/empty states
├── shared mobile layout primitives
│
├── Reading V2 Adapter
│   ├── passage renderer
│   ├── Reading V2 question projection
│   ├── Reading-specific navigation
│   └── Reading-specific runtime behavior
│
└── Listening Adapter
    ├── audio player
    ├── audio section model
    ├── Listening question renderer
    ├── solo/homework playback behavior
    ├── live-session synchronization
    ├── teacher monitor integration
    └── headphone/audio readiness behavior
```

The shared layer should provide visual and workflow consistency.

The adapters should preserve the real nature of each test type.

---

## Important architecture distinction

There should not be one careless generic runtime.

There should be shared shell components plus skill-specific runtime adapters.

A safe structure is:

```text
SharedExamShell
├── ReadingV2RuntimeAdapter
└── ListeningRuntimeAdapter
    ├── SoloListeningRuntime
    └── LiveListeningRuntime
```

The key point:

> Reading V2 and Listening can share shell, layout, and UI primitives, but Listening live runtime must preserve its teacher-controlled session contract.

---

## Current known repo areas to audit

Codex should audit these areas before patching.

### Reading V2 authoring

Likely areas:

```text
src/pages/ReadingV2StudioPage.tsx
src/components/reading-v2/studio/
src/services/reading-v2/
```

Focus:

* Reading V2 Studio shell,
* metadata flow,
* passage/question editing,
* validation,
* draft/save/publish,
* import workflow,
* review flow.

### Reading V2 runtime

Likely areas:

```text
src/components/reading-v2/runtime/
src/pages/StudentPracticePage.tsx
src/components/practice/IELTSPracticeView.tsx
```

Focus:

* runtime shell,
* question rendering,
* passage rendering,
* mobile/desktop layout,
* answer handling,
* submit/review flow.

### Listening authoring

Likely areas:

```text
src/pages/TestBuilderRouter.tsx
src/skills/listening/builders/ListeningTestBuilder.tsx
src/services/listeningTestStorage.ts
src/skills/listening/
```

Focus:

* test creation flow,
* audio upload/import,
* audio preview,
* section setup,
* question entry/parsing,
* save/publish behavior,
* validation.

### Listening solo/homework runtime

Likely areas:

```text
src/components/practice/ListeningPracticeView.tsx
src/components/test/mobile/MobileListeningExamScaffold.tsx
src/skills/listening/components/
src/components/test/mobile/mobileListeningState.ts
```

Focus:

* student runtime layout,
* audio player,
* section navigation,
* answer handling,
* autosave,
* resume state,
* mobile layout,
* submit/review.

### Listening live session

Likely areas:

```text
src/pages/TeacherTestMonitorPage.tsx
src/components/test/AudioProgressPanel.tsx
src/components/test/HeadphoneRequestPanel.tsx
src/components/test/TeacherTestControlBar.tsx
src/components/practice/ListeningPracticeView.tsx
```

Focus:

* teacher monitor state,
* audio progress,
* pause/resume,
* skip section,
* headphone request flow,
* student synchronization,
* current section,
* audio paused state,
* session paused state.

---

## Do not do

Codex must not:

1. replace Listening runtime with Reading V2 runtime;
2. remove `ListeningPracticeView` without a safe adapter;
3. merge live Listening and solo Listening without mapping their differences;
4. move teacher-controlled audio into student-local state;
5. remove `AudioProgressPanel`;
6. remove headphone request/check behavior;
7. remove skip-to-section behavior;
8. generalize audio sections as if they were Reading passages;
9. create a broad shared runtime before tests exist;
10. make one huge refactor across authoring, runtime, live session, and storage at once.

---

## Recommended patch order

### Phase 1: Documentation and audit first

Before code changes, create:

```text
/documentation/ielts-reading-v2-listening-unification-audit.md
```

The audit must include:

1. Reading V2 authoring files/routes/components.
2. Reading V2 runtime files/routes/components.
3. Listening authoring files/routes/components.
4. Listening solo/homework runtime files/routes/components.
5. Listening live-session files/routes/components.
6. Teacher monitor to student runtime state map.
7. Listening live-session authority model.
8. Safe shared component candidates.
9. Unsafe generalization areas.
10. Recommended patch sequence.
11. Regression tests required.

No runtime code should be changed in this phase.

---

### Phase 2: Listening authoring visual/workflow alignment

Start with Listening test-making, because it has lower live-session risk.

Goal:

Listening test creation should feel like Reading V2 Studio without losing audio-specific fields.

Unify:

* page shell,
* step layout,
* metadata card,
* section card design,
* validation display,
* save/publish controls,
* review step,
* loading/error states.

Do not change:

* audio upload behavior,
* audio storage,
* audio preview,
* question parsing schema,
* published data format,
* compatibility with existing Listening tests.

This phase improves teacher experience without risking student live-session control.

---

### Phase 3: Shared visual primitives

Extract or reuse shared components only where behavior is genuinely shared.

Candidates:

```text
AssessmentPageShell
AssessmentHeader
AssessmentSectionCard
AssessmentQuestionCard
AssessmentValidationSummary
AssessmentSaveStatus
AssessmentReviewSubmitModal
AssessmentLoadingState
AssessmentErrorState
AssessmentEmptyState
AssessmentMobileNav
AssessmentQuestionNavigator
```

Rules:

* Components should be visual or low-risk behavior first.
* They should accept skill-specific content through props or children.
* They must not assume Reading-specific passage behavior.
* They must not assume Listening-specific audio behavior.

---

### Phase 4: Solo/homework Listening runtime alignment

After authoring and shared primitives are stable, align solo/homework Listening runtime.

Safe goals:

* make Listening student runtime visually resemble Reading V2;
* share question card styles;
* share review/submit behavior;
* share unanswered question warnings;
* share mobile layout rules;
* share settings/resume/time-up overlays if already compatible.

Preserve:

* audio player,
* playback state,
* audio section state,
* Listening mobile state,
* audio resume behavior.

Do not touch live-session behavior in this phase unless tests prove it is isolated.

---

### Phase 5: Live Listening visual alignment only

Only after the solo/homework flow is safe should Codex touch live Listening.

Scope should be visual alignment first.

Safe changes:

* layout shell style,
* question panel style,
* answer input style,
* header spacing,
* navigator style,
* pause overlay styling,
* teacher monitor visual polish.

Unsafe changes:

* changing teacher audio control logic,
* changing state authority,
* changing synchronization logic,
* changing skip-section behavior,
* changing audio progress logic.

Live Listening logic should remain stable unless there is a dedicated refactor with tests.

---

### Phase 6: Deeper runtime abstraction only if justified

A deeper shared runtime should only happen after:

1. live Listening contract is documented,
2. regression tests exist,
3. solo/homework Listening passes,
4. Reading V2 passes,
5. teacher live Listening passes,
6. differences between solo and live Listening are mapped.

If this phase happens, the target should be adapter-based:

```text
SharedRuntimeShell
├── ReadingV2RuntimeAdapter
└── ListeningRuntimeAdapter
    ├── SoloListeningRuntimeAdapter
    └── LiveListeningRuntimeAdapter
```

Do not build a single generic runtime that hides important skill differences.

---

## Acceptance criteria

### Reading V2 must still work

1. Teacher can create Reading V2 test.
2. Teacher can edit/revise Reading V2 test.
3. Teacher can publish Reading V2 test.
4. Student can take Reading V2 test.
5. Reading V2 answers save correctly.
6. Reading V2 submit/review behavior works.
7. Reading V2 mobile layout still works.

### Listening authoring must still work

1. Teacher can create Listening test.
2. Teacher can upload/import audio.
3. Teacher can preview audio.
4. Teacher can create/edit sections.
5. Teacher can add questions.
6. Teacher can save/publish.
7. Existing Listening tests remain compatible.

### Listening solo/homework runtime must still work

1. Student can open Listening test.
2. Audio loads.
3. Audio playback works.
4. Student can answer questions.
5. Student can move between sections where allowed.
6. Autosave works.
7. Resume works.
8. Submit works.
9. Review/unanswered warnings work.
10. Mobile layout works.

### Listening live session must still work

1. Teacher starts live Listening session.
2. Student joins live Listening session.
3. Teacher monitor shows student progress.
4. Teacher can pause session.
5. Student interface reflects pause.
6. Teacher can resume session.
7. Student interface resumes correctly.
8. Teacher can skip to another section.
9. Student section/audio state follows correctly.
10. Teacher audio progress remains accurate.
11. Headphone request/check flow still works if applicable.
12. Session end/submission still works.

### UX unification must be visible

1. Reading V2 and Listening use similar visual language.
2. Buttons, cards, headers, modals, spacing, and typography feel consistent.
3. Teacher authoring flows feel related.
4. Student test-taking flows feel related.
5. Differences are explainable by test nature, not legacy drift.

---

## Regression test requirements

Codex should add or update tests where possible.

Minimum test areas:

1. `StudentPracticePage` routes Reading V2 and Listening correctly.
2. Reading V2 runtime still rejects unsupported legacy payloads if that is current behavior.
3. Listening runtime still loads audio sections.
4. Listening saved mobile state remains compatible.
5. Listening solo/homework playback state is not applied incorrectly to live teacher-controlled state.
6. Teacher monitor renders `AudioProgressPanel` only for Listening.
7. Teacher monitor pause/resume does not break student runtime.
8. Skip-to-section keeps teacher and student state synchronized.
9. Shared components do not assume Reading-only data.
10. Shared components do not assume Listening-only data.

Manual tests are also required because audio and live classroom synchronization are difficult to validate with only unit tests.

---

## Practical implementation rule

Use this rule for every potential change:

```text
If the behavior is about layout, visual hierarchy, form structure, validation display, save status, review, submit, or basic question UI, it is a candidate for sharing.

If the behavior is about audio, teacher authority, live session state, section synchronization, headphone readiness, or playback timing, it must remain Listening-specific unless there is a tested adapter boundary.
```

---

## Final strategic recommendation

Do not start with runtime extraction.

Start with:

1. audit,
2. authoring alignment,
3. shared visual primitives,
4. solo/homework Listening visual alignment,
5. live Listening visual alignment,
6. deeper runtime abstraction only if tests prove it is safe.

The correct direction is not:

```text
Make Listening use Reading V2 runtime.
```

The correct direction is:

```text
Make Reading V2 and Listening feel like one IELTS product while preserving each module’s real runtime contract.
```

Reading V2 should be the design reference.

Listening live-session behavior should be the protected constraint.

The best outcome is a unified IELTS testing system where shared components provide consistency, and skill-specific adapters preserve correctness.
