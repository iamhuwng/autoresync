import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { get, ref, remove, set, update as updateDb } from 'firebase/database';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { useAuth } from '../../hooks/useAuth';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { database } from '../../services/firebase';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../services/materialCatalog/testTypeConfig.service';
import {
  createMaterialBooksRepository,
  updateBookMetadata,
  updateBookTree,
  type MaterialBooksRepository,
} from '../../services/materialCatalog/materialBooks.service';
import { deriveMaterialBookStatus } from '../../services/materialCatalog/bookValidation.service';
import {
  attachMaterialRefToNode,
  bookNodeHasContent,
  createBookEditorNode,
  deleteBookNodeWithDescendants,
  filterPublishedMaterialSummaries,
  getBookNodeDepth,
  reorderBookNode,
  reorderMaterialRef,
  BOOK_NODE_MAX_DEPTH,
  type BookMaterialSummary,
  removeMaterialRefFromNode,
} from '../../services/materialCatalog/bookEditor.service';
import {
  materialCatalogIds,
  type MaterialBookMaterialRef,
  type MaterialBookMetadata,
  type MaterialBookNode,
  type MaterialBookNodeType,
  type MaterialBookPublicProjection,
  type MaterialBookVisibility,
} from '../../types/materialCatalog.types';
import type { ReadingPassageHomeworkCandidate } from '../../services/reading-v2/readingV2PassageHomework.service';
import { HomeworkCreateModal } from '../homework/HomeworkCreateModal';
import BookMaterialPicker from './BookMaterialPicker';
import BookNodeTree from './BookNodeTree';
import './BookEditorWorkspace.css';

interface BookEditorWorkspaceProps {
  readonly bookId: string;
  readonly initialBook?: MaterialBookMetadata;
  readonly initialNodes?: readonly MaterialBookNode[];
  readonly materialCandidates?: readonly BookMaterialSummary[];
  readonly repository?: MaterialBooksRepository;
  readonly presentation: 'modal' | 'page-compat';
  readonly activeTab?: BookEditorTab;
  readonly onActiveTabChange?: (tab: BookEditorTab) => void;
  readonly onClose?: () => void;
  readonly onSaved?: (bookId: string) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

export interface BookEditorWorkspaceHandle {
  readonly saveActive: () => void;
  readonly requestPublicReview: () => void;
}

interface MetadataFormState {
  readonly title: string;
  readonly subtitle: string;
  readonly authors: string;
  readonly publisher: string;
  readonly edition: string;
  readonly series: string;
  readonly isbn: string;
  readonly coverUrl: string;
  readonly tags: string;
  readonly description: string;
  readonly visibility: MaterialBookVisibility;
  readonly testTypeIds: string;
}

export type BookEditorTab = 'overview' | 'content' | 'settings';

type AssignmentRequest =
  | {
      readonly kind: 'reading-passage';
      readonly ref: MaterialBookMaterialRef;
      readonly candidate: ReadingPassageHomeworkCandidate;
    }
  | {
      readonly kind: 'material';
      readonly ref: MaterialBookMaterialRef;
      readonly filter: 'test' | 'thcs-test';
    };

type MaterialIndexRow = {
  readonly materialId: string;
  readonly title: string;
  readonly materialKind: BookMaterialSummary['materialKind'];
  readonly testTypeIds?: readonly string[];
  readonly visibility?: string;
  readonly publishedSnapshotVersionId?: string;
};

type MaterialRefPlacement = {
  readonly node: MaterialBookNode;
  readonly ref: MaterialBookMaterialRef;
};

type DeleteNodeRequest = {
  readonly node: MaterialBookNode;
  readonly confirmDelete: () => void;
};

const SUPPORTED_BOOK_PICKER_KINDS = new Set(['full-test', 'reading-passage', 'thcs-thpt-test']);
const EMPTY_BOOK_NODES: readonly MaterialBookNode[] = [];
const SELECTED_CHILD_NODE_TYPES: readonly MaterialBookNodeType[] = ['section', 'chapter', 'test'];
export const BOOK_EDITOR_TABS: readonly { readonly id: BookEditorTab; readonly label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'content', label: 'Content' },
  { id: 'settings', label: 'Settings' },
];

const emptyForm: MetadataFormState = {
  title: '',
  subtitle: '',
  authors: '',
  publisher: '',
  edition: '',
  series: '',
  isbn: '',
  coverUrl: '',
  tags: '',
  description: '',
  visibility: 'private',
  testTypeIds: '',
};

const csv = (values: readonly string[] | undefined): string => (values ?? []).join(', ');

const splitCsv = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const classifyBookEditorError = (message: string | null, hasBook: boolean): {
  readonly title: string;
  readonly message: string;
  readonly retryable: boolean;
} | null => {
  if (!message) {
    return null;
  }

  if (/permission|denied/i.test(message)) {
    return {
      title: 'Permission denied',
      message: 'You do not have access to this Book or one of its referenced snapshots.',
      retryable: false,
    };
  }

  if (/changed since it was loaded|reload before saving|stale/i.test(message)) {
    return {
      title: 'Book changed in another tab',
      message: 'Reload the Book before saving so you do not overwrite a newer structure.',
      retryable: true,
    };
  }

  if (/validation|invalid|required/i.test(message)) {
    return {
      title: 'Validation error',
      message,
      retryable: false,
    };
  }

  if (/snapshot|inaccessible|unavailable ref/i.test(message)) {
    return {
      title: 'Referenced snapshot unavailable',
      message: 'A referenced material snapshot is unavailable. The Book can still show fallback metadata for repair.',
      retryable: true,
    };
  }

  return {
    title: hasBook ? 'Book update failed' : 'Book failed to load',
    message,
    retryable: !hasBook,
  };
};

