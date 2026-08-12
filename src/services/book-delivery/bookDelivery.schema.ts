import {
  BOOK_DELIVERY_BINDING_STATUSES,
  BOOK_DELIVERY_CONTEXT_KINDS,
  BOOK_DELIVERY_SCHEMA_VERSION,
  BOOK_DELIVERY_SCOPE_KINDS,
  BOOK_DELIVERY_SOURCE_STRATEGIES,
  type BookDeliveryBinding,
  type BookDeliveryValidationCode,
  type BookDeliveryValidationError,
  type BookDeliveryValidationResult,
} from './bookDelivery.types';

const MAX_BYTES = 1_048_576;
const MAX_ID_LENGTH = 128;
const MAX_ARRAY_LENGTH = 5_000;
const forbiddenName = /(?:provider|storage|objectKey|credential|token|secret|signed|private|url)/iu;

const record = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const own = (value: object, key: string): boolean => Object.prototype.propertyIsEnumerable.call(value, key);
const exact = (
  value: unknown,
  keys: readonly string[],
  path: string,
  errors: BookDeliveryValidationError[],
): value is Record<string, unknown> => {
  if (!record(value)) {
    errors.push({ code: 'invalid-record', path, message: 'Expected a plain object.' });
    return false;
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) {
      errors.push({
        code: forbiddenName.test(String(key)) ? 'forbidden-field' : 'unknown-field',
        path: `${path}.${String(key)}`,
        message: 'Field is not allowed.',
      });
    } else if (!own(value, key)) {
      errors.push({ code: 'invalid-value', path: `${path}.${key}`, message: 'Field must be enumerable.' });
    } else {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor)) {
        errors.push({ code: 'invalid-value', path: `${path}.${key}`, message: 'Field must be an immutable data field.' });
      }
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key) || !own(value, key)) {
      errors.push({ code: 'missing-field', path: `${path}.${key}`, message: 'Field is required.' });
    }
  }
  return true;
};
const id = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
  && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u.test(value);
const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const iso = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};
const boundedArray = (value: unknown): value is readonly unknown[] => {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_LENGTH) return false;
  const expected = new Set<PropertyKey>(['length', ...value.map((_, index) => String(index))]);
  const actual = Reflect.ownKeys(value);
  return actual.length === expected.size && actual.every((key) => {
    if (!expected.has(key)) return false;
    if (key === 'length') return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor?.enumerable && 'value' in descriptor);
  });
};
const error = (
  errors: BookDeliveryValidationError[],
  code: BookDeliveryValidationCode,
  path: string,
  message: string,
): void => {
  errors.push({ code, path, message });
};

const validateIdArray = (
  value: unknown,
  path: string,
  errors: BookDeliveryValidationError[],
  allowEmpty = false,
): void => {
  if (!boundedArray(value) || (!allowEmpty && value.length === 0)) {
    error(errors, 'invalid-value', path, 'Expected a bounded dense identifier array.');
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (!id(entry)) error(errors, 'invalid-value', `${path}[${index}]`, 'Expected a safe identifier.');
    else if (seen.has(entry)) error(errors, 'duplicate-id', `${path}[${index}]`, 'Identifier must be unique.');
    else seen.add(entry);
  });
};

const validateContext = (value: unknown, errors: BookDeliveryValidationError[]): void => {
  if (!exact(value, ['contextId', 'entitlementBasis', 'kind', 'ownerId', 'recipientId'], 'context', errors)) return;
  const context = value as Record<string, any>;
  if (!id(context.contextId) || !id(context.ownerId) || !id(context.recipientId)) {
    error(errors, 'invalid-value', 'context', 'Context IDs must be safe identifiers.');
  }
  if (!BOOK_DELIVERY_CONTEXT_KINDS.includes(context.kind as never)) {
    error(errors, 'unsupported-context', 'context.kind', 'Context kind is unsupported.');
    return;
  }
  const basisByKind: Record<string, string> = {
    solo: 'solo', preview: 'preview', homework: 'assignment', course: 'enrollment',
    class: 'membership', future_live: 'reserved',
  };
  if (context.entitlementBasis !== basisByKind[context.kind as string]) {
    error(errors, 'invalid-value', 'context.entitlementBasis', 'Context basis does not match its discriminant.');
  }
};

