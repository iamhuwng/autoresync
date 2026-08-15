import { afterEach, describe, expect, it } from 'vitest';
import {
  attachVerifiedFullPdfSource,
  createFirebaseMaterialBookSourceAttachmentRepository,
} from '../src/upload-worker/book-source/material-book-source-attachment-repository.ts';
import {
  createMaterialBookSourceAttachmentService,
  type MaterialBookSourceAttachmentBook,
} from '../../src/services/book-source-delivery/materialBookSourceAttachment.service.ts';

const accountId = 'account-1';
const ownerId = 'teacher-1';
const bookId = 'book-1';
const sourceKey = 'full';
const sourceVersionId = 'source-v1';
const bookPath = `material_catalog/books/${bookId}`;
const sourcePath = `book_source_upload_accounts/${accountId}/assemblyBooks/${bookId}/${sourceKey}`;

const book = (overrides: Partial<MaterialBookSourceAttachmentBook> = {}): MaterialBookSourceAttachmentBook => ({
  bookId,
  ownerId,
  bookMode: 'pdf',
  status: 'draft-in-progress',
  bookRevision: 0,
  sourceSetRevision: 0,
  sourceSet: null,
  ...overrides,
});

const sourceProjection = (verifiedUsable = true) => ({
  ownerId,
  bookId,
  sourceKey,
  sourceVersionId,
  physicalPageCount: 12,
  verifiedUsable,
});

const pathParts = (path: string): string[] => path.split('/').filter(Boolean);
const clone = <T>(value: T): T => structuredClone(value);
const readTree = (tree: Record<string, unknown>, path: string): unknown => pathParts(path).reduce<unknown>((current, part) => (
  current && typeof current === 'object' && !Array.isArray(current)
    ? (current as Record<string, unknown>)[part]
    : undefined
), tree) ?? null;
const writeTree = (tree: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = pathParts(path);
  let parent = tree;
  for (const part of parts.slice(0, -1)) {
    const next = parent[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) parent[part] = {};
    parent = parent[part] as Record<string, unknown>;
  }
  parent[parts.at(-1)!] = clone(value);
};

const fixture = (
  verified = true,
  initialBook: Partial<MaterialBookSourceAttachmentBook> = book(),
) => {
  const tree: Record<string, unknown> = {};
  writeTree(tree, bookPath, initialBook);
  writeTree(tree, sourcePath, sourceProjection(verified));
  const revisions = new Map<string, number>();
  let failBookPut = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
    const method = String(init?.method ?? 'GET');
    const etag = `"${revisions.get(path) ?? 0}"`;
    if (method === 'GET') {
      return new Response(JSON.stringify(readTree(tree, path)), {
        status: 200,
        headers: { etag },
      });
    }
    if (method === 'PUT') {
      const headers = new Headers(init?.headers);
      if (headers.get('if-match') !== etag) return new Response('', { status: 412 });
      if (path === bookPath && failBookPut) {
        failBookPut = false;
        return new Response('', { status: 503 });
      }
      writeTree(tree, path, JSON.parse(String(init?.body ?? 'null')) as unknown);
      revisions.set(path, (revisions.get(path) ?? 0) + 1);
      return new Response('{}', { status: 200 });
    }
    return new Response('', { status: 405 });
  };
  return {
    tree,
    fetchImpl,
    setFailBookPut: () => { failBookPut = true; },
  };
};

const createFixtureServices = (state: ReturnType<typeof fixture>) => {
  const repository = createFirebaseMaterialBookSourceAttachmentRepository({
    env: { FIREBASE_DB_URL: 'https://firebase.test' },
    accountId,
    fetchImpl: state.fetchImpl,
    getAccessToken: async () => 'trusted-token',
  });
  return {
    repository,
    service: createMaterialBookSourceAttachmentService(repository),
  };
};

