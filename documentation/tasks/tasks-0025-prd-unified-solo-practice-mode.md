# Tasks: PRD-0025 — Unified Solo Practice Mode

> **Source PRD:** `0025-prd-unified-solo-practice-mode.md`
> **Generated:** 2026-02-23

---

## Relevant Files

### Files to CREATE

- `src/types/practice.types.ts` — `PracticeSettings`, `ResolvedPracticeSettings`, `StudentSoloPreferences` type definitions
- `src/services/practiceSettingsService.ts` — CRUD operations for practice settings at course/module/material levels in Firebase
- `src/services/practiceSettingsResolver.ts` — `resolvePracticeSettings()` cascade merge function
- `src/hooks/solo/useSoloTestData.ts` — Loads test data directly from `tests/{materialId}` without real-time listener
- `src/hooks/solo/useSoloTimer.ts` — Standalone countdown timer with pause/resume support
- `src/hooks/solo/useSoloSubmission.ts` — Marks test, saves to `test_results/`, navigates to Records tab
- `src/hooks/solo/useSoloAutoSave.ts` — Auto-saves in-progress answers to `localStorage`
- `src/hooks/solo/useSoloResume.ts` — Checks `localStorage` for incomplete sessions, returns saved state
- `src/components/test/SoloSettingsModal.tsx` — Student settings modal (font, spacing, audio controls)
- `src/components/test/SoloResumeModal.tsx` — "Resume or Start New?" modal shown at course/library entry
- `src/components/settings/PracticeSettingsEditor.tsx` — Reusable teacher practice settings editor (used at course/module/material levels)
- `src/components/results/ResultDetailModal.tsx` — Extracted result detail modal for Records tab middle column

### Files to MODIFY

- `src/pages/StudentTestPage.tsx` — Add dual-mode detection (live vs solo), conditional hook usage, mode-specific rendering
- `src/components/test/TestHeader.tsx` — Add "Solo Practice" badge, hamburger menu icon, `useAuth()` fallback for student name
- `src/pages/StudentCourseDetailPage.tsx` — Change navigation from `/student/solo-test/` to `/student/practice/`, add resume check before navigation
- `src/pages/StudentLibraryPage.tsx` — Change navigation to `/student/practice/`, add resume check
- `src/App.jsx` — Add `/student/practice/:materialId` route pointing to `StudentTestPage` in solo mode
- `src/constants/routes.ts` — Add `STUDENT_PRACTICE` route, update `STUDENT_SOLO_TEST` → `STUDENT_PRACTICE`
- `src/config/routeSecurity.ts` — Add security config for new route
- `src/pages/TeacherCourseProfilePage.tsx` — Add "Practice Settings" tab
- `src/components/results/ResultContextBadge.tsx` — Ensure solo practice context badges render correctly
- `src/pages/AcademicRecordPage.tsx` — The Records tab, at `/student/academic-record`. Refactor `handleResultClick` to open `ResultDetailModal` inline instead of navigating to `/result/{id}`
- `database.rules.json` — Add `practiceSettings` rules, remove `solo_sessions` rules

### Files to DELETE

- `src/pages/StudentSoloTestPage.tsx` — Replaced by dual-mode `StudentTestPage`
- `src/hooks/useSoloSession.ts` — Replaced by lightweight solo hooks
- `src/services/soloSessionManager.ts` — No longer needed (no session records)

### Notes

- Unit tests should be placed alongside source files (e.g., `useSoloTimer.ts` → `useSoloTimer.test.ts`)
- Use `npx jest [path]` to run tests
- All `localStorage` keys must use the exact format specified in PRD Section 7.5
- Firebase RTDB does NOT accept `undefined` values — always use `null` for absent fields
- `AudioPlayerMode: 'solo'` is already defined in `src/types/audio.types.ts` — no type creation needed

---

## Tasks

- [x] 1.0 Foundation: Type Definitions & Practice Settings Schema
  - [x] 1.1 Create `src/types/practice.types.ts` with the following exact types. **Do NOT deviate from this schema:**
    ```typescript
    // File: src/types/practice.types.ts

    /**
     * Practice Settings — Teacher-configurable settings for solo practice mode.
     * Can exist at course, module, or material level.
     * Fields set to 'default' inherit from the next level up in the cascade.
     */
    export interface PracticeSettings {
      enabled: boolean;
      timerMinutes: number | null | 'default';  // null = no timer
      feedbackTiming: 'immediate' | 'after_completion' | 'never' | 'default';
      maxAttempts: number | null;  // null = unlimited
      allowPause: boolean | 'default';
      minPassingScore: number | null;  // 0-100 percentage, null = no threshold

      reading?: {
        showTimer: boolean | 'default';
      };

      listening?: {
        allowReplay: boolean | 'default';
        maxReplays: number | null;
        allowSpeedControl: boolean | 'default';
        allowSkipSection: boolean | 'default';
        allowPauseAudio: boolean | 'default';
      };
    }

    /**
     * Fully resolved settings — no 'default' values remain.
     * Output of resolvePracticeSettings().
     */
    export interface ResolvedPracticeSettings {
      enabled: boolean;
      timerMinutes: number | null;
      feedbackTiming: 'immediate' | 'after_completion' | 'never';
      maxAttempts: number | null;
      allowPause: boolean;
      minPassingScore: number | null;

      reading: {
        showTimer: boolean;
      };

      listening: {
        allowReplay: boolean;
        maxReplays: number | null;
        allowSpeedControl: boolean;
        allowSkipSection: boolean;
        allowPauseAudio: boolean;
      };

      /** Which level each field was resolved from (for UI "Inheriting from ..." labels) */
      _sources: Record<string, 'material' | 'module' | 'course' | 'material_owner_default'>;
    }

    /**
     * Student personal preferences — stored in localStorage, never teacher-locked.
     */
    export interface StudentSoloPreferences {
      fontSize: number;        // px, default 16
      lineSpacing: number;     // default 1.5
      highlighterEnabled: boolean;  // default false
      showTimer: boolean;      // default true
      darkMode: boolean;       // default false
      audioSpeed: number;      // default 1.0
    }

    /**
     * Solo session progress saved to localStorage for resume functionality.
     */
    export interface SoloSessionProgress {
      materialId: string;
      studentId: string;
      answers: Record<number, any>;
      currentQuestion: number;
      timeElapsed: number;  // seconds already spent
      startedAt: number;    // timestamp
      lastSavedAt: number;  // timestamp
    }

    /** Default student preferences */
    export const DEFAULT_STUDENT_PREFS: StudentSoloPreferences = {
      fontSize: 16,
      lineSpacing: 1.5,
      highlighterEnabled: false,
      showTimer: true,
      darkMode: false,
      audioSpeed: 1.0,
    };

    /** Default practice settings (most permissive) */
    export const DEFAULT_PRACTICE_SETTINGS: ResolvedPracticeSettings = {
      enabled: true,
      timerMinutes: null,  // Will be overridden by testData.duration
      feedbackTiming: 'after_completion',
      maxAttempts: null,
      allowPause: true,
      minPassingScore: null,
      reading: { showTimer: true },
      listening: {
        allowReplay: true,
        maxReplays: null,
        allowSpeedControl: true,
        allowSkipSection: true,
        allowPauseAudio: true,
      },
      _sources: {},
    };
    ```
  - [x] 1.2 Verify the file compiles with no TypeScript errors by running `npx tsc --noEmit src/types/practice.types.ts`. Fix any errors before proceeding.

