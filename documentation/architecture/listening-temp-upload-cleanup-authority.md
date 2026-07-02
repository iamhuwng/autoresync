# Listening Temp Upload Cleanup Authority

Status: current deployed authority for future IELTS Listening abandoned temp uploads as of 2026-07-02.

This document governs only uncommitted Listening authoring temp uploads. It does not authorize durable audio deletion, historical orphan deletion, Google Drive cleanup, or permanent-prefix mutation.

## Deployed Authority

- Worker: `r2-upload-signer`
- Active deployed version for this setup: `dca3e056-142f-4cb4-9194-3117675f8889`
- Route for explicit cancel/abandon cleanup: `POST /cancelListeningUploadSession`
- Scheduled trigger: `0 * * * *`
- Future-only sweep cutoff: `LISTENING_UPLOAD_SESSION_SWEEP_NOT_BEFORE_MS=1782976636347`
- Sweep flag: `LISTENING_UPLOAD_SESSION_SWEEP_ENABLED=true`
- R2 bucket: `kahoot-media`
- R2 lifecycle fallback rule: `expire-temp-prefix-after-one-day`, prefix `temp/`, action `Expire objects after 1 days`
- RTDB project/database: `temp-a1437-default-rtdb`

## Authority Boundary

Browser/client code must never receive raw R2 delete authority.

Client cleanup requests may include only:

- `uploadSessionId`
- optional `assetId`
- cleanup reason from the approved reason set

Trusted Worker code derives owner, session, asset, and temp key facts from RTDB and Worker-side contracts. R2 deletion must occur only through the trusted Worker `R2_BUCKET` binding.

## Allowed Temp Prefixes

Immediate Listening cleanup may delete only canonical uncommitted keys under:

- `temp/listening/{ownerId}/{uploadSessionId}/{assetId}-{sanitizedFileName}`

Lifecycle fallback applies to:

- `temp/`

The lifecycle rule is a temp-only safety net. It is not a durable reference cleanup mechanism.

## Forbidden Prefixes

This cleanup authority must not delete or mutate:

- `assessment-assets/listening/`
- `listening-audio/`
- `audio/`
- any other permanent prefix

## Reference Preservation

Before trusted immediate deletion, the Worker must preserve any object that has a durable reference in:

- `media_assets/**`
- `listening_authoring/drafts/**`
- `listening_authoring/versions/**`
- `tests/**`
- `results/**`
- `assignments/**`
- `sessions/**`

Referenced temp assets stay preserved and the session remains in a cleanup terminal/queued state instead of silent `active`.

## Session State

Abandoned/cancelled sessions must not remain silently `active` after trusted cleanup processing.

Expected terminal or cleanup states:

- `cleanup-queued` before/around trusted cleanup attempts
- `abandoned` after safe cleanup completion

The scheduled sweep considers only future expired Listening upload sessions with status `active` or `cleanup-queued`, bounded by configured owner/session limits.

## Observability

Scheduled sweep writes aggregate records only:

- `media_asset_sweeps/{sweepId}`
- `media_asset_metrics/{metricEventId}`

These records must not include raw temp keys, signed URLs, tokens, secrets, raw audio, or audio content.

Current RTDB rules allow the expanded lifecycle metric operation set and keep browser writes denied for lifecycle metrics/sweeps.

## Current Verification

Accepted proof from 2026-07-02:

- Explicit route deployed first as Worker version `fc4898f5-6acb-4df0-9ee1-bcbebec63d12`.
- Nine owner-approved abandoned `temp/listening/glMHCrzMnyS6AqFcb9I0nlOqQ6X2/...` objects were deleted through trusted Worker cleanup.
- Post-cleanup R2 HEAD returned 404 for all nine candidate keys.
- Related RTDB upload sessions moved to `status:"abandoned"` with `abandonmentReason:"builder-cancel"`.
- `/media_assets/{assetId}` was null for all nine assets.
- Durable reference roots had zero asset/key hits.
- Permanent object count touched: 0.
- Follow-up permanent setup deployed Worker version `dca3e056-142f-4cb4-9194-3117675f8889` with hourly cron.
- RTDB rules released successfully to `temp-a1437-default-rtdb`.
- R2 lifecycle readback showed default multipart abort plus enabled `temp/` one-day expiration.
- Focused Worker/lifecycle tests passed 24/24.
- Focused frontend/storage tests passed 69/69.
- Production build and bundle budget passed.

## Not Yet Proven Or Authorized

- First real scheduled cron execution has not yet been observed.
- Historical orphan deletion is not authorized.
- Durable `pending-delete` object cleanup is not deployed.
- Permanent prefix deletion is not authorized.
- Merge/push is separate from this authority unless explicitly requested.