const formFromBook = (book: MaterialBookMetadata | null | undefined): MetadataFormState => {
  if (!book) {
    return emptyForm;
  }

  return {
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: csv(book.authors),
    publisher: book.publisher ?? '',
    edition: book.edition ?? '',
    series: book.series ?? '',
    isbn: book.isbn ?? '',
    coverUrl: book.coverUrl ?? '',
    tags: csv(book.tags),
    description: book.description ?? '',
    visibility: book.visibility,
    testTypeIds: csv(book.testTypeIds),
  };
};

const isMaterialIndexRow = (value: unknown): value is MaterialIndexRow =>
  Boolean(value) &&
  typeof value === 'object' &&
  typeof (value as MaterialIndexRow).materialId === 'string' &&
  typeof (value as MaterialIndexRow).title === 'string' &&
  typeof (value as MaterialIndexRow).materialKind === 'string' &&
  SUPPORTED_BOOK_PICKER_KINDS.has((value as MaterialIndexRow).materialKind);

const rowsFromIndexValue = (value: unknown): MaterialIndexRow[] =>
  Object.values(value ?? {}).filter(isMaterialIndexRow);

const rowToSummary = (row: MaterialIndexRow): BookMaterialSummary => ({
  materialId: row.materialId,
  title: row.title,
  materialKind: row.materialKind,
  status: 'published',
  testTypeIds: row.testTypeIds ?? [],
  visibility: row.visibility,
  publishedSnapshotVersionId: row.publishedSnapshotVersionId,
});

const formatMaterialKind = (kind: string): string =>
  kind
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const collectMaterialRefPlacements = (bookNodes: readonly MaterialBookNode[]): MaterialRefPlacement[] =>
  [...bookNodes]
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title))
    .flatMap((node) =>
      [...node.materialRefs]
        .sort((left, right) => left.order - right.order || left.titleSnapshot.localeCompare(right.titleSnapshot))
        .map((ref) => ({ node, ref })),
    );

const sortedBookChildren = (
  bookNodes: readonly MaterialBookNode[],
  parentNodeId: string | null,
): MaterialBookNode[] =>
  bookNodes
    .filter((node) => (node.parentNodeId ?? null) === parentNodeId)
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title) || left.nodeId.localeCompare(right.nodeId));

const nodeLabel = (type: MaterialBookNodeType): string =>
  type
    .replace('-placeholder', '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const bookFromPublicProjection = (projection: MaterialBookPublicProjection): MaterialBookMetadata => ({
  bookId: projection.bookId,
  ownerId: 'public-library',
  title: projection.title,
  subtitle: projection.subtitle,
  authors: projection.authors,
  publisher: projection.publisher,
  series: projection.series,
  coverUrl: projection.coverUrl,
  testTypeIds: projection.testTypeIds,
  tags: projection.tags,
  visibility: 'public-library-published',
  status: 'ready',
  createdAt: projection.approvedAt,
  updatedAt: projection.updatedAt,
  createdBy: projection.approvedBy,
  updatedBy: projection.approvedBy,
});

const createFirebaseRepository = (): MaterialBooksRepository =>
  createMaterialBooksRepository({
    read: async (path) => {
      const snapshot = await get(ref(database, path));
      return snapshot.val();
    },
    write: async (path, value) => {
      await set(ref(database, path), value);
    },
    remove: async (path) => {
      await remove(ref(database, path));
    },
    update: async (payload) => {
      await updateDb(ref(database), payload);
    },
  });

const serializeForDirtyCheck = (value: unknown): string => JSON.stringify(value);

