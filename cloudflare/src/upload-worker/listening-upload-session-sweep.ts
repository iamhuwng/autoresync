import { createOpaqueId } from './listening-upload-session-contract.ts';
import { FirebaseRestListeningUploadSessionRepository } from './listening-upload-session-repository.ts';
import { createListeningUploadSessionService, ListeningUploadSessionError } from './listening-upload-session.ts';
import type {
  ListeningUploadSessionMetricRecord,
  ListeningUploadSessionRepository,
  ListeningUploadSessionSweepCheckpoint,
  ListeningUploadSessionSweepRecord,
} from './listening-upload-session-types.ts';

const DEFAULT_OWNER_LIMIT = 50;
const DEFAULT_SESSION_LIMIT = 100;
const DEFAULT_LEASE_MS = 55 * 60 * 1000;
const RECONCILIATION_STOP_ACTION =
  'abort reconciliation rollout, preserve checkpoint, and inspect report before continuing';

const positiveInteger = (value: unknown, code: string): number => {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new ListeningUploadSessionError(code, 500);
  return parsed;
};

const requireSecret = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 16) {
    throw new ListeningUploadSessionError('sweep_secret_unavailable', 500);
  }
  return value;
};

const createRunId = (now: number, createId: () => string): string =>
  `listening-temp-sweep-${now}-${createId()}`;

