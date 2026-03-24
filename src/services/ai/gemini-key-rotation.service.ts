import { loadAllGeminiApiKeys } from '../../config/env.config';
import {
  benchKey,
  isKeyBenched,
  shouldBenchGeminiKeyError,
} from '../key-cooldown.service';

export interface GeminiKeyAttemptContext {
  key: string;
  keyIndex: number;
  attemptNumber: number;
  totalAvailableKeys: number;
  totalConfiguredKeys: number;
  GoogleGenerativeAI: typeof import('@google/generative-ai').GoogleGenerativeAI;
}

export type GeminiKeyAttemptResult<T> =
  | { status: 'success'; value: T }
  | { status: 'continue' }
  | { status: 'retry'; reason?: string }
  | { status: 'fail'; error: string };

export interface GeminiKeyRotationResult<T> {
  success: boolean;
  value?: T;
  error: string;
  allKeysExhausted: boolean;
  totalConfiguredKeys: number;
  totalAvailableKeys: number;
  attemptedKeyCount: number;
  lastSuccessfulKeyIndex?: number;
}

interface ExecuteGeminiWithKeyRotationOptions<T> {
  callerName: string;
  noKeysError?: string;
  benchedKeysError?: string | ((context: { totalConfiguredKeys: number }) => string);
  exhaustedError?: string;
  allKeys?: string[];
  startIndex?: number;
  attempt: (context: GeminiKeyAttemptContext) => Promise<GeminiKeyAttemptResult<T>>;
}

type IndexedGeminiKey = {
  key: string;
  keyIndex: number;
};

function rotateKeys(keys: IndexedGeminiKey[], startIndex: number): IndexedGeminiKey[] {
  if (keys.length === 0) {
    return keys;
  }

  const normalizedStartIndex = ((startIndex % keys.length) + keys.length) % keys.length;
  if (normalizedStartIndex === 0) {
    return keys;
  }

  return [
    ...keys.slice(normalizedStartIndex),
    ...keys.slice(0, normalizedStartIndex),
  ];
}

export async function executeGeminiWithKeyRotation<T>({
  callerName,
  noKeysError = 'No Gemini API keys configured',
  benchedKeysError,
  exhaustedError = 'All Gemini API keys exhausted',
  allKeys,
  startIndex = 0,
  attempt,
}: ExecuteGeminiWithKeyRotationOptions<T>): Promise<GeminiKeyRotationResult<T>> {
  try {
    const configuredKeys = (allKeys ?? await loadAllGeminiApiKeys()).map((key, keyIndex) => ({
      key,
      keyIndex,
    }));

    if (configuredKeys.length === 0) {
      return {
        success: false,
        error: noKeysError,
        allKeysExhausted: true,
        totalConfiguredKeys: 0,
        totalAvailableKeys: 0,
        attemptedKeyCount: 0,
      };
    }

    const orderedKeys = rotateKeys(configuredKeys, startIndex);
    const availableKeys = orderedKeys.filter(({ key }) => !isKeyBenched(key));

    if (availableKeys.length === 0) {
      const error = typeof benchedKeysError === 'function'
        ? benchedKeysError({ totalConfiguredKeys: configuredKeys.length })
        : benchedKeysError ?? `All ${configuredKeys.length} Gemini keys are benched (cooling down)`;

      return {
        success: false,
        error,
        allKeysExhausted: true,
        totalConfiguredKeys: configuredKeys.length,
        totalAvailableKeys: 0,
        attemptedKeyCount: 0,
      };
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    for (let i = 0; i < availableKeys.length; i += 1) {
      const currentKey = availableKeys[i]!;

      try {
        const result = await attempt({
          key: currentKey.key,
          keyIndex: currentKey.keyIndex,
          attemptNumber: i + 1,
          totalAvailableKeys: availableKeys.length,
          totalConfiguredKeys: configuredKeys.length,
          GoogleGenerativeAI,
        });

        if (result.status === 'success') {
          return {
            success: true,
            value: result.value,
            error: '',
            allKeysExhausted: false,
            totalConfiguredKeys: configuredKeys.length,
            totalAvailableKeys: availableKeys.length,
            attemptedKeyCount: i + 1,
            lastSuccessfulKeyIndex: currentKey.keyIndex,
          };
        }

        if (result.status === 'fail') {
          return {
            success: false,
            error: result.error,
            allKeysExhausted: false,
            totalConfiguredKeys: configuredKeys.length,
            totalAvailableKeys: availableKeys.length,
            attemptedKeyCount: i + 1,
          };
        }

        if (
          result.status === 'retry'
          && result.reason
          && shouldBenchGeminiKeyError(result.reason)
        ) {
          benchKey(currentKey.key, 'gemini', result.reason);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Gemini error';

        if (shouldBenchGeminiKeyError(message)) {
          benchKey(currentKey.key, 'gemini', message);
          continue;
        }

        console.warn(
          `[GeminiRotation/${callerName}] Key ${currentKey.keyIndex + 1} failed: ${message}`,
        );
      }
    }

    return {
      success: false,
      error: exhaustedError,
      allKeysExhausted: true,
      totalConfiguredKeys: configuredKeys.length,
      totalAvailableKeys: availableKeys.length,
      attemptedKeyCount: availableKeys.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Gemini key rotation error',
      allKeysExhausted: false,
      totalConfiguredKeys: 0,
      totalAvailableKeys: 0,
      attemptedKeyCount: 0,
    };
  }
}
