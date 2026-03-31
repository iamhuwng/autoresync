/**
 * BlockedUserPage
 * 
 * Displayed when a user's account has been blocked.
 * Part of RBAC Security Hardening (PRD-0016), Task 5.8.
 * 
 * Features:
 * - Clear message explaining account is blocked
 * - Contact information for support
 * - Logout button to clear session
 * - Prevention of navigation to other protected routes
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody } from '../components/modern';
import { IconBan, IconLogout, IconMail } from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';

interface BlockedUserPageProps {
    /** Optional custom message */
    message?: string;
    /** Reason for blocking (from state or props) */
    reason?: string;
}

const BlockedUserPage: React.FC<BlockedUserPageProps> = ({
    message,
    reason = 'Your account has been blocked by an administrator.',
}) => {
    const navigate = useNavigate();
    const { logout, user } = useAuth();

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/', { replace: true });
        } catch (error) {
            console.error('Logout failed:', error);
            navigate('/', { replace: true });
        }
    };

    const handleContactSupport = () => {
        // Open email client with pre-filled subject
        const email = 'support@example.com'; // TODO: Configure actual support email
        const subject = encodeURIComponent('Account Blocked - Appeal Request');
        const body = encodeURIComponent(`
Hello Support Team,

My account has been blocked and I would like to request a review.

Account Email: ${user?.email || 'N/A'}
Date: ${new Date().toISOString()}

Please review my account status.

Thank you.
        `.trim());

        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(180deg, #fef2f2 0%, #fff7ed 100%)' }}>
            <Card
                variant="glass"
                style={{
                    maxWidth: '620px',
                    width: '100%',
                }}
            >
                <CardBody>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', textAlign: 'center' }}>
                        <div
                            style={{
                                width: '5rem',
                                height: '5rem',
                                borderRadius: '999px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'linear-gradient(135deg, #dc2626 0%, #f97316 100%)',
                                color: '#ffffff',
                                boxShadow: '0 18px 42px rgba(220, 38, 38, 0.24)',
                            }}
                        >
                            <IconBan size={40} stroke={1.5} />
                        </div>

                        <div>
                            <h1
                                style={{
                                    margin: 0,
                                    fontSize: '2rem',
                                    fontWeight: 800,
                                    background: 'linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                }}
                            >
                                Account Blocked
                            </h1>
                            <p style={{ margin: '0.75rem auto 0', maxWidth: '430px', color: '#64748b', lineHeight: 1.65 }}>
                                {message || reason}
                            </p>
                        </div>

                        {user?.email && (
                            <div
                                style={{
                                    borderRadius: '1rem',
                                    padding: '0.9rem 1rem',
                                    background: 'rgba(15, 23, 42, 0.03)',
                                    border: '1px solid rgba(148, 163, 184, 0.22)',
                                    color: '#475569',
                                    width: '100%',
                                }}
                            >
                                <strong>Account:</strong> {user.email}
                            </div>
                        )}

                        <div
                            style={{
                                width: '100%',
                                borderRadius: '1rem',
                                padding: '1rem 1.1rem',
                                background: 'rgba(15, 23, 42, 0.03)',
                                border: '1px solid rgba(148, 163, 184, 0.22)',
                                textAlign: 'left',
                            }}
                        >
                            <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                                This could happen for several reasons:
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#64748b', lineHeight: 1.75 }}>
                                <li>Violation of terms of service</li>
                                <li>Security concerns with your account</li>
                                <li>Administrative action</li>
                                <li>Suspicious activity detected</li>
                            </ul>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <Button variant="outline" leftSection={<IconMail size={18} />} onClick={handleContactSupport}>
                                Contact Support
                            </Button>
                            <Button variant="primary" leftSection={<IconLogout size={18} />} onClick={handleLogout}>
                                Log Out
                            </Button>
                        </div>

                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem', lineHeight: 1.6 }}>
                            If you believe this is an error, please contact the administrator for assistance.
                        </p>
                    </div>
                </CardBody>
            </Card>
        </div>
    );
};

export default BlockedUserPage;
