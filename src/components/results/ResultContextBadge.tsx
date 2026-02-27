/**
 * ResultContextBadge Component
 * 
 * Displays a visual badge indicating the context of a test result:
 * - 🏫 Live Session (class_session)
 * - 📋 Homework (homework)
 * - 📖 Practice (self_study)
 * - 📚 Course (course_material)
 * 
 * PRD-0016: Solo Study & Homework System
 */

import React from 'react';
import type { ResultContextType } from '../../types/solo.types';
import './ResultContextBadge.css';

// =============================================================================
// TYPES
// =============================================================================

interface ResultContextBadgeProps {
    /** The context type to display */
    contextType: ResultContextType;
    /** Size variant */
    size?: 'sm' | 'md' | 'lg';
    /** Show text label */
    showLabel?: boolean;
    /** Additional CSS class */
    className?: string;
}

// =============================================================================
// CONTEXT CONFIG
// =============================================================================

interface ContextConfig {
    icon: string;
    label: string;
    shortLabel: string;
    colorClass: string;
}

const CONTEXT_CONFIG: Record<ResultContextType, ContextConfig> = {
    class_session: {
        icon: '🏫',
        label: 'Live Session',
        shortLabel: 'Live',
        colorClass: 'context-badge--live'
    },
    homework: {
        icon: '📋',
        label: 'Homework',
        shortLabel: 'HW',
        colorClass: 'context-badge--homework'
    },
    self_study: {
        icon: '📖',
        label: 'Practice',
        shortLabel: 'Practice',
        colorClass: 'context-badge--practice'
    },
    course_material: {
        icon: '📚',
        label: 'Course Material',
        shortLabel: 'Course',
        colorClass: 'context-badge--course'
    }
};

// =============================================================================
// COMPONENT
// =============================================================================

export const ResultContextBadge: React.FC<ResultContextBadgeProps> = ({
    contextType,
    size = 'md',
    showLabel = true,
    className = ''
}) => {
    const config = CONTEXT_CONFIG[contextType] || CONTEXT_CONFIG.class_session;

    const badgeClasses = [
        'context-badge',
        `context-badge--${size}`,
        config.colorClass,
        className
    ].filter(Boolean).join(' ');

    return (
        <span className={badgeClasses} title={config.label}>
            <span className="context-badge__icon" aria-hidden="true">
                {config.icon}
            </span>
            {showLabel && (
                <span className="context-badge__label">
                    {size === 'sm' ? config.shortLabel : config.label}
                </span>
            )}
        </span>
    );
};

// =============================================================================
// HELPER COMPONENT: Context Filter Tabs
// =============================================================================

interface ContextFilterTabsProps {
    /** Currently selected context (null = all) */
    selected: ResultContextType | null;
    /** Callback when context is selected */
    onSelect: (context: ResultContextType | null) => void;
    /** Available contexts to show */
    contexts?: ResultContextType[];
    /** Counts per context (for badges) */
    counts?: Partial<Record<ResultContextType | 'all', number>>;
}

export const ContextFilterTabs: React.FC<ContextFilterTabsProps> = ({
    selected,
    onSelect,
    contexts = ['class_session', 'homework', 'self_study', 'course_material'],
    counts
}) => {
    return (
        <div className="context-filter-tabs" role="tablist">
            {/* All tab */}
            <button
                className={`context-filter-tab ${selected === null ? 'context-filter-tab--active' : ''}`}
                onClick={() => onSelect(null)}
                role="tab"
                aria-selected={selected === null}
            >
                <span className="context-filter-tab__icon">📊</span>
                <span className="context-filter-tab__label">All</span>
                {counts?.all !== undefined && (
                    <span className="context-filter-tab__count">{counts.all}</span>
                )}
            </button>

            {/* Context tabs */}
            {contexts.map(ctx => {
                const config = CONTEXT_CONFIG[ctx];
                return (
                    <button
                        key={ctx}
                        className={`context-filter-tab ${selected === ctx ? 'context-filter-tab--active' : ''}`}
                        onClick={() => onSelect(ctx)}
                        role="tab"
                        aria-selected={selected === ctx}
                    >
                        <span className="context-filter-tab__icon">{config.icon}</span>
                        <span className="context-filter-tab__label">{config.shortLabel}</span>
                        {counts?.[ctx] !== undefined && (
                            <span className="context-filter-tab__count">{counts[ctx]}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

// =============================================================================
// EXPORTS
// =============================================================================

export default ResultContextBadge;

// Export context config for use elsewhere
export { CONTEXT_CONFIG };
export type { ResultContextBadgeProps, ContextFilterTabsProps };
