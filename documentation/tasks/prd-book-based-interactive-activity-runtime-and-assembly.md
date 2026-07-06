# PRD: Book-Based Interactive Activity Runtime and Assembly Workspace

## 0. Document authority

**Status:** Product and architecture requirements draft

**Decision date:** 2026-07-04

**Primary discussion record:** Codex session `019f2325-1297-7461-b287-938fd0a68be0`

**Baseline decision file:** `C:/Users/The Lord/Downloads/Documents/book-based-interactive-activity-master.md`

This PRD is the current source of truth for the feature discussed in the session above. It incorporates the baseline decision file and all later accepted corrections. Where this PRD conflicts with the baseline decision file or an earlier proposal in the session, this PRD wins.

This revision also incorporates the continued schema grilling after the first PRD draft. In particular, it replaces the temporary generic Task Group/Task Set proposal with one atomic generic Activity model. Existing Reading V2 and Listening concepts remain prior art and independent feature contracts; they are not replaced or modified by this PRD.

This is a requirements document, not evidence that the feature is implemented. Every storage path, security rule, backend extension, route, and UI action named here must still be implemented and verified.

Normative words:

- **MUST** means required for the release described.
- **MUST NOT** means prohibited.
- **SHOULD** means expected unless a documented technical constraint justifies another implementation.
- **MAY** means optional.

---

## 1. Product intention

The product must turn real grammar, vocabulary, workbook, and practice books into structured, interactive learning material without creating custom React code for every book or copying the PDF into editable app content.

The core experience is:

```text
Immutable source PDF
        +
Book Content Tree and page/activity manifest
        +
JSON-defined Activity Materials
        ↓
Existing Book system
        ↓
Student runtime:
read-only Book page on the left
interactive Activity work on the right
```

The teacher must be able to:

1. assemble a Book from a PDF, a manifest, and Unit Activity JSON;
2. validate and preview the exact student experience;
3. publish Units incrementally;
4. assign a whole Book or an eligible structural subtree as homework;
5. set optional deadlines and release dates inside that homework;
6. revise an individual Activity by importing replacement content JSON;
7. review which active homework is affected by a published change;
8. apply updates selectively so students redo only the smallest necessary Activity;
9. preserve previous student work as a review-only record when redo is required.

The student must be able to:

1. open only the Book pages authorized for the current Unit;
2. use deterministic page navigation;
3. complete mapped Activities without losing answers;
4. submit each Activity independently;
5. see Book-homework progress as an aggregation of required Activities;
6. review preserved previous-version work after a teacher update;
7. receive a persistent, case-specific notification when an update affects them.

The foundation must also support future composition. A future lesson or test builder must be able to browse:

```text
Book → Section/Chapter/Unit → Activity Material
```

and select or drag a structured subtree or individual Activity without knowing database paths or duplicating content.

---

## 2. Current repository baseline

The feature MUST extend the existing Book, Material Catalog, homework, notification, result, and student runtime systems. It MUST NOT create a second `ActivityBook` product.

### 2.1 Existing Book and Material Catalog

Current relevant code:

- `src/types/materialCatalog.types.ts`
  - already declares `grammar-worksheet` and `vocabulary-set`;
  - already models `MaterialBookMaterialRef` with `materialId`, `snapshotVersionId`, order, availability, and update state;
  - currently supports Book node types `section`, `chapter`, `test`, and placeholders;
  - does not yet declare `unit`.
- `src/services/materialCatalog/materialBooks.service.ts`
  - reads and writes existing Book metadata and nodes under `material_catalog`;
  - supports empty Book drafts.
- `src/services/materialCatalog/bookEditor.service.ts`
  - owns Book node operations;
  - enforces `BOOK_NODE_MAX_DEPTH = 5`.
- `src/services/materialCatalog/bookValidation.service.ts`
  - is an existing validation seam to extend, not bypass.
- `src/components/books/CreateBookModal.tsx`
- `src/components/books/BookEditorModal.tsx`
- `src/components/books/BookEditorWorkspace.tsx`
- `src/components/books/BookNodeTree.tsx`
- `src/components/books/BookMaterialPicker.tsx`
- `src/routes/teacherRoutes.tsx`
  - mounts `/teacher/materials/books/:bookId`.
- `src/config/featureRegistry.ts`
  - already registers the Book editor route.

Existing material kinds are declarations, not proof of complete runtime support. Implementation must audit and complete listing, authoring, publish, projection, picker, assignment, launch, result, and security support for whichever Activity material kinds are selected.

### 2.2 Existing homework model

Current relevant code:

- `src/types/homework.types.ts`
  - supports one assignment-level `availableFrom`;
  - supports one assignment-level `dueDate`;
  - supports per-student due-date overrides;
  - does not support nested Book schedules;
  - primarily assumes one material, with Reading Passage sets as prior multi-item art.
- `src/services/homeworkManager.ts`
- `src/components/homework/HomeworkCreateModal.tsx`
- `src/pages/TeacherHomeworkDetailPage.tsx`
- `src/pages/StudentHomeworkListPage.tsx`
- `src/pages/StudentHomeworkDetailPage.tsx`
- `src/pages/StudentPracticePage.tsx`

The Book homework model therefore requires an explicit bundle/manifest contract. It cannot be implemented as a hidden variation of one-material homework.

### 2.3 Existing version and update patterns

Relevant prior art:

- `src/services/courseSyncService.ts`
- `src/services/materialLinkManager.ts`
- `src/services/reading-v2/readingV2PassageHomework.service.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`
- `documentation/architecture/student-test-delivery-projections.md`
- `documentation/architecture/course-class-management.md`
- `documentation/architecture/reading-v2-material-publish-and-passage-library.md`

Required inherited principles:

- assigned work is pinned to published versions;
- source edits do not silently mutate active homework;
- updates are explicit and diff-driven;
- historical results remain reproducible;
- student runtimes consume student-safe projections, not authoring records.

Book homework extends those principles with per-Activity version bindings and selective update behavior.

### 2.4 Existing notifications and user-action announcements

Relevant code:

