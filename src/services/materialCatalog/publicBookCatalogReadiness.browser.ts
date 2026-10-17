import { endBefore, get, limitToLast, orderByChild, query, ref } from 'firebase/database';
import { database } from '../firebaseCore';
import { listPublicBookCatalogPage, type PublicBookCatalogCursor } from './publicBookCatalogReadiness.service';

export const listPublicBookCatalogPageBrowser = (input: { readonly limit?: number; readonly cursor?: PublicBookCatalogCursor } = {}) => listPublicBookCatalogPage({
  ...input,
  readPage: async (path, limit, cursor) => {
    const base = ref(database, path);
    const pageQuery = cursor
      ? query(base, orderByChild('updatedAt'), endBefore(cursor.updatedAt, cursor.bookId), limitToLast(limit))
      : query(base, orderByChild('updatedAt'), limitToLast(limit));
    const rows: [string, unknown][] = [];
    (await get(pageQuery)).forEach((child) => { rows.push([child.key!, child.val()]); });
    return rows;
  },
});
