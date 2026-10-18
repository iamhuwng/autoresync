# Stable clone and service release sources

Use `main` for new feature branches. The owner approved keeping exact deployed
service sources at separate release tags, rather than reverting newer Book
safety checks or deploying them incidentally. The machine-readable inventory
is [deployed-services.json](../release-audits/deployed-services.json); it records
the reviewed releases, not an automatically refreshed provider observation.

| Surface | Source tag | Source commit |
| --- | --- | --- |
| Hosting app | `stable-2026-10-18-books` | `091a1746c630658052978a0c75caa74c04318722` |
| Homework/backup Worker | `deployed-homework-worker-2026-10-18` | `99bb3f073319c57f62b0889d7c0a98b054e06e95` |

The Worker tag is published in the same Git repository. Preserve published
release tags; use a new tag for another release. The recorded provider version
is `6aa7ac0f-7ccb-4c37-a20c-e6788bd6dd25`. Its exact deployed module SHA is in
the inventory and [release record](../release-audits/2026-10-18-homework-worker-release.md).
Hosting and Worker deployments are separate; one Git revision is not proof that
every live service runs that revision.

## Reproduce the recorded Worker

From a clean ordinary clone, inspect status and select the release source:

```powershell
git status --short --branch
git fetch origin tag deployed-homework-worker-2026-10-18
git switch --detach deployed-homework-worker-2026-10-18
git rev-parse HEAD
```

Require the exact recorded commit above. Provision the selected package's
lock-owned dependencies with approval, following [the tooling guide](local-tooling-layout.md).
Use Windows x64 Node for this package on Windows ARM64; CI uses Node 22 on
Linux. Do not install another dependency tree into a managed worktree.

```powershell
npm --prefix r2-backup-worker ci --no-audit --no-fund
node r2-backup-worker/node_modules/wrangler/bin/wrangler.js deploy --config r2-backup-worker/wrangler.toml --dry-run --outdir ../tmp/deployed-homework-rebuild
```

On Windows ARM64, invoke both npm and Wrangler through the existing x64 helper;
the historical tag's package scripts can still use the retired installing
harness, so use the declared local binaries above rather than those scripts.
This is a dry-run only. Deployment needs current provider/configuration proof
and separate authorization. The tag's source TOML is not the reviewed live
deployment JSON; do not turn the dry-run command into a release command.

The release-safety CI workflow installs from the pinned Worker lockfile and
compares the complete rebuilt code with the recorded normalized fingerprint.
Normalization covers dependency debug-path prefixes, the source-map comment
and line endings; it retains all function bodies. This is build reproducibility
proof, not historical Git provenance or deployment authorization. Exact live
module bytes remain the separate provider SHA in the inventory.

## Main and local startup boundaries

Main's backup Worker build includes newer Book source/recovery checks. Its
transitive differences are in `book-source-restore`, `sourceUpload.rtdbRepository`,
`sourceCapacity`, `sourceVersion`, `sourceRecovery` and associated types. These
checks bind safety decisions to checksum/version, require trusted page counts
and Assembly projections, and preserve retirement invariants. They are not
removed to manufacture parity. Building main does not reproduce the deployed
Worker; the pinned service tag does.

The clean-clone CI path also installs root dependencies, runs local isolation
and release checks, and builds the app in acceptance mode with disposable
Firebase/localhost configuration. It does not start emulators or exercise login.
Normal startup additionally requires the Cloudflare dependencies, the shared
machine environment/runtimes and this clone's ignored `.dev.vars`. See
[local startup](local-live-deployment.md) and the README installation steps.

The configured-machine audit found the clean stable clone missing `.dev.vars`.
The new startup guard rejects it before environment setup. Ordinary Firebase
startup now checks existing services without launching them, installing rules
or seeding accounts; the old setup runs only through explicit bootstrap.
The rich existing local dataset was preserved. Full startup
and authenticated browser verification are still pending that prerequisite;
an existing dependency tree is not fresh-install proof. No production service,
rules, data or provider object is changed by these source/setup checks.

At `7cf4e478`, GitHub run `39110521650` passed the clean root install, acceptance
app build and pinned Worker install/build/full-code hash comparison. A later
startup safety correction makes ordinary Firebase startup read-only; its
41 focused local checks pass. CI must pass again for that final source before
merging. No installed-machine startup/login result is inferred from a CI build.
