---
title: Teacher Material Visual Taxonomy
description: 'Canonical Teacher material leading-icon and accent taxonomy: semantic visual kinds, marker/action separation, forbidden positional colors, and change protocol.'
createdAt: '2026-05-30T15:07:50.791Z'
updatedAt: '2026-05-30T15:07:50.791Z'
tags:
  - architecture
  - teacher-lobby
  - materials
  - visual-taxonomy
  - icons
---

# Teacher Material Visual Taxonomy

## Purpose

Teacher material surfaces need one stable visual language for the leading material marker.

The marker at the beginning of a material row or card is not an action. It is a compact type/status signal that helps teachers scan mixed material lists without reading every badge.

Repo architecture mirror: `documentation/architecture/teacher-material-visual-taxonomy.md`.

## Runtime Owner

- `src/components/modern/materialVisualTaxonomy.js`
- `src/components/modern/materialListAdapter.js`
- `src/components/modern/MaterialListRow.jsx`
- `src/components/modern/MaterialListRow.css`

`materialVisualTaxonomy.js` owns semantic mapping. Row/card components only render the resolved `iconKind` and `accentKind`.

## Meaning Split

Keep these channels separate:

- left icon: material type or blocking status
- accent color: material family or blocking status
- badges: exact metadata such as item count, exam, grade, skill, duration, or completeness
- action icons: operations such as edit, delete, start, clone, or assign

Do not use the left icon for operations. Do not use row order to choose accent color.

## Current Taxonomy

| Visual kind | Applies when | `iconKind` | `accentKind` |
| --- | --- | --- | --- |
| `thcs` | `testType === "THCS-THPT"` | `school` | `sky` |
| `readingV2` | `deliveryEngine === "reading-v2"` | `reading` | `rose` |
| `ieltsReading` | IELTS material with `skill === "Reading"` | `reading` | `rose` |
| `ieltsWriting` | IELTS material with `skill === "Writing"` | `writing` | `lavender` |
| `genericTest` | fallback tests and unclassified material | `test` | `indigo` |
| `draft` | future draft list/card support | `draft` | `peach` |
| `incomplete` | `isComplete === false` | `incomplete` | `incomplete` |

`incomplete` overrides material family because it is a blocking status.

## Rendering Contract

The Teacher Lobby list view currently renders:

- a `5px` accent strip
- a fixed `44px x 44px` icon tile
- a `20px` icon inside the tile
- variant-tinted tile color and border

These dimensions are part of the compact scan contract. Do not let icon choice resize the row, column, or row height.

## Forbidden Patterns

- positional accent rotation based on row index
- `HomeIcon` or other place/navigation icons for school/test categories
- action icons in the leading material slot
- new per-component icon mapping that bypasses `materialVisualTaxonomy.js`
- using badge text as the only material-family signal when the surface has a leading marker

## Change Protocol

When adding a new material family:

1. Add a new visual kind to `MATERIAL_VISUAL_KIND`.
2. Update `resolveMaterialVisualKind`.
3. Add or reuse one row icon in `MaterialListRow.jsx`.
4. Add CSS for the new `accentKind` if it is new.
5. Add adapter or taxonomy tests that prove the mapping is semantic and stable across row order.
6. Update this document.
