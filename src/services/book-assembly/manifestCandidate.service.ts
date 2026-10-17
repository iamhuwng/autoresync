import {
  BOOK_ASSEMBLY_LIMITS,
  BOOK_CONTENT_NODE_TYPES,
  PAGE_GROUP_MODES,
  ACTIVITY_CONTEXT_REQUIREMENTS,
  type BookAssemblyManifestCandidate,
  type BookAssemblyValidationError,
  type BookAssemblyValidationResult,
  type BookContentTreeNodeCandidate,
  type BookPageGroupCandidate,
  type BookSourceVersionAuthority,
} from '../../types/bookAssembly.types';
import { validateSourceSetCandidate } from './sourceSet.service';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const MAX_DEPTH = 64;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const error = (
  code: BookAssemblyValidationError['code'],
  path: string,
  message: string,
): BookAssemblyValidationError => ({ code, path, message });

const exactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const allowed = new Set([...required, ...optional]);
  return Object.keys(value).every((key) => allowed.has(key))
    && required.every((key) => Object.hasOwn(value, key));
};

const boundedId = (value: unknown): value is string => (
  typeof value === 'string' && value.length <= BOOK_ASSEMBLY_LIMITS.maxKeyLength && ID.test(value)
);

const pageNumber = (value: unknown): value is number => (
  Number.isSafeInteger(value) && (value as number) >= 1
);

const sortedErrors = (errors: readonly BookAssemblyValidationError[]): readonly BookAssemblyValidationError[] => (
  [...errors].sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code))
);

