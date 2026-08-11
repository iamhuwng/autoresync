export const GENERATED_BOOK_RULE_FRAGMENT_SCHEMA_VERSION = 1 as const;

export type GeneratedBookRulePath = string;

export interface GeneratedBookRuleOperation {
  readonly path: GeneratedBookRulePath;
  readonly rule: string;
  readonly merge: string;
  readonly requiresExistingRule: boolean;
  readonly expression: string;
}

export interface GeneratedBookRuleFragmentOwner {
  readonly ticketId?: string;
  readonly issue?: number;
  readonly serviceIdentity?: string;
  readonly leastPrivilegePaths?: readonly string[];
  readonly generatedRuleLocations: readonly string[];
}

export interface GeneratedBookRuleFragment {
  readonly schemaVersion: typeof GENERATED_BOOK_RULE_FRAGMENT_SCHEMA_VERSION;
  readonly ticketId: string;
  readonly issue?: number;
  readonly status?: string;
  readonly activation?: string;
  readonly backupInventory?: string;
  readonly recoveryLedgerRoot?: string;
  readonly owner: GeneratedBookRuleFragmentOwner;
  readonly operations: readonly GeneratedBookRuleOperation[];
}

export interface GeneratedBookRuleFragmentSource {
  readonly sourcePath?: string;
  readonly id?: string;
  readonly fragment: unknown;
}

export interface GeneratedBookRuleFragmentManifestEntry {
  readonly fragmentId: string;
  readonly sourcePath: string;
  readonly fragment: unknown;
}

export type GeneratedBookRuleFragmentManifest = readonly GeneratedBookRuleFragmentManifestEntry[];

export type GeneratedBookRuleValidationCode =
  | 'malformed-fragment'
  | 'unknown-schema-version'
  | 'empty-expression'
  | 'declared-path-gap'
  | 'duplicate-operation'
  | 'incompatible-merge-semantics'
  | 'ancestor-descendant-conflict'
  | 'required-existing-rule-gap'
  | 'service-identity-gap'
  | 'unsafe-payload-allow'
  | 'non-monotonic-transition'
  | 'duplicate-fragment-id'
  | 'multiple-owners'
  | 'declared-fragment-gap';

export interface GeneratedBookRuleFragmentValidationOptions {
  readonly allowedOwnerLocationGaps?: readonly string[];
  readonly allowedDuplicateLocations?: readonly string[];
}

export interface GeneratedBookRuleFragmentManifestOptions {
  readonly resolveFragment?: (
    fragmentId: string,
  ) => GeneratedBookRuleFragmentValidationOptions | undefined;
}

export class GeneratedBookRuleValidationError extends Error {
  readonly name = 'GeneratedBookRuleValidationError';

  constructor(
    readonly code: GeneratedBookRuleValidationCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`${code}: ${message}`);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const compareDeterministically = (left: string, right: string): number => (
  left === right ? 0 : left < right ? -1 : 1
);

function invalid(
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): never {
  throw new GeneratedBookRuleValidationError('malformed-fragment', message, details);
}

const normalizePath = (path: unknown, context: string): string => {
  if (typeof path !== 'string') {
    invalid(`${context} path must be a string.`);
  }
  if (path === '' || path === '/') return '';
  if (path.startsWith('/') || path.endsWith('/') || path.includes('//')) {
    invalid(`${context} path is not canonical: ${path}.`, { path });
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0
    || segment === '__proto__'
    || segment === 'constructor'
    || segment === 'prototype')) {
    invalid(`${context} path contains an unsafe or empty segment: ${path}.`, { path });
  }
  return path;
};

const normalizeRule = (rule: unknown, context: string): string => {
  if (typeof rule !== 'string' || !/^\.[A-Za-z][A-Za-z0-9_]*$/u.test(rule)) {
    invalid(`${context} rule must be a dot-prefixed RTDB rule name.`, { rule });
  }
  return rule;
};

export const generatedBookRuleLocation = (
  path: unknown,
  rule: unknown,
  context = 'operation',
): string => {
  const normalizedPath = normalizePath(path, context);
  const normalizedRule = normalizeRule(rule, context);
  return normalizedPath === '' ? `/${normalizedRule}` : `${normalizedPath}/${normalizedRule}`;
};

