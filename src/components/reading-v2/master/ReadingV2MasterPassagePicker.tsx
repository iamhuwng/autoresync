import React, { useMemo, useState } from 'react';

export interface ReadingV2MasterPassagePickerRow {
  readonly id?: string;
  readonly materialId?: string;
  readonly title?: string;
  readonly ownerId?: string;
  readonly state?: string;
  readonly archived?: boolean;
  readonly archivedAt?: string | null;
  readonly accessible?: boolean;
  readonly selectable?: boolean;
  readonly questionCount?: number;
  readonly durationMinutes?: number;
  readonly visibility?: string;
  readonly publishedSnapshotVersionId?: string;
  readonly currentVersionId?: string;
}

export interface ReadingV2MasterPassagePickerProps {
  readonly rows: readonly ReadingV2MasterPassagePickerRow[];
  readonly currentTeacherId: string;
  readonly selectedPassageIds: readonly string[];
  readonly onSelectPassage: (row: ReadingV2MasterPassagePickerRow) => void;
  readonly loadCanonicalPassage?: (materialId: string) => Promise<unknown>;
}

const getPassageId = (row: ReadingV2MasterPassagePickerRow): string =>
  String(row.materialId || row.id || '').trim();

const isPublishedUnarchived = (row: ReadingV2MasterPassagePickerRow): boolean => {
  const state = String(row.state || '').trim().toLowerCase();
  const hasPublishedSnapshot = Boolean(row.publishedSnapshotVersionId || row.currentVersionId);
  const isPublished = !state || state === 'published';
  const archived = row.archived === true || Boolean(row.archivedAt) || state === 'archived';
  const selectable = row.accessible !== false && row.selectable !== false;

  return Boolean(getPassageId(row)) && hasPublishedSnapshot && isPublished && !archived && selectable;
};

const canCurrentTeacherUseRow = (
  row: ReadingV2MasterPassagePickerRow,
  currentTeacherId: string,
): boolean => {
  if (row.ownerId === currentTeacherId) {
    return true;
  }

  return row.visibility === 'public' || row.visibility === 'library-eligible';
};

export const ReadingV2MasterPassagePicker: React.FC<ReadingV2MasterPassagePickerProps> = ({
  rows,
  currentTeacherId,
  selectedPassageIds,
  onSelectPassage,
}) => {
  const [status, setStatus] = useState('');
  const selectedIds = useMemo(() => new Set(selectedPassageIds.map((id) => String(id))), [selectedPassageIds]);
  const availableRows = useMemo(
    () => rows.filter((row) => isPublishedUnarchived(row) && canCurrentTeacherUseRow(row, currentTeacherId)),
    [currentTeacherId, rows],
  );

  if (availableRows.length === 0) {
    return (
      <section className="reading-v2-master-picker" aria-label="Published Reading Passages">
        <p>No published, unarchived Reading Passages are available.</p>
      </section>
    );
  }

  return (
    <section className="reading-v2-master-picker" aria-label="Published Reading Passages">
      <div className="reading-v2-master-picker__list" role="list">
        {availableRows.map((row) => {
          const passageId = getPassageId(row);
          const selected = selectedIds.has(passageId);
          const ownerLabel = row.ownerId === currentTeacherId ? 'Owned' : 'Public';

          return (
            <article
              className="reading-v2-master-picker__row"
              data-testid={`master-passage-picker-row-${passageId}`}
              key={passageId}
              role="listitem"
            >
              <div>
                <h3>{row.title || 'Untitled Reading Passage'}</h3>
                <p>
                  {ownerLabel}
                  {row.questionCount ? ` · ${row.questionCount} questions` : ''}
                  {row.durationMinutes ? ` · ${row.durationMinutes} min` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-disabled={selected}
                onClick={() => {
                  if (selected) {
                    setStatus('This passage is already selected.');
                    return;
                  }

                  setStatus('');
                  onSelectPassage(row);
                }}
              >
                {selected ? 'Already selected' : 'Add passage'}
              </button>
            </article>
          );
        })}
      </div>
      {status && <p role="status">{status}</p>}
    </section>
  );
};

export default ReadingV2MasterPassagePicker;
