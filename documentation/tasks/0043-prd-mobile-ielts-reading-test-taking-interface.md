# PRD: Mobile IELTS Reading Test-Taking Interface

> **PRD Number:** 0043  
> **Status:** Draft (v2 — gap-closed)  
> **Created:** 2026-04-07  
> **Revised:** 2026-04-07  
> **Author:** Codex via discovery session  
> **Depends on:** PRD-0019 (Test Duration & End Flow), PRD-0025 (Unified Solo Practice Mode), `documentation/rules/mobile-portability.md`, `documentation/architecture/reading-passage-highlighting-architecture.md`  
> **Audience:** Junior developer implementing phone-first IELTS Reading UX without inventing missing behavior  
> **Revision note:** v2 closes 17 gaps identified during post-draft assessment: codebase reality mismatches, unspecified behaviors, and potential conflicts. All decisions were confirmed by the product owner.

---

## 1. Introduction / Overview

### Problem Statement

The current IELTS Reading student experience is desktop-first:

- it assumes a permanent two-column layout
- it assumes the question surface can stay visible beside the passage
- it uses a footer navigator and wide header that consume too much space on phones
- it gives students poor one-hand ergonomics on handheld devices
- it does not define a dedicated mobile interaction model for passage switching, question access, review, or submit

This is especially weak for:

- live reading sessions in `ReadingTestPage`
- solo and homework reading flows that reuse the same right-column mental model
- narrow portrait devices where the passage and question surfaces compete for the same vertical space

### Solution

Introduce a **phone-only mobile exam mode** for IELTS Reading that replaces the always-visible desktop split view with:

- sticky passage tabs
- a dynamic floating `Questions` button
- a near-fullscreen question sheet that behaves like the desktop right column for the current passage
- a dedicated review-summary screen before manual submit
- exact state restoration across passage changes, close/reopen, resume, and interruption events

This redesign is a **mobile presentation-layer change over existing Reading ownership**, not a new parallel reading system.

### Prerequisites (Phase 0)

Before any mobile scaffold work begins, `IELTSPracticeView.tsx` must be migrated to comply with existing mobile-portability rules:

1. Replace `import { useNavigate } from 'react-router-dom'` with `import { useNavigation } from '@/hooks/useNavigation'` and convert all `navigate()` calls to `navigateTo()` using the route registry.
2. Replace all `localStorage.getItem` / `localStorage.setItem` calls (student preferences) with `import { storage } from '@/core/platform/storage'` using async platform storage.
3. These fixes must land as a standalone commit **before** mobile scaffold work begins so that the host is clean for the shared scaffold to consume.

### Non-Negotiable Interpretation Decisions

1. Desktop and tablet keep the existing split-view architecture. This PRD changes phone behavior only.
2. Mobile exam mode applies to IELTS Reading only. It does not redesign Listening, Writing, or THCS surfaces.
3. The mobile question sheet is not a route change, redirect, new page, or new tab. It opens in place over the same test route.
4. The content inside the mobile question sheet must feel like the current desktop right column: question groups, instructions, answer controls, current-passage scope, and interactive answering all remain intact.
5. On phone, students do **not** see passage text and a large answer surface simultaneously. Closing and reopening the question sheet must restore exact context so this tradeoff remains usable.
6. Existing mode-specific ownership remains intact:
   - live mode keeps session-owned timer, autosave, and interruption logic
   - solo mode keeps local resume/start-new behavior
   - homework keeps homework-specific timer and resume constraints
7. Mobile v1 hides the Reading highlighter UI, but it must not fork or break the canonical Reading renderer/highlight contract.
8. New mobile behavior must use platform abstractions for storage and device classification. No new feature code may hard-code `window.innerWidth`, raw `matchMedia`, or direct `localStorage`.
9. Each Reading host keeps its own PassageRenderer import. Live mode uses the canonical `PassageRenderer` from `src/skills/reading/components/PassageRenderer.tsx`. Solo/homework mode uses `PassageRenderer_v2.jsx` (the legacy wrapper that delegates to the canonical renderer). The mobile scaffold must accept the renderer as a prop from each host rather than importing one directly.
10. When mobile exam mode is active, homework anti-cheat `requireFullscreen` is **disabled**. The mobile question sheet and mobile UI take priority over fullscreen enforcement. Other anti-cheat features (copy-paste detection, integrity tracking) remain active.

---

## 2. Goals

| # | Goal | Success Metric |
|---|------|---------------|
| G1 | Make IELTS Reading usable with one hand on phones | Manual QA shows all primary actions are reachable without desktop-style split-view dependency |
| G2 | Preserve Reading feature parity across live, solo, and homework | Same mobile interaction model works in all three modes without route changes or reloads |
| G3 | Keep desktop and tablet stable | Existing split-view behavior remains the default outside phone mobile exam mode |
| G4 | Remove junior ambiguity | Passage switching, question access, review, submit, resume, and interruption behavior are fully specified |
| G5 | Preserve existing Reading ownership | Current scoring, passage rendering, submit, and mode-specific persistence stay anchored in existing Reading hosts |
| G6 | Improve mobile trust | Students understand where they are, what passage they are answering, what is unanswered, and what happens when they submit or reconnect |

---

## 3. User Stories

### 3.1 Student - Start Reading Test On Phone

> **As a student**, I want a compact phone-first reading surface so I can start a Reading test without fighting a desktop layout squeezed onto a phone.

**Acceptance Criteria:**

- The start/instructions screen is single-column and phone-optimized
- Live, solo, and homework modes show mode-specific rules before start
- The student enters the same route after tapping `Start`; no route branching exists purely for mobile UI
- Once the test begins, the passage is the primary visible surface until the student opens questions

### 3.2 Student - Read And Switch Passages

> **As a student**, I want to move between passages quickly on phone without losing my place.

