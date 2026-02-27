# Tasks: PRD-0018 Unified Audio Architecture for Listening Tests

> **Generated:** 2026-02-04
> **PRD:** [0018-prd-unified-audio-architecture.md](./0018-prd-unified-audio-architecture.md)
> **Estimated Effort:** 37-52 hours (5-7 days)

---

## Relevant Files

### Core Audio Components
- `src/components/test/AudioProgressPanel.tsx` - Teacher's audio control panel in monitor. Needs `<audio>` element, playback controls, pre-loading, and `masterAudioState` broadcasting.
- `src/skills/listening/components/AudioPlayer.tsx` - Student's audio player. Needs sync logic (online mode), mute logic (offline mode), solo mode detection, and headphone permission handling.
- `src/skills/listening/components/AudioControls.tsx` - Audio controls UI. May need updates for offline mode visibility rules.

### Session & Control Hooks
- `src/hooks/monitor/useMonitorControls.ts` - Teacher control actions. Replace `audioCommand` with `masterAudioState` updates, add heartbeat broadcasting.
- `src/hooks/test/useTestSession.ts` - Student session state. Add `masterAudioState` listener, `headphoneRequest` state, and sync calculation.

### Page Components
- `src/pages/TeacherLobbyPage.jsx` - Session setup. Add audio mode selection UI (required), save preference.
- `src/skills/listening/components/ListeningTestPage.tsx` - Student test interface. Add headphone request UI, sync indicator, offline mode UI, late-join handling.

### Services & Storage
- `src/services/listeningTestStorage.ts` - Listening test data types. Add `audioMode`, `examMode` to session settings schema.
- `src/services/googleDriveAudio.ts` - Google Drive audio handling. Add deprecation warning, keep for backwards compatibility.

### Builders
- `src/skills/listening/builders/ListeningTestBuilder.tsx` - Test creation UI. Remove Google Drive upload option, add audio format validation.

### New Files to Create
- `src/hooks/audio/useMasterAudioState.ts` - Hook for managing masterAudioState broadcasting (teacher) and listening (student).
- `src/hooks/audio/useAudioSync.ts` - Hook for calculating drift and triggering sync corrections.
- `src/hooks/audio/useHeadphonePermission.ts` - Hook for headphone request/approval flow.
- `src/components/test/AudioModeSelector.tsx` - Reusable audio mode selection component.
- `src/components/test/HeadphoneRequestPanel.tsx` - Teacher's pending headphone requests panel.
- `src/components/test/SyncIndicator.tsx` - "Syncing..." visual indicator component.
- `src/types/audio.types.ts` - TypeScript interfaces for MasterAudioState, HeadphoneRequest, AudioMode.

### Test Files
- `src/hooks/audio/useMasterAudioState.test.ts` - Unit tests for masterAudioState hook.
- `src/hooks/audio/useAudioSync.test.ts` - Unit tests for sync algorithm.
- `src/components/test/AudioModeSelector.test.tsx` - Unit tests for mode selector.

### Notes

- Unit tests should be placed alongside the code files they test.
- Use `npm test` or `npx jest [path]` to run tests.
- Firebase `serverTimestamp()` must be used for all timestamp fields to prevent clock skew.
- The existing two-pause system ("Pause Test" and "Pause Audio") must be preserved.

---

## Tasks

