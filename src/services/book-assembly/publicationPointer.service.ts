import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPublicationPointer,
} from '../../types/bookAssembly.types';

export const createBookAssemblyPublicationPointer = (input: {
  readonly version: BookAssemblyImmutableManifestVersion;
  readonly operationId: string;
  readonly operationFingerprint?: string;
  readonly now: string;
}): BookAssemblyPublicationPointer => ({
  publicationId: input.version.publicationId,
  publicationRevision: input.version.publicationRevision,
  manifestVersionId: input.version.manifestVersionId,
  bookRevision: input.version.bookRevision,
  sourceSetRevision: input.version.sourceSetRevision,
  inputFingerprint: input.version.inputFingerprint,
  ...(input.operationFingerprint ? { operationFingerprint: input.operationFingerprint } : {}),
  updatedAt: input.now,
  updatedByCommandId: input.operationId,
});

export const pointerMatchesExpected = (
  current: BookAssemblyPublicationPointer | undefined,
  expectedPublicationId: string | null,
): boolean => {
  if (expectedPublicationId === null) return current === undefined;
  return current?.publicationId === expectedPublicationId;
};
