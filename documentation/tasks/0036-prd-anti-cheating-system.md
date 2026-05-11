# PRD-0036: Anti-Cheating & Test Integrity System

**Created:** 2026-03-15
**Status:** Draft
**Author:** AI Assistant + Product Owner
**Priority:** High
**Depends On:** PRD-0019 (Test Duration & End Flow), PRD-0027/0028/0029 (THCS Test System)

---

## 1. Introduction / Overview

Students taking tests (IELTS sessions, THCS practice, quizzes, homework) currently have no barriers against switching tabs to search answers, copying question text to external AI tools, or sharing answers with classmates. The only existing protections are a `beforeunload` warning (IELTS only), re-entry prevention (IELTS only), and question shuffling (THCS only).

This PRD introduces a comprehensive **Test Integrity System** that detects, logs, and optionally acts on suspicious student behavior during assessments. The system follows a **deterrence-first** philosophy: the goal is to make cheating inconvenient and observable, not to build an impenetrable lockdown.

**Key principle:** All detection happens silently on the client. All data is for teacher consumption only. Students never see integrity reports — they only experience consequences (warnings, auto-submit) if the teacher has enabled them.

---

## 2. Goals

1. **Detect** tab switching, copy/paste attempts, fullscreen exits, and suspicious keyboard usage across ALL test surfaces (sessions, homework, THCS practice, quizzes).
2. **Log** all integrity events to RTDB with batched writes (every 5 minutes + final flush on submission), recoverable via `sessionStorage` backup.
3. **Warn** students via non-blocking toasts (homework only, when enabled), escalating to a blocking modal before auto-submit.
4. **Empower teachers** with configurable anti-cheat presets (None / Standard / Strict) per session and per homework assignment.
5. **Display** integrity data on teacher-facing results pages: badge at a glance, expandable detail on click.
6. **Extend** existing protections (`useBeforeUnloadWarning`, `useTestCompletionCheck`, `thcsShuffle`) to all test surfaces.
7. **Obfuscate** answer keys by separating them from the initial test data payload (minimal, client-side only — server-side grading deferred to future PRD).

---

## 3. User Stories

### Teacher
- **US-T1:** As a teacher, I want to configure anti-cheat settings before starting a live test session, so I can decide the appropriate level of monitoring for each exam.
- **US-T2:** As a teacher, I want to see an integrity badge (✅ Clean / ⚠️ Warning / 🚩 Flagged) on each student's result card, so I can quickly identify suspicious submissions.
- **US-T3:** As a teacher, I want to expand a student's integrity badge to see a detailed log (tab switches, copy attempts, fullscreen exits with timestamps), so I can make informed decisions about the validity of their work.
- **US-T4:** As a teacher, I want to force-submit or reset a student's test from the teacher monitor, so I can intervene when I observe live integrity violations.
- **US-T5:** As a teacher, I want to force-refresh integrity logs in the teacher monitor, so I can see the latest data without waiting for the next batch interval.
- **US-T6:** As a teacher, I want to configure anti-cheat presets (None / Standard / Strict) when assigning homework, so different assignments can have different levels of protection.
- **US-T7:** As a teacher, I want a toggle to decide whether force-submit nullifies remaining homework attempts, so I can control the severity of consequences.

### Student
- **US-S1:** As a student, I should be unable to copy question text or paste external answers during a test (when anti-cheat is enabled), so the assessment reflects my own knowledge.
- **US-S2:** As a student taking homework with Standard anti-cheat, I should receive a non-blocking toast warning when I switch tabs, so I know to stay on the test page.
- **US-S3:** As a student, if I am about to be force-submitted due to excessive violations, I should see a blocking modal warning me this is my last chance, so I can return to the test immediately.

---

## 4. Functional Requirements

### 4.1 Detection Engine — `useTestIntegrity` Hook

**FR-1:** The system MUST create a consolidated React hook `useTestIntegrity` that detects the following events:

