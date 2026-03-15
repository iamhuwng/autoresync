# Tasks: PRD-0036 — Anti-Cheating & Test Integrity System

> Generated from [`0036-prd-anti-cheating-system.md`](./0036-prd-anti-cheating-system.md)
> **Audit v2** — All 20 issues from the audit assessment have been resolved.

## Task Dependencies

> **MUST follow this order.** A task cannot be started until all its dependencies are complete.

| Task | Dependencies | Reason |
|------|-------------|--------|
| 1.0 | — | Foundation types & presets — no dependencies |
| 2.0 | 1.0 | Hook consumes `AntiCheatConfig`, `IntegrityEvent`, `IntegrityReport` types |
| 3.0 | 1.0 | Hooks consume `IntegrityEvent` type from 1.0 |
| 4.0 | 1.0 | Modal uses `AntiCheatConfig`, `resolvePreset`, `getContextDefaults` |
| 5.0 | 1.0 | Section uses `AntiCheatConfig`, `resolvePreset`, `getContextDefaults` |
| 6.0 | 2.0, 3.0 | Integration requires the completed hooks from 2.0 and 3.0 |
| 7.0 | 1.0 | Badge uses `computeRiskLevel`; action buttons write to RTDB independently |
| 8.0 | 7.1 | Detail panel reuses `IntegrityBadge` created in 7.1 |
| 9.0 | — | Independent of anti-cheat; can be done in parallel with anything |
| 10.0 | — | Independent utilities; can be done in parallel with anything |

## Relevant Files

### New Files to Create
- `src/types/integrity.types.ts` — AntiCheatConfig, IntegrityEvent, IntegrityReport, HomeworkIntegrity, AntiCheatPreset (FR-23, FR-24, FR-41)
- `src/utils/antiCheatPresets.ts` — Preset definitions (None/Standard/Strict), `resolvePreset()`, `getContextDefaults()`, `computeRiskLevel()` (FR-24, FR-42)
- `src/hooks/test/useTestIntegrity.ts` — Core detection hook: event listeners, grace period calculator, warning manager, batched RTDB writer, sessionStorage crash recovery (FR-1 through FR-14)
- `src/hooks/test/useAntiCopyPaste.ts` — Copy/paste prevention hook: event handlers for copy, cut, paste, contextmenu, keyboard shortcuts + CSS injection (FR-15 through FR-17)
- `src/hooks/test/useFullscreenMode.ts` — Fullscreen API wrapper hook: request fullscreen, monitor exits, graceful degradation on mobile (FR-18 through FR-20)
- `src/components/test/SessionStartConfigModal.tsx` — Modal shown when teacher clicks "Start": preset picker, customizable toggles, confirm button (FR-25 through FR-28)
- `src/components/test/SessionStartConfigModal.css` — Styles for the session start config modal
- `src/components/test/IntegrityBadge.tsx` — Reusable badge component: green/amber/red indicators with count (FR-33)
- `src/components/test/IntegrityDetailPanel.tsx` — Expandable panel showing full integrity report: counts, timeline, risk level (FR-39)
- `src/components/test/IntegrityDetailPanel.css` — Styles for the integrity detail panel
- `src/components/homework/AntiCheatConfigSection.tsx` — Collapsed expandable section for homework modal: preset picker, individual toggles, nullify toggle (FR-29 through FR-31)
- `src/components/homework/AntiCheatConfigSection.css` — Styles for the anti-cheat config section

### Existing Files to Modify
- `src/hooks/monitor/useMonitorControls.ts` — Modify `startTest()` function (line 102) to accept and write `AntiCheatConfig` to RTDB (FR-25, FR-27)
- `src/components/test/TeacherTestControlBar.tsx` — Change "Start Test" button to open SessionStartConfigModal, change `onStartTest` prop type to accept config (FR-25)
- `src/components/test/StudentProgressCard.tsx` — Add integrity badge prop and rendering, add force-submit/reset action buttons (FR-33, FR-35)
- `src/components/thcs-grading/THCSStudentProgressCard.tsx` — Add integrity badge prop and rendering (FR-33)
- `src/components/writing-monitor/WritingMonitorCard.tsx` — Add integrity badge prop and rendering (FR-33)
- `src/pages/TeacherTestMonitorPage.tsx` — Pass integrity data to student cards, add "Refresh Logs" button, wire force-submit/reset handlers (FR-34 through FR-37)
- `src/pages/StudentTestPage.tsx` — Integrate useTestIntegrity hook, wrap content with anti-copy container (FR-1)
- `src/components/practice/THCSPracticeView.tsx` — Integrate useTestIntegrity hook (homework context only), add useBeforeUnloadWarning (FR-1, FR-48)
- `src/pages/StudentQuizPageNew.jsx` — Integrate useTestIntegrity hook, add useBeforeUnloadWarning (FR-1, FR-48)
- `src/components/homework/HomeworkCreateModal.tsx` — Add AntiCheatConfigSection to config step (FR-29)
- `src/hooks/test/useTestSubmission.ts` — Flush integrity events on submission, include integrity data in results (FR-4)
- `src/services/homeworkSubmissionService.ts` — Store integrity data on homework submission documents (FR-41)
- `src/hooks/test/useTestCompletionCheck.ts` — Extend to support THCS homework re-entry prevention (FR-49)
- `src/utils/thcsShuffle.ts` — Create `shuffleArray<T>` wrapper using existing `fisherYatesShuffle` + `seedrandom` (FR-50)
- `src/types/homework.types.ts` — Add `antiCheatConfig` field to `HomeworkAssignment` interface and `HomeworkConfig` interface (FR-31)
- `src/pages/TeacherTestResultsPage.tsx` — Add IntegrityBadge + IntegrityDetailPanel for session results (FR-38, FR-39)
- `src/pages/TeacherHomeworkDetailPage.tsx` — Add IntegrityBadge + IntegrityDetailPanel for homework results (FR-38, FR-39)

### Notes

