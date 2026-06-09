# Master Task List: PRD-0052 Part 2 And PRD-0054 Implementation Orchestration

Status: Draft orchestration tasklist only. This file coordinates implementation across multiple conversations.
Created: 2026-06-09

Primary PRDs:
- `documentation/tasks/0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/0054-prd-reading-passage-archive-and-master-repair.md`

Primary detailed tasklists:
- `documentation/tasks/tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md`

Findings files:
- `documentation/tasks/findings-of-tasks-0052-part-2-prd-reading-v2-composition-first-master-tests.md`
- `documentation/tasks/findings-of-tasks-0054-prd-reading-passage-archive-and-master-repair.md`

## Purpose

- [ ] Use this master tasklist to split the implementation across multiple conversations without losing dependency order.
- [ ] Treat detailed PRD tasklists as the source of truth for exact implementation tasks.
- [ ] Treat this file as the source of truth for conversation boundaries, entry criteria, exit criteria, and handoffs.
- [ ] Do not replace, weaken, or skip any detailed tasklist task from this file.
- [ ] Do not mark a master packet complete unless the mapped detailed tasklist phase parent acceptance is also satisfied.

## Execution Model

- [ ] Use one long-lived implementation branch or worktree for the package unless user explicitly chooses separate branches.
- [ ] Implement one packet per conversation by default.
- [ ] A conversation may stop mid-packet only with a handoff note that records exact remaining subtasks.
- [ ] Each new conversation must start by reading this master tasklist, the relevant detailed tasklist phase, and the latest findings/handoff notes.
- [ ] Keep PRD-0052 and PRD-0054 findings separate even when one packet touches both PRDs.
- [ ] Keep commits phase-scoped where practical:
  - one commit for foundation services/rules
  - one commit for publish/storage
  - one commit for modal/UI flows
  - one commit for assignment/runtime/result safety
  - one commit for archive/repair lifecycle
  - one commit for docs/browser-proof cleanup
- [ ] Never use a commit boundary as proof of completion. Tests, findings, and acceptance criteria are required.

## Global Stop Conditions

- [ ] Stop if required source PRD or tasklist files are missing or unreadable.
- [ ] Stop if `AGENTS.md` or a triggered rule doc conflicts with a tasklist. Record the conflict and ask for direction.
- [ ] Stop if implementation requires broad canonical scans for duplicate detection.
- [ ] Stop if audit events cannot be written to `reading_v2/audit_events/{eventId}` with append-only write, super-admin read, and unsafe-field rejection.
- [ ] Stop if any path would expose answer keys, canonical payload, scoring rules, AI evidence, hidden provenance, or import evidence to student/UI/index/audit surfaces where prohibited.
- [ ] Stop if a phase needs fake RTDB/Firestore atomicity.
- [ ] Stop if PRD-0054 master repair UI would start before PRD-0052 marks the dependency `READY`.
- [ ] Stop if an agent cannot identify the exact current owner for a storage path, route, service, or UI surface required by the packet.
- [ ] Stop if tests are being replaced by screenshots, console logs, or visual inspection for behavior that should be unit/integration tested.
- [ ] Stop if a packet would require broad unrelated Mantine cleanup or teacher shell redesign.

## Mandatory Packet Handoff File

Every packet must create or update a dedicated handoff file before final response. This is required even when the packet is blocked or partial.

Handoff path pattern:

- [ ] `documentation/tasks/handoff-0052-0054-packet-[N].md`

Required handoff content:

- [ ] Packet id and status: `COMPLETE`, `PARTIAL`, or `BLOCKED`.
- [ ] Date/time.
- [ ] Worktree path.
- [ ] Branch, commit, and `git status --short` summary.
- [ ] Source docs read.
- [ ] Detailed tasklist phases/subtasks completed.
- [ ] Files changed.
- [ ] Findings files updated.
- [ ] Tests/commands run with pass/fail summary.
- [ ] Browser proof artifacts, if any.
- [ ] Decisions made.
- [ ] Blockers, unresolved risks, or deferred residue.
- [ ] Exact next packet to run.
- [ ] Copy-paste prompt for the next Codex App conversation.

