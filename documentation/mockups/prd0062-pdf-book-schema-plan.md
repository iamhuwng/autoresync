# PRD0062 PDF Book creation — schema, flow, and UX proposal

Status: design proposal only. This document does not change the authoritative Book Assembly, Activity authoring, source-version, preview, or publication contracts.

## Dev review basis

This proposal was reviewed against the current repo implementation, including:

- `src/components/books/BookPdfFlowWorkspace.tsx`
- `src/components/books/BookAssemblyWorkspace.tsx`
- `src/components/books/assembly/UnitActivityImportControls.tsx`
- `src/types/bookAssembly.types.ts`
- `src/services/book-assembly/unitPrompt.service.ts`
- `DESIGN.md`
- `documentation/architecture/ui-design-standards.md`

The existing trusted boundaries should remain intact: verified Source Versions, source-qualified physical pages, manifest validation, exact Unit Activity-slot matching, revision/CAS conflict handling, trusted Activity authoring, preview approval, authorization, and publish confirmation.

## Important contract correction

The current Full-PDF Book-structure prompt creates a **plan/contract**, not final Activity content. It returns:

- Book hierarchy nodes,
- Unit records,
- Activity slots,
- Page Groups,
- initial source-qualified physical-page mappings.

It explicitly does **not** return Activity content or answers. Actual Activity content is added later through the Unit Activity import/authoring path.

Therefore the teacher-facing flow should distinguish:

1. **Book plan** — Sections, Units, planned Activity slots, and suggested/initial PDF page connections.
2. **Activity content** — student-facing prompts/interactions added to the planned Activity slots.
3. **PDF page review** — review or adjust the plan's page connections before preview/publish.

This is more accurate than treating the Book plan as if it already contains final Activities, or treating Step 3 as if page mappings always start blank.

## Recommended teacher-facing view model

Keep the existing authoritative records underneath. Add a presentation/view-model layer for the guided UI.

```text
TeacherBookSetupVM
├─ book
│  ├─ bookId
│  ├─ title
│  ├─ pdfMode: full | component
│  ├─ draftStatus
│  └─ publishingUnitId            // currently Unit 1 in the MVP guided flow
│
├─ sources[]
│  ├─ sourceId                   // UI-safe identifier
│  ├─ displayLabel               // Complete Book PDF / PDF 1 / PDF 2
│  ├─ physicalPageCount
│  └─ readiness
│
├─ plan
│  ├─ status: missing | checking | ready | needs_attention
│  ├─ source: generated | imported | manual
│  └─ sections[]
│     ├─ displayNumber
│     └─ units[]
│        ├─ displayNumber
│        ├─ readiness
│        └─ plannedActivities[]
│           ├─ displayNumber
│           ├─ contentStatus: missing | ready | conflict | error
│           └─ pageConnection
│              ├─ pdfLabel
│              ├─ pages[]
│              └─ openFirstOn
│
├─ preview
│  └─ status: not_ready | ready | approved
│
├─ publication
│  ├─ permissionConfirmed
│  └─ status: draft | publishing | published
│
└─ technicalDetails
   └─ sourceKey, sourceVersionId, nodeKey, activityKey,
      pageGroupKey, schemaVersion, candidate revision,
      validator paths, CAS metadata, etc.
```

`technicalDetails` is a UI concept only. The authoritative records continue to use their existing fields and validators.

## Interaction invariants

These should be true regardless of visual treatment:

1. **Add section** always creates a root-level Section.
2. **Add unit to Section N** always creates a Unit inside that Section. Current selection must not silently become the parent.
3. Selecting a node changes the detail panel only. It does not change the meaning of creation actions.
4. The detail heading always follows selection: `Unit 2 activities`, never a static `Unit 1 content` label.
5. A manually added empty Unit is shown honestly as needing an Activity plan/slot contract before Activity content can be imported.
6. The Full-PDF Book plan may provide initial Page Groups. Step 3 is therefore **Review PDF pages** / **Connect PDF pages**, with existing suggested mappings pre-filled.
7. Guided UI does not require teachers to understand JSON, `activityKey`, `sourceKey`, `pageGroupKey`, schema versions, or revisions.
8. Invalid imports and service failures remain fail-closed. Technical detail can be disclosed without weakening validation or authorization.
9. Current MVP publication scope is explicit: **prepare and publish Unit 1 first; later Units remain private**.

