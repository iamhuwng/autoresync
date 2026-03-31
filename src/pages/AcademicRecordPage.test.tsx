import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import React from 'react';

const { mockResults } = vi.hoisted(() => ({
    mockResults: [
        {
            resultId: 'res-1',
            testTitle: 'Reading Test 1',
            testType: 'reading',
            testSkill: 'reading',
            percentage: 85,
            totalScore: 17,
            maxScore: 20,
            submittedAt: 1700000000000,
            correct: 17,
            incorrect: 3,
            partialCredit: 0,
            totalQuestions: 20,
            bandScore: 7.0,
            courseName: 'IELTS Prep',
            className: 'Class A',
            questionResults: [],
        },
        {
            resultId: 'res-writing-1',
            testTitle: 'Writing Task 1',
            testType: 'writing',
            testSkill: 'writing',
            percentage: 0,
            totalScore: 0,
            maxScore: 0,
            submittedAt: 1700000000500,
            correct: 0,
            incorrect: 0,
            partialCredit: 0,
            totalQuestions: 2,
            bandScore: 0,
            courseName: 'IELTS Prep',
            className: 'Class A',
            questionResults: [],
            markingStatus: 'pending-review',
            writingData: {
                submissionId: 'writing-submission-1',
                overallBand: null,
                markingStatus: 'pending-review',
                tasks: [{ taskNumber: 1, wordCount: 280, activeTimeSeconds: 900 }],
            },
            context: { type: 'solo_practice' },
        },
        {
            resultId: 'res-2',
            testTitle: 'Listening Test 1',
            testType: 'listening',
            testSkill: 'listening',
            percentage: 70,
            totalScore: 28,
            maxScore: 40,
            submittedAt: 1700000001000,
            correct: 28,
            incorrect: 12,
            partialCredit: 0,
            totalQuestions: 40,
            bandScore: 6.0,
            courseName: 'IELTS Prep',
            className: 'Class A',
            questionResults: [],
        },
    ] as any[],
}));

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: { uid: 'user-1' },
        profile: { role: 'student', displayName: 'Test Student' },
        loading: false,
    }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({
        trackAction: vi.fn(),
    }),
}));

vi.mock('../hooks/useAIStatus', () => ({
    useAIStatus: () => [{ maintenance: false, loaded: true }],
}));

vi.mock('../components/ai/AIMaintenanceBanner', () => ({
    default: () => null,
}));

vi.mock('@/services/academicRecordService', () => ({
    getFilteredResults: vi.fn().mockResolvedValue(mockResults),
    getLatestResultPerTest: vi.fn().mockImplementation((results: any[]) => results),
    getThcsProgress: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/progressiveFeedback.service', () => ({
    getProgressiveFeedback: vi.fn().mockResolvedValue(null),
    refreshProgressiveFeedback: vi.fn().mockResolvedValue(null),
}));

vi.mock('../services/firebase', () => ({
    database: {},
}));

vi.mock('../components/layout/StudentLayout', () => ({
    StudentLayout: ({ children }: any) => (
        <div data-testid="student-layout">
            <div data-testid="student-layout-main">{children}</div>
        </div>
    ),
}));

vi.mock('../components/layout/StudentSidebar', () => ({
    StudentSidebar: () => <div data-testid="student-sidebar" />,
}));

vi.mock('../components/layout/studentLayoutStyles', () => ({
    S: {
        feedHeader: {},
        feedHeaderTitle: {},
        filterBar: {},
        filterTab: {},
        filterTabActive: {},
    },
}));

vi.mock('../components/layout/StudentIcons', () => ({
    IconAlertCircle: () => <span>Alert</span>,
}));

vi.mock('@/components/academicRecord', () => ({
    ResultTimeline: ({ results, onResultClick }: any) => (
        <div data-testid="result-timeline">
            {results.map((result: any) => (
                <button
                    key={result.resultId}
                    type="button"
                    data-testid={`timeline-result-${result.resultId}`}
                    onClick={() => onResultClick(result.resultId)}
                >
                    {result.testTitle}
                </button>
            ))}
        </div>
    ),
    ResultsByCourse: ({ results, onResultClick }: any) => (
        <div data-testid="results-by-course">
            {results.map((result: any) => (
                <button
                    key={result.resultId}
                    type="button"
                    data-testid={`course-result-${result.resultId}`}
                    onClick={() => onResultClick(result.resultId)}
                >
                    {result.testTitle}
                </button>
            ))}
        </div>
    ),
    ResultsBySkill: ({ results, onResultClick }: any) => (
        <div data-testid="results-by-skill">
            {results.map((result: any) => (
                <button
                    key={result.resultId}
                    type="button"
                    data-testid={`skill-result-${result.resultId}`}
                    onClick={() => onResultClick(result.resultId)}
                >
                    {result.testTitle}
                </button>
            ))}
        </div>
    ),
    ResultsByTestType: ({ results, onResultClick }: any) => (
        <div data-testid="results-by-test-type">
            {results.map((result: any) => (
                <button
                    key={result.resultId}
                    type="button"
                    data-testid={`type-result-${result.resultId}`}
                    onClick={() => onResultClick(result.resultId)}
                >
                    {result.testTitle}
                </button>
            ))}
        </div>
    ),
}));

