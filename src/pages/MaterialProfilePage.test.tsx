
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MaterialProfilePage from './MaterialProfilePage';
import { MemoryRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';

// Mock dependencies
const mockNavigate = vi.fn();
const mockUseParams = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useParams: () => mockUseParams(),
    };
});

const mockGetTestFromFirebase = vi.fn();

vi.mock('../services/testStorage', () => ({
    getTestFromFirebase: (id: string) => mockGetTestFromFirebase(id),
}));

const mockGetMaterialUsageCount = vi.fn();
vi.mock('../services/materialLinkManager', () => ({
    getMaterialUsageCount: (id: string) => mockGetMaterialUsageCount(id),
}));

const mockUseAuth = vi.fn();
vi.mock('../hooks/useAuth', () => ({
    useAuth: () => mockUseAuth(),
}));

describe('MaterialProfilePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseParams.mockReturnValue({ materialId: 'test-123' });
    });

    const renderPage = () => {
        render(
            <MantineProvider>
                <MemoryRouter>
                    <MaterialProfilePage />
                </MemoryRouter>
            </MantineProvider>
        );
    };

    const mockMaterial = {
        id: 'test-123',
        title: 'Sample Test Material',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
        difficulty: 'Intermediate',
        questionCount: 40,
        createdAt: Date.now(),
        createdBy: 'teacher-1',
        updatedAt: Date.now(),
        isPublished: true,
        isPublic: true,
        isComplete: true,
        ownerId: 'teacher-1',
        metadata: {
            description: 'A sample practice test for IELTS Reading',
            targetBand: '7.0',
            estimatedScore: '40',
            tags: ['Practice', 'Academic']
        },
        passages: [],
        questions: [],
        settings: {},
        statistics: {
            attempts: 5,
            averageScore: 75
        }
    };

    it('renders loading state initially', () => {
        mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, profile: { role: 'teacher' } });
        mockGetTestFromFirebase.mockReturnValue(new Promise(() => { })); // Never resolves
        render(
            <MantineProvider>
                <MemoryRouter>
                    <MaterialProfilePage />
                </MemoryRouter>
            </MantineProvider>
        );
        expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('displays material data correctly', async () => {
        mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, profile: { role: 'teacher' } });
        mockGetTestFromFirebase.mockResolvedValue({ success: true, data: mockMaterial });
        mockGetMaterialUsageCount.mockResolvedValue(42);

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Sample Test Material')).toBeInTheDocument();
        });

        expect(screen.getByText('IELTS')).toBeInTheDocument();
        expect(screen.getByText('Reading')).toBeInTheDocument();
        expect(screen.getByText('60 minutes')).toBeInTheDocument();
        expect(screen.getByText('Intermediate')).toBeInTheDocument();
        expect(screen.getByText('A sample practice test for IELTS Reading')).toBeInTheDocument();
        expect(screen.getByText('Band: 7.0')).toBeInTheDocument();

        // Check for usage count
        expect(screen.getByText('Used in Courses')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('shows edit button for owner', async () => {
        mockUseAuth.mockReturnValue({ user: { uid: 'teacher-1' }, profile: { role: 'teacher' } });
        mockGetTestFromFirebase.mockResolvedValue({ success: true, data: mockMaterial });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Edit Material')).toBeInTheDocument();
        });
    });

    it('shows edit button for super admin', async () => {
        mockUseAuth.mockReturnValue({ user: { uid: 'admin-1' }, profile: { role: 'super_admin' } });
        mockGetTestFromFirebase.mockResolvedValue({ success: true, data: mockMaterial });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Edit Material')).toBeInTheDocument();
        });
    });

    it('hides edit button for non-owner teacher', async () => {
        mockUseAuth.mockReturnValue({ user: { uid: 'teacher-2' }, profile: { role: 'teacher' } });
        mockGetTestFromFirebase.mockResolvedValue({ success: true, data: mockMaterial });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Sample Test Material')).toBeInTheDocument();
        });

        expect(screen.queryByText('Edit Material')).not.toBeInTheDocument();
    });

    it('handles error state', async () => {
        mockUseAuth.mockReturnValue({ user: { uid: 'u1' }, profile: { role: 'teacher' } });
        mockGetTestFromFirebase.mockResolvedValue({ success: false, error: 'Not found' });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Not found')).toBeInTheDocument();
        });
    });
});
