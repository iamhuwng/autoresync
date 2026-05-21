import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReadingV2StudioPage from './ReadingV2StudioPage';
import { createTeacherRoutes } from '../routes/teacherRoutes';

const trackActionMock = vi.fn();

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: () => ({
    trackAction: trackActionMock,
  }),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: vi.fn(),
    handleSessionChange: vi.fn(),
    handleTestChange: vi.fn(),
    currentPath: '/',
    isNavigating: false,
    navigationHistory: [],
    context: {},
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
          ownerId: 'teacher-1',
          deliveryEngine: 'reading-v2',
          productLabel: 'Reading V2',
          title: document.title,
          materialKind: 'full-test',
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
          ownerId: 'teacher-1',
          document,
          publishedAt: '2026-04-29T00:00:00.000Z',
          publishedBy: 'teacher-1',
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

describe('ReadingV2StudioPage', () => {
  beforeEach(() => {
    trackActionMock.mockClear();
  });

  it('resolves create route into the shared Studio shell', async () => {
    renderRoute('/teacher/reading-v2/create');

    expect(await screen.findByRole('main')).toHaveAttribute('data-mode', 'create-blank');
    expect(screen.getByText('IELTS Reading V2: Build Test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeInTheDocument();
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('openStudio', expect.objectContaining({ mode: 'create-blank' })));
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
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('openStudio', expect.objectContaining({
      mode: 'create-blank',
      entryPoint: 'test-creation-modal',
      startMode: 'create-blank',
    })));
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
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('openStudio', expect.objectContaining({
      mode: 'create-from-import',
      entryPoint: 'test-creation-modal',
      startMode: 'create-from-import',
    })));
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
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('openStudio', expect.objectContaining({
      mode: 'create-from-auto',
      entryPoint: 'test-creation-modal',
      startMode: 'create-from-auto',
    })));
    await waitFor(() => expect(trackActionMock).toHaveBeenCalledWith('startAutoImportMaterial', expect.objectContaining({
      mode: 'create-from-auto',
      entryPoint: 'test-creation-modal',
    })));
  });

  it('resolves import, draft, and revision routes without separate Studio products', async () => {
    renderRoute('/teacher/reading-v2/import', '/teacher/reading-v2/import');
    expect(screen.getByRole('main')).toHaveAttribute('data-mode', 'create-from-import');

    renderRoute('/teacher/reading-v2/drafts/draft-1', '/teacher/reading-v2/drafts/:draftId');
    expect(screen.getAllByRole('main')[1]).toHaveAttribute('data-mode', 'resume-draft');

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
