# PRD: Unified Audio Architecture for Listening Tests

> **PRD Number:** 0018  
> **Status:** Final  
> **Created:** 2026-02-04  
> **Author:** Antigravity AI (via Discovery Session)  
> **Related PRDs:** [LISTENING_AUDIO_CONTROLS_PRD](./LISTENING_AUDIO_CONTROLS_PRD.md), [PRD-0016 Solo Study & Homework System](./0016-prd-solo-study-homework-system.md)

---

## 1. Introduction/Overview

### Problem Statement

The current listening test audio system has three critical problems:

| Problem | Impact | Root Cause |
|---------|--------|------------|
| **Teacher cannot hear audio** | Teacher seeks audio "blindly" without knowing where content is | `AudioProgressPanel` has no `<audio>` element - display-only |
| **Student audio desync** | Different test durations per student (up to ±10 seconds drift) | Each student independently loads audio; network latency varies |
| **Offline classroom chaos** | 30+ devices playing audio simultaneously creates cacophony | No "single source" mode for physical classrooms |

### Additional Context

The [Solo Study & Homework System (PRD-0016)](./0016-prd-solo-study-homework-system.md) introduces a third scenario where students practice listening tests **independently without teacher supervision**.

### Solution

Implement a **Unified Audio Architecture** with three scenario-specific modes:

| Mode | Description | Audio Source | Teacher Control |
|------|-------------|--------------|-----------------|
| **Online Class** | Remote learning, different locations | Each device + sync | ✅ Full control |
| **Offline Class** | Physical classroom, same room | Teacher's device ONLY | ✅ Full control |
| **Solo Practice** | Self-study or homework | Student's device | ❌ No teacher |

---

## 2. Goals

### Primary Goals

1. **Enable teacher audio playback** - Teacher can hear audio in monitor to seek accurately
2. **Synchronize student audio** - All students within < 1 second of teacher's position (online mode)
3. **Support offline classrooms** - Single audio source mode for physical rooms
4. **Integrate with solo practice** - Students can independently access listening materials
5. **Deprecate Google Drive audio** - Remove Google Drive support, mark existing tests with warnings

### Success Metrics

| Metric | Target |
|--------|--------|
| Audio sync accuracy (online mode) | < 1 second drift between teacher and student |
| Teacher seeking accuracy | 100% - teacher can hear and seek to exact position |
| Offline mode adoption | Used by 80%+ of in-person listening tests |
| Student audio control satisfaction | Existing audioControls presets continue to work |

---

## 3. User Stories

### 3.1 Teacher Stories

#### US-1: Teacher Audio Playback
> **As a teacher**, I want to hear the listening test audio in my monitor, so that I can seek to the exact position I need.

**Acceptance Criteria:**
- Teacher's `AudioProgressPanel` has audio playback capability
- Teacher can click play/pause directly in the monitor
- Teacher hears audio through their device speakers
- Audio position is synchronized with the progress bar display

#### US-2: Classroom Mode Selection
> **As a teacher**, I want to select whether my class is online or offline, so that audio plays correctly for my context.

**Acceptance Criteria:**
- Mode selection is REQUIRED during session setup (cannot skip)
- Clear explanation of each mode is shown with visual examples
- Mode cannot be changed after test starts (end test to change)
- Mode selection persists for future sessions as default suggestion (not default value)

#### US-3: Headphone Permission Management
> **As a teacher** in offline mode, I want to grant headphone permissions to specific students during test monitoring, so that they can hear audio on their devices.

**Acceptance Criteria:**
- Teacher sees headphone requests from students in monitor
- One-click approve/deny for each request
- Can revoke permission at any time
- No pre-grant option (only during active test monitoring)

#### US-4: Audio Pre-warming
> **As a teacher**, I want the audio files to be pre-loaded when I enter the monitor, so that students don't experience delays.

**Acceptance Criteria:**
- When teacher enters monitor page, all audio sections begin loading
- CDN cache is warmed before students join
- Teacher sees loading status for each section

---

### 3.2 Student Stories (Session-Based)

#### US-5: Online Class Audio Sync
> **As a student** in an online class, I want my audio to stay synchronized with the teacher's, so that I don't miss or repeat content.

**Acceptance Criteria:**
- Audio syncs to within 1 second of teacher's position
- Sync happens automatically without student intervention
- Brief visual indicator when sync correction happens ("Syncing...")
- Audio controls respect teacher-configured settings (IELTS_STANDARD, etc.)

