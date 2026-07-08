# Book Activity Runtime And Assembly Architecture

Status: Planning architecture
Created: 2026-07-09
Scope: PRD0062 Book-based interactive Activity runtime, Book Assembly Workspace, Book Homework, and cross-feature delivery

## Purpose

This document is the durable architecture authority for PRD0062 implementation planning.

It converts the PRD and packet task lists into stable system boundaries so future implementation does not have to reconstruct the feature shape from task prose. It is not evidence that the feature is implemented.

Primary requirement source:

- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Implementation orchestration:

- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`
- `documentation/tasks/PRD0062/findings-book-activity-baseline.md`

## Product Boundary

Book Activity extends the existing Book system. It must not create a second `ActivityBook` product, a separate Book runtime family, or a parallel content catalog.

The canonical student experience is:

```text
immutable source PDF excerpt
  + Book content tree and placement/page-group manifest
  + versioned JSON Activity Materials
  -> Book Delivery projection
  -> Book Runtime with PDF/context on the left and Activity work on the right
```

The existing Book editor remains the Book authoring shell. PRD0062 adds an Assembly Workspace capability to that Book system; it does not replace the modal shell contract in `documentation/architecture/book-editor-authoring-modal-architecture.md`.

## Domain Model

- Book remains the ordered learning container.
- Book Node remains structural. PRD0062 adds `unit` support while preserving legacy `section`, `chapter`, `test`, and placeholder behavior.
- Activity Material is the atomic reusable, versioned, submitted, graded, and updateable unit.
- Placement positions one Activity Material version inside a Book, Unit, Course/Class placement, or future composition context.
- Page Group maps authorized PDF pages to one or more Activity Placements, or marks pages reference-only.
- Source Version is one immutable uploaded PDF and its delivery metadata.
- Manifest Version is one immutable imported Book structure/page mapping description.
- Activity Revision is one immutable published Activity version under the same Activity id.
- Assignment Manifest freezes Book nodes, Activity versions, page/source bindings, and schedule rules for one homework assignment.
- Review Checkpoint is a student-specific review-only record for old work affected by one explicit update action.

Display order is never identity. Activity ids, version ids, placement ids, source ids, owner ids, provenance, and publish timestamps stay outside editable Activity JSON.

## Activity Contract

One generic Activity has:

- one coherent interaction family;
- one shared answer rule;
- optional namespaced `taskProfile`;
- `structured` or `source-assisted` presentation mode;
- `none`, `optional`, or `required` context requirement;
- local embedded stimulus or existing asset refs where needed;
- hidden app-managed Interaction IDs for autosave, scoring, regrading, and result replay.

V1 supported interaction families are:

- `choice`
- `text-entry`
- `matching`
- `ordering`
- `long-response`

Activity JSON must not contain `activityId`, `materialId`, `versionId`, `placementId`, `bookId`, `nodeId`, owner identity, source provenance, publish timestamps, or hidden Interaction IDs.

## Storage And Ownership Boundaries

Exact paths are implementation-owned by PRD0062 Packet 1 and Packet 0 findings, but these ownership rules are fixed:

- existing `material_catalog` Book services remain Book metadata and node integration seams;
- new Activity schema, candidate, draft, publish, projection, diff, scoring, and delivery logic belongs under a Book Activity-owned module;
- Book nodes store structure and refs, not full Activity content;
- student runtimes consume Book Delivery projections, not authoring records;
- source PDFs are private immutable inputs; students receive only authorized excerpts;
- Book Homework uses Activity-level submission/progress plus assignment aggregation, not one whole-Book submission;
- Course/Class delivery resolves exact placement/context, never ambiguous bare `materialId`;
- result attempts group by student plus Activity identity with attempt dropdowns while visibility remains context-scoped.

Every new RTDB node, Firestore collection, R2/Worker path, route, notification, and observable action needs rules, indexes where needed, backup coverage where needed, and tests before implementation can close.

## Source PDF Delivery

Book Activity must deliver only authorized page excerpts for the current Unit or delivery context.

Allowed:

- private source upload;
- immutable Source Versions;
- authorized Unit/page excerpt generation;
- runtime single-page navigation over permitted pages;
- reference-only pages where no Activity response is expected.

Forbidden:

- exposing the full source PDF to students;
- exposing answer-key pages, teacher notes, authoring data, source provenance, or full diff payloads;
- using screenshot/browser proof as substitute for security, rules, or Worker authorization tests.

## Runtime Boundary

`StudentPracticePage` remains the shared asynchronous launcher pattern. Book may add one thin dispatch branch, then hand off to Book-owned delivery/runtime modules.

Book Runtime owns:

- Book Delivery access resolution;
- pinned Activity and Source versions;
- page/source projection;
- schedule state;
- autosave/reload restoration;
- Activity submission and review;
- mobile tab state;
- desktop split view state.

Book Runtime must not accumulate Homework, Course, Class, Solo, or Live access rules directly. Those rules resolve into Book Delivery projections before runtime.

Book Live Session execution is not part of V1. V1 may prepare data contracts for future Live integration only.

## Homework And Update Boundary

Book Homework can assign a whole Book or eligible subtree. The assignment pins Activity versions and Source versions independently.

Rules:

- no whole-Book submit action;
- no aggregate Book academic grade in V1;
- required final deadline plus optional inherited nested deadlines;
- Open and Scheduled access modes;
- Activity-level attempts, completion, integrity events, and feedback gates;
- explicit teacher review before active homework adopts published changes;
- no silent update of assigned work;
- affected old work preserved in Review Checkpoints;
- unchanged work remains valid;
- redo boundary is the Activity.

Book Homework anti-cheat/integrity mode is on by default, can be disabled only through explicit casual-practice setting, warns and records events, never blocks completion or force-submits, and appears to teachers after submission rather than as live monitoring in V1.

## Cross-Feature Boundary

Book Activity may reuse existing features only through stable unchanged interfaces or Book-owned adapters.

It must not refactor Reading V2, Listening, Writing, THCS, Homework, Course, Class, or result storage merely to support Books.

Reading V2 Task Groups remain Reading V2 concepts. Listening audio/navigation remains Listening-owned. Existing result visibility remains governed by result visibility architecture and receives Book Activity attempts through context-scoped ownership inputs.

## Obsolete Interpretations

Treat these as obsolete for PRD0062:

- "Book Activity should use a new `ActivityBook` product."
- "Existing Book `test` nodes are enough; no `unit` node support is needed."
- "One whole-Book homework submission can represent all Activity work."
- "Course/Class Book access can resolve by bare `materialId`."
- "Activity JSON should expose stable ids for teachers to reconcile."
- "The app should infer source-assisted versus structured presentation semantically."
- "Book Activity should import, call, extend, or depend on the legacy PDF parser."
- "Book Activity implementation may rewrite Reading V2 or Listening contracts to get shared pieces."
- "Source PDF delivery can be validated by browser screenshots instead of negative authorization tests."

## Retired Parser Boundary

The following parser path is obsolete for Book Activity:

- `src/services/file-extractor/file.extractor.ts`
- `src/parsers/pdfParser.js`

These files may remain for unrelated legacy flows until separately retired. Any PRD0062 implementation path that imports, calls, extends, wraps, or depends on them must stop.

## Related Docs

- `documentation/architecture/book-editor-authoring-modal-architecture.md`
- `documentation/architecture/student-test-delivery-projections.md`
- `documentation/architecture/course-class-management.md`
- `documentation/architecture/result-visibility-ownership-governance.md`
- `documentation/architecture/result-view/visibility-policy.md`
- `documentation/architecture/upload-storage-authority.md`
- `documentation/rules/announcements.md`
- `documentation/rules/observability.md`
- `documentation/rules/infrastructure.md`
