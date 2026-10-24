# Local development, provider-backed acceptance, and live deployment

This guide is the source of truth for running this repository locally and for
keeping local Firebase, the local Book Worker, real Backblaze storage, and live
deployment separate. Read it before changing local environment wiring, copying
Firebase data, running Book upload acceptance, or making deployment claims.

The most important fact is that **localhost is intentionally hybrid**:

- the web app, Firebase Auth/RTDB/Firestore, and Book control Worker run locally;
- Book PDF upload acceptance can still use the **real restricted Backblaze B2
  bucket/prefix**;
- the production Firebase project, production Hosting release, and deployed
  Worker configuration remain separate.

A local browser run is therefore not automatically offline and is not
production proof.

## 1. Sources of truth

When documentation and historical thread output disagree, use current source in
this order:

1. `scripts/local-dev.mjs` — browser-local Firebase and Worker endpoint
   overrides.
2. `scripts/local-firebase.mjs` — read-only startup checks and explicit emulator
   bootstrap, snapshot, rules-loading and dev-account-seeding operations.
3. `scripts/local-book-source-worker.mjs` — generated local Wrangler config,
   local Worker bindings, B2 bucket/prefix wiring, required local secrets, and
   Worker port/protocol.
4. `scripts/import-live-firebase.mjs` — explicitly one-way live-to-local data
   copying.
5. `scripts/deploy-live.mjs` — isolated production build/Hosting safeguards.
6. `scripts/tooling-where.mjs` and
   [local-tooling-layout.md](local-tooling-layout.md) — executable/runtime
   ownership, especially Windows ARM64 versus x64 Worker tooling.
7. Checked-in online preview/release configuration such as
   `cloudflare/wrangler.book-source.jsonc` — separate from generated local
   configuration. Its existing staging rollout and origins still require release
   qualification; do not treat it as a ready production configuration.

Do not copy endpoint, object-count, capacity, deployment-version, or credential
claims from old Codex logs. Re-read the current files and live runtime before
making a current-state claim.

## 2. Local topology

The normal local stack is:

| Surface | Local authority |
| --- | --- |
| Teacher web app | `http://localhost:5173` |
| Student web app | `http://localhost:5174` when that role is being verified |
| Firebase Auth | `localhost:9099` |
| Firebase Realtime Database | `localhost:9000`, namespace `demo-luyentap-local` |
| Firestore | `localhost:8080`, project `demo-luyentap-local` |
| Book control/submission Worker | `http://localhost:8787` |
| Book PDF object upload | direct HTTPS authority returned for the configured Backblaze B2 endpoint |

The local Worker is **HTTP**, not HTTPS. Historical logs that describe
`https://localhost:8787` are stale.

The local app has two deliberately different network destinations:

- **Control plane:** Book source/submission/status/reconciliation requests go to
  the local Worker at `http://localhost:8787`.
- **Provider data plane:** an authorized PDF upload goes directly to the
  configured Backblaze S3 origin over HTTPS.

Do not point `VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN` at the local Worker. Doing so
causes browser authority validation to fail even when the Worker reservation is
correct.

## 3. Fresh-thread startup

Use the canonical checkout for ordinary development.

First inspect the repository state and environment:

```powershell
git status --short --branch
npm run tooling:doctor
npm run env:check
```

If the shared development environment has never been created on this machine,
bootstrap it once:

```powershell
npm run env:bootstrap
```

The normal shared development environment lives outside the repository at:

```text
%USERPROFILE%\.luyentap\env\.env
```

Do not confuse it with the separately reviewed production file:

```text
%USERPROFILE%\.luyentap\env\.env.production
```

For every clone using normal `npm run dev`, supply the reviewed ignored local
Worker secret file and confirm it exists without printing its values. The
orchestrator always starts that Worker, including for non-Book browser work:

```powershell
Test-Path cloudflare\tmp\.dev.vars
```

Git does not carry this file, shared environment files, emulator snapshots or
machine runtimes. Install both root and Cloudflare package dependencies using
the lockfiles and approved tooling route before startup. On Windows ARM64 the
existing Java helper also needs WSL Java plus its exact cached RTDB/Firestore
JARs; Auth uses the installed Firebase CLI. Another checkout's successful run
does not provision a fresh machine.