**Acceptance Criteria:**

- Sticky tabs labeled `Passage 1`, `Passage 2`, `Passage 3` remain the primary passage switcher
- Passage scroll position is preserved per passage
- If the question sheet is open and the student switches passages, the sheet remains open and swaps to the new passage's question set
- Each passage restores its last active question-group context when revisited

### 3.3 Student - Open Questions Without Leaving The Passage Flow

> **As a student**, I want to open questions in an overlay on top of the same screen so I do not get redirected away from the reading surface.

**Acceptance Criteria:**

- A floating `Questions` button opens a near-fullscreen question sheet in place
- The sheet shows the current passage's question groups and answer controls
- Closing the sheet returns the student to the same passage and scroll position
- Reopening the sheet restores the same question-group context and sheet scroll position

### 3.4 Student - Answer And Flag Questions

> **As a student**, I want the mobile question area to behave like the desktop right column so I can answer naturally and mark uncertain questions for later review.

**Acceptance Criteria:**

- Current-passage question groups and instructions remain visible inside the sheet
- Inputs behave the same as desktop for supported IELTS Reading question types
- Each question can be flagged for review
- Flagging is informational only; it does not block submission

### 3.5 Student - Review Before Manual Submit

> **As a student**, I want a clear review summary before submitting so I can inspect unanswered and flagged questions.

**Acceptance Criteria:**

- `Submit Test` always routes through a review-summary screen for manual submits
- The review summary is grouped by passage
- Each passage section shows answered, unanswered, and flagged counts
- Tapping a question chip from review returns the student to the correct passage and reopens the question sheet at that question/group
- Unanswered questions are warnings; flagged questions are informational only

### 3.6 Student - Resume With Exact Context

> **As a student**, I want to resume where I left off, including passage and question context, so that phone interruptions do not force me to reconstruct my place.

**Acceptance Criteria:**

- Resume restores passage tab, passage scroll, active question/group, sheet open/closed state, question-sheet scroll, answers, flags, and text-size preference
- Live mode re-enters directly if the session is still active
- Solo mode may offer `Resume` vs `Start New`
- Homework respects homework-specific resume restrictions and may auto-resume without `Start New`

### 3.7 Student - Survive Mobile Interruptions

> **As a student**, I want the phone experience to handle time-up, connection loss, teacher-end, and back-button behavior predictably.

**Acceptance Criteria:**

- Browser/system back closes the question sheet first, then the review screen, before any leave-test flow
- If time expires while the question sheet is open, the sheet closes first, then existing auto-submit logic takes over
- Explicit states exist for connection loss, reconnect, teacher-ended session, and force submit
- Healthy autosave remains silent; failures surface as a temporary toast

---

## 4. Functional Requirements

### 4.1 Scope And Activation

| ID | Requirement |
|----|-------------|
| FR-1 | Mobile exam mode applies only to IELTS Reading on handheld phone-class devices. |
| FR-2 | Desktop and tablet keep the current split-view architecture, including `TwoColumnLayout` and existing footer navigation. |
| FR-3 | This PRD does not redesign Listening, Writing, THCS, or shared shell pages. |
| FR-4 | The same phone-first mobile Reading contract must work across live, solo, and homework Reading flows. |
| FR-5 | Mobile exam mode must be activated by a shared platform-level classifier, not by ad hoc checks inside Reading page components. |
| FR-6 | The classifier must prefer handheld/mobile heuristics first, then fall back to touch-plus-viewport signals only when device class is ambiguous. |
| FR-7 | If the classifier is uncertain, it must fail safely to the existing desktop/tablet layout rather than forcing mobile exam mode. |
| FR-8 | A QA-only override must exist so desktop browsers can force or disable mobile exam mode during verification. |
| FR-9 | The QA override must not be exposed as a normal production UI control. |

### 4.2 Ownership And Shared Reading Contracts

| ID | Requirement |
|----|-------------|
| FR-10 | Mobile exam mode is a presentation-layer change over existing Reading hosts. It must not create a second Reading data or submit pipeline. |
| FR-11 | Current Reading hosts remain the owners of mode-specific logic: `ReadingTestPage.tsx` for live Reading and `IELTSPracticeView.tsx` for solo/homework Reading. |
| FR-12 | Mobile exam mode must continue using the canonical Reading passage renderer contract owned by `src/skills/reading/components/PassageRenderer.tsx`. |
| FR-13 | Mobile exam mode must continue using the existing Reading answer schema and question-type behavior. |
| FR-14 | Mobile exam mode must not fork scoring logic, result-writing logic, or Reading question filtering into a separate mobile-only service. |
| FR-15 | Current-passage question filtering remains the contract on phone. The mobile question sheet must not become a global all-passages question list. |
| FR-16 | The mobile implementation may adapt or wrap `IELTSQuestionsPanel`, but it must not create an unrelated second set of answer widgets with different behavior. |
| FR-17 | The current desktop-only `window.confirm` submit warning must be refactored into a host-controlled contract so mobile can implement review-summary-first submit without double-confirming. |

### 4.3 Device Classification Contract

| ID | Requirement |
|----|-------------|
| FR-18 | Create or extend a shared platform hook for Reading mobile exam classification inside `src/core/platform/hooks/`. |
| FR-19 | Feature components must not read raw `window.innerWidth`, raw `matchMedia`, or raw user-agent strings directly. |
| FR-20 | The classifier must use this priority order: handheld/mobile heuristic -> touch-plus-viewport fallback -> fail-safe desktop/tablet fallback. |
| FR-21 | The classifier must be the single source of truth for `isMobileExamMode`. |
| FR-22 | The QA override must be session-scoped and must not survive normal student sessions accidentally. |
| FR-23 | The classifier must be reusable by both Reading hosts so live and practice/homework mobile behavior cannot drift. |

