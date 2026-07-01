# PRD-0055 Task 5 Backend Authority Foundation Implementation Plan

> Status, 2026-06-29: historical execution plan superseded by later Task 5 Batch D and Batch E corrections. The old Step 3/Step 4 unchecked boxes, `database.rules.json:649:28` emulator failure, and concurrent frontend timeout are historical proof-risk notes only. Current authority surfaces record Task 5.1-5.23 and parent Task 5.0 local acceptance, Task 5.9 reclosed after executable RTDB emulator proof, Task 5.16-5.19 local Batch D completion, and Task 5.20-5.23 Batch E browser/a11y, internal-fixture rollout, final independent verification, and parent acceptance proof. Do not check this historical plan as current work; use the live taskbox, traceability, findings, implementation log, and architecture docs instead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the trusted Listening authoring backend, RTDB rules, and DR proof required before Task 5 Save draft/Publish UI or rollout can be trusted.

**Architecture:** Move Task 5 authority into Firebase Functions under `functions/src/listening-authoring/**`, with server-derived owner identity, HMAC idempotency, canonical request hashing, and transaction-backed writes to PRD-0057 B2 paths. Add RTDB read/deny rules for `listening_authoring/**`, prove browser writes are denied, and extend backup/restore proof for drafts, versions, revision drafts, and operation evidence.

**Tech Stack:** TypeScript, Firebase Functions v4, Firebase Admin RTDB transactions, Firebase RTDB security rules, Vitest, `@firebase/rules-unit-testing`, r2-backup-worker Vitest suite.

---

## Execution Boundaries

This plan covers backend authority foundation only. It does not wire `ListeningTestBuilder.tsx`, browser facade calls, live browser QA, selected-teacher rollout, Task 6, private delivery, solo/homework runtime, live runtime, `AudioPlayer.tsx`, Reading V2 internals, Google Drive behavior, deploy, remote mutation, staging, commit, push, or cleanup.

User instructions override the superpowers default commit cadence. Do not run `git add`, `git commit`, `git push`, deploy commands, cleanup commands, or remote mutation commands while executing this plan.

Before execution, re-run:

```powershell
rtk git status --short --branch
rtk git status --short --untracked-files=all
rtk git rev-parse HEAD
rtk git worktree list --porcelain
```

Expected: same linked worktree, dirty state preserved, no staged paths unless user separately created them.

## File Structure

Create:

- `functions/src/listening-authoring/constants.ts` - PRD-0057 B2 path constants, operation names, schema version, TTL, and environment flag names.
- `functions/src/listening-authoring/contracts.ts` - backend request, record, result, auth context, and repository types. No browser request type may contain `ownerId`.
- `functions/src/listening-authoring/canonical.ts` - stable JSON, SHA-256 request hash, and HMAC-SHA-256 idempotency hash helpers.
- `functions/src/listening-authoring/validation.ts` - request parsers and record validators for Save draft, Publish, and lifecycle mutation.
- `functions/src/listening-authoring/repository.ts` - Firebase RTDB adapter plus transaction interfaces used by service tests.
- `functions/src/listening-authoring/service.ts` - trusted mutation logic for Save draft, Publish, lifecycle operations, and legacy freeze.
- `functions/src/listening-authoring/http.ts` - HTTPS wrappers, auth extraction, CORS, method handling, kill switch, and response mapping.
- `functions/src/listening-authoring/index.ts` - local exports.
- `functions/src/listening-authoring/*.test.ts` - focused unit tests for contracts, validation, idempotency, transactions, and handlers.
- `src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts` - RTDB rules/index and emulator denial proof.

Modify:

- `functions/src/index.ts` - export `saveListeningDraft`, `publishListeningDraft`, and `mutateListeningAuthoringLifecycle`.
- `database.rules.json` - add `listening_authoring/**` read/deny rules and indexes; update root write freeze.
- `r2-backup-worker/src/backup/data-backup.test.ts` - prove `listening_authoring` is included in RTDB backup.
- `r2-backup-worker/src/restore/restore-execute.ts` - add `listening_authoring` to known restore order before legacy `tests`.
- `r2-backup-worker/src/restore/restore-execute.test.ts` - prove restore preserves authoring IDs, conflict tokens, hashes, archive metadata, and operation evidence.
- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - update only after proof passes or append BLOCKED truth if proof fails.
- `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - reconcile evidence rows after proof.
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md` - append current-state findings.
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md` - append implementation packet and verification.
- `documentation/architecture/upload-storage-authority.md` - update current-state authority text.

---

### Task 1: Backend Contracts, Canonical Hashing, And Operation Names

**Files:**
- Create: `functions/src/listening-authoring/constants.ts`
- Create: `functions/src/listening-authoring/contracts.ts`
- Create: `functions/src/listening-authoring/canonical.ts`
- Create: `functions/src/listening-authoring/validation.ts`
- Create: `functions/src/listening-authoring/listeningAuthoringContract.test.ts`

- [ ] **Step 1: Write failing contract/hash tests**

Create `functions/src/listening-authoring/listeningAuthoringContract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME,
  LISTENING_AUTHORING_OPERATION_TTL_MS,
  LISTENING_AUTHORING_PATHS,
  LISTENING_AUTHORING_SCHEMA_VERSION,
  LISTENING_AUTHORING_WRITE_KILL_SWITCH,
  LISTENING_AUTHORING_OPERATION_TYPES,
} from './constants';
import {
  canonicalJson,
  hmacSha256Hex,
  requestHash,
} from './canonical';
import {
  parseLifecycleRequest,
  parsePublishDraftRequest,
  parseSaveDraftRequest,
} from './validation';

