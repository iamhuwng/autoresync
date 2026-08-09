# PRD0062 remaining implementation reconciliation — 2026-08-04

Status: `CURRENT_IMPLEMENTATION_PLAN`

- Product authority: [canonical PRD](prd-book-based-interactive-activity-runtime-and-assembly.md).
- Ticket authority: the 112 published `PRD0062` GitHub issue bodies.
- Evidence authority: committed source, current repository artifacts, reproducible validation records, and qualified remote readback.

## Reconciled snapshot

- Live issue state: **112 total, 79 closed, 33 open**.
- Current live linked `Blocked by` graph: **251 unique edges**, no missing
  references, no duplicate references, no cycles, and complete 112-ticket
  coverage. The 2026-07-22 local cache is stale and must not validate current
  selection.
- Effective planning state: the 33 published-open tickets plus the specific
  #127/51A acceptance-artifact correction. This is not a broad reopening and
  does not change the published issue count until formally accepted.
- **#102 / 42A**, **#103 / 42B**, **#104 / 42C**, **#106 / 44**, and **#107 / 39D** are
  locally accepted at their bounded proof boundaries. #106's retired Activity
  imports/helpers and canonical fork writer/version-1 contract are accepted
  through merge `5ac9ba9b`. **#108 / 39C is now
  `IN_PROGRESS_PRIMARY_SERIALIZED`**; #127 source conformance remains an
  independent acceptance-artifact blocker.
- Graph-clear proof owners **#129–#133** may prepare fixtures and executables independently, but their final evidence is deferred until the behavior they verify is stable. A suite definition or an earlier baseline pass does not close a final proof ticket.
- The former 748-row Component 01–08 packet plan is retained as a requirement/provenance snapshot. Its statuses, checkboxes, P2 pointer, and 20–500-page/100–200-upload workload language are superseded for current execution by the canonical PRD and the 112-ticket plan.

### 2026-08-09 post-#104 integration update

Historical snapshot, superseded by the 2026-08-10 dispatch update below.

PR #139 merged #104 at `12951542`. The current lineage now contains the local
implementation slices for #103 (`72c1b753`), #104 (`4196c03f` plus governance
commit `a10acf7e`), #106 (`a92c8158`), and #107 (`17a42a0a`, `b5c33438`,
`16567771`). Aggregate evidence is recorded in
[`evidence/post-104-integration-validation-2026-08-09.json`](evidence/post-104-integration-validation-2026-08-09.json).

#103, #104, and #107 have bounded local proof. The #106 compatibility
stabilization repairs retired Activity imports/helpers against the canonical
schema/type model; reference, resolve, runtime, and migration paths are
preserved behind existing default-off gates.
Fork is explicitly fail-closed with HTTP 503 before service/store access, and
the unused fork/reference panel is deleted. This is
`SAFE_COMPATIBILITY_STABILIZATION_ONLY`, not #106 completion or acceptance:
the canonical fork writer/version-1 contract is absent. #108 remains blocked
until that contract is reviewed and accepted. No emulator,
authenticated-browser, generated/active-rules, deployed, canary, activation,
pilot, or Full V1 claim is made.

Focused compatibility validation is green for **19 root + 6 Cloudflare
tests**, plus **10 runtime-registry tests** for the shared projection validator. The evidence is recorded in
[`evidence/106-compatibility-stabilization-2026-08-09.json`](evidence/106-compatibility-stabilization-2026-08-09.json);
the adjacent production-adapter regression is also green for **44 root + 6
Cloudflare tests**. The evidence records the bounded local proof and the
remaining writer/contract gate only.

### 2026-08-10 dispatch update

#106's canonical writer contract is accepted through `5ac9ba9b`, so #108 is
unblocked and started as the primary serialized lane. #118 continues only safe
manifest/composer/conflict validation until all producer fragments are final.
#135 local refusal-safe preparation is accepted at `a155f55e`, merged by
`9fc08ebe`; final remote measurement waits stable routes, #118, and separate
remote-access authorization.

