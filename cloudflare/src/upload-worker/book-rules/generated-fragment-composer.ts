import {
  createGeneratedBookRuleFragmentManifest,
  discoverGeneratedBookRuleFragmentManifest,
  generatedBookRuleLocation,
  normalizeGeneratedBookRuleLocation,
  validateGeneratedBookRuleFragment,
  validateGeneratedBookRuleFragmentManifest,
  type GeneratedBookRuleFragmentManifest,
  type GeneratedBookRuleFragmentManifestEntry,
  type GeneratedBookRuleOperation,
  type GeneratedBookRuleValidationCode,
  GeneratedBookRuleValidationError,
} from './generated-fragment-manifest.ts';

export interface GeneratedBookRuleCompositionOptions {
  readonly requiredFragmentIds?: readonly string[];
  readonly requiredLocations?: readonly string[];
}

export interface ComposedGeneratedBookRuleOperation extends GeneratedBookRuleOperation {
  readonly fragmentId: string;
  readonly location: string;
}

export interface GeneratedBookRulesCandidate {
  readonly kind: 'generated-book-rules-candidate';
  readonly schemaVersion: 1;
  readonly fragmentIds: readonly string[];
  readonly operations: readonly ComposedGeneratedBookRuleOperation[];
  readonly byLocation: Readonly<Record<string, ComposedGeneratedBookRuleOperation>>;
  readonly rules: Readonly<Record<string, unknown>>;
}

type CompositionInput = unknown;

const compareDeterministically = (left: string, right: string): number => (
  left === right ? 0 : left < right ? -1 : 1
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const fail = (
  code: GeneratedBookRuleValidationCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): never => {
  throw new GeneratedBookRuleValidationError(code, message, details);
};

const isManifestEntry = (value: unknown): value is GeneratedBookRuleFragmentManifestEntry => (
  isRecord(value)
  && typeof value.fragmentId === 'string'
  && typeof value.sourcePath === 'string'
  && Object.hasOwn(value, 'fragment')
);

const toValidatedManifest = (
  input: readonly CompositionInput[] | GeneratedBookRuleFragmentManifest,
): GeneratedBookRuleFragmentManifest => {
  if (input.length === 0) {
    fail('declared-fragment-gap', 'Cannot compose an empty fragment manifest.');
  }
  if (input.every((entry) => isManifestEntry(entry))) {
    return validateGeneratedBookRuleFragmentManifest(input as GeneratedBookRuleFragmentManifest);
  }
  return createGeneratedBookRuleFragmentManifest(input);
};

const validateRequiredValues = (
  values: readonly string[] | undefined,
  label: string,
): string[] => {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
    fail('malformed-fragment', `${label} must contain non-empty strings.`);
  }
  const normalized = values.map((value) => value.trim());
  if (new Set(normalized).size !== normalized.length) {
    fail('declared-path-gap', `${label} must not contain duplicate declarations.`, { label });
  }
  return normalized;
};

const validateRequiredFragmentIds = (
  manifest: GeneratedBookRuleFragmentManifest,
  requiredFragmentIds: readonly string[] | undefined,
): void => {
  const required = validateRequiredValues(requiredFragmentIds, 'requiredFragmentIds');
  const actual = new Set(manifest.map((entry) => entry.fragmentId));
  const missing = required.filter((fragmentId) => !actual.has(fragmentId));
  if (missing.length > 0) {
    throw new GeneratedBookRuleValidationError(
      'declared-fragment-gap',
      `Required fragment ids are missing: ${missing.join(', ')}.`,
      { missingFragmentIds: missing },
    );
  }
};

const validateRequiredLocations = (
  operations: readonly ComposedGeneratedBookRuleOperation[],
  requiredLocations: readonly string[] | undefined,
): void => {
  if (requiredLocations === undefined) return;
  const required = validateRequiredValues(requiredLocations, 'requiredLocations').map((location) => (
    normalizeGeneratedBookRuleLocation(location, 'required location')
  ));
  const actual = new Set(operations.map((operation) => operation.location));
  const missing = required.filter((location) => !actual.has(location));
  if (missing.length > 0) {
    throw new GeneratedBookRuleValidationError(
      'declared-path-gap',
      `Required rule locations are missing: ${missing.join(', ')}.`,
      { missingLocations: missing },
    );
  }
};

const ACCESS_RULES = new Set(['.read', '.write']);

const pathSegments = (path: string): readonly string[] => (
  path === '' ? [] : path.split('/')
);

const isStrictAncestorPath = (ancestor: string, descendant: string): boolean => {
  const ancestorSegments = pathSegments(ancestor);
  const descendantSegments = pathSegments(descendant);
  return ancestorSegments.length < descendantSegments.length
    && ancestorSegments.every((segment, index) => segment === descendantSegments[index]);
};

const isExplicitDeny = (operation: ComposedGeneratedBookRuleOperation): boolean => (
  operation.expression.trim() === 'false'
);

const isPermissiveFallback = (operation: ComposedGeneratedBookRuleOperation): boolean => {
  const expression = operation.expression.trim();
  return expression === 'true' || /^auth\s*==\s*null\s*\|\|/u.test(expression);
};

/**
 * RTDB access grants from an ancestor are additive. A descendant literal deny
 * therefore cannot revoke an ancestor grant. A literal ancestor deny may still
 * coexist with a narrower descendant grant, which is a normal least-privilege
 * pattern. Only literal decisions are checked here; arbitrary RTDB expressions
 * remain producer owned and are not guessed at by the composer.
 */
