export const normalizeServerTimeOffset = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

export const effectiveNow = (
  localNow = Date.now(),
  serverTimeOffsetMs = 0,
): number => localNow + normalizeServerTimeOffset(serverTimeOffsetMs);
