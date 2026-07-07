---
title: Reading V2 Material Removal Lifecycle
description: Reading V2 PRD-0054 removal contract for master full-test soft removal, optional linked-passage archive, universal summary cleanup, legacy helper cleanup, audit events, and frozen work safety.
createdAt: '2026-06-15T00:00:00.000Z'
updatedAt: '2026-07-07T00:00:00.000Z'
tags:
  - architecture
  - reading-v2
  - prd-0054
  - teacher-materials
  - archive
  - removal
---

# Reading V2 Material Removal Lifecycle

Repo architecture mirror: `documentation/architecture/reading-v2-material-removal-lifecycle.md`.

Reading V2 master full-test removal is soft removal, not hard deletion.

Teacher Lobby delete for a Reading V2 master opens:

- `Remove master only`
- `Remove master and linked passages`
- `Cancel`

Master-only removal sets master composition/metadata state to `removed`, removes active universal MaterialSummary rows plus legacy helper rows where still present, removes legacy `/tests/{masterMaterialId}`, writes `reading_master_removed` audit, and leaves linked Reading Passages active.

Linked-passage removal archives only actor-owned linked Reading Passages through the normal Reading Passage archive service before removing the master. It blocks when any linked passage is not owned by the actor.

Universal summary and legacy helper cleanup must be idempotent for stale/missing
active rows. Owner cleanup may use canonical
`reading_v2/material_metadata/{materialId}/ownerId === auth.uid` as fallback
proof.

Removal never rewrites assignment-pinned payloads, immutable snapshots, published versions, projections, or completed results.

Obsolete as of 2026-06-15: removing a master always leaves all generated passages active. Current contract is master-only by default with explicit optional archive of owned linked passages.
