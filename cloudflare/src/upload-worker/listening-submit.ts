import { markTest, type StudentAnswer } from '../../../src/services/autoMarking.service.ts';
import { calculateIELTSListeningBandScore } from '../../../src/config/scoring.config.ts';
import { deriveIeltsPassageResults } from '../../../src/services/ieltsPassageResults.service.ts';
import type { ListeningPublishedVersionRecord } from '../../../functions/src/listening-authoring/repository.shared.ts';
import {
  authorizeListeningHomework,
  readListeningDatabaseValue,
  readListeningAuthoritativeVersionId,
  ListeningDeliveryWorkerError,
  type ListeningDeliveryWorkerEnv,
} from './listening-delivery.ts';
import {
  FirebaseRtdbRestClient,
  getFirebaseServiceAccountAccessToken,
  type FirebaseRtdbQuery,
} from './listening-authoring/rtdb.ts';
import { buildListeningStudentSafeDocument } from './listening-authoring/published-material.ts';
import { readListeningCourseAccess } from './listening-course-access.ts';

type Data = Record<string, any>;
type Mode = 'homework' | 'self_study' | 'course_material' | 'live';
type Answer = StudentAnswer['answer'];

export interface ListeningSubmitRequest {
  mode: Mode;
  testId: string;
  versionId: string;
  operationId: string;
  answers?: Record<string, Answer>;
  homeworkId?: string;
  submissionId?: string;
  courseId?: string;
  moduleId?: string;
  sessionCode?: string;
  assignmentId?: string;
  studentId?: string;
  timeElapsed?: number;
  integrity?: Data;
  attemptsNullified?: boolean;
}

export interface ListeningLivePin {
  testId: string;
  versionId: string;
  startTime: number;
  runId: string;
  operationId: string;
}

export interface ListeningSubmitRepository {
  read(path: string, query?: FirebaseRtdbQuery): Promise<any>;
  readWithEtag(path: string): Promise<{ data: any; etag: string }>;
  createIfUnchanged(path: string, value: unknown, etag: string): Promise<boolean>;
  update(updates: Record<string, unknown>): Promise<void>;
  readHomework(path: string): Promise<FirestoreDocument>;
  readHomeworkAttempts(homeworkId: string, studentId: string): Promise<Data[]>;
  createHomeworkAttempt(submission: Data, homework: FirestoreDocument): Promise<boolean>;
  completeHomework(input: { request: ListeningSubmitRequest; result: Data; homework: Data }): Promise<void>;
}

type Input = { request: Request; env: ListeningDeliveryWorkerEnv; uid: string; now: () => number };
const record = (value: unknown): value is Data => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code: string, status = 403): never => { throw new ListeningDeliveryWorkerError(code, status); };
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const key = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value || value.length > 256 || /[.#$\[\]\/\u0000-\u001f\u007f]/u.test(value)) {
    fail(`listening_${field}_invalid`, 400);
  }
  return value as string;
};
const profileAllowed = (profile: unknown): profile is Data => record(profile)
  && ['student', 'teacher', 'super_admin'].includes(profile.role)
  && profile.disabled !== true && profile.forceReauth !== true
  && !['blocked', 'inactive', 'suspended'].includes(profile.status);
const owner = (session: Data): string => session.createdByUserId || session.createdBy || session.teacherId || '';
const hash = async (value: string): Promise<string> => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
), byte => byte.toString(16).padStart(2, '0')).join('');

async function body(request: Request): Promise<Data> {
  if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) fail('listening_json_required', 400);
  if (Number(request.headers.get('Content-Length')) > 512 * 1024) fail('listening_payload_too_large', 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 512 * 1024) fail('listening_payload_too_large', 413);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { fail('listening_invalid_json', 400); }
  if (!record(parsed)) fail('listening_request_invalid', 400);
  return parsed as Data;
}