const normalizedDeclaredLocation = (location: unknown, context: string): string => {
  if (typeof location !== 'string' || location.length === 0) {
    invalid(`${context} owner location must be a non-empty string.`, { location });
  }
  const separator = location.lastIndexOf('/');
  if (separator < 0) {
    invalid(`${context} owner location must contain a path and rule.`, { location });
  }
  if (location.startsWith('//')) {
    invalid(`${context} owner location has a non-canonical root representation.`, { location });
  }
  return generatedBookRuleLocation(
    location.slice(0, separator),
    location.slice(separator + 1),
    context,
  );
};

export const normalizeGeneratedBookRuleLocation = (location: unknown, context = 'declared') => (
  normalizedDeclaredLocation(location, context)
);

const uniqueValues = (values: readonly string[]): Set<string> => new Set(values);

const missingValues = (expected: readonly string[], actual: readonly string[]): string[] => {
  const actualSet = uniqueValues(actual);
  return expected.filter((value) => !actualSet.has(value));
};

const extraValues = (actual: readonly string[], expected: readonly string[]): string[] => {
  const expectedSet = uniqueValues(expected);
  return actual.filter((value) => !expectedSet.has(value));
};

const normalizeOperation = (
  value: unknown,
  fragmentId: string,
  index: number,
): GeneratedBookRuleOperation => {
  if (!isRecord(value)) {
    invalid(`Fragment ${fragmentId} operation ${index} must be an object.`, {
      fragmentId,
      index,
    });
  }
  const context = `Fragment ${fragmentId} operation ${index}`;
  const path = normalizePath(value.path, context);
  const rule = normalizeRule(value.rule, context);
  if (typeof value.merge !== 'string' || value.merge.trim().length === 0) {
    invalid(`${context} merge semantics must be a non-empty string.`, {
      fragmentId,
      index,
    });
  }
  if (typeof value.requiresExistingRule !== 'boolean') {
    invalid(`${context} requiresExistingRule must be boolean.`, {
      fragmentId,
      index,
    });
  }
  if (typeof value.expression !== 'string' || value.expression.trim().length === 0) {
    throw new GeneratedBookRuleValidationError(
      'empty-expression',
      `${context} expression must not be empty.`,
      { fragmentId, index },
    );
  }
  return {
    path,
    rule,
    merge: value.merge,
    requiresExistingRule: value.requiresExistingRule,
    expression: value.expression,
  };
};

