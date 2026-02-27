
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LinkCourseModal } from './LinkCourseModal';
import { getCoursesByOwner } from '../../services/courseManager';
import { linkCourseToClass } from '../../services/enrollmentManager';
import { MantineProvider } from '@mantine/core';

// Mock dependencies
vi.mock('../../services/courseManager', () => ({
    getCoursesByOwner: vi.fn()
}));

vi.mock('../../services/enrollmentManager', () => ({
    linkCourseToClass: vi.fn()
}));

// Mock notifications
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn()
    }
}));

const renderWithMantine = (component: React.ReactNode) => {
    return render(
        <MantineProvider>
            {component}
        </MantineProvider>
    );
};

describe('LinkCourseModal', () => {
    const mockCourses = [
        { id: 'c1', name: 'Course 1', code: 'C1', archivedAt: null },
        { id: 'c2', name: 'Course 2', code: 'C2', archivedAt: null }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        (getCoursesByOwner as any).mockResolvedValue(mockCourses);
        (linkCourseToClass as any).mockResolvedValue({ success: true });
    });

    it('should render and load courses when opened', async () => {
        renderWithMantine(
            <LinkCourseModal
                opened={true}
                onClose={() => { }}
                classId="class1"
                teacherId="teacher1"
                onSuccess={() => { }}
            />
        );

        expect(screen.getByPlaceholderText('Search your courses...')).toBeInTheDocument();

        await waitFor(() => {
            expect(getCoursesByOwner).toHaveBeenCalledWith('teacher1');
            expect(screen.getByText('Course 1')).toBeInTheDocument();
            expect(screen.getByText('Course 2')).toBeInTheDocument();
        });
    });

    it('should select course and submit', async () => {
        const onSuccess = vi.fn();
        renderWithMantine(
            <LinkCourseModal
                opened={true}
                onClose={() => { }}
                classId="class1"
                teacherId="teacher1"
                onSuccess={onSuccess}
            />
        );

        await waitFor(() => expect(screen.getByText('Course 1')).toBeInTheDocument());

        // Select course
        fireEvent.click(screen.getByText('Course 1'));

        // Check button enabled
        const submitBtn = screen.getByRole('button', { name: /link course/i });
        expect(submitBtn).not.toBeDisabled();

        // Submit
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(linkCourseToClass).toHaveBeenCalledWith(
                'class1',
                'c1',
                expect.objectContaining({ value: 1, unit: 'months' }),
                true
            );
            expect(onSuccess).toHaveBeenCalled();
        });
    });

    it('should filter courses', async () => {
        renderWithMantine(
            <LinkCourseModal
                opened={true}
                onClose={() => { }}
                classId="class1"
                teacherId="teacher1"
                onSuccess={() => { }}
            />
        );

        await waitFor(() => expect(screen.getByText('Course 1')).toBeInTheDocument());

        const searchInput = screen.getByPlaceholderText('Search your courses...');
        fireEvent.change(searchInput, { target: { value: 'Course 2' } });

        expect(screen.queryByText('Course 1')).not.toBeInTheDocument();
        expect(screen.getByText('Course 2')).toBeInTheDocument();
    });
});
