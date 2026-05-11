# Reading V2 Student Runtime V1 UI Port Audit

This audit records the intended V1 Reading test-taking behavior before the V2 runtime is corrected. It uses recent product documentation plus the live V1 implementation as evidence.

Source documents consulted:

- `documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md`
- `documentation/architecture/mobile-ielts-reading-test-taking-architecture.md`
- `documentation/architecture/reading-passage-highlighting-architecture.md`
- `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`
- `documentation/tasks/PRD0048/reading-v2-student-runtime-v1-parity-contract.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-desktop-tablet.md`
- `documentation/tasks/PRD0048/reading-v2-page-schema-student-runtime-phone.md`

Reference implementation files inspected:

- `src/skills/reading/components/ReadingTestPage.tsx`
- `src/components/practice/IELTSPracticeView.tsx`
- `src/components/test/ReadingHeader.tsx`
- `src/components/test/TwoColumnLayout.tsx`
- `src/components/test/IELTSQuestionsPanel.tsx`
- `src/components/test/AuthenticAnswerInput.tsx`
- `src/components/test/InspiraFooterNav.tsx`
- `src/skills/reading/components/PassageControls.tsx`
- `src/skills/reading/components/PassageRenderer.tsx`
- `src/components/test/mobile/MobileReadingExamScaffold.tsx`
- `src/components/test/mobile/MobileReadingHeader.tsx`
- `src/components/test/mobile/MobilePassageTabs.tsx`
- `src/components/test/mobile/MobileQuestionSheet.tsx`
- `src/components/test/mobile/MobileReviewSummary.tsx`

## Product Interpretation

V1 is the visual and behavioral contract, not the V2 implementation foundation. V2 must not import legacy Reading runtime, parser, flat-question helpers, or heuristic grouped-task reconstruction. The target is: work like V1, but better modeled, projection-driven, and family-aware.

The prior V2 runtime was insufficient because it treated V1 parity as "two columns plus answer controls." The recent docs require more than that: the page chrome, passage controls, section navigation, full current-passage question panel, bottom footer, phone passage-first scaffold, bottom-sheet question layer, review summary, and answer-control density are all part of the student test-taking contract.

## Desktop And Tablet Feature Inventory

| Feature | What V1 Does | Interaction | Visual Intention | V2 Port Requirement |
|---|---|---|---|---|
| Exam header | Shows compact exam chrome, IELTS identity, test context, timer/student state, and submit/exit affordance. | Submit opens the controlled submit path; timer/state remain visible while reading. | Thin white exam bar, dense and utility-focused. | V2 must render a compact exam header instead of a product-card style header. |
| Two-column layout | Keeps passage/stimulus left and full question panel right. | Columns are independently scrollable; desktop can resize the split. | Full-height split exam surface, not a dashboard grid. | V2 must keep passage visible while answering and provide a resize affordance without depending on legacy code. |
| Passage controls | Provides text size, line spacing, highlighter toggle/colors, and clear highlights. | Desktop controls affect reading comfort and highlighting. | Small utility toolbar above the passage. | V2 desktop should expose the same control set or approved equivalents; phone suppresses highlighter per mobile docs. |
| Passage renderer | Renders title, paragraph labels, readable serif body text, and highlights from passage offsets. | Student reads, scrolls, and highlights when enabled. | Reading surface should feel like an exam text pane, not generic cards. | V2 must render projection stimulus with V1-like typography and avoid anchor-placeholder prompts. |
| Full current-passage question panel | Shows every task group for the active passage/section, not one isolated task card. | Student scrolls through grouped questions and can jump by question number. | Right column is one long grouped answer surface. | V2 must render all active-section task groups together. |
| Grouped instructions | Each task group carries its own task type, question range, instructions, and legend when needed. | Instructions stay visually attached to the answers they govern. | Boxed instruction header before each group. | V2 must keep instruction blocks attached and visible. |
| Answer controls | Completion uses inline blanks/direct text; TFNG/YNNG uses locked vocabulary; choice uses stacked option cards; matching uses tap-to-assign; structured layouts keep context and focused entry. | Answer state can be changed and cleared without leaving the passage. | Native IELTS-like controls, dense but readable. | V2 must use family-specific V1-like controls from projections, not generic placeholder cards. |
| Footer navigator | Shows parts/passages, question chips, answered/current state, and finish/review control. | Clicking a part changes section; clicking a question jumps to the group/question. | Fixed bottom exam navigator. | V2 must add a footer navigator and not rely only on a top task-group pill row. |
| Previous/next arrows | Floating controls move through question sequence. | Student can move forward/backward without hunting in the footer. | Small dark fixed buttons near bottom-right. | V2 desktop/tablet should provide fixed previous/next controls. |
| Submit review | Manual submit is controlled and should not claim readiness when endpoint/config is absent. | Review before confirmation; disabled or transparent blocker when submit unavailable. | Clear final action with no hidden failure. | V2 must keep disabled submit honest until the trusted endpoint exists. |

