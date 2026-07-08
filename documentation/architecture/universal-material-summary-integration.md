# Universal Material Summary Integration

## Status

Current architecture and implementation contract for active Teacher Materials
discovery.

This contract supersedes any interpretation that `/tests`,
`material_catalog/material_indexes`, or `material_catalog/book_indexes` is the
universal Teacher Materials listing source. Those paths remain bounded runtime,
legacy compatibility, archive, repair, or feature-specific helper surfaces where
a consumer still requires them.

## Problem

Supported material families previously used separate discovery paths:

- generic, Writing, THCS-THPT, and Listening tests use `/tests`
- Reading V2 full tests use `/tests` plus a relationship-index overlay
- Reading Passages use `material_catalog/material_indexes`
- Books use `material_catalog/book_indexes`
- drafts use family-specific Firestore and RTDB stores

That made discoverability depend on feature-specific changes in
`TeacherLobbyPage`, `useTeacherTests`, and `useTestFilters`. A producer can be
fully functional while remaining invisible in My Content or Public Library.

## 2026-07-07 Conversation Authority

This document was reconciled after re-reading the actual Codex session log at
`C:/Users/The Lord/.codex/sessions/2026/07/06/rollout-2026-07-06T20-54-17-019f37b5-412d-7dd0-a937-d0cc1bd69a1c.jsonl`.

Key directives captured from that log:

- The original defect was missing materials in Teacher Lobby Materials after
  Reading V1, quiz, Google Drive, and session-tab cleanup.
- Superseded as a tab presentation rule on 2026-07-08: My Content was recorded
  here as all supported active material kinds owned by the teacher, not only
  legacy `/tests` rows or Reading V2 full tests.
- Superseded as a tab presentation rule on 2026-07-08: Public Library was
  recorded here as all active public material summaries, including public rows
  owned by the current teacher.
- The long-term fix is a producer registry plus shared MaterialSummary port,
  not another tab-specific loader patch.
- Publishing, updating, archiving, restoring, removing, reconciliation, and
  repair must synchronize listing summaries automatically.
- Errors must be surfaced; a permission, infrastructure, or contract failure
  must never render as a believable empty list.
- Localhost browser proof is required; live project checks are separate unless
  explicitly approved. The user approved live repair/backfill writes for this
  incident only.
- The class-page regression found during this work was a legacy/fixture data
  normalization problem, not part of the material-summary authority model.

## 2026-07-08 Product Correction

The 2026-07-07 phrase "My Content must represent all supported active material
kinds" is obsolete as a tab presentation rule. It remains true only at the
summary-catalog authority layer: supported producers must write active
summaries so each dedicated view can discover them.

Teacher Lobby tab presentation is:

- My Content: published tests owned by the teacher.
- Public Library: published public tests.
- Reading Passage: active or archived Reading Passage rows, according to the
  tab's own visibility/archive controls.
- Book: Book rows, according to the tab's own visibility controls.
- Drafts: family-specific draft stores, separate from published materials.

Published-test material kinds are:

- `full-test`
- `listening-part`
- `writing-prompt`
- `thcs-thpt-test`

THCS `Use as-is` / `thcs_linked_tests` references are not owned materials and
must not be merged into My Content. If the product needs them as saved
shortcuts, they belong in a separate Saved/Linked view.

Reading Passage and Book rows must not appear in My Content/Public Library just
because they are active owned or public summaries. Their own tabs remain
summary-index consumers, not separate discovery authorities.

## Architecture

Feature-specific canonical and runtime stores remain separate. Every material
producer integrates with Teacher Materials through one lightweight summary
module:

```text
canonical producer
  -> MaterialSummary
     -> shared summary fan-out
     -> material_summary_indexes/v1/by_id/{materialId}
     -> material_summary_indexes/v1/by_owner/{ownerId}/{materialId}
     -> material_summary_indexes/v1/by_visibility/{visibility}/{materialId}
     -> material_summary_indexes/v1/by_material_kind/{materialKind}/{materialId}
     -> material_summary_indexes/v1/by_test_type/{testTypeId}/{materialId}

Teacher Materials
  -> owned or public summary index
  -> registry-backed filters and adapters
  -> canonical/runtime read only after an explicit user action
```

