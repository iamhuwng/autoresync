# LuyenTap release architecture plan

Status: Phase 1, Phase 2 and Phase 3 complete at the release-orchestration boundary. Phase 4 is deferred.

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
3. **Phase 3 — Guarded CI promotion, publication, verification and recovery (complete).** Select exact protected source, verify relevant scope, build once, retain the artifact/evidence, bind authorization, serialize publication, independently verify and recover without duplicate publication.
4. **Phase 4 — Operational simplification (deferred).** Remove demonstrated duplicate procedures, unnecessary manual inputs and historical reconciliation after the owner elects to begin simplification.

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
| Authorized disposable publication, exact readback and native Hosting recovery | Verified on the disposable qualification surface | `documentation/release-audits/2026-11-14-phase3-hosting-publication-recovery.md` records unchanged artifact publication, independent readback of all 443 manifest-listed assets, native `hosting:clone` recovery, and exact channel cleanup. Production publication and application/browser qualification remain separate gates |
| Interrupted verification resumes without redeployment | Automatically tested | Release-operation/deploy-live interrupted-verification tests; retain as separate from publication qualification |
| Coordinated frontend/backend change with ordering, negative checks, partial failure and recovery limits | Verified at the release-orchestration boundary | `documentation/release-audits/2026-11-14-phase3-coordinated-change-rollback.md` records disposable frontend/Worker/rules assessor fixtures, backend-first ordering, negative compatibility checks, recovery limits and no-duplicate operation tests |
| Frontend rollback rejection without backend compatibility evidence | Verified at the release-orchestration boundary | The same experiment rejects an incompatible frontend/Worker rollback without a source/base/live-bound compatibility review; provider-specific service publication remains separately gated |

### Verification contract decision

The fixed Playwright teacher/student lane is not a promotion prerequisite. It
coupled every release to one browser framework, one journey, generated accounts,
and one qualification Firebase project, even when the change did not require
that evidence. The 14 November disposable experiment separately proves Hosting
publication, exact readback, native clone recovery and cleanup; it does not
justify retaining the old application browser gate.

Promotion now consumes `documentation/release-evidence/verification.json` when an
application-impacting path changes. Codex chooses the tool, browser, journeys,
emulator/provider checks and depth. The release card validates the record's
source revision and fingerprint, freshness, passing checks and evidence
references. A small path classifier permits an explicit `not-required` record
for changes outside application runtime paths. Backend, rules, Worker, storage
and other service changes remain subject to their own release-safety scopes.

The promotion workflow no longer runs `browser-gate` or depends on a fixed
browser suite. It consumes the source-bound verification contract when required.
It still requires a publishable assessment, exact source
and artifact bindings, protected-main freshness, production environment
authorization, serialized publication, independent provider readback and native
recovery. `scripts/release-browser-gate.mjs` remains an optional operational
experiment tool; it is not the universal application-verification contract.

## Current implementation and evidence

- Protected `main`: `8da3f49cbfefd24e02f89a51a27aebfa786b6b44`.
- PR #243 merged OIDC/qualification role and SDK cleanup hardening as `dfb27c993d8913681547dc72d2c85966651fe289`.
- PR #244 merged canonical qualification Hosting routing, fail-fast browser diagnostics, least-privileged qualification fixture rules and cleanup diagnostics as `339969143196275fa30bb6958aaa5594db982bfd`.
- PR #245 merged the canonical release architecture plan as `24f15c9d714340877a39a813a9568d7e23a641cb`.
- PR #246 merged the disposable Hosting publication/recovery evidence as `8da3f49cbfefd24e02f89a51a27aebfa786b6b44`.
- PR #248 merged the change-scoped verification contract and isolated coordination/rollback evidence as `d173bb22ac3a458c2df10ceaadb8e65fa6fb6d10`.
- The live Phase 3 workflow is `.github/workflows/release-promotion-phase3.yml`; executable authority is in `scripts/release-promotion.mjs`, `scripts/deploy-live.mjs`, `scripts/release-archive.mjs` and the existing release-safety scripts. `scripts/release-browser-gate.mjs` is retained only for optional disposable operational experiments.
- Focused local proof on the Phase 3 branch: 68 Node tests, 3 runtime-config tests and x64 RTDB emulator security proof covering initial privilege escalation, immutable role/status, deletion/recreation and cleanup.
- Production was not deployed or approved. The production GitHub environment remains the owner-controlled boundary.

## Recommended milestones

1. Completed by PR #248: Codex chooses application evidence and the release system validates its source binding and required scope.
2. Completed by the 14 November qualification experiment: retain the exact-artifact publication, independent live/content verification, native Hosting clone recovery and independently verified cleanup as infrastructure evidence rather than a universal application browser requirement.
3. Completed by the 14 November isolated coordination and rollback experiment; retain provider-specific service qualification as a separate gate.
4. Preserve the owner-facing production approval boundary. Phase 3 completion does not authorize production publication or service-specific deployments.
5. Begin Phase 4 only through a separate owner-authorized simplification scope.

## Historical evidence

Useful dated records remain in `documentation/release-audits/`, `documentation/system/release-safety.md`, `documentation/system/integration-releases.md` and the Phase 2 completion records. The prior external architecture document under `.codex/visualizations/` is historical context, not the active source of truth.