- [ ] **1.0 Core Audio Infrastructure & Type System**
  > Define the foundational data structures and create core hooks for the unified audio architecture. This establishes the `masterAudioState` system that replaces the legacy `audioCommand` system.

  - [x] **1.1** Create `src/types/audio.types.ts` with TypeScript interfaces:
    - `MasterAudioState` (section, position, isPlaying, speed, timestamp, lastAction, lastActionTimestamp)
    - `HeadphoneRequest` (requested, requestedAt, status, approvedAt, deniedAt)
    - `AudioMode` type ('online' | 'offline')
    - `ListeningSessionSettings` extension (audioMode, examMode)
  
  - [x] **1.2** Create `src/hooks/audio/useMasterAudioState.ts` hook:
    - For teacher: broadcast state to Firebase `game_sessions/{code}/masterAudioState`
    - For student: listen to masterAudioState changes
    - Use Firebase `serverTimestamp()` for all timestamp fields
    - Implement event-driven updates (play, pause, seek, section, speed, resume)
    - Implement 2-second heartbeat while audio is playing
  
  - [x] **1.3** Update `src/hooks/monitor/useMonitorControls.ts`:
    - ~~Replace all `audioCommand` writes with `masterAudioState` updates~~ Now writes BOTH for backwards compatibility
    - Ensure `pauseAllAudio`, `resumeAllAudio`, `skipToSection`, `setPlaybackSpeed`, `seekToPosition` update masterAudioState
    - ~~Add heartbeat interval management (start on play, stop on pause/end)~~ Heartbeat managed in AudioProgressPanel instead
  
  - [x] **1.4** Update `src/hooks/test/useTestSession.ts`:
    - ~~Replace `audioCommand` listener with `masterAudioState` listener~~ Added alongside for backwards compatibility
    - Export `masterAudioState` in the return object
    - ~~Remove legacy `audioCommand` state and related code~~ Kept for migration period
  
  - [x] **1.5** Update `src/skills/listening/components/ListeningTestPage.tsx`:
    - ~~Replace `audioCommand` effect with `masterAudioState` processing~~ Both systems now work in parallel
    - ~~Remove legacy command processing logic~~ Kept for backwards compatibility
    - ~~Delegate audio control to new sync system (Task 4.0)~~ Props passed through to AudioPlayer

---

- [x] **2.0 Teacher Audio Playback Enhancement**
  > Add actual audio playback capability to `AudioProgressPanel` so teachers can hear, seek, and control audio. Implement CDN cache warming via pre-loading all sections on monitor page load.

  - [x] **2.1** Add `<audio>` element to `AudioProgressPanel.tsx`:
    - Create hidden audio element with ref
    - Connect to current section's audio URL
    - Sync audio element's currentTime with progress bar display
    - Handle section transitions (load new audio URL when section changes)
  
  - [x] **2.2** Implement teacher audio controls in `AudioProgressPanel.tsx`:
    - Add play/pause button that controls the audio element
    - Add volume slider for teacher's local volume (not broadcast)
    - Connect existing seek slider to audio element's currentTime
    - Update progress bar from audio's timeupdate event
  
  - [x] **2.3** Implement CDN cache warming:
    - On monitor page mount, create Audio objects for all sections
    - Set preload="metadata" to start loading
    - Track loading state per section (loading, ready, error)
    - Display loading indicator in UI ("Loading Section X...")
  
  - [x] **2.4** Connect teacher audio playback to `masterAudioState`:
    - When teacher plays/pauses, update masterAudioState via useMasterAudioState hook
    - When teacher seeks, broadcast position change
    - When teacher changes section, broadcast section change
    - Teacher's audio element is the source of truth for position
  
  - [x] **2.5** Preserve existing two-pause system:
    - "Pause Test" button: calls existing pauseTest (timer + audio stop)
    - "Pause Audio" button: calls pauseAllAudio (audio only, timer continues)
    - Ensure both work correctly with new masterAudioState system

---

