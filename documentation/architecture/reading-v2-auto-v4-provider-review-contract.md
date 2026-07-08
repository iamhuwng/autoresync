# Reading V2 Auto V4 Provider Review Contract

Status: current Auto V4 provider/review boundary. Detailed history lives in
[`documentation/architecture/changelog/reading-v2-auto-v4-provider-review-contract.md`](changelog/reading-v2-auto-v4-provider-review-contract.md).

## Contract

Auto V4 is an import assistant. It may prepare structured Reading V2 draft data,
source evidence, and review issues, but it does not bypass Studio review or the
shared publish contract.

## Required Flow

1. Provider extracts candidate passages, questions, answers, and source proof.
2. Review model records safe review issues and source fidelity signals.
3. Studio presents editable content and blocking/non-blocking issues.
4. Publish validates the Studio state and creates canonical snapshots,
   projections, runtime bridges, and MaterialSummary rows.

## Boundaries

- Provider output is not canonical runtime data until published.
- Teacher-facing review issues are owned by the Studio review issue contract.
- Hidden provenance must not enter student-safe projections or summary rows.
- Provider repair must be scoped to concrete material/import ids.

## Related Docs

- [`documentation/architecture/reading-v2-studio-review-issues-contract.md`](reading-v2-studio-review-issues-contract.md)
- [`documentation/architecture/changelog/reading-v2-auto-source-ledger-and-repair.md`](changelog/reading-v2-auto-source-ledger-and-repair.md)
- [`documentation/architecture/reading-v2-material-publish-and-passage-library.md`](reading-v2-material-publish-and-passage-library.md)
