import type {
  BookUpdateActionAcceptResult,
  BookUpdateActionCommand,
  BookUpdateActionRecord,
} from './bookUpdateAction.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;

export class BookUpdateActionBrowserError extends Error {
  constructor(readonly code: 'invalid-request' | 'unauthorized' | 'unavailable' | 'malformed-response') {
    super(code);
    this.name = 'BookUpdateActionBrowserError';
  }
}

const isAction = (value: unknown): value is BookUpdateActionRecord => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (value as Partial<BookUpdateActionRecord>).schemaVersion === 1
  && typeof (value as Partial<BookUpdateActionRecord>).actionId === 'string'
  && typeof (value as Partial<BookUpdateActionRecord>).actorId === 'string'
  && typeof (value as Partial<BookUpdateActionRecord>).bookId === 'string'
  && typeof (value as Partial<BookUpdateActionRecord>).state === 'string'
);

export const createBookUpdateActionBrowserClient = (options: {
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly basePath?: string;
}) => Object.freeze({
  async accept(command: BookUpdateActionCommand, signal?: AbortSignal): Promise<BookUpdateActionAcceptResult> {
    if (!ID.test(command.actorId) || !ID.test(command.bookId)) {
      throw new BookUpdateActionBrowserError('invalid-request');
    }
    const token = await options.getIdToken();
    if (!token) throw new BookUpdateActionBrowserError('unauthorized');
    const basePath = (options.basePath ?? '/book-updates/books').replace(/\/$/u, '');
    const response = await (options.fetchImpl ?? globalThis.fetch.bind(globalThis))(
      `${basePath}/${encodeURIComponent(command.bookId)}/commands`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...command, actorId: undefined, bookId: undefined }),
        signal,
      },
    );
    if (response.status === 401 || response.status === 403) return { status: 'blocked', code: 'unauthorized' };
    const payload: unknown = await response.json();
    if (!response.ok) {
      const code = payload !== null && typeof payload === 'object'
        && typeof (payload as { code?: unknown }).code === 'string'
        ? (payload as { code: string }).code
        : 'unavailable';
      return { status: 'blocked', code };
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BookUpdateActionBrowserError('malformed-response');
    }
    const result = payload as { status?: unknown; action?: unknown };
    if ((result.status !== 'accepted' && result.status !== 'replayed') || !isAction(result.action)) {
      throw new BookUpdateActionBrowserError('malformed-response');
    }
    if (result.action.actorId !== command.actorId || result.action.bookId !== command.bookId) {
      return { status: 'blocked', code: 'unauthorized' };
    }
    return { status: result.status, action: result.action };
  },
});
