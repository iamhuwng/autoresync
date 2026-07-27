import type { BookUnitCandidate } from '../../types/bookAssembly.types';

export const missingRequiredSourceContext = (
  unit: BookUnitCandidate,
): readonly string[] => {
  const activityGroups = new Map(
    unit.pageGroups
      .filter((group) => group.mode === 'activity')
      .map((group) => [group.pageGroupKey, group]),
  );
  return unit.activitySlots
    .filter((slot) => slot.contextRequirement === 'required'
      && !slot.pageGroupKeys.some((pageGroupKey) => activityGroups.has(pageGroupKey)))
    .map((slot) => slot.activityKey);
};

export const unitHasPublishableSourceContext = (unit: BookUnitCandidate): boolean =>
  missingRequiredSourceContext(unit).length === 0;
