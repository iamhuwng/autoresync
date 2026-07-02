import { createOpaqueId } from './listening-upload-session-contract.ts';
import { FirebaseRestListeningUploadSessionRepository } from './listening-upload-session-repository.ts';
import { createListeningUploadSessionService, ListeningUploadSessionError } from './listening-upload-session.ts';
import type {
  ListeningUploadSessionMetricRecord,
  ListeningUploadSessionRepository,
  ListeningUploadSessionSweepRecord,
} from './listening-upload-session-types.ts';

const DEFAULT_OWNER_LIMIT = 50;
const DEFAULT_SESSION_LIMIT = 100;
const DEFAULT_NOT_BEFORE_MS = 0;
const RECONCILIATION_STOP_ACTION =
  'abort reconciliation rollout, preserve checkpoint, and inspect report before continuing';

const parseNonNegativeInt = (
  value: unknown,
  fallback: number,
): number => {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const requireSecret = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 16) {
    throw new ListeningUploadSessionError('sweep_secret_unavailable', 500);
  }
  return value;
};

const createRunId = (now: number, createId: () => string): string =>
  `listening-temp-sweep-${now}-${createId()}`;

const createSweepRecord = (input: {
  sweepId: string;
  status: ListeningUploadSessionSweepRecord['status'];
  createdAt: number;
  completedAt?: number;
  notBeforeMs: number;
  scannedCandidateCount: number;
  processedSessionCount: number;
  deletedAssetCount: number;
  preservedAssetCount: number;
  skippedAssetCount: number;
  failedSessionCount: number;
}): ListeningUploadSessionSweepRecord => ({
  schemaVersion: 1,
  sweepId: input.sweepId,
  status: input.status,
  createdAt: input.createdAt,
  ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
  sweepKind: 'listening-temp-upload-session',
  trigger: 'scheduled',
  notBeforeMs: input.notBeforeMs,
  scannedCandidateCount: input.scannedCandidateCount,
  processedSessionCount: input.processedSessionCount,
  deletedAssetCount: input.deletedAssetCount,
  preservedAssetCount: input.preservedAssetCount,
  skippedAssetCount: input.skippedAssetCount,
  failedSessionCount: input.failedSessionCount,
});

const createReconciliationMetric = (input: {
  metricEventId: string;
  createdAt: number;
  durationMs: number;
  runId: string;
  processedSessionCount: number;
  failedSessionCount: number;
  status: ListeningUploadSessionSweepRecord['status'];
}): ListeningUploadSessionMetricRecord => ({
  schemaVersion: 1,
  metricEventId: input.metricEventId,
  createdAt: input.createdAt,
  ownerScope: 'all',
  assetId: 'aggregate',
  operation: 'reconciliation',
  outcome: input.failedSessionCount > 0 ? 'threshold-exceeded' : 'within-threshold',
  reasonCode: input.failedSessionCount > 0
    ? 'scheduled_temp_sweep_failed'
    : 'scheduled_temp_sweep_complete',
  stateBefore: 'scheduled',
  stateAfter: input.status,
  sizeBytes: 0,
  durationMs: input.durationMs,
  attemptCount: input.processedSessionCount,
  runId: input.runId,
  budgetName: 'reconciliation-failure-count',
  budgetValue: 0,
  thresholdName: 'reconciliation-failure-count',
  thresholdValue: 0,
  stopAction: RECONCILIATION_STOP_ACTION,
});

