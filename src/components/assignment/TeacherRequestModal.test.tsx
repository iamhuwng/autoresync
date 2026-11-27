/**
 * Vitest Unit Tests for TeacherRequestModal Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TeacherRequestModal } from './TeacherRequestModal';

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
        render(<TeacherRequestModal {...defaultProps} />);
        expect(screen.getByText('Request Student')).toBeInTheDocument();
        expect(screen.getByLabelText(/Student Email/i)).toBeInTheDocument();
    });

    it('should validate empty email', () => {
        render(<TeacherRequestModal {...defaultProps} />);
        const submitButton = screen.getByRole('button', { name: /Send Request/i });
        expect(submitButton).toBeDisabled();
    });

    it('should validate invalid email format', async () => {
        render(<TeacherRequestModal {...defaultProps} />);

        fireEvent.change(screen.getByLabelText(/Student Email/i), { target: { value: 'invalid-email' } });
        fireEvent.click(screen.getByRole('button', { name: /Send Request/i }));

        await waitFor(() => {
            expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
        });
        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('should canonicalize mixed-case email with whitespace before calling onSubmit', async () => {
        mockOnSubmit.mockResolvedValue(undefined);
        render(<TeacherRequestModal {...defaultProps} />);

        fireEvent.change(screen.getByLabelText(/Student Email/i), {
            target: { value: '  Student@Example.COM  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: /Send Request/i }));

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalledWith('student@example.com');
        });
    });

    it('should handle submission errors', async () => {
        mockOnSubmit.mockRejectedValue(new Error('Student not found'));
        render(<TeacherRequestModal {...defaultProps} />);

        fireEvent.change(screen.getByLabelText(/Student Email/i), { target: { value: 'unknown@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /Send Request/i }));

        await waitFor(() => {
            expect(screen.getByText('Student not found')).toBeInTheDocument();
        });
    });

    it('should reset form when reopened', () => {
        const { rerender } = render(<TeacherRequestModal {...defaultProps} opened={true} />);

        const input = screen.getByLabelText(/Student Email/i) as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'dirty@example.com' } });
        expect(input.value).toBe('dirty@example.com');

        rerender(<TeacherRequestModal {...defaultProps} opened={false} />);
        rerender(<TeacherRequestModal {...defaultProps} opened={true} />);

        const inputAfterReopen = screen.getByLabelText(/Student Email/i) as HTMLInputElement;
        expect(inputAfterReopen.value).toBe('');
    });
});
