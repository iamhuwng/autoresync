# Reading V2 table-cell answer wrapping

Changelog ID: `CL-20261104-READING-V2-TABLE-CELL-WRAP`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

## Problem

Reading V2 table-completion cells preserved authored text around blank markers,
but the runtime answer control used a fixed single-line input. Longer answers
could cover surrounding text, overflow the cell, or force the question badge
onto a separate line.

## Change

The table-completion renderer now replaces each blank marker inline while
preserving the cell text. Its answer control is a content-sized textarea with
soft wrapping, and the table cell uses fixed column sizing plus normal
overflow wrapping. The question badge remains alongside the first answer line;
long answers wrap inside the same cell.

## Verification

- Reading V2 runtime focused suite: 66 tests passed.
- Touched-file ESLint passed.
- Live localhost Studio preview verified authored text, inline badge placement,
  and long-answer wrapping in the teacher preview.

Production Hosting publication and provider readback are recorded below after
the guarded deployment completes.
