import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import MaterialListRow from './MaterialListRow';

function makeRow(overrides = {}) {
  return {
    id: 'row-1',
    title: 'Very Long Material Title',
    titleTooltip: 'Very Long Material Title',
    iconKind: 'test',
    accentKind: 'lavender',
    badges: [
      { key: 'count', label: '40 questions', tone: 'neutral' },
      { key: 'type', label: 'IELTS - Reading', tone: 'purple' },
      { key: 'duration', label: '60 min', tone: 'green' },
    ],
    itemLabel: '40 questions',
    durationLabel: '60 min',
    updatedLabel: 'May 12, 2026',
    actions: [],
    ...overrides,
  };
}

describe('MaterialListRow', () => {
  it('renders compact metadata and title tooltip', () => {
    render(<MaterialListRow row={makeRow()} />);

    expect(screen.getByText('Very Long Material Title')).toHaveAttribute('title', 'Very Long Material Title');
    expect(screen.getAllByText('40 questions')).toHaveLength(2);
    expect(screen.getByText('IELTS - Reading')).toBeInTheDocument();
    expect(screen.getByText('60 min')).toBeInTheDocument();
    expect(screen.getByText('May 12, 2026')).toBeInTheDocument();
  });

  it('runs enabled actions and blocks disabled actions', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onStart = vi.fn();
    render(
      <MaterialListRow
        row={makeRow({
          actions: [
            { key: 'edit', label: 'Edit', variant: 'secondary', iconKind: 'edit', slot: 1, onSelect: onEdit },
            { key: 'start', label: 'Start Test', variant: 'primary', iconKind: 'play', slot: 3, onSelect: onStart, disabled: true, disabledReason: 'Complete first' },
          ],
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: 'Start Test' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Start Test' }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('keeps row actions in stable icon slots', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn();
    render(
      <MaterialListRow
        row={makeRow({
          actions: [
            { key: 'edit', label: 'Edit', variant: 'secondary', iconKind: 'edit', slot: 1, onSelect: vi.fn() },
            { key: 'assign-homework', label: 'Assign HW', variant: 'outline', iconKind: 'clone', slot: 4, onSelect: onAssign, priority: 'secondary' },
          ],
        })}
      />
    );

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveStyle({ gridColumn: '1' });
    expect(screen.getByRole('button', { name: 'Assign HW' })).toHaveStyle({ gridColumn: '4' });

    await user.click(screen.getByRole('button', { name: 'Assign HW' }));

    expect(onAssign).toHaveBeenCalledTimes(1);
  });
});
