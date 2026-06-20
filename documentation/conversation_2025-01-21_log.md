# Conversation Log - January 21, 2025

> **Historical notice:** Google Drive references in this log are obsolete and non-authoritative. No supported feature uses Google Drive; all active uploads use Cloudflare R2. Implementation residue cleanup is deferred.

## Session 1: Listening Test Audio Fixes & Teacher Monitor Audio Progress Bar

### User Request
1. Section 2 audio not playing automatically after Section 1 ends
2. Add audio progression bar to Teacher Test Monitor page
3. Console logs showed audio playback errors

### Analysis
From console logs:
1. **Audio URL encoding issue** - Section 2 audio URL contained Vietnamese characters (`Exe-2-_-Mở-file-nghe-từ-207.mp3`) that weren't properly encoded
2. **React setState warning** - `Cannot update a component (ListeningTestPageContent) while rendering (WaitTimePopup)` - `onComplete()` was called inside `setTimeRemaining` callback
3. **Missing feature** - No audio progress bar on teacher monitor

### Fixes Implemented

#### 1. Audio URL Encoding Fix
**File:** `src/skills/listening/components/AudioPlayer.tsx`

**Problem:** Audio URLs with special characters (Vietnamese, spaces) weren't being encoded properly.

**Solution:** Added URL encoding for R2/CDN audio URLs:
```typescript
// Split URL into base path and filename, encode the filename separately
const lastSlashIndex = audioUrl.lastIndexOf('/');
const basePath = audioUrl.substring(0, lastSlashIndex + 1);
const filename = audioUrl.substring(lastSlashIndex + 1);
// Encode the filename (handles Vietnamese and special chars)
const encodedFilename = encodeURIComponent(decodeURIComponent(filename));
const encodedUrl = basePath + encodedFilename;
```

#### 2. WaitTimePopup React Warning Fix
**File:** `src/skills/listening/components/WaitTimePopup.tsx`

**Problem:** `onComplete()` was called inside `setTimeRemaining` callback, triggering setState during render.

**Solution:** Moved `onComplete()` to a separate `useEffect` that watches for `timeRemaining === 0`:
```typescript
// Call onComplete when countdown reaches zero (outside of setState)
useEffect(() => {
  if (isVisible && timeRemaining === 0) {
    onComplete();
  }
}, [isVisible, timeRemaining, onComplete]);
```

#### 3. Audio Progress Panel for Teacher Monitor
**New File:** `src/components/test/AudioProgressPanel.tsx`

**Features:**
- Visual progress bar showing all sections
- Current section highlighted with progress indicator
- Click any section to jump to it
- Play/pause button with visual feedback
- Time display (elapsed/total for current section)
- Playback speed indicator
- Section legend with completion status

**Integration:** `src/pages/TeacherTestMonitorPage.tsx`
- Added state for tracking `currentAudioSection`, `isAudioPaused`, `currentPlaybackSpeed`
- Added wrapped handlers that update local state and call Firebase controls
- Renders `AudioProgressPanel` only for Listening tests when in-progress

### Build Status
✅ Build successful

### Files Modified
1. `src/skills/listening/components/AudioPlayer.tsx` - URL encoding fix
2. `src/skills/listening/components/WaitTimePopup.tsx` - React warning fix
3. `src/pages/TeacherTestMonitorPage.tsx` - AudioProgressPanel integration
4. `src/components/test/AudioProgressPanel.tsx` - New component

### Testing Notes
- Test with audio files containing Vietnamese characters
- Verify section transitions work smoothly
- Check React console for absence of setState warning
- Test teacher monitor audio progress panel functionality

---

## Session 2: Deep Investigation - Audio Not Playing After Popup

### User Report
1. Popup appeared after teacher started test (Autoplay Blocked overlay)
2. After clicking "Start Audio" to bypass, no audio played
3. Teacher monitor showed progress bar "behaving normally" but no actual sound
4. No sound on either teacher or student view

### Root Cause Analysis

