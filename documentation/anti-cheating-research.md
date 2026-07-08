# Anti-Cheating Features Research

> **Date:** 2026-03-14
> **Status:** Research / Planning
>
> **2026-06-15 Reading V2 status:** This file is historical research. For current Reading V2 live-session/homework integration, use `documentation/architecture/changelog/reading-v2-runtime-integrations.md`. Reading V2 now reuses the platform anti-cheat hook/config, passes optional `integrityReport` through trusted submit, and persists telemetry for review/monitoring. The gap and roadmap tables below still describe older/global surfaces unless a row explicitly says Reading V2.
> **Scope:** All student assessment surfaces — Tests (IELTS), Quizzes, THCS Practice, Homework

---

## 1. Current Anti-Cheat Inventory

Before designing new features, here's what already exists in the codebase:

| Feature | Where | Coverage |
|---------|-------|----------|
| **Question & Option Shuffling** (`thcsShuffle.ts`) | THCS Practice only | Deterministic per-student shuffle using `seedrandom(uid + testId)`. Supports section-level question shuffle and MCQ option shuffle. Answer key is remapped. |
| **Before-Unload Warning** (`useBeforeUnloadWarning.ts`) | IELTS Tests, Reading, Listening | Browser prompt on close/refresh during active test. Not on THCS Practice or Quiz. |
| **Re-entry Prevention** (`useTestCompletionCheck.ts`) | IELTS Tests, Reading, Listening | Checks `hasCompletedTest` flag in RTDB. Redirects if already submitted. Not on THCS Practice or Homework. |
| **Auto-save + Submission Lock** (`useTestSubmission.ts`) | IELTS Tests | Answers saved to RTDB in real-time. `submittedAt` timestamp prevents re-submission. |
| **Input Locking (Grace Period)** | IELTS Tests (PRD-0019) | Locks answer inputs during the 5-second grace period before auto-submit. |

### Gaps Identified

Historical note: the gap rows below are obsolete for Reading V2 live-session/homework surfaces as of 2026-06-15 where they mention tab-switch detection, fullscreen enforcement, copy/paste prevention, visibility tracking, or server-side answer validation. Those Reading V2 surfaces use `useTestIntegrity` through their runtime hosts and submit through the trusted Reading V2 endpoint. The rows may still apply to other legacy assessment surfaces.

| Gap | Description |
|-----|-------------|
| ❌ **No tab-switch detection** | Students can freely switch tabs to search answers or use ChatGPT |
| ❌ **No fullscreen enforcement** | No locked-down viewing mode for high-stakes tests |
| ❌ **No copy/paste prevention** | Questions can be copied out; answers can be pasted in |
| ❌ **No visibility tracking** | No logging of how many times a student leaves the test window |
| ❌ **No right-click/dev-tools deterrent** | Students can inspect elements to find answers in page source |
| ❌ **No server-side answer validation** | All grading happens client-side; answers could theoretically be manipulated |
| ❌ **No IP/device fingerprinting** | Same student could have multiple sessions from different devices |
| ❌ **No time anomaly detection** | Suspiciously fast completions go unnoticed |
| ❌ **THCS has no re-entry prevention** | Students can restart THCS practice tests |
| ❌ **Quiz has no beforeUnload warning** | `StudentQuizPageNew` has no exit protection |
| ❌ **No shuffle for IELTS tests** | Only THCS tests have question/option shuffling |

---

## 2. Feature Categories (Tiered by Effort)

### 🟢 Tier 1 — Quick Wins (1-3 days each)

These use standard browser APIs with minimal backend changes.

#### 2.1 Tab-Switch / Visibility Detection
**API:** `document.addEventListener('visibilitychange')` + `document.hidden`

**How it works:**
- When the student switches tabs, minimizes browser, or opens another app, the `visibilitychange` event fires
- Log each switch with timestamp to RTDB under `players/{id}/tabSwitches`
- Show a warning toast after first switch
- Auto-submit or flag after N switches (configurable by teacher)

