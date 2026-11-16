# Deployment procedure improvements

This plan follows the 17 November 2026 QA deployment rehearsal and the annotated
procedure comparison. It is subordinate to the canonical release architecture
plan. The screenshots are proposals; source and retained run evidence determine
which changes are justified.

## Evidence and decision

The Login Expansion thread successfully deployed protected source `056b2984` to
the persistent qualification site, verified 437 assets and selected Auth, RTDB,
Worker and browser behavior, and cleaned its temporary account/data. It explicitly
did **not** deploy production. Its normal build failed from memory pressure; an
`esbuild` QA build succeeded. This proves QA behavior, not equivalence to a later
production build. Cleanup also needed ad hoc recovery after registration.

## Implement now as one coherent change

1. Extend the existing immutable verification bundle to optionally retain the
   exact production-format Hosting artifact that Codex tested. Reuse the existing
   bounded archive validation. Bind source, manifest, production environment and
   build-input identity; restore those bytes in prepare instead of rebuilding.
2. Keep source-level verification available for changes where it is sufficient.
   Do not invent a mandatory browser journey or make QA a universal dependency.
3. Materialize only production configuration in the promotion workflow. Optional
   QA configuration belongs to the selected prebuild/preview operation; its
   fingerprint stays in the retained artifact. Fail closed on a missing, altered,
   stale or mismatched retained artifact; never silently rebuild it.
4. Update the runbook, canonical plan and evidence record together. Exercise the
   bundle-to-card workflow with synthetic sources/artifacts and negative cases,
   then obtain an independent sol-loop review before handoff.
5. Batch the proven shared recovery correction here: recognize an old combined
   environment identity only by exact reconstruction from current production
   bytes, public QA inputs and observed live workflow; qualify newly declared
   indexes through native READY readback. Neither correction mutates production
   or waives actual configuration/service drift.

Acceptance: exact retained artifact restored and card accepted; altered archive,
missing archive, another source, environment, manifest or build binding rejected;
source-only evidence still supported; promotion has no unconditional QA inputs;
authorization, live snapshot, executor validation, readback and recovery retained.

Branch implementation and local integration proof are recorded in
[the dated audit](../release-audits/2026-11-17-tested-artifact-handoff.md).
All 294 focused Node tests passed after the batched recovery correction. Remote execution of the changed workflow and
production publication are not established by that local result.

## Operational follow-through and deferred changes

- Reuse the persistent foundation and its health check. Synchronize only affected
  non-production rules/services/configuration. Serialize shared QA backend changes;
  do not overwrite full-app rules with the optional historical smoke fixtures.
- Record cleanup intent before creating provider resources and retain it until
  read-only cleanup confirmation succeeds. Reuse the existing lifecycle where
  suitable; do not promote the feature-specific temporary scripts into a framework.
- Compatibility review remains technical and proportionate: a brief no-contract-
  change conclusion for a routine fix, service/order/recovery proof for coordinated
  changes. It already travels inline in one promotion package.
- Keep the final baseline snapshot: Actions concurrency is a run mutex, not a
  production-wide lock. IAM/sole-writer changes and relaxing latest-main policy
  need separate evidence and are outside this correction.
- Interrupted publication already has verification-only resumption. Read-only
  baseline identity reconciliation now recognizes the demonstrated old workflow
  without rewriting live metadata; actual configuration changes still require
  qualified publication. No production repair is authorized here.
- Do not change the production minifier merely because the QA run used a cheaper
  one. Schedule large checks serially and preserve the first failing build log.
- Fixed Playwright-gate removal and persistent foundation setup are already done;
  they are not new work or new completion evidence.

Keep this coupled hardening on one branch/PR until the complete relevant rehearsal
and review pass. Unit-test success alone is not a reason to merge part of it.