### 4.4 Start / Instructions Screen

| ID | Requirement |
|----|-------------|
| FR-24 | Phone start/instructions uses a compact single-column layout with one dominant `Start` button. |
| FR-25 | Live mode must show live-session-specific rules such as timer and session expectations. |
| FR-26 | Homework mode must show homework-specific rules such as due context, attempt rules, and resume restrictions. |
| FR-27 | Solo mode must show solo-specific context such as resume availability and unsupervised practice framing. |
| FR-28 | The start screen must not reuse the full desktop header/body chrome on phone. |
| FR-29 | The start screen remains within the same route host and must not introduce a phone-only route split. |

### 4.5 Mobile Header And Overflow Menu

| ID | Requirement |
|----|-------------|
| FR-30 | The phone header must contain only: timer, current passage label, and an overflow menu trigger. |
| FR-31 | Student name must not appear in the mobile Reading header. |
| FR-32 | The overflow menu must contain exactly: `Text size`, `Review answers`, `Submit test`, `Leave test`, and `Instructions / Help`. |
| FR-33 | The mobile header must remain compact enough that the passage area keeps most of the viewport when the question sheet is closed. |
| FR-34 | The header must respect safe-area insets on notched devices. |
| FR-34a | `Instructions / Help` in the overflow menu must open a read-only modal showing: (1) mode-specific rules from the start screen (timer rules, attempt rules, etc.) and (2) a brief controls-help section explaining passage tabs, question sheet, flagging, and submit. No interactive actions in this modal. |
| FR-34b | The mobile Reading header must replace **both** existing desktop headers: `ReadingHeader` (used by live `ReadingTestPage`) and `TestHeader` (used by solo/homework `IELTSPracticeView`). The shared mobile scaffold must accept a mode prop and render the same compact mobile header for all modes. |

### 4.6 Passage Tabs And Reading Surface

| ID | Requirement |
|----|-------------|
| FR-35 | The primary passage switcher is a horizontally scrollable sticky tab strip labeled `Passage 1`, `Passage 2`, `Passage 3`, etc. |
| FR-36 | The page-level passage tab strip must remain visible when the question sheet is closed. |
| FR-37 | Each passage must preserve its own last passage-scroll position. |
| FR-38 | The active passage label in the header must always match the active tab and active question-sheet content. |
| FR-39 | Portrait is the primary design target. Landscape phones use the same interaction model, not a mini split view. |
| FR-40 | Rotating the device must preserve active passage, passage scroll, question-sheet open/closed state, question context, answers, and flags. |
| FR-40a | The floating ←/→ navigation arrows currently rendered in `ReadingTestPage` must be hidden in mobile exam mode. On phone, question navigation happens exclusively through the question-sheet navigator and passage tabs. |
| FR-40b | The existing `PassageControls` component (font size, line spacing, highlighter toggles) must not render on phone. Font size is controlled via the overflow menu's text-size slider. Line spacing uses a fixed default of `1.6` on mobile and is not user-adjustable. Highlighter is hidden per FR-99. |

### 4.7 Floating Questions Button

| ID | Requirement |
|----|-------------|
| FR-41 | A floating `Questions` button must exist on phone while the test is active and not yet submitted. |
| FR-42 | The button label must be dynamic and include current-passage progress in the form `Questions X/Y`. |
| FR-43 | The button must also surface small badges or indicators for unanswered and flagged question counts for the current passage. |
| FR-44 | The floating button must be reachable with one hand and must not collide with safe-area insets, system gestures, or submit/review controls. |

### 4.8 Question Sheet Model

| ID | Requirement |
|----|-------------|
| FR-45 | Tapping the floating button opens a near-fullscreen bottom sheet over the current route. The sheet must slide up from the bottom edge over ~250ms with ease-out timing. Closing must slide the sheet down with the same timing. A semi-transparent backdrop must fade in behind the sheet. |
| FR-46 | The sheet must be large enough to prioritize answering on phone, even if most passage text is hidden while open. |
| FR-47 | The sheet header must contain exactly: active passage label, question range (e.g. `Q1–Q13` derived from filtering questions by `passageId`), answered/total count for the current passage, and a close control. |
| FR-48 | Below the sheet header, render a synced passage-tab strip so students can switch passages while the sheet remains open. This is a **second rendered instance** of `MobilePassageTabs`, sharing the same `activePassageId` state atom as the page-level strip. Both strips must always be visually in sync. |
| FR-49 | The synced sheet tab strip and the page-level tab strip must drive the same active passage state. |
| FR-50 | Switching passages while the sheet is open must not close the sheet. It must immediately swap the sheet content to the new passage. |
| FR-51 | When switching to a different passage while the sheet is open, restore that passage's last known question-sheet scroll position and active question group if one exists. |
| FR-52 | On first visit to a passage in the sheet, focus the first unanswered question group for that passage. If no unanswered group exists, focus the first group. |
| FR-53 | The question sheet must contain a collapsible question navigator at the top of the body. Default state: a **single horizontally scrollable row** of question-number chips (~40px height). A `Show all` toggle expands the navigator into a wrapping multi-row grid so all questions are visible at once. Collapsing returns to the single row. |
| FR-54 | The question navigator must show answered, unanswered, current, and flagged states for the current passage only. Each chip uses a distinct color for each state: neutral for unanswered, filled for answered, highlighted border for current, and a small flag indicator dot for flagged. |
| FR-55 | Below the navigator, the sheet must render grouped question blocks with their instructions visible, matching the desktop right-column mental model. |
| FR-56 | Students must be able to answer inside the sheet using the same interactive controls as the desktop right column. |
| FR-57 | The sheet must not redirect, reload, or navigate away from the current test route. |

### 4.9 Question Sheet Close / Reopen Behavior

