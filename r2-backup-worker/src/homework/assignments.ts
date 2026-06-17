import type { WorkerEnv } from '../types';
import { verifyFirebaseToken } from '../auth/firebase-auth';
import { getFirebaseAccessToken } from '../auth/google-oauth';

type HomeworkContentKind =
    | 'thcs_test'
    | 'reading_passage'
    | 'ielts_reading'
    | 'ielts_listening'
    | 'ielts_writing';

interface HomeworkContentRef {
    contentKind: HomeworkContentKind;
    contentId: string;
    version?: string;
    title?: string;
    source?: string;
}

interface HomeworkTarget {
    type: 'class' | 'students';
    classId?: string;
    className?: string;
    studentIds?: string[];
    studentNames?: string[];
}

interface CreateHomeworkAssignmentRequest {
    contentRef?: HomeworkContentRef;
    target?: HomeworkTarget;
    config?: Record<string, unknown>;
    dueDate?: number | string;
    availableFrom?: number | string;
    instructions?: string;
    title?: string;
    tags?: string[];
    thcsConfig?: Record<string, unknown>;
    antiCheatConfig?: Record<string, unknown>;
}

type ReasonCode =
    | 'CONTENT_NOT_FOUND'
    | 'CONTENT_NOT_ASSIGNABLE'
    | 'CONTENT_DRAFT'
    | 'TEACHER_NOT_ALLOWED'
    | 'UNSUPPORTED_CONTENT_KIND'
    | 'WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED'
    | 'CONTENT_UNPUBLISHED'
    | 'TARGET_NOT_ALLOWED'
    | 'INVALID_ASSIGNMENT_REQUEST';

interface AssignmentError {
    status: number;
    reasonCode: ReasonCode;
    message: string;
}

interface TargetResolution {
    target: HomeworkTarget;
    totalAssigned: number;
    authorizedStudentIds: string[];
}

interface ContentResolution {
    contentRef: HomeworkContentRef;
    materialId: string;
    materialTitle: string;
    materialType: 'test' | 'thcs-test' | 'reading-passage' | 'reading-passage-set';
    materialSkill: 'reading' | 'listening' | 'writing' | 'speaking';
    studentSafeAssignmentPayload?: Record<string, unknown>;
    readingPassageSnapshot?: Record<string, unknown>;
    readingPassageSet?: Record<string, unknown>;
    readingV2FullTest?: {
        composition: Record<string, any>;
        projection: Record<string, any>;
    };
}

const SUPPORTED_CONTENT_KINDS = new Set<HomeworkContentKind>([
    'thcs_test',
    'reading_passage',
    'ielts_reading',
    'ielts_listening',
    'ielts_writing',
]);

const DEFAULT_VISIBILITY = {
    showTimer: true,
    showAttempts: true,
    showDueDate: true,
    showQuestionCount: true,
    showDuration: true,
};

const DEFAULT_STATS = {
    totalAssigned: 0,
    started: 0,
    submitted: 0,
    lateSubmissions: 0,
};

const isRecord = (value: unknown): value is Record<string, any> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const jsonResponse = (data: unknown, status = 200): Response =>
    new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });

const assignmentError = (
    reasonCode: ReasonCode,
    message: string,
    status = 400
): AssignmentError => ({ status, reasonCode, message });

const errorResponse = (error: AssignmentError): Response =>
    jsonResponse({
        error: error.message,
        message: error.message,
        reasonCode: error.reasonCode,
    }, error.status);

function encodeRtdbPath(path: string): string {
    return path
        .split('/')
        .filter((part) => part.length > 0)
        .map((part) => encodeURIComponent(part))
        .join('/');
}

function rtdbUrl(env: WorkerEnv, path: string): string {
    const baseUrl = env.FIREBASE_DB_URL.replace(/\/$/, '');
    const encodedPath = encodeRtdbPath(path);
    return encodedPath ? baseUrl + '/' + encodedPath + '.json' : baseUrl + '/.json';
}

function firestoreCollectionUrl(env: WorkerEnv, collectionId: string, documentId: string): string {
    return 'https://firestore.googleapis.com/v1/projects/' +
        encodeURIComponent(env.FIREBASE_PROJECT_ID) +
        '/databases/(default)/documents/' +
        encodeURIComponent(collectionId) +
        '?documentId=' +
        encodeURIComponent(documentId);
}

function parseJsonBody(text: string): unknown {
    if (!text.trim()) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function firebaseErrorMessage(body: unknown): string {
    if (isRecord(body) && 'error' in body) {
        return String(body.error);
    }
    return String(body ?? 'Unknown Firebase REST error');
}

async function readRtdb<T>(env: WorkerEnv, accessToken: string, path: string): Promise<T | null> {
    const response = await fetch(rtdbUrl(env, path), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + accessToken },
    });
    const text = await response.text();
    const body = parseJsonBody(text);

    if (!response.ok) {
        throw new Error('Firebase RTDB GET ' + path + ' failed (' + response.status + '): ' + firebaseErrorMessage(body));
    }

    return body as T | null;
}

