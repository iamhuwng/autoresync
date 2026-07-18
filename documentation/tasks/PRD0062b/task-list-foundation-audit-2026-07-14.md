# PRD0062b Task-List Foundation Audit — 2026-07-14

> Historical audit. Its one-page transport decision was superseded by [the 2026-07-17 student-safe full-PDF streaming approval](approval-record-2026-07-17-student-safe-full-pdf-streaming.md). Preserve this file as decision history, not current execution authority.

## Verdict

`AUTHORITY_CORRECTED — IMPLEMENTATION STILL CLOSURE_BLOCKED`

The canonical PRD now makes the following product decisions binding:

- production Book Source upload, processing, storage, rendition, and student delivery stay within Firebase Spark and Cloudflare Workers/private-R2 no-cost allowances;
- Workers Paid, Cloudflare Containers, Firebase Blaze, Cloud Run, and other billed runtimes are prohibited;
- the creator-selected Unit/Page Group union is the complete authorization/navigation set;
- each student request receives exactly one sanitized derived physical-page PDF artifact;
- the private original, multi-page Unit PDF, and full-source resource are never student delivery resources;
- failure to prove a compliant no-cost processor leaves Source Delivery `CLOSURE_BLOCKED` rather than authorizing a paid fallback.

The canonical task authority has now been aligned with those decisions. Packet 2 remains `CLOSURE_BLOCKED` because the compliant no-cost production processor, deployed one-page delivery, denial/recovery proof, browser evidence, and zero-billed/free-quota readback are still absent.

This correction changed documentation authority only. It reopened C07 `1.4` because its previous checked proof covered the older broad excerpt contract. No implementation, deployment, commit, or closure claim is made.

## PRD foundation edit completed

Canonical file:

`documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly.md`

The binding decisions now appear in:

- required product outcome 6;
- quality goals;
- non-negotiable architecture rules 8 and 48–51;
- Section 15.2 Authorized Unit rendition;
- Section 15.3 Backend boundary and cost ceiling;
- shippable-pilot validation;
- V1 runtime and quality acceptance criteria;
- unresolved technical validation items;
- definition of done.

Validation:

- `node documentation/tasks/PRD0062b/check-canonical-plan.mjs`
- exit `0`;
- reported 8 full-wording Components and 748 canonical task rows.

The checker now enforces structural recovery/count authority plus 65 approved task-wording overrides, the reopened C07 `1.4` checkbox, governed component statuses, the P2 pointer, required one-page/zero-billed authority text, and forbidden nonzero monetary budget wording.

## Raw task-list state

Counts below are raw checkbox counts in each canonical Component file, including parent and additive evidence-hardening rows. They are not a replacement for canonical task-ID accounting.

| Component | Declared status | Checked | Open | Audit state |
|---|---:|---:|---:|---|
| C01 Domain/Security | `VERIFIED` | 90 | 0 | Status consistent with current file |
| C02 Source PDF Delivery | `CLOSURE_BLOCKED` | 46 | 40 | Correct broad status; canonical row wording still needs direct correction |
| C03 Assembly | `IMPLEMENTING` | 62 | 15 | Local Assembly foundation retained; exact P2 blockers remain |
| C04 Runtime | `IMPLEMENTING` | 76 | 31 | Local runtime foundation retained; new work waits for corrected P2 producer exit |
| C05 Homework | `PLANNED` | 5 | 78 | Five checked rows are inherited non-Book regression evidence |
| C06 Updates/Checkpoints/Notifications | `PLANNED` | 2 | 103 | Two checked rows are inherited generic regression evidence |
| C07 Cross-feature Delivery/Results | `IMPLEMENTING` | 11 | 89 | C07 `1.4` reopened; other bounded local delivery/result evidence retained |
| C08 Hardening/Release | `IMPLEMENTING` | 12 | 105 | Accumulated local validation retained; shippable/Full V1 gates remain open |

