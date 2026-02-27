/**
 * AdminStatsHeader Component
 * 
 * Displays key statistics in a visually appealing card format.
 * Shows user counts, pending requests, and other admin metrics.
 * 
 * @example
 * <AdminStatsHeader
 *   stats={[
 *     { label: 'Total Users', value: 150, icon: <IconUsers /> },
 *     { label: 'Pending Requests', value: 5, icon: <IconUserPlus /> }
 *   ]}
 * />
 */

import { Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface StatItem {
    label: string;
    value: number;
    icon: ReactNode;
    color: string;
    bg: string;
}

interface AdminStatsHeaderProps {
    stats: StatItem[];
}

export function AdminStatsHeader({ stats }: AdminStatsHeaderProps) {
    return (
        <div style={{
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            marginBottom: '24px'
        }}>
            {stats.map((stat, i) => (
                <div
                    key={i}
                    className="stat-pill staggered-item"
                    style={{ animationDelay: `${i * 0.1}s` }}
                >
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        backgroundColor: stat.bg,
                        color: stat.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.5)'
                    }}>
                        {stat.icon}
                    </div>
                    <div>
                        <Text
                            size="xs"
                            fw={700}
                            c="dimmed"
                            style={{
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}
                        >
                            {stat.label}
                        </Text>
                        <Text
                            size="lg"
                            fw={900}
                            c="dark"
                            style={{ lineHeight: 1.1 }}
                        >
                            {stat.value}
                        </Text>
                    </div>
                </div>
            ))}
        </div>
    );
}
