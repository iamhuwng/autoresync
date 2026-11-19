# Teacher homework notification Worker release

The product candidate is protected merge `977471487c042cd152967c90da99149cd83006cf`.
Its reviewed base is `69629ba3ecd5deff9b230be253866594cd030b23`. The release
changes the retained `notification-command-active.mjs` module of
`luyentap-notification-command`. The public adapter delegates to the same
Durable Object. The deployment uses the two modules and configuration from the
clean product checkout. The artifact digests and provider pins live in the
[fixed observer](../../scripts/release-teacher-homework-notification-evidence.mjs).
[Protected-main CI](https://github.com/iamhuwng/autoresync/actions/runs/44433171819)

## Qualify the release

Run the shared checker from the tooling checkout against the exact detached
product checkout. The tooling checkout supplies the repository's Wrangler and
Firebase CLI dependencies. The operator signs in through Wrangler and the
Firebase CLI. The observer verifies the active modules, Worker configuration,
routing and both Firebase rulesets twice. It reads secret binding names only.

```powershell
node scripts/release-check.mjs --cwd <candidate> --mode release --base 69629ba3ecd5deff9b230be253866594cd030b23 --observe-teacher-homework-notification-worker --worker-phase predeploy --receipt tmp/release-receipts/predeploy.json
```

Use the [November 4 configuration](notification-writing-homework-release.wrangler.json)
from the candidate checkout. Confirm Wrangler's dry-run module hashes against the
fixed observer. Repeat the native predeployment check just before execution.
Require a fresh PASS, independent review, successful CI and explicit production
authorization.

## Publish and recover

Run `wrangler versions upload --config <candidate-upload-config>` from the
candidate checkout and record the version ID beside the preflight receipt.
Verify the version metadata and bindings. Repeat the full predeploy check
immediately before promoting that version to 100%. Use the
[traffic configuration](notification-teacher-homework-traffic.wrangler.json)
from the tooling checkout for every promotion and rollback. It contains only
the Worker name and account ID, so Wrangler skips non-versioned settings sync.

```powershell
node scripts/tooling-where.mjs --exec cloudflare-wrangler versions deploy "<uploaded-version>@100%" --config documentation/release-audits/notification-teacher-homework-traffic.wrangler.json --yes
```

Record the deployment ID.

Repeat the shared check with `--worker-phase postdeploy` and a separate receipt.
The observed active version must equal the version this operation promoted.
Record live evidence and the authenticated browser verification result, if
available, in the master changelog. If publication is interrupted, query
Cloudflare deployments and versions for this operation before retrying a write.
If a confirmed rollout causes a regression, use the same traffic-only command
to restore version `7f4edb63-4727-4d0c-9e46-ade6dd51a602` to 100% and re-run
predeploy readback.
Notifications already written keep their message and read state.
