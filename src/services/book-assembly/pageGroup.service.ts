import type {
  ActivityContextRequirement,
  BookPageGroupCandidate,
  BookUnitCandidate,
  PageGroupMode,
} from '../../types/bookAssembly.types';

export interface AddPageGroupInput {
  readonly unit: BookUnitCandidate | undefined;
  readonly unitKey: string;
  readonly pageGroupKey: string;
  readonly sourceKey: string;
  readonly pages: readonly number[];
  readonly mode: PageGroupMode;
  readonly activityKey?: string;
  readonly contextRequirement?: ActivityContextRequirement;
  readonly defaultPhysicalPageNumber?: number;
}

export interface ParsedPhysicalPages {
  readonly pages: readonly number[];
  readonly error: string | null;
}

const orderSlots = (slots: BookUnitCandidate['activitySlots']): BookUnitCandidate['activitySlots'] =>
  slots
    .slice()
    .sort((left, right) => left.order - right.order || left.activityKey.localeCompare(right.activityKey))
    .map((slot, index) => ({ ...slot, order: index + 1 }));

export const parsePhysicalPageList = (value: string): ParsedPhysicalPages => {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    return { pages: [], error: 'Enter comma-separated one-based physical page numbers.' };
  }
  const pages: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    if (!/^\d+$/u.test(part)) {
      return { pages: [], error: `Invalid physical page "${part}". Use one-based numbers only.` };
    }
    const page = Number(part);
    if (!Number.isSafeInteger(page) || page < 1) {
      return { pages: [], error: 'Physical pages must be one-based positive integers.' };
    }
    if (seen.has(page)) {
      return { pages: [], error: `Physical page ${page} is duplicated in this Page Group.` };
    }
    seen.add(page);
    pages.push(page);
  }
  return { pages, error: null };
};

export const upsertPageGroupMapping = (input: AddPageGroupInput): BookUnitCandidate => {
  const current: BookUnitCandidate = input.unit ?? {
    unitKey: input.unitKey,
    activitySlots: [],
    pageGroups: [],
  };
  const activityKey = input.activityKey ?? 'activity-1';
  const existingGroup = current.pageGroups.find((candidate) => candidate.pageGroupKey === input.pageGroupKey);
  const activityKeys = input.mode === 'reference_only'
    ? []
    : Array.from(new Set([...(existingGroup?.activityKeys ?? []), activityKey]));
  const group: BookPageGroupCandidate = {
    pageGroupKey: input.pageGroupKey,
    sourceKey: input.sourceKey,
    pages: input.pages,
    activityKeys,
    mode: input.mode,
    ...(input.defaultPhysicalPageNumber !== undefined
      ? { defaultPhysicalPageNumber: input.defaultPhysicalPageNumber }
      : {}),
  };
  const pageGroups = [
    ...current.pageGroups.filter((candidate) => candidate.pageGroupKey !== input.pageGroupKey),
    group,
  ];
  if (group.mode === 'reference_only') {
    return { ...current, pageGroups };
  }
  const existing = current.activitySlots.find((slot) => slot.activityKey === activityKey);
  const activitySlots = existing
    ? current.activitySlots.map((slot) => slot.activityKey === activityKey
        ? {
            ...slot,
            contextRequirement: input.contextRequirement ?? slot.contextRequirement,
            pageGroupKeys: Array.from(new Set([...slot.pageGroupKeys, group.pageGroupKey])),
          }
        : slot)
    : [
        ...current.activitySlots,
        {
          activityKey,
          order: current.activitySlots.length + 1,
          contextRequirement: input.contextRequirement ?? 'required',
          pageGroupKeys: [group.pageGroupKey],
        },
      ];
  return { ...current, pageGroups, activitySlots: orderSlots(activitySlots) };
};

export const reorderActivitySlot = (
  unit: BookUnitCandidate,
  activityKey: string,
  direction: -1 | 1,
): BookUnitCandidate => {
  const slots = orderSlots(unit.activitySlots);
  const index = slots.findIndex((slot) => slot.activityKey === activityKey);
  const selected = slots[index];
  const target = slots[index + direction];
  if (!selected || !target) return unit;
  return {
    ...unit,
    activitySlots: orderSlots(slots.map((slot) => {
      if (slot.activityKey === selected.activityKey) return { ...slot, order: target.order };
      if (slot.activityKey === target.activityKey) return { ...slot, order: selected.order };
      return slot;
    })),
  };
};