- `src/types/notification.types.ts`
- `src/services/notificationService.ts`
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationPanel.tsx`
- `documentation/rules/announcements.md`

Persistent student notifications and transient action announcements have different jobs:

- the Notification Bell record tells the student what changed and what action is required;
- the shared bottom-right announcement confirms a teacher action succeeded or failed;
- a toast MUST NOT substitute for the persistent student notification.

### 2.5 Existing navigation/runtime references

Relevant code:

- `src/components/test/QuestionNavigator.tsx`
- `src/components/practice/ListeningPracticeView.tsx`
- `src/components/reading-v2/runtime/`
- `src/pages/StudentPracticePage.tsx`

`QuestionNavigator` is prior art for the sticky pill navigator. Its behavior and visual language should be generalized for Activity labels and questions; the new feature should not blindly duplicate or tightly couple itself to an IELTS-only component.

### 2.6 Existing PDF parser is prohibited

The following hastily built parsing path is obsolete for this feature:

- `src/services/file-extractor/file.extractor.ts`
- `src/parsers/pdfParser.js`

The Book runtime and Assembly Workspace MUST NOT import, call, extend, or depend on this parser. It may remain for unrelated legacy flows until separately retired.

### 2.7 Existing launch, progress, and result contracts

Repository audit establishes these integration constraints:

- `StudentPracticePage` is the shared asynchronous launcher for Solo Practice, Homework, and Course material, but it dispatches to separate skill-specific runtimes.
- `TestPageRouter` is the live-session launcher and dispatches from `game_sessions/{sessionCode}` to separate Reading, Listening, Writing, THCS, or Reading V2 runtimes.
- existing result attempts are stored separately and presented through one material result panel with an attempt dropdown;
- existing attempt grouping uses student plus material identity, not session identity;
- existing result visibility distinguishes Solo, Homework, Course, and Live ownership;
- existing Solo resume storage is context-scoped so Homework, Course, and self-study drafts do not overwrite one another;
- existing `CourseMaterial` records are junction records, while class-linked Courses are copied and receive later additions through explicit Course sync;
- existing Course access code resolves primarily by `materialId`, which is ambiguous when one material appears in multiple Courses. Book integration MUST resolve the exact Course material placement/context and MUST NOT copy this ambiguity;
- current Homework submissions represent one material attempt. Book Homework therefore needs its own Activity-level attempt projection and assignment aggregation rather than pretending a whole Book is one existing submission.

The useful convention is a shared launcher that mounts a specialized runtime, not a single runtime containing every material type. Book follows that convention through one thin dispatch branch and Book-owned Modules.

---

## 3. Goals

### 3.1 Required product outcomes

1. Extend the existing Book system into a student-facing interactive Book experience.
2. Make Activity Materials first-class, reusable, versioned learning objects.
3. Build one shared JSON-driven Activity Runtime.
4. Build a Book Assembly Workspace for three explicit inputs:
   - source PDF;
   - Book manifest/page mapping;
   - Unit Activity JSON.
5. Support unit-by-unit assembly, validation, preview, and publication.
6. Serve only authorized Unit PDF pages to students.
7. Support whole-Book and structural-subtree homework.
8. Support nested deadlines and scheduled access without prerequisite unlocking.
9. Preserve student answers through server-backed autosave.
10. Support Activity-level submission, result, review, and grading.
11. Support Activity-level revisions with semantic impact classification.
12. Support selective, explicit updates to active homework.
13. Preserve affected previous work in one student-specific review checkpoint per update action.
14. Keep unchanged student work valid.
15. Create persistent case-specific student notifications.
16. Establish composition interfaces for future lesson/test reuse.
17. Preserve existing test-based Books and existing homework behavior.
18. Represent each generic Activity as one coherent task with one interaction family and one shared answer rule.
19. Preserve exam-specific classification through an optional namespaced task profile without coupling the runtime to IELTS-only names.
20. Support both fully structured Activities and source-assisted Activities whose essential visual layout remains in the Book PDF.
21. Reuse existing asynchronous launcher routes while keeping Book tree, source, version, and submission behavior inside Book-owned Modules.
22. Support full Solo Practice and Course/Class delivery without transferring completion silently between contexts.
23. Group repeated submissions of the same Activity into one result experience with an attempt dropdown.
24. Preserve a clean delivery contract for future Live Session integration without implementing Book Live Sessions in V1.

### 3.2 Quality goals

- No partial import or publish state.
- No silent assignment mutation.
- No exposure of full PDFs, answer keys, teacher notes, or authoring data.
- Reproducible historical submissions.
- Stable Activity identity independent of page number, title, or order.
- One visible Activity ordering system.
- Clear manual repair when automated reconciliation is uncertain.
- Accessible desktop and mobile runtimes.
- Observable user actions without logging Book content, answers, PDFs, or prompts.

---

## 4. Non-goals

The following are outside this PRD’s initial implementation:

- automatic PDF interpretation or structure discovery;
- OCR ingestion;
- NotebookLM integration;
- in-app AI generation of Activity JSON;
- use of the current in-app `aiService` for Book mapping;
- a zero-touch PDF-to-Book converter;
- a full free-form visual Book Maker;
- a full visual Activity Maker;
- custom React/TSX files per Unit or Activity;
- a separate microfrontend or second Book system;
- editing or annotating the source PDF;
- sending the full PDF to the student browser;
- completion-prerequisite unlocking such as “finish Chapter 1 before Chapter 2”;
- enforced teacher timers;
- a single whole-Book submit action;
- an aggregate Book academic grade in V1;
- exact future lesson/test picker or drag-and-drop UX;
- public marketplace or unrestricted public Book publishing;
- automatic fuzzy reconciliation without teacher approval.
- a generic Task Group layer inside Activity;
- a generic Task Set domain layer;
- a first-class shared Resource domain, Resource editor, or Resource reconciliation workflow;
- replacement, migration, or refactoring of Reading V2 or Listening merely to support Books;
- automatic semantic selection of `structured` versus `source-assisted` presentation by the app.
- Book Activity execution inside Live Sessions in V1;
- rewriting existing Reading, Listening, Writing, THCS, Homework, Course, Class, or result storage around the Book model;
- automatic completion credit between unrelated Solo, Homework, Course, Class, or Live contexts.

The Assembly Workspace is still an authoring surface, but it assembles supplied inputs. It does not discover or generate the Book from the PDF.

---

## 5. Canonical domain language

| Term | Meaning |
|---|---|
| Book | Existing ordered learning container. |
| Book Node | A structural `section`, `chapter`, or `unit`; legacy `test` remains supported. |
| Book Content Tree | Ordered hierarchy of Book Nodes and Activity Placements. Do not call this a Git worktree. |
| Activity Material | First-class reusable learning object such as “Technology 1.1.” |
| Interaction | A question, input, or task inside an Activity Material. |
| Task Profile | Optional namespaced classification such as `ielts-reading/table-completion`; it preserves assessment meaning without controlling generic storage identity. |
| Embedded Stimulus | Activity-owned presentation content such as a summary, note, option bank, table, or flowchart. It versions with the Activity. |
| Context Requirement | Activity declaration that external context is `none`, `optional`, or `required`. |
| Structured Activity | Activity whose essential content and relationships can be rendered faithfully from the supported schema. |
| Source-Assisted Activity | Activity whose essential visual structure remains on mapped PDF pages while the app renders answer controls. |
| Placement | A reference that positions an Activity Material inside a Book or future composition. |
| Page Group | One or more PDF pages mapped to an ordered set of Activity Placements, or marked reference-only. |
| Source Version | One immutable uploaded PDF and its metadata/checksum. |
| Manifest Version | One immutable imported description of Book structure, slots, order, and Page Groups. |
| Activity Revision | A new immutable published version under the same Activity ID. |
| Fork | A new Activity Material derived from an existing version, with a new Activity ID. |
| Candidate | Temporary imported content awaiting validation and explicit Save Draft. |
| Assignment Manifest | Frozen ordered set of Book Nodes, Activity versions, and schedule rules for one homework. |
| Review Checkpoint | Student-specific, review-only record containing old work for affected changed Activities from one update action. |
| Affected Homework Review | Teacher workflow shown after publication to decide whether active homework should adopt changes. |

The platform term is **Activity**. A source book may retain words such as “Exercise 1.1” inside a descriptive title, but source exercise numbering MUST NOT become a second visible ordering system.

---

## 6. Non-negotiable architecture rules

1. Extend the existing Book system; do not create a parallel Book product.
2. Book Nodes store structure and references, not raw Activity content.
3. Activity Materials are first-class and independently versioned.
4. Placements contain Book context; Activities do not intrinsically belong to one Book Node.
5. Published versions are immutable.
6. Existing placements and homework remain pinned until explicitly refreshed.
7. Source PDFs are immutable; replacement creates a new Source Version.
8. Students receive only authorized derived Unit excerpts, never the whole source PDF.
9. The existing PDF parser is forbidden.
10. Activity JSON drives a shared runtime; no per-Unit custom UI implementation.
11. The Activity is the smallest redo boundary.
12. Activity is also the smallest generic reusable, editable, submitted, and graded unit.
13. A generic Activity contains one coherent interaction family and one shared answer rule. Different task types become separate Activities.
14. Do not add a generic Task Group or Task Set layer. Existing Reading V2 Task Groups remain untouched inside Reading V2.
15. Interaction IDs are internal, app-managed plumbing. They are never editable JSON fields and require no teacher reconciliation.
16. Display content/stimuli and response interaction families are separate concerns.
17. Activity declares external context as `none`, `optional`, or `required`; actual Book page mapping remains Placement/Page Group authority.
18. V1 embeds local stimuli and uses existing asset references. It does not create a first-class Resource domain.
19. Reuse existing Reading/Listening code only through stable unchanged interfaces or Book-owned adapters. Never refactor another feature merely to make Book implementation easier.
20. Display order is not identity.
21. Activity IDs, version IDs, ownership, provenance, and placement IDs stay outside editable revision JSON.
22. Imported content replaces one Activity draft atomically; it is not a partial field merge.
23. Source edits do not silently change assigned work.
24. Every active-homework update is explicit, audited, and fail-closed.
25. Historical student work is preserved, never destructively rewritten.
26. New UI must use shared/native controls and must not introduce Mantine.
27. Teacher pages keep `TeacherHeader` attached to the shell top edge; page padding belongs inside `main`.
28. Every new route and user action must be registered and observable.
29. Every new RTDB node or Firestore collection requires explicit rules, indexes where needed, backup coverage, and emulator/rule tests.

---

## 7. Release scope and internal phasing

Book/chapter homework is required. It is not deferred to a separate product decision.

The implementation may be delivered through internal phases, but the feature is not product-complete until the V1 acceptance criteria in this PRD pass.

### Phase A: domain and security foundation

- logical contracts and schemas;
- Material Catalog capability registry;
- student-safe Activity projections;
- Source Version and authorized excerpt contracts;
- security rules and negative tests;
- feature flags and observability registry entries.

### Phase B: Activity Runtime

- supported interaction families;
- namespaced Task Profiles;
- structured and source-assisted presentation modes;
- explicit context-requirement validation;
- desktop split runtime;
- single-page PDF navigation;
- Page Group routing;
- mobile tabs;
- autosave;
- Activity submission and review.

### Phase C: Book Assembly Workspace

- source upload/versioning;
- manifest import;
- Content Tree generation;
- Unit bundle import;
- validation;
- page-mapping editor;
- preview;
- staged Unit publication;
- revision-by-JSON.

### Phase D: Book homework

- whole-Book and subtree assignment;
- frozen per-Activity bindings;
- nested deadlines;
- open and scheduled access;
- teacher-configurable anti-cheat/integrity mode;
- Activity-level completion and results;
- teacher/student progress surfaces.

### Phase E: change impact and selective updates

- semantic diff;
- Affected Homework Review;
- selected assignment updates;
- review checkpoints;
- regrade flows;
- case-specific notifications;
- audit and retry/reconciliation.

### Phase F: Solo, Course/Class, and result integration

- existing Student Practice launcher dispatches to Book through one thin branch;
- Book-owned delivery module resolves access, pinned versions, source pages, Activity list, schedules, and student-safe runtime projection;
- Solo Book Practice Run acts as navigation/progress container, not as a graded aggregate material;
- Course/Class material placement can reference a Book subtree or Activity through a frozen Placement binding;
- Course/Class progress is Activity-level and does not create an aggregate Book grade;
- result pages group attempts by student plus Activity identity, using the existing attempt dropdown convention;
- Homework-created-from-Course may optionally count toward Course progress only when the placement explicitly enables that rule.

### V1.1 candidates

- structured visual quick editor for common Activity fields;
- richer manual reconciliation tools for rare tree split/merge cases;
- target-specific future lesson/test composition UI;
- optional split resizing;
- authoring productivity improvements learned from pilot use.
- Book Live Session adapter after session-safe freezing, monitoring, and live result rules are separately scoped;
- richer cross-context secrecy controls beyond the accepted V1 warning-first policy.

---

## 8. Book structure contract

### 8.1 Node taxonomy

The existing node registry must add:

```text
unit
```

and retain:

```text
section
chapter
test
intro-placeholder
toc-placeholder
note-placeholder
```

`test` remains for backward compatibility with existing IELTS Books. New textbook Books should normally use `section`, `chapter`, and `unit`.

### 8.2 Flexible hierarchy

The system MUST NOT require one fixed hierarchy such as:

```text
Section → Chapter → Unit
```

Real books vary. Any valid structural arrangement up to the existing maximum depth may be used.

### 8.3 Validation

The shared Book validator MUST reject:

- unknown node types;
- missing parent references;
- cycles;
- depth greater than five;
- duplicate internal IDs;
- duplicate sibling order values after normalization;
- missing required stable manifest keys;
- duplicate stable manifest keys in the same logical scope;
- raw Activity blocks embedded in Book Nodes;
- unavailable, unsupported, unpublished, or unauthorized material references;
- Page Groups outside their Source Version;
- duplicate or contradictory Page Groups;
- a non-reference Page Group with no Activity;
- an Activity Placement that cannot resolve to a published Activity when publishing;
- a source page outside the authorized Unit range.

Validation must be shared by importer, editor, publish, and assignment gates. UI-only validation is insufficient.

### 8.4 Assignable structural nodes

Any non-placeholder structural subtree containing at least one eligible published, assignable Activity MAY be assigned.

Assignment preview MUST show:

- included Book Nodes;
- included Activities and pinned versions;
- exclusions;
- exclusion reasons;
- inherited deadlines and release dates;
- total required Activity count.

Draft, missing, invalid, unsupported, and non-assignable content MUST be excluded and clearly reported before confirmation.

---

## 9. Activity Material contract

### 9.1 Material identity and kinds

Every Activity Material has:

- one immutable `activityId`/Material Catalog material identity;
- one mutable draft;
- zero or more immutable published versions;
- capability metadata;
- immutable creation provenance.

Activity Material uses a generic `interactive-activity` material kind.

Reason:

- `grammar-worksheet` is too narrow;
- `vocabulary-set` is too narrow;
- SAT, TOEFL, TOEIC, IELTS, THCS, grammar, vocabulary, and textbook exercises may all use the same runtime;
- runtime behavior should be selected by capabilities and Activity schema, not by exam/book branding.

Hardcoded checks such as:

```ts
kind === 'grammar-worksheet' || kind === 'vocabulary-set' || kind === 'interactive-activity'
```

must not spread through callers. Use a central capability registry:

```text
playable
assignable
embeddable
gradable
supportsSourceContext
```

### 9.2 Three-layer data separation

#### Immutable origin provenance

Created on first import and never accepted from revision JSON:

```json
{
  "originalActivityKey": "unit-11/technology-1-1",
  "sourceBookId": "book-grammar-65",
  "sourceVersionId": "pdf-v1",
  "manifestVersionId": "manifest-v1",
  "createdFromNodeKey": "unit-11",
  "createdAt": "2026-07-03T00:00:00Z",
  "createdBy": "teacher-id"
}
```

#### Editable Placement

Edited in the Book Assembly Workspace:

```json
{
  "placementId": "placement-123",
  "activityId": "activity-A",
  "bookId": "book-grammar-65",
  "nodeId": "node-unit-11",
  "pageGroupIds": ["page-group-58"],
  "order": 1
}
```

#### Revisionable Activity content

Accepted by Activity revision import:

```json
{
  "schemaVersion": 1,
  "title": "Technology: present perfect",
  "taskProfile": null,
  "presentationMode": "structured",
  "contextRequirement": {
    "mode": "optional",
    "acceptedKinds": ["book-pages"]
  },
  "instructions": [
    {
      "text": "Complete the sentences."
    }
  ],
  "interaction": {
    "family": "text-entry",
    "variant": "fill-blank"
  },
  "answerRule": {
    "defaultPoints": 1,
    "normalization": "trim-case-and-spacing"
  },
  "stimulus": {
    "kind": "sentence-list"
  },
  "assetRefs": [],
  "interactions": [
    {
      "prompt": "I _____ here for five years.",
      "acceptedAnswers": ["have lived"]
    }
  ],
  "scoring": {
    "mode": "auto-where-possible"
  }
}
```

Revision JSON MUST NOT contain:

- `activityId`;
- `materialId`;
- `versionId`;
- `snapshotVersionId`;
- `placementId`;
- `bookId`;
- `nodeId`;
- `pageGroupIds`;
- source provenance;
- owner or creator identity;
- publish timestamps.

### 9.3 Atomic Activity rule

The generic Activity absorbs the useful semantics that Reading V2 calls a Task Group:

- one coherent task;
- one shared instruction set;
- one shared answer rule;
- one primary interaction family;
- one optional assessment taxonomy classification;
- one ordered interaction list;
- embedded presentation stimulus where needed.

The generic Activity schema MUST NOT add a nested generic Task Group layer.

Example Reading practice:

```text
Book Node: Test Practice
├─ Activity: Matching researchers, Questions 1–6
└─ Activity: Yes/No/Not Given, Questions 7–13
```

Both Activities may map to the same Book passage pages. They remain independently versioned, submitted, graded, reused, and force-updated.

If source content changes interaction family or answer rule, split it into another Activity. A source heading or Book Node groups related Activities without creating another generic content entity.

Inspected source evidence from *IELTS Vocabulary for Bands 6.5 and Above*:

- its Listening Part 4 note-completion practice, Questions 1–10, maps naturally to one Activity plus a supported audio asset reference;
- its Reading practice “Remnants of the past” contains matching Questions 1–6 and Y/N/NG Questions 7–13, which map to two Activities sharing the same mapped PDF passage pages.

### 9.4 Task Profile

An Activity may carry an optional exam-neutral Task Profile:

```json
{
  "taxonomyId": "ielts-reading",
  "typeId": "table-completion",
  "taxonomyVersion": 1
}
```

Other examples:

```text
sat-reading-writing / command-of-evidence
toefl-reading / insert-text
toeic-listening / photographs
```

Rules:

- `taxonomyId` namespaces the assessment system and skill.
- `typeId` preserves the system-specific task meaning.
- `taxonomyVersion` makes classification reproducible.
- Ordinary textbook Activities may use `taskProfile: null`.
- Generic storage, versioning, and runtime selection MUST NOT branch directly on IELTS/SAT/TOEFL/TOEIC names unless a genuinely assessment-specific adapter owns that behavior.

### 9.5 Interaction families and embedded stimuli

The runtime should use a small set of interaction families with variants:

```text
choice
text-entry
matching
ordering
long-response
```

Content and presentation structure are not interaction families. They belong to Activity instructions, embedded stimulus, or existing media asset references.

Examples:

```text
True/False/Not Given
→ Task Profile: ielts-reading/true-false-not-given
→ embedded text stimulus
→ choice family with locked TFNG vocabulary

Table completion
→ Task Profile: ielts-reading/table-completion
→ embedded table stimulus
→ text-entry family

