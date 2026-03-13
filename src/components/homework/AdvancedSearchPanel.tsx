import { useState } from 'react';
import { HomeworkBulkActionBar } from './HomeworkBulkActionBar';
import HomeworkTagChips from './HomeworkTagChips';
import { FilterIcon, FilterActiveIcon } from './HomeworkIcons';
import type { HomeworkTag } from '../../hooks/useHomeworkTags';
import './AdvancedSearchPanel.css';

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'past_due', label: 'Past Due' },
  { key: 'draft', label: 'Draft' },
  { key: 'closed', label: 'Closed' },
] as const;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'title', label: 'Title A-Z' },
] as const;

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AdvancedSearchPanelProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  tagFilter: string | null;
  onTagChange: (tag: string | null) => void;
  allTags: HomeworkTag[];
  showClosed: boolean;
  onShowClosedToggle: () => void;
  showArchived: boolean;
  onShowArchivedToggle: () => void;
  bulkModeEnabled: boolean;
  onBulkModeToggle: () => void;
  selectedCount: number;
  onBulkExtend: () => void;
  onBulkClose: () => void;
  onBulkDuplicate: () => void;
  onBulkDelete: () => void;
  onDeselectAll: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdvancedSearchPanel({
  statusFilter,
  onStatusChange,
  sort,
  onSortChange,
  tagFilter,
  onTagChange,
  allTags,
  showClosed,
  onShowClosedToggle,
  showArchived,
  onShowArchivedToggle,
  bulkModeEnabled,
  onBulkModeToggle,
  selectedCount,
  onBulkExtend,
  onBulkClose,
  onBulkDuplicate,
  onBulkDelete,
  onDeselectAll,
}: AdvancedSearchPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Active = any non-default filter applied
  const hasActiveFilters =
    statusFilter !== 'all' ||
    tagFilter !== null ||
    showClosed ||
    showArchived ||
    bulkModeEnabled;

  return (
    <>
      {/* Toggle button */}
      <button
        className={`adv-search-panel__toggle ${hasActiveFilters ? 'adv-search-panel__toggle--active' : ''}`}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
      >
        {hasActiveFilters ? <FilterActiveIcon size={14} /> : <FilterIcon size={14} />}
        Filters
      </button>

      {/* Expandable panel */}
      <div className={`adv-search-panel ${isOpen ? 'adv-search-panel--open' : ''}`}>
        <div className="adv-search-panel__content">
          {/* Status filter */}
          <div className="adv-search-panel__group">
            <span className="adv-search-panel__label">Status</span>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className={`adv-search-panel__status-btn ${statusFilter === opt.key ? 'adv-search-panel__status-btn--active' : ''}`}
                type="button"
                onClick={() => onStatusChange(opt.key)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="adv-search-panel__divider" />

          {/* Sort */}
          <div className="adv-search-panel__group">
            <span className="adv-search-panel__label">Sort</span>
            <select
              className="adv-search-panel__select"
              value={sort}
              onChange={(e) => onSortChange(e.target.value)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="adv-search-panel__divider" />

          {/* Tags */}
          {allTags.length > 0 && (
            <>
              <div className="adv-search-panel__group">
                <HomeworkTagChips
                  allTags={allTags}
                  selectedTag={tagFilter}
                  onTagSelect={onTagChange}
                  selectable
                />
              </div>
              <div className="adv-search-panel__divider" />
            </>
          )}

          {/* Toggle buttons */}
          <button
            className={`adv-search-panel__toggle-btn ${showClosed ? 'adv-search-panel__toggle-btn--active' : ''}`}
            type="button"
            onClick={onShowClosedToggle}
          >
            {showClosed ? '✓' : ''} Show Closed
          </button>

          <button
            className={`adv-search-panel__toggle-btn ${showArchived ? 'adv-search-panel__toggle-btn--active' : ''}`}
            type="button"
            onClick={onShowArchivedToggle}
          >
            {showArchived ? '✓' : ''} Show Archived
          </button>

          <div className="adv-search-panel__divider" />

          <button
            className={`adv-search-panel__toggle-btn ${bulkModeEnabled ? 'adv-search-panel__toggle-btn--active' : ''}`}
            type="button"
            onClick={onBulkModeToggle}
          >
            {bulkModeEnabled ? '✓' : ''} Bulk Select
          </button>
        </div>
      </div>

      {/* Bulk action bar — rendered outside the expandable panel */}
      {bulkModeEnabled && selectedCount > 0 && (
        <HomeworkBulkActionBar
          selectedCount={selectedCount}
          onExtend={onBulkExtend}
          onClose={onBulkClose}
          onDuplicate={onBulkDuplicate}
          onDelete={onBulkDelete}
          onDeselectAll={onDeselectAll}
          onCloseAllPastDue={onBulkClose}
        />
      )}
    </>
  );
}

export default AdvancedSearchPanel;
