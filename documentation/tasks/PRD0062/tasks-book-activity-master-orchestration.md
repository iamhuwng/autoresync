# Master Task List: PRD0062 Book-Based Interactive Activity Runtime and Assembly Workspace

Status: Draft orchestration record. This file coordinates implementation across multiple task lists and conversations.
Created: 2026-07-09

Primary PRD requirement body:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Accepted current PRD0062 amendment:
- `documentation/tasks/PRD0062/PRD0062-architecture-and-delivery-amendment-2026-08-15.md`

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

- [ ] Use this master task list to split the PRD0062 implementation across multiple conversations without losing dependency order.
- [ ] Treat the PRD requirement body together with accepted current PRD0062 amendments as the product and architecture requirements authority. The 2026-08-15 amendment governs discovered Book Homework compatibility, trusted-projection, production-composition, independent-review, and browser-handoff requirements.
- [ ] Treat component task lists as subordinate execution checklists. If a task conflicts with or weakens the PRD or an accepted amendment, stop and reconcile the task before implementation.
- [ ] Treat this file as the sequencing authority for conversation boundaries, entry criteria, exit criteria, packet order, and handoffs only.
- [ ] Do not replace, weaken, or skip any component task-list task from this file.
- [ ] Do not mark a master packet complete unless the mapped component parent acceptance is also satisfied.
- [ ] Keep the implementation aligned with the PRD authority statement: extend the existing Book system; do not create a second `ActivityBook` product.

## Execution Model

- [ ] Use one packet-scoped implementation branch or worktree at a time. A separate integration branch may collect completed packet commits only after packet exit criteria pass; do not implement all phases directly in one long-lived branch.
- [ ] Implement one packet per conversation by default.
- [ ] A conversation may stop mid-packet only with a handoff note that records exact remaining subtasks.
- [ ] Each new conversation must start by reading this master task list, the relevant component task list, the PRD requirement body, accepted current PRD0062 amendments (including `PRD0062-architecture-and-delivery-amendment-2026-08-15.md`), AGENTS.md, `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`, and the latest findings/handoff notes.
- [ ] Each implementation conversation must also read `documentation/architecture/book-activity-runtime-and-assembly.md` before changing PRD0062 code or architecture docs.
- [ ] Keep findings append-only. Do not rewrite old implementation narrative as if it was always current.
- [ ] Label evidence as `Historical evidence`, `Current live contract`, `Superseded claim`, or `Open blocker` when updating findings, handoffs, traceability, or architecture notes.
- [ ] Do not collapse implementation, review, verification, closure, commit, rollout, or next-packet approval into one status.
- [ ] Track every packet with this phase state: `PLANNED`, `IMPLEMENTING`, `IMPLEMENTED_UNREVIEWED`, `REVIEW_BLOCKED`, `VERIFIED`, `CLOSURE_BLOCKED`, or `CLOSED`.
- [ ] Do not start a dependent packet while the current packet is `IMPLEMENTED_UNREVIEWED`, `REVIEW_BLOCKED`, or `CLOSURE_BLOCKED`, unless the dependency is explicitly severed in a handoff and approved by the user.
- [ ] Keep commits packet-scoped where practical:
  - one commit for Activity domain/security foundation;
  - one commit for source PDF delivery;
  - one commit for Assembly Workspace;
  - one commit for Activity Runtime;
  - one commit for Book Homework;
  - one commit for update/checkpoint/notification flows;
  - one commit for cross-feature delivery/results;
  - one commit for pilot hardening and release closure.
- [ ] Never use a commit boundary as proof of completion. Tests, findings, traceability, architecture/current-state docs, and acceptance criteria are required.

## Mandatory Pre-Code Packet Contract

Before source changes begin in any implementation packet, create:

- [ ] `documentation/tasks/PRD0062/contracts-book-activity-packet-[N].md` from `documentation/tasks/PRD0062/contracts-book-activity-packet-template.md`

Each packet contract must define:

