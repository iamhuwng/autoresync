/**
 * Server-owned authoring head for a logical Unit slot and its stable Activity
 * identity. Activity content and published versions live in their own stores.
 */
export interface UnitActivityBindingKey {
  readonly ownerId: string;
  readonly bookId: string;
  readonly unitKey: string;
  readonly activityKey: string;
}

export interface UnitActivityBinding extends UnitActivityBindingKey {
  readonly schemaVersion: 1;
  readonly activityId: string;
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly candidateLifecycle: 'staged' | 'validated' | 'saved';
}

export type UnitActivityBindingWriteStatus = 'created' | 'updated' | 'replayed' | 'conflict' | 'stale';

export interface UnitActivityBindingRepository {
  read(key: UnitActivityBindingKey): Promise<UnitActivityBinding | null>;
  bindCandidate(binding: UnitActivityBinding): Promise<UnitActivityBindingWriteStatus>;
}
