# Release safety workflow

`npm run release:check` is the shared, read-only assessment for normal releases and isolated hotfixes. It never invokes Firebase, Wrangler, Backblaze, or deployment commands. Every assessment requires an explicit `--base`; a Git branch or `HEAD^` is not production truth.

Future autonomous agents should load the model-invoked repository Skill at
`.agents/skills/release-safety/SKILL.md`. It supplies the short operating
recipe; this document and the executable scripts remain the authority.

Assess an explicitly selected revision from a clean checkout:

```powershell
node scripts/release-check.mjs --mode release --cwd . --base <review-base> --observe-hosting --env-fingerprint <production-env-sha256> --json --receipt tmp/release-receipts/release-assessment.json
```

For a production correction, create an isolated worktree from the verified deployed source or another explicitly reviewed revision, apply only the fix, then run:

```powershell
node scripts/hotfix-prepare.mjs --source <verified-source-revision> --destination ..\luyentap-hotfix
Set-Location ..\luyentap-hotfix
node <release-safety-tool-checkout>\scripts\release-check.mjs --cwd . --mode hotfix --base <verified-source-revision> --observe-hosting --json --receipt tmp/release-receipts/hotfix-assessment.json
```

For application-code changes, add `--compatibility-review path\to\review.json`. The review must be fresh and bind the exact candidate revision, reviewed base, observed production fingerprint, reviewer, scope, and `decision: "verified"`. It records technical review only; deployment authorization remains separate.

The checker reports `PASS`, `NOT_APPLICABLE`, `REVIEW_REQUIRED`, `UNVERIFIED`, or `BLOCKED`. `--observe-hosting` reads the fixed production Hosting manifest at `https://kahut1.web.app/.well-known/luyentap-release.json` and verifies the listed content hashes and source identity. Static Hosting-only changes can pass from that evidence; application-code changes require explicit compatibility review because unchanged backend files do not prove runtime compatibility. Historical deployments without that manifest remain `UNVERIFIED`.

For a site that predates the manifest, use a controlled bootstrap: from a clean checkout, run `npm run build:production -- --build-only`, inspect the generated local manifest and compatibility review, obtain separate deployment authorization, and have the authorized operator perform the first Hosting deployment with the existing reviewed Firebase CLI route. The build-only path performs the same clean-source, production-environment, and bundle checks as the deployment route, binds the manifest to the checked-out revision/tree, and never mutates a remote service. `deploy-live.mjs` intentionally cannot perform this first bootstrap because it has no observed production baseline yet. After the manifest is live, use the guarded `deploy:hosting` route for subsequent releases. The checker never treats the local manifest as deployed evidence.

When the manifest is absent, a fresh agent can still collect authoritative
Hosting release metadata without a write:

```powershell
node scripts/release-check.mjs --mode release --base <review-base> --observe-hosting-provider --env-fingerprint <production-env-sha256> --json --receipt tmp/release-receipts/provider-baseline.json
```

This uses the repository Firebase CLI to read the finalized `kahut1` live
channel, version ID, release time, file count, and effective headers/rewrites.
Because Firebase does not expose the deployed Git revision or content tree in
that response, the result remains `UNVERIFIED` for source binding and cannot
clear the production deployment gate. It is useful baseline evidence, not a
substitute for the one-time manifest bootstrap.

A JSON file passed with `--baseline` is recorded as caller-supplied assertion and cannot establish deployment readiness by itself. Receipts are generated only below `tmp/release-receipts/`. Re-run it after any source, configuration, environment, or baseline change.

The checker identifies Hosting, Firebase rules/indexes, Worker, backup Worker, Backblaze, migrations, and tooling impact from a small maintained path map. It reports required actions, deployment ordering, and recovery limitations in the receipt. It deliberately reports cross-service changes for review instead of claiming runtime compatibility. It also flags the current Worker rollout expiry, local allowed origin, staging environment, and preview Backblaze prefix when those configuration files are in scope.

A `BLOCKED` or `UNVERIFIED` result gates deployment preparation. Deployment still uses the existing reviewed `npm run build:production` and `npm run deploy:hosting` routes only after separate authorization and fresh verification. No command in this workflow imports emulator data, changes live Firebase, mutates Backblaze, changes Worker bindings, or pushes branches.

