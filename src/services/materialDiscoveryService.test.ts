import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    enrichWithStudentHistory,
    getLibraryMaterials,
    getStudentMaterialHistory,
} from './materialDiscoveryService';
import { getStudentResults as getCanonicalStudentResults } from './testResults.service';
import type { EnhancedTestResultRecord } from '../types/results.types';
import type { LibraryMaterial } from '../types/solo.types';
import { get, ref } from 'firebase/database';
import { READING_V2_ENGINE } from '../config/readingV2FeatureFlags';
import { READING_V2_PROJECTION_FIXTURES } from './reading-v2/fixtures/readingV2ProjectionFixtures';

vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    get: vi.fn(),
}));

vi.mock('./firebase', () => ({
    database: {},
}));

vi.mock('./testResults.service', () => ({
    getStudentResults: vi.fn(),
}));

describe('materialDiscoveryService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(ref).mockImplementation((_database, path) => path as any);
    });

    it('uses canonical student results and only counts self-study attempts for the target material', async () => {
        vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
            {
                resultId: 'result-1',
                studentId: 'student-1',
                testId: 'material-1',
                percentage: 75,
                submittedAt: 1000,
                context: { type: 'self_study' },
            },
            {
                resultId: 'result-2',
                studentId: 'student-1',
                testId: 'material-1',
                percentage: 90,
                submittedAt: 2000,
                context: { type: 'self_study' },
            },
            {
                resultId: 'result-3',
                studentId: 'student-1',
                testId: 'material-1',
                percentage: 100,
                submittedAt: 3000,
                context: { type: 'course_material' },
            },
            {
                resultId: 'result-4',
                studentId: 'student-1',
                testId: 'material-2',
                percentage: 88,
                submittedAt: 4000,
                context: { type: 'self_study' },
            },
        ] as EnhancedTestResultRecord[]);

        const history = await getStudentMaterialHistory('student-1', 'material-1');

        expect(getCanonicalStudentResults).toHaveBeenCalledWith('student-1');
        expect(history).toEqual({
            attemptCount: 2,
            bestScore: 90,
            lastScore: 90,
            lastPracticed: 2000,
        });
    });

    it('enriches materials with canonical self-study history', async () => {
        vi.mocked(getCanonicalStudentResults).mockResolvedValue([
            {
                resultId: 'result-1',
                studentId: 'student-1',
                testId: 'material-1',
                percentage: 82,
                submittedAt: 1500,
                context: { type: 'self_study' },
            },
        ] as EnhancedTestResultRecord[]);

        const materials: LibraryMaterial[] = [
            {
                id: 'material-1',
                title: 'Material 1',
                type: 'test',
                skill: 'reading',
                questionCount: 10,
                source: { type: 'public' },
                soloConfig: {
                    soloEnabled: true,
                    defaults: {},
                    contexts: {
                        selfStudy: {},
                        homework: {},
                        courseMaterial: {},
                    },
                } as any,
            },
            {
                id: 'material-2',
                title: 'Material 2',
                type: 'quiz',
                skill: 'listening',
                questionCount: 8,
                source: { type: 'public' },
                soloConfig: {
                    soloEnabled: true,
                    defaults: {},
                    contexts: {
                        selfStudy: {},
                        homework: {},
                        courseMaterial: {},
                    },
                } as any,
            },
        ];

        const enriched = await enrichWithStudentHistory(materials, 'student-1');

        expect(getCanonicalStudentResults).toHaveBeenCalledTimes(1);
        expect(enriched[0].studentHistory).toEqual({
            attemptCount: 1,
            bestScore: 82,
            lastScore: 82,
            lastPracticed: 1500,
        });
        expect(enriched[1].studentHistory).toBeUndefined();
    });

    it('loads public Reading V2 library rows from approved relationship indexes, metadata, and student-safe projections', async () => {
        const projection = READING_V2_PROJECTION_FIXTURES.studentSafe;
        vi.mocked(get).mockImplementation(async (path: any) => {
            const valueByPath: Record<string, unknown> = {
                tests: null,
                'reading_v2/relationship_indexes/library-listing/': {
                    'material-v2': {
                        materialId: 'material-v2',
                        snapshotVersionId: projection.sourceSnapshotVersionId,
                        source: 'student-safe-projection',
                    },
                },
                'reading_v2/material_metadata/material-v2': {
                    materialId: 'material-v2',
                    ownerId: 'teacher-1',
                    deliveryEngine: READING_V2_ENGINE,
                    productLabel: 'Reading V2',
                    title: 'Published Reading V2',
                    materialKind: 'full-test',
                    durationMinutes: 55,
                    difficulty: 'intermediate',
                    description: 'Public V2 material',
                    tags: ['reading'],
                    visibility: 'library-eligible',
                    publishedSnapshotVersionId: projection.sourceSnapshotVersionId,
                    updatedAt: '2026-01-01T00:00:00.000Z',
                    relationshipSurfaces: ['library-listing'],
                },
                [`reading_v2/projections/student_safe_tests/material-v2:${projection.sourceSnapshotVersionId}`]: projection,
            };
            const value = valueByPath[path];
            return {
                exists: () => value !== null && value !== undefined,
                val: () => value,
            } as any;
        });

        const materials = await getLibraryMaterials(
            { source: 'public', skill: 'reading' },
            { readingV2RolloutMode: 'public' }
        );

        expect(materials).toHaveLength(1);
        expect(materials[0]).toMatchObject({
            id: 'material-v2',
            title: 'Published Reading V2',
            skill: 'reading-v2',
            type: 'test',
            questionCount: 2,
            source: { type: 'public' },
        });
        expect(vi.mocked(ref).mock.calls.map(call => call[1])).toEqual(expect.arrayContaining([
            'tests',
            'reading_v2/relationship_indexes/library-listing/',
            'reading_v2/material_metadata/material-v2',
            `reading_v2/projections/student_safe_tests/material-v2:${projection.sourceSnapshotVersionId}`,
        ]));
    });

    it('keeps public Reading V2 library rows hidden while rollout is default closed', async () => {
        vi.mocked(get).mockImplementation(async (path: any) => {
            if (path === 'tests') {
                return {
                    exists: () => false,
                    val: () => null,
                } as any;
            }

            throw new Error(`Unexpected default-closed Reading V2 library read: ${path}`);
        });

        const materials = await getLibraryMaterials({ source: 'public', skill: 'reading-v2' });

        expect(materials).toEqual([]);
        expect(vi.mocked(ref).mock.calls.map(call => call[1])).not.toContain(
            'reading_v2/relationship_indexes/library-listing/'
        );
    });
});
