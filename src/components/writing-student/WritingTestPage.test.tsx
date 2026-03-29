import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingTestPage from './WritingTestPage';

const {
  mockNavigate,
  onValueMock,
  mockAutoSubmitFromRTDB,
  mockTrackAction,
  mockUseActiveTimeTracking,
  mockUseWritingAutoSave,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  onValueMock: vi.fn(),
  mockAutoSubmitFromRTDB: vi.fn(),
  mockTrackAction: vi.fn(),
  mockUseActiveTimeTracking: vi.fn(),
  mockUseWritingAutoSave: vi.fn(),
}));

const listenerRegistry = new Map<string, Array<(snap: { exists: () => boolean; val: () => any }) => void>>();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('firebase/database', () => ({
  ref: vi.fn((_: unknown, path?: string) => path ?? '__root__'),
  onValue: (...args: unknown[]) => onValueMock(...args),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'student-1',
      displayName: 'Student One',
      email: 'student@example.com',
    },
  }),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: mockTrackAction,
  }),
}));

vi.mock('../../hooks/useActiveTimeTracking', () => ({
  useActiveTimeTracking: (...args: unknown[]) => mockUseActiveTimeTracking(...args),
}));

vi.mock('../../hooks/useWritingAutoSave', () => ({
  useWritingAutoSave: (...args: unknown[]) => mockUseWritingAutoSave(...args),
}));

vi.mock('../../services/writingSubmissionService', () => ({
  autoSubmitFromRTDB: (...args: unknown[]) => mockAutoSubmitFromRTDB(...args),
}));

vi.mock('./WritingPromptPanel', () => ({
  default: () => <div data-testid="writing-prompt" />,
}));

vi.mock('./WritingEditor', () => ({
  default: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (text: string) => void;
    disabled?: boolean;
  }) => (
    <textarea
      data-testid="writing-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    />
  ),
}));

function emitSnapshot(path: string, data: Record<string, unknown>) {
  const listeners = listenerRegistry.get(path) || [];
  act(() => {
    listeners.forEach((listener) => {
      listener({
        exists: () => true,
        val: () => data,
      });
    });
  });
}

describe('WritingTestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenerRegistry.clear();

    onValueMock.mockImplementation((path: string, success: (snap: { exists: () => boolean; val: () => any }) => void) => {
      const listeners = listenerRegistry.get(path) || [];
      listenerRegistry.set(path, [...listeners, success]);
      return vi.fn();
    });

    mockAutoSubmitFromRTDB.mockResolvedValue(undefined);
    mockUseActiveTimeTracking.mockReturnValue({
      onKeystroke: vi.fn(),
      switchTask: vi.fn(),
    });
    mockUseWritingAutoSave.mockReturnValue({
      saveTask: vi.fn(),
      saveActiveTab: vi.fn(),
      addTabSwitch: vi.fn(),
      loadSavedState: vi.fn().mockResolvedValue(null),
      flushPendingSave: vi.fn(),
    });
  });

  const testData = {
    id: 'test-1',
    metadata: {
      title: 'IELTS Writing Test',
      format: 'task1-only',
      duration: 60,
    },
    tasks: [
      {
        taskNumber: 1,
        taskType: 'task-1',
        promptText: 'Write about the chart.',
        wordMinimum: 150,
      },
    ],
  } as any;

  it('routes manual submit to submission-complete instead of the waiting-room results modal', async () => {
    render(<WritingTestPage testData={testData} sessionCode="SESSION-1" />);

    fireEvent.change(screen.getByTestId('writing-editor'), {
      target: { value: 'This is my essay.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /submit test/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(mockAutoSubmitFromRTDB).toHaveBeenCalledWith(
        'SESSION-1',
        'student-1',
        'Student One',
        testData,
      );
    });

    expect(mockTrackAction).toHaveBeenCalledWith(
      'finishTest',
      expect.objectContaining({
        testSkill: 'Writing',
        submissionSource: 'manual',
        outcome: 'submitted',
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/submission-complete', {
      replace: true,
      state: {
        sessionCode: 'SESSION-1',
        testId: 'test-1',
        studentName: 'Student One',
      },
    });
  });

  it('routes teacher-ended auto-submit to submission-complete', async () => {
    render(<WritingTestPage testData={testData} sessionCode="SESSION-1" />);

    emitSnapshot('game_sessions/SESSION-1', {
      status: 'in-progress',
      isPaused: true,
      startTime: Date.now(),
    });
    emitSnapshot('game_sessions/SESSION-1', {
      status: 'waiting',
      isPaused: false,
    });

    await waitFor(() => {
      expect(mockAutoSubmitFromRTDB).toHaveBeenCalledTimes(1);
    });

    expect(mockTrackAction).toHaveBeenCalledWith(
      'finishTest',
      expect.objectContaining({
        submissionSource: 'teacher-ended',
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/submission-complete', {
      replace: true,
      state: {
        sessionCode: 'SESSION-1',
        testId: 'test-1',
        studentName: 'Student One',
      },
    });
  });
});