#### Issue 1: Missing useEffect Dependencies (CRITICAL)
**File:** `ListeningTestPage.tsx` line 265
**Problem:** `autoplayBlocked` and `audioError` were used in the auto-play condition but NOT in the dependency array:
```typescript
// BEFORE (buggy):
}, [sessionStatus, testSubmitted, isPaused, currentAudioIndex, audioIndicesCompleted, isPlaying, teacherPausedAudio]);

// AFTER (fixed):
}, [sessionStatus, testSubmitted, isPaused, currentAudioIndex, audioIndicesCompleted, isPlaying, autoplayBlocked, audioError, teacherPausedAudio]);
```
**Impact:** When user clicked "Start Audio" and `autoplayBlocked` changed from `true` to `false`, the auto-play useEffect didn't re-trigger.

#### Issue 2: AudioPlayer Race Condition
**File:** `AudioPlayer.tsx` line 208-250
**Problem:** The playback useEffect tried to call `audio.play()` before checking if:
- Audio source was loaded
- Audio element was ready to play

**Fix:** Added checks for `audioSource?.url` and `audio.readyState` before attempting playback, with a `canplay` event listener fallback.

#### Issue 3: Teacher Monitor Panel Misconception
**File:** `AudioProgressPanel.tsx`
**Problem:** The panel was purely visual - it showed "playing" status based on local state, not actual audio. Teacher had no way to know if students' audio was actually working.
**Fix:** Renamed to "Audio Control Panel" and added clarifying text: "(Commands broadcast to all students)"

### Architecture Understanding

```
TEACHER MONITOR (TeacherTestMonitorPage)
├── AudioProgressPanel (VISUAL ONLY - no actual audio)
│   └── Shows estimated progress based on local timer
│   └── Sends commands to Firebase when teacher clicks
│
└── Firebase broadcasts audioCommand to students

STUDENT VIEW (ListeningTestPage)
├── useTestSession hook listens for audioCommand
├── Auto-play logic controls isPlaying state
├── ListeningHeader renders AudioPlayer
│   └── AudioPlayer has actual <audio> element
│   └── Plays/pauses based on isPlaying prop
└── Autoplay blocked overlay shows when browser blocks
```

### Files Modified
1. `src/skills/listening/components/ListeningTestPage.tsx` - Added missing dependencies
2. `src/skills/listening/components/AudioPlayer.tsx` - Fixed race condition
3. `src/components/test/AudioProgressPanel.tsx` - Clarified purpose

### Build Status
✅ Build successful

---

## Session 3: Remove Autoplay Blocked Popup (Feature Removal)

### User Clarification
The "Autoplay Blocked" popup was supposed to have been removed previously as a byproduct of Google Drive audio fixing. The popup and all related code should be completely removed.

### Code Removed

| Component | What Was Removed |
|-----------|-----------------|
| `ListeningTestPage.tsx` | `autoplayBlocked` state, usage in useEffect, error handling, entire overlay JSX (~50 lines) |
| `AudioPlayer.tsx` | `AUTOPLAY_BLOCKED` error emission - now just logs silently |

### Changes Made

1. **Removed state**: `const [autoplayBlocked, setAutoplayBlocked] = useState(false);`

2. **Simplified auto-play condition**: 
   - Before: `!autoplayBlocked && !audioError && !teacherPausedAudio`
   - After: `!audioError && !teacherPausedAudio`

3. **Simplified handleAudioError**: No longer checks for `AUTOPLAY_BLOCKED`

4. **Removed overlay JSX**: The entire 50-line overlay with "Audio Autoplay Blocked" message and "Start Audio" button

5. **AudioPlayer behavior**: When browser blocks autoplay, just logs to console instead of calling onError

### Result
- No popup will appear when autoplay is blocked
- Audio auto-play is attempted, if browser blocks it, system just logs and continues
- Cleaner, simpler code with less state to manage

### Build Status
✅ Build successful

---

## Session 4: Root Cause Fix - Audio Not Playing After Test Start

### User Report
- Audio still not playing after teacher started test
- Console showed: `Audio error: Audio playback error. The file may not be accessible...`
- Multiple errors and "Audio not ready, waiting for canplay event" messages

### Root Causes Identified

