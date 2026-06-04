import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerEnv } from '../types';
import { verifyFirebaseToken } from '../auth/firebase-auth';
import { getFirebaseAccessToken } from '../auth/google-oauth';
import { handleReadingV2Submit } from './submit';

vi.mock('../auth/firebase-auth', () => ({
    verifyFirebaseToken: vi.fn(),
}));

vi.mock('../auth/google-oauth', () => ({
    getFirebaseAccessToken: vi.fn(),
}));

const READING_V2_ENGINE = 'reading-v2';

const makeSnapshot = (input: {
    materialId: string;
    snapshotVersionId: string;
    answer: string;
}) => ({
    snapshotVersionId: input.snapshotVersionId,
    materialId: input.materialId,
    ownerId: 'teacher-1',
    publishedAt: '2026-06-01T00:00:00.000Z',
    publishedBy: 'teacher-1',
    document: {
        interactions: {
            interaction_1: {
                interactionId: 'interaction_1',
                taskGroupId: 'task_group_1',
                responseShape: { kind: 'free-text' },
                scoringRule: {
                    maxScore: 1,
                    acceptableAnswers: [input.answer],
                },
                reviewLabel: { displayNumber: 1 },
            },
        },
        taskGroups: {
            task_group_1: {
                taskGroupId: 'task_group_1',
                officialTaskType: 'sentence-completion',
                engineeringFamily: 'completion',
            },
        },
    },
});

const makeReviewProjection = (input: {
    snapshotVersionId: string;
    title: string;
}) => ({
    deliveryEngine: READING_V2_ENGINE,
    projectionKind: 'review',
    sourceSnapshotVersionId: input.snapshotVersionId,
    content: {
        title: input.title,
        stimuli: [{
            stimulusId: 'stimulus_1',
            kind: 'passage',
            content: {
                kind: 'passage-content',
                paragraphs: [{
                    anchorId: 'anchor_1',
                    text: `${input.title} review passage.`,
                }],
            },
        }],
        anchors: [{
            anchorId: 'anchor_1',
            stimulusId: 'stimulus_1',
            kind: 'paragraph',
            label: 'Paragraph 1',
        }],
        taskGroups: [{
            taskGroupId: 'task_group_1',
            groupTitle: input.title,
            officialTaskType: 'sentence-completion',
            engineeringFamily: 'completion',
            instructionBlocks: [{ id: 'instruction_1', text: 'Complete the answer.' }],
            stimulusRefs: [{ stimulusId: 'stimulus_1', anchorIds: ['anchor_1'] }],
            interactions: [{
                interactionId: 'interaction_1',
                taskGroupId: 'task_group_1',
                displayNumber: 1,
            }],
        }],
    },
});

const makeHomework = () => ({
    id: 'hw-set-1',
    materialId: 'reading-passage-set:hw-set-1',
    materialType: 'reading-passage-set',
    title: 'Selected Reading Passages',
    materialTitle: 'Selected Reading Passages',
    createdBy: 'teacher-1',
    config: {
        timerMinutes: 40,
    },
    readingPassageSet: {
        titleSnapshot: 'Selected Reading Passages',
        items: [
            {
                order: 1,
                passageMaterialId: 'passage-a',
                snapshotVersionId: 'snapshot-a',
                titleSnapshot: 'Passage A',
                questionCount: 1,
                sourceOrderDisplay: 'Passage 1',
                sourceFullTestTitle: 'Mock Test A',
            },
            {
                order: 2,
                passageMaterialId: 'passage-b',
                snapshotVersionId: 'snapshot-b',
                titleSnapshot: 'Passage B',
                questionCount: 1,
                sourceOrderDisplay: 'Passage 2',
                sourceFullTestTitle: 'Mock Test B',
            },
        ],
    },
});

const firestoreValue = (value: unknown): Record<string, unknown> => {
    if (value === null) {
        return { nullValue: null };
    }

    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(firestoreValue) } };
    }

    if (typeof value === 'object') {
        return { mapValue: { fields: firestoreFields(value as Record<string, unknown>) } };
    }

    if (typeof value === 'number') {
        return Number.isInteger(value)
            ? { integerValue: String(value) }
            : { doubleValue: value };
    }

    if (typeof value === 'boolean') {
        return { booleanValue: value };
    }

    return { stringValue: String(value) };
};

