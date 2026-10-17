import { diffActivities } from '../book-activity/activityDiff.service';
import type {
  ActivityDiff,
  NormalizedActivity,
} from '../../types/bookActivity.types';

/**
 * Immutable, non-sensitive binding facts supplied by a later delivery owner.
 * These opaque refs are comparison values only; they are not context records.
 */
export interface BookImpactBinding {
  readonly activityRef: string | null;
  readonly placementRef: string | null;
  readonly parentRef: string | null;
  readonly order: number | null;
  readonly mappingFingerprint: string | null;
}

/** Source state is deliberately limited to a version reference and availability. */
export interface BookImpactSourceContext {
  readonly sourceVersionRef: string | null;
  readonly availability: 'available' | 'invalidated';
}

export interface BookImpactRevision {
  readonly bookRef: string;
  readonly bookMode: 'mode-1' | 'mode-2';
  /** Explicit successor only; a Book mode change without one is fail-closed. */
  readonly successorBookRef: string | null;
  readonly activity: NormalizedActivity | null;
  readonly binding: BookImpactBinding;
  readonly source: BookImpactSourceContext;
}

export interface BookImpactClassificationInput {
  readonly before: BookImpactRevision;
  readonly after: BookImpactRevision;
}

export type BookImpactEffect =
  | 'unchanged'
  | 'display-only'
  | 'regrade'
  | 'redo-required'
  | 'added'
  | 'removed'
  | 'reordered'
  | 'moved'
  | 'mapping-source-context'
  | 'successor'
  | 'invalidation'
  | 'unsupported';

export interface BookImpactClassification {
  readonly primaryEffect: BookImpactEffect;
  readonly effects: readonly BookImpactEffect[];
  readonly reasons: readonly string[];
  readonly activityDiff: Readonly<ActivityDiff>;
  readonly requiresRedo: boolean;
  readonly requiresRegrade: boolean;
  readonly requiresExplicitContextResolution: boolean;
  readonly requiresSuccessor: boolean;
}

const primaryPrecedence: readonly BookImpactEffect[] = [
  'invalidation',
  'unsupported',
  'successor',
  'redo-required',
  'added',
  'removed',
  'moved',
  'mapping-source-context',
  'reordered',
  'regrade',
  'display-only',
  'unchanged',
];

const activityEffect = (classification: ActivityDiff['classification']): BookImpactEffect => {
  if (classification === 'presentation-context') return 'mapping-source-context';
  return classification;
};

const same = (left: unknown, right: unknown): boolean => left === right;

const immutableActivityDiff = (value: ActivityDiff): Readonly<ActivityDiff> =>
  Object.freeze({
    classification: value.classification,
    reasons: Object.freeze([...value.reasons]),
    requiresRedo: value.requiresRedo,
  }) as Readonly<ActivityDiff>;

/**
 * Computes effects from already-frozen revision facts. It has no context
 * lookup, authorization, activation, persistence, or update-command input.
 */
export const classifyBookImpact = (
  input: BookImpactClassificationInput,
): BookImpactClassification => {
  const activity = immutableActivityDiff(
    diffActivities(input.before.activity, input.after.activity),
  );
  const effects = new Set<BookImpactEffect>([activityEffect(activity.classification)]);
  const reasons = [...activity.reasons];
  const before = input.before;
  const after = input.after;

  const bookRefMismatch = before.bookRef !== after.bookRef;
  const invalidBeforeSuccessorRef = before.successorBookRef !== null
    && before.successorBookRef === before.bookRef;
  const invalidAfterSuccessorRef = after.successorBookRef !== null
    && (after.successorBookRef === before.bookRef || after.successorBookRef === after.bookRef);
  const invalidSuccessorRef = invalidBeforeSuccessorRef || invalidAfterSuccessorRef;
  if (bookRefMismatch || invalidSuccessorRef) {
    effects.add('unsupported');
    reasons.push(bookRefMismatch ? 'book-ref-mismatch' : 'invalid-successor-book-ref');
  }

  const modeChanged = before.bookMode !== after.bookMode;
  const explicitSuccessor = after.successorBookRef !== null
    && !invalidAfterSuccessorRef
    && after.successorBookRef !== before.successorBookRef;
  if (modeChanged || explicitSuccessor) {
    effects.add('successor');
    reasons.push(modeChanged ? 'book-mode-changed' : 'successor-declared');
  }

  if (after.source.availability === 'invalidated') {
    effects.add('invalidation');
    reasons.push('source-invalidated');
  } else if (
    !same(before.source.sourceVersionRef, after.source.sourceVersionRef)
    || !same(before.binding.mappingFingerprint, after.binding.mappingFingerprint)
  ) {
    effects.add('mapping-source-context');
    reasons.push('mapping-or-source-context');
  }

  const sameActivity = before.binding.activityRef !== null
    && before.binding.activityRef === after.binding.activityRef;
  const samePlacement = before.binding.placementRef !== null
    && before.binding.placementRef === after.binding.placementRef;
  if (sameActivity && samePlacement && before.binding.parentRef !== after.binding.parentRef) {
    effects.add('moved');
    reasons.push('placement-moved');
  } else if (
    sameActivity
    && samePlacement
    && before.binding.order !== after.binding.order
  ) {
    effects.add('reordered');
    reasons.push('placement-reordered');
  }

  if (modeChanged && !explicitSuccessor) {
    effects.add('unsupported');
    reasons.push('missing-explicit-successor');
  }

  const orderedEffects = primaryPrecedence.filter((effect) => effects.has(effect));
  const primaryEffect = orderedEffects[0] ?? 'unsupported';
  const requiresRedo = activity.requiresRedo || effects.has('unsupported');
  const requiresRegrade = effects.has('regrade');
  const requiresExplicitContextResolution = effects.has('mapping-source-context')
    || effects.has('invalidation');

  return Object.freeze({
    primaryEffect,
    effects: Object.freeze(orderedEffects),
    reasons: Object.freeze([...new Set(reasons)]),
    activityDiff: activity,
    requiresRedo,
    requiresRegrade,
    requiresExplicitContextResolution,
    requiresSuccessor: effects.has('successor'),
  });
};
