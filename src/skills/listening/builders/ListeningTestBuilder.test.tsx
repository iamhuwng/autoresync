import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../test/test-utils';
import ListeningTestBuilder from './ListeningTestBuilder';

const testState = vi.hoisted(() => ({
  seedAudioMetadata: true,
}));

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();

  return {
    ...react,
    useState<T>(initialState: T | (() => T)) {
      return react.useState<T>(() => {
        const value = typeof initialState === 'function'
          ? (initialState as () => T)()
          : initialState;

        // Seed existing audio metadata so this layout test can traverse the
        // normal text-mode steps without exercising upload or validation services.
        if (
          value
          && typeof value === 'object'
          && 'skill' in value
          && value.skill === 'Listening'
          && 'sections' in value
          && Array.isArray(value.sections)
          && testState.seedAudioMetadata
        ) {
          return {
            ...value,
            sections: value.sections.map((section, index) => index === 0
              ? {
                  ...section,
                  audioUrl: 'https://cdn.example.com/listening.mp3',
                  streamUrl: 'https://cdn.example.com/listening.mp3',
                  assetId: 'asset-1',
                  uploadSessionId: 'session-1',
                  tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
                  checksum: 'sha256:proof',
                  contentType: 'audio/mpeg',
                  sizeBytes: 6,
                  fileName: 'audio.mp3',
                }
              : section),
          } as T;
        }

        return value;
      });
    },
  };
});

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  parseListening: vi.fn(),
  parseAnswerKey: vi.fn(),
  saveListeningTestToFirebase: vi.fn(),
    saveDraft: vi.fn(),
    publishDraft: vi.fn(),
    mutateLifecycle: vi.fn(),
    discardDraft: vi.fn(),
    restoreDraft: vi.fn(),
    archivePublishedVersion: vi.fn(),
  uploadAudioReplacement: vi.fn(),
  uploadListeningAuthoringAudio: vi.fn(),
  cancelListeningAuthoringUpload: vi.fn(),
  probeListeningAuthoringAudio: vi.fn(),
  validateAudioLink: vi.fn(),
  trackAction: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
  },
}));

const createRangeResponse = (
  status: number,
  headers: Record<string, string> = {},
): Response => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {
    get(name: string) {
      return headers[name.toLowerCase()] ?? headers[name] ?? null;
    },
  },
}) as Response;

const setBrowserRouteState = (state: unknown) => {
  window.history.pushState(
    { usr: state, key: 'listening-builder-test', idx: 0 },
    '',
    '/create-test?type=IELTS&skill=Listening',
  );
};

vi.mock('../../../components/modern', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/modern')>();
  return {
    ...actual,
    toast: mocks.toast,
  };
});

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
  }),
}));

vi.mock('../../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: mocks.trackAction,
  }),
}));

vi.mock('../../../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: mocks.navigateTo,
  }),
}));

vi.mock('../../../services/listeningTestStorage', () => ({
  AUDIO_CONTROLS_PRESETS: {
    IELTS_STANDARD: {
      showPlayPause: false,
      showProgressBar: true,
      showSeekControl: false,
      showSpeedControl: false,
      showSkipSection: false,
      showVolumeControl: true,
    },
  },
  saveListeningTestToFirebase: mocks.saveListeningTestToFirebase,
}));

vi.mock('../../../features/assessment/listening/authoring/listeningAuthoringWorkflow', () => ({
  createListeningAuthoringWorkflow: vi.fn(() => ({
    saveDraft: mocks.saveDraft,
    publishDraft: mocks.publishDraft,
    mutateLifecycle: mocks.mutateLifecycle,
    softDeleteDraft: mocks.mutateLifecycle,
    restoreDraft: mocks.restoreDraft,
    archivePublishedVersion: mocks.archivePublishedVersion,
    discardDraft: mocks.discardDraft,
  })),
}));

  vi.mock('../../../services/r2Storage', () => ({
    default: {
      uploadAudioReplacement: mocks.uploadAudioReplacement,
      uploadListeningAuthoringAudio: mocks.uploadListeningAuthoringAudio,
      cancelListeningAuthoringUpload: mocks.cancelListeningAuthoringUpload,
      probeListeningAuthoringAudio: mocks.probeListeningAuthoringAudio,
    },
  }));

