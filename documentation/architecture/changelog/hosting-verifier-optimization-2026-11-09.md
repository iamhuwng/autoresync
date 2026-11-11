# Hosting verifier optimization

Changelog ID: `CL-20261109-HOSTING-VERIFIER-OPTIMIZATION`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem

Hosting evidence verification downloaded every manifest asset serially. A
transient rollout mismatch could also leave earlier reads active while a retry
started, and a permanent failure could be hidden behind a retryable failure.

## Change

- Read manifest assets with a bounded pool of eight requests.
- Retry the complete snapshot up to three times only for transient read,
  retryable HTTP, or content-drift failures.
- Stop assigning queued files after an attempt fails, settle already-started
  reads, and prefer any permanent failure when several reads fail together.
- Preserve source revision/tree validation, per-file SHA-256 checks, origin
  restrictions, size limits, and fail-closed observation semantics.

## Verification and integration status

- Six focused Hosting failure and success tests cover bounded concurrency,
  complete-snapshot retry, cross-attempt concurrency, early permanent failure,
  simultaneous permanent/transient failures, and response/HTTP classification.
- The repository script gate passed 223 tests before this final integration
  record; the focused release suite passed after the failure-path correction.
- A controlled 120-asset reproduction dropped from 121 requests for an early
  permanent failure and 363 requests across three mixed-failure attempts to
  nine requests in each case. This is synthetic verifier evidence, not an
  end-to-end production deployment measurement.
- Source commits `d34c1540` and `41749b2d` are directly descended from current
  `main`. This record is source integration only; no Hosting deployment was
  performed.

## Next release boundary

The next authorized release must select the observed live revision explicitly,
run the existing release assessment and production build, and inspect the
Hosting readback as a bounded complete-snapshot verification. Integrating this
tooling does not authorize publishing the other changes already present on
`main`.

## Release outcome addendum — 12 November 2026

The integration-only statement above describes the original implementation.
The verifier subsequently ran for the first qualified normal release from main
`5981a4da`, including independent readback of all 443 manifest-listed assets and
resumed verification without republishing. See the
[recorded operation and measurement limits](normal-main-release-one-2026-11-12.md).
This later documentation link does not modify the original archive or assert that
CL associations were retained before publication.
