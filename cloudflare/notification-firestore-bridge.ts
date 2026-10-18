import { deliverHomeworkNotice, HOMEWORK_KINDS, type HomeworkKind } from './homework-notification.ts';
import { buildRoute } from '../src/constants/routes.ts';
import { verifyHomeworkResultAuthority } from './homework-result-authority.ts';
import { token } from './notification-firestore-auth.ts';
import { handleCourseEnrollmentApproval } from './course-enrollment-approval-handler.ts';

export { token } from './notification-firestore-auth.ts';

export type Env = {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_DB_URL: string;
  FIREBASE_WEB_API_KEY?: string;
  NOTIFICATION_COMMAND_SERVICE_IDENTITY: string;
  NOTIFICATION_COMMAND_GOOGLE_SA_KEY: string;
  NOTIFICATION_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  NOTIFICATION_BRIDGE_QA_ACTOR?: string;
  NOTIFICATION_BRIDGE_QA_EVENT_ID?: string;
  RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME?: string;
  RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF?: string;
  HOMEWORK_RESULT_AUTHORITY_QA_RESULT_ID?: string;
  HOMEWORK_RESULT_AUTHORITY_QA_ACTOR?: string;
  COURSE_ENROLLMENT_APPROVAL_ENABLED?: string;
  WRITING_PRODUCT_SOURCE_CUTOFF?: string;
  WRITING_PRODUCT_QA_ACTOR?: string;
  WRITING_PRODUCT_QA_SUBMISSION_ID?: string;
  HOMEWORK_NOTIFICATION_RULES_CUTOFF?: string;
  WRITING_NOTIFICATION_RULES_CUTOFF?: string;
};

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const ORIGINS = new Set(['https://kahut1.web.app', 'https://hocthem.net', 'http://localhost:5173', 'http://localhost:5174']);

const row = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const field = (value: unknown): unknown => {
  const data = row(value);
  if (!data) return undefined;
  if (typeof data.stringValue === 'string') return data.stringValue;
  if (typeof data.integerValue === 'string') return Number(data.integerValue);
  if (typeof data.doubleValue === 'number') return data.doubleValue;
  if (Object.hasOwn(data, 'nullValue')) return null;
  if (data.mapValue) return fields(row(data.mapValue)?.fields);
  if (data.arrayValue) return (row(data.arrayValue)?.values as unknown[] ?? []).map(field);
  if (typeof data.booleanValue === 'boolean') return data.booleanValue;
  return undefined;
};

export const fields = (value: unknown): Record<string, unknown> =>
  Object.fromEntries(Object.entries(row(value) ?? {}).map(([key, child]) => [key, field(child)]));

