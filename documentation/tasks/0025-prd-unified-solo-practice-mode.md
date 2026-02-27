# PRD: Unified Solo Practice Mode

> **PRD Number:** 0025  
> **Status:** Draft  
> **Created:** 2026-02-23  
> **Author:** Antigravity AI (via Discovery Session)  
> **Depends on:** PRD-0016 (Solo Study & Homework System), PRD-0018 (Unified Audio Architecture), PRD-0019 (Test Duration & End Flow)

---

## 1. Introduction/Overview

### Problem Statement

PRD-0016 introduced a `StudentSoloTestPage` as a separate page for self-paced practice. However, this page was **incomplete** — it only renders `IELTSQuestionsPanel` without:

- `PassageRenderer` (no passage displayed for Reading tests)
- `TwoColumnLayout` (no split view)
- `InspiraFooterNav` (no passage/question navigator)
- `TestHeader` (basic Mantine Paper instead of polished header)
- No connection monitoring, no before-unload warning, no TimeUp overlay

The result is a broken experience where Reading tests show questions without the reading passage, and the overall UI is inconsistent with the battle-tested `StudentTestPage`.

### Solution

**Adapt `StudentTestPage` for dual-mode operation** (live session + solo practice) so that students get the **exact same polished test-taking experience** regardless of entry context. Solo session management happens internally — students simply click "Start" and the test opens.

### Key Architectural Decision

**No session record is created.** Unlike live sessions which use `game_sessions/`, solo practice loads the test directly from `tests/{materialId}` and saves results directly to `test_results/` with a context tag. This avoids polluting `game_sessions` with fake records and eliminates coupling to teacher monitoring infrastructure.

---

## 2. Goals

| # | Goal | Success Metric |
|---|------|---------------|
| G1 | Students practice with the same UI as live tests | Zero visual differences between live and solo test-taking |
| G2 | Solo sessions work for Reading and Listening tests | Both skill types render correctly with all components |
| G3 | Teachers control practice settings at course/module/material level | Settings cascade works: Material > Module > Course > Material Owner Default |
| G4 | Results integrate into existing tracking | Solo results appear in Records tab with context badge |
| G5 | Course progress updates on passing score | Material marked complete when student meets minimum score |
| G6 | Cleanup legacy solo infrastructure | `StudentSoloTestPage`, `useSoloSession`, `soloSessionManager` deleted |

---

## 3. User Stories

### 3.1 Student — Solo Practice

#### US-1: Start Solo Practice from Course
> **As a student**, I want to click "Start" on a course material and immediately enter the test with the same interface as a live session, so that my practice experience matches the real test.

**Acceptance Criteria:**
- Clicking "Start" on a material in `StudentCourseDetailPage` opens `StudentTestPage` in solo mode
- The test loads directly from `tests/{materialId}` (no session record created)
- Two-column layout shows passage (left) and questions (right) for Reading tests
- Audio plays with full controls for Listening tests (unless teacher restricts)
- Header shows test title + "Solo Practice" badge in top-left
- If incomplete session exists for this material, a modal asks "Resume or Start New?"
- Timer runs according to teacher settings (or material default if no override)

#### US-2: Start Solo Practice from Library
> **As a student**, I want to start practice from the Student Library with the same experience.

**Acceptance Criteria:**
- Same behavior as US-1 but entry point is `StudentLibraryPage`
- Context tag is `self_study` (not `course_material`)
- No course-level teacher settings apply — settings sourced from `MaterialSoloConfig.defaults` (timerMinutes, feedbackTiming) set by the material owner
- Student has full control over all settings (no teacher lockouts)

#### US-3: Submit Solo Practice
> **As a student**, I want to submit my solo test and see results in my Records tab, so that I can track my practice history.

**Acceptance Criteria:**
- On submission, test is auto-marked (same `scoreQuestion` logic as live tests)
- Result is saved to `test_results/` with `context.type = 'course_material'` or `'self_study'`
- Student is navigated to Student Dashboard → Records tab
- Result detail modal opens automatically in the middle column showing score, band, question-by-question results
- Result respects `feedbackTiming` setting (if `'never'`, only score is shown, not answers)
- Course progress updates if score meets minimum threshold (set by teacher)

