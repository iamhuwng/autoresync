# PRD-0043 Mobile IELTS Reading Test-Taking Interface — Code-Level Audit Report

**Date:** 2026-04-09  
**Scope:** Rigorous file-by-file audit of all PRD-0043 implementation artifacts against the original PRD, task list, and findings document.  
**Action:** Report only — no code changes.

---

## Executive Summary

The mobile IELTS Reading test-taking interface is **substantially complete and architecturally sound**. All critical and high-priority findings from the findings document have been resolved in the codebase. The pure-presentation scaffold pattern, host-owned state, no-Mantine ban, and platform storage abstraction are faithfully implemented. The core scaffold uses the intended `100vh` plus `100dvh` viewport pattern, but a few supporting mobile full-screen states still retain `100vh`-only styles. The implementation covers all three modes (live, solo, homework) across both host components.

However, the audit surfaced **1 medium bug**, **3 low-priority discrepancies**, and **4 improvement opportunities** that deserve attention.

---

## 1. Verified Resolutions (All Previously Logged Issues)

| Finding ID | Description | Verdict |
|------------|-------------|---------|
| **CRITICAL-1** | Hooks called conditionally (React Rules of Hooks) | **FIXED** — All `useState`/`useCallback` for mobile shell state are declared unconditionally before conditional returns in both `IELTSPracticeView.tsx` (lines 472-601) and `ReadingTestPage.tsx` (lines 470-582). |
| **CRITICAL-2** | QuestionNavigator `startNumber` for per-passage numbering | **FIXED** — `QuestionNavigator` accepts `startNumber` (default 1), and `questionNumbers` is built from `startNumber + index`. |
| **HIGH-1** | FAB missing "Questions" label | **FIXED** — `MobileQuestionsFab` renders `<span>Questions</span>` with unanswered badge. |
| **HIGH-2** | `100dvh` without fallback | **FIXED** — Scaffold root uses `height: '100dvh'` in inline style plus `<style>` tag that sets `height: 100vh; height: 100dvh;` for CSS cascade fallback. |
| **MEDIUM-1** | `isPaused` not wired to scaffold | **FIXED** — Both hosts pass `isPaused` prop from `useSoloTimer`/live session state. |
| **MEDIUM-2** | Submit callbacks must return `Promise<void>` | **FIXED** — `onManualSubmit` and `onAutoSubmit` typed as `() => void | Promise<void>`. Review summary uses `void onConfirmSubmit()` correctly. |
| **MEDIUM-3** | Scroll debounce too low for persistence | **FIXED** — Scaffold uses `SCROLL_DEBOUNCE_MS = 150` for UI responsiveness; autosave hooks use separate ≥500ms cadence for persistence. |

---

## 2. New Findings from Code-Level Audit

### 2.1 [MEDIUM] Solo/Homework `handleLeaveTest` Doesn't Clean History Stack

**File:** `src/components/practice/IELTSPracticeView.tsx:585-593`

The solo/homework host's `handleLeaveTest` simply calls `handleBack()` (which uses `navigateTo()`), but does **not** pop the `pushState` entries for open question sheet and review summary overlays.

In contrast, the live host (`ReadingTestPage.tsx:565-578`) correctly calculates `leaveHistoryDelta` accounting for each open overlay's history entry and calls `window.history.go(-leaveHistoryDelta)`.

**Impact:** If a student leaves a solo/homework test while the question sheet or review summary is open, orphaned history entries remain. If the user later presses the browser back button from the destination, they may encounter empty/broken history frames.

**Recommendation:** Port the live host's `leaveHistoryDelta` logic into `IELTSPracticeView`'s `handleLeaveTest`, OR call `window.history.go(-delta)` followed by `handleBack()` in a `setTimeout` to allow the history to settle.

---

### 2.2 [LOW] `PassageRenderer` Still Has Internal `localStorage` Fallback

**File:** `src/skills/reading/components/PassageRenderer.tsx:73-92`

When no `externalFontSize` prop is provided (i.e., desktop mode), `PassageRenderer` reads/writes raw `localStorage.getItem('passage_font_size')`. The guard `if (externalFontSize === undefined)` correctly prevents the mobile scaffold from triggering this path, so the mobile contract is unbroken.

However, this is the last holdout of raw `localStorage` usage in the reading flow. The PRD and architecture docs call for migrating off raw `localStorage` to the platform `storage` abstraction.

**Impact:** None on mobile. Desktop reading practice uses raw `localStorage` for font size.

**Recommendation:** Migrate the desktop path's font-size persistence to `storage.get/set` in a follow-up.

---

### 2.3 [LOW] `MobileOverflowMenu` z-index Exceeds Declared Layer

**File:** `src/components/test/mobile/MobileOverflowMenu.tsx:28`

The menu panel uses `zIndex: MOBILE_READING_LAYER_Z_INDEX.OVERFLOW_MENU + 1` (4001), but the layering constant file only defines `OVERFLOW_MENU: 4000`. The `+1` creates an off-registry z-index value.

**Impact:** Functionally correct (menu floats above its own backdrop), but violates the declared single-source-of-truth z-index registry.

**Recommendation:** Add `OVERFLOW_MENU_PANEL: 4001` to `mobileReadingLayering.ts` and reference it explicitly.

---

### 2.4 [LOW] `SavedMobileState.textSize` is Optional; `HydratedMobileReadingState.textSize` is Required

**File:** `src/types/practice.types.ts:82` vs `src/components/test/mobile/mobileReadingState.ts:10`

