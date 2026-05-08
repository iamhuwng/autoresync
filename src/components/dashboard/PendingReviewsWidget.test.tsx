import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PendingReviewsWidget from './PendingReviewsWidget';

const navigateMock = vi.fn();
const getDocsMock = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'student-1',
        },
    }),
}));

vi.mock('../../services/firebase', () => ({
    firestore: {},
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => navigateMock,
    };
});

vi.mock('firebase/firestore', () => ({
    collection: vi.fn(() => 'collection-ref'),
    getDocs: (...args: unknown[]) => getDocsMock(...args),
    limit: vi.fn((value: number) => ({ type: 'limit', value })),
    orderBy: vi.fn((field: string, direction: string) => ({ type: 'orderBy', field, direction })),
    query: vi.fn((...parts: unknown[]) => ({ type: 'query', parts })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ type: 'where', field, op, value })),
}));

describe('PendingReviewsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders canonical writing titles without exposing raw ids or context keys', async () => {
        getDocsMock.mockResolvedValue({
            docs: [
                {
                    id: 'submission-1',
                    data: () => ({
                        submittedAt: Date.UTC(2026, 3, 1),
                        markingStatus: 'pending-review',
                        context: { type: 'live-session' },
                        testMeta: {
                            testId: '-Omckd15l3a2iWqKTljt',
                            testTitle: 'MD IELTS1 Writing Lesson 5',
                        },
                    }),
                },
            ],
        });

        render(<PendingReviewsWidget />);

        await waitFor(() => {
            expect(screen.getByText('MD IELTS1 Writing Lesson 5')).toBeInTheDocument();
        });

        expect(screen.queryByText('-Omckd15l3a2iWqKTljt')).not.toBeInTheDocument();
        expect(screen.queryByText('live-session')).not.toBeInTheDocument();
    });

    it('keeps visible review controls at the mobile 44px touch target', async () => {
        getDocsMock.mockResolvedValue({
            docs: [
                {
                    id: 'submission-1',
                    data: () => ({
                        submittedAt: Date.UTC(2026, 3, 1),
                        markingStatus: 'pending-review',
                        context: { type: 'live-session' },
                        testMeta: {
                            testTitle: 'MD IELTS1 Writing Lesson 5',
                        },
                    }),
                },
                {
                    id: 'submission-2',
                    data: () => ({
                        submittedAt: Date.UTC(2026, 3, 2),
                        markingStatus: 'pending-review',
                        context: { type: 'live-session' },
                        testMeta: {
                            testTitle: 'MD IELTS1 Writing Lesson 6',
                        },
                    }),
                },
                {
                    id: 'submission-3',
                    data: () => ({
                        submittedAt: Date.UTC(2026, 3, 3),
                        markingStatus: 'pending-review',
                        context: { type: 'live-session' },
                        testMeta: {
                            testTitle: 'MD IELTS1 Writing Lesson 7',
                        },
                    }),
                },
                {
                    id: 'submission-4',
                    data: () => ({
                        submittedAt: Date.UTC(2026, 3, 4),
                        markingStatus: 'pending-review',
                        context: { type: 'live-session' },
                        testMeta: {
                            testTitle: 'MD IELTS1 Writing Lesson 8',
                        },
                    }),
                },
                {
                    id: 'submission-5',
                    data: () => ({
                        submittedAt: Date.UTC(2026, 3, 5),
                        markingStatus: 'pending-review',
                        context: { type: 'live-session' },
                        testMeta: {
                            testTitle: 'MD IELTS1 Writing Lesson 9',
                        },
                    }),
                },
                {
                    id: 'submission-6',
                    data: () => ({
                        submittedAt: Date.UTC(2026, 3, 6),
                        markingStatus: 'pending-review',
                        context: { type: 'live-session' },
                        testMeta: {
                            testTitle: 'MD IELTS1 Writing Lesson 10',
                        },
                    }),
                },
            ],
        });

        render(<PendingReviewsWidget />);

        const reviewRow = await screen.findByRole('button', { name: /MD IELTS1 Writing Lesson 5/i });
        const seeAllButton = await screen.findByRole('button', { name: /See all reviews/i });

        expect(reviewRow).toHaveStyle({ minHeight: '44px' });
        expect(seeAllButton).toHaveStyle({ minHeight: '44px' });
    });
});
