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
 *   5. Renders explicit Reading V2, Listening, Writing, or THCS runtime.
 *      Retired Reading V1 and incomplete IELTS metadata fail closed.
 *
 * Key design decisions:
 * - ZERO dependency on game_sessions or sessionService
 * - All state is local / localStorage-backed
 * - Settings cascade: material > module > course > defaults
 */

import React, { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { database } from '../services/firebase';
import { resolvePracticeSettings } from '../services/practiceSettingsResolver';
import { DEFAULT_PRACTICE_SETTINGS } from '../types/practice.types';
import type { ResolvedPracticeSettings } from '../types/practice.types';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { useNavigation } from '../hooks/useNavigation';
import { FEATURE_IDS } from '../config/featureRegistry';
import { READING_V2_ENGINE } from '../config/readingV2FeatureFlags';
import { TestErrorBoundary } from '../components/test/TestErrorBoundary';
import { THCSPracticeView } from '../components/practice/THCSPracticeView';
import {
    ReadingV2RuntimeShell,
    type ReadingV2AnswerValue,
    type ReadingV2RuntimeLifecycle,
    type ReadingV2RuntimeSubmitPayload,
} from '../components/reading-v2/runtime/ReadingV2RuntimeShell';
import type { PracticeContext } from '../components/practice/IELTSPracticeView';
import type { HomeworkWritingContext } from '../components/writing-practice/WritingPracticeView';
import type { IELTSWritingTest } from '../types/ielts-writing.types';
import { studentResumeService } from '../services/studentResume.service';
import { getEffectiveHomeworkDueDate, getHomeworkById } from '../services/homeworkManager';
import {
    HomeworkSubmissionError,
    getSubmissionById,
    submitHomework,
} from '../services/homeworkSubmissionService';
import type { HomeworkAssignment } from '../types/homework.types';
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
import {
    composeReadingPassageSetProjection,
    getReadingPassageHomeworkLaunchItems,
} from '../services/reading-v2/readingV2PassageHomeworkLaunch.service';
import { useAntiCopyPaste } from '../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../hooks/test/useFullscreenMode';
import { useTestIntegrity } from '../hooks/test/useTestIntegrity';
import type { AntiCheatConfig } from '../types/integrity.types';
import { storage } from '../core/platform/storage';
import {
    isExplicitBookPlacementLaunch,
    parseBookPlacementLaunchQuery,
    resolveBookPlacementLaunch,
    type BookPlacementLaunchQuery,
    type ValidBookPlacementLaunch,
} from '../services/book-delivery/bookPlacementLaunch.browser';
import { BookPlacementRuntimeHost } from '../components/book-runtime/BookPlacementRuntimeHost';

// Lazy import for Writing practice (code-split)
const WritingPracticeView = lazy(() => import('../components/writing-practice/WritingPracticeView'));
const ListeningPracticeView = lazy(() => import('../components/practice/ListeningPracticeView'));
const MATERIAL_UNAVAILABLE_MESSAGE = 'Material no longer available';

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

const STUDENT_SAFE_STANDARD_HOMEWORK_KINDS = new Set([
    'ielts_reading',
    'ielts_listening',
    'ielts_writing',
]);

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

const getReadingV2PracticePersistenceKey = (input: {
    studentId?: string;
    materialId?: string;
    projectionId: string;
}): string => `reading-v2:practice:${input.studentId ?? 'anonymous'}:${input.materialId}:${input.projectionId}`;

const normalizePositiveTimerMinutes = (value: unknown): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return value;
};

const getReadingV2MetadataTimerMinutes = (metadata: unknown): number | null => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
    }

    const record = metadata as Record<string, unknown>;

    return normalizePositiveTimerMinutes(record.timerMinutes)
        ?? normalizePositiveTimerMinutes(record.durationMinutes)
        ?? normalizePositiveTimerMinutes(record.duration);
};

