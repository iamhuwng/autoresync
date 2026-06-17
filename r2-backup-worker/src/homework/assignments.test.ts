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
    deliveryProjectionReady: input.deliveryProjectionReady ?? true,
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
]);

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

    it('rejects missing or invalid auth with a stable reason code', async () => {
        vi.mocked(verifyFirebaseToken).mockResolvedValue({ valid: false, error: 'bad token' });
        makeFetchMock(new Map());

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody(), ''), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(401);
        expect(body.reasonCode).toBe('INVALID_ASSIGNMENT_REQUEST');
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

    it.each([
        ['missing content', new Map<string, unknown>([['users/teacher-1', { role: 'teacher' }], ['classes/class-1', classRecord]]), 'CONTENT_NOT_FOUND'],
        ['draft content', okRecords(makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', status: 'draft' })), 'CONTENT_DRAFT'],
        ['unpublished content', okRecords(makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', published: false })), 'CONTENT_UNPUBLISHED'],
        ['unsafe delivery projection', okRecords(makeTestRecord({ id: 'ielts-reading-1', skill: 'Reading', deliveryProjectionReady: false })), 'CONTENT_NOT_ASSIGNABLE'],
    ])('rejects %s', async (_label, records, reasonCode) => {
        makeFetchMock(records);

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody()), env);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(body.reasonCode).toBe(reasonCode);
    });

    it('rejects unsupported content kind', async () => {
        makeFetchMock(okRecords());

        const response = await handleCreateHomeworkAssignment(requestFor(assignmentBody({
            contentRef: { contentKind: 'book', contentId: 'book-1' },
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

        expect(response.status).toBe(201);
        expect(body.assignmentId).toBeTruthy();
        expect(body.contentRef).toMatchObject(contentRef);
        expect(JSON.stringify(firestoreWrites[0])).toContain(String(contentRef.contentKind));
        expect(JSON.stringify(firestoreWrites[0])).toContain(expectedMaterialType);
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
