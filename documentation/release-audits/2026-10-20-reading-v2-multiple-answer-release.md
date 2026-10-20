# Reading V2 multiple-answer release

Worker deployment is verified. Hosting deployment and live material behavior
remain pending.

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

Hosting must be qualified against the directly observed live source, currently
`091a1746c630658052978a0c75caa74c04318722`, through the guarded
`npm run deploy:hosting` route. A Worker-only PASS does not qualify Hosting.
Require a source-bound compatibility review, fresh remote/environment
fingerprints, and live Studio/student proof using disposable material.

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
