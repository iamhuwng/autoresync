import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { expect, it, vi } from 'vitest';

it('delivers assignment proofs and THCS receipts through the frozen release with exact identity and replay checks', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(publicKey), kid: 'release-test', alg: 'RS256', use: 'sig' };
  const authorize = async (uid: string) => `Bearer ${await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer('https://securetoken.google.com/project1').setAudience('project1').setSubject(uid)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey)}`;
  const authorization = await authorize('teacher');
  const occurredAt = Date.now() - 1000;
  const field = (value: any): any => typeof value === 'string' ? { stringValue: value }
    : typeof value === 'number' ? { integerValue: String(value) }
      : typeof value === 'boolean' ? { booleanValue: value }
      : Array.isArray(value) ? { arrayValue: { values: value.map(field) } }
        : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, field(child)])) } };
  const documents: Record<string, any> = {
    'homework_notification_proofs/homework': {
      eventId: 'homework', kind: 'thcs-homework-assigned', actorUid: 'teacher', homeworkId: 'homework', occurredAt,
    },
    'homework_assignments/homework': {
      id: 'homework', createdBy: 'teacher', createdAt: occurredAt, materialId: 'test', materialType: 'thcs-test',
      target: { type: 'students', studentIds: ['student', 'second'] },
    },
  };
  const values: Record<string, unknown> = {
    'users/teacher/role': 'teacher', 'users/student/role': 'student',
    'users/second/role': 'student', 'users/outsider/role': 'student',
  };
  const writes: string[] = [];
  let documentNameOverride: string | undefined;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === 'www.googleapis.com') return Response.json({ keys: [jwk] });
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'service-token', expires_in: 3600 });
    if (url.hostname === 'firestore.googleapis.com') {
      const data = documents[url.pathname.split('/documents/')[1]];
      return data ? Response.json({ name: documentNameOverride ?? `projects/project1/databases/(default)/documents/${url.pathname.split('/documents/')[1]}`,
        fields: field(data).mapValue.fields, createTime: new Date(occurredAt).toISOString() })
        : Response.json({}, { status: 404 });
    }
    if (url.hostname === 'project1.firebaseio.com') {
      const path = url.pathname.slice(1).replace(/\.json$/u, '');
      if (init?.method === 'PUT') {
        expect(init.headers).toMatchObject({ 'If-Match': 'null_etag' });
        if (Object.hasOwn(values, path)) return Response.json({}, { status: 412 });
        writes.push(path);
        values[path] = JSON.parse(String(init.body));
        return Response.json({});
      }
      return Response.json(values[path] ?? null);
    }
    throw Error(`Unexpected provider request: ${url}`);
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    const { NotificationBridgeObject } = await import('../notification-release/notification-command-public.js');
    const bridge = new NotificationBridgeObject({}, {
      FIREBASE_PROJECT_ID: 'project1', FIREBASE_DB_URL: 'https://project1.firebaseio.com',
      HOMEWORK_NOTIFICATION_RULES_CUTOFF: new Date(occurredAt - 1000).toISOString(),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: 'sa@example.test',
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'sa@example.test', private_key: await exportPKCS8(privateKey) }),
      NOTIFICATION_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    const deliver = (studentId: string) => bridge.fetch(new Request('https://worker.test/events', {
      method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'thcs-homework-assigned', eventId: 'homework', studentId }),
    }));
    for (const studentId of ['student', 'second']) {
      const response = await deliver(studentId);
      expect(await response.json()).toEqual({ status: 'created' });
      expect(response.status).toBe(200);
      expect(values[`notifications/${studentId}/ordinary_thcs_homework_assigned_homework_${studentId}`]).toMatchObject({
        title: 'New THCS homework', link: '/student/homework/homework', read: false,
      });
    }
    const outsider = await deliver('outsider');
    expect(outsider.status).toBe(403);
    expect(await outsider.json()).toEqual({ status: 'homework_denied' });
    delete documents['homework_notification_proofs/homework'];
    const missing = await deliver('student');
    expect(missing.status).toBe(403);
    expect(await missing.json()).toEqual({ status: 'homework_denied' });
    expect(writes).toEqual([
      'notifications/student/ordinary_thcs_homework_assigned_homework_student',
      'notifications/second/ordinary_thcs_homework_assigned_homework_second',
    ]);

    documents['homework_notification_proofs/attempt'] = {
      eventId: 'attempt', kind: 'homework-submitted', actorUid: 'student', homeworkId: 'homework',
      studentId: 'student', resultId: 'result', occurredAt,
    };
    documents['homework_submissions/attempt'] = {
      id: 'attempt', homeworkId: 'homework', studentId: 'student', teacherId: 'teacher',
      submittedAt: occurredAt, resultId: 'result', status: 'submitted',
    };
    const result = {
      resultId: 'result', studentId: 'student', testId: 'test', submittedAt: occurredAt - 500,
      createdAt: occurredAt - 250, testType: 'THCS-THPT', testSkill: 'Mixed', isGuest: false,
      sessionCode: 'homework_practice_attempt', 'context/type': 'homework',
      'context/source/id': 'homework', 'context/source/type': 'homework',
      'context/source/submissionId': 'attempt', 'context/assignment/homeworkId': 'homework', thcsData: { score: true },
    };
    for (const [leaf, value] of Object.entries(result)) values[`test_results/result/${leaf}`] = value;
    const studentAuthorization = await authorize('student');
    const submit = () => bridge.fetch(new Request('https://worker.test/events', {
      method: 'POST', headers: { Authorization: studentAuthorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'homework-submitted', eventId: 'attempt' }),
    }));
    values['test_results/result/sessionCode'] = 'foreign-session';
    const forgedIdentity = await submit();
    expect(forgedIdentity.status).toBe(403);
    expect(await forgedIdentity.json()).toEqual({ status: 'homework_denied' });
    values['test_results/result/sessionCode'] = result.sessionCode;
    documentNameOverride = 'projects/project1/databases/(default)/documents/homework_submissions/foreign';
    const forgedDocument = await submit();
    expect(forgedDocument.status).toBe(403);
    expect(await forgedDocument.json()).toEqual({ status: 'homework_denied' });
    documentNameOverride = undefined;
    expect(writes).toHaveLength(2);
    const submitted = await submit();
    expect(submitted.status).toBe(200);
    expect(await submitted.json()).toEqual({ status: 'created' });
    expect(values['result_notification_authority/result']).toEqual({
      schemaVersion: 3, materialType: 'thcs-test', contextType: 'homework', resultId: 'result',
      studentId: 'student', ownerTeacherId: 'teacher', homeworkId: 'homework', homeworkSubmissionId: 'attempt',
      testId: 'test', submittedAt: occurredAt - 500, createdAt: occurredAt - 250, homeworkSubmittedAt: occurredAt,
      sourceRulesCutoff: new Date(occurredAt - 1000).toISOString(),
    });
    const noticePath = 'notifications/teacher/ordinary_homework_submitted_attempt_teacher';
    (values[noticePath] as { read: boolean }).read = true;
    const replay = await submit();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ status: 'replayed' });
    expect(values[noticePath]).toMatchObject({ read: true, link: '/teacher/homework/homework' });
    expect(writes.slice(2)).toEqual(['result_notification_authority/result', noticePath]);
  } finally {
    vi.unstubAllGlobals();
  }
});
