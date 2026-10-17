import { describe, expect, it, vi } from 'vitest';
import { InMemoryBookAssemblyPublicationRepository } from './publicationRepository';
import { createComponentPdfStagingService } from './componentPdfStaging.service';

const claim = (name: string, pages: number, hash: string) => ({ schemaVersion: 1 as const,
  trust: 'browser-supplied-untrusted' as const, state: 'complete' as const, displayFilename: name,
  exactByteSize: 42, sha256Hex: hash.repeat(64), physicalPageCount: pages,
  pdfType: 'application/pdf' as const, readability: 'readable' as const });
const pointer = { publicationId: 'publication-1', publicationRevision: 1, manifestVersionId: 'manifest-1',
  bookRevision: 2, sourceSetRevision: 3, inputFingerprint: 'input-1', operationFingerprint: 'previous',
  updatedAt: '2026-09-20T00:00:00.000Z', updatedByCommandId: '00000000-0000-4000-8000-000000000001' };
const rows = [
  { sourceKey: 'component-1', sourceVersionId: 'source-1', sourceOrder: 1, ownerNodeKey: 'node-1' },
  { sourceKey: 'component-2', sourceVersionId: 'source-2', sourceOrder: 2, ownerNodeKey: 'node-1' },
] as const;
const uploads = [vi.fn(async () => undefined), vi.fn(async () => undefined)];
const input = () => ({ bookId: 'book-1', actorId: 'teacher-1', operationId: '00000000-0000-4000-8000-000000000010',
  claim: claim('combined.pdf', 4, 'c'), sourceSetRevision: 3, currentPointer: pointer,
  compositionFingerprint: 'composition-1',
  components: rows.map((row, index) => ({ sourceKey: row.sourceKey, sourceOrder: row.sourceOrder, ownerNodeKey: row.ownerNodeKey,
    claim: claim(`${row.sourceKey}.pdf`, 2, index ? 'b' : 'a'), upload: uploads[index] })),
  upload: vi.fn(async () => undefined), now: '2026-09-20T00:00:02.000Z' });

const harness = () => {
  const seen = new Map<string, number>();
  const begin = vi.fn(async (request: { idempotencyKey: string; sourceKey: string; purpose: string }) => {
    const count = seen.get(request.idempotencyKey) ?? 0;
    seen.set(request.idempotencyKey, count + 1);
    const index = request.sourceKey === 'component-1' ? 1 : request.sourceKey === 'component-2' ? 2 : 3;
    return { status: count ? 'replayed' as const : 'reserved' as const, reservationId: `reservation-${index}`,
      sourceVersionId: index < 3 ? `source-${index}` : 'student-version-1', uploadUrl: 'https://upload.example',
      expiresAt: '2026-09-20T00:01:00.000Z', requiredHeaders: {}, purpose: request.purpose as 'book-source' | 'student-document',
      studentSafeStatus: 'unreviewed' as const };
  });
  const complete = vi.fn(async (request: { reservationId: string }) => {
    const index = Number(request.reservationId.at(-1));
    return { reservationId: request.reservationId, bookId: 'book-1', sourceVersionId: index < 3 ? `source-${index}` : 'student-version-1',
      sourceKey: index === 1 ? 'component-1' : index === 2 ? 'component-2' : 'student-document', kind: 'initial' as const,
      checksum: { algorithm: 'sha-256' as const, value: (index === 1 ? 'a' : index === 2 ? 'b' : 'c').repeat(64) },
      purpose: index < 3 ? 'book-source' as const : 'student-document' as const, studentSafeStatus: 'unreviewed' as const,
      status: 'verified_completed' as const, completedAt: '2026-09-20T00:00:01.000Z', physicalPageCount: index < 3 ? 2 : 4 };
  });
  const decideStudentSafeSource = vi.fn(async () => ({ ...(await complete({ reservationId: 'reservation-3' })),
    studentSafeStatus: 'ready' as const, studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: '2026-09-20T00:00:01.000Z',
      sourceVersionId: 'student-version-1', sha256Hex: 'c'.repeat(64), reasonCode: 'teacher-reviewed' as const } }));
  return { sourceUpload: { begin, complete, decideStudentSafeSource }, begin, complete, decideStudentSafeSource };
};

