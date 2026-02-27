/**
 * Learning Service for IELTS Reading Test Creation
 * 
 * Stores and analyzes teacher corrections to improve AI and rules-based
 * classification accuracy over time. Uses Firestore for persistent storage.
 * 
 * Features:
 * - Log corrections when teachers override AI/rules decisions
 * - Aggregate correction patterns by question type
 * - Expose patterns for weighted scoring in type classifier
 * - Support for analytics dashboard
 * 
 * @module learning.service
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 7
 */

import {
    collection,
    doc,
    setDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    Timestamp,
    serverTimestamp,
    getCountFromServer,
} from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from '../firebase';
import type { QuestionType } from '../../types/QuestionSchema';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Correction source - who made the original classification
 */
export type CorrectionSource = 'ai' | 'rules' | 'consensus';

/**
 * A single correction log entry
 */
export interface CorrectionLog {
    /** Unique ID for this correction */
    id: string;

    /** Original question type before correction */
    originalType: QuestionType;

    /** Corrected question type (teacher's choice) */
    correctedType: QuestionType;

    /** Source of the original classification */
    source: CorrectionSource;

    /** AI confidence when correction was made */
    aiConfidence?: number;

    /** Rules confidence when correction was made */
    rulesConfidence?: number;

    /** Question text (for pattern analysis) */
    questionText: string;

    /** Instruction/section text (for context analysis) */
    instructionText?: string;

    /** Teacher who made the correction */
    teacherId: string;

    /** Timestamp when correction was logged */
    timestamp: Timestamp;

    /** Optional notes from teacher */
    notes?: string;
}

/**
 * Input for logging a correction
 */
export interface CorrectionInput {
    originalType: QuestionType;
    correctedType: QuestionType;
    source: CorrectionSource;
    aiConfidence?: number;
    rulesConfidence?: number;
    questionText: string;
    instructionText?: string;
    teacherId: string;
    notes?: string;
}

/**
 * Correction pattern aggregated by type pair
 */
export interface CorrectionPattern {
    /** Original type that was frequently corrected */
    originalType: QuestionType;

    /** Most common correction target */
    correctedType: QuestionType;

    /** Number of times this correction occurred */
    count: number;

    /** Percentage of all corrections of originalType */
    frequency: number;

    /** Common keywords in question texts that led to this correction */
    commonKeywords: string[];

    /** Suggested confidence adjustment for this pattern */
    confidenceAdjustment: number;
}

/**
 * Aggregate stats for a question type
 */
export interface TypeCorrectionStats {
    /** The question type */
    type: QuestionType;

    /** Total times this type was originally classified */
    totalClassifications: number;

    /** Total times this type was corrected to something else */
    correctedAwayCount: number;

    /** Total times other types were corrected TO this type */
    correctedToCount: number;

    /** Correction rate (correctedAway / total) */
    correctionRate: number;

    /** Most common original types when corrected to this type */
    commonOriginalTypes: { type: QuestionType; count: number }[];
}

/**
 * Dashboard analytics summary
 */
export interface CorrectionAnalytics {
    /** Total corrections logged */
    totalCorrections: number;

    /** Corrections by source */
    bySource: {
        ai: number;
        rules: number;
        consensus: number;
    };

    /** Top 5 most frequent correction pairs */
    topPatterns: CorrectionPattern[];

    /** Types with highest correction rates */
    problematicTypes: TypeCorrectionStats[];

    /** Date range of the data */
    dateRange: {
        from: Timestamp;
        to: Timestamp;
    };
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const COLLECTION_NAME = 'correctionLogs';

/** Minimum corrections needed to form a pattern */
const MIN_PATTERN_COUNT = 3;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum patterns to return */
const MAX_PATTERNS = 50;

// ═══════════════════════════════════════════════════════════════
// LEARNING SERVICE
// ═══════════════════════════════════════════════════════════════

/**
 * Learning Service
 * 
 * Manages correction logging and pattern analysis for improving
 * question type classification accuracy.
 */
class LearningService {
    private patternCache: Map<QuestionType, CorrectionPattern[]> = new Map();
    private cacheTimestamp: number = 0;

    // ─────────────────────────────────────────────────────────────
    // CORRECTION LOGGING
    // ─────────────────────────────────────────────────────────────