describe('Listening authoring B2 backend contract', () => {
  it('uses exact PRD-0057 B2 paths, operation names, and 30-day operation TTL', () => {
    expect(LISTENING_AUTHORING_SCHEMA_VERSION).toBe(1);
    expect(LISTENING_AUTHORING_PATHS).toEqual({
      drafts: 'listening_authoring/drafts',
      revisionDrafts: 'listening_authoring/revision_drafts',
      versions: 'listening_authoring/versions',
      operations: 'listening_authoring/operations',
    });
    expect(LISTENING_AUTHORING_OPERATION_TYPES).toEqual([
      'save-draft',
      'publish',
      'soft-delete',
      'restore',
      'archive',
      'discard',
      'legacy-first-edit',
    ]);
    expect(LISTENING_AUTHORING_OPERATION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME).toBe('LISTENING_AUTHORING_IDEMPOTENCY_SECRET');
    expect(LISTENING_AUTHORING_WRITE_KILL_SWITCH).toBe('LISTENING_AUTHORING_WRITES_DISABLED');
  });

  it('canonicalizes request bodies and creates stable request hashes', () => {
    expect(canonicalJson({ b: 2, a: 1, omitted: undefined })).toBe('{"a":1,"b":2}');
    expect(canonicalJson({ nested: { z: null, a: ['x', 'y'] } }))
      .toBe('{"nested":{"a":["x","y"],"z":null}}');
    expect(requestHash({ b: 2, a: 1 })).toBe('43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
  });

  it('uses server HMAC-SHA-256 for idempotency key hashes', () => {
    expect(hmacSha256Hex('secret', 'payload')).toBe('b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4');
  });

  it('rejects browser-supplied ownerId from all mutation requests', () => {
    expect(() => parseSaveDraftRequest({
      ownerId: 'teacher-2',
      idempotencyKey: 'idem-1',
      document: { title: 'Bad' },
    })).toThrow('ownerId is server-derived');
    expect(() => parsePublishDraftRequest({
      ownerId: 'teacher-2',
      draftId: 'draft-1',
      expectedConflictToken: 1,
      idempotencyKey: 'idem-2',
    })).toThrow('ownerId is server-derived');
    expect(() => parseLifecycleRequest({
      ownerId: 'teacher-2',
      operation: 'archive',
      targetId: 'version-1',
      idempotencyKey: 'idem-3',
    })).toThrow('ownerId is server-derived');
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/listeningAuthoringContract.test.ts
```

Expected: FAIL because `./constants`, `./canonical`, and `./validation` do not exist.

- [ ] **Step 3: Add minimal contract/hash implementation**

Create `functions/src/listening-authoring/constants.ts`:

```ts
export const LISTENING_AUTHORING_SCHEMA_VERSION = 1;

export const LISTENING_AUTHORING_PATHS = {
  drafts: 'listening_authoring/drafts',
  revisionDrafts: 'listening_authoring/revision_drafts',
  versions: 'listening_authoring/versions',
  operations: 'listening_authoring/operations',
} as const;

export const LISTENING_AUTHORING_OPERATION_TYPES = [
  'save-draft',
  'publish',
  'soft-delete',
  'restore',
  'archive',
  'discard',
  'legacy-first-edit',
] as const;

export const LISTENING_AUTHORING_OPERATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME = 'LISTENING_AUTHORING_IDEMPOTENCY_SECRET';
export const LISTENING_AUTHORING_WRITE_KILL_SWITCH = 'LISTENING_AUTHORING_WRITES_DISABLED';
```

Create `functions/src/listening-authoring/canonical.ts`:

```ts
import { createHash, createHmac } from 'crypto';

const sortValue = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }
  return value;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(sortValue(value));

export const requestHash = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value)).digest('hex');

export const hmacSha256Hex = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('hex');
```

Create `functions/src/listening-authoring/contracts.ts` with request types that omit `ownerId`:

```ts
import type { LISTENING_AUTHORING_OPERATION_TYPES } from './constants';

export type ListeningAuthoringOperationType = typeof LISTENING_AUTHORING_OPERATION_TYPES[number];

export interface ListeningAuthoringAuthContext {
  uid: string;
  role: 'teacher' | 'super_admin';
}

export interface ListeningAuthoringDocumentV1 {
  title: string;
  type: string;
  skill: 'Listening';
  duration: number;
  displayMode: string;
  metadata: Record<string, unknown>;
  audioSections: readonly Record<string, unknown>[];
  questions: readonly Record<string, unknown>[];
  settings: Record<string, unknown>;
}

export interface SaveListeningDraftRequest {
  idempotencyKey: string;
  document: ListeningAuthoringDocumentV1;
  draftId?: string;
  expectedConflictToken?: number;
  trigger?: 'explicit' | 'autosave';
}

export interface PublishListeningDraftRequest {
  draftId: string;
  expectedConflictToken: number;
  idempotencyKey: string;
  retainedPins?: Record<string, readonly string[]>;
}

export interface ListeningLifecycleRequest {
  operation: Extract<ListeningAuthoringOperationType, 'soft-delete' | 'restore' | 'archive' | 'discard'>;
  targetId: string;
  expectedConflictToken?: number;
  idempotencyKey: string;
  reasonCode?: string;
}

export interface ListeningAuthoringOperationRecord<T = unknown> {
  schemaVersion: 1;
  operationId: string;
  ownerId: string;
  operationType: ListeningAuthoringOperationType;
  targetId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  status: 'pending' | 'succeeded' | 'failed';
  result?: T;
  errorCode?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}
```

Create `functions/src/listening-authoring/validation.ts`:

```ts
import type {
  ListeningLifecycleRequest,
  PublishListeningDraftRequest,
  SaveListeningDraftRequest,
} from './contracts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const rejectOwnerId = (body: Record<string, unknown>): void => {
  if ('ownerId' in body) {
    throw new Error('ownerId is server-derived');
  }
};

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
};

const optionalNumber = (value: unknown, field: string): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return Number(value);
};

export const parseSaveDraftRequest = (body: unknown): SaveListeningDraftRequest => {
  if (!isRecord(body)) throw new Error('Save draft body must be an object');
  rejectOwnerId(body);
  const document = body.document;
  if (!isRecord(document)) throw new Error('document is required');
  return {
    idempotencyKey: requiredString(body.idempotencyKey, 'idempotencyKey'),
    document: document as SaveListeningDraftRequest['document'],
    draftId: body.draftId === undefined ? undefined : requiredString(body.draftId, 'draftId'),
    expectedConflictToken: optionalNumber(body.expectedConflictToken, 'expectedConflictToken'),
    trigger: body.trigger === 'autosave' ? 'autosave' : 'explicit',
  };
};

export const parsePublishDraftRequest = (body: unknown): PublishListeningDraftRequest => {
  if (!isRecord(body)) throw new Error('Publish body must be an object');
  rejectOwnerId(body);
  const expectedConflictToken = optionalNumber(body.expectedConflictToken, 'expectedConflictToken');
  if (expectedConflictToken === undefined) throw new Error('expectedConflictToken is required');
  return {
    draftId: requiredString(body.draftId, 'draftId'),
    expectedConflictToken,
    idempotencyKey: requiredString(body.idempotencyKey, 'idempotencyKey'),
    retainedPins: isRecord(body.retainedPins) ? body.retainedPins as Record<string, readonly string[]> : undefined,
  };
};

export const parseLifecycleRequest = (body: unknown): ListeningLifecycleRequest => {
  if (!isRecord(body)) throw new Error('Lifecycle body must be an object');
  rejectOwnerId(body);
  const operation = requiredString(body.operation, 'operation');
  if (!['soft-delete', 'restore', 'archive', 'discard'].includes(operation)) {
    throw new Error('operation is unsupported');
  }
  return {
    operation: operation as ListeningLifecycleRequest['operation'],
    targetId: requiredString(body.targetId, 'targetId'),
    expectedConflictToken: optionalNumber(body.expectedConflictToken, 'expectedConflictToken'),
    idempotencyKey: requiredString(body.idempotencyKey, 'idempotencyKey'),
    reasonCode: body.reasonCode === undefined ? undefined : requiredString(body.reasonCode, 'reasonCode'),
  };
};
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/listeningAuthoringContract.test.ts
rtk npm --prefix functions run build
```

Expected: both PASS.

---

### Task 2: Transactional Repository Boundary

**Files:**
- Create: `functions/src/listening-authoring/repository.ts`
- Create: `functions/src/listening-authoring/repository.test.ts`

- [ ] **Step 1: Write failing repository transaction tests**

Create `functions/src/listening-authoring/repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createInMemoryListeningAuthoringRepository } from './repository';

const now = 1_700_000_000_000;