The bootstrap boundary was regression-tested on 2026-10-11: a disposable
untracked source file in the isolated checkout caused
`npm run build:production -- --build-only` to fail before Vite ran, and the
test removed only that exact file afterward. A clean build-only run remains
non-mutating. This keeps the bootstrap useful for a pre-manifest site without
allowing a locally assembled dirty artifact to be mistaken for the reviewed
revision/tree.

`deploy-live.mjs` writes the same source/tree/file-hash manifest into each production build before Hosting deployment. The mutating Hosting route additionally requires `LUYENTAP_RELEASE_BASELINE_FILE`, `LUYENTAP_RELEASE_BASELINE_SHA256`, `LUYENTAP_RELEASE_BASE`, `LUYENTAP_RELEASE_FINGERPRINT`, and `LUYENTAP_RELEASE_ENV_FINGERPRINT`. Hotfix assessments carry a computed reconciliation obligation into the next manifest; later assessments compare the complete hotfix delta against the candidate. These values bind a technical preflight to its inputs; they are not human authorization. A separate authorized operator decision is still required, and the baseline file must contain no credentials.

## Acceptance rehearsal

On 2026-10-11, the isolated release-safety branch built the actual application
with explicit `demo-luyentap-local`/localhost configuration, generated a
446-file manifest, and deployed it to the temporary Hosting channel
`acceptance-app-20261011`. The preview returned HTTP 200 for both the real
application and its manifest, and the manifest matched the candidate revision
and tree. The application rendered its real sign-in screen. The channel was
deleted after verification; the permanent `live` channel was the only channel
left in readback.

The preview manifest is marked `environment: acceptance`. Production
observation requires `environment: production`, so an acceptance deployment
cannot become a production baseline. Backend writes were not exercised: the
preview used local/mock Firebase configuration and no disposable backend
service was available at the public preview origin. The production build also
requires the reviewed machine-local `.env.production` file and the approved
compatible native build tooling. The successful rehearsal used ARM64 Node with
`--minify false`. Native ARM64 minification crashed; x64 Node failed because
the canonical dependency tree lacks the x64 Rollup binary. A minified build
has not been verified. The preview used Firebase CLI directly, so it does not
prove the guarded deployment workflow or backend compatibility.

An additional local acceptance build used `--mode acceptance` with
`VITE_FIREBASE_ACCEPTANCE_EMULATORS=true`. The shared Firebase bootstrap now
connects Auth/RTDB emulators for that mode only; production builds cannot opt
into those endpoints accidentally. The Auth emulator listened on a separate
port and a disposable `teacher@test.com` account was created through its local
REST API. The real login flow reached `Redirecting...`, proving the built
artifact used the emulator and completed Auth sign-in. The initial Auth-only
attempt could not finish the profile/dashboard transition because RTDB and
Firestore were unavailable; no shared emulator or production database was
touched.

The next correction requires the fixed `demo-luyentap-acceptance` identity,
database URL `http://localhost:19000?ns=demo-luyentap-acceptance`, and all three
`VITE_FIREBASE_*_EMULATOR_HOST` values: Auth `localhost:19099`, RTDB
`localhost:19000`, Firestore `localhost:19080`. Missing values or configured
remote provider endpoints fail before Firebase initialization. Firestore is
also connected to its emulator and analytics is disabled. Acceptance HTML
adds a CSP restricting fetch/WebSocket connections to the artifact origin and
these test ports, preventing hidden application defaults from making remote
backend calls. This boundary is deliberately limited to Firebase-only
acceptance; Worker/B2 scenarios require their own separately isolated targets.
The rebuilt artifact was scanned for `workers.dev`, Gemini/Groq, and Firebase
API-key patterns; none were present, and its only R2 endpoint was the required
`http://localhost:19087` test endpoint.
The same rebuilt artifact was served on `localhost:5180`; the real dev Teacher
login authenticated against the disposable Auth emulator and remained at
`Redirecting...` while the unavailable database emulators prevented profile
loading. Browser console output contained no additional error, so this is
positive Auth-path evidence plus a database-runtime boundary, not a claim of a
complete signed-in application session.

