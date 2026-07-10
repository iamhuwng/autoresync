# Contract Template: PRD0062 Packet [N]

Status: Template. Copy to `documentation/tasks/PRD0062/contracts-book-activity-packet-[N].md` before source changes begin.

Primary PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

Required process rule:
- `documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md`

## Mission Ledger

```text
ORIGINAL MISSION:
CURRENT SLICE:
PHASE STATE:
IN SCOPE:
OUT OF SCOPE:
COMPLETION BOUNDARY:
SEPARATE APPROVAL GATES:
CURRENT BLOCKERS:
NEXT DEPENDENCY:
NON-ACTIONS:
```

## Entry State Proof

- [ ] `rtk git status --short --branch`:
- [ ] `rtk git status --short --untracked-files=all`:
- [ ] `rtk git rev-parse HEAD`:
- [ ] `git diff --name-only`:
- [ ] `git diff --cached --name-only`:

Dirty path classification:

| Path | Classification | Owner | Action |
|---|---|---|---|
|  |  |  |  |

Allowed classifications: `owned by this packet`, `pre-existing staged work`, `pre-existing unstaged work`, `user-owned unrelated work`, `generated artifact`, `must-not-touch`.

## Storage Contract

| Store/path | Owner service/module | Immutable fields | Mutable fields | Indexes | Read authority | Write authority | Student-safe projection boundary | Archive/delete behavior | Backup coverage | Migration behavior | Per-store negative security tests |
|---|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |  |  |

## Rules / Security Contract

| Boundary | Positive authorization proof | Negative/mutation proof | Rules path/test | Required before PASS |
|---|---|---|---|---|
|  |  |  |  |  |

Required checks:

- [ ] No full source PDF, answer-key page, teacher note, authoring record, hidden Interaction ID, private source provenance, full diff payload, or private attempt leaks to unauthorized clients.
- [ ] Student-safe projection boundary is explicitly tested.
- [ ] Owner/cross-owner and student/cross-student failures are tested where data is user-scoped.
- [ ] Browser/UI proof is not used as a substitute for rules/security proof.

## UI Contract

- [ ] UI surfaces touched:
- [ ] Triggered design/routing/observability/announcement/mobile rules:
- [ ] Accessibility requirements:
- [ ] Browser proof required:
- [ ] Browser proof not applicable because:

## Migration / Compatibility Contract

| Existing behavior/data | Compatibility requirement | Test/proof | Fallback/rollback behavior |
|---|---|---|---|
|  |  |  |  |

## Test Contract

| Proof class | Required? | Command | Working directory | Runner/config | Files/tests in scope | Notes |
|---|---|---|---|---|---|---|
| Local source proof |  |  |  |  |  |  |
| Local integration proof |  |  |  |  |  |  |
| Type/build proof |  |  |  |  |  |  |
| Focused tests |  |  |  |  |  |  |
| Adjacent/regression tests |  |  |  |  |  |  |
| Emulator/rules proof |  |  |  |  |  |  |
| Browser proof |  |  |  |  |  |  |
| Remote/deployed proof |  |  |  |  |  |  |
| Rollback/recovery proof |  |  |  |  |  |  |
| Explicitly not required |  |  |  |  |  |  |

## Authority Reconciliation

| Requirement / invariant | PRD section | Source owner path | Rules/security boundary | Test file + test title | Negative/mutation proof | Architecture/current-state doc | Findings row | Traceability row | Taskbox ID | Status |
|---|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  | PLANNED |

## Evidence Acceptance Log

| Claim | Command | Working directory | Runner/config | Exit code | Files/tests in scope | Tests actually executed | Product failure or harness failure | Result |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |

## Review Plan

- [ ] Review requested only after diff, tests, findings, traceability, and docs are inspectable.
- [ ] Reviewer receives exact changed-file list.
- [ ] Reviewer receives exact packet scope and non-scope.
- [ ] Reviewer must report method, inspected files/diff, risk model, validation performed, tests not rerun, and residual risks.
- [ ] Main agent remains final PASS/BLOCKED owner.

## Stale-Claim Scan Plan

Scan touched docs, findings, handoffs, traceability, and architecture/current-state docs for:

```text
docs-only
no source/tests changed
only wrapper
old proof count
old line count
deferred
blocked
TODO
no deploy
no push
```

Record every active contradicted claim as fixed or BLOCKED.

## Exit Gate

- [ ] Source behavior matches the PRD and packet contract.
- [ ] Focused, adjacent/regression, and boundary tests are recorded with command/cwd/config/exit code.
- [ ] Negative/security proof matches the real control boundary.
- [ ] Browser proof exists where UI/UX changed.
- [ ] Remote/deployed claims have remote evidence or are explicitly not claimed.
- [ ] Findings and traceability are updated.
- [ ] Architecture/current-state docs are updated where live contracts changed.
- [ ] Completed taskboxes map to source/test/docs evidence.
- [ ] Dirty/staged paths are scoped and exact.
- [ ] Handoff exists and separates current live contract from historical/superseded evidence.

Packet status: `PLANNED | IMPLEMENTING | IMPLEMENTED_UNREVIEWED | REVIEW_BLOCKED | VERIFIED | CLOSURE_BLOCKED | CLOSED`
