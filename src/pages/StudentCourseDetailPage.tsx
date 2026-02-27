import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Badge, Loader, Progress } from '@mantine/core';
import { useAuth } from '../hooks/useAuth';
import { getCourse, getModulesByCourse, getMaterialsByCourse, getStudentCourseProgress } from '../services/courseManager';
import { getEnrollmentsByStudent } from '../services/enrollmentManager';
import { getClass } from '../services/classManager';
import { useStudentHomeworkList } from '../hooks/useHomeworkSubmission';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S } from '../components/layout/studentLayoutStyles';
import { ref, get } from 'firebase/database';
// @ts-ignore
import { database } from '../services/firebase';
import { resolvePracticeSettings } from '../services/practiceSettingsResolver';
import { getStudentResults } from '../services/testResults.service';
import { clearSoloProgress } from '../hooks/solo/useSoloAutoSave';
import { SoloResumeModal } from '../components/test/SoloResumeModal';
import { notifications } from '@mantine/notifications';
import type { Course, Module, CourseMaterial } from '../types/course.types';
import type { ClassSession } from '../types/class.types';

interface TestMeta { title: string; type: string; duration?: number; testType?: string; metadata?: any; }

interface PopulatedModule extends Module {
    materials: CourseMaterial[];
    status: 'locked' | 'available' | 'completed';
    completionCount: number;
}

const localStyles = {
    card: { background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24, marginBottom: 16 },
    moduleCard: {
        background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 12, overflow: 'hidden' as const
    },
    moduleHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer', padding: '16px 20px', transition: 'background 0.15s'
    },
    materialRow: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', borderTop: '1px solid #f3f4f6',
        background: '#fafafa', transition: 'background 0.15s'
    },
    startBtn: {
        background: '#4f46e5', color: 'white', border: 'none', borderRadius: 999,
        padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem',
        transition: 'background 0.2s', whiteSpace: 'nowrap' as const
    },
    completedBtn: {
        background: '#d1fae5', color: '#059669', border: 'none', borderRadius: 999,
        padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem',
        whiteSpace: 'nowrap' as const
    },
    disabledBtn: {
        background: '#f3f4f6', color: '#9ca3af', border: 'none', borderRadius: 999,
        padding: '8px 18px', fontWeight: 700, cursor: 'not-allowed', fontSize: '0.8125rem',
        whiteSpace: 'nowrap' as const
    },
    outlineBtn: {
        background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 999,
        padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem'
    },
};

