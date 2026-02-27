import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { ModuleEditor } from './ModuleEditor';
import { createModule, updateModule } from '../../services/courseManager';
import { notifications } from '@mantine/notifications';

// Mock courseManager
vi.mock('../../services/courseManager', () => ({
    createModule: vi.fn(),
    updateModule: vi.fn(),
}));

// Mock notifications
vi.mock('@mantine/notifications', () => ({
    notifications: {
        show: vi.fn(),
    },
}));

// Mock Mantine Core Modal
vi.mock('@mantine/core', async (importOriginal) => {
    const actual: any = await importOriginal();
    return {
        ...actual,
        Modal: ({ opened, children, title }: any) => opened ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null,
    };
});

describe('ModuleEditor', () => {
    const defaultProps = {
        opened: true,
        onClose: vi.fn(),
        courseId: 'course-1',
        onSuccess: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderWithMantine = (component: React.ReactNode) => {
        return render(
            <MantineProvider>
                {component}
            </MantineProvider>
        );
    };

    it('renders create form correctly', () => {
        renderWithMantine(<ModuleEditor {...defaultProps} />);

        expect(screen.getByText('Create Module')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('e.g. Introduction')).toBeInTheDocument();
        expect(screen.getByText('Access Type')).toBeInTheDocument();
    });

    it('validates required fields', async () => {
        renderWithMantine(<ModuleEditor {...defaultProps} />);

        const submitBtn = screen.getByText('Create');
        fireEvent.click(submitBtn);

        // Wait a bit for validation to process
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify that createModule was not called due to validation failure
        expect(createModule).not.toHaveBeenCalled();
    });

    it('submits create form successfully', async () => {
        (createModule as any).mockResolvedValue({ success: true, moduleId: 'mod-1' });

        renderWithMantine(<ModuleEditor {...defaultProps} />);

        fireEvent.change(screen.getByPlaceholderText('e.g. Introduction'), { target: { value: 'New Module' } });
        fireEvent.click(screen.getByText('Create'));

        await waitFor(() => {
            expect(createModule).toHaveBeenCalledWith('course-1', {
                name: 'New Module',
                accessType: 'open'
            });
            expect(defaultProps.onSuccess).toHaveBeenCalled();
            expect(notifications.show).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' }));
        });
    });

    it('renders edit form with initial values', () => {
        const moduleToEdit = {
            id: 'mod-1',
            courseId: 'course-1',
            name: 'Existing Module',
            order: 0,
            accessType: 'sequential' as const
        };

        renderWithMantine(<ModuleEditor {...defaultProps} module={moduleToEdit} />);

        expect(screen.getByText('Edit Module')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Existing Module')).toBeInTheDocument();
        // Check select value - accessible via combobox or hidden input usually
        // Mantine select is tricky to test by value directly
    });

    it('submits update form successfully', async () => {
        const moduleToEdit = {
            id: 'mod-1',
            courseId: 'course-1',
            name: 'Existing Module',
            order: 0,
            accessType: 'open' as const
        };

        (updateModule as any).mockResolvedValue({ success: true });

        renderWithMantine(<ModuleEditor {...defaultProps} module={moduleToEdit} />);

        fireEvent.change(screen.getByPlaceholderText('e.g. Introduction'), { target: { value: 'Updated Name' } });
        fireEvent.click(screen.getByText('Update'));

        await waitFor(() => {
            expect(updateModule).toHaveBeenCalledWith('mod-1', expect.objectContaining({
                name: 'Updated Name'
            }));
            expect(defaultProps.onSuccess).toHaveBeenCalled();
        });
    });
});
