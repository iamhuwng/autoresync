/** Dedicated moderation write-side refresh; never invoked while mounting a catalog. */
export const refreshPublicBookReadiness = async (options: {
  baseUrl: string; bookId: string; getIdToken: () => Promise<string>; fetchImpl?: typeof fetch;
}): Promise<void> => {
  const base = new URL(options.baseUrl);
  if ((base.protocol !== 'https:' && !(base.protocol === 'http:' && base.hostname === 'localhost')) || base.username || base.password || base.search || base.hash) throw new Error('public_book_readiness_unavailable');
  const token = await options.getIdToken();
  if (!token) throw new Error('public_book_readiness_unavailable');
  const response = await (options.fetchImpl ?? globalThis.fetch)(`${base.href.replace(/\/$/u, '')}/v1/book-public/books/${encodeURIComponent(options.bookId)}/readiness-refresh`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}',
  });
  if (!response.ok || (await response.json())?.status !== 'ready') throw new Error('public_book_readiness_unavailable');
};