- **Vitest only** — run tests with `npx vitest run [optional/path]`. Do NOT use Jest.
- **Firebase Spark plan** — no Cloud Functions. All logic runs client-side.
- **NO Mantine** — use vanilla CSS and custom `modern` components (Rule 15). Zero `@mantine/*` imports.
- **RTDB pattern** — use `import { ref, update } from 'firebase/database'` and `import { database } from '../../services/firebase'`. Example: `useMonitorControls.ts` line 12-14, 109.
- **Navigation pattern** — use `useNavigation()` from `../hooks/useNavigation`, NOT `useNavigate()` from react-router-dom (Rule 1).
- **Toast system** — use the existing `toast` singleton from `src/components/modern/ToastNotification.tsx`. API: `toast.warning('message')`, `toast.info('message')`, etc. Do NOT create a new toast system.
- **useEffect cleanup** — every `useEffect` that attaches event listeners MUST return a cleanup function that removes them. This prevents memory leaks and duplicate listeners.
- **Error handling** — all RTDB/Firestore writes MUST be wrapped in try/catch with console.error logging. Never let a silent failure crash the test.
- Integrity data for sessions goes to RTDB (`game_sessions/{sessionCode}/players/{playerId}/integrity/`).
- Integrity data for homework goes to Firestore (on the `HomeworkSubmission` document, NOT to RTDB).
- For homework context, the hook does NOT do interval RTDB writes. It only buffers events in memory + sessionStorage. The Firestore write happens once at submission time (Task 6.5).

---

## Tasks

- [x] 1.0 Create AntiCheatConfig type system and preset engine
  - [x] 1.1 Create `src/types/integrity.types.ts` with the following types. Copy these exactly:
    - `AntiCheatPreset` = `'none' | 'standard' | 'strict'` union type
    - `AntiCheatConfig` interface per FR-23: `{ preset: AntiCheatPreset, detectTabSwitch: boolean, detectCopyPaste: boolean, detectRightClick: boolean, detectFullscreenExit: boolean, detectKeyboardShortcuts: boolean, enableStudentWarnings: boolean, enableAutoSubmit: boolean, autoSubmitThreshold: number, requireFullscreen: boolean, shuffleQuestions: boolean, shuffleOptions: boolean, nullifyRemainingAttempts: boolean }`
    - `IntegrityEventType` = `'tab_switch' | 'window_blur' | 'fullscreen_exit' | 'copy_attempt' | 'paste_attempt' | 'right_click' | 'keyboard_shortcut' | 'devtools_resize' | 'time_per_question' | 'page_reload' | 'fullscreen_unavailable'` union type
    - `IntegrityEvent` interface: `{ type: IntegrityEventType, timestamp: number, durationMs?: number, withinGrace: boolean, counted: boolean, details?: string }`
    - `IntegrityReport` interface per FR-41: `{ violationCount: number, totalEvents: number, tabSwitchCount: number, totalTimeAwayMs: number, copyAttempts: number, pasteAttempts: number, rightClickAttempts: number, fullscreenExitCount: number, keyboardShortcutAttempts: number, forceSubmitted: boolean, forceSubmittedBy: 'system' | 'teacher' | null, riskLevel: 'low' | 'medium' | 'high', events: IntegrityEvent[] }`
    - `HomeworkIntegrity` interface (Firestore version — same fields as `IntegrityReport` but without the full `events` array; instead stores `eventCount: number` and `eventSummary: string` to reduce Firestore document size)
    - Export all types
  - [x] 1.2 Create `src/utils/antiCheatPresets.ts`. Import `AntiCheatConfig`, `AntiCheatPreset` from `../types/integrity.types`. Define:
    - `PRESET_DEFAULTS` constant: a `Record<AntiCheatPreset, AntiCheatConfig>` mapping each preset to its full config values per the FR-24 table in the PRD. Use these exact values: None = all false/0. Standard = `detectTabSwitch: true, detectCopyPaste: true, detectRightClick: true, detectFullscreenExit: false, detectKeyboardShortcuts: true, enableStudentWarnings: true, enableAutoSubmit: true, autoSubmitThreshold: 5, requireFullscreen: false, shuffleQuestions: true, shuffleOptions: true, nullifyRemainingAttempts: false`. Strict = same as Standard but `detectFullscreenExit: true, autoSubmitThreshold: 3, requireFullscreen: true`.
    - `resolvePreset(preset: AntiCheatPreset): AntiCheatConfig` — returns a deep copy of the preset defaults.
    - `getContextDefaults(context: 'session' | 'homework' | 'solo'): Partial<AntiCheatConfig>` — returns overrides per FR-21 table: session = `{ enableStudentWarnings: false, enableAutoSubmit: false }`; solo = `{ detectTabSwitch: false, detectCopyPaste: false, detectRightClick: false, detectFullscreenExit: false, detectKeyboardShortcuts: false, enableStudentWarnings: false, enableAutoSubmit: false, requireFullscreen: false, shuffleQuestions: false, shuffleOptions: false }`; homework = `{}` (use preset defaults as-is).
    - `computeRiskLevel(violationCount: number, forceSubmitted: boolean): 'low' | 'medium' | 'high'` per FR-42: low = 0 violations AND not force-submitted; medium = 1-2 violations AND not force-submitted; high = 3+ violations OR any force-submit event.
  - [x] 1.3 Add `antiCheatConfig?: AntiCheatConfig` optional field to TWO places in `src/types/homework.types.ts`:
    - In the `HomeworkConfig` interface (line 112), add: `antiCheatConfig?: import('./integrity.types').AntiCheatConfig;`
    - In the `HomeworkAssignment` interface (line 179), add: `antiCheatConfig?: import('./integrity.types').AntiCheatConfig;` at the end of the Configuration section (~line 214). This is the top-level field that will be read by the student client.
    - Both fields are optional so existing homework documents without anti-cheat config continue to work.
  - [x] 1.4 Write unit tests `src/utils/antiCheatPresets.test.ts` using Vitest. Test: `resolvePreset('standard')` returns expected config, `resolvePreset('none')` has all detection flags false, `getContextDefaults('session')` disables warnings and auto-submit, `getContextDefaults('solo')` disables everything, `computeRiskLevel(0, false)` = 'low', `computeRiskLevel(2, false)` = 'medium', `computeRiskLevel(3, false)` = 'high', `computeRiskLevel(0, true)` = 'high'.