async function writeRtdb(env: WorkerEnv, accessToken: string, path: string, value: unknown): Promise<void> {
    const response = await fetch(rtdbUrl(env, path), {
        method: 'PUT',
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(value),
    });
    const text = await response.text();
    const body = parseJsonBody(text);

    if (!response.ok) {
        throw new Error('Firebase RTDB PUT ' + path + ' failed (' + response.status + '): ' + firebaseErrorMessage(body));
    }
}

function firestoreValue(value: unknown): Record<string, unknown> {
    if (value === null) {
        return { nullValue: null };
    }

    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(firestoreValue) } };
    }

    if (value instanceof Date) {
        return { timestampValue: value.toISOString() };
    }

    if (typeof value === 'number') {
        return Number.isInteger(value)
            ? { integerValue: String(value) }
            : { doubleValue: value };
    }

    if (typeof value === 'boolean') {
        return { booleanValue: value };
    }

    if (isRecord(value)) {
        return { mapValue: { fields: firestoreFields(value) } };
    }

    return { stringValue: String(value ?? '') };
}

function firestoreFields(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(record)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, firestoreValue(value)])
    );
}

async function createFirestoreDoc(
    env: WorkerEnv,
    accessToken: string,
    collectionId: string,
    documentId: string,
    value: Record<string, unknown>
): Promise<void> {
    const response = await fetch(firestoreCollectionUrl(env, collectionId, documentId), {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: firestoreFields(value) }),
    });
    const text = await response.text();
    const body = parseJsonBody(text);

    if (!response.ok) {
        throw new Error('Firestore create ' + collectionId + '/' + documentId + ' failed (' + response.status + '): ' + firebaseErrorMessage(body));
    }
}

function stripUndefined<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => stripUndefined(item)) as T;
    }
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, current]) => current !== undefined)
                .map(([key, current]) => [key, stripUndefined(current)])
        ) as T;
    }
    return value;
}

function normalizeTime(value: number | string | undefined, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsedNumber = Number(value);
        if (Number.isFinite(parsedNumber)) {
            return parsedNumber;
        }
        const parsedDate = new Date(value);
        if (!Number.isNaN(parsedDate.getTime())) {
            return parsedDate.getTime();
        }
    }
    return fallback;
}

function determineStatus(availableFrom: number, dueDate: number): 'scheduled' | 'active' | 'past_due' {
    const now = Date.now();
    if (availableFrom > now) {
        return 'scheduled';
    }
    if (dueDate < now) {
        return 'past_due';
    }
    return 'active';
}

function readingV2AssignmentPayloadPath(homeworkId: string, compositionVersionId: string): string {
    return 'reading_v2/projections/assignment_payloads/' + homeworkId + ':' + compositionVersionId;
}

function studentSafeAssignmentPayloadPath(homeworkId: string): string {
    return 'homework_student_safe_tests/' + homeworkId;
}

function studentSafeAssignmentAccessPath(homeworkId: string): string {
    return 'homework_student_safe_test_access/' + homeworkId;
}

function studentAccessMap(studentIds: string[]): Record<string, true> {
    return Object.fromEntries([...new Set(studentIds)].map((studentId) => [studentId, true]));
}

function readingV2PassageRefItems(composition: Record<string, any>): Record<string, unknown>[] {
    return [...(Array.isArray(composition.passageRefs) ? composition.passageRefs : [])]
        .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0))
        .map((passageRef, index) => {
            const order = Number(passageRef.order ?? index + 1);
            const testTypeIds = Array.isArray(passageRef.testTypeIdsSnapshot)
                ? passageRef.testTypeIdsSnapshot
                : Array.isArray(passageRef.testType?.testTypeIds)
                    ? passageRef.testType.testTypeIds
                    : [];

            return stripUndefined({
                passageMaterialId: String(passageRef.passageMaterialId ?? passageRef.materialId ?? ''),
                snapshotVersionId: String(passageRef.snapshotVersionId ?? ''),
                titleSnapshot: String(passageRef.titleSnapshot ?? passageRef.title ?? 'Untitled Passage'),
                questionCount: Number(passageRef.questionCountSnapshot ?? passageRef.questionCount ?? 0),
                testTypeIds,
                sourceOrderDisplay: passageRef.sourceOrderDisplaySnapshot ?? passageRef.source?.sourceOrderDisplay,
                sourceFullTestTitle: passageRef.source?.sourceFullTestTitle,
                order,
            });
        });
}

