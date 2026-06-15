import React, { useEffect, useMemo, useState } from 'react';
import './ReadingV2MasterEditModal.css';
import {
  ReadingV2MasterRepairPanel,
  type ReadingV2BrokenRefEntry,
} from './ReadingV2MasterRepairPanel';

type MasterMode = 'published' | 'draft';

export interface ReadingV2MasterPassageRef {
  readonly refId?: string;
  readonly id?: string;
  readonly materialId?: string;
  readonly passageMaterialId?: string;
  readonly title?: string;
  readonly titleSnapshot?: string;
  readonly ownerId?: string;
  readonly visibility?: string;
  readonly order?: number;
  readonly questionCount?: number;
  readonly questionCountSnapshot?: number;
  readonly currentVersionId?: string;
  readonly snapshotVersionId?: string;
  readonly testTypeIds?: readonly string[];
  readonly testTypeIdsSnapshot?: readonly string[];
}

export interface ReadingV2MasterReplacementPassage extends ReadingV2MasterPassageRef {
  readonly state?: string;
  readonly archived?: boolean;
  readonly archivedAt?: string | null;
  readonly accessible?: boolean;
  readonly selectable?: boolean;
  readonly publishedSnapshotVersionId?: string;
}

interface ReadingV2MasterRecord {
  readonly materialId?: string;
  readonly testMaterialId?: string;
  readonly compositionId?: string;
  readonly publishedVersionId?: string;
  readonly title?: string;
  readonly visibility?: string;
  readonly mode?: string;
  readonly questionCount?: number;
  readonly compositionLoadState?: 'loading' | 'ready' | 'missing-composition' | 'load-failed' | 'not-required' | string;
  readonly compositionLoadError?: string;
  readonly passageRefs?: readonly ReadingV2MasterPassageRef[];
  readonly passages?: readonly ReadingV2MasterPassageRef[];
  readonly metadata?: {
    readonly title?: string;
    readonly visibility?: string;
    readonly questionCount?: number;
  };
}

interface MasterPayload {
  readonly mode: MasterMode;
  readonly title: string;
  readonly visibility: string;
  readonly passageRefs: readonly ReadingV2MasterPassageRef[];
  readonly master: ReadingV2MasterRecord;
}

export interface ReadingV2MasterEditModalProps {
  readonly open: boolean;
  readonly mode: MasterMode;
  readonly currentTeacherId: string;
  readonly master: ReadingV2MasterRecord | null;
  readonly onClose: () => void;
  readonly onSaveDraft?: (payload: MasterPayload) => void;
  readonly onPublish?: (payload: MasterPayload) => void;
  readonly onOpenPassageStudio?: (payload: {
    readonly routeName: 'TEACHER_READING_V2_REVISE' | 'TEACHER_READING_V2_CREATE';
    readonly params?: { readonly materialId?: string; readonly sourceMaterialId?: string; readonly refId?: string };
    readonly target: 'new-tab';
  }) => void;
  readonly onRefreshVersionStatus?: (master: ReadingV2MasterRecord) => void;
  readonly brokenRefSummary?: {
    readonly hasBrokenRefs: boolean;
    readonly brokenRefCount: number;
    readonly brokenRefReasons: readonly string[];
    readonly brokenRefs: readonly ReadingV2BrokenRefEntry[];
  } | null;
  readonly replacementPassages?: readonly ReadingV2MasterReplacementPassage[];
  readonly onRepairWithExisting?: (payload: {
    readonly brokenRef: ReadingV2BrokenRefEntry;
    readonly replacement: ReadingV2MasterReplacementPassage;
  }) => void;
  readonly onRemoveBrokenRef?: (brokenRef: ReadingV2BrokenRefEntry) => void;
  readonly onRemakeBrokenRef?: (brokenRef: ReadingV2BrokenRefEntry) => void;
  readonly onRestoreBrokenSource?: (brokenRef: ReadingV2BrokenRefEntry) => void;
}

const getTitle = (master: ReadingV2MasterRecord | null): string =>
  String(master?.title || master?.metadata?.title || 'Untitled Reading V2 master');

const getVisibility = (master: ReadingV2MasterRecord | null): string =>
  String(master?.visibility || master?.metadata?.visibility || 'private');

const getPassageId = (ref: ReadingV2MasterPassageRef): string =>
  String(ref.passageMaterialId || ref.materialId || ref.id || ref.refId || '').trim();

const getPassageTitle = (ref: ReadingV2MasterPassageRef, index: number): string =>
  String(ref.title || ref.titleSnapshot || `Reading Passage ${index + 1}`);