The integrated source branch is `codex/prd0062b-implementation` at merge commit
`12951542`; this reconciliation evidence is prepared on the isolated
`codex/prd0062-post-104-reconciliation` branch at that same tree. Accepted
closed-ticket implementation also exists on the reconciled source lineage. In
particular, #100 and #101 are accepted through `973ffa10`, which is reachable
from the integrated source branch. A consumer branch must contain accepted
producer commits before consuming them. This is an integration synchronization
gate, not authorization to rebuild closed tickets.

The systemic readiness rules, completed-slice lessons, and foundation-first
sequence for every remaining cluster are canonical in
[implementation-readiness analysis](implementation-readiness-analysis-2026-08-04.md).

## Ambiguous closure reconciliation

No completed product ticket is broadly reopened.

| Ticket | Reconciled state | Implementation and verification | Remaining disposition |
|---|---|---|---|
| #100 / 38C | `CLOSED_LOCAL_VERIFIED` | Accepted commits `850ed36b`, `026c401e`, `7b89d431`, `217ebc14`, and `973ffa10`; focused 6 files/41 tests; localhost student/RTDB-emulator emission, replay, read-state, denial, and rollback evidence. | Do not reimplement. #118 owns generated/active rules proof; #134 owns deployed/canary emission, cleanup, and operational rollback. Consumer branches must integrate the accepted commits. |
| #101 / 39B | `CLOSED_LOCAL_VERIFIED` | Accepted commits `759d597a`, `d1ec121a`, and `d387ecae`; root 3 files/76 tests, Cloudflare 1 file/5 tests, lint and changed-file type diagnostics pass. | Do not reimplement. #118 owns assembled/generated rules; #134 owns deployed/canary discovery. #107 consumes the accepted Solo/Homework adapter contract. |
| #59 / 09D | `CLOSED_INTEGRATION_OWNER` | Live issue closed after accepting the unique Worker composition seams, including the #100 committed Homework injection boundary. | Do not reopen for domain work. Future route additions remain contributions to its accepted dispatcher contract; #134 owns active deployed route/config readback. |
| #127 / 51A | `REOPEN_REQUIRED_ARTIFACT` | The published issue is closed and the current replacement matrix passes schema validation. However, its Listening rows claim the profile is unregistered while accepted commit `a7522986` contains registered, tested Listening adapters and the accepted activity-coverage matrix; accepted `ba8b2d59` supplies the personal timer. The closure-referenced `51a-acceptance.matrix.json` is absent from the current tree. | Do not reopen #41 or #78 and do not rebuild their behavior. #127 owns restoration/rebuild of the authoritative acceptance artifact plus source/registry/fixture conformance so a stale but schema-valid matrix cannot close. #128–#133 consume it only after correction. |

All other closed tickets remain closed at their recorded proof boundary. Downstream tickets must not promote local or feature-specific proof into generated-rules, deployed, canary, recovery, or release proof.

## Remaining ticket ledger

Each row has one canonical owner. “Existing” records built or defined work; “delta” is the only implementation/proof still scheduled. Closed producers named in prerequisites are accepted inputs, not work to repeat.

