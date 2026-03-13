import React from 'react';
import { Input, Button, NativeSelect } from './index';
import { PlusIcon } from './icons.jsx';
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
}) => {
  return (
    <div className="search-filter-bar">
      <div className="search-filter-bar__search">
        <Input
          placeholder="🔍 Search by title or keyword..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          variant="default"
          size="md"
        />
      </div>

      {/* Type filters — only in public library mode */}
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
              { value: 'all', label: '📚 All Types' },
              { value: 'IELTS', label: '🌐 IELTS' },
              { value: 'THCS-THPT', label: '🇻🇳 THCS-THPT' },
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

      <Button
        variant="primary"
        onClick={onCreateNew}
        style={{
          background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
          flexShrink: 0,
        }}
      >
        <PlusIcon size={16} style={{ marginRight: '0.5rem' }} />
        Create New Test
      </Button>
    </div>
  );
};

export default SearchFilterBar;
