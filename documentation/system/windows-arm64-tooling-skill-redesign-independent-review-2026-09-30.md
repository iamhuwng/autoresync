# Independent review of the Windows ARM64 tooling redesign plan

Reviewed on 2026-09-30. Assessment: **84/100; sound direction, targeted amendments needed before execution.**

This reviews the September 24 revised plan, not the earlier 751-line plan graded 74/100 in the conversation. The revised file has 531 lines, five stages, and SHA-256 `335d05e0afee02c9b9b799fc384274505a5c5687c2cc9c899fd97668708dd7ce`, matching the exported conversation's final artifact. The earlier routing contradiction, greenfield skill rewrite, provisioning stage, and mandatory deep harness redesign have already been addressed. They are not findings against this version.

## Requirements reconstructed from the conversation

The primary objective is reliable development on Windows ARM64 with less routing friction, wasted execution, duplicated environments, and resource pressure. Preserve the useful compatibility mechanism while making ordinary development straightforward.

The supporting requirements are:

- Base the historical investigation on 15 genuine main conversations; inspect their subagents separately without counting them toward 15.
- Recover the original skill's objectives and missed safeguards before narrowing its ownership.
- Route the exact incompatible tool, preserving the authoritative checkout, working directory, configuration, arguments, and package ownership.
- Reuse existing helpers, resolver, doctor, and provisional skills. Patch demonstrated gaps rather than rebuild them.
- Separate compatibility, provisioning, resource recovery, ordinary debugging, and evidence-harness responsibilities without losing safeguards at their boundaries.
- Prevent unnecessary WSL environments, source copies, dependency trees, helper copies, and overlapping heavyweight jobs.
- Preserve truthful proof: startup, collection, and preflight are not successful execution of the requested work.
- Supply a detailed, ordered Markdown plan. Detail was explicitly requested; document length alone is not a defect.

The conversation supports two important distinctions. The ARM64 skill need not solve every historical problem itself; the split system must provide an owner. Also, written safeguards already existed historically, so adding more prose is insufficient without verifying execution paths and agent choices.

## Scorecard

These are judgment scores, not measured performance statistics.

| Dimension | Score | Reason |
|---|---:|---|
| Fidelity to user objectives | 18/20 | Preserves compatibility and materially reduces scope; efficiency lacks a concrete baseline. |
| Ownership and design | 18/20 | Strong separation; retained audit/WSL behavior still needs an explicit decision. |
| Historical traceability | 12/15 | Good failure inventory, but no reproducible 15-main-thread manifest or incident citations. |
| Current-state awareness | 14/15 | Correctly starts from existing implementation; some snapshot assumptions are stale or incomplete. |
| Execution order and containment | 10/15 | Discovery gate precedes repairs; ordinary harness entry remains executable; overlapping stages obscure the smallest change set. |
| Behavioral and resource validation | 12/15 | Tests agent choices as well as tools, but cases, repetitions, observation rules, and final outcomes need definition. |
| **Total** | **84/100** | **Keep the architecture and five-stage structure; amend the execution contract.** |

## Independently verified evidence

The source inspection covered the exported conversation, full revised plan, current user-scoped skills, resolver, doctor, manifests, focused resolver test, harness dispatcher/normal runner/contract/authority checks, acceptance validators, and targeted Git history. A read-only subagent independently checked requirements and historical corroboration. It did not run compatibility jobs or modify files.

