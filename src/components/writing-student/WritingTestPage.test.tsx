import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingTestPage from './WritingTestPage';

const {
    mockNavigate,
    onValueMock,
    mockSet,
    mockAutoSubmitFromRTDB,
    mockTrackAction,
    mockUseActiveTimeTracking,
    mockUseWritingAutoSave,
    mockUseExternalPastePrevention,
    mockSetPasteAttemptCount,
    mockAttachToTextarea,
    mockToastError,
    mockToastInfo,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    onValueMock: vi.fn(),
    mockSet: vi.fn(),
    mockAutoSubmitFromRTDB: vi.fn(),
    mockTrackAction: vi.fn(),
    mockUseActiveTimeTracking: vi.fn(),
    mockUseWritingAutoSave: vi.fn(),
    mockUseExternalPastePrevention: vi.fn(),
    mockSetPasteAttemptCount: vi.fn(),
    mockAttachToTextarea: vi.fn(() => vi.fn()),
    mockToastError: vi.fn(),
    mockToastInfo: vi.fn(),
}));

const listenerRegistry = new Map<string, Array<(snap: { exists: () => boolean; val: () => any }) => void>>();

vi.mock('../modern/ToastNotification', () => ({
    toast: {
        error: (...args: unknown[]) => mockToastError(...args),
        info: (...args: unknown[]) => mockToastInfo(...args),
        warning: vi.fn(),
        success: vi.fn(),
    },
}));

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
    set: (...args: unknown[]) => mockSet(...args),
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

