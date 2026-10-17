import {
  type BookAssemblyManifestCandidate,
  type BookAssemblyValidationError,
  type BookSourceVersionAuthority,
  type BookSourceCandidate,
  type BookUnitCandidate,
  type ComponentPdfPreparationComponentInput,
} from '../../types/bookAssembly.types';
import { validateEditableActivity } from '../book-activity/activitySchema.service';
import { validateBookAssemblyManifestCandidate } from './manifestCandidate.service';

export type BookAssemblyReconciliationSeverity = 'blocker' | 'warning';
export type BookAssemblyReconciliationRepairKind = 'exact' | 'teacher-choice' | 'none';
export type BookAssemblyReconciliationCode =
  | 'candidate-stale'
  | 'source-stale'
  | 'unknown-source-key'
  | 'out-of-range-local-page'
  | 'invalid-component-owner'
  | 'page-gap'
  | 'page-overlap'
  | 'missing-activity-slot'
  | 'extra-activity-slot'
  | 'incomplete-mapping'
  | 'unsupported-activity-declaration'
  | 'presentation-context-contradiction'
  | 'manifest-validation';

export type BookAssemblyChangeClass = 'added' | 'removed' | 'renamed' | 'reordered' | 'moved' | 'page-mapping-changed' | 'source-replaced' | 'unresolved';

export interface BookAssemblyReconciliationChange {
  readonly id: string;
  readonly changeClass: BookAssemblyChangeClass;
  readonly itemKey: string;
  readonly current: string;
  readonly proposed: string;
  readonly resolution: 'automatic' | 'teacher-choice' | 'blocked';
  readonly message: string;
  readonly target?:
    | { readonly kind: 'source'; readonly sourceKey: string }
    | { readonly kind: 'node-move'; readonly nodeKey: string }
    | { readonly kind: 'activity-move'; readonly activityKey: string }
    | { readonly kind: 'activity-page-mapping'; readonly unitKey: string; readonly activityKey: string };
}

export interface BookAssemblyReconciliationIssue {
  readonly code: BookAssemblyReconciliationCode;
  readonly severity: BookAssemblyReconciliationSeverity;
  readonly repair: BookAssemblyReconciliationRepairKind;
  readonly path: string;
  readonly message: string;
}

export interface BookAssemblyReconciliationReport {
  readonly changes: readonly BookAssemblyReconciliationChange[];
  readonly issues: readonly BookAssemblyReconciliationIssue[];
  readonly releaseBlocking: boolean;
  readonly requiresTeacherChoice: boolean;
  readonly canApplyExactRepair: boolean;
  readonly repairedManifest: BookAssemblyManifestCandidate | null;
}

export interface AnalyzeBookAssemblyReconciliationInput {
  readonly manifest: BookAssemblyManifestCandidate;
  readonly currentManifest?: BookAssemblyManifestCandidate | null;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
  /** Canonical editable Activity JSON keyed by stable Activity key. */
  readonly activities?: Readonly<Record<string, unknown>>;
  readonly currentLabels?: Readonly<Record<string, string>>;
  readonly proposedLabels?: Readonly<Record<string, string>>;
  readonly currentComponents?: readonly ComponentPdfPreparationComponentInput[];
  readonly proposedComponents?: readonly ComponentPdfPreparationComponentInput[];
  readonly fuzzySuggestions?: readonly { currentKey: string; proposedKey: string; label: string }[];
  readonly resolvedChangeIds?: ReadonlySet<string>;
  readonly expectedBookRevision?: number;
  readonly bookRevision?: number;
  readonly expectedSourceSetRevision?: number;
  readonly sourceSetRevision?: number;
  readonly expectedCandidateRevision?: number;
  readonly candidateRevision?: number;
}

const compare = (left: string | number, right: string | number): number =>
  typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right));

const exact = (
  code: BookAssemblyReconciliationCode,
  path: string,
  message: string,
): BookAssemblyReconciliationIssue => ({ code, path, message, severity: 'warning', repair: 'exact' });

const blocker = (
  code: BookAssemblyReconciliationCode,
  path: string,
  message: string,
  repair: BookAssemblyReconciliationRepairKind = 'none',
): BookAssemblyReconciliationIssue => ({ code, path, message, severity: 'blocker', repair });

