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

## Publication

Guarded Hosting publication completed on 4 November 2026. Firebase Hosting
version `b7000f8f9ffb2f6e` was released at `2026-11-03T20:05:41.098Z` and the
production manifest read back source revision `c8d7793347620fbb6da1ed6671024c6525ed4f83`,
tree `aa7d7c234bdcf3bff9cea856c56c1ee31b088995`, and 459 file hashes. The
release journal is `d2d3a04b-193e-4406-9ffd-00fc4cc52dab` under the local
release store.
