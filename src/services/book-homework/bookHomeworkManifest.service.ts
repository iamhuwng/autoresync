import type {
  BookHomeworkActivityBinding,
  BookHomeworkExclusionReason,
  BookHomeworkManifest,
  BookHomeworkScheduleRule,
  BookHomeworkSelectionTarget,
  BookHomeworkSourceReadiness,
  BookHomeworkSourceContext,
  BookHomeworkStudentSafeProjection,
  BookHomeworkStructuralNodeType,
  BookHomeworkStructuralOutlineNode,
} from '../../types/homework.types';
import {
  BOOK_HOMEWORK_ASSIGNMENT_KIND,
  BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION,
} from '../../types/homework.types';
import type {
  BookDeliveryStructuralNodeProjection,
  BookRuntimeDeliveryActivityProjection,
  BookRuntimeDeliveryProjection,
} from '../book-delivery/bookDelivery.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;
const TITLE = /^.{1,512}$/su;
const PRIVATE_FIELD = /(?:answer|credential|objectKey|password|provider|secret|signed|storage|token|url)/iu;
const NODE_TYPES: readonly BookHomeworkStructuralNodeType[] = [
  'intro-placeholder', 'toc-placeholder', 'note-placeholder', 'section', 'chapter', 'unit', 'test',
];
const TARGET_NODE_TYPES = new Set<BookHomeworkSelectionTarget['kind']>(['section', 'chapter', 'unit', 'test']);
const EXCLUSION_REASONS: readonly BookHomeworkExclusionReason[] = [
  'not-published', 'unsupported-activity', 'missing-source', 'unresolved-mapping',
  'outside-selected-target', 'duplicate-placement',
];

export type BookHomeworkManifestValidationCode =
  | 'invalid-record'
  | 'unknown-field'
  | 'missing-field'
  | 'invalid-value'
  | 'duplicate-id'
  | 'duplicate-order'
  | 'unknown-node'
  | 'cycle'
  | 'invalid-target'
  | 'invalid-source-context'
  | 'invalid-version-pin'
  | 'invalid-publication'
  | 'legacy-score-contamination';

export interface BookHomeworkManifestValidationError {
  readonly code: BookHomeworkManifestValidationCode;
  readonly path: string;
  readonly message: string;
}

export interface BookHomeworkManifestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly BookHomeworkManifestValidationError[];
}

export class BookHomeworkManifestError extends Error {
  constructor(
    readonly code: BookHomeworkManifestValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'BookHomeworkManifestError';
  }
}

export interface BookHomeworkDeliveryResolution {
  /** The only source of trusted Activity, Source, publication, and context facts. */
  readonly delivery: BookRuntimeDeliveryProjection;
}

export interface BookHomeworkDeliveryResolver {
  resolve(target: BookHomeworkSelectionTarget): Promise<BookHomeworkDeliveryResolution>;
}

export interface BookHomeworkExcludedActivityCandidate {
  readonly placementId: string;
  readonly activityId: string;
  readonly nodeKey: string;
  readonly order: number;
  readonly contextMode?: 'none' | 'optional' | 'required';
  readonly titleSnapshot?: string;
  readonly reason: BookHomeworkExclusionReason;
}

export interface CreateBookHomeworkManifestInput {
  readonly resolution: BookHomeworkDeliveryResolution;
  readonly target: BookHomeworkSelectionTarget;
  readonly manifestVersionId: string;
  readonly ownerId: string;
  readonly createdByCommandId: string;
  readonly createdAt: string;
  readonly bindingRevision: number;
  readonly scheduleRules?: readonly BookHomeworkScheduleRule[];
  readonly excludedActivities?: readonly BookHomeworkExcludedActivityCandidate[];
}

export interface AdvanceBookHomeworkActivityBindingInput {
  readonly manifestVersionId: string;
  readonly createdByCommandId: string;
  readonly createdAt: string;
  readonly bindingRevision: number;
  readonly placementId: string;
  readonly nextBinding: Extract<BookHomeworkActivityBinding, { state: 'required' }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const isTitle = (value: unknown): value is string => typeof value === 'string' && TITLE.test(value);
const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isIso = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const isEnumerableData = (value: object, key: string): boolean => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return Boolean(descriptor?.enumerable && descriptor && 'value' in descriptor);
};

const push = (
  errors: BookHomeworkManifestValidationError[],
  code: BookHomeworkManifestValidationCode,
  path: string,
  message: string,
): void => { errors.push({ code, path, message }); };

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  errors: BookHomeworkManifestValidationError[],
): value is Record<string, unknown> => {
  if (!isRecord(value)) {
    push(errors, 'invalid-record', path, 'Expected a plain object.');
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      push(errors, typeof key === 'string' && PRIVATE_FIELD.test(key) ? 'invalid-value' : 'unknown-field', `${path}.${String(key)}`, 'Field is not allowed.');
    } else if (!isEnumerableData(value, key)) {
      push(errors, 'invalid-value', `${path}.${key}`, 'Field must be an enumerable data field.');
    }
  }
  for (const key of required) {
    if (!hasOwn(value, key) || !isEnumerableData(value, key)) push(errors, 'missing-field', `${path}.${key}`, 'Field is required.');
  }
  return true;
};

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => deepFreeze((value as Record<PropertyKey, unknown>)[key]));
  }
  return value;
};

const immutableClone = <T>(value: T): T => {
  const clone = typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
  return deepFreeze(clone);
};

function fail(
  code: BookHomeworkManifestValidationCode,
  path: string,
  message: string,
): never {
  throw new BookHomeworkManifestError(code, `${path}: ${message}`);
}

function assertId(value: unknown, path: string): asserts value is string {
  if (!isId(value)) fail('invalid-value', path, 'Expected a bounded safe identifier.');
}

function assertIso(value: unknown, path: string): asserts value is string {
  if (!isIso(value)) fail('invalid-value', path, 'Expected an ISO UTC timestamp.');
}

const compareNode = (left: BookHomeworkStructuralOutlineNode, right: BookHomeworkStructuralOutlineNode): number =>
  left.order - right.order || left.nodeKey.localeCompare(right.nodeKey);