describe('Listening authoring repository transaction boundary', () => {
  it('claims an operation before draft mutation and rejects changed request hash', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now });

    const first = await repo.claimOperation({
      ownerId: 'teacher-1',
      operationType: 'save-draft',
      targetId: 'draft-1',
      idempotencyKeyHash: 'hash-1',
      requestHash: 'request-1',
      operationId: 'op-1',
    });
    const retry = await repo.claimOperation({
      ownerId: 'teacher-1',
      operationType: 'save-draft',
      targetId: 'draft-1',
      idempotencyKeyHash: 'hash-1',
      requestHash: 'request-1',
      operationId: 'op-2',
    });
    const conflict = await repo.claimOperation({
      ownerId: 'teacher-1',
      operationType: 'save-draft',
      targetId: 'draft-1',
      idempotencyKeyHash: 'hash-1',
      requestHash: 'request-2',
      operationId: 'op-3',
    });

    expect(first.kind).toBe('claimed');
    expect(retry.kind).toBe('existing');
    expect(conflict.kind).toBe('conflict');
    expect(repo.events()).toEqual(['claim:op-1']);
  });

  it('serializes draft conflict-token updates inside one transaction', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now });
    await repo.writeDraft({
      schemaVersion: 1,
      draftId: 'draft-1',
      ownerId: 'teacher-1',
      testId: 'test-1',
      path: 'listening_authoring/drafts',
      recordType: 'draft',
      state: 'draft',
      conflictToken: 2,
      document: { title: 'A' },
      createdAt: now,
      updatedAt: now,
    });

    await expect(repo.updateDraftTransaction('draft-1', 1, draft => ({
      ...draft,
      conflictToken: draft.conflictToken + 1,
      document: { title: 'stale write' },
    }))).resolves.toEqual({ kind: 'conflict', currentConflictToken: 2 });

    await expect(repo.updateDraftTransaction('draft-1', 2, draft => ({
      ...draft,
      conflictToken: draft.conflictToken + 1,
      document: { title: 'accepted write' },
    }))).resolves.toEqual({ kind: 'updated', conflictToken: 3 });

    expect((await repo.getDraft('draft-1'))?.document).toEqual({ title: 'accepted write' });
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/repository.test.ts
```

Expected: FAIL because `./repository` does not exist.

- [ ] **Step 3: Add repository interfaces, in-memory harness, and Firebase adapter shape**

Create `functions/src/listening-authoring/repository.ts` with these exports:

```ts
import * as admin from 'firebase-admin';

import { LISTENING_AUTHORING_OPERATION_TTL_MS, LISTENING_AUTHORING_PATHS } from './constants';
import type {
  ListeningAuthoringOperationRecord,
  ListeningAuthoringOperationType,
} from './contracts';

export interface ListeningDraftRecord {
  schemaVersion: 1;
  draftId: string;
  ownerId: string;
  testId: string;
  path: 'listening_authoring/drafts' | 'listening_authoring/revision_drafts';
  recordType: 'draft' | 'revision-draft';
  state: 'draft' | 'published' | 'archived' | 'soft-deleted';
  conflictToken: number;
  document: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  latestPublishedVersionId?: string;
  softDelete?: Record<string, unknown>;
}

export interface ListeningPublishedVersionRecord {
  schemaVersion: 1;
  versionId: string;
  draftId: string;
  ownerId: string;
  testId: string;
  state: 'published' | 'archived';
  versionNumber: number;
  sourceDraftPath: 'drafts' | 'revision_drafts' | 'legacy_tests';
  document: Record<string, unknown>;
  documentHash: string;
  retainedPins: Record<string, readonly string[]>;
  publishedAt: number;
  archiveMetadata?: Record<string, unknown>;
}

export type OperationClaim<T = unknown> =
  | { kind: 'claimed'; record: ListeningAuthoringOperationRecord<T> }
  | { kind: 'existing'; record: ListeningAuthoringOperationRecord<T> }
  | { kind: 'conflict'; record: ListeningAuthoringOperationRecord<T> };

export interface ClaimOperationInput {
  ownerId: string;
  operationType: ListeningAuthoringOperationType;
  targetId: string;
  idempotencyKeyHash: string;
  requestHash: string;
  operationId: string;
}

export interface ListeningAuthoringRepository {
  allocateId(prefix: 'draft' | 'version' | 'operation'): string;
  getDraft(draftId: string): Promise<ListeningDraftRecord | null>;
  writeDraft(record: ListeningDraftRecord): Promise<void>;
  updateDraftTransaction(
    draftId: string,
    expectedConflictToken: number,
    update: (draft: ListeningDraftRecord) => ListeningDraftRecord,
  ): Promise<{ kind: 'updated'; conflictToken: number } | { kind: 'conflict'; currentConflictToken: number } | { kind: 'missing' }>;
  claimOperation(input: ClaimOperationInput): Promise<OperationClaim>;
  completeOperation<T>(operationId: string, result: T): Promise<void>;
  createVersionTransaction(record: ListeningPublishedVersionRecord): Promise<{ kind: 'created' } | { kind: 'exists' }>;
  nextVersionNumberTransaction(testId: string): Promise<number>;
}
```

Add `createInMemoryListeningAuthoringRepository` below the interfaces. It must store drafts, operations, versions, and version counters in `Map` objects, push event labels such as `claim:op-1`, return deep clones, and set `expiresAt` to `now + LISTENING_AUTHORING_OPERATION_TTL_MS`.

Add `createFirebaseListeningAuthoringRepository(db: admin.database.Database): ListeningAuthoringRepository`. The adapter must:

- allocate IDs with `db.ref(path).push().key`
- store operations under `listening_authoring/operations/{operationId}`
- query existing operations by `ownerId`, `operationType`, `targetId`, and `idempotencyKeyHash`
- use `ref.transaction(...)` for draft updates and version counters
- never depend on client-visible rules for trusted service writes

- [ ] **Step 4: Run GREEN**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/repository.test.ts
rtk npm --prefix functions run build
```

Expected: both PASS.

---

### Task 3: Save Draft Service Authority

**Files:**
- Create: `functions/src/listening-authoring/saveDraft.service.test.ts`
- Modify: `functions/src/listening-authoring/service.ts`

- [ ] **Step 1: Write failing Save draft service tests**

Create `functions/src/listening-authoring/saveDraft.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { hmacSha256Hex, requestHash } from './canonical';
import { createInMemoryListeningAuthoringRepository } from './repository';
import { saveListeningDraftCore } from './service';

const auth = { uid: 'teacher-1', role: 'teacher' as const };
const now = 1_700_000_000_000;
const document = {
  title: 'Draft A',
  type: 'ielts',
  skill: 'Listening',
  duration: 1800,
  displayMode: 'standard',
  metadata: {},
  audioSections: [],
  questions: [],
  settings: {},
};

describe('saveListeningDraftCore', () => {
  it('creates a durable draft with auth-derived owner and no version write', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['draft-1', 'op-1'] });

    const result = await saveListeningDraftCore({
      auth,
      body: { idempotencyKey: 'idem-1', document },
      repo,
      idempotencySecret: 'secret',
      now,
    });

    expect(result).toEqual({
      status: 'saved',
      draftId: 'draft-1',
      conflictToken: 1,
      warnings: expect.any(Array),
      blockers: expect.any(Array),
    });
    expect((await repo.getDraft('draft-1'))?.ownerId).toBe('teacher-1');
    expect(repo.snapshot().versions).toEqual({});
    expect(repo.snapshot().operations['op-1']).toMatchObject({
      ownerId: 'teacher-1',
      operationType: 'save-draft',
      targetId: 'draft-1',
      idempotencyKeyHash: hmacSha256Hex('secret', 'teacher-1:save-draft:draft-1:idem-1'),
      requestHash: requestHash({ idempotencyKey: 'idem-1', document }),
      status: 'succeeded',
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });
  });

  it('returns same result for exact retry and rejects same key with changed payload', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['draft-1', 'op-1'] });

    const first = await saveListeningDraftCore({ auth, body: { idempotencyKey: 'idem-1', document }, repo, idempotencySecret: 'secret', now });
    const retry = await saveListeningDraftCore({ auth, body: { idempotencyKey: 'idem-1', document }, repo, idempotencySecret: 'secret', now: now + 1 });
    const conflict = await saveListeningDraftCore({
      auth,
      body: { idempotencyKey: 'idem-1', document: { ...document, title: 'Changed' } },
      repo,
      idempotencySecret: 'secret',
      now: now + 2,
    });

    expect(retry).toEqual(first);
    expect(conflict).toEqual({ status: 'idempotency-conflict', recoverable: false });
  });

  it('rejects stale expectedConflictToken without overwriting the current draft', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['draft-1', 'op-1', 'op-2'] });
    await saveListeningDraftCore({ auth, body: { idempotencyKey: 'first', document }, repo, idempotencySecret: 'secret', now });

    const result = await saveListeningDraftCore({
      auth,
      body: {
        idempotencyKey: 'stale',
        draftId: 'draft-1',
        expectedConflictToken: 0,
        document: { ...document, title: 'Stale' },
      },
      repo,
      idempotencySecret: 'secret',
      now: now + 1,
    });

    expect(result).toEqual({
      status: 'conflict',
      recoverable: true,
      draftId: 'draft-1',
      expectedConflictToken: 0,
      currentConflictToken: 1,
    });
    expect((await repo.getDraft('draft-1'))?.document.title).toBe('Draft A');
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/saveDraft.service.test.ts
```

