import { LISTENING_PENDING_DELETE_GRACE_MS, isListeningTempFallbackDue } from './listeningAssetLifecycle';
import { countListeningRetainedReferences, type ListeningReferenceRecheck } from './listeningAssetDeletionGovernance';
import { canDeleteListeningAssetUnderRollback, type ListeningStorageRollbackControls } from './listeningAssetRollback';
import {
  isListeningMediaAssetCleanupAuthorized,
  type ListeningMediaAssetCleanupGate,
  type ListeningMediaAssetRecord,
  type ListeningMediaAssetReferences,
} from './listeningAssetRegistry';

export type ListeningReconciliationRunKind = 'hourly-temp' | 'daily-pending-delete';
export type ListeningReconciliationRunStatus = 'planned' | 'aborted';
export type ListeningReconciliationAbortReason =
  | 'selected_teacher_proof_missing'
  | 'object_operation_budget_exceeded'
  | 'r2_operation_budget_exceeded'
  | 'firebase_operation_budget_exceeded'
  | 'estimated_cost_budget_exceeded'
  | 'estimated_wall_clock_budget_exceeded';

export interface ListeningSelectedTeacherReconciliationProof {
  readonly proofId: string;
  readonly passed: boolean;
  readonly selectedTeacherRollout: string;
  readonly deployedWorkerVersionId: string;
  readonly completedAt: string;
  readonly stopConditions: {
    readonly unexplainedPermanentObjectGrowth: boolean;
    readonly failedCleanup: boolean;
    readonly wrongAudio: boolean;
    readonly legacyIncompatibility: boolean;
    readonly productionData: boolean;
    readonly remoteMutation: boolean;
  };
}

export interface ListeningReconciliationBudget {
  readonly maxObjectOperations: number;
  readonly maxR2ListOperations: number;
  readonly maxR2ReadOperations: number;
  readonly maxR2WriteOperations: number;
  readonly maxR2DeleteOperations: number;
  readonly maxFirebaseReadOperations: number;
  readonly maxFirebaseWriteOperations: number;
  readonly maxEstimatedWallClockMs: number;
  readonly maxEstimatedR2CostUsd: number;
}

export interface ListeningReconciliationBudgetUse {
  readonly objectOperations: number;
  readonly r2ListOperations: number;
  readonly r2ReadOperations: number;
  readonly r2WriteOperations: number;
  readonly r2DeleteOperations: number;
  readonly firebaseReadOperations: number;
  readonly firebaseWriteOperations: number;
  readonly estimatedWallClockMs: number;
  readonly estimatedR2CostUsd: number;
}

export interface ListeningReconciliationCheckpoint {
  readonly runId: string;
  readonly runKind: ListeningReconciliationRunKind;
  readonly createdAt: number;
  readonly proofId: string;
  readonly processedAssetIds: readonly string[];
  readonly nextCursorAssetId?: string;
  readonly abortReason?: ListeningReconciliationAbortReason;
}

export interface ListeningReconciliationReport {
  readonly runId: string;
  readonly runKind: ListeningReconciliationRunKind;
  readonly status: ListeningReconciliationRunStatus;
  readonly proofId: string;
  readonly generatedAt: number;
  readonly budget: ListeningReconciliationBudget;
  readonly budgetUse: ListeningReconciliationBudgetUse;
  readonly blockedCandidateCount: number;
  readonly abortReason?: ListeningReconciliationAbortReason;
  readonly stopAction?: string;
}

export type ListeningReconciliationBlockedReason =
  | 'asset_owner_missing'
  | 'asset_owner_ambiguous'
  | 'retained_references_present'
  | 'reference_recheck_required'
  | 'reference_recheck_not_immediate'
  | 'reference_recheck_asset_mismatch'
  | 'reference_recheck_owner_mismatch'
  | 'rollback_stop_delete'
  | 'backup_restore_uncertain';

export interface ListeningReconciliationBlockedCandidate {
  readonly assetId: string;
  readonly ownerId?: string;
  readonly reasonCode: ListeningReconciliationBlockedReason;
  readonly observedAt: number;
  readonly executionAuthorized: false;
}

export interface ListeningTempReconciliationCandidate {
  readonly operation: 'report-only-temp-delete-candidate';
  readonly assetId: string;
  readonly ownerId: string;
  readonly tempKey: string;
  readonly reasonCode: 'temp-fallback-24h';
  readonly uploadedAt: number;
  readonly observedAt: number;
  readonly executionAuthorized: false;
}

