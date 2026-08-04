import type { BookTeacherAssemblyDocumentProjection } from '../book-delivery/bookTeacherAssemblyDocument.types';
import type { TrustedBookSourceVersionProjection } from '../../types/bookAssembly.types';

export type AssemblyMappingViewerErrorCode =
  | 'document-unavailable'
  | 'page-out-of-range'
  | 'invalid-page';

export class AssemblyMappingViewerError extends Error {
  constructor(public readonly code: AssemblyMappingViewerErrorCode) {
    super(`assembly_mapping_viewer_${code}`);
    this.name = 'AssemblyMappingViewerError';
  }
}

export interface AssemblyMappingViewerPageSelection {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly physicalPageNumber: number;
}

const sourceAuthority = (
  sourceVersions: readonly TrustedBookSourceVersionProjection[],
  sourceVersionId: string,
): TrustedBookSourceVersionProjection | undefined =>
  sourceVersions.find((source) => source.sourceVersionId === sourceVersionId);

export const documentForSourceKey = (
  documents: readonly BookTeacherAssemblyDocumentProjection[],
  sourceKey: string,
): BookTeacherAssemblyDocumentProjection | null =>
  documents.find((document) => document.sourceKey === sourceKey) ?? null;

export const resolveAssemblyMappingViewerSelection = (input: {
  readonly documents: readonly BookTeacherAssemblyDocumentProjection[];
  readonly sourceVersions: readonly TrustedBookSourceVersionProjection[];
  readonly sourceKey: string;
  readonly physicalPageNumber: number;
}): AssemblyMappingViewerPageSelection => {
  if (!Number.isSafeInteger(input.physicalPageNumber) || input.physicalPageNumber < 1) {
    throw new AssemblyMappingViewerError('invalid-page');
  }

  const document = documentForSourceKey(input.documents, input.sourceKey);
  if (!document) throw new AssemblyMappingViewerError('document-unavailable');

  const source = sourceAuthority(input.sourceVersions, document.sourceVersionId);
  if (!source?.verifiedUsable || input.physicalPageNumber > source.physicalPageCount) {
    throw new AssemblyMappingViewerError('page-out-of-range');
  }

  return {
    sourceKey: document.sourceKey,
    sourceVersionId: document.sourceVersionId,
    physicalPageNumber: input.physicalPageNumber,
  };
};

export const safeMappingPageText = (
  selection: AssemblyMappingViewerPageSelection,
): string => `${selection.sourceKey} page ${selection.physicalPageNumber}`;
