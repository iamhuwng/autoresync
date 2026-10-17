import type {
  MaterialBookSourceAttachmentBook,
  MaterialBookSourceAttachmentOperationReceipt,
  MaterialBookSourceAttachmentRepository,
  MaterialBookSourceAttachmentScope,
  MaterialBookSourceAttachmentTransaction,
} from '../../../../src/services/book-source-delivery/materialBookSourceAttachment.service.ts';
import {
  createMaterialBookSourceAttachmentService,
  type AttachMaterialBookSourceInput,
  type MaterialBookSourceAttachmentResult,
  type MaterialBookSourceVersionProjection,
} from '../../../../src/services/book-source-delivery/materialBookSourceAttachment.service.ts';
import type { SourceSetCandidate } from '../../../../src/types/bookAssembly.types.ts';
import {
  FirebaseRtdbRestClient,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import { BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH } from '../book-assembly/book-source-authority-reader.ts';
import { readTrustedBookSourceProjection } from './trusted-source-contract.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const ACCOUNT_ID = /^[A-Za-z0-9_:@-]{1,256}$/u;
const MAX_RETRIES = 5;
const INVALID_CHECKSUM = Object.freeze({ algorithm: 'sha-256' as const, value: '0'.repeat(64) });

const clone = <T>(value: T): T => structuredClone(value);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
};

const assertId = (value: string, code: string): string => {
  if (!ID.test(value)) throw new Error(code);
  return value;
};

const assertAccountId = (value: string): string => {
  if (!ACCOUNT_ID.test(value)) throw new Error('invalid_book_source_upload_account_id');
  return value;
};

export interface FirebaseMaterialBookSourceAttachmentRepositoryOptions {
  readonly env: RepositoryEnv;
  readonly accountId: string;
  readonly fetchImpl?: typeof fetch;
  /** Trusted server credential; never supplied by the browser completion body. */
  readonly getAccessToken: () => Promise<string>;
  readonly firebaseAuthToken?: boolean;
  readonly getFirebaseAuthToken?: (request?: { readonly path?: string; readonly query?: unknown }) => Promise<string>;
  readonly maxRetries?: number;
}

export interface FirebaseMaterialBookSourceAttachmentRepository
  extends MaterialBookSourceAttachmentRepository {
  /** Reads only the canonical Material Book row for completion orchestration. */
  readonly readBook: (bookId: string) => Promise<MaterialBookSourceAttachmentBook | null>;
}

type SourceProjection = MaterialBookSourceVersionProjection;

const bookPath = (bookId: string): string => `material_catalog/books/${assertId(bookId, 'invalid_material_book_id')}`;

const sourceProjection = (
  accountId: string,
  bookId: string,
  sourceVersionId: string,
): string => BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(
  assertAccountId(accountId),
  assertId(bookId, 'invalid_material_book_id'),
  assertId(sourceVersionId, 'invalid_material_book_source_version_id'),
);

const sourceSetSources = (sourceSet: SourceSetCandidate): readonly {
  readonly sourceKey: string;
  readonly sourceVersionId: string;
}[] => sourceSet.sources;

const unverifiedProjection = (
  sourceKey: string,
  bookId: string,
  sourceVersionId: string,
  physicalPageCount: unknown,
): SourceProjection => ({
  sourceKey,
  sourceVersionId,
  bookId,
  checksum: INVALID_CHECKSUM,
  purpose: 'book-source',
  studentSafeStatus: 'unreviewed',
  physicalPageCount: Number.isSafeInteger(physicalPageCount) ? physicalPageCount as number : 0,
  verifiedUsable: false,
});

/**
 * Reads the source leaves selected by the transaction input. The raw row is
 * retained when it is malformed or owned by another account/book so the pure
 * attachment service returns a conflict rather than accidentally accepting a
 * forged provider-bearing projection.
 */
