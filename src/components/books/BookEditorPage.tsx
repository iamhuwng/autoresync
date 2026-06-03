import { useEffect, useMemo, useState } from 'react';
import { get, ref, remove, set } from 'firebase/database';
import { useParams } from 'react-router-dom';
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
  filterPublishedMaterialSummaries,
  type BookMaterialSummary,
} from '../../services/materialCatalog/bookEditor.service';
import {
  materialCatalogIds,
  type MaterialBookMaterialRef,
  type MaterialBookMetadata,
  type MaterialBookNode,
  type MaterialBookPublicProjection,
  type MaterialBookVisibility,
} from '../../types/materialCatalog.types';
import type { ReadingPassageHomeworkCandidate } from '../../services/reading-v2/readingV2PassageHomework.service';
import { HomeworkCreateModal } from '../homework/HomeworkCreateModal';
import { TeacherHeader } from '../navigation';
import BookNodeTree from './BookNodeTree';
import './BookEditorPage.css';

interface BookEditorPageProps {
  readonly initialBook?: MaterialBookMetadata;
  readonly initialNodes?: readonly MaterialBookNode[];
  readonly materialCandidates?: readonly BookMaterialSummary[];
  readonly repository?: MaterialBooksRepository;
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

const SUPPORTED_BOOK_PICKER_KINDS = new Set(['full-test', 'reading-passage', 'thcs-thpt-test']);
const EMPTY_BOOK_NODES: readonly MaterialBookNode[] = [];

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
  });

const BookEditorPage = ({
  initialBook,
  initialNodes,
  materialCandidates,
  repository,
}: BookEditorPageProps) => {
  const { bookId } = useParams<{ bookId: string }>();
  const { user, profile, logout } = useAuth();
  const { trackAction } = useFeatureTracking(FEATURE_IDS.readingV2Studio);
  const initialNodeList = initialNodes ?? EMPTY_BOOK_NODES;
  const resolvedRepository = useMemo(() => repository ?? createFirebaseRepository(), [repository]);
  const [book, setBook] = useState<MaterialBookMetadata | null>(initialBook ?? null);
  const [nodes, setNodes] = useState<readonly MaterialBookNode[]>(initialNodeList);
  const [publicProjection, setPublicProjection] = useState<MaterialBookPublicProjection | null>(null);
  const [metadataForm, setMetadataForm] = useState<MetadataFormState>(() => formFromBook(initialBook));
  const [loadedCandidates, setLoadedCandidates] = useState<readonly BookMaterialSummary[]>([]);
  const [loading, setLoading] = useState(!initialBook && Boolean(bookId));
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [assignmentRequest, setAssignmentRequest] = useState<AssignmentRequest | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const errorState = classifyBookEditorError(error, Boolean(book));

  useEffect(() => {
    if (!bookId) {
      return;
    }

    trackAction('openBook', {
      bookId,
      source: 'book_editor_route',
    });
  }, [bookId, trackAction]);

  useEffect(() => {
    if (!initialBook) {
      return;
    }

    setBook(initialBook);
    setPublicProjection(null);
    setMetadataForm(formFromBook(initialBook));
    setNodes(initialNodeList);
  }, [initialBook, initialNodeList]);

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

  const updateForm = (field: keyof MetadataFormState, value: string) => {
    setMetadataForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleRequestPublicReview = (): void => {
    setMetadataForm((current) => ({
      ...current,
      visibility: 'public-library-pending-review',
    }));
    trackAction('teacher_materials_book_public_review_requested', {
      bookId: book?.bookId ?? bookId,
      source: 'book_editor_metadata',
    });
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
        {
          title: metadataForm.title,
          subtitle: metadataForm.subtitle || undefined,
          authors: splitCsv(metadataForm.authors),
          publisher: metadataForm.publisher || undefined,
          edition: metadataForm.edition || undefined,
          series: metadataForm.series || undefined,
          isbn: metadataForm.isbn || undefined,
          coverUrl: metadataForm.coverUrl || undefined,
          tags: splitCsv(metadataForm.tags),
          description: metadataForm.description || undefined,
          visibility: metadataForm.visibility,
          testTypeIds: splitCsv(metadataForm.testTypeIds).map((testTypeId) => materialCatalogIds.testTypeId(testTypeId)),
        },
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
      setMetadataForm(formFromBook(result.metadata));
      setSaveMessage(`Book structure saved. Readiness: ${result.metadata.status}.`);
      trackAction('saveBookStructure', { bookId: result.metadata.bookId, nodeCount: result.nodes.length });
      trackAction('teacher_materials_book_updated', {
        bookId: result.metadata.bookId,
        source: 'book_editor_structure',
        nodeCount: result.nodes.length,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Book structure.');
    }
  };

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

  return (
    <div className="book-editor-page">
      <TeacherHeader
        pageTitle="Book Editor"
        userId={user?.uid}
        userRole={profile?.role}
        userDisplayName={profile?.displayName || user?.displayName || user?.email}
        userEmail={profile?.email || user?.email}
        userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
        onLogout={() => {
          void logout?.();
        }}
      />
      <main className="book-editor-page__main">
        <section className="book-editor-page__hero">
          <p className="book-editor-page__eyebrow">Teacher Materials</p>
          <h1 className="book-editor-page__title">{book?.title ?? 'Book Editor'}</h1>
          <p className="book-editor-page__copy">
            Whole-Book assignment is not available in V1. Assignment actions apply only to selected referenced materials.
          </p>
          <span className="book-editor-page__book-id">{bookId || 'Unknown Book'}</span>
        </section>

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
            <section className="book-editor-page__section" aria-labelledby="book-editor-metadata">
              <div className="book-editor-page__section-heading">
                <div>
                  <h2 id="book-editor-metadata">Metadata</h2>
                  <p>Readiness: {displayStatus}. Save state is separate from readiness.</p>
                </div>
                <button type="button" onClick={() => void handleSaveMetadata()}>
                  Save Metadata
                </button>
              </div>

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
                <label>
                  <span>Visibility</span>
                  <select value={metadataForm.visibility} onChange={(event) => updateForm('visibility', event.target.value)}>
                    <option value="private">Private</option>
                    <option value="public-library-pending-review">Public review requested</option>
                  </select>
                </label>
                <button type="button" onClick={handleRequestPublicReview}>
                  Request public review
                </button>
                <label className="book-editor-page__wide-field">
                  <span>Description</span>
                  <textarea value={metadataForm.description} onChange={(event) => updateForm('description', event.target.value)} />
                </label>
              </div>
            </section>

            <section className="book-editor-page__section" aria-labelledby="book-editor-structure">
              <div className="book-editor-page__section-heading">
                <div>
                  <h2 id="book-editor-structure">Structure</h2>
                  <p>Placeholder nodes stay lightweight in V1; refs assign source materials only.</p>
                </div>
                <button type="button" onClick={() => void handleSaveStructure()}>
                  Save Book Structure
                </button>
              </div>

              <BookNodeTree
                bookId={book.bookId}
                nodes={nodes}
                materialCandidates={pickerMaterials}
                onNodesChange={setNodes}
                actorId={user?.uid}
                onAssignMaterialRef={(materialRef) => handleAssignMaterialRef(materialRef)}
                onTrackAction={(actionName, metadata) => trackAction(actionName, {
                  bookId: book.bookId,
                  ...(metadata ?? {}),
                })}
              />
            </section>
          </>
        )}
      </main>
      {homeworkModal}
    </div>
  );
};

export default BookEditorPage;