## Historical critical findings — corrected 2026-07-14

### F-01 — Active execution pointer is stale

`README.md` still says the first executable row is in Component 01 and the current packet is P1.

`tasks-book-activity-master-orchestration.md` still says:

> After rebuild verification, set current packet to P1 and open the first unchecked canonical row in Component 01.

Component 01 is now `VERIFIED`; active work is Packet 2. This pointer can send a new agent to the wrong packet and must be corrected before execution resumes.

Required correction:

- current packet pointer = P2;
- current active owners = Components 02–03;
- C02 remains `CLOSURE_BLOCKED` on a compliant no-cost processor/deployed proof;
- dependent work may consume only exact verified interfaces under the PRD phase rule;
- no paid runtime or multi-page/full-source student resource may satisfy P2.

### F-02 — Canonical task rows still permit nonzero cost or multi-page interpretation

The following direct task wording conflicts with or weakens the corrected PRD:

- C02 `3.5`: asks for “estimated cost per Unit” rather than zero billed usage and free-quota consumption.
- C02 `4.0`/`4.2`/`6.4`: “authorized Unit rendition” and “exact Unit excerpt” can still be read as one multi-page Unit PDF.
- C04 `8.14`: permits estimated backend cost up to `$0.05 per active student-hour`.
- C07 `1.4`/`1.6`: uses broad “authorized excerpts” / “authorized source slice” wording and still mentions range grants.
- C08 `4.12`: permits `$0.05 per active student-hour`, an `authorized Unit rendition <=25MiB`, and `$0.25 per Unit` rendition cost.
- C08 `6.14` and `9.8`: continue to request estimated/rendition cost rather than zero-billed proof and quota consumption.

C02, C03, and C04 contain later non-checkbox notes that state the corrected one-page/no-cost interpretation. Those notes are useful but insufficient because the master explicitly says exact Component task wording controls scope. The direct canonical rows must be rewritten.

### F-03 — Component 08 currently recreates the exact drift that caused the Container proposal

C08 `4.12` is the strongest remaining contradiction. It treats a large “Unit rendition” and nonzero per-Unit processing cost as acceptable release budgets. An implementation agent could correctly follow that row and again choose a paid runtime or multi-page Unit artifact.

Required correction:

- replace Unit-rendition size with one-page artifact size/resource budgets;
- require zero billed usage for the representative workload;
- measure Worker CPU/memory/duration, R2 read/write/class-A/class-B operations, cache hit/miss, output bytes per page, and Firebase quota consumption;
- make any paid usage or paid-runtime dependency a release blocker, not a recalibration candidate.

### F-04 — Traceability is not a Full-V1 traceability owner

`traceability-book-activity-v1.md` is only 56 lines and is titled Packet P1 Traceability. It maps Component 01 and one C02 prerequisite only. It does not map:

- corrected PRD rules 48–51;
- one-page rendition ownership across C02/C03/C04/C07/C08;
- no-cost proof and forbidden-runtime negatives;
- remaining Components 03–08;
- current P2 closure blockers.

Before additional implementation, traceability must identify the exact task owners, source owners, tests, negative proof, browser/remote class, and closure gate for the corrected foundation.

### F-05 — The canonical checker does not protect the product decision

`check-canonical-plan.mjs` passes while the task authority still contains `$0.25 per Unit`, `$0.05 per active student-hour`, and `authorized Unit rendition <=25MiB`.

Required correction:

Add semantic governance assertions and tests that fail when active PRD0062b authority:

- authorizes or budgets a billed Source Delivery runtime;
- permits Workers Paid, Containers, Blaze, Cloud Run, or another paid fallback;
- describes student delivery as a multi-page Unit/full-source resource;
- omits zero-billed proof from P2/V1 exit requirements;
- points execution to a closed/stale packet.

## Historical high findings — corrected 2026-07-14