function buildReadingV2Assignment(input: {
    assignmentId: string;
    content: ContentResolution;
    now: number;
}): {
    readingPassageSet: Record<string, unknown>;
    payload: { path: string; projection: Record<string, unknown> };
} | null {
    const fullTest = input.content.readingV2FullTest;
    if (!fullTest) {
        return null;
    }

    const composition = fullTest.composition;
    const compositionVersionId = String(composition.publishedVersionId ?? input.content.contentRef.version ?? '').trim();
    if (!compositionVersionId) {
        throw assignmentError('CONTENT_UNPUBLISHED', 'Reading V2 full test has no published composition version.', 400);
    }

    const materialId = 'reading-passage-set:' + input.assignmentId;
    const frozenAt = new Date(input.now).toISOString();
    const payloadPath = readingV2AssignmentPayloadPath(input.assignmentId, compositionVersionId);
    const readingPassageSet = stripUndefined({
        titleSnapshot: input.content.materialTitle,
        items: readingV2PassageRefItems(composition),
        compositionId: composition.compositionId,
        compositionVersionId,
        assignmentPayloadPath: payloadPath,
        assignmentPayloadKey: input.assignmentId + ':' + compositionVersionId,
        frozenAt,
    });

    const projection = stripUndefined({
        ...fullTest.projection,
        materialId,
        projectionId: 'homework-set:' + input.assignmentId,
        sourceDocumentId: 'homework:' + input.assignmentId,
        sourceSnapshotVersionId: 'homework-set:' + input.assignmentId,
        generatedAt: frozenAt,
        content: isRecord(fullTest.projection.content)
            ? {
                ...fullTest.projection.content,
                title: input.content.materialTitle,
                materialId,
            }
            : fullTest.projection.content,
        assignmentManifest: {
            homeworkId: input.assignmentId,
            compositionId: String(composition.compositionId ?? ''),
            compositionVersionId,
            frozenAt,
            passageRefs: (readingPassageSet.items as Record<string, any>[]).map((item) => ({
                passageMaterialId: item.passageMaterialId,
                snapshotVersionId: item.snapshotVersionId,
                order: item.order,
            })),
        },
    });

    return {
        readingPassageSet,
        payload: {
            path: payloadPath,
            projection,
        },
    };
}

function isDraft(record: Record<string, any>): boolean {
    const state = String(record.status ?? record.state ?? record.lifecycleState ?? '').trim().toLowerCase();
    return state === 'draft' || state === 'saved-draft' || record.draft === true || record.isDraft === true;
}

function isArchivedOrDeleted(record: Record<string, any>): boolean {
    const state = String(record.status ?? record.state ?? record.lifecycleState ?? '').trim().toLowerCase();
    return record.deleted === true ||
        record.archived === true ||
        record.removed === true ||
        state === 'deleted' ||
        state === 'removed' ||
        state === 'archived';
}

function isUnpublished(record: Record<string, any>): boolean {
    const state = String(record.status ?? record.state ?? record.lifecycleState ?? '').trim().toLowerCase();
    return record.published === false || record.unpublished === true || state === 'unpublished' || state === 'private-draft';
}

function assertPublishedAssignable(record: Record<string, any>): AssignmentError | null {
    if (isDraft(record)) {
        return assignmentError('CONTENT_DRAFT', 'Draft content cannot be assigned.', 400);
    }
    if (isArchivedOrDeleted(record)) {
        return assignmentError('CONTENT_NOT_ASSIGNABLE', 'Archived, deleted, or removed content cannot be assigned.', 400);
    }
    if (record.isComplete === false || record.complete === false) {
        return assignmentError('CONTENT_NOT_ASSIGNABLE', 'Incomplete content cannot be assigned.', 400);
    }
    if (isUnpublished(record)) {
        return assignmentError('CONTENT_UNPUBLISHED', 'Unpublished content cannot be assigned.', 400);
    }
    return null;
}

function teacherOwnsRecord(record: Record<string, any>, uid: string): boolean {
    return record.ownerId === uid || record.createdBy === uid || record.userId === uid || record.teacherId === uid;
}

function isPublicRecord(record: Record<string, any>): boolean {
    const visibility = String(record.visibility ?? record.scope ?? '').trim().toLowerCase();
    return record.isPublic === true || visibility === 'public';
}

function assertContentAccess(record: Record<string, any>, uid: string, role: string): AssignmentError | null {
    if (role === 'super_admin' || teacherOwnsRecord(record, uid) || isPublicRecord(record)) {
        return null;
    }
    return assignmentError('TEACHER_NOT_ALLOWED', 'Teacher cannot assign this content.', 403);
}

