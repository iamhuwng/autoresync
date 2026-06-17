# Handoff - Universal Teacher Lobby Homework Review

## Context

- Repo: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Branch: `codex/universal-teacher-lobby-homework`
- Goal: universal Teacher Lobby homework assignment through Worker-backed `POST /api/homework/assignments`

## What Changed

- `r2-backup-worker/src/homework/assignments.ts`
- `r2-backup-worker/src/homework/assignments.test.ts`
- `src/pages/StudentPracticePage.tsx`
- `src/pages/StudentPracticePage.test.tsx`

## What To Review

1. Worker auth + role gate.
2. Worker content resolution and rejection reasons.
3. Worker write of normalized `contentRef` plus compatibility fields.
4. Student launch path for Worker-created IELTS Writing homework.
5. Test coverage for the new worker-safe projection path.

## Live Proof

- Worker deployed from this branch.
- Deployment URL: `https://r2-backup-worker.iamhuwng.workers.dev`
- Current Worker version: `4c32276b-5ef9-41bc-9b26-f7265687b1bf`
- Teacher assignment POST returned `201`.
- Firestore assignment doc contained normalized `contentRef` and legacy compatibility fields.
- `student_safe_tests/codex-writing-import-material-1778221459436` existed and did not include teacher-only writing fields.
- Student launched the created homework at `http://localhost:5174/student/practice/codex-writing-import-material-1778221459436`.

## Validation

- `npx vitest run src/pages/StudentPracticePage.test.tsx --reporter=dot`
- `cd r2-backup-worker && npx vitest run src/homework/assignments.test.ts --reporter=dot`
- `git diff --check`

## Notes

- Existing release checklist lives at `documentation/release-checklists/universal-teacher-lobby-homework.md`.
- Local untracked design draft `documentation/teacher-lobby-universal-homework.md` was ignored for this review.
