/**
 * Tests for TeacherHomeworkListPage.tsx
 *
 * Tests cover:
 * - Page rendering and initial state
 * - View mode switching (chronological, by class, by status)
 * - Search and filtering functionality
 * - Homework CRUD operations
 * - Status counts display
 * - Empty states
 * - Error handling
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../types/homework.types';
import type { UseHomeworkListReturn } from '../hooks/useHomeworkList';
import { TeacherHomeworkListPage } from './TeacherHomeworkListPage';

const {
    mockBulkCloseHomework,
    mockBulkExtendDeadlines,
    mockDeselectAll,
    mockFilterByStatus,
    mockIsSelected,
    mockLoadMore,
    mockLogout,
    mockNavigateTo,
    mockRefetch,
    mockSelectAll,
    mockSelectHomeworkForBulkOperation,
    mockSetSort,
    mockSetTagFilter,
    mockToggle,
    useBulkSelectionMock,
    useHomeworkListMock,
    useHomeworkTagsMock,
} = vi.hoisted(() => ({
    mockBulkCloseHomework: vi.fn(async () => ({ success: 1, failed: 0, total: 1, results: [] })),
    mockBulkExtendDeadlines: vi.fn(async () => ({ success: 1, failed: 0, total: 1, results: [] })),
    mockDeselectAll: vi.fn(),
    mockFilterByStatus: vi.fn(),
    mockIsSelected: vi.fn(() => false),
    mockLoadMore: vi.fn(async () => undefined),
    mockLogout: vi.fn(async () => undefined),
    mockNavigateTo: vi.fn(),
    mockRefetch: vi.fn(async () => undefined),
    mockSelectAll: vi.fn(),
    mockSelectHomeworkForBulkOperation: vi.fn(async () => []),
    mockSetSort: vi.fn(),
    mockSetTagFilter: vi.fn(),
    mockToggle: vi.fn(),
    useBulkSelectionMock: vi.fn(),
    useHomeworkListMock: vi.fn(),
    useHomeworkTagsMock: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'teacher-123',
            displayName: 'Teacher Example',
            email: 'teacher@example.com',
        },
        profile: {
            role: 'teacher',
            displayName: 'Teacher Example',
            email: 'teacher@example.com',
        },
        logout: mockLogout,
    }),
}));

vi.mock('../hooks/useNavigation', () => ({
    useNavigation: () => ({
        navigateTo: mockNavigateTo,
    }),
}));

vi.mock('../hooks/useHomeworkList', () => ({
    useHomeworkList: (options: unknown) => useHomeworkListMock(options),
}));

vi.mock('../hooks/useBulkSelection', () => ({
    useBulkSelection: () => useBulkSelectionMock(),
}));

vi.mock('../hooks/useHomeworkTags', () => ({
    useHomeworkTags: () => useHomeworkTagsMock(),
}));

vi.mock('../services/homeworkManager', () => ({
    archiveHomework: vi.fn(),
    deleteHomework: vi.fn(),
    duplicateHomework: vi.fn(),
    extendDeadline: vi.fn(),
    permanentlyDeleteHomework: vi.fn(),
    restoreHomework: vi.fn(),
}));

vi.mock('../services/homeworkBulkOperations', () => ({
    bulkCloseHomework: mockBulkCloseHomework,
    bulkExtendDeadlines: mockBulkExtendDeadlines,
    closeAllPastDueHomework: vi.fn(async () => ({ success: 1, failed: 0 })),
    selectHomeworkForBulkOperation: mockSelectHomeworkForBulkOperation,
}));

vi.mock('../components/navigation', () => ({
    TeacherHeader: ({ pageTitle }: { pageTitle: string }) => <div>{pageTitle}</div>,
}));

vi.mock('../components/homework', () => ({
    HomeworkAlertBanner: ({
        alerts,
    }: {
        alerts: Array<{ id: string; title: string; message: string; actionLabel?: string; onAction?: () => void }>;
    }) => (
        <div>
            {alerts.map((alert) => (
                <div key={alert.id}>
                    <div>{alert.title}</div>
                    <div>{alert.message}</div>
                    {alert.actionLabel && alert.onAction ? (
                        <button onClick={alert.onAction}>{alert.actionLabel}</button>
                    ) : null}
                </div>
            ))}
        </div>
    ),
    HomeworkCard: ({ homework }: { homework: HomeworkAssignment }) => (
        <div data-testid={`homework-card-${homework.id}`}>{homework.title || homework.materialTitle}</div>
    ),
    HomeworkCreateModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Create homework modal</div> : null),
    HomeworkEditModal: ({
        homework,
        isOpen,
    }: {
        homework: HomeworkAssignment | null;
        isOpen: boolean;
    }) => (isOpen ? <div>Edit homework modal {homework?.id}</div> : null),
    BulkExtendModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Bulk extend modal</div> : null),
    BulkDeleteConfirmModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>Bulk delete modal</div> : null),
    HomeworkBulkActionBar: ({
        selectedCount,
        onExtend,
        onClose,
        onDelete,
        onDuplicate,
        onDeselectAll,
        onCloseAllPastDue,
    }: {
        selectedCount: number;
        onExtend: () => void;
        onClose: () => void;
        onDelete: () => void;
        onDuplicate: () => void;
        onDeselectAll: () => void;
        onCloseAllPastDue: () => void;
    }) => (
        <div>
            <span>{selectedCount} selected</span>
            <button onClick={onExtend}>Extend</button>
            <button onClick={onClose}>Close</button>
            <button onClick={onDelete}>Delete</button>
            <button onClick={onDuplicate}>Duplicate</button>
            <button onClick={onDeselectAll}>Deselect All</button>
            <button onClick={onCloseAllPastDue}>Close All Past Due</button>
        </div>
    ),
    HomeworkSummaryStats: ({
        actions,
        cards,
    }: {
        actions?: React.ReactNode;
        cards?: Array<{ label: string; value: string; helper?: string }>;
    }) => (
        <div>
            {cards?.map((card) => (
                <div key={card.label}>
                    <span>{card.label}</span>
                    <span>{card.value}</span>
                    {card.helper ? <span>{card.helper}</span> : null}
                </div>
            ))}
            <div>{actions}</div>
        </div>
    ),
    HomeworkTagChips: ({
        allTags,
        onTagSelect,
        selectable,
    }: {
        allTags?: Array<{ id: string; label: string }>;
        onTagSelect?: (tag: string | null) => void;
        selectable?: boolean;
    }) => (
        <div data-testid="homework-tag-chips">
            {selectable ? <button onClick={() => onTagSelect?.(null)}>All</button> : null}
            {allTags?.map((tag) => (
                <button key={tag.id} onClick={() => onTagSelect?.(tag.id)}>
                    {tag.label}
                </button>
            ))}
        </div>
    ),
}));

const NOW = new Date('2026-03-13T08:00:00.000Z').getTime();

// Mock homework data
function createHomework(overrides: Partial<HomeworkAssignment>): HomeworkAssignment {
    return {
        id: overrides.id ?? 'homework-default',
        createdBy: 'teacher-123',
        createdAt: NOW - 7 * 24 * 60 * 60 * 1000,
        updatedAt: NOW,
        materialId: 'material-default',
        materialTitle: 'Untitled Homework',
        materialType: 'quiz',
        materialSkill: 'reading',
        target: {
            type: 'class',
            classId: 'class-default',
            className: 'Class Default',
        },
        scheduling: {
            availableFrom: NOW - 24 * 60 * 60 * 1000,
            dueDate: NOW + 24 * 60 * 60 * 1000,
        },
        config: {
            timerMinutes: 30,
            maxAttempts: 2,
            feedbackTiming: 'after_completion',
            lateSubmissionAllowed: false,
        },
        visibility: {
            showAttempts: true,
            showDueDate: true,
            showDuration: true,
            showQuestionCount: true,
            showTimer: true,
        },
        status: 'active',
        stats: {
            totalAssigned: 20,
            started: 10,
            submitted: 8,
            lateSubmissions: 0,
            completionRate: 40,
            averageScore: 82,
        },
        ...overrides,
    };
}

const allHomework: HomeworkAssignment[] = [
    createHomework({
        id: 'hw-active',
        title: 'English Grammar Test',
        materialTitle: 'English Grammar Test',
        target: {
            type: 'class',
            classId: 'class-a',
            className: 'Class A',
        },
        scheduling: {
            availableFrom: NOW - 2 * 24 * 60 * 60 * 1000,
            dueDate: NOW + 8 * 60 * 60 * 1000,
        },
        status: 'active',
        stats: {
            totalAssigned: 24,
            started: 18,
            submitted: 15,
            lateSubmissions: 0,
            completionRate: 63,
            averageScore: 84,
        },
        tags: ['grammar'],
    }),
    createHomework({
        id: 'hw-past-due',
        title: 'Math Quiz',
        materialTitle: 'Math Quiz',
        target: {
            type: 'students',
            studentIds: ['student-1', 'student-2'],
            studentNames: ['Alex', 'Jamie'],
        },
        scheduling: {
            availableFrom: NOW - 4 * 24 * 60 * 60 * 1000,
            dueDate: NOW - 2 * 24 * 60 * 60 * 1000,
        },
        status: 'past_due',
        stats: {
            totalAssigned: 2,
            started: 2,
            submitted: 1,
            lateSubmissions: 1,
            completionRate: 50,
            averageScore: 70,
        },
        tags: ['math'],
    }),
    createHomework({
        id: 'hw-scheduled',
        title: 'Science Assignment',
        materialTitle: 'Science Assignment',
        target: {
            type: 'class',
            classId: 'class-b',
            className: 'Class B',
        },
        scheduling: {
            availableFrom: NOW + 6 * 60 * 60 * 1000,
            dueDate: NOW + 3 * 24 * 60 * 60 * 1000,
        },
        status: 'scheduled',
        stats: {
            totalAssigned: 18,
            started: 0,
            submitted: 0,
            lateSubmissions: 0,
            completionRate: 0,
            averageScore: 0,
        },
        tags: ['science'],
    }),
    createHomework({
        id: 'hw-closed',
        title: 'History Review',
        materialTitle: 'History Review',
        target: {
            type: 'class',
            classId: 'class-c',
            className: 'Class C',
        },
        scheduling: {
            availableFrom: NOW - 10 * 24 * 60 * 60 * 1000,
            dueDate: NOW - 5 * 24 * 60 * 60 * 1000,
        },
        status: 'closed',
        stats: {
            totalAssigned: 16,
            started: 16,
            submitted: 16,
            lateSubmissions: 0,
            completionRate: 100,
            averageScore: 88,
        },
        closedAt: NOW - 3 * 24 * 60 * 60 * 1000,
    }),
    createHomework({
        id: 'hw-archived',
        title: 'Archived Writing Practice',
        materialTitle: 'Archived Writing Practice',
        materialType: 'thcs-test',
        materialSkill: 'writing',
        target: {
            type: 'group',
            groupId: 'group-1',
            groupName: 'Archived Group',
            studentIds: ['student-3'],
        },
        scheduling: {
            availableFrom: NOW - 15 * 24 * 60 * 60 * 1000,
            dueDate: NOW - 12 * 24 * 60 * 60 * 1000,
        },
        status: 'active',
        archived: true,
        archivedAt: NOW - 2 * 24 * 60 * 60 * 1000,
        trashExpiresAt: NOW + 28 * 24 * 60 * 60 * 1000,
        stats: {
            totalAssigned: 1,
            started: 1,
            submitted: 1,
            lateSubmissions: 0,
            completionRate: 100,
            averageScore: 92,
        },
        tags: ['archived'],
    }),
];

function normalizeSearchValue(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function matchesSearch(homework: HomeworkAssignment, query: string): boolean {
    const normalizedQuery = normalizeSearchValue(query);
    const targetDisplay =
        homework.target.type === 'class'
            ? homework.target.className ?? homework.target.classId
            : homework.target.type === 'course'
                ? homework.target.courseName ?? homework.target.courseId
                : homework.target.type === 'group'
                    ? homework.target.groupName
                    : homework.target.studentNames?.join(', ') ?? homework.target.studentIds.join(', ');

    return [
        homework.title ?? '',
        homework.materialTitle ?? '',
        homework.description ?? '',
        targetDisplay ?? '',
        ...(homework.tags ?? []),
    ].some((value) => normalizeSearchValue(value).includes(normalizedQuery));
}

function buildStatusCounts(items: HomeworkAssignment[]): Record<string, number> {
    return items.reduce<Record<string, number>>((counts, homework) => {
        counts[homework.status] = (counts[homework.status] ?? 0) + 1;
        return counts;
    }, {});
}

function buildHookResult(
    options: {
        excludeArchived?: boolean;
        excludeClosed?: boolean;
        searchQuery?: string;
    } = {},
    overrides: Partial<UseHomeworkListReturn> = {}
): UseHomeworkListReturn {
    let filteredHomework = [...allHomework];

    if (options.excludeArchived) {
        filteredHomework = filteredHomework.filter((homework) => homework.archived !== true);
    }

    if (options.excludeClosed) {
        filteredHomework = filteredHomework.filter((homework) => homework.status !== 'closed');
    }

    if (options.searchQuery?.trim()) {
        filteredHomework = filteredHomework.filter((homework) => matchesSearch(homework, options.searchQuery ?? ''));
    }

    return {
        homework: allHomework,
        loading: false,
        error: null,
        refetch: mockRefetch,
        filterByStatus: mockFilterByStatus,
        filteredHomework,
        loadMore: mockLoadMore,
        hasMore: false,
        sort: 'dueDate_desc',
        setSort: mockSetSort,
        tagFilter: null,
        setTagFilter: mockSetTagFilter,
        totalLoaded: filteredHomework.length,
        statusCounts: buildStatusCounts(allHomework),
        ...overrides,
    };
}

// Wrapper component for routing
const renderPage = () => render(<TeacherHomeworkListPage />);

describe('TeacherHomeworkListPage', () => {
    beforeEach(() => {
        vi.useFakeTimers();

        mockFilterByStatus.mockReset();
        mockBulkCloseHomework.mockReset();
        mockBulkExtendDeadlines.mockReset();
        mockDeselectAll.mockReset();
        mockIsSelected.mockReset();
        mockLoadMore.mockReset();
        mockLogout.mockReset();
        mockNavigateTo.mockReset();
        mockRefetch.mockReset();
        mockSelectAll.mockReset();
        mockSelectHomeworkForBulkOperation.mockReset();
        mockSetSort.mockReset();
        mockSetTagFilter.mockReset();
        mockToggle.mockReset();
        useHomeworkListMock.mockReset();
        useBulkSelectionMock.mockReset();
        useHomeworkTagsMock.mockReset();

        useHomeworkListMock.mockImplementation((options) =>
            buildHookResult(options as {
                excludeArchived?: boolean;
                excludeClosed?: boolean;
                searchQuery?: string;
            })
        );
        useBulkSelectionMock.mockReturnValue({
            selected: new Set<string>(),
            selectedCount: 0,
            toggle: mockToggle,
            selectAll: mockSelectAll,
            deselectAll: mockDeselectAll,
            isSelected: mockIsSelected,
        });
        useHomeworkTagsMock.mockReturnValue({
            tags: [
                { id: 'practice', label: 'Luyện tập', color: '#3b82f6' },
                { id: 'revision', label: 'Ôn tập', color: '#10b981' },
            ],
            loading: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Initial Rendering', () => {
        it('renders the rewritten summary, alerts, tabs, and visible homework list', () => {
            renderPage();

            expect(screen.getByText('📋 Homework Management')).toBeInTheDocument();
            expect(screen.getByText('Loaded Homework')).toBeInTheDocument();
            expect(screen.getByText('5')).toBeInTheDocument();
            expect(screen.getByText('Going live soon')).toBeInTheDocument();
            expect(screen.getByText('Past deadline')).toBeInTheDocument();
            expect(screen.getByText('📅 Timeline')).toBeInTheDocument();
            expect(screen.getByText('📚 By Class')).toBeInTheDocument();
            expect(screen.getByText('📋 By Status')).toBeInTheDocument();
            expect(screen.getByPlaceholderText('Search by title, target, description, or tags...')).toBeInTheDocument();
            expect(screen.getByTestId('homework-card-hw-active')).toBeInTheDocument();
            expect(screen.getByTestId('homework-card-hw-past-due')).toBeInTheDocument();
            expect(screen.getByTestId('homework-card-hw-scheduled')).toBeInTheDocument();
            expect(screen.queryByTestId('homework-card-hw-closed')).not.toBeInTheDocument();
            expect(screen.queryByTestId('homework-card-hw-archived')).not.toBeInTheDocument();
        });
    });

    describe('Search Functionality', () => {
        it('debounces the search input and passes the query into useHomeworkList', async () => {
            vi.useFakeTimers();

            renderPage();

            fireEvent.change(screen.getByPlaceholderText('Search by title, target, description, or tags...'), {
                target: { value: 'english' },
            });

            await act(async () => {
                vi.advanceTimersByTime(300);
                await Promise.resolve();
            });

            expect(useHomeworkListMock).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    searchQuery: 'english',
                })
            );

            expect(screen.getByTestId('homework-card-hw-active')).toBeInTheDocument();
            expect(screen.queryByTestId('homework-card-hw-past-due')).not.toBeInTheDocument();
            expect(screen.queryByTestId('homework-card-hw-scheduled')).not.toBeInTheDocument();
        });
    });

    describe('Visibility Toggles', () => {
        it('reveals closed homework when the closed toggle is enabled', () => {
            renderPage();

            fireEvent.click(screen.getByText('Show Closed (1)'));

            expect(useHomeworkListMock).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    excludeClosed: false,
                })
            );

            expect(screen.getByTestId('homework-card-hw-closed')).toBeInTheDocument();
        });

        it('reveals archived homework when the archived toggle is enabled', () => {
            renderPage();

            fireEvent.click(screen.getByText('Show Archived'));

            expect(useHomeworkListMock).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    excludeArchived: false,
                })
            );

            expect(screen.getByTestId('homework-card-hw-archived')).toBeInTheDocument();
        });
    });

    describe('Filters and Sorting', () => {
        it('forwards status filter clicks to the hook controller', () => {
            renderPage();

            fireEvent.click(screen.getByText('✅ Active (2)'));

            expect(mockFilterByStatus).toHaveBeenCalledWith('active');
        });

        it('forwards sort changes through the new native select control', () => {
            renderPage();

            fireEvent.change(screen.getByRole('combobox'), {
                target: { value: 'dueDate_asc' },
            });

            expect(mockSetSort).toHaveBeenCalledWith('dueDate_asc');
        });
    });

    describe('View Mode Switching', () => {
        it('groups homework by class in the class view', () => {
            renderPage();

            fireEvent.click(screen.getByText('📚 By Class'));

            expect(screen.getByText('📚 Class A (1)')).toBeInTheDocument();
            expect(screen.getByText('📚 Class B (1)')).toBeInTheDocument();
            expect(screen.getByText('📚 Other (1)')).toBeInTheDocument();
        });

        it('groups homework by status in the status view', () => {
            renderPage();

            fireEvent.click(screen.getByText('📋 By Status'));

            expect(screen.getByText('Active (1)')).toBeInTheDocument();
            expect(screen.getByText('Scheduled (1)')).toBeInTheDocument();
            expect(screen.getByText('Past Due (1)')).toBeInTheDocument();
        });
    });

    describe('Loading State', () => {
        it('shows the vanilla loader state when the hook is loading', () => {
            useHomeworkListMock.mockImplementation(() =>
                buildHookResult({}, {
                    homework: [],
                    filteredHomework: [],
                    loading: true,
                    statusCounts: {},
                    totalLoaded: 0,
                })
            );

            renderPage();

            expect(screen.getByText('Loading homework...')).toBeInTheDocument();
        });
    });

    describe('Error State', () => {
        it('shows the retry state and calls refetch when the user retries', () => {
            useHomeworkListMock.mockImplementation(() =>
                buildHookResult({}, {
                    homework: [],
                    filteredHomework: [],
                    error: 'Failed to load homework',
                    refetch: mockRefetch,
                    statusCounts: {},
                    totalLoaded: 0,
                })
            );

            renderPage();

            expect(screen.getByText('Failed to load homework')).toBeInTheDocument();

            fireEvent.click(screen.getByText('Retry'));
            expect(mockRefetch).toHaveBeenCalled();
        });
    });

    describe('Pagination', () => {
        it('renders the load more control when the hook reports more results', () => {
            useHomeworkListMock.mockImplementation((options) =>
                buildHookResult(
                    options as {
                        excludeArchived?: boolean;
                        excludeClosed?: boolean;
                        searchQuery?: string;
                    },
                    {
                        filteredHomework: buildHookResult(
                            options as {
                                excludeArchived?: boolean;
                                excludeClosed?: boolean;
                                searchQuery?: string;
                            }
                        ).filteredHomework.slice(0, 2),
                        hasMore: true,
                        totalLoaded: 2,
                    }
                )
            );

            renderPage();

            fireEvent.click(screen.getByText('Load More'));
            expect(mockLoadMore).toHaveBeenCalled();
        });
    });
});
