# Conversation Export

Generated: 2026-04-07
Source: Visible user-assistant thread messages, including surfaced subagent notifications.
Note: Internal system/developer instructions and raw tool outputs are not included.

---

## User

Use documentation\tasks\create-prd.md to plan a mobile UI/UX design for student ielts reading tast taking interface

## User

Use documentation\tasks\create-prd.md  to plan a mobile UI/UX design for student ielts reading tast taking interface

## Assistant

I’m pulling the project guidance first and reading the PRD template you pointed to, then I’ll turn that into a concrete mobile UI/UX plan for the IELTS reading student interface.

## Assistant

The PRD instruction is explicit: it requires clarifying questions before the PRD is drafted. I’m setting the project context and pulling the two relevant skills so the questions reflect the repo’s planning and student UI standards.

## Assistant

I have the PRD workflow and the student design standard. Next I’m checking the existing student and reading architecture so the questions align with the app’s current shell, test flow, and mobile constraints instead of inventing a parallel pattern.

## Assistant

The shared student shell and reading highlight contract are clear now. I’m checking what already exists for the reading test-taking flow so the PRD questions can distinguish redesign scope from current behavior.

## Assistant

[create-prd.md](C:/Users/The%20Lord/desktop/luyentap/documentation/tasks/create-prd.md) requires clarifying questions before I draft the PRD, so I need these answers first. I’m assuming this should stay aligned with the current student editorial system and existing reading highlight behavior unless you want a different direction.

1. What exact scope should the PRD cover: only the in-test mobile reading screen, or also the start/instructions screen, submit flow, paused/resume states, and post-submit confirmation?
2. Which test modes must this design support: solo practice, homework, live class session, or all three?
3. What is the main mobile problem you want this redesign to solve: faster passage/question switching, less scrolling, clearer timer/progress, lower stress, better review flow, or something else?
4. On mobile, what interaction model do you want for passage vs questions: stacked in one scroll, tab switcher, segmented toggle, bottom sheet, or another pattern?
5. Which tools are required in the mobile interface: timer, question palette, flag for review, passage highlighting, notes, text-size controls, auto-save state, submit warning, answer review summary?
6. Should the interface stay inside the existing calm student design language, or can the actual test-taking screen shift into a more focused “exam mode” visual style?
7. Are there any non-goals or hard constraints: no new data model, no anti-cheat work, no tablet scope, no result-page redesign, no audio/listening support, etc.?
8. What would make this PRD successful from your side: faster completion, fewer navigation errors, better one-hand use, higher mobile completion rate, fewer student complaints, or a specific acceptance checklist?

Once you answer, I’ll turn it into a concrete PRD and save it in `/tasks` with the repo’s naming format.

## User

1. everything you mentioned | 2. all three | 3. two-column layout is not suitable for mobile view and the mentioned problems | 4. tabs for reading passages, questions accessing thouh a floating button (click the button, an overlay open right on top showing corresponding question page to the passage, no redirect, no open new tab or load/reload, etc.) | 5. timer, auto-save state, submit warning, answer review summary | 6. shift | 7. all of the mentioned | 8. better one-hand use | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions.

## Assistant

I have your first-pass constraints. I’m now inspecting the current reading test-taking flow and adjacent PRDs in parallel so the next questions can target real gaps, conflicts, and edge cases instead of generic product prompts.

## Assistant

I’m pulling the highest-signal planning docs locally while the subagents inspect code and route ownership. I want the next question set to expose hidden contradictions before we lock the PRD direction.

## Assistant

I’ve confirmed the test-taking routes sit outside the persistent student shell, which makes an exam-mode mobile surface feasible without violating the shell contracts. I’m pulling the exact solo/test-taking requirements now so the next questions can pin down tool behavior, recovery states, and route-level edge cases.

## Subagent Notification