const ancestorOrSelf = (
  nodeKey: string,
  ownerNodeKey: string,
  parents: ReadonlyMap<string, string | null>,
): boolean => {
  const seen = new Set<string>();
  let current: string | null | undefined = nodeKey;
  while (current !== null && current !== undefined) {
    if (current === ownerNodeKey) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
};

const trustedSources = (
  candidate: BookAssemblyManifestCandidate,
  authority: BookSourceVersionAuthority,
): Map<string, { readonly sourceVersionId: string; readonly physicalPageCount: number; readonly ownerNodeKey?: string }> => {
  const result = new Map<string, { readonly sourceVersionId: string; readonly physicalPageCount: number; readonly ownerNodeKey?: string }>();
  candidate.sourceSet.sources.forEach((source) => {
    const trusted = authority.getSourceVersion(source.sourceVersionId);
    if (trusted) {
      result.set(source.sourceKey, {
        sourceVersionId: source.sourceVersionId,
        physicalPageCount: trusted.physicalPageCount,
        ...('ownerNodeKey' in source && typeof source.ownerNodeKey === 'string'
          ? { ownerNodeKey: source.ownerNodeKey }
          : {}),
      });
    }
  });
  return result;
};

/** Validates the current Book Assembly Manifest Candidate contract. */
export const validateBookAssemblyManifestCandidate = (
  manifest: unknown,
  sourceVersionAuthority: BookSourceVersionAuthority,
): BookAssemblyValidationResult => {
  const errors: BookAssemblyValidationError[] = [];
  if (!isRecord(manifest)) {
    return { valid: false, errors: [error('invalid-record', '$', 'Manifest must be an object.')] };
  }
  if (!exactKeys(manifest, ['bookId', 'sourceSet', 'nodes', 'units'])) {
    errors.push(error('unknown-field', '$', 'Manifest contains unknown or missing fields.'));
  }
  let serialized = '';
  try {
    serialized = JSON.stringify(manifest);
  } catch {
    errors.push(error('invalid-record', '$', 'Manifest must be serializable JSON.'));
  }
  if (serialized && new TextEncoder().encode(serialized).byteLength > BOOK_ASSEMBLY_LIMITS.maxCandidateBytes) {
    errors.push(error('payload-too-large', '$', 'Manifest exceeds the candidate size limit.'));
  }
  const bookId = manifest.bookId;
  if (!boundedId(bookId)) {
    errors.push(error('invalid-value', '$.bookId', 'Book ID must be a bounded identifier.'));
  }
  if (!Array.isArray(manifest.nodes)) {
    errors.push(error('invalid-record', '$.nodes', 'Manifest nodes must be an array.'));
  }
  if (!Array.isArray(manifest.units)) {
    errors.push(error('invalid-record', '$.units', 'Manifest units must be an array.'));
  }
  if (!isRecord(manifest.sourceSet)) {
    errors.push(error('invalid-record', '$.sourceSet', 'Manifest Source Set is required.'));
  }
  if (!boundedId(bookId) || !isRecord(manifest.sourceSet)) {
    return { valid: false, errors: sortedErrors(errors) };
  }

  const sourceSetValidation = validateSourceSetCandidate(manifest.sourceSet, {
    bookId,
    sourceVersionAuthority,
  });
  errors.push(...sourceSetValidation.errors.map((entry) => ({
    ...entry,
    path: entry.path.replace(/^\$\.sourceSet/u, '$.sourceSet'),
  })));
  const candidate = manifest as unknown as BookAssemblyManifestCandidate;
  const sources = trustedSources(candidate, sourceVersionAuthority);
  const nodes = Array.isArray(manifest.nodes) ? manifest.nodes : [];
  const units = Array.isArray(manifest.units) ? manifest.units : [];
  if (nodes.length === 0) errors.push(error('missing-field', '$.nodes', 'Manifest must contain at least one content node.'));
  if (units.length === 0) errors.push(error('missing-field', '$.units', 'Manifest must contain at least one Unit.'));
  if (nodes.length > BOOK_ASSEMBLY_LIMITS.maxNodes) errors.push(error('limit-exceeded', '$.nodes', 'Manifest exceeds the node limit.'));
  if (units.length > BOOK_ASSEMBLY_LIMITS.maxUnits) errors.push(error('limit-exceeded', '$.units', 'Manifest exceeds the Unit limit.'));

  const nodeByKey = new Map<string, BookContentTreeNodeCandidate>();
  const parents = new Map<string, string | null>();
  const nodeSiblingOrders = new Set<string>();
  nodes.forEach((rawNode, index) => {
    const path = `$.nodes[${index}]`;
    if (!isRecord(rawNode)) {
      errors.push(error('invalid-record', path, 'Content node must be an object.'));
      return;
    }
    if (!exactKeys(rawNode, ['nodeKey', 'parentNodeKey', 'nodeType', 'order'])) {
      errors.push(error('unknown-field', path, 'Content node contains unknown or missing fields.'));
    }
    const nodeKey = rawNode.nodeKey;
    const parentNodeKey = rawNode.parentNodeKey;
    const nodeType = rawNode.nodeType;
    const order = rawNode.order;
    if (!boundedId(nodeKey)) errors.push(error('invalid-value', `${path}.nodeKey`, 'Node key must be a bounded identifier.'));
    else if (nodeByKey.has(nodeKey)) errors.push(error('duplicate-key', `${path}.nodeKey`, 'Node keys must be unique.'));
    if (parentNodeKey !== null && !boundedId(parentNodeKey)) {
      errors.push(error('invalid-value', `${path}.parentNodeKey`, 'Parent node key must be an identifier or null.'));
    }
    if (!BOOK_CONTENT_NODE_TYPES.includes(nodeType as typeof BOOK_CONTENT_NODE_TYPES[number])) {
      errors.push(error('invalid-value', `${path}.nodeType`, 'Node type is unsupported.'));
    }
    if (!Number.isSafeInteger(order) || (order as number) < 1) {
      errors.push(error('invalid-value', `${path}.order`, 'Node order must be a positive integer.'));
    }
    if (boundedId(nodeKey) && !nodeByKey.has(nodeKey)) {
      const normalized = rawNode as unknown as BookContentTreeNodeCandidate;
      nodeByKey.set(nodeKey, normalized);
      parents.set(nodeKey, parentNodeKey === null ? null : parentNodeKey as string);
    }
    if (boundedId(nodeKey) && (parentNodeKey === null || boundedId(parentNodeKey)) && Number.isSafeInteger(order)) {
      const sibling = `${parentNodeKey ?? '__root__'}\u0000${String(order)}`;
      if (nodeSiblingOrders.has(sibling)) errors.push(error('duplicate-order', `${path}.order`, 'Sibling node orders must be unique.'));
      nodeSiblingOrders.add(sibling);
    }
  });
  nodes.forEach((rawNode, index) => {
    if (!isRecord(rawNode)) return;
    const parent = rawNode.parentNodeKey;
    if (parent !== null && boundedId(parent) && !nodeByKey.has(parent)) {
      errors.push(error('unknown-node-key', `$.nodes[${index}].parentNodeKey`, 'Parent node does not exist.'));
    }
    const nodeKey = rawNode.nodeKey;
    if (!boundedId(nodeKey)) return;
    let current: string | null | undefined = nodeKey;
    const seen = new Set<string>();
    let depth = 0;
    while (current !== null && current !== undefined) {
      if (seen.has(current)) {
        errors.push(error('cycle', `$.nodes[${index}].parentNodeKey`, 'Content node hierarchy contains a cycle.'));
        break;
      }
      seen.add(current);
      depth += 1;
      if (depth > MAX_DEPTH) {
        errors.push(error('depth-exceeded', `$.nodes[${index}].parentNodeKey`, 'Content node hierarchy is too deep.'));
        break;
      }
      current = parents.get(current);
    }
  });

  const unitNodeKeys = new Set([...nodeByKey.values()]
    .filter((node) => node.nodeType === 'unit')
    .map((node) => node.nodeKey));
  const representedUnits = new Set<string>();
  const activityKeys = new Set<string>();
  const unitGroups = new Map<string, Map<string, BookPageGroupCandidate>>();
  const unitSlots = new Map<string, Map<string, BookAssemblyManifestCandidate['units'][number]['activitySlots'][number]>>();
  let activityCount = 0;
  let pageGroupCount = 0;
  units.forEach((rawUnit, unitIndex) => {
    const unitPath = `$.units[${unitIndex}]`;
    if (!isRecord(rawUnit)) {
      errors.push(error('invalid-record', unitPath, 'Unit must be an object.'));
      return;
    }
    if (!exactKeys(rawUnit, ['unitKey', 'activitySlots', 'pageGroups'])) {
      errors.push(error('unknown-field', unitPath, 'Unit contains unknown or missing fields.'));
    }
    const unitKey = rawUnit.unitKey;
    if (!boundedId(unitKey)) {
      errors.push(error('invalid-value', `${unitPath}.unitKey`, 'Unit key must be a bounded identifier.'));
      return;
    }
    if (representedUnits.has(unitKey)) errors.push(error('duplicate-key', `${unitPath}.unitKey`, 'Unit keys must be unique.'));
    representedUnits.add(unitKey);
    if (!unitNodeKeys.has(unitKey)) errors.push(error('unknown-node-key', `${unitPath}.unitKey`, 'Unit key must identify a Unit content node.'));
    const rawSlots = rawUnit.activitySlots;
    const rawGroups = rawUnit.pageGroups;
    if (!Array.isArray(rawSlots)) errors.push(error('invalid-record', `${unitPath}.activitySlots`, 'Unit Activity slots must be an array.'));
    if (!Array.isArray(rawGroups)) errors.push(error('invalid-record', `${unitPath}.pageGroups`, 'Unit Page Groups must be an array.'));
    const slots = Array.isArray(rawSlots) ? rawSlots : [];
    const groups = Array.isArray(rawGroups) ? rawGroups : [];
    if (slots.length > BOOK_ASSEMBLY_LIMITS.maxActivitySlots) errors.push(error('limit-exceeded', `${unitPath}.activitySlots`, 'Activity slot limit exceeded.'));
    if (groups.length > BOOK_ASSEMBLY_LIMITS.maxPageGroups) errors.push(error('limit-exceeded', `${unitPath}.pageGroups`, 'Page Group limit exceeded.'));
    const slotsByKey = new Map<string, BookAssemblyManifestCandidate['units'][number]['activitySlots'][number]>();
    const groupsByKey = new Map<string, BookPageGroupCandidate>();
    const slotOrders = new Set<number>();
    slots.forEach((rawSlot, slotIndex) => {
      const path = `${unitPath}.activitySlots[${slotIndex}]`;
      if (!isRecord(rawSlot)) {
        errors.push(error('invalid-record', path, 'Activity slot must be an object.'));
        return;
      }
      if (!exactKeys(rawSlot, ['activityKey', 'order', 'contextRequirement', 'pageGroupKeys'])) {
        errors.push(error('unknown-field', path, 'Activity slot contains unknown or missing fields.'));
      }
      const key = rawSlot.activityKey;
      if (!boundedId(key)) errors.push(error('invalid-value', `${path}.activityKey`, 'Activity key must be a bounded identifier.'));
      else if (activityKeys.has(key) || slotsByKey.has(key)) errors.push(error('duplicate-key', `${path}.activityKey`, 'Activity keys must be unique.'));
      else { activityKeys.add(key); slotsByKey.set(key, rawSlot as unknown as BookAssemblyManifestCandidate['units'][number]['activitySlots'][number]); }
      const order = rawSlot.order;
      if (typeof order !== 'number' || !Number.isSafeInteger(order) || order < 1) errors.push(error('invalid-value', `${path}.order`, 'Activity order must be a positive integer.'));
      else if (slotOrders.has(order)) errors.push(error('duplicate-order', `${path}.order`, 'Activity orders must be unique within a Unit.'));
      else slotOrders.add(order);
      if (!ACTIVITY_CONTEXT_REQUIREMENTS.includes(rawSlot.contextRequirement as typeof ACTIVITY_CONTEXT_REQUIREMENTS[number])) errors.push(error('invalid-value', `${path}.contextRequirement`, 'Activity context requirement is unsupported.'));
      if (!Array.isArray(rawSlot.pageGroupKeys) || rawSlot.pageGroupKeys.length === 0) {
        errors.push(error('missing-field', `${path}.pageGroupKeys`, 'Activity must name at least one Page Group.'));
      } else {
        const seen = new Set<string>();
        rawSlot.pageGroupKeys.forEach((value, groupIndex) => {
          if (!boundedId(value)) errors.push(error('invalid-value', `${path}.pageGroupKeys[${groupIndex}]`, 'Page Group key must be a bounded identifier.'));
          else if (seen.has(value)) errors.push(error('duplicate-key', `${path}.pageGroupKeys[${groupIndex}]`, 'Activity Page Group keys must be unique.'));
          else seen.add(value);
        });
      }
      activityCount += 1;
    });
    groups.forEach((rawGroup, groupIndex) => {
      const path = `${unitPath}.pageGroups[${groupIndex}]`;
      if (!isRecord(rawGroup)) {
        errors.push(error('invalid-record', path, 'Page Group must be an object.'));
        return;
      }
      if (!exactKeys(rawGroup, ['pageGroupKey', 'sourceKey', 'pages', 'activityKeys', 'mode'], ['defaultPhysicalPageNumber'])) {
        errors.push(error('unknown-field', path, 'Page Group contains unknown or missing fields.'));
      }
      const pageGroupKey = rawGroup.pageGroupKey;
      const sourceKey = rawGroup.sourceKey;
      if (!boundedId(pageGroupKey)) errors.push(error('invalid-value', `${path}.pageGroupKey`, 'Page Group key must be a bounded identifier.'));
      else if (groupsByKey.has(pageGroupKey)) errors.push(error('duplicate-key', `${path}.pageGroupKey`, 'Page Group keys must be unique within a Unit.'));
      if (!boundedId(sourceKey)) errors.push(error('invalid-value', `${path}.sourceKey`, 'Page Group source key must be a bounded identifier.'));
      const source = boundedId(sourceKey) ? sources.get(sourceKey) : undefined;
      if (!source) errors.push(error('unknown-source-key', `${path}.sourceKey`, 'Page Group names an unknown Source Set key.'));
      const pages = rawGroup.pages;
      if (!Array.isArray(pages) || pages.length === 0) errors.push(error('invalid-page-group', `${path}.pages`, 'Page Group must contain pages.'));
      else {
        if (pages.length > BOOK_ASSEMBLY_LIMITS.maxPagesPerGroup) errors.push(error('limit-exceeded', `${path}.pages`, 'Page Group page limit exceeded.'));
        const seen = new Set<number>();
        pages.forEach((page, pageIndex) => {
          if (!pageNumber(page)) errors.push(error('invalid-value', `${path}.pages[${pageIndex}]`, 'Page must be a positive integer.'));
          else {
            if (seen.has(page)) errors.push(error('duplicate-key', `${path}.pages[${pageIndex}]`, 'Page Group pages must be unique.'));
            seen.add(page);
            if (source && page > source.physicalPageCount) errors.push(error('out-of-range-page', `${path}.pages[${pageIndex}]`, 'Page is outside the trusted Source Version range.'));
            if (pageIndex > 0 && page <= pages[pageIndex - 1]!) errors.push(error('invalid-page-group', `${path}.pages`, 'Page Group pages must be strictly ascending.'));
          }
        });
      }
      const activityKeysForGroup = rawGroup.activityKeys;
      if (!Array.isArray(activityKeysForGroup)) errors.push(error('invalid-page-group', `${path}.activityKeys`, 'Page Group Activity keys must be an array.'));
      else {
        if (activityKeysForGroup.length > BOOK_ASSEMBLY_LIMITS.maxActivitiesPerGroup) errors.push(error('limit-exceeded', `${path}.activityKeys`, 'Page Group Activity limit exceeded.'));
        const seen = new Set<string>();
        activityKeysForGroup.forEach((key, activityIndex) => {
          if (!boundedId(key)) errors.push(error('invalid-value', `${path}.activityKeys[${activityIndex}]`, 'Activity key must be a bounded identifier.'));
          else if (seen.has(key)) errors.push(error('duplicate-key', `${path}.activityKeys[${activityIndex}]`, 'Page Group Activity keys must be unique.'));
          else if (!slotsByKey.has(key)) errors.push(error('unmapped-activity', `${path}.activityKeys[${activityIndex}]`, 'Page Group names an unknown Activity slot.'));
          else seen.add(key);
        });
        if (rawGroup.mode === 'activity' && activityKeysForGroup.length === 0) errors.push(error('unmapped-activity', `${path}.activityKeys`, 'Activity Page Group must name an Activity.'));
        if (rawGroup.mode === 'reference_only' && activityKeysForGroup.length > 0) errors.push(error('invalid-page-group', `${path}.activityKeys`, 'Reference-only Page Group cannot name Activities.'));
      }
      if (!PAGE_GROUP_MODES.includes(rawGroup.mode as typeof PAGE_GROUP_MODES[number])) errors.push(error('invalid-page-group', `${path}.mode`, 'Page Group mode is unsupported.'));
      if (Object.hasOwn(rawGroup, 'defaultPhysicalPageNumber')) {
        if (!pageNumber(rawGroup.defaultPhysicalPageNumber) || !Array.isArray(pages) || !pages.includes(rawGroup.defaultPhysicalPageNumber)) {
          errors.push(error('invalid-page-group', `${path}.defaultPhysicalPageNumber`, 'Default Page must be one of the mapped pages.'));
        }
      }
      if (boundedId(pageGroupKey) && !groupsByKey.has(pageGroupKey)) groupsByKey.set(pageGroupKey, rawGroup as unknown as BookPageGroupCandidate);
      pageGroupCount += 1;
    });
    unitGroups.set(unitKey, groupsByKey);
    unitSlots.set(unitKey, slotsByKey);
    groups.forEach((rawGroup, groupIndex) => {
      if (!isRecord(rawGroup) || !Array.isArray(rawGroup.activityKeys)) return;
      const groupKey = rawGroup.pageGroupKey;
      if (!boundedId(groupKey)) return;
      rawGroup.activityKeys.forEach((activityKey, activityIndex) => {
        const slot = slotsByKey.get(activityKey);
        if (slot && Array.isArray(slot.pageGroupKeys) && !slot.pageGroupKeys.includes(groupKey)) {
          errors.push(error('unmapped-activity', `${unitPath}.pageGroups[${groupIndex}].activityKeys[${activityIndex}]`, 'Activity and Page Group mappings must be reciprocal.'));
        }
      });
    });
    slots.forEach((rawSlot, slotIndex) => {
      if (!isRecord(rawSlot) || !Array.isArray(rawSlot.pageGroupKeys)) return;
      rawSlot.pageGroupKeys.forEach((groupKey, groupIndex) => {
        if (!groupsByKey.has(groupKey)) errors.push(error('unknown-node-key', `${unitPath}.activitySlots[${slotIndex}].pageGroupKeys[${groupIndex}]`, 'Activity names an unknown Page Group.'));
        else {
          const group = groupsByKey.get(groupKey);
          if (group && group.mode === 'activity' && typeof rawSlot.activityKey === 'string' && !group.activityKeys.includes(rawSlot.activityKey)) {
            errors.push(error('unmapped-activity', `${unitPath}.activitySlots[${slotIndex}].pageGroupKeys[${groupIndex}]`, 'Activity and Page Group mappings must be reciprocal.'));
          }
        }
      });
    });
  });
  if (activityCount > BOOK_ASSEMBLY_LIMITS.maxActivitySlots) errors.push(error('limit-exceeded', '$.units', 'Activity slot limit exceeded.'));
  if (pageGroupCount > BOOK_ASSEMBLY_LIMITS.maxPageGroups) errors.push(error('limit-exceeded', '$.units', 'Page Group limit exceeded.'));
  unitNodeKeys.forEach((unitKey) => {
    if (!representedUnits.has(unitKey)) errors.push(error('missing-field', '$.units', `Unit content node ${unitKey} has no Unit candidate.`));
  });
  // Component source ownership is structural: a source may only be used by a
  // Unit in the owner node's branch. This prevents cross-branch page leakage.
  unitGroups.forEach((groups, unitKey) => groups.forEach((group, groupKey) => {
    const source = sources.get(group.sourceKey);
    if (source?.ownerNodeKey && !ancestorOrSelf(unitKey, source.ownerNodeKey, parents)) {
      errors.push(error('invalid-owner', `$.units.${unitKey}.pageGroups.${groupKey}.sourceKey`, 'Component Source owner is outside the Unit branch.'));
    }
  }));
  return { valid: errors.length === 0, errors: sortedErrors(errors) };
};

// Compatibility exports retained for older Book-only callers. The current
// production boundary is validateBookAssemblyManifestCandidate above.
export const validateBookAssemblyManifest = validateBookAssemblyManifestCandidate;
export const validateBookAssemblyCandidate = validateBookAssemblyManifestCandidate;

export const repairAndRevalidateBookAssemblyCandidate = (input: {
  readonly candidate: BookAssemblyManifestCandidate;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
}): { readonly candidate: BookAssemblyManifestCandidate; readonly validation: BookAssemblyValidationResult } => {
  const candidate: BookAssemblyManifestCandidate = {
    ...input.candidate,
    units: input.candidate.units.map((unit) => ({
    ...unit,
    pageGroups: unit.pageGroups.map((group) => ({
      ...group,
      pages: [...new Set(group.pages)].sort((left, right) => left - right),
    })),
    })),
  };
  return { candidate, validation: validateBookAssemblyManifestCandidate(candidate, input.sourceVersionAuthority) };
};

export const getBookAssemblyPublishBlockers = (input: {
  readonly candidate: BookAssemblyManifestCandidate;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
}): readonly BookAssemblyValidationError[] => (
  validateBookAssemblyManifestCandidate(input.candidate, input.sourceVersionAuthority).errors
);

export const deriveBookAssemblyStatus = (input: {
  readonly candidate: BookAssemblyManifestCandidate;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
}): 'valid' | 'needs-repair' => (
  validateBookAssemblyManifestCandidate(input.candidate, input.sourceVersionAuthority).valid ? 'valid' : 'needs-repair'
);

export const deriveBookAssemblyUnitStatus = (input: {
  readonly candidate: BookAssemblyManifestCandidate;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
}): 'Valid - ready to publish' | 'Invalid' => (
  validateBookAssemblyManifestCandidate(input.candidate, input.sourceVersionAuthority).valid
    ? 'Valid - ready to publish'
    : 'Invalid'
);