| ID | Requirement |
|----|-------------|
| FR-58 | Students consult the passage by closing the sheet; no `Peek Passage` tool is in scope for v1. |
| FR-59 | Reopening the sheet must return the student to the same passage, same question group, and same sheet scroll position they last had for that passage. |
| FR-60 | The sheet must close via all of the following: close button, swipe-down, backdrop tap, and browser/system back. |
| FR-61 | When the sheet closes, it must preserve all current UI state rather than resetting to the top. |
| FR-62 | If the review-summary screen is open, browser/system back must close that review screen before any leave-test behavior runs. |
| FR-63 | If neither sheet nor review summary is open, browser/system back must fall through to the existing leave/back protection flow. |

### 4.10 Answering And Flagging

| ID | Requirement |
|----|-------------|
| FR-64 | Add `Flag for review` support to IELTS Reading mobile and shared Reading state where needed. The `flaggedQuestions: Set<number>` state must live in the shared mobile scaffold's state, alongside `answers`, and be passed down to the question sheet and navigator. |
| FR-65 | Flagging must be question-specific, not passage-wide. |
| FR-66 | Flagged state must appear in the question navigator, in question blocks, and in the review summary. |
| FR-67 | Flagging must not modify answer values, score calculation, or autosubmit behavior. |
| FR-68 | Flagging must not block manual submit. |
| FR-69 | Flagged state must persist across autosave, resume, passage changes, and close/reopen cycles. Both `useTestAutoSave` (live) and `useSoloAutoSave` (solo/homework) must be extended to include `flaggedQuestions` in their persisted payload. |
| FR-69a | Neither `ReadingTestPage` nor `IELTSPracticeView` currently track `flaggedQuestions`. The implementor must add `flaggedQuestions: Set<number>` state to the shared mobile scaffold and wire it through the `QuestionNavigator` component (which already supports the `flaggedQuestions` prop). Flagging does not exist on desktop in v1 — it is mobile-only. |

### 4.11 Review Summary And Manual Submit

| ID | Requirement |
|----|-------------|
| FR-70 | Manual submit on phone must always route through a dedicated review-summary screen first. |
| FR-71 | The review summary must group questions by passage. |
| FR-72 | Each passage section must show answered, unanswered, and flagged counts. |
| FR-73 | Each passage section must render tappable question chips. |
| FR-74 | Tapping a question chip must switch to the correct passage and reopen the question sheet directly at the corresponding question/group. |
| FR-75 | Unanswered questions must be presented as warnings in the review summary. |
| FR-76 | Flagged questions must be presented as informational only in the review summary. |
| FR-77 | The review summary must not be a new route. It is an in-place overlay/screen on the current test host. |
| FR-78 | After the student chooses `Submit test` from the review summary, a final confirmation step must occur before manual submission completes. |
| FR-79 | The final confirmation step must preserve current desktop intent: unanswered questions are explicitly warned before submission completes. |
| FR-79a | The review-summary-first flow must intercept **both** submit pipelines: `useTestSubmission` (live mode, writes to Firebase RTDB) and `useSoloSubmission` (solo/homework, writes to Firestore). Each host passes its own submit handler to the shared scaffold as a callback prop. The scaffold gates the callback behind the review-summary → final-confirm flow. The scaffold never calls the submit pipeline directly. |

### 4.12 Autosubmit And Forced End States

| ID | Requirement |
|----|-------------|
| FR-80 | Timer-expiry submit must bypass the manual review-summary path. |
| FR-81 | If time expires while the question sheet is open, the sheet must close first, then existing time-up and auto-submit logic must take over. |
| FR-82 | Teacher force-submit and teacher-ended-session flows must bypass manual review-summary behavior and hand over to the existing forced-end pipeline. |
| FR-83 | The mobile UI must define explicit student-visible states for: `connection lost`, `reconnected`, `teacher ended session`, and `force submit`. |
| FR-84 | These interruption states must not be left to generic browser alerts or silent state changes. |
| FR-84a | Existing overlay components (`TimeUpOverlay`, `ExtraTimeBanner`, `TestWaitingOverlay`, `ReMarkingModal`) must always render **above** both the question sheet and review summary using a higher z-index. When `TimeUpOverlay` appears, the question sheet must be force-closed (not animated — instant hide) before the overlay takes over. The review summary must also close. |
| FR-84b | When mobile exam mode is active and `practiceContext.type === 'homework'`, the `useFullscreenMode` hook must receive `enabled: false` to disable fullscreen enforcement. Copy-paste detection, keyboard shortcut detection, and integrity tracking remain active. |

### 4.13 Autosave, Resume, And Persistence

| ID | Requirement |
|----|-------------|
| FR-85 | Healthy autosave must remain silent on phone. No persistent `Saved` badge is shown in the normal path. |
| FR-86 | Autosave failure must show a toast notification. |
| FR-87 | Autosave failure toasts must auto-dismiss after a short duration. |
| FR-88 | The mobile implementation must dedupe failure toasts so repeated save failures do not spam the student continuously. |
| FR-89 | Live mode keeps Firebase-backed autosave and re-entry behavior. If the session is still active, re-entry goes straight back into the test. |
| FR-90 | Solo and homework persistence must use `src/core/platform/storage.ts`, not direct `localStorage`. |
| FR-91 | Solo resume must restore: answers, flags, active passage, passage scroll positions, question-sheet open/closed state, per-passage sheet scroll positions, active question groups, and text-size preference. |
| FR-91a | Both `useSoloAutoSave` and `useTestAutoSave` must be extended to include these additional fields in their persisted payload: `flaggedQuestions` (array of question numbers), `activePassageId`, `passageScrollByPassage` (object), `questionSheetOpen` (boolean), `questionSheetScrollByPassage` (object), `activeQuestionByPassage` (object), `activeQuestionGroupByPassage` (object), and `textSize` (number). |
| FR-91b | Scroll positions must be debounced before save: only persist when the user stops scrolling for ≥500ms. Do not save on every pixel of scrolling. Answers and flags save immediately (on change). |
| FR-92 | Solo mode may still offer `Resume` vs `Start New` when allowed by existing solo rules. |
| FR-93 | Homework mode must preserve homework-specific restrictions. If homework rules do not allow restart, mobile must auto-resume instead of offering `Start New`. |
| FR-94 | Homework timer behavior must remain anchored to the existing homework contract rather than being reinterpreted for mobile. |

