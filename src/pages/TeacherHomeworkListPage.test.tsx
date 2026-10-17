import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseHomeworkListReturn } from '../hooks/useHomeworkList';
import type { HomeworkAssignment } from '../types/homework.types';
import { isBookHomeworkCompatibilityProjection } from '../services/book-homework/bookHomeworkCompatibilityProjection.service';
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
    mockTrackAction,
    mockToggle,
    useBulkSelectionMock,
    useHomeworkListMock,
    useTargetGridMock,
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
    mockTrackAction: vi.fn(),
    mockToggle: vi.fn(),
    useBulkSelectionMock: vi.fn(),
    useHomeworkListMock: vi.fn(),
    useTargetGridMock: vi.fn(),
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

vi.mock('../hooks/useFeatureTracking', () => ({
    useFeatureTracking: () => ({ trackAction: mockTrackAction }),
}));

vi.mock('../hooks/useHomeworkList', () => ({
    useHomeworkList: (options: unknown) => useHomeworkListMock(options),
}));

vi.mock('../hooks/useTargetGrid', () => ({
    useTargetGrid: (...args: unknown[]) => useTargetGridMock(...args),
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
    }) => (isOpen ? <div>{`Edit homework modal ${homework?.id}`}</div> : null),
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
            <span>{`${selectedCount} selected`}</span>
            <button onClick={onExtend}>Extend</button>
            <button onClick={onClose}>Close</button>
            <button onClick={onDelete}>Delete</button>
            <button onClick={onDuplicate}>Duplicate</button>
            <button onClick={onDeselectAll}>Deselect All</button>
            <button onClick={onCloseAllPastDue}>Close All Past Due</button>
        </div>
    ),
    CompactStatsBar: ({
        totalCount,
        visibleCount,
        activeScheduledCount,
        pastDueCount,
        avgCompletionRate,
        needsAttentionCount,
        onClosePastDue,
        onCreateHomework,
    }: {
        totalCount: number;
        visibleCount: number;
        activeScheduledCount: number;
        pastDueCount: number;
        avgCompletionRate: number;
        needsAttentionCount: number;
        onClosePastDue: () => void;
        onCreateHomework: () => void;
    }) => (
        <div data-testid="compact-stats-bar">
            <div>{`Total: ${totalCount}`}</div>
            <div>{`Visible: ${visibleCount}`}</div>
            <div>{`Active: ${activeScheduledCount}`}</div>
            <div>{`Past Due: ${pastDueCount}`}</div>
            <div>{`Avg: ${Math.round(avgCompletionRate)}%`}</div>
            <div>{`Attention: ${needsAttentionCount}`}</div>
            <button onClick={onClosePastDue}>Close All Past Due</button>
            <button onClick={onCreateHomework}>Create Homework</button>
        </div>
    ),
    TargetGrid: ({
        targetCards,
        onTargetClick,
    }: {
        targetCards: Array<{ targetId: string; targetName: string }>;
        onTargetClick: (target: any) => void;
    }) => (
        <div data-testid="target-grid">
            {targetCards.map((target) => (
                <button key={target.targetId} onClick={() => onTargetClick(target)}>
                    {target.targetName}
                </button>
            ))}
        </div>
    ),
    StudentGrid: ({
        className,
        onBack,
        onStudentClick,
    }: {
        className: string;
        onBack: () => void;
        onStudentClick: (studentId: string, studentName: string, classId?: string, className?: string) => void;
    }) => (
        <div data-testid="student-grid">
            <div>{`Students for ${className}`}</div>
            <button onClick={() => onStudentClick('student-1', 'Alex', 'class-a', className)}>Open Alex</button>
            <button onClick={onBack}>Back</button>
        </div>
    ),
    HomeworkListModal: ({
        isOpen,
        studentName,
    }: {
        isOpen: boolean;
        studentName: string;
    }) => (isOpen ? <div>{`Homework list modal ${studentName}`}</div> : null),
}));

const NOW = new Date('2026-03-13T08:00:00.000Z').getTime();

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

const bookHomework = {
    schemaVersion: 1,
    assignmentKind: 'book_homework_compatibility',
    id: 'hw-book',
    createdBy: 'teacher-123',
    createdAt: NOW - 2 * 24 * 60 * 60 * 1000,
    updatedAt: NOW,
    materialId: 'book-material-1',
    materialTitle: 'Book bridge assignment',
    materialType: 'book',
    materialSkill: 'mixed',
    title: 'Book bridge assignment',
    target: {
        type: 'students',
        studentIds: ['student-1'],
    },
    scheduling: {
        dueDate: NOW + 48 * 60 * 60 * 1000,
    },
    config: {
        timerMinutes: null,
        maxAttempts: null,
        feedbackTiming: 'never',
        lateSubmissionAllowed: false,
    },
    visibility: {
        showTimer: false,
        showAttempts: false,
        showDueDate: true,
        showDuration: false,
        showQuestionCount: false,
    },
    archived: false,
    tags: [],
    bookHomeworkCompatibility: {
        schemaVersion: 1,
        assignmentId: 'hw-book',
        sourceSagaRevision: 4,
        sourceFingerprint: 'fingerprint-book',
    },
} as unknown as HomeworkAssignment;

allHomework.push(bookHomework);