{"agent_path":"019d66c5-b98a-7043-97d7-2250a20b57e0","status":{"completed":"**Current entry points**\n- Live session reading route is `/student-test/:sessionCode` via [`src/pages/TestPageRouter.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/pages/TestPageRouter.tsx). Reading is routed to [`src/skills/reading/components/ReadingTestPage.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/skills/reading/components/ReadingTestPage.tsx).\n- Solo/homework reading route is `/student/practice/:materialId` via [`src/pages/StudentPracticePage.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/pages/StudentPracticePage.tsx), which renders [`src/components/practice/IELTSPracticeView.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/practice/IELTSPracticeView.tsx).\n- These are standalone exam/practice surfaces, not the normal `StudentLayout` shell pages.\n\n**Current interaction model**\n- Both live and practice reading UIs use the same permanent two-column structure:\n  - left: passage controls + passage renderer\n  - right: full question panel for the active passage\n- The shared layout is [`src/components/test/TwoColumnLayout.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/TwoColumnLayout.tsx). It is always horizontal, desktop-first, resizable with mouse drag, and has no mobile breakpoint behavior.\n- Questions are rendered by [`src/components/test/IELTSQuestionsPanel.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/IELTSQuestionsPanel.tsx). It shows all questions for the active passage in one long scrollable panel and auto-scrolls to the active question.\n- Passage switching and question jumping are driven through:\n  - `goToQuestion()` in [`src/skills/reading/components/ReadingTestPage.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/skills/reading/components/ReadingTestPage.tsx)\n  - `goToQuestion()` in [`src/components/practice/IELTSPracticeView.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/practice/IELTSPracticeView.tsx)\n  - footer nav in [`src/components/test/InspiraFooterNav.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/InspiraFooterNav.tsx)\n- Passage content is owned by [`src/skills/reading/components/PassageRenderer.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/skills/reading/components/PassageRenderer.tsx) via the compatibility wrapper [`src/components/PassageRenderer_v2.jsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/PassageRenderer_v2.jsx).\n\n**Mobile behavior now**\n- I did not find a dedicated mobile reading layout.\n- `TwoColumnLayout` stays side-by-side on all widths and depends on mouse drag; there is no stacked fallback, tab mode, bottom sheet, or FAB overlay.\n- Headers and footer nav are fixed-height, wide desktop bars:\n  - [`src/components/test/ReadingHeader.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/ReadingHeader.tsx)\n  - [`src/components/test/TestHeader.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/TestHeader.tsx)\n  - [`src/components/test/InspiraFooterNav.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/InspiraFooterNav.tsx)\n- There is an older collapsible passage pattern in [`src/components/CollapsiblePassagePanel.jsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/CollapsiblePassagePanel.jsx), but it is Mantine-based, not the active reading path, and still not the requested mobile tab + overlay model.\n\n**Relevant built-in constraints**\n- Live reading page includes timer, auto-save, submit flow, anti-cheat, fullscreen, connection state, force-submit, and waiting overlays in [`src/skills/reading/components/ReadingTestPage.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/skills/reading/components/ReadingTestPage.tsx).\n- Solo/homework page includes timer, auto-save, resume modal, settings, optional pause, homework anti-cheat in [`src/components/practice/IELTSPracticeView.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/practice/IELTSPracticeView.tsx).\n- Active passage is part of state and many flows assume “questions shown are filtered to current passage”, so a mobile overlay still needs to preserve passage-scoped filtering rather than opening a global question list.\n\n**Obvious mismatches with the proposed mobile concept**\n- Your proposed “passage tabs + floating button opens question overlay in place” conflicts directly with the current always-visible right column.\n- Current footer nav already owns passage/question navigation; a FAB overlay would overlap or replace that responsibility.\n- `TwoColumnLayout` is mouse-resize only and not touch/mobile-aware.\n- Current headers/footer consume vertical space aggressively; on mobile they would squeeze both passage and overlay.\n- `IELTSQuestionsPanel` assumes it lives in a full-height panel, not a transient overlay/sheet, so long-task question groups may need a different container behavior.\n\n**Most relevant files**\n- [`src/pages/TestPageRouter.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/pages/TestPageRouter.tsx)\n- [`src/skills/reading/components/ReadingTestPage.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/skills/reading/components/ReadingTestPage.tsx)\n- [`src/components/practice/IELTSPracticeView.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/practice/IELTSPracticeView.tsx)\n- [`src/components/test/TwoColumnLayout.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/TwoColumnLayout.tsx)\n- [`src/components/test/IELTSQuestionsPanel.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/IELTSQuestionsPanel.tsx)\n- [`src/components/test/InspiraFooterNav.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/InspiraFooterNav.tsx)\n- [`src/components/test/ReadingHeader.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/ReadingHeader.tsx)\n- [`src/components/test/TestHeader.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/components/test/TestHeader.tsx)\n- [`src/skills/reading/components/PassageRenderer.tsx`](C:/Users/The%20Lord/desktop/luyentap/src/skills/reading/components/PassageRenderer.tsx)\n\n**Bottom line**\n- The current codebase is strongly desktop two-panel by default.\n- A mobile tabbed-passage + in-place floating question overlay is feasible conceptually, but it is a real interaction-model change, not a styling pass."}}

## Assistant

One subagent has confirmed the existing reading flow is desktop-first and structurally tied to the two-column model. I’m waiting on the doc and route-contract sweeps now, then I’ll use all three to pressure-test your vision and ask the next round of narrower questions.
## Subagent Notification

