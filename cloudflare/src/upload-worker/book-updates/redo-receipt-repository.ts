import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';

export const BOOK_REDO_PHASE_RECEIPTS_ROOT = 'book_update_action_recovery/redo_receipts';
export const BOOK_REDO_PHASES = Object.freeze([
  'checkpoint',
  'binding',
  'redo-exclusion',
  'completion',
  'audit',
] as const);
export type BookRedoPhase = typeof BOOK_REDO_PHASES[number];

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_FINGERPRINT_LENGTH = 4096;

export interface BookRedoReceiptIdentity {
  readonly ownerId: string;
  readonly actionId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
}

export interface BookRedoPhaseReference {
  readonly checkpointId?: string;
  readonly bindingId?: string;
  readonly bindingRevision?: number;
  readonly completionStatus?: 'in-progress' | 'completed';
  readonly visibility?: 'new';
}

export interface BookRedoPhaseReceipt {
  readonly status: 'pending' | 'succeeded';
  readonly fingerprint: string | null;
  readonly reference?: BookRedoPhaseReference;
  readonly completedAt?: string;
}

export interface BookRedoRecipientReceipt extends BookRedoReceiptIdentity {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly phases: Readonly<Record<BookRedoPhase, BookRedoPhaseReceipt>>;
  readonly updatedAt: string;
}