- [ ] Mission ledger: original mission, current slice, in-scope work, out-of-scope work, completion boundary, separate approval gates, blockers, next dependency, and non-actions.
- [ ] Storage contract, including paths/stores touched, ownership, student-safe projection boundary, and per-store negative security tests.
- [ ] Rules/security contract, including positive and negative authorization proof.
- [ ] UI contract, or an explicit `not applicable` rationale.
- [ ] Migration/compatibility contract for existing data and behavior.
- [ ] Focused, adjacent, regression, and boundary test contract.
- [ ] Browser-proof checklist, or an explicit `not applicable` rationale.
- [ ] Proof classification table with rows for local source proof, local integration proof, type/build proof, emulator/rules proof, browser proof, remote/deployed proof, rollback/recovery proof, and proof explicitly not required for this packet.
- [ ] Authority reconciliation table using this shape:

```text
| Requirement / invariant | PRD section | Source owner path | Rules/security boundary | Test file + test title | Negative/mutation proof | Architecture/current-state doc | Findings row | Traceability row | Taskbox ID | Status |
```

- [ ] Evidence acceptance table for every verification claim:

```text
| Claim | Command | Working directory | Runner/config | Exit code | Files/tests in scope | Tests actually executed | Product failure or harness failure | Result |
```

Packet 0 must also create a storage-design packet covering Activity materials, drafts, candidates, versions, student-safe projections, source versions, manifest versions, Page Groups, Placements, Book Homework manifests, attempts, autosave drafts, Review Checkpoints, integrity logs, update audits, notifications, and public projections. For every store/path, record owning service, immutable/mutable fields, indexes, read/write authority, student-safe projection boundary, migration behavior, deletion/archive behavior, backup coverage, per-store negative security tests, and the local integration proof that exercises the store through its owning service rather than by direct fixture-only mutation.

## Dirty Workspace Policy

- [ ] Start every packet by recording `rtk git status --short --branch`, `rtk git status --short --untracked-files=all`, and `rtk git rev-parse HEAD`; `No hook installed` is a warning, not a failure.
- [ ] Also record `git diff --name-only` and `git diff --cached --name-only` before writing.
- [ ] Classify every dirty or untracked path as `owned by this packet`, `pre-existing staged work`, `pre-existing unstaged work`, `user-owned unrelated work`, `generated artifact`, or `must-not-touch`.
- [ ] Stop before writing feature code if dirty paths are unrelated to the packet or cannot be fenced.
- [ ] Do not stage, rewrite, normalize, or format unrelated existing dirty files.
- [ ] Record allowed dirty paths in the packet handoff.
- [ ] Use exact-path staging if a packet reaches commit scope.
- [ ] Never use `git add .` or `git add -A` for PRD0062 packet closure.
- [ ] Verify staged paths with `git diff --cached --name-only` before commit.

## Global Stop Conditions

- [ ] Stop if the PRD, this master task list, a required component task list, or `AGENTS.md` is missing or unreadable.
- [ ] Stop if `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md` is unread or contradicted by the packet plan.
- [ ] Stop if a triggered rule document conflicts with this task list. Record the conflict and ask for direction.
- [ ] Stop if implementation would create a parallel Book product instead of extending the existing Book system.
- [ ] Stop if implementation would import, call, extend, or depend on the obsolete PDF parser path:
  - `src/services/file-extractor/file.extractor.ts`
  - `src/parsers/pdfParser.js`
