import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReadingV2StudioPage from './ReadingV2StudioPage';
import { toast } from '../components/modern/ToastNotification';
import { createTeacherRoutes } from '../routes/teacherRoutes';
import { readingV2Ids, type ReadingV2DraftRecord } from '../types/readingV2.types';
import { createReadingV2CanonicalFixture } from '../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { readingV2StudioRepository } from '../services/reading-v2/readingV2StudioWorkflow.service';
import { readingV2StoragePaths } from '../services/reading-v2/readingV2StoragePaths.service';
import {
  READING_V2_STRUCTURED_MATERIALS_END,
  READING_V2_STRUCTURED_MATERIALS_START,
} from '../services/reading-v2/readingV2ExternalAiPrompt.service';

const trackActionMock = vi.fn();
const navigateToMock = vi.fn();
const discoverTargetsMock = vi.fn();
const { useAuthMock, currentAuthUid, durableRecords } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  currentAuthUid: { value: 'teacher-modal' as string | null },
  durableRecords: new Map<string, unknown>(),
}));
let toastSuccessSpy: ReturnType<typeof vi.spyOn>;

vi.mock('../hooks/useAuth', () => ({ useAuth: useAuthMock }));

vi.mock('../services/reading-v2/readingV2DraftFirebaseRepository.service', async () => {
  const actual = await vi.importActual<typeof import('../services/reading-v2/readingV2DraftFirebaseRepository.service')>(
    '../services/reading-v2/readingV2DraftFirebaseRepository.service',
  );
  const transport = {
    read: async (path: string) => {
      const value = durableRecords.get(path);
      return value === undefined ? null : structuredClone(value);
    },
    set: async (path: string, value: unknown) => { durableRecords.set(path, structuredClone(value)); },
    getAuthenticatedUserId: async () => currentAuthUid.value,
  };
  return {
    ...actual,
    createFirebaseReadingV2DraftRepository: (actor: Parameters<typeof actual.createFirebaseReadingV2DraftRepository>[0]) =>
      actual.createFirebaseReadingV2DraftRepository(actor, transport),
  };
});

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: trackActionMock,
  }),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: navigateToMock,
    handleSessionChange: vi.fn(),
    handleTestChange: vi.fn(),
    currentPath: '/',
    isNavigating: false,
    navigationHistory: [],
    context: {},
  }),
}));

vi.mock('../services/reading-v2/readingV2FirebasePublishAdapter.service', () => ({
  commitReadingV2PublishPlanToFirebase: vi.fn(async () => ({
    status: 'committed',
    commitPath: 'reading_v2/publish_commits/test-commit',
    operationKeys: ['test-operation'],
  })),
}));

vi.mock('../services/reading-v2/readingV2ReferenceUpdateFirebaseRepository.service', () => ({
  createFirebaseReadingV2ReferenceUpdateRepository: () => ({
    discoverTargets: discoverTargetsMock,
    applySelected: vi.fn(),
  }),
}));

vi.mock('../services/reading-v2/readingV2StudioFirebaseHydration.service', async () => {
  const { createReadingV2CanonicalFixture } = await vi.importActual<typeof import('../services/reading-v2/fixtures/readingV2CanonicalFixtures')>(
    '../services/reading-v2/fixtures/readingV2CanonicalFixtures',
  );

  return {
    loadReadingV2PublishedRevisionSource: vi.fn(async (materialId: string) => {
      const document = {
        ...createReadingV2CanonicalFixture('matching-headings'),
        title: 'Hydrated Published Reading V2',
      };

      return {
        status: 'loaded',
        materialId,
        metadata: {
          materialId,
          ownerId: 'teacher-modal',
          deliveryEngine: 'reading-v2',
          productLabel: 'Reading V2',
          title: document.title,
          materialKind: materialId === 'single-passage-1' ? 'reading-passage' : 'full-test',
          durationMinutes: 60,
          difficulty: 'intermediate',
          targetBand: 'Band 6-7',
          description: '',
          tags: [],
          visibility: 'private',
          publishedSnapshotVersionId: 'snapshot-live',
          updatedAt: '2026-04-29T00:00:00.000Z',
          relationshipSurfaces: ['teacher-lobby'],
        },
        snapshot: {
          snapshotVersionId: 'snapshot-live',
          materialId,
          ownerId: 'teacher-modal',
          document,
          publishedAt: '2026-04-29T00:00:00.000Z',
          publishedBy: 'teacher-modal',
        },
      };
    }),
  };
});