### 4.14 Text Size And Reading Tools

| ID | Requirement |
|----|-------------|
| FR-95 | Mobile v1 must expose a text-size slider from the overflow menu. |
| FR-96 | The slider must control both passage body text and question-sheet body text. It must not resize tabs, navigator chips, or primary action chrome. |
| FR-97 | The text-size slider range is 14px to 22px with 1px steps and a 16px default. |
| FR-98 | Text-size preference must persist per student across sessions. |
| FR-99 | Mobile v1 must hide Reading highlighter controls. |
| FR-100 | Hiding the highlighter UI must not break the canonical Reading renderer or stored highlight contract. Mobile code must not fork highlight storage. |

### 4.15 Visual Direction And Interaction Quality

| ID | Requirement |
|----|-------------|
| FR-101 | The mobile redesign should be visually consistent with the current test surface language. This is primarily a layout and interaction redesign, not a new visual theme. |
| FR-102 | Mobile controls must be touch-first with minimum comfortable hit areas. |
| FR-103 | The sheet, tabs, navigator, and review chips must not rely on hover-only states. |
| FR-104 | No new `@mantine/*` imports are allowed. |
| FR-105 | The mobile Reading implementation must not depend on `AppShell`, glassmorphism, gradients, or student-shell right-rail patterns. |

### 4.16 Post-Submit Behavior

| ID | Requirement |
|----|-------------|
| FR-106 | After submission completes on mobile, the existing host-specific post-submit flow runs unchanged. Live mode navigates to the waiting room with results. Solo/homework mode shows results inline then navigates (academic record or homework list). Mobile does not add a new post-submit screen. |
| FR-107 | The mobile scaffold must clean up all mobile-specific overlays (sheet, review summary, floating button) before the host's post-submit navigation executes. |

### 4.17 Mobile Line Spacing

| ID | Requirement |
|----|-------------|
| FR-108 | Line spacing is not user-adjustable on mobile v1. Mobile uses a fixed line-spacing value of `1.6` for both passage and question-sheet body text. |
| FR-109 | The existing `PassageControls` line-spacing slider must not render on phone. |

---

## 5. Non-Goals (Out of Scope)

| Non-Goal | Reason |
|----------|--------|
| Desktop Reading redesign | This PRD is phone-only |
| Tablet Reading redesign | Tablet keeps current split-view for v1 |
| Listening mobile redesign | Separate skill with different controls |
| Writing mobile redesign | Different workflow and surface contract |
| THCS mobile redesign | Different question and passage model |
| New Reading data model | Existing Reading ownership must stay intact |
| New result route | Review summary and question sheet remain in-place overlays |
| New highlighter UX on mobile | Explicitly deferred; mobile v1 hides the tool |
| Simultaneous passage-plus-large-question split view on phone | Rejected in favor of one-hand answer focus |
| Raw browser storage or raw screen-width feature logic in new code | Blocked by mobile portability rules |

---

## 6. Design Considerations

### 6.1 Core Interaction Model

Closed state:

`Header -> Sticky Passage Tabs -> Passage Content -> Floating Questions Button`

Open question-sheet state:

`Header -> Sheet -> Sheet Header -> Synced Passage Tabs -> Compact Navigator -> Question Groups`

Review state:

`Header -> Review Summary -> Passage Sections -> Question Chips -> Final Confirm`

### 6.2 Important Conflict Resolutions

1. **Desktop parity vs phone reality**  
   The desktop right column remains the behavioral model for question content, but not the simultaneous side-by-side layout. The phone version prioritizes a large answer sheet and exact reopen memory instead.

2. **Passage switching while sheet is open**  
   Because the sheet stays open on passage switch, the sheet includes a synced tab strip below its header. This keeps passage switching available even when the passage body is mostly hidden.

3. **Existing desktop submit confirm vs new phone review summary**  
   Desktop may keep its current unanswered-question confirm. Phone must upgrade to review-summary-first submit and use a host-controlled final confirmation step to avoid double-confirm behavior.

4. **TwoColumnLayout preservation from PRD-0025**  
   The repo's prior Reading contracts remain true for desktop/tablet. This PRD narrows the exception to phone presentation only.

### 6.3 Suggested Phone Layout Tokens

- Header height target: `48px`
- Passage tab height target: `44px`
- Floating button minimum touch target: `48px`
- Question-sheet max height: large enough to prioritize answering; do not design for split-view passage reading underneath
- Safe-area padding: required on top and bottom actions

### 6.4 Review Summary Severity Rules

- Answered: neutral or positive state
- Unanswered: warning state
- Flagged: informational state only

### 6.5 Text Size Application Rules

- Text-size slider affects passage paragraphs and question body text
- It does not resize timer, passage tabs, navigator chips, or submit/review action labels
- Very large text must wrap instead of clipping

---

## 7. Technical Considerations

### 7.1 Files To Modify