describe('component PDF staging', () => {
  it('serially stages two rows and combined output, then replays without uploading again', async () => {
    uploads.forEach((upload) => upload.mockClear());
    const controls = harness();
    const repository = new InMemoryBookAssemblyPublicationRepository({ 'book-1': { current: pointer } });
    const service = createComponentPdfStagingService({ sourceUpload: controls.sourceUpload, publicationRepository: repository });
    const first = await service.stage(input());
    expect(first.status).toBe('committed');
    expect(first.verifiedSourceSet).toEqual({ sourceStrategy: 'component_pdfs', sources: rows });
    expect(controls.begin.mock.calls.map(([request]) => request.sourceKey)).toEqual(['component-1', 'component-2', 'student-document']);
    const rowIds = controls.begin.mock.calls.slice(0, 2).map(([request]) => request.idempotencyKey);
    expect(rowIds.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/u.test(id))).toBe(true);
    expect(new Set(rowIds).size).toBe(2);
    expect(uploads.map((upload) => upload.mock.calls.length)).toEqual([1, 1]);
    expect((await service.stage(input())).status).toBe('replayed');
    expect(controls.begin.mock.calls.slice(3, 5).map(([request]) => request.idempotencyKey)).toEqual(rowIds);
    expect(uploads.map((upload) => upload.mock.calls.length)).toEqual([1, 1]);
    expect(controls.decideStudentSafeSource).toHaveBeenCalledTimes(2);
  });

  it('rejects caller row identity that disagrees with trusted completion', async () => {
    const controls = harness();
    const bad = input();
    bad.components[0] = { ...bad.components[0]!, sourceKey: 'forged' };
    await expect(createComponentPdfStagingService({ sourceUpload: controls.sourceUpload,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({ 'book-1': { current: pointer } }) }).stage(bad))
      .rejects.toThrow('component_pdf_staging_completion_invalid');
  });

  it('replays the create-once descriptor without touching publication state', async () => {
    const controls = harness();
    const repository = new InMemoryBookAssemblyPublicationRepository({ 'book-1': { current: pointer } });
    const service = createComponentPdfStagingService({ sourceUpload: controls.sourceUpload, publicationRepository: repository });
    const first = await service.stage(input());
    const scope = await repository.readScope('book-1');
    const crashed = new InMemoryBookAssemblyPublicationRepository({ 'book-1': { ...scope, operations: {} } });
    const transaction = vi.spyOn(crashed, 'transaction');
    const replay = await createComponentPdfStagingService({ sourceUpload: controls.sourceUpload, publicationRepository: crashed }).stage(input());
    expect(replay.status).toBe('replayed');
    expect(transaction.mock.calls[0]).toHaveLength(2);
    expect(await crashed.readScope('book-1')).toMatchObject({
      current: scope.current,
      studentDocuments: scope.studentDocuments,
    });
  });

  it('keeps changed descriptor input conflicts and ignores publication current', async () => {
    const controls = harness();
    const repository = new InMemoryBookAssemblyPublicationRepository({ 'book-1': { current: pointer } });
    const service = createComponentPdfStagingService({ sourceUpload: controls.sourceUpload, publicationRepository: repository });
    await service.stage(input());
    await expect(service.stage({ ...input(), compositionFingerprint: 'changed' })).rejects.toThrow('component_pdf_staging_conflict');
    const fresh = harness();
    await expect(createComponentPdfStagingService({ sourceUpload: fresh.sourceUpload,
      publicationRepository: new InMemoryBookAssemblyPublicationRepository({ 'book-1': { current: { ...pointer, publicationRevision: 9 } } })
    }).stage(input())).resolves.toMatchObject({ status: 'committed' });
  });
});