function parseRequest(value: Data): ListeningSubmitRequest {
  const allowed = ['mode', 'testId', 'versionId', 'operationId', 'answers', 'homeworkId', 'submissionId', 'courseId',
    'moduleId', 'sessionCode', 'assignmentId', 'studentId', 'timeElapsed', 'integrity', 'attemptsNullified'];
  if (Object.keys(value).some(field => !allowed.includes(field))) fail('listening_browser_authority', 400);
  if (!['homework', 'self_study', 'course_material', 'live'].includes(value.mode)) fail('listening_mode_invalid', 400);
  for (const field of ['testId', 'versionId', 'operationId']) key(value[field], field);
  for (const field of ['homeworkId', 'submissionId', 'courseId', 'moduleId', 'sessionCode', 'assignmentId', 'studentId']) {
    if (value[field] !== undefined) key(value[field], field);
  }
  if (value.assignmentId && value.mode !== 'live') fail('listening_scope_invalid', 400);
  if (value.mode === 'homework') {
    key(value.homeworkId, 'homeworkId'); key(value.submissionId, 'submissionId');
    if (value.courseId || value.moduleId || value.sessionCode || value.studentId) fail('listening_scope_invalid', 400);
  } else if (value.mode === 'course_material') {
    key(value.courseId, 'courseId'); key(value.moduleId, 'moduleId');
    if (value.homeworkId || value.submissionId || value.sessionCode || value.studentId) fail('listening_scope_invalid', 400);
  } else if (value.mode === 'live') {
    key(value.sessionCode, 'sessionCode');
    if (value.homeworkId || value.submissionId || value.courseId || value.moduleId) fail('listening_scope_invalid', 400);
  } else if (value.homeworkId || value.submissionId || value.courseId || value.moduleId || value.sessionCode || value.studentId) {
    fail('listening_scope_invalid', 400);
  }
  if (value.timeElapsed !== undefined && (typeof value.timeElapsed !== 'number' || !Number.isFinite(value.timeElapsed)
    || value.timeElapsed < 0 || value.timeElapsed > 7 * 86400)) fail('listening_time_invalid', 400);
  if (value.integrity !== undefined && !record(value.integrity)) fail('listening_integrity_invalid', 400);
  if (value.attemptsNullified !== undefined && typeof value.attemptsNullified !== 'boolean') fail('listening_integrity_invalid', 400);
  return value as ListeningSubmitRequest;
}

function answersFor(answers: unknown, questions: readonly Data[], stored = false): Record<number, StudentAnswer> {
  if (!record(answers) || Object.keys(answers).length > questions.length) fail('listening_answers_invalid', 400);
  const numbers = new Set(questions.map(question => String(question.number)));
  return Object.fromEntries(Object.entries(answers).map(([number, raw]) => {
    if (!numbers.has(number)) fail('listening_question_invalid', 400);
    const answer = stored && record(raw) && 'answer' in raw ? raw.answer : raw;
    const text = (entry: unknown) => typeof entry === 'string' && entry.length <= 4096;
    if (!(text(answer) || (Array.isArray(answer) && answer.length <= 100 && answer.every(text))
      || (record(answer) && Object.keys(answer).length <= 100
        && Object.entries(answer).every(([field, entry]) => field.length <= 100 && text(entry))))) {
      fail('listening_answer_invalid', 400);
    }
    return [number, { questionId: number, questionNumber: Number(number), answer }];
  }));
}

async function versionFor(repository: ListeningSubmitRepository, testId: string, versionId: string): Promise<ListeningPublishedVersionRecord> {
  const version = await repository.read(`listening_authoring/versions/${versionId}`);
  if (!record(version) || version.recordType !== 'published-version' || version.testId !== testId || version.versionId !== versionId
    || typeof version.ownerId !== 'string' || !record(version.document) || version.document.skill !== 'Listening'
    || !Array.isArray(version.document.questions) || !version.document.questions.length
    || !record(version.archive) || !['active', 'archived'].includes(version.archive.state)) fail('listening_version_unavailable', 404);
  const numbers = version.document.questions.map((question: Data) => question.number);
  if (numbers.some((number: unknown) => !Number.isSafeInteger(number) || Number(number) < 1)
    || new Set(numbers).size !== numbers.length) fail('listening_version_invalid', 500);
  return version as unknown as ListeningPublishedVersionRecord;
}

async function assertWritable(repository: ListeningSubmitRepository, uid: string): Promise<Data> {
  const [profile, restoring] = await Promise.all([repository.read(`users/${uid}`), repository.read('system_flags/restore_in_progress')]);
  if (!profileAllowed(profile)) fail('listening_profile_required');
  if (restoring === true || (record(restoring) && restoring.active === true)) fail('restore_in_progress', 503);
  return profile;
}

async function liveSession(repository: ListeningSubmitRepository, request: ListeningSubmitRequest, uid: string, profile: Data, now: number) {
  const session = await repository.read(`game_sessions/${request.sessionCode}`);
  if (!record(session) || session.testId !== request.testId || session.status !== 'in-progress'
    || typeof session.expiresAt !== 'number' || session.expiresAt <= now) fail('listening_session_inactive');
  const pin = session.listeningTestPin;
  if (!record(pin) || pin.testId !== request.testId || pin.versionId !== request.versionId
    || typeof pin.runId !== 'string' || typeof pin.startTime !== 'number') fail('listening_session_version_mismatch');
  const studentId = request.studentId ?? uid;
  const teacher = owner(session) === uid && ['teacher', 'super_admin'].includes(profile.role);
  if (request.studentId && !teacher) fail('listening_teacher_required');
  if (record(session.bannedPlayers) && Object.prototype.hasOwnProperty.call(session.bannedPlayers, studentId)) fail('listening_student_banned');
  const player = record(session.players) ? session.players[studentId] : undefined;
  if (!record(player)) fail('listening_participant_required');
  if (!teacher && (studentId !== uid || profile.role !== 'student')) fail('listening_student_required');
  return { session, pin, studentId, player, teacher };
}

