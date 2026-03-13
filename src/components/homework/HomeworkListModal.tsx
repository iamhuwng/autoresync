import { useState, useEffect, useCallback } from 'react';
import { ClearIcon, EmptyAssignmentsIcon } from './HomeworkIcons';
import { CompactHomeworkCard } from './CompactHomeworkCard';
import { AdvancedSearchPanel } from './AdvancedSearchPanel';
import { useStudentHomeworkModal } from '../../hooks/useStudentHomeworkModal';
import type { HomeworkAssignment } from '../../types/homework.types';
import type { HomeworkTag } from '../../hooks/useHomeworkTags';
import './HomeworkListModal.css';

// ─── Props ───────────────────────────────────────────────────────────────────

export interface HomeworkListModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  classId?: string;
  className?: string;
  allHomework: HomeworkAssignment[];
  onNavigateToDetail: (hw: HomeworkAssignment) => void;
  onEdit: (hw: HomeworkAssignment) => void;
  onDuplicate: (hw: HomeworkAssignment) => void;
  onDelete: (hw: HomeworkAssignment) => void;
  onExtendDeadline: (hw: HomeworkAssignment) => void;
  onRestore?: (hw: HomeworkAssignment) => void;
  onPermanentDelete?: (hw: HomeworkAssignment) => void;
  onResetComplete?: (hw: HomeworkAssignment) => void;
  availableTags: HomeworkTag[];
  onRefetch?: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function HomeworkListModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  classId,
  className: classDisplayName,
  allHomework,
  onNavigateToDetail,
  onEdit,
  onDuplicate,
  onDelete,
  onExtendDeadline,
  onRestore,
  onPermanentDelete,
  onResetComplete,
  availableTags,
}: HomeworkListModalProps) {
  // ── Search with 300ms debounce (FR-37) ──
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Filter state ──
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [bulkModeEnabled, setBulkModeEnabled] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── Data hook ──
  const { studentHomework, displayCount, loadMore, hasMore } = useStudentHomeworkModal(
    studentId,
    classId ?? null,
    allHomework
  );

  // ── Filter homework ──
  const filteredHomework = studentHomework.filter((hw) => {
    // Status filter
    if (statusFilter !== 'all' && hw.status !== statusFilter) return false;
    // Closed toggle
    if (!showClosed && hw.status === 'closed') return false;
    // Archived toggle
    if (!showArchived && hw.archived) return false;
    // Tag filter
    if (tagFilter && !(hw.tags ?? []).includes(tagFilter)) return false;
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hwTitle = hw.title ?? hw.materialTitle ?? '';
      const titleMatch = hwTitle.toLowerCase().includes(q);
      const descMatch = (hw.description ?? '').toLowerCase().includes(q);
      if (!titleMatch && !descMatch) return false;
    }
    return true;
  });

  // ── Sort homework ──
  const sortedHomework = [...filteredHomework].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return (a.createdAt ?? 0) - (b.createdAt ?? 0);
      case 'dueDate':
        return (a.scheduling?.dueDate ?? 0) - (b.scheduling?.dueDate ?? 0);
      case 'title':
        return (a.title ?? a.materialTitle ?? '').localeCompare(b.title ?? b.materialTitle ?? '');
      case 'newest':
      default:
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    }
  });

  // Display with pagination
  const visibleHomework = sortedHomework.slice(0, displayCount);

  // ── Reset state when modal opens ──
  useEffect(() => {
    if (isOpen) {
      setSearchInput('');
      setSearchQuery('');
      setStatusFilter('all');
      setSort('newest');
      setTagFilter(null);
      setShowClosed(false);
      setShowArchived(false);
      setBulkModeEnabled(false);
      setSelected(new Set());
    }
  }, [isOpen]);

  // ── Handlers ──
  const handleCardClick = useCallback((hw: HomeworkAssignment) => {
    onNavigateToDetail(hw);
    onClose();
  }, [onNavigateToDetail, onClose]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const subtitle = classDisplayName || 'Individual';

  return (
    <div className="hw-modal-overlay" onClick={handleOverlayClick}>
      <div className="hw-modal" onClick={(e) => e.stopPropagation()}>
        {/* ── Sticky Header ── */}
        <div className="hw-modal__header">
          <div className="hw-modal__header-row">
            <h2 className="hw-modal__title">
              Homework — {studentName} ({subtitle})
            </h2>
            <button
              className="hw-modal__close"
              type="button"
              onClick={onClose}
              title="Close"
            >
              <ClearIcon size={16} />
            </button>
          </div>

          <input
            className="hw-modal__search"
            type="text"
            placeholder="Search homework..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          <div className="hw-modal__filter-row">
            <AdvancedSearchPanel
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              sort={sort}
              onSortChange={setSort}
              tagFilter={tagFilter}
              onTagChange={setTagFilter}
              allTags={availableTags}
              showClosed={showClosed}
              onShowClosedToggle={() => setShowClosed((v) => !v)}
              showArchived={showArchived}
              onShowArchivedToggle={() => setShowArchived((v) => !v)}
              bulkModeEnabled={bulkModeEnabled}
              onBulkModeToggle={() => setBulkModeEnabled((v) => !v)}
              selectedCount={selected.size}
              onBulkExtend={() => {}}
              onBulkClose={() => {}}
              onBulkDuplicate={() => {}}
              onBulkDelete={() => {}}
              onDeselectAll={() => setSelected(new Set())}
            />
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="hw-modal__body">
          {visibleHomework.length === 0 ? (
            <div className="hw-modal__empty">
              <div className="hw-modal__empty-icon">
                <EmptyAssignmentsIcon size={56} />
              </div>
              <p className="hw-modal__empty-text">
                {searchQuery.trim() || statusFilter !== 'all' || tagFilter
                  ? 'No homework matches your filters.'
                  : 'No homework assigned to this student.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hw-modal__list">
                {visibleHomework.map((hw) => (
                  <CompactHomeworkCard
                    key={hw.id}
                    homework={hw}
                    onClick={handleCardClick}
                    onEdit={onEdit}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                    onExtendDeadline={onExtendDeadline}
                    onRestore={onRestore}
                    onPermanentDelete={onPermanentDelete}
                    onResetComplete={onResetComplete}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="hw-modal__load-more">
                  <button
                    className="hw-modal__load-more-btn"
                    type="button"
                    onClick={loadMore}
                  >
                    Load More ({sortedHomework.length - displayCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomeworkListModal;
