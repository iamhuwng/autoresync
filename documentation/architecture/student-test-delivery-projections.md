# Student Test Delivery Projections

## Purpose

This document defines how canonical test data becomes student-renderable data for legacy IELTS Listening and Reading delivery, and how Reading V2 keeps the same no-answer-key invariant in its namespaced projection plane.

The contract exists because teacher/admin storage can contain grading answers, editor metadata, image ranges, audio ranges, and repair history, while student runtime pages need a fresh answer-free render payload.

Retirement boundary: Reading V1 is retired and must not be inferred from missing Reading V2 markers, `skill: Reading`, or `contentKind: ielts_reading`. Reading V2 launches require explicit Reading V2 markers/projections/snapshots; unknown Reading records fail closed. See `documentation/architecture/retired-features-current-state.md`.

## Storage Nodes

### `tests/{testId}`

Canonical teacher/admin test data.

Rules:
- teacher edit surfaces write here
- grading reads answer-bearing questions from here
- student render loaders must not treat this as their normal payload source

### `student_safe_tests/{testId}`

Global student-safe projection.

Rules:
- generated from canonical data by `buildStudentSafeTestData()`
- answer keys and review-only fields are stripped
- render fields must be preserved, including `displayMode`, `audioSections`, `questionImages`, per-image `questionRange`, sections, passages, and task metadata
- solo and homework student delivery read this node first

### `session_test_payloads/{sessionCode}`

Live-session snapshot cache.

Rules:
- created when a teacher starts a live session through `cacheSessionStudentSafeTestData()`
- stores one sanitized payload for that session
- may become stale if teacher edits the test after the snapshot is created
- live student delivery must fall back to the current global `student_safe_tests/{testId}` payload when the session snapshot is missing, points at another test, or is older than the global safe payload

### Reading V2 Namespaced Projections

Reading V2 does not use the legacy root `student_safe_tests/{testId}` path.

Reading V2 student delivery paths:

- canonical published snapshot: `reading_v2/published_snapshots/{materialId}/{snapshotVersionId}`
- student-safe projection: `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`
- live-session projection: `reading_v2/projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`
- review projection: `reading_v2/projections/review/{materialId}:{snapshotVersionId}`

Full-test publish also creates canonical snapshots for generated Reading Passage materials. A generated passage is not launchable just because it has metadata or list indexes; it must have the namespaced student-safe projection and the canonical published snapshot expected by the trusted submit path.

Composition-first full-test publish must also create master projections at those same namespaced student-safe, session-safe, and review paths. Missing master projections are launch blockers, not optional convenience rows.

Student-facing summary surfaces must not rely on owner-only `reading_v2/material_metadata/{materialId}` reads. For non-live Reading V2 full-test homework/detail flows, the student-readable bridge is `tests/{materialId}` and the render-safe body comes from `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`.

## Producer Contract

Every normal test save/update path must keep canonical and student-safe data in the same write unit.

Current producers:
- `src/services/testStorage.ts`
  - `saveTestToFirebase()` writes `tests/{testId}` and `student_safe_tests/{testId}` together through `writeCanonicalAndStudentSafeTestData()`
  - `updateTestInFirebase()` reads the current canonical test once, merges updates, then writes updated canonical fields and regenerated `student_safe_tests/{testId}` in one root update
- `src/components/TestEditor.tsx`
  - Teacher Lobby / material-card edit modal save writes changed canonical fields and regenerated `student_safe_tests/{testId}` in the same root `update(ref(database), updates)`
  - image-mode resource ranges are converted before projection, so each saved image keeps its own `questionRange`

Repair-only helper:
- `refreshStudentSafeTestData(testId)` remains available for incident repair or legacy migration.
- It is not the foundation for normal editor saves.

Reading V2 producers:
- `publishReadingV2Material()` writes full-test and generated Reading Passage snapshots/projections through the Reading V2 publish plan.
- `readingV2Backfill.service.ts` reuses the same extraction/projection/index plan for approved repair or migration.
- Reading V2 publish must not depend on a later manual projection refresh before students can launch assigned homework.

## Consumer Contract

Student render pages consume projected payloads.

Current consumers:
- `src/hooks/solo/useSoloTestData.ts` loads `student_safe_tests/{testId}` through `getStudentSafeTestFromFirebase()`
- `src/hooks/test/useTestData.ts` loads live-session data through `getSessionStudentSafeTestData(sessionCode, testId)`
- `src/components/practice/ListeningPracticeView.tsx` and `src/skills/listening/components/ListeningTestPage.tsx` render `displayMode === "image"` using `questionImages`