Summary indexes never contain canonical material bodies, questions, answer
keys, scoring rules, student answers, review payloads, import evidence, or
hidden provenance.

## Module Interface

The external seam is
`src/services/materialCatalog/materialSummaryPort.service.ts`.

Producers use:

- `buildMaterialSummaryIndexPlan(summary)`
- `buildMaterialSummaryIndexCleanup(summary)`
- `buildMaterialSummaryUpdatePayload(nextSummary, previousSummary?)`
- `synchronizeMaterialSummary(summary, store, previousSummary?)`

Consumers use:

- `listActiveMaterialSummaries(query, reader)`

The module owns:

- runtime contract validation
- unsafe-field rejection
- Firebase `undefined` rejection
- test-type and tag deduplication
- derived `testTypeMembership` map construction
- index path fan-out
- owned/public scope validation
- deterministic ordering
- fail-loud malformed-index behavior

Callers do not construct index paths or infer material kinds from payload
shapes.

## Summary Contract

Required identity and lifecycle fields:

- `schemaVersion`
- `materialId`
- `producerId`
- `materialKind`
- `surfaceFamily`
- `ownerId`
- `title`
- `visibility`
- `lifecycleState`
- `testTypeIds`
- `testTypeMembership`
- `tags`
- `updatedAt`

Optional safe display/filter fields:

- `description`
- `skillId`
- `primaryTestTypeId`
- `questionCount`
- `durationMinutes`
- `sourceSnapshotVersionId`
- `sourceFullTestId`
- `hasBrokenRefs`
- `brokenRefCount`

`materialId` is stable across indexes. Canonical identifiers and snapshot
identifiers remain owned by the producer.

`testTypeMembership` is a derived map such as `{ "ielts": true }`. Producers
may pass only `testTypeIds` to the port; the port normalizes and writes the
membership map. Rules require the map because RTDB rules cannot reliably scan
arrays for `by_test_type/{testTypeId}` membership.

## Producer Registry

Every supported producer must have one registration containing:

- stable `producerId`
- canonical family owner
- material kinds
- surface families
- skill ids
- lifecycle owner
- truthful integration mode

Integration modes:

- `legacy-bridge`: discoverability still depends on `/tests`
- `legacy-index`: producer writes a pre-universal summary/index shape
- `summary-v1`: producer writes the universal contract through the shared port

A producer must not claim `summary-v1` without the matching contract version.
Unknown producers and duplicate registrations are contract failures.

The registry describes taxonomy and ownership. It does not read canonical
payloads and does not select a feature-specific listing loader.

## Lifecycle Contract

Publish and update:

1. Validate canonical producer state.
2. Build the current `MaterialSummary`.
3. Build previous-summary cleanup when owner, visibility, kind, or Test Type
   membership changed.
4. Commit canonical state and summary fan-out through the producer's approved
   atomic or reviewed multi-location write.
5. Write runtime compatibility bridges separately when required.

Archive and remove:

1. Persist canonical lifecycle state.
2. Remove all active summary paths.
3. Add an archive summary only when the product supports restore/listing.
4. Preserve immutable snapshots, assignment payloads, and completed results.
5. Remove `/tests` only when that producer owns a compatibility bridge there.

Listening currently has one explicit exception: physical delete is fail-closed
until the approved audited deletion flow exists. `deleteListeningTestFromFirebase`
and Teacher Materials legacy-test deletion both reject Listening deletion before
any runtime or summary mutation. Save/update still write `summary-v1`.

Restore:

1. Validate canonical ownership and current projections.
2. Rebuild summaries from canonical data, never UI state.
3. Recreate active indexes idempotently.

## Consumer Contract

My Content reads active owned summaries at:

```text
material_catalog/material_summary_indexes/v1/by_owner/{teacherId}
```

It presents only published-test material kinds from that owner bucket.

Public Library reads active public summaries at:

```text
material_catalog/material_summary_indexes/v1/by_visibility/public
```

It presents only published-test material kinds from that public bucket.

Tabs, Test Types, skills, kinds, and search are filters over summary
collections. Dedicated Reading Passage and Book views must be derived views of
registered summary kinds rather than independent discovery authorities, but
they are not part of the My Content/Public Library published-test views.

Teacher preferences control presentation order only. They never determine
whether a material is discoverable.

Malformed, cross-owner, cross-visibility, or unsafe rows fail loudly. An
infrastructure or contract error must not be presented as a valid empty list.

## Permission Matrix

| Actor | My Content / `by_owner` | Public Library / `by_visibility/public` | Diagnostic buckets |
| --- | --- | --- | --- |
| Teacher owner | Reads and writes own active summaries. Includes the teacher's private and public materials. The bucket must contain active rows only. | Reads all active public summaries, including their own public materials. The bucket must contain active rows only. | Reads `by_id` only for active own summaries or active public summaries. |
| Teacher non-owner | Cannot read another teacher's private owned bucket. | Reads active public summaries from any owner. | Reads `by_id` only for public active summaries. |
| Super admin | Reads and writes all owner buckets for diagnostics, repair, and moderation. | Reads and writes all visibility buckets, with public Book create, update, and delete staying admin-only. | Reads and writes `by_id`, `by_material_kind`, and `by_test_type`. |
| Student | No access to Teacher Materials summary indexes. | No access to Teacher Materials summary indexes. | No access. |
| Unauthenticated | No access. | No access. | No access. |

The phrase "private material" means private to its owner, not globally visible
private content. My Content is an owner query. Public Library is a visibility
query. No teacher query may reveal a non-owner private summary.

## Compatibility Boundary

`/tests` remains available for consumers that require its runtime shape.

It must not be used to decide whether a material exists in Teacher Materials.
Migration may temporarily dual-read `/tests`, legacy material indexes, and the
versioned universal summary indexes for comparison. Versioned indexes prevent
strict v1 readers from sharing a bucket with legacy row shapes. The universal
summary count becomes listing authority only after reconciliation passes.

Reading V2 relationship indexes and legacy material/book indexes remain
runtime, relationship, archive, repair, or compatibility helpers. They are not
the universal material taxonomy.

Reading V2 `/tests` compatibility bridges are a separate parity concern from
the universal summary catalog. They may be inspected with
`repair:reading-v2-test-bridges` dry-run. Remote bridge writes require
`--write --approved <approval-id> --from-report <dry-run-report.json>` and must
match the reviewed dry-run operations exactly before a root multi-location
update is committed. Bridge repair keeps `/tests` runtime-compatible; it must
not become listing authority.

THCS runtime bridges are also separate from listing authority. Historical
Firestore `thcs_library` rows are not a valid My Content fallback because they
can contain only metadata and `sectionSummary`, with no runnable
`sections/questions` body. Use `repair:thcs-runtime-bridges` to backfill only
published `thcs_drafts` rows that have full sections into `/tests` plus
MaterialSummary v1. Metadata-only `thcs_library` rows are reported as
unbackfillable historical records, not shown as active tests. A removed
MaterialSummary `by_id` tombstone blocks repair from resurrecting stale THCS
draft or library sidecars; repair may only clean stale active fan-outs for that
test.

Writing runtime bridges follow the same boundary. Firestore `writing_drafts`
owns authoring state, while `/tests/{publishedTestId}` remains the runtime
compatibility row for published Writing tests and MaterialSummary v1 remains
the listing authority. A published draft with `publishedTestId` but no runtime
row and no summary fan-out is producer drift. Use
`repair:writing-runtime-bridges` to rebuild only complete published Writing
drafts into `/tests` plus MaterialSummary v1. Do not make My Content scan
Firestore `writing_drafts` or broad `/tests` to compensate. Removed
MaterialSummary `by_id` tombstones block repair from resurrecting stale Writing
draft sidecars.

## Rules

RTDB rules must:

- allow an owner to read only `by_owner/{auth.uid}` for My Content
- validate every `by_owner` and `by_visibility` row as `lifecycleState:
  'active'`; these list buckets must not store archived or removed rows
- allow teachers to read only `by_visibility/public` for Public Library
- allow teacher `by_id` reads only for active rows they own or active public
  rows
- allow owner lifecycle writes to create their own archived/removed `by_id`
  tombstones through the shared summary port, while keeping those inactive
  tombstones unreadable to teachers; archived and removed `by_id` rows are
  admin-readable diagnostics
- allow super-admin repair and diagnostics
- keep public Book summary create, update, and delete admin-only across every
  universal summary bucket
- validate summary schema and path-key identity
- validate `by_test_type/{testTypeId}` rows through
  `testTypeMembership.{testTypeId} === true`
- close each universal summary row with child validators and
  `$other.validate=false` so unknown fields such as `reviewPayload`, `content`,
  `aiReviewEvidence`, or future canonical payload fields cannot be smuggled into
  listing rows
- reject canonical payload, answer, scoring, provenance, and student fields
- provide indexes at the exact queried parent
- preserve canonical ownership fallback for stale-index cleanup

Rules deployment is separate from source implementation and requires emulator
proof plus live readback.

## Enforcement

CI must fail when:

- a producer claims `summary-v1` without contract version 1
- a producer id is unknown or duplicated
- material-kind taxonomy coverage is incomplete
- production code writes summary paths outside the shared port or approved
  repair/lifecycle modules
- summary rows contain unsafe or undefined fields
- a production Teacher Materials reader depends on obsolete
  `reading_v2/listing_indexes`
- a new producer has no registry entry and no lifecycle integration test

## Diagnostics And Repair

Runtime diagnostics report:

- query scope
- summary row count by producer, kind, Test Type, and skill
- malformed-row count
- canonical-to-summary drift count
- load and render duration

Diagnostics never include material bodies, answers, source URLs, or private
provenance.

Repair uses:

1. read-only canonical snapshots
2. deterministic expected summaries
3. current index snapshots
4. exact diff operations
5. reviewed dry-run report and digest
6. bounded multi-location update only after explicit approval
7. post-write readback

Active and archive indexes are reconciled separately. Read failures abort
repair.

Local command:

```bash
npm run repair:material-summaries -- --dry-run --project <project-id> --report <file>
```

Live repair requires explicit approval and a matching reviewed dry-run digest:

```bash
npm run repair:material-summaries -- --write --project <project-id> --approved <approval-id> --from-report <file>
```

## Migration Order

1. Establish summary module, registry, rules contract, and enforcement.
2. Migrate Books and Reading Passages.
3. Migrate Reading V2 full tests.
4. Migrate Writing, THCS-THPT, generic tests, and Listening save/update.
5. Backfill and reconcile all summaries.
6. Switch My Content and Public Library to universal summaries.
7. Remove `/tests` from listing code while retaining required runtime bridges.
8. Implement Listening audited physical delete before enabling that lifecycle
   operation.
9. Reconcile bounded `/tests` compatibility bridges only for runtimes that still
   require them, never as a listing-authority replacement.

Each producer migration requires publish, update, archive/remove, restore,
repair, rules, and consumer proof. A publish-only integration is incomplete
unless a lifecycle operation is explicitly unsupported and fails closed before
canonical state changes.

## Current Closure Evidence

- My Content reads `material_summary_indexes/v1/by_owner/{teacherId}` only and
  presents published-test material kinds only.
- My Content does not merge `users/{teacherId}/thcs_linked_tests`; linked or
  use-as-is THCS refs are not owned materials.
- Google Chrome proof after the owned-only correction for
  `hungnguyenzim@gmail.com` showed 24 My Content materials, 13 owned THCS rows,
  no linked/use-as-is THCS rows, no `Retake`, no `Linked` badge, and no console
  warnings/errors.
- Public Library reads `material_summary_indexes/v1/by_visibility/public` only
  and presents published-test material kinds only.
- Active dedicated Reading Passage and Book tab discovery also starts from
  `material_summary_indexes/v1` and hydrates feature-owned safe projections only
  where the specialized tab needs extra display fields.