const normalizeOutline = (
  input: readonly BookDeliveryStructuralNodeProjection[],
  path = 'outline',
): readonly BookHomeworkStructuralOutlineNode[] => {
  if (!Array.isArray(input) || input.length === 0) fail('invalid-value', path, 'A non-empty structural outline is required.');
  const nodes: BookHomeworkStructuralOutlineNode[] = input.map((node, index) => {
    if (!isRecord(node)) fail('invalid-record', `${path}[${index}]`, 'Expected a structural node.');
    const allowed = ['nodeKey', 'parentNodeKey', 'nodeType', 'order', 'titleSnapshot'];
    if (Reflect.ownKeys(node).some((key) => typeof key !== 'string' || !allowed.includes(key))) fail('unknown-field', `${path}[${index}]`, 'Structural node contains unsupported fields.');
    assertId(node.nodeKey, `${path}[${index}].nodeKey`);
    if (node.parentNodeKey !== null && !isId(node.parentNodeKey)) fail('invalid-value', `${path}[${index}].parentNodeKey`, 'Parent node key must be null or safe.');
    if (!NODE_TYPES.includes(node.nodeType as BookHomeworkStructuralNodeType)) fail('invalid-value', `${path}[${index}].nodeType`, 'Unsupported structural node type.');
    if (!isPositiveInt(node.order)) fail('invalid-value', `${path}[${index}].order`, 'Node order must be positive.');
    if (node.titleSnapshot !== undefined && !isTitle(node.titleSnapshot)) fail('invalid-value', `${path}[${index}].titleSnapshot`, 'Title snapshot is invalid.');
    return immutableClone({
      nodeKey: node.nodeKey,
      parentNodeKey: node.parentNodeKey,
      nodeType: node.nodeType as BookHomeworkStructuralNodeType,
      order: node.order,
      ...(node.titleSnapshot === undefined ? {} : { titleSnapshot: node.titleSnapshot }),
    });
  });
  const byKey = new Map<string, BookHomeworkStructuralOutlineNode>();
  const siblingOrders = new Map<string, Set<number>>();
  nodes.forEach((node, index) => {
    if (byKey.has(node.nodeKey)) fail('duplicate-id', `${path}[${index}].nodeKey`, 'Node key must be unique.');
    byKey.set(node.nodeKey, node);
    const siblingKey = node.parentNodeKey ?? '$root';
    const orders = siblingOrders.get(siblingKey) ?? new Set<number>();
    if (orders.has(node.order)) fail('duplicate-order', `${path}[${index}].order`, 'Sibling order must be unique.');
    orders.add(node.order);
    siblingOrders.set(siblingKey, orders);
  });
  nodes.forEach((node) => {
    if (node.parentNodeKey && !byKey.has(node.parentNodeKey)) fail('unknown-node', `${path}.${node.nodeKey}.parentNodeKey`, 'Parent node is missing.');
    const visited = new Set<string>();
    let current: BookHomeworkStructuralOutlineNode | undefined = node;
    while (current) {
      if (visited.has(current.nodeKey)) fail('cycle', `${path}.${node.nodeKey}`, 'Structural outline contains a cycle.');
      visited.add(current.nodeKey);
      current = current.parentNodeKey ? byKey.get(current.parentNodeKey) : undefined;
    }
  });
  const children = new Map<string, BookHomeworkStructuralOutlineNode[]>();
  nodes.forEach((node) => {
    const key = node.parentNodeKey ?? '$root';
    const entries = children.get(key) ?? [];
    entries.push(node);
    children.set(key, entries);
  });
  children.forEach((entries) => entries.sort(compareNode));
  const ordered: BookHomeworkStructuralOutlineNode[] = [];
  const visited = new Set<string>();
  const visit = (node: BookHomeworkStructuralOutlineNode): void => {
    if (visited.has(node.nodeKey)) return;
    visited.add(node.nodeKey);
    ordered.push(node);
    (children.get(node.nodeKey) ?? []).forEach(visit);
  };
  (children.get('$root') ?? []).forEach(visit);
  nodes.slice().sort(compareNode).forEach(visit);
  return immutableClone(ordered);
};

const ancestorsOf = (
  nodeKey: string,
  byKey: ReadonlyMap<string, BookHomeworkStructuralOutlineNode>,
): Set<string> => {
  const result = new Set<string>();
  let current = byKey.get(nodeKey);
  while (current) {
    if (result.has(current.nodeKey)) fail('cycle', `outline.${nodeKey}`, 'Structural outline contains a cycle.');
    result.add(current.nodeKey);
    current = current.parentNodeKey ? byKey.get(current.parentNodeKey) : undefined;
  }
  return result;
};

const findActivityTarget = (
  target: Extract<BookHomeworkSelectionTarget, { kind: 'activity' }>,
  activities: readonly BookRuntimeDeliveryActivityProjection[],
): BookRuntimeDeliveryActivityProjection => {
  const matches = activities.filter((activity) => activity.activityId === target.activityId
    && (target.placementId === undefined || activity.placementId === target.placementId));
  if (matches.length === 0) fail('invalid-target', 'selectedTarget', 'Activity target is not present in the Delivery projection.');
  if (matches.length > 1) fail('invalid-target', 'selectedTarget.placementId', 'Activity target must identify exactly one Placement.');
  return matches[0];
};

const targetNodeKeys = (
  target: BookHomeworkSelectionTarget,
  outline: readonly BookHomeworkStructuralOutlineNode[],
  activities: readonly BookRuntimeDeliveryActivityProjection[],
): Set<string> => {
  const byKey = new Map(outline.map((node) => [node.nodeKey, node]));
  if (target.kind === 'book') return new Set(outline.map((node) => node.nodeKey));
  if (target.kind === 'activity') {
    const placement = findActivityTarget(target, activities);
    return ancestorsOf(placement.nodeKey, byKey);
  }
  const selected = byKey.get(target.nodeKey);
  if (!selected) fail('unknown-node', 'selectedTarget.nodeKey', 'Target node is not present in the Delivery outline.');
  if (selected.nodeType !== target.kind) fail('invalid-target', 'selectedTarget.kind', 'Target kind does not match the trusted node type.');
  if (!TARGET_NODE_TYPES.has(target.kind)) fail('invalid-target', 'selectedTarget.kind', 'Placeholder nodes cannot be assigned.');
  const result = new Set<string>();
  const visit = (nodeKey: string): void => {
    if (result.has(nodeKey)) return;
    result.add(nodeKey);
    outline.filter((node) => node.parentNodeKey === nodeKey).forEach((node) => visit(node.nodeKey));
  };
  visit(selected.nodeKey);
  return result;
};