Final response must include:

- [ ] Packet status.
- [ ] Handoff file path.
- [ ] Findings files updated.
- [ ] Blockers, if any.
- [ ] Next recommended packet.

## Conversation Kickoff Template

Use this template when starting a new conversation:

```text
Implement Packet [N] from:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation\tasks\tasks-0052-0054-master-implementation-orchestration.md

Worktree:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Follow:
- AGENTS.md
- the packet entry criteria
- mapped detailed PRD tasklist phases
- existing findings/handoff notes

Do not implement later packets.
Do not skip tests.
Stop and report if packet stop conditions trigger.
Before final response, create or update documentation/tasks/handoff-0052-0054-packet-[N].md using the mandatory handoff format from the master tasklist.
```

## Packet 0 - Baseline And Dependency Map

Mapped detailed tasks:
- PRD-0052 Part 2 Phase 0
- PRD-0054 Phase 0

Entry criteria:
- [ ] No implementation packet has started.

Scope:
- [ ] Read required PRDs/tasklists.
- [ ] Create both findings files if absent.
- [ ] Record `git status --short`.
- [ ] Record whether PRD/tasklist files are tracked or untracked.
- [ ] Run the required `rg` searches from both Phase 0 sections.
- [ ] Inspect current owners for publish, composition, master edit, archive, duplicate, audit, assignment, runtime, result, Book repair, routes, security rules, and observability.
- [ ] Record exact missing owners, if any.

Do not:
- [ ] Do not write feature code.
- [ ] Do not mark any implementation phase ready.

Exit criteria:
- [ ] Findings files contain baseline evidence for both PRDs.
- [ ] Next packet can start without rediscovering current owner paths.
- [ ] `documentation/tasks/handoff-0052-0054-packet-0.md` exists and contains the copy-paste prompt for Packet 1 or a blocker-resolution prompt.

## Packet 1 - PRD-0052 Schema And Composition Numbering Foundation

Mapped detailed tasks:
- PRD-0052 Part 2 Phase 1
- PRD-0052 Part 2 Phase 1A

Entry criteria:
- [ ] Packet 0 complete.

Scope:
- [ ] Implement ref-only master composition schema/storage/route contract.
- [ ] Implement one shared composition numbering owner.
- [ ] Add tests proving master publish, assignment projection, runtime, submission validation, result review, and PRD-0054 repair numbering use the same numbering contract.
- [ ] Add early security tests rejecting embedded master payload where Phase 1 requires it.

Do not:
- [ ] Do not implement full publish split yet except where needed for tests.
- [ ] Do not create local numbering helpers in UI components or result adapters.

Exit criteria:
- [ ] PRD-0052 Phase 1 parent acceptance passes.
- [ ] PRD-0052 Phase 1A parent acceptance passes.
- [ ] Findings record exact numbering owner path and import consumers.
- [ ] `documentation/tasks/handoff-0052-0054-packet-1.md` exists and contains the copy-paste prompt for Packet 2.

## Packet 2 - PRD-0054 Audit And Duplicate Index Foundation

Mapped detailed tasks:
- PRD-0054 Phase 1A
- PRD-0054 Phase 1B

Entry criteria:
- [ ] Packet 0 complete.
- [ ] Packet 1 complete unless inspection proves the duplicate guard can be built without PRD-0052 schema changes.

Scope:
- [ ] Implement Reading V2 audit writer at `reading_v2/audit_events/{eventId}`.
- [ ] Add audit rules and tests for create/update/delete/read and unsafe-field rejection.
- [ ] Implement owner-scoped duplicate index path `reading_v2/duplicate_indexes/passages_by_owner/{ownerId}/{passageMaterialId}`.
- [ ] Implement duplicate guard service with approved hashed-shingle Sorensen-Dice formula and 80 percent warning threshold.
- [ ] Add rules/tests proving duplicate index has no body/canonical/answer/scoring/AI/provenance/import payload.

