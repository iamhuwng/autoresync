import type {
  BookAssemblyActivityVersionRecord,
} from '../../types/bookAssembly.types';
import type {
  BookAssemblyPublicationResult,
  PublishBookAssemblyInput,
} from './publicationTransaction.service';
import {
  createBookAssemblyPublicationService,
  validateBookAssemblyPublicationInput,
} from './publicationTransaction.service';
import type {
  BookAssemblyPublicationRepository,
} from './publicationRepository';
import {
  assertCanonicalPublishedActivityVersion,
  type CanonicalPublishedActivityVersionRecord,
} from './canonicalActivityVersion.service';
import type {
  CanonicalActivityVersionWriter,
} from './canonicalPublicationRepository';

export interface CanonicalPublishBookAssemblyInput extends PublishBookAssemblyInput {
  readonly canonicalActivityVersions: readonly CanonicalPublishedActivityVersionRecord[];
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const invalid = (): BookAssemblyPublicationResult => ({
  status: 'invalid',
  failureCode: 'invalid-publication-plan',
});

const matchesInitialPublication = (
  record: CanonicalPublishedActivityVersionRecord,
  metadata: BookAssemblyActivityVersionRecord,
  input: CanonicalPublishBookAssemblyInput,
): boolean => {
  const provenance = record.provenance;
  return provenance.kind === 'initial-book-publication'
    && record.activityId === metadata.activityId
    && record.activityVersionId === metadata.activityVersionId
    && record.activityVersion === metadata.activityVersion
    && record.ownerId === metadata.ownerId
    && record.payloadFingerprint === metadata.canonicalPayloadFingerprint
    && record.createdByOperationId === metadata.createdByCommandId
    && provenance.bookId === metadata.bookId
    && provenance.bookId === input.plan.bookId
    && provenance.manifestVersionId === metadata.manifestVersionId
    && provenance.manifestVersionId === input.manifestVersionId
    && provenance.publicationId === metadata.publicationId
    && provenance.publicationId === input.publicationId
    && provenance.publicationRevision === metadata.publicationRevision
    && provenance.publicationRevision === input.publicationRevision
    && provenance.unitKey === metadata.unitKey
    && provenance.activityKey === metadata.activityKey
    && stable(provenance.sourcePages) === stable(metadata.sourcePages);
};

const validateCanonicalWriteSet = (
  input: CanonicalPublishBookAssemblyInput,
): readonly CanonicalPublishedActivityVersionRecord[] | null => {
  const metadata = input.plan.atomicWrites.activityVersions;
  if (input.canonicalActivityVersions.length !== metadata.length) return null;
  if (metadata.length === 0) {
    return (input.plan.atomicWrites.activityVersionRefs?.length ?? 0) > 0 ? [] : null;
  }

  const byId = new Map<string, CanonicalPublishedActivityVersionRecord>();
  try {
    for (const candidate of input.canonicalActivityVersions) {
      const record = assertCanonicalPublishedActivityVersion(candidate);
      if (byId.has(record.activityVersionId)) return null;
      byId.set(record.activityVersionId, record);
    }
  } catch {
    return null;
  }

  if (metadata.some((entry) => {
    const record = byId.get(entry.activityVersionId);
    return !record || !matchesInitialPublication(record, entry, input);
  })) return null;

  return [...byId.values()];
};

/**
 * Strict common publication boundary. Canonical Activity Versions are prepared
 * first, but remain externally invisible until the Book aggregate CAS commits
 * exact references and its publication pointer.
 */
export const createCanonicalBookAssemblyPublicationService = (
  repository: BookAssemblyPublicationRepository<BookAssemblyPublicationResult>,
  activityVersions: CanonicalActivityVersionWriter,
) => {
  const publication = createBookAssemblyPublicationService(repository);
  return {
    publish: async (
      input: CanonicalPublishBookAssemblyInput,
    ): Promise<BookAssemblyPublicationResult> => {
      const rejected = validateBookAssemblyPublicationInput(input);
      if (rejected) return rejected;
      const records = validateCanonicalWriteSet(input);
      if (!records) return invalid();

      for (const record of records) {
        const prepared = await activityVersions.prepare(record);
        if (prepared.status === 'conflict') {
          return { status: 'conflict', failureCode: 'duplicate-version' };
        }
      }

      for (const reference of input.plan.atomicWrites.activityVersionRefs ?? []) {
        const existing = await activityVersions.readPrepared(reference);
        if (!existing
          || existing.lifecycle !== 'published'
          || existing.activityId !== reference.activityId
          || existing.activityVersionId !== reference.activityVersionId
          || existing.activityVersion !== reference.activityVersion
          || existing.ownerId !== input.plan.ownerId
          || reference.canonicalPayloadFingerprint === undefined
          || existing.payloadFingerprint !== reference.canonicalPayloadFingerprint) {
          return invalid();
        }
      }

      return publication.publish(input);
    },
    rollback: publication.rollback,
  };
};