- [ ] **3.0 Audio Mode Selection System**
  > Implement the required audio mode selection (online/offline) during session setup. Teachers must choose before starting a test, with mode-appropriate behavior enforced throughout.

  - [x] **3.1** Create `src/components/test/AudioModeSelector.tsx` component:
    - Two large, clickable cards: "Online Class (Remote)" and "Offline Class (Classroom)"
    - Visual icons and descriptions for each mode (as per PRD mockup)
    - Highlight selected mode, show warning if none selected
    - Accept `value`, `onChange`, `required` props
  
  - [x] **3.2** ~~Update `src/services/listeningTestStorage.ts`~~ Already in `src/types/audio.types.ts`:
    - `audioMode: 'online' | 'offline'` in `ListeningSessionSettings` interface
    - Add `examMode?: boolean` to interface
    - ~~Update any save/load functions~~ Session settings handled separately via Firebase
  
  - [x] **3.3** Update `src/pages/TeacherLobbyPage.jsx`:
    - Import and render `AudioModeSelector` in listening test session setup
    - Store selected mode in session settings state
    - Make mode selection REQUIRED (cannot proceed without selection)
    - Show validation error: "⚠️ You must select a mode to start the test"
  
  - [x] **3.4** Implement mode suggestion (not default):
    - Store last-used audioMode in localStorage per teacher
    - On next session, show suggestion: "Last time you used [mode]"
    - Do NOT auto-select; teacher must click to confirm
  
  - [x] **3.5** Prevent mode change after test start:
    - ~~Once test starts, audioMode is locked~~ Mode set at session creation, not shown in monitor
    - ~~Hide or disable the mode selector in monitor view~~ Selector not rendered in monitor (hidden approach)
    - ~~Add note: "End test to change mode"~~ Component has disabled state with lock message if needed
  
  - [x] **3.6** Save audioMode to Firebase session:
    - When session is created, save audioMode to `game_sessions/{code}/settings/audioMode`
    - Students read this value to determine their behavior

---

- [ ] **4.0 Online Mode - Student Audio Synchronization**
  > Implement the sync algorithm where students listen to `masterAudioState` and auto-correct drift exceeding 1 second. Handle teacher disconnect, speed changes, and reconnection scenarios.

  - [x] **4.1** Create `src/hooks/audio/useAudioSync.ts` hook:
    - Accept audioRef, masterAudioState, and isOnlineMode as inputs
    - Calculate expected position: `master.position + (elapsed * master.speed)`
    - Calculate drift: `|currentPosition - expectedPosition|`
    - Return: drift, isSyncing, lastSyncTime
  
  - [x] **4.2** Implement drift correction in `useAudioSync.ts`:
    - If drift > 1 second, trigger seek to expected position
    - Set isSyncing to true during correction
    - After 500ms, set isSyncing to false
    - Ensure audio continues playing after seek
  
  - [x] **4.3** Create `src/components/test/SyncIndicator.tsx` component:
    - Show "Syncing..." text with subtle animation when isSyncing is true
    - Position at top of audio player area
    - Auto-hide after sync completes
  
  - [x] **4.4** Update `src/skills/listening/components/AudioPlayer.tsx` for online mode:
    - Add `mode` prop: 'session' | 'solo' (default 'session')
    - Add `audioMode` prop: 'online' | 'offline' | undefined
    - When mode='session' and audioMode='online':
      - Use useAudioSync hook for drift correction
      - Render SyncIndicator when syncing
      - Respect audioControls settings for UI elements
  
  - [x] **4.5** Handle teacher disconnect:
    - If masterAudioState hasn't updated for 10+ seconds while isPlaying=true
    - Continue playing independently from last known position
    - Show subtle indicator: "Teacher connection lost, continuing..."
    - Resume sync when updates resume
  
  - [x] **4.6** Handle speed change with position reset:
    - When masterAudioState.lastAction = 'speed':
      - Capture current position exactly
      - Apply new speed to audio element
      - Reset sync baseline to avoid drift from speed mismatch
  
  - [x] **4.7** Handle student reconnection:
    - On reconnect (Firebase connection restored), read current masterAudioState
    - Jump to teacher's current position immediately
    - Do NOT start from beginning
  
  - [ ] **4.8** Add sync metrics display for teacher:
    - In `AudioProgressPanel`, show simple status: "All synced" or "X students syncing..."
    - On hover/expand, show aggregate: "Average drift: 0.5s, Max drift: 1.2s"
    - Receive sync status from students via Firebase (optional, low priority)
    - ⚠️ **Note:** Type `SyncMetrics` exists in `audio.types.ts`, UI implementation deferred (low priority per PRD)

---

