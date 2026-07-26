import { getAuth } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import {
  BOOK_ACTIVITY_ROLLOUT_GATES,
  isBookActivityRolloutGateEnabled,
} from '../../config/bookActivityRolloutGates';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import type { MaterialBookMetadata } from '../../types/materialCatalog.types';
import {
  createSourceUploadBrowserWorkflow,
  type SourceUploadBrowserWorkflow,
  type SourceUploadSelection,
} from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import {
  createSourceUploadClient,
  createSourceUploadSessionStatePort,
} from '../../services/book-source-delivery/sourceUpload.client';
import BookSourceInspectionPanel, {
  type BookSourceInspectionAction,
} from './BookSourceInspectionPanel';
import BookSourceUploadPanel, {
  type BookSourceUploadAction,
} from './BookSourceUploadPanel';
import type { BookEditorAccess } from './useBookEditorModeResolution';
import './BookMode2EditorShell.css';

interface BookMode2EditorShellProps {
  readonly access: BookEditorAccess;
  readonly book: MaterialBookMetadata;
  readonly presentation: 'modal' | 'page-compat';
  /** Test/preview seam. Production resolves fixed browser configuration below. */
  readonly uploadWorkflow?: SourceUploadBrowserWorkflow | null;
  readonly uploadPresentationEnabled?: boolean;
}

const configuredUploadWorkflow = (): SourceUploadBrowserWorkflow | null => {
  const controlUrl = import.meta.env.VITE_BOOK_SOURCE_CONTROL_WORKER_URL?.trim();
  const b2Origin = import.meta.env.VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN?.trim();
  if (!controlUrl || !b2Origin) return null;
  const control = createSourceUploadClient({
    baseUrl: controlUrl,
    getIdToken: async () => {
      const user = getAuth().currentUser;
      if (!user) return '';
      return user.getIdToken(true);
    },
  });
  return createSourceUploadBrowserWorkflow({
    control,
    state: createSourceUploadSessionStatePort(),
    allowedB2Origins: [b2Origin],
  });
};

const BookMode2EditorShell = ({
  access,
  book,
  presentation,
  uploadWorkflow,
  uploadPresentationEnabled,
}: BookMode2EditorShellProps) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const [uploadSelection, setUploadSelection] =
    useState<SourceUploadSelection | null>(null);
  const source = presentation === 'modal' ? 'book_editor_modal' : 'book_editor_route';
  const mutationEnabled = isBookActivityRolloutGateEnabled(
    BOOK_ACTIVITY_ROLLOUT_GATES.mutation,
  );
  const uploadEnabled = uploadPresentationEnabled ?? isBookActivityRolloutGateEnabled(
    BOOK_ACTIVITY_ROLLOUT_GATES.upload,
  );
  const resolvedUploadWorkflow = useMemo(
    () => uploadWorkflow === undefined ? configuredUploadWorkflow() : uploadWorkflow,
    [uploadWorkflow],
  );
  const trackInspectionAction = (
    action: BookSourceInspectionAction,
    metadata?: Record<string, unknown>,
  ) => {
    trackAction(action, {
      bookId: book.bookId,
      source,
      ...metadata,
    });
  };
  const trackUploadAction = (
    action: BookSourceUploadAction,
    metadata?: Record<string, unknown>,
  ) => {
    trackAction(action, {
      bookId: book.bookId,
      source,
      ...metadata,
    });
  };

  useEffect(() => {
    trackAction('openBook', {
      bookId: book.bookId,
      source,
    });
  }, [book.bookId, source, trackAction]);

  return (
    <main
      className="book-mode2-editor-shell"
      data-book-mode="pdf"
      data-presentation={presentation}
    >
      <section className="book-mode2-editor-shell__intro" aria-labelledby="book-mode2-title">
        <p className="book-mode2-editor-shell__eyebrow">PDF Book</p>
        <h1 id="book-mode2-title">{book.title}</h1>
        <p>
          Book Assembly uses a separate workspace from the materials-based Book editor.
        </p>
      </section>

      {access !== 'public-readonly' && (
        <BookSourceInspectionPanel
          canRequestUploadAuthorization={Boolean(
            uploadEnabled && resolvedUploadWorkflow,
          )}
          onAction={trackInspectionAction}
          onClaimChange={(selection) => {
            if (selection === null) setUploadSelection(null);
          }}
          onRequestUploadAuthorization={setUploadSelection}
        />
      )}

      {access !== 'public-readonly' && resolvedUploadWorkflow && (
        <BookSourceUploadPanel
          allowFreshUpload={uploadEnabled}
          bookId={book.bookId}
          immutablePublished={book.visibility === 'public-library-published'}
          onAction={trackUploadAction}
          selection={uploadSelection}
          workflow={resolvedUploadWorkflow}
        />
      )}

      <section
        className="book-mode2-editor-shell__status"
        aria-labelledby="book-mode2-status-title"
      >
        <h2 id="book-mode2-status-title">
          {mutationEnabled && access !== 'public-readonly'
            ? 'Assembly workspace'
            : 'Assembly is read-only'}
        </h2>
        <p>
          {mutationEnabled && access !== 'public-readonly'
            ? 'Assembly capabilities will appear here when their ticket-owned services are available.'
            : 'Upload, publication, placement, launch, and mutation remain disabled. This PDF Book will never fall back to the materials editor.'}
        </p>
        <dl>
          <div>
            <dt>Mode</dt>
            <dd>PDF Assembly</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>{access === 'public-readonly' ? 'Public read-only' : 'Authorized teacher'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{book.status}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
};

export default BookMode2EditorShell;
