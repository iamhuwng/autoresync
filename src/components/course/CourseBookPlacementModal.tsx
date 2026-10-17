import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from '../modern';
import { createFirebaseMaterialBooksRepository } from '../books/useBookEditorModeResolution';
import {
  listTeacherBooks,
  type MaterialBookListRow,
} from '../../services/materialCatalog/materialBooks.service';
import type { CourseBookCompletionAggregationPolicy, CourseBookSelection } from '../../services/book-delivery/courseBookPlacement.service';
import {
  courseBookExposureWarning,
  courseBookSelectionCount,
  type CourseBookSelectionCatalog,
} from '../../services/book-delivery/courseBookPlacement.selection';

export interface CourseBookPlacementRequest {
  readonly operationId: string;
  readonly courseId: string;
  readonly moduleId: string;
  readonly courseMaterialId: string;
  readonly selection: {
    readonly bookId: string;
    readonly scope: CourseBookSelection;
    readonly completionAggregationPolicy: CourseBookCompletionAggregationPolicy;
  };
}

interface CourseBookPlacementModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly teacherId: string;
  readonly courseId: string;
  readonly moduleId: string;
  readonly readCatalog: (bookId: string) => Promise<CourseBookSelectionCatalog>;
  readonly place: (request: CourseBookPlacementRequest) => Promise<unknown>;
  readonly onPlaced: () => void | Promise<void>;
  readonly trackAction: (action: string, metadata?: Record<string, unknown>) => void;
  readonly loadBooks?: () => Promise<readonly MaterialBookListRow[]>;
}

const defaultLoadBooks = (teacherId: string) => () => listTeacherBooks({
  teacherId,
  scope: 'private',
  repository: createFirebaseMaterialBooksRepository(),
});