**Data structure:**
```json
{
  "players": {
    "studentId": {
      "tabSwitches": [
        { "leftAt": 1710000001000, "returnedAt": 1710000004000, "durationMs": 3000 },
        { "leftAt": 1710000010000, "returnedAt": 1710000012000, "durationMs": 2000 }
      ],
      "tabSwitchCount": 2,
      "totalTimeAway": 5000
    }
  }
}
```

**Teacher view:** Badge/icon on results page showing "⚠️ Left test 3 times (12s total)"

**Effort:** ~1-2 days

---

#### 2.2 Copy/Paste/Right-Click Prevention
**APIs:** `oncopy`, `oncut`, `onpaste`, `oncontextmenu`, `onselectstart`

**How it works:**
- Prevent default on copy/paste events on the test container
- Disable right-click context menu
- Disable text selection on passage/question areas
- Log any attempts to RTDB (copy attempt counter)

**Implementation:**
```jsx
// Hook: useAntiCopyPaste
onCopy={(e) => { e.preventDefault(); logEvent('copy_attempt'); }}
onPaste={(e) => { e.preventDefault(); logEvent('paste_attempt'); }}
onContextMenu={(e) => { e.preventDefault(); }}
style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
```

**Caveat:** Can be bypassed via DevTools. This is a deterrent, not a hard block.

**Effort:** ~1 day

---

#### 2.3 Extend Existing Protections to All Surfaces

Apply existing hooks to surfaces that lack them:

| Hook | Add to |
|------|--------|
| `useBeforeUnloadWarning` | THCS Practice, Quiz Page, Homework |
| `useTestCompletionCheck` | THCS Practice (prevent re-entry during homework) |
| Question Shuffling | IELTS tests (shuffle question order per student) |

**Effort:** ~1 day

---

### 🟡 Tier 2 — Medium Effort (3-7 days each)

#### 2.4 Fullscreen Mode (Soft Lockdown)
**API:** `Element.requestFullscreen()` + `document.fullscreenElement`

**How it works:**
1. When test starts, prompt student to enter fullscreen
2. Monitor `fullscreenchange` event
3. If student exits fullscreen:
   - Show warning overlay
   - Log event to RTDB
   - After N exits, auto-submit or flag
4. For homework: optional (teacher toggle)
5. For live tests: required (enforced)

**Teacher config (per homework/test):**
```typescript
interface AntiCheatConfig {
  requireFullscreen: boolean;
  maxTabSwitches: number;      // 0 = unlimited, 3 = default
  tabSwitchAction: 'warn' | 'flag' | 'auto-submit';
  disableCopyPaste: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  timeLimit: number;           // already exists
}
```

**UI:** Full-screen overlay with "Click to enter fullscreen" + dim background. If exited, semi-transparent red overlay: "⚠️ Please return to fullscreen mode"

**Effort:** ~3-4 days

---

#### 2.5 Focus/Blur + Window Activity Monitor
**APIs:** `window.addEventListener('blur')` + `window.addEventListener('focus')`

**Complements** the `visibilitychange` approach by also detecting:
- Alt+Tab to other applications (not just other tabs)
- OS-level focus changes

**Combined hook: `useTestIntegrity`**
```typescript
interface IntegrityEvent {
  type: 'tab_switch' | 'blur' | 'fullscreen_exit' | 'copy_attempt' | 'paste_attempt' | 'right_click';
  timestamp: number;
  durationMs?: number;  // for tab switches
}

// Consolidated hook that wraps all detection
function useTestIntegrity(options: {
  sessionCode: string;
  playerId: string;
  enabled: boolean;
  config: AntiCheatConfig;
}): {
  events: IntegrityEvent[];
  warnings: number;
  isViolation: boolean;
}
```

**Effort:** ~3 days

---

#### 2.6 Time Anomaly Detection (Server-Side)
**Where:** Cloud Function or post-submission analysis

**What to detect:**
- Completion time significantly below average (< 20% of allotted time with high score)
- Identical answer patterns between students (collusion detection)
- Answer changes in rapid succession (suggesting external lookup)