#### US-6: Offline Class Experience
> **As a student** in an offline classroom, I want to see the audio progress without hearing from my device, so that I can follow along with the classroom speaker.

**Acceptance Criteria:**
- Device audio is muted by default
- Progress bar shows current position synchronized with teacher
- Clear message: "🔇 Listening to classroom audio"
- Volume slider is HIDDEN until headphone permission granted
- If student has headphones and permission, can hear audio

#### US-7: Headphone Request
> **As a student** in an offline classroom with headphones, I want to hear audio on my device, so that I can follow along privately.

**Acceptance Criteria:**
- Student can click "🎧 I have headphones" button to request permission
- Request is sent to teacher monitor
- Once approved, volume slider appears and audio unmutes, syncs to teacher's position
- Student sees confirmation when approved

#### US-8: Late-Joining (Offline Mode)
> **As a late-joining student** in an offline classroom, I want to see the current position immediately, so that my screen matches what I'm hearing from the classroom speaker.

**Acceptance Criteria:**
- Upon joining, progress bar jumps to teacher's current position
- Student does NOT start from beginning

---

### 3.3 Student Stories (Solo Practice)

#### US-9: Solo Practice Full Control
> **As a student** practicing alone, I want full control over the audio, so that I can learn at my own pace.

**Acceptance Criteria:**
- All audio controls visible (play/pause, seek, speed, volume)
- No teacher sync - student controls everything
- Can pause and resume at any time
- Progress is saved for resume later

#### US-10: Homework Audio Settings
> **As a student** completing homework, I want the audio settings to match what my teacher configured, so that I practice under the right conditions.

**Acceptance Criteria:**
- If teacher configured IELTS_STANDARD → student has limited controls
- If teacher configured PRACTICE_MODE → student has full controls
- Settings are clearly displayed before starting

---

## 4. Functional Requirements

### 4.1 Unified Audio State System

| # | Requirement |
|---|-------------|
| FR-1 | The system must replace the existing `audioCommand` system with a unified `masterAudioState` structure |
| FR-2 | The `masterAudioState` must include: section, position (seconds), isPlaying, speed, timestamp, lastAction, lastActionTimestamp |
| FR-3 | The system must use Firebase `serverTimestamp()` to eliminate clock skew issues |
| FR-4 | The system must broadcast state updates using event-driven + 2-second heartbeat pattern (not continuous 500ms) |

### 4.2 Teacher Audio Playback

| # | Requirement |
|---|-------------|
| FR-5 | The system must add an `<audio>` element to `AudioProgressPanel` for teacher playback |
| FR-6 | The teacher must be able to hear, pause, seek, and control audio from the monitor |
| FR-7 | The teacher monitor must pre-load all audio sections when entering the page (CDN cache warming) |
| FR-8 | The existing two-pause system must be preserved: "Pause Test" (timer+audio) and "Pause Audio" (audio only) |

### 4.3 Audio Mode Selection

| # | Requirement |
|---|-------------|
| FR-9 | The system must require teachers to select `audioMode` ('online' or 'offline') during session setup |
| FR-10 | The system must prevent test start if `audioMode` is not selected |
| FR-11 | The system must display a clear explanation of each mode with visual examples |
| FR-12 | The system must suggest last-used `audioMode` but not auto-select (required choice) |

### 4.4 Online Mode - Student Sync

| # | Requirement |
|---|-------------|
| FR-13 | Student `AudioPlayer` must listen to `masterAudioState` from Firebase |
| FR-14 | Student must calculate expected position based on master position + elapsed time since broadcast |
| FR-15 | Student must seek to expected position if drift exceeds 1 second |
| FR-16 | Student must show visual indicator during sync correction ("Syncing...") |
| FR-17 | Student must continue independently if teacher disconnects (using last known position) |
| FR-18 | Student must respect existing `audioControls` settings for UI elements |
| FR-19 | On speed change, system must capture exact position and reset sync baseline |

### 4.5 Offline Mode - Student Muting

| # | Requirement |
|---|-------------|
| FR-20 | Student devices must be muted by default in offline mode |
| FR-21 | Student must see progress bar synchronized to teacher's position |
| FR-22 | Student must see message: "🔇 Listening to classroom audio" |
| FR-23 | Volume slider must be HIDDEN (not just disabled) until headphone permission is granted |
| FR-24 | Audio controls (play/pause, seek) must be hidden in offline mode for non-permitted students |

