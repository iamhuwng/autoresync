# Mobile IELTS Reading Test-Taking Architecture

## Purpose

This document defines the canonical architecture contract for the mobile IELTS Reading delivery surface introduced by PRD-0043.

It exists so future Reading, homework, solo-practice, and UI follow-up work uses one stable contract instead of rediscovering behavior from task logs or implementation details.

## Scope

This architecture applies to the phone-specific IELTS Reading surface rendered by:
- `src/skills/reading/components/ReadingTestPage.tsx` for live/supervised Reading sessions
- `src/components/practice/IELTSPracticeView.tsx` for solo-practice and homework Reading sessions
- `src/components/test/mobile/MobileReadingExamScaffold.tsx` as the shared mobile presentation shell

It does not replace the desktop/tablet two-column Reading surface.

## Activation Contract

The mobile Reading surface is gated by:
- `src/core/platform/hooks/useMobileExamMode.ts`

Required rules:
- phone-classified Reading sessions render the shared mobile scaffold instead of the desktop two-column layout
- live, solo-practice, and homework Reading all use the same mobile scaffold contract once mobile exam mode is active
- desktop and tablet surfaces must not inherit mobile-only layout decisions unless explicitly routed through the same gate

## Ownership Model

The mobile Reading architecture is deliberately split between host-owned state and scaffold-owned presentation.

### Host-Owned Responsibilities

`ReadingTestPage.tsx` and `IELTSPracticeView.tsx` own:
- active passage selection
- answers and submission callbacks
- overlay open/close state for question sheet, review summary, overflow menu, text-size control, and instructions
- per-passage memory state:
  - `passageScrollByPassage`
  - `activeQuestionGroupByPassage`
  - `questionSheetScrollByPassage`
- hydrated mobile Reading persistence state
- integration with timer, interruption, autosave, and route-leave flows

### Scaffold-Owned Responsibilities

`MobileReadingExamScaffold.tsx` owns presentation and interaction composition only:
- mobile header, passage tabs, passage content region, floating questions button, bottom sheet, and review overlay composition
- restoring and synchronizing passage scroll and question-sheet scroll using host-provided maps
- question-group anchoring and jump behavior inside the mobile sheet
- translating taps from mobile passage tabs, question pills, and review chips into host callbacks

The scaffold must not parse persisted payloads or become the owner of long-lived Reading session state.

## Persistence Contract

The persisted mobile Reading shape is defined by:
- `src/types/practice.types.ts`
- `src/components/test/mobile/mobileReadingState.ts`

Current persisted state includes:
- `activePassageId`
- `questionSheetOpen`
- `reviewSummaryOpen`
- `passageScrollByPassage`
- `activeQuestionGroupByPassage`
- `questionSheetScrollByPassage`
- `textSize`

Required rules:
- persisted mobile Reading state must remain JSON-safe
- the hosts hydrate persisted state before passing runtime props into the scaffold
- the hosts serialize runtime state back into the persisted shape before handing it to autosave hooks
- helper hydration must tolerate legacy payloads without reviving removed runtime behavior

### Legacy Compatibility

`SavedMobileState.flaggedQuestions` is now legacy-only and optional.

Required rules:
- new mobile Reading state must not serialize `flaggedQuestions`
- legacy payloads containing `flaggedQuestions` must remain readable and harmless during hydration
- removed mobile-only behavior must not be reintroduced just because an older payload still contains that field

## Mobile Navigation And Overlay Contract

The mobile Reading surface has a layered, host-coordinated overlay model.

Required rules:
- the question sheet, review summary, overflow menu, text-size control, and instructions surface are separate mobile layers with explicit z-index ownership from `mobileReadingLayering.ts`
- review summary is the only manual submit entry point on mobile
- auto-submit and interruption flows must close mobile overlays before final transition work continues
- browser back/popstate handling must close review first, then question sheet, without reopening layers that were not previously stacked

## Question Navigation Contract

The mobile question navigator uses the shared `QuestionNavigator.tsx` component in collapsible/mobile mode.

Required rules:
- the mobile question sheet uses the compact horizontally scrollable pill row only
- pill clicks must jump to the exact target question, not only the surrounding group wrapper
- the host remembers question-group state per passage, while the scaffold maps exact question taps back into the correct group and scroll target