const validateSources = (value: unknown, errors: BookDeliveryValidationError[]): void => {
  if (!exact(value, ['sources', 'strategy'], 'sourceSet', errors)) return;
  const sourceSet = value as Record<string, any>;
  if (!BOOK_DELIVERY_SOURCE_STRATEGIES.includes(sourceSet.strategy as never)) {
    error(errors, 'invalid-source-strategy', 'sourceSet.strategy', 'Source strategy is unsupported.');
    return;
  }
  if (!boundedArray(sourceSet.sources)
    || (sourceSet.strategy === 'full_pdf' && sourceSet.sources.length !== 1)
    || (sourceSet.strategy === 'component_pdfs' && sourceSet.sources.length === 0)) {
    error(errors, 'invalid-source-strategy', 'sourceSet.sources', 'Source count does not match strategy.');
    return;
  }
  const keys = new Set<string>();
  const versions = new Set<string>();
  const orders = new Set<number>();
  const sources = sourceSet.sources as readonly Record<string, any>[];
  sources.forEach((source, index) => {
    const path = `sourceSet.sources[${index}]`;
    const expected = sourceSet.strategy === 'component_pdfs'
      ? ['lifecycle', 'localPageScope', 'ownerNodeKey', 'sourceKey', 'sourceOrder', 'sourceVersionId']
      : ['lifecycle', 'localPageScope', 'sourceKey', 'sourceVersionId'];
    if (!exact(source, expected, path, errors)) return;
    if (!id(source.sourceKey) || keys.has(source.sourceKey)) error(errors, 'duplicate-id', `${path}.sourceKey`, 'Source key must be unique and safe.');
    if (!id(source.sourceVersionId) || versions.has(source.sourceVersionId)) error(errors, 'duplicate-id', `${path}.sourceVersionId`, 'Source Version must be unique and safe.');
    if (source.lifecycle !== 'verified-usable') error(errors, 'invalid-value', `${path}.lifecycle`, 'Only verified usable Source Versions may be bound.');
    if (sourceSet.strategy === 'component_pdfs' && !id(source.ownerNodeKey)) error(errors, 'invalid-value', `${path}.ownerNodeKey`, 'Component source requires an owning node.');
    if (sourceSet.strategy === 'component_pdfs' && (!positive(source.sourceOrder) || orders.has(source.sourceOrder))) {
      error(errors, 'duplicate-order', `${path}.sourceOrder`, 'Component source order must be unique and positive.');
    }
    if (sourceSet.strategy === 'full_pdf' && Object.hasOwn(source, 'ownerNodeKey')) error(errors, 'source-scope-mismatch', `${path}.ownerNodeKey`, 'full_pdf cannot carry component ownership.');
    if (sourceSet.strategy === 'full_pdf' && Object.hasOwn(source, 'sourceOrder')) error(errors, 'source-scope-mismatch', `${path}.sourceOrder`, 'full_pdf cannot carry component ordering.');
    if (!exact(source.localPageScope, ['kind', 'pages'], `${path}.localPageScope`, errors)) return;
    const localPageScope = source.localPageScope as Record<string, any>;
    if (!['all', 'pages'].includes(localPageScope.kind as string)) error(errors, 'invalid-value', `${path}.localPageScope.kind`, 'Page scope kind is invalid.');
    if (!boundedArray(localPageScope.pages)) {
      error(errors, 'invalid-value', `${path}.localPageScope.pages`, 'Pages must be an array.');
    } else if (localPageScope.kind === 'all' && localPageScope.pages.length !== 0) {
      error(errors, 'source-scope-mismatch', `${path}.localPageScope.pages`, 'all scope cannot enumerate pages.');
    } else if (localPageScope.kind === 'pages') {
      validatePageArray(localPageScope.pages, `${path}.localPageScope.pages`, errors);
    }
    keys.add(typeof source.sourceKey === 'string' ? source.sourceKey : '');
    versions.add(typeof source.sourceVersionId === 'string' ? source.sourceVersionId : '');
    if (sourceSet.strategy === 'component_pdfs' && positive(source.sourceOrder)) orders.add(source.sourceOrder);
  });
  if (sourceSet.strategy === 'component_pdfs'
    && (orders.size !== sourceSet.sources.length
      || [...orders].some((order) => order < 1 || order > sourceSet.sources.length))) {
    error(errors, 'invalid-value', 'sourceSet.sources', 'Component source order must be dense.');
  }
  if (sourceSet.strategy === 'full_pdf') {
    const onlySource = sources[0];
    if (onlySource?.localPageScope?.kind !== 'all'
      || !Array.isArray(onlySource.localPageScope.pages)
      || onlySource.localPageScope.pages.length !== 0) {
      error(errors, 'source-scope-mismatch', 'sourceSet.sources[0].localPageScope', 'full_pdf must authorize the complete document.');
    }
  }
};