const sweepRecord = (input: {
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

const reconciliationMetric = (input: {
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
  budgetValue: input.failedSessionCount,
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
  const grantSecret = requireSecret(dependencies.grantSecret);
  let fallbackLease = false;

  return {
    async sweepExpiredTempSessions(input: {
      env: Record<string, unknown>;
      notBeforeMs: number;
      maxOwners: number;
      maxSessions: number;
    }) {
      const repository = dependencies.repository;
      if (!repository.listExpiredCleanupCandidates || !repository.writeSweepRecord
        || !repository.writeMetricRecord) {
        throw new ListeningUploadSessionError('sweep_repository_unavailable', 500);
      }
      const cutoff = positiveInteger(input.notBeforeMs, 'invalid_sweep_cutoff');
      const maxOwners = positiveInteger(input.maxOwners, 'invalid_sweep_owner_limit');
      const maxSessions = positiveInteger(input.maxSessions, 'invalid_sweep_session_limit');
      const startedAt = now();
      const sweepId = createRunId(startedAt, issueOpaqueId);

      let checkpoint: ListeningUploadSessionSweepCheckpoint | null = null;
      if (repository.acquireSweepLease) {
        checkpoint = await repository.acquireSweepLease({
          sweepId,
          now: startedAt,
          leaseMs: DEFAULT_LEASE_MS,
          notBeforeMs: cutoff,
        });
        if (!checkpoint) {
          return sweepRecord({
            sweepId,
            status: 'complete',
            createdAt: startedAt,
            completedAt: now(),
            notBeforeMs: cutoff,
            scannedCandidateCount: 0,
            processedSessionCount: 0,
            deletedAssetCount: 0,
            preservedAssetCount: 0,
            skippedAssetCount: 0,
            failedSessionCount: 0,
          });
        }
      } else {
        if (fallbackLease) {
          return sweepRecord({
            sweepId,
            status: 'complete',
            createdAt: startedAt,
            completedAt: now(),
            notBeforeMs: cutoff,
            scannedCandidateCount: 0,
            processedSessionCount: 0,
            deletedAssetCount: 0,
            preservedAssetCount: 0,
            skippedAssetCount: 0,
            failedSessionCount: 0,
          });
        }
        fallbackLease = true;
      }

      const writeCheckpoint = async (status: ListeningUploadSessionSweepRecord['status'], cursor = checkpoint?.cursor, errorCode?: string) => {
        if (!repository.writeSweepCheckpoint || !checkpoint) return;
        await repository.writeSweepCheckpoint({
          ...checkpoint,
          status,
          updatedAt: now(),
          // An omitted cursor is an intentional end-of-scan reset. JSON/RTDB
          // removes the prior cursor when this property is undefined.
          ...(cursor ? { cursor } : { cursor: undefined }),
          ...(errorCode ? { lastErrorCode: errorCode } : {}),
          leaseExpiresAt: status === 'running' ? now() + DEFAULT_LEASE_MS : now(),
        });
      };

      let processedSessionCount = 0;
      let deletedAssetCount = 0;
      let preservedAssetCount = 0;
      let skippedAssetCount = 0;
      let failedSessionCount = 0;
      let scannedCandidateCount = 0;
      let status: ListeningUploadSessionSweepRecord['status'] = 'complete';
      let nextCursor = checkpoint?.cursor;
      try {
        await repository.writeSweepRecord(sweepRecord({
          sweepId,
          status: 'running',
          createdAt: startedAt,
          notBeforeMs: cutoff,
          scannedCandidateCount: 0,
          processedSessionCount: 0,
          deletedAssetCount: 0,
          preservedAssetCount: 0,
          skippedAssetCount: 0,
          failedSessionCount: 0,
        }));

        const pageOrCandidates = await repository.listExpiredCleanupCandidates({
          now: startedAt,
          notBeforeMs: cutoff,
          maxOwners,
          maxSessions,
          cursor: checkpoint?.cursor,
        });
        const page = Array.isArray(pageOrCandidates)
          ? { candidates: pageOrCandidates, hasMore: false, nextCursor: undefined }
          : pageOrCandidates;
        scannedCandidateCount = page.candidates.length;
        nextCursor = page.nextCursor;
        const cleanupService = createListeningUploadSessionService({
          repository,
          idempotencySecret: grantSecret,
          grantSecret,
          now,
          createOpaqueId: issueOpaqueId,
        });
        for (const candidate of page.candidates) {
          try {
            const result = await cleanupService.cancelSession({
              uid: candidate.ownerId,
              body: { uploadSessionId: candidate.uploadSessionId, reason: 'scheduled-expired' },
              env: input.env,
            });
            processedSessionCount += 1;
            deletedAssetCount += result.deletedCount;
            preservedAssetCount += result.preservedCount;
            skippedAssetCount += result.skippedCount;
          } catch (error) {
            failedSessionCount += 1;
            void error;
          }
          await writeCheckpoint('running', {
            ownerId: candidate.ownerId,
            uploadSessionId: candidate.uploadSessionId,
          });
        }
        if (failedSessionCount > 0) status = 'failed';
        // Continue past failed candidates so one persistent failure cannot
        // starve later owners. Failed cleanup remains queued and is retried
        // after the cursor completes a full scan and resets.
        const checkpointCursor = page.hasMore ? nextCursor : undefined;
        await writeCheckpoint(status, checkpointCursor,
          failedSessionCount > 0 ? 'session_cleanup_failed' : undefined);
      } catch (error) {
        status = 'failed';
        const errorCode = error instanceof Error ? error.message.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80) : 'sweep_failed';
        await writeCheckpoint('failed', nextCursor, errorCode);
      } finally {
        fallbackLease = false;
      }

      const completedAt = now();
      const finalRecord = sweepRecord({
        sweepId,
        status,
        createdAt: startedAt,
        completedAt,
        notBeforeMs: cutoff,
        scannedCandidateCount,
        processedSessionCount,
        deletedAssetCount,
        preservedAssetCount,
        skippedAssetCount,
        failedSessionCount,
      });
      await repository.writeSweepRecord(finalRecord);
      await repository.writeMetricRecord(reconciliationMetric({
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
  async scheduled(input: { env: Record<string, unknown>; cron: string }) {
    if (input.env.LISTENING_UPLOAD_SESSION_SWEEP_ENABLED !== 'true') {
      return { schemaVersion: 1 as const, status: 'disabled' as const, cron: input.cron };
    }
    const cutoff = positiveInteger(
      input.env.LISTENING_UPLOAD_SESSION_SWEEP_NOT_BEFORE_MS,
      'invalid_sweep_cutoff',
    );
    const repository = options.repository ?? createRepositoryFromEnv(input.env);
    if (repository.isRestoreInProgress && await repository.isRestoreInProgress()) {
      return {
        schemaVersion: 1 as const,
        status: 'restore-in-progress' as const,
        cron: input.cron,
      };
    }
    const service = createListeningUploadSessionSweepService({
      repository,
      now: options.now,
      createOpaqueId: options.createOpaqueId,
      grantSecret: options.grantSecret ?? requireSecret(input.env.LISTENING_UPLOAD_SESSION_GRANT_SECRET),
    });
    return service.sweepExpiredTempSessions({
      env: input.env,
      notBeforeMs: cutoff,
      maxOwners: positiveInteger(input.env.LISTENING_UPLOAD_SESSION_SWEEP_MAX_OWNERS ?? DEFAULT_OWNER_LIMIT, 'invalid_sweep_owner_limit'),
      maxSessions: positiveInteger(input.env.LISTENING_UPLOAD_SESSION_SWEEP_MAX_SESSIONS ?? DEFAULT_SESSION_LIMIT, 'invalid_sweep_session_limit'),
    });
  },
});
