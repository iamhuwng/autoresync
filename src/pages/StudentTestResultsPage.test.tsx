
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StudentTestResultsPage } from './StudentTestResultsPage';
// @ts-ignore
import { database } from '../services/firebase';
import { get, onValue, ref } from 'firebase/database';
import * as testResultsService from '../services/testResults.service';
import * as sessionService from '../services/sessionService';

// Mock Firebase
vi.mock('../services/firebase', () => ({
    database: {}
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn((_database: any, path: string) => path),
    get: vi.fn(),
    onValue: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
}));

// Mock services
vi.mock('../services/testResults.service', async () => {
    const actual = await vi.importActual('../services/testResults.service');
    return {
        ...actual,
        getStudentSessionResult: vi.fn(),
        getTestResult: vi.fn()
    };
});

vi.mock('../services/sessionService', () => ({
    sessionService: {
        getPlayerId: vi.fn()
    }
}));

vi.mock('../services/writingSubmissionService', () => ({
    getSubmissionsBySession: vi.fn().mockResolvedValue({
        success: true,
        data: [],
    }),
}));

// Mock sub-components/modules that might cause issues in test env
vi.mock('@mantine/core', () => ({
    Center: ({ children }: any) => <div>{children}</div>,
    Loader: () => <div>Loading...</div>
}));

vi.mock('../components/modern', () => ({
    Card: ({ children }: any) => <div>{children}</div>,
    CardBody: ({ children }: any) => <div>{children}</div>,
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>
}));

