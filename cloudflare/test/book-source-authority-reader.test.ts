import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_SOURCE_ASSEMBLY_PROJECTION_PATH,
  BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH,
  MATERIAL_BOOK_PATH,
  createFirebaseBookSourceAuthorityReader,
  parseBookSourceAuthority,
  readBookSourceAuthority,
} from '../src/upload-worker/book-assembly/book-source-authority-reader.ts';

const OWNER_ID = 'teacher-1';
const BOOK_ID = 'book-1';
const ACCOUNT_ID = 'account-1';

const sourceSet = {
  sourceStrategy: 'component_pdfs' as const,
  sources: [
    { sourceKey: 'unit-1', sourceVersionId: 'source-1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
    { sourceKey: 'unit-2', sourceVersionId: 'source-2', sourceOrder: 2, ownerNodeKey: 'unit-2' },
  ],
};

const book = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  bookId: BOOK_ID,
  ownerId: OWNER_ID,
  bookMode: 'pdf',
  status: 'ready',
  bookRevision: 4,
  sourceSetRevision: 2,
  sourceSet,
  ...overrides,
});

const projection = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  'unit-1': {
    ownerId: OWNER_ID,
    bookId: BOOK_ID,
    sourceKey: 'unit-1',
    sourceVersionId: 'source-1',
    physicalPageCount: 12,
    verifiedUsable: true,
  },
  'unit-2': {
    ownerId: OWNER_ID,
    bookId: BOOK_ID,
    sourceKey: 'unit-2',
    sourceVersionId: 'source-2',
    physicalPageCount: 8,
    verifiedUsable: true,
  },
  ...overrides,
});

const read = (
  bookValue: unknown = book(),
  projectionValue?: unknown,
) => {
  const reads = vi.fn(async (path: string): Promise<unknown> => {
    if (path === MATERIAL_BOOK_PATH(BOOK_ID)) return bookValue;
    const match = new RegExp(`^${BOOK_SOURCE_ASSEMBLY_PROJECTION_PATH(ACCOUNT_ID, BOOK_ID)}/(.+)$`).exec(path);
    if (match) {
      const all = projectionValue === undefined ? projection() : projectionValue;
      return all && typeof all === 'object' ? (all as Record<string, unknown>)[match[1]!] ?? null : null;
    }
    throw new Error(`unexpected path: ${path}`);
  });
  return { reads, port: { readValue: reads } };
};

