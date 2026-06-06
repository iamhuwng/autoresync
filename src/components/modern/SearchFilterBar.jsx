import React from 'react';
import { Input, Button, NativeSelect } from './index';
import { GlobeIcon, LockIcon, PlusIcon, SearchIcon } from './icons.jsx';
import MaterialViewModeToggle from './MaterialViewModeToggle';
import './SearchFilterBar.css';

const SearchFilterBar = ({
  searchTerm,
  onSearchChange,
  contentFilter,
  testTypeFilter,
  onTestTypeFilterChange,
  thcsGradeFilter,
  onThcsGradeFilterChange,
  thcsExamTypeFilter,
  onThcsExamTypeFilterChange,
  onCreateNew,
  createLabel = 'Create New Test',
  showCreateButton = true,
  viewMode,
  onViewModeChange,
  visibilityScope,
  onVisibilityScopeChange,
  visibilityLabel,
}) => {
  const showViewModeToggle = Boolean(viewMode && typeof onViewModeChange === 'function');
  const showVisibilityScope = Boolean(visibilityScope && typeof onVisibilityScopeChange === 'function');

  return (
    <div className="search-filter-bar">
      <div className="search-filter-bar__search">
        <Input
          placeholder="Search by title or keyword..."
          icon={<SearchIcon size={18} />}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          variant="default"
          size="md"
        />
      </div>

      {contentFilter === 'public' && (
        <>
          <NativeSelect
            value={testTypeFilter}
            onChange={(value) => {
              onTestTypeFilterChange(value || 'all');
              if (value !== 'THCS-THPT') {
                onThcsGradeFilterChange('all');
                onThcsExamTypeFilterChange('all');
              }
            }}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'IELTS', label: 'IELTS' },
              { value: 'THCS-THPT', label: 'THCS-THPT' },
            ]}
            minWidth="150px"
          />

          {testTypeFilter === 'THCS-THPT' && (
            <>
              <NativeSelect
                value={thcsGradeFilter}
                onChange={(value) => onThcsGradeFilterChange(value || 'all')}
                options={[
                  { value: 'all', label: 'All Grades' },
                  { value: '6', label: 'Grade 6' },
                  { value: '7', label: 'Grade 7' },
                  { value: '8', label: 'Grade 8' },
                  { value: '9', label: 'Grade 9' },
                  { value: '10', label: 'Grade 10' },
                  { value: '11', label: 'Grade 11' },
                  { value: '12', label: 'Grade 12' },
                ]}
                minWidth="130px"
              />
              <NativeSelect
                value={thcsExamTypeFilter}
                onChange={(value) => onThcsExamTypeFilterChange(value || 'all')}
                options={[
                  { value: 'all', label: 'All Exam Types' },
                  { value: 'Giữa Kì', label: 'Giữa Kì' },
                  { value: 'Cuối Kì', label: 'Cuối Kì' },
                  { value: 'Kiểm Tra', label: 'Kiểm Tra' },
                  { value: '15 Phút', label: '15 Phút' },
                  { value: 'THPT QG', label: 'THPT QG' },
                ]}
                minWidth="145px"
              />
            </>
          )}
        </>
      )}

      {showViewModeToggle && (
        <div className="search-filter-bar__view-toggle">
          <MaterialViewModeToggle value={viewMode} onChange={onViewModeChange} />
        </div>
      )}

      {showVisibilityScope && (
        <div
          className="search-filter-bar__visibility"
          role="group"
          aria-label={visibilityLabel || 'Visibility'}
        >
          {[
            { value: 'private', label: 'Private', icon: LockIcon },
            { value: 'public', label: 'Public', icon: GlobeIcon },
          ].map(({ value, label, icon: Icon }) => {
            const isActive = visibilityScope === value;

            return (
              <button
                key={value}
                type="button"
                className={`search-filter-bar__visibility-button${isActive ? ' search-filter-bar__visibility-button--active' : ''}`}
                aria-label={label}
                aria-pressed={isActive}
                title={label}
                onClick={() => onVisibilityScopeChange(value)}
              >
                <Icon size={15} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      {showCreateButton && (
        <Button
          variant="primary"
          onClick={onCreateNew}
          style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            flexShrink: 0,
          }}
        >
          <PlusIcon size={16} style={{ marginRight: '0.5rem' }} />
          {createLabel}
        </Button>
      )}
    </div>
  );
};

export default SearchFilterBar;
