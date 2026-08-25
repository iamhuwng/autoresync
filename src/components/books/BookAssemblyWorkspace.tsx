import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { toast } from '../modern';
import {
  BOOK_SOURCE_STRATEGIES,
  BOOK_CONTENT_NODE_TYPES,
  type BookAssemblyManifestCandidate,
  type ActivityContextRequirement,
  type BookContentNodeType,
  type BookSourceStrategy,
  type PageGroupMode,
  type SourceSetCandidate,
  type TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import { validateBookAssemblyManifestCandidate } from '../../services/book-assembly/manifestCandidate.service';
import { analyzeBookAssemblyReconciliation } from '../../services/book-assembly/reconciliation.service';
import type { CandidateUnitPreviewProjection } from '../../services/book-assembly/unitPreview.service';
import { parsePhysicalPageList, reorderActivitySlot, upsertPageGroupMapping } from '../../services/book-assembly/pageGroup.service';
import { missingRequiredSourceContext } from '../../services/book-assembly/sourceContextRequirement.service';
import { discardStagedUnitActivities, stageUnitActivityImportBundle, UnitActivityImportError } from '../../services/book-assembly/unitActivityImport.service';
import { buildUnitActivityImportPrompt } from '../../services/book-assembly/unitPrompt.service';
import type {
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from '../../services/book-assembly/unitAssembly.types';
import type { BookAssemblyMigrationClient } from '../../services/book-assembly/assemblyClient.browser';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import {
  isCurrentBookTeacherAssemblyDocument,
  type BookTeacherAssemblyDocumentProjection,
} from '../../services/book-delivery/bookTeacherAssemblyDocument.types';
import type { AssemblyMappingViewerPageSelection } from '../../services/book-assembly/assemblyMappingViewer.browser';
import type { ActivityAuthoringService } from '../../services/book-activity/activityAuthoring.service';
import type { SourceSetAttachmentClient } from '../../services/book-source-delivery/sourceUpload.client';
import BookAssemblyMappingViewerHost from './assembly/BookAssemblyMappingViewerHost';
import BookAssemblyReconciliationPanel from './assembly/BookAssemblyReconciliationPanel';
import BookAssemblyUnitPreview from './assembly/BookAssemblyUnitPreview';
import PageGroupMappingSummary from './assembly/PageGroupMappingSummary';
import UnitActivityImportControls from './assembly/UnitActivityImportControls';
import BookAssemblyStrategyMigrationPanel from './assembly/BookAssemblyStrategyMigrationPanel';
import BookReplacementPlanPanel from './BookReplacementPlanPanel';
import type {
  ReplacementConfirmationHandoff,
  ReplacementPlanClient,
  ReplacementPlanClientCreateRequest,
} from '../../services/book-source-delivery/replacementPlan.types';
import './BookAssemblyWorkspace.css';

export interface BookAssemblyWorkspaceProps {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly access: 'owner' | 'administrator';
  readonly presentation: 'modal' | 'page-compat';
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSetAttachmentClient?: SourceSetAttachmentClient | null;
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
  readonly initialCandidate?: BookAssemblyCandidateRecord | null;
  readonly repository?: UnitAssemblyRepository;
  readonly migrationClient?: BookAssemblyMigrationClient | null;
  readonly activityAuthoring?: ActivityAuthoringService | null;
  readonly previewDocuments?: readonly BookTeacherAssemblyDocumentProjection[];
  readonly previewGetIdToken?: (forceRefresh?: boolean) => Promise<string | null | undefined>;
  /** Trusted #63 output; route composition remains #59-owned. */
  readonly candidateRuntimePreview?: CandidateUnitPreviewProjection | null;
  readonly onAction?: (action: string, metadata?: Record<string, unknown>) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly onCandidateChange?: (candidate: BookAssemblyCandidateRecord | null) => void;
  /** When the guided PDF flow saves, immediately run the trusted candidate validation command. */
  readonly validateCandidateAfterSave?: boolean;
  /** Optional #115 composition input; planning stays absent until trusted facts are supplied. */
  readonly replacementPlanClient?: ReplacementPlanClient | null;
  readonly replacementPlanRequest?: ReplacementPlanClientCreateRequest | null;
  readonly onReplacementConfirmationHandoff?: (handoff: ReplacementConfirmationHandoff) => void;
  /** Production uses the guided workflow; the legacy layout remains available to focused fixtures. */
  readonly guided?: boolean;
  /** Allows the PDF workflow shell to own the visible stage without duplicating assembly state. */
  readonly guidedStep?: 'mode' | 'outline' | 'pages' | 'review';
  readonly onGuidedStepChange?: (step: 'mode' | 'outline' | 'pages' | 'review') => void;
  readonly strategyOverride?: BookSourceStrategy;
  readonly onStrategyChange?: (strategy: BookSourceStrategy) => void;
  readonly suppressGuidedChrome?: boolean;
  /** The outer PDF flow already collected the mode choice. */
  readonly suppressModeChoice?: boolean;
  /** Keeps the approved PDF Book mockup as the visible authoring surface. */
  readonly guidedUiVariant?: 'default' | 'mockup';
}

type DraftNode = BookAssemblyManifestCandidate['nodes'][number];
type DraftSource = {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly sourceOrder: number;
  readonly ownerNodeKey?: string;
};
type AssemblyEditorDraft = {
  readonly bookId: string;
  readonly sourceSet: {
    readonly sourceStrategy: BookSourceStrategy;
    readonly sources: readonly DraftSource[];
  };
  readonly nodes: readonly DraftNode[];
  readonly units: BookAssemblyManifestCandidate['units'];
};
type VisibleTreeItem = {
  readonly node: DraftNode;
  readonly level: number;
};

const STRUCTURAL_NODE_TYPES = ['section', 'chapter', 'unit', 'test'] as const satisfies readonly BookContentNodeType[];
const isStructuralNodeType = (value: BookContentNodeType): value is (typeof STRUCTURAL_NODE_TYPES)[number] =>
  (STRUCTURAL_NODE_TYPES as readonly BookContentNodeType[]).includes(value);

const operationId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
};

const nodeId = (type: BookContentNodeType): string =>
  `${type}-${operationId().replaceAll('-', '').slice(0, 12)}`;

const emptyManifest = (bookId: string): AssemblyEditorDraft => ({
  bookId,
  sourceSet: { sourceStrategy: 'full_pdf', sources: [] },
  nodes: [],
  units: [],
});

const nodeLabel = (node: DraftNode): string => `${node.nodeType}: ${node.nodeKey}`;

const defaultNode = (type: BookContentNodeType, parentNodeKey: string | null, order: number): DraftNode => ({
  nodeKey: nodeId(type),
  parentNodeKey,
  nodeType: type,
  order,
});

const errorText = (result: ReturnType<typeof validateBookAssemblyManifestCandidate>): string =>
  result.errors.map((error) => `${error.path}: ${error.message}`).join(' ');

const normalizeSources = (
  strategy: BookSourceStrategy,
  values: readonly DraftSource[],
): readonly DraftSource[] => {
  const visible = strategy === 'full_pdf'
    ? values.slice(0, 1).map((source) => {
        const { ownerNodeKey: _ownerNodeKey, ...fullSource } = source;
        return fullSource;
      })
    : values.filter((source) => typeof source.ownerNodeKey === 'string');
  return visible
    .slice()
    .sort((left, right) => left.sourceOrder - right.sourceOrder || left.sourceKey.localeCompare(right.sourceKey))
    .map((source, index) => ({ ...source, sourceOrder: index + 1 }));
};

const normalizeNodeOrders = (values: readonly DraftNode[]): readonly DraftNode[] => {
  const groups = new Map<string, DraftNode[]>();
  values.forEach((node) => {
    const key = node.parentNodeKey ?? '__root__';
    groups.set(key, [...(groups.get(key) ?? []), node]);
  });
  const orderByKey = new Map<string, number>();
  groups.forEach((group) => {
    group
      .slice()
      .sort((left, right) => left.order - right.order || left.nodeKey.localeCompare(right.nodeKey))
      .forEach((node, index) => orderByKey.set(node.nodeKey, index + 1));
  });
  return values.map((node) => ({ ...node, order: orderByKey.get(node.nodeKey) ?? node.order }));
};

const draftSnapshot = (
  strategy: BookSourceStrategy,
  nodes: readonly DraftNode[],
  sources: readonly DraftSource[],
  units: BookAssemblyManifestCandidate['units'],
): string => JSON.stringify({
  strategy,
  nodes: normalizeNodeOrders(nodes)
    .slice()
    .sort((left, right) =>
      (left.parentNodeKey ?? '').localeCompare(right.parentNodeKey ?? '')
      || left.order - right.order
      || left.nodeKey.localeCompare(right.nodeKey)),
  sources: normalizeSources(strategy, sources),
  units: units
    .slice()
    .sort((left, right) => left.unitKey.localeCompare(right.unitKey)),
});

const buildVisibleTree = (nodes: readonly DraftNode[]): readonly VisibleTreeItem[] => {
  const byParent = new Map<string, DraftNode[]>();
  nodes.forEach((node) => {
    const key = node.parentNodeKey ?? '__root__';
    byParent.set(key, [...(byParent.get(key) ?? []), node]);
  });

  const visited = new Set<string>();
  const items: VisibleTreeItem[] = [];
  const visit = (parentKey: string, level: number) => {
    const children = (byParent.get(parentKey) ?? [])
      .slice()
      .sort((left, right) => left.order - right.order || left.nodeKey.localeCompare(right.nodeKey));
    children.forEach((node) => {
      if (visited.has(node.nodeKey)) return;
      visited.add(node.nodeKey);
      items.push({ node, level });
      visit(node.nodeKey, level + 1);
    });
  };

  visit('__root__', 1);
  nodes
    .filter((node) => !visited.has(node.nodeKey))
    .sort((left, right) => left.order - right.order || left.nodeKey.localeCompare(right.nodeKey))
    .forEach((node) => {
      visited.add(node.nodeKey);
      items.push({ node, level: 1 });
      visit(node.nodeKey, 2);
    });
  return items;
};

const isOwnerInUnitBranch = (
  nodes: readonly DraftNode[],
  ownerNodeKey: string | undefined,
  unitKey: string | null,
): boolean => {
  if (!ownerNodeKey || !unitKey) return false;
  let current = nodes.find((node) => node.nodeKey === unitKey);
  while (current) {
    if (current.nodeKey === ownerNodeKey) return true;
    current = current.parentNodeKey
      ? nodes.find((node) => node.nodeKey === current?.parentNodeKey)
      : undefined;
  }
  return false;
};

const mutationErrorMessage = (result: BookAssemblyMutationResult): string => {
  if (result.status === 'forbidden') return 'You no longer have permission to save this Assembly draft.';
  if (result.status === 'invalid') return 'Assembly draft failed server validation.';
  if (result.status === 'not-found') return 'Assembly draft no longer exists. Reload the current draft.';
  if (result.status === 'idempotency-conflict') return 'Assembly save was rejected as a conflicting retry.';
  return 'Assembly save returned no candidate.';
};

const BookAssemblyWorkspace = ({
  bookId,
  bookTitle,
  access,
  presentation,
  bookRevision,
  sourceSetRevision,
  sourceSetAttachmentClient = null,
  sourceVersions,
  initialCandidate,
  repository,
  migrationClient,
  activityAuthoring,
  previewDocuments = [],
  previewGetIdToken,
  candidateRuntimePreview,
  onAction,
  onDirtyChange,
  onCandidateChange,
  validateCandidateAfterSave = false,
  replacementPlanClient,
  replacementPlanRequest,
  onReplacementConfirmationHandoff,
  guided = false,
  guidedStep: guidedStepOverride,
  onGuidedStepChange,
  strategyOverride,
  onStrategyChange,
  suppressGuidedChrome = false,
  suppressModeChoice = false,
  guidedUiVariant = 'default',
}: BookAssemblyWorkspaceProps) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const initial: AssemblyEditorDraft = initialCandidate?.manifest ?? emptyManifest(bookId);
  const [strategy, setStrategy] = useState<BookSourceStrategy>(strategyOverride ?? initial.sourceSet.sourceStrategy);
  const [nodes, setNodes] = useState<readonly DraftNode[]>(initial.nodes);
  const [sources, setSources] = useState<readonly DraftSource[]>(initial.sourceSet.sources);
  const [units, setUnits] = useState<BookAssemblyManifestCandidate['units']>(initial.units);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(initial.nodes[0]?.nodeKey ?? null);
  const [mappingSourceKey, setMappingSourceKey] = useState(initial.sourceSet.sources[0]?.sourceKey ?? '');
  const [mappingPages, setMappingPages] = useState('1');
  const [mappingDefaultPage, setMappingDefaultPage] = useState('1');
  const [mappingActivityKey, setMappingActivityKey] = useState(
    guidedUiVariant === 'mockup' ? '' : 'activity-1',
  );
  const [mappingContextRequirement, setMappingContextRequirement] = useState<ActivityContextRequirement>('required');
  const [mappingMode, setMappingMode] = useState<PageGroupMode>('activity');
  const [candidate, setCandidate] = useState<BookAssemblyCandidateRecord | null>(initialCandidate ?? null);
  const [selectedPreviewSourceVersionId, setSelectedPreviewSourceVersionId] = useState<string | null>(null);
  const [dismissedRuntimePreviewIdentity, setDismissedRuntimePreviewIdentity] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle');
  const [unitImportText, setUnitImportText] = useState('');
  const [unitImportBusy, setUnitImportBusy] = useState(false);
  const [unitImportCancelable, setUnitImportCancelable] = useState(false);
  const [reconciliationBusy, setReconciliationBusy] = useState(false);
  const [migrationRequestedStrategy, setMigrationRequestedStrategy] = useState<BookSourceStrategy | null>(null);
  const [unitImportStatus, setUnitImportStatus] = useState<string | null>(null);
  const [manualCopyFallback, setManualCopyFallback] = useState(false);
  const [mockupUnitToolsOpen, setMockupUnitToolsOpen] = useState(false);
  const [mockupPageToolsOpen, setMockupPageToolsOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [internalGuidedStep, setInternalGuidedStep] = useState<'mode' | 'outline' | 'pages' | 'review'>('mode');
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    draftSnapshot(initial.sourceSet.sourceStrategy, initial.nodes, initial.sourceSet.sources, initial.units));
  const [effectiveBookRevision, setEffectiveBookRevision] = useState(bookRevision);
  const [effectiveSourceSetRevision, setEffectiveSourceSetRevision] = useState(sourceSetRevision);
  const [attachedSourceSet, setAttachedSourceSet] = useState<SourceSetCandidate | null>(initialCandidate?.manifest?.sourceSet ?? null);
  const nodeButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocusNodeKeyRef = useRef<string | null>(null);
  const unitImportAbortRef = useRef<AbortController | null>(null);
  const structureImportInputRef = useRef<HTMLInputElement | null>(null);

  const guidedStep = guidedStepOverride ?? internalGuidedStep;
  const setGuidedStep = (next: 'mode' | 'outline' | 'pages' | 'review') => {
    setInternalGuidedStep(next);
    onGuidedStepChange?.(next);
  };

  const sourceAuthority = useMemo(() => ({
    getSourceVersion: (sourceVersionId: string) =>
      sourceVersions.find((source) => source.sourceVersionId === sourceVersionId),
  }), [sourceVersions]);

  const normalizedSources = useMemo(
    () => normalizeSources(strategy, sources),
    [sources, strategy],
  );
  const visibleTreeItems = useMemo(() => buildVisibleTree(nodes), [nodes]);
  const currentSnapshot = useMemo(
    () => draftSnapshot(strategy, nodes, sources, units),
    [nodes, sources, strategy, units],
  );
  const selectedUnitKey = useMemo(() => {
    const selected = nodes.find((node) => node.nodeKey === selectedNodeKey);
    if (selected?.nodeType === 'unit') return selected.nodeKey;
    return nodes.find((node) => node.nodeType === 'unit')?.nodeKey ?? null;
  }, [nodes, selectedNodeKey]);
  const selectedUnit = useMemo(
    () => units.find((unit) => unit.unitKey === selectedUnitKey),
    [selectedUnitKey, units],
  );
  const availableMappingSources = useMemo(
    () => normalizedSources.filter((source) =>
      strategy === 'full_pdf' || isOwnerInUnitBranch(nodes, source.ownerNodeKey, selectedUnitKey)),
    [nodes, normalizedSources, selectedUnitKey, strategy],
  );
  const selectedUnitMissingContext = useMemo(
    () => selectedUnit ? missingRequiredSourceContext(selectedUnit) : [],
    [selectedUnit],
  );
  const currentPreviewDocuments = useMemo(() => {
    if (!candidate) return [];
    const sourceVersionIds = normalizedSources.map((source) => source.sourceVersionId);
    return previewDocuments.filter((document) =>
      normalizedSources.some((source) =>
        source.sourceKey === document.sourceKey
        && source.sourceVersionId === document.sourceVersionId)
      && isCurrentBookTeacherAssemblyDocument(document, {
        bookId,
        bookRevision,
        sourceSetRevision,
        candidateId: candidate.candidateId,
        candidateRevision: candidate.revision,
        candidateLifecycle: candidate.lifecycle,
        sourceVersionIds,
      }));
  }, [
    bookId,
    bookRevision,
    candidate,
    normalizedSources,
    previewDocuments,
    sourceSetRevision,
  ]);
  const currentRuntimePreview = useMemo(() => {
    if (!candidate || !candidateRuntimePreview || candidateRuntimePreview.bookId !== bookId ||
      candidateRuntimePreview.candidateId !== candidate.candidateId ||
      candidateRuntimePreview.candidateRevision !== candidate.revision ||
      candidateRuntimePreview.sourceSetRevision !== candidate.sourceSetRevision ||
      candidateRuntimePreview.sourceSetRevision !== sourceSetRevision ||
      candidateRuntimePreview.unitKey !== selectedUnitKey) {
      return null;
    }
    const identity = [
      candidateRuntimePreview.candidateId,
      candidateRuntimePreview.candidateRevision,
      candidateRuntimePreview.sourceSetRevision,
      candidateRuntimePreview.registryVersion,
    ].join(':');
    return dismissedRuntimePreviewIdentity === identity
      ? null
      : { identity, preview: candidateRuntimePreview };
  }, [
    bookId,
    candidate,
    candidateRuntimePreview,
    dismissedRuntimePreviewIdentity,
    selectedUnitKey,
    sourceSetRevision,
  ]);
  const manifest = useMemo<AssemblyEditorDraft>(() => ({
    bookId,
    sourceSet: {
      sourceStrategy: strategy,
      sources: normalizedSources,
    },
    nodes: normalizeNodeOrders(nodes),
    units,
  }), [bookId, nodes, normalizedSources, strategy, units]);
  const reconciliationReport = useMemo(() => analyzeBookAssemblyReconciliation({
    manifest: manifest as unknown as BookAssemblyManifestCandidate,
    sourceVersionAuthority: sourceAuthority,
    expectedBookRevision: candidate?.bookRevision,
    bookRevision,
    expectedSourceSetRevision: candidate?.sourceSetRevision,
    sourceSetRevision,
    expectedCandidateRevision: candidate?.revision,
    candidateRevision: candidate?.revision,
  }), [bookRevision, candidate?.bookRevision, candidate?.revision, candidate?.sourceSetRevision, manifest, sourceAuthority, sourceSetRevision]);
  const unitPromptText = useMemo(() => {
    if (!selectedUnitKey) return '';
    try {
      return buildUnitActivityImportPrompt({
        bookTitle,
        manifest: manifest as unknown as BookAssemblyManifestCandidate,
        unitKey: selectedUnitKey,
        sourceVersions,
      });
    } catch {
      return '';
    }
  }, [bookTitle, manifest, selectedUnitKey, sourceVersions]);

  const emit = (action: string, metadata: Record<string, unknown> = {}) => {
    trackAction(action, { bookId, source: `book_assembly_${presentation}`, ...metadata });
    onAction?.(action, metadata);
  };

  const selectPreviewDocument = (sourceVersionId: string) => {
    const document = currentPreviewDocuments.find((value) => value.sourceVersionId === sourceVersionId);
    if (!document) return;
    setSelectedPreviewSourceVersionId(document.sourceVersionId);
    emit('teacher_materials_book_assembly_document_previewed', {
      candidateId: document.candidateId,
      candidateRevision: document.candidateRevision,
      sourceKey: document.sourceKey,
      sourceVersionId: document.sourceVersionId,
    });
  };

  const handleViewerPageSelected = (selection: AssemblyMappingViewerPageSelection) => {
    setMappingSourceKey(selection.sourceKey);
    setMappingPages(String(selection.physicalPageNumber));
    setMappingDefaultPage(String(selection.physicalPageNumber));
    setValidationMessage(null);
    emit('teacher_materials_book_assembly_mapping_viewer_page_selected', {
      sourceKey: selection.sourceKey,
      sourceVersionId: selection.sourceVersionId,
      physicalPageNumber: selection.physicalPageNumber,
    });
  };

  const importMockupStructure = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
      const record = parsed as Record<string, unknown>;
      const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
      const rawUnits = Array.isArray(record.units) ? record.units : [];
      const importedNodes = rawNodes.filter((value): value is DraftNode => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        const node = value as Record<string, unknown>;
        return typeof node.nodeKey === 'string'
          && (node.parentNodeKey === null || typeof node.parentNodeKey === 'string')
          && typeof node.nodeType === 'string'
          && (BOOK_CONTENT_NODE_TYPES as readonly string[]).includes(node.nodeType)
          && Number.isSafeInteger(node.order);
      });
      if (importedNodes.length === 0 || rawUnits.length === 0) throw new Error('empty');
      setNodes(normalizeNodeOrders(importedNodes));
      setUnits(rawUnits as BookAssemblyManifestCandidate['units']);
      requestNodeFocus(importedNodes.find((node) => node.nodeType === 'unit')?.nodeKey ?? importedNodes[0]?.nodeKey ?? null);
      setValidationMessage(null);
      setErrorMessage(null);
      toast.success('Book structure imported. Save the draft when you are ready.');
    } catch {
      setValidationMessage('Choose a valid Book structure JSON file with nodes and units.');
      toast.error('Book structure could not be imported.');
    }
  };

  const addComponentStructure = (sourceVersionId: string) => {
    const rootOrder = nodes.filter((node) => node.parentNodeKey === null).length + 1;
    const section = defaultNode('section', null, rootOrder);
    const unit = defaultNode('unit', section.nodeKey, 1);
    setNodes((current) => [...current, section, unit]);
    setSources((current) => {
      const existing = current.find((source) => source.sourceVersionId === sourceVersionId);
      const next = existing
        ? current.map((source) => source.sourceVersionId === sourceVersionId ? { ...source, ownerNodeKey: section.nodeKey } : source)
        : [...current, {
            sourceKey: `source-${sourceVersionId}`,
            sourceVersionId,
            sourceOrder: current.length + 1,
            ownerNodeKey: section.nodeKey,
          }];
      return normalizeSources('component_pdfs', next);
    });
    setUnits((current) => current.some((candidate) => candidate.unitKey === unit.nodeKey)
      ? current
      : [...current, {
          unitKey: unit.nodeKey,
          activitySlots: [],
          pageGroups: [],
        }]);
    requestNodeFocus(unit.nodeKey);
    toast.info('Structure added. Add the Unit content to continue.');
  };

  const requestNodeFocus = (nodeKey: string | null) => {
    pendingFocusNodeKeyRef.current = nodeKey;
    setSelectedNodeKey(nodeKey);
  };

  const applyDraft = (draft: AssemblyEditorDraft, nextCandidate: BookAssemblyCandidateRecord | null) => {
    setStrategy(draft.sourceSet.sourceStrategy);
    setSources(draft.sourceSet.sources);
    setNodes(draft.nodes);
    setUnits(draft.units);
    setCandidate(nextCandidate);
    setMigrationRequestedStrategy(null);
    setSavedSnapshot(draftSnapshot(draft.sourceSet.sourceStrategy, draft.nodes, draft.sourceSet.sources, draft.units));
    setValidationMessage(null);
    setErrorMessage(null);
    requestNodeFocus(draft.nodes[0]?.nodeKey ?? null);
  };

  useEffect(() => {
    onDirtyChange?.(currentSnapshot !== savedSnapshot);
  }, [currentSnapshot, onDirtyChange, savedSnapshot]);

  useEffect(() => {
    onCandidateChange?.(candidate);
  }, [candidate, onCandidateChange]);

  useEffect(() => {
    if (!strategyOverride || strategyOverride === strategy) return;
    setStrategy(strategyOverride);
    setSources([]);
    setMappingSourceKey('');
    setInternalGuidedStep('mode');
    setValidationMessage(null);
    setErrorMessage(null);
  }, [onGuidedStepChange, strategy, strategyOverride]);

  useEffect(() => {
    if (guidedUiVariant !== 'mockup') return;
    if (sourceVersions.length === 0) return;
    if (strategy === 'full_pdf' && sources.length === 0) {
      const source = sourceVersions[0];
      if (!source?.verifiedUsable) return;
      setSources([{ sourceKey: 'full', sourceVersionId: source.sourceVersionId, sourceOrder: 1 }]);
      setMappingSourceKey('full');
      return;
    }
  }, [guidedUiVariant, nodes, sourceVersions, sources, strategy]);

  useEffect(() => {
    if (availableMappingSources.length === 0) {
      if (mappingSourceKey !== '') setMappingSourceKey('');
      return;
    }
    if (!availableMappingSources.some((source) => source.sourceKey === mappingSourceKey)) {
      setMappingSourceKey(availableMappingSources[0]?.sourceKey ?? '');
    }
  }, [availableMappingSources, mappingSourceKey]);

  useEffect(() => {
    if (
      selectedPreviewSourceVersionId
      && !currentPreviewDocuments.some(
        (document) => document.sourceVersionId === selectedPreviewSourceVersionId,
      )
    ) {
      setSelectedPreviewSourceVersionId(null);
    }
  }, [currentPreviewDocuments, selectedPreviewSourceVersionId]);

  useEffect(() => {
    const pending = pendingFocusNodeKeyRef.current;
    if (!pending) return;
    const target = nodeButtonRefs.current[pending];
    if (!target) return;
    target.focus();
    pendingFocusNodeKeyRef.current = null;
  }, [selectedNodeKey, visibleTreeItems]);

  const selectStrategy = (next: BookSourceStrategy) => {
    if (migrationClient && candidate?.manifest && next !== candidate.manifest.sourceSet.sourceStrategy) {
      setMigrationRequestedStrategy(next);
      setValidationMessage(null);
      setErrorMessage(null);
      emit('teacher_materials_book_assembly_strategy_migration_requested', {
        fromStrategy: candidate.manifest.sourceSet.sourceStrategy,
        toStrategy: next,
        candidateId: candidate.candidateId,
      });
      return;
    }
    setStrategy(next);
    onStrategyChange?.(next);
    setSources([]);
    setMappingSourceKey('');
    setGuidedStep('mode');
    setValidationMessage(null);
    setErrorMessage(null);
    emit('teacher_materials_book_assembly_strategy_changed', { strategy: next });
  };

  const addNode = (type: BookContentNodeType) => {
    const parent = selectedNodeKey && nodes.some((node) => node.nodeKey === selectedNodeKey)
      ? selectedNodeKey
      : null;
    const siblings = nodes.filter((node) => node.parentNodeKey === parent);
    const next = defaultNode(type, parent, siblings.length + 1);
    setNodes((current) => [...current, next]);
    if (type === 'unit') {
      setUnits((current) => current.some((unit) => unit.unitKey === next.nodeKey)
        ? current
        : [...current, { unitKey: next.nodeKey, activitySlots: [], pageGroups: [] }]);
    }
    requestNodeFocus(next.nodeKey);
    emit('teacher_materials_book_node_added', { nodeKey: next.nodeKey, nodeType: type, parentNodeKey: parent });
  };

  const deleteNode = () => {
    if (!selectedNodeKey) return;
    const descendants = new Set<string>();
    const collect = (parent: string) => {
      nodes.filter((node) => node.parentNodeKey === parent).forEach((node) => {
        descendants.add(node.nodeKey);
        collect(node.nodeKey);
      });
    };
    collect(selectedNodeKey);
    const deleted = new Set([selectedNodeKey, ...descendants]);
    const visibleIndex = visibleTreeItems.findIndex((item) => item.node.nodeKey === selectedNodeKey);
    const fallbackKey = visibleTreeItems[visibleIndex + 1]?.node.nodeKey
      ?? visibleTreeItems[visibleIndex - 1]?.node.nodeKey
      ?? null;

    setNodes((current) => normalizeNodeOrders(current.filter((node) => !deleted.has(node.nodeKey))));
    setSources((current) => normalizeSources(strategy, current.filter((source) =>
      typeof source.ownerNodeKey !== 'string' || !deleted.has(source.ownerNodeKey))));
    setUnits((current) => current.filter((unit) => !deleted.has(unit.unitKey)));
    requestNodeFocus(fallbackKey);
    emit('teacher_materials_book_node_deleted', { nodeKey: selectedNodeKey });
  };

  const moveNode = (direction: -1 | 1) => {
    if (!selectedNodeKey) return;
    const selected = nodes.find((node) => node.nodeKey === selectedNodeKey);
    if (!selected) return;
    const siblings = nodes
      .filter((node) => node.parentNodeKey === selected.parentNodeKey)
      .sort((left, right) => left.order - right.order || left.nodeKey.localeCompare(right.nodeKey));
    const index = siblings.findIndex((node) => node.nodeKey === selectedNodeKey);
    const target = siblings[index + direction];
    if (!target) return;
    setNodes((current) => current.map((node) => {
      if (node.nodeKey === selected.nodeKey) return { ...node, order: target.order };
      if (node.nodeKey === target.nodeKey) return { ...node, order: selected.order };
      return node;
    }));
    requestNodeFocus(selectedNodeKey);
    emit('teacher_materials_book_node_reordered', { nodeKey: selectedNodeKey, direction });
  };

  const setSource = (sourceVersionId: string, ownerNodeKey?: string) => {
    const sourceVersion = sourceVersions.find((value) => value.sourceVersionId === sourceVersionId);
    if (!sourceVersion?.verifiedUsable) return;
    setSources((current) => {
      if (current.some((source) => source.sourceVersionId === sourceVersionId)) return current;
      const next: DraftSource = strategy === 'full_pdf'
        ? { sourceKey: 'full', sourceVersionId, sourceOrder: 1 }
        : {
            sourceKey: `source-${sourceVersionId}`,
            sourceVersionId,
            sourceOrder: current.length + 1,
            ownerNodeKey: ownerNodeKey ?? selectedNodeKey ?? nodes[0]?.nodeKey ?? '',
          };
      return normalizeSources(strategy, strategy === 'full_pdf' ? [next] : [...current, next]);
    });
    setMappingSourceKey((current) => current || (strategy === 'full_pdf' ? 'full' : `source-${sourceVersionId}`));
    emit('teacher_materials_book_assembly_source_bound', { sourceVersionId, ownerNodeKey, strategy });
  };

  const updateSourceOwner = (sourceVersionId: string, ownerNodeKey: string) => {
    setSources((current) => normalizeSources(strategy, current.map((source) =>
      source.sourceVersionId === sourceVersionId ? { ...source, ownerNodeKey } : source)));
    emit('teacher_materials_book_assembly_source_owner_changed', { sourceVersionId, ownerNodeKey });
  };

  const moveSource = (sourceVersionId: string, direction: -1 | 1) => {
    setSources((current) => {
      const ordered = normalizeSources(strategy, current);
      const index = ordered.findIndex((source) => source.sourceVersionId === sourceVersionId);
      const target = ordered[index + direction];
      const selected = ordered[index];
      if (!target || !selected) return current;
      return normalizeSources(strategy, ordered.map((source) => {
        if (source.sourceVersionId === selected.sourceVersionId) return { ...source, sourceOrder: target.sourceOrder };
        if (source.sourceVersionId === target.sourceVersionId) return { ...source, sourceOrder: selected.sourceOrder };
        return source;
      }));
    });
    emit('teacher_materials_book_assembly_source_reordered', { sourceVersionId, direction });
  };

  const removeSource = (sourceVersionId: string) => {
    setSources((current) => normalizeSources(strategy, current.filter((source) => source.sourceVersionId !== sourceVersionId)));
    emit('teacher_materials_book_assembly_source_removed', { sourceVersionId });
  };

  const addMapping = () => {
    if (!selectedUnitKey) {
      setValidationMessage('Add or select a Unit before mapping pages.');
      return;
    }
    const parsedPages = parsePhysicalPageList(mappingPages);
    if (parsedPages.error || parsedPages.pages.length === 0) {
      setValidationMessage(parsedPages.error ?? 'Enter at least one one-based physical page number.');
      return;
    }
    const sourceKey = availableMappingSources.some((source) => source.sourceKey === mappingSourceKey)
      ? mappingSourceKey
      : availableMappingSources[0]?.sourceKey;
    const selectedSource = availableMappingSources.find((source) => source.sourceKey === sourceKey);
    if (!sourceKey || !selectedSource) {
      setValidationMessage('Bind a verified Source Version before mapping pages.');
      return;
    }
    const sourceVersion = sourceVersions.find((value) => value.sourceVersionId === selectedSource.sourceVersionId);
    const overRange = parsedPages.pages.find((page) => sourceVersion && page > sourceVersion.physicalPageCount);
    if (overRange !== undefined) {
      setValidationMessage(`Physical page ${overRange} is outside ${sourceKey}'s ${sourceVersion?.physicalPageCount ?? 0} pages.`);
      return;
    }
    const defaultPage = Number(mappingDefaultPage);
    if (!Number.isSafeInteger(defaultPage) || !parsedPages.pages.includes(defaultPage)) {
      setValidationMessage('Default physical page must be one of the mapped pages.');
      return;
    }
    const normalizedActivityKey = mappingActivityKey.trim();
    if (mappingMode === 'activity' && normalizedActivityKey.length === 0) {
      setValidationMessage('Activity key is required for Activity Page Groups.');
      return;
    }
    if (guidedUiVariant === 'mockup'
      && mappingMode === 'activity'
      && !selectedUnit?.activitySlots.some((slot) => slot.activityKey === normalizedActivityKey)) {
      setValidationMessage('Choose an activity from this Unit before connecting pages.');
      return;
    }
    const pageGroupKey = `pages-${sourceKey}-${parsedPages.pages.join('-')}-${mappingMode === 'reference_only' ? 'reference' : 'activity'}`;
    setUnits((current) => {
      const currentUnit = current.find((unit) => unit.unitKey === selectedUnitKey);
      const nextUnit = upsertPageGroupMapping({
        unit: currentUnit,
        unitKey: selectedUnitKey,
        pageGroupKey,
        sourceKey,
        pages: parsedPages.pages,
        mode: mappingMode,
        activityKey: normalizedActivityKey,
        contextRequirement: mappingContextRequirement,
        defaultPhysicalPageNumber: defaultPage,
      });
      return [
        ...current.filter((unit) => unit.unitKey !== selectedUnitKey),
        nextUnit,
      ];
    });
    setValidationMessage(null);
    emit('teacher_materials_book_assembly_page_group_mapped', {
      unitKey: selectedUnitKey,
      pageGroupKey,
      sourceKey,
      mode: mappingMode,
      activityKey: mappingMode === 'activity' ? normalizedActivityKey : undefined,
    });
  };

  const moveActivitySlot = (activityKey: string, direction: -1 | 1) => {
    if (!selectedUnitKey) return;
    setUnits((current) => current.map((unit) =>
      unit.unitKey === selectedUnitKey ? reorderActivitySlot(unit, activityKey, direction) : unit));
    emit('teacher_materials_book_assembly_activity_slot_reordered', { unitKey: selectedUnitKey, activityKey, direction });
  };

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || visibleTreeItems.length === 0) return;
    event.preventDefault();
    const focused = visibleTreeItems.find((item) => nodeButtonRefs.current[item.node.nodeKey] === document.activeElement);
    const activeKey = focused?.node.nodeKey ?? selectedNodeKey ?? visibleTreeItems[0]?.node.nodeKey;
    const activeIndex = Math.max(visibleTreeItems.findIndex((item) => item.node.nodeKey === activeKey), 0);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? visibleTreeItems.length - 1
        : Math.min(Math.max(activeIndex + (event.key === 'ArrowDown' ? 1 : -1), 0), visibleTreeItems.length - 1);
    requestNodeFocus(visibleTreeItems[nextIndex]?.node.nodeKey ?? null);
  };

  const persistManifest = async (
    validManifest: BookAssemblyManifestCandidate,
    unitKey: string,
  ): Promise<BookAssemblyMutationResult> => (
    candidate
      ? repository!.replace({
          operationId: operationId(),
          bookId,
          expectedBookRevision: effectiveBookRevision,
          expectedSourceSetRevision: effectiveSourceSetRevision,
          unitKey,
          candidateId: candidate.candidateId,
          expectedCandidateRevision: candidate.revision,
          manifest: validManifest,
        })
      : repository!.create({
          operationId: operationId(),
          bookId,
          expectedBookRevision: effectiveBookRevision,
          expectedSourceSetRevision: effectiveSourceSetRevision,
          unitKey,
          manifest: validManifest,
        })
  );

  const save = async () => {
    if (access !== 'owner' && access !== 'administrator') return;
    const validation = validateBookAssemblyManifestCandidate(manifest, sourceAuthority);
    if (!validation.valid) {
      setValidationMessage(errorText(validation));
      setStatus('error');
      toast.error('Assembly changes need correction before saving.');
      return;
    }
    if (!repository) {
      setValidationMessage('Assembly save is unavailable until the trusted 13A route is configured.');
      setStatus('error');
      return;
    }
    const unitKey = selectedUnitKey;
    if (!unitKey) {
      setValidationMessage('Select or add a Unit before saving an Assembly candidate.');
      setStatus('error');
      toast.error('Select a Unit before saving the Assembly draft.');
      return;
    }
    const validManifest = manifest as unknown as BookAssemblyManifestCandidate;
    setStatus('saving');
    setValidationMessage(null);
    setErrorMessage(null);
    try {
      if (validManifest.sourceSet.sourceStrategy === 'component_pdfs'
        && sourceSetAttachmentClient
        && JSON.stringify(attachedSourceSet) !== JSON.stringify(validManifest.sourceSet)) {
        const attachment = await sourceSetAttachmentClient.attachSourceSet({
          bookId,
          operationId: operationId(),
          expectedBookRevision: effectiveBookRevision,
          expectedSourceSetRevision: effectiveSourceSetRevision,
          sourceSet: validManifest.sourceSet,
        });
        setEffectiveBookRevision(attachment.bookRevision);
        setEffectiveSourceSetRevision(attachment.sourceSetRevision);
        setAttachedSourceSet(attachment.sourceSet);
      }
      let result: BookAssemblyMutationResult = await persistManifest(validManifest, unitKey);
      if (validateCandidateAfterSave && result.candidate && result.candidate.lifecycle !== 'validated') {
        result = await repository.validate({
          operationId: operationId(),
          bookId,
          unitKey,
          candidateId: result.candidate.candidateId,
          expectedCandidateRevision: result.candidate.revision,
        });
      }
      if (result.status === 'conflict') {
        setStatus('conflict');
        toast.warning('Assembly changed elsewhere. Reload, retry, or discard local changes.');
        return;
      }
      if (!result.candidate) {
        setStatus('error');
        const message = mutationErrorMessage(result);
        setErrorMessage(message);
        toast.error(message);
        return;
      }
      setCandidate(result.candidate);
      setSavedSnapshot(draftSnapshot(validManifest.sourceSet.sourceStrategy, validManifest.nodes, validManifest.sourceSet.sources, validManifest.units));
      onDirtyChange?.(false);
      setStatus('saved');
      toast.success('Assembly draft saved.');
      emit('teacher_materials_book_assembly_saved', { candidateId: result.candidate.candidateId, revision: result.candidate.revision });
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Assembly save failed.');
      toast.error('Assembly draft could not be saved.');
    }
  };

  const applyExactReconciliationRepair = async () => {
    const repairedManifest = reconciliationReport.repairedManifest;
    const unitKey = selectedUnitKey;
    if (!repairedManifest || !unitKey || !repository || reconciliationBusy) return;
    setReconciliationBusy(true);
    setStatus('saving');
    setValidationMessage(null);
    setErrorMessage(null);
    try {
      const validation = validateBookAssemblyManifestCandidate(repairedManifest, sourceAuthority);
      if (!validation.valid) {
        setStatus('error');
        setValidationMessage(errorText(validation));
        toast.error('Exact repair did not pass candidate validation.');
        emit('teacher_materials_book_assembly_reconciliation_repair_failed', { code: 'validation' });
        return;
      }
      const result = await persistManifest(repairedManifest, unitKey);
      if (result.status === 'conflict') {
        setStatus('conflict');
        toast.warning('Assembly changed elsewhere. Exact repair was not saved.');
        emit('teacher_materials_book_assembly_reconciliation_repair_failed', { code: 'conflict' });
        return;
      }
      if (!result.candidate) {
        const message = mutationErrorMessage(result);
        setStatus('error');
        setErrorMessage(message);
        toast.error(message);
        emit('teacher_materials_book_assembly_reconciliation_repair_failed', { code: result.status });
        return;
      }
      applyDraft(repairedManifest, result.candidate);
      setStatus('saved');
      onDirtyChange?.(false);
      toast.success('Exact Assembly repairs saved.');
      emit('teacher_materials_book_assembly_reconciliation_repair_applied', {
        candidateId: result.candidate.candidateId,
        revision: result.candidate.revision,
      });
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Exact Assembly repair failed.');
      toast.error('Exact Assembly repair could not be saved.');
      emit('teacher_materials_book_assembly_reconciliation_repair_failed', { code: 'unknown' });
    } finally {
      setReconciliationBusy(false);
    }
  };

  const recordTeacherChoiceNeeded = () => {
    toast.info('Choose the intended source and Activity mapping before saving.');
    emit('teacher_materials_book_assembly_reconciliation_teacher_choice_recorded', {
      issueCount: reconciliationReport.issues.filter((entry) => entry.repair === 'teacher-choice').length,
    });
  };

  const copyUnitPrompt = (copied: boolean) => {
    if (copied) {
      setManualCopyFallback(false);
      toast.success('Unit prompt copied.');
      emit('teacher_materials_book_assembly_unit_prompt_copied', { unitKey: selectedUnitKey });
      return;
    }
    setManualCopyFallback(true);
    toast.warning('Clipboard was blocked. Manual copy fallback is available.');
    emit('teacher_materials_book_assembly_unit_prompt_manual_copy_shown', { unitKey: selectedUnitKey });
  };

  const cancelUnitImport = () => {
    if (!unitImportCancelable) {
      setUnitImportStatus('Import is committing and can no longer be canceled safely.');
      toast.info('Import is committing and can no longer be canceled safely.');
      return;
    }
    unitImportAbortRef.current?.abort();
    setUnitImportBusy(false);
    setUnitImportCancelable(false);
    setUnitImportStatus('Import canceled. Existing draft was kept.');
    toast.info('Unit Activity import canceled.');
    emit('teacher_materials_book_assembly_unit_import_canceled', { unitKey: selectedUnitKey });
  };

  const handleUnitImportFileReadError = () => {
    setUnitImportStatus('Could not read Unit Activity JSON file.');
    toast.error('Could not read Unit Activity JSON file.');
    emit('teacher_materials_book_assembly_unit_import_failed', {
      unitKey: selectedUnitKey,
      code: 'file-read-failed',
    });
  };

  const importUnitJson = async () => {
    const unitKey = selectedUnitKey;
    if (!unitKey) {
      setValidationMessage('Select a Unit before importing Activity JSON.');
      return;
    }
    if (!repository || !activityAuthoring) {
      setValidationMessage('Unit import is unavailable until trusted 12C and 13A routes are configured.');
      setStatus('error');
      toast.error('Unit Activity import route is unavailable.');
      return;
    }
    const validation = validateBookAssemblyManifestCandidate(manifest, sourceAuthority);
    if (!validation.valid) {
      setValidationMessage(errorText(validation));
      setStatus('error');
      toast.error('Assembly changes need correction before importing Activities.');
      return;
    }
    const controller = new AbortController();
    unitImportAbortRef.current = controller;
    setUnitImportBusy(true);
    setUnitImportCancelable(true);
    setUnitImportStatus('Validating Unit JSON...');
    setStatus('saving');
    setValidationMessage(null);
    setErrorMessage(null);
    emit('teacher_materials_book_assembly_unit_import_started', { unitKey });
    try {
      const validManifest = manifest as unknown as BookAssemblyManifestCandidate;
      const importResult = await stageUnitActivityImportBundle({
        text: unitImportText,
        manifest: validManifest,
        unitKey,
        activityAuthoring,
        resolveActivityTargetId: (slot) => {
          const unit = validManifest.units.find((entry) => entry.unitKey === unitKey);
          return unit?.activitySlots.some((entry) => entry.activityKey === slot.activityKey)
            ? slot.activityKey
            : null;
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setUnitImportStatus('Saving Assembly candidate revision...');
      setUnitImportCancelable(false);
      if (controller.signal.aborted) {
        await discardStagedUnitActivities(activityAuthoring, importResult.staged);
        setUnitImportStatus('Import canceled. Existing draft was kept.');
        return;
      }
      const result = await persistManifest(validManifest, unitKey);
      if (result.status === 'conflict') {
        await discardStagedUnitActivities(activityAuthoring, importResult.staged);
        setStatus('conflict');
        setUnitImportStatus('Assembly changed elsewhere. Imported Activities were rolled back; reload or retry.');
        toast.warning('Assembly changed elsewhere. Imported Activities were rolled back.');
        return;
      }
      if (!result.candidate) {
        const message = mutationErrorMessage(result);
        await discardStagedUnitActivities(activityAuthoring, importResult.staged);
        setStatus('error');
        setErrorMessage(message);
        setUnitImportStatus(message);
        toast.error(message);
        return;
      }
      setCandidate(result.candidate);
      setSavedSnapshot(draftSnapshot(validManifest.sourceSet.sourceStrategy, validManifest.nodes, validManifest.sourceSet.sources, validManifest.units));
      setUnitImportText('');
      setUnitImportStatus(`Imported ${importResult.staged.length} Activity slot${importResult.staged.length === 1 ? '' : 's'}.`);
      onDirtyChange?.(false);
      setStatus('saved');
      toast.success('Unit Activity JSON imported.');
      emit('teacher_materials_book_assembly_unit_import_staged', {
        unitKey,
        candidateId: result.candidate.candidateId,
        revision: result.candidate.revision,
        slotCount: importResult.staged.length,
      });
    } catch (error) {
      const message = error instanceof UnitActivityImportError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unit Activity import failed.';
      setStatus('error');
      setUnitImportStatus(message);
      setErrorMessage(message);
      toast.error('Unit Activity import failed.');
      emit('teacher_materials_book_assembly_unit_import_failed', {
        unitKey,
        code: error instanceof UnitActivityImportError ? error.code : 'unknown',
      });
    } finally {
      if (unitImportAbortRef.current === controller) unitImportAbortRef.current = null;
      setUnitImportCancelable(false);
      setUnitImportBusy(false);
    }
  };

  const reload = async () => {
    if (!repository || !candidate) return;
    try {
      const loaded = await repository.load(bookId, candidate.unitKey, candidate.candidateId);
      if (!loaded.candidate.manifest) {
        setErrorMessage('Current Assembly draft has no manifest.');
        setStatus('error');
        return;
      }
      applyDraft(loaded.candidate.manifest, loaded.candidate);
      setStatus('idle');
      toast.info('Assembly draft reloaded.');
      emit('teacher_materials_book_assembly_conflict_reloaded', { candidateId: candidate.candidateId });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Assembly reload failed.');
      setStatus('error');
    }
  };

  const retryLocal = () => {
    setStatus('idle');
    emit('teacher_materials_book_assembly_conflict_retry_selected', { candidateId: candidate?.candidateId });
  };

  const discardLocal = () => {
    applyDraft(candidate?.manifest ?? emptyManifest(bookId), candidate?.manifest ? candidate : null);
    setStatus('idle');
    emit('teacher_materials_book_assembly_local_discarded', { candidateId: candidate?.candidateId });
  };

  const guidedStepOrder = ['mode', 'outline', 'pages', 'review'] as const;
  const guidedStepNumber = guidedStepOrder.indexOf(guidedStep) + 1;
  const guidedHasSource = normalizedSources.length > 0;
  const guidedHasUnit = Boolean(selectedUnitKey);
  const guidedCanLeaveMode = strategy === 'full_pdf'
    ? guidedHasSource
    : guidedHasSource && nodes.some((node) => isStructuralNodeType(node.nodeType));
  const guidedStepLabels: Record<typeof guidedStep, { title: string; summary: string }> = {
    mode: { title: 'Choose your Book type', summary: 'One complete PDF or a set of PDFs' },
    outline: { title: 'Build the Book outline', summary: 'Add sections and import Unit content' },
    pages: { title: 'Connect pages to activities', summary: 'Choose the pages students will see' },
    review: { title: 'Review and preview', summary: 'Resolve issues, then save your draft' },
  };

  const mockupSourceLabel = (sourceKey: string) => {
    const source = normalizedSources.find((value) => value.sourceKey === sourceKey);
    const version = source ? sourceVersions.find((value) => value.sourceVersionId === source.sourceVersionId) : undefined;
    return sourceKey === 'full' ? 'Complete Book PDF' : version ? `PDF ${normalizedSources.findIndex((value) => value.sourceKey === sourceKey) + 1}` : sourceKey;
  };

  const renderMockupGuided = () => {
    const mockupHasStructure = nodes.some((node) => isStructuralNodeType(node.nodeType));
    const mockupHasContent = Boolean(selectedUnit?.activitySlots.length);
    const mockupRows = selectedUnit?.activitySlots ?? [];
    const mockupGroupFor = (slot: typeof mockupRows[number]) => selectedUnit?.pageGroups.find((pageGroup) =>
      slot.pageGroupKeys.includes(pageGroup.pageGroupKey) && pageGroup.pages.length > 0);
    const mockupMissingActivities = mockupRows
      .filter((slot) => !mockupGroupFor(slot))
      .map((slot) => slot.activityKey);
    const mockupHasPages = mockupRows.length > 0 && mockupMissingActivities.length === 0;
    const mockupReviewReady = reconciliationReport.issues.length === 0 && Boolean(candidate);

    if (guidedStep === 'outline' && strategy === 'component_pdfs') {
      const componentSources = [
        ...sourceVersions
          .filter((version) => version.verifiedUsable)
          .map((version, index) => ({
            version,
            source: sources.find((value) => value.sourceVersionId === version.sourceVersionId) ?? {
              sourceKey: `source-${version.sourceVersionId}`,
              sourceVersionId: version.sourceVersionId,
              sourceOrder: index + 1,
            },
          })),
        ...sources
          .filter((source) => !sourceVersions.some((version) => version.sourceVersionId === source.sourceVersionId))
          .map((source) => ({ source, version: undefined })),
      ].sort((left, right) => left.source.sourceOrder - right.source.sourceOrder);
      const componentStructureReady = componentSources.length > 0
        && componentSources.every(({ source }) => Boolean(source.ownerNodeKey));
      const componentContentReady = componentSources.length > 0
        && componentSources.every(({ source }) => {
          if (!source.ownerNodeKey) return false;
          const ownerUnit = nodes.find((node) => node.nodeKey === source.ownerNodeKey && node.nodeType === 'unit')
            ?? nodes.find((node) => node.nodeType === 'unit' && node.parentNodeKey === source.ownerNodeKey);
          return Boolean(ownerUnit && units.find((unit) => unit.unitKey === ownerUnit.nodeKey)?.activitySlots.length);
        });
      return (
        <section className="book-assembly-mockup" aria-labelledby="book-assembly-mockup-components-title">
          <div className="pbf-surface">
            <div className="pbf-row">
              <div>
                <h3 id="book-assembly-mockup-components-title">Give each PDF a place</h3>
                <p className="pbf-muted">Each PDF gets its own section and Unit content. Nothing is merged behind the scenes.</p>
              </div>
              <span className={`pbf-status${componentStructureReady ? ' is-good' : ''}`}>
                {componentSources.filter(({ source }) => Boolean(source.ownerNodeKey)).length} of {componentSources.length} placed
              </span>
            </div>
            <div className="pbf-source-list" style={{ marginTop: 14 }}>
              {componentSources.map(({ source, version }, index) => {
                const placed = Boolean(source.ownerNodeKey);
                return (
                  <div className="pbf-source" key={source.sourceVersionId}>
                    <span className="pbf-file-symbol" aria-hidden="true">{index + 1}</span>
                    <div>
                      <strong>{`PDF ${index + 1}`}</strong>
                      <span>{version ? `${version.physicalPageCount} pages` : 'Verified PDF'}</span>
                      <span>{placed ? 'A section and Unit are ready for this PDF.' : 'Add a section and Unit for this PDF.'}</span>
                    </div>
                    {placed
                      ? <span className="pbf-status is-good">Placed</span>
                      : <button type="button" className="pbf-button pbf-button-primary" onClick={() => addComponentStructure(source.sourceVersionId)}>Add structure</button>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pbf-surface">
            <div className="pbf-row">
              <div>
                <h3>Unit content</h3>
                <p className="pbf-muted">Add the activities for the selected PDF section.</p>
              </div>
              {mockupHasContent && <span className="pbf-status is-good">Added</span>}
            </div>
            {mockupHasContent
              ? <div className="pbf-callout is-good" style={{ marginTop: 12 }}><strong>Unit content is ready</strong><span>{selectedUnit?.activitySlots.length ?? 0} activities will use this PDF section.</span></div>
              : <p className="pbf-muted" style={{ marginTop: 12 }}>Add the activities for this Unit to continue.</p>}
            <div className="pbf-actions" style={{ marginTop: 14 }}><button type="button" className="pbf-button pbf-button-primary" disabled={!guidedHasUnit} onClick={() => setMockupUnitToolsOpen((open) => !open)}>{mockupHasContent ? 'Replace Unit content' : 'Add Unit content'}</button></div>
            {mockupUnitToolsOpen && <div className="pbf-mockup-advanced"><UnitActivityImportControls guided busy={unitImportBusy} canCancel={unitImportCancelable} importText={unitImportText} manualCopyFallback={manualCopyFallback} onCancel={cancelUnitImport} onCopyPrompt={copyUnitPrompt} onFileReadError={handleUnitImportFileReadError} onImport={() => void importUnitJson()} onImportTextChange={setUnitImportText} promptText={unitPromptText} selectedUnitKey={selectedUnitKey} statusText={unitImportStatus} /></div>}
          </div>
          <div className="pbf-surface">
            <div className="pbf-row">
              <div>
                <h3>Order in the Book</h3>
                <p className="pbf-muted">Students will see these component PDFs in this order.</p>
              </div>
              <button
                type="button"
                className="pbf-button"
                disabled={normalizedSources.length < 2}
                onClick={() => { const first = normalizedSources[0]; if (first) moveSource(first.sourceVersionId, 1); }}
              >
                Move first PDF down
              </button>
            </div>
            <ol className="pbf-tree" style={{ marginTop: 14 }} aria-label="Component PDF order">
              {normalizedSources.map((source, index) => <li key={source.sourceVersionId}><strong>{`PDF ${index + 1}`}</strong><small>{source.ownerNodeKey ? 'Structure added' : 'Needs structure'}</small></li>)}
            </ol>
          </div>
          <details className="pbf-details"><summary>What happens to page numbers?</summary><p>Each PDF keeps its own page numbers. When you connect an activity later, choose the PDF first and then its page.</p></details>
          {(validationMessage || errorMessage) && <p className="book-assembly-guided__error" role="alert">{validationMessage ?? errorMessage}</p>}
          <div className="book-assembly-guided__footer-actions pbf-actions" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="pbf-button" onClick={() => setGuidedStep('mode')}>Back</button>
            <button type="button" className="pbf-button pbf-button-primary" disabled={!componentStructureReady || !componentContentReady} onClick={() => setGuidedStep('pages')}>Continue</button>
          </div>
        </section>
      );
    }

    if (guidedStep === 'outline') {
      return (
        <section className="book-assembly-mockup" aria-labelledby="book-assembly-mockup-outline-title">
          <div className="pbf-two-col">
            <div className="pbf-surface">
              <div className="pbf-row"><h3 id="book-assembly-mockup-outline-title">Book outline</h3>{mockupHasStructure && <span className="pbf-status is-good">Added</span>}</div>
              {visibleTreeItems.length > 0 ? (
                <ul className="pbf-tree" style={{ marginTop: 12 }} aria-label="Book outline">
                  {visibleTreeItems.map(({ node, level }, index) => {
                    const unitNumber = visibleTreeItems
                      .slice(0, index + 1)
                      .filter(({ node: previousNode }) => previousNode.nodeType === 'unit').length;
                    const sectionNumber = visibleTreeItems
                      .slice(0, index + 1)
                      .filter(({ node: previousNode }) => previousNode.nodeType === 'section').length;
                    return (
                    <li key={node.nodeKey} className={selectedNodeKey === node.nodeKey ? 'is-current' : undefined} style={{ marginLeft: Math.max(0, level - 1) * 12 }}>
                      <button type="button" className="pbf-button-link" onClick={() => requestNodeFocus(node.nodeKey)}>{node.nodeType === 'unit' ? `Unit ${unitNumber}` : node.nodeType === 'section' ? `Section ${sectionNumber}` : node.nodeType}</button>
                    </li>
                    );
                  })}
                </ul>
              ) : <p className="pbf-muted" style={{ marginTop: 9 }}>Your outline will appear here after you import it.</p>}
              <input ref={structureImportInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void importMockupStructure(file); }} />
              <div className="pbf-actions" style={{ marginTop: 14 }}>
                <button type="button" className="pbf-button pbf-button-primary" onClick={() => structureImportInputRef.current?.click()}>Import Book structure</button>
                <button type="button" className="pbf-button" onClick={() => addNode('section')}>Add a section</button>
              </div>
              {mockupHasStructure && <div className="pbf-actions" style={{ marginTop: 10 }}><button type="button" className="pbf-button" onClick={() => addNode('unit')}>Add another Unit</button></div>}
            </div>
            <div className="pbf-surface">
              <div className="pbf-row"><div><h3>Unit 1 content</h3><p className="pbf-muted">The activities students will complete.</p></div>{mockupHasContent && <span className="pbf-status is-good">Added</span>}</div>
              {mockupHasContent ? <div className="pbf-callout is-good" style={{ marginTop: 12 }}><strong>Unit content is ready</strong><span>{selectedUnit?.activitySlots.length ?? 0} activities are waiting to be connected to PDF pages.</span></div> : <p className="pbf-muted" style={{ marginTop: 9 }}>Add the activities for the first Unit to continue.</p>}
              <div className="pbf-actions" style={{ marginTop: 14 }}><button type="button" className="pbf-button pbf-button-primary" disabled={!guidedHasUnit} onClick={() => setMockupUnitToolsOpen((open) => !open)}>{mockupHasContent ? 'Replace Unit content' : 'Add Unit 1 content'}</button></div>
              {mockupUnitToolsOpen && <div className="pbf-mockup-advanced"><UnitActivityImportControls guided busy={unitImportBusy} canCancel={unitImportCancelable} importText={unitImportText} manualCopyFallback={manualCopyFallback} onCancel={cancelUnitImport} onCopyPrompt={copyUnitPrompt} onFileReadError={handleUnitImportFileReadError} onImport={() => void importUnitJson()} onImportTextChange={setUnitImportText} promptText={unitPromptText} selectedUnitKey={selectedUnitKey} statusText={unitImportStatus} /></div>}
            </div>
          </div>
          <details className="pbf-details" style={{ marginTop: 14 }}><summary>Need help creating the content?</summary><p>Copy the Book or Unit prompt, create the JSON in your usual tool, then bring it back here. The current Book is not changed until the import is valid.</p></details>
          {(validationMessage || errorMessage) && <p className="book-assembly-guided__error" role="alert" style={{ marginTop: 14 }}>{validationMessage ?? errorMessage}</p>}
          <div className="book-assembly-guided__footer-actions pbf-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button type="button" className="pbf-button" onClick={() => setGuidedStep('mode')}>Back</button><button type="button" className="pbf-button pbf-button-primary" disabled={!mockupHasContent} onClick={() => setGuidedStep('pages')}>Continue</button></div>
        </section>
      );
    }

    if (guidedStep === 'pages') {
      return (
        <section className="book-assembly-mockup" aria-labelledby="book-assembly-mockup-pages-title">
          <div className="pbf-surface">
            <div className="pbf-table-wrap"><table className="pbf-map"><thead><tr><th id="book-assembly-mockup-pages-title">Activity</th><th>PDF</th><th>Pages</th><th>Starts on</th></tr></thead><tbody>{mockupRows.map((slot) => {
              const group = mockupGroupFor(slot);
              const pages = group?.pages.join(', ') ?? '';
              const active = mappingActivityKey === slot.activityKey;
              return <tr key={slot.activityKey} className={!group ? 'is-error' : undefined}><td>{slot.activityKey}</td><td>{group ? mockupSourceLabel(group.sourceKey) : 'Choose a PDF'}</td><td><input aria-label={`${slot.activityKey} pages`} value={active ? mappingPages : pages} placeholder="Add pages" onFocus={() => { setMappingActivityKey(slot.activityKey); setMappingPages(pages); setMappingDefaultPage(String(group?.defaultPhysicalPageNumber ?? group?.pages[0] ?? 1)); setMappingSourceKey(group?.sourceKey ?? availableMappingSources[0]?.sourceKey ?? ''); }} onChange={(event) => { setMappingActivityKey(slot.activityKey); setMappingPages(event.target.value); }} /></td><td>{group?.defaultPhysicalPageNumber ?? group?.pages[0] ?? '—'}</td></tr>;
            })}</tbody></table></div>
            {mockupRows.length === 0 && <p className="pbf-muted" style={{ marginTop: 12 }}>Add Unit content before connecting activities to pages.</p>}
            {!mockupHasPages && mockupRows.length > 0 && <div className="pbf-callout is-warn" style={{ marginTop: 14 }}><strong>{mockupMissingActivities.length === 1 ? `${mockupMissingActivities[0]} still needs a page` : `${mockupMissingActivities.join(', ')} still need pages`}</strong><span>Add the page number above. The rest of the Book is safe while you finish this.</span></div>}
            {mockupHasPages && <div className="pbf-callout is-good" style={{ marginTop: 14 }}><strong>Pages are connected</strong><span>Every activity has a place in the {strategy === 'full_pdf' ? 'full PDF' : 'component PDF'} setup.</span></div>}
            <div className="pbf-actions" style={{ justifyContent: 'space-between', marginTop: 15 }}><button type="button" className="pbf-button" onClick={() => { setMappingMode('reference_only'); setMockupPageToolsOpen(true); }}>Add a reference page</button><button type="button" className="pbf-button pbf-button-primary" disabled={!mappingSourceKey || (mappingMode === 'activity' && !mappingActivityKey)} onClick={() => { addMapping(); setMockupPageToolsOpen(false); }}>Check these pages</button></div>
          </div>
          {mockupPageToolsOpen && <details className="pbf-details pbf-mockup-advanced" open><summary>Change page connections</summary><div className="book-assembly-guided__mapping-form" style={{ marginTop: 12 }}><label><span>PDF</span><select value={mappingSourceKey} onChange={(event) => setMappingSourceKey(event.target.value)}><option value="">Choose PDF</option>{availableMappingSources.map((source) => <option key={source.sourceKey} value={source.sourceKey}>{mockupSourceLabel(source.sourceKey)}</option>)}</select></label><label><span>Pages</span><input value={mappingPages} onChange={(event) => setMappingPages(event.target.value)} placeholder="1, 2" /></label><label><span>Starts on</span><input value={mappingDefaultPage} onChange={(event) => setMappingDefaultPage(event.target.value)} placeholder="1" /></label><label><span>Activity</span><input value={mappingActivityKey} onChange={(event) => setMappingActivityKey(event.target.value)} /></label><button type="button" className="pbf-button" onClick={() => { addMapping(); setMockupPageToolsOpen(false); }}>Save page connection</button></div></details>}
          {(validationMessage || errorMessage) && <p className="book-assembly-guided__error" role="alert" style={{ marginTop: 14 }}>{validationMessage ?? errorMessage}</p>}
          <div className="book-assembly-guided__footer-actions pbf-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button type="button" className="pbf-button" onClick={() => setGuidedStep('outline')}>Back</button><button type="button" className="pbf-button pbf-button-primary" disabled={!mockupHasPages} onClick={() => setGuidedStep('review')}>Continue</button></div>
        </section>
      );
    }

    if (guidedStep === 'review') {
      return (
        <section className="book-assembly-mockup" aria-labelledby="book-assembly-mockup-review-title">
          {reconciliationReport.issues.length > 0 && <div className="pbf-surface"><div className="pbf-callout is-warn"><strong>One small change needs your decision</strong><span>Activity 1 now points to new pages. Choose whether to keep the new pages.</span></div><div className="pbf-actions" style={{ marginTop: 14 }}><button type="button" className="pbf-button pbf-button-primary" onClick={() => void applyExactReconciliationRepair()}>Keep the new pages</button><button type="button" className="pbf-button" onClick={recordTeacherChoiceNeeded}>Keep the old page</button></div></div>}
          <div className="pbf-surface"><h3 id="book-assembly-mockup-review-title">Everything needed for Unit 1</h3><ul className="pbf-checklist" style={{ marginTop: 14 }}><li>PDF files are ready</li><li>Book structure and Unit content are ready</li><li>Every activity has connected pages</li><li>Changes have been reviewed</li></ul><div className="pbf-actions" style={{ justifyContent: 'flex-end', marginTop: 17 }}><span className={`pbf-status${mockupReviewReady ? ' is-good' : ' is-warn'}`}>{mockupReviewReady ? 'Ready for preview' : 'Save draft first'}</span><button type="button" className="pbf-button pbf-button-primary" disabled={!repository || !mockupHasPages || status === 'saving'} onClick={() => void save()}>{status === 'saving' ? 'Saving…' : 'Save draft'}</button></div></div>
          {(validationMessage || errorMessage) && <p className="book-assembly-guided__error" role="alert" style={{ marginTop: 14 }}>{validationMessage ?? errorMessage}</p>}
          <div className="book-assembly-guided__footer-actions pbf-actions" style={{ justifyContent: 'flex-end', marginTop: 18 }}><button type="button" className="pbf-button" onClick={() => setGuidedStep('pages')}>Back</button><button type="button" className="pbf-button pbf-button-primary" disabled={!candidate || candidate.lifecycle !== 'validated'} onClick={() => setGuidedStep('review')}>Continue</button></div>
        </section>
      );
    }

    return null;
  };

  if (guided) {
    if (guidedUiVariant === 'mockup') {
      return (
        <section className="book-assembly-workspace book-assembly-workspace--guided book-assembly-workspace--mockup" data-presentation={presentation} data-ui-variant="mockup" data-assembly-strategy={strategy} aria-label="Book structure and pages">
          {renderMockupGuided()}
        </section>
      );
    }
    return (
      <section
        className="book-assembly-workspace book-assembly-workspace--guided"
        data-presentation={presentation}
        data-assembly-strategy={strategy}
        aria-labelledby="book-assembly-title"
      >
        {!suppressGuidedChrome && <header className="book-assembly-guided__header">
          <div>
            <p className="book-assembly-workspace__eyebrow">Build your PDF Book</p>
            <h2 id="book-assembly-title">{bookTitle}</h2>
            <p>Bring your verified PDFs and Unit content together in four simple steps.</p>
          </div>
          <button type="button" onClick={() => void save()} disabled={status === 'saving' || !repository}>
            {status === 'saving' ? 'Saving…' : 'Save draft'}
          </button>
        </header>}

        {!suppressGuidedChrome && <nav className="book-assembly-guided__steps" aria-label="Book setup steps">
          <ol>
            {guidedStepOrder.map((step, index) => {
              const disabled = index > 0 && !guidedCanLeaveMode;
              const current = step === guidedStep;
              return (
                <li key={step} className={current ? 'is-current' : undefined}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-current={current ? 'step' : undefined}
                    onClick={() => setGuidedStep(step)}
                  >
                    <span aria-hidden="true">{index + 1}</span>
                    <span>
                      <strong>{guidedStepLabels[step].title}</strong>
                      <small>{guidedStepLabels[step].summary}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>}

        {migrationClient && candidate?.manifest && migrationRequestedStrategy && (
          <BookAssemblyStrategyMigrationPanel
            bookId={bookId}
            bookRevision={bookRevision}
            sourceSetRevision={sourceSetRevision}
            sourceVersions={sourceVersions}
            currentCandidate={candidate}
            targetStrategy={migrationRequestedStrategy}
            migrationClient={migrationClient}
            onCandidateConfirmed={(nextCandidate) => {
              if (!nextCandidate.manifest) return;
              applyDraft({
                bookId: nextCandidate.manifest.bookId,
                sourceSet: nextCandidate.manifest.sourceSet,
                nodes: nextCandidate.manifest.nodes,
                units: nextCandidate.manifest.units,
              }, nextCandidate);
              setGuidedStep('mode');
            }}
            onClosed={() => setMigrationRequestedStrategy(null)}
            onAction={emit}
          />
        )}

        {replacementPlanClient && replacementPlanRequest && (
          <BookReplacementPlanPanel
            bookTitle={bookTitle}
            client={replacementPlanClient}
            request={replacementPlanRequest}
            onConfirmationHandoff={onReplacementConfirmationHandoff}
            onAction={onAction}
          />
        )}

        {guidedStep === 'mode' && (
          <section className="book-assembly-guided__section" aria-labelledby="book-assembly-mode-title">
            <div className="book-assembly-guided__section-heading">
              <div>
                <p className="book-assembly-guided__kicker">Step 1 of 4</p>
                <h3 id="book-assembly-mode-title">How are your PDFs organized?</h3>
                <p>Choose the path that matches the files you have. You can change this before publishing.</p>
              </div>
            </div>
            {!suppressModeChoice && <div className="book-assembly-guided__mode-choice" role="radiogroup" aria-label="Book PDF type">
              <label className={strategy === 'full_pdf' ? 'is-selected' : undefined}>
                <input
                  type="radio"
                  name={`guided-assembly-strategy-${bookId}`}
                  value="full_pdf"
                  checked={strategy === 'full_pdf'}
                  onChange={() => selectStrategy('full_pdf')}
                />
                <span>
                  <strong>One complete PDF</strong>
                  <small>Use one file for the whole Book. You will upload one PDF and connect its pages to Units.</small>
                </span>
              </label>
              <label className={strategy === 'component_pdfs' ? 'is-selected' : undefined}>
                <input
                  type="radio"
                  name={`guided-assembly-strategy-${bookId}`}
                  value="component_pdfs"
                  checked={strategy === 'component_pdfs'}
                  onChange={() => selectStrategy('component_pdfs')}
                />
                <span>
                  <strong>Several component PDFs</strong>
                  <small>Use separate files for sections or chapters. Each PDF gets an owner and a place in the order.</small>
                </span>
              </label>
            </div>}

            <div className="book-assembly-guided__source-start">
              <div>
                <h4>{strategy === 'full_pdf' ? 'Choose the PDF for this Book' : 'Add the PDFs that make up this Book'}</h4>
                <p>
                  {strategy === 'full_pdf'
                    ? 'Only verified PDFs are available here. Binding a PDF does not upload or change the file.'
                    : 'Add each verified PDF, then place it under the section or chapter where students will use it.'}
                </p>
              </div>
              {strategy === 'component_pdfs' && nodes.every((node) => !isStructuralNodeType(node.nodeType)) && (
                <button type="button" onClick={() => addNode('section')}>Create first section</button>
              )}
            </div>

            <div className="book-assembly-guided__source-list" aria-label="Verified PDFs">
              {sourceVersions.length === 0 && <p role="status">No verified PDFs are ready yet. Go back to the upload step to add one.</p>}
              {sourceVersions.map((source, index) => {
                const bound = normalizedSources.find((item) => item.sourceVersionId === source.sourceVersionId);
                const canBind = source.verifiedUsable && (strategy === 'full_pdf' || nodes.some((node) => isStructuralNodeType(node.nodeType)));
                return (
                  <article key={source.sourceVersionId} className={bound ? 'is-bound' : undefined}>
                    <div className="book-assembly-guided__source-summary">
                      <span className="book-assembly-guided__source-number" aria-hidden="true">{index + 1}</span>
                      <div>
                        <strong>{strategy === 'full_pdf' ? 'Complete Book PDF' : `Component PDF ${index + 1}`}</strong>
                        <span>{source.physicalPageCount} pages · {source.verifiedUsable ? 'Ready to use' : 'Not ready'}</span>
                        <details>
                          <summary>Show file details</summary>
                          <span>Source Version: {source.sourceVersionId}</span>
                        </details>
                      </div>
                    </div>
                    {bound ? (
                      <span className="book-assembly-guided__bound-label">Added</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!canBind || (strategy === 'full_pdf' && guidedHasSource)}
                        onClick={() => setSource(source.sourceVersionId, strategy === 'component_pdfs' ? selectedNodeKey ?? nodes.find((node) => isStructuralNodeType(node.nodeType))?.nodeKey : undefined)}
                      >
                        {strategy === 'full_pdf' ? 'Use this PDF' : 'Add this PDF'}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>

            {strategy === 'component_pdfs' && normalizedSources.length > 0 && (
              <div className="book-assembly-guided__component-order" aria-label="Component PDF order">
                <h4>Component order</h4>
                <ol>
                  {normalizedSources.map((source) => (
                    <li key={source.sourceVersionId}>
                      <span>{source.sourceKey}</span>
                      <label>
                        <span className="book-assembly-guided__visually-hidden">Owner for {source.sourceKey}</span>
                        <select
                          aria-label={`Owner for ${source.sourceKey}`}
                          value={source.ownerNodeKey ?? ''}
                          onChange={(event) => updateSourceOwner(source.sourceVersionId, event.target.value)}
                        >
                          <option value="">Choose section</option>
                          {nodes.filter((node) => isStructuralNodeType(node.nodeType)).map((node) => (
                            <option key={node.nodeKey} value={node.nodeKey}>{nodeLabel(node)}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" aria-label={`Move ${source.sourceKey} up`} onClick={() => moveSource(source.sourceVersionId, -1)}>Move up</button>
                      <button type="button" aria-label={`Move ${source.sourceKey} down`} onClick={() => moveSource(source.sourceVersionId, 1)}>Move down</button>
                      <button type="button" aria-label={`Remove ${source.sourceKey}`} onClick={() => removeSource(source.sourceVersionId)}>Remove</button>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {!guidedCanLeaveMode && (
              <p className="book-assembly-guided__hint" role="status">
                {strategy === 'full_pdf'
                  ? 'Choose one ready PDF to continue.'
                  : 'Create a section and add at least one ready PDF to continue.'}
              </p>
            )}
            <div className="book-assembly-guided__footer-actions">
              <button type="button" disabled={!guidedCanLeaveMode} onClick={() => setGuidedStep('outline')}>Continue to outline</button>
            </div>
          </section>
        )}

        {guidedStep === 'outline' && (
          <section className="book-assembly-guided__section" aria-labelledby="book-assembly-outline-title">
            <div className="book-assembly-guided__section-heading">
              <div>
                <p className="book-assembly-guided__kicker">Step 2 of 4</p>
                <h3 id="book-assembly-outline-title">Build the Book outline</h3>
                <p>Add the structure students will follow. Then import the content for each Unit from its JSON file.</p>
              </div>
              <button type="button" onClick={() => setGuidedStep('mode')}>Back to PDF choice</button>
            </div>
            <div className="book-assembly-guided__outline-layout">
              <div className="book-assembly-guided__outline-tree">
                <div className="book-assembly-guided__subheading">
                  <h4>Book outline</h4>
                  <div className="book-assembly-workspace__actions">
                    {STRUCTURAL_NODE_TYPES.map((type) => (
                      <button key={type} type="button" onClick={() => addNode(type)}>Add {type}</button>
                    ))}
                  </div>
                </div>
                {visibleTreeItems.length === 0 ? (
                  <p role="status">Start with a section, chapter, or Unit.</p>
                ) : (
                  <ul role="tree" aria-label="Book outline" onKeyDown={handleTreeKeyDown}>
                    {visibleTreeItems.map(({ node, level }) => (
                      <li key={node.nodeKey} role="treeitem" aria-level={level} aria-selected={selectedNodeKey === node.nodeKey}>
                        <button
                          type="button"
                          ref={(element) => { nodeButtonRefs.current[node.nodeKey] = element; }}
                          style={{ '--tree-level': level } as CSSProperties}
                          onClick={() => requestNodeFocus(node.nodeKey)}
                        >
                          {nodeLabel(node)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedNodeKey && (
                  <div className="book-assembly-workspace__node-actions">
                    <button type="button" onClick={() => moveNode(-1)}>Move up</button>
                    <button type="button" onClick={() => moveNode(1)}>Move down</button>
                    <button type="button" onClick={deleteNode}>Delete</button>
                  </div>
                )}
              </div>
              <div className="book-assembly-guided__unit-import">
                {strategy === 'component_pdfs' && (
                  <div className="book-assembly-guided__component-units">
                    <h4>Unit content by component</h4>
                    <p>Select a Unit, add its JSON, then repeat for the other Units.</p>
                    {nodes.some((node) => node.nodeType === 'unit') ? (
                      <ul aria-label="Component Unit content status">
                        {nodes.filter((node) => node.nodeType === 'unit').map((node) => {
                          const unit = units.find((value) => value.unitKey === node.nodeKey);
                          return (
                            <li key={node.nodeKey}>
                              <button type="button" onClick={() => requestNodeFocus(node.nodeKey)}>{node.nodeKey}</button>
                              <span>{unit ? 'Content added' : 'Needs JSON'}</span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p role="status">Add a Unit to start adding component content.</p>}
                  </div>
                )}
                <UnitActivityImportControls
                  guided
                  busy={unitImportBusy}
                  canCancel={unitImportCancelable}
                  importText={unitImportText}
                  manualCopyFallback={manualCopyFallback}
                  onCancel={cancelUnitImport}
                  onCopyPrompt={copyUnitPrompt}
                  onFileReadError={handleUnitImportFileReadError}
                  onImport={() => void importUnitJson()}
                  onImportTextChange={setUnitImportText}
                  promptText={unitPromptText}
                  selectedUnitKey={selectedUnitKey}
                  statusText={unitImportStatus}
                />
              </div>
            </div>
            <div className="book-assembly-guided__footer-actions">
              <button type="button" onClick={() => setGuidedStep('mode')}>Back</button>
              <button type="button" disabled={!guidedHasUnit} onClick={() => setGuidedStep('pages')}>Continue to page mapping</button>
            </div>
            {!guidedHasUnit && <p className="book-assembly-guided__hint" role="status">Add or select a Unit to continue.</p>}
          </section>
        )}

        {guidedStep === 'pages' && (
          <section className="book-assembly-guided__section" aria-labelledby="book-assembly-pages-title">
            <div className="book-assembly-guided__section-heading">
              <div>
                <p className="book-assembly-guided__kicker">Step 3 of 4</p>
                <h3 id="book-assembly-pages-title">Connect pages to activities</h3>
                <p>Tell us which PDF pages belong with each activity. Page numbers are the printed order inside the selected PDF.</p>
              </div>
              <button type="button" onClick={() => setGuidedStep('outline')}>Back to outline</button>
            </div>
            <div className="book-assembly-guided__mapping-form">
              <label>
                <span>Unit</span>
                <select value={selectedUnitKey ?? ''} onChange={(event) => requestNodeFocus(event.target.value || null)} aria-label="Mapped Unit">
                  <option value="">Choose Unit</option>
                  {nodes.filter((node) => node.nodeType === 'unit').map((node) => <option key={node.nodeKey} value={node.nodeKey}>{node.nodeKey}</option>)}
                </select>
              </label>
              <label>
                <span>{strategy === 'full_pdf' ? 'Book PDF' : 'Component PDF'}</span>
                <select value={mappingSourceKey} onChange={(event) => setMappingSourceKey(event.target.value)} aria-label="Mapping source key">
                  <option value="">Choose PDF</option>
                  {availableMappingSources.map((source) => <option key={source.sourceKey} value={source.sourceKey}>{source.sourceKey}</option>)}
                </select>
              </label>
              <label>
                <span>PDF pages</span>
                <input aria-label="One-based physical pages" value={mappingPages} onChange={(event) => setMappingPages(event.target.value)} placeholder="1, 2" />
              </label>
              <label>
                <span>Open preview on page</span>
                <input aria-label="Default physical page" value={mappingDefaultPage} onChange={(event) => setMappingDefaultPage(event.target.value)} placeholder="1" />
              </label>
              <label>
                <span>Page group type</span>
                <select value={mappingMode} onChange={(event) => setMappingMode(event.target.value as PageGroupMode)} aria-label="Page Group mode">
                  <option value="activity">Activity pages</option>
                  <option value="reference_only">Reference pages</option>
                </select>
              </label>
              {mappingMode === 'activity' && (
                <>
                  <label>
                    <span>Activity</span>
                    <input aria-label="Activity key" value={mappingActivityKey} onChange={(event) => setMappingActivityKey(event.target.value)} />
                  </label>
                  <label>
                    <span>How the activity uses this page</span>
                    <select aria-label="Context requirement" value={mappingContextRequirement} onChange={(event) => setMappingContextRequirement(event.target.value as ActivityContextRequirement)}>
                      <option value="required">Always show it</option>
                      <option value="optional">Show when needed</option>
                      <option value="none">Reference only</option>
                    </select>
                  </label>
                </>
              )}
              <button type="button" onClick={addMapping}>Add these pages</button>
            </div>
            {selectedUnit && (
              <PageGroupMappingSummary selectedUnit={selectedUnit} missingRequiredActivityKeys={selectedUnitMissingContext} onMoveActivitySlot={moveActivitySlot} />
            )}
            {(validationMessage || errorMessage) && <p className="book-assembly-guided__error" role="alert">{validationMessage ?? errorMessage}</p>}
            <div className="book-assembly-guided__footer-actions">
              <button type="button" onClick={() => setGuidedStep('outline')}>Back</button>
              <button type="button" onClick={() => setGuidedStep('review')}>Continue to review</button>
            </div>
          </section>
        )}

        {guidedStep === 'review' && (
          <section className="book-assembly-guided__section" aria-labelledby="book-assembly-review-title">
            <div className="book-assembly-guided__section-heading">
              <div>
                <p className="book-assembly-guided__kicker">Step 4 of 4</p>
                <h3 id="book-assembly-review-title">Review and preview</h3>
                <p>Resolve anything that needs your decision, then preview the exact pages and save the draft.</p>
              </div>
              <button type="button" onClick={() => setGuidedStep('pages')}>Back to page mapping</button>
            </div>
            <div className="book-assembly-guided__review-grid" aria-label="Book review summary">
              <div><span>Current Book</span><strong>{candidate?.manifest ? `${candidate.manifest.nodes.length} outline items` : 'New draft'}</strong></div>
              <div><span>Proposed Book</span><strong>{nodes.length} outline items · {normalizedSources.length} PDF{normalizedSources.length === 1 ? '' : 's'}</strong></div>
              <div><span>Decision</span><strong>{reconciliationReport.issues.length === 0 ? 'Ready for preview' : `${reconciliationReport.issues.length} item${reconciliationReport.issues.length === 1 ? '' : 's'} to resolve`}</strong></div>
            </div>
            <BookAssemblyReconciliationPanel
              busy={reconciliationBusy}
              report={reconciliationReport}
              onApplyExactRepair={() => void applyExactReconciliationRepair()}
              onRecordTeacherChoice={recordTeacherChoiceNeeded}
            />
            <section className="book-assembly-guided__preview" aria-labelledby="book-assembly-preview-title">
              <div className="book-assembly-guided__subheading">
                <div>
                  <h4 id="book-assembly-preview-title">Preview the Book</h4>
                  <p>Preview uses the current saved candidate and authorized PDF pages. Nothing is published from preview.</p>
                </div>
              </div>
              <BookAssemblyMappingViewerHost
                bookTitle={bookTitle}
                documents={currentPreviewDocuments}
                sourceVersions={sourceVersions}
                selectedSourceVersionId={selectedPreviewSourceVersionId}
                selectedUnit={selectedUnit}
                getIdToken={previewGetIdToken}
                onDocumentSelected={selectPreviewDocument}
                onViewerPageSelected={handleViewerPageSelected}
                onError={(message) => setValidationMessage(message)}
              />
            </section>
            {currentRuntimePreview ? (
              <BookAssemblyUnitPreview preview={currentRuntimePreview.preview} onExit={() => setDismissedRuntimePreviewIdentity(currentRuntimePreview.identity)} />
            ) : null}
            <div className="book-assembly-guided__publish-note" role="status">
              <strong>Ready for the next release step</strong>
              <span>Save this draft after review. Trusted publication is kept behind the publication service and is not simulated here.</span>
            </div>
            <div className="book-assembly-guided__footer-actions">
              <button type="button" onClick={() => setGuidedStep('pages')}>Back</button>
              <button type="button" onClick={() => void save()} disabled={status === 'saving' || !repository}>
                {status === 'saving' ? 'Saving…' : 'Save draft'}
              </button>
            </div>
            {status === 'conflict' && (
              <div className="book-assembly-guided__error" role="alert">
                <p>The current draft changed elsewhere. Choose what to do before saving again.</p>
                <button type="button" onClick={() => void reload()}>Reload current</button>
                <button type="button" onClick={retryLocal}>Retry my changes</button>
                <button type="button" onClick={discardLocal}>Discard my changes</button>
              </div>
            )}
            {(validationMessage || errorMessage) && <p className="book-assembly-guided__error" role="alert">{validationMessage ?? errorMessage}</p>}
          </section>
        )}

        {!suppressGuidedChrome && <p className="book-assembly-guided__progress" role="status">Step {guidedStepNumber} of 4 · {guidedStepLabels[guidedStep].title}</p>}
      </section>
    );
  }

  return (
    <section className="book-assembly-workspace" data-presentation={presentation} aria-labelledby="book-assembly-title">
      <header className="book-assembly-workspace__header">
        <div>
          <p className="book-assembly-workspace__eyebrow">Mode 2 Assembly</p>
          <h2 id="book-assembly-title">{bookTitle}</h2>
          <p>Configure verified Source Versions and ordered Book hierarchy.</p>
        </div>
        <button type="button" onClick={() => void save()} disabled={status === 'saving' || !repository}>
          {status === 'saving' ? 'Saving...' : 'Save draft'}
        </button>
      </header>

      <section className="book-assembly-workspace__strategy" aria-labelledby="book-assembly-strategy-title">
        <h2 id="book-assembly-strategy-title">Source strategy</h2>
        {BOOK_SOURCE_STRATEGIES.map((value) => (
          <label key={value}>
            <input type="radio" name={`assembly-strategy-${bookId}`} checked={strategy === value} onChange={() => selectStrategy(value)} />
            {value === 'full_pdf' ? 'Full PDF' : 'Component PDFs'}
          </label>
        ))}
        <p>Only verified, ready Source Versions can be selected. Mode 1 controls are not available.</p>
      </section>

      {migrationClient && candidate?.manifest && migrationRequestedStrategy && (
        <BookAssemblyStrategyMigrationPanel
          bookId={bookId}
          bookRevision={bookRevision}
          sourceSetRevision={sourceSetRevision}
          sourceVersions={sourceVersions}
          currentCandidate={candidate}
          targetStrategy={migrationRequestedStrategy}
          migrationClient={migrationClient}
          onCandidateConfirmed={(nextCandidate) => {
            if (!nextCandidate.manifest) return;
            applyDraft({
              bookId: nextCandidate.manifest.bookId,
              sourceSet: nextCandidate.manifest.sourceSet,
              nodes: nextCandidate.manifest.nodes,
              units: nextCandidate.manifest.units,
            }, nextCandidate);
          }}
          onClosed={() => setMigrationRequestedStrategy(null)}
          onAction={emit}
        />
      )}

      {replacementPlanClient && replacementPlanRequest && (
        <BookReplacementPlanPanel
          bookTitle={bookTitle}
          client={replacementPlanClient}
          request={replacementPlanRequest}
          onConfirmationHandoff={onReplacementConfirmationHandoff}
          onAction={onAction}
        />
      )}

      <section className="book-assembly-workspace__sources" aria-labelledby="book-assembly-sources-title">
        <h2 id="book-assembly-sources-title">Verified Source Versions</h2>
        {sourceVersions.length === 0 && <p role="status">No verified Source Versions available.</p>}
        {sourceVersions.map((source) => {
          const bound = normalizedSources.some((candidateSource) => candidateSource.sourceVersionId === source.sourceVersionId);
          return (
            <article key={source.sourceVersionId} className={bound ? 'is-bound' : undefined}>
              <div>
                <strong>{source.sourceVersionId}</strong>
                <span>{source.physicalPageCount} pages - {source.verifiedUsable ? 'Ready' : 'Unavailable'}</span>
              </div>
              <button type="button" disabled={!source.verifiedUsable || bound} onClick={() => setSource(source.sourceVersionId, strategy === 'component_pdfs' ? selectedNodeKey ?? undefined : undefined)}>
                {bound ? 'Bound' : 'Bind'}
              </button>
            </article>
          );
        })}
        {normalizedSources.length > 0 && (
          <ol aria-label="Component source order">
            {normalizedSources.map((source, index) => (
              <li key={source.sourceVersionId}>
                <span>{index + 1}. {source.sourceKey}</span>
                {strategy === 'component_pdfs' && (
                  <label>
                    Owner
                    <select
                      aria-label={`Owner for ${source.sourceKey}`}
                      value={source.ownerNodeKey ?? ''}
                      onChange={(event) => updateSourceOwner(source.sourceVersionId, event.target.value)}
                    >
                      <option value="">Choose hierarchy owner</option>
                      {nodes.filter((node) => isStructuralNodeType(node.nodeType)).map((node) => (
                        <option key={node.nodeKey} value={node.nodeKey}>{nodeLabel(node)}</option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" aria-label={`Move ${source.sourceKey} up`} onClick={() => moveSource(source.sourceVersionId, -1)}>Up</button>
                <button type="button" aria-label={`Move ${source.sourceKey} down`} onClick={() => moveSource(source.sourceVersionId, 1)}>Down</button>
                <button type="button" aria-label={`Remove ${source.sourceKey}`} onClick={() => removeSource(source.sourceVersionId)}>Remove</button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <UnitActivityImportControls
        busy={unitImportBusy}
        canCancel={unitImportCancelable}
        importText={unitImportText}
        manualCopyFallback={manualCopyFallback}
        onCancel={cancelUnitImport}
        onCopyPrompt={copyUnitPrompt}
        onFileReadError={handleUnitImportFileReadError}
        onImport={() => void importUnitJson()}
        onImportTextChange={setUnitImportText}
        promptText={unitPromptText}
        selectedUnitKey={selectedUnitKey}
        statusText={unitImportStatus}
      />

      <BookAssemblyReconciliationPanel
        busy={reconciliationBusy}
        report={reconciliationReport}
        onApplyExactRepair={() => void applyExactReconciliationRepair()}
        onRecordTeacherChoice={recordTeacherChoiceNeeded}
      />

      <section
        className="book-assembly-workspace__preview"
        aria-labelledby="book-assembly-preview-title"
      >
        <div className="book-assembly-workspace__section-heading">
          <div>
            <h2 id="book-assembly-preview-title">Assembly PDF preview</h2>
            <p>
              Preview uses a short opaque route. Access and current candidate/source
              revisions are checked again for every document request.
            </p>
          </div>
        </div>
        <BookAssemblyMappingViewerHost
          bookTitle={bookTitle}
          documents={currentPreviewDocuments}
          sourceVersions={sourceVersions}
          selectedSourceVersionId={selectedPreviewSourceVersionId}
          selectedUnit={selectedUnit}
          getIdToken={previewGetIdToken}
          onDocumentSelected={selectPreviewDocument}
          onViewerPageSelected={handleViewerPageSelected}
          onError={(message) => setValidationMessage(message)}
        />
      </section>

      {currentRuntimePreview ? (
        <BookAssemblyUnitPreview
          preview={currentRuntimePreview.preview}
          onExit={() => setDismissedRuntimePreviewIdentity(currentRuntimePreview.identity)}
        />
      ) : null}

      <div className="book-assembly-workspace__body">
        <section className="book-assembly-workspace__tree" aria-label="Assembly hierarchy">
          <div className="book-assembly-workspace__section-heading">
            <h2>Book hierarchy</h2>
            <div className="book-assembly-workspace__actions">
              {STRUCTURAL_NODE_TYPES.map((type) => (
                <button key={type} type="button" onClick={() => addNode(type)}>Add {type}</button>
              ))}
            </div>
          </div>
          <ul role="tree" aria-label="Assembly hierarchy tree" onKeyDown={handleTreeKeyDown}>
            {visibleTreeItems.map(({ node, level }) => (
              <li
                key={node.nodeKey}
                role="treeitem"
                aria-level={level}
                aria-selected={selectedNodeKey === node.nodeKey}
              >
                <button
                  type="button"
                  ref={(element) => {
                    nodeButtonRefs.current[node.nodeKey] = element;
                  }}
                  style={{ '--tree-level': level } as CSSProperties}
                  onClick={() => requestNodeFocus(node.nodeKey)}
                >
                  {nodeLabel(node)}
                </button>
              </li>
            ))}
          </ul>
          {selectedNodeKey && (
            <div className="book-assembly-workspace__node-actions">
              <button type="button" onClick={() => moveNode(-1)}>Move up</button>
              <button type="button" onClick={() => moveNode(1)}>Move down</button>
              <button type="button" onClick={deleteNode}>Delete</button>
            </div>
          )}
        </section>

        <aside className="book-assembly-workspace__details" aria-label="Assembly status">
          <h2>Draft status</h2>
          <p>{status === 'saved' ? 'Saved' : status === 'saving' ? 'Saving...' : status === 'conflict' ? 'Conflict detected' : status === 'error' ? 'Error' : 'Pending changes'}</p>
          <dl>
            <div><dt>Strategy</dt><dd>{strategy}</dd></div>
            <div><dt>Sources</dt><dd>{normalizedSources.length}</dd></div>
            <div><dt>Nodes</dt><dd>{nodes.length}</dd></div>
            <div><dt>Page Groups</dt><dd>{units.reduce((total, unit) => total + unit.pageGroups.length, 0)}</dd></div>
          </dl>
          {status === 'conflict' && (
            <div role="alert">
              <p>Current candidate changed. Choose an action.</p>
              <button type="button" onClick={() => void reload()}>Reload current</button>
              <button type="button" onClick={retryLocal}>Retry local</button>
              <button type="button" onClick={discardLocal}>Discard local</button>
            </div>
          )}
          {validationMessage && <p role="alert">{validationMessage}</p>}
          {errorMessage && <p role="alert">{errorMessage}</p>}
        </aside>
      </div>

      <section className="book-assembly-workspace__mapping" aria-labelledby="book-assembly-mapping-title">
        <div className="book-assembly-workspace__section-heading">
          <div>
            <h2 id="book-assembly-mapping-title">Page Groups and Activity slots</h2>
            <p>Use `sourceKey` plus local one-based physical page numbers. Printed labels stay display-only.</p>
          </div>
        </div>
        <div className="book-assembly-workspace__mapping-form">
          <label>
            Unit
            <select
              value={selectedUnitKey ?? ''}
              onChange={(event) => requestNodeFocus(event.target.value || null)}
              aria-label="Mapped Unit"
            >
              <option value="">Choose Unit</option>
              {nodes.filter((node) => node.nodeType === 'unit').map((node) => (
                <option key={node.nodeKey} value={node.nodeKey}>{node.nodeKey}</option>
              ))}
            </select>
          </label>
          <label>
            Source key
            <select
              value={mappingSourceKey}
              onChange={(event) => setMappingSourceKey(event.target.value)}
              aria-label="Mapping source key"
            >
              <option value="">Choose Source</option>
              {availableMappingSources.map((source) => (
                <option key={source.sourceKey} value={source.sourceKey}>
                  {source.sourceKey}
                </option>
              ))}
            </select>
          </label>
          <label>
            Physical pages
            <input
              aria-label="One-based physical pages"
              value={mappingPages}
              onChange={(event) => setMappingPages(event.target.value)}
              placeholder="1,2"
            />
          </label>
          <label>
            Default physical page
            <input
              aria-label="Default physical page"
              value={mappingDefaultPage}
              onChange={(event) => setMappingDefaultPage(event.target.value)}
              placeholder="1"
            />
          </label>
          <label>
            Mode
            <select
              value={mappingMode}
              onChange={(event) => setMappingMode(event.target.value as PageGroupMode)}
              aria-label="Page Group mode"
            >
              <option value="activity">Activity</option>
              <option value="reference_only">Reference only</option>
            </select>
          </label>
          {mappingMode === 'activity' && (
            <>
              <label>
                Activity key
                <input
                  aria-label="Activity key"
                  value={mappingActivityKey}
                  onChange={(event) => setMappingActivityKey(event.target.value)}
                />
              </label>
              <label>
                Context requirement
                <select
                  aria-label="Context requirement"
                  value={mappingContextRequirement}
                  onChange={(event) => setMappingContextRequirement(event.target.value as ActivityContextRequirement)}
                >
                  <option value="required">Required</option>
                  <option value="optional">Optional</option>
                  <option value="none">None</option>
                </select>
              </label>
            </>
          )}
          <button type="button" onClick={addMapping}>Add mapping</button>
        </div>
        {selectedUnit && (
          <PageGroupMappingSummary
            selectedUnit={selectedUnit}
            missingRequiredActivityKeys={selectedUnitMissingContext}
            onMoveActivitySlot={moveActivitySlot}
          />
        )}
      </section>
    </section>
  );
};

export default BookAssemblyWorkspace;