const targetCards = [
    {
        targetId: 'class-a',
        targetName: 'Class A',
        targetType: 'class',
        homework: [allHomework[0]],
    },
    {
        targetId: 'class-b',
        targetName: 'Class B',
        targetType: 'class',
        homework: [allHomework[2]],
    },
    {
        targetId: 'student-1',
        targetName: 'Alex',
        targetType: 'students',
        homework: [allHomework[1]],
    },
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
    return items.filter((homework) => !isBookHomeworkCompatibilityProjection(homework)).reduce<Record<string, number>>((counts, homework) => {
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
        useTargetGridMock.mockReset();
        useHomeworkTagsMock.mockReset();

        useHomeworkListMock.mockImplementation((options) =>
            buildHookResult(options as {
                excludeArchived?: boolean;
                excludeClosed?: boolean;
                searchQuery?: string;
            })
        );
        useTargetGridMock.mockImplementation(() => ({ targetCards }));
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
                { id: 'practice', label: 'Practice', color: '#3b82f6' },
                { id: 'revision', label: 'Revision', color: '#10b981' },
            ],
            loading: false,
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders the current targets-first management view', () => {
        renderPage();

        expect(screen.getByText(/Homework Management/)).toBeInTheDocument();
        expect(screen.getByText('Total: 5')).toBeInTheDocument();
        expect(screen.getByText('Visible: 3')).toBeInTheDocument();
        expect(screen.getByText('Targets')).toBeInTheDocument();
        expect(screen.getByText('Timeline')).toBeInTheDocument();
        expect(screen.getByText('By Status')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search classes, students, or homework...')).toBeInTheDocument();
        expect(screen.getByTestId('target-grid')).toBeInTheDocument();
        expect(screen.getByText('Class A')).toBeInTheDocument();
        expect(screen.getByText('Class B')).toBeInTheDocument();
        expect(screen.getByText('Alex')).toBeInTheDocument();
        expect(screen.queryByTestId('homework-card-hw-active')).not.toBeInTheDocument();
        const bookCard = screen.getByTestId('book-homework-card-hw-book');
        expect(bookCard).toBeInTheDocument();
        expect(screen.getByText('Book Homework')).toBeInTheDocument();
        expect(bookCard).not.toHaveTextContent(/active|past due|completion|average|attempts|stats/i);
        expect(screen.getByText('Total: 5')).toBeInTheDocument();
        expect(useTargetGridMock).toHaveBeenLastCalledWith(allHomework.slice(0, 5), '');
    });

    it('routes the marker-aware Book row to teacher detail without legacy card actions', () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'View details' }));

        expect(mockNavigateTo).toHaveBeenCalledWith(
            'TEACHER_HOMEWORK_DETAIL',
            { homeworkId: 'hw-book' },
            { reason: 'teacher_open_homework_detail' },
        );
        expect(mockTrackAction).toHaveBeenCalledWith(
            'bookHomeworkTeacherDetailOpened',
            {
                homeworkId: 'hw-book',
                source: 'teacher_homework_list',
            },
        );
        expect(screen.queryByTestId('homework-card-hw-book')).not.toBeInTheDocument();
    });

    it('excludes a selected Book shell from bulk mutations', async () => {
        useBulkSelectionMock.mockReturnValue({
            selected: new Set(['hw-book']),
            selectedCount: 1,
            toggle: mockToggle,
            selectAll: mockSelectAll,
            deselectAll: mockDeselectAll,
            isSelected: mockIsSelected,
        });

        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(mockBulkCloseHomework).not.toHaveBeenCalled();
    });

    it('debounces the search input and filters timeline results', async () => {
        renderPage();

        fireEvent.change(screen.getByPlaceholderText('Search classes, students, or homework...'), {
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
        expect(useTargetGridMock).toHaveBeenLastCalledWith(allHomework.slice(0, 5), 'english');

        fireEvent.click(screen.getByText('Timeline'));
        expect(screen.getByTestId('homework-card-hw-active')).toBeInTheDocument();
        expect(screen.queryByTestId('homework-card-hw-past-due')).not.toBeInTheDocument();
        expect(screen.queryByTestId('homework-card-hw-scheduled')).not.toBeInTheDocument();
    });

    it('opens the create modal from the stats bar', () => {
        renderPage();

        fireEvent.click(screen.getByText('Create Homework'));
        expect(screen.getByText('Create homework modal')).toBeInTheDocument();
    });

    it('drills into a class target from the targets view', () => {
        renderPage();

        fireEvent.click(screen.getByText('Class A'));

        expect(screen.getByText('Students for Class A')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Open Alex'));
        expect(screen.getByText('Homework list modal Alex')).toBeInTheDocument();
    });

    it('renders homework cards in timeline view', () => {
        renderPage();

        fireEvent.click(screen.getByText('Timeline'));

        expect(screen.getByTestId('homework-card-hw-active')).toBeInTheDocument();
        expect(screen.getByTestId('homework-card-hw-past-due')).toBeInTheDocument();
        expect(screen.getByTestId('homework-card-hw-scheduled')).toBeInTheDocument();
        expect(screen.queryByTestId('homework-card-hw-closed')).not.toBeInTheDocument();
        expect(screen.queryByTestId('homework-card-hw-archived')).not.toBeInTheDocument();
    });

    it('groups homework by status in the status view', () => {
        renderPage();

        fireEvent.click(screen.getByText('By Status'));

        expect(screen.getByText('Active (1)')).toBeInTheDocument();
        expect(screen.getByText('Scheduled (1)')).toBeInTheDocument();
        expect(screen.getByText('Past Due (1)')).toBeInTheDocument();
    });

    it('shows the loader state when the hook is loading', () => {
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

    it('shows the retry state and calls refetch when retry is clicked', () => {
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

    it('renders the load more control when more results are available', () => {
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
