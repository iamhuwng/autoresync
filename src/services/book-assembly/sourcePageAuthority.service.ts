import type {
  BookSourceVersionAuthority,
  SourcePageReference,
  SourceQualifiedPageIdentity,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';

/** Resolves a local page only through the named immutable Source Version. */
export const resolveSourceQualifiedPage = (
  sourceSet: SourceSetCandidate,
  input: {
    readonly bookId: string;
    readonly sourceVersionAuthority: BookSourceVersionAuthority;
  },
  page: SourcePageReference,
  path: string,
): SourceQualifiedPageIdentity => {
  const source = sourceSet.sources.find((candidate) => candidate.sourceKey === page.sourceKey);
  if (!source) throw new Error(`${path}:unknown-source-key`);
  const trusted = input.sourceVersionAuthority.getSourceVersion(source.sourceVersionId);
  if (!trusted || trusted.sourceVersionId !== source.sourceVersionId) {
    throw new Error(`${path}:unknown-source-version`);
  }
  if (trusted.bookId !== input.bookId) throw new Error(`${path}:source-book-mismatch`);
  if (!trusted.verifiedUsable) throw new Error(`${path}:unverified-source-version`);
  if (!Number.isSafeInteger(page.physicalPageNumber)
    || page.physicalPageNumber < 1
    || page.physicalPageNumber > trusted.physicalPageCount) {
    throw new Error(`${path}:out-of-range-page`);
  }
  return {
    sourceKey: source.sourceKey,
    sourceVersionId: source.sourceVersionId,
    physicalPageNumber: page.physicalPageNumber,
  };
};
