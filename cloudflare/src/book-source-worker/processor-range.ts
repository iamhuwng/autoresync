export interface BookSourceProcessorRange {
  readonly offset: number;
  readonly length: number;
  readonly end: number;
}

export const parseBookSourceProcessorRange = (
  header: string | null,
  objectSize: number,
  maxRangeBytes: number,
): BookSourceProcessorRange => {
  if (!Number.isSafeInteger(objectSize) || objectSize < 1
    || !Number.isSafeInteger(maxRangeBytes) || maxRangeBytes < 1) {
    throw new Error('book_source_processor_range_policy_invalid');
  }
  const match = /^bytes=(\d+)-(\d+)$/u.exec(header ?? '');
  if (!match) throw new Error('book_source_processor_range_required');
  const offset = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end)
    || offset < 0 || end < offset || end >= objectSize) {
    throw new Error('book_source_processor_range_invalid');
  }
  const length = end - offset + 1;
  if (length > maxRangeBytes) throw new Error('book_source_processor_range_excessive');
  return Object.freeze({ offset, length, end });
};

export const bookSourceProcessorRangeHeaders = (
  range: BookSourceProcessorRange,
  objectSize: number,
): Headers => new Headers({
  'Content-Type': 'application/pdf',
  'Content-Length': String(range.length),
  'Content-Range': `bytes ${range.offset}-${range.end}/${objectSize}`,
  'Accept-Ranges': 'bytes',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});