const readSourceVersionProjections = async (
  rtdb: FirebaseRtdbRestClient,
  accountId: string,
  bookId: string,
  sourceSet: SourceSetCandidate,
  ownerId: string | undefined,
): Promise<Readonly<Record<string, SourceProjection>>> => {
  const entries = await Promise.all(sourceSetSources(sourceSet).map(async (source) => {
    const raw = await rtdb.readValue(sourceProjection(accountId, bookId, source.sourceVersionId));
    const projection = readTrustedBookSourceProjection(raw, {
      ownerId,
      bookId,
      sourceKey: source.sourceKey,
      sourceVersionId: source.sourceVersionId,
      purpose: 'book-source',
    });
    if (!projection) {
      return [source.sourceVersionId, unverifiedProjection(
        source.sourceKey,
        bookId,
        source.sourceVersionId,
        isRecord(raw) ? raw.physicalPageCount : undefined,
      )] as const;
    }
    return [source.sourceVersionId, projection] as const;
  }));
  return Object.fromEntries(entries);
};

const scopeFor = async (
  rtdb: FirebaseRtdbRestClient,
  accountId: string,
  input: MaterialBookSourceAttachmentTransaction<unknown>,
  book: MaterialBookSourceAttachmentBook | null,
): Promise<MaterialBookSourceAttachmentScope> => ({
  book,
  sourceVersionProjections: await readSourceVersionProjections(
    rtdb,
    accountId,
    input.bookId,
    input.sourceSet,
    book?.ownerId,
  ),
  // The Book is the sole durable commit record. A retry after response loss
  // is recognized below from the already-attached source set; no extra RTDB
  // operation path is introduced (its rules are intentionally out of scope).
  operations: {},
});

export const createFirebaseMaterialBookSourceAttachmentRepository = (
  options: FirebaseMaterialBookSourceAttachmentRepositoryOptions,
): FirebaseMaterialBookSourceAttachmentRepository => {
  const accountId = assertAccountId(options.accountId.trim());
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) {
    throw new Error('invalid_material_book_source_attachment_retry_limit');
  }
  const rtdb = new FirebaseRtdbRestClient({
    env: options.env,
    fetchImpl,
    getAccessToken: options.getAccessToken,
    firebaseAuthToken: options.firebaseAuthToken,
    getFirebaseAuthToken: options.getFirebaseAuthToken,
  });

  const readBook = async (bookId: string): Promise<MaterialBookSourceAttachmentBook | null> => {
    const value = await rtdb.readValue(bookPath(bookId));
    return isRecord(value) ? value as unknown as MaterialBookSourceAttachmentBook : null;
  };

  return {
    readBook,
    async transaction<T>(input: MaterialBookSourceAttachmentTransaction<T>): Promise<T> {
      assertId(input.bookId, 'invalid_material_book_id');
      assertId(input.operationId, 'invalid_material_book_source_attachment_operation_id');
      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        const path = bookPath(input.bookId);
        const current = await rtdb.readWithEtag<MaterialBookSourceAttachmentBook | null>(path);
        const retained = current.data?.setupActivations?.find(
          (receipt) => receipt.operationId === input.operationId,
        );
        if (retained) {
          const replay = input.mutate({
            book: current.data,
            sourceVersionProjections: {},
            operations: { [input.operationId]: {
              operationId: retained.operationId,
              ownerId: retained.ownerId,
              bookId: retained.bookId,
              fingerprint: retained.inputFingerprint,
              status: 'replaced',
              bookRevision: retained.bookRevision,
              sourceSetRevision: retained.sourceSetRevision,
              sourceSet: clone(retained.sourceSet),
            } },
          });
          if (!replay.write) return replay.outcome;
          throw new Error('material_book_source_attachment_replay_attempted_write');
        }
        const scope = await scopeFor(
          rtdb,
          accountId,
          input as MaterialBookSourceAttachmentTransaction<unknown>,
          current.data,
        );
        let effectiveScope = scope;
        if (current.data?.sourceSet
          && stable(current.data.sourceSet) === stable(input.sourceSet)
          && current.data.status === 'ready'
          && current.data.bookRevision === input.expectedBookRevision
          && current.data.sourceSetRevision === input.expectedSourceSetRevision
          && Object.values(scope.sourceVersionProjections).every((projection) => projection.verifiedUsable === true)) {
          const receipt: MaterialBookSourceAttachmentOperationReceipt = {
            operationId: input.operationId, ownerId: current.data.ownerId, bookId: input.bookId,
            fingerprint: input.operationFingerprint, status: 'replaced',
            bookRevision: input.expectedBookRevision, sourceSetRevision: input.expectedSourceSetRevision,
            sourceSet: clone(input.sourceSet),
          };
          effectiveScope = { ...scope, operations: { [input.operationId]: receipt } };
        }
        const mutation = input.mutate(effectiveScope);
        if (!mutation.write) return mutation.outcome;
        const nextBook = mutation.next?.book;
        if (!nextBook) {
          throw new Error('material_book_source_attachment_mutation_incomplete');
        }
        if (!await rtdb.writeIfMatch(path, clone(nextBook), current.etag)) continue;
        return mutation.outcome;
      }
      throw new Error('material_book_source_attachment_transaction_contention');
    },
  };
};

