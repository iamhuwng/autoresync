# PRD0062 ownership registry

This registry records current architectural roles and cross-ticket
reimbursements. Ticket numbers belong here rather than in the permanent goal.
Update this file whenever live ownership changes.

Status snapshot: 2026-08-10 (historical), 112 published tickets. Exact active
remaining ownership is canonical in the latest append-only section of
[remaining-implementation-reconciliation-2026-08-04.md](remaining-implementation-reconciliation-2026-08-04.md).
At that snapshot, effective planning additionally included the specific #127/51A
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

## 2026-08-10 owner references (historical baseline)

Populate and maintain this table from live GitHub contracts:

| Role | Current ticket | Verified at | Notes |
|---|---:|---|---|
| Mode and legacy owner | #25/01 | 2026-08-04 | CLOSED |
| Rollout-gate owner | #44/50A | 2026-08-04 | CLOSED; default deny remains active |
| Worker-integration owner | #59/09D | 2026-08-04 | CLOSED at dispatcher/composition boundary; #134 owns deployed drills |
| Integration baseline | #59/09D plus accepted producer provenance | 2026-08-04 | CURRENT S0; integrate accepted source, do not rebuild it |
| Acceptance-definition owner | #127/51A | 2026-08-04 | `HISTORICAL_REOPEN_REQUIRED_ARTIFACT`; superseded by the 2026-08-17 authority evidence |
| Shared Course/Class placement contract and Course vertical | #102/42A | 2026-08-05 | IMPLEMENTED_LOCAL_VERIFIED through `81194bd8`; no emulator/browser/deployed claim; contract is frozen for consumers |
| Class placement owner | #103/42B | 2026-08-09 | IMPLEMENTED_LOCAL_VERIFIED at `72c1b753`; active rules/authenticated browser/deployed proof remain downstream |
| Course/Class launch dispatcher | #104/42C | 2026-08-09 | IMPLEMENTED_LOCAL_VERIFIED at `4196c03f`, merged by `12951542`; localhost external boundaries are mocked |
| Public reference/fork owner | #106/44 | 2026-08-10 | `IMPLEMENTED_LOCAL_VERIFIED_ACCEPTED`; compatibility stabilization and the canonical fork writer/version-1 contract are merged through `5ac9ba9b`. Generated/active rules, authenticated browser, and deployed/canary proof remain with #118/#130/#134. |
| Remaining impact adapters owner | #107/39D | 2026-08-09 | IMPLEMENTED_LOCAL_VERIFIED through `16567771`; read-only only, no snapshot persistence |
| Impact snapshot owner | #108/39C | 2026-08-10 | `IMPLEMENTED_LOCAL_VERIFIED_ACCEPTED` at `94ddf39a`; immutable all-context snapshot, fingerprint/TTL, persistence/indexes, ownership denial, read projection, teacher review, and inactive `39C.json` are locally verified. No delivery mutation, generated-rules, browser-session, or deployed claim. |
| Update ledger/finalizer owners | #109/40A, #110/40C | 2026-08-10 | `IMPLEMENTED_LOCAL_VERIFIED_ACCEPTED`; #109 ledger at `63b9981c`, #110 post-commit finalizer at `b4d95e30`. No deployed proof. |
| Update case owners | #111–#114/40B–41C | 2026-08-10 | #112 `IMPLEMENTED_LOCAL_VERIFIED_ACCEPTED` at `1c30bf19`; #111/#113/#114 remain pending their ordered implementation lanes. No authenticated-browser or deployed claim. |
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

## 2026-08-16 native Windows ownership overlay (historical)

This append-only overlay records the native Windows checkpoint interpretation.
Later committed #126 browser evidence and the #127 source-conformance authority
supersede it where they conflict. In particular, the #126 `PASS` row below is
historical, not the active disposition; #126 remains blocked at the later
trusted-projection and rollback/readback boundary, and #128 remains held.

