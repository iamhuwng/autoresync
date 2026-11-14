# Phase 3 browser-verification prerequisite

Status: **UNQUALIFIED** as of 13 November 2026 (Asia/Bangkok). This record concerns release-qualification Phase 3, not the product PRD Phase 3.

The original release architecture plan makes a dependable browser-verification
lane a Phase 3 dependency. Its local-runtime section says a browser result must
be tied to the selected source, configuration and runtime ownership before it
can support release qualification. The same plan leaves local verification and
the owner-facing release-card operation open; Phase 3 is therefore not
qualified by the existing Hosting publication records or by passing CI.

The retained main-release qualification contains useful bounded local evidence:
Student Reading resume behavior and Teacher Listening authoring/publication were
observed through `/login` on the role ports. That evidence is not a dependable
Phase 3 lane: one runtime initially served an older production artifact, the
other served source different from current main, backend ownership was
unverified, and the attempted student Start Test entered an abandoned-session
path and was stopped. The record explicitly excludes that path from proof.
Historical component/browser records likewise carry task-specific scope,
blocked-controller notes, or explicit browser waivers; they do not establish a
current-main source/runtime-owned lane.

The separate `local-development-reliability-implementation-plan.md` remains a
proposed, separately authorized plan. It requires implementation authorization
and owns local service ownership, capture/restore, deterministic fixtures,
authenticated teacher/student workflows, resource isolation and repeatability.
It explicitly assigns CI, protected branches, promotion and rollback scripts to
the release project. This Phase 3 work does not absorb, implement, or use that
plan as evidence.

Decision: the browser prerequisite remains open. A future release card must
state the browser decision (`verified`, `blocked`, `not-run`, or `waived`), bind
the evidence to the candidate source/environment/configuration, name the
scenario and evidence references, and spell out missing proof and impact. A
plan digest or unit-test result alone cannot clear this prerequisite.

Current implementation boundary (13 November 2026): the workflow uses a
separate `qualification` GitHub environment with its own OIDC service account,
dedicated Firebase project, Hosting site and `LUYENTAP_QUALIFICATION_ENV`.
Read-only inspection has verified the project, site, RTDB instance, federation
condition and least-privilege qualification role. The browser lane rejects the
production environment and refuses to create Auth or RTDB data when the
retained artifact is still bound to the production environment. The current
promotion attempt stopped earlier at the source compatibility review gate, so
no qualification Auth, RTDB or Hosting channel mutation is claimed by this
record.
The existing production Dev Quick Login panel remains a separate development
convenience exposure; it is not used by, or evidence for, the generated
email/password browser flow.
The email/password form is gated to the controlled qualification host and is
not exposed on the live production host by this qualification change.

The current implementation now supports one-byte runtime selection: the
artifact selects the production Firebase web config on the live host and the
dedicated qualification config on the qualification site's default host or a
Firebase preview host in the documented `site--qualification-release-...web.app`
form. Qualification remains blocked until the retained artifact reaches that
lane and browser network evidence confirms the selected RTDB host and Auth API
key.

## Superseding architecture decision — 14 November 2026

The fixed authenticated Playwright lane is no longer part of the universal
promotion contract. It remains a disposable operational experiment when that
specific infrastructure property is useful. Application verification belongs
to Codex: the agent selects the browser/tool, journeys and depth for the actual
change and records source-bound evidence in
`documentation/release-evidence/verification.json` when application paths
require it. The release card validates the source revision/fingerprint,
freshness, passing checks and evidence references without requiring Playwright,
generated accounts, a dedicated Firebase project or a teacher/student smoke
flow. Non-application changes may carry an explicit `not-required` decision;
backend, rules, Worker and storage changes retain their service-specific gates.

The 14 November Hosting experiment separately verified disposable publication,
exact asset readback, native clone recovery and cleanup. It is infrastructure
qualification, not application verification. The old run and its failure remain
historical evidence of the previous lane and do not authorize a promotion.
