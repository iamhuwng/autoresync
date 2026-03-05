/**
 * THCSPreviewOverlay — Student preview for the THCS test editor (Task 10.2 + 10.3)
 *
 * Phase 2A (static): Fullscreen overlay rendering the test as students see it.
 *   - Timer hidden, submit hidden, inputs disabled.
 *
 * Phase 2B (interactive): Timer counts down, options clickable (local state only),
 *   section navigation works. Submit shows mock results using answer key data.
 *   NO RTDB writes.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { THCSSection, THCSTestMetadata, THCSTest, QuestionResult } from '../../types/thcs-test.types';
import { markThcsTest, thcsResultToTestMarkingResult } from '../../services/thcsAutoMarking.service';
import { Button } from '../modern';
import { plog } from './previewLogCollector';

// ─── Question type renderers (imported from student components) ───
import THCSQuestionRenderer from '../thcs-student/THCSQuestionRenderer';
import THCSPassagePanel from '../thcs-student/THCSPassagePanel';

interface THCSPreviewOverlayProps {
    sections: THCSSection[];
    metadata: THCSTestMetadata;
    onClose: () => void;
}

const READING_INTENTS = ['reading-cloze-mcq', 'reading-comprehension', 'reading-announcement', 'reading-cloze-wordbank'];

/**
 * Convert draft editor state to a mock THCSTest for preview.
 * Does NOT reuse the publish serialization function.
 */
