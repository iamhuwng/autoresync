# Windows ARM64 Tooling Skill Redesign — Execution Plan

**Revised:** 2026-09-30. Retain the filename so existing references resolve.

**Goal:** Reliable Windows ARM64 development with less routing friction, repeated diagnosis, duplicated environments, and resource pressure. Preserve useful compatibility fixes and verify the actual requested work.

**Evidence:** The [review conversation](<C:/Users/The Lord/Downloads/ChatGPT-Redefine Windows ARM64 Skill-20260930-0817.md>) reports an investigation of 15 main threads plus their subagents. Its numerical storage/run counts and individual incidents remain conversation-reported until matched to raw sources. The [independent review](windows-arm64-tooling-skill-redesign-independent-review-2026-09-30.md) corroborates current implementation, surviving conflicts, and targeted Git history. Its command checks prove routing/CLI launch, not completion of this redesign.

## Operating contract

1. Ordinary work uses the repository's package command or stateless resolver.
2. Use a repository-declared x64 route immediately for the exact tool; avoid a deliberate native failure first.
3. For undeclared routes, investigate architecture only when a native binary, binding, or loader incompatibility is demonstrated.
4. Preserve the authoritative checkout, cwd, configuration, arguments, and package-owned dependencies. Reuse shared runtimes.
5. Keep compatibility, provisioning, ordinary debugging, resource recovery, and evidence workflows under distinct owners.
6. Execute the requested work and verify its expected outcome. Distinguish startup failures, product assertion failures, expected negative-test outcomes, and blocked prerequisites.

| Need | Owner |
|---|---|
| Ordinary build/test/dev/script | Repository command / tooling:where |
| Known exact-tool x64 route | Stateless resolver; ARM64 skill supplies compatibility policy |
| New demonstrated native incompatibility | run-windows-arm64-tools |
| Missing tool/dependency | Repository provisioning policy |
| Path/config/test/product failure | Normal diagnosis |
| Disk/RAM/process/cache/worktree/WSL pressure | recover-windows-dev-resources |
| Demonstrably required stateful evidence | Explicit repository audit harness |
| Harness defect | Repository harness maintenance |

Select required evidence semantics before execution. An ordinary failure does not itself justify audit-harness use. Deployment or security work uses the harness when its evidence contract is required, not merely because of its label or an existing audit flag.

## Scope and preservation

This plan covers instruction/authority repairs, affected ordinary command paths, minimal retained-harness routing corrections, and focused verification. Implementation begins only when separately requested; revising this document does not execute the stages.

Preserve working mechanisms. Add no generic provisioning skill, new runtime/cache root, WSL development environment, routing registry, or broad harness rewrite. Cleanup, deployment, unrelated dependency upgrades, and lockfile changes are outside this redesign's authorization.

Reinspect live source and Git status before each mutation. Protect pre-existing changes and record the baseline of user-scoped files outside Git. Any later staging, commit, formal closure, or remote-state claim must follow the applicable repository rules; those operations are not implied by this plan.

Maintain **one implementation checklist**: behavior/path, current state, action (preserve/verify/patch/implement/retire), owner, and evidence/result. No additional ledger or evidence platform is needed.

## Stage 0 — Establish the current baseline

### 0.1 Inspect implementation and authority

Record current contents and tracking/dirty state of:

- Both user-scoped skills, descriptions, revisions, and actual discovered sources.
- Local tooling policy, resolver, doctor, and existing focused tests.
- Root, Cloudflare, and R2 commands and transitive script callers.
- Harness dispatcher, contract, authority checks, normal runner, and relevant audit adapters.
- Active acceptance/QA validators and instructions that mandate a runner.
- Canonical shared x64 helper and package lock/native dependency versions.

This is the **September 30 inspection baseline**, not a permanent source of truth:

| Component | Observed state | Expected action |
|---|---|---|
| ARM64 / resource skills | v5.0.0 / v1.0.0 already exist with narrow responsibilities | Audit; patch demonstrated gaps only |
| Resolver / doctor | Stateless exact-tool routing / read-only inspection exist | Preserve; verify affected behavior |
| Worker compatibility | Cloudflare workerd 1.20260617.1 and R2 1.20260302.0; inspected Cloudflare loader lacks a Windows ARM64 selector | Preserve declared x64 routes |
| Harness contract | Pins generic skill 4.3.0, prescribes shared lineage, routes Wrangler through WSL | Decouple and reconcile retained routing |
| Ordinary dispatcher | Still reaches cache/overlay/WSL machinery without audit mode | Migrate callers, then enforce boundary |
| Acceptance conformance | Requires harness Playwright and rejects direct runner forms | Reconcile actual evidence requirements |
| Repository harness-contract skill | Removed by Git commit 3bfd1742; executable contract remains | Record absence; do not recreate automatically |
| Plan/policy/resolver/doctor/test | Untracked at inspection; manifests and harness files contain pre-existing edits | Preserve provenance and user work |

### 0.2 Record discovery conflicts without blocking repairs

Inspect the available skill catalog and relevant conflicting instructions. Where available, use an installed supported discovery probe to record actual sources/revisions. Missing discovery capability or conflicting authority is a checklist finding; it must not prevent source repairs.

A fresh main-session acceptance check belongs after the relevant edits. If unavailable, continue independent source work and leave final behavioral proof pending. An inherited or answer-primed subagent cannot substitute for a fresh main session.

### 0.3 Recover bounded historical sources

Reuse an existing investigation manifest if available. Record 15 distinct main-thread identifiers/date ranges, relevant children separately, and source excerpts/log locations for pivotal incidents. Children do not count toward 15.

Map supported incidents to: task-wide routing; WSL duplication; helper/worktree/dependency copies; harness-generated failures; raw Windows ESM paths; config/missing-package misclassification; storage/crash/process pressure; unattributed temporary state; preflight-as-completion; over-triggering; and inconsistent main/subagent decisions.

If raw sources are unavailable, mark historical reconstruction partial. Do not invent identifiers, treat reported counts as reproduced measurements, or block verified local repairs on a complete rescan. Use safe representative cases for uncovered classes.

**Stage 0 complete when:** the checklist identifies working behavior, concrete conflicts, bounded patch targets, and unavailable evidence. A clean environment or completed 15-thread reconstruction is not a prerequisite for source repairs.

## Stage 1 — Make ordinary execution authoritative

### 1.1 Preserve and verify the stateless resolver

Validate all declared Worker routes: cloudflare-vitest, cloudflare-wrangler, r2-vitest, and r2-wrangler. On Windows ARM64 they select shared x64 Node immediately; ordinary root JS tools use the invoking native Node. Verify the native entry context rather than assuming process.execPath proves host architecture.

Check cwd, configuration/argument forwarding, exit propagation, missing-tool diagnostics, and Worker WSL refusal. Resolver execution must not install dependencies, copy source, write harness evidence, or create compatibility caches. Extend only a demonstrated missing route; reuse existing tests.

### 1.2 Classify active harness call chains

Search package scripts, child processes, validators, QA scripts, tests, and active instructions. Classify each reachable use by behavior:

| Category | Action |
|---|---|
| Ordinary execution without required evidence | Migrate to existing stateless/direct package route |
| Required audit/deploy/security/forensic evidence | Retain pending Stage 2 evidence/routing review |
| Harness contract/regression test | Retain intentional test access |
| Historical acceptance/QA reference | Inspect whether still authoritative/executable; migrate ordinary uses and preserve valid historical records |

Start with ordinary Vite-node callers in scripts/check-prd0062-activity-coverage.mjs and scripts/validate-prd0062-acceptance-matrix.mjs, and runner requirements in scripts/lib/prd0062-acceptance-conformance.ts and scripts/lib/prd0062-acceptance-matrix.mjs. Update affected callers, validators, and tests atomically; changing a command while its validator rejects it is incomplete.

