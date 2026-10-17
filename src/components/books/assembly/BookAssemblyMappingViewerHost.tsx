import { useEffect, useMemo, useState } from 'react';
import type { BookUnitCandidate, TrustedBookSourceVersionProjection } from '../../../types/bookAssembly.types';
import {
  AssemblyMappingViewerError,
  documentForSourceKey,
  resolveAssemblyMappingViewerSelection,
  safeMappingPageText,
  type AssemblyMappingViewerPageSelection,
} from '../../../services/book-assembly/assemblyMappingViewer.browser';
import type { BookTeacherAssemblyDocumentProjection } from '../../../services/book-delivery/bookTeacherAssemblyDocument.types';
import BookPdfViewerHost from '../../book-runtime/BookPdfViewerHost';

export interface BookAssemblyMappingViewerHostProps {
  readonly bookTitle: string;
  readonly documents: readonly BookTeacherAssemblyDocumentProjection[];
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
  readonly selectedSourceVersionId: string | null;
  readonly selectedUnit?: BookUnitCandidate | null;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  readonly onDocumentSelected: (sourceVersionId: string) => void;
  readonly onViewerPageSelected: (selection: AssemblyMappingViewerPageSelection) => void;
  readonly onError?: (message: string) => void;
}

const errorMessage = (error: unknown): string => {
  if (error instanceof AssemblyMappingViewerError) {
    if (error.code === 'document-unavailable') return 'Authorized preview route is unavailable for that source.';
    if (error.code === 'page-out-of-range') return 'Selected page is outside the authorized Source Version.';
    return 'Enter a valid one-based physical page.';
  }
  return 'Mapping viewer could not select that page.';
};

export const BookAssemblyMappingViewerHost = ({
  bookTitle,
  documents,
  sourceVersions,
  selectedSourceVersionId,
  selectedUnit,
  getIdToken,
  onDocumentSelected,
  onViewerPageSelected,
  onError,
}: BookAssemblyMappingViewerHostProps) => {
  const selectedDocument = useMemo(() => (
    documents.find((document) => document.sourceVersionId === selectedSourceVersionId) ?? null
  ), [documents, selectedSourceVersionId]);
  const [pageDraft, setPageDraft] = useState('1');
  const [viewerPage, setViewerPage] = useState<number | undefined>(
    selectedDocument?.route.physicalPageNumber,
  );

  useEffect(() => {
    setViewerPage(selectedDocument?.route.physicalPageNumber);
    setPageDraft(String(selectedDocument?.route.physicalPageNumber ?? 1));
  }, [selectedDocument]);

  const selectPage = (sourceKey: string, page: number) => {
    try {
      const selection = resolveAssemblyMappingViewerSelection({
        documents,
        sourceVersions,
        sourceKey,
        physicalPageNumber: page,
      });
      setViewerPage(selection.physicalPageNumber);
      setPageDraft(String(selection.physicalPageNumber));
      onDocumentSelected(selection.sourceVersionId);
      onViewerPageSelected(selection);
    } catch (error) {
      onError?.(errorMessage(error));
    }
  };

  if (documents.length === 0) {
    return (
      <p role="status">
        Preview is unavailable until the current saved candidate and Source Versions have fresh authorization.
      </p>
    );
  }

  return (
    <div className="book-assembly-workspace__mapping-viewer">
      <div className="book-assembly-workspace__preview-actions" aria-label="Authorized Assembly preview sources">
        {documents.map((document) => (
          <button
            key={`${document.sourceKey}:${document.sourceVersionId}`}
            type="button"
            onClick={() => {
              onDocumentSelected(document.sourceVersionId);
              setViewerPage(document.route.physicalPageNumber);
              setPageDraft(String(document.route.physicalPageNumber ?? 1));
            }}
          >
            Preview {document.sourceKey}
          </button>
        ))}
      </div>

      {selectedDocument ? (
        <>
          <div className="book-assembly-workspace__mapping-viewer-controls" aria-label="Viewer page mapping controls">
            <label>
              Viewer local page
              <input
                aria-label="Viewer local page"
                inputMode="numeric"
                value={pageDraft}
                onChange={(event) => setPageDraft(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => selectPage(selectedDocument.sourceKey, Number(pageDraft))}
            >
              Use viewer page for mapping
            </button>
          </div>
          <BookPdfViewerHost
            key={`${selectedDocument.sourceVersionId}:${viewerPage ?? 'default'}`}
            title={`${bookTitle} — ${selectedDocument.sourceKey}`}
            route={selectedDocument.route}
            initialPage={viewerPage}
            getIdToken={getIdToken}
          />
        </>
      ) : (
        <p role="status">Choose an authorized source to preview mapped pages.</p>
      )}

      {selectedUnit && selectedUnit.pageGroups.length > 0 && (
        <div className="book-assembly-workspace__mapping-viewer-groups">
          <h3>Mapped pages in this Unit</h3>
          <ol aria-label="Preview mapped Page Groups">
            {selectedUnit.pageGroups.map((group) => (
              <li key={group.pageGroupKey}>
                <span>{group.pageGroupKey}</span>
                {group.pages.map((page) => {
                  const document = documentForSourceKey(documents, group.sourceKey);
                  const label = document
                    ? `Preview ${safeMappingPageText({
                        sourceKey: group.sourceKey,
                        sourceVersionId: document.sourceVersionId,
                        physicalPageNumber: page,
                      })}`
                    : `Preview ${group.sourceKey} page ${page}`;
                  return (
                    <button
                      key={`${group.sourceKey}:${page}`}
                      type="button"
                      onClick={() => selectPage(group.sourceKey, page)}
                    >
                      {label}
                    </button>
                  );
                })}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export default BookAssemblyMappingViewerHost;
