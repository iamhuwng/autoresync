import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookHomeworkActivityBinding, BookHomeworkStructuralOutlineNode } from '../../types/homework.types';
import BookScheduleEditor from './BookScheduleEditor';
import styles from './BookScheduleEditor.css?raw';

const outline: readonly BookHomeworkStructuralOutlineNode[] = [
  { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1, titleSnapshot: 'Section 1' },
  { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' },
];
const activities: readonly BookHomeworkActivityBinding[] = [{
  state: 'required',
  bindingId: 'binding-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  activityVersionId: 'activity-version-1',
  nodeKey: 'unit-1',
  order: 1,
  titleSnapshot: 'Sample Activity',
  contextMode: 'none',
  pageGroupKeys: [],
  sourceReadiness: 'not-required',
  sourceContext: [],
}];

describe('BookScheduleEditor', () => {
  it('edits nested rules and shows exact inherited Activity windows', () => {
    const onChange = vi.fn();
    const value = {
      availableFrom: '',
      dueDate: '2026-08-30T12:00',
      scheduleRules: [{ nodeKey: 'section-1', availableFrom: '', dueAt: '2026-08-20T12:00' }],
    } as const;
    const view = render(
      <BookScheduleEditor value={value} onChange={onChange} outline={outline} activities={activities} />,
    );

    expect(screen.getByText('Open access', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-08-20T12:00').toISOString(), { selector: 'td' })).toBeInTheDocument();
    expect(screen.getAllByText(/Uses nearest deadline on section-1/i)).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Deadline override for Unit 1'), {
      target: { value: '2026-08-15T12:00' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      scheduleRules: expect.arrayContaining([
        expect.objectContaining({ nodeKey: 'unit-1', dueAt: '2026-08-15T12:00' }),
      ]),
    }));

    view.rerender(
      <BookScheduleEditor
        value={{ ...value, scheduleRules: [...value.scheduleRules, { nodeKey: 'unit-1', availableFrom: '', dueAt: '2026-08-15T12:00' }] }}
        onChange={onChange}
        outline={outline}
        activities={activities}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove overrides' })[1]!);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      scheduleRules: [value.scheduleRules[0]],
    }));
  });

  it('emits unsafe-shortening intent and renders a 33D optimistic conflict', () => {
    const onIntent = vi.fn();
    render(
      <BookScheduleEditor
        value={{
          availableFrom: '',
          dueDate: '2026-08-30T12:00',
          scheduleRules: [{ nodeKey: 'unit-1', availableFrom: '', dueAt: '2026-08-20T12:00' }],
        }}
        onChange={vi.fn()}
        outline={outline}
        activities={activities}
        affectedStudentStatesByNode={{ 'unit-1': ['not-started', 'in-progress'] }}
        conflictMessage="Schedule revision changed. Reload and review the current values."
        onIntent={onIntent}
      />,
    );

    fireEvent.change(screen.getByLabelText('Deadline override for Unit 1'), {
      target: { value: '2026-08-19T12:00' },
    });
    expect(onIntent).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'shorten',
      nodeKey: 'unit-1',
      requiresTrustedDenial: true,
    }));
    expect(screen.getByRole('alert')).toHaveTextContent(/schedule revision changed/i);
  });

  it('emits add, extend, and remove intents without claiming trusted authority', () => {
    const onIntent = vi.fn();
    const onChange = vi.fn();
    const view = render(
      <BookScheduleEditor
        value={{ availableFrom: '', dueDate: '2026-08-30T12:00', scheduleRules: [] }}
        onChange={onChange}
        outline={outline}
        activities={activities}
        affectedStudentStatesByNode={{ 'unit-1': ['not-started'] }}
        onIntent={onIntent}
      />,
    );

    fireEvent.change(screen.getByLabelText('Deadline override for Unit 1'), {
      target: { value: '2026-08-20T12:00' },
    });
    expect(onIntent).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'add',
      requiresTrustedDenial: false,
    }));

    view.rerender(
      <BookScheduleEditor
        value={{
          availableFrom: '',
          dueDate: '2026-08-30T12:00',
          scheduleRules: [{ nodeKey: 'unit-1', availableFrom: '', dueAt: '2026-08-20T12:00' }],
        }}
        onChange={onChange}
        outline={outline}
        activities={activities}
        affectedStudentStatesByNode={{ 'unit-1': ['in-progress'] }}
        onIntent={onIntent}
      />,
    );
    fireEvent.change(screen.getByLabelText('Deadline override for Unit 1'), {
      target: { value: '2026-08-21T12:00' },
    });
    expect(onIntent).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'extend',
      requiresTrustedDenial: false,
    }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove overrides' })[1]!);
    expect(onIntent).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: 'remove',
      requiresTrustedDenial: false,
    }));
  });

  it('keeps the native schedule controls keyboard reachable', async () => {
    const user = userEvent.setup();
    render(
      <BookScheduleEditor
        value={{ availableFrom: '', dueDate: '', scheduleRules: [] }}
        onChange={vi.fn()}
        outline={outline}
        activities={activities}
      />,
    );

    await user.tab();
    expect(screen.getByLabelText('Available From')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Due Date')).toHaveFocus();
  });

  it('keeps native 44px targets and responsive mobile/zoom containment', () => {
    expect(styles).toMatch(/min-height:\s*44px/);
    expect(styles).toMatch(/@media \(max-width: 700px\)[\s\S]*?flex-direction:\s*column/);
    expect(styles).toMatch(/@media \(max-width: 560px\)[\s\S]*?overflow-x:\s*auto/);
  });
});
