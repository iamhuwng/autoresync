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

import type { Passage, ParsedQuestion, QuestionType } from './document.types';

// Re-export for convenience
export type { Passage, ParsedQuestion, QuestionType };

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Core Enums and Types
// Used by: BOTH UI and Infrastructure tracks
// ─────────────────────────────────────────────────────────────────────────────

/** Supported test types in the system */
export type TestType = 'IELTS' | 'TOEIC' | 'SAT' | 'THCS-THPT' | 'Custom';

/** Skill sections within a test */
export type SkillType = 'reading' | 'listening' | 'writing' | 'speaking' | 'mixed';

/** Test format (primarily for IELTS) */
export type TestFormat = 'academic' | 'general';

/** Draft lifecycle status */
export type DraftStatus = 'metadata' | 'parsing' | 'review';

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

/** Complete draft document stored in Firebase */
export interface DraftDocument {
    /** Firebase auto-generated document ID */
    id: string;

    /** Owner's Firebase Auth UID */
    userId: string;

    // ─── Test Type Info ───
    testType: TestType;
    skillType: SkillType;
    format: TestFormat;

    // ─── Metadata (from Step 3) ───
    metadata: DraftMetadata;

    // ─── Content (populated after parsing) ───
    /** Parsed passages from source text */
    passages: Passage[];

    /** Parsed questions with answers */
    questions: ParsedQuestion[];

    /** Section instructions keyed by passage ID or "global" */
    sectionInstructions: Record<string, string>;

    // ─── Status Tracking ───
    status: DraftStatus;
    questionCount: number;
    missingAnswerCount: number;

    // ─── Timestamps ───
    createdAt: Date;
    updatedAt: Date;
}

/** Draft list item (for display in Drafts view) */
export interface DraftListItem {
    id: string;
    title: string;
    testType: TestType;
    skillType: SkillType;
    format: TestFormat;
    cefrLevel?: CEFRLevel;
    duration: number;
    status: DraftStatus;
    questionCount: number;
    createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Modal State Management
// Implemented by: UI track
// ─────────────────────────────────────────────────────────────────────────────

/** Steps in the test creation modal */
export type ModalStep = 'type' | 'skill' | 'metadata' | 'upload' | 'parsing';

/** Step order for navigation */
export const MODAL_STEP_ORDER: ModalStep[] = ['type', 'skill', 'metadata', 'upload', 'parsing'];

/** Data collected across all modal steps */
export interface ModalStepData {
    // Step 1: Type Selection
    testType: TestType | null;

    // Step 2: Skill Selection
    skillType: SkillType | null;

    // Step 3: Metadata (includes format)
    format: TestFormat;
    metadata: Partial<DraftMetadata>;