{"agent_path":"019d66c5-bba9-7490-9088-6a0483772660","status":{"completed":"Findings:\n\n- The shared student shell only applies to routes under the `StudentShellRoute` tree, not to test-taking routes. The shell host is `src/routes/StudentShellRoute.tsx`, and the shell-owned pages are the `/student` children in `src/routes/studentRoutes.tsx`.\n- The student shell contract explicitly says it applies to shell pages like dashboard, homework list, library, courses, academic record, and does not automatically apply to “homework detail and test-taking flows” or “practice and session routes.” Source: `architecture/student-shell-data-loading-architecture`.\n- `StudentLayout` owns the mobile shell header plus left/right off-canvas drawers with mutual exclusion. That behavior is implemented in `src/components/layout/StudentLayout.tsx` and documented in `architecture/student-shell-right-rail-architecture` and `architecture/student-experience-architecture`.\n- Because live test-taking and practice routes sit outside `StudentLayout`, they are not bound to the shell’s mobile left/right drawer pattern or right-rail ownership. This means a standalone exam-mode mobile surface is architecturally allowed.\n- Concrete route split:\n  - Shell pages: `/student`, `/student/dashboard`, `/student/library`, `/student/homework`, `/student/academic-record`, etc. in `src/routes/studentRoutes.tsx`\n  - Outside-shell student test flows: `/student-wait/:gameSessionId`, `/student-quiz/:gameSessionId`, `/student-test/:sessionCode`, `/student/practice/:materialId`, `/student/solo-test/:materialId`, `/student/homework/:homeworkId/test` in `src/routes/studentRoutes.tsx`\n- Current live IELTS quiz route `src/pages/StudentQuizPageNew.jsx` is already a full-viewport standalone surface: `position: fixed`, `height: 100vh`, `width: 100vw`, no `StudentLayout`. So an exam-mode redesign would fit the current host model.\n- Current practice/test router also behaves as a standalone host. `src/pages/StudentPracticePage.tsx` routes directly to `IELTSPracticeView` or `THCSPracticeView`, and `src/pages/TestPageRouter.tsx` routes to `ReadingTestPage`, `ListeningTestPage`, `THCSTestLayout`, or `WritingTestPage` without the shared shell.\n- There is already repo precedent for mobile “floating button opens overlay/panel without route change” on test surfaces:\n  - `src/components/thcs-student/THCSPassagePanel.tsx` uses a floating button and mobile slide-up passage panel\n  - `src/components/writing-student/WritingPromptPanel.tsx` uses a floating button and mobile overlay\n- Practical implication: a mobile reading design with passage tabs plus a floating question overlay is compatible with existing route ownership, as long as it stays inside the standalone test host and does not try to piggyback on shell drawer/right-rail assumptions.\n- Risk worth calling out: some current test-taking files still use legacy/deprecated student styling and even Mantine imports, for example `src/pages/StudentQuizPageNew.jsx` and `src/pages/TestPageRouter.tsx`. If the redesign aims to align with current student standards, that boundary will need to be treated as a deliberate modernization, not a minor shell tweak."}}

## Assistant

The code and route sweeps line up: the redesign can be an actual mobile exam surface, not a shell variant. I’m still waiting on the doc/PRD synthesis so I can catch any hidden constraints from earlier solo-practice decisions before I narrow the product questions.

## Subagent Notification

