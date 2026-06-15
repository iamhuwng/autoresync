import React, { useMemo, useState } from 'react';
import type { ReadingV2MasterPassageRef, ReadingV2MasterReplacementPassage } from './ReadingV2MasterEditModal';

export interface ReadingV2BrokenRefEntry {
  readonly refId?: string;
  readonly passageMaterialId?: string;
  readonly materialId?: string;
  readonly snapshotVersionId?: string;
  readonly titleSnapshot?: string;
  readonly title?: string;
  readonly questionCountSnapshot?: number;
  readonly testTypeIdsSnapshot?: readonly string[];
  readonly reason: string;
  readonly affordances: readonly string[];
}

export interface ReadingV2MasterRepairPanelProps {
  readonly brokenRefs: readonly ReadingV2BrokenRefEntry[];
  readonly replacementPassages: readonly ReadingV2MasterReplacementPassage[];
  readonly currentTeacherId: string;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly mixedTestTypeConfirmations?: Readonly<Record<string, boolean>>;
  readonly onMixedTestTypeConfirmationChange?: (refKey: string, confirmed: boolean) => void;
  readonly onAddExisting?: (payload: {
    readonly brokenRef: ReadingV2BrokenRefEntry;
    readonly replacement: ReadingV2MasterReplacementPassage;
  }) => void;
  readonly onRemove?: (brokenRef: ReadingV2BrokenRefEntry) => void;
  readonly onRemake?: (brokenRef: ReadingV2BrokenRefEntry) => void;
  readonly onRestore?: (brokenRef: ReadingV2BrokenRefEntry) => void;
  readonly loadCanonicalPassage?: (materialId: string) => Promise<unknown>;
}

const reasonLabelByCode: Record<string, string> = {
  archived: 'Removed',
  deleted: 'Missing',
  'missing-version': 'Missing version',
  'missing-projection': 'Missing projection',
  inaccessible: 'Inaccessible',
  unknown: 'Unavailable',
};

const getRefKey = (ref: ReadingV2BrokenRefEntry | ReadingV2MasterPassageRef): string =>
  String(ref.refId || ref.passageMaterialId || ref.materialId || '').trim();

const getRefTitle = (ref: ReadingV2BrokenRefEntry): string =>
  String(ref.titleSnapshot || ref.title || 'Untitled passage');

const getPassageId = (row: ReadingV2MasterReplacementPassage): string =>
  String(row.materialId || row.id || row.passageMaterialId || '').trim();

const getTestTypes = (value: { readonly testTypeIds?: readonly string[]; readonly testTypeIdsSnapshot?: readonly string[] }): readonly string[] =>
  value.testTypeIds ?? value.testTypeIdsSnapshot ?? [];

const hasSameTestType = (
  brokenRef: ReadingV2BrokenRefEntry,
  replacement: ReadingV2MasterReplacementPassage,
): boolean => {
  const brokenTypes = new Set(getTestTypes(brokenRef).map((item) => item.toLowerCase()));
  const replacementTypes = getTestTypes(replacement).map((item) => item.toLowerCase());

  return brokenTypes.size === 0 || replacementTypes.length === 0 || replacementTypes.some((item) => brokenTypes.has(item));
};

const sortedReplacements = (
  brokenRef: ReadingV2BrokenRefEntry,
  replacementPassages: readonly ReadingV2MasterReplacementPassage[],
): readonly ReadingV2MasterReplacementPassage[] =>
  [...replacementPassages].sort((left, right) => {
    const leftSame = hasSameTestType(brokenRef, left) ? 0 : 1;
    const rightSame = hasSameTestType(brokenRef, right) ? 0 : 1;
    if (leftSame !== rightSame) {
      return leftSame - rightSame;
    }
    return String(left.title || '').localeCompare(String(right.title || ''));
  });

