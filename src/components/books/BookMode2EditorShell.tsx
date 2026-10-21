import { getAuth } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import type { MaterialBookMetadata } from '../../types/materialCatalog.types';
import { activeComponentPdfActivation } from '../../services/book-assembly/componentPdfActivation.service';
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
import {
  BookAssemblyClientError,
  createBookAssemblyClient,
  type BookAssemblyMigrationClient,
  type ComponentPdfActivationClient,
} from '../../services/book-assembly/assemblyClient.browser';
import { createBookAssemblyPreviewClient, type BookAssemblyCurrentPublication, type BookAssemblyPreviewClient } from '../../services/book-assembly/assemblyPublication.client';
import type { LoadedCurrentAssemblyDraft, UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
import { FULL_PDF_PRIMARY_UNIT_KEY, type TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import type { BookTeacherAssemblyDocumentProjection } from '../../services/book-delivery/bookTeacherAssemblyDocument.types';
import type { CandidateUnitPreviewProjection } from '../../services/book-assembly/unitPreview.service';
import BookPdfFlowWorkspace, { type BookCurrentPublicationStatus, type BookPdfEditorSection } from './BookPdfFlowWorkspace';
import type { BookSourceInspectionAction } from './BookSourceInspectionPanel';
import type { BookSourceUploadAction } from './BookSourceUploadPanel';
import type { ActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import { createActivityAuthoringRepository } from '../../services/book-activity/activityAuthoring.repository';
import { createActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import { createActivityAuthoringTransport } from '../../services/book-activity/activityStorage.service';
import type { BookEditorAccess } from './useBookEditorModeResolution';
import { HomeworkCreateModal, type BookHomeworkRecoveryState } from '../homework/HomeworkCreateModal';
import './BookMode2EditorShell.css';

export interface BookMode2EditorShellProps {
  readonly access: BookEditorAccess;
  readonly book: MaterialBookMetadata;
  readonly presentation: 'modal' | 'page-compat';
  readonly experience: 'guided-creation' | 'focused-editing';
  readonly editingSection?: BookPdfEditorSection;
  readonly onOpenPlan?: () => void;
  readonly uploadWorkflow?: SourceUploadBrowserWorkflow | null;
  readonly uploadWorkflowForSource?: (sourceKey: string) => SourceUploadBrowserWorkflow | null;
  readonly assemblyRepository?: UnitAssemblyRepository | null;
  readonly assemblyMigrationClient?: BookAssemblyMigrationClient | null;
  readonly componentPdfActivationClient?: ComponentPdfActivationClient | null;
  readonly componentStudentDocumentSourceVersionId?: string | null;
  readonly activityAuthoring?: ActivityAuthoringService | null;
  readonly assemblySourceVersions?: readonly TrustedBookSourceVersionProjection[];
  readonly assemblySourceVersionReader?: SourceUploadSourceVersionReader | null;
  readonly assemblyInitialCandidate?: BookAssemblyCandidateRecord | null;
  readonly assemblyInitialSavedActivityKeysByUnit?: Readonly<Record<string, readonly string[]>>;
  readonly assemblyInitialPublication?: BookAssemblyCurrentPublication | null;
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

const configuredComponentPdfActivationClient = (): ComponentPdfActivationClient | null => {
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
  experience,
  editingSection,
  onOpenPlan,
  uploadWorkflow,
  uploadWorkflowForSource,
  assemblyRepository,
  assemblyMigrationClient,
  componentPdfActivationClient,
  componentStudentDocumentSourceVersionId,
  activityAuthoring,
  assemblySourceVersions = [],
  assemblySourceVersionReader,
  assemblyInitialCandidate,
  assemblyInitialSavedActivityKeysByUnit,
  assemblyInitialPublication,
  assemblyBookRevision = book.bookRevision ?? 0,
  assemblySourceSetRevision = book.sourceSetRevision ?? 0,
  sourceSetAttachmentClient,
  assemblyPreviewDocuments,
  assemblyPreviewGetIdToken,
  assemblyCandidateRuntimePreview,
  assemblyPreviewClient,
  onDirtyChange,
}: BookMode2EditorShellProps) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.bookAuthoring);
  const source = presentation === 'modal' ? 'book_editor_modal' : 'book_editor_route';
  const resolvedUploadWorkflow = useMemo(
    () => uploadWorkflow === undefined ? configuredUploadWorkflow() : uploadWorkflow,
    [uploadWorkflow],
  );
  const resolvedUploadWorkflowForSource = useMemo(() => {
    if (uploadWorkflowForSource) return uploadWorkflowForSource;
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
  }, [uploadWorkflow, uploadWorkflowForSource]);
  const resolvedAssemblyRepository = useMemo(
    () => assemblyRepository === undefined ? configuredAssemblyRepository() : assemblyRepository,
    [assemblyRepository],
  );
  const sourceSetSignature = JSON.stringify(book.sourceSet ?? null);
  const [loadedAssemblyPublication, setLoadedAssemblyPublication] = useState<{
    readonly bookId: string;
    readonly status: BookCurrentPublicationStatus;
    readonly publication: BookAssemblyCurrentPublication | null;
  }>({
    bookId: book.bookId,
    status: assemblyInitialPublication !== undefined ? 'loaded' : 'loading',
    publication: assemblyInitialPublication ?? null,
  });
  const fullPdfCandidateUnitKeys = (assemblyInitialPublication
    ?? (loadedAssemblyPublication.bookId === book.bookId ? loadedAssemblyPublication.publication : null))
    ?.units.map((unit) => unit.unitKey) ?? [FULL_PDF_PRIMARY_UNIT_KEY];
  const fullPdfCandidateUnitSignature = JSON.stringify(fullPdfCandidateUnitKeys);
  const candidateOwnerKeys = useMemo(() => book.sourceSet?.sourceStrategy === 'full_pdf'
    ? fullPdfCandidateUnitKeys
    : [...new Set(
      (book.sourceSet?.sources ?? [])
        .map((source) => source.ownerNodeKey)
        .filter((ownerNodeKey): ownerNodeKey is string => typeof ownerNodeKey === 'string' && ownerNodeKey.length > 0),
    )], [sourceSetSignature, fullPdfCandidateUnitSignature]);
  const firstComponentDraft = book.bookMode === 'pdf' && book.bookRevision === 0
    && book.sourceSetRevision === 0 && !book.sourceSet && !book.setupActivations;
  const [loadedAssemblyCandidate, setLoadedAssemblyCandidate] = useState<{
    readonly bookId: string;
    readonly status: 'loading' | 'loaded' | 'error';
    readonly candidate: BookAssemblyCandidateRecord | null;
    readonly savedActivityKeysByUnit: Readonly<Record<string, readonly string[]>>;
  }>({
    bookId: book.bookId,
    status: assemblyInitialCandidate !== undefined || access === 'public-readonly'
      || (candidateOwnerKeys.length === 0 && !firstComponentDraft) ? 'loaded' : 'loading',
    candidate: assemblyInitialCandidate ?? null,
    savedActivityKeysByUnit: {},
  });
  useEffect(() => {
    if (assemblyInitialCandidate !== undefined
      || access === 'public-readonly'
      || (!firstComponentDraft && (!resolvedAssemblyRepository?.loadCurrent || candidateOwnerKeys.length === 0))) {
      setLoadedAssemblyCandidate((current) => current.bookId === book.bookId && current.status === 'loaded'
        ? current
        : { bookId: book.bookId, status: 'loaded', candidate: null, savedActivityKeysByUnit: {} });
      return;
    }
    let active = true;
    setLoadedAssemblyCandidate({ bookId: book.bookId, status: 'loading', candidate: null, savedActivityKeysByUnit: {} });
    if (firstComponentDraft) {
      void (resolvedAssemblyRepository?.discoverDrafts?.(book.bookId)
        ?? Promise.reject(new Error('draft_discovery_unavailable')))
        .then((candidates) => {
          if (!active) return;
          const latest = [...candidates].sort((left, right) => right.candidate.updatedAt.localeCompare(left.candidate.updatedAt))[0] ?? null;
          setLoadedAssemblyCandidate({ bookId: book.bookId, status: 'loaded', candidate: latest?.candidate ?? null,
            savedActivityKeysByUnit: latest?.savedActivityKeysByUnit ?? {} });
        })
        .catch(() => {
          if (active) setLoadedAssemblyCandidate({ bookId: book.bookId, status: 'error', candidate: null, savedActivityKeysByUnit: {} });
        });
      return () => { active = false; };
    }
    void Promise.all(candidateOwnerKeys.map(async (unitKey) => {
      try {
        return await resolvedAssemblyRepository!.loadCurrent!(book.bookId, unitKey);
      } catch (error) {
        if (error instanceof BookAssemblyClientError && error.status === 409) return null;
        throw error;
      }
    }))
      .then((candidates) => {
        if (!active) return;
        const draft = candidates
          .filter((value): value is LoadedCurrentAssemblyDraft => value !== null)
          .sort((left, right) => right.candidate.updatedAt.localeCompare(left.candidate.updatedAt))[0] ?? null;
        setLoadedAssemblyCandidate({
          bookId: book.bookId,
          status: 'loaded',
          candidate: draft?.candidate ?? null,
          savedActivityKeysByUnit: Object.assign({}, ...candidates.map((value) => value?.savedActivityKeysByUnit ?? {})),
        });
      })
      .catch(() => {
        if (!active) return;
        setLoadedAssemblyCandidate({
          bookId: book.bookId,
          status: 'error',
          candidate: null,
          savedActivityKeysByUnit: {},
        });
      });
    return () => {
      active = false;
    };
  }, [access, assemblyInitialCandidate, book.bookId, candidateOwnerKeys, firstComponentDraft, resolvedAssemblyRepository]);
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
  const resolvedComponentPdfActivationClient = useMemo(
    () => componentPdfActivationClient === undefined
      ? configuredComponentPdfActivationClient()
      : componentPdfActivationClient,
    [componentPdfActivationClient],
  );
  const resolvedActivityAuthoring = useMemo(
    () => activityAuthoring === undefined ? configuredActivityAuthoring(book.bookId) : activityAuthoring,
    [activityAuthoring, book.bookId],
  );
  const recoveredComponentPdfActivation = useMemo(() => activeComponentPdfActivation(book), [book]);
  const resolvedAssemblyPreviewClient = useMemo(
    () => assemblyPreviewClient === undefined ? configuredAssemblyPreviewClient() : assemblyPreviewClient,
    [assemblyPreviewClient],
  );
  const [publicationLoadAttempt, setPublicationLoadAttempt] = useState(0);
  useEffect(() => {
    if (assemblyInitialPublication !== undefined || access === 'public-readonly') {
      setLoadedAssemblyPublication((current) => current.bookId === book.bookId
        && current.status === 'loaded'
        && current.publication === (assemblyInitialPublication ?? null)
        ? current
        : { bookId: book.bookId, status: 'loaded', publication: assemblyInitialPublication ?? null });
      return;
    }
    if (!resolvedAssemblyPreviewClient?.readCurrentPublication) {
      setLoadedAssemblyPublication({ bookId: book.bookId, status: 'error', publication: null });
      return;
    }
    let active = true;
    setLoadedAssemblyPublication({ bookId: book.bookId, status: 'loading', publication: null });
    void resolvedAssemblyPreviewClient.readCurrentPublication(book.bookId)
      .then((publication) => {
        if (active) setLoadedAssemblyPublication({ bookId: book.bookId, status: 'loaded', publication });
      })
      .catch(() => {
        if (active) setLoadedAssemblyPublication({ bookId: book.bookId, status: 'error', publication: null });
      });
    return () => {
      active = false;
    };
  }, [access, assemblyInitialPublication, book.bookId, publicationLoadAttempt, resolvedAssemblyPreviewClient]);
  const uploadUnavailableMessage = !resolvedUploadWorkflow
    ? 'Upload authorization is unavailable because the source Worker configuration is missing.'
    : undefined;
  const candidateLoading = assemblyInitialCandidate === undefined
    && (candidateOwnerKeys.length > 0 || firstComponentDraft)
    && Boolean(firstComponentDraft ? resolvedAssemblyRepository?.discoverDrafts : resolvedAssemblyRepository?.loadCurrent)
    && loadedAssemblyCandidate.bookId === book.bookId
    && loadedAssemblyCandidate.status === 'loading';
  const resolvedInitialCandidate = assemblyInitialCandidate !== undefined
    ? assemblyInitialCandidate
    : loadedAssemblyCandidate.bookId === book.bookId
      ? loadedAssemblyCandidate.candidate
      : null;
  const resolvedInitialSavedActivityKeysByUnit = assemblyInitialCandidate === undefined
    && loadedAssemblyCandidate.bookId === book.bookId
      ? loadedAssemblyCandidate.savedActivityKeysByUnit
      : {};
  const candidateLoadFailed = assemblyInitialCandidate === undefined
    && loadedAssemblyCandidate.bookId === book.bookId
    && loadedAssemblyCandidate.status === 'error';
  const publicationLoadStatus: BookCurrentPublicationStatus = assemblyInitialPublication !== undefined
    ? 'loaded'
    : loadedAssemblyPublication.bookId === book.bookId
      ? loadedAssemblyPublication.status
      : 'loading';
  const resolvedInitialPublication = publicationLoadStatus === 'loaded'
    && loadedAssemblyPublication.bookId === book.bookId
    ? loadedAssemblyPublication.publication
    : null;
  const retryCurrentPublication = () => {
    setLoadedAssemblyPublication({ bookId: book.bookId, status: 'loading', publication: null });
    setPublicationLoadAttempt((attempt) => attempt + 1);
  };
  const [homeworkHandoffOpen, setHomeworkHandoffOpen] = useState(false);
  const [bookHomeworkRecovery, setBookHomeworkRecovery] = useState<BookHomeworkRecoveryState | null>(null);
  const publishedUnits = resolvedInitialPublication?.units ?? [];
  const [selectedPublishedUnitKey, setSelectedPublishedUnitKey] = useState<string | null>(null);
  useEffect(() => {
    if (publishedUnits.length <= 1) return;
    setSelectedPublishedUnitKey((current) => current && publishedUnits.some((unit) => unit.unitKey === current) ? current : null);
  }, [publishedUnits]);
  const publishedUnit = publishedUnits.length === 1
    ? publishedUnits[0]
    : publishedUnits.find((unit) => unit.unitKey === selectedPublishedUnitKey) ?? publishedUnits[0] ?? null;
  const openHomeworkHandoff = () => {
    if (!publishedUnit) return;
    trackAction('assignBookUnit', { bookId: book.bookId, unitKey: publishedUnit.unitKey, source });
    setHomeworkHandoffOpen(true);
  };
  const updateCurrentPublication = useCallback((publication: BookAssemblyCurrentPublication) => {
    setLoadedAssemblyPublication({ bookId: book.bookId, status: 'loaded', publication });
  }, [book.bookId]);
  const updateBookHomeworkRecovery = useCallback((next: BookHomeworkRecoveryState | null) => {
    if (next
      && (next.bookId !== book.bookId
        || next.command.assignmentId !== next.assignmentId
        || next.command.intent.bookId !== book.bookId)) {
      return;
    }
    setBookHomeworkRecovery(next);
  }, [book.bookId]);

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

  return <>
    <main className="book-mode2-editor-shell" data-book-mode="pdf" data-presentation={presentation} data-flow="pdf-book-flow">
      {experience === 'focused-editing' && editingSection === 'preview' && publishedUnits.length > 0 && <div className="book-mode2-editor-shell__unit-actions">
        {publishedUnits.length > 1 && <><label htmlFor="book-mode2-published-unit">Unit</label>
        <select
          id="book-mode2-published-unit"
          value={publishedUnit?.unitKey ?? ''}
          onChange={(event) => setSelectedPublishedUnitKey(event.currentTarget.value || null)}
        >
          {publishedUnits.map((unit, index) => <option key={unit.unitKey} value={unit.unitKey}>{resolvedInitialCandidate?.manifest?.nodes.find((node) => node.nodeKey === unit.unitKey)?.title || `Unit ${index + 1}`}</option>)}
        </select>
        </>}
        <button type="button" className="pbf-button" onClick={openHomeworkHandoff}>Assign as homework</button>
      </div>}
      {candidateLoading
        ? <p aria-busy="true">Loading saved Book draft...</p>
        : candidateLoadFailed
          ? <p role="alert">The saved Book draft could not be loaded. Close and reopen the editor before making changes.</p>
        : <BookPdfFlowWorkspace
        access={access}
        bookId={book.bookId}
        title={book.title}
        presentation={presentation}
        experience={experience}
        editingSection={editingSection}
        onOpenPlan={onOpenPlan}
        previewUnitKey={publishedUnit?.unitKey}
        onPreviewUnitChange={setSelectedPublishedUnitKey}
        uploadWorkflow={resolvedUploadWorkflow}
        uploadWorkflowForSource={resolvedUploadWorkflowForSource}
        uploadUnavailableMessage={uploadUnavailableMessage}
        assemblyRepository={resolvedAssemblyRepository}
        assemblyMigrationClient={resolvedAssemblyMigrationClient}
        componentPdfActivationClient={resolvedComponentPdfActivationClient}
        componentStudentDocumentSourceVersionId={componentStudentDocumentSourceVersionId}
        componentPdfActivationRecovery={recoveredComponentPdfActivation}
        activityAuthoring={resolvedActivityAuthoring}
        assemblySourceVersions={resolvedAssemblySourceVersions}
        assemblyInitialSourceSet={book.sourceSet ?? null}
        assemblyInitialCandidate={resolvedInitialCandidate}
         assemblyInitialPublication={resolvedInitialPublication}
        assemblyInitialPublicationStatus={publicationLoadStatus}
        assemblyInitialSavedActivityKeysByUnit={assemblyInitialCandidate !== undefined
          ? (assemblyInitialSavedActivityKeysByUnit ?? {})
          : resolvedInitialSavedActivityKeysByUnit}
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
        onHomeworkHandoff={publishedUnit ? openHomeworkHandoff : undefined}
        onRetryCurrentPublication={retryCurrentPublication}
        onCurrentPublicationChange={updateCurrentPublication}
      />}
    </main>
    {homeworkHandoffOpen && publishedUnit && <HomeworkCreateModal
      isOpen={homeworkHandoffOpen}
      onClose={() => setHomeworkHandoffOpen(false)}
      onSuccess={() => setHomeworkHandoffOpen(false)}
      bookHomeworkHandoff={{ bookId: book.bookId, unitKey: publishedUnit.unitKey, bookTitle: book.title }}
      bookHomeworkRecovery={bookHomeworkRecovery}
      onBookHomeworkRecoveryChange={updateBookHomeworkRecovery}
    />}
  </>;
};

export default BookMode2EditorShell;
