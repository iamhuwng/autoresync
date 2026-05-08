# Conversation Log â€” 2026-04-08

## 1. PRD-0043 Task List Reassessment

**User request:** Reassess `documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md` against the source PRD (`documentation/tasks/0043-prd-mobile-ielts-reading-test-taking-interface.md`) and the prior audit documentation (`documentation/design/Refine Mobile IELTS Task List.md`). Goal: confirm the task list is detailed, comprehensive, and foolproof for a junior developer.

### Actions Taken
- Read the full current task list (153 lines)
- Read the full PRD (710 lines) including Sections 7-12 (technical, edge cases, phases)
- Read the full design refinement doc (1282 lines) including all 13 identified issues
- Cross-referenced every FR (FR-1 through FR-109) against task coverage
- Cross-referenced all 22 edge cases (PRD Section 10) against task coverage
- Cross-referenced all 13 issues from the design refinement doc against current task state
- Verified key codebase assumptions: PassageRenderer font-size persistence, ReadingTestPage host state (isConnected, sessionStatus, isPaused, antiCheatConfig), IELTSPracticeView start screen (SoloResumeModal), antiSelectClass wiring

### Findings
See reassessment summary delivered in chat.

### Documents Updated (Pass 1 â€” Reassessment)
- **`documentation/design/Refine Mobile IELTS Task List.md`** â€” appended "Reassessment Pass 2 â€” 2026-04-08" section with prior issue resolution status, 3 blockers, 4 medium gaps, and 3 low-level notes
- **`documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md`** â€” appended "Notes To Cover" section with 3 blocker items (B1â€“B3), 4 medium items (M1â€“M4), and 3 low-level items (L1â€“L3), each with decision prompts for the product owner

## 2. Blocker Resolution Pass

**User decisions:**
1. B1 â†’ Add a task phase for the start screen
2. B2 â†’ Patch PassageRenderer guard (Option B)
3. B3 â†’ Scaffold calls onAutoSubmit (Option A)

### Actions Taken
- Read `SoloResumeModal.tsx` (140 lines) â€” confirmed already responsive, no changes needed
- Read `SoloSettingsModal.tsx` (219 lines) â€” confirmed uses Mantine (`Modal`, `Switch`, `Select`, `Slider`); must NOT render on mobile
- Read `TestWaitingOverlay.tsx` (91 lines) â€” confirmed already responsive (`maxWidth: 500px`, centered)
- Read `IELTSPracticeView.tsx` pre-test render flow (lines 400-609) â€” confirmed no dedicated start screen, just resume modal and then straight to test
- Added Phase 2A (Tasks 2A.1â€“2A.5) for mobile start/instructions screen
- Pulled `mobileInstructionsContent.ts` creation from Task 8.3 to Task 2A.1
- Added Task 7.2a for `onAutoSubmit` scaffold wiring in both hosts
- Added Task 8.6 for PassageRenderer `localStorage` guard
- Updated Tasks 2.5 (M1+L2), 3.2 (M4), 3.6 (M1), 3.7 (L1), 5.4 (M2), 8.1 (M4), 9.1 (L3), 9.7 (M3)
- Replaced Notes To Cover section with Resolution Log table
- Updated design doc with Resolution Pass section and final assessment

### Documents Updated (Pass 2 â€” Resolution)
- **`documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md`** â€” 15 edits: Phase 2A inserted, 6 existing tasks updated, 3 new tasks added, Notes To Cover replaced with resolution log
- **`documentation/design/Refine Mobile IELTS Task List.md`** â€” appended Resolution Pass with decisions, resolution table, and final assessment (109/109 FRs covered)

## 3. Implementation Assessment â€” PRD-0043 Faithfulness Audit

**User request:** Assess the implementation done so far against the original PRD (`0043-prd-mobile-ielts-reading-test-taking-interface.md`), the task list (`tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md`), and the findings doc (`findings-of-tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md`). Identify gaps, improvements, adjustments, refactorings, and redesigns needed.

