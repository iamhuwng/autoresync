import { describe, expect, it } from 'vitest';
import {
  READING_V2_ENGINE,
  READING_V2_PRODUCT_LABEL,
} from '../../config/readingV2FeatureFlags';
import { readingV2Ids } from '../../types/readingV2.types';
import type { ReadingV2MaterialMetadata } from '../reading-v2/readingV2MaterialMetadata.service';
import { assertMaterialSummary } from './materialSummaryPort.service';
import { createReadingV2MaterialSummary } from './materialSummaryAdapters.service';

const fullTestMetadata = (
  overrides: Partial<ReadingV2MaterialMetadata> = {},
): ReadingV2MaterialMetadata => ({
  materialId: readingV2Ids.materialId('material-1'),
  ownerId: 'teacher-1',
  state: 'published',
  deliveryEngine: READING_V2_ENGINE,
  productLabel: READING_V2_PRODUCT_LABEL,
  title: 'Reading V2 Full Test',
  materialKind: 'full-test',
  durationMinutes: 60,
  difficulty: 'intermediate',
  description: '',
  tags: [],
  visibility: 'private',
  testTypeIds: [],
  updatedAt: '2026-07-07T00:00:00.000Z',
  relationshipSurfaces: [],
  ...overrides,
});

describe('materialSummaryAdapters.service', () => {
  it('falls back full-test tags so blank Studio metadata still satisfies summary contract', () => {
    const summary = createReadingV2MaterialSummary(fullTestMetadata());

    expect(summary).toMatchObject({
      materialId: 'material-1',
      producerId: 'reading-v2-full-test',
      tags: ['reading'],
      testTypeIds: ['custom'],
    });
    assertMaterialSummary(summary);
  });
});
