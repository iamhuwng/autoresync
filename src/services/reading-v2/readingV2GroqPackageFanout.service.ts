import type { Result } from '../../types/result.types';
import type { ReadingV2AutoPassagePackage } from './readingV2AutoPassagePackage.service';
import {
  normalizeReadingV2AutoQuestionArea,
  type ReadingV2AutoQuestionAreaNormalizerProvider,
} from './readingV2AutoQuestionAreaNormalizer.service';
import type {
  ReadingV2AutoQuestionTranscript,
  ReadingV2AutoTranscriptCoverageSummary,
} from './readingV2AutoQuestionTranscript.service';

export interface ReadingV2GroqKeySlot {
  readonly index: number;
  readonly fingerprint: string;
  readonly available: boolean;
}

export interface ReadingV2GroqPackageFanoutProvider extends ReadingV2AutoQuestionAreaNormalizerProvider {
  getAvailableStructuredJsonKeySlots?(): Promise<readonly ReadingV2GroqKeySlot[]>;
}

export type ReadingV2GroqPackageFanoutDiagnosticCode =
  | 'groq-key-slot-degraded'
  | 'groq-package-retried'
  | 'groq-package-failed'
  | 'groq-quota-exhausted';

export interface ReadingV2GroqPackageFanoutDiagnostic {
  readonly code: ReadingV2GroqPackageFanoutDiagnosticCode;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly passageNumber?: number;
  readonly preferredKeyIndex?: number;
  readonly keyFingerprint?: string;
}

export interface ReadingV2GroqPackageFanoutPackageResult {
  readonly passageNumber: number;
  readonly transcript: ReadingV2AutoQuestionTranscript;
  readonly prompt: string;
  readonly promptHash: string;
  readonly rawStructuredJson: unknown;
  readonly rawJsonShapeSummary: string;
  readonly rawGroupRanges: readonly string[];
  readonly rawCoverageSummary?: ReadingV2AutoTranscriptCoverageSummary;
  readonly preferredKeyIndex?: number;
  readonly keyFingerprint?: string;
  readonly attempts: number;
}

export interface ReadingV2GroqPackageFanoutResult {
  readonly packageResults: readonly ReadingV2GroqPackageFanoutPackageResult[];
  readonly diagnostics: readonly ReadingV2GroqPackageFanoutDiagnostic[];
}

