import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { buildRoute } from '../../../constants/routes';
import { useReadingV2StudioAutosave } from '../../../hooks/reading-v2/useReadingV2StudioAutosave';
import {
  loadReadingV2PublishedRevisionSource,
  type ReadingV2PublishedRevisionSource,
} from '../../../services/reading-v2/readingV2StudioFirebaseHydration.service';
import { ReadingV2UpdateReferencesModal } from '../master/ReadingV2UpdateReferencesModal';
import {
  ReadingV2StudioShell,
  type ReadingV2ReturnContext,
  type ReadingV2StudioActionHandler,
  type ReadingV2StudioMode,
} from './ReadingV2StudioShell';
import {
  previewReadingV2StudioDraft,
  publishReadingV2StudioDraft,
  duplicateReadingV2StudioDraft,
  extractReadingV2StudioTaskGroupDraft,
  reloadLatestReadingV2StudioDraft,
  openReadingV2StudioDraft,
  saveReadingV2StudioDraft,
  studioContextFromDraft,
  type ReadingV2StudioWorkflowContext,
} from '../../../services/reading-v2/readingV2StudioWorkflow.service';
import { createFirebaseReadingV2ReferenceUpdateRepository } from '../../../services/reading-v2/readingV2ReferenceUpdateFirebaseRepository.service';
import type { ReadingV2ReferenceUpdateSummary } from '../../../services/reading-v2/readingV2ReferenceUpdate.service';

type StudioOpeningState = {
  readonly session?: object;
  readonly status: 'idle' | 'loading' | 'loaded' | 'error';
  readonly context?: ReadingV2StudioWorkflowContext;
  readonly source?: ReadingV2PublishedRevisionSource;
  readonly message?: string;
};

type ReferenceUpdateModalState = {
  readonly status: 'closed' | 'open' | 'updating';
  readonly passageTitle: string;
  readonly summary: ReadingV2ReferenceUpdateSummary;
};

export interface ReadingV2StudioModalAdapterProps {
  readonly mode: ReadingV2StudioMode;
  readonly materialId?: string;
  readonly draftId?: string;
  readonly ownerId?: string;
  readonly returnContext?: ReadingV2ReturnContext;
  readonly onAction?: ReadingV2StudioActionHandler;
  readonly onClose?: () => void;
}