Expected: FAIL because `saveListeningDraftCore` is not exported.

- [ ] **Step 3: Implement Save draft core**

Create `functions/src/listening-authoring/service.ts` with `saveListeningDraftCore`. Required behavior:

```ts
import { LISTENING_AUTHORING_SCHEMA_VERSION } from './constants';
import { hmacSha256Hex, requestHash } from './canonical';
import { parseSaveDraftRequest } from './validation';
import type { ListeningAuthoringAuthContext } from './contracts';
import type { ListeningAuthoringRepository } from './repository';

export interface ListeningAuthoringCoreInput {
  auth: ListeningAuthoringAuthContext;
  body: unknown;
  repo: ListeningAuthoringRepository;
  idempotencySecret: string;
  now: number;
}

const idempotencyHash = (input: {
  secret: string;
  ownerId: string;
  operationType: string;
  targetId: string;
  idempotencyKey: string;
}): string =>
  hmacSha256Hex(
    input.secret,
    `${input.ownerId}:${input.operationType}:${input.targetId}:${input.idempotencyKey}`,
  );

export const saveListeningDraftCore = async (input: ListeningAuthoringCoreInput) => {
  const request = parseSaveDraftRequest(input.body);
  const ownerId = input.auth.uid;
  const draftId = request.draftId ?? input.repo.allocateId('draft');
  const operationId = input.repo.allocateId('operation');
  const operationType = 'save-draft' as const;
  const bodyHash = requestHash(request);
  const keyHash = idempotencyHash({
    secret: input.idempotencySecret,
    ownerId,
    operationType,
    targetId: draftId,
    idempotencyKey: request.idempotencyKey,
  });
  const claim = await input.repo.claimOperation({
    ownerId,
    operationType,
    targetId: draftId,
    idempotencyKeyHash: keyHash,
    requestHash: bodyHash,
    operationId,
  });

  if (claim.kind === 'existing') return claim.record.result;
  if (claim.kind === 'conflict') return { status: 'idempotency-conflict', recoverable: false };

  const existing = await input.repo.getDraft(draftId);
  if (existing && request.expectedConflictToken !== existing.conflictToken) {
    const result = {
      status: 'conflict' as const,
      recoverable: true as const,
      draftId,
      expectedConflictToken: request.expectedConflictToken,
      currentConflictToken: existing.conflictToken,
    };
    await input.repo.completeOperation(operationId, result);
    return result;
  }

  if (existing) {
    const update = await input.repo.updateDraftTransaction(draftId, request.expectedConflictToken ?? existing.conflictToken, draft => ({
      ...draft,
      conflictToken: draft.conflictToken + 1,
      document: request.document as unknown as Record<string, unknown>,
      updatedAt: input.now,
    }));
    if (update.kind === 'conflict') {
      const result = {
        status: 'conflict' as const,
        recoverable: true as const,
        draftId,
        expectedConflictToken: request.expectedConflictToken,
        currentConflictToken: update.currentConflictToken,
      };
      await input.repo.completeOperation(operationId, result);
      return result;
    }
  } else {
    await input.repo.writeDraft({
      schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
      draftId,
      ownerId,
      testId: draftId,
      path: 'listening_authoring/drafts',
      recordType: 'draft',
      state: 'draft',
      conflictToken: 1,
      document: request.document as unknown as Record<string, unknown>,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  const saved = await input.repo.getDraft(draftId);
  const result = {
    status: 'saved' as const,
    draftId,
    conflictToken: saved?.conflictToken ?? 1,
    warnings: [] as const,
    blockers: [] as const,
  };
  await input.repo.completeOperation(operationId, result);
  return result;
};
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/listeningAuthoringContract.test.ts src/listening-authoring/repository.test.ts src/listening-authoring/saveDraft.service.test.ts
rtk npm --prefix functions run build
```

Expected: both PASS.

---

### Task 4: Publish And Immutable Version Authority

**Files:**
- Create: `functions/src/listening-authoring/publish.service.test.ts`
- Modify: `functions/src/listening-authoring/service.ts`
- Modify: `functions/src/listening-authoring/repository.ts`

- [ ] **Step 1: Write failing Publish tests**

Create `functions/src/listening-authoring/publish.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createInMemoryListeningAuthoringRepository } from './repository';
import { publishListeningDraftCore, saveListeningDraftCore } from './service';

const auth = { uid: 'teacher-1', role: 'teacher' as const };
const now = 1_700_000_000_000;
const completeDocument = {
  title: 'Ready',
  type: 'ielts',
  skill: 'Listening',
  duration: 1800,
  displayMode: 'standard',
  metadata: {},
  audioSections: [{ sectionNumber: 1, assetId: 'asset-1', uploadSessionId: 'session-1', checksum: 'sha256:asset-1' }],
  questions: [{ number: 1, answer: 'A' }],
  settings: {},
};

describe('publishListeningDraftCore', () => {
  it('creates one immutable version and advances the source draft token', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['draft-1', 'op-save', 'version-1', 'op-publish'] });
    await saveListeningDraftCore({ auth, body: { idempotencyKey: 'save', document: completeDocument }, repo, idempotencySecret: 'secret', now });

    const result = await publishListeningDraftCore({
      auth,
      body: { draftId: 'draft-1', expectedConflictToken: 1, idempotencyKey: 'publish' },
      repo,
      idempotencySecret: 'secret',
      now: now + 1,
    });

    expect(result).toEqual({
      status: 'published',
      draftId: 'draft-1',
      versionId: 'version-1',
      versionNumber: 1,
      conflictToken: 2,
      warnings: [],
    });
    expect(repo.snapshot().versions['version-1']).toMatchObject({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      versionNumber: 1,
      state: 'published',
      sourceDraftPath: 'drafts',
    });
    expect((await repo.getDraft('draft-1'))?.conflictToken).toBe(2);
  });

  it('returns same published version on exact idempotent retry', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['draft-1', 'op-save', 'version-1', 'op-publish'] });
    await saveListeningDraftCore({ auth, body: { idempotencyKey: 'save', document: completeDocument }, repo, idempotencySecret: 'secret', now });
    const first = await publishListeningDraftCore({ auth, body: { draftId: 'draft-1', expectedConflictToken: 1, idempotencyKey: 'publish' }, repo, idempotencySecret: 'secret', now: now + 1 });
    const retry = await publishListeningDraftCore({ auth, body: { draftId: 'draft-1', expectedConflictToken: 1, idempotencyKey: 'publish' }, repo, idempotencySecret: 'secret', now: now + 2 });

    expect(retry).toEqual(first);
    expect(Object.keys(repo.snapshot().versions)).toEqual(['version-1']);
  });

  it('blocks Publish when any audio section lacks canonical asset metadata', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['draft-1', 'op-save', 'op-publish'] });
    await saveListeningDraftCore({
      auth,
      body: {
        idempotencyKey: 'save',
        document: { ...completeDocument, audioSections: [{ sectionNumber: 1, audioUrl: 'https://example.test/temp/audio.mp3' }] },
      },
      repo,
      idempotencySecret: 'secret',
      now,
    });

    const result = await publishListeningDraftCore({
      auth,
      body: { draftId: 'draft-1', expectedConflictToken: 1, idempotencyKey: 'publish' },
      repo,
      idempotencySecret: 'secret',
      now: now + 1,
    });

    expect(result.status).toBe('blocked');
    expect(repo.snapshot().versions).toEqual({});
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/publish.service.test.ts
```

