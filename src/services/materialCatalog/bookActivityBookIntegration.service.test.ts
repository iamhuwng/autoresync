import { describe, expect, it } from 'vitest';
import {
  materialCatalogIds,
  type MaterialBookMaterialRef,
} from '../../types/materialCatalog.types';
import {
  BookActivityBookIntegrationError,
  validateBookActivityBookIntegration,
} from './bookActivityBookIntegration.service';

const ref = (overrides: Partial<MaterialBookMaterialRef> = {}): MaterialBookMaterialRef => ({
  refId: materialCatalogIds.refId('ref-1'),
  materialId: 'activity-1',
  materialKind: 'interactive-activity',
  snapshotVersionId: 'version-1',
  titleSnapshot: 'Activity',
  testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
  availability: 'available',
  updateState: 'current',
  order: 1,
  addedAt: '2026-07-09T00:00:00.000Z',
  addedBy: 'teacher-1',
  ...overrides,
});

describe('bookActivityBookIntegration.service', () => {
  it('rejects invalid Activity-capable Book integration shapes through typed boundary', () => {
    const valid = {
      bookId: 'book-1',
      nodeId: 'node-1',
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'version-1',
      ref: ref(),
    };

    expect(validateBookActivityBookIntegration(valid)).toBe(valid);
    expect(() => validateBookActivityBookIntegration({
      ...valid,
      ref: ref({ materialKind: 'reading-passage' }),
    })).toThrow(BookActivityBookIntegrationError);
    expect(() => validateBookActivityBookIntegration({
      ...valid,
      ref: ref({ snapshotVersionId: undefined }),
    })).toThrow(/snapshotVersionId/);
  });
});