    // Step 4: Source Input
    inputMethod: 'upload' | 'paste';
    sourceContent: string | null;
    sourceFile: File | null;
}

/** Initial state for modal */
export const INITIAL_MODAL_DATA: ModalStepData = {
    testType: null,
    skillType: null,
    format: 'academic',
    metadata: {},
    inputMethod: 'upload',
    sourceContent: null,
    sourceFile: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Draft Service Interface
// Implemented by: Infrastructure track (draftCloudService.ts)
// Called by: UI track
// ─────────────────────────────────────────────────────────────────────────────

/** Standard service response wrapper */
export interface ServiceResponse<T = void> {
    success: boolean;
    data?: T;
    error?: string;
}

/** Draft service function signatures */
export interface DraftServiceInterface {
    /**
     * Create a new draft document
     * Called when: User completes Step 3 (metadata) and starts parsing
     */
    createDraft(
        userId: string,
        testType: TestType,
        skillType: SkillType,
        format: TestFormat,
        metadata: DraftMetadata
    ): Promise<ServiceResponse<{ draftId: string }>>;

    /**
     * Load a draft by ID
     * Called when: User navigates to /teacher/test/review/:draftId
     */
    loadDraft(
        draftId: string
    ): Promise<ServiceResponse<DraftDocument>>;

    /**
     * Update draft with partial data
     * Called when: Auto-save during review, or explicit save
     */
    updateDraft(
        draftId: string,
        updates: Partial<Omit<DraftDocument, 'id' | 'userId' | 'createdAt'>>
    ): Promise<ServiceResponse>;

    /**
     * Delete a draft permanently
     * Called when: User clicks Delete on draft card, or after successful publish
     */
    deleteDraft(
        draftId: string
    ): Promise<ServiceResponse>;

    /**
     * Get all drafts for a user
     * Called when: User views Drafts tab in Materials page
     */
    getUserDrafts(
        userId: string
    ): Promise<ServiceResponse<DraftListItem[]>>;

    /**
     * Update only the draft status
     * Called when: Draft transitions between phases (metadata → parsing → review)
     */
    updateDraftStatus(
        draftId: string,
        status: DraftStatus
    ): Promise<ServiceResponse>;

    /**
     * Save parsed content to draft
     * Called when: Parsing completes successfully
     */
    saveParsedContent(
        draftId: string,
        passages: Passage[],
        questions: ParsedQuestion[],
        sectionInstructions: Record<string, string>
    ): Promise<ServiceResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Audit Service Interface
// Implemented by: Infrastructure track (auditService.ts)
// Called by: Both tracks
// ─────────────────────────────────────────────────────────────────────────────

/** Audit event action types */
export type AuditAction =
    | 'draft_created'
    | 'draft_updated'
    | 'draft_deleted'
    | 'draft_status_changed'
    | 'test_published'
    | 'test_visibility_changed'
    | 'access_denied';

/** Target resource type */
export type AuditTargetType = 'draft' | 'test';

/** Audit event structure */
export interface AuditEvent {
    action: AuditAction;
    userId: string;
    userRole: 'teacher' | 'super_admin';
    targetId: string;
    targetType: AuditTargetType;
    details?: Record<string, unknown>;
    timestamp: Date;
}

/** Audit service function signatures */
export interface AuditServiceInterface {
    /**
     * Log an audit event
     * Called whenever: A trackable action occurs
     */
    logEvent(event: Omit<AuditEvent, 'timestamp'>): Promise<void>;

    /**
     * Get audit logs for a resource (Super Admin only)
     */
    getResourceLogs(
        targetId: string,
        targetType: AuditTargetType
    ): Promise<ServiceResponse<AuditEvent[]>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Hook Return Types
// Implemented by: Infrastructure track
// Used by: UI track
// ─────────────────────────────────────────────────────────────────────────────

/** Return type for useOwnershipCheck hook */
export interface UseOwnershipCheckReturn {
    /** Whether current user is the owner of the resource */
    isOwner: boolean;

    /** Whether ownership check is loading */
    isLoading: boolean;

    /** Error message if check failed */
    error: string | null;

    /** Whether user can access (owner OR super_admin) */
    canAccess: boolean;
}

/** Return type for useDraftAutoSave hook */
export interface UseDraftAutoSaveReturn {
    /** Whether a save is currently in progress */
    isSaving: boolean;

    /** Timestamp of last successful save */
    lastSaved: Date | null;

    /** Error from last save attempt */
    error: string | null;

    /** Trigger a save with updates */
    save: (updates: Partial<DraftDocument>) => void;

    /** Force immediate save (for beforeunload) */
    saveImmediately: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Publishing Types
// Used by: Both tracks
// ─────────────────────────────────────────────────────────────────────────────

/** Published test visibility */
export interface TestVisibility {
    /** Whether test is in Public Library (true) or My Content (false) */
    isPublic: boolean;

    /** Owner's Firebase Auth UID */
    ownerId: string;
}

/** Publish options for Super Admin */
export interface PublishOptions {
    /** Make test publicly available to all teachers */
    publishToPublicLibrary: boolean;
}

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
