# Reading V2 Task Editor Architecture Notes

Updated: 2026-05-01

## Design Inventory

Source inspected: `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/each_question_task_type_design/`.

Local folders with task-type examples:

- `ielts_choice_short_answer_editors`: Multiple Choice, Multiple Selection, Short Answer Questions.
- `ielts_completion_task_editors_sidebar_removed`: Sentence Completion, Note Completion, Summary Completion.
- `ielts_flowchart_diagram_editors`: Flowchart Completion, Diagram Labelling.
- `ielts_flow_chart_info_editors_sidebar_removed`: Matching Information; flowchart appears only as surrounding/helper context here.
- `ielts_judgement_structured_editors_sidebar_removed`: Yes / No / Not Given plus composite examples for Diagram Labelling, Table Completion, and Short Answer.
- `ielts_judgement_task_editors`: True / False / Not Given, Yes / No / Not Given.
- `ielts_list_summary_note_completion_editors`: Summary Completion from List, Note Completion.
- `ielts_matching_choice_editors_sidebar_removed`: Matching Headings, Matching Features, Multiple Choice, Multiple Selection.
- `ielts_matching_features_endings_editors`: Matching Features, Matching Sentence Endings.
- `ielts_matching_headings_information_editors`: Matching Headings, Matching Information.
- `ielts_sentence_summary_completion_editors`: Sentence Completion, Summary Completion.
- `ielts_table_completion_editor`: Table Completion.
- `academic_precision`: supporting design-system note, not a task-type editor.

Do not assume a one-folder-per-task-type Stitch package. Several examples are composite task workspaces.

## Implementation Contract

The visible Build Workspace uses:

- `ReadingV2QuestionGroupCard` as the shared question-group card shell.
- `ReadingV2TaskEditorRegistry` as the task-type registry keyed by `ReadingV2CanonicalTaskType`.
- The canonical Reading V2 draft model as source truth.
- The existing Build Test shell and passage-left/questions-right layout.

Active registry entries render through dedicated task-type registry definitions. Most task types share proven editor primitives for instructions, options, question rows, answer keys, and word limits. Table Completion uses the dedicated table builder.

## Active Editors

Active and visible end-to-end:

- Multiple Choice
- Sentence Completion
- Matching Headings
- True / False / Not Given
- Summary Completion from List
- Yes / No / Not Given
- Summary Completion from Text
- Note Completion
- Matching Information
- Matching Features
- Matching Sentence Endings
- Multiple Selection
- Short Answer
- Table Completion

These save into canonical draft state, preview through `ReadingV2RuntimeShell`, publish through the existing Reading V2 projection path, and render in student runtime from projections.

## Stitch Gap Closure Notes

The local Stitch references emphasize rounded task cards, quiet academic surfaces, visible answer-key states, inline blank chips, hover/fade motion, and table question chips inside blank cells. The current implementation now closes the foundational gaps that can work end-to-end:

- shared question-group cards show task-specific guidance and feature chips
- completion tasks show whether a visible blank marker is present and provide an Insert blank repair action
- missing answer-key fields receive a visible warning state
- Multiple Selection answer choices use selected tiles and show selected-count feedback
- destructive question and group deletion requires confirmation before mutating draft state
- Table Completion blank cells show question-number chips in the authoring table, including merged cells with multiple blanks
- Table Completion uses the Stitch-style grouped table toolbar above the grid for row/column edits, merge/split, selected blank marking, header-row marking, and selection clearing
- completion-family prompts without a visible blank marker are blocked by publish validation and are repairable from the authoring row
- card entry, hover, and selected-state motion is aligned with the Stitch samples and respects reduced-motion preferences

Remaining deeper design gaps are intentionally not faked: official group-level Multiple Selection answer-slot modeling, paragraph-derived matching rows, rich passage editing, Flowchart Completion, and Diagram Labelling still require data/runtime work before they can be promoted as complete active workflows.

## Inactive Editors

Inactive and hidden/disabled from teacher creation:

- Flowchart Completion
- Diagram Labelling

Flowchart and diagram registry entries exist to make the 16-task registry exhaustive, but they are inactive until authoring and runtime behavior are complete. Diagram remains blocked on persisted image upload; local-only object URLs are not acceptable.
