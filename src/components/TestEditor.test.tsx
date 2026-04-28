import '@testing-library/jest-dom';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToastWarning, mockUseAuth } = vi.hoisted(() => ({
  mockToastWarning: vi.fn(),
  mockUseAuth: vi.fn(() => ({
    user: { uid: 'owner-1' },
    isAdmin: false,
  })),
}));

vi.mock('@mantine/core', () => ({
  Modal: ({ opened, children }: any) => (opened ? <div>{children}</div> : null),
}));

vi.mock('./test/editor/layouts/ListeningEditorLayout', () => ({
  ListeningEditorLayout: ({ title, onTitleChange, questionList, resourceManager }: any) => (
    <div>
      <h1>{title}</h1>
      <button type="button" onClick={() => onTitleChange('Renamed Listening Test')}>
        Rename test
      </button>
      <div>{questionList}</div>
      <div>{resourceManager}</div>
    </div>
  ),
}));

vi.mock('./test/editor/layouts/ReadingEditorLayout', () => ({
  ReadingEditorLayout: ({ title }: any) => <div>{title}</div>,
}));

vi.mock('./test/editor/QuestionList', () => ({
  QuestionList: () => <div>Question list</div>,
}));

vi.mock('./test/editor/ResourceManager', () => ({
  ResourceManager: () => <div>Resource manager</div>,
}));

vi.mock('./QuestionEditorPanel', () => ({ default: () => <div /> }));
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
    warning: mockToastWarning,
  },
}));

import TestEditor from './TestEditor';

const LISTENING_TEST = {
  id: 'listening-1',
  title: 'IELTS Listening',
  type: 'IELTS',
  skill: 'Listening',
  duration: 30,
  difficulty: 'Intermediate',
  questionCount: 2,
  createdAt: 1,
  createdBy: 'owner-1',
  updatedAt: 1,
  isPublished: true,
  ownerId: 'owner-1',
  isPublic: false,
  isComplete: true,
  displayMode: 'image',
  metadata: {
    description: '',
    instructions: '',
    tags: [],
  },
  passages: [],
  audioSections: [
    {
      number: 1,
      name: 'Section 1',
      audioUrl: 'https://example.com/audio.mp3',
      startQuestion: 1,
      endQuestion: 2,
    },
  ],
  questionImages: [
    {
      sectionNumber: 1,
      imageUrl: 'https://example.com/question-page.png',
      questionRange: { start: 1, end: 2 },
    },
  ],
  questions: [
    {
      number: 1,
      type: 'form-completion',
      question: '',
      answer: 'A',
      sectionNumber: 1,
      points: 1,
    },
    {
      number: 2,
      type: 'form-completion',
      question: '',
      answer: 'B',
      sectionNumber: 1,
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
};

describe('TestEditor draft storage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockToastWarning.mockClear();
    mockUseAuth.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not auto-save a full draft just from opening a fresh Listening editor', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });

    render(
      <TestEditor
        test={LISTENING_TEST as any}
        show
        handleClose={vi.fn()}
      />,
    );

    expect(screen.getByText('IELTS Listening')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Resource manager')).toBeInTheDocument());

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(mockToastWarning).not.toHaveBeenCalled();

    setItemSpy.mockRestore();
  });

  it('catches quota errors after a real edit and keeps the modal open', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <TestEditor
        test={LISTENING_TEST as any}
        show
        handleClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename test' }));

    await waitFor(() => {
      expect(mockToastWarning).toHaveBeenCalledWith(expect.stringContaining('Browser storage is full'));
    });
    expect(screen.getByText('Renamed Listening Test')).toBeInTheDocument();

    warnSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
