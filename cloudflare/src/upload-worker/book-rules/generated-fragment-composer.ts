import {
  createGeneratedBookRuleFragmentManifest,
  discoverGeneratedBookRuleFragmentManifest,
  generatedBookRuleLocation,
  normalizeGeneratedBookRuleLocation,
  validateGeneratedBookRuleFragment,
  validateGeneratedBookRuleFragmentManifest,
  type GeneratedBookRuleFragment,
  type GeneratedBookRuleFragmentManifest,
  type GeneratedBookRuleFragmentManifestEntry,
  type GeneratedBookRuleFragmentSource,
  type GeneratedBookRuleOperation,
  type GeneratedBookRuleValidationCode,
  GeneratedBookRuleValidationError,
} from './generated-fragment-manifest.ts';

export const FINAL_BOOK_RULE_FRAGMENT_IDS = Object.freeze([
  '04', '08B', '12C', '13A', '16', '16A', '17', '18', '19', '20A',
  '20C', '21', '28A', '29', '33C', '35', '36', '37A', '37B', '38B5',
  '39B', '39C', '40A', '40B', '41B', '41C', '42A', '42B', '43', '44',
  '45', '46A', '46B', '47', '49A', '49B',
] as const);

type OperationRef = Readonly<{
  readonly fragmentId: string;
  readonly operationIndex: number;
}>;

type ConflictResolution = Readonly<{
  readonly kind: 'exact-duplicate' | 'authorization-alternative';
  readonly location: string;
  readonly operations: readonly OperationRef[];
}>;

const ownerLocationGaps: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '16A': [
    'book_activity/versions/$activityId/$versionId/$other/.validate',
    'book_activity/versions/$activityId/$versionId/placementIds/$other/.validate',
    'book_activity/versions/$activityId/$versionId/evidenceRefs/$other/.validate',
    'book_activity/versions/$activityId/$versionId/provenance/$other/.validate',
    'book_activity/versions/$activityId/$versionId/provenance/sourcePublicationBinding/$other/.validate',
    'book_activity/student_safe_projections/$activityId/$versionId/$other/.validate',
    'book_activity/versions/$activityId/$versionId/activity/$field/.validate',
    'book_activity/versions/$activityId/$versionId/activity/$field/$nested/.validate',
    'book_activity/versions/$activityId/$versionId/projection/$field/.validate',
    'book_activity/student_safe_projections/$activityId/$versionId/content/$field/.validate',
  ],
  '28A': [
    'book_runtime/scopes/.read',
    'book_runtime/scopes/.write',
  ],
  '29': [
    'book_result_read_models/students/.read',
    'book_result_read_models/homework/.read',
    'book_result_read_models/details/.read',
    'book_result_read_models/details/$resultId/.write',
    'book_result_read_models/students/$studentId/books/$bookId/group_summaries/.write',
    'book_result_read_models/homework/$homeworkId/students/$studentId/books/$bookId/group_summaries/.write',
  ],
  '40B': [
    'book_update_redo/.read',
    'book_update_redo/.write',
  ],
  '44': [
    'book_activity/canonical_fork_operations/$actorId/$operationId/$other/.validate',
    'book_activity/canonical_fork_operations/$actorId/$operationId/target/$other/.validate',
    'book_activity/canonical_fork_operations/$actorId/$operationId/source/$other/.validate',
    'material_catalog/books/$bookId/$other/.validate',
    'material_catalog/book_nodes/$bookId/$nodeId/$other/.validate',
    'material_catalog/book_nodes/$bookId/$nodeId/materialRefs/$refIndex/$other/.validate',
    'material_catalog/book_indexes/by_owner/$ownerId/$bookId/$other/.validate',
    'material_catalog/book_indexes/by_visibility/$visibility/$bookId/$other/.validate',
    'material_catalog/book_indexes/by_test_type/$testTypeId/$bookId/$other/.validate',
    'material_catalog/material_summary_indexes/v1/by_id/$materialId/$other/.validate',
    'material_catalog/material_summary_indexes/v1/by_owner/$ownerId/$materialId/$other/.validate',
    'material_catalog/material_summary_indexes/v1/by_visibility/$visibility/$materialId/$other/.validate',
    'material_catalog/material_summary_indexes/v1/by_material_kind/$materialKind/$materialId/$other/.validate',
    'material_catalog/material_summary_indexes/v1/by_test_type/$testTypeId/$materialId/$other/.validate',
  ],
});

