# Ticket #50 reopened recovery repair evidence - 2026-07-30

## Why the closed ticket was reopened

Historical comparison was performed before changing the recovery seam:

- `e187a177` (#48) persisted and reused the same operation ID for byte replay.
- `8aac13245bfcaefb06f2db5ec6de6f051e9ab28c` (#50) converted ambiguous
  provider errors to `cancel_requested`, restricted byte replay to `reserved`,
  removed the same-operation retry regression, and left the panel advertising
  `Retry PDF bytes` for a phase the workflow rejected.
- Deployed #49 acceptance reproduced the consequence: durable reservation,
  browser-side begin/authority failure before recoverable binding, lost local
  operation identity after reload, then a new operation conflicting with the
  active artifact.

This is concrete post-closure regression evidence, not a speculative reopen.

## Repair

- Persist a safe `begin_pending` record containing the operation ID and exact
  file claim before the begin request. It contains no reservation, Source
  Version, provider identity, upload URL, headers, token, or bytes.
- Retain `begin_pending` after ambiguous HTTP/server failure and replay begin
  with exactly the same operation ID. Clear it only for deterministic
  non-reservation responses.
- Refresh every bound state from authoritative lifecycle status and expose only
  the action named by `retryKind`.
- Normalize authoritative byte retry to `reserved` and discard stale provider
  identity. Cleanup always takes precedence over a committed status until
  sibling-version reconciliation succeeds.
- Bind status, completion, and reconciliation responses to Book, reservation,
  and Source Version before any local mutation.
- Fence delayed status, begin, upload, completion, cancellation, and reconcile
  writes/clears against the exact persisted operation snapshot. A stale async
  result cannot overwrite or clear a replacement operation.
- Recheck cancellation after delayed completion returns.
- The panel offers byte retry only for `begin_pending`/`reserved`, never for
  `cancel_requested`; pending server IDs render as not assigned.

## Automated verification

- Root x64 harness, focused client/workflow/panel: 3 files, 41 tests passed.
- Root x64 harness, upload/lifecycle/panel surface: 7 files, 90 tests passed.
- Cloudflare x64 harness, control/reconciliation/capacity/exact cleanup:
  4 files, 44 tests passed.
- New regressions cover:
  - real HTTP rejected-response then same-ID replay;
  - workflow recreation/reload and exact operation-ID reuse;
  - deterministic non-reservation clearing;
  - abort after durable begin without provider upload;
  - authoritative cleanup and byte-retry normalization;
  - committed-version sibling cleanup;
  - Book/reservation/Source-Version response binding;
  - stale status and begin responses unable to clear a replacement operation;
  - delayed byte/completion results unable to overwrite cancellation;
  - panel phase/action agreement and safe pending identifiers.
- Scoped ESLint passed.
- Mantine boundary passed for the shared dirty-tree source set.
- No TypeScript diagnostics were emitted for #50-owned paths.
- `git diff --check` passed for the exact owned paths.

## Browser and deployed disposable proof

- Teacher browser: `http://localhost:5173`.
- The failed begin was retained locally as `begin_pending`.
- Immediate retry sent the same operation fingerprint `a3f7d51b`.
- After closing/reopening the Book, selecting the same inspected PDF and
  retrying again sent the same operation fingerprint `a3f7d51b`.
- The deployed canonical consumer returned safe HTTP 503
  `account_state_unavailable` on both attempts. That remaining provider-snapshot
  consumer failure belongs to #49; it did not allocate a new operation.
- The earlier uncertain reservation
  `reservation-7ccaba46dba0c84e` was canceled into cleanup and then read through
  the deployed #50 reconciliation Worker as terminal `released`.
- Deployed manual reconcile returned `released` idempotently, proving scheduled
  reconciliation is not the sole liveness path.
- No B2 object and no usable/duplicate Source Version were created.
- The existing truthful reconciliation deployment, separate exact identities,
  all-version cleanup, capacity snapshot, rollback, and disposable cleanup
  proof from the 2026-07-30 closure remains unchanged and was freshly exercised
  through status/manual reconcile.

Fresh noninteractive Wrangler version/config readback was attempted through the
mandatory isolated Windows harness with profile `media`. Wrangler 4.112.0
selected the correct profile but required `CLOUDFLARE_API_TOKEN` in the
noninteractive process. No remote mutation occurred. This is recorded as a
harness/auth limitation, not as product or B2 failure; the deployed endpoint
behavior and prior exact version/config readback are the applicable evidence
because this repair changes browser state/recovery code, not Worker deployment.

## Rollback and safety

- Rollback remains: disable new upload begin while retaining safe status,
  cancellation, completion for valid operations, and reconciliation.
- Removing this browser repair restores the prior UI only; it does not activate
  provider authority or alter remote data.
- Private B2/#03B remains `DISABLED`.
- #50A and all unrelated trusted actions remain all-deny/default-deny.
- No runtime Master key, broad key, production route, or trusted capability was
  enabled.
- #49 retains CORS, presigning/version mapping, provider snapshot consumption,
  tiny/500-MiB transport, and integrated activation proof.
