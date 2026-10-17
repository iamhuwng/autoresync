export const BOOK_SOURCE_DISPLAY_FILENAME_MAX_LENGTH = 255;

const FORBIDDEN_DISPLAY_FILENAME = /[\\/\u2044\u2215\u29F8\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/u;

export class SourceDisplayFilenameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceDisplayFilenameError';
  }
}

/**
 * Normalizes bounded display-only PDF metadata. This is deliberately not a
 * provider-key sanitizer: provider object keys are Worker-generated.
 */
export function normalizeBookSourceDisplayFilename(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SourceDisplayFilenameError('originalFilename must be a string.');
  }

  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (
    normalized.length === 0
    || normalized.length > BOOK_SOURCE_DISPLAY_FILENAME_MAX_LENGTH
    || normalized === '.'
    || normalized === '..'
    || FORBIDDEN_DISPLAY_FILENAME.test(normalized)
  ) {
    throw new SourceDisplayFilenameError('originalFilename must be a bounded safe PDF display filename.');
  }

  const extension = normalized.lastIndexOf('.');
  const basename = extension === -1 ? '' : normalized.slice(0, extension).trim();
  if (basename.length === 0 || normalized.slice(extension + 1).toLowerCase() !== 'pdf') {
    throw new SourceDisplayFilenameError('originalFilename must name a PDF.');
  }

  return `${basename}.pdf`;
}