#### US-4: Student Settings in Solo Mode
> **As a student**, I want to access display settings (font size, line spacing, highlighter) during solo practice via a hamburger menu.

**Acceptance Criteria:**
- Hamburger icon (☰) in top-right of `TestHeader` (visible only in solo mode)
- Opens a settings modal with available controls
- Settings locked by teacher are greyed out and uninteractable with a tooltip: "Set by teacher"
- Reading settings: font size, line spacing, highlighter, show timer, dark mode
- Listening settings (in addition): audio speed, replay section, skip to section, pause audio
- Settings persist in `localStorage` for the student across sessions

#### US-5: Resume Incomplete Session
> **As a student**, I want to be prompted to resume or restart when I have an unfinished practice session.

**Acceptance Criteria:**
- When clicking "Start" on a material with an incomplete session, a modal shows:
  - "You have an in-progress session from [date]. X/Y questions answered."
  - Two buttons: "Resume" and "Start New"
- "Resume" restores answers and timer position
- "Start New" creates a fresh attempt
- Incomplete sessions are stored in `localStorage` (keyed by `materialId + studentId`)

---

### 3.2 Teacher — Practice Settings

#### US-6: Configure Practice Settings at Course Level
> **As a teacher**, I want to set default practice settings for my entire course, so that I don't have to configure each material individually.

**Acceptance Criteria:**
- "Practice Settings" tab in `TeacherCourseProfilePage`
- Settings apply to all materials in the course unless overridden at module/material level
- Available settings: see section 4.3

#### US-7: Override Settings at Module Level
> **As a teacher**, I want to override course-level settings for a specific module.

**Acceptance Criteria:**
- Gear icon next to each module in the course editor
- Opens a settings modal pre-filled with course-level defaults
- Changed fields show a "Custom" badge; unchanged fields show "Inheriting from course"

#### US-8: Override Settings at Material Level
> **As a teacher**, I want to override module- or course-level settings for a specific material.

**Acceptance Criteria:**
- Gear icon next to each material in the module editor
- Same modal as module-level, pre-filled with resolved settings (module > course)
- Changed fields show "Custom"; unchanged show "Inheriting from [module/course]"

#### US-9: Configure Settings When Adding Materials
> **As a teacher**, I want to see and optionally configure practice settings when adding a material to a course module.

**Acceptance Criteria:**
- When adding a material to a module, a settings section appears in the add dialog
- Pre-filled with course/module defaults
- Teacher can adjust or leave as inherited

---

### 3.3 Result Integration

#### US-10: View Solo Results in Records Tab
> **As a student**, I want to see all my solo practice results in the Records tab alongside live session results.

**Acceptance Criteria:**
- Records tab shows results from all contexts: live, homework, solo practice, course material
- Each result has a context badge: 🏫 Live | 📋 Homework | 📖 Practice | 📚 Course
- Results can be filtered by context type
- Clicking a result opens the result detail modal in the middle column (not a separate page)

#### US-11: Result Detail Modal in Records Tab
> **As a student**, I want to click on any result in the Records tab and see details in a modal within the 3-column layout.

**Acceptance Criteria:**
- Result detail opens in the middle column with a navigation bar on top
- Navigation bar contains: ← Back button (returns to results list), result title, context badge (Practice/Live/Homework)
- Shows: score, band score, percentage, time spent, question-by-question breakdown
- For results where `feedbackTiming = 'after_completion'`: shows correct answers
- For results where `feedbackTiming = 'never'`: shows only score, no answer details
- Close/Back button returns to the results list
- **This replaces ALL existing result click handlers** — clicking any result in Records tab now opens this modal instead of navigating to a separate page

---

## 4. Functional Requirements

### 4.1 Dual-Mode StudentTestPage