const readStudentSafeReadingPassageProjection = async (input: {
    materialId: string;
    snapshotVersionId: string;
    launchSurface: ReadingV2LaunchSurface;
}): Promise<ReadingV2DerivedProjection> => {
    const projectionReadPlan = buildReadingV2LaunchReadPlan({
        surface: input.launchSurface,
        materialId: input.materialId,
        snapshotVersionId: input.snapshotVersionId,
    });
    const projectionSnap = await get(ref(database, projectionReadPlan.projectionPath));
    const launchDecision = resolveReadingV2LaunchDecision({
        surface: input.launchSurface,
        metadata: { deliveryEngine: READING_V2_ENGINE },
        projection: projectionSnap.exists() ? projectionSnap.val() : undefined,
    });

    if (launchDecision.status !== 'runtime') {
        throw new Error(launchDecision.status === 'blocked'
            ? launchDecision.message
            : 'Reading V2 homework projection could not be resolved');
    }

    return launchDecision.projection;
};

const readFrozenReadingPassageAssignmentProjection = async (
    assignmentPayloadPath: string | undefined,
): Promise<ReadingV2DerivedProjection | null> => {
    if (!assignmentPayloadPath) {
        return null;
    }

    const projectionSnap = await get(ref(database, assignmentPayloadPath));
    if (!projectionSnap.exists()) {
        throw new Error('Reading V2 frozen assignment payload is missing.');
    }

    return projectionSnap.val() as ReadingV2DerivedProjection;
};

const resolveReadingPassageHomeworkProjection = async (input: {
    homework: HomeworkAssignment;
    launchSurface: ReadingV2LaunchSurface;
}): Promise<ReadingV2DerivedProjection | null> => {
    const items = getReadingPassageHomeworkLaunchItems(input.homework);

    if (items.length === 0) {
        return null;
    }

    if (input.homework.materialType === 'reading-passage-set') {
        const frozenProjection = await readFrozenReadingPassageAssignmentProjection(
            input.homework.readingPassageSet?.assignmentPayloadPath,
        );

        if (frozenProjection) {
            return frozenProjection;
        }
    }

    const projections = await Promise.all(
        items.map((item) =>
            readStudentSafeReadingPassageProjection({
                materialId: item.passageMaterialId,
                snapshotVersionId: item.snapshotVersionId,
                launchSurface: input.launchSurface,
            }),
        ),
    );

    if (input.homework.materialType === 'reading-passage-set') {
        return composeReadingPassageSetProjection({
            homework: input.homework,
            projections,
        });
    }

    return projections[0] ?? null;
};

const isExplicitReadingV2Launch = (testData: unknown): boolean =>
    isReadingV2LaunchCandidate(testData);

const bookLaunchStateStyle = {
    minHeight: '100vh',
    padding: 24,
    background: '#f8f9fa',
    color: '#2b3437',
    boxSizing: 'border-box' as const,
};

