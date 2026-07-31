import type {
  ActivityRevisionCandidate,
  ActivityRevisionCurrentPointer,
  ActivityRevisionOperationRecord,
  ActivityRevisionRepository,
  ActivityRevisionScope,
  ActivityRevisionSourceContext,
  ActivityRevisionVersionRecord,
} from '../../../../src/services/book-activity/activityRevisionPublish.service.ts';
import {
  assertCanonicalPublishedActivityVersion,
  createCanonicalActivityVersionFingerprint,
  type CanonicalActivityRevisionContext,
  type CanonicalPublishedActivityVersionRecord,
  type CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint,
} from '../../../../src/services/book-assembly/canonicalActivityVersion.service.ts';
import { projectStudentActivity } from '../../../../src/services/book-activity/activityProjection.service.ts';
import { diffActivities } from '../../../../src/services/book-activity/activityDiff.service.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import {
  FirebaseRestCanonicalActivityVersionWriter,
  type CanonicalActivityVersionWriterEnv,
} from '../book-assembly/canonical-activity-version-repository.ts';

export const ACTIVITY_REVISION_CONTROL_ROOT = 'book_activity/revision_control';

const MAX_RETRIES = 5;
const MAX_CONTROL_BYTES = 8 * 1024 * 1024;
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;

interface PersistedCurrentPointer {
  readonly schemaVersion: 1;
  readonly lifecycle: 'published';
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly ownerId: string;
  readonly sourceContextFingerprint: string | null;
  readonly sourceContext: ActivityRevisionSourceContext | null;
  readonly payloadFingerprint: string;
  readonly updatedByOperationId: string;
  readonly updatedAt: string;
}

interface PersistedHistoryRecord {
  readonly schemaVersion: 1;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly ownerId: string;
  readonly predecessorActivityVersionId?: string;
  readonly placementIds: readonly string[];
  readonly payloadFingerprint: string;
  readonly createdByOperationId: string;
  readonly publishedAt: string;
}

interface PersistedOperationRecord extends ActivityRevisionOperationRecord {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly activityId: string;
  readonly expectedActivityVersion: number;
  readonly resultActivityVersionId: string;
}

interface PersistedRevisionControl {
  readonly current?: PersistedCurrentPointer;
  readonly history?: Record<string, PersistedHistoryRecord>;
  readonly operations?: Record<string, PersistedOperationRecord>;
}

export interface ActivityRevisionRepositoryEnv
extends RepositoryEnv, CanonicalActivityVersionWriterEnv {
  BOOK_ACTIVITY_REVISION_SERVICE_IDENTITY?: string;
  BOOK_ACTIVITY_REVISION_GOOGLE_SA_KEY?: string;
  BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY?: string;
  BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY?: string;
}

const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};
const assertPathId = (value: unknown, code: string): asserts value is string => {
  if (typeof value !== 'string' || !PATH_ID.test(value)) throw new Error(code);
};
const assertPositiveInteger = (value: unknown, code: string): asserts value is number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(code);
};
const controlPath = (activityId: string): string => {
  assertPathId(activityId, 'invalid_activity_revision_activity_id');
  return `${ACTIVITY_REVISION_CONTROL_ROOT}/${activityId}`;
};
const canonicalPath = (activityId: string, activityVersionId: string): string => {
  assertPathId(activityId, 'invalid_activity_revision_activity_id');
  assertPathId(activityVersionId, 'invalid_activity_revision_activity_version_id');
  return `book_activity/versions/${activityId}/${activityVersionId}`;
};

const parseCanonical = (value: unknown): CanonicalPublishedActivityVersionRecord => {
  try {
    return assertCanonicalPublishedActivityVersion(value);
  } catch {
    throw new Error('invalid_activity_revision_canonical_version');
  }
};

