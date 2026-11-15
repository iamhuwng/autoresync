# Phase 3 single promotion package — 2026-11-15

PR #272 completes the coupled release-handoff simplification on
`codex/phase3-single-promotion-package`.

The compatibility review is now carried as one inline object plus a SHA-256
digest in the promotion card. `deploy-live.mjs` receives that binding directly
through `LUYENTAP_RELEASE_COMPATIBILITY_REVIEW_BINDING`, validates source,
baseline, live fingerprint, dependency fingerprint and freshness, and no
longer reads review paths or review files. The promote job no longer copies or
rehydrates a review artifact. `deploy-live.mjs` creates operation-result files;
Actions only uploads and retains those files for recovery and reconciliation.

Negative coverage rejects a missing review member, altered object, stale
timestamp and source/baseline mismatch. The existing production publication
(`8885ef7d4a5f8bd94f45c6f185cb7031afbcb77b`, independently verified by
operation `32118ca3-0810-4fd7-84b3-7ca1a122169e`) is unchanged and no deploy is
performed by this change.

Focused release evidence on this branch:

- promotion card/workflow tests: 14 passed;
- release-check tests: 67 passed;
- deployment-safety tests: 47 passed;
- the synthetic promotion rehearsal exercised card creation, digest binding,
  environment export and fail-closed negative cases.

The fixed Playwright teacher/student lane remains optional and is not restored
as a universal promotion gate.
