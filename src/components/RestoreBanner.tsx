/**
 * RestoreBanner — System-wide maintenance banner during restore operations (PRD-0026 §6.6)
 *
 * Subscribes to `system_flags/restore_in_progress` in RTDB in real-time.
 * When active, shows a fixed-position yellow warning banner visible to ALL users.
 */

import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
// @ts-ignore - JS service file
import { database } from '../services/firebase';

function isPermissionDeniedError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('permission_denied');
}

const RestoreBanner: React.FC = () => {
    const [isRestoring, setIsRestoring] = useState(false);

    useEffect(() => {
        const flagRef = ref(database, 'system_flags/restore_in_progress');

        const unsubscribe = onValue(flagRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setIsRestoring(data?.active === true);
            } else {
                setIsRestoring(false);
            }
        }, (error) => {
            if (!isPermissionDeniedError(error)) {
                console.warn('[RestoreBanner] Failed to listen to restore flag:', error);
            }
            setIsRestoring(false);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    if (!isRestoring) return null;

    return (
        <div
            role="alert"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#1a1a1a',
                textAlign: 'center',
                padding: '0.65rem 1rem',
                fontWeight: 600,
                fontSize: '0.9rem',
                letterSpacing: '0.01em',
                boxShadow: '0 2px 12px rgba(245, 158, 11, 0.35)',
                animation: 'restoreBannerPulse 3s ease-in-out infinite',
            }}
        >
            ⚠️ System restore in progress. Some features may be temporarily unavailable.
            <style>{`
                @keyframes restoreBannerPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.85; }
                }
            `}</style>
        </div>
    );
};

export default RestoreBanner;