const validatePageArray = (value: unknown, path: string, errors: BookDeliveryValidationError[]): void => {
  if (!boundedArray(value) || value.length === 0) {
    error(errors, 'invalid-value', path, 'Pages must be a bounded nonempty array.');
    return;
  }
  let previous = 0;
  for (const [index, page] of value.entries()) {
    if (!positive(page) || page <= previous) error(errors, 'invalid-value', `${path}[${index}]`, 'Pages must be positive and strictly ordered.');
    previous = typeof page === 'number' ? page : previous;
  }
};

const nodeTypes = new Set([
  'intro-placeholder',
  'toc-placeholder',
  'note-placeholder',
  'section',
  'chapter',
  'unit',
  'test',
]);

const validateOutline = (value: unknown, errors: BookDeliveryValidationError[]): void => {
  if (!boundedArray(value) || value.length === 0) {
    error(errors, 'invalid-value', 'outline', 'Selected Book outline must be a bounded nonempty array.');
    return;
  }
  const nodes = value as readonly Record<string, any>[];
  const keys = new Set<string>();
  const siblingOrders = new Set<string>();
  nodes.forEach((node, index) => {
    const path = `outline[${index}]`;
    const expected = Object.hasOwn(node ?? {}, 'titleSnapshot')
      ? ['nodeKey', 'nodeType', 'order', 'parentNodeKey', 'titleSnapshot']
      : ['nodeKey', 'nodeType', 'order', 'parentNodeKey'];
    if (!exact(node, expected, path, errors)) return;
    if (!id(node.nodeKey) || keys.has(node.nodeKey)) {
      error(errors, 'duplicate-id', `${path}.nodeKey`, 'Outline node key must be unique and safe.');
    }
    if (node.parentNodeKey !== null && !id(node.parentNodeKey)) {
      error(errors, 'invalid-value', `${path}.parentNodeKey`, 'Outline parent must be null or a safe node key.');
    }
    if (!nodeTypes.has(String(node.nodeType))) error(errors, 'invalid-value', `${path}.nodeType`, 'Outline node type is unsupported.');
    if (!positive(node.order)) error(errors, 'invalid-value', `${path}.order`, 'Outline order must be positive.');
    if (Object.hasOwn(node, 'titleSnapshot')
      && (typeof node.titleSnapshot !== 'string' || node.titleSnapshot.length === 0 || node.titleSnapshot.length > 500)) {
      error(errors, 'invalid-value', `${path}.titleSnapshot`, 'Outline title snapshot must be bounded text.');
    }
    const siblingOrder = `${String(node.parentNodeKey)}:${String(node.order)}`;
    if (siblingOrders.has(siblingOrder)) error(errors, 'duplicate-order', `${path}.order`, 'Sibling outline order must be unique.');
    siblingOrders.add(siblingOrder);
    if (typeof node.nodeKey === 'string') keys.add(node.nodeKey);
  });
  nodes.forEach((node, index) => {
    if (node.parentNodeKey !== null && !keys.has(node.parentNodeKey)) {
      error(errors, 'invalid-value', `outline[${index}].parentNodeKey`, 'Outline parent is absent from the selected structure.');
    }
    const visited = new Set<string>();
    let current: Record<string, any> | undefined = node;
    while (current) {
      if (visited.has(current.nodeKey)) {
        error(errors, 'invalid-value', `outline[${index}].parentNodeKey`, 'Outline contains a cycle.');
        break;
      }
      visited.add(current.nodeKey);
      current = current.parentNodeKey === null
        ? undefined
        : nodes.find((candidate) => candidate.nodeKey === current?.parentNodeKey);
    }
  });
};

