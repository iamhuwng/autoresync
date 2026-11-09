# Reading V2 answer-correctness closeout

Changelog ID: `CL-20261109-READING-V2-ANSWER-CORRECTNESS-CLOSEOUT`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem

The integrated Reading V2 and Listening answer pipeline still had three
operational gaps: an unnumbered shared `Choose THREE` prompt could become three
independent interactions, Studio routed accepted-answer variant approval through
the wrong interpretation action, and an Auto structured payload could expose an
AI-supplied answer as scoring data when no source answer-key row existed.

## Change

- Coalesce an unnumbered shared multiple-select stem only when its selection
  count and answer-slot range prove that it is one grouped task.
- Route `source-answer-key-variants-unapproved` through explicit authored-answer
  approval and persist that approval in the authoring context.
- Treat source answer-key rows as authoritative for Auto structured imports;
  missing rows produce no accepted scoring answers.
- Preserve the existing deterministic one-to-one grouped scoring, Studio review
  boundary, and current `main` release-safety workflow.

## Verification

- Six affected Reading V2 and Listening suites: 223 tests passed.
- Studio review mapping/workspace suites: 45 tests passed.
- Updated release-check suite: 50 tests passed.
- TypeScript: passed with `--noEmit --skipLibCheck --preserveSymlinks`.
- `git diff --check`: passed.
- Candidate merged into `main` at `351c790a`.

## Release status

The code is merged and verified, but no production deployment was performed.
The fresh release assessment against the observed live Hosting revision
`e865c34b2aa3394a5469cfcccabe68cffb103cc0` returned `BLOCKED` because current
`main` contains broader unreleased Hosting, Firebase rules, Worker,
backup-worker, migration, and historical reconciliation deltas. The guarded
release process requires those surfaces to be qualified before deployment;
this change must not be published as a Hosting-only release from the broader
`main` delta.
