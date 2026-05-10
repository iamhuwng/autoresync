import { storage } from '../core/platform/storage';
import type { SoloProgressScopeContext } from '../types/practice.types';

const EXPIRY_MS = 72 * 60 * 60 * 1000;

export interface SavedWritingPracticeState {
    essays: { 1: string; 2: string };
    activeTask: 1 | 2;
    startedAt: number;
    pasteAttemptCount?: number;
}

interface WritingProgressKeyParams {
    materialId: string;
    studentId: string;
    scopeContext?: SoloProgressScopeContext;
}

interface WritingProgressLookupOptions {
    includeLegacyFallback?: boolean;
}

interface WritingProgressLookupResult {
    progress: SavedWritingPracticeState | null;
    matchedKey: string | null;
}

function normalizeScopeContext(scopeContext?: SoloProgressScopeContext): SoloProgressScopeContext {
    return scopeContext ?? { mode: 'self_study' };
}

function encodeKeySegment(segment: string): string {
    return encodeURIComponent(segment);
}

export function buildLegacyWritingProgressStorageKey(materialId: string, studentId: string): string {
    return `writing_practice_${materialId}_${studentId}`;
}

export function buildWritingProgressStorageKey({
    materialId,
    studentId,
    scopeContext,
}: WritingProgressKeyParams): string {
    const normalized = normalizeScopeContext(scopeContext);
    const segments = [
        'writing_practice_v2',
        normalized.mode,
        studentId,
        materialId,
    ];

    if (normalized.mode === 'course_material') {
        segments.push(normalized.courseId || 'no-course', normalized.moduleId || 'no-module');
    }

    if (normalized.mode === 'homework') {
        segments.push(normalized.homeworkId || 'no-homework', normalized.submissionId || 'no-submission');
    }

    return segments
        .map((segment, index) => (index === 0 ? segment : encodeKeySegment(segment)))
        .join('__');
}

export function shouldIncludeLegacyWritingProgressFallback(scopeContext?: SoloProgressScopeContext): boolean {
    return normalizeScopeContext(scopeContext).mode === 'self_study';
}

export function getWritingProgressLookupKeys(
    params: WritingProgressKeyParams,
    options: WritingProgressLookupOptions = {},
): string[] {
    const keys = [buildWritingProgressStorageKey(params)];
    const includeLegacyFallback = options.includeLegacyFallback
        ?? shouldIncludeLegacyWritingProgressFallback(params.scopeContext);

    if (includeLegacyFallback) {
        const legacyKey = buildLegacyWritingProgressStorageKey(params.materialId, params.studentId);
        if (!keys.includes(legacyKey)) {
            keys.push(legacyKey);
        }
    }

    return keys;
}

function isSavedWritingPracticeState(value: unknown): value is SavedWritingPracticeState {
    return Boolean(
        value
        && typeof value === 'object'
        && 'essays' in value
        && 'activeTask' in value
        && 'startedAt' in value,
    );
}

function isExpired(progress: SavedWritingPracticeState): boolean {
    return Date.now() - progress.startedAt > EXPIRY_MS;
}

export async function readWritingProgress(
    params: WritingProgressKeyParams,
    options: WritingProgressLookupOptions = {},
): Promise<WritingProgressLookupResult> {
    const keys = getWritingProgressLookupKeys(params, options);

    for (const key of keys) {
        try {
            const stored = await storage.get<SavedWritingPracticeState>(key);
            if (!isSavedWritingPracticeState(stored)) {
                continue;
            }

            if (isExpired(stored)) {
                await storage.remove(key);
                continue;
            }

            return {
                progress: stored,
                matchedKey: key,
            };
        } catch {
            // Ignore corrupted entries and continue scanning candidates.
        }
    }

    return {
        progress: null,
        matchedKey: null,
    };
}

export async function hasWritingProgress(
    params: WritingProgressKeyParams,
    options: WritingProgressLookupOptions = {},
): Promise<boolean> {
    const { progress } = await readWritingProgress(params, options);
    return progress !== null;
}

export async function writeWritingProgress(
    params: WritingProgressKeyParams,
    progress: SavedWritingPracticeState,
): Promise<void> {
    const key = buildWritingProgressStorageKey(params);
    await storage.set(key, progress);
}

export async function removeWritingProgress(
    params: WritingProgressKeyParams,
    options: WritingProgressLookupOptions = {},
): Promise<void> {
    const keys = getWritingProgressLookupKeys(params, options);
    await Promise.all(keys.map(async (key) => {
        await storage.remove(key);
    }));
}
