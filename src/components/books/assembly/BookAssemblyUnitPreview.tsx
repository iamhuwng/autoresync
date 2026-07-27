import { useEffect, useMemo, useState } from 'react';
import { FEATURE_IDS } from '../../../config/featureRegistry';
import { useFeatureTracking } from '../../../hooks/useFeatureTracking';
import { BookRuntimeFrame } from '../../book-runtime/BookRuntimeFrame';
import { bookActivityRendererRegistry, type ActivityRendererRegistry } from '../../../services/book-activity/runtime/activityRendererRegistry';
import type { CandidateUnitPreviewProjection } from '../../../services/book-assembly/unitPreview.service';

export interface BookAssemblyUnitPreviewProps {
  readonly preview: CandidateUnitPreviewProjection;
  readonly registry?: ActivityRendererRegistry;
  readonly onExit?: () => void;
}

const previewIdentity = (preview: CandidateUnitPreviewProjection): string => [
  preview.candidateId,
  preview.candidateRevision,
  preview.sourceSetRevision,
  preview.unitKey,
  preview.registryVersion,
].join(':');

/** Teacher-only host. It shares renderer/runtime frame, never student shell or persistence. */
export const BookAssemblyUnitPreview = ({
  preview,
  registry = bookActivityRendererRegistry,
  onExit,
}: BookAssemblyUnitPreviewProps) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);
  const identity = previewIdentity(preview);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [responseState, setResponseState] = useState<{
    readonly identity: string;
    readonly responses: Readonly<Record<string, unknown>>;
  }>({ identity, responses: {} });
  const currentIndex = Math.min(Math.max(selectedIndex, 0), Math.max(preview.activities.length - 1, 0));
  const current = preview.activities[currentIndex] ?? null;
  const responses = responseState.identity === identity ? responseState.responses : {};

  useEffect(() => {
    setSelectedIndex(0);
    setResponseState({ identity, responses: {} });
    trackAction('teacher_materials_book_assembly_candidate_preview_opened', {
      bookId: preview.bookId,
      candidateId: preview.candidateId,
      candidateRevision: preview.candidateRevision,
      sourceSetRevision: preview.sourceSetRevision,
      registryVersion: preview.registryVersion,
    });
  }, [identity, preview.bookId, trackAction]);

  const viewModel = useMemo(() => current ? ({
    title: `Candidate preview — ${preview.unitKey}`,
    activity: {
      projection: current.projection,
      context: {
        surface: 'assembly-preview' as const,
        mode: 'editable' as const,
        sourceContext: current.sourceContext,
      },
      responses,
      validationByInteractionId: {},
      onResponseChange: (interactionId: string, response: unknown) => {
        setResponseState((prior) => prior.identity === identity
          ? { identity, responses: { ...prior.responses, [interactionId]: response } }
          : prior);
        trackAction('teacher_materials_book_assembly_candidate_preview_response_changed', {
          bookId: preview.bookId,
          candidateId: preview.candidateId,
          activityKey: current.activityKey,
          interactionId,
        });
      },
    },
    previous: currentIndex > 0 ? {
      label: 'Previous preview activity',
      onActivate: () => {
        setSelectedIndex((index) => Math.max(index - 1, 0));
        trackAction('teacher_materials_book_assembly_candidate_preview_activity_selected', {
          candidateId: preview.candidateId,
          activityKey: preview.activities[currentIndex - 1]?.activityKey,
        });
      },
    } : undefined,
    next: currentIndex + 1 < preview.activities.length ? {
      label: 'Next preview activity',
      onActivate: () => {
        setSelectedIndex((index) => Math.min(index + 1, preview.activities.length - 1));
        trackAction('teacher_materials_book_assembly_candidate_preview_activity_selected', {
          candidateId: preview.candidateId,
          activityKey: preview.activities[currentIndex + 1]?.activityKey,
        });
      },
    } : undefined,
  }) : null, [current, currentIndex, identity, preview, responses, trackAction]);

  return (
    <section className="book-assembly-unit-preview" aria-labelledby="book-assembly-unit-preview-title">
      <div className="book-assembly-workspace__section-heading">
        <div>
          <h2 id="book-assembly-unit-preview-title">Candidate runtime preview</h2>
          <p role="status">Preview answers stay in memory and clear on exit, reload, or candidate/source revision change.</p>
        </div>
        {onExit ? (
          <button
            type="button"
            onClick={() => {
              setResponseState({ identity, responses: {} });
              trackAction('teacher_materials_book_assembly_candidate_preview_closed', {
                candidateId: preview.candidateId,
              });
              onExit();
            }}
          >
            Exit preview
          </button>
        ) : null}
      </div>
      {viewModel ? <BookRuntimeFrame as="section" registry={registry} viewModel={viewModel} /> : <p role="status">No previewable Activities exist in this candidate.</p>}
    </section>
  );
};

export default BookAssemblyUnitPreview;
