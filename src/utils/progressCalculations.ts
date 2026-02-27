
import { TestResultRecord } from '../services/testResults.service';

export interface ChartProgressData {
    date: string;
    timestamp: number;
    score: number;
    percentage: number;
    bandScore: number;
    testTitle: string;
}

interface SkillStats {
    skill: string;
    score: number; // Average percentage
    bandScore: number; // Average band score
    fullMark: number;
    count: number;
}

/**
 * Calculate the current study streak in days
 * A streak is defined as consecutive days with at least one test submission, counting backwards from today (or the most recent test).
 */
export function calculateStudyStreak(results: TestResultRecord[]): number {
    if (!results || results.length === 0) return 0;

    // Sort by date descending
    const sortedDates = results
        .map(r => new Date(r.submittedAt).setHours(0, 0, 0, 0))
        .sort((a, b) => b - a);

    // Remove duplicates
    const uniqueDates = Array.from(new Set(sortedDates));

    if (uniqueDates.length === 0) return 0;

    let streak = 0;

    const today = new Date().setHours(0, 0, 0, 0);
    const oneDay = 24 * 60 * 60 * 1000;

    // Check if first date is valid (today or yesterday)
    const firstDate = uniqueDates[0];
    if (firstDate === undefined || (today - firstDate > oneDay)) {
        return 0; // Streak broken if last test was more than 1 day ago
    }

    streak = 1; // Count the first day

    for (let i = 0; i < uniqueDates.length - 1; i++) {
        const current = uniqueDates[i];
        const next = uniqueDates[i + 1];

        if (current !== undefined && next !== undefined) {
            const diff = current - next;
            if (diff === oneDay) {
                streak++;
            } else {
                break;
            }
        }
    }

    return streak;
}

/**
 * Calculate performance breakdown by skill
 */
export function calculateSkillBreakdown(results: TestResultRecord[]): SkillStats[] {
    const skillsMap = new Map<string, SkillStats>();

    results.forEach(result => {
        // Default to 'General' if undefined, or handle specific types
        const skill = result.testSkill || result.testType || 'General';
        const normalizedSkill = skill.toLowerCase();

        const current = skillsMap.get(normalizedSkill) || {
            skill: normalizedSkill,
            score: 0,
            bandScore: 0,
            fullMark: 100, // Percentage based
            count: 0
        };

        current.score += result.percentage;
        current.bandScore += result.bandScore;
        current.count++;

        skillsMap.set(normalizedSkill, current);
    });

    return Array.from(skillsMap.values()).map(stat => ({
        skill: stat.skill,
        score: Math.round(stat.score / stat.count),
        bandScore: parseFloat((stat.bandScore / stat.count).toFixed(1)),
        fullMark: stat.fullMark,
        count: stat.count
    }));
}

/**
 * Calculate band score progression over time
 */
export function calculateBandProgression(results: TestResultRecord[]): ChartProgressData[] {
    // Sort by date ascending
    const sorted = [...results].sort((a, b) => a.submittedAt - b.submittedAt);

    return sorted.map(r => ({
        date: new Date(r.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        timestamp: r.submittedAt,
        score: r.percentage,
        percentage: r.percentage,
        bandScore: r.bandScore,
        testTitle: r.testTitle
    }));
}

/**
 * Calculate overall average score stats
 */
export function calculateAverageScore(results: TestResultRecord[]): { percentage: number; bandScore: number } {
    if (results.length === 0) return { percentage: 0, bandScore: 0 };

    const totalPercentage = results.reduce((sum, r) => sum + r.percentage, 0);
    const totalBand = results.reduce((sum, r) => sum + r.bandScore, 0);

    return {
        percentage: Math.round(totalPercentage / results.length),
        bandScore: parseFloat((totalBand / results.length).toFixed(1))
    };
}

/**
 * Find best performing test result
 */
export function findBestScore(results: TestResultRecord[]): TestResultRecord | null {
    if (results.length === 0) return null;

    // Tie-breaker: most recent date
    return results.reduce((best, current) => {
        if (current.percentage > best.percentage) return current;
        if (current.percentage === best.percentage) {
            return current.submittedAt > best.submittedAt ? current : best;
        }
        return best;
    });
}

/**
 * Calculate statistics for specific test types (Reading vs Listening, etc)
 */
export function calculateTypeStats(results: TestResultRecord[]) {
    const typeStats: { [key: string]: { total: number; count: number; avg: number } } = {
        reading: { total: 0, count: 0, avg: 0 },
        listening: { total: 0, count: 0, avg: 0 },
        writing: { total: 0, count: 0, avg: 0 },
        speaking: { total: 0, count: 0, avg: 0 }
    };

    results.forEach(r => {
        // PREFER testSkill, fallback to testType if needed (though types mismatch likely)
        const type = (r.testSkill || r.testType)?.toLowerCase();
        if (type && Object.prototype.hasOwnProperty.call(typeStats, type)) {
            const stats = typeStats[type];
            if (stats) {
                stats.total += r.percentage;
                stats.count++;
            }
        }
    });

    Object.keys(typeStats).forEach(key => {
        const item = typeStats[key];
        if (item) {
            item.avg = item.count > 0 ? Math.round(item.total / item.count) : 0;
        }
    });

    return typeStats;
}
