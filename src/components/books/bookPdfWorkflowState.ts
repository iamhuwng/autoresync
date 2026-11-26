import type { BookAssemblyCurrentPublication } from '../../services/book-assembly/assemblyPublication.client';
import type {
  BookAssemblyManifestCandidate,
  BookContentTreeNodeCandidate,
  BookUnitCandidate,
} from '../../types/bookAssembly.types';

export type BookPdfWorkspaceTab =
  | 'pdf-files'
  | 'content-tree'
  | 'activity-json'
  | 'page-mapping'
  | 'preview'
  | 'metadata'
  | 'settings';

export type BookPdfAssemblySection =
  | 'pdf-files'
  | 'content-tree'
  | 'activity-json'
  | 'page-mapping'
  | 'preview';

export interface BookPdfUnitProgress {
  readonly unitKey: string;
  readonly label: string;
  readonly totalSlots: number;
  readonly savedSlots: number;
  readonly mappedSlots: number;
  readonly hasAllActivities: boolean;
  readonly hasAllPagesMapped: boolean;
  readonly isPublished: boolean;
}

export interface BookPdfWorkflowSummary {
  readonly hasMode: boolean;
  readonly sourceReady: boolean;
  readonly hasStructure: boolean;
  readonly totalUnits: number;
  readonly readyUnits: number;
  readonly publishedUnits: number;
}

export const isMetadataWorkspaceTab = (tab: BookPdfWorkspaceTab): tab is 'metadata' | 'settings' =>
  tab === 'metadata' || tab === 'settings';

export const getPublishedUnitKeys = (
  publication: BookAssemblyCurrentPublication | null | undefined,
): readonly string[] => (publication?.units ?? []).map((unit) => unit.unitKey);

export const hasBookStructure = (
  nodes: readonly BookContentTreeNodeCandidate[],
  units: readonly BookUnitCandidate[],
): boolean => nodes.length > 0 && units.length > 0;

export const hasExactUnitActivities = (
  unit: BookUnitCandidate,
  savedActivityKeysByUnit: Readonly<Record<string, readonly string[]>>,
  previewedActivityKeys: readonly string[] = [],
): boolean => {
  if (unit.activitySlots.length === 0) return false;
  const expected = new Set(unit.activitySlots.map((slot) => slot.activityKey));
  const saved = savedActivityKeysByUnit[unit.unitKey] ?? [];
  const actual = new Set([...saved, ...previewedActivityKeys]);
  return actual.size === expected.size && [...expected].every((key) => actual.has(key));
};

export const countMappedSlots = (unit: BookUnitCandidate): number => {
  const validGroups = new Set(
    unit.pageGroups
      .filter((group) => group.pages.length > 0)
      .map((group) => group.pageGroupKey),
  );
  return unit.activitySlots.filter((slot) =>
    slot.pageGroupKeys.some((groupKey) => validGroups.has(groupKey)),
  ).length;
};

export const getUnitProgressList = (
  units: readonly BookUnitCandidate[],
  savedActivityKeysByUnit: Readonly<Record<string, readonly string[]>>,
  publishedUnitKeys: readonly string[],
): readonly BookPdfUnitProgress[] => {
  const published = new Set(publishedUnitKeys);
  return units.map((unit, index) => {
    const totalSlots = unit.activitySlots.length;
    const savedSet = new Set(savedActivityKeysByUnit[unit.unitKey] ?? []);
    const savedSlots = unit.activitySlots.filter((slot) => savedSet.has(slot.activityKey)).length;
    const mappedSlots = countMappedSlots(unit);
    return {
      unitKey: unit.unitKey,
      label: `Unit ${index + 1}`,
      totalSlots,
      savedSlots,
      mappedSlots,
      hasAllActivities: totalSlots > 0 && savedSlots === totalSlots,
      hasAllPagesMapped: totalSlots > 0 && mappedSlots === totalSlots,
      isPublished: published.has(unit.unitKey),
    };
  });
};

export const resolveSelectedUnitKey = (
  units: readonly BookUnitCandidate[],
  preferredUnitKey: string | null | undefined,
): string | null => {
  if (preferredUnitKey && units.some((unit) => unit.unitKey === preferredUnitKey)) {
    return preferredUnitKey;
  }
  return units[0]?.unitKey ?? null;
};

export const formatUnitLabel = (
  units: readonly BookUnitCandidate[],
  unitKey: string | null | undefined,
): string => {
  if (!unitKey) return 'Unit';
  const index = units.findIndex((unit) => unit.unitKey === unitKey);
  return index >= 0 ? `Unit ${index + 1}` : unitKey;
};

/**
 * Computes the natural landing tab when opening a PDF Book in the unified workspace.
 * Resumes unfinished drafts at their exact next incomplete stage instead of dropping
 * teachers onto Metadata.
 */
export const pickInitialPdfWorkspaceTab = (summary: BookPdfWorkflowSummary): BookPdfWorkspaceTab => {
  if (!summary.hasMode || !summary.sourceReady) return 'pdf-files';
  if (!summary.hasStructure) return 'content-tree';
  if (summary.publishedUnits > 0) {
    return summary.publishedUnits < summary.totalUnits ? 'activity-json' : 'preview';
  }
  if (summary.readyUnits === 0) return 'activity-json';
  return 'preview';
};

export const manifestHasStructure = (manifest: BookAssemblyManifestCandidate | null | undefined): boolean =>
  Boolean(manifest && hasBookStructure(manifest.nodes, manifest.units));
