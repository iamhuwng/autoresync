/**
 * Vitest Unit Tests for TeacherRequestModal Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { TeacherRequestModal } from './TeacherRequestModal';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const renderWithProvider = (ui: React.ReactElement) => {
    return render(<MantineProvider>{ui}</MantineProvider>);
};

// ============================================================================
// TEST SUITES
// ============================================================================

describe('TeacherRequestModal Component', () => {
    const mockOnSubmit = vi.fn();
    const defaultProps = {
        opened: true,
        onClose: vi.fn(),
        onSubmit: mockOnSubmit,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render modal when opened is true', () => {
        renderWithProvider(<TeacherRequestModal {...defaultProps} />);
        expect(screen.getByText('Request Student')).toBeInTheDocument();
        expect(screen.getByLabelText(/Student Email/i)).toBeInTheDocument();
    });

    it('should validate empty email', async () => {
        renderWithProvider(<TeacherRequestModal {...defaultProps} />);

        // Note: The button is disabled when empty, so we might not be able to click it.
        // Let's check if the button is disabled initially.
        const submitButton = screen.getByRole('button', { name: /Send Request/i });
        expect(submitButton).toBeDisabled();
    });

    it('should validate invalid email format', async () => {
        renderWithProvider(<TeacherRequestModal {...defaultProps} />);

        const input = screen.getByLabelText(/Student Email/i);
        fireEvent.change(input, { target: { value: 'invalid-email' } });

        const submitButton = screen.getByRole('button', { name: /Send Request/i });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
        });
        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should call onSubmit with valid email', async () => {
        mockOnSubmit.mockResolvedValue(undefined);
        renderWithProvider(<TeacherRequestModal {...defaultProps} />);

        const input = screen.getByLabelText(/Student Email/i);
        fireEvent.change(input, { target: { value: 'student@example.com' } });

        const submitButton = screen.getByRole('button', { name: /Send Request/i });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalledWith('student@example.com');
        });
    });

    it('should handle submission errors', async () => {
        mockOnSubmit.mockRejectedValue(new Error('Student not found'));
        renderWithProvider(<TeacherRequestModal {...defaultProps} />);

        const input = screen.getByLabelText(/Student Email/i);
        fireEvent.change(input, { target: { value: 'unknown@example.com' } });

        const submitButton = screen.getByRole('button', { name: /Send Request/i });
        fireEvent.click(submitButton);

        await waitFor(() => {
            expect(screen.getByText('Student not found')).toBeInTheDocument();
        });
    });

    it('should reset form when reopened', async () => {
        const { rerender } = renderWithProvider(<TeacherRequestModal {...defaultProps} opened={true} />);

        const input = screen.getByLabelText(/Student Email/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'dirty@example.com' } });
        expect(input.value).toBe('dirty@example.com');

        // Close
        rerender(<MantineProvider><TeacherRequestModal {...defaultProps} opened={false} /></MantineProvider>);

        // Reopen
        rerender(<MantineProvider><TeacherRequestModal {...defaultProps} opened={true} /></MantineProvider>);

        const inputAfterReopen = screen.getByLabelText(/Student Email/i) as HTMLInputElement;
        expect(inputAfterReopen.value).toBe('');
    });
});
