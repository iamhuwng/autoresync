import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildRoute } from '../../constants/routes';

export interface HomeworkBreadcrumbItem {
    label: string;
    onClick?: () => void;
}

interface HomeworkBreadcrumbProps {
    items?: HomeworkBreadcrumbItem[];
    homeworkTitle?: string;
    sectionLabel?: string;
}

const crumbButtonStyle: CSSProperties = {
    border: 'none',
    background: 'transparent',
    padding: 0,
    color: '#2563eb',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
};

const separatorStyle: CSSProperties = {
    color: '#94a3b8',
};

function HomeworkBreadcrumb({
    items,
    homeworkTitle,
    sectionLabel = 'Details',
}: HomeworkBreadcrumbProps) {
    const navigate = useNavigate();
    const resolvedItems = items ?? [
        {
            label: 'Homework',
            onClick: () => navigate(buildRoute('TEACHER_HOMEWORK')),
        },
        {
            label: homeworkTitle || 'Homework',
        },
        {
            label: sectionLabel,
        },
    ];

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '1rem',
            }}
        >
            {resolvedItems.map((item, index) => {
                const isLast = index === resolvedItems.length - 1;

                return (
                    <div key={`${item.label}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        {item.onClick && !isLast ? (
                            <button
                                type="button"
                                style={crumbButtonStyle}
                                onClick={item.onClick}
                            >
                                {item.label}
                            </button>
                        ) : (
                            <span style={{ color: isLast ? '#0f172a' : '#475569', fontWeight: isLast ? 700 : 600 }}>
                                {item.label}
                            </span>
                        )}
                        {!isLast ? <span style={separatorStyle}>→</span> : null}
                    </div>
                );
            })}
        </div>
    );
}

export default HomeworkBreadcrumb;
