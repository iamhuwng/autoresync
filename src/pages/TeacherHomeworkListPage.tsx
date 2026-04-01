/**
 * Teacher Homework List Page
 * PRD-0016: Solo Study & Homework System
 * 
 * Unified design following app-wide patterns.
 * Uses TeacherHeader, AppShell, and modern components.
 */

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useBulkSelection } from '../hooks/useBulkSelection';
import { useHomeworkTags } from '../hooks/useHomeworkTags';
import { useNavigation } from '../hooks/useNavigation';
import { useHomeworkList } from '../hooks/useHomeworkList';
import { useTargetGrid } from '../hooks/useTargetGrid';
import {
    BulkDeleteConfirmModal,
    BulkExtendModal,
    HomeworkBulkActionBar,
    HomeworkCard,
    HomeworkCreateModal,
    HomeworkEditModal,
    TargetGrid,
    CompactStatsBar,
    HomeworkListModal,
    StudentGrid,
} from '../components/homework';
import {
    TargetPinIcon,
    CalendarIcon,
    BarChartIcon,
    EmptyHomeworkIcon,
    ActiveIcon,
    ClockIcon,
    WarningIcon,
    EditIcon,
    CheckCircleIcon,
    ClearIcon,
} from '../components/homework/HomeworkIcons';
import { archiveHomework, deleteHomework, duplicateHomework, extendDeadline, permanentlyDeleteHomework, restoreHomework } from '../services/homeworkManager';
import { bulkCloseHomework, bulkExtendDeadlines, closeAllPastDueHomework, selectHomeworkForBulkOperation } from '../services/homeworkBulkOperations';
import type { HomeworkAssignment, HomeworkStatus } from '../types/homework.types';

import { Card, CardBody, Button, Input, VanillaLoader, VanillaTabs, toast } from '../components/modern';
import { TeacherHeader } from '../components/navigation';

type ViewMode = 'targets' | 'chronological' | 'by_status';
type CreateModalFilter = 'all' | 'thcs-test';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getHomeworkAlertBadge(homework: HomeworkAssignment): { text: string; background: string; color: string } | null {
    const now = Date.now();
    const availableFrom = homework.scheduling.availableFrom;

    if (homework.status === 'scheduled' && typeof availableFrom === 'number' && availableFrom > now && availableFrom - now <= DAY_IN_MS) {
        const hours = Math.max(1, Math.round((availableFrom - now) / (60 * 60 * 1000)));
        return {
            text: `⚡ Goes live in ${hours}h`,
            background: 'rgba(99,102,241,0.12)',
            color: '#4338ca',
        };
    }

    if (homework.status === 'active' && homework.scheduling.dueDate > now && homework.scheduling.dueDate - now <= DAY_IN_MS) {
        const hours = Math.max(1, Math.round((homework.scheduling.dueDate - now) / (60 * 60 * 1000)));
        return {
            text: `🔥 Deadline in ${hours}h`,
            background: 'rgba(245,158,11,0.16)',
            color: '#b45309',
        };
    }

    if (homework.status === 'past_due') {
        const days = Math.max(1, Math.round((now - homework.scheduling.dueDate) / DAY_IN_MS));
        return {
            text: `⚠️ Overdue ${days}d`,
            background: 'rgba(239,68,68,0.12)',
            color: '#b91c1c',
        };
    }

    return null;
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'active': return <ActiveIcon size={16} />;
        case 'scheduled': return <ClockIcon size={16} />;
        case 'past_due': return <WarningIcon size={16} />;
        case 'draft': return <EditIcon size={16} />;
        case 'closed': return <CheckCircleIcon size={16} />;
        default: return null;
    }
}

function getStatusLabel(status: string) {
    switch (status) {
        case 'active': return 'Active';
        case 'scheduled': return 'Scheduled';
        case 'past_due': return 'Past Due';
        case 'draft': return 'Draft';
        case 'closed': return 'Closed';
        default: return status;
    }
}