### Actions Taken
- Read all 3 reference documents (PRD 710 lines, task list 184 lines, findings 25 lines)
- Inventoried all created files in `src/components/test/mobile/` (7 files)
- Read all implemented components: `useMobileExamMode.ts`, `useMobileExamMode.test.ts`, `MobileReadingExamScaffold.tsx`, `MobileReadingHeader.tsx`, `MobilePassageTabs.tsx`, `MobileQuestionsFab.tsx`, `MobileQuestionSheet.tsx`, `MobileQuestionSheet.css`, `MobileShellComponents.test.tsx`
- Examined both host integration points: `IELTSPracticeView.tsx` mobile branch, `ReadingTestPage.tsx` mobile branch
- Verified Phase 0 deliverables: `STUDENT_ACADEMIC_RECORD` route, `NavigationOptions.state`, `navigation.service.ts` state forwarding, `useSoloSubmission.ts` skipConfirm, test coverage
- Checked for missing files: `SavedMobileState` type, `storage.ts` key-enumeration, `PassageRenderer.tsx` font-size guard, `useTestSubmission.ts` skipConfirm
- Cross-referenced every completed task checkbox against actual code

### Findings
Full assessment delivered in chat response below.

## 3. PRD-0043 Tasks 3.6â€“3.8 Implementation

**User request:** Continue implementing tasks 3.6-3.8 from the PRD-0043 task list, following `process-task-list.md` guidelines. Fix foundational issues if found.

### Actions Taken

**Task 3.6 â€” Scaffold wiring:**
- Replaced the stub in `MobileReadingExamScaffold.tsx` with full mobile layout
- Layout: MobileReadingHeader â†’ MobilePassageTabs (page-level) â†’ scrollable passage content area â†’ MobileQuestionsFab (floating)
- MobileQuestionSheet overlay: info bar (passage label + question range + progress) â†’ synced MobilePassageTabs â†’ placeholder body for Task 4.0
- Added per-passage derived data computation (answered count, question range, flagged count) via useMemo
- Added scroll persistence logic: debounced save on scroll, save+restore on passage switch

**Task 3.7 â€” Desktop element suppression:**
- Verified structurally enforced by `if (isMobileExamMode) { return ...; }` early-return in both hosts
- All desktop-only elements (TwoColumnLayout, InspiraFooterNav, PassageControls, floating arrows, ReadingHeader, TestHeader) render only below the mobile return
- `highlighterActive={false}` already passed in both hosts
- No code changes needed

**Task 3.8 â€” Host-owned mobile shell state:**
- Added `questionSheetOpen` and `passageScrollByPassage` state to both `ReadingTestPage.tsx` and `IELTSPracticeView.tsx`
- Added `handleOpenQuestionSheet`, `handleCloseQuestionSheet`, `handlePassageScroll` callbacks
- Wired real state into scaffold props (replacing hardcoded no-ops)

**Foundational fix:**
- `ReadingTestPage.tsx`: `isSubmitting` was hardcoded as `false` in scaffold props
- Added `isSubmitting` to destructured return from `useTestSubmission` and wired real value

### Test Results
- 31/31 tests pass (23 shell component + 8 useMobileExamMode)
- TypeScript compilation clean (only pre-existing `totalEvents` warning)

### Commit
`feat(mobile-ielts): wire scaffold layout, host state, and scroll persistence (Task 3.0)` â€” 6 files changed, 330 insertions, 67 deletions. Parent task 3.0 marked complete.

### Files Modified
- `src/components/test/mobile/MobileReadingExamScaffold.tsx` â€” Full scaffold layout replacing stub
- `src/skills/reading/components/ReadingTestPage.tsx` â€” Host-owned mobile state, isSubmitting fix
- `src/components/practice/IELTSPracticeView.tsx` â€” Host-owned mobile state
- `documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md` â€” Tasks 3.6-3.8 and parent 3.0 marked [x]
- `documentation/tasks/findings-of-tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md` â€” Findings for 3.6, 3.7, 3.8

## 3. PRD-0043 Reassessment Pass 3 â€” PRD Fidelity Audit & Bug Fixes

**User request (session 2):** Continue the rigorous assessment of tasks 3.4-3.8 implementation, provide comprehensive findings, and fix all identified bugs.

### Investigation
- Re-read all mobile scaffold components, both host components, QuestionNavigator, and IELTSQuestionsPanel
- Cross-referenced every FR in the PRD against the actual implementation
- Verified hook ordering, prop contracts, and rendering behavior

### Bugs Found & Fixed

