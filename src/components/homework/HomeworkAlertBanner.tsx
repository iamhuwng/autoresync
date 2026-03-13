import type { CSSProperties } from 'react';
import { Button } from '../modern';

export interface HomeworkAlertItem {
    id: string;
    tone: 'info' | 'warning' | 'danger' | 'success';
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
}

interface HomeworkAlertBannerProps {
    alerts: HomeworkAlertItem[];
}

const toneStyles: Record<HomeworkAlertItem['tone'], CSSProperties> = {
    info: {
        background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(191,219,254,0.45))',
        border: '1px solid rgba(59,130,246,0.2)',
        color: '#1d4ed8',
    },
    warning: {
        background: 'linear-gradient(135deg, rgba(245,158,11,0.14), rgba(254,243,199,0.6))',
        border: '1px solid rgba(245,158,11,0.24)',
        color: '#b45309',
    },
    danger: {
        background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(254,226,226,0.6))',
        border: '1px solid rgba(239,68,68,0.22)',
        color: '#b91c1c',
    },
    success: {
        background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(209,250,229,0.6))',
        border: '1px solid rgba(16,185,129,0.2)',
        color: '#047857',
    },
};

function HomeworkAlertBanner({ alerts }: HomeworkAlertBannerProps) {
    if (alerts.length === 0) {
        return null;
    }

    return (
        <div
            style={{
                display: 'grid',
                gap: '0.75rem',
                marginBottom: '1rem',
            }}
        >
            {alerts.map((alert) => (
                <div
                    key={alert.id}
                    style={{
                        ...toneStyles[alert.tone],
                        borderRadius: '1rem',
                        padding: '0.875rem 1rem',
                        display: 'flex',
                        gap: '1rem',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>{alert.title}</div>
                        <div style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>{alert.message}</div>
                    </div>
                    {alert.actionLabel && alert.onAction ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={alert.onAction}
                        >
                            {alert.actionLabel}
                        </Button>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

export default HomeworkAlertBanner;
