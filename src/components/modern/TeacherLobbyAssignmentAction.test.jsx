import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import TeacherLobbyAssignmentAction from './TeacherLobbyAssignmentAction';

describe('TeacherLobbyAssignmentAction', () => {
  it('invokes shared assignment handler when enabled', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <TeacherLobbyAssignmentAction
        action={{
          key: 'assign-homework',
          label: 'Assign HW',
          variant: 'outline',
          iconKind: 'assign-homework',
          slot: 4,
          onSelect,
          assignability: {
            assignable: true,
            contentRef: { contentKind: 'ielts_reading', contentId: 'test-1' },
          },
        }}
      />
    );

    const button = screen.getByRole('button', { name: 'Assign HW' });
    expect(button).not.toHaveStyle({ gridColumn: '4' });

    await user.click(button);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders disabled reason without firing handler', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <TeacherLobbyAssignmentAction
        action={{
          key: 'assign-homework',
          label: 'Assign HW',
          variant: 'outline',
          iconKind: 'assign-homework',
          slot: 4,
          disabled: true,
          disabledReason: 'Publish first',
          onSelect,
          assignability: {
            assignable: false,
            reasonCode: 'CONTENT_UNPUBLISHED',
          },
        }}
      />
    );

    const button = screen.getByRole('button', { name: 'Assign HW' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Publish first');

    await user.click(button);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