**CRITICAL-1: React Rules of Hooks violation (both hosts)**
- `ReadingTestPage.tsx` and `IELTSPracticeView.tsx` declared mobile shell state hooks (7-8 hooks each) AFTER loading/error early returns
- This would crash React when `loading` transitions from `true` to `false` (different hook count)
- **Fix:** Moved all hooks above the early returns in both files

**CRITICAL-2: QuestionNavigator number mismatch for non-first passages**
- `QuestionNavigator` always generated chips [1, 2, ..., N] regardless of actual question numbers
- For passage 2 (questions 14-26), chips showed 1-13 and no chip matched current/answered/flagged state
- Clicking chip "1" would cross-passage jump to question 1 on passage 1
- **Fix:** Added `startNumber` prop to `QuestionNavigator.tsx` (default=1 for backward compatibility), and passed `Math.min(...)` of passage question numbers from the scaffold

**HIGH-1: FAB label missing "Questions" prefix**
- Visible text was `"12/40"` but PRD FR-42 specifies `"Questions 12/40"`
- **Fix:** Added "Questions " prefix to `MobileQuestionsFab.tsx`

**HIGH-2: Scaffold root uses 100vh not 100dvh**
- On mobile Safari, `100vh` includes address bar height, pushing FAB below visible area
- **Fix:** Changed to `100dvh` in inline style + added `<style>` tag with `100vh` fallback for older browsers

**MEDIUM-1: isPaused hardcoded to false in IELTSPracticeView**
- Solo mode has its own pause mechanism but passed `isPaused={false}` to scaffold
- Mobile header wouldn't show "Paused" text during pause
- **Fix:** Changed to `isPaused={isPaused}` from `useSoloTimer` state

### Documents Updated
- **`documentation/tasks/findings-of-tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md`** â€” Appended "Reassessment Pass 3" section with full severity-graded audit (2 critical, 2 high, 4 medium, 3 low findings), task 3.4-3.8 re-verification, and PRD coverage summary table

### Files Modified
- `src/skills/reading/components/ReadingTestPage.tsx` â€” Moved mobile shell hooks above early returns (CRITICAL-1)
- `src/components/practice/IELTSPracticeView.tsx` â€” Moved mobile shell hooks above early returns (CRITICAL-1), fixed isPaused (MEDIUM-1)
- `src/components/test/QuestionNavigator.tsx` â€” Added `startNumber` prop (CRITICAL-2)
- `src/components/test/mobile/MobileReadingExamScaffold.tsx` â€” Pass `startNumber` to navigator (CRITICAL-2), 100dvh fix (HIGH-2)
- `src/components/test/mobile/MobileQuestionsFab.tsx` â€” Added "Questions" prefix (HIGH-1)

---

## 3. Session 3 â€” Remaining Issues + Task 4.6 (continued)

### Summary
Addressed all remaining MEDIUM and LOW priority issues, then implemented Task 4.6: Per-passage question group memory.

### Issues Addressed

| ID | Issue | Fix |
|----|-------|-----|
| MEDIUM-2 | `onManualSubmit`/`onAutoSubmit` return types | Changed to `() => void \| Promise<void>` in scaffold props |
| MEDIUM-3 | Scroll debounce 150ms vs PRD 500ms | Added documentation comment clarifying 150ms is for in-memory UI tracking; PRD 500ms applies to persistence writes |
| LOW-1 | Monolithic test file | Split `MobileShellComponents.test.tsx` into 4 per-component files; original file kept as deprecated placeholder |
| LOW-2 | No scaffold-level tests | Created `MobileReadingExamScaffold.test.tsx` with 22 tests covering prop passthrough, derived state, conditional rendering, and Task 4.6 features |
| LOW-3 | `lineSpacing` not wired to IELTSQuestionsPanel | Added TODO comment documenting this is a Task 8.5 concern (IELTSQuestionsPanel needs prop support first) |

### Task 4.6: Per-Passage Question Group Memory

**Implementation:**
- **Scaffold props**: Added `activeQuestionByPassage`, `onActiveQuestionChange`, `questionSheetScrollByPassage`, `onQuestionSheetScroll` to `MobileReadingExamScaffoldProps`
- **Scaffold logic**:
  - `firstUnansweredQuestion` â€” computed per-passage default (FR-52)
  - `effectiveActiveQuestion` â€” resolves host memory â†’ first unanswered fallback
  - `handleQuestionClick` â€” wraps `onQuestionClick` to also update per-passage active question memory
  - `handleSheetBodyScroll` â€” debounced handler that saves sheet scroll position per passage
  - Save/restore effects for passage switch while sheet is open
  - Restore sheet scroll position when sheet is (re)opened
