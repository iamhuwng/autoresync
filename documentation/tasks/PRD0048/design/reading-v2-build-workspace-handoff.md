##Final design handoff content


# PRD0048 Reading V2 Build Workspace Handoff

## Purpose

This handoff defines the new teacher-facing Reading V2 Build Test workspace.

The current Reading V2 Studio UI must not ship as the teacher-facing product. It exposes internal schema concepts and does not match how teachers build IELTS Reading tests.

The backend can remain schema-first. The visible teacher UI must be redesigned.

---

## Visual Source of Truth

The Stitch design files are the visual source of truth.

Store or reference them here:

```text
documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/
````

Expected files:

```text
01-build-workspace.png
02-add-question-group-modal.png
03-question-group-editor.png
04-empty-validation-states.png
stitch-export.zip
```

Use these Stitch screens:

1. Main Build Test workspace
2. Add Question Group modal
3. Question group editor examples
4. Empty and validation states

The Stitch files define the visual layout.

This handoff defines behavior, data rules, validation rules, and implementation constraints.

If the Stitch visuals and this handoff conflict, stop and report the conflict instead of guessing.

---

## Product Goal

A teacher should be able to build an IELTS Reading test by seeing:

* the selected passage on the left
* the questions for that passage on the right

The UI should feel like building an IELTS Reading paper, not editing schema objects.

---

## Architecture Rule

Keep the schema-first backend architecture.

Keep the canonical draft model.

Do not merge internal data models just because the teacher-facing UI is combined.

The redesign changes the teacher-facing authoring UI only.

---

## New Flow

Replace separate “Passages” and “Questions” authoring steps with one combined step:

```text
Test Info → Build Test → Review → Publish
```

The main redesign is the **Build Test** step.

---

## Build Test Layout

The Build Test screen has:

1. Top action bar
2. Passage selector
3. Split workspace

### Top action bar

Required actions:

* Save Draft
* Validate
* Preview
* Publish
* Exit

Rules:

* Save Draft is always available.
* Validate shows teacher-readable validation messages.
* Preview opens the student-facing preview.
* Publish is disabled until required issues are fixed.
* Exit should avoid accidental loss of unsaved work.

---

## Passage Selector

Show:

* Passage 1
* Passage 2
* Passage 3

Scope:

* This three-passage selector and any `Add Passage` affordance apply only to manual blank test creation, paste/import Studio outcomes, and Auto V4 Studio outcomes.
* Individual Reading Passage Studio is a one-passage editor. It must not show `Add Passage` or collection-level passage removal, even if older Stitch screen exports include that visual affordance.
* Obsolete interpretation retired 2026-06-15: Stitch Add Passage links are visual source art for allowed creation modes only, not a universal Studio control.

Behavior:

* Selecting Passage 1 shows Passage 1 content on the left and Passage 1 questions on the right.
* Selecting Passage 2 shows Passage 2 content on the left and Passage 2 questions on the right.
* Selecting Passage 3 shows Passage 3 content on the left and Passage 3 questions on the right.
* Question numbering remains global across the whole test.

---

## Left Panel: Passage Editor

The left panel is for the selected passage.

Required fields:

* Passage title
* Passage text
* Add table
* Add image
* Add diagram

Teacher-facing labels:

* Passage
* Passage title
* Passage text
* Add table
* Add image
* Add diagram

Do not use internal labels such as:

* stimulus
* canonical
* schema
* provenance
* extraction scope
* material kind
* anchor
* task group ID
* revision token

If rich text editing is not ready, plain text editing is acceptable for MVP.

---

## Right Panel: Questions for Selected Passage

The right panel shows only the question groups linked to the selected passage.

Header example:

```text
Questions for Passage 1
```

Required controls:

* Add Question Group

Each question group card must show:

* question range
* IELTS question type
* instructions
* questions
* options, where needed
* correct answers inside the card
* add question control
* duplicate/delete controls where safe

Answer keys must stay inside question group cards.

---

## Add Question Group Modal

The modal must show all 16 IELTS Reading task types.

### Completion

* Sentence Completion
* Summary Completion: words from passage
* Summary Completion: choose from list
* Note Completion
* Table Completion
* Flowchart Completion
* Diagram Labelling

### Judgement

* True / False / Not Given
* Yes / No / Not Given

### Matching

* Matching Headings
* Matching Information
* Matching Features
* Matching Sentence Endings

### Choice

* Multiple Choice
* Multiple Selection

### Short Answer

* Short Answer Questions

Rules:

* Do not silently default to sentence-completion.
* Teacher must choose the task type.
* Created group must link to the currently selected passage.
* Created group must receive the next global question range.
* If a type is not supported end-to-end, disable it or hide it. Do not fake it.

---

## Minimum Question Editor Requirements

### Multiple Choice

* question text
* options A-D
* correct answer selector

### Sentence Completion

* instruction text
* sentence with blank
* correct answer
* word limit

### Matching Headings

* list of headings using roman numerals
* paragraph/question rows
* correct heading answer per row

### True / False / Not Given

* statement rows
* correct answer selector: TRUE / FALSE / NOT GIVEN

### Yes / No / Not Given

* statement rows
* correct answer selector: YES / NO / NOT GIVEN

### Summary Completion from List

* summary text with blanks
* option list
* correct option per blank

### Summary Completion from Passage Text

* summary text with blanks
* correct answer per blank
* word limit

### Note Completion

* note text or note rows
* blanks
* correct answer per blank
* word limit

### Table Completion

* table editor if supported
* blank cells
* correct answers for blanks
* if not supported end-to-end, disable or hide

### Flowchart Completion

* flowchart editor if supported
* step rows
* blanks
* correct answers for blanks
* if not supported end-to-end, disable or hide

### Diagram Labelling

* image upload if supported
* label rows
* correct answer per label
* if image persistence or runtime preview is not supported, disable or hide

### Matching Information

* section or paragraph references
* statement rows
* correct section/paragraph answer per row

### Matching Features

* feature list
* statement rows
* correct feature answer per row

### Matching Sentence Endings

* sentence beginnings
* ending options
* correct ending answer per row

### Multiple Selection

* question text
* options
* multiple correct answer selector
* selection count where needed

### Short Answer

* question text
* correct answer
* optional acceptable answers
* word limit

All 16 IELTS Reading task types must appear in the Add Question Group modal.

---

## Empty States

### Empty passage

Message:

```text
Start by adding the passage title and text.
```

Actions:

* Add passage text
* Import text

### No questions for selected passage

Message:

```text
No question groups for this passage yet.
```

Action:

* Add Question Group

### Imported content needs review

Message:

```text
Imported content needs teacher review before publishing.
```

Show plain review items, not schema/debug details.

---

## Validation States

Validation must use teacher-readable messages.

Examples:

* Passage 2 needs a title.
* Passage 3 has no passage text.
* Passage 1 has no question groups.
* Question 14 has no answer key.
* Diagram question needs an image.
* Table question has an empty answer cell.
* Publish is blocked until required issues are fixed.

Do not use:

* schema issue
* canonical validation
* publish-blocking placeholder
* unresolved extraction evidence
* invalid stimulus
* task group mismatch

---

## No Fake Placeholder Rule

Codex must not create UI that looks functional but does not work.

If a Stitch element is not supported by the current data model, persistence layer, validation, preview, or runtime, Codex must do one of these:

1. Implement it fully.
2. Implement a real MVP version and document the limitation.
3. Disable it with a clear explanation.
4. Hide it.
5. Put it behind a feature flag.
6. Add it to a gap list.

Forbidden fake UI examples:

* upload button that only stores temporary local state
* table editor that does not save table data
* diagram editor that does not persist image and labels
* flowchart editor that cannot preview or publish
* validation badge that does not reflect real validation
* publish button that allows unsupported broken content
* preview that does not reflect the saved draft

Rule:

```text
Visible and clickable = must work end-to-end.
Visible but not ready = disabled with a clear explanation.
Not part of MVP = hidden.
```

---

## High-Risk Features to Check

These are likely risky and must not be faked:

1. Add table
2. Add image
3. Add diagram
4. Table Completion editor
5. Flowchart Completion editor
6. Diagram Labelling editor
7. Rich text passage editor
8. Image persistence
9. Student preview for table / diagram / flowchart
10. Runtime rendering for complex visual tasks

If any of these cannot be saved, previewed, and published correctly, they must not appear as normal active features.

---

## Developer Details

Internal schema/debug information may exist only inside a collapsed panel called:

```text
Developer details
```

This panel must be hidden by default.

Normal teachers should not see:

* canonical draft
* schema version
* revision token
* provenance
* extraction scope
* task group IDs
* stimulus IDs
* anchor IDs
* material kind

---

## Implementation Gap List Requirement

Before implementation, Codex must inspect the Stitch design and classify each design element as one of:

* implemented
* MVP implemented
* disabled
* hidden
* feature-flagged
* deferred

This can be delivered as a markdown report or added to the repo, depending on the workflow.

The gap list must specifically cover:

* Add table
* Add image
* Add diagram
* Table Completion editor
* Flowchart Completion editor
* Diagram Labelling editor
* Rich text passage editor
* image persistence
* student preview for complex visual content
* runtime rendering for complex visual content

Unsupported features must not appear as active controls.

---

## Acceptance Criteria

The implementation is acceptable only if:

* Teacher can select Passage 1, Passage 2, and Passage 3.
* Left panel updates to the selected passage.
* Right panel updates to the selected passage’s question groups.
* Teacher can add a question group to the selected passage.
* Add Question Group modal shows all 16 IELTS Reading task types.
* Answer keys are edited inside question group cards.
* Normal UI does not expose schema/internal terms.
* Save Draft works with incomplete content.
* Publish is blocked when required validation issues exist.
* Preview shows the student-facing version of the draft.
* Unsupported visual features are not faked.
