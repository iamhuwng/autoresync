# Reading V2 Material Removal Lifecycle

## Purpose

This document defines the current removal behavior for Reading V2 teacher materials.

It exists to avoid the drift found on 2026-06-15: legacy Teacher Lobby delete removed only `/tests/{materialId}`, leaving canonical Reading V2 master composition data and generated Reading Passage materials active.

## Master Full-Test Removal

Reading V2 master full-test removal is soft removal, not hard deletion.

Teacher Lobby delete for a Reading V2 master opens a modal with these choices:

- `Remove master only`
- `Remove master and linked passages`
- `Cancel`

`Remove master only`:

- sets `reading_v2/full_test_compositions/{compositionId}/state` to `removed`
- sets `reading_v2/material_metadata/{masterMaterialId}/state` to `removed`
- removes active universal MaterialSummary rows for the master and legacy helper
  rows where still present
- removes legacy `/tests/{masterMaterialId}` so the master no longer appears in legacy-backed Teacher Lobby lists
- writes append-only `reading_master_removed` audit event
- does not archive linked Reading Passage materials
- does not mutate assignments, frozen assignment payloads, runtime projections, immutable snapshots, published versions, or completed results

`Remove master and linked passages` first archives each linked Reading Passage that the actor owns, then removes the master as above.

Linked passage archive through this flow:

- uses the existing Reading Passage archive service
- sets the passage material state to `archived`
- removes active universal MaterialSummary rows for the passage and legacy
  helper rows where still present
- writes normal archive/audit rows
- does not delete canonical passage data, immutable snapshots, published versions, projections, assignments, or completed results

Linked passage archive is blocked when any linked passage is not owned by the actor. Super-admin-only override UI is outside V1.

Obsolete interpretation retired 2026-06-15: removing a Reading V2 master always leaves all linked generated passages active. The current contract is master-only by default, with an explicit optional archive of owned linked passages.

## Summary And Legacy Cleanup Rules

Removal and archive flows must be idempotent against stale or missing active
universal summary rows and legacy Material Catalog helper rows.

Teacher-owned cleanup of `material_catalog/material_summary_indexes/v1/*/{materialId}`
and remaining `material_catalog/material_indexes/*/{materialId}` helper rows may
use canonical Reading V2 metadata ownership as fallback proof:

```text
reading_v2/material_metadata/{materialId}/ownerId === auth.uid
```

This fallback is required because cleanup often happens after an earlier partial
delete, stale index, or missing index row. The rule must not rely only on the
row's own `ownerId` to allow delete.

The fallback does not make arbitrary material catalog deletes public. It only
allows the authenticated owner to clean up summary/helper rows for Reading V2
materials whose canonical metadata proves ownership. Super-admin behavior
remains rule-governed by the existing role branch.

## Audit And Diagnostics

State-changing removal writes belong to `reading_v2/audit_events/{eventId}`.

Feature/diagnostic actions belong to feature observability and `teacherMaterialsDiagnostics`, not a second audit path.

Expected action ids include:

- `master_delete_requested`
- `master_linked_passages_remove_requested`
- `teacher_materials_reading_master_removed`
- `teacher_materials_reading_master_and_linked_passages_removed`

Diagnostic failure event:

- `reading_v2_master_remove_failed`

## Frozen Work Safety

Removal never rewrites assignment-pinned payloads or completed result review payloads.

Existing assigned work and saved results stay available from frozen snapshots/projections. Future active-list launch and assignment from removed/archived current materials are blocked by the relevant active-list and launch guards.

## Verification Anchors

Changes touching this lifecycle must prove:

- Reading V2 master delete opens the PRD-0054 modal rather than legacy `window.confirm`
- master-only removal soft-removes the master and legacy `/tests` row
- linked-passage option archives only actor-owned linked passages
- non-owned linked passage removal is blocked
- universal summary and legacy helper stale/missing active-row cleanup is
  accepted when canonical metadata proves ownership
- append-only audit event is written for master removal
- immutable snapshots, published versions, projections, assignments, and completed results are not deleted or rewritten
- remote RTDB rules are deployed before live retry proof

## Related Docs

- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`
- `documentation/architecture/reading-v2-audit-trail.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/tasks/tasks-0054-prd-reading-passage-archive-and-master-repair.md`