describe('Book Assembly Source Authority reader', () => {
  it('reads the canonical Book first and returns provider-free projections', async () => {
    const harness = read();
    const authority = await readBookSourceAuthority(harness.port, {
      ownerId: OWNER_ID,
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
    });

    expect(authority).toMatchObject({
      bookId: BOOK_ID,
      ownerId: OWNER_ID,
      bookMode: 'pdf',
      bookRevision: 4,
      sourceSetRevision: 2,
      sourceSet,
    });
    expect(authority?.sourceVersionAuthority.getSourceVersion('source-1')).toEqual({
      sourceVersionId: 'source-1',
      bookId: BOOK_ID,
      physicalPageCount: 12,
      verifiedUsable: true,
    });
    expect(authority?.sourceVersionAuthority.getSourceVersion('source-2')).toEqual({
      sourceVersionId: 'source-2',
      bookId: BOOK_ID,
      physicalPageCount: 8,
      verifiedUsable: true,
    });
    expect(harness.reads.mock.calls.map(([path]) => path)).toEqual([
      MATERIAL_BOOK_PATH(BOOK_ID),
      BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(ACCOUNT_ID, BOOK_ID, 'unit-1'),
      BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(ACCOUNT_ID, BOOK_ID, 'unit-2'),
    ]);
    expect(JSON.stringify(authority)).not.toContain('provider');
  });

  it.each([
    ['wrong authenticated owner', { ownerId: 'teacher-2', bookId: BOOK_ID }, book()],
    ['wrong Book row', { ownerId: OWNER_ID, bookId: BOOK_ID }, book({ bookId: 'book-2' })],
  ] as const)('%s stops before the source projection read', async (_label, input, bookValue) => {
    const harness = read(bookValue);
    await expect(readBookSourceAuthority(harness.port, { ...input, accountId: ACCOUNT_ID })).resolves.toBeNull();
    expect(harness.reads).toHaveBeenCalledTimes(1);
    expect(harness.reads).toHaveBeenCalledWith(MATERIAL_BOOK_PATH(BOOK_ID));
  });

  it.each([
    ['missing Book revision', { bookRevision: undefined }],
    ['malformed Book revision', { bookRevision: 1.5 }],
    ['missing Source Set revision', { sourceSetRevision: undefined }],
    ['malformed Source Set', { sourceSet: { sourceStrategy: 'full_pdf', sources: [] } }],
    ['ineligible Book status', { status: 'draft-in-progress' }],
    ['non-PDF Book', { bookMode: 'materials' }],
  ] as const)('%s fails closed before reading source state', async (_label, overrides) => {
    const harness = read(book(overrides));
    await expect(readBookSourceAuthority(harness.port, {
      ownerId: OWNER_ID,
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
    })).resolves.toBeNull();
    expect(harness.reads).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing source projection', null],
    ['unverified source projection', projection({ 'unit-1': {
      ...(projection()['unit-1'] as Record<string, unknown>), verifiedUsable: false,
    } })],
    ['source projection for another Book', projection({ 'unit-1': {
      ...(projection()['unit-1'] as Record<string, unknown>), bookId: 'book-2',
    } })],
    ['source projection with provider field', projection({ 'unit-1': {
      ...(projection()['unit-1'] as Record<string, unknown>), providerObjectKey: 'private/book-1/source-1.pdf',
    } })],
  ] as const)('%s fails closed after canonical Book validation', async (_label, sourceProjection) => {
    const harness = read(book(), sourceProjection);
    await expect(readBookSourceAuthority(harness.port, {
      ownerId: OWNER_ID,
      bookId: BOOK_ID,
      accountId: ACCOUNT_ID,
    })).resolves.toBeNull();
    expect(harness.reads).toHaveBeenCalledTimes(3);
  });

  it('keeps parser and adapter seams independent of Firebase transport', () => {
    const authority = parseBookSourceAuthority({
      ownerId: OWNER_ID,
      bookId: BOOK_ID,
      book: book(),
      sourceProjection: projection(),
    });
    expect(authority?.sourceVersionAuthority.getSourceVersion('source-1')).toEqual({
      sourceVersionId: 'source-1',
      bookId: BOOK_ID,
      physicalPageCount: 12,
      verifiedUsable: true,
    });
  });

  it('uses the existing Firebase REST client and exact paths when configured', async () => {
    const calls: string[] = [];
    const reader = createFirebaseBookSourceAuthorityReader({
      FIREBASE_DB_URL: 'https://firebase.test',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: ACCOUNT_ID,
      getFirebaseAuthToken: async (request = { path: '' }) => {
        calls.push(`token:${request.path}`);
        return 'scoped-token';
      },
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
        calls.push(`read:${path}:${url.searchParams.get('auth')}`);
        if (path === MATERIAL_BOOK_PATH(BOOK_ID)) return new Response(JSON.stringify(book()));
        const sourceKey = path.split('/').at(-1)!;
        return new Response(JSON.stringify((projection() as Record<string, unknown>)[sourceKey]));
      },
    });
    await expect(reader.read({ ownerId: OWNER_ID, bookId: BOOK_ID })).resolves.toMatchObject({
      bookId: BOOK_ID,
      ownerId: OWNER_ID,
    });
    expect(calls).toEqual(expect.arrayContaining([
      `token:${MATERIAL_BOOK_PATH(BOOK_ID)}`,
      `read:${MATERIAL_BOOK_PATH(BOOK_ID)}:scoped-token`,
      `token:${BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(ACCOUNT_ID, BOOK_ID, 'unit-1')}`,
      `read:${BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(ACCOUNT_ID, BOOK_ID, 'unit-1')}:scoped-token`,
      `token:${BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(ACCOUNT_ID, BOOK_ID, 'unit-2')}`,
      `read:${BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(ACCOUNT_ID, BOOK_ID, 'unit-2')}:scoped-token`,
    ]));
    expect(calls).toHaveLength(6);
    expect(calls).not.toContain(`token:${BOOK_SOURCE_ASSEMBLY_PROJECTION_PATH(ACCOUNT_ID, BOOK_ID)}`);
  });
});
