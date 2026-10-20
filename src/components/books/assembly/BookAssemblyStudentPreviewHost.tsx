import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FEATURE_IDS } from '../../../config/featureRegistry';
import { useFeatureTracking } from '../../../hooks/useFeatureTracking';
import { bookActivityRendererRegistry, type ActivityRendererRegistry } from '../../../services/book-activity/runtime/activityRendererRegistry';
import {
  previewInputFingerprint,
  type CandidateUnitPreviewProjection,
} from '../../../services/book-assembly/unitPreview.service';
import { createBookTeacherAssemblyDocumentRoute } from '../../../services/book-delivery/bookTeacherAssemblyDocument.types';
import { BookPdfViewerHost } from '../../book-runtime/BookPdfViewerHost';
import {
  BookRuntimeShell,
  type BookRuntimeAction,
  type BookRuntimeViewerRenderInput,
} from '../../book-runtime/BookRuntimeShell';

export interface BookAssemblyStudentPreviewHostProps {
  readonly bookTitle: string;
  readonly preview: CandidateUnitPreviewProjection;
  readonly workerOrigin?: string;
  readonly getIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  readonly registry?: ActivityRendererRegistry;
  readonly onExit?: () => void;
}

type ReadyCandidatePreview = CandidateUnitPreviewProjection & {
  readonly runtime: NonNullable<CandidateUnitPreviewProjection['runtime']>;
};