Do not:
- [ ] Do not add archive UI.
- [ ] Do not add repair UI.
- [ ] Do not integrate duplicate warning into all UI surfaces yet.
- [ ] Do not scan broad canonical payloads.

Exit criteria:
- [ ] PRD-0054 Phase 1A parent acceptance passes.
- [ ] PRD-0054 Phase 1B parent acceptance passes.
- [ ] PRD-0052 Phase 2B can consume the duplicate guard/index.
- [ ] `documentation/tasks/handoff-0052-0054-packet-2.md` exists and contains the copy-paste prompt for Packet 3.

## Packet 3 - PRD-0052 Composition-First Publish Core

Mapped detailed tasks:
- PRD-0052 Part 2 Phase 2A
- PRD-0052 Part 2 Phase 2B

Entry criteria:
- [ ] Packet 1 complete.
- [ ] Packet 2 complete, or Phase 2B must remain explicitly blocked in findings.

Scope:
- [ ] Implement full-test publish split into standalone Reading Passage materials.
- [ ] Implement ref-only master composition writes.
- [ ] Preserve same-source idempotency.
- [ ] Validate extracted passage anchors, task groups, interactions, option sets, answer rules, and projections independently.
- [ ] Build student-safe and review projections at correct paths.
- [ ] Integrate PRD-0054 duplicate guard/index for auto-split duplicate warning.

Do not:
- [ ] Do not mark PRD-0052 final acceptance complete if Phase 2B is blocked.
- [ ] Do not fall back to broad canonical scans.
- [ ] Do not embed answer keys or passage payloads in master composition.

Exit criteria:
- [ ] PRD-0052 Phase 2A parent acceptance passes.
- [ ] PRD-0052 Phase 2B parent acceptance passes or is recorded as blocked with exact dependency.
- [ ] Targeted publish/composition tests pass.
- [ ] `documentation/tasks/handoff-0052-0054-packet-3.md` exists and contains the copy-paste prompt for Packet 4 or a blocker-resolution prompt.

## Packet 4 - PRD-0052 Published Master Modal And Draft Creation

Mapped detailed tasks:
- PRD-0052 Part 2 Phase 3
- PRD-0052 Part 2 Phase 4

Entry criteria:
- [ ] Packet 3 Phase 2A complete.

Scope:
- [ ] Implement `ReadingV2MasterEditModal`.
- [ ] Implement published and draft modal modes.
- [ ] Route Teacher Lobby published master `Edit Test` into the modal.
- [ ] Keep draft/unpublished full-test creation out of published full-test Studio.
- [ ] Implement create full test from existing published, unarchived Reading Passages.
- [ ] Add modal, picker, Teacher Lobby, and Test Creation Modal tests.

Do not:
- [ ] Do not use full-test Studio for published master editing.
- [ ] Do not expose archived/draft/inaccessible passages in add-existing picker.
- [ ] Do not create a generic master-edit substitute.

Exit criteria:
- [ ] PRD-0052 Phase 3 parent acceptance passes.
- [ ] PRD-0052 Phase 4 parent acceptance passes.
- [ ] Findings record modal path, state model, and proof that published masters do not open full-test Studio.
- [ ] `documentation/tasks/handoff-0052-0054-packet-4.md` exists and contains the copy-paste prompt for Packet 5.

## Packet 5 - PRD-0052 Update References, Assignment Freeze, Runtime, Result, Handoff

Mapped detailed tasks:
- PRD-0052 Part 2 Phase 5
- PRD-0052 Part 2 Phase 6
- PRD-0052 Part 2 Phase 7
- PRD-0052 Part 2 Phase 8

