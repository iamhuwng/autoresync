import {
  BOOK_ASSEMBLY_LIMITS,
  BOOK_SOURCE_STRATEGIES,
  type BookAssemblyValidationError,
  type BookAssemblyValidationResult,
  type BookContentTreeNodeCandidate,
  type BookSourceVersionAuthority,
  type SourceSetCandidate,
} from '../../types/bookAssembly.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const error = (
  code: BookAssemblyValidationError['code'],
  path: string,
  message: string,
): BookAssemblyValidationError => ({ code, path, message });

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

/**
 * Checks whether a Source Set entry can be used by a node in the Book tree.
 * Full-PDF sources are Book-wide; component sources are limited to their
 * owner node and descendants.
 */
export const sourceMayBeUsedByNode = (
  source: SourceSetCandidate['sources'][number],
  nodes: readonly BookContentTreeNodeCandidate[],
  nodeKey: string,
): boolean => {
  if (!('ownerNodeKey' in source)) return true;
  if (typeof source.ownerNodeKey !== 'string') return false;

  const parents = new Map(nodes.map((node) => [node.nodeKey, node.parentNodeKey]));
  if (!parents.has(nodeKey) || !parents.has(source.ownerNodeKey)) return false;

  const seen = new Set<string>();
  let current: string | null | undefined = nodeKey;
  while (current !== null && current !== undefined) {
    if (current === source.ownerNodeKey) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
};

/**
 * Validates the fixed Book Source Set contract against the trusted immutable
 * Source Version projection. This is deliberately a small structural
 * validator; it does not create or manage rollout entitlements.
 */
export const validateSourceSetCandidate = (
  sourceSet: unknown,
  input: {
    readonly bookId: string;
    readonly sourceVersionAuthority: BookSourceVersionAuthority;
  },
): BookAssemblyValidationResult => {
  const errors: BookAssemblyValidationError[] = [];
  if (!isRecord(sourceSet)) {
    return { valid: false, errors: [error('invalid-record', '$.sourceSet', 'Source Set must be an object.')] };
  }
  if (!exactKeys(sourceSet, ['sourceStrategy', 'sources'])) {
    errors.push(error('unknown-field', '$.sourceSet', 'Source Set contains unknown or missing fields.'));
  }
  const strategy = sourceSet.sourceStrategy;
  if (!BOOK_SOURCE_STRATEGIES.includes(strategy as typeof BOOK_SOURCE_STRATEGIES[number])) {
    errors.push(error('invalid-value', '$.sourceSet.sourceStrategy', 'Source Set strategy is unsupported.'));
  }
  if (!Array.isArray(sourceSet.sources)) {
    errors.push(error('invalid-record', '$.sourceSet.sources', 'Source Set sources must be an array.'));
    return { valid: false, errors };
  }
  if (sourceSet.sources.length < 1) {
    errors.push(error('missing-field', '$.sourceSet.sources', 'Source Set must contain at least one Source Version.'));
  }
  if (sourceSet.sources.length > BOOK_ASSEMBLY_LIMITS.maxSources) {
    errors.push(error('limit-exceeded', '$.sourceSet.sources', 'Source Set exceeds the source limit.'));
  }
  if (strategy === 'full_pdf' && sourceSet.sources.length !== 1) {
    errors.push(error('invalid-value', '$.sourceSet.sources', 'Full PDF Source Set must contain exactly one source.'));
  }

  const sourceKeys = new Set<string>();
  const sourceVersions = new Set<string>();
  const sourceOrders = new Set<number>();
  sourceSet.sources.forEach((source, index) => {
    const path = `$.sourceSet.sources[${index}]`;
    if (!isRecord(source)) {
      errors.push(error('invalid-record', path, 'Source Version entry must be an object.'));
      return;
    }
    const component = strategy === 'component_pdfs';
    const expectedKeys = component
      ? ['ownerNodeKey', 'sourceKey', 'sourceOrder', 'sourceVersionId']
      : ['sourceKey', 'sourceOrder', 'sourceVersionId'];
    if (!exactKeys(source, expectedKeys)) {
      errors.push(error('unknown-field', path, 'Source Version entry contains unknown or missing fields.'));
    }
    if (!component && Object.hasOwn(source, 'ownerNodeKey')) {
      errors.push(error('forbidden-field', `${path}.ownerNodeKey`, 'Full PDF source cannot declare a hierarchy owner.'));
    }
    if (typeof source.sourceKey !== 'string' || !ID.test(source.sourceKey)) {
      errors.push(error('invalid-value', `${path}.sourceKey`, 'Source key must be a bounded identifier.'));
    } else if (sourceKeys.has(source.sourceKey)) {
      errors.push(error('duplicate-key', `${path}.sourceKey`, 'Source keys must be unique.'));
    } else {
      sourceKeys.add(source.sourceKey);
    }
    if (typeof source.sourceVersionId !== 'string' || !ID.test(source.sourceVersionId)) {
      errors.push(error('invalid-value', `${path}.sourceVersionId`, 'Source Version ID must be a bounded identifier.'));
    } else if (sourceVersions.has(source.sourceVersionId)) {
      errors.push(error('duplicate-key', `${path}.sourceVersionId`, 'Source Version IDs must be unique.'));
    } else {
      sourceVersions.add(source.sourceVersionId);
    }
    const sourceOrder = source.sourceOrder;
    if (typeof sourceOrder !== 'number' || !Number.isSafeInteger(sourceOrder) || sourceOrder < 1) {
      errors.push(error('invalid-value', `${path}.sourceOrder`, 'Source order must be a positive integer.'));
    } else if (sourceOrders.has(sourceOrder)) {
      errors.push(error('duplicate-order', `${path}.sourceOrder`, 'Source orders must be unique.'));
    } else {
      sourceOrders.add(sourceOrder);
    }
    if (component && (typeof source.ownerNodeKey !== 'string' || !ID.test(source.ownerNodeKey))) {
      errors.push(error('invalid-owner', `${path}.ownerNodeKey`, 'Component source requires one bounded hierarchy owner.'));
    }
    if (typeof source.sourceVersionId !== 'string' || !ID.test(source.sourceVersionId)) return;
    let trusted: ReturnType<BookSourceVersionAuthority['getSourceVersion']>;
    try {
      trusted = input.sourceVersionAuthority?.getSourceVersion(source.sourceVersionId);
    } catch {
      trusted = undefined;
    }
    if (!trusted) {
      errors.push(error('unknown-source-version', `${path}.sourceVersionId`, 'Source Version is not present in trusted authority.'));
    } else {
      if (trusted.sourceVersionId !== source.sourceVersionId) {
        errors.push(error('unknown-source-version', `${path}.sourceVersionId`, 'Trusted Source Version identity does not match.'));
      }
      if (trusted.bookId !== input.bookId) {
        errors.push(error('source-book-mismatch', `${path}.sourceVersionId`, 'Source Version belongs to another Book.'));
      }
      if (!trusted.verifiedUsable) {
        errors.push(error('unverified-source-version', `${path}.sourceVersionId`, 'Source Version is not verified usable.'));
      }
      if (!Number.isSafeInteger(trusted.physicalPageCount) || trusted.physicalPageCount < 1) {
        errors.push(error('invalid-value', `${path}.sourceVersionId`, 'Trusted Source Version page count is invalid.'));
      }
    }
  });
  return { valid: errors.length === 0, errors };
};
