import { createLegacyTestMaterialSummary } from '../../../../src/services/materialCatalog/legacyTestMaterialSummary.service.ts';
import { calculateBandScore } from '../../../../src/services/autoMarking.service.ts';
import { markThcsTest, thcsResultToTestMarkingResult } from '../../../../src/services/thcsAutoMarking.service.ts';
import { shuffleTest } from '../../../../src/utils/thcsShuffle.ts';
import { buildMaterialSummaryUpdatePayload } from '../../../../src/services/materialCatalog/materialSummaryPort.service.ts';
import { DRAFT_AUDIO_ASSET_ID } from '../../../../src/types/assessmentAudio.types.ts';
import { DEFAULT_THCS_AUDIO_PLAYBACK, THCS_AUDIO_DELAY_LIMIT_SECONDS, THCS_AUDIO_REPLAY_LIMIT,
  type THCSAudioPlayback, type THCSTest } from '../../../../src/types/thcs-test.types.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { ASSESSMENT_ATTEMPT_TTL_MS, createExternalPlaybackRefresh, readAuthorizedAssessmentResult, readListeningDatabaseValue, readListeningHomeworkDocument as readHomeworkDocument,
  verifyExternalPlaybackRefresh, type ListeningDeliveryWorkerEnv } from '../listening-delivery.ts';
import { readListeningCourseAccess } from '../listening-course-access.ts';
import { BackblazeAudioSource } from './b2-source.ts';
import { createExternalAudioConnections } from './connections.ts';
import { createAudioCredentialStore } from './credential-store.ts';
import { externalAudioThcsEnabled, readDraftAudioAsset, readThcsAudioDraft } from './draft-assets.ts';
import { ExternalAudioError, fail, record } from './protocol.ts';

export type ThcsAudioAction = 'validate-thcs-draft' | 'publish-thcs' | 'play-thcs' | 'read-thcs' | 'retain-thcs-result' | 'submit-thcs-course';
type Data = Record<string, unknown>;
type Input = {
  request: Request;
  env: ListeningDeliveryWorkerEnv;
  uid: string;
  now: () => number;
  readAppValue: (path: string) => Promise<unknown>;
};
const keyPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const key = (value: unknown): string => {
  if (typeof value !== 'string' || !keyPattern.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) fail('invalid_request');
  return value;
};
const fields = (value: Data, names: string) => Object.fromEntries(
  names.split(' ').filter((name) => Object.hasOwn(value, name)).map((name) => [name, value[name]]),
);

function playbackSettings(value: unknown): THCSAudioPlayback {
  if (value === undefined) return DEFAULT_THCS_AUDIO_PLAYBACK;
  const { delaySeconds, maxReplays, allowSeek } = record(value);
  if (typeof delaySeconds !== 'number' || !Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > THCS_AUDIO_DELAY_LIMIT_SECONDS ||
    typeof maxReplays !== 'number' || !Number.isInteger(maxReplays) || maxReplays < 0 || maxReplays > THCS_AUDIO_REPLAY_LIMIT ||
    typeof allowSeek !== 'boolean') fail('invalid_request');
  return { delaySeconds, maxReplays, allowSeek };
}

function attachment(value: unknown) {
  const { scope, assetId } = record(value);
  if (scope !== 'section' || typeof assetId !== 'string' || !DRAFT_AUDIO_ASSET_ID.test(assetId)) fail('draft_audio_not_found');
  return { scope, assetId } as const;
}