vi.mock('../../../services/googleDriveAudio', () => ({
  googleDriveAudioService: {
    validateAudioLink: mocks.validateAudioLink,
  },
}));

vi.mock('../../../services/parser/listening.router', () => ({
  listeningRouter: {
    parseListening: mocks.parseListening,
    parseAnswerKey: mocks.parseAnswerKey,
  },
}));

describe('ListeningTestBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBrowserRouteState(null);
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createRangeResponse(206, {
      'accept-ranges': 'bytes',
      'content-range': 'bytes 0-0/2048',
      'content-length': '1',
    })));
    testState.seedAudioMetadata = true;
    mocks.saveDraft.mockResolvedValue({
      status: 'saved',
      draftId: 'draft-1',
      conflictToken: 1,
      warnings: [],
      blockers: [],
    });
    mocks.publishDraft.mockResolvedValue({
      status: 'published',
      draftId: 'draft-1',
      versionId: 'version-1',
      versionNumber: 1,
      conflictToken: 2,
      warnings: [],
    });
    mocks.discardDraft.mockResolvedValue({
      status: 'discarded',
      draftId: 'draft-1',
      conflictToken: 2,
    });
    mocks.restoreDraft.mockResolvedValue({
      status: 'restored',
      draftId: 'draft-1',
      conflictToken: 3,
    });
    mocks.archivePublishedVersion.mockResolvedValue({
      status: 'archived',
      versionId: 'version-1',
      versionNumber: 1,
    });
    mocks.uploadListeningAuthoringAudio.mockResolvedValue({
      url: 'https://pub.example/temp/listening/teacher-1/session-1/asset-1-audio.mp3',
      streamUrl: 'https://pub.example/temp/listening/teacher-1/session-1/asset-1-audio.mp3',
      directUrl: 'https://pub.example/temp/listening/teacher-1/session-1/asset-1-audio.mp3',
      fileName: 'audio.mp3',
      key: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
      isTemp: true,
      assetId: 'asset-1',
      uploadSessionId: 'session-1',
      tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 5,
    });
    mocks.cancelListeningAuthoringUpload.mockResolvedValue({
      status: 'abandoned',
      uploadSessionId: 'session-1',
      deletedCount: 1,
      preservedCount: 0,
      skippedCount: 0,
    });
    mocks.probeListeningAuthoringAudio.mockResolvedValue({
      status: 'ready',
      assetId: 'asset-1',
      uploadSessionId: 'session-1',
      contentType: 'audio/mpeg',
      sizeBytes: 6,
      range: {
        requestRange: 'bytes=0-0',
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/6',
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const goToQuestionsStep = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(await screen.findByRole('button', { name: 'Add manually' }));
  };

  const goToReviewStep = async (user: ReturnType<typeof userEvent.setup>) => {
    await goToQuestionsStep(user);
    await user.click(screen.getByRole('button', { name: 'Next →' }));
  };

  it('uses the neutral authoring layout for empty Step 4 after skipping text-mode parsing', async () => {
    render(<ListeningTestBuilder />);

    const modeHeader = screen.getByRole('region', { name: 'Choose Display Mode' });

    expect(modeHeader).toContainElement(
      screen.getByRole('heading', { name: 'Choose Display Mode' }),
    );
    expect(modeHeader).toHaveTextContent(
      'Select how your listening test questions will be displayed to students',
    );
    expect(modeHeader).toHaveClass('assessment-authoring-header');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    });
    expect(screen.getByRole('heading', { name: 'Audio' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    });
    expect(
      screen.getByRole('heading', { name: 'Question text' }),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add manually' }));
    });

    expect(screen.getByRole('heading', { name: 'Questions (0/10)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Questions (0/10)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Question/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Test' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'No questions added yet' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Click "Add Question" to start.')).toBeInTheDocument();
    expect(screen.queryByText(/First save creates a draft/i)).not.toBeInTheDocument();

    expect(mocks.parseListening).not.toHaveBeenCalled();
    expect(mocks.parseAnswerKey).not.toHaveBeenCalled();
    expect(mocks.saveListeningTestToFirebase).not.toHaveBeenCalled();
    expect(mocks.validateAudioLink).not.toHaveBeenCalled();
    expect(mocks.uploadAudioReplacement).not.toHaveBeenCalled();
  });

  it('opens on audio step with modal-selected image mode and metadata', () => {
    setBrowserRouteState({
      entryPoint: 'test-creation-modal',
      metadata: {
        title: 'Modal Listening Test',
        type: 'IELTS',
        skill: 'Listening',
        duration: 30,
        difficulty: 'Intermediate',
      },
      initialDisplayMode: 'image',
      initialStep: 'audio',
    });

    render(<ListeningTestBuilder />);

    expect(screen.getByRole('heading', { name: 'Audio' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose Display Mode' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Images/).length).toBeGreaterThan(0);
  });

  it('renders image setup as a section rail with one active image workspace', () => {
    setBrowserRouteState({
      entryPoint: 'test-creation-modal',
      metadata: {
        title: 'Modal Listening Test',
        type: 'IELTS',
        skill: 'Listening',
        duration: 30,
        difficulty: 'Intermediate',
      },
      initialDisplayMode: 'image',
      initialStep: 'questions-images',
    });

    render(<ListeningTestBuilder />);

    expect(screen.getByRole('complementary', { name: 'Listening image sections' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add section/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Section 1/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Remove section/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add image' })).toBeInTheDocument();
    expect(screen.queryByText('Upload images and set question ranges for each section.')).not.toBeInTheDocument();
    expect(screen.queryByText(/Each image covers a range of questions/i)).not.toBeInTheDocument();
  });

  it('renders display mode options as keyboard-reachable buttons with pressed state', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    const textMode = screen.getByRole('button', { name: 'IELTS Text Format' });
    const imageMode = screen.getByRole('button', { name: 'Image Mode' });

    expect(textMode).toHaveAttribute('aria-pressed', 'true');
    expect(imageMode).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Display mode options' })).toBeInTheDocument();
    expect(textMode.style.background).toBe('rgb(37, 99, 235)');
    expect(imageMode.style.background).toBe('rgb(255, 255, 255)');

    await user.tab();
    expect(textMode).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(imageMode).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(imageMode).toHaveAttribute('aria-pressed', 'true');
    expect(textMode).toHaveAttribute('aria-pressed', 'false');
    expect(imageMode.style.background).toBe('rgb(79, 70, 229)');
    expect(textMode.style.background).toBe('rgb(255, 255, 255)');
  });

  it('shows exact upload guidance copy and labels the audio counter separately', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await user.click(screen.getByRole('button', { name: 'Next →' }));

    expect(screen.getByText('Upload one audio file per section.')).toBeInTheDocument();
    expect(screen.getByText(/MP3 or M4A recommended/i)).toBeInTheDocument();
    expect(screen.getByText(/1 audio file planned/i)).toBeInTheDocument();
    expect(screen.queryByText(/questions total/i)).not.toBeInTheDocument();
  });

  it('uploads through canonical Listening authority and saves only approved asset fields', async () => {
    testState.seedAudioMetadata = false;
    const user = userEvent.setup();
    const { container } = render(<ListeningTestBuilder />);
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    const input = container.querySelector('#audio-upload-1') as HTMLInputElement;
    const file = new File(['audio'], 'audio.mp3', { type: 'audio/mpeg' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.uploadListeningAuthoringAudio).toHaveBeenCalledWith(
        file,
        expect.objectContaining({
          sessionIdempotencyKey: expect.stringContaining('-session'),
          assetIdempotencyKey: expect.stringContaining('-asset'),
        }),
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(await screen.findByText('Uploaded')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());

    const section = mocks.saveDraft.mock.calls[0][0].document.audioSections[0];
    expect(section).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      audioUrl: 'https://pub.example/temp/listening/teacher-1/session-1/asset-1-audio.mp3',
    }));
    expect(section).not.toHaveProperty('uploadSessionId');
    expect(section).not.toHaveProperty('tempKey');
    expect(mocks.uploadAudioReplacement).not.toHaveBeenCalled();
  });

  it('preserves the previous canonical asset when replacement upload fails', async () => {
    mocks.uploadListeningAuthoringAudio.mockRejectedValueOnce(new Error('upload_failed'));
    const user = userEvent.setup();
    const { container } = render(<ListeningTestBuilder />);
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    const input = container.querySelector('#audio-upload-1') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['new'], 'replacement.mp3', { type: 'audio/mpeg' })] },
    });

    expect((await screen.findAllByText('Failed to upload audio file. Please try again.'))[0]).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());
    expect(mocks.saveDraft.mock.calls[0][0].document.audioSections[0]).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      audioUrl: 'https://cdn.example.com/listening.mp3',
    }));
  });

  it('ignores a stale upload completion after a newer section upload succeeds', async () => {
    testState.seedAudioMetadata = false;
    let resolveFirst: ((value: any) => void) | undefined;
    let resolveSecond: ((value: any) => void) | undefined;
    let firstUploadOptions: { signal?: AbortSignal } | undefined;
    let secondUploadOptions: { signal?: AbortSignal } | undefined;
    mocks.uploadListeningAuthoringAudio
      .mockImplementationOnce((_file, _input, _progress, options) => {
        firstUploadOptions = options;
        return new Promise((resolve) => { resolveFirst = resolve; });
      })
      .mockImplementationOnce((_file, _input, _progress, options) => {
        secondUploadOptions = options;
        return new Promise((resolve) => { resolveSecond = resolve; });
      });
    const user = userEvent.setup();
    const { container } = render(<ListeningTestBuilder />);
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    const input = container.querySelector('#audio-upload-1') as HTMLInputElement;

    act(() => {
      fireEvent.change(input, {
        target: { files: [new File(['first'], 'first.mp3', { type: 'audio/mpeg' })] },
      });
      fireEvent.change(input, {
        target: { files: [new File(['second'], 'second.mp3', { type: 'audio/mpeg' })] },
      });
    });
    expect(mocks.uploadListeningAuthoringAudio).toHaveBeenCalledTimes(2);
    expect(firstUploadOptions?.signal?.aborted).toBe(true);
    expect(secondUploadOptions?.signal?.aborted).toBe(false);

    await act(async () => {
      resolveSecond?.({
        url: 'https://pub.example/second.mp3',
        streamUrl: 'https://pub.example/second.mp3',
        directUrl: 'https://pub.example/second.mp3',
        fileName: 'second.mp3',
        key: 'temp/listening/teacher-1/session-2/asset-2-second.mp3',
        isTemp: true,
        assetId: 'asset-2',
        uploadSessionId: 'session-2',
        tempKey: 'temp/listening/teacher-1/session-2/asset-2-second.mp3',
        contentType: 'audio/mpeg',
        sizeBytes: 6,
      });
    });
    await act(async () => {
      resolveFirst?.({
        url: 'https://pub.example/first.mp3',
        streamUrl: 'https://pub.example/first.mp3',
        directUrl: 'https://pub.example/first.mp3',
        fileName: 'first.mp3',
        key: 'temp/listening/teacher-1/session-1/asset-1-first.mp3',
        isTemp: true,
        assetId: 'asset-1',
        uploadSessionId: 'session-1',
        tempKey: 'temp/listening/teacher-1/session-1/asset-1-first.mp3',
        contentType: 'audio/mpeg',
        sizeBytes: 5,
      });
    });

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled());
    expect(mocks.saveDraft.mock.calls[0][0].document.audioSections[0]).toEqual(expect.objectContaining({
      assetId: 'asset-2',
      audioUrl: 'https://pub.example/second.mp3',
    }));
  });

  it('tracks authoring step navigation without logging audio delivery URLs', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const user = userEvent.setup();

    try {
      render(<ListeningTestBuilder />);

      await user.click(screen.getByRole('button', { name: 'Next →' }));
      expect(mocks.trackAction).toHaveBeenCalledWith('listeningAuthoringStepNext', expect.objectContaining({
        source: 'listening_builder',
        fromStep: 'mode-select',
        toStep: 'audio',
        outcome: 'navigated',
      }));

      await user.click(screen.getByRole('button', { name: /Back/ }));
      expect(mocks.trackAction).toHaveBeenCalledWith('listeningAuthoringStepBack', expect.objectContaining({
        source: 'listening_builder',
        fromStep: 'audio',
        toStep: 'mode-select',
        outcome: 'navigated',
      }));

      await user.click(screen.getByRole('button', { name: 'Next →' }));
      await user.click(screen.getByRole('button', { name: 'Next →' }));

      expect(mocks.trackAction).toHaveBeenCalledWith('listeningAuthoringStepNext', expect.objectContaining({
        source: 'listening_builder',
        fromStep: 'audio',
        toStep: 'questions-text',
        outcome: 'navigated',
      }));
      expect(logSpy.mock.calls.flatMap((call) => call.map(String)).join('\n')).not.toContain(
        'https://cdn.example.com/listening.mp3',
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it('saves a draft with missing-audio warnings from the audio step and avoids publish persistence', async () => {
    testState.seedAudioMetadata = false;
    mocks.saveDraft.mockResolvedValueOnce({
      status: 'saved',
      draftId: 'draft-1',
      conflictToken: 1,
      warnings: [{
        sectionNumber: 1,
        field: 'audioUrl',
        severity: 'warning',
        guidance: 'Add audio before publishing.',
      }],
      blockers: [],
    });
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Draft saved with warnings.')).toBeInTheDocument();
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.any(String),
      trigger: 'explicit',
      document: expect.objectContaining({
        audioSections: expect.arrayContaining([
          expect.objectContaining({ audioUrl: '' }),
        ]),
      }),
    }));
    expect(screen.getByText(/Missing audio can stay in draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Re-upload each missing section before publishing/i)).toBeInTheDocument();
    expect(mocks.toast.warning).toHaveBeenCalledWith(expect.stringContaining('Draft saved with warnings.'));
    expect(mocks.saveListeningTestToFirebase).not.toHaveBeenCalled();
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it('does not show missing-audio draft guidance for non-audio backend warnings', async () => {
    mocks.saveDraft.mockResolvedValueOnce({
      status: 'saved',
      draftId: 'draft-1',
      conflictToken: 1,
      warnings: [{
        field: 'questions',
        severity: 'warning',
        guidance: 'document.questions is empty.',
      }],
      blockers: [],
    });
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await user.click(screen.getByRole('button', { name: 'Next →' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Draft saved with warnings.')).toBeInTheDocument();
    expect(screen.getByText('document.questions is empty.')).toBeInTheDocument();
    expect(screen.queryByText(/Missing audio can stay in draft/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Re-upload each missing section before publishing/i)).not.toBeInTheDocument();
    expect(mocks.toast.warning).toHaveBeenCalledWith(expect.stringContaining('Draft saved with warnings.'));
  });

  it('blocks publish on the manual path and uses the shared error announcement system', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await goToQuestionsStep(user);
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Publish blocked.')).toBeInTheDocument();
    expect(screen.getByText(/Publish requires every question prompt/i)).toBeInTheDocument();
    expect(screen.getByText(/Publish requires every answer key/i)).toBeInTheDocument();
    expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining('Publish blocked.'));
    expect(mocks.saveListeningTestToFirebase).not.toHaveBeenCalled();
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it('coalesces duplicate Save draft clicks and tracks the duplicate-action path', async () => {
    testState.seedAudioMetadata = false;
    render(<ListeningTestBuilder />);

    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));

    const saveDraftButton = screen.getByRole('button', { name: 'Save draft' });
    fireEvent.click(saveDraftButton);
    fireEvent.click(saveDraftButton);

    await waitFor(() => {
      expect(mocks.toast.info).toHaveBeenCalledWith(expect.stringContaining('already in progress'));
    });
    expect(mocks.trackAction).toHaveBeenCalledWith('listeningDuplicateActionBlocked', expect.objectContaining({
      action: 'saveDraft',
    }));
  });

  it('uses embedded exit callback instead of teacher navigation at the modal boundary', async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    const onDirtyChange = vi.fn();
    const onHeaderChange = vi.fn();

    render(
      <ListeningTestBuilder
        presentation="embedded"
        initialDisplayMode="image"
        initialStep="audio"
        initialMetadata={{
          title: 'Embedded Listening Test',
          type: 'IELTS',
          skill: 'Listening',
          duration: 30,
          difficulty: 'Intermediate',
        }}
        onExit={onExit}
        onDirtyChange={onDirtyChange}
        onHeaderChange={onHeaderChange}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Audio' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Create Listening Test/i })).not.toBeInTheDocument();
    expect(onHeaderChange).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Audio',
      subtitle: 'Upload one file per section',
      step: 'audio',
      displayMode: 'image',
    }));

    fireEvent.change(screen.getByLabelText('Section 1 wait before section seconds'), {
      target: { value: '7' },
    });
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));

    await user.click(screen.getByRole('button', { name: /Back/ }));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Discard draft changes' })).not.toBeInTheDocument();
    expect(mocks.navigateTo).not.toHaveBeenCalled();
    expect(mocks.trackAction).toHaveBeenCalledWith('listeningAuthoringStepBack', expect.objectContaining({
      fromStep: 'audio',
      toStep: 'listening-mode',
      outcome: 'navigated',
    }));
  });

  it('keeps embedded publish inside the modal instead of navigating to lobby', async () => {
    const user = userEvent.setup();
    const onPublished = vi.fn();

    render(
      <ListeningTestBuilder
        presentation="embedded"
        initialDisplayMode="text"
        initialStep="audio"
        initialMetadata={{
          title: 'Embedded Listening Test',
          type: 'IELTS',
          skill: 'Listening',
          duration: 30,
          difficulty: 'Intermediate',
        }}
        onPublished={onPublished}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Next/ }));
    await user.click(await screen.findByRole('button', { name: 'Add manually' }));
    await user.click(screen.getByRole('button', { name: /Next/ }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(onPublished).toHaveBeenCalledTimes(1);
    });
    expect(mocks.navigateTo).not.toHaveBeenCalledWith('LOBBY', expect.anything(), expect.anything());
  });

  it('sends canonical authoring audio fields without storage-only upload metadata', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await goToReviewStep(user);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalled();
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    const saveRequest = mocks.saveDraft.mock.calls[0][0];
    const audioSections = saveRequest.document.audioSections;
    expect(saveRequest.document).toMatchObject({
      difficulty: 'Intermediate',
      questionCount: 0,
      isPublic: false,
      isComplete: false,
    });
    expect(saveRequest.document).not.toHaveProperty('missingAnswerCount');
    expect(audioSections[0]).toMatchObject({
      audioUrl: 'https://cdn.example.com/listening.mp3',
      streamUrl: 'https://cdn.example.com/listening.mp3',
      assetId: 'asset-1',
    });
    for (const storageOnlyField of [
      'uploadSessionId',
      'tempKey',
      'checksum',
      'contentType',
      'sizeBytes',
      'fileName',
    ]) {
      expect(audioSections[0]).not.toHaveProperty(storageOnlyField);
    }
    expect(mocks.publishDraft).toHaveBeenCalledWith({
      draftId: 'draft-1',
      expectedConflictToken: 1,
      idempotencyKey: expect.any(String),
    });
    expect(mocks.probeListeningAuthoringAudio).toHaveBeenCalledWith({
      uploadSessionId: 'session-1',
      assetId: 'asset-1',
    });
    await waitFor(() => {
      expect(mocks.navigateTo).toHaveBeenCalledWith('LOBBY', undefined, {
        reason: 'listening_builder_publish_success',
        replace: true,
      });
    });
    expect(mocks.saveListeningTestToFirebase).not.toHaveBeenCalled();
    expect(globalThis.alert).not.toHaveBeenCalled();
  });

  it('blocks publish before the backend when audio delivery is not byte-range capable', async () => {
    const user = userEvent.setup();
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError('R2 CORS preflight blocked'));
    mocks.probeListeningAuthoringAudio.mockResolvedValueOnce({
      status: 'ready',
      assetId: 'asset-1',
      uploadSessionId: 'session-1',
      contentType: 'audio/mpeg',
      sizeBytes: 6,
      range: {
        requestRange: 'bytes=0-0',
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/0',
      },
    });
    render(<ListeningTestBuilder />);

    await goToReviewStep(user);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(mocks.saveDraft).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Publish blocked.')).toBeInTheDocument();
    expect(screen.getByRole('alert', { name: 'Publish audio readiness' })).toHaveTextContent(
      'Audio readiness blocked Publish.',
    );
    expect(screen.getAllByText(/Audio delivery must support byte-range playback/i).length).toBeGreaterThan(0);
    expect(mocks.publishDraft).not.toHaveBeenCalled();
    expect(mocks.navigateTo).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.trackAction).toHaveBeenCalledWith('listeningPublishReadinessFailed', expect.objectContaining({
      source: 'listening_builder',
      draftId: 'draft-1',
      blockerCount: 1,
    }));
  });

  it('renders publish readiness and action controls with accessible labels and status semantics', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await goToReviewStep(user);

    expect(screen.getByRole('status', { name: 'Publish audio readiness' })).toHaveTextContent(
      'Audio readiness will be checked when you publish.',
    );
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();

    const saveDraftButton = screen.getByRole('button', { name: 'Save draft' });
    for (let index = 0; index < 8 && document.activeElement !== saveDraftButton; index += 1) {
      await user.tab();
    }
    expect(saveDraftButton).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveFocus();
  });

  it('focuses stale-conflict recovery and returns keyboard users to editing', async () => {
    mocks.saveDraft.mockResolvedValueOnce({
      status: 'conflict',
      recoverable: true,
      draftId: 'draft-1',
      expectedConflictToken: 1,
      currentConflictToken: 2,
    });
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    const conflict = await screen.findByRole('alert');
    expect(conflict).toHaveTextContent('Draft conflict detected.');
    expect(conflict).toHaveFocus();

    await user.tab();
    const recovery = screen.getByRole('button', { name: 'Continue editing' });
    expect(recovery).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.queryByText('Draft conflict detected.')).not.toBeInTheDocument();
  });

  it('uses trusted discard and restore lifecycle operations with keyboard-reachable recovery', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved.');
    await user.click(screen.getByRole('button', { name: 'Discard draft' }));
    await user.click(screen.getByRole('button', { name: 'Discard now' }));

    await waitFor(() => {
      expect(mocks.discardDraft).toHaveBeenCalledWith({
        draftId: 'draft-1',
        expectedConflictToken: 1,
        idempotencyKey: expect.any(String),
        reasonCode: 'teacher-discard',
      });
    });
    await waitFor(() => {
      expect(mocks.cancelListeningAuthoringUpload).toHaveBeenCalledWith({
        uploadSessionId: 'session-1',
        assetId: 'asset-1',
        reason: 'discard-draft',
      });
    });
    expect(JSON.stringify(mocks.cancelListeningAuthoringUpload.mock.calls[0][0])).not.toContain('temp/listening/');
    expect(await screen.findByText('Draft changes discarded.')).toBeInTheDocument();

    const restore = screen.getByRole('button', { name: 'Restore draft' });
    restore.focus();
    expect(restore).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mocks.restoreDraft).toHaveBeenCalledWith({
        draftId: 'draft-1',
        expectedConflictToken: 2,
        idempotencyKey: expect.any(String),
        reasonCode: 'teacher-restore',
      });
    });
    expect(mocks.toast.info).toHaveBeenCalledWith(expect.stringContaining('Draft restored'));
  });

  it('archives the published version through the trusted lifecycle operation', async () => {
    let resolveArchive: ((value: {
      status: 'archived';
      versionId: string;
      versionNumber: number;
    }) => void) | undefined;
    mocks.archivePublishedVersion.mockImplementationOnce(() => new Promise((resolve) => {
      resolveArchive = resolve;
    }));
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await goToReviewStep(user);
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved.');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    const archive = await screen.findByRole('button', { name: 'Archive published version' });
    archive.focus();
    expect(archive).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mocks.archivePublishedVersion).toHaveBeenCalledWith({
        versionId: 'version-1',
        expectedConflictToken: 1,
        idempotencyKey: expect.any(String),
        reasonCode: 'teacher-archive',
      });
    });
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '← Back' })).toBeDisabled();

    await act(async () => {
      resolveArchive?.({
        status: 'archived',
        versionId: 'version-1',
        versionNumber: 1,
      });
    });
    await waitFor(() => {
      expect(mocks.toast.info).toHaveBeenCalledWith(expect.stringContaining('Published version archived'));
    });
  });

  it('keeps display mode buttons semantically valid and scoped to explicit transitions', () => {
    render(<ListeningTestBuilder />);

    const textMode = screen.getByRole('button', { name: 'IELTS Text Format' });
    const imageMode = screen.getByRole('button', { name: 'Image Mode' });

    expect(textMode.querySelector('div,h3,p,ul,li')).toBeNull();
    expect(imageMode.querySelector('div,h3,p,ul,li')).toBeNull();
    expect(textMode.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(imageMode.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(textMode.style.transition).not.toContain('all');
    expect(imageMode.style.transition).not.toContain('all');
  });
});
