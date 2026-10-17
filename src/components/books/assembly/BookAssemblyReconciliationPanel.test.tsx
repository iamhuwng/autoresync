import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import BookAssemblyReconciliationPanel from './BookAssemblyReconciliationPanel';

const report = {
  changes: [{
    id: 'moved:activity-1', changeClass: 'moved' as const, itemKey: 'activity-1',
    current: 'Unit 1', proposed: 'Unit 2', resolution: 'teacher-choice' as const,
    message: 'Cross-Unit Activity move requires an explicit decision.',
    target: { kind: 'activity-move' as const, activityKey: 'activity-1' },
  }],
  issues: [], releaseBlocking: false, requiresTeacherChoice: false,
  canApplyExactRepair: false, repairedManifest: null,
};

describe('BookAssemblyReconciliationPanel', () => {
  it('shows Current, Proposed, and Resolution columns with explicit choices and filters', async () => {
    const user = userEvent.setup();
    const onUseProposed = vi.fn();
    render(<BookAssemblyReconciliationPanel report={report} busy={false} onApplyExactRepair={vi.fn()} onRecordTeacherChoice={vi.fn()} onUseProposed={onUseProposed} />);

    expect(screen.getByText('Current Content Tree')).toBeInTheDocument();
    expect(screen.getByText('Proposed Content Tree')).toBeInTheDocument();
    expect(screen.getByText('Resolution and Preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use proposed' }));
    expect(onUseProposed).toHaveBeenCalledWith(report.changes[0]);
    await user.selectOptions(screen.getByLabelText('Change class'), 'added');
    expect(screen.getByText('No matching changes.')).toBeInTheDocument();
  });

  it('withholds choice controls when the workspace cannot apply the row', () => {
    render(<BookAssemblyReconciliationPanel report={{ ...report, changes: [{
      ...report.changes[0], id: 'unresolved:a→b', changeClass: 'unresolved', target: undefined,
    }] }} busy={false} onApplyExactRepair={vi.fn()} onRecordTeacherChoice={vi.fn()} onUseCurrent={vi.fn()} onUseProposed={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Keep current' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use proposed' })).toBeNull();
    expect(screen.getByText('Explicit reconciliation choices remain before handoff.')).toBeInTheDocument();
  });
});