async function resolveTarget(
    env: WorkerEnv,
    accessToken: string,
    target: HomeworkTarget | undefined,
    uid: string,
    role: string
): Promise<TargetResolution | AssignmentError> {
    if (!target || !target.type) {
        return assignmentError('INVALID_ASSIGNMENT_REQUEST', 'Missing assignment target.', 400);
    }

    if (target.type === 'class') {
        const classId = String(target.classId ?? '').trim();
        if (!classId) {
            return assignmentError('INVALID_ASSIGNMENT_REQUEST', 'Missing class target.', 400);
        }

        const classData = await readRtdb<Record<string, any>>(env, accessToken, 'classes/' + classId);
        if (!classData) {
            return assignmentError('TARGET_NOT_ALLOWED', 'Class target was not found.', 403);
        }

        if (role !== 'super_admin' && !teacherOwnsRecord(classData, uid)) {
            return assignmentError('TARGET_NOT_ALLOWED', 'Teacher cannot assign to this class.', 403);
        }

        const students = isRecord(classData.students) ? classData.students : {};
        return {
            target: {
                type: 'class',
                classId,
                className: target.className || classData.name,
            },
            totalAssigned: Object.keys(students).length,
            authorizedStudentIds: [],
        };
    }

    if (target.type === 'students') {
        const studentIds = Array.isArray(target.studentIds)
            ? target.studentIds.map((id) => String(id).trim()).filter(Boolean)
            : [];
        if (studentIds.length === 0) {
            return assignmentError('INVALID_ASSIGNMENT_REQUEST', 'Missing student targets.', 400);
        }

        const allowedStudentIds = new Set<string>();

        if (role === 'super_admin') {
            studentIds.forEach((studentId) => allowedStudentIds.add(studentId));
        } else {
            const [classes, linkedStudents, assignments] = await Promise.all([
                readRtdb<Record<string, any>>(env, accessToken, 'classes'),
                readRtdb<Record<string, any>>(env, accessToken, 'student_teacher_links/' + uid),
                readRtdb<Record<string, any>>(env, accessToken, 'student_teacher_assignments'),
            ]);

            Object.values(classes ?? {}).forEach((classData) => {
                if (!isRecord(classData)) {
                    return;
                }
                if (!teacherOwnsRecord(classData, uid)) {
                    return;
                }
                const students = isRecord(classData.students) ? classData.students : {};
                Object.entries(students).forEach(([studentKey, entry]) => {
                    allowedStudentIds.add(studentKey);
                    if (isRecord(entry) && typeof entry.uid === 'string') {
                        allowedStudentIds.add(entry.uid);
                    }
                });
            });

            Object.entries(linkedStudents ?? {}).forEach(([studentId, linked]) => {
                if (linked === true || (isRecord(linked) && linked.status === 'active')) {
                    allowedStudentIds.add(studentId);
                }
            });

            Object.values(assignments ?? {}).forEach((assignment) => {
                if (
                    isRecord(assignment) &&
                    assignment.teacherId === uid &&
                    assignment.status === 'active' &&
                    typeof assignment.studentId === 'string'
                ) {
                    allowedStudentIds.add(assignment.studentId);
                }
            });
        }

        if (studentIds.some((studentId) => !allowedStudentIds.has(studentId))) {
            return assignmentError('TARGET_NOT_ALLOWED', 'Teacher cannot assign to one or more students.', 403);
        }

        return {
            target: {
                type: 'students',
                studentIds,
                studentNames: Array.isArray(target.studentNames) ? target.studentNames : undefined,
            },
            totalAssigned: new Set(studentIds).size,
            authorizedStudentIds: [...new Set(studentIds)],
        };
    }

    return assignmentError('TARGET_NOT_ALLOWED', 'Assignment target type is not supported.', 400);
}

async function loadTestRecord(env: WorkerEnv, accessToken: string, contentId: string): Promise<Record<string, any> | null> {
    return await readRtdb<Record<string, any>>(env, accessToken, 'tests/' + contentId) ??
        await readRtdb<Record<string, any>>(env, accessToken, 'quizzes/' + contentId);
}

function skillForKind(kind: HomeworkContentKind): 'reading' | 'listening' | 'writing' | 'speaking' {
    if (kind === 'ielts_listening') {
        return 'listening';
    }
    if (kind === 'ielts_writing') {
        return 'writing';
    }
    return 'reading';
}

function kindMatchesRecord(kind: HomeworkContentKind, record: Record<string, any>): boolean {
    if (kind === 'thcs_test') {
        return record.testType === 'THCS-THPT';
    }
    const skill = String(record.skill ?? record.metadata?.skill ?? '').trim().toLowerCase();
    if (kind === 'ielts_reading') {
        return skill === 'reading';
    }
    if (kind === 'ielts_listening') {
        return skill === 'listening';
    }
    if (kind === 'ielts_writing') {
        return skill === 'writing';
    }
    return false;
}

