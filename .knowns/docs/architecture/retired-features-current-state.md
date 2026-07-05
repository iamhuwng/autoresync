---
title: Retired Features Current State
description: Current product authority for retired Google Drive support, Reading V1, and Quiz.
createdAt: '2026-07-05T00:00:00.000Z'
updatedAt: '2026-07-05T00:00:00.000Z'
tags:
  - architecture
  - retired-features
  - google-drive
  - reading-v1
  - quiz
---

# Retired Features Current State

Google Drive support, Reading V1, and Quiz are retired feature families.

Current product truth:

- Google Drive is not an active upload, import, streaming, playback, validation, fallback, OAuth, environment, or compatibility path.
- Reading V1 is not an active creation, launch, practice, live runtime, review, inference, or migration fallback path.
- Quiz is not an active creation, assignment, gameplay, live session mode, or `/quizzes` client-access path.
- Cloudflare R2 is the active storage authority.
- Reading V2, R2 Listening, Writing, THCS/THPT, test-only sessions, classes, courses, modules, homework, academic records, and result visibility governance remain protected supported surfaces.

Completed academic results remain retained when access is authorized. Answer Review may use saved result snapshots; Source Review may be unavailable after source purge.

Dedicated Quiz URLs may render a retirement notice. Shared material/homework/session/result URLs whose source record was purged should fail closed or show a generic unavailable-source state when the remaining id cannot safely identify the deleted family.

The feature registry must not expose active create, launch, edit, assign, result-source-review, or import actions for Google Drive, Reading V1, or Quiz. Dedicated Quiz routes are allowed only as retirement-notice routes. Shared unavailable-material routes may explain that a source was removed, but must not rehydrate retired source records or read retired roots such as `/quizzes`.

Canonical repo document:

- `documentation/architecture/retired-features-current-state.md`

Boundary sources:

- `docs/adr/0001-retired-material-purge-boundary.md`
- `docs/superpowers/plans/2026-07-05-retire-google-drive-reading-v1-quiz.md`
- `tasks/tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md`
- `tasks/findings-of-tasks-2026-07-05-retire-google-drive-reading-v1-quiz.md`

Historical docs, task logs, conversation logs, exports, proof artifacts, and completed task text may still mention retired behavior. Treat those mentions as historical unless this current-state document or a newer active architecture doc explicitly says otherwise.
