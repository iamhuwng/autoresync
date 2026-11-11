# Change-to-release traceability

Changelog ID: `CL-20261112-RELEASE-CHANGE-TRACEABILITY`
Master entry: [Master Changelog](../master_changelog.md)

## Problem and decision

The ledger could read historical top-level `changeIds`, but ordinary intent
creation and archive recovery did not establish those associations. Git summaries
described source history without identifying curated changes. Manual promotion of
Master rows could also leave detail records describing an older release state.

Keep the historical change narrative, executable release operations and technical
evidence separate. Carry selected IDs on explicit operation targets through the
existing workflow. Preserve historical top-level associations without guessing
their target scope.

## Implementation boundary

- The thin planner suggests changed CL records. Suggestions do not establish
  inclusion, test adequacy, service compatibility or authorization.
- The existing exact-source compatibility review selects `changeIds`; the guarded
  Hosting route validates IDs against the selected commit. `[]` requires a
  `changelogNotApplicable` explanation. No separate approval file is introduced.
- Targets retain their selected IDs through draft selection, intent, artifact/config
  enrichment, archive and fresh-store recovery. Retries cannot change associations;
  outcomes cannot inject them. A different change set cannot consume pending work.
- Native retained outcomes produce dated, per-target detail references and Master
  links. Reconciliation is idempotent and recoverable after partial document writes.
  It does not move an entire change into Released based only on Hosting publication.
- Publication and verification remain separate. Documentation errors leave
  documentation pending and never request another publication.

## Local qualification — 12 November 2026

The affected Node suite passed 164/164 checks across seven test files, with zero
failures/skips. It exercises explicit target associations, immutable retries,
historical top-level ID preservation, source/index validation, archive reopening,
fresh-journal recovery, interrupted document writes, exclusive reconciliation
ownership, repeated settlement and tampered retained-outcome rejection. Provider
calls use isolated fixtures; no shared operational ledger or remote resource was
mutated. The Master identity/index check passed with 40 records.

## Historical and operational limits

The first normal release retains its technical acceptance. Its original archive
did not contain CL associations; a later dated documentation addendum does not
retroactively change that intent. Rollback/recovery remains a separate operation
with its own evidence, and does not erase original publication history.

This implementation was remotely integrated through protected PRs before the
second normal release. The subsequent Material Profile release used the retained
association path and settled its CL outcome without a duplicate publication. The
release-safety change itself was not a product deployment; the separate Material
Profile candidate supplied the genuine second feature/fix.
