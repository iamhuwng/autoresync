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
 * Persisted mobile Reading shell state.
 * Must remain JSON-safe because it is stored in RTDB/local storage.
 *
 * The `kind` discriminant was added for the Reading/Listening union.
 * Legacy payloads without `kind` are treated as Reading by hydration helpers.
 */
export interface ReadingSavedMobileState {
    kind?: 'reading';
    activePassageId?: string;
    questionSheetOpen: boolean;
    reviewSummaryOpen: boolean;
    /** Legacy field kept optional so older persisted payloads still hydrate safely. */
    flaggedQuestions?: number[];
    passageScrollByPassage: Record<string, number>;
    activeQuestionGroupByPassage: Record<string, number>;
    questionSheetScrollByPassage: Record<string, number>;
    textSize?: number;
}

/**
 * Persisted mobile Listening shell state.
 * Must remain JSON-safe because it is stored in RTDB/local storage.
 *
 * Field rules (PRD-0045 Section 3):
 * - `viewedPartNumber` is 1-based.
 * - `currentQuestionNumber` is the last active question number within the viewed part.
 * - Record keys for part-based maps must be the string form of the 1-based part number.
 * - `playback` is used only for solo/homework restore. Live mode must not write `playback`.
 */
export interface ListeningSavedMobileState {
    kind: 'listening';
    version: 1;
    compat?: {
        materialId: string;
        scopeKey: string;
        partCount: number;
        questionLayoutSignature: string;
    };
    viewedPartNumber: number;
    currentQuestionNumber?: number;
    textSize?: number;
    answerSheetScrollByPart: Record<string, number>;
    imageZoomByPart: Record<string, { scale: number; offsetX: number; offsetY: number }>;
    playback?: {
        currentAudioIndex: number;
        audioPositionSeconds: number;
        volume: number;
        playbackSpeed: number;
        audioIndicesCompleted: number[];
    };
}

/**
 * Discriminated union of all mobile shell states.
 *
 * Legacy payloads (before the `kind` discriminant existed) lack a `kind` field.
 * Hydration helpers in `mobileReadingState.ts` and `mobileListeningState.ts`
 * handle the legacy case by treating missing `kind` as Reading.
 */
export type SavedMobileState = ReadingSavedMobileState | ListeningSavedMobileState;

export interface SoloProgressScopeContext {
    mode: 'self_study' | 'course_material' | 'homework';
    courseId?: string;
    moduleId?: string;
    homeworkId?: string;
    submissionId?: string;
}

/**
 * Solo session progress saved to localStorage for resume functionality.
 */
export interface SoloSessionProgress {
    materialId: string;
    studentId: string;
    scopeContext?: SoloProgressScopeContext;
    answers: Record<number, any>;
    currentQuestion: number;
    timeElapsed: number;  // seconds already spent
    startedAt: number;    // timestamp
    lastSavedAt: number;  // timestamp
    mobileState?: SavedMobileState;
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
