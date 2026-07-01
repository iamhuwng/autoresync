import { estimateListeningReconciliationR2CostUsd } from './listeningAssetReconciliationPlanner';

export type ListeningHistoricalOrphanCategory =
  | 'deleted-test-leftover'
  | 'pre-registry-permanent-audio'
  | 'interim-rollout-object'
  | 'missing-owner-evidence'
  | 'ambiguous-owner-evidence';

export type ListeningHistoricalOrphanAbortReason =
  | 'object_operation_budget_exceeded'
  | 'r2_list_operation_budget_exceeded'
  | 'estimated_wall_clock_budget_exceeded'
  | 'estimated_cost_budget_exceeded';

export interface ListeningHistoricalOrphanObject {
  readonly key: string;
  readonly sizeBytes: number;
  readonly uploadedAt: number;
}

export interface ListeningHistoricalOrphanLiveReference {
  readonly kind: 'drafts' | 'tests' | 'versions' | 'results' | 'assignments' | 'sessions';
  readonly id: string;
  readonly sourcePath: string;
}

export interface ListeningHistoricalOrphanEvidence {
  readonly key: string;
  readonly assetId?: string;
  readonly ownerId?: string;
  readonly ownerCandidates?: readonly string[];
  readonly deletedTestIds?: readonly string[];
  readonly preRegistryPermanent?: boolean;
  readonly interimRolloutScheme?: string;
  readonly liveProductReferences: readonly ListeningHistoricalOrphanLiveReference[];
}

export interface ListeningHistoricalOrphanInventoryBudget {
  readonly maxObjectOperations: number;
  readonly maxR2ListOperations: number;
  readonly maxR2CopyOperations: number;
  readonly maxR2DeleteOperations: number;
  readonly maxEstimatedWallClockMs: number;
  readonly maxEstimatedR2CostUsd: number;
}

export interface ListeningHistoricalOrphanInventoryBudgetUse {
  readonly objectOperations: number;
  readonly r2ListOperations: number;
  readonly r2CopyOperations: number;
  readonly r2DeleteOperations: number;
  readonly estimatedWallClockMs: number;
  readonly estimatedR2CostUsd: number;
}

export interface ListeningHistoricalOrphanCandidate {
  readonly key: string;
  readonly sizeBytes: number;
  readonly ownerId?: string;
  readonly category: ListeningHistoricalOrphanCategory;
  readonly reasonCode: ListeningHistoricalOrphanCategory;
  readonly retainedReferenceCount: 0;
  readonly observedAt: number;
  readonly executionAuthorized: false;
  readonly deletionAuthorized: false;
}

export interface ListeningHistoricalOrphanExclusion {
  readonly key: string;
  readonly sizeBytes: number;
  readonly reasonCode: 'retained-reference-present';
  readonly retainedReferenceCount: number;
  readonly observedAt: number;
}

export interface ListeningHistoricalOrphanAcceptedRiskRecord {
  readonly category: Extract<
    ListeningHistoricalOrphanCategory,
    'interim-rollout-object' | 'missing-owner-evidence' | 'ambiguous-owner-evidence'
  >;
  readonly status: 'accepted-risk-record-required-before-deletion';
  readonly candidateCount: number;
  readonly candidateBytes: number;
  readonly deletionAuthorized: false;
}

export interface ListeningHistoricalOrphanInventoryReport {
  readonly runId: string;
  readonly status: 'planned' | 'aborted';
  readonly generatedAt: number;
  readonly totalObjectCount: number;
  readonly totalBytes: number;
  readonly candidateCount: number;
  readonly candidateBytes: number;
  readonly retainedReferenceExclusionCount: number;
  readonly retainedReferenceExclusionBytes: number;
  readonly categoryCounts: Record<ListeningHistoricalOrphanCategory, number>;
  readonly categoryBytes: Record<ListeningHistoricalOrphanCategory, number>;
  readonly budget: ListeningHistoricalOrphanInventoryBudget;
  readonly budgetUse: ListeningHistoricalOrphanInventoryBudgetUse;
  readonly abortReason?: ListeningHistoricalOrphanAbortReason;
  readonly stopAction?: string;
}

