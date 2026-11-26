import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import type { MaterialBooksRepository } from '../../services/materialCatalog/materialBooks.service';
import type { MaterialBookMetadata } from '../../types/materialCatalog.types';
import BookEditorWorkspace from './BookEditorWorkspace';
import BookMode2EditorShell from './BookMode2EditorShell';
import type { BookEditorAccess } from './useBookEditorModeResolution';
import {
  isMetadataWorkspaceTab,
  pickInitialPdfWorkspaceTab,
  type BookPdfAssemblySection,
  type BookPdfWorkflowSummary,
  type BookPdfWorkspaceTab,
} from './bookPdfWorkflowState';
import './BookPdfEditWorkspace.css';

const PDF_WORKSPACE_TABS: readonly { readonly id: BookPdfWorkspaceTab; readonly label: string }[] = [
  { id: 'pdf-files', label: 'PDF files' },
  { id: 'content-tree', label: 'Book outline' },
  { id: 'activity-json', label: 'Unit activities' },
  { id: 'page-mapping', label: 'Page mapping' },
  { id: 'preview', label: 'Preview & publish' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'settings', label: 'Settings' },
];

const initialTabForBook = (book: MaterialBookMetadata): BookPdfWorkspaceTab =>
  book.sourceSet ? 'content-tree' : 'pdf-files';

