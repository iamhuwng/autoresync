# Retired Features Current State

Status: Active
Last Updated: 2026-07-05
Owner: Frontend Platform

## Purpose

This document is the current-state authority for retired Google Drive support, Reading V1, and Quiz. It links the purge boundary ADR and the implementation plan so active product docs can point to one compact source of truth instead of repeating historical feature behavior.

Sources:

- `docs/adr/0001-retired-material-purge-boundary.md`
- `docs/superpowers/plans/2026-07-05-retire-google-drive-reading-v1-quiz.md`
- `tasks/tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md`
- `tasks/findings-of-tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md`

## Retired Feature State

| Feature family | Current product state | Replacement / supported path |
| --- | --- | --- |
| Google Drive upload/playback/import support | Retired. Not approved for upload, import, streaming, playback, validation, fallback, OAuth, environment, or compatibility behavior. | Cloudflare R2 through the approved upload/storage authority. |
| Reading V1 | Retired. Not approved for new creation, launch, practice, live runtime, review, inference, or migration-by-fallback. | Reading V2 with explicit Reading V2 markers/projections/snapshots, or supported non-Reading test families. |
| Quiz | Retired. Not approved for creation, assignment, gameplay, live session mode, active session compatibility fields, or `/quizzes` client access. | Test/Listening/Writing/THCS/Reading V2 flows, with dedicated Quiz URLs rendering a retirement notice. |

## Product Rules

- Active product code must not create, assign, launch, or review new Google Drive-backed materials, Reading V1 materials, or Quiz materials.
- Dedicated Quiz URLs may render a static retirement notice because the route itself identifies the retired feature.
- Shared material, homework, session, and result URLs must fail closed or show a generic unavailable-source state when their source record has been purged and no remaining id can safely identify a retired feature family.
- Completed academic results remain retained and readable as academic records when access is otherwise authorized.
- Answer Review may use saved result snapshots. Source Review may be unavailable when original retired material was purged.
- Historical docs, task logs, conversation logs, exports, proof artifacts, and completed task text may still mention old behavior. Treat those as history unless this document or a newer active architecture doc explicitly revives a capability.
- Unfinished work for these retired families should be marked cancelled/obsolete because the feature was retired; never mark it completed merely because runtime removal made it irrelevant.

## Data And Purge Boundary

- LuyenTap may purge retired material records, drafts, active assignments, catalog/index rows, launch payloads, and app-owned references under the approved purge tooling boundary.
- Existing live sessions are ended through normal Session Closure before removal; no mixed-session migration or hard deletion of completed results is introduced.
- Completed submissions, academic result records, result indexes needed for authorized access, and saved answer-review data are protected.
- Files stored in users' Google Drive accounts are outside LuyenTap deletion authority. No reconnect, reauthorization, or manual Google Drive provider cleanup workflow is part of the product.
- No retired-material ID registry or database tombstone is required after purge. UI must use route context or retained result snapshot context, not deleted source records, to communicate unavailable sources.

## Protected Supported Surfaces

The retirement does not weaken or remove:

- Reading V2 masters, passages, snapshots, projections, trusted submit, audit events, feedback, and review adapters.
- R2-backed Listening authoring/runtime/storage and temp cleanup.
- Writing authoring/runtime/grading/results.
- THCS/THPT tests and result flows.
- Test-only live sessions and student-safe projections.
- Classes, courses, modules, homework, student shell, academic record, and result visibility governance.

## Feature Registry And Routing

The feature registry must not expose active create, launch, edit, assign, result-source-review, or import actions for Google Drive, Reading V1, or Quiz. Dedicated Quiz routes are allowed only as retirement-notice routes. Shared unavailable-material routes may explain that a source was removed, but must not rehydrate retired source records or read retired roots such as `/quizzes`.

## Documentation Handling

Use these labels in active docs:

- `Retired Feature`: former capability that cannot create, assign, launch, or review new work.
- `Retirement Notice`: static page for a dedicated retired-feature route.
- `Obsolete Source`: stored media source no longer authorized for upload, playback, validation, or new use.
- `Application Purge`: permanent deletion of app-owned retired material state.
- `Academic Result`: completed student submission retained independently from source material availability.

Do not use older active-state wording such as:

- Google Drive supported
- Quiz Mode supported
- Reading V1 supported
- legacy playback continues

Historical quotes and archived task/proof text may remain unchanged, but active authority docs must point here when they mention those retired families.
