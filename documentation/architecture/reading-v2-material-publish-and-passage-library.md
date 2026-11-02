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

## Passage Editing And Content Anchors

The rich passage editor reads and emits canonical passage blocks, including
paragraph anchors, labels, heading levels and list metadata. Plain text edits
preserve existing anchor identities; splitting or pasting creates unique
identities for new blocks. The editor must not serialize a whole passage into
one paragraph containing Markdown block markers or blank-line separators.

Deleting or merging a referenced block is rejected until its question links
are resolved. Failed editor-block validation must not silently accept the
damaged edit. The canonical guard requires each passage paragraph anchor to
identify actual passage content, so repository and publish paths enforce the
same invariant.

The shared preview/student runtime renders canonical paragraphs, headings and
lists semantically. Inline hard breaks remain inside their owning block.
Correcting existing content creates a new published version and uses the normal
publish plan for projections, packaging and catalog updates; historical attempts
retain their pinned versions.

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