| Owner and PRD outcome | Reconciled status | Existing implementation and validation | Exact remaining delta; absorbed or superseded work | Effective prerequisites → consumers | Evidence required to close |
|---|---|---|---|---|---|
| **#127 / 51A** — §14 source-conformant Full V1 acceptance definition | `REOPEN_REQUIRED_ARTIFACT` | Published closed; current replacement matrix is schema-valid but says Listening is unregistered despite accepted `a7522986`, and its closure-referenced artifact is absent. Accepted `ba8b2d59` implements the timer. | Restore/rebuild one authoritative matrix and add source/registry/fixture conformance. Do not rebuild #41 Listening adapters or #78 timer. | S0 accepted lineage → #128–#134 | Exact accepted-source/registry/fixture inventory; semantic plus schema validator pass; deterministic fixture/cleanup and command manifest; review accepting the specific artifact correction. |
| **#102 / 42A** — §§7, 10 Course Book placement, preparation, isolated progress/results | `IMPLEMENTED_LOCAL_VERIFIED` | Frozen exact Course/Class placement contract; claim-scoped direct-enrolment authority; durable placement/release repository; accepted-publication catalog and immutable pins; guarded canonical Delivery issuance; exact `courseMaterialId` preparation; teacher/student components; duplicate-placement-safe result keys; Course result projection; all-required-Activity completion aggregation; explicit default-off Course-derived Homework credit; deny-only rollback. Commits through `81194bd8`; local evidence `evidence/102-course-placement-local-2026-08-05.json`. | No #102 product reimplementation remains. #103 consumes the shared contract for Class/copy; #104 owns only launch dispatch; #118 owns active rules; #130 owns authenticated browser proof; #134 owns deployed/canary proof. Presentation and Worker gates remain default-disabled until those owners complete. | Produces frozen contract for #103; Course projection for #104/#107/#130; fragment for #118 | Local domain/Worker/component/result suites passed. Missing emulator, authenticated browser, deployed, and canary evidence is explicitly deferred to #118/#130/#134 and is not a #102 implementation claim. |
| **#103 / 42B** — §§7, 10 Class Book placement, copy isolation, launch, progress/results | `IMPLEMENTED_LOCAL_VERIFIED` | Commit `72c1b753` implements copied-class identity, membership/owner authority, canonical Delivery, isolated progress/results, fragment, components, migration, and deny-only rollback against the frozen #102 contract. Aggregate Class anchors pass locally. | No product reimplementation remains. Active rules, authenticated Class entry/browser proof, deployed/canary proof, and activation remain with #118/#130/#134/#126. | #102 shared contract → #104, #107, #126, #130, #134 | Committed source and bounded local tests only; downstream proof classes remain open. |
| **#104 / 42C** — §§7, 10 shared Course/Class student launch dispatch | `IMPLEMENTED_LOCAL_VERIFIED` | Commits `4196c03f`/`a10acf7e`, merged by `12951542`, add the exact context-aware dispatcher and specialized runtime host. Focused application 77/77, Cloudflare 38/38, and real-route localhost Chromium 8/8 passed with external boundaries mocked. | No #104 product reimplementation remains. The localhost harness is composition evidence, not authenticated/deployed proof. Normal Class entry still requires #103's bounded exact-placement descriptor rather than inferred IDs. | #102 + #103 → #126, #130, #134 | Local exact Course/Class dispatch, wrong/expired denial, navigation/reload/mobile proof; authenticated/deployed owners remain open. |
| **#106 / 44** — §10 Content Catalog reference/fork and §11 public safety | `IMPLEMENTED_LOCAL_VERIFIED_ACCEPTED` | Compatibility stabilization plus canonical fork writer/version-1 contract are merged through `5ac9ba9b`; reference/resolve/runtime/migration remain behind default-off gates and producer fragment proof stays local. | No #106 product reimplementation remains. #118 owns generated/active rules; #130/#134 own authenticated/deployed proof. | S0 → #107, #108, #118, #134 | Accepted focused local proof only; no remote/deployed claim. |
| **#107 / 39D** — §§9–10 Course/Class/public impact adapters | `IMPLEMENTED_LOCAL_VERIFIED` | Commits `17a42a0a`, `b5c33438`, and `16567771` implement the shared bounded read-only discovery engine and Course/Class/public adapters with focused no-mutation and identity-boundary proof. | No snapshot persistence or mutation belongs here. #108 consumes the accepted adapter registry. | #102 + #103 + #106 → #108 | Bounded local adapter/read-budget/privacy/stale/no-mutation proof; no deployed claim. |
| **#108 / 39C** — §9 authoritative affected-context snapshot and review | `IN_PROGRESS_PRIMARY_SERIALIZED` | #42 classification, #101 Solo/Homework discovery, #106 public/fork, and #107 Course/Class/public adapter inputs are accepted; no durable complete-context snapshot or teacher review exists yet. | Freeze and implement immutable fingerprint/TTL snapshots and indexes, safe Worker projection, ownership denial, and teacher review UI. Mutation remains with #109–#117. | accepted #106/#107 plus closed #67/#68/#71/#101 → #109, #112–#115, #118 | Snapshot/repository/CAS/TTL tests; all-context completeness and stale/uncertain denial; read-only Worker proof; teacher browser review; fragment/local rollback. |
| **#109 / 40A** — §§9, 11 durable update action ledger | `BLOCKED_DEPENDENCY` | Trusted evaluation history (#89) and impact contract foundations exist; no update ledger/command exists. | Define immutable selected choices, snapshot revalidation, idempotent per-context/student state machine, resume/failure states, audit, and fragment. Case mutations stay in #111–#114; notifications stay #110. | #108 → #110–#116, #118 | Schema/repository/CAS/replay/crash tests; stale snapshot and unauthorized choice denial; bounded audit; local rollback/recovery behavior. |
| **#110 / 40C** — §9 persistent case-specific post-commit notifications | `BLOCKED_DEPENDENCY` | #100 provides the accepted Book emitter and deterministic recipient notification seam. | Build shared update finalizer: emit only after caller commit, zero/one case-specific row per recipient, resume partial fan-out, finish terminally. Do not own mutation decisions. | #109 + closed #100 → #111–#114, #117, #124 | Post-commit ordering, replay/lost-ack/partial-fan-out, frozen-recipient/privacy tests; local Bell journey; emission-disable rollback. Deployed proof remains #134. |
| **#111 / 40B** — §9 redo checkpoints, binding advance, completion recalculation | `BLOCKED_DEPENDENCY` | Runtime attempts/results/completion and update-ledger prerequisites exist separately; no redo executor exists. | Seal old work into at most one student checkpoint, atomically advance selected bindings, fence stale writes, recalculate completion, and resume without partial visibility. | #109 + #110 → #116, #118, #121 | Per-state matrix, CAS/replay/crash tests, no-duplicate checkpoint/notification proof, historical readback, teacher/student browser and rollback. |
| **#112 / 41A** — §9 display-only, reorder, and supported regrade | `BLOCKED_DEPENDENCY` | #89 evaluation history and semantic diff foundations exist; no update case executor exists. | Apply only selected non-redo cases while preserving answers, identity, eligibility, completion, and correction history. | #108 + #109 + #110 → #116, #129 | Classification matrix; unchanged-answer/identity/completion proof; regrade history and feedback visibility; browser review; idempotent rollback. |
| **#113 / 41B** — §9 removal and historical exclusion | `BLOCKED_DEPENDENCY` | Immutable history/result foundations exist; no removal update executor exists. | Remove selected Activity/subtree from current scope without deleting history, creating checkpoints, or reopening completed Homework. | #108 + #109 + #110 → #116, #129 | State-matrix and no-delete/no-reopen/no-checkpoint tests; historical result continuity; browser notification/fallback; idempotent replay. |
| **#114 / 41C** — §§8–9 additions and replacement deadlines | `BLOCKED_DEPENDENCY` | #87 effective-window policy exists; no addition/update executor exists. | Add selected required work, evaluate each student's effective window, require replacement deadlines where expired, and preserve existing extensions. No optional-addition policy may be invented. | #108 + #109 + #110 → #116, #129 | Deadline/time/extension matrix, per-student CAS/replay, completion and notification proof, teacher/student browser, rollback. |
| **#115 / 45** — §§6, 9 bounded PDF replacement planning | `BLOCKED_DEPENDENCY` | Immutable Source replacement, cleanup, Worker dispatch, and impact foundations exist; no ordered Source-Set delta planner/token exists. | Produce a read-only complete-context replacement plan and opaque bounded-TTL confirmation token for replace/split/add/remove/reassign operations; no mutation. | #108 + #109 (plus closed #50/#59) → #116, #118 | Delta validation, scope/fingerprint/TTL, stale/replay/authorization and no-mutation tests; teacher plan/review browser proof. |
| **#116 / 46A** — §§6, 11 durable replacement saga | `BLOCKED_DEPENDENCY` | Publication/update primitives exist independently; no aggregate replacement ledger or linearization protocol exists. | Execute one approved token with CAS aggregate/item states, one Firebase visibility point, crash resume, explicit #117 context and #119 delete delegation; never claim Firebase+B2 atomicity. | #111–#115 → #117, #118 | Saga state/property/crash/replay tests; publication/revocation visibility proof; malformed/stale/unauthorized denial; bounded audit and safe rollback. |
| **#117 / 46B** — §§6–7, 9 context adoption/invalidation and old-delivery revocation | `BLOCKED_DEPENDENCY` | Delivery revocation and update notification foundations exist separately; no complete replacement context resolver/UI exists. | Apply approved choices for every context, preserve Activity work, expose declined/unavailable states, revoke every retired document version, and show resumable status. | #110 + #116 → #118, #119, #129, #130 | Context matrix, exact pin/revocation/stale-resource negatives, resume/idempotency, teacher/student browser, no-history-loss and rollback proof. |
| **#118 / 09E** — §§11, 14 generated Book RTDB rules | `PARTIAL_STANDING_LANE_BLOCKED_FINAL_PRODUCERS` | Reconciled source lineage has versioned fragments from closed domain tickets, including `39B.json`, and fixed-slice builder patterns; no accepted all-fragment manifest/composer or generated-root proof exists. | Start manifest/path ownership, composer, and conflict/gap validation during S0/S1; ingest each fragment continuously. Generate the sole final `database.rules.json`, assembled emulator proof, active hash/readback, legacy preservation, and rollback only after all producers are final. | producer fragments continuously; final #108, #109, #111, #115–#117 → #126, #132, #134, #135 | Manifest/schema/composition tests throughout; final complete emulator matrix, deterministic diff, active hash/readback, exact rollback artifact, and legacy preservation. |
| **#119 / 47** — §§5–6 exact retired B2 version deletion | `BLOCKED_DEPENDENCY` | #50 handles failed/unfinished upload reconciliation; #43 removed PDF backup. Existing ordinary provider identities intentionally lack exact replacement-delete authority. | After #117 revocation, pass a pre-delete safety gate: immutable provider file/version identity, complete pinned-context/revocation readback, metadata-only recovery record, irreversible-effect boundary, and no remaining delivery. Then idempotently delete the exact B2 version, verify absence, and settle capacity only when terminal. Do not create backup bytes or broaden ordinary identities. | #117 → #120–#122 | Dedicated delete-identity and disposable-object tests; wrong-version/partial/retry/absence/capacity proof; pre-delete manifest; bounded remote readback/cleanup; irreversible rollback boundary recorded. |
| **#120 / 48B** — §§11, 14 metadata-only backup/restore inventory | `BLOCKED_DEPENDENCY_PREPARATION_ALLOWED` | Existing backup/restore services and a 2026-07-22 local baseline pass cover legacy/current metadata slices; future update/replacement/recovery roots and some Source metadata roots are absent. | Prepare candidate inventory/no-PDF assertions early for #119 safety, but freeze and close the exhaustive canonical inventory only after #119 and all final roots/indexes/ledgers exist. Earlier baseline evidence cannot close future roots. | final #119 + closed #43 → #121, #133 | Inventory completeness/schema tests against implementation; ETag-fenced restore; malformed/missing-root denial; no-PDF-byte proof; current local suite plus approved remote recovery evidence where required. |
| **#121 / 49A** — §§11, 14 recovery envelope and operation ledger | `BLOCKED_DEPENDENCY` | Generic restore fencing exists; no PRD0062 recovery-mode envelope/ledger exists. | Add deployment-only scoped envelope, dry-run/execute phases, expiry/idempotency, deterministic ledger, and suppression of normal fan-out. | #111 + #119 + #120 → #122–#125 | Envelope/schema/auth/expiry/replay tests; recovery-mode gate and side-effect suppression; audit/redaction; dry-run and rollback proof. |
| **#122 / 49B** — §§5, 7, 11 recover Source and Delivery | `BLOCKED_DEPENDENCY` | Canonical Source/Delivery validators and metadata restore foundations exist; no recovery adapter exists. | Restore validated authority and derive Source/Delivery while keeping delivery unavailable; never invent missing/deleted B2 bytes or entitlement. | #119 + #121 → #123, #125 | Missing-object, stale-pin, authority/order/idempotency tests; two-pass local restore; unavailable-until-phase proof; approved provider readback. |
| **#123 / 49C** — §§7–8, 11 recover runtime/results/completion | `BLOCKED_DEPENDENCY` | Runtime/result/completion repositories exist; no recovery-mode adapter exists. | Rebuild only from canonical exact bindings without executing student commands, scoring side effects, or terminal fan-out. | #121 + #122 → #124, #125 | Two-pass reconstruction hashes/counts; malformed/orphan denial; no command/notification side effects; result/history continuity. |
| **#124 / 49D** — §§6, 9, 11 recover updates/notifications/replacement/audit | `BLOCKED_DEPENDENCY` | #100 notification behavior is locally verified; update/replacement producers remain open. No recovery adapter exists. | Restore canonical action authority first, deterministically derive permitted effects, and suppress every external action until reconciliation. | #110 + #123 + closed #100 → #125 | Idempotent restore/replay, no duplicate notification/checkpoint/delete, replacement/audit continuity, suppressed-provider proof, failure recovery. |
| **#125 / 49E** — §§11, 14 deterministic recovery reconciliation | `BLOCKED_DEPENDENCY` | No orchestrator or complete two-pass final-root evidence exists. | Order #122–#124 phases, reconcile stable hashes/counts, execute two passes, and produce release-gate evidence with zero new external side effects. | #122 + #123 + #124 → #126, #133, #134 | Orchestrator tests; exact phase/readiness gates; two-pass equality; failure/resume; no side-effect ledger; recovery decision artifact. |
| **#126 / 50B** — §§2, 11, 14 truthful bounded activation | `BLOCKED_DEPENDENCY_AND_APPROVAL` | #44/50A default-deny scaffold is closed and remotely proven all-deny; capability/feature registries and allowlist validation seams exist. No positive pilot activation or enforcement across every trusted path is authorized/proven. | After #104/#118/#125, enforce the exact named-teacher/≤30-student/one-assignment scope in server-side create/upload/publish/assign/launch/mutation paths, then make registries/gates/observability truthful. Browser hints are not authorization. No partial release. | #104 + #118 + #125 → #128, #134 | Server enforcement and bypass negatives; registry/gate consistency; scoped identity/config readback; dashboards/alerts; positive/negative canary; rollback to all-deny. Remote mutation requires approval. |
| **#128 / 51B1** — §14 teacher authoring/assignment browser acceptance | `DEFERRED_FINAL_PROOF` | Ticket- and preview-level teacher browser artifacts exist, but no complete source-conformant 51A execution record exists. | Execute current Mode 2 creation, B2 source, Assembly, publication/revision, assignment/schedule/integrity configuration after activation; do not substitute older component proofs. | #126 + corrected #127 → #134 | Reproducible role journey, network/trace/screenshots, deterministic fixture cleanup, exact case manifest, zero skipped blocker. |
| **#129 / 51B2** — §§6, 9, 14 teacher update/replacement/results acceptance | `DEFERRED_FINAL_PROOF` | Suite definition exists; 2026-07-22 AC-TR attempt is `LOCAL_HARNESS_BLOCKED` before page inspection. No product pass. | Execute AC-TU/AC-TR only after #112–#117 are stable; refresh result proof. Earlier route interception cannot prove Worker/B2/Firebase state. | Effective: #112–#117 + corrected #127 → #134 | Current local browser pass with real owned services/fixtures, update/checkpoint/result/replacement assertions, artifacts and cleanup; deployed behavior remains #134. |
| **#130 / 51C1** — §§7–10, 14 student runtime/persistence acceptance | `DEFERRED_FINAL_PROOF` | Suite definition exists; earlier ticket-level runtime proofs are narrower. No complete AC-SR execution. | Run Solo/Homework/Course/Class, all Activity families, autosave/submit/results, schedules, notifications, replacement invalidation, and previous-version review after #104/#117. | Effective: #104 + #110 + #117 + closed #75 + corrected #127 → #134 | Current desktop student role suite; reload/network/trace evidence; exact context isolation and denial; artifact manifest and cleanup. |
| **#131 / 51C2** — §§7, 11, 14 accessibility/device acceptance | `DEFERRED_FINAL_PROOF` | AC-AD suite definition exists; no executed screen-reader/native zoom/device matrix pass. | Execute final keyboard, semantics, touch, overflow, focus, mobile widths, supported browsers/devices, and 200% behavior after Course/Class runtime composition stabilizes. | Effective: #104 + corrected #127 → #134 | Current browser/device matrix, accessibility assertions plus manual screen-reader/native-zoom record where required; screenshots/traces; no skipped blocker. |
| **#132 / 51D1** — §§11, 14 contract/security regression | `DEFERRED_FINAL_PROOF` | 2026-07-22 baseline artifact passed 28/28 after an earlier 22/26 failure. It predates open impact/update/replacement/generated-rule boundaries. | Run the complete final schema/service/Worker/generated-rules/emulator/security matrix after #118; retain the earlier failure as historical and baseline pass as local-only. | Effective: #118 + corrected #127 → #134 | Fresh machine-readable all-boundary pass; ancestor/root/cross-user/stale/replay/privacy negatives; assembled rules hash; no skipped blocker. |
| **#133 / 51D2** — §§11, 14 legacy/backup/recovery regression | `DEFERRED_FINAL_PROOF` | 2026-07-22 local baseline passed 26 files/209 legacy tests and 5 files/15 metadata tests. It predates #119–#125. | Rerun complete legacy, no-PDF-backup, final metadata inventory, and two-pass recovery after #125. Do not portray the baseline as recovery closure. | Effective: #125 + corrected #127 → #134 | Fresh machine-readable legacy/backup/recovery pass; two-pass equality; no restored PDF bytes or side effects; exact fixture cleanup. |
| **#134 / 51E** — §§11, 14–15 deployed drills and pre-pilot decision | `BLOCKED_DEPENDENCY_AND_APPROVAL` | Numerous feature tickets transfer deployed/canary proof here; no complete current drill or decision exists. #100/#101 transfers are explicit. | Execute bounded authenticated delivery, trusted mutations, updates/replacement/delete, notifications, recovery, observability and rollback; reconcile #128–#133 with no gaps. | #126 + #128–#133 → #136 | Current environment/commit/config/rules/gate/identity readback; redacted disposable drills; cleanup and rollback execution; explicit pass/fail decision. Remote mutation requires approval. |
| **#135 / 52A** — §§5, 11, 14 no-cost baseline harness | `LOCAL_PREPARATION_ACCEPTED_BLOCKED_REMOTE_MEASUREMENT` | Refusal-safe local baseline preparation is accepted at `a155f55e`, merged by `9fc08ebe`. | Do not repeat local preparation. Final representative measurement and headroom/billing decision wait for stable routes and #118 and require separate remote-access authorization. | final #118 + stable routes + closed #44/#49/#59/#76 → #136 | Accepted local safety/no-unintended-write proof; final remote Worker/B2/Firebase request/byte/latency envelope, zero billed use, and required headroom artifact remain open. |
| **#136 / 52B** — §§2, 5, 14–15 controlled production-operability pilot and final decision | `BLOCKED_DEPENDENCY_AND_APPROVAL` | No one-class production pilot or controlled-release decision exists. | After complete Full V1 acceptance, run one named teacher/≤30 students/one assignment with representative 500 MiB upload or replacement; measure account-wide capacity/cost/security/rollback; decide controlled deployment. | #134 + #135 → completion | Approved bounded pilot; actual telemetry and cap/billing readback; security/cleanup/rollback results; explicit release or fail/return decision. No broad rollout. |

