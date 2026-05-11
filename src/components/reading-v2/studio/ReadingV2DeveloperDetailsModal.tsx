import type { ReactNode } from 'react';

interface ReadingV2DeveloperDetailsModalProps {
  readonly children: ReactNode;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function ReadingV2DeveloperDetailsModal({
  children,
  open,
  onClose,
}: ReadingV2DeveloperDetailsModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="reading-v2-build-modal__backdrop">
      <section
        className="reading-v2-build-modal reading-v2-developer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reading-v2-developer-details-title"
      >
        <header className="reading-v2-build-modal__header">
          <h2 id="reading-v2-developer-details-title">Developer details</h2>
          <button
            className="reading-v2-build__icon-button"
            type="button"
            aria-label="Close developer details"
            onClick={onClose}
          >
            x
          </button>
        </header>
        <div className="reading-v2-developer-modal__body">
          {children}
        </div>
      </section>
    </div>
  );
}