async function courseContext(repository: ListeningSubmitRepository, request: ListeningSubmitRequest, studentId: string, now: number, versionOwnerId: string) {
  const access = await readListeningCourseAccess(repository.read, request, studentId, versionOwnerId, now);
  if (!access) fail('listening_course_not_authorized');
  const { course } = access;
  const [materialSettings, moduleSettings] = await Promise.all([
    repository.read(`courses/${request.courseId}/modules/${request.moduleId}/materials/${request.testId}/practiceSettings`),
    repository.read(`courses/${request.courseId}/modules/${request.moduleId}/practiceSettings`),
  ]);
  const levels = [materialSettings, moduleSettings, course.practiceSettings];
  const resolve = (field: string) => levels.find(settings => record(settings)
    && settings[field] !== undefined && settings[field] !== 'default')?.[field] ?? null;
  const maxAttempts = resolve('maxAttempts');
  const minPassingScore = resolve('minPassingScore');
  if ((maxAttempts !== null && (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1))
    || (minPassingScore !== null && (typeof minPassingScore !== 'number' || !Number.isFinite(minPassingScore)
      || minPassingScore < 0 || minPassingScore > 100))) fail('listening_course_settings_invalid', 500);
  return { course, maxAttempts, minPassingScore };
}

function buildResult(input: {
  request: ListeningSubmitRequest; resultId: string; studentId: string; studentName: string;
  version: ListeningPublishedVersionRecord; answers: Record<number, StudentAnswer>; now: number;
  homework?: Data; course?: Data; session?: Data; pin?: Data; teacherSubmit?: boolean;
}): Data {
  const { request, version, now, studentId, resultId } = input;
  const document = version.document;
  const marked = markTest([...document.questions] as any, input.answers);
  const elapsed = input.session ? Math.max(0, Math.floor((now - Number(input.session.startTime)) / 1000)) : request.timeElapsed ?? 0;
  const sessionCode = request.mode === 'live' ? request.sessionCode! : request.mode === 'homework'
    ? `homework_practice_${request.submissionId}` : request.operationId;
  const classId = input.session?.linkedClassId ?? input.session?.classId ?? null;
  const courseId = input.session?.courseId ?? request.courseId ?? null;
  const moduleId = input.session?.moduleId ?? request.moduleId ?? null;
  const teacherId = input.homework?.createdBy ?? input.course?.ownerId ?? (input.session ? owner(input.session) : null);
  const contextType = request.mode === 'live' ? 'class_session' : request.mode;
  const sourceType = request.mode === 'live' ? 'class' : request.mode === 'homework' ? 'homework' : request.mode === 'course_material' ? 'course' : 'library';
  const sourceId = request.homeworkId ?? request.sessionCode ?? request.courseId ?? request.testId;
  const sourceName = input.homework?.title ?? input.course?.name ?? document.title;
  const passageResults = deriveIeltsPassageResults(document.questions.map(question => ({
    questionNumber: question.number, sectionId: String(question.sectionNumber), sectionName: `Part ${question.sectionNumber}`,
  })), marked.questionResults);
  return clean({
    resultId, sessionCode, testId: request.testId, studentId, studentName: input.studentName,
    deliveryEngine: 'listening', materialVersionId: request.versionId,
    listeningContext: { mode: request.mode, versionId: request.versionId, homeworkId: request.homeworkId,
      submissionId: request.submissionId, courseId: request.courseId, moduleId: request.moduleId,
      sessionCode: request.sessionCode, runId: input.pin?.runId, assignmentId: request.assignmentId },
    submissionOperationId: resultId,
    totalScore: marked.totalScore, maxScore: marked.maxScore, percentage: marked.percentage,
    bandScore: calculateIELTSListeningBandScore(marked.summary.correct, document.questions.length),
    questionResults: marked.questionResults,
    correct: marked.summary.correct, incorrect: marked.summary.incorrect, partialCredit: marked.summary.partialCredit,
    totalQuestions: document.questions.length, submittedAt: now, createdAt: now,
    timeElapsed: elapsed, testDuration: document.duration, testTitle: document.title, testType: document.type, testSkill: 'Listening',
    markingStatus: 'auto-marked', isGuest: false, teacherId: teacherId ?? undefined, courseId, classId, moduleId,
    listeningResultReviewAudio: document.audioSections[0] ? { audioUrl: document.audioSections[0].audioUrl,
      assetId: document.audioSections[0].assetId, versionId: version.versionId } : undefined,
    context: { type: contextType, source: { type: sourceType, id: sourceId, name: sourceName,
      submissionId: request.submissionId, sessionCode: request.sessionCode, classId: classId ?? undefined, courseId: courseId ?? undefined },
      sessionCode: request.sessionCode, classId: classId ?? undefined, courseId: courseId ?? undefined,
      assignment: request.homeworkId ? { homeworkId: request.homeworkId, attemptNumber: 1 }
        : request.assignmentId ? { assignmentId: request.assignmentId } : undefined,
      configApplied: { timerMinutes: document.duration, feedbackTiming: 'after_completion', source: input.homework ? 'teacher_override' : 'material_default' } },
    visibility: { contextType: request.mode === 'self_study' ? 'solo_practice' : contextType,
      sourceType: request.mode === 'live' ? 'session' : request.mode === 'self_study' ? 'solo_practice' : sourceType,
      sourceId, sourceNameSnapshot: sourceName, visibilityOwnerTeacherId: teacherId, ownershipResolved: true, unresolvedReason: null,
      ownerResolutionSource: input.homework ? 'homework.createdBy' : input.course ? 'course.ownerId' : input.session
        ? input.session.createdByUserId ? 'session.createdByUserId' : 'session.createdBy' : 'solo_practice',
      homeworkId: request.homeworkId ?? null, sessionCode: request.sessionCode ?? null, courseId, classId, assignmentId: request.assignmentId ?? null },
    ieltsData: passageResults.length ? { passageResults } : undefined,
    feedbackGenerationMeta: { kind: 'ielts-listening', lastAttemptAt: null, lastTriggerSource: null, lastOutcome: null, lastError: null },
    listeningIntegrity: request.integrity, listeningAttemptsNullified: request.attemptsNullified,
    submittedBy: input.teacherSubmit ? 'teacher-end' : 'student',
  });
}