The measured local operator path was: acceptance build 39 seconds, focused
boundary/release/deployment checks 14 seconds, and browser Auth rehearsal under
10 seconds once the temporary Auth emulator was listening. The only manual
steps were supplying disposable endpoint variables, creating one emulator
account, and stopping the two temporary processes; the dependency junction was
removed automatically after each test batch. No production credentials,
shared emulator ports, or persistent local data were used.

On the next iteration, the cached RTDB emulator was run directly under a
disposable Microsoft JDK 11 (the Firebase CLI’s Java 21 gate is incompatible
with this machine’s Netty loopback behavior), and official Firestore emulator
v1.19.8 was run on Java 11 because the cached v1.20.4 requires Java 21. The
real application then read a disposable teacher profile, accepted the profile
form, wrote the completed profile to RTDB, and reached the teacher Materials
dashboard. The dashboard reported only the expected missing local material
index; no remote calls or production data were involved.

The checker also has a test-only `--mode acceptance --hosting-origin
http://localhost:<port>` route. It accepts only localhost HTTP origins and
`environment: acceptance` manifests; production and hotfix modes remain fixed
to `https://kahut1.web.app`. It was exercised against the real static server
and 445-file manifest, with every file hash read back over HTTP.

Deployment preflight requires `LUYENTAP_RELEASE_OBSERVED_FINGERPRINT` from the
reviewed observation and repeats source/environment/remote checks after build,
immediately before invoking Firebase. These are consistency checks, not human
authorization.

### Remaining operational acceptance

The mission is not complete. Current proof includes the real app build, a
full disposable Firebase-backed browser path, a real HTTP acceptance manifest
readback, deterministic checker tests, and a multi-commit hotfix retention test.
Still required locally is a full guarded deployment-route rehearsal and
recovery to a prior test artifact. Channel deletion proves cleanup, not
rollback. Do not substitute acceptance evidence for AC-01 through AC-17
production proof or bootstrap production as a shortcut.

An alternate-port `demo-luyentap-acceptance` Firebase emulator rehearsal was
attempted on 2026-10-11. Auth listened successfully; RTDB and Firestore failed
before listening:
the installed Java emulator runtimes could not create a loopback selector
(`failed to create a child event loop`). No shared emulator was restarted and no
data was written. This is an environment prerequisite for the remaining
database-backed browser scenario, not evidence of application data behavior.

Latest iteration: explicit acceptance manifest generation and localhost HTTP
readback were tested with the focused suite (21/21) and the relevant release,
acceptance-boundary, and deployment suites (46/46). A disposable historical
source hotfix was prepared from the observed base while the development
checkout remained untouched; a frontend correction plus a review bound to its
source, base, and observed fingerprint returned `PASS`, and its receipt now
contains a computed reconciliation obligation. A no-service synthetic change
returned `REVIEW_REQUIRED`, as intended. The production route still rejects
acceptance mode and no provider was mutated.

A cold-start run from the documented command path used the real Firebase CLI
readback and generated `tmp/release-receipts/cold-start-provider.json`. It
returned `UNVERIFIED` with the live version above, without requiring a human to
assemble provider JSON or performing a remote write. The candidate was clean
and the only missing production input was exact deployed source provenance.
The same path was exercised through `.agents/skills/release-safety/SKILL.md`;
its contract and referenced files were discovered automatically, and the
generated `skill-cold-start.json` reached the same conservative result.

The remaining production boundary is external: the live Hosting site currently
returns the application HTML at the manifest path rather than a production
manifest, so exact source provenance cannot be asserted. The read-only Firebase
Hosting inspection recorded live version
`projects/temp-a1437/sites/kahut1/versions/10039da56ea1c0ae`, finalized at
`2026-10-06T07:08:57.107Z`, with 458 files and the deployed rewrite/header
configuration. The first manifest bootstrap requires a separately authorized
deployment of the reviewed candidate, followed by remote readback. Worker,
backup Worker, Firebase rules,
database migrations, and Backblaze still require their provider-specific
read-only observations before those surfaces can be approved. Use disposable
backend resources and test-owned ports; never reuse concurrent localhost
emulator data for mock writes.

Read-only Wrangler inspection also succeeded for the configured Book Worker.
It returned finalized deployment/version IDs with 100% allocations, but the
provider reported `Source: Unknown` and did not expose Git provenance or the
effective secret/binding values. Worker source/configuration therefore remains
`UNVERIFIED` for release approval; no Worker or R2 resource was changed.