Map labelling
→ embedded map/image stimulus or source-assisted Book page
→ choice or text-entry family
```

Examples:

```json
{
  "family": "text-entry",
  "variant": "fill-blank"
}
```

```json
{
  "family": "text-entry",
  "variant": "sentence-rewrite"
}
```

```json
{
  "family": "text-entry",
  "variant": "error-correction"
}
```

Different exercise wording must not create a new storage architecture. A new type is justified only when answer state, interaction behavior, accessibility, or scoring shape genuinely differs.

The Activity owns shared defaults such as:

- word limit;
- option-reuse rule;
- required selection count;
- answer normalization;
- default points.

Individual Interactions own:

- prompt or blank position;
- accepted answer or selected option;
- question-specific feedback;
- optional point override where the source genuinely differs.

Shared rules MUST NOT be duplicated into every Interaction.

### 9.6 Context requirements

Every Activity JSON explicitly declares:

```text
none
optional
required
```

Examples:

```text
standalone vocabulary matching → none
grammar exercise with helpful explanation page → optional
Y/N/NG questions requiring a passage → required
listening completion requiring audio → required
```

The JSON producer declares the requirement. The app does not generate Activity content or silently decide semantic dependency.

The app validates:

- required Book-page context has a valid Placement/Page Group binding;
- required audio/image context has a valid supported asset reference;
- known task profiles do not contradict the declaration;
- missing or uncertain declarations require teacher correction;
- publication is blocked when required context is unresolved.

Actual Book pages remain Placement/Page Group metadata and MUST NOT be copied into Activity revision JSON.

The `Copy Unit JSON Prompt` must tell external ChatGPT/Codex to declare this field. The Assembly Workspace remains the deterministic validator and teacher-review boundary.

### 9.7 Presentation modes

Every Activity JSON declares exactly one presentation mode:

#### `structured`

Use when all essential content and relationships can be represented faithfully through supported instructions, embedded stimulus, asset references, and Interactions.

#### `source-assisted`

Use when essential visual or spatial meaning remains in the original PDF page, for example:

- dense labelled map;
- crossword;
- unusual word grid;
- complex branching chart;
- visual exercise that would be distorted by reconstruction.

In source-assisted mode:

- the left PDF viewer presents the original exercise;
- the right Activity panel presents labelled answer controls;
- context requirement must be `required`;
- mapped Book pages must exist;
- question labels on the right must correspond clearly to the PDF;
- autosave, submission, scoring, review, and update behavior remain normal;
- no custom per-Activity React renderer is created.

The external JSON producer selects the mode using the versioned prompt. The app validates technical consistency. Teacher preview remains available as the semantic verification surface.

V1 does not require a separate source-assisted acknowledgement checkbox. A valid manifest, valid Activity JSON metadata, valid page mapping, and successful deterministic validation are sufficient for the normal publish gate.

Whether V1 corrects a wrongly generated presentation mode through JSON re-import, a workspace override, or another controlled workflow remains unresolved.

### 9.8 V1 stimulus and asset boundary

V1 does not create a first-class Resource domain.

Keep Activity-local presentation data embedded in the Activity version:

- instructions;
- option bank;
- summary paragraph;
- note/form layout;
- table layout;
- flowchart structure;
- small Activity-specific visual metadata.

Use existing supported asset references for images or audio. Use Placement/Page Groups for Book PDF context.

Two Activities may share context by:

- mapping to the same Book pages;
- referencing the same existing media asset where authorized;
- using an existing Reading/Listening material through a supported Book-owned adapter;
- being copied/forked when independence is intended.

A first-class shared Resource identity/version/editor/reconciliation system is deferred until a concrete reuse case cannot be handled through these mechanisms.

### 9.9 Interaction identity decision

The app generates hidden Interaction IDs when an Activity is first saved.

Rules:

- IDs are stored in normalized draft/published records, not editable JSON.
- Autosave and results use those IDs to bind answers safely.
- If prompt, options, response shape, count, and order are structurally identical, a safe display/scoring/answer-key revision may carry IDs forward by exact position.
- Point-only and answer-key-only changes may therefore regrade existing answers.
- If Interactions are added, removed, reordered, or materially changed, the system does not attempt fuzzy matching. It creates new IDs and classifies the Activity as redo-required.

The following earlier proposal is explicitly rejected:

- exporting protected Interaction IDs;
- asking AI to preserve Interaction IDs;
- matching old and new Interactions;
- opening an Interaction reconciliation screen.

The Activity is the stable public/content identity and smallest redo boundary. Hidden Interaction IDs are implementation plumbing only.

### 9.10 Scoring and feedback

Objective interactions MAY be auto-scored:

- choice;
- exact/normalized text entry;
- matching;
- ordering;
- exact text entry rendered inside a supported table/structured stimulus.

Subjective interactions:

- remain `review_required`;
- must not be falsely auto-scored;
- may receive teacher feedback and grade through existing result-review patterns.

V1 displays Activity-level scores and Book completion progress. V1 MUST NOT invent one aggregate Book academic grade because the product owner did not approve an aggregate scoring policy.

### 9.11 Reading and Listening reuse boundary

The new Book Activity feature must learn from and reuse existing Reading/Listening implementation only when reuse is beneficial and non-invasive.

Allowed:

- reuse documented taxonomy and Task Group semantics as design evidence;
- consume stable exported pure renderers, validators, instruction templates, scoring helpers, or navigation utilities unchanged;
- build Book-owned adapters around stable existing interfaces;
- preserve existing material references where the Book already supports them.

Forbidden:

- changing Reading V2 or Listening storage/contracts to understand Book Activities;
- replacing their runtimes with the generic Activity Runtime;
- migrating their existing materials or results;
- refactoring another feature merely to make Book implementation easier;
- creating a dependency from Reading V2 or Listening back into the Book feature.

When existing code cannot be reused without invasive changes, implement the needed generic behavior inside the Book Activity module while preserving the existing feature and its tests.

---

## 10. Manifest and Page Group contract

### 10.1 Ownership

The manifest owns:

- Book structure;
- stable logical `nodeKey` values;
- Activity slots and stable `activityKey` values;
- Activity order;
- Page Groups;
- reference-only pages;
- default page for an Activity or Page Group where needed.

Activity JSON owns:

- title;
- optional Task Profile;
- presentation mode;
- context requirement;
- instructions;
- one interaction family and variant;
- shared answer rule;
- embedded stimulus;
- supported image/audio asset references;
- ordered Interactions;
- answers;
- scoring.

Activity revision JSON MUST NOT duplicate page mappings.

### 10.2 Stable logical keys

Every manifest node and Activity slot MUST have a stable logical key.

Example:

```json
{
  "nodeKey": "unit-11",
  "activityKey": "unit-11/technology-1-1"
}
```

The importer binds those keys to immutable internal IDs. Page numbers, titles, and display positions MUST NOT be used as identity.

### 10.3 Many-to-many Page Groups

One page may map to multiple Activities. One Activity may map to multiple pages.

Example:

```json
{
  "unitKey": "unit-14",
  "pageActivityGroups": [
    {
      "pages": [77],
      "activityKeys": ["1.1", "1.2", "1.3"]
    },
    {
      "pages": [78],
      "activityKeys": ["1.3", "2.1", "2.2"]
    }
  ]
}
```

Activity `1.3` remains one Activity with one answer state and one submission.

### 10.4 Multi-page Activity behavior

Block-level PDF anchors are not required.

Example:

```json
{
  "pages": [61, 62, 63],
  "activityKeys": ["reading-questions-7-13"]
}
```

Moving among pages 61, 62, and 63 keeps the same mapped Activity set on the right.

### 10.5 Reference-only pages

Reference-only pages are explicit:

```json
{
  "pages": [76],
  "mode": "reference_only",
  "activityKeys": []
}
```

They render in automatic `pdf_focus` mode. The Unit navigator remains available.

### 10.6 One visible ordering system

Student-facing Activity numbers are calculated from current tree order and always contiguous.

After deleting the third Activity from five:

```text
Activity 1
Activity 2
Activity 3
Activity 4
```

not:

```text
Activity 1
Activity 2
Activity 4
Activity 5
```

The UI MUST NOT show a second source/PDF ordering system beside app order. Descriptive titles preserve recognition. Hidden IDs preserve identity and historical links.

---

## 11. Book Assembly Workspace

### 11.1 Positioning

The workspace is an assembly hub inside the existing Book feature. It is not an automatic PDF converter.

Inputs:

```text
1. Immutable source PDF
2. Structured Book manifest/page mapping
3. One or more Unit Activity JSON bundles
```

Outputs:

```text
Validated Book Content Tree
Published Activity Materials
Activity Placements
Page Groups
Authorized Unit source renditions
Student-safe runtime projections
```

### 11.2 Teacher shell

The workspace must be a full teacher authoring surface, not a small modal.

- `TeacherHeader` remains at the top shell edge.
- Content spacing and max width live inside `main`.
- New UI must use native/shared controls, not Mantine.
- The existing Book editor route may be expanded, or a child route may be added after navigation and observability rules are followed.
- Normal Book metadata and existing test-based Book editing must remain available.

Recommended workspace regions:

```text
Book/source status
├─ Content Tree
├─ Unit imports and validation
├─ Page mapping
├─ Activity preview/revision
└─ Publish and impact status
```

### 11.3 Assembly sequence

#### Step 1: upload source PDF

- Create immutable `sourceVersionId`.
- Store checksum, byte size, page count, original filename, uploader, and upload time.
- Keep the original private.
- Do not mutate or overwrite it.

#### Step 2: import manifest

- Parse into a temporary candidate.
- Validate schema and Source Version page bounds.
- Generate proposed Book Content Tree and Page Groups.
- Show exact errors without changing current published state.

#### Step 3: import Unit Activity JSON

- Support a Unit bundle for first creation.
- Validate every Activity before any permanent write.
- Validate one-family/one-answer-rule shape, Task Profile, context requirement, presentation mode, embedded stimulus, asset refs, and hidden-ID exclusion.
- Require mapped pages for source-assisted Activities before preview/publish can succeed.
- Create one Activity ID and one Placement ID per valid new Activity only after the entire operation is ready.
- Generate actual runtime preview.
- Publish the Unit atomically.

#### Step 4: reconcile links

- Bind manifest `activityKey` to Activity ID.
- Bind Placement to Book Node.
- Bind Page Groups to Placements.
- Ensure every published, non-reference Activity slot resolves.

#### Step 5: inspect differences and repair

- Show added, removed, renamed, reordered, moved, page-mapping-changed, and unresolved items.
- Revalidate after every repair.
- Block publication while required issues remain.

### 11.4 Staged Unit publication

A Book may declare ten Units while only Units 1–3 are published.

- Students see only published Units.
- Missing/invalid Units remain teacher-only.
- Whole-Book homework freezes only currently published eligible Activities.
- Publishing Unit 4 later does not silently add it to existing homework.
- Affected Homework Review asks the teacher whether to add it.

### 11.5 Unit status

The workspace must show at least:

```text
Published
Valid — ready to publish
Missing JSON
Invalid
Needs reconciliation
Draft changed
Pending homework updates
```

### 11.6 Copy Unit JSON Prompt

After source PDF, manifest, and selected Unit are valid, show `Copy Unit JSON Prompt`.

The generated prompt must include:

- Book title;
- selected Section/Chapter/Unit path;
- selected page list;
- mapped Activity keys and order;
- current Activity schema version;
- optional namespaced Task Profile format;
- supported interaction families and variants;
- rule that one Activity has one coherent interaction family and answer rule;
- supported embedded stimulus kinds and existing media asset-reference forms;
- required `none` / `optional` / `required` context declaration;
- required `structured` / `source-assisted` presentation declaration;
- exact presentation-selection rubric and examples;
- rule that `source-assisted` requires mapped Book pages and labelled answer controls;
- rule not to approximate unsupported visual layouts merely to choose `structured`;
- answer/scoring requirements;
- Unit bundle envelope;
- instruction not to create generic Task Groups, Task Sets, or Resource entities;
- instruction not to create system IDs;
- instruction to return JSON only;
- a complete valid example.

Prompt metadata:

```text
promptVersion: book-unit-json-v1
schemaVersion: activity-v1
```

The import may record prompt version as provenance. It MUST NOT store the copied prompt payload or PDF content in analytics.

Clipboard failure must expose a read-only text area for manual copying.

### 11.7 Initial Unit bundle

Illustrative input:

```json
{
  "unitKey": "unit-11",
  "activities": [
    {
      "activityKey": "technology-1-1",
      "placement": {
        "targetNodeKey": "unit-11",
        "order": 1
      },
      "content": {
        "schemaVersion": 1,
        "title": "Technology: present perfect",
        "taskProfile": null,
        "presentationMode": "structured",
        "contextRequirement": {
          "mode": "optional",
          "acceptedKinds": ["book-pages"]
        },
        "instructions": [
          {
            "text": "Complete the sentences."
          }
        ],
        "interaction": {
          "family": "text-entry",
          "variant": "fill-blank"
        },
        "answerRule": {
          "defaultPoints": 1,
          "normalization": "trim-case-and-spacing"
        },
        "stimulus": {
          "kind": "sentence-list"
        },
        "assetRefs": [],
        "interactions": [
          {
            "prompt": "I _____ here for five years.",
            "acceptedAnswers": ["have lived"]
          }
        ],
        "scoring": {
          "mode": "auto-where-possible"
        }
      }
    }
  ]
}
```

Page membership comes from the manifest. If transitional import tooling accepts placement pages for convenience, it must normalize them into Placement/Page Group metadata and reject conflicts rather than storing duplicate authority.

The generated prompt must include this normative presentation rule:

```text
For every Activity, set presentationMode to "structured" when all
essential content and relationships can be represented accurately by
the supported schema. Set it to "source-assisted" when the student must
view the original PDF page because essential spatial or visual structure
cannot be reproduced reliably. Never omit presentationMode and never
approximate an unsupported complex layout merely to use structured mode.
```

### 11.8 Page-mapping editor

V1 must support manual mapping repair without reimporting Activity content:

- Activity-focused page checklist;
- page-focused ordered Activity list;
- add/remove Activity from page;
- map one Activity to multiple pages;
- reorder Activities shown for a page;
- mark page reference-only;
- select default page;
- preview exact student layout.

This edits Placement/Page Group metadata only.

---

## 12. Reconciliation and manual repair

### 12.1 Layout

For source/manifest replacement, use:

```text
Current Content Tree | Proposed Content Tree | Resolution and Preview
```

Required controls:

- summary counts;
- unresolved-only filter;
- category filter;
- source-page preview;
- current/proposed Activity preview;
- explicit resolution actions;
- revalidation status;
- publish blocker list.

### 12.2 Identity matching

- Exact stable-key matches resolve automatically.
- Similar title/page range may produce a suggestion only.
- Fuzzy suggestions MUST NOT auto-merge.
- Teacher chooses `Match existing` or `Create new`.
- Matching preserves internal ID and records alias/provenance.

### 12.3 Rename and reorder

Same key with changed title/order is a safe structural change.

Controls:

- `Accept proposed`;
- `Keep current`;
- manual reorder;
- `Accept all safe structural changes`.

Rename/reorder:

- preserves IDs;
- preserves results;
- does not require redo;
- does not create a review checkpoint.

### 12.4 Activity move

Same stable Activity moved across Book Nodes defaults to `Move existing`, but requires teacher confirmation because assignment scope and inherited schedule may change.

Alternatives:

- move existing;
- keep current placement;
- place in both;
- treat as new Activity.

Whole-Book homework preserves Activity completion if the same Activity remains included. Unit-specific homework treats moving out as removal and moving in as addition if the teacher applies the update.

### 12.5 PDF replacement

Replacing a PDF creates:

```text
new Source Version
new Manifest Version
proposed Content Tree revision
```

Then:

1. match stable Nodes and Activity slots;
2. reconcile Page Groups;
3. show differences;
4. repair unresolved mappings;
5. publish;
6. review affected homework.

Activity JSON does not need reimport when Activity content is unchanged.

### 12.6 Rare edge cases

The reconciliation design must explicitly handle:

- Activity split into two proposed slots;
- two old Activities merged into one;
- duplicate key;
- key renamed unintentionally;
- page inserted/deleted so physical PDF index changes;
- printed page label differs from physical PDF index;
- overlapping Page Groups;
- page gap inside Unit;
- missing Activity JSON;
- duplicate Activity JSON;
- concurrent teacher edits;
- publish failure after source processing;
- retry after partial cross-system work.

Split/merge MUST NOT be silently inferred. Teacher must choose which existing Activity identity, if any, survives.

---

## 13. Activity Revision Workspace

### 13.1 V1 editing model

V1 uses revision-by-JSON, not a full visual editor.

Flow:

```text
Select Activity
→ view/export editable current JSON
→ Copy Revision Prompt or create corrected JSON
→ paste/upload full replacement content JSON
→ stage temporary candidate
→ validate
→ show semantic diff
→ preview runtime
→ Save Draft
→ Publish Revision
→ open Affected Homework Review
```

### 13.2 Candidate safety

Importing JSON MUST NOT immediately replace the current draft.

Invalid candidate behavior:

- current draft unchanged;
- published versions unchanged;
- exact errors shown;
- corrected candidate may be imported again.

Valid candidate behavior:

- preview available;
- `Save Draft` atomically replaces editable draft content;
- publication creates a new immutable version.

### 13.3 Full-content replacement

The replacement is the complete editable Activity content. It is not a partial merge.

This ensures:

- deleted questions stay deleted;
- stale choices do not survive;
- validation sees the entire Activity;
- semantic diff is deterministic;
- persistence is atomic.

### 13.4 Copy Revision Prompt

The revision prompt contains:

- current editable content;
- supported schema, interaction families, variants, and embedded stimulus kinds;
- one-family/one-answer-rule Activity constraint;
- Task Profile naming rules;
- context-requirement rules;
- structured/source-assisted presentation rubric;
- requested correction instructions entered by teacher;
- JSON-only requirement;
- instruction not to include IDs or Placement/provenance data.

It MUST exclude:

- Activity/system IDs;
- Source/Manifest IDs;
- Book placement;
- ownership;
- student data;
- published homework data.

---

## 14. Student Book runtime

### 14.1 Desktop layout

Default:

```text
---------------------------------------------------------
| Single Book page viewer | Mapped Activities           |
|                         | independent vertical scroll |
---------------------------------------------------------
| Sticky Activity/question navigator                    |
---------------------------------------------------------
```

The PDF is reference context only. Student answers are rendered by the app.

### 14.2 Activity presentation modes

Structured Activity:

- right panel renders the complete supported stimulus and answer controls;
- mapped PDF pages remain optional or required according to the Activity context declaration;
- accessibility and responsive behavior come from the shared Activity renderer.

Source-assisted Activity:

- left panel must display the mapped source page containing essential visual structure;
- right panel renders the Activity instruction and clearly labelled answer controls;
- launch is blocked if required source context is unavailable;
- right-side labels must correspond to visible PDF labels/numbers;
- no custom per-Activity renderer is loaded;
- review mode preserves the same source-page context.

The mode affects presentation only. It does not change Activity identity, autosave, submission, grading, homework, or version-update semantics.

### 14.3 PDF navigation

V1 uses a single-page viewer, not continuous scroll.

Required controls:

- Previous;
- Next;
- Book page number input;
- Enter/go behavior;
- zoom in/out;
- fit page/fit width as appropriate;
- current allowed page indication.

Rules:

- navigation remains within authorized Unit pages;
- invalid or out-of-Unit page is rejected;
- adjacent page may preload;
- student sees original Book page number/label;
- physical PDF index and slice index remain internal;
- page switching is deterministic;
- Activity set changes only after successful page navigation.

### 14.4 Page-to-Activity behavior

- A page renders all mapped Activities in one vertical stack.
- Selecting a pill scrolls the right panel to the Activity or question.
- Moving between pages in the same Page Group preserves the mapped set.
- When practical, keep focus/scroll on a shared Activity such as `1.3`.
- Selecting an Activity from elsewhere opens its configured default page.

### 14.5 Sticky navigator

Examples:

```text
1.1 | 1.2 | 2.1
```

or:

```text
Q7 | Q8 | Q9 | Q10 | Q11 | Q12 | Q13
```

Navigator states may include:

- current;
- unanswered;
- answered;
- flagged;
- submitted;
- review-required.

It must remain keyboard accessible and must not obscure content or submit controls.

### 14.6 PDF focus

Reference-only page:

- one PDF viewer expands across the workspace;
- do not render two copies of the page;
- Unit navigator remains;
- returning to an Activity page restores split layout.

Activity page:

- small real button with SVG may collapse the Activity panel;
- tooltip and accessible label required;
- an edge control restores the panel;
- page, zoom, Activity scroll, answers, and optional timer state remain unchanged;
- desktop/tablet only.

### 14.7 Mobile

Use:

```text
[Book Page] [Activity]
```

Requirements:

- no squeezed split view;
- answers survive tab switching;
- active Book page survives tab switching;
- source-assisted Activities clearly indicate that the Book Page tab contains required context;
- sticky Activity/question navigation adapts to mobile;
- touch targets, overflow, drawers, and routed shell follow student mobile standards.

### 14.8 Optional personal timer

No fixed teacher timer exists for Book Activities.

Student MAY open a personal SVG timer to challenge themselves.

It:

- is voluntary;
- does not affect grade;
- does not affect deadline;
- does not auto-submit;
- is not an anti-cheat record;
- is not shown to teacher;
- preserves state across panel collapse/page navigation where practical.

### 14.9 Autosave

Required behavior:

1. update answer immediately in client state;
2. debounce server save by Activity;
3. show `Saving…` then `Saved`;
4. flush pending save before page navigation or Activity unmount;
5. retry transient failure;
6. keep unsaved answer in memory on failure;
7. show a persistent warning until safe;
8. reload resumes last saved draft;
9. autosave does not count as submission.

The implementation must use repo-safe async state patterns and avoid stale closures or undefined Firebase fields.

### 14.10 Launch and delivery projection

Book runtime MUST launch through the same asynchronous student entry pattern used by existing Solo Practice, Homework, and Course material.

The launcher may route or dispatch by material kind, but it MUST NOT understand Book internals. It passes a delivery request to the Book-owned delivery module.

Delivery request examples:

```ts
{
  studentId: "student_1",
  surface: "solo",
  bookId: "book_ielts_vocab_65",
  placementId: "unit_11",
}
```

```ts
{
  studentId: "student_1",
  surface: "homework",
  homeworkId: "hw_123",
  assignmentId: "book_assignment_456",
}
```

```ts
{
  studentId: "student_1",
  surface: "course",
  courseId: "course_10",
  moduleId: "module_2",
  courseMaterialId: "cm_88",
}
```

The returned runtime projection includes:

- authorized Source Version and page slice;
- page labels and previous/next/page-input limits;
- Page Groups;
- ordered visible Activities;
- pinned Activity versions;
- submission state;
- deadline/access state;
- result/review availability;
- notification/action metadata needed by the current surface.

The route must be reload-safe. `location.state` may carry convenience data, but it may not be the only source of authorization, pinned version, or delivery context.

### 14.11 Result and attempt UX

Each Activity submission creates one immutable Activity attempt.

Result display follows the existing pattern:

- one result page/panel for a student plus Activity;
- an attempt dropdown switches between submissions of the same Activity;
- each attempt shows its own answers, corrections, score, feedback, version, and source context;
- separate Activities get separate result pages/panels;
- Unit/Book summaries aggregate progress only and link to Activity result pages.

Example:

```text
Student A practises Activity 1.3 in Solo on Monday.
Student A submits the same Activity 1.3 as Homework on Wednesday.