## Phone Feature Inventory

| Feature | What V1 Docs Require | Interaction | Visual Intention | V2 Port Requirement |
|---|---|---|---|---|
| Phone exam mode | Phone is passage-first, not a cramped split view. | Same route and content model, responsive runtime variant. | Full-viewport reading surface. | V2 phone must keep passage primary and hide desktop split chrome. |
| Mobile header | Compact header with timer/status and centered Submit. | Submit opens review summary; overflow holds secondary controls in V1. | 48px sticky bar. | V2 needs compact phone chrome, not the desktop header wrapped. |
| Passage tabs | Short `Passage 1`, `Passage 2`, etc. tabs stay reachable. | Switching passages preserves reading and question context. | 44px sticky tab strip. | V2 must render section tabs on page and inside sheet. |
| Questions FAB | Floating `Questions` action opens the answer layer. | Badge/progress should describe current-passage progress. | Reachable one-hand button. | V2 must expose a dynamic FAB, not a permanent right panel. |
| Bottom sheet | Near-fullscreen sheet shows current-passage grouped questions. | Close/reopen preserves passage scroll and question context. | Slide-up answer layer with backdrop and handle. | V2 must use a sheet-like layer with header, range, tabs, and full grouped panel. |
| Review summary | Manual submit routes through a pre-submit review grouped by passage. | Tapping question chips returns to the correct passage/question flow. | Full-screen or strong modal review aid, not result review. | V2 must group review state by section and keep final confirmation separate. |
| Mobile dense-task adaptation | Tables/diagrams/matching avoid tiny drag/drop or cramped inline tables. | Tap-to-assign or focused entry. | Touch-safe controls. | V2 must adapt structured and matching controls by family. |
| Highlighter | Hidden on mobile v1, while desktop highlight contract remains intact. | No mobile highlighter UI in first mobile contract. | Less visual noise. | V2 must suppress highlighter controls on phone. |

## UI Assessment Of Current V2 Runtime Before This Port

- It renders real prompts after Task 10, but still presents a simplified product shell instead of the V1 exam shell.
- Desktop only shows one active task group at a time, violating the full current-passage question panel contract.
- Navigation is a top task-group row, not the V1 footer navigator plus floating previous/next behavior.
- Passage controls are absent, so desktop reading comfort and highlighter affordances are missing.
- Phone has a Questions button and sheet, but lacks the documented compact mobile header, passage tabs, sheet header/range, synced sheet tabs, and section-grouped review.
- Answer controls are functional but not dense enough visually: choice controls look like plain labels, binary controls lack the V1 row treatment, and structured tasks are too generic.
- The tasklist marked many subtasks complete because basic semantic checks passed, but the documented UI contract was broader than the implemented verification. Testing did not create the omission; it merely failed to detect that the development target was too small.

## Port Decision

Implement a V2-native runtime that imitates V1 behavior and look:

- keep V2 projection-only runtime boundaries
- do not import V1 runtime components into `src/components/reading-v2/**`
- use the V1 docs and implementation as a product contract
- improve internals where V1 was limited by flat-question heuristics
- document any future deviation before accepting it as complete
