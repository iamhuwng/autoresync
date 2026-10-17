import type { BookMetadataBackupInventory } from '../types';
import {
  createBookDeliveryRecoveryAdapter,
  rebuildBookDeliveryRecoveryProjections,
  type BookDeliveryRecoveryAdapter,
  type BookDeliveryRecoveryProjection,
  type BookDeliveryRecoveryDiagnostic,
} from '../../../src/services/book-delivery/bookDelivery.recovery';
import type {
  BookSourceRecoveryAuthority,
} from '../../../src/services/book-source-delivery/sourceRecovery.adapter';

const SAFE_RECOVERY_OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

export interface BookDeliveryRestorePlan {
  readonly recoveryOperationId: string;
  readonly inventoryFingerprint: string;
  readonly scopes: Readonly<Record<string, unknown>>;
  readonly bindingIndexes: Readonly<Record<string, unknown>>;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly expectedOwnerId?: string;
  readonly projections: readonly BookDeliveryRecoveryProjection[];
  readonly diagnostics: readonly BookDeliveryRecoveryDiagnostic[];
  readonly report: {
    readonly rebuilt: number;
    readonly skippedIdempotent: number;
    readonly invalid: number;
    readonly externallyMissing: number;
    readonly retryable: number;
    readonly terminal: number;
  };
  /** No live Delivery/current or entitlement write is authorized by #122. */
  readonly productionWrites: 0;
  /** Durable metadata-only recovery children written by the explicit adapter. */
  readonly recoveryWrites: number;
}

export class BookDeliveryRestoreValidationError extends Error {
  readonly name = 'BookDeliveryRestoreValidationError';

  constructor(
    readonly diagnostics: readonly BookDeliveryRecoveryDiagnostic[],
  ) {
    super(diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join('; '));
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const rootData = (
  inventory: BookMetadataBackupInventory,
  path: string,
): Record<string, unknown> => {
  const root = inventory.roots.find((candidate) => candidate.path === path);
  if (!root || !root.present || !isRecord(root.data)) return {};
  return root.data;
};

const rootPresent = (
  inventory: BookMetadataBackupInventory,
  path: string,
): boolean => inventory.roots.some((candidate) => candidate.path === path && candidate.present === true);

/**
 * Build only an internal, unavailable Delivery projection. It does not read
 * R2/B2, call a provider, issue entitlement, or derive a viewer URL.
 */
export const prepareBookDeliveryRestore = (input: {
  readonly inventory: unknown;
  readonly inventoryFingerprint: string;
  readonly recoveryOperationId: string;
  readonly sourceAuthorities: ReadonlyMap<string, BookSourceRecoveryAuthority>;
  readonly expectedOwnerId?: string;
  readonly completedProjectionKeys?: ReadonlySet<string>;
}): BookDeliveryRestorePlan => {
  if (!SAFE_RECOVERY_OPERATION_ID.test(input.recoveryOperationId)) {
    throw new BookDeliveryRestoreValidationError([{
      code: 'invalid-record',
      path: '$.recoveryOperationId',
      message: 'Delivery recovery requires a bounded recovery operation ID.',
    }]);
  }
  if (!isRecord(input.inventory)
    || input.inventory.kind !== 'book-metadata-inventory'
    || !Array.isArray(input.inventory.roots)) {
    throw new BookDeliveryRestoreValidationError([{
      code: 'invalid-record',
      path: '$.inventory',
      message: 'Delivery recovery requires the validated metadata inventory.',
    }]);
  }
  const inventory = input.inventory as unknown as BookMetadataBackupInventory;
  const legacyFlatRoots = ['book_delivery/records', 'book_delivery/current'];
  if (legacyFlatRoots.some((path) => rootPresent(inventory, path))) {
    throw new BookDeliveryRestoreValidationError([{
      code: 'invalid-scope',
      path: 'book_delivery',
      message: 'Delivery recovery rejects legacy flat roots; production authority is book_delivery/scopes plus indexes/bindings.',
    }]);
  }
  const scopes = rootData(inventory, 'book_delivery/scopes');
  const bindingIndexes = rootData(inventory, 'book_delivery/indexes/bindings');
  const rebuilt = rebuildBookDeliveryRecoveryProjections({
    scopes,
    bindingIndexes,
    sourceAuthorities: input.sourceAuthorities,
    recoveryContext: {
      recoveryOperationId: input.recoveryOperationId,
      phase: 'rebuilding',
    },
    expectedOwnerId: input.expectedOwnerId,
    completedProjectionKeys: input.completedProjectionKeys,
  });
  return Object.freeze({
    recoveryOperationId: input.recoveryOperationId,
    inventoryFingerprint: input.inventoryFingerprint,
    scopes,
    bindingIndexes,
    sourceAuthorities: input.sourceAuthorities,
    expectedOwnerId: input.expectedOwnerId,
    projections: rebuilt.projections,
    diagnostics: rebuilt.diagnostics,
    report: rebuilt.report,
    productionWrites: 0,
    recoveryWrites: 0,
  });
};

/**
 * Filter a staged plan against already completed deterministic projections.
 * This remains write-free; use persistBookDeliveryRecovery for the explicit
 * rebuilding phase and an injected durable adapter.
 */
export const rebuildBookDeliveryProjections = (input: {
  readonly plan: BookDeliveryRestorePlan;
  readonly completedProjectionKeys?: ReadonlySet<string>;
}): BookDeliveryRestorePlan => {
  if (input.plan.productionWrites !== 0) {
    throw new BookDeliveryRestoreValidationError([{
      code: 'invalid-record',
      path: '$.plan.productionWrites',
      message: 'Recovery Delivery rebuild cannot authorize production writes.',
    }]);
  }
  if (input.completedProjectionKeys === undefined || input.completedProjectionKeys.size === 0) return input.plan;
  const projections = input.plan.projections.filter((projection) => !input.completedProjectionKeys!.has(projection.projectionKey));
  const skipped = input.plan.projections.length - projections.length;
  return Object.freeze({
    ...input.plan,
    projections: Object.freeze(projections),
    report: Object.freeze({
      ...input.plan.report,
      rebuilt: projections.length,
      skippedIdempotent: input.plan.report.skippedIdempotent + skipped,
    }),
  });
};

/**
 * Explicit #121 rebuilding-phase bridge to the durable recovery adapter.
 * The adapter writes only metadata-only recovery hold/projection children;
 * activation, entitlement, viewer links, and provider actions remain absent.
 */
export const persistBookDeliveryRecovery = async (input: {
  readonly plan: BookDeliveryRestorePlan;
  readonly adapter: BookDeliveryRecoveryAdapter;
}): Promise<BookDeliveryRestorePlan> => {
  const result = await input.adapter.rebuild({
    scopes: input.plan.scopes,
    bindingIndexes: input.plan.bindingIndexes,
    sourceAuthorities: input.plan.sourceAuthorities,
    expectedOwnerId: input.plan.expectedOwnerId,
  });
  return Object.freeze({
    ...input.plan,
    projections: result.projections,
    diagnostics: result.diagnostics,
    report: result.report,
    recoveryWrites: result.report.rebuilt,
  });
};

/** Explicit factory for the Worker/ledger rebuilding phase. */
export { createBookDeliveryRecoveryAdapter };
