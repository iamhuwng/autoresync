
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavigation } from '../useNavigation';
import { TestMetadata, TestType, TestSkill } from '../../config/test.config';
import { getDefaultDuration, getSpecialRoute } from '../../config/test.config';
import { validateMetadata } from '../../utils/test-validators';

export const useCreateTestForm = () => {
    const navigate = useNavigate(); // For special routes with query params
    const { navigateTo } = useNavigation('teacher');

    // Initial Metadata State
    const [metadata, setMetadata] = useState<TestMetadata>({
        title: '',
        type: 'IELTS',
        skill: 'Reading',
        duration: 60,
        difficulty: 'Intermediate',
        description: '',
        tags: [],
        targetBand: '',
        estimatedScore: '',
    });

    const [currentStep, setCurrentStep] = useState<'metadata' | 'upload' | 'parsing' | 'review'>('metadata');
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Handle Test Type Change
    const handleTypeChange = useCallback((type: string) => {
        const newType = type as TestType;
        setMetadata(prev => ({
            ...prev,
            type: newType,
            duration: getDefaultDuration(newType, prev.skill),
        }));
    }, []);

    // Handle Skill Change - CRITICAL: Handles Routing for Non-Reading Skills
    const handleSkillChange = useCallback((skill: string) => {
        const newSkill = skill as TestSkill;

        setMetadata(prev => ({
            ...prev,
            skill: newSkill,
            duration: getDefaultDuration(prev.type, newSkill),
        }));
    }, []);

    // Generic Metadata Update
    const updateMetadata = useCallback((updates: Partial<TestMetadata>) => {
        setMetadata(prev => ({ ...prev, ...updates }));
        // Clear errors for updated fields
        if (Object.keys(errors).length > 0) {
            setErrors(prev => {
                const newErrors = { ...prev };
                Object.keys(updates).forEach(key => delete newErrors[key]);
                return newErrors;
            });
        }
    }, [errors]);

    // Validate Form
    const validateForm = useCallback((): boolean => {
        const { isValid, errors: validationErrors } = validateMetadata(metadata);
        setErrors(validationErrors);
        return isValid;
    }, [metadata]);

    // Navigation Handlers
    const handleContinue = useCallback(() => {
        if (currentStep === 'metadata') {
            if (validateForm()) {
                // Check for special routes (e.g., Listening/Writing/Speaking)
                const specialRoute = getSpecialRoute(metadata.type, metadata.skill);
                if (specialRoute) {
                    // Pass metadata via location state to avoid duplicate form
                    navigate(specialRoute, { state: { metadata } });
                    return;
                }

                setCurrentStep('upload');
            }
        } else if (currentStep === 'upload') {
            // Upload validation handled by Parser hook
            setCurrentStep('parsing');
        } else if (currentStep === 'parsing') {
            setCurrentStep('review');
        }
    }, [currentStep, metadata, validateForm, navigateTo]);

    const handleBack = useCallback(() => {
        switch (currentStep) {
            case 'metadata':
                navigateTo('SESSIONS', {}, { reason: 'test_form_back' });
                break;
            case 'upload':
                setCurrentStep('metadata');
                break;
            case 'parsing':
                setCurrentStep('upload');
                break;
            case 'review':
                setCurrentStep('upload'); // Or parsing, depending on flow preference
                break;
        }
    }, [currentStep, navigateTo]);

    const goToStep = useCallback((step: typeof currentStep) => {
        setCurrentStep(step);
    }, []);

    const resetForm = useCallback(() => {
        setMetadata({
            title: '',
            type: 'IELTS',
            skill: 'Reading',
            duration: 60,
            difficulty: 'Intermediate',
            description: '',
            tags: [],
            targetBand: '',
            estimatedScore: '',
        });
        setCurrentStep('metadata');
        setErrors({});
    }, []);

    // Helper for UI
    const getStepInfo = useCallback(() => {
        switch (currentStep) {
            case 'metadata': return { step: 1, title: 'Test Information' };
            case 'upload': return { step: 2, title: 'Upload Document' };
            case 'parsing': return { step: 3, title: 'Processing' };
            case 'review': return { step: 4, title: 'Review & Save' };
        }
    }, [currentStep]);

    return {
        metadata,
        currentStep,
        errors,
        handleTypeChange,
        handleSkillChange,
        updateMetadata,
        validateForm,
        handleContinue,
        handleBack,
        goToStep,
        resetForm,
        getStepInfo
    };
};