The Activity 1.3 result page shows two attempts in the dropdown.
Solo completion does not automatically complete Homework.
Homework completion does not automatically rewrite the Solo record.
```

### 14.12 Context-scoped drafts, attempts, and completion

Drafts and resume state MUST be scoped by delivery context.

Minimum draft key dimensions:

- student ID;
- Activity ID;
- Activity Version ID;
- surface: solo, homework, course, class-linked course;
- exact placement/delivery ID.

This prevents:

- Solo drafts overwriting Homework drafts;
- Homework drafts overwriting Course drafts;
- two Course placements of the same Activity overwriting each other;
- old version drafts appearing inside a newer pinned version.

Attempt limits, if enabled, are evaluated in the delivery context that owns the work. A Solo reattempt must not consume a Homework attempt limit unless the product explicitly defines that shared-attempt rule later.

Completion is also context-specific:

- Solo completion belongs to the Solo Practice Run;
- Homework completion belongs to the assignment;
- Course completion belongs to the Course material placement;
- Class completion follows the Course/Homework object assigned to that class.

The only accepted V1 bridge is explicit:

```text
Homework created from a Course material may also count toward Course progress when that placement enables it.
```

### 14.13 Feedback release and result visibility

Book result access MUST follow the same ownership principle as existing results:

- students may see their own permitted attempts;
- teachers may see attempts created under Homework, Course, Class, or Live authority they own;
- teachers may not see private Solo attempts unless the student work was launched through a teacher-owned context;
- Homework feedback timing controls when a student can see corrections/feedback for Homework attempts;
- regrading one attempt updates that attempt's evaluation history, not other attempts.

Cross-context answer/feedback visibility policy:

- V1 accepts that Book Activities are practice material and may already be known to a student.
- When a teacher assigns a Book Activity with delayed/manual feedback, the app MUST warn if selected Activities are also available through Solo or if deterministic prior-attempt metadata shows students may already have seen feedback.
- The warning is informational by default. Teacher may continue.
- If secrecy matters, teacher should fork/copy the Activity for that assignment or placement so it receives a new Activity ID and separate result history.
- V1 does not lock Solo access automatically, because that would make Book assignment unexpectedly change unrelated practice access.

Example:

```text
Activity 1.3 is available in Solo Practice.
Student A already completed it and saw feedback.
Teacher assigns Activity 1.3 as Homework with feedback after deadline.

Assignment modal warns:
"Some students may already have access or previous results for Activity 1.3.
Use a forked copy if this homework must stay unseen."

Teacher can continue, or fork Activity 1.3 before assigning.
```

### 14.14 Book Homework anti-cheat / integrity mode

V1 Book Homework MUST support teacher-configurable anti-cheat mode.

This is not optional product polish. It is required because Book Homework may be assigned for accountable independent work, and students can otherwise leave the runtime to search for answer keys.

Default:

- anti-cheat/integrity mode is ON by default for Book Homework;
- teacher may turn it OFF only when the assignment is casual practice;
- the create/assign UI must label the toggle clearly and explain what turning it off means;
- disabling anti-cheat is stored in assignment metadata for audit.

Scope:

- applies to Book Homework;
- may later apply to Course/Class placements when assigned as accountable work;
- does not apply to casual Solo Practice unless a later product decision adds it;
- operates per Activity attempt, not as a whole-Book punishment.

Student-facing rule:

```text
When anti-cheat is on, leaving this page, switching tabs/windows,
pasting answers, opening another active session, or exiting required focus mode
will be recorded for teacher review.
```

Events to record:

- page visibility hidden;
- browser/window focus loss;
- route navigation away during an active Activity;
- reload/close during an active Activity;
- paste into answer fields;
- copy from protected prompt/answer text where technically reliable;
- fullscreen/focus-mode exit when the teacher requires focus mode;
- concurrent active session for the same student and Activity;
- unusually long inactive period during an open attempt.

Required consequences:

- events are written to an immutable Activity attempt integrity log;
- student sees an immediate warning after a recorded event;
- attempt receives an integrity status visible to teacher;
- repeated or severe violation increases integrity severity;
- student can still continue and finish the work;
- the system does not auto-lock, auto-submit, auto-zero, or prevent the student from finishing;
- teacher can review the integrity report on the teacher result page after submission;
- V1 does not add built-in post-homework action buttons or special consequence workflow;
- V1 does not show live integrity monitoring while the student is working;
- after submission, student does not see the integrity log, integrity status, event count, or severity.

If teacher later responds to the evidence, it happens through normal grading/feedback/class policy outside this anti-cheat report. The raw integrity evidence remains teacher-only.

The default V1 consequence model:

```text
Every event: warn + log.
Repeated event or long absence: mark Activity attempt as integrity_flagged.
Severe pattern: mark Activity attempt as integrity_high_risk.
Student can still finish and submit.
Teacher result page shows integrity report.
Teacher sees it after submission only.
Student sees no post-submission integrity summary.
```

Important limit:

The web app cannot prove that the student did not use a phone, second device, printed answer key, or another browser profile. The product MUST NOT claim guaranteed proctoring. It should claim:

```text
Anti-cheat mode deters and records suspicious behavior.
It does not guarantee a cheat-proof exam environment.
```

If the teacher needs full exam-style enforcement, that belongs to a future Live/Test/proctored mode, not to the ordinary Book Homework runtime.

---

## 15. Source PDF storage and delivery

### 15.1 Immutable source

Each upload creates a new immutable Source Version.

Required metadata:

- `sourceVersionId`;
- Book ID;
- private R2 asset identity;
- checksum;
- byte size;
- page count;
- original filename;
- created by/at;
- status;
- derived rendition status.

Never overwrite an existing source file.

### 15.2 Authorized Unit rendition

The student must not receive the full source PDF.

For each selected Unit/runtime context, a trusted backend produces or serves a read-only PDF excerpt containing only allowlisted pages.

This is a delivery rendition, not source editing.

Authorization must bind at least:

- authenticated student;
- launch context;
- Book ID;
- Source Version;
- Unit/Book Node;
- assignment or library entitlement;
- allowed page set;
- expiry;
- requested range if HTTP range delivery is supported.

Changing a URL or page parameter MUST NOT grant access to:

- another Unit;
- answer keys;
- teacher notes;
- unrelated pages;
- another Book;
- a source version not pinned to the launch context.

### 15.3 Backend boundary

The implementation may expand the backend. It must use a dedicated source-delivery module and a robust server-side PDF engine behind an adapter.

The exact engine/runtime requires a technical spike. The choice must prove:

- correct page extraction for image-based PDFs;
- preservation of visual quality;
- deterministic page labels/index mapping;
- acceptable latency and cost;
- private R2 input/output;
- idempotent retries;
- no dependency on legacy parser;
- local and deployed authorization tests.

OCR and content extraction are not part of this V1 path.

### 15.4 Rights prerequisite

Before upload/publish, teacher/admin must confirm they have the right to use and distribute excerpts of the source Book to assigned students. The product must not imply that technical access control grants copyright permission.

---

## 16. Book homework model

### 16.1 Assignment target

Teacher can assign:

- whole Book;
- Section;
- Chapter;
- Unit;
- any other eligible non-placeholder structural subtree.

The assignment includes all currently published, assignable Activity Placements under the chosen subtree.

### 16.2 Frozen modular manifest

One Book homework contains a frozen manifest:

```text
Homework
├─ selected Book revision/context
├─ frozen structural outline
├─ schedule rules by stable node ID
└─ ordered Activity bindings
   ├─ activityId
   ├─ pinned activityVersionId
   ├─ placement context
   ├─ sourceVersionId
   └─ required/excluded state