### 4.6 Headphone Permissions

| # | Requirement |
|---|-------------|
| FR-25 | Student must be able to click "🎧 I have headphones" button to request permission |
| FR-26 | Teacher must see headphone requests in the monitor (per-student) |
| FR-27 | Teacher must be able to approve/deny requests with one click |
| FR-28 | Pre-grant option is NOT available (permissions only during active test monitoring) |
| FR-29 | Once granted, student audio unmutes, volume slider appears, and audio syncs to teacher position |
| FR-30 | Teacher must be able to revoke permission at any time |
| FR-31 | If student makes request during section change, request remains pending until teacher approves |

### 4.7 Solo Practice Mode

| # | Requirement |
|---|-------------|
| FR-32 | System must detect solo context (no session code or session status = 'solo') |
| FR-33 | Solo mode must use `PRACTICE_MODE` audio controls by default |
| FR-34 | Homework assignments may override audio controls via `config.audioControls` |
| FR-35 | Solo mode must not connect to Firebase for sync (local playback only) |
| FR-36 | Progress must be saveable for resume later |

### 4.8 Audio Loading & Format

| # | Requirement |
|---|-------------|
| FR-37 | System must show "Loading audio..." for students whose audio isn't ready |
| FR-38 | Student is considered "ready" when at least 15 seconds is buffered |
| FR-39 | After 10 seconds of loading, show: "Audio loading slowly. Connection may affect experience." |
| FR-40 | System must support audio formats: MP3, WAV, M4A, AAC, OGG |
| FR-41 | System must validate audio format during test creation |

### 4.9 Test Pause Behavior

| # | Requirement |
|---|-------------|
| FR-42 | When teacher pauses TEST (not just audio), both timer AND audio must stop |
| FR-43 | When resumed, all students must resume at exactly the same position (no drift) |
| FR-44 | On resume from long pause (> 5 minutes), system must broadcast masterAudioState with 'resume' action |
| FR-45 | The two existing pause buttons must remain: "Pause Test" and "Pause Audio" |

### 4.10 Reconnection Behavior

| # | Requirement |
|---|-------------|
| FR-46 | When student reconnects, they must jump to teacher's current position immediately |
| FR-47 | When teacher reconnects, they resume from their last known position (students rewind to match) |
| FR-48 | If teacher position is behind students on reconnect, students rewind (some content repeated is acceptable) |

### 4.11 Disconnected Student Handling

| # | Requirement |
|---|-------------|
| FR-49 | When test ends, auto-submit answers for disconnected students as "incomplete" submission |
| FR-50 | Preserve disconnected student's answers in `test_results` before clearing session data |

### 4.12 Google Drive Deprecation

| # | Requirement |
|---|-------------|
| FR-51 | Remove Google Drive audio upload support from new test creation |
| FR-52 | Mark existing tests with Google Drive audio with warning: "Audio source deprecated - please re-upload" |
| FR-53 | Existing tests with Google Drive audio can still play (for backwards compatibility) until manual re-upload |

### 4.13 Material Access Control (Solo Practice)

| # | Requirement |
|---|-------------|
| FR-54 | When student is removed from class, access to class materials terminates immediately |
| FR-55 | When material is marked private, student cannot access even if practice was started (terminate current attempt NOT allowed) |
| FR-56 | When homework deadline passes, student cannot practice with the material as homework |
| FR-57 | When course enrollment ends, materials are no longer accessible |
| FR-58 | If student is mid-test when access is revoked, allow completion of current attempt |

### 4.14 Override Priority

| # | Requirement |
|---|-------------|
| FR-59 | Override priority: Student Accommodation > Session Setting > Material Default |
| FR-60 | Add "Exam Mode" toggle to session settings that disables all accommodations |
| FR-61 | When Exam Mode is enabled, accommodations are logged but not applied |
| FR-62 | Teacher sees warning when Exam Mode is enabled: "Accommodations disabled for this session" |

### 4.15 Sync Metrics for Teacher

| # | Requirement |
|---|-------------|
| FR-63 | Teacher monitor must show simple sync status: "All synced" or "X students syncing..." |
| FR-64 | On hover/expand, show aggregate stats: "Average drift: 0.5s, Max drift: 1.2s" |

