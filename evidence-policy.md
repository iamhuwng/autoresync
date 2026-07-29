# PRD0062 evidence policy

Evidence must match the requirement's owner, scope, and proof class. A narrow
green test never proves a broader browser, deployment, security, or rollback
claim.

## Evidence classes

| Class | Required evidence |
| --- | --- |
| Local contract | Focused unit/property/type tests plus source inspection |
| Fragment security | Static fragment tests and ticket-owned negative cases |
| Assembled rules | #118-generated rules artifact and complete emulator suite |
| Browser behavior | Real role port, required role/session, desktop/mobile or zoom states, visible outcome, console review |
| Route integration | #59 canonical dispatcher/publication-route tests and deployed route probe |
| Deployment | Preview/dry-run, active version/config/hash readback without secret values |
| Rollback | Executed disable/revert gate and preserved safe-read/legacy behavior |
| Deployed drill | Cross-suite deployed canary and pre-pilot decision owned by #134 |
| Pilot | Controlled one-class evidence and release decision owned by #136 |
| Final suite | Reproducible fixture set and machine-readable reconciliation owned by #128–#133 |

## Producer rule

Producer closure requires all producer-owned proof. It does not require
destination-owned composition, deployment, activation, or final-suite proof.
When a published contract mixes these classes:

1. add equivalent proof to the destination;
2. verify every phrase has one destination;
3. revise the producer contract;
4. rebuild the full graph;
5. retain the destination ticket open until its evidence passes.

Publication primitive boundary:

- #64 retains strategy-neutral schemas, CAS/replay/crash/rollback, bounded
  audit, durable Firebase RTDB publication repository, rules/emulator, and
  adapter-neutral Worker-boundary proof. It has no
  role-port or assembled-shell closure claim.
- #65/#66 own teacher-facing adapter publication proof for full-PDF and
  component-PDF strategies.
- #59 owns Full-PDF/component-PDF route descriptors, canonical handler binding,
  and injection of #64's durable Firebase publication repository. It does not
  own strategy behavior or activated positive publication drills.
- #72 owns server-side Delivery projection and pinned-identity proof; #73 owns
  the assembled Student proof of the current-pointer/student-safe projection.

Source-strategy migration boundary:

- #70 proves only unpublished Mode 2 migration: exact current Source Set and
  candidate pinning, explicit source-qualified local remaps, target owner/order
  validation, staged candidate preservation, CAS/idempotent confirmation or
  discard, reverse-flow safety, and local teacher browser behavior on
  `http://localhost:5173`. It consumes #55/13A fragment-level denial and
  #118 assembled-rules proof; it does not duplicate generated rules.
- #59 owns canonical dispatcher composition for the disabled migration route;
  #56/#32 supply current Book/Source Version authority; #118 owns assembled
  generated rules. #134 owns any positive deployed/canary migration execution,
  identity/config/version/hash readback, assembled-rules readback, pointer and
  context proof, cleanup, and operational rollback. No #70 proof enables #50A,
  #03B, trusted actions, private-B2, or deployed positive publication.

Published source-strategy successor boundary:

- #71 proves the published successor workflow locally: separate successor
  identity/publication lineage, reuse of #70 explicit source-qualified remap
  validation and #65/#66 immutable publication adapters, predecessor/context
  continuity, CAS/replay/crash/rollback, rules-fragment and impact-input
  boundaries, and teacher browser proof. It does not mutate the current
  publication or automatically switch registered contexts.
- #59 retains canonical route composition; #118 retains assembled generated
  rules; #73 owns assembled student predecessor-binding proof. #134 owns
  deployed/canary successor execution, identity/config/version/hash readback,
  cleanup, rollback, and recovery. #71 does not claim deployed proof.

Published mapping-revision boundary:

- #67 proves mapping-only publication locally: split/merge/reorder/default/
  reference mapping decisions, immutable Manifest/Unit revision, preserved
  Activity and Activity Version identities, stable Placement lineage, bounded
  impact input, source-assisted exact fresh-preview approval, stale/duplicate/
  unauthorized denial, common CAS/replay/crash/rollback behavior, disabled
  route/rules fragment, and teacher browser proof at
  `http://localhost:5173`. It does not reimport Activity records or claim
  durable production storage, canonical deployed composition, generated-rule
  deployment, trusted-action activation, private-B2, #50A, or #03B.
