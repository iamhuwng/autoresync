import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MantineProvider } from '@mantine/core';
import { MaterialSelectorModal } from './MaterialSelectorModal';

// Mock matchMedia for Mantine
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

// Mock Modal to avoid portal/animation issues
vi.mock('@mantine/core', async (importOriginal) => {
    const actual: any = await importOriginal();

    const TabsMock = ({ children, value, onChange }: any) => (
        <div data-testid="tabs">
            {React.Children.map(children, child => {
                if (!React.isValidElement(child)) return child;
                const type = (child.type as any).displayName || child.type;

                if (child.type === TabsMock.List) {
                    return React.cloneElement(child as any, { onTabChange: onChange });
                }
                if (child.type === TabsMock.Panel) {
                    return (child.props as any).value === value ? child : null;
                }
                return child;
            })}
        </div>
    );

    TabsMock.List = ({ children, onTabChange }: any) => (
        <div>
            {React.Children.map(children, child => {
                if (!React.isValidElement(child)) return child;
                if (child.type === TabsMock.Tab) {
                    return React.cloneElement(child as any, {
                        onClick: () => onTabChange((child.props as any).value)
                    });
                }
                return child;
            })}
        </div>
    );

    TabsMock.Tab = ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>;
    TabsMock.Panel = ({ children }: any) => <div>{children}</div>;
    (TabsMock as any).displayName = 'Tabs';
    (TabsMock.List as any).displayName = 'Tabs.List';
    (TabsMock.Tab as any).displayName = 'Tabs.Tab';
    (TabsMock.Panel as any).displayName = 'Tabs.Panel';

    return {
        ...actual,
        Modal: ({ opened, children, title, onClose }: any) =>
            opened ? (
                <div role="dialog" aria-label={title}>
                    <h2>{title}</h2>
                    <button onClick={onClose} aria-label="Close modal">Close</button>
                    {children}
                </div>
            ) : null,
        Tabs: TabsMock,
    };
});


const mockGetAllTests = vi.fn();

vi.mock('../../services/firebaseQueryOptimizer', () => ({
    default: {
        getAllTests: () => mockGetAllTests(),
    }
}));

const mockUserObj = { uid: 'u1' };
vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({
        user: mockUserObj
    })
}));

describe('MaterialSelectorModal', () => {
    const mockTests = [
        { id: 't1', title: 'Test 1', ownerId: 'u1', type: 'IELTS', skill: 'Reading' },
        { id: 't2', title: 'Test 2', ownerId: 'u2', isPublic: true }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAllTests.mockResolvedValue(mockTests);
    });

    const renderWithMantine = (ui: React.ReactNode) => {
        return render(
            <MantineProvider>
                {ui}
            </MantineProvider>
        );
    };

    it('renders and lists own tests', async () => {
        renderWithMantine(
            <MaterialSelectorModal opened={true} onClose={() => { }} onSelect={async () => { }} />
        );

        // Should find Test 1
        const element = await screen.findByText('Test 1');
        expect(element).toBeInTheDocument();

        // Should NOT find Test 2 (not own)
        expect(screen.queryByText('Test 2')).not.toBeInTheDocument();
    });

    it('calls onSelect with correct arguments when Link is clicked', async () => {
        const onSelect = vi.fn().mockResolvedValue(true);
        renderWithMantine(
            <MaterialSelectorModal opened={true} onClose={() => { }} onSelect={onSelect} />
        );

        await screen.findByText('Test 1');

        const linkButton = screen.getByRole('button', { name: 'Link' });
        fireEvent.click(linkButton);

        await waitFor(() => {
            expect(onSelect).toHaveBeenCalledWith('t1', 'link');
        });
    });

    it('calls onSelect with correct arguments when Copy is clicked', async () => {
        const onSelect = vi.fn().mockResolvedValue(true);
        renderWithMantine(
            <MaterialSelectorModal opened={true} onClose={() => { }} onSelect={onSelect} />
        );

        await screen.findByText('Test 1');

        const copyButton = screen.getByRole('button', { name: 'Copy' });
        fireEvent.click(copyButton);

        await waitFor(() => {
            expect(onSelect).toHaveBeenCalledWith('t1', 'copy');
        });
    });

    it('lists public materials in Public Library tab and excludes Copy button', async () => {
        renderWithMantine(
            <MaterialSelectorModal opened={true} onClose={() => { }} onSelect={async () => { }} />
        );

        // Switch to Public Library tab
        const publicTab = screen.getByText('Public Library');
        fireEvent.click(publicTab);

        // Should find Test 2 (Public)
        const element = await screen.findByText('Test 2');
        expect(element).toBeInTheDocument();

        // Should find Link button for Test 2
        expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();

        // Should NOT find Copy button in Public Library tab
        expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();

        // Should NOT find Test 1 in Public Library tab
        expect(screen.queryByText('Test 1')).not.toBeInTheDocument();
    });

    it('does not load or show retired Quiz materials', async () => {
        renderWithMantine(
            <MaterialSelectorModal opened={true} onClose={() => { }} onSelect={async () => { }} />
        );

        await screen.findByText('Test 1');

        expect(screen.queryByText('My Quizzes')).not.toBeInTheDocument();
        expect(screen.queryByText('Retired Quiz')).not.toBeInTheDocument();
    });
});
