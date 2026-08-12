import { createBookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.entitlementFactory.ts';
import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookDeliveryRepository } from '../../../../src/services/book-delivery/bookDelivery.entitlement.ts';
import type { BookHomeworkManifest } from '../../../../src/types/homework.types.ts';
import { BookHomeworkAuthorityRepository } from './repository.ts';
import {
  assertValidBookHomeworkSagaRecord,
  type BookHomeworkSagaRepository,
} from './sagaRepository.ts';
import type {
  BookHomeworkActivityPolicySnapshot,
} from '../../../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type {
  BookHomeworkSagaCanonicalState,
  BookHomeworkSagaCommand,
  BookHomeworkSagaRecord,
  BookHomeworkSagaRecipient,
  BookHomeworkSagaRecipientState,
} from '../../../../src/services/book-homework/bookHomeworkSaga.types.ts';
import {
  bookHomeworkRecipientAuthorityId,
  bookHomeworkRecipientDeliveryBindingId,
} from './identity.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_RECIPIENTS = 30;

export type BookHomeworkSagaStep =
  | 'authority-prepare'
  | 'delivery-prepare'
  | 'delivery-activate'
  | 'authority-commit'
  | 'visibility-commit';

export interface BookHomeworkSagaHooks {
  readonly beforeStep?: (
    step: BookHomeworkSagaStep,
    recipientId: string,
  ) => Promise<void> | void;
}

export interface BookHomeworkSagaDependencies {
  readonly sagaRepository: BookHomeworkSagaRepository;
  readonly authorityRepository: BookHomeworkAuthorityRepository;
  readonly deliveryRepository: BookDeliveryRepository;
  readonly resolveCanonical: (command: BookHomeworkSagaCommand) => Promise<BookHomeworkSagaCanonicalState>;
  readonly hooks?: BookHomeworkSagaHooks;
  readonly maxRecipients?: number;
}

export interface BookHomeworkSagaResult {
  readonly status: BookHomeworkSagaRecord['state'];
  readonly record: BookHomeworkSagaRecord;
}

export interface BookHomeworkStudentResolution {
  readonly authority: Awaited<ReturnType<BookHomeworkAuthorityRepository['readStudentProjection']>>;
  /** Full trusted manifest for server-only completion derivation; never returned to students. */
  readonly completionAuthority: {
    readonly assignmentId: string;
    readonly manifest: BookHomeworkManifest;
  };
  readonly delivery: NonNullable<Awaited<ReturnType<BookDeliveryRepository['resolveCurrent']>>>;
}

export interface BookHomeworkTeacherStudentResolution extends BookHomeworkStudentResolution {
  readonly studentId: string;
}

export class BookHomeworkSagaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BookHomeworkSagaError';
  }
}

export class BookHomeworkSagaCrash extends Error {
  constructor(readonly step: BookHomeworkSagaStep) {
    super(`book_homework_saga_crash:${step}`);
    this.name = 'BookHomeworkSagaCrash';
  }
}

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const deliveryContract = (binding: BookDeliveryBinding): string => {
  const { status: _status, createdAt: _createdAt, ...contract } = binding;
  return stable(contract);
};

function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !ID.test(value)) throw new BookHomeworkSagaError('invalid-command', `${label} is invalid.`);
}

function assertIso(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) {
    throw new BookHomeworkSagaError('invalid-command', `${label} is invalid.`);
  }
}

const sortedUniqueIds = (value: unknown, label: string, max: number): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > max
    || value.some((entry) => typeof entry !== 'string' || !ID.test(entry))) {
    throw new BookHomeworkSagaError('invalid-command', `${label} must contain 1-${max} safe identifiers.`);
  }
  const result = [...value as string[]].sort();
  if (new Set(result).size !== result.length) {
    throw new BookHomeworkSagaError('invalid-command', `${label} contains duplicate recipients.`);
  }
  return result;
};

const sameIds = (left: readonly string[], right: readonly string[]): boolean => (
  left.length === right.length && left.every((id, index) => id === right[index])
);

const activityPolicySnapshots = (
  canonical: BookHomeworkSagaCanonicalState,
): Readonly<Record<string, BookHomeworkActivityPolicySnapshot>> => {
  const required = canonical.manifest.bindings.filter((binding) => binding.state === 'required');
  const supplied = canonical.frozenPolicy.activityPolicies;
  if (Object.keys(supplied).length !== required.length) {
    throw new BookHomeworkSagaError('stale-policy', 'Frozen Activity policy set does not match required Placements.');
  }
  return Object.fromEntries(required.map((binding) => {
    const policy = supplied[binding.placementId];
    if (!policy
      || typeof policy.lateSubmissionAllowed !== 'boolean'
      || (policy.maxAttempts !== null
        && (!Number.isSafeInteger(policy.maxAttempts)
          || policy.maxAttempts <= 0
          || policy.maxAttempts > 50))) {
      throw new BookHomeworkSagaError('stale-policy', 'Frozen Activity policy is missing or invalid.');
    }
    return [binding.placementId, {
      schemaVersion: 1 as const,
      policyId: canonical.frozenPolicy.policyId,
      policyRevision: canonical.frozenPolicy.policyRevision,
      placementId: binding.placementId,
      activityId: binding.activityId,
      activityVersionId: binding.activityVersionId,
      activityVersion: binding.activityVersion,
      lateSubmissionAllowed: policy.lateSubmissionAllowed,
      maxAttempts: policy.maxAttempts,
    }];
  }));
};

