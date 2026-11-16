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

The Cloudflare Worker name now exists as a QA-only shell because the public QA
Firebase web key was uploaded through Wrangler. It has no source deployment or
public endpoint yet; this is intentional until the rate-limit namespace and
QA service-account secret are ready.

Run the read-only health check before a release attempt:

```powershell
npm run qualification:health -- --env-file <qualification-env-file> --require-workers --json
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

Current external prerequisites: (1) an owner must create a distinct Cloudflare
Rate Limit namespace for the QA Worker and add its namespace ID to the config;
the production IDs cannot be reused; (2) an owner must provide the QA Firebase
web API key and a QA-only `book-homework@luyentap-pdf-qa-20261021` service-account
key through the protected secret path, then upload them as Worker secrets; and
(3) after deployment, add only the QA Worker endpoint URL(s) to the protected
qualification environment. These actions do not touch production routes,
credentials, or data.