```

The assignment is not one indivisible Book snapshot. Each Activity binding can later advance independently through an explicit update action.

### 16.3 Submission and completion

- Student submits each Activity separately.
- Unfinished Activity answers remain drafts.
- There is no `Submit Entire Book` button.
- Book homework progress is `required Activities submitted / required Activities total`.
- Homework becomes submitted/completed automatically when all current required Activities are submitted.
- Subjective Activity results may remain `review_required`.
- Completion and grading status must remain distinct.

### 16.4 No V1 aggregate Book grade

The UI may show:

- completion count;
- per-Activity score;
- pending review count;
- excluded historical rows.

It must not display one aggregate Book percentage until a separate grading policy is approved.

### 16.5 Book browsing versus homework

Unassigned Book learning progress and homework progress are separate records.

The system MUST NOT:

- make browsing completion satisfy homework automatically unless explicitly designed;
- overwrite library progress when homework starts;
- treat one context’s result as another context’s submission.

Shared Activity drafts/results may be reused only through an explicit, version-safe product rule.

---

## 17. Homework schedules

### 17.1 Deadlines

Whole-Book homework has a required final due date.

Teacher may optionally set deadlines on structural nodes.

Resolution rule:

```text
Activity due date =
nearest ancestor deadline
or assignment final due date
```

A nested deadline MUST NOT be later than its parent or final Book due date.

Example:

```text
Book final due: Aug 30
Chapter 1 due: Aug 10
Chapter 2: no override → Aug 30
Chapter 3 / Section A due: Aug 20
```

### 17.2 Deadline mutation

- Teacher may extend a deadline at any time.
- Teacher may add or shorten a nested deadline only before affected students start that scope.
- Once any affected student starts an Activity, unsafe shortening is blocked.
- Existing per-student deadline extensions remain supported.
- Schedule changes do not change pinned Activity content.

### 17.3 Access modes

Teacher chooses:

#### Open access

All included content is available when homework opens.

#### Scheduled access

Teacher may set optional release dates on structural nodes.

Resolution rule:

```text
Activity release =
nearest ancestor release
or assignment availableFrom
```

Released content remains accessible after its deadline. Deadlines never hide completed or overdue work.

Default mode is `Open access`.

### 17.4 No prerequisites

V1 does not support:

```text
Complete Chapter 1 before Chapter 2 unlocks
```

Release dates and deadlines remain separate concepts.

### 17.5 Homework settings mapping

Existing homework settings that assume one material attempt must be adapted for Book Homework.

V1 rule:

- `maxAttempts` applies per Activity attempt within the assigned Book/subtree;
- feedback timing applies per Activity result;
- late policy applies to each Activity according to its own inherited deadline;
- anti-cheat/integrity mode is ON by default and applies per active Activity attempt;
- teacher may disable anti-cheat only for casual practice assignments;
- anti-cheat never blocks the student from finishing the assigned work;
- whole-Book completion is aggregated from required Activity completion.

Example:

```text
Teacher assigns Unit 11 with maxAttempts = 2 and anti-cheat on.

Activity 1.1: student used 1 attempt, 1 remains.
Activity 1.2: student used 0 attempts, 2 remain.
Activity 2.1: student switched tabs twice, so only Activity 2.1 is integrity_flagged.

Student can still finish Activity 2.1.
Teacher sees the integrity report on the teacher result page after submission.
The whole Unit is not force-submitted.
```

---

## 18. Change classification

The system must compute a semantic impact plan instead of treating every version change as redo-required.

| Change | Existing answers | Grade action | Student redo |
|---|---|---|---|
| Title, description, formatting, layout | Keep | None | No |
| Book/Activity reorder or renumber | Keep | None | No |
| Same prompt/options, point value changed | Keep | Recalculate | No |
| Same prompt/options, answer key changed | Keep | Regrade | No |
| Rubric changed | Keep | Teacher regrade | No |
| Prompt changed | Preserve old in checkpoint if update applied | As applicable | Teacher may require |
| Choices changed | Preserve old in checkpoint if update applied | As applicable | Teacher may require |
| Required response shape changed | Preserve old in checkpoint | As applicable | Teacher may require |
| Required source context changed materially | Preserve old in checkpoint | As applicable | Teacher may require |
| Interaction added/removed/reordered inside Activity | Preserve old Activity work in checkpoint | New version | Activity redo |
| New Activity Placement | No old work | New required work | Complete new Activity |
| Removed Activity Placement | Keep historical result, exclude | Remove from current scope | No |
| Placement reordered | Keep | None | No |

Dangerous content changes may default to `Require redo`, but teacher must see and confirm the classification.

### 18.1 Answer-key-only example

```text
Question unchanged
Student selected C
Old key B
Corrected key C
```

The system regrades `C`; it does not ask the student to answer again.

### 18.2 Point-only example

```text
Question and response unchanged
Old points: 1
New points: 2
```

The score is recalculated. Audit stores old/new grading result. If a published student score changes, send a persistent notification.

---

## 19. Tree mutation behavior

### 19.1 Insert Activity

- Create new stable Activity ID.
- Normalize current sibling order.
- Do not reset existing work.
- Existing homework stays frozen unless selected in Affected Homework Review.
- If added to an active homework, it becomes new required work.
- A completed Book reopens only for the new Activity.
- Require a replacement deadline if inherited deadline has expired.

### 19.2 Reorder or swap

- No redo.
- No review checkpoint.
- No grading change.
- Usually no student notification because no action changed.
- Current display numbering recalculates.

### 19.3 Move same Activity

- Preserve Activity ID and content version.
- Preserve results where assignment scope still includes it.
- Review changed schedule inheritance.
- Moving out of a Unit assignment behaves as removal.
- Moving into a Unit assignment behaves as addition.

### 19.4 Remove Activity

Removal creates no review checkpoint and requires no student action.

Not started:

- Activity stops being required.

In progress:

- Activity stops being required;
- no review-only result is surfaced.

Submitted:

- original Activity result remains stored and viewable;
- row is marked `excluded`/struck through in aggregate submission context;
- earned points and possible points are both excluded;
- no marking remains pending;
- no completion effect;
- existing feedback is historical only.

The system MUST NOT physically remove the Activity from a historical submission.

Completed Book homework stays complete after removal.

### 19.5 Add Unit/Chapter/Section

New structural content follows the same addition rules:

- existing homework remains frozen;
- teacher chooses active homework targets;
- existing student work remains valid;
- no review checkpoint is created because no old work was replaced;
- schedule and deadline review is required.

---

## 20. Affected Homework Review

### 20.1 Trigger

Open after publishing:

- Activity Revision;
- Book structural revision;
- Manifest/Source revision;
- new Unit/Chapter/Section;
- page/source-context change.

Do not open after ordinary draft save.

Source publication succeeds first. Active homework remains unchanged by default.

### 20.2 Content

For each affected active homework show:

- target/class/student;
- selected Book/subtree;
- final and relevant nested deadlines;
- access mode/release information;
- counts: not started, in progress, submitted;
- affected Activities;
- safe structural changes;
- regrade-only changes;
- redo-required changes;
- additions;
- removals;
- deadline action required;
- estimated student notifications/checkpoints.

Example:

```text
[ ] Class 10A — Whole Book
    Due Aug 30
    12 not started · 5 in progress · 3 submitted
    Redo: Activities 5.2 and 5.7

[ ] Class 10B — Unit 5
    Due Aug 20
    8 not started · 2 in progress
    Regrade: Activity 5.2
    Add: Activity 5.9
```

No force-update target is selected by default.

### 20.3 Teacher action

Teacher:

1. selects homework targets;
2. reviews Activity-level impact;
3. may deselect individual proposed redo/addition items where valid;
4. provides a reason;
5. supplies replacement deadlines where required;
6. confirms;
7. receives a shared success/failure announcement.

### 20.4 Pending updates

Closing the modal must not lose awareness.

The Book/Activity surface shows:

```text
3 active homework assignments have pending updates
```

Teacher can reopen review later.

Closed or archived homework stays untouched.

### 20.5 Deadline rule during update

- Future deadlines remain unchanged.
- Regrade-only, reorder-only, and removal-only updates need no new deadline.
- New or redo-required work cannot be added under an expired effective deadline.
- Teacher must set a replacement deadline for affected scope.
- One replacement may be applied to selected homework with per-homework override.

---

## 21. Selective homework update and review checkpoints

### 21.1 Atomic update action

One confirmed action creates:

- update action audit record;
- new per-Activity version bindings for selected homework;
- any regrade work;
- any required student checkpoints;
- recalculated completion;
- case-specific notifications.

The operation must be idempotent. Retry MUST NOT duplicate checkpoints, reopen work twice, or send duplicate notifications.

### 21.2 Student-specific checkpoint

One update action creates at most one Review Checkpoint per affected student.

It contains only old work for changed Activities that student had started or submitted.

Example:

```text
Chapter 5 has Activities 5.1–5.8
Changed: 5.3 and 5.7
```

Student A checkpoint:

```text
Chapter 5 — Previous version

Activity 5.3
- old Activity snapshot
- Student A answers
- old result/feedback under release policy
- prior status

Activity 5.7
- old Activity snapshot
- Student A partial answers
- prior status
```

It does not copy unchanged Activities.

### 21.3 Student state cases

#### Not started

- Bind latest selected Activity version.
- No checkpoint.
- New work is required.

#### In progress

- At update time, seal the old affected draft inside the Review Checkpoint.
- This is the requested “force submit for review” behavior, but it is not a normal academic submission and does not count toward completion or grade.
- Bind latest version.
- Require redo of affected Activity.
- Unchanged Activities remain untouched.

#### Submitted

- Preserve old affected submission inside checkpoint.
- Bind latest version.
- Require redo of affected Activity.
- Reopen Book homework only for required changed/new work.
- Unchanged submitted Activities remain valid.

#### Mixed

One checkpoint and one notification summarize the student’s actual combination.

### 21.4 Checkpoint status

Review Checkpoints:

- are read-only;
- do not count toward current completion;
- do not count toward current grade;
- remain linked to old Activity and Source versions;
- remain visible under `Previous versions`;
- preserve audit context and teacher reason.

### 21.5 Feedback visibility

Review Checkpoint display follows existing homework release policy.

Always show:

- student’s own previous answers.

Only show when policy permits:

- score;
- correct answers;
- teacher feedback;
- marking details.

Force update MUST NOT reveal hidden answers early.

---

## 22. Persistent notifications

### 22.1 General rules

- Use the existing Notification Bell system.
- Create one notification per student per update action, not one per Activity.
- Link directly to the updated homework or relevant previous-version view.
- Store structured metadata needed to resolve the destination safely.
- Do not store answer content, PDF content, or full diff payload in notification metadata.

### 22.2 Not started

Example:

```text
Book homework updated

Your teacher updated Unit 5 before you started it.
Complete the latest version by August 20.
```

This is informational unless new work changes the student’s required scope.

### 22.3 In progress

Example:

```text
Your saved work was preserved

Unit 5 was updated.
Your previous work is available under Previous versions.
Complete the updated Activities by August 20.
```

### 22.4 Submitted

Example:

```text
Action required: redo updated work

Your teacher updated two Activities after you submitted.
Your previous result remains available for review.
Complete the updated Activities by August 20.
```

### 22.5 Mixed case

Example:

```text
Book homework updated

3 Activities changed.
1 saved draft was moved to Previous versions.
1 submitted result was preserved.
2 Activities now require action.
```

### 22.6 Regrade-only

If a published score changes:

```text
Your Activity score was updated

