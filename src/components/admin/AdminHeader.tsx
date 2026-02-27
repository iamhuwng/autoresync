import React from 'react';
import { AppShell } from '@mantine/core';
import { Button } from '../modern';

/**
 * @deprecated This component is deprecated as of 2026-02-02.
 * Use `AdminLayout` from `src/components/navigation/AdminLayout.tsx` instead.
 * 
 * AdminLayout provides:
 * - Fixed sidebar navigation (instead of top bar)
 * - Automatic breadcrumb integration
 * - Consistent layout across all admin pages
 * - Better navigation UX with hierarchical structure
 * 
 * Migration guide:
 * Replace `<AdminPageLayout>` wrapper with `<AdminLayout>`
 * See AdminUserManagementPage.jsx for example implementation.
 */
export interface AdminHeaderProps {
    title: string;
    onBack: () => void;
    onLogout: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
    title,
    onBack,
    onLogout,
}) => {
    return (
        <AppShell.Header
            style={{
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            }}
        >
            <div
                style={{
                    height: '100%',
                    padding: '0 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Button variant="glass" onClick={onBack}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                            <line x1="19" y1="12" x2="5" y2="12" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Back to Lobby
                    </Button>
                    <h2
                        style={{
                            fontSize: '1.5rem',
                            fontWeight: '700',
                            color: '#1e293b',
                            margin: 0,
                        }}
                    >
                        {title}
                    </h2>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Button variant="glass" onClick={onLogout}>
                        Logout
                    </Button>
                </div>
            </div>
        </AppShell.Header>
    );
};