const sourceContextFor = (
  delivery: BookRuntimeDeliveryProjection,
  activity: BookRuntimeDeliveryActivityProjection,
): { readonly contexts: readonly BookHomeworkSourceContext[]; readonly sourceReadiness: BookHomeworkSourceReadiness; readonly pageGroupKeys: readonly string[] } => {
  const sources = new Map(delivery.sourceSet.sources.map((source) => [source.sourceKey, source]));
  const pageGroupKeys = activity.sourceContext.pageGroupKeys ?? [];
  if (pageGroupKeys.some((key) => !isId(key)) || new Set(pageGroupKeys).size !== pageGroupKeys.length) {
    fail('invalid-source-context', `activities.${activity.placementId}.sourceContext.pageGroupKeys`, 'Page Group keys must be unique safe identifiers.');
  }
  if (activity.contextMode === 'none' && (activity.sourceContext.sourcePageScopes.length > 0 || pageGroupKeys.length > 0)) {
    fail('invalid-source-context', `activities.${activity.placementId}`, 'Context-free Activity cannot carry source pages.');
  }
  if (activity.sourceContext.sourcePageScopes.length > 0 && !activity.sourceContext.available) {
    fail('invalid-source-context', `activities.${activity.placementId}.sourceContext.available`, 'Student-safe document delivery is unavailable.');
  }
  if (activity.contextMode === 'required' && (!activity.sourceContext.available || activity.sourceContext.sourcePageScopes.length === 0 || pageGroupKeys.length === 0)) {
    fail('invalid-source-context', `activities.${activity.placementId}.sourceContext`, 'Required Activity context needs ready source pages and Page Group identity.');
  }
  const contexts = activity.sourceContext.sourcePageScopes.map((scope, index) => {
    const source = sources.get(scope.sourceKey);
    if (!source) fail('invalid-source-context', `activities.${activity.placementId}.sourceContext[${index}]`, 'Source key is not bound by Delivery.');
    if (!Array.isArray(scope.pages) || scope.pages.length === 0 || scope.pages.some((page) => !isPositiveInt(page))) {
      fail('invalid-source-context', `activities.${activity.placementId}.sourceContext[${index}].pages`, 'Source pages must be positive.');
    }
    if (source.localPageScope.kind === 'pages' && scope.pages.some((page) => !source.localPageScope.pages.includes(page))) {
      fail('invalid-source-context', `activities.${activity.placementId}.sourceContext[${index}].pages`, 'Page is outside the pinned Source Version scope.');
    }
    return immutableClone({
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      ...(source.sourceOrder === undefined ? {} : { componentOrder: source.sourceOrder }),
      ...(source.ownerNodeKey === undefined ? {} : { ownerNodeKey: source.ownerNodeKey }),
      physicalPageNumbers: [...scope.pages].sort((left, right) => left - right),
    });
  });
  return immutableClone({
    contexts,
    pageGroupKeys,
    sourceReadiness: contexts.length === 0 ? 'not-required' as const : 'ready' as const,
  });
};

const validateActivityProjection = (
  delivery: BookRuntimeDeliveryProjection,
  activity: BookRuntimeDeliveryActivityProjection,
  outlineKeys: ReadonlySet<string>,
): void => {
  assertId(activity.placementId, `activities.${activity.placementId}.placementId`);
  assertId(activity.activityId, `activities.${activity.placementId}.activityId`);
  assertId(activity.nodeKey, `activities.${activity.placementId}.nodeKey`);
  if (!outlineKeys.has(activity.nodeKey)) fail('unknown-node', `activities.${activity.placementId}.nodeKey`, 'Activity node is absent from the Delivery outline.');
  if (!isPositiveInt(activity.activityVersion)) fail('invalid-version-pin', `activities.${activity.placementId}.activityVersion`, 'Activity version must be positive.');
  if (activity.activityVersionId !== undefined) assertId(activity.activityVersionId, `activities.${activity.placementId}.activityVersionId`);
  if (!isPositiveInt(activity.order)) fail('invalid-value', `activities.${activity.placementId}.order`, 'Activity order must be positive.');
  if (!['none', 'optional', 'required'].includes(activity.contextMode)) fail('invalid-value', `activities.${activity.placementId}.contextMode`, 'Activity context mode is invalid.');
  if (activity.titleSnapshot !== undefined && !isTitle(activity.titleSnapshot)) fail('invalid-value', `activities.${activity.placementId}.titleSnapshot`, 'Activity title snapshot is invalid.');
  sourceContextFor(delivery, activity);
};

const targetMatches = (
  target: BookHomeworkSelectionTarget,
  nodeKeys: ReadonlySet<string>,
  activity: BookRuntimeDeliveryActivityProjection,
): boolean => {
  if (target.kind === 'book') return true;
  if (target.kind === 'activity') return activity.activityId === target.activityId
    && (target.placementId === undefined || target.placementId === activity.placementId);
  return nodeKeys.has(activity.nodeKey);
};

const targetMatchesExcluded = (
  target: BookHomeworkSelectionTarget,
  nodeKeys: ReadonlySet<string>,
  candidate: BookHomeworkExcludedActivityCandidate,
): boolean => {
  if (target.kind === 'book') return true;
  if (target.kind === 'activity') return candidate.activityId === target.activityId
    && (target.placementId === undefined || candidate.placementId === target.placementId);
  return nodeKeys.has(candidate.nodeKey);
};

const validateTarget = (target: BookHomeworkSelectionTarget, bookId: string): void => {
  if (!isRecord(target)) fail('invalid-target', 'selectedTarget', 'Target must be a plain object.');
  if (!['book', 'section', 'chapter', 'unit', 'test', 'activity'].includes(target.kind as string)) fail('invalid-target', 'selectedTarget.kind', 'Unsupported assignment target.');
  if (target.bookId !== bookId) fail('invalid-target', 'selectedTarget.bookId', 'Target Book does not match Delivery.');
  if (target.kind === 'book') return;
  if (target.kind === 'activity') {
    assertId(target.activityId, 'selectedTarget.activityId');
    if (target.placementId !== undefined) assertId(target.placementId, 'selectedTarget.placementId');
    return;
  }
  assertId(target.nodeKey, 'selectedTarget.nodeKey');
};

