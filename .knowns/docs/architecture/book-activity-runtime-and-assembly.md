---
title: Book Activity Runtime And Assembly Architecture
description: PRD0062 planning architecture for Book Activity domain, Assembly Workspace, runtime, homework, updates, delivery, and obsolete parser boundaries.
createdAt: '2026-07-09T00:00:00.000Z'
updatedAt: '2026-07-09T00:00:00.000Z'
tags:
  - architecture
  - book-activity
  - prd0062
  - book-runtime
  - homework
---

# Book Activity Runtime And Assembly Architecture

Canonical repo source: `documentation/architecture/book-activity-runtime-and-assembly.md`.

## Current Contract

- PRD0062 extends the existing Book system; do not create an `ActivityBook` product.
- Existing Book metadata/node services remain the Book integration seam.
- Activity Material is the atomic reusable, versioned, submitted, graded, and updateable unit.
- Book Nodes store structure and references, not full Activity content.
- Placements and Page Groups bind Activities to Book context and authorized PDF pages.
- Students consume Book Delivery projections, not authoring records.
- Source PDFs are immutable private inputs; students receive authorized excerpts only.
- Book Homework uses Activity-level attempts/progress plus assignment aggregation; no whole-Book submit or aggregate Book academic grade in V1.
- Course/Class Book delivery resolves exact placement/context, never bare `materialId`.
- Book Runtime launches through the existing async student launcher pattern with one thin Book dispatch branch, then Book-owned runtime modules.
- Reading V2, Listening, Writing, THCS, Homework, Course, Class, and result contracts must not be rewritten merely to support Books.

## Obsolete For PRD0062

- New `ActivityBook` product.
- Generic Task Group or Task Set layer inside Activity.
- Teacher-editable Activity IDs, version IDs, placement IDs, source provenance, or hidden Interaction IDs.
- Whole-Book submission/result as one existing homework submission.
- Bare `materialId` Course/Class resolution.
- Semantic app guessing of `structured` versus `source-assisted`.
- Legacy PDF parser dependency: `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js`.

## Implementation Guard

Every new RTDB node, Firestore collection, R2/Worker path, route, notification, and observable user action needs rules, indexes where needed, backup coverage where needed, and tests before closure.
