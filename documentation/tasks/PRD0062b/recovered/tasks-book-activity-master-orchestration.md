> IMMUTABLE RECOVERED BASELINE / EVIDENCE ONLY
>
> Exact body from Git object 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd. Evidence only; canonical packet pointer is parent-directory master file.

# Master Task List: PRD0062 Book-Based Interactive Activity Runtime and Assembly Workspace

Status: IMPLEMENTING. Active orchestration record for bounded PRD0062 change sets.
Created: 2026-07-09

Primary PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Durable architecture:
- `documentation/architecture/book-activity-runtime-and-assembly.md`

Task-generation rule:
- `documentation/tasks/generate-tasks.md`

Primary component task lists:
- `documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md`
- `documentation/tasks/PRD0062/tasks-book-activity-02-source-pdf-delivery.md`
- `documentation/tasks/PRD0062/tasks-book-activity-03-book-assembly-workspace.md`
- `documentation/tasks/PRD0062/tasks-book-activity-04-activity-runtime.md`
- `documentation/tasks/PRD0062/tasks-book-activity-05-book-homework.md`
- `documentation/tasks/PRD0062/tasks-book-activity-06-updates-checkpoints-notifications.md`
- `documentation/tasks/PRD0062/tasks-book-activity-07-cross-feature-delivery-results.md`
- `documentation/tasks/PRD0062/tasks-book-activity-08-pilot-hardening-release.md`

Findings file:
- `documentation/tasks/PRD0062/findings-book-activity-baseline.md`

Traceability file:
- `documentation/tasks/PRD0062/traceability-book-activity-v1.md`

Packet contract template:
- `documentation/tasks/PRD0062/contracts-book-activity-packet-template.md`

## Purpose

- Use this file as the dependency and release-gate map for PRD0062, not as a transcript of conversations or commands.
- Treat the PRD as product and architecture authority; component task lists are executable slices and may be corrected when repository evidence disproves an assumption.
- Preserve the central invariant: extend the existing Book system; do not create a second `ActivityBook` product.
- Keep one active statement of current implementation truth. Historical packet evidence remains append-only but must not be copied into every active document.
- Mark an outcome complete only when its source, tests, security boundary, and required product proof agree. Documentation ceremony alone is never an outcome.
- Follow `authority-reference-system.md` for precedence and current pointers; handoffs, reviews, command counts, and conversation logs are evidence inputs, never current-state authority by themselves.

Current state:

| Track | Current state | Meaning |
|---|---|---|
| Packet 0 | `CLOSED` historical baseline | Ownership/storage baseline finished; later corrections use active authority/findings. |
| Packet 1 | `VERIFIED LOCALLY` foundation and corrective hardening | Component 01 / Task 10.0 is locally verified. Deployment/remote readback, operational placement, immutable Book Delivery resolution, runtime launch, assignment, result, and later-packet gates remain separate. |
| Packet 2 | `IMPLEMENTING` | Private boundary verified; production ingress, rendition, grants, rules, and browser/deployed proof remain open. |
| Packet 3 | `IMPLEMENTING` bounded Task 1.0 slice | Structural Unit support is locally verified. Manifest, Page Group, Placement, Unit import/publication, Assembly UI, and all runtime paths remain open. |
| Packets 4-8 | `PLANNED` | Start only from exact verified inputs in dependency graph; Packet 8 proof may accumulate incrementally. |

## Execution Model

- Work in the smallest coherent change set that closes one control boundary. Adjacent subtasks may be combined when they share the same owner, tests, and rollback boundary; a conversation boundary is not an implementation gate.
- Read the minimum authoritative set before editing: `AGENTS.md`, relevant PRD sections, this master map, active component task list, durable architecture note, and current controlling finding/decision. Read historical handoffs only when they contain evidence needed by the slice.
- Keep findings append-only and label historical, superseded, current, and blocked claims explicitly.
- Track implementation state separately from release closure: `PLANNED`, `IMPLEMENTING`, `IMPLEMENTED_UNREVIEWED`, `REVIEW_BLOCKED`, `VERIFIED`, `CLOSURE_BLOCKED`, or `CLOSED`.
- Dependency consumers may start from a `VERIFIED` producer output even when that producer is `CLOSURE_BLOCKED` by documentation, commit, rollout, or unrelated remote proof. Record exact verified interface consumed. Never consume `IMPLEMENTED_UNREVIEWED` or `REVIEW_BLOCKED` behavior.
- Parallelize independent read-only spikes, tests, and disjoint owner changes. Serialize writes to same storage path, contract, or authority document.
- Use packet-scoped commits where practical, but never use a commit, reviewer message, or checkbox as proof of behavior.
- Continue through recoverable harness, documentation, or configuration defects when they can be diagnosed and corrected inside scope. Do not imitate a human approval pause when no product decision or protected mutation is required.
- Never pause solely to ask for a new prompt, open a new conversation, create a reviewer persona, or write a handoff. Stop only under decision policy below.