function indexUpdates(result: Data): Record<string, unknown> {
  const studentIndex = { resultId: result.resultId, sessionCode: result.sessionCode, testId: result.testId,
    percentage: result.percentage, submittedAt: result.submittedAt };
  const updates: Record<string, unknown> = { [`test_results_by_student/${result.studentId}/${result.resultId}`]: studentIndex };
  if (result.listeningContext.mode !== 'homework') updates[`test_results_by_session/${result.sessionCode}/${result.resultId}`] = {
    resultId: result.resultId, studentId: result.studentId, studentName: result.studentName, percentage: result.percentage, submittedAt: result.submittedAt,
  };
  if (result.listeningContext.mode === 'self_study') updates[`test_results_solo_practice_by_student/${result.studentId}/${result.resultId}`] = studentIndex;
  if (result.teacherId) updates[`teacher_result_keys/${result.teacherId}/${result.resultId}`] = true;
  const scoped = { resultId: result.resultId, studentId: result.studentId, studentName: result.studentName,
    percentage: result.percentage, bandScore: result.bandScore, testTitle: result.testTitle, testSkill: result.testSkill, submittedAt: result.submittedAt };
  if (result.courseId) updates[`test_results_by_course/${result.courseId}/${result.studentId}/${result.resultId}`] = { ...scoped, moduleId: result.moduleId };
  if (result.classId) updates[`test_results_by_class/${result.classId}/${result.studentId}/${result.resultId}`] = { ...scoped, courseId: result.courseId };
  return updates;
}

function responseFor(result: Data) {
  return { resultId: result.resultId, correctAnswers: result.correct, totalQuestions: result.totalQuestions,
    totalScore: result.totalScore, maxScore: result.maxScore, percentage: result.percentage, bandScore: result.bandScore,
    questionResults: Object.fromEntries(result.questionResults.map((question: Data) => [question.questionNumber, question.isCorrect])) };
}

