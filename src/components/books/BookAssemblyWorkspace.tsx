import { type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { toast } from '../modern';
import {
  BOOK_SOURCE_STRATEGIES,
  type BookAssemblyManifestCandidate,
  type ActivityContextRequirement,
  type BookContentNodeType,
  type BookSourceStrategy,
  type PageGroupMode,
  type TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import { validateBookAssemblyManifestCandidate } from '../../services/book-assembly/manifestCandidate.service';
import { parsePhysicalPageList, reorderActivitySlot, upsertPageGroupMapping } from '../../services/book-assembly/pageGroup.service';
import { missingRequiredSourceContext } from '../../services/book-assembly/sourceContextRequirement.service';
import type {
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from '../../services/book-assembly/unitAssembly.types';
import type { UnitAssemblyRepository } from '../../services/book-assembly/unitAssembly.repository';
import PageGroupMappingSummary from './assembly/PageGroupMappingSummary';
import './BookAssemblyWorkspace.css';

export interface BookAssemblyWorkspaceProps {
  readonly bookId: string;
  readonly bookTitle: string;
  readonly access: 'owner' | 'administrator';
  readonly presentation: 'modal' | 'page-compat';
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
  readonly initialCandidate?: BookAssemblyCandidateRecord | null;
  readonly repository?: UnitAssemblyRepository;
  readonly onAction?: (action: string, metadata?: Record<string, unknown>) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
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
  sourceVersions,
  initialCandidate,
  repository,
  onAction,
  onDirtyChange,
}: BookAssemblyWorkspaceProps) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const initial: AssemblyEditorDraft = initialCandidate?.manifest ?? emptyManifest(bookId);
  const [strategy, setStrategy] = useState<BookSourceStrategy>(initial.sourceSet.sourceStrategy);
  const [nodes, setNodes] = useState<readonly DraftNode[]>(initial.nodes);
  const [sources, setSources] = useState<readonly DraftSource[]>(initial.sourceSet.sources);
  const [units, setUnits] = useState<BookAssemblyManifestCandidate['units']>(initial.units);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(initial.nodes[0]?.nodeKey ?? null);
  const [mappingSourceKey, setMappingSourceKey] = useState(initial.sourceSet.sources[0]?.sourceKey ?? '');
  const [mappingPages, setMappingPages] = useState('1');
  const [mappingDefaultPage, setMappingDefaultPage] = useState('1');
  const [mappingActivityKey, setMappingActivityKey] = useState('activity-1');
  const [mappingContextRequirement, setMappingContextRequirement] = useState<ActivityContextRequirement>('required');
  const [mappingMode, setMappingMode] = useState<PageGroupMode>('activity');
  const [candidate, setCandidate] = useState<BookAssemblyCandidateRecord | null>(initialCandidate ?? null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict' | 'error'>('idle');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    draftSnapshot(initial.sourceSet.sourceStrategy, initial.nodes, initial.sourceSet.sources, initial.units));
  const nodeButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocusNodeKeyRef = useRef<string | null>(null);

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

  const manifest = useMemo<AssemblyEditorDraft>(() => ({
    bookId,
    sourceSet: {
      sourceStrategy: strategy,
      sources: normalizedSources,
    },
    nodes: normalizeNodeOrders(nodes),
    units,
  }), [bookId, nodes, normalizedSources, strategy, units]);

  const emit = (action: string, metadata: Record<string, unknown> = {}) => {
    trackAction(action, { bookId, source: `book_assembly_${presentation}`, ...metadata });
    onAction?.(action, metadata);
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
    setSavedSnapshot(draftSnapshot(draft.sourceSet.sourceStrategy, draft.nodes, draft.sourceSet.sources, draft.units));
    setValidationMessage(null);
    setErrorMessage(null);
    requestNodeFocus(draft.nodes[0]?.nodeKey ?? null);
  };

  useEffect(() => {
    onDirtyChange?.(currentSnapshot !== savedSnapshot);
  }, [currentSnapshot, onDirtyChange, savedSnapshot]);

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
    const pending = pendingFocusNodeKeyRef.current;
    if (!pending) return;
    const target = nodeButtonRefs.current[pending];
    if (!target) return;
    target.focus();
    pendingFocusNodeKeyRef.current = null;
  }, [selectedNodeKey, visibleTreeItems]);

  const selectStrategy = (next: BookSourceStrategy) => {
    setStrategy(next);
    setSources([]);
    setMappingSourceKey('');
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
      const result: BookAssemblyMutationResult = candidate
        ? await repository.replace({
            operationId: operationId(),
            bookId,
            expectedBookRevision: bookRevision,
            expectedSourceSetRevision: sourceSetRevision,
            unitKey,
            candidateId: candidate.candidateId,
            expectedCandidateRevision: candidate.revision,
            manifest: validManifest,
          })
        : await repository.create({
            operationId: operationId(),
            bookId,
            expectedBookRevision: bookRevision,
            expectedSourceSetRevision: sourceSetRevision,
            unitKey,
            manifest: validManifest,
          });
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

  return (
    <main className="book-assembly-workspace" data-presentation={presentation} aria-labelledby="book-assembly-title">
      <header className="book-assembly-workspace__header">
        <div>
          <p className="book-assembly-workspace__eyebrow">Mode 2 Assembly</p>
          <h1 id="book-assembly-title">{bookTitle}</h1>
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
    </main>
  );
};

export default BookAssemblyWorkspace;
