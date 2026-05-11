import { isReadingV2Payload } from '../../config/readingV2FeatureFlags';

export interface ReadingV2NonMigrationDecision {
  readonly status: 'reading-v2' | 'legacy-ignored';
  readonly reason: 'explicit-engine' | 'historical-reading-not-migrated';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const hasLegacyReadingMarkers = (value: Record<string, unknown>): boolean => {
  const skill = typeof value.skill === 'string' ? value.skill.toLowerCase() : '';
  const testType = typeof value.testType === 'string' ? value.testType.toLowerCase() : '';
  const type = typeof value.type === 'string' ? value.type.toLowerCase() : '';

  return skill === 'reading' || testType.includes('reading') || type.includes('reading');
};

export const resolveReadingV2NonMigrationDecision = (
  material: unknown,
): ReadingV2NonMigrationDecision => {
  if (isReadingV2Payload(material)) {
    return {
      status: 'reading-v2',
      reason: 'explicit-engine',
    };
  }

  if (isRecord(material) && hasLegacyReadingMarkers(material)) {
    return {
      status: 'legacy-ignored',
      reason: 'historical-reading-not-migrated',
    };
  }

  return {
    status: 'legacy-ignored',
    reason: 'historical-reading-not-migrated',
  };
};

export const assertReadingV2ImportAllowed = (material: unknown): void => {
  const decision = resolveReadingV2NonMigrationDecision(material);

  if (decision.status !== 'reading-v2') {
    throw new Error(
      'Historical Reading materials are not automatically migrated into Reading V2 in PRD-0048.',
    );
  }
};
