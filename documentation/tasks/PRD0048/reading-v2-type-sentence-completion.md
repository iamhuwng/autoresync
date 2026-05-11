# Reading V2 Type: Sentence Completion

Official slug: `sentence-completion`
Engineering family: `completion`

Companion docs:

- `documentation/tasks/PRD0048/reading-v2-task-taxonomy-index.md`
- `documentation/tasks/PRD0048/reading-v2-family-completion.md`

## Definition

Students complete sentence stems by supplying missing words or phrases from passage understanding.

## Student Surface

- shared instruction and word-limit rule
- one sentence stem per interaction
- one free-text answer per numbered item

## TaskGroup Requirements

- `officialTaskType: sentence-completion`
- shared answer rule
- ordered sentence interactions
- passage linkage for context

## AnswerRule Essentials

- word limit
- case and punctuation normalization
- accepted answer variants

## Mobile Note

Keep passage primary and open focused answer entry for the active sentence.

## Failure To Prevent

Do not flatten shared instruction into each sentence card and lose the common answer rule.