const clone = (manifest: BookAssemblyManifestCandidate): BookAssemblyManifestCandidate =>
  JSON.parse(JSON.stringify(manifest)) as BookAssemblyManifestCandidate;

const unitContainsOwner = (
  manifest: BookAssemblyManifestCandidate,
  unitKey: string,
  ownerNodeKey: string,
): boolean => {
  const parent = new Map(manifest.nodes.map((node) => [node.nodeKey, node.parentNodeKey]));
  let current: string | null | undefined = unitKey;
  while (current) {
    if (current === ownerNodeKey) return true;
    current = parent.get(current);
  }
  return false;
};

const validationIssue = (error: BookAssemblyValidationError): BookAssemblyReconciliationIssue => {
  const code: BookAssemblyReconciliationCode = error.code === 'unknown-source-key'
    ? 'unknown-source-key'
    : error.code === 'out-of-range-page'
      ? 'out-of-range-local-page'
      : error.code === 'invalid-owner'
        ? 'invalid-component-owner'
        : 'manifest-validation';
  return blocker(code, error.path, error.message);
};

const sourcePageCount = (
  manifest: BookAssemblyManifestCandidate,
  authority: BookSourceVersionAuthority,
  sourceKey: string,
): number | null => {
  const source = manifest.sourceSet.sources.find((entry) => entry.sourceKey === sourceKey);
  if (!source) return null;
  return authority.getSourceVersion(source.sourceVersionId)?.physicalPageCount ?? null;
};

const reconcileUnit = (
  manifest: BookAssemblyManifestCandidate,
  unit: BookUnitCandidate,
  unitIndex: number,
  authority: BookSourceVersionAuthority,
  issues: BookAssemblyReconciliationIssue[],
): BookUnitCandidate => {
  const path = `$.units[${unitIndex}]`;
  const sourceKeys = new Set(manifest.sourceSet.sources.map((source) => source.sourceKey));
  const slots = new Map(unit.activitySlots.map((slot) => [slot.activityKey, slot]));
  const groupKeys = new Set(unit.pageGroups.map((group) => group.pageGroupKey));
  const repairedGroups = unit.pageGroups.map((group, groupIndex) => {
    const groupPath = `${path}.pageGroups[${groupIndex}]`;
    if (!sourceKeys.has(group.sourceKey)) {
      issues.push(blocker('unknown-source-key', `${groupPath}.sourceKey`, `Unknown source key ${group.sourceKey}.`));
    }
    const source = manifest.sourceSet.sources.find((entry) => entry.sourceKey === group.sourceKey);
    if (source && typeof source.ownerNodeKey === 'string' && !unitContainsOwner(manifest, unit.unitKey, source.ownerNodeKey)) {
      issues.push(blocker('invalid-component-owner', `${groupPath}.sourceKey`, `Component source ${group.sourceKey} is outside this Unit branch.`));
    }
    const pageCount = sourcePageCount(manifest, authority, group.sourceKey);
    group.pages.forEach((page, pageIndex) => {
      if (pageCount !== null && (page < 1 || page > pageCount)) {
        issues.push(blocker('out-of-range-local-page', `${groupPath}.pages[${pageIndex}]`, `Page ${page} is outside local source range 1-${pageCount}.`));
      }
    });
    group.activityKeys.forEach((activityKey, activityIndex) => {
      if (!slots.has(activityKey)) {
        issues.push(blocker('missing-activity-slot', `${groupPath}.activityKeys[${activityIndex}]`, `Page Group references missing Activity slot ${activityKey}.`));
      }
    });
    const pages = [...new Set(group.pages)].sort(compare);
    if (pages.length !== group.pages.length || pages.some((page, index) => page !== group.pages[index])) {
      issues.push(exact('page-overlap', `${groupPath}.pages`, 'Duplicate or unordered local pages can be normalized without changing source identity.'));
    }
    return { ...group, pages };
  });

  const pageUse = new Map<string, string[]>();
  repairedGroups.forEach((group) => group.pages.forEach((page) => {
    const key = `${group.sourceKey}:${page}`;
    pageUse.set(key, [...(pageUse.get(key) ?? []), group.pageGroupKey]);
  }));
  pageUse.forEach((groups, page) => {
    if (groups.length > 1) {
      issues.push(blocker('page-overlap', path, `Local page ${page} belongs to multiple Page Groups: ${groups.sort().join(', ')}.`, 'teacher-choice'));
    }
  });
  const bySource = new Map<string, number[]>();
  repairedGroups.forEach((group) => {
    bySource.set(group.sourceKey, [...(bySource.get(group.sourceKey) ?? []), ...group.pages]);
  });
  bySource.forEach((pages, sourceKey) => {
    const ordered = [...new Set(pages)].sort(compare);
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index] > ordered[index - 1] + 1) {
        issues.push(blocker('page-gap', path, `Source ${sourceKey} has an ambiguous gap between local pages ${ordered[index - 1]} and ${ordered[index]}.`, 'teacher-choice'));
      }
    }
  });

  const repairedSlots = unit.activitySlots.map((slot, slotIndex) => {
    const slotPath = `${path}.activitySlots[${slotIndex}]`;
    const missingGroup = slot.pageGroupKeys.some((groupKey) => !groupKeys.has(groupKey));
    const mappedGroups = repairedGroups
      .filter((group) => group.activityKeys.includes(slot.activityKey))
      .map((group) => group.pageGroupKey);
    const statedGroups = [...new Set(slot.pageGroupKeys)].sort(compare);
    const combinedGroups = [...new Set([...statedGroups, ...mappedGroups])].sort(compare);
    if (missingGroup) {
      issues.push(blocker('incomplete-mapping', `${slotPath}.pageGroupKeys`, `Activity slot ${slot.activityKey} names a missing Page Group.`));
    }
    if (combinedGroups.length === 0) {
      issues.push(blocker('extra-activity-slot', slotPath, `Activity slot ${slot.activityKey} has no Page Group mapping.`, 'teacher-choice'));
    }
    if (!missingGroup && (combinedGroups.length !== slot.pageGroupKeys.length || combinedGroups.some((key, index) => key !== slot.pageGroupKeys[index]))) {
      issues.push(exact('incomplete-mapping', `${slotPath}.pageGroupKeys`, `Reciprocal Page Group mapping for ${slot.activityKey} can be synchronized exactly.`));
    }
    return { ...slot, pageGroupKeys: combinedGroups };
  });

  const repairedGroupActivityKeys = repairedGroups.map((group) => ({
    ...group,
    activityKeys: [...new Set(group.activityKeys)].sort(compare),
  }));
  return { ...unit, activitySlots: repairedSlots, pageGroups: repairedGroupActivityKeys };
};

