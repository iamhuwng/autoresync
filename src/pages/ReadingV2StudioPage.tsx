import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { FEATURE_IDS } from '../config/featureRegistry';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { useNavigation } from '../hooks/useNavigation';
import { useReadingV2StudioAutosave } from '../hooks/reading-v2/useReadingV2StudioAutosave';
import { AssessmentStatusState } from '../features/assessment/shared/components/AssessmentStatusState';
import { ReadingV2StudioShell, type ReadingV2StudioMode } from '../components/reading-v2/studio/ReadingV2StudioShell';
import { ReadingV2UpdateReferencesModal } from '../components/reading-v2/master/ReadingV2UpdateReferencesModal';
import { toast } from '../components/modern/ToastNotification';
import { useAppLifecycle } from '../core/platform/hooks/useAppLifecycle';
import { resolveMaterialTestTypeIdsFromLegacyTestType } from '../services/materialCatalog/materialTestTypeMapping.service';
import type { ReadingV2ImportCandidate } from '../services/reading-v2/readingV2ImportNormalization.service';
import {
  previewReadingV2StudioDraft, publishReadingV2StudioDraft, duplicateReadingV2StudioDraft,
  extractReadingV2StudioTaskGroupDraft, reloadLatestReadingV2StudioDraft, openReadingV2StudioDraft,
  saveReadingV2StudioDraft, studioContextFromDraft,
  type ReadingV2StudioWorkflowMetadata, type ReadingV2StudioWorkflowContext, type ReadingV2StudioActor,
} from '../services/reading-v2/readingV2StudioWorkflow.service';
import { loadReadingV2PublishedRevisionSource } from '../services/reading-v2/readingV2StudioFirebaseHydration.service';
import { createFirebaseReadingV2ReferenceUpdateRepository } from '../services/reading-v2/readingV2ReferenceUpdateFirebaseRepository.service';
import type { ReadingV2ReferenceUpdateSummary } from '../services/reading-v2/readingV2ReferenceUpdate.service';

type RouteState = {
  readonly entryPoint?: string;
  readonly initialMetadata?: Partial<ReadingV2StudioWorkflowMetadata>;
  readonly initialImportCandidate?: ReadingV2ImportCandidate;
  readonly startMode?: ReadingV2StudioMode;
  readonly testType?: string;
};

type OpeningState = {
  readonly key: string;
  readonly context?: ReadingV2StudioWorkflowContext;
  readonly error?: string;
};

const resolveStudioMode = (pathname: string): ReadingV2StudioMode =>
  pathname.includes('/drafts/') ? 'resume-draft'
    : pathname.includes('/materials/') && pathname.endsWith('/revise') ? 'revise-published'
      : pathname.endsWith('/import') ? 'create-from-import' : 'create-blank';