Entry criteria:
- [ ] Packet 4 complete.

Scope:
- [ ] Implement single-passage version update and `Update References` modal.
- [ ] Implement assignment freeze and refresh-before-start behavior.
- [ ] Ensure runtime, submission, and result review use frozen projections.
- [ ] Add rules/observability/feature-registry coverage.
- [ ] Mark PRD-0054 master-repair dependency `READY` or `BLOCKED` with exact evidence.

Do not:
- [ ] Do not silently update owned masters, Books, assignments, or results after single-passage publish.
- [ ] Do not infer student-started status from UI state.
- [ ] Do not write a placeholder PRD-0054 readiness note.

Exit criteria:
- [ ] PRD-0052 Phase 5 parent acceptance passes.
- [ ] PRD-0052 Phase 6 parent acceptance passes.
- [ ] PRD-0052 Phase 7 parent acceptance passes.
- [ ] PRD-0052 Phase 8 marks PRD-0054 dependency `READY` or `BLOCKED`.
- [ ] PRD-0052 browser proof steps that are possible at this stage are recorded.
- [ ] `documentation/tasks/handoff-0052-0054-packet-5.md` exists and contains the copy-paste prompt for Packet 6 or a blocker-resolution prompt.

## Packet 6 - PRD-0054 Archive Data And Broken Reference Services

Mapped detailed tasks:
- PRD-0054 Phase 2
- PRD-0054 Phase 3

Entry criteria:
- [ ] Packet 2 complete.
- [ ] Packet 5 complete for broken-master assignment/launch integration, or findings record exact blocked dependency.

Scope:
- [ ] Implement Reading Passage archive/restore data service.
- [ ] Implement archive index/list behavior.
- [ ] Implement broken-reference detection service.
- [ ] Implement soft master remove/delete semantics.
- [ ] Implement broken current master assignment/launch/publish guards.
- [ ] Add rules tests for archive/restore/delete and immutable snapshot protection.

Do not:
- [ ] Do not expose Teacher Lobby archive UI yet.
- [ ] Do not add teacher master restore UI in V1.
- [ ] Do not mutate old assignments or completed results.
- [ ] Do not write broken-ref summary state from student launch paths.

Exit criteria:
- [ ] PRD-0054 Phase 2 parent acceptance passes.
- [ ] PRD-0054 Phase 3 parent acceptance passes.
- [ ] Findings record broken-ref summary ownership or modal-only deferral.
- [ ] `documentation/tasks/handoff-0052-0054-packet-6.md` exists and contains the copy-paste prompt for Packet 7 or a blocker-resolution prompt.

## Packet 7 - PRD-0054 Archive UI And Master Repair UI

Mapped detailed tasks:
- PRD-0054 Phase 4
- PRD-0054 Phase 5

Entry criteria:
- [ ] Packet 6 complete.
- [ ] PRD-0052 Phase 8 dependency status is `READY`.

Scope:
- [ ] Implement Teacher Lobby Reading Passage archive UI.
- [ ] Use `Remove from library` label and in-app confirmation modal.
- [ ] Add Archive subtab and restore action.
- [ ] Implement broken master repair UI inside PRD-0052 `ReadingV2MasterEditModal`.
- [ ] Add repair actions: add existing, remove passage, remake manually, restore source when owned and allowed.
- [ ] Add numbering review and publish block while unresolved refs remain.

Do not:
- [ ] Do not use `window.confirm`.
- [ ] Do not create standalone Book page or unrelated TeacherHeader shell changes.
- [ ] Do not use full-test Studio for broken master repair.
- [ ] Do not start if PRD-0052 dependency is not `READY`.

Exit criteria:
- [ ] PRD-0054 Phase 4 parent acceptance passes.
- [ ] PRD-0054 Phase 5 parent acceptance passes.
- [ ] Browser proof records archive, restore, broken master warning, repair, numbering review, and publish.
- [ ] `documentation/tasks/handoff-0052-0054-packet-7.md` exists and contains the copy-paste prompt for Packet 8.