const normalizeScheduleRules = (
  rules: readonly BookHomeworkScheduleRule[] | undefined,
  outline: readonly BookHomeworkStructuralOutlineNode[],
): readonly BookHomeworkScheduleRule[] => {
  if (!rules) return immutableClone([] as const);
  const outlineKeys = new Set(outline.map((node) => node.nodeKey));
  const seen = new Set<string>();
  const normalized = rules.map((rule, index) => {
    if (!isRecord(rule)) fail('invalid-record', `scheduleRules[${index}]`, 'Schedule rule must be a plain object.');
    assertId(rule.nodeKey, `scheduleRules[${index}].nodeKey`);
    if (!outlineKeys.has(rule.nodeKey)) fail('unknown-node', `scheduleRules[${index}].nodeKey`, 'Schedule rule node is absent from the manifest outline.');
    if (seen.has(rule.nodeKey)) fail('duplicate-id', `scheduleRules[${index}].nodeKey`, 'Only one schedule rule per node is allowed.');
    seen.add(rule.nodeKey);
    if (rule.availableFrom === undefined && rule.dueAt === undefined) fail('invalid-value', `scheduleRules[${index}]`, 'A schedule rule needs a release or due timestamp.');
    if (rule.availableFrom !== undefined) assertIso(rule.availableFrom, `scheduleRules[${index}].availableFrom`);
    if (rule.dueAt !== undefined) assertIso(rule.dueAt, `scheduleRules[${index}].dueAt`);
    return immutableClone({
      nodeKey: rule.nodeKey,
      ...(rule.availableFrom === undefined ? {} : { availableFrom: rule.availableFrom }),
      ...(rule.dueAt === undefined ? {} : { dueAt: rule.dueAt }),
    });
  });
  return immutableClone(normalized.sort((left, right) => left.nodeKey.localeCompare(right.nodeKey)));
};

const bindingSort = (
  left: BookHomeworkActivityBinding,
  right: BookHomeworkActivityBinding,
): number => left.order - right.order || left.nodeKey.localeCompare(right.nodeKey) || left.placementId.localeCompare(right.placementId);

const toRequiredBinding = (
  delivery: BookRuntimeDeliveryProjection,
  activity: BookRuntimeDeliveryActivityProjection,
): Extract<BookHomeworkActivityBinding, { state: 'required' }> => {
  if (activity.activityVersionId === undefined) fail('invalid-version-pin', `activities.${activity.placementId}.activityVersionId`, 'Book Homework requires an immutable Activity Version ID.');
  const source = sourceContextFor(delivery, activity);
  return immutableClone({
    bindingId: activity.placementId,
    placementId: activity.placementId,
    activityId: activity.activityId,
    activityVersion: activity.activityVersion,
    activityVersionId: activity.activityVersionId,
    nodeKey: activity.nodeKey,
    order: activity.order,
    ...(activity.titleSnapshot === undefined ? {} : { titleSnapshot: activity.titleSnapshot }),
    contextMode: activity.contextMode,
    pageGroupKeys: source.pageGroupKeys,
    sourceReadiness: source.sourceReadiness,
    state: 'required' as const,
    sourceContext: source.contexts,
  });
};

const validateExcludedCandidate = (
  candidate: BookHomeworkExcludedActivityCandidate,
  index: number,
  outlineKeys: ReadonlySet<string>,
): void => {
  assertId(candidate.placementId, `excludedActivities[${index}].placementId`);
  assertId(candidate.activityId, `excludedActivities[${index}].activityId`);
  assertId(candidate.nodeKey, `excludedActivities[${index}].nodeKey`);
  if (!outlineKeys.has(candidate.nodeKey)) fail('unknown-node', `excludedActivities[${index}].nodeKey`, 'Excluded Activity node is absent from the outline.');
  if (!isPositiveInt(candidate.order)) fail('invalid-value', `excludedActivities[${index}].order`, 'Excluded Activity order must be positive.');
  if (candidate.contextMode !== undefined && !['none', 'optional', 'required'].includes(candidate.contextMode)) fail('invalid-value', `excludedActivities[${index}].contextMode`, 'Excluded Activity context mode is invalid.');
  if (candidate.titleSnapshot !== undefined && !isTitle(candidate.titleSnapshot)) fail('invalid-value', `excludedActivities[${index}].titleSnapshot`, 'Excluded Activity title snapshot is invalid.');
  if (!EXCLUSION_REASONS.includes(candidate.reason)) fail('invalid-value', `excludedActivities[${index}].reason`, 'Excluded Activity reason is invalid.');
};

const toExcludedBinding = (
  candidate: BookHomeworkExcludedActivityCandidate,
): Extract<BookHomeworkActivityBinding, { state: 'excluded' }> => immutableClone({
  bindingId: candidate.placementId,
  placementId: candidate.placementId,
  activityId: candidate.activityId,
  nodeKey: candidate.nodeKey,
  order: candidate.order,
  ...(candidate.titleSnapshot === undefined ? {} : { titleSnapshot: candidate.titleSnapshot }),
  contextMode: candidate.contextMode ?? 'none',
  pageGroupKeys: [],
  sourceReadiness: 'unavailable' as const,
  state: 'excluded' as const,
  exclusionReason: candidate.reason,
});

const selectedOutline = (
  target: BookHomeworkSelectionTarget,
  outline: readonly BookHomeworkStructuralOutlineNode[],
  selectedNodeKeys: ReadonlySet<string>,
  activities: readonly BookRuntimeDeliveryActivityProjection[],
): readonly BookHomeworkStructuralOutlineNode[] => {
  const selected = outline.filter((node) => selectedNodeKeys.has(node.nodeKey));
  const selectedSet = new Set(selected.map((node) => node.nodeKey));
  const detachedRoots = selected.map((node) => node.parentNodeKey && !selectedSet.has(node.parentNodeKey)
    ? { ...node, parentNodeKey: null }
    : node);
  if (target.kind !== 'activity') return immutableClone(detachedRoots);
  findActivityTarget(target, activities);
  return immutableClone(detachedRoots);
};

const assertDelivery = (
  delivery: BookRuntimeDeliveryProjection,
  outline: readonly BookHomeworkStructuralOutlineNode[],
): void => {
  if (delivery.schemaVersion !== 1 || delivery.projectionKind !== 'book-runtime-delivery') fail('invalid-publication', 'delivery', 'Unsupported Delivery projection.');
  if (delivery.context.kind !== 'homework' || delivery.context.entitlementBasis !== 'assignment') fail('invalid-target', 'delivery.context', 'Book Homework requires a homework Delivery context.');
  if (delivery.book.bookMode !== 'pdf' || delivery.book.publicationStatus !== 'published' || !isPositiveInt(delivery.book.publicationRevision)) fail('invalid-publication', 'delivery.book', 'Only a published Mode 2 Book may be assigned.');
  if (!Array.isArray(delivery.activities) || delivery.activities.length === 0) fail('invalid-value', 'delivery.activities', 'Delivery must resolve at least one Activity.');
  const outlineKeys = new Set(outline.map((node) => node.nodeKey));
  const placements = new Set<string>();
  delivery.activities.forEach((activity) => {
    if (placements.has(activity.placementId)) fail('duplicate-id', `delivery.activities.${activity.placementId}`, 'Placement IDs must be unique.');
    placements.add(activity.placementId);
    validateActivityProjection(delivery, activity, outlineKeys);
  });
};

