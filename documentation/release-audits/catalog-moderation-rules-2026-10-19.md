# Catalog moderation rules: local audit, 2026-10-19

Baseline `ebcccd65`; branch `codex/catalog-moderation-rules-20261019`.
Rules correction prepared for separate review; no deployment or migration.

The Book service/types already use `private`, `public-library-pending-review`,
`public-library-published`, and `public-library-rejected`. Rules incorrectly
reduced those values to `private/public`. Authority: Permission Matrix and Rules
in `documentation/architecture/universal-material-summary-integration.md`,
`src/types/materialCatalog.types.ts`, and the current Book service.

The correction covers canonical Books, nine universal summary buckets, public
projections, three Book index buckets, and the readiness prerequisite. Generic
summary visibility stays `private/public`. Teacher public Book summary writes
check old/new producer/kind/family markers, including delete and ancestor writes.
All nine teacher summary grants also require an existing row to belong to the
actor; changing the proposed owner or forging canonical cleanup ownership
cannot transfer or delete another owner's row. Canonical Book teacher writes
reject existing published state as well as proposed published state. Named
approval/rejection/return-private APIs are admin-only; the generic transition
validator checks only the proposed state and was left unchanged in this bounded
rules correction.
Book index grants move from parents to ownership-checked rows. Projections are
admin-write-only. A closed `publicReview` validator accepts current service
payloads and prevents forged/erased admin decisions. Existing notification,
announcement, and reporting producers remain unchanged.

Verification uses canonical installed Vitest 3.2.4, worktree cwd and
`PDF_TEST_ROOT`, isolated `localhost:19000`, and ignored canonical `tmp/` configs
and logs. No dependencies were installed.

- `catalog-moderation-review-fixes-20261019.log`, using the existing
  `catalog-moderation-final-20261019.config.mjs`: **78/78 passed**: catalog 26,
  Activity 2, moderation 7, readiness 4, Book service 39. Actual service approval/rejection/
  return-private atomic updates pass; marker spoofing, review forgery/removal,
  index ancestor mutations, cross-owner summary takeover/deletion, published
  canonical demotion through direct/ancestor writes, and scoped reader
  restrictions are exercised. Fresh owner summary creation still succeeds.
  Readiness tests use edited full rules, omitting fragment overlays and
  redirecting their hardcoded port 9000 to isolated port 19000.
- `catalog-moderation-pbcf-preservation-20261019`: unchanged PBCF fragment
  emulator **14/14** and token **5/5** pass; writer **16/17** passes. Its existing
  assertion expects 13 paths, but today's writer emits 17 (four compound buckets).
- Experimental PBCF fragment-fixture execution against full rules yields the
  same **3 failures/11 passes** on untouched HEAD and candidate. The fixture lacks
  full summary membership and expects permissive composite mutation; adding
  membership alone does not adapt it. Full-rule PBCF acceptance remains unproven.
- Exact comparison preserves all **13** PBCF Book/index/summary authorization
  tails, source-set/revision validators, and Book-node rules. Readiness changes
  only the visibility literal. All **36** changed rule leaves are under
  `material_catalog`. `git diff --check` passes.

Independent final source review found no remaining must-fix issue within the
current service contract. Review-decision preservation covers the complete
service-generated decision containing `reviewedBy`; custom admin-created partial
decisions are outside that contract.

A read-only production rules GET at `2026-10-19T03:47:16.443Z` matched the baseline
rule tree, canonical SHA-256
`1fdd6321aad54e7a7bca84b51836601d5dacf8491587dca6274247bbc194a4cb`.
This confirms the mismatch is present in deployed configuration. It does not
demonstrate a production browser exploit or qualify this correction in production.

No browser or deployed correction proof. Private production-writer fixtures were not
copied into a second large harness, and no guards were weakened for old fixtures.
