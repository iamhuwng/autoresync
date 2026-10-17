# PRD0062 ticket #85 canonical identity repair

## Provenance

- Classification: original omission / latent provider defect.
- Original deterministic child authority and Delivery identities entered in
  `bd1edeb8`; the later policy-snapshot repair `a76c27c5` did not reconcile
  child document identity with the root Homework context used by trusted
  schedule, runtime, Delivery, and document consumers.
- Canonical repair owner: #85. #88 remains a consumer and does not duplicate
  this provider boundary.

## Repaired contract

- Root `assignmentId`, manifest `contextId`, and saga `contextId` are equal.
- One recipient authority remains at the deterministic child document
  `<root>--<recipient>--authority`; its `sagaId` and manifest context retain the
  root Homework identity.
- One recipient Delivery binding remains
  `<root>--<recipient>--delivery`, with `binding.revision` equal to the current
  manifest `bindingRevision`.
- Required manifest Placements reconcile one-for-one with the Delivery
  publication across Placement, Activity, Activity Version/Version ID, node,
  order, context mode, page groups, source identity, and physical pages.
- Trusted schedule, runtime, Delivery, current document, and historical
  document consumers resolve the child authority from root context plus
  recipient. A strict root-record fallback preserves committed legacy
  single-recipient authorities.
- Public Homework/result projections retain the root Homework ID and do not
  expose the child authority document identity.

## Verification

- Cloudflare repair and adjacent regressions:
  `12 files, 106 tests passed`.
- Root manifest, schedule, Delivery, dependency, and security regressions:
  `8 files, 50 passed, 5 emulator-gated skips`.
- Production-shaped saga-to-terminal proof:
  `cloudflare/test/book-homework-saga-terminal-runtime.test.ts`, `4/4`.
  It proves binding revision 7, exact Placement/version/source identity,
  autosave, first terminal submit, and pre-mutation denial for root-context and
  Delivery Activity Version mismatch.
- Targeted ESLint: passed.
- `git diff --check`: passed.
- Targeted TypeScript diagnostic filter: no #85-path diagnostics; the full
  repository compiler remains nonzero from unrelated pre-existing errors.
- Wrangler production dry-run: passed, 1242.81 KiB / gzip 234.29 KiB, with all
  Book route gates still disabled.

## Proof ownership

This repair reruns #85 producer-local and directly affected #87 consumer
contracts. Canonical deployed route composition remains #86/#59-owned,
assembled rules remain #118-owned, and later canary/activation drills remain
#134-owned. No capability was activated.