---

## 5. Non-Goals (Out of Scope)

| Non-Goal | Reason |
|----------|--------|
| WebRTC audio streaming | Too complex; position sync is sufficient for educational context |
| Sub-100ms sync | 1-second tolerance is acceptable for listening tests |
| Automatic headphone detection | Browser APIs are unreliable; user self-report is sufficient |
| Multi-teacher audio sources | One teacher = one master audio source per session |
| Recording teacher audio | Privacy concerns |
| Live mode switching during test | Disruptive to students; require test end to switch |
| Pre-grant headphone permissions | Adds complexity; only grant during active monitoring |
| Optional sync for students | Defeats purpose of synchronized mode |
| Different mobile sync behavior | Keep consistent cross-platform |

---

## 6. Design Considerations

### 6.1 Session Setup UI - Audio Mode Selection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🎧 Classroom Audio Mode (Required)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────┐   ┌─────────────────────────────┐         │
│  │  ○ Online Class (Remote)   │   │  ○ Offline Class (Classroom) │         │
│  │                             │   │                              │         │
│  │  🌐 Students at different   │   │  🏫 Students in same room    │         │
│  │     locations               │   │     as you                   │         │
│  │                             │   │                              │         │
│  │  Each student hears audio   │   │  Only YOUR device plays      │         │
│  │  on their own device,       │   │  audio (classroom speakers)  │         │
│  │  synced to your position    │   │                              │         │
│  │                             │   │  Students see progress bar   │         │
│  │                             │   │  but hear from room          │         │
│  └─────────────────────────────┘   └─────────────────────────────┘         │
│                                                                             │
│  ⚠️ You must select a mode to start the test                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Teacher Monitor - With Audio Playback

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🎵 Audio Control Panel (ENHANCED)                                         │
│  Section 1 of 4 • Introduction                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [▶️]  ━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━   2:45 / 5:30   🔊 ▮▮▮▮▯ │   │
│  │       [Section 1] [Section 2] [Section 3] [Section 4]               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Mode: 🌐 Online Class                    ✅ All synced (28 students)      │
│                                                                             │
│  [🎧 2 headphone requests pending]         [View Details ▼]                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Student View - Offline Mode (Muted)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Section 1 • Introduction                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🔇 Listening to classroom audio                                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │   ━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━   2:45 / 5:30                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  📱 Your device is muted. Listen to the classroom speaker.                 │
│                                                                             │
│  [🎧 I have headphones]                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.4 Student View - Headphone Permission Approved

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Section 1 • Introduction                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🎧 Using headphones (synced to teacher)                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │   ━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━   2:45 / 5:30       🔊 ▮▮▮▯▯    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ✅ Headphone mode active                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Technical Considerations

### 7.1 Data Schema

#### MasterAudioState (Firebase Realtime Database)
```typescript
// Path: game_sessions/{code}/masterAudioState
interface MasterAudioState {
  section: number;           // Current section number
  position: number;          // Position in seconds
  isPlaying: boolean;        // Is audio playing?
  speed: number;             // Playback speed (1.0, 1.25, etc.)
  timestamp: number;         // Server timestamp for sync calculation (use serverTimestamp())
  lastAction: 'play' | 'pause' | 'seek' | 'section' | 'speed' | 'resume';
  lastActionTimestamp: number;
}
```

#### Session Settings Extension
```typescript
interface ListeningSessionSettings {
  // ... existing settings
  
  // NEW: Audio mode (required)
  audioMode: 'online' | 'offline';
  
  // NEW: Exam mode (disables accommodations)
  examMode?: boolean;
}
```

#### Player Headphone State
```typescript
// Path: game_sessions/{code}/players/{studentId}/headphoneRequest
interface HeadphoneRequest {
  requested: boolean;
  requestedAt?: number;
  status: 'pending' | 'approved' | 'denied';
  approvedAt?: number;
  deniedAt?: number;
}
```

### 7.2 State Update Patterns

**Event-Driven + Heartbeat Pattern:**
```typescript
// Immediate state update triggers:
// - Play/Pause/Resume
// - Seek (position change)
// - Section change
// - Speed change

// Heartbeat (every 2 seconds while playing):
// - Position update with fresh timestamp

// Result: ~30 writes/minute per session instead of 120
```

### 7.3 Sync Algorithm (Student-Side)

