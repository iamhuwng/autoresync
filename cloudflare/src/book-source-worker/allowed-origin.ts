const validAllowedOrigin = (entry: string): boolean => {
  if (!entry || entry === '*' || /\s/u.test(entry)) return false;
  try {
    const parsed = new URL(entry);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.origin === entry;
  } catch {
    return false;
  }
};

/**
 * Parses a comma-separated list of exact allowed origins.
 * Fails closed (`[]`) if the raw value is empty or if any entry is malformed,
 * a wildcard, contains a path/query/hash, or uses an unsupported scheme.
 */
export const parseAllowedOrigins = (raw: unknown): readonly string[] => {
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const entries = trimmed.split(',').map((entry) => entry.trim());
  if (entries.some((entry) => !validAllowedOrigin(entry))) {
    return [];
  }
  return entries;
};

export const isAllowedOrigin = (
  requestOrigin: string | null,
  rawAllowed: unknown,
): boolean => {
  if (!requestOrigin) return false;
  return parseAllowedOrigins(rawAllowed).includes(requestOrigin);
};