### Mobile-Only State Semantics

Current mobile pill semantics are:
- answered: green filled pill
- unanswered: neutral slate pill
- current: blue ring over the answered/unanswered base state

Desktop/grid navigator styling is outside this mobile contract and may evolve independently.

## Review Summary Contract

`MobileReviewSummary.tsx` is a mobile-only pre-submit review surface.

Required rules:
- questions are grouped by passage
- answer status is limited to answered vs unanswered for mobile Reading
- unanswered state uses the same neutral family as the mobile question pills instead of a warning-heavy orange treatment
- review-chip taps must return the student to the correct passage and exact question flow

## Product Decision: No Mobile Flagging

Mobile Reading no longer includes `flagged` / `flag for review` behavior.

Decision rationale:
- on the phone surface it added visual noise without changing scoring or flow control
- unanswered state plus review-summary jump-back behavior already cover the main student recovery path
- removing flagging simplifies the persisted state contract and reduces contradictory small-screen signals

Required rules:
- mobile Reading hosts do not own a `flaggedQuestions` runtime set
- the scaffold, mobile FAB, mobile review summary, and embedded mobile Reading questions do not expose flagging UI
- generic shared components may still support flagging for other non-mobile or non-Reading surfaces, but this architecture does not depend on that support

## Implementation Anchors

Key implementation files:
- `src/core/platform/hooks/useMobileExamMode.ts`
- `src/skills/reading/components/ReadingTestPage.tsx`
- `src/components/practice/IELTSPracticeView.tsx`
- `src/components/test/mobile/MobileReadingExamScaffold.tsx`
- `src/components/test/mobile/MobileReadingHeader.tsx`
- `src/components/test/mobile/MobilePassageTabs.tsx`
- `src/components/test/mobile/MobileQuestionSheet.tsx`
- `src/components/test/mobile/MobileQuestionsFab.tsx`
- `src/components/test/mobile/MobileReviewSummary.tsx`
- `src/components/test/QuestionNavigator.tsx`
- `src/components/test/IELTSQuestionsPanel.tsx`
- `src/components/test/mobile/mobileReadingState.ts`
- `src/components/test/mobile/mobileReadingLayering.ts`
- `src/components/test/readingQuestionGroups.ts`

## Related Docs

- `documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md`
- `documentation/architecture/homework-solo-practice-architecture.md`
- `documentation/architecture/student-experience-architecture.md`
- `documentation/architecture/reading-passage-highlighting-architecture.md`

## 2026-04-09 Release Refinements

### Shell Chrome Contract

Required rules:
- the centered mobile header action is `Submit`, not the passage title
- the overflow menu no longer exposes a duplicate submit action; manual submit continues through review summary and final confirmation only
- page-level and sheet-level passage tabs always render short `Passage 1`, `Passage 2`, and `Passage 3` labels regardless of full passage titles
- the floating launcher label is `Questions`; status detail stays in the badge treatment, not in the main label
- the mobile question sheet keeps the compact single-row pill navigator only; the earlier show-all mode is not part of the released phone contract

### Mobile Input Adaptation Contract

Required rules:
- embedded mobile matching-headings questions must use the dedicated `MobileMatchingHeadingsInput.tsx` picker flow instead of reusing desktop drag-and-drop
- the mobile matching-headings picker opens a focused modal per paragraph and keeps long heading text wrapped inside phone-safe cards
- grouped Reading question types must register exact per-question anchors so pill taps and review-chip taps land on the intended question row, not only a shared group wrapper

### Device Classification Guardrail

Required rules:
- `useMobileExamMode()` must treat touch-only, no-hover widened phone sessions as mobile exam mode even when the browser presents a desktop-style viewport
- library, homework, and direct practice/test entry points must all converge on the same classifier so phone users do not fall back to the desktop two-column Reading surface

### Viewport Consistency Note

The scaffold root already uses the intended `100vh` plus `100dvh` pattern. Supporting loading, error, and start-screen states should converge on the same pattern, as tracked in `documentation/tasks/assessment-0043-code-audit-report.md`.
