import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getCourse, getModulesByCourse, getMaterialsByCourse, getStudentCourseProgress } from '../services/courseManager';
import { getEnrollmentsByStudent } from '../services/enrollmentManager';
import { getClass } from '../services/classManager';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens } from '../components/layout/studentLayoutStyles';
import { ref, get } from 'firebase/database';
// @ts-ignore
import { database } from '../services/firebase';
import { resolvePracticeSettings } from '../services/practiceSettingsResolver';
import { getStudentResults } from '../services/testResults.service';
import { clearSoloProgress } from '../hooks/solo/useSoloAutoSave';
import { SoloResumeModal } from '../components/test/SoloResumeModal';
import { toast } from '../components/modern/ToastNotification';
import type { Course, Module, CourseMaterial } from '../types/course.types';
import type { ClassSession } from '../types/class.types';
import type { SoloSessionProgress } from '../types/practice.types';
import { useResolvedStudentHomeworkList, useResolvedStudentShellData } from '../context/StudentShellDataContext';
import { storage } from '../core/platform/storage';
import { buildSoloProgressStorageKey } from '../services/soloProgress.service';
import {
    buildReadingV2LaunchReadPlan,
    createReadingV2LaunchMaterialSummary,
    isReadingV2LaunchCandidate,
} from '../services/reading-v2/readingV2LaunchIntegration.service';
import type { ReadingV2DerivedProjection } from '../services/reading-v2/readingV2Projection.service';
import type { ReadingV2MaterialMetadata } from '../services/reading-v2/readingV2MaterialMetadata.service';
import { createCourseBookPlacementBrowserClient, isCourseBookPlacementPresentationEnabled } from '../services/book-delivery/courseBookPlacement.browser';
import { buildBookPlacementPracticeRouteParams } from '../services/book-delivery/bookPlacementLaunch.browser';
import { CourseBookPrepareAction } from '../components/course/CourseBookPrepareAction';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { useNavigation } from '../hooks/useNavigation';

interface TestMeta { title: string; type: string; duration?: number; testType?: string; metadata?: any; }

interface PopulatedModule extends Module {
    materials: CourseMaterial[];
    status: 'locked' | 'available' | 'completed';
    completionCount: number;
}

interface StudentCourseDetailCacheEntry {
    course: Course;
    classData: ClassSession | null;
    modules: PopulatedModule[];
    overallProgress: number;
    expandedModule: string | null;
    testMeta: Record<string, TestMeta>;
    directEnrollmentId: string | null;
}

const studentCourseDetailCache = new Map<string, StudentCourseDetailCacheEntry>();

function getStudentCourseDetailCache(studentId?: string | null, courseId?: string): StudentCourseDetailCacheEntry | null {
    if (!studentId || !courseId) return null;
    return studentCourseDetailCache.get(`${studentId}:${courseId}`) ?? null;
}

const fallbackCourseMaterialMeta = (): TestMeta => ({
    title: 'Course material',
    type: 'test',
});

async function readCourseMaterialMeta(materialId: string): Promise<TestMeta> {
    try {
        const metadataPlan = buildReadingV2LaunchReadPlan({
            surface: 'course-material',
            materialId,
        });
        const metadataSnap = await get(ref(database, metadataPlan.metadataPath));
        const metadata = metadataSnap.exists()
            ? metadataSnap.val() as ReadingV2MaterialMetadata
            : null;

        if (metadata && isReadingV2LaunchCandidate(metadata)) {
            let projection: ReadingV2DerivedProjection | null = null;

            try {
                const projectionPlan = buildReadingV2LaunchReadPlan({
                    surface: 'course-material',
                    materialId,
                    snapshotVersionId: metadata.publishedSnapshotVersionId,
                });
                const projectionSnap = await get(ref(database, projectionPlan.projectionPath));
                projection = projectionSnap.exists()
                    ? projectionSnap.val() as ReadingV2DerivedProjection
                    : null;
            } catch {
                projection = null;
            }

            const summary = createReadingV2LaunchMaterialSummary({ metadata, projection });

            return {
                title: summary.title,
                type: 'ReadingV2',
                duration: summary.durationMinutes,
                testType: 'ReadingV2',
                metadata: summary.metadata,
            };
        }
    } catch {
        // Non-Reading V2 legacy course materials can be denied at the Reading V2 metadata path.
    }

    try {
        const snap = await get(ref(database, `tests/${materialId}`));
        const data = snap.exists() ? snap.val() : null;
        const isThcs = data?.testType === 'THCS-THPT';
        const title = isThcs ? (data?.metadata?.title || 'Untitled THCS Test') : (data?.title || 'Untitled');

        return {
            title,
            type: data?.type || 'test',
            duration: isThcs ? data?.metadata?.duration : data?.duration,
            testType: data?.testType,
            metadata: data?.metadata,
        };
    } catch {
        return fallbackCourseMaterialMeta();
    }
}

