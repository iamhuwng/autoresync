# PRD0062 ticket 04 / issue #29 closure repair — 2026-07-30

## Provenance and concrete failure

- Canonical preview begin returned `409 active_artifact_conflict` for a
  disposable Book while the account contained only unrelated Book operations
  using the canonical `main` source key.
- Original #29 closure commit
  `d9392d00b56633747adf98f901e4d2fd48aa0553` introduced account-wide
  `sourceKey` uniqueness in both `SourceUploadRtdbRepository` and the trusted
  Cloudflare capacity ledger.
- Later #50 commit
  `8aac13245bfcaefb06f2db5ec6de6f051e9ab28c` preserved the predicate while
  adding durable released rows. It exposed the latent defect; it did not create
  it.

## Repaired contract

- Initial source uniqueness is `(bookId, sourceKey)` in both #29-owned
  implementations.
- `reservationId`, `sourceVersionId`, and `providerObjectKey` remain
  account-global and immutable, including after release.
- Same-Book initial reuse remains denied after release. Replacement is the
  supported lineage path.
- Repository proof covers unrelated Books while the original operation is
  reserved, verified, cleanup-pending, and released.
- The trusted capacity-ledger proof mirrors Book scoping and account-global
  identity denial.
- Current healthy provider reconciliation remains mandatory before any new or
  replayed upload authorization.

## Verification

- Root harness: 7 files, 61 tests passed.
- Cloudflare harness: 4 files, 26 tests passed.
- Firebase Database emulator: 1 file, 2 tests passed; direct, cross-owner,
  stale, multi-location, and ancestor-shaped browser mutations were actually
  denied.
- Scoped ESLint: passed for all four changed source/test files.
- UTF-8 and `git diff --check`: passed.
- Cloudflare account routing: Wrangler 4.112.0, active profile `media`;
  sentinel bucket `kahoot-media` observed.
- Canonical Worker dry run: passed, 998.70 KiB / gzip 188.41 KiB. This is
  dry-run proof, not a deployed-state claim.
- Independent Standards review: PASS after cross-Book/post-release immutable-ID
  tests were added.
- Independent Spec/provenance review: PASS; no #49 browser/B2 or #50
  reconciliation ownership was moved.
- Broad repository TypeScript remains blocked only by pre-existing unrelated
  dirty Book Assembly/runtime diagnostics; focused harness compilation produced
  no #29-path diagnostics.

## Graph and ownership

- Contract-refresh graph:
  `artifacts/prd0062-graph-20260730-ticket29-contract-addendum.json`
- Graph hash:
  `40ae695e6f7e92538e3cf72c57a263538c8a60d5c7bb385628d02e5c964779e3`
- 112 issues, 52 open, 60 closed, 310 unique edges, zero missing references,
  duplicate edges, or cycles; topological coverage 112.
- #29 remains the single Foundation primary until closure.
- #49 remains dependency-ineligible until #29 closes and retains deployed
  browser/B2 acceptance.
- #50 retains reconciliation execution, exact cleanup, and capacity-release
  proof.

## Rollback

Disable new reservation creation and preserve all ledger, operation, and Source
Version identity rows for deterministic reconciliation. Do not delete or
rewrite historical rows to manufacture free capacity.
