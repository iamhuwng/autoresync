/**
 * ProfileCompletionGuard Component
 * 
 * Wrapper for protected routes that checks if user has completed their profile.
 * Redirects to profile completion page if not complete.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
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