const localStyles = {
    card: { background: studentTokens.bgSurface, borderRadius: 12, border: `1px solid ${studentTokens.borderWhisper}`, padding: 24, marginBottom: 16 },
    moduleCard: {
        background: studentTokens.bgSurface, borderRadius: 12, border: `1px solid ${studentTokens.borderWhisper}`, marginBottom: 12, overflow: 'hidden' as const
    },
    moduleHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer', padding: '16px 20px', transition: 'background 0.15s'
    },
    materialRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', borderTop: `1px solid ${studentTokens.borderWhisper}`,
        background: studentTokens.bgShell, transition: 'background 0.15s'
    },
    startBtn: {
        background: studentTokens.accent, color: 'white', border: 'none', borderRadius: 8,
        minHeight: 44, minWidth: 44, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const,
        transition: 'background 0.2s', whiteSpace: 'nowrap' as const
    },
    completedBtn: {
        background: '#edf5f9', color: '#4c5458', border: 'none', borderRadius: 8,
        minHeight: 44, minWidth: 44, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const,
        whiteSpace: 'nowrap' as const
    },
    disabledBtn: {
        background: studentTokens.bgSurfaceAlt, color: studentTokens.textDim, border: 'none', borderRadius: 8,
        minHeight: 44, minWidth: 44, padding: '8px 18px', fontWeight: 700, cursor: 'not-allowed', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const,
        whiteSpace: 'nowrap' as const
    },
    outlineBtn: {
        background: 'transparent', color: studentTokens.textBody, border: `1px solid ${studentTokens.borderSoft}`, borderRadius: 8,
        minHeight: 44, minWidth: 44, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' as const
    },
};

type CourseStatusTone = 'locked' | 'completed' | 'available';

const CourseStatusBadge = ({ status }: { readonly status: CourseStatusTone }) => {
    const palette = {
        locked: { background: '#f1f3f4', color: studentTokens.textMuted },
        completed: { background: '#dcfce7', color: '#166534' },
        available: { background: studentTokens.accentSoft, color: studentTokens.accentHover },
    }[status];

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                minHeight: 28,
                padding: '4px 10px',
                borderRadius: 999,
                background: palette.background,
                color: palette.color,
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
            }}
        >
            {status === 'locked' ? 'Locked' : status === 'completed' ? 'Done' : 'Available'}
        </span>
    );
};

const CourseProgressBar = ({ value }: { readonly value: number }) => {
    const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeValue}
            style={{ height: 8, borderRadius: 999, background: studentTokens.bgSurfaceAlt, overflow: 'hidden' }}
        >
            <div
                aria-hidden="true"
                style={{ width: `${safeValue}%`, height: '100%', borderRadius: 999, background: studentTokens.accent, transition: 'width 0.2s ease-out' }}
            />
        </div>
    );
};

const CourseLoader = () => (
    <>
        <span
            role="status"
            aria-label="Loading course"
            style={{
                display: 'inline-block',
                width: 32,
                height: 32,
                border: `3px solid ${studentTokens.accentSoft}`,
                borderTopColor: studentTokens.accent,
                borderRadius: '50%',
                animation: 'studentCourseSpinner 0.8s linear infinite',
            }}
        />
        <style>{'@keyframes studentCourseSpinner { to { transform: rotate(360deg); } }'}</style>
    </>
);

