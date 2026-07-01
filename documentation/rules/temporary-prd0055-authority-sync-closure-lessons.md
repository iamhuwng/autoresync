# Temporary PRD / Task-List Memory Bridge

Temporary status: remove after Codex memory index contains `prd0055-authority-sync-closure-lessons` / `authority-sync`.

Sources:
- Memory note awaiting ingestion: `C:\Users\The Lord\.codex\memories\extensions\ad_hoc\notes\2026-06-26T14-32-29-prd0055-authority-sync-closure-lessons.md`
- Authority-sync thread: `codex://threads/019f0256-334d-7801-8be0-68d2f10099e1`
- Broad retrospective thread: `codex://threads/019f0197-a08f-7961-bb2b-963cb5f2c4f4`
- Premature-closure commit: `1c3329a2dd72580c874d67370843a4413cb28e51`

## Trigger Rule

Read this file before PRD/task-list packet planning, review, correction, handoff, staging, commit, or PASS/BLOCKED closure when work involves:

- next-patch prompts, handoffs, task sequencing, taskboxes, or checklist closeout
- findings ledgers, traceability matrices, implementation logs, canonical/current-state docs, guardrails, or reviewer blockers
- source-test-doc truth reconciliation, exact-path staging, RTK/PowerShell proof, Cloudflare/Wrangler/R2 proof, or remote-state claims

This is workflow-shape based. Do not limit it to PRD-0055 by exact number.

## Temporary Memory Block: Broad Process Lessons

Source: `codex://threads/019f0197-a08f-7961-bb2b-963cb5f2c4f4`

- Scope fences are literal: `Task X only`, `docs-only`, `no deploy`, `no push`, `do not start next task`, and parent-checkbox conditions.
- Never infer approval. Planning, config prep, canary, production rollout, rollback drill, docs closure, commit, push, and next-task start are separate gates unless explicitly combined.
- Start packets with state proof: `rtk git status --short --branch`, `rtk git status --short --untracked-files=all`, `rtk git rev-parse HEAD`, then dirty/untracked allowlist.
- Treat traceability as active truth. Do not close while taskbox, findings, implementation log, authority docs, and traceability disagree.
- Boundary proof must match real control boundary: requirement -> test title -> assertion -> mutation/exploit -> killed test where security/boundary claims are material.
- Use exact-path staging and verify staged paths before commit.
- Long compacted PRD threads should roll into fresh strict handoff prompts after repeated correction loops.
- Prefer simple `rg`, `Get-Content`, `Select-String`, and `node -e`; avoid brittle mega one-liners and bash heredocs.
- `rtk` is preferred but not magic. `No hook installed` is warning; cmdlet-heavy commands may need plain PowerShell or `rtk proxy powershell`.
- Windows Cloudflare/Wrangler proof: use bundled x64 Node early when `workerd` or Wrangler platform errors appear.
- Remote-state claims need remote evidence: Worker version/bindings, R2 object proof, Firebase/Hosting state, Cloudflare REST, or Wrangler dry-run.

## Temporary Memory Block: Authority-Sync Closure Lessons

Source: `codex://threads/019f0256-334d-7801-8be0-68d2f10099e1`

- Task 3.14 failure was false closure: source, tests, taskbox, findings, traceability, implementation log, and architecture did not describe same live truth.
- Green focused tests are insufficient when docs, taskboxes, findings, or traceability are stale.
- Historical evidence is append-only. Do not rewrite old packet narrative as if it was always current; append active current truth.
- Do not leave stale claims such as `docs-only`, `no source/tests changed`, `only wrapper`, old proof counts, old line counts, or contradicted design claims.
- UI shell/wrapper removal can expose semantic drift. Touched controls still need real interactive elements, keyboard reachability, accessible names, valid HTML, scoped transitions, and no legacy design residue.
- Reviewer PASS is scoped to what reviewer inspected. Reviewer timeout, usage limit, missing proof, or "did not rerun tests" cannot close gate alone.

## Closure Gate

Before PASS, checkbox, stage, commit, or handoff claim:

1. Inventory diff and dirty paths; stop on unrelated or next-task paths.
2. Run focused tests, adjacent/shared tests, guardrails, UTF-8 check, and `rtk git diff --check` as applicable.
3. Scan touched targets for forbidden imports, protected-path drift, shared-boundary drift, and next-task checkbox drift.
4. Reconcile taskbox, traceability, findings, implementation log, canonical architecture/current-state docs, and active design/drift docs.
5. Run stale phrase/proof-count scans for old claims contradicted by current diff.
6. Use independent review only after current diff and authority surfaces are inspectable; main agent still owns final proof.

PASS means live source behavior, tests, docs, taskboxes, findings, traceability, guardrails, review, and dirty-path scope agree.

Anything less is BLOCKED.
