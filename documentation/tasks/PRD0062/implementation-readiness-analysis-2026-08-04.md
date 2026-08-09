# PRD0062 implementation-readiness analysis — 2026-08-04

Status: `CURRENT_PLANNING_AUTHORITY`

## 2026-08-05 execution update

Stage 0 passed. #102 then completed its full dependency chain—authority producer, storage primitive, fragment, Worker composition, Course consumer, migration/rollback, isolated progress/results, and focused verification—through `81194bd8`. Its status is `IMPLEMENTED_LOCAL_VERIFIED`; no emulator, authenticated-browser, deployed, or canary claim is implied. The frozen #102 placement contract now releases #103 Class/copy and #106 public reference/fork as independent S1 lanes. #104 still waits for #103 and remains only the thin Course/Class launch dispatcher.

## 2026-08-09 execution update

Historical snapshot, superseded by the 2026-08-10 execution update below.

The 2026-08-05 S1/S2 status above is superseded. #103, #104, and #107 are now
integrated and locally verified. #106 has a bounded safe compatibility
stabilization: retired Activity imports/helpers now use the canonical schema/
type model; reference, resolve, runtime, and migration paths are preserved
behind existing default-off gates; fork is
explicitly fail-closed with HTTP 503 before service/store access; and the
unused fork/reference panel is deleted. Focused #106 validation is green for
19 root + 6 Cloudflare tests; the shared projection validator remains green for
10 runtime-registry tests, and the adjacent regression is green for 44 root +
6 Cloudflare tests. This is
`SAFE_COMPATIBILITY_STABILIZATION_ONLY`, not #106 completion or acceptance,
because the canonical fork writer/version-1 contract was then absent. #108 was
blocked until that contract was reviewed and accepted. The aggregate baseline
and non-claims remain recorded in
[`evidence/post-104-integration-validation-2026-08-09.json`](evidence/post-104-integration-validation-2026-08-09.json);
the stabilization evidence is
[`evidence/106-compatibility-stabilization-2026-08-09.json`](evidence/106-compatibility-stabilization-2026-08-09.json).
Final rules, authenticated browser, deployment, activation, canary, cost, and
pilot proof remain with their existing owners.

## 2026-08-10 execution update

The 2026-08-09 #106 gate is superseded. Compatibility stabilization and the
canonical fork writer/version-1 contract are accepted through merge
`5ac9ba9b`; #108/#109/#110 are locally accepted at `94ddf39a`, `63b9981c`, and
`b4d95e30`; #112 is locally accepted at `1c30bf19`, completing the requested
serialized slice. #118's safe manifest/composer/conflict-validation
slice is accepted at `5e2b609d`; it may continue only that standing work and
must not claim final generated, assembled, or active rules before all producer
fragments are final. #135 refusal-safe local preparation is accepted at
`a155f55e`, merged by `9fc08ebe`; representative remote measurement remains
deferred until stable routes and #118 and requires separate remote-access
authorization.

This analysis revises how the whole remaining PRD0062 program is executed. It
does not make #100 a special case. #59, #100, and #101 are evidence of a
repeated planning failure: a ticket appeared graph-ready, implementation then
revealed missing producer integration, authority, composition, fixtures, or
proof infrastructure, and the ticket backtracked into adjacent foundations.

The product requirements remain unchanged. The correction is to expose and
schedule foundations before their consumers so implementation can proceed in
bounded, mostly linear stages.

## What the completed slices teach

