import { useEffect, useMemo, useState } from 'react';
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
  compareLatestReadingV2StudioDraft,
  duplicateReadingV2StudioDraft,
  extractReadingV2StudioTaskGroupDraft,
  reloadLatestReadingV2StudioDraft,
  resolveReadingV2StudioWorkflowContext,
  saveReadingV2StudioDraft,
} from '../../../services/reading-v2/readingV2StudioWorkflow.service';
import { createFirebaseReadingV2ReferenceUpdateRepository } from '../../../services/reading-v2/readingV2ReferenceUpdateFirebaseRepository.service';
import type { ReadingV2ReferenceUpdateSummary } from '../../../services/reading-v2/readingV2ReferenceUpdate.service';

type RevisionHydrationState = {
  readonly key?: string;
  readonly status: 'idle' | 'loading' | 'loaded' | 'error';
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
  const contextLabel = materialId
    ? `${returnContext.label}: Material ${materialId}`
    : draftId
      ? `${returnContext.label}: Draft ${draftId}`
      : returnContext.label;
  const revisionMaterialId = mode === 'revise-published' ? materialId : undefined;
  const referenceUpdateRepository = useMemo(() => createFirebaseReadingV2ReferenceUpdateRepository(), []);
  const [revisionHydration, setRevisionHydration] = useState<RevisionHydrationState>({
    status: 'idle',
  });
  const [referenceUpdateModal, setReferenceUpdateModal] = useState<ReferenceUpdateModalState | null>(null);

  useEffect(() => {
    if (!revisionMaterialId) {
      setRevisionHydration({ status: 'idle' });
      return undefined;
    }

    let cancelled = false;
    setRevisionHydration({ key: revisionMaterialId, status: 'loading' });

    void loadReadingV2PublishedRevisionSource(revisionMaterialId)
      .then((source) => {
        if (cancelled) {
          return;
        }

        setRevisionHydration({
          key: revisionMaterialId,
          status: source.status === 'loaded' ? 'loaded' : 'error',
          source,
          message: source.message,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setRevisionHydration({
          key: revisionMaterialId,
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to load published Reading V2 material.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [revisionMaterialId]);

  const isRevisionHydrating =
    Boolean(revisionMaterialId) &&
    (revisionHydration.key !== revisionMaterialId ||
      revisionHydration.status === 'idle' ||
      revisionHydration.status === 'loading');
  const revisionHydrationError =
    Boolean(revisionMaterialId) &&
    revisionHydration.key === revisionMaterialId &&
    revisionHydration.status === 'error';
  const revisionSource = revisionHydration.source?.status === 'loaded'
    ? revisionHydration.source
    : undefined;
  const studioContext = useMemo(
    () =>
      resolveReadingV2StudioWorkflowContext({
        mode,
        materialId,
        draftId,
        ownerId,
        sourceSnapshot: revisionSource?.snapshot,
        sourceMetadata: revisionSource?.metadata,
        deferPublishedRevisionFallback: isRevisionHydrating,
      }),
    [draftId, isRevisionHydrating, materialId, mode, ownerId, revisionSource?.metadata, revisionSource?.snapshot],
  );
  const [autosaveRevisionToken, setAutosaveRevisionToken] = useState(studioContext.revisionToken);
  const saveStudioSnapshot = (snapshot: Parameters<typeof saveReadingV2StudioDraft>[0]) => {
    const result = saveReadingV2StudioDraft(snapshot);
    return { revisionToken: result.draft.revisionToken };
  };
  const { queueAutosave } = useReadingV2StudioAutosave({
    autosaveKey: studioContext.draftId,
    enabled: studioContext.status === 'ready',
    saveDraft: saveStudioSnapshot,
    onResult: (result) => {
      onAction?.('autosaveDraft', {
        mode,
        host: 'modal',
        draftId: result.draftId,
        materialId,
        outcome: result.status,
        revisionToken: result.revisionToken,
      });
      if (result.revisionToken) {
        setAutosaveRevisionToken(result.revisionToken);
      }
    },
  });

  useEffect(() => {
    setAutosaveRevisionToken(studioContext.revisionToken);
  }, [studioContext.draftId, studioContext.revisionToken]);

  if (isRevisionHydrating) {
    return (
      <section role="dialog" aria-busy="true" aria-modal="true" aria-label="Reading V2 Studio modal adapter">
        <p>Loading published Reading V2 material...</p>
      </section>
    );
  }

  if (revisionHydrationError) {
    return (
      <section role="alertdialog" aria-modal="true" aria-label="Reading V2 Studio modal adapter">
        <p>Unable to open this published Reading V2 material for editing.</p>
        <p>{revisionHydration.message ?? 'The published snapshot could not be hydrated.'}</p>
      </section>
    );
  }

  return (
    <>
      <section role="dialog" aria-modal="true" aria-label="Reading V2 Studio modal adapter">
        <ReadingV2StudioShell
          mode={mode}
          host="modal"
          returnContext={{ ...returnContext, label: contextLabel }}
          operationalState={studioContext.status === 'missing' ? 'error' : 'ready'}
          importCandidate={studioContext.importCandidate}
          document={studioContext.document}
          metadata={studioContext.metadata}
          draftId={studioContext.draftId}
          materialId={studioContext.materialId}
          revisionToken={autosaveRevisionToken}
          onAction={onAction}
          onSaveDraft={(snapshot) => {
            const result = saveStudioSnapshot(snapshot);
            setAutosaveRevisionToken(result.revisionToken);
            return result;
          }}
          onDraftChange={queueAutosave}
          onReloadLatest={(snapshot) => {
            const result = reloadLatestReadingV2StudioDraft(snapshot);
            setAutosaveRevisionToken(result.draft.revisionToken);
            return {
              document: result.draft.document,
              revisionToken: result.draft.revisionToken,
            };
          }}
          onDuplicateDraft={(snapshot) => {
            const result = duplicateReadingV2StudioDraft(snapshot);
            setAutosaveRevisionToken(result.draft.revisionToken);
            return {
              draftId: result.draft.draftId,
              materialId: result.draft.materialId,
              revisionToken: result.draft.revisionToken,
            };
          }}
          onCompareDiff={compareLatestReadingV2StudioDraft}
          onExtract={(snapshot, request) => {
            const result = extractReadingV2StudioTaskGroupDraft(snapshot, request);
            setAutosaveRevisionToken(result.draft.revisionToken);
            return {
              draftId: result.draft.draftId,
              materialId: result.draft.materialId,
              document: result.draft.document,
              revisionToken: result.draft.revisionToken,
            };
          }}
          onPreview={previewReadingV2StudioDraft}
          onPublish={async (snapshot) => {
            const result = await publishReadingV2StudioDraft(snapshot);
            const isSinglePassageRevision =
              mode === 'revise-published' &&
              revisionSource?.metadata?.materialKind === 'reading-passage' &&
              Boolean(revisionSource.snapshot) &&
              revisionSource.snapshot?.snapshotVersionId !== result.snapshotVersionId;

            if (isSinglePassageRevision && revisionSource.snapshot) {
              try {
                const summary = await referenceUpdateRepository.discoverTargets({
                  ownerId: snapshot.metadata.ownerId,
                  passageMaterialId: result.materialId,
                  previousSnapshotVersionId: revisionSource.snapshot.snapshotVersionId,
                  nextSnapshotVersionId: result.snapshotVersionId,
                });

                onAction?.('reading_v2_single_passage_version_published', {
                  mode,
                  host: 'modal',
                  materialId: result.materialId,
                  previousSnapshotVersionId: revisionSource.snapshot.snapshotVersionId,
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
                    previousSnapshotVersionId: revisionSource.snapshot.snapshotVersionId,
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
            };
          }}
          onExit={onClose}
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
