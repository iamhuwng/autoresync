# PRD0062 #106 canonical "Customize here" writer contract

Status: `FROZEN_PENDING_SOL_COMMITMENT`

Base: `c25cc1ca64aab637d86026fd939e9617586729e1`

This contract replaces the retired `BookActivity*`, fork material, candidate,
draft, and `fork_history` shapes. It does not activate the route, generated
rules, UI, or #108.

## Deep module and interface

The external seam is one deep module. Callers do not resolve private source
records, allocate IDs, build canonical payloads, plan catalog mirrors, sequence
writes, or repair replays.

```ts
export interface PublicBookCanonicalForkCommand {
  readonly actorId: string; // authenticated Worker uid, never request JSON
  readonly operationId: string; // required UUID
  readonly target: PublicBookReferenceTarget;
  readonly selection: PublicBookSelectionRequest; // kind=activity, exactly one activity
  readonly context: PublicBookSourceContextChoice;
}

export interface PublicBookCanonicalForkPlacementResult {
  readonly state: 'present' | 'moved' | 'removed';
  readonly bookId: string;
  readonly originalNodeId: string;
  readonly currentNodeId?: string;
  readonly refId: string;
}

export interface PublicBookCanonicalForkResult {
  readonly status: 'created' | 'replayed';
  readonly operationId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: 1;
  readonly placement: PublicBookCanonicalForkPlacementResult;
}

export interface PublicBookCanonicalForkWriter {
  fork(input: PublicBookCanonicalForkCommand): Promise<PublicBookCanonicalForkResult>;
}
```

The HTTP request accepts only `action`, `operationId`, `target`, `selection`, and
optional `context`. Exact-key validation rejects `actorId`, `uid`, `role`,
`ownerId`, canonical payloads, answer-bearing fields, and unknown fields.

`PublicBookReferenceForkService.fork` retains the existing public-source,
selection, context, target-owner, mutation, and rollback checks, then calls the
writer. The production writer repeats every security-critical target and source
pin against authoritative server-side records before mutation.

## Identity and canonical version

- The operation is activity-only: `selection.kind === 'activity'`, exactly one
  activity, and its order/path exactly match the selected public Activity.
- Destination identities use SHA-256/base64url over an unambiguous,
  length-delimited UTF-8 encoding of authenticated `actorId` and `operationId`.
  The domains `public-book-fork/activity-id/v1` and
  `public-book-fork/activity-version-id/v1` are encoded separately. The IDs are
  new, opaque, stable across retry, and cannot collide across the two domains.
- The destination is a real immutable canonical version with
  `activityVersion: 1`, no predecessor, target owner, target placement ID,
  operation ID, and creation timestamp.
- The source `NormalizedActivity` is structured-cloned as one private unit. This
  deliberately preserves answer semantics, interaction IDs, item identity
  arrays, and answer-key mappings. IDs inside the Activity are not reminted.
- The student projection is regenerated with
  `projectStudentActivity(destination.activity)`. The canonical validator and
  runtime-neutral projection validator remain authoritative.
- The destination canonical fingerprint is recomputed. The source record and
  original Activity remain unchanged.

## Provenance, source pins, and placement

Add a version-1-only `public-book-fork` canonical provenance variant. It records:

- source Book and canonical owner, manifest, publication ID/revision,
  source-version ID, and the committed publication/manifest binding;
- source Activity ID, Activity Version ID/numeric version, payload fingerprint,
  and the complete sorted source placement-ID set from the resolved manifest;
- the selected source placement node/placement/unit/activity keys, selection
  kind/path/order, source pages, page groups, and source-context fingerprint;
- target Book, owner, original node, placement/ref ID, append order, and the
  target Book `updatedAt` used as the Book-wide concurrency precondition.

The resolved source placement set and its fingerprint must match the exact
canonical record; a selection cannot substitute another placement of the same
Activity. The variant is valid only for `activityVersion === 1`, has no
predecessor, and points to a different top-level Activity ID. It adds no legacy
`forkedFromMaterialId`, `BookActivity*`, material, candidate, draft, or history
aliases.

The destination placement is the real catalog authority:
`material_catalog/book_nodes/{bookId}/{nodeId}`. The next node contains one new
ref using `placementId` as `refId`, `materialKind: 'interactive-activity'`, the
new Activity/version IDs, target-owner snapshot, private visibility snapshot,
safe title/test-type snapshots, and the next order. It is an immutable
canonical snapshot, not a public-eligible Activity. The compatibility-only
`public_reference_placements` path is not written.

Before planning, the writer reads every node in the target Book and requires the
placement/ref ID to be unique Book-wide. It uses the existing Book editor
transformation and a shared pure Book-update planner so the fork cannot drift
from normal `updateBookTree()` metadata, index, or material-summary behavior.

## Authoritative reads and denial order

No service, token provider, mutation client, or storage dependency is
constructed or touched when the dedicated canonical-fork gate is absent/false.

When explicitly enabled, denial order is:

1. method, authenticated uid, body size/JSON, action, and exact request shape;
2. dedicated canonical-fork gate, overall mutation gate, and rollback gate;
3. trusted teacher/super-admin role resolved by server-side authority, never a
   caller-supplied role field;
4. exact operation-receipt lookup for the authenticated actor; an exact receipt
   takes the replay path and never creates another Activity;
5. target Book exists, `ownerId === authenticated uid`, `visibility ===
   'private'`, and status is `draft-empty`, `draft-in-progress`, or `ready`;
6. target node exists under that Book; expected Book `updatedAt` matches; and no
   node anywhere in the Book contains the requested placement/ref ID;
7. public source is trusted/ready and exactly matches Book, publication,
   revision, selection kind/path, Activity ID/version ID/order, and context;