const reportActivities = (
  manifest: BookAssemblyManifestCandidate,
  activities: Readonly<Record<string, unknown>> | undefined,
  issues: BookAssemblyReconciliationIssue[],
): void => {
  if (!activities) return;
  manifest.units.forEach((unit, unitIndex) => unit.activitySlots.forEach((slot, slotIndex) => {
    const activity = activities[slot.activityKey];
    const path = `$.units[${unitIndex}].activitySlots[${slotIndex}]`;
    if (activity === undefined) return;
    const mappedBookPageRefs = unit.pageGroups
      .filter((group) => group.activityKeys.includes(slot.activityKey))
      .flatMap((group) => group.pages.map((page) => `${group.sourceKey}:${page}`));
    const validation = validateEditableActivity(activity, { mappedBookPageRefs });
    validation.errors.forEach((error) => issues.push(blocker(
      ['invalid-presentation', 'source-context-required', 'missing-mapped-pages', 'task-profile-contradiction'].includes(error.code)
        ? 'presentation-context-contradiction'
        : 'unsupported-activity-declaration',
      `${path}.activity${error.path.slice(1)}`,
      error.message,
    )));
  }));
};

const describeNode = (node: BookAssemblyManifestCandidate['nodes'][number]): string =>
  `${node.nodeType} at ${node.parentNodeKey ?? 'root'}, position ${node.order}`;

