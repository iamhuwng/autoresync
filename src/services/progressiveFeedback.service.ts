import { get, ref, update } from 'firebase/database';
import { database } from './firebase';
import { withRestoreGuard } from './restoreGuard';
import { getResultsByStudent } from './academicRecordService';
import { executeGeminiWithKeyRotation } from './ai/gemini-key-rotation.service';
import type { EnhancedTestResultRecord } from '../types/results.types';
import type { ProgressiveFeedbackRecord, ProgressiveFeedbackSnapshot } from '../types/academicRecord.types';

type ProgressiveAIFeedback = {
    summary: string;
    progression: string;
    regression: string;
    repetition: string;
    advice: string;
};

const MAX_RESULTS_ANALYZED = 25;
const AUTO_REFRESH_MS = 5 * 24 * 60 * 60 * 1000;
const MANUAL_REFRESH_MS = 24 * 60 * 60 * 1000;

function clampScore(score: number): number {
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.min(100, score));
}

function average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function describeScoreBand(score: number): string {
    if (score >= 85) return 'showing strong control';
    if (score >= 70) return 'holding together with reasonable stability';
    if (score >= 55) return 'still uneven but beginning to settle';
    if (score >= 40) return 'still fragile and breaking under pressure';
    return 'still very unstable and needs careful rebuilding';
}

function describeSkillSet(skills: string[]): string {
    if (skills.length === 0) return 'your recent work';
    if (skills.length === 1) return skills[0];
    const lastSkill = skills[skills.length - 1] || 'your recent work';
    return `${skills.slice(0, -1).join(', ')} and ${lastSkill}`;
}

function normalizeSkillLabel(skill: string): string {
    const value = (skill || 'general').toLowerCase();
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function collectRecurringGaps(results: EnhancedTestResultRecord[]): string[] {
    const map = new Map<string, number>();

    results.forEach(result => {
        result.questionResults?.forEach(question => {
            const scoreRatio = question.maxScore > 0 ? question.score / question.maxScore : 0;
            if (scoreRatio >= 0.5) return;
            const key = question.questionType || 'general accuracy';
            map.set(key, (map.get(key) || 0) + 1);
        });
    });

    return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key, count]) => `${key} (${count} low-performance item${count !== 1 ? 's' : ''})`);
}

function buildSnapshot(results: EnhancedTestResultRecord[], windowStart: number, windowEnd: number): ProgressiveFeedbackSnapshot {
    const scores = results.map(result => clampScore(result.percentage || 0));
    const skillBuckets = new Map<string, number[]>();

    results.forEach(result => {
        const skill = result.testSkill || 'general';
        const bucket = skillBuckets.get(skill) || [];
        bucket.push(clampScore(result.percentage || 0));
        skillBuckets.set(skill, bucket);
    });

    const rankedSkills = Array.from(skillBuckets.entries())
        .map(([skill, values]) => ({ skill: normalizeSkillLabel(skill), score: average(values) }))
        .sort((a, b) => b.score - a.score);

    return {
        windowStart,
        windowEnd,
        testCount: results.length,
        averageScore: Math.round(average(scores)),
        strongestSkills: rankedSkills.slice(0, 2).map(entry => entry.skill),
        weakestSkills: rankedSkills.slice(-2).reverse().map(entry => entry.skill),
        recurringGaps: collectRecurringGaps(results),
    };
}

function summarizePositiveProgress(current: ProgressiveFeedbackSnapshot, previous: ProgressiveFeedbackSnapshot | null): string[] {
    const items: string[] = [];

    if (!previous) {
        if (current.strongestSkills.length > 0) {
            items.push(`Your current strongest area is ${current.strongestSkills.join(' and ')}.`);
        }
        return items;
    }

    const diff = current.averageScore - previous.averageScore;
    if (diff >= 5) {
        items.push(`Average score improved by ${diff} points compared with the previous 5-day window.`);
    }

    current.strongestSkills.forEach(skill => {
        if (!previous.strongestSkills.includes(skill)) {
            items.push(`${skill} has emerged as a stronger area in your recent work.`);
        }
    });

    return items.slice(0, 3);
}