const renderRoute = (path: string | { pathname: string; state?: unknown }, pattern = '/teacher/reading-v2/create') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={<ReadingV2StudioPage />} />
      </Routes>
    </MemoryRouter>,
  );

const createThreePassageDocument = () => {
  const first = createReadingV2CanonicalFixture('sentence-completion');
  const second = createReadingV2CanonicalFixture('matching-headings');
  const third = createReadingV2CanonicalFixture('multiple-choice');

  return {
    ...first,
    documentId: readingV2Ids.documentId('doc-full-test-toast'),
    title: 'Full Test Toast Ready',
    sectionIds: [...first.sectionIds, ...second.sectionIds, ...third.sectionIds],
    sections: {
      ...first.sections,
      ...second.sections,
      ...third.sections,
    },
    stimuli: {
      ...first.stimuli,
      ...second.stimuli,
      ...third.stimuli,
    },
    anchors: {
      ...first.anchors,
      ...second.anchors,
      ...third.anchors,
    },
    taskGroups: {
      ...first.taskGroups,
      ...second.taskGroups,
      ...third.taskGroups,
    },
    interactions: {
      ...first.interactions,
      ...second.interactions,
      ...third.interactions,
    },
    optionSets: {
      ...first.optionSets,
      ...second.optionSets,
      ...third.optionSets,
    },
  };
};

const seedDraft = (input: Parameters<typeof readingV2StudioRepository.createDraft>[0]): ReadingV2DraftRecord => {
  const draft = readingV2StudioRepository.createDraft(input);
  durableRecords.set(readingV2StoragePaths.drafts(draft.draftId), structuredClone(draft));
  return draft;
};

