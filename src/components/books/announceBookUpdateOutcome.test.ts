import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../modern/ToastNotification';
import { announceBookUpdateOutcome } from './announceBookUpdateOutcome';

vi.mock('../modern/ToastNotification', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

describe('#110 teacher Book update announcements', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the shared transient announcement separately from persistent student records', () => {
    announceBookUpdateOutcome({ status: 'completed', notifiedRecipients: 1 });
    expect(toast.success).toHaveBeenCalledWith('Book update completed. 1 student notification sent.');
    announceBookUpdateOutcome({ status: 'notification-pending' });
    expect(toast.warning).toHaveBeenCalledWith(
      'Book update committed. Student notifications are pending and will retry.',
    );
    announceBookUpdateOutcome({ status: 'failed' });
    expect(toast.error).toHaveBeenCalledOnce();
  });
});
