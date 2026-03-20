/**
 * Student Detail Modal Component
 * Displays detailed view of individual student's test progress
 * 
 * Features:
 * - Student information and status
 * - Question-by-question answer review
 * - Time spent per question
 * - Overall progress statistics
 * - Answer status indicators
 */

import React, { useState, useEffect } from 'react';
import { Modal } from '@mantine/core';
import { Button } from '../modern';
// @ts-ignore - Firebase is a .js file
import { database } from '../../services/firebase';
// @ts-ignore - Firebase is a .js file
import { ref, update } from 'firebase/database';
import { calculateBandScoreFromConfig } from '../../config/scoring.config';

interface StudentAnswer {
  questionNumber: number;
  answer: string | string[];
  timeSpent?: number;
  timestamp?: number;
}

/** Per-student accommodation settings */
interface StudentAccommodationInput {
  extraTime?: number;
  unlimitedReplays?: boolean;
  maxReplays?: number;
  fullAudioControls?: boolean;
}

interface StudentDetailModalProps {
  /**
   * Whether modal is open
   */
  opened: boolean;

  /**
   * Close handler
   */
  onClose: () => void;

  /**
   * Student name
   */
  studentName: string;

  /**
   * Student ID
   */
  studentId: string;

  /**
   * Student answers
   */
  answers: Record<number, StudentAnswer>;

  /**
   * Total questions in test
   */
  totalQuestions: number;

  /**
   * Student status
   */
  status: 'working' | 'submitted' | 'disconnected';

  /**
   * Time elapsed (ms)
   */
  timeElapsed: number;

  /**
   * Session code for Firebase updates
   */
  sessionCode?: string;

  /**
   * Test questions with correct answers (for re-marking)
   */
  testQuestions?: Array<{
    number: number;
    question: string;
    answer: string | string[] | Record<string, string>;
    type: string;
  }>;

  /**
   * Test skill type (for showing accommodation options)
   */
  testSkill?: string;

  /**
   * Callback to set student accommodation (for listening tests)
   */
  onSetAccommodation?: (studentId: string, accommodation: StudentAccommodationInput) => Promise<void>;

  /**
   * Callback to clear student accommodation
   */
  onClearAccommodation?: (studentId: string) => Promise<void>;

  /**
   * Current accommodation for this student (if any)
   */
  currentAccommodation?: StudentAccommodationInput | null;

  /**
   * PRD-0018 Task 10.6: Whether exam mode is active (disables accommodations)
   */
  examMode?: boolean;

  /**
   * PRD-0028: THCS section data for grouped answer view
   */
  thcsSections?: Array<{
    id: string;
    name: string;
    questions: Array<{
      questionNumber: number;
      type: string;
      questionText: string;
      correctAnswer?: string;
      options?: string[];
      sentenceTemplate?: string;
      blankAnswers?: Array<{ answer: string; alternatives?: string[] }>;
      originalSentence?: string;
      modelAnswers?: string[];
    }>;
  }>;