export const FINAL_BOOK_RULE_CONFLICT_RESOLUTIONS: readonly ConflictResolution[] = Object.freeze([
  {
    kind: 'authorization-alternative',
    location: 'book_activity/versions/$activityId/$versionId/.write',
    operations: [
      { fragmentId: '16A', operationIndex: 29 },
      { fragmentId: '16A', operationIndex: 32 },
    ],
  },
  {
    kind: 'authorization-alternative',
    location: 'book_activity/student_safe_projections/$activityId/$versionId/.write',
    operations: [
      { fragmentId: '16A', operationIndex: 31 },
      { fragmentId: '16A', operationIndex: 33 },
    ],
  },
  {
    kind: 'exact-duplicate',
    location: 'material_catalog/books/.write',
    operations: [
      { fragmentId: '20A', operationIndex: 0 },
      { fragmentId: '44', operationIndex: 16 },
    ],
  },
  {
    kind: 'authorization-alternative',
    location: 'material_catalog/books/$bookId/.write',
    operations: [
      { fragmentId: '20A', operationIndex: 1 },
      { fragmentId: '44', operationIndex: 22 },
    ],
  },
] as const);

const finalFragmentValidationOptions = (fragmentId: string) => ({
  allowedOwnerLocationGaps: ownerLocationGaps[fragmentId],
  allowedDuplicateLocations: FINAL_BOOK_RULE_CONFLICT_RESOLUTIONS
    .filter((resolution) => resolution.operations.some((operation) => operation.fragmentId === fragmentId))
    .filter((resolution) => resolution.operations.filter((operation) => operation.fragmentId === fragmentId).length > 1)
    .map((resolution) => resolution.location),
});

export interface GeneratedBookRuleCompositionOptions {
  readonly requiredFragmentIds?: readonly string[];
  readonly requiredLocations?: readonly string[];
  readonly baseRules?: Readonly<Record<string, unknown>>;
}

export interface ComposedGeneratedBookRuleOperation extends GeneratedBookRuleOperation {
  readonly fragmentId: string;
  readonly operationIndex: number;
  readonly location: string;
  readonly contributors: readonly OperationRef[];
}

export interface GeneratedBookRulesCandidate {
  readonly kind: 'generated-book-rules-candidate';
  readonly schemaVersion: 1;
  readonly fragmentIds: readonly string[];
  readonly operations: readonly ComposedGeneratedBookRuleOperation[];
  readonly byLocation: Readonly<Record<string, ComposedGeneratedBookRuleOperation>>;
  readonly rules: Readonly<Record<string, unknown>>;
}

type CompositionInput = GeneratedBookRuleFragmentSource | unknown;

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
  if (input.length === 0) fail('declared-fragment-gap', 'Cannot compose an empty fragment manifest.');
  const options = { resolveFragment: finalFragmentValidationOptions };
  if (input.every((entry) => isManifestEntry(entry))) {
    return validateGeneratedBookRuleFragmentManifest(input as GeneratedBookRuleFragmentManifest, options);
  }
  return createGeneratedBookRuleFragmentManifest(input, options);
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

const pathSegments = (path: string): readonly string[] => (
  path === '' ? [] : path.split('/')
);

const isStrictAncestorPath = (ancestor: string, descendant: string): boolean => {
  const ancestorSegments = pathSegments(ancestor);
  const descendantSegments = pathSegments(descendant);
  return ancestorSegments.length < descendantSegments.length
    && ancestorSegments.every((segment, index) => segment === descendantSegments[index]);
};

const isExplicitDeny = (operation: { readonly expression: string }): boolean => (
  operation.expression.trim() === 'false'
);