## Packet 8 - PRD-0054 Book Repair And Duplicate Warning Surfaces

Mapped detailed tasks:
- PRD-0054 Phase 6
- PRD-0054 Phase 7

Entry criteria:
- [ ] Packet 7 complete.
- [ ] PRD-0054 Phase 1B duplicate guard/index complete.

Scope:
- [ ] Implement Book broken-reference validation and repair UX inside existing Book editor modal.
- [ ] Add Book card/list broken-ref badges without hydrating canonical payload.
- [ ] Integrate duplicate warning surfaces using the Phase 1B duplicate guard service.
- [ ] Add UI tests for warning shown, use existing, create new anyway, restore and use, and unsafe payload non-exposure.

Do not:
- [ ] Do not replace the Book editor modal with a route page.
- [ ] Do not reimplement duplicate formula or duplicate index.
- [ ] Do not claim duplicate UI complete with service tests only.

Exit criteria:
- [ ] PRD-0054 Phase 6 parent acceptance passes.
- [ ] PRD-0054 Phase 7 parent acceptance passes.
- [ ] Browser proof records Book repair and duplicate warning behavior.
- [ ] `documentation/tasks/handoff-0052-0054-packet-8.md` exists and contains the copy-paste prompt for Packet 9.

## Packet 9 - PRD-0054 Safety Sweep, Docs, And Final Integration

Mapped detailed tasks:
- PRD-0054 Phase 8
- PRD-0054 Phase 9
- PRD-0054 Phase 10
- PRD-0052 final acceptance review
- PRD-0054 final acceptance review

Entry criteria:
- [ ] Packets 1 through 8 complete.

Scope:
- [ ] Verify assignment, publish, runtime, and result safety after archive/restore/repair.
- [ ] Verify audit events for all state-changing actions.
- [ ] Verify observability-only events stay observability-only.
- [ ] Verify security rules cover every new write/read path.
- [ ] Update architecture docs named by detailed tasklists.
- [ ] Run all targeted test groups from both tasklists.
- [ ] Run exact `localhost:5173` browser proof.
- [ ] Run UTF-8 and whitespace checks.

Do not:
- [ ] Do not reopen resolved product decisions without new evidence.
- [ ] Do not mark final acceptance if any browser proof step lacks surface, viewport, URL, ids, expected/actual, and screenshot/trace path.

Exit criteria:
- [ ] PRD-0052 final acceptance criteria pass or each remaining item is explicitly blocked with evidence.
- [ ] PRD-0054 final acceptance criteria pass or each remaining item is explicitly blocked with evidence.
- [ ] Findings files and architecture docs match implementation.
- [ ] Final handoff lists residual risks and exact verification outputs.
- [ ] `documentation/tasks/handoff-0052-0054-packet-9.md` exists and contains final completion status plus any follow-up prompt needed.

## Packet Dependency Graph

```text
Packet 0
  -> Packet 1
  -> Packet 2

Packet 1 + Packet 2
  -> Packet 3

Packet 3
  -> Packet 4
  -> Packet 5

Packet 2 + Packet 5
  -> Packet 6

Packet 6 + PRD-0052 READY
  -> Packet 7

Packet 7 + Packet 2
  -> Packet 8

Packets 1-8
  -> Packet 9
```

## Master Completion Criteria

- [ ] Every packet is `COMPLETE`, or any `BLOCKED` packet has user-approved follow-up direction.
- [ ] Detailed PRD-0052 tasklist final acceptance is satisfied.
- [ ] Detailed PRD-0054 tasklist final acceptance is satisfied.
- [ ] Findings files contain full evidence trail.
- [ ] Tests and browser proof are recorded with exact commands and artifacts.
- [ ] No placeholder readiness, placeholder UI, placeholder services, or deferred behavior is hidden as complete.
