# Reading V2 multiple-answer release

Preparation record. Deployment and live behavior are not yet verified.

The product fix preserves one prompt covering slots 25–26, one choose-two
interaction, and two order-independent one-mark answers. PR #161 merged to
main as `6b0285fcd5a0c25ad1262563904455075a70ce98`.

## Isolated trusted-submit Worker

- Source: `10786002eb459a1b54025a23590cda8a6f610112`.
- Tree: `fa589d21617ce5b277b2c778c2031253c7dc3037`.
- Reviewed deployed-source base: `99bb3f073319c57f62b0889d7c0a98b054e06e95`.
- Sole prebuilt module: `index.js`, SHA-256
  `e7649edece98e3935adf49227dffc3ca019a4cda276578de4f51a45d5c3aec66`.
- Deployment JSON SHA-256:
  `d2570c96dcbc8ef084253b143ae80cdc216a0c95a982d9db0cdf6bd7766b0b92`.
- Current/recovery Worker version: `6aa7ac0f-7ccb-4c37-a20c-e6788bd6dd25`.
- Current module SHA-256:
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
