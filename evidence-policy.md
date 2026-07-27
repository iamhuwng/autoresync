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
| Route integration | #59 canonical dispatcher tests and deployed route probe |
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
- #72 owns server-side Delivery projection and pinned-identity proof; #73 owns
  the assembled Student proof of the current-pointer/student-safe projection.

Candidate-preview boundary:

- #63 proves candidate-scoped answer-safe projection/approval behavior, shared
  frame/registry parity, local handler security, isolated preview state, and
  fixture-safe teacher host behavior.
- #59 proves canonical preview/approval route composition, generic dispatcher
  enforcement, route readback, fail-closed probes, and route rollback.
- #128 proves activated teacher quick-login canonical-route browser journeys;
  #134 proves positive deployed/canary preview drills. Neither is a hard
  prerequisite of #63 producer closure.

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
