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
 */
export interface SavedMobileState {
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
