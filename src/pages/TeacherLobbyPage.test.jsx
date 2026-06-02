import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TeacherLobbyPage from './TeacherLobbyPage';

const mocks = vi.hoisted(() => ({
  tests: [],
  drafts: [],
  navigateTo: vi.fn(),
  logout: vi.fn(),
  trackAction: vi.fn(),
  refreshTests: vi.fn(),
  refreshDrafts: vi.fn(),
  openEditTest: vi.fn(),
  openEditThcsTest: vi.fn(),
  openTestCreation: vi.fn(),
  openUseAsIs: vi.fn(),
  openHwDialog: vi.fn(),
  startSession: vi.fn(),
  logDiagnostic: vi.fn(),
  loadedScope: 'owned',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({}),
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
      useAsIs: { show: false, test: null },
    },
    openEditTest: mocks.openEditTest,
    closeEditTest: vi.fn(),
    openEditThcsTest: mocks.openEditThcsTest,
    closeEditThcsTest: vi.fn(),
    openTestCreation: mocks.openTestCreation,
    closeTestCreation: vi.fn(),
    openUseAsIs: mocks.openUseAsIs,
    closeUseAsIs: vi.fn(),
    openHwDialog: mocks.openHwDialog,
    closeHwDialog: vi.fn(),
  }),
}));

vi.mock('../hooks/test/useTeacherTests', () => ({
  useTeacherTests: () => ({
    tests: mocks.tests,
    loading: false,
    loadedScope: mocks.loadedScope,
    deleteTest: vi.fn(),
    togglePublic: vi.fn(),
    refresh: mocks.refreshTests,
  }),
}));

