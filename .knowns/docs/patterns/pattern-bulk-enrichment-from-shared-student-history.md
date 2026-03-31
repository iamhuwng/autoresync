---
title: 'Pattern: Bulk Enrichment From Shared Student History'
description: 'Canonical student-view enrichment pattern: fetch shared history once, build an in-memory index, and join secondary state locally instead of issuing per-item lookups.'
createdAt: '2026-03-30T23:50:55.638Z'
updatedAt: '2026-03-31T00:26:19.051Z'
tags:
  - pattern
  - student
  - data-loading
  - performance
  - enrichment
---

# Pattern: Bulk Enrichment From Shared Student History

## Purpose

Use this pattern when a student list needs to merge a base catalog with student-specific progress, attempts, or history.

The base data and the student history are fetched once. Enrichment happens in memory.

## Problem This Prevents

The anti-pattern is per-item enrichment:
- fetch materials
- loop over each material
- perform one history lookup per material
- combine results after N additional network reads

That pattern looks harmless with a tiny dataset, but it scales poorly and makes every new card or section more expensive.

## Canonical Rule

When a list surface needs secondary student history:
- fetch the base list once
- fetch the relevant student history once
- build a local map keyed by the join field
- enrich the list in memory
- reuse the shared history result for filters, tabs, and widgets on the same surface

## Good Shape

```ts
async function getLibraryItems(studentId: string) {
  const [materials, resultSummaries] = await Promise.all([
    getVisibleLibraryMaterials(),
    getStudentResultSummaries(studentId),
  ]);

  const historyByMaterialId = new Map<string, StudentResultSummary[]>();

  for (const summary of resultSummaries) {
    const materialId = summary.materialId;
    if (!materialId) continue;

    const bucket = historyByMaterialId.get(materialId) ?? [];
    bucket.push(summary);
    historyByMaterialId.set(materialId, bucket);
  }

  return materials.map((material) => ({
    ...material,
    history: historyByMaterialId.get(material.id) ?? [],
  }));
}
```

Why this is correct:
- network cost is bounded
- enrichment is predictable
- future widgets can reuse the same indexed history

## Bad Shape

```ts
const enriched = await Promise.all(
  materials.map(async (material) => {
    const history = await getStudentResultsForMaterial(studentId, material.id);
    return { ...material, history };
  })
);
```

That shape creates an N+1 query pattern. It should be treated as a defect in student list surfaces.

## Additional Guidance

Use this pattern together with the summary-first/detail-on-demand governance pattern:
- enrich from summaries for the list surface
- fetch full detail only when the user opens an item

If a shared shell or page host already owns the history dataset, reuse that owner instead of refetching it in a child surface.

## Review Checklist

Block the change if any answer is "yes":
- Does enrichment happen inside `array.map(async ...)` with one fetch per item?
- Does each card or section trigger its own history read?
- Is the same student history fetched separately for adjacent widgets on the same page?
- Could one bulk history fetch and a local map replace the current design?

## Related Docs

- @doc/patterns/pattern-student-shell-single-data-owner
- @doc/architecture/student-shell-right-rail-architecture
- @doc/architecture/academic-record/academic-record-page-architecture


## Current Repo Anchor

As of 2026-03-31, the student library follows this pattern in `materialDiscoveryService`.

Current implementation shape:
- fetch the visible materials list
- fetch the student's canonical self-study result history once
- build one `materialId -> studentHistory` map in memory
- enrich all library cards from that map instead of issuing one history lookup per material

This is the canonical reference path for future student list surfaces that need card-level history or progress enrichment.