- [x] 2.0 Build the `useTestIntegrity` detection hook (core engine)
  - [x] 2.1 Create `src/hooks/test/useTestIntegrity.ts`. The hook accepts a single config object:
    ```typescript
    interface UseTestIntegrityOptions {
      config: AntiCheatConfig | null;
      context: 'session' | 'homework' | 'solo';
      sessionCode?: string;  // Required for session context (RTDB writes)
      studentId: string;
      testId: string;
    }
    ```
    If `config` is null OR `context` is `'solo'`, the hook MUST return a no-op state: `{ violationCount: 0, totalEvents: 0, warningLevel: 'none' as const, warningMessage: '', shouldAutoSubmit: false, flushEvents: async () => {}, getIntegrityReport: () => emptyReport, addEvent: () => {} }`. No listeners are attached, no intervals are created.
  - [x] 2.2 Implement `visibilitychange` listener: use `document.addEventListener('visibilitychange', handler)`. When `document.visibilityState === 'hidden'`, record `hiddenAtRef.current = Date.now()`. When `document.visibilityState === 'visible'`, calculate `durationMs = Date.now() - hiddenAtRef.current`. Create an `IntegrityEvent` with `type: 'tab_switch'` and `durationMs`. Pass the event through the grace period calculator (task 2.4) to set `withinGrace` and `counted`. Add the event to the buffer (task 2.5). Only attach this listener if `config.detectTabSwitch` is true. MUST return cleanup: `document.removeEventListener('visibilitychange', handler)`.
  - [x] 2.3 Implement `window.blur`/`focus` listeners using `window.addEventListener('blur', blurHandler)` and `window.addEventListener('focus', focusHandler)`. Same duration tracking pattern as 2.2 but log with `type: 'window_blur'`. Only attach if `config.detectTabSwitch` is true. MUST return cleanup for both listeners.
  - [x] 2.4 Implement grace period calculator (FR-6 through FR-10). Maintain a `switchCountRef = useRef(0)` counter for total tab switches + window blurs. For each tab_switch or window_blur event, increment `switchCountRef.current`, then determine:
    - `isShortDuration = durationMs < 5000` (5 seconds)
    - `isFreeSwitchLeft = switchCountRef.current <= 2`
    - `withinGrace = isShortDuration || isFreeSwitchLeft`
    - `counted = !withinGrace` (only counted if duration ≥ 5s AND switchCount > 2)
    - ALL events MUST be logged regardless of grace status. Grace only affects `counted` and warning triggers.
  - [x] 2.5 Implement in-memory event buffer using `useRef<IntegrityEvent[]>([])`. Also maintain `violationCountRef = useRef(0)` that only counts events where `counted === true`. Expose an `addEvent(event: IntegrityEvent)` internal function that: (a) pushes to buffer, (b) if `counted`, increments `violationCountRef`, (c) mirrors to sessionStorage (task 2.6), (d) triggers warning evaluation (task 2.8).
  - [x] 2.6 Implement `sessionStorage` crash-recovery mirror (FR-3, FR-5, FR-46):
    - On hook mount (in a `useEffect`), set `sessionStorage.setItem('test_in_progress', testId)` to mark that a test is active.
    - On hook unmount, remove it: `sessionStorage.removeItem('test_in_progress')`.
    - On every `addEvent` call, serialize the full event buffer to `sessionStorage.setItem(\`integrity_events_${testId}\`, JSON.stringify(eventsRef.current))`.
    - On hook mount, check for existing events: if `sessionStorage.getItem(\`integrity_events_${testId}\`)` returns data AND `sessionStorage.getItem('test_in_progress') === testId`, this indicates a crash/reload. Load the existing events into the buffer. Add a new `{ type: 'page_reload', timestamp: Date.now(), withinGrace: true, counted: false }` event. Check `performance.navigation?.type === 1` (reload) as an additional signal — if `performance.navigation` is not available (deprecated), fall back to the sessionStorage flag alone.
    - On successful submission (in `flushEvents`), clear: `sessionStorage.removeItem(\`integrity_events_${testId}\`)` and `sessionStorage.removeItem('test_in_progress')`.
  - [x] 2.7 Implement batched RTDB writer (FR-4). This ONLY applies when `context === 'session'` and `sessionCode` is provided:
    - Use `setInterval` at **5-minute intervals** (300000ms). Store the interval ID in a `useRef`.
    - On each tick, call an internal `writeBatchToRTDB()` function that:
      1. Imports `{ ref, update } from 'firebase/database'` and `{ database } from '../../services/firebase'` (use the same import pattern as `useMonitorControls.ts` lines 12-14).
      2. Computes the current `IntegrityReport` from the event buffer (aggregate counts from events array).
      3. Writes the full report (without the events array for the batch — events are only written on final flush) to `ref(database, \`game_sessions/${sessionCode}/players/${studentId}/integrity\`)` using `update()`.
      4. On success, log to console: `'[Integrity] Batched write success'`.
      5. On error (catch block), log: `console.error('[Integrity] Batched write failed:', error)` — do NOT throw or show UI errors. The next batch will include the data.
    - On `flushEvents()` (called at submission time), write the FULL report INCLUDING the `events` array to RTDB. Then clear sessionStorage.
    - For `context === 'homework'`: NO interval writes. The hook only buffers events in memory + sessionStorage. The Firestore write happens at submission time in the consuming component (Task 6.5), by calling `getIntegrityReport()` and passing the result to `homeworkSubmissionService`.
    - MUST clear the interval on unmount: `clearInterval(intervalIdRef.current)`.
  - [x] 2.8 Implement warning manager (FR-11 through FR-13). Only active if `config.enableStudentWarnings === true`. Maintain a `warningLevel` state:
    - `'none'`: `violationCount === 0`
    - `'toast'`: `1 <= violationCount < (config.autoSubmitThreshold - 1)`. Message: `"Please stay on this page to complete your work."`
    - `'escalated'`: `violationCount === (config.autoSubmitThreshold - 1)`. Message: `"You have left this page multiple times. Continuing may affect your submission."`
    - `'final'`: `violationCount >= config.autoSubmitThreshold`. Message: `"Your submission is about to be finalized. Click 'Continue Test' to keep working, or your current answers will be submitted."`
    - For `toast` and `escalated` levels: the consuming component calls `toast.warning(warningMessage)` from `src/components/modern/ToastNotification.tsx` (import `{ toast }` from that file). See ToastNotification.tsx lines 149-168 for the API.
    - For `final` level: the consuming component renders a blocking modal (custom `<div>` overlay, NOT a Mantine modal). The modal has two buttons: "Continue Test" (dismisses modal, resets `warningLevel` to `'escalated'`) and no second button — if they dismiss, the auto-submit triggers on the next violation.
    - Return `{ warningLevel, warningMessage, onDismissWarning: () => void }` from the hook where `onDismissWarning` resets `warningLevel` one step back.
  - [x] 2.9 Implement auto-submit trigger: if `config.enableAutoSubmit === true` AND `violationCountRef.current >= config.autoSubmitThreshold`, set `shouldAutoSubmitRef.current = true` and update a state to trigger re-render. The consuming component checks `shouldAutoSubmit` and calls its own submission logic, setting `forceSubmitted: true, forceSubmittedBy: 'system'` in the integrity report before flushing.
  - [x] 2.10 Implement `devtools_resize` detection (FR-1): listen for `window.addEventListener('resize')`. Use a heuristic: if the window width changes by MORE than 200px in a single resize event while height stays similar (±50px), log as `type: 'devtools_resize'` with `withinGrace: true, counted: false`. This is a soft indicator logged for teacher review, never a violation. Only attach if `config.detectKeyboardShortcuts` is true (bundled with the shortcut detection flag). MUST return cleanup.
  - [x] 2.11 Implement `time_per_question` tracking (FR-1): expose a `trackQuestionTime(questionIndex: number)` function from the hook. The consuming component calls this when the student navigates to a new question. Internally, maintain `currentQuestionRef = useRef({ index: number, startedAt: number })`. When `trackQuestionTime` is called, if there's a previous question tracked, log an event `{ type: 'time_per_question', timestamp: Date.now(), durationMs: elapsed, withinGrace: true, counted: false, details: \`Q${previousIndex}\` }`. This is for post-analysis only — never triggers warnings or violations.
  - [x] 2.12 Define the complete return type and implement the final export:
    ```typescript
    interface UseTestIntegrityResult {
      violationCount: number;
      totalEvents: number;
      warningLevel: 'none' | 'toast' | 'escalated' | 'final';
      warningMessage: string;
      shouldAutoSubmit: boolean;
      flushEvents: () => Promise<void>;
      getIntegrityReport: () => IntegrityReport;
      addEvent: (event: IntegrityEvent) => void; // For external event sources (copy/paste, fullscreen hooks)
      trackQuestionTime: (questionIndex: number) => void;
    }
    ```
    The `getIntegrityReport()` method computes and returns the current summary from the event buffer. The `addEvent()` method allows external hooks (useAntiCopyPaste, useFullscreenMode) to inject events into the shared buffer.
  - [x] 2.13 Write unit tests `src/hooks/test/useTestIntegrity.test.ts` using Vitest. Test: (a) no-op when config is null, (b) no-op when context is 'solo', (c) grace period correctly ignores first 2 switches, (d) grace period correctly ignores switches < 5s, (e) violationCount increments only for counted events, (f) warning levels map correctly to thresholds. Mock `firebase/database` and `sessionStorage`.

