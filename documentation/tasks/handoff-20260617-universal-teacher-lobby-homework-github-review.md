# Handoff - Universal Teacher Lobby Homework Review

## Context

- Repo: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/universal-teacher-lobby-homework`
- Goal: universal Teacher Lobby homework assignment through Worker-backed `POST /api/homework/assignments`
- Follow-up fix in this commit: THCS homework must launch from legacy `tests/{materialId}`, not `student_safe_tests/{materialId}`.

## What Changed

- `src/pages/StudentPracticePage.tsx`
- `src/pages/StudentPracticePage.test.tsx`
- `documentation/tasks/handoff-20260617-universal-teacher-lobby-homework-github-review.md`

## What To Review

1. `StudentPracticePage.tsx` now excludes `thcs_test` from `STUDENT_SAFE_STANDARD_HOMEWORK_KINDS`.
2. `StudentPracticePage.test.tsx` now proves Worker-created THCS homework launches from `tests/{materialId}` and does not require `student_safe_tests/{materialId}`.
3. IELTS Reading, IELTS Listening, and IELTS Writing still launch from `student_safe_tests/{materialId}`.
4. Reading Passage and Reading V2 launch behavior remains unchanged.
5. Worker files are intentionally untouched in this fix.

## Why This Fix

`thcs_test` is a standard THCS homework kind in the Worker. The Worker does not create or validate a THCS `student_safe_tests/{contentId}` projection, so keeping THCS in the student-safe set made StudentPracticePage probe the wrong path and fail closed. Removing THCS from the projection-backed set preserves existing runtime behavior and avoids introducing a THCS projection contract in this branch.

## Validation

- `npx vitest run src/pages/StudentPracticePage.test.tsx --reporter=dot`
- `cd r2-backup-worker && npx vitest run src/homework/assignments.test.ts --reporter=dot`
- `git diff --check`
- `npm run check:utf8`
- `npm run build`

## Notes

- Remote reviewer should inspect the committed diff on GitHub only; no local filesystem access is required.
- Existing untracked local draft `documentation/teacher-lobby-universal-homework.md` was left out of this fix.