const BookAssemblyStudentPreviewReady = ({
  bookTitle,
  preview,
  workerOrigin = import.meta.env.VITE_BOOK_ASSEMBLY_WORKER_URL?.trim(),
  getIdToken,
  registry = bookActivityRendererRegistry,
  onExit,
}: Omit<BookAssemblyStudentPreviewHostProps, 'preview'> & { readonly preview: ReadyCandidatePreview }) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.bookAuthoring);
  const identity = previewInputFingerprint(preview);
  const [responseState, setResponseState] = useState<{
    readonly identity: string;
    readonly responses: Readonly<Record<string, unknown>>;
  }>({ identity, responses: {} });
  const responses = responseState.identity === identity ? responseState.responses : {};
  const trustedWorkerOrigins = useMemo(
    () => workerOrigin ? [workerOrigin] : undefined,
    [workerOrigin],
  );
  const request = preview.runtime.documentRequests.length === 1
    ? preview.runtime.documentRequests[0]
    : null;
  const fullPdfSource = preview.runtime.sourceSet.strategy === 'full_pdf'
    && preview.runtime.sourceSet.sources.length === 1
    ? preview.runtime.sourceSet.sources[0]
    : null;
  const sourceRequest = request && 'sourceKey' in request ? request : null;
  const combinedRequest = request && !('sourceKey' in request) ? request : null;
  const validFullPdfRequest = sourceRequest && fullPdfSource
    && sourceRequest.sourceKey === fullPdfSource.sourceKey
    && sourceRequest.sourceVersionId === fullPdfSource.sourceVersionId;
  const validCombinedRequest = combinedRequest && preview.runtime.sourceSet.strategy === 'component_pdfs';
  const route = useMemo(() => !workerOrigin || (!validFullPdfRequest && !validCombinedRequest) ? null
    : createBookTeacherAssemblyDocumentRoute({
      workerOrigin,
      bookId: preview.bookId,
      unitKey: preview.unitKey,
      candidateId: preview.candidateId,
      candidateRevision: preview.candidateRevision,
      sourceSetRevision: preview.sourceSetRevision,
      bookRevision: preview.bookRevision,
      ...(validFullPdfRequest ? {
        sourceKey: sourceRequest.sourceKey,
        sourceVersionId: sourceRequest.sourceVersionId,
      } : {
        expectedByteLength: combinedRequest!.expectedByteLength,
        expectedEtag: combinedRequest!.expectedEtag,
      }),
    }), [preview.bookId, preview.bookRevision, preview.candidateId, preview.candidateRevision,
      preview.sourceSetRevision, preview.unitKey, validFullPdfRequest, validCombinedRequest,
      sourceRequest, combinedRequest, workerOrigin]);

  useEffect(() => {
    setResponseState({ identity, responses: {} });
  }, [identity]);

  const viewer = useMemo(() => ({
    title: `${bookTitle} — ${preview.unitKey}`,
    status: route
      ? { state: 'ready' as const, message: 'Authorized candidate PDF is ready.' }
      : { state: 'error' as const, message: 'The current candidate PDF authorization is unavailable.' },
    render: (input: BookRuntimeViewerRenderInput): ReactNode => {
      if (!route) {
        return <p role="alert">The current candidate PDF is unavailable. Refresh the Book and preview again.</p>;
      }
      return (
        <BookPdfViewerHost
          getIdToken={getIdToken}
          initialPage={input.combinedPhysicalPage}
          allowedPages={input.allowedPages}
          onPageChange={input.onPageChange}
          onPageReady={input.onPageReady}
          route={route}
          title={validFullPdfRequest ? `${bookTitle} — Book document` : `${bookTitle} — combined student document`}
          trustedWorkerOrigins={trustedWorkerOrigins}
        />
      );
    },
  }), [bookTitle, getIdToken, preview.unitKey, route, trustedWorkerOrigins, validFullPdfRequest]);

  const trackRuntimeAction = (action: BookRuntimeAction, metadata?: Record<string, unknown>) => {
    const shared = {
      bookId: preview.bookId,
      candidateId: preview.candidateId,
      candidateRevision: preview.candidateRevision,
      action,
      ...metadata,
    };
    if (action === 'bookRuntimeResponseChanged') {
      trackAction('teacher_materials_book_assembly_candidate_preview_response_changed', shared);
      return;
    }
    if (action === 'bookRuntimeActivitySelected' || action === 'bookRuntimeActivityNavigated') {
      trackAction('teacher_materials_book_assembly_candidate_preview_activity_selected', shared);
      return;
    }
    trackAction('teacher_materials_book_assembly_candidate_preview_activity_selected', shared);
  };

  return (
    <section className="book-assembly-unit-preview" aria-labelledby="book-assembly-student-preview-title">
      <div className="book-assembly-workspace__section-heading">
        <div>
          <h2 id="book-assembly-student-preview-title">Student Book preview</h2>
          <p role="status">This is the learner Book interface. Answers stay in memory and clear on exit, reload, or candidate/source revision change.</p>
        </div>
        {onExit ? (
          <button
            type="button"
            onClick={() => {
              setResponseState({ identity, responses: {} });
              trackAction('teacher_materials_book_assembly_candidate_preview_closed', {
                bookId: preview.bookId,
                candidateId: preview.candidateId,
              });
              onExit();
            }}
          >
            Exit preview
          </button>
        ) : null}
      </div>
      <BookRuntimeShell
        activities={preview.activities.map((activity) => ({
          activityId: activity.activityKey,
          label: activity.projection.title,
          projection: activity.projection,
        }))}
        deliveryProjection={preview.runtime}
        display={{
          bookTitle,
          unitTitle: preview.unitKey,
          contextLabel: 'Teacher preview · unpublished',
        }}
        onAction={trackRuntimeAction}
        onResponseChange={(interactionId, response) => {
          setResponseState((prior) => prior.identity === identity
            ? { identity, responses: { ...prior.responses, [interactionId]: response } }
            : prior);
        }}
        registry={registry}
        responseMode="editable"
        responses={responses}
        viewer={viewer}
      />
    </section>
  );
};

export const BookAssemblyStudentPreviewHost = (props: BookAssemblyStudentPreviewHostProps) => {
  if (!props.preview.runtime) {
    return (
      <section className="book-assembly-unit-preview" role="alert">
        Student Book preview data is stale. Refresh preview to load the current Book interface.
      </section>
    );
  }
  return <BookAssemblyStudentPreviewReady {...props} preview={props.preview as ReadyCandidatePreview} />;
};

export default BookAssemblyStudentPreviewHost;