export interface ListeningPendingDeleteReconciliationCandidate {
  readonly operation: 'report-only-durable-delete-candidate';
  readonly assetId: string;
  readonly ownerId: string;
  readonly stateBefore: 'pending-delete';
  readonly reasonCode: 'pending-delete-grace-elapsed';
  readonly retainedReferenceCount: 0;
  readonly referencesCheckedAt: number;
  readonly observedAt: number;
  readonly executionAuthorized: false;
}

export interface ListeningReconciliationPlan<TCandidate> {
  readonly report: ListeningReconciliationReport;
  readonly checkpoint: ListeningReconciliationCheckpoint;
  readonly candidates: readonly TCandidate[];
  readonly blockedCandidates: readonly ListeningReconciliationBlockedCandidate[];
}

export interface ListeningReconciliationAssetPage {
  readonly assets: readonly ListeningMediaAssetRecord[];
  readonly nextCursorAssetId?: string;
}

export interface ListeningReconciliationRepository {
  readonly readSelectedTeacherProof: () => Promise<ListeningSelectedTeacherReconciliationProof | undefined>;
  readonly listHourlyTempAssets: (input: {
    readonly cursorAssetId?: string;
    readonly limit: number;
  }) => Promise<ListeningReconciliationAssetPage>;
  readonly listDailyPendingDeleteAssets: (input: {
    readonly cursorAssetId?: string;
    readonly limit: number;
  }) => Promise<ListeningReconciliationAssetPage>;
  readonly recheckAssetReferences: (input: {
    readonly assetId: string;
    readonly ownerId: string;
    readonly now: number;
  }) => Promise<ListeningReferenceRecheck & { readonly ownerId?: string }>;
}

export interface ListeningReconciliationReportSink {
  readonly writeCheckpoint: (checkpoint: ListeningReconciliationCheckpoint) => Promise<void>;
  readonly writeReport: (report: ListeningReconciliationReport) => Promise<void>;
}

export interface ListeningReconciliationRunOptions {
  readonly runId: string;
  readonly now: number;
  readonly cursorAssetId?: string;
  readonly pageLimit?: number;
  readonly budget?: ListeningReconciliationBudget;
  readonly cleanupGate?: ListeningMediaAssetCleanupGate;
  readonly rollbackControls?: ListeningStorageRollbackControls;
}

export const LISTENING_RECONCILIATION_R2_PRICING = {
  source: 'Cloudflare R2 pricing docs, Standard storage rates, last checked 2026-06-29',
  sourceUrl: 'https://developers.cloudflare.com/r2/pricing/',
  classAUsdPerMillion: 4.50,
  classBUsdPerMillion: 0.36,
  deleteObjectOperationsFree: true,
} as const;

export const LISTENING_RECONCILIATION_BUDGETS = {
  hourlyTemp: {
    maxObjectOperations: 25,
    maxR2ListOperations: 1,
    maxR2ReadOperations: 25,
    maxR2WriteOperations: 0,
    maxR2DeleteOperations: 0,
    maxFirebaseReadOperations: 50,
    maxFirebaseWriteOperations: 0,
    maxEstimatedWallClockMs: 15_000,
    maxEstimatedR2CostUsd: 0.00012,
  },
  dailyPendingDelete: {
    maxObjectOperations: 25,
    maxR2ListOperations: 1,
    maxR2ReadOperations: 25,
    maxR2WriteOperations: 0,
    maxR2DeleteOperations: 0,
    maxFirebaseReadOperations: 75,
    maxFirebaseWriteOperations: 0,
    maxEstimatedWallClockMs: 20_000,
    maxEstimatedR2CostUsd: 0.00012,
  },
} as const satisfies Record<string, ListeningReconciliationBudget>;

const budgetStopActions: Record<ListeningReconciliationAbortReason, string> = {
  selected_teacher_proof_missing: 'stop Task 6.3; rerun selected-teacher Worker proof before reconciliation',
  object_operation_budget_exceeded: 'abort run, preserve checkpoint, report object-operation capacity stop',
  r2_operation_budget_exceeded: 'abort run, preserve checkpoint, report R2 capacity stop',
  firebase_operation_budget_exceeded: 'abort run, preserve checkpoint, report Firebase capacity stop',
  estimated_cost_budget_exceeded: 'abort run, preserve checkpoint, report estimated R2 cost stop',
  estimated_wall_clock_budget_exceeded: 'abort run, preserve checkpoint, report wall-clock capacity stop',
};