| Evidence | Observation | Implication |
|---|---|---|
| `~/.codex/skills/run-windows-arm64-tools/SKILL.md` | Revision 5.0.0 already has strict triggers, exact-tool routing, shared helper placement, no ordinary stateful harness, and resource handoff. | Audit and patch; do not recreate. |
| `~/.codex/skills/recover-windows-dev-resources/SKILL.md` | Revision 1.0.0 already attributes pressure and protects dirty worktrees, source, credentials, active runtimes, and uncertain shared caches. | Preserve the split and cleanup safeguards. |
| `scripts/tooling-where.mjs` | Four named Cloudflare/R2 tools select shared x64 Node on Windows ARM64; other listed JS tools use the invoking Node; Worker routes reject WSL. | The central stateless mechanism exists. Native routes depend on launching the resolver with native Node. |
| `scripts/__tests__/tooling-where.test.mjs` | One test checks Cloudflare Vitest routing under simulated ARM64, Linux, and WSL conditions. | Useful coverage, but not proof of all routes, cwd/argument forwarding, child execution, or resource behavior. |
| `scripts/harness/contract.mjs:10,28,39` | Pins generic skill revision 4.3.0, declares Wrangler runtime `wsl`, and prescribes shared skill/harness lineage. | Live authority still disagrees with the proposed design and v5. |
| `scripts/harness/skill-authority.mjs:75` | `assertActiveGenericSkill` rejects a revision other than the contract's pinned revision. | Authority reporting can reject v5. This does not establish that every audit command fails: dispatcher authority checking follows a different path. |
| `scripts/harness/run-tool.mjs:40` and `run-normal.mjs:50,82` | A call without `--audit` still selects a runner that can ensure cached dependencies, prepare overlays, or invoke WSL Wrangler. | Removing package callers alone does not remove the reachable ordinary stateful path. |
| `scripts/lib/prd0062-acceptance-conformance.ts:56` | Requires harness Playwright commands and rejects direct Vite/Vitest/Wrangler command forms. | Active validation can force agents back into the historical workflow. |
| `scripts/check-prd0062-activity-coverage.mjs:50` and `scripts/validate-prd0062-acceptance-matrix.mjs:39` | Ordinary fixture/semantic checker execution enters the harness through Vite-node. | Classify actual call chains, not only package scripts or filenames. |
| `cloudflare/package.json:12-19` | Dry-run, deploy, status, versions, and rollback remain explicit audit-harness paths. | Retained audit behavior matters operationally; `--audit` alone does not establish evidence necessity. |
| `documentation/system/local-tooling-layout.md:144-150` | Prohibits worktree dependency installation for checks, but also says differing manifests should retain an isolated dependency tree. | Clarify the authorized exception rather than leaving agents to reconcile conflicting bullets. |
| Git inspection | Plan, tooling policy, resolver, doctor, and resolver test were untracked; manifests and harness files already had changes. | Preserve pre-existing work and distinguish provisional working-tree state from committed authority. No files were staged or committed by this review. |

Historical Git corroboration supports the architectural explanation. `fb75ede8` (2026-08-20) introduced an authority-focused harness generation whose repository skill directed ordinary execution to the generic ARM64 skill. `bec7f897` (2026-08-23) added cleanup and routing machinery. `3bfd1742` (2026-09-23) removed the repository harness-contract skill, but executable coupling survives. Thus an instruction layer can be retired while runtime contracts and validators remain active.

The export asserts the 15-main-thread review, approximately 12.95 GB of harness state, 37 runs in one day, WSL crash dumps, and the K1-R raw-Windows-path incident. This review did not independently re-read those 15 raw conversation logs or reproduce those historical measurements. They remain conversation-reported evidence. Existing collision codes and Windows URL handling corroborate relevant failure mechanisms, not those specific incidents or counts.

## External technical research

Windows 11 on ARM supports x64 application emulation. That supports reusing a Windows x64 helper without adding a Linux environment. It does not mean an ARM64 Node process can load every x64 native addon. [Microsoft documentation](https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation).

Cloudflare's current upstream workerd platform selector includes `win32 arm64 LE` mapped to the existing Windows x64 binary. The upstream change explicitly describes execution under emulation. However, the inspected installed Cloudflare workerd 1.20260617.1 still has only the Windows x64 selector, and R2 locks workerd 1.20260302.0. Therefore the existing repo x64 route remains justified; upstream support is a reason to re-evaluate on a future dependency update, not to remove the route now. Other native dependencies must also pass before retiring x64 Node. [Upstream change](https://github.com/cloudflare/workerd/commit/dff2d25c47), [current platform selector](https://github.com/cloudflare/workerd/blob/main/npm/lib/node-platform.ts).