- **Host wiring**: Added `activeQuestionByPassage`, `questionSheetScrollByPassage` state + callbacks to both `ReadingTestPage` and `IELTSPracticeView`, wired as props to scaffold
- **Tests**: 4 new tests covering effectiveActiveQuestion resolution, FR-52 first-unanswered default, all-answered fallback, and callback wiring

### Files Created
- `src/components/test/mobile/MobileReadingHeader.test.tsx`
- `src/components/test/mobile/MobilePassageTabs.test.tsx`
- `src/components/test/mobile/MobileQuestionsFab.test.tsx`
- `src/components/test/mobile/MobileQuestionSheet.test.tsx`
- `src/components/test/mobile/MobileReadingExamScaffold.test.tsx`

### Files Modified
- `src/components/test/mobile/MobileReadingExamScaffold.tsx` â€” MEDIUM-2, MEDIUM-3, LOW-3, Task 4.6 implementation
- `src/components/test/mobile/MobileShellComponents.test.tsx` â€” Deprecated (LOW-1)
- `src/skills/reading/components/ReadingTestPage.tsx` â€” Task 4.6 host state + wiring
- `src/components/practice/IELTSPracticeView.tsx` â€” Task 4.6 host state + wiring

### Test Results
- **7 test files, 68 tests, all passing** (`npx vitest run src/components/test/mobile`)

---

## 4. Session 3b â€” Task 4.6 Bug Fixes (self-audit)

### Bugs Found During Verification
1. **Bug 1 (dead code)**: The separate sheet passage-switch effect (lines 382-398) never fired because `prevPassageIdRef` was already updated by the passage-content scroll effect declared earlier in the same render. React effects fire in declaration order.
2. **Bug 2 (missing save)**: `effectiveActiveQuestion` (which includes the FR-52 auto-selected first-unanswered default) was never persisted to `activeQuestionByPassage` on passage switch. Only explicit user clicks saved it.

### Fixes Applied
- **Merged** Task 4.6 sheet save/restore logic INTO the existing unified passage-switch effect (before `prevPassageIdRef` update)
- **Added** `effectiveActiveQuestionRef` to track the current effective question via a ref, avoiding stale closures in the effect
- **Synced** the ref with `effectiveActiveQuestionRef.current = effectiveActiveQuestion` on every render
- **Removed** the dead separate passage-switch effect
- Tests still passing: 7 files, 68 tests


---

## 5. Session 4 - Task 4.6 Group-Anchor Refactor

### Summary
Replaced the earlier question-number approximation for Task 4.6 with a full question-group restoration flow that matches the PRD more closely.

### Implementation
- Created `src/components/test/readingQuestionGroups.ts` to centralize reading-question grouping, first-unanswered-group lookup, and question-to-group resolution
- Renamed the host memory contract to `activeQuestionGroupByPassage` in both `ReadingTestPage.tsx` and `IELTSPracticeView.tsx`
- Updated `MobileReadingExamScaffold.tsx` to restore exact group anchors, persist visible groups per passage, and keep sheet scroll/group state aligned across reopen and passage switch flows
- Updated `IELTSQuestionsPanel.tsx` so the embedded mobile sheet can report rendered question-group anchor offsets back to the scaffold
- Expanded `MobileReadingExamScaffold.test.tsx` to cover saved group restoration, FR-52 group defaults, group-aware navigator clicks, visible-group tracking from sheet scroll, and outgoing-passage save behavior

### Bug Found During Verification
- Passage switching initially saved the incoming passage's group anchor to the outgoing passage
- Fix: added `lastKnownQuestionGroupByPassageRef` and used it when persisting the outgoing passage state

### Test Results
- `cmd /c npx vitest run src/components/test/mobile/MobileReadingExamScaffold.test.tsx src/components/test/QuestionNavigator.test.tsx --reporter=basic`
- 44/44 tests passing

