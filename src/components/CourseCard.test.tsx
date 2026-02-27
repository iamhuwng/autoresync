
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CourseCard } from './CourseCard';
import type { Course } from '../types/course.types';
import { vi, describe, it, expect } from 'vitest';

// Mock Mantine Components
vi.mock('@mantine/core', () => {
    // Menu mock with static subcomponents
    const Menu = ({ children }: any) => <div data-testid="menu">{children}</div>;
    (Menu as any).Target = ({ children }: any) => <div data-testid="menu-target">{children}</div>;
    (Menu as any).Dropdown = ({ children }: any) => <div data-testid="menu-dropdown">{children}</div>;
    (Menu as any).Item = ({ children, onClick }: any) => <div onClick={onClick} data-testid="menu-item">{children}</div>;
    (Menu as any).Divider = () => <hr />;

    return {
        Badge: ({ children }: any) => <span data-testid="badge">{children}</span>,
        Group: ({ children }: any) => <div data-testid="group">{children}</div>,
        Text: ({ children }: any) => <div data-testid="text">{children}</div>,
        ActionIcon: ({ children }: any) => <button>{children}</button>,
        Menu: Menu,
    };
});

// Mock Modern Components
vi.mock('./modern', () => ({
    Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
    CardBody: ({ children }: any) => <div data-testid="card-body">{children}</div>,
    CardFooter: ({ children }: any) => <div data-testid="card-footer">{children}</div>,
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>
}));

describe('CourseCard', () => {
    const mockCourse: Course = {
        id: 'c1',
        name: 'Test Course',
        code: 'TEST-101',
        type: 'IELTS',
        ownerId: 'teacher-1',
        visibility: 'private',
        duration: { value: 3, unit: 'months' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archivedAt: null,
        hardDeleteAt: null
    };

    const onEdit = vi.fn();
    const onArchive = vi.fn();
    const onView = vi.fn();

    it('renders course information', () => {
        render(<CourseCard course={mockCourse} onEdit={onEdit} onArchive={onArchive} onView={onView} />);

        expect(screen.getByText('Test Course')).toBeDefined();
        expect(screen.getByText('IELTS')).toBeDefined();
        expect(screen.getByText('Code: TEST-101')).toBeDefined();
    });

    it('calls onView when view button is clicked', () => {
        render(<CourseCard course={mockCourse} onEdit={onEdit} onArchive={onArchive} onView={onView} />);

        const viewButton = screen.getByText('View');
        fireEvent.click(viewButton);
        expect(onView).toHaveBeenCalledWith(mockCourse);
    });

    it('renders menu items and handles clicks', () => {
        render(<CourseCard course={mockCourse} onEdit={onEdit} onArchive={onArchive} onView={onView} />);

        const editItem = screen.getByText('Edit Course');
        fireEvent.click(editItem);
        expect(onEdit).toHaveBeenCalledWith(mockCourse);

        const archiveItem = screen.getByText('Archive');
        fireEvent.click(archiveItem);
        expect(onArchive).toHaveBeenCalledWith(mockCourse);
    });
});
