import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { toast } from '../modern';
import { createFirebaseMaterialBooksRepository } from '../books/useBookEditorModeResolution';
import {
  listTeacherBooks,
  type MaterialBookListRow,
} from '../../services/materialCatalog/materialBooks.service';
import type { CourseBookSelection } from '../../services/book-delivery/courseBookPlacement.service';
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
  const [books, setBooks] = useState<readonly MaterialBookListRow[]>([]);
  const [bookId, setBookId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CourseBookSelectionCatalog | null>(null);
  const [scopeKind, setScopeKind] = useState<'subtree' | 'placements'>('subtree');
  const [nodeKey, setNodeKey] = useState<string | null>(null);
  const [placementIds, setPlacementIds] = useState<string[]>([]);
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [placing, setPlacing] = useState(false);

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
        selection: { bookId: catalog.bookId, scope: selection },
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

  return (
    <Modal opened={opened} onClose={onClose} title="Add Book to Course module" centered>
      <Stack gap="md">
        <Select
          label="Published Book"
          placeholder={loading ? 'Loading Books…' : 'Choose a ready Book'}
          data={books.map((book) => ({ value: book.bookId, label: book.title }))}
          value={bookId}
          onChange={setBookId}
          disabled={loading}
          searchable
        />
        {catalog && (
          <>
            <SegmentedControl
              fullWidth
              value={scopeKind}
              onChange={(value) => {
                setScopeKind(value as 'subtree' | 'placements');
                setWarningAccepted(false);
              }}
              data={[{ value: 'subtree', label: 'Book subtree' }, { value: 'placements', label: 'Activities' }]}
            />
            {scopeKind === 'subtree' ? (
              <Select
                label="Subtree"
                description="One Course item will contain every published Activity below this node."
                data={eligibleNodes.map((node) => ({
                  value: node.nodeKey,
                  label: `${node.nodeType} · ${node.nodeKey}`,
                }))}
                value={nodeKey}
                onChange={(value) => { setNodeKey(value); setWarningAccepted(false); }}
                searchable
              />
            ) : (
              <MultiSelect
                label="Activities"
                description="The selected Activities become one Course item."
                data={catalog.placements.map((placement) => ({
                  value: placement.placementId,
                  label: `${placement.nodeKey} · ${placement.activityId}`,
                }))}
                value={placementIds}
                onChange={(value) => { setPlacementIds(value); setWarningAccepted(false); }}
                searchable
              />
            )}
            {selectedCount > 0 && <Text size="sm">{selectedCount} published {selectedCount === 1 ? 'Activity' : 'Activities'} selected</Text>}
            {warning && (
              <Alert color="orange" title="PDF visibility confirmation">
                <Text size="sm">{warning}</Text>
                <Checkbox
                  mt="sm"
                  checked={warningAccepted}
                  onChange={(event) => setWarningAccepted(event.currentTarget.checked)}
                  label="I understand what students can view."
                />
              </Alert>
            )}
          </>
        )}
        <Button
          onClick={() => void submit()}
          loading={placing}
          disabled={!catalog || !selection || selectedCount === 0 || Boolean(warning && !warningAccepted)}
        >
          Add Book item
        </Button>
      </Stack>
    </Modal>
  );
};