- [x] **5.0 Offline Mode - Student Muting & Progress Display**
  > Implement offline classroom mode where student devices are muted, showing only the progress bar synced to teacher's position. Hide volume and audio controls until headphone permission is granted.

  - [x] **5.1** Update `AudioPlayer.tsx` for offline mode:
    - When mode='session' and audioMode='offline':
      - Set audio element volume to 0 (muted)
      - Still load and "play" audio silently to track position
      - Sync progress bar to masterAudioState position
  
  - [x] **5.2** Implement offline mode UI in `AudioPlayer.tsx`:
    - Show message: "🔇 Listening to classroom audio"
    - Show message: "📱 Your device is muted. Listen to the classroom speaker."
    - Display progress bar synced to teacher's position
    - HIDE (not disable) play/pause, seek, speed, skip controls
    - HIDE volume slider
  
  - [x] **5.3** Update `ListeningTestPage.tsx` for offline mode:
    - Pass audioMode to AudioPlayer component
    - Add "🎧 I have headphones" button (visible in offline mode only)
    - Position button below the muted message
  
  - [x] **5.4** Handle late-joining student in offline mode:
    - On join, read current masterAudioState immediately
    - Jump progress bar to teacher's current position
    - ~~Do NOT show content from beginning~~ Progress bar syncs on mount
    - ~~Visual transition: fade in at current position~~ Smooth 100ms updates
  
  - [x] **5.5** Sync progress bar without audio in offline mode:
    - Use masterAudioState to update progress bar position
    - Calculate display position from master.position + elapsed time
    - Update every 100ms for smooth progress animation
    - Do NOT play audio until headphone permission granted

---

- [ ] **6.0 Headphone Permission System**
  > Implement the request/approval flow for offline mode. Students can request headphone access; teachers approve/deny from the monitor. On approval, unmute + sync + show volume controls.

  - [x] **6.1** Create `src/hooks/audio/useHeadphonePermission.ts` hook:
    - For student: send request to Firebase `game_sessions/{code}/players/{studentId}/headphoneRequest`
    - For teacher: listen to all players' headphoneRequest
    - Manage request state: pending, approved, denied
  
  - [x] **6.2** Implement student headphone request:
    - When student clicks "🎧 I have headphones" button:
      - Write to Firebase: `{ requested: true, requestedAt: serverTimestamp(), status: 'pending' }`
      - Show "Request sent, waiting for teacher approval..." (via ⏳ Pending... button text)
      - Disable button while pending
  
  - [x] **6.3** Create `src/components/test/HeadphoneRequestPanel.tsx` for teacher:
    - List all pending headphone requests with student names
    - Show timestamp of request
    - One-click "✅ Approve" and "❌ Deny" buttons per student
    - Badge notification: "🎧 2 headphone requests pending"
  
  - [x] **6.4** Add HeadphoneRequestPanel to teacher monitor:
    - Position in `AudioProgressPanel` or alongside it
    - Only show in offline mode
    - Collapse when no pending requests
  
  - [x] **6.5** Implement teacher approval/denial:
    - On approve: write `{ status: 'approved', approvedAt: serverTimestamp() }`
    - On deny: write `{ status: 'denied', deniedAt: serverTimestamp() }`
    - Student receives update via Firebase listener (via useHeadphonePermission hook)
  
  - [x] **6.6** Handle approval on student side:
    - When status changes to 'approved':
      - Unmute audio (via hasHeadphonePermission in AudioPlayer)
      - Show volume slider
      - Sync audio to teacher's current position (via useAudioSync)
      - Show confirmation: "✅ Headphone mode active" (via UI update)
  
  - [x] **6.7** Implement teacher revocation:
    - Teacher can click "Revoke" on previously approved student
    - Write `{ status: 'denied', deniedAt: serverTimestamp() }` (via revokePermission)
    - Student re-mutes and volume slider hides (via hasHeadphonePermission)
  
  - [x] **6.8** Handle request during section change:
    - If student makes request while teacher is changing sections
    - Request remains pending (not auto-denied) via Firebase listener pattern
    - Teacher can still see and approve after section settles
    - ℹ️ **Status:** Inherently handled by useHeadphonePermission's Firebase real-time listeners

---

