import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../types';
import { verifyFirebaseToken } from '../auth/firebase-auth';
import { getFirebaseAccessToken } from '../auth/google-oauth';
import { handleCreateHomeworkAssignment } from './assignments';

vi.mock('../auth/firebase-auth', () => ({
    verifyFirebaseToken: vi.fn(),
}));

vi.mock('../auth/google-oauth', () => ({
    getFirebaseAccessToken: vi.fn(),
}));

const env = {
    FIREBASE_PROJECT_ID: 'temp-a1437',
    FIREBASE_DB_URL: 'https://db.example.test',
    GOOGLE_SA_KEY: '{}',
} as WorkerEnv;

const classRecord = {
    id: 'class-1',
    name: 'Class 1',
    teacherId: 'teacher-1',
    students: {
        'student-1': { uid: 'student-1', name: 'Student One' },
        'student-2': { uid: 'student-2', name: 'Student Two' },
    },
};

const baseConfig = {
    timerMinutes: null,
    maxAttempts: null,
    feedbackTiming: 'after_completion',
    lateSubmissionAllowed: false,
};

const assignmentBody = (overrides: Record<string, unknown> = {}) => ({
    contentRef: { contentKind: 'ielts_reading', contentId: 'ielts-reading-1' },
    target: { type: 'class', classId: 'class-1', className: 'Class 1' },
    config: baseConfig,
    dueDate: 1780000000000,
    availableFrom: 1779900000000,
    instructions: 'Read before Friday.',
    tags: ['practice'],
    ...overrides,
});

const requestFor = (body: unknown, auth = 'Bearer teacher-token') => new Request(
    'https://worker.example.test/api/homework/assignments',
    {
        method: 'POST',
        headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    },
);

const requestWithoutAuth = (body: unknown) => new Request(
    'https://worker.example.test/api/homework/assignments',
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    },
);

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

const makeTestRecord = (input: {
    id: string;
    skill: string;
    testType?: string;
    title?: string;
    status?: string;
    published?: boolean;
    isComplete?: boolean;
    ownerId?: string;
    isPublic?: boolean;
    deliveryProjectionReady?: boolean;
    omitDeliveryProjectionReady?: boolean;
}) => ({
    id: input.id,
    title: input.title ?? input.id,
    testType: input.testType ?? 'IELTS',
    skill: input.skill,
    status: input.status ?? 'published',
    published: input.published ?? true,
    isComplete: input.isComplete ?? true,
    ownerId: input.ownerId ?? 'teacher-1',
    isPublic: input.isPublic ?? false,
    solo_enabled: true,
    ...(!input.omitDeliveryProjectionReady ? { deliveryProjectionReady: input.deliveryProjectionReady ?? true } : {}),
    questionCount: 3,
    questions: [{ id: 'q1' }],
});

