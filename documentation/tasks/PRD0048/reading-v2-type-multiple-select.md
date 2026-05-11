# Reading V2 Type: Multiple Choice Multiple Answer

Official slug: `multiple-select`
Engineering family: `choice`

Companion docs:

- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-family-choice.md`

## Definition

Students choose more than one correct option from a visible option list.

## Student Surface

- one prompt per interaction or repeated prompt set
- one option list
- selection limit greater than one

## TaskGroup Requirements

- explicit option set
- explicit selection limit
- multi-select scoring rule

## AnswerRule Essentials

- selection mode is multiple
- exact selection limit
- option label format if shown

## Mobile Note

Keep the prompt and the required selection count visible while the student selects answers.

## Failure To Prevent

Do not normalize "choose two options" variants into single-choice.