- Producers registered as `summary-v1`: Reading V2 full tests, Reading V2
  passages, Books, Writing, THCS-THPT, generic tests, and Listening save/update.
- `/tests` remains runtime/legacy compatibility storage, not listing authority.
- Emulator proof must include universal summary schema validation and rejection
  of a valid summary written into the wrong `by_test_type` bucket.
- Reading V2 `/tests` bridge repair has the same reviewed-report write gate as
  summary repair and remains separate from listing authority.
- Approved material-summary live repair on 2026-07-07 used reviewed
  prewrite/write/postwrite reports under
  `output/material-summary-reconciliation/`; the prewrite report planned 204
  operations and postwrite verification reported zero remaining operations.
- Approved Reading V2 `/tests` bridge repair on 2026-07-07 used separate reports
  under `output/reading-v2-test-bridge-repair/`; the prewrite report planned 12
  bridge operations and postwrite verification reported zero remaining bridge
  operations.
- Approved THCS `/tests` bridge repair on 2026-07-08 used local reports under
  `output/thcs-runtime-bridge-repair/`; the prewrite report planned 3 runtime
  writes and 15 MaterialSummary writes, the approved write committed, and
  final-hardening corrective write committed 1 runtime write and 5
  MaterialSummary writes. Final postwrite verification reported zero remaining
  THCS bridge operations. Seventeen Firestore `thcs_library` metadata-only rows
  remained unbackfillable because no full published draft sections were
  available.
- Writing `/tests` bridge repair on 2026-07-08 used local reports under
  `output/writing-runtime-bridge-repair/`; the prewrite report planned 11
  runtime writes and 55 MaterialSummary writes, the write committed with
  `user-requested-proceed-2026-07-08`, and final postwrite verification
  reported zero remaining Writing bridge operations.
- Browser QA on `http://localhost:5173/lobby` after rules and approved repair
  showed My Content, Public Library, Reading Passage, and Book tabs rendering
  without permission errors or fake empty states.
- Browser QA after the Writing repair showed My Content as a published-test
  view with 7 owned rows for the Teacher Test account: 5 Reading V2 full-test
  rows plus 2 Writing rows. Reading Passage/Book rows remained excluded from My
  Content.
- Raw live repair reports and payloads can contain auth data, test bodies, or
  user content. Do not commit them unless a deliberately redacted artifact is
  needed for review.
- Browser QA on teacher class list/detail after the class normalization fix
  showed PRD-0055 fixture rows rendering without `Invalid Date` or
  `status.toUpperCase()` crashes.

## Live Rollout Gates

Do not call the universal listing cutover complete in a live project until all
of these are true for that exact project:

1. Live RTDB rules contain `material_summary_indexes/v1` and the closed-row
   `$other.validate=false` guards.
2. Browser QA on `http://localhost:5173` no longer shows `Permission denied` for
   My Content or Public Library.
3. Reconciliation dry-run has `readFailures=0`.
4. The dry-run report's operation digest is reviewed.
5. A live repair write is run only with explicit approval:

   ```bash
   npm run repair:material-summaries -- --write --project <project-id> --approved <approval-id> --from-report <file>
   ```

6. Post-write readback shows active owner/public summaries in v1 indexes.
7. Browser QA proves My Content has owned active published tests, Public
   Library has active public published tests, and Reading Passage/Book tabs show
   their own rows from summary-backed discovery.
8. Any required `/tests` compatibility bridge repair has a separate dry-run
   report, approval gate, post-write zero-op verification, and browser/runtime
   proof.

THCS bridge repair command:

```bash
npm run repair:thcs-runtime-bridges -- --dry-run --project <project-id> --report <file>
npm run repair:thcs-runtime-bridges -- --write --project <project-id> --approved <id> --from-report <file>
```

Writing bridge repair command:

```bash
npm run repair:writing-runtime-bridges -- --dry-run --project <project-id> --report <file>
npm run repair:writing-runtime-bridges -- --write --project <project-id> --approved <id> --from-report <file>
```
