# PRD0062b Canonical Packet Pointer

> **PRESERVED PREDECESSOR ORCHESTRATION.** The packet sequence, statuses, and
> Component owners below are historical. Current status, canonical ticket
> ownership, dependency order, and synchronization gates are in the
> [2026-08-04 reconciliation](../remaining-implementation-reconciliation-2026-08-04.md)
> and [parallel plan](../parallel-implementation-task-plan.md).

Historical validator marker retained verbatim: Status: CLOSURE_BLOCKED — current packet P2. It is not the live execution pointer.

Class: `EXECUTION_PACKET_POINTER`
Authority: packet sequence and dependency gates only
Not authority for: product decisions, checkbox ownership, proof classification, deployment, or release

> **NO EXECUTION CHECKBOXES IN THIS FILE.** Root Components 01–08 hold full 9e baseline wording and the only task status markers. This file points to exact task IDs and packet exits; it is not an implementation checklist.

## Authority references

- Current conflict winner for Source Delivery cost/transport: [`prd-book-based-interactive-activity-runtime-and-assembly.md`](../prd-book-based-interactive-activity-runtime-and-assembly.md), [`canonical-task-overrides.json`](canonical-task-overrides.json), and the [2026-07-17 student-safe full-PDF approval](approval-record-2026-07-17-student-safe-full-pdf-streaming.md).
- Approved amendment: [`prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md`](prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md), object `043a6d9b1f96a76f200ea753ca353e0376be65a7`, where it does not conflict with the later correction.
- Recovered baseline hierarchy: `9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd`; exact baseline wording applies only where `canonical-task-overrides.json` has no row override.
- Preserved former task owners: Components 01–08 in this directory.
- Evidence snapshots: [`recovered/`](recovered/). Never use recovered checkbox state as current status.
- Audit/evidence: [`implementation-audit.md`](implementation-audit.md), [`reconciliation-ledger.md`](reconciliation-ledger.md), and [`evidence/README.md`](evidence/README.md). These classify; they do not close task rows.

## Historical operating rule

The predecessor model implemented packet by packet. Its sequencing and proof-debt
rules remain provenance only; current work follows the live ticket graph and
2026-08-04 synchronization gates. Remote/deployment action still requires its
separate approval.

Every work order must quote exact current task wording from its Component file and cite the canonical PRD, applicable amendment sections, and `canonical-task-overrides.json` when the row is overridden. Summary prose, recovered rows, old M1–M5 labels, and implementation notes cannot authorize work.

## Sequential packet pointer

| Order | Packet boundary | Canonical task source | Entry condition | Exit condition |
|---:|---|---|---|---|
| P0 | Plan recovery and authority | README, provenance, ledger, PRD, amendment | Baseline/amendment graph verified | Full task owners and validator pass |
| P1 | Activity foundation | Component 01, all task rows | P0 verified | C01 rows/proof and amendment packet sections accepted |
| P2 | Unit/page/source Assembly | Components 02–03, all task rows | P1 data contracts and negative proof stable | C02/C03 source and publication-producer rows/proof accepted; private upload, immutable replacement, non-destructive detachment, student-safe Source readiness, trusted page-to-Activity publication, no-entitlement denial, and authenticated full-document streaming boundaries are proven inside Firebase Spark and Cloudflare Workers/R2 no-cost allowances. Runtime consumption, assignment, and entitlement issuance are later-packet owners; no Browser Run or paid fallback. |
| P3 | Runtime/autosave/submission | Component 04, all task rows | P2 producer interfaces and negative proof stable | C04 rows/proof accepted, including the minimum Solo/preview Book Delivery resolver, current-publication selection, current-entitlement activation/supersession, runtime consumer validation, and Integration Pilot decision |
| P4 | Book Homework | Component 05 rows in canonical file | P3 packet exit accepted | Homework rows/proof accepted, including whole-Book/subtree assignment, frozen bindings, and atomic assignment-derived entitlement activation/current-pointer proof |
| P5 | Results/review/integrity | Component 07 result/review rows; Component 05 integrity rows | P4 data contracts and negative proof stable | Result/integrity rows/proof accepted; no academic consequence from signals |
| P6 | Updates/checkpoints/notifications | Component 06, all task rows | P5 data contracts and negative proof stable | Update rows/proof accepted; idempotent retry and safe notification proof |
| P7 | Course/Class placement | Component 07 Course/Class rows | P6 data contracts and negative proof stable | Placement/access/progress rows/proof accepted; no bare `materialId` authority |
| P8 | Public publication and delivery | Component 07 public-publication rows | P7 data contracts and negative proof stable | Public-state/publication/entitlement/projection rows and student-safe full-document delivery proof accepted; no rights-attestation metadata or rights-specific revalidation |
| V1 | Full hardening/release | Component 08, all task rows plus retained rows | P1–P8 exits accepted | Full upload -> replace -> detach -> publish mappings -> assign -> entitle -> authorize/stream pinned student-safe PDF -> navigate mapped pages -> supersede/revoke lifecycle agrees across source/test/browser/remote/docs/task rows, with separate release approval |

