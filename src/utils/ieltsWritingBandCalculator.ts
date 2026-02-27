/**
 * IELTS Writing Band Score Calculator
 * 
 * PRD-0030 §4.1.3: Official IELTS rounding rules
 * 
 * Rules:
 * 1. Each criterion scored as WHOLE NUMBER (0-9, no decimals)
 * 2. Per-task band = average of 4 criteria, rounded DOWN to nearest 0.5
 *    - 6.25 → 6.0, 6.5 → 6.5, 6.75 → 6.5, 7.0 → 7.0
 * 3. Overall Writing band (Full Test):
 *    - = (Task1Band × 1/3) + (Task2Band × 2/3)
 *    - Rounded: from 0.25 up → next 0.5. Below 0.25 → round down.
 *    - 6.25 → 6.5, 6.24 → 6.0, 6.75 → 7.0, 6.0 → 6.0
 * 4. Task 1 only or Task 2 only: overall = that task's band (no weighting)
 * 5. Voided task: excluded from calculation entirely
 *    - Full Test with Task 1 voided: overall = Task 2 band only
 * 
 * Task 1 uses "Task Achievement" (TA) criterion
 * Task 2 uses "Task Response" (TR) criterion
 * Both share: CC, LR, GRA
 * 
 * @module utils/ieltsWritingBandCalculator
 */

import type { WritingTaskGradingResult, WritingTestFormat } from '../types/ielts-writing.types';

/**
 * Round DOWN to nearest 0.5
 * Used for per-task band calculation.
 * 
 * @example
 * roundDownToHalf(6.25)  // → 6.0
 * roundDownToHalf(6.5)   // → 6.5
 * roundDownToHalf(6.75)  // → 6.5
 * roundDownToHalf(7.0)   // → 7.0
 */
export function roundDownToHalf(value: number): number {
    return Math.floor(value * 2) / 2;
}

/**
 * Round with IELTS overall rule (>=0.25 above rounds UP to next 0.5)
 * Used for overall writing band calculation.
 * 
 * @example
 * roundOverallBand(6.25)  // → 6.5
 * roundOverallBand(6.24)  // → 6.0
 * roundOverallBand(6.75)  // → 7.0
 * roundOverallBand(6.0)   // → 6.0
 */
export function roundOverallBand(value: number): number {
    const lower = Math.floor(value * 2) / 2;
    const remainder = value - lower;
    return remainder >= 0.25 ? lower + 0.5 : lower;
}

/**
 * Calculate per-task band score from the 4 criteria scores.
 * Average of TA/TR + CC + LR + GRA, rounded DOWN to nearest 0.5.
 * 
 * @param scores - The 4 criteria scores (TA for Task 1, TR for Task 2)
 * @returns Task band score (0.0 to 9.0, in 0.5 increments)
 * 
 * @example
 * calculateTaskBand({ TA: 7, CC: 6, LR: 7, GRA: 5 })
 * // avg = (7+6+7+5)/4 = 6.25 → roundDown → 6.0
 */
export function calculateTaskBand(scores: {
    TA?: number; TR?: number; CC: number; LR: number; GRA: number;
}): number {
    const taskResponse = scores.TA ?? scores.TR ?? 0;
    const avg = (taskResponse + scores.CC + scores.LR + scores.GRA) / 4;
    return roundDownToHalf(avg);
}

/**
 * Calculate overall writing band from per-task grading results.
 * 
 * - Single task (task1-only or task2-only): overall = that task's band
 * - Full test: weighted average (Task 1 × 1/3 + Task 2 × 2/3), rounded per IELTS rules
 * - Voided tasks are excluded entirely
 * - All tasks voided: returns 0
 * 
 * @param tasks - Per-task grading results
 * @param format - Test format (determines weighting)
 * @returns Overall band score
 * 
 * @example
 * // Full test: Task1=6.0, Task2=7.0
 * // weighted = 6.0×1/3 + 7.0×2/3 = 2.0 + 4.667 = 6.667
 * // roundOverall(6.667) → 6.5 (remainder 0.167 < 0.25)
 */
export function calculateOverallBand(
    tasks: WritingTaskGradingResult[],
    format: WritingTestFormat  // kept for API signature; weighting is determined by task count
): number {
    const validTasks = tasks.filter(t => !t.isVoided);
    if (validTasks.length === 0) return 0;
    if (validTasks.length === 1) return validTasks[0].taskBand;

    // Full test: weighted average
    const task1 = validTasks.find(t => t.taskNumber === 1);
    const task2 = validTasks.find(t => t.taskNumber === 2);
    if (task1 && task2) {
        const weighted = (task1.taskBand * 1 / 3) + (task2.taskBand * 2 / 3);
        return roundOverallBand(weighted);
    }
    return validTasks[0].taskBand;
}
