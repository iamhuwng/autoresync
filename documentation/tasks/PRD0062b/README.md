# PRD0062b — Dormant Future Reimplementation Plan

Status: DORMANT_AFTER_CODE_RESET

> Read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md) first. This directory preserves approved decisions and dated evidence for future reimplementation. It does not describe current baseline implementation, deployment, task closure, or mutation authority.

Approved rebuild: 2026-07-13

## Preserved decision

Root Components 01–08 retain the recovered `9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd` hierarchy, with exact user-approved wording overrides recorded in `canonical-task-overrides.json`. On a separately approved future revival, re-audit and then execute packet by packet through the root component owners. Existing checkbox state is dated evidence only. Master/orchestration files only point to exact IDs; recovered snapshots remain evidence.

- Do not follow current documentation/tasks/PRD0062/** as implementation guidance.
- Preserve current PRD0062 documents, M1–M5 findings, handoffs, tests, and source as historical evidence.
- M1–M5 milestone labels no longer control status or sequence.
- Reassess any historical implementation before deciding whether it is safe to salvage.
- Execute only remaining open rows in canonical Components 01–08, packet by packet.

## Authority order

1. Current user-approved canonical PRD, `approval-record-2026-07-17-student-safe-full-pdf-streaming.md`, and `canonical-task-overrides.json`. The 2026-07-17 decision supersedes the 2026-07-14 one-page Source Delivery correction.
2. Approved Amendment from Git object 043a6d9b1f96a76f200ea753ca353e0376be65a7 where it does not conflict with the current decision.
3. Recovered `9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd` task hierarchy and wording where no approved override exists.
4. PRD0062b reconciliation ledger for recorded reorder, regroup, deferral, supersession and additive hardening.
5. Checkbox-free packet pointer for sequence and canonical Components 01–08 for executable boxes.
6. Accepted implementation audit for salvage status/evidence boundary.

Current source and fresh proof beat historical taskboxes or milestone claims.

## Preserved future-planning files

- tasks-book-activity-master-orchestration.md
- canonical-task-overrides.json
- check-canonical-plan.mjs
- tasks-book-activity-01-domain-security-foundation.md
- tasks-book-activity-02-source-pdf-delivery.md
- tasks-book-activity-03-book-assembly-workspace.md
- tasks-book-activity-04-activity-runtime.md
- tasks-book-activity-05-book-homework.md
- tasks-book-activity-06-updates-checkpoints-notifications.md
- tasks-book-activity-07-cross-feature-delivery-results.md
- tasks-book-activity-08-pilot-hardening-release.md

## Evidence and provenance

- approval-record-2026-07-13.md
- approval-record-2026-07-14-source-delivery-foundation.md
- approval-record-2026-07-14-conversation-decision-reconciliation.md
- approval-record-2026-07-15-p3-canonical-audit.md
- approval-record-2026-07-17-student-safe-full-pdf-streaming.md
- evidence/P3-canonical-audit-20260715.md
- authority-and-provenance.md
- implementation-audit.md
- reconciliation-ledger.md
- streamlined-prototype-orchestration.md
- correction-roadmap.md
- recovered/ — immutable clean master/component copies
- current documentation/tasks/PRD0062/** — historical evidence outside this workspace

## Future execution shape

1. P1 Activity foundation.
2. P2 Unit/page/source Assembly.
3. P3 Runtime/autosave/submission and Foundation Pilot gate.
4. P4 Homework → P5 results/review/integrity → P6 updates → P7 Course/Class → P8 public rights → V1 hardening.

No replay of M1–M5.

## Checkbox rule

- `[x]` means canonical row is fully accepted at stated evidence boundary.
- `[ ]` means implementation, correction, review, or required proof remains.
- Only root Components 01–08 own execution checkboxes; master, recovered, audit and ledger rows never close work.
- PARTIAL, IMPLEMENTED_UNVERIFIED, OFF_SPEC and FALSE_CHECKED stay open.
- Checked local salvage does not imply deployment, browser, pilot or Full V1 closure.
- Packet 3 inherited coverage was freshly audited on 2026-07-15: 42/95 executable leaf rows (`44.2%`) remain accepted; 30 leaf rows and parents `9.0`/`10.0` were reopened.

## Future restart point

After a fresh baseline audit and separate implementation approval, restart at **P2 — Unit/page/source Assembly**. Work only from revalidated dependency-ready rows in [Component 02](tasks-book-activity-02-source-pdf-delivery.md) and [Component 03](tasks-book-activity-03-book-assembly-workspace.md). P3 must not begin until a freshly proved P2 exit contract is accepted.

## Retained future platform direction

Retained future production direction:

- Firebase Auth and RTDB remain within the Firebase Spark tier;
- Cloudflare Workers and private R2 remain within their no-cost allowances;
- Page Groups and `physicalPageNumber` are page-to-Activity mapping/navigation metadata, not PDF transport objects;
- an authorized student receives one governed stream for the complete pinned student-safe PDF;
- private R2 authority, teacher-only/unsafe PDFs, answer keys, authoring data, and unpublished/unpinned Source Versions are forbidden;
- Browser Run, page rasterization, PDF splitting, derived page renditions, and per-page resource grants are not production dependencies;
- Firebase Hosting remains static only;
- Workers Paid, Cloudflare Containers, Firebase Blaze, Cloud Run, Cloud Build, Artifact Registry, Google Secret Manager, Firebase Functions, dynamic Hosting rewrites, and any other billed runtime or storage path are prohibited for this V1.

Missing compliant authenticated PDF streaming, remote readback, backup/rollback, quota proof, and emulator/browser proof remain open tasks. Failure to prove the no-cost path keeps P2 `CLOSURE_BLOCKED`; it does not authorize Browser Run or a paid fallback.

## Safety

- Do not edit current PRD0062 authority/evidence files during active-list execution unless separately requested.
- Do not use recovered checkbox state or summary prose as execution authority.
- No cloud mutation, deployment, staging, commit, push, destructive Git action, or worktree cleanup without separate authority.