- [ ] Stop if implementation would expose full source PDFs, answer-key pages, teacher notes, authoring data, hidden Interaction IDs, source provenance, or full diff payloads to students.
- [ ] Stop if implementation requires changing Reading V2 or Listening storage/contracts merely to support Book Activities.
- [ ] Stop if Book Runtime starts accumulating Homework, Course, Class, or Solo access rules instead of consuming Book Delivery projections.
- [ ] Stop if new RTDB nodes, Firestore collections, R2/Worker paths, routes, user actions, or notifications lack rules, indexes where needed, backup coverage where needed, observability, and tests.
- [ ] Stop if cross-system operations require fake RTDB/Firestore/Cloudflare atomicity.
- [ ] Stop if local proof is used to close a deployed/current-state claim without remote evidence such as Worker version/bindings, R2 object proof, Firebase/Hosting state, Cloudflare REST, or Wrangler dry-run.
- [ ] Stop if source delivery cannot prove excerpt-only access, private source input, authorization binding, and negative access cases.
- [ ] Stop if Course/Class integration cannot resolve exact Course material placement/context.
- [ ] Stop if tests are replaced by screenshots, console logs, or visual inspection for security, rules, versioning, update, or permission behavior.
- [ ] Stop if a test claim omits command, working directory, runner/config, exit code, or proof that relevant tests actually executed.
- [ ] Stop if reviewer PASS omits method, inspected scope, risk model, validation, or residual-risk notes.
- [ ] Stop if taskboxes, findings, source behavior, tests, implementation logs, traceability, architecture/current-state docs, and implementation state disagree.
- [ ] Stop if stale claims such as `docs-only`, `no source/tests changed`, `only wrapper`, old proof counts, old line counts, or contradicted design claims remain uncorrected in active docs.
- [ ] Stop if the current packet contract is missing, incomplete, or contradicted by proposed source changes.
- [ ] Stop before any Packet 1 source change unless all Packet 1-relevant traceability rows have exact source owner path or explicit N/A, rules/security boundary or explicit N/A, test file plus exact test title or explicit N/A, negative/mutation proof requirement, architecture/current-state doc target, findings row target, completed Packet 1 contract, completed storage-design packet, and Packet 0 findings rows resolved or explicitly marked blocked.

## Review And Closure Protocol

- [ ] Request independent review only after the current diff, packet contract, findings, traceability, and authority docs are inspectable.
- [ ] Give reviewers the exact changed-file list, exact packet scope, required PRD sections, known dirty-path cautions, and explicit non-scope.
- [ ] Reviewer PASS is scoped evidence only. It cannot close uninspected files, tests not rerun, remote proof not gathered, or docs not reconciled.
- [ ] If a reviewer times out, hits usage limits, omits inspected scope, omits risk model, or says tests were not rerun, record it as weak or unusable evidence.
- [ ] Main agent owns final PASS/BLOCKED judgment after inspecting the actual diff and verification evidence.
- [ ] Before closure, run stale-claim scans over touched PRD0062 docs, findings, handoffs, traceability, and architecture/current-state docs for obsolete proof language.
- [ ] Before closure, reconcile every completed taskbox against source path, test proof, findings row, traceability row, and architecture/current-state doc.
- [ ] Mark packet `VERIFIED` only after accepted review and fresh proof after the final edit.
- [ ] Mark packet `CLOSED` only when verified implementation plus docs, findings, traceability, handoff, dirty-path scope, and separate approval gates agree.

## Mandatory Packet Handoff File

Every implementation packet must create or update a dedicated handoff file before final response. This is required even when the packet is blocked or partial.

Handoff path pattern:

- [ ] `documentation/tasks/PRD0062/handoff-book-activity-packet-[N].md`

Required handoff sections:

- [ ] `# Handoff`
- [ ] `## Working Folder`
  - Packet id and status: `COMPLETE`, `PARTIAL`, or `BLOCKED`.
  - Phase state: `PLANNED`, `IMPLEMENTING`, `IMPLEMENTED_UNREVIEWED`, `REVIEW_BLOCKED`, `VERIFIED`, `CLOSURE_BLOCKED`, or `CLOSED`.
  - Date/time.
  - Worktree path.
  - Branch, commit, and `git status --short` summary.
- [ ] `## Mission Ledger`
  - Original mission, current slice, in scope, out of scope, completion boundary, separate approval gates, blockers, next dependency, and non-actions.
- [ ] `## Next Session Focus`
  - Exact next packet to run, or blocker-resolution focus.
