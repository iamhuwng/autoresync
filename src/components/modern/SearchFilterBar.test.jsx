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
  it('renders create action and hides view toggle unless explicitly provided', async () => {
    const user = userEvent.setup();
    const onCreateNew = vi.fn();

    render(
      <SearchFilterBar
        {...defaultProps}
        onCreateNew={onCreateNew}
      />
    );

    expect(screen.queryByRole('button', { name: 'List view' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create new test/i }));
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it('supports Book-specific create label and Reading Passage no-create mode', () => {
    const { rerender } = render(
      <SearchFilterBar
        {...defaultProps}
        createLabel="Create New Book"
      />
    );

    expect(screen.getByRole('button', { name: /create new book/i })).toBeInTheDocument();

    rerender(
      <SearchFilterBar
        {...defaultProps}
        showCreateButton={false}
      />
    );

    expect(screen.queryByRole('button', { name: /create new/i })).not.toBeInTheDocument();
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
