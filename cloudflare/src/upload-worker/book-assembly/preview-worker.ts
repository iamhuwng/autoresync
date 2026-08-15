import type { NormalizedActivity } from '../../../../src/types/bookActivity.types.ts';
import type { BookAssemblyBookAuthority, BookAssemblyCandidateRecord } from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import {
  UnitPreviewError,
  createCandidateUnitPreview,
  createPreviewApproval,
  type BookAssemblyPreviewApprovalRecord,
} from '../../../../src/services/book-assembly/unitPreview.service.ts';
import type {
  BookAssemblyPreviewApprovalRead,
  BookAssemblyPreviewApprovalRevocationRecord,
  PreviewApprovalRevokeStatus,
} from '../../../../src/services/book-assembly/previewApproval.repository.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

export interface CandidatePreviewActivityRecord {
  readonly activityKey: string;
  readonly ownerId: string;
  readonly lifecycle: 'validated' | 'saved' | 'staged' | 'rejected' | 'discarded';
  readonly content: unknown;
}

export interface CandidatePreviewWorkerPort {
  readUser(uid: string): Promise<unknown>;
  readBookAuthority(bookId: string): Promise<BookAssemblyBookAuthority | null>;
  readCandidate(input: {
    readonly bookId: string;
    readonly unitKey: string;
    readonly candidateId: string;
  }): Promise<BookAssemblyCandidateRecord | null>;
  readActivities(input: {
    readonly ownerId: string;
    readonly activityKeys: readonly string[];
  }): Promise<readonly CandidatePreviewActivityRecord[]>;
  sourceIsPreviewReady(input: {
    readonly bookId: string;
    readonly sourceVersionId: string;
  }): Promise<boolean>;
  recordApproval(record: BookAssemblyPreviewApprovalRecord): Promise<void>;
  readApproval?(input: {
    readonly bookId: string;
    readonly unitKey: string;
    readonly approvalId: string;
  }): Promise<BookAssemblyPreviewApprovalRead>;
  recordRevocation?(
    record: BookAssemblyPreviewApprovalRevocationRecord,
  ): Promise<PreviewApprovalRevokeStatus>;
}

export class CandidatePreviewWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'CandidatePreviewWorkerError';
  }
}

const plain = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);
const id = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new CandidatePreviewWorkerError(code);
  return value;
};
const revision = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new CandidatePreviewWorkerError('invalid_candidate_revision');
  }
  return value as number;
};
const roleAllowed = (value: unknown): boolean => {
  const user = plain(value);
  return !!user && (user.role === 'teacher' || user.role === 'super_admin')
    && !['blocked', 'inactive', 'suspended'].includes(String(user.status ?? ''))
    && user.forceReauth !== true;
};
const json = (body: unknown, status = 200): { body: unknown; init: ResponseInit } => ({
  body,
  init: { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } },
});

interface PreviewRequest {
  readonly bookId: string;
  readonly unitKey: string;
  readonly candidateId: string;
  readonly expectedCandidateRevision: number;
}

interface RevokeRequest extends PreviewRequest {
  readonly approvalId: string;
}

const command = (input: unknown): PreviewRequest => {
  const body = plain(input);
  if (!body || Object.keys(body).some((key) => ![
    'bookId', 'unitKey', 'candidateId', 'expectedCandidateRevision',
  ].includes(key))) {
    throw new CandidatePreviewWorkerError('invalid_request');
  }
  return {
    bookId: id(body.bookId, 'invalid_book_id'),
    unitKey: id(body.unitKey, 'invalid_unit_key'),
    candidateId: id(body.candidateId, 'invalid_candidate_id'),
    expectedCandidateRevision: revision(body.expectedCandidateRevision),
  };
};

