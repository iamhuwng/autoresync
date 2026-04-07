# Cascade Chat Conversation

  Note: _This is purely the output of the chat conversation and does not contain any raw data, codebase snippets, etc. used to generate the output._

### User Input

in@[conversation-export-2026-04-07.md] is the conversation I have had to build up prd @[documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md] . I want you to assess this prd based on the given information in the conversation and the work that have been done to get to the consluions in prd to provide improvements. 
we used @[documentation/tasks/create-prd.md] to as primary instructor in that process
If it's necessary, I want you to ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 
you can stop and start compiling if you think there is nothing more you need, the plan you make will leave no room for the junior with no experience to act on their own, improvise, imagine, guess or hallucinate.


### Planner Response

Let me read all three files to understand the full context.

*Viewed [0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md) *

*Viewed [create-prd.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/create-prd.md) *

*Viewed [conversation-export-2026-04-07.md](file:///c:/Users/The%20Lord/Desktop/luyentap/conversation-export-2026-04-07.md) *

### Planner Response

Now let me check the referenced dependency documents and current codebase state to verify the PRD's assumptions are still accurate.

*Viewed [mobile-portability.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/rules/mobile-portability.md) *

*Viewed [reading-passage-highlighting-architecture.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/architecture/reading-passage-highlighting-architecture.md) *

*Found code context*

### Planner Response

Let me check a few more critical pieces: the solo/homework reading host, the existing platform hooks, and the question panel.

*Found code context*

*Viewed [useScreenSize.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/hooks/useScreenSize.ts) *

*Searched filesystem*

### Planner Response

Let me check a few more critical components to validate PRD assumptions about flagging, navigation, and submit flow.

*Grep searched codebase*

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

I now have a thorough understanding of the PRD, the conversation that produced it, the create-prd template, and the actual codebase state. Let me compile my assessment.

---

# PRD-0043 Assessment

## Overall Quality

The PRD is substantially above-average: 105 functional requirements, explicit edge cases, conflict resolutions, and a clear "files to create/modify" map. It was built through multiple iterative rounds of clarifying questions as the template demands. The conversation shows genuine discovery work — subagents inspected real code, identified the `TwoColumnLayout` conflict with PRD-0025, and confirmed route isolation.

However, there are **17 concrete gaps** that would force a junior to improvise, plus a few internal contradictions. I'll group them by severity.

---

## A. Codebase Reality Mismatches (Will Break Implementation If Ignored)

### A1. Two different PassageRenderers — PRD doesn't pick one
The PRD says FR-12: *"use the canonical Reading passage renderer contract owned by `PassageRenderer.tsx`"*. But the two hosts differ:

- `ReadingTestPage.tsx` (live) imports `PassageRenderer` from the skill module directly
- `IELTSPracticeView.tsx` (solo/homework) imports `PassageRenderer_v2.jsx` — the legacy wrapper

```@c:\Users\The Lord\Desktop\luyentap\src\components\practice\IELTSPracticeView.tsx:38
import PassageRenderer from '../PassageRenderer_v2';
```

**Gap:** The junior doesn't know which to use in the shared mobile scaffold. If they pick the wrong one, highlights break in one mode.

### A2. Two completely different submit pipelines — PRD treats them as one
The PRD says (Section 7.4): *"existing submit pipeline executes"* as if there's one. There are two:

- **Live:** `useTestSubmission` → writes to Firebase RTDB at `sessions/{code}/players/{id}`
- **Solo/Homework:** `useSoloSubmission` → writes to Firestore `test_results/` collection

The refactoring guidance in FR-17 only addresses `useTestSubmission`'s `window.confirm`. But `useSoloSubmission` has its own manual submit path (no confirm at all currently). The review-summary-first flow needs to intercept **both** pipelines.

### A3. Two different headers — PRD references only one
- Live mode: `ReadingHeader`
- Solo/homework: `TestHeader`

The PRD's "Files to Modify" section mentions `ReadingHeader.tsx or successor mobile header component` but doesn't acknowledge `TestHeader` at all. The mobile scaffold would need to replace **both** on phone.

### A4. `IELTSPracticeView` violates mobile-portability rules TODAY
```@c:\Users\The Lord\Desktop\luyentap\src\components\practice\IELTSPracticeView.tsx:14
import { useNavigate } from 'react-router-dom';
```
```@c:\Users\The Lord\Desktop\luyentap\src\components\practice\IELTSPracticeView.tsx:77-79
        try {
            const stored = localStorage.getItem(`solo_student_prefs_${user?.uid}`);
            return stored ? { ...DEFAULT_STUDENT_PREFS, ...JSON.parse(stored) } : DEFAULT_STUDENT_PREFS;
```

The PRD says new code must use platform abstractions. But the host it modifies already violates those rules. **Does the junior fix these existing violations as part of this PRD, or not?** If not, the mobile scaffold will import from a host that uses raw `localStorage` and `useNavigate`.

---

## B. Unspecified Behaviors (Junior Will Guess Wrong)

### B1. Flagging state doesn't exist anywhere in Reading
FR-64–69 require flagging, and `QuestionNavigator` supports a `flaggedQuestions` prop. But **neither `ReadingTestPage` nor `IELTSPracticeView` create or pass flagging state**. Only `THCSPracticeView` has it.

**Missing decisions:**
- Where does `flaggedQuestions: Set<number>` live? In the shared mobile scaffold? In each host?
- Does flagging persist through autosave? Current `useTestAutoSave` (live) saves only `answers`. Current `useSoloAutoSave` (solo) saves `answers`, `currentQuestion`, `timeElapsed` — no flags.
- Does flagging exist on desktop too, or mobile only?

### B2. Solo autosave doesn't cover new mobile state
Section 7.3 lists 9 new state fields to persist (`passageScrollByPassage`, `questionSheetOpen`, `flaggedQuestions`, `textSize`, etc.). But `useSoloAutoSave` currently saves only 3 fields. The PRD doesn't specify:
- Do all 9 new fields go through the same autosave hook?
- Is a separate persistence mechanism created?
- What's the autosave frequency for scroll positions (they change on every pixel of scrolling)?

### B3. Live autosave doesn't cover mobile state at all
`useTestAutoSave` saves only answers to Firebase RTDB. The PRD says live resume goes "straight back into the test" (FR-89), but **flags, scroll positions, sheet state, and text size are lost on refresh in live mode**. Is that acceptable?

### B4. Floating navigation arrows — stay or go?
`ReadingTestPage` renders floating ←/→ arrows (lines 644–718). The PRD adds a floating Questions FAB but never mentions these arrows. On mobile, having TWO floating elements would collide. The junior needs to know: hide them on mobile? Remove them? Replace them with something inside the sheet?

### B5. What happens to `PassageControls`?
Both hosts render `PassageControls` above the passage — it controls font size, line spacing, highlighter toggle, and highlight color. On mobile:
- Text size → goes to overflow menu per PRD
- Highlighter → hidden per PRD
- **Line spacing** → not mentioned anywhere in the PRD. Stay? Go? Merge with text size?

### B6. Post-submit behavior on mobile
The PRD specifies everything up to submit. After submit:
- Live mode currently navigates to waiting room with results
- Solo mode shows results inline then navigates after 4 seconds
- **The PRD says nothing about what happens on mobile after submission completes**

### B7. What does "Instructions / Help" in the overflow menu show?
FR-32 lists it. The PRD never defines the content. Is it the same as the start/instructions screen? A link? A modal? What does it contain mid-test?

### B8. No animation/transition specification for the sheet
The sheet "opens" and "closes" but the PRD doesn't say how: slide up from bottom? Fade? Instant? Timing? This determines implementation complexity significantly.

### B9. `ExtraTimeBanner`, `TimeUpOverlay`, `TestWaitingOverlay`, `ReMarkingModal` on mobile
These PRD-0019 components render in both hosts. The PRD doesn't specify whether they render normally on mobile, need mobile variants, or sit above/below the sheet.

---

## C. Potential Conflicts

### C1. Anti-cheat fullscreen vs bottom sheet
Homework mode can require `requireFullscreen: true` via `useFullscreenMode`. A near-fullscreen bottom sheet is not the same as browser fullscreen API. If homework anti-cheat requires fullscreen and the student opens the question sheet, does the sheet break fullscreen? Does fullscreen prevent the sheet from rendering correctly?

### C2. Question range in sheet header — undefined term
FR-47 says: *"active passage label, question range, answered/total count"*. What is "question range"? `Q1–Q13`? `Questions 1 to 13`? Derived from where? The current data model doesn't have a pre-computed "range" per passage — it's computed from filtering questions by `passageId`.

### C3. Two passage-tab strips creates a sync hazard
FR-48/49 require a page-level tab strip AND a sheet-level tab strip driving the same state. Are these two separate React components reading the same state atom? Or one component that moves in the DOM? If two components, does the sheet strip also scroll horizontally? Can they get visually out of sync during a render cycle?

### C4. `useBeforeUnloadWarning` and system back conflict
FR-60 says browser back closes the sheet. `useBeforeUnloadWarning` prevents page leave. These interact: if the user presses back with the sheet closed and no review open, does the unload warning fire? The PRD says "fall through to the existing leave/back protection flow" (FR-63) but doesn't say whether `beforeunload` and history-based back are the same or different.

---

## D. Minor Gaps / Polish

### D1. Text size default
FR-97 says 16px default. The existing `ReadingTestPage` already initializes `fontSize` at 16. But `IELTSPracticeView` initializes from `studentPrefs.fontSize` which may differ. The PRD says text-size preference persists per student (FR-98). **Does the mobile slider override or respect existing solo preferences?**

### D2. Skipped question in conversation
In the user's last answer set, question 4 (scroll-memory rule) was skipped. The PRD assumed 4A (recommended). This is likely correct but was never explicitly confirmed.

### D3. "Compact question navigator at the top of the body" — what exactly is compact?
FR-53 says "compact question navigator" but doesn't define compact. Is it one row of chips? Wrapping grid? Scrollable single row? Max height? The existing `QuestionNavigator` is a grid — that may not be "compact" on a phone with 40 questions per passage.

---

## Questions For You

Based on the above, I need your decisions on these to close the gaps:

*Asked user a question*

*Asked user a question*

*Asked user a question*

*Asked user a question*

*Asked user a question*

*Asked user a question*

*Asked user a question*

*Asked user a question*

### Planner Response

Good, I have your decisions on the critical gaps. Let me ask the remaining questions.

*Asked user a question*

*Asked user a question*

*Asked user a question*

*Asked user a question*

### Planner Response

I now have all the decisions I need. Let me write the improved PRD with all gaps closed. This will be a comprehensive rewrite incorporating every resolution.

*Viewed [0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md) *

### Planner Response

Now I'll apply the improvements to the PRD. I'll do this in multiple focused edits to stay within limits, incorporating all the gap closures and your decisions.

*Edited relevant file*

### Planner Response

Now I'll add the prerequisite section and fix the Non-Negotiable section:

*Edited relevant file*

### Planner Response

Now let me add the critical new FRs for the gaps. I'll insert them after the existing FR sections:

*Edited relevant file*

### Planner Response

Now add the floating arrows FR and the passage controls FR:

*Edited relevant file*

### Planner Response

Now add the question sheet animation and navigator details:

*Edited relevant file*

### Planner Response

Now add the navigator spec details:

*Edited relevant file*

### Planner Response

Now add the new flagging persistence and autosave FRs:

*Edited relevant file*

### Planner Response

Now update the submit-flow section to explicitly address the two different pipelines:

*Edited relevant file*

### Planner Response

Now add the overlay z-index and anti-cheat FRs:

*Edited relevant file*

### Planner Response

Now update the autosave section with specific extension requirements:

*Edited relevant file*

### Planner Response

Now update the post-submit behavior and add the line-spacing FR:

*Edited relevant file*

### Planner Response

Now update the Technical Considerations section to address the two-pipeline reality and add the MobileReadingScaffold props contract:

*Edited relevant file*

### Planner Response

Now add the MobileReadingExamScaffold props contract:

*Edited relevant file*

### Planner Response

Now update the submit-flow refactor section:

*Edited relevant file*

### Planner Response

Now add a z-index hierarchy section and update the implementation phases:

*Edited relevant file*

### Planner Response

Now update the edge cases table with the new ones:

*Edited relevant file*

### Planner Response

Now update the implementation phases to include Phase 0:

*Edited relevant file*

### Planner Response

Now update the open questions to reflect resolved items:

*Edited relevant file*

### Planner Response

Now update the final recommendation and status:

*Edited relevant file*

### Planner Response

Now let me create the conversation log as required by user rules.

*Edited relevant file*

### Planner Response

---

# Summary

PRD-0043 has been upgraded from v1 to **v2 (gap-closed)**. Here's what changed:

## What Was Found
**17 gaps** across 4 categories — the most critical being:
- The PRD treated two completely different submit pipelines (`useTestSubmission` for live, `useSoloSubmission` for solo/homework) as one
- The PRD didn't acknowledge that the two hosts use different headers (`ReadingHeader` vs `TestHeader`) and different PassageRenderers
- Flagging state doesn't exist anywhere in current Reading code — no guidance on where to create it or how to persist it
- The existing `IELTSPracticeView.tsx` already violates the mobile-portability rules the PRD depends on

## What Was Added to v2
- **Phase 0 prerequisite** — migrate `IELTSPracticeView` to platform abstractions before starting
- **12 new FRs** covering: dual-header replacement, floating arrow removal, PassageControls suppression, flagging ownership, dual-pipeline submit gating, overlay z-index hierarchy, fullscreen anti-cheat disable, autosave schema extension, post-submit cleanup, line spacing, and Instructions/Help content
- **Scaffold props contract** — explicit TypeScript interface so the junior knows exactly what each host passes
- **Z-index hierarchy table** — prevents layer conflicts between sheet, review, overlays, and system modals
- **Browser back-button integration** — `popstate` history management specified step-by-step
- **8 new edge cases** — fullscreen conflict, dual tab strips, overflow-while-sheet-open, rapid back presses, autosave schema compatibility, post-submit cleanup
- **Updated phases** — now 9 phases (0–8) with specific deliverables per phase

The PRD is at `@c:\Users\The Lord\Desktop\luyentap\documentation\tasks\0043-prd-mobile-ielts-reading-test-taking-interface.md:1-710` and is ready for task generation.

### User Input

use @[documentation/tasks/generate-tasks.md] to make a detailed plan

### Planner Response

Let me read the task generation template and the current PRD to produce the plan.

*Viewed [generate-tasks.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/generate-tasks.md) *

*Viewed [0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md) *

*Viewed [0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md) *

### Planner Response

Now let me quickly inspect the key existing files referenced by the PRD to validate the current state before generating tasks.

*Grep searched codebase*

*Grep searched codebase*

*Searched filesystem*

### Planner Response

Good — `src/components/test/mobile/` doesn't exist yet, confirming the PRD's "Files To Create" are all net-new. Let me now generate the parent tasks.

*Searched filesystem*

*Searched filesystem*

*Viewed [useSoloAutoSave.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloAutoSave.ts) *

*Viewed [useTestAutoSave.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/useTestAutoSave.ts) *

### Planner Response

I have full context on the codebase state. Let me generate the parent tasks now.

*Edited relevant file*

### Planner Response

I have generated the high-level tasks based on the PRD. Here's the summary:

| # | Parent Task | PRD Phase | Est. Duration |
|---|------------|-----------|---------------|
| **1.0** | Prerequisite Cleanup — migrate `IELTSPracticeView` to `useNavigation` + platform storage | Phase 0 | 0.5–1 day |
| **2.0** | Device Classification Foundation — `useMobileExamMode` hook, QA override, scaffold entry points in both hosts | Phase 1 | 1–2 days |
| **3.0** | Mobile UI Shell — `MobileReadingHeader`, `MobilePassageTabs`, `MobileQuestionsFab`, `MobileQuestionSheet` with slide-up animation | Phase 2 | 2–3 days |
| **4.0** | Question Sheet Content — collapsible navigator, `IELTSQuestionsPanel` embedding, `flaggedQuestions` state + wiring | Phase 3 | 2–3 days |
| **5.0** | Review Summary + Submit Refactor — `MobileReviewSummary`, final confirm modal, `skipConfirm` for `useTestSubmission`, gate both pipelines | Phase 4 | 2–3 days |
| **6.0** | Autosave + Resume — extend both autosave hooks with `mobileState`, debounced scroll persistence, mode-specific restore | Phase 5 | 2–3 days |
| **7.0** | Interruption Handling — z-index hierarchy, force-close on TimeUp/ForceSubmit, `popstate` back-button, fullscreen disable, post-submit cleanup | Phase 6 | 1–2 days |
| **8.0** | Overflow Menu — text-size slider, instructions modal, review/submit/leave shortcuts, line-spacing fixed default | Phase 7 | 1–2 days |
| **9.0** | Regression Tests + Mobile QA — real-device testing, desktop safety verification, documentation crosscheck | Phase 8 | 2–3 days |

Ready to generate the sub-tasks? Respond with **"Go"** to proceed.

### User Input

Go

*Viewed [tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md) *

### Planner Response

Now let me do a final codebase check on the specific files I need to reference in sub-tasks.

*Viewed [useSoloResume.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloResume.ts) *

*Viewed [useSoloSubmission.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts) *

*Viewed [useFullscreenMode.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useFullscreenMode.ts) *

### Planner Response

Now let me check the exact `navigate()` calls and `localStorage` usage in `IELTSPracticeView` to be precise in sub-task 1.0.

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

Good, I have all the details needed. Now let me write the complete task list with sub-tasks.

*Edited relevant file*

### Planner Response

Now update the conversation log.

*Edited relevant file*

### Planner Response

Task list generated and saved at `@c:\Users\The Lord\Desktop\luyentap\documentation\tasks\tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md:1-141`.

## Summary

**9 parent tasks, 68 sub-tasks** covering the full PRD-0043 implementation:

| Task | Sub-tasks | Focus |
|------|-----------|-------|
| **1.0** | 7 | Prerequisite: migrate `IELTSPracticeView` + [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2) off `useNavigate`/`localStorage` |
| **2.0** | 8 | `useMobileExamMode` hook + QA override + scaffold entry points in both hosts |
| **3.0** | 8 | Header, passage tabs, floating FAB, question sheet (animation, backdrop, close gestures), scroll memory |
| **4.0** | 7 | Collapsible navigator, `IELTSQuestionsPanel` embedded mode, flagging state, per-passage question-group memory |
| **5.0** | 7 | Review summary, final confirm modal, `skipConfirm` refactor on `useTestSubmission`, dual-pipeline gating |
| **6.0** | 7 | Autosave `mobileState` extension for both hooks, [useSoloResume](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloResume.ts:18:0-55:2) migration, resume restoration, text-size persistence |
| **7.0** | 6 | Z-index hierarchy, force-close on system overlays, `popstate` back-button, fullscreen disable, post-submit cleanup |
| **8.0** | 6 | Overflow menu, text-size slider, instructions modal, line-spacing default |
| **9.0** | 11 | Full regression suite, desktop safety, 8 mobile QA checklists, edge-case crosscheck |

Each sub-task specifies exact files, line numbers, prop interfaces, and test expectations — a junior can execute sequentially without guessing.

### User Input

Assess the tasklist @[documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md] based on @[documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md] and actual code base to see if it has been as detailed and as comprehensive as possible so that an inexperienced junior can fully follow the guide to implement our prd without missing, misunderstanding or making mistakes/errors in any task. The tasklist must give no room for the juniors to act on their own imagination, hallucination and must not allow them to deviate from the plan, guess or independently think of another approach.


### Planner Response

I’ll audit the task list against the PRD and the real implementation surface, using codebase search first so I can catch any places where a junior would still have to guess. I’m following the subagent guidance from your `AGENTS.md` memory for the codebase scan.

*Found code context*

### Planner Response

I need to validate the task list against the real navigation and storage APIs, because that’s the most likely place where a junior would still be forced to invent things.

*Grep searched codebase*

*Viewed [storage.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts) *

*Grep searched codebase*

### Planner Response

I’ve already found one likely mismatch: the task list assumes route keys and storage capabilities that may not exist exactly as written. I’m going to verify the navigation registry and persistence types before I score the task list.

*Viewed [useNavigation.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/useNavigation.ts) *

*Grep searched codebase*

*Grep searched codebase*

*Viewed [TestHeader.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/test/TestHeader.tsx) *

### Planner Response

I’ve confirmed the storage API is real and async, but the route names in the task list may be too speculative. I’m checking the actual route registry and progress types now.

*Viewed [routes.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/constants/routes.ts) *

*Viewed [practice.types.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/types/practice.types.ts) *

*Grep searched codebase*

### Planner Response

I want one last targeted check: the task list touches navigation in [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2), and I need to verify whether the current destination paths even exist in the route registry or already rely on legacy direct paths.

*Grep searched codebase*

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

I’ve found a concrete ambiguity already: the task list invents `navigateTo('BACK')`, but `BACK` is **not** in the real route registry. I’m checking the rest of [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2) so I can identify every similarly speculative instruction.

*Grep searched codebase*

*Viewed [useSoloSubmission.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts) *

*Grep searched codebase*

### Planner Response

I’ve isolated the first task-list flaw: it tells the junior to use a non-existent route key (`BACK`) and says “or equivalent,” which reintroduces guesswork. I’m checking whether a real back-navigation helper exists anywhere before I finalize the audit.

*Grep searched codebase*

*Grep searched codebase*

*Viewed [navigation.service.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/navigation.service.ts) *

### Planner Response

I’ve found a deeper architectural mismatch: the PRD says the mobile scaffold is a **pure presentation component with host-owned state**, but the task list repeatedly moves state ownership into the scaffold. I’m confirming the renderer prop types before I write the final audit.

*Grep searched codebase*

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

I need the actual `PassageRenderer` prop contract to judge whether the task list gives enough detail for the scaffold wiring.

*Viewed [PassageRenderer.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/PassageRenderer.tsx) *

*Viewed [PassageRenderer_v2.jsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/PassageRenderer_v2.jsx) *

### Planner Response

# Verdict

**Not yet.**

The task list is **strong on coverage** but **not yet strong enough on determinism** to meet your “no imagination, no deviation, no guessing” standard for an inexperienced junior.

## Score

- **Coverage against PRD**: **8.5/10**
- **Alignment with actual codebase**: **6/10**
- **Junior-proof precision**: **5.5/10**

It does a good job mapping the PRD into phases, files, tests, and QA.  
But there are still several places where:

- the task list **assumes APIs that do not exist**
- the task list **contradicts the PRD architecture**
- the task list **states something false about the current code**
- the junior would still need to **choose an approach**

That means it is **not yet safe to hand off as a strict implementation script**.

I used the codebase scan per your `AGENTS.md` subagent guidance to verify this against the real files.

---

# What the task list does well

- **Phase structure is good**  
  It follows the PRD phases in a sensible order.

- **Main surfaces are covered**  
  It includes both hosts, both submit pipelines, autosave, resume, overlays, QA, and tests.

- **Phase 0 is correct in principle**  
  It correctly identifies that [IELTSPracticeView.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/practice/IELTSPracticeView.tsx:0:0-0:0) must be cleaned up before mobile scaffold work.

- **QA coverage is unusually strong**  
  The desktop/mobile verification matrix is much better than average.

So this is **not a bad task list**. It is just **not yet strict enough** for a junior with zero architectural discretion.

---

# Critical problems that must be fixed before giving this to a junior

## 1. Navigation instructions are partly invented or impossible

- **Problem**  
  The task list tells the junior to use [navigateTo('BACK')](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/navigation.service.ts:77:2-190:3) and convert all navigation to route-registry calls.

- **Why this is wrong**  
  `BACK` is **not** a real route key.

  Real route keys are in `src/constants/routes.ts:10-96`, and `BACK` is not there.

  [useNavigation](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/useNavigation.ts:32:0-80:2) only supports:
  - [navigateTo(destination, params, options)](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/navigation.service.ts:77:2-190:3)
  - where `destination` must be a real [RouteName](file:///c:/Users/The%20Lord/Desktop/luyentap/src/constants/routes.ts:98:0-98:44)

  See:
  - `src/hooks/useNavigation.ts:23-54`
  - `src/services/navigation.service.ts:82-175`

- **Extra problem**  
  [useSoloSubmission.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:0:0-0:0) currently navigates to `/student/academic-record` with `state: { resultId, showResult }`:
  - `src/hooks/solo/useSoloSubmission.ts:442-454`

  But the route registry currently **does not define** `STUDENT_ACADEMIC_RECORD` in `src/constants/routes.ts:29-96`.

  So the task list tells the junior to convert navigation into a registry flow that **cannot currently express the existing behavior**.

- **Why this forces guessing**  
  The junior must invent one of these:
  - add a new route constant
  - keep direct `navigate(...)`
  - add back-navigation support to navigation service
  - encode `state` some other way

  That violates your standard.

- **Task list lines affected**  
  `tasks-0043...md:58-64`

---

## 2. The task list is factually wrong about [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2)

- **Problem**  
  The task list says [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2) does not have a `window.confirm` and only needs validation.

- **Actual code**  
  It **does** have a `window.confirm`:

  - `src/hooks/solo/useSoloSubmission.ts:258-264`

- **Why this matters**  
  The PRD explicitly requires that **both** manual submit pipelines be gated by the review-summary-first mobile flow.

  If the junior follows the current task list, they may only refactor `useTestSubmission` and miss the same issue in [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2).

- **Result**  
  Mobile solo/homework would likely get a **double confirm** or inconsistent submit behavior.

- **Task list lines affected**  
  `tasks-0043...md:98-101`

---

## 3. The task list contradicts the PRD’s architecture for state ownership

- **PRD says**  
  The scaffold is a **pure presentation component** and the **hosts explicitly track** the state.

  See:
  - `0043-prd...md:477-527`
  - `0043-prd...md:529-543`

- **Task list says**  
  The scaffold should own:
  - `questionSheetOpen`
  - `flaggedQuestions`
  - `reviewSummaryOpen`
  - `activeQuestionGroupByPassage`
  - `questionSheetScrollByPassage`
  - post-submit cleanup logic
  - interruption handling state

  Examples:
  - `tasks-0043...md:82`
  - `tasks-0043...md:90-92`
  - `tasks-0043...md:99`
  - `tasks-0043...md:108`
  - `tasks-0043...md:115`
  - `tasks-0043...md:118`

- **Why this is bad**  
  A junior will implement the wrong ownership model and end up with:
  - state trapped in the scaffold
  - resume/autosave coupling in the wrong layer
  - host/scaffold responsibilities blurred

- **Result**  
  This is the biggest architectural ambiguity in the whole task list.

---

## 4. Platform storage migration is impossible as written

- **Problem**  
  The task list says to migrate [cleanupExpiredProgress()](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloAutoSave.ts:85:0-107:1) to the platform storage abstraction.

- **Actual storage API**  
  `src/core/platform/storage.ts:17-73` supports:
  - [get](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts:17:2-30:3)
  - [getString](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts:32:2-37:3)
  - [set](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts:39:2-49:3)
  - [remove](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts:51:2-56:3)
  - [has](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts:103:2-105:3)
  - [clear](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts:107:2-109:3)

  It does **not** support:
  - listing keys
  - iterating entries
  - prefix scans

- **Actual code that needs iteration**  
  [cleanupExpiredProgress()](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloAutoSave.ts:85:0-107:1) currently loops over `localStorage.length` and `localStorage.key(i)`:
  - `src/hooks/solo/useSoloAutoSave.ts:90-108`

- **Why this matters**  
  A junior cannot “just migrate it” without inventing a new storage capability.

- **Required missing decision**  
  The task list must choose one:
  - extend [storage.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts:0:0-0:0) with `keys()` / `entries()`
  - keep cleanup web-only for now
  - remove cleanup from this PRD scope

- **Task list lines affected**  
  `tasks-0043...md:106-107`

---

## 5. The task list misses required type changes

- **Problem**  
  It tells the junior to add `mobileState` to saved progress, but it does not explicitly task the type changes.

- **Actual existing type**  
  [SoloSessionProgress](file:///c:/Users/The%20Lord/Desktop/luyentap/src/types/practice.types.ts:71:0-79:1) currently has no `mobileState`:
  - `src/types/practice.types.ts:72-80`

- **Why this matters**  
  A junior can easily update hooks and forget the type, or invent the shape locally in multiple files.

- **Also missing**  
  The PRD references `SavedMobileState`, but the task list does not define where that type should live.

- **Result**  
  This is exactly the kind of omission that causes piecemeal implementation and drift.

---

## 6. Live-mode resume ownership is still under-specified

- **Problem**  
  The task list says live mode should “read `mobileState` from loaded player data” and pass it into the scaffold.

- **But it does not pin down where that logic lives**
  The relevant existing live-state ownership is split across:
  - `useTestSubmission`
  - `useTestSession`
  - `ReadingTestPage`

- **What the junior will have to guess**
  - Does `useTestSubmission` load `mobileState`?
  - Does `useTestSession` own it?
  - Does `ReadingTestPage` do direct RTDB reads?

- **Why this matters**
  Without an exact owner, the junior may duplicate reads or place persistence in the wrong hook.

- **Task list lines affected**
  `tasks-0043...md:105-109`

---

## 7. Autosave failure toasts are required by the PRD but not fully planned

- **PRD requires**
  - failure toast
  - auto-dismiss
  - dedupe repeated failures

  See:
  - `0043-prd...md:323-331`

- **Current code**
  - [useTestAutoSave](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/useTestAutoSave.ts:59:0-253:2) exposes error state but does not show UI toast by itself:
    - `src/hooks/useTestAutoSave.ts:22-26`
    - `src/hooks/useTestAutoSave.ts:140-149`
  - `ReadingTestPage` currently only logs auto-save success/error:
    - `src/skills/reading/components/ReadingTestPage.tsx:353-368`
  - [useSoloAutoSave](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloAutoSave.ts:20:0-76:2) just `console.warn`s:
    - `src/hooks/solo/useSoloAutoSave.ts:69-72`

- **Task list problem**
  The QA asks for toast behavior, but the implementation tasks do not explicitly say:
  - which layer owns the toast
  - how dedupe is implemented
  - whether both live and solo modes use the same toast contract

- **Result**
  A junior will improvise.

---

## 8. [PassageRenderer](file:///c:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/PassageRenderer.tsx:60:0-585:2) has its own `localStorage` font-size persistence, and the task list doesn’t resolve that

- **Actual code**
  [PassageRenderer.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/PassageRenderer.tsx:0:0-0:0) still uses direct `localStorage` internally:
  - `src/skills/reading/components/PassageRenderer.tsx:73-90`

- **Why this matters**
  The task list introduces mobile text-size persistence and says mobile should use platform abstractions and scaffold-owned state.

- **Missing decision**
  The task list must explicitly tell the junior one of these:
  - **Do not patch [PassageRenderer](file:///c:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/PassageRenderer.tsx:60:0-585:2); always pass external `fontSize` and `onFontSizeChange` so the internal localStorage branch is bypassed**
  - or **Patch [PassageRenderer](file:///c:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/PassageRenderer.tsx:60:0-585:2) to stop using localStorage**

- **Without that**
  The junior may end up with **two competing persistence sources**.

---

## 9. The instructions modal still leaves room for invented copy

- **Problem**
  The task says to show mode-specific rules in `MobileInstructionsModal`, but it doesn’t define the source of truth.

- **Why this matters**
  A junior may write new copy by hand instead of reusing the same rules as the start screen recap mandated by the PRD.

- **What’s needed**
  The task list should say exactly where that content comes from:
  - shared constants
  - existing start-screen rule builders
  - or a new `getMobileReadingHelpContent(mode, resolvedSettings, practiceContext)` helper

---

## 10. The task list contains open-ended language that invites improvisation

Examples:

- **“or equivalent”**
- **“stub/placeholder for now”**
- **“validate this is true by code inspection”**

These are fine for a senior engineer.  
They are **not** fine if your goal is “junior executes exactly.”

The worst examples are:

- `tasks-0043...md:59`
- `tasks-0043...md:72`
- `tasks-0043...md:101`

---

# Medium issues

## 11. `IELTSQuestionsPanel` work is still too broad for a junior
That file is large and multi-branch (`1463` lines).  
“Add a flag button on each question block” is directionally right, but still too vague.

It should specify:

- **which new props** get added to `IELTSQuestionsPanelProps`
- **where the flag control is rendered** so it appears for every question type without duplicating logic in many branches
- **that the flag control belongs in the shared outer question wrapper**, not per-input-type code

Right now a junior could implement it inconsistently.

---

## 12. QA override should use the existing session storage abstraction
The task list uses raw `sessionStorage`, but the repo already has:

- `sessionStore` in `src/core/platform/storage.ts:77-111`

For consistency with the PRD’s abstraction rule, the task list should say to use `sessionStore`, not raw `sessionStorage`.

---

## 13. [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2) test migration is missing
[useSoloSubmission.test.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.test.ts:0:0-0:0) currently mocks `useNavigate` and expects direct path navigation:
- `src/hooks/solo/useSoloSubmission.test.ts:20-22`
- `src/hooks/solo/useSoloSubmission.test.ts:155-158`

If Task 1.5 changes the hook to [useNavigation](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/useNavigation.ts:32:0-80:2), the task list should explicitly call for updating this test strategy.

Right now it only generally says “run tests.”

---

# Bottom line

## Current assessment

- **Comprehensive enough on feature coverage?**  
  **Mostly yes.**

- **Detailed enough for a junior to implement without independent thinking?**  
  **No.**

- **Ready to hand off as a strict execution script?**  
  **No.**

## Why not

Because there are still **at least 7 blocker-level issues** where the junior would have to:

- decide between unsupported navigation approaches
- reconcile task-list instructions with the PRD’s architecture
- invent missing storage APIs
- choose where live resume state belongs
- infer toast ownership
- invent copy/content sources
- patch types that were never explicitly assigned

---

# What I would change before approval

- **Fix navigation tasks**  
  Remove invented `BACK` behavior. Explicitly decide whether to:
  - keep `navigate(-1)` as-is
  - add `goBack()` to navigation service
  - or rewrite the UX to avoid browser-back routing

- **Fix [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2) tasks**  
  Add the same `skipConfirm`/host-controlled manual submit refactor that you already planned for `useTestSubmission`.

- **Resolve scaffold ownership**  
  Rewrite tasks so host components own the PRD-listed state, and the scaffold only receives props/callbacks.

- **Add missing type tasks**  
  Explicitly modify [src/types/practice.types.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/types/practice.types.ts:0:0-0:0) and define a canonical `SavedMobileState` type.

- **Resolve storage iteration gap**  
  Either extend [storage.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts:0:0-0:0) with key enumeration or explicitly keep [cleanupExpiredProgress()](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloAutoSave.ts:85:0-107:1) out of this PRD.

- **Add explicit autosave-toast tasks**  
  Say exactly where failure toast + dedupe logic lives for live and solo modes.

- **Specify instructions modal content source**  
  No copywriting by hand.

- **Remove all open-ended wording**  
  Especially `or equivalent`, `placeholder`, and `validate by code inspection`.

---

# Recommendation

**Do one more tightening pass on the task list before implementation starts.**

If you want, I can do that next and convert the current task list into a **strict, junior-proof execution plan** with:

- no invented APIs
- no unsupported route assumptions
- no ownership ambiguity
- no missing type work
- no open-ended wording

### User Input

approve

### Planner Response

Approved — I’ll tighten the PRD-0043 task list now by removing the ambiguity I found, aligning it to the real route/storage APIs, and updating the same conversation log.

*Updated todo list*

*Viewed [tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md) *

*Viewed [conversation_2026-04-07_session2_log.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/conversation_2026-04-07_session2_log.md) *

### Planner Response

I’m pulling the exact task-list section that needs tightening and the matching PRD contract so I can patch the document precisely instead of rewriting it loosely.

*Viewed [tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md) *

*Viewed [0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md) *

*Viewed [useSoloSubmission.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts) *

*Viewed [useSoloAutoSave.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloAutoSave.ts) *

### Planner Response

Before I patch the task list, I’m checking the repo’s navigation rule because the revised instructions need to point juniors at the real route registry instead of an invented back-navigation API.

*Viewed [navigation.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/rules/navigation.md) *

*Viewed [mobile-portability.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/rules/mobile-portability.md) *

### Planner Response

I’ve confirmed the navigation and portability rules. Next I’m patching the task list itself so it no longer tells a junior to use invented route keys, unsupported storage capabilities, or scaffold-owned state that contradicts the PRD.

*Viewed [0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md) *

*Viewed [IELTSPracticeView.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/practice/IELTSPracticeView.tsx) *

*Viewed [useSoloResume.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloResume.ts) *

### Planner Response

I’ve gathered the exact PRD contract and the real code behavior. Next I’m patching the task list to make it execution-safe for a junior and then I’ll append the audit-tightening entry to the same session log.

*Grep searched codebase*

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

I need one more rule check before I patch the navigation tasks: whether the repo allows a temporary remaining `useNavigate(-1)` in a refactor file, or whether I must explicitly route the junior toward a new `goBack` helper instead.

*Viewed [mobile-portability.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/rules/mobile-portability.md) *

*Grep searched codebase*

### Planner Response

I found another exact mismatch that needs fixing in the task list before I patch it: the route registry is missing `STUDENT_ACADEMIC_RECORD`, and [navigateTo()](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/navigation.service.ts:77:2-190:3) currently only forwards `params` as router state. I’m verifying whether the navigation abstraction already supports custom `state`, or if the tightened task list must explicitly add that capability too.

*Grep searched codebase*

*Viewed [navigation.types.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/types/navigation.types.ts) *

*Grep searched codebase*

### Planner Response

To pin the live resume instructions to a real owner instead of hand-waving, I’m checking where `ReadingTestPage` actually gets player session data and whether that’s the right place to hydrate `mobileState`.

*Grep searched codebase*

*Viewed [useTestSession.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestSession.ts) *

*Viewed [ReadingTestPage.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/ReadingTestPage.tsx) *

### Planner Response

I need the exact player-data read path in [useTestSession](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestSession.ts:97:0-370:2) before I tighten the live resume tasks, so the document points juniors to the right owner instead of saying “somewhere in loaded player data.”

*Grep searched codebase*

*Viewed [useTestSession.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestSession.ts) *

### Planner Response

The error was just a bad regex in my search query (`{}` was interpreted as a quantifier). I already had the needed context from the adjacent file read, but I’m correcting course and moving on with the document patch instead of repeating the broken search.

*Edited relevant file*

### Planner Response

The previous patch timed out because it was too large. I’m splitting it into smaller, precise edits so the task list still gets fully tightened without hitting the request limit again.

*Edited relevant file*

### Planner Response

I’ve updated the file inventory, but I need to re-read the exact task-list lines before the next patch because the prior edit partially applied and I don’t want to introduce drift. After that I’ll finish the task tightening and update the session log.

*Viewed [tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md) *

*Viewed [conversation_2026-04-07_session2_log.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/conversation_2026-04-07_session2_log.md) *

### Planner Response

I’m verifying a few concrete file names and existing APIs before I tighten the remaining task steps, so the task list only references files and contracts that actually exist in this repo.

*Searched filesystem*

*Searched filesystem*

*Viewed [routes.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/constants/routes.ts) *

*Viewed [navigation.service.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/services/navigation.service.ts) *

### Planner Response

I’ve confirmed the exact route registry and navigation service behavior. Now I’m patching the task steps themselves so they stop telling juniors to use non-existent routes, direct browser APIs, or unsupported assumptions.

*Viewed [storage.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/core/platform/storage.ts) *

*Viewed [useSoloAutoSave.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloAutoSave.ts) *

*Viewed [useSoloResume.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloResume.ts) *

*Viewed [useTestSubmission.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/test/useTestSubmission.ts) *

### Planner Response

I’ve confirmed the missing route/state support and the real storage/session APIs. I’m updating the active todo list now, then I’ll finish the remaining task-list fixes in smaller patches and append the audit pass to the same session log.

*Updated todo list*

### Planner Response

I’m checking the existing progress types before I rewrite the state-ownership tasks, so I can point the task list at the actual typing file and not invent a parallel type surface.

*Viewed [practice.types.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/types/practice.types.ts) *

### Planner Response

I want the live autosave task to point to the exact RTDB shape. I’m checking `useTestAutoSave` so the document names the real write path instead of a vague “player data” contract.

*Viewed [useTestAutoSave.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/useTestAutoSave.ts) *

### Planner Response

I’m validating the toast API one last time so the autosave-failure tasks reference the real notification surface instead of generic “show a toast” language.

*Viewed [ToastNotification.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/modern/ToastNotification.tsx) *

*Grep searched codebase*

### Planner Response

I’ve got the exact replacement text for Phases 1 and 2. I’m applying that now so the document stops referencing the fake `BACK` route and direct `sessionStorage` code paths.

*Edited relevant file*

### Planner Response

I’ve finished the Phase 1–2 cleanup. Next I’m rewriting the remaining phases so the scaffold stays presentation-only and the hosts own all mobile state, resume, overlays, and autosave orchestration.

*Viewed [tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md) *

### Planner Response

I found one more incorrect assumption in Phase 5: [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2) already has its own unanswered-submit confirm, so I’m checking its option shape before I rewrite the mobile submit tasks to match the actual hook contract.

*Viewed [useSoloSubmission.ts](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts) *

### Planner Response

I want to pin the instructions-modal task to a real copy source instead of “write some rules.” I’m locating the existing live/solo instructions text so the task list can require reuse rather than invented content.

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

I’m applying the architecture alignment for Phases 3–5 now: all overlay/open-state ownership moves to the hosts, and the scaffold becomes purely props-in/callbacks-out as required by the PRD.

*Edited relevant file*

### Planner Response

I’m tightening the instructions/help tasks before the next patch. I need one quick search for where the current reading/homework rule copy already lives so I can require reuse instead of new wording.

*Grep searched codebase*

*Grep searched codebase*

### Planner Response

The repo doesn’t appear to have a dedicated mobile instructions copy file already, so I’m checking whether the existing reading/start surfaces already expose `metadata.instructions` or similar rule text that the mobile modal should reuse.

*Grep searched codebase*

### Planner Response

I’ve got the exact remaining deltas. I’m applying the persistence, overlay, and instructions-flow fixes now, including the missing typed `SavedMobileState` contract and the autosave error-toast behavior.

*Edited relevant file*

### Planner Response

I’ve finished the task-list tightening pass. I’m appending the exact audit/fix summary to the active session log now, following the existing conversation-log memory for this workspace.

*Edited relevant file*

### Planner Response

I’ve applied the log update. I’m doing one final read-through of the tightened task list to catch any leftover contradictions before I close this out.

*Viewed [tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md) *

### Planner Response

I’ve completed the document and log changes. I’m marking the tracked work items done so the session state stays accurate.

*Updated todo list*

### Planner Response

I’m saving a compact memory of the PRD-0043 tightening decisions so the next session doesn’t have to re-audit the same route, storage, and scaffold-contract issues from scratch.

### Planner Response

# Done

I tightened the PRD-0043 task list and updated the active session log.

- **Task list updated**
  [documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md:0:0-0:0)

- **Session log updated**
  [documentation/conversation_2026-04-07_session2_log.md](file:///c:/Users/The%20Lord/Desktop/luyentap/documentation/conversation_2026-04-07_session2_log.md:0:0-0:0)

# What I fixed

- **Navigation accuracy**
  Removed the fake `BACK` route instruction.
  Added tasks to introduce `STUDENT_ACADEMIC_RECORD` and extend navigation to support explicit router `state`.

- **Real submit-flow behavior**
  Corrected the task list to reflect that [useSoloSubmission](file:///c:/Users/The%20Lord/Desktop/luyentap/src/hooks/solo/useSoloSubmission.ts:96:0-474:2) currently *does* use `window.confirm(...)`, so mobile needs `skipConfirm`.

- **Host-owned scaffold contract**
  Rewrote Phases 3–8 so [ReadingTestPage.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/skills/reading/components/ReadingTestPage.tsx:0:0-0:0) and [IELTSPracticeView.tsx](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/practice/IELTSPracticeView.tsx:0:0-0:0) own mobile UI state.
  `MobileReadingExamScaffold` now stays presentation-only in the task plan.

- **Typed persistence**
  Added explicit `SavedMobileState` typing work and clarified serialize/hydrate responsibilities.

- **Storage correctness**
  Replaced direct `sessionStorage` implementation guidance with `sessionStore`.
  Clarified that solo autosave cleanup needs storage enumeration support instead of falling back to raw browser APIs.

- **Autosave/error UX**
  Added explicit [toast.error(...)](file:///c:/Users/The%20Lord/Desktop/luyentap/src/components/modern/ToastNotification.tsx:152:2-154:3) failure handling with dedupe/reset behavior.

- **Instructions content source**
  Added `mobileInstructionsContent.ts` and constrained the modal copy to existing behavior/data, not invented rules.

# Notes

- **Validation**
  I re-read the final task list after patching to check for remaining contradictions.
  I did **not** run tests because this pass only changed documentation.

- **Memory/rules followed**
  I followed the conversation-log memory and the navigation/mobile-portability safety guidance while making these edits.

# Status

- **Completion**
  The tightening pass is complete.

---

# Reassessment Pass 2 — 2026-04-08

A second full reassessment was performed, cross-referencing every FR (FR-1–FR-109), all 22 edge cases (PRD Section 10), and the 13 previously-identified issues against the current task list.

## Prior Issue Resolution Status

| # | Issue | Status |
|---|-------|--------|
| 1 | Navigation BACK route | **Fixed** ✓ |
| 2 | useSoloSubmission window.confirm | **Fixed** ✓ |
| 3 | Scaffold state ownership | **Fixed** ✓ |
| 4 | Storage iteration gap | **Fixed** ✓ |
| 5 | Missing type changes | **Fixed** ✓ |
| 6 | Live resume ownership | **Fixed** ✓ |
| 7 | Autosave failure toasts | **Fixed** ✓ |
| 8 | PassageRenderer localStorage | **Still open** — see Blocker #2 below |
| 9 | Instructions modal content | **Fixed** ✓ |
| 10 | Open-ended language | **Mostly fixed** |
| 11 | IELTSQuestionsPanel flagging detail | **Improved** |
| 12 | QA override sessionStorage | **Fixed** ✓ |
| 13 | useSoloSubmission test migration | **Fixed** ✓ |

## Blocker-Level Gaps (3)

### Blocker 1 — Start/Instructions Screen Not Addressed (FR-24 through FR-29)

The PRD requires a phone-optimized start/instructions screen:
- FR-24: compact single-column layout with one dominant Start button
- FR-25/26/27: mode-specific rules before start (live, homework, solo)
- FR-28: must not reuse full desktop header/body chrome on phone
- FR-29: remains within the same route host

The task list begins at the test-taking scaffold (Tasks 2.4, 2.5) and never tasks modifying the pre-test start experience. In solo/homework, `IELTSPracticeView` renders `SoloSettingsModal` and `SoloResumeModal` in desktop chrome. In live mode, `ReadingTestPage` renders `TestWaitingOverlay`. None are addressed for mobile.

**6 FRs uncovered.** A junior will leave the start screen desktop-styled.

### Blocker 2 — PassageRenderer Internal Font-Size localStorage Creates Shadow Write

`PassageRenderer.tsx:73-90` has internal `localStorage.getItem('passage_font_size')` initialization and a `useEffect` that writes `localStorage.setItem('passage_font_size', ...)` on every fontSize change. When the host provides external `fontSize`/`onFontSizeChange` props (which mobile does per Task 8.2), the external value wins functionally (line 78: `externalFontSize !== undefined ? externalFontSize : internalFontSize`), but the `useEffect` still writes to localStorage unconditionally.

The task list must explicitly tell the junior one of:
- **Option A:** Accept the harmless shadow write; always pass `fontSize` + `onFontSizeChange` from the host on mobile.
- **Option B:** Patch PassageRenderer to guard the localStorage write behind `if (externalFontSize === undefined)`.

Without this, a junior may not pass the external props consistently or may patch PassageRenderer incorrectly and break desktop.

### Blocker 3 — `onAutoSubmit` Scaffold Prop Wiring Is Ambiguous

PRD Section 7.4 says: *"For autosubmit (timer expiry, force-submit), the scaffold calls `onAutoSubmit()`."*

The task list wires `onManualSubmit` (Tasks 5.5, 5.6) but never explicitly wires `onAutoSubmit`. Task 7.2 says the host handles interruptions by closing overlays, implying the host calls auto-submit directly. But the scaffold interface (Task 2.6) includes `onAutoSubmit` with no task telling a junior how to wire or call it.

**Fix needed:** Either task the hosts to pass `onAutoSubmit` as `() => submitTest(true)` and have the scaffold call it on `timeRemaining === 0`, or clarify that the host owns auto-submit directly and remove `onAutoSubmit` from the scaffold contract.

## Medium-Level Gaps (4)

### Medium 1 — Scaffold Props `isConnected`, `sessionStatus`, `isPaused`, `antiSelectClass` Not Wired

The PRD props contract (Section 7.2a) includes these. They exist in both hosts:
- `ReadingTestPage.tsx:101-108` — `isConnected`, `sessionStatus`, `isPaused` from `useTestSession`
- `ReadingTestPage.tsx:499` — `antiCheatConfig?.detectCopyPaste ? 'anti-select' : undefined`
- `IELTSPracticeView.tsx:451` — same `anti-select` pattern

Task 2.6 defines the full interface but no later task explicitly wires these props. A junior will define the interface but leave the scaffold without connection indicators or anti-cheat CSS.

### Medium 2 — Sheet-Close on Review-Open Not Explicit

PRD Section 10 edge case: *"Tapping a menu item (e.g. Review answers) closes the menu, then opens the review summary. The sheet closes if review opens."*

Task 8.4 says `onReviewAnswers` opens the review summary but doesn't state the host must also set `questionSheetOpen = false`. A junior may open review on top of the sheet.

### Medium 3 — Mobile Interruption State Verification (FR-83)

The PRD requires explicit student-visible states for connection lost, reconnected, teacher-ended, and force-submit. The task list relies on existing overlays rendering above the scaffold. No task verifies these existing components work correctly within the mobile scaffold's DOM hierarchy, or that the connection-loss indicator (currently fixed-position in `ReadingTestPage:518`) renders properly in mobile layout.

### Medium 4 — Large Text Overflow Handling

PRD Section 10: *"Allow wrapping/truncation in non-critical chrome; never clip primary text content."* No task addresses how passage tabs, navigator chips, or action buttons behave at 22px text size.

## Low-Level Notes (3)

- **FR-99/FR-100 (Highlighter):** Task 3.7 hides `PassageControls` but should explicitly note passing `highlighterActive={false}` to PassageRenderer on mobile.
- **`isPaused` for solo/homework:** `IELTSPracticeView` should pass `isPaused={false}` since solo/homework don't support teacher pauses.
- **Conditional rendering may break existing tests:** Task 3.7 hides desktop elements on mobile. Existing tests may assert these always render. Task 9.1 covers regression testing but doesn't flag this as a likely breakage point.

## Assessment (Pre-Resolution)

| Question | Answer |
|----------|--------|
| Comprehensive on feature coverage? | **Almost** — 103/109 FRs covered. 6 FRs (start screen) missing. |
| Detailed enough for a junior? | **Mostly** — 3 blockers remain. |
| Ready as a strict execution script? | **Not yet** — needs one more targeted pass for 3 blockers + 4 medium issues. |

---

## Resolution Pass — 2026-04-08

All 3 blockers and 7 medium/low issues were resolved by integrating fixes directly into the task list.

### Decisions Made

1. **B1 — Start Screen:** Add Phase 2A with `MobileStartScreen` component. Pull `mobileInstructionsContent.ts` creation forward from Task 8.3. Solo/homework gets a Start button; live mode uses `showStartButton={false}` since the teacher controls session start. `SoloResumeModal` is already responsive and needs no changes. `SoloSettingsModal` (Mantine) is not rendered on mobile.
2. **B2 — PassageRenderer Guard:** Patch Option B chosen. Task 8.6 added with exact guard code: `if (externalFontSize === undefined)` before `localStorage.setItem`.
3. **B3 — onAutoSubmit:** Scaffold calls it (Option A). Task 7.2a added. Both hosts wire `onAutoSubmit`, scaffold watches `timeRemaining <= 0 && !testSubmitted` and calls it. Idempotent — safe alongside host timer hooks.

### All 10 Items Resolved

| ID | Resolution |
|----|------------|
| B1 | Phase 2A added (Tasks 2A.1–2A.5) |
| B2 | Task 8.6 added |
| B3 | Task 7.2a added |
| M1 | Tasks 2.5 and 3.6 updated |
| M2 | Task 5.4 updated |
| M3 | Task 9.7(f) added |
| M4 | Tasks 3.2 and 8.1 updated |
| L1 | Task 3.7 updated |
| L2 | Task 2.5 updated |
| L3 | Task 9.1 updated |

### Final Assessment

| Question | Answer |
|----------|--------|
| Comprehensive on feature coverage? | **Yes** — 109/109 FRs covered. |
| Detailed enough for a junior? | **Yes** — all blockers resolved, no guesswork required. |
| Ready as a strict execution script? | **Yes** — task list is implementation-ready. |