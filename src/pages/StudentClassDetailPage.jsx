import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, update } from 'firebase/database';
import { useAuth } from '../hooks/useAuth';
import { getClass, subscribeToClass, subscribeToActiveSessions } from '../services/classManager';
import { getSession } from '../services/sessionManager';
import { sessionService } from '../services/sessionService';
import { buildRoute } from '../constants/routes';
import { Loader } from '@mantine/core';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens } from '../components/layout/studentLayoutStyles';
import { database } from '../services/firebase';
import { getStudentResults } from '../services/testResults.service';
import { useResolvedStudentHomeworkList } from '../context/StudentShellDataContext';

const localStyles = {
  card: { background: studentTokens.bgSurface, borderRadius: 12, border: `1px solid ${studentTokens.borderWhisper}`, padding: 24, marginBottom: 16 },
  badgeSuccess: { background: '#edf5f9', color: '#4c5458', border: `1px solid ${studentTokens.borderWhisper}` },
  badgeProgress: { background: studentTokens.accentSoft, color: studentTokens.accentHover, border: `1px solid ${studentTokens.borderWhisper}` },
  badgeAvailable: { background: '#dce4e8', color: studentTokens.textPrimary, border: `1px solid ${studentTokens.borderWhisper}` },
  badgeDefault: { background: studentTokens.bgSurfaceAlt, color: studentTokens.textBody, border: `1px solid ${studentTokens.borderWhisper}` },
  primaryBtn: { background: studentTokens.accent, color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' },
  successBtn: { background: '#4c5458', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' },
  disabledBtn: { background: studentTokens.bgSurfaceAlt, color: studentTokens.textDim, border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'not-allowed', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase' },
  liveSessionCard: { background: studentTokens.bgSurface, border: `1px solid ${studentTokens.borderWhisper}`, borderRadius: 12, padding: '16px 24px', marginBottom: 16 },
  testTag: { background: studentTokens.accentSoft, color: studentTokens.accentHover, padding: '4px 12px', borderRadius: 999, fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase' },
  quizTag: { background: '#edf5f9', color: '#4c5458', padding: '4px 12px', borderRadius: 999, fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase' }
};

const getResolvedAssignmentResult = (assignment, progress, results) => {
  if (!assignment?.testId || !Array.isArray(results) || results.length === 0) {
    return null;
  }

  const matchingResults = results.filter((result) => (
    result.testId === assignment.testId || result.sessionCode === assignment.testId
  ));
  if (matchingResults.length === 0) {
    return null;
  }

  if (typeof progress?.submittedAt === 'number') {
    const exactMatch = matchingResults.find((result) => result.submittedAt === progress.submittedAt);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return [...matchingResults].sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0] || null;
};

const StudentClassDetailPage = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [classData, setClassData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('assignments'); // 'assignments' or 'self-study'
  const [, setSelfStudyContent] = useState({ tests: [], quizzes: [] });
  const [, setIsLoadingSelfStudy] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const { notStarted } = useResolvedStudentHomeworkList(user?.uid || '');
  const repairAttemptedRef = useRef(new Set());

  // Subscribe to active sessions (Live Sessions)
  useEffect(() => {
    if (!classId) return;

    const unsubscribeClassSessions = subscribeToActiveSessions(classId, (classSessionPointers) => {
      if (!classSessionPointers) {
        setActiveSessions([]);
        return;
      }

      const codes = Object.keys(classSessionPointers);

      const verifyAndFetchSessions = async () => {
        const validSessions = [];

        for (const code of codes) {
          try {
            const sessionData = await getSession(code);

            if (sessionData &&
              sessionData.status !== 'completed' &&
              sessionData.status !== 'expired') {
              validSessions.push({
                code,
                ...sessionData
              });
            }
          } catch (e) {
            console.warn(`Skipping invalid session ${code}`, e);
          }
        }

        setActiveSessions(validSessions);
      };

      verifyAndFetchSessions();
    });

    return () => unsubscribeClassSessions();
  }, [classId]);

  // Load class data and subscribe to updates
  useEffect(() => {
    if (!classId) return;

    const loadClass = async () => {
      setIsLoading(true);
      try {
        const data = await getClass(classId);
        setClassData(data);
      } catch (error) {
        console.error('Error loading class:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadClass();

    const unsubscribe = subscribeToClass(classId, (data) => {
      setClassData(data);
    });

    return () => unsubscribe();
  }, [classId]);

  // Load self-study content if enabled
  useEffect(() => {
    if (!classData?.settings?.allowSelfStudy || activeTab !== 'self-study') return;

    const loadSelfStudyContent = async () => {
      setIsLoadingSelfStudy(true);
      try {
        // Placeholder
        setSelfStudyContent({ tests: [], quizzes: [] });
      } catch (error) {
        console.error('Error loading self-study content:', error);
      } finally {
        setIsLoadingSelfStudy(false);
      }
    };

    loadSelfStudyContent();
  }, [classData, activeTab]);

  const getStudentAssignments = () => {
    if (!classData || !user?.uid) return [];

    const student = classData.students?.[user.uid];
    if (!student) return [];

    const assignments = Object.values(classData.assignments || {}).map((assignment) => {
      const studentProgress = student.assignments?.[assignment.id];
      return {
        ...assignment,
        studentProgress,
      };
    });

    return assignments.sort((a, b) => {
      const statusOrder = { in_progress: 0, available: 1, scheduled: 2, completed: 3, graded: 4 };
      return (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5);
    });
  };

  const handleStartTest = (assignment) => {
    if (user) {
      sessionService.setPlayerData(
        user.uid,
        user.displayName || user.email || 'Student',
        assignment.testId,
      );
    }

    if (assignment.testType === 'quiz') {
      navigate(buildRoute('STUDENT_QUIZ', { gameSessionId: assignment.testId }), {
        state: { classId, assignmentId: assignment.id }
      });
    } else {
      navigate(buildRoute('STUDENT_TEST', { sessionCode: assignment.testId }), {
        state: { classId, assignmentId: assignment.id }
      });
    }
  };

  const patchAssignmentResultId = (assignmentId, resultId) => {
    if (!classId || !user?.uid || !assignmentId || !resultId) {
      return;
    }

    setClassData((currentClassData) => {
      const currentStudent = currentClassData?.students?.[user.uid];
      const currentAssignment = currentStudent?.assignments?.[assignmentId];
      if (!currentStudent || !currentAssignment || currentAssignment.resultId === resultId) {
        return currentClassData;
      }

      return {
        ...currentClassData,
        students: {
          ...currentClassData.students,
          [user.uid]: {
            ...currentStudent,
            assignments: {
              ...currentStudent.assignments,
              [assignmentId]: {
                ...currentAssignment,
                resultId,
              },
            },
          },
        },
      };
    });
  };

  const resolveAssignmentResultId = async (assignmentId, assignment, progress, studentResults = null) => {
    if (!assignmentId || !assignment?.testId || !user?.uid) {
      return null;
    }

    if (progress?.resultId) {
      return progress.resultId;
    }

    const results = studentResults || await getStudentResults(user.uid);
    const resolvedResult = getResolvedAssignmentResult(assignment, progress, results);

    if (!resolvedResult?.resultId) {
      return null;
    }

    patchAssignmentResultId(assignmentId, resolvedResult.resultId);

    if (classId) {
      try {
        await update(ref(database, `classes/${classId}/students/${user.uid}/assignments/${assignmentId}`), {
          resultId: resolvedResult.resultId,
        });
      } catch (error) {
        console.warn('Failed to persist repaired assignment resultId:', error);
      }
    }

    return resolvedResult.resultId;
  };

  useEffect(() => {
    if (!classId || !user?.uid || !classData?.students?.[user.uid]) {
      return;
    }

    const student = classData.students[user.uid];
    const assignmentsNeedingRepair = Object.entries(classData.assignments || {})
      .filter(([assignmentId, assignment]) => {
        const progress = student.assignments?.[assignmentId];
        return (
          assignment?.testId &&
          progress &&
          !progress.resultId &&
          (progress.status === 'submitted' || progress.status === 'graded')
        );
      });

    if (assignmentsNeedingRepair.length === 0) {
      return;
    }

    let cancelled = false;

    const repairMissingResultIds = async () => {
      try {
        const studentResults = await getStudentResults(user.uid);
        if (cancelled) {
          return;
        }

        for (const [assignmentId, assignment] of assignmentsNeedingRepair) {
          const progress = student.assignments?.[assignmentId];
          const repairKey = `${assignmentId}:${progress?.submittedAt ?? 'na'}:${progress?.status ?? 'na'}`;
          if (repairAttemptedRef.current.has(repairKey)) {
            continue;
          }

          repairAttemptedRef.current.add(repairKey);
          await resolveAssignmentResultId(assignmentId, assignment, progress, studentResults);
        }
      } catch (error) {
        console.warn('Failed to repair missing assignment result links:', error);
      }
    };

    void repairMissingResultIds();

    return () => {
      cancelled = true;
    };
  }, [classData, classId, user?.uid]);

  const handleViewResults = async (assignment) => {
    const progress = classData?.students?.[user?.uid]?.assignments?.[assignment.id];
    const resultId = progress?.resultId || await resolveAssignmentResultId(assignment.id, assignment, progress);
    if (!resultId) return;
    navigate(buildRoute('RESULT_DETAIL', { resultId }));
  };

  const getAssignmentStatusBadge = (assignment) => {
    const { status, studentProgress } = assignment;

    if (studentProgress?.status === 'submitted' || studentProgress?.status === 'graded') {
      return { text: 'Completed', color: localStyles.badgeSuccess };
    }
    if (studentProgress?.status === 'in_progress') {
      return { text: 'In Progress', color: localStyles.badgeProgress };
    }
    if (status === 'available') {
      return { text: 'Available', color: localStyles.badgeAvailable };
    }
    if (status === 'scheduled') {
      return { text: 'Scheduled', color: localStyles.badgeDefault };
    }
    return { text: 'Not Started', color: localStyles.badgeDefault };
  };

  const formatDeadline = (timestamp) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date - now;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) {
      return { text: 'Overdue', urgent: true };
    } else if (diffHours < 24) {
      return { text: `Due in ${diffHours}h`, urgent: true };
    } else if (diffDays < 7) {
      return { text: `Due in ${diffDays}d`, urgent: false };
    } else {
      return { text: date.toLocaleDateString(), urgent: false };
    }
  };




  if (isLoading) {
    return (
      <StudentLayout
        mobileTitle="Loading..."
        sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />}
      >
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Loader size="md" />
          <p style={{ color: studentTokens.textMuted, marginTop: 16 }}>Loading class...</p>
        </div>
      </StudentLayout>
    );
  }

  if (!classData) {
    return (
      <StudentLayout
        mobileTitle="Not Found"
        sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />}
      >
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 16px' }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>Class Not Found</h2>
          <p style={{ color: studentTokens.textMuted, fontSize: '1rem', margin: '0 0 24px' }}>This class doesn't exist or you don't have access to it.</p>
          <button style={localStyles.primaryBtn} onClick={() => navigate('/student/dashboard')}>Back to Dashboard</button>
        </div>
      </StudentLayout>
    );
  }

  const assignments = getStudentAssignments();
  const allowSelfStudy = classData.settings?.allowSelfStudy;

  return (
    <StudentLayout
      mobileTitle={classData.name || 'Class Details'}
      sidebar={<StudentSidebar user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined} activePage="courses" pendingHomeworkCount={notStarted.length} />}
    >
      <div style={S.feedHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/student/courses')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: 8, borderRadius: 8, color: studentTokens.textMuted }}
            onMouseEnter={e => e.currentTarget.style.background = studentTokens.bgSurfaceStrong}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div style={S.feedHeaderText}>
            <h2 style={{ ...S.feedHeaderTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
              {classData.name}
            </h2>
            <p style={S.feedHeaderSubtitle}>Code: {classData.classCode}</p>
          </div>
        </div>
      </div>

      {allowSelfStudy && (
        <div style={S.filterBar}>
          <button
            onClick={() => setActiveTab('assignments')}
            style={{ ...S.filterTab, ...(activeTab === 'assignments' ? S.filterTabActive : {}) }}
          >
            Assignments ({assignments.length})
          </button>
          <button
            onClick={() => setActiveTab('self-study')}
            style={{ ...S.filterTab, ...(activeTab === 'self-study' ? S.filterTabActive : {}) }}
          >
            Self-Study
          </button>
        </div>
      )}

      <div style={{ padding: 16 }}>
        {false && activeSessions.length > 0 && (
          <div style={{ marginBottom: 24, animation: 'dashFadeIn 0.3s ease-out' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: studentTokens.textPrimary, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.2)', animation: 'pulse 2s infinite' }}></div>
              Live Sessions Happening Now
            </h3>
            {activeSessions.map((session) => (
              <div key={session.code} style={localStyles.liveSessionCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={session.mode === 'test' ? localStyles.testTag : localStyles.quizTag}>
                    {session.mode === 'test' ? 'Test' : 'Quiz'}
                  </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: studentTokens.textPrimary, fontSize: '0.875rem' }}>
                    Code: {session.code}
                  </span>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ fontSize: '1.125rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 4px' }}>
                    {session.status === 'in-progress' ? 'Session In Progress' : 'Waiting for Players'}
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: studentTokens.textMuted, margin: 0 }}>Join now to participate.</p>
                </div>
                <button
                  style={{ ...localStyles.primaryBtn, width: '100%', padding: '10px' }}
                  onClick={() => {
                    if (user) {
                      sessionService.setPlayerData(user.uid, user.displayName || user.email || 'Student', session.code);
                    }
                    navigate(buildRoute('STUDENT_WAITING', { gameSessionId: session.code }));
                  }}
                >
                  Join Session →
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'assignments' && (
          <div style={{ animation: 'dashFadeIn 0.3s ease-out' }}>
            {assignments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 600, color: studentTokens.textPrimary, margin: '0 0 8px' }}>No Assignments Yet</h4>
                <p style={{ color: studentTokens.textMuted, fontSize: '1rem', margin: 0 }}>Your teacher hasn't assigned any tests yet. Check back later.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {assignments.map((assignment, index) => {
                  const statusBadge = getAssignmentStatusBadge(assignment);
                  const deadline = assignment.deadline ? formatDeadline(assignment.deadline) : null;
                  const isCompleted = assignment.studentProgress?.status === 'submitted' || assignment.studentProgress?.status === 'graded';
                  const assignmentResultId = assignment.studentProgress?.resultId;
                  const canViewResults = isCompleted && Boolean(assignmentResultId);

                  return (
                    <div key={assignment.id} style={{ ...localStyles.card, animation: `dashFadeIn 300ms ease-out ${index * 50}ms both` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 min-content' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                            <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, ...statusBadge.color }}>
                              {statusBadge.text}
                            </span>
                            {deadline && (
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: deadline.urgent ? '#9e3f4e' : studentTokens.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                                {deadline.urgent && (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                )}
                                {deadline.text}
                              </span>
                            )}
                          </div>
                          <h4 style={{ fontSize: '1.125rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>{assignment.testTitle}</h4>
                          <div style={{ display: 'flex', gap: 16, fontSize: '0.875rem', color: studentTokens.textMuted, flexWrap: 'wrap' }}>
                            {assignment.timeLimit && <span>{assignment.timeLimit} minutes</span>}
                            {assignment.maxAttempts && <span>{assignment.maxAttempts} {assignment.maxAttempts === 1 ? 'attempt' : 'attempts'}</span>}
                            {assignment.studentProgress?.percentage !== undefined && (
                              <span style={{ fontWeight: 700, color: '#4c5458' }}>Score: {assignment.studentProgress.percentage}%</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          {canViewResults ? (
                            <button style={localStyles.successBtn} onClick={() => handleViewResults(assignment)}>
                              View Results
                            </button>
                          ) : isCompleted ? (
                            <button style={localStyles.disabledBtn} disabled>Result Pending</button>
                          ) : assignment.status === 'available' || assignment.studentProgress?.status === 'in_progress' ? (
                            <button style={localStyles.primaryBtn} onClick={() => handleStartTest(assignment)}>
                              {assignment.studentProgress?.status === 'in_progress' ? 'Continue' : 'Start'}
                            </button>
                          ) : (
                            <button style={localStyles.disabledBtn} disabled>Not Available</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'self-study' && (
          <div style={{ textAlign: 'center', padding: '60px 24px', animation: 'dashFadeIn 0.3s ease-out' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 16px' }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
            <h4 style={{ fontSize: '1.25rem', fontWeight: 600, color: studentTokens.textPrimary, margin: '0 0 8px' }}>Self-Study Materials Coming Soon</h4>
            <p style={{ color: studentTokens.textMuted, fontSize: '1rem', margin: 0 }}>Your teacher will enable access to practice materials here.</p>
          </div>
        )}
      </div>
      <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
    </StudentLayout>
  );
};

export default StudentClassDetailPage;