The orchestrator checks the Worker secret file before Firebase validation. The
local Worker script validates the keys it actually needs. Do not echo,
paste, commit, or log secret values merely to prove that they exist.

Start the normal local stack with:

```powershell
npm run dev -- 5173
```

This command is the supported local entry point. The selected Vite origin is
also passed into the generated local Worker configuration, so changing from
5173 to another supported local port does not require hand-editing Wrangler
CORS settings.

This command:

1. verifies that the ignored local Worker secret file is readable;
2. verifies the shared development environment;
3. checks that existing local Firebase emulators have the expected identity;
4. starts Vite with local Firebase/Worker overrides;
5. generates the ignored local Wrangler files under `cloudflare/tmp/`;
6. starts the local Book Worker on port `8787`.

Normal `firebase:local` / `npm run dev` does not start emulators, import data,
install rules or seed accounts. Missing services fail the check. On a new,
disposable local dataset only, explicit `npm run firebase:bootstrap-local`
requires all emulators stopped and no registered dataset, then starts an empty
stack, installs local RTDB rules, seeds dev accounts and registers a generation.
For an existing rich dataset, use its owning checkout's recovery/checkpoint
workflow instead; never bootstrap a fresh clone against it. Java emulator and
checkpoint ownership is machine-wide even though snapshots are per checkout.

The configured-machine clone check on October 18 found existing shared DB and
Firestore listeners, but no Auth or app/Worker listener. The clean clone lacked
`.dev.vars`; startup was therefore not exercised against that existing dataset.
The missing-file guard was verified with a disposable script fixture that
proves no environment/Firebase setup runs first. Recovery tests separately check
writer exclusion, protected inventory and failed publication preserving the
selected generation. These are prerequisite proofs, not a signed-in browser pass.

Superseding October 18 check: after supplying the existing reviewed ignored
secret file and restoring validated local Auth identities, the stable checkout
passed teacher login/materials/Create New Test and student login/activity-feed
checks through the normal orchestrator on the required role ports. The
[follow-up record](../release-audits/2026-10-18-local-startup-and-pdf-readiness.md)
separates this configured-machine proof from fresh-machine provisioning, local
dataset issues and still-unqualified PDF provider workflows.

Do **not** start direct Vite through `tooling:where` for normal browser
development. Direct Vite does not own the local Firebase/Worker bootstrap and
was a source of false environment failures during PRD0063 acceptance.

The Worker port is fixed at `8787`, so normally run **one orchestrated
`npm run dev` process at a time**. `npm run worker:local` exists for focused
Worker diagnosis when Firebase is already available; it is not a replacement
for the full browser-development orchestrator.

For a student-role browser pass, stop the teacher Vite/Worker owner and restart
the orchestrated stack on port `5174`:

```powershell
npm run dev -- 5174
```

The Firebase emulators are detached and can remain available between those
role-specific Vite runs. Use the mandated role URL and `/login` entry point.

## 4. Local Firebase lifecycle

Local Firebase always uses project/namespace:

```text
demo-luyentap-local
```

Never use `temp-a1437` as the localhost project.

Useful commands:

```powershell
npm run firebase:local
npm run firebase:check-local
npm run firebase:bootstrap-local
npm run firebase:restore-local
npm run firebase:adopt-local -- <verified-export-directory>
npm run firebase:watch-local
npm run firebase:seed-local
npm run firebase:save-local
```

### Read-only startup and explicit bootstrap

`npm run firebase:local` verifies emulator identity, the registered dataset's
protected records, and a successful checkpoint from the last three minutes.
It changes no data or rules. `npm run dev` performs this same read-only check.
Previously recorded product issues are reported as degraded readiness; new
issues fail startup. `firebase:check-local` rejects all readiness issues.

Explicit `npm run firebase:bootstrap-local` requires all emulators stopped and
no dataset registered in this checkout. It starts empty emulators, loads local
RTDB rules, seeds dev accounts, and registers an initial three-store generation.
An empty Firestore export is accepted only for this explicit fresh-dataset path;
adoption of an existing export still requires populated protected inventory.