export interface ListeningHistoricalOrphanInventoryCheckpoint {
  readonly runId: string;
  readonly createdAt: number;
  readonly processedKeys: readonly string[];
  readonly nextCursorKey?: string;
  readonly abortReason?: ListeningHistoricalOrphanAbortReason;
}

export interface ListeningHistoricalOrphanInventoryPlan {
  readonly report: ListeningHistoricalOrphanInventoryReport;
  readonly checkpoint: ListeningHistoricalOrphanInventoryCheckpoint;
  readonly candidates: readonly ListeningHistoricalOrphanCandidate[];
  readonly exclusions: readonly ListeningHistoricalOrphanExclusion[];
  readonly acceptedRiskRecords: readonly ListeningHistoricalOrphanAcceptedRiskRecord[];
}

export interface ListeningHistoricalOrphanInventoryRepository {
  readonly listObjects: (input: {
    readonly cursorKey?: string;
    readonly limit: number;
  }) => Promise<{
    readonly objects: readonly ListeningHistoricalOrphanObject[];
    readonly nextCursorKey?: string;
  }>;
  readonly readEvidenceForObject: (input: {
    readonly key: string;
  }) => Promise<ListeningHistoricalOrphanEvidence | undefined>;
  readonly copyObject?: (input: unknown) => Promise<unknown>;
  readonly deleteObject?: (input: unknown) => Promise<unknown>;
}

export interface ListeningHistoricalOrphanInventoryReportSink {
  readonly writeCheckpoint: (checkpoint: ListeningHistoricalOrphanInventoryCheckpoint) => Promise<void>;
  readonly writeReport: (report: ListeningHistoricalOrphanInventoryReport) => Promise<void>;
}

export const LISTENING_HISTORICAL_ORPHAN_INVENTORY_BUDGET = {
  maxObjectOperations: 25,
  maxR2ListOperations: 1,
  maxR2CopyOperations: 0,
  maxR2DeleteOperations: 0,
  maxEstimatedWallClockMs: 20_000,
  maxEstimatedR2CostUsd: 0.00012,
} as const satisfies ListeningHistoricalOrphanInventoryBudget;

const emptyBudgetUse = (): ListeningHistoricalOrphanInventoryBudgetUse => ({
  objectOperations: 0,
  r2ListOperations: 0,
  r2CopyOperations: 0,
  r2DeleteOperations: 0,
  estimatedWallClockMs: 0,
  estimatedR2CostUsd: 0,
});

const emptyCategoryCounts = (): Record<ListeningHistoricalOrphanCategory, number> => ({
  'deleted-test-leftover': 0,
  'pre-registry-permanent-audio': 0,
  'interim-rollout-object': 0,
  'missing-owner-evidence': 0,
  'ambiguous-owner-evidence': 0,
});

const categoryRank: Record<ListeningHistoricalOrphanCategory, number> = {
  'interim-rollout-object': 0,
  'deleted-test-leftover': 1,
  'ambiguous-owner-evidence': 2,
  'missing-owner-evidence': 3,
  'pre-registry-permanent-audio': 4,
};

const stopActionFor: Record<ListeningHistoricalOrphanAbortReason, string> = {
  object_operation_budget_exceeded: 'abort historical inventory, preserve cursor, report object-operation capacity stop',
  r2_list_operation_budget_exceeded: 'abort historical inventory before object scan, report R2 list capacity stop',
  estimated_wall_clock_budget_exceeded: 'abort historical inventory, preserve cursor, report wall-clock capacity stop',
  estimated_cost_budget_exceeded: 'abort historical inventory, preserve cursor, report estimated R2 cost stop',
};

const abortReasonForBudget = (
  usage: ListeningHistoricalOrphanInventoryBudgetUse,
  budget: ListeningHistoricalOrphanInventoryBudget,
): ListeningHistoricalOrphanAbortReason | undefined => {
  if (usage.objectOperations > budget.maxObjectOperations) return 'object_operation_budget_exceeded';
  if (usage.r2ListOperations > budget.maxR2ListOperations) return 'r2_list_operation_budget_exceeded';
  if (usage.estimatedWallClockMs > budget.maxEstimatedWallClockMs) return 'estimated_wall_clock_budget_exceeded';
  if (usage.estimatedR2CostUsd > budget.maxEstimatedR2CostUsd) return 'estimated_cost_budget_exceeded';
  return undefined;
};

