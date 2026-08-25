import { useEffect, useMemo, useState } from 'react';
import type { SourceUploadBrowserWorkflow, SourceUploadSelection } from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import type { SourceUploadSafeOperationState } from '../../services/book-source-delivery/sourceUpload.client';
import type { SourceSetAttachmentClient } from '../../services/book-source-delivery/sourceUpload.client';
import type { BookAssemblyMigrationClient } from '../../services/book-assembly/assemblyClient.browser';
import type { BookAssemblyPreviewClient, AssemblyPublicationReceipt } from '../../services/book-assembly/assemblyPublication.client';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type { BookAssemblyCandidateRecord } from '../../services/book-assembly/unitAssembly.types';
import type { SourceStrategyMigrationRemap } from '../../services/book-assembly/sourceStrategyMigration.service';
import type { CandidateUnitPreviewProjection } from '../../services/book-assembly/unitPreview.service';
import type { ActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import type { BookTeacherAssemblyDocumentProjection } from '../../services/book-delivery/bookTeacherAssemblyDocument.types';
import type { SourceSetCandidate, TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import type { BookAssemblyPreviewApprovalReference } from '../../types/bookAssembly.types';
import type { ReactNode } from 'react';
import BookAssemblyWorkspace from './BookAssemblyWorkspace';
import BookSourceInspectionPanel, { type BookSourceInspectionAction } from './BookSourceInspectionPanel';
import BookSourceUploadPanel, { type BookSourceUploadAction } from './BookSourceUploadPanel';
import './BookPdfFlowWorkspace.css';

type PdfFlowMode = 'full' | 'component';
type PdfFlowStep = 1 | 2 | 3 | 4 | 5;
type AssemblyStep = 'mode' | 'outline' | 'pages' | 'review';

interface SourceSlot {
  readonly id: string;
  readonly sourceKey: string;
  readonly label: string;
  readonly selection: SourceUploadSelection | null;
  readonly uploadState: SourceUploadSafeOperationState | null;
}

export interface BookPdfFlowWorkspaceProps {
  readonly access: 'owner' | 'administrator' | 'public-readonly';
  readonly bookId: string;
  readonly title: string;
  readonly presentation: 'modal' | 'page-compat';
  readonly uploadWorkflow: SourceUploadBrowserWorkflow | null;
  readonly uploadWorkflowForSource?: (sourceKey: string) => SourceUploadBrowserWorkflow | null;
  readonly uploadEnabled: boolean;
  readonly uploadUnavailableMessage?: string;
  readonly assemblyRepository?: UnitAssemblyRepository | null;
  readonly assemblyMigrationClient?: BookAssemblyMigrationClient | null;
  readonly activityAuthoring?: ActivityAuthoringService | null;
  readonly assemblySourceVersions: readonly TrustedBookSourceVersionProjection[];
  readonly assemblyInitialCandidate?: BookAssemblyCandidateRecord | null;
  readonly assemblyBookRevision: number;
  readonly assemblySourceSetRevision: number;
  readonly sourceSetAttachmentClient?: SourceSetAttachmentClient | null;
  readonly assemblyPreviewDocuments?: readonly BookTeacherAssemblyDocumentProjection[];
  readonly assemblyPreviewGetIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  readonly assemblyCandidateRuntimePreview?: CandidateUnitPreviewProjection | null;
  readonly assemblyPreviewClient?: BookAssemblyPreviewClient | null;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onInspectionAction?: (action: BookSourceInspectionAction, metadata?: Record<string, unknown>) => void;
  readonly onUploadAction?: (action: BookSourceUploadAction, metadata?: Record<string, unknown>) => void;
  readonly onTrackAction?: (action: string, metadata?: Record<string, unknown>) => void;
}

const FLOW_STEPS = ['Prepare files', 'Build your Book', 'Connect pages', 'Check & preview', 'Publish'] as const;
const ASSEMBLY_STEP_TO_FLOW: Record<AssemblyStep, PdfFlowStep> = {
  mode: 2,
  outline: 2,
  pages: 3,
  review: 4,
};

const slotFor = (mode: PdfFlowMode, index: number): SourceSlot => ({
  id: `${mode}-${index + 1}`,
  sourceKey: mode === 'full' ? 'full' : `component-${index + 1}`,
  label: mode === 'full' ? 'Book PDF' : `PDF ${index + 1}`,
  selection: null,
  uploadState: null,
});

const sourceProjection = (
  slot: SourceSlot,
): TrustedBookSourceVersionProjection | null => {
  const state = slot.uploadState;
  const claim = slot.selection?.claim;
  if (!state || state.phase !== 'verified' || !state.sourceVersionId || !claim) return null;
  return {
    sourceVersionId: state.sourceVersionId,
    bookId: state.bookId,
    physicalPageCount: claim.physicalPageCount,
    verifiedUsable: true,
  };
};

const BookPdfFlowWorkspace = ({
  access,
  bookId,
  title,
  presentation,
  uploadWorkflow,
  uploadWorkflowForSource,
  uploadEnabled,
  uploadUnavailableMessage,
  assemblyRepository,
  assemblyMigrationClient,
  activityAuthoring,
  assemblySourceVersions,
  assemblyInitialCandidate,
  assemblyBookRevision,
  assemblySourceSetRevision,
  sourceSetAttachmentClient,
  assemblyPreviewDocuments,
  assemblyPreviewGetIdToken,
  assemblyCandidateRuntimePreview,
  assemblyPreviewClient,
  onDirtyChange,
  onInspectionAction,
  onUploadAction,
  onTrackAction,
}: BookPdfFlowWorkspaceProps) => {
  const initialStrategy = assemblyInitialCandidate?.manifest?.sourceSet.sourceStrategy;
  const [mode, setMode] = useState<PdfFlowMode | null>(
    initialStrategy === 'component_pdfs' ? 'component' : initialStrategy === 'full_pdf' ? 'full' : null,
  );
  const [step, setStep] = useState<PdfFlowStep>(mode ? 1 : 1);
  const [assemblyStep, setAssemblyStep] = useState<AssemblyStep>(initialStrategy ? 'outline' : 'mode');
  const [slots, setSlots] = useState<SourceSlot[]>(() => {
    const initialCount = initialStrategy === 'component_pdfs'
      ? Math.max(2, assemblyInitialCandidate?.manifest?.sourceSet.sources.length ?? 0)
      : 1;
    return Array.from({ length: initialCount }, (_, index) => slotFor(initialStrategy === 'component_pdfs' ? 'component' : 'full', index));
  });
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<BookAssemblyCandidateRecord | null>(assemblyInitialCandidate ?? null);
  const [previewProjection, setPreviewProjection] = useState<CandidateUnitPreviewProjection | null>(null);
  const [previewApproval, setPreviewApproval] = useState<BookAssemblyPreviewApprovalReference | null>(null);
  const [publication, setPublication] = useState<AssemblyPublicationReceipt | null>(null);
  const [publishRights, setPublishRights] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: '' | 'good' | 'warn' | 'error' }>({ text: '', kind: '' });

  const canEdit = access !== 'public-readonly';
  const selectedMode = mode ?? 'full';
  const visibleSlots = selectedMode === 'full' ? slots.slice(0, 1) : slots;
  const verifiedSlots = visibleSlots.filter((slot) => slot.uploadState?.phase === 'verified');
  const candidateSourceIds = new Set(assemblyInitialCandidate?.manifest?.sourceSet.sources.map((source) => source.sourceVersionId) ?? []);
  const persistedStrategyMatches = assemblyInitialCandidate?.manifest?.sourceSet.sourceStrategy
    === (selectedMode === 'full' ? 'full_pdf' : 'component_pdfs');
  const persistedSourceReady = persistedStrategyMatches
    && (selectedMode === 'full' ? candidateSourceIds.size === 1 : candidateSourceIds.size >= 2)
    && [...candidateSourceIds].every((sourceVersionId) => assemblySourceVersions.some((source) => source.sourceVersionId === sourceVersionId && source.verifiedUsable));
  const sourceReady = selectedMode === 'full'
    ? verifiedSlots.length === 1 || persistedSourceReady
    : (verifiedSlots.length >= 2 && verifiedSlots.length === visibleSlots.length) || persistedSourceReady;
  const candidateManifest = candidate?.manifest;
  const structureReady = Boolean(candidateManifest
    && candidateManifest.nodes.some((node) => node.nodeType !== 'unit')
    && candidateManifest.units.length > 0
    && candidateManifest.units.every((unit) => unit.activitySlots.length > 0));
  const pagesReady = structureReady
    && candidateManifest?.units.every((unit) => unit.activitySlots.every((activity) => activity.pageGroupKeys.length > 0)) === true;
  const unlockedStep = !sourceReady
    ? 1
    : !structureReady
      ? 2
      : !pagesReady
        ? 3
        : candidate?.lifecycle !== 'validated'
          ? 4
          : previewApproval
            ? 5
            : 4;
  const localSources = useMemo(
    () => visibleSlots.map(sourceProjection).filter((source): source is TrustedBookSourceVersionProjection => source !== null),
    [visibleSlots],
  );
  const sourceVersions = useMemo(() => {
    const byId = new Map(assemblySourceVersions.map((source) => [source.sourceVersionId, source]));
    localSources.forEach((source) => byId.set(source.sourceVersionId, source));
    const persistedIdsForMode = assemblyInitialCandidate?.manifest?.sourceSet.sourceStrategy
      === (selectedMode === 'full' ? 'full_pdf' : 'component_pdfs')
      ? candidateSourceIds
      : new Set<string>();
    const relevantIds = new Set([...persistedIdsForMode, ...localSources.map((source) => source.sourceVersionId)]);
    return [...byId.values()].filter((source) => relevantIds.has(source.sourceVersionId));
  }, [assemblyInitialCandidate, assemblySourceVersions, candidateSourceIds, localSources, selectedMode]);

  useEffect(() => {
    onDirtyChange?.(slots.some((slot) => slot.selection !== null || slot.uploadState !== null) || candidate !== null);
  }, [candidate, onDirtyChange, slots]);

  useEffect(() => {
    if (!candidate || !previewApproval) return;
    if (previewApproval.approvedInputFingerprint && previewProjection
      && (previewProjection.candidateId !== candidate.candidateId
        || previewProjection.candidateRevision !== candidate.revision)) {
      setPreviewProjection(null);
      setPreviewApproval(null);
    }
  }, [candidate, previewApproval, previewProjection]);

  const track = (action: string, metadata?: Record<string, unknown>) => {
    onTrackAction?.(action, { bookId, mode, step, ...metadata });
  };

  const chooseMode = (next: PdfFlowMode) => {
    setMode(next);
    setStep(1);
    setAssemblyStep('outline');
    setSlots((current) => next === 'full'
      ? (current.length > 0 && current[0]?.id === 'full-1' ? current.slice(0, 1) : [slotFor('full', 0)])
      : (current.some((slot) => slot.sourceKey.startsWith('component-')) ? current : []));
    setPublishRights(false);
    setPublishConfirmOpen(false);
    setMessage({ text: '', kind: '' });
    track('teacher_materials_book_pdf_mode_selected', { nextMode: next });
  };

  const requestSetupChange = () => {
    setMigrationOpen(true);
    track('teacher_materials_book_assembly_strategy_migration_requested', { fromMode: selectedMode });
  };

  const confirmSetupChange = async () => {
    const nextMode: PdfFlowMode = selectedMode === 'full' ? 'component' : 'full';
    if (!candidate || !candidate.manifest || !assemblyMigrationClient) {
      if (candidate) {
        setMessage({ text: 'Setup changes are unavailable until the trusted migration service is configured. Your current Book is unchanged.', kind: 'warn' });
        return;
      }
      setMigrationOpen(false);
      chooseMode(nextMode);
      return;
    }
    const currentManifest = candidate.manifest;
    const verified = assemblySourceVersions.filter((source) => source.verifiedUsable);
    let targetSourceSet: SourceSetCandidate;
    if (nextMode === 'full') {
      const source = verified[0];
      if (!source) {
        setMessage({ text: 'Add and verify the PDF needed for the new setup before changing the Book.', kind: 'warn' });
        return;
      }
      targetSourceSet = {
        sourceStrategy: 'full_pdf',
        sources: [{ sourceKey: 'full', sourceVersionId: source.sourceVersionId, sourceOrder: 1 }],
      };
    } else {
      const ownerNodeKey = currentManifest.nodes.find((node) => ['section', 'chapter', 'unit', 'test'].includes(node.nodeType))?.nodeKey;
      const targetSources = verified.map((source, index) => ({
        sourceKey: `component-${index + 1}`,
        sourceVersionId: source.sourceVersionId,
        sourceOrder: index + 1,
        ownerNodeKey: ownerNodeKey ?? '',
      }));
      if (targetSources.length < 2 || targetSources.some((source) => !source.ownerNodeKey)) {
        setMessage({ text: 'Add and verify at least two component PDFs before changing the Book.', kind: 'warn' });
        return;
      }
      const [first, ...rest] = targetSources;
      targetSourceSet = { sourceStrategy: 'component_pdfs', sources: [first, ...rest] };
    }
    const remaps: SourceStrategyMigrationRemap[] = currentManifest.units.flatMap((unit) => unit.pageGroups.map((group) => ({
      pageGroupKey: group.pageGroupKey,
      pages: group.pages.map((page) => ({ from: { sourceKey: group.sourceKey, physicalPageNumber: page }, to: { sourceKey: targetSourceSet.sources[0].sourceKey, physicalPageNumber: page } })),
    })));
    setMigrationBusy(true);
    try {
      const operationId = globalThis.crypto?.randomUUID?.() ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
      const staged = await assemblyMigrationClient.migrate({
        operationId,
        bookId,
        unitKey: candidate.unitKey,
        candidateId: candidate.candidateId,
        expectedBookRevision: assemblyBookRevision,
        expectedSourceSetRevision: assemblySourceSetRevision,
        expectedCandidateRevision: candidate.revision,
        targetSourceSetRevision: assemblySourceSetRevision + 1,
        targetSourceSet,
        remaps,
      });
      if (!staged.candidate) throw new Error('Migration did not return a reviewed draft.');
      const confirmed = await assemblyMigrationClient.confirm({
        operationId: globalThis.crypto?.randomUUID?.() ?? operationId,
        bookId,
        unitKey: candidate.unitKey,
        migrationCandidateId: staged.candidate.candidateId,
        expectedCurrentCandidateId: candidate.candidateId,
        expectedCurrentCandidateRevision: candidate.revision,
        expectedMigrationCandidateRevision: staged.candidate.revision,
      });
      const nextCandidate = confirmed.candidate ?? staged.candidate;
      setCandidate(nextCandidate);
      setMode(nextMode);
      setStep(2);
      setAssemblyStep('outline');
      setMigrationOpen(false);
      setMessage({ text: 'Your reviewed setup change is ready. The original Book remains safe.', kind: 'good' });
      track('teacher_materials_book_assembly_strategy_migration_confirmed', { fromMode: selectedMode, toMode: nextMode, candidateId: nextCandidate.candidateId });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Setup change could not be prepared. Your current Book is unchanged.', kind: 'error' });
      track('teacher_materials_book_assembly_strategy_migration_failed', { fromMode: selectedMode, toMode: nextMode });
    } finally {
      setMigrationBusy(false);
    }
  };

  const updateSlot = (id: string, update: Partial<SourceSlot>) => {
    setSlots((current) => current.map((slot) => slot.id === id ? { ...slot, ...update } : slot));
  };

  const addComponentSlot = () => {
    if (selectedMode !== 'component') return;
    const nextIndex = slots.length;
    setSlots((current) => [...current, slotFor('component', nextIndex)]);
    track('teacher_materials_book_pdf_component_slot_added', { sourceKey: `component-${nextIndex + 1}` });
  };

  const workflowFor = (sourceKey: string) => uploadWorkflowForSource?.(sourceKey) ?? uploadWorkflow;
  const beginUpload = (slot: SourceSlot, selection: SourceUploadSelection) => {
    updateSlot(slot.id, { selection });
    setActiveUploadId(slot.id);
    setMessage({ text: '', kind: '' });
    track('teacher_materials_book_pdf_source_verified', {
      sourceKey: slot.sourceKey,
      physicalPageCount: selection.claim.physicalPageCount,
      sha256Hex: selection.claim.sha256Hex,
    });
  };

  const onUploadState = (slot: SourceSlot, state: SourceUploadSafeOperationState | null) => {
    updateSlot(slot.id, { uploadState: state });
    if (state?.phase === 'verified') {
      setActiveUploadId(null);
      onDirtyChange?.(true);
      track('teacher_materials_book_pdf_source_upload_verified', {
        sourceKey: slot.sourceKey,
        sourceVersionId: state.sourceVersionId,
      });
    }
  };

  const setFlowStep = (nextStep: PdfFlowStep) => {
    setStep(nextStep);
    if (nextStep === 2) setAssemblyStep('outline');
    if (nextStep === 3) setAssemblyStep('pages');
    if (nextStep === 4) setAssemblyStep('review');
  };

  const continueFromFiles = () => {
    if (!sourceReady) {
      setMessage({ text: selectedMode === 'full' ? 'Verify and upload the Book PDF before continuing.' : 'Verify and upload every component PDF before continuing.', kind: 'warn' });
      return;
    }
    setFlowStep(2);
    track('teacher_materials_book_pdf_workflow_step_changed', { nextStep: 2 });
  };

  const onAssemblyStepChange = (next: AssemblyStep) => {
    setAssemblyStep(next);
    setStep(ASSEMBLY_STEP_TO_FLOW[next]);
    track('teacher_materials_book_pdf_workflow_step_changed', { nextStep: ASSEMBLY_STEP_TO_FLOW[next], assemblyStep: next });
  };

  const previewInput = candidate ? {
    bookId,
    unitKey: candidate.unitKey,
    candidateId: candidate.candidateId,
    expectedCandidateRevision: candidate.revision,
  } : null;

  const requestPreview = async () => {
    if (!assemblyPreviewClient || !previewInput) {
      setMessage({ text: 'Student preview is unavailable until the trusted preview Worker is configured.', kind: 'warn' });
      return;
    }
    try {
      const result = await assemblyPreviewClient.preview(previewInput);
      setPreviewProjection(result.preview);
      setPreviewApproval(null);
      track('teacher_materials_book_assembly_candidate_preview_opened', { candidateId: candidate?.candidateId });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Student preview could not be loaded.', kind: 'error' });
    }
  };

  const approvePreview = async () => {
    if (!assemblyPreviewClient || !previewInput || !previewProjection) {
      setMessage({ text: 'Open the trusted student preview before approving it.', kind: 'warn' });
      return;
    }
    try {
      const result = await assemblyPreviewClient.approve(previewInput);
      setPreviewApproval(result.approval);
      track('teacher_materials_book_assembly_candidate_preview_approved', { candidateId: candidate?.candidateId, approvalId: result.approval.approvalId });
      setMessage({ text: 'Preview approved. You can now publish this draft.', kind: 'good' });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Preview approval could not be saved.', kind: 'error' });
    }
  };

  const publish = async () => {
    if (!assemblyPreviewClient || !previewInput || !previewApproval || !candidate) {
      setMessage({ text: 'Save and approve the trusted preview before publishing.', kind: 'warn' });
      return;
    }
    try {
      const result = selectedMode === 'full'
        ? await assemblyPreviewClient.publishFull({
            ...previewInput,
            expectedCurrentPublicationId: null,
            expectedBookRevision: candidate.bookRevision,
            expectedSourceSetRevision: candidate.sourceSetRevision,
            previewApproval,
          })
        : await assemblyPreviewClient.publishComponent({
            ...previewInput,
            expectedCurrentPublicationId: null,
            expectedBookRevision: candidate.bookRevision,
            expectedSourceSetRevision: candidate.sourceSetRevision,
            previewApproval,
          });
      setPublication(result);
      setMessage({ text: 'Book published. The trusted service returned a publication receipt.', kind: 'good' });
      onDirtyChange?.(false);
      track('teacher_materials_book_pdf_published', { publicationId: result.publicationId, publicationRevision: result.publicationRevision });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Publication failed. Your draft is unchanged.', kind: 'error' });
    }
  };

  const renderSourceCard = (slot: SourceSlot) => {
    const workflow = workflowFor(slot.sourceKey);
    const slotIndex = visibleSlots.findIndex((candidateSlot) => candidateSlot.id === slot.id);
    const persistedSource = persistedStrategyMatches
      ? assemblyInitialCandidate?.manifest?.sourceSet.sources[slotIndex]
      : undefined;
    const persistedVersion = persistedSource
      ? assemblySourceVersions.find((source) => source.sourceVersionId === persistedSource.sourceVersionId)
      : undefined;
    const verified = slot.uploadState?.phase === 'verified' || Boolean(persistedVersion?.verifiedUsable);
    const persistedReady = !slot.uploadState && Boolean(persistedVersion?.verifiedUsable);
    const activeUpload = activeUploadId === slot.id && slot.selection !== null;
    return (
      <section className="pbf-surface" key={slot.id} aria-labelledby={`${slot.id}-title`}>
        <div className="pbf-row">
          <div>
            <h3 id={`${slot.id}-title`}>{slot.label}</h3>
            <p className="pbf-muted">{verified ? `${slot.selection?.claim.displayFilename ?? 'PDF'} is ready privately.` : 'Check this file on your device before uploading.'}</p>
          </div>
          <span className={`pbf-status${verified ? ' is-good' : ''}`}>{verified ? 'Ready' : 'Needs file'}</span>
        </div>
        {activeUpload && workflow && !persistedReady ? (
          <div className="pbf-real-upload">
            <BookSourceUploadPanel
              allowFreshUpload={uploadEnabled}
              bookId={bookId}
              guided
              instanceKey={`${slot.id}-upload`}
              uiVariant="mockup"
              sourceKey={slot.sourceKey}
              immutablePublished={false}
              onAction={onUploadAction}
              onStateChange={(state) => onUploadState(slot, state)}
              selection={slot.selection}
              workflow={workflow}
            />
          </div>
        ) : verified ? (
          <div className="pbf-callout is-good" style={{ marginTop: 14 }}>
            <strong>{selectedMode === 'full' ? 'Your PDF is ready' : 'PDF ready'}</strong>
            <span>{persistedReady ? 'This verified PDF is already part of the saved Book draft.' : 'Nothing is published yet. You can continue to assemble the Book.'}</span>
          </div>
        ) : (
          <div className="pbf-real-source-panel">
            <BookSourceInspectionPanel
              canRequestUploadAuthorization={Boolean(canEdit && uploadEnabled && workflow)}
              guided
              instanceKey={`${slot.id}-inspection`}
              uiVariant="mockup"
              uploadUnavailableMessage={uploadUnavailableMessage}
              onAction={onInspectionAction}
              onClaimChange={(selection) => updateSlot(slot.id, { selection })}
              onRequestUploadAuthorization={(selection) => beginUpload(slot, selection)}
            />
          </div>
        )}
      </section>
    );
  };

  const renderFiles = () => (
    <FlowView
      title={selectedMode === 'full' ? 'Start with one PDF' : 'Bring in your PDF sections'}
      subtitle={selectedMode === 'full' ? 'Choose the student-safe PDF you want to use in this Book.' : 'Each file becomes a named part of the Book. Add at least two so we can compose them together.'}
      status={sourceReady ? 'Ready' : selectedMode === 'full' ? '1 file' : `${verifiedSlots.length} of 2 files`}
      statusKind={sourceReady ? 'good' : undefined}
    >
      {visibleSlots.length === 0 && <FlowSurface><div className="pbf-upload-zone"><div><div className="pbf-upload-icon">PDF</div><strong>Add a PDF</strong><p>We will check the file in your browser before anything is uploaded.</p><button type="button" className="pbf-button pbf-button-primary" onClick={addComponentSlot}>Add a PDF</button></div></div></FlowSurface>}
      {visibleSlots.map(renderSourceCard)}
      {selectedMode === 'component' && visibleSlots.length > 0 && (
        <button type="button" className="pbf-button" style={{ marginTop: 12 }} onClick={addComponentSlot}>Add a PDF</button>
      )}
      {selectedMode === 'component' && visibleSlots.length > 0 && visibleSlots.length < 2 && <p className="pbf-callout is-warn" style={{ marginTop: 12 }}>Add at least two PDFs so we can compose them together.</p>}
    </FlowView>
  );

  const renderAssembly = () => {
    if (!canEdit) return <FlowView title="Book structure" subtitle="This Book is read-only in this view." status="Read-only"><FlowSurface><p className="pbf-muted">Ask the Book owner to make changes.</p></FlowSurface></FlowView>;
    const assemblyView = assemblyStep === 'outline'
      ? (selectedMode === 'full'
        ? { title: 'Build the Book structure', subtitle: 'Start with the outline students will follow, then add the content for the first Unit.' }
        : { title: 'Give each PDF a place', subtitle: 'Choose which section each file belongs to, keep the order clear, and add its activities.' })
      : assemblyStep === 'pages'
        ? { title: 'Connect activities to pages', subtitle: 'Tell us which pages students should see for each activity. You can change these later.' }
        : assemblyStep === 'review'
          ? { title: 'Take a look before you publish', subtitle: 'Review the Book as a teacher, then open the student view for the Unit you are about to share.' }
          : { title: 'Build the Book structure', subtitle: 'Start with the outline students will follow, then add the content for the first Unit.' };
    return (
      <FlowView title={assemblyView.title} subtitle={assemblyView.subtitle} status={assemblyStep === 'review' ? 'Review' : 'In progress'}>
        <BookAssemblyWorkspace
          access={access as 'owner' | 'administrator'}
          activityAuthoring={activityAuthoring}
          bookId={bookId}
          bookTitle={title}
          bookRevision={assemblyBookRevision}
          candidateRuntimePreview={previewProjection ?? assemblyCandidateRuntimePreview}
          initialCandidate={candidate}
          migrationClient={assemblyMigrationClient}
          onAction={onTrackAction}
          onCandidateChange={setCandidate}
          onDirtyChange={onDirtyChange}
          onGuidedStepChange={onAssemblyStepChange}
          presentation={presentation}
          previewDocuments={assemblyPreviewDocuments}
          previewGetIdToken={assemblyPreviewGetIdToken}
          repository={assemblyRepository ?? undefined}
          sourceSetRevision={assemblySourceSetRevision}
          sourceSetAttachmentClient={sourceSetAttachmentClient}
          sourceVersions={sourceVersions}
          strategyOverride={selectedMode === 'full' ? 'full_pdf' : 'component_pdfs'}
          guided
          guidedUiVariant="mockup"
          guidedStep={assemblyStep}
          suppressGuidedChrome
          suppressModeChoice
          validateCandidateAfterSave
        />
        {assemblyStep === 'review' && (
          <FlowSurface>
            <div className="pbf-row"><div><h3>Preview as a student</h3><p className="pbf-muted">Open the trusted preview before publishing. Nothing is published by opening it.</p></div><span className={`pbf-status${previewApproval ? ' is-good' : ''}`}>{previewApproval ? 'Approved' : previewProjection ? 'Ready to approve' : 'Review needed'}</span></div>
            <div className="pbf-actions" style={{ marginTop: 14 }}><button type="button" className="pbf-button pbf-button-primary" onClick={() => void requestPreview()} disabled={!candidate || candidate.lifecycle !== 'validated' || !assemblyPreviewClient}>{previewProjection ? 'Refresh preview' : 'Preview as a student'}</button><button type="button" className="pbf-button" onClick={() => void approvePreview()} disabled={!previewProjection || Boolean(previewApproval) || !assemblyPreviewClient}>Approve this preview</button></div>
          </FlowSurface>
        )}
      </FlowView>
    );
  };

  const renderPublish = () => (
    <FlowView title={publication ? 'Unit 1 is live' : 'Ready to share Unit 1?'} subtitle={publication ? 'Students can now open the published Unit. Unit 2 and your existing homework are unchanged.' : 'This will make Unit 1 available to students. Later Units will stay private until you publish them.'} status={publication ? 'Published' : 'Ready'} statusKind={publication ? 'good' : undefined}>
      <FlowSurface className="pbf-publish-surface">
        {publication && <div className="pbf-success"><div className="pbf-success-mark" aria-hidden="true">✓</div><h2>Unit 1 is live</h2><p>Students can now open the published Unit. Unit 2 and your existing homework are unchanged.</p><div className="pbf-actions" style={{ marginTop: 18, justifyContent: 'center' }}><button type="button" className="pbf-button" disabled>Preview homework handoff</button><button type="button" className="pbf-button pbf-button-primary" onClick={() => { setMode(null); setStep(1); }}>Return to Book</button></div></div>}
        {!publication && <><div className="pbf-callout is-warn"><strong>Nothing is published yet</strong><span>Publishing Unit 1 will not change later Units or existing homework.</span></div><div className="pbf-checklist" style={{ marginTop: 16 }}><div className="pbf-checklist-item">Unit 1 will be published with its current activities</div><div className="pbf-checklist-item">Students will see only the pages connected to this Unit</div><div className="pbf-checklist-item">Your current Book and later Units will remain safe</div></div></>}
        {!publication && <><label className="pbf-check"><input type="checkbox" checked={publishRights} onChange={(event) => setPublishRights(event.currentTarget.checked)} /> <span>I confirm the PDF permission is still valid for publishing.</span></label><div className="pbf-actions" style={{ marginTop: 18 }}><button type="button" className="pbf-button pbf-button-primary" onClick={() => setPublishConfirmOpen(true)} disabled={!publishRights || !previewApproval || !assemblyPreviewClient || !candidate}>{assemblyPreviewClient ? 'Publish Unit 1' : 'Publication service unavailable'}</button></div></>}
      </FlowSurface>
    </FlowView>
  );

  if (!mode) {
    return (
      <section className="book-pdf-flow" data-access={access} data-presentation={presentation}>
        <div className="pbf-window">
          <header className="pbf-header"><div className="pbf-brand"><span className="pbf-mark">PDF</span><div><p className="pbf-eyebrow">Book editor</p><h1>{title}</h1></div></div><div className="pbf-header-actions"><span className="pbf-status">Draft</span><button type="button" className="pbf-button pbf-button-quiet" onClick={() => setMode(null)}>Change PDF setup</button></div></header>
          <main className="pbf-main">
            <div className="pbf-hero pbf-mode-hero"><div className="pbf-eyebrow">Set up your PDF Book</div><h2>How will this Book use PDFs?</h2><p>Choose the setup that matches your files. You can change it later through a reviewed migration.</p></div>
            <div className="pbf-choice-grid">
              <button type="button" className="pbf-choice" onClick={() => chooseMode('full')}><h3>One complete PDF</h3><p>Use one PDF for the whole Book. You will upload one file and connect one Book structure to it.</p><small>Best when everything lives in one document →</small></button>
              <button type="button" className="pbf-choice" onClick={() => chooseMode('component')}><h3>Several component PDFs</h3><p>Use separate PDFs for different sections. Each file keeps its own place and its own structure.</p><small>Best when a Book is assembled from multiple files →</small></button>
            </div>
            <div className="pbf-callout" style={{ marginTop: 18 }}><strong>Nothing is published yet</strong><span>This walkthrough keeps your current Book unchanged until you explicitly publish a Unit.</span></div>
          </main>
          <footer className="pbf-footer"><p>Choose a setup to begin.</p><div /></footer>
        </div>
      </section>
    );
  }

  const renderStep = step === 1 ? renderFiles : step === 5 ? renderPublish : renderAssembly;
  return (
    <section className="book-pdf-flow" data-access={access} data-presentation={presentation} data-mode={mode}>
      <div className="pbf-window">
        <header className="pbf-header">
          <div className="pbf-brand"><span className="pbf-mark">PDF</span><div><p className="pbf-eyebrow">Book editor</p><h1>{title}</h1></div></div>
          <div className="pbf-header-actions"><span className="pbf-status">{selectedMode === 'full' ? 'Full PDF · Draft' : 'Component PDFs · Draft'}</span><button type="button" className="pbf-button pbf-button-quiet" onClick={requestSetupChange}>Change PDF setup</button></div>
        </header>
        <nav className="pbf-progress" aria-label="PDF Book progress">
          {FLOW_STEPS.map((label, index) => {
            const number = (index + 1) as PdfFlowStep;
            const disabled = number > unlockedStep;
            return <button key={label} type="button" className={`pbf-progress-step${step === number ? ' is-current' : ''}${number < step ? ' is-done' : ''}`} disabled={disabled} onClick={() => setFlowStep(number)}><span>{number < step ? '✓' : number}</span><strong>{label}</strong></button>;
          })}
        </nav>
        <main className="pbf-main">{renderStep()}</main>
        <footer className="pbf-footer"><p>{step === 1 ? 'Your original files stay on your device until you choose to upload.' : `Step ${step} of 5 · ${selectedMode === 'full' ? 'Full PDF' : 'Component PDFs'}`}</p><div className="pbf-actions"><button type="button" className="pbf-button pbf-button-quiet" onClick={() => setFlowStep(Math.max(1, step - 1) as PdfFlowStep)} disabled={step === 1}>Back</button>{step === 1 && <button type="button" className="pbf-button pbf-button-primary" onClick={continueFromFiles} disabled={!sourceReady}>Continue</button>}{step === 4 && <button type="button" className="pbf-button pbf-button-primary" onClick={() => setFlowStep(5)} disabled={!previewApproval}>Continue</button>}</div></footer>
        {publishConfirmOpen && <div className="pbf-overlay"><div className="pbf-overlay-shell" role="dialog" aria-modal="true" aria-labelledby="pbf-publish-title"><h2 id="pbf-publish-title">Publish Unit 1?</h2><p>Students will be able to open this Unit immediately.</p><ul className="pbf-checklist" style={{ marginTop: 15 }}><li>{selectedMode === 'full' ? 'Full PDF' : 'Component PDFs'} source is ready</li><li>Student preview is approved</li><li>Later Units remain private</li></ul><div className="pbf-overlay-footer"><button type="button" className="pbf-button" onClick={() => setPublishConfirmOpen(false)}>Not yet</button><button type="button" className="pbf-button pbf-button-primary" onClick={() => { setPublishConfirmOpen(false); void publish(); }}>Publish Unit 1</button></div></div></div>}
        {migrationOpen && <div className="pbf-overlay"><div className="pbf-overlay-shell" role="dialog" aria-modal="true" aria-labelledby="pbf-migration-title"><h2 id="pbf-migration-title">Change your PDF setup</h2><p>This creates a reviewed draft. Your current Book stays safe while you check the new setup.</p><div className="pbf-surface" style={{ marginTop: 15 }}><div className="pbf-row"><strong>Current setup</strong><span>{selectedMode === 'full' ? 'One complete PDF' : 'Several component PDFs'}</span></div><div className="pbf-row"><strong>New setup</strong><span>{selectedMode === 'full' ? 'Several component PDFs' : 'One complete PDF'}</span></div><div className="pbf-row"><strong>Page connections</strong><span className="pbf-status is-warn">Review before publishing</span></div></div><div className="pbf-callout is-warn" style={{ marginTop: 13 }}><strong>Your current Book stays safe</strong><span>The new setup is prepared and confirmed separately. Nothing is published by changing setup.</span></div><div className="pbf-overlay-footer"><button type="button" className="pbf-button" disabled={migrationBusy} onClick={() => setMigrationOpen(false)}>Cancel</button><button type="button" className="pbf-button pbf-button-primary" disabled={migrationBusy} onClick={() => void confirmSetupChange()}>{migrationBusy ? 'Preparing reviewed change…' : 'Prepare reviewed change'}</button></div></div></div>}
        {message.text && <div className={`pbf-toast is-${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</div>}
      </div>
    </section>
  );
};

const FlowView = ({ title, subtitle, status, statusKind, children }: { readonly title: string; readonly subtitle: string; readonly status: string; readonly statusKind?: 'good' | 'warn'; readonly children: ReactNode }) => (
  <div className="pbf-view"><div className="pbf-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className={`pbf-status${statusKind ? ` is-${statusKind}` : ''}`}>{status}</span></div>{children}</div>
);

const FlowSurface = ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => <div className={`pbf-surface${className ? ` ${className}` : ''}`}>{children}</div>;

export default BookPdfFlowWorkspace;