| Event Type | Detection API | Description |
|---|---|---|
| `tab_switch` | `document.addEventListener('visibilitychange')` | Student switched to another tab or minimized browser |
| `window_blur` | `window.addEventListener('blur')` | Student switched to another application (Alt+Tab) |
| `fullscreen_exit` | `document.addEventListener('fullscreenchange')` | Student exited fullscreen mode |
| `copy_attempt` | `document.addEventListener('copy')` on test container | Student attempted to copy text |
| `paste_attempt` | `document.addEventListener('paste')` on test container | Student attempted to paste text |
| `right_click` | `document.addEventListener('contextmenu')` on test container | Student right-clicked on test content |
| `keyboard_shortcut` | `document.addEventListener('keydown')` for Ctrl+C, Ctrl+V, F12, Ctrl+Shift+I | Student used suspicious keyboard shortcut |
| `devtools_resize` | `window.addEventListener('resize')` with heuristic | Window resized in a pattern suggesting DevTools opened |
| `time_per_question` | Internal tracking | Time spent per question (for post-analysis) |

**FR-2:** The hook MUST accept an `AntiCheatConfig` object that determines which detections are active and what actions to take.

**FR-3:** The hook MUST buffer all detected events in an in-memory array AND mirror them to `sessionStorage` as a crash-recovery backup.

**FR-4:** The hook MUST batch-write events to RTDB every 5 minutes during the test, and perform a final flush of all remaining events on test submission.

**FR-5:** On page reload, the hook MUST check `sessionStorage` for unsent events from a previous crash and include them in the next batch write.

### 4.2 Grace Period & Threshold System

**FR-6:** Tab switches and window blurs shorter than **5 seconds** MUST be ignored (not counted toward violation thresholds). This handles notification glances and phone call interrupts.

**FR-7:** The first **2** tab switches/blurs (of any duration) MUST be treated as "free" — not counted toward violation thresholds. This handles accidental taps and system-level interrupts.

**FR-8:** Both grace thresholds (5-second minimum and 2 free switches) MUST apply simultaneously. A switch only counts as a violation if it exceeds 5 seconds AND the student has already used their 2 free switches.

**FR-9:** All events (including those within grace thresholds) MUST still be logged. Grace only affects whether warnings/actions trigger — it never suppresses logging.

**FR-10:** These thresholds apply to ALL devices (desktop and mobile equally).

### 4.3 Student-Facing Consequences (Homework Only by Default)

**FR-11:** Warnings MUST be non-blocking toasts (small notification in corner) for all violations except the final warning before auto-submit.

**FR-12:** The final warning before auto-submit MUST be a blocking modal that requires the student to acknowledge or return to the test.

**FR-13:** Warning text MUST NOT explicitly mention "anti-cheat" or "monitoring." Use neutral language:
- Toast: _"Please stay on this page to complete your work."_
- Escalated toast: _"You have left this page multiple times. Continuing may affect your submission."_
- Final modal: _"Your submission is about to be finalized. Click 'Continue Test' to keep working, or your current answers will be submitted."_

**FR-14:** Students MUST NOT see any integrity reports, badges, flags, or detailed logs at any point — before, during, or after the test. Integrity data is teacher-only.

### 4.4 Copy/Paste Prevention

**FR-15:** When `disableCopyPaste` is enabled, the system MUST:
- Prevent default on `copy`, `cut`, and `paste` events on the test container element
- Prevent right-click context menu on the test container
- Apply `user-select: none` CSS to question text, passage text, and answer options
- Log all prevented attempts as integrity events

**FR-16:** For IELTS Writing tests: copy/paste prevention MUST only apply to the **question/passage area**. The essay answer editor MUST allow normal text editing operations (select, cut, copy, paste within the editor). Students need to be able to edit their own essays.

**FR-17:** Copy/paste prevention MUST NOT apply to fill-in-the-blank input fields or short-answer text inputs, as students type their answers there.

### 4.5 Fullscreen Mode

**FR-18:** When `enableFullscreen` is enabled, the system MUST:
- Prompt the student to enter fullscreen when the test starts (via `Element.requestFullscreen()`)
- Monitor `fullscreenchange` events for exits
- Log each fullscreen exit as an integrity event

**FR-19:** Fullscreen is NOT mandatory to take the test. If the student declines or exits fullscreen, the test continues normally. The exit is logged but is not a blocking action (unless the teacher configured a threshold).

**FR-20:** Fullscreen MUST be available for both sessions and homework (off by default for both, teacher can enable).

### 4.6 Context-Specific Behavior

**FR-21:** The system MUST apply different default behaviors based on the test context:

| Behavior | Live Sessions | Solo Practice | Homework |
|---|---|---|---|
| Detection active | ✅ Yes | ❌ No | ✅ Yes |
| Logging active | ✅ Yes (batched 5 min) | ❌ No | ✅ Yes (batched 5 min) |
| Student warnings | ❌ Off (teacher can enable) | ❌ Off | ✅ Progressive (default) |
| Forced actions | ❌ Off (teacher can enable) | ❌ Off | ✅ Auto-submit after threshold (default) |
| Fullscreen | ❌ Off (teacher can enable) | ❌ Off | ❌ Off (teacher can enable) |
| Shuffle | Inherit from test settings | N/A | Inherit from test/homework settings |
| Copy/paste prevention | ✅ On | ❌ Off | ✅ On |

**FR-22:** Solo practice (unsupervised, non-homework) MUST have zero anti-cheat — no detection, no logging, no warnings, no actions. This is practice; cheating is irrelevant.

### 4.7 Anti-Cheat Configuration Data Model

**FR-23:** The `AntiCheatConfig` type MUST be:

```typescript
interface AntiCheatConfig {
  // Preset level (determines defaults for all fields below)
  preset: 'none' | 'standard' | 'strict';

  // Detection toggles
  detectTabSwitch: boolean;
  detectCopyPaste: boolean;
  detectRightClick: boolean;
  detectFullscreenExit: boolean;
  detectKeyboardShortcuts: boolean;

  // Student warning behavior
  enableStudentWarnings: boolean;

  // Forced action
  enableAutoSubmit: boolean;
  autoSubmitThreshold: number;       // Number of counted violations before auto-submit

  // Fullscreen
  requireFullscreen: boolean;

  // Shuffling
  shuffleQuestions: boolean;
  shuffleOptions: boolean;

  // Consequence severity
  nullifyRemainingAttempts: boolean; // Only for homework with multiple attempts
}
```

**FR-24:** Presets MUST map to the following defaults:

| Setting | None | Standard | Strict |
|---|---|---|---|
| `detectTabSwitch` | ❌ | ✅ | ✅ |
| `detectCopyPaste` | ❌ | ✅ | ✅ |
| `detectRightClick` | ❌ | ✅ | ✅ |
| `detectFullscreenExit` | ❌ | ❌ | ✅ |
| `detectKeyboardShortcuts` | ❌ | ✅ | ✅ |
| `enableStudentWarnings` | ❌ | ✅ | ✅ |
| `enableAutoSubmit` | ❌ | ✅ | ✅ |
| `autoSubmitThreshold` | — | 5 | 3 |
| `requireFullscreen` | ❌ | ❌ | ✅ |
| `shuffleQuestions` | ❌ | ✅ | ✅ |
| `shuffleOptions` | ❌ | ✅ | ✅ |
| `nullifyRemainingAttempts` | ❌ | ❌ | ❌ (teacher toggle, default off) |

### 4.8 Session Anti-Cheat Configuration

**FR-25:** When the teacher clicks "Start" in the teacher monitor to start a test, a **configuration modal** MUST appear before the test begins.

**FR-26:** The modal MUST include:
- A preset picker: dropdown with "None" / "Standard" / "Strict"
- An expandable "Customize" section that shows individual toggles (populated from preset defaults, teacher can override)
- A "Start Test" button to confirm and begin

**FR-27:** The selected config MUST be stored in the session data at `game_sessions/{sessionCode}/antiCheatConfig`.

**FR-28:** The default preset for sessions MUST be "Standard" (detection + logging on, student warnings off, forced actions off — matching the session-specific defaults from FR-21).

Note: For sessions, the "Standard" preset defaults have `enableStudentWarnings: false` and `enableAutoSubmit: false`, per FR-21. The preset table in FR-24 shows homework defaults. When the context is "session," the config modal must apply the session-specific overrides.

### 4.9 Homework Anti-Cheat Configuration

**FR-29:** The homework assignment modal MUST include a **collapsed** "🔒 Anti-Cheat Settings" section that expands on click.

**FR-30:** The section MUST contain:
- A preset picker: "None" / "Standard" (default) / "Strict"
- An expandable "Customize" section for individual toggles
- A `nullifyRemainingAttempts` toggle (labeled: "Lock remaining attempts on auto-submit") — default: OFF