| # | Requirement |
|---|-------------|
| FR-1 | `StudentTestPage` must detect solo mode from route/state and behave accordingly |
| FR-2 | In solo mode, test data must be loaded directly from `tests/{materialId}` via `getTestFromFirebase()`, NOT from `game_sessions/` |
| FR-3 | In solo mode, student identity must be sourced from `useAuth()` (user.uid, user.displayName), NOT from `sessionService` |
| FR-4 | In solo mode, the following hooks must be SKIPPED: `useTestSession`, `useTeacherEndRedirect`, `ConnectionMonitor`, `useTestAutoSave` (game session version) |
| FR-5 | In solo mode, the following must be KEPT: `TwoColumnLayout`, `PassageRenderer`, `IELTSQuestionsPanel`, `TestHeader`, `InspiraFooterNav`, `useBeforeUnloadWarning` |
| FR-6 | In solo mode, `TestHeader` must show "Solo Practice" badge, hamburger menu icon, and use `useAuth()` for student name |
| FR-7 | In solo mode, the timer must use either the teacher's override setting or the material's default `duration` field |
| FR-8 | In solo mode, auto-save must save to `localStorage` (keyed by `materialId + studentId`), NOT to Firebase `game_sessions/` |

### 4.2 Solo-Specific Hooks (NEW)

| # | Requirement |
|---|-------------|
| FR-9 | Create `useSoloTestData(materialId)` hook: loads test from `tests/{materialId}` via `getTestFromFirebase()`. Sets `activePassageId` to first passage. No real-time listener needed. |
| FR-10 | Create `useSoloTimer(durationMinutes, { allowPause })` hook: standalone countdown timer. Supports pause/resume if allowed. Triggers auto-submit on timeout. |
| FR-11 | Create `useSoloSubmission(testData, answers, context)` hook: marks test using `scoreQuestion()`, saves to `test_results/` with `ResultContext`, navigates to Records tab with result modal. |
| FR-12 | Create `useSoloAutoSave(materialId, studentId, answers, currentQuestion)` hook: saves progress to `localStorage` every 30 seconds. |
| FR-13 | Create `useSoloResume(materialId, studentId)` hook: checks `localStorage` for incomplete session, returns saved state or null. |

### 4.3 Teacher Practice Settings

| # | Requirement |
|---|-------------|
| FR-14 | The system must support a `PracticeSettings` object at course, module, and material levels |
| FR-15 | Settings cascade: Material-level > Module-level > Course-level > Material Owner Default |
| FR-16 | If no settings are configured at any level, the material's original `duration`, `feedbackTiming: 'after_completion'`, and `allowPause: true` are used |

**`PracticeSettings` schema:**

```typescript
interface PracticeSettings {
  // General settings
  enabled: boolean;                // Allow practice for this scope
  timerMinutes: number | null | 'default';  // null = no timer, 'default' = inherit
  feedbackTiming: 'immediate' | 'after_completion' | 'never' | 'default';
  maxAttempts: number | null;      // null = unlimited
  allowPause: boolean | 'default';
  minPassingScore: number | null;  // Percentage (0-100). null = no threshold for course progress

  // Reading-specific overrides (for future extensibility)
  reading?: {
    showTimer: boolean | 'default';  // Whether timer is visible (student can toggle if not locked)
  };

  // Listening-specific overrides
  listening?: {
    allowReplay: boolean | 'default';
    maxReplays: number | null;     // null = unlimited
    allowSpeedControl: boolean | 'default';
    allowSkipSection: boolean | 'default';
    allowPauseAudio: boolean | 'default';
  };
}
```

> **Skill-Specific Separation:** The teacher settings UI must show Reading-specific and Listening-specific sections separately. When a material's skill is known, only the relevant section is shown. At course/module level (where materials may be mixed), both sections are shown.

| # | Requirement |
|---|-------------|
| FR-17 | `PracticeSettings` must be stored at: `courses/{courseId}/practiceSettings`, `courses/{courseId}/modules/{moduleId}/practiceSettings`, `courses/{courseId}/modules/{moduleId}/materials/{materialId}/practiceSettings` |
| FR-18 | A `resolvePracticeSettings(courseId, moduleId, materialId)` function must merge settings using the cascade, returning fully resolved settings with no `'default'` values. **Timer resolution order:** Material-level `timerMinutes` > Module-level > Course-level > `testData.duration` from the test record (the value set when the test was created). |
| FR-19 | Settings UI must show inheritance: "Inheriting from [course/module]" for unchanged fields, "Custom" badge for overridden fields |
| FR-20 | When adding a material to a module, the add dialog must show practice settings pre-filled with inherited defaults |
| FR-20a | When `PracticeSettings.enabled === false` for a material (at any cascade level), the "Start" button must be hidden or disabled with tooltip: "Practice not available for this material" |
| FR-20b | When `PracticeSettings.maxAttempts` is set and the student has `>= maxAttempts` completed results for this material, the "Start" button must be disabled with message: "Maximum attempts reached (X/Y)" |
| FR-20c | Teacher settings UI must display Reading-specific and Listening-specific sections separately. At material level, show only the relevant skill section. At course/module level, show both sections. |