const contextFromCanonical = (
  record: CanonicalPublishedActivityVersionRecord,
): ActivityRevisionSourceContext | null => {
  if (record.provenance.kind === 'activity-revision') {
    const value = record.provenance.sourceContext ?? record.provenance.context ?? null;
    if (value === null) return null;
    const { sourceContextFingerprint: storedFingerprint, ...sourceContext } = value;
    const restored = sourceContext.fingerprint === undefined
      && typeof storedFingerprint === 'string'
      ? { ...sourceContext, fingerprint: storedFingerprint }
      : sourceContext;
    const meaningful = restored.fingerprint !== undefined
      || restored.sourceVersionId !== undefined
      || restored.pageGroupId !== undefined
      || (restored.mappedBookPageRefs?.length ?? 0) > 0;
    return meaningful ? clone(restored) as ActivityRevisionSourceContext : null;
  }
  if (record.sourceContextFingerprint === null) return null;
  const sourceVersions = [...new Set(record.provenance.sourcePages.map((page) => page.sourceVersionId))];
  return {
    fingerprint: record.sourceContextFingerprint,
    ...(sourceVersions.length === 1 ? { sourceVersionId: sourceVersions[0] } : {}),
    mappedBookPageRefs: record.provenance.sourcePages.map((page) =>
      `${page.sourceKey}:${page.sourceVersionId}:${page.physicalPageNumber}`),
  };
};

const internalVersion = (
  record: CanonicalPublishedActivityVersionRecord,
): ActivityRevisionVersionRecord => ({
  schemaVersion: 1,
  activityId: record.activityId,
  versionId: record.activityVersionId,
  version: record.activityVersion,
  ownerId: record.ownerId,
  // The canonical normalized payload is the authority. `editable` is retained
  // only for the legacy in-process fixture contract and is never persisted.
  editable: clone(record.activity) as unknown as ActivityRevisionVersionRecord['editable'],
  activity: clone(record.activity),
  projection: clone(record.projection),
  semanticImpact: diffActivities(null, record.activity),
  sourceContextFingerprint: record.sourceContextFingerprint,
  ...(record.predecessorActivityVersionId
    ? { predecessorVersionId: record.predecessorActivityVersionId }
    : {}),
  placementIds: [...record.placementIds],
  evidenceRefs: [...record.evidenceRefs],
  sourceEvidenceRefs: record.provenance.kind === 'activity-revision'
    ? [...(record.provenance.sourceEvidenceRefs ?? [])]
    : [],
  answerEvidenceRefs: record.provenance.kind === 'activity-revision'
    ? [...(record.provenance.answerEvidenceRefs ?? [])]
    : [],
  createdByOperationId: record.createdByOperationId,
  createdAt: record.publishedAt,
});

const canonicalContext = (
  sourceContext: ActivityRevisionSourceContext | null,
  sourceContextFingerprint: string | null,
): CanonicalActivityRevisionContext => {
  const result: CanonicalActivityRevisionContext = {
    sourceContextFingerprint,
    ...(typeof sourceContext?.sourceVersionId === 'string'
      ? { sourceVersionId: sourceContext.sourceVersionId }
      : {}),
    ...(typeof sourceContext?.pageGroupId === 'string'
      ? { pageGroupId: sourceContext.pageGroupId }
      : {}),
    ...(Array.isArray(sourceContext?.mappedBookPageRefs)
      ? { mappedBookPageRefs: [...sourceContext.mappedBookPageRefs] }
      : {}),
  };
  return result;
};

const canonicalVersion = (
  record: ActivityRevisionVersionRecord,
  sourceContext: ActivityRevisionSourceContext | null,
  candidate: ActivityRevisionCandidate,
): CanonicalPublishedActivityVersionRecord => {
  const withoutFingerprint: CanonicalPublishedActivityVersionRecordWithoutPayloadFingerprint = {
    schemaVersion: 1,
    lifecycle: 'published',
    activityId: record.activityId,
    activityVersionId: record.versionId,
    activityVersion: record.version,
    ownerId: record.ownerId,
    activity: clone(record.activity),
    projection: projectStudentActivity(record.activity),
    ...(record.predecessorVersionId
      ? { predecessorActivityVersionId: record.predecessorVersionId }
      : {}),
    placementIds: [...(record.placementIds ?? [])],
    evidenceRefs: [...record.evidenceRefs],
    sourceContextFingerprint: record.sourceContextFingerprint,
    createdByOperationId: record.createdByOperationId,
    publishedAt: record.createdAt,
    provenance: {
      kind: 'activity-revision',
      candidateId: candidate.candidateId,
      candidateRevision: candidate.candidateRevision,
      evidenceRefs: [...candidate.evidenceRefs],
      sourceEvidenceRefs: [...candidate.sourceEvidenceRefs],
      answerEvidenceRefs: [...candidate.answerEvidenceRefs],
      sourceContext: canonicalContext(sourceContext, record.sourceContextFingerprint),
    },
  };
  return {
    ...withoutFingerprint,
    payloadFingerprint: createCanonicalActivityVersionFingerprint(withoutFingerprint),
  };
};