- [x] **7.0 Solo Practice Mode Integration**
  > Detect solo context (no session code or solo status) and enable full local playback without Firebase sync. Respect homework audio control overrides.

  - [x] **7.1** Update `AudioPlayer.tsx` to detect solo mode:
    - Add logic to detect: via `playerMode === 'solo'` prop
    - When solo mode detected, skip Firebase sync logic
    - Use `isSoloMode` variable for control visibility

  - [x] **7.2** Implement full audio controls for solo mode:
    - Enable all controls via `soloModeDefaults` object
    - Use PRACTICE_MODE preset as default when no audioControls prop
    - SyncIndicator and headphone button hidden via conditional props

  - [x] **7.3** Implement homework audioControls override:
    - Priority: offline hiding > audioControls prop > solo defaults > legacy props
    - Example: If homework has audioControls, those override solo defaults

  - [x] **7.4** Update `ListeningTestPage.tsx` for solo practice:
    - Detect solo context via `!sessionCode`
    - Pass `effectivePlayerMode` to AudioPlayer
    - Conditionally hide session-specific UI (sync indicator, headphone button)

  - [x] **7.5** Implement progress saving for solo mode:
    - Created `useSoloProgress` hook in `src/hooks/audio/useSoloProgress.ts`
    - Saves section, position, speed, volume to localStorage
    - 7-day expiry, resume prompt, clear on completion

---

- [x] **8.0 Google Drive Deprecation & Audio Validation**
  > Remove Google Drive upload option from test creation, add warning badges to existing tests with Google Drive audio, and implement audio format validation (MP3, WAV, M4A, AAC, OGG).
  - [x] **8.1** Update `src/skills/listening/builders/ListeningTestBuilder.tsx`:
    - ~~Remove Google Drive URL input field~~ Already done - R2 only
    - ~~Remove any "Use Google Drive" toggle~~ Already done
    - Keep direct upload field only (R2 Storage)
  
  - [x] **8.2** Add audio format validation:
    - On file upload, check extension: .mp3, .wav, .m4a, .aac, .ogg
    - Also check MIME type with lenient matching
    - Show error for unsupported formats
    - Show warning (confirm dialog) for large files (> 50MB)
  
  - [x] **8.3** Update `src/services/googleDriveAudio.ts`:
    - Added `isDeprecated = true` flag to service
    - Added `getDeprecationWarning()` method
    - All existing functionality preserved for backwards compatibility
  
  - [x] **8.4** Create deprecation warning badge component:
    - Create `src/components/ui/DeprecatedAudioBadge.tsx`
    - Show: "⚠️ Audio source deprecated - please re-upload"
    - Tooltip with more info on hover
  
  - [x] **8.5** Show warning in test listing/editing:
    - Detection via `googleDriveAudioService.isGoogleDriveUrl(url)`
    - Use `DeprecatedAudioBadge` component
    - Can use `getDeprecationWarning()` for warning banner
  
  - [x] **8.6** Keep playback for existing tests:
    - Play capability preserved in AudioPlayer
    - `googleDriveAudioService.validateAudioLink()` and `convertToStreamUrl()` still work
    - Only NEW tests prevented from using Google Drive

---

- [x] **9.0 Disconnected Student Handling & Reconnection**
  > Handle disconnected students by auto-submitting as "incomplete" when test ends. Implement reconnection logic: students jump to teacher's position; teacher resumes from last known position.

  - [x] **9.1** Detect disconnected students:
    - Track student connection status via Firebase presence
    - When student disconnects, mark in `players/{studentId}/status: 'disconnected'`
    - Track disconnection timestamp
  
  - [x] **9.2** Implement auto-submit for disconnected students:
    - When teacher ends test, check for disconnected students
    - For each disconnected student with unsaved answers:
      - Submit their current answers to `test_results`
      - Mark as `isIncomplete: true` and `submittedBy: 'system-disconnect'`
      - Preserve all answers collected before disconnect
  
  - [x] **9.3** Update `useMonitorControls.endTest()`:
    - Before clearing session data, iterate through players
    - Call auto-submit for any disconnected players
    - Wait for all auto-submits to complete before clearing
  
  - [x] **9.4** Implement student reconnection:
    - When student reconnects (Firebase connection restored):
      - Read current masterAudioState
      - Jump audio to teacher's current position
      - Resume sync as normal
      - Show brief notification: "Reconnected, syncing..."
  
  - [x] **9.5** Implement teacher reconnection:
    - When teacher reconnects:
      - Resume from last known position (stored locally)
      - Broadcast masterAudioState with 'resume' action
      - Students receive update and rewind if necessary
  
  - [x] **9.6** Handle teacher behind students:
    - If teacher's position is behind students after reconnect
    - Students rewind to match teacher
    - Show message: "Rewinding to sync with teacher..."
    - Some content repetition is acceptable

