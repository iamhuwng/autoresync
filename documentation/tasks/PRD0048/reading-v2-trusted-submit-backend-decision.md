# Reading V2 Trusted Submit Backend Decision

Date: 2026-05-11

## Decision

Reading V2 needs a trusted submit backend, not Firebase Cloud Functions specifically.

The current production-aligned path is:

`Student runtime -> Cloudflare Worker /api/reading-v2/submit -> Firebase Auth verification -> canonical Reading V2 snapshot/review projection load -> server-side scoring -> canonical result/index writes`

## Why

The PRD requirement is authoritative scoring and result persistence. Student browsers must submit attempt data only. They must not own official scoring, answer-key access, canonical result writes, or live-session completion writes.

Firebase Cloud Functions were the first implementation choice because they fit Firebase Auth and RTDB naturally. That choice blocked on the current Firebase project because Cloud Functions deployment needs APIs/billing capabilities unavailable on the Spark-blocked path.

The existing Cloudflare Worker can satisfy the same trust boundary without requiring Firebase Cloud Functions deployment.

## Canonical Rule

Future Reading V2 work should say "trusted submit backend" unless it truly means Firebase Cloud Functions.

Do not make first-release readiness depend on Firebase Cloud Functions when the Worker endpoint is available and approved.

## Current Endpoint

Production should use:

`VITE_READING_V2_SUBMISSION_ENDPOINT=https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit`

Production must configure this explicit endpoint. If it is absent, the browser must fail closed instead of silently deriving the undeployed Firebase Cloud Functions URL. Vite dev may still derive the local Functions emulator endpoint for local backend tests.

## Required Behavior

- Verify Firebase Auth.
- Reject unauthenticated submit requests.
- Load canonical `reading_v2/published_snapshots/{materialId}/{snapshotVersionId}`.
- Load canonical `reading_v2/projections/review/{materialId}:{snapshotVersionId}`.
- Score server-side from canonical data.
- Exclude scoring rules from student-facing/review payloads.
- Write `test_results/{resultId}` before secondary indexes.
- Fan out Reading V2 attempt/result/review indexes and shared result indexes.
- Update live-session completion state when session context exists.

## Implementation Status

- Cloudflare Worker deployed on 2026-05-11 at `https://r2-backup-worker.iamhuwng.workers.dev`.
- Worker route `POST /api/reading-v2/submit` is live and rejects unauthenticated requests with `403`.
- Firebase Hosting `kahut1` deployed on 2026-05-11 with the Worker endpoint in the production build.
- Firebase Hosting no longer rewrites `/api/reading-v2/submit` to the undeployed `readingV2Submit` Cloud Function.
- Client production fallback now fails closed when no explicit endpoint is configured; it does not derive `cloudfunctions.net/readingV2Submit`.

## Remaining Work

- Move shared submit core out of `functions/src` into a neutral shared backend/core location.
- Complete an authenticated live student submit/result verification through the deployed Worker.
- Keep Firebase Functions wrapper only as optional fallback unless an owner approves deleting it.
