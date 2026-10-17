# PRD0062 Gate 0 Decision/Provenance Record - Component Combination

Decision date: 2026-09-14
Authority: user-approved PRD0062 Component-PDF recovery plan
Status: `DORMANT_AFTER_CODE_RESET`

## Approved component-combination decision

For `component_pdfs`, each uploaded component PDF remains an immutable private
authoring Source Version with its own identity, ownership, order, and local
page numbering. The teacher flow composes the components into exactly one
immutable student-safe Source Version classified as `student-document`.

The student receives exactly one opaque resource for that complete document.
Private component objects, provider identities, and storage authority are
never student-facing. Component mode remains `component_pdfs`; it must never
silently switch to `full_pdf`.

Reorder or replacement creates a new combined student document. Existing
assignments, publications, attempts, saved answers, and results stay pinned to
their predecessor unless a separately authorized successor/update operation
explicitly changes the selected context.

This decision preserves the existing privacy, entitlement, immutable-version,
one-document, no-rendition, and no-Browser-Run boundaries. It does not
reactivate PRD0062b execution; its status remains `DORMANT_AFTER_CODE_RESET`.

## Recovery archive and count correction

`763954be41cbe21a54061fb70fba005ced7173cf` is the portable archive-integrity
anchor for the checked-in PRD0062b recovery snapshots. It does not
independently re-prove the missing
`9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd` origin.

The corrected observed archive/current canonical counts are **748 total / 246
checked / 502 open**. The existing `748 total / 247 checked / 501 open` line at
`documentation/tasks/PRD0062b/authority-and-provenance.md:126` is stale dated
summary evidence. That historical line and all active Component taskboxes
remain unchanged.

## C07 wording reconciliation

The corrected contract is proof of one complete pinned student-safe document
and one opaque document resource. The old one-page wording remains open/PARTIAL
dormant history, including the existing C07 `1.4` classification note at
`documentation/tasks/PRD0062b/tasks-book-activity-07-cross-feature-delivery-results.md:222`.
The active Component task body is intentionally not edited by this Gate 0
record; the canonical override reference and this record provide the current
authority pointer.

## Evidence boundary and non-authorization

This is an authority/provenance record only. It does not claim implementation,
browser, Worker, emulator, deployment, remote, protected-state, cleanup,
commit, push, staging, or task-closure proof.