## Dependency-based execution order

### Critical path

```text
S0 accepted integrated baseline + #127 artifact correction
  -> #102 shared Course/Class placement contract + Course vertical [LOCAL VERIFIED]
  -> (#103 Class vertical || #106 public vertical)
  -> (#104 launch || #107 adapters)
  -> #108 -> #109 -> #110 -> #112 proving handler
  -> (#111 || #113 || #114 || #115)
  -> #116 -> #117 -> #119
  -> #120 -> #121 -> #122 -> #123 -> #124 -> #125

final producer fragments -> #118
#104 + #118 + #125 -> #126
stable producers + corrected #127 -> final #128–#133 evidence
#126 + #128–#133 -> #134
#118 -> #135
#134 + #135 -> #136
```

The critical-path correction is foundation-first: accepted lineage precedes
consumption; one placement contract precedes Course/Class parallelism; one
update protocol and a proving handler precede parallel case executors. #104,
#118, and #125 join before activation. Final evidence joins at #134; #135 joins
at #136.

### Safe parallel lanes

1. **Stage 0:** accepted-lineage integration, #127 source conformance, and read-only baseline inventory may proceed concurrently on disjoint artifacts.
2. **Placement/reference verticals:** #102 and #103 are locally verified. #106's retired Activity compatibility is stabilized, but its canonical fork writer/version-1 contract remains gated for acceptance; it does not rewrite #102 authority.
3. **Context integration:** #104 launch composition and #106/#107 inputs are locally accepted. #108 is the active serialized snapshot lane.
4. **Update cases:** #109/#110 and the #112 proving handler freeze shared protocol first. Then #111/#113/#114/#115 may proceed in disjoint modules. Shared ledger/schema/route/fixture edits remain serialized.
5. **Standing lanes:** #118 may build composer/manifest/conflict checks and ingest fragments continuously without final generated/active claims. #135 local preparation is accepted; final remote measurement waits stable routes, #118, and separate authorization.
6. **Post-replacement:** after #119, #118 final composition and #120→#125 recovery may overlap where inputs and writes are disjoint. #129–#133 may prepare fixtures early, but final execution waits for stable effective producers and corrected #127 authority.