interface BookPdfEditWorkspaceProps {
  readonly access: BookEditorAccess;
  readonly book: MaterialBookMetadata;
  readonly presentation: 'modal' | 'page-compat';
  readonly repository?: MaterialBooksRepository;
  readonly usePublicProjection?: boolean;
  readonly onSaved?: (bookId: string) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

const BookPdfEditWorkspace = ({
  access,
  book,
  presentation,
  repository,
  usePublicProjection = false,
  onSaved,
  onDirtyChange,
}: BookPdfEditWorkspaceProps) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.bookAuthoring);
  const defaultTab = initialTabForBook(book);
  const [activeTab, setActiveTab] = useState<BookPdfWorkspaceTab>(defaultTab);
  const [lastAssemblySection, setLastAssemblySection] = useState<BookPdfAssemblySection>(
    isMetadataWorkspaceTab(defaultTab) ? 'pdf-files' : defaultTab,
  );
  const [workflowSummary, setWorkflowSummary] = useState<BookPdfWorkflowSummary | null>(null);
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [assemblyDirty, setAssemblyDirty] = useState(false);
  const userSelectedTabRef = useRef(false);
  const autoResumedBookIdRef = useRef<string | null>(null);
  const editorId = useId();
  const metadataTab = isMetadataWorkspaceTab(activeTab);

  useEffect(() => {
    const nextDefault = initialTabForBook(book);
    setActiveTab(nextDefault);
    setLastAssemblySection(isMetadataWorkspaceTab(nextDefault) ? 'pdf-files' : nextDefault);
    setWorkflowSummary(null);
    setMetadataDirty(false);
    setAssemblyDirty(false);
    userSelectedTabRef.current = false;
    autoResumedBookIdRef.current = null;
  }, [book.bookId, Boolean(book.sourceSet)]);

  useEffect(() => {
    onDirtyChange?.(metadataDirty || assemblyDirty);
  }, [assemblyDirty, metadataDirty, onDirtyChange]);

  const selectTab = useCallback((tab: BookPdfWorkspaceTab) => {
    userSelectedTabRef.current = true;
    setActiveTab(tab);
    if (!isMetadataWorkspaceTab(tab)) {
      setLastAssemblySection(tab);
    }
    trackAction('teacher_materials_book_pdf_workflow_step_changed', {
      bookId: book.bookId,
      editorSection: tab,
      source: presentation === 'modal' ? 'book_editor_modal_tabs' : 'book_editor_page_tabs',
    });
  }, [book.bookId, presentation, trackAction]);

  const handleWorkflowSummaryChange = useCallback((summary: BookPdfWorkflowSummary) => {
    setWorkflowSummary(summary);
    if (userSelectedTabRef.current || autoResumedBookIdRef.current === book.bookId) return;
    if (!summary.hasMode) return;
    autoResumedBookIdRef.current = book.bookId;
    const target = pickInitialPdfWorkspaceTab(summary);
    setActiveTab(target);
    if (!isMetadataWorkspaceTab(target)) {
      setLastAssemblySection(target);
    }
  }, [book.bookId]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: BookPdfWorkspaceTab) => {
    const currentIndex = PDF_WORKSPACE_TABS.findIndex((tab) => tab.id === currentTab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % PDF_WORKSPACE_TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + PDF_WORKSPACE_TABS.length) % PDF_WORKSPACE_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = PDF_WORKSPACE_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = PDF_WORKSPACE_TABS[nextIndex]!.id;
    selectTab(nextTab);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
      ?.focus();
  };

  const tabBadge = (tabId: BookPdfWorkspaceTab): string | null => {
    if (!workflowSummary) return null;
    if (tabId === 'pdf-files') return workflowSummary.sourceReady ? '✓' : null;
    if (tabId === 'content-tree') return workflowSummary.totalUnits > 0 ? String(workflowSummary.totalUnits) : null;
    if (tabId === 'activity-json') {
      return workflowSummary.totalUnits > 0
        ? `${workflowSummary.readyUnits}/${workflowSummary.totalUnits}`
        : null;
    }
    if (tabId === 'preview') {
      return workflowSummary.publishedUnits > 0
        ? `${workflowSummary.publishedUnits} live`
        : null;
    }
    return null;
  };

  if (access === 'public-readonly') {
    return (
      <section className="book-pdf-edit-workspace__readonly" role="status">
        <h2>PDF Book is read-only</h2>
        <p>Only the Book owner or an administrator can edit its files, content, activities, or settings.</p>
      </section>
    );
  }

  return (
    <section className="book-pdf-edit-workspace" aria-label="PDF Book editor">
      {presentation === 'page-compat' && (
        <header className="book-pdf-edit-workspace__heading">
          <p>Books / PDF Book</p>
          <h1>{book.title}</h1>
        </header>
      )}
      <nav className="book-pdf-edit-workspace__tabs" aria-label="PDF Book edit sections" role="tablist">
        {PDF_WORKSPACE_TABS.map((tab) => {
          const badge = tabBadge(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${editorId}-${tab.id}`}
              aria-controls={`${editorId}-${isMetadataWorkspaceTab(tab.id) ? 'metadata-panel' : 'assembly-panel'}`}
              aria-selected={activeTab === tab.id}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? 'is-active' : undefined}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
            >
              <span>{tab.label}</span>
              {badge && <span className="book-pdf-edit-workspace__tab-badge" aria-hidden="true">{badge}</span>}
            </button>
          );
        })}
      </nav>

      <div
        id={`${editorId}-metadata-panel`}
        role="tabpanel"
        aria-labelledby={`${editorId}-${metadataTab ? activeTab : 'metadata'}`}
        hidden={!metadataTab}
        className="book-pdf-edit-workspace__panel"
      >
        <BookEditorWorkspace
          bookId={book.bookId}
          initialBook={usePublicProjection ? undefined : book}
          repository={repository}
          presentation="modal"
          activeTab={activeTab === 'settings' ? 'settings' : 'overview'}
          onSaved={onSaved}
          onDirtyChange={setMetadataDirty}
          showInlineSaveActions
        />
      </div>

      <div
        id={`${editorId}-assembly-panel`}
        role="tabpanel"
        aria-labelledby={`${editorId}-${metadataTab ? lastAssemblySection : activeTab}`}
        hidden={metadataTab}
        className="book-pdf-edit-workspace__panel"
      >
        <BookMode2EditorShell
          access={access}
          book={book}
          presentation={presentation}
          experience="focused-editing"
          editingSection={lastAssemblySection}
          onDirtyChange={setAssemblyDirty}
          onSectionChange={selectTab}
          onWorkflowSummaryChange={handleWorkflowSummaryChange}
        />
      </div>
    </section>
  );
};

export default BookPdfEditWorkspace;
