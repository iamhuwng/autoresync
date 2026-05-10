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

import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { database } from '../services/firebase';
import { resolvePracticeSettings } from '../services/practiceSettingsResolver';
import { DEFAULT_PRACTICE_SETTINGS } from '../types/practice.types';
import type { ResolvedPracticeSettings } from '../types/practice.types';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { TestErrorBoundary } from '../components/test/TestErrorBoundary';
import { IELTSPracticeView } from '../components/practice/IELTSPracticeView';
import { THCSPracticeView } from '../components/practice/THCSPracticeView';
import {
    ReadingV2RuntimeShell,
    type ReadingV2AnswerValue,
    type ReadingV2RuntimeSubmitPayload,
} from '../components/reading-v2/runtime/ReadingV2RuntimeShell';
import type { PracticeContext } from '../components/practice/IELTSPracticeView';
import type { HomeworkWritingContext } from '../components/writing-practice/WritingPracticeView';
import type { IELTSWritingTest } from '../types/ielts-writing.types';
import { studentResumeService } from '../services/studentResume.service';
import { getEffectiveHomeworkDueDate, getHomeworkById } from '../services/homeworkManager';
import { getSubmissionById } from '../services/homeworkSubmissionService';
import type { ReadingV2DerivedProjection } from '../services/reading-v2/readingV2Projection.service';
import {
    buildReadingV2LaunchReadPlan,
    isReadingV2LaunchCandidate,
    resolveReadingV2LaunchDecision,
    type ReadingV2LaunchSurface,
} from '../services/reading-v2/readingV2LaunchIntegration.service';
import {
    isReadingV2RuntimeSubmissionConfigured,
    submitReadingV2RuntimeAttempt,
} from '../services/reading-v2/readingV2RuntimeSubmission.service';

// Lazy import for Writing practice (code-split)
const WritingPracticeView = lazy(() => import('../components/writing-practice/WritingPracticeView'));
const ListeningPracticeView = lazy(() => import('../components/practice/ListeningPracticeView'));

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
    autoResume?: boolean;
    supportsAutoResume?: boolean;
    // Generic context (from library/course entry points)
    context?: {
        type: string;
        source: { type: string; id: string; name: string };
    };
}

type CanonicalIeltsSkill = 'Reading' | 'Listening' | 'Writing' | 'Speaking';

const normalizeIeltsSkill = (rawSkill: unknown): CanonicalIeltsSkill | null => {
    if (typeof rawSkill !== 'string') {
        return null;
    }

    switch (rawSkill.trim().toLowerCase()) {
        case 'reading':
            return 'Reading';
        case 'listening':
            return 'Listening';
        case 'writing':
            return 'Writing';
        case 'speaking':
            return 'Speaking';
        default:
            return null;
    }
};

const inferIeltsSkillFromMaterialId = (materialId: string): CanonicalIeltsSkill | null => {
    const normalizedMaterialId = materialId.trim().toLowerCase();

    if (normalizedMaterialId.includes('listening')) {
        return 'Listening';
    }

    if (normalizedMaterialId.includes('writing')) {
        return 'Writing';
    }

    if (normalizedMaterialId.includes('reading')) {
        return 'Reading';
    }

    if (normalizedMaterialId.includes('speaking')) {
        return 'Speaking';
    }

    return null;
};

const getReadingV2LaunchSurface = (locationState: PracticeLocationState): ReadingV2LaunchSurface => {
    if (locationState.isHomework) {
        return 'homework';
    }

    if (locationState.courseId) {
        return 'course-material';
    }

    if (locationState.context?.source?.type === 'library') {
        return 'public-library';
    }

    return 'solo-practice';
};

const isExplicitReadingV2Launch = (testData: unknown): boolean =>
    isReadingV2LaunchCandidate(testData);

// ── Router Content ─────────────────────────────────────────────────────────────