export const createBookHomeworkManifest = (
  input: CreateBookHomeworkManifestInput,
): BookHomeworkManifest => {
  const { delivery } = input.resolution;
  assertId(input.manifestVersionId, 'manifestVersionId');
  assertId(input.ownerId, 'ownerId');
  assertId(input.createdByCommandId, 'createdByCommandId');
  assertIso(input.createdAt, 'createdAt');
  if (!isPositiveInt(input.bindingRevision)) fail('invalid-value', 'bindingRevision', 'Binding revision must be positive.');
  validateTarget(input.target, delivery.book.bookId);
  const outline = normalizeOutline(delivery.outline ?? []);
  assertDelivery(delivery, outline);
  const outlineByKey = new Map(outline.map((node) => [node.nodeKey, node]));
  const selectedNodeKeys = targetNodeKeys(input.target, outline, delivery.activities);
  const selectedActivities = input.target.kind === 'activity'
    ? [findActivityTarget(input.target, delivery.activities)]
    : delivery.activities.filter((activity) => targetMatches(input.target, selectedNodeKeys, activity));
  if (selectedActivities.length === 0) fail('invalid-target', 'selectedTarget', 'Target resolves no eligible published Activities.');
  const requiredBindings = selectedActivities.map((activity) => toRequiredBinding(delivery, activity));
  const excludedCandidates = input.excludedActivities ?? [];
  const excludedPlacements = new Set<string>();
  const excludedBindings = excludedCandidates.flatMap((candidate, index) => {
    validateExcludedCandidate(candidate, index, new Set(outlineByKey.keys()));
    if (!targetMatchesExcluded(input.target, selectedNodeKeys, candidate)) return [];
    if (excludedPlacements.has(candidate.placementId) || requiredBindings.some((binding) => binding.placementId === candidate.placementId)) {
      fail('duplicate-id', `excludedActivities[${index}].placementId`, 'Placement cannot be both required and excluded or occur twice.');
    }
    excludedPlacements.add(candidate.placementId);
    return [toExcludedBinding(candidate)];
  });
  const bindings = immutableClone([...requiredBindings, ...excludedBindings].sort(bindingSort));
  const manifest: BookHomeworkManifest = immutableClone({
    schemaVersion: BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION,
    assignmentKind: BOOK_HOMEWORK_ASSIGNMENT_KIND,
    manifestVersionId: input.manifestVersionId,
    ownerId: input.ownerId,
    createdByCommandId: input.createdByCommandId,
    createdAt: input.createdAt,
    bindingRevision: input.bindingRevision,
    book: immutableClone({ ...delivery.book }),
    context: immutableClone({
      contextId: delivery.context.contextId,
      recipientId: delivery.recipientId,
      kind: 'homework' as const,
      entitlementBasis: 'assignment' as const,
    }),
    selectedTarget: immutableClone({ ...input.target }),
    outline: selectedOutline(input.target, outline, selectedNodeKeys, delivery.activities),
    scheduleRules: normalizeScheduleRules(input.scheduleRules, outline),
    bindings,
    completion: immutableClone({
      aggregation: 'required-activities-submitted-over-required-activities' as const,
      requiredBindingCount: bindings.filter((binding) => binding.state === 'required').length,
      excludedBindingCount: bindings.filter((binding) => binding.state === 'excluded').length,
      legacyScoreFields: 'untouched' as const,
    }),
  });
  const validation = validateBookHomeworkManifest(manifest);
  if (!validation.valid) fail(validation.errors[0].code, validation.errors[0].path, validation.errors[0].message);
  return manifest;
};

const validateTargetValue = (
  value: unknown,
  path: string,
  errors: BookHomeworkManifestValidationError[],
  bookId: string,
): value is BookHomeworkSelectionTarget => {
  if (!isRecord(value)) {
    push(errors, 'invalid-record', path, 'Target must be a plain object.');
    return false;
  }
  if (value.bookId !== bookId || !isId(value.bookId)) push(errors, 'invalid-target', `${path}.bookId`, 'Target Book is invalid.');
  const kind = value.kind;
  if (kind === 'book') {
    if (!exact(value, ['bookId', 'kind'], [], path, errors)) return false;
    return true;
  }
  if (kind === 'activity') {
    if (!exact(value, ['activityId', 'bookId', 'kind'], ['placementId'], path, errors)) return false;
    if (!isId(value.activityId)) push(errors, 'invalid-value', `${path}.activityId`, 'Activity ID is invalid.');
    if (value.placementId !== undefined && !isId(value.placementId)) push(errors, 'invalid-value', `${path}.placementId`, 'Placement ID is invalid.');
    return true;
  }
  if (typeof kind === 'string' && TARGET_NODE_TYPES.has(kind as BookHomeworkSelectionTarget['kind'])) {
    if (!exact(value, ['bookId', 'kind', 'nodeKey'], [], path, errors)) return false;
    if (!isId(value.nodeKey)) push(errors, 'invalid-value', `${path}.nodeKey`, 'Node key is invalid.');
    return true;
  }
  push(errors, 'invalid-target', `${path}.kind`, 'Target kind is unsupported.');
  return false;
};

const validateSourceContextValue = (
  value: unknown,
  path: string,
  errors: BookHomeworkManifestValidationError[],
): boolean => {
  if (!exact(value, ['physicalPageNumbers', 'sourceKey', 'sourceVersionId'], ['componentOrder', 'ownerNodeKey'], path, errors)) return false;
  const source = value as Record<string, unknown>;
  if (!isId(source.sourceKey) || !isId(source.sourceVersionId)) push(errors, 'invalid-source-context', path, 'Source identity is invalid.');
  if (!Array.isArray(source.physicalPageNumbers) || source.physicalPageNumbers.length === 0 || source.physicalPageNumbers.some((page) => !isPositiveInt(page))) push(errors, 'invalid-source-context', `${path}.physicalPageNumbers`, 'Physical source pages are invalid.');
  if (source.componentOrder !== undefined && !isPositiveInt(source.componentOrder)) push(errors, 'invalid-source-context', `${path}.componentOrder`, 'Component order is invalid.');
  if (source.ownerNodeKey !== undefined && !isId(source.ownerNodeKey)) push(errors, 'invalid-source-context', `${path}.ownerNodeKey`, 'Owner node key is invalid.');
  return true;
};