## Risk-Scaled Change Contract

Every source change needs a concise change contract recorded in the active component task or contract file:

- intended outcome and explicit non-scope;
- exact source/storage owner and compatibility boundary;
- focused tests and one relevant negative or failure proof;
- proof classes actually required for the claim.

Expand the contract only when the change triggers one or more of these risks:

- new or changed persistent storage, security rules, authorization, private assets, or cross-system mutation;
- user-facing UI behavior requiring browser proof;
- migration, destructive cleanup, deployment, rollback, or externally visible compatibility risk;
- performance/cost behavior that cannot be established by unit tests.

For expanded contracts, record storage/rules authority, migration and recovery, positive and negative authorization proof, browser proof where user-visible, and remote proof only for deployed-state claims. Use one evidence row per changed invariant rather than repeating a full proof matrix for every packet.

Run `npm run check:prd0062` before closure and retain `npm run check:prd0062:json` output when CI or another agent consumes proof. It replaces manual duplicate-anchor, broken-link, status-vocabulary, structured closure-reference, and checked-parent/open-child scans that automation covers; it does not infer approval, current-pointer freshness, test freshness, or behavioral truth.

Packet 0 storage design remains the durable inventory for planned stores. Later packets update only rows whose owner, mutability, authorization, index, backup, migration, or negative-test contract changed.

## Dirty Workspace Policy

- Start every change set by recording `rtk git status --short --branch`, `rtk git status --short --untracked-files=all`, and `rtk git rev-parse HEAD`; `No hook installed` is a warning, not a failure.
- Record `git diff --name-only` and `git diff --cached --name-only` before writing.
- Classify every dirty or untracked path as `owned by this change`, `pre-existing staged work`, `pre-existing unstaged work`, `user-owned unrelated work`, `generated artifact`, or `must-not-touch`.
- Fence unrelated dirty paths and continue without touching them. Hard-block only when the same file/owner boundary has overlapping edits that cannot be isolated safely.
- Do not stage, rewrite, normalize, or format unrelated existing dirty files.
- Record allowed dirty paths in a handoff only when the conditional handoff rule triggers.
- Use exact-path staging if a change reaches commit scope. Never use `git add .` or `git add -A`.
- Verify staged paths with `git diff --cached --name-only` before commit.

## Decision Policy: Continue, Remediate, Defer, Or Hard-Block

Use these outcomes instead of converting every discrepancy into a stop-and-ask loop.

### Continue

- Continue when required authority is readable, intended owner is clear, dirty paths are fenced, and next action is reversible and within approved product contract.
- Continue with local work when remote proof is not needed for local claim. Label remote/deployed claim open rather than blocking unrelated implementation.

### Auto-remediate

- Diagnose and repair stale taskboxes, broken links, duplicated current-state claims, incomplete test commands, harness/configuration defects, or missing narrow negative tests when repair is inside current owner boundary.
- Reconcile rule/task conflicts by applying higher product/security authority and recording correction. Ask only when conflict represents a genuine unresolved product choice.
- Treat reviewer timeout, usage limit, or weak scope as absent review evidence; obtain another review or perform required proof. Do not discard valid implementation work.

### Defer or sever a dependency

- Defer remote rollout, browser proof, migration rehearsal, or optional integration when current output has a stable verified interface and dependent slice does not rely on deferred behavior.
- Record exact interface and residual risk. A deferred closure artifact must not masquerade as completed release proof.

### Hard-block

Hard-block only when proceeding would cross a trust or irreversibility boundary without adequate authority or evidence:

- required product/rule authority is missing and intended behavior cannot be inferred safely;
- overlapping writes cannot be isolated;
- implementation would create a parallel Book product, use prohibited PDF parser, weaken Reading V2/Listening contracts merely for Books, or put context authorization inside Book Runtime;
- implementation would expose full source PDFs, unauthorized pages, hidden answers, teacher data, provenance, private object authority, or another user's work;
- a new persistent path or cross-system mutation lacks an owner, authorization model, recovery/idempotency design, or negative test;
- a destructive, production, deployment, credential, billing, or irreversible action lacks explicit approval;
- a release claim depends on remote state not read back from authoritative system.

Screenshots and console logs may supplement user-flow evidence but never replace automated security, rules, versioning, concurrency, update, or permission proof.

## Review And Closure Protocol

- Review is proportional to risk. Authorization, persistence, migrations, concurrency, scoring, and cross-feature contracts require independent or adversarial review before `VERIFIED`; low-risk documentation and mechanical refactors may close with direct proof plus governance checker.
- Give reviewer exact changed-file list, changed invariants, required PRD sections, failure model, tests run, and explicit non-scope. Do not ask for a generic repository-wide PASS.
- Reviewer output is scoped evidence, not authority. Timeout, usage limit, or “tests not rerun” means incomplete evidence.
- Main agent owns final state judgment and inspects actual diff and proof.
- Before closure, run focused tests after final edit, `npm run check:prd0062`, `git diff --check`, and only stale-claim scans relevant to touched current-state documents.
- Reconcile each completed outcome to source owner, test, changed failure/authorization boundary, and one current finding/decision reference. Do not require an eight-document evidence chain when these four links are direct.
- Mark `VERIFIED` when behavior and required proof pass. Mark `CLOSED` when verified behavior, required docs, dirty-path scope, and explicit approval/rollout gates agree.

## Conditional Handoff

Create or update a handoff only when work crosses a conversation/worktree boundary, ends partial or blocked, changes owner, or leaves a non-obvious residual risk. A fully completed bounded change may use the final response plus current finding/decision record; it does not need a new handoff file solely to mimic a human shift change.

A handoff contains only:

- branch/HEAD/dirty paths and phase state;
- current verified interface and exact remaining work;
- commands/proof classes completed and known harness failures;
- blockers or residual risks, including what can continue independently;
- next bounded action, without prescribing one implementation method unless method is itself a contract.

Do not duplicate full command logs, the PRD, contract tables, or historical narratives. Link to their canonical evidence records.

Final responses for substantive implementation work report state, changed invariants, verification, unresolved risks, and the next bounded action. Include a handoff path only when a handoff was required by the rule above.

## Conversation Kickoff Template

```text
Continue PRD0062 with the smallest coherent change set that advances [outcome].
Workspace: C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Read AGENTS.md, the controlling PRD sections, the master dependency map, the active component tasks, and the current decision/finding for this boundary. Inspect HEAD and dirty paths, fence unrelated work, then diagnose and remediate recoverable defects without pausing for artificial approval.

Preserve trust boundaries and explicit non-scope. Keep local, emulator, browser, remote, and release proof distinct. Run focused tests plus npm run check:prd0062 after the final edit. Hard-block only under the master decision policy. Create a handoff only if work remains partial, blocked, changes owner, or crosses a conversation/worktree boundary.
```

## Verified-Interface Dependency Graph

Packets are release groupings, not a requirement to serialize every internal task.

```text
Packet 0 ownership/storage map
  ├─ Packet 1 Activity domain + canonical security
  └─ Packet 2 source track
       ├─ private boundary
       ├─ immutable metadata/upload finalization
       └─ rendition + delivery grants

Packet 1 + Packet 2 immutable metadata/page-bound interface
  └─ Packet 3 Assembly data model and workspace

Packet 1 + Packet 3 published Unit projection
  └─ Packet 4 structured runtime

Packet 2 rendition/grant interface + Packet 3 mapping
  └─ Packet 4 source-assisted runtime

Packet 4 representative pilot
  ├─ Packet 5 Book Homework
  │    └─ Packet 6 updates/checkpoints/notifications
  └─ Packet 7 Solo/Course/Class/result delivery seams may begin on verified runtime contracts;
       homework-specific adapters wait for Packets 5/6

Packets 1-7 verified outcomes
  └─ Packet 8 full release hardening and closure
```

## Packet 0 - Baseline And Ownership Map

Historical state: `CLOSED` baseline. This section is not an active checklist.

Historical outcomes:

- baseline findings identified Book, Material Catalog, Homework, launcher, result, notification, Course/Class, rules, Worker/R2, and backup owners;
- storage design and traceability were created before foundation implementation;
- prohibited legacy PDF parser boundary and required regression seams were recorded;
- later corrections do not rewrite this history; active authority, architecture, findings, and component tasks hold current truth.

Current references:

- `documentation/tasks/PRD0062/findings-book-activity-baseline.md`
- `documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md`
- `documentation/tasks/PRD0062/traceability-book-activity-v1.md`
- `documentation/tasks/PRD0062/authority-reference-system.md`

## Packet 1 - Activity Domain And Security Foundation

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md`

Entry criteria:
- [ ] Packet 0 ownership/storage interfaces needed by this slice are verified.
- [ ] Dirty workspace paths are fenced or clean.
- [ ] Packet 1-relevant traceability rows have exact source owner path or explicit N/A, rules/security boundary or explicit N/A, test file plus exact test title or explicit N/A, negative/mutation proof requirement, architecture/current-state doc target, and findings row target.
- [ ] Storage-design packet is complete for Packet 1 source paths and security boundaries.
- [ ] Packet 0 findings TBD/shell rows relevant to Packet 1 are resolved or explicitly marked blocked.
- [ ] Packet 1 risk-scaled change contract is consistent with the PRD.

Scope:
- [ ] Implement generic `interactive-activity` material kind and central capability registry.
- [ ] Implement Activity schema, candidate, draft, published version, validation, hidden Interaction IDs, student-safe projection, semantic diff, and grading/regrading plan.
- [ ] Add security rules, indexes where needed, tests, and backup coverage for new Activity data.

Do not:
- [ ] Do not add Book Assembly UI.
- [ ] Do not add student runtime UI.
- [ ] Do not change Reading V2 or Listening contracts.
- [ ] Do not create generic Task Group, Task Set, or first-class Resource domains.

Exit criteria:
- [x] Component 01 task-list parent acceptance passes locally, including Task 10.0 corrective hardening.
- [x] Packet 1 schema/domain and focused Material Catalog/Book regressions pass locally.
- [x] Packet 1 security/rules proof for new Activity paths passes at its recorded local/emulator scope.
- [x] Findings record exact Activity domain owner paths and residual gates.
- [x] No conditional handoff is required; the verified Packet 1 interface and separate later gates are recorded in its contract, traceability, and findings.

## Packet 2 - Source PDF Delivery

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-02-source-pdf-delivery.md`

Entry criteria:
- [ ] Packet 0 source ownership/storage interfaces are verified.
- [ ] Packet 1 source-related identity and authorization interfaces are verified; unrelated Packet 1 hardening does not block this track.
- [ ] Packet 2 risk-scaled change contract is consistent with the PRD.

Scope:
- [ ] Implement immutable Source Version metadata and upload/version creation path.
- [ ] Apply one canonical normalized PDF display-filename validator at ingress, trusted restore, Source Version construction, and canonical repository mutations; keep display names separate from Worker-generated object identity.
- [ ] Complete the required PDF edge-case spike and select a backend PDF excerpt engine behind an adapter before production source-delivery implementation.
- [ ] Implement authorized Unit rendition generation/cache and safe delivery grants.
- [ ] Add positive and negative source-delivery security tests.

Do not:
- [ ] Do not use the obsolete parser.
- [ ] Do not deliver full source PDFs to browser clients.
- [ ] Do not expose raw private R2 authority to the browser.

Exit criteria:
- [ ] Source delivery positive and negative tests pass.
- [ ] Findings record selected PDF engine, adapter boundary, and unresolved deployment constraints.
- [ ] If the conditional handoff rule triggers, it records which Packet 2 interfaces are verified and which rollout/rendition/grant work remains open.

