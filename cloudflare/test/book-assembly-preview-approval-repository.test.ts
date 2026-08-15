import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT,
  FirebaseRestBookAssemblyPreviewApprovalRepository,
} from '../src/upload-worker/book-assembly/preview-approval-repository.ts';
import type { BookAssemblyPreviewApprovalRecord } from '../../src/services/book-assembly/unitPreview.service';
import type { BookAssemblyPreviewApprovalRevocationRecord } from '../../src/services/book-assembly/previewApproval.repository';

const DB_URL = 'https://firebase.test';
const BOOK = 'book-1';
const UNIT = 'unit-1';
const APPROVAL_ID = 'approval-1';
const approvalPath = `${BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT}/${BOOK}/units/${UNIT}/approvals/${APPROVAL_ID}`;
const revocationPath = `${BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT}/${BOOK}/units/${UNIT}/revocations/${APPROVAL_ID}`;

const approval = (overrides: Partial<BookAssemblyPreviewApprovalRecord> = {}): BookAssemblyPreviewApprovalRecord => ({
  approvalId: APPROVAL_ID,
  approvalRevision: 1,
  actorId: 'teacher-1',
  bookId: BOOK,
  bookRevision: 3,
  unitKey: UNIT,
  candidateId: 'candidate-1',
  candidateRevision: 5,
  sourceSetRevision: 4,
  registryVersion: 'registry-v1',
  inputFingerprint: 'fnv1a64:0123456789abcdef',
  canonicalActivityFingerprintsByKey: {
    'activity-1': 'fnv1a64:fedcba9876543210',
  },
  approvedAt: '2026-07-27T00:00:00.000Z',
  expiresAt: '2026-07-27T01:00:00.000Z',
  ...overrides,
});

const revocation = (overrides: Partial<BookAssemblyPreviewApprovalRevocationRecord> = {}): BookAssemblyPreviewApprovalRevocationRecord => ({
  approvalId: APPROVAL_ID,
  bookId: BOOK,
  unitKey: UNIT,
  actorId: 'teacher-1',
  revokedAt: '2026-07-27T00:30:00.000Z',
  ...overrides,
});

const pathOf = (input: RequestInfo | URL): string => {
  const url = new URL(String(input));
  return decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
};

const harness = (initial: Record<string, unknown> = {}, options: { readonly rejectFirstPut?: boolean } = {}) => {
  const values = new Map(Object.entries(initial));
  const etags = new Map<string, string>();
  const calls: Array<{ method: string; path: string; auth: string | null; ifMatch: string | null }> = [];
  let rejected = false;
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = String(init?.method ?? 'GET');
    const path = pathOf(input as RequestInfo | URL);
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ method, path, auth: url.searchParams.get('auth'), ifMatch: headers.get('if-match') });
    if (method === 'GET') {
      const value = values.has(path) ? values.get(path) : null;
      const etag = etags.get(path) ?? '"null"';
      if (headers.get('x-firebase-etag') === 'true') {
        return new Response(JSON.stringify(value), { status: 200, headers: { etag } });
      }
      return new Response(JSON.stringify(value), { status: 200 });
    }
    if (method === 'PUT') {
      if (options.rejectFirstPut && !rejected) {
        rejected = true;
        values.set(path, { ...approval(), inputFingerprint: 'fnv1a64:aaaaaaaaaaaaaaaa' });
        etags.set(path, '"concurrent"');
        return new Response('', { status: 412 });
      }
      const expected = etags.get(path) ?? '"null"';
      if (headers.get('if-match') !== expected) return new Response('', { status: 412 });
      values.set(path, JSON.parse(String(init?.body ?? 'null')) as unknown);
      etags.set(path, '"written"');
      return new Response('', { status: 200 });
    }
    return new Response('', { status: 405 });
  };
  return { values, calls, fetchImpl };
};

const repository = (fetchImpl: typeof fetch, getIdToken = vi.fn(async () => 'firebase-id-token')) => new FirebaseRestBookAssemblyPreviewApprovalRepository({
  env: { FIREBASE_DB_URL: DB_URL },
  fetchImpl,
  getIdToken,
});

describe('durable book assembly preview approval repository', () => {
  it('writes exact approval/revocation children with injected Firebase ID-token auth and reads both', async () => {
    const fixture = harness();
    const getIdToken = vi.fn(async () => 'firebase-id-token');
    const repo = repository(fixture.fetchImpl, getIdToken);

    expect(await repo.create(approval())).toBe('created');
    expect(fixture.values.get(approvalPath)).toEqual(approval());
    expect(fixture.calls.find((call) => call.method === 'PUT')?.path).toBe(approvalPath);
    expect(fixture.calls.filter((call) => call.auth === 'firebase-id-token')).not.toHaveLength(0);
    expect(await repo.revoke(revocation())).toBe('revoked');
    expect(fixture.values.get(revocationPath)).toEqual(revocation());
    expect(await repo.revoke(revocation())).toBe('replayed');
    expect(await repo.revoke(revocation({ actorId: 'teacher-2' }))).toBe('conflict');

    await expect(repo.read(BOOK, UNIT, APPROVAL_ID)).resolves.toEqual({
      approval: approval(), revocation: revocation(),
    });
    expect(fixture.calls.filter((call) => call.method === 'PUT')).toHaveLength(2);
    expect(getIdToken).not.toHaveBeenCalledWith(undefined);
  });

  it('is create-only: exact replay is stable and a divergent child conflicts without overwrite', async () => {
    const fixture = harness();
    const repo = repository(fixture.fetchImpl);
    expect(await repo.create(approval())).toBe('created');
    expect(await repo.create(approval())).toBe('replayed');
    expect(await repo.create(approval({ actorId: 'teacher-2' }))).toBe('conflict');
    expect(fixture.values.get(approvalPath)).toEqual(approval());
    expect(fixture.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
  });

  it('rechecks the child after a failed ETag CAS and never overwrites a concurrent approval', async () => {
    const fixture = harness({}, { rejectFirstPut: true });
    const repo = repository(fixture.fetchImpl);
    expect(await repo.create(approval())).toBe('conflict');
    expect(fixture.calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
    expect((fixture.values.get(approvalPath) as BookAssemblyPreviewApprovalRecord).inputFingerprint)
      .toBe('fnv1a64:aaaaaaaaaaaaaaaa');
  });

  it('rejects sensitive payload fields and keeps read scoped to Book/Unit/approval ID', async () => {
    const fixture = harness();
    const repo = repository(fixture.fetchImpl);
    await expect(repo.create({ ...approval(), content: { answer: 'secret' } } as never))
      .rejects.toThrow('invalid_book_assembly_preview_approval');
    await expect(repo.read('../other-book', UNIT, APPROVAL_ID)).rejects
      .toThrow('invalid_book_assembly_preview_approval_book_id');
    expect(fixture.calls).toHaveLength(0);
  });
});