function summarizeRegression(current: ProgressiveFeedbackSnapshot, previous: ProgressiveFeedbackSnapshot | null): string[] {
    if (!previous) return [];

    const items: string[] = [];
    const diff = current.averageScore - previous.averageScore;

    if (diff <= -5) {
        items.push(`Average score dropped by ${Math.abs(diff)} points compared with the previous 5-day window.`);
    }

    current.weakestSkills.forEach(skill => {
        if (!previous.weakestSkills.includes(skill)) {
            items.push(`${skill} is appearing more often as a weaker area in recent tests.`);
        }
    });

    return items.slice(0, 3);
}

function summarizeRepetition(current: ProgressiveFeedbackSnapshot): string[] {
    if (current.recurringGaps.length === 0) {
        return ['No single mistake pattern has repeated often enough to become a habit yet.'];
    }

    return current.recurringGaps.map(item => `${item} has appeared often enough to risk becoming a fixed habit if it is not corrected soon.`).slice(0, 3);
}

function summarizeCriticalGaps(current: ProgressiveFeedbackSnapshot): string[] {
    const gaps = current.recurringGaps.slice(0, 3);
    if (gaps.length > 0) return gaps;
    if (current.weakestSkills.length > 0) {
        return current.weakestSkills.map(skill => `${skill} needs closer review in the next study cycle.`).slice(0, 2);
    }
    return ['No critical gap detected yet; continue monitoring recent test patterns.'];
}

function buildDeterministicNarrative(
    current: ProgressiveFeedbackSnapshot,
    previous: ProgressiveFeedbackSnapshot | null,
    positives: string[],
    regressions: string[],
    repetitions: string[],
): { deterministicFeedback: string; narrative: ProgressiveAIFeedback; strengths: string[]; weaknesses: string[]; criticalGaps: string[] } {
    const strengths = current.strongestSkills.length > 0
        ? current.strongestSkills.map(skill => `${skill} is a current strength.`)
        : ['Your recent work is still building enough data to confirm a stable strength.'];

    const weaknesses = current.weakestSkills.length > 0
        ? current.weakestSkills.map(skill => `${skill} needs more targeted review.`)
        : ['No stable weak area has been identified yet.'];

    const criticalGaps = summarizeCriticalGaps(current);

    const strongestLabel = describeSkillSet(current.strongestSkills);
    const weakestLabel = describeSkillSet(current.weakestSkills);
    const repeatedGap = current.recurringGaps[0] || '';
    const scoreBand = describeScoreBand(current.averageScore);
    const scoreChange = previous ? current.averageScore - previous.averageScore : 0;

    const summary = current.testCount > 0
        ? `Your recent work is ${scoreBand}. What stands out most is that the problem is less about effort and more about whether the same level of understanding survives from one test to the next.`
        : 'There is not enough recent test data yet to describe a stable pattern, but each new result will make the guidance more precise.';

    const progression = positives[0]
        ? positives[0]
        : current.strongestSkills.length > 0
            ? `The more convincing part of this picture is in ${strongestLabel}, where your answers are starting to look more deliberate instead of lucky, which usually means the underlying thinking is beginning to settle.`
            : 'You are still in the stage of building a dependable strength, so the next priority is to make one area feel controlled and repeatable instead of uncertain.';

    const regression = regressions[0]
        ? `${regressions[0]} That kind of slide usually happens when a rule or question pattern is only half-secure, so it needs revisiting before it turns into a recurring weakness.`
        : current.weakestSkills.length > 0
            ? `The weaker side is still around ${weakestLabel}, where answers seem to become less accurate once pressure builds, and that is exactly where too many marks are leaking away.`
            : previous && scoreChange < 0
                ? `Even without one obvious weak category, the recent drop suggests that your control is not holding steadily enough yet, so accuracy needs to be rebuilt before confidence can be trusted.`
                : 'There is no dramatic collapse here, but the overall level is still too easy to disturb, which means accuracy has not become stable yet.';

    const repetition = repetitions[0]
        ? repeatedGap
            ? `One repeated pattern is especially worth stopping early: ${repeatedGap}. When the same miss keeps returning, it is usually a sign that the error is starting to fossilize into habit rather than staying a one-off mistake.`
            : repetitions[0]
        : 'No single repeated error is dominating yet, which is a good sign, but this is still the stage where careless mistakes can quietly settle into habit if they are not corrected quickly.';

    const advice = current.weakestSkills.length > 0
        ? `The next step is to slow down around ${weakestLabel}, review wrong answers closely enough to name the exact misunderstanding, and then practise that same pattern again until the correction feels repeatable rather than hopeful.`
        : 'The next step is to keep your practice steady, review every mistake closely, and turn correct thinking into something automatic rather than occasional.';

    const paragraph = `${summary} ${progression} ${regression} ${repetition} ${advice}`.replace(/\s+/g, ' ').trim();

    const deterministicFeedback = paragraph;

    return {
        deterministicFeedback,
        narrative: {
            summary: paragraph,
            progression,
            regression,
            repetition,
            advice,
        },
        strengths,
        weaknesses,
        criticalGaps,
    };
}