The marking rule for Activity 5.2 was corrected.
Your answers did not change.
Previous score: 7/10
Updated score: 8/10
```

Do not send action-required wording when no student action is required.

---

## 23. Cross-feature delivery and future composition foundation

### 23.1 Book Delivery seam

Create a Book-owned delivery module with a small interface.

The delivery module accepts:

- surface: solo, homework, course, class-linked course, or future live;
- caller-owned context IDs;
- Book/Placement reference;
- student identity;
- teacher identity when relevant.

The delivery module returns:

- student-safe runtime projection;
- authorized Source page slice;
- ordered Activity list;
- pinned versions;
- access/deadline state;
- submission/result state;
- update/review metadata.

Callers must not know:

- Book tree storage shape;
- Source Version storage shape;
- Page Group storage shape;
- update checkpoint shape;
- which Activity version is pinned;
- how Unit page excerpts are authorized.

The deletion test should hold: if the Book Delivery module were removed, launch, access, version, source, result, and deadline complexity would reappear across Solo, Homework, Course, Class, and future Live surfaces. That is exactly why it belongs behind one deep Module.

### 23.2 Lean Placement binding

Book-originated integrations MUST reference a frozen Placement binding, not a bare Activity ID.

Minimum binding:

```json
{
  "bookId": "book_ielts_vocab_65",
  "manifestVersionId": "manifest_v4",
  "placementId": "placement_unit_11_activity_1_3",
  "activityId": "activity_abc",
  "activityVersionId": "activity_abc_v2",
  "titleSnapshot": "Activity 1.3"
}
```

`manifestVersionId` resolves:

- Book path: section/chapter/unit/activity;
- page group;
- visible order;
- source version;
- source page labels;
- source-assisted context.

This prevents Course, Homework, Solo, and future features from inventing their own interpretation of the same Activity.

### 23.3 Context-owned access

Access is owned by the surface that launches the work.

Rules:

- Solo access follows Book solo/public visibility.
- Homework access follows assignment target, open/scheduled access, and deadlines.
- Course access follows enrollment, module release, and exact Course material placement.
- Class access follows the class-owned Course/Homework object.
- Live access is future scope and must follow session membership/status when implemented.

Archived Books:

- block new Solo launches and new placements;
- keep existing pinned Homework/Course/Class deliveries available according to their own access rules;
- do not silently mutate or invalidate already assigned work.

### 23.4 Surface pinning and update policy

| Surface | Version rule | Update rule |
|---|---|---|
| Solo | attempt pins current Activity and Source versions at attempt start | new attempt may use latest published version |
| Homework | assignment pins Activity and Source versions per affected Activity | teacher explicitly applies selective update |
| Course/Class | Course material placement pins selected Book subtree/Activity | explicit Course/Class sync or placement update; no silent source mutation |
| Future Live | session must freeze versions when session is created | live Book execution deferred from V1 |
| Future composition | references original by default | editing in the new context requires fork/copy before mutation |

### 23.5 Result identity and attempt grouping

Book Activity attempts group by:

```text
studentId + activityId
```

Each attempt also stores:

- surface;
- delivery context ID;
- placement ID;
- Activity Version ID;
- Source Version ID when source-assisted;
- submission time;
- grading/regrading history.

Result display:

- same Activity attempts appear in one result panel/dropdown;
- different Activities appear in separate result panels;
- Unit/Book/Course/Homework summaries aggregate progress and link to Activity results;
- result viewing never transfers completion across surfaces.

Permissions:

- student sees own permitted attempts;
- teacher sees only attempts created under teacher-owned Homework/Course/Class/Live authority;
- private Solo attempts remain private unless later policy says otherwise.

### 23.6 Course/Class delivery

Course integration uses one Course material item per selected Book subtree or Activity.

Examples:

```text
Teacher adds Unit 11 to Course Module 2.
Student sees one Course item: "Unit 11: Progress".
Inside it, the Book Runtime shows Activities 1.1, 1.2, 2.1...
Course progress marks the Course item complete when required Activities are submitted.
```

```text
Teacher adds only Activity 1.3 to Course Module 4.
Student sees one Course item: "Activity 1.3".
The runtime may still show the needed source page context if required.
```

Course/Class must resolve the exact `courseMaterialId` or equivalent placement context. Existing code that resolves only by `materialId` is ambiguous when the same material appears in multiple Courses and must not be copied for Book.

Class-linked Course copies follow explicit sync rules. Adding a new Book Activity or updating a Book placement in the source Course does not silently mutate already copied class Courses.

### 23.7 Live Session boundary

V1 prepares data contracts for Live but does not execute Book Activity inside Live Sessions.

Reason:

- existing live sessions launch through `game_sessions/{sessionCode}`;
- live runtime needs session freezing, teacher monitor state, participant state, and live result rules;
- Book homework/solo/course runtime is asynchronous and context-owned.

Future Live work may add a Book adapter only after it defines:

- session freeze point;
- allowed Book selection granularity;
- teacher monitor behavior;
- reconnect behavior;
- live submission/result identity;
- whether source PDF pages can be shown during live play.

### 23.8 Content Catalog boundary

Create or deepen a shared `ContentCatalog` module with a small interface:

```ts
browseChildren(containerRef)
resolveSelection(selection)
```

Callers must not know:

- RTDB/Firestore paths;
- Book tree storage shape;
- how Placements resolve;
- how versions are pinned;
- how source context is authorized.

### 23.9 Structured selection

Selecting a Unit/Chapter returns a structured bundle by default.

Target features may later choose:

- preserve structure;
- flatten ordered Activities.

Exact future UI remains open.

### 23.10 Reference first

Dragging/selecting content into another composition creates references by default.

Existing placements remain pinned when the original publishes a newer version and show:

```text
Newer version available
```

### 23.11 Revise versus fork

`Revise original`:

- same Activity ID;
- new immutable version;
- existing placements remain pinned until explicit refresh.

`Customize here`:

- new Activity ID;
- version 1 forked from selected version;
- original unchanged.

Provenance:

```json
{
  "forkedFromMaterialId": "M1",
  "forkedFromVersionId": "v3"
}
```

An embedded Activity cannot directly mutate its original source.

### 23.12 Source context during reuse

For an Activity with `contextRequirement.mode = optional`, future composition may ask:

```text
Activity only
Activity + Book source pages
```

For `none`, Activity-only placement is valid.

For `required`, the target MUST include or bind an accepted context kind. It may not offer an invalid Activity-only placement.

The default for optional context is target-specific. Book source context travels as an authorized reference, not a copied public PDF or a new first-class Resource record.

---

## 24. Permissions, security, and privacy

### 24.1 Teacher permissions

Only:

- Book owner;
- explicitly authorized collaborator if/when supported;
- super admin;

may upload source, import manifests/JSON, revise Activities, publish, reconcile, or update affected homework.

Teacher must not update homework owned by another teacher through crafted IDs.

### 24.2 Student permissions

Student may access only:

- Book content granted through library/course/homework context;
- published student-safe Activity version;
- their own drafts, submissions, and Review Checkpoints;
- authorized Unit PDF rendition.

Student MUST NOT read:

- Activity answer keys before release policy permits;
- teacher notes;
- provenance/import evidence;
- another student’s answers/results;
- authoring drafts/candidates;
- full source PDFs;
- pending unpublished versions;
- update audits beyond student-safe explanation.

### 24.3 Student-safe projection

Runtime must consume a projection that excludes:

- accepted answers when hidden;
- private source object keys;
- authoring validation reports;
- prompt provenance beyond safe schema version;
- internal IDs not needed by runtime;
- teacher-only notes;
- conversion logs;
- homework impact counts.

### 24.4 Rules and backend authority

Browser clients MUST NOT have authority to:

- create published Activity versions directly;
- rewrite pinned homework bindings;
- create Review Checkpoints for themselves;
- mark historical results excluded;
- issue source delivery for arbitrary pages;
- write notification records for other users;
- alter update audits.

Trusted mutations must be server-authorized and idempotent.

### 24.5 Logging

Never log:

- full PDF bytes;
- signed/private delivery URLs;
- answer payloads;
- copied prompts;
- Activity JSON content;
- student response content;
- secrets or tokens.

Use IDs, schema versions, counts, classifications, durations, and error codes.

---

## 25. Reliability and transactional requirements

### 25.1 Import atomicity

Unit import is all-or-nothing:

- validate every Activity;
- validate every Placement;
- validate manifest links;
- validate source page authorization;
- prepare all writes;
- commit once;
- expose no partial Unit.

### 25.2 Cross-system operations

R2 and Firebase cannot share one native transaction.

Source upload/rendition and metadata publication require:

- explicit operation state;
- idempotency key;
- recoverable staging;
- reconciliation report;
- safe retry;
- no public/student reference until all required artifacts exist;
- cleanup policy for abandoned temporary artifacts.

### 25.3 Homework update atomicity

If one update affects many students, implementation may use bounded batches, but externally it must provide:

- one update action identity;
- deterministic per-student plan;
- resumable progress;
- no mixed double-application;
- visible failure/partial status to teacher;
- retry only unfinished work;
- final reconciliation count.

Do not claim a cross-student transaction if the backend cannot provide one.

### 25.4 Concurrency

Use revision/precondition checks:

- manifest candidate based on known current revision;
- Activity candidate based on known draft/published version;
- Affected Homework plan based on known assignment revision;
- reject stale publish/update confirmation;
- reload diff instead of overwriting newer work.

### 25.5 Failure UX

Errors must identify:

- operation;
- affected Unit/Activity/homework where safe;
- whether current published state changed;
- whether retry is safe;
- next action.

No silent fallback to old parser, full-PDF delivery, direct database writes, or unvalidated JSON.

---

## 26. Observability and audit

### 26.1 Feature registry

Register:

- Assembly Workspace route/surface;
- Activity Revision surface;
- Book student runtime;
- Affected Homework Review;
- new actions and outcomes.

### 26.2 Required action events

At minimum:

- source upload started/succeeded/failed;
- manifest candidate imported/validated/rejected;
- Unit JSON prompt copied/fallback opened;
- Unit bundle candidate imported/validated/rejected;
- Activity context/presentation declaration validation succeeded/failed;
- source-assisted missing-context validation denied;
- runtime preview opened;
- Unit draft saved/published;
- page mapping changed;
- Activity revision prompt copied;
- Activity candidate imported/validated/rejected;
- Activity revision published;
- affected-homework review opened/dismissed;
- homework update planned/confirmed/succeeded/partially failed/failed;
- regrade executed;
- Review Checkpoint created;
- notification dispatch succeeded/failed;
- student source delivery authorized/denied;
- autosave succeeded/failed/retried;
- Activity submitted.

### 26.3 Audit requirements

Update audit records:

- actor;
- timestamp;
- reason;
- Book/Activity;
- old/new versions;
- selected homework;
- classification;
- affected student counts;
- checkpoint counts;
- regrade counts;
- notification counts;
- idempotency key;
- completion/failure status.

Audit records must not contain sensitive payloads.

### 26.4 Announcements

All user-facing create/save/update/publish/assign/remove outcomes follow `documentation/rules/announcements.md`.

Use:

- `role="status"` for success/info/warning;
- `role="alert"` for failures.

Do not use `alert()`, one-off page banners, or silent success.

---

## 27. UI and accessibility requirements

### 27.1 General

- Follow `DESIGN.md`.
- Follow `documentation/architecture/ui-design-standards.md`.
- Follow teacher and student shell architecture rules.
- Do not add Mantine.
- Use real buttons for SVG icons.
- Icon-only buttons require accessible names and tooltips.
- Preserve visible focus.
- Support keyboard navigation.
- Do not rely on color alone for validation, progress, or change classification.

### 27.2 Teacher workspace

- Dense information is allowed, but hierarchy must remain calm and legible.
- Keep actions next to the object they change.
- Disable publish/assign controls until capability and validation exist.
- Show blocking errors separately from warnings.
- Preserve unsaved candidate state on non-destructive navigation where safe.
- Dirty-close confirmation required.

### 27.3 Student runtime

- Activity input targets meet touch-size requirements.
- PDF controls remain operable at browser zoom.
- Page number field has label and validation.
- Layout change does not move keyboard focus unexpectedly.
- Sticky navigator does not cover last answer or submit controls.
- Save state is announced without excessive screen-reader noise.
- Reference-only `pdf_focus` transition is understandable.
- Review-only/excluded state is textually explained, not only struck through.

---

## 28. Compatibility and migration

### 28.1 Existing Books

- Existing test-based Books continue to work.
- Existing `test` nodes remain valid.
- Existing Book refs retain current behavior.
- Adding `unit` must not force migration of old node types.
- Existing public Book projections must remain readable.

### 28.2 Existing homework

- Existing homework types and Reading Passage sets remain unchanged.
- New Book homework uses an explicit discriminator and bundle contract.
- Existing StudentPracticePage launch branches must remain regression-tested.
- New runtime routing must not break IELTS Reading, Listening, Writing, THCS, or legacy practice.
- Reading V2 and Listening storage, schemas, routes, runtime authority, and result contracts remain independent and are not migrated to the generic Activity model.

### 28.3 Existing results

- Existing test result views remain unchanged.
- Activity result adapters must integrate through shared result contracts where possible.
- Historical Review Checkpoints must not masquerade as current submissions.
- Excluded Activity rows must remain auditable and must not alter stored historical answer payloads.

### 28.4 Existing parser

No migration from the legacy PDF parser is required. It is simply not an allowed dependency for this feature.

---

## 29. Proposed module boundaries

Names are illustrative; implementation may refine them while preserving responsibilities.

### 29.1 Activity Domain

Owns:

- Activity schema;
- atomic one-family/one-answer-rule contract;
- Task Profile registry contract;
- context-requirement validation;
- structured/source-assisted presentation validation;
- embedded stimulus and existing asset-reference validation;
- hidden Interaction ID assignment and exact-structure preservation;
- validation;
- draft candidate;
- published version;
- student-safe projection;
- semantic diff;
- grading/regrading plan.

Interface examples:

```ts
stageActivityCandidate(targetActivityId, replacementContent)
validateActivityCandidate(candidate)
saveActivityDraft(candidateId)
publishActivityRevision(activityId, expectedDraftRevision)
classifyActivityChange(oldVersion, newVersion)
```

### 29.2 Book Assembly

Owns:

- Source Version metadata;
- manifest candidate;
- Content Tree proposal;
- stable-key reconciliation;
- Placement/Page Group editing;
- Unit publication plan;
- source replacement diff.

Interface examples:

```ts
stageManifest(bookId, sourceVersionId, input)
stageUnitBundle(bookId, unitKey, input)
resolveReconciliationItem(candidateId, resolution)
validateAssemblyCandidate(candidateId)
publishUnit(candidateId)
```

### 29.3 Book Source Delivery

Owns:

- private source object;
- excerpt generation/cache;
- physical-index/book-label mapping;
- authorization grant;
- safe delivery.

The browser receives a safe resource, never storage authority.

### 29.4 Book Delivery

Owns:

- caller context normalization for Solo, Homework, Course, and Class-linked Course;
- exact Placement binding resolution;
- access decision;
- pinned Activity/Source version resolution;
- Page Group projection;
- schedule/deadline projection;
- submission/result/review metadata projection;
- student-safe runtime payload;
- reload-safe launch restoration.

Interface examples:

```ts
resolveBookDelivery(request)
listDeliveryActivities(deliveryId)
resolveActivityAttemptTarget(deliveryId, activityId)
resolveDeliveryResultVisibility(deliveryId, viewerId)
```

Callers pass context and intent. They do not inspect Book tree, manifest, Page Group, Source Version, Activity Version, or Review Checkpoint storage.

### 29.5 Book Runtime

Owns:

- PDF page state;
- rendering the right-panel Activity set from a delivery projection;
- mobile/split/pdf-focus/source-assisted modes;
- sticky navigation;
- autosave integration.
- Book-owned adapters around unchanged stable Reading/Listening exports where beneficial.

Book Runtime must not become the place where Homework, Course, Class, and Solo rules accumulate. Those rules belong behind Book Delivery.

### 29.6 Book Homework

Owns:

- assignment manifest creation;
- schedule inheritance;
- Activity completion aggregation;
- affected-homework lookup;
- update planning;
- per-student checkpoint planning;
- deadline validation;
- update audit.

Book Homework owns assignment-specific aggregation. It should call Book Delivery/Activity Domain rather than pretending a whole Book is one legacy homework submission.

### 29.7 Content Catalog

Owns:

- reusable browse/resolve interface;
- capability filtering;
- structured selection bundles;
- reference/fork provenance.

These should be deep modules. UI callers should not reconstruct tree/version/storage logic.

---

## 30. Expected repository integration points

Implementation must inspect the following integration points. Only Book-owned or genuinely shared seams may be modified. Reading V2 and Listening prior-art files are read-only unless the product owner separately authorizes work on those features.

### Material Catalog and Book

- `src/types/materialCatalog.types.ts`
- `src/services/materialCatalog/materialBooks.service.ts`
- `src/services/materialCatalog/bookEditor.service.ts`
- `src/services/materialCatalog/bookValidation.service.ts`
- `src/components/books/CreateBookModal.tsx`
- `src/components/books/BookEditorModal.tsx`
- `src/components/books/BookEditorWorkspace.tsx`
- `src/components/books/BookNodeTree.tsx`
- `src/components/books/BookMaterialPicker.tsx`

### Homework

- `src/types/homework.types.ts`
- `src/services/homeworkManager.ts`
- `src/services/homeworkSubmissionService.ts`
- `src/components/homework/HomeworkCreateModal.tsx`
- `src/pages/TeacherHomeworkDetailPage.tsx`
- `src/pages/StudentHomeworkListPage.tsx`
- `src/pages/StudentHomeworkDetailPage.tsx`

### Student launcher, runtime, and result

- `src/pages/StudentPracticePage.tsx`
- `src/pages/StudentLibraryPage.tsx`
- `src/pages/StudentCourseDetailPage.tsx`
- `src/components/test/QuestionNavigator.tsx`
- `src/hooks/solo/useSoloResume.ts`
- `src/hooks/solo/useSoloSubmission.ts`
- `src/components/results/AttemptHistory.tsx`
- `src/components/results/ResultSlidePanel.tsx`
- `src/pages/TeacherResultsPage.jsx`
- `src/pages/TeacherTestResultsPage.tsx`
- `src/pages/ResultDetailPage.tsx`
- `src/components/results/ResultDetailModal.tsx`
- `src/hooks/useTestAttempts.ts`
- `src/services/testResults.service.ts`
- `src/services/resultVisibility.service.ts`
- `src/services/resultOwnershipResolver.ts`
- `src/services/academicRecordService.ts`

Existing result UI uses separate attempt records displayed through one material result panel/dropdown. Book must preserve that convention for Activity results instead of creating a separate page for every submission.

### Course and Class

- `src/types/course.types.ts`
- `src/services/courseMaterialAccessService.ts`
- `src/services/courseSyncService.ts`
- `src/services/materialLinkManager.ts`
- `src/pages/StudentCourseDetailPage.tsx`
- `src/pages/TeacherClassDetailPage.tsx`
- `src/pages/StudentClassDetailPage.jsx`
- class/course manager services after exact ownership path is confirmed.

Course/Class Book integration must resolve exact Course material placement/context, not only `materialId`.

### Version/update prior art

Inspect as prior art; do not change merely to support Book:

- `src/services/courseSyncService.ts`
- `src/services/materialLinkManager.ts`
- `src/services/reading-v2/readingV2PassageHomework.service.ts`
- `src/services/reading-v2/readingV2Projection.service.ts`

### Live Session boundary

Inspect as future-scope launch prior art only:

- `src/pages/TestPageRouter.tsx`
- `src/services/sessionManager.js`
- `src/hooks/session/useSessionManager.ts`
- live-session skill/runtime folders under `src/features/assessment/` and `src/skills/`.

Book execution inside Live Session is not V1 scope.

### Assessment taxonomy/runtime prior art

Inspect as read-only design and reuse evidence. Reuse an exported implementation only if it works unchanged behind a Book-owned adapter:

- `documentation/samples/IELTS-reading-question-type-display-design.md`
- `documentation/samples/IELTS-listening-question-type-display-design.md`
- `documentation/samples/IELTS-question-task-type-samples.md`
- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-taskgroup-object.md`
- `src/services/reading-v2/readingV2TaskComponentContracts.service.ts`
- `src/services/reading-v2/readingV2InstructionTemplates.service.ts`
- `src/skills/listening/components/ListeningQuestionDisplay.tsx`
- `src/skills/listening/components/ListeningInstructions.tsx`