const parseControl = (value: unknown): PersistedRevisionControl => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)
    || Object.keys(value).some((key) => !['current', 'history', 'operations'].includes(key))
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_CONTROL_BYTES) {
    throw new Error('invalid_activity_revision_control');
  }
  return clone(value) as unknown as PersistedRevisionControl;
};

const pointerFrom = (
  pointer: PersistedCurrentPointer,
): ActivityRevisionCurrentPointer => ({
  activityId: pointer.activityId,
  versionId: pointer.activityVersionId,
  version: pointer.activityVersion,
  contextFingerprint: pointer.sourceContextFingerprint,
});

const operationMap = (
  value: Record<string, PersistedOperationRecord> | undefined,
): Record<string, ActivityRevisionOperationRecord> => Object.fromEntries(
  Object.entries(value ?? {}).map(([key, operation]) => [key, {
    ownerId: operation.ownerId,
    fingerprint: operation.fingerprint,
    result: clone(operation.result),
    createdAt: operation.createdAt,
  }]),
);

const persistedOperation = (
  operationId: string,
  activityId: string,
  previousVersion: number,
  resultActivityVersionId: string,
  operation: ActivityRevisionOperationRecord,
): PersistedOperationRecord => {
  return {
    schemaVersion: 1,
    operationId,
    activityId,
    expectedActivityVersion: previousVersion,
    resultActivityVersionId,
    ...clone(operation),
  };
};

/**
 * #68 durable control repository. Immutable payload/projection preparation is
 * delegated to #64's canonical writer. Only a successful bounded control CAS
 * advances the material-version pointer; prepared crash remnants stay
 * immutable and invisible to existing Book/Delivery bindings.
 */
