# Persistent qualification foundation

The qualification foundation is persistent and non-production. It uses Firebase
project `luyentap-pdf-qa-20261021`, Hosting site `luyentap-pdf-qa-20261021`, and
its active RTDB instance. GitHub environment `qualification` owns the Firebase
configuration and OIDC identity. Release runs create only disposable preview
channels, temporary accounts, test namespace/data, candidate artifacts, and
evidence; they must clean those resources in `finally` paths.

The relevant Worker copy is `luyentap-qualification-upload-signer`. Its checked-in
config binds only `luyentap-qualification-media` and
`luyentap-qualification-listening-audio`, and points at the qualification RTDB.
It must never bind `kahoot-media`, `luyentap-listening-audio-private`, the
production Firebase project, or the production Worker name.

Stable QA website: `https://luyentap-pdf-qa-20261021.web.app`.
Stable QA Worker: `https://luyentap-qualification-upload-signer.iamhuwng.workers.dev`.
Firestore uses the QA project's `(default)` Standard-edition database in
`asia-southeast1`. No production users, credentials or data are copied as part
of routine qualification setup.

The Worker uses `UPLOAD_RATE_LIMITER`, namespace `205514`, at 30 requests per
60 seconds. Cloudflare accepts this integer ID directly in the binding form;
an independently provisioned namespace resource is not required. The variable
name matches the Worker code rather than a descriptive namespace label.

For provider qualification operations, use the saved configuration at
`%USERPROFILE%\.luyentap\qualification\.env` or the existing GitHub environment
`qualification`. That environment owns `LUYENTAP_QUALIFICATION_ENV`, its OIDC
identity, and `LUYENTAP_QUALIFICATION_WORKER_URL`.

## Routine localhost qualification

Run `npm.cmd run dev` for the spare-service teacher site at
`http://localhost:5173/login`. For a student journey, use
`npm.cmd run dev -- --port 5174` and open `http://localhost:5174/login`.
The launcher fetches the spare project's Firebase configuration and checks its
project and backend identity. To preview a built spare site, use
`npm.cmd run build:spare` and then `npm.cmd run preview:spare`. The spare build
uses `dist-spare/` and leaves the release artifact in `dist/`.
[Native development commands](native-development.md)

Use temporary QA accounts and verify each Worker and external service used by
the journey targets the spare environment. For Student ID checks, confirm the
active spare Worker allows the selected localhost origin and that spare Firebase
Auth domains and API key restrictions permit the journey. The checked-in spare
Worker configuration includes ports 5173 and 5174. If a run needs a temporary
origin, coordinate with the QA Worker operator, record the prior allowlist,
and verify restoration in cleanup.