export function ReadingV2StudioModalAdapter({
  mode,
  materialId,
  draftId,
  ownerId,
  returnContext = { surface: 'teacher-lobby', label: 'Teacher Lobby modal' },
  onAction,
  onClose,
}: ReadingV2StudioModalAdapterProps) {
  const { user, profile, loading: authLoading } = useAuth();
  const actor = useMemo(() => user && profile && profile.role !== 'student'
    ? { uid: user.uid, role: profile.role }
    : undefined, [profile?.role, user?.uid]);
  const openingSession = useMemo(() => ({
    draftId: draftId ?? `studio-${crypto.randomUUID()}`,
    promise: undefined as Promise<{
      context: ReadingV2StudioWorkflowContext;
      source?: ReadingV2PublishedRevisionSource;
    }> | undefined,
  }), [actor, draftId, materialId, mode, ownerId]);
  const activeSessionRef = useRef(openingSession);
  activeSessionRef.current = openingSession;
  const [saveSession, setSaveSession] = useState(0);
  const contextLabel = materialId
    ? `${returnContext.label}: Material ${materialId}`
    : draftId
      ? `${returnContext.label}: Draft ${draftId}`
      : returnContext.label;
  const referenceUpdateRepository = useMemo(() => createFirebaseReadingV2ReferenceUpdateRepository(), []);
  const [openingState, setOpeningState] = useState<StudioOpeningState>({
    status: 'idle',
  });
  const [referenceUpdateModal, setReferenceUpdateModal] = useState<ReferenceUpdateModalState | null>(null);

  useEffect(() => {
    setReferenceUpdateModal(null);
    if (authLoading) return undefined;
    if (!actor) {
      setOpeningState({ session: openingSession, status: 'error', message: 'Sign in with a teacher account to open this draft.' });
      return undefined;
    }

    let cancelled = false;
    setOpeningState({ session: openingSession, status: 'loading' });
    openingSession.promise ??= Promise.resolve().then(async () => {
      const source = mode === 'revise-published' && materialId
        ? await loadReadingV2PublishedRevisionSource(materialId, { ownerId: actor.uid, role: actor.role })
        : undefined;
      if (source && source.status !== 'loaded') {
        throw new Error(source.message ?? 'The published snapshot could not be hydrated.');
      }
      const context = await openReadingV2StudioDraft({
        actor,
        mode,
        materialId,
        draftId: openingSession.draftId,
        ownerId,
        sourceSnapshot: source?.snapshot,
        sourceMetadata: source?.metadata,
        sourceAuthoringMetadata: source?.authoringMetadata,
        sourceAuthoringContext: source?.authoringContext,
        sourceWorkflowOrigin: source?.workflowOrigin,
      });
      return { context, source };
    });
    void openingSession.promise
      .then(({ context, source }) => {
        if (!cancelled) {
          setOpeningState({ session: openingSession, status: 'loaded', context, source });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setOpeningState({
            session: openingSession,
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to open Reading V2 draft.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [actor, authLoading, materialId, mode, openingSession, ownerId]);

  const studioContext = openingState.session === openingSession ? openingState.context : undefined;
  const [autosaveRevision, setAutosaveRevision] = useState<number | undefined>();
  const saveStudioSnapshot = async (snapshot: Parameters<typeof saveReadingV2StudioDraft>[0]) => {
    if (!actor) throw new Error('Sign in with a teacher account to save this draft.');
    const result = await saveReadingV2StudioDraft(snapshot, actor);
    return { revision: result.draft.revision };
  };
  const { queueAutosave, saveNow, flush, saveState, saveError } = useReadingV2StudioAutosave({
    autosaveKey: `${actor?.uid}:${studioContext?.draftId}:${saveSession}`,
    enabled: Boolean(actor && studioContext?.status === 'ready'),
    saveDraft: saveStudioSnapshot,
    onResult: (result) => {
      onAction?.('autosaveDraft', {
        mode,
        host: 'modal',
        draftId: result.draftId,
        materialId,
        outcome: result.status,
        revision: result.revision,
      });
      if (result.revision !== undefined) {
        setAutosaveRevision(result.revision);
      }
    },
  });

  useEffect(() => {
    setAutosaveRevision(studioContext?.revision);
  }, [studioContext?.draftId, studioContext?.revision]);

  if (authLoading || openingState.session !== openingSession || openingState.status === 'idle' || openingState.status === 'loading') {
    return (
      <section role="dialog" aria-busy="true" aria-modal="true" aria-label="Reading V2 Studio modal adapter">
        <p>{mode === 'revise-published' ? 'Loading published Reading V2 material...' : 'Opening saved Reading V2 draft...'}</p>
      </section>
    );
  }

  if (!actor || !studioContext || studioContext.status !== 'ready') {
    return (
      <section role="alertdialog" aria-modal="true" aria-label="Reading V2 Studio modal adapter">
        <p>Unable to open this Reading V2 draft for editing.</p>
        <p>{openingState.message ?? studioContext?.message ?? 'The saved draft could not be loaded.'}</p>
      </section>
    );
  }

  return (
    <>
      <section role="dialog" aria-modal="true" aria-label="Reading V2 Studio modal adapter">
        <a
          href={buildRoute('TEACHER_READING_V2_DRAFT', { draftId: studioContext.draftId })}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onAction?.('resumeDraft', { mode, host: 'modal', draftId: studioContext.draftId, outcome: 'open-saved-draft' })}
        >Open saved draft</a>
        <ReadingV2StudioShell
          mode={studioContext.workflowOrigin?.mode ?? mode}
          host="modal"
          returnContext={{ ...returnContext, label: contextLabel }}
          operationalState="ready"
          importCandidate={studioContext.importCandidate}
          resolvedSourceEvidence={studioContext.resolvedSourceEvidence}
          actorId={actor.uid}
          document={studioContext.document}
          metadata={studioContext.metadata}
          draftId={studioContext.draftId}
          materialId={studioContext.materialId}
          revision={autosaveRevision ?? studioContext.revision}
          authoringContext={studioContext.authoringContext}
          workflowOrigin={studioContext.workflowOrigin}
          saveState={saveState}
          saveError={saveError}
          onAction={onAction}
          onSaveDraft={saveNow}
          onDraftChange={queueAutosave}
          onReloadLatest={async (snapshot) => {
            const result = await reloadLatestReadingV2StudioDraft(snapshot, actor);
            if (activeSessionRef.current !== openingSession) throw new Error('The draft session changed before reload completed.');
            const context = studioContextFromDraft(result.draft, mode);
            setOpeningState((current) => ({ ...current, context }));
            setSaveSession((current) => current + 1);
            return {
              document: context.document,
              metadata: context.metadata,
              authoringContext: context.authoringContext,
              workflowOrigin: context.workflowOrigin,
              revision: context.revision,
            };
          }}
          onDuplicateDraft={async (snapshot) => {
            const result = await duplicateReadingV2StudioDraft(snapshot, actor);
            if (activeSessionRef.current !== openingSession) throw new Error('The draft session changed before the copy was acknowledged.');
            const context = studioContextFromDraft(result.draft, 'duplicate-material');
            setOpeningState((current) => ({ ...current, context }));
            setSaveSession((current) => current + 1);
            return {
              draftId: context.draftId,
              materialId: context.materialId,
              document: context.document,
              metadata: context.metadata,
              authoringContext: context.authoringContext,
              workflowOrigin: context.workflowOrigin,
              revision: context.revision,
            };
          }}
          onExtract={async (snapshot, request) => {
            const result = await extractReadingV2StudioTaskGroupDraft(snapshot, request, actor);
            if (activeSessionRef.current !== openingSession) throw new Error('The draft session changed before extraction was acknowledged.');
            const context = studioContextFromDraft(result.draft, 'extract-task-group-material');
            setOpeningState((current) => ({ ...current, context }));
            setSaveSession((current) => current + 1);
            return {
              draftId: context.draftId,
              materialId: context.materialId,
              document: context.document,
              metadata: context.metadata,
              authoringContext: context.authoringContext,
              workflowOrigin: context.workflowOrigin,
              revision: context.revision,
            };
          }}
          onPreview={previewReadingV2StudioDraft}
          onPublish={async (snapshot) => {
            const saved = await saveNow(snapshot);
            const result = await publishReadingV2StudioDraft({ ...snapshot, revision: saved.revision }, actor);
            if (activeSessionRef.current !== openingSession) throw new Error('The draft session changed before publication completed.');
            const previousSnapshotVersionId = studioContext.workflowOrigin?.sourceSnapshotVersionId;
            const isSinglePassageRevision =
              studioContext.workflowOrigin?.mode === 'revise-published' &&
              studioContext.metadata.materialKind === 'reading-passage' &&
              Boolean(previousSnapshotVersionId) &&
              previousSnapshotVersionId !== result.snapshotVersionId;

            if (isSinglePassageRevision && previousSnapshotVersionId) {
              try {
                const summary = await referenceUpdateRepository.discoverTargets({
                  ownerId: snapshot.metadata.ownerId,
                  passageMaterialId: result.materialId,
                  previousSnapshotVersionId,
                  nextSnapshotVersionId: result.snapshotVersionId,
                });

                onAction?.('reading_v2_single_passage_version_published', {
                  mode,
                  host: 'modal',
                  materialId: result.materialId,
                  previousSnapshotVersionId,
                  nextSnapshotVersionId: result.snapshotVersionId,
                  updateTargetCount: summary.targets.length,
                });

                if (summary.targets.length > 0) {
                  setReferenceUpdateModal({
                    status: 'open',
                    passageTitle: snapshot.document.title,
                    summary,
                  });
                  onAction?.('reading_v2_update_references_opened', {
                    mode,
                    host: 'modal',
                    materialId: result.materialId,
                    updateTargetCount: summary.targets.length,
                  });
                }
              } catch (error) {
                if (import.meta.env.DEV && !import.meta.env.VITEST) {
                  console.warn('[Diag][ReadingV2StudioModal] reference_update_discovery_failed_after_publish', {
                    message: error instanceof Error ? error.message : String(error),
                    materialId: result.materialId,
                    previousSnapshotVersionId,
                    nextSnapshotVersionId: result.snapshotVersionId,
                  });
                }
                onAction?.('reading_v2_update_references_skipped', {
                  mode,
                  host: 'modal',
                  materialId: result.materialId,
                  outcome: 'discovery-failed-after-publish',
                });
              }
            }

            return {
              snapshotVersionId: result.snapshotVersionId,
              firebaseCommitStatus: result.firebaseCommitStatus,
              firebaseCommitPath: result.firebaseCommitPath,
              firebaseOperationCount: result.firebaseOperationCount,
              duplicateWarnings: result.duplicateWarnings,
              generatedReadingPassages: result.generatedReadingPassages,
            };
          }}
          onExit={() => { void flush().then(onClose).catch(() => undefined); }}
        />
      </section>
      {referenceUpdateModal ? (
        <ReadingV2UpdateReferencesModal
          open={referenceUpdateModal.status !== 'closed'}
          passageTitle={referenceUpdateModal.passageTitle}
          summary={referenceUpdateModal.summary}
          onClose={() => setReferenceUpdateModal(null)}
          onSkipAll={() => {
            onAction?.('reading_v2_update_references_skipped', {
              mode,
              host: 'modal',
              materialId: referenceUpdateModal.summary.passageMaterialId,
              updateTargetCount: referenceUpdateModal.summary.targets.length,
            });
            setReferenceUpdateModal(null);
          }}
          onUpdateSelected={async (selectedTargetIds) => {
            setReferenceUpdateModal((current) => current ? { ...current, status: 'updating' } : current);
            const result = await referenceUpdateRepository.applySelected({
              summary: referenceUpdateModal.summary,
              selectedTargetIds,
            });
            onAction?.('reading_v2_update_references_submitted', {
              mode,
              host: 'modal',
              materialId: referenceUpdateModal.summary.passageMaterialId,
              selectedTargetCount: selectedTargetIds.length,
              updatedMasterCount: result.updatedMasters.length,
              updatedBookCount: result.updatedBooks.length,
              skippedTargetCount: result.skippedTargetIds.length,
            });
            setReferenceUpdateModal(null);
          }}
        />
      ) : null}
    </>
  );
}
