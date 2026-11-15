# Phase 4 simplification measurement — 2026-11-15

This packet measures repeated work after Phase 3 completion and records the one
deletion justified by the evidence. Each candidate is classified by the
invariant it protects and by whether a stronger retained contract already
covers that invariant.

## Current evidence

- Protected `main` includes PR #277's retained-verification simplification and
  PR #278's Phase 4 closure documentation.
- The release script suite passed 272 tests with zero failures.
- The synthetic application-review rehearsal passed the positive handoff and
  altered, stale, mismatched, oversized, and credential-like negative cases.
- No new production promotion was authorized or performed, so this packet does
  not claim production timing or live-operator frequency measurements.

## Repetition inventory

| Candidate repetition | Current locations | Invariant protected | Measurement decision |
|---|---|---|---|
| Verification plan executes in both prepare and promote | `release-promotion.mjs --run-verification`; `deploy-live.mjs` retained-route verification | The test result is bound to source, plan, environment and retained artifact before publication | **Removed by PR #277.** The retained-card rehearsal proved deploy-live can trust the exact serialized result after source, plan, environment, timestamp, suite-count and output-digest validation. |
| Verification plan, card, and Hosting artifact cross-job transfer | Prepare uploads; promote downloads and validates each package | Cross-job source/artifact handoff and independent retained-artifact readback | **Keep.** These are separate job-boundary transfers, not duplicate checks. |
| Approval-time baseline and pre-mutation baseline snapshot | Prepare observes the approved Hosting baseline; promote performs the final snapshot | Approval freshness versus concurrency drift immediately before mutation | **Keep.** The observations protect different time windows. |
| Operation result creation and result-artifact upload | `deploy-live.mjs` writes operation evidence; Actions copies/uploads result files | Durable operation identity and recovery evidence retention | **Keep.** Ownership is already centralized; the workflow is only the transport boundary. |
| Review binding and source/artifact/config validation | Promotion card, deploy-live, archive and workflow checks | Fail-closed provenance and authorization | **Keep.** Repeated checks sit at different trust boundaries. |
| Manual hashes, fingerprints, and paths | Planner/preparer derives them; card exports them | Prevent caller-selected evidence and stale input drift | **Keep generated.** No manual ceremony remains to remove here. |

## Smallest justified Phase 4 candidate (completed)

Measure the duplicate verification execution in a synthetic retained-artifact
run. The proof must show:

1. the card’s retained verification result is validated against the exact source,
   plan, environment, and artifact;
2. deploy-live still rejects altered, stale, or mismatched retained results;
3. publication/readback/recovery behavior remains unchanged; and
4. the removed execution saves measurable work without weakening a concrete
   invariant.

The proof passed, so only the redundant execution was removed; source-bound
retained-result validation remains mandatory.

The first rehearsal recorded that a serialized verification result could not
satisfy `assertReleaseVerification` because that validator also required its
in-process trust marker. Phase 4 now adds `assertRetainedReleaseVerification`,
which validates the serialized source, plan, environment, timestamps, suite
counts, and output digests before marking the result trusted. The guarded
retained-card path passes that result directly into deploy-live and no longer
reruns the same verification plan; callers without retained evidence keep the
old rerun fallback. The rehearsal proves altered retained counts still fail.

This simplification merged through PR #277 as `a8021930dbdc04adac67eedd38a0e5dc176e6a71`.
The remaining repetition candidates were measured and kept: cross-job transfer
crosses a trust boundary, the two baseline observations protect different time
windows, operation-result upload is transport after executor ownership, and
provenance checks repeat at distinct trust boundaries. No further deletion is
currently justified.

Phase 4 is complete. Local-development reliability remains a separate
workstream, and no fixed browser journey is introduced.
