# PRD-0052 Final Handoff Checklist

Date: 2026-06-02
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

## Summary

- Local implementation and tests cover PRD-0052 Books, Reading Passage library, Test Type config, homework launch/submit, result review, rules, diagnostics, backfill planning, and visual shell behavior.
- Section 20 local visual QA is complete. Book grid and Reading Passage row body checks were verified with a dev-only fixture flag because the current remote RTDB denies the new PRD-0052 paths. This caveat is documented in `prd0052-visual-difference-note.md`.
- No whole-Book assignment was added.
- No direct blank/manual Reading Passage creation was added.

## Section 21 Evidence Map

| Item | Status | Evidence |
| --- | --- | --- |
| 21.1 closed decisions represented | PASS | `prd0052-implementation-coverage-matrix.md`, `prd0052-implementation-notes.md`, this handoff |
| 21.2 no direct blank/manual Reading Passage creation | PASS | `TeacherLobbyPage.jsx` hides create CTA for `reading-passage`; `TeacherLobbyPage.test.jsx` asserts no create button |
| 21.3 Reading Passage directly assignable | PASS | `TeacherLobbyPage.jsx`, `HomeworkCreateModal.tsx`, `readingV2PassageHomework.service.ts`, `TeacherLobbyPage.test.jsx` |
| 21.4 Book not assignable as whole Book | PASS | `BookCard.jsx`, `BookEditorPage.tsx`, `BookEditorPage.test.tsx` |
| 21.5 Books can be created empty/resumed | PASS | `CreateBookModal.tsx`, `materialBooks.service.ts`, `TeacherLobbyPage.test.jsx` |
| 21.6 Book metadata fields | PASS | `MaterialBookMetadata` in `materialCatalog.types.ts`; `CreateBookModal.tsx`; `BookEditorPage.tsx` |
| 21.7 Book multi-Test-Type | PASS | `testTypeIds[]` in types/services; `CreateBookModal.test.tsx`; `materialBooks.service.test.ts` |
| 21.8 Test Type config admin/super-admin only | PASS | `testTypeConfig.service.ts`, `TestTypeAdminPanel.tsx`, `database.rules.json`, `materialCatalogFirebaseRules.test.ts` |
| 21.9 teacher pins exactly 4 when possible | PASS | `teacherTestTypePreferences.service.ts`, `TestTypePreferenceModal.jsx`, related tests |
| 21.10 TOEFL/TOFEL alias | PASS | `testTypeConfig.service.ts`, `testTypeConfig.service.test.ts` |
| 21.11 CEFR/CELF alias | PASS | `testTypeConfig.service.ts`, `testTypeConfig.service.test.ts` |
| 21.12 tab-local Book/Reading Passage scopes | PASS | `TeacherLobbyPage.jsx`, `TeacherLobbyPage.test.jsx`, browser screenshots |
| 21.13 students cannot read Book organizers | PASS | `database.rules.json`, `materialCatalogFirebaseRules.test.ts` |
| 21.14 student-safe projections exclude sensitive fields | PASS | `readingV2Projection.service.test.ts`, `readingV2VerticalLoop.integration.test.tsx`, `readingV2SubmitCore.test.ts` |
| 21.15 list queries use indexes/targeted reads | PASS | `useTeacherTests`, `readingV2PassageLibrary.service.ts`, `materialBooks.service.ts`, storage/index tests |
| 21.16 commands/screenshots recorded | PASS_WITH_REMOTE_RTDB_CAVEAT | `prd0052-implementation-notes.md`, `output/playwright/prd0052-implementation/`, `prd0052-visual-difference-note.md` |
| 21.17 tab switching preserves search and active Test Type | PASS | `TeacherLobbyPage.test.jsx` |
| 21.18 Drafts inactive does not load | PASS | `TeacherLobbyPage.jsx` gates `useTeacherDrafts` with `enabled: contentFilter === 'drafts'` |
| 21.19 source order numeric/label/unknown | PASS | `readingV2PassageExtraction.service.ts`, `readingV2MaterialMetadata.service.ts`, tests |
| 21.20 standalone published Reading Passage edit opens draft revision | PASS | `readingV2PassageRevision.service.ts`, `readingV2FullTestComposition.service.ts`, tests |
| 21.21 Reading Passage row actions | PASS | `materialListAdapter.js`, `MaterialListRow.jsx`, `TeacherLobbyPage.test.jsx` |
| 21.22 Reading Passage bulk set + composition | PASS | `TeacherLobbyPage.jsx`, `readingV2FullTestComposition.service.ts`, `TeacherLobbyPage.test.jsx` |
| 21.23 result review metadata/attempt | PASS | `ReadingV2ReviewContentAdapter.tsx`, `readingV2ResultAdapter.service.ts`, tests |
| 21.24 Book route opens editor | PASS | `routes.ts`, `teacherRoutes.tsx`, `BookEditorPage.tsx`, `constants/routes.test.ts` |
| 21.25 Book statuses | PASS | `materialCatalog.types.ts`, `bookValidation.service.ts`, rules/tests |
| 21.26 Book visibility values | PASS | `materialCatalog.types.ts`, `bookValidation.service.ts`, rules/tests |
| 21.27 normal teachers cannot set published | PASS | `bookValidation.service.ts`, `database.rules.json`, tests |
| 21.28 Book validation edge cases | PASS | `bookValidation.service.ts`, `bookValidation.service.test.ts`, `bookEditor.service.test.ts` |
| 21.29 broken refs fallback/no leak | PASS | `BookNodeTree.tsx`, `BookNodeTree.test.tsx` |
| 21.30 Book cards allowed actions only | PASS | `BookCard.jsx`, `BookCardGrid.test.jsx`, `TeacherLobbyPage.test.jsx` |
| 21.31 admin UI validates allowedMaterialKinds | PASS | `TestTypeAdminPanel.tsx`, `TestTypeAdminPanel.test.tsx` |
| 21.32 loading/empty/error states | PASS | `TeacherLobbyPage.test.jsx`, `BookEditorPage.test.tsx`, `TestTypeAdminPanel.test.tsx`, homework/student tests |
| 21.33 coverage matrix no unmapped requirements | PASS | `prd0052-implementation-coverage-matrix.md` |
| 21.34 Book nodes separate from list rows | PASS | `materialCatalogPaths.ts`, `materialBooks.service.ts`, tests |
| 21.35 exact Reading V2 path helpers | PASS | `readingV2StoragePaths.service.ts`, `readingV2StoragePaths.service.test.ts` |
| 21.36 tab changes track snake_case action | PASS | `TeacherLobbyPage.jsx`, `TeacherLobbyPage.test.jsx`, `featureRegistry.test.ts` |
| 21.37 non-empty node delete confirmation | PASS | `BookNodeTree.tsx`, `BookNodeTree.test.tsx` |
| 21.38 Book editor says whole-Book assignment unavailable | PASS | `BookEditorPage.tsx`, `BookEditorPage.test.tsx` |
| 21.39 trusted Reading V2 submission/scoring | PASS | `functions/src/readingV2SubmitCore.ts`, `readingV2PassageSetSubmitCore.test.ts`, `StudentPracticePage.test.tsx` |
| 21.40 nine security scenarios | PASS | `prd0052-security-rule-validation-cases.md`, security test command log |
| 21.41 long titles/labels truncate with accessible full text | PASS | `BookCard.jsx/css`, `TestTypeBlockModule.jsx/css` |
| 21.42 remaining gaps documented | PASS | `prd0052-visual-difference-note.md`, this handoff |

## Open Follow-Up Items

1. Deploy or emulate the PRD-0052 RTDB rules/data, then re-run Book and Reading Passage browser QA without `VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES`.
2. Re-capture Book tab with actual Book card data and Reading Passage tab with actual list-row data.
3. Install Java or provide an emulator-capable environment if local RTDB emulator proof is preferred over remote deployment.
