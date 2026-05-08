---
title: IELTS Writing AI Suggestions And Injection 2026-04-02
description: Architecture note for the teacher-only IELTS Writing AI suggestions flow, including generation timing, cache ownership, prompt split, and comment/correction injection rules.
createdAt: '2026-04-02T10:35:04.268Z'
updatedAt: '2026-04-03T00:11:48.044Z'
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

This note records the current architecture contract for the teacher-only AI suggestions helper inside the IELTS Writing grading editor.

It covers:
- when and how suggestion runs start
- how the active essay is scanned
- where helper state and short-lived raw artifacts are stored
- how review state and continuation work
- how suggestions are approved into existing grading tools
- what remains explicitly out of scope

## Scope

The feature is a teacher productivity helper for grammar and vocabulary/expression review.

It is not a second grading artifact and it does not publish anything automatically.

## Generation Contract

- Suggestions generate on teacher open, not on student submit.
- Generation is active-task scoped. The grading page only generates suggestions for the essay the teacher is currently viewing.
- Existing cache is reused on later opens when the essay hash for that task has not changed.
- `Force Regenerate` starts a new run for the active essay and appends only new distinct findings.
- `Generate More` starts another append run for the active essay and also preserves already surfaced findings.
- Generation stays browser-side in the grading session. It is not delegated to a background worker in the current implementation.

## AI Run Contract

- Each run starts with one combined whole-essay batch request.
- The combined request asks for compact findings, not final UI prose.
- Each finding is expected to include:
  - `focus`
  - `kind`
  - `sentenceIndex`
  - `anchorText`
  - `issueFamily`
  - `title`
  - `reason`
  - optional `replacementText`
  - `confidence`
- The run ceiling is 64 accepted findings for one run on one essay.
- The AI response also returns `hasMorePotential`, which is the primary continuation signal for `Generate More`.
- Code remains authoritative for:
  - exact anchor validation
  - dedupe
  - overlap merge
  - safe `comment` vs `correction` normalization
  - review-state persistence
  - teacher-facing UI wording

## Essay Input Contract

- The AI receives one canonical indexed essay representation for the active task:
  - paragraph structure
  - global sentence indices
  - exact sentence text
  - task prompt
- The runtime no longer depends on a small fixed prompt contract such as "8 suggestions total".
- The sentence index list is the anchoring source of truth for normalization and review ordering.

## Failure And Split Contract

- If the combined run is unhealthy, the system immediately splits into 4 quadrant calls:
  - `grammar-correction`
  - `grammar-improvement`
  - `vocabulary-correction`
  - `vocabulary-improvement`
- Each quadrant requests up to 16 findings so the 4-way split still respects the 64-per-run ceiling.
- If 4 usable Gemini keys are available, those quadrant calls run in parallel with leased distinct keys.
- If fewer than 4 usable keys are available, the same 4 quadrant calls run sequentially.
- The current runtime does not silently continue into deeper paragraph or sentence window decomposition after the 4-way split.
- Partial quadrant success is preserved. If one or more quadrants fail, the run is marked `incomplete` rather than discarding the successful findings.

## Cache And Persistence Contract

- Suggestions are stored in Firestore `writing_grading_ai_cache/{submissionId}`.
- The cache is teacher-private and separate from `writing_submissions` because `writing_submissions` remains broadly readable for queue compatibility.
- The main cache document persists:
  - accumulated per-task suggestion payloads
  - essay hashes by task
  - persisted review state by task
  - per-task run state
  - normalized diagnostics by task
- Current run states include:
  - `idle`
  - `generating`
  - `complete`
  - `incomplete`
  - `interrupted`
  - `failed`
- A run lease is stored for active browser-side generation:
  - `runId`
  - `ownerSessionId`
  - `startedAt`
  - `heartbeatAt`
  - `phase`
- Stale leases are recovered on later loads and converted to `interrupted` so the page does not stay stuck in a permanent generating state.

## Diagnostic Artifact Contract

- Short-lived raw AI artifacts are stored in the subcollection:
  - `writing_grading_ai_cache/{submissionId}/generation_runs/{runId__attemptId}`