Expected: FAIL because `publishListeningDraftCore` is not exported.

- [ ] **Step 3: Implement Publish core**

Modify `functions/src/listening-authoring/service.ts`:

- Add `publishListeningDraftCore(input: ListeningAuthoringCoreInput)`.
- Parse with `parsePublishDraftRequest`.
- Load draft; require `draft.ownerId === auth.uid`.
- Reject stale `expectedConflictToken`.
- Validate every audio section has `assetId`, `uploadSessionId`, and `checksum`.
- Claim idempotency before creating version.
- Allocate `versionId` only after operation claim.
- Allocate version number through `repo.nextVersionNumberTransaction(testId)`.
- Write immutable version through `repo.createVersionTransaction(record)`.
- Update draft conflict token and `latestPublishedVersionId` in a draft transaction.
- Complete operation with published or blocked result.

Use this publish blocker helper:

```ts
const findPublishBlockers = (document: Record<string, unknown>) => {
  const audioSections = Array.isArray(document.audioSections) ? document.audioSections : [];
  return audioSections.flatMap((section, index) => {
    const record = section as Record<string, unknown>;
    return typeof record.assetId === 'string'
      && typeof record.uploadSessionId === 'string'
      && typeof record.checksum === 'string'
      ? []
      : [{
          field: `audioSections[${index}]`,
          severity: 'blocker' as const,
          guidance: 'Publish requires canonical assetId, uploadSessionId, and checksum for every audio section.',
        }];
  });
};
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
rtk npx vitest run --root functions "src/listening-authoring/*.test.ts"
rtk npm --prefix functions run build
```

Expected: both PASS.

---

### Task 5: Lifecycle Mutations And Legacy First-Edit Freeze

**Files:**
- Create: `functions/src/listening-authoring/lifecycle.service.test.ts`
- Modify: `functions/src/listening-authoring/service.ts`
- Modify: `functions/src/listening-authoring/repository.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `functions/src/listening-authoring/lifecycle.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createInMemoryListeningAuthoringRepository } from './repository';
import {
  mutateListeningAuthoringLifecycleCore,
  saveListeningDraftCore,
} from './service';

const auth = { uid: 'teacher-1', role: 'teacher' as const };
const now = 1_700_000_000_000;
const document = {
  title: 'Lifecycle',
  type: 'ielts',
  skill: 'Listening',
  duration: 1800,
  displayMode: 'standard',
  metadata: {},
  audioSections: [],
  questions: [],
  settings: {},
};

describe('mutateListeningAuthoringLifecycleCore', () => {
  it('soft-deletes and restores a draft through idempotent trusted operations', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['draft-1', 'op-save', 'op-delete', 'op-restore'] });
    await saveListeningDraftCore({ auth, body: { idempotencyKey: 'save', document }, repo, idempotencySecret: 'secret', now });

    const deleted = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: { operation: 'soft-delete', targetId: 'draft-1', expectedConflictToken: 1, idempotencyKey: 'delete', reasonCode: 'teacher-request' },
      repo,
      idempotencySecret: 'secret',
      now: now + 1,
    });
    const restored = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: { operation: 'restore', targetId: 'draft-1', expectedConflictToken: 2, idempotencyKey: 'restore' },
      repo,
      idempotencySecret: 'secret',
      now: now + 2,
    });

    expect(deleted).toEqual({ status: 'soft-deleted', draftId: 'draft-1', conflictToken: 2 });
    expect(restored).toEqual({ status: 'restored', draftId: 'draft-1', conflictToken: 3 });
    expect((await repo.getDraft('draft-1'))?.state).toBe('draft');
  });

  it('fails closed when another owner attempts lifecycle mutation', async () => {
    const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['draft-1', 'op-save', 'op-delete'] });
    await saveListeningDraftCore({ auth, body: { idempotencyKey: 'save', document }, repo, idempotencySecret: 'secret', now });

    await expect(mutateListeningAuthoringLifecycleCore({
      auth: { uid: 'teacher-2', role: 'teacher' },
      body: { operation: 'soft-delete', targetId: 'draft-1', expectedConflictToken: 1, idempotencyKey: 'delete' },
      repo,
      idempotencySecret: 'secret',
      now: now + 1,
    })).rejects.toThrow('draft_not_found');
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/lifecycle.service.test.ts
```

Expected: FAIL because `mutateListeningAuthoringLifecycleCore` is not exported.

- [ ] **Step 3: Implement lifecycle core**

Modify `functions/src/listening-authoring/service.ts`:

- Add `mutateListeningAuthoringLifecycleCore`.
- Support exact operation values: `soft-delete`, `restore`, `archive`, `discard`.
- Use auth-derived owner for every lookup.
- Claim idempotency before mutation.
- Soft-delete drafts by setting `state: 'soft-deleted'`, incrementing `conflictToken`, and writing `softDelete.deletedAt`, `deletedBy`, `reasonCode`, `priorConflictToken`, and `restoreCount`.
- Restore only non-expired soft-deleted drafts; increment `conflictToken` and `softDelete.restoreCount`.
- Archive versions as metadata-only; do not mutate immutable version fields.
- Discard drafts as metadata state only; actual asset cleanup remains out of this plan.
- Complete operation record for every succeeded or conflict result.

- [ ] **Step 4: Add legacy first-edit freeze tests and implementation in same service boundary**

Add one test case to `lifecycle.service.test.ts`:

```ts
it('freezes a legacy test as immutable version 1 before creating a revision draft', async () => {
  const repo = createInMemoryListeningAuthoringRepository({ now, ids: ['version-1', 'draft-1', 'op-freeze'] });

  const result = await mutateListeningAuthoringLifecycleCore({
    auth,
    body: {
      operation: 'legacy-first-edit',
      targetId: 'legacy-test-1',
      idempotencyKey: 'freeze',
      document,
    },
    repo,
    idempotencySecret: 'secret',
    now,
  });

  expect(result).toEqual({
    status: 'saved',
    versionId: 'version-1',
    draftId: 'draft-1',
    versionNumber: 1,
    conflictToken: 1,
  });
  expect(repo.snapshot().versions['version-1']).toMatchObject({
    sourceDraftPath: 'legacy_tests',
    sourceLegacyTestId: 'legacy-test-1',
    versionNumber: 1,
  });
});
```

Extend `parseLifecycleRequest` to accept `legacy-first-edit` with `document`, and implement one atomic service path that creates immutable version 1 plus a revision draft or returns the existing idempotent result.

- [ ] **Step 5: Run GREEN**

Run:

```powershell
rtk npx vitest run --root functions "src/listening-authoring/*.test.ts"
rtk npm --prefix functions run build
```

Expected: both PASS.

---

### Task 6: HTTPS Handlers And Function Exports

**Files:**
- Create: `functions/src/listening-authoring/http.test.ts`
- Create: `functions/src/listening-authoring/http.ts`
- Create: `functions/src/listening-authoring/index.ts`
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Write failing handler tests**

Create `functions/src/listening-authoring/http.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { buildListeningAuthoringHandler } from './http';

const createResponse = () => {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    set: vi.fn((key: string, value: string) => { response.headers[key] = value; }),
    status: vi.fn((code: number) => { response.statusCode = code; return response; }),
    json: vi.fn((body: unknown) => { response.body = body; return response; }),
    send: vi.fn((body: unknown) => { response.body = body; return response; }),
  };
  return response;
};

