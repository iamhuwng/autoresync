import { buildRoute } from '../src/constants/routes.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const row = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const deny = (): never => { throw Error('homework_denied'); };
const time = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
export const HOMEWORK_KINDS = ['homework-submitted', 'thcs-homework-assigned', 'homework-reminder', 'homework-reset'] as const;
export type HomeworkKind = typeof HOMEWORK_KINDS[number];
type Source = { data: Record<string, unknown>; createTime?: unknown; exists?: boolean };
type Database = { read(path: string, shallow?: boolean): Promise<unknown>; create(path: string, value: unknown): Promise<boolean> };

/** Compute-only: exact source identities, one recipient, conditional creates. */
export async function deliverHomeworkNotice(input: {
  kind: HomeworkKind; eventId: string; studentId?: string; actorUid: string;
  sourceRulesCutoff?: string;
  readSource(collection: string, id: string, mask: string[]): Promise<Source>;
  database(): Promise<Database>;
}): Promise<'created' | 'replayed'> {
  const { kind, eventId, actorUid } = input;
  if (!ID.test(eventId) || !ID.test(actorUid) || (input.studentId !== undefined && !ID.test(input.studentId))) return deny();
  let homeworkId: unknown = eventId;
  let studentId: unknown = input.studentId;
  let occurredAt: unknown;
  let resultId: unknown;
  let resetResultId: unknown;
  let resetSubmissionId: unknown;
  let source: Record<string, unknown> | undefined;
  let sourceCreatedAt: unknown;
  let proof: Record<string, unknown> | undefined;
  if (kind === 'homework-submitted' || kind === 'thcs-homework-assigned') {
    proof = (await input.readSource('homework_notification_proofs', eventId,
      ['eventId', 'kind', 'actorUid', 'homeworkId', 'studentId', 'resultId', 'occurredAt'])).data;
    if (proof.eventId !== eventId || proof.kind !== kind || proof.actorUid !== actorUid) return deny();
  }
  if (kind !== 'thcs-homework-assigned') {
    const collection = kind === 'homework-submitted' ? 'homework_submissions'
      : kind === 'homework-reminder' ? 'homework_manual_reminder_intents' : 'homework_reset_notification_intents';
    const sourceDocument = await input.readSource(collection, eventId, ['id', 'eventId', 'homeworkId', 'studentId', 'teacherId',
      'actorUid', 'occurredAt', 'submittedAt', 'resultId', 'sourceSubmissionId', 'status', 'administrativeImport']);
    source = sourceDocument.data;
    sourceCreatedAt = sourceDocument.createTime;
    homeworkId = source.homeworkId;
    studentId = source.studentId;
    if (kind === 'homework-submitted') {
      if (source.id !== eventId || source.studentId !== actorUid || source.administrativeImport
        || !['submitted', 'graded'].includes(String(source.status)) || proof?.homeworkId !== homeworkId
        || proof?.studentId !== studentId || proof?.resultId !== source.resultId || proof?.occurredAt !== source.submittedAt) return deny();
      occurredAt = source.submittedAt;
      resultId = source.resultId;
    } else {
      if (source.eventId !== eventId || source.actorUid !== actorUid) return deny();
      occurredAt = source.occurredAt;
      if (kind === 'homework-reset') {
        resetSubmissionId = source.sourceSubmissionId;
        resetResultId = source.resultId;
        if (typeof resetSubmissionId !== 'string' || !ID.test(resetSubmissionId)
          || (resetResultId !== undefined && (typeof resetResultId !== 'string' || !ID.test(resetResultId)))) return deny();
        const prior = await input.readSource('homework_submissions', resetSubmissionId, ['id']);
        if (prior.exists !== false) return deny();
      }
    }
  }
  if (typeof homeworkId !== 'string' || !ID.test(homeworkId) || typeof studentId !== 'string' || !ID.test(studentId)) return deny();
  const assignment = (await input.readSource('homework_assignments', homeworkId,
    ['id', 'createdBy', 'createdAt', 'materialId', 'materialType', 'target', 'assignmentKind', 'archived'])).data;
  const owner = assignment.createdBy;
  if (assignment.id !== homeworkId || typeof owner !== 'string' || !ID.test(owner)
    || assignment.assignmentKind || assignment.materialType === 'book' || assignment.archived === true) return deny();
  if (kind === 'homework-submitted' ? source?.teacherId !== owner : actorUid !== owner) return deny();
  if (kind === 'thcs-homework-assigned') {
    if (assignment.materialType !== 'thcs-test' || proof?.homeworkId !== homeworkId
      || proof?.occurredAt !== assignment.createdAt) return deny();
    occurredAt = assignment.createdAt;
  }
  if (!time(occurredAt) || Number(occurredAt) > Date.now()) return deny();
  const db = await input.database();
  const [ownerRole, studentRole, restoring] = await Promise.all([
    db.read(`users/${owner}/role`), db.read(`users/${studentId}/role`), db.read('system_flags/restore_in_progress'),
  ]);
  if (ownerRole !== 'teacher' || studentRole !== 'student' || restoring === true) return deny();
  const target = row(assignment.target);
  if (target?.type === 'class') {
    if (typeof target.classId !== 'string' || !ID.test(target.classId)) return deny();
    const path = `classes/${target.classId}`;
    const [classOwner, status, member] = await Promise.all([
      db.read(`${path}/createdBy`), db.read(`${path}/status`), db.read(`${path}/students/${studentId}/status`),
    ]);
    if (classOwner !== owner || status !== 'active' || member !== 'active') return deny();
  } else if (['students', 'group'].includes(String(target?.type))) {
    if (!Array.isArray(target?.studentIds) || !target.studentIds.includes(studentId)) return deny();
    if (target.type === 'group') {
      if (typeof target.groupId !== 'string' || !ID.test(target.groupId)) return deny();
      const group = (await input.readSource('student_groups', target.groupId, ['id', 'teacherId', 'studentIds'])).data;
      if (group.id !== target.groupId || group.teacherId !== owner || !Array.isArray(group.studentIds) || !group.studentIds.includes(studentId)) return deny();
    }
  } else return deny(); // Course has no persisted enrollment authority in this product.
  if (kind === 'homework-submitted') {
    if (typeof resultId !== 'string' || !ID.test(resultId)) return deny();
    const path = `test_results/${resultId}`;
    const [savedId, student, contextType] = await Promise.all([db.read(`${path}/resultId`), db.read(`${path}/studentId`), db.read(`${path}/context/type`)]);
    const [sourceId, material, submittedAt] = await Promise.all([db.read(`${path}/context/source/id`), db.read(`${path}/testId`), db.read(`${path}/submittedAt`)]);
    if (savedId !== resultId || student !== studentId || contextType !== 'homework'
      || sourceId !== homeworkId || material !== assignment.materialId
      || !time(submittedAt) || submittedAt > Number(occurredAt)) return deny();
    if (assignment.materialType === 'thcs-test') {
      const cutoff = input.sourceRulesCutoff;
      const cutoffMs = typeof cutoff === 'string' ? Date.parse(cutoff) : NaN;
      const attemptCreatedMs = typeof sourceCreatedAt === 'string' ? Date.parse(sourceCreatedAt) : NaN;
      if (!Number.isFinite(cutoffMs) || !Number.isFinite(attemptCreatedMs)) throw Error('homework_unknown');
      const leaves = ['testType', 'testSkill', 'isGuest', 'createdAt', 'sessionCode', 'context/source/type',
        'context/source/submissionId', 'context/assignment/homeworkId', 'teacherId', 'classId', 'courseId', 'moduleId',
        'writingData', 'writingSubmission', 'context/selectedTeacherId', 'context/sessionCode',
        'context/classId', 'context/courseId', 'context/source/classId', 'context/source/courseId'];
      const identity: unknown[] = [];
      for (let index = 0; index < leaves.length; index += 3) {
        identity.push(...await Promise.all(leaves.slice(index, index + 3).map(leaf => db.read(`${path}/${leaf}`, leaf === 'writingData' || leaf === 'writingSubmission'))));
      }
      const [testType, testSkill, isGuest, createdAt, sessionCode, sourceType, attemptId, assignmentId, ...otherContexts] = identity;
      if (typeof material !== 'string' || !ID.test(material)
        || testType !== 'THCS-THPT' || testSkill !== 'Mixed' || isGuest !== false || !time(createdAt)
        || createdAt < submittedAt || createdAt > Number(occurredAt) || submittedAt <= cutoffMs
        || attemptCreatedMs <= cutoffMs || Number(occurredAt) < attemptCreatedMs - 300_000
        || sessionCode !== `homework_practice_${eventId}` || sourceType !== 'homework'
        || attemptId !== eventId || assignmentId !== homeworkId || otherContexts.some(value => value !== null && value !== undefined)
        || !row(await db.read(`${path}/thcsData`, true))) return deny();
      const receipt = { schemaVersion: 3, materialType: 'thcs-test', contextType: 'homework',
        resultId, studentId, ownerTeacherId: owner, homeworkId, homeworkSubmissionId: eventId,
        testId: material, submittedAt, createdAt, homeworkSubmittedAt: occurredAt, sourceRulesCutoff: cutoff };
      const authorityPath = `result_notification_authority/${resultId}`;
      if (!(await db.create(authorityPath, receipt))) {
        const prior = row(await db.read(authorityPath));
        if (!prior || Object.keys(prior).length !== Object.keys(receipt).length
          || Object.entries(receipt).some(([key, value]) => prior[key] !== value)) throw Error('homework_conflict');
      }
    }
  }
  const recipient = kind === 'homework-submitted' ? owner : studentId;
  const noticeId = `ordinary_${kind.replaceAll('-', '_')}_${eventId}_${recipient}`;
  const notice = {
    id: noticeId, type: kind === 'homework-reminder' ? 'homework_reminder' : 'info',
    title: kind === 'homework-submitted' ? 'Homework submitted' : kind === 'homework-reset' ? 'Homework reset'
      : kind === 'homework-reminder' ? 'Homework reminder' : 'New THCS homework',
    message: kind === 'homework-submitted' ? 'A student submitted homework for review.' : kind === 'homework-reset'
      ? 'Your teacher removed a homework attempt. Open Homework to check your current status.' : kind === 'homework-reminder'
        ? 'Your teacher reminded you to complete your homework.' : 'Your teacher assigned new THCS homework.',
    link: buildRoute(kind === 'homework-submitted' ? 'TEACHER_HOMEWORK_DETAIL' : 'STUDENT_HOMEWORK_DETAIL', { homeworkId }),
    createdAt: occurredAt, read: false,
  };
  if (new TextEncoder().encode(JSON.stringify(notice)).byteLength > 1024) return deny();
  const path = `notifications/${recipient}/${noticeId}`;
  if (await db.create(path, notice)) return 'created';
  const saved = row(await db.read(path));
  if (!saved) throw Error('homework_unknown');
  if (Object.keys(saved).some(key => !Object.hasOwn(notice, key))
    || Object.entries(notice).some(([key, value]) => key !== 'read' && saved[key] !== value)) throw Error('homework_conflict');
  return 'replayed';
}