export const ReadingV2MasterRepairPanel: React.FC<ReadingV2MasterRepairPanelProps> = ({
  brokenRefs,
  replacementPassages,
  currentTeacherId,
  loading = false,
  error = null,
  mixedTestTypeConfirmations = {},
  onMixedTestTypeConfirmationChange,
  onAddExisting,
  onRemove,
  onRemake,
  onRestore,
}) => {
  const [selectedReplacementByRef, setSelectedReplacementByRef] = useState<Record<string, string>>({});
  const sortedRowsByRef = useMemo(() => {
    const next: Record<string, readonly ReadingV2MasterReplacementPassage[]> = {};
    brokenRefs.forEach((brokenRef) => {
      next[getRefKey(brokenRef)] = sortedReplacements(brokenRef, replacementPassages);
    });
    return next;
  }, [brokenRefs, replacementPassages]);

  if (loading) {
    return <p role="status">Checking broken references...</p>;
  }

  if (brokenRefs.length === 0) {
    return <p>No broken Reading Passage refs.</p>;
  }

  return (
    <section className="reading-v2-master-repair" aria-label="Broken Reading Passage repair">
      {error && <p role="alert">{error}</p>}
      <div className="reading-v2-master-repair__list">
        {brokenRefs.map((brokenRef) => {
          const refKey = getRefKey(brokenRef);
          const rows = sortedRowsByRef[refKey] ?? [];
          const selectedId = selectedReplacementByRef[refKey] || '';
          const replacement = rows.find((row) => getPassageId(row) === selectedId);
          const canChooseExisting = brokenRef.affordances.includes('choose-existing');
          const canRemove = brokenRef.affordances.includes('remove-ref');
          const canRemake = brokenRef.affordances.includes('clone-remake');
          const canRestore = brokenRef.affordances.includes('restore');
          const mixedType = replacement ? !hasSameTestType(brokenRef, replacement) : false;
          const mixedConfirmed = mixedTestTypeConfirmations[refKey] === true;

          return (
            <article
              className="reading-v2-master-repair__item"
              data-testid={`master-repair-ref-${String(brokenRef.passageMaterialId || brokenRef.materialId || refKey)}`}
              key={refKey}
            >
              <div>
                <p className="reading-v2-master-repair__status">{reasonLabelByCode[brokenRef.reason] || 'Unavailable'}</p>
                <h3>{getRefTitle(brokenRef)}</h3>
                <p>
                  {brokenRef.snapshotVersionId ? `Version ${brokenRef.snapshotVersionId}` : 'Version unavailable'}
                  {brokenRef.questionCountSnapshot ? ` - ${brokenRef.questionCountSnapshot} questions` : ''}
                </p>
              </div>

              {canChooseExisting && (
                <div className="reading-v2-master-repair__existing">
                  <label>
                    <span>{`Replacement for ${getRefTitle(brokenRef)}`}</span>
                    <select
                      value={selectedId}
                      onChange={(event) => {
                        setSelectedReplacementByRef((current) => ({
                          ...current,
                          [refKey]: event.target.value,
                        }));
                        onMixedTestTypeConfirmationChange?.(refKey, false);
                      }}
                    >
                      <option value="">Choose published passage</option>
                      {rows.map((row) => {
                        const passageId = getPassageId(row);
                        return (
                          <option key={passageId} value={passageId}>
                            {row.title || 'Untitled Reading Passage'}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {mixedType && (
                    <label className="reading-v2-master-repair__confirm">
                      <input
                        type="checkbox"
                        checked={mixedConfirmed}
                        onChange={(event) => onMixedTestTypeConfirmationChange?.(refKey, event.target.checked)}
                      />
                      <span>I understand this replacement uses a different Test Type.</span>
                    </label>
                  )}
                  {mixedType && !mixedConfirmed && (
                    <p role="status">Confirm mixed Test Type replacement before adding this passage.</p>
                  )}
                  <button
                    type="button"
                    disabled={!replacement || (mixedType && !mixedConfirmed)}
                    onClick={() => {
                      if (replacement && (!mixedType || mixedConfirmed)) {
                        onAddExisting?.({ brokenRef, replacement });
                      }
                    }}
                  >
                    Add existing passage
                  </button>
                </div>
              )}

              <div className="reading-v2-master-repair__actions">
                {canRestore && (
                  <button type="button" onClick={() => onRestore?.(brokenRef)}>
                    Restore source passage
                  </button>
                )}
                {canRemove && (
                  <button type="button" onClick={() => onRemove?.(brokenRef)}>
                    Remove passage
                  </button>
                )}
                {canRemake && (
                  <button type="button" onClick={() => onRemake?.(brokenRef)}>
                    Remake manually
                  </button>
                )}
                {!canChooseExisting && !canRestore && !canRemove && !canRemake && (
                  <p>No repair action is available yet.</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default ReadingV2MasterRepairPanel;
