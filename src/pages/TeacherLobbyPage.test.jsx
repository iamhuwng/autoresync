import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherLobbyPage from './TeacherLobbyPage';
import { ToastContainer, toast } from '../components/modern/ToastNotification';
import { createReadingV2CanonicalFixture } from '../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { readingV2StoragePaths } from '../services/reading-v2/readingV2StoragePaths.service';

const mocks = vi.hoisted(() => ({
  tests: [],
  drafts: [],
  navigateTo: vi.fn(),
  logout: vi.fn(),
  trackAction: vi.fn(),
  refreshTests: vi.fn(),
  refreshDrafts: vi.fn(),
  deleteTest: vi.fn(),
  deleteDraft: vi.fn(),
  openEditTest: vi.fn(),
  openEditThcsTest: vi.fn(),
  openTestCreation: vi.fn(),
  openUseAsIs: vi.fn(),
  openHwDialog: vi.fn(),
  startSession: vi.fn(),
  listReadingPassages: vi.fn(),
  listTeacherBooks: vi.fn(),
  listBookNodes: vi.fn(),
  createBookDraft: vi.fn(),
  updateBookMetadata: vi.fn(),
  confirm: vi.fn(),
  homeworkModalProps: [],
  useAsIsTest: null,
  closeUseAsIs: vi.fn(),
  logDiagnostic: vi.fn(),
  loadedScope: 'owned',
  locationState: null,
  dbReads: {},
  dbWrites: [],
  masterModalProps: [],
  capabilities: {
    canUseTestTypeBlocks: true,
    canManageAdminTestTypes: true,
    canUseReadingPassageLibrary: true,
    canAssignReadingPassageHomework: true,
    canUseMaterialBooks: true,
    canUseMaterialBookEditor: true,
  },
}));

vi.mock('../config/readingV2FeatureFlags', async () => {
  const actual = await vi.importActual('../config/readingV2FeatureFlags');

  return {
    ...actual,
    getTeacherMaterialsCapabilities: () => mocks.capabilities,
  };
});

vi.mock('firebase/database', () => ({
  ref: (_database, path = '') => path,
  get: vi.fn(async (path) => ({ val: () => mocks.dbReads[path] ?? null })),
  set: vi.fn(async (path, value) => {
    mocks.dbWrites.push({ path, value });
  }),
  update: vi.fn(async (_path, updates) => {
    Object.entries(updates).forEach(([path, value]) => {
      mocks.dbWrites.push({ path, value });
    });
  }),
  remove: vi.fn(async (path) => {
    mocks.dbWrites.push({ path, value: null });
  }),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('../services/homeworkAssignmentClient', () => ({
  createHomeworkAssignmentViaWorker: vi.fn(async () => 'homework-worker-1'),
}));

vi.mock('../services/reading-v2/readingV2PassageLibrary.service', async () => {
  const actual = await vi.importActual('../services/reading-v2/readingV2PassageLibrary.service');

  return {
    ...actual,
    listTeacherReadingPassages: (...args) => mocks.listReadingPassages(...args),
  };
});

vi.mock('../services/materialCatalog/materialBooks.service', () => ({
  createMaterialBooksRepository: vi.fn(() => ({ repositoryKind: 'mock-books-repository', listBookNodes: mocks.listBookNodes })),
  listTeacherBooks: (...args) => mocks.listTeacherBooks(...args),
  createBookDraft: (...args) => mocks.createBookDraft(...args),
  updateBookMetadata: (...args) => mocks.updateBookMetadata(...args),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({}),
    useLocation: () => ({ pathname: '/lobby', state: mocks.locationState }),
    useSearchParams: () => [new URLSearchParams(''), vi.fn()],
  };
});

vi.mock('@mantine/core', () => {
  const AppShell = ({ children }) => <div data-testid="app-shell">{children}</div>;
  AppShell.Main = ({ children }) => <main>{children}</main>;
  return { AppShell };
});

vi.mock('../utils/lazyWithRetry.ts', () => ({
  lazyWithRetry: () => function MockLazyComponent() {
    return <div data-testid="legacy-lazy-component">Legacy lazy component</div>;
  },
}));

vi.mock('../utils/teacherMaterialsDiagnostics', () => ({
  getTeacherMaterialsDiagnosticTime: () => 0,
  getTeacherMaterialsElapsedMs: () => 9,
  logTeacherMaterialsDiagnostic: (event, payload) => mocks.logDiagnostic(event, payload),
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: () => ({ navigateTo: mocks.navigateTo }),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 'teacher@test.com' },
    profile: { role: 'teacher', email: 'teacher@test.com', displayName: 'Teacher' },
    logout: mocks.logout,
  }),
}));

vi.mock('../hooks/useFeatureTracking', () => ({
  useFeatureTracking: (featureId) => ({
    trackAction: (action, metadata) => mocks.trackAction(featureId, action, metadata),
  }),
}));

vi.mock('../hooks/useModalManager', () => ({
  useModalManager: () => ({
    state: {
      editTest: { show: false, test: null },
      editThcsTest: { show: false, test: null },
      testCreation: { show: false },
      hwDialog: { show: false, test: null },
      useAsIs: { show: Boolean(mocks.useAsIsTest), test: mocks.useAsIsTest },
    },
    openEditTest: mocks.openEditTest,
    closeEditTest: vi.fn(),
    openEditThcsTest: mocks.openEditThcsTest,
    closeEditThcsTest: vi.fn(),
    openTestCreation: mocks.openTestCreation,
    closeTestCreation: vi.fn(),
    openUseAsIs: mocks.openUseAsIs,
    closeUseAsIs: mocks.closeUseAsIs,
    openHwDialog: mocks.openHwDialog,
    closeHwDialog: vi.fn(),
  }),
}));

vi.mock('../hooks/test/useTeacherTests', () => ({
  useTeacherTests: () => ({
    tests: mocks.tests,
    loading: false,
    loadedScope: mocks.loadedScope,
    deleteTest: mocks.deleteTest,
    togglePublic: vi.fn(),
    refresh: mocks.refreshTests,
  }),
}));

vi.mock('../hooks/thcs/useTeacherDrafts', () => ({
  useTeacherDrafts: () => ({
    drafts: mocks.drafts,
    loading: false,
    error: null,
    deleteDraft: mocks.deleteDraft,
    refreshDrafts: mocks.refreshDrafts,
  }),
}));

vi.mock('../hooks/session/useSessionManager', () => ({
  useSessionManager: () => ({
    sessionLoading: false,
    sessionError: null,
    sessionData: null,
    classes: [],
    selectedClassId: '',
    setSelectedClassId: vi.fn(),
    showClassModal: false,
    cancelSession: vi.fn(),
    confirmSession: vi.fn(),
    pendingSession: null,
    isListening: false,
    selectedAudioMode: 'speaker',
    setSelectedAudioMode: vi.fn(),
    setShowAudioModeError: vi.fn(),
    lastUsedAudioMode: null,
    showAudioModeError: false,
    examMode: 'standard',
    setExamMode: vi.fn(),
    startSession: mocks.startSession,
  }),
}));

vi.mock('../components/navigation', () => ({
  TeacherHeader: () => <header data-testid="teacher-header">Teacher Header</header>,
}));

vi.mock('../components/modern', async () => {
  const actual = await vi.importActual('../components/modern');
  return {
    ...actual,
    Card: ({ children, className = '' }) => <section className={className}>{children}</section>,
    CardBody: ({ children, className = '' }) => <div className={className}>{children}</div>,
  };
});

vi.mock('../components/modern/TestCard', () => ({
  default: ({ test, onEdit, onStartTest }) => (
    <article data-testid={`test-card-${test.id}`}>
      <h2>{test.title || test.metadata?.title || 'Untitled Test'}</h2>
      <button type="button" onClick={() => onEdit(test)}>Edit</button>
      <button type="button" onClick={() => onStartTest(test.id)}>Start</button>
    </article>
  ),
}));

vi.mock('../components/modern/ThcsTestCard', () => ({
  default: ({ test, onEdit }) => (
    <article data-testid={`thcs-card-${test.id}`}>
      <h2>{test.metadata?.title || test.title || 'THCS Test'}</h2>
      <button type="button" onClick={() => onEdit(test)}>Edit</button>
    </article>
  ),
}));

vi.mock('../components/modern/DraftCard', () => ({
  default: ({ draft, onResume, onDelete, selection }) => (
    <article data-testid={`draft-card-${draft.id}`}>
      {selection && (
        <button type="button" aria-pressed={selection.checked} onClick={selection.onChange}>
          {selection.label}
        </button>
      )}
      <h2>{draft.metadata?.title || 'Untitled Draft'}</h2>
      <button type="button" onClick={() => onResume(draft)}>Resume Editing</button>
      <button type="button" onClick={() => onDelete(draft)}>Delete Draft</button>
    </article>
  ),
}));

vi.mock('../components/modern/ContentTabs', () => ({
  default: ({ activeTab, onTabChange }) => (
    <nav className="content-tabs" aria-label="Teacher lobby content tabs" data-active-tab={activeTab} role="tablist">
      <button type="button" role="tab" onClick={() => onTabChange('my')}>My Content</button>
      <button type="button" role="tab" onClick={() => onTabChange('public')}>Public Library</button>
      <button type="button" role="tab" onClick={() => onTabChange('drafts')}>Drafts</button>
      <button type="button" role="tab" onClick={() => onTabChange('reading-passage')}>Reading Passage</button>
      <button type="button" role="tab" onClick={() => onTabChange('book')}>Book</button>
    </nav>
  ),
}));

vi.mock('../components/modern/SearchFilterBar', () => ({
  default: ({
    searchTerm = '',
    onSearchChange,
    onTestTypeFilterChange,
    onCreateNew,
    createLabel = 'Create New Test',
    showCreateButton = true,
    visibilityScope,
    onVisibilityScopeChange,
    visibilityLabel = 'Visibility',
    visibilityScopeOptions,
  }) => (
    <div data-testid="search-filter-bar">
      <label htmlFor="materials-search">Search</label>
      <input
        id="materials-search"
        value={searchTerm}
        onChange={(event) => onSearchChange?.(event.target.value)}
      />
      <button type="button" onClick={() => onTestTypeFilterChange?.('ielts')}>Filter IELTS</button>
      <button type="button" onClick={() => onTestTypeFilterChange?.('all')}>Clear Test Type</button>
      {visibilityScope && (
        <div role="group" aria-label={visibilityLabel}>
          {(visibilityScopeOptions || [
            { value: 'private', label: 'Private' },
            { value: 'public', label: 'Public' },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              aria-pressed={visibilityScope === option.value}
              onClick={() => onVisibilityScopeChange?.(option.value)}
            />
          ))}
        </div>
      )}
      {showCreateButton && (
        <button type="button" onClick={onCreateNew}>{createLabel}</button>
      )}
    </div>
  ),
}));

