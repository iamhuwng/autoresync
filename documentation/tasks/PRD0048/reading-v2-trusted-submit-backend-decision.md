# Reading V2 Trusted Submit Backend Decision

Date: 2026-05-11
Updated: 2026-06-15

## Decision

Reading V2 needs a trusted submit backend, not Firebase Cloud Functions. Cloud Functions are off-limit for new Reading V2 work.

The current production-aligned path is:

`Student runtime -> Cloudflare Worker /api/reading-v2/submit -> Firebase Auth verification -> canonical Reading V2 snapshot/review projection load -> server-side scoring -> canonical result/index writes`

Runtime integration details live in `documentation/architecture/reading-v2-runtime-integrations.md`.

## Why

The PRD requirement is authoritative scoring and result persistence. Student browsers must submit attempt data only. They must not own official scoring, answer-key access, canonical result writes, or live-session completion writes.

Firebase Cloud Functions were the first implementation choice because they fit Firebase Auth and RTDB naturally. That path is now historical only. It blocked on the current Firebase project because Cloud Functions deployment needs APIs/billing capabilities unavailable on the Spark-blocked path, and the approved backend boundary is the existing Cloudflare Worker/small backend path.

The existing Cloudflare Worker can satisfy the same trust boundary without requiring Firebase Cloud Functions deployment.

## Canonical Rule

Future Reading V2 work should say "Cloudflare Worker", "trusted submit backend", or "approved small backend" as appropriate. It should not propose Cloud Functions unless a future explicit architecture decision reverses this off-limit rule.

Do not make first-release readiness depend on Firebase Cloud Functions when the Worker endpoint is available and approved. Do not add new Cloud Function behavior for Reading V2.

## Current Endpoint

Production should use:

`VITE_READING_V2_SUBMISSION_ENDPOINT=https://r2-backup-worker.iamhuwng.workers.dev/api/reading-v2/submit`

Production must configure this explicit endpoint. If it is absent, the browser must fail closed instead of silently deriving any Cloud Functions URL. Local backend tests should target an explicit Worker/local trusted-backend endpoint rather than relying on Functions emulator fallback.

## Required Behavior

- Verify Firebase Auth.
- Reject unauthenticated submit requests.
- Load canonical `reading_v2/published_snapshots/{materialId}/{snapshotVersionId}`.
- Load canonical `reading_v2/projections/review/{materialId}:{snapshotVersionId}`.
- Score server-side from canonical data.
- Accept and sanitize optional browser `integrityReport` telemetry without trusting it for scoring.
- Exclude scoring rules from student-facing/review payloads.
- Write `test_results/{resultId}` before secondary indexes.
- Fan out Reading V2 attempt/result/review indexes and shared result indexes.
- Persist `integrityReport` on the attempt/result records when provided.
- Update live-session completion state when session context exists.

## Implementation Status

- Cloudflare Worker deployed on 2026-05-11 at `https://r2-backup-worker.iamhuwng.workers.dev`.
- Worker route `POST /api/reading-v2/submit` is live and rejects unauthenticated requests with `403`.
- Firebase Hosting `kahut1` deployed on 2026-05-11 with the Worker endpoint in the production build.
- Firebase Hosting no longer rewrites `/api/reading-v2/submit` to the undeployed `readingV2Submit` Cloud Function.
- Client production fallback now fails closed when no explicit endpoint is configured; it does not derive `cloudfunctions.net/readingV2Submit`.
- Authenticated production verification completed on 2026-05-11 with `student@test.com`, material `studio-material-mojlf55h`, and snapshot `snapshot-studio-material-mojlf55h-mojlfaqa`.
- Solo-practice Worker submit returned `reading-v2-result-938044f7-2529-4cc4-be2c-447c8f0a09d7`, `reading-v2-attempt-3ab822a7-fd51-4767-8ed3-48c37662fe48`, and `40/40`; canonical result, attempt, review, student, solo-practice, and session indexes were present in RTDB.
- Live-session Worker submit against verification session `CDXV2T` returned `reading-v2-result-1e6af2cf-6f43-4941-a79a-e13abab55e25`, `reading-v2-attempt-4a1c4ce3-008d-4c5c-a917-cdc32c767a25`, and `40/40`; `game_sessions/CDXV2T/students/{uid}/readingV2`, player completion flags, teacher index, session index, and canonical result were present in RTDB.
- As of 2026-06-15, Reading V2 live and homework hosts attach existing anti-cheat `integrityReport` snapshots to the trusted submit request. The shared trusted core parses, sanitizes, and persists that telemetry on attempt/result records.

## Source Location Caveat

The shared trusted submit core still lives under `functions/src/readingV2SubmitCore.ts` and generated `functions/lib/*` because the Worker imports that core. This is a temporary source-location compromise, not a Cloud Functions production fallback.

## Remaining Work

- Move shared submit core out of `functions/src` into a neutral shared backend/core location.
- Retire or delete the Firebase Functions wrapper after the shared core has a neutral home. Until then, treat it as deprecated historical code, not an optional production fallback.
