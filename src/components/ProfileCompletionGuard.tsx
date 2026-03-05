/**
 * ProfileCompletionGuard Component
 * 
 * Wrapper for protected routes that checks if user has completed their profile.
 * Redirects to profile completion page if not complete.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const Center: React.FC<{ style?: React.CSSProperties, children: React.ReactNode }> = ({ style, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}>
        {children}
    </div>
);

const Loader: React.FC<{ size?: string }> = () => (
    <div style={{
        width: '3rem', height: '3rem',
        border: '4px solid rgba(139, 92, 246, 0.2)',
        borderTopColor: '#8b5cf6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    }}>
        <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `}</style>
    </div>
);
import { useAuth } from '@/contexts/AuthContext';
import { useProfileCompletion } from '../hooks/useProfileCompletion';

interface ProfileCompletionGuardProps {
    children: React.ReactNode;
}

/**
 * Guard component that ensures user has completed their profile
 * before accessing protected routes
 */
export function ProfileCompletionGuard({ children }: ProfileCompletionGuardProps) {
    const { user } = useAuth();
    const { isComplete, isLoading } = useProfileCompletion(user?.uid);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        // Don't redirect if we're already on the profile completion page
        if (location.pathname === '/profile/complete') {
            return;
        }

        // If profile check is done and profile is not complete, redirect
        if (!isLoading && isComplete === false && user) {
            navigate('/profile/complete', { replace: true });
        }
    }, [isComplete, isLoading, user, navigate, location.pathname]);

    // Show loading while checking profile completion
    if (isLoading) {
        return (
            <Center style={{ height: '100vh' }}>
                <Loader size="xl" />
            </Center>
        );
    }

    // If profile is not complete, show loading (redirect will happen in useEffect)
    if (isComplete === false && location.pathname !== '/profile/complete') {
        return (
            <Center style={{ height: '100vh' }}>
                <Loader size="xl" />
            </Center>
        );
    }

    // Profile is complete or we're on the completion page, render children
    return <>{children}</>;
}