function buildStudentSafeWritingProjection(record: Record<string, any>): Record<string, unknown> {
    const tasks = Array.isArray(record.tasks)
        ? record.tasks.map((task) => {
            if (!isRecord(task)) {
                return task;
            }

            const { modelAnswer, rubricNotes, ...studentTask } = task;
            void modelAnswer;
            void rubricNotes;
            return studentTask;
        })
        : record.tasks;

    return stripUndefined({
        ...record,
        tasks,
    });
}

function requiresLegacyStudentSafeProjection(kind: HomeworkContentKind): boolean {
    return kind === 'ielts_reading' || kind === 'ielts_listening';
}

async function assertLegacyStudentSafeProjection(
    env: WorkerEnv,
    accessToken: string,
    contentRef: HomeworkContentRef,
    record: Record<string, any>
): Promise<AssignmentError | null> {
    if (!requiresLegacyStudentSafeProjection(contentRef.contentKind)) {
        return null;
    }

    if (record.deliveryProjectionReady !== true) {
        return assignmentError('CONTENT_NOT_ASSIGNABLE', 'Content is missing a safe delivery projection.', 400);
    }

    const projection = await readRtdb<Record<string, any>>(env, accessToken, 'student_safe_tests/' + contentRef.contentId);
    if (!isRecord(projection)) {
        return assignmentError('CONTENT_NOT_ASSIGNABLE', 'Content is missing a safe delivery projection.', 400);
    }

    return null;
}

async function resolveStandardTestContent(
    env: WorkerEnv,
    accessToken: string,
    contentRef: HomeworkContentRef,
    uid: string,
    role: string
): Promise<ContentResolution | AssignmentError> {
    const record = await loadTestRecord(env, accessToken, contentRef.contentId);
    if (!record) {
        return assignmentError('CONTENT_NOT_FOUND', 'Content was not found.', 404);
    }

    const assignableError = assertPublishedAssignable(record);
    if (assignableError) {
        return assignableError;
    }

    const accessError = assertContentAccess(record, uid, role);
    if (accessError) {
        return accessError;
    }

    if (!kindMatchesRecord(contentRef.contentKind, record)) {
        return assignmentError('UNSUPPORTED_CONTENT_KIND', 'Submitted content kind does not match the content record.', 400);
    }

    const projectionError = await assertLegacyStudentSafeProjection(env, accessToken, contentRef, record);
    if (projectionError) {
        return projectionError;
    }

    const title = String(
        record.testType === 'THCS-THPT'
            ? record.metadata?.title ?? record.title ?? contentRef.title ?? 'Untitled THCS Test'
            : record.title ?? record.metadata?.title ?? contentRef.title ?? 'Untitled Test'
    );

    return {
        contentRef: stripUndefined({
            contentKind: contentRef.contentKind,
            contentId: contentRef.contentId,
            version: contentRef.version,
            title,
            source: contentRef.source,
        }),
        materialId: contentRef.contentId,
        materialTitle: title,
        materialType: contentRef.contentKind === 'thcs_test' ? 'thcs-test' : 'test',
        materialSkill: skillForKind(contentRef.contentKind),
        studentSafeAssignmentPayload: contentRef.contentKind === 'ielts_writing'
            ? buildStudentSafeWritingProjection(record)
            : undefined,
    };
}

