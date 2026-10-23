import type {
  BookAssemblyManifestCandidate,
  BookContentNodeType,
  BookContentTreeNodeCandidate,
  BookPageGroupCandidate,
  BookUnitCandidate,
} from '../../types/bookAssembly.types';
import type { EditableActivity } from '../../types/bookActivity.types';
import { validateEditableActivity } from '../book-activity/activitySchema.service';
import { COMPONENT_PDF_COMPOSITION_LIMITS } from '../book-source-delivery/componentPdfComposition.types';
import type { LocalBookAuthoringStrategy, LocalBookPdfDescriptor } from './localBookAuthoring.service';

export interface LocalBookAuthoringValidationError {
  readonly field: 'structure' | 'activities' | 'mapping' | 'files' | 'strategy';
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface LocalBookAuthoringValidationInput {
  readonly strategy: LocalBookAuthoringStrategy | null;
  readonly pdfs: readonly LocalBookPdfDescriptor[];
  readonly structureJson: string;
  readonly unitsJson: string;
  readonly pageMappingJson: string;
  /** Page counts inspected from the local PDF bytes; never a trusted provider fact. */
  readonly pdfPageCounts?: Readonly<Record<string, number>>;
}

export interface LocalBookAuthoringValidationResult {
  readonly valid: boolean;
  readonly errors: readonly LocalBookAuthoringValidationError[];
  /**
   * Safe structure/source/mapping contract when those inputs validate. This is
   * available while activity content is still incomplete so authoring prompts
   * can be generated before the final validation gate passes.
   */
  readonly manifest?: BookAssemblyManifestCandidate;
  readonly activitiesByKey?: Readonly<Record<string, EditableActivity>>;
}

type RecordValue = Record<string, unknown>;
const MAX_JSON_BYTES = 1_048_576;
const MAX_ITEMS = 5_000;
const MAX_PAGE = 10_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const NODE_TYPES = new Set<BookContentNodeType>(['intro-placeholder', 'toc-placeholder', 'note-placeholder', 'section', 'chapter', 'unit', 'test']);
const MODES = new Set(['activity', 'reference_only']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor', 'ownerId', 'bookId', 'sourceVersionId', 'providerObjectKey', 'providerUrl', 'token', 'privateKey', 'answerKey', 'provenance']);

const isRecord = (value: unknown): value is RecordValue => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && Object.prototype.propertyIsEnumerable.call(value, key));
};
const own = (value: RecordValue, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const exact = (value: RecordValue, required: readonly string[], optional: readonly string[] = []): boolean => {
  const allowed = new Set([...required, ...optional]);
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.has(key))
    && required.every((key) => own(value, key));
};
const boundedId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const issue = (errors: LocalBookAuthoringValidationError[], field: LocalBookAuthoringValidationError['field'], path: string, code: string, message: string) => {
  errors.push({ field, path, code, message });
};
const pathError = (errors: LocalBookAuthoringValidationError[], field: LocalBookAuthoringValidationError['field'], path: string, code: string, message: string) => issue(errors, field, path, code, message);

const safeJson = (text: string, field: LocalBookAuthoringValidationError['field'], errors: LocalBookAuthoringValidationError[]): unknown => {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    issue(errors, field, '$', 'payload-too-large', 'JSON exceeds the local authoring size limit.');
    return undefined;
  }
  try {
    const value = JSON.parse(text) as unknown;
    const walk = (entry: unknown, path: string, depth: number): void => {
      if (depth > 64) { issue(errors, field, path, 'depth-exceeded', 'JSON nesting is too deep.'); return; }
      if (typeof entry === 'string' && /(?:https?:\/\/|<script|function\s*\()/iu.test(entry)) {
        issue(errors, field, path, 'unsafe-text', 'Executable or remote authority text is not allowed.');
        return;
      }
      if (Array.isArray(entry)) { entry.forEach((child, index) => walk(child, `${path}[${index}]`, depth + 1)); return; }
      if (!isRecord(entry)) return;
      for (const [key, child] of Object.entries(entry)) {
        if (FORBIDDEN.has(key)) issue(errors, field, `${path}.${key}`, 'forbidden-field', 'Authority or executable fields are not allowed.');
        walk(child, `${path}.${key}`, depth + 1);
      }
    };
    walk(value, '$', 0);
    return value;
  } catch {
    issue(errors, field, '$', 'invalid-json', 'JSON is malformed.');
    return undefined;
  }
};

