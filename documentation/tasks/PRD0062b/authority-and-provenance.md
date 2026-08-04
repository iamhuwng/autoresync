# PRD0062b Authority And Provenance — Canonical Rebuild

> **DORMANT_AFTER_CODE_RESET. Read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md) first. The 2026-07-17 full-document delivery decision remains preserved future design intent; every implementation, proof, checkbox, deployment, and current-state statement below is dated historical evidence until revalidated against the live baseline.**

## Authority graph

```text
approval-record-2026-07-17-student-safe-full-pdf-streaming.md
└─ Latest user-approved Source Delivery product decision; binding conflict winner
   ↓ supersedes renderer and one-page transport assumptions
043a6d9b1f96a76f200ea753ca353e0376be65a7
└─ Approved Amendment dated 2026-07-09; binding conflict winner
   ↓ overlays
9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd
└─ user-selected full PRD/task baseline (stash-style WIP tree)
   └─ common ancestor 572ad7664ca0deab03bbbe70a116cd9732312c58
```

`9e6e7b2d` and `7386a8e5` are sibling commits, not ancestor/descendant. The 9e tree omits the amendment because it forked before the amendment merge; that deletion is not supersession. Composite authority therefore retains both objects with amendment precedence.

## Precedence

1. The user-approved [student-safe full-PDF streaming decision](approval-record-2026-07-17-student-safe-full-pdf-streaming.md) is the binding conflict winner for Source Delivery, Runtime document transport, workload, and related proof requirements.
2. Approved Amendment `043a6d9b` remains binding where it does not conflict with that later decision.
3. User-selected `9e6e7b2d` PRD/task wording is baseline where neither later authority conflicts.
4. Root Components 01–08 are full-wording canonical checklists; each task ID has exactly one execution checkbox owner.
5. Root master/streamlined files contain packet pointers and exact IDs only; no executable summary boxes.
6. User-directed Full V1 retention, including academically inert personal timer, is additive scope and cannot be silently removed by 9e V1.1 wording.
7. Current dirty PRD0062 documents, findings, taskboxes, handoffs, implementation notes, and code are evidence, not recovered planning authority.

## Recovered source map

| PRD0062b recovery copy | Git object source | Recovery status |
|---|---|---|
| `prd-book-based-interactive-activity-runtime-and-assembly.md` | `9e6e7b2d:documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md` | Body recovered; target blob `8c8757aa…` |
| `prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md` | `043a6d9:documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md` | Body recovered |
| `recovered/tasks-book-activity-master-orchestration.md` | `9e6e7b2d:documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md` | Body recovered |
| `recovered/tasks-book-activity-01-domain-security-foundation.md` | `9e6e7b2d:documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md` | Body recovered |
| `recovered/tasks-book-activity-02-source-pdf-delivery.md` | `9e6e7b2d:documentation/tasks/PRD0062/tasks-book-activity-02-source-pdf-delivery.md` | Body recovered |
| `recovered/tasks-book-activity-03-book-assembly-workspace.md` | `9e6e7b2d:documentation/tasks/PRD0062/tasks-book-activity-03-book-assembly-workspace.md` | Body recovered |
| `recovered/tasks-book-activity-04-activity-runtime.md` | `9e6e7b2d:documentation/tasks/PRD0062/tasks-book-activity-04-activity-runtime.md` | Body recovered |
| `recovered/tasks-book-activity-05…08-*.md` | Matching `9e6e7b2d:documentation/tasks/PRD0062/<file>` blobs | Bodies recovered |

These eleven recovery copies add only a warning/provenance banner before recovered content. That banner is non-normative and excluded from body-equivalence checks.

Root Components 01–08 are canonical full-wording task lists with reconciled checkboxes. They may differ from recovered bodies only in banner, active phase/status, checkbox marker, and explicit amendment/user-scope reconciliation notes. Root master/streamlined files are non-executable packet navigation.

## Single-source invariants