- [ ] `## Current State`
  - Source docs read.
  - Component task-list phases/subtasks completed.
  - Files changed.
  - Findings files updated.
  - Current live contract versus historical/superseded evidence.
- [ ] `## Decisions And Constraints`
  - Decisions made.
  - Stop conditions, scope constraints, and deferred packet boundaries.
- [ ] `## Verification`
  - Tests/commands run with pass/fail summary.
  - Browser proof artifacts, if any.
  - Local proof, emulator/rules proof, browser proof, remote/deployed proof, and proof explicitly not required.
- [ ] `## Review Evidence`
  - Reviewer method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks.
- [ ] `## Authority Reconciliation`
  - Requirement/source/test/negative-proof/docs/findings/traceability/taskbox mapping for completed work.
- [ ] `## Remaining Work`
  - Blockers, unresolved risks, inherited unverified claims, failed or unusable attempts, or deferred residue.
- [ ] `## Copy-Paste Prompt For Next Codex App Conversation`
  - Copy-paste prompt for the next conversation, or blocker-resolution prompt.
- [ ] `## Suggested Skills`
- [ ] `## Sensitive Data Handling`

Final response must include:

- [ ] Packet status and phase state.
- [ ] Handoff file path.
- [ ] Findings files updated.
- [ ] Authority reconciliation status.
- [ ] Verification commands/proof classes completed.
- [ ] Review evidence status.
- [ ] Blockers, if any.
- [ ] Next recommended packet or explicit closure blocker.

## Conversation Kickoff Template

Use this template when starting a new implementation conversation:

```text
Implement Packet [N] from:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation\tasks\PRD0062\tasks-book-activity-master-orchestration.md

Worktree:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Follow:
- AGENTS.md
- documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md
- the packet entry criteria
- mapped PRD0062 component task list
- existing findings/handoff notes
- documentation/tasks/PRD0062/contracts-book-activity-packet-[N].md

Start by recording state proof and dirty-path classification.
Use the phase state model from the master task list.
Keep local proof, emulator/rules proof, browser proof, remote/deployed proof, and closure proof separate.
Do not implement later packets.
Do not skip tests.
Do not use screenshots or console logs as substitutes for security/rules/versioning/update proof.
Stop and report if packet stop conditions trigger.
Before final response, create or update documentation/tasks/PRD0062/handoff-book-activity-packet-[N].md using the mandatory handoff format from the master task list.
```

## Packet Dependency Graph

```text
Packet 0 Baseline
  ├─ Packet 1 Activity Domain
  │   ├─ Packet 2 Source PDF Delivery
  │   │   └─ Packet 3 Assembly Workspace
  │   │       └─ Packet 4 Activity Runtime
  │   │           └─ Foundation Pilot Gate
  │   │               └─ Packet 5 Book Homework
  │   │                   └─ Packet 6 Updates / Checkpoints / Notifications
  │   │                       └─ Packet 7 Cross-feature / Public Delivery / Results
  │   │                           └─ Packet 8 Full V1 Validation / Hardening / Release
```

## Packet 0 - Baseline And Ownership Map

Mapped task lists:
- `documentation/tasks/PRD0062/findings-book-activity-baseline.md`
- All component task lists for read-only validation.

Entry criteria:
- [ ] No implementation packet has started.

Scope:
- [ ] Read the PRD, this master task list, all component task lists, `AGENTS.md`, and triggered rule docs.
- [ ] Record branch, commit, dirty paths, untracked paths, and whether the PRD/task files are tracked.
- [ ] Inspect current owners for Book metadata, Book nodes, material refs, material capability decisions, homework assignment, homework submission, student launcher, solo resume/submission, result attempt grouping, result visibility, notification creation/display, Course/Class placement, routes, feature registry, route security, Firebase rules, R2/Worker source delivery, and backup coverage.
- [ ] Record exact missing owners and technical spikes.
- [ ] Record which existing tests must be preserved as regression coverage.
- [ ] Confirm the obsolete PDF parser remains excluded from all proposed implementation paths.
- [ ] Create the storage-design packet with every required store/path contract from the PRD.
- [ ] Create or update `documentation/tasks/PRD0062/traceability-book-activity-v1.md` with initial requirement rows for all PRD V1 acceptance criteria and packet-owned invariants.
- [ ] Reconcile all component task lists against the current PRD before Packet 1 starts.