const json = (request: Request, status: number, statusText: string): Response => {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (origin && ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  return new Response(JSON.stringify({ status: statusText }), { status, headers });
};

export const createNotificationFirestoreBridge = (fetcher: typeof fetch = fetch) => ({
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!['/events', '/homework-result-authority', '/course-enrollment-approval'].includes(url.pathname) || url.search) return json(request, 404, 'not_found');
    const bodyLimit = 512;
    const origin = request.headers.get('Origin');
    if (origin && !ORIGINS.has(origin)) return json(request, 403, 'origin_denied');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: json(request, 200, 'ok').headers });
    if (request.method !== 'POST') return json(request, 405, 'method_denied');
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ') || !auth.slice(7)) return json(request, 401, 'unauthenticated');
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json(request, 400, 'invalid_content_type');
    if (Number(request.headers.get('Content-Length') ?? 0) > bodyLimit) return json(request, 413, 'body_too_large');
    const reader = request.body?.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > bodyLimit) {
            await reader.cancel();
            return json(request, 413, 'body_too_large');
          }
          raw += decoder.decode(chunk.value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    let input: Record<string, unknown> | null;
    try { input = row(JSON.parse(raw)); } catch { input = null; }
    if (url.pathname === '/course-enrollment-approval') {
      return handleCourseEnrollmentApproval(request, env, fetcher, input);
    }
    if (url.pathname === '/homework-result-authority') {
      if (!input || Object.keys(input).join(',') !== 'resultId' || typeof input.resultId !== 'string' || !ID.test(input.resultId))
        return json(request, 400, 'invalid_result');
      if (input.resultId !== env.HOMEWORK_RESULT_AUTHORITY_QA_RESULT_ID) return json(request, 403, 'qa_result_denied');
      if (!env.RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME || !env.RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF)
        return json(request, 503, 'authority_unavailable');
      try {
        // Verify before metering/reading a candidate source, so nonexistent IDs
        // consume the authenticated actor's limit without charging victim keys.
        const { createFirebaseVerifier } = await import('./src/upload-worker/firebase-verification.js');
        const identity = await createFirebaseVerifier().verifyAuthorizationHeader(auth, env);
        const actor = identity.uid;
        if (!identity.valid || typeof actor !== 'string' || !ID.test(actor)) return json(request, 401, 'unauthenticated');
        if (actor !== env.HOMEWORK_RESULT_AUTHORITY_QA_ACTOR) return json(request, 403, 'qa_actor_denied');
        const project = encodeURIComponent(env.FIREBASE_PROJECT_ID);
        const status = await verifyHomeworkResultAuthority({ resultId: input.resultId, actorUid: actor, env,
          readSource: async (collection, id, mask) => {
            const query = new URLSearchParams();
            mask.forEach(path => query.append('mask.fieldPaths', path));
            const response = await fetcher(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?${query}`, { headers: { Authorization: auth } });
            if ([401, 403, 404].includes(response.status)) throw Error('authority_denied');
            if (!response.ok) throw Error('authority_unavailable');
            const document = row(await response.json());
            return { name: document?.name, createTime: document?.createTime, data: fields(document?.fields) };
          },
          database: async () => {
            const accessToken = await token(env, fetcher, request.headers.get('CF-Ray'));
            const headers = { Authorization: `Bearer ${accessToken}` };
            const base = env.FIREBASE_DB_URL.replace(/\/$/u, '');
            return {
              read: async path => {
                const response = await fetcher(`${base}/${path}.json`, { headers });
                if (!response.ok) throw Error('authority_unavailable');
                return response.json();
              },
              create: async (path, value) => {
                const response = await fetcher(`${base}/${path}.json`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': 'null_etag' }, body: JSON.stringify(value) });
                if (response.ok) return true;
                if (response.status === 412) return false;
                throw Error('authority_unavailable');
              },
            };
          },
        });
        return json(request, 200, status);
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        return json(request, code === 'authority_denied' ? 403 : code === 'authority_conflict' ? 409 : code === 'authority_rate_limited' ? 429 : 503,
          ['authority_denied', 'authority_conflict', 'authority_rate_limited'].includes(code) ? code : 'authority_unavailable');
      }
    }
    if (input && HOMEWORK_KINDS.includes(input.kind as HomeworkKind)) {
      if (Object.keys(input).sort().join(',') !== (input.kind === 'thcs-homework-assigned' ? 'eventId,kind,studentId' : 'eventId,kind')
        || typeof input.eventId !== 'string' || !ID.test(input.eventId)
        || (input.kind === 'thcs-homework-assigned' && (typeof input.studentId !== 'string' || !ID.test(input.studentId))))
        return json(request, 400, 'invalid_event');
      const homeworkCutoff = env.HOMEWORK_NOTIFICATION_RULES_CUTOFF;
      const productionHomework = Boolean(homeworkCutoff && Number.isFinite(Date.parse(homeworkCutoff)));
      if (!productionHomework)
        return json(request, 503, 'homework_unqualified');
      try {
        const { createFirebaseVerifier } = await import('./src/upload-worker/firebase-verification.js');
        const identity = await createFirebaseVerifier().verifyAuthorizationHeader(auth, env);
        if (!identity.valid || typeof identity.uid !== 'string' || !ID.test(identity.uid)) return json(request, 401, 'unauthenticated');
        if (!env.NOTIFICATION_RATE_LIMITER?.limit) return json(request, 503, 'limiter_missing');
        if (!(await env.NOTIFICATION_RATE_LIMITER.limit({ key: `firestore-bridge:${identity.uid}` })).success) return json(request, 429, 'rate_limited');
        const status = await deliverHomeworkNotice({ kind: input.kind as HomeworkKind, eventId: input.eventId,
          studentId: input.studentId as string | undefined, actorUid: identity.uid, sourceRulesCutoff: homeworkCutoff,
          readSource: async (collection, id, mask) => {
            const query = new URLSearchParams();
            mask.forEach(path => query.append('mask.fieldPaths', path));
            // Group membership is owner-private; the authenticated actor proof and
            // sealed assignment precede this exact privileged metadata GET.
            const authorization = collection === 'student_groups' ? `Bearer ${await token(env, fetcher, request.headers.get('CF-Ray'))}` : auth;
            const response = await fetcher(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?${query}`, { headers: { Authorization: authorization } });
            if (response.status === 404 && input.kind === 'homework-reset' && collection === 'homework_submissions') return { data: {}, exists: false };
            if ([401, 403, 404].includes(response.status)) throw Error('homework_denied');
            if (!response.ok) throw Error('homework_unknown');
            const document = row(await response.json());
            // Seals cannot retroactively authenticate records created under unsafe Rules.
            if (collection !== 'student_groups' && (!document
              || document.name !== `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}`
              || typeof document.createTime !== 'string'
              || !(Date.parse(document.createTime) > Date.parse(env.HOMEWORK_NOTIFICATION_RULES_CUTOFF!)))) throw Error('homework_denied');
            return { data: fields(document?.fields), createTime: document?.createTime };
          },
          database: async () => {
            const accessToken = await token(env, fetcher, request.headers.get('CF-Ray'));
            const headers = { Authorization: `Bearer ${accessToken}` };
            const base = env.FIREBASE_DB_URL.replace(/\/$/u, '');
            return {
              read: async (path, shallow) => {
                const response = await fetcher(`${base}/${path}.json${shallow ? '?shallow=true' : ''}`, { headers });
                if (!response.ok) throw Error('homework_unknown');
                return response.json();
              },
              create: async (path, value) => {
                const response = await fetcher(`${base}/${path}.json`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json', 'If-Match': 'null_etag' }, body: JSON.stringify(value) });
                if (response.ok) return true;
                if (response.status === 412) return false;
                throw Error('homework_unknown');
              },
            };
          },
        });
        return json(request, 200, status);
      } catch (error) {
        const code = error instanceof Error ? error.message : 'homework_unknown';
        return json(request, code === 'homework_denied' ? 403 : code === 'homework_conflict' ? 409 : 503,
          ['homework_denied', 'homework_conflict'].includes(code) ? code : 'delivery_unknown');
      }
    }
    if (!input || Object.keys(input).sort().join(',') !== 'eventId,kind'
      || !['writing-submitted-student', 'writing-submitted-teacher'].includes(String(input.kind))
      || typeof input.eventId !== 'string' || !ID.test(input.eventId)) {
      return json(request, 400, 'invalid_event');
    }
    const eventId = input.eventId;
    const writingCutoff = env.WRITING_NOTIFICATION_RULES_CUTOFF;
    const productionWriting = Boolean(writingCutoff && Number.isFinite(Date.parse(writingCutoff)));
    if (writingCutoff && !productionWriting) return json(request, 503, 'writing_unqualified');
    if (productionWriting && !['writing-submitted-student', 'writing-submitted-teacher'].includes(String(input.kind)))
      return json(request, 403, 'writing_kind_denied');
    if (!productionWriting && eventId !== env.NOTIFICATION_BRIDGE_QA_EVENT_ID) return json(request, 403, 'qa_event_denied');
    const project = encodeURIComponent(env.FIREBASE_PROJECT_ID);
    const documentUrl = (collection: string, id: string, fieldPaths: string[]) => {
      const mask = new URLSearchParams();
      for (const path of fieldPaths) mask.append('mask.fieldPaths', path);
      return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?${mask}`;
    };
    try {
      // This GET applies Firestore Rules. Only the saved actor can read the proof.
      const proofResponse = await fetcher(documentUrl('writing_notification_intents', eventId,
        ['eventId', 'kind', 'authorityRecordId', 'occurrenceId', 'actorUid', 'occurredAt', 'auditVersion']),
        { headers: { Authorization: auth } });
      if (proofResponse.status === 401 || proofResponse.status === 403) return json(request, 403, 'actor_denied');
      if (proofResponse.status === 404) return json(request, 404, 'source_missing');
      if (!proofResponse.ok) throw Error('proof_read');
      const proofDocument = row(await proofResponse.json());
      if (productionWriting && !(typeof proofDocument?.createTime === 'string'
        && Date.parse(proofDocument.createTime) > Date.parse(writingCutoff!))) return json(request, 403, 'proof_invalid');
      const proof = fields(proofDocument?.fields);
      const sourceId = proof.authorityRecordId;
      const actor = proof.actorUid;
      const expectedEventId = `writing-${String(sourceId)}-submitted-${input.kind === 'writing-submitted-teacher' ? 'teacher' : 'student'}`;
      if (proof.kind !== input.kind || proof.eventId !== eventId || proof.occurrenceId !== eventId
        || typeof sourceId !== 'string' || !ID.test(sourceId) || typeof actor !== 'string' || !ID.test(actor)
        || eventId !== expectedEventId || !Number.isSafeInteger(proof.occurredAt))
        return json(request, 403, 'proof_invalid');
      if (!productionWriting && actor !== env.NOTIFICATION_BRIDGE_QA_ACTOR) return json(request, 403, 'qa_actor_denied');
      if (!env.NOTIFICATION_RATE_LIMITER?.limit) return json(request, 503, 'limiter_missing');
      if (!(await env.NOTIFICATION_RATE_LIMITER.limit({ key: `firestore-bridge:${actor}` })).success) return json(request, 429, 'rate_limited');
      const sourceMask = ['id', 'studentId', 'sourceActorUid', 'submittedAt', 'context.type', 'context.selectedTeacherId', 'context.classId'];
      const sourceAuth = auth;
      const sourceResponse = await fetcher(documentUrl('writing_submissions', sourceId, sourceMask), { headers: { Authorization: sourceAuth } });
      if (sourceResponse.status === 401 || sourceResponse.status === 403 || sourceResponse.status === 404) return json(request, 403, 'source_denied');
      if (!sourceResponse.ok) throw Error('source_read');
      const sourceDocument = row(await sourceResponse.json());
      if (productionWriting && !(typeof sourceDocument?.createTime === 'string'
        && Date.parse(sourceDocument.createTime) > Date.parse(writingCutoff!))) return json(request, 403, 'source_invalid');
      const source = fields(sourceDocument?.fields);
      const context = row(source.context);
      if (source.id !== sourceId || typeof source.studentId !== 'string' || !ID.test(source.studentId))
        return json(request, 403, 'source_invalid');
      if ((source.studentId !== actor || source.submittedAt !== proof.occurredAt
        || context?.type !== 'solo-practice')) return json(request, 403, 'source_invalid');
      const teacher = input.kind === 'writing-submitted-teacher' ? context?.selectedTeacherId : undefined;
      const classId = input.kind === 'writing-submitted-teacher' ? context?.classId : undefined;
      if (input.kind === 'writing-submitted-teacher'
        && (typeof teacher !== 'string' || !ID.test(teacher) || typeof classId !== 'string' || !ID.test(classId)))
        return json(request, 403, 'audience_invalid');
      const accessToken = await token(env, fetcher, request.headers.get('CF-Ray'));
      const base = env.FIREBASE_DB_URL.replace(/\/$/u, '');
      const read = async (path: string) => {
        const response = await fetcher(`${base}/${path}.json`, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!response.ok) throw Error('authority_read');
        return response.json() as Promise<unknown>;
      };
      const readLimited = async (paths: string[]) => {
        const values: unknown[] = [];
        for (let index = 0; index < paths.length; index += 3) {
          values.push(...await Promise.all(paths.slice(index, index + 3).map(read)));
        }
        return values;
      };
      const resultPath = `test_results/${encodeURIComponent(sourceId)}`;
      const indexPath = `test_results_by_student/${encodeURIComponent(source.studentId)}/${encodeURIComponent(sourceId)}`;
      const projectionPaths = [
        `${resultPath}/resultId`, `${resultPath}/studentId`, `${resultPath}/submittedAt`,
        `${resultPath}/testSkill`, `${resultPath}/writingData/submissionId`,
        `${indexPath}/resultId`, `${indexPath}/studentId`, `${indexPath}/submittedAt`,
      ];
      const projection = await readLimited(projectionPaths);
      const [resultId, studentId, submittedAt, skill, writingId, indexedResultId, indexedStudentId, indexedSubmittedAt] = projection;
      if (resultId !== sourceId || indexedResultId !== sourceId || studentId !== source.studentId || indexedStudentId !== source.studentId
        || submittedAt !== source.submittedAt || indexedSubmittedAt !== source.submittedAt
        || skill !== 'writing' || writingId !== sourceId)
        return json(request, 403, 'result_invalid');
      if (typeof teacher === 'string' && typeof classId === 'string') {
        const [owner, status, member] = await Promise.all([
          read(`classes/${encodeURIComponent(classId)}/createdBy`),
          read(`classes/${encodeURIComponent(classId)}/status`),
          read(`classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(actor)}/status`),
        ]);
        if (owner !== teacher || status !== 'active' || member !== 'active')
          return json(request, 403, 'audience_denied');
      }
      const recipient = typeof teacher === 'string' ? teacher : source.studentId;
      const inboxUrl = `${env.FIREBASE_DB_URL.replace(/\/$/u, '')}/notifications/${encodeURIComponent(recipient)}/${encodeURIComponent(eventId)}.json`;
      const notice = input.kind === 'writing-submitted-teacher' ? {
        id: eventId, type: 'info', title: 'New writing submission',
        message: 'A student submitted writing for review.',
        link: buildRoute('TEACHER_STUDENT_HISTORY', { studentId: source.studentId }), read: false, createdAt: proof.occurredAt,
      } : {
        id: eventId, type: 'success', title: 'Writing submitted',
        message: 'Your writing submission has been received for review.',
        link: buildRoute('STUDENT_ACADEMIC_RECORD'), read: false, createdAt: proof.occurredAt,
      };
      const write = await fetcher(inboxUrl, {
        method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'If-Match': 'null_etag' },
        body: JSON.stringify(notice),
      });
      if (write.ok) return json(request, 200, 'created');
      if (write.status !== 412) throw Error('inbox_write');
      const prior = await fetcher(inboxUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!prior.ok) throw Error('inbox_read');
      const saved = row(await prior.json());
      const expectedKeys = ['id', 'type', 'title', 'message', 'link', 'read', 'createdAt'];
      if (!saved || !expectedKeys.every(key => Object.hasOwn(saved, key)) || typeof saved.read !== 'boolean')
        return json(request, 503, 'delivery_unknown');
      const replayed = Object.keys(saved).every(key => expectedKeys.includes(key))
        && saved.id === notice.id && saved.type === notice.type
        && saved.title === notice.title && saved.message === notice.message
        && saved.link === notice.link && saved.createdAt === notice.createdAt;
      return json(request, replayed ? 200 : 409, replayed ? 'replayed' : 'conflict');
    } catch {
      return json(request, 503, 'delivery_unknown');
    }
  },
});

export default createNotificationFirestoreBridge();