const sortedStrings = (values: readonly string[]): readonly string[] => [...values].sort();

const assertDeliveryPlacementContract = (
  canonical: BookHomeworkSagaCanonicalState,
): void => {
  const sourceVersions = new Map(canonical.deliveryPublication.sourceSet.sources.map((source) => [
    source.sourceKey,
    source.sourceVersionId,
  ]));
  const required = canonical.manifest.bindings
    .filter((binding) => binding.state === 'required')
    .map((binding) => {
      for (const source of binding.sourceContext) {
        if (sourceVersions.get(source.sourceKey) !== source.sourceVersionId) {
          throw new BookHomeworkSagaError(
            'stale-publication',
            'Manifest source identity does not match the Delivery publication.',
          );
        }
      }
      return {
        placementId: binding.placementId,
        activityId: binding.activityId,
        activityVersionId: binding.activityVersionId,
        activityVersion: binding.activityVersion,
        nodeKey: binding.nodeKey,
        order: binding.order,
        contextMode: binding.contextMode,
        pageGroupKeys: sortedStrings(binding.pageGroupKeys),
        sourcePageScopes: binding.sourceContext
          .map((source) => ({
            sourceKey: source.sourceKey,
            pages: [...source.physicalPageNumbers].sort((left, right) => left - right),
          }))
          .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
      };
    })
    .sort((left, right) => left.placementId.localeCompare(right.placementId));
  const delivered = canonical.deliveryPublication.placements
    .map((placement) => ({
      placementId: placement.placementId,
      activityId: placement.activityId,
      activityVersionId: placement.activityVersionId,
      activityVersion: placement.activityVersion,
      nodeKey: placement.nodeKey,
      order: placement.order,
      contextMode: placement.contextMode,
      pageGroupKeys: sortedStrings(placement.pageGroupKeys),
      sourcePageScopes: placement.sourcePageScopes
        .map((source) => ({
          sourceKey: source.sourceKey,
          pages: [...source.pages].sort((left, right) => left - right),
        }))
        .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)),
    }))
    .sort((left, right) => left.placementId.localeCompare(right.placementId));
  if (stable(required) !== stable(delivered)) {
    throw new BookHomeworkSagaError(
      'stale-publication',
      'Manifest Placements do not match the Delivery publication.',
    );
  }
};

const assertCommandEnvelope = (
  command: BookHomeworkSagaCommand,
  maxRecipients: number,
): readonly string[] => {
  assertId(command.assignmentId, 'assignmentId');
  assertId(command.ownerId, 'ownerId');
  assertId(command.idempotencyKey, 'idempotencyKey');
  assertId(command.manifestVersionId, 'manifestVersionId');
  if (!command.intent || typeof command.intent !== 'object' || Array.isArray(command.intent)) {
    throw new BookHomeworkSagaError('invalid-command', 'intent is required.');
  }
  assertIso(command.createdAt, 'createdAt');
  if (!UUID.test(command.operationId)) throw new BookHomeworkSagaError('invalid-command', 'operationId must be a UUID.');
  return sortedUniqueIds(command.selectedRecipientIds, 'selectedRecipientIds', maxRecipients);
};

const childId = (base: string, recipientId: string, suffix: string): string => {
  const value = `${base}--${recipientId}--${suffix}`;
  assertId(value, 'deterministic child identifier');
  return value;
};

const childOperation = (root: string, recipientIndex: number, phase: number): string => {
  const parts = root.split('-');
  const tail = BigInt(`0x${parts.pop() ?? '0'}`);
  const next = tail + BigInt(recipientIndex * 16 + phase);
  if (next > 0xffffffffffffn) {
    throw new BookHomeworkSagaError('invalid-command', 'operationId UUID tail is exhausted.');
  }
  return [...parts, next.toString(16).padStart(12, '0')].join('-');
};

const manifestForRecipient = (manifest: BookHomeworkManifest, recipientId: string): BookHomeworkManifest => ({
  ...clone(manifest),
  context: { ...manifest.context, recipientId },
});

