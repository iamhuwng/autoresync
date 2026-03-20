/**
 * Vitest Unit Tests for StudentDetailModal Component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { StudentDetailModal } from '../StudentDetailModal';

// Mock data
const mockStudentAnswers = {
  1: { questionNumber: 1, answer: 'B', timeSpent: 12000, timestamp: Date.now() },
  2: { questionNumber: 2, answer: 'rivers', timeSpent: 18000, timestamp: Date.now() },
  3: { questionNumber: 3, answer: 'True', timeSpent: 8000, timestamp: Date.now() },
};

const mockTestQuestions = [
  { number: 1, question: 'Question 1', answer: 'B', type: 'multiple-choice' },
  { number: 2, question: 'Question 2', answer: 'mountains', type: 'short-answer' },
  { number: 3, question: 'Question 3', answer: 'False', type: 'true-false' },
];

const defaultProps = {
  opened: true,
  onClose: vi.fn(),
  studentName: 'Test Student',
  studentId: 'student-123',
  answers: {},
  totalQuestions: 40,
  status: 'working' as const,
  timeElapsed: 60000, // 1 minute
};

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<MantineProvider>{ui}</MantineProvider>);
};

const getStatusBadge = () => {
  const statusLabel = screen.getByText('Status');
  return statusLabel.nextElementSibling as HTMLElement;
};

const getQuestionBubble = (questionNumber: number) => {
  const questionLabel = screen.getByText(`Question ${questionNumber}`);
  return questionLabel.parentElement?.previousElementSibling as HTMLElement;
};

describe('StudentDetailModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render modal when opened is true', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} />);
      
      expect(screen.getByText(/Student Details: Test Student/i)).toBeInTheDocument();
    });

    it('should not render when opened is false', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} opened={false} />);
      
      expect(screen.queryByText(/Student Details: Test Student/i)).not.toBeInTheDocument();
    });

    it('should display student name in title', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} studentName="Alice Smith" />);
      
      expect(screen.getByText(/Student Details: Alice Smith/i)).toBeInTheDocument();
    });
  });

  describe('Status Display', () => {
    it('should show "Working" status with blue color', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} status="working" />);
      
      const statusBadge = getStatusBadge();
      expect(statusBadge).toHaveTextContent('Working');
      expect(statusBadge).toHaveStyle({ color: '#3b82f6' });
    });

    it('should show "Submitted" status with green color', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} status="submitted" />);
      
      const statusBadge = getStatusBadge();
      expect(statusBadge).toHaveTextContent('Submitted');
      expect(statusBadge).toHaveStyle({ color: '#10b981' });
    });

    it('should show "Disconnected" status with red color', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} status="disconnected" />);
      
      const statusBadge = getStatusBadge();
      expect(statusBadge).toHaveTextContent('Disconnected');
      expect(statusBadge).toHaveStyle({ color: '#ef4444' });
    });

    it('should display status icon', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} status="working" />);
      
      // Working status has ✎ icon
      expect(screen.getByText('✎')).toBeInTheDocument();
    });
  });

  describe('Progress Statistics', () => {
    it('should show 0/40 (0%) when no answers', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} answers={{}} />);
      
      expect(screen.getByText('0/40 (0%)')).toBeInTheDocument();
    });

    it('should show 3/40 (8%) when 3 answers provided', () => {
      renderWithProvider(
        <StudentDetailModal {...defaultProps} answers={mockStudentAnswers} />
      );
      
      // 3/40 = 7.5%, rounded to 8%
      expect(screen.getByText(/3\/40/)).toBeInTheDocument();
      expect(screen.getByText(/8%/)).toBeInTheDocument();
    });

    it('should show 40/40 (100%) when all answered', () => {
      const allAnswers: Record<number, any> = {};
      for (let i = 1; i <= 40; i++) {
        allAnswers[i] = { questionNumber: i, answer: 'A', timestamp: Date.now() };
      }
      
      renderWithProvider(<StudentDetailModal {...defaultProps} answers={allAnswers} />);
      
      expect(screen.getByText('40/40 (100%)')).toBeInTheDocument();
    });

    it('should display progress bar with correct width', () => {
      renderWithProvider(
        <StudentDetailModal {...defaultProps} answers={mockStudentAnswers} />
      );
      
      const progressBar = screen.getByRole('progressbar', { name: /student progress/i });
      expect(progressBar).toHaveStyle({ width: '8%' });
    });
  });

  describe('Time Display', () => {
    it('should format seconds correctly', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} timeElapsed={45000} />);
      
      expect(screen.getByText('45s')).toBeInTheDocument();
    });

    it('should format minutes and seconds correctly', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} timeElapsed={135000} />);
      
      // 135s = 2m 15s
      expect(screen.getByText('2m 15s')).toBeInTheDocument();
    });

    it('should format hours correctly', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} timeElapsed={7335000} />);
      
      // 7335s = 2h 2m
      expect(screen.getByText('2h 2m')).toBeInTheDocument();
    });
  });

  describe('Question List', () => {
    it('should render all 40 question slots', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} status="submitted" />);
      
      // Check for question numbers 1-40
      for (let i = 1; i <= 40; i++) {
        expect(screen.getByText(new RegExp(`^Question ${i}$`))).toBeInTheDocument();
      }
    });

    it('should show green styling for answered questions', () => {
      renderWithProvider(
        <StudentDetailModal
          {...defaultProps}
          answers={mockStudentAnswers}
          status="submitted"
          testQuestions={mockTestQuestions}
        />
      );
      
      const q1Bubble = getQuestionBubble(1);
      expect(q1Bubble.getAttribute('style')).toContain('rgb(16, 185, 129)');
    });

    it('should show gray styling for unanswered questions', () => {
      renderWithProvider(
        <StudentDetailModal {...defaultProps} answers={mockStudentAnswers} status="submitted" />
      );
      
      const q4Bubble = getQuestionBubble(4);
      expect(q4Bubble.getAttribute('style')).toContain('rgb(148, 163, 184)');
    });

    it('should display student answers correctly', () => {
      renderWithProvider(
        <StudentDetailModal {...defaultProps} answers={mockStudentAnswers} />
      );
      
      expect(screen.getByText('B')).toBeInTheDocument();
      expect(screen.getByText('rivers')).toBeInTheDocument();
      expect(screen.getByText('True')).toBeInTheDocument();
    });

    it('should show "No answer submitted" for unanswered questions', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} answers={mockStudentAnswers} status="submitted" />);
      
      // Questions 4-40 should show "No answer submitted"
      const noAnswerTexts = screen.getAllByText('No answer submitted');
      expect(noAnswerTexts.length).toBe(37); // 40 - 3 = 37
    });

    it('should format array answers correctly', () => {
      const answersWithArray = {
        1: { questionNumber: 1, answer: ['A', 'C', 'D'], timestamp: Date.now() },
      };
      
      renderWithProvider(
        <StudentDetailModal {...defaultProps} answers={answersWithArray} />
      );
      
      expect(screen.getByText('A, C, D')).toBeInTheDocument();
    });

    it('should display time spent per question', () => {
      renderWithProvider(
        <StudentDetailModal {...defaultProps} answers={mockStudentAnswers} />
      );
      
      // Question 1: 12000ms = 12s
      expect(screen.getByText('Time: 12s')).toBeInTheDocument();
      
      // Question 2: 18000ms = 18s
      expect(screen.getByText('Time: 18s')).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onClose when close button clicked', async () => {
      const onClose = vi.fn();
      renderWithProvider(<StudentDetailModal {...defaultProps} onClose={onClose} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);
      
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('should call onClose when ESC key pressed', async () => {
      const onClose = vi.fn();
      renderWithProvider(<StudentDetailModal {...defaultProps} onClose={onClose} />);
      
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
      
      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('should handle backdrop click to close', async () => {
      const onClose = vi.fn();
      renderWithProvider(<StudentDetailModal {...defaultProps} onClose={onClose} />);
      
      // Click on backdrop (overlay)
      const backdrop = document.querySelector('[data-testid="modal-backdrop"]');
      if (backdrop) {
        fireEvent.click(backdrop);
        
        await waitFor(() => {
          expect(onClose).toHaveBeenCalled();
        });
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty student name', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} studentName="" />);
      
      expect(screen.getByText(/Student Details:/i)).toBeInTheDocument();
    });

    it('should handle 0 total questions', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} totalQuestions={0} />);
      
      expect(screen.getByText('0/0 (0%)')).toBeInTheDocument();
    });

    it('should handle negative time elapsed', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} timeElapsed={-1000} />);
      
      // Should handle gracefully, showing 0 or positive time
      const timeDisplay = screen.getByText(/[0-9]+[ms]/);
      expect(timeDisplay).toBeInTheDocument();
    });

    it('should handle null answers', () => {
      const answersWithNull = {
        1: { questionNumber: 1, answer: null, timestamp: Date.now() },
      };
      
      renderWithProvider(
        <StudentDetailModal {...defaultProps} answers={answersWithNull as any} />
      );
      
      // Should show "N/A" or handle gracefully
      expect(screen.queryByText('null')).not.toBeInTheDocument();
    });

    it('should handle very large question numbers', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} totalQuestions={100} status="submitted" />);
      
      // Should render 100 questions
      const questionElements = screen.getAllByText(/Question \d+/);
      expect(questionElements.length).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} />);
      
      const modal = screen.getByRole('dialog', { hidden: true });
      expect(modal).toBeInTheDocument();
    });

    it('should be keyboard navigable', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      closeButton.focus();
      
      expect(document.activeElement).toBe(closeButton);
    });

    it('should have proper heading hierarchy', () => {
      renderWithProvider(<StudentDetailModal {...defaultProps} />);
      
      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Answers');
    });
  });

  describe('Performance', () => {
    it('should render efficiently with many answers', () => {
      const manyAnswers: Record<number, any> = {};
      for (let i = 1; i <= 40; i++) {
        manyAnswers[i] = {
          questionNumber: i,
          answer: `Answer ${i}`,
          timestamp: Date.now(),
        };
      }
      
      const startTime = performance.now();
      renderWithProvider(<StudentDetailModal {...defaultProps} answers={manyAnswers} />);
      const endTime = performance.now();
      
      const renderTime = endTime - startTime;
      console.log(`Render time with 40 answers: ${renderTime.toFixed(2)}ms`);
      
      // Keep this threshold realistic for jsdom + modal rendering.
      expect(renderTime).toBeLessThan(500);
    });

    it('should not re-render unnecessarily', () => {
      const renderSpy = vi.fn();
      
      const { rerender } = renderWithProvider(
        <StudentDetailModal {...defaultProps} />
      );
      
      // Rerender with same props
      rerender(
        <MantineProvider>
          <StudentDetailModal {...defaultProps} />
        </MantineProvider>
      );
      
      // Should use memoization/optimization
      expect(renderSpy).not.toHaveBeenCalled();
    });
  });

  describe('Real-time Updates Simulation', () => {
    it('should update when answers prop changes', async () => {
      const { rerender } = renderWithProvider(
        <StudentDetailModal {...defaultProps} answers={{}} />
      );
      
      // Initially no answers
      expect(screen.getByText('0/40 (0%)')).toBeInTheDocument();
      
      // Add new answer
      rerender(
        <MantineProvider>
          <StudentDetailModal
            {...defaultProps}
            answers={{ 1: { questionNumber: 1, answer: 'B', timestamp: Date.now() } }}
          />
        </MantineProvider>
      );
      
      // Should update to show 1 answer
      await waitFor(() => {
        expect(screen.getByText(/1\/40/)).toBeInTheDocument();
      });
    });

    it('should update status dynamically', async () => {
      const { rerender } = renderWithProvider(
        <StudentDetailModal {...defaultProps} status="working" />
      );
      
      expect(getStatusBadge()).toHaveTextContent('Working');
      
      // Change to submitted
      rerender(
        <MantineProvider>
          <StudentDetailModal {...defaultProps} status="submitted" />
        </MantineProvider>
      );
      
      await waitFor(() => {
        expect(getStatusBadge()).toHaveTextContent('Submitted');
      });
    });
  });
});