Reading V2 consumers:
- `src/services/reading-v2/readingV2LaunchIntegration.service.ts` resolves non-live Reading V2 material launch from `reading_v2/projections/student_safe_tests/{materialId}:{snapshotVersionId}`.
- `src/pages/StudentHomeworkDetailPage.tsx` hydrates Reading V2 homework summary from `getTestFromFirebase(materialId)` plus the student-safe projection instead of owner-only namespaced metadata.
- `src/pages/StudentPracticePage.tsx` launches Reading Passage homework from assignment-pinned snapshots, not mutable current metadata.
- `src/pages/StudentPracticePage.tsx` also preserves launch-surface context outside the projection payload so non-live Reading V2 can exit back to homework, course detail, or library correctly.
- `functions/src/readingV2SubmitCore.ts` scores from trusted server-side source data, not from the browser projection.
- Reading V2 live and homework hosts may attach optional `integrityReport` telemetry to trusted submit. That telemetry is persisted for review/monitoring context, not used for scoring.

For image mode, `questionImages` is an ordered render contract:
- each array item represents one image resource
- `sectionNumber` scopes the image to a listening section/part
- `questionRange.start` and `questionRange.end` decide which questions show that image
- a section may have multiple images with different ranges
- mobile image mode may flatten this ordered list into a swipe carousel; swiping across section boundaries must preserve the image's owning section and destination audio behavior

If only one image appears for a section that should have multiple images, first inspect `student_safe_tests/{testId}.questionImages` before changing the renderer.

Related mobile navigation contract:
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`

## Obsolete Model

Retired assumptions:
- "Teacher edit can save only `tests/{testId}` and a later refresh will update students."
- "Student runtime must wait for manual Firebase CLI backfill after every image-range edit."
- "Re-saving a single affected test proves the system is healthy."
- "Student-safe projection may collapse Listening images to the first image per section."
- "Reading V2 generated Reading Passages only need Material Catalog index rows; the canonical `reading_v2/published_snapshots` row is optional."
- "Reading V2 composition-first full tests can skip master student-safe/session-safe/review projections because child passage projections already exist."
- "Reading V2 homework completion is implied by a successful trusted submit response."
- "Reading V2 trusted submit does not need to carry anti-cheat telemetry once the browser collected it."
- "Reading V2 non-live return destinations can be reconstructed from the student-safe projection alone."
- "Student homework detail may read `reading_v2/material_metadata/{materialId}` directly."

Current rule:
- a successful teacher edit save must update the student-safe projection immediately for all affected test fields.
- Firebase CLI repair is allowed only for one-time incident recovery or migration, not as an ongoing operational dependency.
- a successful Reading V2 publish/backfill must create the canonical snapshot and student-safe projection for every generated Reading Passage.
- a successful composition-first Reading V2 full-test publish/backfill must also create master student-safe, session-safe, and review projections.
- a successful Reading V2 homework submit must also finalize the linked Firestore `homework_submissions/{submissionId}` row.
- a successful live or homework Reading V2 submit should carry `integrityReport` when anti-cheat config is active; the trusted backend persists it but still scores only from canonical Reading V2 data.
- a non-live Reading V2 launch must carry route context beside the projection so the runtime can expose a deterministic exit path.
- a student Reading V2 homework/detail surface must use the student-readable bridge plus projection and fail closed instead of probing owner-only metadata.

## Freshness Semantics

`updatedAt` is the freshness marker for legacy student-safe payloads.

Rules:
- editor/update producers must bump `updatedAt`
- session payloads may use the cached test `updatedAt` or `generatedAt`
- when `student_safe_tests/{testId}.updatedAt` is newer than `session_test_payloads/{sessionCode}.testData.updatedAt`, live delivery returns the global safe payload

Open-page caveat:
- an already mounted student page keeps its in-memory React state until reload/re-entry unless a real-time subscription is added later.
- new loads, route re-entry, and post-edit reloads must receive the fresh projected payload.

## Verification

Regression coverage must prove:
- teacher edit modal save includes `/student_safe_tests/{testId}` in the same root update
- saved image-mode sections can carry multiple `questionImages` entries with distinct `questionRange` values
- student-safe payloads strip answer fields
- `updateTestInFirebase()` regenerates `student_safe_tests/{testId}` atomically
- `getSessionStudentSafeTestData()` falls back to the current global safe payload when the session snapshot is stale

Current focused tests:
- `src/components/TestEditor.test.tsx`
- `src/services/testStorage.test.ts`
- `src/hooks/solo/useSoloTestData.test.ts`
- `src/hooks/test/useTestData.test.ts`
- `src/services/reading-v2/readingV2PublishPipeline.service.test.ts`
- `src/services/reading-v2/readingV2Backfill.service.test.ts`
- `src/services/reading-v2/readingV2RuntimeSubmission.service.test.ts`
- `src/pages/StudentPracticePage.test.tsx`

## Related Reading V2 Contract

See:
- `documentation/architecture/changelog/reading-v2-material-publish-and-passage-library.md` for the PRD-0052 publish, Material Catalog, generated Reading Passage, homework, and review contract.
- `documentation/architecture/changelog/reading-v2-runtime-integrations.md` for Reading V2 anti-cheat, trusted submit, feedback, and admin monitor integration.