vi.mock('../hooks/thcs/useTeacherDrafts', () => ({
  useTeacherDrafts: () => ({
    drafts: mocks.drafts,
    loading: false,
    error: null,
    deleteDraft: vi.fn(),
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

vi.mock('../hooks/test/useTestFilters', () => ({
  useTestFilters: (tests) => ({ filteredTests: tests }),
}));

vi.mock('../components/navigation', () => ({
  TeacherHeader: () => <header data-testid="teacher-header">Teacher Header</header>,
}));

vi.mock('../components/modern', () => ({
  Card: ({ children }) => <section>{children}</section>,
  CardBody: ({ children }) => <div>{children}</div>,
}));

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
  default: ({ draft, onResume }) => (
    <article data-testid={`draft-card-${draft.id}`}>
      <h2>{draft.metadata?.title || 'Untitled Draft'}</h2>
      <button type="button" onClick={() => onResume(draft)}>Resume Editing</button>
    </article>
  ),
}));

vi.mock('../components/modern/ContentTabs', () => ({
  default: ({ activeTab, onTabChange }) => (
    <nav aria-label="Teacher lobby content tabs" data-active-tab={activeTab}>
      <button type="button" onClick={() => onTabChange('my')}>My Content</button>
      <button type="button" onClick={() => onTabChange('public')}>Public Library</button>
      <button type="button" onClick={() => onTabChange('drafts')}>Drafts</button>
      <button type="button" onClick={() => onTabChange('reading-passage')}>Reading Passage</button>
      <button type="button" onClick={() => onTabChange('book')}>Book</button>
    </nav>
  ),
}));

vi.mock('../components/modern/SearchFilterBar', () => ({
  default: ({ onCreateNew, viewMode, onViewModeChange }) => (
    <div data-testid="search-filter-bar" data-view-mode={viewMode}>
      <button type="button" onClick={onCreateNew}>Create New</button>
      {viewMode && (
        <>
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            onClick={() => onViewModeChange('grid')}
          >
            Grid view
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            onClick={() => onViewModeChange('list')}
          >
            List view
          </button>
        </>
      )}
    </div>
  ),
}));

vi.mock('../components/modern/MaterialListView', () => ({
  default: ({ rows }) => (
    <section data-testid="material-list-view">
      {rows.map((row) => (
        <article key={row.id} data-testid={`material-list-row-${row.id}`}>
          <h2>{row.title}</h2>
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

vi.mock('../components/SessionBanner', () => ({
  default: () => null,
}));

vi.mock('../components/ClassSelectionModal', () => ({
  default: () => null,
}));

vi.mock('../components/UseAsIsModal', () => ({
  default: () => null,
}));

describe('TeacherLobbyPage Reading V2 integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tests = [];
    mocks.drafts = [];
    mocks.loadedScope = 'owned';
  });

  it('keeps the unified TeacherHeader attached to the page root', () => {
    const { container } = render(<TeacherLobbyPage />);
    const pageRoot = container.firstElementChild;
    const teacherHeader = screen.getByTestId('teacher-header');

    expect(teacherHeader.parentElement).toBe(pageRoot);
    expect(pageRoot.firstElementChild).toBe(teacherHeader);
    expect(teacherHeader.nextElementSibling?.tagName).toBe('MAIN');
  });

  it('renders content tabs next to the dashboard subtitle', () => {
    const { container } = render(<TeacherLobbyPage />);

    const subtitle = screen.getByText('Manage your tests and start formal assessment sessions');
    const tabNav = screen.getByRole('navigation', { name: 'Teacher lobby content tabs' });
    const subhead = container.querySelector('.teacher-lobby-page-subhead');

    expect(subtitle).toBeInTheDocument();
    expect(subhead).not.toBeNull();
    expect(subhead).toContainElement(subtitle);
    expect(subhead).toContainElement(tabNav);
  });

  it('shows published Reading V2 cards as normal Materials cards without Studio modal controls', async () => {
    const user = userEvent.setup();
    mocks.tests = [
      {
        id: 'material-v2',
        materialId: 'material-v2',
        deliveryEngine: 'reading-v2',
        ownerId: 'teacher-1',
        title: 'Published Reading V2',
        materialKind: 'full-test',
      },
    ];

    render(<TeacherLobbyPage />);

    expect(screen.getByTestId('test-card-material-v2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Reading V2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import Reading V2' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Reading V2 Studio modal adapter' })).not.toBeInTheDocument();

    await user.click(within(screen.getByTestId('test-card-material-v2')).getByRole('button', { name: 'Edit' }));

    expect(mocks.openEditTest).not.toHaveBeenCalled();
    expect(mocks.navigateTo).toHaveBeenCalledWith(
      'TEACHER_READING_V2_REVISE',
      { materialId: 'material-v2' },
      { reason: 'teacher_lobby_edit_reading_v2_material' }
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'editTest',
      expect.objectContaining({
        source: 'teacher_lobby_test_card',
        skill: 'reading-v2',
        testId: 'material-v2',
      })
    );

    await user.click(within(screen.getByTestId('test-card-material-v2')).getByRole('button', { name: 'Start' }));

    expect(mocks.startSession).toHaveBeenCalledWith('material-v2', 'test');
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

    render(<TeacherLobbyPage />);

    await user.click(within(screen.getByTestId('test-card-legacy-reading-1')).getByRole('button', { name: 'Edit' }));

    expect(mocks.openEditTest).toHaveBeenCalledWith(legacyReadingTest);
    expect(screen.queryByRole('dialog', { name: 'Reading V2 Studio modal adapter' })).not.toBeInTheDocument();
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

    render(<TeacherLobbyPage />);

    expect(screen.queryByTestId('test-card-passage-asset-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('test-card-material-v2')).toBeInTheDocument();
  });

  it('switches Materials into list view and keeps existing actions wired', async () => {
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

    expect(screen.getByTestId('test-card-legacy-reading-1')).toBeInTheDocument();
    expect(screen.getByTestId('search-filter-bar')).toHaveAttribute('data-view-mode', 'grid');

    await user.click(screen.getByRole('button', { name: 'List view' }));

    expect(screen.getByTestId('material-list-view')).toBeInTheDocument();
    expect(screen.getByTestId('material-list-row-legacy-reading-1')).toBeInTheDocument();
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'testCreation',
      'changeMaterialsViewMode',
      expect.objectContaining({
        source: 'teacher_lobby_materials_toolbar',
        tab: 'my',
        viewMode: 'list',
      })
    );

    await user.click(within(screen.getByTestId('material-list-row-legacy-reading-1')).getByRole('button', { name: 'Start Test' }));
    expect(mocks.startSession).toHaveBeenCalledWith('legacy-reading-1', 'test');
  });

  it('includes viewMode in Teacher Materials render diagnostics', async () => {
    const user = userEvent.setup();
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
        expect.objectContaining({ viewMode: 'grid', visibleCount: 1 })
      );
    });

    await user.click(screen.getByRole('button', { name: 'List view' }));

    await waitFor(() => {
      expect(mocks.logDiagnostic).toHaveBeenCalledWith(
        'grid_rendered',
        expect.objectContaining({ viewMode: 'list', visibleCount: 1 })
      );
    });
  });

  it('does not expose Reading V2 drafts through Teacher Lobby draft cards', async () => {
    const user = userEvent.setup();
    mocks.drafts = [
      {
        id: 'draft-v2',
        draftId: 'draft-v2',
        deliveryEngine: 'reading-v2',
        metadata: { title: 'Reading V2 Draft' },
      },
    ];

    render(<TeacherLobbyPage />);

    await user.click(screen.getByRole('button', { name: 'Drafts' }));

    expect(screen.queryByTestId('draft-card-draft-v2')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Reading V2 Studio modal adapter' })).not.toBeInTheDocument();
    expect(mocks.navigateTo).not.toHaveBeenCalled();
  });
});