**Implementation approach:**
- On test submission, a Cloud Function compares the student's time-per-question against class averages
- Flag results where `timeSpent < expectedMinimum AND score > threshold`
- Store flags in `test_results/{id}/integrityFlags`

**Teacher view:** "🚩 Integrity Concern: Completed in 3 min (class avg: 25 min) with 95% score"

**Effort:** ~5 days (requires Cloud Function)

---

### 🔴 Tier 3 — High Effort (1-3 weeks each)

#### 2.7 Server-Side Answer Key Protection
**Current problem:** All test data including correct answers is sent to the client for grading.

**Solution architecture:**
1. **Split data delivery:** Send questions WITHOUT correct answers to the client
2. **Server-side grading:** Student submits answers → Cloud Function scores against hidden answer key
3. **Secure storage:** Answer keys stored in a Firestore collection with admin-only read access

**Impact:**
- Requires refactoring `useTestSubmission`, `markThcsTest`, `scoreQuestion`
- Client-side grading becomes server-side grading
- Results page needs to wait for async grading result
- Auto-save still works (saves student answers), but scoring is deferred

**Effort:** ~2-3 weeks (major architectural change)

---

#### 2.8 Browser Lockdown Mode (Progressive Web App)
**Concept:** Using Service Workers + PWA capabilities:
- Disable back/forward navigation
- Intercept all URL navigation attempts
- Block keyboard shortcuts (Ctrl+C, Ctrl+V, Alt+Tab via API limitations)
- Detect DevTools opening (indirect methods: `debugger` timing, window size changes)

**Limitations:**
- Cannot truly lock down a browser from JavaScript alone
- Dedicated lockdown browsers (Respondus) are the only real solution for high-stakes
- PWA approach is a strong deterrent but not foolproof

**Effort:** ~2 weeks

---

#### 2.9 Webcam-Based Remote Proctoring
**Concept:** Use the webcam to monitor the test-taker

**Features:**
- Face detection: ensure student is present
- Multiple face detection: flag if second person appears
- Gaze tracking: detect if student frequently looks away
- Periodic snapshots saved to Cloud Storage

**Technology:** MediaDevices API + TensorFlow.js face-detection model

**Effort:** ~3+ weeks (complex, privacy concerns, infra costs)

> [!CAUTION]
> This is likely overkill for the current project scope and introduces significant privacy and legal considerations, especially for a Vietnamese education platform targeting junior high students.

---

## 3. Recommended Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
> Low effort, immediate value

1. **Create `useTestIntegrity` hook** — consolidates tab-switch, focus/blur, copy/paste detection
2. **Extend `useBeforeUnloadWarning`** to THCS Practice, Quiz, and Homework surfaces
3. **Add `disableCopyPaste`** CSS + event handlers to all test surfaces
4. **Add tab-switch logging** — write to RTDB under `players/{id}/integrityLog`
5. **Extend shuffling** — enable for IELTS tests (not just THCS)

### Phase 2: Fullscreen + Teacher Controls (Week 3-4)
> Medium effort, strong deterrent

6. **Fullscreen enforcement mode** — teacher-toggleable per assignment
7. **`AntiCheatConfig`** data model — add to homework and test session schemas
8. **Teacher dashboard integration** — show integrity flags on results/submissions
9. **Student warning system** — progressive warnings → auto-submit

### Phase 3: Server-Side Security (Week 5-8)
> High effort, closes the biggest vulnerability

10. **Answer key separation** — queries without correct answers for client
11. **Cloud Function grading** — server-side scoring endpoint
12. **Time anomaly detection** — flag suspicious completion times
13. **Collusion detection** — compare answer patterns across students

---

### 2026-06-15 Reading V2 Implementation Status

Reading V2 live-session and homework runs have the foundation wired through existing platform primitives:

- `useTestIntegrity` handles tab/focus/fullscreen/copy/paste/right-click telemetry and auto-submit triggers.
- Live sessions read anti-cheat config from `game_sessions/{sessionCode}.antiCheatConfig`.
- Homework reads anti-cheat config from `homework_assignments/{homeworkId}.antiCheatConfig`.
- Trusted Reading V2 submit accepts optional `integrityReport` and persists it with attempt/result review data.
- "Cloud Function grading" is obsolete wording for Reading V2. Active production path is the trusted Worker-backed Reading V2 submit flow.