export const validateGeneratedBookRuleFragment = (
  value: unknown,
  options: GeneratedBookRuleFragmentValidationOptions = {},
): GeneratedBookRuleFragment => {
  if (!isRecord(value)) {
    invalid('Fragment must be an object.');
  }
  if (value.schemaVersion !== GENERATED_BOOK_RULE_FRAGMENT_SCHEMA_VERSION) {
    throw new GeneratedBookRuleValidationError(
      'unknown-schema-version',
      `Expected schemaVersion ${GENERATED_BOOK_RULE_FRAGMENT_SCHEMA_VERSION}.`,
      { schemaVersion: value.schemaVersion },
    );
  }
  if (!isNonEmptyString(value.ticketId)) {
    invalid('Fragment ticketId must be a non-empty string.');
  }
  const fragmentId = value.ticketId;
  if (!isRecord(value.owner)) {
    invalid(`Fragment ${fragmentId} owner must be an object.`, { fragmentId });
  }
  const owner = value.owner;
  if (owner.ticketId !== undefined && owner.ticketId !== fragmentId) {
    invalid(`Fragment ${fragmentId} owner.ticketId must match ticketId.`, {
      fragmentId,
      ownerTicketId: owner.ticketId,
    });
  }
  if (!Array.isArray(owner.generatedRuleLocations)) {
    invalid(`Fragment ${fragmentId} owner.generatedRuleLocations must be an array.`, {
      fragmentId,
    });
  }
  const ownerLocations = owner.generatedRuleLocations.map((location, index) => (
    normalizedDeclaredLocation(location, `Fragment ${fragmentId} owner location ${index}`)
  ));
  const allowedOwnerLocationGaps = (options.allowedOwnerLocationGaps ?? []).map((location, index) => (
    normalizedDeclaredLocation(location, `Fragment ${fragmentId} reconciled owner location ${index}`)
  ));
  const reconciledOwnerLocations = [...new Set([...ownerLocations, ...allowedOwnerLocationGaps])];
  if (new Set(ownerLocations).size !== ownerLocations.length) {
    throw new GeneratedBookRuleValidationError(
      'declared-path-gap',
      `Fragment ${fragmentId} declares an owner location more than once.`,
      { fragmentId },
    );
  }
  if (!Array.isArray(value.operations) || value.operations.length === 0) {
    invalid(`Fragment ${fragmentId} operations must be a non-empty array.`, { fragmentId });
  }
  const operations = value.operations.map((operation, index) => (
    normalizeOperation(operation, fragmentId, index)
  ));
  const operationLocations = operations.map((operation) => generatedBookRuleLocation(
    operation.path,
    operation.rule,
    `Fragment ${fragmentId} operation`,
  ));
  const missingOwnerLocations = missingValues(operationLocations, ownerLocations);
  const extraOwnerLocations = extraValues(reconciledOwnerLocations, operationLocations);
  const unresolvedOwnerLocations = missingOwnerLocations.filter((location) => (
    !allowedOwnerLocationGaps.includes(location)
  ));
  if (unresolvedOwnerLocations.length > 0 || extraOwnerLocations.length > 0) {
    throw new GeneratedBookRuleValidationError(
      'declared-path-gap',
      `Fragment ${fragmentId} owner locations must exactly match operations.`,
      {
        fragmentId,
        missingOwnerLocations: unresolvedOwnerLocations,
        reconciledOwnerLocations: allowedOwnerLocationGaps,
        extraOwnerLocations,
      },
    );
  }
  const firstOperationByLocation = new Map<string, GeneratedBookRuleOperation>();
  const allowedDuplicateLocations = new Set((options.allowedDuplicateLocations ?? []).map((location) => (
    normalizeGeneratedBookRuleLocation(location, `Fragment ${fragmentId} reconciled duplicate`)
  )));
  for (const [index, operation] of operations.entries()) {
    const location = operationLocations[index];
    const first = firstOperationByLocation.get(location);
    if (first) {
      const sameSemantics = first.merge === operation.merge
        && first.requiresExistingRule === operation.requiresExistingRule;
      if (!sameSemantics) {
        if (allowedDuplicateLocations.has(location)) {
          continue;
        }
        throw new GeneratedBookRuleValidationError(
          'incompatible-merge-semantics',
          `Fragment ${fragmentId} declares incompatible merge semantics for ${location}.`,
          { fragmentId, location, firstMerge: first.merge, duplicateMerge: operation.merge },
        );
      }
      if (allowedDuplicateLocations.has(location)) continue;
      throw new GeneratedBookRuleValidationError(
        'duplicate-operation',
        `Fragment ${fragmentId} declares duplicate path+rule operation ${location}.`,
        { fragmentId, location },
      );
    }
    firstOperationByLocation.set(location, operation);
  }
  return {
    schemaVersion: GENERATED_BOOK_RULE_FRAGMENT_SCHEMA_VERSION,
    ticketId: fragmentId,
    ...(typeof value.issue === 'number' ? { issue: value.issue } : {}),
    ...(typeof value.status === 'string' ? { status: value.status } : {}),
    ...(typeof value.activation === 'string' ? { activation: value.activation } : {}),
    ...(typeof value.backupInventory === 'string' ? { backupInventory: value.backupInventory } : {}),
    ...(typeof value.recoveryLedgerRoot === 'string' ? { recoveryLedgerRoot: value.recoveryLedgerRoot } : {}),
    owner: {
      ...(typeof owner.ticketId === 'string' ? { ticketId: owner.ticketId } : {}),
      ...(typeof owner.issue === 'number' ? { issue: owner.issue } : {}),
      ...(typeof owner.serviceIdentity === 'string' ? { serviceIdentity: owner.serviceIdentity } : {}),
      ...(Array.isArray(owner.leastPrivilegePaths)
        ? { leastPrivilegePaths: Object.freeze([...owner.leastPrivilegePaths]) }
        : {}),
      generatedRuleLocations: Object.freeze([...reconciledOwnerLocations]),
    },
    operations: Object.freeze(operations),
  };
};

const sourceParts = (
  input: GeneratedBookRuleFragmentSource | unknown,
): { readonly sourcePath: string; readonly fragment: unknown } => {
  if (isRecord(input) && Object.hasOwn(input, 'fragment')) {
    const sourcePath = input.sourcePath ?? input.id;
    if (sourcePath !== undefined && typeof sourcePath !== 'string') {
      invalid('Fragment sourcePath/id must be a string when provided.');
    }
    return {
      sourcePath: sourcePath ?? '',
      fragment: input.fragment,
    };
  }
  return { sourcePath: '', fragment: input };
};