### F-06 — Component statuses do not represent accepted implementation state

C03, C04, and C07 declare `PLANNED` while containing many checked rows backed by accepted local evidence. Under the master lifecycle, `PLANNED` means no implementation has been accepted.

Recommended status corrections:

- C03: `CLOSURE_BLOCKED` or `IMPLEMENTING`, with explicit local foundation and exact remaining blockers.
- C04: `IMPLEMENTING`; local runtime foundation exists, but P3 and deployed Source Delivery/browser proof remain incomplete.
- C07: `IMPLEMENTING`; bounded Solo/Homework result and Book Delivery work exists, while Course/Class/public work remains planned.
- C08: retain release as planned only if the header explicitly distinguishes “release not entered” from accumulated verified-local validation rows; otherwise use `IMPLEMENTING` for accumulating validation evidence.

C05/C06 may remain `PLANNED`, but their headers should state that checked rows are inherited generic/non-Book regression prerequisites, not Book-feature implementation.

### F-07 — C03 contains a packet dependency/ownership ambiguity

C03 `6.4` was reopened because “students see only published Units” requires the P3 runtime consumer. The master says P2 exits through Components 02–03 and P3 enters after P2 interfaces/negative proof are stable.

This can become circular if C03 closure requires P3 while P3 is treated as blocked on complete P2 closure.

Required correction:

Choose one explicit owner model:

1. C03 proves the published-only producer projection and moves consumer enforcement to C04; or
2. P2 records the producer interface `VERIFIED` but remains `CLOSURE_BLOCKED` for the later consumer, and the master explicitly permits P3 entry on that exact verified interface.

The current wording must not leave the sequencing decision implicit.

### F-08 — C05 assignment binding should explicitly preserve page authorization

C05 freezes Source Version and Page Group references but does not directly say that the assignment manifest preserves the complete allowed physical-page union used by one-page delivery.

Required correction before P4:

- freeze or deterministically derive the exact creator-selected page set from pinned Manifest/Placement/Page Group authority;
- ensure assignment launch cannot broaden it;
- keep one-page artifact/rendition resolution inside Book Delivery/Book Source Delivery;
- never persist a private object key, original-resource URL, or multi-page student resource in Homework.

### F-09 — C06 source/page update tasks omit stale delivery-binding invalidation

C06 `4.6` says to apply selected source/page binding changes, and `5.8` preserves old Source links in checkpoints. It does not directly require:

- recomputing the exact allowed page union;
- invalidating/revoking stale one-page grant/rendition bindings for current delivery;
- preventing a changed URL/page parameter from retaining access to a formerly authorized page;
- keeping historical checkpoint links review-safe without restoring current delivery authority.

This must be explicit before selective Source/page updates are implemented.

### F-10 — C07 direct Book Delivery wording remains too broad

C07 `1.4` is already checked but says “authorized excerpts” and “range grants.” C07 `1.6` says “authorized source slice.” The new product contract is more specific:

- Book Delivery passes context and requested physical page;
- Book Source Delivery validates the complete Unit set and returns one matching one-page artifact;
- callers never handle private keys, original-byte ranges, multi-page resources, or provider grants.

The checked row should be re-audited after wording correction because accepted evidence was evaluated against the older, broader requirement.

## Component-by-component state

### Component 02 — Source PDF Delivery

State: `CLOSURE_BLOCKED` is correct.

Useful accepted foundation:

- private R2 prerequisite;
- immutable Source metadata and filename normalization;
- local PDF adapter evidence;
- local rendition/grant/domain behavior;
- Worker harness, emulator, backup, and regression evidence at their stated boundaries.

Still open:

- compliant no-cost production PDF processor;
- one-page production rendition/cache route;
- exact deployed grant/expiry/refresh behavior;
- authenticated student browser proof;
- private-original/full-source/multi-page denial in deployed composition;
- zero-billed and free-quota proof;
- backup/restore and rollback readback.