vi.mock('../components/modern/MaterialListView', () => ({
  default: ({ rows }) => (
    <section data-testid="material-list-view">
      {rows.map((row) => (
        <article
          key={row.id}
          data-testid={`material-list-row-${row.id}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              row.selection?.onChange?.();
            }
          }}
        >
          <h2>{row.title}</h2>
          {row.badges?.map((badge) => (
            <span key={badge.key}>{badge.label}</span>
          ))}
          {row.selection && (
            <button
              type="button"
              aria-label={row.selection.label}
              aria-pressed={row.selection.checked}
              onClick={row.selection.onChange}
            >
              {row.selection.checked ? 'Selected' : 'Select'}
            </button>
          )}
          {row.actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              onClick={action.onSelect}
            >
              {action.label}
            </button>
          ))}
        </article>
      ))}
    </section>
  ),
}));

vi.mock('../hooks/test/useTestFilters', () => ({
  useTestFilters: (tests, filters) => ({
    filteredTests: tests.filter((test) => {
      const title = test.metadata?.title || test.title || '';
      return title.toLowerCase().includes((filters.searchTerm || '').toLowerCase());
    }),
  }),
}));

vi.mock('../components/SessionBanner', () => ({
  default: () => null,
}));

vi.mock('../components/ClassSelectionModal', () => ({
  default: () => null,
}));

vi.mock('../components/UseAsIsModal', () => ({
  default: ({ test, opened, onAssignHomework }) => (
    opened ? (
      <div role="dialog" aria-label="Use Test As-Is">
        <button type="button" onClick={() => onAssignHomework(test)}>Assign as Homework</button>
      </div>
    ) : null
  ),
}));

vi.mock('../components/homework/HomeworkCreateModal', () => ({
  HomeworkCreateModal: (props) => {
    mocks.homeworkModalProps.push(props);
    const title = props.preselectedReadingPassage?.title
      || props.preselectedReadingPassageSet?.title
      || 'No Reading Passage';

    return props.isOpen ? (
      <div role="dialog" aria-label="Create Homework Assignment">
        <h2>Create Homework Assignment</h2>
        <p>{title}</p>
        <button type="button" onClick={props.onClose}>Close HomeworkCreateModal</button>
        <button type="button" onClick={props.onSuccess}>Homework success</button>
      </div>
    ) : null;
  },
}));

vi.mock('../components/reading-v2/master/ReadingV2MasterEditModal', () => ({
  ReadingV2MasterEditModal: (props) => {
    mocks.masterModalProps.push(props);
    return props.open ? (
      <div role="dialog" aria-label="Edit Reading V2 master">
        <h2>{props.mode === 'draft' ? 'Unpublished draft' : 'Published master'}</h2>
        <p>{props.master?.title || props.master?.metadata?.title || 'Untitled master'}</p>
        <button type="button" onClick={props.onClose}>Close master modal</button>
        <button
          type="button"
          onClick={() => props.onPublish({
            master: props.master,
            mode: props.mode,
            passageRefs: props.master?.passageRefs ?? [],
            title: props.master?.title || props.master?.metadata?.title || 'Untitled master',
            visibility: props.master?.visibility || 'private',
          })}
        >
          Publish Master
        </button>
      </div>
    ) : null;
  },
}));

const readingPassageSnapshotFor = (materialId, snapshotVersionId) => ({
  snapshotVersionId,
  materialId,
  ownerId: 'teacher-1',
  document: createReadingV2CanonicalFixture('sentence-completion'),
  publishedAt: '2026-06-01T00:00:00.000Z',
  publishedBy: 'teacher-1',
});

const renderTeacherLobbyWithToasts = () => render(
  <>
    <TeacherLobbyPage />
    <ToastContainer />
  </>,
);

describe('TeacherLobbyPage Reading V2 integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.clear();
    mocks.tests = [];
    mocks.drafts = [];
    mocks.loadedScope = 'owned';
    mocks.locationState = null;
    mocks.dbReads = {};
    mocks.dbWrites = [];
    mocks.useAsIsTest = null;
    mocks.capabilities = {
      canUseTestTypeBlocks: true,
      canManageAdminTestTypes: true,
      canUseReadingPassageLibrary: true,
      canAssignReadingPassageHomework: true,
      canUseMaterialBooks: true,
      canUseMaterialBookEditor: true,
    };
    mocks.homeworkModalProps = [];
    mocks.masterModalProps = [];
    mocks.closeUseAsIs.mockReset();
    mocks.listReadingPassages.mockResolvedValue([]);
    mocks.listTeacherBooks.mockResolvedValue([]);
    mocks.listBookNodes.mockResolvedValue([]);
    mocks.createBookDraft.mockReset();
    mocks.updateBookMetadata.mockReset();
    mocks.deleteTest.mockReset();
    mocks.deleteDraft.mockReset();
    mocks.refreshTests.mockReset();
    mocks.refreshDrafts.mockReset();
    mocks.confirm.mockReturnValue(true);
    vi.spyOn(window, 'confirm').mockImplementation(mocks.confirm);
  });

  it('opens standard homework modal for assignable IELTS materials with normalized contentRef', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'ielts-reading-1',
        title: 'IELTS Reading Practice',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        status: 'published',
        isComplete: true,
        deliveryProjectionReady: true,
        questions: [{ id: 'q1' }],
      },
    ];

    renderTeacherLobbyWithToasts();

    const row = await screen.findByTestId('material-list-row-ielts-reading-1');
    await user.click(within(row).getByRole('button', { name: 'Assign HW' }));

    expect(screen.getByRole('dialog', { name: /Create Homework Assignment/i })).toBeInTheDocument();
    expect(mocks.homeworkModalProps.at(-1)).toEqual(expect.objectContaining({
      preselectedMaterialId: 'ielts-reading-1',
      preselectedMaterialFilter: 'test',
      preselectedContentRef: expect.objectContaining({
        contentKind: 'ielts_reading',
        contentId: 'ielts-reading-1',
      }),
      createHomeworkAssignment: expect.any(Function),
    }));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'assignHomework',
      expect.objectContaining({
        contentKind: 'ielts_reading',
        materialId: 'ielts-reading-1',
      }),
    );
  });

  it('surfaces single material delete failures in a toast', async () => {
    const user = userEvent.setup();
    mocks.deleteTest.mockRejectedValueOnce(new Error('Summary write failed'));
    mocks.tests = [
      {
        id: 'delete-failure-test',
        title: 'Delete Failure Test',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        status: 'published',
        isComplete: true,
        hasStudentSafeProjection: true,
      },
    ];

    renderTeacherLobbyWithToasts();

    const row = await screen.findByTestId('material-list-row-delete-failure-test');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    expect(mocks.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Delete Failure Test"?');
    await waitFor(() => {
      expect(screen.getByText('Summary write failed').closest('.toast-card')).toBeInTheDocument();
    });
    expect(mocks.deleteTest).toHaveBeenCalledWith(expect.objectContaining({ id: 'delete-failure-test' }));
  });

  it('assigns one selected My Content test from the bulk toolbar', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'ielts-reading-bulk',
        title: 'Bulk IELTS Reading',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        status: 'published',
        isComplete: true,
        deliveryProjectionReady: true,
        questions: [{ id: 'q1' }],
      },
    ];

    renderTeacherLobbyWithToasts();

    const row = await screen.findByTestId('material-list-row-ielts-reading-bulk');
    await user.click(row);

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Assign homework' }));

    expect(screen.getByRole('dialog', { name: /Create Homework Assignment/i })).toBeInTheDocument();
    expect(mocks.homeworkModalProps.at(-1)).toEqual(expect.objectContaining({
      preselectedMaterialId: 'ielts-reading-bulk',
      preselectedContentRef: expect.objectContaining({
        contentKind: 'ielts_reading',
        contentId: 'ielts-reading-bulk',
      }),
    }));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'assignSelectedMaterials',
      expect.objectContaining({ count: 1, materialKind: 'test' }),
    );
  });

  it('shows selected-material assignment toolbar on Public Library rows', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'public-thcs-bulk',
        testType: 'THCS-THPT',
        title: 'Public THCS Bulk',
        metadata: {
          title: 'Public THCS Bulk',
          gradeLevel: 10,
        },
        ownerId: 'teacher-2',
        isPublic: true,
        status: 'published',
        published: true,
        isComplete: true,
        questionCount: 20,
        questions: [{ id: 'q1' }],
      },
    ];

    renderTeacherLobbyWithToasts();

    await user.click(screen.getByRole('tab', { name: 'Public Library' }));
    const row = await screen.findByTestId('material-list-row-public-thcs-bulk');
    await user.click(row);

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign homework' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Delete selected' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Assign homework' }));

    expect(mocks.openHwDialog).toHaveBeenCalledWith(expect.objectContaining({
      id: 'public-thcs-bulk',
      _assignmentContentRef: expect.objectContaining({
        contentKind: 'thcs_test',
        contentId: 'public-thcs-bulk',
        title: 'Public THCS Bulk',
      }),
    }));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'assignSelectedMaterials',
      expect.objectContaining({ count: 1, materialKind: 'test' }),
    );
  });

  it('deletes selected My Content tests from the bulk toolbar', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'delete-test-a',
        title: 'Delete Test A',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        status: 'published',
        isComplete: true,
        hasStudentSafeProjection: true,
      },
      {
        id: 'delete-test-b',
        title: 'Delete Test B',
        testType: 'IELTS',
        skill: 'Listening',
        ownerId: 'teacher-1',
        status: 'published',
        isComplete: true,
        deliveryProjectionReady: true,
      },
    ];

    renderTeacherLobbyWithToasts();

    const rowA = await screen.findByTestId('material-list-row-delete-test-a');
    const rowB = await screen.findByTestId('material-list-row-delete-test-b');
    await user.click(rowA);
    await user.click(rowB);

    await user.click(screen.getByRole('button', { name: 'Delete selected' }));

    expect(mocks.confirm).toHaveBeenCalledWith('Delete 2 selected tests? This cannot be undone.');
    await waitFor(() => {
      expect(mocks.deleteTest).toHaveBeenCalledTimes(2);
    });
    expect(mocks.deleteTest).toHaveBeenCalledWith(expect.objectContaining({ id: 'delete-test-a' }));
    expect(mocks.deleteTest).toHaveBeenCalledWith(expect.objectContaining({ id: 'delete-test-b' }));
    expect(mocks.refreshTests).toHaveBeenCalled();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'deleteSelectedMaterials',
      expect.objectContaining({ count: 2, materialKind: 'test' }),
    );
  });

  it('separates simple test delete from Reading V2 master removal review in mixed selection', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'simple-delete-test',
        title: 'Simple Delete Test',
        testType: 'IELTS',
        skill: 'Listening',
        ownerId: 'teacher-1',
        status: 'published',
        isComplete: true,
        deliveryProjectionReady: true,
      },
      {
        id: 'reading-master-delete',
        materialId: 'reading-master-delete',
        title: 'Reading Master Delete',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        compositionId: 'composition-reading-master-delete',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        status: 'published',
        isComplete: true,
        publishedSnapshotVersionId: 'snapshot-reading-master-delete',
        hasStudentSafeProjection: true,
        passageRefs: [
          {
            passageMaterialId: 'passage-linked',
            ownerId: 'teacher-1',
            title: 'Linked Passage',
          },
        ],
      },
    ];

    renderTeacherLobbyWithToasts();

    await user.click(await screen.findByTestId('material-list-row-simple-delete-test'));
    await user.click(await screen.findByTestId('material-list-row-reading-master-delete'));

    expect(screen.getByRole('button', { name: 'Delete simple selected' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review Reading V2 removal' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete simple selected' }));
    expect(mocks.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Simple Delete Test"?');
    await waitFor(() => {
      expect(mocks.deleteTest).toHaveBeenCalledWith(expect.objectContaining({ id: 'simple-delete-test' }));
    });
    expect(mocks.deleteTest).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'reading-master-delete' }));

    await user.click(screen.getByRole('button', { name: 'Review Reading V2 removal' }));

    expect(await screen.findByRole('dialog', { name: 'Remove Reading V2 master?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove master only' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove master and linked passages' })).toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'master_delete_requested',
      expect.objectContaining({ source: 'teacher_materials_selection_toolbar' }),
    );
  });

  it('shows Assign HW for owned My Content IELTS Reading enriched with student-safe projection metadata', async () => {
    mocks.tests = [
      {
        id: 'ielts-reading-owned',
        title: 'Owned IELTS Reading',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        isPublic: false,
        status: 'published',
        isComplete: true,
        questionCount: 40,
        // Shape produced by getTeacherOwnedTests after student_safe_tests enrichment.
        hasStudentSafeProjection: true,
        metadata: { hasStudentSafeProjection: true },
      },
    ];

    render(<TeacherLobbyPage />);

    const row = await screen.findByTestId('material-list-row-ielts-reading-owned');
    expect(within(row).getByRole('button', { name: 'Assign HW' })).toBeInTheDocument();
  });

  it('shows Assign HW for owned My Content IELTS Listening enriched with student-safe projection metadata', async () => {
    mocks.tests = [
      {
        id: 'ielts-listening-owned',
        title: 'Owned IELTS Listening',
        testType: 'IELTS',
        skill: 'Listening',
        ownerId: 'teacher-1',
        isPublic: false,
        status: 'published',
        isComplete: true,
        questionCount: 10,
        deliveryProjectionReady: true,
        metadata: { deliveryProjectionReady: true },
      },
    ];

    render(<TeacherLobbyPage />);

    const row = await screen.findByTestId('material-list-row-ielts-listening-owned');
    expect(within(row).getByRole('button', { name: 'Assign HW' })).toBeInTheDocument();
  });

  it('shows Assign HW for thin owned legacy Reading and Listening rows after safe projection enrichment', async () => {
    mocks.tests = [
      {
        id: 'reading-thin-owned',
        title: 'Thin Owned Reading',
        skill: 'Reading',
        ownerId: 'teacher-1',
        isPublic: false,
        status: 'published',
        isComplete: true,
        questionCount: 40,
        hasStudentSafeProjection: true,
      },
      {
        id: 'listening-thin-owned',
        title: 'Thin Owned Listening',
        skill: 'Listening',
        ownerId: 'teacher-1',
        isPublic: false,
        status: 'published',
        isComplete: true,
        questionCount: 10,
        deliveryProjectionReady: true,
      },
    ];

    render(<TeacherLobbyPage />);

    const readingRow = await screen.findByTestId('material-list-row-reading-thin-owned');
    expect(within(readingRow).getByRole('button', { name: 'Assign HW' })).toBeInTheDocument();

    const listeningRow = await screen.findByTestId('material-list-row-listening-thin-owned');
    expect(within(listeningRow).getByRole('button', { name: 'Assign HW' })).toBeInTheDocument();
  });

  it('shows Assign HW for owned My Content Reading V2 IELTS Reading enriched from its namespaced projection', async () => {
    mocks.tests = [
      {
        id: 'reading-v2-owned',
        materialId: 'reading-v2-owned',
        title: 'Owned Reading V2',
        testType: 'IELTS',
        skill: 'Reading',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        ownerId: 'teacher-1',
        isPublic: false,
        status: 'published',
        questionCount: 40,
        publishedSnapshotVersionId: 'snapshot-owned',
        hasStudentSafeProjection: true,
        deliveryProjectionReady: true,
        studentSafeProjectionReady: true,
        passageRefCount: 3,
        metadata: {
          materialKind: 'full-test',
          publishedSnapshotVersionId: 'snapshot-owned',
          hasStudentSafeProjection: true,
          deliveryProjectionReady: true,
          studentSafeProjectionReady: true,
          passageRefCount: 3,
        },
      },
    ];

    render(<TeacherLobbyPage />);

    const row = await screen.findByTestId('material-list-row-reading-v2-owned');
    expect(within(row).getByRole('button', { name: 'Assign HW' })).toBeInTheDocument();
  });

  it('hides Assign HW for owned My Content IELTS Reading/Listening without a student-safe projection', async () => {
    mocks.tests = [
      {
        id: 'ielts-reading-unsafe',
        title: 'Unsafe Owned Reading',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        isPublic: false,
        status: 'published',
        isComplete: true,
        questionCount: 40,
        metadata: {},
      },
      {
        id: 'ielts-listening-unsafe',
        title: 'Unsafe Owned Listening',
        testType: 'IELTS',
        skill: 'Listening',
        ownerId: 'teacher-1',
        isPublic: false,
        status: 'published',
        isComplete: true,
        questionCount: 10,
        metadata: {},
      },
    ];

    render(<TeacherLobbyPage />);

    await screen.findByTestId('material-list-row-ielts-reading-unsafe');

    const readingRow = screen.getByTestId('material-list-row-ielts-reading-unsafe');
    expect(within(readingRow).queryByRole('button', { name: 'Assign HW' })).not.toBeInTheDocument();

    const listeningRow = screen.getByTestId('material-list-row-ielts-listening-unsafe');
    expect(within(listeningRow).queryByRole('button', { name: 'Assign HW' })).not.toBeInTheDocument();
  });

  it('opens THCS homework dialog with normalized contentRef from Use as-is assignment', async () => {
    const user = userEvent.setup();
    mocks.useAsIsTest = {
      id: 'public-thcs-1',
      testType: 'THCS-THPT',
      title: 'Public THCS Practice',
      metadata: {
        title: 'Public THCS Practice',
        gradeLevel: 10,
      },
      ownerId: 'teacher-2',
      isPublic: true,
      status: 'published',
      published: true,
      isComplete: true,
      questionCount: 20,
      questions: [{ id: 'q1' }],
    };

    renderTeacherLobbyWithToasts();

    await user.click(screen.getByRole('button', { name: /Assign as Homework/i }));

    expect(mocks.closeUseAsIs).toHaveBeenCalled();
    expect(mocks.openHwDialog).toHaveBeenCalledWith(expect.objectContaining({
      id: 'public-thcs-1',
      _assignmentContentRef: expect.objectContaining({
        contentKind: 'thcs_test',
        contentId: 'public-thcs-1',
        title: 'Public THCS Practice',
      }),
    }));
  });

  it('keeps the unified TeacherHeader attached to the page root', () => {
    const { container } = render(<TeacherLobbyPage />);
    const pageRoot = container.firstElementChild;
    const teacherHeader = screen.getByTestId('teacher-header');

    expect(teacherHeader.parentElement).toBe(pageRoot);
    expect(pageRoot.firstElementChild).toBe(teacherHeader);
    expect(teacherHeader.nextElementSibling?.tagName).toBe('MAIN');
  });

  it('renders Test Type controls above attached content tabs without changing the left subtitle block', () => {
    const { container } = render(<TeacherLobbyPage />);

    const subtitle = screen.getByText('Manage your tests and start formal assessment sessions');
    const tabNav = screen.getByRole('tablist', { name: 'Teacher lobby content tabs' });
    const header = container.querySelector('.teacher-lobby-page-header');
    const subhead = container.querySelector('.teacher-lobby-page-subhead');
    const controls = container.querySelector('.teacher-lobby-header-controls');
    const testTypeDock = container.querySelector('.teacher-lobby-test-type-dock');
    const tabDock = container.querySelector('.teacher-lobby-content-tab-dock');
    const searchCard = container.querySelector('.teacher-materials-search-card');

    expect(subtitle).toBeInTheDocument();
    expect(header).not.toBeNull();
    expect(subhead).not.toBeNull();
    expect(controls).not.toBeNull();
    expect(testTypeDock).not.toBeNull();
    expect(tabDock).not.toBeNull();
    expect(searchCard).not.toBeNull();
    expect(subhead).toContainElement(subtitle);
    expect(controls).toContainElement(testTypeDock);
    expect(controls).toContainElement(tabDock);
    expect(tabDock).toContainElement(tabNav);
    expect(testTypeDock.compareDocumentPosition(tabDock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(header.compareDocumentPosition(searchCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('surfaces a route notice when disabled Book editor navigation redirects back to Materials', () => {
    mocks.locationState = { teacherMaterialsNotice: 'book-editor-disabled' };

    renderTeacherLobbyWithToasts();

    expect(screen.getByRole('status')).toHaveTextContent('Book editing is disabled for this rollout.');
  });

  it('opens published Reading V2 master rows in the master edit modal, not full-test Studio', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'material-v2',
        materialId: 'material-v2',
        deliveryEngine: 'reading-v2',
        ownerId: 'teacher-1',
        title: 'Published Reading V2',
        materialKind: 'reading-v2-full-test-composition',
        state: 'published',
        compositionId: 'composition-v2',
        publishedVersionId: 'composition-version-v2',
      },
    ];

    renderTeacherLobbyWithToasts();

    expect(screen.getByTestId('material-list-row-material-v2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Reading V2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import Reading V2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Reading V2 Studio modal adapter' })).not.toBeInTheDocument();

    await user.click(within(screen.getByTestId('material-list-row-material-v2')).getByRole('button', { name: 'Edit' }));

    expect(mocks.openEditTest).not.toHaveBeenCalled();
    expect(mocks.navigateTo).not.toHaveBeenCalledWith(
      'TEACHER_READING_V2_REVISE',
      expect.anything(),
      expect.anything()
    );
    expect(screen.getByRole('dialog', { name: /edit reading v2 master/i })).toBeInTheDocument();
    expect(mocks.masterModalProps.at(-1)).toEqual(expect.objectContaining({
      open: true,
      mode: 'published',
      master: expect.objectContaining({
        materialId: 'material-v2',
        compositionId: 'composition-v2',
        publishedVersionId: 'composition-version-v2',
      }),
    }));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'reading_v2_master_edit_opened',
      expect.objectContaining({
        source: 'teacher_lobby_test_card',
        testId: 'material-v2',
      })
    );

    await user.click(within(screen.getByTestId('material-list-row-material-v2')).getByRole('button', { name: 'Start Test' }));

    expect(mocks.startSession).toHaveBeenCalledWith('material-v2', 'test');
  });

  it('hydrates published Reading V2 master references from canonical composition before opening the edit modal', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'material-v2',
        materialId: 'material-v2',
        deliveryEngine: 'reading-v2',
        ownerId: 'teacher-1',
        title: 'Published Reading V2',
        materialKind: 'reading-v2-full-test-composition',
        state: 'published',
        compositionId: 'composition-v2',
        publishedVersionId: 'composition-version-v2',
        questionCount: 27,
      },
    ];
    mocks.dbReads[readingV2StoragePaths.fullTestCompositions('composition-v2')] = {
      compositionId: 'composition-v2',
      testMaterialId: 'material-v2',
      title: 'Published Reading V2',
      ownerId: 'teacher-1',
      visibility: 'private',
      publishedVersionId: 'composition-version-v2',
      passageRefs: [
        {
          refId: 'ref-a',
          passageMaterialId: 'passage-a',
          snapshotVersionId: 'snapshot-a',
          titleSnapshot: 'Passage A',
          questionCountSnapshot: 13,
          order: 1,
        },
        {
          refId: 'ref-b',
          passageMaterialId: 'passage-b',
          snapshotVersionId: 'snapshot-b',
          titleSnapshot: 'Passage B',
          questionCountSnapshot: 14,
          order: 2,
        },
      ],
    };

    renderTeacherLobbyWithToasts();

    await user.click(within(screen.getByTestId('material-list-row-material-v2')).getByRole('button', { name: 'Edit' }));

    await waitFor(() => {
      expect(mocks.masterModalProps.at(-1)?.master?.passageRefs).toHaveLength(2);
    });
    expect(mocks.masterModalProps.at(-1).master).toEqual(expect.objectContaining({
      compositionId: 'composition-v2',
      testMaterialId: 'material-v2',
      passageRefs: [
        expect.objectContaining({ passageMaterialId: 'passage-a', titleSnapshot: 'Passage A' }),
        expect.objectContaining({ passageMaterialId: 'passage-b', titleSnapshot: 'Passage B' }),
      ],
    }));
  });

  it('shows a shared toast after republishing a published Reading V2 master', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'material-v2',
        materialId: 'material-v2',
        deliveryEngine: 'reading-v2',
        ownerId: 'teacher-1',
        title: 'Published Reading V2',
        materialKind: 'reading-v2-full-test-composition',
        state: 'published',
        compositionId: 'composition-v2',
        publishedVersionId: 'composition-version-v2',
        questionCount: 13,
      },
    ];
    mocks.dbReads[readingV2StoragePaths.fullTestCompositions('composition-v2')] = {
      compositionId: 'composition-v2',
      testMaterialId: 'material-v2',
      title: 'Published Reading V2',
      ownerId: 'teacher-1',
      visibility: 'private',
      publishedVersionId: 'composition-version-v2',
      passageRefs: [
        {
          refId: 'ref-a',
          passageMaterialId: 'passage-a',
          materialId: 'passage-a',
          ownerId: 'teacher-1',
          snapshotVersionId: 'snapshot-a',
          currentVersionId: 'snapshot-a',
          titleSnapshot: 'Passage A',
          questionCountSnapshot: 13,
          visibility: 'private',
          testTypeIdsSnapshot: ['ielts'],
        },
      ],
    };
    mocks.dbReads[readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')] =
      readingPassageSnapshotFor('passage-a', 'snapshot-a');

    renderTeacherLobbyWithToasts();

    await user.click(within(screen.getByTestId('material-list-row-material-v2')).getByRole('button', { name: 'Edit' }));
    await waitFor(() => {
      expect(mocks.masterModalProps.at(-1)?.master?.passageRefs).toHaveLength(1);
    });

    await user.click(screen.getByRole('button', { name: 'Publish Master' }));

    await waitFor(() => {
      expect(screen.getByText('Published changes to "Published Reading V2". Visibility is now Private.').closest('.toast-card'))
        .toBeInTheDocument();
    });
  });

  it('derives legacy auto-split composition identity before hydrating published master references', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'material-v2',
        materialId: 'material-v2',
        deliveryEngine: 'reading-v2',
        ownerId: 'teacher-1',
        title: 'Published Reading V2',
        materialKind: 'full-test',
        publishedSnapshotVersionId: 'snapshot-v2',
        questionCount: 27,
      },
    ];
    mocks.dbReads[readingV2StoragePaths.fullTestCompositions('composition-material-v2-snapshot-v2')] = {
      compositionId: 'composition-material-v2-snapshot-v2',
      testMaterialId: 'material-v2',
      title: 'Published Reading V2',
      ownerId: 'teacher-1',
      visibility: 'private',
      publishedVersionId: 'snapshot-v2',
      passageRefs: [
        {
          refId: 'ref-a',
          passageMaterialId: 'passage-a',
          snapshotVersionId: 'snapshot-a',
          titleSnapshot: 'Passage A',
          questionCountSnapshot: 27,
          order: 1,
        },
      ],
    };

    renderTeacherLobbyWithToasts();

    await user.click(within(screen.getByTestId('material-list-row-material-v2')).getByRole('button', { name: 'Edit' }));

    await waitFor(() => {
      expect(mocks.masterModalProps.at(-1)?.master?.passageRefs).toHaveLength(1);
    });
    expect(mocks.masterModalProps.at(-1).master).toEqual(expect.objectContaining({
      compositionId: 'composition-material-v2-snapshot-v2',
      compositionLoadState: 'ready',
    }));
  });

  it('derives selected-passage composition identity from composition-backed material ids before edit and remove', async () => {
    const user = userEvent.setup();
    const compositionId = 'teacher-selected-teacher-1-public-passage-1-snapshot-1-2026-06-16t09-47-56-275z';
    const materialId = `composition-${compositionId}`;
    mocks.tests = [
      {
        id: materialId,
        materialId,
        deliveryEngine: 'reading-v2',
        ownerId: 'teacher-1',
        title: 'Selected Public Reading Passages',
        materialKind: 'full-test',
        state: 'published',
        visibility: 'public',
        testTypeIds: ['ielts'],
        publishedSnapshotVersionId: 'edit-teacher-selected-2026-06-16t09-48-08-141z',
        questionCount: 40,
      },
    ];
    mocks.dbReads[readingV2StoragePaths.fullTestCompositions(compositionId)] = {
      compositionId,
      testMaterialId: materialId,
      title: 'Selected Public Reading Passages',
      ownerId: 'teacher-1',
      visibility: 'public',
      testTypeIds: ['ielts'],
      updatedAt: '2026-06-16T09:48:08.141Z',
      publishedVersionId: 'edit-teacher-selected-2026-06-16t09-48-08-141z',
      passageRefs: [
        {
          refId: 'selected-passage-1',
          passageMaterialId: 'public-passage-1',
          materialId: 'public-passage-1',
          ownerId: 'other-teacher',
          titleSnapshot: 'Public Passage 1',
          snapshotVersionId: 'snapshot-1',
          currentVersionId: 'snapshot-1',
        },
        {
          refId: 'selected-passage-2',
          passageMaterialId: 'public-passage-2',
          materialId: 'public-passage-2',
          ownerId: 'other-teacher',
          titleSnapshot: 'Public Passage 2',
          snapshotVersionId: 'snapshot-2',
          currentVersionId: 'snapshot-2',
        },
        {
          refId: 'selected-passage-3',
          passageMaterialId: 'public-passage-3',
          materialId: 'public-passage-3',
          ownerId: 'other-teacher',
          titleSnapshot: 'Public Passage 3',
          snapshotVersionId: 'snapshot-3',
          currentVersionId: 'snapshot-3',
        },
      ],
    };

    renderTeacherLobbyWithToasts();

    await user.click(within(screen.getByTestId(`material-list-row-${materialId}`)).getByRole('button', { name: 'Edit' }));

    await waitFor(() => {
      expect(mocks.masterModalProps.at(-1)?.master?.passageRefs).toHaveLength(3);
    });
    expect(mocks.masterModalProps.at(-1).master).toEqual(expect.objectContaining({
      compositionId,
      testMaterialId: materialId,
      compositionLoadState: 'ready',
    }));

    await user.click(within(screen.getByTestId(`material-list-row-${materialId}`)).getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog', { name: 'Remove Reading V2 master?' })).toHaveTextContent('3 linked Reading Passages');
    expect(within(screen.getByRole('dialog', { name: 'Remove Reading V2 master?' })).getByRole('button', { name: 'Remove master and linked passages' })).toBeDisabled();
    await user.click(within(screen.getByRole('dialog', { name: 'Remove Reading V2 master?' })).getByRole('button', { name: 'Remove master only' }));

    await waitFor(() => {
      expect(mocks.dbWrites).toEqual(expect.arrayContaining([
        {
          path: `${readingV2StoragePaths.fullTestCompositions(compositionId)}/state`,
          value: 'removed',
        },
        {
          path: `${readingV2StoragePaths.materialMetadata(materialId)}/state`,
          value: 'removed',
        },
        {
          path: `tests/${materialId}`,
          value: null,
        },
      ]));
    });
    expect(mocks.dbWrites.some((write) =>
      String(write.path).includes('composition-composition-') ||
      String(write.path).includes('public-passage-1/state')
    )).toBe(false);
    await waitFor(() => {
      expect(screen.getByText('Removed "Selected Public Reading Passages". Linked Reading Passages were kept.').closest('.toast-card'))
        .toBeInTheDocument();
    });
    expect(mocks.refreshTests).toHaveBeenCalled();
  });

  it('keeps legacy Reading cards on the existing edit-modal path', async () => {
    const user = userEvent.setup();
    const legacyReadingTest = {
      id: 'legacy-reading-1',
      testType: 'IELTS',
      skill: 'Reading',
      ownerId: 'teacher-1',
      title: 'Legacy Reading',
    };
    mocks.tests = [legacyReadingTest];

    renderTeacherLobbyWithToasts();

    await user.click(within(screen.getByTestId('material-list-row-legacy-reading-1')).getByRole('button', { name: 'Edit' }));

    expect(mocks.openEditTest).toHaveBeenCalledWith(legacyReadingTest);
    expect(screen.queryByRole('dialog', { name: 'Reading V2 Studio modal adapter' })).not.toBeInTheDocument();
  });

  it('opens the PRD0054 master removal modal instead of the legacy delete confirmation for Reading V2 masters', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'master-1',
        materialId: 'master-1',
        compositionId: 'composition-master-1-snapshot-1',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        title: 'IELTS Cambridge 10 - Test 02: Reading',
        ownerId: 'teacher-1',
        testType: 'IELTS',
        skill: 'Reading',
        publishedSnapshotVersionId: 'snapshot-1',
        publishedVersionId: 'snapshot-1',
        passageRefs: [
          {
            refId: 'ref-1',
            passageMaterialId: 'passage-1',
            materialId: 'passage-1',
            ownerId: 'teacher-1',
            titleSnapshot: 'Passage 1',
            snapshotVersionId: 'snapshot-1',
            currentVersionId: 'snapshot-1',
          },
        ],
      },
    ];

    renderTeacherLobbyWithToasts();
    const row = screen.getByTestId('material-list-row-master-1');
    await user.click(within(row).getByRole('button', { name: 'Delete' }));

    expect(window.confirm).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Remove Reading V2 master?' });
    expect(dialog).toHaveTextContent('IELTS Cambridge 10 - Test 02: Reading');
    expect(dialog).toHaveTextContent('1 linked Reading Passage');
    expect(within(dialog).getByRole('button', { name: 'Remove master only' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove master and linked passages' })).toBeInTheDocument();
  });

  it('soft-removes a Reading V2 master and writes audit without archiving linked passages when master-only is selected', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'master-1',
        materialId: 'master-1',
        compositionId: 'composition-master-1-snapshot-1',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        title: 'IELTS Cambridge 10 - Test 02: Reading',
        ownerId: 'teacher-1',
        testType: 'IELTS',
        skill: 'Reading',
        testTypeIds: ['ielts'],
        visibility: 'private',
        updatedAt: '2026-06-14T12:29:04.355Z',
        publishedSnapshotVersionId: 'snapshot-1',
        publishedVersionId: 'snapshot-1',
        passageRefs: [
          {
            refId: 'ref-1',
            passageMaterialId: 'passage-1',
            materialId: 'passage-1',
            ownerId: 'teacher-1',
            titleSnapshot: 'Passage 1',
            snapshotVersionId: 'snapshot-1',
            currentVersionId: 'snapshot-1',
          },
        ],
      },
    ];

    renderTeacherLobbyWithToasts();
    await user.click(within(screen.getByTestId('material-list-row-master-1')).getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Remove Reading V2 master?' })).getByRole('button', { name: 'Remove master only' }));

    await waitFor(() => {
      expect(mocks.dbWrites).toEqual(expect.arrayContaining([
        {
          path: 'reading_v2/full_test_compositions/composition-master-1-snapshot-1/state',
          value: 'removed',
        },
        {
          path: 'reading_v2/material_metadata/master-1/state',
          value: 'removed',
        },
        {
          path: 'tests/master-1',
          value: null,
        },
      ]));
    });
    expect(mocks.dbWrites.some((write) => write.path === 'reading_v2/material_metadata/passage-1/state')).toBe(false);
    expect(mocks.dbWrites.some((write) => String(write.path).startsWith('reading_v2/audit_events/'))).toBe(true);
    await waitFor(() => {
      expect(screen.getByText('Removed "IELTS Cambridge 10 - Test 02: Reading". Linked Reading Passages were kept.').closest('.toast-card'))
        .toBeInTheDocument();
    });
    expect(mocks.refreshTests).toHaveBeenCalled();
  });

  it('archives owned linked Reading Passages when removing a Reading V2 master with linked passages', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'master-1',
        materialId: 'master-1',
        compositionId: 'composition-master-1-snapshot-1',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        title: 'IELTS Cambridge 10 - Test 02: Reading',
        ownerId: 'teacher-1',
        testType: 'IELTS',
        skill: 'Reading',
        testTypeIds: ['ielts'],
        visibility: 'private',
        updatedAt: '2026-06-14T12:29:04.355Z',
        publishedSnapshotVersionId: 'snapshot-1',
        publishedVersionId: 'snapshot-1',
        passageRefs: [
          {
            refId: 'ref-1',
            passageMaterialId: 'passage-1',
            materialId: 'passage-1',
            ownerId: 'teacher-1',
            titleSnapshot: 'Passage 1',
            title: 'Passage 1',
            snapshotVersionId: 'snapshot-1',
            currentVersionId: 'snapshot-1',
            questionCountSnapshot: 13,
            visibility: 'private',
            testTypeIdsSnapshot: ['ielts'],
          },
          {
            refId: 'ref-2',
            passageMaterialId: 'passage-2',
            materialId: 'passage-2',
            ownerId: 'teacher-1',
            titleSnapshot: 'Passage 2',
            title: 'Passage 2',
            snapshotVersionId: 'snapshot-1',
            currentVersionId: 'snapshot-1',
            questionCountSnapshot: 14,
            visibility: 'private',
            testTypeIdsSnapshot: ['ielts'],
          },
        ],
      },
    ];
    ['passage-1', 'passage-2'].forEach((passageId) => {
      mocks.dbReads[`reading_v2/material_metadata/${passageId}`] = { ownerId: 'teacher-1', state: 'published' };
      mocks.dbReads[`reading_v2/reading_passage_materials/${passageId}`] = { ownerId: 'teacher-1', state: 'published' };
    });

    renderTeacherLobbyWithToasts();
    await user.click(within(screen.getByTestId('material-list-row-master-1')).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove Reading V2 master?' });
    await user.click(within(dialog).getByRole('checkbox', { name: /I understand/i }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove master and linked passages' }));

    await waitFor(() => {
      expect(mocks.dbWrites).toEqual(expect.arrayContaining([
        {
          path: 'reading_v2/material_metadata/passage-1/state',
          value: 'archived',
        },
        {
          path: 'reading_v2/material_metadata/passage-2/state',
          value: 'archived',
        },
        {
          path: 'material_catalog/material_indexes/by_owner/teacher-1/passage-1',
          value: null,
        },
      ]));
    });
    expect(mocks.dbWrites.some((write) => write.path === 'reading_v2/material_metadata/master-1/state' && write.value === 'removed')).toBe(true);
    await waitFor(() => {
      expect(screen.getByText('Removed "IELTS Cambridge 10 - Test 02: Reading". 2 linked Reading Passages were archived.').closest('.toast-card'))
        .toBeInTheDocument();
    });
  });

  it('blocks linked-passage master removal when any linked Reading Passage is not owner-owned', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'master-1',
        materialId: 'master-1',
        compositionId: 'composition-master-1-snapshot-1',
        deliveryEngine: 'reading-v2',
        materialKind: 'full-test',
        title: 'IELTS Cambridge 10 - Test 02: Reading',
        ownerId: 'teacher-1',
        testType: 'IELTS',
        skill: 'Reading',
        publishedSnapshotVersionId: 'snapshot-1',
        publishedVersionId: 'snapshot-1',
        passageRefs: [
          {
            refId: 'ref-1',
            passageMaterialId: 'passage-1',
            materialId: 'passage-1',
            ownerId: 'other-teacher',
            titleSnapshot: 'Public passage',
            snapshotVersionId: 'snapshot-1',
            currentVersionId: 'snapshot-1',
          },
        ],
      },
    ];

    renderTeacherLobbyWithToasts();
    await user.click(within(screen.getByTestId('material-list-row-master-1')).getByRole('button', { name: 'Delete' }));

    const dialog = screen.getByRole('dialog', { name: 'Remove Reading V2 master?' });
    expect(dialog).toHaveTextContent('Linked passage removal is blocked because 1 passage is not owned by you.');
    expect(within(dialog).getByRole('button', { name: 'Remove master and linked passages' })).toBeDisabled();
  });

  it('hides standalone Reading V2 passage assets from the lobby grid by default', () => {
    mocks.tests = [
      {
        id: 'passage-asset-1',
        deliveryEngine: 'reading-v2',
        ownerId: 'teacher-1',
        title: 'Standalone Passage Asset',
        materialKind: 'passage-asset',
      },
      {
        id: 'material-v2',
        deliveryEngine: 'reading-v2',
        ownerId: 'teacher-1',
        title: 'Published Reading V2',
        materialKind: 'full-test',
      },
    ];

    renderTeacherLobbyWithToasts();

    expect(screen.queryByTestId('material-list-row-passage-asset-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('material-list-row-material-v2')).toBeInTheDocument();
  });

  it('keeps normal material browsing list-only and existing actions wired', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'legacy-reading-1',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        title: 'Legacy Reading',
        questionCount: 40,
      },
    ];

    render(<TeacherLobbyPage />);

    expect(screen.queryByRole('button', { name: 'List view' })).not.toBeInTheDocument();
    expect(screen.getByTestId('material-list-view')).toBeInTheDocument();
    expect(screen.getByTestId('material-list-row-legacy-reading-1')).toBeInTheDocument();

    await user.click(within(screen.getByTestId('material-list-row-legacy-reading-1')).getByRole('button', { name: 'Start Test' }));
    expect(mocks.startSession).toHaveBeenCalledWith('legacy-reading-1', 'test');
  });

  it('logs list-only Teacher Materials render diagnostics', async () => {
    mocks.tests = [
      {
        id: 'legacy-reading-1',
        testType: 'IELTS',
        skill: 'Reading',
        ownerId: 'teacher-1',
        title: 'Legacy Reading',
      },
    ];

    render(<TeacherLobbyPage />);

    await waitFor(() => {
      expect(mocks.logDiagnostic).toHaveBeenCalledWith(
          'grid_rendered',
        expect.objectContaining({ viewMode: 'list', visibleCount: 1 })
      );
    });
  });

  it('does not emit grid_rendered diagnostics for Reading Passage or Book tabs', async () => {
    const user = userEvent.setup();

    render(<TeacherLobbyPage />);

    await waitFor(() => {
      expect(mocks.logDiagnostic).toHaveBeenCalledWith(
        'grid_rendered',
        expect.objectContaining({ tab: 'my' }),
      );
    });

    mocks.logDiagnostic.mockClear();

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));

    await waitFor(() => {
      expect(mocks.logDiagnostic).toHaveBeenCalledWith(
        'reading_passage_list_succeeded',
        expect.objectContaining({ scope: 'private', count: 0 }),
      );
    });

    expect(mocks.logDiagnostic.mock.calls.some(([event]) => event === 'grid_rendered')).toBe(false);

    mocks.logDiagnostic.mockClear();

    await user.click(screen.getByRole('tab', { name: 'Book' }));

    await waitFor(() => {
      expect(mocks.logDiagnostic).toHaveBeenCalledWith(
        'book_list_succeeded',
        expect.objectContaining({ scope: 'private', count: 0 }),
      );
    });

    expect(mocks.logDiagnostic.mock.calls.some(([event]) => event === 'grid_rendered')).toBe(false);
  });

  it('tracks Section 17 tab and Test Type filter actions with exact snake_case names', async () => {
    const user = userEvent.setup();

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Public Library' }));
    await user.click(screen.getByRole('button', { name: 'Filter IELTS' }));
    await user.click(screen.getByRole('button', { name: 'Clear Test Type' }));

    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_tab_changed',
      { from: 'my', to: 'public' },
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_test_type_filter_selected',
      expect.objectContaining({ source: 'teacher_materials_search_filter_bar', testTypeId: 'ielts' }),
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_test_type_filter_cleared',
      expect.objectContaining({ source: 'teacher_materials_search_filter_bar', testTypeId: null }),
    );
  });

  it('switches Book tab CTA to Create New Book and hides create CTA for Reading Passage tab', async () => {
    const user = userEvent.setup();

    render(<TeacherLobbyPage />);

    expect(screen.getByRole('button', { name: 'Create New Test' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Book' }));
    expect(screen.getByRole('button', { name: 'Create New Book' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));
    expect(screen.queryByRole('button', { name: /Create New/ })).not.toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_tab_changed',
      expect.objectContaining({ to: 'book' }),
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_tab_changed',
      expect.objectContaining({ to: 'reading-passage' }),
    );
  });

  it('keeps Reading Passage and Book visibility controls inside the search bar', async () => {
    const user = userEvent.setup();

    renderTeacherLobbyWithToasts();

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));
    const readingSearchBar = screen.getByTestId('search-filter-bar');
    const readingVisibility = within(readingSearchBar).getByRole('group', { name: 'Reading Passage visibility' });

    expect(within(readingVisibility).getByRole('button', { name: 'Private' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(readingVisibility).getByRole('button', { name: 'Public' }));

    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'changeReadingPassageScope',
      expect.objectContaining({ scope: 'public', source: 'teacher_materials_reading_passage_tab' }),
    );

    await user.click(screen.getByRole('tab', { name: 'Book' }));
    const bookSearchBar = screen.getByTestId('search-filter-bar');
    const bookVisibility = within(bookSearchBar).getByRole('group', { name: 'Book visibility' });

    expect(within(bookVisibility).getByRole('button', { name: 'Private' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(bookVisibility).getByRole('button', { name: 'Public' }));

    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'changeBookScope',
      expect.objectContaining({ scope: 'public', source: 'teacher_materials_book_tab' }),
    );
  });

  it('opens the dedicated Book modal and creates an empty draft Book into the Book grid', async () => {
    const user = userEvent.setup();
    const createdBook = {
      id: 'book-ielts',
      bookId: 'book-ielts',
      ownerId: 'teacher-1',
      title: 'IELTS Reading Pack',
      authors: [],
      visibility: 'private',
      status: 'draft-empty',
      testTypeIds: ['ielts'],
      testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
      tags: [],
      updatedAt: '2026-06-01T00:00:00.000Z',
      isOwner: true,
    };
    mocks.listTeacherBooks
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdBook]);
    mocks.createBookDraft.mockResolvedValue({
      ...createdBook,
      createdAt: '2026-06-01T00:00:00.000Z',
      createdBy: 'teacher-1',
      updatedBy: 'teacher-1',
    });

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Book' }));
    await user.click(await screen.findByRole('button', { name: 'Create New Book' }));

    expect(screen.getByRole('dialog', { name: 'Create Book' })).toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_book_create_opened',
      expect.objectContaining({ source: 'teacher_lobby_book_tab' }),
    );

    await user.type(screen.getByLabelText('Title'), 'IELTS Reading Pack');
    await user.click(screen.getByLabelText('IELTS'));
    await user.click(screen.getByRole('button', { name: 'Save Book' }));

    await waitFor(() => {
      expect(mocks.createBookDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'teacher-1',
          title: 'IELTS Reading Pack',
          testTypeIds: ['ielts'],
          visibility: 'private',
        }),
        expect.anything(),
        expect.objectContaining({
          actorId: 'teacher-1',
          actorRole: 'teacher',
        }),
      );
    });

    expect(await screen.findByTestId('book-card-book-ielts')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-lazy-component')).not.toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_book_created',
      expect.objectContaining({ bookId: 'book-ielts' }),
    );
  });

  it('keeps Book private/public scope inside the Book tab', async () => {
    const user = userEvent.setup();
    mocks.listTeacherBooks.mockResolvedValue([]);

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Book' }));

    await waitFor(() => {
      expect(mocks.listTeacherBooks).toHaveBeenCalledWith(expect.objectContaining({
        teacherId: 'teacher-1',
        scope: 'private',
      }));
    });

    await user.click(screen.getByRole('button', { name: 'Public' }));

    await waitFor(() => {
      expect(mocks.listTeacherBooks).toHaveBeenCalledWith(expect.objectContaining({
        teacherId: 'teacher-1',
        scope: 'public',
      }));
    });

    expect(screen.getByRole('tablist', { name: 'Teacher lobby content tabs' })).toHaveAttribute('data-active-tab', 'book');
    expect(mocks.logDiagnostic).toHaveBeenCalledWith(
      'book_list_succeeded',
      expect.objectContaining({ scope: 'public', count: 0 }),
    );
  });

  it('opens Book cards in the Teacher Materials modal and omits whole-Book student actions', async () => {
    const user = userEvent.setup();
    mocks.listTeacherBooks.mockResolvedValue([
      {
        id: 'book-action',
        bookId: 'book-action',
        ownerId: 'teacher-1',
        title: 'Book Actions',
        authors: ['A. Nguyen'],
        publisher: 'Practice Press',
        visibility: 'private',
        status: 'draft-empty',
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        tags: [],
        updatedAt: '2026-06-01T00:00:00.000Z',
        isOwner: true,
      },
    ]);
    mocks.dbReads['material_catalog/material_indexes/by_owner/teacher-1'] = {
      candidate: {
        materialId: 'passage-candidate',
        title: 'Candidate Reading Passage',
        materialKind: 'reading-passage',
        testTypeIds: ['ielts'],
        visibility: 'private',
        publishedSnapshotVersionId: 'snapshot-candidate',
      },
    };

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Book' }));
    const card = await screen.findByTestId('book-card-book-action');

    expect(within(card).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Edit metadata' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Start Test/i })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: /Assign Homework/i })).not.toBeInTheDocument();
    expect(mocks.listBookNodes).not.toHaveBeenCalled();

    await user.click(within(card).getByRole('button', { name: 'Edit' }));

    expect(mocks.navigateTo).not.toHaveBeenCalledWith(
      'TEACHER_MATERIAL_BOOK',
      expect.anything(),
      expect.anything(),
    );
    const dialog = screen.getByRole('dialog', { name: /Book Actions/i });
    expect(dialog).toBeInTheDocument();
    const modalTabRail = dialog.querySelector('.book-editor-modal__tabs');
    expect(modalTabRail).toHaveAttribute('role', 'tablist');
    expect(modalTabRail).toHaveAccessibleName('Book editor tabs');
    expect(within(modalTabRail).getAllByRole('tab').map((tab) => tab.textContent.trim())).toEqual([
      'Overview',
      'Content',
      'Settings',
    ]);
    expect(within(modalTabRail).getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    expect(within(modalTabRail).queryByRole('tab', { name: 'Assign' })).not.toBeInTheDocument();
    expect(dialog.querySelector('.book-editor-page__hero')).toBeNull();
    expect(dialog.querySelector('.book-editor-modal__status')).toBeNull();
    expect(dialog.querySelector('.book-editor-page__status-strip')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Add Section' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Attach Candidate Reading Passage' }));

    expect(within(dialog).getByRole('button', { name: 'Assign selected' })).toBeInTheDocument();
    expect(screen.getAllByText('Whole-Book assignment is not available in V1.').length).toBe(1);

    await user.click(within(modalTabRail).getByRole('tab', { name: 'Settings' }));

    expect(screen.getByRole('tablist', { name: 'Teacher lobby content tabs' })).toHaveAttribute('data-active-tab', 'book');
    expect(within(modalTabRail).getByRole('tab', { name: 'Settings' })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(modalTabRail).getByRole('tab', { name: 'Content' }));
    expect(screen.getByRole('tablist', { name: 'Teacher lobby content tabs' })).toHaveAttribute('data-active-tab', 'book');
    expect(within(modalTabRail).getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');

    await waitFor(() => {
      expect(mocks.listBookNodes).toHaveBeenCalledWith('book-action');
    });
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_book_editor_opened',
      expect.objectContaining({
        bookId: 'book-action',
        source: 'teacher_materials_book_card',
      }),
    );
  });

  it('archives selected Books from the bulk toolbar', async () => {
    const user = userEvent.setup();
    mocks.listTeacherBooks.mockResolvedValue([
      {
        id: 'book-bulk-archive',
        bookId: 'book-bulk-archive',
        ownerId: 'teacher-1',
        title: 'Bulk Archive Book',
        authors: [],
        visibility: 'private',
        status: 'draft-empty',
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        tags: [],
        updatedAt: '2026-06-01T00:00:00.000Z',
        isOwner: true,
      },
    ]);

    renderTeacherLobbyWithToasts();

    await user.click(screen.getByRole('tab', { name: 'Book' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Select Bulk Archive Book' }));
    await user.click(screen.getByRole('button', { name: 'Archive selected' }));

    expect(mocks.confirm).toHaveBeenCalledWith('Archive 1 selected Books?');
    await waitFor(() => {
      expect(mocks.updateBookMetadata).toHaveBeenCalledWith(
        'book-bulk-archive',
        { status: 'archived' },
        expect.any(Object),
        expect.any(Object),
      );
    });
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'archiveSelectedMaterials',
      expect.objectContaining({ count: 1, materialKind: 'book' }),
    );
  });

  it('disables Book editor opening when the Teacher Materials capability is off', async () => {
    const user = userEvent.setup();
    mocks.capabilities = {
      ...mocks.capabilities,
      canUseMaterialBookEditor: false,
    };
    mocks.listTeacherBooks.mockResolvedValue([
      {
        id: 'book-disabled',
        bookId: 'book-disabled',
        ownerId: 'teacher-1',
        title: 'Disabled Book',
        authors: ['A. Nguyen'],
        publisher: 'Practice Press',
        visibility: 'private',
        status: 'draft-empty',
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        tags: [],
        updatedAt: '2026-06-01T00:00:00.000Z',
        isOwner: true,
      },
    ]);

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Book' }));
    const card = await screen.findByTestId('book-card-book-disabled');
    const openButton = within(card).getByRole('button', { name: 'Edit' });

    expect(openButton).toBeDisabled();
    expect(openButton).toHaveAttribute('title', 'Book editor is not available');

    await user.click(openButton);

    expect(screen.queryByRole('dialog', { name: /Disabled Book/i })).not.toBeInTheDocument();
    expect(mocks.listBookNodes).not.toHaveBeenCalled();
    expect(mocks.navigateTo).not.toHaveBeenCalledWith(
      'TEACHER_MATERIAL_BOOK',
      expect.anything(),
      expect.anything(),
    );
  });

  it('opens Book editor modal once from legacy route state and preserves Book tab scope after close', async () => {
    const user = userEvent.setup();
    mocks.locationState = {
      teacherMaterialsOpenBookId: 'book-route',
      teacherMaterialsOpenBookSource: 'legacy-book-route',
    };
    mocks.listTeacherBooks.mockResolvedValue([
      {
        id: 'book-route',
        bookId: 'book-route',
        ownerId: 'teacher-1',
        title: 'Route Book',
        authors: ['A. Nguyen'],
        publisher: 'Practice Press',
        visibility: 'private',
        status: 'draft-empty',
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        tags: [],
        updatedAt: '2026-06-01T00:00:00.000Z',
        isOwner: true,
      },
    ]);

    render(<TeacherLobbyPage />);

    expect(await screen.findByRole('dialog', { name: /Route Book/i })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Teacher lobby content tabs' })).toHaveAttribute('data-active-tab', 'book');
    expect(screen.getByRole('button', { name: 'Private' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Close Book editor/i }));

    expect(screen.queryByRole('dialog', { name: /Route Book/i })).not.toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Teacher lobby content tabs' })).toHaveAttribute('data-active-tab', 'book');
    expect(screen.getByRole('button', { name: 'Private' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('tab', { name: 'My Content' }));
    await user.click(screen.getByRole('tab', { name: 'Book' }));

    expect(screen.queryByRole('dialog', { name: /Route Book/i })).not.toBeInTheDocument();
  });

  it('uses live admin Test Type config for Teacher Materials blocks before falling back to defaults', async () => {
    mocks.dbReads['material_catalog/test_types'] = {
      det: {
        testTypeId: 'det',
        canonicalKey: 'DET',
        label: 'DET',
        shortLabel: 'DET',
        aliases: [],
        active: true,
        teacherSelectable: true,
        displayOrder: 1,
        defaultPinnedRank: 1,
        readingSourceOrderLabel: 'Passage',
        readingSourceOrderLabelPlural: 'Passages',
        logoAlt: 'DET logo',
        allowedMaterialKinds: ['full-test', 'reading-passage', 'book'],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        updatedBy: 'admin',
      },
      cambridge: {
        testTypeId: 'cambridge',
        canonicalKey: 'CAMBRIDGE',
        label: 'Cambridge',
        shortLabel: 'CAM',
        aliases: [],
        active: true,
        teacherSelectable: true,
        displayOrder: 2,
        defaultPinnedRank: 2,
        readingSourceOrderLabel: 'Test',
        readingSourceOrderLabelPlural: 'Tests',
        logoAlt: 'Cambridge logo',
        allowedMaterialKinds: ['full-test', 'reading-passage', 'book'],
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        updatedBy: 'admin',
      },
    };

    render(<TeacherLobbyPage />);

    expect(await screen.findByRole('button', { name: /filter materials by DET/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /filter materials by Cambridge/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /filter materials by IELTS/i })).not.toBeInTheDocument();
    });
    expect(mocks.logDiagnostic).toHaveBeenCalledWith(
      'test_type_config_resolved',
      expect.objectContaining({
        source: 'live-admin-config',
        count: 2,
        fallbackUsed: false,
      }),
    );
  });

  it('filters materials from Test Type block body and clears when clicking the active block again', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'ielts-reading',
        ownerId: 'teacher-1',
        title: 'IELTS Reading',
        testTypeIds: ['ielts'],
      },
      {
        id: 'toeic-listening',
        ownerId: 'teacher-1',
        title: 'TOEIC Listening',
        testTypeIds: ['toeic'],
      },
    ];

    render(<TeacherLobbyPage />);

    expect(screen.getByTestId('material-list-row-ielts-reading')).toBeInTheDocument();
    expect(screen.getByTestId('material-list-row-toeic-listening')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /filter materials by IELTS/i }));

    expect(screen.getByTestId('material-list-row-ielts-reading')).toBeInTheDocument();
    expect(screen.queryByTestId('material-list-row-toeic-listening')).not.toBeInTheDocument();
    expect(screen.queryByText(/active test type/i)).not.toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_test_type_filter_selected',
      expect.objectContaining({ source: 'teacher_materials_test_type_block', testTypeId: 'ielts' }),
    );

    await user.click(screen.getByRole('button', { name: /filter materials by IELTS/i }));

    expect(screen.getByTestId('material-list-row-ielts-reading')).toBeInTheDocument();
    expect(screen.getByTestId('material-list-row-toeic-listening')).toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_test_type_filter_cleared',
      expect.objectContaining({ source: 'teacher_materials_test_type_block', testTypeId: null }),
    );
  });

  it('preserves search and active Test Type filter across tab changes with AND semantics', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'ielts-alpha',
        ownerId: 'teacher-1',
        title: 'Alpha IELTS',
        testTypeIds: ['ielts'],
      },
      {
        id: 'ielts-beta',
        ownerId: 'teacher-1',
        title: 'Beta IELTS',
        testTypeIds: ['ielts'],
      },
      {
        id: 'toeic-alpha',
        ownerId: 'teacher-1',
        title: 'Alpha TOEIC',
        testTypeIds: ['toeic'],
      },
    ];

    render(<TeacherLobbyPage />);

    await user.type(screen.getByLabelText('Search'), 'Alpha');
    await user.click(screen.getByRole('button', { name: /filter materials by IELTS/i }));

    expect(screen.getByTestId('material-list-row-ielts-alpha')).toBeInTheDocument();
    expect(screen.queryByTestId('material-list-row-ielts-beta')).not.toBeInTheDocument();
    expect(screen.queryByTestId('material-list-row-toeic-alpha')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Public Library' }));

    expect(screen.getByLabelText('Search')).toHaveValue('Alpha');
    expect(screen.getByRole('button', { name: /filter materials by IELTS/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('material-list-row-ielts-alpha')).toBeInTheDocument();
    expect(screen.queryByTestId('material-list-row-toeic-alpha')).not.toBeInTheDocument();
  });

  it('renders no All Test Type block and settings click does not toggle the active filter', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'ielts-reading',
        ownerId: 'teacher-1',
        title: 'IELTS Reading',
        testTypeIds: ['ielts'],
      },
      {
        id: 'toeic-listening',
        ownerId: 'teacher-1',
        title: 'TOEIC Listening',
        testTypeIds: ['toeic'],
      },
    ];

    render(<TeacherLobbyPage />);

    expect(screen.queryByRole('button', { name: /^All$/i })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Edit pinned Test Types' })[0]);

    expect(screen.getByTestId('material-list-row-ielts-reading')).toBeInTheDocument();
    expect(screen.getByTestId('material-list-row-toeic-listening')).toBeInTheDocument();
  });

  it('opens Test Type preferences from the block settings icon', async () => {
    const user = userEvent.setup();

    render(<TeacherLobbyPage />);

    await user.click(screen.getAllByRole('button', { name: 'Edit pinned Test Types' })[0]);

    expect(screen.getByRole('dialog', { name: /Test Type preferences/i })).toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'openTestTypePreferences',
      expect.objectContaining({ source: 'teacher_materials_test_type_block' }),
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_test_type_preferences_opened',
      expect.objectContaining({ source: 'teacher_materials_test_type_block' }),
    );
  });

  it('keeps Test Type logo controls mounted when opening Drafts', async () => {
    const user = userEvent.setup();
    mocks.drafts = [
      {
        id: 'draft-v2',
        draftId: 'draft-v2',
        deliveryEngine: 'reading-v2',
        metadata: { title: 'Reading V2 Draft' },
      },
    ];

    const { container } = render(<TeacherLobbyPage />);

    const testTypeDock = container.querySelector('.teacher-lobby-test-type-dock');
    const tabDock = container.querySelector('.teacher-lobby-content-tab-dock');

    await user.click(screen.getByRole('tab', { name: 'Drafts' }));

    expect(screen.getByRole('button', { name: /filter materials by IELTS/i })).toBeInTheDocument();
    expect(testTypeDock).not.toBeNull();
    expect(tabDock).not.toBeNull();
    expect(testTypeDock.compareDocumentPosition(tabDock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('draft-card-draft-v2')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Reading V2 Studio modal adapter' })).not.toBeInTheDocument();
    expect(mocks.navigateTo).not.toHaveBeenCalled();
  });

  it('deletes selected Drafts from the bulk toolbar', async () => {
    const user = userEvent.setup();
    mocks.drafts = [
      {
        id: 'draft-bulk-delete',
        draftId: 'draft-bulk-delete',
        metadata: { title: 'Bulk Draft Delete' },
      },
    ];

    renderTeacherLobbyWithToasts();

    await user.click(screen.getByRole('tab', { name: 'Drafts' }));
    await user.click(await screen.findByRole('button', { name: 'Select Bulk Draft Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete selected' }));

    expect(mocks.confirm).toHaveBeenCalledWith('Delete 1 selected drafts? This cannot be undone.');
    await waitFor(() => {
      expect(mocks.deleteDraft).toHaveBeenCalledWith('draft-bulk-delete');
    });
    expect(mocks.refreshDrafts).toHaveBeenCalled();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'deleteSelectedMaterials',
      expect.objectContaining({ count: 1, materialKind: 'draft' }),
    );
  });

  it('loads Reading Passage private scope by default and keeps scope separate from top-level public tab', async () => {
    const user = userEvent.setup();
    mocks.listReadingPassages.mockResolvedValueOnce([
      {
        id: 'passage-private',
        materialId: 'passage-private',
        ownerId: 'teacher-1',
        title: 'Private Passage',
        materialKind: 'reading-passage',
        questionCount: 10,
        durationMinutes: 18,
        updatedAt: '2026-05-12T00:00:00Z',
        visibility: 'private',
        isOwner: true,
        selectable: true,
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        sourceOrderDisplay: 'Passage 1',
        sourceFullTestTitle: 'Source Full Test',
        actions: [
          { key: 'edit', label: 'Edit' },
          { key: 'assign-homework', label: 'Assign homework' },
          { key: 'archive', label: 'Archive', ownerOnly: true },
        ],
      },
    ]).mockResolvedValueOnce([
      {
        id: 'passage-public',
        materialId: 'passage-public',
        ownerId: 'teacher-2',
        title: 'Public Passage',
        materialKind: 'reading-passage',
        questionCount: 8,
        durationMinutes: 14,
        updatedAt: '2026-05-13T00:00:00Z',
        visibility: 'public',
        isOwner: false,
        selectable: true,
        testTypes: [{ testTypeId: 'toeic', label: 'TOEIC', shortLabel: 'TOEIC', active: true }],
        sourceOrderDisplay: 'Part 2',
        actions: [
          { key: 'clone-reading-passage', label: 'Clone to my library' },
          { key: 'assign-homework', label: 'Assign homework' },
        ],
      },
    ]);

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));

    expect(screen.getByRole('group', { name: 'Reading Passage visibility' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Private' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /Create New/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create New Reading Passage/i })).not.toBeInTheDocument();

    expect(await screen.findByTestId('material-list-row-passage-private')).toBeInTheDocument();
    expect(screen.getByText('Passage 1')).toBeInTheDocument();
    expect(screen.getByText('Source Full Test')).toBeInTheDocument();
    expect(within(screen.getByTestId('material-list-row-passage-private')).getByText('Private')).toBeInTheDocument();
    expect(mocks.listReadingPassages).toHaveBeenLastCalledWith(expect.objectContaining({
      teacherId: 'teacher-1',
      scope: 'private',
    }));

    await user.click(screen.getByRole('button', { name: 'Public' }));

    const publicRow = await screen.findByTestId('material-list-row-passage-public');
    expect(publicRow).toBeInTheDocument();
    expect(within(publicRow).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(publicRow).queryByRole('button', { name: 'Revise' })).not.toBeInTheDocument();
    expect(within(publicRow).queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
    expect(within(publicRow).getByRole('button', { name: 'Clone to my library' })).toBeInTheDocument();
    expect(within(publicRow).getByRole('button', { name: 'Assign homework' })).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Teacher lobby content tabs' })).toHaveAttribute('data-active-tab', 'reading-passage');
    expect(mocks.listReadingPassages).toHaveBeenLastCalledWith(expect.objectContaining({
      teacherId: 'teacher-1',
      scope: 'public',
    }));
    expect(mocks.logDiagnostic).toHaveBeenCalledWith(
      'reading_passage_list_succeeded',
      expect.objectContaining({ scope: 'public', count: 1 }),
    );
  }, 30000);

  it('wires Reading Passage edit, remove-from-library confirmation, restore, and single assign actions', async () => {
    const user = userEvent.setup();
    mocks.listReadingPassages.mockImplementation(async ({ scope }) => (scope === 'private' ? [
      {
        id: 'passage-owner',
        materialId: 'passage-owner',
        ownerId: 'teacher-1',
        title: 'Owner Passage',
        materialKind: 'reading-passage',
        questionCount: 12,
        updatedAt: '2026-05-12T00:00:00Z',
        visibility: 'private',
        publishedSnapshotVersionId: 'snapshot-owner',
        sourceFullTestId: 'full-test-owner',
        testTypeIds: ['ielts'],
        masterRefCount: 1,
        bookRefCount: 1,
        activeHomeworkCount: 2,
        hasStudentSafeProjection: true,
        isOwner: true,
        selectable: true,
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        actions: [
          { key: 'edit', label: 'Edit' },
          { key: 'assign-homework', label: 'Assign homework' },
          { key: 'archive', label: 'Remove from library', ownerOnly: true },
        ],
      },
    ] : scope === 'archived' ? [
      {
        id: 'passage-owner',
        materialId: 'passage-owner',
        ownerId: 'teacher-1',
        title: 'Owner Passage',
        materialKind: 'reading-passage',
        questionCount: 12,
        updatedAt: '2026-05-12T00:00:00Z',
        visibility: 'private',
        scope: 'archived',
        archived: true,
        currentVersionId: 'snapshot-owner',
        publishedSnapshotVersionId: 'snapshot-owner',
        sourceFullTestId: 'full-test-owner',
        testTypeIds: ['ielts'],
        isOwner: true,
        selectable: false,
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        actions: [
          { key: 'view', label: 'View read-only' },
          { key: 'restore', label: 'Restore', ownerOnly: true },
        ],
      },
    ] : []));
    mocks.dbReads[readingV2StoragePaths.readingPassageMaterialVersions('passage-owner', 'snapshot-owner')] = {
      materialId: 'passage-owner',
    };
    mocks.dbReads[readingV2StoragePaths.studentSafeTests('passage-owner', 'snapshot-owner')] = {
      content: {},
    };
    mocks.dbReads[readingV2StoragePaths.materialMetadata('passage-owner')] = {
      materialId: 'passage-owner',
      ownerId: 'teacher-1',
      state: 'published',
    };
    mocks.dbReads[readingV2StoragePaths.readingPassageMaterials('passage-owner')] = {
      passageMaterialId: 'passage-owner',
      ownerId: 'teacher-1',
      state: 'published',
    };
    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));
    const row = await screen.findByTestId('material-list-row-passage-owner');

    expect(within(row).queryByRole('button', { name: 'Revise' })).not.toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    expect(mocks.navigateTo).toHaveBeenCalledWith(
      'TEACHER_READING_V2_REVISE',
      { materialId: 'passage-owner' },
      { reason: 'teacher_materials_edit_reading_passage' },
    );

    await user.click(within(row).getByRole('button', { name: 'Assign homework' }));
    const homeworkDialog = screen.getByRole('dialog', { name: /Create Homework Assignment/i });
    expect(homeworkDialog).toBeInTheDocument();
    expect(within(homeworkDialog).getAllByText('Owner Passage').length).toBeGreaterThan(0);
    expect(mocks.homeworkModalProps.at(-1).preselectedReadingPassage).toEqual(expect.objectContaining({
      materialId: 'passage-owner',
      title: 'Owner Passage',
    }));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_reading_passage_assigned',
      expect.objectContaining({ materialId: 'passage-owner' }),
    );

    await user.click(within(row).getByRole('button', { name: 'Remove from library' }));
    const archiveDialog = screen.getByRole('dialog', { name: 'Archive Reading Passage?' });
    expect(archiveDialog).toHaveTextContent('1 affected master');
    expect(archiveDialog).toHaveTextContent('1 affected Book');
    expect(archiveDialog).toHaveTextContent('2 active assignment blockers');
    expect(archiveDialog).toHaveTextContent('Existing assigned work and saved results stay available from frozen snapshots.');
    expect(within(archiveDialog).getByRole('button', { name: 'Remove from library' })).toBeDisabled();

    await user.click(within(archiveDialog).getByRole('checkbox', { name: /I understand/i }));
    await user.click(within(archiveDialog).getByRole('button', { name: 'Remove from library' }));

    await waitFor(() => {
      expect(mocks.dbWrites).toEqual(expect.arrayContaining([
        {
          path: 'reading_v2/material_metadata/passage-owner/state',
          value: 'archived',
        },
        {
          path: 'reading_v2/reading_passage_materials/passage-owner/state',
          value: 'archived',
        },
        {
          path: 'material_catalog/material_indexes/by_owner/teacher-1/passage-owner',
          value: null,
        },
      ]));
    });
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'reading_passage_removed_from_library',
      expect.objectContaining({ materialId: 'passage-owner' }),
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_reading_passage_archived',
      expect.objectContaining({ materialId: 'passage-owner' }),
    );
    mocks.dbReads['material_catalog/material_archive_indexes/by_owner/teacher-1/reading-passage/passage-owner'] = {
      materialId: 'passage-owner',
      ownerId: 'teacher-1',
    };

    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByTestId('material-list-row-passage-owner')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    const restoreDialog = screen.getByRole('dialog', { name: 'Restore Reading Passage' });
    await user.click(within(restoreDialog).getByRole('button', { name: 'Restore as Private' }));

    await waitFor(() => {
      expect(mocks.dbWrites).toEqual(expect.arrayContaining([
        {
          path: 'reading_v2/material_metadata/passage-owner/state',
          value: 'published',
        },
        {
          path: 'material_catalog/material_archive_indexes/by_owner/teacher-1/reading-passage/passage-owner',
          value: null,
        },
      ]));
    });
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'reading_passage_restored',
      expect.objectContaining({ materialId: 'passage-owner', restoreVisibility: 'private' }),
    );
  }, 30000);

  it('supports Reading Passage bulk selection actions', async () => {
    const user = userEvent.setup();
    mocks.listReadingPassages.mockResolvedValue([
      {
        id: 'passage-a',
        materialId: 'passage-a',
        ownerId: 'teacher-1',
        title: 'Passage A',
        materialKind: 'reading-passage',
        questionCount: 10,
        updatedAt: '2026-05-12T00:00:00Z',
        visibility: 'private',
        publishedSnapshotVersionId: 'snapshot-a',
        sourceOrderDisplay: 'Passage 1',
        sourceQuestionRange: '1-10',
        isOwner: true,
        selectable: true,
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        actions: [{ key: 'open', label: 'Open' }, { key: 'assign-homework', label: 'Assign homework' }],
      },
      {
        id: 'passage-b',
        materialId: 'passage-b',
        ownerId: 'teacher-1',
        title: 'Passage B',
        materialKind: 'reading-passage',
        questionCount: 11,
        updatedAt: '2026-05-13T00:00:00Z',
        visibility: 'private',
        publishedSnapshotVersionId: 'snapshot-b',
        sourceOrderDisplay: 'Passage 2',
        sourceQuestionRange: '11-21',
        isOwner: true,
        selectable: true,
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        actions: [{ key: 'open', label: 'Open' }, { key: 'assign-homework', label: 'Assign homework' }],
      },
    ]);
    mocks.dbReads[readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')] =
      readingPassageSnapshotFor('passage-a', 'snapshot-a');
    mocks.dbReads[readingV2StoragePaths.publishedSnapshots('passage-b', 'snapshot-b')] =
      readingPassageSnapshotFor('passage-b', 'snapshot-b');

    renderTeacherLobbyWithToasts();

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));
    await screen.findByTestId('material-list-row-passage-a');

    await user.click(screen.getByRole('button', { name: 'Select Passage A' }));
    await user.click(screen.getByRole('button', { name: 'Select Passage B' }));

    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Assign selected' }));
    expect(screen.getByRole('dialog', { name: /Create Homework Assignment/i })).toBeInTheDocument();
    expect(mocks.homeworkModalProps.at(-1).preselectedReadingPassageSet).toEqual(expect.objectContaining({
      title: 'Selected Reading Passages',
      passages: [
        expect.objectContaining({ materialId: 'passage-a', title: 'Passage A' }),
        expect.objectContaining({ materialId: 'passage-b', title: 'Passage B' }),
      ],
    }));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_reading_passage_set_assigned',
      expect.objectContaining({ passageCount: 2 }),
    );

    await user.click(screen.getByRole('button', { name: /Close HomeworkCreateModal/i }));
    await user.click(screen.getByRole('button', { name: 'Create full test from selected' }));

    await waitFor(() => {
      expect(mocks.dbWrites.some((write) => write.path.startsWith('reading_v2/full_test_compositions/'))).toBe(true);
    });

    const compositionWrite = mocks.dbWrites.find((write) =>
      write.path.startsWith('reading_v2/full_test_compositions/'));
    const studentSafeWrite = mocks.dbWrites.find((write) =>
      write.path.startsWith('reading_v2/projections/student_safe_tests/'));

    expect(compositionWrite?.value).toMatchObject({
      title: 'Selected Reading Passages',
      ownerId: 'teacher-1',
      mode: 'draft',
      questionCount: 21,
      testTypeIds: ['ielts'],
      passageRefs: [
        expect.objectContaining({
          passageMaterialId: 'passage-a',
          snapshotVersionId: 'snapshot-a',
          sourceOrderDisplaySnapshot: 'Passage 1',
          questionRangeSnapshot: '1-10',
          questionCountSnapshot: 10,
        }),
        expect.objectContaining({
          passageMaterialId: 'passage-b',
          snapshotVersionId: 'snapshot-b',
          sourceOrderDisplaySnapshot: 'Passage 2',
          questionRangeSnapshot: '11-21',
          questionCountSnapshot: 11,
        }),
      ],
    });
    expect(mocks.dbWrites.some((write) => write.path.startsWith('tests/'))).toBe(false);
    expect(studentSafeWrite).toBeUndefined();
    expect(mocks.navigateTo).not.toHaveBeenCalledWith(
      'TEACHER_READING_V2_REVISE',
      expect.anything(),
      expect.anything(),
    );
    expect(screen.getByRole('dialog', { name: /edit reading v2 master/i })).toBeInTheDocument();
    expect(mocks.masterModalProps.at(-1)).toEqual(expect.objectContaining({
      open: true,
      mode: 'draft',
      master: expect.objectContaining({
        title: 'Selected Reading Passages',
        mode: 'draft',
        testMaterialId: compositionWrite.value.testMaterialId,
      }),
    }));
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'createReadingFullTestFromSelectedPassages',
      expect.objectContaining({ passageIds: ['passage-a', 'passage-b'] }),
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'teacher_materials_reading_full_test_composition_created',
      expect.objectContaining({ passageCount: 2 }),
    );
  }, 30000);

  it('closes the master modal and shows the new test after selected passages publish', async () => {
    const user = userEvent.setup();
    mocks.listReadingPassages.mockResolvedValue([
      {
        id: 'passage-a',
        materialId: 'passage-a',
        ownerId: 'teacher-1',
        title: 'Passage A',
        materialKind: 'reading-passage',
        questionCount: 10,
        durationMinutes: 12,
        updatedAt: '2026-05-12T00:00:00Z',
        visibility: 'private',
        publishedSnapshotVersionId: 'snapshot-a',
        sourceOrderDisplay: 'Passage 1',
        sourceQuestionRange: '1-10',
        isOwner: true,
        selectable: true,
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        actions: [{ key: 'open', label: 'Open' }],
      },
      {
        id: 'passage-b',
        materialId: 'passage-b',
        ownerId: 'teacher-1',
        title: 'Passage B',
        materialKind: 'reading-passage',
        questionCount: 11,
        durationMinutes: 13,
        updatedAt: '2026-05-12T00:00:00Z',
        visibility: 'private',
        publishedSnapshotVersionId: 'snapshot-b',
        sourceOrderDisplay: 'Passage 2',
        sourceQuestionRange: '11-21',
        isOwner: true,
        selectable: true,
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        actions: [{ key: 'open', label: 'Open' }],
      },
    ]);
    mocks.dbReads[readingV2StoragePaths.publishedSnapshots('passage-a', 'snapshot-a')] =
      readingPassageSnapshotFor('passage-a', 'snapshot-a');
    mocks.dbReads[readingV2StoragePaths.publishedSnapshots('passage-b', 'snapshot-b')] =
      readingPassageSnapshotFor('passage-b', 'snapshot-b');

    renderTeacherLobbyWithToasts();

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));
    await screen.findByTestId('material-list-row-passage-a');
    await user.click(screen.getByRole('button', { name: 'Select Passage A' }));
    await user.click(screen.getByRole('button', { name: 'Select Passage B' }));
    await user.click(screen.getByRole('button', { name: 'Create full test from selected' }));
    await screen.findByRole('dialog', { name: /edit reading v2 master/i });

    await user.click(screen.getByRole('button', { name: 'Publish Master' }));

    await waitFor(() => {
      expect(mocks.masterModalProps.at(-1)).toEqual(expect.objectContaining({
        mode: 'published',
        master: expect.objectContaining({
          mode: 'published',
          publishedVersionId: expect.any(String),
        }),
      }));
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /edit reading v2 master/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('tablist', { name: /teacher lobby content tabs/i }))
      .toHaveAttribute('data-active-tab', 'my');
    expect(screen.getByText('Published "Selected Reading Passages". It is now visible in My Content.').closest('.toast-card'))
      .toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'reading_v2_master_publish_completed',
      expect.objectContaining({
        source: 'teacher_lobby_master_modal',
        publishedVersionId: expect.any(String),
      }),
    );
  }, 30000);

  it('keeps Reading Passage selection visible after create-full-test failure', async () => {
    const user = userEvent.setup();
    mocks.listReadingPassages.mockResolvedValue([
      {
        id: 'passage-a',
        materialId: 'passage-a',
        ownerId: 'teacher-1',
        title: 'Passage A',
        materialKind: 'reading-passage',
        questionCount: 10,
        updatedAt: '2026-05-12T00:00:00Z',
        visibility: 'private',
        publishedSnapshotVersionId: null,
        sourceOrderDisplay: 'Passage 1',
        sourceQuestionRange: '1-10',
        isOwner: true,
        selectable: true,
        testTypeIds: ['ielts'],
        testTypes: [{ testTypeId: 'ielts', label: 'IELTS', shortLabel: 'IELTS', active: true }],
        actions: [{ key: 'open', label: 'Open' }, { key: 'assign-homework', label: 'Assign homework' }],
      },
    ]);

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));
    await screen.findByTestId('material-list-row-passage-a');

    await user.click(screen.getByRole('button', { name: 'Select Passage A' }));
    await user.click(screen.getByRole('button', { name: 'Create full test from selected' }));

    expect(await screen.findByText('Selected Reading Passage is missing a published snapshot version.'))
      .toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry create full test' })).toBeEnabled();
    expect(mocks.dbWrites).toHaveLength(0);
    expect(mocks.navigateTo).not.toHaveBeenCalledWith(
      'TEACHER_READING_V2_REVISE',
      expect.anything(),
      expect.anything(),
    );
  });

  it('shows concise empty state when Reading Passage tab has no rows', async () => {
    const user = userEvent.setup();

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));

    expect(await screen.findByText('No Reading Passages yet')).toBeInTheDocument();
    expect(screen.getByText('Passages will appear after Reading V2 full tests are published or imported.')).toBeInTheDocument();
  });

  it('shows retryable load-error states for Reading Passage and Book list surfaces', async () => {
    const user = userEvent.setup();
    mocks.listReadingPassages.mockRejectedValueOnce(new Error('permission_denied'));
    mocks.listTeacherBooks.mockRejectedValueOnce(new Error('index unavailable'));

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('tab', { name: 'Reading Passage' }));
    expect(await screen.findByText('Reading Passages unavailable')).toBeInTheDocument();
    expect(screen.getByText('Failed to load Reading Passages.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Book' }));
    expect(await screen.findByText('Books unavailable')).toBeInTheDocument();
    expect(screen.getByText('Failed to load Books.')).toBeInTheDocument();

    expect(mocks.logDiagnostic).toHaveBeenCalledWith(
      'reading_passage_list_failed',
      expect.objectContaining({ scope: 'private', message: 'permission_denied' }),
    );
    expect(mocks.logDiagnostic).toHaveBeenCalledWith(
      'book_list_failed',
      expect.objectContaining({ scope: 'private', message: 'index unavailable' }),
    );
  });
});
