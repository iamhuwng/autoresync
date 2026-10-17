# PRD0062 Component-PDF Recovery — Past Evidence Index for Codex Agents

Status: **advisory recovery index only**. This file does not change PlanMD authority,
mark any lane accepted, authorize a cherry-pick, or substitute historical proof for
fresh current-worktree/runtime proof.

Purpose: give planners, orchestrators, implementors, and reviewers a compact map of
important PRD0062 evidence that existed before the 2026-09 Component-PDF recovery.
Agents must inspect these donors before treating an architectural mechanism as new,
infeasible, or unspecified.

## Current use — user clarification, 2026-10-04

The planner completed the R2, Backblaze and Worker evidence lookup. Start with
[PlanMD §2.10](component-pdf-recovery-execution-plan-2026-09-14.md#210-planner-verified-provider-and-worker-evidence--2026-10-04)
for verified measurements, reusable contracts, exact raw-report paths/provenance
and the narrow remaining proof delta. Compare actual source/configuration, target
and workload; extend this index/history search only for a specific unanswered
boundary or invalidated result. Missing measurements in one directory are not
evidence of global historical absence. Retain the provider/environment and
CPU-versus-wall-time qualifications; today's remote-state claims still require
fresh target readback.

The observations below that say "current" belong to their dated historical
inspection. They are not today's source state or instructions to redo completed
restoration. Live PlanMD §2.9/§2.10/§9 governs present ownership and evidence reuse.

## Current provider correction — 2026-10-05

The dated 2026-09-17 wording below that calls B2 “current-code evidence, not
approved production storage authority” and the §1 sentence that sends production
recovery to private R2 are superseded. The current user-confirmed target is
private Backblaze B2 for every Book PDF byte, including component originals and
the combined `student-document`. R2 material in this index remains historical
algorithm/boundary evidence or unrelated media infrastructure. Use the active
PlanMD and ledger for current B2 composition and target identity; do not restore
an R2 Book adapter from this index.

## Independent validation — 2026-09-17

The replacement planner independently rechecked this index against the live object
database, current source, canonical PRD0062b records, focused historical files/tests,
current PlanMD/ledger, and the relevant agent JSONL reports.

Validated corrections:

- R-069 and `3eda4700` prove the direct private-R2 legacy-PDF.js range-count
  mechanism and its trusted Source completion integration once existed and passed a
  remote four-page canary.
- Current code instead promotes `browser-supplied-untrusted` count through
  `ownerAttestedPhysicalPageCount` into Assembly `physicalPageCount`; K1 parent
  acceptance must therefore be reopened.
- The reachable-ref-only archaeology was incomplete; the named unreachable and
  preserved-worktree commits exist.
- The #126 production browser proof establishes the old authenticated full-document
  route/viewer as a restoration donor, not acceptance of the new combined descriptor.
- The live 500-MiB generic Source constant conflicts with canonical PRD0062b's
  accepted 50-MiB original-file limit where supported. Treat 500 MiB as current
  implementation drift, not a second product envelope. Historical mechanism proof
  does not waive fresh measurement of the canonical 50-MiB/500-page component
  envelope and the approved combined-output limit.

Do not rely on an exact aggregate insertion/deletion count for a preserved workspace;
compare the relevant paths against its first parent. The older sentence that
described Backblaze B2 as evidence only is superseded by the 2026-10-05 provider
correction above.

## Required recovery method

For any affected seam, compare **historical donor -> current live source -> current
PlanMD target** and classify relevant behavior as `KEEP`, `RESTORE`, `ADAPT`, `DROP`,
or narrowly `CHERRY-PICK`. Do not infer that an entire historical commit should be
restored. Do not infer that a current green focused test proves preservation of a
historically stronger semantic contract.

Historical evidence may prove that a mechanism once worked. Current acceptance still
requires current-source reconciliation and the proof class owned by the active plan.

---

## 1. Trusted provider-byte PDF page count — already implemented and remotely proven

### Primary authority evidence

- `documentation/tasks/PRD0062b/reconciliation-ledger.md`, row **R-069**,
  `REMOTE_COUNT_CORRECTION_VERIFIED`.
- `documentation/tasks/PRD0062b/tasks-book-activity-02-source-pdf-delivery.md`, C02
  rows **2.2-2.4**, especially 2.4.
- `documentation/tasks/PRD0062b/findings-packet-p2-unit-page-source-assembly.md`.
- `documentation/tasks/PRD0062b/implementation-audit.md` around the direct-count
  production path.

### What it proves

- Browser/Browser-Rendering page counting had already been rejected for trusted
  completion because it consumed the completion deadline.
- Trusted count mode used **legacy PDF.js range reads directly against private R2**.
- Count mode did **not** launch or reserve Browser Rendering.
- Disposable Source Version `65b34084-f687-4e2c-a27d-08f14b8e2abb` completed as a
  four-page PDF in **11,222 ms**.
- Exact original/integrity data survived and cleanup was read back across R2 and RTDB.
- The trusted counter's lifecycle contract also already existed: native Cloudflare
  `ExecutionContext.waitUntil(...)` owned any PDF.js/provider cleanup that outlived
  the bounded request deadline. This is part of the recovered mechanism, not a new
  architecture question.

### Critical implementation donor

Unreachable/ref-less archive commit:

- `3eda4700d5c81d596d39cd7731414a3bc7840c76`
- message: `archive: preserve phase 2 pre-cleanup state`
- parent: `17a42a0ab704481aad8504258b22fc23883de273`
- date: `2026-08-21T00:39:04+07:00`

Inspect at least:

- `cloudflare/src/book-source-worker/direct-pdf-page-count.ts`
- `cloudflare/src/book-source-worker/processor-count.ts`
- `cloudflare/src/book-source-worker/processor-range.ts`
- `cloudflare/src/book-source-worker/durable-pdf-processor.ts`
- `cloudflare/src/book-source-worker/production-worker.ts`
- `cloudflare/src/book-source-worker/control-host.ts`
- `cloudflare/src/book-source-worker/request-session.ts`
- `cloudflare/worker.js`
- `cloudflare/prototypes/direct-pdfjs-count/README.md`
- `cloudflare/prototypes/direct-pdfjs-count/RESULT.md`
- `cloudflare/test/book-source-processor-count.test.ts`
- `cloudflare/test/book-source-processor-deadline.test.ts`
- `src/services/book-source-delivery/sourceUpload.service.ts`

The archived Source Upload contract includes
`TrustedSourcePageCountAdapter.countVerifiedPages(...)`; completion inspects the
stored private object, checks trusted checksum/size, obtains trusted page count, then
commits the immutable Source Version through repository CAS.

The same donor contains the missing lifecycle-owner chain:

- `control-host.ts` accepts Cloudflare `ExecutionContext` and maps it to
  `deferCleanup: promise => executionContext.waitUntil(promise)`;
- `request-session.ts` carries `deferCleanup` through the request/composition seam;
- `direct-pdf-page-count.ts` forwards the callback to `processor-count.ts`;
- `processor-count.ts` registers provider-body, range, loading-task, and document
  cleanup that remains unsettled at the deadline; and
- focused processor/deadline tests capture and await `waitUntil` promises.

The historical PRD explicitly required **deterministic cleanup ownership**. The
donor also contains Durable Object processor/job generations; those are mixed
historical context and remain excluded. Recover the lifecycle invariant and native
Worker `waitUntil` handoff, not the Durable Object/job architecture.

### Recovery use

Treat the current S0 page-count question as **restore/adapt + fresh regression/capacity
proof**, not first-principles feasibility. A design based on B2 repeated bounded reads
plus whole-file `pdf-lib` is not equivalent to this historical mechanism.

For K1-R local proof, adapt the donor algorithm to the existing
`SourceProviderPort.readBounded` seam; do not add a Wrangler binding or generic
storage framework. Production-normal recovery binds the accepted counter to the
existing private B2 adapter and owns current B2 remote proof. The July
R2-quarantine test predates R-069 and is stale only where it bans the bounded
count modules; retain its bans on rendition/splitting, Browser Run, Durable
Object PDF processing, paid compute, unapproved bindings and Book-PDF R2
storage. Browser-returned provider IDs are current implementation evidence only;
K1-R removes them from the target completion request. The reservation plus
provider resolution/verification—not the browser—owns the canonical storage
identity.

K1-R must therefore restore/adapt both halves of the donor contract: bounded
provider-byte counting **and deterministic cleanup ownership**. Thread the native
Cloudflare request `ExecutionContext` through the current BookRouter/control path as
the smallest `deferCleanup` callback and register unsettled cleanup exactly once with
`waitUntil`. If the request lifecycle owner is unavailable, fail closed/retryable;
never silently drop cleanup or report trustworthy completion. Preserve current
operation-only completion, provider-neutral identity/CAS seams, and the Durable
Object/rendition/Browser Run exclusions.

The current production entrypoint is `cloudflare/worker.js`; its `fetch(request,
env)` currently calls `canonicalBookRouter.fetch(request, env)` and therefore drops
the native `ctx`. This path is part of the recovered lifecycle contract and must be
included in the adapter's caller matrix. The target is the smallest semantic
adaptation: `fetch(request, env, ctx)` -> router/handler context -> one
`deferCleanup` callback -> `ctx.waitUntil`, with no new lifecycle authority.

Also audit any already-accepted source-authority code that derives trusted Assembly
page bounds from browser-attested page count.

---

## 2. Mature Source Upload completion/retry/CAS state machine

### Primary donor

Same archive commit:

- `3eda4700d5c81d596d39cd7731414a3bc7840c76`

Inspect:

- `src/services/book-source-delivery/sourceUpload.service.ts`
- `src/services/book-source-delivery/sourceUpload.service.test.ts`
- `src/services/book-source-delivery/sourceUpload.rtdbRepository.ts`
- `src/services/book-source-delivery/sourceVersion.service.ts`
- related Book Source Worker ingress/completion files in the archive.

### Historically implemented behaviors

The old path contains evidence for:

- immutable Source Version creation;
- server-generated source/upload identities;
- exact trusted private-object inspection;
- accepted-ingress checksum/byte-size binding;
- ingress attempt identity;
- completion attempt identity;
- completion leases and reclaim;
- retry/replay conflict handling;
- cancellation and cleanup-pending state;
- cleanup after partially or possibly written ingress;
- Book-management reauthorization before completion;
- trusted page-count adapter integration;
- atomic/CAS `completeOperationWithVersion` behavior;
- replacement provenance;
- immutable/source-safe client projection separation.

Supporting task evidence is in
`documentation/tasks/PRD0062b/tasks-book-activity-02-source-pdf-delivery.md`, including
accepted historical C02 rows such as 1.3, 1.4, 1.6, 1.8, 2.7, and 2.11.

### Recovery use

S0 should **orchestrate or adapt the mature Source Upload machinery**, not create a
parallel upload state machine for components or the combined student document.
Before replacing current retry/cleanup semantics, compare exact historical behavior
and tests.

---

## 3. Source lifecycle state/audit model

### Design/evidence records

- `documentation/tasks/PRD0062b/source-lifecycle-contract.md`
- `documentation/tasks/PRD0062b/tasks-book-activity-02-source-pdf-delivery.md`,
  `Lifecycle rebuild update — 2026-07-17`.
- preserved RTDB evidence containing `lifecycle_records`:
  - `documentation/tasks/PRD0062b/evidence/p2-rtdb-active-rules-before-replay-20260717.json`
  - `documentation/tasks/PRD0062b/evidence/p2-rtdb-deploy-candidate-replay-20260717.json`

### Implementation donor

`3eda4700d5c81d596d39cd7731414a3bc7840c76` contains historical
`src/services/book-source-delivery/sourceLifecycle.service.ts` and tests.

### What it proves

Historical design/implementation distinguished semantic lifecycle states:

- `private_ready`
- `private_replaced`
- `published`
- `retired`

The protected `book_source/lifecycle_records` and
`book_source/lifecycle_audit_events` projection shared the Source `/book_source` CAS
transaction. Trusted detach/retire changed lifecycle state without mutating immutable
Source Version rows. Assembly preview/publish and Delivery rejected present retired
lifecycle records.

### Recovery use

Do not equate today's provider cleanup/version-reconciliation service with the whole
historical semantic Source lifecycle. Current K1 retirement work may be useful, but
its closure must be compared with this older state/audit model and the current
September retention requirements.

Current recovery disposition: do not restore `/book_source` as a parallel live
authority. Adapt create/replacement completion and deterministic audit to the existing
`book_source_upload_accounts/{accountId}` revision CAS. Treat the upload operation as
the canonical Source lifecycle record. Drop `published` as a Source state because the
existing `book_assembly_publications` version/current pointer/operation result already
own publication and its audit. U owns old-minus-next selection; K1-retirement owns a
pre-delete `retirement_pending` Source attachment fence and the post-absence
`retireVerifiedSource` CAS bridge. Deterministic create/replace/fence/retire audit
events stay inside the same upload-account revision CAS; the existing
retired-byte-deletion saga owns the exact provider effect; Q owns remote/provider
proof. This is an architectural mapping, not implementation evidence.

---

## 4. Component-PDF authoring milestone

### Commit

- `97c348d442d56bf011ea248ff4bc1b844ba160b8`
- `feat(books): complete Component-PDF authoring milestone`
- date: `2026-08-28T08:54:24+07:00`

### Useful behavior to inspect

- explicit `component_pdfs` strategy;
- stable component `sourceKey` / `sourceVersionId` handoff;
- source ordering and component ownership;
- Assembly candidate/source-set integration;
- component mapping/authoring workflow;
- publication/preview handoff existing before the September recovery.

### Recovery use

Use as a semantic baseline for C1/M0/S0/A0 comparison. Do not assume the exact UI or
per-component delivery behavior remains desired under the September one-combined-
document decision.

---

## 5. Component student preview using the actual Runtime

### Commit

- `e6b78d91e65dc45bed23de2458c014fa1d2e5be8`
- `feat(books): complete component PDF student preview`
- date: `2026-08-30T12:14:27+07:00`

### Critical files

- `src/components/books/assembly/BookAssemblyStudentPreviewHost.tsx`
- `src/services/book-assembly/unitPreview.service.ts`
- `src/components/book-runtime/BookRuntimeShell.tsx`
- `src/components/book-runtime/BookPdfViewerHost.tsx`
- `src/components/books/BookPdfFlowWorkspace.tsx`
- associated focused tests.

### Valuable proven semantics

- teacher preview uses the **actual learner Runtime shell**;
- candidate preview is interactive while durable student persistence is disabled;
- preview responses/answers stay in memory;
- preview identity includes candidate/source-set/unit/registry revisions;
- stale preview invalidates when candidate/source inputs change;
- Page Group and Activity placement context is source-qualified;
- component local-page navigation was integrated with Runtime.

### What must be adapted

The historical preview could rely on per-component document requests/transport. The
September target requires one combined `studentDocument` and
`combinedPhysicalPage`. Preserve the Runtime/preview semantics while replacing the
old resource authority.

---

## 6. Full-document authenticated Delivery and real production browser proof

### Primary evidence

- `documentation/tasks/PRD0062/evidence/126-production-browser-proof-2026-08-24.md`
- JSON companion:
  `documentation/tasks/PRD0062/evidence/126-production-browser-proof-2026-08-24.json`
- corroborating summary:
  `documentation/tasks/PRD0062/findings-book-activity-baseline.md`

Status recorded: `CURRENT_CANDIDATE_VERIFIED_REMOTE_BROWSER_PASS`.

### Exact deployed proof

Worker:

- `r2-upload-signer`
- version `db9a6657-bcdc-439c-aeae-b0b5793f142c`
- version number `146`

Authenticated document route:

- `HEAD 200`
- `Content-Type: application/pdf`
- `Content-Length: 977013`
- `Accept-Ranges: bytes`
- ranged `GET bytes=0-65535` -> `206`
- exact `Content-Range: bytes 0-65535/977013`
- returned 65,536 bytes.

Real production student Runtime:

- opened Book Activities from Homework;
- showed `Reference-only`;
- PDF metadata showed `source-version-70f2ccf7d1a42d67`, 977,013 bytes;
- rendered `Page 1 of 4`;
- Next advanced to `Page 2 of 4`;
- fresh student proof tab had zero console errors/warnings.

The source architecture used native PDF.js with the authorized Worker URL and Firebase
bearer in `httpHeaders`; explicit `PDFDataRangeTransport` remained only for transports
without a native source.

### Recovery use

D0/D1/D2 should treat authenticated full-document route/range/viewer transport as a
**restore/adapt donor**, not a greenfield implementation. Adapt its authority from the
old pinned source/per-component assumptions to the new combined student-document
descriptor and combined page mapping.

---

## 7. Historical full-document viewer/runtime implementation trail

Useful commits:

- `7039cbcae3d20b792caa6ac8c0f30a68205d340b` — `feat: add book PDF viewer`
- `bb16532a68776c690a4cdb0899874d8b4ef4a1bb` — `feat(prd0062): add student runtime shell`
- `89ed30ad29468dad77e3fb9006306ea7aeb34901` — `feat(prd0062): close runtime persistence boundary`
- `330c1138ac6d9b347f9f499896c15cf3a719cfcf` — `feat(prd0062): add component navigation`
- `ef47634f311594b02c4bbbd73fe003f995063e2c` — `fix(prd0062): harden book delivery projection`
- `31496c20d0abaf5e56e8a2dade24339aa5413a9c` — `fix(prd0062): repair document runtime composition`
- `28efe1cea9547619e96e6722655be998c0524be9` — `feat(prd0062): reconcile full-pdf delivery and release gates`
- `0e9e851ecbdda7ba272bc67fc70b65208ae2e221` — `fix(books): wire PDF runtime auth and endpoint configuration`
- `e6b78d91e65dc45bed23de2458c014fa1d2e5be8` — component preview integration.

### Recovery use

Inspect this sequence before adding a second viewer, second document transport, or new
Runtime resource model.

---

## 8. Assembly mapping/import/reconciliation/publication trail

These commits show that M0/A0 concerns historically crossed service, workspace,
publication, and Worker boundaries; do not force recovery into a domain-service-only
manifest without tracing callers.

- `ceae3b3715546fc3a5cf680979476c679160e6dd` — close assembly mapping
- `ab26701b4be79c5a4940e4df6638b0becf522898` — mapping viewer
- `5a6283dd57861fc50b9296de5ca33644f4ce52ee` — Unit import
- `a874e94382b14a36f5205ad70bcb62697f342b81` — reconciliation
- `4f7cddba5a31e7ee7fb48b61891dea680881992c` — preview
- `0031904709ec54243ab3eb5368364d8d6a6fe29f` — publication primitive
- `e5e37f76a480263630ad2c2b242de4f90f328a0e` — durable publication repository
- `6f7447816f1a9aa26f5bc17042699d068ae58483` — publication routes
- `3ed1c332fe956d8fec0984f69866b5fde47723fe` — Component-PDF publication
- `79b43afda35adf93abb94a4f2ef412371fa1a727` — canonical publication boundary
- `ec8d2c15fd6572cbadf3adde434cfb868d1d6de9` — atomic Component-PDF Activity publication
- `2e41d23973279c78818db20f2ca812290a398683` — explicit Activity import reconciliation
- `9dc3fec307a0ce9eb37ecc0c109c0c1003dc9b66` — explicit Activity binding replacement

### Supporting requirements/evidence

`documentation/tasks/PRD0062b/tasks-book-activity-03-book-assembly-workspace.md`
records historical requirements such as validating Source Version page bounds before
current-state changes and preserving atomic publication semantics.

### Recovery use

M0 scope should come from the actual current/historical caller graph. Preserve proven
mapping/reconciliation/publication semantics and adapt page identity to the combined
student document rather than rebuilding the entire pipeline.

---

## 9. Preserved 2026-08-30 workspace snapshots

These are important because ordinary `git log --all --not HEAD` archaeology can miss
them.

### Component milestone workspace

- `2107a7362789f2bfa6f91ae111714c60b83d301f`
- `On (no branch): prd0062 2ab0-component-milestone-preserved workspace 2026-08-30`
- first parent: `e6b78d91e65dc45bed23de2458c014fa1d2e5be8`

### Full-PDF preserved workspace

- `218631ee1ee8735465507ac15334a2b9de879f27`
- `On (no branch): prd0062 0556-full-pdf-preserved workspace 2026-08-30`
- first parent: `2e2ff61610d52b5ff3daa8a45fd6f7d80ec51974`

### Backend preserved workspace

- `81cfefcf5a464f92aae52f01fcfc37e557ad3088`
- `On (no branch): prd0062 cbd8-backend-preserved workspace 2026-08-30`
- first parent: `ff83236e73177b97a5f3c340b3d18215dd737618`

Important paths changed in the backend snapshot include:

- `src/components/books/BookPdfFlowWorkspace.tsx`
- `src/services/book-source-delivery/sourceUpload.service.ts`
- `src/services/book-source-delivery/sourceUpload.client.ts`
- `src/services/book-source-delivery/sourceUpload.browserWorkflow.ts`
- `src/services/book-assembly/unitActivityImport.service.ts`
- `cloudflare/src/upload-worker/book-assembly/production-composition.ts`
- `cloudflare/src/upload-worker/book-activity-authoring/repository.ts`
- `cloudflare/src/upload-worker/book-activity-authoring/worker.ts`

Observed useful concepts include source-key/revision handoff, source-qualified page
references, Activity binding, and publication/authoring integration. These are donor
candidates, not automatically correct current implementations.

---

## 10. Other unreachable/ref-less PRD0062 archives worth triage

Run `git fsck --full --no-reflogs --unreachable` and inspect relevant objects. Known
important candidates include:

- `2c967db62f8e1ab02c14658cb8f2cc67f3535c66` — `archive: preserve 26db source-delivery experiment`
- `0b5a7ea307b731abdcfabc96450a55188aa0db13` — orphaned WSL PRD0062-104 state
- `3e6816d67f8c9700cbe0ddf8c171b89e67fdf591` — orphaned WSL PRD0062-106 state
- `7c24e32fa28d3715b15d011e0b10b09822b9f83e` — orphaned WSL production-normal state
- `b17b4ae760f442f40db84c1bdaaa4eae292c615b` — production-normal-v2 state
- `cb90ca5348939dc63cb18fee863823976f54ea01` — post-104 state
- `fcc89c696285659ac3812f772c444ec9309e1d7b` — reconciled-baseline worktree state
- `3eda4700d5c81d596d39cd7731414a3bc7840c76` — phase-2 pre-cleanup state
- `2107a7362789f2bfa6f91ae111714c60b83d301f` — component milestone preserved workspace
- `218631ee1ee8735465507ac15334a2b9de879f27` — full-PDF preserved workspace
- `81cfefcf5a464f92aae52f01fcfc37e557ad3088` — backend preserved workspace

### Recovery use

Do not call archaeology complete after enumerating only reachable refs. Triage these by
path and behavior and record why each relevant hunk is `KEEP`, `RESTORE`, `ADAPT`,
`DROP`, or unsuitable.

---

## 11. Likely regression transition after the good Aug-30 component preview

Inspect carefully, hunk by hunk:

- `1e69263d83f2e48fe906d33532105e308b63a1d9`
  - `fix(books): simplify PDF upload release flow`
  - parent: `e6b78d91e65dc45bed23de2458c014fa1d2e5be8`
  - date: `2026-09-01T14:27:10+07:00`
- `d6487b5b4cbb807004183475724acc3a347d2e97`
  - `refactor(prd0062): remove obsolete pilot release controls`
  - date: `2026-09-01T22:40:29+07:00`

### Recovery use

This is a likely simplification/removal boundary where mature Source Upload or
Component-PDF behavior may have been lost. Do **not** label either entire commit bad.
Diff only affected paths and identify exact semantic removals versus legitimate
cleanup.

---

## 12. Reconciled baseline evidence from July

High-value historical summary:

- `documentation/tasks/PRD0062/reconciled-baseline-evidence-2026-07-22.md`

Useful recorded facts include:

- same-logical-key replacement while rejecting duplicate Source Version/object identity;
- source candidates carry only logical source identity while trusted authority supplies
  safe Source Version projection;
- physical page authority was intended to come from trusted Source Version facts, not
  browser/private provider identity;
- explicit rollback and immutable-version expectations across early tickets.

### Recovery use

Use this as a cross-check when current code appears to have collapsed trusted facts
back into client claims or mixed provider identity into Assembly contracts.

---

## 13. Evidence explicitly retained by the July full-document correction

`documentation/tasks/PRD0062b/reconciliation-ledger.md` row **R-078** is important
for recovery scope. It says renderer-specific evidence was separated from
transport-neutral evidence and explicitly retained:

- immutable upload;
- integrity;
- Source Version identity;
- page count/labels;
- lifecycle;
- mapping;
- staging;
- atomic publish evidence.

### Recovery use

Do not discard these mechanisms merely because Browser Run, per-page rendering,
renditions, or per-page grants were later superseded. Separate retained domain/source
mechanisms from obsolete transport/rendering mechanisms.

---

## 14. Current September decision that changes how old donors must be adapted

Historical donors are not the final target. The current Component-PDF decision is
recorded in:

- `documentation/tasks/PRD0062/component-pdf-recovery-execution-plan-2026-09-14.md`
- `documentation/tasks/PRD0062b/reconciliation-ledger.md`, row **R-081**.

The new target keeps immutable private component Source Versions but introduces one
immutable combined `student-document`, one opaque student resource, preserved old pins,
and explicit `component_pdfs` identity.

### Recovery use

Use old implementation to avoid re-solving upload, page count, CAS, Delivery,
preview, mapping, and Runtime mechanics, but adapt their authority to the new combined
student-document contract.

---

## 15. Suggested archaeology commands for agents

Read-only commands only; preserve the dirty worktree.

```text
git show <commit>:<path>
git diff <historical-commit> -- <path...>
git log --all --date=iso -- <path...>
git reflog --all
git fsck --full --no-reflogs --unreachable
git show -s --format='%H|%P|%ad|%s' --date=iso-strict <commit>
```

For preserved workspace commits with multiple parents, compare the workspace commit
against its **first parent** to see the preserved worktree delta.

Do not mutate refs merely to inspect unreachable objects.

---

## 16. Minimum checklist before a Codex agent declares a PRD0062 mechanism new or infeasible

1. Search the active PlanMD and ledger.
2. Search `documentation/tasks/PRD0062b/reconciliation-ledger.md` and the relevant
   canonical task document.
3. Search `documentation/tasks/PRD0062/evidence/` and PRD0062 findings/baseline docs.
4. Inspect ordinary path history.
5. Inspect non-ancestor reachable donors.
6. Inspect preserved workspace/stash/reflog states.
7. Inspect relevant unreachable objects from `git fsck`.
8. Compare historical mechanism to the **current exact target**, not merely current
   source shape.
9. Record whether the historical mechanism is retained, obsolete, or needs adaptation.
10. Only then start a new feasibility/design spike.

A failed current implementation is evidence about the current implementation. It is
not evidence that a historically proven alternative never existed.

---

## 17. Homework authority and policy donors

Relevant commits and surviving seams:

- `bd1edeb8` — canonical Book Homework route/saga/repository/Worker;
- `a76c27c5` — frozen assignment policies;
- `5853b5ea` — nested schedules and late policy;
- `415c5dcf` — context-scoped completion;
- `7b89d431` — trusted runtime integration;
- `026c401e` — committed notification production.

Preserve and adapt the mature saga, CAS, policy, schedule, completion, and
notification mechanisms. Current `book-homework/worker.ts` rejects
`component_pdfs`, and the canonical resolver still models component sources. The new
work is the exact combined-document/publication/mapping/Activity pin and current
launch/progress/browser proof, not a replacement Homework subsystem.

## 18. Attempts, Runtime persistence, and results donors

Relevant commits:

- `e9f32676` — terminal runtime result persistence;
- `ed3cd7f6` — trusted Activity completion boundary;
- `01868c19` — attempt limits;
- `570b1d2c` — historical source-context result review;
- `330c1138` and `e6b78d91` — navigation and actual Runtime preview.

Keep context-bound draft/attempt identity, CAS/replay, terminal submission, and
historical review. Adapt them to one `studentDocument` and
`combinedPhysicalPage`; drop per-component request/selector authority. Current
runtime debounce remains 600 ms and therefore does not meet the current >=1.5 s
target. Fresh delayed-result/reload and browser proof remain open.

## 19. Replacement/update donors

Relevant commits:

- `63b9981c` — durable update action ledger;
- `1c30bf19` — non-redo update classification;
- `23cfb948` — redo checkpoints and receipts;
- `eb416cfc` / `4d8b9e57` — selected additions/removals;
- `7e8bc4a6` / `4f6a5d73` — commit gating and recovery;
- `b4d95e30` — post-commit notifications.

Keep the ledger, receipts, replay, recovery suppression, and post-commit fan-out.
Adapt selection to one combined-document successor and exact old-minus-next
retirement. Drop automatic all-context revoke/delete. Reorder-only semantics, exact
provider absence, selected-context browser proof, and safe checkpoint/notification
fallback remain open.

## 20. Course and Class donors

Relevant commits:

- `76d8a4d9`, `3cec0996`, `e6bd7970`, `b0d2de8b`, `17731c53`,
  `81194bd8`, `72c1b753`, and `4196c03f`.

Keep exact placement/pins, membership, archive/lock, completion, and derived-credit
gates. Adapt launch, drafts, submission, and results to canonical one-document
Delivery and attempt authority. Drop bare-material synchronization and standalone
Class result authority. Current shared Delivery supports only
`solo`/`preview`/`homework` and emits per-source document requests, so Course/Class
are not already wired through the target authority.

## 21. Public Library donors

Relevant commits:

- `a92c8158` and `8457f35a` — public reference/fork and canonical fork writer;
- `17a42a0a` / `b5c33438` — public impact adapters;
- `26fe6ee9` / `9e6811f8` — catalog/readiness.

Keep catalog, fork, readiness, and invalidation primitives. Adapt readiness to a
complete combined student document and add opaque entitlement/refresh/revocation and
private practice-result context. Drop metadata-only playable claims and legacy
bare-material self-study launch.

## 22. Closure/proof donors

Reuse proof harnesses, fixtures and applicable measured results from `28efe1ce`,
`e6b78d91`, `4196c03f`, unreachable `b17b4ae7`/`fcc89c69` and preserved
workspaces. Compare each relevant boundary with the current one-document target;
adapt/rerun only changed or uncovered proof. Zero-skip/native Rules, Worker,
browser, capacity/quota/billing and protected-state requirements remain binding
at their actual scope. Prior results may contribute after live reconciliation;
their age alone does not require repeating every check. Today's deployed-state
claims still need current readback, and documentation must reflect actual evidence.

The downstream census found no additional donor that changes these dispositions.
Commits `1e69263d` and `d6487b5b` are Source/control-plane history, not evidence that
Homework/attempt/update/Course/Class/Public mechanisms were removed wholesale.
