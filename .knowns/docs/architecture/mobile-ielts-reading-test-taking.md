---
title: Mobile IELTS Reading Test Taking
description: Canonical architecture contract for the phone-specific IELTS Reading delivery surface across live, solo-practice, and homework modes.
createdAt: '2026-04-08T17:36:17.462Z'
updatedAt: '2026-04-08T17:36:41.728Z'
tags:
  - architecture
  - ielts
  - reading
  - mobile
  - student
---

# Mobile IELTS Reading Test Taking

## Purpose

This doc is the searchable Knowns source of truth for the phone-specific IELTS Reading delivery surface introduced by PRD-0043.

It exists so future Reading, homework, solo-practice, and student-route work can reuse one stable contract instead of re-deriving behavior from task logs.

## Scope

This contract applies to:
- `ReadingTestPage.tsx` for live Reading sessions
- `IELTSPracticeView.tsx` for solo-practice and homework Reading sessions
- `MobileReadingExamScaffold.tsx` as the shared mobile presentation shell

It does not replace the desktop or tablet two-column Reading surface.

## Activation Contract

Mobile Reading is gated by `useMobileExamMode()`.

Required rules:
- phone-classified Reading sessions render the shared mobile scaffold instead of the desktop two-column layout
- live, solo-practice, and homework Reading all use the same scaffold contract once mobile exam mode is active
- touch-only, no-hover widened phone sessions must still classify as mobile exam mode so library/homework entry points do not fall back to the desktop surface

## Ownership Model

### Host-owned responsibilities

`ReadingTestPage.tsx` and `IELTSPracticeView.tsx` own:
- active passage selection
- answers and submission callbacks
- overlay open/close state for question sheet, review summary, overflow menu, text-size control, and instructions
- per-passage memory state
- persisted mobile-state hydration/serialization
- timer, interruption, autosave, and route-leave integration

### Scaffold-owned responsibilities

`MobileReadingExamScaffold.tsx` owns presentation and interaction composition only:
- mobile header
- passage tabs
- passage content region
- floating questions launcher
- question sheet
- review overlay
- mapping taps from question pills and review chips back into host callbacks

The scaffold must not own long-lived Reading session state.

## Persisted Mobile State Contract

Persisted shape is defined by `SavedMobileState` and hydrated through `mobileReadingState.ts`.

Current persisted state includes:
- `activePassageId`
- `questionSheetOpen`
- `reviewSummaryOpen`
- `passageScrollByPassage`
- `activeQuestionGroupByPassage`
- `questionSheetScrollByPassage`
- `textSize`

Legacy rule:
- `flaggedQuestions` is legacy-only and optional; new mobile Reading state must not serialize it, but hydration must tolerate older payloads safely

## Released Shell Chrome Contract

Required rules:
- the centered mobile header action is `Submit`
- manual submit on mobile continues through review summary plus final confirmation; the overflow menu must not expose a duplicate submit item
- passage tabs always render short `Passage 1`, `Passage 2`, and `Passage 3` labels
- the floating launcher label is `Questions`
- the question sheet keeps the compact single-row pill navigator only; show-all mode is not part of the released phone contract

## Question Navigation Contract

Required rules:
- pill taps must jump to the exact target question, not only a shared group wrapper
- grouped Reading inputs must register exact per-question anchors for embedded/mobile scrolling
- host state remembers question-group context per passage; exact question taps are mapped back into the correct group and scroll target

Mobile-only pill semantics:
- answered: green fill
- unanswered: neutral slate fill
- current: blue ring over the answered/unanswered base state

Desktop/grid navigator styling is outside this mobile contract.

## Mobile Input Adaptation Contract

Required rules:
- embedded mobile matching-headings uses `MobileMatchingHeadingsInput.tsx`, not desktop drag-and-drop
- the mobile matching-headings picker opens a focused modal per paragraph
- long heading text must wrap safely inside phone-width cards and dialogs

## Review Summary Contract

`MobileReviewSummary.tsx` is the only manual pre-submit review surface on mobile.

Required rules:
- questions are grouped by passage
- mobile answer status is limited to answered vs unanswered
- unanswered uses the same neutral family as the mobile pill row, not warning-heavy orange
- review-chip taps must reopen the correct passage and exact question flow

## Product Decision: No Mobile Flagging

Mobile Reading no longer includes `flagged` / `flag for review` behavior.

Rationale:
- on the phone surface it added visual noise without changing scoring or flow control
- unanswered plus review-summary jump-back already cover the main student recovery path
- removing flagging simplified persistence and reduced contradictory small-screen signals

Required rules:
- mobile Reading hosts do not own a `flaggedQuestions` runtime set
- the scaffold, FAB, review summary, and embedded mobile Reading question blocks do not expose flagging UI

## Related Docs

- @doc/architecture/homework-solo-practice-architecture
- @doc/architecture/student-experience-architecture
- @doc/system/solo-study-homework-system
- @doc/architecture/reading-passage-highlighting-architecture