## Recommended five-step flow

### 1. Prepare files

Teacher chooses:

- **One complete PDF**, or
- **Several component PDFs**.

Browser/source inspection remains before trusted upload/attachment. Do not expose storage/provider identity in normal UI.

### 2. Set up your Book

For a Full PDF, the first view is:

- **Create a Book plan** — copy planning instructions, use them with the PDF in the teacher's usual AI tool, then import the result.
- **Import an existing Book plan** — choose a previously prepared plan.
- **More options → edit outline manually** — secondary path, with a warning that a manually added Unit still needs planned Activity slots before Activity content can be added.

After a plan exists, use a master/detail layout:

```text
BOOK OUTLINE                         UNIT 1 ACTIVITIES

Section 1                           Publishing first
  Unit 1  Publishing first  →       Activity 1   Content needed
  Unit 2  Later                      Suggested pages 5–6
  + Add unit to Section 1
                                    Activity 2   Content needed
Section 2                            Suggested pages 7–8
  Unit 3  Later
  + Add unit to Section 2            [ Add activity content ]

+ Add section                        More options
                                     › Replace activity content
More ways to update plan             › Technical import details
› Create another Book plan
› Import another Book plan
```

The Book plan creates the planned Activity slots. The Unit Activity flow fills those exact slots with student-facing Activity content.

### 3. Connect PDF pages

Use Activity cards/rows rather than raw contract keys.

For Full PDF:

```text
Vocabulary in context
Complete Book PDF
PDF pages       [ 5, 6 ]
Open first on   [ 5 ]
Status: Connected
```

For Component PDFs, show the PDF selector because source identity is necessary to disambiguate local page numbers.

The initial values can come from the Book plan's Page Groups. The teacher is reviewing/adjusting them, not necessarily creating them from nothing.

Keep the existing trusted physical-page validation. Teacher-facing error example:

> Page 47 isn't in this PDF. Choose a page from 1–40.

Technical details may preserve the exact source-qualified validator message.

### 4. Review & preview

Sequence:

1. **Save & check draft** — authoritative manifest validation/persistence.
2. **Preview as student** — trusted runtime preview.
3. **Approve this preview** — preserve the existing approval gate.

Show readiness in plain language:

- PDF source ready
- Book plan ready
- Unit 1 Activity content ready
- every Activity has valid PDF pages
- no reconciliation decision pending

### 5. Publish

Keep the existing publication safety model:

- approved preview required,
- current source/permission requirement remains enforced,
- teacher explicitly confirms PDF permission,
- publish Unit 1,
- later Units stay private.

## Progressive disclosure

### Default

Show only:

- Book plan,
- Book outline,
- Sections,
- Units,
- planned Activities,
- Activity content readiness,
- PDF pages,
- preview/publish status.

### More options

Show:

- create/import another Book plan,
- replace Activity content,
- reference-only pages,
- reorder tools,
- migration/setup-change actions.

### Technical details

Show only when intentionally opened:

- JSON terminology,
- schema/prompt versions,
- node/activity/page-group/source keys,
- revision and CAS details,
- exact validator paths/messages,
- source inspection diagnostics.

This matches `DESIGN.md`: normal teacher workflows should be source-grounded and operational without exposing internal model terminology as the primary UI.

## Current implementation gaps this proposal intentionally fixes

The Dev review found several concrete differences between the current guided implementation and the recommended flow:

1. `BookAssemblyWorkspace.addNode()` currently defaults the new node parent to `selectedNodeKey`. In the guided Full-PDF screen, the global `Add another Unit` and `Add a section` actions can therefore inherit the current selection as parent. The redesign requires explicit root/Section-scoped creation semantics instead.
2. The guided Full-PDF detail panel currently hard-codes `Unit 1 content` / `Add Unit 1 content` even though `selectedUnitKey` can move to another Unit. The redesign makes the detail heading and actions derive from the selected Unit.
3. `importMockupStructure()` currently performs a shallow JSON/node-shape read, then immediately replaces local `nodes`/`units`; full authoritative manifest validation occurs later when saving. The proposed message `Your current plan was not replaced` therefore requires an implementation improvement: stage and validate the imported candidate before applying it, or preserve/restore the prior local draft if validation fails. This is a UX/state-management change, not a reason to weaken the existing authoritative validator.
4. Guided `UnitActivityImportControls` still exposes `JSON` in its primary copy, file button, drop zone, and accessible file label. The redesign keeps the same trusted import semantics while moving JSON/schema terminology behind Technical details.
5. The existing Full-PDF Book-structure prompt already requires every planned Activity slot to map reciprocally to at least one Page Group. Step 3 should therefore load those initial mappings and let the teacher review/adjust them rather than visually implying that mapping always starts empty.
6. The outer PDF flow and inner guided Assembly surface both currently own Back/Continue controls in parts of the flow. The redesign gives the outer five-step flow sole ownership of stage navigation; inner controls are task-specific actions only.

## Recovery states

### Book plan rejected

**We couldn't use this Book plan.**

Some required information is missing or does not match this PDF. Your current plan was not replaced.

`Show technical details` may reveal exact validation paths.

### Clipboard blocked

**Couldn't copy automatically.**

Select the instructions below and copy them manually.

### Empty manually-created Unit

**This Unit does not have an Activity plan yet.**

Create or import an updated Book plan before adding Activity content to this Unit.

### Activity conflict

**This Activity has a newer saved version.**

The Book plan is safe. Choose whether to keep the newer Activity or replace it with the imported version.

### Activity service unavailable

**Activity import is unavailable right now.**

Your current Book is safe. Try again later.

### Page outside PDF

**Page 47 isn't in this PDF.**

Choose a page from 1–40.

## Accessibility and responsive rules

- Keep the existing modal dialog focus trap, Escape handling, scroll lock, dirty-close confirmation, and focus return.
- Give selected Unit controls an explicit selected state (`aria-pressed`/`aria-current` as appropriate).
- Accessible action names must include scope: `Add unit to Section 2`.
- Do not use indentation or color alone to communicate hierarchy/readiness.
- Disabled Continue must have nearby explanatory text.
- Errors should be adjacent to the affected Activity/field and announced appropriately.
- Clipboard success/failure needs a status/alert announcement in addition to button-state feedback.
- Mobile touch targets remain at least 44×44px.
- At narrow widths, collapse master/detail to one column and render page mapping as Activity cards rather than a horizontally scrolling table.
- Keep the current step label visible on mobile even if non-current progress labels collapse.

## Visual direction after repo design review

The interactive mockup should follow LuyenTap's **calm precision** principle:

- flatter surfaces,
- restrained borders,
- minimal shadow,
- no decorative gradients/glass,
- compact typography,
- actions placed near the work,
- fewer nested card containers,
- status conveyed through text and structure, not color alone.

The prototype is intentionally a functional interaction model, not a new global teacher design system.

## Minimum implementation surface if approved

Likely production files:

- `src/components/books/BookPdfFlowWorkspace.tsx`
- `src/components/books/BookAssemblyWorkspace.tsx`
- `src/components/books/assembly/UnitActivityImportControls.tsx`
- `src/components/books/BookPdfFlowWorkspace.css`
- `src/components/books/BookAssemblyWorkspace.css`

Tests:

- `src/components/books/BookAssemblyWorkspace.test.tsx`
- `src/components/books/BookPdfFlowWorkspace.test.tsx`

Avoid changing trusted validators, source authority, Activity authoring services, page identity, preview approval, publication adapters, or authorization unless an implementation review proves a contract change is actually required.

## Separate future contract decision

The current assembly node contract has no teacher-visible Section/Unit title field; it stores logical node key, parent, type, and order. Therefore the minimum redesign should keep labels such as `Section 1` and `Unit 2`.

Adding editable names such as `Unit 2 · Fractions` should be a separate schema/publication/migration decision rather than being bundled into this UX correction.
