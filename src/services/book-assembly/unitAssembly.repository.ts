import type { CreateAssemblyCandidateInput, ReplaceAssemblyCandidateInput } from './assemblyClient.browser';
import type { AssemblyCandidateCommandPort } from './unitPublish.service';
import type {
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from './unitAssembly.types';

export interface LoadedCurrentAssemblyDraft {
  readonly candidate: BookAssemblyCandidateRecord;
  readonly savedActivityKeysByUnit: Readonly<Record<string, readonly string[]>>;
}

export interface UnitAssemblyRepository {
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
    candidate: BookAssemblyCandidateRecord;
    conflict: Record<string, unknown> | null;
  }>;
  loadCurrent?(bookId: string, unitKey: string): Promise<LoadedCurrentAssemblyDraft | null>;
}

export const createUnitAssemblyRepository = (
  commands: AssemblyCandidateCommandPort & {
    readonly loadCurrent?: (bookId: string, unitKey: string) => Promise<LoadedCurrentAssemblyDraft | null>;
  },
): UnitAssemblyRepository => Object.freeze({
  create: (input) => commands.create(input),
  replace: (input) => commands.replace(input),
  validate: (input) => commands.validate(input),
  discard: (input) => commands.discard(input),
  load: (bookId, unitKey, candidateId) => commands.load(bookId, unitKey, candidateId),
  loadCurrent: commands.loadCurrent
    ? (bookId, unitKey) => commands.loadCurrent!(bookId, unitKey)
    : undefined,
});
