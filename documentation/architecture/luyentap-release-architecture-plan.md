# LuyenTap release architecture plan

Status: Phase 1 and Phase 2 complete. Phase 3 implementation is integrated on protected `main`; operational qualification remains open. Phase 4 is deferred.

This is the concise, version-controlled source of truth for objectives, boundaries, progress and direction. Dated release records preserve evidence; they do not replace this plan. Implementation details, tools and sequencing remain adaptable when evidence supports a better route.

## Objectives

- **Development reliability:** local startup selects the intended current local database, representative data, compatible authentication, Firebase/Workers configuration and application services. A listening port alone is not readiness.
- **Efficient testing:** localhost and real-browser verification are direct and repeatable, without stale worktrees, processes, versions or environment mismatches.
- **Git and integration reliability:** branch, worktree, commit, PR, merge and synchronization state remain understandable across local `main`, remote `main` and production.
- **Release reliability:** completed work reaches production without repeated source reconstruction, unnecessary rebuilds or rediscovered procedures.
- **Codex autonomy:** Codex investigates tools, credentials, permissions, approvals and environments before declaring a blocker, and owns technical diagnosis and recovery.
- **Verification quality:** Codex chooses proportionate tests and tools, including real-browser evidence when warranted. Outcomes and evidence matter more than a prescribed framework.
- **Safety:** preserve exact source/artifact integrity, authorization, production protection, concurrency and freshness control, independent verification and recovery.
- **Operational efficiency:** remove repeated infrastructure research, duplicated checks, manual coordination and recurring delays.
- **Maintainability:** preserve useful capabilities while retiring structures whose maintenance cost exceeds demonstrated value.

## Four phases

1. **Phase 1 — Reliable release foundation (complete).** Exact source and artifact identity, durable retention, provider observation, truthful per-service scope, operation identity and interrupted verification recovery.
2. **Phase 2 — Protected integration and convergence (complete).** Protected `main`, required integration checks, source convergence, normal release evidence and two qualified normal production releases from protected `main`.
3. **Phase 3 — Guarded CI promotion, publication, verification and recovery (current).** Select exact protected source, verify relevant scope, build once, retain the artifact/evidence, bind authorization, serialize publication, independently verify and recover without duplicate publication.
4. **Phase 4 — Operational simplification (later).** Remove demonstrated duplicate procedures, unnecessary manual inputs and historical reconciliation after Phase 3 is proven and measured.

Local-development reliability is an important parallel/deferred workstream. It must not expand Phase 3 into a repository-wide tooling overhaul.

## Architectural principles

- Separate Codex application-change verification from release-infrastructure qualification. Codex chooses an appropriate browser/tool/test method for the change; the release system enforces provenance, authorization, freshness, concurrency, publication and recovery.
- Do not make a fixed browser suite, framework, generated account scheme or dedicated qualification project a universal product-verification requirement. Keep production and qualification isolation, least privilege and fail-closed evidence where an operational experiment requires them.
- Automate technical metadata, evidence collection, source/artifact binding, cleanup and recovery. The owner supplies objectives and genuine approval, not hashes, fingerprints, paths or procedural coordination.
- Use existing platform capabilities and repository tools before adding services, approval stores, frameworks or permanent infrastructure.
- Apply evidence in proportion to risk: presentation, functional, contract/security and stateful/coordinated changes need different proof. Hosting evidence cannot qualify Workers, rules, storage, Functions or application-data changes.
- Preserve production approval, source/artifact integrity, independent live verification and native recovery. Never bypass protection or turn uncertain evidence into success.

## Phase 3 acceptance matrix

| Criterion | Current status | Evidence / remaining proof |
|---|---|---|
| Approval invalidation when source, artifact, configuration, baseline, dependency or review changes | Implemented and automatically tested | `scripts/release-promotion.mjs`, release-check/archive tests; final operational qualification remains open |
| Serialized promotion and stale production freshness protection | Implemented and automatically tested | Workflow concurrency, Git/Hosting baseline checks and promotion tests; no production mutation in Phase 3 yet |
| Authorized disposable publication, exact readback and native Hosting recovery | Partially demonstrated | Run 43595251093 deployed the retained artifact to isolated Hosting and reached authenticated flows; successful browser/clone/cleanup end-to-end evidence is still unqualified |
| Interrupted verification resumes without redeployment | Automatically tested | Release-operation/deploy-live interrupted-verification tests; retain as separate from publication qualification |
| Coordinated frontend/backend change with ordering, negative checks, partial failure and recovery limits | Unqualified | Requires a real isolated experiment |
| Frontend rollback rejection without backend compatibility evidence | Unqualified | Requires a real isolated rejection experiment |

### Browser prerequisite decision

The browser lane is an operational qualification experiment, not a universal requirement for Codex application verification. The latest run [43595251093](https://github.com/iamhuwng/autoresync/actions/runs/43595251093) proved canonical Hosting routing far enough for `/login` and generated teacher/student authentication to reach final checks. It failed the specific qualification-network assertion and cleanup verification because temporary Firebase configuration was placed inside Playwright's output directory, which Playwright clears. No browser qualification claim follows from that run.

The next bounded decision is to determine whether a simpler agent-selected verification and a separate disposable publication/recovery experiment can provide the required Phase 3 evidence. If an automated browser gate remains necessary, document the exact property it enforces and keep its scope risk-proportionate. Do not repair and rerun the current lane merely to make its fixed suite green.

## Current implementation and evidence

- Protected `main`: `339969143196275fa30bb6958aaa5594db982bfd`.
- PR #243 merged OIDC/qualification role and SDK cleanup hardening as `dfb27c993d8913681547dc72d2c85966651fe289`.
- PR #244 merged canonical qualification Hosting routing, fail-fast browser diagnostics, least-privileged qualification fixture rules and cleanup diagnostics as `339969143196275fa30bb6958aaa5594db982bfd`.
- The live Phase 3 workflow is `.github/workflows/release-promotion-phase3.yml`; executable authority is in `scripts/release-promotion.mjs`, `scripts/deploy-live.mjs`, `scripts/release-archive.mjs`, `scripts/release-browser-gate.mjs` and the existing release-safety scripts.
- Focused local proof on the Phase 3 branch: 68 Node tests, 3 runtime-config tests and x64 RTDB emulator security proof covering initial privilege escalation, immutable role/status, deletion/recreation and cleanup.
- Production was not deployed or approved. The production GitHub environment remains the owner-controlled boundary.

## Recommended milestones

1. From protected `main`, decide the smallest browser/recovery evidence route that proves the missing Phase 3 properties; do not assume the current Playwright lane is the answer.
2. Exercise one disposable exact-artifact publication, independent live/content verification, native Hosting clone recovery and independently verified cleanup, recording each status separately.
3. Perform the coordinated service-change and incompatible-rollback experiments on isolated targets.
4. Reconcile the evidence matrix and present the owner-facing production approval boundary. Do not call Phase 3 complete from local tests or green CI alone.
5. After completion, measure and remove demonstrated duplication under Phase 4.

## Historical evidence

Useful dated records remain in `documentation/release-audits/`, `documentation/system/release-safety.md`, `documentation/system/integration-releases.md` and the Phase 2 completion records. The prior external architecture document under `.codex/visualizations/` is historical context, not the active source of truth.