{"agent_path":"019d66c5-ba73-7d50-89b6-25a4f944d09c","status":{"completed":"**Highest-Relevance Docs**\n- [create-prd.md](C:/Users/The%20Lord/Desktop/luyentap/documentation/tasks/create-prd.md): requires clarifying questions before drafting, then saving the PRD under `/tasks/[n]-prd-[feature-name].md`.\n- [prd-unified-solo-practice](C:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/prd/prd-unified-solo-practice.md): the strongest existing constraint. It explicitly says solo mode must keep `TwoColumnLayout`, `PassageRenderer`, `IELTSQuestionsPanel`, `TestHeader`, `InspiraFooterNav`, and `useBeforeUnloadWarning`. It also says solo auto-save is localStorage-based, keyed by `materialId + studentId`.\n- [reading-passage-highlighting-architecture](C:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/architecture/reading-passage-highlighting-architecture.md): `src/skills/reading/components/PassageRenderer.tsx` is the canonical renderer. Highlights are stored as full-passage offsets, cross-paragraph highlights are valid, and solo preference defaults keep the highlighter off.\n- [homework-solo-practice-architecture](C:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/architecture/homework-solo-practice-architecture.md): solo/homework Reading must share the same renderer/highlight contract. Homework delivery has strict route-state fields and timer/resume rules.\n- [solo-study-homework-system](C:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/system/solo-study-homework-system.md): confirms offline/auto-save is a first-class requirement, and that non-writing IELTS solo practice depends on `student_safe_tests/{id}`. Also states homework resume/timer rules that matter on mobile.\n- [test-system-architecture](C:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/architecture/test-system-architecture.md): broad source of truth that Reading runs across live session, solo practice, and homework, with different lifecycle ownership.\n\n**Supporting Docs**\n- [student-view-adaptive-layout](C:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/sop/student-view-adaptive-layout.md): older but useful. It emphasizes maintaining mobile compatibility patterns and adaptive spacing/layout, though it is not Reading-specific.\n- [student-experience-architecture](C:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/architecture/student-experience-architecture.md): applies only to shared student shell pages. This matters because it suggests the dedicated test-taking surface can adopt a more focused exam mode without needing to fully mimic shell-page tone.\n- [student-view-design-standard](C:/Users/The%20Lord/Desktop/luyentap/documentation/design/student-view-design-standard.md): useful for adjacent student surfaces, but less binding for standalone test-taking if the route is treated as exam mode rather than a shell page.\n\n**Constraints That Matter For Mobile IELTS Reading**\n- Existing docs preserve the shared Reading building blocks. Your mobile redesign should be framed as a breakpoint-specific interaction redesign, not a casual “replace everything,” or it will conflict with [prd-unified-solo-practice](C:/Users/The%20Lord/Desktop/luyentap/.knowns/docs/prd/prd-unified-solo-practice.md).\n- Auto-save behavior is mode-specific. Live session uses real-time session persistence; solo/homework rely on resume/local persistence rules. The PRD should not treat all three modes as identical.\n- Homework has stricter edge-case rules than generic solo: `startedAt` is the countdown anchor, single-attempt homework must auto-resume and not offer restart, and timer expiry must auto-submit.\n- Passage highlighting has a source-offset contract. Any mobile passage tab/overlay model must not break canonical passage ownership or future/highlighter compatibility.\n- Existing Reading UX is passage-scoped: questions are filtered by current passage. Your floating question overlay is compatible with that model, but the PRD must specify exactly what happens when the user jumps to a question from another passage.\n\n**Main Conflicts To Resolve In The PRD**\n- `TwoColumnLayout` is explicitly preserved in existing solo PRD language, but your goal is to remove it on mobile. The clean resolution is: preserve shared logic/components on desktop and shared data contracts everywhere, while defining a mobile-specific presentation layer.\n- `InspiraFooterNav` is also preserved in existing solo language, but your requested floating question access may replace its mobile role. The PRD should state whether footer nav stays on desktop/tablet only, becomes simplified on mobile, or is fully superseded on mobile.\n- Highlighter is outside your current tool scope, but the reading renderer contract remains. The PRD should say whether highlighting is hidden on mobile for v1, deferred, or preserved behind secondary controls.\n\n**Repo Reality**\n- Current routes show live test-taking and practice are standalone routes, not student-shell children: [studentRoutes.tsx](C:/Users/The%20Lord/Desktop/luyentap/src/routes/studentRoutes.tsx). That supports your “shift” to a focused exam-mode UI without violating shell-page composition rules.\n\n**What The Next PRD Pass Must Nail Down**\n- Passage-tab behavior: labels, overflow handling, locked vs free switching, and whether switching passages preserves scroll position per passage.\n- Floating overlay behavior: open/close gesture, dim/background treatment, whether it shows full question content or a navigator summary, and what happens after selecting a question.\n- Review model: flagged questions, unanswered counts, per-passage completion, and whether answer review summary is a bottom sheet, modal, or final pre-submit screen.\n- Failure states: offline indicator, autosave failure copy, resume flow, time-up flow, teacher-ended live session flow, and accidental-close protection.\n\nThe biggest existing constraint is not visual. It is contract preservation across live, solo, homework, autosave, resume, and passage rendering. The mobile redesign can be bold, but the PRD needs to define it as a mobile presentation redesign over existing Reading ownership, not a new parallel test-taking system."}}

## Assistant

Three things are clear now.

There is a real PRD conflict to resolve: existing solo-practice guidance preserves `TwoColumnLayout` and `InspiraFooterNav`, but your vision replaces that on phones. The clean way to write this is: desktop and shared reading logic stay intact, while mobile gets a new breakpoint-specific exam surface rather than a new reading system. Also, live, solo, and homework cannot share identical recovery behavior because their timer and resume rules are different. A final gap in your current scope is `flag for review`; without it, the answer review summary will feel incomplete.

My advice before the next answer set:
- Keep the redesign mobile-only first. Do not let tablet get dragged into the same behavior unless you want a second design problem.
- Make the question surface group-based, not single-question-based. IELTS reading instructions often govern a block of questions, so one-question paging can become illogical.
- Preserve scroll position per passage. Losing the student’s place is one of the fastest ways to make mobile feel broken.
- Replace the mobile footer navigation instead of stacking FAB + footer + header actions. Too many navigation controls will fight each other.
- Add explicit autosave feedback. Silent autosave is not trusted on phones.
- Define interrupt states now: time-up, network drop, teacher-ended session, accidental close, resume.

Reply in shorthand like `1A 2B 3A...` plus any free text.

1. Breakpoint scope for the redesign
A. `<= 768px` gets the new mobile exam UI; larger screens keep the current split model. Recommended.
B. `<= 1024px` gets the new mobile exam UI.
C. Switch by portrait/landscape instead of width only.

2. Tablet behavior
A. Keep tablet on a desktop-like split layout for v1. Recommended.
B. Give tablet the same mobile FAB + overlay UI.
C. Use a hybrid tablet side-sheet design.

