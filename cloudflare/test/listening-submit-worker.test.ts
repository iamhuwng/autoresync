import { describe, expect, it, vi } from 'vitest';
import { createListeningSubmitWorkerHandlers, type ListeningSubmitRepository } from '../src/upload-worker/listening-submit.ts';
import { FirebaseRtdbRestClient, type FirebaseRtdbQuery } from '../src/upload-worker/listening-authoring/rtdb.ts';

vi.mock('../src/upload-worker/listening-authoring/rtdb.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/upload-worker/listening-authoring/rtdb.ts')>(),
  getFirebaseServiceAccountAccessToken: async () => 'test-service-token',
}));

const now = 1_800_000_000_000;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function fixture() {
  let currentTime = now;
  const values: Record<string, any> = {
    'users/student-1': { role: 'student', displayName: 'Learner' },
    'users/student-2': { role: 'student', displayName: 'Other learner' },
    'users/teacher-1': { role: 'teacher' },
    'tests/test-1': { versionId: 'version-1', skill: 'Listening', ownerId: 'teacher-1' },
    'listening_authoring/versions/version-1': {
      recordType: 'published-version', testId: 'test-1', versionId: 'version-1', ownerId: 'teacher-1',
      publishedBy: 'teacher-1', publishedAt: now - 1000, archive: { state: 'active' },
      document: { title: 'Pinned listening', type: 'IELTS', skill: 'Listening', duration: 20, isPublic: true,
        metadata: { transcript: 'secret transcript' }, audioSections: [],
        settings: { passingScore: 50 },
        questions: [
          { number: 1, sectionNumber: 1, type: 'completion', question: 'Name', answer: 'alpha', points: 1 },
          { number: 2, sectionNumber: 1, type: 'multiple-select', question: 'Choose two', answer: ['A', 'B'], points: 1 },
        ] },
    },
    'game_sessions/ROOM01': { sessionCode: 'ROOM01', createdByUserId: 'teacher-1', testId: 'test-1',
      status: 'waiting', startTime: null, expiresAt: now + 100000, players: {
        'student-1': { name: 'Learner', answers: { '1': { answer: 'alpha', timestamp: now }, '2': { answer: ['A', 'B'], timestamp: now } } },
      } },
    'homework_test_access/test-1/student-1/hw-1': { contentKind: 'ielts_listening', versionId: 'version-1',
      teacherId: 'teacher-1', assetIds: [], createdAt: now - 1000 },
  };
  const documents: Record<string, any> = {
    'homework_assignments/hw-1': { id: 'hw-1', createdBy: 'teacher-1', createdAt: now - 1000, materialId: 'test-1',
      materialType: 'test', materialSkill: 'listening', archived: false, status: 'active',
      contentRef: { contentKind: 'ielts_listening', contentId: 'test-1', version: 'version-1' },
      target: { type: 'students', studentIds: ['student-1'] },
      scheduling: { availableFrom: now - 10000, dueDate: now + 10000 }, config: {}, stats: { submitted: 0 } },
    'homework_submissions/sub-1': { id: 'sub-1', homeworkId: 'hw-1', studentId: 'student-1', teacherId: 'teacher-1', status: 'in_progress' },
  };
  const repository: ListeningSubmitRepository = {
    read: vi.fn(async (path: string, query?: FirebaseRtdbQuery) => {
      if (path === 'test_results' && query) return clone(Object.fromEntries(Object.entries(values)
        .filter(([key, value]) => key.startsWith('test_results/') && value[query.orderBy] === query.equalTo)
        .map(([key, value]) => [key.slice('test_results/'.length), value])));
      return clone(values[path] ?? null);
    }),
    readWithEtag: vi.fn(async (path: string) => ({ data: clone(values[path] ?? null), etag: JSON.stringify(values[path] ?? null) })),
    createIfUnchanged: vi.fn(async (path: string, value: unknown, etag: string) => {
      if (JSON.stringify(values[path] ?? null) !== etag) return false;
      values[path] = clone(value); return true;
    }),
    update: vi.fn(async updates => {
      for (const [path, value] of Object.entries(updates)) values[path] = clone(value);
    }),
    readHomework: vi.fn(async (path: string) => ({ data: clone(documents[path]), updateTime: JSON.stringify(documents[path]) })),
    readHomeworkAttempts: vi.fn(async (homeworkId: string, studentId: string) => clone(Object.entries(documents)
      .filter(([path, value]) => path.startsWith('homework_submissions/') && value.homeworkId === homeworkId && value.studentId === studentId)
      .map(([, value]) => value))),
    createHomeworkAttempt: vi.fn(async (submission: Record<string, any>, homework: { data: Record<string, any>; updateTime: string }) => {
      const path = `homework_assignments/${submission.homeworkId}`;
      if (documents[`homework_submissions/${submission.id}`] || JSON.stringify(documents[path]) !== homework.updateTime) return false;
      documents[`homework_submissions/${submission.id}`] = clone(submission);
      documents[path].stats.started = Number(documents[path].stats.started ?? 0) + 1;
      return true;
    }),
    completeHomework: vi.fn(async ({ request, result }) => {
      const submission = documents[`homework_submissions/${request.submissionId}`];
      if (submission.status === 'in_progress') {
        Object.assign(submission, { status: 'submitted', resultId: result.resultId, submittedAt: result.submittedAt });
        documents[`homework_assignments/${request.homeworkId}`].stats.submitted++;
      }
    }),
  };
  const handlers = createListeningSubmitWorkerHandlers({ repository: () => repository });
  const env = { readListeningHomeworkDocument: async (path: string) => clone(documents[path] ?? null) };
  const call = (data: unknown, uid = 'student-1', route: 'submit' | 'livePin' | 'homeworkStart' = 'submit') => handlers[route]({
    uid, env, now: () => currentTime, request: new Request('https://worker.example/listening-delivery/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' }, body: JSON.stringify(data),
    }),
  });
  const solo = { mode: 'self_study', testId: 'test-1', versionId: 'version-1', operationId: 'attempt-1',
    answers: { '1': 'alpha', '2': ['A', 'B'] } };
  return { values, documents, repository, call, solo, env, setNow: (value: number) => { currentTime = value; } };
}