---

## 4. Data Model Additions

### 4.1 Integrity Tracking (RTDB)
```
game_sessions/{sessionCode}/players/{playerId}/integrity/
  ├── tabSwitchCount: number
  ├── totalTimeAway: number (ms)
  ├── fullscreenExitCount: number
  ├── copyAttempts: number
  ├── pasteAttempts: number
  ├── events: [
  │     { type: string, timestamp: number, durationMs?: number }
  │   ]
  └── flags: string[]  // e.g., ["excessive_tab_switches", "fast_completion"]
```

### 4.2 Anti-Cheat Config (Firestore — on homework/test)
```typescript
interface AntiCheatConfig {
  enableFullscreen: boolean;       // default: false
  enableTabSwitchDetection: boolean; // default: true
  maxTabSwitches: number | null;   // null = unlimited, default: null
  tabSwitchAction: 'warn' | 'flag' | 'auto-submit';  // default: 'warn'
  disableCopyPaste: boolean;       // default: true
  shuffleQuestions: boolean;       // default: false
  shuffleOptions: boolean;         // default: false
  requireFaceVerification: boolean; // Phase 3+, default: false (not MVP)
}
```

### 4.3 Integrity Report (Firestore — on test_results)
```typescript
interface IntegrityReport {
  tabSwitchCount: number;
  totalTimeAway: number;
  fullscreenExitCount: number;
  copyAttempts: number;
  completionTimeSeconds: number;
  averageCompletionTimeSeconds: number;  // class average
  flags: IntegrityFlag[];
  riskLevel: 'low' | 'medium' | 'high';  // computed
}

type IntegrityFlag =
  | 'excessive_tab_switches'
  | 'fast_completion'
  | 'copy_paste_detected'
  | 'fullscreen_violation'
  | 'answer_pattern_match'
  | 'time_anomaly';
```

---

### 4.4 Current Reading V2 Data Contract

For Reading V2, use canonical types in `src/types/integrity.types.ts`:

- `AntiCheatConfig`
- `IntegrityReport`

Live-session telemetry still flows through existing `game_sessions/{sessionCode}/players/{playerId}` integrity hook paths before submit. Homework telemetry is carried through trusted Reading V2 submit as optional `integrityReport`. Backend preserves report for review/monitoring and does not trust it for scoring.

## 5. Technical Considerations

### Browser API Limitations
| Technique | Can Bypass? | How? |
|-----------|-------------|------|
| `visibilitychange` | ✅ Partially | Two monitors, phone, physical notes |
| Copy/paste prevention | ✅ Yes | DevTools console, extensions |
| Fullscreen enforcement | ✅ Yes | Can exit with ESC + ignore warning |
| Right-click disable | ✅ Yes | DevTools, keyboard shortcut F12 |
| Server-side grading | ❌ Hard | Would need to reverse-engineer the API |

> [!IMPORTANT]
> **No client-side anti-cheat is foolproof.** The goal is:
> 1. **Deter casual cheating** (the majority of students)
> 2. **Log suspicious behavior** for teacher review
> 3. **Make it inconvenient** enough that studying is easier than cheating
>
> For truly high-stakes exams, server-side answer protection (Tier 3) is the only real defense.

### Mobile Considerations
- Fullscreen API is not well-supported on mobile Safari
- `visibilitychange` works on mobile but can fire for system interrupts (calls, notifications)
- Need to distinguish between "cheating" triggers and legitimate interruptions
- Recommended: use grace period (3-5 seconds) before flagging tab switches

### Firebase Costs
- Integrity logging increases RTDB writes (~5-20 extra writes per test per student)
- Cloud Function grading adds compute costs per submission
- Estimate: negligible for current scale (< 1000 concurrent students)

---

## 6. UI/UX Mockup Concepts

