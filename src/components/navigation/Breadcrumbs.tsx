import React from 'react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
    /** Display label for the breadcrumb */
    label: string;
    /** Route path to navigate to (undefined for current page) */
    path?: string;
    /** Whether this is the current/active page */
    isActive?: boolean;
}

export interface BreadcrumbsProps {
    /** Array of breadcrumb items to display */
    items: BreadcrumbItem[];
    /** Separator character (default: '>') */
    separator?: string;
    /** Whether to use condensed mobile format (shows only last 2 levels) */
    condensed?: boolean;
    /** Custom styles */
    style?: React.CSSProperties;
}

/**
 * Breadcrumbs Component
 * 
 * Displays page hierarchy trail (e.g., Materials > Classes > Math 101)
 * - Clickable links for parent pages
 * - Current page is not clickable
 * - Condensed mode for mobile (shows ... > Parent > Current)
 * 
 * Color tokens:
 * - Breadcrumb link: #6366f1 (indigo)
 * - Breadcrumb current: #64748b (slate)
 */
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
    items,
    separator = '>',
    condensed = false,
    style,
}) => {
    // If no items or only one item (root), don't show breadcrumbs
    if (!items || items.length <= 1) {
        return null;
    }

    // Condensed mode: show only last 2 levels with ellipsis
    const displayItems = condensed && items.length > 2
        ? [
            { label: '...', path: undefined, isActive: false },
            ...items.slice(-2)
        ]
        : items;

    return (
        <nav
            aria-label="Breadcrumb"
            style={{
                padding: '0.75rem 1.5rem',
                background: 'rgba(255, 255, 255, 0.5)',
                borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
                ...style,
            }}
        >
            <ol
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    fontSize: '0.875rem',
                    fontWeight: '500',
                }}
            >
                {displayItems.map((item, index) => {
                    const isLast = index === displayItems.length - 1;
                    const isEllipsis = item.label === '...';

                    return (
                        <li
                            key={`${item.label}-${index}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                            }}
                        >
                            {/* Breadcrumb Item */}
                            {isEllipsis ? (
                                <span
                                    style={{
                                        color: '#94a3b8',
                                        cursor: 'default',
                                    }}
                                >
                                    {item.label}
                                </span>
                            ) : item.path && !isLast ? (
                                <Link
                                    to={item.path}
                                    style={{
                                        color: '#6366f1',
                                        textDecoration: 'none',
                                        transition: 'color 0.2s ease',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = '#4f46e5';
                                        e.currentTarget.style.textDecoration = 'underline';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = '#6366f1';
                                        e.currentTarget.style.textDecoration = 'none';
                                    }}
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <span
                                    style={{
                                        color: '#64748b',
                                        fontWeight: '600',
                                    }}
                                    aria-current={isLast ? 'page' : undefined}
                                >
                                    {item.label}
                                </span>
                            )}

                            {/* Separator */}
                            {!isLast && (
                                <span
                                    style={{
                                        color: '#cbd5e1',
                                        userSelect: 'none',
                                    }}
                                    aria-hidden="true"
                                >
                                    {separator}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

export default Breadcrumbs;
