import React from 'react';
import type { HomeworkStatus } from '../../types/homework.types';
import './HomeworkStatusBadge.css';

interface HomeworkStatusBadgeProps {
    status: HomeworkStatus;
    className?: string;
}

const STATUS_CONFIG: Record<HomeworkStatus, { label: string; icon: string; className: string }> = {
    draft: {
        label: 'Draft',
        icon: '📝',
        className: 'status-draft',
    },
    scheduled: {
        label: 'Scheduled',
        icon: '⏰',
        className: 'status-scheduled',
    },
    active: {
        label: 'Active',
        icon: '✅',
        className: 'status-active',
    },
    past_due: {
        label: 'Past Due',
        icon: '⚠️',
        className: 'status-past-due',
    },
    closed: {
        label: 'Closed',
        icon: '🔒',
        className: 'status-closed',
    },
};

export function HomeworkStatusBadge({ status, className = '' }: HomeworkStatusBadgeProps) {
    const config = STATUS_CONFIG[status];

    return (
        <span className={`homework-status-badge ${config.className} ${className}`}>
            <span className="status-icon">{config.icon}</span>
            <span className="status-label">{config.label}</span>
        </span>
    );
}
