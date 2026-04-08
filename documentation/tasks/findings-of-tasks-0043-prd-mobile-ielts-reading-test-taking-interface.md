# Findings: PRD-0043 Mobile IELTS Reading Test-Taking Interface

## Task 2.4 â€” ReadingTestPage Mobile Branch

**Finding:** `activePassageId` in `ReadingTestPage` is typed `string | null`, but the scaffold props require `string`. Applied `|| ''` fallback to satisfy TypeScript while preserving fail-safe behavior â€” the scaffold will receive an empty string rather than null when no passage is active (edge case during initial load).

## Task 2.5 â€” IELTSPracticeView Mobile Branch

**Finding:** `timeRemaining` can be `Infinity` for untimed solo/homework sessions. The scaffold's `timeRemaining` prop is typed `number`, which technically includes `Infinity`. The mobile scaffold will need to handle this in Phase 3 by checking `isFinite()` and hiding the timer display when time is unbounded.

## Task 2.6 â€” Scaffold Props Interface

**Finding:** The `PassageRendererComponent` and `answers` props initially used `unknown` types for maximum safety, but this created TypeScript incompatibilities with the host components' concrete types (`PassageRendererProps`, `Record<number, string | string[] | Record<string, string>>`). Resolved by using `any` (with ESLint suppression comments) for these cross-boundary props, since the scaffold is a pure presentation layer that passes them through without inspection.

**Finding (pre-existing):** `totalEvents` is declared but never read in `IELTSPracticeView.tsx` (line 213). This is a pre-existing unused variable unrelated to our changes.

## Task 3.2 â€” MobilePassageTabs scrollTo guard

**Finding:** jsdom does not implement `Element.scrollTo()`, causing test crashes. Added a `typeof container.scrollTo === 'function'` guard with an `else` branch that falls back to direct `container.scrollLeft` assignment. This is safe for production since all real mobile browsers implement `scrollTo`, and the fallback provides identical non-animated behavior for any edge cases.

## Task 3.4 â€” MobileQuestionSheet body scroll lock

**Finding:** The sheet uses `document.body.style.overflow = 'hidden'` to lock scroll when open. This is a direct DOM mutation (Rule 19 trigger) but is acceptable here because: (a) this component is explicitly mobile-only and lives in the `test/mobile/` directory, (b) both Capacitor WebView and mobile Safari need body scroll lock to prevent background scroll-through, (c) the cleanup function in `useEffect` restores the previous overflow value, making it non-destructive.

## Task 3.6 â€” Scaffold wiring

**Finding:** The scaffold computes per-passage derived data (answered count, question range, flagged count) from host-provided `questions` and `answers` props using `useMemo`. This is pure derivation, not state ownership, which is permitted under the pure-presentation constraint. The `handleOverflowMenuToggle` callback is a no-op placeholder pending Phase 8 (overflow menu).

## Task 3.7 â€” Desktop element suppression

**Finding:** Task 3.7 is structurally enforced by the `if (isMobileExamMode) { return ...; }` early-return pattern in both `ReadingTestPage` and `IELTSPracticeView`. All desktop-only elements (`TwoColumnLayout`, `InspiraFooterNav`, `PassageControls`, floating â†/â†’ arrows, `ReadingHeader`, `TestHeader`) render only in the code path below the mobile return. `highlighterActive={false}` is already passed in both hosts. No code changes were needed.

## Task 3.8 â€” Host-owned mobile shell state

**Finding (foundational fix):** `ReadingTestPage` had `isSubmitting={false}` hardcoded in the scaffold props. `useTestSubmission` returns `isSubmitting` but it was not destructured. Fixed by adding `isSubmitting` to the destructured return and passing the real value to the scaffold.

**Finding:** Both hosts now declare `questionSheetOpen` and `passageScrollByPassage` state at the component level (outside the `if (isMobileExamMode)` guard). This ensures React hook ordering is deterministic regardless of the conditional render path. The scroll persistence logic (save on passage switch, restore via `requestAnimationFrame`) lives in the scaffold since it owns the DOM ref for the passage content scroller, while the host owns the state map.

## Task 2A.5 â€” MobileStartScreen Unit Tests

**Finding:** All 24 unit tests pass across 6 test groups covering: solo mode rules, homework mode rules, live mode rules (with hidden start button), start button callback wiring, absence of desktop chrome, and compact single-column layout. The `ResolvedPracticeSettings` type is consumed directly by the component to test conditional rules (timer, pause, attempts, feedback timing).

**Finding:** The `timeLimit` prop correctly handles `null` (untimed) â€” the `â±ï¸` meta display is conditionally hidden using `{timeLimit && ...}`. Singular/plural text for passages and questions is handled by the `!== 1` ternary pattern.

---

# Reassessment Pass 3 â€” PRD Fidelity Audit (2026-04-08)

> **Scope:** All completed tasks (1.0â€“4.5) cross-referenced against the original PRD (0043-prd-mobile-ielts-reading-test-taking-interface.md). Special focus on Tasks 3.4â€“3.8 which were accidentally removed and re-added.

## Severity Legend

- ðŸ”´ **CRITICAL** â€” Will crash or fundamentally break at runtime
- ðŸŸ  **HIGH** â€” Functional bug: renders wrong data, wrong behavior, or violates a mandatory FR
- ðŸŸ¡ **MEDIUM** â€” Deviation from PRD spec that should be corrected before Phase 5+
- ðŸ”µ **LOW** â€” Minor style/org deviation, acceptable to defer

---

## ðŸ”´ CRITICAL-1: React Rules of Hooks Violation (both hosts)

**Affects:** `ReadingTestPage.tsx` (lines 504â€“525), `IELTSPracticeView.tsx` (lines 465â€“486)

**Problem:** `React.useState` and `React.useCallback` calls for mobile shell state (`questionSheetOpen`, `passageScrollByPassage`, `flaggedQuestions`, and their callbacks) are placed **after** conditional early returns (loading/error guards at lines 441/460 in ReadingTestPage; lines 417/431 in IELTSPracticeView).

When `loading === true`, the component returns early and these 7 hooks are **never called**. When loading transitions to `false`, React sees a different hook count than the previous render and will throw: _"Rendered more hooks than during the previous render."_

The existing findings doc (Task 3.8) says "outside the `if (isMobileExamMode)` guard" â€” this is true but misleading. They ARE outside the mobile guard but AFTER the loading/error early returns.

**Fix:** Move all 7 hook declarations (3 `useState`, 4 `useCallback`) to the top of each component, alongside the other hooks, BEFORE any conditional returns. The states are cheap (boolean, empty object, empty Set) and have no side effects when the component is in a loading state.

---

## ðŸ”´ CRITICAL-2: QuestionNavigator Number Mismatch in Mobile Scaffold

**Affects:** `MobileReadingExamScaffold.tsx` lines 391â€“403

**Problem:** `QuestionNavigator` generates chip numbers as `Array.from({ length: totalQuestions }, (_, i) => i + 1)` â€” always producing `[1, 2, ..., N]`. The scaffold computes `totalQuestions` as the range span (`max - min + 1`) for the active passage.

For Passage 2 with questions 14â€“26:
- `totalQuestions = 26 - 14 + 1 = 13` â†’ chips render as [1, 2, ..., 13]
- But `currentQuestion = 14`, `answeredQuestions = Set{14, 15}`, `flaggedQuestions = Set{16}`
- **Result:** No chip is ever highlighted as current, answered, or flagged. Clicking chip "1" dispatches `onQuestionClick(1)` which navigates to question 1 on Passage 1 â€” **cross-passage jump**.

The navigator is completely non-functional for any passage except the first.

**Fix (two options):**
- **(A â€” preferred)** Add `startNumber?: number` prop to `QuestionNavigator`. Generate `Array.from({ length: count }, (_, i) => startNumber + i)`. In the scaffold, pass `startNumber={Math.min(...activePassageQuestions.map(q => q.number))}`.
- **(B)** Replace `totalQuestions` with a `questionNumbers: number[]` array prop and let the scaffold pass `activePassageQuestions.map(q => q.number)` directly.

---

## ðŸŸ  HIGH-1: FAB Label Missing "Questions" Prefix