vi.mock('@/components/academicRecord/THCSProgressTab', () => ({
    THCSProgressTab: ({ onResultClick }: any) => (
        <div data-testid="thcs-progress-tab">
            <button type="button" data-testid="thcs-btn" onClick={() => onResultClick('thcs-test-1')}>
                THCS Item
            </button>
        </div>
    ),
}));

vi.mock('../components/results/DeferredResultSlidePanel', () => ({
    DeferredResultSlidePanel: ({ resultId, onClose }: any) => (
        <div data-testid="result-slide-panel" data-result-id={resultId}>
            <button type="button" data-testid="close-panel-btn" onClick={onClose}>
                Close
            </button>
        </div>
    ),
}));

const UrlInspector: React.FC = () => {
    const [searchParams] = useSearchParams();
    const location = useLocation();

    return (
        <div
            data-testid="url-inspector"
            data-pathname={location.pathname}
            data-search={searchParams.toString()}
        />
    );
};

import { AcademicRecordPage } from './AcademicRecordPage';
import * as progressiveFeedbackService from '../services/progressiveFeedback.service';

interface RenderOptions {
    initialPath?: string;
    locationState?: Record<string, any>;
}

const renderPage = (options: RenderOptions = {}) => {
    const { initialPath = '/student/academic-record', locationState } = options;

    let entry: any;
    if (locationState) {
        const url = new URL(initialPath, 'http://localhost');
        entry = {
            pathname: url.pathname,
            search: url.search,
            state: locationState,
        };
    } else {
        entry = initialPath;
    }

    return render(
        <MemoryRouter initialEntries={[entry]}>
            <Routes>
                <Route
                    path="/student/academic-record"
                    element={(
                        <>
                            <AcademicRecordPage />
                            <UrlInspector />
                        </>
                    )}
                />
            </Routes>
        </MemoryRouter>,
    );
};

describe('AcademicRecordPage query-param management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows the Course tab, removes the Writing tab, and keeps overview browse sections removed', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('result-timeline')).toBeInTheDocument();
        });

        expect(screen.getByRole('button', { name: 'IELTS' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Course' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Writing' })).not.toBeInTheDocument();
        expect(screen.queryByText('Browse Your Record')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'By Course' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'By Skill' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Course' }));

        await waitFor(() => {
            expect(screen.getByTestId('results-by-course')).toBeInTheDocument();
        });
    });

    it('sets ?result when an overview timeline result is clicked', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('result-timeline')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('timeline-result-res-1'));

        await waitFor(() => {
            expect(screen.getByTestId('url-inspector').dataset.search).toContain('result=res-1');
        });

        expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'res-1');
    });

    it('keeps writing results inside the IELTS view and opens them from there', async () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'IELTS' }));

        await waitFor(() => {
            expect(screen.getByTestId('results-by-skill')).toBeInTheDocument();
        });

        expect(screen.getByText('Writing Task 1')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('skill-result-res-writing-1'));

        await waitFor(() => {
            expect(screen.getByTestId('url-inspector').dataset.search).toContain('result=res-writing-1');
        });

        expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'res-writing-1');
    });

    it('removes ?result when the panel closes', async () => {
        renderPage({ initialPath: '/student/academic-record?result=res-1' });

        await waitFor(() => {
            expect(screen.getByTestId('result-slide-panel')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('close-panel-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('url-inspector').dataset.search).not.toContain('result=');
        });
    });

    it('normalizes location.state.resultId plus showResult into ?result', async () => {
        renderPage({
            locationState: { resultId: 'res-from-state', showResult: true },
        });

        await waitFor(() => {
            expect(screen.getByTestId('url-inspector').dataset.search).toContain('result=res-from-state');
        });
    });

    it('does not set ?result when showResult is absent', async () => {
        renderPage({
            locationState: { resultId: 'res-from-state' },
        });

        await waitFor(() => {
            expect(screen.getByTestId('url-inspector').dataset.search).not.toContain('result=');
        });
    });

    it('clears ?result when resetRecordsView is provided in location state', async () => {
        renderPage({
            initialPath: '/student/academic-record?result=old-result',
            locationState: { resetRecordsView: true },
        });

        await waitFor(() => {
            expect(screen.getByTestId('url-inspector').dataset.search).not.toContain('result=');
        });
    });

    it('reads ?result from the URL on mount', async () => {
        renderPage({ initialPath: '/student/academic-record?result=res-1' });

        await waitFor(() => {
            expect(screen.getByTestId('url-inspector').dataset.search).toContain('result=res-1');
        });

        expect(screen.getByTestId('result-slide-panel')).toHaveAttribute('data-result-id', 'res-1');
    });

    it('does not auto-refresh progressive feedback when cached feedback is still fresh', async () => {
        vi.mocked(progressiveFeedbackService.getProgressiveFeedback).mockResolvedValueOnce({
            generatedAt: Date.now() - 1000,
            nextScheduledRefreshAt: Date.now() + 60_000,
            nextEligibleManualRefreshAt: Date.now() + 60_000,
            narrative: {
                summary: 'Fresh feedback',
            },
        } as any);

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Fresh feedback')).toBeInTheDocument();
        });

        expect(progressiveFeedbackService.refreshProgressiveFeedback).not.toHaveBeenCalled();
    });
});