- Every baseline task ID from 9e is present in exactly one root Component owner.
- Only root Component task rows own `[ ]`/`[x]`; recovered snapshots and orchestration/audit docs never close work.
- `[x]` requires `VERIFIED_LOCAL_FAITHFUL` or `VERIFIED_REMOTE_FAITHFUL`; parent rows remain open while any child remains open.
- Packet order is sequential at amendment exits. Interface work may proceed inside current packet; proof debt cannot silently cross packet boundaries.
- Every deferred row names return owner and return boundary. Personal timer remains retained Full V1 work, academically/integrity inert.

## Amendment conflict effects

- Full V1 remains product destination; Foundation Pilot is narrower release cut, not scope deletion.
- At least eight implementation lanes remain required: Activity foundation; Book unit/page/source assembly; runtime/autosave/submission; Homework bundle; result/review/integrity; updates/checkpoints/notifications; Course/Class placement; Public Library publication and entitlement delivery.
- Each packet retains storage, security/rules, UI, test, migration/compatibility, and browser/runtime-proof sections. Delta form may reference unchanged accepted rows; sections cannot disappear.
- Amendment packet order supersedes conflicting clean-master grouping. Explicit mapping preserves exact component task wording.
- Cloud Run, Cloud Build, Artifact Registry, Google Secret Manager, Hosting dynamic rewrites, IAM activation, and billing detour are not approved baseline/amendment direction and are superseded planning evidence.
- Amendment is provider-neutral. User approval of PRD0062b activates recorded Spark-safe Cloudflare Worker/private-R2 production ownership as additive direction; missing production proof remains open.

## Taint boundary

Excluded as baseline:

- all dirty current `documentation/tasks/PRD0062/**` files;
- dirty current main PRD;
- later status/header/taskbox edits;
- Cloud Run/Cloud Build activation documents and commands;
- claimed proof counts or PASS/CLOSED labels not reproduced from live source/tests/runtime.

Allowed as evidence:

- live tracked and untracked source/config/test files;
- current diff and status;
- focused local test output gathered during this audit;
- dirty findings/handoffs only when cross-checked against live files;
- remote evidence only when independently read back. None was accepted in this audit.

## Recovery and verification commands

Working directory: repository root.

```powershell
rtk git show -s --format=fuller 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd
rtk git ls-tree -r --name-only 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd documentation/tasks/PRD0062
rtk git show 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd:documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md
rtk git show 043a6d9b1f96a76f200ea753ca353e0376be65a7:documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md
```

Body verification must strip the leading PRD0062b warning banner, then compare to the source blob. No current working-tree PRD0062 file participates.

## Immutable recovered-link residuals

The byte-exact recovered C02 snapshot intentionally preserves two historical relative links that have no target inside the immutable recovery tree:

- `recovered/tasks-book-activity-02-source-pdf-delivery.md:64` → `contracts-book-activity-packet-2.md#d-p2b-001`;
- `recovered/tasks-book-activity-02-source-pdf-delivery.md:64` → `findings-packet-2B-source-version-skeleton.md#f-p2b-001`.

Do not repair these links by editing recovered evidence or importing tainted current PRD0062 files. The PRD0062b governance probe also reports the expected duplicate `t-p2b0-001` anchor across the active C02 checklist and its immutable recovered copy; canonical execution links target the active root component, while the recovered anchor remains evidence-only.

## Initial live-state snapshot at canonical rebuild verification

- Branch: `main`.
- HEAD: `7386a8e5b7a60b8fc07018a9878fad467157266c`.
- Upstream relation observed: local `main` ahead of `origin/main` by 10.
- Staged state observed: no staged diff reported.
- Worktree: 215 collapsed status entries (115 tracked, 100 untracked groups); 428 expanded entries (115 tracked, 313 untracked files).
- PRD0062b inventory: 29 files, all within new `documentation/tasks/PRD0062b/**` scope.
- Current PRD0062 authority and implementation remain pre-existing user-owned evidence; no current PRD0062 file was edited.

This snapshot is historical for the initial rebuild check. The current verification snapshot below supersedes it.