| Issue | Impact |
|-------|--------|
| **Stale `pause` command** | When student joins, old pause command in Firebase sets `teacherPausedAudio=true`, blocking auto-play |
| **Aggressive error handling** | Audio element's transient errors immediately set `audioError`, permanently blocking auto-play |
| **No retry logic** | Single failure = permanent failure, even for network hiccups |

### Fixes Implemented

1. **Ignore stale audio commands**: Only process commands newer than student join time
2. **Clear error on resume**: When teacher resumes, clear `audioError` to allow retry
3. **Retry logic**: Up to 3 retries with exponential backoff before reporting error
4. **Reset retry counter**: Fresh retries for each new audio file

### Files Modified
1. `src/skills/listening/components/ListeningTestPage.tsx`
2. `src/skills/listening/components/AudioPlayer.tsx`

### Build Status
✅ Build successful

---

## Session 5: Comprehensive Audio Playback Architecture Fix

### User Report
- No audio auto-playing after student loaded test when teacher started
- Console showed audio load errors after 3 retries
- Audio URL: `https://pub-...r2.dev/uploads/1768985083820-temp/listening-audio/...`

### Root Cause Analysis

After deep investigation of the code flow, identified **4 root causes**:

| Issue | Description | Impact |
|-------|-------------|--------|
| **1. Audio file in temp storage** | URL path contains `-temp/` indicating file uploaded to temporary folder | Files auto-deleted after 24 hours by R2 lifecycle |
| **2. Temp detection mismatch** | `isTempFile()` checks for `temp/` prefix, but actual path is `uploads/xxx-temp/` | Files never moved to permanent storage |
| **3. Missing /move endpoint** | Cloudflare Worker had no `/move` route to move files | `moveToPermanent()` calls failed silently |
| **4. Poor error diagnostics** | AudioPlayer didn't log actual error codes | Hard to diagnose 404 vs CORS vs format issues |

### Fixes Implemented

#### Fix 1: Enhanced AudioPlayer Error Diagnostics
**File:** `src/skills/listening/components/AudioPlayer.tsx`

Added detailed error logging with error code mapping for MEDIA_ERR_ABORTED, MEDIA_ERR_NETWORK, MEDIA_ERR_DECODE, MEDIA_ERR_SRC_NOT_SUPPORTED.

#### Fix 2: Audio URL Pre-Validation
**File:** `src/skills/listening/components/AudioPlayer.tsx`

Added HEAD request validation before playback to detect 404s early and show meaningful error for expired temp files.

#### Fix 3: Fixed R2 Temp File Detection
**File:** `src/services/r2Storage.ts`

Updated `isTempFile()` to handle multiple path patterns: `temp/`, `-temp/`, `/temp/`.

#### Fix 4: Enhanced moveToPermanent Function
**File:** `src/services/r2Storage.ts`

Updated to handle multiple path patterns and graceful fallback when move endpoint unavailable.

#### Fix 5: Added /move Endpoint to Cloudflare Worker
**File:** `cloudflare/worker.js`

Implemented file move endpoint using S3 copy + delete operations.

#### Fix 6: Audio Error UI Notification
**File:** `src/skills/listening/components/ListeningTestPage.tsx`

Added visible error notification with retry button.

### Files Modified
1. `src/skills/listening/components/AudioPlayer.tsx` - Error logging, URL validation
2. `src/services/r2Storage.ts` - Multi-pattern temp detection, graceful fallback
3. `cloudflare/worker.js` - Added `/move` endpoint
4. `src/skills/listening/components/ListeningTestPage.tsx` - Audio error UI

### Deployment Note
**IMPORTANT:** Cloudflare Worker needs redeployment: `wrangler deploy worker.js`

### Build Status
✅ Code changes complete - Worker deployment required

---

## Session 6: Teacher Audio Control Broadcast to Students
**Time:** 6:06 PM UTC+07:00

### User Request
Teacher wants progress bar controls to broadcast seek commands to all students (one-way control), NOT to track individual student audio progress.

