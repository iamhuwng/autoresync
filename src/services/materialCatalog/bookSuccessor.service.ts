import type {
  MaterialBookId,
  MaterialBookMetadata,
  MaterialBookMode,
} from '../../types/materialCatalog.types';
import { isMaterialBookMode } from '../../types/materialCatalog.types';

export const BOOK_SUCCESSOR_ROUTE = '/api/material-books/successors';

export interface CreateBookSuccessorCommand {
  readonly predecessorBookId: MaterialBookId;
  readonly expectedUpdatedAt: string;
  readonly targetMode: MaterialBookMode;
  readonly reason: string;
  readonly activityRefs?: readonly {
    readonly activityId: string;
    readonly versionId: string;
  }[];
  readonly operationId: string;
}

export interface CreateBookSuccessorResult {
  readonly status: 'created' | 'replayed';
  readonly successor: MaterialBookMetadata;
  readonly predecessorUpdatedAt: string;
}

export interface ArchiveBookSuccessorCommand {
  readonly successorBookId: MaterialBookId;
  readonly expectedUpdatedAt: string;
  readonly operationId: string;
}

interface BookSuccessorClientOptions {
  readonly baseUrl: string;
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}

const trimmedBaseUrl = (value: string): string => value.trim().replace(/\/+$/u, '');

const parseJson = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const value = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const commandError = (body: Record<string, unknown>, status: number): Error => {
  const code = typeof body.code === 'string'
    ? body.code
    : typeof body.status === 'string'
      ? body.status
      : `http_${status}`;

  const messages: Record<string, string> = {
    forbidden: 'Only the Book owner can create a mode successor.',
    stale: 'This Book changed after it was loaded. Reload and try again.',
    'idempotency-conflict': 'This successor request conflicts with an earlier request.',
    'id-collision': 'The successor ID already exists. Try again.',
    'not-found': 'The original Book no longer exists.',
    'successor-not-draft': 'Only an unpublished successor can be archived.',
  };

  return new Error(messages[code] ?? `Book successor command failed (${code}).`);
};

const request = async (
  options: BookSuccessorClientOptions,
  action: 'create' | 'archive',
  command: CreateBookSuccessorCommand | ArchiveBookSuccessorCommand,
): Promise<Record<string, unknown>> => {
  const baseUrl = trimmedBaseUrl(options.baseUrl);
  if (!baseUrl) {
    throw new Error('Book successor service is not configured.');
  }

  const token = (await options.getIdToken()).trim();
  if (!token) {
    throw new Error('Book successor authorization is unavailable.');
  }

  const response = await (options.fetchImpl ?? globalThis.fetch)(
    `${baseUrl}${BOOK_SUCCESSOR_ROUTE}/${action}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': command.operationId,
      },
      body: JSON.stringify(command),
    },
  );
  const body = await parseJson(response);
  if (!response.ok) {
    throw commandError(body, response.status);
  }
  return body;
};

const isSuccessor = (value: unknown): value is MaterialBookMetadata => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const book = value as MaterialBookMetadata;
  return typeof book.bookId === 'string'
    && typeof book.ownerId === 'string'
    && isMaterialBookMode(book.bookMode)
    && book.modeSuccessorLineage?.kind === 'mode-successor';
};

export const createBookSuccessorClient = (options: BookSuccessorClientOptions) => ({
  async create(command: CreateBookSuccessorCommand): Promise<CreateBookSuccessorResult> {
    const body = await request(options, 'create', command);
    if (
      (body.status !== 'created' && body.status !== 'replayed')
      || !isSuccessor(body.successor)
      || typeof body.predecessorUpdatedAt !== 'string'
    ) {
      throw new Error('Book successor service returned an invalid response.');
    }
    return {
      status: body.status,
      successor: body.successor,
      predecessorUpdatedAt: body.predecessorUpdatedAt,
    };
  },

  async archive(command: ArchiveBookSuccessorCommand): Promise<{ readonly status: 'archived' | 'replayed' }> {
    const body = await request(options, 'archive', command);
    if (body.status !== 'archived' && body.status !== 'replayed') {
      throw new Error('Book successor service returned an invalid response.');
    }
    return { status: body.status };
  },
});

export const oppositeBookMode = (mode: MaterialBookMode): MaterialBookMode =>
  mode === 'materials' ? 'pdf' : 'materials';