async function resolveReadingPassageContent(
    env: WorkerEnv,
    accessToken: string,
    contentRef: HomeworkContentRef,
    uid: string,
    role: string
): Promise<ContentResolution | AssignmentError> {
    const metadata = await readRtdb<Record<string, any>>(env, accessToken, 'reading_v2/material_metadata/' + contentRef.contentId);
    if (!metadata) {
        return assignmentError('CONTENT_NOT_FOUND', 'Reading Passage was not found.', 404);
    }

    const assignableError = assertPublishedAssignable(metadata);
    if (assignableError) {
        return assignableError;
    }

    const accessError = assertContentAccess(metadata, uid, role);
    if (accessError) {
        return accessError;
    }

    const snapshotVersionId = String(contentRef.version ?? metadata.publishedSnapshotVersionId ?? metadata.currentVersionId ?? '').trim();
    if (!snapshotVersionId) {
        return assignmentError('CONTENT_UNPUBLISHED', 'Reading Passage has no published version.', 400);
    }

    const [snapshot, projection] = await Promise.all([
        readRtdb<Record<string, any>>(env, accessToken, 'reading_v2/published_snapshots/' + contentRef.contentId + '/' + snapshotVersionId),
        readRtdb<Record<string, any>>(env, accessToken, 'reading_v2/projections/student_safe_tests/' + contentRef.contentId + ':' + snapshotVersionId),
    ]);

    if (!snapshot) {
        return assignmentError('CONTENT_NOT_FOUND', 'Reading Passage published snapshot was not found.', 404);
    }

    if (!projection || projection.projectionKind !== 'student-safe') {
        return assignmentError('CONTENT_NOT_ASSIGNABLE', 'Reading Passage is missing a safe delivery projection.', 400);
    }

    const title = String(metadata.title ?? snapshot.title ?? projection.content?.title ?? contentRef.title ?? 'Untitled Reading Passage');
    const questionCount = Number(metadata.questionCount ?? snapshot.questionCount ?? projection.content?.questionCount ?? 0);

    return {
        contentRef: stripUndefined({
            contentKind: 'reading_passage',
            contentId: contentRef.contentId,
            version: snapshotVersionId,
            title,
            source: contentRef.source ?? 'reading-v2',
        }),
        materialId: contentRef.contentId,
        materialTitle: title,
        materialType: 'reading-passage',
        materialSkill: 'reading',
        readingPassageSnapshot: stripUndefined({
            passageMaterialId: contentRef.contentId,
            snapshotVersionId,
            titleSnapshot: title,
            questionCount,
            testTypeIds: Array.isArray(metadata.testTypeIds) ? metadata.testTypeIds : [],
            sourceOrderDisplay: metadata.sourceOrderDisplay,
            sourceFullTestTitle: metadata.sourceFullTestTitle,
        }),
    };
}

function lowerText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

function isReadingV2Source(contentRef: HomeworkContentRef): boolean {
    return lowerText(contentRef.source) === 'reading-v2';
}

function isReadingV2FullTestMetadata(metadata: Record<string, any>): boolean {
    const materialKind = lowerText(metadata.materialKind ?? metadata.kind ?? metadata.type);
    return materialKind === 'reading-v2-full-test-composition' ||
        materialKind === 'full-test' ||
        materialKind === 'full_test' ||
        lowerText(metadata.deliveryEngine) === 'reading-v2' && typeof metadata.compositionId === 'string';
}

function hasBrokenReadingV2Refs(composition: Record<string, any>): boolean {
    return composition.hasBrokenRefs === true ||
        Number(composition.brokenRefCount ?? 0) > 0 ||
        (Array.isArray(composition.brokenRefReasons) && composition.brokenRefReasons.length > 0);
}

async function resolveReadingV2FullTestContent(
    env: WorkerEnv,
    accessToken: string,
    contentRef: HomeworkContentRef,
    uid: string,
    role: string
): Promise<ContentResolution | AssignmentError> {
    const metadata = await readRtdb<Record<string, any>>(env, accessToken, 'reading_v2/material_metadata/' + contentRef.contentId);
    if (!metadata) {
        return assignmentError('CONTENT_NOT_FOUND', 'Reading V2 content was not found.', 404);
    }

    const assignableError = assertPublishedAssignable(metadata);
    if (assignableError) {
        return assignableError;
    }

    const accessError = assertContentAccess(metadata, uid, role);
    if (accessError) {
        return accessError;
    }

    if (!isReadingV2FullTestMetadata(metadata)) {
        return assignmentError('UNSUPPORTED_CONTENT_KIND', 'Reading V2 source is not a full reading test.', 400);
    }

    const snapshotVersionId = String(
        contentRef.version ??
        metadata.publishedSnapshotVersionId ??
        metadata.currentSnapshotVersionId ??
        metadata.publishedVersionId ??
        ''
    ).trim();
    if (!snapshotVersionId) {
        return assignmentError('CONTENT_UNPUBLISHED', 'Reading V2 content has no published version.', 400);
    }

    const compositionId = String(metadata.compositionId ?? contentRef.contentId).trim();
    const [versionedComposition, currentComposition, projection] = await Promise.all([
        readRtdb<Record<string, any>>(env, accessToken, 'reading_v2/full_test_composition_versions/' + compositionId + '/' + snapshotVersionId),
        readRtdb<Record<string, any>>(env, accessToken, 'reading_v2/full_test_compositions/' + compositionId),
        readRtdb<Record<string, any>>(env, accessToken, 'reading_v2/projections/student_safe_tests/' + contentRef.contentId + ':' + snapshotVersionId),
    ]);

    const composition = versionedComposition ?? currentComposition;
    if (!composition) {
        return assignmentError('CONTENT_NOT_FOUND', 'Reading V2 full-test composition was not found.', 404);
    }

    const compositionAssignableError = assertPublishedAssignable({
        ...composition,
        status: composition.status ?? composition.state ?? metadata.status ?? metadata.state ?? 'published',
        published: composition.published ?? metadata.published ?? true,
    });
    if (compositionAssignableError) {
        return compositionAssignableError;
    }

    const compositionAccessError = assertContentAccess({
        ...composition,
        ownerId: composition.ownerId ?? metadata.ownerId,
        visibility: composition.visibility ?? metadata.visibility,
        isPublic: composition.isPublic ?? metadata.isPublic,
    }, uid, role);
    if (compositionAccessError) {
        return compositionAccessError;
    }

    if (hasBrokenReadingV2Refs(composition) || !Array.isArray(composition.passageRefs) || composition.passageRefs.length === 0) {
        return assignmentError('CONTENT_NOT_ASSIGNABLE', 'Reading V2 full test has incomplete or broken passage references.', 400);
    }

    if (!projection || projection.projectionKind !== 'student-safe') {
        return assignmentError('CONTENT_NOT_ASSIGNABLE', 'Reading V2 content is missing a safe delivery projection.', 400);
    }

    const title = String(metadata.title ?? composition.title ?? projection.content?.title ?? contentRef.title ?? 'Untitled Reading V2 Test');

    return {
        contentRef: stripUndefined({
            contentKind: 'ielts_reading',
            contentId: contentRef.contentId,
            version: snapshotVersionId,
            title,
            source: 'reading-v2',
        }),
        materialId: contentRef.contentId,
        materialTitle: title,
        materialType: 'reading-passage-set',
        materialSkill: 'reading',
        readingV2FullTest: {
            composition: {
                ...composition,
                compositionId,
                testMaterialId: composition.testMaterialId ?? contentRef.contentId,
                publishedVersionId: composition.publishedVersionId ?? snapshotVersionId,
                title,
            },
            projection,
        },
    };
}

