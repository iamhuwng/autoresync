export type CapacityProbeMode = 'remote-reconciliation' | 'local-baseline';

/**
 * Environment surface for the capacity probe. The runtime bindings remain
 * deployment-specific; local-baseline mode intentionally accepts no secret or
 * provider binding.
 */
export interface CapacityProbeEnvironment extends Record<string, unknown> {
  readonly BOOK_SOURCE_CAPACITY_PROBE_STATE?: string;
  readonly BOOK_SOURCE_CAPACITY_ENVIRONMENT?: string;
  readonly BOOK_SOURCE_CAPACITY_PROBE_MODE?: string;
}