export function estimateListeningReconciliationR2CostUsd(input: {
  readonly classAOperations: number;
  readonly classBOperations: number;
}): number {
  return (
    (input.classAOperations / 1_000_000) * LISTENING_RECONCILIATION_R2_PRICING.classAUsdPerMillion
  ) + (
    (input.classBOperations / 1_000_000) * LISTENING_RECONCILIATION_R2_PRICING.classBUsdPerMillion
  );
}

export function hasSelectedTeacherProofForListeningReconciliation(
  proof: ListeningSelectedTeacherReconciliationProof | undefined,
): proof is ListeningSelectedTeacherReconciliationProof {
  if (!proof?.passed || !proof.stopConditions.productionData || !proof.stopConditions.remoteMutation) {
    return false;
  }
  if (
    proof.stopConditions.unexplainedPermanentObjectGrowth
    || proof.stopConditions.failedCleanup
    || proof.stopConditions.wrongAudio
    || proof.stopConditions.legacyIncompatibility
  ) {
    return false;
  }
  return true;
}

const abortReasonForBudget = (
  usage: ListeningReconciliationBudgetUse,
  budget: ListeningReconciliationBudget,
): ListeningReconciliationAbortReason | undefined => {
  if (usage.objectOperations > budget.maxObjectOperations) return 'object_operation_budget_exceeded';
  if (
    usage.r2ListOperations > budget.maxR2ListOperations
    || usage.r2ReadOperations > budget.maxR2ReadOperations
    || usage.r2WriteOperations > budget.maxR2WriteOperations
    || usage.r2DeleteOperations > budget.maxR2DeleteOperations
  ) return 'r2_operation_budget_exceeded';
  if (
    usage.firebaseReadOperations > budget.maxFirebaseReadOperations
    || usage.firebaseWriteOperations > budget.maxFirebaseWriteOperations
  ) return 'firebase_operation_budget_exceeded';
  if (usage.estimatedR2CostUsd > budget.maxEstimatedR2CostUsd) return 'estimated_cost_budget_exceeded';
  if (usage.estimatedWallClockMs > budget.maxEstimatedWallClockMs) return 'estimated_wall_clock_budget_exceeded';
  return undefined;
};

const sortAssets = (assets: readonly ListeningMediaAssetRecord[]): readonly ListeningMediaAssetRecord[] =>
  [...assets].sort((left, right) => left.assetId.localeCompare(right.assetId));

const emptyBudgetUse = (): ListeningReconciliationBudgetUse => ({
  objectOperations: 0,
  r2ListOperations: 0,
  r2ReadOperations: 0,
  r2WriteOperations: 0,
  r2DeleteOperations: 0,
  firebaseReadOperations: 0,
  firebaseWriteOperations: 0,
  estimatedWallClockMs: 0,
  estimatedR2CostUsd: 0,
});

const addBudgetUse = (
  current: ListeningReconciliationBudgetUse,
  next: Partial<ListeningReconciliationBudgetUse>,
): ListeningReconciliationBudgetUse => ({
  objectOperations: current.objectOperations + (next.objectOperations ?? 0),
  r2ListOperations: current.r2ListOperations + (next.r2ListOperations ?? 0),
  r2ReadOperations: current.r2ReadOperations + (next.r2ReadOperations ?? 0),
  r2WriteOperations: current.r2WriteOperations + (next.r2WriteOperations ?? 0),
  r2DeleteOperations: current.r2DeleteOperations + (next.r2DeleteOperations ?? 0),
  firebaseReadOperations: current.firebaseReadOperations + (next.firebaseReadOperations ?? 0),
  firebaseWriteOperations: current.firebaseWriteOperations + (next.firebaseWriteOperations ?? 0),
  estimatedWallClockMs: current.estimatedWallClockMs + (next.estimatedWallClockMs ?? 0),
  estimatedR2CostUsd: current.estimatedR2CostUsd + (next.estimatedR2CostUsd ?? 0),
});

