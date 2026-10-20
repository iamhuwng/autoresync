const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('book_submission_metadata_invalid');
  return value as Record<string, unknown>;
};

export const normalizeBookSubmissionMetadata = (value: unknown): Record<string, unknown> => {
  const input = record(value);
  const strings: Record<string, number> = { title: 240, subtitle: 500, publisher: 240, edition: 120, series: 240, isbn: 64, coverUrl: 2048, description: 4000 };
  const lists: Record<string, [number, number]> = { authors: [20, 160], testTypeIds: [20, 160], tags: [50, 80] };
  if (Object.keys(input).some((key) => !(key in strings) && !(key in lists) && key !== 'visibility')) throw new Error('book_submission_metadata_invalid');
  const output: Record<string, unknown> = { visibility: input.visibility ?? 'private' };
  if (output.visibility !== 'private') throw new Error('book_submission_metadata_invalid');
  for (const [key, max] of Object.entries(strings)) {
    const entry = input[key];
    if (entry === undefined && key !== 'title') continue;
    if (typeof entry !== 'string' || !entry.trim() || entry.length > max) throw new Error('book_submission_metadata_invalid');
    output[key] = entry.trim();
  }
  for (const [key, [maxItems, maxLength]] of Object.entries(lists)) {
    const entry = input[key] ?? [];
    if (!Array.isArray(entry) || entry.length > maxItems || entry.some((item) => typeof item !== 'string' || !item.trim() || item.length > maxLength)) throw new Error('book_submission_metadata_invalid');
    output[key] = entry.map((item: string) => item.trim());
  }
  if ((output.testTypeIds as string[]).length === 0) throw new Error('book_submission_metadata_invalid');
  return output;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${stableJson(input[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

export const computeBookSubmissionFingerprint = async (metadata: unknown, authoring: unknown): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson({ metadata, authoring })));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
