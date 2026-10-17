import type { BookUpdateActionCommand } from '../../../../src/services/book-delivery/bookUpdateAction.types.ts';
import { createBookUpdateActionService } from './update-action.ts';

const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/** Command contribution for #59's fixed future update seam; top-level routing stays untouched. */
export const createBookUpdateActionCommandHandler = (
  service: ReturnType<typeof createBookUpdateActionService>,
) => async (input: {
  readonly request: Request;
  readonly uid: string;
  readonly params: Readonly<Record<string, string>>;
}): Promise<Response> => {
  const bookId = input.params.bookId;
  if (!bookId) return json({ code: 'invalid-book-id' }, 400);
  let body: unknown;
  try {
    body = await input.request.json();
  } catch {
    return json({ code: 'invalid-json' }, 400);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return json({ code: 'invalid-request' }, 400);
  }
  const result = await service.accept({
    ...(body as Omit<BookUpdateActionCommand, 'actorId' | 'bookId'>),
    actorId: input.uid,
    bookId,
  });
  if (result.status !== 'blocked') return json(result, result.status === 'accepted' ? 201 : 200);
  const status = result.code.includes('unauthorized') || result.code === 'snapshot-denied' ? 403
    : result.code.includes('conflict') || result.code.includes('stale') ? 409
      : result.code.includes('expired') ? 410
        : result.code.includes('unavailable') || result.code === 'persistence-failed' ? 503
          : 400;
  return json(result, status);
};
