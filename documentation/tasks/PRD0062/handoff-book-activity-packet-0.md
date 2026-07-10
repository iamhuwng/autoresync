# Handoff

## Working Folder

- Packet id and status: `Packet 0 - Baseline And Ownership Map`, `COMPLETE`
- Phase state: `CLOSED` for documentation baseline Packet 0; Packet 1 not started.
- Date/time: `2026-07-09T20:42:06+07:00`
- Worktree path: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `main`
- Commit: `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`
- Branch relation: `main...origin/main [ahead 7]`
- `git status --short` summary: dirty workspace at kickoff; no staged files; Packet 0 edited/created only PRD0062 docs listed below.
- Worktree identity: current repo worktree is `C:/Users/The Lord/Desktop/luyentap-writing-import-rebased`, branch `refs/heads/main`, HEAD `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`.

## Mission Ledger

```text
ORIGINAL MISSION:
Run PRD0062 Packet 0 baseline and ownership map.

CURRENT SLICE:
Packet 0 only. Complete findings, storage design, traceability Packet 1 gate rows, Packet 1 contract, handoff, and dirty-path classification.

IN SCOPE:
documentation/tasks/PRD0062/findings-book-activity-baseline.md
documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md
documentation/tasks/PRD0062/traceability-book-activity-v1.md
documentation/tasks/PRD0062/contracts-book-activity-packet-1.md
documentation/tasks/PRD0062/handoff-book-activity-packet-0.md

OUT OF SCOPE:
Feature code, production data nodes, Packet 1 source changes, later-packet taskbox completion, commits, pushes, deploys.

COMPLETION BOUNDARY:
Packet 0 docs are complete enough for Packet 1 source-change planning. Packet 1 remains unstarted and requires a fresh kickoff, refreshed dirty status, and explicit source-change work.

SEPARATE APPROVAL GATES:
Packet 1 implementation, staging/commit, direct main push, remote deploy/proof.

BLOCKERS:
No Packet 0 doc blocker remains. Packet 1 Activity domain storage is fixed to RTDB under `book_activity/*` with rules in `database.rules.json`.

NEXT DEPENDENCY:
Packet 1 Activity Domain And Security Foundation.

NON-ACTIONS:
No feature code implemented. No later packet taskboxes marked complete. No server started. No browser proof claimed.
```

## Next Session Focus

Start Packet 1 only after reading:

- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`
- `documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md`
- `documentation/tasks/PRD0062/contracts-book-activity-packet-1.md`
- `documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md`
- `documentation/tasks/PRD0062/findings-book-activity-baseline.md`
- `documentation/tasks/PRD0062/traceability-book-activity-v1.md`
- `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`
- `documentation/rules/infrastructure.md` before DB path/rules/index writes

## Current State

Source docs read:

- AGENTS.md instructions in user prompt.
- `C:\Users\The Lord\.codex\RTK.md`
- `C:\Users\The Lord\.agents\skills\caveman\SKILL.md`
- `.agents/skills/handoff-writer/SKILL.md`
- `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`
- `documentation/rules/infrastructure.md`
- `documentation/tasks/generate-tasks.md`
- PRD, architecture, master orchestration, all eight component task lists, template, findings, traceability.

Files changed by Packet 0:

- `documentation/tasks/PRD0062/findings-book-activity-baseline.md`
- `documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md`
- `documentation/tasks/PRD0062/traceability-book-activity-v1.md`
- `documentation/tasks/PRD0062/contracts-book-activity-packet-1.md`
- `documentation/tasks/PRD0062/handoff-book-activity-packet-0.md`

Current live contract:

- Book Activity extends existing `material_catalog` Book system. No `ActivityBook`.
- Packet 1 owner paths and Packet 1 negative proof requirements are recorded in findings, traceability, storage design, and Packet 1 contract.
- Existing `unit` node support is absent; `unit` is Packet 3 unless Packet 1 explicitly narrows to type-only prep.
- Existing `interactive-activity` material kind is absent.
- Existing Material Catalog `bookEditor.service.ts` and `materialBooks.service.ts` use `// @ts-nocheck`; Packet 1 must not hide new invariants there without typed wrapper/cleanup.
- Existing legacy PDF parser references remain outside PRD0062; PRD0062 paths must add boundary proof before closure.

## Decisions And Constraints

- Storage design file path: `documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md`.
- Packet 1 contract file path: `documentation/tasks/PRD0062/contracts-book-activity-packet-1.md`.
- Dirty/untracked classification recorded in findings. `contracts-book-activity-packet-template.md` classified as pre-existing untracked scaffold and left untouched.
- Packet 1 DB product choice is no longer deferred: RTDB under `book_activity/*`, rules in `database.rules.json`, backup owner `r2-backup-worker/src/backup/data-backup.ts`, restore owner `r2-backup-worker/src/restore/restore-execute.ts`, and no Packet 1 `firestore.indexes.json` change.
- No later packet taskboxes were changed.

## Verification

Commands run:

| Claim | Command | Result |
|---|---|---|
| Baseline branch/status | `rtk git status --short --branch` | exit 0; main ahead 7; dirty paths recorded |
| Baseline full dirty inventory | `rtk git status --short --untracked-files=all` | exit 0; dirty/untracked paths recorded |
| Baseline commit | `rtk git rev-parse HEAD` | exit 0; `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f` |
| Unstaged diff names | `rtk git diff --name-only` | exit 0; paths recorded |
| Staged diff names | `rtk git diff --cached --name-only` | exit 0; empty |
| Owner/test/security scans | `rtk rg ...` targeted scans | exit 0 except one malformed regex retried successfully |

Proof classes:

- Local source proof: N/A, no feature source changed.
- Local integration proof: N/A, no implementation.
- Type/build proof: N/A, documentation baseline Packet 0.
- Emulator/rules proof: N/A, no rules changed.
- Browser proof: N/A, no UI changed.
- Remote/deployed proof: N/A, no remote claim.

## Review Evidence

- Subagent Ptolemy performed read-only PRD0062 doc/dirty-state scan before final Packet 0 edits. It confirmed Packet 0 docs were scaffold-level at that moment, later packet taskboxes all unchecked, and classified `contracts-book-activity-packet-template.md` as pre-existing untracked scaffold plus `traceability-book-activity-v1.md` as Packet 0 candidate.
- Subagent Carson performed read-only source/rules/test owner scan. Its analog owner map is copied into `findings-book-activity-baseline.md` under `Read-Only Analog Owner Map From Subagent`.
- No independent final reviewer reran after final edits. Main thread owns final Packet 0 doc reconciliation.

## Authority Reconciliation

| Requirement | Source/test/docs status |
|---|---|
| Findings baseline evidence | Expanded in `findings-book-activity-baseline.md`; Packet 1 rows `F-P1-001` through `F-P1-009` recorded. |
| Storage design packet | Created `storage-design-book-activity-packet-0.md`; covers required stores and per-store authority/negative proof/local integration proof. |
| Packet 1 traceability rows | Added `Packet 1 Source-Change Gate Rows` to `traceability-book-activity-v1.md`. |
| Packet 1 contract | Created `contracts-book-activity-packet-1.md`. |
| Dirty/untracked classification | Recorded in findings; includes `contracts-book-activity-packet-template.md` and `traceability-book-activity-v1.md`. |
| Later packet taskboxes | Left untouched. |

## Remaining Work

- Packet 1 must refresh dirty path proof before source changes.
- Packet 1 Activity domain DB writes must use RTDB under `book_activity/*`, rules in `database.rules.json`, backup owner `r2-backup-worker/src/backup/data-backup.ts`, and restore owner `r2-backup-worker/src/restore/restore-execute.ts`.
- Packet 1 must add exact new test titles or update traceability if titles change.
- Packet 1 must resolve typed boundary around existing `// @ts-nocheck` Material Catalog seams if touched.
- Packet 2 remains responsible for PDF engine spike and source rendition/grant implementation.

## Copy-Paste Prompt For Next Codex App Conversation

```text
Implement Packet 1 from:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\documentation\tasks\PRD0062\tasks-book-activity-master-orchestration.md

Worktree:
C:\Users\The Lord\Desktop\luyentap-writing-import-rebased

Follow:
- AGENTS.md
- documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md
- documentation/rules/infrastructure.md before DB path/rules/index writes
- documentation/tasks/PRD0062/tasks-book-activity-01-domain-security-foundation.md
- documentation/tasks/PRD0062/contracts-book-activity-packet-1.md
- documentation/tasks/PRD0062/storage-design-book-activity-packet-0.md
- documentation/tasks/PRD0062/findings-book-activity-baseline.md
- documentation/tasks/PRD0062/traceability-book-activity-v1.md

Scope:
- Packet 1 only.
- Implement Activity domain and security foundation.
- Do not add Assembly UI, source PDF delivery, runtime UI, Book Homework, updates/checkpoints/notifications, Course/Class/public delivery, or Live execution.
- Do not import/call/wrap src/services/file-extractor/file.extractor.ts or src/parsers/pdfParser.js.
- Start by recording fresh rtk git status, git diff name lists, and dirty-path classification.
- Before DB writes, use RTDB under `book_activity/*`, update `database.rules.json`, and update backup/restore inventory in `r2-backup-worker/src/backup/data-backup.ts` and `r2-backup-worker/src/restore/restore-execute.ts`.
- Preserve existing Book, Material Catalog, Reading V2, Listening, homework, and result regressions named in Packet 0 findings/traceability.
- Before final response, update findings, traceability, Packet 1 contract, and create documentation/tasks/PRD0062/handoff-book-activity-packet-1.md.
```

## Suggested Skills

- `react-async-state-patterns`: only if Packet 1 adds async React state; likely not needed.
- `firebase-cli-first`: if Packet 1 needs Firebase emulator/rules diagnostics.
- `google-cloud-cli-first`: only if Google Cloud/API key issues appear.
- `handoff-writer`: required for Packet 1 handoff file.

## Sensitive Data Handling

- No secrets, credentials, tokens, cookies, or PII were copied into this handoff.
- Technical identifiers, file paths, branch names, and test names are preserved.