- Artifact entries persist:
  - run and attempt ids
  - task number
  - source (`open`, `force`, `continue`)
  - scope
  - provider/model
  - leased key metadata when applicable
  - prompt version and token budget
  - raw prompt
  - raw response
  - repaired parsed JSON
  - accepted-count and dropped-count summaries
  - finish and usage metadata when available
  - `hasMorePotential`
  - `createdAt`
  - `expiresAt`
- Artifact entries are operational diagnostics only and are designed for short-lived retention, not canonical grading storage.

## Security Contract

- Assigned teachers may `get`, `create`, and `update` the suggestion cache.
- `list` is denied.
- Students and unrelated teachers may not read or write suggestion cache documents.
- The same teacher-only boundary applies to the `generation_runs` artifact subcollection.
- This mirrors the privacy boundary used for private grading drafts and other helper-only grading state.

## Review Workflow Contract

- The Suggestions tab is modal-first.
- Opening the tab opens the review modal for the active essay.
- The right rail summary card shows:
  - total surfaced findings
  - pending / approved / dismissed counts
  - `Force Regenerate`
  - `Generate More` when continuation is allowed
  - `Open Review`
- The review modal is sentence-ordered and grouped so the list follows essay progression from top to bottom.
- The review modal no longer exposes a separate essay-focus navigation action because sentence grouping already follows essay progression.
- Review state is persisted per suggestion:
  - `pending`
  - `approved`
  - `dismissed`
- Review state survives later runs for the same essay hash because suggestions append rather than replacing the surfaced set.
## Injection Contract

Suggestions do not create grading output on their own.

### Comment Injection

- switches the grading page to `Comments`
- creates a saved comment immediately using the existing grading comment infrastructure
- preserves exact `from` / `to` anchor offsets
- maps `grammar` to category `gra`
- maps `vocabulary-expression` to category `lr`
- does not auto-publish grading
- is blocked if another pending comment draft already exists

### Correction Injection

- routes through the existing correction application path
- uses the exact anchored range plus the suggestion replacement text
- applies the correction mark directly without an extra teacher confirmation step
- is blocked if another correction workflow is already active
## Runtime UX Contract

- The grading page right rail now exposes four tabs:
  - `Prompt`
  - `Comments`
  - `Suggestions`
  - `Scoring`
- While a suggestion run is active, the page surfaces an in-progress state for the active essay.
- The teacher may continue reading or grading on the same page, but the UI warns against:
  - refreshing
  - closing the tab
  - navigating away
  - signing out
  - starting another suggestion run for that essay
- Route-level leave warnings cover both unsaved grading changes and active suggestion generation when both risks are present.

## Normalization And Rejection Rules

- AI output is normalized locally before persistence.
- `sentenceIndex` is authoritative; offsets are resolved locally from the immutable essay text.
- Suggestions are dropped when:
  - required fields are missing
  - focus / kind / issue family is invalid
  - the anchor cannot be found exactly
  - the anchor appears multiple times in the same sentence and cannot be resolved uniquely
  - the suggestion duplicates or overlaps an already accepted suggestion
  - the suggestion is already covered by a stronger kept correction for the same span

## Continuation Contract

- `hasMorePotential` is the primary continuation signal.
- `Generate More` is shown when:
  - the latest valid AI response says more worthwhile findings remain, or
  - the latest run is `incomplete` and the AI continuation signal is unavailable
- Follow-up runs include a prior-findings ledger so the model can avoid resurfacing findings the teacher already saw.
- The prior ledger includes surfaced findings regardless of whether the teacher approved or dismissed them, because dismissed findings are still part of the teacher's reference history.

## Explicit Non-Goals

- no student-visible pending suggestions state
- no auto-publish behavior
- no mutation of `publishedGrading` from the suggestions service
- no student-submit-time generation pipeline
- no hidden deep fallback chain beyond the immediate 4-way split in the current version

## Related docs

- @doc/architecture/ielts-writing/ielts-writing-grading-editor-state-and-compatibility-2026-04-02
- @doc/architecture/ielts-writing/ielts-writing-essay-editor-tool-contract-and-mark-composition-2026-04-02
- @doc/specs/ielts-writing-grading-editor-finalization-2026-03-30
- @doc/architecture/scheme/ielts-writing-current-state-scheme
