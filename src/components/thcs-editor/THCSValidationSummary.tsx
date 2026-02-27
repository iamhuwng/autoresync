/**
 * THCSValidationSummary — Validation errors/warnings display (PRD-0027 Task 4.8)
 */
import React from 'react';
import { Text } from '@mantine/core';

interface THCSValidationSummaryProps {
    errors: string[];
    warnings: string[];
    isValid: boolean;
}

const THCSValidationSummary: React.FC<THCSValidationSummaryProps> = ({
    errors, warnings, isValid,
}) => {
    if (errors.length === 0 && warnings.length === 0) {
        return (
            <div style={{
                padding: '0.75rem 1rem', borderRadius: '0.75rem',
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
            }}>
                <Text size="sm" fw={600} style={{ color: '#059669' }}>
                    ✅ All validation checks passed — ready to publish!
                </Text>
            </div>
        );
    }

    return (
        <div style={{
            borderRadius: '0.75rem', overflow: 'hidden',
            border: `1px solid ${errors.length > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
        }}>
            <div style={{
                padding: '0.75rem 1rem',
                background: errors.length > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
            }}>
                <Text size="sm" fw={700} style={{ color: errors.length > 0 ? '#dc2626' : '#d97706' }}>
                    {errors.length > 0
                        ? `❌ ${errors.length} error${errors.length > 1 ? 's' : ''} must be fixed before publishing`
                        : `⚠️ ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`
                    }
                </Text>
            </div>

            <div style={{ padding: '0.5rem 1rem' }}>
                {errors.map((err, i) => (
                    <div key={`e-${i}`} style={{
                        padding: '0.25rem 0', fontSize: '0.8125rem',
                        color: '#dc2626', display: 'flex', gap: '0.5rem',
                    }}>
                        <span>❌</span>
                        <span>{err}</span>
                    </div>
                ))}
                {warnings.map((warn, i) => (
                    <div key={`w-${i}`} style={{
                        padding: '0.25rem 0', fontSize: '0.8125rem',
                        color: '#d97706', display: 'flex', gap: '0.5rem',
                    }}>
                        <span>⚠️</span>
                        <span>{warn}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default THCSValidationSummary;
