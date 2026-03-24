import {
  generateFormativeFeedback,
  type GenerateFormativeFeedbackOptions,
} from './formativeFeedback.service';
import { buildResultFeedbackPayload } from './resultFeedbackPayload.service';
import { getTestResult } from './testResults.service';

export async function generateFormativeFeedbackForSavedResult(
  resultId: string,
  options?: GenerateFormativeFeedbackOptions,
) {
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

  return generateFormativeFeedback(
    payload.gradingResult as any,
    payload.sections as any,
    payload.testMetadata,
    payload.resultId,
    options,
  );
}

export function triggerFormativeFeedbackForSavedResult(
  resultId: string,
  options?: GenerateFormativeFeedbackOptions,
): void {
  void generateFormativeFeedbackForSavedResult(resultId, options).catch((error) => {
    console.warn(`[ResultFeedbackGeneration] Failed for result ${resultId}:`, error);
  });
}