async function resolveContent(
    env: WorkerEnv,
    accessToken: string,
    contentRef: HomeworkContentRef | undefined,
    uid: string,
    role: string
): Promise<ContentResolution | AssignmentError> {
    if (!contentRef || typeof contentRef.contentKind !== 'string' || typeof contentRef.contentId !== 'string') {
        return assignmentError('INVALID_ASSIGNMENT_REQUEST', 'Missing content reference.', 400);
    }

    const submittedKind = contentRef.contentKind.trim();
    if (submittedKind === 'book') {
        return assignmentError('WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED', 'Whole-book assignment is not supported.', 400);
    }

    if (!SUPPORTED_CONTENT_KINDS.has(submittedKind as HomeworkContentKind)) {
        return assignmentError('UNSUPPORTED_CONTENT_KIND', 'Unsupported content kind.', 400);
    }

    if (!contentRef.contentId.trim()) {
        return assignmentError('INVALID_ASSIGNMENT_REQUEST', 'Missing content id.', 400);
    }

    const normalizedContentRef = {
        ...contentRef,
        contentKind: submittedKind as HomeworkContentKind,
    };

    if (normalizedContentRef.contentKind === 'reading_passage') {
        return resolveReadingPassageContent(env, accessToken, normalizedContentRef, uid, role);
    }

    if (normalizedContentRef.contentKind === 'ielts_reading' && isReadingV2Source(normalizedContentRef)) {
        return resolveReadingV2FullTestContent(env, accessToken, normalizedContentRef, uid, role);
    }

    return resolveStandardTestContent(env, accessToken, normalizedContentRef, uid, role);
}

function buildHomeworkRecord(input: {
    assignmentId: string;
    request: CreateHomeworkAssignmentRequest;
    target: TargetResolution;
    content: ContentResolution;
    teacherId: string;
    now: number;
    readingV2Assignment?: {
        readingPassageSet: Record<string, unknown>;
        payload: { path: string; projection: Record<string, unknown> };
    } | null;
}): Record<string, unknown> {
    const availableFrom = normalizeTime(input.request.availableFrom, input.now);
    const dueDate = normalizeTime(input.request.dueDate, NaN);
    if (!Number.isFinite(dueDate)) {
        throw assignmentError('INVALID_ASSIGNMENT_REQUEST', 'Missing due date.', 400);
    }

    const materialId = input.readingV2Assignment
        ? 'reading-passage-set:' + input.assignmentId
        : input.content.materialId;

    return stripUndefined({
        id: input.assignmentId,
        createdBy: input.teacherId,
        createdAt: input.now,
        updatedAt: input.now,
        materialId,
        materialTitle: input.content.materialTitle,
        materialType: input.content.materialType,
        materialSkill: input.content.materialSkill,
        contentRef: input.content.contentRef,
        target: input.target.target,
        scheduling: {
            availableFrom,
            dueDate,
        },
        config: input.request.config ?? {},
        visibility: DEFAULT_VISIBILITY,
        status: determineStatus(availableFrom, dueDate),
        tags: Array.isArray(input.request.tags) ? input.request.tags : [],
        archived: false,
        studentOverrides: {},
        title: input.request.title,
        description: input.request.instructions || '',
        stats: {
            ...DEFAULT_STATS,
            totalAssigned: input.target.totalAssigned,
        },
        thcsConfig: input.content.materialType === 'thcs-test' ? input.request.thcsConfig : undefined,
        antiCheatConfig: input.request.antiCheatConfig,
        readingPassageSnapshot: input.content.readingPassageSnapshot,
        readingPassageSet: input.readingV2Assignment?.readingPassageSet ?? input.content.readingPassageSet,
        readingV2AssignmentPayloadPath: input.readingV2Assignment?.payload.path,
        studentSafeTestPayloadPath: input.content.studentSafeAssignmentPayload
            ? studentSafeAssignmentPayloadPath(input.assignmentId)
            : undefined,
    });
}