const validatePlacements = (value: unknown, errors: BookDeliveryValidationError[]): void => {
  if (!boundedArray(value) || value.length === 0) {
    error(errors, 'invalid-value', 'placements', 'At least one placement is required.');
    return;
  }
  const ids = new Set<string>();
  const orders = new Set<number>();
  value.forEach((placement, index) => {
    const path = `placements[${index}]`;
    if (!exact(placement, [
      'activityId', 'activityVersion', 'activityVersionId', 'contextMode', 'nodeKey',
      'order', 'pageGroupKeys', 'placementId', 'sourcePageScopes',
    ], path, errors)) return;
    const entry = placement as Record<string, any>;
    if (!id(entry.placementId) || ids.has(entry.placementId)) error(errors, 'duplicate-id', `${path}.placementId`, 'Placement ID must be unique and safe.');
    if (!id(entry.activityId) || !id(entry.activityVersionId) || !id(entry.nodeKey)
      || !positive(entry.activityVersion) || !positive(entry.order)) {
      error(errors, 'invalid-value', path, 'Placement identity and version are invalid.');
    }
    if (!['none', 'optional', 'required'].includes(entry.contextMode as string)) error(errors, 'invalid-value', `${path}.contextMode`, 'Context mode is invalid.');
    if (orders.has(entry.order as number)) error(errors, 'duplicate-order', `${path}.order`, 'Placement order must be unique.');
    validateIdArray(entry.pageGroupKeys, `${path}.pageGroupKeys`, errors, true);
    if (!boundedArray(entry.sourcePageScopes)) error(errors, 'invalid-value', `${path}.sourcePageScopes`, 'Source page scopes must be a bounded array.');
    else (entry.sourcePageScopes as readonly Record<string, any>[]).forEach((scope, scopeIndex) => {
      const scopePath = `${path}.sourcePageScopes[${scopeIndex}]`;
      if (!exact(scope, ['pages', 'sourceKey'], scopePath, errors)) return;
      if (!id(scope.sourceKey)) error(errors, 'invalid-value', `${scopePath}.sourceKey`, 'Source key is invalid.');
      validatePageArray(scope.pages, `${scopePath}.pages`, errors);
    });
    if (entry.contextMode === 'required' && (!Array.isArray(entry.sourcePageScopes) || entry.sourcePageScopes.length === 0)) {
      error(errors, 'source-scope-mismatch', `${path}.sourcePageScopes`, 'Required context must carry source page scope.');
    }
    if (entry.contextMode === 'required' && (!Array.isArray(entry.pageGroupKeys) || entry.pageGroupKeys.length === 0)) {
      error(errors, 'source-scope-mismatch', `${path}.pageGroupKeys`, 'Required context must pin at least one Page Group.');
    }
    if (entry.contextMode === 'none'
      && ((Array.isArray(entry.sourcePageScopes) && entry.sourcePageScopes.length > 0)
        || (Array.isArray(entry.pageGroupKeys) && entry.pageGroupKeys.length > 0))) {
      error(errors, 'source-scope-mismatch', path, 'Context-free placement cannot carry Page Group or source-page authority.');
    }
    ids.add(typeof entry.placementId === 'string' ? entry.placementId : '');
    orders.add(typeof entry.order === 'number' ? entry.order : NaN);
  });
};

