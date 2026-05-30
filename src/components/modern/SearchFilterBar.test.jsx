import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SearchFilterBar from './SearchFilterBar';

const defaultProps = {
  searchTerm: '',
  onSearchChange: vi.fn(),
  contentFilter: 'my',
  testTypeFilter: 'all',
  onTestTypeFilterChange: vi.fn(),
  thcsGradeFilter: 'all',
  onThcsGradeFilterChange: vi.fn(),
  thcsExamTypeFilter: 'all',
  onThcsExamTypeFilterChange: vi.fn(),
  onCreateNew: vi.fn(),
};

describe('SearchFilterBar', () => {
  it('renders optional view toggle and create action', async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();
    const onCreateNew = vi.fn();

    render(
      <SearchFilterBar
        {...defaultProps}
        onCreateNew={onCreateNew}
        viewMode="grid"
        onViewModeChange={onViewModeChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(onViewModeChange).toHaveBeenCalledWith('list');

    await user.click(screen.getByRole('button', { name: /create new test/i }));
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it('keeps public THCS filters backed by existing values with readable labels', () => {
    render(
      <SearchFilterBar
        {...defaultProps}
        contentFilter="public"
        testTypeFilter="THCS-THPT"
      />
    );

    expect(screen.getByRole('option', { name: 'Giữa Kì' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cuối Kì' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Kiểm Tra' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '15 Phút' })).toBeInTheDocument();
  });
});