async function generateAIProgressiveNarrative(context: {
    current: ProgressiveFeedbackSnapshot;
    previous: ProgressiveFeedbackSnapshot | null;
    positives: string[];
    regressions: string[];
    repetitions: string[];
    deterministicNarrative: ProgressiveAIFeedback;
}): Promise<{ narrative: ProgressiveAIFeedback; model: string } | null> {
    try {
        const prompt = {
            current: context.current,
            previous: context.previous,
            positives: context.positives,
            regressions: context.regressions,
            repetitions: context.repetitions,
            deterministicNarrative: context.deterministicNarrative,
        };

        const rotationResult = await executeGeminiWithKeyRotation<{
            narrative: ProgressiveAIFeedback;
            model: string;
        }>({
            callerName: 'ProgressiveFeedback',
            exhaustedError: 'All Gemini keys exhausted',
            attempt: async ({ key, GoogleGenerativeAI }) => {
                const client = new GoogleGenerativeAI(key);
                const model = client.getGenerativeModel({
                    model: 'gemini-2.5-flash',
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 2048,
                        responseMimeType: 'application/json',
                    },
                });

                const result = await model.generateContent(
                    `You are an academic progress coach for a secondary-school student preparing for increasingly demanding English assessments.
Write in a warm, observant, deeply human coaching voice.
The student should feel understood, not processed.
Write as one natural paragraph for the summary field.
Do not write like a report.
Do not use rigid labels or robotic transitions.
Do not just name skill or task types without explaining what is actually going wrong or improving.
Use the patterns in the recent results to explain what seems to be getting stronger, what is slipping, and what is repeating enough to risk fossilizing into a habit.
When a weakness is mentioned, phrase it clearly in learning terms, not as a bare category name.
When a repeated mistake is mentioned, make it clear that it may become a bad habit if left uncorrected.
Offer guidance that feels calm, specific, and study-oriented.
Do not mention AI, models, data windows, or exam names.
Focus on patterns, changes, repeated mistakes, and the next best learning actions.
The tone should guide the student toward stronger foundations, better accuracy, and more stable performance under test conditions.
Return ONLY valid JSON with keys summary, progression, regression, repetition, advice.\n\n${JSON.stringify(prompt)}`
                );

                const text = result.response.text();
                if (!text) {
                    return { status: 'continue' };
                }

                const parsed = JSON.parse(text) as ProgressiveAIFeedback;
                if (!parsed.summary || !parsed.advice) {
                    return { status: 'continue' };
                }

                return {
                    status: 'success',
                    value: { narrative: parsed, model: 'gemini-2.5-flash' },
                };
            },
        });

        if (rotationResult.success && rotationResult.value) {
            return rotationResult.value;
        }

        return null;
    } catch {
        return null;
    }
}

function isDryProgressiveSummary(summary: string): boolean {
    if (!summary) return true;
    const normalized = summary.toLowerCase().trim();
    return (
        normalized.startsWith('over the last')
        || normalized.startsWith('in the last')
        || normalized.includes('tracked tests with an average score')
        || normalized.includes('you completed') && normalized.includes('average score')
    );
}