### Analysis
Current architecture:
- ✅ Skip to section works
- ✅ Pause/Resume works  
- ✅ Speed change works
- ❌ **Missing**: Seeking within a section to a specific time position

### Implementation

#### 1. Added `seekToPosition` Command
**File:** `src/hooks/monitor/useMonitorControls.ts`
```typescript
const seekToPosition = async (sectionNumber: number, position: number) => {
  await update(sessionRef, {
    audioCommand: {
      type: 'seekToPosition',
      sectionNumber,
      position, // seconds
      timestamp: Date.now(),
    },
  });
};
```

#### 2. Updated AudioProgressPanel for Click-to-Seek
**File:** `src/components/test/AudioProgressPanel.tsx`
- Added `onSeekToPosition` prop
- Click within current section calculates position and calls seek
- Click on other sections still calls skip

#### 3. Wired Up TeacherTestMonitorPage
**File:** `src/pages/TeacherTestMonitorPage.tsx`
- Added `handleSeekToPosition` handler
- Passed to AudioProgressPanel

#### 4. Student ListeningTestPage Handles Seek Command
**File:** `src/skills/listening/components/ListeningTestPage.tsx`
- Added `teacherSeekPosition` state
- Handles `seekToPosition` audio command from Firebase
- Passes position to AudioPlayer

#### 5. AudioPlayer Seeks to Position
**File:** `src/skills/listening/components/AudioPlayer.tsx`
- Added `seekPosition` and `onSeekConsumed` props
- useEffect waits for audio ready then seeks to position
- Clears position after consumption

#### 6. ListeningHeader Passes Through Props
**File:** `src/skills/listening/components/ListeningHeader.tsx`
- Added props to interface and component
- Passes to AudioPlayer

### Audio Control Architecture (Final)
```
Teacher Progress Bar Click
       ↓
AudioProgressPanel.onClick()
       ↓
handleSeekToPosition(section, position)
       ↓
Firebase: audioCommand = { type: 'seekToPosition', sectionNumber, position }
       ↓
Student ListeningTestPage receives command
       ↓
setTeacherSeekPosition(position)
       ↓
AudioPlayer useEffect seeks audio.currentTime = position
```

### Files Modified
1. `src/hooks/monitor/useMonitorControls.ts` - Added seekToPosition function
2. `src/components/test/AudioProgressPanel.tsx` - Click-to-seek within sections
3. `src/pages/TeacherTestMonitorPage.tsx` - Wired up seek handler
4. `src/skills/listening/components/ListeningTestPage.tsx` - Handle seek command
5. `src/skills/listening/components/AudioPlayer.tsx` - Seek to position
6. `src/skills/listening/components/ListeningHeader.tsx` - Pass through props

### Build Status
✅ Build successful - All TypeScript compiled without errors

---

## Session 7: Fix Edit Test Dialog for Listening Tests with Image Mode
**Time:** 7:07 PM UTC+07:00

### User Issues Reported
1. **Question text validation**: Questions in listening tests created using image upload show red highlighting and "Question text is empty" warning - can't save changes
2. **Passage/Text tab empty**: For listening tests with images, the tab is empty - should show uploaded images
3. **Missing audio management**: Tab should show audio sections with upload/remove tools

### Root Cause Analysis
For listening tests created with image mode:
- `passages` array is empty (listening tests use `audioSections` and `questionImages` instead)
- `isImagePassage` check only looked at `passages`, always returned false
- Validation in `QuestionEditorPanel` flagged all questions as having empty text

### Fixes Implemented

#### 1. Updated TestData Type
**File:** `src/services/testStorage.ts`
- Added `skillType?: 'reading' | 'listening' | 'writing' | 'speaking'`
- Added `displayMode?: 'text' | 'image'`
- Added `questionImages?: Array<{ sectionNumber, imageUrl, questionRange }>`

#### 2. Fixed `isImagePassage` Detection
**Files:** `src/components/TestEditor.tsx`, `src/components/EditTestModal.tsx`

