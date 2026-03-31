import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    enrichWithStudentHistory,
    getStudentMaterialHistory,
} from './materialDiscoveryService';
import { getStudentResults as getCanonicalStudentResults } from './testResults.service';
import type { EnhancedTestResultRecord } from '../types/results.types';
import type { LibraryMaterial } from '../types/solo.types';

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
});
