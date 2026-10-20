# Reading V2 multiple-answer release

Worker and Hosting deployments are verified. Live teacher publication, student
partial/full credit and the final badge presentation passed within the scope
below. The exact disposable QA records were removed and independently read back.

The product fix preserves one prompt covering slots 25–26, one choose-two
interaction, and two order-independent one-mark answers. PR #161 merged to
main as `6b0285fcd5a0c25ad1262563904455075a70ce98`.

## Isolated trusted-submit Worker

- Source: `10786002eb459a1b54025a23590cda8a6f610112`.
- Tree: `fa589d21617ce5b277b2c778c2031253c7dc3037`.
- Reviewed deployed-source base: `99bb3f073319c57f62b0889d7c0a98b054e06e95`.
- Sole prebuilt module: `index.js`, SHA-256
  `341d0bb25ffd992da94a9b67d086a8a1edce99a49ef4260b7c595d891e2fc4f8`.
- Deployment JSON SHA-256:
  `d2570c96dcbc8ef084253b143ae80cdc216a0c95a982d9db0cdf6bd7766b0b92`.
- Original recovery Worker version: `6aa7ac0f-7ccb-4c37-a20c-e6788bd6dd25`.
- Original recovery module SHA-256:
  `6e4bb95e53191b1a32e361e044765c4d6da7d39764d0e904abcf8ddd82e4f7ed`.

Only four source files differ from the deployed-source base: shared scoring,
Reading V2 types, trusted submit core, and its regression test. Their bytes
match the corresponding product fix on main. No Firebase Functions or rules
deployment is needed. Worker route, authentication and assignment ownership
checks remain the existing production contract.

Use the fixed `--observe-reading-v2-worker` route in `scripts/release-check.mjs`
with `--worker-phase predeploy` immediately before deploying, then
`--worker-phase postdeploy`. Both require the exact clean source/base above,
`--worker-bundle` pointing to the pinned module, and `--worker-config` pointing
to the pinned deployment JSON. The observer performs native provider GETs;
caller assertions cannot mint a trusted observation. The postdeploy phase
requires a new active version at 100%, exact candidate bytes and unchanged
bindings, runtime, schedule and routes. It explicitly checks the release
message `Reading V2 multiple-answer slots; isolated reviewed bundle`.

The predeploy assessment returned PASS on October 20. Generated evidence is
under the Worker candidate's ignored `tmp/release-receipts/`. Artifacts and
temporary test configs are under the canonical checkout's ignored `tmp/`.
Retain exact artifact/config bytes until the release is independently verified.

The candidate passed the explicit trusted-core regression (10 tests), full
isolated backup Worker suite (92 tests), and a nondeploying Wrangler 4.103.0
`--no-bundle --keep-vars --dry-run`. The ordinary backup Vitest configuration
at this historical source does not discover the core test; its separate
temporary configuration is required. Windows execution uses the repository's
declared x64 Node helper and canonical locked Worker dependencies.

Rollback is prepared using the previous Worker version above, but has not
been rehearsed and cannot undo data writes. Historical deployed Git provenance
is unknown; current provider module bytes and configuration are directly read.

## Hosting and content

The initial Hosting candidate was qualified against directly observed source
`091a1746c630658052978a0c75caa74c04318722`, through the guarded
`npm run deploy:hosting` route. The final successor was qualified against the
intermediate deployed `5671d39a` source, with an exact source-bound compatibility
and historical hotfix successor review. Final evidence follows below.

Existing assigned snapshots remain immutable. A repaired editable revision
must publish a new snapshot; changing a pinned attempt's interaction IDs would
invalidate its answer bindings. No existing production content has been
republished or regraded by this preparation record.

## Review corrections and deployed Worker

