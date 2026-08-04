# PRD0062 implementation task plan

Status: `CURRENT` as of 2026-08-05. Product authority:
[PRD](prd-book-based-interactive-activity-runtime-and-assembly.md). Readiness
authority:
[implementation-readiness analysis](implementation-readiness-analysis-2026-08-04.md).
Exact ticket ownership and proof contracts:
[remaining-work reconciliation](remaining-implementation-reconciliation-2026-08-04.md).

The published plan has 112 tickets: 79 closed and 33 open. One specifically
closed artifact owner, #127/51A, is `REOPEN_REQUIRED_ARTIFACT`; this does not
change the published count until formally accepted. Closed product behavior is
consumed from accepted commits and is never scheduled for reimplementation.

## Dispatch rule

“Graph-clear” is not “implementation-ready.” Every work order has two passes:

1. **Foundation pass:** prove accepted lineage; trace readers/writers and the
   canonical call chain; freeze types, schema, paths, indexes, fragments, ports,
   fixtures, state/failure matrix, proof classes, rollback, and handoffs.
2. **Vertical pass:** implement only the frozen seam, compose it canonically,
   and produce the ticket-owned focused/local evidence.

If a vertical discovers an unnamed cross-ticket foundation, stop the vertical,
assign the foundation and its consumers, and revise this plan before coding
continues.

## Current stage — S1 remaining parallel verticals

S0 exits passed. #102's shared placement contract and direct-Course vertical are locally verified through `81194bd8`. #103 and #106 are the active independent verticals; #104 waits for #103, while #118 may consume the inactive #102 fragment without claiming aggregate rules closure.

| Lane | Outcome | Exit |
|---|---|---|
| Primary integration | Integrate every accepted closed-ticket producer needed by #102 onward into the consuming baseline; especially retain #100/#101 from the accepted `codex/prd0062-39b` lineage. | Commit/path manifest proves ancestry and module availability; no accepted behavior rebuilt. |
| Acceptance authority | #127/51A repairs its acceptance artifact and adds source/registry/fixture conformance. | Matrix agrees with accepted Reading/Listening adapters and personal timer; schema and semantic conformance validators pass. |
| Baseline health | Collect imports/tests, validate Worker/config shape, enumerate canonical factories, rules fragments, schemas/indexes, and harnesses. | Every pre-existing failure has an owner/classification; next-stage readiness packets are complete. |

The historical S0 block is satisfied. Do not schedule #102 for reimplementation.

## Dependency stages

| Stage | Foundation first | Vertical work and safe parallelism | Synchronization exit |
|---:|---|---|---|
| S1 | **Satisfied producer:** #102 froze the shared exact Course/Class Book placement and compatibility contract and locally verified the Course vertical. | #103 Class/copy and #106 public reference/fork now run independently. #118 may ingest the inactive #102 fragment; #135 read-only demand modeling may proceed without final claims. | #103 and #106 each accept their identities, paths, fragments, migration/rollback, fixtures, and focused proof without rewriting #102. |
| S2 | #107 consumes #101's adapter contract; #104 consumes only the frozen #102/#103 launch projections. | #104 launch composition and #107 read-only impact adapters run in parallel. | Course/Class launches and complete bounded context-adapter registry accepted. |
| S3 | #108 freezes the immutable all-context impact snapshot, TTL/fingerprint, persistence, review, and denial contract. | One serialized contract lane. | No context is missing or uncertain before update design starts. |
| S4 | #109 freezes the complete update ledger/state matrix; #110 freezes one post-commit finalizer using #100. | Prove #112 as the first simple handler. Then #111, #113, and #114 may run in disjoint modules; shared ledger/schema edits remain serialized. #115 read-only replacement planning can proceed after #108/#109. | All update cases consume one ledger, notification, replay, and fixture contract; replacement token plan accepted. |
| S5 | #116 freezes the aggregate/item replacement saga and visibility point. | #116 → #117 context adoption/revocation → #119 exact retired-byte deletion. | All old deliveries revoked before exact provider deletion; deletion outcomes recorded for recovery/inventory. |
| S6A | #118 continuously ingests producer fragments and rejects conflicts. | Final generation/assembled emulator/active rules proof begins only after all fragments are final. | Deterministic generated rules, legacy preservation, active readback, and rollback accepted. |
| S6B | #120 inventories final roots after #119; #121 freezes recovery envelope and side-effect suppression. | #121 → #122 → #123 → #124 → #125 is sequential. It may run parallel with final #118 work where write boundaries are disjoint. | Stable two-pass recovery with zero external side effects. |
| S7 | #127 is source-conformant and all effective producers are stable. | #129–#133 may prepare fixtures earlier; final runs are ordered by their effective producers. #128 follows #126 by its contract. | Fresh local/browser/security/accessibility/recovery evidence with no skipped blockers. |
| S8 | #104 + #118 + #125 join at approval-gated #126. | #134 owns deployed/canary drills. #135 finalizes no-cost evidence independently. | Truthful activation, deployed rollback/cleanup, and no-cost decision evidence. |
| S9 | #134 + #135 join. | Approval-gated #136 bounded pilot only. | Explicit controlled-release or fail/return decision. |

## Critical path

```text
S0 accepted integrated baseline + #127 artifact correction
  -> #102 shared Course/Class placement contract + Course vertical [LOCAL VERIFIED]
  -> (#103 Class vertical || #106 public vertical)
  -> (#104 launch || #107 adapters)
  -> #108 complete impact snapshot
  -> #109 update ledger -> #110 finalizer -> #112 proving handler
  -> (#111 || #113 || #114 || #115)
  -> #116 -> #117 -> #119
  -> #120 -> #121 -> #122 -> #123 -> #124 -> #125

final fragments -> #118
#104 + #118 + #125 -> #126
stable producers + source-conformant #127 -> #128–#133
#126 + #128–#133 -> #134
#118 -> #135
#134 + #135 -> #136
```

The key correction is that parallelism begins after shared foundations freeze,
not merely because multiple issue nodes are graph-clear.

## Safe parallel lanes

- **S0:** lineage integration, #127 artifact conformance, and read-only baseline
  inventory may run concurrently if they do not edit the same planning or
  generated artifacts.
- **S1 verticals:** #103 Class/copy and #106 public work are now disjoint because
  #102's shared placement contract and Course producer are frozen.
- **Standing aggregation:** #118 may develop composer/manifest/conflict checks
  and consume fragments incrementally; it cannot generate final proof early.
- **Standing cost lane:** #135 may build the refusal-safe read-only demand model
  early; representative/final evidence waits stable routes and #118.
- **S2:** #104 runtime dispatch and #107 read-only discovery are independent.
- **S4 cases:** after #109/#110 and the #112 proving handler, case modules may
  parallelize. Any change to shared ledger, authority, schema, route registry,
  or common fixtures is serialized.
- **S6:** final rules composition and the recovery chain may overlap after their
  producer inputs are frozen. Final-suite fixture preparation is read-only and
  cannot close #128–#133.

## Synchronization and proof boundaries

- Each synchronization point runs focused producer tests plus one stage-level
  integration regression. Broad suites are not repeatedly run against moving
  contracts.
- #118 exclusively owns generated/assembled/active RTDB rules and rules
  rollback. Domain tickets own fragments and focused proof.
- #134 exclusively owns integrated deployed/canary drills, environment
  readback, cleanup, and operational rollback.
- #135 owns account-wide no-cost feasibility. #136 owns the bounded pilot and
  final decision.
- #126, #134, and #136 require explicit approval before remote mutation.
- Local, emulator, preview, deployed, canary, review-blocked, and pilot evidence
  remain distinct.