## Packet 3 - Book Assembly Workspace

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-03-book-assembly-workspace.md`

Entry criteria:
- [ ] Packet 1 Activity identity/version/placement-facing interfaces are verified.
- [ ] Packet 2 immutable Source Version metadata and page-bound validation interfaces are verified; production upload/rendition rollout may remain separate.
- [ ] Packet 3 risk-scaled change contract is consistent with the PRD.

Scope:
- [ ] Start with pure immutable manifest/Page Group/Placement contracts using verified Source Version metadata plus deterministic private test adapters/fixtures. This slice does not wait for production upload/rendition rollout.
- [x] Add `unit` Book node support while preserving legacy `test` behavior (Component 03 / Task 1.0 local structural slice only).
- [ ] Implement manifest candidate import, Page Groups, Placements, Unit Activity JSON import, reconciliation, page-mapping editor, preview, staged Unit publication, and revision-by-JSON.
- [ ] Add teacher Assembly Workspace route/UI using shared/native controls.

Do not:
- [ ] Do not remove existing Book editor capabilities.
- [ ] Do not add Mantine.
- [ ] Do not let invalid import mutate current draft or publication.
- [ ] Do not implement Book Homework, Affected Homework Review, or selective update behavior.
- [ ] Do not enforce new Book Activity invariants inside an untyped `// @ts-nocheck` seam without a typed wrapper or cleanup.
- [ ] Do not claim source-assisted publish/runtime readiness until Packet 2 rendition and context-bound grant interfaces are verified.

Exit criteria:
- [ ] Book structure, manifest, reconciliation, and Assembly Workspace tests pass.
- [ ] Existing Book create/edit/publish regressions pass.
- [ ] Findings record final storage paths and UI route IDs.
- [ ] If the conditional handoff rule triggers, it records the verified published Unit/Placement/Page Group interface and remaining Assembly work.

## Packet 4 - Activity Runtime

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-04-activity-runtime.md`

Entry criteria:
- [x] Packet 1 corrective hardening is verified before any student exposure; Component 03/04 operational placement and runtime remain separate entry criteria.
- [ ] Packet 3 provides a verified published Unit/Placement/Page Group projection.
- [ ] Structured Runtime may begin without source rendition; source-assisted Runtime additionally requires verified Packet 2 rendition/grant interfaces.
- [ ] Packet 4 risk-scaled change contract is consistent with the PRD.

Scope:
- [ ] Implement the minimum Book-owned Solo/preview delivery resolver and student-safe runtime projection required by the Integration Pilot Gate.
- [ ] Implement shared Activity renderer for V1 interaction families.
- [ ] Implement desktop split runtime, structured/source-assisted modes, single-page PDF navigation, sticky navigator, autosave, Activity submission/review, and mobile tabs.
- [ ] Launch through the existing asynchronous student entry pattern with one thin Book dispatch branch.

Do not:
- [ ] Do not make runtime read authoring records directly.
- [ ] Do not implement Homework/Course/Class rules inside runtime components.
- [ ] Do not create custom per-Unit React renderers.

Exit criteria:
- [ ] Runtime component tests pass.
- [ ] Autosave/reload and stale-binding rejection tests pass.
- [ ] Existing Reading, Listening, Writing, THCS, and Reading V2 StudentPracticePage launch regressions pass.
- [ ] Integration Pilot Gate passes before Packet 5 starts.
- [ ] If the conditional handoff rule triggers, it records the representative pilot result and exact unresolved boundary.

## Integration Pilot Gate - After Packet 4

Scope:
- [ ] Run one representative Unit from one supplied source through verified Source Version metadata using production ingress or a deterministic private adapter, manifest import, Unit Activity JSON import, mapping repair, Assembly preview, Unit publication, desktop/mobile structured Solo or preview runtime, server-backed autosave, and Activity-level submission/result.
- [ ] Exercise source-assisted runtime only if Packet 2 rendition/grant interface is verified; otherwise retain it as an explicit shippable-pilot dependency.
- [ ] Record correction rate, unsupported interaction patterns, import errors, runtime issues, teacher effort, automated test proof, and browser proof.

Do not:
- [ ] Do not implement or exercise Book/subtree Homework, selective updates, Review Checkpoints, Course/Class delivery, public playable source-assisted Books, or integrity rollout inside this gate.

Exit criteria:
- [ ] Integration-pilot behavior, tests, browser proof, findings, taskboxes, and dirty paths agree.
- [ ] Only unresolved defects in interfaces consumed by Packet 5 block Homework work; source-assisted/deployed rollout residuals remain separate when Packet 5 does not consume them.

## Packet 5 - Book Homework

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-05-book-homework.md`

Entry criteria:
- [ ] The Packet 4 runtime interfaces consumed by Homework are verified.
- [ ] Integration Pilot Gate complete.
- [ ] Packet 5 risk-scaled change contract is consistent with the PRD.