| File | Required Change |
|------|-----------------|
| `src/skills/reading/components/ReadingTestPage.tsx` | Add phone-mode branch via `useMobileExamMode()`. When `isMobileExamMode === true`, render `MobileReadingExamScaffold` instead of `TwoColumnLayout` + `InspiraFooterNav` + floating arrows. Pass `ReadingHeader`-equivalent props, `PassageRenderer`, answers, submit handler, timer, interruption callbacks. Desktop/tablet rendering stays unchanged. |
| `src/components/practice/IELTSPracticeView.tsx` | **(Phase 0 prerequisite: migrate to `useNavigation` and platform storage first.)** Add the same `useMobileExamMode()` branch. Pass `PassageRenderer_v2`, `useSoloSubmission.handleSubmit`, solo timer, and homework context to the shared scaffold. Desktop/tablet rendering stays unchanged. |
| `src/components/test/IELTSQuestionsPanel.tsx` | Support phone sheet embedding without changing answer semantics. May need a `compact` or `embedded` layout prop to suppress its own internal scrolling when the sheet handles scroll. |
| `src/components/test/QuestionNavigator.tsx` | Already supports `flaggedQuestions` prop. May need a `collapsible` variant prop and horizontal-scroll single-row mode for the mobile sheet navigator. |
| `src/components/test/InspiraFooterNav.tsx` | Keep desktop/tablet behavior; ensure phone mode does not render this footer navigator. |
| `src/components/test/ReadingHeader.tsx` | Keep desktop behavior; phone mode does not render this component. |
| `src/components/test/TestHeader.tsx` | Keep desktop behavior for solo/homework; phone mode does not render this component. |
| `src/hooks/test/useTestSubmission.ts` | Remove the `window.confirm` call for unanswered questions. Instead, export the unanswered count so the host/scaffold can gate manual submit through the review-summary flow. The hook must accept a `skipConfirm: boolean` parameter (default `false` for backward compatibility). |
| `src/hooks/solo/useSoloSubmission.ts` | Same pattern: the scaffold gates manual submit through review-summary. The hook's `handleSubmit(isAutoSubmit)` remains unchanged but the scaffold never calls it directly for manual submits. |
| `src/hooks/test/useTestAutoSave.ts` | Extend persisted payload to include `flaggedQuestions`, `activePassageId`, `passageScrollByPassage`, `questionSheetOpen`, `questionSheetScrollByPassage`, `activeQuestionByPassage`, `activeQuestionGroupByPassage`, and `textSize`. Scroll fields are debounced (≥500ms). |
| `src/hooks/solo/useSoloAutoSave.ts` | Same extension as `useTestAutoSave`. |
| `src/core/platform/hooks/useScreenSize.ts` or a new companion hook | Support or compose the shared mobile exam classifier without spreading raw checks into feature code. |
| `src/core/platform/storage.ts` consumers in solo/homework Reading | Use platform storage abstraction for persisted phone resume state. |
| `src/hooks/test/useFullscreenMode.ts` | Ensure the hook respects `enabled: false` when mobile exam mode is active for homework. |

### 7.2 Files To Create

| File | Purpose |
|------|---------|
| `src/core/platform/hooks/useMobileExamMode.ts` | Single source of truth for phone Reading activation, including QA override |
| `src/components/test/mobile/MobileReadingExamScaffold.tsx` | Shared phone Reading presentation scaffold used by live and practice/homework hosts |
| `src/components/test/mobile/MobileReadingHeader.tsx` | Compact phone header with timer, passage label, and overflow menu |
| `src/components/test/mobile/MobilePassageTabs.tsx` | Sticky passage tab strip shared between page and sheet contexts |
| `src/components/test/mobile/MobileQuestionsFab.tsx` | Dynamic floating `Questions X/Y` button with unresolved badges |
| `src/components/test/mobile/MobileQuestionSheet.tsx` | Near-fullscreen phone question sheet wrapper |
| `src/components/test/mobile/MobileReviewSummary.tsx` | Passage-grouped pre-submit review screen |
| `src/components/test/mobile/MobileTextSizeControl.tsx` | Slider UI used from overflow menu |
| `src/components/test/mobile/MobileInstructionsModal.tsx` | Read-only modal for overflow menu `Instructions / Help`: mode-specific rules recap + controls help |

### 7.2a MobileReadingExamScaffold Props Contract

The scaffold is a **pure presentation component** consumed by both hosts. It must accept these props from the host:

```typescript
interface MobileReadingExamScaffoldProps {
  // Content
  passages: Passage[];
  questions: Question[];
  activePassageId: string;
  onPassageChange: (id: string) => void;
  PassageRendererComponent: React.ComponentType<PassageRendererProps>; // host provides its own renderer
  currentPassage: Passage | null;

  // Answers & Flagging
  answers: Record<number, any>;
  onAnswerChange: (questionNumber: number, answer: any) => void;
  flaggedQuestions: Set<number>;
  onToggleFlag: (questionNumber: number) => void;

  // Timer
  timeRemaining: number;
  formatTime: (seconds: number) => string;

  // Submit (host provides its own pipeline)
  onManualSubmit: () => Promise<void>; // called AFTER review-summary + final confirm
  onAutoSubmit: () => Promise<void>;   // called by timer/force flows, bypasses review
  testSubmitted: boolean;
  isSubmitting: boolean;

  // Mode
  mode: 'live' | 'solo' | 'homework';
  isPaused: boolean;

  // Interruption callbacks (host-owned)
  isConnected: boolean;
  sessionStatus: string;

  // Text size
  fontSize: number;
  onFontSizeChange: (size: number) => void;

  // Resume state (optional, from autosave)
  initialMobileState?: SavedMobileState | null;

  // Anti-cheat passthrough
  antiSelectClass?: string;
}
```

The scaffold **never imports hooks or services directly**. It receives everything from the host.

### 7.3 Shared-State Contract To Add

The phone Reading hosts must explicitly track:

- `activePassageId`
- `passageScrollByPassage`
- `questionSheetOpen`
- `questionSheetScrollByPassage`
- `activeQuestionByPassage`
- `activeQuestionGroupByPassage`
- `flaggedQuestions`
- `reviewSummaryOpen`
- `textSize`

Do not leave these as incidental local variables spread across multiple child components with unclear ownership.

### 7.4 Submit-Flow Refactor Rule

The Reading hosts must own manual submit flow in this order:

1. student taps `Submit test` (from overflow menu or review shortcut)
2. review summary opens (in-place overlay, not a route)
3. student optionally jumps back into unanswered/flagged locations
4. student confirms final submit (confirmation modal with unanswered-count warning)
5. scaffold calls `onManualSubmit()` prop → host's existing submit pipeline executes

**Two separate pipelines exist — the scaffold must not know which one runs:**

- **Live mode:** `ReadingTestPage` passes `useTestSubmission.handleSubmit(false)` as `onManualSubmit`. The hook's `window.confirm` must be removed (or bypassed via `skipConfirm: true`) because the scaffold already shows the review-summary + confirm flow.
- **Solo/Homework mode:** `IELTSPracticeView` passes `useSoloSubmission.handleSubmit(false)` as `onManualSubmit`. Same pattern.

For **autosubmit** (timer expiry, force-submit), the scaffold calls `onAutoSubmit()` which maps to `handleSubmit(true)` in both hooks, bypassing the review-summary entirely.

### 7.5 Platform-Abstraction Rules

- Use `src/core/platform/hooks/useScreenSize.ts` only through a shared phone-classification layer
- Use `src/core/platform/storage.ts` for solo/homework persisted state
- Do not add new direct `window.innerWidth`, raw `matchMedia`, or direct `localStorage` calls in Reading feature code

### 7.6 QA Override Contract

The mobile classifier must support a QA-only session-scoped override with three states:

- `auto`
- `force-mobile`
- `force-standard`

This is for verification only and must not be student-visible in production UI.

### 7.7 Z-Index Hierarchy

Mobile exam mode introduces multiple overlay layers. The z-index order must be:

| Layer | z-index range | Example |
|-------|---------------|---------|
| Page content (passage, tabs) | auto | Passage body, page-level tab strip |
| Floating Questions button | 1000 | `MobileQuestionsFab` |
| Question sheet backdrop | 2000 | Semi-transparent overlay behind sheet |
| Question sheet | 2001 | `MobileQuestionSheet` |
| Review summary | 2002 | `MobileReviewSummary` |
| Overflow menu | 3000 | Dropdown from header |
| System overlays (TimeUp, Waiting, Connection) | 9000+ | `TimeUpOverlay`, `TestWaitingOverlay`, `ConnectionMonitor` indicator |
| Final confirm modal | 9500 | Submit confirmation dialog |

When `TimeUpOverlay` or `TestWaitingOverlay` triggers, the sheet and review summary are force-closed (instant, no animation) so the system overlay has full viewport control.

### 7.8 Browser Back-Button Integration

The mobile scaffold must push history entries to intercept the browser/system back button:

1. When the question sheet opens → push a history entry.
2. When the review summary opens → push a history entry.
3. `popstate` listener closes the topmost overlay (review → sheet → nothing).
4. When neither sheet nor review is open, back falls through to the host's existing `useBeforeUnloadWarning` protection.
5. The scaffold must not break `useBeforeUnloadWarning` behavior. The `beforeunload` event and the `popstate`-based overlay closing are **independent mechanisms** — `beforeunload` fires on tab close/navigation, `popstate` fires on back-button.

---

## 8. Success Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| One-hand usability | Manual QA on phone can complete passage switch, open questions, answer, flag, review, and submit without desktop-style zooming or lateral scrolling | Pass |
| No route churn | Opening questions and review never causes route change, reload, or new tab | 100% |
| Phone continuity | Resume restores exact phone reading context for supported modes | Pass |
| Mode parity | Live, solo, and homework all honor the same phone Reading interaction model while keeping their own persistence/submit rules | Pass |
| Desktop safety | Desktop/tablet split view remains functional and unchanged in core behavior | Pass |
| Mobile trust | Healthy autosave is silent; failure, disconnection, teacher-end, and time-up states are visible and understandable | Pass |

---

## 9. Open Questions

**Resolved in v2 (no longer open):**

- ~~Which PassageRenderer the mobile scaffold uses~~ → Each host passes its own renderer as a prop (Decision A1)
- ~~Whether IELTSPracticeView portability violations are in scope~~ → Yes, Phase 0 prerequisite (Decision A4)
- ~~Where flagging state lives and persists~~ → Shared scaffold state + full persist in both autosave hooks (Decision B1)
- ~~How new mobile state fields persist~~ → Extend existing autosave hooks with debounced scroll positions (Decision B2/B3)
- ~~Whether ReadingHeader.tsx or TestHeader.tsx is used on mobile~~ → Neither; both are replaced by `MobileReadingHeader` on phone (Decision FR-34b)
- ~~How fullscreen anti-cheat interacts with the sheet~~ → Fullscreen disabled on mobile; other anti-cheat stays active (Decision C1)

**Non-blocking implementation decisions** that may be documented during build:

- whether `QuestionNavigator.tsx` gains a `collapsible` prop or the mobile scaffold creates a separate `MobileQuestionNavigator` wrapper
- whether the QA override is exposed through existing diagnostics tooling or a dev-only session setting panel
- exact CSS transition curves for the sheet slide-up animation (specified as ~250ms ease-out; fine-tuning is allowed)

---

## 10. Edge Cases And Required Preventions

