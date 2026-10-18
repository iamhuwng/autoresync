import { describe, expect, it, vi } from 'vitest';
import { createNotificationFirestoreBridge } from '../notification-firestore-bridge.ts';

vi.mock('jose', () => ({
  importPKCS8: async () => ({}),
  SignJWT: class {
    setProtectedHeader() { return this; }
    setIssuer() { return this; }
    setSubject() { return this; }
    setAudience() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    async sign() { return 'assertion'; }
  },
}));
vi.mock('../course-enrollment-approval-route.ts', () => ({
  approveCourseEnrollmentRequest: async () => 'transitioned',
}));
vi.mock('../src/upload-worker/firebase-verification.js', () => ({
  createFirebaseVerifier: () => ({
    verifyAuthorizationHeader: async (authorization: string) => ({ valid: true, uid: authorization.slice(7) }),
  }),
}));

const eventId = 'writing-solo1-submitted-student';
const firestoreField = (value: any): Record<string, unknown> => typeof value === 'string' ? { stringValue: value }
  : typeof value === 'number' ? { integerValue: String(value) }
    : typeof value === 'boolean' ? { booleanValue: value }
      : Array.isArray(value) ? { arrayValue: { values: value.map(firestoreField) } }
        : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreField(child)])) } };
const doc = (fields: Record<string, unknown>) => ({
  fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreField(value)])),
});
const proof = doc({ eventId, kind: 'writing-submitted-student', authorityRecordId: 'solo1', occurrenceId: eventId, actorUid: 'student1', occurredAt: 123 });
const source = doc({ id: 'solo1', studentId: 'student1', submittedAt: 123, context: { type: 'solo-practice' } });
const resultLeaf = (url: string): Response | undefined => {
  const values: Record<string, string | number> = {
    'test_results/solo1/resultId': 'solo1', 'test_results/solo1/studentId': 'student1',
    'test_results/solo1/submittedAt': 123, 'test_results/solo1/testSkill': 'writing',
    'test_results/solo1/writingData/submissionId': 'solo1',
    'test_results_by_student/student1/solo1/resultId': 'solo1',
    'test_results_by_student/student1/solo1/studentId': 'student1',
    'test_results_by_student/student1/solo1/submittedAt': 123,
  };
  const path = new URL(url).pathname.slice(1).replace(/\.json$/u, '');
  return Object.hasOwn(values, path) ? Response.json(values[path]) : undefined;
};
const env = () => ({
  FIREBASE_PROJECT_ID: 'project1', FIREBASE_DB_URL: 'https://project1.firebaseio.com',
  NOTIFICATION_COMMAND_SERVICE_IDENTITY: 'sa@example.test',
  NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'sa@example.test', private_key: 'fake' }),
  NOTIFICATION_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  NOTIFICATION_BRIDGE_QA_ACTOR: 'student1',
  NOTIFICATION_BRIDGE_QA_EVENT_ID: eventId,
});
const request = (kind = 'writing-submitted-student', id = eventId) => new Request('https://bridge.example/events', {
  method: 'POST', headers: { Authorization: 'Bearer student-token', 'Content-Type': 'application/json' },
  body: JSON.stringify({ kind, eventId: id }),
});