export interface AttachVerifiedSourceSetInput {
  readonly ownerId: string;
  readonly bookId: string;
  readonly operationId: string;
  readonly expectedBookRevision: number;
  readonly expectedSourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
}

export const attachVerifiedSourceSet = async (
  attachmentService: ReturnType<typeof createMaterialBookSourceAttachmentService>,
  input: AttachVerifiedSourceSetInput,
): Promise<MaterialBookSourceAttachmentResult> => {
  const attachment: AttachMaterialBookSourceInput = {
    ownerId: input.ownerId,
    bookId: input.bookId,
    operationId: assertId(input.operationId, 'invalid_material_book_source_attachment_operation_id'),
    expectedBookRevision: input.expectedBookRevision,
    expectedSourceSetRevision: input.expectedSourceSetRevision,
    sourceSet: input.sourceSet,
  };
  const result = await attachmentService.attach(attachment);
  if (result.status === 'conflict' || result.status === 'forbidden' || result.status === 'invalid') {
    throw new Error(`material_book_source_attachment_${(result.reason ?? result.status).replaceAll('-', '_')}`);
  }
  return result;
};

export interface AttachVerifiedFullPdfSourceInput {
  readonly ownerId: string;
  readonly bookId: string;
  readonly operationId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
}

/** Explicit full-PDF attachment helper; completion never calls it. */
export const attachVerifiedFullPdfSource = async (
  attachmentService: ReturnType<typeof createMaterialBookSourceAttachmentService>,
  repository: FirebaseMaterialBookSourceAttachmentRepository,
  input: AttachVerifiedFullPdfSourceInput,
): Promise<MaterialBookSourceAttachmentResult> => {
  const book = await repository.readBook(input.bookId);
  if (!book || book.bookId !== input.bookId || book.ownerId !== input.ownerId) {
    throw new Error('material_book_source_attachment_authority_denied');
  }
  const expectedBookRevision = book.bookRevision;
  const expectedSourceSetRevision = book.sourceSetRevision;
  if (!Number.isSafeInteger(expectedBookRevision)
    || expectedBookRevision < 0
    || !Number.isSafeInteger(expectedSourceSetRevision)
    || expectedSourceSetRevision < 0) {
    throw new Error('material_book_source_attachment_revision_unavailable');
  }
  return attachVerifiedSourceSet(attachmentService, {
    ownerId: input.ownerId,
    bookId: input.bookId,
    operationId: input.operationId,
    expectedBookRevision,
    expectedSourceSetRevision,
    sourceSet: {
      sourceStrategy: 'full_pdf',
      sources: [{
        sourceKey: assertId(input.sourceKey, 'invalid_material_book_source_key'),
        sourceVersionId: assertId(input.sourceVersionId, 'invalid_material_book_source_version_id'),
        sourceOrder: 1,
      }],
    },
  });
};