const StudentCourseDetailPage: React.FC = () => {
    const { courseId } = useParams<{ courseId: string }>();
    const navigate = useNavigate();
    const { user, profile } = useAuth();
    const { notStarted } = useStudentHomeworkList(user?.uid || '');

    const [course, setCourse] = useState<Course | null>(null);
    const [classData, setClassData] = useState<ClassSession | null>(null);
    const [modules, setModules] = useState<PopulatedModule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [overallProgress, setOverallProgress] = useState(0);
    const [expandedModule, setExpandedModule] = useState<string | null>(null);
    const [testMeta, setTestMeta] = useState<Record<string, TestMeta>>({}); // materialId → { title, type }

    const [resumeModalOpen, setResumeModalOpen] = useState(false);
    const [pendingMaterial, setPendingMaterial] = useState<{ materialId: string; moduleId: string; duration?: number } | null>(null);

    useEffect(() => {
        if (user?.uid && courseId) {
            loadCourseData();
        }
    }, [user, courseId]);

    const loadCourseData = async () => {
        if (!user?.uid || !courseId) return;
        setLoading(true);
        setError(null);
        try {
            const [courseRes, allEnrollments, modulesRes, materialsRes, progressRes] = await Promise.all([
                getCourse(courseId),
                getEnrollmentsByStudent(user.uid),
                getModulesByCourse(courseId),
                getMaterialsByCourse(courseId),
                getStudentCourseProgress(user.uid, courseId)
            ]);

            if (!courseRes) throw new Error('Course not found');
            if (courseRes.archivedAt) throw new Error('This course has been archived by the teacher and is no longer accessible.');
            setCourse(courseRes);

            const studentEnrollment = allEnrollments.find(e => e.courseId === courseId);
            if (!studentEnrollment) throw new Error('You are not enrolled in this course');

            let currentClass: ClassSession | null = null;
            if (studentEnrollment.sourceClassId) {
                currentClass = await getClass(studentEnrollment.sourceClassId);
                setClassData(currentClass);
            }

            // Enrich materials with real test titles and types
            if (materialsRes.length > 0) {
                const uniqueIds = [...new Set(materialsRes.map(m => m.materialId))];
                const entries = await Promise.all(uniqueIds.map(async (tid) => {
                    const snap = await get(ref(database, `tests/${tid}`));
                    const data = snap.exists() ? snap.val() : null;
                    // Phase 3 Task 5.2: Handle THCS test metadata
                    const isThcs = data?.testType === 'THCS-THPT';
                    const title = isThcs ? (data?.metadata?.title || 'Untitled THCS Test') : (data?.title || 'Untitled');
                    return [tid, {
                        title,
                        type: data?.type || 'test',
                        duration: isThcs ? data?.metadata?.duration : data?.duration,
                        testType: data?.testType,
                        metadata: data?.metadata,
                    }] as [string, TestMeta];
                }));
                setTestMeta(Object.fromEntries(entries));
            }

            // Populate modules with materials and status
            const populated = modulesRes.map(mod => {
                const modMaterials = materialsRes.filter(m => m.moduleId === mod.id);
                const completedCount = modMaterials.filter(m => progressRes?.completedMaterials?.[m.materialId]).length;

                let status: 'locked' | 'available' | 'completed' = 'available';
                const classProgress = currentClass?.moduleProgress?.[mod.id];
                if (classProgress) status = classProgress.status;
                if (modMaterials.length > 0 && completedCount === modMaterials.length) status = 'completed';

                return { ...mod, materials: modMaterials, status, completionCount: completedCount };
            });

            setModules(populated);
            if (populated.length > 0) {
                const firstAvail = populated.find(m => m.status === 'available');
                setExpandedModule(firstAvail?.id ?? populated[0]?.id ?? null);
            }

            if (materialsRes.length > 0) {
                const totalCompleted = materialsRes.filter(m => progressRes?.completedMaterials?.[m.materialId]).length;
                setOverallProgress(Math.round((totalCompleted / materialsRes.length) * 100));
            }

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load course details');
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
                notifications.show({ title: 'Not Available', message: 'Practice not available for this material', color: 'orange' });
                return;
            }

            // Step 2: Check maxAttempts
            if (resolved.maxAttempts !== null) {
                const allResults = await getStudentResults(studentId);
                const materialResults = allResults.filter((r: any) => r.testId === material.materialId);
                if (materialResults.length >= resolved.maxAttempts) {
                    notifications.show({ title: 'Limit Reached', message: `Maximum attempts reached (${materialResults.length}/${resolved.maxAttempts})`, color: 'red' });
                    return;
                }
            }

            // Step 3: Check resume
            const key = `solo_progress_${material.materialId}_${studentId}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                setPendingMaterial({ materialId: material.materialId, moduleId, duration: testMeta[material.materialId]?.duration });
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
            notifications.show({ title: 'Error', message: 'Failed to start practice mode.', color: 'red' });
        }
    };



    if (loading) {
        return (
            <StudentLayout mobileTitle="Loading..." sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />} rightPanel={<div />}>
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <Loader size="md" color="#4f46e5" />
                    <p style={{ color: '#6b7280', marginTop: 16 }}>Loading course...</p>
                </div>
            </StudentLayout>
        );
    }

    if (error || !course) {
        return (
            <StudentLayout mobileTitle="Error" sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />} rightPanel={<div />}>
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠️</div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Access Error</h2>
                    <p style={{ color: '#6b7280', fontSize: '1rem', margin: '0 0 24px' }}>{error || 'An unexpected error occurred.'}</p>
                    <button style={localStyles.outlineBtn} onClick={() => navigate('/student/courses')}>Back to My Courses</button>
                </div>
            </StudentLayout>
        );
    }

    const totalMaterials = modules.reduce((acc, m) => acc + m.materials.length, 0);
    const completedMaterials = modules.reduce((acc, m) => acc + m.completionCount, 0);

    return (
        <StudentLayout
            mobileTitle={course.originalName || course.name}
            sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />}
            rightPanel={<div />}
        >
            {/* ── Sticky Header ── */}
            <div style={S.feedHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                        onClick={() => navigate('/student/courses')}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: 8, borderRadius: '50%', color: '#6b7280' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        aria-label="Back to courses"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h2 style={{ ...S.feedHeaderTitle, margin: 0 }}>{course.originalName || course.name}</h2>
                        <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>{course.type}</p>
                    </div>
                </div>
            </div>

            <div style={{ padding: 16 }}>

                {/* ── Progress Summary Card ── */}
                <div style={{ ...localStyles.card, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    {/* Circular progress ring */}
                    <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
                        <svg width="72" height="72" viewBox="0 0 72 72">
                            <circle cx="36" cy="36" r="30" fill="none" stroke="#e5e7eb" strokeWidth="6" />
                            <circle
                                cx="36" cy="36" r="30" fill="none" stroke="#4f46e5" strokeWidth="6"
                                strokeDasharray={`${2 * Math.PI * 30}`}
                                strokeDashoffset={`${2 * Math.PI * 30 * (1 - overallProgress / 100)}`}
                                strokeLinecap="round"
                                style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.5s ease' }}
                            />
                        </svg>
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', color: '#4f46e5' }}>
                            {overallProgress}%
                        </span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Your Progress</h3>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 10px' }}>
                            {completedMaterials} of {totalMaterials} materials completed
                        </p>
                        <Progress value={overallProgress} size="sm" radius="xl" color="#4f46e5" style={{ background: '#e5e7eb' }} />
                    </div>
                </div>

                {/* ── Class banner ── */}
                {classData && (
                    <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        <p style={{ fontSize: '0.875rem', color: '#4338ca', margin: 0, lineHeight: 1.5 }}>
                            Linked to class: <strong>{classData.name}</strong> — your teacher controls which modules are unlocked.
                        </p>
                    </div>
                )}

                {/* ── Modules ── */}
                {modules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📂</div>
                        <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>No modules yet</h3>
                        <p style={{ color: '#6b7280', fontSize: '0.9375rem', margin: 0 }}>Your teacher hasn't added any modules to this course yet.</p>
                    </div>
                ) : (
                    <div>
                        {modules.map((module, idx) => {
                            const isExpanded = expandedModule === module.id;
                            const isLocked = module.status === 'locked';
                            const isCompleted = module.status === 'completed';

                            const iconBg = isLocked ? '#f3f4f6' : isCompleted ? '#d1fae5' : '#eef2ff';
                            const iconColor = isLocked ? '#9ca3af' : isCompleted ? '#059669' : '#4f46e5';

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
                                                <p style={{ fontWeight: 700, color: isLocked ? '#9ca3af' : '#111827', margin: 0, fontSize: '0.9375rem' }}>{module.name}</p>
                                                <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>
                                                    {module.materials.length} material{module.materials.length !== 1 ? 's' : ''}
                                                    {!isLocked && ` · ${module.completionCount} done`}
                                                </p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <Badge
                                                color={isLocked ? 'gray' : isCompleted ? 'green' : 'indigo'}
                                                variant="light"
                                                size="sm"
                                            >
                                                {isLocked ? 'Locked' : isCompleted ? 'Done' : 'Available'}
                                            </Badge>
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
                                                <div style={{ padding: '20px 20px', borderTop: '1px solid #f3f4f6', color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic', textAlign: 'center' }}>
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
                                                                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                        <polygon points="5 3 19 12 5 21 5 3" />
                                                                    </svg>
                                                                </div>
                                                                <div style={{ minWidth: 0 }}>
                                                                    <p style={{ fontWeight: 600, color: '#111827', margin: '0 0 2px', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {testMeta[material.materialId]?.title || 'Untitled'}
                                                                    </p>
                                                                    {/* Phase 3 Task 5.2: THCS badge */}
                                                                    {testMeta[material.materialId]?.testType === 'THCS-THPT' ? (
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
                                                            <button
                                                                style={localStyles.startBtn}
                                                                onClick={() => handleStartMaterial(material, module.id)}
                                                                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#4338ca'}
                                                                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#4f46e5'}
                                                            >
                                                                Start →
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}

                                    {/* Locked placeholder */}
                                    {isExpanded && isLocked && (
                                        <div style={{ padding: '24px 20px', borderTop: '1px solid #f3f4f6', textAlign: 'center' }}>
                                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', display: 'block' }}>
                                                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                            </svg>
                                            <p style={{ color: '#9ca3af', fontSize: '0.9rem', margin: 0, fontWeight: 500 }}>
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
                    onClose={() => { setResumeModalOpen(false); setPendingMaterial(null); }}
                    onResume={() => {
                        setResumeModalOpen(false);
                        const saved = JSON.parse(localStorage.getItem(`solo_progress_${pendingMaterial.materialId}_${user?.uid}`) || '{}');
                        navigate(`/student/practice/${pendingMaterial.materialId}`, {
                            state: {
                                courseId,
                                moduleId: pendingMaterial.moduleId,
                                courseName: course?.originalName || course?.name || '',
                                context: { type: 'course_material', source: { type: 'course', id: courseId, name: course?.originalName || course?.name || '' } },
                                resumeFrom: saved
                            },
                        });
                    }}
                    onStartNew={() => {
                        clearSoloProgress(pendingMaterial.materialId, user?.uid || '');
                        setResumeModalOpen(false);
                        navigate(`/student/practice/${pendingMaterial.materialId}`, {
                            state: {
                                courseId,
                                moduleId: pendingMaterial.moduleId,
                                courseName: course?.originalName || course?.name || '',
                                context: { type: 'course_material', source: { type: 'course', id: courseId, name: course?.originalName || course?.name || '' } }
                            },
                        });
                    }}
                    savedProgress={JSON.parse(localStorage.getItem(`solo_progress_${pendingMaterial.materialId}_${user?.uid}`) || '{}')}
                    totalQuestions={0} // Client will calculate this after mounting the standalone standalone solo component
                />
            )}
        </StudentLayout>
    );
};

export default StudentCourseDetailPage;
