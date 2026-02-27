import React from 'react';
import { AdminStatsHeader, StatItem } from './AdminStatsHeader';

export interface AdminPageTitleProps {
    title: string;
    subtitle: string;
    stats: StatItem[];
}

export const AdminPageTitle: React.FC<AdminPageTitleProps> = ({
    title,
    subtitle,
    stats,
}) => {
    return (
        <div style={{ marginBottom: '2.5rem', animation: 'slideDown 0.5s ease-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '2rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 300px' }}>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>
                        {title}
                    </h1>
                    <p style={{ fontSize: '1rem', color: '#64748b', margin: 0 }}>
                        {subtitle}
                    </p>
                </div>
                <AdminStatsHeader stats={stats} />
            </div>
        </div>
    );
};