export const CourseBookPlacementModal = ({
  opened,
  onClose,
  teacherId,
  courseId,
  moduleId,
  readCatalog,
  place,
  onPlaced,
  trackAction,
  loadBooks,
}: CourseBookPlacementModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [books, setBooks] = useState<readonly MaterialBookListRow[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CourseBookSelectionCatalog | null>(null);
  const [scopeKind, setScopeKind] = useState<'subtree' | 'placements'>('subtree');
  const [nodeKey, setNodeKey] = useState<string | null>(null);
  const [placementIds, setPlacementIds] = useState<string[]>([]);
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [allowDerivedHomeworkCredit, setAllowDerivedHomeworkCredit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (opened && dialog && !dialog.open) {
      if (dialog.showModal) dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    let active = true;
    setLoading(true);
    void (loadBooks ?? defaultLoadBooks(teacherId))()
      .then((rows) => { if (active) setBooks(rows.filter((row) => row.isOwner && row.status === 'ready')); })
      .catch(() => { if (active) toast.error('Could not load your ready Books.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadBooks, opened, teacherId]);

  useEffect(() => {
    setCatalog(null);
    setNodeKey(null);
    setPlacementIds([]);
    setWarningAccepted(false);
    if (!bookId) return;
    let active = true;
    setLoading(true);
    void readCatalog(bookId)
      .then((value) => { if (active) setCatalog(value); })
      .catch(() => { if (active) toast.error('This Book does not have an accepted publication available for Course placement.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId, readCatalog]);

  const selection = useMemo<CourseBookSelection | null>(() => {
    if (scopeKind === 'subtree') {
      return nodeKey ? { kind: 'subtree', nodeKeys: [nodeKey], placementIds: [] } : null;
    }
    return placementIds.length > 0
      ? { kind: 'placements', nodeKeys: [], placementIds }
      : null;
  }, [nodeKey, placementIds, scopeKind]);
  const warning = catalog && selection ? courseBookExposureWarning(catalog, selection) : null;
  const selectedCount = catalog && selection ? courseBookSelectionCount(catalog, selection) : 0;
  const eligibleNodes = catalog?.nodes.filter((node) => (
    !node.nodeType.endsWith('-placeholder')
    && courseBookSelectionCount(catalog, { kind: 'subtree', nodeKeys: [node.nodeKey], placementIds: [] }) > 0
  )) ?? [];

  const submit = async () => {
    if (!catalog || !selection || selectedCount === 0 || (warning && !warningAccepted)) return;
    setPlacing(true);
    trackAction('placeCourseBook', { courseId, moduleId, selectionKind: selection.kind, selectedCount });
    try {
      await place({
        operationId: crypto.randomUUID(),
        courseMaterialId: crypto.randomUUID(),
        courseId,
        moduleId,
        selection: {
          bookId: catalog.bookId,
          scope: selection,
          completionAggregationPolicy: allowDerivedHomeworkCredit
            ? 'all-activities-with-derived-homework-credit'
            : 'all-activities',
        },
      });
      toast.success(`Placed ${selectedCount} Book ${selectedCount === 1 ? 'Activity' : 'Activities'} in this Course module.`);
      await onPlaced();
      onClose();
    } catch {
      toast.error('Could not place this Book selection. Refresh the Book publication and try again.');
    } finally {
      setPlacing(false);
    }
  };

  if (!opened) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-md border border-slate-300 bg-white p-5 text-slate-800 backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-lg font-semibold">Add Book to Course module</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-11 min-w-11 rounded border border-slate-300">×</button>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Published Book
          <select
            aria-label="Published Book"
            value={bookId ?? ''}
            onChange={(event) => setBookId(event.currentTarget.value || null)}
            disabled={loading}
            className="min-h-11 rounded border border-slate-300 bg-white p-2"
          >
            <option value="">{loading ? 'Loading Books…' : 'Choose a ready Book'}</option>
            {books.map((book) => <option key={book.bookId} value={book.bookId}>{book.title}</option>)}
          </select>
        </label>
        {catalog && (
          <>
            <fieldset className="flex gap-4 border-0 p-0 text-sm">
              <legend className="mb-2 font-medium">Selection scope</legend>
              {(['subtree', 'placements'] as const).map((kind) => (
                <label key={kind} className="flex min-h-11 items-center gap-2">
                  <input type="radio" name={titleId} checked={scopeKind === kind} onChange={() => { setScopeKind(kind); setWarningAccepted(false); }} />
                  {kind === 'subtree' ? 'Book subtree' : 'Activities'}
                </label>
              ))}
            </fieldset>
            {scopeKind === 'subtree' ? (
              <label className="flex flex-col gap-1 text-sm">
                Subtree
                <span className="text-xs text-slate-500">One Course item will contain every published Activity below this node.</span>
                <select aria-label="Subtree" value={nodeKey ?? ''} onChange={(event) => { setNodeKey(event.currentTarget.value || null); setWarningAccepted(false); }} className="min-h-11 rounded border border-slate-300 bg-white p-2">
                  <option value="">Choose a subtree</option>
                  {eligibleNodes.map((node) => <option key={node.nodeKey} value={node.nodeKey}>{node.nodeType} · {node.nodeKey}</option>)}
                </select>
              </label>
            ) : (
              <fieldset className="flex flex-col gap-2 border-0 p-0 text-sm">
                <legend className="font-medium">Activities</legend>
                <p className="m-0 text-xs text-slate-500">The selected Activities become one Course item.</p>
                {catalog.placements.map((placement) => (
                  <label key={placement.placementId} className="flex min-h-11 items-center gap-2">
                    <input type="checkbox" checked={placementIds.includes(placement.placementId)} onChange={(event) => {
                      setPlacementIds(event.currentTarget.checked ? [...placementIds, placement.placementId] : placementIds.filter((id) => id !== placement.placementId));
                      setWarningAccepted(false);
                    }} />
                    {placement.nodeKey} · {placement.activityId}
                  </label>
                ))}
              </fieldset>
            )}
            {selectedCount > 0 && <p className="m-0 text-sm">{selectedCount} published {selectedCount === 1 ? 'Activity' : 'Activities'} selected</p>}
            {warning && (
              <section className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
                <h3 className="m-0 text-sm font-semibold">PDF visibility confirmation</h3>
                <p>{warning}</p>
                <label className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={warningAccepted} onChange={(event) => setWarningAccepted(event.currentTarget.checked)} />
                  I understand what students can view.
                </label>
              </section>
            )}
            <div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={allowDerivedHomeworkCredit} onChange={(event) => setAllowDerivedHomeworkCredit(event.currentTarget.checked)} />
                Count Homework created from this exact Course item toward its completion
              </label>
              <p className="m-0 text-xs text-slate-500">Off by default. Credit applies only when Homework retains this Course material identity and exact Activity placement.</p>
            </div>
          </>
        )}
        <button
          type="button"
          className="min-h-11 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void submit()}
          aria-busy={placing}
          disabled={placing || !catalog || !selection || selectedCount === 0 || Boolean(warning && !warningAccepted)}
        >
          {placing ? 'Adding Book item…' : 'Add Book item'}
        </button>
      </div>
    </dialog>
  );
};
