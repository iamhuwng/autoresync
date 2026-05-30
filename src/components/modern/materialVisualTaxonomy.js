export const MATERIAL_VISUAL_KIND = Object.freeze({
  thcs: Object.freeze({
    iconKind: 'school',
    accentKind: 'sky',
  }),
  readingV2: Object.freeze({
    iconKind: 'reading',
    accentKind: 'rose',
  }),
  ieltsReading: Object.freeze({
    iconKind: 'reading',
    accentKind: 'rose',
  }),
  ieltsWriting: Object.freeze({
    iconKind: 'writing',
    accentKind: 'lavender',
  }),
  genericTest: Object.freeze({
    iconKind: 'test',
    accentKind: 'indigo',
  }),
  draft: Object.freeze({
    iconKind: 'draft',
    accentKind: 'peach',
  }),
  incomplete: Object.freeze({
    iconKind: 'incomplete',
    accentKind: 'incomplete',
  }),
});

function normalizeSkill(item) {
  return String(item?.skill || item?.metadata?.skill || '').toLowerCase();
}

function isIeltsMaterial(item) {
  return String(item?.testType || item?.metadata?.testType || '').toUpperCase() === 'IELTS';
}

export function resolveMaterialVisualKind(item) {
  if (item?.isComplete === false) {
    return 'incomplete';
  }
  if (item?.testType === 'THCS-THPT') {
    return 'thcs';
  }
  if (item?.deliveryEngine === 'reading-v2') {
    return 'readingV2';
  }
  if (item?.status === 'draft' || item?.kind === 'draft') {
    return 'draft';
  }
  if (isIeltsMaterial(item)) {
    const skill = normalizeSkill(item);
    if (skill === 'reading') {
      return 'ieltsReading';
    }
    if (skill === 'writing') {
      return 'ieltsWriting';
    }
  }
  return 'genericTest';
}

export function getMaterialVisuals(item) {
  return MATERIAL_VISUAL_KIND[resolveMaterialVisualKind(item)] || MATERIAL_VISUAL_KIND.genericTest;
}
