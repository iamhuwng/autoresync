import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ref, get } from 'firebase/database';
// @ts-ignore
import { database } from '../services/firebase';
import { Center, Loader, Modal, Stack, Title, Text, Tabs, Badge, Group } from '@mantine/core';
import { Card, CardBody, Button } from '../components/modern';
import {
  TestResultRecord,
  getSessionResults,
  updateResultScore,
  markAsReviewed,
} from '../services/testResults.service';
import { exportClassResultsToCSV } from '../utils/csvExport';
import { generateClassReportPDF } from '../utils/pdfReportGenerator';
import { QuestionAnalytics } from '../components/results/QuestionAnalytics';
import { ReMarkingModal } from '../components/results/ReMarkingModal';
import { FeedbackEditor } from '../components/feedback/FeedbackEditor';
import { saveQuestionFeedback, saveOverallFeedback } from '../services/feedbackService';
import WritingTestResultsSection from '../components/writing-results/WritingTestResultsSection';
import { IntegrityBadge } from '../components/test/IntegrityBadge';
import { IntegrityDetailPanel } from '../components/test/IntegrityDetailPanel';
import { computeRiskLevel, normalizeIntegrityReport } from '../utils/integrityUtils';
import type { IntegrityReport } from '../types/integrity.types';
import type { QuestionResult } from '../types/results.types';
import { reportingService } from '../services/reportingService';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { classifyTeacherResultVisibility } from '../services/resultVisibility.service';

interface StudentResult {
  resultId?: string;
  studentId: string;
  studentName: string;
  totalScore: number;
  maxScore: number;
  percentage: number;
  bandScore: number;
  correct: number;
  incorrect: number;
  partialCredit: number;
  totalQuestions: number;
  timeElapsed: number;
  submittedAt: number;
  questionResults?: QuestionResult[];
  reMarkHistory?: any[];
  isGuest?: boolean;
  markingStatus?: 'auto-marked' | 'pending-review' | 'reviewed';
}

interface QuestionAnalyticsData {
  questionNumber: number;
  correctCount: number;
  incorrectCount: number;
  partialCount: number;
  totalAttempts: number;
  difficultyPercent: number;
  commonWrongAnswers: { answer: string; count: number }[];
}

interface TestSession {
  sessionCode: string;
  testId?: string;
  lastTestId?: string;
  status: string;
  createdAt: number;
  players: Record<string, any>;
}

interface TestData {
  title: string;
  type: string;
  skill: string;
  questions?: Array<{
    id?: string;
    number?: number;
    points?: number;
    question: string;
  }>;
  duration: number;
}

type SortField = 'name' | 'score' | 'bandScore' | 'percentage';
type ViewerRole = 'teacher' | 'super_admin';
type CanonicalTeacherResult = TestResultRecord & {
  teacherId?: string;
  visibility?: {
    visibilityOwnerTeacherId?: string | null;
  } | null;
  markingStatus?: 'auto-marked' | 'pending-review' | 'reviewed' | 'graded';
};

function mapResult(record: CanonicalTeacherResult): StudentResult {
  return {
    resultId: record.resultId,
    studentId: record.studentId,
    studentName: record.studentName,
    totalScore: record.totalScore,
    maxScore: record.maxScore,
    percentage: record.percentage,
    bandScore: record.bandScore,
    correct: record.correct,
    incorrect: record.incorrect,
    partialCredit: record.partialCredit,
    totalQuestions: record.totalQuestions,
    timeElapsed: record.timeElapsed,
    submittedAt: record.submittedAt,
    questionResults: record.questionResults,
    reMarkHistory: (record as any).reMarkHistory,
    isGuest: (record as any).isGuest,
    markingStatus: ((record as any).markingStatus as StudentResult['markingStatus']) || 'auto-marked',
  };
}

function buildViewerTeacherId(record: CanonicalTeacherResult, viewerRole: ViewerRole, viewerTeacherId: string): string {
  if (viewerRole === 'super_admin') {
    return record.visibility?.visibilityOwnerTeacherId || viewerTeacherId;
  }
  return viewerTeacherId;
}