A generation is a **boot-time import**, not a continuously mounted database.
Use `firebase:restore-local` with all emulators stopped to restore the selected
validated generation. It refuses a running or partial stack. To preserve an
existing rich export in a new checkout, explicitly run `firebase:adopt-local --
<verified-export-directory>` first; adoption refuses an already registered
dataset. The export source and earlier generation files remain unchanged.

Do not run bootstrap or seed as an automatic prerequisite for opening a clone.

### Persistent local snapshot

The disposable but persistent local emulator snapshot is stored under:

```text
tmp/local-firebase-recovery/
```

`npm run firebase:save-local` exports Auth, RTDB and Firestore under one writer
lock, verifies protected inventory and export consistency, then atomically
selects the completed generation. Failure preserves the previous selection.
Protected initial/adopted generations and the latest three automatic generations
are retained. Hashes detect export corruption; removed identities/documents,
changed protected bindings and stale revisions reject checkpoint publication.
Unsupported Firestore export value types fail closed rather than being converted
to null. Authorized removal of protected fixture data requires a separately
reviewed checkpoint transition; ordinary saves never waive preservation.

Run `npm run firebase:watch-local` in a separate terminal for one checkpoint per
minute. On Windows, `powershell -NoProfile -ExecutionPolicy Bypass -File
scripts/start-local-checkpoint.ps1` explicitly registers/starts the independent
checkpoint task. Its `-Stop` option stops only a task owned by this checkout;
registration also refuses a task owned by another checkout. Task ownership is
machine-wide. Do not transfer it merely to open another clone.

This snapshot is **local development data**, not a migration and not a release
artifact. Preserve it when it contains useful acceptance state; recreate it
intentionally when exact clean-state testing is required. Do not delete a rich
snapshot merely because an already-running emulator appears empty.

### Dev accounts

Explicit bootstrap or `firebase:seed-local` seeds the teacher/student accounts.
Browser verification should use the quick-login controls on `/login`, not
manually copied credentials. If quick login fails, verify emulator health before
assuming the account is invalid:

```powershell
npm run firebase:check-local
```

`firebase:check-local` checks registered inventory, persistence freshness and
known cross-store readiness conditions. It is not browser acceptance proof or
a transaction across three independently changing stores. Checkpointing retries
after concurrent writes; quiesce writers before a deliberate data transition.

The explicit seeder deliberately reconciles Auth identities with matching local
RTDB user profiles so a live-data copy can keep useful profile UIDs while Auth
remains local. A local database may therefore contain many copied live user
profiles while only the disposable seeded local Auth accounts can sign in. Do
not interpret copied `/users` rows as copied live credentials.

## 5. Copying live Firebase data into localhost

The supported copy is explicitly **one way**:

```text
temp-a1437  ->  demo-luyentap-local
```

Run:

```powershell
npm run firebase:sync-live
```

Before doing so:

- the local emulators must already be running;
- Firebase CLI authentication must be valid;
- `gcloud` authentication must be valid;
- read [infrastructure.md](../rules/infrastructure.md) before making remote-state
  claims.

The sync command:

- reads the live RTDB and replaces the **local** RTDB root;
- reads live Firestore documents and writes them into the **local** Firestore;
- never copies live Auth accounts;
- reseeds the local quick-login Auth accounts afterward;
- saves the resulting localhost snapshot.

Important Firestore caveat: the importer updates documents that exist in live
data but does not delete unrelated extra local documents. If exact Firestore
mirror semantics matter, recreate the disposable local Firestore state first;
do not call a non-exact copy an exact mirror.

This command is not a deployment path. There is no supported local-to-live
database promotion.

## 6. Local Book Worker and secret boundary

The local Book Worker is generated by `scripts/local-book-source-worker.mjs`.
Generated files live under ignored `cloudflare/tmp/`; they are not production
configuration and must never be deployed.

The local secret file is:

```text
cloudflare/tmp/.dev.vars
```

The current Worker script is the authority for which secret names are required.
They include Firebase/trusted-service credentials and restricted Backblaze
credentials. Inspect **names only** when diagnosing missing configuration.

For Backblaze:

- use the configured private `bookpdf` bucket and the exact current
  `book-source/`-scoped prefix from the local Worker script;
