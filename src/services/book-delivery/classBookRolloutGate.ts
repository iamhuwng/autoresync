export interface ClassBookRolloutEnvironment {
  readonly CLASS_BOOK_PLACEMENT_ENABLED?: string | boolean;
  readonly CLASS_BOOK_PLACEMENT_ROLLBACK?: string | boolean;
}

export interface ClassBookRolloutGateOptions {
  readonly enabled?: boolean;
  readonly rollback?: boolean;
}

const flag = (value: string | boolean | undefined): boolean =>
  value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');

/**
 * The Class Book surface is deny-by-default. Rollback is deny-only: it blocks
 * new writes and binding issuance while retaining immutable history and
 * allowing already-issued pinned bindings to be resolved.
 */
export class ClassBookRolloutGate {
  readonly enabled: boolean;
  readonly rollback: boolean;

  constructor(options: ClassBookRolloutGateOptions = {}) {
    this.enabled = options.enabled === true;
    this.rollback = options.rollback === true;
  }

  static fromEnvironment(env: ClassBookRolloutEnvironment | undefined): ClassBookRolloutGate {
    return new ClassBookRolloutGate({
      enabled: flag(env?.CLASS_BOOK_PLACEMENT_ENABLED),
      rollback: flag(env?.CLASS_BOOK_PLACEMENT_ROLLBACK),
    });
  }

  assertReadAllowed(): void {
    if (!this.enabled) throw new Error('class_book_rollout_disabled');
  }

  assertMutationAllowed(): void {
    if (!this.enabled) throw new Error('class_book_rollout_disabled');
    if (this.rollback) throw new Error('class_book_rollout_rollback');
  }

  assertIssuanceAllowed(): void {
    this.assertMutationAllowed();
  }

  assertExistingBindingResolutionAllowed(): void {
    if (!this.enabled) throw new Error('class_book_rollout_disabled');
  }
}

export const isClassBookPlacementPath = (pathname: string): boolean =>
  pathname === '/v1/class-book-placement'
  || pathname.startsWith('/v1/class-book-placement/');
