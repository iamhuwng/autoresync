/**
 * StudentPracticePage — PRD-0025: Unified Solo Practice Mode
 *
 * THIN ROUTER: Determines test type and renders the correct practice view.
 * 
 * Route: /student/practice/:materialId
 * 
 * Architecture (mirrors TestPageRouter for live sessions):
 *   1. Reads materialId from URL params
 *   2. Reads context (solo/homework/course) from location.state
 *   3. Loads settings cascade (if course context)
 *   4. Detects test type (IELTS vs THCS) from test metadata
 *   5. Renders IELTSPracticeView or THCSPracticeView accordingly
 *
 * Key design decisions:
 * - ZERO dependency on game_sessions or sessionService
 * - All state is local / localStorage-backed
 * - Settings cascade: material > module > course > defaults
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { database } from '../services/firebase';
import { resolvePracticeSettings } from '../services/practiceSettingsResolver';
import { DEFAULT_PRACTICE_SETTINGS } from '../types/practice.types';
import type { ResolvedPracticeSettings } from '../types/practice.types';
import { TestErrorBoundary } from '../components/test/TestErrorBoundary';
import { IELTSPracticeView } from '../components/practice/IELTSPracticeView';
import { THCSPracticeView } from '../components/practice/THCSPracticeView';
import type { PracticeContext } from '../components/practice/IELTSPracticeView';
import type { IELTSWritingTest } from '../types/ielts-writing.types';

// Lazy import for Writing practice (code-split)
const WritingPracticeView = lazy(() => import('../components/writing-practice/WritingPracticeView'));

// ── Location State Shape ───────────────────────────────────────────────────────

interface PracticeLocationState {
    // Context type
    isHomework?: boolean;
    // Course context
    courseId?: string;
    moduleId?: string;
    courseName?: string;
    // Homework context
    homeworkId?: string;
    submissionId?: string;
    teacherId?: string;
    dueDate?: number;
    lateSubmissionAllowed?: boolean;
    timerMinutes?: number | null;
    maxAttempts?: number | null;
    startedAt?: number;
    // Resume hint
    resumeFrom?: any;
    // Generic context (from library/course entry points)
    context?: {
        type: string;
        source: { type: string; id: string; name: string };
    };
}

// ── Router Content ─────────────────────────────────────────────────────────────

const StudentPracticePageContent: React.FC = () => {
    const { materialId } = useParams<{ materialId: string }>();
    const location = useLocation();
    const navigate = useNavigate();

    const locationState = (location.state || {}) as PracticeLocationState;

    // ── State ──────────────────────────────────────────────────────────────────
    const [resolvedSettings, setResolvedSettings] = useState<ResolvedPracticeSettings | null>(null);
    const [testType, setTestType] = useState<'IELTS' | 'THCS' | null>(null);
    const [testSkill, setTestSkill] = useState<string | null>(null);
    const [writingTestData, setWritingTestData] = useState<IELTSWritingTest | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Load settings + detect test type ───────────────────────────────────────
    useEffect(() => {
        if (!materialId) {
            setError('No material specified');
            setLoading(false);
            return;
        }

        const initialize = async () => {
            setLoading(true);
            setError(null);

            try {
                // 1. Detect test type + skill from Firebase
                const testTypeRef = ref(database, `tests/${materialId}/testType`);
                const testTypeSnap = await get(testTypeRef);
                const rawTestType = testTypeSnap.val();

                const skillRef = ref(database, `tests/${materialId}/skill`);
                const skillSnap = await get(skillRef);
                const rawSkill = skillSnap.val() || null;
                setTestSkill(rawSkill);

                if (rawTestType === 'THCS-THPT') {
                    setTestType('THCS');
                } else {
                    setTestType('IELTS');
                }

                // 2. If Writing test, load full test data for WritingPracticeView
                if (rawTestType === 'IELTS' && rawSkill === 'Writing') {
                    const fullTestSnap = await get(ref(database, `tests/${materialId}`));
                    if (fullTestSnap.exists()) {
                        setWritingTestData(fullTestSnap.val() as IELTSWritingTest);
                    } else {
                        setError('Writing test data not found');
                        setLoading(false);
                        return;
                    }
                }

                // 3. Resolve practice settings (for non-Writing IELTS tests)
                if (locationState.courseId && locationState.moduleId) {
                    const settings = await resolvePracticeSettings(
                        locationState.courseId,
                        locationState.moduleId,
                        materialId,
                        { timerMinutes: null, feedbackTiming: 'after_completion' }
                    );
                    setResolvedSettings(settings);
                } else if (locationState.isHomework) {
                    // Homework mode: use default settings (homework has its own timer/config)
                    setResolvedSettings(DEFAULT_PRACTICE_SETTINGS);
                } else {
                    // Self-study: default settings
                    setResolvedSettings(DEFAULT_PRACTICE_SETTINGS);
                }
            } catch (err) {
                console.error('[StudentPracticePage] Init error:', err);
                setError('Failed to load test information');
            } finally {
                setLoading(false);
            }
        };

        initialize();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [materialId]);

    // ── Build practice context ─────────────────────────────────────────────────
    const practiceContext: PracticeContext = {
        type: locationState.isHomework
            ? 'homework'
            : locationState.courseId
                ? 'course_material'
                : 'self_study',
        courseId: locationState.courseId,
        moduleId: locationState.moduleId,
        courseName: locationState.courseName,
        homeworkId: locationState.homeworkId,
        submissionId: locationState.submissionId,
    };

    // ── Loading ────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>Loading test...</div>
                </div>
            </div>
        );
    }

    // ── Error ──────────────────────────────────────────────────────────────────
    if (error || !materialId || !resolvedSettings) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>Error Loading Test</div>
                    <div style={{ color: '#64748b', marginBottom: '1.5rem' }}>{error || 'Something went wrong'}</div>
                    <button
                        onClick={() => navigate(-1)}
                        style={{ padding: '0.75rem 1.5rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    // ── Route to correct view ──────────────────────────────────────────────────

    // Writing branch: IELTS + skill=Writing → WritingPracticeView
    if (testType === 'IELTS' && testSkill === 'Writing' && writingTestData) {
        return (
            <Suspense fallback={
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="wpv-spinner" style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
                        <div style={{ fontSize: '1rem', color: '#64748b' }}>Loading writing practice...</div>
                    </div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            }>
                <WritingPracticeView
                    materialId={materialId}
                    testData={writingTestData}
                    homeworkContext={locationState.isHomework ? {
                        homeworkId: locationState.homeworkId || '',
                        submissionId: locationState.submissionId || '',
                        teacherId: locationState.teacherId || '',
                        dueDate: locationState.dueDate,
                        lateSubmissionAllowed: locationState.lateSubmissionAllowed ?? false,
                        timerMinutes: locationState.timerMinutes,
                        maxAttempts: locationState.maxAttempts,
                        startedAt: locationState.startedAt,
                        previousEssay: locationState.resumeFrom?.essays,
                    } : undefined}
                />
            </Suspense>
        );
    }

    switch (testType) {
        case 'IELTS':
            return (
                <IELTSPracticeView
                    materialId={materialId}
                    resolvedSettings={resolvedSettings}
                    practiceContext={practiceContext}
                />
            );

        case 'THCS':
            return (
                <THCSPracticeView
                    materialId={materialId}
                    practiceContext={practiceContext}
                />
            );

        default:
            return (
                <IELTSPracticeView
                    materialId={materialId}
                    resolvedSettings={resolvedSettings}
                    practiceContext={practiceContext}
                />
            );
    }
};

// ── Wrap with Error Boundary ───────────────────────────────────────────────────

export const StudentPracticePage: React.FC = () => {
    const { materialId } = useParams<{ materialId: string }>();
    return (
        <TestErrorBoundary sessionCode={materialId}>
            <StudentPracticePageContent />
        </TestErrorBoundary>
    );
};

export default StudentPracticePage;