Do not:
- [ ] Do not write feature code.
- [ ] Do not create production data nodes.
- [ ] Do not mark later packet taskboxes complete.

Exit criteria:
- [ ] `findings-book-activity-baseline.md` contains baseline evidence.
- [ ] Every component task list has confirmed likely owner paths or explicit unknowns.
- [ ] Storage-design packet exists and covers ownership, authority, migration, backup, archive/deletion, indexes, and negative tests for every planned store.
- [ ] Traceability file exists and maps PRD acceptance criteria plus Packet 1 invariants to initial packet owners.
- [ ] Packet 1-relevant traceability rows have exact source owner path or explicit N/A, rules/security boundary or explicit N/A, test file plus exact test title or explicit N/A, negative/mutation proof requirement, architecture/current-state doc target, and findings row target.
- [ ] Storage-design packet exists and is complete enough for Packet 1 source paths and security boundaries.
- [ ] Baseline findings TBD/shell rows relevant to Packet 1 are resolved or explicitly marked blocked.
- [ ] Packet 1 pre-code contract exists and contains all mandatory contract sections.
- [ ] Next packet can start without rediscovering current owners.
- [ ] `documentation/tasks/PRD0062/handoff-book-activity-packet-0.md` exists and contains the copy-paste prompt for Packet 1 or blocker-resolution work.

## Packet 1 - Activity Domain And Security Foundation

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md`

Entry criteria:
- [ ] Packet 0 complete.
- [ ] Dirty workspace paths are fenced or clean.
- [ ] Packet 1-relevant traceability rows have exact source owner path or explicit N/A, rules/security boundary or explicit N/A, test file plus exact test title or explicit N/A, negative/mutation proof requirement, architecture/current-state doc target, and findings row target.
- [ ] Storage-design packet is complete for Packet 1 source paths and security boundaries.
- [ ] Packet 0 findings TBD/shell rows relevant to Packet 1 are resolved or explicitly marked blocked.
- [ ] Packet 1 pre-code contract is complete and consistent with the PRD.

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
- [ ] Component task-list parent acceptance passes.
- [ ] Schema/domain tests pass.
- [ ] Security/rules tests for new Activity paths pass.
- [ ] Findings record exact Activity domain owner paths.
- [ ] Packet 1 handoff exists and contains the prompt for Packet 2.

## Packet 2 - Source PDF Delivery

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-02-source-pdf-delivery.md`

Entry criteria:
- [ ] Packet 0 complete.
- [ ] Packet 1 complete, or source metadata interfaces are explicitly stubbed and documented as blocked from production use.
- [ ] Packet 2 pre-code contract is complete and consistent with the PRD.

Scope:
- [ ] Implement immutable Source Version metadata and upload/version creation path.
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
- [ ] Packet 2 handoff exists and contains the prompt for Packet 3.

## Packet 3 - Book Assembly Workspace

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-03-book-assembly-workspace.md`

Entry criteria:
- [ ] Packet 1 complete.
- [ ] Packet 2 complete enough to provide Source Version and page-bound validation contracts.
- [ ] Packet 3 pre-code contract is complete and consistent with the PRD.

Scope:
- [ ] Add `unit` Book node support while preserving legacy `test` behavior.
- [ ] Implement manifest candidate import, Page Groups, Placements, Unit Activity JSON import, reconciliation, page-mapping editor, preview, staged Unit publication, and revision-by-JSON.
- [ ] Add teacher Assembly Workspace route/UI using shared/native controls.

Do not:
- [ ] Do not remove existing Book editor capabilities.
- [ ] Do not add Mantine.
- [ ] Do not let invalid import mutate current draft or publication.
- [ ] Do not implement Book Homework, Affected Homework Review, or selective update behavior.
- [ ] Do not enforce new Book Activity invariants inside an untyped `// @ts-nocheck` seam without a typed wrapper or cleanup.

