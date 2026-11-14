# LuyenTap release architecture plan

Status: Phase 1, Phase 2, and Phase 3 release-orchestration capability are complete on protected `main` at `a57ecf757017a475ede56360097ac407cb287a2c`. Production authorization remains a separate owner decision. Phase 4 is next.

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
4. **Phase 4 — Operational simplification (current).** Remove demonstrated duplicate procedures, unnecessary manual inputs and historical reconciliation after Phase 3 is proven and measured.

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
| Approval invalidation when source, artifact, configuration, baseline, dependency or review changes | Verified | `scripts/release-promotion.mjs`, release-check/archive tests, and the immutable verification handoff |
| Change-scoped Codex application-verification handoff | Verified | `documentation/release-audits/2026-11-15-phase3-verification-bundle.md` records actual immutable synthetic publication/readback; promotion-card and bundle tests remain required |
| Serialized promotion and stale production freshness protection | Implemented and automatically tested | Workflow concurrency, Git/Hosting baseline checks and promotion tests; no production mutation in Phase 3 yet |
| Authorized disposable publication, exact readback and native Hosting recovery | Verified on the disposable qualification surface | `documentation/release-audits/2026-11-14-phase3-hosting-publication-recovery.md` records unchanged artifact publication, independent readback of all 443 manifest-listed assets, native `hosting:clone` recovery, and exact channel cleanup. Production publication and application/browser qualification remain separate gates |
| Interrupted verification resumes without redeployment | Automatically tested | Release-operation/deploy-live interrupted-verification tests; retain as separate from publication qualification |
| Coordinated frontend/backend change with ordering, negative checks, partial failure and recovery limits | Verified at the release-orchestration boundary | `documentation/release-audits/2026-11-14-phase3-coordinated-change-rollback.md` records disposable frontend/Worker/rules assessor fixtures, backend-first ordering, negative compatibility checks, recovery limits and no-duplicate operation tests |
| Frontend rollback rejection without backend compatibility evidence | Verified at the release-orchestration boundary | The same experiment rejects an incompatible frontend/Worker rollback without a source/base/live-bound compatibility review; provider-specific service publication remains separately gated |

### Verification contract decision

The fixed Playwright teacher/student lane is not a promotion prerequisite.
Codex chooses browser journeys, emulators, provider checks or focused automated
checks in proportion to the change. The 14 November disposable experiment
separately proves Hosting publication, exact readback, native clone recovery and
cleanup; it does not define application verification.

For application-impacting paths, Codex writes a verification record outside the
candidate checkout and uses `scripts/release-verification-bundle.mjs` to bind
that record and retained evidence artifacts to the exact source revision, base,
source fingerprint, environment fingerprint, deterministic build-input identity
and timestamp. Each run receives a unique tag
(`verification-<source revision>-<run UUID>`), so repeated verification of one
commit cannot overwrite an earlier artifact. Preparation reads the asset back by
tag and digest, verifies the published release is immutable, checks the tag
target, validates every artifact reference and content hash, then carries the
bundle into the promotion card. The repository setting is an external
owner/admin prerequisite; this workflow never changes it. A source-committed
evidence file is not used, which avoids a self-referential source fingerprint.

A path classifier still creates an explicit `not-required` record for changes
outside application runtime paths. Missing, stale, mismatched, fabricated or
altered bundles fail closed. Backend, rules, Worker, storage and other service
changes retain their own release-safety scopes. The promotion workflow no longer
runs `browser-gate` or depends on a fixed browser suite; it requires the
source-bound bundle only when the classifier says application evidence is
required.

## Current implementation and evidence

- Protected `main`: `a57ecf757017a475ede56360097ac407cb287a2c` after merged PR #254.
- PR #243 merged OIDC/qualification role and SDK cleanup hardening as `dfb27c993d8913681547dc72d2c85966651fe289`.
- PR #244 merged canonical qualification Hosting routing, fail-fast browser diagnostics, least-privileged qualification fixture rules and cleanup diagnostics as `339969143196275fa30bb6958aaa5594db982bfd`.
- PR #245 merged the canonical release architecture plan as `24f15c9d714340877a39a813a9568d7e23a641cb`.
- PR #246 merged the disposable Hosting publication/recovery evidence as `8da3f49cbfefd24e02f89a51a27aebfa786b6b44`.
- PR #248 merged the change-scoped verification contract as `d173bb22ac3a458c2df10ceaadb8e65fa6fb6d10`; PR #250 merged the operational Codex bundle handoff as `ba6d1f0052ca640580847b8e7ddbbd82164248d4`; PR #251 reconciled the Phase 3 qualification record; PR #252 corrected the canonical verification-bundle filename in the runbook and test fixture.
- The live Phase 3 workflow is `.github/workflows/release-promotion-phase3.yml`; executable authority is in `scripts/release-promotion.mjs`, `scripts/deploy-live.mjs`, `scripts/release-archive.mjs` and the existing release-safety scripts. `scripts/release-browser-gate.mjs` is retained only for optional disposable operational experiments.
- Focused local proof on the Phase 3 branch: 68 Node tests, 3 runtime-config tests and x64 RTDB emulator security proof covering initial privilege escalation, immutable role/status, deletion/recreation and cleanup.
- Production was not deployed or approved. The production GitHub environment remains the owner-controlled boundary.

## Recommended milestones

1. Completed: PR #250 integrated the source-bound, change-scoped verification contract; Codex chooses application evidence and the release system validates its binding.
2. Completed by the 14 November qualification experiment: retain the exact-artifact publication, independent live/content verification, native Hosting clone recovery and independently verified cleanup as infrastructure evidence rather than a universal application browser requirement.
3. Completed by the 14 November isolated coordination and rollback experiment; retain provider-specific service qualification as a separate gate.
4. Completed: reconcile the evidence matrix and preserve the owner-facing production approval boundary. Production authorization remains separate.
5. Next: rerun the guarded promotion after PR #254, then measure and remove only demonstrated duplication. The current inspection found one verification-bundle implementation and no promotion-workflow dependency on the browser gate; it did not justify deleting the optional disposable experiment.

## Historical evidence

Useful dated records remain in `documentation/release-audits/`, `documentation/system/release-safety.md`, `documentation/system/integration-releases.md` and the Phase 2 completion records. The prior external architecture document under `.codex/visualizations/` is historical context, not the active source of truth.
