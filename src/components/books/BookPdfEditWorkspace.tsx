import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import type { MaterialBooksRepository } from '../../services/materialCatalog/materialBooks.service';
import type { MaterialBookMetadata } from '../../types/materialCatalog.types';
import BookEditorWorkspace from './BookEditorWorkspace';
import BookMode2EditorShell from './BookMode2EditorShell';
import type { BookEditorAccess } from './useBookEditorModeResolution';
import type { BookPdfEditorSection } from './BookPdfFlowWorkspace';
import './BookPdfEditWorkspace.css';

type BookPdfEditTab =
  | 'metadata'
  | 'pdf-files'
  | 'content-tree'
  | 'activity-json'
  | 'page-mapping'
  | 'preview'
  | 'settings';

const PDF_EDIT_TABS: readonly { readonly id: BookPdfEditTab; readonly label: string }[] = [
  { id: 'metadata', label: 'Metadata' },
  { id: 'pdf-files', label: 'PDF files' },
  { id: 'content-tree', label: 'Content tree' },
  { id: 'activity-json', label: 'Activity JSON' },
  { id: 'page-mapping', label: 'Page mapping' },
  { id: 'preview', label: 'Preview' },
  { id: 'settings', label: 'Settings' },
];

const isMetadataTab = (tab: BookPdfEditTab): tab is 'metadata' | 'settings' =>
  tab === 'metadata' || tab === 'settings';

const assemblySectionFor = (tab: Exclude<BookPdfEditTab, 'metadata' | 'settings'>): BookPdfEditorSection => tab;

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
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const [activeTab, setActiveTab] = useState<BookPdfEditTab>('metadata');
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [assemblyDirty, setAssemblyDirty] = useState(false);
  const editorId = useId();
  const metadataTab = isMetadataTab(activeTab);
  const assemblySection = metadataTab ? 'pdf-files' : assemblySectionFor(activeTab);

  useEffect(() => {
    setActiveTab('metadata');
    setMetadataDirty(false);
    setAssemblyDirty(false);
  }, [book.bookId]);

  useEffect(() => {
    onDirtyChange?.(metadataDirty || assemblyDirty);
  }, [assemblyDirty, metadataDirty, onDirtyChange]);

  const selectTab = (tab: BookPdfEditTab) => {
    setActiveTab(tab);
    trackAction('teacher_materials_book_pdf_workflow_step_changed', {
      bookId: book.bookId,
      editorSection: tab,
      source: presentation === 'modal' ? 'book_editor_modal_tabs' : 'book_editor_page_tabs',
    });
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: BookPdfEditTab) => {
    const currentIndex = PDF_EDIT_TABS.findIndex((tab) => tab.id === currentTab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % PDF_EDIT_TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + PDF_EDIT_TABS.length) % PDF_EDIT_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = PDF_EDIT_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = PDF_EDIT_TABS[nextIndex].id;
    selectTab(nextTab);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
      ?.focus();
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
        {PDF_EDIT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${editorId}-${tab.id}`}
            aria-controls={`${editorId}-${isMetadataTab(tab.id) ? 'metadata-panel' : 'assembly-panel'}`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={activeTab === tab.id ? 'is-active' : undefined}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
          >
            {tab.label}
          </button>
        ))}
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
        aria-labelledby={`${editorId}-${metadataTab ? 'pdf-files' : activeTab}`}
        hidden={metadataTab}
        className="book-pdf-edit-workspace__panel"
      >
        <BookMode2EditorShell
          access={access}
          book={book}
          presentation={presentation}
          experience="focused-editing"
          editingSection={assemblySection}
          onDirtyChange={setAssemblyDirty}
        />
      </div>
    </section>
  );
};

export default BookPdfEditWorkspace;