### Notifications

- `src/types/notification.types.ts`
- `src/services/notificationService.ts`
- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationPanel.tsx`

### Routes, tracking, and security

- `src/routes/teacherRoutes.tsx`
- `src/routes/studentRoutes.tsx`
- `src/constants/routes.ts`
- `src/config/featureRegistry.ts`
- `src/config/routeSecurity.ts`
- `database.rules.json`
- `firestore.rules`
- R2 upload/delivery Worker code after its actual repository location is confirmed.

This list is not permission to modify every file. Each implementation packet must identify the smallest owned seam and preserve unrelated changes.

---

## 31. Testing strategy

### 31.1 Schema and domain tests

Prove:

- every supported interaction family validates;
- unsupported types fail closed;
- one Activity cannot declare mixed interaction families or conflicting answer rules;
- optional Task Profiles accept registered namespaced taxonomies and ordinary Activities may omit them;
- embedded stimulus is distinct from interaction family;
- generic Task Group, Task Set, and first-class Resource payloads are rejected by the V1 schema;
- context requirement must be `none`, `optional`, or `required`;
- unresolved required context blocks publish;
- `structured` and `source-assisted` are the only supported presentation modes;
- source-assisted mode without mapped required Book pages fails closed;
- hidden Interaction IDs are generated by the app and rejected in editable JSON;
- exact structurally safe revisions preserve hidden Interaction IDs by position;
- changed/added/removed/reordered Interactions receive new IDs and classify as redo-required;
- forbidden IDs/placement fields in revision JSON are rejected;
- full-content replacement removes omitted content;
- invalid candidate leaves current draft untouched;
- published versions are immutable;
- student projection excludes hidden answers and authoring data;
- semantic classification matches the change table.

### 31.2 Book structure tests

Prove:

- `unit` is accepted;
- legacy `test` remains accepted;
- depth limit remains five;
- cycles/missing parents/duplicate keys fail;
- current Activity numbering compacts after delete/move;
- stable IDs preserve refs across reorder;
- staged publication hides missing Units from students.

### 31.3 Manifest and reconciliation tests

Prove:

- exact-key match;
- fuzzy match is suggestion only;
- rename/reorder preserves identity;
- cross-Unit move requires explicit resolution;
- one Activity maps to multiple pages;
- one page maps to multiple Activities;
- reference-only page works;
- page gaps/overlaps/duplicates fail or warn according to contract;
- source replacement preserves Activities and requires mapping reconciliation.

### 31.4 Runtime component tests

Prove:

- page 58 renders mapped Activities;
- pages 61–63 retain one Activity set;
- page 77/78 preserve shared Activity state;
- out-of-Unit page input is rejected;
- Previous/Next boundaries work;
- reference-only page enters PDF focus;
- structured Activity renders its supported stimulus and answer controls;
- source-assisted Activity renders the mapped PDF exercise and labelled right-side answer controls;
- source-assisted Activity cannot launch when required page context is missing;
- panel collapse restores state;
- mobile tab switch preserves answers;
- pill navigation focuses correct Activity/question;
- autosave flushes before page switch;
- failed save warns and retries;
- submission remains per Activity.

### 31.5 Source delivery security tests

Positive:

- authorized student receives exact Unit excerpt;
- correct Source Version and page labels render;
- range requests work if supported.

Negative:

- unauthenticated request denied;
- wrong student denied;
- wrong assignment denied;
- wrong Book/Unit denied;
- modified page range denied;
- answer-key page denied;
- old/expired grant denied;
- direct private R2 object unavailable;
- full original PDF unavailable.

### 31.6 Homework schedule tests

Prove:

- nearest ancestor deadline inheritance;
- final deadline fallback;
- nested deadline later than parent rejected;
- extensions allowed;
- unsafe shortening after start rejected;
- open access default;
- scheduled release inheritance;
- deadline does not hide content;
- per-student extension remains effective.

### 31.7 Homework update matrix tests

For not-started, in-progress, and submitted students, prove each:

- display-only change;
- regrade-only change;
- redo-required Activity;
- new Activity;
- removed Activity;
- reorder;
- move;
- new Unit;
- expired deadline.

Specific assertions:

- unchanged work remains valid;
- only affected Activities reopen;
- one checkpoint per student/update action;
- checkpoint includes only started/submitted affected Activities;
- no checkpoint for not-started Activity;
- no checkpoint for removal;
- excluded removal has no points/completion/marking effect;
- retry creates no duplicates;
- notification wording/metadata matches case;
- feedback release policy remains enforced.

Book Homework settings assertions:

- `maxAttempts` is counted per Activity, not per whole Book assignment;
- feedback timing is evaluated per Activity result;
- late policy follows each Activity's inherited deadline;
- anti-cheat is ON by default for Book Homework;
- teacher can disable anti-cheat only through an explicit casual-practice setting;
- disabled anti-cheat state is saved in assignment metadata;
- anti-cheat mode logs focus/tab/paste/session events per Activity attempt;
- anti-cheat warning appears to the student immediately after a recorded event;
- repeated events raise integrity severity;
- anti-cheat never auto-submits, auto-locks, auto-zeroes, or prevents completion;
- teacher result page shows Activity integrity report after submission;
- teacher cannot view live integrity monitoring for Book Homework in V1;
- V1 does not add built-in post-homework action buttons or special consequence workflow;
- student cannot view post-submission integrity log/status/count/severity.

### 31.8 Cross-feature delivery tests

Prove:

- Student Practice launcher can dispatch Book without breaking Reading, Listening, Writing, THCS, or Reading V2 launches;
- Book launch survives reload without relying only on `location.state`;
- Book Delivery rejects mismatched student/context/placement combinations;
- Solo draft does not overwrite Homework draft for the same Activity;
- Homework draft does not overwrite Course draft for the same Activity;
- two Course placements of the same Activity have separate draft/progress state;
- same Activity attempts from Solo and Homework group under one Activity result panel/dropdown;
- grouped result display does not transfer completion between Solo, Homework, Course, and Class contexts;
- teacher-owned Homework/Course/Class result visibility does not expose private Solo attempts;
- Homework feedback release timing gates Homework attempt feedback;
- assignment flow warns when delayed/manual-feedback Homework selects Activities that may already be visible through Solo or prior feedback;
- warning-first policy does not automatically lock Solo access;
- forked/copied Activity uses separate Activity ID and separate result history when teacher needs secrecy;
- Course material placement resolves by exact placement/context, not ambiguous bare `materialId`;
- Course item for a Book subtree completes when required Activities are submitted;
- optional Homework-created-from-Course progress credit updates Course progress only when enabled;
- class-linked Course copies receive Book changes only through explicit sync/update;
- archived Book blocks new placement but preserves existing pinned deliveries.

### 31.9 Rules and emulator tests

Prove role and ownership boundaries for every new data node. Include malicious cross-owner/cross-student writes and reads.

### 31.10 Regression tests

At minimum preserve:

- existing Book create/edit/publish tests;
- existing Book ref repair tests;
- existing homework create/detail/list tests;
- Reading V2 pinned assignment launch;
- IELTS Listening/Reading/Writing/THCS StudentPracticePage routing;
- Notification Bell behavior;
- result visibility and ownership behavior.
- Reading V2 and Listening dependency-boundary tests proving neither feature imports from or depends on the new Book Activity module.

### 31.11 Browser verification

Use:

- teacher: `http://localhost:5173`;
- student: `http://localhost:5174`;
- built-in dev quick-login buttons.

Required browser matrix:

- teacher desktop Assembly Workspace;
- teacher affected-homework flow;
- teacher result page Activity integrity report;
- student desktop split runtime;
- student reference-only/PDF focus;
- student mobile tabs;
- reload/autosave resume;
- case-specific notification navigation;
- previous-version review;
- keyboard and accessible-name checks;
- no console errors.

---

## 32. Pilot plan

Use one representative Unit from each supplied source:

1. *IELTS Grammar for Bands 6.5 and Above*;
2. *IELTS Vocabulary up to Band 6.0*.
3. *IELTS Vocabulary for Bands 6.5 and Above*, including the inspected Listening note-completion practice and Reading practice with matching plus Y/N/NG.

