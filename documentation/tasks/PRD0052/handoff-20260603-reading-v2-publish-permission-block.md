# Handoff: PRD-0052 Reading V2 Publish Permission Block

Generated: 2026-06-03
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
Branch: `codex/prd0052-material-tabs-inline`
HEAD: `25b53126`

## Scope

This handoff is for one block only: a real browser-created Reading V2 full-test draft reaches Studio publish, then fails with Firebase RTDB permission denied.

Do not treat this as full PRD-0052 completion work. The current thread should keep focusing on live PRD-0052 QA after this block is fixed elsewhere.

## Port Context

- `http://localhost:5173` is admin.
- `http://localhost:5174` is teacher.
- Teacher server on `5174` was started with process env feature flags only. `.env` was not edited.

Feature flags used for `5174`:

```powershell
VITE_READING_PASSAGE_LIBRARY=enabled
VITE_READING_PASSAGE_HOMEWORK=enabled
VITE_TEACHER_MATERIALS_TEST_TYPE_BLOCKS=enabled
VITE_ADMIN_CONFIGURABLE_TEST_TYPES=enabled
VITE_MATERIAL_BOOKS=enabled
VITE_MATERIAL_BOOK_EDITOR=enabled
VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES=false
cmd /c npm run dev -- --host 0.0.0.0 --port 5174 --strictPort
```

## Browser Draft

- Teacher UID: `AkwZW3CT4AUvkMpJfgg9FwUh3ug2`
- Teacher role check returned `"teacher"`.
- Title: `PRD0052 QA Reading V2 Full Test 2026-06-03 0621`
- Material ID: `studio-material-mpx9rvt9`
- Draft ID: `studio-create-from-auto-mpx9rvt9`
- Source file, read-only: `C:\Users\The Lord\Desktop\luyentap\Clippings\Practice Cam 10 Reading Test 04.md`

Browser flow already done:

1. `http://localhost:5174/lobby`
2. `Create New Test`
3. `IELTS`
4. `Reading V2`
5. Details step
6. Auto import
7. Paste/load Clippings source
8. `Process with Auto V4`
9. Studio route opened: `/teacher/reading-v2/import`
10. `Accept into Draft`
11. `Validate`
12. `Publish`

## Good Evidence

Auto V4 parsed real source successfully:

- `passagesCount: 3`
- `questionCount: 40`
- all question numbers `1..40`
- accepted draft normalized to:
  - `passageCount: 3`
  - `taskGroupCount: 8`
  - `questionCount: 40`
  - `answeredQuestionCount: 40`
- top Studio validation status: `Validation status: clear`
- visible text: `No required issues found.`

Content-level review item was inspected and fixed in Studio:

- Passage 2, Questions 23-26, task group `prd0052-qa-reading-v2-full-test-2026-06-03-0621-task-group-2-3`
- Original Studio instruction was shortened.
- Field was edited to exact source wording:

```text
Reading Passage 2 has eight sections, A-H. Which section contains the following information? Write the correct letter, A-H, in boxes 23-26 on your answer sheet.
```

Then `Save Draft` succeeded and UI showed `Draft saved`.

## Current Block

Publishing still fails after validation and after saving the fixed instruction.

UI error:

```text
Publish permission denied. The previous live snapshot remains active and the write can be retried.
```

Console error:

```text
@firebase/database: FIREBASE WARNING: update at / failed: permission_denied
```

Studio diagnostic:

```text
[Diag][ReadingV2Studio] publish_failed {message: PERMISSION_DENIED: Permission denied, name: Error, materialId: studio-material-mpx9rvt9, draftId: studio-create-from-auto-mpx9rvt9}
```

Firebase CLI checks after the failed publish:

```powershell
cmd /c firebase database:get "/users/AkwZW3CT4AUvkMpJfgg9FwUh3ug2/role" --project temp-a1437
```

Returned:

```json
"teacher"
```

```powershell
cmd /c firebase database:get "/reading_v2/publish_commits/studio-material-mpx9rvt9" --project temp-a1437
```