3. Passage tab behavior
A. Sticky top tabs `Passage 1`, `Passage 2`, `Passage 3`, horizontally scrollable, with preserved scroll position per passage. Recommended.
B. Swipe between passages with tabs as secondary.
C. No visible tabs; only previous/next passage buttons.

4. What exactly opens from the floating button
A. A near-fullscreen bottom sheet overlay that contains the active passage’s question interface. Recommended.
B. A right-side drawer overlay.
C. A compact navigator first, then a second layer for answering.

5. Question presentation inside the overlay
A. Show question groups by instruction block, not one question at a time. Recommended.
B. Show one question per screen.
C. Show the full long-scroll question list for the passage.

6. Scope of the floating overlay
A. Only the current passage’s questions are shown; cross-passage jumps happen by switching passage tabs first. Recommended.
B. The overlay can jump across all passages.
C. The overlay defaults to current passage but includes an “All Passages” switch.

7. What happens after a student taps a question or question group in the overlay
A. Stay inside the overlay so the student can answer immediately there. Recommended.
B. Jump to that question context and auto-close the overlay.
C. Make this configurable by mode.

8. Review summary design
A. A dedicated pre-submit review screen with counts by passage: answered, unanswered, flagged. Recommended.
B. A review section inside the same overlay.
C. Only a simple warning dialog on submit.

9. Flagging behavior
A. Add `Flag for review` to v1. Recommended.
B. No flagging; unanswered only.
C. Flagging only in live mode.

10. Autosave visibility
A. Show a compact status in the header: `Saving…`, `Saved`, `Offline`, `Sync issue`. Recommended.
B. Keep autosave silent unless there is a failure.
C. Use toast notifications.

11. Resume behavior
A. Resume to the exact last state: passage tab, passage scroll position, open/closed overlay state, active question group. Recommended.
B. Resume to the last passage only.
C. Resume to a review summary first.

12. Submit flow
A. Tap `Submit` -> review summary -> final confirm; timer expiry bypasses confirm and auto-submits. Recommended.
B. Tap `Submit` -> one confirm dialog only.
C. Tap `Submit` submits immediately.

13. Live-session interruption behavior
A. Define explicit blocking states for `teacher ended`, `force submit`, `connection lost`, and `reconnected`. Recommended.
B. Use one generic interruption modal for all cases.
C. Only handle `force submit` in v1.

14. Missing-but-high-value mobile reading control
A. Add text-size control in v1. Recommended.
B. Defer text-size control to later.
C. Add text-size only for solo/homework, not live.

15. Orientation policy
A. Portrait-first design, landscape supported but not specially optimized. Recommended.
B. Portrait only.
C. Dedicated landscape variant.

16. Visual direction for exam mode
A. Focused, darker or higher-contrast exam surface distinct from the student shell. Recommended if you want a true mode shift.
B. Same student shell palette but simplified.
C. Minimal change, mostly layout only.

Once you answer these, I can draft the PRD with far fewer assumptions and save it under `/tasks` in the required format.
## User

1A - There should be a way to detect mobile device btter than based on screensize like this | 2A | 3A | 4A | 5A Almost the same as right column on computer view | 6A | 7A | 8A | 9A | 10B | 11A | 12A (this should follow the computer view) | 13A | 14A | 15A | 16C | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. | you can stop and start compiling if you think there is nothing more you need, the plan you make will leave no room for the junior with no experience to act on their own, improvise, imagine, guess or hallucinate.

## Assistant

I’ve found one major product conflict that needs an explicit decision before I can lock the PRD: if the question overlay is near-fullscreen and students answer inside it, they lose simultaneous access to the passage, which is the main advantage of the desktop right column. I’m checking the current submit/review and mobile overlay precedents now so the next questions resolve that cleanly instead of creating a mobile dead end.

## Assistant

The sandbox choked on the parallel local reads, so I’m retrying the exact file and code-path inspection one-by-one. I want the next questions to settle the passage-visible-vs-overlay tradeoff and the review flow with the current implementation in mind.

## Assistant

I’ve confirmed there is already a mobile slide-up precedent elsewhere in the repo, but it also exposes the main risk: it fully covers the reading surface. I’m checking the current reading submit/review hooks next so I can ask you only the decisions that materially change the UX contract.

## Assistant

I’ve confirmed the current desktop footer already behaves like a passage/question navigator with a submit action, and the codebase already has a `QuestionNavigator` component that supports flagged questions. That means your mobile spec can require flagging and a navigator without inventing a new data model, but we still need to settle how much of the passage stays visible while the answer overlay is open.

## Assistant

A few important conflicts are now explicit.

A near-fullscreen question sheet and “almost the same as the desktop right column” are not the same thing on a phone. Desktop works because passage and answers are visible together; a near-fullscreen sheet hides the passage. You need to choose which priority wins on mobile: larger answer surface, or faster passage cross-reference. Also, “better than screen size” for mobile detection is sensible, but pure device detection is brittle; the PRD should define a touch-first activation rule, not a magic “is phone” check.

