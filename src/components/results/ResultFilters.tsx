
import React from 'react';
import { Card, CardBody, Button } from '../modern';
import { ResultFilters as Filters } from '../types/results.types';

interface ResultFiltersProps {
    filters: Filters;
    onChange: (filters: Filters) => void;
    onClear: () => void;
}

export const ResultFilters: React.FC<ResultFiltersProps> = ({
    filters,
    onChange,
    onClear
}) => {
    const handleChange = (key: keyof Filters, value: any) => {
        onChange({ ...filters, [key]: value });
    };

    return (
        <Card variant="glass" style={{ marginBottom: '2rem' }}>
            <CardBody style={{ padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>

                    {/* Test Type & Skill */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                                Test Type
                            </label>
                            <select
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
                                <option value="test">Test</option>
                                <option value="quiz">Quiz</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                                Skill
                            </label>
                            <select
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
                                <option value="reading">Reading</option>
                                <option value="listening">Listening</option>
                                <option value="writing">Writing</option>
                                <option value="speaking">Speaking</option>
                            </select>
                        </div>
                    </div>

                    {/* Date Range */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                            Date Range
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                type="date"
                                placeholder="From"
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
                                    const val = e.target.value ? new Date(e.target.value).getTime() : undefined;
                                    handleChange('dateFrom', val);
                                }}
                            />
                            <span style={{ color: '#94a3b8' }}>-</span>
                            <input
                                type="date"
                                placeholder="To"
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
                                    const val = e.target.value ? new Date(e.target.value).getTime() : undefined;
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