const normalizePassageRefs = (master: ReadingV2MasterRecord | null): ReadingV2MasterPassageRef[] => {
  const refs = [...(master?.passageRefs ?? master?.passages ?? [])];

  return refs
    .map((ref, index) => ({
      ...ref,
      order: Number(ref.order || index + 1),
    }))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
};

const getRefKey = (ref: ReadingV2MasterPassageRef | ReadingV2BrokenRefEntry): string =>
  String(ref.refId || ref.passageMaterialId || ref.materialId || '').trim();

const getQuestionCount = (ref: ReadingV2MasterPassageRef): number =>
  Number(ref.questionCount ?? ref.questionCountSnapshot ?? 0);

const toPassageRefFromReplacement = (
  brokenRef: ReadingV2BrokenRefEntry,
  replacement: ReadingV2MasterReplacementPassage,
  previous: ReadingV2MasterPassageRef,
): ReadingV2MasterPassageRef => ({
  ...previous,
  ...replacement,
  refId: previous.refId || brokenRef.refId || replacement.refId || replacement.materialId,
  id: replacement.id || replacement.materialId || replacement.passageMaterialId,
  materialId: replacement.materialId || replacement.passageMaterialId || replacement.id,
  passageMaterialId: replacement.passageMaterialId || replacement.materialId || replacement.id,
  title: replacement.title,
  titleSnapshot: replacement.titleSnapshot || replacement.title,
  currentVersionId: replacement.currentVersionId || replacement.publishedSnapshotVersionId,
  snapshotVersionId: replacement.snapshotVersionId || replacement.publishedSnapshotVersionId || replacement.currentVersionId,
  questionCount: replacement.questionCount ?? replacement.questionCountSnapshot,
  questionCountSnapshot: replacement.questionCountSnapshot ?? replacement.questionCount,
});

