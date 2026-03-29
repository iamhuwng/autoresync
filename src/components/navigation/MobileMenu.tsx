import React from 'react';
import { Button } from '../modern';

interface MobileMenuProps {
    isOpen: boolean;
    onClose: () => void;
    items: Array<{
        id: string;
        label: string;
        icon?: string;
        onClick: () => void;
        isActive?: boolean;
    }>;
    onLogout: () => void;
    userRole?: string;
}

/**
 * MobileMenu - Slide-in drawer navigation for mobile devices
 *
 * Features:
 * - Hamburger menu trigger
 * - Slide-in from left
 * - Flat list of navigation items
 * - Active state highlighting
 * - Logout at bottom
 *
 * Used by:
 * - TeacherHeader (mobile breakpoint)
 * - AdminLayout (mobile breakpoint)
 */
export const MobileMenu: React.FC<MobileMenuProps> = ({
    isOpen,
    onClose,
    items,
    onLogout,
    userRole,
}) => {
    if (!isOpen) {
        return null;
    }

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.45)',
                    zIndex: 999,
                }}
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: 'min(80vw, 22rem)',
                    padding: '1rem',
                    background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 50%, #f0fdfa 100%)',
                    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        padding: '1rem 0',
                        borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
                        marginBottom: '1rem',
                    }}
                >
                    <div>
                        <h3
                            style={{
                                fontSize: '1.25rem',
                                fontWeight: '700',
                                color: '#1e293b',
                                margin: 0,
                            }}
                        >
                            Navigation
                        </h3>
                        {userRole && (
                            <p
                                style={{
                                    fontSize: '0.875rem',
                                    color: '#64748b',
                                    margin: '0.25rem 0 0',
                                }}
                            >
                                {userRole === 'super_admin' && 'Super Admin'}
                                {userRole === 'teacher' && 'Teacher'}
                                {userRole === 'student' && 'Student'}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close navigation menu"
                        style={{
                            border: 'none',
                            background: 'rgba(255, 255, 255, 0.75)',
                            color: '#1e293b',
                            width: '2.25rem',
                            height: '2.25rem',
                            borderRadius: '999px',
                            cursor: 'pointer',
                            fontSize: '1.25rem',
                            lineHeight: 1,
                        }}
                    >
                        x
                    </button>
                </div>

                <div
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                    }}
                >
                    {items.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => {
                                item.onClick();
                                onClose();
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                padding: '1rem',
                                background: item.isActive
                                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))'
                                    : 'transparent',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                fontSize: '1rem',
                                fontWeight: item.isActive ? '600' : '500',
                                color: item.isActive ? '#6366f1' : '#475569',
                                textAlign: 'left',
                                width: '100%',
                            }}
                        >
                            {item.icon && (
                                <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
                            )}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>

                <div
                    style={{
                        padding: '1rem 0',
                        borderTop: '1px solid rgba(203, 213, 225, 0.3)',
                        marginTop: '1rem',
                    }}
                >
                    <Button
                        variant="glass"
                        onClick={() => {
                            onLogout();
                            onClose();
                        }}
                        style={{
                            width: '100%',
                            justifyContent: 'center',
                            padding: '1rem',
                        }}
                    >
                        <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>
                            Log out
                        </span>
                    </Button>
                </div>
            </div>
        </>
    );
};

/**
 * HamburgerButton - Trigger button for mobile menu
 */
interface HamburgerButtonProps {
    onClick: () => void;
    isOpen?: boolean;
}

export const HamburgerButton: React.FC<HamburgerButtonProps> = ({
    onClick,
    isOpen = false,
}) => {
    return (
        <button
            onClick={onClick}
            style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                transition: 'all 0.3s ease',
            }}
            aria-label="Toggle menu"
        >
            <div
                style={{
                    width: '24px',
                    height: '2px',
                    background: '#1e293b',
                    borderRadius: '2px',
                    transition: 'all 0.3s ease',
                    transform: isOpen ? 'rotate(45deg) translateY(8px)' : 'none',
                }}
            />
            <div
                style={{
                    width: '24px',
                    height: '2px',
                    background: '#1e293b',
                    borderRadius: '2px',
                    transition: 'all 0.3s ease',
                    opacity: isOpen ? 0 : 1,
                }}
            />
            <div
                style={{
                    width: '24px',
                    height: '2px',
                    background: '#1e293b',
                    borderRadius: '2px',
                    transition: 'all 0.3s ease',
                    transform: isOpen ? 'rotate(-45deg) translateY(-8px)' : 'none',
                }}
            />
        </button>
    );
};