**FR-31:** The config MUST be stored on the homework document in Firestore at the `antiCheatConfig` field.

**FR-32:** When the student opens a homework test, the client MUST read the `antiCheatConfig` from the homework document and pass it to `useTestIntegrity`.

### 4.10 Teacher Monitor Integration (Live Sessions)

**FR-33:** Each student card in the teacher monitor (`StudentProgressCard`, `THCSStudentProgressCard`, `WritingMonitorCard`) MUST display an integrity badge when integrity data exists for that student:
- ✅ **Clean** — no violations (green dot or no indicator)
- ⚠️ **Warning** — 1-2 violations (amber badge)
- 🚩 **Flagged** — 3+ violations (red badge with count)

**FR-34:** The badge is read from `game_sessions/{sessionCode}/players/{playerId}/integrity/violationCount` which is updated every 5 minutes via batched writes.

**FR-35:** Each student card MUST include two action buttons (visible to teacher only):
- **"Force Submit"** — immediately submits the student's current answers and marks their test as completed
- **"Reset Submit"** — resets the student's submission status, allowing them to continue (for cases where force-submit was accidental or unfair)

**FR-36:** The teacher monitor MUST include a **"Refresh Logs" button** (global, not per-student) that triggers an immediate read of all integrity data from RTDB, bypassing the 5-minute batch interval.

**FR-37:** Force-submit from the teacher monitor MUST write `hasCompletedTest: true` and `forceSubmittedBy: 'teacher'` to the player's RTDB node, triggering the existing submission flow on the student's client.

### 4.11 Results Page Integration (Teacher Only)

**FR-38:** On the teacher's test results page (both session results and homework submission results), each student row/card MUST show an integrity badge (same ✅ / ⚠️ / 🚩 scheme as FR-33).

**FR-39:** Clicking the badge MUST expand an **integrity detail panel** showing:
- Total tab switches (with count of those within grace vs. counted violations)
- Total time spent away from the test page
- Copy/paste attempt count
- Fullscreen exit count
- Right-click attempt count
- Keyboard shortcut attempt count
- Whether the student was force-submitted (and by whom: system auto-submit or teacher)
- Risk level: Low / Medium / High (computed from violation count)

**FR-40:** The integrity detail panel MUST NOT be included in any CSV/PDF exports of results. It is UI-only.

### 4.12 RTDB Data Structure for Integrity Logging

**FR-41:** Integrity data MUST be stored at the following RTDB path:

For sessions:
```
game_sessions/{sessionCode}/players/{playerId}/integrity/
  ├── violationCount: number        // Counted violations (past grace threshold)
  ├── totalEvents: number           // All events including grace-ignored ones
  ├── tabSwitchCount: number        // Raw tab switch count
  ├── totalTimeAwayMs: number       // Total milliseconds away from test page
  ├── copyAttempts: number          // Copy attempt count
  ├── pasteAttempts: number         // Paste attempt count
  ├── rightClickAttempts: number    // Right-click attempt count
  ├── fullscreenExitCount: number   // Fullscreen exit count
  ├── keyboardShortcutAttempts: number
  ├── forceSubmitted: boolean       // Whether auto/teacher force-submitted
  ├── forceSubmittedBy: string      // 'system' | 'teacher'
  ├── riskLevel: string             // 'low' | 'medium' | 'high'
  └── events: IntegrityEvent[]      // Full event log
        ├── type: string
        ├── timestamp: number
        ├── durationMs?: number     // For tab switches
        ├── withinGrace: boolean    // Whether this was within grace threshold
        └── counted: boolean        // Whether this counted toward violations
```

For homework (Firestore, on the submission document):
```typescript
interface HomeworkIntegrity {
  violationCount: number;
  tabSwitchCount: number;
  totalTimeAwayMs: number;
  copyAttempts: number;
  pasteAttempts: number;
  fullscreenExitCount: number;
  forceSubmitted: boolean;
  forceSubmittedBy: 'system' | 'teacher' | null;
  riskLevel: 'low' | 'medium' | 'high';
  events: IntegrityEvent[];
}
```

### 4.13 Risk Level Computation

**FR-42:** Risk level MUST be computed as follows:
- **Low**: 0 counted violations
- **Medium**: 1-2 counted violations
- **High**: 3+ counted violations OR any force-submit event

