import type {
  BookAssemblyManifestCandidate,
  BookAssemblyValidationResult,
  BookSourceVersionAuthority,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';

export const BOOK_ASSEMBLY_CANDIDATE_LIFECYCLES = [
  'draft',
  'validated',
  'discarded',
] as const;
export type BookAssemblyCandidateLifecycle =
  (typeof BOOK_ASSEMBLY_CANDIDATE_LIFECYCLES)[number];
export type BookAssemblyReceiptStatus = BookAssemblyMutationResult['status'];

export interface BookAssemblyBookAuthority {
  readonly bookId: string;
  readonly ownerId: string;
  readonly bookMode: 'pdf';
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly sourceSet: SourceSetCandidate;
  readonly sourceVersionAuthority: BookSourceVersionAuthority;
}

export interface BookAssemblyCandidateRecord {
  readonly candidateId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly unitKey: string;
  readonly revision: number;
  readonly lifecycle: BookAssemblyCandidateLifecycle;
  readonly manifest: BookAssemblyManifestCandidate | null;
  readonly validation: BookAssemblyValidationResult;
  readonly updatedAt: string;
  /** Trusted command metadata for a staged unpublished source-strategy migration. */
  readonly migration?: {
    readonly kind: 'source-strategy';
    readonly baseCandidateId: string;
    readonly fromSourceSetRevision: number;
    readonly targetSourceSetRevision: number;
  };
}

export interface BookAssemblyOperationReceipt {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly status: BookAssemblyReceiptStatus;
  readonly candidateId?: string;
  readonly candidateRevision?: number;
  readonly createdAt: string;
}

export interface BookAssemblyMutationResult {
  readonly status:
    | 'created'
    | 'replaced'
    | 'validated'
    | 'discarded'
    | 'loaded'
    | 'replayed'
    | 'conflict'
    | 'not-found'
    | 'forbidden'
    | 'invalid'
    | 'idempotency-conflict';
  readonly candidate?: BookAssemblyCandidateRecord;
  readonly currentRevision?: number;
  readonly currentBookRevision?: number;
  readonly currentSourceSetRevision?: number;
  readonly receipt: BookAssemblyOperationReceipt;
}
