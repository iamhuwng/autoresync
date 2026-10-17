export interface HomeworkResultAuthority {
  schemaVersion: 2;
  resultId: string;
  studentId: string;
  ownerTeacherId: string;
  contextType: 'homework';
  homeworkId: string;
  homeworkSubmissionId: string;
  testId: string;
  writingSubmittedAt: number;
  homeworkSubmittedAt: number;
  submittedAt: number;
  sourceRulesetName: string;
  sourceRulesCutoff: string;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const OCCURRENCE_CLOCK_SKEW_NS = 300_000_000_000n; // Five minutes for client clock/transmission skew.
const deny = (): never => { throw Error('authority_denied'); };
const time = (value: unknown): bigint => {
  const match = typeof value === 'string' && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u.exec(value);
  if (!match) throw Error('authority_unavailable');
  const milliseconds = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 19) !== match[1]) throw Error('authority_unavailable');
  return BigInt(milliseconds) * 1_000_000n + BigInt((match[2] ?? '').padEnd(9, '0'));
};
const keys = ['schemaVersion', 'resultId', 'studentId', 'ownerTeacherId', 'contextType', 'homeworkId',
  'homeworkSubmissionId', 'testId', 'writingSubmittedAt', 'homeworkSubmittedAt', 'submittedAt', 'sourceRulesetName', 'sourceRulesCutoff'];

export const verifiedProof = (value: unknown): HomeworkResultAuthority | null => {
  const receipt = record(value);
  if (!receipt || Object.keys(receipt).length !== keys.length || !keys.every(key => Object.hasOwn(receipt, key))
    || receipt.schemaVersion !== 2 || receipt.contextType !== 'homework'
    || !['resultId', 'studentId', 'ownerTeacherId', 'homeworkId', 'homeworkSubmissionId', 'testId'].every(key => typeof receipt[key] === 'string' && ID.test(String(receipt[key])))
    || !['writingSubmittedAt', 'homeworkSubmittedAt', 'submittedAt'].every(key => timestamp(receipt[key]))
    || receipt.submittedAt !== receipt.writingSubmittedAt
    || typeof receipt.sourceRulesetName !== 'string' || !/^projects\/[^/]+\/rulesets\/[^/]+$/u.test(receipt.sourceRulesetName)) return null;
  try { time(receipt.sourceRulesCutoff); } catch { return null; }
  return receipt as unknown as HomeworkResultAuthority;
};

export const sameCanonicalIdentity = (result: Record<string, unknown>, authority: HomeworkResultAuthority): boolean => {
  const context = record(result.context);
  const source = record(context?.source);
  return result.resultId === authority.resultId && result.studentId === authority.studentId
    && result.testId === authority.testId && result.testType === 'homework' && result.testSkill === 'writing'
    && result.isGuest === false && result.submittedAt === authority.submittedAt && result.createdAt === authority.writingSubmittedAt
    && record(result.writingData)?.submissionId === authority.resultId
    && context?.type === 'homework' && source?.type === 'homework'
    && source.id === authority.homeworkId && source.submissionId === authority.resultId
    && record(context.assignment)?.homeworkId === authority.homeworkId
    && ![result.sessionCode, result.classId, result.courseId, result.moduleId,
      context.sessionCode, context.classId, context.courseId, source.classId, source.courseId].some(Boolean);
};