async function submit(input: Input, repository: ListeningSubmitRepository) {
  const request = parseRequest(await body(input.request));
  const now = input.now();
  const profile = await assertWritable(repository, input.uid);
  const version = await versionFor(repository, request.testId, request.versionId);
  const live = request.mode === 'live' ? await liveSession(repository, request, input.uid, profile, now) : undefined;
  const studentId = live?.studentId ?? input.uid;
  if (!live && profile.role !== 'student') fail('listening_student_required');
  const resultId = `listening_result_${await hash(JSON.stringify([request.mode, studentId, request.testId, request.versionId,
    request.homeworkId ?? '', request.submissionId ?? '', request.courseId ?? '', request.moduleId ?? '',
    request.sessionCode ?? '', live?.pin.runId ?? (request.mode === 'homework' ? '' : request.operationId)]))}`;
  const prior = await repository.readWithEtag(`test_results/${resultId}`);
  let assignmentProgress: Data | undefined;
  let assignmentProgressPath: string | undefined;
  if (live) {
    request.assignmentId ??= prior.data?.listeningContext?.assignmentId;
    if (request.assignmentId) {
      const classId = key(live.session.linkedClassId ?? live.session.classId, 'classId');
      const classroom = await repository.read(`classes/${classId}`);
      const assignment = classroom?.assignments?.[request.assignmentId];
      const membership = classroom?.students?.[studentId];
      if (!record(classroom) || classroom.status !== 'active' || classroom.createdBy !== owner(live.session)
        || !record(membership) || membership.status !== 'active' || !record(assignment)
        || ![request.testId, request.sessionCode].includes(assignment.testId)) fail('listening_assignment_not_authorized');
      assignmentProgressPath = `classes/${classId}/students/${studentId}/assignments/${request.assignmentId}`;
      assignmentProgress = record(membership.assignments?.[request.assignmentId]) ? membership.assignments[request.assignmentId] : {};
    }
  }
  const homework = request.mode === 'homework' ? await authorizeListeningHomework({
    env: { ...input.env, readDatabaseValue: path => repository.read(path) },
    scope: { testId: request.testId, versionId: request.versionId, studentId, mode: 'homework', homeworkId: request.homeworkId, submissionId: request.submissionId },
    authorization: input.request.headers.get('Authorization'), now,
    existingResultId: record(prior.data) ? resultId : undefined,
    existingSubmittedAt: record(prior.data) ? prior.data.submittedAt : undefined,
  }) : undefined;
  const course = request.mode === 'course_material' ? await courseContext(repository, request, studentId, now, version.ownerId) : undefined;
  if (!prior.data && course && course.maxAttempts !== null) {
    const results = await repository.read('test_results', { orderBy: 'studentId', equalTo: studentId });
    // shortcut: concurrent attempts can pass this count together; add reservations if strict quotas are needed.
    if (record(results) && Object.values(results).filter(entry => record(entry)
      && entry.studentId === studentId && entry.testId === request.testId).length >= course.maxAttempts) {
      fail('listening_max_attempts_reached', 409);
    }
  }
  if ((request.mode === 'self_study' && (version.document.isPublic !== true || version.archive.state !== 'active'))
    || (request.mode === 'course_material' && version.archive.state !== 'active')) fail('listening_version_not_public');
  const studentProfile = live?.teacher ? await repository.read(`users/${studentId}`) : profile;
  if (!profileAllowed(studentProfile) || studentProfile.role !== 'student') fail('listening_student_required');
  const answers = answersFor(live?.teacher ? live.player.answers ?? {} : request.answers ?? {}, version.document.questions, !!live?.teacher);
  const proposed = buildResult({ request, resultId, studentId,
    studentName: studentProfile.displayName || studentProfile.name || live?.player.name || live?.player.playerName || 'Student',
    version, answers, now, homework: homework?.homework, course: course?.course, session: live?.session, pin: live?.pin, teacherSubmit: live?.teacher });
  let result = prior.data;
  if (!result) {
    result = await repository.createIfUnchanged(`test_results/${resultId}`, proposed, prior.etag)
      ? proposed : await repository.read(`test_results/${resultId}`);
  }
  if (!record(result) || result.deliveryEngine !== 'listening' || result.resultId !== resultId || result.studentId !== studentId
    || result.testId !== request.testId || result.materialVersionId !== request.versionId
    || !record(result.listeningContext)
    || Object.keys(result.listeningContext).length !== Object.keys(proposed.listeningContext).length
    || Object.entries(proposed.listeningContext).some(([field, value]) => result.listeningContext[field] !== value)) {
    fail('listening_result_conflict', 409);
  }
  if (homework) await repository.completeHomework({ request, result, homework: homework.homework });
  const updates = indexUpdates(result);
  if (assignmentProgressPath && assignmentProgress) {
    const progress = { testAssignmentId: request.assignmentId, attemptNumber: assignmentProgress.attemptNumber || 1,
      status: assignmentProgress.status === 'graded' ? 'graded' : 'submitted', submittedAt: result.submittedAt,
      resultId: result.resultId, score: result.totalScore, maxScore: result.maxScore, percentage: result.percentage,
      bandScore: result.bandScore, timeSpent: result.timeElapsed };
    for (const [field, value] of Object.entries(progress)) updates[`${assignmentProgressPath}/${field}`] = value;
  }
  if (homework) updates[`result_notification_authority/${resultId}`] = {
    schemaVersion: 4, materialType: 'test', testSkill: 'Listening', contextType: 'homework', resultId, studentId,
    testId: request.testId, versionId: request.versionId, ownerTeacherId: result.teacherId,
    homeworkId: request.homeworkId, homeworkSubmissionId: request.submissionId,
    createdAt: result.createdAt, submittedAt: result.submittedAt, homeworkSubmittedAt: result.submittedAt,
  };
  if (course && course.minPassingScore !== null && result.percentage >= course.minPassingScore) {
    updates[`course_progress/${studentId}/${request.courseId}/materials/${request.testId}`] = {
      completed: true, score: result.percentage, resultId, completedAt: result.submittedAt,
    };
  }
  await repository.update(clean(updates));
  if (live) {
    const totals = { answers: Object.fromEntries(result.questionResults.map((question: Data) => [String(question.questionNumber),
      { answer: question.studentAnswer, timestamp: result.submittedAt }])),
      submittedAt: result.submittedAt, timeSpent: result.timeElapsed, correctCount: result.correct,
      totalQuestions: result.totalQuestions, percentage: result.percentage, bandScore: result.bandScore,
      score: result.totalScore, maxScore: result.maxScore, isSubmitted: true, hasCompletedTest: true,
      completedAt: result.submittedAt, submittedBy: result.submittedBy, resultId, latestResultId: resultId, lastResultPersistedAt: result.submittedAt,
      ...(result.listeningIntegrity ? { integrity: result.listeningIntegrity } : {}) };
    for (let attempt = 0; attempt < 3; attempt++) {
      const snapshot = await repository.readWithEtag(`game_sessions/${request.sessionCode}`);
      const current = snapshot.data;
      if (!record(current) || current.status !== 'in-progress' || current.listeningTestPin?.runId !== live.pin.runId
        || current.expiresAt <= input.now() || !record(current.players?.[studentId])
        || Object.prototype.hasOwnProperty.call(current.bannedPlayers ?? {}, studentId)) fail('listening_session_changed', 409);
      if (await repository.createIfUnchanged(`game_sessions/${request.sessionCode}`, { ...current, players: {
        ...current.players, [studentId]: { ...current.players[studentId], ...totals },
      } }, snapshot.etag)) break;
      if (attempt === 2) fail('listening_session_changed', 409);
    }
  }
  return responseFor(result);
}