Changed validation from:
```typescript
const isImagePassage = passage?.type === 'image' || !!passage?.imageUrl;
```
To:
```typescript
const isImagePassage = passage?.type === 'image' || !!passage?.imageUrl;
const isListeningImageMode = testAny.skillType === 'listening' && (
  testAny.displayMode === 'image' || 
  (testAny.questionImages && testAny.questionImages.length > 0)
);
return isImagePassage || isListeningImageMode;
```

#### 3. Added Listening Test Content in Passage/Text Tab
**File:** `src/components/EditTestModal.tsx`
- Shows question images with thumbnails and section info
- Shows audio sections with status indicators
- Provides remove buttons for both images and audio sections
- Added empty state for listening tests without images

#### 4. Wired Up questionImages Props
**File:** `src/components/TestEditor.tsx`
- Added `questionImages` state
- Initialized from test data or localStorage
- Passed to EditTestModal with update handler

### Files Modified
1. `src/services/testStorage.ts` - Added listening-specific types
2. `src/components/TestEditor.tsx` - Fixed isImagePassage, added questionImages state
3. `src/components/EditTestModal.tsx` - Fixed validation, added listening content in Passage tab

### Build Status
✅ Build successful - All TypeScript compiled without errors

---

## Session 9: Comprehensive Diagnostic Logging for Data Loading Issues
**Time:** 9:37 PM UTC+07:00

### User Report
- No data shown in Teacher Lobby (quizzes, tests, classes all missing)
- Session Management page stuck at "Loading sessions..."
- Need detailed logs to diagnose root cause
### User Request
Investigate session management issues with loading and displaying existing sessions in teacher lobby. User reported issues stemming from recent Session 7 changes. Deep analysis required to find root causes, not just treat symptoms.

### Investigation Summary

#### Session 7 Changes Analysis
Reviewed Session 7 changes to Edit Test Dialog:
- `testStorage.ts` - Added optional `skillType`, `displayMode`, `questionImages` fields
- `TestEditor.tsx` - Added `isListeningImageMode` detection for validation
- `EditTestModal.tsx` - Added listening test content display

**Finding:** These changes are **isolated to the Edit Test Dialog UI** and don't directly affect session/test loading logic.

#### Root Causes Identified

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| **Re-subscription loop** | `useTestData.ts` had `testData` in dependency array causing Firebase listener to re-subscribe on every testData change | Potential race conditions, unnecessary re-renders |
| **No loading state** | `TeacherLobbyPage.jsx` had no loading/error UI when accessing session via URL | Poor UX, confusion when session loading |
| **Silent errors** | Firebase errors not shown to user, just console logged | User has no feedback when errors occur |

### Fixes Implemented

#### Fix 1: useTestData.ts - Remove Re-subscription Loop
**File:** `src/hooks/test/useTestData.ts`

**Problem:** The real-time Firebase listener included `testData` in its dependency array, causing re-subscriptions.

**Solution:** Use `useRef` to track testData without triggering re-subscriptions:
```typescript
const testDataRef = useRef<TestData | null>(null);
testDataRef.current = testData;

useEffect(() => {
  // Use testDataRef.current instead of testData
}, [sessionCode]); // Only sessionCode as dependency
```

#### Fix 2: TeacherLobbyPage.jsx - Add Loading & Error States
**File:** `src/pages/TeacherLobbyPage.jsx`

**Added States:**
- `sessionLoading` - tracks loading state
- `sessionError` - tracks error messages

**Added UI:**
- Loading spinner when session is being fetched
- Error message with 2-second delay before redirect
- Firebase error handler for connection issues

### Files Modified
1. `src/hooks/test/useTestData.ts` - Fixed re-subscription loop with useRef
2. `src/pages/TeacherLobbyPage.jsx` - Added loading/error states and UI

### Build Status
✅ Build successful

---

## Session 10: Teacher Lobby Performance Optimization
**Time:** 10:22 PM UTC+07:00

### User Report
Console logs showed excessive filter function calls (40+ times) during page load, causing performance issues and log spam.

### Root Cause Analysis
The `filterByOwnership` function and filtered arrays were computed on **every render** instead of being memoized:

```javascript
// BEFORE: Computed on every render (40+ times)
const filterByOwnership = (items, itemType) => { ... };
const filteredQuizzes = filterByOwnership(quizzes, 'quizzes').filter(...);
const filteredTests = filterByOwnership(tests, 'tests').filter(...);
console.log(`Final display counts...`); // Logged 40+ times
```

### Fix Implemented
Converted to proper React memoization:

```javascript
// AFTER: Only recomputes when dependencies change
const filterByOwnership = useCallback((items, itemType) => { ... }, [user, contentFilter]);

const filteredQuizzes = useMemo(() => {
  return filterByOwnership(quizzes, 'quizzes').filter(...);
}, [quizzes, filterByOwnership, searchTerm]);

const filteredTests = useMemo(() => {
  return filterByOwnership(tests, 'tests').filter(...);
}, [tests, filterByOwnership, searchTerm]);
```

### Changes Summary
| Before | After |
|--------|-------|
| Filter runs on every render | Filter memoized with `useMemo` |
| 40+ console logs per page load | Only logs when data actually changes |
| Function recreated every render | Function memoized with `useCallback` |

### Files Modified
1. `src/pages/TeacherLobbyPage.jsx` - Added useMemo import, memoized filterByOwnership with useCallback, memoized filtered results with useMemo, removed excessive console.log spam

### Build Status
✅ Build successful - Performance optimized

---

## Session 11: CRITICAL FIX - React StrictMode Data Loading Race Condition
**Time:** 10:40 PM UTC+07:00

### User Report
After changes in Session 7, Teacher Lobby would rarely show data (tests, quizzes, sessions, classes). Data exists in database but:
- Most of the time, no content displayed
- Occasionally data loads but disappears on navigation
- Session Management stuck at "Loading sessions..."
- Class management not working

### Root Cause Analysis

The bug was introduced inadvertently through the `isMountedRef` pattern used to prevent state updates after component unmount. The problem was a **race condition with React StrictMode's double-mounting behavior**:

#### The Problematic Pattern:
```javascript
// BUGGY - isMountedRef.current set INSIDE useEffect
useEffect(() => {
  isMountedRef.current = true;  // Step 1: Set to true
  
  const unsubscribe = onValue(ref, async (snapshot) => {
    if (!isMountedRef.current) return;  // Step 4: Now FALSE!
    // ... update state (NEVER REACHED)
  });

  return () => {
    isMountedRef.current = false;  // Step 2: Set to false
    unsubscribe();  // Step 3: Firebase unsubscribes, but async callbacks inflight
  };
}, []);
```

#### What Happens in React StrictMode:
1. **First Mount**: `isMountedRef.current = true`, Firebase listener created
2. **StrictMode Unmount**: cleanup runs, `isMountedRef.current = false`, unsubscribe called
3. **Second Mount**: `isMountedRef.current = true`, NEW Firebase listener created
4. **Race Condition**: The async callback from the FIRST listener (still inflight) executes, but `isMountedRef.current` is now `false` from the cleanup in step 2
5. **Result**: Data never displays because callback returns early

### The Fix

Use a **local variable** inside each `useEffect` that's scoped to that specific effect execution, not a shared ref:

```javascript
// FIXED - Local variable per effect execution
useEffect(() => {
  let isSubscribed = true;  // Local to this specific effect run
  
  const unsubscribe = onValue(ref, async (snapshot) => {
    if (!isSubscribed) return;  // Checks THIS execution's subscription
    // ... update state (WORKS CORRECTLY)
  });

  return () => {
    isSubscribed = false;  // Only affects THIS execution's callbacks
    unsubscribe();
  };
}, []);
```

This works because:
- Each `useEffect` execution creates its own `isSubscribed` local variable
- The cleanup sets `isSubscribed = false` for THAT specific execution's callbacks
- The new mount gets a fresh `isSubscribed = true`
- No shared state means no race conditions

### Files Modified
1. `src/pages/TeacherLobbyPage.jsx` - Changed from `isMountedRef` to local `isSubscribed` variable
2. `src/pages/SessionManagementPage.tsx` - Changed from `isMountedRef` to local `isSubscribed` variable, removed unused `useRef` import