const classifyHistoricalObject = (
  object: ListeningHistoricalOrphanObject,
  evidence: ListeningHistoricalOrphanEvidence | undefined,
): ListeningHistoricalOrphanCategory | undefined => {
  if (!evidence?.ownerId) return 'missing-owner-evidence';
  if ((evidence.ownerCandidates?.length ?? 0) > 1) return 'ambiguous-owner-evidence';
  if (evidence.interimRolloutScheme || object.key.includes('listening-interim')) return 'interim-rollout-object';
  if ((evidence.deletedTestIds?.length ?? 0) > 0) return 'deleted-test-leftover';
  if (evidence.preRegistryPermanent || object.key.startsWith('audio/')) return 'pre-registry-permanent-audio';
  return undefined;
};

const buildAcceptedRiskRecords = (
  candidates: readonly ListeningHistoricalOrphanCandidate[],
): readonly ListeningHistoricalOrphanAcceptedRiskRecord[] => {
  const riskCategories: ListeningHistoricalOrphanAcceptedRiskRecord['category'][] = [
    'interim-rollout-object',
    'ambiguous-owner-evidence',
    'missing-owner-evidence',
  ];
  return riskCategories.flatMap((category) => {
    const matching = candidates.filter((candidate) => candidate.category === category);
    if (matching.length === 0) return [];
    return [{
      category,
      status: 'accepted-risk-record-required-before-deletion' as const,
      candidateCount: matching.length,
      candidateBytes: matching.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
      deletionAuthorized: false as const,
    }];
  });
};

const createPlan = (input: {
  readonly runId: string;
  readonly now: number;
  readonly objects: readonly ListeningHistoricalOrphanObject[];
  readonly budget: ListeningHistoricalOrphanInventoryBudget;
  readonly budgetUse: ListeningHistoricalOrphanInventoryBudgetUse;
  readonly processedKeys: readonly string[];
  readonly candidates: readonly ListeningHistoricalOrphanCandidate[];
  readonly exclusions: readonly ListeningHistoricalOrphanExclusion[];
  readonly abortReason?: ListeningHistoricalOrphanAbortReason;
  readonly nextCursorKey?: string;
}): ListeningHistoricalOrphanInventoryPlan => {
  const abortReason = input.abortReason ?? abortReasonForBudget(input.budgetUse, input.budget);
  const candidates = abortReason ? [] : [...input.candidates].sort((left, right) => {
    const rank = categoryRank[left.category] - categoryRank[right.category];
    return rank || left.key.localeCompare(right.key);
  });
  const categoryCounts = emptyCategoryCounts();
  const categoryBytes = emptyCategoryCounts();
  for (const candidate of candidates) {
    categoryCounts[candidate.category] += 1;
    categoryBytes[candidate.category] += candidate.sizeBytes;
  }
  return {
    candidates,
    exclusions: input.exclusions,
    acceptedRiskRecords: buildAcceptedRiskRecords(candidates),
    checkpoint: {
      runId: input.runId,
      createdAt: input.now,
      processedKeys: input.processedKeys,
      nextCursorKey: input.nextCursorKey,
      abortReason,
    },
    report: {
      runId: input.runId,
      status: abortReason ? 'aborted' : 'planned',
      generatedAt: input.now,
      totalObjectCount: input.objects.length,
      totalBytes: input.objects.reduce((sum, object) => sum + object.sizeBytes, 0),
      candidateCount: candidates.length,
      candidateBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
      retainedReferenceExclusionCount: input.exclusions.length,
      retainedReferenceExclusionBytes: input.exclusions.reduce((sum, exclusion) => sum + exclusion.sizeBytes, 0),
      categoryCounts,
      categoryBytes,
      budget: input.budget,
      budgetUse: input.budgetUse,
      abortReason,
      stopAction: abortReason ? stopActionFor[abortReason] : undefined,
    },
  };
};

