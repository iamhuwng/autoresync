# Stable clone and service release sources

Use `main` for new feature branches. The owner approved keeping exact deployed
service sources at separate release tags, rather than reverting newer Book
safety checks or deploying them incidentally. The machine-readable inventory
is [deployed-services.json](../release-audits/deployed-services.json); it records
the reviewed releases, not an automatically refreshed provider observation.

| Surface | Source tag | Source commit |
| --- | --- | --- |
| Hosting app | `stable-2026-10-20-reading-multiple-answer` | `1299617ed871cc0e4100f1c3b1c5b8346c295117` |
| Homework/backup Worker | `deployed-reading-v2-worker-2026-10-20` | `10786002eb459a1b54025a23590cda8a6f610112` |
| Notification command Worker | `deployed-notification-worker-2026-10-18` | `3b682ffa371fc549486d72c4d3125f3c8651a124` |
| Upload/Listening authoring Worker | `deployed-listening-assignment-worker-2026-10-24` | `487f02faaefbf5f2889dc66da636d0787cedc418` |
| RTDB rules | `deployed-rtdb-rules-2026-10-18` | `3b682ffa371fc549486d72c4d3125f3c8651a124` |

The Worker tag is published in the same Git repository. Preserve published
release tags; use a new tag for another release. The recorded provider version
is `bb4fc431-e84d-4b50-8c11-9f9c0ddecd4f`. Its exact deployed module SHA and
the complete normalized CI rebuild hash are in the inventory and
[release record](../release-audits/2026-10-20-reading-v2-multiple-answer-release.md).
Hosting and Worker deployments are separate; one Git revision is not proof that
every live service runs that revision.

The October 24 Upload/Listening Worker release fixes missing published-test
runtime records and lobby summaries and removes temporary audio-upload logs.
The follow-up adds the sanitized student delivery copy and readiness required
for homework assignment. Its provider version is
`c6bc690e-4636-4ea6-8098-35f5370cce9d`; the deployed
module matched the audited build byte-for-byte. The same Listening correction
is integrated into `main`, preserving its other qualified changes. The service
tag identifies the exact deployed source; it does not authorize deploying
other services or the whole current `main`. See the
[release record](../release-audits/2026-10-24-listening-publish-lobby.md).

The notification/rules tags pin the product source released after PR #157.
The newer main contains its assessment runner and reviewed deployment template;
follow [the correction packet](../release-audits/2026-10-18-homework-qa-correction-release.md)
for exact module/configuration hashes and the clean candidate procedure.
The notification version is `a184d75b-8823-485a-885d-e23354646f45`; RTDB rules
are identified by complete content hashes, not a fabricated provider version.
The approved replay and live student/teacher checks pass. These two tags do
not authorize deploying other services from their shared source revision.

## Reproduce the recorded Worker

From a clean ordinary clone, inspect status and select the release source:

```powershell
git status --short --branch
git fetch origin tag deployed-reading-v2-worker-2026-10-20
git switch --detach deployed-reading-v2-worker-2026-10-20
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

The October 20 Worker release corrected a Windows package-directory alias that
selected CommonJS exports. Use the locked exact ESM package entry files when
reusing dependencies outside the selected checkout; the complete normalized
output must equal standard clean Linux CI, SHA-256
`c3e30ff1b8e7ea0c7ee63363cd5ce32dd9a7b7d15da2d3b30008a0c311fccedf`.
Its exact deployed module SHA-256 is
`341d0bb25ffd992da94a9b67d086a8a1edce99a49ef4260b7c595d891e2fc4f8`.
Do not deploy the superseded `e7649ede…` artifact.

The final Reading V2 Hosting release is `be797fbc4160e904`; all 453 manifest
files and custom-domain HTML/critical Reading assets were independently checked.
Main contains the merged product and gate fixes at `b409b443`; use the Hosting
tag above for exact deployed source, since main retains newer service tooling
and Book safety work. Teacher fixture publication and student partial/full credit
passed; actual AI-generated import output and rollback remain outside that proof.

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

## Superseding configured-machine verification — October 18

At source `a3ebc041`, the stable checkout received its existing reviewed ignored
Worker secret file, and local Auth was recovered from validated saved identities.
The unchanged dev orchestrator started Vite and the local Book Worker. Fresh
teacher/student contexts entered the mandated `/login` routes on 5173/5174:
teacher materials and Create New Test loaded, and the student feed loaded 20
entries. This closes the earlier missing-secret/Auth startup proof gap on this
configured machine. It does not provision another machine or qualify every
workflow, PDF provider upload or the feature checkout's local rules as main's.
Dataset issues, the existing student styling warning and exact evidence are in
[the follow-up](../release-audits/2026-10-18-local-startup-and-pdf-readiness.md).
Continue cloning main for new work, with per-service tags for deployed artifacts.