const entryFor = (assignmentId: string, recipientId: string): BookHomeworkSagaRecipient => ({
  recipientId,
  authorityId: bookHomeworkRecipientAuthorityId(assignmentId, recipientId),
  bindingId: bookHomeworkRecipientDeliveryBindingId(assignmentId, recipientId),
  state: 'pending',
});

const isNonTerminal = (state: BookHomeworkSagaRecord['state']): boolean => (
  state === 'prepared' || state === 'fanout_pending' || state === 'compensating' || state === 'failed_retryable'
);

const legalTransitions: Readonly<Record<BookHomeworkSagaRecord['state'], readonly BookHomeworkSagaRecord['state'][]>> = {
  prepared: ['fanout_pending', 'compensating', 'failed_retryable'],
  fanout_pending: ['committed', 'compensating', 'failed_retryable', 'failed_terminal'],
  committed: ['committed'],
  compensating: ['compensated', 'failed_terminal'],
  compensated: ['compensated'],
  failed_retryable: ['fanout_pending', 'compensating', 'failed_terminal'],
  failed_terminal: ['failed_terminal'],
};

export function assertBookHomeworkSagaTransition(
  from: BookHomeworkSagaRecord['state'],
  to: BookHomeworkSagaRecord['state'],
): void {
  if (from !== to && !legalTransitions[from].includes(to)) {
    throw new BookHomeworkSagaError('illegal-transition', `${from} cannot transition to ${to}.`);
  }
}

const rootFingerprint = (command: BookHomeworkSagaCommand, canonical: BookHomeworkSagaCanonicalState): string => stable({
  assignmentId: command.assignmentId,
  ownerId: command.ownerId,
  operationId: command.operationId,
  idempotencyKey: command.idempotencyKey,
  manifestVersionId: command.manifestVersionId,
  selectedRecipientIds: [...command.selectedRecipientIds].sort(),
  intent: command.intent,
  manifest: canonical.manifest,
  schedule: canonical.schedule,
  publication: canonical.publication,
  deliveryPublication: canonical.deliveryPublication,
  studentExtensions: canonical.studentExtensions,
  exposureApproval: canonical.exposureApproval,
  capabilities: canonical.capabilities,
  frozenPolicy: canonical.frozenPolicy,
});

const requestFingerprint = (command: BookHomeworkSagaCommand): string => stable({
  assignmentId: command.assignmentId,
  ownerId: command.ownerId,
  operationId: command.operationId,
  idempotencyKey: command.idempotencyKey,
  manifestVersionId: command.manifestVersionId,
  selectedRecipientIds: [...command.selectedRecipientIds].sort(),
});

const assertCanonical = (
  command: BookHomeworkSagaCommand,
  canonical: BookHomeworkSagaCanonicalState,
  maxRecipients: number,
): readonly string[] => {
  const selected = assertCommandEnvelope(command, maxRecipients);
  const canonicalRecipients = sortedUniqueIds(canonical.recipientIds, 'canonical recipientIds', maxRecipients);
  if (!sameIds(selected, canonicalRecipients)) {
    throw new BookHomeworkSagaError('stale-roster', 'Canonical recipient roster does not match the command.');
  }
  if (canonical.ownerId !== command.ownerId || canonical.manifest.ownerId !== command.ownerId) {
    throw new BookHomeworkSagaError('owner-mismatch', 'Canonical owner does not match the command.');
  }
  if (canonical.manifest.context.contextId !== command.assignmentId) {
    throw new BookHomeworkSagaError(
      'stale-input',
      'Canonical Homework context does not match the assignment identity.',
    );
  }
  if (canonical.manifest.manifestVersionId !== command.manifestVersionId
    || canonical.publication.manifestVersionId !== command.manifestVersionId
    || canonical.publication.bookId !== canonical.manifest.book.bookId
    || canonical.publication.publicationId !== canonical.manifest.book.publicationId
    || canonical.publication.publicationRevision !== canonical.manifest.book.publicationRevision
    || canonical.manifest.book.publicationStatus !== 'published') {
    throw new BookHomeworkSagaError('stale-publication', 'Current publication no longer matches the frozen manifest.');
  }
  if (canonical.sourceReadiness !== 'ready' || !canonical.exposureApproval.approved
    || !canonical.capabilities.canAssignBookHomework) {
    throw new BookHomeworkSagaError('not-ready', 'Source readiness, exposure approval, or assignment capability is unavailable.');
  }
  if (!ID.test(canonical.frozenPolicy.policyId)
    || !Number.isSafeInteger(canonical.frozenPolicy.policyRevision)
    || canonical.frozenPolicy.policyRevision <= 0) {
    throw new BookHomeworkSagaError('stale-policy', 'Frozen policy identity is invalid.');
  }
  activityPolicySnapshots(canonical);
  const requiredUnavailable = canonical.manifest.bindings.some((binding) => (
    binding.state === 'required' && binding.sourceReadiness === 'unavailable'
  ));
  if (requiredUnavailable) throw new BookHomeworkSagaError('source-unavailable', 'A required source is unavailable.');
  if (canonical.deliveryPublication.bookId !== canonical.manifest.book.bookId
    || canonical.deliveryPublication.publicationId !== canonical.manifest.book.publicationId
    || canonical.deliveryPublication.publicationRevision !== canonical.manifest.book.publicationRevision
    || canonical.deliveryPublication.publicationStatus !== 'published'
    || canonical.deliveryPublication.ownerId !== command.ownerId
    || canonical.deliveryPublication.schedulePolicy.policyId !== canonical.frozenPolicy.policyId
    || canonical.deliveryPublication.schedulePolicy.policyRevision !== canonical.frozenPolicy.policyRevision) {
    throw new BookHomeworkSagaError('stale-publication', 'Delivery publication is not the canonical published publication.');
  }
  assertDeliveryPlacementContract(canonical);
  for (const [recipientId, extensions] of Object.entries(canonical.studentExtensions)) {
    if (!selected.includes(recipientId) || extensions.some((extension) => !ID.test(extension.nodeKey))) {
      throw new BookHomeworkSagaError('invalid-extension', 'Student extensions exceed the canonical recipient or node boundary.');
    }
  }
  return selected;
};