  /**
   * PRD-0028: THCS grading results per question
   */
  thcsResults?: Record<number, {
    pointsEarned?: number;
    isCorrect?: boolean;
    writingResult?: {
      teacherScore?: number;
      teacherFeedback?: string;
      gradingTier?: string;
    };
  }>;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  opened,
  onClose,
  studentName,
  studentId,
  answers,
  totalQuestions,
  status,
  timeElapsed,
  sessionCode,
  testQuestions,
  testSkill,
  onSetAccommodation,
  onClearAccommodation,
  currentAccommodation,
  examMode = false,
  thcsSections,
  thcsResults,
}) => {
  // Re-marking state
  const [isReMarking, setIsReMarking] = useState(false);
  const [manualMarks, setManualMarks] = useState<Record<number, boolean>>({});
  const [isSubmittingRemarks, setIsSubmittingRemarks] = useState(false);

  // Accommodation state (for listening tests)
  const [showAccommodationPanel, setShowAccommodationPanel] = useState(false);
  const [accommodationForm, setAccommodationForm] = useState<StudentAccommodationInput>({
    extraTime: currentAccommodation?.extraTime || 0,
    unlimitedReplays: currentAccommodation?.unlimitedReplays || false,
    maxReplays: currentAccommodation?.maxReplays || 2,
    fullAudioControls: currentAccommodation?.fullAudioControls || false,
  });
  const [isSavingAccommodation, setIsSavingAccommodation] = useState(false);

  // Update form when currentAccommodation changes
  useEffect(() => {
    if (currentAccommodation) {
      setAccommodationForm({
        extraTime: currentAccommodation.extraTime || 0,
        unlimitedReplays: currentAccommodation.unlimitedReplays || false,
        maxReplays: currentAccommodation.maxReplays || 2,
        fullAudioControls: currentAccommodation.fullAudioControls || false,
      });
    }
  }, [currentAccommodation]);

  // Handle saving accommodation
  const handleSaveAccommodation = async () => {
    if (!onSetAccommodation || isSavingAccommodation) return;

    setIsSavingAccommodation(true);
    try {
      await onSetAccommodation(studentId, accommodationForm);
      setShowAccommodationPanel(false);
    } catch (error) {
      console.error('Failed to save accommodation:', error);
    } finally {
      setIsSavingAccommodation(false);
    }
  };

  // Handle clearing accommodation
  const handleClearAccommodation = async () => {
    if (!onClearAccommodation || isSavingAccommodation) return;

    const confirmed = window.confirm('Clear all accommodations for this student?');
    if (!confirmed) return;

    setIsSavingAccommodation(true);
    try {
      await onClearAccommodation(studentId);
      setAccommodationForm({
        extraTime: 0,
        unlimitedReplays: false,
        maxReplays: 2,
        fullAudioControls: false,
      });
      setShowAccommodationPanel(false);
    } catch (error) {
      console.error('Failed to clear accommodation:', error);
    } finally {
      setIsSavingAccommodation(false);
    }
  };

  // Initialize manual marks from existing answers when entering re-marking mode
  const initializeReMarking = () => {
    if (!testQuestions) return;

    const initialMarks: Record<number, boolean> = {};
    testQuestions.forEach(question => {
      const studentAnswer = answers[question.number]?.answer;
      if (studentAnswer !== undefined) {
        // Auto-mark based on correct answer
        let isCorrect = false;
        if (Array.isArray(question.answer) && Array.isArray(studentAnswer)) {
          isCorrect = JSON.stringify(question.answer.sort()) === JSON.stringify(studentAnswer.sort());
        } else if (typeof question.answer === 'object' && typeof studentAnswer === 'object' && !Array.isArray(question.answer) && !Array.isArray(studentAnswer)) {
          const correctAnswers = question.answer as Record<string, string>;
          const studentAnswers = studentAnswer as Record<string, string>;
          isCorrect = Object.keys(correctAnswers).every(key =>
            correctAnswers[key] === studentAnswers[key]
          );
        } else {
          const normalize = (text: string) => text.toLowerCase().trim().replace(/\s+/g, ' ');
          isCorrect = normalize(String(studentAnswer)) === normalize(String(question.answer));
        }
        initialMarks[question.number] = isCorrect;
      }
    });
    setManualMarks(initialMarks);
    setIsReMarking(true);
  };

  // Toggle mark for a question
  const toggleMark = (questionNumber: number) => {
    setManualMarks(prev => ({
      ...prev,
      [questionNumber]: !prev[questionNumber]
    }));
  };

  // Submit re-marking
  const handleSubmitRemarks = async () => {
    if (!sessionCode || !studentId || isSubmittingRemarks) return;

    const confirmed = window.confirm(
      'Are you sure you want to submit these marks? This will override the auto-marking and notify the student.'
    );

    if (!confirmed) return;

    setIsSubmittingRemarks(true);

    try {
      // Calculate scores
      const correctCount = Object.values(manualMarks).filter(Boolean).length;
      const totalScore = correctCount;
      const maxScore = totalQuestions;
      const percentage = Math.round((correctCount / totalQuestions) * 100);
      const bandScore = calculateBandScoreFromConfig(percentage);

      // Prepare re-mark details
      const reMarkDetails: Record<string, number> = {};
      Object.entries(manualMarks).forEach(([qNum, isCorrect]) => {
        reMarkDetails[qNum] = isCorrect ? 1 : 0;
      });

      // Update Firebase
      const playerRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);
      await update(playerRef, {
        isReMarked: true,
        reMarkTimestamp: Date.now(),
        correctCount,
        score: totalScore,
        maxScore,
        percentage,
        bandScore,
        reMarkDetails,
      });

      alert('Re-marking submitted successfully! The student will be notified.');
      setIsReMarking(false);

    } catch (error) {
      console.error('Error submitting re-marks:', error);
      alert('Failed to submit re-marks. Please try again.');
    } finally {
      setIsSubmittingRemarks(false);
    }
  };

  /**
   * Get status display
   */
  const getStatusDisplay = () => {
    switch (status) {
      case 'submitted':
        return { label: 'Submitted', color: '#10b981', icon: '✓', bg: 'rgba(16, 185, 129, 0.1)' };
      case 'disconnected':
        return { label: 'Disconnected', color: '#ef4444', icon: '⚠', bg: 'rgba(239, 68, 68, 0.1)' };
      default:
        return { label: 'Working', color: '#3b82f6', icon: '✎', bg: 'rgba(59, 130, 246, 0.1)' };
    }
  };

  const statusDisplay = getStatusDisplay();

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
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  /**
   * Calculate statistics
   */
  const answeredCount = Object.keys(answers || {}).length;
  const progress = totalQuestions > 0
    ? Math.round((answeredCount / totalQuestions) * 100)
    : 0;

  /**
   * Format answer display
   */
  const formatAnswer = (answer: string | string[] | Record<string, string>): string => {
    if (Array.isArray(answer)) {
      return answer.join(', ');
    }
    if (typeof answer === 'object' && answer !== null) {
      // Format dropdown matching answers as "key1: value1, key2: value2"
      return Object.entries(answer)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
    }
    return String(answer);
  };

  /**
   * Check if an answer is correct
   */
  const checkAnswerCorrectness = React.useCallback((questionNumber: number, studentAnswer: any): boolean => {
    if (!testQuestions || !studentAnswer) return false;

    const question = testQuestions.find(q => q.number === questionNumber);
    if (!question || !question.answer) return false;

    const correctAnswer = question.answer;

    // Handle different answer types
    if (Array.isArray(correctAnswer) && Array.isArray(studentAnswer)) {
      // Multiple select - arrays must match
      return JSON.stringify(correctAnswer.sort()) === JSON.stringify(studentAnswer.sort());
    } else if (typeof correctAnswer === 'object' && typeof studentAnswer === 'object' &&
      !Array.isArray(correctAnswer) && !Array.isArray(studentAnswer)) {
      // Dropdown matching - object comparison
      const correctAnswers = correctAnswer as Record<string, string>;
      const studentAnswers = studentAnswer as Record<string, string>;
      return Object.keys(correctAnswers).every(key =>
        correctAnswers[key] === studentAnswers[key]
      );
    } else {
      // Simple text/choice comparison
      const normalize = (text: any) => String(text).toLowerCase().trim().replace(/\s+/g, ' ');
      return normalize(studentAnswer) === normalize(correctAnswer);
    }
  }, [testQuestions]);

  /**
   * Calculate correct/incorrect counts for auto-marking display
   */
  const autoMarkingStats = React.useMemo(() => {
    if (!testQuestions || !answers) {
      return { correct: 0, incorrect: 0, unanswered: totalQuestions };
    }

    let correct = 0;
    let incorrect = 0;
    let unanswered = 0;

    for (let i = 1; i <= totalQuestions; i++) {
      const answer = answers[i];
      if (!answer?.answer) {
        unanswered++;
      } else {
        const isCorrect = checkAnswerCorrectness(i, answer.answer);
        if (isCorrect) {
          correct++;
        } else {
          incorrect++;
        }
      }
    }

    return { correct, incorrect, unanswered };
  }, [answers, testQuestions, totalQuestions, checkAnswerCorrectness]);

  /**
   * Create question list with status and correctness
   * During test (before submission): only show answered questions
   * After submission: show all questions
   */
  const questionList = React.useMemo(() => {
    const allQuestions = Array.from({ length: totalQuestions }, (_, i) => {
      const questionNum = i + 1;
      const answer = answers ? answers[questionNum] : null;
      const isCorrect = answer?.answer ? checkAnswerCorrectness(questionNum, answer.answer) : null;

      return {
        number: questionNum,
        hasAnswer: !!answer,
        answer: answer?.answer,
        timeSpent: answer?.timeSpent,
        isCorrect: isCorrect, // null if no answer, true/false if answered
      };
    });

    // If student hasn't submitted yet, only show answered questions
    if (status !== 'submitted') {
      return allQuestions.filter(q => q.hasAnswer);
    }

    // After submission, show all questions
    return allQuestions;
  }, [answers, totalQuestions, status, checkAnswerCorrectness]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Student Details: ${studentName}`}
      size="lg"
      padding={0}
      styles={{
        title: {
          fontSize: '1.5rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        },
        header: {
          padding: '1.5rem',
          background: 'rgba(139, 92, 246, 0.05)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
        },
        body: {
          padding: 0,
          maxHeight: 'calc(90vh - 120px)',
          overflowY: 'auto',
        },
        content: {
          borderRadius: '1rem',
          overflow: 'visible',
          maxHeight: '90vh',
        },
      }}
    >
      {/* Always show listing format - removed tiny boxes grid */}
      <>
        {/* Student Info Section */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            {/* Status */}
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 600 }}>
                Status
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  background: statusDisplay.bg,
                  border: `2px solid ${statusDisplay.color}`,
                  borderRadius: '0.5rem',
                  color: statusDisplay.color,
                  fontWeight: 600,
                }}
              >
                <span>{statusDisplay.icon}</span>
                <span>{statusDisplay.label}</span>
              </div>
            </div>

            {/* Time Elapsed */}
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase', fontWeight: 600 }}>
                Time Elapsed
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>
                {formatTime(timeElapsed)}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Progress
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
                {answeredCount}/{totalQuestions} ({progress}%)
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '0.75rem',
                background: '#e2e8f0',
                borderRadius: '9999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: status === 'submitted'
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  transition: 'width 0.3s ease',
                }}
                role="progressbar"
                aria-label="Student progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              />
            </div>
          </div>
        </div>

        {/* Listening Test Accommodations */}
        {testSkill === 'Listening' && onSetAccommodation && (
          <div
            style={{
              margin: '1.5rem',
              marginBottom: 0,
              padding: '1rem',
              background: examMode
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)'
                : 'linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(245, 158, 11, 0.1) 100%)',
              borderRadius: '0.75rem',
              border: examMode
                ? '1px solid rgba(239, 68, 68, 0.3)'
                : '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            {/* PRD-0018 Task 10.6: Exam Mode Warning */}
            {examMode && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(239, 68, 68, 0.15)',
                  borderRadius: '0.375rem',
                  color: '#dc2626',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                }}
              >
                <span>🎓</span>
                <span>Exam Mode Active — Accommodations will not apply to this session</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: examMode ? '#dc2626' : '#92400e' }}>
                ♿ Student Accommodations {examMode && '(Disabled)'}
              </div>
              <button
                onClick={() => setShowAccommodationPanel(!showAccommodationPanel)}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: showAccommodationPanel ? '#f59e0b' : 'transparent',
                  color: showAccommodationPanel ? 'white' : '#92400e',
                  border: '1px solid #f59e0b',
                  borderRadius: '0.375rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {showAccommodationPanel ? 'Hide' : 'Configure'}
              </button>
            </div>

            {/* Current accommodation status */}
            {currentAccommodation && !showAccommodationPanel && (
              <div style={{ fontSize: '0.75rem', color: '#78350f' }}>
                <strong>Active:</strong>
                {currentAccommodation.extraTime ? ` +${Math.round(currentAccommodation.extraTime / 60)}min time` : ''}
                {currentAccommodation.unlimitedReplays ? ' • Unlimited replays' : currentAccommodation.maxReplays ? ` • ${currentAccommodation.maxReplays} replays` : ''}
                {currentAccommodation.fullAudioControls ? ' • Full controls' : ''}
              </div>
            )}

            {/* Accommodation configuration panel */}
            {showAccommodationPanel && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(245, 158, 11, 0.2)' }}>
                {/* Extra Time */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#78350f', marginBottom: '0.25rem' }}>
                    Extra Time (minutes)
                  </label>
                  <select
                    value={accommodationForm.extraTime ? accommodationForm.extraTime / 60 : 0}
                    onChange={(e) => setAccommodationForm(prev => ({ ...prev, extraTime: Number(e.target.value) * 60 }))}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d97706',
                      background: 'white',
                      fontSize: '0.875rem',
                    }}
                  >
                    <option value={0}>No extra time</option>
                    <option value={5}>+5 minutes</option>
                    <option value={10}>+10 minutes</option>
                    <option value={15}>+15 minutes</option>
                    <option value={30}>+30 minutes</option>
                  </select>
                </div>

                {/* Replay Settings */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#78350f', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={accommodationForm.unlimitedReplays || false}
                      onChange={(e) => setAccommodationForm(prev => ({ ...prev, unlimitedReplays: e.target.checked }))}
                      style={{ width: '1rem', height: '1rem' }}
                    />
                    Unlimited Audio Replays
                  </label>
                </div>

                {!accommodationForm.unlimitedReplays && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#78350f', marginBottom: '0.25rem' }}>
                      Max Replays (override)
                    </label>
                    <select
                      value={accommodationForm.maxReplays || 2}
                      onChange={(e) => setAccommodationForm(prev => ({ ...prev, maxReplays: Number(e.target.value) }))}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '0.375rem',
                        border: '1px solid #d97706',
                        background: 'white',
                        fontSize: '0.875rem',
                      }}
                    >
                      <option value={1}>1 replay</option>
                      <option value={2}>2 replays</option>
                      <option value={3}>3 replays</option>
                      <option value={5}>5 replays</option>
                    </select>
                  </div>
                )}

                {/* Full Audio Controls */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#78350f', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={accommodationForm.fullAudioControls || false}
                      onChange={(e) => setAccommodationForm(prev => ({ ...prev, fullAudioControls: e.target.checked }))}
                      style={{ width: '1rem', height: '1rem' }}
                    />
                    Enable All Audio Controls (pause, seek, speed)
                  </label>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveAccommodation}
                    disabled={isSavingAccommodation}
                    style={{ flex: 1, background: '#f59e0b', borderColor: '#f59e0b' }}
                  >
                    {isSavingAccommodation ? 'Saving...' : 'Save Accommodation'}
                  </Button>
                  {currentAccommodation && (
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={handleClearAccommodation}
                      disabled={isSavingAccommodation}
                      style={{ color: '#dc2626' }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Auto-Marking Summary */}
        {testQuestions && answeredCount > 0 && (
          <div
            style={{
              margin: '1.5rem',
              marginBottom: 0,
              padding: '1rem',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(6, 182, 212, 0.05) 100%)',
              borderRadius: '0.75rem',
              border: '1px solid rgba(139, 92, 246, 0.2)',
            }}
          >
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b', marginBottom: '0.75rem' }}>
              Auto-Marking Results
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
                  {autoMarkingStats.correct}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Correct</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>
                  {autoMarkingStats.incorrect}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Incorrect</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#94a3b8' }}>
                  {autoMarkingStats.unanswered}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Unanswered</div>
              </div>
            </div>
            {autoMarkingStats.correct + autoMarkingStats.incorrect > 0 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(139, 92, 246, 0.1)' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>
                  Score: {autoMarkingStats.correct}/{autoMarkingStats.correct + autoMarkingStats.incorrect}
                  {' '}({Math.round((autoMarkingStats.correct / (autoMarkingStats.correct + autoMarkingStats.incorrect)) * 100) || 0}%)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Questions List */}
        <div
          style={{
            padding: '1.5rem',
          }}
        >
          <h3
            style={{
              fontSize: '1.125rem',
              fontWeight: 700,
              color: '#1e293b',
              marginBottom: '1rem',
            }}
          >
            {status === 'submitted'
              ? `Answers (${answeredCount}/${totalQuestions} answered)`
              : `Answers (${answeredCount} answered so far)`
            }
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* PRD-0028: THCS grouped section view */}
            {thcsSections && thcsSections.length > 0 ? (
              thcsSections.map(section => (
                <div key={section.id} style={{ marginBottom: '1.5rem' }}>
                  {/* Section header */}
                  <div style={{
                    padding: '0.5rem 0.75rem',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))',
                    borderRadius: '8px',
                    marginBottom: '0.5rem',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: '#4338ca',
                  }}>
                    {section.name}
                  </div>
                  {section.questions.map(sq => {
                    const studentAnswer = answers?.[sq.questionNumber];
                    const hasAnswer = !!studentAnswer;
                    const result = thcsResults?.[sq.questionNumber];
                    const isMCQ = sq.type.includes('mcq') || sq.type.includes('pronunciation') || sq.type.includes('word-stress') ||
                      sq.type.includes('dialogue') || sq.type.includes('reading-comprehension') ||
                      sq.type.includes('reading-announcement') || sq.type.includes('sentence-arrangement') ||
                      sq.type.includes('closest-meaning') || sq.type.includes('error-identification') ||
                      sq.type.includes('synonym') || sq.type.includes('antonym') || sq.type.includes('word-reference') ||
                      sq.type.includes('reading-cloze-mcq') || sq.type.includes('sign-notice');
                    const isWriting = sq.type === 'sentence-rewrite' || sq.type === 'sentence-rewrite-keyword';
                    const isFillIn = sq.type === 'verb-form' || sq.type === 'word-form';
                    const isCorrect = result?.isCorrect ?? (hasAnswer && isMCQ && sq.correctAnswer ? String(studentAnswer?.answer) === sq.correctAnswer : null);

                    return (
                      <div
                        key={sq.questionNumber}
                        style={{
                          padding: '0.75rem',
                          marginBottom: '0.4rem',
                          borderRadius: '8px',
                          border: `1px solid ${isCorrect === true ? 'rgba(16,185,129,0.3)' : isCorrect === false ? 'rgba(239,68,68,0.3)' : '#e2e8f0'}`,
                          background: isCorrect === true ? 'rgba(16,185,129,0.05)' : isCorrect === false ? 'rgba(239,68,68,0.05)' : '#fafafa',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            color: isCorrect === true ? '#059669' : isCorrect === false ? '#dc2626' : '#64748b',
                          }}>
                            Q{sq.questionNumber}
                          </span>
                          {isMCQ && hasAnswer && (
                            <span style={{ fontSize: '0.9rem' }}>{isCorrect ? '✓' : '✕'}</span>
                          )}
                          {isWriting && (
                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '4px', background: '#f5f3ff', color: '#7c3aed', fontWeight: 600 }}>Writing</span>
                          )}
                          {isFillIn && (
                            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem', borderRadius: '4px', background: '#fffbeb', color: '#d97706', fontWeight: 600 }}>Fill-in</span>
                          )}
                        </div>

                        {/* MCQ answer display */}
                        {isMCQ && (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem' }}>
                            <span style={{ color: '#64748b' }}>Answer:</span>
                            <span style={{ fontWeight: 600, color: isCorrect ? '#059669' : '#dc2626' }}>{hasAnswer ? String(studentAnswer?.answer) : '—'}</span>
                            {!isCorrect && sq.correctAnswer && (
                              <span style={{ color: '#059669', fontStyle: 'italic' }}>({sq.correctAnswer})</span>
                            )}
                          </div>
                        )}

                        {/* Fill-in side-by-side */}
                        {isFillIn && (
                          <div style={{ fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <span style={{ color: '#64748b' }}>Student:</span>
                              <span style={{ fontWeight: 600, color: '#1e293b' }}>{hasAnswer ? String(studentAnswer?.answer) : '—'}</span>
                            </div>
                            {sq.blankAnswers && sq.blankAnswers[0] && (
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <span style={{ color: '#64748b' }}>Correct:</span>
                                <span style={{ fontWeight: 600, color: '#059669' }}>{sq.blankAnswers[0].answer}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Writing answer with grade */}
                        {isWriting && (
                          <div style={{ fontSize: '0.8rem' }}>
                            <div style={{ color: '#334155', marginBottom: '0.25rem' }}>
                              <strong>Student:</strong> {hasAnswer ? String(studentAnswer?.answer) : <em style={{ color: '#94a3b8' }}>No answer</em>}
                            </div>
                            {sq.modelAnswers && sq.modelAnswers.length > 0 && (
                              <div style={{ color: '#059669', marginBottom: '0.25rem' }}>
                                <strong>Model:</strong> {sq.modelAnswers[0]}
                              </div>
                            )}
                            {result?.writingResult?.gradingTier === 'teacher-graded' && (
                              <div style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', marginTop: '0.25rem' }}>
                                <span style={{ fontWeight: 700, color: '#166534' }}>Score: {result.writingResult.teacherScore}</span>
                                {result.writingResult.teacherFeedback && (
                                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#166534', fontStyle: 'italic' }}>{result.writingResult.teacherFeedback}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Section score */}
                  {thcsResults && (
                    <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748b', fontWeight: 600, marginTop: '0.25rem' }}>
                      Section: {section.questions.reduce((sum, q) => sum + (thcsResults[q.questionNumber]?.pointsEarned || 0), 0).toFixed(1)} pts
                    </div>
                  )}
                </div>
              ))
            ) : (
              questionList.map((q) => (
                <div
                  key={q.number}
                  style={{
                    padding: '1rem',
                    background: q.hasAnswer
                      ? (testQuestions // Only show color if we can check correctness
                        ? (q.isCorrect
                          ? 'rgba(16, 185, 129, 0.05)' // Green for correct
                          : 'rgba(239, 68, 68, 0.05)') // Red for incorrect
                        : 'rgba(59, 130, 246, 0.05)') // Blue if no answer key available
                      : 'rgba(100, 116, 139, 0.05)', // Gray for no answer
                    border: q.hasAnswer
                      ? (testQuestions
                        ? (q.isCorrect
                          ? '1px solid rgba(16, 185, 129, 0.3)' // Green border for correct
                          : '1px solid rgba(239, 68, 68, 0.3)') // Red border for incorrect
                        : '1px solid rgba(59, 130, 246, 0.2)') // Blue if no answer key
                      : '1px solid rgba(100, 116, 139, 0.2)', // Gray for no answer
                    borderRadius: '0.5rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Question Number with Correctness Indicator */}
                  <div
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '50%',
                      background: q.hasAnswer
                        ? (testQuestions
                          ? (q.isCorrect
                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' // Green for correct
                            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)') // Red for incorrect
                          : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)') // Blue if no answer key
                        : '#94a3b8', // Gray for no answer
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1rem',
                      flexShrink: 0,
                      position: 'relative',
                    }}
                  >
                    {q.number}
                    {/* Correctness Icon Overlay */}
                    {q.hasAnswer && testQuestions && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '-4px',
                          right: '-4px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: q.isCorrect ? '#10b981' : '#ef4444',
                          border: '2px solid white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 'bold',
                        }}
                      >
                        {q.isCorrect ? '✓' : '✗'}
                      </div>
                    )}
                  </div>

                  {/* Answer Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                      Question {q.number}
                    </div>

                    {q.hasAnswer ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                          <div
                            style={{
                              fontSize: '0.9375rem',
                              fontWeight: 600,
                              color: '#1e293b',
                              wordBreak: 'break-word',
                            }}
                          >
                            {q.answer ? formatAnswer(q.answer) : 'N/A'}
                          </div>

                          {/* Correctness Label */}
                          {testQuestions && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.125rem 0.5rem',
                                borderRadius: '0.25rem',
                                background: q.isCorrect
                                  ? 'rgba(16, 185, 129, 0.15)'
                                  : 'rgba(239, 68, 68, 0.15)',
                                color: q.isCorrect ? '#059669' : '#dc2626',
                                border: q.isCorrect
                                  ? '1px solid rgba(16, 185, 129, 0.3)'
                                  : '1px solid rgba(239, 68, 68, 0.3)',
                              }}
                            >
                              {q.isCorrect ? 'Correct' : 'Incorrect'}
                            </span>
                          )}
                        </div>

                        {/* Show correct answer if incorrect */}
                        {testQuestions && !q.isCorrect && (() => {
                          const correctQuestion = testQuestions.find(tq => tq.number === q.number);
                          if (correctQuestion?.answer) {
                            return (
                              <div style={{
                                fontSize: '0.8125rem',
                                color: '#059669',
                                marginBottom: '0.25rem',
                                fontStyle: 'italic',
                              }}>
                                Correct answer: {formatAnswer(correctQuestion.answer)}
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {q.timeSpent && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            Time: {formatTime(q.timeSpent)}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ fontSize: '0.875rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        No answer submitted
                      </div>
                    )}
                  </div>

                  {/* Re-marking Toggle */}
                  {isReMarking && q.hasAnswer && (
                    <div style={{ flexShrink: 0 }}>
                      <button
                        onClick={() => toggleMark(q.number)}
                        style={{
                          width: '3rem',
                          height: '3rem',
                          borderRadius: '0.5rem',
                          border: 'none',
                          background: manualMarks[q.number]
                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                          color: 'white',
                          fontSize: '1.5rem',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        }}
                        title={manualMarks[q.number] ? 'Mark as Incorrect' : 'Mark as Correct'}
                      >
                        {manualMarks[q.number] ? '✓' : '✗'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1.5rem',
            borderTop: '1px solid rgba(139, 92, 246, 0.2)',
            background: 'rgba(139, 92, 246, 0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          {/* Re-marking Controls */}
          {status === 'submitted' && testQuestions && sessionCode && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              {!isReMarking ? (
                <Button
                  variant="secondary"
                  onClick={initializeReMarking}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    border: 'none',
                  }}
                >
                  📝 Re-mark Test
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={handleSubmitRemarks}
                    disabled={isSubmittingRemarks}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      border: 'none',
                    }}
                  >
                    {isSubmittingRemarks ? 'Submitting...' : '✓ Submit Re-marks'}
                  </Button>
                  <Button
                    variant="glass"
                    onClick={() => {
                      setIsReMarking(false);
                      setManualMarks({});
                    }}
                    disabled={isSubmittingRemarks}
                  >
                    Cancel
                  </Button>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600 }}>
                    Correct: {Object.values(manualMarks).filter(Boolean).length}/{Object.keys(manualMarks).length}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Close Button */}
          <Button variant="primary" onClick={onClose} disabled={isSubmittingRemarks}>
            Close
          </Button>
        </div>
      </>
    </Modal>
  );
};