### 1.3 Enforce the ordinary harness boundary

After migrating ordinary callers, remove or reject the public non-audit execution branch in scripts/harness/run-tool.mjs. Give rejected callers an existing resolver/direct-command remediation before cache, overlay, or WSL execution begins.

Preserve contract inspection, required explicit doctor/audit paths, and deliberate internal harness tests. Remove obsolete ordinary runner code when no valid caller remains. Avoid compatibility aliases or another wrapper; pre-launch internal callers can change together.

Add one focused check that ordinary invocation cannot enter stateful machinery. Verify affected retained dispatcher modes so containment preserves required audit behavior.

### 1.4 Clarify doctor and provisioning policy

Keep the doctor read-only; warnings identify candidates, not safe deletion. An unrelated missing package, especially deprecated Functions dependencies, must not force a frontend task to provision it. Keep broad inventory advisory; use existing task context or the smallest scoped distinction if current exit semantics block ordinary work.

Use canonical Local dependencies for verification by default. Resolve conflicting worktree bullets: a differing lockfile cannot justify silently borrowing incompatible dependencies or automatically installing a second tree. Exceptional isolated installation requires applicable repository/user authorization.

Keep helper placement under %CODEX_WINDOWS_TOOLS_ROOT%, otherwise %USERPROFILE%\.codex\tools\windows-arm64.

**Stage 1 complete when:** ordinary reachable call chains and validators use stateless routes, ordinary harness entry is enforced before state creation, and doctor/provisioning policy does not expand task scope.

## Stage 2 — Patch skills and retained evidence paths

### 2.1 Audit existing skill boundaries

Patch only gaps in the existing v5 compatibility skill:

- Activate for repository-declared routing or demonstrated native architecture/binding/loader evidence.
- Treat missing packages, paths/ESM/config, generic assertions, ports, browser timeouts, dirty worktrees, and slowness at their owning layer.
- Route the exact tool and reuse its established route throughout the task.
- Preserve checkout/cwd/config/arguments and shared helper placement; introduce no compatibility source/dependency environment.
- Verify the selected executable actually ran before interpreting a runtime-switch result. An ineffective switch, wrong child PATH, or another incompatible component does not disprove architecture; a demonstrated unrelated failure returns to normal diagnosis.
- Run the requested command and classify its expected outcome; probes supplement that proof.

Keep resource recovery separate: attribute persistent data, task temp, shared caches, WSL, pagefile, and live processes before action. Protect dirty/unmerged worktrees, source, credentials, unique evidence, active runtimes, and uncertain shared data. VHDX compaction remains separate maintenance.