### 4.4 Student Settings (Hamburger Menu)

| # | Requirement |
|---|-------------|
| FR-21 | Hamburger icon must appear in `TestHeader` only when `mode === 'solo'` |
| FR-22 | Clicking hamburger opens a `SoloSettingsModal` |
| FR-23 | Modal displays available settings based on test skill (Reading vs Listening) |
| FR-24 | Settings locked by teacher are greyed out with tooltip "Set by teacher". The modal receives `resolvedPracticeSettings` as a prop to determine which fields are teacher-locked (any field where the resolved value differs from `'default'` and was set at course/module/material level by teacher). |
| FR-25 | Student settings persist in `localStorage` under key `solo_student_prefs_{studentId}` |

**Reading test student settings:**

| Setting | Key | Default | Teacher can lock? |
|---------|-----|---------|:-:|
| Font size | `fontSize` | 16px | No |
| Line spacing | `lineSpacing` | 1.5 | No |
| Highlighter tool | `highlighterEnabled` | true | No |
| Show timer | `showTimer` | true | Yes (via `PracticeSettings`) |
| Dark mode | `darkMode` | false | No |

**Listening test student settings (additional):**

| Setting | Key | Default | Teacher can lock? |
|---------|-----|---------|:-:|
| Audio speed | `audioSpeed` | 1.0x | Yes (`listening.allowSpeedControl`) |
| Replay section | `allowReplay` | true | Yes (`listening.allowReplay`) |
| Max replays | `maxReplays` | unlimited | Yes (`listening.maxReplays`) |
| Skip to section | `skipSection` | true | Yes (`listening.allowSkipSection`) |
| Pause audio | `pauseAudio` | true | Yes (`listening.allowPauseAudio`) |

### 4.5 Result Submission & Storage

| # | Requirement |
|---|-------------|
| FR-26 | Solo practice results must be saved to the same `test_results/` collection as live session results |
| FR-27 | Results must include `ResultContext` with `type: 'course_material'` (from course) or `type: 'self_study'` (from library) |
| FR-28 | Results must include the resolved `configApplied` showing what timer/feedback/source settings were used |
| FR-29 | After submission, navigate to Student Dashboard → Records tab with the result detail modal open |
| FR-29a | All existing result click handlers in the Records tab must be refactored from "navigate to separate page" to "open `ResultDetailModal` in middle column". This change applies to ALL result types (live, homework, solo), not just solo results. |
| FR-30 | Badges and attendance must NOT be awarded for solo practice results |
| FR-31 | Email notifications must NOT be sent for solo practice results |

### 4.6 Course Progress Integration

| # | Requirement |
|---|-------------|
| FR-32 | When a student completes a solo practice test for a course material and scores >= `minPassingScore`, the material must be marked as completed in course progress |
| FR-33 | If `minPassingScore` is null (not set), solo practice does NOT affect course progress |
| FR-34 | Course progress percentage must update to reflect newly completed materials |
| FR-35 | If a material is already completed, subsequent practice does NOT un-complete it (even if scoring lower) |

### 4.7 Resume Session

| # | Requirement |
|---|-------------|
| FR-36 | In-progress solo sessions must be persisted in `localStorage` with key `solo_progress_{materialId}_{studentId}` |
| FR-37 | Stored data: `{ answers, currentQuestion, timeElapsed, startedAt, lastSavedAt }` |
| FR-38 | When clicking "Start" on a material with saved progress, a modal must appear with "Resume" and "Start New" options |
| FR-39 | "Resume" restores all saved state including answers and timer position |
| FR-40 | "Start New" deletes the saved progress and starts fresh |
| FR-41 | Saved progress expires after 7 days (auto-cleanup) |

### 4.8 Audio in Solo Listening Tests