| Edge Case | Required Prevention |
|----------|---------------------|
| Student switches passage while the question sheet is open | Keep the sheet open, sync the active passage immediately, restore that passage's last sheet scroll and question-group context, and update header counts |
| Student closes the sheet to reread the passage | Preserve active question-group context and sheet scroll so reopening returns to the exact same location |
| Student uses system back while the sheet is open | Close the sheet first; do not trigger leave-test behavior |
| Student uses system back while the review summary is open | Close the review summary first; do not trigger leave-test behavior |
| Student opens review summary and taps a question from another passage | Switch passage, restore that passage, and reopen the sheet directly at the tapped question/group |
| Student has unanswered questions at manual submit | Review summary warns clearly; final confirmation still allows submit |
| Student has flagged questions at manual submit | Show flags informationally only; do not block submit |
| Time expires while the sheet is open | Close the sheet, then hand off to existing time-up and auto-submit flow |
| Teacher force-submits while the student is in the sheet or review summary | Replace local mobile UI layers with the force-submit / post-submit flow immediately |
| Live connection drops during phone use | Show connection-loss state without destroying local question context; recover gracefully on reconnect |
| Autosave fails repeatedly | Show deduped failure toasts instead of spamming every save attempt |
| Homework flow disallows restart | Do not show `Start New`; auto-resume according to homework rules |
| Device rotates while the sheet is open | Preserve answers, active passage, active question, sheet/review state, and scroll memory |
| Large text size causes chip or tab overflow | Allow wrapping/truncation in non-critical chrome; never clip primary text content |
| Existing highlight data exists while mobile highlighter UI is hidden | Do not mutate or corrupt highlight state; mobile must not fork the canonical renderer contract |
| Device classification is ambiguous | Fail safely to standard desktop/tablet layout and rely on QA override for testing |
| Homework requires fullscreen but mobile exam mode is active | Disable `useFullscreenMode` when `isMobileExamMode === true`. Log the override but do not penalize. Other anti-cheat (copy-paste, integrity) stays active |
| Two passage-tab strips render simultaneously (page + sheet) | Both are separate React component instances sharing the same `activePassageId` state. No additional sync logic needed beyond reading the same state atom. Ensure both scroll to the active tab on passage change |
| Student opens overflow menu while sheet is open | Overflow menu renders at z-index 3000, above the sheet at 2001. Tapping a menu item (e.g. `Review answers`) closes the menu, then opens the review summary. The sheet closes if review opens |
| Back button pressed rapidly multiple times | Each `popstate` only closes one layer. Rapid presses close review → sheet → trigger leave protection. No double-navigation or race |
| Solo/homework autosave payload grows with new mobile fields | Keep additional fields in a nested `mobileState` key within the autosave payload so existing consumers that only read `answers` and `currentQuestion` are not broken by the schema extension |
| Post-submit: mobile scaffold still has sheet/review open | Scaffold must listen for `testSubmitted` prop change → immediately force-close all overlays (sheet, review, floating button hidden) before the host navigates away |

---

## 11. Implementation Phases

| Phase | Focus | Estimated Duration |
|-------|-------|--------------------|
| Phase 0 | **Prerequisite cleanup:** Migrate `IELTSPracticeView.tsx` from direct `useNavigate`/`localStorage` to `useNavigation` and platform storage. Standalone commit. | 0.5-1 day |
| Phase 1 | Device-classification foundation (`useMobileExamMode`), QA override, and phone scaffold entry points in both hosts. Verify desktop/tablet rendering is unaffected. | 1-2 days |
| Phase 2 | Mobile header (replacing both `ReadingHeader` and `TestHeader` on phone), passage tabs, floating button, and question sheet shell with slide-up animation. Hide `InspiraFooterNav`, `PassageControls`, and floating arrows on phone. | 2-3 days |
| Phase 3 | Collapsible question navigator inside the sheet, grouped question blocks via `IELTSQuestionsPanel` embedding, and flagging support (`flaggedQuestions` state + `QuestionNavigator` wiring). | 2-3 days |
| Phase 4 | Review-summary screen, final confirmation modal, and submit-flow refactor: add `skipConfirm` to `useTestSubmission`, gate both pipelines through scaffold's review-summary → confirm flow. | 2-3 days |
| Phase 5 | Autosave extension (add `mobileState` key to both `useTestAutoSave` and `useSoloAutoSave`), resume restoration, per-passage scroll/question memory with debounced persistence, and mode-specific restore rules. | 2-3 days |
| Phase 6 | Interruption handling (overlay z-index hierarchy, force-close on TimeUp/ForceSubmit), browser back-button history integration, orientation persistence, fullscreen disable for mobile homework, post-submit cleanup. | 1-2 days |
| Phase 7 | Overflow menu (text-size slider, instructions modal, review shortcut, leave/submit), text-size persistence, line-spacing fixed default. | 1-2 days |
| Phase 8 | Regression tests, mobile QA on real devices, and documentation crosscheck. | 2-3 days |

---

## 12. Final Recommendation

Implement this as a **shared phone Reading scaffold** used by both live and practice/homework Reading hosts.

Do not:

- create a second Reading system
- let each host invent its own phone behavior
- keep the desktop footer navigator alive on phone
- leave submit confirmation trapped inside a generic browser `confirm()` path

Do:

- keep desktop/tablet stable
- define exact phone state ownership
- make the question sheet behave like the desktop right column for the current passage
- preserve mode-specific autosave/resume/submission ownership
- encode all interruption and restore rules explicitly

This gives juniors a concrete implementation map while preserving the app's existing Reading architecture.

---

*PRD Status: v2 gap-closed — Ready for review and task generation*  
*Changes from v1: 17 gaps closed, 12 new FRs added (FR-34a/b, FR-40a/b, FR-69a, FR-79a, FR-84a/b, FR-91a/b, FR-106-109), Phase 0 prerequisite added, scaffold props contract specified, z-index hierarchy defined, browser back-button integration specified, 8 new edge cases documented*  
*Next Step: Generate the implementation task list after approval*