Front-load trigger boundaries in descriptions so selection survives shortened metadata. Verify installed discovery behavior rather than moving working skills based only on a documentation path example. See [official skill guidance](https://developers.openai.com/codex/skills/).

### 2.2 Decouple repository evidence from generic skill lineage

Remove global skill revision/commit-lineage requirements from harness execution and remediations, including related authority checks and tests. Keep coherent repository dispatcher/adapter/evidence protocol checks and meaningful source-integrity safeguards. A generic skill version must not gate unrelated repository evidence execution.

### 2.3 Resolve retained audit intent and architecture

For each retained operational path, record the concrete guarantee requiring the harness: protected-state validation, source-integrity evidence, durable forensic output, or another demonstrated requirement. An existing audit flag is insufficient justification.

Inspect Cloudflare dry-run/deploy/status/version/rollback and security/emulator paths. Default retained Worker execution to the established Windows x64 route. A minimal adapter routing correction is within scope; preserve required evidence semantics.

Retain an existing Linux audit exception only for an exact command with a demonstrated Linux requirement. Document caller, runtime/dependency ownership, and supported boundary; mark unresolved if those cannot be proven. Create no new Linux development ecosystem. Do not claim universal WSL refusal while an operational exception remains. A retained audit defect can block that path while independent work continues.

Preserve truthful classification: startup/preflight/transport is distinct from product assertions, zero tests is not pass, collection is not execution, and required integrity checks remain meaningful. Defer cache protocol, source-copy, retention, evidence-format, and provisioning redesign unless separately scoped and authorized.

### 2.4 Bound known exceptions by dependency evidence

Record package ownership, relevant locked native versions, and observed incompatibility in existing tooling documentation. Keep current x64 routes; reassess when relevant dependencies change, using a real representative command before retiring an exception.

Current upstream workerd maps Windows ARM64 to its x64 executable under emulation; the inspected locked Cloudflare loader lacks that mapping. This does not prove all locked native bindings work under native Node. No dependency upgrade or automatic capability detector is required here. [Upstream change](https://github.com/cloudflare/workerd/commit/dff2d25c47).

### 2.5 Coordinate heavyweight work and resource handoff

The main agent owns runtime verification slots. Delegate source/history analysis and lightweight checks; subagents launch heavyweight Workerd/Wrangler/emulator/browser jobs only when assigned a distinct slot. Subagents do not spawn further agents.

Stop additional heavyweight launches on attributable unexpected sustained free-space decline, another large source/dependency tree, repeated crash dumps, duplicate heavyweight processes, WSL VHDX growth, or repeated compatibility-cache growth. Preserve task state and use the resource skill for attribution. Cleanup needs separate authorization; diagnosis need not wait for cleanup.

**Stage 2 complete when:** skills retain narrow ownership, generic lineage no longer gates repository evidence, and each retained operational harness path has justified evidence semantics and a verified route or explicit unresolved blocker.

## Stage 3 — Verify technical and agent behavior

### 3.1 Run affected technical checks and real commands

Use existing focused tests; avoid mirroring every documentation bullet with a test. Verify changed route/dispatcher branches, caller/validator agreement, and forwarding through one small runnable process check where needed. Fix failures caused by changes and rerun affected checks. Broaden testing only for unresolved integration concerns.

Exercise one existing frontend/source command and one representative real Worker test with a nonzero executed-test count. If both Cloudflare and R2 paths change, exercise both. Version/help output proves launch only. For changed live dev routes, verify readiness, authoritative live-source updates, and owned shutdown rather than waiting for exit zero. Follow repository browser QA requirements when the claim depends on browser behavior.

For retained audit changes, verify the affected local evidence phase and integrity/classification behavior. No deployment or remote mutation is implied; distinguish local audit proof from remote state.

### 3.2 Use unprimed behavioral cases

Finalize exact case inputs from recovered historical prompts where available. These are safe representative prompts; record them verbatim with supplied fixture/error context. Give test agents the prompt and normal repository context, not the expected-result column or redesign narrative.

| Case prompt | Expected route/activation |
|---|---|
| “Run the existing focused React component test through the normal repository command.” | Native/stateless; no ARM64 workflow |
| “Diagnose this Playwright locator timeout.” | Browser/test diagnosis; no ARM64 escalation |
| “Vitest cannot be found because this package's dependencies are missing. Diagnose the prerequisite.” | Provisioning diagnosis; no architecture detour or installation |
| “Diagnose this ERR_UNSUPPORTED_ESM_URL_SCHEME error for a raw Windows C: import.” | Path/URL diagnosis; no ARM64 escalation |
| “Run the existing focused Cloudflare Worker test using this repository's tooling.” | Shared x64 route immediately |
| “Diagnose this native binding's explicit wrong-architecture loader error.” | ARM64 skill; inspect exact runtime/binding |
| “Disk space is falling during overlapping Worker runs. Classify consumers; perform no cleanup.” | Resource skill; stop additional heavyweight launches |
| “Identify the command and required source-integrity evidence for this repository's explicit audit workflow; do not deploy.” | Required harness authority; no remote mutation |
| “Run the focused frontend test and focused Worker test for this mixed task.” | Native frontend plus exact-tool x64 Worker; no task-wide switch |

Use safe existing fixtures or supplied logs for diagnostic cases; do not manufacture disk pressure, dependency loss, or crashes. Agents execute only assigned verification commands, with main-owned slots for heavyweight cases.

Record case input, skill source/revision, model, context type, selected route/activation, observed tool calls, actual command outcome, and created compatibility state in the same checklist. Stated intentions alone cannot prove runnable cases.

Run each class in independent fresh main-session context, plus a representative fork_turns: "none" subagent subset covering ordinary, Worker, resource, and mixed work. Dispatch fresh main sessions only when authorized and supported; otherwise record cases pending. Repeat ambiguous or high-risk cases once in independent context. These checks establish tested behavior, not universal model reliability.

Fail a case for ordinary stateful-harness use, unjustified escalation, task-wide routing, prohibited environment creation, or unassigned duplicate heavyweight execution. Positive cases select the correct route; repeated skill reads or helper rediscovery on every subsequent command are unnecessary.

### 3.3 Check attributable state and friction

Before and after the bounded cases, inspect relevant compatibility roots, harness state, WSL dependency locations, worktree dependencies, task temp, crash dumps, and owned heavyweight processes. Avoid a recursive whole-host inventory.

Distinguish expected build/test output and native caches from additional compatibility environments. Shared-host free-space movement alone does not establish a regression. Investigate changes attributable to these commands; ordinary runs must not create harness source/dependency copies or another WSL ecosystem.

Compare checklist observations: extra diagnostic launches, repeated skill reads/discovery, new compatibility state, whether requested work reached execution, and unexpected friction. No benchmark dashboard or timing target is required.

**Stage 3 complete when:** affected checks pass, real expected outcomes are verified, behavioral cases have observed results, and attributable compatibility duplication is absent. Missing main-session capability, runtime prerequisites, historical inputs, or retained-audit proof remain explicit pending items rather than invented passes.

## Stage 4 — Final discovery and acceptance

### 4.1 Reinspect live authority after repairs

Verify intended skills are discoverable from actual sources, active instructions/validators agree with final routes, and generic version/lineage gating is absent. Use a fresh main context and an unprimed delegated context where supported. Existing-session metadata alone cannot prove fresh-session discovery.

### 4.2 Close the one checklist

Reinspect changed files, current diff/status, relevant checks, and runtime evidence. Record completed changes, expected outcomes, friction observations, and blockers. Preserve known retained audit exceptions in final wording. If staging/commit/closure is later requested, apply its repository safeguards then.

The redesign is complete only when ordinary paths are stateless, known Worker routes choose x64 directly, demonstrated unknown incompatibilities are handled narrowly, main/subagent routing and final discovery checks pass, resource handoff works safely, and changed required audit paths retain truthful evidence semantics.

Disclose partial historical reconstruction separately; it cannot support claims that all 15 historical threads were re-reviewed. Optional cleanup follows as a separately authorized resource task. Redesigned behavior must be correct without deleting old caches or worktrees.

## Execution and rollback

Execute **Stage 0 -> Stage 1 -> Stage 2 -> Stage 3 -> Stage 4**. After baseline, independent skill/history/source analysis can proceed in parallel with ordinary-route work; merge shared authority edits before runtime verification. Delegate with fork_turns: "none" and a suitable lower-cost model. The main agent coordinates heavyweight execution.

If an edit adds compatibility machinery, prove the boundary requiring it; otherwise discard it. Roll back only task-owned edits against the recorded baseline, preserving pre-existing user work. Avoid broad reset or deletion of uncertain shared state.

The intended result is one stateless repository execution path, a small exact-tool compatibility policy, separate resource recovery, and an evidence harness used only for a demonstrated evidence requirement.
