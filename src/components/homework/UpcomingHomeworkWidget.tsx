/**
 * Upcoming Homework Widget
 * PRD-0016: Solo Study & Homework System
 * 
 * A compact widget for displaying upcoming homework on the student dashboard.
 * Shows at most 3 items with quick actions.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    IconClipboard,
    IconClock,
    IconAlertTriangle,
    IconChevronRight,
    IconCheck
} from '@tabler/icons-react';
import { buildRoute } from '../../constants/routes';
import { useNavigation } from '../../hooks/useNavigation';
import { getStudentHomeworkList } from '../../services/homeworkSubmissionService';
import { Button, VanillaLoader } from '../modern';
import type { HomeworkAssignment, HomeworkSubmission } from '../../types/homework.types';

// ============================================================================
// TYPES
// ============================================================================

interface HomeworkItem {
    homework: HomeworkAssignment;
    submission: HomeworkSubmission | null;
    status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
    daysRemaining: number;
}

interface UpcomingHomeworkWidgetProps {
    studentId: string;
    maxItems?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format relative time remaining
 */
const formatTimeRemaining = (dueDate: number): {
    text: string;
    urgent: boolean;
    background: string;
    border: string;
    color: string;
    overdue: boolean;
} => {
    const now = Date.now();
    const diff = dueDate - now;

    if (diff <= 0) {
        return {
            text: 'Overdue',
            urgent: true,
            background: '#fee2e2',
            border: '#fecaca',
            color: '#dc2626',
            overdue: true,
        };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 24) {
        return {
            text: `${hours}h left`,
            urgent: true,
            background: '#fef3c7',
            border: '#fde68a',
            color: '#d97706',
            overdue: false,
        };
    }

    if (days < 3) {
        return {
            text: `${days}d left`,
            urgent: true,
            background: '#fef3c7',
            border: '#fde68a',
            color: '#d97706',
            overdue: false,
        };
    }

    return {
        text: `${days}d left`,
        urgent: false,
        background: '#dbeafe',
        border: '#bfdbfe',
        color: '#2563eb',
        overdue: false,
    };
};

/**
 * Get skill color
 */
