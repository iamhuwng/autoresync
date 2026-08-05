import { useState } from 'react';
import type {
  PublicBookCatalogView,
  PublicBookReferenceStatus,
  PublicBookSelectionRequest,
} from '../../services/materialCatalog/publicBookReferenceFork.types';
import { toast } from '../modern/ToastNotification';
import './PublicBookReferenceForkPanel.css';

export interface PublicBookReferenceForkPanelProps {
  readonly catalog: PublicBookCatalogView;
  readonly selection: PublicBookSelectionRequest;
  readonly enabled?: boolean;
  readonly referenceStatus?: PublicBookReferenceStatus;
  readonly onReference: (selection: PublicBookSelectionRequest) => void | Promise<void>;
  readonly onFork: (selection: PublicBookSelectionRequest) => void | Promise<void>;
}

const stateLabel = (state: PublicBookCatalogView['publicState']): string => {
  switch (state) {
    case 'metadata-only':
      return 'Metadata only';
    case 'tree-public-runtime-blocked':
      return 'Public tree · runtime blocked';
    case 'playable':
      return 'Ready for entitled students';
    default:
      return 'Unavailable';
  }
};

const referenceStatusLabel = (status: PublicBookReferenceStatus | undefined): string | null => {
  switch (status) {
    case 'newer-version-available':
      return 'Newer version available';
    case 'adoption-required':
      return 'Owner adoption required';
    case 'revoked':
      return 'Upstream publication revoked';
    case 'replaced':
      return 'Upstream publication replaced';
    default:
      return null;
  }
};

const PublicBookReferenceForkPanel = ({
  catalog,
  selection,
  enabled = false,
  referenceStatus,
  onReference,
  onFork,
}: PublicBookReferenceForkPanelProps) => {
  const [busyAction, setBusyAction] = useState<'reference' | 'fork' | null>(null);
  const reuseAllowed = enabled
    && catalog.publicState !== 'metadata-only'
    && selection.activities.length > 0;
  const statusMessage = referenceStatusLabel(referenceStatus);

  const runAction = async (
    action: 'reference' | 'fork',
    callback: (selection: PublicBookSelectionRequest) => void | Promise<void>,
  ) => {
    if (!reuseAllowed || busyAction !== null) return;
    setBusyAction(action);
    try {
      await callback(selection);
      toast.success(
        action === 'reference'
          ? 'Referenced "' + catalog.title + '" at its pinned publication.'
          : 'Created a teacher-owned fork of "' + catalog.title + '".',
      );
    } catch {
      toast.error(
        action === 'reference'
          ? 'Could not reference "' + catalog.title + '".'
          : 'Could not create a fork of "' + catalog.title + '".',
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="public-book-reference-fork" aria-labelledby="public-book-reference-fork-title">
      <div className="public-book-reference-fork__heading">
        <div>
          <p className="public-book-reference-fork__eyebrow">Public Book reuse</p>
          <h3 id="public-book-reference-fork-title">{catalog.title}</h3>
        </div>
        <span className="public-book-reference-fork__state" data-state={catalog.publicState}>
          {stateLabel(catalog.publicState)}
        </span>
      </div>

      {!enabled && (
        <p className="public-book-reference-fork__disabled" role="status">
          Public Book reuse is currently unavailable.
        </p>
      )}
      {statusMessage && (
        <p className="public-book-reference-fork__notice" role="status">
          {statusMessage}
        </p>
      )}

      <div className="public-book-reference-fork__summary">
        <span>{selection.activities.length} selected Activity{selection.activities.length === 1 ? '' : 'ies'}</span>
        <span>{selection.kind === 'activity' ? 'Individual selection' : 'Structured selection'}</span>
        {catalog.newerVersionAvailable && <span>Newer version available</span>}
      </div>

      <div className="public-book-reference-fork__actions">
        <button
          type="button"
          disabled={!reuseAllowed || busyAction !== null}
          onClick={() => void runAction('reference', onReference)}
        >
          {busyAction === 'reference' ? 'Referencing…' : 'Reference pinned content'}
        </button>
        <button
          type="button"
          className="public-book-reference-fork__secondary-action"
          disabled={!reuseAllowed || busyAction !== null}
          onClick={() => void runAction('fork', onFork)}
        >
          {busyAction === 'fork' ? 'Creating fork…' : 'Customize here'}
        </button>
      </div>
    </section>
  );
};

export default PublicBookReferenceForkPanel;
