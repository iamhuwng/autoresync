/**
 * Teacher Test Results Page
 * Displays class-wide test results with statistics and analytics
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
// @ts-ignore
import { database } from '../services/firebase';
import { Center, Loader } from '@mantine/core';
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';
import {
  markTest,
  calculateBandScore,
  Question,
  StudentAnswer,
} from '../services/autoMarking.service';
import { exportClassResultsToCSV } from '../utils/csvExport';
import { TestResultRecord, getSessionResults, updateResultScore, markAsReviewed } from '../services/testResults.service';
import { generateClassReportPDF } from '../utils/pdfReportGenerator';
import { QuestionAnalytics } from '../components/results/QuestionAnalytics';
import { ReMarkingModal } from '../components/results/ReMarkingModal';
import { QuestionResult } from '../types/results.types';
import { FeedbackEditor } from '../components/feedback/FeedbackEditor';
import { saveQuestionFeedback, saveOverallFeedback } from '../services/feedbackService';
import { Modal, Stack, Title, Text, Tabs, Badge, Group } from '@mantine/core';
import WritingTestResultsSection from '../components/writing-results/WritingTestResultsSection';

interface StudentResult {
  resultId?: string; // Link to backend record
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
  questionResults?: QuestionResult[]; // Detailed results for re-marking
  reMarkHistory?: any[];
  isGuest?: boolean;
  markingStatus?: 'auto-marked' | 'pending-review' | 'reviewed'; // PRD-0015: Phase 7 & 8
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
  testId?: string; // Optional because it's cleared when test ends
  lastTestId?: string; // PRD-0019: Fallback for results
  status: string;
  createdAt: number;
  players: Record<string, any>;
}

interface TestData {
  title: string;
  type: string;
  skill: string;
  questions: Question[];
  duration: number;
}

type SortField = 'name' | 'score' | 'bandScore' | 'percentage';

export const TeacherTestResultsPage: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TestSession | null>(null);
  const [testData, setTestData] = useState<TestData | null>(null);
  const [studentResults, setStudentResults] = useState<StudentResult[]>([]);
  const [questionAnalytics, setQuestionAnalytics] = useState<QuestionAnalyticsData[]>([]);
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortAscending, setSortAscending] = useState(false);

  // Re-marking State
  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [selectedStudentForRemark, setSelectedStudentForRemark] = useState<StudentResult | null>(null);

  // Feedback State
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [selectedStudentForFeedback, setSelectedStudentForFeedback] = useState<StudentResult | null>(null);

  /**
   * Load session and calculate all results
   */
  useEffect(() => {
    if (!sessionCode) {
      setError('No session code provided');
      setLoading(false);
      return;
    }

    loadAllResults();
  }, [sessionCode]);

  const loadAllResults = async () => {
    try {
      console.log(`📊 [Teacher Results] Loading results for session: ${sessionCode}`);

      // Load session
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const sessionSnap = await get(sessionRef);

      if (!sessionSnap.exists()) {
        setError('Session not found');
        setLoading(false);
        return;
      }

      const sessionData = sessionSnap.val();

      // Security: Verify session ownership
      // Get current user from Firebase Auth
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const currentUser = auth.currentUser;

      if (currentUser) {
        // Check if user is super_admin (fetch from profiles)
        const profileRef = ref(database, `users/${currentUser.uid}/role`);
        const profileSnap = await get(profileRef);
        const userRole = profileSnap.val();
        const isSuperAdmin = userRole === 'super_admin';

        // Verify ownership: session.teacherId or session.createdBy must match current user
        const isOwner = sessionData.teacherId === currentUser.uid ||
          sessionData.createdBy === currentUser.uid;

        if (!isOwner && !isSuperAdmin) {
          console.warn(`[Security] Access denied to session ${sessionCode} for user ${currentUser.uid}`);
          setError('Access denied: You can only view results for sessions you created.');
          setLoading(false);
          return;
        }
      }

      setSession(sessionData);

      // Load test data
      // PRD-0019: Use testId if active, otherwise fallback to lastTestId
      const targetTestId = sessionData.testId || sessionData.lastTestId;

      if (!targetTestId) {
        console.error('❌ [Teacher Results] No testId or lastTestId found in session');
        setError('Test data not found for this session');
        setLoading(false);
        return;
      }

      const testRef = ref(database, `tests/${targetTestId}`);
      const testSnap = await get(testRef);

      if (!testSnap.exists()) {
        setError('Test content not found');
        setLoading(false);
        return;
      }

      const test = testSnap.val();
      setTestData(test);

      // ---------------------------------------------------------
      // Enhanced Analytics Calculation
      // ---------------------------------------------------------
      let results: StudentResult[] = [];
      const questionStats: Map<number, {
        correct: number;
        incorrect: number;
        partial: number;
        total: number;
        wrongAnswers: Map<string, number>;
      }> = new Map();

      let usedPermanentStorage = false;

      // Helper to track answer
      const trackAnswer = (qNum: number, isCorrect: boolean, isPartial: boolean, answer: any) => {
        const stats = questionStats.get(qNum) || {
          correct: 0, incorrect: 0, partial: 0, total: 0,
          wrongAnswers: new Map()
        };

        stats.total++;

        if (isCorrect) {
          stats.correct++;
        } else {
          if (isPartial) {
            stats.partial++;
          } else {
            stats.incorrect++;
          }

          // Track wrong answer text for analysis
          if (!isCorrect && answer !== undefined && answer !== null && answer !== '') {
            const answerText = typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
            const cleanAnswer = answerText.trim();
            if (cleanAnswer) {
              const count = stats.wrongAnswers.get(cleanAnswer) || 0;
              stats.wrongAnswers.set(cleanAnswer, count + 1);
            }
          }
        }
        questionStats.set(qNum, stats);
      };

      try {
        const permanentResults = await getSessionResults(sessionCode!);
        if (permanentResults && permanentResults.length > 0) {
          console.log(`✅ Found ${permanentResults.length} permanent records`);
          usedPermanentStorage = true;

          permanentResults.forEach(record => {
            // Map to StudentResult
            results.push({
              resultId: record.resultId, // Include ID
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
              questionResults: record.questionResults, // Include details
              reMarkHistory: record.reMarkHistory,
              isGuest: record.isGuest,
              markingStatus: record.markingStatus || 'auto-marked', // PRD-0015: Phase 7 & 8
            });

            // Aggregate Stats
            record.questionResults.forEach(qResult => {
              const isPartial = qResult.score > 0 && qResult.score < qResult.maxScore;
              trackAnswer(qResult.questionNumber, qResult.isCorrect, isPartial, qResult.studentAnswer);
            });
          });
        }
      } catch (permErr) {
        console.warn('Error fetching permanent results, falling back', permErr);
      }

      // Fallback Logic
      if (!usedPermanentStorage) {
        console.log('⚠️ No permanent results found, recalculating from raw answers...');

        if (sessionData.players) {
          Object.entries(sessionData.players).forEach(([studentId, studentData]: [string, any]) => {
            if (!studentData.answers) return;

            // Convert and mark (Legacy logic)
            const studentAnswers: Record<number, StudentAnswer> = {};
            Object.entries(studentData.answers).forEach(([qNum, answer]: [string, any]) => {
              studentAnswers[parseInt(qNum)] = {
                questionId: `q${qNum}`,
                questionNumber: parseInt(qNum),
                answer: answer.answer,
                timeSpent: answer.timeSpent,
                timestamp: answer.timestamp,
              };
            });

            const markingResult = markTest(test.questions, studentAnswers);
            const bandScore = calculateBandScore(markingResult.percentage);

            results.push({
              studentId,
              studentName: studentData.name || 'Unknown',
              totalScore: markingResult.totalScore,
              maxScore: markingResult.maxScore,
              percentage: markingResult.percentage,
              bandScore,
              correct: markingResult.summary.correct,
              incorrect: markingResult.summary.incorrect,
              partialCredit: markingResult.summary.partialCredit,
              totalQuestions: markingResult.summary.totalQuestions,
              timeElapsed: studentData.timeElapsed || 0,
              submittedAt: studentData.submittedAt || Date.now(),
              // Legacy results don't have resultId or persisted questionResults suitable for re-marking yet
            });

            markingResult.questionResults.forEach((qResult) => {
              trackAnswer(
                qResult.questionNumber,
                qResult.isCorrect,
                !!qResult.partialCredit,
                qResult.studentAnswer
              );
            });
          });
        }
      }

      // Convert question stats to analytics array
      const analytics: QuestionAnalyticsData[] = [];
      questionStats.forEach((stats, questionNumber) => {
        const difficultyPercent = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;

        // Get top 3 wrong answers
        const commonWrongAnswers = Array.from(stats.wrongAnswers.entries())
          .map(([answer, count]) => ({ answer, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        analytics.push({
          questionNumber,
          correctCount: stats.correct,
          incorrectCount: stats.incorrect,
          partialCount: stats.partial,
          totalAttempts: stats.total,
          difficultyPercent,
          commonWrongAnswers
        });
      });

      analytics.sort((a, b) => a.questionNumber - b.questionNumber);

      setStudentResults(results);
      setQuestionAnalytics(analytics);
      setLoading(false);
    } catch (err) {
      console.error('Error loading results:', err);
      setError('Failed to load results');
      setLoading(false);
    }
  };

  /**
   * Sort student results
   */
  const sortedStudents = [...studentResults].sort((a, b) => {
    let aValue: number | string;
    let bValue: number | string;

    switch (sortField) {
      case 'name':
        aValue = a.studentName.toLowerCase();
        bValue = b.studentName.toLowerCase();
        break;
      case 'score':
        aValue = a.totalScore;
        bValue = b.totalScore;
        break;
      case 'bandScore':
        aValue = a.bandScore;
        bValue = b.bandScore;
        break;
      case 'percentage':
        aValue = a.percentage;
        bValue = b.percentage;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return sortAscending ? -1 : 1;
    if (aValue > bValue) return sortAscending ? 1 : -1;
    return 0;
  });

  /**
   * Handle sort
   */
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
    } else {
      setSortField(field);
      setSortAscending(false);
    }
  };

  /**
   * Handle CSV export
   */
  const handleExportCSV = () => {
    if (!testData || studentResults.length === 0) {
      alert('No results to export');
      return;
    }

    // Convert StudentResult to TestResultRecord format for export
    const exportData: TestResultRecord[] = studentResults.map((student) => ({
      resultId: student.resultId || `${sessionCode}_${student.studentId}`,
      sessionCode: sessionCode || '',
      testId: session?.testId || '',
      studentId: student.studentId,
      studentName: student.studentName,
      totalScore: student.totalScore,
      maxScore: student.maxScore,
      percentage: student.percentage,
      bandScore: student.bandScore,
      questionResults: [], // Not needed for CSV summary usually, or empty for legacy
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

    exportClassResultsToCSV(exportData, sessionCode || '', testData.title);
  };

  const handleExportPDF = () => {
    if (!testData || !sessionCode) return;

    // Map to format expected by generator
    const exportData = studentResults.map(s => ({
      studentId: s.studentId,
      studentName: s.studentName,
      sessionCode: sessionCode,
      sessionMode: 'test' as const,
      score: s.totalScore,
      percentage: s.percentage,
      totalQuestions: s.totalQuestions,
      correctAnswers: s.correct,
      completedAt: s.submittedAt,
      timeSpent: s.timeElapsed,
      isGuest: s.isGuest || false,
      bandScore: s.bandScore,
      testSkill: testData.skill,
      testTitle: testData.title,
      reMarkHistory: s.reMarkHistory ? s.reMarkHistory.length : 0
    }));

    generateClassReportPDF(exportData, testData.title, sessionCode);
  };

  // Re-marking handlers
  const openRemarkModal = (student: StudentResult) => {
    if (!student.resultId || !student.questionResults) {
      alert('Re-marking is only available for permanently saved results. Legacy results cannot be re-marked.');
      return;
    }
    setSelectedStudentForRemark(student);
    setRemarkModalOpen(true);
  };

  const handleRemarkSave = async (questionNumber: number, newScore: number, reason: string) => {
    if (!selectedStudentForRemark?.resultId) return;

    try {
      await updateResultScore(selectedStudentForRemark.resultId, questionNumber, newScore, reason, 'Teacher');

      setRemarkModalOpen(false);
      // Reload results to reflect changes
      loadAllResults();
    } catch (err) {
      console.error('Failed to save remark:', err);
      alert('Failed to save re-mark. Please try again.');
    }
  };

  // Feedback handlers
  const openFeedbackModal = (student: StudentResult) => {
    if (!student.resultId) {
      alert('Feedback is only available for permanently saved results.');
      return;
    }
    setSelectedStudentForFeedback(student);
    setFeedbackModalOpen(true);
  };

  const handleSaveOverallFeedback = async (feedback: string): Promise<void> => {
    if (!selectedStudentForFeedback?.resultId) return;

    try {
      await saveOverallFeedback(selectedStudentForFeedback.resultId, feedback, 'Teacher');
      // Reload to show updated feedback
      await loadAllResults();
    } catch (err) {
      console.error('Failed to save overall feedback:', err);
      throw err;
    }
  };

  const handleSaveQuestionFeedback = async (questionNumber: number, feedback: string): Promise<void> => {
    if (!selectedStudentForFeedback?.resultId) return;

    try {
      await saveQuestionFeedback(selectedStudentForFeedback.resultId, String(questionNumber), feedback, 'Teacher');
      // Reload to show updated feedback
      await loadAllResults();
    } catch (err) {
      console.error('Failed to save question feedback:', err);
      throw err;
    }
  };

  // Review status handler (PRD-0015: Phase 7 & 8)
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
      `Mark ${student.studentName}'s ${testData?.skill || 'test'} submission as reviewed?\n\nThis will notify the student that their test has been reviewed.`
    );

    if (!confirmed) return;

    try {
      await markAsReviewed(student.resultId, 'Teacher');
      alert(`✅ ${student.studentName}'s test marked as reviewed!`);
      // Reload results to show updated status
      await loadAllResults();
    } catch (err) {
      console.error('Failed to mark as reviewed:', err);
      alert('Failed to mark as reviewed. Please try again.');
    }
  };

  /**
   * Calculate class statistics
   */
  const classStats = {
    totalStudents: studentResults.length,
    averageScore: studentResults.length > 0
      ? studentResults.reduce((sum, s) => sum + s.totalScore, 0) / studentResults.length
      : 0,
    averagePercentage: studentResults.length > 0
      ? studentResults.reduce((sum, s) => sum + s.percentage, 0) / studentResults.length
      : 0,
    averageBandScore: studentResults.length > 0
      ? studentResults.reduce((sum, s) => sum + s.bandScore, 0) / studentResults.length
      : 0,
    highestScore: studentResults.length > 0
      ? Math.max(...studentResults.map(s => s.totalScore))
      : 0,
    lowestScore: studentResults.length > 0
      ? Math.min(...studentResults.map(s => s.totalScore))
      : 0,
    passRate: studentResults.length > 0
      ? (studentResults.filter(s => s.percentage >= 60).length / studentResults.length) * 100
      : 0,
  };

  /**
   * Format time
   */
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  };

  /**
   * Render loading state
   */
  if (loading) {
    return (
      <Center style={{ height: '100vh' }}>
        <Loader size="xl" />
      </Center>
    );
  }

  /**
   * Render error state
   */
  if (error || !session || !testData) {
    return (
      <Center style={{ height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
          {error || 'Failed to load results'}
        </div>
        <Button variant="primary" onClick={() => navigate('/sessions')}>
          Return to Sessions
        </Button>
      </Center>
    );
  }

  /**
   * PRD-0030: Writing test — render dedicated writing results section
   */
  if (testData.skill === 'Writing') {
    return (
      <WritingTestResultsSection
        sessionCode={sessionCode || ''}
        testTitle={testData.title}
      />
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 50%, rgba(240, 253, 250, 0.95) 100%)',
        padding: '2rem',
      }}
    >
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '2rem',
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Test Results Dashboard
              </h1>
              <div style={{ fontSize: '1.125rem', color: '#64748b', fontWeight: 500, marginTop: '0.5rem' }}>
                {testData.title}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                Session: {sessionCode} • {testData.type} - {testData.skill}
              </div>
            </div>

            <Button variant="glass" onClick={() => navigate('/sessions')}>
              ← Back to Sessions
            </Button>
          </div>
        </div>

        {/* Class Statistics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <Card variant="glass">
            <CardBody style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                Students
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#8b5cf6' }}>
                {classStats.totalStudents}
              </div>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                Average Score
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#06b6d4' }}>
                {classStats.averageScore.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                {classStats.averagePercentage.toFixed(1)}%
              </div>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                Avg Band Score
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10b981' }}>
                {classStats.averageBandScore.toFixed(1)}
              </div>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                Pass Rate
              </div>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f59e0b' }}>
                {classStats.passRate.toFixed(0)}%
              </div>
            </CardBody>
          </Card>

          <Card variant="glass">
            <CardBody style={{ padding: '1.5rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                High/Low
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
                {classStats.highestScore.toFixed(1)}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#ef4444' }}>
                {classStats.lowestScore.toFixed(1)}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Student Results Table */}
        <Card variant="glass" style={{ marginBottom: '2rem' }}>
          <CardBody style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                Individual Results
              </h2>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <Button variant="secondary" onClick={handleExportPDF}>
                  📄 Export PDF
                </Button>
                <Button variant="success" onClick={handleExportCSV}>
                  Download CSV
                </Button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th
                      onClick={() => handleSort('name')}
                      style={{
                        padding: '1rem',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#64748b',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Student {sortField === 'name' && (sortAscending ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('score')}
                      style={{
                        padding: '1rem',
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#64748b',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Score {sortField === 'score' && (sortAscending ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('percentage')}
                      style={{
                        padding: '1rem',
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#64748b',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Percentage {sortField === 'percentage' && (sortAscending ? '↑' : '↓')}
                    </th>
                    <th
                      onClick={() => handleSort('bandScore')}
                      style={{
                        padding: '1rem',
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#64748b',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Band Score {sortField === 'bandScore' && (sortAscending ? '↑' : '↓')}
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                      Correct
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                      Partial
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                      Incorrect
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                      Time
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((student, index) => (
                    <tr
                      key={student.studentId}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(248, 250, 252, 0.5)',
                      }}
                    >
                      <td style={{ padding: '1rem', fontWeight: 600, color: '#1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {student.studentName}
                          {/* Marking status badge - PRD-0015: Phase 7 & 8 */}
                          {student.markingStatus === 'pending-review' && (
                            <Badge
                              size="sm"
                              style={{
                                background: '#f59e0b',
                                color: 'white',
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                padding: '0.25rem 0.5rem',
                              }}
                            >
                              ⏳ Pending Review
                            </Badge>
                          )}
                          {student.markingStatus === 'reviewed' && (
                            <Badge
                              size="sm"
                              style={{
                                background: '#10b981',
                                color: 'white',
                                fontSize: '0.6875rem',
                                fontWeight: 600,
                                padding: '0.25rem 0.5rem',
                              }}
                            >
                              ✓ Reviewed
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, color: '#1e293b' }}>
                        {student.totalScore.toFixed(1)}/{student.maxScore}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 600, color: '#1e293b' }}>
                        {student.percentage.toFixed(1)}%
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', fontWeight: 700, color: '#10b981', fontSize: '1.125rem' }}>
                        {student.bandScore.toFixed(1)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#10b981', fontWeight: 600 }}>
                        {student.correct}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#f59e0b', fontWeight: 600 }}>
                        {student.partialCredit}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#ef4444', fontWeight: 600 }}>
                        {student.incorrect}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>
                        {formatTime(student.timeElapsed)}
                      </td>
                      <td style={{ padding: '1rem', textAlign: 'center', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <Button
                          variant="glass"
                          size="sm"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); openRemarkModal(student); }}
                          disabled={!student.resultId}
                        >
                          ✏️ Re-mark
                          {student.reMarkHistory && student.reMarkHistory.length > 0 && (
                            <span style={{
                              marginLeft: '4px',
                              background: '#f59e0b',
                              color: 'white',
                              borderRadius: '50%',
                              width: '16px', height: '16px',
                              fontSize: '10px',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              {student.reMarkHistory.length}
                            </span>
                          )}
                        </Button>
                        <Button
                          variant="glass"
                          size="sm"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); openFeedbackModal(student); }}
                          disabled={!student.resultId}
                        >
                          💬 Feedback
                        </Button>
                        {/* Mark as Reviewed button - PRD-0015: Phase 7 & 8 */}
                        {student.markingStatus === 'pending-review' && (
                          <Button
                            variant="success"
                            size="sm"
                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleMarkAsReviewed(student); }}
                            disabled={!student.resultId}
                            style={{
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              border: 'none',
                            }}
                          >
                            ✓ Mark Reviewed
                          </Button>
                        )}
                        <Button
                          variant="glass"
                          size="sm"
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            navigate(`/teacher/student/${student.studentId}/history`);
                          }}
                        >
                          📜 History
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* Question Difficulty Analysis */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>
            Question Difficulty Analysis ({questionAnalytics.length})
          </h2>
          {questionAnalytics.length === 0 ? (
            <Card variant="glass"><CardBody>No analytics available.</CardBody></Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {questionAnalytics.map(qa => (
                <QuestionAnalytics key={qa.questionNumber} data={qa} />
              ))}
            </div>
          )}
        </div>

        {/* Re-Marking Modal */}
        {selectedStudentForRemark && testData && (
          <ReMarkingModal
            isOpen={remarkModalOpen}
            onClose={() => setRemarkModalOpen(false)}
            studentName={selectedStudentForRemark.studentName}
            results={selectedStudentForRemark.questionResults || []}
            questions={testData.questions.map(q => ({
              questionNumber: q.number || (q.id ? parseInt(q.id.replace('q', '')) : 0),
              maxScore: q.points || 1,
              text: q.question
            }))}
            onSave={handleRemarkSave}
          />
        )}

        {/* Feedback Modal */}
        {selectedStudentForFeedback && testData && (
          <Modal
            opened={feedbackModalOpen}
            onClose={() => setFeedbackModalOpen(false)}
            title={
              <Group>
                <Title order={3}>Provide Feedback</Title>
                <Badge color="blue" size="lg">
                  {selectedStudentForFeedback.studentName}
                </Badge>
              </Group>
            }
            size="xl"
          >
            <Stack gap="lg">
              <Tabs defaultValue="overall">
                <Tabs.List>
                  <Tabs.Tab value="overall">Overall Feedback</Tabs.Tab >
                  <Tabs.Tab value="questions">Per-Question Feedback</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="overall" pt="md">
                  <FeedbackEditor
                    initialFeedback={''}
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
                            {question.isCorrect ? (
                              <Badge ml="sm" color="green" variant="light" size="sm">
                                Correct ✓
                              </Badge>
                            ) : (
                              <Badge ml="sm" color="red" variant="light" size="sm">
                                Incorrect ✗
                              </Badge>
                            )}
                          </Text>
                          <Text size="sm" c="dimmed">
                            Student: {question.studentAnswer} | Correct: {question.correctAnswer}
                          </Text>
                        </Group>
                        <FeedbackEditor
                          questionId={String(question.questionNumber)}
                          initialFeedback={question.teacherFeedback || ''}
                          onSave={(feedback) => handleSaveQuestionFeedback(question.questionNumber, feedback)}
                          placeholder={
                            question.isCorrect
                              ? 'Optionally explain why this answer is correct...'
                              : 'Explain the mistake or provide hints...'
                          }
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
    </div>
  );
};

export default TeacherTestResultsPage;
