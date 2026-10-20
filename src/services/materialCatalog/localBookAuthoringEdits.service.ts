import type { ActivityContextRequirement, BookAssemblyManifestCandidate, BookPageGroupCandidate, BookUnitCandidate } from '../../types/bookAssembly.types';
import { parseUnitActivityImportBundle } from '../book-assembly/unitActivityImport.service';
import { validateLocalBookAuthoring, type LocalBookAuthoringValidationInput } from './localBookAuthoringValidation.service';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A plan defines slots and mappings; missing Activity content is expected here. */
export const importLocalBookPlan = (input: LocalBookAuthoringValidationInput, text: string): string => {
  const result = validateLocalBookAuthoring({ ...input, structureJson: text, unitsJson: '{}', pageMappingJson: '{"units":[]}' });
  const error = result.errors.find((entry) => entry.field !== 'activities');
  if (error) throw new Error(`${error.message} (${error.path})`);
  return JSON.stringify(JSON.parse(text), null, 2);
};

export const importLocalBookUnit = (
  storedText: string, text: string, manifest: BookAssemblyManifestCandidate, unitKey: string,
): string => {
  const bundle = parseUnitActivityImportBundle(text, manifest, unitKey, { localAuthoring: true });
  let stored: unknown;
  try {
    // A blank initial draft has no imported Units. Nonempty malformed state must not be discarded.
    stored = storedText.trim() ? JSON.parse(storedText) : {};
  } catch { throw new Error('The saved Activity draft cannot be read. Your returned JSON has not been applied.'); }
  if (!object(stored) || (stored.units !== undefined && !Array.isArray(stored.units))
    || Object.keys(stored).some((key) => key !== 'units')) {
    throw new Error('The saved Activity draft has an invalid structure. Your returned JSON has not been applied.');
  }
  const units = Array.isArray(stored.units) ? [...stored.units] : [];
  const imported = { unitKey, slots: bundle.slots };
  const index = units.findIndex((entry) => object(entry) && entry.unitKey === unitKey);
  if (index < 0) units.push(imported); else units[index] = imported;
  return JSON.stringify({ units }, null, 2);
};

/** Replace one Unit atomically; existing errors elsewhere must not prevent incremental repair. */
export const reviseLocalBookConnections = (input: LocalBookAuthoringValidationInput, unit: BookUnitCandidate) => {
  const structure = JSON.parse(input.structureJson);
  const mapping = JSON.parse(input.pageMappingJson);
  if (!object(structure) || !Array.isArray(structure.units) || !object(mapping) || !Array.isArray(mapping.units)) {
    throw new Error('The saved Book plan cannot be read. Return to Plan to replace it.');
  }
  const replace = (units: unknown[]) => {
    const index = units.findIndex((entry) => object(entry) && entry.unitKey === unit.unitKey);
    const next = [...units];
    if (index < 0) next.push(unit); else next[index] = unit;
    return next;
  };
  const patch = {
    structureJson: JSON.stringify({ ...structure, units: replace(structure.units) }, null, 2),
    pageMappingJson: JSON.stringify({ ...mapping, units: replace(mapping.units) }, null, 2),
  };
  const identity = (error: ReturnType<typeof validateLocalBookAuthoring>['errors'][number], value: LocalBookAuthoringValidationInput) => {
    const unitIndex = error.path.match(/units\[(\d+)\]/)?.[1];
    let path = error.path;
    if (unitIndex !== undefined && (error.field === 'structure' || error.field === 'mapping')) {
      const units = JSON.parse(error.field === 'mapping' ? value.pageMappingJson : value.structureJson).units;
      const unit = units?.[Number(unitIndex)];
      if (unit) {
        path = path.replace(/units\[\d+\]/, `units[${unit.unitKey}]`)
          .replace(/pageGroups\[(\d+)\]/, (_, index) => `pageGroups[${unit.pageGroups?.[Number(index)]?.pageGroupKey ?? index}]`)
          .replace(/activitySlots\[(\d+)\]/, (_, index) => `activitySlots[${unit.activitySlots?.[Number(index)]?.activityKey ?? index}]`);
      }
    }
    return JSON.stringify({ ...error, path });
  };
  const before = new Set(validateLocalBookAuthoring(input).errors.map((error) => identity(error, input)));
  const result = validateLocalBookAuthoring({ ...input, ...patch });
  const newError = result.errors.find((error) => !before.has(identity(error, { ...input, ...patch })));
  if (newError) throw new Error(newError.message);
  return patch;
};

export const connectLocalBookActivity = (
  unit: BookUnitCandidate, activityKey: string, groups: readonly BookPageGroupCandidate[], context: ActivityContextRequirement,
): BookUnitCandidate => {
  const replacements = groups.map((group) => ({
    ...group,
    // A shared group's other Activities keep their existing connection and identity.
    pageGroupKey: group.activityKeys.some((key) => key !== activityKey) ? `pages-${crypto.randomUUID()}` : group.pageGroupKey,
    activityKeys: [activityKey], mode: 'activity' as const,
  }));
  const byOriginal = new Map(groups.map((group, index) => [group.pageGroupKey, replacements[index]]));
  const pageGroups = unit.pageGroups.flatMap((group) => {
    if (!group.activityKeys.includes(activityKey)) return [group];
    const activityKeys = group.activityKeys.filter((key) => key !== activityKey);
    const replacement = byOriginal.get(group.pageGroupKey);
    return [...(activityKeys.length ? [{ ...group, activityKeys }] : []), ...(replacement ? [replacement] : [])];
  });
  groups.forEach((group, index) => { if (!unit.pageGroups.some((existing) => existing.pageGroupKey === group.pageGroupKey)) pageGroups.push(replacements[index]); });
  return {
    ...unit, pageGroups,
    activitySlots: unit.activitySlots.map((slot) => slot.activityKey === activityKey
      ? { ...slot, contextRequirement: context, pageGroupKeys: replacements.map((group) => group.pageGroupKey) } : slot),
  };
};