const createResult = <TCandidate>(input: {
  readonly runId: string;
  readonly runKind: ListeningReconciliationRunKind;
  readonly now: number;
  readonly proofId: string;
  readonly budget: ListeningReconciliationBudget;
  readonly budgetUse: ListeningReconciliationBudgetUse;
  readonly processedAssetIds: readonly string[];
  readonly candidates: readonly TCandidate[];
  readonly blockedCandidates: readonly ListeningReconciliationBlockedCandidate[];
  readonly abortReason?: ListeningReconciliationAbortReason;
  readonly nextCursorAssetId?: string;
}): ListeningReconciliationPlan<TCandidate> => {
  const abortReason = input.abortReason ?? abortReasonForBudget(input.budgetUse, input.budget);
  return {
    candidates: abortReason ? [] : input.candidates,
    blockedCandidates: input.blockedCandidates,
    checkpoint: {
      runId: input.runId,
      runKind: input.runKind,
      createdAt: input.now,
      proofId: input.proofId,
      processedAssetIds: input.processedAssetIds,
      nextCursorAssetId: input.nextCursorAssetId,
      abortReason,
    },
    report: {
      runId: input.runId,
      runKind: input.runKind,
      status: abortReason ? 'aborted' : 'planned',
      proofId: input.proofId,
      generatedAt: input.now,
      budget: input.budget,
      budgetUse: input.budgetUse,
      blockedCandidateCount: input.blockedCandidates.length,
      abortReason,
      stopAction: abortReason ? budgetStopActions[abortReason] : undefined,
    },
  };
};

const createProofAbortResult = <TCandidate>(input: {
  readonly runId: string;
  readonly runKind: ListeningReconciliationRunKind;
  readonly now: number;
  readonly budget: ListeningReconciliationBudget;
}): ListeningReconciliationPlan<TCandidate> => createResult({
  runId: input.runId,
  runKind: input.runKind,
  now: input.now,
  proofId: 'missing-selected-teacher-proof',
  budget: input.budget,
  budgetUse: emptyBudgetUse(),
  processedAssetIds: [],
  candidates: [],
  blockedCandidates: [],
  abortReason: 'selected_teacher_proof_missing',
});