export const createListeningUploadSessionSweepService = (dependencies: {
  repository: ListeningUploadSessionRepository;
  now?: () => number;
  createOpaqueId?: () => string;
  grantSecret: string;
}) => {
  const now = dependencies.now ?? (() => Date.now());
  const issueOpaqueId = dependencies.createOpaqueId ?? createOpaqueId;

  return {
    async sweepExpiredTempSessions(input: {
      env: Record<string, unknown>;
      notBeforeMs: number;
      maxOwners: number;
      maxSessions: number;
    }) {
      if (
        !dependencies.repository.listExpiredCleanupCandidates
        || !dependencies.repository.writeSweepRecord
        || !dependencies.repository.writeMetricRecord
      ) {
        throw new ListeningUploadSessionError('sweep_repository_unavailable', 500);
      }

      const startedAt = now();
      const sweepId = createRunId(startedAt, issueOpaqueId);
      await dependencies.repository.writeSweepRecord(createSweepRecord({
        sweepId,
        status: 'running',
        createdAt: startedAt,
        notBeforeMs: input.notBeforeMs,
        scannedCandidateCount: 0,
        processedSessionCount: 0,
        deletedAssetCount: 0,
        preservedAssetCount: 0,
        skippedAssetCount: 0,
        failedSessionCount: 0,
      }));

      const candidates = await dependencies.repository.listExpiredCleanupCandidates({
        now: startedAt,
        notBeforeMs: input.notBeforeMs,
        maxOwners: input.maxOwners,
        maxSessions: input.maxSessions,
      });
      const cleanupService = createListeningUploadSessionService({
        repository: dependencies.repository,
        idempotencySecret: dependencies.grantSecret,
        grantSecret: dependencies.grantSecret,
        now,
        createOpaqueId: issueOpaqueId,
      });

      let processedSessionCount = 0;
      let deletedAssetCount = 0;
      let preservedAssetCount = 0;
      let skippedAssetCount = 0;
      let failedSessionCount = 0;

      for (const candidate of candidates) {
        try {
          const result = await cleanupService.cancelSession({
            uid: candidate.ownerId,
            body: {
              uploadSessionId: candidate.uploadSessionId,
              reason: 'scheduled-expired',
            },
            env: input.env,
          });
          processedSessionCount += 1;
          deletedAssetCount += result.deletedCount;
          preservedAssetCount += result.preservedCount;
          skippedAssetCount += result.skippedCount;
        } catch {
          failedSessionCount += 1;
        }
      }

      const completedAt = now();
      const status = failedSessionCount > 0 ? 'failed' : 'complete';
      const finalRecord = createSweepRecord({
        sweepId,
        status,
        createdAt: startedAt,
        completedAt,
        notBeforeMs: input.notBeforeMs,
        scannedCandidateCount: candidates.length,
        processedSessionCount,
        deletedAssetCount,
        preservedAssetCount,
        skippedAssetCount,
        failedSessionCount,
      });
      await dependencies.repository.writeSweepRecord(finalRecord);
      await dependencies.repository.writeMetricRecord(createReconciliationMetric({
        metricEventId: `${sweepId}-metric`,
        createdAt: completedAt,
        durationMs: completedAt - startedAt,
        runId: sweepId,
        processedSessionCount,
        failedSessionCount,
        status,
      }));
      return finalRecord;
    },
  };
};

const createRepositoryFromEnv = (env: Record<string, unknown>): ListeningUploadSessionRepository =>
  new FirebaseRestListeningUploadSessionRepository({ env });

export const createListeningUploadSessionSweepHandler = (options: {
  repository?: ListeningUploadSessionRepository;
  now?: () => number;
  createOpaqueId?: () => string;
  grantSecret?: string;
} = {}) => ({
  async scheduled(input: {
    env: Record<string, unknown>;
    cron: string;
  }) {
    if (input.env.LISTENING_UPLOAD_SESSION_SWEEP_ENABLED !== 'true') {
      return {
        schemaVersion: 1 as const,
        status: 'disabled' as const,
        cron: input.cron,
      };
    }

    const service = createListeningUploadSessionSweepService({
      repository: options.repository ?? createRepositoryFromEnv(input.env),
      now: options.now,
      createOpaqueId: options.createOpaqueId,
      grantSecret: options.grantSecret ?? requireSecret(input.env.LISTENING_UPLOAD_SESSION_GRANT_SECRET),
    });
    return service.sweepExpiredTempSessions({
      env: input.env,
      notBeforeMs: parseNonNegativeInt(
        input.env.LISTENING_UPLOAD_SESSION_SWEEP_NOT_BEFORE_MS,
        DEFAULT_NOT_BEFORE_MS,
      ),
      maxOwners: parseNonNegativeInt(
        input.env.LISTENING_UPLOAD_SESSION_SWEEP_MAX_OWNERS,
        DEFAULT_OWNER_LIMIT,
      ),
      maxSessions: parseNonNegativeInt(
        input.env.LISTENING_UPLOAD_SESSION_SWEEP_MAX_SESSIONS,
        DEFAULT_SESSION_LIMIT,
      ),
    });
  },
});