describe('Listening authoring HTTPS handlers', () => {
  it('requires POST and bearer auth', async () => {
    const handler = buildListeningAuthoringHandler({
      operation: 'save-draft',
      verifyToken: async () => ({ uid: 'teacher-1' }),
      readUserRole: async () => 'teacher',
      idempotencySecret: 'secret',
      writesDisabled: false,
      service: vi.fn(),
    });

    const getResponse = createResponse();
    await handler({ method: 'GET', get: () => undefined, body: {} }, getResponse);
    expect(getResponse.statusCode).toBe(405);

    const noAuthResponse = createResponse();
    await handler({ method: 'POST', get: () => undefined, body: {} }, noAuthResponse);
    expect(noAuthResponse.statusCode).toBe(401);
  });

  it('blocks writes when kill switch is enabled', async () => {
    const service = vi.fn();
    const handler = buildListeningAuthoringHandler({
      operation: 'save-draft',
      verifyToken: async () => ({ uid: 'teacher-1' }),
      readUserRole: async () => 'teacher',
      idempotencySecret: 'secret',
      writesDisabled: true,
      service,
    });
    const response = createResponse();

    await handler({ method: 'POST', get: () => 'Bearer token', body: { idempotencyKey: 'idem' } }, response);

    expect(response.statusCode).toBe(423);
    expect(service).not.toHaveBeenCalled();
  });

  it('derives owner from verified auth and calls the selected service', async () => {
    const service = vi.fn(async () => ({ status: 'saved', draftId: 'draft-1', conflictToken: 1 }));
    const handler = buildListeningAuthoringHandler({
      operation: 'save-draft',
      verifyToken: async () => ({ uid: 'teacher-1' }),
      readUserRole: async () => 'teacher',
      idempotencySecret: 'secret',
      writesDisabled: false,
      service,
    });
    const response = createResponse();

    await handler({ method: 'POST', get: () => 'Bearer token', body: { idempotencyKey: 'idem', document: {} } }, response);

    expect(service).toHaveBeenCalledWith(expect.objectContaining({
      auth: { uid: 'teacher-1', role: 'teacher' },
      idempotencySecret: 'secret',
    }));
    expect(response.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
rtk npx vitest run --root functions src/listening-authoring/http.test.ts
```

Expected: FAIL because `./http` does not exist.

- [ ] **Step 3: Implement handlers**

Create `functions/src/listening-authoring/http.ts`:

```ts
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

import { LISTENING_AUTHORING_WRITE_KILL_SWITCH } from './constants';
import { createFirebaseListeningAuthoringRepository } from './repository';
import {
  mutateListeningAuthoringLifecycleCore,
  publishListeningDraftCore,
  saveListeningDraftCore,
  type ListeningAuthoringCoreInput,
} from './service';

const readBearerToken = (header: string | undefined): string => {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!match?.[1]) throw Object.assign(new Error('Firebase ID token is required.'), { statusCode: 401 });
  return match[1];
};

const statusForError = (error: unknown): number =>
  typeof (error as { statusCode?: unknown })?.statusCode === 'number'
    ? (error as { statusCode: number }).statusCode
    : 400;

export const buildListeningAuthoringHandler = (dependencies: {
  operation: 'save-draft' | 'publish' | 'lifecycle';
  verifyToken: (token: string) => Promise<{ uid: string }>;
  readUserRole: (uid: string) => Promise<'teacher' | 'super_admin' | null>;
  idempotencySecret: string;
  writesDisabled: boolean;
  service: (input: ListeningAuthoringCoreInput) => Promise<unknown>;
  repo?: ListeningAuthoringCoreInput['repo'];
}) => async (request: any, response: any): Promise<void> => {
  response.set('Access-Control-Allow-Origin', request.get?.('origin') || '*');
  response.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.set('Vary', 'Origin');

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }
  if (request.method !== 'POST') {
    response.status(405).json({ message: 'Method not allowed.' });
    return;
  }
  if (dependencies.writesDisabled) {
    response.status(423).json({ code: 'listening_authoring_writes_disabled' });
    return;
  }

  try {
    const decoded = await dependencies.verifyToken(readBearerToken(request.get?.('authorization')));
    const role = await dependencies.readUserRole(decoded.uid);
    if (role !== 'teacher' && role !== 'super_admin') {
      response.status(403).json({ code: 'teacher_role_required' });
      return;
    }
    const result = await dependencies.service({
      auth: { uid: decoded.uid, role },
      body: request.body,
      repo: dependencies.repo ?? createFirebaseListeningAuthoringRepository(admin.database()),
      idempotencySecret: dependencies.idempotencySecret,
      now: Date.now(),
    });
    response.status(200).json(result);
  } catch (error) {
    response.status(statusForError(error)).json({ code: error instanceof Error ? error.message : 'listening_authoring_error' });
  }
};
```

Create `functions/src/listening-authoring/index.ts` and export three `functions.https.onRequest(...)` handlers using:

- `saveListeningDraftCore`
- `publishListeningDraftCore`
- `mutateListeningAuthoringLifecycleCore`
- `admin.auth().verifyIdToken(token)`
- `admin.database().ref("users/${uid}/role").get()`
- `process.env.LISTENING_AUTHORING_IDEMPOTENCY_SECRET`
- `process.env.LISTENING_AUTHORING_WRITES_DISABLED === 'true'`

Modify `functions/src/index.ts`:

```ts
export {
  mutateListeningAuthoringLifecycle,
  publishListeningDraft,
  saveListeningDraft,
} from './listening-authoring';
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
rtk npx vitest run --root functions "src/listening-authoring/*.test.ts"
rtk npm --prefix functions run build
```

Expected: both PASS.

---

### Task 7: RTDB Rules And Emulator Proof

**Files:**
- Create: `src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts`
- Modify: `database.rules.json`

- [ ] **Step 1: Write failing rules/index tests**

Create `src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const describeEmulator = hasDatabaseEmulator ? describe : describe.skip;
const DATABASE_RULES = readFileSync('database.rules.json', 'utf8');
let testEnv: RulesTestEnvironment;

const draftRecord = {
  schemaVersion: 1,
  draftId: 'draft-1',
  ownerId: 'teacher-1',
  testId: 'test-1',
  path: 'listening_authoring/drafts',
  recordType: 'draft',
  state: 'draft',
  conflictToken: 1,
  document: { title: 'Draft' },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
};

const versionRecord = {
  schemaVersion: 1,
  versionId: 'version-1',
  draftId: 'draft-1',
  ownerId: 'teacher-1',
  testId: 'test-1',
  state: 'published',
  versionNumber: 1,
  sourceDraftPath: 'drafts',
  document: { title: 'Published' },
  documentHash: 'hash-1',
  retainedPins: {},
  publishedAt: 1_700_000_000_000,
};

const operationRecord = {
  schemaVersion: 1,
  operationId: 'op-1',
  ownerId: 'teacher-1',
  operationType: 'save-draft',
  targetId: 'draft-1',
  idempotencyKeyHash: 'hash-1',
  requestHash: 'request-1',
  status: 'succeeded',
  result: { status: 'saved', draftId: 'draft-1', conflictToken: 1 },
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  expiresAt: 1_702_592_000_000,
};

describe('PRD-0057 listening_authoring RTDB rules', () => {
  it('defines approved roots, indexes, and root write freeze', () => {
    const rules = JSON.parse(DATABASE_RULES) as { rules: Record<string, any> };
    const root = rules.rules.listening_authoring;

    expect(root.drafts['.indexOn']).toEqual(['ownerId', 'testId', 'state', 'updatedAt']);
    expect(root.revision_drafts['.indexOn']).toEqual(['ownerId', 'testId', 'state', 'updatedAt']);
    expect(root.versions['.indexOn']).toEqual(['ownerId', 'testId', 'draftId', 'versionNumber', 'state', 'publishedAt']);
    expect(root.operations['.indexOn']).toEqual(['ownerId', 'operationType', 'targetId', 'idempotencyKeyHash', 'status', 'createdAt', 'expiresAt']);
    expect(rules.rules['.write']).toContain("newData.child('listening_authoring').val() === data.child('listening_authoring').val()");
  });

  describeEmulator('emulator enforcement', () => {
    beforeEach(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'demo-prd-0057-listening-authoring',
        database: { rules: DATABASE_RULES },
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await db.ref('users/teacher-1/role').set('teacher');
        await db.ref('users/teacher-2/role').set('teacher');
        await db.ref('users/admin-1/role').set('super_admin');
        await db.ref('listening_authoring/drafts/draft-1').set(draftRecord);
        await db.ref('listening_authoring/revision_drafts/revision-1').set({ ...draftRecord, draftId: 'revision-1', path: 'listening_authoring/revision_drafts', recordType: 'revision-draft' });
        await db.ref('listening_authoring/versions/version-1').set(versionRecord);
        await db.ref('listening_authoring/operations/op-1').set(operationRecord);
      });
    });

    it('allows owner and super-admin reads but denies cross-owner and guest reads', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const otherTeacher = testEnv.authenticatedContext('teacher-2').database();
      const admin = testEnv.authenticatedContext('admin-1').database();
      const guest = testEnv.unauthenticatedContext().database();

      await assertSucceeds(owner.ref('listening_authoring/drafts/draft-1').once('value'));
      await assertSucceeds(admin.ref('listening_authoring/versions/version-1').once('value'));
      await assertFails(otherTeacher.ref('listening_authoring/drafts/draft-1').once('value'));
      await assertFails(guest.ref('listening_authoring/versions/version-1').once('value'));
      await assertFails(owner.ref('listening_authoring').once('value'));
    });

    it('denies all browser writes to canonical authoring roots', async () => {
      const owner = testEnv.authenticatedContext('teacher-1').database();
      const admin = testEnv.authenticatedContext('admin-1').database();

      await assertFails(owner.ref('listening_authoring/drafts/draft-1').update({ conflictToken: 2 }));
      await assertFails(owner.ref('listening_authoring/drafts/draft-2').set({ ...draftRecord, draftId: 'draft-2' }));
      await assertFails(owner.ref('listening_authoring/versions/version-2').set({ ...versionRecord, versionId: 'version-2' }));
      await assertFails(owner.ref('listening_authoring/operations/op-2').set({ ...operationRecord, operationId: 'op-2' }));
      await assertFails(admin.ref('listening_authoring/drafts/draft-1').remove());
    });
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
rtk npx vitest run src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts
rtk npx firebase-tools emulators:exec --only database "npx vitest run src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts"
```

Expected: first command FAILS on missing rule root/indexes. Emulator command FAILS on same missing rules if emulator starts.

- [ ] **Step 3: Add rules/indexes**

Modify `database.rules.json`:

- Add root write freeze clause:

```json
"newData.child('listening_authoring').val() === data.child('listening_authoring').val()"
```

- Add `listening_authoring` root with `.read: false`, `.write: false`, and child roots:

```json
"listening_authoring": {
  ".read": false,
  ".write": false,
  "drafts": {
    ".indexOn": ["ownerId", "testId", "state", "updatedAt"],
    "$draftId": {
      ".read": "auth != null && (data.child('ownerId').val() === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'super_admin')",
      ".write": false
    }
  },
  "revision_drafts": {
    ".indexOn": ["ownerId", "testId", "state", "updatedAt"],
    "$draftId": {
      ".read": "auth != null && (data.child('ownerId').val() === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'super_admin')",
      ".write": false
    }
  },
  "versions": {
    ".indexOn": ["ownerId", "testId", "draftId", "versionNumber", "state", "publishedAt"],
    "$versionId": {
      ".read": "auth != null && (data.child('ownerId').val() === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'super_admin')",
      ".write": false
    }
  },
  "operations": {
    ".indexOn": ["ownerId", "operationType", "targetId", "idempotencyKeyHash", "status", "createdAt", "expiresAt"],
    "$operationId": {
      ".read": "auth != null && (data.child('ownerId').val() === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'super_admin')",
      ".write": false
    }
  }
}
```

- [ ] **Step 4: Run GREEN**

Run:

```powershell
rtk npx vitest run src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts
rtk npx firebase-tools emulators:exec --only database "npx vitest run src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts"
```

Expected: both PASS. If the first command skips emulator cases because `FIREBASE_DATABASE_EMULATOR_HOST` is unset, the second command must run the emulator cases and PASS.

---

### Task 8: Backup And Restore DR Proof

**Files:**
- Modify: `r2-backup-worker/src/backup/data-backup.test.ts`
- Modify: `r2-backup-worker/src/restore/restore-execute.ts`
- Modify: `r2-backup-worker/src/restore/restore-execute.test.ts`

- [ ] **Step 1: Write failing backup inclusion assertion**

Modify `r2-backup-worker/src/backup/data-backup.test.ts` existing RTDB backup test fixture so shallow discovery includes:

```ts
listening_authoring: true,
```

Return this data for `path === 'listening_authoring'`:

```ts
return json({
  drafts: {
    'draft-1': {
      schemaVersion: 1,
      draftId: 'draft-1',
      ownerId: 'teacher-1',
      conflictToken: 3,
      document: { title: 'Draft' },
    },
  },
  revision_drafts: {
    'revision-1': {
      schemaVersion: 1,
      draftId: 'revision-1',
      ownerId: 'teacher-1',
      conflictToken: 1,
      createdFromVersionId: 'version-1',
    },
  },
  versions: {
    'version-1': {
      schemaVersion: 1,
      versionId: 'version-1',
      ownerId: 'teacher-1',
      versionNumber: 1,
      documentHash: 'hash-1',
      archiveMetadata: { archivedAt: 1_700_000_100_000, archivedBy: 'teacher-1' },
    },
  },
  operations: {
    'op-1': {
      schemaVersion: 1,
      operationId: 'op-1',
      ownerId: 'teacher-1',
      operationType: 'publish',
      targetId: 'draft-1',
      idempotencyKeyHash: 'hash-1',
      requestHash: 'request-1',
      status: 'succeeded',
      expiresAt: 1_702_592_000_000,
    },
  },
});
```

Add expectations:

```ts
expect(savedRtdb.listening_authoring).toMatchObject({
  drafts: { 'draft-1': { ownerId: 'teacher-1', conflictToken: 3 } },
  revision_drafts: { 'revision-1': { createdFromVersionId: 'version-1' } },
  versions: { 'version-1': { documentHash: 'hash-1' } },
  operations: { 'op-1': { idempotencyKeyHash: 'hash-1', expiresAt: 1_702_592_000_000 } },
});
expect(savedMeta.entityCounts.rtdb.listening_authoring).toBe(4);
```

- [ ] **Step 2: Run backup RED/GREEN check**

Run:

```powershell
rtk npm --prefix r2-backup-worker test -- src/backup/data-backup.test.ts
```

Expected before implementation adjustment: if the test references variables not currently captured, it fails. Add the smallest test-harness capture needed to inspect `steps/<backupId>/rtdb.json` and `steps/<backupId>/meta.json`. Then rerun until PASS. No production backup code change should be needed if root shallow discovery already includes all non-excluded nodes.

- [ ] **Step 3: Add restore ordering and restore drill assertions**

Modify `r2-backup-worker/src/restore/restore-execute.ts`:

```ts
const RTDB_RESTORE_ORDER = [
    'users', 'media_asset_upload_sessions', 'media_assets', 'media_asset_events',
    'media_asset_metrics', 'media_asset_sweeps', 'listening_authoring', 'tests', 'quizzes', 'classes', 'courses',
```

Modify `r2-backup-worker/src/restore/restore-execute.test.ts` backup fixture to include the same `listening_authoring` object from Step 1. Add expected manifest entity count:

```ts
listening_authoring: 4,
```

Add live RTDB initial node:

```ts
['listening_authoring', {}],
```

Add expectations after restore:

```ts
expect(patchOrder.indexOf('listening_authoring')).toBeLessThan(patchOrder.indexOf('tests'));
expect(liveRtdb.get('listening_authoring')).toMatchObject({
  drafts: { 'draft-1': { ownerId: 'teacher-1', conflictToken: 3 } },
  revision_drafts: { 'revision-1': { createdFromVersionId: 'version-1' } },
  versions: { 'version-1': { documentHash: 'hash-1', archiveMetadata: { archivedBy: 'teacher-1' } } },
  operations: { 'op-1': { idempotencyKeyHash: 'hash-1', expiresAt: 1_702_592_000_000 } },
});
```

- [ ] **Step 4: Run DR GREEN**

Run:

```powershell
rtk npm --prefix r2-backup-worker test -- src/backup/data-backup.test.ts src/restore/restore-execute.test.ts
```

Expected: PASS.

---

### Task 9: Integrated Verification And Authority Sync

**Files:**
- Modify only after proof: `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- Modify only after proof: `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- Modify only after proof: `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- Modify only after proof: `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
- Modify only after proof: `documentation/architecture/upload-storage-authority.md`

- [ ] **Step 1: Run focused proof bundle**

Run:

```powershell
rtk npx vitest run --root functions "src/listening-authoring/*.test.ts"
rtk npm --prefix functions run build
rtk npx vitest run src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts
rtk npx firebase-tools emulators:exec --only database "npx vitest run src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts"
rtk npm --prefix r2-backup-worker test -- src/backup/data-backup.test.ts src/restore/restore-execute.test.ts
```

Expected: all PASS. If any command fails, stop source work and append a BLOCKED note to findings with the failing command and first actionable error.

- [ ] **Step 2: Run integration guardrails and generic proof**

Run:

```powershell
rtk node scripts/check-assessment-unification-guardrails.mjs --changed-files functions/src/listening-authoring/constants.ts functions/src/listening-authoring/contracts.ts functions/src/listening-authoring/canonical.ts functions/src/listening-authoring/validation.ts functions/src/listening-authoring/repository.ts functions/src/listening-authoring/service.ts functions/src/listening-authoring/http.ts functions/src/listening-authoring/index.ts functions/src/index.ts database.rules.json src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts r2-backup-worker/src/backup/data-backup.test.ts r2-backup-worker/src/restore/restore-execute.ts r2-backup-worker/src/restore/restore-execute.test.ts
rtk npm run check:utf8 -- --files functions/src/listening-authoring/constants.ts functions/src/listening-authoring/contracts.ts functions/src/listening-authoring/canonical.ts functions/src/listening-authoring/validation.ts functions/src/listening-authoring/repository.ts functions/src/listening-authoring/service.ts functions/src/listening-authoring/http.ts functions/src/listening-authoring/index.ts functions/src/index.ts database.rules.json src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts r2-backup-worker/src/backup/data-backup.test.ts r2-backup-worker/src/restore/restore-execute.ts r2-backup-worker/src/restore/restore-execute.test.ts docs/superpowers/specs/2026-06-27-prd0055-task5-backend-authority-foundation-design.md docs/superpowers/plans/2026-06-27-prd0055-task5-backend-authority-foundation.md
rtk git diff --check
rtk npm run build
```

Expected: all PASS. If guardrail fails because existing pre-plan files remain over line budget, do not claim closure; record the exact guardrail output and either split the touched file or mark BLOCKED.

- [ ] **Step 3: Reconcile authority surfaces**

Apply only current-truth wording. Do not rewrite historical packet text as if old claims were always true.

Required current truth:

- Task 5 backend authority foundation is implemented locally if and only if all proof in Steps 1 and 2 passes.
- `functions/src/listening-authoring/**` owns trusted handlers and server authority.
- `listening_authoring/**` RTDB rules/indexes deny browser writes and cross-owner access.
- DR backup/restore proof covers drafts, revision drafts, immutable versions, and unexpired operations.
- Task 5 UI, browser facade, durable builder Save draft, immutable builder Publish, upload-session UI integration, announcements, browser QA, selected-teacher rollout, Task 6, deploy, remote mutation, staging, commit, and push remain unstarted.

Update these surfaces to match that exact truth:

- `tasks/tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
- `documentation/architecture/upload-storage-authority.md`

- [ ] **Step 4: Run stale-claim scans**

Run:

```powershell
rtk rg -n "Task 5\\.12\\+.*unstarted|UI controls.*unstarted|No trusted `functions/src/listening-authoring|no `listening_authoring|browser-supplied `ownerId|seven-day operation TTL|publish-draft|Task 5 remains unstarted" tasks documentation docs/superpowers/specs docs/superpowers/plans
rtk rg -n "saveListeningDraft|publishListeningDraft|mutateListeningAuthoringLifecycle|LISTENING_AUTHORING_IDEMPOTENCY_SECRET|LISTENING_AUTHORING_WRITES_DISABLED|listening_authoring" functions/src database.rules.json src/__tests__/security r2-backup-worker/src
```

Expected: first command has no stale false-current claims in active/current-state sections. Historical append-only sections may still mention old false state if clearly historical. Second command shows new backend/rules/DR implementation paths.

- [ ] **Step 5: Final status proof**

Run:

```powershell
rtk git status --short --branch
rtk git status --short --untracked-files=all
rtk git diff --name-only
rtk git diff --cached --name-only
```

Expected:

- Branch remains `codex/prd-0055-task-2a-s0-worker-truth`.
- No staged files unless user separately approved staging.
- Dirty paths are limited to pre-existing user-owned work plus exact paths changed by this plan.
- No deploy, remote mutation, cleanup, staging, commit, push, or Task 6 start occurred.

---

## Subagent Execution Guidance

Use sequential subagents only after the user approves the remaining post-spawn model-inspection limitation or a compliant inspection surface appears.

Recommended task assignment:

- Task 1-2: `gpt-5.4-mini`, high reasoning, worker. Scope only `functions/src/listening-authoring/{constants,contracts,canonical,validation,repository}*`.
- Task 3-5: `gpt-5.4`, high reasoning, worker. Scope only `functions/src/listening-authoring/{service,repository}*`.
- Task 6: `gpt-5.4`, high reasoning, worker. Scope only `functions/src/listening-authoring/{http,index}*` and `functions/src/index.ts`.
- Task 7: `gpt-5.4`, high reasoning, worker. Scope only `database.rules.json` and `src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts`.
- Task 8: `gpt-5.4`, high reasoning, worker. Scope only `r2-backup-worker/src/backup/data-backup.test.ts`, `r2-backup-worker/src/restore/restore-execute.ts`, and `r2-backup-worker/src/restore/restore-execute.test.ts`.
- Task 9: main thread only for authority sync, final proof, and PASS/BLOCKED decision.

Each worker must report:

- Status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.
- Files changed.
- Exact tests run and results.
- Whether any source, rules, DR, docs, deploy, staging, commit, push, cleanup, or Task 6 boundary was touched.
- Known blind spots.