| Checkpoint owner | Historical checkpoint disposition | Evidence / boundary |
|---|---|---|
| #127 / 51A acceptance definition | `HISTORICAL_SOURCE_CONFORMANT_ARTIFACT_PRESENT_SEMANTIC_RERUN_BLOCKED` | `supporting/prd0062-v1-acceptance-matrix.json`, fixture manifest/module, schema validator, 15-test matrix suite, 6-test cleanup suite, and committed `evidence/51A-acceptance-authority-2026-08-12.json`; superseded by the 2026-08-17 authority evidence. |
| #111 / 40B, #113 / 41B, #114 / 41C | `IMPLEMENTED_LOCAL_VERIFIED_PENDING_FINAL_PROOF` | Current redo/removal/addition executors and focused Worker tests are present; final deployed/browser evidence remains downstream. |
| #115 / 45, #116 / 46A, #117 / 46B | `IMPLEMENTED_LOCAL_VERIFIED_PENDING_FINAL_PROOF` | Current replacement-plan, replacement-saga, and replacement-context source/test owners are present; no new product implementation is selected. |
| #118 / 09E, #120â€“#125 / 48Bâ€“49E | `IMPLEMENTED_OR_ACCEPTED_PENDING_FINAL_PROOF` | Accepted rules/recovery artifacts and current source are present; the representative production-normal recovery path is complete under the #126 handoff boundary. |
| #126 / 50B | `HISTORICAL_PRODUCTION_NORMAL_BROWSER_HANDOFF_PASS` | This checkpoint recorded teacher/student/Runtime PASS, active deployment identities, and no assignment replay; later browser evidence supersedes the PASS disposition. |
| #128 / 51B1 | `HISTORICAL_NEXT_ACCEPTANCE_OWNER` | This checkpoint selected final activated teacher authoring/assignment cases; the active disposition below keeps #128 held by #126. |
| #131 / 51C2 | `MANUAL_GATE_OPEN` | Automated accessibility/device slice passed; native screen-reader announcement/order verification remains outstanding. |
| #134 / 51E, #135 / 52A, #136 / 52B | `APPROVAL_GATED_DOWNSTREAM` | Integrated deployed drill, separately authorized remote measurement, and controlled pilot/release decision remain distinct owners. |

No current evidence selects a new generic adapter, recovery, or broad product
architecture owner.

## 2026-08-20 historical active-ownership checkpoint

This was the active override at the 2026-08-20 checkpoint. The 2026-08-23
overlay below is current.

| Owner | Active disposition | Authority |
|---|---|---|
| #111 / 40B, #113 / 41B, #114 / 41C | `IMPLEMENTED_LOCAL_VERIFIED_PENDING_FINAL_PROOF` | Current executors and focused tests are present; final deployed/browser proof remains downstream. |
| #126 / 50B | `BLOCKED_DEPENDENCY_AND_APPROVAL` | The latest browser packet failed the trusted teacher-projection row and rollback/readback requires reauthorization. No assignment replay is authorized. |
| #127 / 51A | `SOURCE_CONFORMANT_DEFINED_NOT_EXECUTED` | `evidence/51A-acceptance-authority-2026-08-17.json` records the source/registry/fixture-conformant matrix and semantic PASS. This accepts the definition; it does not claim the final suites executed. |
| #128 / 51B1 | `DEFERRED_FINAL_PROOF_HELD_BY_126` | The #127 definition prerequisite is corrected. Positive activated teacher acceptance remains held until #126 activation/readback succeeds. |

No current evidence selects a new generic adapter, recovery, or broad product
architecture owner.

## 2026-08-20 historical final Windows certification overlay

This append-only overlay records fresh local qualification on harness 3.7.0,
protocol 5, dependency-cache protocol 3. It does not replace the accepted
definition-only status of #127 or promote local proof to deployed activation.