- never use a Backblaze master key;
- keep permissions/prefix restrictions bounded;
- never print key IDs and secrets together in logs or chat;
- local acceptance may deliberately reuse a restricted credential across some
  provider roles, but production still requires the reviewed role separation
  and exact capability bundles.

The local Worker accepts only `demo-luyentap-local` emulator identity. A local
browser should never need a deployed production Worker for Book creation.

## 7. The hybrid Backblaze capacity invariant

This was the most important localhost/provider lesson from the PRD0063
evaluation.

The Firebase emulator contains the Book source capacity/account ledger at the
local `book_b2_primary` account. Backblaze contains the actual provider
objects. Those are separate authorities. Provider-backed localhost acceptance
is a deliberate remote storage mutation inside the approved restricted B2
scope; use disposable test Books/artifacts and do not assume Firebase isolation
also isolates Backblaze. Stopping Vite, the local Worker, or Firebase does not
by itself delete provider objects; rely only on the reviewed Book cleanup /
reconciliation lifecycle for remote cleanup.

A Book upload reservation can therefore fail even when all services are
running, if the local account's provider-reconciliation snapshot is absent,
stale, or inconsistent with the actual configured Backblaze prefix.

The invariant is:

> Before provider-backed Book upload acceptance, the local capacity ledger must
> contain a current healthy reconciliation derived from the real configured B2
> prefix. Never invent provider totals.

Historical measured object counts/byte totals are evidence from that moment
only. Never hardcode them into a new run.

When the browser reports an account/capacity availability failure:

1. Verify `npm run firebase:check-local`.
2. Inspect the current **local** RTDB account state for
   `book_source_upload_accounts/book_b2_primary`; do not inspect or patch the
   live database.
3. Check whether its `capacity.providerReconciliation` exists, is healthy, and
   is current.
4. Measure the actual configured Backblaze prefix using the canonical provider
   reconciliation/read-account-totals implementation, not an estimated count.
   Relevant implementation lives under:
   - `cloudflare/src/book-source-worker/provider-reconciliation.ts`
   - `cloudflare/src/book-source-worker/backblaze-b2-source-provider.ts`
   - `cloudflare/src/book-source-worker/capacity-probe-*.ts`
5. Record the measured reconciliation through the normal local repository /
   reconciliation authority. If a bounded diagnostic is required, mutate only
   the emulator and preserve the provider evidence.
6. Retry the same saved authoring/submission operation after the local capacity
   state is healthy.

At present there is no simple `npm` shortcut that should be assumed to refresh
this provider reconciliation. A new agent must not compensate by writing
fictional zeros, copying stale live values, disabling the guard, or weakening
production capacity logic.

## 8. Book-upload troubleshooting by failure class

Diagnose environment/authority failures before editing product behavior.

| Symptom | First place to look | Do not do |
| --- | --- | --- |
| App throws `[Firebase] Use npm run dev for local development...` | A direct/unisolated Vite process was started; stop it and use `npm run dev -- <port>` | Do not diagnose this as missing Firebase data or copy local env vars into a direct Vite command |
| Vite works but Book Worker requests fail / port `8787` absent | Start through `npm run dev`; inspect local Worker process/config | Do not point localhost at the deployed Worker |
| Dev quick login reports network failure | `npm run firebase:check-local`, then restart the orchestrated stack | Do not recreate accounts first |
| Quick login works but copied application/user data appears absent | Check the registered `tmp/local-firebase-recovery` generation and runtime provenance; explicitly restore with all local emulators stopped | Do not rerun live sync or delete the saved generation before checking runtime provenance |
| trusted upload OAuth/exchange failure | required Firebase/trusted-service entries in `cloudflare/tmp/.dev.vars`, local service identity/project wiring | Do not rotate B2 credentials for a Firebase exchange error |
| source upload account state unavailable / provider drift | local `book_b2_primary` ledger and fresh provider reconciliation | Do not change product validation or invent capacity totals |
| upload reservation succeeds but browser says invalid authority | ensure control origin is local Worker while `VITE_BOOK_SOURCE_B2_UPLOAD_ORIGIN` is the configured Backblaze HTTPS origin | Do not send provider PUTs to port `8787` |
| retry authority denied | active submission identity + exact final Book binding; inspect current reservation/retry contract | Do not manufacture a source-ledger operation ID that is not persisted |
| Cloudflare/Worker test emits native/workerd loader warnings | run through `npm run tooling:where -- ...`; inspect exit status and actual failed assertion | Do not install a global Wrangler or diagnose product code first |