const classifyChanges = (input: AnalyzeBookAssemblyReconciliationInput): BookAssemblyReconciliationChange[] => {
  const current = input.currentManifest;
  if (!current) return [];
  const changes: BookAssemblyReconciliationChange[] = [];
  const currentNodes = new Map(current.nodes.map((node) => [node.nodeKey, node]));
  const proposedNodes = new Map(input.manifest.nodes.map((node) => [node.nodeKey, node]));
  const add = (change: Omit<BookAssemblyReconciliationChange, 'id'>) => changes.push({
    ...change,
    id: `${change.changeClass}:${change.itemKey}:${JSON.stringify([change.current, change.proposed])}`,
  });
  current.nodes.forEach((node) => {
    const next = proposedNodes.get(node.nodeKey);
    if (!next) return add({ changeClass: 'removed', itemKey: node.nodeKey, current: describeNode(node), proposed: 'Removed', resolution: 'automatic', message: 'Stable item removed.' });
    const currentLabel = input.currentLabels?.[node.nodeKey];
    const proposedLabel = input.proposedLabels?.[node.nodeKey];
    if (currentLabel !== undefined && proposedLabel !== undefined && currentLabel !== proposedLabel) {
      add({ changeClass: 'renamed', itemKey: node.nodeKey, current: currentLabel, proposed: proposedLabel, resolution: 'automatic', message: 'Stable key preserves identity through rename.' });
    }
    if (node.parentNodeKey !== next.parentNodeKey) add({ changeClass: 'moved', itemKey: node.nodeKey, current: node.parentNodeKey ?? 'root', proposed: next.parentNodeKey ?? 'root', resolution: 'teacher-choice', message: 'Cross-Unit moves require an explicit decision.', target: { kind: 'node-move', nodeKey: node.nodeKey } });
    else if (node.order !== next.order) add({ changeClass: 'reordered', itemKey: node.nodeKey, current: String(node.order), proposed: String(next.order), resolution: 'automatic', message: 'Stable key preserves identity through reorder.' });
  });
  input.manifest.nodes.forEach((node) => {
    if (!currentNodes.has(node.nodeKey)) add({ changeClass: 'added', itemKey: node.nodeKey, current: 'Not present', proposed: describeNode(node), resolution: 'automatic', message: 'New stable item.' });
  });
  const currentSources = new Map<string, BookSourceCandidate>();
  current.sourceSet.sources.forEach((source) => currentSources.set(source.sourceKey, source));
  input.manifest.sourceSet.sources.forEach((source) => {
    const old = currentSources.get(source.sourceKey);
    if (old && old.sourceVersionId !== source.sourceVersionId) add({ changeClass: 'source-replaced', itemKey: source.sourceKey, current: old.sourceVersionId, proposed: source.sourceVersionId, resolution: 'teacher-choice', message: 'Source replacement keeps unchanged Activity keys but requires mapping review.', target: { kind: 'source', sourceKey: source.sourceKey } });
  });
  const currentSlots = new Map(current.units.flatMap((unit) => unit.activitySlots.map((slot) => [slot.activityKey, { unit, slot }] as const)));
  const proposedSlotKeys = new Set(input.manifest.units.flatMap((unit) => unit.activitySlots.map((slot) => slot.activityKey)));
  currentSlots.forEach(({ unit }, activityKey) => {
    if (!proposedSlotKeys.has(activityKey)) add({ changeClass: 'removed', itemKey: activityKey, current: unit.unitKey, proposed: 'Removed', resolution: 'automatic', message: 'Activity removed from the proposed tree.' });
  });
  input.manifest.units.forEach((unit) => unit.activitySlots.forEach((slot) => {
    const old = currentSlots.get(slot.activityKey);
    if (!old) {
      add({ changeClass: 'added', itemKey: slot.activityKey, current: 'Not present', proposed: unit.unitKey, resolution: 'automatic', message: 'Activity added to the proposed tree.' });
      return;
    }
    if (old.unit.unitKey !== unit.unitKey) add({ changeClass: 'moved', itemKey: slot.activityKey, current: old.unit.unitKey, proposed: unit.unitKey, resolution: 'teacher-choice', message: 'Cross-Unit Activity move requires an explicit decision.', target: { kind: 'activity-move', activityKey: slot.activityKey } });
    else if (old.slot.order !== slot.order) add({ changeClass: 'reordered', itemKey: slot.activityKey, current: String(old.slot.order), proposed: String(slot.order), resolution: 'automatic', message: 'Stable Activity key preserves identity through reorder.' });
    if (JSON.stringify(old.slot.pageGroupKeys) !== JSON.stringify(slot.pageGroupKeys)) add({ changeClass: 'page-mapping-changed', itemKey: slot.activityKey, current: old.slot.pageGroupKeys.join(', ') || 'None', proposed: slot.pageGroupKeys.join(', ') || 'None', resolution: 'teacher-choice', message: 'Page mapping changes require review.', target: { kind: 'activity-page-mapping', unitKey: unit.unitKey, activityKey: slot.activityKey } });
  }));
  const currentComponents = new Map(input.currentComponents?.map((component) => [component.sourceKey, component]) ?? []);
  input.proposedComponents?.forEach((component) => {
    const old = currentComponents.get(component.sourceKey);
    if (!old) return;
    ([['printedLabel', old.printedLabel, component.printedLabel], ['rotation', old.rotation, component.rotation], ['presentationMode', old.presentationMode, component.presentationMode]] as const)
      .forEach(([field, before, after]) => {
        if (before !== after) add({ changeClass: 'page-mapping-changed', itemKey: `${component.sourceKey}:${field}`, current: String(before), proposed: String(after), resolution: 'teacher-choice', message: `${field} changed and requires source-assisted preview review before handoff.` });
      });
  });
  input.fuzzySuggestions?.forEach((suggestion) => add({
    changeClass: 'unresolved', itemKey: `${suggestion.currentKey}→${suggestion.proposedKey}`,
    current: suggestion.currentKey, proposed: suggestion.proposedKey, resolution: 'teacher-choice',
    message: `${suggestion.label} is a suggestion only; stable identity requires an explicit decision.`,
  }));
  return changes.sort((left, right) => compare(left.changeClass, right.changeClass) || compare(left.itemKey, right.itemKey));
};

