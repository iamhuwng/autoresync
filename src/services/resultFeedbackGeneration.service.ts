import {
  generateFormativeFeedback,
  type GenerateFormativeFeedbackOptions,
} from './formativeFeedback.service';
import { classifySavedResultFeedbackKind } from './feedbackClassification.service';
import { buildResultFeedbackPayload } from './resultFeedbackPayload.service';
import { getTestResult } from './testResults.service';
import type { SavedResultFeedbackKind, SavedResultFeedbackOutcome } from '../types/results.types';

/**
 * In-flight dedupe map: prevents duplicate concurrent generation calls
 * for the same resultId. If a generation is already in progress for a
 * given resultId, the existing promise is returned instead of starting
 * a new one. (PRD-0040 Task 3.6)
 */
const inFlightGenerations = new Map<string, Promise<any>>();

async function persistFeedbackGenerationMeta(
  resultId: string,
  meta: {
    kind: SavedResultFeedbackKind;
    lastOutcome: SavedResultFeedbackOutcome;
    lastError?: string | null;
    lastTriggerSource?: string | null;
  },
) {
  const { ref, update } = await import('firebase/database');
  const { database } = await import('./firebase');
  await update(ref(database, `test_results/${resultId}`), {
    feedbackGenerationMeta: {
      kind: meta.kind,
      lastAttemptAt: Date.now(),
      lastTriggerSource: meta.lastTriggerSource ?? null,
      lastOutcome: meta.lastOutcome,
      lastError: meta.lastError ?? null,
    },
  });
}

export async function generateFormativeFeedbackForSavedResult(
  resultId: string,
  options?: GenerateFormativeFeedbackOptions,
) {
  // Build a dedupe key that includes the forceAiUpgrade flag
  // so that a normal generation and an upgrade are not deduped against each other
  const dedupeKey = options?.forceAiUpgrade ? `${resultId}:upgrade` : resultId;

  // Return existing in-flight promise if one exists for this key
  const existing = inFlightGenerations.get(dedupeKey);
  if (existing) {
    console.log(`[ResultFeedbackGeneration] Dedupe: reusing in-flight generation for ${dedupeKey}`);
    return existing;
  }

  const promise = (async () => {
    try {
      const result = await getTestResult(resultId);
      if (!result) {
        console.warn(`[ResultFeedbackGeneration] Result ${resultId} not found`);
        return null;
      }

      const payload = await buildResultFeedbackPayload(result, resultId);
      if (!payload) {
        console.log(`[ResultFeedbackGeneration] Result ${resultId} is not eligible for formative feedback`);
        await persistFeedbackGenerationMeta(resultId, {
          kind: classifySavedResultFeedbackKind(result),
          lastOutcome: 'skipped-ineligible',
          lastError: null,
          lastTriggerSource: options?.triggerSource ?? null,
        }).catch((error) => {
          console.warn(`[ResultFeedbackGeneration] Failed to persist skipped-ineligible meta for ${resultId}:`, error);
        });
        return null;
      }

      return await generateFormativeFeedback(
        payload.gradingResult as any,
        payload.sections as any,
        payload.testMetadata,
        payload.resultId,
        options,
      );
    } finally {
      inFlightGenerations.delete(dedupeKey);
    }
  })();

  inFlightGenerations.set(dedupeKey, promise);
  return promise;
}

export function triggerFormativeFeedbackForSavedResult(
  resultId: string,
  options?: GenerateFormativeFeedbackOptions,
): void {
  void generateFormativeFeedbackForSavedResult(resultId, options).catch((error) => {
    console.warn(`[ResultFeedbackGeneration] Failed for result ${resultId}:`, error);
  });
}