function safeSection(value: unknown) {
  const section = record(value);
  const id = key(section.id);
  if (typeof section.name !== 'string' || !section.name.trim() || !Array.isArray(section.questions) ||
    !section.questions.length || section.importSourceNeedsReview === true ||
    typeof section.totalPoints !== 'number' || !Number.isFinite(section.totalPoints) || section.totalPoints < 0) fail('invalid_request');
  if (section.externalAudioRequired === true && !section.externalAudio) fail('audio_required');
  const questions = section.questions.map((value) => {
    const q = record(value);
    key(q.id);
    if (typeof q.type !== 'string') fail('invalid_request');
    // Preserve the existing THCS question and local marking contract.
    return fields(q, 'id questionNumber type intent questionText options correctAnswer points imageUrl imageCaption optionUnderlines underlinedParts explanation sentenceTemplate blankAnswers originalSentence sentenceStarter keyword modelAnswers autoGradeWriting passageTemplate wordBank blankMapping allowWordReuse');
  });
  return {
    ...fields(section, 'name order pointMode instructionText isCustomInstruction layout isCustomLayout shuffle shuffleOptions rawText isRawTextFallback'),
    ...(section.passage ? { passage: fields(record(section.passage), 'id content title imageUrl wordCount') } : {}),
    id, questions, totalPoints: section.totalPoints,
    ...(section.externalAudio ? { externalAudio: attachment(section.externalAudio), audioPlayback: playbackSettings(section.audioPlayback) } : {}),
  };
}

function applyPaths(root: Data, updates: Data) {
  for (const [path, value] of Object.entries(updates)) {
    const parts = path.split('/');
    let target = root;
    for (const part of parts.slice(0, -1)) {
      const child = record(Object.hasOwn(target, part) ? target[part] : undefined);
      target[part] = child;
      target = child;
    }
    const leaf = parts.at(-1)!;
    if (value === null) delete target[leaf];
    else target[leaf] = value;
  }
}

const accessFields = ['testId', 'versionId', 'homeworkId', 'submissionId', 'courseId', 'moduleId', 'resultId'];

function thcsScope(body: Data) {
  const optional = (field: string) => body[field] === undefined ? undefined : key(body[field]);
  const testId = key(body.testId);
  const versionId = optional('versionId');
  const homeworkId = optional('homeworkId');
  const submissionId = optional('submissionId');
  const courseId = optional('courseId');
  const moduleId = optional('moduleId');
  const resultId = optional('resultId');
  if (Boolean(homeworkId) !== Boolean(submissionId) || Boolean(courseId) !== Boolean(moduleId) ||
    [homeworkId, courseId, resultId].filter(Boolean).length > 1) fail('invalid_request');
  return { testId, versionId, homeworkId, submissionId, courseId, moduleId, resultId };
}

type ThcsScope = ReturnType<typeof thcsScope>;

function scopeParts(scope: ThcsScope) {
  return [scope.testId, scope.versionId, scope.homeworkId, scope.submissionId,
    scope.courseId, scope.moduleId, scope.resultId];
}

function isPublishedThcs(test: Data, testId: string) {
  return test.id === testId && test.testType === 'THCS-THPT' && test.isComplete === true &&
    typeof test.publishedAt === 'number' && test.archived !== true && test.deleted !== true &&
    !['archived', 'deleted', 'removed'].includes(String(test.state ?? test.status));
}