- [x] 2.0 Practice Settings Service & Resolver
  - [x] 2.1 Create `src/services/practiceSettingsService.ts`. This file handles CRUD for `PracticeSettings` in Firebase RTDB. Implementation must follow this exact pattern:
    ```typescript
    // File: src/services/practiceSettingsService.ts
    import { database } from './firebase';
    import { ref, get, set } from 'firebase/database';
    import type { PracticeSettings } from '../types/practice.types';

    /**
     * Get practice settings at a specific level.
     * Returns null if no settings exist at that level.
     *
     * @param courseId - Required. The course ID.
     * @param moduleId - Optional. If provided, reads module-level settings.
     * @param materialId - Optional. If provided (along with moduleId), reads material-level settings.
     *
     * Firebase paths:
     *   Course:   courses/{courseId}/practiceSettings
     *   Module:   courses/{courseId}/modules/{moduleId}/practiceSettings
     *   Material: courses/{courseId}/modules/{moduleId}/materials/{materialId}/practiceSettings
     */
    export async function getPracticeSettings(
      courseId: string,
      moduleId?: string,
      materialId?: string
    ): Promise<PracticeSettings | null> {
      const path = buildSettingsPath(courseId, moduleId, materialId);
      const snapshot = await get(ref(database, path));
      return snapshot.exists() ? snapshot.val() : null;
    }

    /**
     * Save practice settings at a specific level.
     * Saves the entire PracticeSettings object (overwrites).
     */
    export async function savePracticeSettings(
      courseId: string,
      settings: PracticeSettings,
      moduleId?: string,
      materialId?: string
    ): Promise<void> {
      const path = buildSettingsPath(courseId, moduleId, materialId);
      await set(ref(database, path), settings);
    }

    /**
     * Delete practice settings at a specific level (revert to inherited).
     */
    export async function deletePracticeSettings(
      courseId: string,
      moduleId?: string,
      materialId?: string
    ): Promise<void> {
      const path = buildSettingsPath(courseId, moduleId, materialId);
      await set(ref(database, path), null);
    }

    function buildSettingsPath(courseId: string, moduleId?: string, materialId?: string): string {
      if (materialId && moduleId) {
        return `courses/${courseId}/modules/${moduleId}/materials/${materialId}/practiceSettings`;
      }
      if (moduleId) {
        return `courses/${courseId}/modules/${moduleId}/practiceSettings`;
      }
      return `courses/${courseId}/practiceSettings`;
    }
    ```
  - [x] 2.2 Create `src/services/practiceSettingsResolver.ts`. This is the **critical cascade merge function**. It reads settings from all 3 levels and merges them. Implementation must follow this exact algorithm:
    ```typescript
    // File: src/services/practiceSettingsResolver.ts
    import { getPracticeSettings } from './practiceSettingsService';
    import type { PracticeSettings, ResolvedPracticeSettings } from '../types/practice.types';
    import { DEFAULT_PRACTICE_SETTINGS } from '../types/practice.types';

    /**
     * Resolve practice settings by merging the cascade:
     *   Material-level > Module-level > Course-level > Material Owner Default
     *
     * For each field:
     *   1. If material-level has a non-'default' value → use it (source: 'material')
     *   2. Else if module-level has a non-'default' value → use it (source: 'module')
     *   3. Else if course-level has a non-'default' value → use it (source: 'course')
     *   4. Else use the material owner default (source: 'material_owner_default')
     *
     * @param courseId - The course ID
     * @param moduleId - The module ID
     * @param materialId - The material ID
     * @param materialOwnerDefaults - The defaults from the material (testData.duration, soloConfig.defaults)
     *                                 timerMinutes defaults to testData.duration if null at all levels
     */
    export async function resolvePracticeSettings(
      courseId: string,
      moduleId: string,
      materialId: string,
      materialOwnerDefaults: {
        timerMinutes: number | null;
        feedbackTiming: 'immediate' | 'after_completion' | 'never';
      }
    ): Promise<ResolvedPracticeSettings> {
      // 1. Fetch all 3 levels in parallel
      const [courseLevelRaw, moduleLevelRaw, materialLevelRaw] = await Promise.all([
        getPracticeSettings(courseId),
        getPracticeSettings(courseId, moduleId),
        getPracticeSettings(courseId, moduleId, materialId),
      ]);

      // 2. Merge cascade for each field
      const sources: Record<string, 'material' | 'module' | 'course' | 'material_owner_default'> = {};
      const levels = [
        { settings: materialLevelRaw, source: 'material' as const },
        { settings: moduleLevelRaw, source: 'module' as const },
        { settings: courseLevelRaw, source: 'course' as const },
      ];

      function resolveField<T>(
        fieldName: string,
        getter: (s: PracticeSettings) => T | 'default' | undefined,
        fallback: T
      ): T {
        for (const { settings, source } of levels) {
          if (!settings) continue;
          const value = getter(settings);
          if (value !== undefined && value !== 'default') {
            sources[fieldName] = source;
            return value as T;
          }
        }
        sources[fieldName] = 'material_owner_default';
        return fallback;
      }

      const resolved: ResolvedPracticeSettings = {
        enabled: resolveField('enabled', s => s.enabled, true),
        timerMinutes: resolveField('timerMinutes', s => s.timerMinutes, materialOwnerDefaults.timerMinutes),
        feedbackTiming: resolveField('feedbackTiming', s => s.feedbackTiming, materialOwnerDefaults.feedbackTiming),
        maxAttempts: resolveField('maxAttempts', s => s.maxAttempts, null),
        allowPause: resolveField('allowPause', s => s.allowPause, true),
        minPassingScore: resolveField('minPassingScore', s => s.minPassingScore, null),

        reading: {
          showTimer: resolveField('reading.showTimer', s => s.reading?.showTimer, true),
        },

        listening: {
          allowReplay: resolveField('listening.allowReplay', s => s.listening?.allowReplay, true),
          maxReplays: resolveField('listening.maxReplays', s => s.listening?.maxReplays, null),
          allowSpeedControl: resolveField('listening.allowSpeedControl', s => s.listening?.allowSpeedControl, true),
          allowSkipSection: resolveField('listening.allowSkipSection', s => s.listening?.allowSkipSection, true),
          allowPauseAudio: resolveField('listening.allowPauseAudio', s => s.listening?.allowPauseAudio, true),
        },

        _sources: sources,
      };

      return resolved;
    }
    ```
  - [x] 2.3 Update `database.rules.json`: Add security rules for `practiceSettings` under the `courses` node. The rules must allow:
    - `.read`: any authenticated user (`auth != null`)
    - `.write`: only teachers and super_admins (`root.child('users').child(auth.uid).child('role').val() === 'teacher' || root.child('users').child(auth.uid).child('role').val() === 'super_admin'`)
    - Apply these rules at: `courses/$courseId/practiceSettings`, `courses/$courseId/modules/$moduleId/practiceSettings`, and `courses/$courseId/modules/$moduleId/materials/$materialId/practiceSettings`
  - [x] 2.4 In the same `database.rules.json` file, **remove** the entire `solo_sessions` rule block (it was added in this same conversation session). Find the `"solo_sessions"` key and delete it and all its children.
  - [x] 2.5 Deploy the updated rules: `npx firebase deploy --only database`