const StudentCourseDetailPage: React.FC = () => {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();
    const { navigateTo } = useNavigation('student');
    const { user, profile } = useAuth();
    const { notStarted } = useResolvedStudentHomeworkList(user?.uid || '');
    const { enrolledClasses } = useResolvedStudentShellData();
    const initialCacheEntry = getStudentCourseDetailCache(user?.uid, courseId);
    const { trackAction } = useFeatureTracking(FEATURE_IDS.courses);
    const courseBookEnabled = isCourseBookPlacementPresentationEnabled();
    const courseBookClient = useMemo(
        () => courseBookEnabled ? createCourseBookPlacementBrowserClient() : null,
        [courseBookEnabled],
    );

    const [course, setCourse] = useState<Course | null>(() => initialCacheEntry?.course ?? null);
    const [classData, setClassData] = useState<ClassSession | null>(() => initialCacheEntry?.classData ?? null);
    const [modules, setModules] = useState<PopulatedModule[]>(() => initialCacheEntry?.modules ?? []);
    const [loading, setLoading] = useState(() => Boolean(user?.uid && courseId) && !initialCacheEntry);
    const [error, setError] = useState<string | null>(null);
    const [overallProgress, setOverallProgress] = useState(() => initialCacheEntry?.overallProgress ?? 0);
    const [expandedModule, setExpandedModule] = useState<string | null>(() => initialCacheEntry?.expandedModule ?? null);
    const [testMeta, setTestMeta] = useState<Record<string, TestMeta>>(() => initialCacheEntry?.testMeta ?? {});
    const [directEnrollmentId, setDirectEnrollmentId] = useState<string | null>(
        () => initialCacheEntry?.directEnrollmentId ?? null,
    );

    const [resumeModalOpen, setResumeModalOpen] = useState(false);
    const [pendingMaterial, setPendingMaterial] = useState<{ materialId: string; moduleId: string; duration?: number } | null>(null);
    const [pendingProgress, setPendingProgress] = useState<SoloSessionProgress | null>(null);

    useEffect(() => {
        if (user?.uid && courseId) {
            const cachedEntry = getStudentCourseDetailCache(user.uid, courseId);
            if (cachedEntry) {
                setCourse(cachedEntry.course);
                setClassData(cachedEntry.classData);
                setModules(cachedEntry.modules);
                setOverallProgress(cachedEntry.overallProgress);
                setExpandedModule(cachedEntry.expandedModule);
                setTestMeta(cachedEntry.testMeta);
                setDirectEnrollmentId(cachedEntry.directEnrollmentId);
                setLoading(false);
            }

            void loadCourseData();
            return;
        }

        setCourse(null);
        setClassData(null);
        setModules([]);
        setOverallProgress(0);
        setExpandedModule(null);
        setTestMeta({});
        setDirectEnrollmentId(null);
        setLoading(false);
        setError(null);
    }, [courseId, enrolledClasses, user?.uid]);

    const loadCourseData = async () => {
        if (!user?.uid || !courseId) return;
        const cachedEntry = getStudentCourseDetailCache(user.uid, courseId);
        if (cachedEntry) {
            setCourse(cachedEntry.course);
            setClassData(cachedEntry.classData);
            setModules(cachedEntry.modules);
            setOverallProgress(cachedEntry.overallProgress);
            setExpandedModule(cachedEntry.expandedModule);
            setTestMeta(cachedEntry.testMeta);
            setDirectEnrollmentId(cachedEntry.directEnrollmentId);
        }

        setLoading(!cachedEntry);
        setError(null);
        try {
            const [courseRes, allEnrollments, modulesRes, materialsRes, progressRes] = await Promise.all([
                getCourse(courseId),
                getEnrollmentsByStudent(user.uid, { studentClasses: enrolledClasses }),
                getModulesByCourse(courseId),
                getMaterialsByCourse(courseId),
                getStudentCourseProgress(user.uid, courseId)
            ]);

            if (!courseRes) throw new Error('Course not found');
            if (courseRes.archivedAt) throw new Error('This course has been archived by the teacher and is no longer accessible.');
            setCourse(courseRes);

            const directEnrollment = allEnrollments.find(e => e.courseId === courseId
                && !e.sourceClassId && e.enrollmentType !== 'class-based' && e.status === 'active');
            const studentEnrollment = directEnrollment ?? allEnrollments.find(e => e.courseId === courseId);
            if (!studentEnrollment) throw new Error('You are not enrolled in this course');
            const nextDirectEnrollmentId = directEnrollment?.id ?? null;
            setDirectEnrollmentId(nextDirectEnrollmentId);

            let currentClass: ClassSession | null = null;
            if (studentEnrollment.sourceClassId) {
                currentClass = await getClass(studentEnrollment.sourceClassId);
                setClassData(currentClass);
            }

            // Enrich materials with real test titles and types
            let nextTestMeta: Record<string, TestMeta> = {};
            if (materialsRes.length > 0) {
                const uniqueIds = [...new Set(materialsRes
                    .filter(m => m.materialKind !== 'book-delivery')
                    .map(m => m.materialId))];
                const entries = await Promise.all(uniqueIds.map(async (tid) => [
                    tid,
                    await readCourseMaterialMeta(tid),
                ] as [string, TestMeta]));
                nextTestMeta = Object.fromEntries(entries);
            }
            setTestMeta(nextTestMeta);

            // Populate modules with materials and status
            const populated = modulesRes.map(mod => {
                const modMaterials = materialsRes.filter(m => m.moduleId === mod.id);
                const legacyMaterials = modMaterials.filter(m => m.materialKind !== 'book-delivery');
                const completedCount = legacyMaterials.filter(m => progressRes?.completedMaterials?.[m.materialId]).length;

                let status: 'locked' | 'available' | 'completed' = 'available';
                const classProgress = currentClass?.moduleProgress?.[mod.id];
                if (classProgress) status = classProgress.status;
                if (legacyMaterials.length > 0 && completedCount === legacyMaterials.length
                    && legacyMaterials.length === modMaterials.length) status = 'completed';

                return { ...mod, materials: modMaterials, status, completionCount: completedCount };
            });

            setModules(populated);
            const nextExpandedModule = populated.length > 0
                ? populated.find(m => m.status === 'available')?.id ?? populated[0]?.id ?? null
                : null;
            setExpandedModule(nextExpandedModule);

            let nextOverallProgress = 0;
            const legacyCourseMaterials = materialsRes.filter(m => m.materialKind !== 'book-delivery');
            if (legacyCourseMaterials.length > 0) {
                const totalCompleted = legacyCourseMaterials.filter(m => progressRes?.completedMaterials?.[m.materialId]).length;
                nextOverallProgress = Math.round((totalCompleted / legacyCourseMaterials.length) * 100);
            }
            setOverallProgress(nextOverallProgress);

            studentCourseDetailCache.set(`${user.uid}:${courseId}`, {
                course: courseRes,
                classData: currentClass,
                modules: populated,
                overallProgress: nextOverallProgress,
                expandedModule: nextExpandedModule,
                testMeta: nextTestMeta,
                directEnrollmentId: nextDirectEnrollmentId,
            });

        } catch (err) {
            const nextError = err instanceof Error ? err.message : 'Failed to load course details';
            setError(nextError);

            if (/course not found|not enrolled|archived/i.test(nextError)) {
                studentCourseDetailCache.delete(`${user.uid}:${courseId}`);
                setCourse(null);
                setClassData(null);
                setModules([]);
                setOverallProgress(0);
                setExpandedModule(null);
                setTestMeta({});
                setDirectEnrollmentId(null);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleStartMaterial = async (material: CourseMaterial, moduleId: string) => {
        if (!user?.uid) return;
        const studentId = user.uid;

        try {
            // Step 1: Check enabled
            const resolved = await resolvePracticeSettings(
                courseId!, moduleId, material.materialId,
                { timerMinutes: testMeta[material.materialId]?.duration ?? null, feedbackTiming: 'after_completion' }
            );

            if (!resolved.enabled) {
                toast.show({ title: 'Not Available', message: 'Practice not available for this material', tone: 'warning' });
                return;
            }

            // Step 2: Check maxAttempts
            if (resolved.maxAttempts !== null) {
                const allResults = await getStudentResults(studentId);
                const materialResults = allResults.filter((r: any) => r.testId === material.materialId);
                if (materialResults.length >= resolved.maxAttempts) {
                    toast.show({ title: 'Limit Reached', message: `Maximum attempts reached (${materialResults.length}/${resolved.maxAttempts})`, tone: 'error' });
                    return;
                }
            }

            // Step 3: Check resume
            const key = buildSoloProgressStorageKey({
                materialId: material.materialId,
                studentId,
                scopeContext: {
                    mode: 'course_material',
                    courseId: courseId || undefined,
                    moduleId,
                },
            });
            const saved = await storage.get<SoloSessionProgress>(key);
            if (saved) {
                setPendingMaterial({ materialId: material.materialId, moduleId, duration: testMeta[material.materialId]?.duration });
                setPendingProgress(saved);
                setResumeModalOpen(true);
                return;
            }

            // Step 4: Navigate — both IELTS and THCS go through the unified practice page
            navigate(`/student/practice/${material.materialId}`, {
                state: {
                    courseId,
                    moduleId,
                    courseName: course?.originalName || course?.name || '',
                    context: { type: 'course_material', source: { type: 'course', id: courseId, name: course?.originalName || course?.name || '' } },
                }
            });
        } catch (error) {
            console.error("Failed to start material:", error);
            toast.show({ title: 'Error', message: 'Failed to start practice mode.', tone: 'error' });
        }
    };



    if (loading && !course) {
        return (
            <StudentLayout mobileTitle="Loading..." sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />}>
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <CourseLoader />
                    <p style={{ color: studentTokens.textMuted, marginTop: 16 }}>Loading course...</p>
                </div>
            </StudentLayout>
        );
    }

    if (!course) {
        return (
            <StudentLayout mobileTitle="Error" sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />}>
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠️</div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>Access Error</h2>
                    <p style={{ color: studentTokens.textMuted, fontSize: '1rem', margin: '0 0 24px' }}>{error || 'An unexpected error occurred.'}</p>
                    <button style={localStyles.outlineBtn} onClick={() => navigate('/student/courses')}>Back to My Courses</button>
                </div>
            </StudentLayout>
        );
    }

    const totalMaterials = modules.reduce(
        (acc, m) => acc + m.materials.filter(material => material.materialKind !== 'book-delivery').length,
        0,
    );
    const completedMaterials = modules.reduce((acc, m) => acc + m.completionCount, 0);

    return (
        <StudentLayout
            mobileTitle={course.originalName || course.name}
            sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />}
        >
            {/* ── Sticky Header ── */}
            <div style={S.feedHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                        onClick={() => navigate('/student/courses')}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, padding: 8, borderRadius: 8, color: studentTokens.textMuted }}
                        onMouseEnter={e => e.currentTarget.style.background = studentTokens.bgSurfaceStrong}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        aria-label="Back to courses"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div style={S.feedHeaderText}>
                        <h2 style={{ ...S.feedHeaderTitle, margin: 0 }}>{course.originalName || course.name}</h2>
                        <p style={S.feedHeaderSubtitle}>{course.type}</p>
                    </div>
                </div>
            </div>

            {error && (
                <div style={{ margin: '0 16px 16px', padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: 12, border: '1px solid #fecaca' }}>
                    {error}
                </div>
            )}

            <div style={{ padding: 16 }}>

                {/* ── Progress Summary Card ── */}
                <div style={{ ...localStyles.card, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    {/* Circular progress ring */}
                    <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
                        <svg width="72" height="72" viewBox="0 0 72 72">
                            <circle cx="36" cy="36" r="30" fill="none" stroke={studentTokens.bgSurfaceAlt} strokeWidth="6" />
                            <circle
                                cx="36" cy="36" r="30" fill="none" stroke={studentTokens.accent} strokeWidth="6"
                                strokeDasharray={`${2 * Math.PI * 30}`}
                                strokeDashoffset={`${2 * Math.PI * 30 * (1 - overallProgress / 100)}`}
                                strokeLinecap="round"
                                style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                        </svg>
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', color: studentTokens.accent }}>
                            {overallProgress}%
                        </span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 4px' }}>Your Progress</h3>
                        <p style={{ fontSize: '0.875rem', color: studentTokens.textMuted, margin: '0 0 10px' }}>
                            {completedMaterials} of {totalMaterials} materials completed
                        </p>
                        <CourseProgressBar value={overallProgress} />
                    </div>
                </div>

                {/* ── Class banner ── */}
                {classData && (
                    <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={studentTokens.accentHover} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        <p style={{ fontSize: '0.875rem', color: studentTokens.accentHover, margin: 0, lineHeight: 1.5 }}>
                            Linked to class: <strong>{classData.name}</strong> — your teacher controls which modules are unlocked.
                        </p>
                    </div>
                )}

                {/* ── Modules ── */}
                {modules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📂</div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>No modules yet</h3>
                        <p style={{ color: studentTokens.textMuted, fontSize: '0.9375rem', margin: 0 }}>Your teacher hasn't added any modules to this course yet.</p>
                    </div>
                ) : (
                    <div>
                        {modules.map((module, idx) => {
                            const isExpanded = expandedModule === module.id;
                            const isLocked = module.status === 'locked';
                            const isCompleted = module.status === 'completed';

                            const iconBg = isLocked ? '#f3f4f6' : isCompleted ? '#d1fae5' : '#eef2ff';
                            const iconColor = isLocked ? studentTokens.textDim : isCompleted ? '#4c5458' : studentTokens.accent;

                            return (
                                <div key={module.id} style={localStyles.moduleCard}>
                                    {/* Module Header */}
                                    <div
                                        style={localStyles.moduleHeader}
                                        onClick={() => !isLocked && setExpandedModule(isExpanded ? null : module.id)}
                                        onMouseEnter={e => { if (!isLocked) e.currentTarget.style.background = '#f9fafb'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                            {/* Icon box */}
                                            <div style={{ width: 40, height: 40, borderRadius: 10, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {isLocked ? (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                    </svg>
                                                ) : isCompleted ? (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                ) : (
                                                    <span style={{ fontWeight: 800, fontSize: '0.875rem' }}>{idx + 1}</span>
                                                )}
                                            </div>
                                            <div>
                                                <p style={{ fontWeight: 700, color: isLocked ? studentTokens.textDim : studentTokens.textPrimary, margin: 0, fontSize: '0.9375rem' }}>{module.name}</p>
                                                <p style={{ fontSize: '0.8125rem', color: studentTokens.textMuted, margin: 0 }}>
                                                    {module.materials.length} material{module.materials.length !== 1 ? 's' : ''}
                                                    {!isLocked && ` · ${module.completionCount} done`}
                                                </p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <CourseStatusBadge status={isLocked ? 'locked' : isCompleted ? 'completed' : 'available'} />
                                            {!isLocked && (
                                                <svg
                                                    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"
                                                    strokeLinecap="round" strokeLinejoin="round"
                                                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
                                                >
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>

                                    {/* Module Materials */}
                                    {isExpanded && !isLocked && (
                                        <div>
                                            {module.materials.length === 0 ? (
                                                <div style={{ padding: '20px 20px', borderTop: `1px solid ${studentTokens.borderWhisper}`, color: studentTokens.textDim, fontSize: '0.875rem', fontStyle: 'italic', textAlign: 'center' }}>
                                                    No materials added to this module yet.
                                                </div>
                                            ) : (
                                                module.materials.map(material => {

                                                    return (
                                                        <div
                                                            key={material.id}
                                                            style={localStyles.materialRow}
                                                            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                                                            onMouseLeave={e => e.currentTarget.style.background = '#fafafa'}
                                                        >
                                                            {/* Material Info */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                                                                <div style={{ width: 34, height: 34, borderRadius: 8, background: studentTokens.accentSoft, color: studentTokens.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                        <polygon points="5 3 19 12 5 21 5 3" />
                                                                    </svg>
                                                                </div>
                                                                <div style={{ minWidth: 0 }}>
                                                                    <p style={{ fontWeight: 600, color: studentTokens.textPrimary, margin: '0 0 2px', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {material.materialKind === 'book-delivery'
                                                                            ? material.bookDeliveryPlacement?.displayTitle || 'Book activity'
                                                                            : testMeta[material.materialId]?.title || 'Untitled'}
                                                                    </p>
                                                                    {/* Phase 3 Task 5.2: THCS badge */}
                                                                    {material.materialKind === 'book-delivery' ? (
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, background: '#ede9fe', color: '#6d28d9' }}>
                                                                            Book
                                                                        </span>
                                                                    ) : testMeta[material.materialId]?.testType === 'THCS-THPT' ? (
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed' }}>
                                                                            THCS-THPT
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4, background: testMeta[material.materialId]?.type === 'Custom' ? '#ede9fe' : '#e0f2fe', color: testMeta[material.materialId]?.type === 'Custom' ? '#7c3aed' : '#0369a1' }}>
                                                                            {testMeta[material.materialId]?.type === 'Custom' ? 'Quiz' : 'Test'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* CTA */}
                                                            {material.materialKind === 'book-delivery' ? (
                                                                courseBookClient ? (
                                                                    <CourseBookPrepareAction
                                                                        courseMaterialId={material.id}
                                                                        legacyEnrollmentId={directEnrollmentId}
                                                                        prepare={(request) => courseBookClient.prepare(request)}
                                                                        onPrepared={(preparedProjection) => {
                                                                            const candidate = preparedProjection as {
                                                                                projectionKind?: unknown;
                                                                                bindingId?: unknown;
                                                                                context?: { kind?: unknown; contextId?: unknown };
                                                                            };
                                                                            if (candidate.projectionKind !== 'book-runtime-delivery'
                                                                                || typeof candidate.bindingId !== 'string'
                                                                                || candidate.context?.kind !== 'course'
                                                                                || candidate.context.contextId !== material.id) {
                                                                                throw new Error('course_book_canonical_projection_required');
                                                                            }
                                                                            navigateTo(
                                                                                'STUDENT_PRACTICE',
                                                                                buildBookPlacementPracticeRouteParams(material.materialId, {
                                                                                    kind: 'course',
                                                                                    surface: 'course',
                                                                                    courseMaterialId: material.id,
                                                                                    bindingId: candidate.bindingId,
                                                                                }),
                                                                                { force: true, reason: 'course_book_runtime_launch' },
                                                                            );
                                                                        }}
                                                                        trackAction={trackAction}
                                                                        style={localStyles.startBtn}
                                                                    />
                                                                ) : (
                                                                    <button type="button" style={localStyles.disabledBtn} disabled>Unavailable</button>
                                                                )
                                                            ) : (
                                                            <button
                                                                style={localStyles.startBtn}
                                                                onClick={() => handleStartMaterial(material, module.id)}
                                                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = studentTokens.accentHover}
                                                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = studentTokens.accent}
                                                            >
                                                                Start →
                                                            </button>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}

                                    {/* Locked placeholder */}
                                    {isExpanded && isLocked && (
                                        <div style={{ padding: '24px 20px', borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
                                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={studentTokens.outlineSoft} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block' }}>
                                                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                            </svg>
                                            <p style={{ color: studentTokens.textDim, fontSize: '0.9rem', margin: 0, fontWeight: 500 }}>
                                                This module is locked by your teacher.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {pendingMaterial && (
                <SoloResumeModal
                    opened={resumeModalOpen}
                    onClose={() => { setResumeModalOpen(false); setPendingMaterial(null); setPendingProgress(null); }}
                    onResume={() => {
                        setResumeModalOpen(false);
                        navigate(`/student/practice/${pendingMaterial.materialId}`, {
                            state: {
                                courseId,
                                moduleId: pendingMaterial.moduleId,
                                courseName: course?.originalName || course?.name || '',
                                context: { type: 'course_material', source: { type: 'course', id: courseId, name: course?.originalName || course?.name || '' } },
                                resumeFrom: pendingProgress
                            },
                        });
                    }}
                    onStartNew={() => {
                        void clearSoloProgress(pendingMaterial.materialId, user?.uid || '', {
                            mode: 'course_material',
                            courseId: courseId || undefined,
                            moduleId: pendingMaterial.moduleId,
                        });
                        setResumeModalOpen(false);
                        setPendingProgress(null);
                        navigate(`/student/practice/${pendingMaterial.materialId}`, {
                            state: {
                                courseId,
                                moduleId: pendingMaterial.moduleId,
                                courseName: course?.originalName || course?.name || '',
                                context: { type: 'course_material', source: { type: 'course', id: courseId, name: course?.originalName || course?.name || '' } }
                            },
                        });
                    }}
                    savedProgress={pendingProgress || {
                        materialId: pendingMaterial.materialId,
                        studentId: user?.uid || '',
                        answers: {},
                        currentQuestion: 1,
                        timeElapsed: 0,
                        startedAt: Date.now(),
                        lastSavedAt: Date.now(),
                    }}
                    totalQuestions={0} // Client will calculate this after mounting the standalone standalone solo component
                />
            )}
        </StudentLayout>
    );
};

export default StudentCourseDetailPage;