const parseNodes = (value: unknown, errors: LocalBookAuthoringValidationError[]): BookContentTreeNodeCandidate[] => {
  if (!Array.isArray(value)) { pathError(errors, 'structure', '$.nodes', 'invalid-record', 'Nodes must be an array.'); return []; }
  if (value.length > MAX_ITEMS) pathError(errors, 'structure', '$.nodes', 'limit-exceeded', 'Too many nodes.');
  const nodes: BookContentTreeNodeCandidate[] = [];
  const keys = new Set<string>();
  value.forEach((entry, index) => {
    const path = `$.nodes[${index}]`;
    if (!isRecord(entry) || !exact(entry, ['nodeKey', 'parentNodeKey', 'nodeType', 'order'], ['title'])) { pathError(errors, 'structure', path, 'invalid-record', 'Node must contain nodeKey, parentNodeKey, nodeType, order, and optionally title.'); return; }
    if (own(entry, 'title') && (typeof entry.title !== 'string' || entry.title.trim().length === 0 || entry.title.length > 200)) pathError(errors, 'structure', `${path}.title`, 'invalid-value', 'Node title must be nonempty and at most 200 characters.');
    if (!boundedId(entry.nodeKey)) pathError(errors, 'structure', `${path}.nodeKey`, 'invalid-value', 'Node key is invalid.');
    if (typeof entry.parentNodeKey !== 'string' && entry.parentNodeKey !== null) pathError(errors, 'structure', `${path}.parentNodeKey`, 'invalid-value', 'Parent node key must be null or a bounded identifier.');
    if (typeof entry.nodeType !== 'string' || !NODE_TYPES.has(entry.nodeType as BookContentNodeType)) pathError(errors, 'structure', `${path}.nodeType`, 'invalid-value', 'Node type is unsupported.');
    if (!Number.isSafeInteger(entry.order) || (entry.order as number) < 1) pathError(errors, 'structure', `${path}.order`, 'invalid-value', 'Node order must be a positive integer.');
    if (typeof entry.nodeKey === 'string' && keys.has(entry.nodeKey)) pathError(errors, 'structure', `${path}.nodeKey`, 'duplicate-key', 'Node keys must be unique.');
    if (typeof entry.nodeKey === 'string') keys.add(entry.nodeKey);
    if (boundedId(entry.nodeKey) && typeof entry.nodeType === 'string' && NODE_TYPES.has(entry.nodeType as BookContentNodeType) && Number.isSafeInteger(entry.order) && (typeof entry.parentNodeKey === 'string' || entry.parentNodeKey === null)) nodes.push(entry as unknown as BookContentTreeNodeCandidate);
  });
  return nodes;
};