## Current live-state snapshot after packet-contract and drift-label repair

- Branch: `main`.
- HEAD: `7386a8e5b7a60b8fc07018a9878fad467157266c`.
- Upstream relation: local `main` is ahead of `origin/main` by 10 commits.
- Staged state: 0 entries.
- Worktree: 428 expanded status entries (user-owned dirty/untracked work remains fenced).
- PRD0062b inventory: 29 files.
- Current `documentation/tasks/PRD0062/**`: 18 pre-existing tracked diff entries; no file in that authority tree was edited by this rebuild.
- Canonical task rows: 748 total, 247 checked from accepted local-faithful salvage, 501 open.
- Canonical validator: exit 0 after the packet-contract and timer-scope repairs.
- Active Component 01–08 headers label inherited `documentation/tasks/PRD0062/**` pointers evidence-only; PRD0062b-local authority remains execution source.
- Repository governance checker: the checked-parent/open-child `7.6c` result is historical drift. Current `npm run check:prd0062` passes; PRD0062b probe still preserves the two immutable recovered C02 link residuals and duplicate evidence anchor documented above.

## Packet P1 live execution addendum — 2026-07-13

Phase: `VERIFIED`. This addendum records accepted Packet P1 closure; it does not authorize Packet P2.

### Mission ledger

- Original mission: complete every remaining canonical Component 01 and Packet P1 contract obligation without entering P2.
- Completed slice: capability consumers, Activity rules/security, typed boundaries, regressions, ordered reviews, evidence, and packet-exit proof.
- Completion boundary: `VERIFIED`, `REVIEW_BLOCKED`, or `CLOSURE_BLOCKED` at Packet P1 only.
- Verified canonical wording: Packet Contract/Closure Addendum eight checkboxes; Tasks `1.0`, `1.3`, `5.0`, `5.6`, `7.0`–`7.6`, `8.0`–`8.4`, `9.0`–`9.4`, `10.0`, `10.1`; and reopened/corrected `10.12`.
- Source/interface owners: Material Capability Registry; Material Producer/Summary contracts; Test Type config; Book picker/ref integration; Activity authoring/projection/Worker; RTDB rules; backup/restore inventory; typed Book/Material seams; Reading V2/Listening dependency boundary.
- Dependency order: authority map → capability/producer consumers → rules/security/storage → typed/regression proof → spec review → quality review → packet-exit proof → evidence/taskboxes.
- Proof obligations: direct unit/integration tests; actual Firebase Database emulator negatives; authoring Worker proof; focused typecheck; legacy Book/material regressions; dependency-isolation scan/test; backup/index inventory; stale-claim scan; canonical validator.
- Dirty ownership: all pre-existing tracked/untracked work remains user-owned. P1 edits are fenced to live P1 source/tests/rules and PRD0062b-local evidence. No historical PRD0062 or recovered file may change.
- Current blockers: none. Those live findings were corrected and accepted by ordered reviews and final proof.
- Non-actions: no P2 source/Assembly/runtime implementation; no deployment or remote mutation; no stage/commit/push/reset/restore/clean/stash/rebase/worktree deletion; no `operationalPlacementReady` flip to obtain closure.

### Storage

Packet P1 Activity RTDB root is `book_activity`. Current typed inventory: `materials`, `candidates`, `drafts`, `versions`, `student_safe_projections`, `draft_save_operations`, and `activity_publish_operations`. Material discovery uses `material_catalog/material_summary_indexes/v1` after producer integration. No P1 Firestore collection exists. Exact indexes, backup, archive/deletion, and restore behavior are recorded in `storage-design-book-activity-packet-1.md` and final handoff proof.

### Rules and security

`database.rules.json` owns browser policy. Trusted Activity authoring uses authenticated Worker authority plus RTDB REST ETag/CAS. Canonical projections must remain owner/super-admin readable only; students receive content only through context-bound Book Delivery after entitlement resolution. Actual emulator proof must cover student-owned creation, cross-owner/cross-student reads/writes, parent/ancestor attempts, direct trusted-record writes, and projection enumeration.