export default function ReadingV2StudioPage() {
  const location = useLocation();
  const params = useParams();
  const { user, profile, loading: authLoading } = useAuth();
  const { navigateTo } = useNavigation('teacher');
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const actor = useMemo<ReadingV2StudioActor | null>(() => user && ['teacher', 'super_admin'].includes(profile?.role)
    ? { uid: user.uid, role: profile.role } : null, [user?.uid, profile?.role]);
  const routeState = useMemo<RouteState>(() => location.state && typeof location.state === 'object'
    ? location.state as RouteState : {}, [location.state]);
  const pathMode = resolveStudioMode(location.pathname);
  const routeMode = pathMode === 'create-blank' || pathMode === 'create-from-import'
    ? routeState.startMode === 'create-from-auto' ? 'create-from-auto' : pathMode : pathMode;
  const openingKey = `${actor?.uid}:${actor?.role}:${location.key}:${location.pathname}`;
  const openingKeyRef = useRef(openingKey);
  openingKeyRef.current = openingKey;
  const openingPromisesRef = useRef(new Map<string, Promise<ReadingV2StudioWorkflowContext>>());
  const [opening, setOpening] = useState<OpeningState>({ key: '' });
  const [saveEpoch, setSaveEpoch] = useState(0);
  const [revision, setRevision] = useState(0);
  const [referenceSummary, setReferenceSummary] = useState<ReadingV2ReferenceUpdateSummary | null>(null);
  const [updatingReferences, setUpdatingReferences] = useState(false);
  const referenceRepository = useMemo(() => createFirebaseReadingV2ReferenceUpdateRepository(), []);

  useEffect(() => {
    if (authLoading || !actor) return;
    let active = true;
    const open = async () => {
      const source = routeMode === 'revise-published' && params.materialId
        ? await loadReadingV2PublishedRevisionSource(params.materialId, {
          ownerId: actor.uid, role: actor.role,
          snapshotVersionId: new URLSearchParams(location.search).get('version') ?? undefined,
        }) : undefined;
      if (source && source.status !== 'loaded') throw new Error(source.message ?? 'The published revision could not be loaded.');
      const testTypeIds = resolveMaterialTestTypeIdsFromLegacyTestType(routeState.testType);
      const context = await openReadingV2StudioDraft({
        mode: routeMode,
        draftId: params.draftId,
        materialId: params.materialId,
        actor,
        initialMetadata: {
          ...routeState.initialMetadata,
          ownerId: actor.uid,
          primaryTestTypeId: routeState.initialMetadata?.primaryTestTypeId ?? testTypeIds[0],
          testTypeIds: routeState.initialMetadata?.testTypeIds ?? testTypeIds,
        },
        initialImportCandidate: routeState.initialImportCandidate,
        sourceSnapshot: source?.snapshot,
        sourceMetadata: source?.metadata,
        sourceAuthoringMetadata: source?.authoringMetadata,
        sourceAuthoringContext: source?.authoringContext,
        sourceWorkflowOrigin: source?.workflowOrigin,
      });
      return context;
    };
    const openingPromise = openingPromisesRef.current.get(openingKey) ?? open();
    openingPromisesRef.current.set(openingKey, openingPromise);
    const applyOpening = async () => {
      const context = await openingPromise;
      if (!active || openingKeyRef.current !== openingKey) return;
      setOpening({ key: openingKey, context });
      setRevision(context.revision);
      trackAction('openStudio', { mode: context.mode, draftId: context.draftId, materialId: context.materialId });
      if (context.status === 'ready' && pathMode !== 'resume-draft') {
        navigateTo('TEACHER_READING_V2_DRAFT', { draftId: context.draftId }, {
          replace: true, reason: 'reading_v2_draft_acknowledged',
        });
      }
    };
    void applyOpening().catch((error) => {
      if (active && openingKeyRef.current === openingKey) {
        setOpening({ key: openingKey, error: error instanceof Error ? error.message : 'Could not open this draft.' });
      }
    });
    return () => { active = false; };
  }, [actor, authLoading, openingKey, params.draftId, params.materialId, pathMode, routeMode, routeState, navigateTo, trackAction, location.search]);

  const context = opening.key === openingKey ? opening.context : undefined;
  const { queueAutosave, saveNow, flush, saveState, saveError } = useReadingV2StudioAutosave({
    autosaveKey: `${actor?.uid}:${context?.draftId}:${saveEpoch}`,
    enabled: Boolean(actor && context?.status === 'ready'),
    saveDraft: async (snapshot) => {
      if (!actor) throw new Error('Sign in as a teacher to save this draft.');
      const result = await saveReadingV2StudioDraft(snapshot, actor);
      return { revision: result.draft.revision };
    },
    onResult: (result) => {
      trackAction('autosaveDraft', { draftId: result.draftId, outcome: result.status, revision: result.revision });
      if (result.revision !== undefined) setRevision(result.revision);
    },
  });
  useAppLifecycle({
    onBeforeUnload: () => saveState !== 'saved' ? 'Your draft still has unsaved changes.' : undefined,
    onBackground: () => { void flush().catch(() => undefined); },
  });

  const replaceDraft = (result: Awaited<ReturnType<typeof duplicateReadingV2StudioDraft>>) => {
    const { draft, resolvedSourceEvidence } = result;
    const next = { ...studioContextFromDraft(draft), resolvedSourceEvidence };
    setOpening({ key: openingKey, context: next });
    setRevision(draft.revision);
    setSaveEpoch((epoch) => epoch + 1);
    if (draft.draftId !== params.draftId) {
      navigateTo('TEACHER_READING_V2_DRAFT', { draftId: draft.draftId }, {
        replace: true, reason: 'reading_v2_destination_draft_acknowledged',
      });
    }
    return { ...next, materialId: draft.materialId };
  };

  const error = !authLoading && !actor ? 'Sign in as a teacher to open Reading V2 Studio.'
    : opening.key === openingKey ? opening.error ?? (context?.status !== 'ready' ? context?.message : undefined) : undefined;
  return <>
    {error || !context || !actor ? <AssessmentStatusState as="main" variant={error ? 'error' : 'loading'}
      title="Reading V2 Studio" message={<p>{error ?? 'Opening saved draft…'}</p>} /> : <ReadingV2StudioShell
      key={`${actor.uid}:${context.draftId}`}
      mode={context.mode}
      returnContext={{ surface: 'direct-studio-route', label: 'Saved Reading V2 draft' }}
      operationalState="ready"
      importCandidate={context.importCandidate}
      document={context.document}
      metadata={context.metadata}
      authoringContext={context.authoringContext}
      actorId={actor.uid}
      resolvedSourceEvidence={context.resolvedSourceEvidence}
      workflowOrigin={context.workflowOrigin}
      draftId={context.draftId}
      materialId={context.materialId}
      revision={revision}
      saveState={saveState}
      saveError={saveError}
      onAction={(action, metadata) => trackAction(action, metadata ? { ...metadata } : undefined)}
      onSaveDraft={saveNow}
      onDraftChange={queueAutosave}
      onReloadLatest={async (snapshot) => {
        const key = openingKey;
        const result = await reloadLatestReadingV2StudioDraft(snapshot, actor);
        if (openingKeyRef.current !== key) throw new Error('The draft session changed.');
        return replaceDraft(result);
      }}
      onDuplicateDraft={async (snapshot) => {
        const key = openingKey;
        const result = await duplicateReadingV2StudioDraft(snapshot, actor);
        if (openingKeyRef.current !== key) throw new Error('The draft session changed.');
        return replaceDraft(result);
      }}
      onExtract={async (snapshot, request) => {
        const key = openingKey;
        const result = await extractReadingV2StudioTaskGroupDraft(snapshot, request, actor);
        if (openingKeyRef.current !== key) throw new Error('The draft session changed.');
        return replaceDraft(result);
      }}
      onPreview={previewReadingV2StudioDraft}
      onPublish={async (snapshot) => {
        const key = openingKey;
        const saved = await saveNow(snapshot);
        const selected = { ...snapshot, revision: saved.revision };
        const result = await publishReadingV2StudioDraft(selected, actor);
        if (openingKeyRef.current !== key) throw new Error('The publication finished in an earlier draft session.');
        const nextOrigin = {
          ...(snapshot.workflowOrigin ?? { mode: routeMode }),
          sourceSnapshotVersionId: result.snapshotVersionId,
          publicationBase: result.publicationBase,
        };
        let draftRevision = saved.revision;
        try {
          const persisted = await saveReadingV2StudioDraft({ ...selected, workflowOrigin: nextOrigin }, actor);
          draftRevision = persisted.draft.revision;
          setRevision(persisted.draft.revision);
          setSaveEpoch((epoch) => epoch + 1);
        } catch (error) {
          toast.warning('Published successfully, but the draft revision marker could not be saved. Reopen the published revision before editing again.');
          trackAction('publish', { outcome: 'published_draft_marker_save_failed', message: error instanceof Error ? error.message : 'unknown' });
        }
        const sourceVersion = snapshot.workflowOrigin?.sourceSnapshotVersionId;
        if (snapshot.workflowOrigin?.mode === 'revise-published' && snapshot.metadata.materialKind === 'reading-passage' && sourceVersion) {
          try {
            const summary = await referenceRepository.discoverTargets({
              ownerId: snapshot.metadata.ownerId, passageMaterialId: result.materialId,
              previousSnapshotVersionId: sourceVersion, nextSnapshotVersionId: result.snapshotVersionId,
            });
            if (openingKeyRef.current === key && summary.targets.length) setReferenceSummary(summary);
          } catch {
            trackAction('reading_v2_update_references_skipped', { materialId: result.materialId, outcome: 'discovery-failed-after-publish' });
          }
        }
        return { ...result, draftRevision };
      }}
      onPublishSuccess={context.workflowOrigin.mode === 'revise-published' ? undefined : () => {
        navigateTo('LOBBY', undefined, { replace: true, reason: 'reading_v2_studio_publish_success' });
      }}
      onExit={async () => {
        const key = openingKey;
        await flush();
        if (openingKeyRef.current !== key) return;
        navigateTo('LOBBY', undefined, { reason: 'reading_v2_studio_exit' });
      }}
    />}
    {referenceSummary ? <ReadingV2UpdateReferencesModal open passageTitle={context?.metadata.title ?? ''}
      summary={referenceSummary}
      onClose={() => setReferenceSummary(null)}
      onSkipAll={() => { trackAction('reading_v2_update_references_skipped'); setReferenceSummary(null); }}
      onUpdateSelected={async (selectedTargetIds) => {
        if (updatingReferences) return;
        setUpdatingReferences(true);
        try {
          const result = await referenceRepository.applySelected({ summary: referenceSummary, selectedTargetIds });
          trackAction('reading_v2_update_references_submitted', { selectedTargetCount: selectedTargetIds.length,
            updatedMasterCount: result.updatedMasters.length, updatedBookCount: result.updatedBooks.length });
          setReferenceSummary(null);
        } finally { setUpdatingReferences(false); }
      }} /> : null}
  </>;
}