export class FirebaseRestActivityRevisionRepository
implements ActivityRevisionRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly canonicalWriter: FirebaseRestCanonicalActivityVersionWriter;
  private candidateOverlay: Record<string, ActivityRevisionCandidate> = {};
  private readonly maxRetries: number;

  constructor(private readonly options: {
    env: ActivityRevisionRepositoryEnv;
    activityId: string;
    expectedCurrentActivityVersionId: string;
    expectedCurrentActivityVersion: number;
    ownerId: string;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    assertPathId(options.activityId, 'invalid_activity_revision_activity_id');
    assertPathId(options.expectedCurrentActivityVersionId, 'invalid_activity_revision_activity_version_id');
    assertPathId(options.ownerId, 'invalid_activity_revision_owner_id');
    assertPositiveInteger(options.expectedCurrentActivityVersion, 'invalid_activity_revision_activity_version');
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    if (!Number.isSafeInteger(this.maxRetries) || this.maxRetries < 1 || this.maxRetries > 10) {
      throw new Error('invalid_activity_revision_max_retries');
    }
    const identity = options.env.BOOK_ACTIVITY_REVISION_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_activity_revision_service_identity');
    const keyJson = options.env.BOOK_ACTIVITY_REVISION_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) throw new Error('missing_activity_revision_google_sa_key');
    if (keyJson) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(keyJson) as Record<string, unknown>;
      } catch {
        throw new Error('invalid_activity_revision_google_sa_key');
      }
      if (parsed.client_email !== identity || typeof parsed.private_key !== 'string') {
        throw new Error('activity_revision_service_identity_mismatch');
      }
    }
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const scopedEnv = {
      ...options.env,
      GOOGLE_SA_KEY: keyJson,
      BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_SERVICE_IDENTITY: identity,
      BOOK_ASSEMBLY_CANONICAL_ACTIVITY_VERSION_WRITER_GOOGLE_SA_KEY: keyJson,
    };
    this.rtdb = new FirebaseRtdbRestClient({
      env: scopedEnv,
      fetchImpl,
      getAccessToken: options.getAccessToken,
    });
    this.canonicalWriter = new FirebaseRestCanonicalActivityVersionWriter({
      env: scopedEnv,
      fetchImpl,
      getAccessToken: options.getAccessToken,
      maxRetries: this.maxRetries,
    });
  }

  private async scope(
    control: PersistedRevisionControl,
  ): Promise<{ scope: ActivityRevisionScope; canonical: CanonicalPublishedActivityVersionRecord }> {
    const requestedVersionId = control.current?.activityVersionId
      ?? this.options.expectedCurrentActivityVersionId;
    const canonical = parseCanonical(await this.rtdb.readValue(
      canonicalPath(this.options.activityId, requestedVersionId),
    ));
    if (canonical.activityId !== this.options.activityId
      || canonical.activityVersionId !== requestedVersionId
      || canonical.ownerId !== this.options.ownerId) {
      throw new Error('activity_revision_current_authority_mismatch');
    }
    const pointer = control.current
      ? pointerFrom(control.current)
      : {
          activityId: canonical.activityId,
          versionId: canonical.activityVersionId,
          version: canonical.activityVersion,
          contextFingerprint: canonical.sourceContextFingerprint,
        };
    if (!control.current
      && canonical.activityVersion !== this.options.expectedCurrentActivityVersion) {
      throw new Error('activity_revision_current_version_mismatch');
    }
    const historical = await Promise.all(
      Object.keys(control.history ?? {})
        .filter((versionId) => versionId !== canonical.activityVersionId)
        .map(async (versionId) => parseCanonical(await this.rtdb.readValue(
          canonicalPath(this.options.activityId, versionId),
        ))),
    );
    return {
      canonical,
      scope: {
        current: pointer,
        currentContext: control.current?.sourceContext ?? contextFromCanonical(canonical),
        versions: Object.fromEntries(
          [canonical, ...historical].map((record) => [
            record.activityVersionId,
            internalVersion(record),
          ]),
        ),
        candidates: clone(this.candidateOverlay),
        operations: operationMap(control.operations),
      },
    };
  }

  async readScope(): Promise<ActivityRevisionScope> {
    const value = await this.rtdb.readValue(controlPath(this.options.activityId));
    return (await this.scope(parseControl(value))).scope;
  }

  async transaction<T>(
    activityId: string,
    mutate: (scope: ActivityRevisionScope) => {
      outcome: T;
      next?: ActivityRevisionScope;
      write: boolean;
    },
  ): Promise<T> {
    if (activityId !== this.options.activityId) {
      throw new Error('activity_revision_scope_mismatch');
    }
    const path = controlPath(activityId);
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      const control = parseControl(current.data);
      const loaded = await this.scope(control);
      const mutation = mutate(clone(loaded.scope));
      if (!mutation.write) return mutation.outcome;
      const next = mutation.next ?? loaded.scope;
      this.candidateOverlay = Object.fromEntries(
        Object.entries(next.candidates ?? {}).filter((entry): entry is [string, ActivityRevisionCandidate] =>
          isRecord(entry[1])),
      );

      const knownVersionIds = new Set([
        loaded.canonical.activityVersionId,
        ...Object.keys(control.history ?? {}),
      ]);
      const additions = Object.entries(next.versions).filter(([versionId]) =>
        !knownVersionIds.has(versionId));
      if (additions.length > 1) throw new Error('activity_revision_write_set_too_large');
      let prepared: CanonicalPublishedActivityVersionRecord | null = null;
      if (additions.length === 1) {
        const candidate = Object.values(this.candidateOverlay)[0];
        if (!candidate) throw new Error('activity_revision_candidate_missing');
        prepared = canonicalVersion(additions[0]![1], next.currentContext ?? null, candidate);
        const result = await this.canonicalWriter.prepare(prepared);
        if (result.status === 'conflict') throw new Error('activity_revision_canonical_conflict');
      }

      // Preview/candidate state is owned and persisted by #35. No revision
      // control write is needed until publication or rollback changes pointer
      // or operation state.
      if (!prepared
        && stable(next.current) === stable(loaded.scope.current)
        && stable(next.operations ?? {}) === stable(loaded.scope.operations ?? {})) {
        return mutation.outcome;
      }

      const nextPointer = next.current;
      if (!nextPointer) throw new Error('activity_revision_pointer_missing');
      const pointedCanonical = prepared?.activityVersionId === nextPointer.versionId
        ? prepared
        : parseCanonical(await this.rtdb.readValue(
            canonicalPath(activityId, nextPointer.versionId),
          ));
      const changedOperationEntries = Object.entries(next.operations ?? {});
      const newestOperation = [...changedOperationEntries]
        .reverse()
        .find(([operationId]) => !(operationId in (control.operations ?? {})));
      const nextControl: PersistedRevisionControl = {
        current: {
          schemaVersion: 1,
          lifecycle: 'published',
          activityId,
          activityVersionId: nextPointer.versionId,
          activityVersion: nextPointer.version,
          ownerId: this.options.ownerId,
          sourceContextFingerprint: pointedCanonical.sourceContextFingerprint,
          sourceContext: contextFromCanonical(pointedCanonical),
          payloadFingerprint: pointedCanonical.payloadFingerprint,
          updatedByOperationId: newestOperation?.[0] ?? pointedCanonical.createdByOperationId,
          updatedAt: newestOperation?.[1].createdAt ?? pointedCanonical.publishedAt,
        },
        history: {
          ...(control.history ?? {}),
          [loaded.canonical.activityVersionId]: {
            schemaVersion: 1,
            activityId,
            activityVersionId: loaded.canonical.activityVersionId,
            activityVersion: loaded.canonical.activityVersion,
            ownerId: loaded.canonical.ownerId,
            ...(loaded.canonical.predecessorActivityVersionId
              ? { predecessorActivityVersionId: loaded.canonical.predecessorActivityVersionId }
              : {}),
            placementIds: [...loaded.canonical.placementIds],
            payloadFingerprint: loaded.canonical.payloadFingerprint,
            createdByOperationId: loaded.canonical.createdByOperationId,
            publishedAt: loaded.canonical.publishedAt,
          },
          [pointedCanonical.activityVersionId]: {
            schemaVersion: 1,
            activityId,
            activityVersionId: pointedCanonical.activityVersionId,
            activityVersion: pointedCanonical.activityVersion,
            ownerId: pointedCanonical.ownerId,
            ...(pointedCanonical.predecessorActivityVersionId
              ? { predecessorActivityVersionId: pointedCanonical.predecessorActivityVersionId }
              : {}),
            placementIds: [...pointedCanonical.placementIds],
            payloadFingerprint: pointedCanonical.payloadFingerprint,
            createdByOperationId: pointedCanonical.createdByOperationId,
            publishedAt: pointedCanonical.publishedAt,
          },
        },
        operations: Object.fromEntries(changedOperationEntries.map(([operationId, operation]) => [
          operationId,
          control.operations?.[operationId] ?? persistedOperation(
            operationId,
            activityId,
            loaded.canonical.activityVersion,
            nextPointer.versionId,
            operation,
          ),
        ])),
      };
      if (new TextEncoder().encode(JSON.stringify(nextControl)).byteLength > MAX_CONTROL_BYTES) {
        throw new Error('activity_revision_control_too_large');
      }
      if (await this.rtdb.writeIfMatch(path, nextControl, current.etag)) {
        return mutation.outcome;
      }
    }
    throw new Error('activity_revision_control_cas_retries_exhausted');
  }
}