### UI, accessibility, and announcements

P1 adds no route, page, announcement, or analytics-emitting action. Existing Book picker candidate eligibility changed, so final localhost teacher browser proof verified the real picker/legacy behavior and zero console warning/error without persisting a mutation.

### Migration and compatibility

No deployed compatible Activity dataset or P1 migration is claimed. Existing material kinds, legacy test-based Books, Reading V2, and Listening remain independent. Structural Book embeddability remains distinct from operational placement readiness. Later-packet dirty code is not P1 proof and is not modified.

### Tests

Required final proof classes: local source/unit; focused type/build; Firebase emulator/rules; Activity-authoring Worker; backup/restore; regression/dependency isolation; governance/stale-claim. Exact commands, runner/config, exit, executed tests, covered requirements, omissions, and harness/product classification belong in the P1 findings/handoff evidence.

### Browser and runtime proof

Required and completed for the changed existing Book picker at `http://localhost:5173`. No remote Activity summary existed, so Activity-row discovery remains local component/source proof. Local runtime, deployed, and remote proof remain separate.

### Proof classification

Only `VERIFIED_LOCAL_FAITHFUL` or `VERIFIED_REMOTE_FAITHFUL` may close a taskbox. Local source, type/build, emulator/rules, Worker, browser, remote/deployed, and not-required proof are classified independently. Accepted boundary and quality reviews plus final packet-exit proof classify Packet P1 rows as `VERIFIED_LOCAL_FAITHFUL`; remote/deployed proof remains unclaimed.

### Authority reconciliation

Approved Amendment `043a6d9b1f96a76f200ea753ca353e0376be65a7` wins conflicts over baseline `9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd`. Canonical Component 01 owns execution checkboxes. PRD0062 and PRD0062b/recovered artifacts are non-execution evidence and remain untouched.

### Packet P1 review and closure

Specification/boundary review first blocked public Activity-summary leakage and unsafe missing-projection/version picker/ref paths; corrections passed two re-reviews. Independent code-quality review passed with no blocking finding. Final commands, runner/config, exit codes, executed counts, scope omissions, harness classifications, browser result, and residual risks are recorded in `handoff-book-activity-packet-1.md`. Packet P1 is `VERIFIED`; the next P2 prerequisite remains Component 02 `T-P2B0-001` and was not started.

## Packet P2B0 live execution addendum — 2026-07-13

Phase: `VERIFIED` for `T-P2B0-001`; `CLOSURE_BLOCKED` for broader Component 02 and Packet 2.

### Mission ledger

- Original mission: prove the distinct non-public source R2 bucket/binding and direct arbitrary disposable-object denial required before Packet 2B source metadata/upload work.
- Completed slice: current local binding/config proof, authenticated deployed binding and R2 public-surface readback, one exact disposable-object unsigned denial probe, and exact cleanup.
- In scope: `luyentap-book-source-private`, `BOOK_SOURCE_R2`, `book-source-private-gateway`, one `_proof/` text object, and read-only Worker/R2 routing checks.
- Out of scope: source metadata/upload implementation, PDF engine, RTDB rules, grants/renditions, browser flow, production composition, and Packet 2 closure.
- Non-actions: no `kahoot-media`, source PDF, production object, native presigned URL, R2 public surface, route/domain/preview setting, deployment, or unrelated resource changed.

### Accepted evidence

`G-P2B0-001` records fresh remote evidence. The target bucket is distinct and empty after cleanup; `r2.dev` and R2 custom domains are disabled; the deployed Worker settings expose only `BOOK_SOURCE_R2 -> luyentap-book-source-private`; workers.dev/Preview routing is disabled and service-filtered Worker custom domains are empty. A known existing disposable object returned HTTP `400` with structured `InvalidArgument` / `Authorization` on unsigned canonical `GET`, with no payload or redirect; unsigned `HEAD` also returned `400`. Exact-key post-delete get returned `The specified key does not exist.`

### Residual authority limitation