### 4.14 Homework Auto-Submit & Attempt Nullification

**FR-43:** When auto-submit is triggered on homework (student exceeds violation threshold):
- The current attempt is immediately submitted with current answers
- The submission is marked with `forceSubmitted: true` and `forceSubmittedBy: 'system'`
- If `nullifyRemainingAttempts` is enabled on the homework's `AntiCheatConfig`, ALL remaining attempts for this student on this homework are disabled (set `remainingAttempts: 0` or equivalent flag)

**FR-44:** If `nullifyRemainingAttempts` is disabled (default), the auto-submit only burns the current attempt. The student can use remaining attempts normally.

**FR-45:** When a student's attempts are nullified, the teacher MUST be able to reset the student's homework (using the existing `resetStudentHomework` function) to restore their attempts.

### 4.15 Browser Crash Detection

**FR-46:** The system MUST attempt to distinguish browser crashes from intentional tab switches using the following heuristic:
- On page load, check `sessionStorage` for a `test_in_progress` flag
- If the flag exists AND `performance.navigation.type` indicates a reload or new navigation, this suggests a crash/refresh rather than a fresh tab switch
- Crash-recovery events MUST be logged with `type: 'page_reload'` and `withinGrace: true` (not counted as a violation)

**FR-47:** This heuristic is best-effort. False positives (student intentionally closes and reopens) will be logged as page reloads, not violations. The teacher can review and make a judgment call.

### 4.16 Extend Existing Protections

**FR-48:** `useBeforeUnloadWarning` MUST be added to:
- THCS Practice View (`THCSPracticeView.tsx`)
- Student Quiz Page (`StudentQuizPageNew.jsx`)
- Any homework practice view