If you answer the set below, I can draft the PRD with very little left for a junior to infer.

1. Mobile activation rule
A. Use touch-first detection: coarse pointer / no hover, handheld signals, width fallback, plus QA override. Recommended.
B. Use user-agent/device detection first, width fallback second.
C. Use width only after all.

2. Which priority wins when the question sheet is open
A. Keep the sheet large, even if the passage is mostly hidden.
B. Keep part of the passage visible above the sheet, even if questions get less space. Recommended.
C. Make the sheet draggable with two snap heights.

3. If the student taps a different passage tab while the question sheet is open
A. Auto-close the sheet, switch passage, preserve that passage’s last scroll position. Recommended.
B. Keep the sheet open and instantly swap its question set to the new passage.
C. Ask for confirmation first.

4. Mobile header content
A. Keep only `timer + current passage + overflow menu`; remove student name on mobile. Recommended.
B. Keep the desktop header content compressed.
C. Keep timer only.

5. What closes the question sheet
A. `X`, swipe-down, Android/browser back, and backdrop tap all close it and preserve state. Recommended.
B. Only `X` and swipe-down.
C. Only `X`.

6. Passage tab labels
A. Fixed labels `Passage 1`, `Passage 2`, `Passage 3`, horizontally scrollable. Recommended.
B. Use real passage titles.
C. Show only `P1`, `P2`, `P3`.

7. Inside the question sheet, should there be a question navigator at the top
A. Yes: compact answered/unanswered/flagged navigator for the current passage. Recommended.
B. No: just the question groups in vertical order.
C. Only show navigator in the review screen.

8. Review summary structure
A. Show passage sections with counts and tappable question chips that jump back into the sheet. Recommended.
B. Show only passage counts, no per-question jump targets.
C. Show one flat global list.

9. Submit rule for flagged questions
A. Flagged questions never block submit; they only appear in the warning/review summary. Recommended.
B. Flagged questions trigger a stronger confirm step.
C. Flagged questions block submit until manually cleared.

10. Text-size control
A. Three presets: `Standard`, `Large`, `Extra Large`. Recommended.
B. A continuous slider.
C. Browser/system text only.

11. Reading highlighter on mobile v1
A. Hide the highlighter UI on mobile v1 but preserve renderer compatibility underneath. Recommended.
B. Keep full highlight support on mobile v1.
C. Keep highlight read-only if already saved, but no new highlights.

12. Landscape phone behavior
A. Keep the same mobile model in landscape for v1. Recommended.
B. Use a mini split view in landscape only.
C. Force portrait.

13. Live re-entry behavior
A. In live mode, re-enter straight back into the test if the session is still active; no resume-choice modal. Recommended.
B. Always show a resume modal in all modes.
C. Show a resume modal only if more than N minutes passed.

14. Autosave failure behavior
A. Silent while healthy, but show a persistent top error banner when save fails. Recommended.
B. Silent while healthy, but show toast on failure.
C. Blocking modal on failure.

15. If time expires while the question sheet is open
A. Auto-submit immediately and replace the sheet with the existing time-up / submitting flow. Recommended.
B. Close the sheet first, then auto-submit.
C. Show a final 5-second blocking countdown.

16. Start / instructions screen on mobile
A. Compact single-column screen with mode badge, time limit, key rules, and one dominant `Start` button. Recommended.
B. Match desktop content order exactly.
C. Make the instructions screen optional/minimal.

Two direct recommendations beyond the questions:
- Do not promise “device detection” as a single reliable check. Write it as a touch-first capability rule with fallback.
- Do not let the junior invent mobile flagging, review, or close behavior from scratch. The PRD should explicitly define back-button handling, sheet dismissal, passage-scroll memory, and submit warning content.

If you answer this set, I should have enough to write the PRD and save it.

## User

1B | 2A | 3B | 4A | 5A | 6A | 7A | 8A | 9A | 10B | 11A | 12A | 13A | 14B | 15B | 16A |Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 
you can stop and start compiling if you think there is nothing more you need, the plan you make will leave no room for the junior with no experience to act on their own, improvise, imagine, guess or hallucinate.

## Assistant

The main UX model is stable now. What’s left are the low-level interaction contracts that juniors typically guess wrong: back-button behavior, passage-switching context, submit warnings, autosave messaging, and the exact contents of the question sheet header and review screen.

## Assistant

I’m checking one narrow implementation detail in parallel before the next question set: whether the repo already has a mobile/device detection pattern we should preserve or explicitly replace in the PRD.

## Subagent Notification