The zone route API read returned HTTP `403` / Cloudflare `10000`; no fresh zero-zone-route result is claimed. This does not overturn the exact R2 direct-denial proof, but it remains a remote route-observability residual. The broader Component 02 gates remain open and no dependent product completion is implied.

## Packet P2 live execution addendum — 2026-07-13

Phase: `CLOSURE_BLOCKED`. Packet P1 remains `VERIFIED`; `T-P2B0-001` remains `VERIFIED_REMOTE_FAITHFUL` only at its exact prerequisite boundary. No deployment, remote mutation, or P3 work was authorized or performed.

### Storage

Immutable Source Version, deterministic private identity, one-based page coordinates, Assembly candidates, Page Groups, Placements, published Unit projections, and local backup/restore contracts have fresh source/test proof. Private originals and renditions do not have accepted production backup/restore lifecycle proof. `BOOK_SOURCE_PDF_PROCESSOR` is absent from production Worker configuration.

### Security and rules

Firebase Database emulator proof passes for the explicit client-denied `book_source` boundary, service identity, and ancestor/root denial. Cloudflare private-boundary tests assert zero fake-R2 operations for denied paths. These are emulator/Worker-harness facts, not deployed R2 or current Worker-route proof. Production grant/resource delivery remains absent.

### UI, accessibility, and announcements

Teacher Assembly uses the existing Book editor route and shared `TeacherHeader` boundary. Import, repair, mapping, provenance, conflict, prompt-copy, preview, and publish outcomes use shared announcements. Browser proof covers 1208px, 768px, and 375px, stacked reconciliation, no horizontal overflow, labelled regions, keyboard focus, and 44px mobile actions. Modal focus transfer/trap and complete source/current/proposed preview interaction remain open under C03 `8.4`/`5.2`.

### Migration and compatibility

No compatible deployed Source/Assembly rows were evidenced, so no backfill or remote migration ran. Legacy Book/test/material behavior passed 26 files/192 tests. Existing material refs and normal Book metadata editing remain intact. Cloud Run/Build directions remain superseded.

### Tests

Fresh accepted evidence: local source 21 files/149 passed with 5 emulator-dependent skips; Cloudflare 8 files/76; Firebase emulator 2 files/10; Assembly 8 files/38; Assembly UI 12; backup/restore 4 files/13; legacy Book/material 26 files/192; root TypeScript; Playwright 1. Exact commands, configs, omissions, and harness classifications are in `evidence/P2-closure-20260713.md`.

### Browser and runtime proof

The accepted Playwright flow uses localhost and route-mocked Assembly APIs; it verifies teacher behavior and responsive layout only. The live default dev source client returned `book_source_request_failed_500`, so no real source upload/Assembly entry was claimed. No deployed grant expiry/refresh, reauthorization, private rendition, full-PDF denial, or student runtime proof exists.

### Authority reconciliation

Approved amendment `043a6d9` wins. Freshly reopened false checked rows are C02 `4.0`, `4.2`, `4.5`, `5.0`–`5.8`, `7.5`; C03 `4.0`, `4.4`, `6.4`. Reconciliation decisions are `R-023`–`R-029`. Canonical Component checklists remain the completion source; audit/findings/evidence classify but do not replace them.

### Evidence classification

Local source, PDF adapter, Worker harness/fake R2, Firebase emulator, route-mocked browser, local backup, remote prerequisite, and deployed proof are recorded separately. Only `T-P2B0-001` retains remote-faithful status. No local test or static config is promoted to deployed evidence.

### Historical rollback and blockers — superseded for Source transport

No remote change was exercised in this historical evidence set. Its one-page renderer/grant closure conditions are superseded. Current P2 closure instead requires authenticated full-document stream/range proof, student-safe readiness and denial proof, stable publish-state reconciliation, browser readback, backup/restore/rollback, cleanup, and representative workload/quota evidence.

### Historical Packet P2 continuation reconciliation — 2026-07-15