    /**
     * Log a correction made by a teacher
     * 
     * @param input - Correction details
     * @returns The ID of the logged correction
     */
    async logCorrection(input: CorrectionInput): Promise<string> {
        try {
            const docRef = doc(collection(db, COLLECTION_NAME));

            const correction: CorrectionLog = {
                id: docRef.id,
                originalType: input.originalType,
                correctedType: input.correctedType,
                source: input.source,
                aiConfidence: input.aiConfidence,
                rulesConfidence: input.rulesConfidence,
                questionText: input.questionText,
                instructionText: input.instructionText,
                teacherId: input.teacherId,
                notes: input.notes,
                timestamp: serverTimestamp() as Timestamp,
            };

            await setDoc(docRef, correction);

            // Invalidate cache since we have new data
            this.invalidateCache();

            console.log(`[LearningService] Logged correction: ${input.originalType} → ${input.correctedType}`);
            return docRef.id;
        } catch (error) {
            console.error('[LearningService] Error logging correction:', error);
            throw new Error('Failed to log correction');
        }
    }

    /**
     * Log multiple corrections at once (batch operation)
     * 
     * @param inputs - Array of correction inputs
     * @returns Array of logged correction IDs
     */
    async logCorrections(inputs: CorrectionInput[]): Promise<string[]> {
        const ids: string[] = [];

        // Log each correction sequentially to avoid race conditions
        for (const input of inputs) {
            const id = await this.logCorrection(input);
            ids.push(id);
        }

        return ids;
    }

    // ─────────────────────────────────────────────────────────────
    // PATTERN RETRIEVAL
    // ─────────────────────────────────────────────────────────────

    /**
     * Get correction patterns for a specific question type
     * 
     * Returns patterns where the given type was frequently corrected
     * to other types, along with confidence adjustments.
     * 
     * @param questionType - The question type to get patterns for
     * @returns Array of correction patterns
     */
    async getCorrectionPatterns(questionType: QuestionType): Promise<CorrectionPattern[]> {
        // Check cache first
        if (this.isCacheValid() && this.patternCache.has(questionType)) {
            return this.patternCache.get(questionType)!;
        }

        try {
            // Query corrections where this type was the original
            const q = query(
                collection(db, COLLECTION_NAME),
                where('originalType', '==', questionType),
                orderBy('timestamp', 'desc'),
                limit(500) // Reasonable limit for analysis
            );

            const snapshot = await getDocs(q);
            const corrections: CorrectionLog[] = snapshot.docs.map(
                doc => doc.data() as CorrectionLog
            );

            // Aggregate into patterns
            const patterns = this.aggregatePatterns(corrections, questionType);

            // Cache the result
            this.patternCache.set(questionType, patterns);
            this.cacheTimestamp = Date.now();

            return patterns;
        } catch (error) {
            console.error('[LearningService] Error fetching patterns:', error);
            return [];
        }
    }

    /**
     * Get all correction patterns across all types
     * 
     * @returns Array of all correction patterns sorted by frequency
     */
    async getAllPatterns(): Promise<CorrectionPattern[]> {
        try {
            const q = query(
                collection(db, COLLECTION_NAME),
                orderBy('timestamp', 'desc'),
                limit(1000)
            );

            const snapshot = await getDocs(q);
            const corrections: CorrectionLog[] = snapshot.docs.map(
                doc => doc.data() as CorrectionLog
            );

            // Group by original type and aggregate
            const allPatterns: CorrectionPattern[] = [];
            const byOriginalType = this.groupBy(corrections, 'originalType');

            for (const [originalType, typeCorrections] of Object.entries(byOriginalType)) {
                const patterns = this.aggregatePatterns(
                    typeCorrections,
                    originalType as QuestionType
                );
                allPatterns.push(...patterns);
            }

            // Sort by count descending
            allPatterns.sort((a, b) => b.count - a.count);

            return allPatterns.slice(0, MAX_PATTERNS);
        } catch (error) {
            console.error('[LearningService] Error fetching all patterns:', error);
            return [];
        }
    }

    // ─────────────────────────────────────────────────────────────
    // STATS & ANALYTICS
    // ─────────────────────────────────────────────────────────────