The requested follow-up review found missing single-record teacher-key
aggregation, manual scaffolding, generation instructions and existing-content
revision handling. Commit `fdf3e85f` corrects these routes and adds a chained
import/save/publish/projection/trusted-submit regression. Selected-passage
creation/editing now atomically creates private repaired copies and references
their new versions; original source records and pinned attempts are preserved.
First standalone publication omits nonexistent opposite-visibility cleanup
writes, which cannot prove ownership under the deployed rules before a
material exists.

All 374 tests in 20 affected suites passed, plus targeted lint, assessment
guardrails, UTF-8 and whitespace checks. The guarded production build-only
route passed Vite, bundle budget and local-endpoint scans. The 112 release
and deployment tests passed. Provider prompt tests capture the actual outbound
prompt with a mocked response; actual generated Gemini content is not proved
by those tests.

After fresh native predeploy PASS, Wrangler deployed the pinned artifact with
`--no-bundle --keep-vars` and the recorded Reading V2 message. New active
version `ee60656a-44dd-48b7-82c6-3384fe189bb7` initially received 100% of traffic.
Its native postdeploy observation returned PASS with exact candidate module bytes
and unchanged effective bindings, settings, schedule and routes. The generated
receipt is `tmp/release-receipts/reading-v2-worker-postdeploy-20261020.json`
under the isolated Worker source checkout. Tag
`deployed-reading-v2-worker-2026-10-20` pins that source.

The deployed-service inventory now records this version. Rebuild comparison
normalizes only the known dependency-owner path prefix in addition to the
existing source-map/line-ending normalization; complete remaining code is
hashed. The artifact's exact byte hash is independently pinned above.

## Standard-build artifact correction

Fresh Linux CI exposed that package-directory aliases in the first Windows
build selected CommonJS entry files for aws4fetch and fflate. That artifact
`e7649ede…` was therefore held from Hosting promotion and superseded. The
corrected build uses the locked packages' exact ESM export files. Its complete
normalized output equals the downloaded fresh-runner CI build: 407,879 bytes,
SHA-256 `c3e30ff1b8e7ea0c7ee63363cd5ce32dd9a7b7d15da2d3b30008a0c311fccedf`.
No code region is omitted from comparison.

Corrected exact artifact SHA-256 is `341d0bb2…` as recorded above; configuration
and source pins are unchanged. Independent review rehashed both builds and
confirmed equality. After a fresh predeploy PASS against the intermediate
`ee60656a` version, Wrangler deployed the corrected artifact as
`bb4fc431-e84d-4b50-8c11-9f9c0ddecd4f`. Corrected operational artifacts are in
the canonical `tmp/reading-v2-worker-artifact-esm-10786002/` directory. The
source tag remains immutable because both builds use the same source commit.
Fresh native postdeploy verification returned PASS for the corrected version:
100% traffic, exact `341d0bb2…` bytes and unchanged bindings, settings, schedule
and routing. Receipt:
`tmp/release-receipts/reading-v2-worker-esm-postdeploy-20261020.json` under the
isolated Worker source checkout.

## Final Hosting release and live acceptance

| Release identity | Verified value |
| --- | --- |
| Hosting source | `1299617ed871cc0e4100f1c3b1c5b8346c295117` |
| Source tree | `36109b89da22e9135fefecf087d6646871c791e9` |
| Immutable source tag | `stable-2026-10-20-reading-multiple-answer` |
| Finalized Hosting version | `be797fbc4160e904` |
| Released UTC | `2026-10-20T14:45:21.100Z` |
| Production environment SHA-256 | `8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57` |
| Manifest SHA-256 | `f3cd967b2a4c5e70cfe646061792d3e1b3b2c46c51ebe78ffe9d5b92131210e2` |
| Previous Hosting / recovery target | `019f8d563a345f76`, source `5671d39a` |

The normal guarded deployment route passed clean-source, source/environment/
remote fingerprints, compatibility, production build and bundle-budget checks.
All 453 manifest-listed files were independently fetched and hashed after the
final deployment. The custom domain `hocthem.net` served identical manifest
bytes, root/index HTML and the five critical Reading V2 runtime, Studio,
review, submission and feature-flag JavaScript assets. Native Firebase channel
readback confirmed the same finalized version and configuration before and
after the content observation. Firebase omitted optional provider file counts;
the existing metadata helper rejects that response, so separate native CLI
finalization evidence was retained without changing the parser or release gate.

