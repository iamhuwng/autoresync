/**
 * GuestResultsPage Tests
 * PRD-0040 Task 5.4
 *
 * Tests:
 * 1. Renders search UI with guest name input
 * 2. Searches and displays results
 * 3. Shows "no results" state
 * 4. CTA buttons navigate to / (login page) — not stale /register or /login
 * 5. Handles search errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GuestResultsPage } from './GuestResultsPage';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock guestResultsService
const mockGetGuestResults = vi.fn();
vi.mock('../services/guestResultsService', () => ({
    getGuestResults: (...args: unknown[]) => mockGetGuestResults(...args),
}));

// Mock ResultCard — we test page behavior, not card rendering
vi.mock('../components/academicRecord/ResultCard', () => ({
    ResultCard: ({ result, onClick }: { result: { resultId: string }; onClick: () => void }) => (
        <div data-testid={`result-card-${result.resultId}`} onClick={onClick}>
            Result: {result.resultId}
        </div>
    ),
}));

// Mock @mantine/core — GuestResultsPage uses Mantine (legacy, Rule 15 documented)
vi.mock('@mantine/core', () => ({
    Container: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
        <div data-testid="container" {...props}>{children}</div>
    ),
    Title: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
        <h1 {...props}>{children}</h1>
    ),
    TextInput: ({
        value,
        onChange,
        onKeyPress,
        error,
        label,
        ...props
    }: {
        value: string;
        onChange: (e: { currentTarget: { value: string } }) => void;
        onKeyPress?: (e: React.KeyboardEvent) => void;
        error?: string | null;
        label?: string;
        [key: string]: unknown;
    }) => (
        <div>
            {label && <label>{label}</label>}
            <input
                data-testid="guest-name-input"
                value={value}
                onChange={(e) => onChange({ currentTarget: { value: e.target.value } })}
                onKeyPress={onKeyPress}
                aria-invalid={!!error}
            />
            {error && <span data-testid="input-error">{error}</span>}
        </div>
    ),
    Button: ({
        children,
        onClick,
        loading,
        disabled,
        ...props
    }: React.PropsWithChildren<{
        onClick?: () => void;
        loading?: boolean;
        disabled?: boolean;
        [key: string]: unknown;
    }>) => (
        <button onClick={onClick} disabled={loading || disabled} data-loading={loading}>
            {children}
        </button>
    ),
    Stack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Paper: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Group: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Alert: ({ children, title }: React.PropsWithChildren<{ title?: string }>) => (
        <div data-testid="alert">{title && <strong>{title}</strong>}{children}</div>
    ),
    Loader: () => <div data-testid="loader">Loading...</div>,
    Center: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Divider: () => <hr />,
}));

// Mock @tabler/icons-react
vi.mock('@tabler/icons-react', () => ({
    IconSearch: () => <span>🔍</span>,
    IconInfoCircle: () => <span>ℹ️</span>,
    IconLogin: () => <span>🔑</span>,
    IconUserPlus: () => <span>➕</span>,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const renderPage = () => {
    return render(
        <MemoryRouter initialEntries={['/guest-results']}>
            <GuestResultsPage />
        </MemoryRouter>
    );
};

const mockResults = [
    {
        resultId: 'result-1',
        testTitle: 'Math Test',
        score: 80,
        totalQuestions: 10,
        correctAnswers: 8,
        submittedAt: Date.now() - 10000,
        studentId: 'guest',
        guestName: 'John',
        isGuestResult: true,
    },
    {
        resultId: 'result-2',
        testTitle: 'English Test',
        score: 70,
        totalQuestions: 10,
        correctAnswers: 7,
        submittedAt: Date.now(),
        studentId: 'guest',
        guestName: 'John',
        isGuestResult: true,
    },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GuestResultsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetGuestResults.mockResolvedValue([]);
    });

    describe('Initial Render', () => {
        it('should render guest results page with search input', () => {
            renderPage();

            expect(screen.getByText('Guest Results')).toBeInTheDocument();
            expect(screen.getByTestId('guest-name-input')).toBeInTheDocument();
            expect(screen.getByText('Search Results')).toBeInTheDocument();
        });

        it('should render info alert about guest results', () => {
            renderPage();

            expect(screen.getByText('About Guest Results')).toBeInTheDocument();
        });
    });

    describe('Search Behavior', () => {
        it('should search for guest results when clicking search button', async () => {
            mockGetGuestResults.mockResolvedValue(mockResults);
            renderPage();

            const input = screen.getByTestId('guest-name-input');
            fireEvent.change(input, { target: { value: 'John' } });

            const searchBtn = screen.getByText('Search Results');
            fireEvent.click(searchBtn);

            await waitFor(() => {
                expect(mockGetGuestResults).toHaveBeenCalledWith('John');
            });
        });

        it('should display results after successful search', async () => {
            mockGetGuestResults.mockResolvedValue(mockResults);
            renderPage();

            const input = screen.getByTestId('guest-name-input');
            fireEvent.change(input, { target: { value: 'John' } });
            fireEvent.click(screen.getByText('Search Results'));

            await waitFor(() => {
                expect(screen.getByTestId('result-card-result-1')).toBeInTheDocument();
                expect(screen.getByTestId('result-card-result-2')).toBeInTheDocument();
            });
        });

        it('should show "no results found" when search returns empty', async () => {
            mockGetGuestResults.mockResolvedValue([]);
            renderPage();

            const input = screen.getByTestId('guest-name-input');
            fireEvent.change(input, { target: { value: 'Unknown' } });
            fireEvent.click(screen.getByText('Search Results'));

            await waitFor(() => {
                expect(screen.getByText('No results found')).toBeInTheDocument();
            });
        });

        it('should show error when search fails', async () => {
            mockGetGuestResults.mockRejectedValue(new Error('Network error'));
            renderPage();

            const input = screen.getByTestId('guest-name-input');
            fireEvent.change(input, { target: { value: 'John' } });
            fireEvent.click(screen.getByText('Search Results'));

            await waitFor(() => {
                expect(screen.getByTestId('input-error')).toHaveTextContent(
                    'Failed to fetch results. Please try again.'
                );
            });
        });

        it('should show validation error when searching with empty name', () => {
            renderPage();

            fireEvent.click(screen.getByText('Search Results'));

            expect(screen.getByTestId('input-error')).toHaveTextContent(
                'Please enter a guest name'
            );
            expect(mockGetGuestResults).not.toHaveBeenCalled();
        });
    });

    describe('CTA Route Targets (PRD-0040 Task 5.3)', () => {
        /**
         * PRD-0040 Finding F-5.3a: All CTA buttons must navigate to /
         * (the root login page). Previously pointed to dead /register and /login routes.
         */
        it('should navigate to / when "Create Account to Claim" is clicked', async () => {
            mockGetGuestResults.mockResolvedValue(mockResults);
            renderPage();

            const input = screen.getByTestId('guest-name-input');
            fireEvent.change(input, { target: { value: 'John' } });
            fireEvent.click(screen.getByText('Search Results'));

            await waitFor(() => {
                expect(screen.getByText('Create Account to Claim')).toBeInTheDocument();
            });

            fireEvent.click(screen.getByText('Create Account to Claim'));
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });

        it('should navigate to / when "Create Account" footer CTA is clicked', () => {
            renderPage();

            fireEvent.click(screen.getByText('Create Account'));
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });

        it('should navigate to / when "Already have an account? Login" is clicked', () => {
            renderPage();

            fireEvent.click(screen.getByText('Already have an account? Login'));
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });

        it('should NOT navigate to /register (dead route)', async () => {
            mockGetGuestResults.mockResolvedValue(mockResults);
            renderPage();

            const input = screen.getByTestId('guest-name-input');
            fireEvent.change(input, { target: { value: 'John' } });
            fireEvent.click(screen.getByText('Search Results'));

            await waitFor(() => {
                expect(screen.getByText('Create Account to Claim')).toBeInTheDocument();
            });

            // Click all CTA buttons and verify none navigate to dead routes
            fireEvent.click(screen.getByText('Create Account to Claim'));
            fireEvent.click(screen.getByText('Create Account'));
            fireEvent.click(screen.getByText('Already have an account? Login'));

            for (const call of mockNavigate.mock.calls) {
                expect(call[0]).not.toBe('/register');
                expect(call[0]).not.toBe('/login');
            }
        });
    });
});