Returned:

```json
null
```

```powershell
cmd /c firebase database:get "/reading_v2/material_metadata/studio-material-mpx9rvt9" --project temp-a1437
```

Returned:

```json
null
```

Meaning: no publish commit and no material metadata were written for this material. The multi-location update fails before partial publish state is visible.

## Important Distinction

This is not the same as the earlier Auto V4 duplicate answer-key issue. That issue was fixed earlier and the current browser draft has 40 questions / 40 answers.

This is also not blocked by missing manual review in the visible Studio UI. Studio allows the publish attempt and reaches Firebase, then RTDB denies the root multi-path update.

There is a secondary Studio-state smell: copied parsing diagnostics still show one stale warning under `validationStateIssues`:

```text
code: unresolved-import-uncertainty
severity: warning
objectId: prd0052-qa-reading-v2-full-test-2026-06-03-0621-task-group-2-3
```

But after the edit, that task group instruction text is correct and `importEvidenceRefs: []`. Treat stale validation state as secondary unless it proves to affect publish-plan generation.

## Likely Files To Inspect

Publish update builder:

- `src/services/reading-v2/readingV2FirebasePublishAdapter.service.ts`
  - `buildReadingV2FirebasePublishUpdates`
  - `commitReadingV2PublishPlanToFirebase`
  - root call shape: `update(ref(targetDatabase), firebaseUpdates.updates)`

Storage paths:

- `src/services/reading-v2/readingV2StoragePaths.service.ts`
  - `published_snapshots/{materialId}/{snapshotVersionId}`
  - `projections/student_safe_tests/{materialId}:{snapshotVersionId}`
  - `projections/session_test_payloads/{sessionCode}:{snapshotVersionId}`
  - `analytics_outputs/{outputId}:{snapshotVersionId}`
  - `publish_commits/{materialId}:{snapshotVersionId}`

Rules:

- `database.rules.json`
  - `reading_v2` subtree
  - `material_catalog/material_indexes` subtree
  - legacy `tests/{materialId}` subtree, if still included in publish update

Validation source:

- `src/services/reading-v2/readingV2Validation.service.ts`
  - starts from stored `document.validationState.issues`
  - also includes `taskGroup.validationState.issues`

Studio shell:

- `src/components/reading-v2/studio/ReadingV2StudioShell.tsx`
  - publish button behavior
  - `Copy parsing diagnostics`
  - teacher-facing issue mapping

## Suspected Root Area

Most likely cause: one child path inside the root multi-location RTDB update is not allowed by deployed rules for this teacher-owned full-test publish. Because Firebase only reports `update at / failed`, exact denied child path is not known yet.

High-value next step elsewhere:

1. Capture the exact `firebaseUpdates.updates` path list for this publish plan, without logging answer keys.
2. Compare every path against deployed `database.rules.json`.
3. Check whether legacy `tests/{materialId}` or any `material_catalog/material_indexes/*` bucket is denied for teacher writes.
4. If Java becomes available, reproduce with emulator-backed rule tests using actual PRD-0052 production paths.

## Constraints

- Do not mutate `.env`.
- Do not mutate external Clippings source.
- Do not invent credentials.
- Prefer dev quick-login for teacher/student.
- No fixture mode for this verification.
- Do not mark PRD-0052 complete from this block alone.

## Return After Fix

After the rules/adapter block is fixed elsewhere, return to the existing teacher Studio browser session on `5174` if still alive and retry `Publish` for `studio-material-mpx9rvt9`.

If the browser session is gone, recreate the same test from:

```text
C:\Users\The Lord\Desktop\luyentap\Clippings\Practice Cam 10 Reading Test 04.md
```

Then continue the PRD-0052 live QA slice:

1. Confirm generated Reading Passage rows appear in `Reading Passage > Private`.
2. Confirm rows come from `material_catalog/material_indexes`.
3. Confirm no answer keys/provenance leak into list or student-safe paths.
4. Assign one generated Reading Passage.
5. Student launch/submit.
6. Teacher result review.