function buildQuestionAnalytics(records: CanonicalTeacherResult[]): QuestionAnalyticsData[] {
  const stats = new Map<number, {
    correct: number;
    incorrect: number;
    partial: number;
    total: number;
    wrongAnswers: Map<string, number>;
  }>();

  records.forEach((record) => {
    (record.questionResults || []).forEach((questionResult) => {
      const bucket = stats.get(questionResult.questionNumber) || {
        correct: 0,
        incorrect: 0,
        partial: 0,
        total: 0,
        wrongAnswers: new Map<string, number>(),
      };
      const isPartial = questionResult.score > 0 && questionResult.score < questionResult.maxScore;

      bucket.total += 1;
      if (questionResult.isCorrect) {
        bucket.correct += 1;
      } else if (isPartial) {
        bucket.partial += 1;
      } else {
        bucket.incorrect += 1;
      }

      if (!questionResult.isCorrect && questionResult.studentAnswer !== undefined && questionResult.studentAnswer !== null) {
        const answerText = String(questionResult.studentAnswer).trim();
        if (answerText) {
          bucket.wrongAnswers.set(answerText, (bucket.wrongAnswers.get(answerText) || 0) + 1);
        }
      }

      stats.set(questionResult.questionNumber, bucket);
    });
  });

  return Array.from(stats.entries())
    .map(([questionNumber, bucket]) => ({
      questionNumber,
      correctCount: bucket.correct,
      incorrectCount: bucket.incorrect,
      partialCount: bucket.partial,
      totalAttempts: bucket.total,
      difficultyPercent: bucket.total > 0 ? (bucket.correct / bucket.total) * 100 : 0,
      commonWrongAnswers: Array.from(bucket.wrongAnswers.entries())
        .map(([answer, count]) => ({ answer, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 3),
    }))
    .sort((left, right) => left.questionNumber - right.questionNumber);
}

function buildRemarkQuestions(
  testQuestions: TestData['questions'],
  questionResults: QuestionResult[] | undefined,
): { questionNumber: number; maxScore: number; text?: string }[] {
  if (Array.isArray(testQuestions) && testQuestions.length > 0) {
    return testQuestions.map((question) => ({
      questionNumber: question.number || (question.id ? parseInt(question.id.replace('q', ''), 10) : 0),
      maxScore: question.points || 1,
      text: question.question,
    }));
  }

  return (questionResults || [])
    .map((questionResult) => ({
      questionNumber: questionResult.questionNumber,
      maxScore: questionResult.maxScore || 1,
    }))
    .filter((question) => Number.isFinite(question.questionNumber) && question.questionNumber > 0)
    .sort((left, right) => left.questionNumber - right.questionNumber);
}

export const TeacherTestResultsPage: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { user, profile } = useAuth();
  const viewerRole: ViewerRole = profile?.role === 'super_admin' ? 'super_admin' : 'teacher';
  const viewerTeacherId = user?.uid || '';
  const viewerTeacherName = profile?.displayName || user?.displayName || profile?.email || user?.email || viewerTeacherId || 'Teacher';
  const { navigateTo } = useNavigation(viewerRole);
  const { trackAction } = useFeatureTracking('results');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TestSession | null>(null);
  const [testData, setTestData] = useState<TestData | null>(null);
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [analyticsResults, setAnalyticsResults] = useState<StudentResult[]>([]);
  const [questionAnalytics, setQuestionAnalytics] = useState<QuestionAnalyticsData[]>([]);
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortAscending, setSortAscending] = useState(false);
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [selectedStudentForRemark, setSelectedStudentForRemark] = useState<StudentResult | null>(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedStudentForFeedback, setSelectedStudentForFeedback] = useState<StudentResult | null>(null);
  const [integrityMap, setIntegrityMap] = useState<Record<string, IntegrityReport>>({});
  const [selectedIntegrity, setSelectedIntegrity] = useState<{ report: IntegrityReport; studentName: string } | null>(null);

  useEffect(() => {
    if (!sessionCode) {
      setError('No session code provided');
      setLoading(false);
      return;
    }
    void loadAllResults();
  }, [sessionCode, viewerRole, viewerTeacherId]);

  const loadAllResults = async () => {
    try {
      if (!sessionCode) {
        setError('No session code provided');
        setLoading(false);
        return;
      }
      if (!viewerTeacherId) {
        setError('Authentication required');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const sessionSnapshot = await get(ref(database, `game_sessions/${sessionCode}`));
      if (!sessionSnapshot.exists()) {
        setError('Session not found');
        setLoading(false);
        return;
      }

      const nextSession = sessionSnapshot.val();
      setSession(nextSession);

      const nextIntegrityMap: Record<string, IntegrityReport> = {};
      if (nextSession.players) {
        Object.entries(nextSession.players).forEach(([playerId, playerData]: [string, any]) => {
          const normalized = normalizeIntegrityReport(playerData?.integrity);
          if (normalized) {
            nextIntegrityMap[playerId] = normalized;
          }
        });
      }
      setIntegrityMap(nextIntegrityMap);

      const targetTestId = nextSession.testId || nextSession.lastTestId;
      if (!targetTestId) {
        setError('Test data not found for this session');
        setLoading(false);
        return;
      }

      const testSnapshot = await get(ref(database, `tests/${targetTestId}`));
      if (!testSnapshot.exists()) {
        setError('Test content not found');
        setLoading(false);
        return;
      }
      setTestData(testSnapshot.val());

      const canonicalResults = await getSessionResults(sessionCode) as CanonicalTeacherResult[];
      const classified = canonicalResults.map((result) => ({
        result,
        verdict: classifyTeacherResultVisibility({
          result,
          teacherId: buildViewerTeacherId(result, viewerRole, viewerTeacherId),
          hasAssignmentAccess: true,
        }),
      }));

      const visible = classified
        .filter(({ verdict }) => verdict.shouldDisplayInTeacherHistory)
        .map(({ result }) => mapResult(result));
      const analyticsEligible = classified
        .filter(({ verdict }) => verdict.shouldDisplayInTeacherHistory && !verdict.excludeFromAnalytics)
        .map(({ result }) => result);

      setStudentResults(visible);
      setAnalyticsResults(analyticsEligible.map((result) => mapResult(result)));
      setQuestionAnalytics(buildQuestionAnalytics(analyticsEligible));
      setLoading(false);
    } catch (loadError) {
      console.error('Error loading results:', loadError);
      setError('Failed to load results');
      setLoading(false);
    }
  };

  const sortedStudents = [...studentResults].sort((left, right) => {
    let leftValue: number | string;
    let rightValue: number | string;

    switch (sortField) {
      case 'name':
        leftValue = left.studentName.toLowerCase();
        rightValue = right.studentName.toLowerCase();
        break;
      case 'score':
        leftValue = left.totalScore;
        rightValue = right.totalScore;
        break;
      case 'bandScore':
        leftValue = left.bandScore;
        rightValue = right.bandScore;
        break;
      case 'percentage':
        leftValue = left.percentage;
        rightValue = right.percentage;
        break;
      default:
        return 0;
    }

    if (leftValue < rightValue) return sortAscending ? -1 : 1;
    if (leftValue > rightValue) return sortAscending ? 1 : -1;
    return 0;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
      return;
    }
    setSortField(field);
    setSortAscending(false);
  };

  const handleExportCSV = () => {
    if (!testData || analyticsResults.length === 0) {
      alert('No results to export');
      return;
    }

    trackAction('exportResultsCsv', {
      source: 'teacher_test_results',
      sessionCode,
      resultCount: analyticsResults.length,
    });

    const exportRows: TestResultRecord[] = analyticsResults.map((student) => ({
      resultId: student.resultId || `${sessionCode}_${student.studentId}`,
      sessionCode: sessionCode || '',
      testId: session?.testId || '',
      studentId: student.studentId,
      studentName: student.studentName,
      totalScore: student.totalScore,
      maxScore: student.maxScore,
      percentage: student.percentage,
      bandScore: student.bandScore,
      questionResults: [],
      correct: student.correct,
      incorrect: student.incorrect,
      partialCredit: student.partialCredit,
      totalQuestions: student.totalQuestions,
      submittedAt: student.submittedAt,
      timeElapsed: student.timeElapsed,
      testDuration: testData.duration,
      createdAt: Date.now(),
      testTitle: testData.title,
      testType: testData.type,
      testSkill: testData.skill,
    }));

    exportClassResultsToCSV(exportRows, sessionCode || '', testData.title);
  };

  const handleExportPDF = () => {
    if (!testData || !sessionCode || analyticsResults.length === 0) return;

    trackAction('exportResultsPdf', {
      source: 'teacher_test_results',
      sessionCode,
      resultCount: analyticsResults.length,
    });

    generateClassReportPDF(
      analyticsResults.map((student) => ({
        studentId: student.studentId,
        studentName: student.studentName,
        sessionCode,
        sessionMode: 'test' as const,
        score: student.totalScore,
        percentage: student.percentage,
        totalQuestions: student.totalQuestions,
        correctAnswers: student.correct,
        completedAt: student.submittedAt,
        timeSpent: student.timeElapsed,
        isGuest: student.isGuest || false,
        bandScore: student.bandScore,
        testSkill: testData.skill,
        testTitle: testData.title,
        reMarkHistory: student.reMarkHistory ? student.reMarkHistory.length : 0,
      })),
      testData.title,
      sessionCode,
    );
  };

  const openRemarkModal = (student: StudentResult) => {
    if (!student.resultId || !student.questionResults) {
      alert('Re-marking is only available for saved results.');
      return;
    }
    setSelectedStudentForRemark(student);
    setRemarkModalOpen(true);
  };

  const handleRemarkSave = async (questionNumber: number, newScore: number, reason: string) => {
    if (!selectedStudentForRemark?.resultId) return;
    try {
      await updateResultScore(selectedStudentForRemark.resultId, questionNumber, newScore, reason, viewerTeacherId);
      setRemarkModalOpen(false);
      await loadAllResults();
    } catch (saveError) {
      console.error('Failed to save remark:', saveError);
      alert('Failed to save re-mark. Please try again.');
    }
  };

  const openFeedbackModal = (student: StudentResult) => {
    if (!student.resultId) {
      alert('Feedback is only available for saved results.');
      return;
    }
    setSelectedStudentForFeedback(student);
    setFeedbackModalOpen(true);
  };

  const handleSaveOverallFeedback = async (feedback: string): Promise<void> => {
    if (!selectedStudentForFeedback?.resultId) return;
    await saveOverallFeedback(selectedStudentForFeedback.resultId, feedback, viewerTeacherId, viewerTeacherName);
    await loadAllResults();
  };

  const handleSaveQuestionFeedback = async (questionNumber: number, feedback: string): Promise<void> => {
    if (!selectedStudentForFeedback?.resultId) return;
    await saveQuestionFeedback(selectedStudentForFeedback.resultId, String(questionNumber), feedback, viewerTeacherId, viewerTeacherName);
    await loadAllResults();
  };

  const handleMarkAsReviewed = async (student: StudentResult) => {
    if (!student.resultId) {
      alert('Cannot mark as reviewed: result not saved permanently.');
      return;
    }
    if (student.markingStatus !== 'pending-review') {
      alert('This result is not pending review.');
      return;
    }

    const confirmed = window.confirm(
      `Mark ${student.studentName}'s ${testData?.skill || 'test'} submission as reviewed?\n\nThis will notify the student that their test has been reviewed.`,
    );
    if (!confirmed) return;

    try {
      trackAction('markResultReviewed', {
        source: 'teacher_test_results',
        sessionCode,
        resultId: student.resultId,
        studentId: student.studentId,
      });
      await markAsReviewed(student.resultId, viewerTeacherId);
      alert(`${student.studentName}'s test marked as reviewed.`);
      await loadAllResults();
    } catch (reviewError) {
      console.error('Failed to mark as reviewed:', reviewError);
      alert('Failed to mark as reviewed. Please try again.');
    }
  };

  const classStats = {
    totalStudents: analyticsResults.length,
    averageScore: analyticsResults.length ? analyticsResults.reduce((sum, result) => sum + result.totalScore, 0) / analyticsResults.length : 0,
    averagePercentage: analyticsResults.length ? analyticsResults.reduce((sum, result) => sum + result.percentage, 0) / analyticsResults.length : 0,
    averageBandScore: analyticsResults.length ? analyticsResults.reduce((sum, result) => sum + result.bandScore, 0) / analyticsResults.length : 0,
    highestScore: analyticsResults.length ? Math.max(...analyticsResults.map((result) => result.totalScore)) : 0,
    lowestScore: analyticsResults.length ? Math.min(...analyticsResults.map((result) => result.totalScore)) : 0,
    passRate: analyticsResults.length ? (analyticsResults.filter((result) => result.percentage >= 60).length / analyticsResults.length) * 100 : 0,
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  };

  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="xl" />
      </Center>
    );
  }

  if (error || !session || !testData) {
    return (
      <Center style={{ height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
          {error || 'Failed to load results'}
        </div>
        <Button variant="primary" onClick={() => navigateTo('SESSIONS', {}, { reason: 'teacher_results_error_back' })}>
          Return to Sessions
        </Button>
      </Center>
    );
  }

  if (testData.skill === 'Writing') {
    return <WritingTestResultsSection sessionCode={sessionCode || ''} testTitle={testData.title} />;
  }

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', background: '#f8fafc' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', color: '#0f172a' }}>Test Results Dashboard</h1>
            <div style={{ marginTop: '0.5rem', color: '#64748b' }}>{testData.title}</div>
            <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
              Session: {sessionCode} | {testData.type} | {testData.skill}
            </div>
          </div>
          <Button variant="glass" onClick={() => navigateTo('SESSIONS', {}, { reason: 'teacher_results_back' })}>
            Back to Sessions
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {[
            ['Students', classStats.totalStudents.toString()],
            ['Average Score', classStats.averageScore.toFixed(1)],
            ['Average %', `${classStats.averagePercentage.toFixed(1)}%`],
            ['Avg Band', classStats.averageBandScore.toFixed(1)],
            ['Pass Rate', `${classStats.passRate.toFixed(0)}%`],
            ['High / Low', `${classStats.highestScore.toFixed(1)} / ${classStats.lowestScore.toFixed(1)}`],
          ].map(([label, value]) => (
            <Card key={label} variant="glass">
              <CardBody style={{ padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
              </CardBody>
            </Card>
          ))}
        </div>

        <Card variant="glass" style={{ marginBottom: '1.5rem' }}>
          <CardBody style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0 }}>Individual Results</h2>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Button variant="secondary" onClick={handleExportPDF}>Export PDF</Button>
                <Button variant="success" onClick={handleExportCSV}>Download CSV</Button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem', cursor: 'pointer' }} onClick={() => handleSort('name')}>Student</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem', cursor: 'pointer' }} onClick={() => handleSort('score')}>Score</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem', cursor: 'pointer' }} onClick={() => handleSort('percentage')}>Percentage</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem', cursor: 'pointer' }} onClick={() => handleSort('bandScore')}>Band</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>Correct</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>Partial</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>Incorrect</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>Time</th>
                    <th style={{ textAlign: 'center', padding: '0.75rem' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((student) => (
                    <tr key={student.resultId || student.studentId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {student.studentName}
                          {student.markingStatus === 'pending-review' && <Badge size="sm">Pending Review</Badge>}
                          {student.markingStatus === 'reviewed' && <Badge size="sm">Reviewed</Badge>}
                          {(() => {
                            const integrityData = integrityMap[student.studentId];
                            if (!integrityData) return null;
                            const riskLevel = integrityData.riskLevel || computeRiskLevel(integrityData.violationCount || 0, integrityData.forceSubmitted || false);
                            return (
                              <IntegrityBadge
                                violationCount={integrityData.violationCount || 0}
                                riskLevel={riskLevel}
                                onClick={() => {
                                  reportingService.trackAction('results', 'viewIntegrityDetails', {
                                    sessionCode,
                                    studentId: student.studentId,
                                    studentName: student.studentName,
                                    violationCount: integrityData.violationCount || 0,
                                  });
                                  setSelectedIntegrity({ report: integrityData, studentName: student.studentName });
                                }}
                              />
                            );
                          })()}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{student.totalScore.toFixed(1)}/{student.maxScore}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{student.percentage.toFixed(1)}%</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{student.bandScore.toFixed(1)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{student.correct}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{student.partialCredit}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{student.incorrect}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>{formatTime(student.timeElapsed)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <Button variant="glass" size="sm" onClick={() => openRemarkModal(student)} disabled={!student.resultId}>Re-mark</Button>
                        <Button variant="glass" size="sm" onClick={() => openFeedbackModal(student)} disabled={!student.resultId}>Feedback</Button>
                        {student.markingStatus === 'pending-review' && (
                          <Button variant="success" size="sm" onClick={() => void handleMarkAsReviewed(student)} disabled={!student.resultId}>
                            Mark Reviewed
                          </Button>
                        )}
                        <Button
                          variant="glass"
                          size="sm"
                          onClick={() => {
                            trackAction('openStudentHistory', {
                              source: 'teacher_test_results',
                              sessionCode,
                              studentId: student.studentId,
                              resultId: student.resultId || null,
                            });
                            navigateTo('TEACHER_STUDENT_HISTORY', { studentId: student.studentId }, { reason: 'teacher_test_results_history' });
                          }}
                        >
                          History
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <div>
          <h2 style={{ marginBottom: '1rem' }}>Question Difficulty Analysis ({questionAnalytics.length})</h2>
          {questionAnalytics.length === 0 ? (
            <Card variant="glass"><CardBody>No analytics available.</CardBody></Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {questionAnalytics.map((item) => (
                <QuestionAnalytics key={item.questionNumber} data={item} />
              ))}
            </div>
          )}
        </div>

        {selectedStudentForRemark && testData && (
          <ReMarkingModal
            isOpen={remarkModalOpen}
            onClose={() => setRemarkModalOpen(false)}
            studentName={selectedStudentForRemark.studentName}
            results={selectedStudentForRemark.questionResults || []}
            questions={buildRemarkQuestions(testData.questions, selectedStudentForRemark.questionResults)}
            onSave={handleRemarkSave}
          />
        )}

        {selectedStudentForFeedback && (
          <Modal
            opened={feedbackModalOpen}
            onClose={() => setFeedbackModalOpen(false)}
            title={(
              <Group>
                <Title order={3}>Provide Feedback</Title>
                <Badge color="blue" size="lg">{selectedStudentForFeedback.studentName}</Badge>
              </Group>
            )}
            size="xl"
          >
            <Stack gap="lg">
              <Tabs defaultValue="overall">
                <Tabs.List>
                  <Tabs.Tab value="overall">Overall Feedback</Tabs.Tab>
                  <Tabs.Tab value="questions">Per-Question Feedback</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="overall" pt="md">
                  <FeedbackEditor
                    initialFeedback=""
                    onSave={handleSaveOverallFeedback}
                    isOverall={true}
                    placeholder="Provide overall feedback on the student's performance..."
                    minRows={4}
                    maxRows={10}
                  />
                </Tabs.Panel>
                <Tabs.Panel value="questions" pt="md">
                  <Stack>
                    {selectedStudentForFeedback.questionResults?.map((question) => (
                      <div key={question.questionNumber} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                        <Group justify="apart" mb="sm">
                          <Text fw={600}>
                            Question {question.questionNumber}
                            <Badge ml="sm" color={question.isCorrect ? 'green' : 'red'} variant="light" size="sm">
                              {question.isCorrect ? 'Correct' : 'Incorrect'}
                            </Badge>
                          </Text>
                          <Text size="sm" c="dimmed">
                            Student: {String(question.studentAnswer)} | Correct: {String(question.correctAnswer)}
                          </Text>
                        </Group>
                        <FeedbackEditor
                          questionId={String(question.questionNumber)}
                          initialFeedback={question.teacherFeedback || ''}
                          onSave={(feedback) => handleSaveQuestionFeedback(question.questionNumber, feedback)}
                          placeholder={question.isCorrect ? 'Optionally explain why this answer is correct...' : 'Explain the mistake or provide hints...'}
                          minRows={2}
                          maxRows={6}
                        />
                      </div>
                    ))}
                  </Stack>
                </Tabs.Panel>
              </Tabs>
            </Stack>
          </Modal>
        )}
      </div>

      {selectedIntegrity && (
        <IntegrityDetailPanel
          report={selectedIntegrity.report}
          studentName={selectedIntegrity.studentName}
          isOpen={true}
          onClose={() => setSelectedIntegrity(null)}
        />
      )}
    </div>
  );
};

export default TeacherTestResultsPage;
