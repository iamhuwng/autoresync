
import { describe, it, expect, vi } from 'vitest';
import { exportResultsToCSV, StudentResult } from './resultsService';

// Mock firebase modules
vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn()
}));

vi.mock('./firebase', () => ({
    database: {}
}));

describe('resultsService', () => {
    describe('exportResultsToCSV', () => {
        it('should generate correct CSV headers and rows', () => {
            const mockResults: StudentResult[] = [{
                studentId: 's1',
                studentName: 'John Doe',
                studentEmail: 'john@example.com',
                sessionCode: '123456',
                sessionMode: 'test',
                testTitle: 'IELTS Reading',
                score: 35,
                percentage: 87.5,
                totalQuestions: 40,
                correctAnswers: 35,
                completedAt: new Date('2023-01-01T12:00:00Z').getTime(),
                timeSpent: 3600000, // 60 mins
                className: 'Class A',
                isGuest: false,
                bandScore: 7.5,
                testSkill: 'reading',
                reMarkHistory: 0,
                teacherId: 'teacher123'
            }];

            const csv = exportResultsToCSV(mockResults);

            // Check headers
            expect(csv).toContain('Student Name,Student Email,Session Code,Test Title,Score,Percentage,Correct Answers,Total Questions,Completed At,Time Spent (min),Class Name,Is Guest,Band Score,Skill,Teacher ID,Re-marks');

            // Check data
            expect(csv).toContain('"John Doe"');
            expect(csv).toContain('"john@example.com"');
            expect(csv).toContain('"123456"');
            expect(csv).toContain('"IELTS Reading"');
            expect(csv).toContain('"35"');
            expect(csv).toContain('"87.50%"');
            expect(csv).toContain('"7.5"');
            expect(csv).toContain('"reading"');
            expect(csv).toContain('"teacher123"');
            expect(csv).toContain('"0"');
        });

        it('should handle optional missing fields', () => {
            const mockResults: StudentResult[] = [{
                studentId: 's2',
                studentName: 'Guest User',
                sessionCode: '999999',
                sessionMode: 'test',
                score: 0,
                percentage: 0,
                totalQuestions: 10,
                correctAnswers: 0,
                completedAt: Date.now(),
                isGuest: true,
            }];

            const csv = exportResultsToCSV(mockResults);
            expect(csv).toContain('"Guest User"');
            expect(csv).toContain('"Yes"'); // Is Guest
            expect(csv).toContain('""'); // Empty teacherId
            expect(csv).toContain('""'); // Empty bandScore
        });
    });

    // PRD-0016: Context-aware result tests
    describe('context field support', () => {
        it('should include context field in StudentResult interface', () => {
            const resultWithContext: StudentResult = {
                studentId: 's1',
                studentName: 'Test Student',
                sessionCode: '123456',
                sessionMode: 'test',
                score: 35,
                percentage: 87.5,
                totalQuestions: 40,
                correctAnswers: 35,
                completedAt: Date.now(),
                isGuest: false,
                context: {
                    type: 'class_session',
                    source: {
                        type: 'class',
                        id: 'class123',
                        name: 'Math Class'
                    },
                    configApplied: {
                        timerMinutes: 60,
                        feedbackTiming: 'after_completion',
                        source: 'material_default'
                    }
                }
            };

            expect(resultWithContext.context).toBeDefined();
            expect(resultWithContext.context?.type).toBe('class_session');
            expect(resultWithContext.context?.source?.type).toBe('class');
        });

        it('should handle self_study context type', () => {
            const selfStudyResult: StudentResult = {
                studentId: 's2',
                studentName: 'Solo Student',
                sessionCode: 'solo123',
                sessionMode: 'test',
                score: 28,
                percentage: 70,
                totalQuestions: 40,
                correctAnswers: 28,
                completedAt: Date.now(),
                isGuest: false,
                context: {
                    type: 'self_study',
                    source: {
                        type: 'library',
                        id: 'material456'
                    },
                    configApplied: {
                        feedbackTiming: 'immediate',
                        source: 'material_default'
                    }
                }
            };

            expect(selfStudyResult.context?.type).toBe('self_study');
            expect(selfStudyResult.context?.source?.type).toBe('library');
        });

        it('should handle homework context type', () => {
            const homeworkResult: StudentResult = {
                studentId: 's3',
                studentName: 'Homework Student',
                sessionCode: 'hw789',
                sessionMode: 'test',
                score: 32,
                percentage: 80,
                totalQuestions: 40,
                correctAnswers: 32,
                completedAt: Date.now(),
                isGuest: false,
                context: {
                    type: 'homework',
                    source: {
                        type: 'homework',
                        id: 'hw123',
                        name: 'Week 1 Assignment'
                    },
                    configApplied: {
                        timerMinutes: 45,
                        feedbackTiming: 'after_deadline',
                        source: 'teacher_override'
                    }
                }
            };

            expect(homeworkResult.context?.type).toBe('homework');
            expect(homeworkResult.context?.configApplied?.source).toBe('teacher_override');
        });

        it('should treat results without context as class_session (legacy)', () => {
            const legacyResult: StudentResult = {
                studentId: 's4',
                studentName: 'Legacy Student',
                sessionCode: 'old123',
                sessionMode: 'test',
                score: 30,
                percentage: 75,
                totalQuestions: 40,
                correctAnswers: 30,
                completedAt: Date.now(),
                isGuest: false
                // No context field - legacy result
            };

            // Legacy results should be treated as class_session
            const contextType = legacyResult.context?.type ?? 'class_session';
            expect(contextType).toBe('class_session');
        });
    });
});