For each pilot Unit:

1. user uploads immutable PDF;
2. user supplies a page/activity manifest;
3. user supplies answer-key evidence and Unit Activity JSON;
4. Assembly Workspace validates and previews;
5. teacher publishes Unit;
6. student completes it in desktop and mobile runtime;
7. teacher assigns it as homework;
8. revise one Activity and exercise every update case;
9. replace source PDF/manifest in a controlled test and reconcile mappings;
10. record correction rate, unsupported interaction patterns, import errors, runtime issues, and teacher effort.

NotebookLM-generated lists may be used as user-supplied manifest input, but are not trusted automatically. The app validates structure and page bounds; the teacher remains responsible for approving the mapping and Activity correctness.

---

## 33. Acceptance criteria

The V1 feature is accepted only when all statements below are true.

### Assembly

- [ ] Existing Book system can create/host the new Book without parallel storage.
- [ ] Source PDF upload creates an immutable version.
- [ ] Manifest import creates a validated proposed Content Tree.
- [ ] Stable node and Activity keys bind to immutable internal IDs.
- [ ] Unit Activity JSON imports atomically.
- [ ] Invalid import cannot alter current draft or publication.
- [ ] Actual student runtime preview is available before publish.
- [ ] Unit can publish while later Units remain missing.
- [ ] Page mapping can be repaired without editing Activity JSON.
- [ ] Source replacement reconciles links without reimporting unchanged Activities.
- [ ] Unit and revision prompt-copy flows work with fallback.
- [ ] Copied Unit prompt requires namespaced Task Profiles where applicable, one interaction family, context requirement, and presentation mode.
- [ ] Copied Unit prompt explains structured versus source-assisted selection with examples and forbids unsupported visual approximation.
- [ ] App validates prompt-produced declarations; it does not silently generate or semantically guess Activity content.

### Runtime

- [ ] Activity is the atomic generic reusable/submission/update unit; no generic Task Group or Task Set layer exists.
- [ ] One Activity has one interaction family and shared answer rule.
- [ ] Local stimuli version with Activity; V1 adds no first-class Resource domain.
- [ ] Optional Task Profile preserves exam taxonomy without coupling generic runtime identity to IELTS/SAT/TOEFL/TOEIC.
- [ ] Context requirement supports none, optional, and required.
- [ ] Hidden Interaction IDs support autosave/results and safe regrading without appearing in editable JSON.
- [ ] Both structured and source-assisted presentation modes work.
- [ ] Student receives only authorized Unit pages.
- [ ] Full PDF and answer-key pages are inaccessible.
- [ ] Single-page navigation is deterministic.
- [ ] Many-to-many Page Group examples work.
- [ ] Reference-only page uses one full-width PDF viewer.
- [ ] Right panel stacks mapped Activities.
- [ ] Sticky navigator moves to the correct Activity/question.
- [ ] Desktop panel collapse preserves state.
- [ ] Mobile tabs preserve state.
- [ ] Autosave survives reload and page changes.
- [ ] Activity submit/result/review works.
- [ ] No enforced timer exists; optional personal timer has no academic effect.

### Homework

- [ ] Teacher can assign whole Book or eligible subtree.
- [ ] Assignment preview lists inclusions/exclusions.
- [ ] Assignment pins Activity and Source versions independently.
- [ ] Required final deadline works.
- [ ] optional nested deadlines inherit correctly.
- [ ] Open and scheduled access modes work.
- [ ] Student submits each Activity independently.
- [ ] Book completion aggregates current required Activities.
- [ ] No whole-Book submit exists.
- [ ] No unapproved aggregate Book grade is shown.
- [ ] `maxAttempts`, feedback timing, and late policy apply per Activity/delivery.
- [ ] Teacher can configure Book Homework anti-cheat/integrity mode.
- [ ] Book Homework anti-cheat/integrity mode is ON by default.
- [ ] Teacher can turn anti-cheat OFF only through explicit casual-practice assignment setting.
- [ ] Anti-cheat records focus/tab/paste/session events per Activity attempt.
- [ ] Anti-cheat warns student but never blocks completion or force-submits.
- [ ] Teacher result page shows integrity report and severity after submission.
- [ ] Book Homework V1 has no live teacher integrity monitoring while students are working.
- [ ] V1 adds no special post-homework action buttons or consequence workflow for flagged work.
- [ ] Student does not see post-submission integrity log/status/count/severity.

### Cross-feature delivery

- [ ] Existing Student Practice launcher mounts Book through one Book dispatch path without breaking existing material types.
- [ ] Book Delivery owns access, pinned versions, page/source projection, schedule state, result state, and reload-safe launch restoration.
- [ ] Solo Book Practice Run works as navigation/progress container.
- [ ] Course/Class can place a Book subtree or Activity as one material item.
- [ ] Course/Class placement resolves exact context, not ambiguous `materialId`.
- [ ] Activity attempts/results are grouped by student plus Activity with an attempt dropdown.
- [ ] Drafts, attempts, completion, and feedback gates remain context-scoped.
- [ ] Teacher result visibility never exposes private Solo attempts.
- [ ] Delayed/manual-feedback assignment warns when Activities may already be visible in Solo or prior feedback.
- [ ] V1 does not automatically lock Solo access; secrecy uses fork/copy.
- [ ] Archived Books block new placement while preserving already pinned deliveries.
- [ ] Live Session data contract is prepared, but Book Activity execution in Live is not required for V1.

### Updates

- [ ] Publishing a change shows Affected Homework Review.
- [ ] No homework updates silently or by default.
- [ ] Teacher can select target homework and affected Activities.
- [ ] Not-started, in-progress, submitted, and mixed cases behave as specified.
- [ ] Review Checkpoint contains only affected prior work.
- [ ] Unchanged Activities remain valid.
- [ ] Point/key/rubric changes regrade without redo.
- [ ] Removal excludes historical row without deleting it or reopening work.
- [ ] Reorder does not reset work.
- [ ] New content requires a valid future deadline.
- [ ] One case-specific persistent notification is created per student/update action.
- [ ] Update retry is idempotent.

### Quality and safety

- [ ] New UI follows design, shell, mobile, and accessibility rules.
- [ ] New actions use shared announcements.
- [ ] New routes/actions are observable.
- [ ] Telemetry contains no content or sensitive payload.
- [ ] Rules and negative authorization tests pass.
- [ ] Existing Book, homework, runtime, result, and notification regressions pass.
- [ ] Legacy PDF parser is not referenced by the new feature.

---

## 34. Explicitly superseded proposals

The following statements from the baseline document or early discussion are no longer requirements:

| Superseded proposal | Current decision |
|---|---|
| Whole-Book homework deferred | Whole Book and eligible subtree homework are required. |
| One deadline per Book | Required final deadline plus optional inherited structural deadlines. |
| All chapters always open | Teacher chooses Open or Scheduled access; Open is default. |
| Refresh blocked after any student starts | Explicit selective update is allowed with checkpoints and audit. |
| Replacement homework always starts fresh | Only affected Activities reopen; unchanged work remains valid. |
| Whole-assignment force reset | Per-Activity bindings advance selectively. |
| One review result per changed Activity | At most one student-specific checkpoint per update action, containing affected Activities only. |
| Removed in-progress work becomes review-only | Removal creates no checkpoint and no student action. |
| Source/PDF label shown beside app order | One visible canonical Activity order only. |
| Point changes default to redo | Recalculate/regrade saved answers; no redo. |
| Answer-key change requires redo | Regrade saved answers; no redo. |
| Full PDF page images/tiles required | Immutable original plus authorized Unit PDF rendition; exact engine remains a spike. |
| Automatic OCR/AI mapping in V1 | User supplies PDF, manifest, and Unit JSON; no OCR/AI mapping backend in V1. |
| Current `aiService` performs mapping | It is unsuitable and not used. |
| No Book Maker UI | Build a focused Book Assembly Workspace, not an automatic/full maker. |
| Activity content read-only for teachers | V1 supports revision-by-JSON with diff and preview. |
| Page mapping inside Activity JSON | Manifest/Placement/Page Group owns page mapping. |
| Per-Activity PDF delivery | Runtime authorizes a Unit page slice and routes pages through Page Groups. |
| Block-level page anchors | Page Groups map pages to whole Activities; right panel scroll handles internal content. |
| Continuous PDF scroll | Single-page Previous/Next/page-input navigation. |
| Teacher-defined Activity timer | No enforced timer; optional personal student timer only. |
| Interaction IDs exposed in replacement JSON or manually reconciled | Rejected; hidden app-managed IDs support autosave/results and survive only exact structurally safe revisions. |
| Flat primitive `blocks` as the generic Activity contract | Activity directly owns Task Profile, presentation mode, context requirement, instructions, one interaction family, one answer rule, embedded stimulus, asset refs, and ordered Interactions. |
| Generic Activity containing nested Task Groups | Rejected after schema review; Activity absorbs the useful Task Group semantics and is the atomic generic unit. |
| Generic Task Set composition layer | Rejected as unnecessary; Book Nodes and structured subtree selection group Activities. |
| IELTS-only `officialTaskType` field | Namespaced optional `taskProfile.taxonomyId/typeId/taxonomyVersion`. |
| `content` or `table-entry` as fundamental interaction families | Presentation belongs to embedded stimulus; answer behavior uses choice, text-entry, matching, ordering, or long-response families. |
| Activity-level Resource registry or first-class shared Resource domain in V1 | Rejected as over-design; embed local stimuli, use existing media asset refs, and use Placement/Page Groups for Book pages. |
| App semantically auto-detects Activity context/presentation | External ChatGPT/Codex declares them; app validates deterministically and teacher reviews. |
| Custom renderer for every unusual textbook layout | Use controlled source-assisted mode with PDF context and labelled answer controls. |
| Mandatory source-assisted acknowledgement checkbox | Rejected; valid manifest/JSON metadata and normal deterministic publish validation are sufficient. |
| Refactor Reading V2/Listening to share the Book model | Existing features remain independent; reuse only unchanged stable interfaces or Book-owned adapters. |
| Full visual Activity editor in V1 | Revision-by-JSON first; quick visual editing may follow. |
| Dedicated standalone Book route is required | Existing launchers mount Book through a thin dispatch path; a dedicated route is allowed only if needed for reload-safe delivery. |
| `activityId` alone is enough for integrations | Book-originated integrations use a frozen Placement binding with Book, Manifest Version, Placement, Activity, Activity Version, and title snapshot. |
| Every Activity submission gets a separate result page | Separate attempts are grouped under one student-plus-Activity result page/panel with an attempt dropdown. |
| Course should explode a selected Unit into many Course material cards | Course uses one material item per selected Book subtree or Activity; Activity progress appears inside that item. |
| Existing Homework submission can represent a whole assigned Book | Book Homework uses Activity-level submissions/progress plus assignment aggregation; no whole-Book submit exists. |
| Book Activity execution inside Live Session is V1 | V1 prepares contracts only; Live execution is a later adapter with separate session-freezing and monitor rules. |
| No anti-cheat mode for Book Homework V1 | Rejected; V1 includes teacher-configurable anti-cheat/integrity mode that is ON by default and warns/records suspicious events without blocking completion. |
| Live teacher monitoring for Book Homework integrity in V1 | Rejected; Book Homework integrity report appears on teacher result page after submission only. |

---

## 35. Open implementation decisions

Resolved by repository audit:

```text
Book Activity uses generic material kind: interactive-activity.
```

Resolved by product decision:

```text
Cross-context answer/feedback visibility uses warning-first policy.
V1 does not lock Solo access automatically.
Teacher forks/copies the Activity when secrecy matters.
```

```text
Book Homework settings apply per Activity/delivery.
Book Homework supports teacher-configurable anti-cheat/integrity mode.
Book Homework anti-cheat/integrity mode is ON by default.
Teacher may disable anti-cheat only for casual practice assignments.
Anti-cheat warns and records suspicious events, but does not block completion or force submit.
Teacher result page shows the integrity report after submission.
Book Homework V1 has no live teacher integrity monitoring while students are working.
V1 adds no special post-homework action buttons or consequence workflow.
Student receives warnings during work only and sees no post-submission integrity log/status/count/severity.
```

These items require technical validation, not new product discovery:

1. Exact persistent storage layout for Activity versions, candidates, Placements, Page Groups, Source/Manifest versions, update actions, and Review Checkpoints.
2. Exact trusted backend runtime and PDF engine for private Unit rendition generation.
3. Whether Unit renditions are generated at publish time, lazily, or through a hybrid cache.
4. Exact result adapter/component reuse for Activity review.
5. Exact transaction/batch/reconciliation implementation for large homework updates.
6. Exact route organization inside the existing Book editor and student launch path.
7. Exact future visual quick-edit fields after pilot correction patterns are known.
8. Exact initial embedded stimulus registry and supported existing image/audio asset-reference forms.
9. Which existing Reading/Listening pure components or services are genuinely reusable unchanged versus should only inform new Book-owned implementations.
10. Whether V1 corrects a wrong generated presentation mode through JSON re-import, a workspace override, or another controlled workflow. Recommendation: JSON re-import first unless pilot use proves this is too slow.
11. Exact anti-cheat event thresholds and severity labels after implementation spike.

One product decision intentionally remains closed for V1:

```text
No aggregate Book academic grade.
```

A later PRD may define weighted grading after real Activity data exists.

---

## 36. Definition of done

“Done” means:

- code, rules, backend, UI, tests, docs, feature registry, and observability agree;
- selected pilot Units from the supplied grammar and vocabulary sources work end to end;
- teacher can assemble, publish, assign, revise, and selectively update;
- student can securely read, answer, save, submit, review, and redo only affected work;
- historical work is reproducible;
- no full PDF or answer-key leakage is possible through supported routes;
- no accepted decision in this PRD is silently deferred;
- remaining deferred work is listed as future scope rather than represented as implemented.
