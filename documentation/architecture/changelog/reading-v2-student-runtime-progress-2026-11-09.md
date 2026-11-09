# Reading V2 student runtime progress

Changelog ID: `CL-20261109-READING-V2-STUDENT-RUNTIME-PROGRESS`
Master entry: [Master Changelog](../master_changelog.md)

## Problem

The Reading V2 student runtime kept unfinished answers only in a same-browser
draft. Highlights were held in component state, table inputs could collapse to
one pixel, the desktop splitter could exceed the available width, and numeric
answer comparison removed punctuation too broadly.

## Change

- Persisted a versioned Reading V2 draft envelope containing answers, anchored
  highlights, timer start, active location, and projection identity.
- Registered Reading V2 progress with the existing student resume path and
  clear drafts only after successful trusted submission.
- Stored paragraph-relative highlight offsets so repeated text remains anchored
  after reloads.
- Restored usable table-field sizing and proportional splitter tracks.
- Tightened numeric scoring so valid thousands grouping remains accepted while
  decimal punctuation, units, and literal slash tokens remain distinct.

Cross-device synchronization and historical publication repair remain outside
this local runtime correction.

## Verification

- Focused Reading V2 runtime/import/result suites passed 212 tests.
- Adjacent shared renderer/result tests passed 30 tests.
- Touched-file ESLint passed.
- Full TypeScript checking still reports four pre-existing Listening errors;
  changed files are not among those errors.

Production release evidence is recorded by the guarded Hosting release receipt
for the exact merged revision.
