# PRD0062 ownership registry

This registry records current architectural roles and cross-ticket
reimbursements. Ticket numbers belong here rather than in the permanent goal.
Update this file whenever live ownership changes.

Status snapshot: 2026-08-10, 112 published tickets. Exact
remaining ownership is canonical in
[remaining-implementation-reconciliation-2026-08-04.md](remaining-implementation-reconciliation-2026-08-04.md).
Effective planning additionally includes the specific #127/51A
`REOPEN_REQUIRED_ARTIFACT` correction; it does not transfer or reopen #41/#78
product implementation.

## Durable roles

| Role | Owns | Does not own |
|---|---|---|
| Mode and legacy owner | Mode selection, persistence, legacy fallback, immutability, mode fragment and focused proof | Generated rules, assembled deployment, broad activation |
| Provider/source owners | Provider contracts, source lifecycle, capacity, provider conformance, assigned disposable proof | Unrelated provider authority or broad activation |
| Domain owners | Functional behavior, trusted service contract, repository/CAS, domain descriptors/fragments, focused tests | Top-level composition, generated rules, broad final suites |
| Generated-rules owner | Deterministic composition, assembled emulator proof, active hash/readback, legacy preservation, rules rollback | Domain functional implementation |
| Worker-integration owner | Top-level dispatch, route composition, deployed domain identities, integration readback and rollback | Domain handler behavior |
| Rollout-gate owner | Default-deny trusted-action scaffold and rollback-to-deny behavior | Durable pilot activation |
| Runtime/launch owners | Final runtime behavior assigned by their contracts | Unrelated authoring or activation authority |
| Activation owner | Approved pilot scopes, positive production capability, activation readback and rollback | Domain implementation |
| Final-suite owners | Broad browser, security, accessibility, recovery, and reconciliation matrices | Replacing focused domain proof |
| Acceptance-definition owner | Source-conformant Full V1 case/fixture/command matrix and semantic validator | Reimplementing accepted product behavior or claiming suite execution |
| Integration-baseline owner | Accepted-commit ancestry/path manifest, module/test discovery, canonical composition inventory, and parent-failure classification | Repairing unrelated closed-ticket behavior inside a consumer ticket |

## Current owner references

Populate and maintain this table from live GitHub contracts:

| Role | Current ticket | Verified at | Notes |
|---|---:|---|---|
| Mode and legacy owner | #25/01 | 2026-08-04 | CLOSED |
| Rollout-gate owner | #44/50A | 2026-08-04 | CLOSED; default deny remains active |
| Worker-integration owner | #59/09D | 2026-08-04 | CLOSED at dispatcher/composition boundary; #134 owns deployed drills |
| Integration baseline | #59/09D plus accepted producer provenance | 2026-08-04 | CURRENT S0; integrate accepted source, do not rebuild it |
| Acceptance-definition owner | #127/51A | 2026-08-04 | REOPEN_REQUIRED_ARTIFACT; source/registry/fixture conformance missing |
| Shared Course/Class placement contract and Course vertical | #102/42A | 2026-08-05 | IMPLEMENTED_LOCAL_VERIFIED through `81194bd8`; no emulator/browser/deployed claim; contract is frozen for consumers |
| Class placement owner | #103/42B | 2026-08-09 | IMPLEMENTED_LOCAL_VERIFIED at `72c1b753`; active rules/authenticated browser/deployed proof remain downstream |
| Course/Class launch dispatcher | #104/42C | 2026-08-09 | IMPLEMENTED_LOCAL_VERIFIED at `4196c03f`, merged by `12951542`; localhost external boundaries are mocked |
| Public reference/fork owner | #106/44 | 2026-08-10 | `IMPLEMENTED_LOCAL_VERIFIED_ACCEPTED`; compatibility stabilization and the canonical fork writer/version-1 contract are merged through `5ac9ba9b`. Generated/active rules, authenticated browser, and deployed/canary proof remain with #118/#130/#134. |
| Remaining impact adapters owner | #107/39D | 2026-08-09 | IMPLEMENTED_LOCAL_VERIFIED through `16567771`; read-only only, no snapshot persistence |
| Impact snapshot owner | #108/39C | 2026-08-10 | `IMPLEMENTED_LOCAL_VERIFIED_ACCEPTED` at `94ddf39a`; immutable all-context snapshot, fingerprint/TTL, persistence/indexes, ownership denial, read projection, teacher review, and inactive `39C.json` are locally verified. No delivery mutation, generated-rules, browser-session, or deployed claim. |
| Update ledger/finalizer owners | #109/40A, #110/40C | 2026-08-10 | #109 `IN_PROGRESS_PRIMARY_SERIALIZED`; #110 remains blocked by #109. |
| Update case owners | #111–#114/40B–41C | 2026-08-04 | BLOCKED by the shared ledger/finalizer |
| Replacement owners | #115–#119/45–47 | 2026-08-04 | BLOCKED by update/impact producers |
| Generated-rules owner | #118/09E | 2026-08-10 | `PARTIAL_STANDING_LANE_BLOCKED_FINAL_PRODUCERS`; safe manifest/composer/conflict validation accepted at `5e2b609d`. No final generated/assembled/active rules claim until all producer fragments are final. |
| Recovery owners | #120–#125/48B–49E | 2026-08-04 | BLOCKED by replacement and prior recovery stage |
| Activation owner | #126/50B | 2026-08-04 | BLOCKED; remote mutation approval required at execution |
| Final-suite owners | #128–#133/51B1–51D2 | 2026-08-04 | DEFERRED_FINAL_PROOF; definitions/baselines do not close suites |
| Deployed-drill owner | #134/51E | 2026-08-04 | BLOCKED; remote/canary approval required at execution |
| No-cost harness owner | #135/52A | 2026-08-10 | `LOCAL_PREPARATION_ACCEPTED` at `a155f55e`, merged by `9fc08ebe`; final representative remote measurement remains blocked by stable routes + #118 and requires separate remote-access authorization. |
| Pilot/release-decision owner | #136/52B | 2026-08-04 | BLOCKED; explicit pilot approval required |