Use spare Hosting only for a deployed-origin requirement such as a real
Hosting rewrite, header or hosted callback. Build the release artifact
separately using the production build command and follow the
[routine Hosting release](release-safety.md#routine-hosting-release).

For exact-built-artifact proof, use the production build route with the separate
qualification Firebase inputs only when the selected journey needs the QA
Hosting origin. Verify isolation for every service the selected journey calls,
and retain `dist/` with `--hosting-artifact` in the existing verification
bundle. Promotion restores those bytes.
See [release-safety.md](release-safety.md#codex-verification-handoff).

## Deployed-origin checks on the spare project

Use a uniquely named disposable Hosting channel and record its project, site,
and channel ID before deployment. Create a temporary Firebase config containing
only the canonical `kahut1` Hosting entry from `firebase.json`. Replace
`target` with `site: "luyentap-pdf-qa-20261021"`, point `public` at the selected
artifact, and omit the `**/.*` ignore entry so the retained manifest is served.
Keep the canonical headers and rewrites.

Use the repository Firebase CLI's `hosting:channel:deploy` with that config
and explicit spare project. Independently read back the candidate manifest and
listed files, then run the selected journey against the existing spare rules
and trusted test fixtures. Delete that exact channel in cleanup and verify
its absence with `hosting:channel:list`. Remove any temporary account, data,
or Worker origin recorded for the run. The historical fixture-rules helper
`scripts/release-browser-gate.mjs` requires a separate disposable Firebase
project because it replaces RTDB rules.

## Spare backend operations

Git-triggered Cloudflare builds on this QA Worker are disabled. Publish selected
QA Worker source through the explicit `wrangler.qualification.jsonc` route;
the old repository-root app build/default deploy command had no QA build
configuration and must not silently replace the tested Worker version.

Run the read-only health check before a release attempt:

```powershell
$env:GOOGLE_OAUTH_ACCESS_TOKEN = gcloud auth print-access-token
try {
  node scripts/qualification-foundation-health.mjs `
    --env-file "$env:USERPROFILE\.luyentap\qualification\.env" `
    --require-workers --json
} finally {
  Remove-Item Env:\GOOGLE_OAUTH_ACCESS_TOKEN
}
```

The command verifies the dedicated project/site identity and active RTDB
instance through the repository Firebase CLI. It never deploys, writes RTDB,
creates Auth users, or changes Hosting. `BLOCKED` names the exact missing
component. `--require-workers` is required for journeys that exercise Worker
routes; the qualification environment must then provide HTTPS
`VITE_*WORKER_URL`/`VITE_*WORKER_ORIGIN` bindings that are distinct from
production endpoints. Set `GOOGLE_OAUTH_ACCESS_TOKEN` when Auth API
configuration readback is required. Worker deployment/version/binding proof
remains a separate read-only provider observation.

Worker secrets are `FIREBASE_WEB_API_KEY`, `BOOK_HOMEWORK_GOOGLE_SA_KEY`, and
`UPLOAD_GRANT_SECRET`. The upload-grant secret is generated for this spare
Worker and stored in Cloudflare. The service account key belongs only to
`book-homework@luyentap-pdf-qa-20261021.iam.gserviceaccount.com`; the same email
is configured as `BOOK_HOMEWORK_SERVICE_IDENTITY`. Its owner-authorized
`roles/firebasedatabase.admin` grant is restricted to the separate QA project.
Do not export the private key or grant production permissions. A secret-name
listing does not prove that its runtime value is usable.

There are no permanent shared journey passwords. Provision temporary QA
accounts, open `/login`, and delete their Auth accounts, profiles and private
student-ID mappings in cleanup. Local dev quick-login accounts are not remote
QA fixtures. Keep credentials out of logs and Git.

Write the run identity, project, temporary account UIDs and namespace/channel
cleanup targets before creating those resources. Retain that ledger through
failures; resume cleanup using the same project-bound Auth credentials and
confirm deletion by readback. Keep a failed attempt's log when retrying instead
of overwriting it with a later successful run.

Health PASS establishes the checked inventory, not every application flow.
Codex selects proportionate browser/provider tests. Synchronize only affected
QA source, rules, indexes or Worker configuration with the selected candidate;
read back the result. Firestore composite indexes must be READY before dependent
queries. Ordinary single-field indexes are automatic and must not be listed as
composite indexes.

Full-app qualification uses the candidate's `database.rules.json`,
`firestore.rules` and `firestore.indexes.json`. The optional historical Hosting
smoke harness deploys fixture-only RTDB rules: do not run that fixture-rules lane
over this foundation or mistake it for full-app qualification. Use a selected
journey with actual candidate rules and trusted fixture provisioning instead.

Preview channels isolate frontend versions, not shared rules or Worker
versions. Serialize changes to those shared backends. For a unique preview
URL, add its exact origin to the QA Worker's `STUDENT_AUTH_ALLOWED_ORIGINS` for
that run, then remove it in cleanup. Do not allow arbitrary `web.app` origins.
The stable QA site's origin is already allowed. Preserve the stable site and
foundation when deleting run resources.

R2 bindings alone do not prove object delivery. Public R2 delivery, Backblaze,
external AI services, Functions and migrations retain scoped setup and evidence;
never use production endpoints as a fallback for missing QA services.

Setup evidence and limits:
`documentation/release-audits/2026-11-17-persistent-qualification-foundation.md`.