async function startHomework(input: Input, repository: ListeningSubmitRepository) {
  const request = await body(input.request);
  if (Object.keys(request).some(field => !['homeworkId', 'operationId'].includes(field))) fail('listening_browser_authority', 400);
  key(request.homeworkId, 'homeworkId'); key(request.operationId, 'operationId');
  const profile = await assertWritable(repository, input.uid);
  if (profile.role !== 'student') fail('listening_student_required');
  const submissionId = `listening_attempt_${await hash(JSON.stringify([request.homeworkId, input.uid, request.operationId]))}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const [homework, attempts] = await Promise.all([
      repository.readHomework(`homework_assignments/${request.homeworkId}`),
      repository.readHomeworkAttempts(request.homeworkId, input.uid),
    ]);
    const assignment = homework.data;
    const testId = key(assignment.materialId, 'testId');
    const completed = attempts.filter(value => ['submitted', 'graded'].includes(value.status));
    const existing = attempts.find(value => value.id === submissionId) ?? attempts.find(value => value.status === 'in_progress');
    if (attempts.some(value => value.attemptsNullified === true)) fail('listening_max_attempts_reached', 409);
    const maximum = assignment.config?.maxAttempts;
    if (!existing && maximum !== null && maximum !== undefined) {
      if (!Number.isSafeInteger(maximum) || maximum < 1) fail('listening_homework_settings_invalid', 500);
      if (completed.length >= maximum) fail('listening_max_attempts_reached', 409);
    }
    const current = existing ? null : await repository.read(`tests/${testId}`);
    const versionId = key(existing?.listeningVersionId ?? (existing ? assignment.contentRef?.version
      : record(current) ? readListeningAuthoritativeVersionId(current) : undefined), 'versionId');
    const version = await versionFor(repository, testId, versionId);
    if (!existing && (version.archive.state !== 'active' || !record(current) || version.ownerId !== current.ownerId)) {
      fail('listening_version_not_authorized');
    }
    const now = input.now();
    const dueDate = assignment.studentOverrides?.[input.uid]?.dueDate ?? assignment.scheduling?.dueDate;
    const submission = existing ?? clean({ id: submissionId, homeworkId: request.homeworkId, studentId: input.uid,
      studentName: profile.displayName || profile.name || 'Student', teacherId: assignment.createdBy,
      attemptNumber: completed.length + 1, startedAt: now, isLate: now > Number(dueDate), status: 'in_progress', listeningVersionId: versionId });
    await authorizeListeningHomework({
      env: { ...input.env, readDatabaseValue: path => repository.read(path),
        readListeningHomeworkDocument: async path => path === `homework_assignments/${request.homeworkId}` ? assignment : submission },
      scope: { mode: 'homework', testId, versionId, studentId: input.uid, homeworkId: request.homeworkId, submissionId: submission.id },
      authorization: input.request.headers.get('Authorization'), now, startingSubmission: submission,
      existingResultId: existing?.resultId, existingSubmittedAt: existing?.submittedAt,
    });
    if (existing || await repository.createHomeworkAttempt(submission, homework)) return { submission };
  }
  return fail('listening_homework_changed', 409);
}

async function pinLive(input: Input, repository: ListeningSubmitRepository): Promise<ListeningLivePin> {
  const request = await body(input.request);
  if (Object.keys(request).some(field => !['sessionCode', 'testId', 'versionId', 'operationId'].includes(field))) fail('listening_browser_authority', 400);
  for (const field of ['sessionCode', 'testId', 'versionId', 'operationId']) key(request[field], field);
  const profile = await assertWritable(repository, input.uid);
  if (!['teacher', 'super_admin'].includes(profile.role)) fail('listening_teacher_required');
  const version = await versionFor(repository, request.testId, request.versionId);
  const current = await repository.read(`tests/${request.testId}`);
  if (!record(current) || readListeningAuthoritativeVersionId(current) !== request.versionId || version.archive.state !== 'active'
    || (version.ownerId !== input.uid && version.document.isPublic !== true)) fail('listening_version_not_authorized');
  const safe = { ...buildListeningStudentSafeDocument(version.document), id: version.testId, ownerId: version.ownerId,
    createdBy: version.publishedBy, createdAt: version.publishedAt, updatedAt: version.publishedAt,
    isPublished: true, versionId: version.versionId, publishedSnapshotVersionId: version.versionId };
  const project = async (pin: ListeningLivePin) => {
    const path = `session_test_payloads/${request.sessionCode}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const payload = await repository.readWithEtag(path);
      const session = await repository.read(`game_sessions/${request.sessionCode}`);
      if (!record(session) || session.testId !== request.testId || session.listeningTestPin?.runId !== pin.runId
        || !['waiting', 'in-progress'].includes(session.status) || session.expiresAt <= input.now()) fail('listening_session_changed', 409);
      if (await repository.createIfUnchanged(path, { testId: request.testId, generatedAt: input.now(), testData: safe }, payload.etag)) return;
    }
    fail('listening_session_changed', 409);
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await repository.readWithEtag(`game_sessions/${request.sessionCode}`);
    const session = snapshot.data;
    if (!record(session) || owner(session) !== input.uid || session.testId !== request.testId
      || !['waiting', 'in-progress'].includes(session.status) || typeof session.expiresAt !== 'number'
      || session.expiresAt <= input.now()) fail('listening_session_not_authorized');
    const existing = session.listeningTestPin;
    if (record(existing)) {
      if (existing.testId !== request.testId || existing.versionId !== request.versionId) fail('listening_session_version_mismatch', 409);
      if (typeof existing.runId !== 'string' || !Number.isFinite(existing.startTime)) fail('listening_pin_invalid', 409);
      await project(existing as ListeningLivePin);
      return existing as ListeningLivePin;
    }
    if (session.status !== 'waiting' || session.startTime) fail('listening_session_already_started', 409);
    const pin = { testId: request.testId, versionId: request.versionId, startTime: input.now(),
      runId: await hash(`${request.sessionCode}|${request.operationId}`), operationId: request.operationId };
    if (await repository.createIfUnchanged(`game_sessions/${request.sessionCode}`, { ...session, listeningTestPin: pin }, snapshot.etag)) {
      await project(pin);
      return pin;
    }
  }
  return fail('listening_session_changed', 409);
}

