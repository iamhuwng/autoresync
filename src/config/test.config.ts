
export type TestType = 'IELTS' | 'TOEFL' | 'Custom' | 'College Entrance';
export type TestSkill = 'Reading' | 'Listening' | 'Writing' | 'Speaking' | 'Mixed';
export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export interface TestMetadata {
    title: string;
    type: TestType;
    skill: TestSkill;
    duration: number;
    difficulty: Difficulty;
    description: string;
    tags: string[];
    targetBand: string;
    estimatedScore: string;
}

export const TEST_TYPES = ['IELTS', 'TOEFL', 'Custom', 'College Entrance'] as const;
export const TEST_SKILLS = ['Reading', 'Listening', 'Writing', 'Speaking', 'Mixed'] as const;

export const getTestTypeOptions = () => TEST_TYPES;

export const getDefaultDuration = (type: TestType, skill: TestSkill): number => {
    if (type === 'IELTS') {
        if (skill === 'Reading') return 60;
        if (skill === 'Listening') return 30;
        if (skill === 'Writing') return 60;
        if (skill === 'Speaking') return 15;
    }
    if (type === 'TOEFL') {
        if (skill === 'Reading') return 54;
        if (skill === 'Listening') return 41;
        if (skill === 'Writing') return 50;
        if (skill === 'Speaking') return 17;
    }
    return 60; // Default
};

/**
 * Returns the route for specialized test builders.
 * If null, use the default builder.
 */
export const getSpecialRoute = (type: TestType, skill: TestSkill): string | null => {
    // Only Listening has a specialized builder for now (as per documentation)
    if (skill !== 'Reading') {
        return `/create-test?skill=${skill}`;
    }
    return null;
};
