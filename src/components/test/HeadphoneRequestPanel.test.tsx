import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HeadphoneRequestPanel } from './HeadphoneRequestPanel';

describe('HeadphoneRequestPanel', () => {
  it('keeps pending, approved, and denied requests visible to the teacher', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    const onRevoke = vi.fn();

    render(
      <HeadphoneRequestPanel
        requests={[
          { studentId: 'student-pending', studentName: 'Pending Student', requestedAt: Date.now(), status: 'pending' },
          { studentId: 'student-approved', studentName: 'Approved Student', requestedAt: Date.now(), status: 'approved' },
          { studentId: 'student-denied', studentName: 'Denied Student', requestedAt: Date.now(), status: 'denied' },
        ]}
        onApprove={onApprove}
        onDeny={onDeny}
        onRevoke={onRevoke}
      />,
    );

    expect(screen.getByText('Pending Student')).toBeTruthy();
    expect(screen.getByText('Approved Student')).toBeTruthy();
    expect(screen.getByText('Denied Student')).toBeTruthy();
    expect(screen.getAllByText(/Pending/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Approved/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Denied/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTitle('Approve request'));
    fireEvent.click(screen.getByTitle('Deny request'));
    fireEvent.click(screen.getByTitle('Revoke permission'));

    expect(onApprove).toHaveBeenCalledWith('student-pending');
    expect(onDeny).toHaveBeenCalledWith('student-pending');
    expect(onRevoke).toHaveBeenCalledWith('student-approved');
  });
});