- #64 owns durable Firebase publication-repository implementation and
  conformance proof after repair. #59 owns canonical Full-PDF/component
  publication route descriptors, handler composition, and repository injection
  after repair. #118 owns assembled generated-rules proof; #134 owns positive
  deployed/canary publication, identity/config/hash, cleanup, rollback, and
  recovery; #73 owns assembled Student mapping/runtime proof. Each transferred
  gate remains destination-owned exactly once.

Activity-revision boundary:

- #68 owns local Activity-revision behavior and proof: complete replacement
  import, candidate/CAS/conflict recovery, semantic diff, source-assisted
  preview, immutable Activity Versions, stable Activity/Placement lineage,
  answer-safe projection, security, local Worker and fragment proof, teacher
  browser proof at `http://localhost:5173`, and local revision rollback.
- #118 owns the generated revision fragment, complete assembled emulator,
  active generated-rules hash/readback, generated-rules rollback, and legacy
  preservation. #134 owns the approved-activation deployed/canary revision
  publication, identity/config/version readback, cleanup, recovery, and
  emergency gate rollback. #73 owns assembled Student old-version/current-
  context proof. #68 does not claim deployed, activated, generated-root, or
  assembled-rules proof.

Candidate-preview boundary:

- #63 proves candidate-scoped answer-safe projection/approval behavior, shared
  frame/registry parity, local handler security, isolated preview state, and
  fixture-safe teacher host behavior.
- #59 proves canonical preview/approval route composition, generic dispatcher
  enforcement, route readback, fail-closed probes, and route rollback.
- #128 proves activated teacher quick-login canonical-route browser journeys;
  #134 proves positive deployed/canary preview drills. Neither is a hard
  prerequisite of #63 producer closure.

Runtime autosave boundary:

- #75 proves the browser autosave/resume state machine, registered-codec
  serialization, one-in-flight/CAS/retry/conflict behavior, approved local
  recovery storage, localhost:5174 browser flow, local Worker contract, and
  local rollback. It does not claim deployed or canary behavior.
- #134 owns the destination proof transferred from #75: authenticated
  deployed/canary Worker CAS against disposable runtime rows, production-shaped
  write/ack/payload/retry measurements, active identity/configuration and
  generated-rules readback, and deployed rollback that disables new launches or
  autosave while safe read/resume and local recovery remain available.
- #130 owns the later assembled all-family Student browser suite transferred
  from #75; #75's local browser proof remains limited to its focused fixture and
  client/state-machine contract.

Notification producer boundary:

- #95 retains local course/class/assignment/enrollment/course-announcement/
  deadline producer adapters, bounded trusted-command conformance, recipient
  authority derivation, deterministic operation identity, negative tests,
  compatible readers/read-state behavior, and disabled-route fail-closed proof.
- #97 retains the equivalent local Writing/THCS/session/monitor producer proof.
- #134 owns the transferred integrated staging/deployed/canary proof: each
  producer family persists through the #94 seam, readback proves recipient
  authority and idempotent replay, authenticated role surfaces render safe
  destinations and own read-state changes, and bounded cleanup/rollback leaves
  compatible readers available. This destination proof does not block producer
  closure and is not duplicated in #95 or #97.
- #59 owns generic route composition and deny probes; #94 owns the trusted
  command/repository seam; #118 owns assembled rules. No trusted route, #50A,
  #03B, private-B2, or production activation is enabled merely for producer
  proof.

## Browser cadence

- Teacher flows use `http://localhost:5173`.
- Student flows use `http://localhost:5174`.
- Use built-in quick-login controls unless a different role/account is
  explicitly required.
- Browser proof records route, role, viewport, fixture, actions, visible
  outcome, and console errors.
- Renderer producers retain focused component accessibility and responsive
  CSS/200% zoom proof. The structural shell owner proves authenticated
  quick-login, full runtime fixtures, navigation, browser-level zoom, route,
  Delivery, PDF transport, and assembled registry integration. Component tests
  must not claim launch, persistence, delivery, or shell behavior.

## Failure and blocker evidence

Record exact failing command or missing authority, owner, required action, and
impact. Environment failures before project code are harness evidence, not
product failure. Do not modify application dependencies to hide an ARM64/x64
native mismatch.

## Closure evidence

Before issue closure verify:

- ticket-owned diff only;
- focused tests and proportional regressions pass;
- required browser/deployment/rollback classes pass or are formally
  destination-owned;
- issue body/checklist and evidence comment agree;
- no secret values, unrelated dirty files, or unsupported activation entered
  the commit.

After closure, commit/push identifiers and the next 112-ticket graph hash become
part of the evidence record.