const parseGroups = (value: unknown, field: 'structure' | 'mapping', path: string, errors: LocalBookAuthoringValidationError[], sourceKeys: Set<string>, pageCounts: Readonly<Record<string, number>> = {}): BookPageGroupCandidate[] => {
  if (!Array.isArray(value)) { pathError(errors, field, path, 'invalid-record', 'Page groups must be an array.'); return []; }
  const groups: BookPageGroupCandidate[] = [];
  const keys = new Set<string>();
  value.forEach((entry, index) => {
    const currentPath = `${path}[${index}]`;
    if (!isRecord(entry) || !exact(entry, ['pageGroupKey', 'sourceKey', 'pages', 'activityKeys', 'mode'], ['defaultPhysicalPageNumber'])) { pathError(errors, field, currentPath, 'invalid-record', 'Page group fields are invalid.'); return; }
    if (!boundedId(entry.pageGroupKey)) pathError(errors, field, `${currentPath}.pageGroupKey`, 'invalid-value', 'Page group key is invalid.');
    if (typeof entry.sourceKey !== 'string' || !sourceKeys.has(entry.sourceKey)) pathError(errors, field, `${currentPath}.sourceKey`, 'unknown-source-key', 'Source key is not one of the selected PDFs.');
    if (!Array.isArray(entry.pages) || entry.pages.length === 0) pathError(errors, field, `${currentPath}.pages`, 'invalid-value', 'Page groups need at least one physical page.');
    else entry.pages.forEach((page, pageIndex) => {
      const sourceKey = typeof entry.sourceKey === 'string' ? entry.sourceKey : '';
      const pageCount = pageCounts[sourceKey];
      if (pageCount === undefined) pathError(errors, 'files', `$.pdfs[${sourceKey}]`, 'file-inspection-required', 'Inspect the selected local PDF before validating page mappings.');
      if (!Number.isSafeInteger(page) || (page as number) < 1 || (page as number) > MAX_PAGE || (Number.isSafeInteger(pageCount) && (page as number) > pageCount)) pathError(errors, field, `${currentPath}.pages[${pageIndex}]`, 'out-of-range-page', `Physical page must be between 1 and ${pageCount ?? MAX_PAGE}.`);
    });
    if (!Array.isArray(entry.activityKeys) || entry.activityKeys.some((key) => !boundedId(key))) pathError(errors, field, `${currentPath}.activityKeys`, 'invalid-value', 'Activity keys must be bounded identifiers.');
    if (typeof entry.mode !== 'string' || !MODES.has(entry.mode)) pathError(errors, field, `${currentPath}.mode`, 'invalid-value', 'Page group mode is unsupported.');
    if (entry.defaultPhysicalPageNumber !== undefined && (!Number.isSafeInteger(entry.defaultPhysicalPageNumber) || (entry.defaultPhysicalPageNumber as number) < 1 || (entry.defaultPhysicalPageNumber as number) > MAX_PAGE)) pathError(errors, field, `${currentPath}.defaultPhysicalPageNumber`, 'out-of-range-page', 'Default physical page is invalid.');
    if (typeof entry.pageGroupKey === 'string' && keys.has(entry.pageGroupKey)) pathError(errors, field, `${currentPath}.pageGroupKey`, 'duplicate-key', 'Page group keys must be unique within a Unit.');
    if (typeof entry.pageGroupKey === 'string') keys.add(entry.pageGroupKey);
    if (boundedId(entry.pageGroupKey) && typeof entry.sourceKey === 'string' && sourceKeys.has(entry.sourceKey) && Array.isArray(entry.pages) && entry.pages.every((page) => Number.isSafeInteger(page) && (page as number) >= 1 && (page as number) <= MAX_PAGE && (pageCounts[entry.sourceKey as string] === undefined || (page as number) <= pageCounts[entry.sourceKey as string]!)) && Array.isArray(entry.activityKeys) && entry.activityKeys.every((key) => boundedId(key)) && typeof entry.mode === 'string' && MODES.has(entry.mode)) groups.push(entry as unknown as BookPageGroupCandidate);
  });
  return groups;
};

