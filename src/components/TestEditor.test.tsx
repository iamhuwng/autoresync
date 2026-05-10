import '@testing-library/jest-dom';

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(() => ({
    user: { uid: 'owner-1' },
    isAdmin: false,
  })),
}));

vi.mock('@mantine/core', () => ({
  Modal: ({ opened, children }: any) => (opened ? <div>{children}</div> : null),
}));

vi.mock('./QuestionEditorPanel', () => ({
  default: () => <div data-testid="flat-question-editor">Flat Question Editor</div>,
}));

vi.mock('./test/editor/layouts/ReadingEditorLayout', () => ({
  ReadingEditorLayout: ({ questionList, questionEditor }: any) => (
    <div>
      <div>{questionList}</div>
      <div>{questionEditor}</div>
    </div>
  ),
}));

vi.mock('./test/editor/layouts/ListeningEditorLayout', () => ({
  ListeningEditorLayout: ({ questionList, questionEditor }: any) => (
    <div>
      <div>{questionList}</div>
      <div>{questionEditor}</div>
    </div>
  ),
}));

vi.mock('./test/editor/QuestionList', () => ({
  QuestionList: ({ questions, onQuestionSelect }: any) => (
    <div>
      {questions.map((question: any, index: number) => (
        <button
          key={question.number}
          type="button"
          onClick={() => onQuestionSelect(index)}
        >
          Select question {index + 1}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./test/editor/ResourceManager', () => ({
  ResourceManager: () => <div>Resource Manager</div>,
}));

vi.mock('./SingleQuestionCreator', () => ({ default: () => <div /> }));
vi.mock('./BulkQuestionCreator', () => ({ default: () => <div /> }));
vi.mock('./AnswerKeyPanel', () => ({ default: () => <div /> }));
vi.mock('./MassAnswerImportPanel', () => ({ default: () => <div /> }));
vi.mock('./PracticeSettingsModal', () => ({
  PracticeSettingsModal: () => <div />,
}));
vi.mock('./modern', () => ({
  Button: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
}));
vi.mock('../services/r2Storage', () => ({
  default: {
    isTempFile: () => false,
  },
}));
vi.mock('../services/homeworkManager', () => ({
  propagateTestMetadataToHomework: vi.fn(),
}));
vi.mock('../services/firebase', () => ({
  database: {},
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: mockUseAuth,
}));
vi.mock('./modern/ToastNotification', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import TestEditor from './TestEditor';

const TEST_FIXTURE = {
  id: 'test-1',
  title: 'IELTS Reading',
  type: 'IELTS',
  skill: 'Reading',
  duration: 60,
  difficulty: 'Intermediate',
  questionCount: 2,
  createdAt: 1,
  createdBy: 'owner-1',
  updatedAt: 1,
  isPublished: true,
  ownerId: 'owner-1',
  isPublic: false,
  isComplete: true,
  metadata: {
    description: '',
    instructions: '',
    tags: [],
  },
  passages: [
    {
      id: 'p1',
      title: 'Passage 1',
      content: 'Passage text',
      type: 'text',
      wordCount: 10,
      questionStart: 1,
      questionEnd: 2,
      createdAt: 1,
    },
  ],
  questions: [
    {
      number: 1,
      type: 'table-completion',
      question: 'legacy fallback one',
      answer: '',
      passageId: 'p1',
      points: 1,
      groupId: 'group-table-1',
      blankId: 'blank-1',
      anchorId: 'anchor-1',
      groupTaskType: 'table-completion',
    },
    {
      number: 2,
      type: 'multiple-choice',
      question: 'Regular editable question',
      answer: 'A',
      passageId: 'p1',
      points: 1,
    },
  ],
  settings: {
    allowPause: false,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'immediate',
    allowReview: true,
    passingScore: 60,
  },
  statistics: {
    attempts: 0,
    averageScore: 0,
    averageTime: 0,
    completionRate: 0,
  },
  questionGroups: [
    {
      schemaVersion: 1,
      groupId: 'group-table-1',
      taskType: 'table-completion',
      passageId: 'p1',
      questionRange: { start: 1, end: 1 },
      sharedContent: {
        instructionText: 'Questions 1-1',
        answerRuleText: 'Choose ONE WORD ONLY.',
        constraints: { maxWords: 1 },
      },
      columns: [],
      rows: [],
      cells: [],
      blanks: [],
      provenance: {
        sourceWorkflow: 'in-app-parse',
        sourceShape: 'markdown-table',
        rawExcerpt: 'raw',
        normalizationVersion: 1,
        confidence: 0.95,
        warnings: [],
        canonicalRevisionHash: 'hash-1',
      },
      canonicalReadingOrder: [],
    },
  ],
};

describe('TestEditor', () => {
  beforeEach(() => {
    mockUseAuth.mockClear();
  });

  it('blocks Reading V2 payloads before legacy editor hooks run', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <TestEditor
        test={{ ...TEST_FIXTURE, deliveryEngine: 'reading-v2' } as any}
        show
        handleClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Select question 1' })).not.toBeInTheDocument();
    expect(mockUseAuth).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[TestEditor] Blocked Reading V2 payload from entering legacy editor.',
    );

    warnSpy.mockRestore();
  });

  it('shows a read-only canonical table notice instead of the flat editor for published groups', () => {
    render(
      <TestEditor
        test={TEST_FIXTURE as any}
        show
        handleClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select question 1' }));

    expect(screen.getByText('Canonical Table Group')).toBeInTheDocument();
    expect(
      screen.getByText(/read-only after publish in Phase 1/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('flat-question-editor')).not.toBeInTheDocument();
  });
});
