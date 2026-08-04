import {
  type ActivityContextRequirement,
  type BookAssemblyManifestCandidate,
  type BookAssemblyValidationError,
  type BookSourceVersionAuthority,
  type BookUnitCandidate,
} from '../../types/bookAssembly.types';
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

export interface ActivityReconciliationDeclaration {
  readonly activityKey: string;
  readonly family: string;
  readonly variant: string;
  readonly profile: string | null;
  readonly presentationMode: 'structured' | 'source-assisted' | 'unknown';
  readonly contextRequirement: ActivityContextRequirement;
}

export interface BookAssemblyReconciliationIssue {
  readonly code: BookAssemblyReconciliationCode;
  readonly severity: BookAssemblyReconciliationSeverity;
  readonly repair: BookAssemblyReconciliationRepairKind;
  readonly path: string;
  readonly message: string;
}

export interface BookAssemblyReconciliationReport {
  readonly issues: readonly BookAssemblyReconciliationIssue[];
  readonly releaseBlocking: boolean;
  readonly requiresTeacherChoice: boolean;
  readonly canApplyExactRepair: boolean;
  readonly repairedManifest: BookAssemblyManifestCandidate | null;
}

export interface AnalyzeBookAssemblyReconciliationInput {
  readonly manifest: BookAssemblyManifestCandidate;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
  readonly activityDeclarations?: Readonly<Record<string, ActivityReconciliationDeclaration>>;
  readonly expectedBookRevision?: number;
  readonly bookRevision?: number;
  readonly expectedSourceSetRevision?: number;
  readonly sourceSetRevision?: number;
  readonly expectedCandidateRevision?: number;
  readonly candidateRevision?: number;
}

const supportedDeclarations = new Set([
  'choice:single-select',
  'choice:multi-select',
  'text-entry:short-answer',
  'text-entry:gap-fill',
  'matching:drag-match',
  'ordering:drag-order',
  'long-response:essay',
]);

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
    if (source && 'ownerNodeKey' in source && !unitContainsOwner(manifest, unit.unitKey, source.ownerNodeKey)) {
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

const reportDeclarations = (
  manifest: BookAssemblyManifestCandidate,
  declarations: Readonly<Record<string, ActivityReconciliationDeclaration>> | undefined,
  issues: BookAssemblyReconciliationIssue[],
): void => {
  if (!declarations) return;
  manifest.units.forEach((unit, unitIndex) => unit.activitySlots.forEach((slot, slotIndex) => {
    const declaration = declarations[slot.activityKey];
    if (!declaration) return;
    const path = `$.units[${unitIndex}].activitySlots[${slotIndex}]`;
    if (!supportedDeclarations.has(`${declaration.family}:${declaration.variant}`)) {
      issues.push(blocker('unsupported-activity-declaration', path, `Unsupported Activity declaration ${declaration.family}:${declaration.variant}.`));
    }
    if (declaration.contextRequirement !== slot.contextRequirement) {
      issues.push(blocker('presentation-context-contradiction', path, `Activity declaration context does not match slot ${slot.activityKey}.`, 'teacher-choice'));
    }
    if (declaration.presentationMode === 'structured' && slot.contextRequirement === 'required') {
      issues.push(blocker('presentation-context-contradiction', path, 'A required-source Activity cannot auto-select structured presentation.', 'teacher-choice'));
    }
  }));
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
  reportDeclarations(repairedManifest, input.activityDeclarations, issues);
  validateBookAssemblyManifestCandidate(repairedManifest, input.sourceVersionAuthority).errors
    .forEach((error) => issues.push(validationIssue(error)));

  const orderedIssues = issues.slice().sort((left, right) =>
    compare(left.severity, right.severity)
    || compare(left.path, right.path)
    || compare(left.code, right.code)
    || compare(left.message, right.message));
  const requiresTeacherChoice = orderedIssues.some((entry) => entry.repair === 'teacher-choice');
  const releaseBlocking = orderedIssues.some((entry) => entry.severity === 'blocker');
  const canApplyExactRepair = !releaseBlocking
    && !requiresTeacherChoice
    && orderedIssues.some((entry) => entry.repair === 'exact');
  return {
    issues: orderedIssues,
    releaseBlocking,
    requiresTeacherChoice,
    canApplyExactRepair,
    repairedManifest: canApplyExactRepair ? repairedManifest : null,
  };
};