```typescript
// Calculate expected position
const now = Date.now();
const elapsed = (now - master.timestamp) / 1000;
const expectedPosition = master.position + (elapsed * master.speed);

// Get current position
const currentPosition = audioRef.current.currentTime;
const drift = Math.abs(currentPosition - expectedPosition);

// Sync if drift > 1 second
if (drift > 1) {
  setIsSyncing(true);
  audioRef.current.currentTime = expectedPosition;
  setTimeout(() => setIsSyncing(false), 500);
}
```

### 7.4 Files to Modify

| File | Change |
|------|--------|
| `AudioProgressPanel.tsx` | Add `<audio>` element, broadcast `masterAudioState`, pre-load sections |
| `AudioPlayer.tsx` | Add sync logic for online mode; mute logic for offline mode; hide volume until approved |
| `useMonitorControls.ts` | Replace `audioCommand` with `masterAudioState` updates |
| `useTestSession.ts` | Add `masterAudioState` and `headphoneRequest` listeners |
| `TeacherLobbyPage.tsx` | Add audio mode selector UI (required selection) |
| `ListeningTestPage.tsx` | Add headphone request UI, sync indicator, late-join handling |
| `StudentDetailModal.tsx` | Show headphone request status (no pre-grant) |
| `listeningTestStorage.ts` | Add `audioMode` to settings schema |
| `googleDriveAudio.ts` | Add deprecation warning, mark for removal |
| `ListeningTestBuilder.tsx` | Remove Google Drive upload option, validate audio formats |

### 7.5 Google Drive Deprecation Plan

| Phase | Action |
|-------|--------|
| Phase 1 | Remove Google Drive upload UI from test creation |
| Phase 2 | Add warning badge to tests with Google Drive audio |
| Phase 3 | Keep playback functionality for existing tests |
| Phase 4 | (Future) Migration script to re-upload Google Drive audio to R2 |

### 7.6 Firebase Considerations

