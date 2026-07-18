> **APPROVED AMENDMENT / ACTIVE CONFLICT AUTHORITY**
>
> Verbatim recovered body from Git object `043a6d9b1f96a76f200ea753ca353e0376be65a7:documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md`. It is PRD0062b conflict authority; active execution mapping lives in this directory.

# Approved Amendment: Book-Based Interactive Activity Runtime and Assembly Workspace

## 0. Authority

**Status:** Approved implementation amendment

**Approved date:** 2026-07-09

**Applies to:** `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

This amendment is part of the PRD contract. Where this amendment conflicts with the original PRD, this amendment wins for implementation planning and task generation.

The product architecture remains approved:

```text
Book = existing container
Activity = first-class reusable playable material
Placement = Book/Course/Homework context
Source PDF = immutable source context
Runtime = shared Activity renderer
Homework = frozen assignment manifest with Activity-level bindings
```

The implementation plan is not approved as one branch. The feature MUST be split into release packets with explicit storage, rules, UI, migration, and test contracts before coding.

---

## 1. Required implementation guardrail

Add this guardrail to the top-level PRD interpretation:

```text
This PRD is the full product contract, not one implementation packet.
Codex MUST NOT implement all phases in one branch.
Each implementation packet MUST define:
1. storage contract;
2. security/rules contract;
3. UI contract;
4. test contract;
5. migration/compatibility check;
6. browser/runtime proof where applicable.
```

A packet is not complete merely because UI plumbing renders. It must prove that existing Book, Material Catalog, homework, result, Course/Class, Reading V2, Listening, Writing, THCS, and student-runtime behavior remain intact.

---

## 2. Release cut line

The original PRD's full V1 scope is approved as the product destination, but the first shippable pilot MUST be narrower.

### 2.1 Foundation/Pilot release

The first shippable pilot is:

```text
- central Material Capability Registry;
- `interactive-activity` material kind;
- typed Activity schema and validation;
- `unit` Book node support;
- Activity JSON validation and draft/published version contract;
- Source Version metadata and immutable upload contract;
- Manifest Version and Page Group import contract;
- Book Assembly Workspace for one Unit at a time;
- source/page mapping repair for Placement/Page Group metadata;
- student-safe Activity projection;
- split Activity runtime for Solo/preview delivery;
- server-backed autosave;
- Activity-level submission/result for the pilot surface;
- regression proof that old test-based Books still work.
```

### 2.2 Not in the first pilot

The following MUST NOT be hidden inside the first pilot:

```text
- whole-Book homework;
- structural-subtree homework;
- selective active-homework update;
- review checkpoints;
- nested deadline mutation workflows;
- Course/Class delivery;
- public playable source-assisted Books;
- anti-cheat default-on rollout;
- notifications for update cases;
- live/proctored Book sessions.
```

These remain part of the product contract but require later packets.

---

## 3. Required implementation packets

Split work into at least these packets:

```text
1. Activity material foundation and capability registry
2. Book unit/page/source assembly foundation
3. Student Activity runtime and autosave/submission
4. Book homework bundle model
5. Result/review/integrity integration
6. Selective updates/checkpoints/notifications
7. Course/Class placement integration
8. Public Library and source-rights publication
```

No later packet may start until the previous packet's data contracts and negative tests are stable enough to build on.

---

## 4. Repository-specific hard requirements

### 4.1 `interactive-activity` material kind

`interactive-activity` MUST be added centrally before it appears in UI flows.

Required changes include:

```text
- MaterialCatalogMaterialKind;
- material kind taxonomy;
- Material Producer Registry or replacement producer contract;
- Material Capability Registry;
- Test Type allowedMaterialKinds;
- material summary/index generation;
- Book refs;
- Book editor picker/index loading;
- student launch routing;
- homework assignment gates;
- result ownership/visibility;
- security rules and negative tests.
```

Do not scatter checks like:

```ts
kind === 'interactive-activity'
```

across callers. Use a central capability registry with at least:

```ts
interface MaterialCapabilityEntry {
  materialKind: MaterialCatalogMaterialKind;
  playable: boolean;
  assignable: boolean;
  embeddableInBook: boolean;
  gradable: boolean;
  supportsSourceContext: boolean;
  supportsPlacementScopedProgress: boolean;
  launchAdapterId?: string;
  assignmentAdapterId?: string;
  resultAdapterId?: string;
  projectionAdapterId?: string;
}
```

### 4.2 `unit` Book node support

Adding `unit` is not only a type-union change.

Required updates:

```text
- add `unit` to MATERIAL_BOOK_NODE_TYPES;
- add `unit` to structural node status/readiness logic;
- add `unit` to BookEditorWorkspace action icons/actions;
- add `unit` to BookNodeTree labels/actions/root or child menus as appropriate;
- update validation fixtures and regression tests;
- prove legacy `test` nodes remain valid;
- prove Books made only of Unit nodes can become `ready` when otherwise valid.
```

### 4.3 Book editor candidate loading

Current Book editor support is effectively limited to existing test/passage material kinds. Activity integration MUST update candidate index filtering and assignment branching through capability checks, not through another hardcoded set.

Book attachment and assignment actions MUST distinguish:

```text
- attachable into Book tree;
- playable from Book runtime;
- assignable as standalone material;
- assignable only as part of Book subtree;
- repair-only replacement candidate.
```

### 4.4 `bookEditor.service.ts` type safety

No new Activity placement/source/page-group logic may be added to `bookEditor.service.ts` while relying on `// @ts-nocheck`.

