/**
 * useProfileCompletion Hook
 * 
 * Manages profile completion state and redirect logic.
 * Part of PRD-0015: Academic Record & Enhanced Profile System
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isProfileComplete } from '@/services/profileService';

interface UseProfileCompletionResult {
    isComplete: boolean | null;
    isLoading: boolean;
    checkCompletion: (uid: string) => Promise<boolean>;
    redirectToCompletion: () => void;
}

/**
 * Hook to check if current user needs to complete their profile
 * Returns completion status and redirect function
 */
export function useProfileCompletion(uid?: string): UseProfileCompletionResult {
    const [isComplete, setIsComplete] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    const checkCompletion = async (userId: string): Promise<boolean> => {
        setIsLoading(true);
        try {
            const complete = await isProfileComplete(userId);
            setIsComplete(complete);
            return complete;
        } catch (error) {
            console.error('Error checking profile completion:', error);
            setIsComplete(null);
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const redirectToCompletion = () => {
        navigate('/profile/complete', { replace: true });
    };

    // Auto-check on mount if uid provided
    useEffect(() => {
        if (uid) {
            checkCompletion(uid);
        } else {
            setIsLoading(false);
        }
    }, [uid]);

    return {
        isComplete,
        isLoading,
        checkCompletion,
        redirectToCompletion,
    };
}
