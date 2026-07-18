# PRD0062b Source Delivery Foundation Approval — 2026-07-14

> **Superseded in part on 2026-07-17:** the no-cost/private-storage boundary remains, but all one-page rendering, rendition, cache, and per-page grant decisions are replaced by [authenticated streaming of the complete pinned student-safe PDF](approval-record-2026-07-17-student-safe-full-pdf-streaming.md). This file remains decision history, not current Source transport authority.

## Decision

The user approved immediate correction of the PRD0062b product and task authority after review found that the original excerpt-limited design did not state the zero-cost and one-page transport decisions strongly enough.

The approved binding decisions are:

- production Book Source upload, processing, storage, rendition, and student delivery remain within Firebase Spark and Cloudflare Workers/private-R2 no-cost allowances;
- Workers Paid, Cloudflare Containers, Firebase Blaze, Cloud Run, and every other billed runtime or storage path are prohibited for this V1;
- the creator-selected Unit/Page Group physical-page union is the complete authorization and navigation set;
- cache and student transport deliver exactly one sanitized derived physical-page PDF artifact per request;
- students never receive the private original, a multi-page Unit PDF, or another full-source resource;
- the 50 MiB source limit is teacher-upload ingress authority only and does not justify whole-file student loading or paid production processing;
- local whole-document `pdf-lib`, Node child-process, or similar behavior is prototype evidence only;
- failure to prove a secure and recoverable no-cost production processor leaves P2 `CLOSURE_BLOCKED`; it does not authorize a paid fallback.

## Authority changes approved

The approval authorizes documentation-governance corrections inside `documentation/tasks/PRD0062b/`:

- strengthen the canonical PRD;
- rewrite affected direct task rows across Components 02–08;
- correct component phase labels and the active packet pointer;
- reopen any checked row whose accepted proof does not satisfy the stronger contract;
- expand traceability;
- strengthen semantic governance validation;
- record the exact approved wording overrides separately from immutable recovered snapshots.

C07 `1.4` is reopened because its prior checked evidence proved a broader excerpt boundary, not the corrected complete-page-set plus one-requested-page contract.

## Explicit non-approval

This approval does not:

- verify or close P2;
- authorize production implementation changes;
- authorize Cloudflare, Firebase, R2, DNS, IAM, secret, billing, or deployment mutation;
- authorize staging, commit, push, merge, destructive Git action, or cleanup;
- convert local, emulator, mock-browser, or static configuration evidence into deployed proof;
- waive backup/restore, rollback, sanitization, denial, quota, browser, or remote readback requirements.

## Current phase

- P1: `VERIFIED`.
- P2: `CLOSURE_BLOCKED`.
- Active P2 owners: Components 02–03.
- P3 must not begin from incomplete or unreviewed P2 behavior.
- C03, C04, C07, and C08 retain their existing bounded local evidence under `IMPLEMENTING`; this does not authorize dependent execution before its entry gate.

## Canonical records

- `prd-book-based-interactive-activity-runtime-and-assembly.md`
- `canonical-task-overrides.json`
- `tasks-book-activity-master-orchestration.md`
- `tasks-book-activity-02-source-pdf-delivery.md`
- `tasks-book-activity-03-book-assembly-workspace.md`
- `tasks-book-activity-04-activity-runtime.md`
- `tasks-book-activity-05-book-homework.md`
- `tasks-book-activity-06-updates-checkpoints-notifications.md`
- `tasks-book-activity-07-cross-feature-delivery-results.md`
- `tasks-book-activity-08-pilot-hardening-release.md`
- `traceability-book-activity-v1.md`
- `task-list-foundation-audit-2026-07-14.md`
- `check-canonical-plan.mjs`

## Verification at approval application

Commands executed from the repository root:

```text
node --check documentation/tasks/PRD0062b/check-canonical-plan.mjs
node -e "JSON.parse(require('fs').readFileSync('documentation/tasks/PRD0062b/canonical-task-overrides.json','utf8'))"
node documentation/tasks/PRD0062b/check-canonical-plan.mjs
```

Canonical validator result:

```text
8 governed components
748 task rows
65 approved wording overrides
1 checkbox override
exit 0
```

Additional scans returned zero matches for:

- stale P1 execution pointers in active README/master authority;
- `$0.05 per active student-hour`;
- `$0.25 per Unit`;
- `authorized Unit rendition <=25MiB`;
- `estimated backend cost`;
- `measured rendition cost`;
- trailing whitespace in the corrected authority files.