const rawKeyLikePattern = /\b(?:gsk_[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{12,})\b/g;

const redact = (value: string): string =>
  value.replace(rawKeyLikePattern, '[redacted-key]');

const isProviderQuotaStopSignal = (value: string | undefined): boolean => {
  const text = String(value ?? '').toLowerCase();
  if (!text) {
    return false;
  }

  return (
    text.includes('429')
    || text.includes('rate limit')
    || text.includes('rate-limit')
    || text.includes('quota')
    || text.includes('all groq api keys exhausted')
    || text.includes('all ai api keys exhausted')
    || text.includes('all keys exhausted')
    || text.includes('requests_per_day')
    || text.includes('per day')
    || text.includes('per_day')
    || text.includes('perday')
    || text.includes('limit: 0')
  );
};

const assignmentFor = (
  passagePackages: readonly ReadingV2AutoPassagePackage[],
  slots: readonly ReadingV2GroqKeySlot[],
): Map<number, ReadingV2GroqKeySlot> => {
  const availableSlots = slots.filter((slot) => slot.available);
  const assignments = new Map<number, ReadingV2GroqKeySlot>();

  passagePackages.forEach((passagePackage, index) => {
    const slot = availableSlots[index % Math.max(availableSlots.length, 1)];
    if (slot) {
      assignments.set(passagePackage.passageNumber, slot);
    }
  });

  return assignments;
};

const retrySlotsFor = (
  slots: readonly ReadingV2GroqKeySlot[],
  failedSlot: ReadingV2GroqKeySlot | undefined,
): readonly ReadingV2GroqKeySlot[] =>
  slots.filter((slot) => slot.available && slot.index !== failedSlot?.index);

const normalizePackageWithSlot = async (
  provider: ReadingV2GroqPackageFanoutProvider,
  passagePackage: ReadingV2AutoPassagePackage,
  slot: ReadingV2GroqKeySlot | undefined,
): Promise<Result<ReadingV2GroqPackageFanoutPackageResult>> => {
  const result = await normalizeReadingV2AutoQuestionArea({
    passagePackage,
    provider,
    preferredKeyIndex: slot?.index,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    data: {
      passageNumber: passagePackage.passageNumber,
      transcript: result.data.transcript,
      prompt: result.data.prompt,
      promptHash: result.data.promptHash,
      rawStructuredJson: result.data.rawStructuredJson,
      rawJsonShapeSummary: result.data.rawJsonShapeSummary,
      rawGroupRanges: result.data.rawGroupRanges,
      ...(result.data.rawCoverageSummary ? { rawCoverageSummary: result.data.rawCoverageSummary } : {}),
      preferredKeyIndex: slot?.index,
      keyFingerprint: slot?.fingerprint,
      attempts: 1,
    },
  };
};

const failedDiagnosticFor = (
  attempt: {
    readonly passagePackage: ReadingV2AutoPassagePackage;
    readonly slot: ReadingV2GroqKeySlot | undefined;
    readonly result: Result<ReadingV2GroqPackageFanoutPackageResult>;
  },
): ReadingV2GroqPackageFanoutDiagnostic => ({
  code: isProviderQuotaStopSignal(attempt.result.success ? undefined : attempt.result.error)
    ? 'groq-quota-exhausted'
    : 'groq-package-failed',
  severity: 'error',
  message: redact(`Groq package ${attempt.passagePackage.passageNumber} failed: ${attempt.result.success ? 'unknown failure' : attempt.result.error}`),
  passageNumber: attempt.passagePackage.passageNumber,
  preferredKeyIndex: attempt.slot?.index,
  keyFingerprint: attempt.slot?.fingerprint,
});

export const runReadingV2GroqPackageFanout = async (input: {
  readonly passagePackages: readonly ReadingV2AutoPassagePackage[];
  readonly provider: ReadingV2GroqPackageFanoutProvider;
}): Promise<Result<ReadingV2GroqPackageFanoutResult>> => {
  const slots = input.provider.getAvailableStructuredJsonKeySlots
    ? await input.provider.getAvailableStructuredJsonKeySlots()
    : [];
  const assignments = assignmentFor(input.passagePackages, slots);
  const diagnostics: ReadingV2GroqPackageFanoutDiagnostic[] = [];
  const availableCount = slots.filter((slot) => slot.available).length;

  if (input.passagePackages.length === 3 && availableCount < 3) {
    diagnostics.push({
      code: 'groq-key-slot-degraded',
      severity: 'warning',
      message: `Only ${availableCount} Groq key slot(s) available for 3 passage packages; packages may share slots.`,
    });
  }

  const hasDistinctSlotsForAllPackages = availableCount >= input.passagePackages.length;
  const firstAttempts = hasDistinctSlotsForAllPackages
    ? await Promise.all(input.passagePackages.map(async (passagePackage) => {
        const slot = assignments.get(passagePackage.passageNumber);
        const result = await normalizePackageWithSlot(input.provider, passagePackage, slot);
        return { passagePackage, slot, result };
      }))
    : [];
  const packageResults: ReadingV2GroqPackageFanoutPackageResult[] = [];

  if (!hasDistinctSlotsForAllPackages) {
    for (const passagePackage of input.passagePackages) {
      const slot = assignments.get(passagePackage.passageNumber);
      const result = await normalizePackageWithSlot(input.provider, passagePackage, slot);
      const quotaStopSignal = isProviderQuotaStopSignal(result.success ? undefined : result.error);

      if (result.success) {
        packageResults.push(result.data);
        continue;
      }

      if (quotaStopSignal) {
        diagnostics.push(failedDiagnosticFor({ passagePackage, slot, result }));
        break;
      }

      firstAttempts.push({ passagePackage, slot, result });
    }
  }

  for (const attempt of firstAttempts) {
    if (attempt.result.success) {
      packageResults.push(attempt.result.data);
      continue;
    }

    const alternatives = retrySlotsFor(slots, attempt.slot);
    let retrySucceeded = false;
    diagnostics.push({
      code: 'groq-package-retried',
      severity: 'warning',
      message: `Retrying passage package ${attempt.passagePackage.passageNumber} on another Groq key slot after package failure.`,
      passageNumber: attempt.passagePackage.passageNumber,
      preferredKeyIndex: attempt.slot?.index,
      keyFingerprint: attempt.slot?.fingerprint,
    });

    for (const retrySlot of alternatives) {
      const retry = await normalizePackageWithSlot(input.provider, attempt.passagePackage, retrySlot);
      if (!retry.success) {
        continue;
      }

      packageResults.push({
        ...retry.data,
        attempts: 2,
      });
      retrySucceeded = true;
      break;
    }

    if (!retrySucceeded) {
      diagnostics.push(failedDiagnosticFor(attempt));
    }
  }

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return {
      success: false,
      error: diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message
        ?? 'Groq package fan-out failed.',
    };
  }

  return {
    success: true,
    data: {
      packageResults: packageResults.sort((left, right) => left.passageNumber - right.passageNumber),
      diagnostics,
    },
  };
};