| # | Requirement |
|---|-------------|
| FR-42 | In solo mode, Listening tests must use `AudioPlayerMode: 'solo'` (already defined in `audio.types.ts`) |
| FR-43 | Audio must auto-play when the test starts |
| FR-44 | Student gets full audio controls (play, pause, seek, speed, replay, skip section) unless restricted by teacher's `PracticeSettings.listening` |
| FR-45 | No `masterAudioState` sync — student has full local control |
| FR-46 | No `headphoneRequest` system — irrelevant in solo mode |

### 4.9 Cleanup

| # | Requirement |
|---|-------------|
| FR-47 | Delete `StudentSoloTestPage.tsx` |
| FR-48 | Delete `useSoloSession.ts` |
| FR-49 | Delete `soloSessionManager.ts` |
| FR-50 | Remove route `/student/solo-test/:materialId` from `App.jsx` (replace with new solo-mode route). **Note:** Verified that `StudentSoloTestPage` is NOT currently registered in `App.jsx` routes, so this may be a no-op — confirm during implementation. |
| FR-51 | ~~Remove route `/student/homework/:homeworkId/test`~~ — **REMOVED (GAP-9 fix): This route does not exist in `App.jsx`.** No action needed. |
| FR-52 | Keep `solo.types.ts` — it defines `MaterialSoloConfig`, `ResultContext`, and other types used by homework, results, and library systems |
| FR-53 | Remove the `solo_sessions` security rules from `database.rules.json` |

---

## 5. Non-Goals (Out of Scope)

| Non-Goal | Reason |
|----------|--------|
| Writing test solo practice | Writing submission/grading not yet implemented (placeholder only) |
| AI-powered diagnostics for solo results | Future enhancement |
| Rate limiting / abuse prevention | Not needed for now — unlimited retakes allowed |
| Peer comparison / leaderboards | Future gamification feature |
| Real-time teacher monitoring of solo sessions | Solo is explicitly unsupervised |
| Solo practice for homework assignments | Homework has its own flow and submission system |

---

## 6. Design Considerations

### 6.1 Route Design

| Route | Mode | Load From |
|-------|------|-----------|
| `/student-test/:sessionCode` | Live (existing) | `game_sessions/{code}` → `tests/{testId}` |
| `/student/practice/:materialId` | Solo Practice (NEW) | `tests/{materialId}` directly |

The new route replaces the old `/student/solo-test/:materialId` route.

### 6.2 Mode Detection in StudentTestPage

`StudentTestPage` determines its mode from the route:

```
/student-test/:sessionCode   → mode = 'live'    → use existing hooks
/student/practice/:materialId → mode = 'solo'    → use solo hooks
```

Both modes render the **same JSX** — the only difference is which hooks provide the data.

### 6.3 Component Architecture

```
StudentTestPage
├── mode === 'live'
│   ├── useTestData(sessionCode)        ← subscribes to game_sessions/
│   ├── useTestSession(sessionCode)     ← real-time status/pause/audio
│   ├── useTestSubmission(...)          ← saves to game_sessions/ + test_results/
│   ├── useTestAutoSave(...)            ← saves to game_sessions/players/
│   ├── useTeacherEndRedirect           ← redirects on teacher end
│   └── ConnectionMonitor              ← shows connection status
│
├── mode === 'solo'
│   ├── useSoloTestData(materialId)     ← loads from tests/ directly
│   ├── useSoloTimer(duration, config)  ← standalone timer
│   ├── useSoloSubmission(...)          ← saves to test_results/ only
│   ├── useSoloAutoSave(...)            ← saves to localStorage
│   ├── useSoloResume(...)              ← checks localStorage
│   └── SoloSettingsModal              ← hamburger menu settings
│
├── SHARED (both modes)
│   ├── TwoColumnLayout
│   ├── PassageRenderer
│   ├── IELTSQuestionsPanel
│   ├── TestHeader (with mode-specific props)
│   ├── InspiraFooterNav
│   ├── useBeforeUnloadWarning
│   └── TimeUpOverlay
```

### 6.4 Settings Cascade Visualization

```
Material Owner Default (set when test was created)
  └── Course-level PracticeSettings (teacher sets for entire course)
       └── Module-level PracticeSettings (teacher overrides per module)
            └── Material-level PracticeSettings (teacher overrides per material)
                 └── Student Preferences (font size, dark mode — never overridden)
```

