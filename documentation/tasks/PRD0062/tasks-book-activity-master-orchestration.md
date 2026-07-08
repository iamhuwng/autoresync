# Master Task List: PRD0062 Book-Based Interactive Activity Runtime and Assembly Workspace

Status: Draft orchestration record. This file coordinates implementation across multiple task lists and conversations.
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

## Purpose

- [ ] Use this master task list to split the PRD0062 implementation across multiple conversations without losing dependency order.
- [ ] Treat component task lists as the source of truth for exact implementation tasks.
- [ ] Treat this file as the source of truth for conversation boundaries, entry criteria, exit criteria, packet order, and handoffs.
- [ ] Do not replace, weaken, or skip any component task-list task from this file.
- [ ] Do not mark a master packet complete unless the mapped component parent acceptance is also satisfied.
- [ ] Keep the implementation aligned with the PRD authority statement: extend the existing Book system; do not create a second `ActivityBook` product.

## Execution Model

- [ ] Use one long-lived implementation branch or worktree for the package unless the user explicitly chooses separate branches.
- [ ] Implement one packet per conversation by default.
- [ ] A conversation may stop mid-packet only with a handoff note that records exact remaining subtasks.
- [ ] Each new conversation must start by reading this master task list, the relevant component task list, the PRD, AGENTS.md, and the latest findings/handoff notes.
- [ ] Each implementation conversation must also read `documentation/architecture/book-activity-runtime-and-assembly.md` before changing PRD0062 code or architecture docs.
- [ ] Keep findings append-only. Do not rewrite old implementation narrative as if it was always current.
- [ ] Keep commits packet-scoped where practical:
  - one commit for Activity domain/security foundation;
  - one commit for source PDF delivery;
  - one commit for Assembly Workspace;
  - one commit for Activity Runtime;
  - one commit for Book Homework;
  - one commit for update/checkpoint/notification flows;
  - one commit for cross-feature delivery/results;
  - one commit for pilot hardening and release closure.
- [ ] Never use a commit boundary as proof of completion. Tests, findings, and acceptance criteria are required.

## Dirty Workspace Policy

- [ ] Start every packet by recording `git status --short --branch`, `git status --short --untracked-files=all`, and `git rev-parse HEAD`.
- [ ] Stop before writing feature code if dirty paths are unrelated to the packet or cannot be fenced.
- [ ] Do not stage, rewrite, or normalize unrelated existing dirty files.
- [ ] Record allowed dirty paths in the packet handoff.
- [ ] Use exact-path staging if a packet reaches commit scope.

## Global Stop Conditions

- [ ] Stop if the PRD, this master task list, a required component task list, or `AGENTS.md` is missing or unreadable.
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
- [ ] Stop if source delivery cannot prove excerpt-only access, private source input, authorization binding, and negative access cases.
- [ ] Stop if Course/Class integration cannot resolve exact Course material placement/context.
- [ ] Stop if tests are replaced by screenshots, console logs, or visual inspection for security, rules, versioning, update, or permission behavior.
- [ ] Stop if taskboxes, findings, source behavior, tests, and implementation state disagree.

## Mandatory Packet Handoff File

Every implementation packet must create or update a dedicated handoff file before final response. This is required even when the packet is blocked or partial.

Handoff path pattern:

- [ ] `documentation/tasks/PRD0062/handoff-book-activity-packet-[N].md`

Required handoff sections:

- [ ] `# Handoff`
- [ ] `## Working Folder`
  - Packet id and status: `COMPLETE`, `PARTIAL`, or `BLOCKED`.
  - Date/time.
  - Worktree path.
  - Branch, commit, and `git status --short` summary.
- [ ] `## Next Session Focus`
  - Exact next packet to run, or blocker-resolution focus.
- [ ] `## Current State`
  - Source docs read.
  - Component task-list phases/subtasks completed.
  - Files changed.
  - Findings files updated.
- [ ] `## Decisions And Constraints`
  - Decisions made.
  - Stop conditions, scope constraints, and deferred packet boundaries.
- [ ] `## Verification`
  - Tests/commands run with pass/fail summary.
  - Browser proof artifacts, if any.
- [ ] `## Remaining Work`
  - Blockers, unresolved risks, or deferred residue.
- [ ] `## Copy-Paste Prompt For Next Codex App Conversation`
  - Copy-paste prompt for the next conversation, or blocker-resolution prompt.
- [ ] `## Suggested Skills`
- [ ] `## Sensitive Data Handling`

Final response must include:

- [ ] Packet status.
- [ ] Handoff file path.
- [ ] Findings files updated.
- [ ] Blockers, if any.
- [ ] Next recommended packet.

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