The user-requested final presentation removes the repeated per-prompt badge
for a shared multiple-answer interaction. A fresh custom-domain runtime visit
retained the group range/instructions, one prompt and five checkboxes, with
zero per-prompt badge nodes. Evidence: `outputs/reading-v2-live-badge-removed.jpg`.
The 63-test runtime suite passed. PR #164 merged the badge change; PR #165
merged the release gate correction, with all CI checks passing. Product and
guard changes are on main at `b409b443`; the service tag identifies the exact
isolated deployed Hosting source, including its historical tooling baseline.

Live teacher Paste Text import parsed, accepted, saved, validated, published
and reopened disposable public passage `studio-material-mvgrlcsv`, snapshot
`snapshot-studio-material-mvgrlcsv-mvgrlu9g`. One shared prompt, selection limit
two and answer key B/C survived. Student D then B submission returned trusted
1/2; saved review showed D/B versus B/C (result
`reading-v2-result-1e55cac1-24fd-4810-9799-e872ae13f536`). A second student
submission selected C then B and returned trusted 2/2, proving reversed-order
full credit. These submits ran on the initial deployed multi-answer source;
the final badge-only runtime was visually verified after a fresh reload and
exited without a third submission.

The gate correction accepts intentional successor changes only through a fresh
review bound to source, base and observed Hosting fingerprint, naming the exact
historical hotfix revision, sorted differing paths and rationale. Unknown,
duplicate, incomplete, stale and future-dated reviews fail closed; manifest
hotfix obligations remain intact. The final feature release-check suite passed
41 tests; the isolated historical Hosting candidate passed 38. The broader
release/deployment/Worker suite passed 127 before the final timestamp hardening;
the affected checker suite was rerun afterward. No old baseline or manifest
hotfix entry was removed to release the badge change.

Ignored evidence in canonical `tmp/` includes
`reading-v2-hosting-badge-deployed-proof-20261020.json`,
`reading-v2-hosting-deployed-proof-20261020.json`,
`reading-v2-hosting-badge-compatibility-review.json` and both guarded deploy logs.
The qualified Hosting and Worker receipts were preserved in canonical
`tmp/reading-v2-release-evidence-20261020/hosting/` and `worker/` before any
worktree removal. They include
`reading-v2-hosting-badge-final-qualified-20261020.json` and
`reading-v2-worker-current-20261020-1405.json`. Worktree cleanup is a separate
operation; this record does not claim it has completed.

Actual Auto V4/Gemini generated content remains unverified: provider tests
capture the outbound instructions with mocked responses. Live acceptance proves
the Paste Text fixture and the described publication/runtime/scoring paths,
not every imported document or existing legacy source. Historical published
snapshots and assignments were not rewritten. Rollback has not been rehearsed
and cannot reverse content/result writes.

## Disposable QA cleanup

The authorized cleanup completed successfully: all 47 planned fixture/result/
index paths read back null, the shallow attempt-key set remained exactly the
same 34 keys before and after, and both exact QA draft IDs read back null.
Canonical `tmp/reading-v2-qa-cleanup-summary-20261020.json`, the exact plan,
readback and applied log retain the scope and deletion proof. Operational report
events and analytics telemetry remain: no result/attempt lookup index exists for
those events, and emitted Google Analytics events are not reversible.

Fresh Academic Record navigation showed the 114 original tests with no QA
cards. The existing manual progressive-feedback refresh completed using those
remaining results at `2026-10-20T15:25:37Z`. Its normal 24-hour manual-refresh
cooldown now applies to the test account. This is a derived feedback refresh,
not restoration of the prior feedback bytes. Screenshot:
`outputs/reading-v2-live-cleanup.jpg`.
