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
} from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import {
  createSourceUploadClient,
  createSourceUploadSessionStatePort,
  type SourceSetAttachmentClient,
  type SourceUploadSourceVersionReader,
} from '../../services/book-source-delivery/sourceUpload.client';
import { createBookAssemblyClient, type BookAssemblyMigrationClient } from '../../services/book-assembly/assemblyClient.browser';
import { createBookAssemblyPreviewClient, type BookAssemblyPreviewClient } from '../../services/book-assembly/assemblyPublication.client';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
import type { TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import type { BookTeacherAssemblyDocumentProjection } from '../../services/book-delivery/bookTeacherAssemblyDocument.types';
import type { CandidateUnitPreviewProjection } from '../../services/book-assembly/unitPreview.service';
import BookPdfFlowWorkspace from './BookPdfFlowWorkspace';
import type { BookSourceInspectionAction } from './BookSourceInspectionPanel';
import type { BookSourceUploadAction } from './BookSourceUploadPanel';
import type { ActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import { createActivityAuthoringRepository } from '../../services/book-activity/activityAuthoring.repository';
import { createActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import { createActivityAuthoringTransport } from '../../services/book-activity/activityStorage.service';
import type { BookEditorAccess } from './useBookEditorModeResolution';
import './BookMode2EditorShell.css';

export interface BookMode2EditorShellProps {
  readonly access: BookEditorAccess;
  readonly book: MaterialBookMetadata;
  readonly presentation: 'modal' | 'page-compat';
  readonly uploadWorkflow?: SourceUploadBrowserWorkflow | null;
  readonly uploadPresentationEnabled?: boolean;
  readonly assemblyRepository?: UnitAssemblyRepository | null;
  readonly assemblyMigrationClient?: BookAssemblyMigrationClient | null;
  readonly activityAuthoring?: ActivityAuthoringService | null;
  readonly assemblySourceVersions?: readonly TrustedBookSourceVersionProjection[];
  readonly assemblySourceVersionReader?: SourceUploadSourceVersionReader | null;
  readonly assemblyInitialCandidate?: BookAssemblyCandidateRecord | null;
  readonly assemblyBookRevision?: number;
  readonly assemblySourceSetRevision?: number;
  readonly sourceSetAttachmentClient?: SourceSetAttachmentClient | null;
  readonly assemblyPreviewDocuments?: readonly BookTeacherAssemblyDocumentProjection[];
  readonly assemblyPreviewGetIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  readonly assemblyCandidateRuntimePreview?: CandidateUnitPreviewProjection | null;
  readonly assemblyPreviewClient?: BookAssemblyPreviewClient | null;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

const getCurrentFirebaseIdToken = async (): Promise<string> => {
  const user = getAuth().currentUser;
  return user ? user.getIdToken(true) : '';
};

const configuredUploadWorkflow = (sourceKey = 'main'): SourceUploadBrowserWorkflow | null => {
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
    state: createSourceUploadSessionStatePort({ scopeKey: sourceKey }),
    allowedB2Origins: [b2Origin],
  });
};

const configuredAssemblyRepository = (): UnitAssemblyRepository | null => {
  const baseUrl = import.meta.env.VITE_BOOK_ASSEMBLY_WORKER_URL?.trim();
  if (!baseUrl) return null;
  return createBookAssemblyClient({ baseUrl, getIdToken: getCurrentFirebaseIdToken });
};

const configuredSourceSetAttachmentClient = (): SourceSetAttachmentClient | null => {
  const controlUrl = import.meta.env.VITE_BOOK_SOURCE_CONTROL_WORKER_URL?.trim();
  if (!controlUrl) return null;
  return createSourceUploadClient({
    baseUrl: controlUrl,
    getIdToken: getCurrentFirebaseIdToken,
  });
};

const configuredSourceVersionReader = (): SourceUploadSourceVersionReader | null => {
  const controlUrl = import.meta.env.VITE_BOOK_SOURCE_CONTROL_WORKER_URL?.trim();
  if (!controlUrl) return null;
  const client = createSourceUploadClient({
    baseUrl: controlUrl,
    getIdToken: getCurrentFirebaseIdToken,
  });
  return { listSourceVersions: client.listSourceVersions };
};

const configuredAssemblyMigrationClient = (): BookAssemblyMigrationClient | null => {
  const baseUrl = import.meta.env.VITE_BOOK_ASSEMBLY_WORKER_URL?.trim();
  if (!baseUrl) return null;
  return createBookAssemblyClient({ baseUrl, getIdToken: getCurrentFirebaseIdToken });
};

const configuredAssemblyPreviewClient = (): BookAssemblyPreviewClient | null => {
  const baseUrl = import.meta.env.VITE_BOOK_ASSEMBLY_WORKER_URL?.trim();
  if (!baseUrl) return null;
  return createBookAssemblyPreviewClient({ baseUrl, getIdToken: getCurrentFirebaseIdToken });
};

const configuredActivityAuthoring = (bookId: string): ActivityAuthoringService | null => {
  const baseUrl = import.meta.env.VITE_BOOK_ACTIVITY_AUTHORING_WORKER_URL?.trim()
    || import.meta.env.VITE_BOOK_ASSEMBLY_WORKER_URL?.trim();
  if (!baseUrl) return null;
  return createActivityAuthoringService(
    createActivityAuthoringRepository(
      createActivityAuthoringTransport({ baseUrl, getIdToken: getCurrentFirebaseIdToken }),
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
  assemblySourceVersionReader,
  assemblyInitialCandidate,
  assemblyBookRevision = book.bookRevision ?? 0,
  assemblySourceSetRevision = book.sourceSetRevision ?? 0,
  sourceSetAttachmentClient,
  assemblyPreviewDocuments,
  assemblyPreviewGetIdToken,
  assemblyCandidateRuntimePreview,
  assemblyPreviewClient,
  onDirtyChange,
}: BookMode2EditorShellProps) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const source = presentation === 'modal' ? 'book_editor_modal' : 'book_editor_route';
  const uploadEnabled = uploadPresentationEnabled ?? isBookActivityRolloutGateEnabled(
    BOOK_ACTIVITY_ROLLOUT_GATES.upload,
  );
  const resolvedUploadWorkflow = useMemo(
    () => uploadWorkflow === undefined ? configuredUploadWorkflow() : uploadWorkflow,
    [uploadWorkflow],
  );
  const resolvedUploadWorkflowForSource = useMemo(() => {
    if (uploadWorkflow !== undefined) {
      return (_sourceKey: string) => uploadWorkflow;
    }
    const configuredBySource = new Map<string, SourceUploadBrowserWorkflow | null>();
    return (sourceKey: string) => {
      if (!configuredBySource.has(sourceKey)) {
        configuredBySource.set(sourceKey, configuredUploadWorkflow(sourceKey));
      }
      return configuredBySource.get(sourceKey) ?? null;
    };
  }, [uploadWorkflow]);
  const resolvedAssemblyRepository = useMemo(
    () => assemblyRepository === undefined ? configuredAssemblyRepository() : assemblyRepository,
    [assemblyRepository],
  );
  const resolvedSourceSetAttachmentClient = useMemo(
    () => sourceSetAttachmentClient === undefined
      ? configuredSourceSetAttachmentClient()
      : sourceSetAttachmentClient,
    [sourceSetAttachmentClient],
  );
  const resolvedAssemblySourceVersionReader = useMemo(
    () => assemblySourceVersionReader === undefined
      ? configuredSourceVersionReader()
      : assemblySourceVersionReader,
    [assemblySourceVersionReader],
  );
  const [loadedAssemblySourceVersions, setLoadedAssemblySourceVersions] = useState<readonly TrustedBookSourceVersionProjection[]>([]);
  useEffect(() => {
    if (assemblySourceVersions.length > 0 || !resolvedAssemblySourceVersionReader || access === 'public-readonly') {
      setLoadedAssemblySourceVersions([]);
      return;
    }
    let active = true;
    setLoadedAssemblySourceVersions([]);
    void resolvedAssemblySourceVersionReader.listSourceVersions(book.bookId)
      .then((sources) => {
        if (active) setLoadedAssemblySourceVersions(sources);
      })
      .catch(() => {
        // Source projections are trusted readiness input. A read failure must
        // leave the flow locked rather than turn metadata into upload proof.
        if (active) setLoadedAssemblySourceVersions([]);
      });
    return () => {
      active = false;
    };
  }, [access, assemblySourceVersions.length, book.bookId, resolvedAssemblySourceVersionReader]);
  const resolvedAssemblySourceVersions = assemblySourceVersions.length > 0
    ? assemblySourceVersions
    : loadedAssemblySourceVersions;
  const resolvedAssemblyMigrationClient = useMemo(
    () => assemblyMigrationClient === undefined ? configuredAssemblyMigrationClient() : assemblyMigrationClient,
    [assemblyMigrationClient],
  );
  const resolvedActivityAuthoring = useMemo(
    () => activityAuthoring === undefined ? configuredActivityAuthoring(book.bookId) : activityAuthoring,
    [activityAuthoring, book.bookId],
  );
  const resolvedAssemblyPreviewClient = useMemo(
    () => assemblyPreviewClient === undefined ? configuredAssemblyPreviewClient() : assemblyPreviewClient,
    [assemblyPreviewClient],
  );
  const uploadUnavailableMessage = !uploadEnabled
    ? 'Upload authorization is disabled by the current presentation gate.'
    : !resolvedUploadWorkflow
      ? 'Upload authorization is unavailable because the source Worker configuration is missing.'
      : undefined;

  useEffect(() => {
    trackAction('openBook', { bookId: book.bookId, source });
  }, [book.bookId, source, trackAction]);

  const trackInspectionAction = (
    action: BookSourceInspectionAction,
    metadata?: Record<string, unknown>,
  ) => trackAction(action, { bookId: book.bookId, source, ...metadata });
  const trackUploadAction = (
    action: BookSourceUploadAction,
    metadata?: Record<string, unknown>,
  ) => trackAction(action, { bookId: book.bookId, source, ...metadata });

  return (
    <main className="book-mode2-editor-shell" data-book-mode="pdf" data-presentation={presentation} data-flow="pdf-book-flow">
      <BookPdfFlowWorkspace
        access={access}
        bookId={book.bookId}
        title={book.title}
        presentation={presentation}
        uploadWorkflow={resolvedUploadWorkflow}
        uploadWorkflowForSource={resolvedUploadWorkflowForSource}
        uploadEnabled={uploadEnabled}
        uploadUnavailableMessage={uploadUnavailableMessage}
        assemblyRepository={resolvedAssemblyRepository}
        assemblyMigrationClient={resolvedAssemblyMigrationClient}
        activityAuthoring={resolvedActivityAuthoring}
        assemblySourceVersions={resolvedAssemblySourceVersions}
        assemblyInitialSourceSet={book.sourceSet ?? null}
        assemblyInitialCandidate={assemblyInitialCandidate}
        assemblyBookRevision={assemblyBookRevision}
        assemblySourceSetRevision={assemblySourceSetRevision}
        sourceSetAttachmentClient={resolvedSourceSetAttachmentClient}
        assemblyPreviewDocuments={assemblyPreviewDocuments}
        assemblyPreviewGetIdToken={assemblyPreviewGetIdToken}
        assemblyCandidateRuntimePreview={assemblyCandidateRuntimePreview}
        assemblyPreviewClient={resolvedAssemblyPreviewClient}
        onDirtyChange={onDirtyChange}
        onInspectionAction={trackInspectionAction}
        onUploadAction={trackUploadAction}
        onTrackAction={(action, metadata) => trackAction(action, { source, ...metadata })}
      />
    </main>
  );
};

export default BookMode2EditorShell;
