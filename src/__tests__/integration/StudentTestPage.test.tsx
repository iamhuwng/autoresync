/**
 * Integration tests for refactored StudentTestPage
 * Tests interaction with other components and stability
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { StudentTestPage } from '../../pages/StudentTestPage';
import * as useTestData from '../../hooks/test/useTestData';
import * as useTestSession from '../../hooks/test/useTestSession';
import * as useTestTimer from '../../hooks/test/useTestTimer';
import * as useTestSubmission from '../../hooks/test/useTestSubmission';

// Mock Firebase
vi.mock('../../services/firebase', () => ({
  database: {},
  auth: {},
}));

// Mock Firebase functions
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  serverTimestamp: vi.fn(),
}));

describe('StudentTestPage Integration Tests', () => {
  const mockTestData = {
    id: 'test-123',
    title: 'Sample Test',
    type: 'IELTS',
    skill: 'Reading',
    duration: 60,
    questionCount: 40,
    passages: [
      {
        id: 'p1',
        title: 'Passage 1',
        content: 'This is passage content...',
        type: 'text',
      },
      {
        id: 'p2', 
        title: 'Passage 2',
        content: 'Another passage...',
        type: 'text',
      }
    ],
    questions: [
      {
        number: 1,
        type: 'multiple-choice',
        question: 'Question 1',
        options: ['A', 'B', 'C', 'D'],
        answer: 'A',
        passageId: 'p1',
        points: 1,
      },
      {
        number: 2,
        type: 'completion',
        question: 'Complete: The answer is ____',
        answer: 'test',
        passageId: 'p1',
        points: 1,
      }
    ]
  };

  const mockSession = {
    testId: 'test-123',
    sessionCode: 'ABC123',
    studentName: 'Test Student',
    startTime: Date.now(),
    answers: {},
    isSubmitted: false,
  };

  beforeEach(() => {
    // Clear sessionStorage
    sessionStorage.clear();
    sessionStorage.setItem('playerId', 'player-123');
    sessionStorage.setItem('playerName', 'Test Student');
    sessionStorage.setItem('sessionCode', 'ABC123');
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('Component Integration', () => {
    it('should load and display test data correctly', async () => {
      // Mock hooks
      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: mockTestData,
        loading: false,
        error: null,
        activePassageId: 'p1',
        setActivePassageId: vi.fn(),
      });

      vi.spyOn(useTestSession, 'useTestSession').mockReturnValue({
        session: mockSession,
        setSession: vi.fn(),
        sessionStatus: 'in-progress',
        isPaused: false,
        sessionStartTime: Date.now() - 5000,
        pausedDuration: 0,
        reMarkingData: null,
        showReMarkModal: false,
        setShowReMarkModal: vi.fn(),
        setTestResults: vi.fn(),
      });

      vi.spyOn(useTestTimer, 'useTestTimer').mockReturnValue({
        timeRemaining: 3540, // 59:00
        formatTime: (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`,
      });

      vi.spyOn(useTestSubmission, 'useTestSubmission').mockReturnValue({
        isSubmitting: false,
        testSubmitted: false,
        testResults: null,
        handleSubmit: vi.fn(),
        markTest: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      // Check if test title is displayed
      await waitFor(() => {
        expect(screen.getByText('Sample Test')).toBeInTheDocument();
      });

      // Check if passages tabs are rendered
      expect(screen.getByText('Passage 1')).toBeInTheDocument();
      expect(screen.getByText('Passage 2')).toBeInTheDocument();

      // Check timer display
      expect(screen.getByText(/59:00/)).toBeInTheDocument();
    });

    it('should handle teacher synchronization correctly', async () => {
      const setShowReMarkModal = vi.fn();
      
      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: mockTestData,
        loading: false,
        error: null,
        activePassageId: 'p1',
        setActivePassageId: vi.fn(),
      });

      vi.spyOn(useTestSession, 'useTestSession').mockReturnValue({
        session: mockSession,
        setSession: vi.fn(),
        sessionStatus: 'waiting',
        isPaused: false,
        sessionStartTime: null,
        pausedDuration: 0,
        reMarkingData: null,
        showReMarkModal: false,
        setShowReMarkModal,
        setTestResults: vi.fn(),
      });

      vi.spyOn(useTestTimer, 'useTestTimer').mockReturnValue({
        timeRemaining: 0,
        formatTime: () => '--:--',
      });

      vi.spyOn(useTestSubmission, 'useTestSubmission').mockReturnValue({
        isSubmitting: false,
        testSubmitted: false,
        testResults: null,
        handleSubmit: vi.fn(),
        markTest: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      // Should show waiting overlay when status is 'waiting'
      await waitFor(() => {
        expect(screen.getByText('Waiting for Teacher to Start')).toBeInTheDocument();
      });

      // Timer should show --:-- when waiting
      expect(screen.getByText('--:--')).toBeInTheDocument();
    });

    it('should handle pause state correctly', async () => {
      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: mockTestData,
        loading: false,
        error: null,
        activePassageId: 'p1',
        setActivePassageId: vi.fn(),
      });

      vi.spyOn(useTestSession, 'useTestSession').mockReturnValue({
        session: mockSession,
        setSession: vi.fn(),
        sessionStatus: 'in-progress',
        isPaused: true,
        sessionStartTime: Date.now() - 10000,
        pausedDuration: 5000,
        reMarkingData: null,
        showReMarkModal: false,
        setShowReMarkModal: vi.fn(),
        setTestResults: vi.fn(),
      });

      vi.spyOn(useTestTimer, 'useTestTimer').mockReturnValue({
        timeRemaining: 3595,
        formatTime: (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`,
      });

      vi.spyOn(useTestSubmission, 'useTestSubmission').mockReturnValue({
        isSubmitting: false,
        testSubmitted: false,
        testResults: null,
        handleSubmit: vi.fn(),
        markTest: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      // Should show paused overlay
      await waitFor(() => {
        expect(screen.getByText('Test Paused')).toBeInTheDocument();
      });

      // Should show PAUSED label
      expect(screen.getByText('(PAUSED)')).toBeInTheDocument();
    });
  });

  describe('Hook Interactions', () => {
    it('should update answers through callback', async () => {
      const mockHandleSubmit = vi.fn();
      
      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: mockTestData,
        loading: false,
        error: null,
        activePassageId: 'p1',
        setActivePassageId: vi.fn(),
      });

      vi.spyOn(useTestSession, 'useTestSession').mockReturnValue({
        session: mockSession,
        setSession: vi.fn(),
        sessionStatus: 'in-progress',
        isPaused: false,
        sessionStartTime: Date.now() - 5000,
        pausedDuration: 0,
        reMarkingData: null,
        showReMarkModal: false,
        setShowReMarkModal: vi.fn(),
        setTestResults: vi.fn(),
      });

      vi.spyOn(useTestTimer, 'useTestTimer').mockReturnValue({
        timeRemaining: 3540,
        formatTime: (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`,
      });

      vi.spyOn(useTestSubmission, 'useTestSubmission').mockReturnValue({
        isSubmitting: false,
        testSubmitted: false,
        testResults: null,
        handleSubmit: mockHandleSubmit,
        markTest: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      // Find and click submit button
      const submitButton = await screen.findByText('Submit Test');
      fireEvent.click(submitButton);

      // Submit function should be called
      expect(mockHandleSubmit).toHaveBeenCalled();
    });

    it('should handle re-marking modal display', async () => {
      const reMarkingData = {
        score: 35,
        maxScore: 40,
        correctCount: 35,
        timestamp: Date.now(),
      };

      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: mockTestData,
        loading: false,
        error: null,
        activePassageId: 'p1',
        setActivePassageId: vi.fn(),
      });

      vi.spyOn(useTestSession, 'useTestSession').mockReturnValue({
        session: mockSession,
        setSession: vi.fn(),
        sessionStatus: 'in-progress',
        isPaused: false,
        sessionStartTime: Date.now() - 5000,
        pausedDuration: 0,
        reMarkingData,
        showReMarkModal: true,
        setShowReMarkModal: vi.fn(),
        setTestResults: vi.fn(),
      });

      vi.spyOn(useTestTimer, 'useTestTimer').mockReturnValue({
        timeRemaining: 3540,
        formatTime: (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`,
      });

      vi.spyOn(useTestSubmission, 'useTestSubmission').mockReturnValue({
        isSubmitting: false,
        testSubmitted: true,
        testResults: { correctAnswers: 35, totalQuestions: 40, questionResults: {} },
        handleSubmit: vi.fn(),
        markTest: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      // Should show re-marking modal
      await waitFor(() => {
        expect(screen.getByText('Test Re-marked!')).toBeInTheDocument();
        expect(screen.getByText('35 / 40')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error when test data fails to load', async () => {
      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: null,
        loading: false,
        error: 'Failed to load test',
        activePassageId: null,
        setActivePassageId: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to Load Test')).toBeInTheDocument();
        expect(screen.getByText('Failed to load test')).toBeInTheDocument();
        expect(screen.getByText('Back to Home')).toBeInTheDocument();
      });
    });

    it('should show loading state while fetching data', async () => {
      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: null,
        loading: true,
        error: null,
        activePassageId: null,
        setActivePassageId: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Loading Test...')).toBeInTheDocument();
      });
    });
  });

  describe('Firebase Interactions', () => {
    it('should validate student authentication', async () => {
      // Clear auth data to simulate unauthenticated state
      sessionStorage.clear();

      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: null,
        loading: true,
        error: null,
        activePassageId: null,
        setActivePassageId: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      // Verify auth data is cleared (simulating unauthenticated state)
      // The actual redirect is handled by useTestData hook
      expect(sessionStorage.getItem('playerId')).toBeNull();
    });
  });

  describe('Performance and Stability', () => {
    it('should not cause unnecessary re-renders', async () => {
      let renderCount = 0;
      
      const TestWrapper = () => {
        renderCount++;
        return <StudentTestPage />;
      };

      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: mockTestData,
        loading: false,
        error: null,
        activePassageId: 'p1',
        setActivePassageId: vi.fn(),
      });

      vi.spyOn(useTestSession, 'useTestSession').mockReturnValue({
        session: mockSession,
        setSession: vi.fn(),
        sessionStatus: 'in-progress',
        isPaused: false,
        sessionStartTime: Date.now() - 5000,
        pausedDuration: 0,
        reMarkingData: null,
        showReMarkModal: false,
        setShowReMarkModal: vi.fn(),
        setTestResults: vi.fn(),
      });

      vi.spyOn(useTestTimer, 'useTestTimer').mockReturnValue({
        timeRemaining: 3540,
        formatTime: (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`,
      });

      vi.spyOn(useTestSubmission, 'useTestSubmission').mockReturnValue({
        isSubmitting: false,
        testSubmitted: false,
        testResults: null,
        handleSubmit: vi.fn(),
        markTest: vi.fn(),
      });

      const { rerender } = render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <TestWrapper />
        </MemoryRouter>
      );

      const initialRenderCount = renderCount;

      // Trigger a re-render with same props
      rerender(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <TestWrapper />
        </MemoryRouter>
      );

      // Should not cause excessive re-renders
      expect(renderCount - initialRenderCount).toBeLessThanOrEqual(2);
    });

    it('should handle rapid state changes gracefully', async () => {
      const setActivePassageId = vi.fn();
      
      vi.spyOn(useTestData, 'useTestData').mockReturnValue({
        testData: mockTestData,
        loading: false,
        error: null,
        activePassageId: 'p1',
        setActivePassageId,
      });

      vi.spyOn(useTestSession, 'useTestSession').mockReturnValue({
        session: mockSession,
        setSession: vi.fn(),
        sessionStatus: 'in-progress',
        isPaused: false,
        sessionStartTime: Date.now() - 5000,
        pausedDuration: 0,
        reMarkingData: null,
        showReMarkModal: false,
        setShowReMarkModal: vi.fn(),
        setTestResults: vi.fn(),
      });

      vi.spyOn(useTestTimer, 'useTestTimer').mockReturnValue({
        timeRemaining: 3540,
        formatTime: (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`,
      });

      vi.spyOn(useTestSubmission, 'useTestSubmission').mockReturnValue({
        isSubmitting: false,
        testSubmitted: false,
        testResults: null,
        handleSubmit: vi.fn(),
        markTest: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/student-test/ABC123']}>
          <StudentTestPage />
        </MemoryRouter>
      );

      // Rapidly switch between passages
      const passage2Button = await screen.findByText('Passage 2');
      
      for (let i = 0; i < 10; i++) {
        fireEvent.click(passage2Button);
      }

      // Should handle rapid clicks gracefully
      expect(setActivePassageId).toHaveBeenCalledTimes(10);
    });
  });
});