type FirestoreDocument = { data: Data; updateTime: string };
const decode = (value: Data): unknown => 'stringValue' in value ? value.stringValue : 'booleanValue' in value ? value.booleanValue
  : 'integerValue' in value ? Number(value.integerValue) : 'doubleValue' in value ? Number(value.doubleValue)
    : 'timestampValue' in value ? value.timestampValue : record(value.mapValue) ? decodeFields(value.mapValue.fields)
      : record(value.arrayValue) ? (value.arrayValue.values ?? []).map(decode) : null;
const decodeFields = (fields: Data = {}): Data => Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, decode(value)]));
const encode = (value: any): Data => value === null ? { nullValue: null } : typeof value === 'string' ? { stringValue: value }
  : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'number' ? Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value } : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } }
      : { mapValue: { fields: encodeFields(value) } };
const encodeFields = (data: Data): Data => Object.fromEntries(Object.entries(data).map(([field, value]) => [field, encode(value)]));

function defaultRepository(env: ListeningDeliveryWorkerEnv): ListeningSubmitRepository {
  const client = new FirebaseRtdbRestClient({ env, fetchImpl: globalThis.fetch });
  const documentName = (path: string) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  const firestore = async (path: string, init: RequestInit = {}) => fetch(`https://firestore.googleapis.com/v1/${path}`, {
    ...init, headers: { Authorization: `Bearer ${await getFirebaseServiceAccountAccessToken(env)}`, 'Content-Type': 'application/json' },
  });
  const readDocument = async (path: string): Promise<FirestoreDocument> => {
    const response = await firestore(documentName(path));
    if (!response.ok) fail('listening_homework_read_failed', response.status === 404 ? 404 : 503);
    const value = await response.json() as Data;
    if (!value.updateTime || !record(value.fields)) fail('listening_homework_invalid', 500);
    return { data: decodeFields(value.fields), updateTime: value.updateTime };
  };
  return {
    read: (path, query) => query ? client.readValue(path, query) : readListeningDatabaseValue(env, path),
    readWithEtag: path => client.readWithEtag(path),
    createIfUnchanged: (path, value, etag) => client.writeIfMatch(path, value, etag),
    update: updates => client.patchAdminMultiLocation(updates),
    readHomework: readDocument,
    async readHomeworkAttempts(homeworkId, studentId) {
      const response = await firestore(`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`, {
        method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'homework_submissions' }],
          where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'homeworkId' }, op: 'EQUAL', value: encode(homeworkId) } },
            { fieldFilter: { field: { fieldPath: 'studentId' }, op: 'EQUAL', value: encode(studentId) } },
          ] } } } }),
      });
      if (!response.ok) fail('listening_homework_read_failed', 503);
      const rows = await response.json() as Data[];
      if (!Array.isArray(rows)) fail('listening_homework_invalid', 500);
      return rows.filter(row => record(row.document)).map(row => decodeFields(row.document.fields));
    },
    async createHomeworkAttempt(submission, homework) {
      const stats = { ...(homework.data.stats ?? {}), started: Number(homework.data.stats?.started ?? 0) + 1 };
      const response = await firestore(`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`, {
        method: 'POST', body: JSON.stringify({ writes: [
          { update: { name: documentName(`homework_submissions/${submission.id}`), fields: encodeFields(submission) }, currentDocument: { exists: false } },
          { update: { name: documentName(`homework_assignments/${submission.homeworkId}`), fields: encodeFields({ stats }) },
            updateMask: { fieldPaths: ['stats'] }, currentDocument: { updateTime: homework.updateTime } },
        ] }),
      });
      if (response.ok) return true;
      const error = await response.json().catch(() => null) as Data | null;
      if ([409, 412].includes(response.status) || ['ABORTED', 'FAILED_PRECONDITION', 'ALREADY_EXISTS'].includes(error?.error?.status)) return false;
      return fail('listening_homework_write_failed', 503);
    },
    async completeHomework({ request, result }) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const [submission, assignment] = await Promise.all([
          readDocument(`homework_submissions/${request.submissionId}`), readDocument(`homework_assignments/${request.homeworkId}`),
        ]);
        const current = submission.data;
        if (current.studentId !== result.studentId || current.homeworkId !== request.homeworkId || current.teacherId !== result.teacherId
          || assignment.data.createdBy !== result.teacherId || (current.listeningVersionId ?? assignment.data.contentRef?.version) !== request.versionId
          || assignment.data.materialId !== request.testId) fail('listening_homework_changed', 409);
        if (['submitted', 'graded'].includes(current.status)) {
          if (current.resultId !== result.resultId) fail('listening_homework_already_submitted', 409);
          return;
        }
        if (current.status !== 'in_progress') fail('listening_homework_changed', 409);
        const homework = assignment.data;
        const dueDate = homework.studentOverrides?.[result.studentId]?.dueDate ?? homework.scheduling?.dueDate;
        const isLate = result.submittedAt > Number(dueDate);
        const submissionUpdate = clean({ status: 'submitted', submittedAt: result.submittedAt, resultId: result.resultId,
          score: result.totalScore, maxScore: result.maxScore, percentage: result.percentage, bandScore: result.bandScore,
          timeSpent: result.timeElapsed, isLate, integrity: result.listeningIntegrity,
          ...(result.listeningAttemptsNullified ? { attemptsNullified: true } : {}) });
        const stats = { ...(homework.stats ?? {}), submitted: Number(homework.stats?.submitted ?? 0) + 1,
          lateSubmissions: Number(homework.stats?.lateSubmissions ?? 0) + (isLate ? 1 : 0) };
        if (Number(stats.totalAssigned) > 0) stats.completionRate = Math.round(stats.submitted / Number(stats.totalAssigned) * 100);
        const response = await firestore(`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`, {
          method: 'POST', body: JSON.stringify({ writes: [
            { update: { name: documentName(`homework_submissions/${request.submissionId}`), fields: encodeFields(submissionUpdate) },
              updateMask: { fieldPaths: Object.keys(submissionUpdate) }, currentDocument: { updateTime: submission.updateTime } },
            { update: { name: documentName(`homework_assignments/${request.homeworkId}`), fields: encodeFields({ stats }) },
              updateMask: { fieldPaths: ['stats'] }, currentDocument: { updateTime: assignment.updateTime } },
          ] }),
        });
        if (response.ok) return;
        const error = await response.json().catch(() => null) as Data | null;
        if (![409, 412].includes(response.status) && !['ABORTED', 'FAILED_PRECONDITION'].includes(error?.error?.status)) {
          fail('listening_homework_write_failed', 503);
        }
      }
      fail('listening_homework_changed', 409);
    },
  };
}

export const createListeningSubmitWorkerHandlers = (options: {
  repository?: (env: ListeningDeliveryWorkerEnv) => ListeningSubmitRepository;
} = {}) => {
  const handle = async (input: Input, operation: typeof submit | typeof pinLive | typeof startHomework) => {
    try {
      return { body: await operation(input, (options.repository ?? defaultRepository)(input.env)),
        init: { headers: { 'Cache-Control': 'private, no-store' } } };
    } catch (error) {
      const safe = error instanceof ListeningDeliveryWorkerError ? error : new ListeningDeliveryWorkerError('listening_submit_unavailable', 503);
      if (!(error instanceof ListeningDeliveryWorkerError)) console.error('listening_submit_failed', error instanceof Error ? error.message : 'unknown');
      return { body: { code: safe.code, message: safe.code }, init: { status: safe.statusCode, headers: { 'Cache-Control': 'private, no-store' } } };
    }
  };
  return { submit: (input: Input) => handle(input, submit), livePin: (input: Input) => handle(input, pinLive),
    homeworkStart: (input: Input) => handle(input, startHomework) };
};