Dated 2026-07-15 candidate evidence used a split under `cloudflare/src/book-source-worker/**`: trusted page counting used bounded legacy PDF.js range reads while a separate Browser Run/PDF.js path generated sanitized one-page renditions. That candidate transport is superseded by the 2026-07-17 full-document decision and is retained only as historical evidence. `book-source-processor/**`, whole-document `pdf-lib`, Node child-process, Containers, Cloud Run, Workers Paid, and Firebase Blaze were not accepted production dependencies.

Fresh local, Worker-harness, type, governance, canonical, route-mocked browser, and in-app live-browser evidence remains separately classified. The in-app browser reached the teacher Source PDF surface and received `book_source_request_failed_500`; it did not prove production rendition, grant, delivery, backup, restore, rollback, cleanup, performance, or zero-billed operation.

## Packet P2 user correction addendum — 2026-07-14

The current canonical PRD plus `canonical-task-overrides.json` are the conflict winners for the user-approved 2026-07-14 Source Delivery cost and transport decisions. The Approved Amendment remains authority where it does not conflict with that later correction. The selected production boundary is Cloudflare Workers/R2 no-cost allowances plus Firebase Spark only. Workers Paid, Cloudflare Containers, Firebase Blaze, Cloud Run, and other billed PDF runtimes are not authorized.

The 2026-07-14 decision used one sanitized derived physical-page PDF at a time and bound grants to a requested page/rendition. That transport decision is superseded by the 2026-07-17 full-document approval. Its task corrections remain dated evidence only; the 50 MiB cap and whole-buffer `pdf-lib` child remain prototype evidence only.

User approval to apply the authority correction is recorded in `approval-record-2026-07-14-source-delivery-foundation.md`. The direct task rows were corrected across Components 02–08, C07 `1.4` was reopened, statuses/pointers were reconciled, traceability was expanded, and semantic validation was added. This approval does not close P2 or replace required deployed, denial, sanitization, zero-billed/free-quota, browser, backup/restore, rollback, and cleanup proof.

## Conversation decision reconciliation addendum — 2026-07-14

The uploaded full conversation log for session `019f2325-1297-7461-b287-938fd0a68be0` was re-read against the canonical PRD. The user approved the resulting authority edits in `approval-record-2026-07-14-conversation-decision-reconciliation.md`.

The current canonical PRD now:

- reopens the exact teacher correction mechanism for wrongly generated or uncertain `presentationMode` and blocks publication until that mechanism is separately approved;
- requires Unit and Revision prompt-copy capabilities while keeping teacher use optional and direct import independent;
- requires a versioned IELTS Reading/Listening task-type coverage matrix before Full V1 closure;
- limits source labels to exact citations/correspondence rather than a second visible Activity order;
- retains the optional student-controlled personal SVG timer as Full V1 scope with no teacher, telemetry, academic, integrity, or runtime-authority effect;
- removes residual `page slice`, `Unit excerpt`, and multi-page method/test terminology from active authority.

Exact task replacements are recorded in `canonical-task-overrides.json`. The correction adds no implementation proof, changes no packet pointer, and authorizes no deployment, cloud mutation, commit, or task closure.

## Packet P3 canonical audit addendum — 2026-07-15

The user explicitly approved a fresh audit of inherited Packet 3 / Component 04 work against the current PRD, canonical task wording, live source, and fresh direct proof. Approval is recorded in `approval-record-2026-07-15-p3-canonical-audit.md`; detailed evidence is `evidence/P3-canonical-audit-20260715.md`.

The inherited M1–M5 checkbox state is not authority. Fresh inspection and a 7-file/105-test local run retained only 42 of 95 executable leaf rows (`44.2%`) and reopened 30 leaf rows plus parents `9.0` and `10.0`. The main corrections cover preview/strict projection validation, missing interaction variants and media rendering, absent trusted one-page page transitions, incomplete navigation/autosave preservation evidence, noncanonical result UX, missing Course context, and unverified mobile browser behavior.

