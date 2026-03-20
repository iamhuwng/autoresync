/**
 * Tests for AssignmentHistoryTab Component
 * 
 * Tests cover:
 * - Rendering history entries with correct data
 * - Empty state display
 * - Loading state display
 * - Error state display
 * - Proper formatting of dates and user names
 * - Display of courses enrolled
 * - Display of unassignment reasons
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MantineProvider } from '@mantine/core';
import { AssignmentHistoryTab } from './AssignmentHistoryTab';
import type { AssignmentHistory } from '../../types/assignment.types';

// Wrapper component for Mantine
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <MantineProvider>{children}</MantineProvider>
);

describe('AssignmentHistoryTab', () => {
    const mockGetUserName = vi.fn((userId: string) => {
        const names: Record<string, string> = {
            'student-1': 'John Doe',
            'teacher-1': 'Ms. Smith',
            'admin-1': 'Admin User'
        };
        return names[userId] || userId;
    });

    const mockGetCourseName = vi.fn((courseId: string) => {
        const courses: Record<string, string> = {
            'course-1': 'IELTS Academic',
            'course-2': 'TOEFL Preparation'
        };
        return courses[courseId] || courseId;
    });

    const mockHistoryData: AssignmentHistory[] = [
        {
            id: 'history-1',
            studentId: 'student-1',
            teacherId: 'teacher-1',
            action: 'assigned',
            performedBy: 'admin-1',
            timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
            coursesEnrolled: ['course-1', 'course-2']
        },
        {
            id: 'history-2',
            studentId: 'student-1',
            teacherId: 'teacher-1',
            action: 'unassigned',
            performedBy: 'admin-1',
            timestamp: Date.now() - 1000 * 60 * 60 * 24 * 7, // 7 days ago
            reason: 'Student transferred to different class'
        }
    ];

    it('should render loading state', () => {
        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={[]}
                    loading={true}
                />
            </TestWrapper>
        );

        expect(screen.getByText(/loading assignment history/i)).toBeInTheDocument();
    });

    it('should render error state', () => {
        const errorMessage = 'Failed to load history';
        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={[]}
                    error={errorMessage}
                />
            </TestWrapper>
        );

        expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it('should render empty state when no history exists', () => {
        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={[]}
                />
            </TestWrapper>
        );

        expect(screen.getByText(/no assignment history available yet/i)).toBeInTheDocument();
        expect(screen.getByText(/assignment changes will appear here once they occur/i)).toBeInTheDocument();
    });

    it('should render assignment history for student', () => {
        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={mockHistoryData}
                    getUserName={mockGetUserName}
                    getCourseName={mockGetCourseName}
                />
            </TestWrapper>
        );

        // Check header
        expect(screen.getByText(/assignment history/i)).toBeInTheDocument();
        expect(screen.getByText(/2 entries/i)).toBeInTheDocument();

        // Check teacher name is displayed (for student view)
        expect(screen.getAllByText('Ms. Smith').length).toBeGreaterThan(0);

        // Check admin name
        expect(screen.getAllByText('Admin User').length).toBeGreaterThan(0);

        // Check courses are displayed
        expect(screen.getByText('IELTS Academic')).toBeInTheDocument();
        expect(screen.getByText('TOEFL Preparation')).toBeInTheDocument();

        // Check action badges
        expect(screen.getByText('Assigned')).toBeInTheDocument();
        expect(screen.getByText('Unassigned')).toBeInTheDocument();
    });

    it('should render assignment history for teacher', () => {
        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="teacher-1"
                    userType="teacher"
                    history={mockHistoryData}
                    getUserName={mockGetUserName}
                    getCourseName={mockGetCourseName}
                />
            </TestWrapper>
        );

        // Check student name is displayed (for teacher view)
        expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);

        // Check "Student" label appears
        expect(screen.getAllByText('Student').length).toBeGreaterThan(0);
    });

    it('should display unassignment reason when provided', () => {
        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={mockHistoryData}
                    getUserName={mockGetUserName}
                />
            </TestWrapper>
        );

        expect(screen.getByText('Student transferred to different class')).toBeInTheDocument();
    });

    it('should sort history by timestamp (most recent first)', () => {
        const unsortedHistory: AssignmentHistory[] = [
            {
                id: 'old',
                studentId: 'student-1',
                teacherId: 'teacher-1',
                action: 'assigned',
                performedBy: 'admin-1',
                timestamp: Date.now() - 1000 * 60 * 60 * 24 * 30 // 30 days ago
            },
            {
                id: 'new',
                studentId: 'student-1',
                teacherId: 'teacher-1',
                action: 'unassigned',
                performedBy: 'admin-1',
                timestamp: Date.now() - 1000 * 60 * 60 // 1 hour ago
            }
        ];

        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={unsortedHistory}
                    getUserName={mockGetUserName}
                />
            </TestWrapper>
        );

        // The component should display entries in chronological order
        // Most recent (unassigned) should appear before older (assigned)
        const badges = screen.getAllByText(/^(Assigned|Unassigned)$/);
        expect(badges[0]).toHaveTextContent('Unassigned');
        expect(badges[1]).toHaveTextContent('Assigned');
    });

    it('should handle missing getUserName function with fallback', () => {
        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={mockHistoryData}
                // Not providing getUserName - should use default (returns ID)
                />
            </TestWrapper>
        );

        // Should display IDs when no name resolver provided
        expect(screen.getAllByText('teacher-1').length).toBeGreaterThan(0);
        expect(screen.getAllByText('admin-1').length).toBeGreaterThan(0);
    });

    it('should handle missing getCourseName function with fallback', () => {
        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={mockHistoryData}
                    getUserName={mockGetUserName}
                // Not providing getCourseName - should use default (returns ID)
                />
            </TestWrapper>
        );

        // Should display course IDs when no course name resolver provided
        expect(screen.getByText('course-1')).toBeInTheDocument();
        expect(screen.getByText('course-2')).toBeInTheDocument();
    });

    it('should not display courses section when no courses enrolled', () => {
        const historyWithoutCourses: AssignmentHistory[] = [
            {
                id: 'history-3',
                studentId: 'student-1',
                teacherId: 'teacher-1',
                action: 'assigned',
                performedBy: 'admin-1',
                timestamp: Date.now()
            }
        ];

        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={historyWithoutCourses}
                    getUserName={mockGetUserName}
                />
            </TestWrapper>
        );

        // "Courses:" label should not appear
        expect(screen.queryByText('Courses:')).not.toBeInTheDocument();
    });

    it('should display relative time correctly', () => {
        const recentHistory: AssignmentHistory[] = [
            {
                id: 'recent',
                studentId: 'student-1',
                teacherId: 'teacher-1',
                action: 'assigned',
                performedBy: 'admin-1',
                timestamp: Date.now() - 1000 * 60 * 60 * 2 // 2 hours ago
            }
        ];

        render(
            <TestWrapper>
                <AssignmentHistoryTab
                    userId="student-1"
                    userType="student"
                    history={recentHistory}
                    getUserName={mockGetUserName}
                />
            </TestWrapper>
        );

        // Should show relative time like "2 hours ago"
        expect(screen.getByText(/2 hours ago/i)).toBeInTheDocument();
    });
});
