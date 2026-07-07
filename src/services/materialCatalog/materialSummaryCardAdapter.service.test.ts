import { describe, expect, it } from 'vitest';
import { adaptMaterialSummaryToTeacherCard } from './materialSummaryCardAdapter.service';
import {
  MATERIAL_SUMMARY_SCHEMA_VERSION,
  type MaterialSummary,
} from './materialSummaryPort.service';

describe('materialSummaryCardAdapter', () => {
  it('adapts every summary family without canonical hydration', () => {
    const summary: MaterialSummary = {
      schemaVersion: MATERIAL_SUMMARY_SCHEMA_VERSION,
      materialId: 'passage-1',
      producerId: 'reading-v2-passage',
      materialKind: 'reading-passage',
      surfaceFamily: 'passage',
      ownerId: 'teacher-1',
      title: 'Passage',
      visibility: 'public',
      lifecycleState: 'active',
      skillId: 'reading',
      testTypeIds: ['custom' as any],
      testTypeMembership: { custom: true },
      tags: ['reading-passage'],
      questionCount: 13,
      updatedAt: '2026-07-07T00:00:00.000Z',
    };

    expect(adaptMaterialSummaryToTeacherCard(summary)).toMatchObject({
      id: 'passage-1',
      producerId: 'reading-v2-passage',
      materialKind: 'reading-passage',
      deliveryEngine: 'reading-v2',
      isPublic: true,
      questionCount: 13,
    });
  });
});
