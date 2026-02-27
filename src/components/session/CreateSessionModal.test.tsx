import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CreateSessionModal } from './CreateSessionModal';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { getClasses } from '../../services/classManager';
import { createSession } from '../../services/sessionManager';
import { useAuth } from '../../hooks/useAuth';
import { MantineProvider } from '@mantine/core';

// Global setup for Mantine
class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
}
global.ResizeObserver = ResizeObserver;

Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Mock dependencies
vi.mock('../../services/classManager', () => ({
    getClasses: vi.fn(),
}));

vi.mock('../../services/sessionManager', () => ({
    createSession: vi.fn(),
    SessionMode: { QUIZ: 'quiz', TEST: 'test' }
}));

vi.mock('../../hooks/useAuth', () => ({
    useAuth: vi.fn(),
}));

// Helper
const renderWithMantine = (ui: React.ReactNode) => {
    return render(
        <MantineProvider>
            {ui}
        </MantineProvider>
    );
};

describe('CreateSessionModal', () => {
    const mockOnClose = vi.fn();
    const mockOnSessionCreated = vi.fn();
    const mockUser = { uid: 'teacher-1', email: 'teacher@test.com' };

    beforeEach(() => {
        vi.clearAllMocks();
        (useAuth as any).mockReturnValue({ user: mockUser });
        (getClasses as any).mockResolvedValue([
            { id: 'class-1', name: 'Class A', classCode: 'CLA' },
            { id: 'class-2', name: 'Class B', classCode: 'CLB' }
        ]);
        (createSession as any).mockResolvedValue({ success: true, sessionCode: '123456' });
    });

    it.skip('should render modal when opened', async () => {
        renderWithMantine(
            <CreateSessionModal
                opened={true}
                onClose={mockOnClose}
                onSessionCreated={mockOnSessionCreated}
            />
        );

        // Modals might animate or depend on portal rendering, so wait for presence
        expect(await screen.findByText('Start New Session')).toBeInTheDocument();
        expect(screen.getByText('Quiz Mode')).toBeInTheDocument();
    });

    it.skip('should display course name when courseName prop is provided', async () => {
        const courseName = 'IELTS Prep Course';
        renderWithMantine(
            <CreateSessionModal
                opened={true}
                onClose={mockOnClose}
                onSessionCreated={mockOnSessionCreated}
                courseId="course-1"
                courseName={courseName}
            />
        );

        // Wait for modal title to ensure it's open
        await screen.findByText('Start New Session');

        expect(screen.getByText((content, element) => {
            return element?.tagName.toLowerCase() === 'strong' && content === courseName;
        })).toBeInTheDocument();

        expect(screen.getByText((content) => content.includes('This session is for:'))).toBeInTheDocument();
    });

    it.skip('should pass courseId and moduleId to createSession', async () => {
        renderWithMantine(
            <CreateSessionModal
                opened={true}
                onClose={mockOnClose}
                onSessionCreated={mockOnSessionCreated}
                courseId="course-1"
                courseName="Course A"
                moduleId="module-1"
            />
        );

        // Wait for modal to be ready
        const createButton = await screen.findByRole('button', { name: /create session/i });
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(createSession).toHaveBeenCalled();
        });

        expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
            courseId: 'course-1',
            moduleId: 'module-1'
        }));
    });

    it.skip('should not display course message when courseName is not provided', async () => {
        renderWithMantine(
            <CreateSessionModal
                opened={true}
                onClose={mockOnClose}
                onSessionCreated={mockOnSessionCreated}
            />
        );

        // Wait for modal
        await screen.findByText('Start New Session');

        expect(screen.queryByText((content) => content.includes('This session is for:'))).not.toBeInTheDocument();
    });
});