Resolution: For each field, use the most specific non-`'default'` value. If all are `'default'`, use the material owner default.

### 6.5 Settings UI Locations

| Location | Action | What's configured |
|----------|--------|------------------|
| `TeacherCourseProfilePage` → "Practice Settings" tab | Course-level defaults | All `PracticeSettings` fields |
| Module editor → ⚙️ gear icon per module | Module-level overrides | Same fields, pre-filled with course defaults |
| Module editor → ⚙️ gear icon per material | Material-level overrides | Same fields, pre-filled with module/course defaults |
| Add Material dialog → settings section | Initial settings when adding | Same fields, pre-filled with inherited defaults |

### 6.6 Result Detail Modal

The existing result modal (currently in waiting lobby) will be extracted into a reusable `ResultDetailModal` component and mounted in the Records tab's middle column. Navigation flow:

```
Solo test submitted
  → navigate('/student/dashboard', { state: { tab: 'records', resultId: '...' } })
  → Records tab activates
  → ResultDetailModal opens with the new result

Existing result clicked in Records tab
  → ResultDetailModal opens in middle column (replaces current "navigate to separate page" behavior)
```

---

## 7. Technical Considerations

### 7.1 New Files to Create

| File | Purpose |
|------|---------|
| `src/hooks/solo/useSoloTestData.ts` | Loads test data from `tests/` directly |
| `src/hooks/solo/useSoloTimer.ts` | Standalone countdown timer |
| `src/hooks/solo/useSoloSubmission.ts` | Marks and saves results to `test_results/` |
| `src/hooks/solo/useSoloAutoSave.ts` | Auto-saves progress to `localStorage` |
| `src/hooks/solo/useSoloResume.ts` | Checks for and restores incomplete sessions |
| `src/services/practiceSettingsService.ts` | CRUD for `PracticeSettings` at course/module/material levels |
| `src/services/practiceSettingsResolver.ts` | `resolvePracticeSettings()` merges the cascade |
| `src/types/practice.types.ts` | `PracticeSettings`, `ResolvedPracticeSettings`, `StudentSoloPreferences` |
| `src/components/test/SoloSettingsModal.tsx` | Student hamburger menu settings modal |
| `src/components/test/SoloResumeModal.tsx` | "Resume or Start New?" modal |
| `src/components/settings/PracticeSettingsEditor.tsx` | Reusable settings editor for course/module/material |
| `src/components/results/ResultDetailModal.tsx` | Extracted result detail modal for Records tab |

### 7.2 Files to Modify

| File | Change |
|------|--------|
| `src/pages/StudentTestPage.tsx` | Add mode detection, conditional hook usage |
| `src/components/test/TestHeader.tsx` | Add solo badge, hamburger icon, `useAuth()` fallback |
| `src/pages/StudentCourseDetailPage.tsx` | Navigate to `/student/practice/:materialId` with course context |
| `src/pages/StudentLibraryPage.tsx` | Navigate to `/student/practice/:materialId` with library context |
| `src/App.jsx` | Add new route, remove old solo routes |
| `src/constants/routes.ts` | Add `STUDENT_PRACTICE` route |
| `src/config/routeSecurity.ts` | Add security config for new route |
| `src/pages/TeacherCourseProfilePage.tsx` | Add "Practice Settings" tab |
| Records tab component (TBD) | Mount `ResultDetailModal`, change click behavior |

### 7.3 Files to Delete

| File | Reason |
|------|--------|
| `src/pages/StudentSoloTestPage.tsx` | Replaced by dual-mode `StudentTestPage` |
| `src/hooks/useSoloSession.ts` | Replaced by lightweight solo hooks |
| `src/services/soloSessionManager.ts` | No longer needed — no session records |

### 7.4 Database Changes

**New paths in Firebase RTDB:**
```
courses/{courseId}/practiceSettings: PracticeSettings
courses/{courseId}/modules/{moduleId}/practiceSettings: PracticeSettings
courses/{courseId}/modules/{moduleId}/materials/{materialId}/practiceSettings: PracticeSettings
```