async function authorizeThcs(input: Input, role: unknown, scope: ThcsScope, allowOpenedVersion = false) {
  const { env, uid, request, now, readAppValue } = input;
  const { testId, homeworkId, submissionId, courseId, moduleId, resultId } = scope;
  const authorization = request.headers.get('Authorization');
  if (!['teacher', 'student', 'super_admin'].includes(String(role))) fail('playback_denied');
  if (resultId) {
    const [result, rawLink] = await Promise.all([
      readAuthorizedAssessmentResult(env, resultId, authorization).catch(() => fail('playback_denied')),
      readAppValue(`thcs_result_audio/${resultId}`),
    ]);
    const link = record(rawLink);
    if (result.sourceMaterialRemoved === true || result.testId !== testId || link.testId !== testId ||
      result.studentId !== link.studentId || result.materialVersionId !== link.versionId ||
      (scope.versionId !== undefined && link.versionId !== scope.versionId)) fail('playback_denied');
    const test = record(await readAppValue(`thcs_published_versions/${testId}/${key(link.versionId)}`));
    if (!isPublishedThcs(test, testId) || test.ownerId !== link.ownerId || test.externalAudioVersionId !== link.versionId) fail('playback_denied');
    return test;
  }
  const current = record(await readAppValue(`tests/${testId}`));
  if (!isPublishedThcs(current, testId)) fail('playback_denied');
  let versionId = scope.versionId ?? (homeworkId ? undefined : key(current.externalAudioVersionId));

  if (homeworkId && submissionId) {
    if (role !== 'student') fail('playback_denied');
    const [grant, homework, attempt] = await Promise.all([
      readAppValue(`homework_test_access/${testId}/${uid}/${homeworkId}`),
      readHomeworkDocument(env, `homework_assignments/${homeworkId}`, authorization),
      readHomeworkDocument(env, `homework_submissions/${submissionId}`, authorization),
    ]).catch(() => fail('playback_denied'));
    const hw = record(homework);
    const sub = record(attempt);
    const target = record(hw.target);
    const scheduling = record(hw.scheduling);
    const override = record(record(hw.studentOverrides)[uid]);
    const due = override.dueDate ?? scheduling.dueDate;
    const content = record(hw.contentRef);
    const time = now();
    versionId ??= key(content.version);
    if (grant !== true || hw.id !== homeworkId || hw.materialType !== 'thcs-test' || hw.materialId !== testId ||
      content.contentKind !== 'thcs_test' || content.contentId !== testId || content.version !== versionId ||
      hw.archived !== false || !['active', 'scheduled', 'past_due'].includes(String(hw.status)) ||
      typeof due !== 'number' || (due < time && record(hw.config).lateSubmissionAllowed !== true) ||
      (typeof scheduling.availableFrom === 'number' && scheduling.availableFrom > time) ||
      override.exempted === true || sub.id !== submissionId || sub.studentId !== uid ||
      sub.homeworkId !== homeworkId || sub.teacherId !== hw.createdBy ||
      sub.status !== 'in_progress') fail('playback_denied');
    const snapshot = versionId === current.externalAudioVersionId ? current
      : record(await readAppValue(`thcs_published_versions/${testId}/${versionId}`));
    if (!isPublishedThcs(snapshot, testId) || snapshot.externalAudioVersionId !== versionId ||
      snapshot.ownerId !== current.ownerId ||
      (hw.createdBy !== snapshot.ownerId && (snapshot.isPublic !== true || current.isPublic !== true))) fail('playback_denied');
    if (target.type === 'class') {
      const classroom = record(await readAppValue(`classes/${key(target.classId)}`));
      const members = record(classroom.students);
      if (classroom.status === 'deleted' || !Object.entries(members).some(([id, row]) =>
        (id === uid || record(row).uid === uid) && [undefined, 'active'].includes(record(row).status as string | undefined))) fail('playback_denied');
    } else if (target.type !== 'students' || !Array.isArray(target.studentIds) || !target.studentIds.includes(uid)) fail('playback_denied');
    return snapshot;
  }
  if (courseId && moduleId) {
    if (role !== 'student') fail('playback_denied');
    const access = await readListeningCourseAccess((path, query) => query ? readListeningDatabaseValue(env, path, query) : readAppValue(path),
      scope, uid, key(current.ownerId), now());
    if (!access || !isPublishedThcs(access.current, testId) ||
      (access.course.ownerId !== access.current.ownerId && access.current.isPublic !== true)) fail('playback_denied');
    versionId = scope.versionId ?? key(access.current.externalAudioVersionId);
    const courseAuthority = { authorizedCourse: access.course, courseSettings: access.settings };
    if (versionId === access.current.externalAudioVersionId) return { ...access.current, ...courseAuthority };
    if (!allowOpenedVersion || !versionId) fail('playback_denied');
    const snapshot = record(await readAppValue(`thcs_published_versions/${testId}/${versionId}`));
    if (!isPublishedThcs(snapshot, testId) || snapshot.ownerId !== access.current.ownerId ||
      snapshot.externalAudioVersionId !== versionId || (snapshot.isPublic !== true && access.course.ownerId !== snapshot.ownerId)) fail('playback_denied');
    return { ...snapshot, ...courseAuthority };
  } else if (current.isPublic !== true) fail('playback_denied');

  if (versionId === current.externalAudioVersionId) return current;
  if (!allowOpenedVersion || !versionId) fail('playback_denied');
  const snapshot = record(await readAppValue(`thcs_published_versions/${testId}/${versionId}`));
  if (!isPublishedThcs(snapshot, testId) || snapshot.ownerId !== current.ownerId || snapshot.externalAudioVersionId !== versionId) fail('playback_denied');
  return snapshot;
}