const manifestEntryId = (fragment: unknown): string => (
  isRecord(fragment) && typeof fragment.ticketId === 'string' ? fragment.ticketId : ''
);

/**
 * Discover a stable manifest from caller-supplied sources. Discovery is pure:
 * it does not read or write the filesystem and defers strict validation to the
 * composer so incomplete producer fragments remain inspectable.
 */
export const discoverGeneratedBookRuleFragmentManifest = (
  inputs: readonly (GeneratedBookRuleFragmentSource | unknown)[],
): GeneratedBookRuleFragmentManifest => {
  const entries = inputs.map((input) => {
    const source = sourceParts(input);
    return {
      fragmentId: manifestEntryId(source.fragment),
      sourcePath: source.sourcePath,
      fragment: source.fragment,
    };
  });
  entries.sort((left, right) => (
    compareDeterministically(left.fragmentId, right.fragmentId)
    || compareDeterministically(left.sourcePath, right.sourcePath)
  ));
  const manifest = Object.freeze(entries.map((entry) => Object.freeze(entry)));
  ensureUniqueFragmentIds(manifest);
  return manifest;
};

const ensureUniqueFragmentIds = (
  entries: GeneratedBookRuleFragmentManifest,
): void => {
  const seen = new Map<string, GeneratedBookRuleFragmentManifestEntry>();
  for (const entry of entries) {
    if (entry.fragmentId !== '' && seen.has(entry.fragmentId)) {
      throw new GeneratedBookRuleValidationError(
        'duplicate-fragment-id',
        `Fragment id ${entry.fragmentId || '(missing)'} occurs more than once.`,
        {
          fragmentId: entry.fragmentId,
          firstSourcePath: seen.get(entry.fragmentId)?.sourcePath,
          duplicateSourcePath: entry.sourcePath,
        },
      );
    }
    seen.set(entry.fragmentId, entry);
  }
};

/**
 * Create a strict, validated manifest. Use discovery when a caller needs to
 * inspect ordering before producer completeness is established.
 */
export const createGeneratedBookRuleFragmentManifest = (
  inputs: readonly (GeneratedBookRuleFragmentSource | unknown)[],
  options: GeneratedBookRuleFragmentManifestOptions = {},
): GeneratedBookRuleFragmentManifest => {
  const discovered = discoverGeneratedBookRuleFragmentManifest(inputs);
  const validated = discovered.map((entry) => {
    const fragment = validateGeneratedBookRuleFragment(
      entry.fragment,
      options.resolveFragment?.(entry.fragmentId) ?? {},
    );
    return {
      ...entry,
      fragment,
      fragmentId: fragment.ticketId,
    };
  });
  const manifest = Object.freeze(validated.map((entry) => Object.freeze(entry)));
  ensureUniqueFragmentIds(manifest);
  return manifest;
};

export const validateGeneratedBookRuleFragmentManifest = (
  manifest: GeneratedBookRuleFragmentManifest,
  options: GeneratedBookRuleFragmentManifestOptions = {},
): GeneratedBookRuleFragmentManifest => {
  if (!Array.isArray(manifest)) {
    invalid('Manifest must be an array.');
  }
  const normalized = manifest.map((entry) => {
    if (!isRecord(entry) || typeof entry.sourcePath !== 'string') {
      invalid('Manifest entries must contain a string sourcePath.');
    }
    const fragment = validateGeneratedBookRuleFragment(
      entry.fragment,
      options.resolveFragment?.(entry.fragmentId) ?? {},
    );
    if (entry.fragmentId !== fragment.ticketId) {
      invalid(`Manifest fragmentId ${entry.fragmentId} does not match fragment ticketId ${fragment.ticketId}.`, {
        fragmentId: entry.fragmentId,
        ticketId: fragment.ticketId,
      });
    }
    return Object.freeze({
      fragmentId: fragment.ticketId,
      sourcePath: entry.sourcePath,
      fragment,
    });
  });
  const sorted = [...normalized].sort((left, right) => (
    compareDeterministically(left.fragmentId, right.fragmentId)
    || compareDeterministically(left.sourcePath, right.sourcePath)
  ));
  ensureUniqueFragmentIds(sorted);
  return Object.freeze(sorted);
};

export const createGeneratedFragmentManifest = createGeneratedBookRuleFragmentManifest;
export const discoverGeneratedFragmentManifest = discoverGeneratedBookRuleFragmentManifest;
export const validateGeneratedFragmentManifest = validateGeneratedBookRuleFragmentManifest;
