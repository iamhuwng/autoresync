import { Button } from '../../../../components/modern';

export type ListeningLifecyclePendingAction = 'restore' | 'archive' | null;

interface ListeningLifecycleActionsProps {
  readonly canRestore: boolean;
  readonly canArchive: boolean;
  readonly pendingAction: ListeningLifecyclePendingAction;
  readonly onRestore: () => void;
  readonly onArchive: () => void;
}

export function ListeningLifecycleActions({
  canRestore,
  canArchive,
  pendingAction,
  onRestore,
  onArchive,
}: ListeningLifecycleActionsProps) {
  if (!canRestore && !canArchive) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Listening lifecycle actions"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}
    >
      {canRestore ? (
        <Button
          variant="secondary"
          onClick={onRestore}
          disabled={pendingAction !== null}
          style={{ minHeight: '44px' }}
        >
          {pendingAction === 'restore' ? 'Restoring draft...' : 'Restore draft'}
        </Button>
      ) : null}
      {canArchive ? (
        <Button
          variant="outline"
          onClick={onArchive}
          disabled={pendingAction !== null}
          style={{ minHeight: '44px' }}
        >
          {pendingAction === 'archive' ? 'Archiving...' : 'Archive published version'}
        </Button>
      ) : null}
    </div>
  );
}

export default ListeningLifecycleActions;