| Observed pattern | Concrete evidence | Program-wide correction |
|---|---|---|
| A closed dependency was not necessarily consumable on the selected branch. | Accepted #100/#101 commits exist through `973ffa10` on `codex/prd0062-39b`, which is not an ancestor of the current checkout. | Add an integrated-baseline gate before selecting any remaining product ticket. Never rebuild an accepted producer merely because it is absent from the consumer branch. |
| A domain seam existed without its canonical production composition. | #59 and #100 had to return to exact Worker injection and committed Homework authority before the feature was usable. | Trace producer → factory/port → route → persistent authority → consumer before implementation and before closure. No unresolved or `undefined` enabled provider is acceptable. |
| Similar adapters were implemented before their common contract was complete. | #101's first adapter implementation was substantially rewritten to share a validation engine, exact route inputs, placement windows, and replacement scope. | Freeze the shared contract and all-case conformance matrix first; then implement disjoint adapters against it. |
| Aggregate proof was confused with producer-owned proof. | #100/#101 were temporarily blocked on #118 generated rules although their fragments and local harnesses were sufficient producer proof. | Domain tickets own fragments and focused local/emulator proof. #118 alone owns generated/assembled/active rules; #134 alone owns deployed/canary proof. |
| Broad baseline failures pulled work into the active ticket. | Missing rollout-gate, Wrangler, and source-authority modules predated #100 but initially looked like ticket blockers. | Capture parent/baseline health before feature edits. Classify pre-existing failures; do not repair them inside a ticket unless its owned output requires the repair and ownership is reconciled first. |
| A syntactically valid planning artifact could be semantically stale. | The current acceptance/coverage files mark Listening release-blocking, while accepted commit `a7522986` registers and tests the Listening adapters and accepted coverage matrix. | Reconcile #127's matrix with accepted source and add source-to-matrix conformance. Schema validation alone cannot close an acceptance-definition artifact. |
| Happy-path fixtures concealed authority and replay defects. | #100 needed committed-root, frozen-recipient, roster-drift, lost-acknowledgement, partial-fan-out, and replay fixtures before closure. | Every mutation ticket defines authority, crash, replay, rollback, stale-input, and cross-owner negatives before its vertical implementation. |

## Readiness is more than dependency closure

A ticket may be `GRAPH_CLEAR` but must not enter implementation until all of
these are true:

1. **Lineage:** every accepted producer commit and required generated artifact
   is reachable from the consuming baseline.
2. **Consumer trace:** all current readers, writers, indexes, projections,
   compatibility paths, and canonical routes for the changed data are named.
3. **Interface:** producer, consumer, exact port/factory, identity source,
   persistent roots, denial invariant, and rollback boundary are explicit.
4. **Composition:** the real production factory can instantiate the path once;
   enabled missing dependencies fail before mutation and disabled mode is lazy
   and deny-by-default.
5. **State matrix:** success, rejection, stale input, duplicate request, lost
   acknowledgement, partial completion, crash/restart, and rollback outcomes
   have one declared state transition each.
6. **Proof vector:** local, emulator, browser, preview, deployed, canary,
   rollback, and review evidence are separated and assigned to their owners.
7. **Harness health:** the intended tests are discovered in the correct runtime
   and fixture credentials/data are non-tautological and safely scoped.
8. **Baseline health:** pre-edit import/build/test-collection failures are
   recorded and classified so they cannot silently enlarge ticket scope.

Failure of any gate changes the item to `BLOCKED_READINESS`, names the missing
foundation and owner, and updates the plan before implementation continues.

## Mandatory Stage 0 — accepted integrated baseline

Stage 0 was the required implementation frontier and remains the baseline
acceptance record. It was planning/integration work, not permission to
reimplement closed tickets.

| Outcome | Canonical owner | Exit evidence |
|---|---|---|
| Inventory accepted closed-ticket commits and prove their ancestry in the chosen consumer branch. | Integration owner #59, with each closed producer retaining provenance | Machine-readable commit/required-path manifest; every required commit is reachable; no closed behavior is rebuilt. |
| Reconcile the #127/51A acceptance definition with accepted implementations, especially Listening adapters from `a7522986` and the personal timer from `ba8b2d59`. | #127/51A, status `REOPEN_REQUIRED_ARTIFACT` | Restored/rebuilt authoritative matrix, source/registry/fixture conformance checks, and validator results. The live issue stays published-closed until its artifact correction is formally accepted. |
| Prove module resolution, test discovery, Worker configuration shape, and required canonical factories before feature changes. | Integration baseline, not a product-feature owner | Baseline report identifying pass, pre-existing failure, owner, and whether each failure blocks the selected stage. |
| Inventory actual production routes, schemas/paths/indexes, rules fragments, fixtures, and evidence harnesses consumed by remaining work. | Planning/integration owner | Readiness packets for the next stage with no unnamed cross-ticket foundation. |

