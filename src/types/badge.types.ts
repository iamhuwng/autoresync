/**
 * Badge System Types
 * 
 * Defines types for gamification badges including badge types,
 * badge data structures, and badge definitions.
 */

/**
 * Badge Types Enum
 * 
 * All available badge types in the system
 */
export enum BadgeType {
    /** Earned on first test submission */
    FIRST_TEST = 'FIRST_TEST',

    /** Earned on achieving 100% score */
    PERFECT_SCORE = 'PERFECT_SCORE',

    /** Earned on 5-day study streak */
    ON_FIRE = 'ON_FIRE',

    /** Earned on completing all tests in a module */
    MODULE_MASTER = 'MODULE_MASTER',

    /** Earned on completing entire course */
    COURSE_CHAMPION = 'COURSE_CHAMPION',

    /** Earned on 20%+ improvement on same test */
    IMPROVEMENT_STAR = 'IMPROVEMENT_STAR'
}

/**
 * Badge Interface
 * 
 * Represents an earned badge instance
 */
export interface Badge {
    /** Badge type identifier */
    type: BadgeType;

    /** Timestamp when badge was earned (milliseconds since epoch) */
    earnedAt: number;

    /** Optional course ID if badge is course-specific */
    courseId?: string;

    /** Optional test ID if badge is test-specific */
    testId?: string;

    /** Optional module ID if badge is module-specific */
    moduleId?: string;

    /** Unique badge ID (Firebase generated) */
    id?: string;
}

/**
 * Badge Definition Interface
 * 
 * Describes badge metadata and display information
 */
export interface BadgeDefinition {
    /** Badge type identifier */
    type: BadgeType;

    /** Human-readable badge name */
    name: string;

    /** Badge description explaining how to earn it */
    description: string;

    /** Criteria for earning this badge */
    criteria: string;

    /** Icon component name (e.g., 'IconTrophy', 'IconFlame') */
    iconComponent: string;

    /** Icon color (hex or Mantine color name) */
    iconColor: string;

    /** Badge rarity level */
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

/**
 * Badge Definitions
 * 
 * Metadata for all available badges
 */
export const BADGE_DEFINITIONS: Record<BadgeType, BadgeDefinition> = {
    [BadgeType.FIRST_TEST]: {
        type: BadgeType.FIRST_TEST,
        name: 'First Steps',
        description: 'Complete your first test',
        criteria: 'Submit your first test result',
        iconComponent: 'IconRocket',
        iconColor: 'blue',
        rarity: 'common'
    },

    [BadgeType.PERFECT_SCORE]: {
        type: BadgeType.PERFECT_SCORE,
        name: 'Perfect Score',
        description: 'Score 100% on any test',
        criteria: 'Achieve a perfect score of 100%',
        iconComponent: 'IconStar',
        iconColor: 'yellow',
        rarity: 'rare'
    },

    [BadgeType.ON_FIRE]: {
        type: BadgeType.ON_FIRE,
        name: 'On Fire',
        description: 'Study for 5 consecutive days',
        criteria: 'Complete tests on 5 consecutive days',
        iconComponent: 'IconFlame',
        iconColor: 'orange',
        rarity: 'epic'
    },

    [BadgeType.MODULE_MASTER]: {
        type: BadgeType.MODULE_MASTER,
        name: 'Module Master',
        description: 'Complete all tests in a module',
        criteria: 'Complete every test in a single module',
        iconComponent: 'IconCertificate',
        iconColor: 'grape',
        rarity: 'rare'
    },

    [BadgeType.COURSE_CHAMPION]: {
        type: BadgeType.COURSE_CHAMPION,
        name: 'Course Champion',
        description: 'Complete an entire course',
        criteria: 'Complete all modules in a course',
        iconComponent: 'IconTrophy',
        iconColor: 'gold',
        rarity: 'legendary'
    },

    [BadgeType.IMPROVEMENT_STAR]: {
        type: BadgeType.IMPROVEMENT_STAR,
        name: 'Rising Star',
        description: 'Improve by 20% or more',
        criteria: 'Improve your score by 20%+ on the same test',
        iconComponent: 'IconTrendingUp',
        iconColor: 'green',
        rarity: 'epic'
    }
};

/**
 * Badge Earning Context
 * 
 * Context information for badge earning checks
 */
export interface BadgeEarningContext {
    /** Student user ID */
    studentId: string;

    /** Test result ID that triggered the check */
    resultId: string;

    /** Test score percentage */
    score: number;

    /** Course ID if applicable */
    courseId?: string;

    /** Module ID if applicable */
    moduleId?: string;

    /** Test ID */
    testId?: string;

    /** Submission timestamp */
    submittedAt: number;
}

/**
 * Badge Check Result
 * 
 * Result of a badge earning check
 */
export interface BadgeCheckResult {
    /** Whether the badge was earned */
    earned: boolean;

    /** Badge data if earned */
    badge?: Badge;

    /** Reason if not earned (for debugging) */
    reason?: string;
}
