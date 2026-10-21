import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '../modern/ToastNotification';
import type { SourceUploadBrowserWorkflow, SourceUploadSelection } from '../../services/book-source-delivery/sourceUpload.browserWorkflow';
import type { SourceUploadSafeOperationState } from '../../services/book-source-delivery/sourceUpload.client';
import type { SourceSetAttachmentClient } from '../../services/book-source-delivery/sourceUpload.client';
import type { BookAssemblyMigrationClient, ComponentPdfActivationClient } from '../../services/book-assembly/assemblyClient.browser';
import type { BookAssemblyCurrentPublication, BookAssemblyPreviewClient, AssemblyPublicationReceipt } from '../../services/book-assembly/assemblyPublication.client';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import type { BookAssemblyCandidateRecord, BookAssemblyMutationResult } from '../../services/book-assembly/unitAssembly.types';
import type { SourceStrategyMigrationRemap } from '../../services/book-assembly/sourceStrategyMigration.service';
import { previewInputFingerprint, type CandidateUnitPreviewProjection, type WholeActivationApprovalQualification } from '../../services/book-assembly/unitPreview.service';
import type { ActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import type { BookTeacherAssemblyDocumentProjection } from '../../services/book-delivery/bookTeacherAssemblyDocument.types';
import type { SourceSetCandidate, TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';
import type { MaterialBookSetupActivation } from '../../types/materialCatalog.types';
import type { BookAssemblyPreviewApprovalReference } from '../../types/bookAssembly.types';
import type { ReactNode } from 'react';
import {
  composeComponentPdfs,
} from '../../services/book-source-delivery/componentPdfComposition.browser';
import {
  ComponentPdfCompositionError,
  type ComponentPdfInputManifestEntry,
  type ComponentPdfCompositionResult,
} from '../../services/book-source-delivery/componentPdfComposition.types';
import {
  inspectSourcePdf,
  isSourcePdfInspectionClaimForFile,
  SourcePdfInspectionError,
  type SourcePdfInspectionClaim,
} from '../../services/book-source-delivery/sourcePdfInspection.browser';
import BookAssemblyWorkspace from './BookAssemblyWorkspace';
import BookAssemblyStudentPreviewHost from './assembly/BookAssemblyStudentPreviewHost';
import BookSourceInspectionPanel, { type BookSourceInspectionAction } from './BookSourceInspectionPanel';
import BookSourceUploadPanel, { type BookSourceUploadAction } from './BookSourceUploadPanel';
import './BookPdfFlowWorkspace.css';

type PdfFlowMode = 'full' | 'component';
type PdfFlowStep = 1 | 2 | 3 | 4 | 5;
type AssemblyStep = 'mode' | 'outline' | 'pages' | 'review';
type PublicationRefreshStatus = 'ready' | 'pending' | 'error';
export type BookCurrentPublicationStatus = 'loading' | 'loaded' | 'error';
export type BookPdfEditorSection = 'pdf-files' | 'content-tree' | 'activity-json' | 'preview';

interface SourceSlot {
  readonly id: string;
  readonly sourceKey: string;
  readonly label: string;
  readonly selection: SourceUploadSelection | null;
  readonly uploadState: SourceUploadSafeOperationState | null;
}

interface CombinedPdfSelection {
  readonly selectionId: number;
  readonly file: File;
  readonly inspectionGeneration: number;
  readonly status: 'checking' | 'ready' | 'failed';
  readonly claim: SourcePdfInspectionClaim | null;
  readonly duplicateDecision?: 'keep';
  readonly errorCode?: string;
  readonly errorCause?: string;
  readonly errorReason?: string;
}

interface CombinedPdfBinding {
  readonly outputSha256Hex: string;
  readonly inputManifest: readonly ComponentPdfInputManifestEntry[];
}

type CombinedPdfPhase = 'files' | 'combining' | 'preview';

interface ReplacementReview {
  readonly slotId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly displayFilename: string;
  readonly oldPageCount: number;
  readonly newPageCount: number;
  readonly pageGroupCount: number;
  readonly activityCount: number;
}

type LocalSourceVersionProjection = TrustedBookSourceVersionProjection & {
  readonly sourceKey: string;
};

export interface BookPdfFlowWorkspaceProps {
  readonly access: 'owner' | 'administrator' | 'public-readonly';
  readonly bookId: string;
  readonly title: string;
  readonly presentation: 'modal' | 'page-compat';
  readonly experience: 'guided-creation' | 'focused-editing';
  readonly editingSection?: BookPdfEditorSection;
  readonly previewUnitKey?: string;
  readonly onPreviewUnitChange?: (unitKey: string) => void;
  readonly onOpenPlan?: () => void;
  readonly uploadWorkflow: SourceUploadBrowserWorkflow | null;
  readonly uploadWorkflowForSource?: (sourceKey: string) => SourceUploadBrowserWorkflow | null;
  readonly uploadUnavailableMessage?: string;
  readonly assemblyRepository?: UnitAssemblyRepository | null;
  readonly assemblyMigrationClient?: BookAssemblyMigrationClient | null;
  readonly componentPdfActivationClient?: ComponentPdfActivationClient | null;
  readonly componentStudentDocumentSourceVersionId?: string | null;
  readonly componentPdfActivationRecovery?: MaterialBookSetupActivation | null;
  readonly activityAuthoring?: ActivityAuthoringService | null;
  readonly assemblySourceVersions: readonly TrustedBookSourceVersionProjection[];
  readonly assemblyInitialSourceSet?: SourceSetCandidate | null;
  readonly assemblyInitialCandidate?: BookAssemblyCandidateRecord | null;
  readonly assemblyInitialPublication?: BookAssemblyCurrentPublication | null;
  readonly assemblyInitialPublicationStatus?: BookCurrentPublicationStatus;
  readonly assemblyInitialSavedActivityKeysByUnit?: Readonly<Record<string, readonly string[]>>;
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
  readonly onHomeworkHandoff?: () => void;
  readonly onRetryCurrentPublication?: () => void;
  readonly onCurrentPublicationChange?: (publication: BookAssemblyCurrentPublication) => void;
}

const FLOW_STEPS = ['Prepare files', 'Build your Book', 'Connect pages', 'Check & preview', 'Publish'] as const;
const MAX_COMPONENT_PDFS = 20;
const ASSEMBLY_STEP_TO_FLOW: Record<AssemblyStep, PdfFlowStep> = {
  mode: 2,
  outline: 2,
  pages: 3,
  review: 4,
};

const failureCode = (error: unknown): string => (
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code.toLowerCase()
    : ''
);

const failureStatus = (error: unknown): number | undefined => (
  typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined
);

const isConflictFailure = (error: unknown): boolean => {
  const code = failureCode(error);
  return failureStatus(error) === 409 || code.includes('conflict') || code.includes('stale') || code.includes('revision');
};

const actionableFailureToast = (error: unknown, fallback: string): string => {
  const code = failureCode(error);
  const status = failureStatus(error);
  if (code === 'full_pdf_sibling_review_required') return 'Another published Unit has changed or is missing from this plan. Review those changes before publishing. Your draft is unchanged.';
  if (isConflictFailure(error)) return 'The Book changed elsewhere. Refresh and retry.';
  if (status === 401 || code.includes('unauthorized')) return 'Your session expired. Sign in again and retry.';
  if (status === 403 || code.includes('forbidden') || code.includes('permission')) return 'You no longer have access to this Book. Reopen it and retry.';
  if (status === 404 || code.includes('not_found')) return 'This Book is unavailable. Reopen it and retry.';
  if (status === 0 || (status !== undefined && status >= 500) || code.includes('unavailable')) return 'The Book service is unavailable. Retry.';
  return fallback;
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
): LocalSourceVersionProjection | null => {
  const state = slot.uploadState;
  const claim = slot.selection?.claim;
  if (!state || state.phase !== 'verified' || !state.sourceVersionId || !claim) return null;
  return {
    sourceKey: slot.sourceKey,
    sourceVersionId: state.sourceVersionId,
    bookId: state.bookId,
    physicalPageCount: claim.physicalPageCount,
    checksum: { algorithm: 'sha-256', value: claim.sha256Hex },
    purpose: 'book-source',
    studentSafeStatus: 'unreviewed',
    verifiedUsable: true,
  };
};

const duplicateOfIndex = (
  entries: readonly CombinedPdfSelection[],
  index: number,
): number | null => {
  const hash = entries[index]?.claim?.sha256Hex;
  if (!hash) return null;
  const match = entries.findIndex((entry, entryIndex) => entryIndex < index && entry.claim?.sha256Hex === hash);
  return match === -1 ? null : match;
};

const BookPdfFlowWorkspace = ({
  access,
  bookId,
  title,
  presentation,
  experience,
  editingSection,
  previewUnitKey,
  onPreviewUnitChange,
  onOpenPlan,
  uploadWorkflow,
  uploadWorkflowForSource,
  uploadUnavailableMessage,
  assemblyRepository,
  assemblyMigrationClient,
  componentPdfActivationClient,
  componentStudentDocumentSourceVersionId,
  componentPdfActivationRecovery,
  activityAuthoring,
  assemblySourceVersions,
  assemblyInitialSourceSet,
  assemblyInitialCandidate,
  assemblyInitialPublication,
  assemblyInitialPublicationStatus = 'loaded',
  assemblyInitialSavedActivityKeysByUnit,
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
  onHomeworkHandoff,
  onRetryCurrentPublication,
  onCurrentPublicationChange,
}: BookPdfFlowWorkspaceProps) => {
  const persistedSourceSet = assemblyInitialCandidate?.manifest?.sourceSet ?? assemblyInitialSourceSet ?? null;
  const initialStrategy = persistedSourceSet?.sourceStrategy;
  const [mode, setMode] = useState<PdfFlowMode | null>(
    initialStrategy === 'component_pdfs' ? 'component' : initialStrategy === 'full_pdf' ? 'full' : null,
  );
  const [step, setStep] = useState<PdfFlowStep>(mode ? 1 : 1);
  const [assemblyStep, setAssemblyStep] = useState<AssemblyStep>(initialStrategy ? 'outline' : 'mode');
  const [slots, setSlots] = useState<SourceSlot[]>(() => {
    const initialCount = initialStrategy === 'component_pdfs'
      ? Math.max(2, assemblyInitialCandidate?.manifest?.sourceSet.sources.length ?? 0)
      : 1;
    return Array.from({ length: initialCount }, (_, index) => ({
      ...slotFor(initialStrategy === 'component_pdfs' ? 'component' : 'full', index),
      ...(persistedSourceSet?.sources[index] ? { sourceKey: persistedSourceSet.sources[index]!.sourceKey } : {}),
    }));
  });
  const [replacingSourceId, setReplacingSourceId] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<BookAssemblyCandidateRecord | null>(assemblyInitialCandidate ?? null);
  const [previewProjection, setPreviewProjection] = useState<CandidateUnitPreviewProjection | null>(null);
  const [savedActivitySummary, setSavedActivitySummary] = useState<CandidateUnitPreviewProjection | null>(null);
  const [savedActivitySummaryLoad, setSavedActivitySummaryLoad] = useState<{ key: string; status: 'loading' | 'error' } | null>(null);
  const [savedActivitySummaryRetry, setSavedActivitySummaryRetry] = useState(0);
  const [dismissedPreviewIdentity, setDismissedPreviewIdentity] = useState<string | null>(null);
  const [previewApproval, setPreviewApproval] = useState<BookAssemblyPreviewApprovalReference | null>(null);
  const [previewQualification, setPreviewQualification] = useState<WholeActivationApprovalQualification | null>(null);
  const [componentPreviewInput, setComponentPreviewInput] = useState<{
    readonly bookId: string; readonly unitKey: string; readonly candidateId: string; readonly expectedCandidateRevision: number;
  } | null>(null);
  const [componentApprovals, setComponentApprovals] = useState<Record<string, BookAssemblyPreviewApprovalReference>>({});
  const [currentPublication, setCurrentPublication] = useState<BookAssemblyCurrentPublication | null>(
    assemblyInitialPublicationStatus === 'loaded' ? assemblyInitialPublication ?? null : null,
  );
  const [publication, setPublication] = useState<AssemblyPublicationReceipt | null>(null);
  const [publicationOperationId, setPublicationOperationId] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publicationRefreshStatus, setPublicationRefreshStatus] = useState<PublicationRefreshStatus>('ready');
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationBusy, setMigrationBusy] = useState(false);
  const [effectiveAssemblyBookRevision, setEffectiveAssemblyBookRevision] = useState(assemblyBookRevision);
  const [effectiveAssemblySourceSetRevision, setEffectiveAssemblySourceSetRevision] = useState(assemblySourceSetRevision);
  const [assemblyDirty, setAssemblyDirty] = useState(false);
  const [previewBlocked, setPreviewBlocked] = useState(true);
  const [combinedFiles, setCombinedFiles] = useState<CombinedPdfSelection[]>([]);
  const [combinedPhase, setCombinedPhase] = useState<CombinedPdfPhase>('files');
  const [combinedResult, setCombinedResult] = useState<ComponentPdfCompositionResult | null>(null);
  const [combinedDocumentSelection, setCombinedDocumentSelection] = useState<SourceUploadSelection | null>(null);
  const [combinedDocumentUploadState, setCombinedDocumentUploadState] = useState<SourceUploadSafeOperationState | null>(null);
  const [combinedBinding, setCombinedBinding] = useState<CombinedPdfBinding | null>(null);
  const [combinedError, setCombinedError] = useState('');
  const combinedControllerRef = useRef<AbortController | null>(null);
  const combinedInspectionControllersRef = useRef(new Map<number, AbortController>());
  const combinedInspectionGenerationBySelectionRef = useRef(new Map<number, number>());
  const combinedInspectionGenerationRef = useRef(0);
  const combinedSelectionIdRef = useRef(0);
  const combinedMountedRef = useRef(true);
  const combinedInputRef = useRef<HTMLInputElement | null>(null);
  const [isPickerOpening, setIsPickerOpening] = useState(false);
  const [combinedPreviewUrl, setCombinedPreviewUrl] = useState<string | null>(null);
  const [replacementReview, setReplacementReview] = useState<ReplacementReview | null>(null);
  const [replacementBusy, setReplacementBusy] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [replacementOperationId, setReplacementOperationId] = useState<string | null>(null);
  const [fullAttachmentBusy, setFullAttachmentBusy] = useState(false);
  const [fullAttachmentOperationId, setFullAttachmentOperationId] = useState<string | null>(null);

  const savedActivitySummaryUnitKey = previewUnitKey ?? candidate?.unitKey ?? null;
  const savedActivitySummaryKey = savedActivitySummaryUnitKey
    ? `${bookId}:${effectiveAssemblyBookRevision}:${effectiveAssemblySourceSetRevision}:${savedActivitySummaryUnitKey}:${candidate?.candidateId ?? ''}:${candidate?.revision ?? ''}`
    : '';

  useEffect(() => {
    if (experience !== 'focused-editing' || editingSection !== 'activity-json' || !savedActivitySummaryUnitKey
      || !assemblyRepository?.loadCurrent || !assemblyPreviewClient) return undefined;

    let active = true;
    const key = savedActivitySummaryKey;
    setSavedActivitySummaryLoad({ key, status: 'loading' });
    void (async () => {
      try {
        const loaded = await assemblyRepository.loadCurrent!(bookId, savedActivitySummaryUnitKey);
        const savedCandidate = loaded?.candidate;
        if (!savedCandidate || savedCandidate.bookId !== bookId || savedCandidate.unitKey !== savedActivitySummaryUnitKey
          || savedCandidate.bookRevision !== effectiveAssemblyBookRevision
          || savedCandidate.sourceSetRevision !== effectiveAssemblySourceSetRevision) throw new Error('saved_activity_summary_unavailable');
        const result = await assemblyPreviewClient.preview({ bookId, unitKey: savedCandidate.unitKey,
          candidateId: savedCandidate.candidateId, expectedCandidateRevision: savedCandidate.revision });
        const projection = result.preview;
        if (projection.bookId !== bookId || projection.bookRevision !== effectiveAssemblyBookRevision
          || projection.candidateId !== savedCandidate.candidateId || projection.candidateRevision !== savedCandidate.revision
          || projection.sourceSetRevision !== effectiveAssemblySourceSetRevision || projection.unitKey !== savedActivitySummaryUnitKey) {
          throw new Error('saved_activity_summary_unavailable');
        }
        if (active) {
          setSavedActivitySummary(projection);
          setSavedActivitySummaryLoad(null);
        }
      } catch {
        if (active) setSavedActivitySummaryLoad({ key, status: 'error' });
      }
    })();
    return () => { active = false; };
  }, [
    assemblyPreviewClient, assemblyRepository, bookId, editingSection, effectiveAssemblyBookRevision,
    effectiveAssemblySourceSetRevision, experience, savedActivitySummaryRetry, savedActivitySummaryKey,
    savedActivitySummaryUnitKey,
  ]);

  useEffect(() => {
    combinedMountedRef.current = true;
    return () => {
      combinedMountedRef.current = false;
      combinedInspectionGenerationRef.current += 1;
      combinedInspectionControllersRef.current.forEach((controller) => controller.abort());
      combinedInspectionControllersRef.current.clear();
      combinedInspectionGenerationBySelectionRef.current.clear();
      combinedControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setCurrentPublication(assemblyInitialPublicationStatus === 'loaded' ? assemblyInitialPublication ?? null : null);
  }, [assemblyInitialPublication, assemblyInitialPublicationStatus]);

  useEffect(() => {
    if (!combinedResult) {
      setCombinedPreviewUrl(null);
      return undefined;
    }
    if (typeof URL.createObjectURL !== 'function' || typeof URL.revokeObjectURL !== 'function') {
      return undefined;
    }
    const url = URL.createObjectURL(combinedResult.file);
    setCombinedPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [combinedResult]);

  const canEdit = access !== 'public-readonly';
  const focusedEditing = experience === 'focused-editing';
  const publicationStatusReady = assemblyInitialPublicationStatus === 'loaded';
  const hasCurrentPublication = publicationStatusReady && currentPublication !== null;
  const isPublished = publication !== null || hasCurrentPublication;
  const reviewedDraftDiffers = hasCurrentPublication
    && previewApproval?.approvedInputFingerprint !== undefined
    && previewApproval.approvedInputFingerprint !== currentPublication.pointer.inputFingerprint;
  const showPublishControls = !isPublished || reviewedDraftDiffers;
  const selectedMode = mode ?? 'full';
  const componentReadyToPublish = previewQualification !== null
    && previewQualification.units.every((unit) => componentApprovals[unit.unitKey] !== undefined);
  const approvedComponentUnitKeys = previewQualification?.units
    .filter((unit) => componentApprovals[unit.unitKey] !== undefined)
    .map((unit) => unit.unitKey) ?? [];
  const visibleSlots = selectedMode === 'full' ? slots.slice(0, 1) : slots;
  const componentSelectionMatchesBinding = combinedBinding !== null
    && combinedBinding.inputManifest.length === visibleSlots.length
    && visibleSlots.every((slot, index) => {
      const selection = slot.selection;
      const manifestEntry = combinedBinding.inputManifest[index];
      return selection !== null
        && manifestEntry?.componentIndex === index
        && manifestEntry.sha256Hex === selection.claim.sha256Hex
        && manifestEntry.byteSize === selection.file.size
        && manifestEntry.pageCount === selection.claim.physicalPageCount;
    });
  const verifiedSlots = visibleSlots.filter((slot) => slot.uploadState?.phase === 'verified');
  const candidateSourceIds = new Set(persistedSourceSet?.sources.map((source) => source.sourceVersionId) ?? []);
  const persistedStrategyMatches = persistedSourceSet?.sourceStrategy
    === (selectedMode === 'full' ? 'full_pdf' : 'component_pdfs');
  const persistedSourceReady = persistedStrategyMatches
    && (selectedMode === 'full' ? candidateSourceIds.size === 1 : candidateSourceIds.size >= 2)
    && [...candidateSourceIds].every((sourceVersionId) => assemblySourceVersions.some((source) => source.sourceVersionId === sourceVersionId && source.verifiedUsable));
  const sourceReady = replacingSourceId === null && (selectedMode === 'full'
    ? verifiedSlots.length === 1 || persistedSourceReady
    : ((verifiedSlots.length >= 2 && verifiedSlots.length === visibleSlots.length && componentSelectionMatchesBinding) || persistedSourceReady));
  const sourceDirty = combinedFiles.length > 0 || slots.some((slot) => slot.selection !== null || slot.uploadState !== null);

  useEffect(() => {
    setEffectiveAssemblyBookRevision((current) => Math.max(current, assemblyBookRevision));
    setEffectiveAssemblySourceSetRevision((current) => Math.max(current, assemblySourceSetRevision));
    setFullAttachmentOperationId(null);
  }, [assemblyBookRevision, assemblySourceSetRevision]);

  const updateAuthorityRevisions = (revisions: {
    readonly bookRevision: number;
    readonly sourceSetRevision: number;
  }) => {
    setEffectiveAssemblyBookRevision((current) => Math.max(current, revisions.bookRevision));
    setEffectiveAssemblySourceSetRevision((current) => Math.max(current, revisions.sourceSetRevision));
  };
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
    () => visibleSlots.map(sourceProjection).filter((source): source is LocalSourceVersionProjection => source !== null),
    [visibleSlots],
  );
  const sourceVersions = useMemo(() => {
    const byId = new Map(assemblySourceVersions.map((source) => [source.sourceVersionId, source]));
    localSources.forEach((source) => byId.set(source.sourceVersionId, source));
    const persistedIdsForMode = persistedSourceSet?.sourceStrategy
      === (selectedMode === 'full' ? 'full_pdf' : 'component_pdfs')
      ? candidateSourceIds
      : new Set<string>();
    const relevantIds = new Set([...persistedIdsForMode, ...localSources.map((source) => source.sourceVersionId)]);
    return [...byId.values()].filter((source) => relevantIds.has(source.sourceVersionId));
  }, [assemblySourceVersions, candidateSourceIds, localSources, persistedSourceSet, selectedMode]);

  useEffect(() => {
    onDirtyChange?.(sourceDirty || assemblyDirty);
  }, [assemblyDirty, onDirtyChange, sourceDirty]);

  useEffect(() => {
    if (!candidate || !previewApproval) return;
    if (previewApproval.approvedInputFingerprint && previewProjection
      && (previewProjection.candidateId !== candidate.candidateId
        || previewProjection.candidateRevision !== candidate.revision)) {
      setPreviewProjection(null);
      setPreviewApproval(null);
    }
  }, [candidate, previewApproval, previewProjection]);

  useEffect(() => {
    setPublicationOperationId(null);
    setPreviewProjection(null);
    setPreviewApproval(null);
    setComponentPreviewInput(null);
    setPreviewQualification(null);
    setComponentApprovals({});
  }, [candidate?.candidateId, candidate?.revision]);

  useEffect(() => {
    setPreviewProjection(null);
    setPreviewApproval(null);
    setComponentPreviewInput(null);
  }, [previewUnitKey]);

  const track = (action: string, metadata?: Record<string, unknown>) => {
    onTrackAction?.(action, { bookId, mode, step, ...metadata });
  };

  const resetCombinedOutput = () => {
    if (fullAttachmentBusy) return;
    combinedControllerRef.current?.abort();
    combinedControllerRef.current = null;
    setCombinedResult(null);
    setCombinedDocumentSelection(null);
    setCombinedDocumentUploadState(null);
    setCombinedBinding(null);
    setCombinedError('');
    setCombinedPhase('files');
    setPreviewProjection(null);
    setPreviewApproval(null);
    setPublication(null);
    setPublicationOperationId(null);
  };

  const chooseMode = (next: PdfFlowMode) => {
    if (fullAttachmentBusy) return;
    resetCombinedOutput();
    setMode(next);
    setStep(1);
    setAssemblyStep('outline');
    setSlots((current) => next === 'full'
      ? (current.length > 0 && current[0]?.id === 'full-1' ? current.slice(0, 1) : [slotFor('full', 0)])
      : (current.some((slot) => slot.sourceKey.startsWith('component-')) ? current : []));
    setPublicationOperationId(null);
    setPublishConfirmOpen(false);
    setCombinedBinding(null);
    setFullAttachmentOperationId(null);
    track('teacher_materials_book_pdf_mode_selected', { nextMode: next });
  };

  const requestSetupChange = () => {
    if (fullAttachmentBusy) return;
    setMigrationOpen(true);
    track('teacher_materials_book_assembly_strategy_migration_requested', { fromMode: selectedMode });
  };

  const requestSourceReplacement = (slot: SourceSlot) => {
    if (fullAttachmentBusy) return;
    updateSlot(slot.id, { selection: null, uploadState: null });
    setReplacementReview(null);
    setReplacementError('');
    setReplacementOperationId(null);
    setReplacingSourceId(slot.id);
    setCombinedBinding(null);
    setPublicationOperationId(null);
    if (slot.sourceKey === 'full') setFullAttachmentOperationId(null);
    track('teacher_materials_book_pdf_source_replacement_requested', { sourceKey: slot.sourceKey });
  };

  const confirmSetupChange = async () => {
    if (fullAttachmentBusy) return;
    const nextMode: PdfFlowMode = selectedMode === 'full' ? 'component' : 'full';
    if (!candidate || !candidate.manifest || !assemblyMigrationClient) {
      if (candidate) {
        toast.warning('Setup changes are unavailable until the trusted migration service is configured. Your current Book is unchanged.');
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
        toast.warning('Add and verify the PDF needed for the new setup before changing the Book.');
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
        toast.warning('Add and verify at least two component PDFs before changing the Book.');
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
        expectedBookRevision: effectiveAssemblyBookRevision,
        expectedSourceSetRevision: effectiveAssemblySourceSetRevision,
        expectedCandidateRevision: candidate.revision,
        targetSourceSetRevision: effectiveAssemblySourceSetRevision + 1,
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
      toast.success('Your reviewed setup change is ready. The original Book remains safe.');
      track('teacher_materials_book_assembly_strategy_migration_confirmed', { fromMode: selectedMode, toMode: nextMode, status: 'confirmed' });
    } catch (error) {
      toast.error(actionableFailureToast(error, 'Setup change could not be prepared. Retry; your current Book is unchanged.'));
      track('teacher_materials_book_assembly_strategy_migration_failed', { fromMode: selectedMode, toMode: nextMode });
    } finally {
      setMigrationBusy(false);
    }
  };

  const updateSlot = (id: string, update: Partial<SourceSlot>) => {
    setSlots((current) => current.map((slot) => slot.id === id ? { ...slot, ...update } : slot));
  };

  const combinedErrorMessage = (error: unknown): string => {
    if (error instanceof ComponentPdfCompositionError) {
      if (error.code === 'too_many_components') return 'Choose no more than 20 PDFs.';
      if (error.code === 'aggregate_too_large') return 'Choose PDFs whose combined input is no larger than 50 MiB.';
      if (error.code === 'too_many_pages') return 'Choose PDFs with no more than 500 pages in total.';
      if (error.code === 'output_too_large') return 'The combined PDF is larger than the 100 MiB output limit.';
      if (error.code === 'timeout') return 'Combining the PDFs took too long. Your selection is still available to retry.';
      if (error.code === 'cancelled') return 'PDF combine canceled. Your selection is still here.';
      if (error.code === 'encrypted_pdf') return 'Encrypted PDFs cannot be combined.';
      if (error.code === 'not_pdf' || error.code === 'invalid_pdf' || error.code === 'unsupported_pdf') return 'One selected file is not a supported readable PDF.';
    }
    if (error instanceof SourcePdfInspectionError) {
      if (error.code === 'file_too_large') return 'Choose PDFs within the accepted source-file limit.';
      if (error.code === 'invalid_filename') return 'One selected PDF has an unsafe filename.';
      if (error.code === 'not_pdf' || error.code === 'empty_pdf' || error.code === 'unreadable') return 'One selected file is not a readable PDF.';
    }
    return 'The PDFs could not be combined. Your selection is still available to retry.';
  };

  const cancelCombinedWork = () => {
    if (combinedControllerRef.current === null) return;
    combinedControllerRef.current.abort();
    combinedControllerRef.current = null;
    setCombinedPhase('files');
    setCombinedError('');
    toast.info('PDF combine canceled. Your selection is still here.');
    track('teacher_materials_book_pdf_combine_canceled');
  };

  const combinedInspectionFailure = (file: File, error: unknown) => {
    const errorCode = error instanceof SourcePdfInspectionError
      ? error.code
      : typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    const errorCause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
    const errorReason = errorCode === 'file_too_large'
      ? 'file is too large'
      : errorCode === 'invalid_filename'
        ? 'filename is not allowed'
        : errorCode === 'not_pdf'
          ? 'file is not a PDF'
          : errorCode === 'empty_pdf'
            ? 'PDF has no pages'
            : errorCode === 'unreadable'
              ? 'PDF could not be read in this browser'
              : 'PDF could not be checked';
    return {
      errorCode,
      errorCause,
      errorReason: `${file.name} — ${errorReason}${errorCode ? ` (${errorCode})` : ''}`,
    };
  };

  const inspectCombinedFileBatch = (
    files: readonly File[],
    append: boolean,
    retrySelectionId?: number,
  ) => {
    if (files.length === 0) return;
    const inspections = files.map((file) => ({
      file,
      selectionId: append
        ? ++combinedSelectionIdRef.current
        : retrySelectionId!,
      inspectionGeneration: ++combinedInspectionGenerationRef.current,
    }));
    inspections.forEach(({ selectionId, inspectionGeneration }) => {
      combinedInspectionGenerationBySelectionRef.current.set(selectionId, inspectionGeneration);
    });
    if (append) {
      setCombinedFiles((current) => [...current, ...inspections.map(({ file, selectionId, inspectionGeneration }) => ({
        selectionId,
        file,
        inspectionGeneration,
        status: 'checking' as const,
        claim: null,
      }))]);
      resetCombinedOutput();
      track('teacher_materials_book_pdf_combine_files_selected', { count: files.length });
    } else {
      setCombinedFiles((current) => current.map((entry) => entry.selectionId === retrySelectionId
        ? { ...entry, inspectionGeneration: inspections[0]!.inspectionGeneration, status: 'checking' as const, claim: null, duplicateDecision: undefined }
        : entry));
      track('book_source_pdf_inspection_retried');
    }

    void Promise.all(inspections.map(async ({ file, selectionId, inspectionGeneration }) => {
      const previousController = combinedInspectionControllersRef.current.get(selectionId);
      previousController?.abort();
      const controller = new AbortController();
      combinedInspectionControllersRef.current.set(selectionId, controller);
      const isCurrent = () => combinedMountedRef.current
        && combinedInspectionGenerationBySelectionRef.current.get(selectionId) === inspectionGeneration
        && !controller.signal.aborted;
      try {
        const claim = await inspectSourcePdf(file, { signal: controller.signal });
        if (!isCurrent()) return { file, failed: false, applied: false };
        setCombinedFiles((current) => current.map((entry) => entry.selectionId === selectionId
          && entry.inspectionGeneration === inspectionGeneration
          ? { ...entry, status: 'ready' as const, claim, duplicateDecision: undefined }
          : entry));
        return { file, failed: false, applied: true };
      } catch (error) {
        if (!isCurrent()) return { file, failed: false, applied: false };
        const failure = combinedInspectionFailure(file, error);
        setCombinedFiles((current) => current.map((entry) => entry.selectionId === selectionId
          && entry.inspectionGeneration === inspectionGeneration
          ? { ...entry, status: 'failed' as const, claim: null, duplicateDecision: undefined, ...failure }
          : entry));
        track('book_source_pdf_inspection_failed', {
          code: failure.errorCode,
          cause: failure.errorCause,
        });
        return { file, failed: true, applied: true };
      } finally {
        if (combinedInspectionControllersRef.current.get(selectionId) === controller) {
          combinedInspectionControllersRef.current.delete(selectionId);
        }
      }
    })).then((results) => {
      if (!combinedMountedRef.current || results.some((result) => !result.applied)) return;
      const failedCount = results.filter((result) => result.failed).length;
      const readyCount = results.length - failedCount;
      toast[failedCount > 0 ? 'warning' : 'success'](
        failedCount > 0
          ? `${readyCount} PDF${readyCount === 1 ? '' : 's'} checked; review ${failedCount} failed file${failedCount === 1 ? '' : 's'}.`
          : `${readyCount} PDF${readyCount === 1 ? '' : 's'} checked. Review the order before combining.`,
      );
      track('teacher_materials_book_pdf_combine_files_checked', { count: results.length, readyCount, failedCount });
    });
  };

  const inspectCombinedFiles = (fileList: FileList | null) => {
    setIsPickerOpening(false);
    if (fullAttachmentBusy) return;
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    if (combinedFiles.length + files.length > MAX_COMPONENT_PDFS) {
      toast.warning(`You can add up to ${MAX_COMPONENT_PDFS} component PDFs. Remove a PDF before adding this batch.`);
      track('teacher_materials_book_pdf_combine_selection_rejected', {
        count: files.length,
        currentCount: combinedFiles.length,
      });
      return;
    }
    inspectCombinedFileBatch(files, true);
  };

  const retryCombinedFile = (index: number) => {
    if (fullAttachmentBusy) return;
    const entry = combinedFiles[index];
    if (!entry || entry.status !== 'failed') return;
    resetCombinedOutput();
    inspectCombinedFileBatch([entry.file], false, entry.selectionId);
  };

  const reorderCombinedFile = (index: number, direction: -1 | 1) => {
    if (fullAttachmentBusy) return;
    setCombinedFiles((current) => {
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    resetCombinedOutput();
    track('teacher_materials_book_pdf_combine_order_changed', { index, direction });
  };

  const removeCombinedFile = (index: number) => {
    if (fullAttachmentBusy) return;
    const entry = combinedFiles[index];
    if (entry) {
      combinedInspectionControllersRef.current.get(entry.selectionId)?.abort();
      combinedInspectionControllersRef.current.delete(entry.selectionId);
      combinedInspectionGenerationBySelectionRef.current.delete(entry.selectionId);
    }
    setCombinedFiles((current) => current.filter((_, entryIndex) => entryIndex !== index));
    resetCombinedOutput();
    track('teacher_materials_book_pdf_combine_file_removed', { index });
  };

  const combineSelectedPdfs = () => {
    if (fullAttachmentBusy) return;
    if (combinedFiles.length < 2 || combinedFiles.some((entry) => entry.status !== 'ready' || entry.claim === null)) return;
    if (combinedFiles.some((entry, index) => duplicateOfIndex(combinedFiles, index) !== null && entry.duplicateDecision !== 'keep')) {
      toast.warning('Choose Keep both or Remove duplicate for every duplicate PDF before combining.');
      return;
    }
    combinedControllerRef.current?.abort();
    const controller = new AbortController();
    combinedControllerRef.current = controller;
    setCombinedError('');
    setCombinedPhase('combining');
    track('teacher_materials_book_pdf_combine_started', { count: combinedFiles.length });
    void composeComponentPdfs(combinedFiles.map((entry) => entry.file), {
      signal: controller.signal,
      outputFilename: `${title.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '') || 'book'}-combined.pdf`,
    }).then(async (result) => {
      if (!combinedMountedRef.current || controller.signal.aborted || combinedControllerRef.current !== controller) return;
      const claim = await inspectSourcePdf(result.file, { signal: controller.signal, purpose: 'student-document' });
      if (!combinedMountedRef.current || controller.signal.aborted || combinedControllerRef.current !== controller) return;
      if (claim.sha256Hex !== result.sha256Hex
        || claim.exactByteSize !== result.file.size
        || claim.physicalPageCount !== result.mapping.reduce((total, entry) => total + entry.pageCount, 0)) {
        throw new Error('combined_pdf_inspection_mismatch');
      }
      combinedControllerRef.current = null;
      setCombinedDocumentSelection({ file: result.file, claim });
      setCombinedResult(result);
      setCombinedPhase('preview');
      toast.success('Combined PDF is ready to preview.');
      track('teacher_materials_book_pdf_combine_completed', { count: result.mapping.length });
    }).catch((error: unknown) => {
      if (!combinedMountedRef.current || controller.signal.aborted || combinedControllerRef.current !== controller) return;
      const message = combinedErrorMessage(error);
      combinedControllerRef.current = null;
      setCombinedError(message);
      setCombinedPhase('files');
      toast.error(message);
      track('teacher_materials_book_pdf_combine_failed');
    });
  };

  const useCombinedPdf = () => {
    if (fullAttachmentBusy) return;
    if (!combinedResult || !combinedDocumentSelection
      || combinedDocumentSelection.file !== combinedResult.file
      || !isSourcePdfInspectionClaimForFile(combinedDocumentSelection.claim, combinedResult.file)) return;
    const selections = combinedFiles
      .filter((entry): entry is CombinedPdfSelection & { claim: SourcePdfInspectionClaim } => entry.status === 'ready' && entry.claim !== null)
      .map((entry) => ({ file: entry.file, claim: entry.claim } satisfies SourceUploadSelection));
    if (selections.length < 2) return;
    const inputManifestMatches = combinedResult.inputManifest.length === selections.length
      && combinedResult.inputManifest.every((entry, index) => {
        const selection = selections[index];
        return entry.componentIndex === index
          && entry.sha256Hex === selection?.claim.sha256Hex
          && entry.byteSize === selection?.file.size
          && entry.pageCount === selection?.claim.physicalPageCount;
      });
    if (!inputManifestMatches || selections.some((selection) => !isSourcePdfInspectionClaimForFile(selection.claim, selection.file))) {
      resetCombinedOutput();
      toast.error('The combined PDF no longer matches the selected files. Combine the current selection again.');
      return;
    }
    setCombinedError('');
    setCombinedBinding({ outputSha256Hex: combinedResult.sha256Hex, inputManifest: combinedResult.inputManifest });
    setSlots(selections.map((selection, index) => ({ ...slotFor('component', index), selection })));
    setMode('component');
    setStep(1);
    setAssemblyStep('outline');
    setReplacingSourceId(null);
    setPreviewProjection(null);
    setPreviewApproval(null);
    setPublication(null);
    setPublicationOperationId(null);
    setCombinedResult(null);
    setCombinedPhase('files');
    track('teacher_materials_book_pdf_combine_handed_off_to_upload', {
      count: selections.length,
    });
  };

  const keepCombinedDuplicate = (selectionId: number) => {
    setCombinedFiles((current) => current.map((entry) => entry.selectionId === selectionId
      ? { ...entry, duplicateDecision: 'keep' as const }
      : entry));
    track('teacher_materials_book_pdf_combine_duplicate_kept');
  };

  const renderCombinedPdfFlow = () => {
    const hasUnresolvedDuplicate = combinedFiles.some((entry, index) => (
      duplicateOfIndex(combinedFiles, index) !== null && entry.duplicateDecision !== 'keep'
    ));
    const canCombine = combinedFiles.length >= 2
      && combinedFiles.every((entry) => entry.status === 'ready' && entry.claim !== null)
      && !hasUnresolvedDuplicate
      && combinedPhase === 'files';
    if (combinedPhase === 'preview' && combinedResult) {
      return (
        <FlowSurface>
          <div className="pbf-row">
            <div>
              <h3>Combined PDF preview</h3>
              <p className="pbf-muted">Preview the ordered PDF, then use it as the Book PDF through the existing checked upload and draft workflow.</p>
            </div>
            <span className="pbf-status is-good">Ready</span>
          </div>
          {combinedPreviewUrl && (
            <iframe
              title="Combined PDF preview"
              src={combinedPreviewUrl}
              style={{ width: '100%', minHeight: 520, border: '1px solid #abb3b7', marginTop: 14 }}
            />
          )}
          <ol className="pbf-checklist" aria-label="Combined PDF component ranges" style={{ marginTop: 14 }}>
            {combinedResult.mapping.map((entry) => <li key={`${entry.componentIndex}-${entry.fileName}`}>{entry.fileName}: pages {entry.startPage}–{entry.endPage} ({entry.pageCount} pages)</li>)}
          </ol>
          {combinedError && <p className="pbf-callout is-danger" role="alert" style={{ marginTop: 14 }}>{combinedError}</p>}
          <div className="pbf-actions" style={{ marginTop: 14 }}>
            <button type="button" className="pbf-button" disabled={fullAttachmentBusy} onClick={() => { resetCombinedOutput(); track('teacher_materials_book_pdf_combine_back_to_files'); }}>Back to files</button>
            <button type="button" className="pbf-button pbf-button-primary" disabled={fullAttachmentBusy} onClick={useCombinedPdf}>
              Use these PDFs
            </button>
          </div>
        </FlowSurface>
      );
    }
    return (
      <FlowSurface>
        <div className="pbf-row">
          <div>
            <h3>Combine PDFs for a single preview</h3>
            <p className="pbf-muted">Add files in order, combine them for a derived preview, then keep each checked source in the existing component assembly workflow.</p>
          </div>
          <span className="pbf-status">Required</span>
        </div>
        <input
          ref={combinedInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          aria-label="Choose PDFs to combine"
          disabled={fullAttachmentBusy}
          onChange={(event) => {
            inspectCombinedFiles(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        />
        <div className="pbf-actions" style={{ marginTop: 14 }}>
          <button type="button" className="pbf-button" onClick={() => {
            if (fullAttachmentBusy) return;
            setIsPickerOpening(true);
            combinedInputRef.current?.click();
            setTimeout(() => setIsPickerOpening(false), 0);
          }} disabled={isPickerOpening || fullAttachmentBusy}>Add PDFs</button>
          {combinedPhase === 'combining' && <button type="button" className="pbf-button" onClick={cancelCombinedWork}>Cancel</button>}
        </div>
        {combinedFiles.some((entry) => entry.status === 'checking') && <p className="pbf-callout" role="status" aria-busy="true" style={{ marginTop: 14 }}>Checking selected PDFs in your browser…</p>}
        {combinedPhase === 'combining' && <p className="pbf-callout" role="status" aria-busy="true" style={{ marginTop: 14 }}>Combining PDFs in your browser…</p>}
        {combinedFiles.length === 1 && <p className="pbf-callout is-warn" role="status" style={{ marginTop: 14 }}>Add at least one more PDF, or choose One complete PDF.</p>}
        {combinedFiles.length > 0 && (
          <ol aria-label="Selected PDFs" style={{ marginTop: 14 }}>
            {combinedFiles.map((entry, index) => (
              <li key={entry.selectionId} style={{ marginBottom: 10 }}>
                <div className="pbf-row">
                  <span>
                    <strong>{entry.file.name}</strong> · {entry.status === 'ready' && entry.claim
                      ? `${entry.claim.physicalPageCount} pages`
                      : entry.status === 'checking'
                        ? 'Checking…'
                        : `Failed: ${entry.errorReason ?? `${entry.file.name} — PDF could not be checked`}`}
                  </span>
                  <span className="pbf-actions">
                    <button type="button" className="pbf-button" aria-label={`Move ${entry.file.name} up`} onClick={() => reorderCombinedFile(index, -1)} disabled={index === 0 || combinedPhase !== 'files'}>Move up</button>
                    <button type="button" className="pbf-button" aria-label={`Move ${entry.file.name} down`} onClick={() => reorderCombinedFile(index, 1)} disabled={index === combinedFiles.length - 1 || combinedPhase !== 'files'}>Move down</button>
                    {entry.status === 'failed' && <button type="button" className="pbf-button" aria-label={`Retry ${entry.file.name}`} onClick={() => retryCombinedFile(index)} disabled={combinedPhase !== 'files'}>Retry</button>}
                    <button type="button" className="pbf-button" aria-label={`Remove ${entry.file.name}`} onClick={() => removeCombinedFile(index)} disabled={combinedPhase !== 'files'}>Remove</button>
                  </span>
                </div>
                {duplicateOfIndex(combinedFiles, index) !== null && (
                  <div className="pbf-callout is-warn" role="status" style={{ marginTop: 8 }}>
                    <strong>Duplicate PDF bytes detected.</strong>
                    <span>{entry.file.name} has the same bytes as {combinedFiles[duplicateOfIndex(combinedFiles, index)!].file.name}. Choose whether to keep both files or remove this copy.</span>
                    <div className="pbf-actions" style={{ marginTop: 8 }}>
                      <button type="button" className="pbf-button" onClick={() => keepCombinedDuplicate(entry.selectionId)} disabled={entry.duplicateDecision === 'keep'}>Keep both</button>
                      <button type="button" className="pbf-button" onClick={() => removeCombinedFile(index)}>Remove duplicate</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {combinedError && <p className="pbf-callout is-danger" role="alert" style={{ marginTop: 14 }}>{combinedError}</p>}
        <div className="pbf-actions" style={{ marginTop: 14 }}>
          <button type="button" className="pbf-button pbf-button-primary" onClick={combineSelectedPdfs} disabled={fullAttachmentBusy || !canCombine}>Combine and preview</button>
        </div>
      </FlowSurface>
    );
  };

  const workflowFor = (sourceKey: string) => uploadWorkflowForSource?.(sourceKey) ?? uploadWorkflow;
  const beginUpload = (slot: SourceSlot, selection: SourceUploadSelection) => {
    if (fullAttachmentBusy) return;
    updateSlot(slot.id, { selection });
    if (slot.sourceKey === 'full') setFullAttachmentOperationId(null);
    track('teacher_materials_book_pdf_source_verified', {
      sourceKey: slot.sourceKey,
      physicalPageCount: selection.claim.physicalPageCount,
    });
  };

  const onUploadState = (slot: SourceSlot, state: SourceUploadSafeOperationState | null) => {
    updateSlot(slot.id, { uploadState: state });
    if (state?.phase === 'verified') {
      setReplacingSourceId((current) => current === slot.id ? null : current);
      if (replacingSourceId === slot.id && persistedSourceSet) {
        const oldSource = persistedSourceSet.sources.find((source) => source.sourceKey === slot.sourceKey);
        const oldVersion = oldSource && assemblySourceVersions.find((source) => source.sourceVersionId === oldSource.sourceVersionId);
        const groups = candidate?.manifest?.units.flatMap((unit) => unit.pageGroups)
          .filter((group) => group.sourceKey === slot.sourceKey) ?? [];
        const activityKeys = new Set(groups.flatMap((group) => group.activityKeys));
        if (oldSource && oldVersion) {
          setReplacementReview({
            slotId: slot.id,
            sourceKey: slot.sourceKey,
            sourceVersionId: state.sourceVersionId,
            displayFilename: state.displayFilename,
            oldPageCount: oldVersion.physicalPageCount,
            newPageCount: slot.selection?.claim.physicalPageCount ?? 0,
            pageGroupCount: groups.length,
            activityCount: activityKeys.size,
          });
          setReplacementError('');
        }
      }
      onDirtyChange?.(true);
      track('teacher_materials_book_pdf_source_upload_verified', {
        sourceKey: slot.sourceKey,
        status: state.phase,
      });
    }
  };

  const cancelReplacementReview = () => {
    setReplacementReview(null);
    setReplacementError('');
    setReplacementOperationId(null);
    toast.info('PDF replacement canceled. The verified file is still available to review.');
    track('teacher_materials_book_pdf_source_replacement_canceled');
  };

  const applySourceReplacement = async () => {
    if (!replacementReview || !candidate?.manifest || !persistedSourceSet || replacementBusy) return;
    if (!sourceSetAttachmentClient) {
      setReplacementError('PDF replacement is unavailable until the trusted source service is configured.');
      toast.error('PDF replacement is unavailable. The current Book remains unchanged.');
      return;
    }
    const nextSourceSet: SourceSetCandidate = {
      ...persistedSourceSet,
      sources: persistedSourceSet.sources.map((source) => source.sourceKey === replacementReview.sourceKey
        ? { ...source, sourceVersionId: replacementReview.sourceVersionId }
        : source),
    } as unknown as SourceSetCandidate;
    const operationId = replacementOperationId
      ?? globalThis.crypto?.randomUUID?.()
      ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
    setReplacementOperationId(operationId);
    setReplacementBusy(true);
    setReplacementError('');
    try {
      const attached = await sourceSetAttachmentClient.attachSourceSet({
        bookId,
        operationId,
        expectedBookRevision: effectiveAssemblyBookRevision,
        expectedSourceSetRevision: effectiveAssemblySourceSetRevision,
        sourceSet: nextSourceSet,
      });
      updateAuthorityRevisions(attached);
      let result: BookAssemblyMutationResult;
      if (selectedMode === 'component') {
        if (!assemblyMigrationClient?.rebase) throw new Error('rebase_unavailable');
        result = await assemblyMigrationClient.rebase({
          operationId,
          bookId,
          unitKey: candidate.unitKey,
          candidateId: candidate.candidateId,
          expectedBookRevision: attached.bookRevision,
          expectedSourceSetRevision: attached.sourceSetRevision,
          expectedCandidateRevision: candidate.revision,
        });
      } else {
        if (!assemblyRepository) throw new Error('assembly_replace_unavailable');
        result = await assemblyRepository.replace({
          operationId,
          bookId,
          unitKey: candidate.unitKey,
          candidateId: candidate.candidateId,
          expectedBookRevision: attached.bookRevision,
          expectedSourceSetRevision: attached.sourceSetRevision,
          expectedCandidateRevision: candidate.revision,
          manifest: { ...candidate.manifest, sourceSet: attached.sourceSet },
        });
      }
      if (result.status === 'conflict' || result.status === 'idempotency-conflict') {
        throw Object.assign(new Error('replacement_conflict'), { status: 409 });
      }
      if (!result.candidate) throw new Error('replacement_candidate_missing');
      setCandidate(result.candidate);
      setEffectiveAssemblyBookRevision(result.candidate.bookRevision);
      setEffectiveAssemblySourceSetRevision(result.candidate.sourceSetRevision);
      setReplacementReview(null);
      setReplacementOperationId(null);
      setReplacementError('');
      onDirtyChange?.(false);
      toast.success('PDF replaced. Review the updated Book before publishing.');
      track('teacher_materials_book_pdf_source_replaced', { sourceKey: replacementReview.sourceKey });
    } catch (error) {
      const conflict = typeof error === 'object' && error !== null && 'status' in error && error.status === 409;
      setReplacementError(conflict ? 'This book changed; review again.' : 'PDF replacement did not finish. Your file is still here; try again.');
      if (conflict) {
        setReplacementOperationId(null);
        toast.warning('This book changed; review again.');
      } else {
        toast.error('PDF replacement did not finish. Your file is still here; try again.');
      }
      track('teacher_materials_book_pdf_source_replacement_failed', { conflict });
    } finally {
      setReplacementBusy(false);
    }
  };

  const setFlowStep = (nextStep: PdfFlowStep) => {
    setStep(nextStep);
    if (nextStep === 2) setAssemblyStep('outline');
    if (nextStep === 3) setAssemblyStep('pages');
    if (nextStep === 4) setAssemblyStep('review');
  };

  useEffect(() => {
    if (!focusedEditing || !editingSection || !mode) return;
    if (editingSection === 'pdf-files') {
      setStep(1);
      return;
    }
    if (editingSection === 'content-tree' || editingSection === 'activity-json') {
      setStep(2);
      setAssemblyStep('outline');
      return;
    }
    setStep(4);
    setAssemblyStep('review');
  }, [editingSection, focusedEditing, mode]);

  const continueFromFiles = async () => {
    if (fullAttachmentBusy) return;
    if (!sourceReady) {
      toast.warning(selectedMode === 'full' ? 'Verify and upload the Book PDF before continuing.' : 'Verify and upload every component PDF before continuing.');
      return;
    }
    if (selectedMode === 'full') {
      if (!sourceSetAttachmentClient) {
        toast.error('The Book PDF is ready, but the trusted attachment service is unavailable.');
        track('book_source_upload_failed', { reason: 'attachment_service_unavailable' });
        return;
      }
      const source = localSources.find((candidate) => candidate.sourceKey === 'full')
        ?? (persistedSourceSet?.sourceStrategy === 'full_pdf' ? persistedSourceSet.sources[0] : undefined);
      if (!source) {
        toast.error('The Book PDF could not be bound to this Book. Verify the file again.');
        track('book_source_upload_failed', { reason: 'attachment_source_unavailable' });
        return;
      }
      const operationId = fullAttachmentOperationId
        ?? globalThis.crypto?.randomUUID?.()
        ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
      setFullAttachmentOperationId(operationId);
      setFullAttachmentBusy(true);
      try {
        const attached = await sourceSetAttachmentClient.attachSourceSet({
          bookId,
          operationId,
          expectedBookRevision: effectiveAssemblyBookRevision,
          expectedSourceSetRevision: effectiveAssemblySourceSetRevision,
          sourceSet: {
            sourceStrategy: 'full_pdf',
            sources: [{
              sourceKey: source.sourceKey,
              sourceVersionId: source.sourceVersionId,
              sourceOrder: 1,
            }],
          },
        });
        updateAuthorityRevisions(attached);
        setFullAttachmentOperationId(null);
        setFlowStep(2);
        track('teacher_materials_book_pdf_workflow_step_changed', { nextStep: 2, attachmentStatus: attached.status });
      } catch (error) {
        if (isConflictFailure(error)) setFullAttachmentOperationId(null);
        toast.error(actionableFailureToast(error, 'The Book PDF could not be attached. Retry.'));
        track('book_source_upload_failed', { reason: 'attachment_failed' });
      } finally {
        setFullAttachmentBusy(false);
      }
      return;
    }
    const combinedWorkflow = workflowFor('student-document');
    if (!combinedWorkflow) {
      toast.error('The combined PDF upload service is unavailable.');
      return;
    }
    setFullAttachmentBusy(true);
    try {
      if (persistedSourceSet?.sourceStrategy === 'component_pdfs'
        && effectiveAssemblyBookRevision === 0 && effectiveAssemblySourceSetRevision === 0) {
        const recoveredSlots = await Promise.all(visibleSlots.map(async (slot) => {
          const source = persistedSourceSet.sources.find((entry) => entry.sourceKey === slot.sourceKey);
          const recovered = slot.uploadState?.phase === 'verified' ? slot.uploadState
            : await workflowFor(slot.sourceKey)?.load(bookId);
          if (!source || recovered?.phase !== 'verified' || recovered.bookId !== bookId
            || recovered.sourceKey !== source.sourceKey || recovered.sourceVersionId !== source.sourceVersionId
            || (recovered.purpose ?? 'book-source') !== 'book-source') {
            throw new Error('component_pdf_upload_recovery_mismatch');
          }
          return { ...slot, uploadState: recovered };
        }));
        setSlots(recoveredSlots);
      }
      let state = combinedDocumentUploadState;
      if (!state) {
        const recovered = await combinedWorkflow.load(bookId);
        if (recovered?.phase === 'verified' && recovered.sourceKey === 'student-document') state = recovered;
      }
      if (!state || state.phase !== 'verified') {
        if (!combinedDocumentSelection) throw new Error('combined_pdf_file_required');
        state = (await combinedWorkflow.start({
          ...combinedDocumentSelection,
          bookId,
          sourceKey: 'student-document',
          kind: 'initial',
          purpose: 'student-document',
        })).state;
      }
      if (state.phase !== 'verified' || !state.reservationId) throw new Error('combined_pdf_upload_incomplete');
      await combinedWorkflow.decideStudentSafeSource?.(bookId);
      setCombinedDocumentUploadState(state);
      setFlowStep(2);
      track('teacher_materials_book_pdf_workflow_step_changed', { nextStep: 2 });
    } catch (error) {
      toast.error(actionableFailureToast(error, error instanceof Error && error.message === 'combined_pdf_file_required'
        ? 'Reselect the exact combined PDF to finish its upload.'
        : 'The combined PDF could not be prepared. Retry.'));
    } finally {
      setFullAttachmentBusy(false);
    }
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
  const activePreviewInput = componentPreviewInput ?? previewInput;
  const trustedRuntimePreview = useMemo(() => {
    const preview = previewProjection ?? assemblyCandidateRuntimePreview;
    const expected = activePreviewInput;
    if (!expected || !preview
      || preview.bookId !== bookId
      || preview.bookRevision !== effectiveAssemblyBookRevision
      || preview.candidateId !== expected.candidateId
      || preview.candidateRevision !== expected.expectedCandidateRevision
      || preview.sourceSetRevision !== effectiveAssemblySourceSetRevision
      || preview.unitKey !== expected.unitKey) {
      return null;
    }
    const identity = [
      preview.candidateId,
      preview.candidateRevision,
      preview.sourceSetRevision,
      preview.unitKey,
      preview.registryVersion,
    ].join(':');
    return dismissedPreviewIdentity === identity ? null : { identity, preview };
  }, [
    assemblyCandidateRuntimePreview,
    bookId,
    activePreviewInput,
    dismissedPreviewIdentity,
    effectiveAssemblyBookRevision,
    effectiveAssemblySourceSetRevision,
    previewProjection,
  ]);

  const requestPreview = async () => {
    if (!assemblyPreviewClient || !activePreviewInput) {
      toast.warning('Student preview is unavailable until the trusted preview Worker is configured.');
      return;
    }
    try {
      let input = activePreviewInput;
      if (focusedEditing && previewUnitKey && previewUnitKey !== input.unitKey) {
        const loaded = await assemblyRepository?.loadCurrent?.(bookId, previewUnitKey);
        if (!loaded?.candidate) throw new Error('unit_preview_unavailable');
        input = { bookId, unitKey: loaded.candidate.unitKey, candidateId: loaded.candidate.candidateId,
          expectedCandidateRevision: loaded.candidate.revision };
        setComponentPreviewInput(input);
      }
      const result = await assemblyPreviewClient.preview(input);
      setPreviewProjection(result.preview);
      if (result.qualification) {
        setPreviewQualification(result.qualification);
        const current = result.qualification.units.find((unit) => unit.unitKey === result.preview.unitKey);
        if (current) setComponentPreviewInput({ bookId, unitKey: current.unitKey, candidateId: current.candidateId,
          expectedCandidateRevision: current.candidateRevision });
      }
      setDismissedPreviewIdentity(null);
      setPreviewApproval(null);
      track('teacher_materials_book_assembly_candidate_preview_opened', { status: 'opened' });
    } catch (error) {
      toast.error(actionableFailureToast(error, 'Student preview could not be loaded. Retry.'));
    }
  };

  const approvePreview = async () => {
    if (!assemblyPreviewClient || !activePreviewInput || !previewProjection) {
      toast.warning('Open the trusted student preview before approving it.');
      return;
    }
    try {
      const result = await assemblyPreviewClient.approve({
        ...activePreviewInput,
        ...(previewQualification ? {
          expectedUnitInputFingerprint: previewInputFingerprint(previewProjection),
          expectedWholeActivationFingerprint: previewQualification.wholeActivationFingerprint,
        } : {}),
      });
      if (previewQualification) {
        const nextApprovals = { ...componentApprovals, [activePreviewInput.unitKey]: result.approval };
        setComponentApprovals(nextApprovals);
        const next = previewQualification.units.find((unit) => !nextApprovals[unit.unitKey]);
        setPreviewProjection(null);
        if (next) {
          onPreviewUnitChange?.(next.unitKey);
          setComponentPreviewInput({ bookId, unitKey: next.unitKey, candidateId: next.candidateId,
            expectedCandidateRevision: next.candidateRevision });
          toast.success(`Preview approved. Open ${next.unitKey} before publishing.`);
        } else {
          setPreviewApproval(result.approval);
          toast.success('Every Unit preview is approved. You can now publish this Book.');
        }
      } else {
        setPreviewApproval(result.approval);
        toast.success('Preview approved. You can now publish this draft.');
      }
      track('teacher_materials_book_assembly_candidate_preview_approved', { status: 'approved' });
    } catch (error) {
      toast.error(actionableFailureToast(error, 'Preview approval could not be saved. Retry.'));
    }
  };

  const refreshCurrentPublication = async (expectedReceipt = publication) => {
    if (!assemblyPreviewClient?.readCurrentPublication) {
      setPublicationRefreshStatus('error');
      toast.warning('Book published, but its current publication could not be refreshed. Close and reopen the editor to verify it.');
      return;
    }
    setPublicationRefreshStatus('pending');
    try {
      const refreshed = await assemblyPreviewClient.readCurrentPublication(bookId);
      if (!refreshed || (expectedReceipt && (
        refreshed.pointer.publicationId !== expectedReceipt.publicationId
        || refreshed.pointer.publicationRevision !== expectedReceipt.publicationRevision
        || refreshed.pointer.manifestVersionId !== expectedReceipt.manifestVersionId
      ))) {
        throw new Error('publication_not_current');
      }
      setCurrentPublication(refreshed);
      onCurrentPublicationChange?.(refreshed);
      setPublicationRefreshStatus('ready');
      toast.success('Book published. The current publication is now confirmed.');
    } catch {
      setPublicationRefreshStatus('error');
      toast.warning('Book published, but the current publication could not be refreshed. Retry the publication check before resubmitting.');
    }
  };

  const publish = async () => {
    if (publishBusy) return;
    if (!publicationStatusReady) {
      toast.warning('Current publication status is not verified. Retry the check or reopen the editor before publishing.');
      return;
    }
    if (!assemblyPreviewClient || !activePreviewInput || !previewApproval || !candidate) {
      toast.warning('Save and approve the trusted preview before publishing.');
      return;
    }
    const sourceWorkflow = workflowFor('full');
    if (selectedMode === 'full' && !sourceWorkflow?.decideStudentSafeSource) {
      toast.warning('The Book PDF cannot be confirmed for student access. Reopen the upload and retry.');
      track('teacher_materials_book_pdf_student_safe_decision', { status: 'unavailable' });
      return;
    }
    setPublishBusy(true);
    try {
      if (selectedMode === 'full') {
        await sourceWorkflow!.decideStudentSafeSource!(bookId);
        track('teacher_materials_book_pdf_student_safe_decision', { status: 'ready' });
      }
      const requestOperationId = publicationOperationId
        ?? globalThis.crypto?.randomUUID?.()
        ?? `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
      setPublicationOperationId(requestOperationId);
      const result = selectedMode === 'component' && previewQualification
        ? await assemblyPreviewClient.publishComponent({
          bookId, operationId: requestOperationId,
          expectedCurrentPublicationId: currentPublication?.pointer.publicationId ?? null,
          expectedBookRevision: candidate.bookRevision,
          expectedSourceSetRevision: candidate.sourceSetRevision,
          unitApprovals: previewQualification.units.map((unit) => {
            const approval = componentApprovals[unit.unitKey]!;
            return { ...unit, approvalId: approval.approvalId, approvalRevision: approval.approvalRevision,
              approvedAt: approval.approvedAt, expiresAt: approval.expiresAt };
          }),
        })
        : await assemblyPreviewClient.publishFull({
        ...activePreviewInput,
        operationId: requestOperationId,
        expectedCurrentPublicationId: currentPublication?.pointer.publicationId ?? null,
        expectedBookRevision: candidate.bookRevision,
        expectedSourceSetRevision: candidate.sourceSetRevision,
        previewApproval,
      });
      setPublication(result);
      setPublicationOperationId(null);
      setPublishConfirmOpen(false);
      toast.success('Book published. The trusted service returned a publication receipt.');
      onDirtyChange?.(false);
      track('teacher_materials_book_pdf_published', { status: 'published', publicationRevision: result.publicationRevision });
      void refreshCurrentPublication(result);
    } catch (error) {
      toast.error(actionableFailureToast(error, 'Publication failed. Retry; your draft is unchanged.'));
      track('teacher_materials_book_pdf_student_safe_decision', { status: 'failed' });
    } finally {
      setPublishBusy(false);
    }
  };

  const renderSourceCard = (slot: SourceSlot) => {
    const workflow = workflowFor(slot.sourceKey);
    const slotIndex = visibleSlots.findIndex((candidateSlot) => candidateSlot.id === slot.id);
    const persistedSource = persistedStrategyMatches
      ? persistedSourceSet?.sources[slotIndex]
      : undefined;
    const persistedVersion = persistedSource
      ? assemblySourceVersions.find((source) => source.sourceVersionId === persistedSource.sourceVersionId)
      : undefined;
    const replacing = replacingSourceId === slot.id;
    const verified = !replacing && (slot.uploadState?.phase === 'verified' || Boolean(persistedVersion?.verifiedUsable));
    const persistedReady = !replacing && !slot.uploadState && Boolean(persistedVersion?.verifiedUsable);
    const activeUpload = slot.selection !== null && workflow !== null && !persistedReady;
    const replacementReady = replacementReview?.slotId === slot.id;
    return (
      <section className="pbf-surface" key={slot.id} aria-labelledby={`${slot.id}-title`}>
        <div className="pbf-row">
          <div>
            <h3 id={`${slot.id}-title`}>{slot.label}</h3>
            {focusedEditing && verified
              ? <p className="pbf-muted">{persistedVersion?.physicalPageCount ?? slot.selection?.claim.physicalPageCount} pages</p>
              : !focusedEditing && <p className="pbf-muted">{verified ? `${slot.selection?.claim.displayFilename ?? 'PDF'} is ready privately.` : 'Check this file on your device before uploading.'}</p>}
          </div>
          {focusedEditing && verified
            ? <button type="button" className="pbf-button" disabled={fullAttachmentBusy} onClick={() => requestSourceReplacement(slot)}>Replace PDF</button>
            : <span className={`pbf-status${verified ? ' is-good' : ''}`}>{verified ? 'Ready' : 'Needs file'}</span>}
        </div>
        {activeUpload && workflow && !persistedReady ? (
          <div className="pbf-real-upload">
            <BookSourceUploadPanel
              allowFreshUpload={canEdit}
              bookId={bookId}
              guided
              instanceKey={`${slot.id}-upload`}
              uiVariant="mockup"
              sourceKey={slot.sourceKey}
              immutablePublished={replacing}
              onAction={onUploadAction}
              onStateChange={(state) => onUploadState(slot, state)}
              selection={slot.selection}
              workflow={workflow}
            />
          </div>
        ) : replacementReady ? (
          <div className="pbf-surface" style={{ marginTop: 14 }} aria-label="PDF replacement review">
            <div className="pbf-row">
              <div>
                <strong>Review this PDF replacement</strong>
                <p className="pbf-muted">{replacementReview.displayFilename} will become the new private source for this Book.</p>
              </div>
              <span className="pbf-status is-warn">Review needed</span>
            </div>
            <dl style={{ marginTop: 14 }}>
              <div><dt>Pages</dt><dd>{replacementReview.oldPageCount} → {replacementReview.newPageCount}</dd></div>
              <div><dt>Page connections to recheck</dt><dd>{replacementReview.pageGroupCount}</dd></div>
              <div><dt>Activities using this PDF</dt><dd>{replacementReview.activityCount}</dd></div>
            </dl>
            <p className="pbf-callout is-warn" role="status" style={{ marginTop: 14 }}>
              Nothing in the Book changes until you choose Replace. Your existing content stays in place while this is reviewed.
            </p>
            {replacementError && <p className="pbf-callout is-danger" role="alert" style={{ marginTop: 14 }}>{replacementError}</p>}
            <div className="pbf-actions" style={{ marginTop: 14 }}>
              <button type="button" className="pbf-button" onClick={cancelReplacementReview} disabled={replacementBusy}>Cancel</button>
              <button type="button" className="pbf-button pbf-button-primary" onClick={() => void applySourceReplacement()} disabled={replacementBusy}>
                {replacementBusy ? 'Replacing PDF…' : 'Replace PDF'}
              </button>
            </div>
          </div>
        ) : verified ? focusedEditing ? null : (
          <div className="pbf-callout is-good" style={{ marginTop: 14 }}>
            <strong>{selectedMode === 'full' ? 'Your PDF is ready' : 'PDF ready'}</strong>
            <span>{persistedReady ? 'This verified PDF is already part of the saved Book draft.' : 'Nothing is published yet. You can continue to assemble the Book.'}</span>
          </div>
        ) : (
          <div className="pbf-real-source-panel">
            <BookSourceInspectionPanel
              canRequestUploadAuthorization={Boolean(canEdit && workflow)}
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
      quiet={focusedEditing}
      title={focusedEditing ? 'PDFs' : selectedMode === 'full' ? 'Start with one PDF' : 'Combine your PDF sections'}
      subtitle={focusedEditing
        ? selectedMode === 'full'
          ? 'This Book uses one complete PDF. Replace that file here without rebuilding the Book structure.'
          : 'Select the component PDFs, review their order, and preview their composed pages without changing their source ownership.'
        : selectedMode === 'full'
          ? 'Choose the student-safe PDF you want to use in this Book.'
          : 'Select at least two PDFs, review their order, and preview the composed pages before assigning each source to the Book.'}
      status={sourceReady ? 'Ready' : selectedMode === 'full' ? '1 file' : combinedFiles.length > 0 ? `${combinedFiles.length} selected` : 'Add PDFs'}
      statusKind={sourceReady ? 'good' : undefined}
    >
      {selectedMode === 'component' && !focusedEditing && renderCombinedPdfFlow()}
      {selectedMode === 'component' && visibleSlots.map(renderSourceCard)}
      {selectedMode === 'full' && visibleSlots.map(renderSourceCard)}
      {focusedEditing && (
        <div className="pbf-actions" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button type="button" className="pbf-button" disabled={fullAttachmentBusy} onClick={requestSetupChange}>Change PDF setup</button>
        </div>
      )}
    </FlowView>
  );

  const renderAssembly = () => {
    if (!canEdit) return <FlowView title="Book structure" subtitle="This Book is read-only in this view." status="Read-only"><FlowSurface><p className="pbf-muted">Ask the Book owner to make changes.</p></FlowSurface></FlowView>;
    const guidedAssemblyView = assemblyStep === 'outline'
      ? (selectedMode === 'full'
        ? { title: 'Build the Book structure', subtitle: 'Start with the outline students will follow, then add the content for the first Unit.' }
        : { title: 'Give each PDF a place', subtitle: 'Choose which section each file belongs to, keep the order clear, and add its activities.' })
      : assemblyStep === 'pages'
        ? { title: 'Connect activities to pages', subtitle: 'Tell us which pages students should see for each activity. You can change these later.' }
        : assemblyStep === 'review'
          ? { title: 'Take a look before you publish', subtitle: 'Review the Book as a teacher, then open the student view for the Unit you are about to share.' }
          : { title: 'Build the Book structure', subtitle: 'Start with the outline students will follow, then add the content for the first Unit.' };
    const assemblyView = guidedAssemblyView;
    return (
      <FlowView quiet={focusedEditing} title={assemblyView.title} subtitle={assemblyView.subtitle} status={assemblyStep === 'review' ? 'Review' : 'In progress'}>
        <BookAssemblyWorkspace
          access={access as 'owner' | 'administrator'}
          activityAuthoring={activityAuthoring}
          bookId={bookId}
          bookTitle={title}
          bookRevision={effectiveAssemblyBookRevision}
          initialCandidate={candidate}
          initialSavedActivityKeysByUnit={assemblyInitialSavedActivityKeysByUnit}
          initialSourceSet={persistedSourceSet}
          migrationClient={assemblyMigrationClient}
          componentPdfActivationClient={componentPdfActivationClient}
          componentStudentDocumentSourceVersionId={componentStudentDocumentSourceVersionId}
          componentPdfActivationRecovery={componentPdfActivationRecovery}
          componentPdfPreparation={combinedDocumentUploadState?.phase === 'verified' && combinedDocumentUploadState.reservationId
            && visibleSlots.every((slot) => slot.uploadState?.phase === 'verified' && slot.uploadState.reservationId)
            ? {
                componentReservationIds: visibleSlots.map((slot) => slot.uploadState!.reservationId!),
                studentDocumentReservationId: combinedDocumentUploadState.reservationId,
              }
            : undefined}
          onAction={onTrackAction}
          onCandidateChange={setCandidate}
          onActivitiesSaved={() => { setSavedActivitySummary(null); setSavedActivitySummaryRetry((value) => value + 1); setPreviewProjection(null); setPreviewApproval(null); }}
          onDirtyChange={setAssemblyDirty}
          onGuidedStepChange={onAssemblyStepChange}
          presentation={presentation}
          candidateRuntimePreview={focusedEditing ? trustedRuntimePreview?.preview : undefined}
          savedActivitySummary={savedActivitySummary?.bookId === bookId
            && savedActivitySummary.bookRevision === effectiveAssemblyBookRevision
            && savedActivitySummary.sourceSetRevision === effectiveAssemblySourceSetRevision
            && savedActivitySummary.unitKey === savedActivitySummaryUnitKey
            && (!candidate || candidate.unitKey !== savedActivitySummary.unitKey
              || (candidate.candidateId === savedActivitySummary.candidateId && candidate.revision === savedActivitySummary.candidateRevision))
              ? savedActivitySummary : null}
          savedActivitySummaryStatus={savedActivitySummaryKey && savedActivitySummaryLoad?.key === savedActivitySummaryKey
            ? savedActivitySummaryLoad.status
            : assemblyRepository?.loadCurrent && assemblyPreviewClient ? 'loading' : 'error'}
          onRetrySavedActivitySummary={() => setSavedActivitySummaryRetry((value) => value + 1)}
          previewDocuments={assemblyPreviewDocuments}
          previewGetIdToken={assemblyPreviewGetIdToken}
          repository={assemblyRepository ?? undefined}
          sourceSetRevision={effectiveAssemblySourceSetRevision}
          sourceSetAttachmentClient={sourceSetAttachmentClient}
          onAuthorityRevisionsChange={updateAuthorityRevisions}
          sourceVersions={sourceVersions}
          strategyOverride={selectedMode === 'full' ? 'full_pdf' : 'component_pdfs'}
          guided
          guidedUiVariant="mockup"
          guidedStep={assemblyStep}
          previewUnitKey={previewUnitKey}
          onUnitSelect={onPreviewUnitChange}
          onOpenPlan={onOpenPlan}
          onPreviewBlockedChange={setPreviewBlocked}
          editingPanel={focusedEditing
            ? editingSection === 'content-tree' || editingSection === 'activity-json' || editingSection === 'preview'
              ? editingSection
              : undefined
            : undefined}
          suppressGuidedChrome
          suppressModeChoice
          validateCandidateAfterSave
        />
        {assemblyStep === 'review' && (
          <FlowSurface>
            {!focusedEditing && <div className="pbf-row"><div><h3>Preview as a student</h3><p className="pbf-muted">Open the trusted preview before publishing. Nothing is published by opening it.</p></div><span className={`pbf-status${previewApproval ? ' is-good' : ''}`}>{previewApproval ? 'Approved' : previewProjection ? 'Ready to approve' : 'Review needed'}</span></div>}
            {focusedEditing && assemblyDirty && <p>Save your changes before previewing.</p>}
            <div className="pbf-actions" style={{ marginTop: 14 }}><button type="button" className="pbf-button pbf-button-primary" onClick={() => void requestPreview()} disabled={(focusedEditing && (assemblyDirty || previewBlocked)) || !sourceReady || !candidate || candidate.lifecycle !== 'validated' || !assemblyPreviewClient}>{previewProjection ? 'Refresh preview' : 'Preview as a student'}</button><button type="button" className="pbf-button" onClick={() => void approvePreview()} disabled={(focusedEditing && (assemblyDirty || previewBlocked)) || !sourceReady || !previewProjection || Boolean(previewApproval) || !assemblyPreviewClient}>Approve this preview</button></div>
            {focusedEditing && sourceReady && previewApproval && (
              <div className="pbf-actions" style={{ marginTop: 10 }}>
                <button type="button" className="pbf-button" onClick={() => setStep(5)}>Review publication</button>
              </div>
            )}
            {trustedRuntimePreview ? (
              <BookAssemblyStudentPreviewHost
                bookTitle={title}
                getIdToken={assemblyPreviewGetIdToken}
                preview={trustedRuntimePreview.preview}
                onExit={() => setDismissedPreviewIdentity(trustedRuntimePreview.identity)}
              />
            ) : null}
          </FlowSurface>
        )}
      </FlowView>
    );
  };

  const renderPublish = () => (
    <FlowView title={isPublished ? 'Unit 1 is published' : assemblyInitialPublicationStatus === 'loading' ? 'Checking publication status' : assemblyInitialPublicationStatus === 'error' ? 'Unable to verify publication status' : 'Ready to share Unit 1?'} subtitle={isPublished ? 'Assign this Unit as homework to give selected students access. Unit 2 and existing homework are unchanged.' : assemblyInitialPublicationStatus === 'loading' ? 'Publishing stays locked until the current publication is confirmed.' : assemblyInitialPublicationStatus === 'error' ? 'Publishing stays locked until the current publication can be confirmed.' : 'This will publish Unit 1. Students receive access only after you assign it as homework.'} status={isPublished ? 'Published' : assemblyInitialPublicationStatus === 'loading' ? 'Checking' : assemblyInitialPublicationStatus === 'error' ? 'Blocked' : 'Ready'} statusKind={isPublished ? 'good' : assemblyInitialPublicationStatus === 'loaded' ? undefined : 'warn'}>
      <FlowSurface className="pbf-publish-surface">
        {focusedEditing && (
          <div className="pbf-actions" style={{ marginBottom: 14 }}>
            <button type="button" className="pbf-button" onClick={() => setFlowStep(4)}>Back to preview</button>
          </div>
        )}
        {isPublished && <div className="pbf-success"><div className="pbf-success-mark" aria-hidden="true">✓</div><h2>Unit 1 is published</h2><p>Assign this Unit as homework to give selected students access. Unit 2 and existing homework are unchanged.</p><div className="pbf-actions" style={{ marginTop: 18, justifyContent: 'center' }}><button type="button" className="pbf-button" onClick={onHomeworkHandoff} disabled={!onHomeworkHandoff}>Assign as homework</button><button type="button" className="pbf-button pbf-button-primary" onClick={() => { if (focusedEditing) { setPublication(null); setFlowStep(4); } else { setMode(null); setStep(1); } track('teacher_materials_book_pdf_returned_to_book'); }}>Return to Book</button></div></div>}
        {assemblyInitialPublicationStatus === 'loading' && <p className="pbf-callout is-warn" aria-busy="true">Checking whether Unit 1 is already published. Publishing is locked until this finishes.</p>}
        {assemblyInitialPublicationStatus === 'error' && <><p className="pbf-callout is-warn" role="alert">We could not verify the current publication. Retry the check or close and reopen the editor before publishing.</p>{onRetryCurrentPublication && <div className="pbf-actions" style={{ marginTop: 18 }}><button type="button" className="pbf-button" onClick={onRetryCurrentPublication}>Retry publication check</button></div>}</>}
        {publicationRefreshStatus === 'pending' && <p className="pbf-callout is-warn" aria-busy="true">The publication was accepted. Confirming the current publication before another submission.</p>}
        {publicationRefreshStatus === 'error' && <div className="pbf-callout is-warn" role="status"><strong>The publication was accepted</strong><span>Refresh the current publication before resubmitting this draft.</span><div className="pbf-actions" style={{ marginTop: 12 }}><button type="button" className="pbf-button" onClick={() => void refreshCurrentPublication()}>Refresh publication status</button></div></div>}
        {showPublishControls && publicationStatusReady && publicationRefreshStatus === 'ready' && <><div className="pbf-callout is-warn"><strong>{reviewedDraftDiffers ? 'A reviewed successor is ready' : 'Nothing is published yet'}</strong><span>{reviewedDraftDiffers ? 'The current publication remains assignable until this successor is committed.' : 'Publishing Unit 1 will not change later Units or existing homework.'}</span></div><div className="pbf-checklist" style={{ marginTop: 16 }}><div className="pbf-checklist-item">Unit 1 will be published with its current activities</div><div className="pbf-checklist-item">Students will see only the pages connected to this Unit</div><div className="pbf-checklist-item">Your current Book and later Units will remain safe</div></div></>}
        {showPublishControls && publicationStatusReady && publicationRefreshStatus === 'ready' && <div className="pbf-actions" style={{ marginTop: 18 }}><button type="button" className="pbf-button pbf-button-primary" onClick={() => setPublishConfirmOpen(true)} disabled={!sourceReady || !previewApproval || !assemblyPreviewClient || !candidate || (selectedMode === 'component' && !componentReadyToPublish)}>{assemblyPreviewClient ? selectedMode === 'full' ? 'Publish Unit 1' : componentReadyToPublish ? 'Publish Book' : 'Combine PDFs before publishing' : 'Publication service unavailable'}</button></div>}
      </FlowSurface>
    </FlowView>
  );

  if (!mode) {
    if (focusedEditing) {
      return (
        <section className="book-pdf-flow" data-access={access} data-presentation={presentation} data-experience="focused-editing">
          <div className="pbf-window pbf-window--focused">
            <main className="pbf-main">
              <div className="pbf-view">
                <div className="pbf-heading"><div><h2>PDF setup is incomplete</h2><p>Resume the Book setup before editing files, content, activities, or page mapping.</p></div></div>
                <p className="pbf-callout is-warn" role="alert">Close this editor and reopen the draft to continue its guided PDF setup.</p>
              </div>
            </main>
          </div>
        </section>
      );
    }
    return (
      <section className="book-pdf-flow" data-access={access} data-presentation={presentation}>
        <div className={`pbf-window${focusedEditing ? ' pbf-window--focused' : ''}`}>
          {!focusedEditing && <header className="pbf-header"><div className="pbf-brand"><span className="pbf-mark">PDF</span><div><p className="pbf-eyebrow">Book creation</p><h1>{title}</h1></div></div><div className="pbf-header-actions"><span className="pbf-status">Draft</span></div></header>}
          <main className="pbf-main">
            <div className="pbf-hero pbf-mode-hero"><div className="pbf-eyebrow">Set up your PDF Book</div><h2>How will this Book use PDFs?</h2><p>Choose the setup that matches your files. You can change it later through a reviewed migration.</p></div>
            <div className="pbf-choice-grid">
              <button type="button" className="pbf-choice" onClick={() => chooseMode('full')}><h3>One complete PDF</h3><p>Use one PDF for the whole Book. You will upload one file and connect one Book structure to it.</p><small>Best when everything lives in one document →</small></button>
              <button type="button" className="pbf-choice" onClick={() => chooseMode('component')}><h3>Several component PDFs</h3><p>Use separate PDFs for different sections. Each file keeps its own place and its own structure.</p><small>Best when a Book is assembled from multiple files →</small></button>
            </div>
            <div className="pbf-callout" style={{ marginTop: 18 }}><strong>Nothing is published yet</strong><span>This walkthrough keeps your current Book unchanged until you explicitly publish a Unit.</span></div>
          </main>
          {!focusedEditing && <footer className="pbf-footer"><p>Choose a setup to begin.</p><div /></footer>}
        </div>
      </section>
    );
  }

  const renderStep = step === 1 ? renderFiles : step === 5 ? renderPublish : renderAssembly;
  if (focusedEditing) {
    return (
      <section className="book-pdf-flow" data-access={access} data-presentation={presentation} data-mode={mode} data-experience="focused-editing">
        <div className="pbf-window pbf-window--focused">
          <main className="pbf-main">{renderStep()}</main>
           {publishConfirmOpen && <div className="pbf-overlay"><div className="pbf-overlay-shell" role="dialog" aria-modal="true" aria-labelledby="pbf-publish-title"><h2 id="pbf-publish-title">{selectedMode === 'component' ? `Publish ${approvedComponentUnitKeys.length} approved Units?` : 'Publish Unit 1?'}</h2><p>{selectedMode === 'component' ? `Students will be able to open every approved Unit: ${approvedComponentUnitKeys.join(', ')}.` : 'Students will be able to open this Unit immediately.'}</p><ul className="pbf-checklist" style={{ marginTop: 15 }}><li>{selectedMode === 'full' ? 'Full PDF source is ready' : 'Component PDF sources are ready'}</li><li>{selectedMode === 'component' ? `All ${approvedComponentUnitKeys.length} Unit previews are approved` : 'Student preview is approved'}</li><li>{selectedMode === 'component' ? 'Every listed Unit will be published together' : 'Later Units remain private'}</li></ul><div className="pbf-overlay-footer"><button type="button" className="pbf-button" onClick={() => setPublishConfirmOpen(false)} disabled={publishBusy}>Not yet</button><button type="button" className="pbf-button pbf-button-primary" onClick={() => void publish()} disabled={publishBusy}>{publishBusy ? 'Publishing…' : selectedMode === 'component' ? 'Publish approved Units' : 'Publish Unit 1'}</button></div></div></div>}
          {migrationOpen && <div className="pbf-overlay"><div className="pbf-overlay-shell" role="dialog" aria-modal="true" aria-labelledby="pbf-migration-title"><h2 id="pbf-migration-title">Change your PDF setup</h2><p>This creates a reviewed draft. Your current Book stays safe while you check the new setup.</p><div className="pbf-surface" style={{ marginTop: 15 }}><div className="pbf-row"><strong>Current setup</strong><span>{selectedMode === 'full' ? 'One complete PDF' : 'Several component PDFs'}</span></div><div className="pbf-row"><strong>New setup</strong><span>{selectedMode === 'full' ? 'Several component PDFs' : 'One complete PDF'}</span></div><div className="pbf-row"><strong>Page connections</strong><span className="pbf-status is-warn">Review before publishing</span></div></div><div className="pbf-callout is-warn" style={{ marginTop: 13 }}><strong>Your current Book stays safe</strong><span>The new setup is prepared and confirmed separately. Nothing is published by changing setup.</span></div><div className="pbf-overlay-footer"><button type="button" className="pbf-button" disabled={migrationBusy} onClick={() => setMigrationOpen(false)}>Cancel</button><button type="button" className="pbf-button pbf-button-primary" disabled={migrationBusy} onClick={() => void confirmSetupChange()}>{migrationBusy ? 'Preparing reviewed change…' : 'Prepare reviewed change'}</button></div></div></div>}
        </div>
      </section>
    );
  }

  return (
    <section className="book-pdf-flow" data-access={access} data-presentation={presentation} data-mode={mode}>
      <div className="pbf-window">
        <header className="pbf-header">
          <div className="pbf-brand"><span className="pbf-mark">PDF</span><div><p className="pbf-eyebrow">Book editor</p><h1>{title}</h1></div></div>
          <div className="pbf-header-actions"><span className="pbf-status">{selectedMode === 'full' ? 'Full PDF · Draft' : 'Component PDFs · Draft'}</span><button type="button" className="pbf-button pbf-button-quiet" disabled={fullAttachmentBusy} onClick={requestSetupChange}>Change PDF setup</button></div>
        </header>
        <nav className="pbf-progress" aria-label="PDF Book progress">
          {FLOW_STEPS.map((label, index) => {
            const number = (index + 1) as PdfFlowStep;
            const disabled = fullAttachmentBusy || number > unlockedStep;
            return <button key={label} type="button" className={`pbf-progress-step${step === number ? ' is-current' : ''}${number < step ? ' is-done' : ''}`} disabled={disabled} onClick={() => setFlowStep(number)}><span>{number < step ? '✓' : number}</span><strong>{label}</strong></button>;
          })}
        </nav>
        <main className="pbf-main">{renderStep()}</main>
        <footer className="pbf-footer"><p>{step === 1 ? 'Your original files stay on your device until you choose to upload.' : `Step ${step} of 5 · ${selectedMode === 'full' ? 'Full PDF' : 'Component PDFs'}`}</p><div className="pbf-actions"><button type="button" className="pbf-button pbf-button-quiet" onClick={() => setFlowStep(Math.max(1, step - 1) as PdfFlowStep)} disabled={step === 1 || fullAttachmentBusy}>Back</button>{step === 1 && <button type="button" className="pbf-button pbf-button-primary" onClick={() => void continueFromFiles()} disabled={!sourceReady || fullAttachmentBusy}>{fullAttachmentBusy ? 'Attaching…' : 'Continue'}</button>}{step === 4 && <button type="button" className="pbf-button pbf-button-primary" onClick={() => setFlowStep(5)} disabled={!previewApproval}>Continue</button>}</div></footer>
         {publishConfirmOpen && <div className="pbf-overlay"><div className="pbf-overlay-shell" role="dialog" aria-modal="true" aria-labelledby="pbf-publish-title"><h2 id="pbf-publish-title">{selectedMode === 'component' ? `Publish ${approvedComponentUnitKeys.length} approved Units?` : 'Publish Unit 1?'}</h2><p>{selectedMode === 'component' ? `Students will be able to open every approved Unit: ${approvedComponentUnitKeys.join(', ')}.` : 'Students will be able to open this Unit immediately.'}</p><ul className="pbf-checklist" style={{ marginTop: 15 }}><li>{selectedMode === 'full' ? 'Full PDF source is ready' : 'Component PDF sources are ready'}</li><li>{selectedMode === 'component' ? `All ${approvedComponentUnitKeys.length} Unit previews are approved` : 'Student preview is approved'}</li><li>{selectedMode === 'component' ? 'Every listed Unit will be published together' : 'Later Units remain private'}</li></ul><div className="pbf-overlay-footer"><button type="button" className="pbf-button" onClick={() => setPublishConfirmOpen(false)} disabled={publishBusy}>Not yet</button><button type="button" className="pbf-button pbf-button-primary" onClick={() => void publish()} disabled={publishBusy}>{publishBusy ? 'Publishing…' : selectedMode === 'component' ? 'Publish approved Units' : 'Publish Unit 1'}</button></div></div></div>}
        {migrationOpen && <div className="pbf-overlay"><div className="pbf-overlay-shell" role="dialog" aria-modal="true" aria-labelledby="pbf-migration-title"><h2 id="pbf-migration-title">Change your PDF setup</h2><p>This creates a reviewed draft. Your current Book stays safe while you check the new setup.</p><div className="pbf-surface" style={{ marginTop: 15 }}><div className="pbf-row"><strong>Current setup</strong><span>{selectedMode === 'full' ? 'One complete PDF' : 'Several component PDFs'}</span></div><div className="pbf-row"><strong>New setup</strong><span>{selectedMode === 'full' ? 'Several component PDFs' : 'One complete PDF'}</span></div><div className="pbf-row"><strong>Page connections</strong><span className="pbf-status is-warn">Review before publishing</span></div></div><div className="pbf-callout is-warn" style={{ marginTop: 13 }}><strong>Your current Book stays safe</strong><span>The new setup is prepared and confirmed separately. Nothing is published by changing setup.</span></div><div className="pbf-overlay-footer"><button type="button" className="pbf-button" disabled={migrationBusy} onClick={() => setMigrationOpen(false)}>Cancel</button><button type="button" className="pbf-button pbf-button-primary" disabled={migrationBusy} onClick={() => void confirmSetupChange()}>{migrationBusy ? 'Preparing reviewed change…' : 'Prepare reviewed change'}</button></div></div></div>}
      </div>
    </section>
  );
};

const FlowView = ({ title, subtitle, status, statusKind, quiet, children }: { readonly title: string; readonly subtitle: string; readonly status: string; readonly statusKind?: 'good' | 'warn'; readonly quiet?: boolean; readonly children: ReactNode }) => (
  <div className="pbf-view">{!quiet && <div className="pbf-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><span className={`pbf-status${statusKind ? ` is-${statusKind}` : ''}`}>{status}</span></div>}{children}</div>
);

const FlowSurface = ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => <div className={`pbf-surface${className ? ` ${className}` : ''}`}>{children}</div>;

export default BookPdfFlowWorkspace;