const isPermissiveFallback = (expression: string): boolean => {
  const normalized = expression.trim();
  return normalized === 'true' || /^auth\s*==\s*null\s*\|\|/u.test(normalized);
};

const validateFragmentMetadata = (fragment: GeneratedBookRuleFragment): void => {
  if (fragment.status !== undefined && fragment.status !== 'inactive') {
    fail('malformed-fragment', `Fragment ${fragment.ticketId} has unsupported status.`, {
      fragmentId: fragment.ticketId,
      status: fragment.status,
    });
  }
  if (fragment.status === 'inactive'
    && !['deny-only-until-118-composition', 'deny-only-until-125-reconciliation', 'deny-only-until-126-activation'].includes(fragment.activation ?? '')) {
    fail('malformed-fragment', `Fragment ${fragment.ticketId} has an unsafe activation marker.`, {
      fragmentId: fragment.ticketId,
      activation: fragment.activation,
    });
  }
  const serviceIdentity = fragment.owner.serviceIdentity;
  if (serviceIdentity === undefined) return;
  if (!/^[a-z][a-z0-9_]+$/u.test(serviceIdentity)) {
    fail('service-identity-gap', `Fragment ${fragment.ticketId} has an invalid service identity.`, {
      fragmentId: fragment.ticketId,
      serviceIdentity,
    });
  }
  const leastPrivilegePaths = fragment.owner.leastPrivilegePaths;
  if (!Array.isArray(leastPrivilegePaths) || leastPrivilegePaths.length === 0
    || leastPrivilegePaths.some((path) => typeof path !== 'string' || path.trim().length === 0)) {
    fail('service-identity-gap', `Fragment ${fragment.ticketId} is missing least-privilege paths.`, {
      fragmentId: fragment.ticketId,
    });
  }
  for (const operation of fragment.operations) {
    if ((operation.rule === '.read' || operation.rule === '.write')
      && !isExplicitDeny(operation)
      && !operation.expression.includes('auth')) {
      fail('service-identity-gap', `Fragment ${fragment.ticketId} has an unauthenticated service rule.`, {
        fragmentId: fragment.ticketId,
        location: generatedBookRuleLocation(operation.path, operation.rule),
      });
    }
  }
};

const refKey = (operation: OperationRef): string => (
  `${operation.fragmentId}:${operation.operationIndex}`
);

const resolutionFor = (
  location: string,
  operations: readonly OperationRef[],
): ConflictResolution | undefined => {
  const keys = new Set(operations.map(refKey));
  return FINAL_BOOK_RULE_CONFLICT_RESOLUTIONS.find((resolution) => (
    resolution.location === location
    && resolution.operations.length === operations.length
    && resolution.operations.every((operation) => keys.has(refKey(operation)))
  ));
};

interface InternalOperation extends GeneratedBookRuleOperation {
  readonly fragmentId: string;
  readonly operationIndex: number;
  readonly location: string;
}

const contributorRefs = (operations: readonly InternalOperation[]): OperationRef[] => (
  operations.map(({ fragmentId, operationIndex }) => ({ fragmentId, operationIndex }))
);

const validateAncestorConflicts = (
  operations: readonly ComposedGeneratedBookRuleOperation[],
): void => {
  for (let leftIndex = 0; leftIndex < operations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < operations.length; rightIndex += 1) {
      const left = operations[leftIndex];
      const right = operations[rightIndex];
      if (!['.read', '.write'].includes(left.rule) || left.rule !== right.rule) continue;
      const ancestor = isStrictAncestorPath(left.path, right.path) ? left
        : isStrictAncestorPath(right.path, left.path) ? right : undefined;
      const descendant = ancestor === left ? right : ancestor === right ? left : undefined;
      if (!ancestor || !descendant || !isExplicitDeny(descendant) || isExplicitDeny(ancestor)) continue;
      throw new GeneratedBookRuleValidationError(
        'ancestor-descendant-conflict',
        `Access rule ${descendant.location} conflicts with ancestor ${ancestor.location}.`,
        {
          reason: 'descendant-deny-cannot-revoke-ancestor',
          ancestorLocation: ancestor.location,
          descendantLocation: descendant.location,
          ancestorFragmentId: ancestor.fragmentId,
          descendantFragmentId: descendant.fragmentId,
          ancestorIsPermissiveFallback: isPermissiveFallback(ancestor.expression),
        },
      );
    }
  }
};