**FR-49:** `useTestCompletionCheck` MUST be extended to THCS homework practice (prevent re-entry during active homework that's been submitted).

**FR-50:** Question shuffling (`thcsShuffle.ts` pattern) MUST be made available for IELTS tests (shuffle question order per student). Option shuffling for IELTS MCQ questions MUST also be supported.

### 4.17 Answer Key Obfuscation (Minimal)

**FR-51:** The initial test data fetch (used to render questions to the student) MUST NOT include the `correctAnswer` field on each question.

**FR-52:** The correct answer keys MUST be fetched as a separate request, only when needed for grading (at submission time).

**FR-53:** This is not true server-side protection — the answer key is still fetched client-side for grading. It prevents casual inspection of page source or initial network responses but does not prevent a determined student from intercepting the grading request. Full server-side grading is deferred to a future trusted-backend PRD. Cloud Functions were the original assumed backend, but a Cloudflare Worker or another trusted HTTP service is also valid if it verifies auth, keeps answer keys server-side, scores server-side, and writes official results server-side.

---

## 5. Non-Goals (Out of Scope)

1. **Server-side grading via trusted backend** — deferred to future PRD; may use Cloud Functions, Cloudflare Worker, or another approved trusted service.
2. **Webcam-based proctoring** — too complex, privacy concerns for junior high students
3. **IP/device fingerprinting** — privacy concerns, out of scope
4. **AI-based cheating detection** (ChatGPT usage detection, writing style analysis) — future consideration
5. **Question pools** (random selection from a larger bank) — separate feature, not anti-cheat
6. **Lockdown browser** — requires a native application, out of scope for a web platform
7. **Collusion detection** (comparing answer patterns between students) — deferred to Phase 3 / future PRD
8. **Student-visible integrity reports** — explicitly excluded; integrity data is teacher-only
9. **Mid-session anti-cheat config changes** — teacher sets everything before the test starts
10. **Automated punishments beyond auto-submit** — no score reduction, no account penalties

---

## 6. Design Considerations

### 6.1 Teacher Monitor — Student Card Enhancement

The existing `StudentProgressCard` component (glass variant card with avatar, name, status badge, progress bar, stats grid) MUST be extended with:

- **Integrity badge**: Small colored dot or icon next to the status badge area. It should NOT dominate the card — integrity is supplementary information.
  - Green dot (or no indicator): Clean
  - Amber dot + number: Warning (e.g., "⚠️ 2")
  - Red dot + number: Flagged (e.g., "🚩 5")

- **Action buttons**: Below the stats grid, a row of small action buttons:
  - "Force Submit" (red outline button, requires confirmation)
  - "Reset" (gray outline button, requires confirmation)
  - These ONLY appear when the test is in-progress

### 6.2 Session Start Modal (Anti-Cheat Config)

When the teacher clicks "Start" in `TeacherTestControlBar`, instead of immediately starting the test, a modal appears:

```
┌─────────────────────────────────────────────┐
│ Start Test — [Test Title]                    │
│                                              │
│ 🔒 Anti-Cheat Level                         │
│ ┌──────────────────────────────────────────┐ │
│ │ Standard                              ▼  │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ▸ Customize settings                         │
│   (expands to show individual toggles)       │
│                                              │
│         [Cancel]              [Start Test]   │
└─────────────────────────────────────────────┘
```

### 6.3 Homework Assignment Modal — Anti-Cheat Section

Within the existing homework assignment modal, a collapsed section:

```
│ 🔒 Anti-Cheat Settings ▸                    │
│ ─────────────────────────────────────────── │
│  (collapsed by default)                      │
│                                              │
│  When expanded:                              │
│  Level: [Standard ▼]                         │
│  ▸ Customize                                │
│    [✓] Tab-switch detection                 │
│    [✓] Copy/paste prevention                │
│    ...                                       │
│  [ ] Lock remaining attempts on auto-submit  │
```

### 6.4 Results Page — Integrity Detail Panel

On the teacher results page, each student row has a small integrity badge. On click:

```
┌──────────────────────────────────────────────┐
│ Integrity Report — Nguyễn Văn A              │
│ Risk: 🚩 HIGH                                │
├──────────────────────────────────────────────┤
│ Tab Switches       │ 5 (3 counted, 2 grace)  │
│ Time Away          │ 42 seconds               │
│ Copy Attempts      │ 2                        │
│ Paste Attempts     │ 0                        │
│ Fullscreen Exits   │ 1                        │
│ Force Submitted    │ ✅ By system (violation 5)│
├──────────────────────────────────────────────┤
│ Event Timeline:                               │
│ 14:02:15  Tab switch (8s) — counted ⚠️       │
│ 14:05:30  Copy attempt — logged              │
│ 14:07:12  Tab switch (2s) — grace ✓          │
│ 14:10:45  Tab switch (15s) — counted ⚠️      │
│ ...                                           │
└──────────────────────────────────────────────┘
```

---

## 7. Technical Considerations

### 7.1 Architecture

```
┌──────────────────────────────────────────────────┐
│ useTestIntegrity (hook)                          │
│ ├── Event Listeners (visibilitychange, blur, etc)│
│ ├── In-Memory Event Buffer                       │
│ ├── sessionStorage Mirror (crash recovery)       │
│ ├── Grace Period Calculator                      │
│ ├── Warning Manager (toast + modal triggers)     │
│ ├── Batch Writer (5-min interval → RTDB)         │
│ └── Config Reader (from AntiCheatConfig)         │
└──────────────────┬───────────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
    ▼              ▼              ▼
StudentTestPage  THCSPracticeView  StudentQuizPageNew
(IELTS Sessions) (Homework/Practice) (Quizzes)
```

### 7.2 Dependencies

- **Firebase RTDB** — for session integrity logging (existing dependency)
- **Firestore** — for homework integrity logging (existing dependency)
- **seedrandom** — for deterministic shuffling (existing dependency via `thcsShuffle.ts`)
- **No new dependencies required**

### 7.3 Firebase Spark Plan Constraints

- No Cloud Functions available on Spark; all PRD-0036 logic runs client-side unless a separate trusted backend such as the Reading V2 Worker is introduced.
- Answer key obfuscation (FR-51-53) is a client-side separation, not server-side protection
- Integrity logging increases RTDB writes by ~3-5 per student per test (batched), well within Spark limits
- Full server-side grading is explicitly deferred to a future PRD or approved trusted-backend implementation.

### 7.4 Performance Impact

- Event listeners are lightweight (passive listeners, no layout/paint impact)
- Batch writing reduces RTDB calls to ~1 write per 5 minutes per student
- `sessionStorage` mirror is synchronous but fast (< 1ms per write, small payloads)
- No impact on test rendering or answer input responsiveness

### 7.5 Existing Code Integration Points

| File | Change |
|---|---|
| `StudentTestPage.tsx` | Add `useTestIntegrity` hook, wrap content with anti-copy container |
| `THCSPracticeView.tsx` | Add `useTestIntegrity` hook (if homework context), add `useBeforeUnloadWarning` |
| `StudentQuizPageNew.jsx` | Add `useTestIntegrity` hook, add `useBeforeUnloadWarning` |
| `TeacherTestMonitorPage.tsx` | Add integrity badge to student cards, add force-submit/reset buttons, add refresh button |
| `StudentProgressCard.tsx` | Add integrity badge prop and display |
| `THCSStudentProgressCard.tsx` | Add integrity badge prop and display |
| `WritingMonitorCard.tsx` | Add integrity badge prop and display |
| `TeacherTestControlBar.tsx` | Modify "Start" button to open config modal instead of directly starting |
| `useTestSubmission.ts` | Flush integrity events on submission, include integrity data in results |
| `homeworkSubmissionService.ts` | Store integrity data on homework submission documents |
| `thcsShuffle.ts` | Extract shuffling logic to be reusable for IELTS tests |

### 7.6 Mobile Considerations

- `visibilitychange` fires on mobile for system interrupts (calls, notifications) — mitigated by the 5-second grace period + 2 free switches
- Fullscreen API is not well-supported on mobile Safari — fullscreen mode should gracefully degrade (log that fullscreen is unavailable, don't block the test)
- All thresholds apply equally to desktop and mobile — no device-specific logic
- Touch-based text selection on mobile is harder to prevent — `user-select: none` CSS handles most cases

---

## 8. Success Metrics

1. **Deterrence:** Reduction in average tab-switch count per test after rollout (measured by comparing pre/post integrity logs)
2. **Teacher adoption:** >50% of homework assignments use Standard or Strict anti-cheat within 2 weeks of launch
3. **False positive rate:** <5% of "High risk" flags are deemed false positives by teachers (measured by teacher reset rate)
4. **Performance:** Zero increase in test page load time or input latency (measured by Lighthouse, FCP/LCP)
5. **System reliability:** <1% of integrity events lost due to crashes (measured by `sessionStorage` recovery rate)

---

## 9. Open Questions

1. **Shuffle for IELTS Writing:** Should writing prompts be shuffled across students? (Writing tests have very few prompts — shuffling may be meaningless)
2. **Notification for nullified attempts:** When a student's remaining attempts are nullified, should the student see a toast explaining why, or just see "No remaining attempts" when they try again?
3. **Historical data:** Should integrity data from past tests be viewable in a student's academic record, or is it ephemeral (tied to the single test result)?
4. **Internationalization:** All warning messages are currently in English. Should they be in Vietnamese? (The app appears to be bilingual)

---

## 10. Implementation Phases

### Phase 1: Detection Foundation (Week 1-2)
- Create `useTestIntegrity` hook with all detection types
- Implement grace period system (5s + 2 free switches)
- Implement `sessionStorage` crash recovery
- Implement batched RTDB writes (5-min interval)
- Extend `useBeforeUnloadWarning` to THCS, Quiz, Homework surfaces
- Add copy/paste prevention (CSS + event handlers)
- Add `AntiCheatConfig` type and preset system

### Phase 2: Teacher UI & Controls (Week 3-4)
- Session start config modal (preset picker + customize)
- Homework assignment anti-cheat section (collapsed, preset + customize)
- Integrity badges on student cards (monitor + results)
- Expandable integrity detail panel on results page
- Force-submit + reset buttons on teacher monitor
- Refresh logs button on teacher monitor

### Phase 3: Fullscreen & Extended Protections (Week 5-6)
- Fullscreen mode implementation
- Extend question/option shuffling to IELTS tests
- Answer key obfuscation (separate fetch)
- `useTestCompletionCheck` extension to THCS homework
- Auto-submit with nullify-attempts option

### Future Phase (Requires Trusted Backend)
- Server-side grading via Cloud Functions, Cloudflare Worker, or another approved trusted service
- Answer keys in admin-only Firestore collection
- Time anomaly detection (Cloud Function post-analysis)
- Collusion detection (answer pattern comparison)