### Documents Updated
- `documentation/tasks/tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md` - marked Task 4.6 complete and refreshed Relevant Files
- `documentation/tasks/findings-of-tasks-0043-prd-mobile-ielts-reading-test-taking-interface.md` - appended Task 4.6 resolution notes and remaining 4.7 gap

---

## 6. Session 5 - Library Mobile Detector Hardening

### Summary
Fixed a remaining phone-classification gap where an IELTS Reading test opened from the student Library tab could still render the desktop two-column layout if the browser exposed a widened desktop-style viewport.

### Investigation
- Rechecked `documentation/tasks/process-task-list.md`, `documentation/rules/mobile-portability.md`, `documentation/rules/observability.md`, and the student-view design spec before changing code
- Reproduced the exact Library route in Chrome DevTools MCP: `StudentLibraryPage.tsx -> StudentPracticePage.tsx -> IELTSPracticeView.tsx`
- Confirmed the Library route itself was already correct and normal mobile UA emulation already rendered the phone scaffold
- Isolated the remaining gap to `useMobileExamMode.ts`, which only handled phone UA signals or `isMobile && pointer: coarse`

### Implementation
- Added `hasHoverCapablePointer()` and `hasDesktopSitePhoneViewport()` to `src/core/platform/hooks/useMobileExamMode.ts`
- Hardened the final fallback so touch-only, non-hover phone sessions with widened desktop-style viewports still classify as mobile exam mode
- Extended `src/core/platform/hooks/useMobileExamMode.test.ts` with:
  - a widened desktop-site-on-phone regression case
  - a tablet-sized negative control
  - explicit viewport dimension control alongside screen dimension control

### Verification
- `cmd /c npx vitest run src/core/platform/hooks/useMobileExamMode.test.ts --reporter=basic`
- 10/10 tests passing
- Chrome DevTools MCP verification:
  - normal Library mobile path still rendered the mobile scaffold
  - widened `980x844` touch-only desktop-UA emulation from `/student/library` into `IELTS Reading Test - March 2026` now also rendered the mobile scaffold instead of the desktop two-column layout

---

## 7. Session 6 - Mobile Matching Headings Redesign

### Summary
Replaced the phone-sheet matching-headings surface with a mobile-specific select-card layout while keeping the existing desktop drag-and-drop experience unchanged.

### Investigation
- Rechecked `documentation/tasks/process-task-list.md`, `documentation/rules/codebase-hygiene.md`, `documentation/rules/react-patterns.md`, `documentation/rules/observability.md`, and the student-view design guidance before editing
- Traced the current path to the shared matching-headings branch in `IELTSQuestionsPanel.tsx`
- Confirmed the mobile sheet was still reusing `DragDropMatchingInput`, including drag-specific help text

### Implementation
- Added `src/components/test/MobileMatchingHeadingsInput.tsx`
- The new mobile UI uses:
  - a collapsible headings reference list
  - one card per paragraph/question
  - native per-card heading selects for tap-first interaction
  - selected-heading preview blocks
  - duplicate-option disabling while preserving the current selection
- Updated `IELTSQuestionsPanel.tsx` so `embedded && group.type === 'matching-headings'` uses the new mobile component, while desktop/tablet still use `DragDropMatchingInput`
- Replaced the old hardcoded matching help modal copy with contextual help variants so mobile headings instructions no longer tell students to drag items

### Verification
- `cmd /c npx vitest run src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.test.tsx --reporter=basic`
- 5/5 tests passing
- `cmd /c npm run check:utf8 -- src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.tsx src/components/test/IELTSQuestionsPanel.test.tsx`
- UTF-8 check passed for all touched files

## 8. Session 7 - Mobile Matching Headings Overflow Follow-up

### Summary
Hardened the new mobile matching-headings field so long heading labels wrap cleanly on narrow phones instead of overflowing the control.

### Investigation
- Rechecked `documentation/tasks/process-task-list.md`, `documentation/rules/codebase-hygiene.md`, and `documentation/rules/react-patterns.md` before the follow-up edit
- Confirmed the first mobile redesign had already switched the sheet away from desktop drag-and-drop, but the field chrome still needed a more explicit mobile wrapping contract
- Tightened the panel test contract to match the actual mobile button-based picker surface

