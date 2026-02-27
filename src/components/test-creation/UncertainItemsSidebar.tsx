/**
 * UncertainItemsSidebar Component
 * 
 * Sidebar displaying items that need teacher review.
 * Shows questions with low confidence, type mismatches, or validation issues.
 * 
 * Features:
 * - List of uncertain items sorted by severity
 * - Click to jump to item in review panel
 * - Quick resolve buttons
 * - Badge count in header
 * - Collapsible on mobile
 * 
 * Design follows existing patterns:
 * - Glass card styling
 * - Consistent typography
 * - Yellow/amber for warnings
 * 
 * @module UncertainItemsSidebar
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 6, Task 6.4
 */

import React, { useMemo, useState } from 'react';
import { Card, CardBody, Button } from '../modern';
import { Badge, Collapse, ActionIcon, Tooltip } from '@mantine/core';
import {
    IconAlertTriangle,
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconEye,
    IconX,
} from '@tabler/icons-react';
import type { UncertainItem } from '../../services/test-creation/validator.service';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface UncertainItemsSidebarProps {
    /** List of uncertain items */
    items: UncertainItem[];
    /** Callback when item is clicked (to scroll to it) */
    onItemClick: (questionNumber: number) => void;
    /** Callback when item is resolved */
    onItemResolve: (itemId: string) => void;
    /** Callback when item is dismissed (not resolved, just hidden) */
    onItemDismiss?: (itemId: string) => void;
    /** Currently selected item ID */
    selectedItemId?: string;
    /** Whether sidebar is collapsed (mobile) */
    collapsed?: boolean;
    /** Callback to toggle collapse */
    onToggleCollapse?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SEVERITY_CONFIG = {
    high: {
        color: '#ef4444',
        bgColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        icon: '🔴',
        label: 'High Priority',
    },
    medium: {
        color: '#f59e0b',
        bgColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.3)',
        icon: '🟡',
        label: 'Medium Priority',
    },
    low: {
        color: '#3b82f6',
        bgColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
        icon: '🔵',
        label: 'Low Priority',
    },
};