describe('StudentTestResultsPage', () => {
    const sessionCode = 'SESSION123';
    const studentId = 'student1';
    const sessionListeners = new Map<string, { success: (snapshot: any) => void; error?: (error: any) => void }>();

    beforeEach(() => {
        vi.clearAllMocks();
        sessionListeners.clear();

        // Default mocks
        (sessionService.sessionService.getPlayerId as any).mockReturnValue(studentId);

        (onValue as any).mockImplementation((refObj: any, success: (snapshot: any) => void, error?: (err: any) => void) => {
            sessionListeners.set(refObj, { success, error });
            return vi.fn(() => {
                sessionListeners.delete(refObj);
            });
        });

        // Mock Session Fetch
        (get as any).mockImplementation((refObj: any) => {
            if (typeof refObj === 'string' && refObj.includes('game_sessions/')) {
                return Promise.resolve({
                    exists: () => true,
                    val: () => ({
                        testId: 'TEST1',
                        status: 'in-progress',
                        players: {
                            [studentId]: { name: 'Student Name', answers: {} }
                        }
                    })
                });
            }

            return Promise.resolve({
                exists: () => true,
                val: () => ({
                    title: 'Test Title',
                    type: 'reading',
                    questions: [
                        {
                            number: 1,
                            type: 'multiple-choice',
                            answer: 'A',
                            points: 1
                        }
                    ]
                })
            });
        });
    });

    it('should load from permanent storage if available', async () => {
        // Mock permanent result
        const mockPermanentResult = {
            resultId: 'res-1',
            totalScore: 9,
            maxScore: 10,
            percentage: 90,
            bandScore: 8.0,
            questionResults: [],
            summary: { correct: 9, incorrect: 1, partialCredit: 0, totalQuestions: 10 },
            correct: 9,
            incorrect: 1,
            partialCredit: 0,
            totalQuestions: 10,
            submittedAt: Date.now()
        };

        (testResultsService.getStudentSessionResult as any).mockResolvedValue(mockPermanentResult);

        render(
            <MemoryRouter initialEntries={[`/results/${sessionCode}`]}>
                <Routes>
                    <Route path="/results/:sessionCode" element={<StudentTestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        // Should display loading initially
        expect(screen.getByText('Loading...')).toBeInTheDocument();

        // Verify it called getStudentSessionResult
        await waitFor(() => {
            expect(testResultsService.getStudentSessionResult).toHaveBeenCalledWith(studentId, sessionCode);
        });

        // Should eventually show score (9/10)
        await waitFor(() => {
            expect(screen.getByText('9/10')).toBeInTheDocument();
        });
    });

    it('should prefer persisted formative feedback over generated percentage feedback', async () => {
        (get as any).mockImplementation((refObj: any) => {
            if (typeof refObj === 'string' && refObj.includes('game_sessions/')) {
                return Promise.resolve({
                    exists: () => true,
                    val: () => ({
                        testId: 'TEST1',
                        status: 'completed',
                        reviewReleaseState: 'feedback-released',
                        players: {
                            [studentId]: { name: 'Student Name', answers: {} }
                        }
                    })
                });
            }

            return Promise.resolve({
                exists: () => true,
                val: () => ({
                    title: 'Test Title',
                    type: 'reading',
                    questions: [
                        {
                            number: 1,
                            type: 'multiple-choice',
                            answer: 'A',
                            points: 1
                        }
                    ]
                })
            });
        });

        (testResultsService.getStudentSessionResult as any).mockResolvedValue({
            resultId: 'res-feedback',
            totalScore: 8,
            maxScore: 10,
            percentage: 80,
            bandScore: 7.0,
            questionResults: [],
            summary: { correct: 8, incorrect: 2, partialCredit: 0, totalQuestions: 10 },
            correct: 8,
            incorrect: 2,
            partialCredit: 0,
            totalQuestions: 10,
            submittedAt: Date.now(),
            formativeFeedback: {
                deterministicFeedback: 'Fallback deterministic summary',
                aiFeedback: {
                    summary: 'Stored AI summary from the saved result.',
                    strengths: 'Strong summary',
                    revision: 'Revise detail',
                    critical: 'Critical detail',
                },
            },
        });

        render(
            <MemoryRouter initialEntries={[`/results/${sessionCode}`]}>
                <Routes>
                    <Route path="/results/:sessionCode" element={<StudentTestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('8/10')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText('Stored AI summary from the saved result.')).toBeInTheDocument();
        });
    });

    it('should fallback to calculation if permanent result not found', async () => {
        // Mock no permanent result
        (testResultsService.getStudentSessionResult as any).mockResolvedValue(null);

        // Mock legacy answers
        (get as any).mockResolvedValue({
            exists: () => true,
            val: () => ({
                // Session Data
                testId: 'TEST1',
                players: {
                    [studentId]: {
                        name: 'Student Name',
                        answers: {
                            1: { answer: 'A' } // Legacy answer format
                        }
                    }
                },
                // Test Data (mocking subsequent call)
                title: 'Test Title',
                questions: [{ number: 1, type: 'multiple-choice', answer: 'A', points: 1 }]
            })
        });
        // We need to differentiate fetches. The component fetches session then test.
        // Simplified mock: always returns a 'megablob' that satisfies both or use mockImplementation.
        // Let's refine mockImplementation.

        (get as any).mockImplementation((refArg: any) => {
            // refArg is a mock, we can't easily check path string without intricate setup.
            // Assuming optimistic return for both calls.
            return Promise.resolve({
                exists: () => true,
                val: () => ({
                    // Session fields
                    testId: 'TEST1',
                    players: { [studentId]: { answers: { 1: { answer: 'A' } } } },
                    // Test fields
                    title: 'Test Title',
                    type: 'reading',
                    questions: [{ number: 1, type: 'multiple-choice', answer: 'A', points: 1 }]
                })
            });
        });

        render(
            <MemoryRouter initialEntries={[`/results/${sessionCode}`]}>
                <Routes>
                    <Route path="/results/:sessionCode" element={<StudentTestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            // It should query permanent storage, fail (return null), then calculate locally
            expect(testResultsService.getStudentSessionResult).toHaveBeenCalled();
        });

        // Calculated score: 1/1 -> 100%
        await waitFor(() => {
            expect(screen.getByText('1/1')).toBeInTheDocument();
        });
    });

    it('should use the player latestResultId pointer when the student index is missing', async () => {
        (testResultsService.getStudentSessionResult as any).mockResolvedValue(null);
        (testResultsService.getTestResult as any).mockResolvedValue({
            resultId: 'res-direct',
            sessionCode,
            studentId,
            totalScore: 7,
            maxScore: 10,
            percentage: 70,
            bandScore: 6.0,
            questionResults: [],
            correct: 7,
            incorrect: 3,
            partialCredit: 0,
            totalQuestions: 10,
            submittedAt: Date.now(),
            testTitle: 'Recovered Result',
            testType: 'reading',
            testSkill: 'Reading',
            testDuration: 30,
        });

        (get as any).mockImplementation((refObj: any) => {
            if (typeof refObj === 'string' && refObj.includes('game_sessions/')) {
                return Promise.resolve({
                    exists: () => true,
                    val: () => ({
                        testId: null,
                        status: 'waiting',
                        players: {
                            [studentId]: {
                                name: 'Student Name',
                                latestResultId: 'res-direct',
                                answers: {},
                            }
                        }
                    })
                });
            }

            return Promise.resolve({
                exists: () => false,
                val: () => null,
            });
        });

        render(
            <MemoryRouter initialEntries={[`/results/${sessionCode}`]}>
                <Routes>
                    <Route path="/results/:sessionCode" element={<StudentTestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(testResultsService.getStudentSessionResult).toHaveBeenCalledWith(studentId, sessionCode);
        });

        await waitFor(() => {
            expect(testResultsService.getTestResult).toHaveBeenCalledWith('res-direct');
        });

        await waitFor(() => {
            expect(screen.getByText('7/10')).toBeInTheDocument();
        });
    });

    it('should redirect legacy student result links to the canonical result detail route', async () => {
        (testResultsService.getTestResult as any).mockResolvedValue({
            resultId: 'result-legacy-1',
            studentId,
        });

        render(
            <MemoryRouter initialEntries={['/student/results/result-legacy-1']}>
                <Routes>
                    <Route path="/student/results/:sessionCode" element={<StudentTestResultsPage />} />
                    <Route path="/result/:resultId" element={<div>Canonical Result Route</div>} />
                </Routes>
            </MemoryRouter>
        );

        await screen.findByText('Canonical Result Route');

        expect(testResultsService.getTestResult).toHaveBeenCalledWith('result-legacy-1');
        expect(testResultsService.getStudentSessionResult).not.toHaveBeenCalled();
    });

    it('should update the release banner when the live session state changes', async () => {
        (testResultsService.getStudentSessionResult as any).mockResolvedValue({
            resultId: 'res-live',
            totalScore: 9,
            maxScore: 10,
            percentage: 90,
            questionResults: [],
            correct: 9,
            incorrect: 1,
            partialCredit: 0,
            totalQuestions: 10,
            submittedAt: Date.now(),
            testTitle: 'Test Title',
            testType: 'reading',
            testSkill: 'Reading',
        });

        render(
            <MemoryRouter initialEntries={[`/results/${sessionCode}`]}>
                <Routes>
                    <Route path="/results/:sessionCode" element={<StudentTestResultsPage />} />
                </Routes>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(sessionListeners.has(`game_sessions/${sessionCode}`)).toBe(true);
        });

        await waitFor(() => {
            expect(screen.getByText('Detailed Review Locked')).toBeInTheDocument();
        });

        const listener = sessionListeners.get(`game_sessions/${sessionCode}`);
        expect(listener).toBeTruthy();

        await act(async () => {
            listener?.success({
                exists: () => true,
                val: () => ({
                    status: 'waiting',
                    lastTestCompletedAt: Date.now(),
                    players: {
                        [studentId]: { name: 'Student Name', answers: {} }
                    }
                }),
            });
        });

        await waitFor(() => {
            expect(screen.getByText('Answers Released')).toBeInTheDocument();
        });
    });
});