async function buildProgressiveFeedbackRecord(studentId: string, now: number): Promise<ProgressiveFeedbackRecord | null> {
    const allResults = await getResultsByStudent(studentId);
    const recentResults = [...allResults]
        .filter(result => !!result.submittedAt)
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .slice(0, MAX_RESULTS_ANALYZED);

    if (recentResults.length === 0) {
        return null;
    }

    const currentWindowStart = now - AUTO_REFRESH_MS;
    const currentWindowResults = recentResults.filter(result => result.submittedAt >= currentWindowStart);
    const previousWindowStart = currentWindowStart - AUTO_REFRESH_MS;
    const previousWindowEnd = currentWindowStart;
    const previousWindowResults = recentResults.filter(result => result.submittedAt >= previousWindowStart && result.submittedAt < previousWindowEnd);

    const currentSnapshot = buildSnapshot(
        currentWindowResults.length > 0 ? currentWindowResults : recentResults,
        currentWindowStart,
        now,
    );
    const previousSnapshot = previousWindowResults.length > 0
        ? buildSnapshot(previousWindowResults, previousWindowStart, previousWindowEnd)
        : null;

    const positives = summarizePositiveProgress(currentSnapshot, previousSnapshot);
    const regressions = summarizeRegression(currentSnapshot, previousSnapshot);
    const repetitions = summarizeRepetition(currentSnapshot);

    const deterministic = buildDeterministicNarrative(currentSnapshot, previousSnapshot, positives, regressions, repetitions);
    const aiNarrative = await generateAIProgressiveNarrative({
        current: currentSnapshot,
        previous: previousSnapshot,
        positives,
        regressions,
        repetitions,
        deterministicNarrative: deterministic.narrative,
    });

    const selectedNarrative = aiNarrative?.narrative && !isDryProgressiveSummary(aiNarrative.narrative.summary)
        ? aiNarrative.narrative
        : deterministic.narrative;

    return {
        generatedAt: now,
        sourceWindowDays: 5,
        maxResultsAnalyzed: MAX_RESULTS_ANALYZED,
        basedOnResultIds: recentResults.map(result => result.resultId),
        lastAutoRefreshAt: now,
        lastManualRefreshAt: null,
        nextEligibleManualRefreshAt: now + MANUAL_REFRESH_MS,
        nextScheduledRefreshAt: now + AUTO_REFRESH_MS,
        currentSnapshot,
        previousSnapshot,
        strengths: deterministic.strengths,
        weaknesses: deterministic.weaknesses,
        criticalGaps: deterministic.criticalGaps,
        positiveProgressions: positives,
        regressions,
        repetitivePatterns: repetitions,
        narrative: selectedNarrative,
        deterministicFeedback: deterministic.deterministicFeedback,
        aiModel: selectedNarrative === deterministic.narrative ? undefined : aiNarrative?.model,
    };
}

export async function getProgressiveFeedback(studentId: string): Promise<ProgressiveFeedbackRecord | null> {
    const recordRef = ref(database, `academic_records/${studentId}/progressiveFeedback`);
    const snapshot = await get(recordRef);
    return snapshot.exists() ? snapshot.val() as ProgressiveFeedbackRecord : null;
}

export async function shouldRefreshProgressiveFeedback(studentId: string, forceManual = false): Promise<boolean> {
    const current = await getProgressiveFeedback(studentId);
    const now = Date.now();

    if (!current) return true;
    if (forceManual) {
        return !current.nextEligibleManualRefreshAt || now >= current.nextEligibleManualRefreshAt;
    }
    return now >= current.nextScheduledRefreshAt;
}

export const refreshProgressiveFeedback = withRestoreGuard(
    'ProgressiveFeedback',
    null as ProgressiveFeedbackRecord | null,
)(async function _refreshProgressiveFeedback(
    studentId: string,
    options?: { manual?: boolean; force?: boolean }
): Promise<ProgressiveFeedbackRecord | null> {
    const manual = options?.manual === true;
    const force = options?.force === true;
    const existing = await getProgressiveFeedback(studentId);
    const now = Date.now();

    if (existing) {
        if (!force && manual && existing.nextEligibleManualRefreshAt && now < existing.nextEligibleManualRefreshAt) {
            return existing;
        }
        if (!force && !manual && now < existing.nextScheduledRefreshAt) {
            return existing;
        }
    }

    const nextRecord = await buildProgressiveFeedbackRecord(studentId, now);
    if (!nextRecord) {
        return null;
    }

    const finalRecord: ProgressiveFeedbackRecord = {
        ...nextRecord,
        lastManualRefreshAt: manual ? now : (existing?.lastManualRefreshAt || null),
        nextEligibleManualRefreshAt: manual ? now + MANUAL_REFRESH_MS : (existing?.nextEligibleManualRefreshAt || nextRecord.nextEligibleManualRefreshAt),
        lastAutoRefreshAt: manual ? (existing?.lastAutoRefreshAt || now) : now,
    };

    await update(ref(database, `academic_records/${studentId}`), {
        progressiveFeedback: finalRecord,
    });

    return finalRecord;
});