describe('ReadingV2StudioPage', () => {
  beforeEach(() => {
    currentAuthUid.value = 'teacher-modal';
    useAuthMock.mockReturnValue({
      user: { uid: 'teacher-modal', email: 'teacher@test.com' },
      profile: { role: 'teacher', displayName: 'Test Teacher' },
      loading: false,
      logout: vi.fn(),
    });
    durableRecords.clear();
    trackActionMock.mockClear();
    navigateToMock.mockClear();
    discoverTargetsMock.mockResolvedValue({
      passageMaterialId: 'single-passage-1',
      previousSnapshotVersionId: 'snapshot-live',
      nextSnapshotVersionId: 'snapshot-new',
      targets: [],
      excluded: {
        nonOwnedReferenceCount: 0,
        alreadyCurrentCount: 0,
        frozenAssignmentCount: 0,
        resultSnapshotCount: 0,
      },
    });
    readingV2StudioRepository.store.drafts.clear();
    readingV2StudioRepository.store.publishedSnapshots.clear();
    readingV2StudioRepository.store.passageAssets.clear();
    readingV2StudioRepository.store.passageAssetVersions.clear();
    readingV2StudioRepository.store.whereUsed.clear();
    readingV2StudioRepository.store.taskGroupMaterials.clear();
    readingV2StudioRepository.store.fullTests.clear();
    toastSuccessSpy?.mockRestore();
    toastSuccessSpy = vi.spyOn(toast, 'success').mockImplementation(() => 'toast-id');
  });

  it('resolves create route into the shared Studio shell', async () => {
    renderRoute('/teacher/reading-v2/create');

    expect(await screen.findByRole('main')).toHaveAttribute('data-mode', 'create-blank');
    expect(screen.getByText('IELTS Reading V2: Build Test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Teacher navigation')).not.toBeInTheDocument();
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('openStudio', expect.objectContaining({ mode: 'create-blank' })));
  });

  it('reuses one durable opening when StrictMode replays the route effect', async () => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/teacher/reading-v2/create']}>
          <Routes><Route path="/teacher/reading-v2/create" element={<ReadingV2StudioPage />} /></Routes>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByRole('main')).toHaveAttribute('data-mode', 'create-blank');
    await waitFor(() => expect([...durableRecords.keys()].filter((key) => key.includes('/drafts/'))).toHaveLength(1));
  });

  it('saves an import draft and restores its content, metadata, source context, and origin from its stable URL', async () => {
    const user = userEvent.setup();
    const { unmount } = renderRoute({
      pathname: '/teacher/reading-v2/import',
      state: {
        startMode: 'create-from-import',
        initialMetadata: { title: 'Route state title', ownerId: 'ignored-owner' },
        initialImportCandidate: {
          sourceKind: 'pasted-text',
          rawText: [
            '## Imported Reading passage',
            '',
            'Stable URL recovery keeps this imported passage in the durable canonical document.',
            '',
            '#### Questions 1-1',
            'Complete the sentence.',
            '**1** imported answer',
          ].join('\n'),
          answerKeyText: '1 teacher key',
          evidence: ['Stable URL test source'],
          uncertaintyMarkers: [],
          publishBlockingPlaceholders: [],
        },
      },
    }, '/teacher/reading-v2/import');

    expect(await screen.findByRole('heading', { name: 'Route state title' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    let draftId = '';
    await waitFor(() => {
      const call = navigateToMock.mock.calls.find(([route]) => route === 'TEACHER_READING_V2_DRAFT');
      draftId = (call?.[1] as { draftId?: string } | undefined)?.draftId ?? '';
      expect(draftId).not.toBe('');
      const saved = durableRecords.get(readingV2StoragePaths.drafts(draftId)) as ReadingV2DraftRecord | undefined;
      expect(saved?.studioMetadata).toMatchObject({ title: 'Route state title', ownerId: 'teacher-modal' });
      expect(saved?.workflowOrigin).toMatchObject({ mode: 'create-from-import' });
      expect(saved?.authoringContext?.origin.kind).toBe('import');
    });

    const saved = durableRecords.get(readingV2StoragePaths.drafts(draftId)) as ReadingV2DraftRecord;
    const sourceId = saved.authoringContext?.origin.kind === 'import' ? saved.authoringContext.origin.sourceId : '';
    expect(durableRecords.get(readingV2StoragePaths.provenance(sourceId))).toMatchObject({
      ownerId: 'teacher-modal',
      rawText: expect.stringContaining('Stable URL recovery keeps this imported passage'),
    });

    unmount();
    renderRoute(`/teacher/reading-v2/drafts/${draftId}`, '/teacher/reading-v2/drafts/:draftId');
    expect(await screen.findByRole('main')).toHaveAttribute('data-mode', 'create-from-import');
    expect(screen.getByRole('heading', { name: 'Route state title' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Passage editor' })).toHaveTextContent(
      'Stable URL recovery keeps this imported passage in the durable canonical document.',
    );
  });

  it('does not load a draft for a student session', async () => {
    currentAuthUid.value = 'student-1';
    useAuthMock.mockReturnValue({ user: { uid: 'student-1' }, profile: { role: 'student' }, loading: false, logout: vi.fn() });

    renderRoute('/teacher/reading-v2/drafts/private-draft', '/teacher/reading-v2/drafts/:draftId');

    expect(await screen.findByText('Sign in as a teacher to open Reading V2 Studio.')).toBeInTheDocument();
    expect(durableRecords.size).toBe(0);
  });

  it('shows a durable ownership error without exposing an editable foreign draft', async () => {
    const draft = seedDraft({
      draftId: readingV2Ids.draftId('foreign-draft'),
      ownerId: 'other-teacher',
      materialId: readingV2Ids.materialId('foreign-material'),
      document: createReadingV2CanonicalFixture('sentence-completion'),
      studioMetadata: { title: 'Private foreign draft', ownerId: 'other-teacher' },
    });

    renderRoute(`/teacher/reading-v2/drafts/${draft.draftId}`, '/teacher/reading-v2/drafts/:draftId');

    expect(await screen.findByText('Reading V2 draft is owned by another teacher.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Private foreign draft' })).not.toBeInTheDocument();
  });

  it('uses modal route-state metadata when opening a new Reading V2 Studio draft', async () => {
    renderRoute({
      pathname: '/teacher/reading-v2/create',
      state: {
        entryPoint: 'test-creation-modal',
        startMode: 'create-blank',
        initialMetadata: {
          title: 'Modal Route Metadata',
          durationMinutes: 40,
          difficulty: 'advanced',
          targetBand: 'Band 7.0',
          ownerId: 'teacher-modal',
          provenanceSummary: 'Started from Test Creation Modal metadata step',
        },
      },
    });

    expect(await screen.findByRole('heading', { name: 'Modal Route Metadata' })).toBeInTheDocument();
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('openStudio', expect.objectContaining({ mode: 'create-blank' })));
  });

  it('hydrates modal-prepared import candidates before the teacher reviews in Studio', async () => {
    renderRoute({
      pathname: '/teacher/reading-v2/import',
      state: {
        entryPoint: 'test-creation-modal',
        startMode: 'create-from-import',
        initialMetadata: {
          title: 'Modal Import Ready',
          ownerId: 'teacher-modal',
        },
        initialImportCandidate: {
          sourceKind: 'pasted-text',
          rawText: [
            '## Imported Reading passage',
            '',
            'This imported passage has enough text to become an editable Reading V2 passage paragraph after modal parsing.',
            '',
            '#### Questions 1-1',
            'Complete the sentence.',
            '**1** imported answer',
          ].join('\n'),
          answerKeyText: '1 teacher key',
          evidence: ['Detected source in modal'],
          uncertaintyMarkers: [],
          publishBlockingPlaceholders: [],
        },
      },
    }, '/teacher/reading-v2/import');

    expect(await screen.findByRole('main')).toHaveAttribute('data-mode', 'create-from-import');
    expect(screen.getByRole('heading', { name: 'Modal Import Ready' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Passage editor' })).toHaveTextContent(
      /This imported passage has enough text/,
    );
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('openStudio', expect.objectContaining({ mode: 'create-from-import' })));
  });

  it('uses Auto route state to label Auto V4 Studio imports', async () => {
    renderRoute({
      pathname: '/teacher/reading-v2/import',
      state: {
        entryPoint: 'test-creation-modal',
        startMode: 'create-from-auto',
        initialMetadata: {
          title: 'Auto Import Ready',
          ownerId: 'teacher-modal',
          provenanceSummary: 'Generated from Auto V4 import in Test Creation Modal',
        },
        initialImportCandidate: {
          sourceKind: 'auto-gemini',
          rawText: [
            '## Imported Reading passage',
            '',
            'This Auto V4 passage has enough text to become an editable Reading V2 passage paragraph after modal parsing.',
            '',
            '#### Questions 1-1',
            'Complete the sentence.',
            '**1** imported answer',
          ].join('\n'),
          answerKeyText: '1 teacher key',
          evidence: ['Detected source from Auto V4'],
          uncertaintyMarkers: [],
          publishBlockingPlaceholders: [],
        },
      },
    }, '/teacher/reading-v2/import');

    expect(await screen.findByRole('main')).toHaveAttribute('data-mode', 'create-from-auto');
    expect(screen.getByRole('heading', { name: 'Auto Import Ready' })).toBeInTheDocument();
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('openStudio', expect.objectContaining({ mode: 'create-from-auto' })));
  });

  it('returns teachers to the lobby after a successful publish', async () => {
    const user = userEvent.setup();
    const draft = seedDraft({
      draftId: readingV2Ids.draftId('publish-ready-draft'),
      ownerId: 'teacher-modal',
      materialId: readingV2Ids.materialId('publish-ready-material'),
      document: createReadingV2CanonicalFixture('sentence-completion'),
      studioMetadata: {
        title: 'Auto Publish Ready',
        ownerId: 'teacher-modal',
        visibility: 'private',
        provenanceSummary: 'Generated from Auto V4 import in Test Creation Modal',
      },
    });

    renderRoute({
      pathname: '/teacher/reading-v2/drafts/publish-ready-draft',
      state: {
        entryPoint: 'test-creation-modal',
        initialMetadata: {
          ownerId: 'teacher-modal',
        },
      },
    }, '/teacher/reading-v2/drafts/:draftId');

    await screen.findByRole('main');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(navigateToMock).toHaveBeenCalledWith(
      'LOBBY',
      undefined,
      expect.objectContaining({
        reason: 'reading_v2_studio_publish_success',
        replace: true,
      }),
    ));
    expect(trackActionMock).toHaveBeenCalledWith('publish', expect.objectContaining({ outcome: 'success' }));
  });

  it('announces the created master test and generated Reading Passages after full-test publish', async () => {
    const user = userEvent.setup();
    seedDraft({
      draftId: readingV2Ids.draftId('full-test-toast-draft'),
      ownerId: 'teacher-modal',
      materialId: readingV2Ids.materialId('full-test-toast-material'),
      document: createThreePassageDocument(),
      studioMetadata: {
        title: 'Full Test Toast Ready',
        ownerId: 'teacher-modal',
        visibility: 'private',
        provenanceSummary: 'Generated from full-test paste import',
      },
    });

    renderRoute({
      pathname: '/teacher/reading-v2/drafts/full-test-toast-draft',
      state: {
        entryPoint: 'test-creation-modal',
        initialMetadata: {
          ownerId: 'teacher-modal',
        },
      },
    }, '/teacher/reading-v2/drafts/:draftId');

    await screen.findByRole('main');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(toastSuccessSpy).toHaveBeenCalledTimes(4));
    expect(toastSuccessSpy).toHaveBeenCalledWith('Published "Full Test Toast Ready". It is now visible in My Content.');
    expect(toastSuccessSpy).toHaveBeenCalledWith('Created Reading Passage "Full Test Toast Ready: Passage 1" from "Full Test Toast Ready".');
    expect(toastSuccessSpy).toHaveBeenCalledWith('Created Reading Passage "Full Test Toast Ready: Passage 2" from "Full Test Toast Ready".');
    expect(toastSuccessSpy).toHaveBeenCalledWith('Created Reading Passage "Full Test Toast Ready: Passage 3" from "Full Test Toast Ready".');
  });

  it('does not report publish failure when post-publish reference discovery is denied', async () => {
    const user = userEvent.setup();
    discoverTargetsMock.mockRejectedValueOnce(new Error('PERMISSION_DENIED: Permission denied'));

    renderRoute(
      '/teacher/reading-v2/materials/single-passage-1/revise',
      '/teacher/reading-v2/materials/:materialId/revise',
    );

    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('data-mode', 'revise-published'));
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => expect(toastSuccessSpy).toHaveBeenCalledWith(
      'Published "Hydrated Published Reading V2". It is now visible in My Content.',
    ));
    expect(trackActionMock).toHaveBeenCalledWith('reading_v2_update_references_skipped', expect.objectContaining({
      materialId: 'single-passage-1',
      outcome: 'discovery-failed-after-publish',
    }));
    const persistedRevision = [...readingV2StudioRepository.store.drafts.values()]
      .find((draft) => draft.materialId === 'single-passage-1');
    expect(persistedRevision?.workflowOrigin?.publicationBase?.snapshotVersionId).toMatch(/^snapshot-/);
    const publishedBase = persistedRevision?.workflowOrigin?.publicationBase?.snapshotVersionId;
    const publishedRevision = persistedRevision?.revision ?? 0;
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => {
      const savedAgain = [...readingV2StudioRepository.store.drafts.values()]
        .find((draft) => draft.materialId === 'single-passage-1');
      expect(savedAgain?.revision).toBeGreaterThan(publishedRevision);
      expect(savedAgain?.workflowOrigin?.publicationBase?.snapshotVersionId).toBe(publishedBase);
    });
    expect(screen.queryByText(/Publish permission denied/i)).not.toBeInTheDocument();
  });

  it('opens Studio for localized duplicate structured-layout questions when the draft is canonical-safe', async () => {
    const duplicateAnchorPayload = [
      READING_V2_STRUCTURED_MATERIALS_START,
      '```json',
      JSON.stringify({
        sourceFile: 'cambridge-ielts-10-test-1-reading-table-1-3',
        materials: [
          {
            passageNumber: 1,
            title: 'Auto duplicate anchor import',
            passages: [
              {
                title: 'Auto duplicate anchor import',
                content: 'This Auto V4 passage has enough source text for duplicate anchor rejection.',
              },
            ],
            sectionInstructions: [
              {
                id: 'p1-q9-10',
                taskType: 'table-completion',
                text: 'Complete the table below.',
                questionRange: { start: 9, end: 10 },
                table: {
                  rows: [
                    [{ text: 'Feature', role: 'header' }, { text: 'Detail', role: 'header' }],
                    [{ text: 'First row' }, { text: 'First duplicate blank _____.', questionNumber: 9 }],
                    [{ text: 'Second row' }, { text: 'Second duplicate blank _____.', questionNumber: 9 }],
                    [{ text: 'Third row' }, { text: 'Valid second blank _____.', questionNumber: 10 }],
                  ],
                },
              },
            ],
            questions: [
              { questionNumber: 9, type: 'table-completion', sectionInstructionId: 'p1-q9-10', questionText: 'First duplicate blank.' },
              { questionNumber: 10, type: 'table-completion', sectionInstructionId: 'p1-q9-10', questionText: 'Valid second blank.' },
            ],
          },
        ],
      }),
      '```',
      READING_V2_STRUCTURED_MATERIALS_END,
    ].join('\n');

    renderRoute({
      pathname: '/teacher/reading-v2/import',
      state: {
        entryPoint: 'test-creation-modal',
        startMode: 'create-from-auto',
        initialMetadata: {
          title: 'Auto Duplicate Anchor Import',
          ownerId: 'teacher-modal',
        },
        initialImportCandidate: {
          sourceKind: 'auto-gemini',
          rawText: duplicateAnchorPayload,
          answerKeyText: ['9 alpha', '10 beta'].join('\n'),
          evidence: ['Detected source from Auto V4'],
          uncertaintyMarkers: [],
          publishBlockingPlaceholders: [],
        },
      },
    }, '/teacher/reading-v2/import');

    expect(await screen.findByRole('main')).toHaveAttribute('data-mode', 'create-from-auto');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('IELTS Reading V2: Build Test')).toBeInTheDocument();
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith(
      'openStudio',
      expect.objectContaining({
        mode: 'create-from-auto',
      }),
    ));
    expect(trackActionMock).not.toHaveBeenCalledWith(
      'studioImportCandidateRejected',
      expect.anything(),
    );
  });

  it('resolves import, draft, and revision routes without separate Studio products', async () => {
    renderRoute({
      pathname: '/teacher/reading-v2/import',
      state: {
        initialImportCandidate: {
          sourceKind: 'pasted-text',
          rawText: [
            '## Route entry passage',
            '',
            'A route entry needs its supplied import source before the durable draft can open.',
            '',
            '#### Questions 1-1',
            'Complete the sentence.',
            '**1** answer',
          ].join('\n'),
          answerKeyText: '1 answer',
          evidence: [],
          uncertaintyMarkers: [],
          publishBlockingPlaceholders: [],
        },
      },
    }, '/teacher/reading-v2/import');
    expect(await screen.findByRole('main')).toHaveAttribute('data-mode', 'create-from-import');

    seedDraft({
      draftId: readingV2Ids.draftId('draft-1'),
      ownerId: 'teacher-modal',
      materialId: readingV2Ids.materialId('draft-material-1'),
      document: createReadingV2CanonicalFixture('sentence-completion'),
      studioMetadata: { title: 'Resumed Page Draft', ownerId: 'teacher-modal' },
    });
    renderRoute('/teacher/reading-v2/drafts/draft-1', '/teacher/reading-v2/drafts/:draftId');
    await waitFor(() => expect(screen.getAllByRole('main')[1]).toHaveAttribute('data-mode', 'resume-draft'));

    renderRoute('/teacher/reading-v2/materials/material-1/revise', '/teacher/reading-v2/materials/:materialId/revise');
    await waitFor(() => expect(screen.getAllByRole('main')[2]).toHaveAttribute('data-mode', 'revise-published'));
    expect(screen.getAllByText('Hydrated Published Reading V2').length).toBeGreaterThan(0);
  });

  it('keeps Studio route URLs default-closed when rollout is explicitly off', () => {
    const paths = createTeacherRoutes({ exposeReadingV2StudioRoutes: false }).map((route) => route.path);

    expect(paths).not.toContain('/teacher/reading-v2/create');
    expect(paths).not.toContain('/teacher/reading-v2/import');
    expect(paths).not.toContain('/teacher/reading-v2/drafts/:draftId');
    expect(paths).not.toContain('/teacher/reading-v2/materials/:materialId/revise');
  });

  it('mounts all four teacher route entries only when rollout allows teacher exposure', () => {
    const paths = createTeacherRoutes({ exposeReadingV2StudioRoutes: true }).map((route) => route.path);

    expect(paths).toContain('/teacher/reading-v2/create');
    expect(paths).toContain('/teacher/reading-v2/import');
    expect(paths).toContain('/teacher/reading-v2/drafts/:draftId');
    expect(paths).toContain('/teacher/reading-v2/materials/:materialId/revise');
  });
});