type Document = { name: unknown; createTime: unknown; data: Record<string, unknown> };
type Database = { read(path: string): Promise<unknown>; create(path: string, value: HomeworkResultAuthority): Promise<boolean> };
export async function verifyHomeworkResultAuthority(input: {
  resultId: string; actorUid: string;
  env: { FIREBASE_PROJECT_ID: string; RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME?: string; RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF?: string;
    NOTIFICATION_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> } };
  readSource(collection: string, id: string, mask: string[]): Promise<Document>;
  database(): Promise<Database>;
  now?: () => number;
}): Promise<'created' | 'replayed'> {
  const { env, resultId, actorUid } = input;
  if (!ID.test(resultId) || !ID.test(actorUid)) return deny();
  // Config stays absent until the exact source identity/owner seals are verified.
  // No per-request release lookup; rollback requires disabling this operation.
  const ruleset = env.RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME;
  const cutoff = env.RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF;
  if (!ruleset?.startsWith(`projects/${env.FIREBASE_PROJECT_ID}/rulesets/`) || !/^projects\/[^/]+\/rulesets\/[^/]+$/u.test(ruleset) || !cutoff)
    throw Error('authority_unavailable');
  const cutover = time(cutoff);
  // actorUid is Firebase-JWT-verified by the DO route. Meter every authenticated
  // candidate, including missing/unrelated sources, before any Firestore GET.
  if (!env.NOTIFICATION_RATE_LIMITER?.limit) throw Error('authority_unavailable');
  if (!(await env.NOTIFICATION_RATE_LIMITER.limit({ key: `homework-result-authority:${actorUid}` })).success)
    throw Error('authority_rate_limited');
  const writingDoc = await input.readSource('writing_submissions', resultId,
    ['id', 'studentId', 'submittedAt', 'context.type', 'context.homeworkId', 'context.homeworkSubmissionId',
      'context.assigningTeacherId', 'context.externalImport', 'context.classId', 'context.courseId',
      'context.sessionCode', 'context.selectedTeacherId', 'testMeta.testId']);
  const writing = writingDoc.data;
  const context = record(writing.context);
  const studentId = writing.studentId;
  const homeworkId = context?.homeworkId;
  const homeworkSubmissionId = context?.homeworkSubmissionId;
  const testId = record(writing.testMeta)?.testId;
  const teacherId = context?.assigningTeacherId;
  if (writing.id !== resultId || context?.type !== 'homework' || !timestamp(writing.submittedAt)
    || ![studentId, homeworkId, homeworkSubmissionId, testId, teacherId].every(id => typeof id === 'string' && ID.test(id))
    || [context.externalImport, context.classId, context.courseId, context.sessionCode, context.selectedTeacherId].some(Boolean)
    || (actorUid !== studentId && actorUid !== teacherId)) return deny();
  const [assignmentDoc, homeworkDoc] = await Promise.all([
    input.readSource('homework_assignments', String(homeworkId), ['id', 'createdBy', 'target', 'contentRef', 'materialId', 'materialSkill']),
    input.readSource('homework_submissions', String(homeworkSubmissionId), ['id', 'studentId', 'teacherId', 'homeworkId', 'resultId', 'submittedAt', 'status', 'administrativeImport']),
  ]);
  const assignment = assignmentDoc.data;
  const target = record(assignment.target);
  const content = record(assignment.contentRef);
  const homework = homeworkDoc.data;
  if (assignment.id !== homeworkId || assignment.createdBy !== teacherId
    || target?.type !== 'students' || !Array.isArray(target.studentIds) || !target.studentIds.includes(studentId)
    || assignment.materialSkill !== 'writing' || assignment.materialId !== testId
    || content?.contentKind !== 'ielts_writing' || content.contentId !== testId
    || homework.id !== homeworkSubmissionId || homework.homeworkId !== homeworkId || homework.studentId !== studentId
    || homework.teacherId !== teacherId || homework.resultId !== resultId || !timestamp(homework.submittedAt)
    || !['submitted', 'graded'].includes(String(homework.status)) || homework.administrativeImport) return deny();
  for (const [collection, id, document] of [['writing_submissions', resultId, writingDoc],
    ['homework_assignments', homeworkId, assignmentDoc], ['homework_submissions', homeworkSubmissionId, homeworkDoc]] as const) {
    if (document.name !== `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}`
      || time(document.createTime) <= cutover) return deny();
  }
  const requestTime = (input.now ?? Date.now)();
  if (!timestamp(requestTime)) throw Error('authority_unavailable');
  const requestNs = BigInt(requestTime) * 1_000_000n;
  const writingNs = BigInt(writing.submittedAt) * 1_000_000n;
  const homeworkNs = BigInt(homework.submittedAt) * 1_000_000n;
  const writingCreatedNs = time(writingDoc.createTime);
  // Writing is created on submission; the homework attempt is created earlier
  // in progress and may be finalized after reload. Bound its occurrence to that
  // creation and the saved Writing occurrence, rather than requiring equal times.
  if (writingNs <= cutover || writingNs > requestNs
    || writingNs < writingCreatedNs - OCCURRENCE_CLOCK_SKEW_NS
    || writingNs > writingCreatedNs + OCCURRENCE_CLOCK_SKEW_NS
    || homeworkNs < writingNs || homeworkNs > requestNs
    || homeworkNs < time(homeworkDoc.createTime) - OCCURRENCE_CLOCK_SKEW_NS) return deny();
  const authority: HomeworkResultAuthority = { schemaVersion: 2, resultId, studentId: String(studentId), ownerTeacherId: String(teacherId),
    contextType: 'homework', homeworkId: String(homeworkId), homeworkSubmissionId: String(homeworkSubmissionId), testId: String(testId),
    writingSubmittedAt: writing.submittedAt, homeworkSubmittedAt: homework.submittedAt, submittedAt: writing.submittedAt,
    sourceRulesetName: ruleset, sourceRulesCutoff: cutoff };
  const database = await input.database();
  // Read only identity leaves; never fetch the essay, grade or result payload.
  const identityPaths = ['resultId', 'studentId', 'testId', 'testType', 'testSkill', 'isGuest', 'submittedAt', 'createdAt',
    'writingData/submissionId', 'context/type', 'context/source/type', 'context/source/id', 'context/source/submissionId',
    'context/assignment/homeworkId', 'sessionCode', 'classId', 'courseId', 'moduleId', 'context/sessionCode',
    'context/classId', 'context/courseId', 'context/source/classId', 'context/source/courseId'];
  const paths = identityPaths.map(path => `test_results/${resultId}/${path}`);
  paths.push(`users/${studentId}/role`, `users/${teacherId}/role`, 'system_flags/restore_in_progress');
  const values: unknown[] = [];
  for (let index = 0; index < paths.length; index += 3) values.push(...await Promise.all(paths.slice(index, index + 3).map(path => database.read(path))));
  const result: Record<string, unknown> = {};
  identityPaths.forEach((path, index) => {
    const segments = path.split('/');
    let parent = result;
    for (const segment of segments.slice(0, -1)) parent = (parent[segment] ??= {}) as Record<string, unknown>;
    parent[segments.at(-1)!] = values[index];
  });
  if (!sameCanonicalIdentity(result, authority) || values.at(-3) !== 'student' || values.at(-2) !== 'teacher') return deny();
  if (values.at(-1) === true) throw Error('authority_unavailable');
  const receiptPath = `result_notification_authority/${resultId}`;
  if (await database.create(receiptPath, authority)) return 'created';
  const prior = verifiedProof(await database.read(receiptPath));
  if (!prior || keys.some(key => prior[key as keyof HomeworkResultAuthority] !== authority[key as keyof HomeworkResultAuthority])) throw Error('authority_conflict');
  return 'replayed';
}
