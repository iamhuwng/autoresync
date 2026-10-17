import { toast } from '../modern/ToastNotification';

export const announceBookUpdateOutcome = (result:
  | { readonly status: 'completed'; readonly notifiedRecipients: number }
  | { readonly status: 'notification-pending' }
  | { readonly status: 'failed' }
): void => {
  if (result.status === 'completed') {
    toast.success(result.notifiedRecipients === 0
      ? 'Book update completed. No student notification was needed.'
      : `Book update completed. ${result.notifiedRecipients} student notification${result.notifiedRecipients === 1 ? '' : 's'} sent.`);
    return;
  }
  if (result.status === 'notification-pending') {
    toast.warning('Book update committed. Student notifications are pending and will retry.');
    return;
  }
  toast.error('Could not complete the Book update. Review the action status and try again.');
};
