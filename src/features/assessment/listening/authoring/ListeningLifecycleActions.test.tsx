import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { render } from '../../../../test/test-utils';
import { ListeningLifecycleActions } from './ListeningLifecycleActions';

describe('ListeningLifecycleActions', () => {
  it('keeps restore and archive actions keyboard reachable with named controls', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn();
    const onArchive = vi.fn();

    render(
      <ListeningLifecycleActions
        canRestore
        canArchive
        pendingAction={null}
        onRestore={onRestore}
        onArchive={onArchive}
      />,
    );

    const restore = screen.getByRole('button', { name: 'Restore draft' });
    const archive = screen.getByRole('button', { name: 'Archive published version' });

    await user.tab();
    expect(restore).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRestore).toHaveBeenCalledTimes(1);

    await user.tab();
    expect(archive).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onArchive).toHaveBeenCalledTimes(1);

    expect(restore).toHaveStyle({ minHeight: '44px' });
    expect(archive).toHaveStyle({ minHeight: '44px' });
  });
});
