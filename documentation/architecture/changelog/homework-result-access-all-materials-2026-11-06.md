# Homework Result Access Across Material Types

Changelog ID: `CL-20261106-HOMEWORK-RESULT-ACCESS-ALL-MATERIALS`
Master entry: [Master Changelog](../master_changelog.md)

Status: **Deployed to RTDB rules on 2026-11-05 17:17 UTC.**

## Root cause

The November 4 repair covered the IELTS Writing authority-receipt path only. The canonical RTDB read rule had no general branch for an already-resolved non-Writing homework result. A valid Reading V2 result therefore failed the direct teacher read, and the modal's Writing-only authority fallback returned `403` from `/homework-result-authority`.

The reported live result already had the correct ownership snapshot and teacher key:

- `visibility.ownershipResolved: true`
- `visibility.visibilityOwnerTeacherId: AkwZW3CT4AUvkMpJfgg9FwUh3ug2`
- `teacher_result_keys/{teacherId}/{resultId}: true`
- `homework_assignments/{homeworkId}.createdBy` matched the teacher

## Repair

`database.rules.json` now permits a teacher to read a non-Writing homework result only when the canonical homework context is internally consistent and the teacher-owned result key exists. Unresolved rows and unrelated teachers remain denied. The Writing authority branch and write/validation protections are unchanged.

## Verification

- RTDB emulator regression: owner read allowed, unrelated teacher denied, unresolved result denied.
- Existing Writing homework authority emulator regression passed.
- Production rules deployment syntax and release passed through the repository Firebase CLI.
- Live Firebase REST rule evaluation after deployment returned HTTP 200 for the assigning teacher and HTTP 401 for unrelated teacher `teacher2@test.com` on `reading-v2-result-e4fcd344-8e91-48f5-9f09-7604b2462c8e`.

No Hosting, Worker, Firestore, or database data deployment was performed.
