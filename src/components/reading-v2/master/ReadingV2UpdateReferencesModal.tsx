import React, { useEffect, useMemo, useState } from 'react';
import type {
  ReadingV2ReferenceUpdateSummary,
  ReadingV2ReferenceUpdateTarget,
} from '../../../services/reading-v2/readingV2ReferenceUpdate.service';
import './ReadingV2MasterEditModal.css';

export interface ReadingV2UpdateReferencesModalProps {
  readonly open: boolean;
  readonly passageTitle: string;
  readonly summary: ReadingV2ReferenceUpdateSummary;
  readonly onClose: () => void;
  readonly onSkipAll: () => void;
  readonly onUpdateSelected: (selectedTargetIds: string[]) => void;
}

const formatTargetKind = (target: ReadingV2ReferenceUpdateTarget): string =>
  target.kind === 'master' ? 'Master test' : 'Book';

export const ReadingV2UpdateReferencesModal: React.FC<ReadingV2UpdateReferencesModalProps> = ({
  open,
  passageTitle,
  summary,
  onClose,
  onSkipAll,
  onUpdateSelected,
}) => {
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (open) {
      setSelectedTargetIds(new Set());
    }
  }, [open, summary.nextSnapshotVersionId]);

  const selectedIds = useMemo(() => Array.from(selectedTargetIds), [selectedTargetIds]);

  if (!open) {
    return null;
  }

  const toggleTarget = (targetId: string): void => {
    setSelectedTargetIds((current) => {
      const next = new Set(current);
      if (next.has(targetId)) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });
  };

  return (
    <div className="reading-v2-master-modal" role="dialog" aria-modal="true" aria-label="Update references">
      <button
        type="button"
        className="reading-v2-master-modal__scrim"
        aria-label="Close update references"
        onClick={onClose}
      />
      <section className="reading-v2-master-modal__panel reading-v2-update-references">
        <header className="reading-v2-master-modal__header">
          <div>
            <p className="reading-v2-master-modal__eyebrow">New passage version published</p>
            <h2>Update references</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </header>

        <div className="reading-v2-master-modal__body">
          <div>
            <p className="reading-v2-update-references__title">{passageTitle}</p>
            <p className="reading-v2-master-modal__eyebrow">
              {summary.previousSnapshotVersionId} to {summary.nextSnapshotVersionId}
            </p>
          </div>

          <p className="reading-v2-update-references__notice">
            Assignments and results stay frozen. Select only the owned tests or books that should point at
            this new passage version.
          </p>

          <div className="reading-v2-update-references__counts" aria-label="Reference exclusions">
            <span>{summary.excluded.nonOwnedReferenceCount} non-owned references excluded</span>
            <span>{summary.excluded.frozenAssignmentCount} frozen assignments unchanged</span>
            <span>{summary.excluded.resultSnapshotCount} result snapshots unchanged</span>
          </div>

          <div className="reading-v2-update-references__targets">
            {summary.targets.length === 0 ? (
              <p className="reading-v2-master-modal__eyebrow">No owned references need updating.</p>
            ) : summary.targets.map((target) => (
              <label
                key={target.id}
                data-testid={`reference-target-${target.id}`}
                className="reading-v2-update-references__target"
              >
                <input
                  type="checkbox"
                  checked={selectedTargetIds.has(target.id)}
                  disabled={!target.selectable}
                  onChange={() => toggleTarget(target.id)}
                />
                <span>
                  <strong>{target.title}</strong>
                  <small>
                    {formatTargetKind(target)} - {target.currentSnapshotVersionId} to {target.nextSnapshotVersionId}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <footer className="reading-v2-master-modal__footer">
          <button type="button" onClick={onSkipAll}>Keep existing tests and books unchanged</button>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => onUpdateSelected(selectedIds)}
          >
            Update selected references
          </button>
        </footer>
      </section>
    </div>
  );
};
