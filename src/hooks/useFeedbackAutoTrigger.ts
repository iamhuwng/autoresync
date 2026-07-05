// @ts-nocheck
/**
 * useFeedbackAutoTrigger - Centralized feedback generation dedupe and auto-trigger hook.
 *
 * PRD-0040 Task 3.6: Centralizes the duplicated feedback generation logic
 * from ResultSlidePanel and ResultDetailModal into a single shared hook.
 *
 * Responsibilities:
 * 1. Manages feedbackLoading, feedbackError state
 * 2. Provides handleGenerateFeedback callback with error categorization
 * 3. Auto-triggers feedback for eligible saved results without feedback
 * 4. Auto-triggers AI upgrade for results with weak/deterministic feedback
 * 5. Provides feedbackAttemptedRef-based once-per-open dedupe
 * 6. Resets state when resultId changes (attempt switch, modal close/reopen)
 *
 * The in-flight cross-shell dedupe is handled at the service layer
 * (resultFeedbackGeneration.service.ts).
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { generateFormativeFeedbackForSavedResult } from '../services/resultFeedbackGeneration.service';
import { needsAiFeedbackUpgrade } from '../services/formativeFeedback.service';
import { classifySavedResultFeedbackKind } from '../services/feedbackClassification.service';
import type { FormativeFeedback } from '../types/thcs-test.types';
import type { TestResultRecord } from '../services/testResults.service';

export function isEligibleForSavedResultFeedback(result: TestResultRecord | null | undefined): boolean {
  return Boolean(result && classifySavedResultFeedbackKind(result));
}

export interface UseFeedbackAutoTriggerOptions {
  /** The current result ID being displayed */
  resultId: string;
  /** The loaded result object (null if not yet loaded) */
  result: TestResultRecord | null;
  /** Whether the result is still loading */
  loading: boolean;
  /**
   * Whether auto-trigger is enabled for this shell.
   * Each saved-result shell opts in explicitly so the hook can keep one policy
   * while the shells own their own access and visibility rules.
   */
  autoTriggerEnabled: boolean;
  /** Shell identifier for logging/auditing */
  shellName: string;
}

export interface UseFeedbackAutoTriggerReturn {
  /** Whether feedback generation is currently in progress */
  feedbackLoading: boolean;
  /** Error message from the last feedback generation attempt */
  feedbackError: string | null;
  /** Whether the stored feedback needs an AI upgrade */
  storedFeedbackNeedsUpgrade: boolean;
  /** Trigger feedback generation (or upgrade if forceAiUpgrade=true) */
  handleGenerateFeedback: (forceAiUpgrade?: boolean) => Promise<void>;
  /** Clear the feedback error state */
  clearFeedbackError: () => void;
}

export function useFeedbackAutoTrigger({
  resultId,
  result,
  loading,
  autoTriggerEnabled,
  shellName,
}: UseFeedbackAutoTriggerOptions): UseFeedbackAutoTriggerReturn {
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const feedbackAttemptedRef = useRef(false);

  const storedFeedbackNeedsUpgrade = useMemo(() => {
    const formativeFeedback = result?.formativeFeedback as FormativeFeedback | undefined;
    return Boolean(
      formativeFeedback &&
      needsAiFeedbackUpgrade(formativeFeedback, result?.questionResults as any, result || undefined),
    );
  }, [result]);

  const runGenerateFeedback = useCallback(async (
    forceAiUpgrade: boolean,
    triggerMode: 'auto' | 'manual',
  ) => {
    if (!result) return;

    try {
      setFeedbackLoading(true);
      setFeedbackError(null);

      const generationResult = await generateFormativeFeedbackForSavedResult(
        resultId,
        {
          ...(forceAiUpgrade ? { forceAiUpgrade: true } : {}),
          triggerSource: `${shellName}:${triggerMode}-${forceAiUpgrade ? 'upgrade' : 'generate'}`,
        },
      );

      if (generationResult && !generationResult.saved) {
        setFeedbackError('AI feedback could not be saved for this result. Please try again.');
      } else if (!generationResult) {
        setFeedbackError('AI feedback is not available for this result.');
      } else if (generationResult.upgradeAttempted && generationResult.upgradeApplied === false) {
        setFeedbackError(generationResult.error || 'AI upgrade did not complete. The saved feedback is still being shown.');
      } else {
        setFeedbackError(null);
      }
      // No need to call loadResult() - the RTDB onValue listener
      // will automatically pick up the newly-written formativeFeedback.
    } catch (err) {
      console.error(`[${shellName}] Failed to generate formative feedback:`, err);
      setFeedbackError('Failed to generate feedback.');
    } finally {
      setFeedbackLoading(false);
    }
  }, [result, resultId, shellName]);

  const handleGenerateFeedback = useCallback(async (forceAiUpgrade = false) => {
    await runGenerateFeedback(forceAiUpgrade, 'manual');
  }, [runGenerateFeedback]);

  // Auto-trigger generation for missing eligible feedback, and AI-upgrade weak or deterministic saved feedback.
  useEffect(() => {
    if (!autoTriggerEnabled) return;
    if (!result || loading) return;

    const hasFeedback = Boolean(result.formativeFeedback);
    const isEligibleForFeedback = isEligibleForSavedResultFeedback(result);

    if (!feedbackLoading && !feedbackError && !feedbackAttemptedRef.current) {
      if (isEligibleForFeedback && !hasFeedback) {
        feedbackAttemptedRef.current = true;
        console.log(`[${shellName}] Auto-triggering feedback generation`);
        void runGenerateFeedback(false, 'auto');
        return;
      }

      if (hasFeedback && storedFeedbackNeedsUpgrade) {
        feedbackAttemptedRef.current = true;
        console.log(`[${shellName}] Auto-triggering AI feedback upgrade`);
        void runGenerateFeedback(true, 'auto');
      }
    }
  }, [
    autoTriggerEnabled,
    result,
    loading,
    feedbackLoading,
    feedbackError,
    storedFeedbackNeedsUpgrade,
    runGenerateFeedback,
    shellName,
  ]);

  // Reset feedback attempt when resultId changes (attempt switch, modal reopen)
  useEffect(() => {
    feedbackAttemptedRef.current = false;
    setFeedbackError(null);
  }, [resultId]);

  // Clear error when feedback arrives via real-time listener
  useEffect(() => {
    if (result?.formativeFeedback) {
      setFeedbackError(null);
    }
  }, [result?.formativeFeedback]);

  const clearFeedbackError = useCallback(() => {
    setFeedbackError(null);
  }, []);

  return {
    feedbackLoading,
    feedbackError,
    storedFeedbackNeedsUpgrade,
    handleGenerateFeedback,
    clearFeedbackError,
  };
}
