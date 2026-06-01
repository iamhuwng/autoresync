import { describe, expect, it } from 'vitest';
import {
  MATERIAL_BOOK_NODE_TYPES,
  MATERIAL_BOOK_STATUSES,
  MATERIAL_BOOK_VISIBILITIES,
  MATERIAL_CATALOG_MATERIAL_KINDS,
  MATERIAL_REF_AVAILABILITIES,
  MATERIAL_REF_UPDATE_STATES,
  READING_PASSAGE_VISIBILITY_SCOPES,
  materialCatalogIds,
  type MaterialBookMaterialRef,
  type MaterialBookMetadata,
  type MaterialBookNode,
  type MaterialTestTypeConfig,
  type TeacherTestTypePreference,
} from './materialCatalog.types';

describe('materialCatalog.types', () => {
  it('brands material catalog ids from non-empty strings', () => {
    expect(materialCatalogIds.testTypeId(' ielts ')).toBe('ielts');
    expect(materialCatalogIds.bookId('book-1')).toBe('book-1');
    expect(materialCatalogIds.nodeId('node-1')).toBe('node-1');
    expect(materialCatalogIds.refId('ref-1')).toBe('ref-1');
    expect(() => materialCatalogIds.bookId('   ')).toThrow(/non-empty/);
  });

  it('freezes PRD-0052 material catalog enum values', () => {
    expect(MATERIAL_CATALOG_MATERIAL_KINDS).toContain('reading-passage');
    expect(MATERIAL_CATALOG_MATERIAL_KINDS).toContain('book');
    expect(READING_PASSAGE_VISIBILITY_SCOPES).toEqual(['private', 'public']);
    expect(MATERIAL_BOOK_VISIBILITIES).toEqual([
      'private',
      'public-library-pending-review',
      'public-library-published',
      'public-library-rejected',
    ]);
    expect(MATERIAL_BOOK_STATUSES).toEqual([
      'draft-empty',
      'draft-in-progress',
      'ready',
      'archived',
    ]);
    expect(MATERIAL_BOOK_NODE_TYPES).toEqual([
      'intro-placeholder',
      'toc-placeholder',
      'note-placeholder',
      'section',
      'chapter',
      'test',
    ]);
    expect(MATERIAL_REF_AVAILABILITIES).toEqual([
      'available',
      'archived',
      'missing',
      'inaccessible',
    ]);
    expect(MATERIAL_REF_UPDATE_STATES).toEqual([
      'current',
      'newer-version-available',
      'unknown',
    ]);
  });

  it('models Test Type config and teacher preferences with PRD-0052 fields', () => {
    const config = {
      testTypeId: materialCatalogIds.testTypeId('ielts'),
      canonicalKey: 'IELTS',
      label: 'IELTS',
      shortLabel: 'IELTS',
      aliases: ['International English Language Testing System'],
      active: true,
      teacherSelectable: true,
      displayOrder: 1,
      defaultPinnedRank: 1,
      readingSourceOrderLabel: 'Passage',
      readingSourceOrderLabelPlural: 'Passages',
      logoUrl: '/assets/test-types/ielts.svg',
      logoAlt: 'IELTS logo',
      colorToken: 'rose',
      iconToken: 'reading',
      allowedMaterialKinds: ['full-test', 'reading-passage', 'book'],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      updatedBy: 'admin-1',
    } satisfies MaterialTestTypeConfig;

    const preference = {
      teacherId: 'teacher-1',
      pinnedTestTypeIds: [
        materialCatalogIds.testTypeId('ielts'),
        materialCatalogIds.testTypeId('toeic'),
        materialCatalogIds.testTypeId('toefl'),
        materialCatalogIds.testTypeId('thcs'),
      ],
      updatedAt: '2026-06-01T00:00:00.000Z',
      updatedBy: 'teacher-1',
    } satisfies TeacherTestTypePreference;

    expect(config.allowedMaterialKinds).toContain('reading-passage');
    expect(preference.pinnedTestTypeIds).toHaveLength(4);
  });

  it('models Book metadata, nodes, and material refs without nested child arrays', () => {
    const ref = {
      refId: materialCatalogIds.refId('ref-1'),
      materialId: 'material-1',
      materialKind: 'reading-passage',
      snapshotVersionId: 'snapshot-1',
      titleSnapshot: 'Source Passage 1',
      testTypeIdsSnapshot: [materialCatalogIds.testTypeId('ielts')],
      visibilitySnapshot: 'private',
      availability: 'available',
      updateState: 'current',
      order: 1,
      addedAt: '2026-06-01T00:00:00.000Z',
      addedBy: 'teacher-1',
    } satisfies MaterialBookMaterialRef;

    const node = {
      nodeId: materialCatalogIds.nodeId('node-1'),
      bookId: materialCatalogIds.bookId('book-1'),
      parentNodeId: null,
      type: 'intro-placeholder',
      title: 'Introduction',
      order: 1,
      materialRefs: [ref],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    } satisfies MaterialBookNode;

    const metadata = {
      bookId: materialCatalogIds.bookId('book-1'),
      ownerId: 'teacher-1',
      title: 'Cambridge IELTS 18',
      subtitle: 'Academic Reading',
      authors: ['Cambridge University Press'],
      publisher: 'Cambridge',
      edition: '18',
      series: 'Cambridge IELTS',
      isbn: '9780000000000',
      coverUrl: '',
      primaryTestTypeId: materialCatalogIds.testTypeId('ielts'),
      testTypeIds: [materialCatalogIds.testTypeId('ielts')],
      tags: ['reading'],
      description: 'Practice book',
      visibility: 'private',
      status: 'draft-empty',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      createdBy: 'teacher-1',
      updatedBy: 'teacher-1',
    } satisfies MaterialBookMetadata;

    expect(node.parentNodeId).toBeNull();
    expect('children' in node).toBe(false);
    expect(metadata.testTypeIds).toEqual(['ielts']);
  });
});