const BookEditorWorkspace = forwardRef<BookEditorWorkspaceHandle, BookEditorWorkspaceProps>(({
  bookId,
  initialBook,
  initialNodes,
  materialCandidates,
  repository,
  presentation,
  activeTab,
  onActiveTabChange,
  onSaved,
  onDirtyChange,
}, workspaceRef) => {
  const { user, profile } = useAuth();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const initialNodeList = initialNodes ?? EMPTY_BOOK_NODES;
  const resolvedRepository = useMemo(() => repository ?? createFirebaseRepository(), [repository]);
  const [book, setBook] = useState<MaterialBookMetadata | null>(initialBook ?? null);
  const [nodes, setNodes] = useState<readonly MaterialBookNode[]>(initialNodeList);
  // Last persisted/loaded node state; the dirty baseline for structure changes.
  // Unlike the immutable `initialNodeList` prop, this advances on load and save.
  const [baselineNodes, setBaselineNodes] = useState<readonly MaterialBookNode[]>(initialNodeList);
  const [publicProjection, setPublicProjection] = useState<MaterialBookPublicProjection | null>(null);
  const [metadataForm, setMetadataForm] = useState<MetadataFormState>(() => formFromBook(initialBook));
  const [loadedCandidates, setLoadedCandidates] = useState<readonly BookMaterialSummary[]>([]);
  const [loading, setLoading] = useState(!initialBook && Boolean(bookId));
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [assignmentRequest, setAssignmentRequest] = useState<AssignmentRequest | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const [internalActiveTab, setInternalActiveTab] = useState<BookEditorTab>('content');
  const effectiveActiveTab = activeTab ?? internalActiveTab;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);
  const [deleteNodeRequest, setDeleteNodeRequest] = useState<DeleteNodeRequest | null>(null);
  const errorState = classifyBookEditorError(error, Boolean(book));
  const isModalPresentation = presentation === 'modal';

  useEffect(() => {
    if (!bookId) {
      return;
    }

    trackAction('openBook', {
      bookId,
      source: presentation === 'modal' ? 'book_editor_modal' : 'book_editor_route',
    });
  }, [bookId, presentation, trackAction]);

  useEffect(() => {
    if (!initialBook) {
      return;
    }

      setBook(initialBook);
      setPublicProjection(null);
      setMetadataForm(formFromBook(initialBook));
    setNodes(initialNodeList);
    setBaselineNodes(initialNodeList);
  }, [initialBook, initialNodeList]);

  useEffect(() => {
    if (!initialBook || initialNodes !== undefined || !bookId) {
      return;
    }

    let cancelled = false;

    resolvedRepository.listBookNodes(bookId)
      .then((loadedNodes) => {
        if (!cancelled) {
          setNodes(loadedNodes);
          setBaselineNodes(loadedNodes);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNodes([]);
          setBaselineNodes([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, initialBook, initialNodes, resolvedRepository]);

  useEffect(() => {
    if (!book || !onDirtyChange) {
      return;
    }

    const dirty =
      serializeForDirtyCheck(metadataForm) !== serializeForDirtyCheck(formFromBook(book)) ||
      serializeForDirtyCheck(nodes) !== serializeForDirtyCheck(baselineNodes);

    onDirtyChange(dirty);
  }, [book, baselineNodes, metadataForm, nodes, onDirtyChange]);

  useEffect(() => {
    if (initialBook || !bookId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const loadPublicProjection = async (): Promise<{
      readonly loaded: boolean;
      readonly error?: unknown;
    }> => {
      let projection: MaterialBookPublicProjection | null | undefined;

      try {
        projection = await resolvedRepository.readPublicBookProjection?.(bookId);
      } catch (projectionError) {
        return { loaded: false, error: projectionError };
      }

      if (!projection || cancelled) {
        return { loaded: false };
      }

      const projectionBook = bookFromPublicProjection(projection);
      setPublicProjection(projection);
      setBook(projectionBook);
      setMetadataForm(formFromBook(projectionBook));
      setNodes([]);
      setBaselineNodes([]);
      setError(null);
      return { loaded: true };
    };

    const loadBook = async () => {
      try {
        const loadedBook = await resolvedRepository.readBook(bookId);

        if (cancelled) {
          return;
        }

        if (!loadedBook) {
          const loadedProjection = await loadPublicProjection();

          if (!loadedProjection.loaded && !cancelled) {
            setError(
              loadedProjection.error instanceof Error
                ? loadedProjection.error.message
                : 'Book not found.',
            );
          }
          return;
        }

        const loadedNodes = await resolvedRepository.listBookNodes(bookId);

        if (cancelled) {
          return;
        }

        setPublicProjection(null);
        setBook(loadedBook);
        setMetadataForm(formFromBook(loadedBook));
        setNodes(loadedNodes);
        setBaselineNodes(loadedNodes);
      } catch (loadError) {
        const loadedProjection = await loadPublicProjection();

        if (!loadedProjection.loaded && !cancelled) {
          const effectiveError = loadedProjection.error ?? loadError;

          setError(effectiveError instanceof Error ? effectiveError.message : 'Unable to load Book.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadBook();

    return () => {
      cancelled = true;
    };
  }, [bookId, initialBook, loadVersion, resolvedRepository]);

  useEffect(() => {
    if (materialCandidates || !user?.uid) {
      return;
    }

    let cancelled = false;

    Promise.all([
      get(ref(database, `material_catalog/material_indexes/by_owner/${user.uid}`)),
      get(ref(database, 'material_catalog/material_indexes/by_visibility/public')),
    ])
      .then(([ownerSnapshot, publicSnapshot]) => {
        if (cancelled) {
          return;
        }

        const byKey = new Map<string, BookMaterialSummary>();
        [...rowsFromIndexValue(ownerSnapshot.val()), ...rowsFromIndexValue(publicSnapshot.val())]
          .map(rowToSummary)
          .forEach((summary) => {
            byKey.set(`${summary.materialKind}:${summary.materialId}`, summary);
          });

        setLoadedCandidates(filterPublishedMaterialSummaries([...byKey.values()]));
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedCandidates([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [materialCandidates, user?.uid]);

  const pickerMaterials = materialCandidates ?? loadedCandidates;
  const displayStatus = deriveMaterialBookStatus(nodes, book?.status === 'archived');
  const materialRefPlacements = useMemo(() => collectMaterialRefPlacements(nodes), [nodes]);
  const selectedPlacement = useMemo(
    () =>
      materialRefPlacements.find((placement) => placement.ref.refId === selectedRefId) ??
      materialRefPlacements[0] ??
      null,
    [materialRefPlacements, selectedRefId],
  );
  const selectedNode = useMemo(
    () =>
      (selectedNodeId ? nodes.find((node) => node.nodeId === selectedNodeId) : null) ??
      selectedPlacement?.node ??
      nodes.find((node) => (node.parentNodeId ?? null) === null) ??
      nodes[0] ??
      null,
    [nodes, selectedNodeId, selectedPlacement],
  );

  useEffect(() => {
    if (nodes.length === 0) {
      if (selectedNodeId) {
        setSelectedNodeId(null);
      }
      return;
    }

    if (!selectedNodeId || !nodes.some((node) => node.nodeId === selectedNodeId)) {
      setSelectedNodeId(nodes[0]?.nodeId ?? null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (materialRefPlacements.length === 0) {
      if (selectedRefId) {
        setSelectedRefId(null);
      }
      return;
    }

    const firstPlacement = materialRefPlacements[0];

    if (firstPlacement && (!selectedRefId || !materialRefPlacements.some((placement) => placement.ref.refId === selectedRefId))) {
      setSelectedRefId(firstPlacement.ref.refId);
    }
  }, [materialRefPlacements, selectedRefId]);

  const handleNodesChange = (nextNodes: readonly MaterialBookNode[]) => {
    setNodes(nextNodes);

    if (nextNodes.length === 0) {
      setSelectedNodeId(null);
      setSelectedRefId(null);
      return;
    }

    if (!selectedNodeId || !nextNodes.some((node) => node.nodeId === selectedNodeId)) {
      setSelectedNodeId(nextNodes[0]?.nodeId ?? null);
    }
  };

  const updateForm = (field: keyof MetadataFormState, value: string) => {
    setMetadataForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateActiveTab = (tab: BookEditorTab) => {
    if (activeTab === undefined) {
      setInternalActiveTab(tab);
      return;
    }

    onActiveTabChange?.(tab);
  };

  const metadataUpdateFromForm = (form: MetadataFormState) => ({
    title: form.title,
    subtitle: form.subtitle || undefined,
    authors: splitCsv(form.authors),
    publisher: form.publisher || undefined,
    edition: form.edition || undefined,
    series: form.series || undefined,
    isbn: form.isbn || undefined,
    coverUrl: form.coverUrl || undefined,
    tags: splitCsv(form.tags),
    description: form.description || undefined,
    visibility: form.visibility,
    testTypeIds: splitCsv(form.testTypeIds).map((testTypeId) => materialCatalogIds.testTypeId(testTypeId)),
  });

  const handleRequestPublicReview = async (): Promise<void> => {
    if (!book) {
      return;
    }

    const nextForm = {
      ...metadataForm,
      visibility: 'public-library-pending-review' as MaterialBookVisibility,
    };

    setMetadataForm(nextForm);
    setError(null);
    setSaveMessage(null);

    try {
      const next = await updateBookMetadata(
        book.bookId,
        metadataUpdateFromForm(nextForm),
        resolvedRepository,
        {
          actorId: user?.uid ?? 'unknown',
          actorRole: profile?.role ?? 'teacher',
          testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        },
      );

      setBook(next);
      setMetadataForm(formFromBook(next));
      setSaveMessage('Public review requested.');
      trackAction('teacher_materials_book_public_review_requested', {
        bookId: next.bookId,
        source: 'book_editor_metadata',
      });
      trackAction('teacher_materials_book_updated', { bookId: next.bookId, source: 'book_editor_request_review' });
      onSaved?.(next.bookId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to request public review.');
    }
  };

  const handleSaveMetadata = async () => {
    if (!book) {
      return;
    }

    setError(null);
    setSaveMessage(null);

    try {
      const next = await updateBookMetadata(
        book.bookId,
        metadataUpdateFromForm(metadataForm),
        resolvedRepository,
        {
          actorId: user?.uid ?? 'unknown',
          actorRole: profile?.role ?? 'teacher',
          testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        },
      );

      setBook(next);
      setMetadataForm(formFromBook(next));
      setSaveMessage('Metadata saved.');
      trackAction('editBookMetadata', { bookId: next.bookId, source: 'book_editor' });
      trackAction('teacher_materials_book_updated', { bookId: next.bookId, source: 'book_editor_metadata' });
      onSaved?.(next.bookId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Book metadata.');
    }
  };

  const handleSaveStructure = async () => {
    if (!book) {
      return;
    }

    setError(null);
    setSaveMessage(null);

    try {
      const result = await updateBookTree(
        book.bookId,
        nodes,
        { expectedUpdatedAt: book.updatedAt },
        resolvedRepository,
        {
          actorId: user?.uid ?? 'unknown',
          actorRole: profile?.role ?? 'teacher',
          testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
        },
      );

      setBook(result.metadata);
      setNodes(result.nodes);
      setBaselineNodes(result.nodes);
      setMetadataForm(formFromBook(result.metadata));
      setSaveMessage(`Book structure saved. Readiness: ${result.metadata.status}.`);
      trackAction('saveBookStructure', { bookId: result.metadata.bookId, nodeCount: result.nodes.length });
      trackAction('teacher_materials_book_updated', {
        bookId: result.metadata.bookId,
        source: 'book_editor_structure',
        nodeCount: result.nodes.length,
      });
      onSaved?.(result.metadata.bookId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Book structure.');
    }
  };

  const handleSaveActive = async () => {
    if (!book) {
      return;
    }

    const isContentTab = effectiveActiveTab === 'content';
    const metadataDirty =
      serializeForDirtyCheck(metadataForm) !== serializeForDirtyCheck(formFromBook(book));
    const structureDirty =
      serializeForDirtyCheck(nodes) !== serializeForDirtyCheck(baselineNodes);

    // The active tab always saves its own domain (a deliberate per-tab contract).
    // The other domain is flushed only when it is dirty, so unsaved edits made on a
    // different tab are not silently dropped by a tab-scoped Save.
    const shouldSaveMetadata = !isContentTab || metadataDirty;
    const shouldSaveStructure = isContentTab || structureDirty;

    setError(null);
    setSaveMessage(null);

    try {
      let currentBook = book;

      if (shouldSaveMetadata) {
        currentBook = await updateBookMetadata(
          book.bookId,
          metadataUpdateFromForm(metadataForm),
          resolvedRepository,
          {
            actorId: user?.uid ?? 'unknown',
            actorRole: profile?.role ?? 'teacher',
            testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
          },
        );

        setBook(currentBook);
        setMetadataForm(formFromBook(currentBook));
        trackAction('editBookMetadata', { bookId: currentBook.bookId, source: 'book_editor' });
        trackAction('teacher_materials_book_updated', { bookId: currentBook.bookId, source: 'book_editor_metadata' });
      }

      if (shouldSaveStructure) {
        const result = await updateBookTree(
          book.bookId,
          nodes,
          { expectedUpdatedAt: currentBook.updatedAt },
          resolvedRepository,
          {
            actorId: user?.uid ?? 'unknown',
            actorRole: profile?.role ?? 'teacher',
            testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
          },
        );

        setBook(result.metadata);
        setNodes(result.nodes);
        setBaselineNodes(result.nodes);
        setMetadataForm(formFromBook(result.metadata));
        setSaveMessage(`Book structure saved. Readiness: ${result.metadata.status}.`);
        trackAction('saveBookStructure', { bookId: result.metadata.bookId, nodeCount: result.nodes.length });
        trackAction('teacher_materials_book_updated', {
          bookId: result.metadata.bookId,
          source: 'book_editor_structure',
          nodeCount: result.nodes.length,
        });
        onSaved?.(result.metadata.bookId);
        return;
      }

      setSaveMessage('Metadata saved.');
      onSaved?.(currentBook.bookId);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Book.');
    }
  };

  useImperativeHandle(workspaceRef, () => ({
    saveActive: () => {
      void handleSaveActive();
    },
    requestPublicReview: () => {
      void handleRequestPublicReview();
    },
  }));

  const handleAssignMaterialRef = (materialRef: MaterialBookMaterialRef) => {
    if (materialRef.materialKind === 'reading-passage') {
      setAssignmentRequest({
        kind: 'reading-passage',
        ref: materialRef,
        candidate: {
          materialId: materialRef.materialId,
          title: materialRef.titleSnapshot,
          questionCount: 0,
          testTypeIds: materialRef.testTypeIdsSnapshot,
          publishedSnapshotVersionId: materialRef.snapshotVersionId,
          hasStudentSafeProjection: true,
          accessible: materialRef.availability === 'available',
          archived: materialRef.availability === 'archived',
        },
      });
      trackAction('assignBookMaterialRef', {
        bookId: book?.bookId,
        materialId: materialRef.materialId,
        materialKind: materialRef.materialKind,
      });
      trackAction('teacher_materials_reading_passage_assigned', {
        bookId: book?.bookId,
        materialId: materialRef.materialId,
        source: 'book_editor_material_ref',
      });
      return;
    }

    if (materialRef.materialKind === 'full-test' || materialRef.materialKind === 'thcs-thpt-test') {
      setAssignmentRequest({
        kind: 'material',
        ref: materialRef,
        filter: materialRef.materialKind === 'thcs-thpt-test' ? 'thcs-test' : 'test',
      });
      trackAction('assignBookMaterialRef', {
        bookId: book?.bookId,
        materialId: materialRef.materialId,
        materialKind: materialRef.materialKind,
      });
    }
  };

  const handleAttachMaterialToSelectedNode = (material: BookMaterialSummary) => {
    if (!selectedNode) {
      return;
    }

    const refId = `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nextNode = attachMaterialRefToNode(selectedNode, material, {
      actorId: user?.uid ?? 'unknown',
      refId,
    });

    handleNodesChange(nodes.map((node) => (node.nodeId === selectedNode.nodeId ? nextNode : node)));
    const attachedRef = nextNode.materialRefs.find((ref) => ref.refId === refId);
    setSelectedNodeId(nextNode.nodeId);
    setSelectedRefId(attachedRef?.refId ?? null);
    trackAction('teacher_materials_book_material_attached', {
      bookId: book?.bookId,
      nodeId: nextNode.nodeId,
      materialId: material.materialId,
      materialKind: material.materialKind,
      source: 'book_editor_selected_item',
    });
  };

  const handleRemoveSelectedMaterialRef = () => {
    if (!selectedPlacement) {
      return;
    }

    const nextNode = removeMaterialRefFromNode(selectedPlacement.node, selectedPlacement.ref.refId);
    handleNodesChange(nodes.map((node) => (node.nodeId === nextNode.nodeId ? nextNode : node)));
    setSelectedNodeId(nextNode.nodeId);
    setSelectedRefId(nextNode.materialRefs[0]?.refId ?? null);
    trackAction('teacher_materials_book_material_removed', {
      bookId: book?.bookId,
      nodeId: nextNode.nodeId,
      materialId: selectedPlacement.ref.materialId,
      materialKind: selectedPlacement.ref.materialKind,
      source: 'book_editor_selected_item',
    });
  };

  const handleUpdateSelectedNode = (updates: Partial<Pick<MaterialBookNode, 'title' | 'type'>>) => {
    if (!selectedNode) {
      return;
    }

    handleNodesChange(nodes.map((node) => (
      node.nodeId === selectedNode.nodeId
        ? {
            ...node,
            ...updates,
          }
        : node
    )));
  };

  const handleMoveSelectedNode = (direction: 'up' | 'down') => {
    if (!selectedNode) {
      return;
    }

    try {
      handleNodesChange(reorderBookNode(nodes, selectedNode.nodeId, direction));
      trackAction('teacher_materials_book_node_reordered', {
        bookId: book?.bookId,
        nodeId: selectedNode.nodeId,
        direction,
        mode: 'sibling_order',
        source: 'book_editor_selected_item',
      });
      setError(null);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Unable to move Book node.');
    }
  };

  const handleRequestDeleteSelectedNode = () => {
    if (!selectedNode) {
      return;
    }

    const confirmDelete = () => {
      handleNodesChange(deleteBookNodeWithDescendants(nodes, selectedNode.nodeId));
      trackAction('teacher_materials_book_node_deleted', {
        bookId: book?.bookId,
        nodeId: selectedNode.nodeId,
        nodeType: selectedNode.type,
        hadMaterialRefs: bookNodeHasContent(nodes, selectedNode.nodeId),
        source: 'book_editor_selected_item',
      });
    };

    setDeleteNodeRequest({ node: selectedNode, confirmDelete });
  };

  const handleAddChildToSelectedNode = (type: MaterialBookNodeType) => {
    if (!book || !selectedNode) {
      return;
    }

    setError(null);

    if (getBookNodeDepth(nodes, selectedNode.nodeId) >= BOOK_NODE_MAX_DEPTH) {
      setError('Book nodes can be nested up to 5 levels.');
      return;
    }

    const nextNode = createBookEditorNode({
      bookId: book.bookId,
      nodeId: `node-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title: nodeLabel(type),
      parentNodeId: selectedNode.nodeId,
      order: sortedBookChildren(nodes, selectedNode.nodeId).length + 1,
      now: () => new Date().toISOString(),
    });

    handleNodesChange([...nodes, nextNode]);
    setSelectedNodeId(nextNode.nodeId);
    setSelectedRefId(null);
    trackAction('teacher_materials_book_node_added', {
      bookId: book.bookId,
      nodeId: nextNode.nodeId,
      parentNodeId: selectedNode.nodeId,
      nodeType: type,
      depth: getBookNodeDepth(nodes, selectedNode.nodeId) + 1,
      source: 'book_editor_selected_item',
    });
  };

  const handleMoveSelectedMaterialRef = (direction: 'up' | 'down') => {
    if (!selectedPlacement) {
      return;
    }

    handleNodesChange(nodes.map((node) => (
      node.nodeId === selectedPlacement.node.nodeId
        ? reorderMaterialRef(node, selectedPlacement.ref.refId, direction)
        : node
    )));
  };

  const selectedNodePath = (node: MaterialBookNode | null): string => {
    if (!node) {
      return 'No selection';
    }

    const path: string[] = [];
    let current: MaterialBookNode | undefined = node;

    while (current) {
      path.unshift(current.title);
      current = current.parentNodeId ? nodes.find((entry) => entry.nodeId === current?.parentNodeId) : undefined;
    }

    return `Root / ${path.join(' / ')}`;
  };

  const selectedPlacementLine = (node: MaterialBookNode | null): string => {
    if (!node) {
      return 'No Book part selected';
    }

    return `${selectedNodePath(node)} - Depth ${getBookNodeDepth(nodes, node.nodeId)} - Order ${node.order}`;
  };

  const homeworkModal = assignmentRequest && (
    <HomeworkCreateModal
      isOpen
      onClose={() => setAssignmentRequest(null)}
      onSuccess={() => setAssignmentRequest(null)}
      preselectedMaterialId={assignmentRequest.kind === 'material' ? assignmentRequest.ref.materialId : undefined}
      preselectedMaterialFilter={assignmentRequest.kind === 'material' ? assignmentRequest.filter : 'reading-passage'}
      preselectedReadingPassage={assignmentRequest.kind === 'reading-passage' ? assignmentRequest.candidate : undefined}
    />
  );

  const renderMetadataFields = () => (
      <div className="book-editor-page__form-grid">
        <label>
          <span>Title</span>
          <input value={metadataForm.title} onChange={(event) => updateForm('title', event.target.value)} />
        </label>
        <label>
          <span>Subtitle</span>
          <input value={metadataForm.subtitle} onChange={(event) => updateForm('subtitle', event.target.value)} />
        </label>
        <label>
          <span>Authors</span>
          <input value={metadataForm.authors} onChange={(event) => updateForm('authors', event.target.value)} />
        </label>
        <label>
          <span>Publisher</span>
          <input value={metadataForm.publisher} onChange={(event) => updateForm('publisher', event.target.value)} />
        </label>
        <label>
          <span>Edition</span>
          <input value={metadataForm.edition} onChange={(event) => updateForm('edition', event.target.value)} />
        </label>
        <label>
          <span>Series</span>
          <input value={metadataForm.series} onChange={(event) => updateForm('series', event.target.value)} />
        </label>
        <label>
          <span>ISBN</span>
          <input value={metadataForm.isbn} onChange={(event) => updateForm('isbn', event.target.value)} />
        </label>
        <label>
          <span>Cover URL</span>
          <input value={metadataForm.coverUrl} onChange={(event) => updateForm('coverUrl', event.target.value)} />
        </label>
        <label>
          <span>Tags</span>
          <input value={metadataForm.tags} onChange={(event) => updateForm('tags', event.target.value)} />
        </label>
        <label>
          <span>Test Type ids</span>
          <input value={metadataForm.testTypeIds} onChange={(event) => updateForm('testTypeIds', event.target.value)} />
        </label>
        <label className="book-editor-page__wide-field">
          <span>Description</span>
          <textarea value={metadataForm.description} onChange={(event) => updateForm('description', event.target.value)} />
        </label>
      </div>
  );

  const renderSettingsTab = () => (
    <section className="book-editor-page__section" aria-labelledby="book-editor-settings">
      <div className="book-editor-page__section-heading">
        <div>
          <h2 id="book-editor-settings">Book settings</h2>
          <p>Access, public review state, and maintenance controls.</p>
        </div>
      </div>

      <fieldset className="book-editor-page__access-group">
        <legend>Book access</legend>
        <label>
          <span>Visibility</span>
          <select value={metadataForm.visibility} onChange={(event) => updateForm('visibility', event.target.value)}>
            <option value="private">Private</option>
            <option value="public-library-pending-review">Public review requested</option>
          </select>
        </label>
        <div className="book-editor-page__review-state">
          <span>Public review</span>
          <strong>{metadataForm.visibility === 'public-library-pending-review' ? 'Requested' : 'Not requested'}</strong>
          <p>Use the modal header to request review. Save keeps the selected access state.</p>
        </div>
      </fieldset>

      <section className="book-editor-page__maintenance-panel" aria-labelledby="book-editor-maintenance">
        <h3 id="book-editor-maintenance">Maintenance</h3>
        <p>Archive, delete, and public-library approval controls stay constrained to supported governance workflows.</p>
      </section>
    </section>
  );

  const renderStructureActions = () => (
    <section className="book-editor-page__inspector-group" aria-labelledby="book-editor-structure-actions">
      <div className="book-editor-page__inspector-group-heading">
        <h3 id="book-editor-structure-actions">Structure actions</h3>
      </div>
      <div className="book-editor-page__inspector-actions">
        <button type="button" className="book-editor-page__secondary-button" onClick={() => handleMoveSelectedNode('up')} disabled={!selectedNode}>
          Move up
        </button>
        <button type="button" className="book-editor-page__secondary-button" onClick={() => handleMoveSelectedNode('down')} disabled={!selectedNode}>
          Move down
        </button>
        {SELECTED_CHILD_NODE_TYPES.map((type) => (
          <button key={type} type="button" className="book-editor-page__secondary-button" onClick={() => handleAddChildToSelectedNode(type)} disabled={!selectedNode}>
            Add {nodeLabel(type)}
          </button>
        ))}
        <button type="button" className="book-editor-page__danger-button" onClick={handleRequestDeleteSelectedNode} disabled={!selectedNode}>
          Delete
        </button>
      </div>
    </section>
  );

  const renderAttachMaterialGroup = () => (
    <section className="book-editor-page__attach-flow" aria-labelledby="book-editor-attach-material">
      <h3 id="book-editor-attach-material">Attach material</h3>
      <BookMaterialPicker materials={pickerMaterials} onAttach={handleAttachMaterialToSelectedNode} />
    </section>
  );

  const renderSelectedMaterialGroup = () => {
    if (!selectedPlacement) {
      return null;
    }

    return (
      <section className="book-editor-page__selected-material" aria-labelledby="book-editor-selected-material">
        <h3 id="book-editor-selected-material">Assignment</h3>
        <div className="book-editor-page__selected-material-card">
          <div>
            <strong>{selectedPlacement.ref.titleSnapshot}</strong>
            <div className="book-editor-page__selected-material-meta">
              <span>{selectedPlacement.ref.materialKind}</span>
              <span>{selectedPlacement.ref.testTypeIdsSnapshot.join(', ') || 'No Test Type'}</span>
              <span>{selectedPlacement.ref.availability}</span>
              {selectedPlacement.ref.updateState === 'newer-version-available' && <span>newer version</span>}
            </div>
          </div>
          <span>{selectedPlacement.node.title}</span>
        </div>
        <div className="book-editor-page__inspector-actions">
          <button type="button" className="book-editor-page__secondary-button" onClick={() => handleMoveSelectedMaterialRef('up')}>
            Move up
          </button>
          <button type="button" className="book-editor-page__secondary-button" onClick={() => handleMoveSelectedMaterialRef('down')}>
            Move down
          </button>
          <button
            type="button"
            onClick={() => handleAssignMaterialRef(selectedPlacement.ref)}
            disabled={!['available'].includes(selectedPlacement.ref.availability)}
          >
            Assign selected
          </button>
          <button type="button" className="book-editor-page__secondary-button" onClick={handleRemoveSelectedMaterialRef}>
            Remove
          </button>
        </div>
        <p className="book-editor-page__constraint-note">Whole-Book assignment is not available in V1.</p>
      </section>
    );
  };

  const renderSelectedMaterialInspector = () => (
    <aside className="book-editor-page__inspector" aria-label="Selected item details">
      {selectedNode ? (
        <>
          <div className="book-editor-page__inspector-header">
            <div>
              <h2>{selectedPlacement ? 'Selected material' : `Selected ${nodeLabel(selectedNode.type).toLowerCase()}`}</h2>
              <p>{selectedPlacementLine(selectedPlacement?.node ?? selectedNode)}</p>
            </div>
            <span>{selectedPlacement?.ref.availability ?? displayStatus}</span>
          </div>

          {selectedPlacement ? (
            <section className="book-editor-page__inspector-group" aria-labelledby="book-editor-material-summary">
              <h3 id="book-editor-material-summary">Material details</h3>
              <dl className="book-editor-page__inspector-fields">
                <div>
                  <dt>Title</dt>
                  <dd>{selectedPlacement.ref.titleSnapshot}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{formatMaterialKind(selectedPlacement.ref.materialKind)}</dd>
                </div>
                <div>
                  <dt>Test Types</dt>
                  <dd>{selectedPlacement.ref.testTypeIdsSnapshot.join(', ') || 'No Test Type'}</dd>
                </div>
                <div>
                  <dt>Availability</dt>
                  <dd>{selectedPlacement.ref.availability}</dd>
                </div>
              </dl>
            </section>
          ) : (
            <section className="book-editor-page__inspector-group" aria-labelledby="book-editor-node-details">
              <h3 id="book-editor-node-details">Details</h3>
              <div className="book-editor-page__node-detail-grid">
                <label>
                  <span>Title</span>
                  <input value={selectedNode.title} onChange={(event) => handleUpdateSelectedNode({ title: event.target.value })} />
                </label>
                <label>
                  <span>Type</span>
                  <select value={selectedNode.type} onChange={(event) => handleUpdateSelectedNode({ type: event.target.value as MaterialBookNodeType })}>
                    {(SELECTED_CHILD_NODE_TYPES.includes(selectedNode.type)
                      ? SELECTED_CHILD_NODE_TYPES
                      : [selectedNode.type, ...SELECTED_CHILD_NODE_TYPES]
                    ).map((type) => (
                      <option key={type} value={type}>{nodeLabel(type)}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}

          {renderStructureActions()}
          {renderAttachMaterialGroup()}
          {renderSelectedMaterialGroup()}
        </>
      ) : (
        <p className="book-editor-page__empty-state">Add or select a Book part in Content to inspect, attach, or assign materials.</p>
      )}
    </aside>
  );

  const renderOverviewTab = () => (
    <div className="book-editor-page__overview-body">
      <section className="book-editor-page__section" aria-labelledby="book-editor-overview">
        <div className="book-editor-page__section-heading">
          <div>
            <h2 id="book-editor-overview">Book overview</h2>
            <p>Metadata, readiness, and catalog health.</p>
          </div>
          {!isModalPresentation && (
            <button type="button" onClick={() => void handleSaveMetadata()}>
              Save Metadata
            </button>
          )}
        </div>

        {renderMetadataFields()}
      </section>

      <section className="book-editor-page__section" aria-labelledby="book-editor-readiness">
        <div className="book-editor-page__section-heading">
          <div>
            <h2 id="book-editor-readiness">Readiness</h2>
            <p>Compact summary of Book health.</p>
          </div>
        </div>
        <div className="book-editor-page__overview-grid">
          <div className="book-editor-page__metric-card">
            <span>Readiness</span>
            <strong>{displayStatus}</strong>
          </div>
          <div className="book-editor-page__metric-card">
            <span>Materials</span>
            <strong>{materialRefPlacements.length}</strong>
          </div>
          <div className="book-editor-page__metric-card">
            <span>Visibility</span>
            <strong>{metadataForm.visibility}</strong>
          </div>
        </div>
      </section>
    </div>
  );

  const renderContentTab = () => {
    if (!book) {
      return null;
    }

    return (
      <div className="book-editor-page__workspace">
        <section className="book-editor-page__section book-editor-page__structure-panel" aria-label="Book structure tree">
          <div className="book-editor-page__section-heading">
            <div>
              <h2>Book content</h2>
              <p>Build structure on the left. Inspect and attach selected items on the right.</p>
            </div>
          </div>

          <BookNodeTree
            bookId={book.bookId}
            nodes={nodes}
            onNodesChange={handleNodesChange}
            selectedNodeId={selectedNode?.nodeId ?? null}
            onSelectNode={(node) => setSelectedNodeId(node.nodeId)}
            selectedRefId={selectedPlacement?.ref.refId ?? null}
            onSelectMaterialRef={(materialRef, node) => {
              setSelectedNodeId(node.nodeId);
              setSelectedRefId(materialRef.refId);
            }}
            onRequestDeleteNode={(node, confirmDelete) => setDeleteNodeRequest({ node, confirmDelete })}
            onTrackAction={(actionName, metadata) => trackAction(actionName, {
              bookId: book.bookId,
              ...(metadata ?? {}),
            })}
          />
        </section>
        {renderSelectedMaterialInspector()}
      </div>
    );
  };

  return (
    <div className={`book-editor-page book-editor-workspace book-editor-workspace--${presentation}`}>
      <main className="book-editor-page__main">
        {presentation === 'page-compat' && (
          <section className="book-editor-page__hero" aria-labelledby="book-editor-title">
            <div className="book-editor-page__hero-copy">
              <p className="book-editor-page__breadcrumb">Books / {book?.title ?? 'Book Editor'}</p>
              <h1 id="book-editor-title" className="book-editor-page__title">{book?.title ?? 'Book Editor'}</h1>
              <div className="book-editor-page__chips" aria-label="Book status">
                <span>{displayStatus}</span>
                <span>{metadataForm.visibility || 'private'}</span>
                <span>{metadataForm.testTypeIds || 'No Test Type'}</span>
                <span>{bookId || 'Unknown Book'}</span>
              </div>
              <p className="book-editor-page__copy">
                Whole-Book assignment is not available in V1. Assign selected referenced materials instead.
              </p>
            </div>
            {book && !publicProjection && (
              <div className="book-editor-page__hero-actions">
                <button type="button" className="book-editor-page__secondary-button" onClick={() => updateActiveTab('content')}>
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (effectiveActiveTab === 'overview' || effectiveActiveTab === 'settings') {
                      void handleSaveMetadata();
                      return;
                    }
                    void handleSaveStructure();
                  }}
                >
                  Save
                </button>
                <button type="button" className="book-editor-page__secondary-button" onClick={() => void handleRequestPublicReview()}>
                  Request review
                </button>
              </div>
            )}
          </section>
        )}

        {loading && <p className="book-editor-page__status">Loading Book...</p>}
        {errorState && (
          <div className="book-editor-page__error" role="alert">
            <strong>{errorState.title}</strong>
            <p>{errorState.message}</p>
            {errorState.retryable && (
              <button type="button" onClick={() => setLoadVersion((version) => version + 1)}>
                Retry
              </button>
            )}
          </div>
        )}
        {saveMessage && <p className="book-editor-page__status">{saveMessage}</p>}

        {book && !publicProjection && presentation === 'page-compat' && (
          <nav className="book-editor-page__tabs" aria-label="Book editor tabs" role="tablist">
            {BOOK_EDITOR_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={effectiveActiveTab === tab.id}
                className={effectiveActiveTab === tab.id ? 'is-active' : undefined}
                onClick={() => updateActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        {publicProjection && (
          <section className="book-editor-page__section" aria-labelledby="book-editor-public-outline">
            <div className="book-editor-page__section-heading">
              <div>
                <h2 id="book-editor-public-outline">Public Book outline</h2>
                <p>Approved public structure.</p>
              </div>
            </div>
            <ol className="book-editor-page__public-outline">
              {[...publicProjection.nodes]
                .sort((left, right) => left.order - right.order)
                .map((node) => {
                  const materialRefs = Array.isArray(node.materialRefs) ? node.materialRefs : [];

                  return (
                    <li key={node.nodeId} className="book-editor-page__public-node">
                      <strong>{node.title}</strong>
                      {materialRefs.length > 0 && (
                        <ol>
                          {[...materialRefs]
                            .sort((left, right) => left.order - right.order)
                            .map((materialRef) => (
                              <li key={materialRef.refId}>{materialRef.title}</li>
                            ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
            </ol>
          </section>
        )}

        {book && !publicProjection && (
          <>
            {effectiveActiveTab === 'overview' && renderOverviewTab()}
            {effectiveActiveTab === 'content' && renderContentTab()}
            {effectiveActiveTab === 'settings' && renderSettingsTab()}
            {presentation === 'page-compat' && (
              <div className="book-editor-page__status-strip" aria-label="Book editor status">
                <span>{materialRefPlacements.length} materials in book</span>
                <span>{selectedPlacement ? '1 selected' : '0 selected'}</span>
                <span>Save state separate from readiness</span>
              </div>
            )}
          </>
        )}
      </main>
      {homeworkModal}
      {deleteNodeRequest && (
        <div className="book-editor-workspace__confirm-backdrop">
          <div
            className="book-editor-workspace__confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-editor-delete-node-title"
          >
            <h2 id="book-editor-delete-node-title">Delete Book node</h2>
            <p>
              Delete "{deleteNodeRequest.node.title}" and its child placements?
            </p>
            <p>Source materials are not deleted.</p>
            <div className="book-editor-workspace__confirm-actions">
              <button
                type="button"
                className="book-editor-page__secondary-button"
                onClick={() => setDeleteNodeRequest(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteNodeRequest.confirmDelete();
                  setDeleteNodeRequest(null);
                }}
              >
                Delete node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

BookEditorWorkspace.displayName = 'BookEditorWorkspace';

export default BookEditorWorkspace;
