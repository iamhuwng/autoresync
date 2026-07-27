import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyPublicationAuditRecord,
  BookAssemblyPublicationPointer,
} from '../../types/bookAssembly.types';

export interface BookAssemblyPublicationOperationRecord<Result> {
  readonly ownerId: string;
  readonly fingerprint: string;
  readonly result: Result;
  readonly createdAt: string;
}

export interface BookAssemblyPublicationScope<Result = unknown> {
  readonly versions?: Record<string, BookAssemblyImmutableManifestVersion>;
  readonly current?: BookAssemblyPublicationPointer;
  readonly operations?: Record<string, BookAssemblyPublicationOperationRecord<Result>>;
  readonly audits?: Record<string, BookAssemblyPublicationAuditRecord>;
}

export interface BookAssemblyPublicationRepository<Result = unknown> {
  transaction<T>(
    bookId: string,
    mutate: (current: BookAssemblyPublicationScope<Result>) => {
      readonly outcome: T;
      readonly next?: BookAssemblyPublicationScope<Result>;
      readonly write: boolean;
    },
  ): Promise<T>;
  readScope(bookId: string): Promise<BookAssemblyPublicationScope<Result>>;
}

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryBookAssemblyPublicationRepository<Result = unknown>
implements BookAssemblyPublicationRepository<Result> {
  private scopes = new Map<string, BookAssemblyPublicationScope<Result>>();

  constructor(initial?: Record<string, BookAssemblyPublicationScope<Result>>) {
    for (const [bookId, scope] of Object.entries(initial ?? {})) {
      this.scopes.set(bookId, clone(scope));
    }
  }

  async readScope(bookId: string): Promise<BookAssemblyPublicationScope<Result>> {
    return clone(this.scopes.get(bookId) ?? {});
  }

  async transaction<T>(
    bookId: string,
    mutate: (current: BookAssemblyPublicationScope<Result>) => {
      readonly outcome: T;
      readonly next?: BookAssemblyPublicationScope<Result>;
      readonly write: boolean;
    },
  ): Promise<T> {
    const current = clone(this.scopes.get(bookId) ?? {});
    const result = mutate(current);
    if (result.write) this.scopes.set(bookId, clone(result.next ?? current));
    return result.outcome;
  }
}