### Synchronization and deferred gates

- **S0 — accepted integrated baseline:** accepted producers are reachable, required paths resolve, #127 is source-conformant, parent failures are classified, and next-stage readiness packets pass.
- **S1 — placement/reference integration:** #102/#103/#106 are locally accepted; the gate is satisfied.
- **S2 — launch and adapters:** #104/#106/#107 are locally accepted. #108 is in progress and freezes one immutable complete-context snapshot.
- **S3 — update protocol:** #109/#110 and #112 prove one ledger/finalizer/case port before remaining handlers parallelize.
- **S4 — replacement linearization:** #111–#115 precede #116; #117 revokes all retired delivery before #119 deletes exact bytes.
- **S5 — recovery and rules:** #119 precedes final #120 inventory; #125 two-pass recovery and #118 generated/active rules both pass before #126.
- **S6 — stable local acceptance:** corrected #127 and stable producers precede final #128–#133 runs. Definitions, route interception, or earlier baselines do not close them.
- **S7 — remote decision:** #126, #134, and #136 remain separate approval-gated mutations; #135 independently proves no-cost capacity.
- **S8 — deferred local cleanup:** preserve the user-approved Markdown deletion set
  and remove the four obsolete PRD0062 local clones only after the reconciliation,
  clean-state, `origin/main` reachability, and junction-safety gates in
  [`deferred-local-cleanup-2026-08-08.md`](deferred-local-cleanup-2026-08-08.md)
  pass. This operational cleanup does not close or reopen a product ticket.

## Closure invariants

- Every published-open outcome has exactly one ticket owner above. The specific
  closed-artifact correction has exactly one owner, #127; it does not reopen
  #41/#78 implementation.
- #118 exclusively owns generated/assembled/active RTDB rules proof; domain tickets retain fragment-level proof.
- #134 exclusively owns integrated deployed/canary drills; feature tickets retain local/domain/browser proof explicitly assigned to them.
- #136 exclusively owns the bounded real pilot and final controlled-release decision.
- Local, emulator, preview, deployed, canary, and pilot states remain distinct.
- The complete PRD remains required. No pilot or proof ticket creates a partial product completion claim.