const BookPlacementLaunchState = ({
    title,
    message,
    onReturn,
    error = false,
}: {
    readonly title: string;
    readonly message: string;
    readonly onReturn: () => void;
    readonly error?: boolean;
}) => (
    <main style={bookLaunchStateStyle} data-testid="book-placement-launch-state">
        <section
            role={error ? 'alert' : 'status'}
            aria-live="polite"
            style={{ maxWidth: 560, margin: '48px auto', padding: 24, background: '#fff', border: '1px solid #e1e6e8', borderRadius: 12 }}
        >
            <h1 style={{ marginTop: 0, fontSize: '1.5rem' }}>{title}</h1>
            <p>{message}</p>
            <button
                type="button"
                onClick={() => onReturn()}
                style={{ minHeight: 44, padding: '10px 16px', border: 0, borderRadius: 8, background: '#4d44e3', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
                Return
            </button>
        </section>
    </main>
);

const BookPlacementLaunchPage: React.FC<{
    launch: Exclude<BookPlacementLaunchQuery, { readonly kind: 'none' }>;
}> = ({ launch }) => {
    const { user } = useAuth();
    const { navigateTo } = useNavigation('student');
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testTaking);
    const [projection, setProjection] = useState<import('../services/book-delivery/bookDelivery.types').BookRuntimeDeliveryProjection | null>(null);
    const [loading, setLoading] = useState(launch.kind !== 'invalid');
    const [error, setError] = useState<string | null>(launch.kind === 'invalid' ? 'The Book launch link is invalid.' : null);

    const returnToEntry = useCallback((source: 'launch-state' | 'runtime' = 'launch-state') => {
        if (source === 'launch-state') {
            trackAction('bookRuntimeReturn', {
                surface: launch.kind === 'invalid' ? 'unknown' : launch.surface,
                reason: launch.kind === 'invalid' ? launch.reason : 'user_requested',
                destination: launch.kind === 'class'
                    ? 'class-detail'
                    : launch.kind === 'homework' ? 'homework' : 'courses',
                outcome: 'returned',
            });
        }
        if (launch.kind === 'class') {
            navigateTo('STUDENT_CLASS_DETAIL', { classId: launch.classId }, {
                force: true,
                reason: 'book_runtime_return_class',
            });
            return;
        }
        if (launch.kind === 'homework') {
            navigateTo('STUDENT_HOMEWORK', undefined, {
                force: true,
                reason: 'book_runtime_return_homework',
            });
            return;
        }
        navigateTo('STUDENT_COURSES', undefined, {
            force: true,
            reason: 'book_runtime_return_course',
        });
    }, [launch, navigateTo, trackAction]);

    useEffect(() => {
        if (launch.kind === 'invalid') return;
        if (!user?.uid) {
            setError('Sign in again to open this Book.');
            setLoading(false);
            return;
        }

        let mounted = true;
        setLoading(true);
        setError(null);
        setProjection(null);
        void resolveBookPlacementLaunch({
            launch: launch as ValidBookPlacementLaunch,
            studentId: user.uid,
        }).then((result) => {
            if (!mounted) return;
            if (result.status !== 'resolved') {
                trackAction('bookRuntimeLaunchBlocked', {
                    surface: launch.surface,
                    reason: result.reason,
                    ...(launch.kind === 'course'
                        ? { courseMaterialId: launch.courseMaterialId, bindingId: launch.bindingId }
                        : launch.kind === 'class'
                            ? {
                            classId: launch.classId,
                            copyId: launch.copyId,
                            classPlacementId: launch.classPlacementId,
                            classCourseMaterialId: launch.classCourseMaterialId,
                            bindingId: launch.bindingId,
                            }
                            : { homeworkId: launch.homeworkId }),
                    outcome: 'blocked',
                });
                setError('This Book launch is no longer available for your account.');
                setLoading(false);
                return;
            }
            trackAction('launchBookRuntime', {
                surface: launch.surface,
                bindingId: result.projection.bindingId,
                bindingRevision: result.projection.bindingRevision,
                contextId: result.projection.context.contextId,
                recipientId: result.projection.recipientId,
                outcome: 'success',
            });
            setProjection(result.projection);
            setLoading(false);
        }).catch((reason: unknown) => {
            if (!mounted) return;
            trackAction('bookRuntimeLaunchBlocked', {
                surface: launch.surface,
                reason: reason instanceof Error ? reason.name : 'unknown',
                outcome: 'blocked',
            });
            setError('This Book launch could not be resolved.');
            setLoading(false);
        });
        return () => {
            mounted = false;
        };
    }, [launch, trackAction, user?.uid]);

    if (loading) {
        return <BookPlacementLaunchState title="Loading Book" message="Resolving your published Book access." onReturn={returnToEntry} />;
    }
    if (error || !projection) {
        return <BookPlacementLaunchState title="Book unavailable" message={error || 'This Book is not available.'} onReturn={returnToEntry} error />;
    }
    return (
        <BookPlacementRuntimeHost
            onAction={(action, metadata) => trackAction(action, metadata)}
            onReturn={() => returnToEntry('runtime')}
            projection={projection}
        />
    );
};

// ── Router Content ─────────────────────────────────────────────────────────────

const StudentPracticePageContent: React.FC = () => {
    const { materialId } = useParams<{ materialId: string }>();
    const location = useLocation();
    const { navigateTo } = useNavigation('student');
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
    const [readingPassageHomeworkKind, setReadingPassageHomeworkKind] = useState<'reading-passage' | 'reading-passage-set' | null>(null);
    const [readingV2Answers, setReadingV2Answers] = useState<Readonly<Record<string, ReadingV2AnswerValue>>>({});
    const [readingV2AntiCheatConfig, setReadingV2AntiCheatConfig] = useState<AntiCheatConfig | null>(null);
    const [readingV2IntegrityAutoSubmitToken, setReadingV2IntegrityAutoSubmitToken] = useState<string | null>(null);
    const [readingV2StartedAt] = useState(() => (
        typeof locationState.startedAt === 'number' ? locationState.startedAt : Date.now()
    ));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const readingV2RuntimeContainerRef = useRef<HTMLDivElement>(null);

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
            setReadingPassageHomeworkKind(null);
            setReadingV2AntiCheatConfig(null);
            setReadingV2IntegrityAutoSubmitToken(null);

            try {
                setReadingV2Answers({});
                const homeworkForLaunch = locationState.isHomework && locationState.homeworkId
                    ? await getHomeworkById(locationState.homeworkId)
                    : null;
                const homeworkAntiCheatConfig = locationState.isHomework && homeworkForLaunch
                    ? (homeworkForLaunch as { antiCheatConfig?: AntiCheatConfig | null }).antiCheatConfig ?? null
                    : null;
                setReadingV2AntiCheatConfig(homeworkAntiCheatConfig);
                const readingPassageHomeworkProjection = homeworkForLaunch
                    ? await resolveReadingPassageHomeworkProjection({
                        homework: homeworkForLaunch,
                        launchSurface: getReadingV2LaunchSurface(locationState),
                    })
                    : null;

                if (readingPassageHomeworkProjection) {
                    const launchSurface = getReadingV2LaunchSurface(locationState);
                    const readingPassageItems = homeworkForLaunch
                        ? getReadingPassageHomeworkLaunchItems(homeworkForLaunch)
                        : [];
                    trackAction('launchReadingPassageHomeworkRuntime', {
                        surface: launchSurface,
                        homeworkId: homeworkForLaunch?.id,
                        materialId: homeworkForLaunch?.materialId,
                        projectionId: readingPassageHomeworkProjection.projectionId,
                        sourceSnapshotVersionId: readingPassageHomeworkProjection.sourceSnapshotVersionId,
                        outcome: 'success',
                    });
                    trackAction('teacher_materials_reading_passage_homework_launched', {
                        surface: launchSurface,
                        homeworkId: homeworkForLaunch?.id,
                        materialId: homeworkForLaunch?.materialId,
                        materialType: homeworkForLaunch?.materialType,
                        projectionId: readingPassageHomeworkProjection.projectionId,
                        sourceSnapshotVersionId: readingPassageHomeworkProjection.sourceSnapshotVersionId,
                        passageCount: readingPassageItems.length,
                    });
                    setReadingV2Projection(readingPassageHomeworkProjection);
                    setReadingPassageHomeworkKind(
                        homeworkForLaunch?.materialType === 'reading-passage-set'
                            ? 'reading-passage-set'
                            : 'reading-passage',
                    );
                    setTestSkill('Reading');
                    setTestType('ReadingV2');
                    setResolvedSettings({
                        ...DEFAULT_PRACTICE_SETTINGS,
                        timerMinutes: locationState.timerMinutes
                            ?? homeworkForLaunch?.config?.timerMinutes
                            ?? DEFAULT_PRACTICE_SETTINGS.timerMinutes,
                        maxAttempts: locationState.maxAttempts
                            ?? homeworkForLaunch?.config?.maxAttempts
                            ?? DEFAULT_PRACTICE_SETTINGS.maxAttempts,
                    });
                    setLoading(false);
                    return;
                }

                const normalizedHomeworkKind = homeworkForLaunch?.contentRef?.contentKind;
                const studentSafeTestPayloadPath = normalizedHomeworkKind === 'ielts_writing'
                    ? (homeworkForLaunch as { studentSafeTestPayloadPath?: string | null } | null)?.studentSafeTestPayloadPath
                    : null;
                const usesStudentSafeHomeworkProjection = Boolean(
                    normalizedHomeworkKind
                    && STUDENT_SAFE_STANDARD_HOMEWORK_KINDS.has(normalizedHomeworkKind),
                );
                const launchTestPath = studentSafeTestPayloadPath || (usesStudentSafeHomeworkProjection
                    ? `student_safe_tests/${materialId}`
                    : `tests/${materialId}`);
                const launchTestSnap = await get(ref(database, launchTestPath));
                const launchTestData = launchTestSnap.exists() ? launchTestSnap.val() : null;

                if (usesStudentSafeHomeworkProjection && !launchTestData) {
                    throw new Error(`Student-safe homework projection not found for ${materialId}`);
                }

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
                    const metadataTimerMinutes = getReadingV2MetadataTimerMinutes(launchTestData);
                    const homeworkTimerMinutes = locationState.timerMinutes !== undefined
                        ? locationState.timerMinutes
                        : homeworkForLaunch?.config?.timerMinutes !== undefined
                            ? homeworkForLaunch.config.timerMinutes
                            : metadataTimerMinutes ?? DEFAULT_PRACTICE_SETTINGS.timerMinutes;

                    let readingV2Settings: ResolvedPracticeSettings;
                    if (locationState.courseId && locationState.moduleId) {
                        readingV2Settings = await resolvePracticeSettings(
                            locationState.courseId,
                            locationState.moduleId,
                            materialId,
                            { timerMinutes: metadataTimerMinutes, feedbackTiming: 'after_completion' }
                        );
                    } else if (locationState.isHomework) {
                        readingV2Settings = {
                            ...DEFAULT_PRACTICE_SETTINGS,
                            timerMinutes: homeworkTimerMinutes,
                            maxAttempts: locationState.maxAttempts
                                ?? homeworkForLaunch?.config?.maxAttempts
                                ?? DEFAULT_PRACTICE_SETTINGS.maxAttempts,
                        };
                    } else {
                        readingV2Settings = {
                            ...DEFAULT_PRACTICE_SETTINGS,
                            timerMinutes: metadataTimerMinutes ?? DEFAULT_PRACTICE_SETTINGS.timerMinutes,
                        };
                    }

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
                const normalizedSkill = normalizeIeltsSkill(rawSkill);
                const normalizedTestType = rawTestType === 'THCS-THPT'
                    ? 'THCS'
                    : rawTestType === 'IELTS'
                        ? 'IELTS'
                        : null;
                const routeTarget = rawTestType === 'IELTS' && normalizedSkill === 'Writing'
                    ? 'WritingPracticeView'
                    : normalizedTestType === 'IELTS' && normalizedSkill === 'Listening'
                        ? 'ListeningPracticeView'
                        : normalizedTestType === 'THCS'
                            ? 'THCSPracticeView'
                            : 'Unavailable';

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

                if (
                    !normalizedTestType
                    || (
                        normalizedTestType === 'IELTS'
                        && (!normalizedSkill || normalizedSkill === 'Reading')
                    )
                ) {
                    setError(MATERIAL_UNAVAILABLE_MESSAGE);
                    setLoading(false);
                    return;
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
                            homeworkForLaunch ? Promise.resolve(homeworkForLaunch) : getHomeworkById(locationState.homeworkId),
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

    const {
        addEvent: addReadingV2IntegrityEvent,
        shouldAutoSubmit: shouldAutoSubmitReadingV2,
        flushEvents: flushReadingV2IntegrityEvents,
        getIntegrityReport: getReadingV2IntegrityReport,
    } = useTestIntegrity({
        config: readingV2AntiCheatConfig,
        context: locationState.isHomework ? 'homework' : 'solo',
        surface: 'reading_v2_practice',
        studentId: user?.uid || '',
        testId: readingV2Projection?.materialId || materialId || '',
        homeworkId: locationState.homeworkId,
        submissionId: locationState.submissionId,
    });

    useAntiCopyPaste({
        enabled: readingV2AntiCheatConfig?.detectCopyPaste || false,
        containerRef: readingV2RuntimeContainerRef as React.RefObject<HTMLElement>,
        onEvent: addReadingV2IntegrityEvent,
        detectRightClick: readingV2AntiCheatConfig?.detectRightClick || false,
        detectKeyboardShortcuts: readingV2AntiCheatConfig?.detectKeyboardShortcuts || false,
    });

    useFullscreenMode({
        enabled: readingV2AntiCheatConfig?.requireFullscreen || false,
        onFullscreenExit: addReadingV2IntegrityEvent,
    });

    useEffect(() => {
        if (!shouldAutoSubmitReadingV2) {
            return;
        }

        setReadingV2IntegrityAutoSubmitToken((previous) =>
            previous ?? `integrity-auto-submit:${Date.now()}`
        );
    }, [shouldAutoSubmitReadingV2]);

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
            await flushReadingV2IntegrityEvents('reading_v2_practice_submit');
            const result = await submitReadingV2RuntimeAttempt({
                payload: {
                    ...payload,
                    integrityReport: readingV2AntiCheatConfig ? getReadingV2IntegrityReport() : null,
                },
                context: {
                    surface: launchSurface,
                    homeworkId: locationState.homeworkId,
                    courseId: locationState.courseId,
                    moduleId: locationState.moduleId,
                    sourceName: locationState.context?.source?.name ?? readingV2Projection?.content.title,
                },
            });
            const homeworkSubmissionId = locationState.isHomework ? locationState.submissionId : undefined;

            if (homeworkSubmissionId) {
                try {
                    await submitHomework(
                        homeworkSubmissionId,
                        result.resultId,
                        result.totalScore,
                        result.maxScore,
                        result.percentage,
                        undefined,
                        Math.max(0, Math.round((Date.now() - readingV2StartedAt) / 1000)),
                    );
                } catch (homeworkSubmitError) {
                    if (!(homeworkSubmitError instanceof HomeworkSubmissionError
                        && homeworkSubmitError.code === 'ALREADY_SUBMITTED')) {
                        throw homeworkSubmitError;
                    }
                }
            }

            trackAction('submitReadingV2Attempt', {
                ...trackingPayload,
                resultId: result.resultId,
                attemptId: result.attemptId,
                homeworkSubmissionId,
                outcome: 'success',
            });
            if (readingPassageHomeworkKind) {
                trackAction('teacher_materials_reading_passage_homework_submitted', {
                    ...trackingPayload,
                    resultId: result.resultId,
                    attemptId: result.attemptId,
                    materialType: readingPassageHomeworkKind,
                });
            }

            await Promise.allSettled([
                storage.remove(getReadingV2PracticePersistenceKey({
                    studentId: user?.uid,
                    materialId,
                    projectionId: payload.projectionId,
                })),
                studentResumeService.clearResume(),
            ]);
            setReadingV2Answers({});

            if (locationState.isHomework) {
                navigateTo('STUDENT_HOMEWORK', undefined, {
                    replace: true,
                    force: true,
                    state: { justSubmitted: true },
                    reason: 'test_submission_homework',
                });
                return;
            }

            navigateTo('STUDENT_ACADEMIC_RECORD', undefined, {
                replace: true,
                force: true,
                state: { resultId: result.resultId, showResult: true },
                reason: 'test_submission_solo',
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
        locationState.submissionId,
        materialId,
        flushReadingV2IntegrityEvents,
        getReadingV2IntegrityReport,
        readingV2AntiCheatConfig,
        readingV2Projection?.content.title,
        readingPassageHomeworkKind,
        readingV2StartedAt,
        navigateTo,
        trackAction,
        user?.uid,
    ]);
    const readingV2SubmitHandler = isReadingV2RuntimeSubmissionConfigured()
        ? handleReadingV2Submit
        : undefined;

    const handleReadingV2Exit = useCallback(() => {
        const launchSurface = getReadingV2LaunchSurface(locationState);

        trackAction('leaveTest', {
            surface: launchSurface,
            materialId: materialId ?? null,
            homeworkId: locationState.homeworkId ?? null,
            courseId: locationState.courseId ?? null,
            moduleId: locationState.moduleId ?? null,
        });

        if (locationState.isHomework) {
            navigateTo('STUDENT_HOMEWORK', undefined, { reason: 'reading_v2_exit_homework', force: true });
            return;
        }

        if (locationState.courseId) {
            navigateTo('STUDENT_COURSE_DETAIL', { courseId: locationState.courseId }, {
                reason: 'reading_v2_exit_course_material',
                force: true,
            });
            return;
        }

        navigateTo('STUDENT_LIBRARY', undefined, { reason: 'reading_v2_exit_library', force: true });
    }, [
        locationState,
        materialId,
        navigateTo,
        trackAction,
    ]);

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
        const title = error === MATERIAL_UNAVAILABLE_MESSAGE
            ? MATERIAL_UNAVAILABLE_MESSAGE
            : 'Error Loading Test';

        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', maxWidth: 400, padding: '2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>{title}</div>
                    <div style={{ color: '#64748b', marginBottom: '1.5rem' }}>{error || 'Something went wrong'}</div>
                    <button
                        onClick={() => {
                            void studentResumeService.clearResume();
                            navigateTo('STUDENT_DASHBOARD', undefined, {
                                reason: 'practice_unavailable_return',
                                force: true,
                            });
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
        const readingV2Lifecycle: ReadingV2RuntimeLifecycle | undefined = readingV2IntegrityAutoSubmitToken
            ? {
                status: 'in-progress',
                forceSubmitToken: readingV2IntegrityAutoSubmitToken,
            }
            : undefined;

        return (
            <div ref={readingV2RuntimeContainerRef}>
                <ReadingV2RuntimeShell
                    projection={readingV2Projection}
                    onSubmit={readingV2SubmitHandler}
                    onExit={handleReadingV2Exit}
                    onAction={(action, metadata) => trackAction(action, metadata)}
                    initialAnswers={readingV2Answers}
                    onAnswersChange={setReadingV2Answers}
                    persistenceKey={getReadingV2PracticePersistenceKey({
                        studentId: user?.uid,
                        materialId,
                        projectionId: readingV2Projection.projectionId,
                    })}
                    textSizeStorageKey={user?.uid ? `reading_text_size_${user.uid}` : undefined}
                    lifecycle={readingV2Lifecycle}
                    timer={{
                        durationMinutes: resolvedSettings.timerMinutes,
                        startedAt: resolvedSettings.timerMinutes ? readingV2StartedAt : null,
                        pausedDurationMs: 0,
                        running: true,
                        autoSubmitOnExpiry: true,
                    }}
                />
            </div>
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
        case 'THCS':
            return (
                <THCSPracticeView
                    materialId={materialId}
                    practiceContext={practiceContext}
                />
            );

        default:
            return null;
    }
};

// ── Wrap with Error Boundary ───────────────────────────────────────────────────

export const StudentPracticePage: React.FC = () => {
    const { materialId } = useParams<{ materialId: string }>();
    const location = useLocation();
    const bookLaunch = parseBookPlacementLaunchQuery(location.search);
    if (isExplicitBookPlacementLaunch(bookLaunch)) {
        return (
            <TestErrorBoundary sessionCode={materialId}>
                <BookPlacementLaunchPage launch={bookLaunch} />
            </TestErrorBoundary>
        );
    }
    return (
        <TestErrorBoundary sessionCode={materialId}>
            <StudentPracticePageContent />
        </TestErrorBoundary>
    );
};

export default StudentPracticePage;