export const ReadingV2MasterEditModal: React.FC<ReadingV2MasterEditModalProps> = ({
  open,
  mode,
  currentTeacherId,
  master,
  onClose,
  onSaveDraft,
  onPublish,
  onOpenPassageStudio,
  onRefreshVersionStatus,
  brokenRefSummary,
  replacementPassages = [],
  onRepairWithExisting,
  onRemoveBrokenRef,
  onRemakeBrokenRef,
  onRestoreBrokenSource,
}) => {
  const initialRefs = useMemo(() => normalizePassageRefs(master), [master]);
  const [title, setTitle] = useState(getTitle(master));
  const [visibility, setVisibility] = useState(getVisibility(master));
  const [passageRefs, setPassageRefs] = useState<ReadingV2MasterPassageRef[]>(initialRefs);
  const [dirty, setDirty] = useState(false);
  const [clearedBrokenRefKeys, setClearedBrokenRefKeys] = useState<readonly string[]>([]);
  const [mixedTestTypeConfirmations, setMixedTestTypeConfirmations] = useState<Record<string, boolean>>({});
  const [numberingConfirmed, setNumberingConfirmed] = useState(false);
  const [publishBlockMessage, setPublishBlockMessage] = useState('');

  useEffect(() => {
    setTitle(getTitle(master));
    setVisibility(getVisibility(master));
    setPassageRefs(normalizePassageRefs(master));
    setDirty(false);
    setClearedBrokenRefKeys([]);
    setMixedTestTypeConfirmations({});
    setNumberingConfirmed(false);
    setPublishBlockMessage('');
  }, [master, open]);

  if (!open || !master) {
    return null;
  }

  const buildPayload = (): MasterPayload => ({
    mode,
    title,
    visibility,
    passageRefs,
    master,
  });

  const brokenRefs = brokenRefSummary?.brokenRefs ?? [];
  const unresolvedBrokenRefs = brokenRefs.filter((brokenRef) => {
    const key = getRefKey(brokenRef);
    if (clearedBrokenRefKeys.includes(key)) {
      return false;
    }
    return passageRefs.some((ref) => getRefKey(ref) === key || getPassageId(ref) === getPassageId(brokenRef));
  });
  const initialQuestionCount = initialRefs.reduce((total, ref) => total + getQuestionCount(ref), 0);
  const currentQuestionCount = passageRefs.reduce((total, ref) => total + getQuestionCount(ref), 0);
  const declaredQuestionCount = Number(master.questionCount ?? master.metadata?.questionCount ?? 0);
  const compositionLoadState = String(master.compositionLoadState || '');
  const hasUnresolvedPublishedMasterRefs = mode === 'published' &&
    passageRefs.length === 0 &&
    (
      declaredQuestionCount > 0 ||
      ['loading', 'missing-composition', 'load-failed'].includes(compositionLoadState)
    );
  const numberingChanged = initialQuestionCount !== currentQuestionCount || dirty;
  const needsNumberingConfirmation = numberingChanged && !numberingConfirmed;

  const clearBrokenRef = (brokenRef: ReadingV2BrokenRefEntry) => {
    const key = getRefKey(brokenRef);
    setClearedBrokenRefKeys((current) => (current.includes(key) ? current : [...current, key]));
  };

  const handleAddExisting = (payload: {
    readonly brokenRef: ReadingV2BrokenRefEntry;
    readonly replacement: ReadingV2MasterReplacementPassage;
  }) => {
    setPassageRefs((refs) => refs.map((ref) => (
      getRefKey(ref) === getRefKey(payload.brokenRef) || getPassageId(ref) === getPassageId(payload.brokenRef)
        ? toPassageRefFromReplacement(payload.brokenRef, payload.replacement, ref)
        : ref
    )));
    setDirty(true);
    setNumberingConfirmed(false);
    clearBrokenRef(payload.brokenRef);
    onRepairWithExisting?.(payload);
  };

  const handleRemoveBrokenRef = (brokenRef: ReadingV2BrokenRefEntry) => {
    setPassageRefs((refs) => refs
      .filter((ref) => getRefKey(ref) !== getRefKey(brokenRef) && getPassageId(ref) !== getPassageId(brokenRef))
      .map((ref, index) => ({ ...ref, order: index + 1 })));
    setDirty(true);
    setNumberingConfirmed(false);
    clearBrokenRef(brokenRef);
    onRemoveBrokenRef?.(brokenRef);
  };

  const handleRemakeBrokenRef = (brokenRef: ReadingV2BrokenRefEntry) => {
    onRemakeBrokenRef?.(brokenRef);
    onOpenPassageStudio?.({
      routeName: 'TEACHER_READING_V2_CREATE',
      params: {
        sourceMaterialId: brokenRef.passageMaterialId || brokenRef.materialId,
        refId: brokenRef.refId,
      },
      target: 'new-tab',
    });
  };

  const handleRestoreBrokenRef = (brokenRef: ReadingV2BrokenRefEntry) => {
    clearBrokenRef(brokenRef);
    setDirty(true);
    onRestoreBrokenSource?.(brokenRef);
  };

  const handlePublish = () => {
    if (hasUnresolvedPublishedMasterRefs) {
      setPublishBlockMessage('Resolve this master composition before publishing.');
      return;
    }
    if (unresolvedBrokenRefs.length > 0) {
      setPublishBlockMessage('Repair or remove every broken passage before publishing.');
      return;
    }
    if (needsNumberingConfirmation) {
      setPublishBlockMessage('Confirm numbering changes before publishing.');
      return;
    }
    setPublishBlockMessage('');
    onPublish?.(buildPayload());
  };

  const moveRef = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= passageRefs.length) {
      return;
    }

    setPassageRefs((refs) => {
      const next = [...refs];
      const current = next[index];
      next[index] = next[nextIndex];
      next[nextIndex] = current;
      return next.map((ref, orderIndex) => ({ ...ref, order: orderIndex + 1 }));
    });
    setDirty(true);
  };

  return (
    <div className="reading-v2-master-modal" role="presentation">
      <div className="reading-v2-master-modal__scrim" onClick={onClose} />
      <section
        aria-label="Edit Reading V2 master"
        aria-modal="true"
        className="reading-v2-master-modal__panel"
        role="dialog"
      >
        <header className="reading-v2-master-modal__header">
          <div>
            <p className="reading-v2-master-modal__eyebrow">
              {mode === 'published' ? 'Published master' : 'Unpublished draft'}
            </p>
            <h2>Edit Reading V2 master</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close master editor">
            Close
          </button>
        </header>

        <div className="reading-v2-master-modal__body">
          <label className="reading-v2-master-modal__field">
            <span>Master title</span>
            <input
              aria-label="Master title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setDirty(true);
              }}
            />
          </label>

          <label className="reading-v2-master-modal__field">
            <span>Visibility</span>
            <select
              aria-label="Visibility"
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value);
                setDirty(true);
              }}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>

          <div className="reading-v2-master-modal__toolbar">
            <span>{dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>
            <button type="button" onClick={() => onRefreshVersionStatus?.(master)}>
              Refresh version status
            </button>
          </div>

          {brokenRefSummary?.hasBrokenRefs && (
            <div
              className="reading-v2-master-modal__broken-banner"
              role="status"
              aria-label="Broken Reading Passage refs"
            >
              {unresolvedBrokenRefs.length === 0
                ? 'Broken Reading Passage refs repaired locally. Review numbering before publishing.'
                : `${unresolvedBrokenRefs.length} passage needs repair before this master can publish.`}
            </div>
          )}

          {hasUnresolvedPublishedMasterRefs && (
            <div
              className="reading-v2-master-modal__broken-banner"
              role="status"
              aria-label="Master reference load state"
            >
              Published master references are not loaded. Reopen after composition hydration or repair the missing composition before publishing.
            </div>
          )}

          {brokenRefs.length > 0 && (
            <ReadingV2MasterRepairPanel
              brokenRefs={unresolvedBrokenRefs}
              replacementPassages={replacementPassages}
              currentTeacherId={currentTeacherId}
              mixedTestTypeConfirmations={mixedTestTypeConfirmations}
              onMixedTestTypeConfirmationChange={(refKey, confirmed) => {
                setMixedTestTypeConfirmations((current) => ({
                  ...current,
                  [refKey]: confirmed,
                }));
              }}
              onAddExisting={handleAddExisting}
              onRemove={handleRemoveBrokenRef}
              onRemake={handleRemakeBrokenRef}
              onRestore={handleRestoreBrokenRef}
            />
          )}

          <div className="reading-v2-master-modal__passages" role="list" aria-label="Master passages">
            {passageRefs.length === 0 && (
              <p>
                {hasUnresolvedPublishedMasterRefs
                  ? 'No resolved passage references are available for this published master.'
                  : 'No passage references yet.'}
              </p>
            )}
            {passageRefs.map((ref, index) => {
              const passageId = getPassageId(ref);
              const ownedByTeacher = !ref.ownerId || ref.ownerId === currentTeacherId;
              const questionCount = ref.questionCount ?? ref.questionCountSnapshot;

              return (
                <article
                  className="reading-v2-master-modal__passage-row"
                  data-testid={`master-passage-row-${passageId}`}
                  key={`${passageId}-${ref.refId || index}`}
                  role="listitem"
                >
                  <div>
                    <h3>{getPassageTitle(ref, index)}</h3>
                    <p>
                      Passage {index + 1}
                      {questionCount ? ` · ${questionCount} questions` : ''}
                      {ref.currentVersionId || ref.snapshotVersionId ? ' · version linked' : ''}
                    </p>
                  </div>
                  <div className="reading-v2-master-modal__row-actions">
                    <button type="button" onClick={() => moveRef(index, -1)} disabled={index === 0}>
                      Move up
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRef(index, 1)}
                      disabled={index === passageRefs.length - 1}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      disabled={!ownedByTeacher || !passageId}
                      onClick={() => {
                        if (!passageId) {
                          return;
                        }

                        onOpenPassageStudio?.({
                          routeName: 'TEACHER_READING_V2_REVISE',
                          params: { materialId: passageId },
                          target: 'new-tab',
                        });
                      }}
                    >
                      Open single-passage Studio
                    </button>
                    {!ownedByTeacher && <button type="button">Clone to my library</button>}
                  </div>
                </article>
              );
            })}
          </div>

          {numberingChanged && (
            <section
              className="reading-v2-master-modal__numbering-review"
              aria-label="Numbering review"
            >
              <h3>Numbering review</h3>
              <p>
                {passageRefs.length} passages - {currentQuestionCount} questions
                {initialQuestionCount !== currentQuestionCount ? ` (was ${initialQuestionCount})` : ''}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={numberingConfirmed}
                  onChange={(event) => {
                    setNumberingConfirmed(event.target.checked);
                    if (event.target.checked) {
                      setPublishBlockMessage('');
                    }
                  }}
                />
                <span>I reviewed the passage order and question numbering.</span>
              </label>
            </section>
          )}
        </div>

        <footer className="reading-v2-master-modal__footer">
          {publishBlockMessage && <p role="alert">{publishBlockMessage}</p>}
          <button type="button" onClick={() => onSaveDraft?.(buildPayload())}>
            Save Draft
          </button>
          <button type="button" onClick={handlePublish} disabled={hasUnresolvedPublishedMasterRefs}>
            Publish Master
          </button>
        </footer>
      </section>
    </div>
  );
};

export default ReadingV2MasterEditModal;
