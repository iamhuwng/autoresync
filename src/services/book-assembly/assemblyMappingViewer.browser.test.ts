import { describe, expect, it } from 'vitest';
import { createBookTeacherAssemblyDocumentRoute } from '../book-delivery/bookTeacherAssemblyDocument.types';
import {
  AssemblyMappingViewerError,
  documentForSourceKey,
  resolveAssemblyMappingViewerSelection,
  safeMappingPageText,
} from './assemblyMappingViewer.browser';
import type { BookTeacherAssemblyDocumentProjection } from '../book-delivery/bookTeacherAssemblyDocument.types';
import type { TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';

const sourceVersions: readonly TrustedBookSourceVersionProjection[] = [
  { sourceKey: 'full', sourceVersionId: 'source-full', bookId: 'book-1', purpose: 'book-source', studentSafeStatus: 'ready', studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: '2026-08-11T00:02:00.000Z', sourceVersionId: 'source-full', sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed' }, physicalPageCount: 40, verifiedUsable: true },
  { sourceKey: 'component-a', sourceVersionId: 'source-part', bookId: 'book-1', purpose: 'book-source', studentSafeStatus: 'ready', studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: '2026-08-11T00:02:00.000Z', sourceVersionId: 'source-part', sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed' }, physicalPageCount: 2, verifiedUsable: true },
  { sourceKey: 'stale', sourceVersionId: 'source-stale', bookId: 'book-1', purpose: 'book-source', studentSafeStatus: 'review-required', studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: '2026-08-11T00:02:00.000Z', sourceVersionId: 'source-stale', sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed' }, physicalPageCount: 10, verifiedUsable: false },
];

const document = (
  sourceKey: string,
  sourceVersionId: string,
): BookTeacherAssemblyDocumentProjection => ({
  kind: 'teacher_assembly',
  bookId: 'book-1',
  candidateId: 'candidate-1',
  candidateRevision: 1,
  bookRevision: 2,
  sourceSetRevision: 3,
  sourceKey,
  sourceVersionId,
  route: createBookTeacherAssemblyDocumentRoute({
    workerOrigin: 'https://worker.example',
    bookId: 'book-1',
    unitKey: 'unit-1',
    candidateId: 'candidate-1',
    candidateRevision: 1,
    sourceKey,
    sourceVersionId,
    sourceSetRevision: 3,
    bookRevision: 2,
    physicalPageNumber: 1,
  }),
});

describe('assemblyMappingViewer browser service', () => {
  it('resolves a source-qualified one-based page selection', () => {
    const selection = resolveAssemblyMappingViewerSelection({
      documents: [document('full', 'source-full')],
      sourceVersions,
      sourceKey: 'full',
      physicalPageNumber: 12,
    });

    expect(selection).toEqual({
      sourceKey: 'full',
      sourceVersionId: 'source-full',
      physicalPageNumber: 12,
    });
    expect(safeMappingPageText(selection)).toBe('full page 12');
  });

  it('keeps repeated physical pages disambiguated by source key', () => {
    const documents = [
      document('full', 'source-full'),
      document('component-a', 'source-part'),
    ];

    expect(documentForSourceKey(documents, 'full')?.sourceVersionId).toBe('source-full');
    expect(documentForSourceKey(documents, 'component-a')?.sourceVersionId).toBe('source-part');
    expect(resolveAssemblyMappingViewerSelection({
      documents,
      sourceVersions,
      sourceKey: 'component-a',
      physicalPageNumber: 2,
    })).toEqual({
      sourceKey: 'component-a',
      sourceVersionId: 'source-part',
      physicalPageNumber: 2,
    });
  });

  it('fails closed for missing, invalid, out-of-range, and stale selections', () => {
    expect(() => resolveAssemblyMappingViewerSelection({
      documents: [document('full', 'source-full')],
      sourceVersions,
      sourceKey: 'missing',
      physicalPageNumber: 1,
    })).toThrow(new AssemblyMappingViewerError('document-unavailable'));

    expect(() => resolveAssemblyMappingViewerSelection({
      documents: [document('full', 'source-full')],
      sourceVersions,
      sourceKey: 'full',
      physicalPageNumber: 0,
    })).toThrow(new AssemblyMappingViewerError('invalid-page'));

    expect(() => resolveAssemblyMappingViewerSelection({
      documents: [document('component-a', 'source-part')],
      sourceVersions,
      sourceKey: 'component-a',
      physicalPageNumber: 3,
    })).toThrow(new AssemblyMappingViewerError('page-out-of-range'));

    expect(() => resolveAssemblyMappingViewerSelection({
      documents: [document('stale', 'source-stale')],
      sourceVersions,
      sourceKey: 'stale',
      physicalPageNumber: 1,
    })).toThrow(new AssemblyMappingViewerError('page-out-of-range'));
  });
});