    /**
     * Get aggregate stats for a question type
     * 
     * @param questionType - The type to get stats for
     * @returns Stats including correction rate and common patterns
     */
    async getTypeStats(questionType: QuestionType): Promise<TypeCorrectionStats> {
        try {
            // Get corrections FROM this type
            const fromQuery = query(
                collection(db, COLLECTION_NAME),
                where('originalType', '==', questionType)
            );

            // Get corrections TO this type
            const toQuery = query(
                collection(db, COLLECTION_NAME),
                where('correctedType', '==', questionType)
            );

            const [fromSnapshot, toSnapshot] = await Promise.all([
                getDocs(fromQuery),
                getDocs(toQuery),
            ]);

            const correctedAwayCount = fromSnapshot.size;
            const correctedToCount = toSnapshot.size;

            // Calculate common original types when corrected TO this type
            const toCorrections: CorrectionLog[] = toSnapshot.docs.map(
                doc => doc.data() as CorrectionLog
            );
            const originalTypeCounts = this.countBy(toCorrections, 'originalType');
            const commonOriginalTypes = Object.entries(originalTypeCounts)
                .map(([type, count]) => ({ type: type as QuestionType, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            // Note: totalClassifications would need to be tracked separately
            // For now, we estimate based on corrections
            const totalClassifications = correctedAwayCount + correctedToCount;
            const correctionRate = totalClassifications > 0
                ? correctedAwayCount / totalClassifications
                : 0;

            return {
                type: questionType,
                totalClassifications,
                correctedAwayCount,
                correctedToCount,
                correctionRate,
                commonOriginalTypes,
            };
        } catch (error) {
            console.error('[LearningService] Error fetching type stats:', error);
            return {
                type: questionType,
                totalClassifications: 0,
                correctedAwayCount: 0,
                correctedToCount: 0,
                correctionRate: 0,
                commonOriginalTypes: [],
            };
        }
    }

    /**
     * Get correction analytics for admin dashboard
     * 
     * @param days - Number of days to include (default: 30)
     * @returns Analytics summary
     */
    async getAnalytics(days: number = 30): Promise<CorrectionAnalytics> {
        try {
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - days);
            const fromTimestamp = Timestamp.fromDate(fromDate);

            const q = query(
                collection(db, COLLECTION_NAME),
                where('timestamp', '>=', fromTimestamp),
                orderBy('timestamp', 'desc')
            );

            const snapshot = await getDocs(q);
            const corrections: CorrectionLog[] = snapshot.docs.map(
                doc => doc.data() as CorrectionLog
            );

            // Count by source
            const bySource = {
                ai: 0,
                rules: 0,
                consensus: 0,
            };
            for (const c of corrections) {
                bySource[c.source]++;
            }

            // Get top patterns
            const byOriginalType = this.groupBy(corrections, 'originalType');
            const allPatterns: CorrectionPattern[] = [];

            for (const [originalType, typeCorrections] of Object.entries(byOriginalType)) {
                const patterns = this.aggregatePatterns(
                    typeCorrections,
                    originalType as QuestionType
                );
                allPatterns.push(...patterns);
            }

            allPatterns.sort((a, b) => b.count - a.count);
            const topPatterns = allPatterns.slice(0, 5);

            // Get problematic types (highest correction rates)
            const typeStats: TypeCorrectionStats[] = [];
            const uniqueTypes = new Set(corrections.map(c => c.originalType));

            for (const type of uniqueTypes) {
                const stats = await this.getTypeStats(type);
                if (stats.correctionRate > 0.1) { // More than 10% correction rate
                    typeStats.push(stats);
                }
            }

            typeStats.sort((a, b) => b.correctionRate - a.correctionRate);

            // Determine date range
            const timestamps = corrections
                .map(c => c.timestamp)
                .filter(t => t !== null && t !== undefined);

            return {
                totalCorrections: corrections.length,
                bySource,
                topPatterns,
                problematicTypes: typeStats.slice(0, 5),
                dateRange: {
                    from: timestamps[timestamps.length - 1] || fromTimestamp,
                    to: timestamps[0] || Timestamp.now(),
                },
            };
        } catch (error) {
            console.error('[LearningService] Error fetching analytics:', error);
            return {
                totalCorrections: 0,
                bySource: { ai: 0, rules: 0, consensus: 0 },
                topPatterns: [],
                problematicTypes: [],
                dateRange: {
                    from: Timestamp.now(),
                    to: Timestamp.now(),
                },
            };
        }
    }

    /**
     * Get total correction count
     */
    async getTotalCorrectionCount(): Promise<number> {
        try {
            const coll = collection(db, COLLECTION_NAME);
            const snapshot = await getCountFromServer(coll);
            return snapshot.data().count;
        } catch (error) {
            console.error('[LearningService] Error getting count:', error);
            return 0;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // CONFIDENCE ADJUSTMENT
    // ─────────────────────────────────────────────────────────────

    /**
     * Get confidence adjustment based on correction patterns
     * 
     * This can be used by the type classifier to adjust confidence
     * scores based on historical correction patterns.
     * 
     * @param originalType - The classified type
     * @returns Adjustment factor (negative if type is often corrected)
     */
    async getConfidenceAdjustment(originalType: QuestionType): Promise<number> {
        const patterns = await this.getCorrectionPatterns(originalType);

        if (patterns.length === 0) {
            return 0; // No adjustment if no patterns
        }

        // Calculate weighted adjustment based on pattern frequencies
        let totalAdjustment = 0;
        for (const pattern of patterns) {
            totalAdjustment += pattern.confidenceAdjustment * pattern.frequency;
        }

        return totalAdjustment;
    }

    // ─────────────────────────────────────────────────────────────
    // PRIVATE METHODS
    // ─────────────────────────────────────────────────────────────

    /**
     * Aggregate corrections into patterns
     */
    private aggregatePatterns(
        corrections: CorrectionLog[],
        originalType: QuestionType
    ): CorrectionPattern[] {
        // Group by corrected type
        const byCorrectedType = this.groupBy(corrections, 'correctedType');
        const patterns: CorrectionPattern[] = [];
        const total = corrections.length;

        for (const [correctedType, typeCorrections] of Object.entries(byCorrectedType)) {
            const count = typeCorrections.length;

            // Skip if below minimum threshold
            if (count < MIN_PATTERN_COUNT) continue;

            // Extract common keywords from question texts
            const keywords = this.extractCommonKeywords(
                typeCorrections.map(c => c.questionText)
            );

            // Calculate frequency as percentage
            const frequency = total > 0 ? count / total : 0;

            // Calculate confidence adjustment
            // Negative adjustment proportional to how often this mistake is made
            const confidenceAdjustment = -Math.round(frequency * 20);

            patterns.push({
                originalType,
                correctedType: correctedType as QuestionType,
                count,
                frequency,
                commonKeywords: keywords,
                confidenceAdjustment,
            });
        }

        // Sort by count descending
        patterns.sort((a, b) => b.count - a.count);

        return patterns;
    }

    /**
     * Extract common keywords from a set of texts
     */
    private extractCommonKeywords(texts: string[]): string[] {
        // Common IELTS keywords that indicate question types
        const keywordPatterns = [
            'TRUE', 'FALSE', 'NOT GIVEN', 'YES', 'NO',
            'match', 'heading', 'paragraph', 'complete',
            'fill', 'blank', 'choose', 'select', 'multiple',
            'diagram', 'flowchart', 'table', 'summary', 'note',
            'sentence', 'ending', 'information', 'feature',
        ];

        const keywordCounts: Record<string, number> = {};

        for (const text of texts) {
            const lowerText = text.toLowerCase();
            for (const keyword of keywordPatterns) {
                if (lowerText.includes(keyword.toLowerCase())) {
                    keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
                }
            }
        }

        // Return keywords that appear in at least 30% of texts
        const threshold = texts.length * 0.3;
        return Object.entries(keywordCounts)
            .filter(([, count]) => count >= threshold)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([keyword]) => keyword);
    }

    /**
     * Group array by a key
     */
    private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
        return array.reduce((groups, item) => {
            const value = String(item[key]);
            groups[value] = groups[value] || [];
            groups[value].push(item);
            return groups;
        }, {} as Record<string, T[]>);
    }

    /**
     * Count occurrences by a key
     */
    private countBy<T>(array: T[], key: keyof T): Record<string, number> {
        return array.reduce((counts, item) => {
            const value = String(item[key]);
            counts[value] = (counts[value] || 0) + 1;
            return counts;
        }, {} as Record<string, number>);
    }

    /**
     * Check if cache is still valid
     */
    private isCacheValid(): boolean {
        return Date.now() - this.cacheTimestamp < CACHE_TTL_MS;
    }

    /**
     * Invalidate all cached patterns
     */
    private invalidateCache(): void {
        this.patternCache.clear();
        this.cacheTimestamp = 0;
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════

/**
 * Singleton instance of LearningService
 */
export const learningService = new LearningService();

/**
 * Re-export class for testing
 */
export { LearningService };

/**
 * Constants for testing
 */
export const LEARNING_CONSTANTS = {
    COLLECTION_NAME,
    MIN_PATTERN_COUNT,
    CACHE_TTL_MS,
    MAX_PATTERNS,
};