const makeFetchMock = (records: Map<string, unknown>) => {
    const firestoreWrites: unknown[] = [];
    const rtdbWrites: Array<{ path: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const method = init?.method ?? 'GET';

        if (url.hostname === 'db.example.test') {
            const path = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
            if (method === 'GET') {
                return json(records.has(path) ? records.get(path) : null);
            }
            if (method === 'PUT' || method === 'PATCH') {
                rtdbWrites.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
                return json({ ok: true });
            }
        }

        if (url.hostname === 'firestore.googleapis.com') {
            expect(method).toBe('POST');
            firestoreWrites.push(init?.body ? JSON.parse(String(init.body)) : null);
            return json({
                name: 'projects/temp-a1437/databases/(default)/documents/homework_assignments/hw-1',
            });
        }

        throw new Error(`Unexpected fetch ${method} ${url.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return { fetchMock, firestoreWrites, rtdbWrites };
};

const okRecords = (contentRecord = makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading' })) => new Map<string, unknown>([
    ['users/teacher-1', { role: 'teacher', uid: 'teacher-1' }],
    ['classes/class-1', classRecord],
    ['tests/ielts-reading-1', contentRecord],
    ['student_safe_tests/' + contentRecord.id, { id: contentRecord.id, title: contentRecord.title, questions: [{ id: 'q1' }] }],
]);

const recordsForTestContent = (contentRecord: ReturnType<typeof makeTestRecord>) => {
    const records = okRecords(contentRecord);
    records.delete('tests/ielts-reading-1');
    records.set('tests/' + contentRecord.id, contentRecord);
    return records;
};

const firestoreFields = (write: unknown): Record<string, any> =>
    ((write as { fields?: Record<string, any> })?.fields ?? {});

describe('homework assignment Worker route', () => {
    beforeEach(() => {
        vi.mocked(verifyFirebaseToken).mockResolvedValue({
            valid: true,
            uid: 'teacher-1',
            name: 'Teacher One',
            email: 'teacher@example.test',
        });
        vi.mocked(getFirebaseAccessToken).mockResolvedValue('google-token');
    });

    it('rejects missing auth with a stable reason code', async () => {
        vi.mocked(verifyFirebaseToken).mockResolvedValue({ valid: false, error: 'missing token' });
        makeFetchMock(new Map());

        const response = await handleCreateHomeworkAssignment(requestWithoutAuth(assignmentBody()), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(401);
        expect(body.reasonCode).toBe('INVALID_ASSIGNMENT_REQUEST');
        expect(verifyFirebaseToken).toHaveBeenCalledWith(null, env);
    });

    it('rejects invalid auth with a stable reason code', async () => {
        vi.mocked(verifyFirebaseToken).mockResolvedValue({ valid: false, error: 'bad token' });
        makeFetchMock(new Map());

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody(), 'Bearer bad-token'), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(401);
        expect(body.reasonCode).toBe('INVALID_ASSIGNMENT_REQUEST');
        expect(verifyFirebaseToken).toHaveBeenCalledWith('Bearer bad-token', env);
    });

    it('rejects non-teacher roles', async () => {
        makeFetchMock(new Map([
            ['users/teacher-1', { role: 'student' }],
        ]));

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody()), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(403);
        expect(body.reasonCode).toBe('TEACHER_NOT_ALLOWED');
    });

    it('rejects a teacher assigning to an unauthorized class', async () => {
        makeFetchMock(new Map([
            ['users/teacher-1', { role: 'teacher' }],
            ['classes/class-1', { ...classRecord, teacherId: 'teacher-2' }],
        ]));

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody()), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(403);
        expect(body.reasonCode).toBe('TARGET_NOT_ALLOWED');
    });

    it('accepts direct student targets through active teacher-student links', async () => {
        const record = makeTestRecord({ id: 'ielts-writing-1', skill: 'Writing', title: 'IELTS Writing' });
        const records = recordsForTestContent(record);
        records.set('classes', {});
        records.set('student_teacher_links/teacher-1', { 'student-linked': true });
        const { firestoreWrites, rtdbWrites } = makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: { contentKind: 'ielts_writing', contentId: 'ielts-writing-1' },
            target: { type: 'students', studentIds: ['student-linked'] },
        })), env);
        const body = await response.json() as Record<string, unknown>;
        const assignmentId = String(body.assignmentId);

        expect(response.status).toBe(201);
        expect(body.assignmentId).toBeTruthy();
        expect(JSON.stringify(firestoreWrites[0])).toContain('student-linked');
        expect(rtdbWrites).toContainEqual({
            path: 'homework_student_safe_test_access/' + assignmentId,
            body: { 'student-linked': true },
        });
    });

    it('accepts direct student targets through active assignment records', async () => {
        const records = okRecords();
        records.set('classes', {});
        records.set('student_teacher_links/teacher-1', {});
        records.set('student_teacher_assignments', {
            assignment1: {
                studentId: 'student-assigned',
                teacherId: 'teacher-1',
                status: 'active',
            },
        });
        const { firestoreWrites } = makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            target: { type: 'students', studentIds: ['student-assigned'] },
        })), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(201);
        expect(body.assignmentId).toBeTruthy();
        expect(JSON.stringify(firestoreWrites[0])).toContain('student-assigned');
    });

    it('rejects direct student targets without class membership or active teacher-student assignment', async () => {
        const records = okRecords();
        records.set('classes', {});
        records.set('student_teacher_links/teacher-1', {});
        records.set('student_teacher_assignments', {
            assignment1: {
                studentId: 'student-other',
                teacherId: 'teacher-2',
                status: 'active',
            },
        });
        makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            target: { type: 'students', studentIds: ['student-not-allowed'] },
        })), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(403);
        expect(body.reasonCode).toBe('TARGET_NOT_ALLOWED');
    });

    it.each([
        ['missing content', new Map<string, unknown>([['users/teacher-1', { role: 'teacher' }], ['classes/class-1', classRecord]]), 'CONTENT_NOT_FOUND'],
        ['draft content', okRecords(makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', status: 'draft' })), 'CONTENT_DRAFT'],
        ['unpublished content', okRecords(makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', published: false })), 'CONTENT_UNPUBLISHED'],
        ['unsafe delivery projection', okRecords(makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', deliveryProjectionReady: false })), 'CONTENT_NOT_ASSIGNABLE'],
        ['missing delivery projection marker', okRecords(makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', omitDeliveryProjectionReady: true })), 'CONTENT_NOT_ASSIGNABLE'],
    ])('rejects %s', async (_label, records, reasonCode) => {
        makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody()), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(body.reasonCode).toBe(reasonCode);
    });

    it('rejects IELTS Reading content when the legacy student-safe projection is missing', async () => {
        const records = okRecords(makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', deliveryProjectionReady: true }));
        records.delete('student_safe_tests/ielts-reading-1');
        makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody()), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(400);
        expect(body.reasonCode).toBe('CONTENT_NOT_ASSIGNABLE');
    });

    it.each([
        ['IELTS Reading', 'ielts_reading', 'ielts-reading-1', 'Reading'],
        ['IELTS Listening', 'ielts_listening', 'ielts-listening-1', 'Listening'],
    ])('rejects %s when deliveryProjectionReady is missing', async (_label, contentKind, contentId, skill) => {
        const record = makeTestRecord({
            id: contentId,
            skill,
            omitDeliveryProjectionReady: true,
        });
        makeFetchMock(recordsForTestContent(record));

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: { contentKind, contentId },
        })), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(400);
        expect(body.reasonCode).toBe('CONTENT_NOT_ASSIGNABLE');
    });

    it.each([
        ['IELTS Reading', 'ielts_reading', 'ielts-reading-1', 'Reading'],
        ['IELTS Listening', 'ielts_listening', 'ielts-listening-1', 'Listening'],
    ])('rejects %s when the legacy student-safe projection is missing', async (_label, contentKind, contentId, skill) => {
        const record = makeTestRecord({
            id: contentId,
            skill,
            deliveryProjectionReady: true,
        });
        const records = recordsForTestContent(record);
        records.delete('student_safe_tests/' + contentId);
        makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: { contentKind, contentId },
        })), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(400);
        expect(body.reasonCode).toBe('CONTENT_NOT_ASSIGNABLE');
    });

    it('rejects whole-book content kind with a stable whole-book reason', async () => {
        makeFetchMock(okRecords());

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: { contentKind: 'book', contentId: 'book-1' },
        })), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(400);
        expect(body.reasonCode).toBe('WHOLE_BOOK_ASSIGNMENT_NOT_SUPPORTED');
    });

    it('rejects unsupported content kind', async () => {
        makeFetchMock(okRecords());

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: { contentKind: 'future_kind', contentId: 'future-1' },
        })), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(400);
        expect(body.reasonCode).toBe('UNSUPPORTED_CONTENT_KIND');
    });

    it.each([
        ['thcs_test', { contentKind: 'thcs_test', contentId: 'thcs-1' }, makeTestRecord({ id: 'thcs-1', skill: 'Reading', testType: 'THCS-THPT', title: 'Grade 10' }), 'thcs-test'],
        ['ielts_reading', { contentKind: 'ielts_reading', contentId: 'ielts-reading-1' }, makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', title: 'IELTS Reading' }), 'test'],
        ['ielts_listening', { contentKind: 'ielts_listening', contentId: 'ielts-listening-1' }, makeTestRecord({ id: 'ielts-listening-1', skill: 'Listening', title: 'IELTS Listening' }), 'test'],
        ['ielts_writing', { contentKind: 'ielts_writing', contentId: 'ielts-writing-1' }, makeTestRecord({ id: 'ielts-writing-1', skill: 'Writing', title: 'IELTS Writing' }), 'test'],
    ])('accepts %s and writes normalized contentRef', async (_label, contentRef, record, expectedMaterialType) => {
        const records = okRecords(record);
        records.delete('tests/ielts-reading-1');
        records.set(`tests/${contentRef.contentId}`, record);
        const { firestoreWrites } = makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({ contentRef })), env);
        const body = await response.json() as Record<string, unknown>;
        const fields = firestoreFields(firestoreWrites[0]);
        const contentRefFields = fields.contentRef.mapValue.fields;

        expect(response.status).toBe(201);
        expect(body.assignmentId).toBeTruthy();
        expect(body.contentRef).toMatchObject(contentRef);
        expect(fields.createdBy.stringValue).toBe('teacher-1');
        expect(fields.materialId.stringValue).toBe(contentRef.contentId);
        expect(fields.materialTitle.stringValue).toBe(record.title);
        expect(fields.materialType.stringValue).toBe(expectedMaterialType);
        expect(fields.materialSkill.stringValue).toBe(String(record.skill).toLowerCase());
        expect(fields.target.mapValue.fields.classId.stringValue).toBe('class-1');
        expect(fields.stats.mapValue.fields.totalAssigned.integerValue).toBe('2');
        expect(contentRefFields.contentKind.stringValue).toBe(contentRef.contentKind);
        expect(contentRefFields.contentId.stringValue).toBe(contentRef.contentId);
    });

    it('writes a homework-scoped IELTS Writing projection without teacher-only feedback fields', async () => {
        const record = {
            ...makeTestRecord({ id: 'ielts-writing-1', skill: 'Writing', title: 'IELTS Writing' }),
            tasks: [{
                taskNumber: 2,
                promptText: 'Discuss both views.',
                modelAnswer: 'Teacher model answer',
                rubricNotes: { TA: 'Teacher-only note' },
            }],
        };
        const records = recordsForTestContent(record);
        const { firestoreWrites, rtdbWrites } = makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: { contentKind: 'ielts_writing', contentId: 'ielts-writing-1' },
        })), env);
        const body = await response.json() as Record<string, unknown>;
        const assignmentId = String(body.assignmentId);
        const fields = firestoreFields(firestoreWrites[0]);

        expect(response.status).toBe(201);
        expect(fields.studentSafeTestPayloadPath.stringValue).toBe('homework_student_safe_tests/' + assignmentId);
        expect(rtdbWrites).not.toContainEqual(expect.objectContaining({
            path: 'student_safe_tests/ielts-writing-1',
        }));
        expect(rtdbWrites).toContainEqual({
            path: 'homework_student_safe_tests/' + assignmentId,
            body: expect.objectContaining({
                id: 'ielts-writing-1',
                skill: 'Writing',
                teacherId: 'teacher-1',
                targetType: 'class',
                classId: 'class-1',
                tasks: [{
                    taskNumber: 2,
                    promptText: 'Discuss both views.',
                }],
            }),
        });
        expect(rtdbWrites).not.toContainEqual(expect.objectContaining({
            path: 'homework_student_safe_test_access/' + assignmentId,
        }));
        expect(JSON.stringify(rtdbWrites)).not.toContain('Teacher model answer');
        expect(JSON.stringify(rtdbWrites)).not.toContain('Teacher-only note');
    });

    it('accepts Reading Passage content only when snapshot and student-safe projection exist', async () => {
        const records = new Map<string, unknown>([
            ['users/teacher-1', { role: 'teacher' }],
            ['classes/class-1', classRecord],
            ['reading_v2/material_metadata/passage-1', {
                materialId: 'passage-1',
                ownerId: 'teacher-1',
                title: 'Passage 1',
                state: 'published',
                visibility: 'private',
                publishedSnapshotVersionId: 'snapshot-1',
            }],
            ['reading_v2/published_snapshots/passage-1/snapshot-1', {
                materialId: 'passage-1',
                snapshotVersionId: 'snapshot-1',
                ownerId: 'teacher-1',
                publishedAt: '2026-06-01T00:00:00.000Z',
                questionCount: 2,
            }],
            ['reading_v2/projections/student_safe_tests/passage-1:snapshot-1', {
                deliveryEngine: 'reading-v2',
                plane: 'projection',
                projectionKind: 'student-safe',
                sourceSnapshotVersionId: 'snapshot-1',
                content: { title: 'Passage 1' },
            }],
        ]);
        const { firestoreWrites } = makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: { contentKind: 'reading_passage', contentId: 'passage-1', version: 'snapshot-1' },
        })), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(201);
        expect(body.contentRef).toMatchObject({ contentKind: 'reading_passage', contentId: 'passage-1', version: 'snapshot-1' });
        expect(JSON.stringify(firestoreWrites[0])).toContain('readingPassageSnapshot');
    });

    it('accepts Reading V2 full tests and writes a frozen assignment payload', async () => {
        const records = new Map<string, unknown>([
            ['users/teacher-1', { role: 'teacher' }],
            ['classes/class-1', classRecord],
            ['reading_v2/material_metadata/master-1', {
                materialId: 'master-1',
                materialKind: 'reading-v2-full-test-composition',
                deliveryEngine: 'reading-v2',
                ownerId: 'teacher-1',
                title: 'Reading V2 Master',
                state: 'published',
                visibility: 'private',
                compositionId: 'composition-1',
                publishedSnapshotVersionId: 'composition-version-1',
            }],
            ['reading_v2/full_test_composition_versions/composition-1/composition-version-1', {
                compositionId: 'composition-1',
                testMaterialId: 'master-1',
                ownerId: 'teacher-1',
                title: 'Reading V2 Master',
                state: 'published',
                visibility: 'private',
                publishedVersionId: 'composition-version-1',
                passageRefs: [{
                    passageMaterialId: 'passage-1',
                    snapshotVersionId: 'snapshot-1',
                    order: 1,
                    titleSnapshot: 'Passage 1',
                    questionCountSnapshot: 13,
                    testTypeIdsSnapshot: ['ielts'],
                    source: { sourceOrderDisplay: 'Passage 1', sourceFullTestTitle: 'Practice Test' },
                }],
            }],
            ['reading_v2/full_test_compositions/composition-1', null],
            ['reading_v2/projections/student_safe_tests/master-1:composition-version-1', {
                deliveryEngine: 'reading-v2',
                plane: 'projection',
                projectionId: 'projection-master-1',
                ownerId: 'teacher-1',
                materialId: 'master-1',
                sourceSnapshotVersionId: 'composition-version-1',
                projectionKind: 'student-safe',
                generatedAt: '2026-06-01T00:00:00.000Z',
                runtimeContract: 'student-runtime',
                content: {
                    title: 'Reading V2 Master',
                    materialId: 'master-1',
                    sections: [],
                    stimuli: [],
                    anchors: [],
                    taskGroups: [],
                    optionSets: [],
                },
            }],
        ]);
        const { firestoreWrites, rtdbWrites } = makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: {
                contentKind: 'ielts_reading',
                contentId: 'master-1',
                version: 'composition-version-1',
                source: 'reading-v2',
            },
        })), env);
        const body = await response.json() as Record<string, unknown>;
        const firestoreBody = JSON.stringify(firestoreWrites[0]);

        expect(response.status).toBe(201);
        expect(body.contentRef).toMatchObject({
            contentKind: 'ielts_reading',
            contentId: 'master-1',
            version: 'composition-version-1',
            source: 'reading-v2',
        });
        expect(rtdbWrites[0]?.path).toMatch(/^reading_v2\/projections\/assignment_payloads\/homework-/);
        expect(rtdbWrites[0]?.path).toContain(':composition-version-1');
        expect(JSON.stringify(rtdbWrites[0]?.body)).toContain('assignmentManifest');
        expect(firestoreBody).toContain('reading-passage-set');
        expect(firestoreBody).toContain('readingV2AssignmentPayloadPath');
        expect(firestoreBody).toContain('contentRef');
    });

    it('rejects Reading V2 full tests without a student-safe projection', async () => {
        const records = new Map<string, unknown>([
            ['users/teacher-1', { role: 'teacher' }],
            ['classes/class-1', classRecord],
            ['reading_v2/material_metadata/master-1', {
                materialKind: 'reading-v2-full-test-composition',
                ownerId: 'teacher-1',
                title: 'Reading V2 Master',
                state: 'published',
                compositionId: 'composition-1',
                publishedSnapshotVersionId: 'composition-version-1',
            }],
            ['reading_v2/full_test_composition_versions/composition-1/composition-version-1', {
                compositionId: 'composition-1',
                ownerId: 'teacher-1',
                title: 'Reading V2 Master',
                state: 'published',
                publishedVersionId: 'composition-version-1',
                passageRefs: [{
                    passageMaterialId: 'passage-1',
                    snapshotVersionId: 'snapshot-1',
                    order: 1,
                    titleSnapshot: 'Passage 1',
                    questionCountSnapshot: 13,
                    testTypeIdsSnapshot: ['ielts'],
                }],
            }],
            ['reading_v2/full_test_compositions/composition-1', null],
        ]);
        makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: {
                contentKind: 'ielts_reading',
                contentId: 'master-1',
                version: 'composition-version-1',
                source: 'reading-v2',
            },
        })), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(400);
        expect(body.reasonCode).toBe('CONTENT_NOT_ASSIGNABLE');
    });
});
