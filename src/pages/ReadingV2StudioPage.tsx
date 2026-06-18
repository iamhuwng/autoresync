import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { FEATURE_IDS } from '../config/featureRegistry';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { useNavigation } from '../hooks/useNavigation';
import { useReadingV2StudioAutosave } from '../hooks/reading-v2/useReadingV2StudioAutosave';
import { AssessmentStatusState } from '../features/assessment/shared/components/AssessmentStatusState';
import {
  ReadingV2StudioShell,
  type ReadingV2ReturnContext,
  type ReadingV2StudioMode,
} from '../components/reading-v2/studio/ReadingV2StudioShell';
import { ReadingV2UpdateReferencesModal } from '../components/reading-v2/master/ReadingV2UpdateReferencesModal';
import { resolveMaterialTestTypeIdsFromLegacyTestType } from '../services/materialCatalog/materialTestTypeMapping.service';
import type { ReadingV2ImportCandidate } from '../services/reading-v2/readingV2ImportNormalization.service';
import {
  previewReadingV2StudioDraft,
  publishReadingV2StudioDraft,
  compareLatestReadingV2StudioDraft,
  duplicateReadingV2StudioDraft,
  extractReadingV2StudioTaskGroupDraft,
  reloadLatestReadingV2StudioDraft,
  resolveReadingV2StudioWorkflowContext,
  saveReadingV2StudioDraft,
  type ReadingV2StudioWorkflowMetadata,
} from '../services/reading-v2/readingV2StudioWorkflow.service';
import {
  loadReadingV2PublishedRevisionSource,
  type ReadingV2PublishedRevisionSource,
} from '../services/reading-v2/readingV2StudioFirebaseHydration.service';
import { createFirebaseReadingV2ReferenceUpdateRepository } from '../services/reading-v2/readingV2ReferenceUpdateFirebaseRepository.service';
import type { ReadingV2ReferenceUpdateSummary } from '../services/reading-v2/readingV2ReferenceUpdate.service';

type RevisionHydrationState = {
  readonly key?: string;
  readonly status: 'idle' | 'loading' | 'loaded' | 'error';
  readonly source?: ReadingV2PublishedRevisionSource;
  readonly message?: string;
};

type ReadingV2StudioRouteState = {
  readonly entryPoint?: string;
  readonly initialMetadata?: Partial<ReadingV2StudioWorkflowMetadata>;
  readonly initialImportCandidate?: ReadingV2ImportCandidate;
  readonly startMode?: ReadingV2StudioMode;
  readonly testType?: string;
};

type ReferenceUpdateModalState = {
  readonly status: 'closed' | 'open' | 'updating';
  readonly passageTitle: string;
  readonly summary: ReadingV2ReferenceUpdateSummary;
};

const compactActionMetadata = (
  metadata: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined));

const resolveStudioMode = (pathname: string): ReadingV2StudioMode => {
  if (pathname.endsWith('/import')) {
    return 'create-from-import';
  }

  if (pathname.includes('/drafts/')) {
    return 'resume-draft';
  }

  if (pathname.includes('/materials/') && pathname.endsWith('/revise')) {
    return 'revise-published';
  }

  return 'create-blank';
};

const mergeRouteTestTypeMetadata = (
  metadata: Partial<ReadingV2StudioWorkflowMetadata> | undefined,
  testType: string | undefined,
): Partial<ReadingV2StudioWorkflowMetadata> | undefined => {
  const routeTestTypeIds = resolveMaterialTestTypeIdsFromLegacyTestType(testType);

  if (routeTestTypeIds.length === 0) {
    return metadata;
  }

  return {
    ...metadata,
    primaryTestTypeId: metadata?.primaryTestTypeId ?? routeTestTypeIds[0],
    testTypeIds: metadata?.testTypeIds && metadata.testTypeIds.length > 0
      ? metadata.testTypeIds
      : routeTestTypeIds,
  };
};