### Student Warning Flow
```
[Test starts] → [Enters fullscreen]
      ↓
[Student presses Alt+Tab or switches tab]
      ↓
[Warning overlay appears: "⚠️ You left the test window. Violation 1/3. Return immediately."]
      ↓
[Student returns → overlay auto-dismisses after 2s]
      ↓
[3rd violation → "Your test will be auto-submitted. This action has been logged."]
      ↓
[Auto-submit + flag in teacher results]
```

### Teacher Config UI (Homework/Test Creation)
```
┌─────────────────────────────────────────┐
│ 🔒 Anti-Cheating Settings              │
│                                         │
│ [✓] Detect tab switching               │
│     Max switches before action: [3]     │
│     Action: [Warn ▾] / Flag / Auto-submit│
│                                         │
│ [✓] Disable copy/paste                 │
│ [ ] Require fullscreen mode            │
│ [✓] Shuffle question order             │
│ [✓] Shuffle answer options             │
│                                         │
│ ── Advanced ──                          │
│ [ ] Flag fast completions (< 20% avg)  │
│ [ ] Detect similar answer patterns     │
└─────────────────────────────────────────┘
```

### Teacher Results View
```
┌───────────────────────────────────────────────┐
│ Student: Nguyễn Văn A     Score: 8/10 (80%)  │
│ Time: 12:34               Status: ✅ Clean    │
├───────────────────────────────────────────────┤
│ Student: Trần Thị B       Score: 10/10 (100%)│
│ Time: 3:12                Status: 🚩 Flagged  │
│ → Tab switches: 5 (14s away)                  │
│ → Completion time: 3 min (avg: 25 min)        │
│ → Copy attempts: 2                            │
├───────────────────────────────────────────────┤
│ Student: Lê Hoàng C       Score: 9/10 (90%)  │
│ Time: 22:15               Status: ⚠️ Warning  │
│ → Tab switches: 1 (2s away)                   │
└───────────────────────────────────────────────┘
```

---

## 7. Competitive Analysis

| Feature | Kahoot | Google Forms | Canvas + LockDown | Our Platform |
|---------|--------|-------------|-------------------|--------------|
| Tab-switch detection | ❌ | ❌ | ✅ | ❌ → 🟢 Phase 1 |
| Fullscreen lockdown | ❌ | ❌ | ✅ (Respondus) | ❌ → 🟡 Phase 2 |
| Question shuffling | ✅ | ✅ | ✅ | ⚠️ THCS only → 🟢 Phase 1 |
| Copy/paste prevention | ❌ | ❌ | ✅ | ❌ → 🟢 Phase 1 |
| Server-side grading | ✅ | ✅ | ✅ | ❌ → 🔴 Phase 3 |
| Time anomaly detection | ❌ | ❌ | ❌ | ❌ → 🟡 Phase 2-3 |
| Webcam proctoring | ❌ | ❌ | ✅ (addon) | N/A (out of scope) |

---

## 8. Open Questions for Decision

1. **Scope:** Should anti-cheat apply to ALL test surfaces or just homework/live tests?
2. **Default config:** Should anti-cheat features be on by default, or opt-in per assignment?
3. **Student communication:** Should students see their own integrity report after submission?
4. **Server-side grading:** Is the architectural refactor worth the effort for current project scale?
5. **Mobile:** How do we handle legitimate interrupts (phone calls) vs. cheating on mobile devices?
6. **Privacy:** Do teachers need to consent to logging student behavior? (Vietnamese education law)

### Reading V2 Resolved Decisions

- Scope: Reading V2 anti-cheat is active for live sessions and homework when config exists. Solo/public/course practice remain off unless a future owner adds explicit config.
- Default config: missing Reading V2 config means off.
- Server-side grading: Reading V2 uses trusted submit against canonical/review data, not client scoring and not a new Cloud Function grading path.

---

## References

- [MDN: Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
- [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [Firebase Security Rules](https://firebase.google.com/docs/database/security)
- [Respondus LockDown Browser](https://www.respondus.com/products/lockdown-browser/)
- [Safe Exam Browser](https://safeexambrowser.org/)