### Implementation
- Updated `src/components/test/MobileMatchingHeadingsInput.tsx` so each heading field uses a full-width button trigger with wrapped text and an in-card option list instead of native select chrome
- Added explicit wrap guards for long heading-reference text, question prompts, option rows, and selected-heading previews
- Updated `src/components/test/IELTSQuestionsPanel.test.tsx` to assert the embedded/mobile button contract

### Verification
- `cmd /c npx vitest run src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.test.tsx --reporter=basic`
- 5/5 tests passing
- `cmd /c npm run check:utf8 -- src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.tsx src/components/test/IELTSQuestionsPanel.test.tsx`
- UTF-8 check passed for all touched files

## 9. Session 8 - Mobile Matching Headings Modal Picker Follow-up

### Summary
Changed the mobile matching-headings field so each paragraph opens a dedicated modal picker instead of expanding the heading choices inline.

### Investigation
- Rechecked `documentation/tasks/process-task-list.md` and the student-facing mobile UI guidance before the follow-up edit
- Confirmed the previous overflow-safe version still expanded the heading choices inside the sheet, which made the interaction feel heavier than the earlier modal pattern

### Implementation
- Replaced the inline open-state rendering in `src/components/test/MobileMatchingHeadingsInput.tsx` with a dedicated dialog overlay bound to the tapped paragraph field
- Kept the selected-heading preview and external Clear action on the paragraph card
- Preserved duplicate-option disabling and long-text wrapping inside the modal option list
- Updated `src/components/test/MobileMatchingHeadingsInput.test.tsx` to assert the modal picker contract

### Verification
- `cmd /c npx vitest run src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.test.tsx --reporter=basic`
- 5/5 tests passing
- `cmd /c npm run check:utf8 -- src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.tsx src/components/test/IELTSQuestionsPanel.test.tsx`
- UTF-8 check passed for all touched files
## 10. Session 9 - Mobile Header and Question Sheet Simplification Follow-up

### Summary
Tightened the phone Reading shell by moving Submit into the header, shortening the passage tabs, simplifying the Questions launcher, and stripping the question sheet down to the compact navigator row.

### Investigation
- Rechecked `documentation/tasks/process-task-list.md` before continuing the follow-up so the task record stayed append-only and in order
- Confirmed the remaining user friction was concentrated in repeated mobile chrome rather than passage or answer rendering
- Verified the existing navigator click path already jumped to the correct question, so the UI work could stay focused on removing redundant rows and labels

### Implementation
- Updated `src/components/test/mobile/MobileReadingHeader.tsx` so the middle header action is the primary Submit button, with submitting and submitted states
- Updated `src/components/test/mobile/MobileReadingExamScaffold.tsx` to open review from the header submit action, remove the overflow submit item, and render the sheet without the extra header/info rows
- Updated `src/components/test/mobile/MobilePassageTabs.tsx` to show generic `Passage 1/2/3` labels
- Updated `src/components/test/mobile/MobileQuestionsFab.tsx` to remove the `x/y` text from the launcher label
- Updated `src/components/test/mobile/MobileQuestionSheet.tsx` and `src/components/test/QuestionNavigator.tsx` so mobile keeps only the compact horizontal pill row with no show-all mode
- Refreshed the focused component and scaffold tests to match the new mobile shell contract

### Verification
- `cmd /c npx vitest run src/components/test/mobile/MobileReadingHeader.test.tsx src/components/test/mobile/MobilePassageTabs.test.tsx src/components/test/mobile/MobileQuestionsFab.test.tsx src/components/test/mobile/MobileQuestionSheet.test.tsx src/components/test/mobile/MobileOverflowMenu.test.tsx src/components/test/QuestionNavigator.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx --reporter=basic`
- 83/83 tests passing
- `cmd /c npm run check:utf8 -- src/components/test/mobile/MobileReadingHeader.tsx src/components/test/mobile/MobilePassageTabs.tsx src/components/test/mobile/MobileQuestionsFab.tsx src/components/test/mobile/MobileQuestionSheet.tsx src/components/test/QuestionNavigator.tsx src/components/test/mobile/MobileReadingExamScaffold.tsx src/skills/reading/components/ReadingTestPage.tsx src/components/practice/IELTSPracticeView.tsx src/components/test/mobile/MobileReadingHeader.test.tsx src/components/test/mobile/MobilePassageTabs.test.tsx src/components/test/mobile/MobileQuestionsFab.test.tsx src/components/test/mobile/MobileQuestionSheet.test.tsx src/components/test/mobile/MobileOverflowMenu.test.tsx src/components/test/QuestionNavigator.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx`
- UTF-8 check passed for all touched files
## 11. Session 10 - Question Pill Jump Precision Follow-up

