# Findings: PRD-0052 Book Editor Modal In Teacher Materials

## Task 1.0 Findings

- 2026-06-05: Required design/rule gates were read before code edits for the Book editor modal addendum.
- 2026-06-05: Pre-change route/open grep confirmed normal Book-card opening still calls `navigateTo('TEACHER_MATERIAL_BOOK', ...)` in `src/pages/TeacherLobbyPage.jsx`, while route-backed `BookEditorPage` and tests still assume `/teacher/materials/books/:bookId`.
- 2026-06-05: Implementation notes now make `/teacher/materials/books/:bookId` compatibility-only for this addendum and preserve hard constraints: no `TeacherHeader` inside the modal, no new Mantine imports, no normal Book-card route navigation, and no whole-Book homework action.
- 2026-06-05: Coverage matrix now maps `FR-BOOK-EDITOR-*` to `BookEditorModal` plus `BookEditorWorkspace`; `BookEditorPage` is no longer accepted as the normal Teacher Materials editor surface.

## Implementation Findings

- 2026-06-05: `BookEditorWorkspace` now owns the editor body and is prop-driven by `bookId`; `BookEditorPage` is only a compatibility wrapper with the top-level `TeacherHeader`.
- 2026-06-05: `BookEditorModal` is native/custom, no Mantine imports, uses the edit-test-style frame classes, handles Escape/backdrop close, dirty discard confirmation, focus return, and header Save/Request review actions.
- 2026-06-05: Teacher Lobby Book cards open the modal on `/lobby`; disabled Book editor capability disables the `Open Book` button and does not flash the legacy route.
- 2026-06-05: Legacy `/teacher/materials/books/:bookId` redirects into `/lobby` with modal-open state; Teacher Lobby consumes that state once and clears it with a replace navigation.
- 2026-06-05: Non-empty Book-node deletion is confirmed inside `BookEditorWorkspace` when hosted in the modal; `BookNodeTree` keeps a legacy `window.confirm` fallback for non-modal hosts.
- 2026-06-05: Live browser QA verified modal layout at `375`, `768`, `848`, `1366`, and `1586` widths with no horizontal overflow, frame inside viewport, no nested `TeacherHeader`, and URL remaining `/lobby`.

## Caveats

- Live browser QA did not cover material-ref assignment above the modal because the available QA Book had no attached refs; unit tests still cover individual ref homework handoff through the workspace/page path.
- Full `tsc --noEmit` remains blocked by existing repo-wide TypeScript debt unrelated to this addendum; the touched `BookEditorPage.tsx` type error introduced during extraction was fixed.

## Verification

- `cmd /c "npm run check:utf8 -- documentation/tasks/PRD0052/prd0052-implementation-notes.md documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md"` passed.
- `git diff --check -- documentation/tasks/PRD0052/prd0052-implementation-notes.md documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md` passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx --reporter=basic --pool=forks"` passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks"` passed after disabled-capability and route-state cleanup coverage.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/routes/teacherRoutes.test.tsx src/constants/routes.test.ts src/config/featureRegistry.test.ts --reporter=basic --pool=forks"` passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx --reporter=basic --pool=forks"` passed.
