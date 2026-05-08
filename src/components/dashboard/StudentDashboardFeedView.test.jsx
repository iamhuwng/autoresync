import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import StudentDashboardFeedView from './StudentDashboardFeedView';

vi.mock('./RecentGradesChart', () => ({
    __esModule: true,
    default: () => <div data-testid="recent-grades-chart" />,
}));

describe('StudentDashboardFeedView', () => {
    it('applies the mobile header, feed spacing, and touch-target contract', () => {
        render(
            <StudentDashboardFeedView
                isMobile
                title="Dashboard"
                subtitle="Your workspace is ready."
                unreadCount={3}
                feedRows={[
                    {
                        id: 'homework-row-1',
                        kind: 'homework',
                        title: 'Reading Practice',
                        body: 'Review the reading passage and answer the follow-up questions.',
                        timeLabel: '2h',
                        tags: ['IELTS Class', 'Due 12 Apr'],
                        onPress: vi.fn(),
                    },
                    {
                        id: 'class-row-1',
                        kind: 'classes',
                        title: 'Library Reminder',
                        body: 'Continue in the practice library.',
                        timeLabel: '1h',
                        actionLabel: 'Open Library',
                        onPress: vi.fn(),
                        onAction: vi.fn(),
                    },
                ]}
                filterTabs={[
                    { key: 'all', label: 'All Activity' },
                    { key: 'homework', label: 'Homework' },
                ]}
                activeFilter="all"
                onFilterChange={vi.fn()}
                onToggleUnreadOnly={vi.fn()}
                onOpenAcademicHistory={vi.fn()}
                hasMore
                onLoadMore={vi.fn()}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Dashboard' })).toHaveStyle({ fontSize: '1.5rem' });
        expect(screen.getByText('Your workspace is ready.')).toHaveStyle({ display: 'none' });
        expect(screen.getByTitle('Toggle unread feed items')).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
        expect(screen.getByTitle('Open academic history')).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
        expect(screen.getByRole('navigation', { name: 'Dashboard feed filters' })).toHaveClass('student-mobile-scrollbar-hidden');
        expect(screen.getByRole('button', { name: 'All Activity' })).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
        expect(screen.getByText('Review the reading passage and answer the follow-up questions.').parentElement).toHaveStyle({ padding: '12px 12px 16px' });
        expect(screen.getByRole('button', { name: 'Open Library' })).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
        expect(screen.getByRole('button', { name: 'Load More Activities' })).toHaveStyle({ minHeight: '44px', minWidth: '44px' });
    });
});
