import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MaterialListView from './MaterialListView';

describe('MaterialListView', () => {
  it('renders list headers, rows, and footer count', () => {
    render(
      <MaterialListView
        itemLabel="tests"
        rows={[
          {
            id: 'row-1',
            title: 'Material A',
            iconKind: 'test',
            accentKind: 'mint',
            badges: [{ key: 'count', label: '3 questions', tone: 'neutral' }],
            itemLabel: '3 questions',
            durationLabel: '20 min',
            updatedLabel: 'May 10, 2026',
            actions: [],
          },
        ]}
      />
    );

    expect(screen.getByText('Material')).toBeInTheDocument();
    expect(screen.getByText('Items')).toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByTestId('material-list-row-row-1')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 to 1 of 1 tests')).toBeInTheDocument();
  });
});