const isOwnerScopedTempKey = (asset: ListeningMediaAssetRecord): boolean => {
  const escapedOwner = asset.ownerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSession = asset.uploadSessionId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^temp/listening/${escapedOwner}/${escapedSession}/`).test(asset.tempKey);
};

const failClosedAssetAuthority = (
  asset: ListeningMediaAssetRecord,
  now: number,
): ListeningReconciliationBlockedCandidate | undefined => {
  if (!asset.ownerId || !asset.createdBy) {
    return {
      assetId: asset.assetId,
      ownerId: asset.ownerId || undefined,
      reasonCode: 'asset_owner_missing',
      observedAt: now,
      executionAuthorized: false,
    };
  }
  if (asset.ownerId !== asset.createdBy || !isOwnerScopedTempKey(asset)) {
    return {
      assetId: asset.assetId,
      ownerId: asset.ownerId,
      reasonCode: 'asset_owner_ambiguous',
      observedAt: now,
      executionAuthorized: false,
    };
  }
  return undefined;
};

const hasReferences = (references: ListeningMediaAssetReferences): boolean =>
  countListeningRetainedReferences(references) > 0;

export function planListeningHourlyTempReconciliation(input: {
  readonly runId: string;
  readonly now: number;
  readonly assets: readonly ListeningMediaAssetRecord[];
  readonly selectedTeacherProof?: ListeningSelectedTeacherReconciliationProof;
  readonly budget?: ListeningReconciliationBudget;
}): ListeningReconciliationPlan<ListeningTempReconciliationCandidate> {
  const budget = input.budget ?? LISTENING_RECONCILIATION_BUDGETS.hourlyTemp;
  if (!hasSelectedTeacherProofForListeningReconciliation(input.selectedTeacherProof)) {
    return createProofAbortResult({
      runId: input.runId,
      runKind: 'hourly-temp',
      now: input.now,
      budget,
    });
  }

  const candidates: ListeningTempReconciliationCandidate[] = [];
  const blockedCandidates: ListeningReconciliationBlockedCandidate[] = [];
  const processedAssetIds: string[] = [];
  let budgetUse = addBudgetUse(emptyBudgetUse(), {
    r2ListOperations: input.assets.length > 0 ? 1 : 0,
    firebaseReadOperations: input.assets.length,
    estimatedWallClockMs: 1_000,
    estimatedR2CostUsd: estimateListeningReconciliationR2CostUsd({
      classAOperations: input.assets.length > 0 ? 1 : 0,
      classBOperations: 0,
    }),
  });
  let abortReason: ListeningReconciliationAbortReason | undefined = abortReasonForBudget(budgetUse, budget);
  let nextCursorAssetId: string | undefined;

  for (const asset of sortAssets(input.assets)) {
    if (abortReason) break;
    if (!isListeningTempFallbackDue({ state: asset.state, createdAt: asset.createdAt, now: input.now })) continue;

    const nextBudgetUse = addBudgetUse(budgetUse, {
      objectOperations: 1,
      r2ReadOperations: 1,
      estimatedWallClockMs: 200,
      estimatedR2CostUsd: estimateListeningReconciliationR2CostUsd({
        classAOperations: 0,
        classBOperations: 1,
      }),
    });
    const nextAbort = abortReasonForBudget(nextBudgetUse, budget);
    if (nextAbort) {
      abortReason = nextAbort;
      nextCursorAssetId = asset.assetId;
      budgetUse = nextBudgetUse;
      break;
    }

    budgetUse = nextBudgetUse;
    processedAssetIds.push(asset.assetId);
    const blocked = failClosedAssetAuthority(asset, input.now);
    if (blocked) {
      blockedCandidates.push(blocked);
      continue;
    }
    candidates.push({
      operation: 'report-only-temp-delete-candidate',
      assetId: asset.assetId,
      ownerId: asset.ownerId,
      tempKey: asset.tempKey,
      reasonCode: 'temp-fallback-24h',
      uploadedAt: asset.createdAt,
      observedAt: input.now,
      executionAuthorized: false,
    });
  }
  return createResult({
    runId: input.runId,
    runKind: 'hourly-temp',
    now: input.now,
    proofId: input.selectedTeacherProof.proofId,
    budget,
    budgetUse,
    processedAssetIds,
    candidates,
    blockedCandidates,
    abortReason,
    nextCursorAssetId,
  });
}

export function planListeningDailyPendingDeleteReconciliation(input: {
  readonly runId: string;
  readonly now: number;
  readonly assets: readonly ListeningMediaAssetRecord[];
  readonly referenceRechecks: Readonly<Record<string, ListeningReferenceRecheck & { readonly ownerId?: string }>>;
  readonly selectedTeacherProof?: ListeningSelectedTeacherReconciliationProof;
  readonly budget?: ListeningReconciliationBudget;
  readonly cleanupGate?: ListeningMediaAssetCleanupGate;
  readonly rollbackControls?: ListeningStorageRollbackControls;
}): ListeningReconciliationPlan<ListeningPendingDeleteReconciliationCandidate> {
  const budget = input.budget ?? LISTENING_RECONCILIATION_BUDGETS.dailyPendingDelete;
  if (!hasSelectedTeacherProofForListeningReconciliation(input.selectedTeacherProof)) {
    return createProofAbortResult({
      runId: input.runId,
      runKind: 'daily-pending-delete',
      now: input.now,
      budget,
    });
  }

  const candidates: ListeningPendingDeleteReconciliationCandidate[] = [];
  const blockedCandidates: ListeningReconciliationBlockedCandidate[] = [];
  const processedAssetIds: string[] = [];
  let budgetUse = addBudgetUse(emptyBudgetUse(), {
    r2ListOperations: input.assets.length > 0 ? 1 : 0,
    firebaseReadOperations: input.assets.length,
    estimatedWallClockMs: 1_500,
    estimatedR2CostUsd: estimateListeningReconciliationR2CostUsd({
      classAOperations: input.assets.length > 0 ? 1 : 0,
      classBOperations: 0,
    }),
  });
  let abortReason: ListeningReconciliationAbortReason | undefined = abortReasonForBudget(budgetUse, budget);
  let nextCursorAssetId: string | undefined;

  for (const asset of sortAssets(input.assets)) {
    if (abortReason) break;
    if (
      asset.state !== 'pending-delete'
      || !asset.pendingDeleteAt
      || !asset.deleteAfter
      || input.now < asset.pendingDeleteAt + LISTENING_PENDING_DELETE_GRACE_MS
      || input.now < asset.deleteAfter
    ) {
      continue;
    }

    const nextBudgetUse = addBudgetUse(budgetUse, {
      objectOperations: 1,
      r2ReadOperations: 1,
      firebaseReadOperations: 1,
      estimatedWallClockMs: 250,
      estimatedR2CostUsd: estimateListeningReconciliationR2CostUsd({
        classAOperations: 0,
        classBOperations: 1,
      }),
    });
    const nextAbort = abortReasonForBudget(nextBudgetUse, budget);
    if (nextAbort) {
      abortReason = nextAbort;
      nextCursorAssetId = asset.assetId;
      budgetUse = nextBudgetUse;
      break;
    }

    budgetUse = nextBudgetUse;
    processedAssetIds.push(asset.assetId);

    const blocked = failClosedAssetAuthority(asset, input.now);
    if (blocked) {
      blockedCandidates.push(blocked);
      continue;
    }

    if (!isListeningMediaAssetCleanupAuthorized(input.cleanupGate ?? {})) {
      blockedCandidates.push({
        assetId: asset.assetId,
        ownerId: asset.ownerId,
        reasonCode: 'backup_restore_uncertain',
        observedAt: input.now,
        executionAuthorized: false,
      });
      continue;
    }

    const rollbackDecision = canDeleteListeningAssetUnderRollback({
      asset,
      controls: input.rollbackControls,
    });
    if (!rollbackDecision.allowed) {
      blockedCandidates.push({
        assetId: asset.assetId,
        ownerId: asset.ownerId,
        reasonCode: 'rollback_stop_delete',
        observedAt: input.now,
        executionAuthorized: false,
      });
      continue;
    }

    if (hasReferences(asset.references)) {
      blockedCandidates.push({
        assetId: asset.assetId,
        ownerId: asset.ownerId,
        reasonCode: 'retained_references_present',
        observedAt: input.now,
        executionAuthorized: false,
      });
      continue;
    }

    const referenceRecheck = input.referenceRechecks[asset.assetId];
    if (!referenceRecheck) {
      blockedCandidates.push({
        assetId: asset.assetId,
        ownerId: asset.ownerId,
        reasonCode: 'reference_recheck_required',
        observedAt: input.now,
        executionAuthorized: false,
      });
      continue;
    }
    if (referenceRecheck.assetId !== asset.assetId) {
      blockedCandidates.push({
        assetId: asset.assetId,
        ownerId: asset.ownerId,
        reasonCode: 'reference_recheck_asset_mismatch',
        observedAt: input.now,
        executionAuthorized: false,
      });
      continue;
    }
    if (referenceRecheck.ownerId && referenceRecheck.ownerId !== asset.ownerId) {
      blockedCandidates.push({
        assetId: asset.assetId,
        ownerId: asset.ownerId,
        reasonCode: 'reference_recheck_owner_mismatch',
        observedAt: input.now,
        executionAuthorized: false,
      });
      continue;
    }
    if (referenceRecheck.checkedAt !== input.now) {
      blockedCandidates.push({
        assetId: asset.assetId,
        ownerId: asset.ownerId,
        reasonCode: 'reference_recheck_not_immediate',
        observedAt: input.now,
        executionAuthorized: false,
      });
      continue;
    }
    if (hasReferences(referenceRecheck.references)) {
      blockedCandidates.push({
        assetId: asset.assetId,
        ownerId: asset.ownerId,
        reasonCode: 'retained_references_present',
        observedAt: input.now,
        executionAuthorized: false,
      });
      continue;
    }

    candidates.push({
      operation: 'report-only-durable-delete-candidate',
      assetId: asset.assetId,
      ownerId: asset.ownerId,
      stateBefore: 'pending-delete',
      reasonCode: 'pending-delete-grace-elapsed',
      retainedReferenceCount: 0,
      referencesCheckedAt: input.now,
      observedAt: input.now,
      executionAuthorized: false,
    });
  }

  return createResult({
    runId: input.runId,
    runKind: 'daily-pending-delete',
    now: input.now,
    proofId: input.selectedTeacherProof.proofId,
    budget,
    budgetUse,
    processedAssetIds,
    candidates,
    blockedCandidates,
    abortReason,
    nextCursorAssetId,
  });
}

export async function runListeningHourlyTempReconciliationDryRun(input: {
  readonly repository: ListeningReconciliationRepository;
  readonly reportSink: ListeningReconciliationReportSink;
} & ListeningReconciliationRunOptions): Promise<ListeningReconciliationPlan<ListeningTempReconciliationCandidate>> {
  const proof = await input.repository.readSelectedTeacherProof();
  const budget = input.budget ?? LISTENING_RECONCILIATION_BUDGETS.hourlyTemp;
  if (!hasSelectedTeacherProofForListeningReconciliation(proof)) {
    const plan = createProofAbortResult<ListeningTempReconciliationCandidate>({
      runId: input.runId,
      runKind: 'hourly-temp',
      now: input.now,
      budget,
    });
    await input.reportSink.writeCheckpoint(plan.checkpoint);
    await input.reportSink.writeReport(plan.report);
    return plan;
  }
  const page = await input.repository.listHourlyTempAssets({
    cursorAssetId: input.cursorAssetId,
    limit: input.pageLimit ?? budget.maxObjectOperations + 1,
  });
  const plan = planListeningHourlyTempReconciliation({
    runId: input.runId,
    now: input.now,
    assets: page.assets,
    selectedTeacherProof: proof,
    budget,
  });
  await input.reportSink.writeCheckpoint({
    ...plan.checkpoint,
    nextCursorAssetId: plan.checkpoint.nextCursorAssetId ?? page.nextCursorAssetId,
  });
  await input.reportSink.writeReport(plan.report);
  return plan;
}

export async function runListeningDailyPendingDeleteReconciliationDryRun(input: {
  readonly repository: ListeningReconciliationRepository;
  readonly reportSink: ListeningReconciliationReportSink;
} & ListeningReconciliationRunOptions): Promise<ListeningReconciliationPlan<ListeningPendingDeleteReconciliationCandidate>> {
  const proof = await input.repository.readSelectedTeacherProof();
  const budget = input.budget ?? LISTENING_RECONCILIATION_BUDGETS.dailyPendingDelete;
  if (!hasSelectedTeacherProofForListeningReconciliation(proof)) {
    const plan = createProofAbortResult<ListeningPendingDeleteReconciliationCandidate>({
      runId: input.runId,
      runKind: 'daily-pending-delete',
      now: input.now,
      budget,
    });
    await input.reportSink.writeCheckpoint(plan.checkpoint);
    await input.reportSink.writeReport(plan.report);
    return plan;
  }
  const page = await input.repository.listDailyPendingDeleteAssets({
    cursorAssetId: input.cursorAssetId,
    limit: input.pageLimit ?? budget.maxObjectOperations + 1,
  });
  const referenceRechecks: Record<string, ListeningReferenceRecheck & { readonly ownerId?: string }> = {};
  let projectedBudgetUse = addBudgetUse(emptyBudgetUse(), {
    r2ListOperations: page.assets.length > 0 ? 1 : 0,
    firebaseReadOperations: page.assets.length,
    estimatedWallClockMs: 1_500,
    estimatedR2CostUsd: estimateListeningReconciliationR2CostUsd({
      classAOperations: page.assets.length > 0 ? 1 : 0,
      classBOperations: 0,
    }),
  });

  for (const asset of sortAssets(page.assets)) {
    if (
      asset.state !== 'pending-delete'
      || !asset.pendingDeleteAt
      || !asset.deleteAfter
      || input.now < asset.pendingDeleteAt + LISTENING_PENDING_DELETE_GRACE_MS
      || input.now < asset.deleteAfter
    ) {
      continue;
    }
    const nextBudgetUse = addBudgetUse(projectedBudgetUse, {
      objectOperations: 1,
      r2ReadOperations: 1,
      firebaseReadOperations: 1,
      estimatedWallClockMs: 250,
      estimatedR2CostUsd: estimateListeningReconciliationR2CostUsd({
        classAOperations: 0,
        classBOperations: 1,
      }),
    });
    if (abortReasonForBudget(nextBudgetUse, budget)) break;
    projectedBudgetUse = nextBudgetUse;
    referenceRechecks[asset.assetId] = await input.repository.recheckAssetReferences({
      assetId: asset.assetId,
      ownerId: asset.ownerId,
      now: input.now,
    });
  }
  const plan = planListeningDailyPendingDeleteReconciliation({
    runId: input.runId,
    now: input.now,
    assets: page.assets,
    referenceRechecks,
    selectedTeacherProof: proof,
    budget,
    cleanupGate: input.cleanupGate,
    rollbackControls: input.rollbackControls,
  });
  await input.reportSink.writeCheckpoint({
    ...plan.checkpoint,
    nextCursorAssetId: plan.checkpoint.nextCursorAssetId ?? page.nextCursorAssetId,
  });
  await input.reportSink.writeReport(plan.report);
  return plan;
}