const validateOutlineValue = (
  value: unknown,
  path: string,
  errors: BookHomeworkManifestValidationError[],
): readonly BookHomeworkStructuralOutlineNode[] => {
  if (!Array.isArray(value) || value.length === 0) {
    push(errors, 'invalid-value', path, 'Manifest outline must be non-empty.');
    return [];
  }
  const nodes: BookHomeworkStructuralOutlineNode[] = [];
  const keys = new Set<string>();
  const orders = new Map<string, Set<number>>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!exact(entry, ['nodeKey', 'nodeType', 'order', 'parentNodeKey'], ['titleSnapshot'], entryPath, errors)) return;
    const node = entry as Record<string, unknown>;
    if (!isId(node.nodeKey)) push(errors, 'invalid-value', `${entryPath}.nodeKey`, 'Node key is invalid.');
    else if (keys.has(node.nodeKey)) push(errors, 'duplicate-id', `${entryPath}.nodeKey`, 'Node key must be unique.');
    else keys.add(node.nodeKey);
    if (node.parentNodeKey !== null && !isId(node.parentNodeKey)) push(errors, 'invalid-value', `${entryPath}.parentNodeKey`, 'Parent node key is invalid.');
    if (!NODE_TYPES.includes(node.nodeType as BookHomeworkStructuralNodeType)) push(errors, 'invalid-value', `${entryPath}.nodeType`, 'Node type is invalid.');
    if (!isPositiveInt(node.order)) push(errors, 'invalid-value', `${entryPath}.order`, 'Node order is invalid.');
    if (node.titleSnapshot !== undefined && !isTitle(node.titleSnapshot)) push(errors, 'invalid-value', `${entryPath}.titleSnapshot`, 'Title snapshot is invalid.');
    const siblingKey = typeof node.parentNodeKey === 'string' ? node.parentNodeKey : '$root';
    const siblingOrders = orders.get(siblingKey) ?? new Set<number>();
    if (isPositiveInt(node.order) && siblingOrders.has(node.order)) push(errors, 'duplicate-order', `${entryPath}.order`, 'Sibling order must be unique.');
    if (isPositiveInt(node.order)) siblingOrders.add(node.order);
    orders.set(siblingKey, siblingOrders);
    nodes.push(node as unknown as BookHomeworkStructuralOutlineNode);
  });
  const byKey = new Map(nodes.map((node) => [node.nodeKey, node]));
  nodes.forEach((node, index) => {
    if (node.parentNodeKey && !byKey.has(node.parentNodeKey)) push(errors, 'unknown-node', `${path}[${index}].parentNodeKey`, 'Parent node is missing.');
    const seen = new Set<string>();
    let current: BookHomeworkStructuralOutlineNode | undefined = node;
    while (current) {
      if (seen.has(current.nodeKey)) {
        push(errors, 'cycle', `${path}[${index}]`, 'Outline contains a cycle.');
        break;
      }
      seen.add(current.nodeKey);
      current = current.parentNodeKey ? byKey.get(current.parentNodeKey) : undefined;
    }
  });
  return nodes;
};

const validateBindingValue = (
  value: unknown,
  path: string,
  errors: BookHomeworkManifestValidationError[],
  outlineKeys: ReadonlySet<string>,
): value is BookHomeworkActivityBinding => {
  if (!isRecord(value)) {
    push(errors, 'invalid-record', path, 'Binding must be a plain object.');
    return false;
  }
  const state = value.state;
  const requiredFields = ['activityId', 'bindingId', 'contextMode', 'nodeKey', 'order', 'pageGroupKeys', 'placementId', 'sourceReadiness', 'state'];
  const optionalFields = ['activityVersion', 'activityVersionId', 'sourceContext', 'titleSnapshot'];
  if (state === 'required') {
    exact(value, [...requiredFields, 'activityVersion', 'activityVersionId', 'sourceContext'], optionalFields.filter((field) => !['activityVersion', 'activityVersionId', 'sourceContext'].includes(field)), path, errors);
  } else if (state === 'excluded') {
    exact(value, [...requiredFields, 'exclusionReason'], [...optionalFields], path, errors);
  } else {
    push(errors, 'invalid-value', `${path}.state`, 'Binding state is invalid.');
    return false;
  }
  if (!isId(value.bindingId) || !isId(value.placementId) || !isId(value.activityId) || !isId(value.nodeKey)) push(errors, 'invalid-value', path, 'Binding identity is invalid.');
  if (typeof value.nodeKey === 'string' && !outlineKeys.has(value.nodeKey)) push(errors, 'unknown-node', `${path}.nodeKey`, 'Binding node is absent from outline.');
  if (!isPositiveInt(value.order)) push(errors, 'invalid-value', `${path}.order`, 'Binding order is invalid.');
  if (!['none', 'optional', 'required'].includes(value.contextMode as string)) push(errors, 'invalid-value', `${path}.contextMode`, 'Binding context mode is invalid.');
  const pageGroupKeys = Array.isArray(value.pageGroupKeys) ? value.pageGroupKeys : [];
  if (!Array.isArray(value.pageGroupKeys) || pageGroupKeys.some((key) => !isId(key)) || new Set(pageGroupKeys).size !== pageGroupKeys.length) push(errors, 'invalid-source-context', `${path}.pageGroupKeys`, 'Page Group keys are invalid.');
  if (!['ready', 'unavailable', 'not-required'].includes(value.sourceReadiness as string)) push(errors, 'invalid-source-context', `${path}.sourceReadiness`, 'Source readiness is invalid.');
  if (value.titleSnapshot !== undefined && !isTitle(value.titleSnapshot)) push(errors, 'invalid-value', `${path}.titleSnapshot`, 'Title snapshot is invalid.');
  if (value.activityVersion !== undefined && !isPositiveInt(value.activityVersion)) push(errors, 'invalid-version-pin', `${path}.activityVersion`, 'Activity version is invalid.');
  if (value.activityVersionId !== undefined && !isId(value.activityVersionId)) push(errors, 'invalid-version-pin', `${path}.activityVersionId`, 'Activity Version ID is invalid.');
  if (state === 'required') {
    if (!isPositiveInt(value.activityVersion) || !isId(value.activityVersionId)) push(errors, 'invalid-version-pin', path, 'Required binding must pin an Activity Version ID and number.');
    if (!Array.isArray(value.sourceContext)) push(errors, 'invalid-source-context', `${path}.sourceContext`, 'Required binding needs source context array.');
    else value.sourceContext.forEach((source, index) => validateSourceContextValue(source, `${path}.sourceContext[${index}]`, errors));
    if (value.contextMode === 'required' && (value.sourceReadiness !== 'ready' || pageGroupKeys.length === 0 || Array.isArray(value.sourceContext) && value.sourceContext.length === 0)) push(errors, 'invalid-source-context', `${path}.sourceContext`, 'Required context needs ready source pages and Page Group identity.');
    if (value.contextMode === 'none' && (value.sourceReadiness !== 'not-required' || pageGroupKeys.length > 0 || Array.isArray(value.sourceContext) && value.sourceContext.length > 0)) push(errors, 'invalid-source-context', path, 'Context-free binding cannot carry source authority.');
  } else {
    if (!EXCLUSION_REASONS.includes(value.exclusionReason as BookHomeworkExclusionReason)) push(errors, 'invalid-value', `${path}.exclusionReason`, 'Exclusion reason is invalid.');
    if (value.sourceReadiness !== 'unavailable' || pageGroupKeys.length > 0) push(errors, 'invalid-source-context', path, 'Excluded binding cannot claim usable source context.');
    if (value.sourceContext !== undefined) {
      if (!Array.isArray(value.sourceContext)) push(errors, 'invalid-source-context', `${path}.sourceContext`, 'Source context must be an array.');
      else value.sourceContext.forEach((source, index) => validateSourceContextValue(source, `${path}.sourceContext[${index}]`, errors));
    }
  }
  return true;
};

