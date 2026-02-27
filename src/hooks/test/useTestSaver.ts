
import { useState, useCallback } from 'react';
import { useNavigation } from '../useNavigation';
import { TestMetadata as FirebaseTestMetadata, saveTestToFirebase } from '../../services/testStorage';
import { Passage, ParsedQuestion } from '../../types/document.types';
import { TestMetadata } from '../../config/test.config';
import { useAuth } from '../useAuth';

export const useTestSaver = () => {
    const { navigateTo } = useNavigation('teacher');
    const { user } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const saveTest = useCallback(async (
        metadata: TestMetadata,
        passages: Passage[],
        questions: ParsedQuestion[]
    ) => {
        setIsSaving(true);
        setSaveError(null);

        try {
            // 1. Prepare Metadata for Firebase
            const firebaseMetadata: FirebaseTestMetadata = {
                title: metadata.title,
                type: metadata.type,
                skill: metadata.skill,
                duration: metadata.duration,
                difficulty: metadata.difficulty,
                description: metadata.description,
                tags: metadata.tags,
                targetBand: metadata.targetBand,
                estimatedScore: metadata.estimatedScore,
            };

            // 3. Save Test
            const userId = user?.uid || 'anonymous';
            const result = await saveTestToFirebase(
                firebaseMetadata,
                passages,
                questions,
                userId, // createdBy
                undefined, // materialLink
                userId, // ownerId
                false // isPublic
            );

            if (result.success && result.testId) {
                alert(`Test saved successfully! Test ID: ${result.testId}`);
                // Use centralized navigation instead of direct navigate()
                navigateTo('SESSIONS', {}, { reason: 'test_created', replace: true });
                return true;
            } else {
                throw new Error(result.error || 'Unknown error saving test');
            }

        } catch (error: any) {
            console.error('Error saving test:', error);
            setSaveError(error.message);
            alert(`Failed to save test: ${error.message}`);
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [navigateTo, user]);

    // Helper: Auto-create material if none linked
    // Removed as per request to remove Materials feature

    return {
        saveTest,
        isSaving,
        saveError
    };
};

