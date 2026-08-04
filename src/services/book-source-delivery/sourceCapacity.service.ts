import {
  BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES,
  BOOK_SOURCE_MAX_PDF_BYTES,
  type BookSourceCapacityUsage,
  type BookSourceUploadKind,
  type BookSourceUploadOperation,
} from '../../types/bookSource.types';
export class SourceCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceCapacityError';
  }
}

const BYTE_FIELDS = [
  'trackedAccountBytes',
  'pendingUploadBytes',
  'replacementUploadBytes',
  'temporaryBytes',
] as const;

export function assertBookSourcePdfByteSize(byteSize: unknown): asserts byteSize is number {
  if (typeof byteSize !== 'number' || !Number.isSafeInteger(byteSize) || byteSize <= 0 || byteSize > BOOK_SOURCE_MAX_PDF_BYTES) {
    throw new SourceCapacityError(`byteSize must be a positive safe integer no greater than ${BOOK_SOURCE_MAX_PDF_BYTES}.`);
  }
}

export function calculateBookSourceCapacityUsage(input: {
  readonly trackedAccountBytes: number;
  readonly temporaryBytes: number;
  readonly operations: Readonly<Record<string, BookSourceUploadOperation>>;
}): BookSourceCapacityUsage {
  assertNonNegativeSafeInteger(input.trackedAccountBytes, 'trackedAccountBytes');
  assertNonNegativeSafeInteger(input.temporaryBytes, 'temporaryBytes');

  let pendingUploadBytes = 0;
  let replacementUploadBytes = 0;
  for (const operation of Object.values(input.operations)) {
    if (operation.status !== 'reserved') continue;
    assertBookSourcePdfByteSize(operation.byteSize);
    if (operation.kind === 'initial') pendingUploadBytes += operation.byteSize;
    else if (operation.kind === 'replacement') replacementUploadBytes += operation.byteSize;
    else throw new SourceCapacityError('operation.kind must be initial or replacement.');
  }

  const usage = { trackedAccountBytes: input.trackedAccountBytes, pendingUploadBytes, replacementUploadBytes, temporaryBytes: input.temporaryBytes };
  for (const field of BYTE_FIELDS) assertNonNegativeSafeInteger(usage[field], field);
  return Object.freeze(usage);
}

export function totalBookSourceCapacityBytes(usage: BookSourceCapacityUsage): number {
  let total = 0;
  for (const field of BYTE_FIELDS) {
    assertNonNegativeSafeInteger(usage[field], field);
    total += usage[field];
  }
  if (!Number.isSafeInteger(total)) throw new SourceCapacityError('capacity total exceeds safe integer range.');
  return total;
}

export function assertBookSourceCapacityAvailable(usage: BookSourceCapacityUsage): void {
  if (totalBookSourceCapacityBytes(usage) > BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES) {
    throw new SourceCapacityError(`Book PDF account capacity exceeds ${BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES} bytes.`);
  }
}

export function sourceUploadCapacityCategory(kind: BookSourceUploadKind): 'pendingUploadBytes' | 'replacementUploadBytes' {
  if (kind === 'initial') return 'pendingUploadBytes';
  if (kind === 'replacement') return 'replacementUploadBytes';
  throw new SourceCapacityError('upload kind must be initial or replacement.');
}

function assertNonNegativeSafeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new SourceCapacityError(`${label} must be a nonnegative safe integer.`);
  }
}
