/**
 * Student Test Results Page
 * Displays test results with detailed feedback for students
 * 
 * Features:
 * - Overall score and percentage
 * - IELTS band score
 * - Performance feedback
 * - Question-by-question review
 * - Correct/incorrect highlighting
 * - Answer comparison
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
  generatePerformanceFeedback,
  TestMarkingResult,
  Question,
  StudentAnswer,
} from '../services/autoMarking.service';
import { generateCertificatePDF, isPDFGenerationAvailable } from '../utils/pdfCertificate';
import { TestResultRecord, getStudentSessionResult } from '../services/testResults.service';
import { WritingSpeakingPlaceholder } from '../components/test/WritingSpeakingPlaceholder';
import { sessionService } from '../services/sessionService';
import { getCourseAverage } from '../services/resultsService';
import { FeedbackDisplay } from '../components/feedback/FeedbackDisplay';

interface TestSession {
  sessionCode: string;
  testId: string;
  quizId?: string;
  status: string;
  createdAt: number;
  players: Record<string, any>;
  courseId?: string;
  courseName?: string;
}

interface TestData {
  title: string;
  type: string;
  skill: string;
  questions: Question[];
  duration: number;
}

export const StudentTestResultsPage: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TestSession | null>(null);
  const [testData, setTestData] = useState<TestData | null>(null);
  const [results, setResults] = useState<TestMarkingResult | null>(null);
  const [permanentResultRecord, setPermanentResultRecord] = useState<TestResultRecord | null>(null);
  const [courseAverage, setCourseAverage] = useState<number | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [pdfAvailable, setPdfAvailable] = useState(false);

  /**
   * Load session and calculate results
   */
  useEffect(() => {
    if (!sessionCode) {
      setError('No session code provided');
      setLoading(false);
      return;
    }

    loadResults();

    // Check PDF availability
    isPDFGenerationAvailable().then(setPdfAvailable);
  }, [sessionCode]);

  const loadResults = async (retryCount = 0) => {
    try {
      console.log(`[Results] Loading results for session: ${sessionCode} (attempt ${retryCount + 1})`);

      // Load session
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const sessionSnap = await get(sessionRef);

      if (!sessionSnap.exists()) {
        setError('Session not found');
        setLoading(false);
        return;
      }

      const sessionData = sessionSnap.val();
      setSession(sessionData);

      // Fetch course average if available
      if (sessionData.courseId) {
        getCourseAverage(sessionData.courseId, sessionData.testId || sessionData.quizId).then(setCourseAverage);
      }

      // Identify Student ID FIRST (needed for permanent result lookup)
      let studentId: string | undefined = sessionService.getPlayerId() || undefined;

      if (!sessionData.players) {
        setError('No players found in session');
        setLoading(false);
        return;
      }

      const playerIds = Object.keys(sessionData.players);
      if (playerIds.length === 0) {
        setError('No players found in session');
        setLoading(false);
        return;
      }

      if (!studentId || !sessionData.players[studentId]) {
        studentId = playerIds[0];
      }

      if (!studentId) {
        setError('Invalid student ID');
        setLoading(false);
        return;
      }

      console.log(`[Results] Looking up permanent result for student: ${studentId}`);

      // ---------------------------------------------------------
      // ATTEMPT 1: Fetch Permanent Result (Enhanced System)
      // PRIMARY path - works even when teacher has already cleared
      // testId from the session (teacher-end scenario)
      // ---------------------------------------------------------
      try {
        const permanentResult = await getStudentSessionResult(studentId, sessionCode!);

        if (permanentResult) {
          console.log('[Results] Found permanent result record');
          setPermanentResultRecord(permanentResult);

          // Set testData from permanent result metadata
          // so UI has test info even when testId is cleared from session
          setTestData({
            title: permanentResult.testTitle || 'Test',
            type: permanentResult.testType || 'reading',
            skill: permanentResult.testSkill || 'Reading',
            questions: permanentResult.questionResults.map(qr => ({
              number: qr.questionNumber,
              type: qr.questionType,
              answer: qr.correctAnswer,
            })) as any,
            duration: permanentResult.testDuration || 0,
          });

          // Adapt TestResultRecord to TestMarkingResult for UI
          const adaptedResult: TestMarkingResult = {
            totalScore: permanentResult.totalScore,
            maxScore: permanentResult.maxScore,
            percentage: permanentResult.percentage,
            questionResults: permanentResult.questionResults.map(qr => ({
              questionId: String(qr.questionNumber),
              questionNumber: qr.questionNumber,
              questionType: qr.questionType as any,
              studentAnswer: qr.studentAnswer,
              correctAnswer: qr.correctAnswer,
              isCorrect: qr.isCorrect,
              score: qr.score,
              maxScore: qr.maxScore,
              feedback: qr.feedback,
              partialCredit: false
            })),
            summary: {
              correct: permanentResult.correct,
              incorrect: permanentResult.incorrect,
              partialCredit: permanentResult.partialCredit,
              totalQuestions: permanentResult.totalQuestions
            },
            completedAt: permanentResult.submittedAt,
            correct: permanentResult.correct,
            incorrect: permanentResult.incorrect,
            partialCredit: permanentResult.partialCredit,
            totalQuestions: permanentResult.totalQuestions
          } as TestMarkingResult;

          setResults(adaptedResult);
          setLoading(false);
          return;
        } else {
          console.log('[Results] No permanent result found yet');
        }
      } catch (permErr) {
        console.warn('[Results] Error fetching permanent result:', permErr);
      }

      // ---------------------------------------------------------
      // ATTEMPT 2: Load test data from Firebase and calculate
      // Requires testId to still exist in the session
      // ---------------------------------------------------------
      const testId = sessionData.testId;
      if (!testId) {
        // testId was cleared by teacher ending the test
        // The permanent result may not be written yet (race condition)
        // Retry up to 5 times with increasing delay
        const MAX_RETRIES = 5;
        if (retryCount < MAX_RETRIES) {
          const delay = (retryCount + 1) * 1500; // 1.5s, 3s, 4.5s, 6s, 7.5s
          console.log(`[Results] testId cleared, no permanent result yet. Retrying in ${delay}ms (attempt ${retryCount + 2}/${MAX_RETRIES + 1})...`);
          setTimeout(() => loadResults(retryCount + 1), delay);
          return;
        }

        console.warn('[Results] testId cleared and no permanent result found after all retries');
        setError('Test results are still being processed. Please try refreshing the page.');
        setLoading(false);
        return;
      }

      const testRef = ref(database, `tests/${testId}`);
      const testSnap = await get(testRef);

      if (!testSnap.exists()) {
        setError('Test not found');
        setLoading(false);
        return;
      }

      const test = testSnap.val();
      setTestData(test);


      // ---------------------------------------------------------
      // ATTEMPT 2: Fallback to Calculation (Legacy/Migration)
      // ---------------------------------------------------------
      console.log('⚠️ No permanent result found, recalculating from raw answers...');
      const studentData = sessionData.players[studentId];

      if (!studentData || !studentData.answers || Object.keys(studentData.answers).length === 0) {
        // ATTEMPT 3: Use pre-calculated scores from session player data
        // This handles the case where submission succeeded but permanent save failed
        if (studentData && studentData.submittedAt && studentData.percentage !== undefined) {
          console.log('📊 Using pre-calculated scores from session player data');
          const totalQ = studentData.totalQuestions || test.questions.length;
          const correct = studentData.correctCount || 0;
          const pct = studentData.percentage || 0;
          const fallbackResult: TestMarkingResult = {
            totalScore: correct,
            maxScore: totalQ,
            percentage: pct,
            questionResults: test.questions.map((q: any, idx: number) => ({
              questionId: String(q.id || q.number || idx + 1),
              questionNumber: q.number || idx + 1,
              questionType: q.type || 'unknown',
              studentAnswer: '',
              correctAnswer: q.answer || '',
              isCorrect: false,
              score: 0,
              maxScore: 1,
              feedback: 'Answer details not available',
              partialCredit: false,
            })),
            summary: {
              correct,
              incorrect: totalQ - correct,
              partialCredit: 0,
              totalQuestions: totalQ,
            },
            completedAt: studentData.submittedAt,
            correct,
            incorrect: totalQ - correct,
            partialCredit: 0,
            totalQuestions: totalQ,
          } as TestMarkingResult;

          setResults(fallbackResult);
          setLoading(false);
          return;
        }

        setError('No answers found. Your test may still be processing. Please try refreshing the page.');
        setLoading(false);
        return;
      }

      // Convert answers to format expected by marking service
      const studentAnswers: Record<number, StudentAnswer> = {};
      Object.entries(studentData.answers).forEach(([qNum, answer]: [string, any]) => {
        studentAnswers[parseInt(qNum)] = {
          questionId: `q${qNum}`,
          questionNumber: parseInt(qNum),
          answer: answer.answer !== undefined ? answer.answer : answer,
          timeSpent: answer.timeSpent,
          timestamp: answer.timestamp,
        };
      });

      // Mark the test
      const markingResult = markTest(test.questions, studentAnswers);
      setResults(markingResult);

      setLoading(false);
    } catch (err) {
      console.error('Error loading results:', err);
      setError('Failed to load results');
      setLoading(false);
    }
  };

  /**
   * Toggle question expansion
   */
  const toggleQuestion = (questionNumber: number) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionNumber)) {
      newExpanded.delete(questionNumber);
    } else {
      newExpanded.add(questionNumber);
    }
    setExpandedQuestions(newExpanded);
  };

  /**
   * Format answer display
   */
  const formatAnswer = (answer: string | string[] | Record<string, string>): string => {
    if (Array.isArray(answer)) {
      return answer.join(', ');
    }
    if (typeof answer === 'object') {
      return JSON.stringify(answer, null, 2);
    }
    return String(answer);
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
  if (error || !session || !testData || !results) {
    return (
      <Center style={{ height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
          {error || 'Failed to load results'}
        </div>
        <Button variant="primary" onClick={() => navigate('/')}>
          Return to Home
        </Button>
      </Center>
    );
  }

  const bandScore = calculateBandScore(results.percentage);
  const feedback = generatePerformanceFeedback(results.percentage);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 50%, rgba(240, 253, 250, 0.95) 100%)',
        padding: '2rem',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1
            style={{
              margin: 0,
              fontSize: '2.5rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem',
            }}
          >
            Test Results
          </h1>
          <div style={{ fontSize: '1.125rem', color: '#64748b', fontWeight: 500 }}>
            {testData.title}
          </div>
          <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            {testData.type} - {testData.skill}
          </div>
        </div>

        {/* Score Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {/* Total Score */}
          <Card variant="glass">
            <CardBody style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                Your Score
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 800, color: '#8b5cf6', marginBottom: '0.5rem' }}>
                {results.totalScore}/{results.maxScore}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#64748b' }}>
                {results.percentage.toFixed(1)}%
              </div>
            </CardBody>
          </Card>

          {/* Band Score */}
          <Card variant="glass">
            <CardBody style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                IELTS Band Score
              </div>
              <div style={{ fontSize: '3rem', fontWeight: 800, color: '#10b981', marginBottom: '0.5rem' }}>
                {bandScore.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                Out of 9.0
              </div>
            </CardBody>
          </Card>

          {/* Questions Summary */}
          <Card variant="glass">
            <CardBody style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                Questions
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem' }}>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>
                    {results.summary.correct}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Correct</div>
                </div>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f59e0b' }}>
                    {results.summary.partialCredit}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Partial</div>
                </div>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>
                    {results.summary.incorrect}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Incorrect</div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Course Average Card */}
          {session.courseId && courseAverage !== null && (
            <Card variant="glass">
              <CardBody style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                  {session.courseName ? `${session.courseName} Avg` : 'Course Average'}
                </div>
                <div style={{ fontSize: '3rem', fontWeight: 800, color: '#3b82f6', marginBottom: '0.5rem' }}>
                  {courseAverage.toFixed(1)}%
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: results.percentage >= courseAverage ? '#10b981' : '#ef4444',
                  fontWeight: 700
                }}>
                  {results.percentage >= courseAverage ? 'Above Average' : 'Below Average'}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Performance Feedback */}
        <Card variant="glass" style={{ marginBottom: '2rem' }}>
          <CardBody style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ fontSize: '3rem' }}>
                {results.percentage >= 80 ? '🎉' : results.percentage >= 60 ? '👍' : '📚'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                  Performance Feedback
                </div>
                <div style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.6 }}>
                  {feedback}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Teacher Overall Feedback */}
        {permanentResultRecord?.overallFeedback && (
          <Card variant="glass" style={{ marginBottom: '2rem' }}>
            <CardBody style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ fontSize: '2.5rem' }}>💬</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>
                    Teacher's Feedback
                  </div>
                  <FeedbackDisplay
                    feedback={permanentResultRecord.overallFeedback}
                    teacherName={permanentResultRecord.feedbackUpdatedBy || 'Your Teacher'}
                    updatedAt={permanentResultRecord.feedbackUpdatedAt || Date.now()}
                    isOverall={true}
                    variant="highlighted"
                  />
                </div>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Question-by-Question Review */}
        <div style={{ marginBottom: '2rem' }}>
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#1e293b',
              marginBottom: '1rem',
            }}
          >
            Question Review
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {results.questionResults.map((result) => {
              const isExpanded = expandedQuestions.has(result.questionNumber);
              const statusColor = result.isCorrect
                ? { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', text: '#059669' }
                : result.partialCredit
                  ? { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', text: '#d97706' }
                  : { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#dc2626' };

              return (
                <Card key={result.questionNumber} variant="glass">
                  <CardBody style={{ padding: '1.5rem' }}>
                    {/* Question Header */}
                    <div
                      onClick={() => toggleQuestion(result.questionNumber)}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        marginBottom: isExpanded ? '1rem' : 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                        {/* Question Number */}
                        <div
                          style={{
                            width: '3rem',
                            height: '3rem',
                            borderRadius: '50%',
                            background: statusColor.bg,
                            border: `2px solid ${statusColor.border}`,
                            color: statusColor.text,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '1.125rem',
                            flexShrink: 0,
                          }}
                        >
                          {result.questionNumber}
                        </div>

                        {/* Question Info */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                            Question {result.questionNumber}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: statusColor.text, fontWeight: 600 }}>
                            {result.isCorrect ? '✓ Correct' : result.partialCredit ? '⚡ Partial Credit' : '✗ Incorrect'} - {result.score}/{result.maxScore} points
                          </div>
                        </div>

                        {/* Expand Icon */}
                        <div style={{ fontSize: '1.5rem', color: '#64748b', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                          ▼
                        </div>
                      </div>
                    </div>

                    {/* Question Details (Expanded) */}
                    {isExpanded && (
                      <div style={{ paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                        {/* Your Answer */}
                        <div style={{ marginBottom: '1rem' }}>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                            Your Answer
                          </div>
                          <div
                            style={{
                              padding: '1rem',
                              background: statusColor.bg,
                              border: `1px solid ${statusColor.border}`,
                              borderRadius: '0.5rem',
                              fontSize: '0.9375rem',
                              fontWeight: 500,
                              color: '#1e293b',
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {result.studentAnswer ? formatAnswer(result.studentAnswer) : '(No answer submitted)'}
                          </div>
                        </div>

                        {/* Correct Answer */}
                        {!result.isCorrect && (
                          <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                              Correct Answer
                            </div>
                            <div
                              style={{
                                padding: '1rem',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid #10b981',
                                borderRadius: '0.5rem',
                                fontSize: '0.9375rem',
                                fontWeight: 600,
                                color: '#059669',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {formatAnswer(result.correctAnswer)}
                            </div>
                          </div>
                        )}

                        {/* Auto-Generated Feedback */}
                        <div
                          style={{
                            padding: '0.75rem 1rem',
                            background: 'rgba(248, 250, 252, 0.8)',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            color: '#64748b',
                            fontStyle: 'italic',
                            marginBottom: permanentResultRecord?.questionResults?.find(q => q.questionNumber === result.questionNumber)?.teacherFeedback ? '1rem' : 0,
                          }}
                        >
                          {result.feedback}
                        </div>

                        {/* Teacher Feedback */}
                        {(() => {
                          const questionFeedback = permanentResultRecord?.questionResults?.find(
                            q => q.questionNumber === result.questionNumber
                          )?.teacherFeedback;

                          if (!questionFeedback) return null;

                          return (
                            <div style={{ marginTop: '1rem' }}>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                                Teacher's Feedback
                              </div>
                              <FeedbackDisplay
                                feedback={questionFeedback}
                                teacherName={permanentResultRecord?.feedbackUpdatedBy || 'Your Teacher'}
                                updatedAt={permanentResultRecord?.feedbackUpdatedAt || Date.now()}
                                questionId={String(result.questionNumber)}
                                variant="default"
                              />
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => navigate('/')}>
            🏠 Return to Home
          </Button>

          {pdfAvailable && (
            <Button
              variant="primary"
              onClick={async () => {
                // Scenario A: Use Permanent Record (Preferred)
                if (permanentResultRecord) {
                  await generateCertificatePDF(permanentResultRecord);
                  return;
                }

                // Scenario B: Legacy Fallback (Reconstruct from Session)
                if (!session || !testData || !results || !sessionCode) return;
                if (!session.players || Object.keys(session.players).length === 0) return;

                const studentId = Object.keys(session.players)[0];
                if (!studentId) return;

                const studentData = session.players[studentId];

                // Convert to TestResultRecord format
                const resultRecord: TestResultRecord = {
                  resultId: `${sessionCode}_temp`,
                  sessionCode,
                  testId: session.testId,
                  studentId,
                  studentName: studentData?.name || 'Student',
                  totalScore: results.totalScore,
                  maxScore: results.maxScore,
                  percentage: results.percentage,
                  bandScore: calculateBandScore(results.percentage),
                  questionResults: results.questionResults.map(qr => ({
                    questionNumber: qr.questionNumber,
                    questionType: qr.questionType,
                    isCorrect: qr.isCorrect,
                    score: qr.score,
                    maxScore: qr.maxScore,
                    studentAnswer: qr.studentAnswer,
                    correctAnswer: qr.correctAnswer,
                    feedback: qr.feedback,
                  })),
                  correct: results.summary.correct,
                  incorrect: results.summary.incorrect,
                  partialCredit: results.summary.partialCredit,
                  totalQuestions: results.summary.totalQuestions,
                  submittedAt: results.completedAt,
                  timeElapsed: 0,
                  testDuration: testData.duration,
                  createdAt: Date.now(),
                  testTitle: testData.title,
                  testType: testData.type,
                  testSkill: testData.skill,
                };

                await generateCertificatePDF(resultRecord);
              }}
            >
              📄 Download Certificate
            </Button>
          )}

          <Button variant="glass" onClick={() => window.print()}>
            🖨️ Print Results
          </Button>
        </div>

        {/* Writing/Speaking Placeholder */}
        {(permanentResultRecord?.writingSubmission || permanentResultRecord?.speakingSubmission) && (
          <div style={{ marginTop: '2rem' }}>
            <WritingSpeakingPlaceholder
              type={permanentResultRecord.testSkill === 'speaking' ? 'speaking' : 'writing'}
              submission={permanentResultRecord.writingSubmission || permanentResultRecord.speakingSubmission}
              status={permanentResultRecord.markingStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentTestResultsPage;