const TYPE_LABELS: Record<UncertainItem['type'], string> = {
    type_mismatch: 'Type Conflict',
    low_confidence: 'Low Confidence',
    missing_answer: 'Missing Answer',
    ambiguous_answer: 'Ambiguous Answer',
    diagram_question: 'Needs Image',
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export const UncertainItemsSidebar: React.FC<UncertainItemsSidebarProps> = ({
    items,
    onItemClick,
    onItemResolve,
    onItemDismiss,
    selectedItemId,
    collapsed = false,
    onToggleCollapse,
}) => {
    const [expandedSeverity, setExpandedSeverity] = useState<Set<string>>(new Set(['high', 'medium', 'low']));

    // Filter out resolved items
    const unresolvedItems = useMemo(() =>
        items.filter(item => !item.resolved),
        [items]);

    // Group by severity
    const itemsBySeverity = useMemo(() => {
        const grouped: Record<'high' | 'medium' | 'low', UncertainItem[]> = {
            high: [],
            medium: [],
            low: [],
        };
        for (const item of unresolvedItems) {
            if (item.severity === 'high' || item.severity === 'medium' || item.severity === 'low') {
                grouped[item.severity].push(item);
            }
        }
        return grouped;
    }, [unresolvedItems]);

    // Toggle severity section
    const toggleSeverity = (severity: string) => {
        setExpandedSeverity(prev => {
            const next = new Set(prev);
            if (next.has(severity)) {
                next.delete(severity);
            } else {
                next.add(severity);
            }
            return next;
        });
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────

    const renderItem = (item: UncertainItem) => {
        const isSelected = selectedItemId === item.id;
        const config = SEVERITY_CONFIG[item.severity];

        return (
            <div
                key={item.id}
                onClick={() => onItemClick(item.questionNumber)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onItemClick(item.questionNumber);
                    }
                }}
                role="listitem"
                tabIndex={0}
                aria-label={`Question ${item.questionNumber}: ${TYPE_LABELS[item.type]}, ${config.label}`}
                style={{
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    borderRadius: '10px',
                    background: isSelected ? config.bgColor : 'rgba(255, 255, 255, 0.6)',
                    border: `1px solid ${isSelected ? config.borderColor : 'rgba(255, 255, 255, 0.8)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <span
                                style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '6px',
                                    background: config.bgColor,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.625rem',
                                    fontWeight: '800',
                                    color: config.color,
                                }}
                            >
                                Q{item.questionNumber}
                            </span>
                            <Badge
                                size="xs"
                                variant="light"
                                color={item.severity === 'high' ? 'red' : item.severity === 'medium' ? 'yellow' : 'blue'}
                            >
                                {TYPE_LABELS[item.type]}
                            </Badge>
                        </div>
                        <p style={{
                            margin: 0,
                            fontSize: '0.8125rem',
                            color: '#475569',
                            lineHeight: '1.4',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}>
                            {item.message}
                        </p>

                        {/* AI vs Rules suggestions */}
                        {item.aiSuggestion && item.rulesSuggestion && (
                            <div style={{
                                marginTop: '0.5rem',
                                padding: '0.5rem',
                                background: 'rgba(248, 250, 252, 0.8)',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                            }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ color: '#64748b' }}>AI:</span>
                                    <span style={{ color: '#8b5cf6', fontWeight: '600' }}>{item.aiSuggestion}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                                    <span style={{ color: '#64748b' }}>Rules:</span>
                                    <span style={{ color: '#22c55e', fontWeight: '600' }}>{item.rulesSuggestion}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <Tooltip label="View question">
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onItemClick(item.questionNumber);
                                }}
                            >
                                <IconEye size={14} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Mark resolved">
                            <ActionIcon
                                variant="subtle"
                                color="green"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onItemResolve(item.id);
                                }}
                            >
                                <IconCheck size={14} />
                            </ActionIcon>
                        </Tooltip>
                        {onItemDismiss && (
                            <Tooltip label="Dismiss">
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onItemDismiss(item.id);
                                    }}
                                >
                                    <IconX size={14} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderSeveritySection = (severity: 'high' | 'medium' | 'low') => {
        const sectionItems = itemsBySeverity[severity];
        if (!sectionItems || sectionItems.length === 0) return null;

        const config = SEVERITY_CONFIG[severity];
        const isExpanded = expandedSeverity.has(severity);

        return (
            <div key={severity} style={{ marginBottom: '1rem' }} role="list">
                <div
                    onClick={() => toggleSeverity(severity)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleSeverity(severity);
                        }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-controls={`severity-section-${severity}`}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        background: config.bgColor,
                        cursor: 'pointer',
                        marginBottom: isExpanded ? '0.5rem' : 0,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{config.icon}</span>
                        <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: config.color }}>
                            {config.label}
                        </span>
                        <Badge size="xs" color={severity === 'high' ? 'red' : severity === 'medium' ? 'yellow' : 'blue'}>
                            {sectionItems.length}
                        </Badge>
                    </div>
                    {isExpanded ? (
                        <IconChevronUp size={16} color={config.color} />
                    ) : (
                        <IconChevronDown size={16} color={config.color} />
                    )}
                </div>
                <Collapse in={isExpanded}>
                    <div id={`severity-section-${severity}`}>
                        {sectionItems.map(renderItem)}
                    </div>
                </Collapse>
            </div>
        );
    };

    return (
        <Card variant="glass" style={{ height: 'auto' }}>
            <CardBody style={{ padding: '1rem' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <IconAlertTriangle size={20} color="#f59e0b" />
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>
                            Need Review
                        </h3>
                        <Badge
                            color={unresolvedItems.length > 0 ? 'yellow' : 'green'}
                            variant="filled"
                            size="sm"
                        >
                            {unresolvedItems.length}
                        </Badge>
                    </div>
                    {onToggleCollapse && (
                        <ActionIcon variant="subtle" onClick={onToggleCollapse}>
                            {collapsed ? <IconChevronDown size={18} /> : <IconChevronUp size={18} />}
                        </ActionIcon>
                    )}
                </div>

                {/* Content */}
                <Collapse in={!collapsed}>
                    {unresolvedItems.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '2rem 1rem',
                            color: '#64748b',
                        }}>
                            <div
                                style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1rem',
                                }}
                            >
                                <IconCheck size={24} color="white" />
                            </div>
                            <p style={{ margin: 0, fontWeight: '600' }}>All items reviewed!</p>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem' }}>
                                No uncertain items remaining
                            </p>
                        </div>
                    ) : (
                        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                            {renderSeveritySection('high')}
                            {renderSeveritySection('medium')}
                            {renderSeveritySection('low')}
                        </div>
                    )}
                </Collapse>

                {/* Resolve All Button */}
                {unresolvedItems.length > 0 && !collapsed && (
                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(203, 213, 225, 0.3)' }}>
                        <Button
                            variant="glass"
                            onClick={() => unresolvedItems.forEach(item => onItemResolve(item.id))}
                            style={{ width: '100%' }}
                        >
                            <IconCheck size={16} style={{ marginRight: '0.5rem' }} />
                            Resolve All ({unresolvedItems.length})
                        </Button>
                    </div>
                )}
            </CardBody>
        </Card>
    );
};

export default UncertainItemsSidebar;
