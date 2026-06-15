import type { ReadingV2FullTestComposition, ReadingV2PassageRef } from '../../types/readingV2.types';

export type ReadingV2BrokenRefReason =
  | 'archived'
  | 'deleted'
  | 'missing-version'
  | 'missing-projection'
  | 'inaccessible'
  | 'unknown';

export type ReadingV2BrokenRefAffordance =
  | 'restore'
  | 'choose-existing'
  | 'remove-ref'
  | 'clone-remake'
  | 'blocked';

export interface ReadingV2PassageReferenceState {
  readonly materialId: string;
  readonly ownerId?: string;
  readonly state?: string;
  readonly currentVersionId?: string;
  readonly versionExists?: boolean;
  readonly projectionExists?: boolean;
  readonly accessible?: boolean;
}

export interface ReadingV2BrokenReferenceEntry {
  readonly refId: string;
  readonly passageMaterialId: string;
  readonly snapshotVersionId: string;
  readonly reason: ReadingV2BrokenRefReason;
  readonly affordances: readonly ReadingV2BrokenRefAffordance[];
}

export interface ReadingV2BrokenReferenceSummary {
  readonly hasBrokenRefs: boolean;
  readonly brokenRefCount: number;
  readonly brokenRefReasons: readonly ReadingV2BrokenRefReason[];
  readonly brokenRefs: readonly ReadingV2BrokenReferenceEntry[];
}

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

const affordancesFor = (
  reason: ReadingV2BrokenRefReason,
): readonly ReadingV2BrokenRefAffordance[] => {
  if (reason === 'unknown') {
    return ['blocked'];
  }

  if (reason === 'archived') {
    return ['restore', 'choose-existing', 'remove-ref', 'clone-remake'];
  }

  return ['choose-existing', 'remove-ref', 'clone-remake'];
};

const reasonFor = (
  ref: ReadingV2PassageRef,
  state: ReadingV2PassageReferenceState | undefined,
): ReadingV2BrokenRefReason | null => {
  if (!state) {
    return 'deleted';
  }

  const materialState = String(state.state ?? 'published').trim().toLowerCase();
  if (materialState === 'archived' || materialState === 'removed') {
    return 'archived';
  }

  if (state.accessible === false) {
    return 'inaccessible';
  }

  if (state.versionExists === false || (state.currentVersionId && state.currentVersionId !== ref.snapshotVersionId)) {
    return 'missing-version';
  }

  if (state.projectionExists === false) {
    return 'missing-projection';
  }

  return null;
};

export const detectReadingV2BrokenReferences = (input: {
  readonly composition: Pick<ReadingV2FullTestComposition, 'passageRefs'>;
  readonly passageStates: Readonly<Record<string, ReadingV2PassageReferenceState | undefined>>;
  readonly actorUserId?: string;
}): ReadingV2BrokenReferenceSummary => {
  const brokenRefs = input.composition.passageRefs.flatMap((ref) => {
    const materialId = ref.passageMaterialId || ref.materialId;
    const reason = reasonFor(ref, input.passageStates[materialId]);

    return reason
      ? [{
          refId: ref.refId,
          passageMaterialId: materialId,
          snapshotVersionId: ref.snapshotVersionId,
          reason,
          affordances: affordancesFor(reason),
        }]
      : [];
  });

  return {
    hasBrokenRefs: brokenRefs.length > 0,
    brokenRefCount: brokenRefs.length,
    brokenRefReasons: unique(brokenRefs.map((entry) => entry.reason)),
    brokenRefs,
  };
};

export const assertReadingV2MasterHasNoBrokenRefs = (
  summary: Pick<ReadingV2BrokenReferenceSummary, 'hasBrokenRefs' | 'brokenRefCount' | 'brokenRefReasons'> | null | undefined,
): void => {
  if (summary?.hasBrokenRefs || Number(summary?.brokenRefCount ?? 0) > 0) {
    const reasons = summary?.brokenRefReasons?.join(', ') || 'unknown';
    throw new Error(`Reading V2 master has unresolved broken Reading Passage refs: ${reasons}.`);
  }
};

export const getReadingV2BrokenReferenceSummaryFromComposition = (
  composition: Partial<ReadingV2FullTestComposition> & {
    readonly hasBrokenRefs?: boolean;
    readonly brokenRefCount?: number;
    readonly brokenRefReasons?: readonly ReadingV2BrokenRefReason[];
  },
): ReadingV2BrokenReferenceSummary => ({
  hasBrokenRefs: Boolean(composition.hasBrokenRefs) || Number(composition.brokenRefCount ?? 0) > 0,
  brokenRefCount: Number(composition.brokenRefCount ?? 0),
  brokenRefReasons: composition.brokenRefReasons ?? [],
  brokenRefs: [],
});
