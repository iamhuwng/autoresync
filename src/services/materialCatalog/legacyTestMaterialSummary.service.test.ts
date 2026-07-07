import { describe, expect, it } from 'vitest';
import { assertMaterialSummary } from './materialSummaryPort.service';
import { createLegacyTestMaterialSummary } from './legacyTestMaterialSummary.service';

describe('legacyTestMaterialSummary', () => {
  it.each([
    ['Writing', 'IELTS', 'writing', 'writing-prompt'],
    ['Listening', 'IELTS', 'listening', 'listening-part'],
    ['Reading', 'THCS-THPT', 'thcs-thpt', 'thcs-thpt-test'],
    ['Reading', 'IELTS', 'generic-test', 'full-test'],
  ])('maps %s/%s into registered producer %s', (
    skill,
    testType,
    producerId,
    materialKind,
  ) => {
    const summary = createLegacyTestMaterialSummary('test-1', {
      ownerId: 'teacher-1',
      title: 'Material',
      skill,
      testType,
      isPublic: true,
      questions: [{ id: 1 }],
      duration: 60,
      updatedAt: 1_700_000_000_000,
      metadata: { tags: ['tag', 'tag'] },
    });

    expect(summary).toMatchObject({
      producerId,
      materialKind,
      ownerId: 'teacher-1',
      visibility: 'public',
      questionCount: 1,
      testTypeIds: [testType.toLowerCase()],
      tags: ['tag'],
    });
    expect(() => assertMaterialSummary(summary)).not.toThrow();
  });

  it('creates a removed tombstone and rejects identity-less tests', () => {
    expect(createLegacyTestMaterialSummary('test-1', {
      ownerId: 'teacher-1',
      title: 'Material',
      updatedAt: '2026-07-07T00:00:00.000Z',
    }, 'removed')).toMatchObject({ lifecycleState: 'removed' });

    expect(() => createLegacyTestMaterialSummary('test-1', {
      title: 'Material',
      updatedAt: '2026-07-07T00:00:00.000Z',
    })).toThrow(/ownerId/i);
  });
});