export const validateBookHomeworkManifest = (value: unknown): BookHomeworkManifestValidationResult => {
  const errors: BookHomeworkManifestValidationError[] = [];
  if (!exact(value, [
    'assignmentKind', 'bindingRevision', 'book', 'completion', 'context', 'createdAt',
    'createdByCommandId', 'manifestVersionId', 'outline', 'ownerId', 'scheduleRules', 'schemaVersion',
    'selectedTarget', 'bindings',
  ], [], '$', errors)) return { valid: false, errors: immutableClone(errors) };
  const manifest = value as Record<string, unknown>;
  if (manifest.schemaVersion !== BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION) push(errors, 'invalid-value', '$.schemaVersion', 'Unsupported manifest schema version.');
  if (manifest.assignmentKind !== BOOK_HOMEWORK_ASSIGNMENT_KIND) push(errors, 'invalid-value', '$.assignmentKind', 'Unsupported assignment kind.');
  if (!isId(manifest.manifestVersionId) || !isId(manifest.ownerId) || !isId(manifest.createdByCommandId)) push(errors, 'invalid-value', '$', 'Manifest identity fields are invalid.');
  if (!isIso(manifest.createdAt)) push(errors, 'invalid-value', '$.createdAt', 'Creation time is invalid.');
  if (!isPositiveInt(manifest.bindingRevision)) push(errors, 'invalid-value', '$.bindingRevision', 'Binding revision is invalid.');
  if (!exact(manifest.book, ['bookId', 'bookMode', 'bookRevision', 'publicationId', 'publicationRevision', 'publicationStatus'], [], '$.book', errors)) {
    // Nested errors are already recorded.
  } else {
    const book = manifest.book as Record<string, unknown>;
    if (!isId(book.bookId) || book.bookMode !== 'pdf' || !Number.isSafeInteger(book.bookRevision) || (book.bookRevision as number) < 0 || !isId(book.publicationId) || !isPositiveInt(book.publicationRevision) || book.publicationStatus !== 'published') push(errors, 'invalid-publication', '$.book', 'Book publication reference is invalid.');
  }
  const bookId = isRecord(manifest.book) && typeof manifest.book.bookId === 'string' ? manifest.book.bookId : '';
  exact(manifest.context, ['contextId', 'entitlementBasis', 'kind', 'recipientId'], [], '$.context', errors);
  if (isRecord(manifest.context) && (!isId(manifest.context.contextId) || !isId(manifest.context.recipientId) || manifest.context.kind !== 'homework' || manifest.context.entitlementBasis !== 'assignment')) push(errors, 'invalid-value', '$.context', 'Homework context is invalid.');
  const targetValid = validateTargetValue(manifest.selectedTarget, '$.selectedTarget', errors, bookId);
  const outline = validateOutlineValue(manifest.outline, '$.outline', errors);
  const outlineKeys = new Set(outline.map((node) => node.nodeKey));
  const validatedBindings: BookHomeworkActivityBinding[] = [];
  if (!Array.isArray(manifest.scheduleRules)) push(errors, 'invalid-value', '$.scheduleRules', 'Schedule rules must be an array.');
  else {
    try { normalizeScheduleRules(manifest.scheduleRules as readonly BookHomeworkScheduleRule[], outline); } catch (error) {
      if (error instanceof BookHomeworkManifestError) push(errors, error.code, error.message.split(': ')[0] ?? '$.scheduleRules', error.message);
      else push(errors, 'invalid-value', '$.scheduleRules', 'Schedule rules are invalid.');
    }
  }
  if (!Array.isArray(manifest.bindings) || manifest.bindings.length === 0) push(errors, 'invalid-value', '$.bindings', 'Manifest needs at least one binding.');
  else {
    const placementIds = new Set<string>();
    const bindingIds = new Set<string>();
    (manifest.bindings as readonly unknown[]).forEach((binding, index) => {
      if (validateBindingValue(binding, `$.bindings[${index}]`, errors, outlineKeys)) {
        validatedBindings.push(binding);
        if (placementIds.has(binding.placementId)) push(errors, 'duplicate-id', `$.bindings[${index}].placementId`, 'Placement ID must be unique.');
        if (bindingIds.has(binding.bindingId)) push(errors, 'duplicate-id', `$.bindings[${index}].bindingId`, 'Binding ID must be unique.');
        placementIds.add(binding.placementId); bindingIds.add(binding.bindingId);
      }
    });
  }
  if (targetValid && Array.isArray(manifest.bindings) && validatedBindings.length === manifest.bindings.length) {
    const target = manifest.selectedTarget as BookHomeworkSelectionTarget;
    const byKey = new Map(outline.map((node) => [node.nodeKey, node]));
    if (target.kind === 'activity') {
      const matching = validatedBindings.filter((binding) => binding.activityId === target.activityId
        && (target.placementId === undefined || binding.placementId === target.placementId));
      if (matching.length !== 1 || validatedBindings.length !== 1) {
        push(errors, 'invalid-target', '$.bindings', 'Activity target must freeze exactly one matching Placement.');
      }
    } else if (target.kind !== 'book') {
      const root = byKey.get(target.nodeKey);
      if (!root || root.nodeType !== target.kind) {
        push(errors, 'invalid-target', '$.selectedTarget', 'Structural target must match a node in the frozen outline.');
      } else {
        const selected = new Set<string>();
        const visit = (nodeKey: string): void => {
          if (selected.has(nodeKey)) return;
          selected.add(nodeKey);
          outline.filter((node) => node.parentNodeKey === nodeKey).forEach((node) => visit(node.nodeKey));
        };
        visit(root.nodeKey);
        if (outline.some((node) => !selected.has(node.nodeKey))) push(errors, 'invalid-target', '$.outline', 'Frozen outline contains nodes outside the selected structural target.');
        if (validatedBindings.some((binding) => !selected.has(binding.nodeKey))) push(errors, 'invalid-target', '$.bindings', 'Binding is outside the selected structural target.');
      }
    }
  }
  if (!exact(manifest.completion, ['aggregation', 'excludedBindingCount', 'legacyScoreFields', 'requiredBindingCount'], [], '$.completion', errors)) {
    // Nested errors are already recorded.
  } else if (isRecord(manifest.completion)) {
    const completion = manifest.completion;
    const bindings = validatedBindings;
    if (completion.aggregation !== 'required-activities-submitted-over-required-activities' || completion.legacyScoreFields !== 'untouched') push(errors, 'legacy-score-contamination', '$.completion', 'Book completion must stay separate from legacy score fields.');
    if (completion.requiredBindingCount !== bindings.filter((binding) => binding.state === 'required').length || completion.excludedBindingCount !== bindings.filter((binding) => binding.state === 'excluded').length) push(errors, 'invalid-value', '$.completion', 'Completion counts do not reconcile with bindings.');
  }
  return { valid: errors.length === 0, errors: immutableClone(errors) };
};