- [x] 3.0 Integrate copy/paste prevention and fullscreen mode
  - [x] 3.1 Create `src/hooks/test/useAntiCopyPaste.ts`. The hook accepts:
    ```typescript
    interface UseAntiCopyPasteOptions {
      enabled: boolean; // Maps to config.detectCopyPaste — both detects AND prevents
      containerRef: React.RefObject<HTMLElement>;
      allowEditorPaste?: boolean; // Set to true for IELTS Writing editor (FR-16)
      onEvent: (event: IntegrityEvent) => void; // Calls useTestIntegrity's addEvent
    }
    ```
    When `enabled === true`, attach event listeners to `containerRef.current`:
    - `copy` event: `e.preventDefault()`, call `onEvent({ type: 'copy_attempt', timestamp: Date.now(), withinGrace: false, counted: true })`
    - `cut` event: same as copy but type `'copy_attempt'` (FR-15 groups copy and cut)
    - `paste` event: `e.preventDefault()`, call `onEvent({ type: 'paste_attempt', ... })`. EXCEPTION: if `allowEditorPaste === true` AND `e.target` is inside an element with `data-allow-paste` attribute, do NOT prevent default (FR-16).
    - `contextmenu` event: `e.preventDefault()`, call `onEvent({ type: 'right_click', ... })`. Only attach if the consuming component passes `detectRightClick: true` as a separate prop or if enabled is true (use a separate `detectRightClick` prop).
    - All listeners MUST be added with `{ passive: false }` to allow `preventDefault()`.
    - MUST return cleanup that removes all listeners.
  - [x] 3.2 Add keyboard shortcut detection inside `useAntiCopyPaste`. Listen for `keydown` on the container for: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Shift+I, F12, Ctrl+U (view source). For each match: `e.preventDefault()`, log as `type: 'keyboard_shortcut'` with `details` field containing the key combo (e.g., `"Ctrl+C"`, `"F12"`). Only attach this listener if a `detectKeyboardShortcuts` prop is true.
  - [x] 3.3 Apply `user-select: none` CSS to the container element when copy/paste prevention is enabled. Implementation:
    - In a `useEffect`, when `enabled` changes to `true`, add class `'anti-select'` to `containerRef.current`. On cleanup or when `enabled` changes to `false`, remove the class.
    - Define the CSS class in the consuming page's CSS file (or a shared utility CSS): `.anti-select { user-select: none; -webkit-user-select: none; }` and `.anti-select input, .anti-select textarea, .anti-select [data-allow-select], .anti-select [data-allow-paste] { user-select: text; -webkit-user-select: text; }`
    - This ensures answer input fields (`<input>`, `<textarea>`) and elements with `data-allow-select` or `data-allow-paste` attributes remain selectable (FR-16, FR-17). The IELTS writing editor container MUST have `data-allow-paste` attribute added to it.
  - [x] 3.4 Create `src/hooks/test/useFullscreenMode.ts`. The hook accepts:
    ```typescript
    interface UseFullscreenModeOptions {
      enabled: boolean; // Maps to config.requireFullscreen
      onFullscreenExit: (event: IntegrityEvent) => void; // Calls useTestIntegrity's addEvent
    }
    ```
    When `enabled === true`:
    - On mount, attempt `document.documentElement.requestFullscreen()` wrapped in try/catch. If it throws (mobile Safari, unsupported), call `onFullscreenExit({ type: 'fullscreen_unavailable', timestamp: Date.now(), withinGrace: true, counted: false })` and continue without blocking. Set `isSupportedRef = false`.
    - NOTE: `requestFullscreen()` requires a user gesture in most browsers. If it fails due to no user gesture, log and continue — the consuming component can add a "Go fullscreen" button as fallback.
    - Attach `document.addEventListener('fullscreenchange', handler)`. In the handler: if `document.fullscreenElement === null` (exited fullscreen), call `onFullscreenExit({ type: 'fullscreen_exit', timestamp: Date.now(), withinGrace: false, counted: true })`.
    - MUST return cleanup: `document.removeEventListener('fullscreenchange', handler)`.
    - Return `{ isFullscreen: boolean, isSupported: boolean, requestFullscreen: () => void }`.