const parseUnits = (value: unknown, field: 'structure' | 'mapping', path: string, errors: LocalBookAuthoringValidationError[], sourceKeys: Set<string>, pageCounts: Readonly<Record<string, number>> = {}): BookUnitCandidate[] => {
  if (!Array.isArray(value)) { pathError(errors, field, path, 'invalid-record', 'Units must be an array.'); return []; }
  const units: BookUnitCandidate[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const currentPath = `${path}[${index}]`;
    if (!isRecord(entry)) { pathError(errors, field, currentPath, 'invalid-record', 'Unit must be an object.'); return; }
    if (!exact(entry, ['unitKey', 'activitySlots', 'pageGroups'])) { pathError(errors, field, currentPath, 'invalid-record', 'Unit fields are invalid.'); return; }
    if (!boundedId(entry.unitKey)) pathError(errors, field, `${currentPath}.unitKey`, 'invalid-value', 'Unit key is invalid.');
    if (typeof entry.unitKey === 'string' && seen.has(entry.unitKey)) pathError(errors, field, `${currentPath}.unitKey`, 'duplicate-key', 'Unit keys must be unique.');
    if (typeof entry.unitKey === 'string') seen.add(entry.unitKey);
    if (!Array.isArray(entry.activitySlots)) pathError(errors, field, `${currentPath}.activitySlots`, 'invalid-record', 'Activity slots must be an array.');
    if (!Array.isArray(entry.pageGroups)) pathError(errors, field, `${currentPath}.pageGroups`, 'invalid-record', 'Page groups must be an array.');
    const slots = parseSlots(entry.activitySlots, field, `${currentPath}.activitySlots`, errors);
    const groups = parseGroups(entry.pageGroups, field, `${currentPath}.pageGroups`, errors, sourceKeys, pageCounts);
    if (boundedId(entry.unitKey)) units.push({ unitKey: entry.unitKey, activitySlots: slots, pageGroups: groups });
  });
  return units;
};

const parseSlots = (value: unknown, field: 'structure' | 'mapping', path: string, errors: LocalBookAuthoringValidationError[]) => {
  if (!Array.isArray(value)) return [];
  const slots: BookUnitCandidate['activitySlots'][number][] = [];
  const keys = new Set<string>();
  value.forEach((entry, index) => {
    const currentPath = `${path}[${index}]`;
    if (!isRecord(entry) || !exact(entry, ['activityKey', 'order', 'contextRequirement', 'pageGroupKeys'])) { pathError(errors, field, currentPath, 'invalid-record', 'Activity slot fields are invalid.'); return; }
    if (!boundedId(entry.activityKey)) pathError(errors, field, `${currentPath}.activityKey`, 'invalid-value', 'Activity key is invalid.');
    if (!Number.isSafeInteger(entry.order) || (entry.order as number) < 1) pathError(errors, field, `${currentPath}.order`, 'invalid-value', 'Activity order must be a positive integer.');
    if (!['required', 'optional', 'none'].includes(String(entry.contextRequirement))) pathError(errors, field, `${currentPath}.contextRequirement`, 'invalid-value', 'Context requirement is unsupported.');
    if (!Array.isArray(entry.pageGroupKeys) || entry.pageGroupKeys.some((key) => !boundedId(key))) pathError(errors, field, `${currentPath}.pageGroupKeys`, 'invalid-value', 'Page group keys must be bounded identifiers.');
    if (typeof entry.activityKey === 'string' && keys.has(entry.activityKey)) pathError(errors, field, `${currentPath}.activityKey`, 'duplicate-key', 'Activity keys must be unique within a Unit.');
    if (typeof entry.activityKey === 'string') keys.add(entry.activityKey);
    if (boundedId(entry.activityKey) && Number.isSafeInteger(entry.order) && (entry.order as number) >= 1 && ['required', 'optional', 'none'].includes(String(entry.contextRequirement)) && Array.isArray(entry.pageGroupKeys) && entry.pageGroupKeys.every((key) => boundedId(key))) slots.push(entry as unknown as BookUnitCandidate['activitySlots'][number]);
  });
  return slots;
};

const activityEntries = (value: unknown, errors: LocalBookAuthoringValidationError[]): Array<{ unitKey: string; activityKey: string; content: unknown; path: string }> => {
  if (!isRecord(value)) { pathError(errors, 'activities', '$', 'invalid-record', 'Activity content must be an object.'); return []; }
  if (Array.isArray(value.units)) {
    const result: Array<{ unitKey: string; activityKey: string; content: unknown; path: string }> = [];
    value.units.forEach((unit, unitIndex) => {
      if (!isRecord(unit) || !boundedId(unit.unitKey) || !Array.isArray(unit.slots ?? unit.activities)) { pathError(errors, 'activities', `$.units[${unitIndex}]`, 'invalid-record', 'Activity Unit must contain unitKey and slots.'); return; }
      const unitKey = unit.unitKey;
      const entries = (unit.slots ?? unit.activities) as unknown[];
      entries.forEach((entry, entryIndex) => {
        if (!isRecord(entry) || !boundedId(entry.activityKey) || !own(entry, 'content')) { pathError(errors, 'activities', `$.units[${unitIndex}].slots[${entryIndex}]`, 'invalid-record', 'Activity slot must contain activityKey and content.'); return; }
        result.push({ unitKey, activityKey: entry.activityKey, content: entry.content, path: `$.units[${unitIndex}].slots[${entryIndex}].content` });
      });
    });
    return result;
  }
  return Object.entries(value).flatMap(([unitKey, unit]) => isRecord(unit) ? Object.entries(unit).map(([activityKey, content]) => ({ unitKey, activityKey, content, path: `$.${unitKey}.${activityKey}` })) : []);
};

