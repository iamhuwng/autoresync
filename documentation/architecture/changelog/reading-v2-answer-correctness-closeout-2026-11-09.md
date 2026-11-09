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

The scoped Hosting hotfix was deployed and verified live from commit
`23ae29a79f816b27a551071345d700988b043bc7`, based on the observed production
revision `66d111a8753db036ccb71f763fbcbcc21dcaf301`. Hosting now serves
revision `23ae29a7…` with tree `d4dfd19cf7fa94098ab7d5ddb2b0ed9a73e7f216`;
the post-deploy manifest returned HTTP 200 and retained the historical hotfix
ledger.

The deployed candidate changed only the nine answer-processing modules and was
qualified as Hosting-only. No Firebase rules, Worker, backup-worker, migration,
or production data changes were included.

The merged `main` branch remains a broader development candidate and was not
the artifact deployed by this hotfix. Its separate cross-service qualification
obligations remain unchanged.

The first assessment supplied the stale base
`e865c34b2aa3394a5469cfcccabe68cffb103cc0`; its live readback actually
identified production revision
`66d111a8753db036ccb71f763fbcbcc21dcaf301` (tree
`ebea06139c225ae47ab742a052da3c17b285fadb`). That stale-base mismatch was
corrected and is not a remaining product or release defect.

The corrected assessment against `66d111a8…` independently read back the
Hosting manifest and all listed assets. The bounded verifier passed its
correctness checks; production speedup has not been established by this
assessment.