export function planListeningHistoricalOrphanInventoryDryRun(input: {
  readonly runId: string;
  readonly now: number;
  readonly objects: readonly ListeningHistoricalOrphanObject[];
  readonly evidenceByKey: Readonly<Record<string, ListeningHistoricalOrphanEvidence | undefined>>;
  readonly budget?: ListeningHistoricalOrphanInventoryBudget;
}): ListeningHistoricalOrphanInventoryPlan {
  const budget = input.budget ?? LISTENING_HISTORICAL_ORPHAN_INVENTORY_BUDGET;
  let budgetUse: ListeningHistoricalOrphanInventoryBudgetUse = {
    ...emptyBudgetUse(),
    r2ListOperations: input.objects.length > 0 ? 1 : 0,
    estimatedWallClockMs: 500,
    estimatedR2CostUsd: estimateListeningReconciliationR2CostUsd({
      classAOperations: input.objects.length > 0 ? 1 : 0,
      classBOperations: 0,
    }),
  };
  let abortReason = abortReasonForBudget(budgetUse, budget);
  let nextCursorKey: string | undefined;
  const processedKeys: string[] = [];
  const candidates: ListeningHistoricalOrphanCandidate[] = [];
  const exclusions: ListeningHistoricalOrphanExclusion[] = [];

  for (const current of [...input.objects].sort((left, right) => left.key.localeCompare(right.key))) {
    if (abortReason) break;
    const nextBudgetUse: ListeningHistoricalOrphanInventoryBudgetUse = {
      ...budgetUse,
      objectOperations: budgetUse.objectOperations + 1,
      estimatedWallClockMs: budgetUse.estimatedWallClockMs + 250,
      estimatedR2CostUsd: budgetUse.estimatedR2CostUsd + estimateListeningReconciliationR2CostUsd({
        classAOperations: 0,
        classBOperations: 1,
      }),
    };
    const nextAbort = abortReasonForBudget(nextBudgetUse, budget);
    if (nextAbort) {
      budgetUse = nextBudgetUse;
      abortReason = nextAbort;
      nextCursorKey = current.key;
      break;
    }

    budgetUse = nextBudgetUse;
    processedKeys.push(current.key);
    const currentEvidence = input.evidenceByKey[current.key];
    const retainedReferenceCount = currentEvidence?.liveProductReferences.length ?? 0;
    if (retainedReferenceCount > 0) {
      exclusions.push({
        key: current.key,
        sizeBytes: current.sizeBytes,
        reasonCode: 'retained-reference-present',
        retainedReferenceCount,
        observedAt: input.now,
      });
      continue;
    }
    const category = classifyHistoricalObject(current, currentEvidence);
    if (!category) continue;
    candidates.push({
      key: current.key,
      sizeBytes: current.sizeBytes,
      ownerId: currentEvidence?.ownerId,
      category,
      reasonCode: category,
      retainedReferenceCount: 0,
      observedAt: input.now,
      executionAuthorized: false,
      deletionAuthorized: false,
    });
  }

  return createPlan({
    runId: input.runId,
    now: input.now,
    objects: input.objects,
    budget,
    budgetUse,
    processedKeys,
    candidates,
    exclusions,
    abortReason,
    nextCursorKey,
  });
}

export async function runListeningHistoricalOrphanInventoryDryRun(input: {
  readonly repository: ListeningHistoricalOrphanInventoryRepository;
  readonly reportSink: ListeningHistoricalOrphanInventoryReportSink;
  readonly runId: string;
  readonly now: number;
  readonly cursorKey?: string;
  readonly budget?: ListeningHistoricalOrphanInventoryBudget;
}): Promise<ListeningHistoricalOrphanInventoryPlan> {
  const budget = input.budget ?? LISTENING_HISTORICAL_ORPHAN_INVENTORY_BUDGET;
  const page = await input.repository.listObjects({
    cursorKey: input.cursorKey,
    limit: budget.maxObjectOperations + 1,
  });
  const evidenceByKey: Record<string, ListeningHistoricalOrphanEvidence | undefined> = {};
  for (const object of page.objects) {
    evidenceByKey[object.key] = await input.repository.readEvidenceForObject({ key: object.key });
  }
  const plan = planListeningHistoricalOrphanInventoryDryRun({
    runId: input.runId,
    now: input.now,
    objects: page.objects,
    evidenceByKey,
    budget,
  });
  await input.reportSink.writeCheckpoint({
    ...plan.checkpoint,
    nextCursorKey: plan.checkpoint.nextCursorKey ?? page.nextCursorKey,
  });
  await input.reportSink.writeReport(plan.report);
  return plan;
}
