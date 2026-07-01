import type { ReactNode } from 'react';
import { Button } from '../../../../components/modern';
import { testCreationModalFooterStyle } from '../../../../components/test-creation/testCreationModalChrome';

type PendingAction = 'saveDraft' | 'publish' | 'discard' | null;

interface ListeningSavePublishBarProps {
  readonly onBack: () => void;
  readonly onNext?: () => void;
  readonly onSaveDraft: () => void;
  readonly onPublish: () => void;
  readonly onDiscard: () => void;
  readonly nextLabel?: string;
  readonly pendingAction: PendingAction;
  readonly canDiscard: boolean;
  readonly showNext: boolean;
  readonly actionsDisabled?: boolean;
  readonly trailingContent?: ReactNode;
}

export function ListeningSavePublishBar({
  onBack,
  onNext,
  onSaveDraft,
  onPublish,
  onDiscard,
  nextLabel = 'Next →',
  pendingAction,
  canDiscard,
  showNext,
  actionsDisabled = false,
  trailingContent,
}: ListeningSavePublishBarProps) {
  const isBusy = pendingAction !== null;

  return (
    <div
      style={{
        ...testCreationModalFooterStyle,
        flexWrap: 'wrap',
        gap: '0.625rem',
        marginTop: 0,
      }}
    >
      <Button variant="glass" onClick={onBack} disabled={isBusy || actionsDisabled}>
        ← Back
      </Button>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          gap: '0.75rem',
          marginLeft: 'auto',
          alignItems: 'center',
        }}
      >
        {trailingContent}
        {canDiscard ? (
          <Button
            variant="outline"
            onClick={onDiscard}
            disabled={isBusy || actionsDisabled}
          >
            Discard draft
          </Button>
        ) : null}
        <Button
          variant="secondary"
          onClick={onSaveDraft}
          disabled={actionsDisabled || (isBusy && pendingAction !== 'saveDraft')}
        >
          {pendingAction === 'saveDraft' ? 'Saving draft…' : 'Save draft'}
        </Button>
        <Button
          variant="primary"
          onClick={onPublish}
          disabled={actionsDisabled || (isBusy && pendingAction !== 'publish')}
        >
          {pendingAction === 'publish' ? 'Publishing…' : 'Publish'}
        </Button>
        {showNext && onNext ? (
          <Button variant="primary" onClick={onNext} disabled={isBusy || actionsDisabled}>
            {nextLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default ListeningSavePublishBar;
