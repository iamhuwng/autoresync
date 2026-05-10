import { storage } from '../core/platform/storage';
import type { SoloProgressScopeContext, SoloSessionProgress } from '../types/practice.types';

const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

interface SoloProgressKeyParams {
    materialId: string;
    studentId: string;
    scopeContext?: SoloProgressScopeContext;
}

interface SoloProgressLookupOptions {
    includeLegacyFallback?: boolean;
}

interface SoloProgressLookupResult {
    progress: SoloSessionProgress | null;
    matchedKey: string | null;
}

function normalizeScopeContext(scopeContext?: SoloProgressScopeContext): SoloProgressScopeContext {
    return scopeContext ?? { mode: 'self_study' };
}

function encodeKeySegment(segment: string): string {
    return encodeURIComponent(segment);
}

export function buildLegacySoloProgressStorageKey(materialId: string, studentId: string): string {
    return `solo_progress_${materialId}_${studentId}`;
}

export function buildSoloProgressStorageKey({
    materialId,
    studentId,
    scopeContext,
}: SoloProgressKeyParams): string {
    const normalized = normalizeScopeContext(scopeContext);
    const segments = [
        'solo_progress_v2',
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

export function shouldIncludeLegacySoloProgressFallback(scopeContext?: SoloProgressScopeContext): boolean {
    return normalizeScopeContext(scopeContext).mode === 'self_study';
}

export function getSoloProgressLookupKeys(
    params: SoloProgressKeyParams,
    options: SoloProgressLookupOptions = {},
): string[] {
    const keys = [buildSoloProgressStorageKey(params)];
    const includeLegacyFallback = options.includeLegacyFallback
        ?? shouldIncludeLegacySoloProgressFallback(params.scopeContext);

    if (includeLegacyFallback) {
        const legacyKey = buildLegacySoloProgressStorageKey(params.materialId, params.studentId);
        if (!keys.includes(legacyKey)) {
            keys.push(legacyKey);
        }
    }

    return keys;
}

function isSoloSessionProgress(value: unknown): value is SoloSessionProgress {
    return Boolean(
        value
        && typeof value === 'object'
        && 'materialId' in value
        && 'studentId' in value
        && 'lastSavedAt' in value,
    );
}

function isExpired(progress: SoloSessionProgress): boolean {
    return Date.now() - progress.lastSavedAt > EXPIRY_MS;
}

export async function readSoloProgress(
    params: SoloProgressKeyParams,
    options: SoloProgressLookupOptions = {},
): Promise<SoloProgressLookupResult> {
    const keys = getSoloProgressLookupKeys(params, options);

    for (const key of keys) {
        try {
            const stored = await storage.get<SoloSessionProgress>(key);
            if (!isSoloSessionProgress(stored)) {
                continue;
            }

            if (stored.materialId !== params.materialId || stored.studentId !== params.studentId) {
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

export async function hasSoloProgress(
    params: SoloProgressKeyParams,
    options: SoloProgressLookupOptions = {},
): Promise<boolean> {
    const keys = getSoloProgressLookupKeys(params, options);

    for (const key of keys) {
        if (await storage.has(key)) {
            return true;
        }
    }

    return false;
}

export async function removeSoloProgress(
    params: SoloProgressKeyParams,
    options: SoloProgressLookupOptions = {},
): Promise<void> {
    const keys = getSoloProgressLookupKeys(params, options);
    await Promise.all(keys.map(async (key) => {
        await storage.remove(key);
    }));
}
