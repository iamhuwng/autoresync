import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Breadcrumbs, BreadcrumbItem } from './Breadcrumbs';

describe('Breadcrumbs', () => {
    const renderComponent = (props: Partial<Parameters<typeof Breadcrumbs>[0]> = {}) => {
        return render(
            <MemoryRouter>
                <Breadcrumbs items={[]} {...props} />
            </MemoryRouter>
        );
    };

    describe('Rendering', () => {
        it('renders nothing when items array is empty', () => {
            const { container } = renderComponent({ items: [] });
            expect(container.querySelector('nav')).not.toBeInTheDocument();
        });

        it('renders nothing when only one item is provided (root)', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
            ];
            const { container } = renderComponent({ items });
            expect(container.querySelector('nav')).not.toBeInTheDocument();
        });

        it('renders breadcrumbs when multiple items are provided', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            renderComponent({ items });

            expect(screen.getByText('Materials')).toBeInTheDocument();
            expect(screen.getByText('Classes')).toBeInTheDocument();
        });

        it('renders all breadcrumb items in order', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
                { label: 'Math 101', path: '/teacher/classes/123' },
            ];
            const { container } = renderComponent({ items });

            const breadcrumbList = container.querySelector('ol');
            expect(breadcrumbList?.children.length).toBe(3);
        });
    });

    describe('Separators', () => {
        it('renders default separator between items', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            renderComponent({ items });

            expect(screen.getByText('>')).toBeInTheDocument();
        });

        it('renders custom separator when provided', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            renderComponent({ items, separator: '›' });

            expect(screen.getByText('›')).toBeInTheDocument();
        });

        it('does not render separator after last item', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            const { container } = renderComponent({ items });

            // Should have exactly 1 separator (between first and second item)
            const separators = screen.getAllByText('>');
            expect(separators.length).toBe(1);
        });
    });

    describe('Links and Active State', () => {
        it('renders clickable links for parent pages', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            const { container } = renderComponent({ items });

            const materialsLink = container.querySelector('a[href="/lobby"]');
            expect(materialsLink).toBeInTheDocument();
            expect(materialsLink?.textContent).toBe('Materials');
        });

        it('renders last item as non-clickable (current page)', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            renderComponent({ items });

            const classesText = screen.getByText('Classes');
            // Last item should be a span, not a link
            expect(classesText.tagName).toBe('SPAN');
        });

        it('applies aria-current to last item', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            renderComponent({ items });

            const classesText = screen.getByText('Classes');
            expect(classesText).toHaveAttribute('aria-current', 'page');
        });
    });

    describe('Condensed Mode (Mobile)', () => {
        it('shows all items when condensed is false', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
                { label: 'Math 101', path: '/teacher/classes/123' },
                { label: 'Assignment 1', path: '/teacher/classes/123/assignments/1' },
            ];
            renderComponent({ items, condensed: false });

            expect(screen.getByText('Materials')).toBeInTheDocument();
            expect(screen.getByText('Classes')).toBeInTheDocument();
            expect(screen.getByText('Math 101')).toBeInTheDocument();
            expect(screen.getByText('Assignment 1')).toBeInTheDocument();
        });

        it('shows only last 2 levels with ellipsis when condensed is true and more than 2 items', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
                { label: 'Math 101', path: '/teacher/classes/123' },
                { label: 'Assignment 1', path: '/teacher/classes/123/assignments/1' },
            ];
            renderComponent({ items, condensed: true });

            expect(screen.queryByText('Materials')).not.toBeInTheDocument();
            expect(screen.queryByText('Classes')).not.toBeInTheDocument();
            expect(screen.getByText('...')).toBeInTheDocument();
            expect(screen.getByText('Math 101')).toBeInTheDocument();
            expect(screen.getByText('Assignment 1')).toBeInTheDocument();
        });

        it('shows all items when condensed is true but only 2 items exist', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            renderComponent({ items, condensed: true });

            expect(screen.getByText('Materials')).toBeInTheDocument();
            expect(screen.getByText('Classes')).toBeInTheDocument();
            expect(screen.queryByText('...')).not.toBeInTheDocument();
        });
    });

    describe('Accessibility', () => {
        it('renders with proper aria-label', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            const { container } = renderComponent({ items });

            const nav = container.querySelector('nav');
            expect(nav).toHaveAttribute('aria-label', 'Breadcrumb');
        });

        it('uses semantic HTML with ol element', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            const { container } = renderComponent({ items });

            expect(container.querySelector('ol')).toBeInTheDocument();
        });

        it('marks separators with aria-hidden', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            const { container } = renderComponent({ items });

            const separator = screen.getByText('>');
            expect(separator).toHaveAttribute('aria-hidden', 'true');
        });
    });

    describe('Styling', () => {
        it('applies custom styles when provided', () => {
            const items: BreadcrumbItem[] = [
                { label: 'Materials', path: '/lobby' },
                { label: 'Classes', path: '/teacher/classes' },
            ];
            const customStyle = { backgroundColor: 'red' };
            const { container } = renderComponent({ items, style: customStyle });

            const nav = container.querySelector('nav') as HTMLElement | null;
            expect(nav?.style.backgroundColor).toBe('red');
        });
    });
});
