import { describe, expect, it } from 'vitest';
import {
  MaterialCapabilityRegistryError,
  getMaterialKindCapabilities,
  listMaterialCapabilityRows,
  requireMaterialCapabilityAdapter,
  validateMaterialCapabilityRegistry,
} from './materialCapabilityRegistry.service';

describe('materialCapabilityRegistry.service', () => {
  it('returns complete interactive-activity capabilities and fails closed when adapter is missing', () => {
    const capabilities = getMaterialKindCapabilities('interactive-activity');

    expect(capabilities).toMatchObject({
      playable: true,
      assignable: true,
      embeddableInBook: true,
      gradable: true,
      supportsSourceContext: true,
      supportsPlacementScopedProgress: true,
      launchAdapterId: 'book-activity-launch-v1',
      assignmentAdapterId: 'book-activity-assignment-v1',
      resultAdapterId: 'book-activity-result-v1',
      projectionAdapterId: 'book-activity-projection-v1',
    });
    expect(requireMaterialCapabilityAdapter('interactive-activity', 'launchAdapterId')).toBe('book-activity-launch-v1');
    expect(() => requireMaterialCapabilityAdapter('grammar-worksheet', 'launchAdapterId')).toThrow(
      /does not support/,
    );

    const brokenRegistry = Object.fromEntries(
      listMaterialCapabilityRows()
        .filter((row) => row.materialKind !== 'interactive-activity')
        .map((row) => [row.materialKind, row]),
    ) as Parameters<typeof validateMaterialCapabilityRegistry>[0];

    expect(() => validateMaterialCapabilityRegistry(brokenRegistry)).toThrow(
      MaterialCapabilityRegistryError,
    );
  });
});
