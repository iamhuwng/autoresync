import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

export const BOOK_ADDITION_RECEIPTS_ROOT = 'book_update_action_recovery/addition_receipts';
export const BOOK_ADDITION_PHASES = Object.freeze([
  'deadline',
  'projection',
  'completion',
  'audit',
] as const);
export type BookAdditionPhase = typeof BOOK_ADDITION_PHASES[number];

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_FINGERPRINT_LENGTH = 4096;

export interface BookAdditionReceiptIdentity {
  readonly ownerId: string;
  readonly actionId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
}

export interface BookAdditionPhaseReference {
  readonly bindingId?: string;
  readonly bindingRevision?: number;
  readonly completionStatus?: 'in-progress' | 'completed';
  readonly deadlineAt?: string;
  readonly requiresReplacementDeadline?: boolean;
}

export interface BookAdditionPhaseReceipt {
  readonly status: 'pending' | 'succeeded';
  readonly fingerprint: string | null;
  readonly reference?: BookAdditionPhaseReference;
  readonly completedAt?: string;
}

export interface BookAdditionRecipientReceipt extends BookAdditionReceiptIdentity {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly phases: Readonly<Record<BookAdditionPhase, BookAdditionPhaseReceipt>>;
  readonly updatedAt: string;
}

export interface BookAdditionPhaseReceiptRepository {
  read(identity: BookAdditionReceiptIdentity): Promise<BookAdditionRecipientReceipt | null>;
  compareAndSet(input: {
    readonly identity: BookAdditionReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookAdditionRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookAdditionRecipientReceipt }>;
}

export type BookAdditionPhaseAdvanceResult =
  | { readonly status: 'applied' | 'replayed'; readonly receipt: BookAdditionRecipientReceipt }
  | { readonly status: 'conflict'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validIso = (value: unknown): value is string => (
  typeof value === 'string'
  && ISO.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
);

const validIdentity = (identity: unknown): identity is BookAdditionReceiptIdentity => (
  record(identity)
  && validId(identity.ownerId)
  && validId(identity.actionId)
  && validId(identity.bookId)
  && validId(identity.contextKey)
  && validId(identity.contextId)
  && validId(identity.studentId)
  && identity.contextKey === `homework:${identity.contextId}`
);

const phaseTemplate = (): Readonly<Record<BookAdditionPhase, BookAdditionPhaseReceipt>> => (
  Object.freeze(Object.fromEntries(BOOK_ADDITION_PHASES.map((phase) => [phase, {
    status: 'pending' as const,
    fingerprint: null,
  }])) as Record<BookAdditionPhase, BookAdditionPhaseReceipt>)
);

export const createBookAdditionRecipientReceipt = (
  identity: BookAdditionReceiptIdentity,
  updatedAt: string,
): BookAdditionRecipientReceipt => ({
  schemaVersion: 1,
  ...clone(identity),
  revision: 0,
  phases: phaseTemplate(),
  updatedAt,
});

export const bookAdditionPhaseFingerprint = (value: unknown): string => {
  const stable = (candidate: unknown): string => {
    if (candidate === null || typeof candidate !== 'object') return JSON.stringify(candidate) ?? 'undefined';
    if (Array.isArray(candidate)) return `[${candidate.map(stable).join(',')}]`;
    return `{${Object.entries(candidate as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  };
  const fingerprint = stable(value);
  if (fingerprint.length === 0 || fingerprint.length > MAX_FINGERPRINT_LENGTH) {
    throw new Error('addition_phase_fingerprint_invalid');
  }
  return fingerprint;
};

const sameIdentity = (left: BookAdditionReceiptIdentity, right: BookAdditionReceiptIdentity): boolean => (
  left.ownerId === right.ownerId
  && left.actionId === right.actionId
  && left.bookId === right.bookId
  && left.contextKey === right.contextKey
  && left.contextId === right.contextId
  && left.studentId === right.studentId
);

const validReference = (value: unknown): value is BookAdditionPhaseReference => {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return (reference.bindingId === undefined || validId(reference.bindingId))
    && (reference.bindingRevision === undefined || (Number.isSafeInteger(reference.bindingRevision) && Number(reference.bindingRevision) > 0))
    && (reference.completionStatus === undefined || reference.completionStatus === 'in-progress' || reference.completionStatus === 'completed')
    && (reference.deadlineAt === undefined || validIso(reference.deadlineAt))
    && (reference.requiresReplacementDeadline === undefined || typeof reference.requiresReplacementDeadline === 'boolean');
};

const validReceipt = (
  value: unknown,
  identity: BookAdditionReceiptIdentity,
): value is BookAdditionRecipientReceipt => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  if (receipt.schemaVersion !== 1
    || !validIdentity(identity)
    || !sameIdentity(receipt as unknown as BookAdditionReceiptIdentity, identity)
    || !Number.isSafeInteger(receipt.revision)
    || Number(receipt.revision) < 0
    || !validIso(receipt.updatedAt)
    || receipt.phases === null
    || typeof receipt.phases !== 'object'
    || Array.isArray(receipt.phases)) return false;
  const phases = receipt.phases as Record<string, unknown>;
  return BOOK_ADDITION_PHASES.every((phase) => {
    const phaseValue = phases[phase];
    if (phaseValue === null || typeof phaseValue !== 'object' || Array.isArray(phaseValue)) return false;
    const phaseRecord = phaseValue as Record<string, unknown>;
    return (phaseRecord.status === 'pending' || phaseRecord.status === 'succeeded')
      && (phaseRecord.fingerprint === null
        || (typeof phaseRecord.fingerprint === 'string' && phaseRecord.fingerprint.length <= MAX_FINGERPRINT_LENGTH))
      && validReference(phaseRecord.reference)
      && (phaseRecord.completedAt === undefined || validIso(phaseRecord.completedAt));
  });
};

export const recordBookAdditionPhaseSuccess = async (input: {
  readonly repository: BookAdditionPhaseReceiptRepository;
  readonly identity: BookAdditionReceiptIdentity;
  readonly phase: BookAdditionPhase;
  readonly fingerprint: string;
  readonly reference?: BookAdditionPhaseReference;
  readonly at: string;
}): Promise<BookAdditionPhaseAdvanceResult> => {
  if (!BOOK_ADDITION_PHASES.includes(input.phase)
    || !validIdentity(input.identity)
    || input.fingerprint.length === 0
    || input.fingerprint.length > MAX_FINGERPRINT_LENGTH
    || !validIso(input.at)
    || !validReference(input.reference)) {
    return { status: 'conflict', code: 'addition-phase-input-invalid' };
  }
  const current = await input.repository.read(input.identity);
  if (current) {
    if (!validReceipt(current, input.identity)) return { status: 'conflict', code: 'addition-receipt-invalid' };
    const phase = current.phases[input.phase];
    if (phase.status === 'succeeded') {
      return phase.fingerprint === input.fingerprint
        ? { status: 'replayed', receipt: clone(current) }
        : { status: 'conflict', code: 'addition-phase-fingerprint-conflict' };
    }
    const receipt: BookAdditionRecipientReceipt = {
      ...clone(current),
      revision: current.revision + 1,
      phases: {
        ...clone(current.phases),
        [input.phase]: {
          status: 'succeeded',
          fingerprint: input.fingerprint,
          ...(input.reference ? { reference: clone(input.reference) } : {}),
          completedAt: input.at,
        },
      },
      updatedAt: input.at,
    };
    const result = await input.repository.compareAndSet({
      identity: input.identity,
      expectedRevision: current.revision,
      receipt,
    });
    if (result.status === 'advanced' && result.receipt) return { status: 'applied', receipt: result.receipt };
    const raced = await input.repository.read(input.identity);
    const racedPhase = raced?.phases[input.phase];
    return raced && racedPhase?.status === 'succeeded' && racedPhase.fingerprint === input.fingerprint
      ? { status: 'replayed', receipt: raced }
      : { status: 'conflict', code: 'addition-receipt-cas-conflict' };
  }
  const base = createBookAdditionRecipientReceipt(input.identity, input.at);
  const first: BookAdditionRecipientReceipt = {
    ...base,
    revision: 1,
    phases: {
      ...base.phases,
      [input.phase]: {
        status: 'succeeded',
        fingerprint: input.fingerprint,
        ...(input.reference ? { reference: clone(input.reference) } : {}),
        completedAt: input.at,
      },
    },
  };
  const result = await input.repository.compareAndSet({
    identity: input.identity,
    expectedRevision: null,
    receipt: first,
  });
  if (result.status === 'advanced' && result.receipt) return { status: 'applied', receipt: result.receipt };
  const raced = await input.repository.read(input.identity);
  const racedPhase = raced?.phases[input.phase];
  return raced && racedPhase?.status === 'succeeded' && racedPhase.fingerprint === input.fingerprint
    ? { status: 'replayed', receipt: raced }
    : { status: 'conflict', code: 'addition-receipt-create-conflict' };
};

export class InMemoryBookAdditionPhaseReceiptRepository implements BookAdditionPhaseReceiptRepository {
  private readonly records = new Map<string, BookAdditionRecipientReceipt>();

  async read(identity: BookAdditionReceiptIdentity): Promise<BookAdditionRecipientReceipt | null> {
    if (!validIdentity(identity)) return null;
    const value = this.records.get(this.key(identity));
    return value ? clone(value) : null;
  }

  async compareAndSet(input: {
    readonly identity: BookAdditionReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookAdditionRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookAdditionRecipientReceipt }> {
    if (!validIdentity(input.identity)
      || !validReceipt(input.receipt, input.identity)
      || input.receipt.revision !== (input.expectedRevision === null ? 1 : input.expectedRevision + 1)) {
      return { status: 'conflict' };
    }
    const key = this.key(input.identity);
    const existing = this.records.get(key);
    if ((input.expectedRevision === null && existing)
      || (input.expectedRevision !== null && (!existing || existing.revision !== input.expectedRevision))) {
      return { status: 'conflict' };
    }
    this.records.set(key, clone(input.receipt));
    return { status: 'advanced', receipt: clone(input.receipt) };
  }

  private key(identity: BookAdditionReceiptIdentity): string {
    return [identity.ownerId, identity.actionId, identity.contextKey, identity.contextId, identity.studentId].join('\u0000');
  }
}

export interface BookAdditionPhaseReceiptRepositoryEnv extends RepositoryEnv {
  BOOK_UPDATE_ADDITION_SERVICE_IDENTITY?: string;
  BOOK_UPDATE_ADDITION_GOOGLE_SA_KEY?: string;
}

const keyPart = (value: string): string => encodeURIComponent(value);

export class FirebaseRestBookAdditionPhaseReceiptRepository implements BookAdditionPhaseReceiptRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: BookAdditionPhaseReceiptRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_UPDATE_ADDITION_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_update_addition_service_identity');
    const keyJson = (options.env.BOOK_UPDATE_ADDITION_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
    if (!keyJson) throw new Error('missing_book_update_addition_google_sa_key');
    let clientEmail: unknown;
    try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch { throw new Error('invalid_book_update_addition_google_sa_key'); }
    if (clientEmail !== identity) throw new Error('book_update_addition_service_identity_mismatch');
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async read(identity: BookAdditionReceiptIdentity): Promise<BookAdditionRecipientReceipt | null> {
    if (!validIdentity(identity)) return null;
    const value = await this.rtdb.readValue(this.path(identity));
    return validReceipt(value, identity) ? clone(value) : null;
  }

  async compareAndSet(input: {
    readonly identity: BookAdditionReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookAdditionRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookAdditionRecipientReceipt }> {
    if (!validIdentity(input.identity) || !validReceipt(input.receipt, input.identity)) return { status: 'conflict' };
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(BOOK_ADDITION_RECEIPTS_ROOT);
      const root = current.data && typeof current.data === 'object' && !Array.isArray(current.data)
        ? structuredClone(current.data) as Record<string, unknown>
        : {};
      const records = (root.records ?? {}) as Record<string, unknown>;
      const owner = (records[keyPart(input.identity.ownerId)] ?? {}) as Record<string, unknown>;
      const action = (owner[keyPart(input.identity.actionId)] ?? {}) as Record<string, unknown>;
      const context = (action[keyPart(input.identity.contextKey)] ?? {}) as Record<string, unknown>;
      const existing = (context[keyPart(input.identity.contextId)] ?? {}) as Record<string, unknown>;
      const currentValue = existing[keyPart(input.identity.studentId)] as unknown;
      if (input.expectedRevision === null
        ? currentValue !== undefined
        : !currentValue || (currentValue as Record<string, unknown>).revision !== input.expectedRevision) return { status: 'conflict' };
      const nextRecords = records;
      const nextOwner = { ...owner };
      const nextAction = { ...action };
      const nextContext = { ...context };
      const nextStudent = { ...existing, [keyPart(input.identity.studentId)]: clone(input.receipt) };
      nextContext[keyPart(input.identity.contextId)] = nextStudent;
      nextAction[keyPart(input.identity.contextKey)] = nextContext;
      nextOwner[keyPart(input.identity.actionId)] = nextAction;
      nextRecords[keyPart(input.identity.ownerId)] = nextOwner;
      root.records = nextRecords;
      if (await this.rtdb.writeIfMatch(BOOK_ADDITION_RECEIPTS_ROOT, root, current.etag)) {
        return { status: 'advanced', receipt: clone(input.receipt) };
      }
    }
    return { status: 'conflict' };
  }

  private path(identity: BookAdditionReceiptIdentity): string {
    return `${BOOK_ADDITION_RECEIPTS_ROOT}/records/${keyPart(identity.ownerId)}/${keyPart(identity.actionId)}/${keyPart(identity.contextKey)}/${keyPart(identity.contextId)}/${keyPart(identity.studentId)}`;
  }
}