The local test run is accepted only for the retained rows. It is not real student-browser, pilot, remote, deployed, performance/quota, billing, accessibility, or timer proof. Component 04 remains `IMPLEMENTING`; the audit verdict is `REVIEW_BLOCKED`, and formal P3 implementation remains sequenced after accepted P2 exit. No implementation code, deployment, cloud mutation, commit, staging, push, or cleanup was authorized or performed by this audit.

## Packet 2–8 capability ownership reconciliation — 2026-07-17

The task lists were reviewed as one incremental dependency chain after the C02 `2.5` scope conflict was identified. The following ownership is canonical for the current rights-free product decision:

The surgical lifecycle rebuild is defined by [source-lifecycle-contract.md](source-lifecycle-contract.md). That contract is the current design baseline for C02 implementation and proof; it does not reopen Packet 3 or later ownership.

| Capability | Foundation | Full implementation | Closure proof |
|---|---|---|---|
| Private upload and immutable replacement | C02 Source Delivery | C02 Source Delivery | C02 deployed Source proof; C08 repeats the complete lifecycle |
| Source detach/archive/cleanup | C02 defines non-destructive detach and trusted cleanup boundaries | C06 invalidates stale grants/resources after selected updates; trusted cleanup preserves pinned and historical evidence | C08 post-cleanup lifecycle readback |
| Unit publication and published-only producer projection | C03 Assembly | C03 Assembly | C03 producer/deployed proof; C04 validates consumption separately |
| Solo/preview entitlement and runtime consumer | C02 exposes authenticated full-document delivery and denial without entitlement | C04 Book Delivery selects current publication, activates/supersedes current entitlement, and opens the mapped page in the document viewer | C04 runtime/integration proof and C08 remote/browser proof |
| Homework assignment and assignment-derived entitlement | C03 exposes assignable published placements | C05 freezes Homework bindings and activates/supersedes assignment entitlements | C05 Homework proof and C08 lifecycle proof |
| Selective update/revocation | Immutable C02/C05 pins | C06 update/checkpoint/revocation flow | C06 update proof and C08 lifecycle proof |
| Course/Class/public delivery | P3/P4 Book Delivery interfaces | C07 cross-feature/public surfaces | C07 surface proof and C08 release proof |

C02 closure therefore does not require assignment creation or entitlement issuance. It must prove private/unpublished Source denial, immutable replacement, non-destructive detachment semantics, trusted publication prerequisites, authenticated byte-range/full-stream delivery of the complete pinned student-safe PDF, and denial without a downstream entitlement. C03 owns publication; C04/C05 own entitlement issuance for their surfaces; C06 owns stale-document authorization invalidation; C07 owns later cross-feature/public delivery. Rights attestation, rights metadata, and rights-specific publication/delivery revalidation are not requirements in any packet.

## Student-safe full-document authority — approved 2026-07-17

[Approval record](approval-record-2026-07-17-student-safe-full-pdf-streaming.md) supersedes every earlier active requirement for Browser Run, PDF rasterization, one-page splitting, derived rendition objects, rendition caches, or per-page resource grants. Earlier proofs remain valid only as historical evidence of the implementation they tested; they cannot close the revised delivery contract.

Current product contract:

- teacher uploads one complete student-safe PDF to private R2;
- trusted publication pins its immutable Source Version plus page-to-Activity mappings;
- Book Delivery verifies current user, context, entitlement, publication, and Source lifecycle state;
- governed Worker streams the complete pinned PDF, including standard byte-range support needed by a normal PDF viewer;
- viewer opens the selected `physicalPageNumber`; right panel resolves Activities from Page Group/Placement mappings;
- teacher-only content, answer keys, authoring data, storage credentials, and other Books remain denied;
- product makes no screenshot, print, save, or redistribution-prevention promise.

Packet 1 remains `VERIFIED`; its Activity and mapping foundations are transport-neutral. Packet 2 reopens only rows whose accepted outcome depended on rendering, renditions, per-page transport, or old workload proof. Immutable upload, integrity, Source Version identity, page count/labels, lifecycle, Assembly staging/publication, and mapping work remain governed by their existing evidence boundaries.