const composeOperations = (
  manifest: GeneratedBookRuleFragmentManifest,
): ComposedGeneratedBookRuleOperation[] => {
  const groups = new Map<string, InternalOperation[]>();
  for (const entry of manifest) {
    const fragment = validateGeneratedBookRuleFragment(
      entry.fragment,
      finalFragmentValidationOptions(entry.fragmentId),
    );
    validateFragmentMetadata(fragment);
    fragment.operations.forEach((operation, operationIndex) => {
      const location = generatedBookRuleLocation(operation.path, operation.rule, `Fragment ${fragment.ticketId} operation`);
      const existing = groups.get(location) ?? [];
      existing.push({ ...operation, fragmentId: fragment.ticketId, operationIndex, location });
      groups.set(location, existing);
    });
  }

  const operations: ComposedGeneratedBookRuleOperation[] = [];
  for (const [location, group] of groups) {
    const sortedGroup = [...group].sort((left, right) => (
      compareDeterministically(left.fragmentId, right.fragmentId)
      || left.operationIndex - right.operationIndex
    ));
    const refs = contributorRefs(sortedGroup);
    const resolution = resolutionFor(location, refs);
    if (sortedGroup.length === 1) {
      operations.push({ ...sortedGroup[0], contributors: Object.freeze(refs) });
      continue;
    }
    if (!resolution) {
      const first = sortedGroup[0];
      const sameSemantics = sortedGroup.every((operation) => (
        operation.merge === first.merge && operation.requiresExistingRule === first.requiresExistingRule
      ));
      throw new GeneratedBookRuleValidationError(
        sameSemantics ? 'duplicate-operation' : 'incompatible-merge-semantics',
        `Rule location ${location} has an unapproved producer collision.`,
        {
          location,
          operations: refs,
          firstMerge: first.merge,
          duplicateMerges: sortedGroup.slice(1).map((operation) => operation.merge),
        },
      );
    }
    if (resolution.kind === 'exact-duplicate') {
      const first = sortedGroup[0];
      if (!sortedGroup.every((operation) => (
        operation.merge === first.merge
        && operation.requiresExistingRule === first.requiresExistingRule
        && operation.expression === first.expression
      ))) {
        throw new GeneratedBookRuleValidationError(
          'incompatible-merge-semantics',
          `Exact duplicate resolution for ${location} does not match producer semantics.`,
          { location, operations: refs },
        );
      }
      operations.push({ ...first, contributors: Object.freeze(refs) });
      continue;
    }
    const requiresExistingRule = sortedGroup.every((operation) => operation.requiresExistingRule);
    operations.push({
      ...sortedGroup[0],
      merge: requiresExistingRule
        ? 'conjoin-existing-authorization-resolution'
        : 'replace-authorization-alternatives-resolution',
      requiresExistingRule,
      expression: sortedGroup.map((operation) => `(${operation.expression})`).join(' || '),
      contributors: Object.freeze(refs),
    });
  }
  operations.sort((left, right) => compareDeterministically(left.location, right.location));
  validateAncestorConflicts(operations);
  return operations;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const readRule = (
  root: Record<string, unknown>,
  path: string,
  rule: string,
): unknown => {
  let cursor: unknown = root;
  for (const segment of pathSegments(path)) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return isRecord(cursor) ? cursor[rule] : undefined;
};

const assignRule = (
  root: Record<string, unknown>,
  operation: ComposedGeneratedBookRuleOperation,
  expression: string,
): void => {
  let current = root;
  for (const segment of pathSegments(operation.path)) {
    const existing = current[segment];
    if (existing === undefined) {
      const child: Record<string, unknown> = {};
      current[segment] = child;
      current = child;
    } else if (isRecord(existing)) {
      current = existing;
    } else {
      fail('incompatible-merge-semantics', `Rule path ${operation.path} crosses a scalar.`, {
        path: operation.path,
        location: operation.location,
      });
    }
  }
  current[operation.rule] = expression;
};

const securityRemediation = (
  operation: ComposedGeneratedBookRuleOperation,
): string => {
  if (operation.location !== 'book_replacement_plans/tokens/$ownerId/$planId/$reviewId/.write') {
    return operation.expression;
  }
  return `(${operation.expression}) && !newData.child('token').exists() && !newData.child('confirmationToken').exists() && !newData.child('secret').exists()`;
};

const validateSensitivePayloadDenials = (
  operations: readonly ComposedGeneratedBookRuleOperation[],
): void => {
  for (const operation of operations) {
    if (operation.location === 'book_replacement_plans/tokens/$ownerId/$planId/$reviewId/.write') {
      const expression = securityRemediation(operation);
      for (const field of ['token', 'confirmationToken', 'secret']) {
        if (!expression.includes(`!newData.child('${field}').exists()`)) {
          fail('unsafe-payload-allow', `Raw token field ${field} is not denied.`, {
            location: operation.location,
            field,
          });
        }
      }
    }
    if (operation.location === 'book_retired_byte_deletions/records/$ownerId/$deletionId/.write') {
      for (const field of ['bytes', 'backupBytes', 'pdfData', 'bytePayload']) {
        if (!operation.expression.includes(`!newData.child('${field}').exists()`)) {
          fail('unsafe-payload-allow', `Raw byte field ${field} is not denied.`, {
            location: operation.location,
            field,
          });
        }
      }
    }
  }
};

const validateMonotonicTransitions = (
  operations: readonly ComposedGeneratedBookRuleOperation[],
): void => {
  for (const operation of operations) {
    if (operation.expression.includes('stateRevision')
      && !/stateRevision.*(?:\+ 1|\+1)/u.test(operation.expression)) {
      fail('non-monotonic-transition', `State revision rule is not monotonic at ${operation.location}.`, {
        location: operation.location,
      });
    }
  }
};

const mergeExistingRule = (
  existing: unknown,
  operation: ComposedGeneratedBookRuleOperation,
): string => {
  const expression = securityRemediation(operation);
  if (existing === undefined) {
    return expression;
  }
  if (typeof existing !== 'string' && typeof existing !== 'boolean') {
    fail('incompatible-merge-semantics', `Existing rule at ${operation.location} is not scalar.`, {
      location: operation.location,
    });
  }
  if (operation.merge.startsWith('conjoin-existing-authorization')) {
    return `(${String(existing)}) || (${expression})`;
  }
  if (operation.merge.startsWith('conjoin-existing-validation')) {
    return `(${String(existing)}) && (${expression})`;
  }
  return expression;
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
};

/** Compose all producer fragments into a deterministic, side-effect-free candidate. */
export const composeGeneratedBookRules = (
  input: readonly CompositionInput[] | GeneratedBookRuleFragmentManifest,
  options: GeneratedBookRuleCompositionOptions = {},
): GeneratedBookRulesCandidate => {
  const manifest = toValidatedManifest(input);
  validateRequiredFragmentIds(manifest, options.requiredFragmentIds);
  const operations = composeOperations(manifest);
  validateRequiredLocations(operations, options.requiredLocations);
  validateSensitivePayloadDenials(operations);
  validateMonotonicTransitions(operations);

  const rules = options.baseRules === undefined ? {} : cloneJson(options.baseRules);
  for (const operation of operations) {
    const existing = readRule(rules, operation.path, operation.rule);
      const expression = mergeExistingRule(existing, operation);
    assignRule(rules, operation, expression);
  }

  const byLocation: Record<string, ComposedGeneratedBookRuleOperation> = {};
  for (const operation of operations) byLocation[operation.location] = operation;
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
