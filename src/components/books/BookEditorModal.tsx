import { type KeyboardEvent, type ReactElement, useEffect, useId, useRef, useState } from 'react';
import type {
  MaterialBookMetadata,
  MaterialBookNode,
} from '../../types/materialCatalog.types';
import type {
  BookMaterialSummary,
} from '../../services/materialCatalog/bookEditor.service';
import type { MaterialBooksRepository } from '../../services/materialCatalog/materialBooks.service';
import BookEditorWorkspace, {
  BOOK_EDITOR_TABS,
  type BookEditorTab,
  type BookEditorWorkspaceHandle,
} from './BookEditorWorkspace';
import './BookEditorModal.css';

interface BookEditorModalProps {
  readonly opened: boolean;
  readonly bookId: string | null;
  readonly initialBook?: MaterialBookMetadata | null;
  readonly initialNodes?: readonly MaterialBookNode[];
  readonly materialCandidates?: readonly BookMaterialSummary[];
  readonly repository?: MaterialBooksRepository;
  readonly onClose: () => void;
  readonly onSaved?: (bookId: string) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly returnFocusTo?: HTMLElement | null;
}

const formatStatus = (value?: string): string => value || 'draft-empty';
const formatVisibility = (value?: string): string => value || 'private';
type IconProps = { readonly size?: number };

const OverviewIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ContentIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="8" y1="6" x2="21" y2="6" strokeLinecap="round" />
    <line x1="8" y1="12" x2="21" y2="12" strokeLinecap="round" />
    <line x1="8" y1="18" x2="21" y2="18" strokeLinecap="round" />
    <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const SettingsIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1v.09a2 2 0 0 1-4 0V21a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H2.9a2 2 0 0 1 0-4H3a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V2.9a2 2 0 0 1 4 0V3a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.22.38.4.75.6 1 .22.28.55.33 1 .33h.1a2 2 0 0 1 0 4H21a1.65 1.65 0 0 0-1 .33c-.28.22-.4.55-.6 1z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SaveIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const TAB_ICONS: Record<BookEditorTab, (props: IconProps) => ReactElement> = {
  overview: OverviewIcon,
  content: ContentIcon,
  settings: SettingsIcon,
};

const CloseIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 6 6 18" strokeLinecap="round" />
    <path d="m6 6 12 12" strokeLinecap="round" />
  </svg>
);

const BookEditorModal = ({
  opened,
  bookId,
  initialBook,
  initialNodes,
  materialCandidates,
  repository,
  onClose,
  onSaved,
  onDirtyChange,
  returnFocusTo,
}: BookEditorModalProps) => {
  const titleId = useId();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<BookEditorWorkspaceHandle | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [activeTab, setActiveTab] = useState<BookEditorTab>('content');

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!opened) {
      setConfirmClose(false);
      setDirty(false);
      return;
    }

    window.setTimeout(() => {
      frameRef.current?.focus();
    }, 0);
  }, [opened]);

  // Lock background scroll while the modal owns the viewport.
  useEffect(() => {
    if (!opened) {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [opened]);

  if (!opened || !bookId) {
    return null;
  }

  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // Keep keyboard focus inside the dialog; when the discard prompt is open,
  // trap within it so Tab cannot reach the obscured editor controls behind it.
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const container =
      event.currentTarget.querySelector<HTMLElement>('.book-editor-modal__confirm') ?? frameRef.current;

    if (!container) {
      return;
    }

    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (!first || !last) {
      return;
    }

    const active = document.activeElement;

    if (event.shiftKey) {
      if (active === first || !container.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !container.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  const closeNow = () => {
    onClose();
    window.setTimeout(() => {
      returnFocusTo?.focus();
    }, 0);
  };

  const requestClose = () => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }

    closeNow();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      trapFocus(event);
      return;
    }

    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();

    if (confirmClose) {
      setConfirmClose(false);
      return;
    }

    requestClose();
  };

  const title = initialBook?.title || 'Book Editor';

  return (
    <div
      className="book-editor-modal__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={frameRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="book-editor-modal__frame"
        onKeyDown={handleKeyDown}
      >
        <header className="book-editor-modal__header">
          <div className="book-editor-modal__title-group">
            <h2 id={titleId}>{title}</h2>
            <div className="book-editor-modal__chips" aria-label="Book editor status">
              <span>{formatStatus(initialBook?.status)}</span>
              <span>{formatVisibility(initialBook?.visibility)}</span>
              <span>{initialBook?.testTypeIds?.join(', ') || 'No Test Type'}</span>
            </div>
          </div>
          <div className="book-editor-modal__header-actions">
            <button
              type="button"
              className="book-editor-modal__primary-action"
              onClick={() => workspaceRef.current?.saveActive()}
            >
              <SaveIcon />
              Save
            </button>
            <button
              type="button"
              className="book-editor-modal__secondary-action"
              onClick={() => workspaceRef.current?.requestPublicReview()}
            >
              Request review
            </button>
            <button
              type="button"
              className="book-editor-modal__close"
              aria-label="Close Book editor"
              onClick={requestClose}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <nav className="book-editor-modal__tabs" aria-label="Book editor tabs" role="tablist">
          {BOOK_EDITOR_TABS.map((tab) => {
            const TabIcon = TAB_ICONS[tab.id];

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'is-active' : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                <TabIcon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="book-editor-modal__body">
          <BookEditorWorkspace
            ref={workspaceRef}
            bookId={bookId}
            initialBook={initialBook ?? undefined}
            initialNodes={initialNodes}
            materialCandidates={materialCandidates}
            repository={repository}
            presentation="modal"
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
            onSaved={onSaved}
            onDirtyChange={setDirty}
          />
        </div>

        {confirmClose && (
          <div className="book-editor-modal__confirm-backdrop">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="book-editor-discard-title"
              className="book-editor-modal__confirm"
            >
              <h3 id="book-editor-discard-title">Discard Book editor changes</h3>
              <p>Unsaved Book metadata or structure changes will be lost.</p>
              <div className="book-editor-modal__confirm-actions">
                <button type="button" className="book-editor-modal__secondary-action" onClick={() => setConfirmClose(false)}>
                  Keep editing
                </button>
                <button type="button" onClick={closeNow}>
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookEditorModal;