Scope:
- [ ] Implement Book Homework target selection, frozen assignment manifest, per-Activity bindings, nested deadlines, scheduled access, Activity-level submission/completion/progress, and per-Activity homework settings mapping.
- [ ] Implement explicit `accountable`/`practice` assignment intent and Book-specific signals-only integrity behavior.
- [ ] Update teacher and student homework surfaces.

Do not:
- [ ] Do not implement whole-Book submit.
- [ ] Do not display an unapproved aggregate Book grade.
- [ ] Do not let browsing/Solo progress silently satisfy Homework.

Exit criteria:
- [ ] Homework creation/detail/list regressions pass.
- [ ] Book Homework schedule/progress/settings tests pass.
- [ ] Findings record final Book Homework manifest path and aggregation owner.
- [ ] If the conditional handoff rule triggers, it records the verified Homework manifest/attempt interfaces and open work.

## Packet 6 - Updates, Checkpoints, Notifications

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-06-updates-checkpoints-notifications.md`

Entry criteria:
- [ ] Packet 5 Homework interfaces consumed by updates/checkpoints are verified.
- [ ] Packet 6 risk-scaled change contract is consistent with the PRD.

Scope:
- [ ] Implement Affected Homework Review, semantic update planning, selective update application, Review Checkpoints, regrade-only flows, persistent notifications, audit, idempotent retry, and deadline validation.

Do not:
- [ ] Do not update active homework silently.
- [ ] Do not duplicate checkpoints or notifications on retry.
- [ ] Do not reveal hidden answers early through checkpoints or notifications.

Exit criteria:
- [ ] Full homework update matrix tests pass.
- [ ] Notification Bell behavior tests pass.
- [ ] Regrade/checkpoint feedback visibility tests pass.
- [ ] If the conditional handoff rule triggers, it records the verified update/checkpoint/notification interfaces and open work.

## Packet 7 - Cross-Feature Delivery And Results

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-07-cross-feature-delivery-results.md`

Entry criteria:
- [ ] Only Packet 6 interfaces actually consumed by this cross-feature slice must be verified; independent Solo/Course/Class/result adapters may proceed from earlier verified contracts.
- [ ] Packet 7 risk-scaled change contract is consistent with the PRD.

Scope:
- [ ] Extend the foundation Book Delivery module for Homework, Course, Class, and public contexts.
- [ ] Implement exact Placement binding, context-scoped drafts/attempts/completion, Activity result grouping, Course/Class placement support, and Content Catalog browse/resolve seams.
- [ ] Implement Public Library source-rights states, public-safe projections, and blocked/allowed launch behavior.

Do not:
- [ ] Do not resolve Course/Class Book access by bare `materialId`.
- [ ] Do not expose private Solo attempts to teacher-owned result views.
- [ ] Do not implement Book Live Session execution in V1.

Exit criteria:
- [ ] Cross-feature delivery tests pass.
- [ ] Result grouping and visibility regressions pass.
- [ ] Course/Class exact placement tests pass.
- [ ] If the conditional handoff rule triggers, it records verified cross-feature adapters and release-hardening blockers.

## Packet 8 - Full V1 Validation, Hardening, Release

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-08-pilot-hardening-release.md`

Entry criteria:
- [ ] Packet 8 validation may start incrementally from each verified Packet 1-7 outcome; final V1 sign-off waits for every required outcome and accepted deferral/approval gate.
- [ ] Packet 8 release contract covers all changed trust, migration, browser, performance/cost, rollback, and deployed-state boundaries.

Scope:
- [ ] Complete rules/emulator coverage, observability, announcements, regression testing, browser verification, full-V1 validation Units, acceptance criteria reconciliation, and release closure notes.
- [ ] Pass the shippable-pilot gate with production authenticated source ingress, deployed private rendition/grant delivery, context-bound authorization, cleanup/retry proof, representative performance/cost evidence, and authoritative Worker/R2/Firebase readback where claimed.

Do not:
- [ ] Do not mark PRD0062 accepted while any acceptance criterion lacks source/test/browser/findings evidence.
- [ ] Do not treat validation screenshots as substitutes for automated security/versioning tests.

Exit criteria:
- [ ] All PRD V1 acceptance criteria pass or are explicitly deferred with owner approval.
- [ ] Browser verification matrix is recorded.
- [ ] Findings, taskboxes, implementation logs, tests, and source state agree.
- [ ] A final handoff exists only when release remains blocked or ownership transfers; otherwise the release record is the final authority.