describe('production-normal verified source attachment', () => {
  afterEach(() => {
    // Keep this suite explicit about not using a browser/provider transport.
  });

  it('attaches a provider-free full-PDF source set and persists the replay receipt', async () => {
    const state = fixture();
    const { repository, service } = createFixtureServices(state);
    const result = await attachVerifiedFullPdfSource(service, repository, {
      ownerId,
      bookId,
      operationId: 'reservation-1',
      sourceKey,
      sourceVersionId,
    });

    expect(result).toMatchObject({ status: 'attached', bookRevision: 1, sourceSetRevision: 1 });
    expect(readTree(state.tree, bookPath)).toEqual(expect.objectContaining({
      status: 'ready',
      bookRevision: 1,
      sourceSetRevision: 1,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey, sourceVersionId, sourceOrder: 1 }] },
    }));
    expect(JSON.stringify(readTree(state.tree, bookPath))).not.toMatch(/provider|privateObjectKey|bucket|credential/iu);
  });

  it('replays a ready attachment without incrementing either revision', async () => {
    const state = fixture();
    const { repository, service } = createFixtureServices(state);
    const input = {
      ownerId, bookId, operationId: 'ready-replay-1', sourceKey, sourceVersionId,
    };

    const first = await attachVerifiedFullPdfSource(service, repository, input);
    const replay = await attachVerifiedFullPdfSource(service, repository, input);

    expect(first).toMatchObject({ status: 'attached', bookRevision: 1, sourceSetRevision: 1 });
    expect(replay).toMatchObject({ status: 'replayed', bookRevision: 1, sourceSetRevision: 1 });
    expect(readTree(state.tree, bookPath)).toEqual(expect.objectContaining({
      status: 'ready',
      bookRevision: 1,
      sourceSetRevision: 1,
    }));
  });

  it('reconciles an already-attached non-ready same-source row through trusted completion', async () => {
    const state = fixture(true, book({
      status: 'draft-in-progress',
      bookRevision: 1,
      sourceSetRevision: 1,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey, sourceVersionId, sourceOrder: 1 }] },
    }));
    const { repository, service } = createFixtureServices(state);

    const result = await attachVerifiedFullPdfSource(service, repository, {
      ownerId, bookId, operationId: 'reconcile-1', sourceKey, sourceVersionId,
    });

    expect(result).toMatchObject({ status: 'replaced', bookRevision: 2, sourceSetRevision: 2 });
    expect(readTree(state.tree, bookPath)).toEqual(expect.objectContaining({
      status: 'ready',
      bookRevision: 2,
      sourceSetRevision: 2,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey, sourceVersionId, sourceOrder: 1 }] },
    }));
  });

  it('upgrades an exact legacy empty PDF Book through the attachment CAS', async () => {
    const legacy = { ...book() } as Record<string, unknown>;
    delete legacy.bookRevision;
    delete legacy.sourceSetRevision;
    delete legacy.sourceSet;
    const state = fixture(true, legacy);
    const { repository, service } = createFixtureServices(state);

    const result = await attachVerifiedFullPdfSource(service, repository, {
      ownerId, bookId, operationId: 'legacy-reservation-1', sourceKey, sourceVersionId,
    });

    expect(result).toMatchObject({ status: 'attached', bookRevision: 1, sourceSetRevision: 1 });
    expect(readTree(state.tree, bookPath)).toEqual(expect.objectContaining({
      bookRevision: 1,
      sourceSetRevision: 1,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey, sourceVersionId, sourceOrder: 1 }] },
    }));

    const replay = await attachVerifiedFullPdfSource(service, repository, {
      ownerId, bookId, operationId: 'legacy-reservation-1', sourceKey, sourceVersionId,
    });
    expect(replay).toMatchObject({ status: 'replayed', bookRevision: 1, sourceSetRevision: 1 });
  });

  const invalidLegacyBooks: readonly [string, Partial<MaterialBookSourceAttachmentBook>][] = [
    ['only book revision missing', { bookRevision: undefined }],
    ['only source-set revision missing', { sourceSetRevision: undefined }],
    ['existing source set without revisions', {
      bookRevision: undefined,
      sourceSetRevision: undefined,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey, sourceVersionId, sourceOrder: 1 }] },
    }],
  ];

  it.each(invalidLegacyBooks)('rejects legacy rows with %s', async (_label, overrides) => {
    const initialBook = book(overrides);
    const state = fixture(true, initialBook);
    const { repository, service } = createFixtureServices(state);

    await expect(attachVerifiedFullPdfSource(service, repository, {
      ownerId, bookId, operationId: 'reservation-1', sourceKey, sourceVersionId,
    })).rejects.toThrow('material_book_source_attachment_revision_unavailable');
    expect(readTree(state.tree, bookPath)).toEqual(initialBook);
  });

  it('repairs a response-loss/partial write on replay without incrementing twice', async () => {
    const state = fixture();
    const { repository, service } = createFixtureServices(state);
    state.setFailBookPut();
    await expect(attachVerifiedFullPdfSource(service, repository, {
      ownerId, bookId, operationId: 'reservation-1', sourceKey, sourceVersionId,
    })).rejects.toThrow();
    expect(readTree(state.tree, bookPath)).toEqual(expect.objectContaining({ bookRevision: 0, sourceSet: null }));

    const replay = await attachVerifiedFullPdfSource(service, repository, {
      ownerId, bookId, operationId: 'reservation-1', sourceKey, sourceVersionId,
    });
    expect(replay.status).toBe('attached');
    expect(readTree(state.tree, bookPath)).toEqual(expect.objectContaining({ bookRevision: 1, sourceSetRevision: 1 }));
  });

  it.each([
    ['wrong owner', () => ({ ownerId: 'other-teacher', bookId, operationId: 'reservation-1', sourceKey, sourceVersionId })],
  ])('%s does not mutate the canonical Book', async (_label, input) => {
    const state = fixture();
    const { repository, service } = createFixtureServices(state);
    await expect(attachVerifiedFullPdfSource(service, repository, input())).rejects.toThrow();
    expect(readTree(state.tree, bookPath)).toEqual(book());
  });

  it('fails closed on stale revisions and unverified source projections', async () => {
    const staleState = fixture();
    const stale = createFixtureServices(staleState);
    const staleResult = await stale.service.attach({
      ownerId, bookId, operationId: 'reservation-stale', expectedBookRevision: 9, expectedSourceSetRevision: 9,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey, sourceVersionId, sourceOrder: 1 }] },
    });
    expect(staleResult).toMatchObject({ status: 'conflict', reason: 'stale-revision' });
    expect(readTree(staleState.tree, bookPath)).toEqual(book());

    const unverifiedState = fixture(false);
    const unverified = createFixtureServices(unverifiedState);
    const unverifiedResult = await unverified.service.attach({
      ownerId, bookId, operationId: 'reservation-unverified', expectedBookRevision: 0, expectedSourceSetRevision: 0,
      sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey, sourceVersionId, sourceOrder: 1 }] },
    });
    expect(unverifiedResult).toMatchObject({ status: 'conflict', reason: 'unverified-source' });
    expect(readTree(unverifiedState.tree, bookPath)).toEqual(book());
  });
});