- [x] 4.0 Build Session Start Config Modal (teacher pre-test setup)
  - [x] 4.1 Create `src/components/test/SessionStartConfigModal.tsx` with props:
    ```typescript
    interface SessionStartConfigModalProps {
      isOpen: boolean;
      onClose: () => void;
      onConfirm: (config: AntiCheatConfig) => void;
      testTitle: string;
    }
    ```
    When `isOpen === false`, render nothing (return `null`). When `isOpen === true`, render a centered modal overlay (see PRD section 6.2 for layout). The modal contains:
    - Header: "Start Test — {testTitle}"
    - Preset dropdown: `<select>` with options "None", "Standard" (selected by default), "Strict", "Custom" (shown only when user manually toggles individual settings). On change, call `resolvePreset(selectedPreset)` merged with `getContextDefaults('session')` and update the internal config state.
    - Footer buttons: "Cancel" (calls `onClose`) and "Start Test" (calls `onConfirm(config)` — uses the `Button` component from `src/components/modern`)
    - The modal overlay MUST have `onClick={(e) => e.target === e.currentTarget && onClose()}` to close on backdrop click.
  - [x] 4.2 Add "▸ Customize settings" expandable section below the preset dropdown. Use a `showCustomize` boolean state. When expanded, show toggle switches (styled `<input type="checkbox">` with labels) for each `AntiCheatConfig` boolean field:
    - "Tab-switch detection" → `detectTabSwitch`
    - "Copy/paste prevention" → `detectCopyPaste`
    - "Right-click prevention" → `detectRightClick`
    - "Fullscreen required" → `requireFullscreen`
    - "Detect keyboard shortcuts" → `detectKeyboardShortcuts`
    - "Student warnings" → `enableStudentWarnings`
    - "Auto-submit on violations" → `enableAutoSubmit` (when checked, show threshold `<input type="number">` with label "after ___ violations")
    - "Shuffle questions" → `shuffleQuestions`
    - "Shuffle answer options" → `shuffleOptions`
    - When ANY toggle is changed, set the preset display to "Custom" in the dropdown.
  - [x] 4.3 Apply session-specific defaults (FR-28): when the modal opens (`isOpen` transitions to `true`), initialize state with `{ ...resolvePreset('standard'), ...getContextDefaults('session') }`. This means: Standard detection on, student warnings off, auto-submit off. Teacher can customize from there.
  - [x] 4.4 Create `src/components/test/SessionStartConfigModal.css`. Follow existing modal styling patterns from `src/components/homework/HomeworkCreateModal.css` (file exists at `src/components/homework/HomeworkCreateModal.css`). Key styles: fixed overlay with `rgba(0,0,0,0.5)` backdrop, centered white card with `border-radius: 1rem`, `box-shadow`, `max-width: 480px`, `padding: 2rem`. Toggle row: `display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid #f1f5f9`.
  - [x] 4.5 Modify `src/components/test/TeacherTestControlBar.tsx`:
    - Change the `onStartTest` prop type from `() => Promise<void>` to `(config: AntiCheatConfig) => Promise<void>` in the `TeacherTestControlBarProps` interface (line 39).
    - Add state: `const [showConfigModal, setShowConfigModal] = useState(false);`
    - Change the "Start Test" button's `onClick` (line 172) from `() => handleAction(onStartTest)` to `() => setShowConfigModal(true)`.
    - Add `<SessionStartConfigModal isOpen={showConfigModal} onClose={() => setShowConfigModal(false)} onConfirm={(config) => { setShowConfigModal(false); handleAction(() => onStartTest(config)); }} testTitle={testData?.title || 'Test'} />` below the existing JSX.
    - Import `SessionStartConfigModal` and `AntiCheatConfig`.
  - [x] 4.6 Modify `src/hooks/monitor/useMonitorControls.ts` — this is where `startTest` is defined (line 102-142):
    - Change the `startTest` function signature from `const startTest = async () => {` to `const startTest = async (antiCheatConfig?: AntiCheatConfig) => {`.
    - In the `update(sessionRef, { ... })` call at line 110, add `antiCheatConfig: antiCheatConfig || null` to the update object: `await update(sessionRef, { status: 'in-progress', startTime: Date.now(), isPaused: false, antiCheatConfig: antiCheatConfig || null })`.
    - Update the `MonitorControlsResult` interface (line 34) to change `startTest: () => Promise<void>` to `startTest: (antiCheatConfig?: AntiCheatConfig) => Promise<void>`.
    - Import `AntiCheatConfig` from `../../types/integrity.types`.

- [x] 5.0 Add anti-cheat section to Homework Assignment Modal
  - [x] 5.1 Create `src/components/homework/AntiCheatConfigSection.tsx` with props:
    ```typescript
    interface AntiCheatConfigSectionProps {
      config: AntiCheatConfig;
      onChange: (config: AntiCheatConfig) => void;
    }
    ```
    The component renders as a collapsed section with header "🔒 Anti-Cheat Settings ▸" (using a `<button>` styled as a section header). On click, toggle `isExpanded` state. Use `max-height` CSS transition for smooth expand/collapse animation.
  - [x] 5.2 Inside the expanded section, add a preset dropdown (`<select>` with None/Standard/Strict/Custom) and a "▸ Customize" expandable sub-section with individual toggles (same toggle UI and field mapping as Task 4.2). Additionally include the `nullifyRemainingAttempts` toggle with label "Lock remaining attempts on auto-submit" — default OFF. When the dropdown changes, call `onChange(resolvePreset(selected))`. When any toggle changes, set dropdown to "Custom" and call `onChange(updatedConfig)`.
  - [x] 5.3 Create `src/components/homework/AntiCheatConfigSection.css`. Follow the collapsible section pattern from `HomeworkCreateModal.css`. Key styles: section header as flex row with chevron icon that rotates on expand, `transition: max-height 0.3s ease`, toggle row same as Task 4.4.
  - [x] 5.4 Integrate into `src/components/homework/HomeworkCreateModal.tsx` in the config step. Find the config section (approximately around line 616 where existing config fields like timer and attempts are rendered). Add `<AntiCheatConfigSection config={antiCheatConfig} onChange={setAntiCheatConfig} />` below the existing config fields. Initialize state: `const [antiCheatConfig, setAntiCheatConfig] = useState<AntiCheatConfig>(() => ({ ...resolvePreset('standard'), ...getContextDefaults('homework') }))`. Pass `antiCheatConfig` to the create function when the form is submitted.
  - [x] 5.5 Update the homework creation service call: find where the homework document is written to Firestore (in `homeworkManager.ts` or the function called from `HomeworkCreateModal`). Add `antiCheatConfig` to the document data. Use the undefined-sanitization pattern: `...(antiCheatConfig ? { antiCheatConfig } : {})`. This prevents writing `undefined` to Firestore (which throws).