| Owner | Certified disposition | Authority / boundary |
|---|---|---|
| Final Windows tooling | `PASS_LOCAL_FINAL_TOOLING` | `evidence/final-windows-certification-2026-08-20.json`: one user-scoped `run-windows-arm64-tools` 2.0.0 source, distinct repository guidance, 36/36 harness regressions, and selected Windows-source/WSL-execution Wrangler boundary. |
| #127 / 51A | `SOURCE_CONFORMANT_AND_LOCALLY_EXECUTED` | The frozen definition remains `SOURCE_CONFORMANT_DEFINED_NOT_EXECUTED` as historical authority; the final certification evidence separately records fresh schema, semantic, canary, coverage, local browser, emulator, recovery, build, and dry-run execution at the tested commit. |
| #128–#133 / 51B1–51D2 | `PASS_LOCAL_FINAL_TOOLING_BOUNDARY` | Teacher 4/4, student 5/5, security 93/93, recovery 1/1, and focused Worker update/recovery 24/24 passed locally with zero skips. This is not deployed/canary proof. |
| #126 / 50B | `BLOCKED_DEPENDENCY_AND_APPROVAL` | Unchanged. Local activation/rollback Wrangler dry-runs compiled; production activation, trusted readback, and rollback readback were not run. |
| #134 / 51E | `APPROVAL_GATED_DOWNSTREAM` | Unchanged. No deployed drill, remote mutation, or canary was performed. |

No historical WSL repository or worktree supplied source or execution evidence.

## 2026-08-23 #126 local reproduction overlay

| Owner | Active disposition | Authority / boundary |
|---|---|---|
| #126 / 50B | `LOCAL_RULE_ENFORCED_PASS_REMOTE_PROOF_BLOCKED` | `evidence/126-production-normal-rule-enforced-rerun-2026-08-23.json`: unchanged default composition passed 1/1 files and 4/4 tests with zero failed/skipped, including committed-row retention with unavailable derived completion. No assignment replay or remote mutation occurred. Remaining owner is exact deployed artifact/configuration/claims/rules/durable-state readback plus browser proof after Wrangler reauthorization. |
| #128 / 51B1 | `DEFERRED_FINAL_PROOF_HELD_BY_126` | Unchanged. Positive activated acceptance remains held until #126 exact deployment/readback/browser proof succeeds. |

No local product-code owner is selected by the #126 reproduction.

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

## Current #126 ownership overlay — 2026-08-23

The PRD0062 production-proof gate remains owned by the active recovery owner
until a complete deployed/browser acceptance result exists. The current
blocking boundary is the default Book Runtime document repository composition,
not the assignment owner, recipient projector, Firebase rules, or Hosting
artifact. The exact candidate was rolled back safely, so no ownership transfer
or product-source correction is implied by this finding.

Disposition: `BLOCKED_ROLLED_BACK`; evidence is
`evidence/126-production-proof-gate-2026-08-23.json` plus its redacted Markdown
companion. #128 and all later PRD0062 tickets remain held. No assignment replay,
new durable state, Listening work, or unrelated ticket work was started.

The earlier table row labeled as the active
`LOCAL_RULE_ENFORCED_PASS_REMOTE_PROOF_BLOCKED` disposition is now historical
pre-deployment context. This dated ownership overlay is the current
`BLOCKED_ROLLED_BACK` disposition and keeps the source-document composition
boundary as the next bounded owner; no transfer is implied.

## Append-only #126 correction-cycle ownership overlay — 2026-08-23

The Book source document default-composition seam remains the owning boundary
for the Web API key correction. The implementation and two independent reviews
passed; activation was rolled back only because the external browser-control
runtime was unavailable. No ownership transfer, assignment replay, durable
state change, Listening work, or later-ticket start is implied. Current status:
`BLOCKED_ROLLED_BACK`. Evidence:
`evidence/126-production-normal-document-composition-cycle-2026-08-23.json`.