Firebase read-only inspection returned the deployed Firestore index set and
field overrides. The RTDB rules-list endpoint returned an API error, so the
deployed RTDB ruleset remains `UNVERIFIED`; no data or rules were changed.

The provider cold-start route was re-run from a clean `codex/release-safety`
worktree with no `node_modules` junction. The checker located the existing
repository-owned Firebase CLI through Git worktree metadata, read the live
Hosting version, wrote a local receipt, and returned exit code 2 with decision
`UNVERIFIED` because the provider does not expose Git/tree provenance. This
removes the former dependency-layout workaround; it does not turn unknown
provenance into approval.

A fresh-agent rerun at `d3e58512` read the current Skill from a cold start and
used the direct dependency-free command
`node scripts/release-check.mjs --mode release --base f5cb75fe --observe-hosting-provider --json`.
It exited 2 with `UNVERIFIED`, recorded the live Hosting version, and left the
worktree clean. This is agent-discoverability proof, not production approval.

Operational preview retest (2026-10-11): the existing 445-file acceptance
artifact was deployed to a uniquely named Firebase Hosting preview channel using
the repository's real `firebase.json`/`.firebaserc` target mapping. Firebase
returned HTTP 200 for the application and the acceptance manifest at `https://kahut1--acceptance-check-20261011-99e9f7b238fb-623q8ept.web.app`; the remote
manifest contained `environment: acceptance`, 445 files, revision
`b845e00823527d62cde663a805d1498e3ab24b76`, and the expected tree. The channel
was deleted immediately afterward; a follow-up channel readback showed only the
permanent `live` channel. The release observer intentionally rejected the
preview URL because production/hotfix observation is fixed to the live origin
and acceptance observation is restricted to localhost; this prevents a preview
from becoming a production baseline. The preview therefore proves real Hosting
artifact delivery and cleanup, while the local HTTP rehearsal proves observer
hash validation.

The real application build-only path was also rerun into a unique disposable
output with fake, nonproduction Firebase values: 9,522 modules transformed,
445 files emitted, and no provider command invoked. The first two preview
harness attempts failed before verification due to test-harness mistakes (wrong
working directory/config target and a PowerShell variable collision); no
channels remained afterward. The final run completed the remote artifact and
HTTP checks successfully.



Backup Worker read-only inspection (2026-10-11): the native ARM64 invocation
failed before contacting Cloudflare because the installed `workerd` package has
no `win32 arm64` binary. Repeating through the repository's documented shared
Windows x64 Node route succeeded. Wrangler returned finalized deployment
records for `r2-backup-worker`, including 100% allocations and version IDs
through `2026-10-01`. The provider exposed deployment history but no effective
secret values, binding readback, or Git/tree provenance. No Worker, R2 bucket,
credential, or schedule was changed. The backup Worker therefore has useful
version evidence but remains `UNVERIFIED` for configuration and source binding.


RTDB evidence retry (2026-10-11): Firebase CLI help confirmed
`database:rules:get` requires a ruleset ID and `database:rules:list` is the
read-only discovery route. Repeating the list call with the explicit
`temp-a1437-default-rtdb` instance still returned Firebase's
`Unexpected error encountered with database` response. No ruleset or data was
changed; deployed RTDB rules remain externally unverified.

The installed CLI confirms the rules-list call is a provider GET to
`https://metadata-dot-firebase-prod.appspot.com/namespaces/<database>/rulesets`
followed by ruleset-label readback. There is no alternate local source for
currently deployed rules; `database:rules:get` needs an ID from that list.
The repeated provider error is therefore an unavailable remote evidence path,
not a missing repository command.

Native Hosting recovery rehearsal (2026-10-11): two disposable preview
channels were deployed with distinct static artifacts (`recovery-A` and
`recovery-B`). Firebase's supported `hosting:clone kahut1:<source>
kahut1:<target>` operation copied the earlier A artifact over the B channel.
Both HTTPS endpoints were read back; source retained A and the target also
served A after clone. The channels were deleted, and a follow-up listing showed
only the permanent `live` channel. An earlier harness attempt left one orphaned
preview; its exact generated name was identified from the readback and deleted
before completion. This proves native Hosting artifact recovery and cleanup,
not database, Worker, or Backblaze rollback.