The Stage 0 block is satisfied. #102, #103, #104, #106, and #107 are locally
accepted. #108/#109/#110/#112 are locally accepted; no later case lane is implicitly dispatched.

Stage 0 must resolve these known branch/baseline contradictions without
silently assigning them to #102:

- accepted document authorization/streaming commits exist, while stale checkout
  paths can still show unauthenticated or `BOOK_SOURCE_R2` assumptions; prove
  #52/09A and #53/09B conformance after integration, and reopen only the exact
  false closure if the accepted implementation itself fails the PRD contract;
- binding unions mention Course/Class/public surfaces while current entitlement,
  issuer, attempt, and browser projections are narrower; #102's shared contract
  must name every extension point before #102/#103 writes begin;
- browser runtime calls, Worker route registration, and rollout/observability
  registries must be matched route-by-route so an implemented client cannot
  target an absent canonical handler;
- #119 must add the dedicated exact-version delete authority because existing
  provider adapters intentionally deny it; ordinary upload, document-read, and
  browser identities must never inherit deletion;
- final browser suites currently include intercepted contract responses. Those
  are reusable fixture-definition evidence, not product or deployed passes.

## Foundation map for every remaining cluster

| Tickets | Foundation pass that must finish first | Vertical work after foundation freeze | Avoided backtracking |
|---|---|---|---|
| #102–#104 | **Satisfied locally:** #102 froze the additive exact Course/Class Book placement contract; #103 consumed it for Class/copy; #104 composed the exact launch projections. | #102, #103, and #104 are locally verified. Active rules, authenticated browser, deployment, and activation remain downstream. | #103 did not invent a second binding model; bare-`materialId` readers remain legacy-only. |
| #106–#108 | #106's canonical public/fork contract and #107's bounded adapters are locally accepted. | Freeze #108's complete immutable all-context snapshot and TTL/fingerprint contract now. | No update executor discovers a missing context after mutation design starts. |
| #109–#114 | #109 first freezes the all-case update state machine, immutable choices, per-context/student ledger, shared ports, paths/fragments, and crash/replay matrix. #110 freezes one post-commit finalizer using #100. | Prove one simple non-redo handler (#112) against the shared port, then implement #111/#113/#114 in disjoint case modules. Shared ledger/schema edits stay serialized through #109/#110. | Four case tickets do not independently invent ledger, notification, retry, or fixture semantics. |
| #115–#119 | #115 freezes a read-only complete-context delta/token contract. #116 freezes one aggregate/item saga and single Firebase visibility point. #117 freezes context adoption/revocation; #119 alone owns exact retired-byte deletion. | Planner → saga → context UI/revocation → exact deletion. | Planning cannot mutate; Firebase+B2 atomicity is never assumed; bytes are not deleted before every consumer is revoked. |
| #118 | Create composer/manifest/conflict-validator scaffolding early and ingest each producer fragment continuously. | Final root generation, full emulator matrix, active hash/readback, legacy preservation, and rollback only after every producer fragment is final. | Producers are never blocked on the aggregate they feed, and late fragment conflicts are detected early. |
| #120–#125 | #120 inventories final canonical roots only after replacement/deletion roots stabilize. #121 freezes recovery envelope, dry-run/execute state, and side-effect suppression. | #122 authority/Delivery → #123 runtime/results → #124 updates/notifications/replacement/audit → #125 two-pass reconciliation. | Backup does not omit late roots; restore does not accidentally execute normal side effects; recovery order remains deterministic. |
| #126, #128–#136 | #127 source-conformant matrix and final producer contracts precede final-suite closure. #135 local preparation is accepted. | Fresh local suites → approval-gated activation where required → deployed/canary #134 → separately authorized remote cost proof #135 after stable routes/#118 → approval-gated pilot #136. | Expensive browser/remote work is not repeated against moving contracts, and local proof is not represented as deployed proof. |