**Security rules to ADD:**
```json
"practiceSettings": {
  ".read": "auth != null",
  ".write": "root.child('users').child(auth.uid).child('role').val() === 'teacher' || root.child('users').child(auth.uid).child('role').val() === 'super_admin'"
}
```

**Security rules to REMOVE:**
```json
"solo_sessions": { ... }  // No longer needed
```

### 7.5 localStorage Keys

| Key | Data | Expiry |
|-----|------|--------|
| `solo_progress_{materialId}_{studentId}` | `{ answers, currentQuestion, timeElapsed, startedAt, lastSavedAt }` | 7 days |
| `solo_student_prefs_{studentId}` | `{ fontSize, lineSpacing, highlighterEnabled, showTimer, darkMode, audioSpeed }` | Never |

---

## 8. Success Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| UI consistency | Visual diff between live and solo test views | 0 differences (same components) |
| Practice adoption | % of enrolled students who use solo practice | > 50% in first month |
| Settings usage | % of courses with custom practice settings | > 30% |
| Result tracking | Solo results visible in Records tab | 100% of submissions tracked |
| Code reduction | Lines of code removed vs added | Net neutral or negative |

---

## 9. Open Questions

| # | Question | Status |
|---|----------|--------|
| Q1 | Should the homework flow also be migrated to use StudentTestPage? | **DEFERRED** — homework has its own submission system; tackle separately |
| Q2 | Should solo practice record attendance? | **NO** — attendance is for live sessions only (FR-30) |
| Q3 | Should guest students be able to practice? | **NO** — solo practice requires authentication (`useAuth()`) |

---

## 10. Implementation Phases

| Phase | Focus | Estimated Duration |
|-------|-------|--------------------|
| **Phase 1** | Foundation: types, `PracticeSettings` schema, `resolvePracticeSettings()` | 2-3 days |
| **Phase 2** | Solo hooks: `useSoloTestData`, `useSoloTimer`, `useSoloAutoSave`, `useSoloResume` | 3-4 days |
| **Phase 3** | Dual-mode `StudentTestPage`: mode detection, conditional hooks, TestHeader changes | 3-4 days |
| **Phase 4** | `useSoloSubmission`: marking, saving to `test_results/`, navigation to Records | 2-3 days |
| **Phase 5** | Teacher Practice Settings UI: course/module/material editors | 3-4 days |
| **Phase 6** | Student Settings: `SoloSettingsModal`, `SoloResumeModal` | 2-3 days |
| **Phase 7** | Result Integration: extract `ResultDetailModal`, mount in Records tab | 2-3 days |
| **Phase 8** | Audio/Listening: solo AudioPlayerMode, teacher listening restrictions | 2-3 days |
| **Phase 9** | Route cleanup, file deletion, security rules update, testing | 2-3 days |

**Total Estimated Effort: 4-5 weeks**

---

## Appendix A: Discovery Session Decisions

All decisions were made through a 3-round clarifying questions session on 2026-02-23:

| Topic | Decision | Round |
|-------|----------|-------|
| Architecture | Option C: No session record, direct test load | R1 |
| Session storage | `localStorage` for progress, `test_results/` for final results | R1 |
| Identity | `useAuth()` instead of `sessionService` | R1 |
| Entry points | All: Course, Library, Dashboard feed | R2 |
| Resume behavior | Modal: "Resume or Start New?" | R2 |
| Audio (Listening) | Auto-play, full controls unless teacher restricts | R2 |
| Writing tests | Excluded (not yet implemented) | R2 |
| Result storage | Same `test_results/` collection with context tag | R2 |
| Post-submission | Navigate to Records tab with detail modal | R2 |
| Feedback timing | Respect material's `feedbackTiming` setting | R1 |
| Pause | Allow unless teacher sets otherwise | R1 |
| Course progress | Update on passing score (teacher sets minimum) | R3 |
| Settings scope | Part of this PRD (full teacher settings layer) | R2 |
| Settings UI | All levels: course tab, module gear, material gear, add dialog | R2 |
| Hamburger menu | New — student settings modal | R2 |
| History → Records | Use existing Records tab | R3 |
| Existing solo files | Delete page, hook, manager; keep types | R3 |
| Settings cascade | Material > Module > Course > Material Owner Default | R1 |

---

*PRD Status: Ready for Review*  
*Next Step: Generate detailed task breakdown after approval*
