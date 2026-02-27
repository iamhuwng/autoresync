
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CourseAnnouncementEditor from './CourseAnnouncementEditor';
import { MantineProvider } from '@mantine/core';

// Mock dependencies
vi.mock('../../services/r2Storage', () => ({
    default: {
        uploadFile: vi.fn()
    }
}));

describe('CourseAnnouncementEditor', () => {
    const mockSubmit = vi.fn();
    const mockCancel = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders form elements', () => {
        render(
            <MantineProvider>
                <CourseAnnouncementEditor onSubmit={mockSubmit} />
            </MantineProvider>
        );
        expect(screen.getByPlaceholderText('e.g., Midterm Exam Schedule Change')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Write your announcement here...')).toBeInTheDocument();
        expect(screen.getByText('Post Announcement')).toBeInTheDocument();
    });

    it('validates required fields', () => {
        render(
            <MantineProvider>
                <CourseAnnouncementEditor onSubmit={mockSubmit} />
            </MantineProvider>
        );
        const button = screen.getByRole('button', { name: "Post Announcement" });
        expect(button).toBeDisabled();

        fireEvent.change(screen.getByPlaceholderText('e.g., Midterm Exam Schedule Change'), { target: { value: 'Title' } });
        expect(button).toBeDisabled(); // Content still empty

        fireEvent.change(screen.getByPlaceholderText('Write your announcement here...'), { target: { value: 'Content' } });
        expect(button).not.toBeDisabled();
    });

    it('calls onSubmit with data', async () => {
        render(
            <MantineProvider>
                <CourseAnnouncementEditor onSubmit={mockSubmit} />
            </MantineProvider>
        );

        fireEvent.change(screen.getByPlaceholderText('e.g., Midterm Exam Schedule Change'), { target: { value: 'Test Title' } });
        fireEvent.change(screen.getByPlaceholderText('Write your announcement here...'), { target: { value: 'Test Content' } });

        const button = screen.getByRole('button', { name: "Post Announcement" });
        fireEvent.click(button);

        expect(mockSubmit).toHaveBeenCalledWith({
            title: 'Test Title',
            content: 'Test Content',
            attachments: [],
            targetClassIds: []
        });
    });

    it('shows classes multiselect if classes provided', () => {
        const classes = [{ id: 'c1', name: 'Class A' }, { id: 'c2', name: 'Class B' }];
        render(
            <MantineProvider>
                <CourseAnnouncementEditor onSubmit={mockSubmit} classes={classes} />
            </MantineProvider>
        );
        expect(screen.getByPlaceholderText('All enrolled students')).toBeInTheDocument();
    });
});