**Affects:** `MobileQuestionsFab.tsx` line 90  
**PRD ref:** FR-42, Task 3.3

**Problem:** Visible text is `{answeredCount}/{totalCount}` but the PRD mandates `"Questions X/Y"`. The aria-label correctly says "Questionsâ€¦" but the on-screen label does not include the word "Questions".

**Fix:** Change `<span>{answeredCount}/{totalCount}</span>` to `<span>Questions {answeredCount}/{totalCount}</span>`.

---

## ðŸŸ  HIGH-2: Scaffold Root Uses `100vh` Not `100dvh`

**Affects:** `MobileReadingExamScaffold.tsx` line 137

**Problem:** `scaffoldRootStyle.height = '100vh'`. On mobile Safari, `100vh` includes the browser address bar, making the scaffold taller than the visible viewport. This pushes the FAB below the screen fold and causes scroll issues. The `MobileQuestionSheet.css` already correctly uses `100dvh` with a `100vh` fallback (lines 36â€“38), proving the team knows about this.

**Fix:** Use the same pattern: `height: '100dvh'` with a fallback, or use `minHeight: '100vh'` + `minHeight: '100dvh'` in inline style (note: React inline styles don't support duplicate keys, so this should be moved to CSS or use a dynamic approach).

---

## ðŸŸ¡ MEDIUM-1: `isPaused` Hardcoded to `false` in IELTSPracticeView Mobile Branch

**Affects:** `IELTSPracticeView.tsx` line 572

**Problem:** The scaffold receives `isPaused={false}` even though solo mode has its own pause mechanism (`useSoloTimer` pause). While the pause overlay (z-9000) covers the scaffold visually, the mobile header won't show "Paused" text â€” it'll show a frozen timer value with no context. If the overlay animates in/out, the student briefly sees a frozen timer without explanation.

**Fix:** Pass `isPaused={isPaused}` from the solo timer state. The mobile header already handles `isPaused` correctly (shows amber "Paused" label).

---

## ðŸŸ¡ MEDIUM-2: `onManualSubmit` / `onAutoSubmit` Return Type Mismatch

**Affects:** `MobileReadingExamScaffoldProps` lines 79â€“81  
**PRD ref:** Section 7.2a

**Problem:** PRD specifies `onManualSubmit: () => Promise<void>` and `onAutoSubmit: () => Promise<void>`, but the scaffold interface declares both as `() => void`. This isn't a runtime crash (void return is compatible with Promise), but it means the scaffold can't `await` these calls for proper submission flow gating in Tasks 5.4â€“5.6.

**Fix:** Change to `() => void | Promise<void>` or `() => Promise<void>` to match the PRD contract.

---

## ðŸŸ¡ MEDIUM-3: Scroll Debounce Too Aggressive (150ms vs PRD 500ms)

**Affects:** `MobileReadingExamScaffold.tsx` line 174  
**PRD ref:** FR-91b

**Problem:** `SCROLL_DEBOUNCE_MS = 150` but the PRD specifies `â‰¥500ms`: "only persist when the user stops scrolling for â‰¥500ms." The current 150ms is for UI responsiveness inside the scaffold (save/restore on passage switch), which is fine. But when this feeds into the autosave hooks (Tasks 6.2/6.3), it should use the PRD-specified 500ms for persistence writes.

**Action:** Document this distinction. The scaffold's 150ms debounce is for in-memory state tracking (acceptable). Autosave persistence in Tasks 6.2/6.3 must use a separate â‰¥500ms debounce.

---

## ðŸŸ¡ MEDIUM-4: Missing Task 4.6 â€” Per-Passage Question Group Memory

**Affects:** Tasks 4.6 (marked unchecked), scaffold behavior

**Problem:** Task 4.6 specifies host-owned `activeQuestionGroupByPassage: Record<string, number>` and `questionSheetScrollByPassage: Record<string, number>`. These are needed so that switching passages while the sheet is open restores the correct question group and sheet scroll position. Neither host currently tracks these.

The scaffold props interface already has `passageScrollByPassage` for page-level passage scroll, but not for sheet-internal scroll or question group tracking.

**Status:** Correctly marked as unchecked in the task list. But this means FR-51 ("restore that passage's last known question-sheet scroll position and active question group") is not yet implemented even though the sheet is otherwise functional. This should be prioritized in the next phase.

---

## ðŸ”µ LOW-1: Test File Organization Deviation

**Affects:** File structure

**Problem:** The task list specifies individual test files per component (e.g., `MobileReadingHeader.test.tsx`, `MobilePassageTabs.test.tsx`), but the implementation consolidates all Phase 3 tests into `MobileShellComponents.test.tsx`.

**Impact:** No functional impact. The consolidated file covers all required test cases. However, as more components are added (MobileOverflowMenu, MobileTextSizeControl, MobileReviewSummary), the file will grow unwieldy.

---

## ðŸ”µ LOW-2: Missing Scaffold-Level Tests

**Affects:** `MobileReadingExamScaffold.test.tsx` (does not exist)

**Problem:** Task 4.7 calls for scaffold tests. While that task isn't checked, the scaffold is already wired (Task 3.6) and has no test coverage for its integration logic (prop forwarding, per-passage derived data, scroll save/restore).

---

## ðŸ”µ LOW-3: `lineSpacing` Not Passed to IELTSQuestionsPanel

**Affects:** `MobileReadingExamScaffold.tsx` line 407

**Problem:** `PassageRendererComponent` receives `lineSpacing={lineSpacing}` but `IELTSQuestionsPanel` does not. Per FR-108, mobile uses fixed `1.6` line spacing for "both passage and question-sheet body text." This is a Task 8.5 concern but worth noting for when it's implemented.

---

## Tasks 3.4â€“3.8: Detailed Re-verification After Re-add

### Task 3.4 â€” MobileQuestionSheet âœ… (with note)

**PRD refs:** FR-45, FR-46, FR-57, FR-60  
**Status:** Faithfully implemented.

- âœ… Slide-up/down 250ms ease-out animation
- âœ… Semi-transparent backdrop (z-index 2000, sheet z-index 2001)
- âœ… Close triggers: close button, swipe-down gesture, backdrop tap
- âœ… Near-full viewport height (`calc(100dvh - 48px)`)
- âœ… Body scroll lock with cleanup
- âœ… Escape key close
- âœ… Safe-area bottom padding
- âœ… Does not redirect or navigate
- âš ï¸ Missing from PRD but desirable: `aria-modal="true"` âœ… (already present)

### Task 3.5 â€” Shell Component Tests âœ…

**Status:** All required test cases present in `MobileShellComponents.test.tsx`.

- âœ… Header: timer rendering, passage label, pause state, submitted state, untimed (âˆž), overflow toggle
- âœ… Tabs: correct count, active tab highlight, title fallback, tab click callback
- âœ… FAB: answered/total counts, unanswered badge show/hide, flagged badge show/hide, click callback
- âœ… Sheet: open/close class toggle, close button, backdrop click, children render, custom title, Escape key

### Task 3.6 â€” Scaffold Wiring âœ… (with CRITICAL-2 bug)

**Status:** Structurally correct but has the QuestionNavigator number mismatch (CRITICAL-2).

- âœ… Header â†’ PassageTabs â†’ PassageContent â†’ FAB layout
- âœ… Sheet contains: info bar (label + range + progress) â†’ synced tabs â†’ navigator â†’ question blocks
- âœ… `PassageRendererComponent` receives all display props
- âœ… FAB hidden after submission (`!testSubmitted`)
- âœ… Pure derivation via `useMemo` for passage-scoped counts
- ðŸ”´ QuestionNavigator receives wrong number range for non-first passages (CRITICAL-2)

### Task 3.7 â€” Desktop Element Suppression âœ…

**Status:** Correctly implemented via structural early-return.

- âœ… `TwoColumnLayout`, `InspiraFooterNav`, `PassageControls`, floating arrows all unreachable in mobile branch
- âœ… `ReadingHeader` (live), `TestHeader` (solo/homework) unreachable
- âœ… `highlighterActive={false}` passed in both hosts

### Task 3.8 â€” Host-Owned Mobile Shell State ðŸ”´ (HOOKS VIOLATION)

**Status:** Functionally correct intent, but placement violates Rules of Hooks.

- ðŸ”´ Hooks declared after loading/error early returns (CRITICAL-1)
- âœ… `questionSheetOpen` + open/close callbacks in both hosts
- âœ… `passageScrollByPassage` + scroll callback in both hosts
- âœ… `flaggedQuestions` + toggle callback in both hosts
- âœ… Scroll persistence: save on passage switch, restore via `requestAnimationFrame`
- âœ… `isSubmitting` now uses real value (finding 3.8 fix applied)

---

## Summary: PRD Coverage Status

| Phase | Task Range | Status | Blockers |
|-------|-----------|--------|----------|
| Phase 0 | 1.0â€“1.9 | âœ… Complete | None |
| Phase 1 | 2.0â€“2.8 | âœ… Complete | None |
| Phase 2A | 2A.0â€“2A.5 | âœ… Complete | None |
| Phase 3 | 3.0â€“3.8 | âš ï¸ Needs fixes | CRITICAL-1 (hooks), CRITICAL-2 (navigator), HIGH-1 (FAB label), HIGH-2 (dvh) |
| Phase 4 | 4.0â€“4.7 | ðŸ”¶ Partial (4.1â€“4.5 done) | 4.6, 4.7 pending |
| Phase 5 | 5.0â€“5.7 | âŒ Not started | â€” |
| Phase 6 | 6.0â€“6.9 | âŒ Not started | â€” |
| Phase 7 | 7.0â€“7.6 | âŒ Not started | â€” |
| Phase 8 | 8.0â€“8.7 | âŒ Not started | â€” |
| Phase 9 | 9.0â€“9.11 | âŒ Not started | â€” |

## Recommended Fix Priority

1. **CRITICAL-1** â€” Move hooks above early returns (both hosts) â€” *immediate, prevents crash*
2. **CRITICAL-2** â€” Fix QuestionNavigator number generation for per-passage usage â€” *immediate, navigator is broken*
3. **HIGH-1** â€” Add "Questions" prefix to FAB label â€” *quick fix*
4. **HIGH-2** â€” Fix scaffold `100vh` â†’ `100dvh` â€” *quick fix, prevents real-device overflow*
5. **MEDIUM-1** â€” Pass real `isPaused` in IELTSPracticeView mobile branch â€” *quick fix*
6. **MEDIUM-2** â€” Update `onManualSubmit`/`onAutoSubmit` return types â€” *before Task 5.0*


---

## Task 4.6 - Exact Question-Group Restoration (2026-04-08)

**Finding:** The earlier Task 4.6 implementation only remembered a question number per passage. That covered navigator taps, but it did not fully satisfy the PRD requirement to restore the exact question group after scroll-only movement, passage switching, and sheet close/reopen.

**Resolution:** Task 4.6 is now implemented with a real group-based contract.
- Both hosts own `activeQuestionGroupByPassage` and `questionSheetScrollByPassage`
- `MobileReadingExamScaffold` resolves the first unanswered question group (FR-52), persists the last known visible group per passage, and restores both group anchor and sheet scroll on reopen/switch
- `IELTSQuestionsPanel` reports rendered question-group anchor offsets back to the scaffold so scroll-only movement updates the remembered group
- `src/components/test/readingQuestionGroups.ts` centralizes question grouping and group-anchor lookup logic used by the scaffold path

**Finding:** During verification, passage switching initially saved the incoming passage's group anchor to the outgoing passage because the scaffold relied on the latest rendered active group instead of a per-passage last-known group.

**Resolution:** Added a per-passage `lastKnownQuestionGroupByPassageRef` in the scaffold. The outgoing passage now saves its own remembered group anchor before the incoming passage restores.

**Finding:** Task 4.7 is still not fully complete. Scaffold-level tests now cover the group-restoration flow, but host-level persistence tests for `ReadingTestPage` / `IELTSPracticeView` remain pending.

**Verification:** Focused mobile Reading tests pass: `cmd /c npx vitest run src/components/test/mobile/MobileReadingExamScaffold.test.tsx src/components/test/QuestionNavigator.test.tsx --reporter=basic` (`44` tests total).

---

## Task 4.7 - Host-Level Persistence Coverage (2026-04-08)

**Finding:** Scaffold-level coverage was already strong after Task 4.6, but the remaining fidelity gap was at the host boundary. `ReadingTestPage` and `IELTSPracticeView` still lacked direct tests proving that host-owned mobile Reading state survives question-sheet close/reopen cycles.

**Resolution:** Added host-level mobile test doubles for `MobileReadingExamScaffold` so the tests can drive the real host callbacks and assert the rerendered props.
- `src/__tests__/integration/ReadingTestPage.test.tsx` now verifies live mobile persistence of `flaggedQuestions`, `activeQuestionGroupByPassage`, and `questionSheetScrollByPassage` across sheet open, close, and reopen
- `src/components/practice/IELTSPracticeView.test.tsx` adds equivalent solo/homework host coverage after the mobile start screen handoff
- Existing scaffold coverage remains in `src/components/test/mobile/MobileReadingExamScaffold.test.tsx`, so Task 4.7 now covers both scaffold callback wiring and host-owned state persistence

**Verification:** Focused Question Sheet suite passes: `cmd /c npx vitest run src/__tests__/integration/ReadingTestPage.test.tsx src/components/practice/IELTSPracticeView.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx src/components/test/QuestionNavigator.test.tsx --reporter=basic` (`48` tests total).

---

## Task 5.x - Review Summary and Mobile Submit Flow (2026-04-08)

**Finding:** The mobile Reading shell had no in-test manual submit path. The header overflow trigger existed, but it did not lead anywhere, and mobile still depended on the desktop/browser `window.confirm` flow in live mode.

**Resolution:** Implemented the Phase 5 review-summary slice end to end.
- Added `src/components/test/mobile/MobileReviewSummary.tsx` with passage-grouped counts, question chips, and the required final confirmation modal
- Wired `MobileReadingExamScaffold` to render the review summary from host-owned state, use the current header overflow action as the temporary review-entry trigger, and route chip taps back into the correct passage/question-group flow
- Added `skipConfirm` to `useTestSubmission` and passed mobile-aware `skipConfirm` wiring from both hosts so unanswered-submit confirmation happens in the mobile review summary instead of a second browser prompt
- Kept `useSoloSubmission` on its existing `skipConfirm` contract and completed the host wiring in `IELTSPracticeView`

**Finding:** Review-summary chip taps needed to reopen on the exact tapped question when possible, not just the saved group anchor, otherwise grouped tasks could reopen one question too early.

**Resolution:** The scaffold now derives `effectivePanelQuestionNumber` separately from the persisted group anchor. Navigator state still restores by group, but the embedded question panel prefers the host's exact active question when it belongs to that group.

**Process Note:** All Phase 5 subtasks are implemented and verified, but parent task `5.0` is intentionally left unchecked for now because `documentation/tasks/process-task-list.md` requires a clean stage-and-commit step before marking the parent complete, and this worktree already contains mixed in-progress changes from earlier phases.

**Verification:** Focused Phase 5 suite passes: `cmd /c npx vitest run src/components/test/mobile/MobileReviewSummary.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx src/__tests__/integration/ReadingTestPage.test.tsx src/components/practice/IELTSPracticeView.test.tsx src/hooks/test/useTestSubmission.test.ts src/hooks/solo/useSoloSubmission.test.ts --reporter=basic` (`47` tests total).

---

## Task 6.1-6.5 - Shared Mobile Persistence Contract (2026-04-08)

**Finding:** The Phase 4/5 mobile Reading state existed only in host memory. Live autosave wrote answers only, solo/homework resume still depended on raw localStorage, and there was no shared persisted shape for flags, scroll positions, overlay state, or text size.

**Resolution:** Implemented the shared persistence contract through the hook layer.
- Added SavedMobileState in src/types/practice.types.ts and extended SoloSessionProgress with mobileState?: SavedMobileState
- Extended useTestAutoSave to persist mobileState beside answers to game_sessions//players//mobileState, with a separate >=500ms debounce path for scroll-map writes
- Migrated useSoloAutoSave and useSoloResume from direct browser storage calls to @/core/platform/storage, added storage key enumeration in src/core/platform/storage.ts, and made solo autosave return the same status shape used by live autosave
- Surfaced the current player's saved mobileState from useTestSession so the live host can hydrate from an explicit field instead of inferring from unrelated player data

**Finding:** clearSoloProgress and cleanupExpiredProgress previously depended on synchronous localStorage APIs, which would have blocked the storage abstraction migration and kept mobile portability gaps in place.

**Resolution:** Both helpers now run through the platform storage abstraction. useSoloSubmission awaits clearSoloProgress(...) before finalizing the submit flow so old progress is cleared through the same persistence layer that saved it.

**Finding:** Task 6.9 is only partially covered by this slice. Hook-level tests now cover (a) through (d), but host hydration (e) and autosave-error toast dedupe (f) still belong to the next host-integration step (6.6-6.8).

**Verification:** Focused Phase 6 hook suite passes: cmd /c npx vitest run src/hooks/useTestAutoSave.test.ts src/hooks/solo/useSoloAutoSave.test.ts src/hooks/solo/useSoloResume.test.ts src/hooks/test/useTestSession.test.ts src/hooks/test/useTestSubmission.test.ts src/hooks/solo/useSoloSubmission.test.ts --reporter=basic (18 tests total).

**Correction Note (2026-04-08):** In the Task 6.1-6.5 entry above, the intended live RTDB path template is game_sessions//players//mobileState.
**Correction Note 2 (2026-04-08):** Literal template preserved: `game_sessions/${sessionCode}/players/${studentId}/mobileState`.

---

## Task 6.6-6.9 - Host Hydration, Text Size Fallback, and Autosave Error Surfacing (2026-04-08)

**Finding:** The shared SavedMobileState contract existed in the hook layer, but the host components still behaved like plain in-memory shells. Live mode imported the helper without using it, solo/homework still initialized directly from defaults, and neither host surfaced autosave failures to the student.

**Resolution:** Completed the host-side persistence contract in both ReadingTestPage.tsx and IELTSPracticeView.tsx.
- Added host-owned hydration and serialization around mobileReadingState.ts so the scaffold receives only runtime props, never raw persisted payloads
- Restored laggedQuestions, passage scroll maps, question-sheet scroll maps, overlay open state, active passage, active question-group anchors, and 	extSize from saved mobile state where available
- Added the cross-test text-size fallback via storage.get(...) / storage.set(...) using 
eading_text_size_ so fresh sessions still inherit the last chosen mobile reading size
- Wired host autosave status handling to 	oast.error(...) with a last-message ref so duplicate failures stay quiet until a later successful save resets the guard

**Finding:** Hook-level tests already covered Task 6.9(a)-(d), but there was still no proof that the hosts actually hydrated persisted phone state or that repeated autosave failures would avoid spamming duplicate error toasts.

**Resolution:** Added the missing host integration coverage.
- src/__tests__/integration/ReadingTestPage.test.tsx now verifies live-mode hydration, text-size fallback, and autosave error-toast dedupe
- src/components/practice/IELTSPracticeView.test.tsx now verifies resumed/fresh solo mobile hydration, text-size fallback, and autosave error-toast dedupe
- The existing hook tests continue to cover 6.9(a)-(d), so Task 6.9 is now complete end to end

**Process Note:** Subtasks 6.6 through 6.9 are complete and verified. Parent task 6.0 remains intentionally unchecked because documentation/tasks/process-task-list.md requires the stage-and-commit sequence before marking a parent complete, and the worktree still contains mixed in-progress changes from later phases.

**Verification:** Focused Phase 6 suite passes: cmd /c npx vitest run src/hooks/useTestAutoSave.test.ts src/hooks/solo/useSoloAutoSave.test.ts src/hooks/solo/useSoloResume.test.ts src/hooks/test/useTestSession.test.ts src/__tests__/integration/ReadingTestPage.test.tsx src/components/practice/IELTSPracticeView.test.tsx --reporter=basic (15 tests total).

**Correction Note 3 (2026-04-08):** In the Task 6.6-6.9 entry above, the intended literal identifiers are `flaggedQuestions`, `textSize`, `reading_text_size_${studentId}`, and `toast.error(...)`. Those tokens were partially mangled by PowerShell interpolation during the append step; the implementation and tests use the literal forms shown here.

---

## Task 7.1-7.4 - Overlay Layering, Auto-Submit Shutdown, Back-Button Close, and Homework Fullscreen Exception (2026-04-08)

**Finding:** Phase 5 and 6 left the mobile Reading shell functionally usable, but the overlay stack was still defined by scattered hard-coded `zIndex` values, the scaffold had no explicit auto-submit shutdown path of its own, and host-owned overlays could stay open through pause/time-up states because no host effect closed them.

**Resolution:** Completed the Phase 7 interaction and layering pass.
- Added `src/components/test/mobile/mobileReadingLayering.ts` as the shared source of truth for mobile Reading layer values and root CSS custom properties
- Updated `MobileReadingExamScaffold`, `MobileQuestionSheet.css`, `MobileReadingHeader.tsx`, `MobileQuestionsFab.tsx`, and `MobileReviewSummary.tsx` to use the shared layering contract for FAB, sheet backdrop, sheet, review summary, and final confirm modal stacking
- Added the scaffold-side `timeRemaining <= 0 && !testSubmitted` effect so the scaffold closes the question sheet and review summary before calling `onAutoSubmit()`
- Added host-side close-on-interruption effects so `questionSheetOpen` and `reviewSummaryOpen` are forced shut when time-up, submission, or pause/interruption overlays take over

**Finding:** Browser back handling was still missing even though overlay state is owned by `ReadingTestPage.tsx` and `IELTSPracticeView.tsx`. Without host-level `popstate` handling, mobile users could not dismiss stacked overlays with the native/browser back affordance.

**Resolution:** Implemented host-level back-button integration in both mobile Reading hosts.
- `questionSheetOpen` and `reviewSummaryOpen` now push history entries when they transition open
- Each host listens for `popstate` and closes exactly one layer at a time, restoring the question sheet when backing out of the review summary and then closing the sheet on the next back action
- Push suppression refs prevent the sheet from immediately creating a fresh history entry when it is being restored as part of that review-summary unwind path

**Finding:** Homework mobile mode still attempted fullscreen enforcement even though PRD-0043 explicitly exempts phone Reading homework from fullscreen.

**Resolution:** `IELTSPracticeView.tsx` now passes `enabled: false` to `useFullscreenMode` for mobile homework while preserving the existing homework fullscreen path for non-mobile contexts.

**Process Note:** Subtasks `7.1` through `7.4` are complete and verified. Parent task `7.0` remains intentionally unchecked because `documentation/tasks/process-task-list.md` requires the stage-and-commit sequence before marking the parent complete, and this worktree still contains mixed in-progress changes from later phases.

**Verification:** Focused Phase 7 suite passes: `cmd /c npx vitest run src/components/test/mobile/MobileReadingExamScaffold.test.tsx src/__tests__/integration/ReadingTestPage.test.tsx src/components/practice/IELTSPracticeView.test.tsx --reporter=basic` (`41` tests total).

---

## Task 8.1-8.7 - Overflow Menu, Text Size, Instructions Modal, and Fixed Mobile Line Spacing (2026-04-08)

**Finding:** Phase 8 required more than just three new mobile components. The overflow/menu workflow also had to stay consistent with the host-owned shell contract, the observability rule for user-facing actions, and the earlier persistence work that already centralized mobile Reading state in the two hosts.

**Resolution:** Completed the Phase 8 UI and host wiring slice end to end.
- Added `MobileOverflowMenu`, `MobileTextSizeControl`, and `MobileInstructionsModal` as presentational mobile overlays, plus focused tests for each and for the shared `mobileInstructionsContent.ts` copy source
- Updated `MobileReadingExamScaffold` to compose the overflow menu, text-size control, and instructions modal entirely from host-owned state/callbacks; the header overflow button now opens the menu instead of jumping straight to review
- Both mobile hosts now own `overflowMenuOpen`, `textSizeControlOpen`, and `instructionsOpen`, wire those states through the scaffold, and route `Leave test` back into the existing host leave/back flow
- Mobile Reading now uses fixed `lineSpacing={1.6}` in both hosts, while text-size changes live-preview through both the passage renderer and the embedded questions panel without resizing tabs, navigator chips, or action buttons
- `PassageRenderer` now guards its internal `localStorage` font-size write when an external `fontSize` prop is supplied, preventing a second persistence source from shadowing the host-owned mobile text size
- To satisfy the observability rule for new mobile actions, both hosts now use `useFeatureTracking(FEATURE_IDS.testTaking)` and `featureRegistry.ts` now lists the new mobile test-taking actions (`openOverflowMenu`, `openTextSizeControl`, `adjustTextSize`, `openInstructions`, `leaveTest`, etc.)

**Finding:** The earlier clarification note called out the mobile header zero-time bug as a small follow-up. Phase 8 touched the header test surface anyway.

**Resolution:** Folded that fix into this slice by treating only non-finite timers as untimed; a timed test at `timeRemaining === 0` now renders `0:00` instead of the untimed state.

**Process Note:** Subtasks `8.1` through `8.7` are complete and verified. Parent task `8.0` remains intentionally unchecked because `documentation/tasks/process-task-list.md` requires the stage-and-commit sequence before marking the parent complete, and this worktree still contains mixed in-progress changes from later phases.

**Verification:** Focused Phase 8 suite passes: `cmd /c npx vitest run src/components/test/mobile/MobileOverflowMenu.test.tsx src/components/test/mobile/MobileTextSizeControl.test.tsx src/components/test/mobile/mobileInstructionsContent.test.ts src/components/test/mobile/MobileInstructionsModal.test.tsx src/components/test/mobile/MobileReadingHeader.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx src/__tests__/integration/ReadingTestPage.test.tsx src/components/practice/IELTSPracticeView.test.tsx src/skills/reading/components/PassageRenderer.test.tsx --reporter=basic` (`69` tests total).

## Task 9.2 - Desktop Safety Verification (2026-04-08)

- Verified live Reading desktop at http://127.0.0.1:4173/student-test/MH1PVH: ReadingHeader markers were present (IELTS Reading, Test taker ID:), PassageControls markers were present (Font:, Line:), footer navigation markers were present (Part 1, Part 2), floating arrow buttons rendered, and no mobile scaffold DOM was present.
- Verified self-study IELTS Reading desktop at http://127.0.0.1:4173/student/practice/test-1773107132297-p018jkl: TestHeader markers were present (Solo Practice, Submit Test), the standard two-column desktop content rendered (passage + questions together), footer navigation markers were present (Part 1, Part 2, Part 3), PassageControls rendered, and no mobile scaffold DOM was present.
- Manual browser evidence for a separate IELTS homework desktop run was limited by the current seeded student data, but the shared IELTSPracticeView desktop host path was exercised through the self-study route and remains covered by the existing homework-oriented host tests added earlier in PRD-0043.

## Task 9.3 - Mobile Device Classification Verification (2026-04-08)

- Verified mobile classification on the solo IELTS Reading route under Chrome device emulation without using the QA override. Emulation used an iPhone-class mobile user agent plus a 390x844 mobile touch viewport.
- On http://127.0.0.1:4173/student/practice/test-1773107132297-p018jkl, the mobile scaffold rendered as expected: compact mobile header (More options trigger + passage label), mobile passage tabs, and the mobile questions FAB/question-sheet flow.
- The desktop Reading shell was absent in the same run: no ReadingHeader / TestHeader, no PassageControls, no InspiraFooterNav, and no floating arrow buttons were present.
- During the follow-up passage-switch QA, the Chrome DevTools transport closed mid-session before the full 9.4 manual pass could be completed. As a result, 9.4 remains open. To reduce risk while continuing, MobileReadingExamScaffold.test.tsx was strengthened to assert outgoing passage scroll capture and restored passage/sheet scroll values during passage switches.

## Task 9.4 - Mobile Passage Switching QA (2026-04-08)

- Initial real-app scripted QA exposed a fidelity bug: when switching passages with the question sheet open, returning to passage 1 restored the wrong main passage scroll offset even though the header label, active tabs, and sheet content updated correctly.
- `MobileReadingExamScaffold.tsx` now saves the outgoing passage state before tab-driven passage changes and reapplies restored passage scroll after layout settles, so passage-local scroll memory survives sheet-open passage switching.
- Verified on the real mobile Reading route with local scripted Playwright QA: the header passage label updates, the page-level and sheet-level passage tabs stay in sync, the question sheet remains open, the sheet swaps to the new passage question range, and passage scroll restores per passage (`720` for passage 1, `260` for passage 2).
- Focused regression coverage was strengthened in `MobileReadingExamScaffold.test.tsx` to assert outgoing passage scroll capture before a tab-driven passage switch.

**Verification:** `cmd /c npx vitest run src/components/test/mobile/MobileReadingExamScaffold.test.tsx --reporter=basic` (`29` tests total).

## Task 9.5 - Mobile Question Sheet QA (2026-04-08)

- Verified the core mobile question-sheet flow on the real self-study Reading route under mobile emulation with the QA mobile override enabled.
- The FAB opened the sheet correctly, the sheet rendered the collapsible navigator plus embedded question groups and answer controls, and selecting a real radio option updated the live answered summary from `0/13 answered` to `1/13 answered`.
- Flagging worked end to end: tapping the first embedded `Flag question ... for review` control changed it to `Unflag question 8` and added `flag-dot-8` in the navigator.
- Passage scroll was preserved when closing the sheet (`mobile-passage-content.scrollTop` stayed `520` after close), and reopening restored the same question-group context plus sheet scroll (`sheetScrollTop: 1000`, visible group `Questions 8-13`).
- All required close paths were exercised successfully: close button, swipe-down gesture, backdrop tap, and browser back all closed the sheet without navigating away from the test route.

**Verification:** Local scripted Playwright QA against `http://127.0.0.1:4173/student/practice/test-1773107132297-p018jkl` under a 390x844 mobile viewport.

## Task 9.6 - Mobile Review and Submit QA (2026-04-08)

- Verified the overflow-to-review submission flow on the real self-study Reading route under mobile emulation with the QA mobile override enabled.
- The overflow menu exposed all five expected actions, and choosing `Submit test` opened the review summary with passage-grouped counts for all three passages.
- Cross-passage review chips worked: tapping `review-chip-14` closed the review summary, switched the active passage to `Gifted children and learning`, and opened the question sheet with the expected `Q14-Q26` sheet info state.
- Returning to review and submitting opened the final confirmation modal with the unanswered warning (`You have 40 unanswered questions...`), and confirming the submit completed successfully.
- Solo post-submit navigation matched the implementation contract in `useSoloSubmission.ts`: the flow redirected to `http://127.0.0.1:4173/student/academic-record`.

**Verification:** Local scripted Playwright QA against `http://127.0.0.1:4173/student/practice/test-1773107132297-p018jkl` under a 390x844 mobile viewport.

## Task 9.7 - Mobile Interruptions, Back Stack, and Overlay QA (2026-04-08)

- Real mobile-browser QA now covers the sheet/review interruption stack on the self-study Reading route under mobile emulation with the QA mobile override enabled.
- Verified in the browser that: (b) back with the sheet open closes only the sheet and stays on the test route, (c) back with review open now closes review without incorrectly reopening the sheet when review was opened directly, (d) back with no overlay open triggers the browser leave-protection dialog and keeps the test route active when dismissed, and (e) rotating the viewport while the sheet is open preserves the open sheet state and scroll position (`sheetScrollTop` stayed around `706`).
- That browser pass exposed a real host-state bug before the fix: both mobile hosts always reopened the question sheet on `popstate` from review, even when review had not been opened on top of the sheet. Fixed in `IELTSPracticeView.tsx` and `ReadingTestPage.tsx` by persisting whether review was opened from an existing sheet and restoring the sheet only in that case.
- Added focused host regressions for the new back-stack contract in `IELTSPracticeView.test.tsx` and `ReadingTestPage.test.tsx`, plus explicit mobile overlay markers to verify the waiting overlay, connection-loss indicator, and time-up overlay render in the mobile host branches.
- For `9.7(a)` and the overlay portions of `9.7(f)`, targeted regression tests were used alongside the browser QA: `MobileReadingExamScaffold.test.tsx` verifies that time expiry closes host-owned mobile overlays and calls `onAutoSubmit()` once, while the host integration suites verify the mobile time-up/waiting/connection interruption surfaces render in the live and solo hosts.

**Verification:**
- Local scripted Playwright QA on `http://127.0.0.1:4173/student/practice/test-1773107132297-p018jkl` under a 390x844 mobile viewport
- `cmd /c npx vitest run src/components/test/mobile/MobileReadingExamScaffold.test.tsx src/components/practice/IELTSPracticeView.test.tsx src/__tests__/integration/ReadingTestPage.test.tsx --reporter=basic` (`54` tests total)


## Task 9.8 - Mobile Resume QA (2026-04-08)

- Completed the remaining mobile resume verification across all three Reading contexts.
- Solo mode had already been verified earlier in the session against the self-study route: reopening the browser restored the saved passage, question-sheet state, scroll positions, flagged question state, and text size through the existing mobile resume flow.
- Live mode is now verified in Chrome DevTools MCP on `http://127.0.0.1:4173/student-test/MH1PVH`: after forcing mobile mode, setting passage scroll to `620`, sheet scroll to `460`, and text size to `22px`, a reload restored the active passage (`Why some women cross the finish line ahead of men`), the open question sheet, both scroll positions, and the persisted text size.
- Homework mode is now verified on a real seeded homework assignment and real in-progress submission, not a fake route-state payload. The QA pass confirmed that the mobile Reading homework route resumes directly into the saved scaffold state without surfacing the generic `Start New` path or the mobile start screen, and restores the saved passage (`Gifted children and learning`), the open question sheet, the flagged/answered `Q14` state, and the saved scroll positions.
- The real homework browser pass exposed two implementation bugs that blocked faithful QA until fixed: `StudentHomeworkDetailPage.tsx` passed `studentName: undefined` into `useHomeworkSubmission`, which caused Firestore to reject `createSubmission(...)`, and `StudentPracticePage.tsx` threw away homework `timerMinutes`/`maxAttempts` from `location.state`, which made the resumed homework route render as untimed (`?`) even when the homework launch contract specified `60` minutes.
- Resolved both blockers in this slice: homework launch now falls back to `user.email` / `'Student'` when `displayName` is empty, and homework practice settings now preserve `timerMinutes` and `maxAttempts` from the launch state. After the fix, the real resumed homework route rendered the expected running timer (`59:54`) instead of the untimed state.

**Verification:**
- Chrome DevTools MCP live QA on `http://127.0.0.1:4173/student-test/MH1PVH`
- Chrome DevTools MCP homework QA on `http://127.0.0.1:4173/student/homework/a883G44sgZ7NR4dmbWeb` -> `http://127.0.0.1:4173/student/practice/test-1773107132297-p018jkl`
- `cmd /c npx vitest run src/pages/StudentPracticePage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/components/practice/IELTSPracticeView.test.tsx --reporter=basic` (`15` tests total)


## Task 9.9 - Mobile Autosave and Toast QA (2026-04-08)

- Real mobile-browser QA on a fresh live Reading session exposed a fidelity bug before the failure checks even began: mobile autosave answer writes could be starved indefinitely because `useTestAutoSave` depended on raw `mobileState` object identity, so equivalent host rerenders kept recreating the debounce/interval callbacks and prevented the 2-second answer save from firing.
- Resolved that bug in `src/hooks/useTestAutoSave.ts` by reading the persisted mobile shell snapshot through a ref and making the save callbacks depend on the serialized mobile-state strings instead of the raw object identity. Added a focused regression in `src/hooks/useTestAutoSave.test.ts` for equivalent mobile-state rerenders.
- Re-verified healthy autosave in Chrome DevTools MCP on the fresh live route `http://127.0.0.1:4173/student-test/X6399R`: after answering `Q5` in the mobile sheet, the player RTDB node at `game_sessions/X6399R/players/x3hDfjYVN7cJtSbwq0ChIjl1Bk62` persisted `answers.5.answer = 'G'` after the debounce window, and no toast was shown.
- The raw offline transport path does not surface the host autosave error toast in the real browser. Instead, the mobile live shell shows the existing connection-loss surfaces (`Connection Lost`, `Your answers are being saved locally`). Because of that, the toast-specific half of Task 9.9 was verified through an in-page host-state injection pass rather than a transport disconnect: mutating the shared `toast.error` object and the live host's autosave-status hooks in Chrome DevTools confirmed (a) the first autosave error emits one toast call, (b) repeated failures in the same burst do not emit duplicates, and (c) a later `saved` status resets the guard so the same error can emit again.

**Verification:** `cmd /c npx vitest run src/hooks/useTestAutoSave.test.ts src/__tests__/integration/ReadingTestPage.test.tsx src/components/practice/IELTSPracticeView.test.tsx --reporter=basic` (`29` tests total), plus Chrome DevTools MCP on `http://127.0.0.1:4173/student-test/X6399R`.

## Task 9.10 - Mobile Overflow, Text Size, Instructions, and Leave QA (2026-04-08)

- Verified the live mobile Reading overflow menu in Chrome DevTools MCP on http://127.0.0.1:4173/student-test/X6399R: all five actions were present (Text size, Review answers, Submit test, Instructions / Help, Leave test).
- The first browser pass exposed a real text-size fidelity gap before this task could be closed: the modal correctly showed 22px, but matching-style question text still rendered at the default size because the specialized matching inputs were not consuming the embedded mobile preview font-size props. Resolved by threading ontSize / lineSpacing through IELTSQuestionsPanel.tsx into MatchingInformationInput.tsx, MatchingFeaturesInput.tsx, and DragDropMatchingInput.tsx, and by adding focused regression coverage in MatchingInformationInput.test.tsx.
- Re-verified in the live browser after the fix: passage text rendered at 22px, matching question text rendered at 22px, and the non-preview surfaces stayed fixed (13px tabs, 15px answer chips/buttons). The instructions modal also matched the shared live-mode content from mobileInstructionsContent.ts exactly, including the five live rules and four controls-help bullets.
- The same QA pass exposed a second live-host gap: selecting Leave test from the overflow menu while the question sheet was open only consumed the sheet's synthetic history entry instead of reaching the guarded page-leave path. Fixed in ReadingTestPage.tsx by skipping overlay history entries before navigating back, and added a focused integration regression in ReadingTestPage.test.tsx for the sheet-open leave flow.
- Final browser verification confirmed that Leave test now triggers the browser eforeunload leave-protection prompt even from the sheet-open path.

**Verification:** cmd /c npx vitest run src/components/test/MatchingInformationInput.test.tsx src/__tests__/integration/ReadingTestPage.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx --reporter=basic (47 tests total), plus Chrome DevTools MCP on http://127.0.0.1:4173/student-test/X6399R.

## Task 9.11 - PRD Section 10 Edge-Case Crosscheck (2026-04-08)

- Crosschecked all 21 edge cases from Section 10 of 043-prd-mobile-ielts-reading-test-taking-interface.md against the implemented code plus the accumulated regression/browser evidence from Tasks 9.4 through 9.10. No new unhandled gap was found in this documentation pass.
- Cases 1, 2, 5, 18: handled by the shared scaffold's per-passage scroll/question-group memory and synced dual-tab contract, with browser verification in Task 9.4 and regression coverage in MobileReadingExamScaffold.test.tsx.
- Cases 3, 4, 20: handled by the host popstate layering contract, with browser verification in Task 9.7 and host regression coverage in ReadingTestPage.test.tsx / IELTSPracticeView.test.tsx.
- Cases 6, 7: handled by the review-summary-first submit flow and final confirmation warning path, with browser verification in Task 9.6.
- Cases 8, 9, 22: handled by the mobile overlay force-close contract on timeout/interruption/submission, with regression coverage in MobileReadingExamScaffold.test.tsx, ReadingTestPage.test.tsx, and IELTSPracticeView.test.tsx.
- Cases 10, 11: handled by live mobile interruption UI plus deduped autosave error handling, with browser/test evidence in Tasks 9.7 and 9.9.
- Cases 12, 17: handled by the homework auto-resume/fullscreen-exemption path, with browser verification in Task 9.8 and host regression coverage in IELTSPracticeView.test.tsx.
- Case 13: handled by host-owned persisted mobile state (active passage, sheet/review state, scroll memory, flags, text size), with browser verification in Tasks 9.7 and 9.8 and supporting host/scaffold tests.
- Case 14: handled by truncating tab chrome plus fixed-size chips/buttons; browser verification in Task 9.10 confirmed large text resizes only passage/question body text.
- Case 15: handled by keeping the canonical passage renderer contract while hiding the highlighter UI on mobile; no mobile-only highlight storage fork was introduced.
- Case 16: handled by the shared useMobileExamMode() classifier fail-safe behavior and its QA override, verified earlier in the implementation/testing phases.
- Case 19: handled by the shared z-index contract in mobileReadingLayering.ts, the overflow/menu integration tests, and the live browser verification in Task 9.10.
- Case 21: handled by keeping the new fields under the nested mobileState autosave payload, with hook coverage added in the Phase 6 test suite.
- Because process-task-list.md requires stage-and-commit completion before parent tasks can be checked, this crosscheck closes subtask 9.11 only. Parent rows 5.0 through 9.0 remain intentionally unchecked in the tasklist despite all their subtasks now being complete.

## Task 9.10-9.11 Correction Note (2026-04-08)

- Correction only: the immediately preceding Task 9.10 / 9.11 findings entries contain shell-escaping artifacts in a few inline literals. Treat this note as the clean superseding text for those two entries.
- Clean Task 9.10 summary: the live mobile overflow menu on `http://127.0.0.1:4173/student-test/X6399R` exposed all five required actions; the first QA pass exposed a real text-size gap in the specialized matching inputs, which was fixed by passing mobile preview `fontSize` / `lineSpacing` through `IELTSQuestionsPanel.tsx` into `MatchingInformationInput.tsx`, `MatchingFeaturesInput.tsx`, and `DragDropMatchingInput.tsx`; the final browser pass confirmed `22px` passage/question body text while tabs and chips stayed fixed; and `Leave test` now reaches the guarded `beforeunload` path even when launched from the sheet-open state.
- Clean Task 9.11 summary: all 21 Section 10 edge cases are handled. Cases 1, 2, 5, 18 are covered by passage/sheet memory and synced dual tabs; 3, 4, 20 by `popstate` layer handling; 6, 7 by the review-summary/manual-submit flow; 8, 9, 21 by force-close and payload-shape contracts; 10, 11 by interruption UI plus deduped autosave error handling; 12, 17 by homework auto-resume/fullscreen exemption; 13 by persisted mobile state; 14 by truncating/fixed chrome plus mobile text-size QA; 15 by preserving the canonical renderer/highlight contract; 16 by fail-safe mobile classification; and 19 by the overflow z-index/review-opening contract.
- Process note: subtask `9.11` is complete, but parent rows `5.0` through `9.0` remain unchecked intentionally until the stage-and-commit protocol in `process-task-list.md` is performed.

## Post-Phase Mobile Detector Note (2026-04-08)

- A real-user report after the PRD-0043 rollout showed one remaining classifier blind spot: launching an IELTS Reading test from the student Library tab on a phone could still fall back to the desktop two-column layout when the browser exposed a widened desktop-style viewport.
- The Library route itself was not the problem. Browser reproduction confirmed `StudentLibraryPage.tsx -> StudentPracticePage.tsx -> IELTSPracticeView.tsx` still routed correctly, and normal phone UA emulation already rendered the mobile scaffold.
- The issue was the final fallback in `useMobileExamMode.ts`: it only recognized `(a)` phone UA strings or `(b)` `isMobile && pointer: coarse`, so a touch-only non-hover phone session with a widened viewport could still classify as desktop.
- Resolved by hardening `useMobileExamMode.ts` with a touch-only, no-hover desktop-site fallback: when the session has a coarse pointer, no hover-capable pointer, and either a phone-sized physical screen or a phone-like widened viewport envelope, it now returns `true` for mobile exam mode.
- Added focused regression coverage in `useMobileExamMode.test.ts` for the widened desktop-site-on-phone case and a tablet-sized negative control.
- Chrome DevTools MCP re-verification on the student Library flow confirmed the fix: under a widened `980x844` touch-only desktop-UA emulation, reopening `IELTS Reading Test - March 2026` from `/student/library` now lands in the mobile Reading scaffold instead of the desktop two-column layout.

**Verification:** `cmd /c npx vitest run src/core/platform/hooks/useMobileExamMode.test.ts --reporter=basic` (`10/10` passing), plus Chrome DevTools MCP on `http://127.0.0.1:4173/student/library` and `/student/practice/test-1773107132297-p018jkl`.

## Post-Phase Mobile Matching Headings Redesign (2026-04-08)

- User feedback exposed a remaining mobile usability gap after the main PRD-0043 rollout: the phone Reading sheet still reused the desktop drag-and-drop matching-headings surface, which was too cramped and gesture-heavy on small screens.
- Resolved by adding `src/components/test/MobileMatchingHeadingsInput.tsx` and routing `IELTSQuestionsPanel.tsx` to it only when the matching-headings group is rendered in `embedded` mode. Desktop/tablet still keep the existing `DragDropMatchingInput` layout.
- The new mobile design uses stacked paragraph cards, a native heading picker per card, a collapsible headings reference list, selected-heading preview blocks, and duplicate-option disabling so students can work by tap/select instead of drag-and-drop.
- Also corrected the help copy contract in `IELTSQuestionsPanel.tsx`: matching-headings help is now mobile-specific in the embedded sheet and desktop-specific in the drag-and-drop layout.
- Added focused regressions in `MobileMatchingHeadingsInput.test.tsx` and `IELTSQuestionsPanel.test.tsx` to prove the mobile branch renders the select-card UI while desktop still renders the drag targets.

**Verification:** `cmd /c npx vitest run src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.test.tsx --reporter=basic` (`5/5` passing), plus `cmd /c npm run check:utf8 -- src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.tsx src/components/test/IELTSQuestionsPanel.test.tsx`.

## Post-Phase Mobile Matching Headings Overflow Follow-up (2026-04-08)

- A follow-up user report found that the first mobile matching-headings redesign still allowed long heading labels to overflow inside the field on narrow phones.
- Resolved by replacing the per-question field in `src/components/test/MobileMatchingHeadingsInput.tsx` with a wrapping button trigger plus an in-card option list, instead of relying on native select chrome to compress long text.
- Added explicit `overflowWrap: 'anywhere'` guards for long heading-reference rows, question prompts, option rows, and selected-heading previews so narrow-width wrapping stays stable.
- Updated `src/components/test/IELTSQuestionsPanel.test.tsx` to assert the embedded/mobile button contract rather than the old combobox contract.

**Verification:** `cmd /c npx vitest run src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.test.tsx --reporter=basic` (`5/5` passing), plus `cmd /c npm run check:utf8 -- src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.tsx src/components/test/IELTSQuestionsPanel.test.tsx`.

## Post-Phase Mobile Matching Headings Modal Follow-up (2026-04-08)

- Another follow-up on the mobile matching-headings redesign: the field should open a focused modal picker per paragraph, not expand the options inline beneath the card.
- Resolved in `src/components/test/MobileMatchingHeadingsInput.tsx` by moving the option list into a dedicated `role="dialog"` overlay that opens from the paragraph field, keeps the paragraph prompt visible, and closes after selection or dismissal.
- The paragraph cards still show the selected-heading preview and keep the external Clear action, but the heading choices now stay inside the modal layer instead of pushing the sheet content longer.
- Updated the component test suite to assert the new modal-open contract and selection flow.

**Verification:** `cmd /c npx vitest run src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.test.tsx --reporter=basic` (`5/5` passing), plus `cmd /c npm run check:utf8 -- src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.tsx src/components/test/IELTSQuestionsPanel.test.tsx`.
## Post-Phase Mobile Header and Sheet Chrome Follow-up (2026-04-08)

- User feedback on the near-final mobile Reading shell showed four remaining phone-specific friction points: the centered passage title consumed prime header space, the tab row was still too verbose, the `Questions x/y` FAB label was noisy, and the question sheet repeated too much chrome above the navigator.
- Resolved by promoting Submit into the centered mobile header action in `src/components/test/mobile/MobileReadingHeader.tsx` and removing the redundant submit entry from the overflow menu wiring in `src/components/test/mobile/MobileReadingExamScaffold.tsx`.
- Shortened the mobile passage tab row in `src/components/test/mobile/MobilePassageTabs.tsx` so it now renders `Passage 1`, `Passage 2`, and `Passage 3` regardless of the underlying passage titles.
- Simplified the mobile question-sheet launcher in `src/components/test/mobile/MobileQuestionsFab.tsx` to the plain `Questions` label while preserving the flagged and unanswered badges.
- Removed the extra question-sheet header/info chrome by adding `showHeader={false}` support to `src/components/test/mobile/MobileQuestionSheet.tsx` and using a compact-only navigator row in `src/components/test/QuestionNavigator.tsx`; the mobile sheet now keeps only the small horizontal pill bar and tapping a pill still jumps to that question.
- Added focused regression coverage for the new header-submit contract, the single tab row, the headerless question sheet, and the compact-only navigator behavior.

**Verification:** `cmd /c npx vitest run src/components/test/mobile/MobileReadingHeader.test.tsx src/components/test/mobile/MobilePassageTabs.test.tsx src/components/test/mobile/MobileQuestionsFab.test.tsx src/components/test/mobile/MobileQuestionSheet.test.tsx src/components/test/mobile/MobileOverflowMenu.test.tsx src/components/test/QuestionNavigator.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx --reporter=basic` (`83/83` passing), plus `cmd /c npm run check:utf8 -- src/components/test/mobile/MobileReadingHeader.tsx src/components/test/mobile/MobilePassageTabs.tsx src/components/test/mobile/MobileQuestionsFab.tsx src/components/test/mobile/MobileQuestionSheet.tsx src/components/test/QuestionNavigator.tsx src/components/test/mobile/MobileReadingExamScaffold.tsx src/skills/reading/components/ReadingTestPage.tsx src/components/practice/IELTSPracticeView.tsx src/components/test/mobile/MobileReadingHeader.test.tsx src/components/test/mobile/MobilePassageTabs.test.tsx src/components/test/mobile/MobileQuestionsFab.test.tsx src/components/test/mobile/MobileQuestionSheet.test.tsx src/components/test/mobile/MobileOverflowMenu.test.tsx src/components/test/QuestionNavigator.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx`.
## Post-Phase Question Pill Jump Precision Follow-up (2026-04-08)

- A follow-up user report found that tapping a question-number pill in the mobile sheet still did not always land on the exact intended question.
- The root cause was not the pill row itself. Several grouped Reading renderers only exposed a shared group/container ref, so the embedded panel could scroll to a rough group location instead of the actual question row/card/blank.
- Resolved in `src/components/test/IELTSQuestionsPanel.tsx` by switching grouped mobile scroll targeting to exact per-question anchors. `MatchingFeaturesInput.tsx`, `MatchingInformationInput.tsx`, `MobileMatchingHeadingsInput.tsx`, and `DragDropMatchingInput.tsx` now report exact question elements back to the panel, and the summary-completion-list renderer now anchors each inline blank to its own question number.
- Added focused regressions proving the embedded panel scrolls to the exact matching-headings card and that grouped matching-information / mobile matching-headings renderers register exact per-question anchors.

**Verification:** `cmd /c npx vitest run src/components/test/IELTSQuestionsPanel.test.tsx src/components/test/MatchingInformationInput.test.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx --reporter=basic` (`42/42` passing), plus `cmd /c npm run check:utf8 -- src/components/test/IELTSQuestionsPanel.tsx src/components/test/MatchingFeaturesInput.tsx src/components/test/MatchingInformationInput.tsx src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/DragDropMatchingInput.tsx src/components/test/IELTSQuestionsPanel.test.tsx src/components/test/MatchingInformationInput.test.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx`.
## Post-Phase Mobile Matching Headings Selected-State Cleanup (2026-04-08)

- A follow-up user report found that after choosing a heading on mobile, the same selected heading was being shown twice within a single question card.
- The duplication came from `src/components/test/MobileMatchingHeadingsInput.tsx`: the selected heading already appeared inside the main field button, and the card also rendered a second selected-heading preview block beneath it.
- Resolved by removing the redundant preview block and keeping the chosen heading only in the main field button, while preserving the existing selected-state border and Clear action.
- Added a focused regression proving the selected heading text appears only once inside the question card.

**Verification:** `cmd /c npx vitest run src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.test.tsx --reporter=basic` (`8/8` passing), plus `cmd /c npm run check:utf8 -- src/components/test/MobileMatchingHeadingsInput.tsx src/components/test/MobileMatchingHeadingsInput.test.tsx src/components/test/IELTSQuestionsPanel.tsx src/components/test/IELTSQuestionsPanel.test.tsx`.

## 2026-04-08 - Post-Phase Mobile Flagging Removal Follow-up

- Product decision: removed mobile Reading `flagged` state end-to-end because it added noise without meaningful student value on the phone surface.
- Runtime cleanup completed in both mobile Reading hosts, the shared scaffold, the embedded Reading panel, the review summary, and the FAB; new mobile Reading state no longer serializes `flaggedQuestions`.
- Backward compatibility is preserved: `SavedMobileState.flaggedQuestions` is now legacy-optional and helper hydration ignores old flagged payloads instead of restoring them.
- Focused verification passed: `cmd /c npx vitest run src/components/test/mobile/MobileQuestionsFab.test.tsx src/components/test/mobile/MobileReviewSummary.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx src/__tests__/integration/ReadingTestPage.test.tsx src/components/practice/IELTSPracticeView.test.tsx src/hooks/useTestAutoSave.test.ts src/hooks/solo/useSoloAutoSave.test.ts src/hooks/solo/useSoloResume.test.ts src/hooks/test/useTestSession.test.ts --reporter=basic` (`76/76`), plus `cmd /c npx vitest run src/components/test/mobile/mobileReadingState.test.ts --reporter=basic` (`2/2`).
- UTF-8 checks passed for all touched code/test files.

## 2026-04-08 - Post-Phase Mobile Pill Color Normalization

- Scope limited to mobile surfaces only. Desktop/grid `QuestionNavigator` styling was intentionally left unchanged.
- Mobile compact question pills now use a blue current-state ring over the existing answered/unanswered fill instead of a fully filled blue current chip.
- Mobile review-summary unanswered chips and counts now use a neutral slate treatment instead of the earlier amber/orange warning palette.
- Focused verification passed: `cmd /c npx vitest run src/components/test/QuestionNavigator.test.tsx src/components/test/mobile/MobileReviewSummary.test.tsx src/components/test/mobile/MobileReadingExamScaffold.test.tsx --reporter=basic` (`55/55`), plus targeted UTF-8 checks on the touched files.

---

## 2026-04-09 - Release Closeout Documentation Sync

- Synchronized the root architecture set with the released PRD-0043 state. `mobile-ielts-reading-test-taking-architecture.md` now records the final shell chrome contract (centered Submit, short `Passage N` labels, compact-only pill navigator), the dedicated mobile matching-headings picker, exact per-question anchor requirements, and the widened-phone classifier guardrail.
- Added homework-specific launch-integrity guidance to `homework-solo-practice-architecture.md` so mobile homework Reading keeps non-empty `studentName`, `timerMinutes`, and `maxAttempts` intact across the route handoff into the shared practice host.
- Added a standalone student test-delivery note to `student-experience-architecture.md` so shell pages and standalone Reading routes keep a clear boundary.
- Amended `assessment-0043-code-audit-report.md` so the viewport note covers all remaining mobile `100vh` support surfaces and the auto-submit telemetry note covers both hosts.
- Sanitized this findings file to remove stray control-byte artifacts so it remains searchable and safe to diff.
