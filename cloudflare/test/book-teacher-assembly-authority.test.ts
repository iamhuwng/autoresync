import { describe, expect, it, vi } from 'vitest';
import { createBookDocumentWorker } from '../src/upload-worker/book-delivery/document-worker.ts';
import {
  authorizeTeacherAssemblyDocumentRequest,
  parseTeacherAssemblyDocumentRoute,
  type TeacherAssemblyAuthorityPorts,
  type TeacherAssemblyAuthorizedSource,
  type TeacherAssemblyBookAuthority,
  type TeacherAssemblyCandidateLookup,
  type TeacherAssemblyDocumentRoute,
  type TeacherAssemblyIdentity,
  type TeacherAssemblySourceVersion,
} from '../src/upload-worker/book-delivery/teacher-assembly-authority.ts';
import type { BookAssemblyCandidateRecord } from '../../src/services/book-assembly/unitAssembly.types.ts';
import type { BookAssemblyManifestCandidate, SourceSetCandidate } from '../../src/types/bookAssembly.types.ts';

const TOKEN = 'teacher-token';
const BOOK_ID = 'book-1';
const UNIT_KEY = 'unit-1';
const CANDIDATE_ID = 'candidate-1';
const SOURCE_KEY = 'source-full';
const SOURCE_VERSION_ID = 'source-version-1';
const NOW = '2026-07-27T00:00:00.000Z';

const source = (overrides: Partial<TeacherAssemblyAuthorizedSource> = {}): TeacherAssemblyAuthorizedSource => ({
  bookId: BOOK_ID,
  sourceVersionId: SOURCE_VERSION_ID,
  storageLocationId: 'location-1',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'private-bucket-1',
  providerObjectKey: 'private/book-1/source-version-1.pdf',
  providerFileId: 'file-1',
  providerFileVersionId: 'file-version-1',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  byteSize: 3,
  provider: 'b2',
  bucket: 'private-bucket-1',
  objectKey: 'private/book-1/source-version-1.pdf',
  ...overrides,
});

const sourceSet = (component = false): SourceSetCandidate => component
  ? {
      sourceStrategy: 'component_pdfs',
      sources: [{ sourceKey: SOURCE_KEY, sourceVersionId: SOURCE_VERSION_ID, sourceOrder: 1, ownerNodeKey: UNIT_KEY }],
    }
  : {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: SOURCE_KEY, sourceVersionId: SOURCE_VERSION_ID, sourceOrder: 1 }],
    };

