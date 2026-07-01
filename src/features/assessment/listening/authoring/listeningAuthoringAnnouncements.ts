import { toast } from '../../../../components/modern';

export function announceListeningDraftSaved(warningCount: number) {
  if (warningCount > 0) {
    toast.warning(`Draft saved with warnings. ${warningCount} item${warningCount === 1 ? '' : 's'} still need attention before Publish.`);
    return;
  }
  toast.success('Draft saved.');
}

export function announceListeningDraftFailed(message: string) {
  toast.error(message);
}

export function announceListeningPublishBlocked(blockerCount: number) {
  toast.error(`Publish blocked. Resolve ${blockerCount} blocker${blockerCount === 1 ? '' : 's'} before publishing.`);
}

export function announceListeningPublishSucceeded(title: string) {
  toast.success(`Published "${title}".`);
}

export function announceListeningPublishFailed(message: string) {
  toast.error(message);
}

export function announceListeningDraftConflict() {
  toast.error('Draft conflict detected. Reload or merge newer changes before saving again.');
}

export function announceListeningDuplicateAction(actionLabel: 'Save draft' | 'Publish') {
  toast.info(`${actionLabel} already in progress. Wait for the current request to finish.`);
}

export function announceListeningDraftDiscarded() {
  toast.info('Draft changes discarded.');
}

export function announceListeningPublishedArchive() {
  toast.info('Published version archived.');
}

export function announceListeningDraftRestored() {
  toast.info('Draft restored.');
}
