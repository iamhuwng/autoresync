import { SourceProviderError } from '../../../src/services/book-source-delivery/sourceProvider.port.ts';
import {
  BackblazeB2SourceProvider,
  createBackblazeB2SourceProviderFromEnv,
  type BackblazeB2SourceProviderConfig,
} from './backblaze-b2-source-provider';

export const BOOK_SOURCE_B2_PROVIDER_STATES = {
  disabled: 'disabled',
  enabled: 'enabled',
} as const;

export interface BackblazeB2ProviderWiring {
  readonly state: 'disabled' | 'enabled';
  readonly provider: BackblazeB2SourceProvider | null;
}

/**
 * Production composition seam. Missing state is disabled. Enabled state must
 * have every validated B2 binding; partial/malformed input never falls back.
 */
export const resolveBackblazeB2ProviderWiring = (
  env: Record<string, unknown>,
  options: Pick<BackblazeB2SourceProviderConfig, 'fetch' | 'now' | 'maxReadBytes'> = {},
): BackblazeB2ProviderWiring => {
  const state = env.BOOK_SOURCE_B2_PROVIDER_STATE;
  if (state === undefined || state === BOOK_SOURCE_B2_PROVIDER_STATES.disabled) {
    return Object.freeze({ state: 'disabled', provider: null });
  }
  if (state !== BOOK_SOURCE_B2_PROVIDER_STATES.enabled) {
    throw new SourceProviderError('metadata_mismatch', false);
  }

  return Object.freeze({
    state: 'enabled',
    provider: createBackblazeB2SourceProviderFromEnv(env, options),
  });
};
