export interface PublicBookReferenceForkRolloutEnvironment {
  readonly PUBLIC_BOOK_REFERENCE_FORK_ENABLED?: string | boolean;
  readonly PUBLIC_BOOK_REFERENCE_FORK_ROLLBACK?: string | boolean;
}

export interface PublicBookReferenceForkRolloutGateOptions {
  readonly enabled?: boolean;
  readonly rollback?: boolean;
}

const flag = (value: string | boolean | undefined): boolean =>
  value === true || (typeof value === 'string' && value.trim().toLowerCase() === 'true');

/**
 * The public reference/fork surface is deny-by-default. Rollback is
 * deny-only: new reference/fork/migration writes stop while immutable
 * references and fork provenance remain readable through an enabled reader.
 */
export class PublicBookReferenceForkRolloutGate {
  readonly enabled: boolean;
  readonly rollback: boolean;

  constructor(options: PublicBookReferenceForkRolloutGateOptions = {}) {
    this.enabled = options.enabled === true;
    this.rollback = options.rollback === true;
  }

  static fromEnvironment(
    env: PublicBookReferenceForkRolloutEnvironment | undefined,
  ): PublicBookReferenceForkRolloutGate {
    return new PublicBookReferenceForkRolloutGate({
      enabled: flag(env?.PUBLIC_BOOK_REFERENCE_FORK_ENABLED),
      rollback: flag(env?.PUBLIC_BOOK_REFERENCE_FORK_ROLLBACK),
    });
  }

  assertReadAllowed(): void {
    if (!this.enabled) throw new Error('public_book_reference_fork_rollout_disabled');
  }

  assertMutationAllowed(): void {
    if (!this.enabled) throw new Error('public_book_reference_fork_rollout_disabled');
    if (this.rollback) throw new Error('public_book_reference_fork_rollback');
  }

  assertExistingReferenceResolutionAllowed(): void {
    this.assertReadAllowed();
  }
}

export interface PublicBookReferenceForkRollbackState {
  readonly schemaVersion: 1;
  readonly enabled: true;
  readonly denyNewWrites: true;
  readonly denyNewForks: true;
  readonly reason: string;
  readonly changedAt: string;
  readonly operationId: string;
}

export const createPublicBookReferenceForkRollbackState = (input: {
  readonly reason: string;
  readonly changedAt: string;
  readonly operationId: string;
}): PublicBookReferenceForkRollbackState => {
  if (input.reason.trim().length === 0 || input.reason.length > 240) {
    throw new Error('public_book_reference_fork_rollback_reason_invalid');
  }
  if (!SAFE_TIMESTAMP.test(input.changedAt)) {
    throw new Error('public_book_reference_fork_rollback_timestamp_invalid');
  }
  if (!SAFE_ID.test(input.operationId)) {
    throw new Error('public_book_reference_fork_rollback_operation_invalid');
  }
  return {
    schemaVersion: 1,
    enabled: true,
    denyNewWrites: true,
    denyNewForks: true,
    reason: input.reason,
    changedAt: input.changedAt,
    operationId: input.operationId,
  };
};

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;
const SAFE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
