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

  it('keeps row actions in slot order without fixed placement', async () => {
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

    expect(screen.getAllByRole('button', { name: /Edit|Assign HW/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'Edit',
      'Assign HW',
    ]);
    expect(screen.getByRole('button', { name: 'Edit' })).not.toHaveStyle({ gridColumn: '1' });
    expect(screen.getByRole('button', { name: 'Assign HW' })).not.toHaveStyle({ gridColumn: '4' });

    await user.click(screen.getByRole('button', { name: 'Assign HW' }));

    expect(onAssign).toHaveBeenCalledTimes(1);
  });

  it('renders actions in slot order so the rail stays on one line', () => {
    render(
      <MaterialListRow
        row={makeRow({
          actions: [
            { key: 'edit', label: 'Edit', variant: 'secondary', iconKind: 'edit', slot: 1, onSelect: vi.fn() },
            { key: 'assign-homework', label: 'Assign homework', variant: 'primary', iconKind: 'clone', slot: 4, onSelect: vi.fn() },
            { key: 'archive', label: 'Remove from library', variant: 'danger', iconKind: 'archive', slot: 3, onSelect: vi.fn() },
          ],
        })}
      />
    );

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Edit',
      'Remove from library',
      'Assign homework',
    ]);
    expect(screen.getByRole('button', { name: 'Remove from library' })).not.toHaveStyle({ gridColumn: '3' });
    expect(screen.getByRole('button', { name: 'Assign homework' })).not.toHaveStyle({ gridColumn: '4' });
  });

  it('uses row highlight and row click for Reading Passage selection', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <MaterialListRow
        row={makeRow({
          title: 'Passage A',
          selection: {
            checked: false,
            label: 'Select Passage A',
            onChange,
          },
        })}
      />
    );

    const row = screen.getByTestId('material-list-row-row-1');

    expect(screen.queryByRole('checkbox', { name: 'Select Passage A' })).not.toBeInTheDocument();
    expect(row).toHaveAttribute('aria-selected', 'false');

    await user.click(row);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not toggle row selection when clicking row actions', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onOpen = vi.fn();

    render(
      <MaterialListRow
        row={makeRow({
          title: 'Passage A',
          selection: {
            checked: true,
            label: 'Select Passage A',
            onChange,
          },
          actions: [
            { key: 'open', label: 'Open', iconKind: 'view', onSelect: onOpen },
          ],
        })}
      />
    );

    const row = screen.getByTestId('material-list-row-row-1');
    expect(row).toHaveClass('is-selected');
    expect(row).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Open' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
