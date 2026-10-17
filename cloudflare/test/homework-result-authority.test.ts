import { describe, expect, it, vi } from 'vitest';
import { verifyHomeworkResultAuthority, verifiedProof } from '../homework-result-authority.ts';
import { createNotificationFirestoreBridge } from '../notification-firestore-bridge.ts';
vi.mock('../src/upload-worker/firebase-verification.js', () => ({ createFirebaseVerifier: () => ({
  verifyAuthorizationHeader: async (auth: string) => auth.endsWith('invalid') ? { valid: false } : { valid: true, uid: 'student1' },
}) }));

const fixture = () => {
  const cutoff = '2026-09-30T12:00:00.000000001Z';
  const submittedAt = Date.parse('2026-09-30T12:00:01.000Z');
  const homeworkSubmittedAt = submittedAt + 100;
  let requestTime = submittedAt + 1000;
  const documents: Record<string, Record<string, unknown>> = {
    writing_submissions: { id: 'result1', studentId: 'student1', submittedAt,
      context: { type: 'homework', homeworkId: 'assignment1', homeworkSubmissionId: 'attempt1', assigningTeacherId: 'teacher1' }, testMeta: { testId: 'test1' } },
    homework_assignments: { id: 'assignment1', createdBy: 'teacher1', materialId: 'test1', materialSkill: 'writing',
      target: { type: 'students', studentIds: ['student1'] }, contentRef: { contentKind: 'ielts_writing', contentId: 'test1' } },
    homework_submissions: { id: 'attempt1', studentId: 'student1', teacherId: 'teacher1', homeworkId: 'assignment1', resultId: 'result1', submittedAt: homeworkSubmittedAt, status: 'submitted' },
  };
  const leaves: Record<string, unknown> = Object.fromEntries(Object.entries({
    resultId: 'result1', studentId: 'student1', testId: 'test1', testType: 'homework', testSkill: 'writing', isGuest: false,
    submittedAt, createdAt: submittedAt, 'writingData/submissionId': 'result1', 'context/type': 'homework', 'context/source/type': 'homework',
    'context/source/id': 'assignment1', 'context/source/submissionId': 'result1', 'context/assignment/homeworkId': 'assignment1',
  }).map(([key, value]) => [`test_results/result1/${key}`, value]));
  leaves['users/student1/role'] = 'student';
  leaves['users/teacher1/role'] = 'teacher';
  let active = 0;
  let peak = 0;
  const database = {
    read: vi.fn(async (path: string) => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return leaves[path] ?? null; }),
    create: vi.fn(async (path: string, value: unknown) => { if (Object.hasOwn(leaves, path)) return false; leaves[path] = value; return true; }),
  };
  const env = { FIREBASE_PROJECT_ID: 'project', RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME: 'projects/project/rulesets/sealed',
    RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF: cutoff, NOTIFICATION_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) } };
  const readSource = vi.fn(async (collection: string, id: string) => ({ name: `projects/project/databases/(default)/documents/${collection}/${id}`,
    createTime: '2026-09-30T12:00:00.000000002Z', data: documents[collection] }));
  const verify = (actorUid = 'student1') => verifyHomeworkResultAuthority({ resultId: 'result1', actorUid, env, readSource, database: async () => database, now: () => requestTime });
  return { env, documents, leaves, database, readSource, verify, submittedAt, homeworkSubmittedAt,
    setRequestTime: (value: number) => { requestTime = value; }, peak: () => peak };
};