const validateAncestorConflicts = (
  operations: readonly ComposedGeneratedBookRuleOperation[],
): void => {
  for (let leftIndex = 0; leftIndex < operations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < operations.length; rightIndex += 1) {
      const left = operations[leftIndex];
      const right = operations[rightIndex];
      if (left.rule !== right.rule || !ACCESS_RULES.has(left.rule)) continue;

      const ancestor = isStrictAncestorPath(left.path, right.path) ? left
        : isStrictAncestorPath(right.path, left.path) ? right
          : undefined;
      const descendant = ancestor === left ? right : ancestor === right ? left : undefined;
      if (!ancestor || !descendant) continue;

      const ancestorDenied = isExplicitDeny(ancestor);
      const descendantDenied = isExplicitDeny(descendant);
      if (ancestorDenied || !descendantDenied) continue;

      throw new GeneratedBookRuleValidationError(
        'ancestor-descendant-conflict',
        `Access rule ${descendant.location} conflicts with ancestor ${ancestor.location}.`,
        {
          reason: 'descendant-deny-cannot-revoke-ancestor',
          rule: ancestor.rule,
          ancestorFragmentId: ancestor.fragmentId,
          ancestorLocation: ancestor.location,
          descendantFragmentId: descendant.fragmentId,
          descendantLocation: descendant.location,
          ancestorIsExplicitDeny: ancestorDenied,
          descendantIsExplicitDeny: descendantDenied,
          ancestorIsPermissiveFallback: isPermissiveFallback(ancestor),
          descendantIsPermissiveFallback: isPermissiveFallback(descendant),
        },
      );
    }
  }
};

const validateOperationConflicts = (
  manifest: GeneratedBookRuleFragmentManifest,
): ComposedGeneratedBookRuleOperation[] => {
  const byLocation = new Map<string, ComposedGeneratedBookRuleOperation>();
  const operations: ComposedGeneratedBookRuleOperation[] = [];
  for (const entry of manifest) {
    const fragment = validateGeneratedBookRuleFragment(entry.fragment);
    for (const operation of fragment.operations) {
      const location = generatedBookRuleLocation(
        operation.path,
        operation.rule,
        `Fragment ${fragment.ticketId} operation`,
      );
      const composed = {
        ...operation,
        fragmentId: fragment.ticketId,
        location,
      };
      const existing = byLocation.get(location);
      if (existing) {
        const sameSemantics = existing.merge === composed.merge
          && existing.requiresExistingRule === composed.requiresExistingRule;
        if (!sameSemantics) {
          throw new GeneratedBookRuleValidationError(
            'incompatible-merge-semantics',
            `Rule location ${location} has incompatible merge semantics from ${existing.fragmentId} and ${composed.fragmentId}.`,
            {
              location,
              firstFragmentId: existing.fragmentId,
              duplicateFragmentId: composed.fragmentId,
              firstMerge: existing.merge,
              duplicateMerge: composed.merge,
            },
          );
        }
        throw new GeneratedBookRuleValidationError(
          'duplicate-operation',
          `Rule location ${location} is declared more than once.`,
          {
            location,
            firstFragmentId: existing.fragmentId,
            duplicateFragmentId: composed.fragmentId,
          },
        );
      }
      byLocation.set(location, composed);
      operations.push(composed);
    }
  }
  validateAncestorConflicts(operations);
  return operations.sort((left, right) => (
    compareDeterministically(left.location, right.location)
    || compareDeterministically(left.fragmentId, right.fragmentId)
  ));
};

const assignRule = (
  root: Record<string, unknown>,
  operation: ComposedGeneratedBookRuleOperation,
): void => {
  const segments = operation.path === '' ? [] : operation.path.split('/');
  let current = root;
  for (const segment of segments) {
    const existing = current[segment];
    if (existing === undefined) {
      const child: Record<string, unknown> = {};
      current[segment] = child;
      current = child;
    } else if (isRecord(existing)) {
      current = existing;
    } else {
      fail(
        'incompatible-merge-semantics',
        `Rule path ${operation.path} crosses an existing scalar candidate value.`,
        { path: operation.path, location: operation.location },
      );
    }
  }
  if (Object.hasOwn(current, operation.rule)) {
    fail(
      'duplicate-operation',
      `Rule location ${operation.location} is already present in the candidate.`,
      { location: operation.location },
    );
  }
  current[operation.rule] = operation.expression;
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
};

/**
 * Compose validated producer fragments into an in-memory candidate. This
 * function has no filesystem, Firebase, Wrangler, or deployment side effect.
 */
export const composeGeneratedBookRules = (
  input: readonly CompositionInput[] | GeneratedBookRuleFragmentManifest,
  options: GeneratedBookRuleCompositionOptions = {},
): GeneratedBookRulesCandidate => {
  const manifest = toValidatedManifest(input);
  validateRequiredFragmentIds(manifest, options.requiredFragmentIds);
  const operations = validateOperationConflicts(manifest);
  validateRequiredLocations(operations, options.requiredLocations);

  const rules: Record<string, unknown> = {};
  const byLocation: Record<string, ComposedGeneratedBookRuleOperation> = {};
  for (const operation of operations) {
    assignRule(rules, operation);
    byLocation[operation.location] = operation;
  }

  return deepFreeze({
    kind: 'generated-book-rules-candidate' as const,
    schemaVersion: 1 as const,
    fragmentIds: manifest.map((entry) => entry.fragmentId),
    operations,
    byLocation,
    rules,
  });
};

export const composeGeneratedFragmentCandidate = composeGeneratedBookRules;
export const composeBookRuleFragments = composeGeneratedBookRules;
export { discoverGeneratedBookRuleFragmentManifest };