export const analyzeBookAssemblyReconciliation = (
  input: AnalyzeBookAssemblyReconciliationInput,
): BookAssemblyReconciliationReport => {
  const issues: BookAssemblyReconciliationIssue[] = [];
  if (input.expectedBookRevision !== undefined && input.bookRevision !== input.expectedBookRevision) {
    issues.push(blocker('candidate-stale', '$.bookRevision', 'Book revision changed; reload before repairing.'));
  }
  if (input.expectedSourceSetRevision !== undefined && input.sourceSetRevision !== input.expectedSourceSetRevision) {
    issues.push(blocker('source-stale', '$.sourceSetRevision', 'Source set revision changed; reload before repairing.'));
  }
  if (input.expectedCandidateRevision !== undefined && input.candidateRevision !== input.expectedCandidateRevision) {
    issues.push(blocker('candidate-stale', '$.candidateRevision', 'Candidate revision changed; reload before repairing.'));
  }

  const draft = clone(input.manifest);
  const repairedManifest: BookAssemblyManifestCandidate = {
    ...draft,
    units: draft.units.map((unit, unitIndex) => reconcileUnit(draft, unit, unitIndex, input.sourceVersionAuthority, issues)),
  };
  reportActivities(repairedManifest, input.activities, issues);
  validateBookAssemblyManifestCandidate(repairedManifest, input.sourceVersionAuthority).errors
    .forEach((error) => issues.push(validationIssue(error)));

  const orderedIssues = issues.slice().sort((left, right) =>
    compare(left.severity, right.severity)
    || compare(left.path, right.path)
    || compare(left.code, right.code)
    || compare(left.message, right.message));
  const changes = classifyChanges(input).map((change) => input.resolvedChangeIds?.has(change.id)
    ? { ...change, resolution: 'automatic' as const, message: `${change.message} Decision recorded.` }
    : change);
  const unresolvedChoice = changes.some((change) => change.resolution === 'teacher-choice');
  const requiresTeacherChoice = orderedIssues.some((entry) => entry.repair === 'teacher-choice') || unresolvedChoice;
  const releaseBlocking = orderedIssues.some((entry) => entry.severity === 'blocker') || unresolvedChoice;
  const canApplyExactRepair = !releaseBlocking
    && !requiresTeacherChoice
    && orderedIssues.some((entry) => entry.repair === 'exact');
  orderedIssues.filter((issue) => issue.severity === 'blocker').forEach((issue, index) => changes.push({
    id: `unresolved:${issue.code}:${issue.path}:${index}`,
    changeClass: 'unresolved',
    itemKey: issue.path,
    current: 'Unresolved',
    proposed: issue.message,
    resolution: 'blocked',
    message: 'Correct this required fact before handoff.',
  }));
  return {
    changes,
    issues: orderedIssues,
    releaseBlocking,
    requiresTeacherChoice,
    canApplyExactRepair,
    repairedManifest: canApplyExactRepair ? repairedManifest : null,
  };
};
