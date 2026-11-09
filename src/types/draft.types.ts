/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHARED CONTRACT: Draft Management System
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file defines the EXACT types, interfaces, and function signatures
 * that BOTH UI and Infrastructure tracks MUST follow.
 *
 * ⚠️ IMPORTANT: Any changes to this file require agreement from BOTH tracks.
 *
 * Created: 2026-02-07
 * PRD Reference: PRD-0022 Test Creation Modal with Draft Management
 * ═══════════════════════════════════════════════════════════════════════════
 */


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Core Enums and Types
// Used by: BOTH UI and Infrastructure tracks
// ─────────────────────────────────────────────────────────────────────────────

/** Supported test types in the system */
export type TestType = 'IELTS' | 'TOEIC' | 'SAT' | 'THCS-THPT' | 'Custom';

/** Skill sections within a test */
export type SkillType = 'reading-v2' | 'listening' | 'writing' | 'speaking' | 'mixed';

/** Test format (primarily for IELTS) */
export type TestFormat = 'academic' | 'general';

/** Draft lifecycle status */

/** Difficulty level for tests */
export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Advanced';

/** CEFR language proficiency levels */
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** IELTS band scores */
export type IELTSBand = '4.0' | '4.5' | '5.0' | '5.5' | '6.0' | '6.5' | '7.0' | '7.5' | '8.0' | '8.5' | '9.0';

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Draft Document Structure
// Implemented by: Infrastructure track
// Consumed by: UI track
// ─────────────────────────────────────────────────────────────────────────────

/** Test metadata collected in Step 3 of the modal */
export interface DraftMetadata {
    /** Required: Test title */
    title: string;

    /** Required: Duration in minutes */
    duration: number;

    /** Optional: Target IELTS band score */
    targetBand?: IELTSBand;

    /** Optional: CEFR proficiency level */
    cefrLevel?: CEFRLevel;

    /** Optional: Difficulty level */
    difficulty?: DifficultyLevel;

    /** Optional: Test description */
    description?: string;

    /** Optional: Tags for categorization (future feature) */
    tags?: string[];
}

// SECTION 3: Modal State Management
// Implemented by: UI track
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceResponse<T = void> {
    success: boolean;
    data?: T;
    error?: string;
}

/** Steps in the test creation modal */
export type ModalStep = 'type' | 'skill' | 'metadata' | 'reading-v2-start' | 'reading-v2-import' | 'reading-v2-auto'
    | 'listening-mode' | 'listening-builder'
    | 'writing-metadata' | 'writing-format' | 'writing-content';

/** Step order for Reading V2 skill - metadata first, then route into Studio */
export const READING_V2_STEP_ORDER: ModalStep[] = ['type', 'skill', 'metadata', 'reading-v2-start', 'reading-v2-import', 'reading-v2-auto'];

/** Step order for Listening skill - metadata and mode are collected before entering builder */
export const LISTENING_STEP_ORDER: ModalStep[] = ['type', 'skill', 'metadata', 'listening-mode', 'listening-builder'];

/** Step order for Writing skill — stays in-modal for all steps */
export const WRITING_STEP_ORDER: ModalStep[] = ['type', 'skill', 'writing-metadata', 'writing-format', 'writing-content'];

/** Data collected across all modal steps */
export interface ModalStepData {
    // Step 1: Type Selection
    testType: TestType | null;

    // Step 2: Skill Selection
    skillType: SkillType | null;

    // Step 3: Metadata (includes format)
    format: TestFormat;
    metadata: Partial<DraftMetadata>;

    // Writing-specific data (for in-modal writing wizard)
    writingMetadata?: {
        title: string;
        description?: string;
        duration: number;
        difficulty?: 'beginner' | 'intermediate' | 'advanced';
        targetBand?: number;
        tags?: string[];
    };
    writingFormat?: 'task1-only' | 'task2-only' | 'full-test';
    writingTasks?: {
        task1: {
            taskType: string;
            promptText: string;
            promptImageUrl?: string;
            wordMinimum: number;
            recommendedTimeMinutes: number;
            modelAnswer?: string;
            showModelAnswerToStudent: boolean;
        };
        task2: {
            taskType: string;
            promptText: string;
            wordMinimum: number;
            recommendedTimeMinutes: number;
            modelAnswer?: string;
            showModelAnswerToStudent: boolean;
        };
    };
}

/** Initial state for modal */
export const INITIAL_MODAL_DATA: ModalStepData = {
    testType: null,
    skillType: null,
    format: 'academic',
    metadata: {},
    writingMetadata: undefined,
    writingFormat: undefined,
    writingTasks: undefined,
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: Default Values
// Used by: Both tracks for consistency
// ─────────────────────────────────────────────────────────────────────────────

/** Default duration options (minutes) */
export const DURATION_OPTIONS = [20, 40, 60] as const;

/** Default metadata for new drafts */
export const DEFAULT_DRAFT_METADATA: DraftMetadata = {
    title: '',
    duration: 60,
};

/** Generate default title */
export function generateDefaultTitle(
    testType: TestType,
    skillType: SkillType
): string {
    const now = new Date();
    const month = now.toLocaleString('en-US', { month: 'long' });
    const year = now.getFullYear();

    const typeLabel = testType === 'THCS-THPT' ? 'Vietnamese' : testType;
    const skillLabel = skillType.charAt(0).toUpperCase() + skillType.slice(1);

    return `${typeLabel} ${skillLabel} Test - ${month} ${year}`;
}