---

- [x] **10.0 Exam Mode & Override Priority**
  > Add `examMode` toggle to session settings that disables all accommodations. Implement override priority: Student Accommodation > Session Setting > Material Default.

  - [x] **10.1** Add examMode toggle to session settings UI:
    - In `TeacherLobbyPage.jsx` or session setup modal
    - Checkbox: "🎓 Exam Mode (disable all accommodations)"
    - When enabled, show warning: "⚠️ Accommodations disabled for this session"
  
  - [x] **10.2** Save examMode to Firebase:
    - Store at `game_sessions/{code}/settings/examMode: true/false`
    - Default: false (accommodations enabled)
  
  - [x] **10.3** Implement override priority logic:
    - Create utility function `resolveAudioControls(material, session, studentAccommodation, examMode)`
    - Priority order:
      1. If examMode = true → use session/material settings (ignore accommodations)
      2. Student Accommodation (if exists) → override everything
      3. Session Setting → override material
      4. Material Default → fallback
  
  - [x] **10.4** Apply override priority in `AudioPlayer.tsx`:
    - Accept all settings sources as props
    - Use resolveAudioControls to determine final audioControls config
    - Apply resolved config to UI visibility/behavior
  
  - [x] **10.5** Log disabled accommodations in exam mode:
    - When examMode is true and student has accommodations:
      - Log to console: "Accommodation for [student] not applied (Exam Mode)"
      - Optionally store in Firebase for audit: `game_sessions/{code}/logs/accommodation_blocked`
  
  - [x] **10.6** Update `StudentDetailModal.tsx`:
    - Added `examMode?: boolean` prop to interface
    - If examMode is true, show warning banner in accommodation section
    - Message: "🎓 Exam Mode Active — Accommodations will not apply to this session"
    - Accommodation section header shows "(Disabled)" suffix when examMode is true
    - Visual change: Red-themed border/background instead of amber when examMode

---

## Implementation Notes

### Firebase Data Structure

```
game_sessions/{code}/
├── masterAudioState/
│   ├── section: number
│   ├── position: number
│   ├── isPlaying: boolean
│   ├── speed: number
│   ├── timestamp: serverTimestamp()
│   ├── lastAction: 'play' | 'pause' | 'seek' | 'section' | 'speed' | 'resume'
│   └── lastActionTimestamp: number
├── settings/
│   ├── audioMode: 'online' | 'offline'
│   └── examMode: boolean
└── players/{studentId}/
    └── headphoneRequest/
        ├── requested: boolean
        ├── requestedAt: number
        ├── status: 'pending' | 'approved' | 'denied'
        ├── approvedAt?: number
        └── deniedAt?: number
```

### Testing Recommendations

1. **Unit Tests**: Focus on sync algorithm (`useAudioSync`), override priority logic, and state management
2. **Integration Tests**: Test Firebase listeners, broadcast/receive cycle
3. **Manual Testing**: Audio sync accuracy, offline mode UX, reconnection scenarios
4. **Performance**: Ensure heartbeat doesn't cause excessive Firebase writes

### Migration Path

1. Deploy new masterAudioState system alongside legacy audioCommand
2. Students check for masterAudioState first, fall back to audioCommand
3. After confirming stability, remove audioCommand support
4. Update all teachers to use audio mode selection

---

*Generated: 2026-02-04*
*Total Sub-tasks: 56*
*Estimated Effort: 37-52 hours (5-7 days)*
