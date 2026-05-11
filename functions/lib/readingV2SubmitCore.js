"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReadingV2TrustedSubmissionPlan = exports.getMaterialIdFromRequest = exports.parseReadingV2TrustedSubmissionRequest = exports.sanitizeRtdbValue = exports.READING_V2_SCHEMA_VERSION = exports.READING_V2_ENGINE = void 0;
exports.READING_V2_ENGINE = 'reading-v2';
exports.READING_V2_SCHEMA_VERSION = 1;
const storagePaths = {
    attempts: (attemptId) => `reading_v2/attempts/${attemptId}`,
    results: (resultId) => `reading_v2/results/${resultId}`,
    reviewIndexes: (resultId) => `reading_v2/review_indexes/${resultId}`,
};
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const requiredString = (value, fieldName) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Reading V2 submission is missing ${fieldName}.`);
    }
    return value.trim();
};
const optionalString = (value) => typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
const optionalNullableString = (value) => typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
const sanitizeRtdbValue = (value) => {
    if (value === undefined) {
        return null;
    }
    if (value === null) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => (0, exports.sanitizeRtdbValue)(entry));
    }
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .filter(([, entry]) => entry !== undefined)
            .map(([key, entry]) => [key, (0, exports.sanitizeRtdbValue)(entry)]));
    }
    return value;
};
exports.sanitizeRtdbValue = sanitizeRtdbValue;
const parseReadingV2TrustedSubmissionRequest = (body) => {
    if (!isRecord(body)) {
        throw new Error('Reading V2 submission body must be an object.');
    }
    if (body.deliveryEngine !== exports.READING_V2_ENGINE) {
        throw new Error('Reading V2 trusted submission requires the reading-v2 delivery engine.');
    }
    if (!Array.isArray(body.answers)) {
        throw new Error('Reading V2 submission answers must be an array.');
    }
    return {
        deliveryEngine: exports.READING_V2_ENGINE,
        projectionId: requiredString(body.projectionId, 'projectionId'),
        sourceSnapshotVersionId: requiredString(body.sourceSnapshotVersionId, 'sourceSnapshotVersionId'),
        materialId: optionalString(body.materialId),
        answers: body.answers.map((answer, index) => parseAnswer(answer, index)),
        context: isRecord(body.context) ? {
            surface: parseSurface(body.context.surface),
            sessionCode: optionalString(body.context.sessionCode),
            homeworkId: optionalString(body.context.homeworkId),
            courseId: optionalString(body.context.courseId),
            classId: optionalString(body.context.classId),
            moduleId: optionalString(body.context.moduleId),
            assignmentId: optionalString(body.context.assignmentId),
            sourceName: optionalString(body.context.sourceName),
        } : undefined,
    };
};
exports.parseReadingV2TrustedSubmissionRequest = parseReadingV2TrustedSubmissionRequest;
const parseSurface = (value) => {
    if (value === 'solo-practice' ||
        value === 'homework' ||
        value === 'course-material' ||
        value === 'public-library' ||
        value === 'live-session') {
        return value;
    }
    return undefined;
};
const parseAnswer = (value, index) => {
    if (!isRecord(value)) {
        throw new Error(`Reading V2 answer ${index + 1} must be an object.`);
    }
    const displayNumber = Number(value.displayNumber);
    if (!Number.isFinite(displayNumber)) {
        throw new Error(`Reading V2 answer ${index + 1} is missing displayNumber.`);
    }
    const answerValue = value.value;
    if (typeof answerValue !== 'string' &&
        !(Array.isArray(answerValue) && answerValue.every((entry) => typeof entry === 'string'))) {
        throw new Error(`Reading V2 answer ${index + 1} has an unsupported value.`);
    }
    return {
        interactionId: requiredString(value.interactionId, `answers[${index}].interactionId`),
        taskGroupId: requiredString(value.taskGroupId, `answers[${index}].taskGroupId`),
        displayNumber,
        value: answerValue,
    };
};
const getMaterialIdFromRequest = (request) => requiredString(request.materialId, 'materialId');
exports.getMaterialIdFromRequest = getMaterialIdFromRequest;
const normalizeText = (value, options) => {
    const joined = Array.isArray(value) ? value.join('|') : String(value !== null && value !== void 0 ? value : '');
    const cased = options.caseSensitive ? joined : joined.toLowerCase();
    const punctuated = options.punctuationSensitive
        ? cased
        : cased.replace(/[^\p{L}\p{N}\s|]/gu, '');
    return punctuated.replace(/\s+/g, ' ').trim();
};
const normalizeAnswerItems = (value, options) => (Array.isArray(value) ? value : [value]).map((entry) => normalizeText(entry, options));
const answerListsMatch = (studentItems, expectedItems, orderMatters) => {
    if (studentItems.length !== expectedItems.length) {
        return false;
    }
    const left = orderMatters ? [...studentItems] : [...studentItems].sort();
    const right = orderMatters ? [...expectedItems] : [...expectedItems].sort();
    return left.every((entry, index) => entry === right[index]);
};
const answerMatches = (studentAnswer, interaction) => {
    var _a, _b;
    const scoringRule = (_a = interaction.scoringRule) !== null && _a !== void 0 ? _a : {};
    const acceptableAnswers = Array.isArray(scoringRule.acceptableAnswers)
        ? scoringRule.acceptableAnswers
        : [];
    if (acceptableAnswers.length === 0) {
        return false;
    }
    if (Array.isArray(studentAnswer) || ((_b = interaction.responseShape) === null || _b === void 0 ? void 0 : _b.kind) === 'multi-select') {
        return answerListsMatch(normalizeAnswerItems(studentAnswer, scoringRule), normalizeAnswerItems(acceptableAnswers, scoringRule), scoringRule.orderMatters !== false);
    }
    const normalizedStudent = normalizeText(studentAnswer, scoringRule);
    return acceptableAnswers.some((answer) => normalizeText(answer, scoringRule) === normalizedStudent);
};
const correctAnswerForInteraction = (interaction) => {
    var _a, _b, _c;
    const acceptableAnswers = Array.isArray((_a = interaction.scoringRule) === null || _a === void 0 ? void 0 : _a.acceptableAnswers)
        ? interaction.scoringRule.acceptableAnswers
        : [];
    return ((_b = interaction.scoringRule) === null || _b === void 0 ? void 0 : _b.orderMatters) === false
        ? [...acceptableAnswers]
        : (_c = acceptableAnswers[0]) !== null && _c !== void 0 ? _c : '';
};
const answerMapFromRuntime = (answers) => Object.fromEntries(answers.map((answer) => [answer.interactionId, answer]));
const projectedGroups = (projection) => { var _a; return Array.isArray((_a = projection.content) === null || _a === void 0 ? void 0 : _a.taskGroups) ? projection.content.taskGroups : []; };
const findProjectedTaskGroup = (projection, interactionId) => projectedGroups(projection).find((taskGroup) => Array.isArray(taskGroup.interactions) &&
    taskGroup.interactions.some((interaction) => interaction.interactionId === interactionId));
const findProjectedInteraction = (projection, interactionId) => {
    const group = findProjectedTaskGroup(projection, interactionId);
    return Array.isArray(group === null || group === void 0 ? void 0 : group.interactions)
        ? group.interactions.find((interaction) => interaction.interactionId === interactionId)
        : undefined;
};
const orderedCanonicalInteractions = (snapshot) => {
    var _a;
    const interactions = (_a = snapshot.document) === null || _a === void 0 ? void 0 : _a.interactions;
    if (!isRecord(interactions)) {
        throw new Error('Reading V2 published snapshot is missing canonical interactions.');
    }
    return Object.values(interactions);
};
const truncateContext = (value, maxLength = 220) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
};
const stimulusExcerpt = (stimulus, anchorIds) => {
    var _a, _b;
    const content = (_a = stimulus.content) !== null && _a !== void 0 ? _a : {};
    const selectedAnchorIds = new Set(anchorIds);
    if (content.kind === 'passage-content' && Array.isArray(content.paragraphs)) {
        const paragraphs = selectedAnchorIds.size > 0
            ? content.paragraphs.filter((paragraph) => paragraph.anchorId && selectedAnchorIds.has(paragraph.anchorId))
            : content.paragraphs.slice(0, 2);
        return truncateContext(paragraphs.map((paragraph) => paragraph.text).join(' '));
    }
    if (content.kind === 'table-content' && Array.isArray(content.rows)) {
        const cells = content.rows
            .flat()
            .filter((cell) => selectedAnchorIds.size === 0 || (cell.anchorId && selectedAnchorIds.has(cell.anchorId)))
            .map((cell) => cell.text)
            .filter(Boolean);
        return truncateContext(cells.join(' | '));
    }
    if (content.kind === 'flowchart-content' && Array.isArray(content.steps)) {
        const steps = content.steps
            .filter((step) => selectedAnchorIds.size === 0 || (step.anchorId && selectedAnchorIds.has(step.anchorId)))
            .map((step) => step.text);
        return truncateContext(steps.join(' -> '));
    }
    if (content.kind === 'diagram-content' && Array.isArray(content.hotspots)) {
        const labels = content.hotspots
            .filter((hotspot) => selectedAnchorIds.size === 0 || (hotspot.anchorId && selectedAnchorIds.has(hotspot.anchorId)))
            .map((hotspot) => hotspot.label);
        return truncateContext([content.imageAlt, ...labels].filter(Boolean).join(' | '));
    }
    return truncateContext(String((_b = content.alt) !== null && _b !== void 0 ? _b : ''));
};
const stimulusContextForTaskGroup = (projection, taskGroup) => {
    var _a, _b;
    const stimuli = Array.isArray((_a = projection.content) === null || _a === void 0 ? void 0 : _a.stimuli) ? projection.content.stimuli : [];
    const anchors = Array.isArray((_b = projection.content) === null || _b === void 0 ? void 0 : _b.anchors) ? projection.content.anchors : [];
    const refs = Array.isArray(taskGroup.stimulusRefs) ? taskGroup.stimulusRefs : [];
    return refs.map((stimulusRef) => {
        const stimulus = stimuli.find((candidate) => candidate.stimulusId === stimulusRef.stimulusId);
        if (!stimulus) {
            throw new Error(`Reading V2 review projection is missing stimulus ${stimulusRef.stimulusId}.`);
        }
        const anchorIds = Array.isArray(stimulusRef.anchorIds) ? stimulusRef.anchorIds : [];
        const anchorLabels = anchors
            .filter((anchor) => anchor.stimulusId === stimulusRef.stimulusId)
            .filter((anchor) => anchorIds.length === 0 || anchorIds.includes(anchor.anchorId))
            .map((anchor) => { var _a; return (_a = anchor.label) !== null && _a !== void 0 ? _a : anchor.anchorId; });
        return {
            stimulusId: stimulus.stimulusId,
            title: stimulus.title,
            kind: stimulus.kind,
            anchorLabels,
            excerpt: stimulusExcerpt(stimulus, anchorIds),
        };
    });
};
const modeFromSurface = (surface) => surface !== null && surface !== void 0 ? surface : 'solo-practice';
const resultContextTypeForMode = (mode) => {
    if (mode === 'homework')
        return 'homework';
    if (mode === 'live-session')
        return 'class_session';
    if (mode === 'course-material')
        return 'course_material';
    return 'self_study';
};
const resultSourceTypeForMode = (mode) => {
    if (mode === 'homework')
        return 'homework';
    if (mode === 'live-session')
        return 'class';
    if (mode === 'course-material')
        return 'course';
    if (mode === 'public-library')
        return 'library';
    return 'direct_link';
};
const visibilityContextTypeForMode = (mode) => {
    if (mode === 'homework')
        return 'homework';
    if (mode === 'live-session')
        return 'class_session';
    if (mode === 'course-material')
        return 'course_material';
    return 'solo_practice';
};
const visibilitySourceTypeForMode = (mode) => {
    if (mode === 'homework')
        return 'homework';
    if (mode === 'live-session')
        return 'session';
    if (mode === 'course-material')
        return 'course';
    return 'solo_practice';
};
const resultSourceIdForAttempt = (mode, context, materialId) => {
    var _a, _b, _c;
    return (_c = (_b = (_a = context.homeworkId) !== null && _a !== void 0 ? _a : context.sessionCode) !== null && _b !== void 0 ? _b : context.courseId) !== null && _c !== void 0 ? _c : materialId;
};
const buildResultContext = (mode, context, materialId, testTitle) => {
    var _a;
    return (Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ type: resultContextTypeForMode(mode), source: Object.assign({ type: resultSourceTypeForMode(mode), id: resultSourceIdForAttempt(mode, context, materialId), name: (_a = context.sourceName) !== null && _a !== void 0 ? _a : testTitle }, (context.sessionCode !== undefined && { sessionCode: context.sessionCode })) }, (context.sessionCode !== undefined && { sessionCode: context.sessionCode })), (context.classId !== undefined && { classId: context.classId })), (context.courseId !== undefined && { courseId: context.courseId })), ((context.assignmentId !== undefined || context.homeworkId !== undefined) && {
        assignment: Object.assign(Object.assign(Object.assign({}, (context.homeworkId !== undefined && { homeworkId: context.homeworkId })), (context.assignmentId !== undefined && { assignmentId: context.assignmentId })), { attemptNumber: 1 }),
    })), { configApplied: {
            timerMinutes: null,
            feedbackTiming: 'after_completion',
            source: 'material_default',
        } }));
};
const buildVisibilitySnapshot = (mode, context, materialId, sourceName, snapshotOwnerId, session) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const contextType = visibilityContextTypeForMode(mode);
    const isSoloPractice = contextType === 'solo_practice';
    const sessionOwner = (_a = optionalNullableString(session === null || session === void 0 ? void 0 : session.createdByUserId)) !== null && _a !== void 0 ? _a : optionalNullableString(session === null || session === void 0 ? void 0 : session.createdBy);
    const ownerId = isSoloPractice ? null : (sessionOwner !== null && sessionOwner !== void 0 ? sessionOwner : snapshotOwnerId);
    const sourceId = resultSourceIdForAttempt(mode, context, materialId);
    return {
        contextType,
        sourceType: visibilitySourceTypeForMode(mode),
        sourceId,
        sourceNameSnapshot: sourceName,
        visibilityOwnerTeacherId: ownerId,
        ownerResolutionSource: isSoloPractice
            ? 'solo_practice'
            : (sessionOwner ? 'session.createdByUserId' : 'result.teacherId'),
        ownershipResolved: isSoloPractice || Boolean(ownerId),
        unresolvedReason: isSoloPractice || ownerId ? null : 'owner_not_resolved',
        homeworkId: (_b = context.homeworkId) !== null && _b !== void 0 ? _b : null,
        sessionCode: (_c = context.sessionCode) !== null && _c !== void 0 ? _c : null,
        courseId: (_e = (_d = context.courseId) !== null && _d !== void 0 ? _d : session === null || session === void 0 ? void 0 : session.courseId) !== null && _e !== void 0 ? _e : null,
        classId: (_h = (_g = (_f = context.classId) !== null && _f !== void 0 ? _f : session === null || session === void 0 ? void 0 : session.linkedClassId) !== null && _g !== void 0 ? _g : session === null || session === void 0 ? void 0 : session.classId) !== null && _h !== void 0 ? _h : null,
        assignmentId: (_j = context.assignmentId) !== null && _j !== void 0 ? _j : null,
        currentSourceName: (_l = (_k = optionalNullableString(session === null || session === void 0 ? void 0 : session.title)) !== null && _k !== void 0 ? _k : optionalNullableString(session === null || session === void 0 ? void 0 : session.name)) !== null && _l !== void 0 ? _l : sourceName,
    };
};
const getStudentName = (auth, profile) => {
    var _a, _b, _c, _d, _e;
    return (_e = (_d = (_c = (_b = (_a = optionalNullableString(profile === null || profile === void 0 ? void 0 : profile.displayName)) !== null && _a !== void 0 ? _a : optionalNullableString(profile === null || profile === void 0 ? void 0 : profile.name)) !== null && _b !== void 0 ? _b : optionalNullableString(profile === null || profile === void 0 ? void 0 : profile.fullName)) !== null && _c !== void 0 ? _c : optionalNullableString(auth.name)) !== null && _d !== void 0 ? _d : optionalNullableString(auth.email)) !== null && _e !== void 0 ? _e : 'Student';
};
const buildReviewPayload = (result, projection, materialId) => {
    var _a, _b;
    return ({
        deliveryEngine: exports.READING_V2_ENGINE,
        schemaVersion: exports.READING_V2_SCHEMA_VERSION,
        resultId: result.resultId,
        sourceSnapshotVersionId: result.publishedSnapshotVersion,
        materialId,
        title: (_b = (_a = projection.content) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : 'Reading V2',
        taskGroups: projectedGroups(projection).map((taskGroup) => ({
            taskGroupId: taskGroup.taskGroupId,
            title: taskGroup.groupTitle,
            officialTaskType: taskGroup.officialTaskType,
            engineeringFamily: taskGroup.engineeringFamily,
            instructionText: Array.isArray(taskGroup.instructionBlocks)
                ? taskGroup.instructionBlocks.map((block) => block.text).join('\n')
                : '',
            stimulusContext: stimulusContextForTaskGroup(projection, taskGroup),
            interactions: Array.isArray(taskGroup.interactions)
                ? taskGroup.interactions.map((interaction) => {
                    const resultInteraction = result.interactions.find((candidate) => candidate.interactionId === interaction.interactionId);
                    if (!resultInteraction) {
                        throw new Error(`Reading V2 result is missing interaction ${interaction.interactionId}.`);
                    }
                    return {
                        interactionId: resultInteraction.interactionId,
                        taskGroupId: resultInteraction.taskGroupId,
                        displayNumber: resultInteraction.displayNumber,
                        taskFamily: resultInteraction.taskFamily,
                        officialTaskType: resultInteraction.officialTaskType,
                        studentAnswer: resultInteraction.studentAnswer,
                        correctAnswer: resultInteraction.scoredAnswer,
                        score: resultInteraction.score,
                        maxScore: resultInteraction.maxScore,
                        reviewState: resultInteraction.reviewState,
                        anchorRef: resultInteraction.anchorRef,
                    };
                })
                : [],
        })),
    });
};
const buildStudentIndexRow = (result) => ({
    resultId: result.resultId,
    sessionCode: result.sessionCode,
    testId: result.testId,
    percentage: result.percentage,
    submittedAt: result.submittedAt,
});
const buildSessionIndexRow = (result) => ({
    resultId: result.resultId,
    studentId: result.studentId,
    studentName: result.studentName,
    percentage: result.percentage,
    submittedAt: result.submittedAt,
});
const buildTeacherIndexRow = (result) => ({
    resultId: result.resultId,
    sessionCode: result.sessionCode,
    studentId: result.studentId,
    studentName: result.studentName,
    percentage: result.percentage,
    submittedAt: result.submittedAt,
    isGuest: Boolean(result.isGuest),
});
const buildCourseIndexRow = (result) => {
    var _a;
    return ({
        resultId: result.resultId,
        studentId: result.studentId,
        studentName: result.studentName,
        percentage: result.percentage,
        bandScore: result.bandScore,
        testTitle: result.testTitle,
        testSkill: result.testSkill,
        submittedAt: result.submittedAt,
        moduleId: (_a = result.moduleId) !== null && _a !== void 0 ? _a : null,
    });
};
const buildClassIndexRow = (result, courseId) => ({
    resultId: result.resultId,
    studentId: result.studentId,
    studentName: result.studentName,
    percentage: result.percentage,
    bandScore: result.bandScore,
    testTitle: result.testTitle,
    testSkill: result.testSkill,
    submittedAt: result.submittedAt,
    courseId,
});
const buildReadingV2TrustedSubmissionPlan = (input) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    const materialId = (0, exports.getMaterialIdFromRequest)(input.request);
    const snapshotVersionId = input.request.sourceSnapshotVersionId;
    const snapshot = input.records.snapshot;
    const reviewProjection = input.records.reviewProjection;
    const context = (_a = input.request.context) !== null && _a !== void 0 ? _a : {};
    const mode = modeFromSurface(context.surface);
    const studentName = getStudentName(input.auth, input.records.studentProfile);
    const testTitle = (_e = (_c = optionalString((_b = reviewProjection.content) === null || _b === void 0 ? void 0 : _b.title)) !== null && _c !== void 0 ? _c : optionalString((_d = input.records.metadata) === null || _d === void 0 ? void 0 : _d.title)) !== null && _e !== void 0 ? _e : 'Reading V2';
    if (snapshot.materialId !== materialId) {
        throw new Error('Reading V2 submission material binding does not match the published snapshot.');
    }
    if (snapshot.snapshotVersionId !== snapshotVersionId) {
        throw new Error('Reading V2 submission snapshot binding does not match the published snapshot.');
    }
    if (reviewProjection.projectionKind !== 'review') {
        throw new Error('Reading V2 trusted submission requires a review projection.');
    }
    if (reviewProjection.sourceSnapshotVersionId !== snapshotVersionId) {
        throw new Error('Reading V2 review projection binding does not match the submitted snapshot.');
    }
    const runtimeAnswers = answerMapFromRuntime(input.request.answers);
    const attemptContext = {
        mode,
        sessionCode: context.sessionCode,
        homeworkId: context.homeworkId,
        courseId: context.courseId,
        classId: context.classId,
        assignmentId: context.assignmentId,
        sourceName: (_f = context.sourceName) !== null && _f !== void 0 ? _f : testTitle,
        materialId,
    };
    const attempt = {
        attemptId: input.identity.attemptId,
        studentId: input.auth.uid,
        sourceSnapshotVersionId: snapshotVersionId,
        context: attemptContext,
        answers: Object.fromEntries(input.request.answers.map((answer) => [
            answer.interactionId,
            {
                taskGroupId: answer.taskGroupId,
                visibleNumber: answer.displayNumber,
                value: answer.value,
            },
        ])),
    };
    const resultInteractions = orderedCanonicalInteractions(snapshot).map((interaction) => {
        var _a, _b, _c, _d, _e, _f, _g;
        const taskGroup = (_b = (_a = snapshot.document) === null || _a === void 0 ? void 0 : _a.taskGroups) === null || _b === void 0 ? void 0 : _b[interaction.taskGroupId];
        if (!taskGroup) {
            throw new Error(`Reading V2 result cannot score missing task group ${interaction.taskGroupId}.`);
        }
        const answer = runtimeAnswers[interaction.interactionId];
        const projectedInteraction = findProjectedInteraction(reviewProjection, interaction.interactionId);
        const maxScore = Number((_d = (_c = interaction.scoringRule) === null || _c === void 0 ? void 0 : _c.maxScore) !== null && _d !== void 0 ? _d : 0);
        const score = answerMatches(answer === null || answer === void 0 ? void 0 : answer.value, interaction) ? maxScore : 0;
        return {
            interactionId: interaction.interactionId,
            taskGroupId: interaction.taskGroupId,
            displayNumber: Number((_f = (_e = projectedInteraction === null || projectedInteraction === void 0 ? void 0 : projectedInteraction.displayNumber) !== null && _e !== void 0 ? _e : answer === null || answer === void 0 ? void 0 : answer.displayNumber) !== null && _f !== void 0 ? _f : 0),
            taskFamily: taskGroup.engineeringFamily,
            officialTaskType: taskGroup.officialTaskType,
            studentAnswer: (_g = answer === null || answer === void 0 ? void 0 : answer.value) !== null && _g !== void 0 ? _g : '',
            scoredAnswer: correctAnswerForInteraction(interaction),
            score,
            maxScore,
            reviewState: 'released',
            anchorRef: interaction.primaryAnchorId,
        };
    });
    const result = {
        resultId: input.identity.resultId,
        testId: materialId,
        studentId: input.auth.uid,
        ownerId: snapshot.ownerId,
        deliveryEngine: exports.READING_V2_ENGINE,
        publishedSnapshotVersion: snapshotVersionId,
        attemptContext,
        submittedAt: input.identity.submittedAtIso,
        interactions: resultInteractions,
    };
    const reviewPayload = buildReviewPayload(result, reviewProjection, materialId);
    const maxScore = resultInteractions.reduce((total, interaction) => total + interaction.maxScore, 0);
    const totalScore = resultInteractions.reduce((total, interaction) => total + interaction.score, 0);
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const visibility = buildVisibilitySnapshot(mode, context, materialId, (_g = context.sourceName) !== null && _g !== void 0 ? _g : testTitle, snapshot.ownerId, input.records.session);
    const savedResult = (0, exports.sanitizeRtdbValue)({
        resultId: input.identity.resultId,
        sessionCode: (_h = context.sessionCode) !== null && _h !== void 0 ? _h : 'reading-v2',
        testId: materialId,
        studentId: input.auth.uid,
        studentName,
        totalScore,
        maxScore,
        percentage,
        bandScore: Math.round((percentage / 10) * 2) / 2,
        questionResults: resultInteractions.map((interaction) => ({
            questionNumber: interaction.displayNumber,
            questionType: interaction.officialTaskType,
            isCorrect: interaction.score >= interaction.maxScore,
            score: interaction.score,
            maxScore: interaction.maxScore,
            studentAnswer: interaction.studentAnswer,
            correctAnswer: interaction.scoredAnswer,
            feedback: '',
        })),
        correct: resultInteractions.filter((interaction) => interaction.score >= interaction.maxScore).length,
        incorrect: resultInteractions.filter((interaction) => interaction.score === 0).length,
        partialCredit: resultInteractions.filter((interaction) => interaction.score > 0 && interaction.score < interaction.maxScore).length,
        totalQuestions: resultInteractions.length,
        submittedAt: input.identity.submittedAtMs,
        timeElapsed: 0,
        testDuration: Number((_k = (_j = input.records.metadata) === null || _j === void 0 ? void 0 : _j.durationMinutes) !== null && _k !== void 0 ? _k : 0),
        createdAt: input.identity.submittedAtMs,
        teacherId: snapshot.ownerId,
        testTitle,
        testType: 'ielts-reading-v2',
        testSkill: 'reading',
        courseId: (_l = context.courseId) !== null && _l !== void 0 ? _l : null,
        classId: (_r = (_p = (_m = context.classId) !== null && _m !== void 0 ? _m : (_o = input.records.session) === null || _o === void 0 ? void 0 : _o.linkedClassId) !== null && _p !== void 0 ? _p : (_q = input.records.session) === null || _q === void 0 ? void 0 : _q.classId) !== null && _r !== void 0 ? _r : null,
        moduleId: (_u = (_s = context.moduleId) !== null && _s !== void 0 ? _s : (_t = input.records.session) === null || _t === void 0 ? void 0 : _t.moduleId) !== null && _u !== void 0 ? _u : null,
        visibility,
        context: buildResultContext(mode, context, materialId, testTitle),
        deliveryEngine: exports.READING_V2_ENGINE,
        readingV2: {
            result,
            reviewPayload,
            regradeArtifacts: [],
        },
    });
    const canonicalResultPath = `test_results/${input.identity.resultId}`;
    const secondaryUpdates = {
        [storagePaths.attempts(input.identity.attemptId)]: (0, exports.sanitizeRtdbValue)(Object.assign(Object.assign({}, attempt), { materialId, sessionCode: (_v = context.sessionCode) !== null && _v !== void 0 ? _v : null })),
        [storagePaths.results(input.identity.resultId)]: (0, exports.sanitizeRtdbValue)(Object.assign(Object.assign({}, result), { materialId })),
        [storagePaths.reviewIndexes(input.identity.resultId)]: (0, exports.sanitizeRtdbValue)(Object.assign(Object.assign({}, reviewPayload), { ownerId: result.ownerId, taskGroupIds: reviewPayload.taskGroups.map((taskGroup) => taskGroup.taskGroupId) })),
        [`test_results_by_session/${savedResult.sessionCode}/${input.identity.resultId}`]: (0, exports.sanitizeRtdbValue)(buildSessionIndexRow(savedResult)),
        [`test_results_by_student/${input.auth.uid}/${input.identity.resultId}`]: (0, exports.sanitizeRtdbValue)(buildStudentIndexRow(savedResult)),
    };
    if (visibility.contextType === 'solo_practice' && visibility.ownershipResolved) {
        secondaryUpdates[`test_results_solo_practice_by_student/${input.auth.uid}/${input.identity.resultId}`] =
            (0, exports.sanitizeRtdbValue)(buildStudentIndexRow(savedResult));
    }
    if (visibility.ownershipResolved && visibility.visibilityOwnerTeacherId && visibility.contextType !== 'solo_practice') {
        secondaryUpdates[`test_results_by_teacher/${visibility.visibilityOwnerTeacherId}/${input.identity.resultId}`] =
            (0, exports.sanitizeRtdbValue)(buildTeacherIndexRow(savedResult));
    }
    const canonicalCourseId = typeof visibility.courseId === 'string'
        ? visibility.courseId
        : (_w = savedResult.courseId) !== null && _w !== void 0 ? _w : null;
    const canonicalClassId = typeof visibility.classId === 'string'
        ? visibility.classId
        : (_x = savedResult.classId) !== null && _x !== void 0 ? _x : null;
    if (visibility.ownershipResolved && visibility.contextType !== 'solo_practice' && canonicalCourseId) {
        secondaryUpdates[`test_results_by_course/${canonicalCourseId}/${input.auth.uid}/${input.identity.resultId}`] =
            (0, exports.sanitizeRtdbValue)(buildCourseIndexRow(savedResult));
    }
    if (visibility.ownershipResolved && visibility.contextType !== 'solo_practice' && canonicalClassId) {
        secondaryUpdates[`test_results_by_class/${canonicalClassId}/${input.auth.uid}/${input.identity.resultId}`] =
            (0, exports.sanitizeRtdbValue)(buildClassIndexRow(savedResult, canonicalCourseId));
    }
    if (context.sessionCode) {
        secondaryUpdates[`game_sessions/${context.sessionCode}/students/${input.auth.uid}/readingV2`] =
            (0, exports.sanitizeRtdbValue)({
                submitted: true,
                submittedAt: input.identity.submittedAtMs,
                resultId: input.identity.resultId,
                attemptId: input.identity.attemptId,
            });
        if ((_z = (_y = input.records.session) === null || _y === void 0 ? void 0 : _y.players) === null || _z === void 0 ? void 0 : _z[input.auth.uid]) {
            secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/submittedAt`] =
                input.identity.submittedAtMs;
            secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/isSubmitted`] = true;
            secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/hasSubmitted`] = true;
            secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/hasCompletedTest`] = true;
            secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/submittedBy`] = 'student';
            secondaryUpdates[`game_sessions/${context.sessionCode}/players/${input.auth.uid}/latestResultId`] =
                input.identity.resultId;
        }
    }
    return {
        resultId: input.identity.resultId,
        attemptId: input.identity.attemptId,
        savedResult,
        canonicalResultPath,
        secondaryUpdates,
        response: {
            resultId: input.identity.resultId,
            attemptId: input.identity.attemptId,
            totalScore,
            maxScore,
            percentage,
        },
    };
};
exports.buildReadingV2TrustedSubmissionPlan = buildReadingV2TrustedSubmissionPlan;
//# sourceMappingURL=readingV2SubmitCore.js.map