describe('isolated Firestore notification bridge', () => {
  it('activates fresh ordinary Homework events only under the cutoff and source-bound actor/recipient proofs', async () => {
    const cutoff = '2026-10-02T02:22:09.862Z';
    const fresh = new Date(Date.parse(cutoff) + 60_000).toISOString();
    const occurredAt = Date.now() - 1_000;
    const studentId = 'student1';
    const teacherId = 'teacher1';
    const homeworkId = 'homework1';
    const definitions = [
      { kind: 'thcs-homework-assigned', eventId: homeworkId, actor: teacherId },
      { kind: 'homework-submitted', eventId: 'submission1', actor: studentId },
      { kind: 'homework-reminder', eventId: 'reminder1', actor: teacherId },
      { kind: 'homework-reset', eventId: 'reset1', actor: teacherId },
    ] as const;
    const documents = new Map<string, Record<string, unknown>>();
    const put = (collection: string, id: string, fields: Record<string, unknown>) =>
      documents.set(`${collection}/${id}`, { ...doc(fields), createTime: fresh,
        name: `projects/project1/databases/(default)/documents/${collection}/${id}` });
    for (const item of definitions) {
      const submitted = item.kind === 'homework-submitted';
      const eventProof = { eventId: item.eventId, kind: item.kind, actorUid: item.actor,
        homeworkId, occurredAt, ...(submitted ? { studentId, resultId: 'result1' } : {}) };
      if (item.kind === 'thcs-homework-assigned' || submitted) put('homework_notification_proofs', item.eventId, eventProof);
      if (submitted) put('homework_submissions', item.eventId, {
        id: item.eventId, studentId, teacherId, homeworkId, resultId: 'result1', submittedAt: occurredAt, status: 'submitted',
      });
      if (item.kind === 'homework-reminder') put('homework_manual_reminder_intents', item.eventId, {
        eventId: item.eventId, actorUid: teacherId, homeworkId, studentId, occurredAt,
      });
      if (item.kind === 'homework-reset') put('homework_reset_notification_intents', item.eventId, {
        eventId: item.eventId, actorUid: teacherId, homeworkId, studentId, occurredAt,
        sourceSubmissionId: 'removed1', resultId: 'removedResult1',
      });
      put('homework_assignments', homeworkId, {
        id: homeworkId, createdBy: teacherId, createdAt: occurredAt, materialId: 'test1',
        materialType: 'thcs-test', target: { type: 'students', studentIds: [studentId] },
      });
    }
    const values: Record<string, unknown> = {
      'users/teacher1/role': 'teacher', 'users/student1/role': 'student', 'system_flags/restore_in_progress': null,
      'users/otherStudent/role': 'student',
      'test_results/result1/resultId': 'result1', 'test_results/result1/studentId': studentId,
      'test_results/result1/context/type': 'homework', 'test_results/result1/context/source/id': homeworkId,
      'test_results/result1/testId': 'test1', 'test_results/result1/submittedAt': occurredAt - 700,
      'test_results/result1/testType': 'THCS-THPT', 'test_results/result1/testSkill': 'Mixed',
      'test_results/result1/isGuest': false, 'test_results/result1/createdAt': occurredAt - 500,
      'test_results/result1/sessionCode': 'homework_practice_submission1',
      'test_results/result1/context/source/type': 'homework',
      'test_results/result1/context/source/submissionId': 'submission1',
      'test_results/result1/context/assignment/homeworkId': homeworkId,
      'test_results/result1/thcsData': { scaledScore: true },
    };
    const calls: string[] = [];
    const writes: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      const parsed = new URL(url);
      if (parsed.hostname === 'firestore.googleapis.com') {
        const key = parsed.pathname.split('/documents/')[1];
        if (key === 'homework_submissions/removed1') return Response.json({}, { status: 404 });
        const value = documents.get(key);
        return value ? Response.json(value) : Response.json({}, { status: 404 });
      }
      if (parsed.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'service-token', expires_in: 3600 });
      if (parsed.hostname === 'project1.firebaseio.com') {
        const path = decodeURIComponent(parsed.pathname.slice(1).replace(/\.json$/u, ''));
        if (init?.method === 'PUT') {
          writes.push(path);
          if (Object.hasOwn(values, path)) return Response.json({}, { status: 412 });
          values[path] = JSON.parse(String(init.body));
          return Response.json({});
        }
        if (Object.hasOwn(values, path)) return Response.json(values[path]);
        return Response.json(null);
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;
    const bindings = { ...env(), NOTIFICATION_BRIDGE_QA_EVENT_ID: 'different-qa-event',
      NOTIFICATION_BRIDGE_QA_ACTOR: 'different-qa-actor', HOMEWORK_NOTIFICATION_RULES_CUTOFF: cutoff };
    const send = (kind: string, eventId: string, actor: string, student = false, recipientId = studentId) =>
      new Request('https://bridge.example/events', { method: 'POST', headers: {
        Authorization: `Bearer ${actor}`, 'Content-Type': 'application/json',
      }, body: JSON.stringify(student ? { kind, eventId, studentId: recipientId } : { kind, eventId }) });
    const bridge = createNotificationFirestoreBridge(fetcher);
    for (const item of definitions) {
      const response = await bridge.fetch(send(item.kind, item.eventId, item.actor, item.kind === 'thcs-homework-assigned'), bindings);
      expect(await response.json(), item.kind).toEqual({ status: 'created' });
      expect(response.status, item.kind).toBe(200);
    }
    expect(writes).toHaveLength(5);
    expect(writes.slice(1, 3)).toEqual(['result_notification_authority/result1',
      'notifications/teacher1/ordinary_homework_submitted_submission1_teacher1']);
    expect(values['result_notification_authority/result1']).toMatchObject({ schemaVersion: 3,
      ownerTeacherId: teacherId, homeworkSubmissionId: 'submission1', sourceRulesCutoff: cutoff });
    expect(writes.some(path => path.includes('notifications/teacher1/'))).toBe(true);
    expect(writes.some(path => path.includes('notifications/student1/'))).toBe(true);
    expect(bindings.NOTIFICATION_RATE_LIMITER.limit).toHaveBeenCalledTimes(4);

    const beforeInvalid = calls.length;
    for (const invalid of [undefined, 'not-a-cutoff']) {
      const response = await bridge.fetch(send('homework-reminder', 'reminder1', teacherId), {
        ...bindings, HOMEWORK_NOTIFICATION_RULES_CUTOFF: invalid,
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: 'homework_unqualified' });
    }
    expect(calls).toHaveLength(beforeInvalid);

    const assignedProofKey = `homework_notification_proofs/${homeworkId}`;
    const assignedProof = documents.get(assignedProofKey)!;
    documents.set(assignedProofKey, { ...assignedProof, createTime: cutoff });
    let denied = await bridge.fetch(send('thcs-homework-assigned', homeworkId, teacherId, true), bindings);
    expect(denied.status).toBe(403);
    expect(writes).toHaveLength(5);
    documents.set(assignedProofKey, assignedProof);
    documents.set(assignedProofKey, { ...assignedProof, fields: doc({ eventId: homeworkId, kind: 'thcs-homework-assigned',
      actorUid: teacherId, homeworkId: 'otherHomework', occurredAt }).fields });
    denied = await bridge.fetch(send('thcs-homework-assigned', homeworkId, teacherId, true), bindings);
    expect(denied.status).toBe(403);
    expect(writes).toHaveLength(5);
    documents.set(assignedProofKey, assignedProof);
    denied = await bridge.fetch(send('thcs-homework-assigned', homeworkId, teacherId, true, 'otherStudent'), bindings);
    expect(denied.status).toBe(403);
    expect(writes).toHaveLength(5);

    const reminderKey = 'homework_manual_reminder_intents/reminder1';
    const reminder = documents.get(reminderKey)!;
    documents.set(reminderKey, { ...reminder, createTime: cutoff });
    denied = await bridge.fetch(send('homework-reminder', 'reminder1', teacherId), bindings);
    expect(denied.status).toBe(403);
    documents.set(reminderKey, reminder);
    denied = await bridge.fetch(send('homework-reminder', 'reminder1', 'foreignTeacher'), bindings);
    expect(denied.status).toBe(403);
    expect(writes).toHaveLength(5);
    for (const key of ['homework_notification_proofs/submission1', 'homework_submissions/submission1',
      `homework_assignments/${homeworkId}`]) {
      const saved = documents.get(key)!;
      for (const mutation of [{ createTime: cutoff }, { name: 'projects/foreign/databases/(default)/documents/forged/id' }]) {
        documents.set(key, { ...saved, ...mutation });
        denied = await bridge.fetch(send('homework-submitted', 'submission1', studentId), bindings);
        expect(denied.status).toBe(403);
        expect(writes).toHaveLength(5);
      }
      documents.set(key, saved);
    }
    const noticePath = 'notifications/teacher1/ordinary_homework_submitted_submission1_teacher1';
    (values[noticePath] as any).read = true;
    const replayed = await bridge.fetch(send('homework-submitted', 'submission1', studentId), bindings);
    expect(await replayed.json()).toEqual({ status: 'replayed' });
    expect((values[noticePath] as any).read).toBe(true);
    expect(writes.slice(-2)).toEqual(['result_notification_authority/result1', noticePath]);
  });

  it('dispatches the named Course approval endpoint and returns its confirmed status', async () => {
    const response = await createNotificationFirestoreBridge().fetch(new Request(
      'https://bridge.example/course-enrollment-approval', {
        method: 'POST', headers: { Authorization: 'Bearer teacher-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'request_1', operationId: 'a1b2c3d4-1234-4123-8123-a1b2c3d4e5f6' }),
      }), env());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'transitioned' });
  });

  it('denies excluded grading and live-session families before provider I/O', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    for (const kind of ['writing-graded', 'writing-session-submitted']) {
      expect((await createNotificationFirestoreBridge(fetcher).fetch(request(kind), env())).status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('refreshes an expired OAuth token while reusing the imported key', async () => {
    vi.resetModules();
    const { createNotificationFirestoreBridge: createFreshBridge } = await import('../notification-firestore-bridge.ts');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const telemetry = vi.spyOn(console, 'info').mockImplementation(() => {});
    let oauthCalls = 0;
    const authorizations: unknown[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('writing_notification_intents')) return Response.json(proof);
      if (url.includes('writing_submissions')) return Response.json(source);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: `token-${++oauthCalls}`, expires_in: 60 });
      if (resultLeaf(url)) return resultLeaf(url)!;
      authorizations.push(init?.headers);
      return Response.json({});
    }) as unknown as typeof fetch;
    try {
      const bridge = createFreshBridge(fetcher);
      expect((await bridge.fetch(request(), env())).status).toBe(200);
      expect((await bridge.fetch(request(), env())).status).toBe(200);
      clock.mockReturnValue(1_800_000_060_001);
      expect((await bridge.fetch(request(), env())).status).toBe(200);
      expect(oauthCalls).toBe(2);
      expect(telemetry.mock.calls.map(call => call[1].cache)).toEqual(['cold', 'cached', 'refresh']);
      expect(telemetry.mock.calls[0][1]).toMatchObject({ issuedAt: 1_800_000_000_000, expiresAt: 1_800_000_060_000 });
      expect(telemetry.mock.calls[2][1]).toMatchObject({ issuedAt: 1_800_000_060_001, expiresAt: 1_800_000_120_001 });
      expect(authorizations.at(-1)).toMatchObject({ Authorization: 'Bearer token-2' });
    } finally {
      clock.mockRestore();
      telemetry.mockRestore();
    }
  });

  it('fails closed outside the exact QA actor and event', async () => {
    const fetcher = vi.fn(async () => Response.json(proof)) as unknown as typeof fetch;
    const wrongEvent = await createNotificationFirestoreBridge(fetcher).fetch(request(), { ...env(), NOTIFICATION_BRIDGE_QA_EVENT_ID: 'another-event' });
    expect(wrongEvent.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    const wrongActor = await createNotificationFirestoreBridge(fetcher).fetch(request(), { ...env(), NOTIFICATION_BRIDGE_QA_ACTOR: 'another-actor' });
    expect(wrongActor.status).toBe(403);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('cancels oversized chunked bodies despite absent or forged Content-Length before Firebase I/O', async () => {
    for (const contentLength of [undefined, '1']) {
      const cancel = vi.fn();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(300));
          controller.enqueue(new Uint8Array(300));
          controller.enqueue(new Uint8Array(300));
        },
        cancel,
      });
      const headers = new Headers({ Authorization: 'Bearer student-token', 'Content-Type': 'application/json' });
      if (contentLength) headers.set('Content-Length', contentLength);
      const input = new Request('https://bridge.example/events', { method: 'POST', headers, body, duplex: 'half' } as RequestInit);
      const fetcher = vi.fn() as unknown as typeof fetch;
      const response = await createNotificationFirestoreBridge(fetcher).fetch(input, env());
      expect(response.status).toBe(413);
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it('uses the actor-only proof before rate limit, then conditionally creates one inbox row', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('writing_notification_intents')) return Response.json(proof);
      if (url.includes('writing_submissions')) return Response.json(source);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'service-token', expires_in: 3600 });
      if (resultLeaf(url)) return resultLeaf(url)!;
      return Response.json({}, { status: 200 });
    }) as unknown as typeof fetch;
    const bindings = env();
    const response = await createNotificationFirestoreBridge(fetcher).fetch(request(), bindings);
    expect(await response.json()).toEqual({ status: 'created' });
    expect(calls[0].init?.headers).toEqual({ Authorization: 'Bearer student-token' });
    expect(new URL(calls[0].url).searchParams.getAll('mask.fieldPaths')).toEqual([
      'eventId', 'kind', 'authorityRecordId', 'occurrenceId', 'actorUid', 'occurredAt', 'auditVersion',
    ]);
    expect(new URL(calls[1].url).searchParams.getAll('mask.fieldPaths')).toEqual([
      'id', 'studentId', 'sourceActorUid', 'submittedAt', 'context.type', 'context.selectedTeacherId', 'context.classId',
    ]);
    expect(bindings.NOTIFICATION_RATE_LIMITER.limit).toHaveBeenCalledWith({ key: 'firestore-bridge:student1' });
    expect(calls.at(-1)?.init?.headers).toMatchObject({ Authorization: 'Bearer service-token', 'If-Match': 'null_etag' });
    expect(calls.filter(call => call.url.includes('/test_results'))).toHaveLength(8);
    const oauthCalls = calls.filter(call => call.url.includes('oauth2.googleapis.com')).length;
    expect(oauthCalls).toBeLessThanOrEqual(1); // the imported bridge may reuse the token from an earlier test
    expect(calls).toHaveLength(11 + oauthCalls); // proof, source, eight keyed RTDB reads, conditional inbox write, optional OAuth refresh
    expect(JSON.parse(String(calls.at(-1)?.init?.body))).toMatchObject({ id: eventId, read: false, createdAt: 123 });
  });

  it('activates only fresh solo submission notices while retaining proof auth and closed other families', async () => {
    const cutoff = '2026-10-02T02:22:09.862Z';
    const fresh = '2026-10-02T03:00:00Z';
    let proofTime = fresh;
    let sourceTime = fresh;
    let proofStatus = 200;
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('writing_notification_intents')) return Response.json({ ...proof, createTime: proofTime }, { status: proofStatus });
      if (url.includes('writing_submissions')) return Response.json({ ...source, createTime: sourceTime });
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'service-token', expires_in: 3600 });
      return resultLeaf(url) ?? Response.json({});
    }) as unknown as typeof fetch;
    const bindings = { ...env(), NOTIFICATION_BRIDGE_QA_ACTOR: 'other-qa-actor', NOTIFICATION_BRIDGE_QA_EVENT_ID: 'other-qa-event', WRITING_NOTIFICATION_RULES_CUTOFF: cutoff };
    expect((await createNotificationFirestoreBridge(fetcher).fetch(request(), bindings)).status).toBe(200);
    proofTime = cutoff;
    expect((await createNotificationFirestoreBridge(fetcher).fetch(request(), bindings)).status).toBe(403);
    proofTime = fresh;
    sourceTime = cutoff;
    expect((await createNotificationFirestoreBridge(fetcher).fetch(request(), bindings)).status).toBe(403);
    sourceTime = fresh;
    proofStatus = 403;
    expect((await createNotificationFirestoreBridge(fetcher).fetch(request(), bindings)).status).toBe(403);
    fetcher.mockClear();
    for (const kind of ['writing-graded', 'writing-session-submitted']) {
      expect((await createNotificationFirestoreBridge(fetcher).fetch(request(kind), bindings)).status).toBe(400);
    }
    const homework = await createNotificationFirestoreBridge(fetcher).fetch(request('homework-reminder'), bindings);
    expect(homework.status).toBe(503);
    expect(await homework.json()).toEqual({ status: 'homework_unqualified' });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await createNotificationFirestoreBridge(fetcher).fetch(request(), { ...bindings, WRITING_NOTIFICATION_RULES_CUTOFF: 'invalid' })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('limits keyed result fetch concurrency to three', async () => {
    let active = 0;
    let peak = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('writing_notification_intents')) return Response.json(proof);
      if (url.includes('writing_submissions')) return Response.json(source);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'service-token', expires_in: 3600 });
      const leaf = resultLeaf(url);
      if (leaf) {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 0));
        active -= 1;
        return leaf;
      }
      return Response.json({});
    }) as unknown as typeof fetch;
    const response = await createNotificationFirestoreBridge(fetcher).fetch(request(), env());
    expect(response.status).toBe(200);
    expect(peak).toBe(3);
  });

  it('stops on denied proof without consuming the limiter or service credential', async () => {
    const fetcher = vi.fn(async () => Response.json({}, { status: 403 })) as unknown as typeof fetch;
    const bindings = env();
    const response = await createNotificationFirestoreBridge(fetcher).fetch(request(), bindings);
    expect(response.status).toBe(403);
    expect(bindings.NOTIFICATION_RATE_LIMITER.limit).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('denies a changed recipient, occurrence, or non-solo source before privileged delivery', async () => {
    for (const changed of [
      { studentId: 'victim' }, { submittedAt: 124 }, { context: { type: 'live-session' } },
    ]) {
      const fetcher = vi.fn(async (url: string) => url.includes('writing_notification_intents')
        ? Response.json(proof)
        : Response.json(doc({ id: 'solo1', studentId: 'student1', submittedAt: 123, context: { type: 'solo-practice' }, ...changed }))) as unknown as typeof fetch;
      const response = await createNotificationFirestoreBridge(fetcher).fetch(request(), env());
      expect(await response.json()).toEqual({ status: 'source_invalid' });
      expect(response.status).toBe(403);
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });

  it('does not overwrite a collision or recipient read state', async () => {
    const original = { id: eventId, type: 'success', title: 'Writing submitted',
      message: 'Your writing submission has been received for review.',
      link: '/student/academic-record', read: true, createdAt: 123 };
    let priorRow: unknown = original;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('writing_notification_intents')) return Response.json(proof);
      if (url.includes('writing_submissions')) return Response.json(source);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'service-token', expires_in: 3600 });
      if (resultLeaf(url)) return resultLeaf(url)!;
      if (init?.method === 'PUT') return Response.json({}, { status: 412 });
      return Response.json(priorRow);
    }) as unknown as typeof fetch;
    const response = await createNotificationFirestoreBridge(fetcher).fetch(request(), env());
    expect(await response.json()).toEqual({ status: 'replayed' });
    expect(fetcher).toHaveBeenCalledTimes(12);
    priorRow = { ...original, title: 'Conflicting content' };
    const collision = await createNotificationFirestoreBridge(fetcher).fetch(request(), env());
    expect(collision.status).toBe(409);
    expect(await collision.json()).toEqual({ status: 'conflict' });
    expect(fetcher).toHaveBeenCalledTimes(24);
    for (const undecidable of [null, { id: eventId }, { ...original, read: null }]) {
      priorRow = undecidable;
      const unknown = await createNotificationFirestoreBridge(fetcher).fetch(request(), env());
      expect(unknown.status).toBe(503);
      expect(await unknown.json()).toEqual({ status: 'delivery_unknown' });
    }
    priorRow = { ...original, injected: true };
    const extra = await createNotificationFirestoreBridge(fetcher).fetch(request(), env());
    expect(extra.status).toBe(409);
    expect(await extra.json()).toEqual({ status: 'conflict' });
  });

  it('delivers to the selected teacher only after keyed active class and roster proof', async () => {
    const teacherEvent = 'writing-solo1-submitted-teacher';
    const teacherProof = doc({ eventId: teacherEvent, kind: 'writing-submitted-teacher', authorityRecordId: 'solo1', occurrenceId: teacherEvent, actorUid: 'student1', occurredAt: 123 });
    const teacherSource = doc({ id: 'solo1', studentId: 'student1', submittedAt: 123,
      context: { type: 'solo-practice', selectedTeacherId: 'teacher1', classId: 'class1' } });
    let owner = 'teacher1';
    let classStatus = 'active';
    let membership = 'active';
    const writes: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('writing_notification_intents')) return Response.json(teacherProof);
      if (url.includes('writing_submissions')) return Response.json(teacherSource);
      if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'service-token', expires_in: 3600 });
      if (resultLeaf(url)) return resultLeaf(url)!;
      if (url.includes('/classes/class1/createdBy')) return Response.json(owner);
      if (url.includes('/classes/class1/status')) return Response.json(classStatus);
      if (url.includes('/classes/class1/students/student1/status')) return Response.json(membership);
      if (init?.method === 'PUT') {
        expect(JSON.parse(String(init.body)).link).toBe('/teacher/student/student1/history');
        writes.push(url);
      }
      return Response.json({});
    }) as unknown as typeof fetch;
    const result = await createNotificationFirestoreBridge(fetcher).fetch(request('writing-submitted-teacher', teacherEvent),
      { ...env(), NOTIFICATION_BRIDGE_QA_EVENT_ID: teacherEvent });
    expect(await result.json()).toEqual({ status: 'created' });
    expect(writes).toEqual(['https://project1.firebaseio.com/notifications/teacher1/writing-solo1-submitted-teacher.json']);
    expect(vi.mocked(fetcher).mock.calls.filter(([url]) => !String(url).includes('oauth2.googleapis.com'))).toHaveLength(14);
    for (const invalid of [
      () => { owner = 'other-teacher'; },
      () => { owner = 'teacher1'; classStatus = 'archived'; },
      () => { classStatus = 'active'; membership = 'removed'; },
    ]) {
      invalid();
      const denied = await createNotificationFirestoreBridge(fetcher).fetch(request('writing-submitted-teacher', teacherEvent),
        { ...env(), NOTIFICATION_BRIDGE_QA_EVENT_ID: teacherEvent });
      expect(await denied.json()).toEqual({ status: 'audience_denied' });
    }
    expect(writes).toHaveLength(1);
  });

  it('denies early calls and each mismatched canonical or student-index result field', async () => {
    for (const changed of [
      'test_results/solo1/resultId', 'test_results/solo1/studentId', 'test_results/solo1/submittedAt',
      'test_results/solo1/testSkill', 'test_results/solo1/writingData/submissionId',
      'test_results_by_student/student1/solo1/resultId', 'test_results_by_student/student1/solo1/studentId',
      'test_results_by_student/student1/solo1/submittedAt',
    ]) {
      for (const replacement of [null, 'forged']) {
        const fetcher = vi.fn(async (url: string) => {
          if (url.includes('writing_notification_intents')) return Response.json(proof);
          if (url.includes('writing_submissions')) return Response.json(source);
          if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'service-token', expires_in: 3600 });
          if (new URL(url).pathname.endsWith(`/${changed}.json`)) return Response.json(replacement);
          return resultLeaf(url) ?? Response.json({});
        }) as unknown as typeof fetch;
        const denied = await createNotificationFirestoreBridge(fetcher).fetch(request(), env());
        expect(await denied.json(), changed).toEqual({ status: 'result_invalid' });
        expect(fetcher.mock.calls.some(([url]) => String(url).includes('/notifications/'))).toBe(false);
      }
    }
  });
});