const firestoreFields = (record: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, firestoreValue(value)]));

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });

describe('Reading V2 Worker submit route', () => {
    beforeEach(() => {
        vi.mocked(verifyFirebaseToken).mockResolvedValue({
            valid: true,
            uid: 'student-1',
            name: 'Student One',
            email: 'student@example.test',
        });
        vi.mocked(getFirebaseAccessToken).mockResolvedValue('google-token');
    });

    it('scores Reading Passage set homework by loading the assigned passage snapshots', async () => {
        const homework = makeHomework();
        const rtdbRecords = new Map<string, unknown>([
            ['reading_v2/published_snapshots/passage-a/snapshot-a', makeSnapshot({
                materialId: 'passage-a',
                snapshotVersionId: 'snapshot-a',
                answer: 'Answer A',
            })],
            ['reading_v2/projections/review/passage-a:snapshot-a', makeReviewProjection({
                snapshotVersionId: 'snapshot-a',
                title: 'Passage A',
            })],
            ['reading_v2/material_metadata/passage-a', { materialId: 'passage-a', title: 'Passage A' }],
            ['reading_v2/published_snapshots/passage-b/snapshot-b', makeSnapshot({
                materialId: 'passage-b',
                snapshotVersionId: 'snapshot-b',
                answer: 'Answer B',
            })],
            ['reading_v2/projections/review/passage-b:snapshot-b', makeReviewProjection({
                snapshotVersionId: 'snapshot-b',
                title: 'Passage B',
            })],
            ['reading_v2/material_metadata/passage-b', { materialId: 'passage-b', title: 'Passage B' }],
            ['users/student-1', { name: 'Student One' }],
        ]);
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(String(input));
            const method = init?.method ?? 'GET';

            if (url.hostname === 'firestore.googleapis.com') {
                expect(method).toBe('GET');
                expect(url.pathname).toContain('/documents/homework_assignments/hw-set-1');
                return json({
                    name: 'projects/temp-a1437/databases/(default)/documents/homework_assignments/hw-set-1',
                    fields: firestoreFields(homework),
                });
            }

            if (url.hostname === 'db.example.test') {
                const path = decodeURIComponent(url.pathname.replace(/^\/|\.json$/g, ''));
                if (method === 'GET') {
                    return json(rtdbRecords.get(path) ?? null);
                }

                if (method === 'PUT' || method === 'PATCH') {
                    return json({ ok: true });
                }
            }

            throw new Error(`Unexpected fetch ${method} ${url.toString()}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const request = new Request('https://worker.example.test/api/reading-v2/submit', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer student-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                deliveryEngine: READING_V2_ENGINE,
                projectionId: 'homework-set:hw-set-1',
                sourceSnapshotVersionId: 'homework-set:hw-set-1',
                materialId: 'reading-passage-set:hw-set-1',
                answers: [
                    {
                        interactionId: 'passage-1:interaction_1',
                        taskGroupId: 'passage-1:task_group_1',
                        displayNumber: 1,
                        value: 'answer a',
                    },
                    {
                        interactionId: 'passage-2:interaction_1',
                        taskGroupId: 'passage-2:task_group_1',
                        displayNumber: 2,
                        value: 'answer b',
                    },
                ],
                context: {
                    surface: 'homework',
                    homeworkId: 'hw-set-1',
                    sourceName: 'Selected Reading Passages',
                },
            }),
        });

        const response = await handleReadingV2Submit(request, {
            FIREBASE_PROJECT_ID: 'temp-a1437',
            FIREBASE_DB_URL: 'https://db.example.test',
            GOOGLE_SA_KEY: '{}',
        } as WorkerEnv);
        const body = await response.json() as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body).toEqual(expect.objectContaining({
            totalScore: 2,
            maxScore: 2,
            percentage: 100,
        }));
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/documents/homework_assignments/hw-set-1'),
            expect.objectContaining({
                method: 'GET',
            }),
        );
    });
});