Packet names are historical navigation only. Current ticket bodies own the
implementation delta; the canonical PRD owns product scope.

## Capability buildup and single-owner proof chain

| Capability | Foundation owner | Full implementation owner | Final proof owner |
|---|---|---|---|
| Private Source upload and immutable replacement | P2 / C02 | P2 / C02 | P2 deployed Source proof; repeated in C08 representative lifecycle |
| Source detachment, archive, and deletion semantics | P2 / C02 defines non-destructive detach and cleanup authority | P6 / C06 invalidates stale assignment resources after selected updates; trusted cleanup never deletes pinned/historical evidence | C08 lifecycle and post-cleanup readback |
| Unit publication and published-only producer projection | P2 / C03 | P2 / C03 | P2 producer/deployed proof; C04 separately validates consumption |
| Solo/preview entitlement and runtime consumption | P2 exposes interfaces and denial without entitlement | P3 / C04 Book Delivery selects current publication and activates/supersedes the current entitlement | P3 runtime/integration proof; C08 remote/browser lifecycle |
| Whole-Book/subtree assignment and Homework entitlement | P2/C03 exposes assignable published placements only | P4 / C05 freezes assignment bindings and atomically activates assignment-derived entitlements | P4 Homework proof; C08 lifecycle |
| Selective update and stale entitlement/resource revocation | P2/P4 preserve immutable pins | P6 / C06 | P6 update/retry proof; C08 lifecycle |
| Course/Class and other cross-feature delivery | Book Delivery interface from P3/P4 | P7 / C07 | P7 surface proof; C08 regression/release proof |
| Public playable delivery | P2 student-safe Source/publication/document-stream boundaries | P8 / C07 public publication and entitlement checks | P8 public proof; C08 browser/release proof |
| Complete product lifecycle | P1–P8 accepted owners | No duplicate implementation owner | C08 executes the complete lifecycle and reconciles every prior packet |

Assignment and entitlement creation are not P2 closure requirements. P2 must prove that private/unpublished/teacher-only Source data cannot be assigned or delivered directly, that no delivery succeeds without a valid downstream entitlement, and that the governed stream cannot expose private R2 authority or a Source Version other than the pinned student-safe document. Page Groups remain Activity mapping metadata, not document transport authorization. Rights attestation, rights metadata, and rights-specific publication/delivery revalidation are not requirements in any packet.

## Packet-exit contract

Each packet must retain these amendment-required sections, even when unchanged material is referenced:

1. storage and ownership;
2. security/rules and negative proof;
3. UI/actions/accessibility/announcements;
4. migration and compatibility;
5. direct tests, mutation tests, and adjacent regressions;
6. browser/runtime proof boundary;
7. authority/task-ID reconciliation;
8. evidence classification and acceptance record;
9. rollback/recovery and unresolved blocker record where risk applies.

`no delta` means stable reference to accepted evidence, never omission. Packet status remains separate from task-row status: `PLANNED`, `IMPLEMENTING`, `IMPLEMENTED_UNREVIEWED`, `REVIEW_BLOCKED`, `VERIFIED`, `CLOSURE_BLOCKED`, or `CLOSED`.

## Pilot transition

Foundation Pilot is a gate inside P3/P4, not Full V1 completion. After accepted pilot exit, pointer advances automatically to P4 unless a named blocker or explicit user pause exists. Later packets remain mandatory. Personal timer remains a retained Full V1 task after prototype; it is voluntary and academically/integrity inert.

## Stop conditions

- canonical task wording or amendment authority conflicts;
- task ID missing, duplicated, or owned by more than one Component;
- task row is checked without accepted evidence classification;
- parent row is checked while child row is open;
- packet contract section is missing rather than referenced;
- trust-boundary, CAS/idempotency, rollback, or negative proof is incomplete;
- local proof is presented as browser, remote, or deployed proof;
- a task, design, benchmark, or implementation permits private R2 authority, a teacher-only/unsafe PDF, an unpublished Source Version, or an unpinned document resource;
- a task, design, benchmark, or implementation permits Workers Paid, Cloudflare Containers, Firebase Blaze, Cloud Run, or another billed runtime/storage path;
- P2 lacks zero-billed-usage and free-quota-headroom proof for the agreed representative workload;
- cloud mutation, deployment, staging, commit, or destructive Git action lacks separate approval.

## Next pointer

Historical validator text retained verbatim: Current packet is P2. That pointer
is superseded for execution. #102, #103, #104, #106, and #107 are locally accepted on
the integrated lineage. #108 is the active primary serialized snapshot lane.
#118 remains limited to safe manifest/composer/conflict validation until all
producer fragments are final. Final rules, authenticated browser,
activation, deployment, canary, cost, and pilot gates remain deferred to their
named live-ticket owners.
