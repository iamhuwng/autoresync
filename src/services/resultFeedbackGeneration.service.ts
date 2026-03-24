import {
  generateFormativeFeedback,
  type GenerateFormativeFeedbackOptions,
} from './formativeFeedback.service';
import { buildResultFeedbackPayload } from './resultFeedbackPayload.service';
import { getTestResult } from './testResults.service';

/**
 * In-flight dedupe map: prevents duplicate concurrent generation calls
 * for the same resultId. If a generation is already in progress for a
 * given resultId, the existing promise is returned instead of starting
 * a new one. (PRD-0040 Task 3.6)
 */
const inFlightGenerations = new Map<string, Promise<any>>();

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