### Summary
Fixed the remaining mobile question-pill jump bug by wiring exact per-question anchors into grouped Reading renderers.

### Investigation
- Rechecked `documentation/tasks/process-task-list.md` before the follow-up so the task history stayed append-only
- Traced the question-number pill click from `MobileReadingExamScaffold` into `IELTSQuestionsPanel`
- Confirmed the click callback itself was firing; the real gap was that several grouped renderers only registered a shared container ref, so scroll targeting inside the sheet was imprecise

### Implementation
- Updated `src/components/test/IELTSQuestionsPanel.tsx` so grouped mobile question types can register exact question anchors back into the panel scroll map
- Updated `src/components/test/MatchingFeaturesInput.tsx`, `src/components/test/MatchingInformationInput.tsx`, `src/components/test/MobileMatchingHeadingsInput.tsx`, and `src/components/test/DragDropMatchingInput.tsx` to expose per-question row/card/drop-zone refs
- Updated the summary-completion-list branch in `IELTSQuestionsPanel.tsx` so each inline blank registers its own question anchor instead of sharing the same paragraph wrapper
- Added focused regressions in `src/components/test/IELTSQuestionsPanel.test.tsx`, `src/components/test/MatchingInformationInput.test.tsx`, and `src/components/test/MobileMatchingHeadingsInput.test.tsx`

### Verification
- `cmd /c npx vitest run src/components/test/IELTSQuestionsPanel.test.tsx src/components/test/MatchingInformationInput.test.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx --reporter=basic`
- 42/42 tests passing
- `cmd /c npm run check:utf8 -- src/components/test/IELTSQuestionsPanel.tsx src/components/test/MatchingFeaturesInput.tsx src/components/test/MatchingInformationInput.tsx src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/DragDropMatchingInput.tsx src/components/test/IELTSQuestionsPanel.test.tsx src/components/test/MatchingInformationInput.test.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx`
- UTF-8 check passed for all touched files
## 12. Session 11 - Mobile Matching Headings Selected-State Cleanup

### Summary
Removed the duplicate selected-heading rendering inside each mobile matching-headings question card.

### Investigation
- Rechecked `documentation/tasks/process-task-list.md` before the follow-up so the task history stayed append-only
- Confirmed the selected heading was already rendered inside the main field button
- Found the duplication came from an additional selected-heading preview block rendered beneath the field

### Implementation
- Updated `src/components/test/MobileMatchingHeadingsInput.tsx` to remove the extra selected-heading preview block
- Kept the existing selected-state border treatment and the Clear action
- Added a regression in `src/components/test/MobileMatchingHeadingsInput.test.tsx` to assert the selected heading text appears once inside the question card

### Verification
- `cmd /c npx vitest run src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.test.tsx --reporter=basic`
- 8/8 tests passing
- `cmd /c npm run check:utf8 -- src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.tsx src/components/test/IELTSQuestionsPanel.test.tsx`
- UTF-8 check passed for all touched files

## 2026-04-08 23:50 ICT - Mobile Reading Flagging Removal

- Removed mobile Reading flagging end-to-end from the live host, solo/homework host, scaffold, review summary, FAB, and embedded Reading question panel.
- Stopped serializing `flaggedQuestions` in `SavedMobileState`; kept the type field optional only for legacy payload tolerance.
- Added `src/components/test/mobile/mobileReadingState.test.ts` to lock the new persistence contract and legacy-hydration behavior.
- Verification: targeted Vitest suites passed (`76/76` + `2/2`) and targeted UTF-8 checks passed.

## 2026-04-08 23:57 ICT - Mobile Pill Color Normalization

- Updated only the mobile/collapsible question-pill styling in `QuestionNavigator.tsx`; desktop/grid mode was left unchanged.
- Current mobile pill now uses a blue ring over the underlying answered/unanswered state.
- Mobile review-summary unanswered state now uses neutral slate instead of amber/orange.
- Verification: `55/55` focused tests passed and targeted UTF-8 checks passed.