export function TeacherHomeworkListPage() {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const { selected, selectedCount, toggle, selectAll, deselectAll, isSelected } = useBulkSelection<string>();
    const { tags: homeworkTags } = useHomeworkTags();
    const [viewMode, setViewMode] = useState<ViewMode>('targets');
    const [drillDownClass, setDrillDownClass] = useState<{ classId: string; className: string; homework: HomeworkAssignment[] } | null>(null);
    const [modalStudent, setModalStudent] = useState<{ studentId: string; studentName: string; classId?: string; className?: string } | null>(null);
    const [statusFilter] = useState<HomeworkStatus | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showClosed] = useState(false);
    const [showArchived] = useState(false);
    const [bulkModeEnabled, setBulkModeEnabled] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createModalFilter, setCreateModalFilter] = useState<CreateModalFilter>('all');
    const [editingHomework, setEditingHomework] = useState<HomeworkAssignment | null>(null);
    const [showBulkExtendModal, setShowBulkExtendModal] = useState(false);
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<HomeworkAssignment | null>(null);

    const {
        homework,
        filteredHomework,
        loading,
        error,
        refetch,
        filterByStatus: _filterByStatus,
        statusCounts,
        loadMore,
        hasMore,
        sort: _sort,
        setSort: _setSort,
        tagFilter: _tagFilter,
        setTagFilter: _setTagFilter,
    } = useHomeworkList({
        teacherId: user?.uid,
        autoRefresh: true,
        excludeArchived: !showArchived,
        excludeClosed: !showClosed,
        pageSize: 25,
        searchQuery,
    });

    const { targetCards } = useTargetGrid(homework, searchQuery);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setSearchQuery(searchInput);
        }, 300);

        return () => clearTimeout(timeout);
    }, [searchInput]);

    const showToast = useCallback((title: string, message: string, tone: 'success' | 'error' | 'info' | 'warning') => {
        toast[tone](`${title}: ${message}`);
    }, []);

    const clearBulkSelection = useCallback(() => {
        deselectAll();
        setBulkModeEnabled(false);
    }, [deselectAll]);

    const handleDelete = async (hw: HomeworkAssignment) => {
        if (!confirm(`Archive "${hw.title || hw.materialTitle}"? You can restore it later from archived homework.`)) {
            return;
        }

        try {
            await deleteHomework(hw.id);
            showToast('Archived', `"${hw.title || hw.materialTitle}" was moved to archived homework.`, 'warning');
            await refetch();
        } catch (deleteError) {
            console.error('Error deleting homework:', deleteError);
            showToast('Archive failed', 'Failed to archive homework.', 'error');
        }
    };

    const handleDuplicate = async (hw: HomeworkAssignment) => {
        try {
            await duplicateHomework(hw.id, {});
            showToast('Duplicated', `"${hw.title || hw.materialTitle}" has been duplicated.`, 'success');
            await refetch();
        } catch (duplicateError) {
            console.error('Error duplicating homework:', duplicateError);
            showToast('Duplicate failed', 'Failed to duplicate homework.', 'error');
        }
    };

    const handleEdit = (hw: HomeworkAssignment) => {
        setEditingHomework(hw);
    };

    const handleExtendDeadline = async (hw: HomeworkAssignment) => {
        const currentDue = new Date(hw.scheduling.dueDate);
        const newDateStr = prompt(
            `Current deadline: ${currentDue.toLocaleString()}\n\nEnter new deadline (YYYY-MM-DD HH:MM):`,
            `${currentDue.getFullYear()}-${String(currentDue.getMonth() + 1).padStart(2, '0')}-${String(currentDue.getDate()).padStart(2, '0')} ${String(currentDue.getHours()).padStart(2, '0')}:${String(currentDue.getMinutes()).padStart(2, '0')}`
        );
        if (!newDateStr) return;

        const newDate = new Date(newDateStr.replace(' ', 'T'));
        if (isNaN(newDate.getTime())) {
            alert('Invalid date format. Please use YYYY-MM-DD HH:MM');
            return;
        }
        if (newDate.getTime() <= hw.scheduling.dueDate) {
            alert('New deadline must be after the current deadline.');
            return;
        }

        try {
            await extendDeadline(hw.id, newDate);
            showToast('Deadline extended', `"${hw.title || hw.materialTitle}" now ends on ${newDate.toLocaleString()}.`, 'success');
            await refetch();
        } catch (err) {
            console.error('Error extending deadline:', err);
            showToast('Extend failed', 'Failed to extend deadline.', 'error');
        }
    };

    const handleRestore = useCallback(async (hw: HomeworkAssignment) => {
        try {
            await restoreHomework(hw.id);
            showToast('Restored', `"${hw.title || hw.materialTitle}" was restored.`, 'success');
            await refetch();
        } catch (restoreError) {
            console.error('Error restoring homework:', restoreError);
            if (restoreError instanceof Error && restoreError.message.includes('permanently deleted')) {
                showToast('Restore failed', 'This homework has been permanently deleted.', 'error');
                return;
            }

            showToast('Restore failed', 'Failed to restore homework.', 'error');
        }
    }, [refetch, showToast]);

    const handlePermanentDelete = useCallback((hw: HomeworkAssignment) => {
        setPermanentDeleteTarget(hw);
    }, []);

    const handlePermanentDeleteConfirm = useCallback(async () => {
        if (!permanentDeleteTarget) {
            return;
        }

        try {
            await permanentlyDeleteHomework(permanentDeleteTarget.id);
            showToast(
                'Deleted forever',
                `"${permanentDeleteTarget.title || permanentDeleteTarget.materialTitle}" was permanently deleted.`,
                'success'
            );
            setPermanentDeleteTarget(null);
            await refetch();
        } catch (deleteError) {
            console.error('Error permanently deleting homework:', deleteError);
            showToast('Permanent delete failed', 'Failed to permanently delete homework.', 'error');
        }
    }, [permanentDeleteTarget, refetch, showToast]);

    const handleOpenDetail = useCallback((hw: HomeworkAssignment) => {
        navigateTo('TEACHER_HOMEWORK_DETAIL', { homeworkId: hw.id }, { reason: 'teacher_open_homework_detail' });
    }, [navigateTo]);

    const handleCreateHomework = () => {
        setCreateModalFilter('all');
        setShowCreateModal(true);
    };

    const handleClosePastDue = useCallback(async () => {
        if (!user?.uid) {
            return;
        }

        const pastDueCount = homework.filter((hw) => hw.status === 'past_due').length;
        if (pastDueCount === 0) {
            showToast('Nothing to close', 'There are no past-due homework assignments right now.', 'info');
            return;
        }

        if (!confirm(`Close all ${pastDueCount} past-due homework assignments?`)) {
            return;
        }

        try {
            const result = await closeAllPastDueHomework(user.uid);
            showToast(
                'Past-due homework closed',
                `Closed ${result.success} homework assignment${result.success === 1 ? '' : 's'}${result.failed > 0 ? `, ${result.failed} failed.` : '.'}`,
                result.failed > 0 ? 'warning' : 'success'
            );
            await refetch();
        } catch (closeError) {
            console.error('Error closing past due homework:', closeError);
            showToast('Bulk close failed', 'Failed to close past-due homework.', 'error');
        }
    }, [homework, refetch, showToast, user?.uid]);

    // handleBulkModeToggle removed — bulk mode is now inside AdvancedSearchPanel in the modal

    const handleBulkSelectAllMatching = useCallback(async () => {
        if (!user?.uid || !statusFilter) {
            return;
        }

        try {
            const matchingHomework = await selectHomeworkForBulkOperation(user.uid, {
                status: statusFilter,
            });
            selectAll(matchingHomework.map((matchingItem) => matchingItem.id));
            setBulkModeEnabled(true);
            showToast('Bulk selection ready', `Selected ${matchingHomework.length} ${getStatusLabel(statusFilter).toLowerCase()} homework assignment${matchingHomework.length === 1 ? '' : 's'}.`, 'info');
        } catch (selectionError) {
            console.error('Error selecting matching homework:', selectionError);
            showToast('Bulk selection failed', 'Unable to select homework matching the current filter.', 'error');
        }
    }, [selectAll, showToast, statusFilter, user?.uid]);

    const handleBulkExtendConfirm = useCallback(async (params: {
        mode: 'absolute' | 'relative';
        absoluteDate?: number;
        relativeHours?: number;
    }) => {
        const selectedIds = Array.from(selected);
        if (selectedIds.length === 0) {
            return;
        }

        try {
            const result = await bulkExtendDeadlines({
                homeworkIds: selectedIds,
                ...(params.mode === 'absolute' && params.absoluteDate
                    ? { newDueDate: new Date(params.absoluteDate) }
                    : {}),
                ...(params.mode === 'relative' && params.relativeHours
                    ? { extendByHours: params.relativeHours }
                    : {}),
            });

            setShowBulkExtendModal(false);
            clearBulkSelection();
            await refetch();

            showToast(
                result.failed > 0 ? 'Bulk extend completed with issues' : 'Deadlines extended',
                result.failed > 0
                    ? `Extended ${result.success} of ${result.total} deadlines. ${result.failed} failed.`
                    : `Extended ${result.success} of ${result.total} deadlines.`,
                result.failed > 0 ? 'error' : 'success'
            );
        } catch (bulkExtendError) {
            console.error('Error extending homework deadlines:', bulkExtendError);
            showToast('Bulk extend failed', 'Failed to extend selected homework deadlines.', 'error');
        }
    }, [clearBulkSelection, refetch, selected, showToast]);

    const handleBulkClose = useCallback(async () => {
        const selectedIds = Array.from(selected);
        if (selectedIds.length === 0) {
            return;
        }

        try {
            const result = await bulkCloseHomework({
                homeworkIds: selectedIds,
            });

            clearBulkSelection();
            await refetch();

            showToast(
                result.failed > 0 ? 'Bulk close completed with issues' : 'Homework closed',
                result.failed > 0
                    ? `Closed ${result.success} of ${result.total} homework assignments. ${result.failed} failed.`
                    : `Closed ${result.success} of ${result.total} homework assignments.`,
                result.failed > 0 ? 'error' : 'success'
            );
        } catch (bulkCloseError) {
            console.error('Error closing homework in bulk:', bulkCloseError);
            showToast('Bulk close failed', 'Failed to close selected homework.', 'error');
        }
    }, [clearBulkSelection, refetch, selected, showToast]);

    const handleBulkDuplicate = useCallback(async () => {
        const selectedIds = Array.from(selected);
        if (selectedIds.length === 0) {
            return;
        }

        let successCount = 0;
        let failureCount = 0;

        for (const homeworkId of selectedIds) {
            try {
                await duplicateHomework(homeworkId, {});
                successCount++;
            } catch (duplicateError) {
                console.error('Error duplicating homework:', duplicateError);
                failureCount++;
            }
        }

        clearBulkSelection();
        await refetch();

        showToast(
            failureCount > 0 ? 'Bulk duplicate completed with issues' : 'Homework duplicated',
            failureCount > 0
                ? `Duplicated ${successCount} of ${selectedIds.length} homework assignments. ${failureCount} failed.`
                : `Duplicated ${successCount} of ${selectedIds.length} homework assignments.`,
            failureCount > 0 ? 'error' : 'success'
        );
    }, [clearBulkSelection, refetch, selected, showToast]);

    const handleBulkDeleteConfirm = useCallback(async () => {
        const selectedIds = Array.from(selected);
        if (selectedIds.length === 0) {
            return;
        }

        let successCount = 0;
        let failureCount = 0;

        for (const homeworkId of selectedIds) {
            try {
                await archiveHomework(homeworkId);
                successCount++;
            } catch (archiveError) {
                console.error('Error archiving homework:', archiveError);
                failureCount++;
            }
        }

        setShowBulkDeleteModal(false);
        clearBulkSelection();
        await refetch();

        showToast(
            failureCount > 0 ? 'Bulk archive completed with issues' : 'Homework archived',
            failureCount > 0
                ? `Archived ${successCount} of ${selectedIds.length} homework assignments. ${failureCount} failed.`
                : `Archived ${successCount} of ${selectedIds.length} homework assignments.`,
            failureCount > 0 ? 'error' : 'success'
        );
    }, [clearBulkSelection, refetch, selected, showToast]);

    const handleLogout = async () => {
        try {
            await logout();
            navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const visibleHomework = useMemo(() => {
        return filteredHomework;
    }, [filteredHomework]);

    const searchFilteredHomework = useMemo(() => {
        return visibleHomework;
    }, [statusFilter, visibleHomework]);

    // homeworkByClass removed — replaced by TargetGrid + StudentGrid drill-down

    // Group homework by status for "by_status" view
    const homeworkByStatus = useMemo(() => {
        const grouped: Record<HomeworkStatus, HomeworkAssignment[]> = {
            draft: [],
            scheduled: [],
            active: [],
            past_due: [],
            closed: [],
        };

        searchFilteredHomework.forEach((hw) => {
            grouped[hw.status].push(hw);
        });

        return grouped;
    }, [searchFilteredHomework]);

    const averageCompletionRate = useMemo(() => {
        if (homework.length === 0) {
            return 0;
        }

        const total = homework.reduce((sum, hw) => {
            if (typeof hw.stats.completionRate === 'number') {
                return sum + hw.stats.completionRate;
            }

            if (hw.stats.totalAssigned > 0) {
                return sum + Math.round((hw.stats.submitted / hw.stats.totalAssigned) * 100);
            }

            return sum;
        }, 0);

        return Math.round(total / homework.length);
    }, [homework]);

    const needsAttentionCount = useMemo(() => {
        const now = Date.now();
        return homework.filter((hw) => {
            const dueSoon = hw.status === 'active' && hw.scheduling.dueDate > now && hw.scheduling.dueDate - now <= DAY_IN_MS;
            const availableFrom = hw.scheduling.availableFrom;
            const goesLiveSoon =
                hw.status === 'scheduled' &&
                typeof availableFrom === 'number' &&
                availableFrom > now &&
                availableFrom - now <= DAY_IN_MS;

            return hw.status === 'past_due' || dueSoon || goesLiveSoon;
        }).length;
    }, [homework]);

    // pastDueCount now computed inside CompactStatsBar
    const bulkSelectionVisible = bulkModeEnabled || selectedCount > 0;
    const viewTabs = useMemo(
        () => [
            { key: 'targets', label: 'Targets', icon: <TargetPinIcon size={14} /> },
            { key: 'chronological', label: 'Timeline', icon: <CalendarIcon size={14} /> },
            { key: 'by_status', label: 'By Status', icon: <BarChartIcon size={14} /> },
        ],
        []
    );

    // sortOptions removed — sort controls now inside AdvancedSearchPanel in the modal

    // alertItems removed — urgency communicated via card sorting and glowing borders (FR-54)

    // handleStatusSelect removed — status filter buttons are now inside AdvancedSearchPanel in the modal

    // handleClosedToggle removed — now inside AdvancedSearchPanel in the modal

    const handleSelectionToggle = useCallback((homeworkId: string) => {
        if (!bulkModeEnabled) {
            setBulkModeEnabled(true);
        }

        toggle(homeworkId);
    }, [bulkModeEnabled, toggle]);

    const renderHomeworkCards = useCallback((items: HomeworkAssignment[], offset = 0) => (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
            }}
        >
            {items.map((hw, index) => {
                const alertBadge = getHomeworkAlertBadge(hw);

                return (
                    <div
                        key={hw.id}
                        style={{
                            animation: `slideUp 0.45s ease-out ${(offset + index) * 0.04}s backwards`,
                            position: 'relative',
                            opacity: hw.archived ? 0.6 : 1,
                        }}
                    >
                        {bulkSelectionVisible ? (
                            <label
                                style={{
                                    position: 'absolute',
                                    top: '0.75rem',
                                    left: '0.75rem',
                                    zIndex: 3,
                                    width: '2rem',
                                    height: '2rem',
                                    borderRadius: '999px',
                                    background: 'rgba(255,255,255,0.92)',
                                    border: '1px solid rgba(148,163,184,0.24)',
                                    display: 'grid',
                                    placeItems: 'center',
                                    boxShadow: '0 10px 20px rgba(15,23,42,0.08)',
                                }}
                                onClick={(event) => event.stopPropagation()}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSelected(hw.id)}
                                    onChange={() => handleSelectionToggle(hw.id)}
                                    aria-label={`Select ${hw.title || hw.materialTitle}`}
                                />
                            </label>
                        ) : null}
                        {alertBadge ? (
                            <span
                                style={{
                                    position: 'absolute',
                                    top: '0.75rem',
                                    right: '0.75rem',
                                    zIndex: 2,
                                    borderRadius: '999px',
                                    padding: '0.3rem 0.65rem',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    background: alertBadge.background,
                                    color: alertBadge.color,
                                }}
                            >
                                {alertBadge.text}
                            </span>
                        ) : null}
                        <HomeworkCard
                            homework={hw}
                            onEdit={handleEdit}
                            onDuplicate={handleDuplicate}
                            onDelete={handleDelete}
                            onExtendDeadline={handleExtendDeadline}
                            onRestore={handleRestore}
                            onPermanentDelete={handlePermanentDelete}
                            onClick={handleOpenDetail}
                            showSubmissionProgress={true}
                            availableTags={homeworkTags}
                            onResetComplete={refetch}
                        />
                    </div>
                );
            })}
        </div>
    ), [bulkSelectionVisible, handleDelete, handleDuplicate, handleEdit, handleExtendDeadline, handleOpenDetail, handlePermanentDelete, handleRestore, handleSelectionToggle, homeworkTags, isSelected, refetch]);

    return (
        <div
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
                backgroundAttachment: 'fixed',
            }}
        >
            {/* Unified Teacher Header with Navigation */}
            <TeacherHeader
                pageTitle="Homework"
                userId={user?.uid}
                userRole={profile?.role}
                userDisplayName={profile?.displayName || user?.displayName || user?.email}
                userEmail={profile?.email || user?.email}
                userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                onLogout={handleLogout}
            />

            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: `2rem 1rem ${selectedCount > 0 ? '8rem' : '3rem'}` }}>
                <div style={{ marginBottom: '2rem', animation: 'slideDown 0.5s ease-out' }}>
                    <h1
                        style={{
                            fontSize: '2.5rem',
                            fontWeight: '800',
                            marginBottom: '0.5rem',
                            color: '#1e293b',
                        }}
                    >
                        <EmptyHomeworkIcon size={32} style={{ display: 'inline', verticalAlign: 'middle' }} /> Homework Management
                    </h1>
                    <p style={{ fontSize: '1rem', color: '#64748b', maxWidth: '760px' }}>
                        Create, organize, and monitor homework assignments with faster drill-down into student submission detail.
                    </p>
                </div>
                <CompactStatsBar
                    totalCount={homework.length}
                    visibleCount={visibleHomework.length}
                    activeScheduledCount={(statusCounts.active ?? 0) + (statusCounts.scheduled ?? 0)}
                    pastDueCount={statusCounts.past_due ?? 0}
                    avgCompletionRate={averageCompletionRate}
                    needsAttentionCount={needsAttentionCount}
                    onClosePastDue={handleClosePastDue}
                    onCreateHomework={handleCreateHomework}
                    userId={user?.uid}
                />

                <Card
                    variant="glass"
                    style={{
                        marginBottom: '2rem',
                        animation: 'slideUp 0.5s ease-out 0.1s backwards',
                    }}
                >
                    <CardBody>
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: '0.75rem',
                                    alignItems: 'center',
                                }}
                            >
                                <div style={{ flex: '1 1 320px', minWidth: '260px', position: 'relative' }}>
                                    <Input
                                        placeholder="Search classes, students, or homework..."
                                        value={searchInput}
                                        onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchInput(event.target.value)}
                                        variant="default"
                                        fullWidth
                                    />
                                    {searchInput && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchInput('')}
                                            style={{
                                                position: 'absolute',
                                                right: '0.5rem',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: '#94a3b8',
                                                display: 'inline-flex',
                                            }}
                                        >
                                            <ClearIcon size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <VanillaTabs
                                tabs={viewTabs}
                                activeTab={viewMode}
                                onTabChange={(nextViewMode) => {
                                    setViewMode(nextViewMode as ViewMode);
                                    setDrillDownClass(null);
                                }}
                            />
                        </div>
                    </CardBody>
                </Card>

                {loading ? (
                    <Card
                        variant="default"
                        style={{
                            textAlign: 'center',
                            padding: '4rem 2rem',
                            animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                        }}
                    >
                        <CardBody>
                            <div
                                style={{
                                    minHeight: '200px',
                                    display: 'grid',
                                    placeContent: 'center',
                                    gap: '1rem',
                                    color: '#64748b',
                                    fontWeight: 700,
                                }}
                            >
                                <VanillaLoader size="xl" />
                                <div style={{ fontWeight: 600, color: '#64748b' }}>Loading homework...</div>
                            </div>
                        </CardBody>
                    </Card>
                ) : error ? (
                    <Card
                        variant="default"
                        style={{
                            textAlign: 'center',
                            padding: '4rem 2rem',
                            animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                        }}
                    >
                        <CardBody>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#dc2626' }}>
                                {error}
                            </h2>
                            <Button variant="primary" onClick={refetch} style={{ marginTop: '1rem' }}>
                                Retry
                            </Button>
                        </CardBody>
                    </Card>
                ) : searchFilteredHomework.length === 0 ? (
                    <Card
                        variant="default"
                        style={{
                            textAlign: 'center',
                            padding: '4rem 2rem',
                            animation: 'scaleIn 0.5s ease-out 0.2s backwards',
                        }}
                    >
                        <CardBody>
                            <div style={{ marginBottom: '1rem' }}><EmptyHomeworkIcon size={80} /></div>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1e293b' }}>
                                No homework yet
                            </h2>
                            <p style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1.5rem' }}>
                                {searchQuery || statusFilter || showClosed || showArchived
                                    ? 'Try adjusting your search or filters.'
                                    : 'Create your first homework assignment to get started.'}
                            </p>
                            {!searchQuery && !statusFilter && !showClosed && !showArchived ? (
                                <Button
                                    variant="primary"
                                    onClick={handleCreateHomework}
                                    style={{
                                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    }}
                                >
                                    Create First Homework
                                </Button>
                            ) : null}
                        </CardBody>
                    </Card>
                ) : (
                    <>
                        {statusFilter && user?.uid ? (
                            <Card
                                variant="default"
                                style={{
                                    marginBottom: '1rem',
                                    border: '1px solid rgba(99,102,241,0.14)',
                                    background: 'rgba(255,255,255,0.95)',
                                }}
                            >
                                <CardBody>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: '0.75rem',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <div style={{ color: '#475569', fontWeight: 600 }}>
                                            Select all {statusCounts[statusFilter] ?? 0} {getStatusLabel(statusFilter).toLowerCase()} homework assignments?
                                        </div>
                                        <Button variant="outline" size="sm" onClick={handleBulkSelectAllMatching}>
                                            Select all matching filter
                                        </Button>
                                    </div>
                                </CardBody>
                            </Card>
                        ) : null}

                        {viewMode === 'targets' && (
                            drillDownClass ? (
                                <StudentGrid
                                    classId={drillDownClass.classId}
                                    className={drillDownClass.className}
                                    classHomework={drillDownClass.homework}
                                    onBack={() => setDrillDownClass(null)}
                                    onStudentClick={(studentId, studentName, classId, className) =>
                                        setModalStudent({ studentId, studentName, classId, className })
                                    }
                                    searchQuery={searchQuery}
                                />
                            ) : (
                                <TargetGrid
                                    targetCards={targetCards}
                                    onTargetClick={(target) => {
                                        if (target.targetType === 'class') {
                                            setDrillDownClass({
                                                classId: target.targetId,
                                                className: target.targetName,
                                                homework: target.homework,
                                            });
                                        } else {
                                            setModalStudent({
                                                studentId: target.targetId,
                                                studentName: target.targetName,
                                            });
                                        }
                                    }}
                                    onCreateHomework={handleCreateHomework}
                                />
                            )
                        )}

                        {viewMode === 'chronological' && renderHomeworkCards(searchFilteredHomework)}

                        {viewMode === 'by_status' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {Object.entries(homeworkByStatus)
                                    .filter(([, homeworkList]) => homeworkList.length > 0)
                                    .map(([status, homeworkList], groupIndex) => (
                                        <Card
                                            key={status}
                                            variant="default"
                                            style={{
                                                animation: `slideUp 0.5s ease-out ${groupIndex * 0.08}s backwards`
                                            }}
                                        >
                                            <CardBody>
                                                <h2 style={{
                                                    fontSize: '1.25rem',
                                                    fontWeight: '700',
                                                    color: '#1e293b',
                                                    marginBottom: '1rem',
                                                    paddingBottom: '0.75rem',
                                                    borderBottom: '2px solid #e2e8f0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                }}>
                                                    {getStatusIcon(status)} {getStatusLabel(status)} ({homeworkList.length})
                                                </h2>
                                                {renderHomeworkCards(homeworkList, groupIndex * 4)}
                                            </CardBody>
                                        </Card>
                                    ))}
                            </div>
                        )}

                        {hasMore ? (
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
                                <Button
                                    variant="secondary"
                                    onClick={() => void loadMore()}
                                >
                                    Load More
                                </Button>
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            {/* Homework Create Modal */}
            <HomeworkCreateModal
                isOpen={showCreateModal}
                onClose={() => {
                    setShowCreateModal(false);
                    setCreateModalFilter('all');
                }}
                onSuccess={refetch}
                preselectedMaterialFilter={createModalFilter}
            />

            {/* Homework Edit Modal */}
            <HomeworkEditModal
                isOpen={!!editingHomework}
                homework={editingHomework}
                onClose={() => setEditingHomework(null)}
                onSuccess={refetch}
            />

            <BulkExtendModal
                isOpen={showBulkExtendModal}
                selectedCount={selectedCount}
                onClose={() => setShowBulkExtendModal(false)}
                onConfirm={handleBulkExtendConfirm}
            />

            <BulkDeleteConfirmModal
                isOpen={showBulkDeleteModal}
                selectedCount={selectedCount}
                onClose={() => setShowBulkDeleteModal(false)}
                onConfirm={handleBulkDeleteConfirm}
            />

            <BulkDeleteConfirmModal
                isOpen={!!permanentDeleteTarget}
                selectedCount={1}
                ariaLabel="Confirm permanent homework delete"
                title={`Permanently delete "${permanentDeleteTarget?.title || permanentDeleteTarget?.materialTitle || 'homework'}"?`}
                description="This will permanently delete the archived homework assignment immediately."
                warningText="This action cannot be undone. Once deleted, the homework cannot be restored from trash."
                confirmLabel="Delete forever"
                onClose={() => setPermanentDeleteTarget(null)}
                onConfirm={handlePermanentDeleteConfirm}
            />

            {selectedCount > 0 ? (
                <HomeworkBulkActionBar
                    selectedCount={selectedCount}
                    onExtend={() => setShowBulkExtendModal(true)}
                    onClose={() => void handleBulkClose()}
                    onDelete={() => setShowBulkDeleteModal(true)}
                    onDuplicate={() => void handleBulkDuplicate()}
                    onDeselectAll={clearBulkSelection}
                    onCloseAllPastDue={() => void handleClosePastDue()}
                />
            ) : null}

            {/* Student Homework List Modal */}
            <HomeworkListModal
                isOpen={!!modalStudent}
                onClose={() => setModalStudent(null)}
                studentId={modalStudent?.studentId ?? ''}
                studentName={modalStudent?.studentName ?? ''}
                classId={modalStudent?.classId}
                className={modalStudent?.className}
                allHomework={homework}
                onNavigateToDetail={handleOpenDetail}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onExtendDeadline={handleExtendDeadline}
                onRestore={handleRestore}
                onPermanentDelete={handlePermanentDelete}
                availableTags={homeworkTags}
                onRefetch={refetch}
            />

            {/* Animations */}
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

export default TeacherHomeworkListPage;