Do not implement later packets.
Do not skip tests.
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
  │   │           └─ Packet 5 Book Homework
  │   │               └─ Packet 6 Updates / Checkpoints / Notifications
  │   │                   └─ Packet 7 Cross-feature Delivery / Results
  │   │                       └─ Packet 8 Pilot / Hardening / Release
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

Do not:
- [ ] Do not write feature code.
- [ ] Do not create production data nodes.
- [ ] Do not mark later packet taskboxes complete.

Exit criteria:
- [ ] `findings-book-activity-baseline.md` contains baseline evidence.
- [ ] Every component task list has confirmed likely owner paths or explicit unknowns.
- [ ] Next packet can start without rediscovering current owners.
- [ ] `documentation/tasks/PRD0062/handoff-book-activity-packet-0.md` exists and contains the copy-paste prompt for Packet 1 or blocker-resolution work.

## Packet 1 - Activity Domain And Security Foundation

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md`

Entry criteria:
- [ ] Packet 0 complete.
- [ ] Dirty workspace paths are fenced or clean.

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

Scope:
- [ ] Implement immutable Source Version metadata and upload/version creation path.
- [ ] Select a backend PDF excerpt engine behind an adapter.
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

Scope:
- [ ] Add `unit` Book node support while preserving legacy `test` behavior.
- [ ] Implement manifest candidate import, Page Groups, Placements, Unit Activity JSON import, reconciliation, page-mapping editor, preview, staged Unit publication, and revision-by-JSON.
- [ ] Add teacher Assembly Workspace route/UI using shared/native controls.

Do not:
- [ ] Do not remove existing Book editor capabilities.
- [ ] Do not add Mantine.
- [ ] Do not let invalid import mutate current draft or publication.

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
- [ ] Packet 3 complete enough to provide Book Delivery projection fixtures.

Scope:
- [ ] Implement shared Activity renderer for V1 interaction families.
- [ ] Implement desktop split runtime, structured/source-assisted modes, single-page PDF navigation, sticky navigator, autosave, Activity submission/review, and mobile tabs.
- [ ] Launch through the existing asynchronous student entry pattern with one thin Book dispatch branch.

Do not:
- [ ] Do not make runtime read authoring records directly.
- [ ] Do not implement Homework/Course/Class rules inside runtime components.
- [ ] Do not create custom per-Unit React renderers.

Exit criteria:
- [ ] Runtime component tests pass.
- [ ] Autosave/reload tests pass.
- [ ] Existing Reading, Listening, Writing, THCS, and Reading V2 StudentPracticePage launch regressions pass.
- [ ] Packet 4 handoff exists and contains the prompt for Packet 5.

## Packet 5 - Book Homework

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-05-book-homework.md`

Entry criteria:
- [ ] Packet 4 complete.

Scope:
- [ ] Implement Book Homework target selection, frozen assignment manifest, per-Activity bindings, nested deadlines, scheduled access, Activity-level submission/completion/progress, and per-Activity homework settings mapping.
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

Scope:
- [ ] Implement Book Delivery for Solo, Homework, Course, and Class contexts.
- [ ] Implement exact Placement binding, context-scoped drafts/attempts/completion, Activity result grouping, Course/Class placement support, and Content Catalog browse/resolve seams.

Do not:
- [ ] Do not resolve Course/Class Book access by bare `materialId`.
- [ ] Do not expose private Solo attempts to teacher-owned result views.
- [ ] Do not implement Book Live Session execution in V1.

Exit criteria:
- [ ] Cross-feature delivery tests pass.
- [ ] Result grouping and visibility regressions pass.
- [ ] Course/Class exact placement tests pass.
- [ ] Packet 7 handoff exists and contains the prompt for Packet 8.

## Packet 8 - Pilot, Hardening, Release

Mapped task list:
- `documentation/tasks/PRD0062/tasks-book-activity-08-pilot-hardening-release.md`

Entry criteria:
- [ ] Packets 1 through 7 complete.

Scope:
- [ ] Complete rules/emulator coverage, observability, announcements, regression testing, browser verification, pilot Units, acceptance criteria reconciliation, and release closure notes.

Do not:
- [ ] Do not mark PRD0062 accepted while any acceptance criterion lacks source/test/browser/findings evidence.
- [ ] Do not treat pilot screenshots as substitutes for automated security/versioning tests.

Exit criteria:
- [ ] All PRD V1 acceptance criteria pass or are explicitly deferred with owner approval.
- [ ] Browser verification matrix is recorded.
- [ ] Findings, taskboxes, implementation logs, tests, and source state agree.
- [ ] Packet 8 handoff exists with final closure or release blockers.