Official OpenAI documentation confirms that implicit skill selection depends on the description, that skill metadata is exposed before the body, and that large skill catalogs can shorten descriptions or omit entries. It also documents an optional implicit-invocation switch. Keep critical trigger boundaries at the beginning of descriptions and test actual discovery on the installed host. Do not move these working skills merely because current documentation lists a different user discovery directory: this session already advertises both from `.codex/skills`. [Official skill documentation](https://developers.openai.com/codex/skills/).

## Required plan adjustments

### 1. Make Stage 0 diagnostic; put clean discovery acceptance after repairs

Stage 0 should record discovered skill sources, revisions, competing instructions, and missing capabilities. It should not require an already conflict-free environment before Stage 1/2 are allowed to repair that environment. The repository harness-contract skill named in the snapshot checklist has already been removed; absence is a finding, not an instruction to restore it.

Replace the Stage 0 discovery gate with:

> Record the actual discovery and authority baseline, including conflicts. Proceed when the intended owners and bounded patch list are known. Verify conflict-free discovery after the relevant authority/skill changes. If a fresh main-session probe is unavailable, continue independent source work and record that final behavioral proof is pending.

### 2. Give ordinary harness containment an executable outcome

The plan correctly says ordinary work must stop depending on the harness, but mostly describes migrating callers and updating guidance. The old normal runner remains a reachable invitation to repeat the historical problem.

After classifying and migrating ordinary callers, choose the smallest enforceable boundary: remove the ordinary dispatcher branch, or reject ordinary invocations with a direct resolver remediation. Harness contract tests may exercise internal behavior deliberately; they need not preserve a public ordinary-execution interface. Preserve explicitly required audit and doctor paths.

Do not build a new wrapper, cache manager, or routing registry. One dispatcher guard or deletion may suffice once callers are reconciled. Add one focused check that an ordinary invocation cannot enter cache/overlay/WSL machinery.

### 3. Decide retained audit routing explicitly

Category A currently combines evidence intent with retention of an implementation that routes Wrangler through WSL and can stage Linux dependencies. Evidence intent and execution architecture are separate decisions.

For every retained operational path, establish what it provides beyond the direct tool: required source-integrity checks, durable evidence, protected-state validation, or another concrete guarantee. Retain only that demonstrated requirement. Then explicitly choose whether the retained path uses Windows x64 or keeps a narrowly documented Linux exception.

The smallest Windows routing correction to a retained harness adapter is compatible with the redesign's scope. Rebuilding retention or cache protocols is not. If an existing Linux audit exception must remain temporarily, identify it and qualify the final claim accordingly; do not simultaneously claim that all Worker commands reject WSL.

### 4. Make known compatibility declarations version-bound

Keep the current Cloudflare/R2 routes. Record the owning package, locked workerd/native binding versions, and observed incompatibility in existing tooling documentation. Recheck after relevant dependency changes; remove obsolete exceptions only when a representative requested command works with the native route.

This needs no new automated platform capability detector. A short rationale and an upgrade-triggered check are sufficient.

Also refine the failure rule: abandon architecture diagnosis only after confirming that the intended executable actually ran and classifying the new failure. An unchanged error after an ineffective route switch, wrong child PATH, or another incompatible native component is not evidence against the architecture hypothesis.

### 5. Turn behavioral testing into a small reproducible experiment

Keep the positive and negative trigger tests. Specify exact prompts, expected route and skill activation, source/revision under test, model, context setup, observed tool calls, and mutation restrictions. Do not give test agents the answer key or redesign narrative.

Use a compact initial set: ordinary React/Vitest; Playwright locator failure; missing dependency; Windows ESM path failure; known Worker route; unknown wrong-architecture binding; resource pressure; explicit audit requirement. Include one mixed task so a Worker subcommand cannot move the whole task to x64 or the harness.

Run one fresh main-session case per class and a representative unprimed subagent subset. Repeat ambiguous or high-risk cases once in independent context. These are operational acceptance checks, not statistical proof of universal agent behavior. Any observed prohibited environment creation or ordinary harness invocation fails the relevant case.

A known resolver-managed Worker command should choose x64 immediately. Skill loading may be appropriate under its declared trigger; repeated loading or extra discovery ceremony is not required on every subsequent subcommand.

### 6. Preserve historical traceability without creating another evidence platform

Add a compact source appendix: 15 distinct main-thread identifiers/date ranges and relevant child-thread links, plus a source excerpt or log location for each pivotal failure class. If the original scan is unavailable, label its numerical claims unverified and reproduce only cases needed for the patch decisions.

Do not require a new session indexer, dashboard, forensic database, or comprehensive rescan before straightforward verified repairs. An existing source path and concise excerpt are enough.

### 7. Define efficient, truthful completion

Replace “the real requested command succeeds” with:

> Execute the real requested command in the intended context and verify its expected outcome. Report tool startup failures, product assertion failures, expected negative-test failures, and blocked prerequisites separately. For dev servers, verify readiness, live source behavior, and owned shutdown rather than waiting for exit zero.

Run affected checks rather than making broad suites an automatic final gate. Existing resolver tests should cover all declared Worker route names and forwarding where changed; one targeted process check can establish cwd/argument/exit propagation. Version/help output is launch evidence only. A real Worker smoke test is still needed when implementing or changing that runtime route.

Measure efficiency using existing observations: extra diagnostic launches, unnecessary repeated skill reads, new compatibility environments, and whether the requested command reached execution. Normal tool outputs and native build/test caches are allowed; the prohibition concerns extra compatibility source/dependency/runtime environments. Avoid brittle “zero disk growth” claims on a concurrently used host.

### 8. Resolve the two small provisioning-policy ambiguities

The doctor currently treats legacy Functions dependencies as required although policy says to exercise Functions only when touched. Report their absence as an unrelated prerequisite unless the requested task needs Functions. A frontend task should not need to provision a deprecated package to proceed.

Clarify worktrees: checks should use canonical Local dependencies by default; differing lockfiles may justify an explicitly authorized isolated installation, but should not cause silent borrowing of incompatible dependencies or automatic installation. No new provisioning skill is needed.

## Recommended execution sequence

Keep five stages, but remove duplicated handoffs between Stages 1 and 3:

1. **Baseline:** current source, provisional/committed status, discovered skills, conflicts, bounded historical sources, and a short delta checklist. No repair-free discovery prerequisite.
2. **Ordinary execution:** validate existing resolver/doctor; reconcile active callers and acceptance validators; enforce the ordinary harness boundary; clarify tooling policy.
3. **Skills and retained evidence:** patch only gaps in v5/resource skills; decouple generic revision/lineage; resolve retained audit routing and document any exception.
4. **Focused proof:** affected route/forwarding checks, one representative real frontend command and Worker command, then unprimed main/subagent trigger cases. Record compatibility-state changes attributable to those runs.
5. **Acceptance:** final discovery check, unresolved evidence explicitly marked, useful before/after friction summary, and preservation of pre-existing work. Cleanup and deeper harness changes remain separate follow-ups.

One checklist with an evidence column is sufficient. There is no need for separate authoritative ledgers, duplicate final matrices, or new orchestration infrastructure. Runtime verification should remain orchestrator-owned; independent source/history analysis can run in parallel.

## Checks performed for this review

- Native shell Node: `win32/arm64`, v22.17.1.
- `npm run tooling:doctor`: exit zero; 0 missing prerequisites, 13 warnings. Warnings identify candidates, not safe deletion or current pressure.
- `npm run tooling:where -- cloudflare-wrangler`: selected the canonical shared x64 helper and package-local CLI.
- `node --test scripts/__tests__/tooling-where.test.mjs`: 1 test passed, 0 failed.
- Resolver execution of root Vitest `--version`: `vitest/3.2.4 win32-arm64 node-v22.17.1`.
- Resolver execution of shared x64 Node architecture probe: `win32/x64 v22.17.1`.
- Cloudflare resolver execution of Wrangler `--version` from its package cwd: 4.103.0.

One initial Vitest version probe used a root-relative script path from the Cloudflare cwd and failed with `MODULE_NOT_FOUND`. Rerunning from the correct root cwd succeeded. This was a review-command path mistake, not architecture or product failure.

These checks establish existing routing and CLI launch behavior. They do not establish Worker execution, fresh-main-session selection, resource regression, browser behavior, audit success, or remote deployment state. No installation, cleanup, deployment, original-plan edit, staging, or commit was performed. This review is a separate recommendation artifact; it does not certify execution of the redesign.
