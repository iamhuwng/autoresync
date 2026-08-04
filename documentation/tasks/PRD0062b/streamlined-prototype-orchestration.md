# PRD0062b Packet-by-Packet Orchestration

Status: IMPLEMENTING

> **NAVIGATION ONLY / NO EXECUTION CHECKBOXES.** Exact task wording and status live in root Components 01–08. This file contains packet pointers, dependency rules, and return transitions only.

## Authority

Baseline task bodies: `9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd`.
Approved conflict winner: `043a6d9b1f96a76f200ea753ca353e0376be65a7`.

Amendment packet contracts and sequential readiness override weaker 9e risk-scaled/parallel wording. Risk-scaled proof remains allowed inside a packet; mandatory contract sections remain present.

## Execution state machine

```text
P0 authority recovery
  -> P1 Activity foundation
  -> P2 Unit/page/source Assembly
  -> P3 Runtime/autosave/submission
  -> P4 Book Homework
  -> P5 Results/review/integrity
  -> P6 Updates/checkpoints/notifications
  -> P7 Course/Class
  -> P8 Public rights
  -> V1 hardening/release
```

Each transition requires prior packet data contracts, negative proof, canonical task reconciliation, packet-exit review, and named evidence acceptance. No interface is consumed by a later packet while its producer remains `IMPLEMENTED_UNREVIEWED` or `REVIEW_BLOCKED`.

## Exact task ownership map

| Packet | Canonical owner files | Scope reference |
|---|---|---|
| P1 | Component 01 | all C01 task rows |
| P2 | Components 02–03 | all C02/C03 task rows required by private immutable student-safe PDF upload, authenticated full-document stream/range delivery, Source Version integrity/lifecycle, Unit/Page Group/Placement mapping, import, repair, preview, stable publish-state reconciliation, and atomic publication; no Browser Run, splitting, rendition, or per-page grant dependency |
| P3 | Component 04 | all C04 task rows |
| P4 | Component 05 | C05 Homework rows; integrity rows remain P5 |
| P5 | Components 05 and 07 | C05 integrity rows and C07 result/review/visibility rows |
| P6 | Component 06 | all C06 task rows |
| P7 | Component 07 | C07 Course/Class placement rows |
| P8 | Component 07 | C07 public-rights/source-rights rows |
| V1 | Component 08 and retained rows | all C08 rows and any open retained row from C01–C07 |

Implementer must open linked Component file, locate exact task ID, and copy its complete wording into work order. This map never replaces task wording.

Additive scope row `C04-A-TIMER` belongs to V1 hardening and remains open until retained Full V1 timer proof/approval is complete.

## Prototype boundary

Prototype means P1–P3 plus one Foundation Pilot flow. It does not close P4–P8 or V1. Pilot flow may use deterministic private adapters only when proof is labelled local; shippable/deployed claims require approved production ingress, private excerpt delivery, browser proof, cleanup/retry proof, performance/cost evidence, and authoritative readback.

## Automatic continuation

After accepted pilot exit, transition to P4 automatically unless a named blocker or explicit user pause exists. Then continue P5, P6, P7, P8, and V1 in order. Deferral records must name exact task IDs, owner, return packet, return trigger, and proof boundary. Deferred rows remain open in canonical Component files.

## Proof economy inside packet

- narrow direct proof after each change;
- adversarial negative/mutation proof for authority, storage, CAS, idempotency, and state transitions;
- consolidated specification/code-quality/browser review at packet exit;
- no broad rerun without touched-risk reason;
- local, emulator, browser, remote, and deployed proof classes remain distinct.

## Non-actions

No current `PRD0062/**` edits. No use of recovered checkbox state. No Cloud Run/Build detour. No cloud mutation, deployment, staging, commit, push, destructive Git operation, or worktree cleanup.