{"agent_path":"019d6725-ca08-7c02-b2c7-c0aab4021eda","status":{"completed":"**Findings**\n- Existing mobile detection is inconsistent and mostly width-based, not device-capability-based.\n- [StudentLayout.tsx](C:/Users/The%20Lord/desktop/luyentap/src/components/layout/StudentLayout.tsx) uses `useMediaQuery('(max-width: 768px)')` and also treats tablet separately.\n- [StudentHeader.tsx](C:/Users/The%20Lord/desktop/luyentap/src/components/navigation/StudentHeader.tsx), [TeacherHeader.tsx](C:/Users/The%20Lord/desktop/luyentap/src/components/navigation/TeacherHeader.tsx), and [AdminLayout.tsx](C:/Users/The%20Lord/desktop/luyentap/src/components/navigation/AdminLayout.tsx) use `window.innerWidth <= 768` plus resize listeners.\n- [THCSPracticeView.tsx](C:/Users/The%20Lord/desktop/luyentap/src/components/practice/THCSPracticeView.tsx) uses `useMediaQuery('(max-width: 767px)')`.\n- [THCSPassagePanel.tsx](C:/Users/The%20Lord/desktop/luyentap/src/components/thcs-student/THCSPassagePanel.tsx) defines a local `useMediaQuery()` around `window.matchMedia`.\n- I did not find an existing shared “device classification” utility for handheld-touch vs desktop-touch vs tablet.\n- I did not find an existing QA/dev override pattern for forcing mobile mode.\n- I found only a weak UA check in [DiagnosticPanel.jsx](C:/Users/The%20Lord/desktop/luyentap/src/components/DiagnosticPanel.jsx): `navigator.userAgent.includes('Mobile')`. It looks diagnostic, not a real app-level policy.\n- The strongest governance comes from [mobile-portability.md](C:/Users/The%20Lord/desktop/luyentap/documentation/rules/mobile-portability.md), which explicitly says new code should not use raw `window.innerWidth` or direct `matchMedia`; it wants platform abstraction like `useScreenSize()` / platform hooks instead.\n\n**Implication**\n- Repo reality today: breakpoint-first.\n- Repo governance for new work: abstracted platform-aware detection, not ad hoc width checks in feature code.\n- Your planned mobile exam surface should therefore define a new explicit classification rule rather than copying the repo’s scattered current patterns.\n\n**Recommendation For PRD Wording**\n- “Mobile exam mode must be activated by a shared device-classification layer, not by ad hoc checks inside page components.”\n- “Classification should prefer device/handheld heuristics first, then fall back to interaction and viewport signals when the device class is ambiguous.”\n- “The classification contract must be exposed through a platform abstraction hook so the exam surface does not read `window.innerWidth`, `matchMedia`, or raw UA strings directly.”\n- “When classification is uncertain, the system should fail safely to the standard desktop/tablet layout rather than misclassify large touch laptops as phones.”\n- “A QA-only override should exist so testers can force mobile exam mode on desktop browsers.”\n\n**Practical PRD Translation**\n- Primary signal: handheld/mobile device heuristics.\n- Secondary fallback: touch-first capability and small viewport.\n- No direct per-component device checks.\n- One shared source of truth for `isMobileExamMode`.\n- QA override explicitly required.\n\n**Bottom line**\n- There is no clean existing pattern to preserve.\n- The PRD should define the pattern, and it should align with [mobile-portability.md](C:/Users/The%20Lord/desktop/luyentap/documentation/rules/mobile-portability.md), not with the repo’s older width-only implementations."}}

## Assistant

One hidden risk remains: with `3B` and `2A`, students can switch passages while the question sheet stays open, but they still cannot see the new passage text until they close the sheet. That can work, but only if the sheet header, reopen behavior, and scroll-memory rules are explicit. This next set should be the last one I need before drafting.

1. Device-classification rule
A. Shared hook: handheld/mobile heuristics first, then touch + viewport fallback, QA override, uncertain cases fall back to desktop/tablet. Recommended.
B. Hard device/UA detection only.
C. Another rule; describe it.

2. What appears in the question-sheet header
A. `Passage label + question range + answered/total + close`. Recommended.
B. `Passage label + question range + answered/total + text-size + review shortcut + close`.
C. Minimal header: `Passage label + close`.

3. Floating button when the sheet is closed
A. Dynamic CTA like `Questions 5/13` plus small badges for unanswered/flagged. Recommended.
B. Static `Questions` button only.
C. Icon-only FAB.

4. Scroll-memory rule
A. Remember both passage scroll position and question-sheet scroll position per passage. Recommended.
B. Remember passage scroll only.
C. Reset both on every passage change.

5. System/browser back-button behavior
A. If question sheet is open, close it. If review screen is open, close it. Otherwise trigger the existing leave/back protection. Recommended.
B. Always show leave/back protection first.
C. Always navigate out.

6. How students consult the passage while answering
A. They close the sheet to read the passage; reopening returns them to the same question group and sheet scroll position. Recommended.
B. Add a `Peek Passage` control inside the sheet.
C. Both.

