import type { BookAssemblyManifestCandidate } from '../../types/bookAssembly.types';
import {
  type CreateAssemblyCandidateInput,
  type ReplaceAssemblyCandidateInput,
} from './assemblyClient.browser';
import type { BookAssemblyMutationResult } from './unitAssembly.types';
import {
  createSourceStrategySuccessorPublicationPlan,
  type CreateSourceStrategySuccessorPlanInput,
  type SourceStrategySuccessorPlan,
} from './sourceStrategySuccessor.service';

/**
 * Candidate-only command surface for 13A.
 *
 * Publication, delivery binding, and Mode 1 mutation deliberately do not
 * exist on this interface. Those commands belong to later trusted owners.
 */
export interface AssemblyCandidateCommandPort {
  create(input: CreateAssemblyCandidateInput): Promise<BookAssemblyMutationResult>;
  replace(input: ReplaceAssemblyCandidateInput): Promise<BookAssemblyMutationResult>;
  validate(input: {
    readonly operationId: string;
    readonly bookId: string;
    readonly unitKey: string;
    readonly candidateId: string;
    readonly expectedCandidateRevision: number;
  }): Promise<BookAssemblyMutationResult>;
  discard(input: {
    readonly operationId: string;
    readonly bookId: string;
    readonly unitKey: string;
    readonly candidateId: string;
    readonly expectedCandidateRevision: number;
  }): Promise<BookAssemblyMutationResult>;
  load(bookId: string, unitKey: string, candidateId: string): Promise<{
    status: 'loaded';
    candidate: import('./unitAssembly.types').BookAssemblyCandidateRecord;
    conflict: Record<string, unknown> | null;
  }>;
}

export interface UnitPublishCandidateOnly {
  readonly candidate: AssemblyCandidateCommandPort;
  readonly publish: never;
  readonly publishActivity: never;
  readonly createDeliveryBinding: never;
}

export const createUnitPublishCandidateOnly = (
  candidate: AssemblyCandidateCommandPort,
): UnitPublishCandidateOnly => Object.freeze({
  candidate,
  publish: undefined as never,
  publishActivity: undefined as never,
  createDeliveryBinding: undefined as never,
});

/**
 * Published successor seam for Ticket 20C.
 *
 * This remains separate from the candidate-only command surface above. It
 * creates a strategy-successor plan for the trusted common publication
 * transaction; it does not expose candidate publication or delivery-binding
 * commands.
 */
export interface PublishedSourceStrategySuccessorAdapter {
  createPlan(input: CreateSourceStrategySuccessorPlanInput): SourceStrategySuccessorPlan;
}

export const createPublishedSourceStrategySuccessorAdapter = (): PublishedSourceStrategySuccessorAdapter => ({
  createPlan: createSourceStrategySuccessorPublicationPlan,
});

export const assertCandidateBookBinding = (
  manifest: BookAssemblyManifestCandidate,
  bookId: string,
): void => {
  if (manifest.bookId !== bookId) throw new Error('candidate_book_binding_mismatch');
};