function isAssignmentError(value: unknown): value is AssignmentError {
    return isRecord(value) &&
        typeof value.status === 'number' &&
        typeof value.reasonCode === 'string' &&
        typeof value.message === 'string';
}

export async function handleCreateHomeworkAssignment(
    request: Request,
    env: WorkerEnv
): Promise<Response> {
    const auth = await verifyFirebaseToken(request.headers.get('Authorization'), env);
    if (!auth.valid || !auth.uid) {
        return errorResponse(assignmentError('INVALID_ASSIGNMENT_REQUEST', auth.error ?? 'Unauthorized', 401));
    }

    try {
        const parsedBody = await request.json();
        if (!isRecord(parsedBody)) {
            return errorResponse(assignmentError('INVALID_ASSIGNMENT_REQUEST', 'Invalid assignment request.', 400));
        }

        const body = parsedBody as CreateHomeworkAssignmentRequest;
        const accessToken = await getFirebaseAccessToken(env.GOOGLE_SA_KEY);
        const user = await readRtdb<Record<string, any>>(env, accessToken, 'users/' + auth.uid);
        const role = String(user?.role ?? '').trim();

        if (role !== 'teacher' && role !== 'super_admin') {
            return errorResponse(assignmentError('TEACHER_NOT_ALLOWED', 'Teacher role is required.', 403));
        }

        const [target, content] = await Promise.all([
            resolveTarget(env, accessToken, body.target, auth.uid, role),
            resolveContent(env, accessToken, body.contentRef, auth.uid, role),
        ]);

        if (isAssignmentError(target)) {
            return errorResponse(target);
        }
        if (isAssignmentError(content)) {
            return errorResponse(content);
        }

        const assignmentId = 'homework-' + crypto.randomUUID();
        const now = Date.now();
        const readingV2Assignment = buildReadingV2Assignment({
            assignmentId,
            content,
            now,
        });
        const homework = buildHomeworkRecord({
            assignmentId,
            request: body,
            target,
            content,
            teacherId: auth.uid,
            now,
            readingV2Assignment,
        });

        if (readingV2Assignment) {
            await writeRtdb(env, accessToken, readingV2Assignment.payload.path, readingV2Assignment.payload.projection);
        }

        if (content.studentSafeAssignmentPayload) {
            const payloadPath = studentSafeAssignmentPayloadPath(assignmentId);
            await writeRtdb(
                env,
                accessToken,
                payloadPath,
                stripUndefined({
                    ...content.studentSafeAssignmentPayload,
                    homeworkId: assignmentId,
                    teacherId: auth.uid,
                    targetType: target.target.type,
                    classId: target.target.type === 'class' ? target.target.classId : undefined,
                    contentRef: content.contentRef,
                    materialId: content.materialId,
                    materialTitle: content.materialTitle,
                }),
            );
            if (target.authorizedStudentIds.length > 0) {
                await writeRtdb(
                    env,
                    accessToken,
                    studentSafeAssignmentAccessPath(assignmentId),
                    studentAccessMap(target.authorizedStudentIds),
                );
            }
        }

        await createFirestoreDoc(env, accessToken, 'homework_assignments', assignmentId, homework);

        return jsonResponse({
            assignmentId,
            contentRef: content.contentRef,
            materialTitle: content.materialTitle,
            materialType: content.materialType,
            totalAssigned: target.totalAssigned,
        }, 201);
    } catch (err: unknown) {
        if (isAssignmentError(err)) {
            return errorResponse(err);
        }
        const message = err instanceof Error ? err.message : 'Failed to create homework assignment.';
        console.error('[HomeworkAssignments] Failed:', message);
        return errorResponse(assignmentError('INVALID_ASSIGNMENT_REQUEST', 'Failed to create homework assignment.', 500));
    }
}