const revokeCommand = (input: unknown): RevokeRequest => {
  const body = plain(input);
  if (!body || Object.keys(body).some((key) => ![
    'bookId', 'unitKey', 'candidateId', 'expectedCandidateRevision', 'approvalId',
  ].includes(key))) {
    throw new CandidatePreviewWorkerError('invalid_request');
  }
  return {
    ...command({
      bookId: body.bookId,
      unitKey: body.unitKey,
      candidateId: body.candidateId,
      expectedCandidateRevision: body.expectedCandidateRevision,
    }),
    approvalId: id(body.approvalId, 'invalid_preview_approval_id'),
  };
};

const configuredRegistryVersion = (value: unknown): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new CandidatePreviewWorkerError('preview_registry_unavailable', 503);
  }
  return value;
};

const activityMap = (
  records: readonly CandidatePreviewActivityRecord[],
  ownerId: string,
): Record<string, NormalizedActivity> => Object.fromEntries(records.map((record) => {
  if (record.ownerId !== ownerId || !['validated', 'saved'].includes(record.lifecycle)) {
    throw new CandidatePreviewWorkerError('preview_activity_unavailable', 409);
  }
  return [record.activityKey, record.content as NormalizedActivity];
}));

export const createCandidatePreviewWorkerHandlers = (options: {
  readonly port: CandidatePreviewWorkerPort;
  /** Renderer registry identity is deployment configuration, never client input. */
  readonly registryVersion?: string;
  readonly now?: () => string;
  readonly createApprovalId?: () => string;
  readonly approvalLifetimeMs?: number;
}) => {
  const now = options.now ?? (() => new Date().toISOString());
  const createApprovalId = options.createApprovalId ?? (() => crypto.randomUUID());
  const approvalLifetimeMs = options.approvalLifetimeMs ?? 5 * 60 * 1000;

  const prepare = async (uid: string, raw: unknown) => {
    const request = command(raw);
    const registryVersion = configuredRegistryVersion(options.registryVersion);
    if (!roleAllowed(await options.port.readUser(uid))) {
      throw new CandidatePreviewWorkerError('preview_forbidden', 403);
    }
    const authority = await options.port.readBookAuthority(request.bookId);
    if (!authority || authority.ownerId !== uid || authority.bookMode !== 'pdf') {
      throw new CandidatePreviewWorkerError('preview_forbidden', 403);
    }
    const candidate = await options.port.readCandidate({
      bookId: request.bookId, unitKey: request.unitKey, candidateId: request.candidateId,
    });
    if (!candidate || candidate.ownerId !== uid || candidate.revision !== request.expectedCandidateRevision ||
      candidate.bookRevision !== authority.bookRevision || candidate.sourceSetRevision !== authority.sourceSetRevision) {
      throw new CandidatePreviewWorkerError('preview_candidate_stale', 409);
    }
    const activityKeys = candidate.manifest?.units
      .find((unit) => unit.unitKey === request.unitKey)?.activitySlots
      .map((slot) => slot.activityKey) ?? [];
    const activities = activityMap(await options.port.readActivities({ ownerId: uid, activityKeys }), uid);
    const sourceVersions = candidate.manifest?.sourceSet.sources.map((source) =>
      authority.sourceVersionAuthority.getSourceVersion(source.sourceVersionId))
      .filter((source): source is NonNullable<typeof source> => source !== undefined) ?? [];
    const readySourceVersionIds = new Set(await Promise.all(sourceVersions.map(async (source) => (
      await options.port.sourceIsPreviewReady({
        bookId: request.bookId,
        sourceVersionId: source.sourceVersionId,
      }) ? source.sourceVersionId : null
    ))).then((ids) => ids.filter((id): id is string => id !== null)));
    try {
      return {
        preview: createCandidateUnitPreview({
          candidate,
          sourceVersions,
          sourceIsPreviewReady: (source) => readySourceVersionIds.has(source.sourceVersionId),
          activitiesByKey: activities,
          registryVersion,
        }),
        activities,
      };
    } catch (error) {
      if (error instanceof UnitPreviewError) {
        throw new CandidatePreviewWorkerError(error.code, 409);
      }
      throw error;
    }
  };

  return {
    async preview(input: { readonly uid: string; readonly body: unknown }) {
      try {
        return json({ preview: (await prepare(input.uid, input.body)).preview });
      } catch (error) {
        if (error instanceof CandidatePreviewWorkerError) return json({ code: error.code }, error.status);
        return json({ code: 'candidate_preview_failed' }, 500);
      }
    },
    async approve(input: { readonly uid: string; readonly body: unknown }) {
      try {
        const prepared = await prepare(input.uid, input.body);
        const approvedAt = now();
        const approval = createPreviewApproval({
          approvalId: createApprovalId(), approvalRevision: 1, actorId: input.uid, approvedAt,
          expiresAt: new Date(Date.parse(approvedAt) + approvalLifetimeMs).toISOString(),
          preview: prepared.preview,
          canonicalActivitiesByKey: prepared.activities,
        });
        await options.port.recordApproval(approval);
        const { canonicalActivityFingerprintsByKey: _serverOnly, ...clientApproval } = approval;
        return json({ approval: clientApproval });
      } catch (error) {
        if (error instanceof CandidatePreviewWorkerError) return json({ code: error.code }, error.status);
        if (error instanceof UnitPreviewError) return json({ code: error.code }, 409);
        return json({ code: 'candidate_preview_approval_failed' }, 500);
      }
    },
    async revoke(input: { readonly uid: string; readonly body: unknown }) {
      try {
        const readApproval = options.port.readApproval;
        const recordRevocation = options.port.recordRevocation;
        if (!readApproval || !recordRevocation) {
          throw new CandidatePreviewWorkerError('preview_approval_dependencies_unavailable', 503);
        }
        const request = revokeCommand(input.body);
        const prepared = await prepare(input.uid, {
          bookId: request.bookId,
          unitKey: request.unitKey,
          candidateId: request.candidateId,
          expectedCandidateRevision: request.expectedCandidateRevision,
        });
        const approvalState = await readApproval({
          bookId: request.bookId,
          unitKey: request.unitKey,
          approvalId: request.approvalId,
        });
        const approval = approvalState.approval;
        if (!approval
          || approval.actorId !== input.uid
          || approval.bookId !== prepared.preview.bookId
          || approval.unitKey !== prepared.preview.unitKey
          || approval.candidateId !== prepared.preview.candidateId
          || approval.candidateRevision !== prepared.preview.candidateRevision
          || approval.bookRevision !== prepared.preview.bookRevision
          || approval.sourceSetRevision !== prepared.preview.sourceSetRevision) {
          throw new CandidatePreviewWorkerError('preview_approval_unavailable', 409);
        }
        if (approvalState.revocation) {
          if (approvalState.revocation.actorId !== input.uid) {
            throw new CandidatePreviewWorkerError('preview_approval_revoke_conflict', 409);
          }
          return json({ revocation: approvalState.revocation, status: 'replayed' });
        }
        const revocation: BookAssemblyPreviewApprovalRevocationRecord = {
          approvalId: approval.approvalId,
          bookId: approval.bookId,
          unitKey: approval.unitKey,
          actorId: input.uid,
          revokedAt: now(),
        };
        const status = await recordRevocation(revocation);
        if (status === 'conflict') {
          const replay = await readApproval({
            bookId: request.bookId,
            unitKey: request.unitKey,
            approvalId: request.approvalId,
          });
          if (replay.revocation?.actorId === input.uid) {
            return json({ revocation: replay.revocation, status: 'replayed' });
          }
          throw new CandidatePreviewWorkerError('preview_approval_revoke_conflict', 409);
        }
        return json({ revocation, status });
      } catch (error) {
        if (error instanceof CandidatePreviewWorkerError) return json({ code: error.code }, error.status);
        if (error instanceof UnitPreviewError) return json({ code: error.code }, 409);
        return json({ code: 'candidate_preview_approval_revoke_failed' }, 500);
      }
    },
  };
};