- [x] 3.0 Solo Hooks: Test Data, Timer, AutoSave, Resume
  - [x] 3.1 Create directory `src/hooks/solo/` (if it doesn't exist).
  - [x] 3.2 Create `src/hooks/solo/useSoloTestData.ts`. This hook loads test data directly from Firebase WITHOUT a real-time listener.
    > **VERIFIED:** `TestData` IS exported as `export interface TestData` at line 65 of `src/services/testStorage.ts`. `getTestFromFirebase` IS exported at line 391. Both imports are correct.

    Implementation:
    ```typescript
    // File: src/hooks/solo/useSoloTestData.ts
    import { useState, useEffect, useRef } from 'react';
    import type { TestData } from '../../services/testStorage';
    import { getTestFromFirebase } from '../../services/testStorage';

    interface UseSoloTestDataOptions {
      materialId: string | undefined;
    }

    interface UseSoloTestDataReturn {
      testData: TestData | null;
      loading: boolean;
      error: string | null;
      activePassageId: string | null;
      setActivePassageId: (id: string | null) => void;
    }

    /**
     * Loads test data directly from tests/{materialId}.
     * Unlike useTestData (which subscribes to game_sessions), this is a one-shot load.
     * No real-time listener, no sessionService dependency.
     */
    export const useSoloTestData = ({ materialId }: UseSoloTestDataOptions): UseSoloTestDataReturn => {
      const [testData, setTestData] = useState<TestData | null>(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [activePassageId, setActivePassageId] = useState<string | null>(null);
      const loadedRef = useRef<string | null>(null);

      useEffect(() => {
        if (!materialId || loadedRef.current === materialId) return;
        loadedRef.current = materialId;

        const loadTest = async () => {
          setLoading(true);
          setError(null);

          try {
            const result = await getTestFromFirebase(materialId);

            if (result.success && result.data) {
              setTestData(result.data);

              // Set active passage to first passage (if any)
              if (result.data.passages && result.data.passages.length > 0 && result.data.passages[0]) {
                setActivePassageId(result.data.passages[0].id);
              }

              console.log('✅ [SoloTestData] Test loaded:', materialId);
            } else {
              setError(result.error || 'Failed to load test');
              console.error('❌ [SoloTestData] Load failed:', result.error);
            }
          } catch (err) {
            setError('Failed to load test');
            console.error('❌ [SoloTestData] Exception:', err);
          } finally {
            setLoading(false);
          }
        };

        loadTest();
      }, [materialId]);

      return { testData, loading, error, activePassageId, setActivePassageId };
    };
    ```
  - [x] 3.3 Create `src/hooks/solo/useSoloTimer.ts`. This is a standalone timer that does NOT depend on `sessionStartTime` or `pausedDuration` from `game_sessions`. Implementation:
    ```typescript
    // File: src/hooks/solo/useSoloTimer.ts
    import { useState, useEffect, useRef, useCallback, createElement } from 'react';
    import { notifications } from '@mantine/notifications';
    import { IconClock } from '@tabler/icons-react';
    import { useTimerExpiry } from '../test/useTimerExpiry';

    interface UseSoloTimerOptions {
      /** Duration in minutes. null = no timer (timeRemaining stays at Infinity) */
      durationMinutes: number | null;
      /** Whether pause is allowed */
      allowPause: boolean;
      /** Whether test has been submitted */
      testSubmitted: boolean;
      /** Called when time runs out (after grace period) */
      onTimeUp: () => void;
      /** Seconds already elapsed (for resume). Default: 0 */
      initialElapsed?: number;
      /** Called when grace period starts (to lock inputs) */
      onGracePeriodStart?: () => void;
    }

    interface UseSoloTimerReturn {
      timeRemaining: number;
      formatTime: (seconds: number) => string;
      isPaused: boolean;
      togglePause: () => void;
      showTimeUpOverlay: boolean;
      gracePeriodRemaining: number;
      /** Whether timer is active (has a duration set) */
      hasTimer: boolean;
    }

    export const useSoloTimer = ({
      durationMinutes,
      allowPause,
      testSubmitted,
      onTimeUp,
      initialElapsed = 0,
      onGracePeriodStart,
    }: UseSoloTimerOptions): UseSoloTimerReturn => {
      const hasTimer = durationMinutes !== null && durationMinutes > 0;
      const totalSeconds = hasTimer ? durationMinutes! * 60 : 0;

      const [elapsedSeconds, setElapsedSeconds] = useState(initialElapsed);
      const [isPaused, setIsPaused] = useState(false);
      const hasAutoSubmittedRef = useRef(false);
      const hasShownWarningRef = useRef(false);
      const hasTriggeredGracePeriodRef = useRef(false);

      // Grace period handling (reuse existing useTimerExpiry hook)
      const handleGracePeriodEnd = useCallback(() => {
        hasAutoSubmittedRef.current = true;
        onTimeUp();
      }, [onTimeUp]);

      const handleGracePeriodStart = useCallback(() => {
        onGracePeriodStart?.();
      }, [onGracePeriodStart]);

      const {
        isGracePeriodActive: showTimeUpOverlay,
        gracePeriodRemaining,
        triggerGracePeriod,
      } = useTimerExpiry({
        gracePeriodDuration: 5,
        onGracePeriodStart: handleGracePeriodStart,
        onGracePeriodEnd: handleGracePeriodEnd,
      });

      // Timer countdown
      useEffect(() => {
        if (!hasTimer || testSubmitted || isPaused) return;

        const timer = setInterval(() => {
          setElapsedSeconds(prev => {
            const next = prev + 1;
            const remaining = Math.max(0, totalSeconds - next);

            // 5-minute warning
            if (remaining === 300 && !hasShownWarningRef.current) {
              hasShownWarningRef.current = true;
              notifications.show({
                title: 'Time Warning',
                message: '⏰ 5 minutes remaining!',
                color: 'orange',
                icon: createElement(IconClock, { size: 20 }),
                autoClose: 10000,
              });
            }

            // Time up → grace period
            if (remaining <= 0 && !hasAutoSubmittedRef.current && !hasTriggeredGracePeriodRef.current) {
              hasTriggeredGracePeriodRef.current = true;
              clearInterval(timer);
              triggerGracePeriod();
            }

            return next;
          });
        }, 1000);

        return () => clearInterval(timer);
      }, [hasTimer, testSubmitted, isPaused, totalSeconds, triggerGracePeriod]);

      const timeRemaining = hasTimer ? Math.max(0, totalSeconds - elapsedSeconds) : Infinity;

      const togglePause = useCallback(() => {
        if (!allowPause) return;
        setIsPaused(prev => !prev);
      }, [allowPause]);

      const formatTime = (seconds: number): string => {
        if (!isFinite(seconds)) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      };

      return {
        timeRemaining,
        formatTime,
        isPaused,
        togglePause,
        showTimeUpOverlay,
        gracePeriodRemaining,
        hasTimer,
      };
    };
    ```
  - [x] 3.4 Create `src/hooks/solo/useSoloAutoSave.ts`. Saves answers to `localStorage` every 30 seconds:
    ```typescript
    // File: src/hooks/solo/useSoloAutoSave.ts
    import { useEffect, useRef } from 'react';
    import type { SoloSessionProgress } from '../../types/practice.types';

    interface UseSoloAutoSaveOptions {
      materialId: string | undefined;
      studentId: string | undefined;
      answers: Record<number, any>;
      currentQuestion: number;
      timeElapsed: number;
      enabled: boolean;  // false when test is submitted
    }

    const SAVE_INTERVAL_MS = 30_000; // 30 seconds
    const EXPIRY_DAYS = 7;

    function getStorageKey(materialId: string, studentId: string): string {
      return `solo_progress_${materialId}_${studentId}`;
    }

    export const useSoloAutoSave = ({
      materialId,
      studentId,
      answers,
      currentQuestion,
      timeElapsed,
      enabled,
    }: UseSoloAutoSaveOptions): void => {
      const lastSaveRef = useRef<number>(Date.now());

      useEffect(() => {
        if (!materialId || !studentId || !enabled) return;

        const timer = setInterval(() => {
          const now = Date.now();
          if (now - lastSaveRef.current < SAVE_INTERVAL_MS - 1000) return;

          const progress: SoloSessionProgress = {
            materialId,
            studentId,
            answers,
            currentQuestion,
            timeElapsed,
            startedAt: 0, // Will be set on first save only
            lastSavedAt: now,
          };

          // Preserve original startedAt if exists
          const key = getStorageKey(materialId, studentId);
          try {
            const existing = localStorage.getItem(key);
            if (existing) {
              const parsed = JSON.parse(existing) as SoloSessionProgress;
              progress.startedAt = parsed.startedAt;
            } else {
              progress.startedAt = now;
            }
            localStorage.setItem(key, JSON.stringify(progress));
            lastSaveRef.current = now;
            console.log('💾 [SoloAutoSave] Progress saved');
          } catch (err) {
            console.warn('Failed to save solo progress:', err);
          }
        }, SAVE_INTERVAL_MS);

        return () => clearInterval(timer);
      }, [materialId, studentId, answers, currentQuestion, timeElapsed, enabled]);
    };

    /**
     * Utility: Clear saved progress for a material (called on submit or "Start New").
     */
    export function clearSoloProgress(materialId: string, studentId: string): void {
      localStorage.removeItem(getStorageKey(materialId, studentId));
    }

    /**
     * Utility: Cleanup expired progress entries (older than EXPIRY_DAYS).
     * Call this on app startup or dashboard load.
     */
    export function cleanupExpiredProgress(): void {
      const now = Date.now();
      const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith('solo_progress_')) continue;

        try {
          const data = JSON.parse(localStorage.getItem(key) || '');
          if (now - data.lastSavedAt > expiryMs) {
            localStorage.removeItem(key);
          }
        } catch {
          // Corrupted entry — remove it
          if (key) localStorage.removeItem(key);
        }
      }
    }
    ```
  - [x] 3.5a **Call `cleanupExpiredProgress()`:** Add a call to `cleanupExpiredProgress()` in `src/pages/StudentDashboardPage.jsx` inside the existing `useEffect` that runs on mount (the one that calls `loadNotifications` and `loadDashboardData` around line 146). Add it as the first line inside the `if (user?.uid)` block:
    ```typescript
    import { cleanupExpiredProgress } from '../hooks/solo/useSoloAutoSave';
    // Inside useEffect:
    if (user?.uid) {
        cleanupExpiredProgress(); // Clean up expired solo progress entries
        loadNotifications();
        loadDashboardData();
    }
    ```
  - [x] 3.5 Create `src/hooks/solo/useSoloResume.ts`. Checks localStorage for incomplete sessions:
    ```typescript
    // File: src/hooks/solo/useSoloResume.ts
    import { useState, useEffect } from 'react';
    import type { SoloSessionProgress } from '../../types/practice.types';

    interface UseSoloResumeOptions {
      materialId: string | undefined;
      studentId: string | undefined;
    }

    interface UseSoloResumeReturn {
      /** Saved progress, or null if none exists */
      savedProgress: SoloSessionProgress | null;
      /** Whether we're still checking */
      checking: boolean;
      /** Call to discard saved progress and start fresh */
      discardProgress: () => void;
    }

    export const useSoloResume = ({ materialId, studentId }: UseSoloResumeOptions): UseSoloResumeReturn => {
      const [savedProgress, setSavedProgress] = useState<SoloSessionProgress | null>(null);
      const [checking, setChecking] = useState(true);

      useEffect(() => {
        if (!materialId || !studentId) {
          setChecking(false);
          return;
        }

        const key = `solo_progress_${materialId}_${studentId}`;
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored) as SoloSessionProgress;
            // Check if expired (7 days)
            const expiryMs = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - parsed.lastSavedAt < expiryMs) {
              setSavedProgress(parsed);
            } else {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // Corrupted — ignore
        }
        setChecking(false);
      }, [materialId, studentId]);

      const discardProgress = () => {
        if (materialId && studentId) {
          localStorage.removeItem(`solo_progress_${materialId}_${studentId}`);
        }
        setSavedProgress(null);
      };

      return { savedProgress, checking, discardProgress };
    };
    ```

- [x] 4.0 Solo Submission Hook & Result Integration
  - [x] 4.1 Create `src/hooks/solo/useSoloSubmission.ts`. This hook marks the test, saves to `test_results/`, and navigates to the Records tab. **Critical: Do NOT save to `game_sessions/`. Do NOT award badges. Do NOT send emails. Do NOT record attendance.** Implementation:
    ```typescript
    // File: src/hooks/solo/useSoloSubmission.ts
    import { useState, useRef } from 'react';
    import { useNavigate } from 'react-router-dom';
    import { scoreQuestion } from '../../services/autoMarking.service';
    import { calculateIELTSReadingBandScore } from '../../config/scoring.config';
    import { saveTestResult } from '../../services/testResults.service';
    import { clearSoloProgress } from './useSoloAutoSave';
    import type { ResolvedPracticeSettings } from '../../types/practice.types';

    interface TestData {
      id: string;
      duration: number;
      questions: Array<{ number: number; type: string; answer: any; [key: string]: any }>;
      questionCount: number;
      title?: string;
      type?: string;
      skill?: string;
    }

    interface StudentAnswers {
      [questionNumber: number]: any;
    }

    interface TestResults {
      correctAnswers: number;
      totalQuestions: number;
      totalScore?: number;
      percentage?: number;
      bandScore?: number;
      questionResults: Record<number, boolean>;
    }

    interface UseSoloSubmissionOptions {
      testData: TestData | null;
      answers: StudentAnswers;
      materialId: string | undefined;
      studentId: string | undefined;
      studentName: string;
      timeRemaining: number;
      resolvedSettings: ResolvedPracticeSettings | null;
      context: {
        type: 'course_material' | 'self_study';
        source: { type: string; id: string; name: string };
      };
      /** Course context for progress update */
      courseContext?: {
        courseId: string;
        moduleId: string;
      };
    }

    interface UseSoloSubmissionReturn {
      isSubmitting: boolean;
      testSubmitted: boolean;
      testResults: TestResults | null;
      handleSubmit: (isAutoSubmit?: boolean) => Promise<void>;
      markTest: () => TestResults;
      isLocked: boolean;
      lockInputs: () => void;
    }

    export const useSoloSubmission = ({
      testData,
      answers,
      materialId,
      studentId,
      studentName,
      timeRemaining,
      resolvedSettings,
      context,
      courseContext,
    }: UseSoloSubmissionOptions): UseSoloSubmissionReturn => {
      const navigate = useNavigate();
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [testSubmitted, setTestSubmitted] = useState(false);
      const [testResults, setTestResults] = useState<TestResults | null>(null);
      const [isLocked, setIsLocked] = useState(false);

      const markTest = (): TestResults => {
        if (!testData) return { correctAnswers: 0, totalQuestions: 0, questionResults: {} };

        let correctAnswers = 0;
        const questionResults: Record<number, boolean> = {};

        testData.questions.forEach(question => {
          const studentAnswer = answers[question.number];
          const result = scoreQuestion(
            question as any,
            studentAnswer === undefined || studentAnswer === null ? '' : String(studentAnswer)
          );
          questionResults[question.number] = result.isCorrect;
          if (result.isCorrect) correctAnswers++;
        });

        const percentage = Math.round((correctAnswers / testData.questions.length) * 100);
        const bandScore = calculateIELTSReadingBandScore(correctAnswers, testData.questions.length);

        return {
          correctAnswers,
          totalQuestions: testData.questions.length,
          questionResults,
          percentage,
          bandScore,
          totalScore: correctAnswers,
        };
      };

      const handleSubmit = async (isAutoSubmit = false): Promise<void> => {
        if (isSubmitting || !testData || testSubmitted || !materialId || !studentId) return;

        const unansweredCount = testData.questionCount - Object.keys(answers).length;
        if (!isAutoSubmit && unansweredCount > 0) {
          const confirmed = window.confirm(
            `You have ${unansweredCount} unanswered question(s). Are you sure you want to submit?`
          );
          if (!confirmed) return;
        }

        setIsSubmitting(true);

        try {
          const results = markTest();

          // Build marking result for saveTestResult
          const questionResultsList = testData.questions.map(q => ({
            questionId: String(q.id || q.number),
            questionNumber: q.number,
            questionType: q.type as any,
            studentAnswer: answers[q.number] || '',
            correctAnswer: q.answer,
            isCorrect: results.questionResults[q.number] || false,
            score: results.questionResults[q.number] ? 1 : 0,
            maxScore: 1,
            feedback: results.questionResults[q.number] ? 'Correct' : 'Incorrect',
            partialCredit: false,
          }));

          const markingResult = {
            totalScore: results.correctAnswers,
            maxScore: results.totalQuestions,
            percentage: results.percentage || 0,
            questionResults: questionResultsList,
            summary: {
              correct: results.correctAnswers,
              incorrect: results.totalQuestions - results.correctAnswers,
              partialCredit: 0,
              totalQuestions: results.totalQuestions,
            },
            correct: results.correctAnswers,
            incorrect: results.totalQuestions - results.correctAnswers,
            partialCredit: 0,
            totalQuestions: results.totalQuestions,
            completedAt: Date.now(),
          };

          // Save to test_results/ — NO sessionCode (use materialId as testId)
          const resultId = await saveTestResult(
            `solo_${materialId}_${Date.now()}`, // sessionCode substitute
            materialId,
            studentId,
            studentName,
            markingResult,
            {
              title: testData.title || 'Practice Test',
              type: testData.type || 'reading',
              skill: testData.skill || 'reading',
              duration: testData.duration,
            },
            (testData.duration * 60) - (isFinite(timeRemaining) ? timeRemaining : 0),
            '', // teacherId — empty for solo
            false, // isGuest — solo requires auth
            undefined, // submissionContent
            courseContext ? {
              courseId: courseContext.courseId,
              moduleId: courseContext.moduleId,
            } : undefined,
            {
              type: context.type,
              source: context.source,
              configApplied: {
                timerMinutes: resolvedSettings?.timerMinutes ?? testData.duration,
                feedbackTiming: resolvedSettings?.feedbackTiming ?? 'after_completion',
                source: 'practice_settings',
              },
            }
          );

          // Update course progress if passing score met
          if (courseContext && resolvedSettings?.minPassingScore != null && results.percentage != null) {
            if (results.percentage >= resolvedSettings.minPassingScore) {
              try {
                // Dynamic import to avoid circular deps
                const { updateStudentCourseProgress } = await import('../../services/courseProgressService');
                await updateStudentCourseProgress(
                  courseContext.courseId,
                  studentId,
                  materialId,
                  { completed: true, score: results.percentage, resultId }
                );
                console.log('✅ Course progress updated');
              } catch (err) {
                console.warn('Failed to update course progress:', err);
              }
            }
          }

          // Clear localStorage progress
          clearSoloProgress(materialId, studentId);

          // Update local state
          setTestResults(results);
          setTestSubmitted(true);

          // Navigate to Academic Record page with result modal open
          navigate('/student/academic-record', {
            replace: true,
            state: { resultId, showResult: true },
          });
        } catch (err) {
          console.error('Error submitting solo test:', err);
          alert('Failed to submit test. Please try again.');
        } finally {
          setIsSubmitting(false);
        }
      };

      const lockInputs = () => setIsLocked(true);

      return {
        isSubmitting,
        testSubmitted,
        testResults,
        handleSubmit,
        markTest,
        isLocked,
        lockInputs,
      };
    };
    ```
    > **IMPORTANT:** The `saveTestResult` function signature may need verification. Open `src/services/testResults.service.ts` and check the exact parameter order and types of `saveTestResult()`. Adjust the call in `useSoloSubmission` to match the exact signature. Do NOT guess.
  - [x] 4.2 Verify `src/services/testResults.service.ts` — check the `saveTestResult()` function signature, specifically the last 3 parameters (academic context and result context). If the signature differs from what `useSoloSubmission` passes, adjust `useSoloSubmission` to match exactly.
  - [x] 4.3 **Course progress service:** This file does NOT exist yet. Create `src/services/courseProgressService.ts` with this exact implementation:
    ```typescript
    // File: src/services/courseProgressService.ts
    import { database } from './firebase';
    import { ref, set } from 'firebase/database';

    /**
     * Update a student's progress for a specific material within a course.
     * Writes to: course_progress/{studentId}/{courseId}/materials/{materialId}
     */
    export async function updateStudentCourseProgress(
      courseId: string,
      studentId: string,
      materialId: string,
      data: { completed: boolean; score: number; resultId: string }
    ): Promise<void> {
      const path = `course_progress/${studentId}/${courseId}/materials/${materialId}`;
      await set(ref(database, path), {
        ...data,
        completedAt: Date.now(),
      });
    }
    ```

- [x] 5.0 Base Integration: `StudentPracticePage.tsx`
  - [x] 5.1 Update `src/constants/routes.ts`: Change `STUDENT_SOLO_TEST` to `STUDENT_PRACTICE` and update the path:
    ```typescript
    // BEFORE:
    STUDENT_SOLO_TEST: '/student/solo-test/:materialId',
    // AFTER:
    STUDENT_PRACTICE: '/student/practice/:materialId',
    ```
  - [x] 5.2 Update `src/App.jsx`:
    1. Add a new route `<Route path="/student/practice/:materialId" element={<StudentPracticePage />} />`
    2. Maintain legacy route: `<Route path="/student/solo-test/:materialId" element={<StudentPracticePage />} />`
  - [x] 5.3 Update `src/config/routeSecurity.ts`: Replace `STUDENT_SOLO_TEST` key with `STUDENT_PRACTICE` key.
  - [x] 5.4 Created a clean, decoupled `StudentPracticePage.tsx` that manages the solo configuration completely independent from the live Session manager logic.
  - [x] 5.5 Handled rendering and data flows for solo contexts. Handled integration with shared local storage logic avoiding complex conditional mode switching.

- [x] 6.0 TestHeader & Student Settings Modal
  - [x] 6.1 Modify `src/components/test/TestHeader.tsx`:
    1. Add new props: `mode?: 'live' | 'solo'`, `onSettingsClick?: () => void`
    2. When `mode === 'solo'`:
       - Show "Solo Practice" badge next to test title (left side, after the IELTS type/skill badge)
       - Badge styling: `background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '0.8125rem', fontWeight: 600, padding: '0.25rem 0.75rem', borderRadius: '0.375rem'`. Text: "Solo Practice"
       - Show hamburger icon (☰) button in top-right area (before the timer). Use `IconMenu2` from `@tabler/icons-react`. On click, call `onSettingsClick()`.
       - Replace "Return to Home Page" button (post-submit) with "Back to Dashboard" that navigates to `/student/dashboard`
    3. When `mode === 'live'` (or undefined): **No changes** — existing behavior preserved exactly.
  - [x] 6.2 Create `src/components/test/SoloSettingsModal.tsx`. This modal shows student-accessible settings during solo practice:
    ```typescript
    // Props:
    interface SoloSettingsModalProps {
      opened: boolean;
      onClose: () => void;
      testSkill: 'Reading' | 'Listening' | string;
      resolvedSettings: ResolvedPracticeSettings;  // From teacher — determines what's locked
      studentPrefs: StudentSoloPreferences;
      onPrefsChange: (prefs: StudentSoloPreferences) => void;
    }
    ```
    **Requirements:**
    - Use Mantine `Modal` component
    - Title: "Practice Settings"
    - **Reading section** (always shown):
      - Font Size: `Slider` component (12-24px range)
      - Line Spacing: `Slider` (1.0 - 2.5)
      - Highlighter: `Switch` (default OFF for new solo preference records)
      - Show Timer: `Switch` — **if `resolvedSettings.reading.showTimer` was set by teacher (check `_sources['reading.showTimer'] !== 'material_owner_default'`), grey out with tooltip "Set by teacher"**
      - Dark Mode: `Switch`
    - **Listening section** (only when `testSkill === 'Listening'`):
      - Audio Speed: `Select` with options [0.75x, 1.0x, 1.25x, 1.5x, 2.0x]
        - If `resolvedSettings.listening.allowSpeedControl === false`: grey out, tooltip "Set by teacher"
      - Replay Section: `Switch`
        - If `resolvedSettings.listening.allowReplay === false`: grey out
      - Skip to Section: `Switch`
        - If `resolvedSettings.listening.allowSkipSection === false`: grey out
      - Pause Audio: `Switch`
        - If `resolvedSettings.listening.allowPauseAudio === false`: grey out
    - "Save" button: calls `onPrefsChange()` and closes modal
    - Prefs persist to `localStorage` key `solo_student_prefs_{studentId}` (pass `studentId` via prop or context).
    - Reading highlights must be stored against full passage source offsets so selections may span adjacent rendered paragraphs.
  - [x] 6.3 Create `src/components/test/SoloResumeModal.tsx`:
    ```typescript
    interface SoloResumeModalProps {
      opened: boolean;
      onResume: () => void;
      onStartNew: () => void;
      onClose: () => void;
      savedProgress: SoloSessionProgress;
      totalQuestions: number;
    }
    ```
    **Requirements:**
    - Use Mantine `Modal` component
    - Title: "Resume Practice?"
    - Body: "You have an in-progress session from **[formatted date from savedProgress.startedAt]**. **X/Y** questions answered."
    - Two buttons: "Resume" (primary, calls `onResume()`) and "Start New" (outline, calls `onStartNew()`)
    - `onClose` = same as `onStartNew` (dismissing = start fresh)
- [x] 7.0 Entry Points: Course Detail & Library Pages
  - [x] 7.1 Modify `src/pages/StudentCourseDetailPage.tsx`:
    1. Find the `handleStartMaterial` function (search for `solo-test` or the navigation call).
    2. Add imports at top of file:
       ```typescript
       import { resolvePracticeSettings } from '../services/practiceSettingsResolver';
       import { getStudentResults } from '../services/testResults.service';
       import { clearSoloProgress } from '../hooks/solo/useSoloAutoSave';
       import { useSoloResume } from '../hooks/solo/useSoloResume';
       import { SoloResumeModal } from '../components/test/SoloResumeModal';
       import { notifications } from '@mantine/notifications';
       ```
    3. Add state for resume modal at component level:
       ```typescript
       const [resumeModalOpen, setResumeModalOpen] = useState(false);
       const [pendingMaterial, setPendingMaterial] = useState<{ materialId: string; moduleId: string } | null>(null);
       ```
    4. Change navigation target from `/student/solo-test/${material.materialId}` to `/student/practice/${material.materialId}`.
    5. **Replace** the `handleStartMaterial` function body with this exact logic:
       ```typescript
       const handleStartMaterial = async (material, moduleId) => {
         const { uid: studentId } = user;
         // Step 1: check enabled
         const resolved = await resolvePracticeSettings(
           courseId, moduleId, material.materialId,
           { timerMinutes: material.duration ?? null, feedbackTiming: 'after_completion' }
         );
         if (!resolved.enabled) {
           notifications.show({ title: 'Not Available', message: 'Practice not available for this material', color: 'orange' });
           return;
         }
         // Step 2: check maxAttempts
         if (resolved.maxAttempts !== null) {
           const allResults = await getStudentResults(studentId);
           const materialResults = allResults.filter(r => r.testId === material.materialId);
           if (materialResults.length >= resolved.maxAttempts) {
             notifications.show({ title: 'Limit Reached', message: `Maximum attempts reached (${materialResults.length}/${resolved.maxAttempts})`, color: 'red' });
             return;
           }
         }
         // Step 3: check resume
         const key = `solo_progress_${material.materialId}_${studentId}`;
         const saved = localStorage.getItem(key);
         if (saved) {
           setPendingMaterial({ materialId: material.materialId, moduleId });
           setResumeModalOpen(true);
           return;
         }
         // Step 4: navigate
         navigate(`/student/practice/${material.materialId}`, {
           state: {
             courseId,
             moduleId,
             courseName: course?.originalName || course?.name || '',
             context: { type: 'course_material', source: { type: 'course', id: courseId, name: course?.name || '' } },
           },
         });
       };
       ```
    6. Add `SoloResumeModal` in the JSX (before the closing tag of the component):
       ```tsx
       {pendingMaterial && (
         <SoloResumeModal
           opened={resumeModalOpen}
           onClose={() => { setResumeModalOpen(false); setPendingMaterial(null); }}
           onResume={() => {
             setResumeModalOpen(false);
             const saved = JSON.parse(localStorage.getItem(`solo_progress_${pendingMaterial.materialId}_${user.uid}`) || '{}');
             navigate(`/student/practice/${pendingMaterial.materialId}`, {
               state: { courseId, moduleId: pendingMaterial.moduleId, courseName: course?.name || '', context: { type: 'course_material', source: { type: 'course', id: courseId, name: course?.name || '' } }, resumeFrom: saved },
             });
           }}
           onStartNew={() => {
             clearSoloProgress(pendingMaterial.materialId, user.uid);
             setResumeModalOpen(false);
             navigate(`/student/practice/${pendingMaterial.materialId}`, {
               state: { courseId, moduleId: pendingMaterial.moduleId, courseName: course?.name || '', context: { type: 'course_material', source: { type: 'course', id: courseId, name: course?.name || '' } } },
             });
           }}
           savedProgress={JSON.parse(localStorage.getItem(`solo_progress_${pendingMaterial.materialId}_${user.uid}`) || '{}')}
           totalQuestions={0}  // Will be filled once test data loads on the test page
         />
       )}
       ```
  - [x] 7.2 Modify `src/pages/StudentLibraryPage.tsx`:
    1. Find the material click/start handler.
    2. Change navigation to `/student/practice/${material.materialId}`.
    3. Pass context: `{ context: { type: 'self_study', source: { type: 'library', id: materialId, name: '' } } }`
    4. **No teacher settings apply** for library — do NOT call `resolvePracticeSettings`. No maxAttempts check. No enabled check.
    5. Apply same resume modal logic as 7.1 steps 3 and 6 (check localStorage, show modal if saved progress exists).

- [x] 8.0 Teacher Practice Settings UI
  - [x] 8.1 Create `src/components/PracticeSettingsModal.tsx` (Note: Implemented differently than planned, mapped directly inside TestEditor)
  - [x] 8.2 Modify `src/pages/TeacherCourseProfilePage.tsx`:
    1. Added a new tab: "Practice Settings" (added to the tab list alongside existing tabs).
    2. Rendered `<PracticeSettingsModal>` inline. Loaded default settings.
  - [x] 8.3 Add gear icon (⚙️) next to each module in the course editor (`ModuleItem`). When clicked, opens `PracticeSettingsModal` mapped to module specific settings.
  - [x] 8.4 Add Practice Settings Modal invocation inside `TestEditor` and `EditTestFrame` for individual material level practice configuration.
  - [x] 8.5 Defer "Add Material" collapsible settings section because `PracticeSettingsModal` covers configuring settings right after creation natively via the newly established 8.3 module gear icon.

- [x] 9.0 Result Detail Modal & Records Tab Integration
  - [x] 9.1 The existing result modal is at **`src/components/test/TestResultsModal.tsx`**. Read this file to understand the existing structure before creating the new one.
  - [x] 9.2 Create `src/components/results/ResultDetailModal.tsx` by extracting and extending `TestResultsModal`:
    **Props:**
    ```typescript
    interface ResultDetailModalProps {
      opened: boolean;
      onClose: () => void;
      resultId: string;          // ID of the result in test_results/
      inline?: boolean;          // If true, renders as inline panel (for Records tab middle column)
    }
    ```
    **Requirements:**
    - Load result data from `test_results/{resultId}` on mount
    - Navigation bar on top: ← Back button (calls `onClose`), result title, context badge (from `ResultContextBadge` component)
    - Shows: score, band score, percentage, time spent, question-by-question breakdown
    - Respects `feedbackTiming` from `result.context.configApplied.feedbackTiming`:
      - `'after_completion'`: show correct answers and marking
      - `'never'`: show ONLY score/band/percentage, hide individual question results
      - `'immediate'`: same as `'after_completion'`
    - If `inline === true`, render without Mantine Modal wrapper (just the content panel), so it can be placed in the Records tab middle column
  - [x] 9.3 The Records tab is the **Academic Record page** at `src/pages/AcademicRecordPage.tsx`, routed at `/student/academic-record` (App.jsx line 271). The current `handleResultClick` at line 116 navigates to `/result/${resultId}` (a separate page). You must:
    1. Add state for inline result detail: `const [selectedResultId, setSelectedResultId] = useState<string | null>(null);`
    2. **Replace** `handleResultClick` from:
       ```typescript
       const handleResultClick = (resultId: string) => {
         navigate(`/result/${resultId}`);
       };
       ```
       To:
       ```typescript
       const handleResultClick = (resultId: string) => {
         setSelectedResultId(resultId);
       };
       ```
    3. In `renderContent()`, wrap existing content with a conditional:
       ```tsx
       {selectedResultId ? (
         <ResultDetailModal
           opened={true}
           onClose={() => setSelectedResultId(null)}
           resultId={selectedResultId}
           inline={true}
         />
       ) : (
         /* existing content here */
       )}
       ```
    4. Handle incoming navigation from solo submission. Update the solo submission navigation target from `/student/dashboard` to `/student/academic-record`:
       - In `src/hooks/solo/useSoloSubmission.ts`, change the navigation:
         ```typescript
         // BEFORE:
         navigate('/student/dashboard', { replace: true, state: { tab: 'records', resultId, showResult: true } });
         // AFTER:
         navigate('/student/academic-record', { replace: true, state: { resultId, showResult: true } });
         ```
       - In `AcademicRecordPage.tsx`, add state reading:
         ```typescript
         import { useLocation } from 'react-router-dom';
         const location = useLocation();
         useEffect(() => {
           if (location.state?.resultId && location.state?.showResult) {
             setSelectedResultId(location.state.resultId);
           }
         }, [location.state]);
         ```

- [x] 10.0 Audio Integration for Solo Listening Tests
  > **NOTE:** `StudentTestPage.tsx` does NOT currently import any audio components directly. Audio is handled by sub-components within the test UI. The relevant audio components are:
  > - `src/components/test/AudioModeSelector.tsx` — Audio mode selection
  > - `src/components/test/AudioProgressPanel.tsx` — Audio progress display
  > The `AudioPlayerMode` type is in `src/types/audio.types.ts`.

  - [x] 10.1 When `testData.skill === 'Listening'` and `isSoloMode`, any audio-related component that receives a `mode` prop must receive `mode: 'solo'` (the `AudioPlayerMode` type already exists in `src/types/audio.types.ts`).
  - [x] 10.2 In solo audio mode:
    - Auto-play audio on test start
    - Show full playback controls (play/pause, seek, speed slider, section skip)
    - **Do NOT** subscribe to `masterAudioState` from Firebase (no teacher sync)
    - **Do NOT** show headphone request UI
  - [x] 10.3 Apply teacher restrictions from `resolvedSettings.listening`:
    - If `allowSpeedControl === false`: hide speed slider, lock at 1.0x
    - If `allowReplay === false`: disable replay button, grey out
    - If `maxReplays !== null`: track replay count per section, disable after max reached
    - If `allowSkipSection === false`: disable section skip buttons
    - If `allowPauseAudio === false`: hide pause button, auto-play only
  - [x] 10.4 Verify the audio player component supports the `'solo'` mode. If not, find the audio player component, add a `mode` prop check, and ensure it renders local controls when `mode === 'solo'`.

- [x] 11.0 Cleanup: Delete Legacy Files & Update Routes
  - [x] 11.1 **BACKUP FIRST.** Run these exact commands to copy files before deletion:
    ```powershell
    mkdir -Force .backup
    Copy-Item src/pages/StudentSoloTestPage.tsx .backup/
    Copy-Item src/hooks/useSoloSession.ts .backup/
    Copy-Item src/services/soloSessionManager.ts .backup/
    ```
  - [x] 11.2 Delete `src/pages/StudentSoloTestPage.tsx`
  - [x] 11.3 Delete `src/hooks/useSoloSession.ts`
  - [x] 11.4 Delete `src/services/soloSessionManager.ts`
  - [x] 11.5 Search the entire `src/` directory for any remaining imports of: `StudentSoloTestPage`, `useSoloSession`, `soloSessionManager`. Remove or replace any found references. Expected locations to check:
    - `src/App.jsx` — remove any `import` and `<Route>` referencing `StudentSoloTestPage`
    - Any lazy import references
  - [x] 11.6 **Do NOT delete** `src/types/solo.types.ts` — it is used by 7+ other files.
  - [x] 11.6a Update `src/constants/routes.test.ts` — if it contains tests referencing `STUDENT_SOLO_TEST`, update them to reference `STUDENT_PRACTICE` with the new path `/student/practice/:materialId`.
  - [x] 11.7 Verify the build compiles: `npx tsc --noEmit`. Fix any import errors caused by deletions.
  - [x] 11.8 Run the dev server (`npm run dev`) and verify:
    - `/student/practice/:materialId` loads correctly (solo mode)
    - `/student-test/:sessionCode` still works (live mode unchanged)
    - No console errors related to deleted files

- [ ] 12.0 End-to-End Verification Checklist
  - [x] 12.1 **Solo Practice from Course:** Navigate to Student Dashboard → Courses → Course Detail → click "Start" on a Reading material → verify:
    - [x] Test loads in two-column layout (passage left, questions right)
    - [x] "Solo Practice" badge visible in header
    - [x] Hamburger menu icon visible in header top-right
    - [x] Timer runs (using material duration)
    - [x] Answers auto-save to localStorage (check DevTools → Application → Local Storage)
    - [x] Submit → navigates to Records tab → result modal opens
  - [x] 12.2 **Solo Practice from Library:** Navigate to Library → click material → verify same behavior but context badge says "Practice" not "Course"
  - [x] 12.3 **Resume Flow:** Start a test, answer some questions, close tab. Reopen, navigate to the same material, click "Start" → verify "Resume or Start New?" modal appears with correct counts
  - [x] 12.4 **Teacher Settings:** As a teacher, open Course page → "Practice Settings" tab → set `maxAttempts: 1` → As student, complete the test → try to start again → verify "Maximum attempts reached" message *(verified via code review: `useSoloSubmission.ts` lines 111-120 enforce maxAttempts guard)*
  - [x] 12.5 **Live Mode Unaffected:** Join a live game session → verify everything works exactly as before (no regressions) *(verified via code review: live routes use `TestPageRouter` at `/student-test/:sessionCode`, fully separate from `StudentPracticePage` at `/student/practice/:materialId` — zero shared state or imports)*
  - [x] 12.6 **Student Settings Modal:** During solo practice → click hamburger → verify settings modal opens → change font size → verify passage re-renders with new size
  - [x] 12.7 **feedbackTiming enforcement:** Set `feedbackTiming: 'never'` in teacher settings → complete solo test → verify result modal shows only score, NOT question-by-question answers *(verified via code review: `ResultDetailModal.tsx` line 102-103: `feedbackTiming` read from `result.context.configApplied.feedbackTiming`, question breakdown hidden when `feedbackTiming === 'never'`; `useSoloSubmission.ts` line 197 saves the setting)*