export default function ReadingV2StudioPage() {
  const location = useLocation();
  const params = useParams();
  const { navigateTo } = useNavigation('teacher');
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const referenceUpdateRepository = useMemo(() => createFirebaseReadingV2ReferenceUpdateRepository(), []);
  const routeState = useMemo<ReadingV2StudioRouteState>(
    () => (location.state && typeof location.state === 'object'
      ? location.state as ReadingV2StudioRouteState
      : {}),
    [location.state],
  );
  const pathMode = resolveStudioMode(location.pathname);
  const mode = routeState.startMode === 'create-from-auto' ? 'create-from-auto' : pathMode;
  const revisionMaterialId = mode === 'revise-published' ? params.materialId : undefined;
  const routeInitialMetadata = useMemo(
    () => mergeRouteTestTypeMetadata(routeState.initialMetadata, routeState.testType),
    [routeState.initialMetadata, routeState.testType],
  );
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
        draftId: params.draftId,
        materialId: params.materialId,
        ownerId: routeInitialMetadata?.ownerId,
        initialMetadata: routeInitialMetadata,
        initialImportCandidate: routeState.initialImportCandidate,
        sourceSnapshot: revisionSource?.snapshot,
        sourceMetadata: revisionSource?.metadata,
        deferPublishedRevisionFallback: isRevisionHydrating,
      }),
    [
      isRevisionHydrating,
      mode,
      params.draftId,
      params.materialId,
      routeInitialMetadata,
      revisionSource?.metadata,
      revisionSource?.snapshot,
      routeState.initialImportCandidate,
    ],
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
      trackAction('autosaveDraft', {
        mode,
        draftId: result.draftId,
        outcome: result.status,
        revisionToken: result.revisionToken,
      });
      if (result.revisionToken) {
        setAutosaveRevisionToken(result.revisionToken);
      }
    },
  });
  const returnContext: ReadingV2ReturnContext = useMemo(
    () => ({
      surface: 'direct-studio-route',
      label: params.draftId
        ? `Draft ${params.draftId}`
        : params.materialId
          ? `Material ${params.materialId}`
          : 'Direct Studio route',
    }),
    [params.draftId, params.materialId],
  );

  useEffect(() => {
    setAutosaveRevisionToken(studioContext.revisionToken);
  }, [studioContext.draftId, studioContext.revisionToken]);

  useEffect(() => {
    if (isRevisionHydrating || revisionHydrationError) {
      return;
    }

    const actionName =
      mode === 'create-from-auto'
        ? 'startAutoImportMaterial'
        : mode === 'create-from-import'
        ? 'startImportMaterial'
        : mode === 'resume-draft'
          ? 'resumeDraft'
          : mode === 'revise-published'
            ? 'revisePublishedMaterial'
            : 'startBlankMaterial';

    trackAction('openStudio', compactActionMetadata({
      mode,
      draftId: params.draftId,
      materialId: params.materialId,
      entryPoint: routeState.entryPoint,
      startMode: routeState.startMode,
    }));
    trackAction(actionName, compactActionMetadata({
      mode,
      draftId: params.draftId,
      materialId: params.materialId,
      entryPoint: routeState.entryPoint,
    }));
  }, [
    isRevisionHydrating,
    mode,
    params.draftId,
    params.materialId,
    revisionHydrationError,
    routeState.entryPoint,
    routeState.startMode,
    trackAction,
  ]);

  useEffect(() => {
    if (isRevisionHydrating || revisionHydrationError || studioContext.status !== 'invalid') {
      return;
    }

    trackAction('studioImportCandidateRejected', compactActionMetadata({
      mode,
      draftId: params.draftId,
      materialId: params.materialId,
      entryPoint: routeState.entryPoint,
      outcome: 'blocked',
      issueCode: 'invalid-import-candidate',
    }));
  }, [
    isRevisionHydrating,
    mode,
    params.draftId,
    params.materialId,
    revisionHydrationError,
    routeState.entryPoint,
    studioContext.status,
    trackAction,
  ]);

  if (isRevisionHydrating) {
    return (
      <AssessmentStatusState
        as="main"
        variant="loading"
        title="READING-V2"
        message={<p>Loading published Reading V2 material...</p>}
      />
    );
  }

  if (revisionHydrationError) {
    return (
      <AssessmentStatusState
        as="main"
        variant="error"
        title="READING-V2"
        message={(
          <>
            <p>Unable to open this published Reading V2 material for editing.</p>
            <p>{revisionHydration.message ?? 'The published snapshot could not be hydrated.'}</p>
          </>
        )}
      />
    );
  }

  if (studioContext.status === 'invalid') {
    return (
      <AssessmentStatusState
        as="main"
        variant="error"
        title="READING-V2"
        message={(
          <>
            <p>Unable to open this Reading V2 Studio draft.</p>
            <p>{studioContext.message ?? 'Auto import needs review before Studio can open.'}</p>
          </>
        )}
      />
    );
  }

  return (
    <>
      <ReadingV2StudioShell
      mode={mode}
        returnContext={returnContext}
        operationalState={studioContext.status === 'missing' ? 'error' : 'ready'}
        importCandidate={studioContext.importCandidate}
        document={studioContext.document}
      metadata={studioContext.metadata}
      draftId={studioContext.draftId}
      materialId={studioContext.materialId}
      revisionToken={autosaveRevisionToken}
      onAction={(actionName, metadata) => trackAction(actionName, metadata ? { ...metadata } : undefined)}
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

            trackAction('reading_v2_single_passage_version_published', {
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
              trackAction('reading_v2_update_references_opened', {
                materialId: result.materialId,
                updateTargetCount: summary.targets.length,
              });
            }
          } catch (error) {
            if (import.meta.env.DEV && !import.meta.env.VITEST) {
              console.warn('[Diag][ReadingV2Studio] reference_update_discovery_failed_after_publish', {
                message: error instanceof Error ? error.message : String(error),
                materialId: result.materialId,
                previousSnapshotVersionId: revisionSource.snapshot.snapshotVersionId,
                nextSnapshotVersionId: result.snapshotVersionId,
              });
            }
            trackAction('reading_v2_update_references_skipped', {
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
      onPublishSuccess={mode === 'revise-published' ? undefined : (snapshot, result) => {
        trackAction('exitStudio', compactActionMetadata({
          mode,
          draftId: snapshot.draftId,
          materialId: snapshot.materialId,
          snapshotVersionId: result.snapshotVersionId,
          reason: 'reading_v2_studio_publish_success',
        }));
        navigateTo('LOBBY', undefined, {
          reason: 'reading_v2_studio_publish_success',
          replace: true,
        });
      }}
      onExit={() => {
        navigateTo('LOBBY', undefined, { reason: 'reading_v2_studio_exit' });
      }}
    />
      {referenceUpdateModal ? (
        <ReadingV2UpdateReferencesModal
          open={referenceUpdateModal.status !== 'closed'}
          passageTitle={referenceUpdateModal.passageTitle}
          summary={referenceUpdateModal.summary}
          onClose={() => setReferenceUpdateModal(null)}
          onSkipAll={() => {
            trackAction('reading_v2_update_references_skipped', {
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
            trackAction('reading_v2_update_references_submitted', {
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
