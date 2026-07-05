// @ts-nocheck
/**
 * studentStreakService.ts
 * 
 * Service for tracking student practice streaks.
 * Tracks consecutive days where student completed at least one self-study activity.
 * 
 * Per PRD-0016, Task 7.4:
 * - Track consecutive days with self-study
 * - Display streak count in dashboard
 * - Streak badge in profile
 * 
 * @module services/studentStreakService
 */

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { withRestoreGuard } from './restoreGuard';

// ============================================================================
// TYPES
// ============================================================================

export interface StreakData {
    /** Student ID */
    studentId: string;
    /** Current active streak (consecutive days) */
    currentStreak: number;
    /** Longest streak ever achieved */
    longestStreak: number;
    /** Last activity date (YYYY-MM-DD format) */
    lastActivityDate: string;
    /** Total days with activity */
    totalActiveDays: number;
    /** Activity history (last 30 days, for calendar view) */
    recentActivity: {
        date: string;
        count: number;
    }[];
    /** When streak was last updated */
    updatedAt: number;
    /** When streak record was created */
    createdAt: number;
}

export interface StreakBadge {
    id: string;
    name: string;
    description: string;
    icon: string;
    minStreak: number;
    color: string;
}

export interface StreakSummary {
    currentStreak: number;
    longestStreak: number;
    totalActiveDays: number;
    badge: StreakBadge | null;
    isActiveToday: boolean;
    streakAtRisk: boolean; // True if no activity today and had streak yesterday
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STREAK_COLLECTION = 'student_streaks';
const MAX_RECENT_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Streak badges based on consecutive days
 */
export const STREAK_BADGES: StreakBadge[] = [
    {
        id: 'newcomer',
        name: 'First Steps',
        description: 'Started your learning journey',
        icon: '🌱',
        minStreak: 1,
        color: 'green'
    },
    {
        id: 'committed',
        name: 'Getting Committed',
        description: '3 days of consistent practice',
        icon: '⭐',
        minStreak: 3,
        color: 'blue'
    },
    {
        id: 'dedicated',
        name: 'Dedicated Learner',
        description: '7 days streak achieved',
        icon: '🔥',
        minStreak: 7,
        color: 'orange'
    },
    {
        id: 'unstoppable',
        name: 'Unstoppable',
        description: '14 days of daily practice',
        icon: '💪',
        minStreak: 14,
        color: 'red'
    },
    {
        id: 'legend',
        name: 'Learning Legend',
        description: '30 days streak - Incredible dedication!',
        icon: '👑',
        minStreak: 30,
        color: 'yellow'
    },
    {
        id: 'master',
        name: 'Streak Master',
        description: '100 days of continuous learning',
        icon: '🏆',
        minStreak: 100,
        color: 'violet'
    }
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 */
function getTodayDateString(): string {
    const now = new Date();
    return formatDateString(now);
}

/**
 * Format a date to YYYY-MM-DD string
 */
function formatDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Get yesterday's date string
 */
function getYesterdayDateString(): string {
    const yesterday = new Date(Date.now() - MS_PER_DAY);
    return formatDateString(yesterday);
}

/**
 * Check if two dates are consecutive
 */
function areConsecutiveDays(date1: string, date2: string): boolean {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffMs = Math.abs(d2.getTime() - d1.getTime());
    const diffDays = Math.round(diffMs / MS_PER_DAY);
    return diffDays === 1;
}

/**
 * Get the appropriate badge for a streak count
 */
export function getBadgeForStreak(streakCount: number): StreakBadge | null {
    // Get the highest badge the user qualifies for
    const qualifyingBadges = STREAK_BADGES.filter(b => streakCount >= b.minStreak);
    if (qualifyingBadges.length === 0) return null;

    return qualifyingBadges[qualifyingBadges.length - 1];
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get streak data for a student
 */
export async function getStreakData(studentId: string): Promise<StreakData | null> {
    try {
        const streakRef = doc(db, STREAK_COLLECTION, studentId);
        const streakSnap = await getDoc(streakRef);

        if (!streakSnap.exists()) {
            return null;
        }

        return streakSnap.data() as StreakData;
    } catch (error) {
        console.error('Error getting streak data:', error);
        return null;
    }
}

/**
 * Initialize streak data for a new student
 */
export async function initializeStreakData(studentId: string): Promise<StreakData> {
    const initialData: StreakData = {
        studentId,
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: '',
        totalActiveDays: 0,
        recentActivity: [],
        updatedAt: Date.now(),
        createdAt: Date.now()
    };

    try {
        const streakRef = doc(db, STREAK_COLLECTION, studentId);
        await setDoc(streakRef, initialData);
        return initialData;
    } catch (error) {
        console.error('Error initializing streak data:', error);
        throw error;
    }
}

export const recordActivity = withRestoreGuard(
    'Streak',
    // Return a dummy no-op StreakData when restore is in progress
    { studentId: '', currentStreak: 0, longestStreak: 0, lastActivityDate: '', totalActiveDays: 0, recentActivity: [], updatedAt: 0, createdAt: 0 } as StreakData
)(async function _recordActivity(studentId: string): Promise<StreakData> {
    try {
        let streakData = await getStreakData(studentId);

        // Initialize if doesn't exist
        if (!streakData) {
            streakData = await initializeStreakData(studentId);
        }

        const today = getTodayDateString();
        const yesterday = getYesterdayDateString();

        // Check if already recorded today
        if (streakData.lastActivityDate === today) {
            // Just increment today's count in recent activity
            const todayEntry = streakData.recentActivity.find(a => a.date === today);
            if (todayEntry) {
                todayEntry.count++;
            }

            streakData.updatedAt = Date.now();

            const streakRef = doc(db, STREAK_COLLECTION, studentId);
            await updateDoc(streakRef, {
                recentActivity: streakData.recentActivity,
                updatedAt: streakData.updatedAt
            });

            return streakData;
        }

        // Calculate new streak
        let newStreak: number;

        if (streakData.lastActivityDate === yesterday) {
            // Continue the streak
            newStreak = streakData.currentStreak + 1;
        } else if (streakData.lastActivityDate === '') {
            // First activity ever
            newStreak = 1;
        } else {
            // Streak broken, start fresh
            newStreak = 1;
        }

        // Update longest streak if needed
        const newLongestStreak = Math.max(newStreak, streakData.longestStreak);

        // Update recent activity
        const recentActivity = [...streakData.recentActivity];

        // Add today
        const existingTodayIndex = recentActivity.findIndex(a => a.date === today);
        if (existingTodayIndex >= 0) {
            recentActivity[existingTodayIndex].count++;
        } else {
            recentActivity.push({ date: today, count: 1 });
        }

        // Keep only last 30 days
        const cutoffDate = new Date(Date.now() - MAX_RECENT_DAYS * MS_PER_DAY);
        const cutoffDateString = formatDateString(cutoffDate);
        const filteredActivity = recentActivity.filter(a => a.date >= cutoffDateString);

        // Sort by date
        filteredActivity.sort((a, b) => a.date.localeCompare(b.date));

        // Update streak data
        const updatedData: StreakData = {
            ...streakData,
            currentStreak: newStreak,
            longestStreak: newLongestStreak,
            lastActivityDate: today,
            totalActiveDays: streakData.totalActiveDays + 1,
            recentActivity: filteredActivity,
            updatedAt: Date.now()
        };

        const streakRef = doc(db, STREAK_COLLECTION, studentId);
        await updateDoc(streakRef, updatedData);

        return updatedData;
    } catch (error) {
        console.error('Error recording activity:', error);
        throw error;
    }
});

/**
 * Get streak summary for dashboard display
 */
export async function getStreakSummary(studentId: string): Promise<StreakSummary> {
    const streakData = await getStreakData(studentId);

    if (!streakData) {
        return {
            currentStreak: 0,
            longestStreak: 0,
            totalActiveDays: 0,
            badge: null,
            isActiveToday: false,
            streakAtRisk: false
        };
    }

    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();
    const isActiveToday = streakData.lastActivityDate === today;

    // Streak is at risk if:
    // 1. They have a streak (> 0)
    // 2. They haven't practiced today
    // 3. They practiced yesterday (so streak would break tomorrow)
    const streakAtRisk =
        streakData.currentStreak > 0 &&
        !isActiveToday &&
        streakData.lastActivityDate === yesterday;

    // If not active today and didn't practice yesterday, streak is already broken
    let effectiveStreak = streakData.currentStreak;
    if (!isActiveToday && streakData.lastActivityDate !== yesterday) {
        effectiveStreak = 0;
    }

    return {
        currentStreak: effectiveStreak,
        longestStreak: streakData.longestStreak,
        totalActiveDays: streakData.totalActiveDays,
        badge: getBadgeForStreak(effectiveStreak),
        isActiveToday,
        streakAtRisk
    };
}

/**
 * Get recent activity for calendar/heatmap display
 */
export async function getRecentActivity(
    studentId: string,
    days: number = 30
): Promise<{ date: string; count: number }[]> {
    const streakData = await getStreakData(studentId);

    if (!streakData) {
        return [];
    }

    // Generate all dates for the range
    const result: { date: string; count: number }[] = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today.getTime() - i * MS_PER_DAY);
        const dateString = formatDateString(date);
        const existing = streakData.recentActivity.find(a => a.date === dateString);

        result.push({
            date: dateString,
            count: existing?.count || 0
        });
    }

    return result;
}

/**
 * Check and update streak status (call on app load)
 * This handles the case where a streak may have been broken while offline
 */
export async function checkStreakStatus(studentId: string): Promise<StreakSummary> {
    const streakData = await getStreakData(studentId);

    if (!streakData) {
        // Initialize for new users
        await initializeStreakData(studentId);
        return getStreakSummary(studentId);
    }

    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();

    // If last activity was not today or yesterday, streak is broken
    if (
        streakData.lastActivityDate !== today &&
        streakData.lastActivityDate !== yesterday &&
        streakData.currentStreak > 0
    ) {
        // Reset streak
        const streakRef = doc(db, STREAK_COLLECTION, studentId);
        await updateDoc(streakRef, {
            currentStreak: 0,
            updatedAt: Date.now()
        });
    }

    return getStreakSummary(studentId);
}

export default {
    getStreakData,
    recordActivity,
    getStreakSummary,
    getRecentActivity,
    checkStreakStatus,
    getBadgeForStreak,
    STREAK_BADGES
};