Exit criteria:
- [ ] Book structure, manifest, reconciliation, and Assembly Workspace tests pass.
- [ ] Existing Book create/edit/publish regressions pass.
- [ ] Findings record final storage paths and UI route IDs.
- [ ] Packet 3 handoff exists and contains the prompt for Packet 4.

## Packet 4 - Activity Runtime

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-04-activity-runtime.md`

Entry criteria:
- [ ] Packet 1 complete.
- [ ] Packet 2 complete.
- [ ] Packet 3 complete enough to provide published Unit, source, Placement, and Page Group contracts.
- [ ] Packet 4 pre-code contract is complete and consistent with the PRD.

Scope:
- [ ] Implement the minimum Book-owned Solo/preview delivery resolver and student-safe runtime projection required by the foundation pilot.
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
- [ ] Foundation Pilot Gate passes before Packet 5 starts.
- [ ] Packet 4 handoff exists and contains the foundation-pilot result plus the prompt for Packet 5 or blocker-resolution work.

## Foundation Pilot Gate - After Packet 4

Scope:
- [ ] Run one representative Unit from one supplied source through immutable upload, manifest import, Unit Activity JSON import, mapping repair, Assembly preview, Unit publication, desktop/mobile Solo or preview runtime, server-backed autosave, and Activity-level submission/result.
- [ ] Record correction rate, unsupported interaction patterns, import errors, runtime issues, teacher effort, automated test proof, and browser proof.

Do not:
- [ ] Do not implement or exercise Book/subtree Homework, selective updates, Review Checkpoints, Course/Class delivery, public playable source-assisted Books, or integrity rollout inside this gate.

Exit criteria:
- [ ] Foundation pilot behavior, tests, browser proof, findings, taskboxes, and dirty paths agree.
- [ ] Pilot blockers are resolved or explicitly block Packet 5.

## Packet 5 - Book Homework

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-05-book-homework.md`

Entry criteria:
- [ ] Packet 4 complete.
- [ ] Foundation Pilot Gate complete.
- [ ] Packet 5 pre-code contract is complete and consistent with the PRD.

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
- [ ] Packet 5 handoff exists and contains the prompt for Packet 6.

## Packet 6 - Updates, Checkpoints, Notifications

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-06-updates-checkpoints-notifications.md`

Entry criteria:
- [ ] Packet 5 complete.
- [ ] Packet 6 pre-code contract is complete and consistent with the PRD.

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
- [ ] Packet 6 handoff exists and contains the prompt for Packet 7.

## Packet 7 - Cross-Feature Delivery And Results

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-07-cross-feature-delivery-results.md`

Entry criteria:
- [ ] Packet 6 complete.
- [ ] Packet 7 pre-code contract is complete and consistent with the PRD.

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
- [ ] Packet 7 handoff exists and contains the prompt for Packet 8.

## Packet 8 - Full V1 Validation, Hardening, Release

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-08-pilot-hardening-release.md`

Entry criteria:
- [ ] Packets 1 through 7 complete.
- [ ] Packet 8 pre-code contract is complete and consistent with the PRD.

Scope:
- [ ] Complete rules/emulator coverage, observability, announcements, regression testing, browser verification, full-V1 validation Units, acceptance criteria reconciliation, and release closure notes.

Do not:
- [ ] Do not mark PRD0062 accepted while any acceptance criterion lacks source/test/browser/findings evidence.
- [ ] Do not treat validation screenshots as substitutes for automated security/versioning tests.

Exit criteria:
- [ ] All PRD V1 acceptance criteria pass or are explicitly deferred with owner approval.
- [ ] Browser verification matrix is recorded.
- [ ] Findings, taskboxes, implementation logs, tests, and source state agree.
- [ ] Packet 8 handoff exists with final closure or release blockers.