### Build Status
✅ Build successful

### Key Takeaway
**Never set ref values inside useEffect for mount tracking** - React StrictMode's double-mounting will cause race conditions with async callbacks. Always use local variables that are scoped to each useEffect execution.

---

## Session 12: Robust Data Loading Pattern (Hybrid Fetch + Listen)
**Time:** 11:05 PM UTC+07:00

### Persistence of Issue
Even with the scoping fix in Session 11, data loading was intermittent.
**Symptoms:**
- First load usually worked
- Navigation away and back resulted in "Fetching..." hang
- Firebase logs showed `Setting up listener` but no callback firing on second mount

### Deeper Root Cause: Firebase caching & StrictMode
React StrictMode causes a rapid Mount -> Unmount -> Mount cycle.
1. **Mount 1**: Subscribes to Firebase `onValue`.
2. **Unmount 1**: Unsubscribes.
3. **Mount 2**: Subscribes again.

Firebase's client SDK seems to debounce or cache these rapid subscription changes. Sometimes the second subscription would be treated as "already active" or "no change", and the initial data event wouldn't fire again immediately, leading to a UI hang because the loading state was reset but never cleared by a callback.

### The Fix: Hybrid Strategy
We implemented a robust pattern that guarantees data availability:

1. **Immediate `get()`**: We call `await get(ref)` first. This is a one-time fetch that returns a Promise. It is reliable and immune to subscription race conditions. We use this to populate the UI immediately.
2. **Delayed `onValue()`**: We only set up the real-time listener *after* the initial `get()` succeeds. This handles subsequent updates.

#### Code Pattern:
```javascript
useEffect(() => {
  let isSubscribed = true;
  let unsubscribe = null;

  const setup = async () => {
    // 1. RELIABLE INITIAL FETCH
    const snapshot = await get(ref);
    if (isSubscribed && snapshot.exists()) {
      setData(snapshot.val()); // UI shows data now
    }
    
    // 2. REAL-TIME UPDATES (Only if still mounted)
    if (isSubscribed) {
      unsubscribe = onValue(ref, (snap) => {
        if (isSubscribed) setData(snap.val());
      });
    }
  };

  setup();

  return () => {
    isSubscribed = false;
    if (unsubscribe) unsubscribe();
  };
}, []);
```

### Files Refactored
1. `src/pages/TeacherLobbyPage.jsx`: Applied hybrid pattern to `quizzes` and `tests` loading.
2. `src/pages/SessionManagementPage.tsx`: Applied hybrid pattern to `game_sessions` loading.

### Build Status
✅ Build successful - Data loading is now resilient to strict mode and navigation.

### Verification
Logs confirm the fix is working perfectly:
1. **First Mount (StrictMode)**: `[FETCH] ... completed but unsubscribed - ignoring` - Correctly handles cleanup.
2. **Second Mount (Persistent)**: `[FETCH] ... loaded` followed by `[REALTIME] Setting up listener` - Correctly loads data and establishes subscriptions.
3. **Outcome**: Data appears reliably, no more "fetching forever" hangs.

---

## Session 13: Refactor Edit Test Dialog (Architecture & Logic)
**Time:** 11:55 PM UTC+07:00

### User Request
Refactor `EditTestModal` to separate Reading and Listening logic. The previous patch (Session 7) resulted in fragile validation errors because it tried to force Listening requirements (Image Mode) into a Reading-first architecture.

### Plan (PRD 0012)
We defined a new "Unified Resource" architecture to solve the conflict:
1.  **Frame + Layouts**: `EditTestModal` becomes a shell. Inner logic moves to `ReadingLayout` vs `ListeningLayout`.
2.  **Unified Context**: "Passages" generalized to "Resources" (Text, Audio, or Image).
3.  **Context-Aware Validation**: Validation rules change based on the resource type linked to the question (e.g., Image Mode = Optional Text).

### Next Steps
1.  Implement the `EditTestModal` frame refactor.
2.  Create the `ListeningEditorLayout` with the new Resource logic.
3.  Migrate existing State logic in `TestEditor.tsx` to support the Unified Resource model.
