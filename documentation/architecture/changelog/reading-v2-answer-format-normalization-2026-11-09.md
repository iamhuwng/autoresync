# Reading V2 answer-format normalization

Changelog ID: `CL-20261109-READING-V2-ANSWER-FORMAT-NORMALIZATION`
Master entry: [Master Changelog](../master_changelog.md)

## Problem

Auto V4 could carry raw answer-key expressions into Studio without turning them
into the complete accepted-answer set. This was especially harmful for shared
multiple-answer prompts whose numbered boxes draw from one candidate pool. A key
such as `A/B/C`, `a,b,c`, or `a or b or c` could remain a literal answer string
instead of becoming three distinct selectable candidates.

## Change

- Added a structured `acceptedAnswers` field to the AI question contract,
  validator, and Auto V4 prompts.
- Made Reading V2 import normalization interpret separators using the task's
  printed option bank. Slash, comma, and `or` are split only for a grouped
  multiple-select answer when the resulting tokens are valid option labels.
- Preserved literal completion answers such as `1/3`, `km/h`, and ordinary
  `A/B` outside that grouped-choice context.
- Merged repeated per-number grouped answer rows into one deduplicated Studio
  candidate pool while retaining every numbered answer slot and raw source
  evidence.
- Kept grouped scoring order-independent and one-to-one: a candidate can earn
  at most one numbered slot, so duplicate student selections receive partial
  credit.

Legacy Reading remains outside this change.

## Verification

- Reading V2 normalization and answer-scoring suites: 99 tests passed.
- Auto V4 and grouped-flow suites: 50 tests passed.
- AI response-schema suite: 30 tests passed.
- ESLint passed for all changed source and test files.
- `git diff --check` passed.

Production release remains pending. The exact release block and receipts are
recorded in `documentation/release-audits/2026-11-09-reading-v2-release-blocked.md`.