**Connection Limits (Spark Plan):**
- Limit: 100 simultaneous connections
- App-wide target: 100-150 students
- This is app-wide across ALL test types (not just listening)
- No PRD restriction needed (different sessions don't overlap same listeners)

**Write Optimization:**
- Event-driven + 2s heartbeat = ~30 writes/min/session
- Acceptable for Firebase RTDB

---

## 8. Success Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| Sync accuracy | Server-side comparison of teacher vs student positions | < 1 second drift |
| Teacher usage | % of listening tests where teacher uses audio playback | > 80% |
| Offline mode adoption | % of in-person tests using offline mode | > 80% |
| Headphone request approval time | Average time from request to approval | < 30 seconds |
| Audio loading errors | Error rate in audio playback | < 1% |
| Google Drive warnings resolved | % of deprecated tests re-uploaded | Track over time |

---

## 9. Open Questions (RESOLVED)

| # | Question | Resolution |
|---|----------|------------|
| Q1 | Should we add "Test Audio" feature? | **No** - not needed |
| Q2 | Should headphone permissions persist across sessions? | **No** - per-session only |
| Q3 | Should we track sync accuracy metrics? | **No** - simple display only |
| Q4 | Dual pause buttons? | **Already exist** - confirmed in current implementation |

---

## 10. Implementation Phases

### Phase 1: Teacher Audio Playback (4-6 hours)

| Task | Description |
|------|-------------|
| 1.1 | Add `<audio>` element to `AudioProgressPanel` |
| 1.2 | Connect audio playback to existing progress tracking |
| 1.3 | Add volume control for teacher |
| 1.4 | Pre-load all audio sections on monitor page load |

### Phase 2: Unified Audio State System (4-6 hours)

| Task | Description |
|------|-------------|
| 2.1 | Create `masterAudioState` data structure |
| 2.2 | Migrate from `audioCommand` to `masterAudioState` |
| 2.3 | Implement event-driven + 2s heartbeat broadcast |
| 2.4 | Use Firebase `serverTimestamp()` for all timestamps |

### Phase 3: Audio Mode Selection (3-4 hours)

| Task | Description |
|------|-------------|
| 3.1 | Add `audioMode` field to session settings schema |
| 3.2 | Create audio mode selection UI in `TeacherLobbyPage` |
| 3.3 | Make selection required before test start |
| 3.4 | Save as suggestion for future sessions (not default) |

### Phase 4: Online Mode - Student Sync (6-8 hours)

| Task | Description |
|------|-------------|
| 4.1 | Add `masterAudioState` listener to `AudioPlayer` |
| 4.2 | Implement drift detection algorithm (1s threshold) |
| 4.3 | Implement position correction (seek) |
| 4.4 | Add sync indicator UI ("Syncing...") |
| 4.5 | Handle teacher disconnect gracefully |
| 4.6 | Handle speed change with position reset |

### Phase 5: Offline Mode - Student Muting (4-6 hours)

| Task | Description |
|------|-------------|
| 5.1 | Add mute logic based on `audioMode` |
| 5.2 | Create offline mode UI (progress bar only) |
| 5.3 | Add "Listening to classroom audio" message |
| 5.4 | HIDE volume slider and audio controls (not just disable) |

### Phase 6: Headphone Permissions (6-8 hours)

| Task | Description |
|------|-------------|
| 6.1 | Add headphone request button for students |
| 6.2 | Store request in Firebase player data |
| 6.3 | Display pending requests in teacher monitor |
| 6.4 | Add approve/deny buttons for teacher |
| 6.5 | Show volume slider on approval, unmute + sync |
| 6.6 | Handle requests during section changes (stay pending) |

### Phase 7: Google Drive Deprecation (3-4 hours)

| Task | Description |
|------|-------------|
| 7.1 | Remove Google Drive upload UI from test creation |
| 7.2 | Add warning badge to tests with Google Drive audio |
| 7.3 | Add audio format validation (MP3, WAV, M4A, AAC, OGG) |
| 7.4 | Keep playback for existing tests (backwards compatible) |

### Phase 8: Disconnected Student Handling (2-3 hours)

| Task | Description |
|------|-------------|
| 8.1 | Detect disconnected students when test ends |
| 8.2 | Auto-submit answers as "incomplete" before clearing |
| 8.3 | Preserve in test_results collection |

### Phase 9: Solo Practice Integration (3-4 hours)

| Task | Description |
|------|-------------|
| 9.1 | Add `mode` prop to `AudioPlayer` ('session' or 'solo') |
| 9.2 | Skip Firebase sync for solo mode |
| 9.3 | Always use PRACTICE_MODE for solo |
| 9.4 | Respect homework audioControls override |

### Phase 10: Exam Mode (2-3 hours)

| Task | Description |
|------|-------------|
| 10.1 | Add `examMode` toggle to session settings |
| 10.2 | Display warning when enabled |
| 10.3 | Log but don't apply accommodations in exam mode |

**Total Estimated Effort: 37-52 hours (5-7 days)**

---

## Appendix: Discovery Session Decisions

All decisions were made through discovery sessions on 2026-02-04:

| Topic | Decision | Source |
|-------|----------|--------|
| Audio State System | Unified `masterAudioState` replaces `audioCommand` | A1 |
| Section Transition | Keep current behavior (independent per student) | A2 |
| Audio Loading | Show loading, jump to current (15s buffer) | A3 |
| Test Pause | Both timer + audio stop, resume at exact position | A4 |
| Speed Change | Immediate state reset with position capture | A5 |
| Broadcast Frequency | Event-driven + 2s heartbeat | A6 |
| Headphone Permissions | In monitor only, no pre-grant | A7 |
| Material Access | Immediate termination, allow mid-test completion | A8 |
| Override Priority | Accommodation > Session > Material, add Exam Mode | A9 |
| Student Reconnect | Jump to teacher position | A10 |
| Teacher Reconnect | Resume from last position (students rewind) | A10 |
| Mobile Behavior | Same as desktop, no warnings | A11 |
| Optional Sync | No - sync always on for sessions | A12 |
| Audio Pre-warming | Teacher monitor pre-loads all sections | A19 |
| Google Drive | Remove support, mark existing with warning | A20 |
| Disconnected Students | Auto-submit as incomplete | A21 |
| Audio Formats | MP3, WAV, M4A, AAC, OGG | A22 |
| Clock Skew | Use Firebase serverTimestamp() | A23 |
| Volume Slider | Hidden until headphone approved | A24 |
| Sync Metrics | Simple default, aggregate on hover | A25 |
| Pause Buttons | Keep existing two (Test + Audio) | A26 |
| Late-joining Offline | Jump to current position | A27 |

---

*PRD Status: Final - Ready for Task Generation*  
*Next Step: Generate task breakdown using generate-tasks.md*
