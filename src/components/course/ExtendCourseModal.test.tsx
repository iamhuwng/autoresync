
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExtendCourseModal } from './ExtendCourseModal';
import { extendCourseDuration } from '../../services/enrollmentManager';
import { MantineProvider } from '@mantine/core';

// Mock dependencies
vi.mock('../../services/enrollmentManager', () => ({
    extendCourseDuration: vi.fn()
}));

vi.mock('@mantine/notifications', () => ({
    notifications: { show: vi.fn() }
}));

const renderWithMantine = (component: React.ReactNode) => {
    return render(
        <MantineProvider>
            {component}
        </MantineProvider>
    );
};

describe('ExtendCourseModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (extendCourseDuration as any).mockResolvedValue({ success: true });
    });

    it('should submit extension request', async () => {
        const onSuccess = vi.fn();
        renderWithMantine(
            <ExtendCourseModal
                opened={true}
                onClose={() => { }}
                classCourseId="link1"
                onSuccess={onSuccess}
            />
        );

        // Fill form
        const input = screen.getByLabelText('Extend by');
        fireEvent.change(input, { target: { value: '10' } });

        // Submit
        const submitBtn = await screen.findByRole('button', { name: 'Extend' });
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(extendCourseDuration).toHaveBeenCalledWith(
                'link1',
                expect.objectContaining({ value: 10, unit: 'days' })
            );
            expect(onSuccess).toHaveBeenCalled();
        });
    });

    it('should validate input', async () => {
        const onSuccess = vi.fn();
        renderWithMantine(
            <ExtendCourseModal
                opened={true}
                onClose={() => { }}
                classCourseId="link1"
                onSuccess={onSuccess}
            />
        );

        const input = screen.getByLabelText('Extend by');
        // Set to 0 which should fail validation
        fireEvent.change(input, { target: { value: '0' } });

        const submitBtn = await screen.findByRole('button', { name: 'Extend' });
        fireEvent.click(submitBtn);

        // Wait to ensure form validation runs and prevents submission
        await waitFor(() => {
            // onSuccess should not be called if validation fails
            expect(onSuccess).not.toHaveBeenCalled();
        }, { timeout: 1000 });
    });
});
