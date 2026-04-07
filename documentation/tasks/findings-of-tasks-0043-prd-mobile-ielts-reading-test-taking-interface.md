# Findings: PRD-0043 Mobile IELTS Reading Test-Taking Interface

## Task 2.4 — ReadingTestPage Mobile Branch

**Finding:** `activePassageId` in `ReadingTestPage` is typed `string | null`, but the scaffold props require `string`. Applied `|| ''` fallback to satisfy TypeScript while preserving fail-safe behavior — the scaffold will receive an empty string rather than null when no passage is active (edge case during initial load).

## Task 2.5 — IELTSPracticeView Mobile Branch

**Finding:** `timeRemaining` can be `Infinity` for untimed solo/homework sessions. The scaffold's `timeRemaining` prop is typed `number`, which technically includes `Infinity`. The mobile scaffold will need to handle this in Phase 3 by checking `isFinite()` and hiding the timer display when time is unbounded.

## Task 2.6 — Scaffold Props Interface

**Finding:** The `PassageRendererComponent` and `answers` props initially used `unknown` types for maximum safety, but this created TypeScript incompatibilities with the host components' concrete types (`PassageRendererProps`, `Record<number, string | string[] | Record<string, string>>`). Resolved by using `any` (with ESLint suppression comments) for these cross-boundary props, since the scaffold is a pure presentation layer that passes them through without inspection.

**Finding (pre-existing):** `totalEvents` is declared but never read in `IELTSPracticeView.tsx` (line 213). This is a pre-existing unused variable unrelated to our changes.

## Task 3.2 — MobilePassageTabs scrollTo guard

**Finding:** jsdom does not implement `Element.scrollTo()`, causing test crashes. Added a `typeof container.scrollTo === 'function'` guard with an `else` branch that falls back to direct `container.scrollLeft` assignment. This is safe for production since all real mobile browsers implement `scrollTo`, and the fallback provides identical non-animated behavior for any edge cases.

## Task 3.4 — MobileQuestionSheet body scroll lock

**Finding:** The sheet uses `document.body.style.overflow = 'hidden'` to lock scroll when open. This is a direct DOM mutation (Rule 19 trigger) but is acceptable here because: (a) this component is explicitly mobile-only and lives in the `test/mobile/` directory, (b) both Capacitor WebView and mobile Safari need body scroll lock to prevent background scroll-through, (c) the cleanup function in `useEffect` restores the previous overflow value, making it non-destructive.

## Task 3.6 — Scaffold wiring

**Finding:** The scaffold computes per-passage derived data (answered count, question range, flagged count) from host-provided `questions` and `answers` props using `useMemo`. This is pure derivation, not state ownership, which is permitted under the pure-presentation constraint. The `handleOverflowMenuToggle` callback is a no-op placeholder pending Phase 8 (overflow menu).

## Task 3.7 — Desktop element suppression

**Finding:** Task 3.7 is structurally enforced by the `if (isMobileExamMode) { return ...; }` early-return pattern in both `ReadingTestPage` and `IELTSPracticeView`. All desktop-only elements (`TwoColumnLayout`, `InspiraFooterNav`, `PassageControls`, floating ←/→ arrows, `ReadingHeader`, `TestHeader`) render only in the code path below the mobile return. `highlighterActive={false}` is already passed in both hosts. No code changes were needed.

## Task 3.8 — Host-owned mobile shell state

**Finding (foundational fix):** `ReadingTestPage` had `isSubmitting={false}` hardcoded in the scaffold props. `useTestSubmission` returns `isSubmitting` but it was not destructured. Fixed by adding `isSubmitting` to the destructured return and passing the real value to the scaffold.

**Finding:** Both hosts now declare `questionSheetOpen` and `passageScrollByPassage` state at the component level (outside the `if (isMobileExamMode)` guard). This ensures React hook ordering is deterministic regardless of the conditional render path. The scroll persistence logic (save on passage switch, restore via `requestAnimationFrame`) lives in the scaffold since it owns the DOM ref for the passage content scroller, while the host owns the state map.