- [ ] 6.0 Integrate `useTestIntegrity` into all student test surfaces
  - [ ] 6.1 Integrate into `src/pages/StudentTestPage.tsx`:
    - Import `useTestIntegrity` from `../../hooks/test/useTestIntegrity`.
    - Import `useAntiCopyPaste` from `../../hooks/test/useAntiCopyPaste`.
    - Import `{ toast }` from `../../components/modern/ToastNotification`.
    - Read the session's `antiCheatConfig` from the RTDB session data (it's already subscribed to via `game_sessions/{sessionCode}`). Access it as `session?.antiCheatConfig || null`.
    - Call `useTestIntegrity({ config: session?.antiCheatConfig || null, context: 'session', sessionCode, studentId: currentUser.uid, testId })`.
    - Create `containerRef = useRef<HTMLDivElement>(null)` and wrap the test content area in `<div ref={containerRef}>`.
    - Call `useAntiCopyPaste({ enabled: config?.detectCopyPaste || false, containerRef, onEvent: addEvent, allowEditorPaste: testData?.skill === 'Writing' })`.
    - Add a `useEffect` to watch `warningLevel`: when it changes to `'toast'` or `'escalated'`, call `toast.warning(warningMessage)`. When it changes to `'final'`, set `showFinalWarningModal` state to true and render a blocking modal (inline `<div>` styled as fixed overlay).
    - Add a `useEffect` to watch `shouldAutoSubmit`: when it becomes true, call the existing submission function with force-submit flag, then call `flushEvents()`.
    - Before the existing submission logic, add `await flushEvents()` to ensure all events are written.
    - For IELTS Writing tests (FR-16): add `data-allow-paste` attribute to the essay editor's container element.
  - [ ] 6.2 Integrate into `src/components/practice/THCSPracticeView.tsx`:
    - Only activate if the practice view is in homework context. Check for the presence of a `homeworkId` prop or a `homework` data prop. If either exists, read `antiCheatConfig` from the homework document data.
    - Call `useTestIntegrity({ config: homework?.antiCheatConfig || null, context: 'homework', studentId: currentUser.uid, testId: homework?.materialId || '' })`. Note: do NOT pass `sessionCode` — this is homework, not a session.
    - Wrap test content in `<div ref={containerRef}>` and call `useAntiCopyPaste`.
    - Add `useBeforeUnloadWarning` import from `../../hooks/test/useBeforeUnloadWarning` and call it. Activate only when the student is actively working (not reviewing results).
    - Same warning toast/modal pattern as 6.1.
    - On submission, call `getIntegrityReport()` and pass the result to the homework submission function (Task 6.5).
  - [ ] 6.3 Integrate into `src/pages/StudentQuizPageNew.jsx`:
    - This file is `.jsx` (not TypeScript). Import hooks normally — TypeScript types are inferred at runtime. Do NOT rename the file.
    - Import: `import { useTestIntegrity } from '../hooks/test/useTestIntegrity'`
    - Import: `import { useAntiCopyPaste } from '../hooks/test/useAntiCopyPaste'`
    - Import: `import { toast } from '../components/modern/ToastNotification'`
    - Import: `import useBeforeUnloadWarning from '../hooks/test/useBeforeUnloadWarning'` (or named import, verify existing export style)
    - Activation pattern same as 6.1 but for quiz session data.
    - Call `useBeforeUnloadWarning()` when quiz is in-progress.
  - [ ] 6.4 Update `src/hooks/test/useTestSubmission.ts`: find the main submission function. Add an optional `integrityReport?: IntegrityReport` parameter. When provided, include it in the RTDB write payload at the `integrity` sub-path of the player's node: `update(ref(database, \`game_sessions/${sessionCode}/players/${studentId}/integrity\`), integrityReport)`.
  - [ ] 6.5 Update `src/services/homeworkSubmissionService.ts`: find the function that creates/updates a `HomeworkSubmission` document in Firestore. Add an optional `integrity?: HomeworkIntegrity` field to the submission data. When provided, include it in the Firestore document write. Use the sanitization pattern: `...(integrity ? { integrity } : {})`.
  - [ ] 6.6 Handle auto-submit + nullify attempts: when `shouldAutoSubmit` is triggered on homework AND `config.nullifyRemainingAttempts === true`:
    - After submitting the current attempt, update the student's homework status to prevent further attempts. Find how `attemptsRemaining` or max attempts is tracked (check `HomeworkSubmission.attemptNumber` vs `HomeworkConfig.maxAttempts` or `thcsConfig.maxAttempts`).
    - Set a flag or adjust the attempt tracking so the student sees "No remaining attempts" on their next visit.
    - The existing `resetStudentHomework` function in `src/services/homeworkSubmissionService.ts` (line 600) MUST remain functional as the teacher's ability to restore attempts (FR-45). Do NOT modify `resetStudentHomework` — it already handles resetting submission status.

