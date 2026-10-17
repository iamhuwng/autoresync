import {
  buildBookRolloutGateAuditPayload,
  evaluateBookRolloutGate,
  type BookRolloutGateAuditPayload,
  type BookRolloutGateDecision,
  type BookRolloutOperation,
} from '../../src/services/book-rollout/bookRolloutGate.policy.ts';

export interface BookRolloutWorkerEnvironment {
  readonly [key: string]: unknown;
}

export interface BookRolloutWorkerGate {
  readonly evaluate: (operation: BookRolloutOperation) => BookRolloutGateDecision;
  readonly assert: (operation: BookRolloutOperation, code?: string) => void;
  readonly create: () => void;
  readonly upload: () => BookRolloutGateDecision;
  readonly publish: () => void;
  readonly assignPlace: () => void;
  readonly launchDelivery: () => void;
  readonly mutation: () => void;
  readonly homeworkMutation: () => void;
}

export class BookRolloutDeniedError extends Error {
  constructor(
    readonly authorization: { readonly decision: BookRolloutGateDecision },
    readonly code = 'book_rollout_unavailable',
    readonly status = 503,
  ) {
    super(code);
    this.name = 'BookRolloutDeniedError';
  }
}

const jsonValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const configFor = (env: BookRolloutWorkerEnvironment): unknown => (
  jsonValue(env.BOOK_ROLLOUT_CONFIG_JSON ?? env.BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON)
);

const environmentFor = (env: BookRolloutWorkerEnvironment): string => (
  typeof (env.BOOK_ROLLOUT_ENVIRONMENT ?? env.BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT) === 'string'
    ? String(env.BOOK_ROLLOUT_ENVIRONMENT ?? env.BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT)
    : 'unknown'
);

const defaultAudit = (payload: BookRolloutGateAuditPayload): void => {
  // The payload is explicitly privacy-safe and excludes all scope identities.
  console.info('book_rollout_gate', payload);
};

export const createBookRolloutWorkerGate = (
  env: BookRolloutWorkerEnvironment,
  options: {
    readonly clock?: () => Date;
    readonly audit?: (payload: BookRolloutGateAuditPayload) => void;
  } = {},
): BookRolloutWorkerGate => {
  const clock = options.clock ?? (() => new Date());
  const audit = options.audit ?? defaultAudit;
  const evaluate = (operation: BookRolloutOperation): BookRolloutGateDecision => {
    const decision = evaluateBookRolloutGate({
      operation,
      expectedEnvironment: environmentFor(env),
      now: clock(),
      configReader: { read: () => configFor(env) },
    });
    audit(buildBookRolloutGateAuditPayload(decision));
    return decision;
  };
  const assert = (operation: BookRolloutOperation, code?: string): void => {
    const decision = evaluate(operation);
    if (!decision.allowed) {
      throw new BookRolloutDeniedError(
        { decision },
        code ?? (operation === 'mutation' ? 'book_activity_rollout_unavailable' : 'book_rollout_unavailable'),
      );
    }
  };
  return Object.freeze({
    evaluate,
    assert,
    create: () => assert('create'),
    upload: () => evaluate('upload'),
    publish: () => assert('publish'),
    assignPlace: () => assert('assign-place'),
    launchDelivery: () => assert('launch-delivery'),
    mutation: () => assert('mutation'),
    homeworkMutation: () => assert('mutation', 'book_activity_rollout_unavailable'),
  });
};

export default createBookRolloutWorkerGate;