const manifest = (component = false): BookAssemblyManifestCandidate => ({
  bookId: BOOK_ID,
  sourceSet: sourceSet(component),
  nodes: component
    ? [
        { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
        { nodeKey: UNIT_KEY, parentNodeKey: 'root', nodeType: 'unit', order: 1 },
      ]
    : [{ nodeKey: UNIT_KEY, parentNodeKey: null, nodeType: 'unit', order: 1 }],
  units: [{
    unitKey: UNIT_KEY,
    activitySlots: [{ activityKey: 'activity-1', order: 1, contextRequirement: 'none', pageGroupKeys: ['group-1'] }],
    pageGroups: [{ pageGroupKey: 'group-1', sourceKey: SOURCE_KEY, pages: [1], activityKeys: ['activity-1'], mode: 'activity' }],
  }],
});

const candidate = (overrides: Partial<BookAssemblyCandidateRecord> = {}, component = false): BookAssemblyCandidateRecord => ({
  candidateId: CANDIDATE_ID,
  ownerId: 'teacher-1',
  bookId: BOOK_ID,
  bookRevision: 4,
  sourceSetRevision: 2,
  unitKey: UNIT_KEY,
  revision: 3,
  lifecycle: 'validated',
  manifest: manifest(component),
  validation: { valid: true, errors: [] },
  updatedAt: NOW,
  ...overrides,
});

const book = (component = false, overrides: Partial<TeacherAssemblyBookAuthority> = {}): TeacherAssemblyBookAuthority => ({
  bookId: BOOK_ID,
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  status: 'active',
  bookRevision: 4,
  sourceSetRevision: 2,
  sourceSet: sourceSet(component),
  ...overrides,
});

const sourceVersion = (component = false, overrides: Partial<TeacherAssemblySourceVersion> = {}): TeacherAssemblySourceVersion => ({
  sourceVersionId: SOURCE_VERSION_ID,
  sourceKey: SOURCE_KEY,
  bookId: BOOK_ID,
  ownerId: 'teacher-1',
  bookRevision: 4,
  sourceSetRevision: 2,
  lifecycle: 'verified-usable',
  storage: source(),
  ...overrides,
});

const route = (overrides: Partial<TeacherAssemblyDocumentRoute> = {}): TeacherAssemblyDocumentRoute => ({
  kind: 'teacher-assembly',
  bookId: BOOK_ID,
  unitKey: UNIT_KEY,
  candidateId: CANDIDATE_ID,
  candidateRevision: 3,
  sourceKey: SOURCE_KEY,
  sourceVersionId: SOURCE_VERSION_ID,
  bookRevision: 4,
  sourceSetRevision: 2,
  ...overrides,
});

const urlFor = (value: TeacherAssemblyDocumentRoute = route()): string =>
  `/v1/book-delivery/teacher-assembly/${value.bookId}/${value.unitKey}/${value.candidateId}/${value.candidateRevision}/${value.sourceKey}/${value.sourceVersionId}/${value.sourceSetRevision}/${value.bookRevision}`;

const request = (
  value: TeacherAssemblyDocumentRoute = route(),
  init: RequestInit = {},
): Request => new Request(`https://book.test${urlFor(value)}`, {
  ...init,
  headers: { authorization: `Bearer ${TOKEN}`, ...init.headers },
});

const portsFor = (options: {
  readonly identity?: unknown;
  readonly book?: TeacherAssemblyBookAuthority | null;
  readonly candidate?: BookAssemblyCandidateRecord | null;
  readonly current?: TeacherAssemblyCandidateLookup['current'];
  readonly source?: TeacherAssemblySourceVersion | null;
} = {}): TeacherAssemblyAuthorityPorts => ({
  verifyFirebaseIdentity: vi.fn(async () => options.identity ?? ({ uid: 'teacher-1', role: 'teacher', status: 'active' } satisfies TeacherAssemblyIdentity)),
  readBookAuthority: vi.fn(async () => options.book === undefined ? book() : options.book),
  readCandidate: vi.fn(async () => options.candidate === undefined
    ? { candidate: candidate(), current: options.current ?? { candidateId: CANDIDATE_ID, candidateRevision: 3 } }
    : { candidate: options.candidate, current: options.current ?? { candidateId: CANDIDATE_ID, candidateRevision: 3 } }),
  readSourceVersion: vi.fn(async () => options.source === undefined ? sourceVersion() : options.source),
});

const authorize = (ports: TeacherAssemblyAuthorityPorts, value: TeacherAssemblyDocumentRoute = route()) =>
  authorizeTeacherAssemblyDocumentRequest({ request: request(value), ports });

describe('PRD0062 #58 teacher Assembly document authority', () => {
  it('accepts exact full-PDF and component-PDF decisions with server-only source identity', async () => {
    for (const component of [false, true]) {
      const ports = portsFor({
        book: book(component),
        candidate: candidate({}, component),
        source: sourceVersion(component),
      });
      const result = await authorize(ports);
      expect(result).toEqual({
        ok: true,
        decision: expect.objectContaining({
          kind: 'teacher-assembly-authorized',
          serverOnly: true,
          uid: 'teacher-1',
          bookId: BOOK_ID,
          bookRevision: 4,
          sourceSetRevision: 2,
          unitKey: UNIT_KEY,
          candidateId: CANDIDATE_ID,
          candidateRevision: 3,
          sourceKey: SOURCE_KEY,
          sourceVersionId: SOURCE_VERSION_ID,
          sourceLocations: [source()],
        }),
      });
      if (result.ok) {
        expect(result.decision).not.toHaveProperty('url');
        expect(result.decision).not.toHaveProperty('credential');
        expect(result.decision).not.toHaveProperty('authorization');
        expect(result.decision).not.toHaveProperty('studentEntitlement');
      }
    }
  });

  it('rechecks identity before any Book, candidate, or Source lookup', async () => {
    const ports = portsFor({ identity: { uid: 'student-1', role: 'student', status: 'active' } });
    const result = await authorize(ports);
    expect(result).toEqual({ ok: false, code: 'unauthorized' });
    expect(ports.readBookAuthority).not.toHaveBeenCalled();
    expect(ports.readCandidate).not.toHaveBeenCalled();
    expect(ports.readSourceVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong owner', { identity: { uid: 'teacher-2', role: 'teacher', status: 'active' } }, 'forbidden'],
    ['super admin without Book ownership', { identity: { uid: 'admin-1', role: 'super_admin', status: 'active' } }, 'forbidden'],
    ['archived Book', { book: book(false, { status: 'archived' }) }, 'forbidden'],
    ['non-PDF Book', { book: { ...book(), bookMode: 'materials' as never } }, 'forbidden'],
  ] as const)('%s fails before candidate lookup', async (_label, options, code) => {
    const ports = portsFor(options);
    await expect(authorize(ports)).resolves.toEqual({ ok: false, code });
    expect(ports.readCandidate).not.toHaveBeenCalled();
    expect(ports.readSourceVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['stale Book revision', route({ bookRevision: 3 }), 'stale-book'],
    ['stale Source Set revision', route({ sourceSetRevision: 1 }), 'stale-book'],
    ['stale current candidate pointer', route({ candidateRevision: 2 }), 'stale-candidate'],
    ['candidate Book revision', route(), 'stale-candidate'],
  ] as const)('%s fails before Source lookup', async (_label, value, code) => {
    const ports = portsFor({
      candidate: candidate(value.candidateRevision === 2 ? {} : { bookRevision: 3 }),
      current: { candidateId: CANDIDATE_ID, candidateRevision: value.candidateRevision === 2 ? 3 : 3 },
    });
    await expect(authorize(ports, value)).resolves.toEqual({ ok: false, code });
    expect(ports.readSourceVersion).not.toHaveBeenCalled();
  });

  it('denies cross-owner and discarded candidates without source access', async () => {
    const crossOwner = portsFor({ candidate: candidate({ ownerId: 'teacher-2' }) });
    await expect(authorize(crossOwner)).resolves.toEqual({ ok: false, code: 'not-found' });
    expect(crossOwner.readSourceVersion).not.toHaveBeenCalled();

    const discarded = portsFor({ candidate: candidate({ lifecycle: 'discarded', manifest: null }) });
    await expect(authorize(discarded)).resolves.toEqual({ ok: false, code: 'discarded-candidate' });
    expect(discarded.readSourceVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['source key points at another version', { book: book(false, { sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: SOURCE_KEY, sourceVersionId: 'replacement-version', sourceOrder: 1 }] } }), source: sourceVersion(false, { sourceVersionId: 'replacement-version' }) }, 'source-mismatch'],
    ['candidate source set replaced', { candidate: candidate({ manifest: { ...manifest(), sourceSet: { sourceStrategy: 'full_pdf', sources: [{ sourceKey: SOURCE_KEY, sourceVersionId: 'replacement-version', sourceOrder: 1 }] } } }) }, 'source-mismatch'],
    ['source record mismatched', { source: sourceVersion(false, { sourceKey: 'other-source' }) }, 'unsafe-source'],
    ['source replacement lifecycle', { source: sourceVersion(false, { lifecycle: 'replaced' }) }, 'unsafe-source'],
    ['source storage absent', { source: sourceVersion(false, { storage: null }) }, 'unsafe-source'],
    ['unknown Source Version', { source: null }, 'unsafe-source'],
    ['source storage identity mismatched', { source: sourceVersion(false, { storage: source({ sourceVersionId: 'other-version' }) }) }, 'unsafe-source'],
  ] as const)('%s fails before provider access', async (_label, options, code) => {
    const ports = portsFor(options);
    await expect(authorize(ports)).resolves.toEqual({ ok: false, code });
  });

  it('rejects guessed, copied, query-bearing, ancestor-shaped, and non-canonical routes before authority lookup', async () => {
    const ports = portsFor();
    const guessed = new Request('https://book.test/v1/book-delivery/teacher-assembly/book-guess/unit-1/candidate-1/3/source-full/source-version-1/2/4', { headers: { authorization: `Bearer ${TOKEN}` } });
    expect(parseTeacherAssemblyDocumentRoute(guessed)).not.toBeNull();
    await expect(authorizeTeacherAssemblyDocumentRequest({ request: guessed, ports })).resolves.toEqual({ ok: false, code: 'not-found' });
    const cases = [
      new Request('https://book.test/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/3/source-full/source-version-1/2/4/extra', { headers: { authorization: `Bearer ${TOKEN}` } }),
      new Request('https://book.test/v1/book-delivery/teacher-assembly/books/book-1/units/unit-1/candidates/candidate-1/3/source-full/source-version-1/2/4', { headers: { authorization: `Bearer ${TOKEN}` } }),
      new Request('https://book.test/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/03/source-full/source-version-1/2/4', { headers: { authorization: `Bearer ${TOKEN}` } }),
      new Request('https://book.test/v1/book-delivery/teacher-assembly/book-1//unit-1/candidate-1/3/source-full/source-version-1/2/4', { headers: { authorization: `Bearer ${TOKEN}` } }),
      new Request('https://book.test/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/3/source-full/source-version-1/2/4/', { headers: { authorization: `Bearer ${TOKEN}` } }),
      new Request('https://book.test/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/3/source-full/source-version-1/2/4?sourceVersionId=other', { headers: { authorization: `Bearer ${TOKEN}` } }),
      new Request('https://book.test/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/3/source-full/source-version-1/2/4', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } }),
    ];
    for (const value of cases) {
      expect(parseTeacherAssemblyDocumentRoute(value)).toBeNull();
      await expect(authorizeTeacherAssemblyDocumentRequest({ request: value, ports })).resolves.toEqual({ ok: false, code: 'not-found' });
    }
    expect(ports.verifyFirebaseIdentity).toHaveBeenCalledTimes(1);
    expect(ports.readBookAuthority).toHaveBeenCalledTimes(1);
    expect(ports.readCandidate).not.toHaveBeenCalled();
    expect(ports.readSourceVersion).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD'] as const)('keeps %s range-shaped requests bound to same exact decision', async (method) => {
    for (const rangeHeader of ['bytes=0-0', 'bytes=1-', 'bytes=-1']) {
      const ports = portsFor();
      const result = await authorizeTeacherAssemblyDocumentRequest({
        request: request(route(), { method, headers: { Range: rangeHeader } }),
        ports,
      });
      expect(result).toMatchObject({ ok: true, decision: { candidateRevision: 3, sourceVersionId: SOURCE_VERSION_ID } });
    }
  });

  it('runs authorization before existing 09B provider operations and preserves student delivery separation', async () => {
    const ports = portsFor({ candidate: candidate({ revision: 2 }) });
    const provider = {
      readObjectMetadata: vi.fn(async ({ identity }: { identity: TeacherAssemblyAuthorizedSource }) => ({ identity, contentType: 'application/pdf' as const })),
      readBounded: vi.fn(async ({ range }: { range: { offset?: number; length?: number } }) => ({
        offset: range.offset ?? 0,
        bytes: new Uint8Array(range.length ?? 0),
        totalByteSize: 3,
      })),
    };
    const worker = createBookDocumentWorker({
      authorize: async (incomingRequest) => {
        const result = await authorizeTeacherAssemblyDocumentRequest({ request: incomingRequest, ports });
        if (!result.ok) return { ok: false as const, status: 409 as const, code: 'stale-binding' as const };
        return {
          ok: true as const,
          decision: result.decision,
          source: result.decision.sourceLocations[0],
        };
      },
      provider,
    });
    const response = await worker.fetch(request(), {});
    expect(response.status).toBe(409);
    expect(provider.readObjectMetadata).not.toHaveBeenCalled();
    expect(provider.readBounded).not.toHaveBeenCalled();

    const positivePorts = portsFor();
    const positiveWorker = createBookDocumentWorker({
      authorize: async (incomingRequest) => {
        const result = await authorizeTeacherAssemblyDocumentRequest({ request: incomingRequest, ports: positivePorts });
        if (!result.ok) return { ok: false as const, status: 403 as const, code: 'forbidden' as const };
        return {
          ok: true as const,
          decision: result.decision,
          source: result.decision.sourceLocations[0],
        };
      },
      provider,
    });
    const positiveResponse = await positiveWorker.fetch(request(), {});
    expect(positiveResponse.status).toBe(200);
    expect(provider.readObjectMetadata).toHaveBeenCalledTimes(1);
    expect(provider.readBounded).toHaveBeenCalled();
  });
});
