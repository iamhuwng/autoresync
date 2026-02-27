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

// Re-export DEFAULT_PRACTICE_SETTINGS for convenience
export { DEFAULT_PRACTICE_SETTINGS };
