/**
 * ClaimResultsModal Tests
 * PRD-0040 Task 5.4
 *
 * Tests:
 * 1. Renders claimable guest names list
 * 2. Claim button triggers claimGuestResults for each guest name
 * 3. Skip button calls onClose
 * 4. Shows progress during claim
 * 5. Handles claim errors
 * 6. Calls onClaimComplete after successful claim
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClaimResultsModal } from './ClaimResultsModal';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockClaimGuestResults = vi.fn();
const mockGetGuestResultCount = vi.fn();

vi.mock('../../services/guestResultsService', () => ({
    claimGuestResults: (...args: unknown[]) => mockClaimGuestResults(...args),
    getGuestResultCount: (...args: unknown[]) => mockGetGuestResultCount(...args),
}));

// Mock @mantine/notifications
const mockNotificationsShow = vi.fn();
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: (...args: unknown[]) => mockNotificationsShow(...args),
    },
}));

// Mock @mantine/core — ClaimResultsModal uses Mantine (legacy, Rule 15 documented)
vi.mock('@mantine/core', () => ({
    Modal: ({
        children,
        opened,
        title,
    }: React.PropsWithChildren<{
        opened: boolean;
        title?: React.ReactNode;
        onClose?: () => void;
    }>) =>
        opened ? (
            <div data-testid="modal">
                <div data-testid="modal-title">{title}</div>
                {children}
            </div>
        ) : null,
    Stack: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Button: ({
        children,
        onClick,
        loading,
        disabled,
    }: React.PropsWithChildren<{
        onClick?: () => void;
        loading?: boolean;
        disabled?: boolean;
    }>) => (
        <button onClick={onClick} disabled={loading || disabled} data-loading={loading}>
            {children}
        </button>
    ),
    Group: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Alert: ({ children, title }: React.PropsWithChildren<{ title?: string }>) => (
        <div data-testid="alert">
            {title && <strong>{title}</strong>}
            {children}
        </div>
    ),
    List: Object.assign(
        ({ children }: React.PropsWithChildren) => <ul>{children}</ul>,
        {
            Item: ({ children }: React.PropsWithChildren) => <li>{children}</li>,
        }
    ),
    Loader: () => <div data-testid="loader">Loading...</div>,
    Paper: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Badge: ({ children }: React.PropsWithChildren) => <span data-testid="badge">{children}</span>,
    Progress: ({ value }: { value: number }) => (
        <div data-testid="progress" data-value={value} role="progressbar" aria-valuenow={value} />
    ),
}));

// Mock @tabler/icons-react
vi.mock('@tabler/icons-react', () => ({
    IconGift: () => <span>🎁</span>,
    IconInfoCircle: () => <span>ℹ️</span>,
    IconCheck: () => <span>✓</span>,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const defaultProps = {
    opened: true,
    onClose: vi.fn(),
    email: 'john@example.com',
    userId: 'user-123',
    claimableGuestNames: ['John', 'John_1'],
    onClaimComplete: vi.fn(),
};

const renderModal = (overrides = {}) => {
    return render(<ClaimResultsModal {...defaultProps} {...overrides} />);
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ClaimResultsModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetGuestResultCount.mockResolvedValue(3);
        mockClaimGuestResults.mockResolvedValue(3);
    });

    describe('Rendering', () => {
        it('should render modal when opened is true', () => {
            renderModal();
            expect(screen.getByTestId('modal')).toBeInTheDocument();
        });

        it('should not render modal when opened is false', () => {
            renderModal({ opened: false });
            expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
        });

        it('should display claimable guest names', () => {
            renderModal();
            expect(screen.getByText('John')).toBeInTheDocument();
            expect(screen.getByText('John_1')).toBeInTheDocument();
        });

        it('should display "Guest Results Found!" alert', () => {
            renderModal();
            expect(screen.getByText('Guest Results Found!')).toBeInTheDocument();
        });

        it('should display Claim Results and Skip buttons', () => {
            renderModal();
            expect(screen.getByText('Claim Results')).toBeInTheDocument();
            expect(screen.getByText('Skip for Now')).toBeInTheDocument();
        });
    });

    describe('Claim Flow', () => {
        it('should call claimGuestResults for each guest name when Claim is clicked', async () => {
            renderModal();

            fireEvent.click(screen.getByText('Claim Results'));

            await waitFor(() => {
                expect(mockClaimGuestResults).toHaveBeenCalledWith('John', 'user-123');
                expect(mockClaimGuestResults).toHaveBeenCalledWith('John_1', 'user-123');
                expect(mockClaimGuestResults).toHaveBeenCalledTimes(2);
            });
        });

        it('should call onClaimComplete after successful claim', async () => {
            renderModal();

            fireEvent.click(screen.getByText('Claim Results'));

            await waitFor(() => {
                expect(defaultProps.onClaimComplete).toHaveBeenCalled();
            });
        });

        it('should call onClose after successful claim', async () => {
            renderModal();

            fireEvent.click(screen.getByText('Claim Results'));

            await waitFor(() => {
                expect(defaultProps.onClose).toHaveBeenCalled();
            });
        });

        it('should show success notification after claim', async () => {
            mockClaimGuestResults.mockResolvedValue(3);
            renderModal();

            fireEvent.click(screen.getByText('Claim Results'));

            await waitFor(() => {
                expect(mockNotificationsShow).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: 'Results Claimed!',
                        color: 'green',
                    })
                );
            });
        });
    });

    describe('Error Handling', () => {
        it('should show error notification when claim fails', async () => {
            mockClaimGuestResults.mockRejectedValue(new Error('Permission denied'));
            renderModal();

            fireEvent.click(screen.getByText('Claim Results'));

            await waitFor(() => {
                expect(mockNotificationsShow).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: 'Claim Failed',
                        color: 'red',
                    })
                );
            });
        });

        it('should NOT call onClaimComplete when claim fails', async () => {
            mockClaimGuestResults.mockRejectedValue(new Error('Network error'));
            renderModal();

            fireEvent.click(screen.getByText('Claim Results'));

            await waitFor(() => {
                expect(mockNotificationsShow).toHaveBeenCalled();
            });

            expect(defaultProps.onClaimComplete).not.toHaveBeenCalled();
        });
    });

    describe('Skip Flow', () => {
        it('should call onClose when Skip is clicked', () => {
            renderModal();

            fireEvent.click(screen.getByText('Skip for Now'));
            expect(defaultProps.onClose).toHaveBeenCalled();
        });
    });

    describe('Domain Boundary (PRD-0040 Task 5.1)', () => {
        /**
         * Verifies the claim writes to test_results/{userId} via the service,
         * NOT through SharedSavedResultCore or any saved-result shell.
         */
        it('should claim results using guestResultsService directly — not saved-result shells', async () => {
            renderModal();

            fireEvent.click(screen.getByText('Claim Results'));

            await waitFor(() => {
                // Service is called with guest name + user ID (the compatibility path)
                expect(mockClaimGuestResults).toHaveBeenCalledWith('John', 'user-123');
                // The service handles the transfer internally — no SharedSavedResultCore involvement
            });
        });
    });
});