Authority corrections required before implementation continues:

- rewrite direct rows `3.5`, `4.0`–`4.2`, `5.1`–`5.8`, `6.4`–`6.8`, and `7.2` to the one-page/no-cost contract;
- do not rely only on the final non-checkbox note.

### Component 03 — Assembly

Raw state: 62 checked / 15 open.

Accepted local foundation is substantial. Full Component closure is not reached.

Main blockers already recorded:

- production authorized one-page rendition;
- trusted preview approval;
- full reconciliation previews and unresolved-blocking behavior;
- focus management;
- published-only student consumer ownership.

Authority corrections required:

- status;
- direct one-page wording in preview/rendition rows;
- resolve C03/C04 ownership for published-only student visibility;
- state P2/P3 entry behavior without circularity.

### Component 04 — Runtime

Raw state: 76 checked / 31 open.

Accepted local runtime/autosave/submission foundation exists. Deployed/browser/full P3 proof does not.

Authority corrections required:

- status = active/implementing rather than planned;
- rewrite Source projection/rendition validation directly to complete allowed set + requested page + one-page artifact;
- replace `$0.05 per active student-hour` with zero-billed proof and Firebase quota/write-budget measurement.

### Component 05 — Homework

Raw state: 5 checked / 78 open.

Book Homework is effectively not started. Checked rows are existing non-Book homework regression evidence.

Task structure is broadly usable. Before P4, strengthen assignment binding to preserve the exact allowed physical-page union and prohibit private/multi-page source authority in the Homework manifest.

### Component 06 — Updates/Checkpoints/Notifications

Raw state: 2 checked / 103 open.

Book selective-update behavior is not started. Checked rows are generic Notification Bell/homework regression evidence.

Task structure is broadly usable. Before P6, add explicit stale source-grant/rendition invalidation and exact page-union rebind requirements for selected Source/page changes.

### Component 07 — Cross-feature Delivery/Results

Raw state: 12 checked / 88 open.

Bounded local Book Delivery/result work exists; Course/Class/public work remains largely not started.

Authority corrections required:

- status;
- direct one-page/no-private-range wording in `1.4`, `1.6`, placement/source-binding rows, and public-source rows;
- re-audit checked `1.4` against the stronger requirement;
- ensure each packet lane in this shared Component has a visible lane-specific status.

### Component 08 — Hardening/Release

Raw state: 12 checked / 105 open.

Full V1 release is not near closure. Some bounded local browser/hardening evidence is retained.

Immediate correction required:

- rewrite `4.12`, `6.14`, `9.8`, browser packet contract, and release blockers to zero-billed/free-quota and one-page metrics;
- make paid usage, paid-runtime dependency, multi-page student delivery, or missing no-cost proof an automatic release blocker;
- preserve one-page/full-source negative tests throughout the security/browser matrix.

## Required correction order

1. Update README/master current pointer from P1 to P2 and add the no-cost/one-page stop and P2 exit conditions.
2. Rewrite C02 direct canonical rows; do not leave the correction only in a note.
3. Rewrite C03/C04/C07 direct Source Delivery wording and resolve the C03/P3 ownership ambiguity.
4. Replace nonzero monetary budgets and multi-page Unit-rendition language in C04/C08 with zero-billed/free-quota and one-page resource budgets.
5. Strengthen C05 assignment binding and C06 selected source/page update invalidation.
6. Expand traceability to the corrected PRD foundation and Components 02–08.
7. Add semantic governance checks/tests for forbidden paid runtimes, one-page delivery, zero-billed exits, and stale packet pointers.
8. Run canonical-plan validation, governance tests, stale-language scans, and `git diff --check` after the final authority edit.

## Current stop condition

Do not continue Packet 2 implementation from the present task wording. First complete and review the authority corrections above. No deployment, cloud mutation, paid-service activation, commit, or taskbox closure is authorized by this audit.
