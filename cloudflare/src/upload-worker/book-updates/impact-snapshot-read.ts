import type { BookImpactSnapshotRepository } from './impact-snapshot.ts';

const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

/**
 * Read-only #108 contribution for #59's fixed future route seam.
 * The top-level router remains owned by #59 and activation remains default-off.
 */
export const createBookImpactSnapshotReadHandler = (options: {
  readonly repository: BookImpactSnapshotRepository;
  readonly now?: () => Date;
}) => async (input: {
  readonly request: Request;
  readonly uid: string;
  readonly params: Readonly<Record<string, string>>;
}): Promise<Response> => {
  const bookId = input.params.bookId;
  if (!bookId) return json({ code: 'invalid_book_id' }, 400);
  const fingerprint = new URL(input.request.url).searchParams.get('fingerprint') ?? undefined;
  const result = await options.repository.readCurrent({
    actorId: input.uid,
    bookId,
    ...(fingerprint ? { expectedFingerprint: fingerprint } : {}),
    now: (options.now?.() ?? new Date()).toISOString(),
  });
  switch (result.status) {
    case 'ready': return json(result.snapshot, 200);
    case 'expired': return json(result, 410);
    case 'stale': return json(result, 409);
    case 'missing': return json(result, 404);
    case 'denied': return json(result, 403);
  }
};
