# Persistent qualification foundation

The qualification foundation is persistent and non-production. It uses Firebase
project `luyentap-pdf-qa-20261021`, Hosting site `luyentap-pdf-qa-20261021`, and
its active RTDB instance. GitHub environment `qualification` owns the Firebase
configuration and OIDC identity. Release runs create only disposable preview
channels, temporary accounts, test namespace/data, candidate artifacts, and
evidence; they must clean those resources in `finally` paths.

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

Current external prerequisite: the qualification GitHub environment has no
non-production Worker endpoint variables. An owner must deploy or designate
the non-production Worker routes, record their stable names/bindings, and add
only their endpoint URLs to the qualification environment. No secret value is
needed by this runbook.