8. private source resolver follows the committed Book-assembly pointer,
   manifest, Book-local Activity-version reference, safe projection, and source
   placement, then uses the exact canonical reader; canonical owner, placement
   set, every source pin, and every fingerprint must agree;
9. build and validate the canonical V1, safe sibling, next node, next Book
   metadata, all indexes/summaries, and immutable receipt;
10. mint an actor/operation/mutation-bound Firebase token and commit once.

Wrong actor, current owner, Book state, node, placement, source owner,
publication, version, order, context, projection, or canonical binding fails
before mutation. Super-admin is not a target-ownership bypass. On replay, if the
target Book is no longer owned by the receipt actor, return authorization denial
without writing or creating another Activity.

## Atomicity and durable replay

There is no reservation or repair record. The only write is one Firebase RTDB
root multi-location PATCH containing this complete dynamic update plan:

1. `book_activity/versions/{activityId}/{activityVersionId}`;
2. `book_activity/student_safe_projections/{activityId}/{activityVersionId}`;
3. the complete next `material_catalog/book_nodes/{bookId}/{nodeId}`;
4. target Book metadata with recomputed status, `updatedAt`, and `updatedBy`;
5. all current Book owner/visibility/test-type index rows and all obsolete index
   removals produced by the existing Book index planner;
6. all current material-summary owner/visibility/material-kind/test-type index
   rows and all obsolete summary-index removals produced by the existing
   material-summary planner;
7. `book_activity/canonical_fork_operations/{actorId}/{operationId}`.

The shared pure Book-update planner is the single authority for items 3-6 and
is used by both the fork writer and normal Book tree mutation. The scoped claim
binds actor, operation, source, destination, target, expected Book `updatedAt`,
and a fingerprint of the exact root update plan. Firebase rules compare the
current Book `updatedAt` with the claim, require absent immutable destinations
and receipt, and validate the exact planned leaves. Firebase evaluates the root
PATCH atomically; any denied path denies every path.

The immutable replay product set is only the operation receipt, canonical V1,
and safe sibling. The receipt contains no answer-bearing data. It stores the
intent fingerprint, complete authoritative source and original-target pins,
destination IDs/fingerprint, exact initial mutation-plan fingerprint, and
timestamp. The intent and plan fingerprints use domain-separated SHA-256 over
canonical length-delimited encodings; generated timestamps are excluded from
the intent fingerprint.

- Exact receipt: verify the immutable product set byte-for-byte and never write.
  Scan the currently authorized target Book for the semantic ref ID plus exact
  Activity/version. Return `present` at the original node, `moved` at another
  node, or `removed` if absent. Reorder and timestamp changes do not invalidate
  replay.
- A ref with the receipt ID but different Activity/version, a mismatched
  immutable product, or an incomplete immutable set is
  `fork-state-inconsistent`; it is never healed and never creates another
  Activity.
- Existing receipt with another intent is `409 operation-conflict`.
- Concurrent duplicate: one atomic PATCH wins; the denied caller re-reads the
  exact receipt and immutable products and returns the same replay result.
- Different operation at the same Book revision: the loser re-reads the Book.
  If its placement/ref ID is present, return `409 placement-conflict`; otherwise
  it may re-plan once from the new Book `updatedAt`, preserving deterministic
  destination IDs.
- Transport/lost-ack: re-read the receipt and immutable set. A complete match is
  replayed; an absent set may retry; any subset or mismatch fails closed.
- Validation, token, rule, HTTP, and injected write failures leave no partial
  canonical, projection, Book, index, summary, or receipt records.

The existing sequential canonical `prepare()` writer is not used because it can
leave durable canonical/projection partial state.

## Privacy and rules feasibility

Only the private canonical record contains `answerKey`, rubrics, accepted text,
correct option/pair/order mappings, and hidden identity containers. The safe
sibling is the regenerated allowlisted projection. Book refs, indexes,
summaries, results, and receipts contain no answer-bearing or provider/private
source fields.

Firebase ancestor grants are additive. Therefore a fork service token is
explicitly excluded from every ordinary owner/admin ancestor write grant that
could authorize the affected `material_catalog` or `book_activity` paths. The
inactive #44 fragment removes retired fork paths, owns the receipt and exact
Book/node/index/summary fork authorization, and #16A gains only exact immutable
canonical/safe-sibling fork creation. No descendant deny is treated as capable
of revoking an ancestor allow. Deletes, whole-node/whole-Book replacement,
sibling writes, retargeting, claim mismatch, and ancestor-shaped writes are all
denied in emulator tests.

Generated/active rules and remote deployment remain #118/#134 work. Route and
writer gates remain default-off.

## Required focused verification

- canonical provenance V1 validation and cross-family negatives;
- domain-separated deterministic IDs, new version 1, source unchanged, answer
  and hidden identities preserved, derived projection exact, private fields absent;
- exact source owner/placement-set/manifest/publication/context pin negatives;
- wrong actor/owner/Book state/node/Book-wide placement denied with zero writes;
- exact replay after reorder, move, and removal; divergent replay; lost
  acknowledgement before/after commit; concurrent duplicate and Book-revision
  collision; inconsistent immutable set fail closed;
- exact mirror-complete root update plan, one PATCH, and no partial records after
  every injected failure;
- rule-fragment and emulator negatives for sibling, ancestor, delete,
  replacement, retarget, and claim-mismatch attacks;
- Worker `503` before service/token/storage construction when disabled;
- focused TypeScript, ESLint, Vitest, Worker tests, and `git diff --check`.

Implementation, route activation, PR actions, and #108 remain prohibited until
a fresh Sol commitment verdict says `proceed`.