const StudentPracticePageContent: React.FC = () => {
    const { materialId } = useParams<{ materialId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testTaking);

    const locationState = (location.state || {}) as PracticeLocationState;

    // ── State ──────────────────────────────────────────────────────────────────
    const [resolvedSettings, setResolvedSettings] = useState<ResolvedPracticeSettings | null>(null);
    const [testType, setTestType] = useState<'IELTS' | 'THCS' | 'ReadingV2' | null>(null);
    const [testSkill, setTestSkill] = useState<string | null>(null);
    const [writingTestData, setWritingTestData] = useState<IELTSWritingTest | null>(null);
    const [writingHomeworkContext, setWritingHomeworkContext] = useState<HomeworkWritingContext | undefined>(undefined);
    const [readingV2Projection, setReadingV2Projection] = useState<ReadingV2DerivedProjection | null>(null);
    const [readingV2Answers, setReadingV2Answers] = useState<Readonly<Record<string, ReadingV2AnswerValue>>>({});
    const [readingV2StartedAt] = useState(() => (
        typeof locationState.startedAt === 'number' ? locationState.startedAt : Date.now()
    ));
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
            setWritingHomeworkContext(undefined);
            setReadingV2Projection(null);

            try {
                setReadingV2Answers({});
                const launchTestSnap = await get(ref(database, `tests/${materialId}`));
                const launchTestData = launchTestSnap.exists() ? launchTestSnap.val() : null;

                if (isExplicitReadingV2Launch(launchTestData)) {
                    const launchSurface = getReadingV2LaunchSurface(locationState);
                    const snapshotVersionId =
                        typeof launchTestData?.publishedSnapshotVersionId === 'string'
                            ? launchTestData.publishedSnapshotVersionId
                            : undefined;
                    const projectionReadPlan = buildReadingV2LaunchReadPlan({
                        surface: launchSurface,
                        materialId,
                        snapshotVersionId,
                    });
                    const projectionSnap = await get(ref(database, projectionReadPlan.projectionPath));
                    const launchDecision = resolveReadingV2LaunchDecision({
                        surface: launchSurface,
                        metadata: launchTestData,
                        projection: projectionSnap.exists() ? projectionSnap.val() : undefined,
                    });

                    if (launchDecision.status !== 'runtime') {
                        trackAction('readingV2LaunchBlocked', {
                            surface: launchSurface,
                            reason: launchDecision.status === 'blocked'
                                ? launchDecision.reason
                                : launchDecision.reason,
                            materialId,
                            outcome: 'blocked',
                        });
                        setError(launchDecision.status === 'blocked'
                            ? launchDecision.message
                            : 'Reading V2 launch could not be resolved');
                        setLoading(false);
                        return;
                    }

                    trackAction('launchReadingV2Runtime', {
                        surface: launchSurface,
                        materialId,
                        projectionKind: launchDecision.projection.projectionKind,
                        sourceSnapshotVersionId: launchDecision.projection.sourceSnapshotVersionId,
                        outcome: 'success',
                    });
                    const readingV2Settings = locationState.courseId && locationState.moduleId
                        ? await resolvePracticeSettings(
                            locationState.courseId,
                            locationState.moduleId,
                            materialId,
                            { timerMinutes: null, feedbackTiming: 'after_completion' }
                        )
                        : locationState.isHomework
                            ? {
                                ...DEFAULT_PRACTICE_SETTINGS,
                                timerMinutes: locationState.timerMinutes ?? DEFAULT_PRACTICE_SETTINGS.timerMinutes,
                                maxAttempts: locationState.maxAttempts ?? DEFAULT_PRACTICE_SETTINGS.maxAttempts,
                            }
                            : DEFAULT_PRACTICE_SETTINGS;

                    setReadingV2Projection(launchDecision.projection);
                    setTestSkill('Reading');
                    setTestType('ReadingV2');
                    setResolvedSettings(readingV2Settings);
                    setLoading(false);
                    return;
                }

                // 1. Detect test type + skill from Firebase
                const rawTestType = launchTestData?.testType ?? null;
                const rawSkill = launchTestData?.skill ?? null;
                const normalizedSkill = normalizeIeltsSkill(rawSkill)
                    ?? (rawTestType === 'IELTS' ? inferIeltsSkillFromMaterialId(materialId) : null);
                const normalizedTestType = rawTestType === 'THCS-THPT' ? 'THCS' : 'IELTS';
                const routeTarget = rawTestType === 'IELTS' && normalizedSkill === 'Writing'
                    ? 'WritingPracticeView'
                    : normalizedTestType === 'IELTS' && normalizedSkill === 'Listening'
                        ? 'ListeningPracticeView'
                        : normalizedTestType === 'THCS'
                            ? 'THCSPracticeView'
                            : 'IELTSPracticeView';

                if (rawTestType === 'IELTS' && !normalizeIeltsSkill(rawSkill) && normalizedSkill) {
                    console.warn('[StudentPracticePage] Inferred IELTS skill from material id fallback', {
                        materialId,
                        rawSkill,
                        inferredSkill: normalizedSkill,
                    });
                }

                console.info('[StudentPracticePage] Resolved practice route', {
                    materialId,
                    rawTestType,
                    rawSkill,
                    normalizedSkill,
                    normalizedTestType,
                    routeTarget,
                    isHomework: Boolean(locationState.isHomework),
                    courseId: locationState.courseId || null,
                    moduleId: locationState.moduleId || null,
                    homeworkId: locationState.homeworkId || null,
                    submissionId: locationState.submissionId || null,
                });

                if (
                    materialId.toLowerCase().includes('listening')
                    && normalizedSkill !== 'Listening'
                ) {
                    console.warn('[StudentPracticePage] Listening-like material id resolved to a non-listening skill', {
                        materialId,
                        rawSkill,
                        normalizedSkill,
                        rawTestType,
                        routeTarget,
                    });
                }

                setTestSkill(normalizedSkill);
                setTestType(normalizedTestType);

                // 2. If Writing test, load full test data for WritingPracticeView
                if (rawTestType === 'IELTS' && normalizedSkill === 'Writing') {
                    if (launchTestSnap.exists()) {
                        setWritingTestData(launchTestData as IELTSWritingTest);
                    } else {
                        setError('Writing test data not found');
                        setLoading(false);
                        return;
                    }

                    if (locationState.isHomework) {
                        if (!user?.uid || !locationState.homeworkId || !locationState.submissionId) {
                            setError('Homework launch is missing assignment details');
                            setLoading(false);
                            return;
                        }

                        const [submission, homework] = await Promise.all([
                            getSubmissionById(locationState.submissionId),
                            getHomeworkById(locationState.homeworkId),
                        ]);

                        const isValidSubmission = submission
                            && submission.studentId === user.uid
                            && submission.homeworkId === locationState.homeworkId
                            && submission.status === 'in_progress';

                        if (!isValidSubmission || !homework) {
                            setError('This homework attempt is no longer available');
                            setLoading(false);
                            return;
                        }

                        setWritingHomeworkContext({
                            homeworkId: locationState.homeworkId,
                            submissionId: locationState.submissionId,
                            teacherId: submission.teacherId || homework.createdBy,
                            dueDate: getEffectiveHomeworkDueDate(homework, user.uid),
                            lateSubmissionAllowed: homework.config.lateSubmissionAllowed,
                            timerMinutes: homework.config.timerMinutes,
                            maxAttempts: homework.config.maxAttempts,
                            startedAt: submission.startedAt,
                            previousEssay: locationState.resumeFrom?.essays,
                        });
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
                    setResolvedSettings({
                        ...DEFAULT_PRACTICE_SETTINGS,
                        timerMinutes: locationState.timerMinutes ?? DEFAULT_PRACTICE_SETTINGS.timerMinutes,
                        maxAttempts: locationState.maxAttempts ?? DEFAULT_PRACTICE_SETTINGS.maxAttempts,
                    });
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
    }, [locationState.homeworkId, locationState.isHomework, locationState.resumeFrom?.essays, locationState.submissionId, materialId, trackAction, user?.uid]);

    useEffect(() => {
        if (!materialId || !user?.uid || loading || error) {
            return;
        }

        const canResumePractice = testType === 'IELTS'
            || (testType === 'THCS' && locationState.isHomework && Boolean(locationState.submissionId));

        if (!canResumePractice) {
            return;
        }

        void studentResumeService.savePracticeResume({
            studentId: user.uid,
            materialId,
            locationState: {
                ...locationState,
                supportsAutoResume: testType === 'IELTS',
            },
        });
    }, [error, loading, locationState, materialId, testType, user?.uid]);

    useEffect(() => {
        if (!error) {
            return;
        }

        void studentResumeService.clearResume();
    }, [error]);

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

    const handleReadingV2Submit = useCallback(async (payload: ReadingV2RuntimeSubmitPayload) => {
        const launchSurface = getReadingV2LaunchSurface(locationState);
        const submissionMaterialId = payload.materialId ?? materialId ?? 'unknown-material';
        const trackingPayload = {
            surface: launchSurface,
            materialId: submissionMaterialId,
            projectionId: payload.projectionId,
            sourceSnapshotVersionId: payload.sourceSnapshotVersionId,
        };

        trackAction('submitReadingV2Attempt', {
            ...trackingPayload,
            outcome: 'requested',
        });

        try {
            const result = await submitReadingV2RuntimeAttempt({
                payload,
                context: {
                    surface: launchSurface,
                    homeworkId: locationState.homeworkId,
                    courseId: locationState.courseId,
                    moduleId: locationState.moduleId,
                    sourceName: locationState.context?.source?.name ?? readingV2Projection?.content.title,
                },
            });

            trackAction('submitReadingV2Attempt', {
                ...trackingPayload,
                resultId: result.resultId,
                attemptId: result.attemptId,
                outcome: 'success',
            });
        } catch (submitError) {
            trackAction('submitReadingV2Attempt', {
                ...trackingPayload,
                reason: submitError instanceof Error ? submitError.name : 'unknown',
                outcome: 'failure',
            });
            throw submitError;
        }
    }, [
        locationState.context?.source?.name,
        locationState.courseId,
        locationState.homeworkId,
        locationState.isHomework,
        locationState.moduleId,
        materialId,
        readingV2Projection?.content.title,
        trackAction,
    ]);
    const readingV2SubmitHandler = isReadingV2RuntimeSubmissionConfigured()
        ? handleReadingV2Submit
        : undefined;

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
                        onClick={() => {
                            void studentResumeService.clearResume();
                            navigate(-1);
                        }}
                        style={{ padding: '0.75rem 1.5rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    // ── Route to correct view ──────────────────────────────────────────────────

    if (testType === 'ReadingV2' && readingV2Projection) {
        return (
            <ReadingV2RuntimeShell
                projection={readingV2Projection}
                onSubmit={readingV2SubmitHandler}
                initialAnswers={readingV2Answers}
                onAnswersChange={setReadingV2Answers}
                persistenceKey={`reading-v2:practice:${user?.uid ?? 'anonymous'}:${materialId}:${readingV2Projection.projectionId}`}
                timer={{
                    durationMinutes: resolvedSettings.timerMinutes,
                    startedAt: resolvedSettings.timerMinutes ? readingV2StartedAt : null,
                    pausedDurationMs: 0,
                    running: true,
                    autoSubmitOnExpiry: true,
                }}
            />
        );
    }

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
                    autoResume={locationState.autoResume === true}
                    practiceContext={{
                        mode: locationState.isHomework
                            ? 'homework'
                            : locationState.courseId
                                ? 'course_material'
                                : 'self_study',
                        courseId: locationState.courseId,
                        moduleId: locationState.moduleId,
                        homeworkId: locationState.homeworkId,
                        submissionId: locationState.submissionId,
                    }}
                    homeworkContext={locationState.isHomework ? writingHomeworkContext : undefined}
                />
            </Suspense>
        );
    }

    // Listening branch: IELTS + skill=Listening → ListeningPracticeView (PRD-0045)
    if (testType === 'IELTS' && testSkill === 'Listening') {
        return (
            <Suspense fallback={
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="lpv-spinner" style={{ width: 40, height: 40, border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }} />
                        <div style={{ fontSize: '1rem', color: '#64748b' }}>Loading listening practice...</div>
                    </div>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            }>
                <ListeningPracticeView
                    materialId={materialId}
                    resolvedSettings={resolvedSettings}
                    practiceContext={practiceContext}
                    autoResume={locationState.autoResume === true}
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
                    autoResume={locationState.autoResume === true}
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
                    autoResume={locationState.autoResume === true}
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