Each foundation pass also freezes its observable event fields: route/surface,
context identity, actor, Book/Activity/Source versions, operation/ledger ID,
outcome/retry, affected counts, provider operation, rollback state, and redacted
error class. Domain tickets own emission at their seam; #126 owns truthful gate
and dashboard configuration; #134 owns deployed telemetry readback; #135 owns
cost/capacity measurements.

## Two-pass work packet for every ticket

### Pass A — foundation and review

- cite the exact PRD requirements and accepted decisions;
- list accepted producer commits and prove reachability;
- trace all producers and consumers before changing stored data;
- freeze types, schemas, paths, indexes, fragments, ports, and compatibility;
- define the complete success/failure/replay/rollback matrix;
- define fixtures and prove test discovery;
- assign each proof and downstream handoff to one owner;
- obtain contract review before persistent or shared-contract implementation.

### Pass B — bounded vertical

- implement only the frozen owned seam;
- compose it through the canonical production path;
- run focused contract/domain tests first;
- run local emulator/browser evidence only after the contract is stable;
- run broader stage regression at the synchronization point, not after every
  small edit;
- record exact downstream fragment, deployment, recovery, and final-suite
  handoffs before closure.

If Pass B discovers an unnamed shared foundation, stop. Reconcile its owner and
dependants, return to Pass A, and do not continue by borrowing scope from a
closed or adjacent ticket.

## Cost and iteration controls

- Use focused tests during ticket implementation and broad suites at stage
  joins. Re-run a broad failure only after classifying whether it predates the
  ticket.
- Stabilize shared contracts before parallel adapters or handlers. Parallelize
  verticals, not competing definitions of the same schema, authority boundary,
  generated source, or fixture authority.
- Prepare final-suite fixtures early, but execute expensive browser, emulator,
  deployed, and canary matrices only against stable producers.
- Keep #118 composition, #127 conformance, and #135 demand-model work as
  standing early-warning lanes without allowing them to claim final proof
  early.
- Escalate a newly discovered cross-ticket foundation into the plan at once;
  do not hide its cost inside the ticket that happened to discover it.

## Required synchronization decisions

1. **S0 integrated baseline:** accepted lineage, required paths, #127 artifact,
   baseline collection, and readiness packets agree.
2. **S1 placement contract:** the shared Course/Class placement contract is
   frozen before #102/#103 vertical parallelism.
3. **S2 complete context:** #102/#103/#106 outputs and #107 adapters are accepted
   before #108 freezes the authoritative impact snapshot.
4. **S3 update protocol:** #109/#110 contracts and one proving handler are
   accepted before the remaining case handlers parallelize.
5. **S4 replacement linearization:** all update cases and #115 plan are accepted
   before #116; #117 revocation precedes #119 deletion.
6. **S5 rules and recovery:** final fragments feed #118; #119 feeds the final
   #120 inventory; #125 and #118 both pass before activation.
7. **S6 stable local acceptance:** #128–#133 run against the integrated stable
   source and source-conformant #127 matrix.
8. **S7 remote decision:** #126, #134, and #136 remain distinct approval-gated
   remote stages; #135 independently proves the no-cost envelope.

This sequence is the implementation plan's readiness authority. The
[remaining-work reconciliation](remaining-implementation-reconciliation-2026-08-04.md)
retains ticket-level ownership and evidence details; the
[parallel plan](parallel-implementation-task-plan.md) is the dispatch order.
