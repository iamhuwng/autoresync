/**
 * Server-owned identity bridge between a logical Unit slot and its exact
 * Activity / Activity-candidate / published-version identities.  It stores
 * references only; Activity content remains in Activity Authoring and the
 * canonical Activity Version store.
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
  readonly activityVersionId?: string;
  readonly activityVersion?: number;
}

export type UnitActivityBindingWriteStatus = 'created' | 'updated' | 'replayed' | 'conflict' | 'stale';

export interface UnitActivityBindingRepository {
  read(key: UnitActivityBindingKey): Promise<UnitActivityBinding | null>;
  bindCandidate(binding: UnitActivityBinding): Promise<UnitActivityBindingWriteStatus>;
  recordPublication(input: UnitActivityBindingKey & {
    readonly activityId: string;
    readonly candidateId: string;
    readonly candidateRevision: number;
    readonly activityVersionId: string;
    readonly activityVersion: number;
  }): Promise<UnitActivityBindingWriteStatus>;
}