describe('narrow homework result authority', () => {
  it('requires verified Firebase identity before candidate-source I/O, and holds a missing release gate', async () => {
    const f = fixture();
    const env = { ...f.env, FIREBASE_DB_URL: 'https://example.firebaseio.com', NOTIFICATION_COMMAND_SERVICE_IDENTITY: '',
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: '', HOMEWORK_RESULT_AUTHORITY_QA_RESULT_ID: 'result1', HOMEWORK_RESULT_AUTHORITY_QA_ACTOR: 'student1' };
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({}, { status: 403 }));
    const bridge = createNotificationFirestoreBridge(fetcher as typeof fetch);
    const bearer = `e30.${btoa(JSON.stringify({ sub: 'student1' }))}.signature`;
    const request = (token = bearer) => new Request('https://authority.example/homework-result-authority', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{"resultId":"result1"}' });
    expect((await bridge.fetch(request('invalid'), env)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await bridge.fetch(request(), { ...env, RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF: '' })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await bridge.fetch(request(), env)).status).toBe(403);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]).toEqual({ headers: { Authorization: `Bearer ${bearer}` } });
    expect(f.env.NOTIFICATION_RATE_LIMITER.limit).toHaveBeenCalledOnce();
    expect(f.env.NOTIFICATION_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: 'homework-result-authority:student1' });
    fetcher.mockClear();
    f.env.NOTIFICATION_RATE_LIMITER.limit.mockResolvedValue({ success: false });
    expect((await bridge.fetch(request(), env)).status).toBe(429);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('creates the minimum receipt for either source student or exact assignment teacher; replay still checks current correspondence', async () => {
    for (const actor of ['student1', 'teacher1']) {
      const f = fixture();
      expect(await f.verify(actor)).toBe('created');
      expect(f.database.read).toHaveBeenCalledTimes(26);
      expect(f.peak()).toBe(3);
      const receipt = verifiedProof(f.leaves['result_notification_authority/result1']);
      expect(receipt).toMatchObject({ schemaVersion: 2, studentId: 'student1', ownerTeacherId: 'teacher1', homeworkSubmittedAt: f.homeworkSubmittedAt, submittedAt: f.submittedAt });
      expect(Object.keys(receipt!)).toHaveLength(13);
      expect(f.env.NOTIFICATION_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: `homework-result-authority:${actor}` });
      expect(await f.verify(actor)).toBe('replayed');
      expect(f.readSource).toHaveBeenCalledTimes(6);
      f.documents.homework_assignments.materialId = 'changed';
      await expect(f.verify(actor)).rejects.toThrow('authority_denied');
    }
  });

  it('denies actor/source/recipient/occurrence/target/material/import and canonical mismatches without receipt writes', async () => {
    const changes: ((f: ReturnType<typeof fixture>) => void)[] = [
      f => { f.documents.writing_submissions.studentId = 'victim'; },
      f => { f.documents.writing_submissions.id = 'wrong'; },
      f => { f.documents.homework_submissions.resultId = 'wrong'; },
      f => { f.documents.homework_submissions.studentId = 'victim'; },
      f => { f.documents.homework_submissions.teacherId = 'other'; },
      f => { f.documents.homework_submissions.administrativeImport = { source: 'external-admin-import' }; },
      f => { f.documents.homework_assignments.createdBy = 'other'; },
      f => { f.documents.homework_assignments.target = { type: 'students', studentIds: ['other'] }; },
      f => { f.documents.homework_assignments.target = { type: 'class', classId: 'class1' }; },
      f => { f.documents.homework_assignments.contentRef = { contentKind: 'ielts_writing', contentId: 'wrong' }; },
      f => { f.leaves['test_results/result1/submittedAt'] = 124; },
      f => { f.leaves['test_results/result1/classId'] = 'class1'; },
    ];
    const unauthorized = fixture();
    await expect(unauthorized.verify('other')).rejects.toThrow('authority_denied');
    expect(unauthorized.env.NOTIFICATION_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: 'homework-result-authority:other' });
    for (const change of changes) {
      const f = fixture(); change(f);
      await expect(f.verify()).rejects.toThrow('authority_denied');
      expect(f.database.create).not.toHaveBeenCalled();
    }
  });

  it('holds unconfigured and every pre-cutover source, preserving nanosecond precision', async () => {
    const unconfigured = fixture();
    unconfigured.env.RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF = '';
    await expect(unconfigured.verify()).rejects.toThrow('authority_unavailable');
    expect(unconfigured.readSource).not.toHaveBeenCalled();
    for (const collection of ['writing_submissions', 'homework_assignments', 'homework_submissions']) {
      const f = fixture();
      const read = f.readSource.getMockImplementation()!;
      f.readSource.mockImplementation(async (name, id) => ({ ...await read(name, id),
        createTime: name === collection ? f.env.RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF : '2026-09-30T12:00:00.000000002Z' }));
      await expect(f.verify()).rejects.toThrow('authority_denied');
      expect(f.database.create).not.toHaveBeenCalled();
    }
  });

  it('preserves immutable conflicts and rejects retired v1 receipts', async () => {
    const f = fixture();
    await f.verify();
    f.leaves['result_notification_authority/result1'] = { ...f.leaves['result_notification_authority/result1'] as object, ownerTeacherId: 'other' };
    await expect(f.verify()).rejects.toThrow('authority_conflict');
    expect(verifiedProof({ ...f.leaves['result_notification_authority/result1'] as object, schemaVersion: 1 })).toBeNull();
    expect(f.leaves['result_notification_authority/result1']).toMatchObject({ ownerTeacherId: 'other' });
  });

  it('meters missing/unrelated candidates before their first source GET and denies exhausted actors without a read', async () => {
    const missing = fixture();
    missing.readSource.mockRejectedValueOnce(Error('authority_denied'));
    await expect(missing.verify()).rejects.toThrow('authority_denied');
    expect(missing.env.NOTIFICATION_RATE_LIMITER.limit.mock.invocationCallOrder[0]).toBeLessThan(missing.readSource.mock.invocationCallOrder[0]);
    missing.env.NOTIFICATION_RATE_LIMITER.limit.mockResolvedValue({ success: false });
    await expect(missing.verify()).rejects.toThrow('authority_rate_limited');
    expect(missing.readSource).toHaveBeenCalledOnce();
    expect(missing.database.read).not.toHaveBeenCalled();
    expect(missing.database.create).not.toHaveBeenCalled();
  });

  it('denies forged backdated/future chronology before privileged reads or receipt writes', async () => {
    const changes: ((f: ReturnType<typeof fixture>) => void)[] = [
      f => { f.documents.writing_submissions.submittedAt = Date.parse('2026-09-30T12:00:00Z'); },
      f => { f.documents.writing_submissions.submittedAt = f.submittedAt + 1001; },
      f => { f.documents.homework_submissions.submittedAt = f.submittedAt - 1; },
      f => { f.documents.homework_submissions.submittedAt = f.submittedAt + 1001; },
      f => { f.documents.writing_submissions.submittedAt = f.submittedAt + 300_001; f.setRequestTime(f.submittedAt + 600_000); },
      ...['writing_submissions', 'homework_submissions'].map(collection => (f: ReturnType<typeof fixture>) => {
        const read = f.readSource.getMockImplementation()!;
        f.readSource.mockImplementation(async (name, id) => ({ ...await read(name, id),
          createTime: name === collection ? new Date((collection === 'homework_submissions' ? f.homeworkSubmittedAt : f.submittedAt) + 300_001).toISOString() : '2026-09-30T12:00:00.000000002Z' }));
      }),
    ];
    for (const change of changes) {
      const f = fixture(); change(f);
      await expect(f.verify()).rejects.toThrow('authority_denied');
      expect(f.database.read).not.toHaveBeenCalled();
      expect(f.database.create).not.toHaveBeenCalled();
    }
    const delayedProjection = fixture();
    delayedProjection.setRequestTime(delayedProjection.submittedAt + 7 * 86400000);
    expect(await delayedProjection.verify()).toBe('created');
    expect(await delayedProjection.verify()).toBe('replayed');
  });
});