export function assertValidBookHomeworkManifest(
  value: unknown,
): asserts value is BookHomeworkManifest {
  const result = validateBookHomeworkManifest(value);
  if (!result.valid) throw new BookHomeworkManifestError(result.errors[0].code, `${result.errors[0].path}: ${result.errors[0].message}`);
}

export const toStudentSafeBookHomeworkProjection = (
  manifest: BookHomeworkManifest,
): BookHomeworkStudentSafeProjection => {
  assertValidBookHomeworkManifest(manifest);
  return immutableClone({
    schemaVersion: manifest.schemaVersion,
    assignmentKind: manifest.assignmentKind,
    manifestVersionId: manifest.manifestVersionId,
    book: {
      bookId: manifest.book.bookId,
      bookRevision: manifest.book.bookRevision,
      publicationId: manifest.book.publicationId,
      publicationRevision: manifest.book.publicationRevision,
    },
    context: {
      contextId: manifest.context.contextId,
      recipientId: manifest.context.recipientId,
      kind: manifest.context.kind,
    },
    selectedTarget: manifest.selectedTarget,
    outline: manifest.outline,
    scheduleRules: manifest.scheduleRules,
    bindings: manifest.bindings,
    completion: manifest.completion,
  });
};

export const serializeBookHomeworkManifest = (manifest: BookHomeworkManifest): string => {
  assertValidBookHomeworkManifest(manifest);
  return JSON.stringify(manifest);
};

export const parseBookHomeworkManifest = (serialized: string): BookHomeworkManifest => {
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { throw new BookHomeworkManifestError('invalid-record', 'Manifest JSON is malformed.'); }
  assertValidBookHomeworkManifest(value);
  return immutableClone(value);
};

export const advanceBookHomeworkActivityBinding = (
  manifest: BookHomeworkManifest,
  input: AdvanceBookHomeworkActivityBindingInput,
): BookHomeworkManifest => {
  assertValidBookHomeworkManifest(manifest);
  assertId(input.manifestVersionId, 'manifestVersionId');
  assertId(input.createdByCommandId, 'createdByCommandId');
  assertIso(input.createdAt, 'createdAt');
  if (!isPositiveInt(input.bindingRevision) || input.bindingRevision <= manifest.bindingRevision) fail('invalid-value', 'bindingRevision', 'Explicit updates must advance the manifest binding revision.');
  assertId(input.placementId, 'placementId');
  const index = manifest.bindings.findIndex((binding) => binding.placementId === input.placementId);
  if (index < 0) fail('invalid-target', 'placementId', 'Placement is not present in the manifest.');
  const previous = manifest.bindings[index];
  if (previous.state !== 'required') fail('invalid-target', 'placementId', 'Excluded bindings cannot advance without an explicit inclusion operation.');
  const next = input.nextBinding;
  if (next.state !== 'required' || next.bindingId !== previous.bindingId || next.placementId !== previous.placementId || next.activityId !== previous.activityId || next.nodeKey !== previous.nodeKey || next.order !== previous.order) {
    fail('invalid-version-pin', 'nextBinding', 'An Activity update may advance its version, not move its placement identity.');
  }
  if (!isPositiveInt(next.activityVersion) || next.activityVersion <= previous.activityVersion || next.activityVersionId === previous.activityVersionId) {
    fail('invalid-version-pin', 'nextBinding', 'An Activity update must use a later Activity Version and a new immutable Version ID.');
  }
  const bindings = manifest.bindings.slice();
  bindings[index] = immutableClone(next);
  const updated: BookHomeworkManifest = deepFreeze({
    ...manifest,
    manifestVersionId: input.manifestVersionId,
    createdByCommandId: input.createdByCommandId,
    createdAt: input.createdAt,
    bindingRevision: input.bindingRevision,
    bindings: deepFreeze(bindings),
  });
  assertValidBookHomeworkManifest(updated);
  return updated;
};

export const isBookHomeworkAssignment = (
  value: Pick<{
    assignmentKind?: string;
    bookManifest?: unknown;
  }, 'assignmentKind' | 'bookManifest'>,
): value is { assignmentKind: typeof BOOK_HOMEWORK_ASSIGNMENT_KIND; bookManifest: BookHomeworkManifest } =>
  value.assignmentKind === BOOK_HOMEWORK_ASSIGNMENT_KIND && Boolean(value.bookManifest);
