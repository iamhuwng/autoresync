
import React, { useMemo } from 'react';
import { Card, CardBody, Button } from '../modern';
import { ResultFilters as Filters } from '../../types/results.types';

type FilterResultOptionSource = {
    testType?: string | null;
    testSkill?: string | null;
};

interface ResultFiltersProps {
    filters: Filters;
    results?: FilterResultOptionSource[];
    onChange: (filters: Filters) => void;
    onClear: () => void;
}

export const ResultFilters: React.FC<ResultFiltersProps> = ({
    filters,
    results = [],
    onChange,
    onClear
}) => {
    const handleChange = (key: keyof Filters, value: any) => {
        onChange({ ...filters, [key]: value });
    };

    const testTypeOptions = useMemo(
        () => collectDistinctValues(results.map((result) => result.testType)),
        [results],
    );

    const skillOptions = useMemo(
        () => collectDistinctValues(results.map((result) => result.testSkill)),
        [results],
    );

    return (
        <Card variant="glass" style={{ marginBottom: '2rem' }}>
            <CardBody style={{ padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>

                    {/* Test Type & Skill */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label
                                htmlFor="result-filter-test-type"
                                style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}
                            >
                                Test Type
                            </label>
                            <select
                                id="result-filter-test-type"
                                aria-label="Test Type"
                                value={filters.testType || ''}
                                onChange={(e) => handleChange('testType', e.target.value || undefined)}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: '0.5rem',
                                    border: '1px solid #cbd5e1',
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="">All Types</option>
                                {testTypeOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {formatFilterOptionLabel(option)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label
                                htmlFor="result-filter-skill"
                                style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}
                            >
                                Skill
                            </label>
                            <select
                                id="result-filter-skill"
                                aria-label="Skill"
                                value={filters.skill || ''}
                                onChange={(e) => handleChange('skill', e.target.value || undefined)}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: '0.5rem',
                                    border: '1px solid #cbd5e1',
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="">All Skills</option>
                                {skillOptions.map((option) => (
                                    <option key={option} value={option}>
                                        {formatFilterOptionLabel(option)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Date Range */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label
                            htmlFor="result-filter-date-from"
                            style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}
                        >
                            Date Range
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                id="result-filter-date-from"
                                aria-label="Date From"
                                type="date"
                                placeholder="From"
                                value={formatDateInputValue(filters.dateFrom)}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: '0.5rem',
                                    border: '1px solid #cbd5e1',
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    width: '100%'
                                }}
                                onChange={(e) => {
                                    const val = e.target.value ? getStartOfDayTimestamp(e.target.value) : undefined;
                                    handleChange('dateFrom', val);
                                }}
                            />
                            <span style={{ color: '#94a3b8' }}>-</span>
                            <input
                                aria-label="Date To"
                                type="date"
                                placeholder="To"
                                value={formatDateInputValue(filters.dateTo)}
                                style={{
                                    padding: '0.75rem',
                                    borderRadius: '0.5rem',
                                    border: '1px solid #cbd5e1',
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    width: '100%'
                                }}
                                onChange={(e) => {
                                    const val = e.target.value ? getEndOfDayTimestamp(e.target.value) : undefined;
                                    handleChange('dateTo', val);
                                }}
                            />
                        </div>
                    </div>

                    {/* Score Range */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                            Min Score (%)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input
                                aria-label="Min Score"
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={filters.scoreMin || 0}
                                onChange={(e) => handleChange('scoreMin', parseInt(e.target.value))}
                                style={{
                                    flex: 1,
                                    accentColor: '#8b5cf6',
                                    cursor: 'pointer'
                                }}
                            />
                            <span style={{
                                minWidth: '3rem',
                                textAlign: 'right',
                                fontWeight: 600,
                                color: '#8b5cf6'
                            }}>
                                {filters.scoreMin || 0}%
                            </span>
                        </div>

                        <div style={{ marginTop: 'auto' }}>
                            <Button
                                variant="glass"
                                onClick={onClear}
                                style={{ width: '100%' }}
                            >
                                Clear Filters
                            </Button>
                        </div>
                    </div>

                </div>
            </CardBody>
        </Card>
    );
};

function collectDistinctValues(values: Array<string | null | undefined>): string[] {
    return Array.from(
        new Set(
            values
                .map((value) => value?.trim())
                .filter((value): value is string => Boolean(value)),
        ),
    ).sort((left, right) => left.localeCompare(right));
}

function formatFilterOptionLabel(value: string): string {
    return value
        .split(/[_-]+/g)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
}

function formatDateInputValue(timestamp?: number): string {
    if (!timestamp) {
        return '';
    }

    const date = new Date(timestamp);
    const normalized = new Date(date.getTime() - (date.getTimezoneOffset() * 60_000));
    return normalized.toISOString().slice(0, 10);
}

function getStartOfDayTimestamp(value: string): number {
    return new Date(`${value}T00:00:00`).getTime();
}

function getEndOfDayTimestamp(value: string): number {
    return new Date(`${value}T23:59:59.999`).getTime();
}