export class BookHomeworkAssignmentSaga {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly dependencies: BookHomeworkSagaDependencies) {}

  async readCommittedAssignment(
    assignmentId: string,
  ): Promise<BookHomeworkSagaRecord | null> {
    assertId(assignmentId, 'assignmentId');
    const record = await this.dependencies.sagaRepository.read(assignmentId);
    if (!record) return null;
    assertValidBookHomeworkSagaRecord(record);
    return record.state === 'committed'
      && record.visibility === 'committed'
      && record.committedRecipientCount === record.recipientCount
      && record.recipients.every((recipient) => recipient.state === 'committed')
      ? record
      : null;
  }

  async execute(command: BookHomeworkSagaCommand): Promise<BookHomeworkSagaResult> {
    const previous = this.queues.get(command.assignmentId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tracked = previous.then(() => gate);
    this.queues.set(command.assignmentId, tracked);
    try {
      await previous;
      return await this.executeLocked(command);
    } finally {
      release();
      if (this.queues.get(command.assignmentId) === tracked) this.queues.delete(command.assignmentId);
    }
  }

  async resolveStudentProjection(
    assignmentId: string,
    studentId: string,
  ): Promise<BookHomeworkStudentResolution | null> {
    assertId(assignmentId, 'assignmentId');
    assertId(studentId, 'studentId');
    const record = await this.dependencies.sagaRepository.read(assignmentId);
    if (!record || record.state !== 'committed' || record.visibility !== 'committed') return null;
    const entry = record.recipients.find((candidate) => candidate.recipientId === studentId);
    if (!entry || entry.state !== 'committed') return null;
    const [authority, trustedAuthority, delivery] = await Promise.all([
      this.dependencies.authorityRepository.readStudentProjection(entry.authorityId, studentId),
      this.dependencies.authorityRepository.read(entry.authorityId),
      this.dependencies.deliveryRepository.resolveCurrent(studentId, record.contextId),
    ]);
    if (!authority
      || !trustedAuthority
      || !delivery
      || authority.assignmentId !== record.contextId
      || authority.bookManifest.context.contextId !== record.contextId
      || authority.bookManifest.context.recipientId !== studentId
      || trustedAuthority.saga.sagaId !== record.contextId
      || trustedAuthority.visibility.status !== 'committed'
      || trustedAuthority.bookManifest.context.contextId !== record.contextId
      || trustedAuthority.bookManifest.context.recipientId !== studentId
      || delivery.record.binding.bindingId !== entry.bindingId
      || entry.bindingRevision === undefined
      || delivery.record.binding.revision !== entry.bindingRevision
      || delivery.record.binding.context.contextId !== record.contextId
      || delivery.record.binding.recipient.recipientId !== studentId) return null;
    return {
      authority,
      completionAuthority: {
        assignmentId: record.contextId,
        manifest: trustedAuthority.bookManifest,
      },
      delivery,
    };
  }

  async resolveTeacherProjections(
    assignmentId: string,
    ownerId: string,
  ): Promise<readonly BookHomeworkTeacherStudentResolution[] | null> {
    assertId(assignmentId, 'assignmentId');
    assertId(ownerId, 'ownerId');
    const record = await this.dependencies.sagaRepository.read(assignmentId, ownerId);
    if (!record
      || record.state !== 'committed'
      || record.visibility !== 'committed'
      || record.ownerId !== ownerId) return null;
    const rows = await Promise.all(record.recipients
      .filter((entry) => entry.state === 'committed')
      .map(async (entry): Promise<BookHomeworkTeacherStudentResolution | null> => {
        const [authority, trustedAuthority, delivery] = await Promise.all([
          this.dependencies.authorityRepository.readStudentProjection(entry.authorityId, entry.recipientId),
          this.dependencies.authorityRepository.read(entry.authorityId),
          this.dependencies.deliveryRepository.resolveCurrent(entry.recipientId, record.contextId),
        ]);
        if (!authority
          || !trustedAuthority
          || !delivery
          || authority.assignmentId !== record.contextId
          || authority.bookManifest.context.contextId !== record.contextId
          || authority.bookManifest.context.recipientId !== entry.recipientId
          || trustedAuthority.saga.sagaId !== record.contextId
          || trustedAuthority.visibility.status !== 'committed'
          || trustedAuthority.bookManifest.context.contextId !== record.contextId
          || trustedAuthority.bookManifest.context.recipientId !== entry.recipientId
          || delivery.record.binding.bindingId !== entry.bindingId
          || entry.bindingRevision === undefined
          || delivery.record.binding.revision !== entry.bindingRevision
          || delivery.record.binding.context.contextId !== record.contextId
          || delivery.record.binding.recipient.recipientId !== entry.recipientId) return null;
        return {
          studentId: entry.recipientId,
          authority,
          completionAuthority: {
            assignmentId: record.contextId,
            manifest: trustedAuthority.bookManifest,
          },
          delivery,
        };
      }));
    return rows.every((row): row is BookHomeworkTeacherStudentResolution => row !== null) ? rows : null;
  }

  private async executeLocked(command: BookHomeworkSagaCommand): Promise<BookHomeworkSagaResult> {
    const maxRecipients = this.dependencies.maxRecipients ?? MAX_RECIPIENTS;
    const requestedRecipients = assertCommandEnvelope(command, maxRecipients);
    let record = await this.dependencies.sagaRepository.read(command.assignmentId, command.ownerId);
    if (record) {
      assertValidBookHomeworkSagaRecord(record);
      const sameIdentity = record.ownerId === command.ownerId
        && record.operationId === command.operationId
        && record.idempotencyKey === command.idempotencyKey;
      const terminalReplay = ['committed', 'compensated', 'failed_terminal'].includes(record.state)
        && sameIdentity
        && record.requestFingerprint === requestFingerprint(command)
        && record.manifestVersionId === command.manifestVersionId
        && sameIds(requestedRecipients, record.recipients.map((entry) => entry.recipientId).sort());
      if (['committed', 'compensated', 'failed_terminal'].includes(record.state) && sameIdentity && !terminalReplay) {
        throw new BookHomeworkSagaError('idempotency-conflict', 'Terminal saga replay fingerprint differs.');
      }
      if (terminalReplay) return { status: record.state, record };
      if (!sameIdentity) {
        throw new BookHomeworkSagaError('idempotency-conflict', 'Assignment ID was reused for a different saga.');
      }
      if (record.requestFingerprint !== requestFingerprint(command)) {
        throw new BookHomeworkSagaError('idempotency-conflict', 'Saga request fingerprint differs.');
      }
    }
    if (record?.state === 'compensating') return this.compensate(record, command);
    const canonical = await this.dependencies.resolveCanonical(command);
    const recipients = assertCanonical(command, canonical, maxRecipients);
    const fingerprint = rootFingerprint(command, canonical);
    if (record) {
      assertValidBookHomeworkSagaRecord(record);
      if (record.fingerprint !== fingerprint || record.idempotencyKey !== command.idempotencyKey) {
        throw new BookHomeworkSagaError('idempotency-conflict', 'Assignment ID was reused for a different saga.');
      }
      if (!isNonTerminal(record.state)) return { status: record.state, record };
    } else {
      record = {
        schemaVersion: 1,
        assignmentId: command.assignmentId,
        operationId: command.operationId,
        idempotencyKey: command.idempotencyKey,
        ownerId: command.ownerId,
        manifestVersionId: command.manifestVersionId,
        publicationId: canonical.publication.publicationId,
        publicationRevision: canonical.publication.publicationRevision,
        contextId: canonical.manifest.context.contextId,
        fingerprint,
        requestFingerprint: requestFingerprint(command),
        state: 'prepared',
        visibility: 'hidden',
        recipients: recipients.map((recipientId) => entryFor(command.assignmentId, recipientId)),
        recipientCount: recipients.length,
        committedRecipientCount: 0,
        revision: 1,
        createdAt: command.createdAt,
        updatedAt: command.createdAt,
      };
      assertValidBookHomeworkSagaRecord(record);
      if (!await this.dependencies.sagaRepository.create(record)) {
        const raced = await this.dependencies.sagaRepository.read(command.assignmentId, command.ownerId);
        if (!raced) throw new BookHomeworkSagaError('concurrent-resume', 'Saga create raced without a readable winner.');
        if (raced.fingerprint !== fingerprint) throw new BookHomeworkSagaError('idempotency-conflict', 'Concurrent saga fingerprint differs.');
        record = raced;
      }
    }

    if (record.state === 'prepared' || record.state === 'failed_retryable') {
      record = await this.transition(record, { state: 'fanout_pending', lastError: undefined }, command.createdAt);
    }

    try {
      for (let index = 0; index < record.recipients.length; index += 1) {
        record = await this.processRecipient(record, index, canonical, command);
      }
      const refreshedCanonical = await this.dependencies.resolveCanonical(command);
      assertCanonical(command, refreshedCanonical, maxRecipients);
      if (rootFingerprint(command, refreshedCanonical) !== record.fingerprint) {
        throw new BookHomeworkSagaError('stale-input', 'Canonical publication or roster changed during fan-out.');
      }
      await this.step('visibility-commit', 'all');
      record = await this.transition(record, {
        state: 'committed',
        visibility: 'committed',
        recipients: record.recipients.map((entry) => ({ ...entry, state: 'committed' })),
        lastError: undefined,
      }, command.createdAt);
      return { status: record.state, record };
    } catch (error) {
      if (error instanceof BookHomeworkSagaCrash) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Book Homework saga failed.';
      const latest = await this.dependencies.sagaRepository.read(command.assignmentId, command.ownerId);
      record = latest ?? record;
      record = record.state === 'compensating'
        ? record
        : await this.transition(record, { state: 'compensating', lastError: message }, command.createdAt);
      return this.compensate(record, command);
    }
  }

  private async processRecipient(
    record: BookHomeworkSagaRecord,
    index: number,
    canonical: BookHomeworkSagaCanonicalState,
    command: BookHomeworkSagaCommand,
  ): Promise<BookHomeworkSagaRecord> {
    let entry = record.recipients[index];
    if (entry.state === 'committed' || entry.state === 'retained' || entry.state === 'compensated') return record;
    const manifest = manifestForRecipient(canonical.manifest, entry.recipientId);
    const extensions = canonical.studentExtensions[entry.recipientId] ?? [];
    const authority = await this.ensureAuthority(entry, manifest, canonical, extensions, command, index);
    entry = { ...entry, authorityRevision: authority.revision };
    let next = await this.replaceEntry(record, index, entry, command.createdAt);

    const binding = this.createBinding(entry, canonical, command.createdAt);
    await this.step('delivery-prepare', entry.recipientId);
    const existingDelivery = await this.dependencies.deliveryRepository.readBinding(entry.bindingId);
    if (!existingDelivery) {
      const prepared = await this.dependencies.deliveryRepository.createDraft({
        binding,
        operationId: childOperation(command.operationId, index, 2),
        now: command.createdAt,
      });
      if (!['created', 'replayed'].includes(prepared.status)) {
        throw new BookHomeworkSagaError('delivery-prepare-failed', `Delivery prepare failed: ${prepared.status}.`);
      }
    } else if (existingDelivery.binding.recipient.recipientId !== entry.recipientId
      || existingDelivery.binding.context.contextId !== record.contextId
      || !['draft', 'active'].includes(existingDelivery.status)
      || deliveryContract(existingDelivery.binding) !== deliveryContract(binding)) {
      throw new BookHomeworkSagaError('delivery-conflict', 'Existing Delivery binding crosses the recipient boundary.');
    }
    next = await this.replaceEntry(next, index, { ...entry, state: 'prepared' }, command.createdAt);
    entry = next.recipients[index];

    const currentDelivery = await this.dependencies.deliveryRepository.readBinding(entry.bindingId);
    if (!currentDelivery) throw new BookHomeworkSagaError('delivery-missing', 'Prepared Delivery binding disappeared.');
    if (currentDelivery.status === 'draft') {
      await this.step('delivery-activate', entry.recipientId);
      const activated = await this.dependencies.deliveryRepository.activate({
        bindingId: entry.bindingId,
        expectedRecordRevision: currentDelivery.recordRevision,
        operationId: childOperation(command.operationId, index, 3),
        now: command.createdAt,
      });
      if (!['activated', 'replayed'].includes(activated.status)) {
        throw new BookHomeworkSagaError('delivery-activate-failed', `Delivery activation failed: ${activated.status}.`);
      }
    } else if (currentDelivery.status !== 'active') {
      throw new BookHomeworkSagaError('delivery-conflict', 'Delivery binding is no longer activatable.');
    }
    const activeDelivery = await this.dependencies.deliveryRepository.readBinding(entry.bindingId);
    if (!activeDelivery || activeDelivery.status !== 'active') throw new BookHomeworkSagaError('delivery-missing', 'Active Delivery binding could not be read back.');
    next = await this.replaceEntry(next, index, {
      ...entry,
      state: 'active',
      bindingRevision: activeDelivery.binding.revision,
    }, command.createdAt);
    entry = next.recipients[index];

    const currentAuthority = await this.dependencies.authorityRepository.read(entry.authorityId);
    if (!currentAuthority) throw new BookHomeworkSagaError('authority-missing', 'Prepared authority disappeared.');
    if (currentAuthority.visibility.status === 'prepared') {
      await this.step('authority-commit', entry.recipientId);
      const committed = await this.dependencies.authorityRepository.setVisibility({
        assignmentId: entry.authorityId,
        ownerId: command.ownerId,
        state: 'committed',
        commandId: childId(command.operationId, entry.recipientId, 'authority-commit'),
        idempotencyKey: childId(command.idempotencyKey, entry.recipientId, 'authority-commit'),
        expectedRevision: currentAuthority.revision,
        updatedAt: command.createdAt,
      });
      if (!['committed', 'replayed'].includes(committed.status)) throw new BookHomeworkSagaError('authority-commit-failed', 'Authority commit did not complete.');
    } else if (currentAuthority.visibility.status !== 'committed') {
      throw new BookHomeworkSagaError('authority-conflict', 'Authority is not in a committable state.');
    }
    const committedAuthority = await this.dependencies.authorityRepository.read(entry.authorityId);
    next = await this.replaceEntry(next, index, {
      ...entry,
      state: 'committed',
      authorityRevision: committedAuthority?.revision ?? entry.authorityRevision,
    }, command.createdAt);
    return next;
  }

  private async ensureAuthority(
    entry: BookHomeworkSagaRecipient,
    manifest: BookHomeworkManifest,
    canonical: BookHomeworkSagaCanonicalState,
    extensions: readonly { readonly nodeKey: string; readonly dueAt: string }[],
    command: BookHomeworkSagaCommand,
    index: number,
  ) {
    await this.step('authority-prepare', entry.recipientId);
    let authority = await this.dependencies.authorityRepository.read(entry.authorityId);
    if (!authority) {
      await this.dependencies.authorityRepository.create({
        assignmentId: entry.authorityId,
        ownerId: command.ownerId,
        manifest,
        schedule: canonical.schedule,
        activityPolicies: activityPolicySnapshots(canonical),
        sagaId: command.assignmentId,
        commandId: childId(command.operationId, entry.recipientId, 'authority-create'),
        idempotencyKey: childId(command.idempotencyKey, entry.recipientId, 'authority-create'),
        expectedRevision: 0,
        createdAt: command.createdAt,
      });
      authority = await this.dependencies.authorityRepository.read(entry.authorityId);
    }
    if (!authority
      || authority.assignmentId !== entry.authorityId
      || authority.saga.sagaId !== command.assignmentId
      || authority.ownerId !== command.ownerId
      || authority.bookManifest.context.contextId !== command.assignmentId
      || authority.bookManifest.context.recipientId !== entry.recipientId
      || authority.bookManifest.manifestVersionId !== command.manifestVersionId
      || authority.bookManifest.bindingRevision !== canonical.manifest.bindingRevision
      || stable(authority.bookManifest) !== stable(manifest)
      || stable(authority.activityPolicies) !== stable(activityPolicySnapshots(canonical))
      || authority.visibility.status === 'compensating') {
      throw new BookHomeworkSagaError('authority-conflict', 'Existing authority does not match the canonical recipient record.');
    }
    for (let extensionIndex = 0; extensionIndex < extensions.length; extensionIndex += 1) {
      const extension = extensions[extensionIndex];
      if (authority.studentExtensions[entry.recipientId]?.[extension.nodeKey]?.dueAt === extension.dueAt) continue;
      const updated = await this.dependencies.authorityRepository.updateStudentExtension({
        assignmentId: entry.authorityId,
        ownerId: command.ownerId,
        studentId: entry.recipientId,
        nodeKey: extension.nodeKey,
        dueAt: extension.dueAt,
        commandId: childId(command.operationId, entry.recipientId, `extension-${extensionIndex}`),
        idempotencyKey: childId(command.idempotencyKey, entry.recipientId, `extension-${extensionIndex}`),
        expectedRevision: authority.revision,
        updatedAt: command.createdAt,
      });
      if (!['updated', 'replayed'].includes(updated.status)) throw new BookHomeworkSagaError('authority-extension-failed', 'Authority extension did not persist.');
      authority = await this.dependencies.authorityRepository.read(entry.authorityId);
      if (!authority) throw new BookHomeworkSagaError('authority-missing', 'Authority disappeared after extension.');
    }
    return authority;
  }

  private createBinding(
    entry: BookHomeworkSagaRecipient,
    canonical: BookHomeworkSagaCanonicalState,
    createdAt: string,
  ): BookDeliveryBinding {
    return createBookDeliveryBinding({
      bindingId: entry.bindingId,
      revision: canonical.manifest.bindingRevision,
      status: 'draft',
      recipient: { recipientId: entry.recipientId, recipientKind: 'student' },
      issuer: { ownerId: canonical.ownerId, authorityBoundary: 'book-owner' },
      context: {
        kind: 'homework',
        contextId: canonical.manifest.context.contextId,
        recipientId: entry.recipientId,
        ownerId: canonical.ownerId,
        entitlementBasis: 'assignment',
      },
      publication: canonical.deliveryPublication,
      createdAt,
    });
  }

  private async compensate(
    record: BookHomeworkSagaRecord,
    command: BookHomeworkSagaCommand,
  ): Promise<BookHomeworkSagaResult> {
    let current = record.state === 'compensating'
      ? record
      : await this.transition(record, { state: 'compensating', visibility: 'hidden' }, command.createdAt);
    let retained = false;
    for (let index = 0; index < current.recipients.length; index += 1) {
      const entry = current.recipients[index];
      if (entry.state === 'retained' || entry.state === 'compensated') continue;
      const authority = await this.dependencies.authorityRepository.read(entry.authorityId);
      if (authority?.visibility.status === 'committed') {
        retained = true;
        current = await this.replaceEntry(current, index, { ...entry, state: 'retained', authorityRevision: authority.revision }, command.createdAt);
        continue;
      }
      if (authority?.visibility.status === 'prepared') {
        await this.dependencies.authorityRepository.recover({
          assignmentId: entry.authorityId,
          ownerId: command.ownerId,
          state: 'compensating',
          commandId: childId(command.operationId, entry.recipientId, 'authority-compensate'),
          idempotencyKey: childId(command.idempotencyKey, entry.recipientId, 'authority-compensate'),
          expectedRevision: authority.revision,
          updatedAt: command.createdAt,
        });
      }
      const delivery = await this.dependencies.deliveryRepository.readBinding(entry.bindingId);
      if (delivery?.status === 'active') {
        const revoked = await this.dependencies.deliveryRepository.revoke({
          bindingId: entry.bindingId,
          expectedRecordRevision: delivery.recordRevision,
          expectedCurrentBindingId: entry.bindingId,
          operationId: childOperation(command.operationId, index, 4),
          now: command.createdAt,
        });
        if (!['revoked', 'replayed'].includes(revoked.status)) throw new BookHomeworkSagaError('compensation-failed', 'Active Delivery binding could not be revoked.');
      }
      current = await this.replaceEntry(current, index, {
        ...entry,
        state: 'compensated',
        ...(delivery?.status === 'draft' ? { tombstonedAt: command.createdAt } : {}),
      }, command.createdAt);
    }
    return this.transition(current, {
      state: retained ? 'failed_terminal' : 'compensated',
      visibility: 'hidden',
      lastError: current.lastError,
    }, command.createdAt).then((final) => ({ status: final.state, record: final }));
  }

  private async step(step: BookHomeworkSagaStep, recipientId: string): Promise<void> {
    await this.dependencies.hooks?.beforeStep?.(step, recipientId);
  }

  private async replaceEntry(
    record: BookHomeworkSagaRecord,
    index: number,
    entry: BookHomeworkSagaRecipient,
    updatedAt: string,
  ): Promise<BookHomeworkSagaRecord> {
    return this.transition(record, {
      recipients: record.recipients.map((candidate, candidateIndex) => candidateIndex === index ? entry : candidate),
    }, updatedAt);
  }

  private async transition(
    record: BookHomeworkSagaRecord,
    change: Partial<Pick<BookHomeworkSagaRecord, 'state' | 'visibility' | 'recipients' | 'lastError'>>,
    updatedAt: string,
  ): Promise<BookHomeworkSagaRecord> {
    if (change.state !== undefined) assertBookHomeworkSagaTransition(record.state, change.state);
    const next: BookHomeworkSagaRecord = {
      ...record,
      ...change,
      recipientCount: (change.recipients ?? record.recipients).length,
      committedRecipientCount: (change.recipients ?? record.recipients)
        .filter((entry) => entry.state === 'committed').length,
      revision: record.revision + 1,
      updatedAt,
    };
    assertValidBookHomeworkSagaRecord(next);
    if (!await this.dependencies.sagaRepository.compareAndSet(next, record.revision)) {
      throw new BookHomeworkSagaError('concurrent-resume', 'Saga compare-and-set failed.');
    }
    return next;
  }
}
