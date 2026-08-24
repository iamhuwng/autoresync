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
import { createBookAssemblyClient } from '../../services/book-assembly/assemblyClient.browser';
import type { BookAssemblyMigrationClient } from '../../services/book-assembly/assemblyClient.browser';
import { createActivityAuthoringRepository } from '../../services/book-activity/activityAuthoring.repository';
import { createActivityAuthoringService, type ActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import { createActivityAuthoringTransport } from '../../services/book-activity/activityStorage.service';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type {
  BookAssemblyCandidateRecord,
} from '../../services/book-assembly/unitAssembly.types';
import type { TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import type { BookTeacherAssemblyDocumentProjection } from '../../services/book-delivery/bookTeacherAssemblyDocument.types';
import type { CandidateUnitPreviewProjection } from '../../services/book-assembly/unitPreview.service';
import BookAssemblyWorkspace from './BookAssemblyWorkspace';
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
  readonly assemblyRepository?: UnitAssemblyRepository | null;
  readonly assemblyMigrationClient?: BookAssemblyMigrationClient | null;
  readonly activityAuthoring?: ActivityAuthoringService | null;
  readonly assemblySourceVersions?: readonly TrustedBookSourceVersionProjection[];
  readonly assemblyInitialCandidate?: BookAssemblyCandidateRecord | null;
  readonly assemblyBookRevision?: number;
  readonly assemblySourceSetRevision?: number;
  readonly assemblyPreviewDocuments?: readonly BookTeacherAssemblyDocumentProjection[];
  readonly assemblyPreviewGetIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  readonly assemblyCandidateRuntimePreview?: CandidateUnitPreviewProjection | null;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

const configuredUploadWorkflow = (): SourceUploadBrowserWorkflow | null => {
  const controlUrl = import.meta.env.VITE_BOOK_SOURCE_CONTROL_WORKER_URL?.trim();
  const reconciliationUrl = import.meta.env.VITE_BOOK_SOURCE_RECONCILIATION_WORKER_URL?.trim();
  const b2Origin = import.meta.env.VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN?.trim();
  if (!controlUrl || !reconciliationUrl || !b2Origin) return null;
  const control = createSourceUploadClient({
    baseUrl: controlUrl,
    reconciliationBaseUrl: reconciliationUrl,
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

const configuredAssemblyRepository = (): UnitAssemblyRepository | null => {
  const baseUrl = import.meta.env.VITE_BOOK_ASSEMBLY_WORKER_URL?.trim();
  if (!baseUrl) return null;
  return createBookAssemblyClient({
    baseUrl,
    getIdToken: async () => {
      const user = getAuth().currentUser;
      if (!user) return '';
      return user.getIdToken(true);
    },
  });
};

const configuredAssemblyMigrationClient = (): BookAssemblyMigrationClient | null => {
  const baseUrl = import.meta.env.VITE_BOOK_ASSEMBLY_WORKER_URL?.trim();
  if (!baseUrl) return null;
  return createBookAssemblyClient({
    baseUrl,
    getIdToken: async () => {
      const user = getAuth().currentUser;
      if (!user) return '';
      return user.getIdToken(true);
    },
  });
};

const getCurrentFirebaseIdToken = async (): Promise<string> => {
  const user = getAuth().currentUser;
  if (!user) return '';
  return user.getIdToken(true);
};

const configuredActivityAuthoring = (bookId: string): ActivityAuthoringService | null => {
  const baseUrl = import.meta.env.VITE_BOOK_ACTIVITY_AUTHORING_WORKER_URL?.trim()
    || import.meta.env.VITE_BOOK_ASSEMBLY_WORKER_URL?.trim();
  if (!baseUrl) return null;
  return createActivityAuthoringService(
    createActivityAuthoringRepository(
      createActivityAuthoringTransport({
        baseUrl,
        getIdToken: getCurrentFirebaseIdToken,
      }),
    ),
    { bookId },
  );
};

const BookMode2EditorShell = ({
  access,
  book,
  presentation,
  uploadWorkflow,
  uploadPresentationEnabled,
  assemblyRepository,
  assemblyMigrationClient,
  activityAuthoring,
  assemblySourceVersions = [],
  assemblyInitialCandidate,
  assemblyBookRevision = 0,
  assemblySourceSetRevision = 0,
  assemblyPreviewDocuments,
  assemblyPreviewGetIdToken,
  assemblyCandidateRuntimePreview,
  onDirtyChange,
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
  const resolvedAssemblyRepository = useMemo(
    () => assemblyRepository === undefined ? configuredAssemblyRepository() : assemblyRepository,
    [assemblyRepository],
  );
  const resolvedAssemblyMigrationClient = useMemo(
    () => assemblyMigrationClient === undefined ? configuredAssemblyMigrationClient() : assemblyMigrationClient,
    [assemblyMigrationClient],
  );
  const resolvedActivityAuthoring = useMemo(
    () => activityAuthoring === undefined ? configuredActivityAuthoring(book.bookId) : activityAuthoring,
    [activityAuthoring, book.bookId],
  );
  const uploadUnavailableMessage = !uploadEnabled
    ? 'Upload authorization is disabled by the current presentation gate.'
    : !resolvedUploadWorkflow
      ? 'Upload authorization is unavailable because the source Worker configuration is missing.'
      : undefined;
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
          Verify one private PDF in your browser, upload it through the authorized source path,
          then assemble the Book. PDF Books stay separate from the materials editor.
        </p>
      </section>

      <nav className="book-mode2-editor-shell__workflow" aria-label="PDF Book workflow">
        <ol>
          <li className="is-current">
            <span aria-hidden="true">1</span>
            <div>
              <strong>Inspect PDF</strong>
              <small>Check the exact file locally</small>
            </div>
          </li>
          <li>
            <span aria-hidden="true">2</span>
            <div>
              <strong>Authorize &amp; upload</strong>
              <small>Transfer only after verification</small>
            </div>
          </li>
          <li>
            <span aria-hidden="true">3</span>
            <div>
              <strong>Assemble</strong>
              <small>Configure the PDF Book structure</small>
            </div>
          </li>
        </ol>
      </nav>

      {access !== 'public-readonly' && (
        <BookSourceInspectionPanel
          canRequestUploadAuthorization={Boolean(
            uploadEnabled && resolvedUploadWorkflow,
          )}
          uploadUnavailableMessage={uploadUnavailableMessage}
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

      {mutationEnabled && access !== 'public-readonly' ? (
        <BookAssemblyWorkspace
          access={access}
          bookId={book.bookId}
          bookTitle={book.title}
          bookRevision={assemblyBookRevision}
          sourceSetRevision={assemblySourceSetRevision}
          sourceVersions={assemblySourceVersions}
          initialCandidate={assemblyInitialCandidate}
          presentation={presentation}
          repository={resolvedAssemblyRepository ?? undefined}
          migrationClient={resolvedAssemblyMigrationClient}
          activityAuthoring={resolvedActivityAuthoring}
          previewDocuments={assemblyPreviewDocuments}
          previewGetIdToken={assemblyPreviewGetIdToken}
          candidateRuntimePreview={assemblyCandidateRuntimePreview}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <section
          className="book-mode2-editor-shell__status"
          aria-labelledby="book-mode2-status-title"
        >
          <h2 id="book-mode2-status-title">Assembly is currently read-only</h2>
          <p>
            PDF inspection and upload remain separate from Assembly. Draft structure editing is
            controlled independently, and this PDF Book will never fall back to the materials editor.
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
      )}
    </main>
  );
};

export default BookMode2EditorShell;