async function submitThcsCourse(input: Input, body: Data, student: Data, fetchImpl: typeof fetch) {
  const { env, uid, now } = input;
  if (Object.keys(body).some(field => !['testId', 'versionId', 'courseId', 'moduleId', 'attemptHandle', 'answers', 'timeElapsed'].includes(field))) fail('invalid_request');
  const scope = thcsScope(body);
  const { testId, courseId, moduleId } = scope;
  const versionId = key(scope.versionId);
  if (!courseId || !moduleId || student.role !== 'student' ||
    !await verifyExternalPlaybackRefresh(env, ['thcs-attempt', uid, ...scopeParts(scope)], now(), body.attemptHandle)) fail('playback_denied');
  const snapshot = await authorizeThcs(input, student.role, scope, true);
  const course = record(snapshot.authorizedCourse);
  const teacherId = key(course.ownerId);
  const timeElapsed = body.timeElapsed;
  if (typeof timeElapsed !== 'number' || !Number.isFinite(timeElapsed) || timeElapsed < 0 || timeElapsed > 7 * 86400) fail('invalid_request');
  const test = shuffleTest(snapshot as unknown as THCSTest, uid);
  const numbers = new Set(test.sections.flatMap(section => section.questions.map(question => String(question.questionNumber))));
  const answers: Record<string, string | string[]> = {};
  const validText = (value: unknown): value is string => typeof value === 'string' && value.length <= 4096;
  for (const [number, answer] of Object.entries(record(body.answers))) {
    if (!numbers.has(number)) fail('invalid_request');
    if (validText(answer) || (Array.isArray(answer) && answer.length <= 100 && answer.every(validText))) answers[number] = answer;
    else fail('invalid_request');
  }
  const grading = markThcsTest(testId, uid, test.sections, answers);
  const { markingResult, thcsData } = thcsResultToTestMarkingResult(grading, test.metadata, test.sections);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([uid, ...scopeParts(scope), body.attemptHandle])));
  const resultId = `thcs-result-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const stamp = now();
  const studentName = typeof student.displayName === 'string' ? student.displayName : 'Student';
  const courseName = typeof course.name === 'string' ? course.name : test.metadata.title;
  const bandScore = calculateBandScore(markingResult.percentage);
  const summary = { resultId, studentId: uid, studentName, testId, sessionCode: resultId, submittedAt: stamp,
    percentage: markingResult.percentage, bandScore, testSkill: 'Mixed', testTitle: test.metadata.title };
  const result = { ...summary, testType: 'THCS-THPT', deliveryEngine: 'thcs-course', materialVersionId: versionId,
    totalScore: markingResult.totalScore, maxScore: markingResult.maxScore,
    questionResults: markingResult.questionResults, correct: markingResult.summary.correct,
    incorrect: markingResult.summary.incorrect, partialCredit: markingResult.summary.partialCredit,
    totalQuestions: markingResult.summary.totalQuestions, testDuration: test.metadata.duration,
    timeElapsed, createdAt: stamp, markingStatus: 'auto-marked', isGuest: false, thcsData, courseId, moduleId, teacherId,
    context: { type: 'course_material', source: { type: 'course', id: courseId, name: courseName, courseId }, courseId,
      configApplied: { timerMinutes: test.metadata.duration, feedbackTiming: 'after_completion', source: 'material_default' } },
    visibility: { contextType: 'course_material', sourceType: 'course', sourceId: courseId, sourceNameSnapshot: courseName,
      visibilityOwnerTeacherId: teacherId, ownershipResolved: true, ownerResolutionSource: 'course.ownerId', courseId },
  };
  const link = { studentId: uid, testId, versionId, ownerId: test.ownerId, courseId, teacherId };
  const updates = {
    [`test_results/${resultId}`]: result, [`thcs_result_audio/${resultId}`]: link,
    [`test_results_by_student/${uid}/${resultId}`]: summary,
    [`test_results_by_session/${resultId}/${resultId}`]: summary,
    [`test_results_by_course/${courseId}/${uid}/${resultId}`]: { ...summary, moduleId },
    [`teacher_result_keys/${teacherId}/${resultId}`]: true,
  };
  const repo = new FirebaseRtdbRestClient({ env, fetchImpl });
  for (let retry = 0; retry < 3; retry++) {
    const { data, etag } = await repo.readWithEtag<Data>('');
    const root = record(data);
    const restoring = record(root.system_flags).restore_in_progress;
    if (restoring === true || record(restoring).active === true) fail('restore_in_progress');
    if (record(root.thcs_result_audio)[resultId]) return { resultId };
    const checked = await authorizeThcs(input, student.role, scope, true);
    if (record(checked.authorizedCourse).ownerId !== teacherId) fail('playback_denied');
    const settings = Array.isArray(checked.courseSettings) ? checked.courseSettings.map(record) : [];
    const maxAttempts = settings.find(level => level.maxAttempts !== undefined && level.maxAttempts !== 'default')?.maxAttempts;
    if (maxAttempts !== undefined && maxAttempts !== null &&
      (typeof maxAttempts !== 'number' || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 ||
        Object.values(record(record(root.test_results_by_student)[uid])).filter(row => record(row).testId === testId).length >= maxAttempts)) {
      fail('playback_denied');
    }
    applyPaths(root, JSON.parse(JSON.stringify(updates)));
    if (await repo.writeIfMatch('', root, etag)) return { resultId };
  }
  return fail('store_unavailable');
}

export async function handleThcsAudio(action: ThcsAudioAction, input: Input, body: Data, fetchImpl: typeof fetch) {
  const { request, env, uid, now, readAppValue } = input;
  const isPlayback = action === 'play-thcs';
  if (!externalAudioThcsEnabled(env, request)) fail(isPlayback ? 'playback_denied' : 'draft_audio_not_found');
  const activeProfile = async () => {
    const user = record(await readAppValue(`users/${uid}`));
    if (user.disabled === true || user.forceReauth === true ||
      ['blocked', 'disabled', 'inactive', 'suspended'].includes(String(user.status))) return null;
    return user;
  };
  const profile = async () => (await activeProfile())?.role;
  const store = createAudioCredentialStore(env, fetchImpl);
  const source = createExternalAudioConnections({ store, source: new BackblazeAudioSource(fetchImpl), now });
  if (action === 'submit-thcs-course') return submitThcsCourse(input, body, record(await activeProfile()), fetchImpl);

  if (action === 'read-thcs' || action === 'retain-thcs-result' || isPlayback) {
    const fieldsForAction = isPlayback ? [...accessFields, 'sectionId', 'assetId', 'refreshHandle', 'attemptHandle']
      : action === 'retain-thcs-result' ? [...accessFields, 'attemptHandle'] : accessFields;
    if (Object.keys(body).some(field => !fieldsForAction.includes(field))) fail('invalid_request');
    const requestedScope = thcsScope(action === 'retain-thcs-result' ? { ...body, resultId: undefined } : body);
    if (action === 'read-thcs') {
      const role = await profile();
      const test = await authorizeThcs(input, role, requestedScope);
      const scope = { ...requestedScope, versionId: key(test.externalAudioVersionId) };
      if (scope.resultId) {
        return { versionId: scope.versionId, sections: Array.isArray(test.sections)
          ? test.sections.flatMap((value, index) => {
            const row = record(value);
            if (!row.externalAudio) return [];
            return [{ sectionId: key(row.id), sectionNumber: index + 1, assetId: attachment(row.externalAudio).assetId }];
          }) : [] };
      }
      const { stats: _stats, authorizedCourse: _course, courseSettings: _courseSettings, ...document } = test;
      return { document, ...(role === 'student'
        ? { attemptHandle: await createExternalPlaybackRefresh(env, ['thcs-attempt', uid, ...scopeParts(scope)], now(), ASSESSMENT_ATTEMPT_TTL_MS) } : {}) };
    }
    if (action === 'retain-thcs-result') {
      const resultId = key(body.resultId);
      const versionId = key(requestedScope.versionId);
      const scope = { ...requestedScope, versionId };
      if (scope.courseId || await profile() !== 'student' ||
        !await verifyExternalPlaybackRefresh(env, ['thcs-attempt', uid, ...scopeParts(scope)], now(), body.attemptHandle)) fail('playback_denied');
      const result = await readAuthorizedAssessmentResult(env, resultId, request.headers.get('Authorization')).catch(() => fail('playback_denied'));
      const context = record(result.context);
      const contextSource = record(context.source);
      const mode = scope.homeworkId ? 'homework' : 'self_study';
      const issuedAt = Number(String(body.attemptHandle).split('.')[0]) - ASSESSMENT_ATTEMPT_TTL_MS;
      if (result.studentId !== uid || result.testId !== scope.testId || result.testType !== 'THCS-THPT' ||
        result.materialVersionId !== versionId || result.sourceMaterialRemoved === true ||
        typeof result.createdAt !== 'number' || result.createdAt < issuedAt - 5_000 ||
        context.type !== mode || contextSource.id !== (scope.homeworkId ?? scope.testId) ||
        (scope.homeworkId && contextSource.submissionId !== scope.submissionId)) fail('playback_denied');
      const test = await authorizeThcs(input, 'student', scope, true);
      const repo = new FirebaseRtdbRestClient({ env, fetchImpl });
      const link = { studentId: uid, testId: scope.testId, versionId, ownerId: test.ownerId };
      for (let retry = 0; retry < 3; retry++) {
        const { data, etag } = await repo.readWithEtag<Data>('');
        const root = record(data);
        const restoring = record(root.system_flags).restore_in_progress;
        if (restoring === true || record(restoring).active === true) fail('restore_in_progress');
        const existing = record(record(root.thcs_result_audio)[resultId]);
        if (Object.keys(existing).length) {
          if (Object.entries(link).some(([field, value]) => existing[field] !== value)) fail('playback_denied');
          return { retained: true };
        }
        applyPaths(root, { [`thcs_result_audio/${resultId}`]: link });
        if (await repo.writeIfMatch('', root, etag)) return { retained: true };
      }
      return fail('store_unavailable');
    }
    const scope = { ...requestedScope, versionId: key(requestedScope.versionId) };
    const sectionId = key(body.sectionId);
    const { assetId } = attachment({ scope: 'section', assetId: body.assetId });
    const refreshScope = ['thcs-external-audio', uid, ...scopeParts(scope), sectionId, assetId,
      typeof body.attemptHandle === 'string' ? body.attemptHandle : undefined];
    if (body.refreshHandle !== undefined && !await verifyExternalPlaybackRefresh(env, refreshScope, now(), body.refreshHandle)) fail('playback_denied');
    async function authorize() {
      const openedVersion = body.attemptHandle !== undefined;
      if (openedVersion && (!scope.courseId || !await verifyExternalPlaybackRefresh(env,
        ['thcs-attempt', uid, ...scopeParts(scope)], now(), body.attemptHandle))) fail('playback_denied');
      const [test, rawGraph] = await Promise.all([
        profile().then(role => authorizeThcs(input, role, scope, openedVersion)),
        readAppValue(`media_assets/${assetId}`),
      ]);
      const graph = record(rawGraph);
      const section = Array.isArray(test.sections)
        ? test.sections.find((candidate) => record(candidate).id === sectionId) : null;
      if (record(record(section).externalAudio).assetId !== assetId ||
        graph.state !== 'committed' || graph.storageProvider !== 'b2' || graph.testType !== 'thcs-thpt' ||
        graph.assetId !== assetId || graph.canonicalAssetId !== assetId || graph.ownerId !== test.ownerId ||
        graph.sourceDraftId !== test.sourceDraftId || graph.sectionId !== sectionId ||
        record(record(graph.references).tests)[scope.testId] !== true ||
        record(record(graph.references).versions)[scope.versionId] !== true) fail('playback_denied');
      return graph;
    }
    const graph = await authorize();
    const ttl = Number(env.EXTERNAL_AUDIO_PLAYBACK_QA_TTL_SECONDS);
    const ttlSeconds = Number.isInteger(ttl) && ttl >= 5 && ttl <= 120 ? ttl : 120;
    const delivery = await (async () => {
      try {
        const asset = await readDraftAudioAsset(store, key(graph.ownerId), {
          testType: 'thcs-thpt', draftId: key(graph.sourceDraftId), sectionId,
        }, assetId);
        if (asset.sizeBytes !== graph.sizeBytes || asset.contentType !== graph.contentType) fail('audio_unavailable');
        return await source.signPlayback(asset, ttlSeconds);
      } catch { return fail('audio_unavailable'); }
    })();
    await authorize();
    if (delivery.expiresAt <= now()) fail('audio_unavailable');
    return { ...delivery, refreshAfter: delivery.expiresAt - Math.min(30_000, ttlSeconds * 250),
      refreshHandle: await createExternalPlaybackRefresh(env, refreshScope, now()) };
  }

  if (!['teacher', 'super_admin'].includes(String(await profile()))) fail('teacher_required');
  const draftId = key(body.draftId);
  const assertWritable = async () => {
    const restoring = await readAppValue('system_flags/restore_in_progress');
    if (restoring === true || record(restoring).active === true) fail('restore_in_progress');
  };
  await assertWritable();
  const readDraft = () => readThcsAudioDraft(draftId, uid, env, request, fetchImpl);
  const { draft, updateTime } = await readDraft();
  const target = (sectionId: string) => ({ testType: 'thcs-thpt' as const, draftId, sectionId });
  if (!Array.isArray(draft.sections)) fail('draft_audio_not_found');
  if (action === 'validate-thcs-draft') {
    if (Object.keys(body).length !== 2 || !Array.isArray(body.attachments) || body.attachments.length > 40) fail('invalid_request');
    for (const item of body.attachments) {
      const row = record(item);
      const sectionId = key(row.sectionId);
      if (draft.sections.filter((section) => record(section).id === sectionId).length !== 1) fail('draft_audio_not_found');
      const { assetId } = attachment({ scope: 'section', assetId: row.assetId });
      await source.verifyPinnedAsset(await readDraftAudioAsset(store, uid, target(sectionId), assetId));
    }
    return { ready: true };
  }
  if (Object.keys(body).length !== 1 || !draft.sections.length || draft.sections.length > 40 || typeof updateTime !== 'string') fail('invalid_request');
  const sections = draft.sections.map(safeSection);
  if (new Set(sections.map(({ id }) => id)).size !== sections.length) fail('invalid_request');
  const metadata = fields(record(draft.metadata), 'title duration gradeLevel examType subjectVariant province school description tags timerMode');
  if (typeof metadata.title !== 'string' || !metadata.title.trim() ||
    typeof metadata.duration !== 'number' || !Number.isFinite(metadata.duration) || metadata.duration <= 0 ||
    typeof metadata.gradeLevel !== 'number' || typeof metadata.examType !== 'string' || !metadata.examType) fail('invalid_request');
  const external = sections.filter((section) => section.externalAudio);
  if (!external.length && (typeof draft.publishedTestId !== 'string' ||
    !record(await readAppValue(`tests/${key(draft.publishedTestId)}`)).externalAudioVersionId)) fail('audio_required');
  const pins = await Promise.all(external.map(async ({ id, externalAudio }) => {
    const asset = await readDraftAudioAsset(store, uid, target(id), externalAudio!.assetId);
    await source.signPlayback(asset);
    return { id, asset };
  }));
  const questionCount = sections.reduce((sum, section) => sum + section.questions.length, 0);
  const totalPoints = sections.reduce((sum, section) => sum + section.totalPoints, 0);
  const stamp = now();
  const testId = typeof draft.publishedTestId === 'string' ? key(draft.publishedTestId) : `thcs-test-${draftId}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([metadata, sections, draft.isPublic === true])));
  const versionId = `thcs-version-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  const repo = new FirebaseRtdbRestClient({ env, fetchImpl });
  // Provider verification is complete. The RTDB commit publishes membership and discovery together.
  for (let retry = 0; retry < 3; retry++) {
    const { data, etag } = await repo.readWithEtag<Data>('');
    const root = record(data);
    const existing = record(record(root.tests)[testId]);
    if (Object.keys(existing).length && (existing.ownerId !== uid || existing.sourceDraftId !== draftId ||
      existing.testType !== 'THCS-THPT')) fail('draft_audio_not_found');
    if (draft.publishedTestId && !Object.keys(existing).length) fail('draft_audio_not_found');
    if ((await readDraft()).updateTime !== updateTime) fail('draft_changed');
    const restoring = record(root.system_flags).restore_in_progress;
    if (restoring === true || record(restoring).active === true) fail('restore_in_progress');
    const versions = record(record(root.thcs_published_versions)[testId]);
    if (existing.externalAudioVersionId === versionId && versions[versionId]) return { testId };
    const test = {
      id: testId, testType: 'THCS-THPT', metadata, sections, questionCount, totalPoints,
      createdBy: uid, ownerId: uid, isPublic: draft.isPublic === true, isComplete: true,
      createdAt: existing.createdAt ?? stamp, updatedAt: stamp, publishedAt: stamp,
      sourceDraftId: draftId, externalAudioVersionId: versionId,
      settings: { showTimer: true, showResults: 'immediate', allowReview: true },
      ...(existing.stats ? { stats: existing.stats } : {}),
    };
    const previous = Object.keys(existing).length ? createLegacyTestMaterialSummary(testId, existing) : undefined;
    const updates: Data = { [`tests/${testId}`]: test,
      ...buildMaterialSummaryUpdatePayload(createLegacyTestMaterialSummary(testId, test), previous) };
    if (!versions[versionId]) {
      const { stats: _stats, ...snapshot } = test;
      updates[`thcs_published_versions/${testId}/${versionId}`] = snapshot;
    }
    if (typeof existing.externalAudioVersionId === 'string' && existing.externalAudioVersionId !== versionId &&
      !versions[existing.externalAudioVersionId]) {
      const { stats: _stats, ...snapshot } = existing;
      updates[`thcs_published_versions/${testId}/${key(existing.externalAudioVersionId)}`] = snapshot;
    }
    for (const { id, asset } of pins) {
      const old = record(record(root.media_assets)[asset.assetId]);
      if (Object.keys(old).length && (old.ownerId !== uid || old.sourceDraftId !== draftId ||
        old.sectionId !== id || old.storageProvider !== 'b2' || old.testType !== 'thcs-thpt')) fail('draft_audio_not_found');
      updates[`media_assets/${asset.assetId}`] = {
        assetId: asset.assetId, canonicalAssetId: asset.assetId, ownerId: uid, sourceDraftId: draftId,
        testType: 'thcs-thpt', sectionId: id, state: 'committed', storageProvider: 'b2',
        contentType: asset.contentType, sizeBytes: asset.sizeBytes, createdAt: old.createdAt ?? stamp, updatedAt: stamp,
        references: {
          tests: { ...record(record(old.references).tests), [testId]: true },
          versions: { ...record(record(old.references).versions), [versionId]: true },
        },
      };
    }
    applyPaths(root, updates);
    if (await repo.writeIfMatch('', root, etag)) return { testId };
  }
  throw new ExternalAudioError('draft_changed');
}