export interface BookRedoPhaseReceiptRepository {
  read(identity: BookRedoReceiptIdentity): Promise<BookRedoRecipientReceipt | null>;
  compareAndSet(input: {
    readonly identity: BookRedoReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookRedoRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookRedoRecipientReceipt }>;
}

export type BookRedoPhaseAdvanceResult =
  | { readonly status: 'applied' | 'replayed'; readonly receipt: BookRedoRecipientReceipt }
  | { readonly status: 'conflict'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
    .join(',')}}`;
};

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const validIdentity = (identity: BookRedoReceiptIdentity): boolean => (
  validId(identity.ownerId)
  && validId(identity.actionId)
  && validId(identity.bookId)
  && validId(identity.contextKey)
  && validId(identity.contextId)
  && validId(identity.studentId)
);

const phaseTemplate = (): Readonly<Record<BookRedoPhase, BookRedoPhaseReceipt>> => (
  Object.freeze(Object.fromEntries(BOOK_REDO_PHASES.map((phase) => [phase, {
    status: 'pending' as const,
    fingerprint: null,
  }])) as Record<BookRedoPhase, BookRedoPhaseReceipt>)
);

export const createBookRedoRecipientReceipt = (
  identity: BookRedoReceiptIdentity,
  updatedAt: string,
): BookRedoRecipientReceipt => ({
  schemaVersion: 1,
  ...clone(identity),
  revision: 0,
  phases: phaseTemplate(),
  updatedAt,
});

export const bookRedoPhaseFingerprint = (value: unknown): string => {
  const fingerprint = stable(value);
  if (fingerprint.length === 0 || fingerprint.length > MAX_FINGERPRINT_LENGTH) {
    throw new Error('redo_phase_fingerprint_invalid');
  }
  return fingerprint;
};

const sameIdentity = (left: BookRedoReceiptIdentity, right: BookRedoReceiptIdentity): boolean => (
  left.ownerId === right.ownerId
  && left.actionId === right.actionId
  && left.bookId === right.bookId
  && left.contextKey === right.contextKey
  && left.contextId === right.contextId
  && left.studentId === right.studentId
);

const validReceipt = (value: unknown, identity: BookRedoReceiptIdentity): value is BookRedoRecipientReceipt => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  if (receipt.schemaVersion !== 1
    || !validIdentity(identity)
    || !sameIdentity(receipt as unknown as BookRedoReceiptIdentity, identity)
    || !Number.isSafeInteger(receipt.revision)
    || (receipt.revision as number) < 0
    || typeof receipt.updatedAt !== 'string'
    || receipt.phases === null
    || typeof receipt.phases !== 'object'
    || Array.isArray(receipt.phases)) return false;
  const phases = receipt.phases as Record<string, unknown>;
  return BOOK_REDO_PHASES.every((phase) => {
    const phaseValue = phases[phase];
    if (phaseValue === null || typeof phaseValue !== 'object' || Array.isArray(phaseValue)) return false;
    const phaseRecord = phaseValue as Record<string, unknown>;
    return (phaseRecord.status === 'pending' || phaseRecord.status === 'succeeded')
      && (phaseRecord.fingerprint === null
        || (typeof phaseRecord.fingerprint === 'string' && phaseRecord.fingerprint.length <= MAX_FINGERPRINT_LENGTH));
  });
};

export const recordBookRedoPhaseSuccess = async (input: {
  readonly repository: BookRedoPhaseReceiptRepository;
  readonly identity: BookRedoReceiptIdentity;
  readonly phase: BookRedoPhase;
  readonly fingerprint: string;
  readonly reference?: BookRedoPhaseReference;
  readonly at: string;
}): Promise<BookRedoPhaseAdvanceResult> => {
  if (!BOOK_REDO_PHASES.includes(input.phase)
    || !validIdentity(input.identity)
    || input.fingerprint.length === 0
    || input.fingerprint.length > MAX_FINGERPRINT_LENGTH
    || !Number.isFinite(Date.parse(input.at))) {
    return { status: 'conflict', code: 'redo-phase-input-invalid' };
  }
  const current = await input.repository.read(input.identity);
  if (current) {
    if (!validReceipt(current, input.identity)) return { status: 'conflict', code: 'redo-receipt-invalid' };
    const phase = current.phases[input.phase];
    if (phase.status === 'succeeded') {
      return phase.fingerprint === input.fingerprint
        ? { status: 'replayed', receipt: clone(current) }
        : { status: 'conflict', code: 'redo-phase-fingerprint-conflict' };
    }
    const receipt: BookRedoRecipientReceipt = {
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
      : { status: 'conflict', code: 'redo-receipt-cas-conflict' };
  }
  const receipt = createBookRedoRecipientReceipt(input.identity, input.at);
  const first: BookRedoRecipientReceipt = {
    ...receipt,
    revision: 1,
    phases: {
      ...receipt.phases,
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
    : { status: 'conflict', code: 'redo-receipt-create-conflict' };
};

export class InMemoryBookRedoPhaseReceiptRepository implements BookRedoPhaseReceiptRepository {
  private readonly records = new Map<string, BookRedoRecipientReceipt>();

  async read(identity: BookRedoReceiptIdentity): Promise<BookRedoRecipientReceipt | null> {
    if (!validIdentity(identity)) return null;
    return clone(this.records.get(this.key(identity)) ?? null);
  }

  async compareAndSet(input: {
    readonly identity: BookRedoReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookRedoRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookRedoRecipientReceipt }> {
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

  private key(identity: BookRedoReceiptIdentity): string {
    return [identity.ownerId, identity.actionId, identity.contextKey, identity.contextId, identity.studentId].join('\u0000');
  }
}

export interface BookRedoPhaseReceiptRepositoryEnv extends RepositoryEnv {
  BOOK_REDO_SERVICE_IDENTITY?: string;
  BOOK_REDO_GOOGLE_SA_KEY?: string;
}

interface ReceiptRoot {
  receipts?: Record<string, Record<string, Record<string, Record<string, Record<string, BookRedoRecipientReceipt>>>>>;
  readonly [key: string]: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const rootFrom = (value: unknown): ReceiptRoot => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw new Error('invalid_book_redo_receipt_root');
  return structuredClone(value) as ReceiptRoot;
};

const keyPart = (value: string): string => encodeURIComponent(value);

export class FirebaseRestBookRedoPhaseReceiptRepository implements BookRedoPhaseReceiptRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: BookRedoPhaseReceiptRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_REDO_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_redo_service_identity');
    const keyJson = (options.env.BOOK_REDO_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
    if (!keyJson) throw new Error('missing_book_redo_google_sa_key');
    let clientEmail: unknown;
    try {
      clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
    } catch {
      throw new Error('invalid_book_redo_google_sa_key');
    }
    if (clientEmail !== identity) throw new Error('book_redo_service_identity_mismatch');
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async read(identity: BookRedoReceiptIdentity): Promise<BookRedoRecipientReceipt | null> {
    if (!validIdentity(identity)) return null;
    const value = await this.rtdb.readValue(this.receiptPath(identity));
    return validReceipt(value, identity) ? clone(value) : null;
  }

  async compareAndSet(input: {
    readonly identity: BookRedoReceiptIdentity;
    readonly expectedRevision: number | null;
    readonly receipt: BookRedoRecipientReceipt;
  }): Promise<{ readonly status: 'advanced' | 'conflict'; readonly receipt?: BookRedoRecipientReceipt }> {
    if (!validIdentity(input.identity) || !validReceipt(input.receipt, input.identity)) return { status: 'conflict' };
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(BOOK_REDO_PHASE_RECEIPTS_ROOT);
      const root = rootFrom(current.data);
      const existing = root.receipts?.[keyPart(input.identity.ownerId)]?.[keyPart(input.identity.actionId)]
        ?.[keyPart(input.identity.contextKey)]?.[keyPart(input.identity.contextId)]
        ?.[keyPart(input.identity.studentId)];
      if (input.expectedRevision === null
        ? existing !== undefined
        : !existing || existing.revision !== input.expectedRevision) {
        return { status: 'conflict' };
      }
      root.receipts ??= {};
      root.receipts[keyPart(input.identity.ownerId)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)]![keyPart(input.identity.contextKey)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)]![keyPart(input.identity.contextKey)]![keyPart(input.identity.contextId)] ??= {};
      root.receipts[keyPart(input.identity.ownerId)]![keyPart(input.identity.actionId)]![keyPart(input.identity.contextKey)]![keyPart(input.identity.contextId)]![keyPart(input.identity.studentId)] = clone(input.receipt);
      if (await this.rtdb.writeIfMatch(BOOK_REDO_PHASE_RECEIPTS_ROOT, root, current.etag)) {
        return { status: 'advanced', receipt: clone(input.receipt) };
      }
    }
    return { status: 'conflict' };
  }

  private receiptPath(identity: BookRedoReceiptIdentity): string {
    return `${BOOK_REDO_PHASE_RECEIPTS_ROOT}/${keyPart(identity.ownerId)}/${keyPart(identity.actionId)}/${keyPart(identity.contextKey)}/${keyPart(identity.contextId)}/${keyPart(identity.studentId)}`;
  }
}
