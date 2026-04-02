---
title: IELTS Writing AI Suggestions And Injection 2026-04-02
description: Architecture note for the teacher-only IELTS Writing AI suggestions flow, including generation timing, cache ownership, prompt split, and comment/correction injection rules.
createdAt: '2026-04-02T10:35:04.268Z'
updatedAt: '2026-04-02T10:35:04.268Z'
tags:
  - architecture
  - ielts
  - writing
  - grading
  - ai
  - suggestions
---

# IELTS Writing AI Suggestions And Injection 2026-04-02

## Purpose

This note records the architecture contract for the teacher-only AI suggestions helper added to the IELTS Writing grading editor on 2026-04-02.

It covers:
- when suggestions generate
- where they are stored
- how Task 1 and Task 2 prompt selection works
- how suggestions are injected into existing grading tools
- what remains explicitly out of scope

## Scope

The feature is a teacher productivity helper for grammar and vocabulary/expression review.

It is not a second grading artifact and it does not publish anything automatically.

## Generation contract

- Suggestions generate on teacher open, not on student submit.
- Generation is per submission and warms all available tasks in one pass.
- Existing cache is reused on later opens.
- Regeneration is manual only through `Reload Suggestions`.
- If AI is unavailable, the cache records a failed state instead of retrying automatically forever.

## Prompt contract

- Task 1 and Task 2 use separate prompts because the expected language differs.
- Task 1 prompt is constrained to an explicit `Academic` or `GeneralTraining` mode.
- Current runtime data does not store that enum directly, so Task 1 uses a conservative inference:
  - explicit letter-style prompts map to `GeneralTraining`
  - otherwise Task 1 defaults to `Academic`
- Both prompts require JSON-only output, exact `sentenceIndex`, exact `anchorText`, one primary category, and a maximum of 8 total suggestions per task.

## Cache and persistence contract

- Suggestions are stored in Firestore `writing_grading_ai_cache/{submissionId}`.
- The cache is teacher-private and separate from `writing_submissions` because `writing_submissions` remains broadly readable for queue compatibility.
- Cache states are:
  - `generating`
  - `ready`
  - `failed`
- Cached entries persist:
  - normalized per-task suggestion payloads
  - generation timestamps
  - generation error state when applicable
  - essay hashes by task so future invalidation can be explicit

## Security contract

- Assigned teachers may `get`, `create`, and `update` the suggestion cache.
- `list` is denied.
- Students and unrelated teachers may not read or write suggestion cache documents.
- This mirrors the privacy boundary used for private grading drafts.

## Injection contract

Suggestions do not create grading output on their own.

### Comment injection
- switches the grading page to `Comments`
- creates a pending comment draft using the existing composer flow
- preserves exact `from` / `to` anchor offsets
- maps `grammar` to category `gra`
- maps `vocabulary-expression` to category `lr`
- does not auto-save or auto-publish
- is blocked if another pending comment draft already exists

### Correction injection
- opens the existing correction popup
- preloads the original anchor text and replacement text
- does not auto-apply the correction mark
- still depends on the teacher confirming in the popup

### Focus action
- `Focus in Essay` is an editor-navigation command only
- it selects and scrolls the anchored range in the essay editor
- it does not mutate markup by itself

## UI contract

- The grading page right rail now exposes four tabs:
  - `Prompt`
  - `Comments`
  - `Suggestions`
  - `Scoring`
- The Suggestions tab groups results into:
  - `Grammar`
  - `Vocabulary & Expression`
- Each group is split into:
  - `Comment Ideas`
  - `Corrections`

## Normalization and rejection rules

- AI output is normalized locally before persistence.
- `sentenceIndex` is authoritative; offsets are resolved locally from the immutable essay text.
- Suggestions are dropped when:
  - required fields are missing
  - the anchor cannot be found exactly
  - the anchor appears multiple times in the same sentence and cannot be resolved uniquely
  - the suggestion duplicates or overlaps an already accepted suggestion

## Explicit non-goals

- no student-visible pending suggestions state
- no auto-publish behavior
- no mutation of `publishedGrading` from the suggestions service
- no background worker or submit-time generation pipeline

## Related docs

- @doc/architecture/ielts-writing/ielts-writing-grading-editor-state-and-compatibility-2026-04-02
- @doc/architecture/ielts-writing/ielts-writing-essay-editor-tool-contract-and-mark-composition-2026-04-02
- @doc/specs/ielts-writing-grading-editor-finalization-2026-03-30
- @doc/architecture/scheme/ielts-writing-current-state-scheme