`SavedMobileState.textSize` is `number | undefined` (optional), while `HydratedMobileReadingState.textSize` is `number` (required). The hydration function (`hydrateMobileReadingState`) correctly fills the gap with `fallbackTextSize`, so there's no runtime bug.

**Impact:** None at runtime. Type asymmetry is intentional but could confuse future contributors.

**Recommendation:** Add a JSDoc on `SavedMobileState.textSize` noting that hydration always provides a fallback.

---

## 3. Improvement Opportunities

### 3.1 Deduplication: Pause Overlay Rendered Twice in IELTSPracticeView

**File:** `src/components/practice/IELTSPracticeView.tsx:917-935` (mobile path) and `:1031-1048` (desktop path)

The pause overlay is copy-pasted identically in both the mobile and desktop render branches. This violates DRY.

**Recommendation:** Extract a `<PauseOverlay isPaused={isPaused} onResume={togglePause} testSubmitted={testSubmitted} />` component and render it in both branches.

---

### 3.2 `MobileReviewSummary` Confirm Dialog Always Shows Unanswered Count

**File:** `src/components/test/mobile/MobileReviewSummary.tsx:291`

The confirm dialog always says _"You have X unanswered questions."_ even when `totalUnansweredCount === 0`. In that case the copy should be _"All questions answered. Are you sure you want to submit?"_.

**Recommendation:** Conditional copy based on `totalUnansweredCount`.

---

### 3.3 Several Mobile Full-Screen States Still Use `100vh`

**Files:** `src/components/test/mobile/MobileStartScreen.tsx:46`, `src/skills/reading/components/ReadingTestPage.tsx:811-830`, `src/components/practice/IELTSPracticeView.tsx:835-849`

The start screen container still uses `height: '100vh'` without the `100dvh` fallback pattern used by the scaffold. The same issue remains in both mobile hosts' loading and error states, which also render full-height `100vh` containers. On mobile Safari, the URL bar can make these screens slightly taller than the visible viewport.

**Recommendation:** Apply the same `100vh` + `100dvh` fallback pattern from the scaffold to the start screen and the mobile loading/error states in both hosts.

---

### 3.4 Feature Tracking Consistency: `handleAutoSubmit` Hard-Codes 'mobile' in Both Hosts

**Files:** `src/skills/reading/components/ReadingTestPage.tsx:461-467`, `src/components/practice/IELTSPracticeView.tsx:426-432`

Both hosts' `handleAutoSubmit` callbacks always pass `surface: 'mobile'` even though the functions are declared unconditionally and can be reused outside the mobile scaffold path.

**Impact:** Minor telemetry inaccuracy if either desktop path ever routes through these handlers.

**Recommendation:** Use `surface: isMobileExamMode ? 'mobile' : 'standard'` in both hosts for correctness.

---

## 4. Architecture Compliance Checklist

| Requirement | Status |
|-------------|--------|
| **Pure presentation scaffold** (no internal state/hooks for business logic) | PASS |
| **Host-owned state** in ReadingTestPage and IELTSPracticeView | PASS |
| **No `@mantine` imports** in any mobile file | PASS (verified via grep) |
| **Platform `storage` abstraction** instead of raw localStorage | PASS (mobile paths) |
| **`100dvh` with `100vh` fallback** on scaffold | PASS |
| **`SavedMobileState` in `practice.types.ts`** | PASS |
| **Solo autosave integrates `mobileState`** | PASS |
| **Live autosave integrates `mobileState`** | PASS |
| **`skipConfirm` for mobile submission** | PASS |
| **Homework fullscreen disabled on mobile** | PASS |
| **Browser back-button/popstate integration** | PASS (both hosts) |
| **History stack cleanup on leave** | PASS (live) / **FAIL** (solo — see 2.1) |
| **Shared `mobileInstructionsContent.ts`** | PASS |
| **z-index hierarchy via `mobileReadingLayering.ts`** | PASS (with minor off-registry noted in 2.3) |
| **Overlay dismissal on pause/submit/time-up** | PASS |
| **Scroll and question-group memory per passage** | PASS |
| **Text size control persisted per student** | PASS |
| **Mobile start screen for all three modes** | PASS |
| **Auto-skip start screen on resume** | PASS |
| **Feature tracking via `useFeatureTracking`** | PASS |
| **Flagging removed (product decision)** | PASS — prop commented out, `SavedMobileState` keeps legacy optional field |

---

## 5. Summary & Prioritized Action Items

| Priority | Item | Effort |
|----------|------|--------|
| **MEDIUM** | Fix solo `handleLeaveTest` history stack cleanup (Section 2.1) | ~15 min |
| **LOW** | Add `OVERFLOW_MENU_PANEL` to z-index registry (Section 2.3) | ~5 min |
| **LOW** | Apply `100dvh` fallback to all remaining mobile full-screen states (Section 3.3) | ~10 min |
| **LOW** | MobileReviewSummary conditional confirm copy (Section 3.2) | ~5 min |
| **LOW** | Extract shared PauseOverlay component (Section 3.1) | ~15 min |
| **LOW** | PassageRenderer desktop localStorage migration (Section 2.2) | ~20 min |
| **LOW** | Correct handleAutoSubmit surface tracking in both hosts (Section 3.4) | ~5 min |
| **LOW** | JSDoc on `SavedMobileState.textSize` optionality (Section 2.4) | ~2 min |

**Overall verdict:** The implementation is close to production-ready, with one medium-priority bug (solo history cleanup) that should be fixed before the next release. The remaining items are mostly polish and consistency work, but the viewport issue is broader than the original summary suggested.