export const validateLocalBookAuthoring = (input: LocalBookAuthoringValidationInput): LocalBookAuthoringValidationResult => {
  const errors: LocalBookAuthoringValidationError[] = [];
  const pageCounts = input.pdfPageCounts ?? {};
  if (input.strategy !== 'full' && input.strategy !== 'component') issue(errors, 'strategy', '$.strategy', 'invalid-value', 'Choose a full or component PDF setup.');
  const pdfs = Array.isArray(input.pdfs) ? input.pdfs : [];
  if (input.strategy === 'full' && pdfs.length !== 1) issue(errors, 'files', '$.pdfs', 'invalid-cardinality', 'Full-PDF setup requires exactly one PDF.');
  if (input.strategy === 'component' && pdfs.length < 2) issue(errors, 'files', '$.pdfs', 'invalid-cardinality', 'Component-PDF setup requires at least two PDFs.');
  if (input.strategy === 'component' && pdfs.length > COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents) issue(errors, 'files', '$.pdfs', 'invalid-cardinality', `Component-PDF setup supports at most ${COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents} PDFs.`);
  if (input.strategy === 'component' && pdfs.reduce((total, pdf) => total + Math.max(0, pdf.size), 0) > COMPONENT_PDF_COMPOSITION_LIMITS.maxAggregateBytes) issue(errors, 'files', '$.pdfs', 'aggregate-size-exceeded', 'Component-PDF files must be no larger than 50 MiB combined.');
  const sourceKeys = new Set(pdfs.map((pdf) => pdf.sourceKey));
  if (sourceKeys.size !== pdfs.length) issue(errors, 'files', '$.pdfs', 'duplicate-key', 'PDF source keys must be unique.');
  if (input.strategy === 'full' && pdfs[0]?.sourceKey !== 'full') issue(errors, 'files', '$.pdfs[0].sourceKey', 'invalid-value', 'Full-PDF setup uses the full source key.');
  pdfs.forEach((pdf) => {
    if (!Number.isSafeInteger(pageCounts[pdf.sourceKey]) || pageCounts[pdf.sourceKey]! < 1) issue(errors, 'files', `$.pdfs[${pdf.sourceKey}]`, 'file-inspection-required', 'Inspect the selected local PDF before creating the Book.');
  });

  const structure = safeJson(input.structureJson, 'structure', errors);
  const activities = safeJson(input.unitsJson, 'activities', errors);
  const mapping = safeJson(input.pageMappingJson, 'mapping', errors);
  if (!isRecord(structure) || !exact(structure, ['nodes', 'units'])) issue(errors, 'structure', '$', 'invalid-record', 'Structure must contain nodes and units only.');
  const nodes = isRecord(structure) && Array.isArray(structure.nodes) ? parseNodes(structure.nodes, errors) : [];
  const structureUnits = isRecord(structure) && Array.isArray(structure.units) ? parseUnits(structure.units, 'structure', '$.units', errors, sourceKeys, pageCounts) : [];
  const mapUnits = isRecord(mapping) && exact(mapping, ['units']) && Array.isArray(mapping.units) ? parseUnits(mapping.units, 'mapping', '$.units', errors, sourceKeys, pageCounts) : [];
  if (!isRecord(mapping) || !exact(mapping, ['units'])) issue(errors, 'mapping', '$', 'invalid-record', 'Page mapping must contain units only.');
  const mappedByUnit = new Map(mapUnits.map((unit) => [unit.unitKey, unit]));
  mapUnits.forEach((unit, index) => {
    if (!structureUnits.some((candidate) => candidate.unitKey === unit.unitKey)) pathError(errors, 'mapping', `$.units[${index}].unitKey`, 'unknown-node-key', 'Page mapping must target a Unit in the structure.');
  });
  const mergedUnits = structureUnits.map((unit) => {
    const mapped = mappedByUnit.get(unit.unitKey);
    return mapped ? { ...unit, pageGroups: mapped.pageGroups, activitySlots: unit.activitySlots.length ? unit.activitySlots : mapped.activitySlots } : unit;
  });
  const nodeKeys = new Set(nodes.map((node) => node.nodeKey));
  const unitKeys = new Set(nodes.filter((node) => node.nodeType === 'unit').map((node) => node.nodeKey));
  if (nodes.length === 0) pathError(errors, 'structure', '$.nodes', 'missing-content', 'Add at least one Book node before creating the Book.');
  if (structureUnits.length === 0) pathError(errors, 'structure', '$.units', 'missing-content', 'Add at least one Unit before creating the Book.');
  nodes.forEach((node, index) => {
    if (node.parentNodeKey !== null && !nodeKeys.has(node.parentNodeKey)) pathError(errors, 'structure', `$.nodes[${index}].parentNodeKey`, 'unknown-node-key', 'Parent node does not exist.');
    if (node.nodeType === 'unit' && !structureUnits.some((unit) => unit.unitKey === node.nodeKey)) pathError(errors, 'structure', `$.nodes[${index}].nodeKey`, 'missing-unit', 'Every Unit node needs a matching Unit contract.');
    const seen = new Set<string>();
    let parent: string | null = node.parentNodeKey;
    while (parent !== null) {
      if (seen.has(parent)) { pathError(errors, 'structure', `$.nodes[${index}].parentNodeKey`, 'cycle', 'Book structure cannot contain parent cycles.'); break; }
      seen.add(parent);
      parent = nodes.find((candidate) => candidate.nodeKey === parent)?.parentNodeKey ?? null;
    }
  });
  structureUnits.forEach((unit, index) => {
    if (!unitKeys.has(unit.unitKey)) pathError(errors, 'structure', `$.units[${index}].unitKey`, 'unknown-node-key', 'Unit contract must match a Unit node.');
    const groupKeys = new Set(unit.pageGroups.map((group) => group.pageGroupKey));
    unit.activitySlots.forEach((slot, slotIndex) => {
      if (slot.pageGroupKeys.length === 0) pathError(errors, 'mapping', `$.units[${index}].activitySlots[${slotIndex}].pageGroupKeys`, 'missing-mapping', 'Every Activity slot needs a Page Group mapping.');
      slot.pageGroupKeys.forEach((groupKey) => { if (!groupKeys.has(groupKey)) pathError(errors, 'mapping', `$.units[${index}].activitySlots[${slotIndex}].pageGroupKeys`, 'unknown-page-group', 'Activity slot references an unknown Page Group.'); });
    });
    unit.pageGroups.forEach((group, groupIndex) => {
      group.activityKeys.forEach((activityKey) => { if (!unit.activitySlots.some((slot) => slot.activityKey === activityKey)) pathError(errors, 'mapping', `$.units[${index}].pageGroups[${groupIndex}].activityKeys`, 'unmapped-activity', 'Page Group references an unknown Activity slot.'); });
    });
  });
  const mappedSourceKeys = new Set(mergedUnits.flatMap((unit) => unit.pageGroups.map((group) => group.sourceKey)));
  const sourceOwners = new Map<string, string>();
  const ambiguousSourceOwners = new Set<string>();
  mergedUnits.forEach((unit) => {
    unit.pageGroups.forEach((group) => {
      const owner = sourceOwners.get(group.sourceKey);
      if (owner !== undefined && owner !== unit.unitKey) ambiguousSourceOwners.add(group.sourceKey);
      else sourceOwners.set(group.sourceKey, unit.unitKey);
    });
  });
  if (input.strategy === 'component') {
    pdfs.forEach((pdf) => {
      if (!mappedSourceKeys.has(pdf.sourceKey)) pathError(errors, 'mapping', '$.units', 'unmapped-source', `Component PDF ${pdf.sourceKey} must have at least one mapped Page Group.`);
      else if (ambiguousSourceOwners.has(pdf.sourceKey)) pathError(errors, 'mapping', '$.units', 'ambiguous-source-owner', `Component PDF ${pdf.sourceKey} must map to Page Groups owned by one Unit.`);
    });
  }
  const slots = new Set(mergedUnits.flatMap((unit) => unit.activitySlots.map((slot) => `${unit.unitKey}:${slot.activityKey}`)));
  const activitiesByKey: Record<string, EditableActivity> = {};
  const providedActivityKeys = new Set<string>();
  for (const entry of activityEntries(activities, errors)) {
    const key = `${entry.unitKey}:${entry.activityKey}`;
    if (!slots.has(key)) { pathError(errors, 'activities', entry.path, 'slot-mismatch', 'Activity does not match a planned Unit slot.'); continue; }
    providedActivityKeys.add(key);
    const unit = mergedUnits.find((candidate) => candidate.unitKey === entry.unitKey)!;
    const slot = unit.activitySlots.find((candidate) => candidate.activityKey === entry.activityKey)!;
    const refs = unit.pageGroups.filter((group) => slot.pageGroupKeys.includes(group.pageGroupKey)).flatMap((group) => group.pages.map((page) => `source:${group.sourceKey}:page:${page}`));
    const validation = validateEditableActivity(entry.content, { mappedBookPageRefs: refs });
    if (!validation.valid) validation.errors.forEach((validationError) => pathError(errors, 'activities', `${entry.path}${validationError.path.replace(/^\$/u, '')}`, validationError.code, validationError.message));
    else activitiesByKey[key] = validation.value;
  }
  mergedUnits.forEach((unit, index) => {
    if (unit.pageGroups.length === 0) {
      pathError(errors, 'mapping', `$.units[${index}].pageGroups`, 'missing-content', 'Every Unit needs at least one mapped Page Group.');
    }
    unit.activitySlots.forEach((slot) => {
      if (!providedActivityKeys.has(`${unit.unitKey}:${slot.activityKey}`)) {
        pathError(errors, 'activities', `$.${unit.unitKey}.${slot.activityKey}`, 'missing-content', 'Every Activity slot needs imported Activity content.');
      }
    });
  });
  const bookId = 'local-book';
  const manifest: BookAssemblyManifestCandidate = {
    bookId,
    sourceSet: input.strategy === 'full'
      ? { sourceStrategy: 'full_pdf', sources: [{ sourceKey: 'full', sourceVersionId: 'local-full', sourceOrder: 1 }] }
      : { sourceStrategy: 'component_pdfs', sources: pdfs.map((pdf, index) => ({ sourceKey: pdf.sourceKey, sourceVersionId: `local-${pdf.sourceKey}`, sourceOrder: index + 1, ownerNodeKey: sourceOwners.get(pdf.sourceKey) ?? nodes.find((node) => node.nodeType === 'unit')?.nodeKey ?? 'unit-1' })) as [{ sourceKey: string; sourceVersionId: string; sourceOrder: number; ownerNodeKey: string }, ...{ sourceKey: string; sourceVersionId: string; sourceOrder: number; ownerNodeKey: string }[]] },
    nodes,
    units: mergedUnits,
  };
  const sortedErrors = [...errors].sort((left, right) => left.field.localeCompare(right.field) || left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  const contractValid = sortedErrors.every((error) => error.field === 'activities');
  return {
    valid: sortedErrors.length === 0,
    errors: sortedErrors,
    ...(contractValid ? { manifest } : {}),
    ...(sortedErrors.length === 0 ? { activitiesByKey } : {}),
  };
};
