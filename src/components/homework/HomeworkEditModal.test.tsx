import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookHomeworkAssignment, HomeworkAssignment } from '../../types/homework.types';
import { clearSubsumedOverrides, updateHomework } from '../../services/homeworkManager';
import { toast } from '../modern/ToastNotification';
import { HomeworkEditModal } from './HomeworkEditModal';

vi.mock('../../hooks/useHomeworkTags', () => ({
  useHomeworkTags: () => ({ tags: [] }),
}));
vi.mock('../../services/homeworkManager', () => ({
  updateHomework: vi.fn(),
  clearSubsumedOverrides: vi.fn(),
}));
vi.mock('../modern/ToastNotification', () => ({
  toast: {
    warning: vi.fn(),
  },
}));

const bookHomework: BookHomeworkAssignment = {
  id: 'homework-book-1',
  createdBy: 'teacher-1',
  createdAt: 1,
  updatedAt: 1,
  materialId: 'book-1',
  materialTitle: 'Book 1',
  materialType: 'test',
  materialSkill: 'reading',
  target: { type: 'students', studentIds: ['student-1'] },
  scheduling: { dueDate: Date.parse('2026-08-30T00:00:00.000Z') },
  config: {
    timerMinutes: null,
    maxAttempts: null,
    feedbackTiming: 'after_completion',
    lateSubmissionAllowed: false,
  },
  visibility: {
    showTimer: true,
    showAttempts: true,
    showPoints: true,
    showCorrectAnswers: 'after_submission',
  },
  status: 'active',
  stats: { totalAssigned: 1, started: 0, submitted: 0, graded: 0, averageScore: null },
  assignmentKind: 'book_activity_bundle',
  bookManifest: {
    schemaVersion: 1,
    assignmentKind: 'book_activity_bundle',
    manifestVersionId: 'manifest-1',
    ownerId: 'teacher-1',
    createdByCommandId: 'command-1',
    createdAt: '2026-07-28T00:00:00.000Z',
    bindingRevision: 1,
    book: {
      bookId: 'book-1',
      bookMode: 'pdf',
      bookRevision: 1,
      publicationId: 'publication-1',
      publicationRevision: 1,
      publicationStatus: 'published',
    },
    context: {
      contextId: 'homework-book-1',
      recipientId: 'student-1',
      kind: 'homework',
      entitlementBasis: 'assignment',
    },
    selectedTarget: { kind: 'book', bookId: 'book-1' },
    outline: [],
    scheduleRules: [],
    bindings: [],
    completion: {
      aggregation: 'required-activities-submitted-over-required-activities',
      requiredBindingCount: 0,
      excludedBindingCount: 0,
      legacyScoreFields: 'untouched',
    },
  },
};

const legacyHomework: HomeworkAssignment = {
  id: 'homework-legacy-1',
  createdBy: 'teacher-1',
  createdAt: 1,
  updatedAt: 1,
  materialId: 'test-1',
  materialTitle: 'Legacy test',
  materialType: 'test',
  materialSkill: 'reading',
  target: { type: 'students', studentIds: ['student-1'] },
  scheduling: { dueDate: Date.parse('2026-08-30T00:00:00.000Z') },
  config: {
    timerMinutes: null,
    maxAttempts: null,
    feedbackTiming: 'after_completion',
    lateSubmissionAllowed: false,
  },
  visibility: {
    showTimer: true,
    showAttempts: true,
    showPoints: true,
    showCorrectAnswers: 'after_submission',
  },
  status: 'active',
  stats: { totalAssigned: 1, started: 0, submitted: 0, graded: 0, averageScore: null },
};

describe('HomeworkEditModal Book boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed instead of sending a partial Book schedule through the legacy writer', () => {
    render(
      <HomeworkEditModal
        isOpen
        homework={bookHomework}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/protected updates remain disabled until 33D/i);
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByText(/trusted 33D command/i)).toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/trusted 33D command/i));
    expect(updateHomework).not.toHaveBeenCalled();
    expect(clearSubsumedOverrides).not.toHaveBeenCalled();
  });

  it('preserves the existing one-level legacy Homework update path', async () => {
    render(
      <HomeworkEditModal
        isOpen
        homework={legacyHomework}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateHomework).toHaveBeenCalledWith(
      'homework-legacy-1',
      expect.objectContaining({
        scheduling: expect.objectContaining({
          dueDate: legacyHomework.scheduling.dueDate,
        }),
      }),
    ));
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
