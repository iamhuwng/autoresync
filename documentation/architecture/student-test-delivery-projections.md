# Student Test Delivery Projections

## Purpose

This document defines how canonical test data becomes student-renderable data for legacy IELTS Listening and Reading delivery.

The contract exists because teacher/admin storage can contain grading answers, editor metadata, image ranges, audio ranges, and repair history, while student runtime pages need a fresh answer-free render payload.

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

## Consumer Contract

Student render pages consume projected payloads.

Current consumers:
- `src/hooks/solo/useSoloTestData.ts` loads `student_safe_tests/{testId}` through `getStudentSafeTestFromFirebase()`
- `src/hooks/test/useTestData.ts` loads live-session data through `getSessionStudentSafeTestData(sessionCode, testId)`
- `src/components/practice/ListeningPracticeView.tsx` and `src/skills/listening/components/ListeningTestPage.tsx` render `displayMode === "image"` using `questionImages`

For image mode, `questionImages` is an ordered render contract:
- each array item represents one image resource
- `sectionNumber` scopes the image to a listening section/part
- `questionRange.start` and `questionRange.end` decide which questions show that image
- a section may have multiple images with different ranges

If only one image appears for a section that should have multiple images, first inspect `student_safe_tests/{testId}.questionImages` before changing the renderer.

## Obsolete Model

Retired assumptions:
- "Teacher edit can save only `tests/{testId}` and a later refresh will update students."
- "Student runtime must wait for manual Firebase CLI backfill after every image-range edit."
- "Re-saving a single affected test proves the system is healthy."

Current rule:
- a successful teacher edit save must update the student-safe projection immediately for all affected test fields.
- Firebase CLI repair is allowed only for one-time incident recovery or migration, not as an ongoing operational dependency.

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