const validateBookDeliveryBindingUnsafe = (value: unknown): BookDeliveryValidationResult => {
  const errors: BookDeliveryValidationError[] = [];
  if (!exact(value, [
    'bindingId', 'book', 'context', 'createdAt', 'issuer', 'outline', 'placements',
    'recipient', 'revision', 'schedulePolicy', 'schemaVersion', 'scope',
    'sourceSet', 'status',
  ], 'binding', errors)) return { valid: false, errors };
  const binding = value as Record<string, any>;
  if (binding.schemaVersion !== BOOK_DELIVERY_SCHEMA_VERSION) {
    error(errors, 'invalid-value', 'binding.schemaVersion', `Only schema version ${BOOK_DELIVERY_SCHEMA_VERSION} is supported.`);
  }
  if (!id(binding.bindingId) || !nonnegative(binding.revision) || !BOOK_DELIVERY_BINDING_STATUSES.includes(binding.status as never) || !iso(binding.createdAt)) {
    error(errors, 'invalid-value', 'binding', 'Binding identity, revision, status, or creation time is invalid.');
  }
  if (!exact(binding.recipient, ['recipientId', 'recipientKind'], 'binding.recipient', errors)
    || !id(binding.recipient.recipientId)
    || !['student', 'preview-user'].includes(binding.recipient.recipientKind as string)) {
    error(errors, 'invalid-value', 'binding.recipient', 'Recipient is invalid.');
  }
  if (!exact(binding.issuer, ['authorityBoundary', 'ownerId'], 'binding.issuer', errors)
    || binding.issuer.authorityBoundary !== 'book-owner' || !id(binding.issuer.ownerId)) {
    error(errors, 'invalid-value', 'binding.issuer', 'Issuer boundary is invalid.');
  }
  if (!exact(binding.book, ['bookId', 'bookMode', 'bookRevision', 'manifestVersionId', 'publicationId', 'publicationRevision', 'publicationStatus'], 'binding.book', errors)
    || !id(binding.book.bookId) || binding.book.bookMode !== 'pdf'
    || !nonnegative(binding.book.bookRevision) || !id(binding.book.manifestVersionId) || !id(binding.book.publicationId)
    || !positive(binding.book.publicationRevision) || binding.book.publicationStatus !== 'published') {
    error(errors, 'invalid-publication', 'binding.book', 'Only published Mode 2 PDF Books may be bound.');
  }
  if (exact(binding.scope, ['kind', 'nodeKeys', 'placementIds'], 'binding.scope', errors)) {
    const scope = binding.scope as Record<string, any>;
    if (!BOOK_DELIVERY_SCOPE_KINDS.includes(scope.kind as never)) error(errors, 'invalid-value', 'binding.scope.kind', 'Scope kind is invalid.');
    const nodeKeys = scope.nodeKeys as readonly unknown[];
    const placementIds = scope.placementIds as readonly unknown[];
    validateIdArray(nodeKeys, 'binding.scope.nodeKeys', errors, true);
    validateIdArray(placementIds, 'binding.scope.placementIds', errors, true);
    if (scope.kind === 'subtree' && (nodeKeys.length === 0 || placementIds.length !== 0)) {
      error(errors, 'contradictory-scope', 'binding.scope', 'Subtree scope requires nodes and no placement IDs.');
    }
    if (scope.kind === 'placements' && (placementIds.length === 0 || nodeKeys.length !== 0)) {
      error(errors, 'contradictory-scope', 'binding.scope', 'Placement scope requires placement IDs and no node keys.');
    }
  }
  validateOutline(binding.outline, errors);
  validateContext(binding.context, errors);
  if (exact(binding.schedulePolicy, ['basis', 'policyId', 'policyRevision'], 'binding.schedulePolicy', errors)
    && (!id(binding.schedulePolicy.policyId) || !positive(binding.schedulePolicy.policyRevision) || binding.schedulePolicy.basis !== 'immutable-reference')) {
    error(errors, 'invalid-value', 'binding.schedulePolicy', 'Schedule policy reference is invalid.');
  }
  validateSources(binding.sourceSet, errors);
  validatePlacements(binding.placements, errors);
  const contextKind = record(binding.context) ? (binding.context as Record<string, any>).kind : undefined;
  const recipient = binding.recipient as Record<string, any>;
  const issuer = binding.issuer as Record<string, any>;
  const context = binding.context as Record<string, any>;
  const sourceSet = binding.sourceSet as Record<string, any>;
  const outline = Array.isArray(binding.outline) ? binding.outline as readonly Record<string, any>[] : [];
  const outlineKeys = new Set(outline.map((node) => node.nodeKey));
  const placements = Array.isArray(binding.placements) ? binding.placements as readonly Record<string, any>[] : [];
  const placementIds = new Set(placements.map((placement) => placement.placementId));
  const sourceKeys = new Set(
    Array.isArray(sourceSet.sources)
      ? sourceSet.sources.map((source: Record<string, any>) => source.sourceKey)
      : [],
  );
  if (recipient.recipientId !== context.recipientId) {
    error(errors, 'invalid-value', 'binding.context.recipientId', 'Context recipient must equal binding recipient.');
  }
  if (issuer.ownerId !== context.ownerId) {
    error(errors, 'invalid-value', 'binding.context.ownerId', 'Context owner must equal binding issuer.');
  }
  if (binding.scope?.kind === 'placements' && Array.isArray(binding.scope.placementIds)) {
    const scoped = binding.scope.placementIds as readonly string[];
    if (scoped.length !== placementIds.size
      || scoped.some((placementId) => !placementIds.has(placementId))) {
      error(errors, 'contradictory-scope', 'binding.scope.placementIds', 'Placement scope must exactly equal the ordered bound placement set.');
    }
  }
  if (Array.isArray(binding.scope?.nodeKeys)
    && binding.scope.nodeKeys.some((nodeKey: string) => !outlineKeys.has(nodeKey))) {
    error(errors, 'contradictory-scope', 'binding.scope.nodeKeys', 'Selected scope node is absent from the frozen outline.');
  }
  const parentByNode = new Map(outline.map((node) => [node.nodeKey, node.parentNodeKey]));
  const lineage = (nodeKey: string): Set<string> => {
    const result = new Set<string>();
    let current: string | null | undefined = nodeKey;
    while (typeof current === 'string' && !result.has(current)) {
      result.add(current);
      current = parentByNode.get(current);
    }
    return result;
  };
  const selectedRoots = binding.scope?.kind === 'subtree' && Array.isArray(binding.scope.nodeKeys)
    ? new Set<string>(binding.scope.nodeKeys)
    : new Set<string>();
  if (selectedRoots.size > 0) {
    const allowedOutline = new Set<string>();
    selectedRoots.forEach((nodeKey) => lineage(nodeKey).forEach((key) => allowedOutline.add(key)));
    outline.forEach((node) => {
      if ([...lineage(node.nodeKey)].some((key) => selectedRoots.has(key))) allowedOutline.add(node.nodeKey);
    });
    if (outline.some((node) => !allowedOutline.has(node.nodeKey))) {
      error(errors, 'contradictory-scope', 'binding.outline', 'Frozen outline contains structure outside the selected subtree.');
    }
  }
  if (binding.scope?.kind === 'placements') {
    const selectedPlacementIds = new Set<string>(
      Array.isArray(binding.scope.placementIds) ? binding.scope.placementIds : [],
    );
    const allowedOutline = new Set<string>();
    placements
      .filter((placement) => selectedPlacementIds.has(placement.placementId))
      .forEach((placement) => lineage(placement.nodeKey).forEach((key) => allowedOutline.add(key)));
    if (outline.some((node) => !allowedOutline.has(node.nodeKey))) {
      error(errors, 'contradictory-scope', 'binding.outline', 'Frozen outline contains structure outside selected placements.');
    }
  }
  placements.forEach((placement) => {
    if (!outlineKeys.has(placement.nodeKey)) {
      error(errors, 'contradictory-scope', 'binding.placements.nodeKey', 'Placement node is absent from the frozen outline.');
    }
    if (selectedRoots.size > 0 && ![...lineage(placement.nodeKey)].some((key) => selectedRoots.has(key))) {
      error(errors, 'contradictory-scope', 'binding.placements.nodeKey', 'Placement is outside the selected subtree.');
    }
    if (Array.isArray(placement.sourcePageScopes)) {
      placement.sourcePageScopes.forEach((scope: Record<string, any>) => {
        if (!sourceKeys.has(scope.sourceKey)) {
          error(errors, 'source-scope-mismatch', 'binding.placements.sourcePageScopes', 'Placement references an unbound source.');
        }
        if (placement.contextMode === 'none') {
          error(errors, 'source-scope-mismatch', 'binding.placements.sourcePageScopes', 'Context-free placement cannot carry source mapping.');
        }
        const source = Array.isArray(sourceSet.sources)
          ? sourceSet.sources.find((entry: Record<string, any>) => entry.sourceKey === scope.sourceKey)
          : undefined;
        if (source?.localPageScope?.kind === 'pages'
          && Array.isArray(source.localPageScope.pages)
          && scope.pages.some((page: number) => !source.localPageScope.pages.includes(page))) {
          error(errors, 'source-scope-mismatch', 'binding.placements.sourcePageScopes', 'Placement page is outside the authorized local source scope.');
        }
      });
    }
  });
  if (contextKind === 'future_live' && binding.status !== 'draft') error(errors, 'unrunnable-future-live', 'binding.status', 'future_live is reserved and cannot be runnable.');
  if (contextKind === 'future_live' && binding.recipient.recipientKind !== 'preview-user') error(errors, 'unrunnable-future-live', 'binding.recipient.recipientKind', 'future_live is never a student grant.');
  if (binding.sourceSet?.strategy === 'full_pdf' && binding.sourceSet.sources.length !== 1) error(errors, 'source-scope-mismatch', 'binding.sourceSet', 'full_pdf must bind the complete PDF.');
  if (binding.sourceSet?.strategy === 'component_pdfs' && binding.sourceSet.sources.some((source: any) => !source.ownerNodeKey)) error(errors, 'source-scope-mismatch', 'binding.sourceSet', 'Every component PDF needs an owning node.');
  if (binding.sourceSet?.strategy === 'component_pdfs'
    && binding.sourceSet.sources.some((source: any) => !outlineKeys.has(source.ownerNodeKey))) {
    error(errors, 'source-scope-mismatch', 'binding.sourceSet', 'Component source owner must exist in the frozen outline.');
  }
  if (JSON.stringify(binding).length > MAX_BYTES) error(errors, 'invalid-value', 'binding', 'Binding exceeds bounded size.');
  return { valid: errors.length === 0, errors: Object.freeze(errors) };
};

export const validateBookDeliveryBinding = (value: unknown): BookDeliveryValidationResult => {
  try {
    return validateBookDeliveryBindingUnsafe(value);
  } catch {
    return {
      valid: false,
      errors: Object.freeze([{
        code: 'invalid-record' as const,
        path: 'binding',
        message: 'Malformed binding failed closed.',
      }]),
    };
  }
};

export function assertBookDeliveryBinding(value: unknown): asserts value is BookDeliveryBinding {
  const result = validateBookDeliveryBinding(value);
  if (!result.valid) throw new Error(`Invalid Book Delivery binding: ${result.errors[0]?.message ?? 'unknown error'}`);
}

export const isRunnableBookDeliveryBinding = (value: unknown): value is BookDeliveryBinding => {
  if (!validateBookDeliveryBinding(value).valid) return false;
  const binding = value as BookDeliveryBinding;
  return binding.status === 'active' && binding.context.kind !== 'future_live';
};
