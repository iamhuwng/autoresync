# Packet 2 Source Lifecycle Contract

Status: design baseline for the surgical Packet 2 rebuild — 2026-07-17

> Dormant after code reset. Read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md). This contract is future design intent only and must be revalidated before implementation.

This contract replaces scattered upload/replace/delete assumptions with one explicit Source lifecycle seam. It does not rebuild the application and does not implement Packet 3 or later entitlement issuers.

## State model

```text
PRIVATE_READY --replace--> PRIVATE_REPLACED --trusted publish gate--> PUBLISHED
       |                          |                                  |
       +------ detach/archive ----+-------------------------------> RETIRED
```

States describe the active lifecycle record, not destructive storage operations:

- `PRIVATE_READY`: immutable Source Version exists, private original is readable only through trusted Source authority, and it is not publishable/deliverable.
- `PRIVATE_REPLACED`: a newer immutable Source Version records `replacesSourceVersionId`; the prior version remains historical until an explicit trusted publication/detach decision.
- `PUBLISHED`: Component 03 has persisted trusted publication state and published-only producer projections. Delivery still requires a later valid entitlement.
- `RETIRED`: the version is blocked from new publication/use. Immutable Source, publication, attempt, checkpoint, audit, original, and integrity-sidecar history remains retained.

`PRIVATE_REPLACED` is provenance, not an implicit delete. `PUBLISHED` is not an entitlement. `RETIRED` is not storage purge.

## One lifecycle interface

The deep Source lifecycle module owns these transitions:

```ts
interface SourceLifecycleService {
  create(input: CreatePrivateSource): Promise<PrivateReadySource>;
  replace(input: ReplacePrivateSource): Promise<PrivateReplacedSource>;
  detach(input: DetachSource): Promise<RetiredSource>;
  retire(input: RetireSource): Promise<RetiredSource>;
}
```

Every operation requires authenticated Book-management authority, an expected current pointer/revision, and an idempotency key. Every successful transition returns the immutable version identity plus the new lifecycle record. Every failed transition is side-effect free.

The module must preserve:

- immutable Source Version records and replacement provenance;
- private original and integrity-sidecar history;
- pinned publication/attempt/checkpoint references;
- one-way Main Worker → Source Worker authority flow;
- no browser writes to `book_source`, Assembly, entitlements, current pointers, publication state, or delivery authority.

Persistence shape: immutable Source Version metadata remains at
`book_source/source_versions/{bookId}/{sourceVersionId}`. Mutable lifecycle
records and lifecycle audit events live under the protected
`book_source/lifecycle_records` and `book_source/lifecycle_audit_events` maps,
inside the same trusted `/book_source` CAS transaction. Missing lifecycle rows
are tolerated only for legacy records during migration; any present retired row
is authoritative and blocks new Assembly/Delivery use.

## Transition ownership

| Transition | Owner | Persistence boundary | Proof |
|---|---|---|---|
| create/private upload | C02 Source lifecycle | Source operation + immutable Source Version transaction | authorized success, unauthorized denial, private readback |
| replace | C02 Source lifecycle | new immutable Source Version + replacement provenance transaction | prior version unchanged, new version linked |
| detach | C02 Source lifecycle with trusted Assembly reference check | active Book/Unit pointer removal + lifecycle audit; immutable history retained | active reference absent, history readable |
| retire/archive | C02 Source lifecycle | lifecycle state + current-use guard | new publication/use denied, pinned history retained |
| publish | C03 Assembly lifecycle | candidate/publication/projection transaction | unpublished rejected, exact published projection |
| Solo entitlement | C04 | separate entitlement/current-pointer transaction | no entitlement before trusted publication |
| Homework entitlement | C05 | assignment/manifest/entitlement transaction | frozen binding and entitlement proof |
| stale grant invalidation | C06 | selected update/revoke transaction | stale delivery denied, history readable |
| cross-feature/public delivery | C07 | delivery projection/entitlement boundary | authenticated public-safe complete-document proof |
| complete lifecycle proof | C08 | disposable fixture + readbacks | upload → replace → detach → publish → assign → entitle → deliver → revoke/cleanup |

## Non-negotiable invariants

1. Browser clients never perform lifecycle mutation directly.
2. Replacement never mutates or deletes the replaced Source Version.
3. Detach/retire never deletes immutable Source, publication, attempt, checkpoint, audit, original, or integrity-sidecar history.
4. A private or retired Source cannot publish, assign, or deliver.
5. Publication does not mint entitlement.
6. Entitlement does not widen the authorized Book, Source Version, publication, or delivery-context boundary.
7. Each transition has one owner, one persistence boundary, and one focused proof.

## Rebuild boundary

The surgical rebuild may add/adapt C02 lifecycle modules, trusted Worker routes, repositories, audit records, and focused tests. It must not alter unrelated Book Activity features, entitlement issuance implementation, public delivery implementation, or later Packet ownership. Existing correct immutable Source, replacement, private-upload, Main→Source, Assembly publication, and entitlement-split foundations remain inputs to this contract.