vi.mock('../../hooks/useExternalPastePrevention', () => ({
    useExternalPastePrevention: (...args: unknown[]) => mockUseExternalPastePrevention(...args),
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

function emitSnapshot(path: string, data: unknown) {
    const listeners = listenerRegistry.get(path) || [];
    act(() => {
        listeners.forEach((listener) => {
            listener({
                exists: () => data !== null && data !== undefined,
                val: () => data,
            });
        });
    });
}

describe('WritingTestPage', () => {
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

    beforeEach(() => {
        vi.clearAllMocks();
        listenerRegistry.clear();

        onValueMock.mockImplementation((path: string, success: (snap: { exists: () => boolean; val: () => any }) => void) => {
            const listeners = listenerRegistry.get(path) || [];
            listenerRegistry.set(path, [...listeners, success]);
            return vi.fn();
        });

        mockSet.mockResolvedValue(undefined);
        mockAutoSubmitFromRTDB.mockResolvedValue(undefined);
        mockUseActiveTimeTracking.mockReturnValue({
            onKeystroke: vi.fn(),
            switchTask: vi.fn(),
            getActiveTime: vi.fn(() => 0),
            pause: vi.fn(),
            seedActiveTimes: vi.fn(),
        });
        mockUseWritingAutoSave.mockReturnValue({
            saveTask: vi.fn(),
            saveActiveTab: vi.fn(),
            addTabSwitch: vi.fn(),
            loadSavedState: vi.fn().mockResolvedValue(null),
            flushPendingSave: vi.fn().mockResolvedValue(undefined),
            saveActiveTimes: vi.fn().mockResolvedValue(undefined),
        });
        mockUseExternalPastePrevention.mockReturnValue({
            pasteAttemptCount: 0,
            setPasteAttemptCount: mockSetPasteAttemptCount,
            attachToTextarea: mockAttachToTextarea,
        });
    });

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

    it('preserves punctuation spacing exactly when autosaving live writing text', async () => {
        const saveTask = vi.fn();
        mockUseWritingAutoSave.mockReturnValue({
            saveTask,
            saveActiveTab: vi.fn(),
            addTabSwitch: vi.fn(),
            loadSavedState: vi.fn().mockResolvedValue(null),
            flushPendingSave: vi.fn(),
        });

        render(<WritingTestPage testData={testData} sessionCode="SESSION-1" />);

        await waitFor(() => {
            expect(mockSet).toHaveBeenCalledWith(
                'game_sessions/SESSION-1/students/student-1/writing/pasteAttemptCount',
                0,
            );
        });

        const essayText = 'The trend rose. It stabilized, then growth, rose.';
        fireEvent.change(screen.getByTestId('writing-editor'), {
            target: { value: essayText },
        });

        expect(saveTask).toHaveBeenCalledWith(1, essayText);
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

    it('hydrates saved paste attempts and enables paste prevention from session antiCheatConfig', async () => {
        mockUseWritingAutoSave.mockReturnValue({
            saveTask: vi.fn(),
            saveActiveTab: vi.fn(),
            addTabSwitch: vi.fn(),
            loadSavedState: vi.fn().mockResolvedValue({
                task1Text: 'Recovered essay',
                task2Text: '',
                activeTask: 1,
                tabSwitches: 0,
                pasteAttemptCount: 4,
            }),
            flushPendingSave: vi.fn(),
        });
        mockUseExternalPastePrevention.mockReturnValue({
            pasteAttemptCount: 4,
            setPasteAttemptCount: mockSetPasteAttemptCount,
            attachToTextarea: mockAttachToTextarea,
        });

        render(<WritingTestPage testData={testData} sessionCode="SESSION-1" />);

        emitSnapshot('game_sessions/SESSION-1', {
            status: 'in-progress',
            isPaused: false,
            startTime: Date.now(),
            antiCheatConfig: {
                detectCopyPaste: true,
            },
        });

        await waitFor(() => {
            expect(mockUseExternalPastePrevention).toHaveBeenLastCalledWith({
                enabled: true,
                initialPasteAttemptCount: 0,
            });
        });

        await waitFor(() => {
            expect(screen.getByTestId('writing-editor')).toHaveValue('Recovered essay');
        });

        expect(mockSetPasteAttemptCount).toHaveBeenCalledWith(4);

        await waitFor(() => {
            expect(mockSet).toHaveBeenCalledWith(
                'game_sessions/SESSION-1/students/student-1/writing/pasteAttemptCount',
                4,
            );
        });
    });

    it('awaits flushPendingSave and persists active times before submitting', async () => {
        const order: string[] = [];
        let resolveFlush!: () => void;
        const flushPendingSave = vi.fn(() => new Promise<void>((resolve) => {
            order.push('flush-start');
            resolveFlush = () => {
                order.push('flush-end');
                resolve();
            };
        }));
        const saveActiveTimes = vi.fn(async () => {
            order.push('save-active-times');
        });
        mockAutoSubmitFromRTDB.mockImplementation(async () => {
            order.push('auto-submit');
        });
        mockUseActiveTimeTracking.mockReturnValue({
            onKeystroke: vi.fn(),
            switchTask: vi.fn(),
            getActiveTime: vi.fn((task: number) => (task === 1 ? 185 : 0)),
            pause: vi.fn(),
            seedActiveTimes: vi.fn(),
        });
        mockUseWritingAutoSave.mockReturnValue({
            saveTask: vi.fn(),
            saveActiveTab: vi.fn(),
            addTabSwitch: vi.fn(),
            loadSavedState: vi.fn().mockResolvedValue(null),
            flushPendingSave,
            saveActiveTimes,
        });

        render(<WritingTestPage testData={testData} sessionCode="SESSION-1" />);
        fireEvent.click(screen.getByRole('button', { name: /submit test/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'Submit' }));

        await waitFor(() => expect(flushPendingSave).toHaveBeenCalledTimes(1));
        expect(mockAutoSubmitFromRTDB).not.toHaveBeenCalled();

        await act(async () => {
            resolveFlush();
        });

        await waitFor(() => expect(mockAutoSubmitFromRTDB).toHaveBeenCalledTimes(1));
        expect(saveActiveTimes).toHaveBeenCalledWith({ 1: 185, 2: 0 });
        expect(order).toEqual(['flush-start', 'flush-end', 'save-active-times', 'auto-submit']);
    });

    it('announces submission failure via toast instead of alert and allows retrying', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        mockAutoSubmitFromRTDB
            .mockRejectedValueOnce(new Error('network down'))
            .mockResolvedValueOnce(undefined);

        render(<WritingTestPage testData={testData} sessionCode="SESSION-1" />);

        fireEvent.click(screen.getByRole('button', { name: /submit test/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'Submit' }));

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith(
                'Failed to submit your writing test. Your draft is preserved — please try again.',
            );
        });
        expect(alertSpy).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();

        // Retry succeeds
        fireEvent.click(screen.getByRole('button', { name: /submit test/i }));
        fireEvent.click(await screen.findByRole('button', { name: 'Submit' }));
        await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/submission-complete', expect.anything()));
        alertSpy.mockRestore();
    });

    it('locks the editor with a paused notice and accounts for server clock offset', async () => {
        render(<WritingTestPage testData={testData} sessionCode="SESSION-1" />);

        const now = Date.now();
        // Server clock is 60 seconds ahead of local clock
        emitSnapshot('.info/serverTimeOffset', 60_000);
        emitSnapshot('game_sessions/SESSION-1', {
            status: 'in-progress',
            isPaused: true,
            startTime: now - 60_000,
            pausedAt: now + 60_000,
            pausedDuration: 0,
        });

        expect(screen.getByText(/test paused by your teacher/i)).toBeInTheDocument();
        expect(screen.getByTestId('writing-editor')).toBeDisabled();
        // 60m duration - 2m elapsed (60s local + 60s server offset) = 58:00
        expect(screen.getByText('58:00')).toBeInTheDocument();
        await waitFor(() => {
            expect(mockSet).toHaveBeenCalledWith(
                'game_sessions/SESSION-1/students/student-1/writing/pasteAttemptCount',
                0,
            );
        });
    });

    it('clamps invalid saved activeTask and handles teacher reopen after reload', async () => {
        const seedActiveTimes = vi.fn();
        mockUseActiveTimeTracking.mockReturnValue({
            onKeystroke: vi.fn(),
            switchTask: vi.fn(),
            getActiveTime: vi.fn(() => 0),
            pause: vi.fn(),
            seedActiveTimes,
        });
        mockUseWritingAutoSave.mockReturnValue({
            saveTask: vi.fn(),
            saveActiveTab: vi.fn(),
            addTabSwitch: vi.fn(),
            loadSavedState: vi.fn().mockResolvedValue({
                task1Text: 'Already submitted essay',
                task2Text: '',
                activeTask: 2,
                tabSwitches: 0,
                pasteAttemptCount: 0,
                activeTimeSeconds: { 1: 300, 2: 0 },
                submitted: true,
                reopened: false,
            }),
            flushPendingSave: vi.fn().mockResolvedValue(undefined),
            saveActiveTimes: vi.fn().mockResolvedValue(undefined),
        });

        render(<WritingTestPage testData={testData} sessionCode="SESSION-1" />);

        await waitFor(() => {
            expect(screen.getByTestId('writing-editor')).toHaveValue('Already submitted essay');
        });
        expect(seedActiveTimes).toHaveBeenCalledWith({ 1: 300, 2: 0 });
        expect(screen.getByTestId('writing-editor')).toBeDisabled();

        // Teacher reopens student's writing
        emitSnapshot('game_sessions/SESSION-1/students/student-1/writing/reopened', true);
        await waitFor(() => {
            expect(screen.getByTestId('writing-editor')).toBeEnabled();
        });
        expect(mockToastInfo).toHaveBeenCalledWith(
            'Your teacher reopened this writing test. You can continue editing.',
        );
    });

    it('shows accurate Task 2 word minimum (250) in the submit confirmation modal', async () => {
        const task2TestData = {
            ...testData,
            metadata: { ...testData.metadata, format: 'task2-only' },
            tasks: [
                {
                    taskNumber: 2,
                    taskType: 'opinion',
                    promptText: 'Discuss both views.',
                    wordMinimum: 250,
                },
            ],
        } as any;

        render(<WritingTestPage testData={task2TestData} sessionCode="SESSION-1" />);
        fireEvent.change(screen.getByTestId('writing-editor'), {
            target: { value: Array(160).fill('word').join(' ') },
        });
        fireEvent.click(screen.getByRole('button', { name: /submit test/i }));

        expect(await screen.findByText('160 words (min 250)')).toBeInTheDocument();
        expect(screen.getByText(/below the recommended minimum word count/i)).toBeInTheDocument();
    });
});