Do not infer current ownership from historical handoffs. Verify against live
ticket bodies before changing the registry.

## Transfer ledger

Add the destination requirement before marking a transfer complete.

| Status | Source | Destination | Requirement | Proof class | Reason | Destination evidence |
|---|---:|---:|---|---|---|---|
| SOURCE_REVISED | #100/38C | #118/09E | Generated/assembled notification rules, active hash/readback, rules rollback | emulator + deployed rules | Keep feature ticket local boundary exact | `38B5.json`; destination acceptance in #118; proof pending |
| SOURCE_REVISED | #100/38C | #134/51E | Integrated deployed/canary Book notification replay, role journey, cleanup, rollback | deployed/canary | Local feature proof cannot claim deployment | Destination acceptance in #134; proof pending |
| SOURCE_REVISED | #101/39B | #118/09E | `39B.json` generated/assembled rules and rollback | emulator + deployed rules | Remove circular closure dependency | Destination acceptance in #118; proof pending |
| SOURCE_REVISED | #101/39B | #134/51E | Positive deployed/canary impact discovery and rollback | deployed/canary | Keep #101 local/read-only proof scoped | Destination acceptance in #134; proof pending |
| DESTINATION_ADDED | #102/#103/#106 | #118/09E | Course/Class/public domain fragments in generated rules | emulator + deployed rules | One generated-root owner; producer fragments are implemented but inactive | Destination acceptance in #118; aggregate proof pending |
| DESTINATION_ADDED | #102/#103/#106/#108 | #134/51E | Positive deployed context and impact drills | deployed/canary | Domain tickets retain local proof only | Destination acceptance in #134; #108 source row remains open |

Allowed status:

- `PROPOSED`: ownership problem identified;
- `DESTINATION_ADDED`: equivalent destination acceptance exists;
- `SOURCE_REVISED`: source requirement narrowed or removed;
- `PROVEN`: destination evidence satisfies the reimbursed requirement.

No transfer is complete until destination acceptance exists and the source
contract has been reconciled. No requirement may be silently dropped or proven
twice by conflicting owners.

## Contribution map

Record producer/consumer relationships separately from hard prerequisites:

| Producer | Artifact or contract | Consumer | Integration proof owner |
|---|---|---|---|
| #100/38C | Trusted Book notification emitter and committed-action adapter | #110, #124 | #110 local update finalizer; #134 deployed drill |
| #101/39B | Solo/Homework impact adapters and registry contract | #107, #108 | #108 snapshot proof |
| #102/42A + #103/42B | Exact Course/Class placement projections | #104, #107, #130 | #104 launch composition; #130 final student suite |
| #106/44 | Accepted public reference/resolve/runtime/migration and canonical fork-writer contract, preserved behind default-off gates | #107, #108 | #108 complete-context snapshot |
| #108/39C | Immutable all-context impact snapshot | #109, #112–#115 | #109 ledger integration |
| #109/40A + #110/40C | Shared update ledger and post-commit finalizer | #111–#117 | Case-owner focused proof, then #129 |
| #116/46A + #117/46B | Replacement saga and context revocation | #119–#125 | #134 deployed lifecycle drill |
| #118/09E + #125/49E | Active rules and stable two-pass recovery | #126 | #126 activation proof |
| #128–#133 | Final local/browser/security/recovery matrices | #134 | #134 evidence reconciliation |
| #134/51E + #135/52A | Pre-pilot decision and no-cost envelope | #136 | #136 pilot/release decision |
| #127/51A | Source-conformant acceptance matrix and deterministic fixture authority | #128–#134 | #127 semantic conformance; consumers execute cases |

A contribution relationship becomes a hard dependency only when the consumer's
owned implementation cannot proceed without the producer's output.