For Worker/runtime failures also read Rule 16 and Rule 17 in
[infrastructure.md](../rules/infrastructure.md).

## 9. Tool/runtime boundary on Windows ARM64

Before installing or replacing any dependency:

```powershell
npm run tooling:doctor
npm run tooling:where -- cloudflare-wrangler
npm run tooling:where -- cloudflare-vitest
```

On Windows ARM64 the repository routes Cloudflare Wrangler/Vitest through the
shared Windows x64 Node helper. Use that resolver. Do not run global Wrangler,
do not copy a new dependency tree into a worktree, and do not treat WSL as the
dependency authority.

`tooling:doctor` may report cleanup candidates as warnings. A warning is not a
missing required runtime; do not turn ordinary feature work into dependency or
disk cleanup unless the task actually needs it.

See [local-tooling-layout.md](local-tooling-layout.md) for the complete
ownership rules.

## 10. What local acceptance proves

Keep these proof levels separate:

1. **Unit/service tests** prove the tested code contract.
2. **Worker tests** prove the tested Worker composition/runtime surface.
3. **Firebase emulator tests** prove local rules/data behavior.
4. **Browser localhost acceptance** proves the user flow against the local
   stack.
5. **Provider-backed localhost acceptance** additionally proves the configured
   real B2 interaction used in that run.
6. **Live/deployed proof** requires current production Firebase/Hosting/Worker/
   provider evidence.

A provider-backed localhost pass still does not prove the deployed Worker or
production database state.

## 11. Production environment and Hosting deployment

Production uses Firebase project:

```text
temp-a1437
```

and Hosting target:

```text
kahut1
```

The production Vite environment must be separately reviewed and stored at:

```text
%USERPROFILE%\.luyentap\env\.env.production
```

or supplied through `LUYENTAP_PRODUCTION_ENV_FILE`.

Do not copy the shared local/dev `.env` into this file.

For a checked production build without remote mutation:

```powershell
npm run build:production
```

For an authorized Hosting release:

```powershell
npm run deploy:hosting
```

The deploy script:

- isolates the production environment from parent `VITE_*` and emulator vars;
- requires the exact production Firebase identity;
- rejects localhost/demo values;
- checks the Hosting target;
- scans the built bundle for local endpoints;
- requires a clean Git working tree for deployment;
- deploys **Hosting only**.

Hosting deployment does not promote emulator data, deploy RTDB/Firestore data,
or deploy the Book Worker.

Any live data/rules change needs its own reviewed migration/release path.
Any Cloudflare Worker release is also a separate operation and must follow the
current Worker configuration and infrastructure rules.

## 12. Fresh-agent checklist

A new thread working on local Book flows should establish these facts before
changing code:

- [ ] It is in the canonical checkout and has inspected `git status`.
- [ ] It has read `AGENTS.md`, this guide, and the relevant infrastructure
      rules.
- [ ] `npm run tooling:doctor` is healthy.
- [ ] `npm run env:check` identifies the expected shared development env.
- [ ] The local Firebase namespace is exactly `demo-luyentap-local`.
- [ ] If copied application data is expected, the running emulator state is
      known to have loaded the intended registered recovery generation; an
      already-running empty emulator has not merely been reused.
- [ ] Browser development is started through `npm run dev -- <role-port>`, not
      direct Vite.
- [ ] The local Worker is `http://localhost:8787`.
- [ ] Worker control requests and direct Backblaze upload origin are not
      confused.
- [ ] `cloudflare/tmp/.dev.vars` exists and no secret value has been printed.
- [ ] Any provider-backed upload run has a current local
      `book_b2_primary` reconciliation derived from actual B2 state.
- [ ] Local failures are classified as app, emulator, Worker/toolchain,
      credential/authority, provider, or stale-capacity failures before code is
      edited.
- [ ] Production claims are not inferred from localhost evidence.
- [ ] No production deploy/data mutation is performed without explicit
      authorization and the corresponding live-state checks.