function courseFixture() {
  const f = fixture();
  f.values['courses/course-1'] = { id: 'course-1', ownerId: 'teacher-1', name: 'Course' };
  f.values['modules/module-1'] = { courseId: 'course-1' };
  f.values.course_enrollments = { enrollment: { studentId: 'student-1', courseId: 'course-1', status: 'active', expiresAt: now + 1000 } };
  f.values.course_materials = { link: { courseId: 'course-1', moduleId: 'module-1', materialId: 'test-1' } };
  return { ...f, request: { ...f.solo, mode: 'course_material', courseId: 'course-1', moduleId: 'module-1' } };
}

describe('Listening trusted submission', () => {
  it('pins the latest published text when starting, then preserves that pin across publication and submission', async () => {
    const f = fixture();
    delete f.documents['homework_submissions/sub-1'];
    f.values['tests/test-1'].versionId = 'version-2';
    f.values['listening_authoring/versions/version-2'] = clone(f.values['listening_authoring/versions/version-1']);
    f.values['listening_authoring/versions/version-2'].versionId = 'version-2';
    f.values['listening_authoring/versions/version-2'].document.questions[0].answer = 'new text answer';
    const request = { homeworkId: 'hw-1', operationId: 'begin-1' };
    const first = await f.call(request, 'student-1', 'homeworkStart');
    const submission = (first.body as any).submission;
    expect(submission).toMatchObject({ studentId: 'student-1', teacherId: 'teacher-1', startedAt: now,
      status: 'in_progress', listeningVersionId: 'version-2', attemptNumber: 1 });
    f.values['tests/test-1'].versionId = 'version-3';
    expect((await f.call({ ...request, operationId: 'begin-2' }, 'student-1', 'homeworkStart')).body).toEqual(first.body);
    expect(f.repository.createHomeworkAttempt).toHaveBeenCalledTimes(1);
    expect(f.documents['homework_assignments/hw-1'].stats.started).toBe(1);
    const submitted = await f.call({ ...f.solo, mode: 'homework', homeworkId: 'hw-1', submissionId: submission.id,
      versionId: 'version-2', answers: { '1': 'new text answer', '2': ['A', 'B'] } });
    expect(submitted.body).toMatchObject({ percentage: 100 });
    expect(f.values[`result_notification_authority/${(submitted.body as any).resultId}`]).toMatchObject({ versionId: 'version-2' });
  });

  it('keeps previously started attempts on the assignment text when no trusted pin exists', async () => {
    const f = fixture();
    f.values['tests/test-1'].versionId = 'version-2';
    expect((await f.call({ homeworkId: 'hw-1', operationId: 'begin-1' }, 'student-1', 'homeworkStart')).body)
      .toEqual({ submission: f.documents['homework_submissions/sub-1'] });
    expect(f.repository.createHomeworkAttempt).not.toHaveBeenCalled();
  });

  it.each(['limit', 'nullified', 'exempt', 'target', 'teacher', 'browser-version'])(
    'rejects an unauthorized new homework attempt: %s', async failure => {
      const f = fixture();
      delete f.documents['homework_submissions/sub-1'];
      const homework = f.documents['homework_assignments/hw-1'];
      const request: any = { homeworkId: 'hw-1', operationId: 'begin-1' };
      if (failure === 'limit' || failure === 'nullified') f.documents['homework_submissions/prior'] = {
        homeworkId: 'hw-1', studentId: 'student-1', status: 'submitted', attemptsNullified: failure === 'nullified',
      };
      if (failure === 'limit') homework.config.maxAttempts = 1;
      if (failure === 'exempt') homework.studentOverrides = { 'student-1': { exempted: true } };
      if (failure === 'target') homework.target.studentIds = ['student-2'];
      if (failure === 'browser-version') request.versionId = 'version-1';
      const response = await f.call(request, failure === 'teacher' ? 'teacher-1' : 'student-1', 'homeworkStart');
      expect(response.init?.status).toBeGreaterThanOrEqual(400);
      expect(f.repository.createHomeworkAttempt).not.toHaveBeenCalled();
    },
  );

  it('grades typed answers using the pinned key and keeps keys out of the response', async () => {
    const f = fixture();
    const response = await f.call(f.solo);
    expect(response.body).toMatchObject({ correctAnswers: 2, totalQuestions: 2, percentage: 100, totalScore: 2,
      questionResults: { '1': true, '2': true } });
    expect(JSON.stringify(response.body)).not.toContain('alpha');
    const resultId = (response.body as any).resultId;
    expect(f.values[`test_results/${resultId}`]).toMatchObject({ deliveryEngine: 'listening', materialVersionId: 'version-1',
      studentId: 'student-1', questionResults: [{ correctAnswer: 'alpha' }, { correctAnswer: ['A', 'B'] }] });
    expect(f.values[`test_results_by_student/student-1/${resultId}`]).toMatchObject({ resultId, percentage: 100 });
  });

  it.each([
    { totalScore: 999 }, { studentId: 'student-2' }, { answers: { '99': 'alpha' } }, { answers: { '1': 123 } },
    { versionId: 'missing' }, { mode: 'homework', homeworkId: 'hw-1', submissionId: 'other-submission' },
  ])('rejects forged score, identity, answer or scope %j', async patch => {
    const f = fixture();
    const response = await f.call({ ...f.solo, ...patch });
    expect(response.init?.status).toBeGreaterThanOrEqual(400);
    expect(f.repository.createIfUnchanged).not.toHaveBeenCalled();
  });

  it('does not overwrite a result and repairs missing side effects on retry', async () => {
    const f = fixture();
    vi.mocked(f.repository.update).mockRejectedValueOnce(new Error('unavailable'));
    const first = await f.call(f.solo);
    expect(first.init?.status).toBe(503);
    const saved = Object.entries(f.values).find(([path]) => path.startsWith('test_results/'))![1];
    saved.listeningContext = Object.fromEntries(Object.entries(saved.listeningContext).reverse());
    const retry = await f.call({ ...f.solo, answers: { '1': 'wrong' } });
    expect(retry.body).toMatchObject({ percentage: 100, correctAnswers: 2 });
    expect(f.repository.createIfUnchanged).toHaveBeenCalledTimes(1);
    expect(f.repository.update).toHaveBeenCalledTimes(2);
  });

  it('uses assignment ownership and pinned private content, completing homework exactly once', async () => {
    const f = fixture();
    f.values['listening_authoring/versions/version-1'].document.isPublic = false;
    f.values['tests/test-1'].versionId = 'version-2';
    const request = { ...f.solo, mode: 'homework', homeworkId: 'hw-1', submissionId: 'sub-1' };
    const first = await f.call(request);
    expect(first.body).toMatchObject({ percentage: 100 });
    const resultId = (first.body as any).resultId;
    expect(f.values[`teacher_result_keys/teacher-1/${resultId}`]).toBe(true);
    expect(f.values[`result_notification_authority/${resultId}`]).toMatchObject({ schemaVersion: 4, ownerTeacherId: 'teacher-1', homeworkSubmissionId: 'sub-1' });
    const second = await f.call(request);
    expect(second.body).toEqual(first.body);
    expect(f.documents['homework_assignments/hw-1'].stats.submitted).toBe(1);
  });

  it('repairs incomplete homework after its deadline using the original saved submission time', async () => {
    const f = fixture();
    vi.mocked(f.repository.completeHomework).mockRejectedValueOnce(new Error('unavailable'));
    const request = { ...f.solo, mode: 'homework', homeworkId: 'hw-1', submissionId: 'sub-1' };
    expect((await f.call(request)).init?.status).toBe(503);
    f.setNow(now + 20000);
    const retry = await f.call({ ...request, answers: { '1': 'changed' } });
    expect(retry.body).toMatchObject({ percentage: 100, correctAnswers: 2 });
    expect(f.documents['homework_submissions/sub-1']).toMatchObject({ status: 'submitted', submittedAt: now });
    expect(f.documents['homework_assignments/hw-1'].stats.submitted).toBe(1);
  });

  it('conditionally commits homework and stats together, retrying contention without double counting', async () => {
    const f = fixture();
    const restores = [
      vi.spyOn(FirebaseRtdbRestClient.prototype, 'readWithEtag').mockImplementation(f.repository.readWithEtag),
      vi.spyOn(FirebaseRtdbRestClient.prototype, 'writeIfMatch').mockImplementation(f.repository.createIfUnchanged),
      vi.spyOn(FirebaseRtdbRestClient.prototype, 'patchAdminMultiLocation').mockImplementation(f.repository.update),
    ];
    const encode = (value: any): any => typeof value === 'string' ? { stringValue: value }
      : typeof value === 'number' ? { integerValue: String(value) } : typeof value === 'boolean' ? { booleanValue: value }
        : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
          : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([field, item]) => [field, encode(item)])) } };
    const fields = (value: any) => encode(value).mapValue.fields;
    let revision = 1;
    const commits: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ Authorization: 'Bearer test-service-token' });
      if (url.endsWith('documents:commit')) {
        const commit = JSON.parse(init.body as string);
        commits.push(commit);
        if (commits.length === 1) {
          f.documents['homework_assignments/hw-1'].stats.submitted = 3;
          revision++;
          return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
        }
        expect(commit.writes).toHaveLength(2);
        for (const write of commit.writes) expect(write.currentDocument.updateTime).toBe(`revision-${revision}`);
        expect(commit.writes[1].updateMask.fieldPaths).toEqual(['stats']);
        expect(commit.writes[1].update.fields.stats.mapValue.fields.submitted.integerValue).toBe('4');
        Object.assign(f.documents['homework_submissions/sub-1'], { status: 'submitted', resultId: commit.writes[0].update.fields.resultId.stringValue });
        f.documents['homework_assignments/hw-1'].stats.submitted = 4;
        return Response.json({});
      }
      const path = url.split('/documents/')[1];
      expect(f.documents[path]).toBeDefined();
      return Response.json({ fields: fields(f.documents[path]), updateTime: `revision-${revision}` });
    }));
    try {
      const handlers = createListeningSubmitWorkerHandlers();
      const request = { ...f.solo, mode: 'homework', homeworkId: 'hw-1', submissionId: 'sub-1' };
      const call = () => handlers.submit({ uid: 'student-1', now: () => now,
        env: { ...f.env, FIREBASE_PROJECT_ID: 'local-test', readDatabaseValue: path => f.repository.read(path) },
        request: new Request('https://worker.example/listening-delivery/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
        }),
      });
      vi.mocked(f.repository.update).mockRejectedValueOnce(new Error('projection unavailable'));
      expect((await call()).init?.status).toBe(503);
      expect((await call()).body).toMatchObject({ percentage: 100 });
      expect(commits).toHaveLength(2);
      expect(f.documents['homework_assignments/hw-1'].stats.submitted).toBe(4);
    } finally {
      restores.forEach(spy => spy.mockRestore());
      vi.unstubAllGlobals();
    }
  });

  it('atomically starts a pinned homework attempt and counts it once after contention and retry', async () => {
    const f = fixture();
    delete f.documents['homework_submissions/sub-1'];
    const encode = (value: any): any => typeof value === 'string' ? { stringValue: value }
      : typeof value === 'number' ? { integerValue: String(value) } : typeof value === 'boolean' ? { booleanValue: value }
        : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
          : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([field, item]) => [field, encode(item)])) } };
    const fields = (value: any) => encode(value).mapValue.fields;
    let revision = 1;
    const commits: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ Authorization: 'Bearer test-service-token' });
      if (url.endsWith('documents:runQuery')) {
        const query = JSON.parse(init.body as string).structuredQuery;
        expect(query.where.compositeFilter.filters).toHaveLength(2);
        return Response.json(Object.entries(f.documents).filter(([path]) => path.startsWith('homework_submissions/'))
          .map(([, value]) => ({ document: { fields: fields(value) } })));
      }
      if (url.endsWith('documents:commit')) {
        const commit = JSON.parse(init.body as string);
        commits.push(commit);
        if (commits.length === 1) {
          revision++;
          f.documents['homework_assignments/hw-1'].stats.started = 2;
          return Response.json({ error: { status: 'FAILED_PRECONDITION' } }, { status: 409 });
        }
        expect(commit.writes[0].currentDocument).toEqual({ exists: false });
        expect(commit.writes[1].currentDocument).toEqual({ updateTime: `revision-${revision}` });
        expect(commit.writes[0].update.fields.listeningVersionId).toEqual({ stringValue: 'version-1' });
        expect(commit.writes[1].update.fields.stats.mapValue.fields.started.integerValue).toBe('3');
        const submission = Object.fromEntries(Object.entries(commit.writes[0].update.fields).map(([field, value]: [string, any]) =>
          [field, value.stringValue ?? value.booleanValue ?? Number(value.integerValue)]));
        f.documents[`homework_submissions/${submission.id}`] = submission;
        f.documents['homework_assignments/hw-1'].stats.started = 3;
        return Response.json({});
      }
      const path = url.split('/documents/')[1];
      return Response.json({ fields: fields(f.documents[path]), updateTime: `revision-${revision}` });
    }));
    try {
      const handlers = createListeningSubmitWorkerHandlers();
      const call = () => handlers.homeworkStart({ uid: 'student-1', now: () => now,
        env: { ...f.env, FIREBASE_PROJECT_ID: 'local-test', readDatabaseValue: path => f.repository.read(path) },
        request: new Request('https://worker.example/listening-delivery/homework-start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ homeworkId: 'hw-1', operationId: 'begin-1' }),
        }),
      });
      const first = await call();
      expect(first.body).toMatchObject({ submission: { listeningVersionId: 'version-1', startedAt: now } });
      expect((await call()).body).toEqual(first.body);
      expect(commits).toHaveLength(2);
      expect(f.documents['homework_assignments/hw-1'].stats.started).toBe(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each(['expired', 'exempt', 'other-student', 'private', 'restore'])( 'denies unavailable %s access', async failure => {
    const f = fixture();
    let request: any = { ...f.solo, mode: 'homework', homeworkId: 'hw-1', submissionId: 'sub-1' };
    if (failure === 'expired') f.documents['homework_assignments/hw-1'].scheduling.dueDate = now - 1;
    if (failure === 'exempt') f.documents['homework_assignments/hw-1'].studentOverrides = { 'student-1': { exempted: true } };
    if (failure === 'other-student') f.documents['homework_submissions/sub-1'].studentId = 'student-2';
    if (failure === 'private') { request = f.solo; f.values['listening_authoring/versions/version-1'].document.isPublic = false; }
    if (failure === 'restore') f.values['system_flags/restore_in_progress'] = { active: true };
    const response = await f.call(request);
    expect(response.init?.status).toBeGreaterThanOrEqual(400);
    expect(f.repository.createIfUnchanged).not.toHaveBeenCalled();
  });

  it('requires current course enrollment and exact material membership', async () => {
    const f = courseFixture();
    expect((await f.call(f.request)).body).toMatchObject({ percentage: 100 });
    f.values.course_enrollments.enrollment.status = 'expired';
    expect((await f.call({ ...f.request, operationId: 'attempt-2' })).init?.status).toBe(403);
  });

  it('grades retained course text after a later edit while requiring the same owner and current enrollment', async () => {
    const f = courseFixture();
    f.values['tests/test-1'].versionId = 'later-version';
    expect((await f.call(f.request)).body).toMatchObject({ percentage: 100 });
    f.values['tests/test-1'].ownerId = 'unrelated-teacher';
    expect((await f.call(f.request)).init?.status).toBe(403);
  });

  it('rejects a new course attempt at its inherited limit but replays the saved operation', async () => {
    const f = courseFixture();
    f.values['courses/course-1'].practiceSettings = { maxAttempts: 2 };
    f.values['courses/course-1/modules/module-1/practiceSettings'] = { maxAttempts: 1 };
    f.values['test_results/other-student'] = { studentId: 'student-2', testId: 'test-1' };
    f.values['test_results/other-test'] = { studentId: 'student-1', testId: 'test-2' };
    const first = await f.call(f.request);
    expect(first.body).toMatchObject({ percentage: 100 });
    const resultId = (first.body as any).resultId;
    delete f.values[`test_results_by_student/student-1/${resultId}`];
    expect((await f.call({ ...f.request, answers: { '1': 'changed' } })).body).toEqual(first.body);
    expect((await f.call({ ...f.request, operationId: 'attempt-2' })).body).toMatchObject({ code: 'listening_max_attempts_reached' });
    expect(f.repository.read).toHaveBeenCalledWith('test_results', { orderBy: 'studentId', equalTo: 'student-1' });
    expect(f.repository.createIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it.each([['default', false], [40, true], [null, false]] as const)(
    'resolves material passing score %s over module/course settings and preserves explicit unlimited attempts', async (score, completed) => {
      const f = courseFixture();
      f.values['courses/course-1'].practiceSettings = { maxAttempts: 1, minPassingScore: 30 };
      f.values['courses/course-1/modules/module-1/practiceSettings'] = { maxAttempts: 1, minPassingScore: 80 };
      f.values['courses/course-1/modules/module-1/materials/test-1/practiceSettings'] = { maxAttempts: null, minPassingScore: score };
      f.values['test_results/prior'] = { studentId: 'student-1', testId: 'test-1' };
      expect((await f.call({ ...f.request, answers: { '1': 'alpha' } })).body).toMatchObject({ percentage: 50 });
      expect(!!f.values['course_progress/student-1/course-1/materials/test-1']).toBe(completed);
    },
  );

  it('keeps a live player unsubmitted when index persistence fails and repairs the same result on retry', async () => {
    const f = fixture();
    await f.call({ sessionCode: 'ROOM01', testId: 'test-1', versionId: 'version-1', operationId: 'start-1' }, 'teacher-1', 'livePin');
    f.values['game_sessions/ROOM01'].status = 'in-progress';
    f.values['game_sessions/ROOM01'].startTime = now;
    vi.mocked(f.repository.update).mockRejectedValueOnce(new Error('index unavailable'));
    const request = { ...f.solo, mode: 'live', sessionCode: 'ROOM01', studentId: 'student-1' };
    expect((await f.call(request, 'teacher-1')).init?.status).toBe(503);
    expect(f.values['game_sessions/ROOM01'].players['student-1'].isSubmitted).toBeUndefined();
    const firstResult = Object.entries(f.values).find(([path]) => path.startsWith('test_results/'))![1];
    expect((await f.call(request, 'teacher-1')).body).toMatchObject({ resultId: firstResult.resultId, percentage: 100 });
    expect(f.values['test_results_by_student/student-1/' + firstResult.resultId]).toMatchObject({ percentage: 100 });
    expect(f.values['game_sessions/ROOM01'].players['student-1']).toMatchObject({ isSubmitted: true, resultId: firstResult.resultId });
  });

  it.each(['test-1', 'ROOM01'])('links a validated class assignment for %s using the saved result on retry', async testId => {
    const f = fixture();
    f.values['game_sessions/ROOM01'].classId = 'class-1';
    f.values['classes/class-1'] = { createdBy: 'teacher-1', status: 'active', assignments: { 'assignment-1': { testId } },
      students: { 'student-1': { status: 'active', assignments: { 'assignment-1': { status: 'graded', attemptNumber: 2, startedAt: now - 1000 } } } } };
    await f.call({ sessionCode: 'ROOM01', testId: 'test-1', versionId: 'version-1', operationId: 'start-1' }, 'teacher-1', 'livePin');
    f.values['game_sessions/ROOM01'].status = 'in-progress';
    f.values['game_sessions/ROOM01'].startTime = now - 1000;
    vi.mocked(f.repository.update).mockRejectedValueOnce(new Error('projection unavailable'));
    const request = { ...f.solo, mode: 'live', sessionCode: 'ROOM01', assignmentId: 'assignment-1' };
    expect((await f.call(request)).init?.status).toBe(503);
    const retry = await f.call({ ...request, assignmentId: undefined, answers: { '1': 'changed' } });
    const resultId = (retry.body as any).resultId;
    expect(retry.body).toMatchObject({ percentage: 100 });
    expect(f.values[`test_results/${resultId}`]).toMatchObject({
      context: { assignment: { assignmentId: 'assignment-1' } }, visibility: { assignmentId: 'assignment-1' },
    });
    expect(f.repository.update).toHaveBeenLastCalledWith(expect.objectContaining({
      'classes/class-1/students/student-1/assignments/assignment-1/resultId': resultId,
      'classes/class-1/students/student-1/assignments/assignment-1/status': 'graded',
      'classes/class-1/students/student-1/assignments/assignment-1/attemptNumber': 2,
      'classes/class-1/students/student-1/assignments/assignment-1/score': 2,
      'classes/class-1/students/student-1/assignments/assignment-1/timeSpent': 1,
    }));
    expect(f.repository.createIfUnchanged).toHaveBeenCalledTimes(4);
  });

  it.each(['other-test', 'removed-student', 'other-teacher', 'other-class'])(
    'rejects a live assignment hint for %s before saving a result', async failure => {
      const f = fixture();
      f.values['game_sessions/ROOM01'].classId = 'class-1';
      f.values['classes/class-1'] = { createdBy: 'teacher-1', status: 'active', assignments: { 'assignment-1': { testId: 'test-1' } },
        students: { 'student-1': { status: 'active' } } };
      if (failure === 'other-test') f.values['classes/class-1'].assignments['assignment-1'].testId = 'test-2';
      if (failure === 'removed-student') f.values['classes/class-1'].students['student-1'].status = 'removed';
      if (failure === 'other-teacher') f.values['classes/class-1'].createdBy = 'teacher-2';
      if (failure === 'other-class') f.values['game_sessions/ROOM01'].classId = 'class-2';
      await f.call({ sessionCode: 'ROOM01', testId: 'test-1', versionId: 'version-1', operationId: 'start-1' }, 'teacher-1', 'livePin');
      f.values['game_sessions/ROOM01'].status = 'in-progress';
      const writes = vi.mocked(f.repository.createIfUnchanged).mock.calls.length;
      expect((await f.call({ ...f.solo, mode: 'live', sessionCode: 'ROOM01', assignmentId: 'assignment-1' })).init?.status).toBe(403);
      expect(f.repository.createIfUnchanged).toHaveBeenCalledTimes(writes);
    },
  );

  it('prepares a protected safe live pin, and teacher End grades stored answers rather than supplied answers', async () => {
    const f = fixture();
    const pinRequest = { sessionCode: 'ROOM01', testId: 'test-1', versionId: 'version-1', operationId: 'start-1' };
    expect((await f.call(pinRequest, 'student-1', 'livePin')).init?.status).toBe(403);
    const pin = await f.call(pinRequest, 'teacher-1', 'livePin');
    expect(pin.body).toMatchObject({ testId: 'test-1', versionId: 'version-1', startTime: now });
    expect(f.values['session_test_payloads/ROOM01'].testData.questions[0]).not.toHaveProperty('answer');
    expect(f.values['session_test_payloads/ROOM01'].testData.metadata).not.toHaveProperty('transcript');
    const session = f.values['game_sessions/ROOM01']; session.status = 'in-progress'; session.startTime = now;
    const request = { ...f.solo, mode: 'live', sessionCode: 'ROOM01', studentId: 'student-1', answers: { '1': 'forged' } };
    const result = await f.call(request, 'teacher-1');
    expect(result.body).toMatchObject({ correctAnswers: 2, percentage: 100 });
    expect(f.values['game_sessions/ROOM01'].players['student-1']).toMatchObject({
      resultId: (result.body as any).resultId, latestResultId: (result.body as any).resultId,
      answers: { '1': { answer: 'alpha' }, '2': { answer: ['A', 'B'] } },
    });
    expect((await f.call(request, 'student-2')).init?.status).toBe(403);
    f.values['game_sessions/ROOM01'].status = 'completed';
    expect((await f.call(request, 'teacher-1')).init?.status).toBe(403);
  });

  it('publishes live payloads only after winning the session pin, and repairs a failed projection', async () => {
    const f = fixture();
    const request = { sessionCode: 'ROOM01', testId: 'test-1', versionId: 'version-1', operationId: 'start-1' };
    const original = vi.mocked(f.repository.createIfUnchanged).getMockImplementation()!;
    vi.mocked(f.repository.createIfUnchanged).mockResolvedValueOnce(false).mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('projection unavailable'));
    expect((await f.call(request, 'teacher-1', 'livePin')).init?.status).toBe(503);
    expect(f.repository.createIfUnchanged).toHaveBeenCalledTimes(3);
    const pinned = clone(f.values['game_sessions/ROOM01'].listeningTestPin);
    expect((await f.call(request, 'teacher-1', 'livePin')).body).toEqual(pinned);
    expect(f.repository.createIfUnchanged).toHaveBeenCalledTimes(4);
    expect(f.values['session_test_payloads/ROOM01'].testData.versionId).toBe('version-1');
    expect(f.values['student_safe_tests/test-1']).toBeUndefined();
  });

  it('cannot write a late completion into a session whose pin changed during submission', async () => {
    const f = fixture();
    await f.call({ sessionCode: 'ROOM01', testId: 'test-1', versionId: 'version-1', operationId: 'start-1' }, 'teacher-1', 'livePin');
    f.values['game_sessions/ROOM01'].status = 'in-progress';
    f.values['game_sessions/ROOM01'].startTime = now;
    const create = f.repository.createIfUnchanged;
    const original = vi.mocked(create).getMockImplementation()!;
    vi.mocked(create).mockImplementation(async (path, value, etag) => {
      if (path === 'game_sessions/ROOM01') {
        f.values[path].listeningTestPin.runId = 'replacement-run';
        return false;
      }
      return original(path, value, etag);
    });
    expect((await f.call({ ...f.solo, mode: 'live', sessionCode: 'ROOM01' })).init?.status).toBe(409);
    expect(f.values['game_sessions/ROOM01'].players['student-1'].isSubmitted).toBeUndefined();
  });

  it('does not repair an old session payload after its pin has changed', async () => {
    const f = fixture();
    const original = vi.mocked(f.repository.readWithEtag).getMockImplementation()!;
    vi.mocked(f.repository.readWithEtag).mockImplementation(async path => {
      const snapshot = await original(path);
      if (path === 'session_test_payloads/ROOM01') f.values['game_sessions/ROOM01'].listeningTestPin.runId = 'replacement-run';
      return snapshot;
    });
    expect((await f.call({ sessionCode: 'ROOM01', testId: 'test-1', versionId: 'version-1', operationId: 'start-1' }, 'teacher-1', 'livePin')).init?.status).toBe(409);
    expect(f.values['session_test_payloads/ROOM01']).toBeUndefined();
  });
});