7. Structure inside the question sheet
A. Top compact navigator, then grouped question blocks with instructions visible at each block. Recommended.
B. Navigator only; no visible group instruction blocks beyond the question content.
C. Group blocks only; no compact navigator.

8. Review summary severity
A. Unanswered = warning, flagged = informational only. Recommended.
B. Unanswered and flagged are shown with equal warning weight.
C. Only unanswered is emphasized; flagged is tucked away.

9. Autosave-failure toast behavior
A. Toast stays visible until dismissed or until the next successful save. Recommended.
B. Auto-dismiss after a few seconds.
C. Repeat a new toast on every failed save.

10. Overflow menu contents on mobile
A. `Text size`, `Review answers`, `Submit test`, `Leave test`, `Instructions/Help`. Recommended.
B. `Text size`, `Submit test`, `Leave test` only.
C. Custom list; specify it.

11. Start/instructions screen by mode
A. Mode-specific cards: `Live` shows session/timer rules, `Homework` shows due/attempt rules, `Solo` shows resume/draft state. Recommended.
B. One generic instructions screen for all three modes.
C. Mostly generic, with only one small mode badge.

12. From the review screen, when a student taps a question chip
A. Open the correct passage and reopen the question sheet directly at that question/group. Recommended.
B. Switch only the passage; student must reopen the sheet manually.
C. Open a lightweight preview first.

Once you answer these, I can draft the PRD and save it without leaving major gaps for a junior to invent around.
## User

1A | 2A | 3A | 5A | 6A | 7A (The interction I expect when click Question button to open the modal for question is that the content in here is similar to how right column in computer view works, questions of each passage are shown here and students have interactive platform to choose/fill their answer) | 8A | 9A | 10A | 11A | 12A | Ask me more questions to build up a detailed vision with almost no holes for you to have to imagine to fill, provide me advice on things which are lacking, conflicts which are potential, convolutions and irregular, illogical demands. Identify edge cases and preventions. 
you can stop and start compiling if you think there is nothing more you need, the plan you make will leave no room for the junior with no experience to act on their own, improvise, imagine, guess or hallucinate.

## Assistant

I have enough to draft the PRD. I’m checking the existing `/tasks` numbering and pulling the mobile-portability rule once so the PRD can explicitly encode the device-classification constraint instead of leaving it as an implementation guess.

## Assistant

I have enough to draft the PRD. I’m checking the existing task filename/style now so the saved document matches the repo’s pattern instead of inventing a new convention.

## Assistant

The repo has both a task-list artifact and a documentation copy for older PRDs. I’m checking the `documentation/tasks` naming pattern now so I save the actual PRD in the right place and don’t confuse it with the derived task-list format.

## Assistant

I’m sampling one UX-heavy PRD and the existing solo-practice PRD now so the new document matches the repo’s structure and level of prescription instead of being too loose.

## Assistant

I’m filling one last gap before I write: the exact current desktop submit-confirm behavior. The PRD needs to say “follow desktop” in concrete terms, not as a vague instruction a junior could interpret three ways.

## Assistant

I found the current desktop reading behavior: it still uses a basic unanswered-count confirm before manual submit, even though the repo also has a richer `SubmitTestModal` pattern elsewhere. I’m reading that exact section now so the PRD can explicitly upgrade mobile to the review-summary flow you asked for without contradicting the current logic.

## Assistant

I have the desktop submit behavior. I’m doing one quick platform-layer check before I write so the PRD can point juniors to the actual abstraction files where they exist and require creation only where they do not.

## Assistant

The platform hooks already exist, which is good. I’m reading the current `useScreenSize` shape so the PRD can say whether to extend it or layer a mobile-exam classifier on top of it.

## Assistant

I have the remaining contract details. I’m writing the PRD now and encoding the hidden conflict resolutions directly into it: phone-only activation via a shared classifier, no separate reading system, mobile question sheet replacing footer nav, and explicit state-memory/interrupt rules.

## Assistant

The PRD content is ready. The first write hit a Windows command-length limit, so I’m writing it in smaller patches instead of changing the content or the save location.

## Assistant

The draft is saved. I’m doing a quick integrity pass on the markdown now to catch structural mistakes before I hand it back.

## Assistant

The PRD is drafted and saved at [0043-prd-mobile-ielts-reading-test-taking-interface.md](C:/Users/The%20Lord/desktop/luyentap/documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md).

It locks the main ambiguity points down explicitly: phone-only activation through a shared classifier, desktop/tablet preserved, synced passage tabs plus near-fullscreen question sheet, review-summary-first manual submit, flagging, per-passage state memory, mode-specific resume behavior, and interruption handling for time-up, disconnect, teacher-end, and force-submit.

I did not generate the derived task list yet, and I did not run tests since this turn was PRD authoring only. The next step is to generate the implementation task breakdown from this PRD.

## User

export this whole conversation to an md file

## Assistant

I’m exporting the visible user-assistant transcript from this thread into a markdown file in the project root so you can keep or move it from there.