function convertDraftToPreviewTest(sections: THCSSection[], metadata: THCSTestMetadata): THCSTest {
    const totalQs = sections.flatMap(s => s.questions).length;
    const totalPts = sections.reduce((sum, s) => sum + s.totalPoints, 0);

    plog('[Preview] Converting draft → preview test');
    plog(`[Preview]   Sections: ${sections.length}, Questions: ${totalQs}, Points: ${totalPts}`);
    sections.forEach((s, i) => {
        const types = [...new Set(s.questions.map(q => q.type))];
        const hasAnswers = s.questions.filter(q => q.correctAnswer || q.modelAnswers?.length || q.blankAnswers?.length).length;
        plog(`[Preview]   [${i}] "${s.name}" — ${s.questions.length} Qs, type(s): [${types.join(', ')}], layout: ${s.layout || 'single-column'}, passage: ${!!s.passage}, answers: ${hasAnswers}/${s.questions.length}, rawFallback: ${s.questions[0]?.type === 'raw-text-fallback' || (s as any).isRawTextFallback || false}`);
    });

    return {
        id: 'preview-' + Date.now(),
        testType: 'THCS-THPT',
        metadata,
        sections,
        questionCount: totalQs,
        totalPoints: totalPts,
        createdBy: 'preview',
        ownerId: 'preview',
        isPublic: false,
        isComplete: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

/**
 * Detect if a section has reading intent by checking its questions
 */
function isSectionReading(section: THCSSection): boolean {
    if (!section.questions.length) return false;
    const firstType = section.questions[0]?.type || '';
    const isReading = READING_INTENTS.some(intent => firstType.includes(intent));
    plog(`[Preview] isSectionReading("${section.name}"): firstType=${firstType}, isReading=${isReading}`);
    return isReading;
}

export const THCSPreviewOverlay: React.FC<THCSPreviewOverlayProps> = ({
    sections,
    metadata,
    onClose,
}) => {
    // ─── Mode toggle ────────────────────────────────────────────
    const [interactive, setInteractive] = useState(false);

    // ─── Navigation ─────────────────────────────────────────────
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

    // ─── Answer state (local only — NO RTDB) ────────────────────
    const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
    const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());

    // ─── Submission ─────────────────────────────────────────────
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [questionResults, setQuestionResults] = useState<Record<string, boolean>>({});
    const [scoreDisplay, setScoreDisplay] = useState<{
        scaledScore: number;
        rawScore: number;
        maxRaw: number;
        percentage: number;
        pendingWritingCount?: number;
    } | null>(null);

    // ─── Timer (interactive mode only) ──────────────────────────
    const [timeRemaining, setTimeRemaining] = useState(metadata.duration * 60);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const handleSubmitRef = useRef<() => void>(() => { });

    const testData = useMemo(() => convertDraftToPreviewTest(sections, metadata), [sections, metadata]);
    const currentSection = testData.sections[currentSectionIndex];
    const allQuestions = testData.sections.flatMap(s => s.questions);
    const totalQuestions = allQuestions.length;

    // ─── Mock Submit (Phase 2B) ─────────────────────────────────
    const handleSubmitPreview = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);

        plog('[Preview] Submit — grading with answers:', answers);
        plog(`[Preview] Submit — ${testData.sections.length} sections, ${testData.sections.flatMap(s => s.questions).length} questions`);

        try {
            const gradingResult = markThcsTest(
                testData.id,
                'preview-student',
                testData.sections,
                answers
            );

            plog('[Preview] Grading result:', {
                scaledScore: gradingResult.scaledScore,
                totalPoints: gradingResult.totalPoints,
                maxPoints: gradingResult.maxPoints,
                questionCount: Object.keys(gradingResult.questionResults).length,
            });

            const results: Record<string, boolean> = {};
            for (const [qNum, qr] of Object.entries(gradingResult.questionResults)) {
                results[qNum] = (qr as QuestionResult).isCorrect;
            }
            setQuestionResults(results);

            const { markingResult, thcsData } = thcsResultToTestMarkingResult(
                gradingResult,
                testData.metadata,
                testData.sections
            );

            plog('[Preview] Final score:', {
                scaled: gradingResult.scaledScore.toFixed(1),
                raw: `${gradingResult.totalPoints}/${gradingResult.maxPoints}`,
                percentage: markingResult.percentage.toFixed(1) + '%',
                pendingWriting: thcsData.pendingWritingCount,
            });

            setScoreDisplay({
                scaledScore: gradingResult.scaledScore,
                rawScore: gradingResult.totalPoints,
                maxRaw: gradingResult.maxPoints,
                percentage: markingResult.percentage,
                pendingWritingCount: thcsData.pendingWritingCount,
            });
        } catch (err) {
            plog('[Preview] Grading failed:', err);
        }

        setIsSubmitted(true);
    }, [answers, testData]);

    // Keep ref in sync
    handleSubmitRef.current = handleSubmitPreview;

    // Timer — only in interactive mode
    useEffect(() => {
        if (!interactive || isSubmitted) return;

        timerRef.current = setInterval(() => {
            setTimeRemaining(prev => {
                if (prev <= 1) {
                    handleSubmitRef.current();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [interactive, isSubmitted]);

    // ─── Answer Handler (local state only) ──────────────────────
    const handleAnswer = useCallback((questionNumber: number, answer: string | string[] | null) => {
        if (!interactive) return; // Phase 2A: inputs disabled
        plog(`[Preview] Answer Q${questionNumber}:`, answer);
        setAnswers(prev => {
            const next = { ...prev };
            if (answer === null) {
                delete next[questionNumber.toString()];
            } else {
                next[questionNumber.toString()] = answer;
            }
            return next;
        });
    }, [interactive]);

    const handleToggleFlag = useCallback((questionId: string) => {
        setFlaggedQuestions(prev => {
            const next = new Set(prev);
            next.has(questionId) ? next.delete(questionId) : next.add(questionId);
            return next;
        });
    }, []);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Layout detection
    const isTwoColumn = currentSection ? isSectionReading(currentSection) : false;
    const answeredCount = Object.keys(answers).length;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'white',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
            {/* ─── Preview Banner ──────────────────────────────────── */}
            <div style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                padding: '0.5rem 1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>
                        🔍 PREVIEW MODE — This is how students will see your test
                    </span>
                    {/* Mode toggle */}
                    <button
                        onClick={() => {
                            setInteractive(!interactive);
                            setAnswers({});
                            setIsSubmitted(false);
                            setQuestionResults({});
                            setScoreDisplay(null);
                            setTimeRemaining(metadata.duration * 60);
                            setCurrentSectionIndex(0);
                        }}
                        style={{
                            padding: '0.25rem 0.6rem',
                            borderRadius: '6px',
                            border: '1px solid rgba(255,255,255,0.3)',
                            background: interactive ? 'rgba(255,255,255,0.2)' : 'transparent',
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {interactive ? '🎮 Interactive' : '👁️ Static'}
                    </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {/* Timer (interactive mode) */}
                    {interactive && !isSubmitted && (
                        <span style={{
                            color: timeRemaining < 60 ? '#fca5a5' : 'rgba(255,255,255,0.9)',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            fontSize: '1rem',
                        }}>
                            ⏰ {formatTime(timeRemaining)}
                        </span>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            padding: '0.3rem 0.75rem',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                        }}
                    >
                        ✕ Close Preview
                    </button>
                </div>
            </div>

            {/* ─── Results (after submit in interactive mode) ─────── */}
            {isSubmitted && scoreDisplay && (
                <div style={{
                    background: '#f0fdf4',
                    borderBottom: '1px solid #bbf7d0',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2rem',
                }}>
                    <div style={{ fontWeight: 700, fontSize: '1.5rem', color: '#166534' }}>
                        {scoreDisplay.scaledScore.toFixed(1)}/10
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#166534' }}>
                        <div>Raw: {scoreDisplay.rawScore.toFixed(1)} / {scoreDisplay.maxRaw.toFixed(1)} pts</div>
                        <div>{scoreDisplay.percentage.toFixed(1)}% correct</div>
                        {scoreDisplay.pendingWritingCount != null && scoreDisplay.pendingWritingCount > 0 && (
                            <div style={{ color: '#d97706' }}>📝 {scoreDisplay.pendingWritingCount} writing pending</div>
                        )}
                    </div>
                    <Button variant="glass" size="sm" onClick={() => {
                        setIsSubmitted(false);
                        setAnswers({});
                        setQuestionResults({});
                        setScoreDisplay(null);
                        setTimeRemaining(metadata.duration * 60);
                        setCurrentSectionIndex(0);
                    }}>
                        🔄 Retry
                    </Button>
                </div>
            )}

            {/* ─── Main Content ────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Section navigation sidebar */}
                <div style={{
                    width: '220px',
                    background: '#f8fafc',
                    borderRight: '1px solid #e2e8f0',
                    overflowY: 'auto',
                    padding: '1rem 0.75rem',
                    flexShrink: 0,
                }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
                        Sections
                    </div>
                    {testData.sections.map((section, i) => (
                        <button
                            key={section.id}
                            onClick={() => setCurrentSectionIndex(i)}
                            style={{
                                width: '100%',
                                display: 'block',
                                textAlign: 'left',
                                padding: '0.5rem 0.75rem',
                                marginBottom: '0.25rem',
                                borderRadius: '8px',
                                border: 'none',
                                background: i === currentSectionIndex ? '#eef2ff' : 'transparent',
                                fontWeight: i === currentSectionIndex ? 700 : 400,
                                fontSize: '0.8rem',
                                color: i === currentSectionIndex ? '#4338ca' : '#475569',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <div>{section.name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                                {section.questions.length} questions · {section.totalPoints} pts
                            </div>
                        </button>
                    ))}

                    {/* Progress */}
                    <div style={{ marginTop: '1rem', padding: '0 0.25rem' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem' }}>
                            Progress: {answeredCount}/{totalQuestions}
                        </div>
                        <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0}%`,
                                background: '#6366f1',
                                borderRadius: '2px',
                                transition: 'width 0.3s ease',
                            }} />
                        </div>
                    </div>

                    {/* Submit button (interactive mode only) */}
                    {interactive && !isSubmitted && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={handleSubmitPreview}
                            style={{ width: '100%', marginTop: '1rem' }}
                        >
                            📤 Submit
                        </Button>
                    )}
                </div>

                {/* Question area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                    {currentSection && (() => {
                        const qSummary = currentSection.questions.map(q => `Q${q.questionNumber}:${q.type}/${q.intent || '-'}`).join(', ');
                        const passageContent = currentSection.passage?.content || '';
                        const passageHasFormatting = /\*\*|__|{{|\[I\]/.test(passageContent);
                        plog(`[Preview] Rendering section ${currentSectionIndex}: "${currentSection.name}", ${currentSection.questions.length} Qs, isTwoColumn=${isTwoColumn}, passage=${!!currentSection.passage}, passageLen=${passageContent.length}, passageFormatting=${passageHasFormatting}, instruction="${currentSection.instructionText?.slice(0, 80) || '(none)'}"`);
                        plog(`[Preview]   Question breakdown: ${qSummary}`);
                        return true;
                    })() && (
                            <>
                                {/* Section header */}
                                <div style={{
                                    marginBottom: '1rem',
                                    padding: '0.75rem 1rem',
                                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08))',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(99, 102, 241, 0.15)',
                                }}>
                                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                                        {currentSection.name}
                                    </h2>
                                    {currentSection.instructionText && (
                                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                                            {currentSection.instructionText}
                                        </p>
                                    )}
                                </div>

                                {/* Two-column layout for reading */}
                                <div style={{
                                    display: isTwoColumn ? 'grid' : 'block',
                                    gridTemplateColumns: isTwoColumn ? '1fr 1fr' : undefined,
                                    gap: '1.5rem',
                                }}>
                                    {/* Passage panel (reading sections) */}
                                    {isTwoColumn && currentSection.passage && (
                                        <THCSPassagePanel
                                            passage={currentSection.passage}
                                            layout={currentSection.layout || 'two-column'}
                                            isVisible={true}
                                        />
                                    )}

                                    {/* Questions */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {currentSection.questions.map((question) => {
                                            const qNum = question.questionNumber.toString();
                                            const studentAnswer = answers[qNum] || null;
                                            const isCorrect = isSubmitted ? questionResults[qNum] : undefined;

                                            return (
                                                <div key={question.id} id={`thcs-q-${question.id}`}>
                                                    <THCSQuestionRenderer
                                                        question={question}
                                                        selectedAnswer={studentAnswer}
                                                        onAnswer={(ans) => handleAnswer(question.questionNumber, ans)}
                                                        isReviewMode={isSubmitted}
                                                        isCorrect={isCorrect}
                                                        isFlagged={flaggedQuestions.has(question.id)}
                                                        onToggleFlag={() => handleToggleFlag(question.id)}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}
                </div>
            </div>
        </div>
    );
};

export default THCSPreviewOverlay;