- [ ] 7.0 Add integrity badges and action buttons to Teacher Monitor student cards
  - [ ] 7.1 Create `src/components/test/IntegrityBadge.tsx`. A small, reusable component:
    ```typescript
    interface IntegrityBadgeProps {
      violationCount: number;
      riskLevel: 'low' | 'medium' | 'high';
      onClick?: () => void; // For opening detail panel on results pages
    }
    ```
    Renders:
    - `low` (0 violations): a small green dot (8px circle, `background: #10b981`) OR no indicator if the parent prefers. Check `violationCount === 0`.
    - `medium` (1-2 violations): amber dot + count text: `<span>⚠️ {violationCount}</span>` with `color: #f59e0b`, `font-size: 0.75rem`.
    - `high` (3+): red dot + count: `<span>🚩 {violationCount}</span>` with `color: #ef4444`, `font-size: 0.75rem`.
    - Size should be compact: `display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 999px; font-weight: 600`.
    - If `onClick` is provided, render as a `<button>` with cursor pointer. Otherwise render as `<span>`.
  - [ ] 7.2 Add `integrityData?: { violationCount: number, riskLevel: 'low' | 'medium' | 'high' }` prop to `src/components/test/StudentProgressCard.tsx`. Render the `IntegrityBadge` in the header section — find the status badge area (approximately line 250, look for the div that shows "Working" / "Completed" etc.) and place the badge next to it. Only render if `integrityData` is provided. Add `onForceSubmit?: () => void` and `onResetSubmit?: () => void` props — wire these to Task 7.5.
  - [ ] 7.3 Add the same `integrityData` prop to `src/components/thcs-grading/THCSStudentProgressCard.tsx`. Render `IntegrityBadge` in the equivalent header position.
  - [ ] 7.4 Add the same `integrityData` prop to `src/components/writing-monitor/WritingMonitorCard.tsx`. Render `IntegrityBadge` in the equivalent header position.
  - [ ] 7.5 Add "Force Submit" and "Reset" action buttons to `src/components/test/StudentProgressCard.tsx`. These should appear as a row of small buttons below the stats grid and above the "Click to view details" hint. Show ONLY when the student's status is 'working' (test in-progress, not completed). Layout:
    - "Force Submit" — red outline button: `{ border: '1px solid #ef4444', color: '#ef4444', background: 'transparent', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px' }`. On click: `if (window.confirm('Force submit this student? Their current answers will be submitted.')) onForceSubmit?.()`.
    - "Reset" — gray outline button: `{ border: '1px solid #94a3b8', color: '#64748b', ... }`. On click: `if (window.confirm('Reset this student\\'s submission? They will be able to continue the test.')) onResetSubmit?.()`.
    - Use `window.confirm()` for confirmation — do NOT build a custom confirmation modal for this.
  - [ ] 7.6 In `src/pages/TeacherTestMonitorPage.tsx`, read integrity data for each student. The existing page already subscribes to player data at `game_sessions/{sessionCode}/players/`. Integrity data will be at `game_sessions/{sessionCode}/players/{playerId}/integrity/` (written by the student's `useTestIntegrity` hook). Access it as `player.integrity?.violationCount` and compute `riskLevel` using `computeRiskLevel(player.integrity?.violationCount || 0, player.integrity?.forceSubmitted || false)`. Pass `integrityData={{ violationCount, riskLevel }}` to each `StudentProgressCard`.
  - [ ] 7.7 Implement `handleForceSubmit(studentId: string)` in `src/pages/TeacherTestMonitorPage.tsx`:
    ```typescript
    const handleForceSubmit = async (studentId: string) => {
      const sessionRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);
      await update(sessionRef, {
        hasCompletedTest: true,
        forceSubmittedBy: 'teacher',
        completedAt: Date.now(),
      });
    };
    ```
    Import `{ ref, update }` from `firebase/database` and `{ database }` from `../services/firebase` (or reuse existing imports). Pass `onForceSubmit={() => handleForceSubmit(playerId)}` to each student card.
  - [ ] 7.8 Implement `handleResetSubmit(studentId: string)` in `src/pages/TeacherTestMonitorPage.tsx`:
    ```typescript
    const handleResetSubmit = async (studentId: string) => {
      const sessionRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);
      await update(sessionRef, {
        hasCompletedTest: null,
        forceSubmittedBy: null,
        completedAt: null,
      });
    };
    ```
    Pass `onResetSubmit={() => handleResetSubmit(playerId)}` to each student card.
  - [ ] 7.9 Add a "🔄 Refresh Logs" button to the teacher monitor page. Place it near existing controls (e.g., the pagination area or near the search input). Use `<Button variant="glass" size="sm" onClick={handleRefreshLogs}>🔄 Refresh Logs</Button>`. The handler simply forces a re-read by updating a `refreshKey` state: `const [refreshKey, setRefreshKey] = useState(0); const handleRefreshLogs = () => setRefreshKey(k => k + 1);`. If the existing RTDB subscription is via `onValue`, it already receives real-time updates — in that case, the Refresh button forces a `once('value')` read using `get(ref(database, \`game_sessions/${sessionCode}\`))` and updates the state.

- [ ] 8.0 Build integrity detail panel on Teacher Results pages
  - [ ] 8.1 Create `src/components/test/IntegrityDetailPanel.tsx` with props:
    ```typescript
    interface IntegrityDetailPanelProps {
      report: IntegrityReport;
      studentName: string;
      isOpen: boolean;
      onClose: () => void;
    }
    ```
    Render as a right-side slide-in panel or modal overlay (see PRD section 6.4 for layout). Show:
    - Header: "Integrity Report — {studentName}" + risk level badge
    - Stats grid (2-column): Tab Switches (X counted, Y grace), Time Away (format as seconds/minutes), Copy Attempts, Paste Attempts, Fullscreen Exits, Right-Click Attempts, Keyboard Shortcut Attempts
    - Force-submit info: "Force Submitted: ✅ By {forceSubmittedBy}" or "No" if not force-submitted
  - [ ] 8.2 Add an event timeline section below the stats grid. Map `report.events` to a chronological list. Each row shows:
    - Timestamp: format as `HH:mm:ss` using `new Date(event.timestamp).toLocaleTimeString()`
    - Type icon: 🔄 tab_switch, 📋 copy_attempt, 📎 paste_attempt, 🖱️ right_click, ⛶ fullscreen_exit, ⌨️ keyboard_shortcut, 🪟 devtools_resize, ⏱️ time_per_question, 🔁 page_reload
    - Duration: "(8s)" for tab switches, empty for others
    - Status: green text "grace ✓" if `withinGrace`, amber text "counted ⚠️" if `counted`
  - [ ] 8.3 Create `src/components/test/IntegrityDetailPanel.css`. Key styles: glass-panel background (`background: rgba(255,255,255,0.95); backdrop-filter: blur(12px)`), `max-height: 80vh; overflow-y: auto`, stats grid with `display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem`, timeline items with left border indicating grace (green) or counted (amber/red).
  - [ ] 8.4 Integrate into `src/pages/TeacherTestResultsPage.tsx` (session results): find where student results are rendered (each student row/card). Add `IntegrityBadge` next to each student's name/score. Read integrity data from RTDB at `game_sessions/{sessionCode}/players/{playerId}/integrity/` using `get(ref(database, path))` on page load (one-time read, not real-time subscription). On badge click, set `selectedStudentIntegrity` state and render `IntegrityDetailPanel`. Also add import for `computeRiskLevel` to compute the risk level for the badge.
  - [ ] 8.5 Integrate into `src/pages/TeacherHomeworkDetailPage.tsx` (homework results): find where student submissions are rendered. Each `HomeworkSubmission` document in Firestore may contain an `integrity` field (written by Task 6.5). Read it from the submission data. Add `IntegrityBadge` next to each student row. On click, open `IntegrityDetailPanel`. If `integrity` data doesn't exist on the submission (pre-anti-cheat homework), show no badge.
  - [ ] 8.6 Verify integrity data is NOT in exports: search both results pages for any CSV/PDF export functions (grep for "csv", "export", "download", "pdf" in both files). Currently no export functions exist in `TeacherTestResultsPage.tsx` or `TeacherHomeworkDetailPage.tsx` — if they are added in the future, integrity data MUST be excluded. Add a code comment: `// FR-40: Integrity data is UI-only — do NOT include in any CSV/PDF exports`.

- [ ] 9.0 Implement answer key obfuscation (separate fetch)
  - [ ] 9.1 Identify where test questions with `correctAnswer` (or field name `correctAns`) are fetched on student-facing pages. Based on codebase search, `correctAns` is used as the field name across: `StudentTestPage.tsx`, `THCSPracticeView.tsx` (via `thcsShuffle.ts`), `StudentQuizPageNew.jsx`, `scoring.js`, `answerNormalization.js`, `autoMarking.service.ts`. The field comes from Firestore/RTDB test documents and is loaded as part of the question objects.
  - [ ] 9.2 Modify the student-facing test data fetch to strip `correctAns` from the question objects BEFORE passing them to component state. Do this at the data-fetching layer (wherever questions are loaded from Firebase). Implementation: after fetching questions, map them: `questions.map(q => { const { correctAns, ...rest } = q; return rest; })`. Store the stripped questions in component state for rendering. Store the original questions (with answers) in a separate ref for grading at submission time.
  - [ ] 9.3 For a cleaner separation, create a `fetchAnswerKeys(questions: any[]): Record<string, string | string[]>` utility in `src/utils/answerKeyHelper.ts` that extracts `{ [questionId]: correctAns }` from the full question array. This function is called at submission time to get the answer keys.
  - [ ] 9.4 Update the grading/submission logic in each surface: instead of grading against `question.correctAns` directly, use the answer keys map from the ref (which was saved before stripping). This is a minimal refactor — the answer keys are still loaded client-side, just separated from the rendered question objects to prevent casual inspection.
  - [ ] 9.5 Add a code comment to the answer key helper: `// FR-53: This is CLIENT-SIDE obfuscation only. The answer keys are still fetched and processed on the client. This prevents casual inspection of page source / React DevTools but does NOT prevent a determined student from intercepting the grading request. True server-side grading requires Cloud Functions on the Blaze plan (deferred to future PRD).`

- [ ] 10.0 Extend existing protections to all test surfaces
  - [ ] 10.1 Add `useBeforeUnloadWarning` to `src/components/practice/THCSPracticeView.tsx`. Import: check the existing export style in `src/hooks/test/useBeforeUnloadWarning.ts` (default or named export). Call it at the top of the component. Activate only when the student is actively working — pass a condition like `isActive: status === 'in_progress'` or wrap in a conditional. Do NOT activate when the student is reviewing results or browsing.
  - [ ] 10.2 Add `useBeforeUnloadWarning` to `src/pages/StudentQuizPageNew.jsx`. Same import pattern. Activate when the quiz session status is 'in-progress'.
  - [ ] 10.3 Extend `src/hooks/test/useTestCompletionCheck.ts` to work with THCS homework: add an optional parameter `{ mode: 'session' | 'homework', homeworkId?: string, maxAttempts?: number, currentAttempt?: number }`. When `mode === 'homework'`, check if `currentAttempt >= maxAttempts` — if so, the student has used all attempts and should be redirected. This prevents re-entry to a completed homework assignment.
  - [ ] 10.4 Create `shuffleArray<T>` wrapper in `src/utils/thcsShuffle.ts` (add to existing file, do NOT create a new file). The generic `fisherYatesShuffle<T>` already exists and is exported from this file at line 17. It accepts `(array: T[], rng: () => number)`. Create a new convenience function:
    ```typescript
    import seedrandom from 'seedrandom';
    // Already imported at line 12

    export function shuffleArray<T>(array: T[], seed: string): T[] {
      const rng = seedrandom(seed);
      return fisherYatesShuffle(array, rng);
    }
    ```
    This avoids requiring every consumer to import `seedrandom` directly.
  - [ ] 10.5 Create IELTS-specific shuffle utility: add a `shuffleIELTSTest(questions: any[], studentUid: string, testId: string, options: { shuffleQuestions: boolean, shuffleOptions: boolean }): any[]` function in `src/utils/thcsShuffle.ts` (or a new `src/utils/ieltsTestShuffle.ts` if the file is getting too large). Implementation:
    - Use `shuffleArray(questions, \`${studentUid}_${testId}_q\`)` for question order shuffling.
    - For option shuffling: for each question with MCQ options (array of choices), use `shuffleArray(question.options, \`${studentUid}_${testId}_opt_${question.id}\`)` to shuffle options. Remap the `correctAns` letter using the existing `remapAnswerKey` function (already exported from `thcsShuffle.ts` at line 31).
  - [ ] 10.6 Integrate IELTS shuffle into `src/pages/StudentTestPage.tsx`: when the session's `antiCheatConfig.shuffleQuestions` or `antiCheatConfig.shuffleOptions` is true, apply the shuffle utility to the question array. Use `useMemo(() => shuffleIELTSTest(questions, uid, testId, { shuffleQuestions, shuffleOptions }), [questions, uid, testId, shuffleQuestions, shuffleOptions])` to ensure stable shuffle across re-renders. The shuffled output should be used for rendering; the original order is preserved for grading.

- [ ] 11.0 Quality assurance and FR-14 compliance
  - [ ] 11.1 **FR-14 Audit:** Grep the entire `src/pages/Student*.tsx` and `src/pages/Student*.jsx` directories to ensure NO student-facing page imports `IntegrityBadge`, `IntegrityDetailPanel`, `IntegrityReport`, or `computeRiskLevel`. These are teacher-only components/utilities. If any student page imports them, it is a bug.
  - [ ] 11.2 **Cleanup audit:** Verify that ALL `useEffect` hooks in the new integrity-related files return proper cleanup functions. Check: `useTestIntegrity` (event listeners + interval + sessionStorage), `useAntiCopyPaste` (event listeners), `useFullscreenMode` (event listener).
  - [ ] 11.3 **Unit tests:** Create the following test files (if not already created in earlier tasks): `src/hooks/test/useAntiCopyPaste.test.ts`, `src/hooks/test/useFullscreenMode.test.ts`, `src/components/test/IntegrityBadge.test.tsx`. Each should test the core behavior described in their sub-tasks.
