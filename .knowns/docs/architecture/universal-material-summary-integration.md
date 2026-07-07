---
title: Universal Material Summary Integration
description: Shared Teacher Materials discovery contract using MaterialSummary v1 owner/public indexes, producer registry, lifecycle synchronization, repair gates, and permission boundaries.
createdAt: '2026-07-07T00:00:00.000Z'
updatedAt: '2026-07-07T00:00:00.000Z'
tags:
  - architecture
  - teacher-materials
  - material-summary
  - firebase
  - visibility
---

# Universal Material Summary Integration

Repo source: `documentation/architecture/universal-material-summary-integration.md`.

Teacher Materials active discovery uses
`material_catalog/material_summary_indexes/v1`.

My Content reads:

```text
material_catalog/material_summary_indexes/v1/by_owner/{teacherId}
```

Public Library reads:

```text
material_catalog/material_summary_indexes/v1/by_visibility/public
```

`/tests`, `material_catalog/material_indexes`, `material_catalog/book_indexes`,
and Reading V2 relationship indexes are runtime, compatibility, archive, repair,
or feature-specific helper surfaces. They are not the universal active listing
authority.

Every supported producer needs:

- stable registry entry
- `summary-v1` contract version before claiming integration
- lifecycle summary writes for publish/update/archive/remove/restore
- rules coverage for owner/public/diagnostic buckets
- reconciliation and repair proof
- tests proving unsafe fields, malformed rows, wrong bucket writes, and missing
  producer registration fail closed

Visibility contract:

- My Content is an owner query and includes private plus public active rows
  owned by the teacher.
- Public Library is a visibility query and includes all active public summaries,
  including public rows owned by the current teacher.
- Students and unauthenticated users cannot browse Teacher Materials summary
  indexes.
- Super admin can read/write diagnostic and repair buckets.
- Public Book summary writes are admin-only across all universal summary
  buckets.

Repair contract:

- dry-run first
- reviewed report and digest
- explicit approval for live writes
- bounded multi-location update
- post-write readback and zero-op verification

2026-07-07 evidence:

- approved summary repair prewrite planned 204 operations and postwrite reported
  zero remaining operations
- approved Reading V2 `/tests` bridge repair prewrite planned 12 operations and
  postwrite reported zero remaining operations
- browser proof on `http://localhost:5173/lobby` rendered My Content, Public
  Library, Reading Passage, and Book tabs without permission errors or fake
  empty states
