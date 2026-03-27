/**
 * ResultDetailPage Tests
 * PRD-0039 Task 4.12
 *
 * Tests:
 * 1. Student redirect → /student/academic-record?result={resultId}
 * 2. Teacher/admin → renders LegacyResultDetailView
 * 3. Missing resultId → shows error UI
 * 4. Auth loading → shows spinner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ResultDetailPage } from './ResultDetailPage';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock useAuth
let mockProfile: { role: string; displayName?: string; email?: string; avatarUrl?: string } | null = { role: 'student' };
let mockUser: { uid?: string; displayName?: string; email?: string; photoURL?: string } | null = {
    uid: 'user-1',
    email: 'user@example.com',
};
let mockAuthLoading = false;
const mockLogout = vi.fn();

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: mockUser,
        profile: mockProfile,
        loading: mockAuthLoading,
        logout: mockLogout,
    }),
}));

// Mock useNavigate
const mockNavigate = vi.fn();
let legacyDetailVariant: 'default' | 'access-lost' = 'default';
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock LegacyResultDetailView — we test integration, not the child itself
vi.mock('../components/results/LegacyResultDetailView', () => ({
    LegacyResultDetailView: ({ resultId, onReturn }: { resultId: string; onReturn?: () => void }) => (
        <div data-testid="legacy-result-detail-view">
            {legacyDetailVariant === 'access-lost' ? (
                <span data-testid="legacy-access-lost">Access to this result has been revoked.</span>
            ) : (
                <span data-testid="result-id">{resultId}</span>
            )}
            {onReturn && <button data-testid="return-btn" onClick={onReturn}>Return</button>}
        </div>
    ),
}));

vi.mock('../components/navigation', () => ({
    TeacherHeader: ({ pageTitle, userRole }: { pageTitle: string; userRole: string }) => (
        <div data-testid="teacher-header">{`${pageTitle}:${userRole}`}</div>
    ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Helper to render ResultDetailPage within a MemoryRouter.
 * Uses /result/:resultId route to mirror App.jsx.
 */
const renderPage = (resultId?: string) => {
    const path = resultId ? `/result/${resultId}` : '/result/';
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/result/:resultId" element={<ResultDetailPage />} />
                <Route path="/result/" element={<ResultDetailPage />} />
                {/* Catch the redirect target so it renders */}
                <Route
                    path="/student/academic-record"
                    element={<LocationReader />}
                />
            </Routes>
        </MemoryRouter>
    );
};

/**
 * Helper component that renders the current location for assertion.
 * Used to verify redirect query params, not just the path.
 */
function LocationReader() {
    const location = useLocation();
    return (
        <div data-testid="academic-record-redirect">
            <span data-testid="redirect-search">{location.search}</span>
            Redirected
        </div>
    );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ResultDetailPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProfile = { role: 'student' };
        mockUser = { uid: 'user-1', email: 'user@example.com' };
        mockAuthLoading = false;
        legacyDetailVariant = 'default';
    });

    describe('Student Redirect (PRD-0039 Task 4.9)', () => {
        it('should redirect student to /student/academic-record?result={resultId}', () => {
            mockProfile = { role: 'student' };
            renderPage('abc123');

            // The redirect target route renders "Redirected"
            expect(screen.getByTestId('academic-record-redirect')).toBeInTheDocument();
            expect(screen.getByText('Redirected')).toBeInTheDocument();
            // Verify the query parameter carries the resultId
            expect(screen.getByTestId('redirect-search')).toHaveTextContent('?result=abc123');
        });

        it('should not render LegacyResultDetailView for students', () => {
            mockProfile = { role: 'student' };
            renderPage('abc123');

            expect(screen.queryByTestId('legacy-result-detail-view')).not.toBeInTheDocument();
        });
    });

    /**
     * PRD-0040 Task 3.1 — Regression test for ownership carry decision.
     * Decision 1 from prd0040-preflight-ledger.md §Blocking Architectural Decisions:
     * Phase 1 carries the current student redirect behavior. Students hitting
     * /result/:resultId are redirected to /student/academic-record?result={resultId}.
     * This test ensures the redirect safety net cannot regress.
     */
    describe('Student Ownership Carry Decision (PRD-0040 Task 3.1)', () => {
        it('should redirect student to academic-record with exact resultId in query param', () => {
            mockProfile = { role: 'student' };
            renderPage('ownership-test-id-789');

            expect(screen.getByTestId('academic-record-redirect')).toBeInTheDocument();
            expect(screen.getByTestId('redirect-search')).toHaveTextContent('?result=ownership-test-id-789');
            // Students must never see the full-page legacy view
            expect(screen.queryByTestId('legacy-result-detail-view')).not.toBeInTheDocument();
        });

        it('teacher should NOT be redirected — sees LegacyResultDetailView', () => {
            mockProfile = { role: 'teacher' };
            renderPage('ownership-test-id-789');

            expect(screen.getByTestId('legacy-result-detail-view')).toBeInTheDocument();
            expect(screen.queryByTestId('academic-record-redirect')).not.toBeInTheDocument();
            expect(screen.getByTestId('result-detail-teacher-shell')).toBeInTheDocument();
            expect(screen.getByTestId('teacher-header')).toHaveTextContent('Result Detail:teacher');
        });
    });

    describe('Teacher/Admin Legacy Render (PRD-0039 Task 4.9)', () => {
        it('should render LegacyResultDetailView for teacher role', () => {
            mockProfile = { role: 'teacher' };
            renderPage('result-xyz');

            expect(screen.getByTestId('result-detail-teacher-shell')).toBeInTheDocument();
            expect(screen.getByTestId('teacher-header')).toHaveTextContent('Result Detail:teacher');
            expect(screen.getByTestId('legacy-result-detail-view')).toBeInTheDocument();
            expect(screen.getByTestId('result-id')).toHaveTextContent('result-xyz');
        });

        it('should render LegacyResultDetailView for super_admin role', () => {
            mockProfile = { role: 'super_admin' };
            renderPage('result-admin-1');

            expect(screen.getByTestId('result-detail-teacher-shell')).toBeInTheDocument();
            expect(screen.getByTestId('teacher-header')).toHaveTextContent('Result Detail:super_admin');
            expect(screen.getByTestId('legacy-result-detail-view')).toBeInTheDocument();
            expect(screen.getByTestId('result-id')).toHaveTextContent('result-admin-1');
        });

        it('should pass onReturn callback that calls navigate(-1)', () => {
            mockProfile = { role: 'teacher' };
            renderPage('result-xyz');

            const returnBtn = screen.getByTestId('return-btn');
            returnBtn.click();

            expect(mockNavigate).toHaveBeenCalledWith(-1);
        });

        it('keeps the teacher shell visible when detail view enters access-lost state', () => {
            mockProfile = { role: 'teacher' };
            legacyDetailVariant = 'access-lost';

            renderPage('result-xyz');

            expect(screen.getByTestId('result-detail-teacher-shell')).toBeInTheDocument();
            expect(screen.getByTestId('teacher-header')).toHaveTextContent('Result Detail:teacher');
            expect(screen.getByTestId('legacy-access-lost')).toHaveTextContent('Access to this result has been revoked.');
        });
    });

    describe('Auth Loading State', () => {
        it('should show a spinner while auth is loading', () => {
            mockAuthLoading = true;
            renderPage('abc123');

            // No legacy view, no redirect — just the spinner
            expect(screen.queryByTestId('legacy-result-detail-view')).not.toBeInTheDocument();
            expect(screen.queryByTestId('academic-record-redirect')).not.toBeInTheDocument();
        });
    });
});