Allowed paths:

```text
- remove `// @ts-nocheck` and fix types before extending it; or
- keep existing legacy service stable and add new fully typed Book Activity services beside it.
```

---

## 5. Homework model amendment

Book Homework MUST NOT be represented as a hidden variation of the existing one-material homework/submission model.

Required discriminator:

```ts
assignmentKind: 'book_activity_bundle'
```

or an equivalently explicit top-level discriminator.

A Book assignment MUST store:

```text
- assignment-level shell;
- selected Book/subtree context;
- frozen structural outline;
- ordered Activity bindings;
- placement IDs;
- pinned Activity version IDs;
- pinned Source Version IDs;
- schedule rules;
- required/excluded state;
- per-student effective deadlines;
- per-student Activity attempts;
- completion aggregation;
- review/checkpoint metadata when later packets add it.
```

The existing `HomeworkSubmission.percentage` field MUST NOT be filled with Book completion percentage. Completion percentage and academic score percentage are different meanings.

Display rule:

```text
Book Homework list: show completion %, not score %.
Teacher detail: show required Activities submitted / total, pending review count, and per-Activity scores.
Academic record: show Activity attempts; do not show aggregate Book grade.
```

---

## 6. Activity attempts and result visibility

Activity attempts need a first-class model. Do not force them into test-shaped result records without a formal adapter.

Minimum attempt identity:

```text
studentId
activityId
activityVersionId
attemptId
surface
placementId or deliveryContextId
assignmentId/courseMaterialId where applicable
createdAt/submittedAt
visibility owner context
```

Student UX may group attempts by:

```text
studentId + activityId
```

Teacher queries MUST be visibility-scoped:

```text
studentId + activityId + permitted teacher-owned surfaces only
```

Teachers MUST NOT see private Solo attempts unless the attempt was created through a teacher-owned Homework, Course, Class, or future Live context.

---

## 7. Placement-scoped completion rule

The same Activity may appear more than once in one Book or in multiple Course/Homework placements.

Assigned completion MUST be placement-scoped:

```text
studentId + assignmentId/courseMaterialId + placementId + activityId + activityVersionId
```

Solo/library result grouping MAY group by `studentId + activityId`, but that MUST NOT silently complete assigned work elsewhere.

No placement may satisfy another placement unless an explicit product rule is added and tested.

---

## 8. Course/Class integration amendment

Course/Class delivery MUST NOT use materialId-only resolution.

Required Course/Class binding dimensions:

```text
courseMaterialId
courseId
moduleId
bookId
bookNodeId or subtree stable key
placementId
activityId
activityVersionId
sourceVersionId
bindingRevision
progress policy
```

Course progress for Book Activities MUST be Activity/placement-level, not one `completedMaterials[materialId]` aggregate for the whole Book.

Course/Class support remains out of the first pilot and may begin only after Solo and Book Homework attempt semantics are stable.

---

## 9. Anti-cheat / integrity amendment

Book Homework integrity MUST NOT reuse auto-submit-capable presets directly.

Required adapter:

```ts
interface BookIntegrityConfig {
  enabled: boolean;
  recordTabSwitch: boolean;
  recordWindowBlur: boolean;
  recordRouteExit: boolean;
  recordReloadOrClose: boolean;
  recordPaste: boolean;
  recordCopyWhereReliable: boolean;
  recordFocusModeExit: boolean;
  focusModeRequired: boolean;
  studentWarningsEnabled: boolean;
  severityPolicy: 'signals-only-v1';
}
```

If existing detection hooks are reused, the Book adapter MUST force:

```ts
enableAutoSubmit = false;
nullifyRemainingAttempts = false;
```

Required test:

```text
Book Activity integrity events never auto-submit, auto-lock, auto-zero, nullify attempts, or block completion.
```

UI language MUST say:

```text
recorded events
integrity signals
```

It MUST NOT claim:

```text
cheating proven
cheat-proof
proctored exam guarantee
```

Default-on is changed to:

```text
Default ON for accountable homework mode.
Default OFF for practice homework mode.
Teacher must choose assignment intent: Practice or Accountable.
```

---

## 10. Source-assisted accessibility amendment

Source-assisted Activities MUST include minimum accessible metadata. The PDF may carry the essential visual layout, but the answer controls must be understandable without full PDF transcription.

Minimum fields per interaction:

```json
{
  "label": "1.3",
  "accessiblePrompt": "Answer the blank labelled 1.3 on the left page.",
  "responseShape": "short-text",
  "sourceExerciseLabel": "Exercise 2",
  "sourcePartLabel": "B"
}
```

`sourceExerciseLabel` and `sourcePartLabel` are recognition metadata only. They MUST NOT create a second Activity ordering system.

---

## 11. PDF delivery spike requirements

A technical spike is required before implementation of source PDF delivery.

The spike MUST test:

```text
- password-protected PDFs;
- corrupted PDFs;
- scanned/image-only PDFs;
- rotated pages;
- landscape pages;
- mixed page sizes;
- large files;
- wrong page count;
- printed page label mismatch;
- answer key accidentally included in selected range;
- slow extraction;
- idempotent retries;
- temporary object cleanup;
- signed URL expiry during student runtime;
- student refresh after URL expiry;
- R2 private input/output behavior;
- local and deployed authorization tests.
```

The product statement must be explicit:

```text
The app can avoid delivering the full source PDF.
It cannot prevent screenshots or local saving of delivered excerpts.
```

---

## 12. Public Library amendment

Public Book publication must validate source-rights status.

Allowed public states:

```text
1. metadata-only public;
2. public tree/refs with runtime blocked;
3. playable public with approved source excerpt rights.
```

If source excerpt rights are not approved, public projection MAY show metadata and structure but MUST block runtime launch and source-assisted PDF excerpt delivery.

Public Book projection must not expose private source PDFs, answer keys, teacher notes, or authoring records.

---

## 13. Update, autosave, and revision edge cases

### 13.1 Autosave/update race

Every autosave MUST include:

```text
studentId
activityId
activityVersionId
placementId
deliveryContextId
assignmentBindingRevision
attemptId
clientDraftRevision
```

Server must reject stale autosave into a newer binding. Client must preserve old work and reload the new binding explicitly.

### 13.2 Deadline replacement per student

When an update adds or redo-requires work after a deadline, replacement deadline checks must use each student's effective deadline, including personal extensions and exemptions.

Affected Homework Review must show how many students need a replacement deadline.

### 13.3 Feedback correction visibility

If old feedback or correct answers were already visible to a student, a regrade-only answer-key correction must leave an audit-visible correction note. Do not silently rewrite what the student saw.

### 13.4 Removed Activity with pending review

If a removed Activity has pending teacher review:

```text
- remove it from current workload counts;
- keep the attempt in historical/excluded view;
- preserve existing teacher feedback;
- mark it excluded by update/removal.
```

### 13.5 Source PDF replacement without Activity JSON changes

If `presentationMode = source-assisted` and page labels, page count, or visual page mapping changes, teacher preview approval is required even when stable Activity keys still match.

### 13.6 Presentation mode correction path

V1 correction path for incorrect `presentationMode` is JSON re-import only.

The workspace may repair Placement/Page Group metadata, but it must not override semantic `presentationMode` in UI.

---

## 14. Storage design packet requirement

Before coding starts, produce a storage-design packet covering:

```text
activity materials
activity drafts
activity candidates
activity versions
student-safe projections
source versions
manifest versions
page groups
placements
book homework manifests
activity attempts
autosave drafts
review checkpoints
integrity logs
update audit records
notification records
public projections
```

For each store/path, define:

```text
- owning service;
- immutable fields;
- mutable fields;
- indexes/query dimensions;
- read/write authority;
- student-safe projection boundary;
- migration behavior;
- deletion/archive behavior;
- negative security tests.
```

---

## 15. Required regression gates

Each implementation packet must include regression tests proving:

```text
- old test-based Books still validate and publish;
- `unit` Books can become ready;
- existing Reading V2, Listening, Writing, THCS launches still route correctly;
- Book refs do not expose drafts or missing projections;
- Book public projection does not leak private refs or source PDFs;
- Book Homework does not write completion percent into score percent;
- Solo attempts are not teacher-visible unless teacher-owned context created them;
- placement A completion does not satisfy placement B;
- stale autosave cannot overwrite newer assignment binding;
- Book integrity cannot auto-submit or nullify attempts.
```

---

## 16. Final approved direction

Approved:

```text
- one generic `interactive-activity` material kind;
- one Activity runtime;
- existing Book as container;
- source-assisted and structured presentation modes;
- placement-scoped delivery;
- frozen Book Homework manifests;
- selective updates in later packet;
- Course/Class integration only after Solo/Homework semantics stabilize.
```

Not approved:

```text
- one mega-branch implementation;
- shallow UI-only plumbing;
- material-kind hardcoding across callers;
- Book Homework squeezed into one existing HomeworkSubmission;
- auto-submit anti-cheat for Book Activities;
- Course access by materialId alone;
- public source-assisted runtime without source-rights approval;
- adding Activity placement logic into untyped legacy code without a typed boundary.
```
