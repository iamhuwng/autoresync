# Reading V2 Material Publish And Passage Library

Status: current publish and passage-library contract. Detailed history lives in
[`documentation/architecture/changelog/reading-v2-material-publish-and-passage-library.md`](changelog/reading-v2-material-publish-and-passage-library.md).

## Publish Contract

Reading V2 publish creates or updates:

- canonical material metadata under `reading_v2/material_metadata/{materialId}`
- published snapshots and versions owned by Reading V2
- student-safe projections under `reading_v2/projections/student_safe_tests`
- review projections for teacher/result review
- runtime compatibility bridges under `/tests` when needed
- active MaterialSummary v1 rows under
  `material_catalog/material_summary_indexes/v1`

Full-test materials may reference generated Reading Passage materials. Reading
Passage materials remain passage-kind rows and must not appear in My Content.

## Listing Contract

Teacher Materials listing reads MaterialSummary v1. It must not use broad
`/tests` scans as the universal listing source.

My Content includes owned active published test-like summaries:

- Reading V2 full tests
- IELTS Writing tests
- IELTS Listening tests
- THCS/THPT tests

My Content excludes Reading Passage rows, Book rows, drafts, removed/deleted
rows, and linked/use-as-is public tests owned by other teachers.

## Reading V2 Assignment Fields

Reading V2 full-test summaries must carry list-safe readiness facts from the
published student-safe projection:

- `questionCount`
- `sourceSnapshotVersionId`
- `hasStudentSafeProjection`
- `deliveryProjectionReady`
- `studentSafeProjectionReady`
- `passageRefCount`

These fields let My Content show positive question counts and `Assign HW`
without hydrating canonical Reading V2 payloads during list rendering.

## Obsolete

- `reading_v2/listing_indexes` is compatibility-only for old QA paths.
- `material_catalog/material_indexes` is not the current Teacher Materials My
  Content authority.
- Broad `/tests` scans are legacy/runtime compatibility, not catalog listing.

## Related Docs

- [`documentation/architecture/universal-material-summary-integration.md`](universal-material-summary-integration.md)
- [`documentation/architecture/teacher-materials-listing-and-diagnostics.md`](teacher-materials-listing-and-diagnostics.md)
- [`documentation/architecture/student-test-delivery-projections.md`](student-test-delivery-projections.md)
