import '@testing-library/jest-dom';

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUseAuth, mockListeningSave, mockMove, mockUploadAudio, mockResourceManagerProps } = vi.hoisted(() => ({
  mockListeningSave: vi.fn(),
  mockMove: vi.fn(),
  mockUploadAudio: vi.fn(),
  mockResourceManagerProps: vi.fn(),
  mockUseAuth: vi.fn(() => ({
    user: { uid: 'owner-1' },
    isAdmin: false,
  })),
}));

vi.mock('@mantine/core', () => ({
  Modal: ({ opened, children }: any) => (opened ? <div>{children}</div> : null),
}));

vi.mock('./QuestionEditorPanel', () => ({
  default: ({ isImagePassage }: any) => <div data-testid="flat-question-editor">{isImagePassage ? 'Image question answer editor' : 'Flat Question Editor'}</div>,
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
  ListeningEditorLayout: ({ title, onTitleChange, onSave, onCancel, readOnly, isSaving, questionList, questionEditor, resourceManager }: any) => (
    <div>
      <span>{title}</span>
      <button onClick={() => onTitleChange('Edited Listening')} disabled={readOnly}>Change title</button>
      <button onClick={onSave} disabled={readOnly || isSaving}>Save Listening</button>
      <button onClick={onCancel}>Close Listening</button>
      <div>{questionList}</div>
      <div>{questionEditor}</div>
      <div>{resourceManager}</div>
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
  ResourceManager: (props: any) => {
    mockResourceManagerProps(props);
    return <button disabled={props.readOnly}
      onClick={() => props.uploadAudio(new File(['audio'], 'part.wav', { type: 'audio/wav' }), vi.fn())}>Upload Listening audio</button>;
  },
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
    moveMultipleToPermanent: mockMove,
    uploadListeningAuthoringAudio: vi.fn(),
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
vi.mock('../hooks/useFeatureTracking', () => ({ useFeatureTracking: () => ({ trackAction: vi.fn() }) }));
vi.mock('../features/assessment/listening/authoring/listeningTestEditing', () => ({
  createListeningTestEditSession: () => mockListeningSave,
  uploadListeningEditorAudio: mockUploadAudio,
  hasUnsupportedListeningStructure: (question: any) => Boolean(question?.items),
}));
vi.mock('./modern/ToastNotification', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

import TestEditor from './TestEditor';
import r2StorageService from '../services/r2Storage';
import { update } from 'firebase/database';
import { toast } from './modern/ToastNotification';

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
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAuth.mockReturnValue({ user: { uid: 'owner-1' }, isAdmin: false });
    mockListeningSave.mockResolvedValue({ status: 'published', versionId: 'version-2' });
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

  const listening = {
    ...TEST_FIXTURE, title: 'Native Listening', skill: 'Listening', versionId: 'version-1',
    passages: [], questionGroups: [], questions: [TEST_FIXTURE.questions[1]],
  };

  it('ignores old cached edits and saves Listening through its trusted port without direct writes or media moves', async () => {
    localStorage.setItem('test_edit_test-1', JSON.stringify({ title: 'Stale cached title', questions: { 0: { answer: 'stale' } }, resources: [] }));
    const close = vi.fn();
    render(<TestEditor test={listening as any} show handleClose={close} />);
    expect(screen.getByText('Native Listening')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change title' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Listening' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(mockListeningSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Edited Listening', questions: [expect.objectContaining({ answer: 'A' })] }));
    expect(update).not.toHaveBeenCalled();
    expect(mockMove).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('keeps the editor open and announces publication failure', async () => {
    mockListeningSave.mockRejectedValue(new Error('Saved draft; publication blocked.'));
    const close = vi.fn();
    render(<TestEditor test={listening as any} show handleClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Listening' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Saved draft; publication blocked.'));
    expect(close).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps Save disabled until every overlapping audio upload finishes', async () => {
    let finishFirst!: (value: any) => void;
    let finishSecond!: (value: any) => void;
    const first = new Promise(resolve => { finishFirst = resolve; });
    const second = new Promise(resolve => { finishSecond = resolve; });
    mockUploadAudio.mockReturnValueOnce(first).mockReturnValueOnce(second);
    render(<TestEditor test={listening as any} show handleClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload Listening audio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload Listening audio' }));
    expect(screen.getByRole('button', { name: 'Save Listening' })).toBeDisabled();
    const [, file, progress, upload] = mockUploadAudio.mock.calls[0];
    const input = { draftId: 'draft-1', sessionIdempotencyKey: 'session-key', assetIdempotencyKey: 'asset-key' };
    await upload(file, input, progress);
    expect(r2StorageService.uploadListeningAuthoringAudio).toHaveBeenCalledWith(file, input, progress);

    await act(async () => {
      finishFirst({ resource: { assetId: 'first' }, previewUrl: 'https://example.com/first' });
      await first;
    });
    expect(screen.getByRole('button', { name: 'Save Listening' })).toBeDisabled();
    await act(async () => {
      finishSecond({ resource: { assetId: 'second' }, previewUrl: 'https://example.com/second' });
      await second;
    });
    expect(screen.getByRole('button', { name: 'Save Listening' })).toBeEnabled();
  });

  it('blocks edits, replacement callbacks and closing until the captured save completes', async () => {
    let finishSave!: (value: any) => void;
    const pending = new Promise(resolve => { finishSave = resolve; });
    mockListeningSave.mockReturnValueOnce(pending);
    const close = vi.fn();
    render(<TestEditor test={listening as any} show handleClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Listening' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(dialog).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Upload Listening audio', hidden: true })).toBeDisabled();
    const upload = mockResourceManagerProps.mock.lastCall![0].uploadAudio;
    await expect(upload(new File(['audio'], 'part.wav', { type: 'audio/wav' }), vi.fn())).rejects.toThrow(/save to finish/);
    expect(mockUploadAudio).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close Listening', hidden: true }));
    fireEvent.mouseDown(dialog.parentElement!);
    expect(close).not.toHaveBeenCalled();
    await act(async () => {
      finishSave({ status: 'published', versionId: 'version-2' });
      await pending;
    });
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(dialog).not.toHaveAttribute('inert');
  });

  it('does not offer another owner’s Listening save through the super-admin UI bypass', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'another-admin' }, isAdmin: true });
    render(<TestEditor test={listening as any} show handleClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save Listening' })).toBeDisabled();
  });

  it('uses image-mode answer editing without pretending the image content is editable', () => {
    render(<TestEditor test={{ ...listening, displayMode: 'image' } as any} show handleClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select question 1' }));
    expect(screen.getByText('Image question answer editor')).toBeInTheDocument();
  });

  it('retains the existing question editor for supported text-mode questions', () => {
    render(<React.StrictMode><TestEditor test={{ ...listening, displayMode: 'text', listeningAudioPreviewWarnings: ['Section 1'],
      questions: [{ ...listening.questions[0], resourceId: 'image-1-0' }],
      questionImages: [{ sectionNumber: 1, imageUrl: 'https://images.example/diagram.png' }],
    } as any} show handleClose={vi.fn()} /></React.StrictMode>);
    fireEvent.click(screen.getByRole('button', { name: 'Select question 1' }));
    expect(screen.getByTestId('flat-question-editor')).toBeInTheDocument();
    expect(screen.queryByText('Image question answer editor')).not.toBeInTheDocument();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('You can replace the audio'));
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it('saves native form-context edits through every linked question', async () => {
    const contextLines = ['Name: [1]', 'Address: [2]'];
    const questions = [1, 2].map((number, index) => ({ ...listening.questions[0], number,
      type: 'completion', question: contextLines[index], answer: number === 1 ? 'Alice' : 'London',
      context: { sectionHeading: 'Booking', contextLines, currentLineIndex: index } }));
    render(<TestEditor test={{ ...listening, displayMode: 'text', questions } as any} show handleClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select question 1' }));
    fireEvent.change(screen.getByLabelText('Form heading'), { target: { value: 'Customer booking' } });
    fireEvent.change(screen.getByLabelText('Form context'), { target: { value: 'Full name: [1]\nAddress: [2]\nTelephone: 012345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Listening' }));
    await waitFor(() => expect(mockListeningSave).toHaveBeenCalled());
    expect(mockListeningSave.mock.lastCall![0].questions).toMatchObject([
      { question: 'Full name: [1]', answer: 'Alice', context: { sectionHeading: 'Customer booking', contextLines: ['Full name: [1]', 'Address: [2]', 'Telephone: 012345'] } },
      { question: 'Address: [2]', answer: 'London', context: { sectionHeading: 'Customer booking', contextLines: ['Full name: [1]', 'Address: [2]', 'Telephone: 012345'] } },
    ]);
  });
});