const getSkillStyles = (skill: string): { background: string; color: string } => {
    switch (skill.toLowerCase()) {
        case 'reading':
            return { background: '#dbeafe', color: '#2563eb' };
        case 'listening':
            return { background: '#e0e7ff', color: '#4338ca' };
        case 'writing':
            return { background: '#fef3c7', color: '#d97706' };
        case 'speaking':
            return { background: '#d1fae5', color: '#059669' };
        default:
            return { background: '#e5e7eb', color: '#6b7280' };
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const UpcomingHomeworkWidget: React.FC<UpcomingHomeworkWidgetProps> = ({
    studentId,
    maxItems = 3
}) => {
    const navigate = useNavigate();
    const { navigateTo } = useNavigation('student');
    const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load homework data
     */
    useEffect(() => {
        const loadHomework = async () => {
            if (!studentId) {
                setHomeworkItems([]);
                setError(null);
                setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                const items = await getStudentHomeworkList(studentId);

                // Map to our widget format
                const mappedItems: HomeworkItem[] = items.map(item => {
                    const daysRemaining = Math.ceil(
                        (item.homework.scheduling.dueDate - Date.now()) / (1000 * 60 * 60 * 24)
                    );

                    let status: 'not_started' | 'in_progress' | 'completed' | 'overdue' = 'not_started';
                    if (item.submission?.status === 'submitted' || item.submission?.status === 'graded') {
                        status = 'completed';
                    } else if (item.submission?.status === 'in_progress') {
                        status = 'in_progress';
                    } else if (item.isOverdue) {
                        status = 'overdue';
                    }

                    return {
                        homework: item.homework,
                        submission: item.submission,
                        status,
                        daysRemaining
                    };
                });

                // Filter to show only active/not completed, sorted by due date
                const activeItems = mappedItems
                    .filter(item => item.status !== 'completed')
                    .sort((a, b) => a.homework.scheduling.dueDate - b.homework.scheduling.dueDate)
                    .slice(0, maxItems);

                setHomeworkItems(activeItems);
            } catch (err) {
                console.error('Error loading homework:', err);
                setError('Failed to load homework');
            } finally {
                setIsLoading(false);
            }
        };

        loadHomework();
    }, [studentId, maxItems]);

    /**
     * Handle homework click
     */
    const handleHomeworkClick = (item: HomeworkItem) => {
        if (item.status === 'in_progress' && item.homework.materialId) {
            navigate(buildRoute('STUDENT_PRACTICE', { materialId: item.homework.materialId }), {
                state: {
                    isHomework: true,
                    homeworkId: item.homework.id,
                    submissionId: item.submission?.id,
                },
            });
        } else {
            navigateTo('STUDENT_HOMEWORK', {}, { reason: 'student_open_homework_from_widget' });
        }
    };

    /**
     * Handle view all click
     */
    const handleViewAll = () => {
        navigateTo('STUDENT_HOMEWORK', {}, { reason: 'student_view_all_homework_from_widget' });
    };

    // Loading state
    if (isLoading) {
        return (
            <div
                style={{
                    background: '#f9fafb',
                    borderRadius: 16,
                    padding: 16,
                    border: '1px solid #e5e7eb',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        minHeight: 96,
                        color: '#6b7280',
                        fontSize: '0.938rem',
                    }}
                >
                    <VanillaLoader size="sm" color="#4f46e5" />
                    <span>Loading homework...</span>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div
                style={{
                    background: '#f9fafb',
                    borderRadius: 16,
                    padding: 16,
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.938rem',
                    textAlign: 'center',
                }}
            >
                {error}
            </div>
        );
    }

    // Empty state
    if (homeworkItems.length === 0) {
        return (
            <div
                style={{
                    background: '#f9fafb',
                    borderRadius: 16,
                    padding: 16,
                    border: '1px solid #e5e7eb',
                }}
            >
                <div
                    style={{
                        minHeight: 160,
                        display: 'grid',
                        justifyItems: 'center',
                        alignContent: 'center',
                        gap: 12,
                        textAlign: 'center',
                    }}
                >
                    <div
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#d1fae5',
                            color: '#059669',
                        }}
                    >
                        <IconCheck size={24} />
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>All caught up!</div>
                    <div style={{ fontSize: '0.938rem', color: '#6b7280' }}>No pending homework</div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                background: '#f9fafb',
                borderRadius: 16,
                padding: 16,
                border: '1px solid #e5e7eb',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    marginBottom: 16,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#fef3c7',
                            color: '#d97706',
                            flexShrink: 0,
                        }}
                    >
                        <IconClipboard size={18} />
                    </div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                        Upcoming Homework
                    </div>
                </div>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: '999px',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: '#fef3c7',
                        color: '#d97706',
                    }}
                >
                    {homeworkItems.length} pending
                </span>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
                {homeworkItems.map((item) => {
                    const timeInfo = formatTimeRemaining(item.homework.scheduling.dueDate);
                    const skillStyles = getSkillStyles(item.homework.materialSkill);

                    return (
                        <button
                            key={item.homework.id}
                            type="button"
                            style={{
                                cursor: 'pointer',
                                transition: 'background 0.15s ease-out, border-color 0.15s ease-out',
                                border: `1px solid ${timeInfo.border}`,
                                borderLeftWidth: 4,
                                borderRadius: 14,
                                background: '#ffffff',
                                width: '100%',
                                textAlign: 'left',
                                padding: 12,
                            }}
                            onClick={() => handleHomeworkClick(item)}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    alignItems: 'center',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: '0.95rem',
                                            fontWeight: 700,
                                            color: '#111827',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {item.homework.title || item.homework.materialTitle}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                        <span
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                borderRadius: '999px',
                                                padding: '0.2rem 0.55rem',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                textTransform: 'capitalize',
                                                background: skillStyles.background,
                                                color: skillStyles.color,
                                            }}
                                        >
                                            {item.homework.materialSkill}
                                        </span>
                                        {item.status === 'in_progress' && (
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    borderRadius: '999px',
                                                    padding: '0.2rem 0.55rem',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    background: '#dbeafe',
                                                    color: '#2563eb',
                                                }}
                                            >
                                                In Progress
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    <span
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            borderRadius: '999px',
                                            padding: '0.35rem 0.7rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            background: timeInfo.background,
                                            border: `1px solid ${timeInfo.border}`,
                                            color: timeInfo.color,
                                        }}
                                    >
                                        {timeInfo.overdue ? <IconAlertTriangle size={12} /> : <IconClock size={12} />}
                                        {timeInfo.text}
                                    </span>
                                    <IconChevronRight size={16} color="#9ca3af" />
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            <Button
                variant="outline"
                fullWidth
                style={{
                    marginTop: 16,
                    background: '#ffffff',
                    border: '1px solid #d1d5db',
                    color: '#374151',
                    borderRadius: '999px',
                }}
                onClick={handleViewAll}
                rightSection={<IconChevronRight size={16} />}
            >
                View All Homework
            </Button>
        </div>
    );
};

export default UpcomingHomeworkWidget;
