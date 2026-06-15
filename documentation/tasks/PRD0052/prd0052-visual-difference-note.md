# PRD-0052 Section 20 Visual Difference Note

Date: 2026-06-04
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
Historical visual URL: `http://127.0.0.1:5173/lobby`

## Passed Browser Checks

- Teacher dev session was active as `teacher@test.com` / `Teacher Test`.
- Captured Teacher Materials screenshots at required widths after the logo-asset fix:
  - `output/playwright/prd0052-implementation/teacher-materials-my-content-375-section20-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-my-content-768-section20-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-my-content-848-section20-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-my-content-1366-section20-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-my-content-1586-section20-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-my-content-1920-section20-final.png`
- `My Content`, `Public Library`, `Drafts`, `Reading Passage`, and `Book` tabs are present and keep existing tab styling.
- Tabs, title, subtitle, header, toolbar, and list rows did not overlap at the required widths.
- Search/create toolbar keeps the PRD-0050 treatment; non-Book tabs keep `Create New Test`.
- Four Test Type blocks stayed centered in one row at every required width.
- Test Type blocks now load local logo image assets; browser measured each default logo at `300x120` natural size.
- No broken logo alt text appears in body text after adding:
  - `public/assets/material-test-types/ielts.svg`
  - `public/assets/material-test-types/toeic.svg`
  - `public/assets/material-test-types/toefl.svg`
  - `public/assets/material-test-types/thcs.svg`
  - `public/assets/material-test-types/thpt.svg`
  - `public/assets/material-test-types/cefr.svg`
- Active Test Type styling is visible.
- Clicking the active Test Type block again clears the filter.
- No helper filter pill appears.
- Settings icon appears on hover and keyboard focus.
- Settings icon opens the preference modal without clearing the active Test Type filter.
- Normal material tabs show list rows below Test Type blocks.
- Book tab CTA says `Create New Book`; non-Book tabs do not.
- Book Private/Public control appears only in Book tab.
- Reading Passage Private/Public control appears only in Reading Passage tab.
- No horizontal document overflow at required widths after the mobile row action rail fix.
- Dev-only visual fixture run on `http://127.0.0.1:5173/lobby` with `VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES=true` completed the two body-layout checks that the remote RTDB session could not hydrate:
  - `output/playwright/prd0052-implementation/teacher-materials-reading-passage-848-section20-fixture-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-reading-passage-375-section20-fixture-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-book-848-section20-fixture-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-book-375-section20-fixture-final.png`
- Fixture browser metrics showed:
  - Reading Passage at `848px`: `hasMaterialsListView=true`, `hasBookGrid=false`, fixture rows visible, four Test Type blocks in one row, `overflowX=0`.
  - Book at `848px`: `hasBookGrid=true`, `bookCardCount=2`, `generatedCoverCount=2`, `hasMaterialsListView=false`, four Test Type blocks in one row, `overflowX=0`.
  - Reading Passage at `375px`: list rows visible, no Book grid, four Test Type blocks in one row, `overflowX=0`.
  - Book at `375px`: card grid visible, two generated covers, no Materials list view, four Test Type blocks in one row, `overflowX=0`.

## Fixed During Section 20

- Mobile `375px` list-row action rail overflow was fixed in `MaterialListView.css` and `MaterialListRow.css`.
- Missing default Test Type logo assets were added because the browser showed broken image icons and visible alt text.
- Added a regression test in `testTypeConfig.service.test.ts` so default Test Type logo paths must resolve to local shipped files.

## Historical Remote RTDB Caveat

- This section is historical fixture evidence from 2026-06-02. Later live RTDB rule deployments and browser QA superseded the Reading Passage/Book permission caveat for the specific paths noted in the gap-closure evidence log.
- Reading Passage and Book tab bodies were initially visually verified with a dev-only fixture because live RTDB returned `Permission denied` for the new PRD-0052 listing paths.
- Direct browser probes also returned `Permission denied` for:
  - `material_catalog/test_types`
  - `material_catalog/book_indexes/by_owner/glMHCrzMnyS6AqFcb9I0nlOqQ6X2`
  - stale pre-closure `reading_v2/listing_indexes/reading_passage_private/*`
  - stale pre-closure `reading_v2/listing_indexes/reading_passage_public`
- Current production Reading Passage list proof must target `material_catalog/material_indexes`, not `reading_v2/listing_indexes`.
- Historical local Firebase Database emulator startup failed because Java was not installed or not on PATH. This is superseded by the 2026-06-04 workspace-local Java 21 emulator proof recorded in `prd0052-security-rule-validation-cases.md`.

## Live Workflow Supersession

- Reading Passage production-path proof is no longer fixture-only. Later live browser/RTDB proof created full-test material `studio-material-mpxjmklq`, produced 3 generated Reading Passage rows through `material_catalog/material_indexes/by_source_full_test/studio-material-mpxjmklq`, assigned/submitted one Reading Passage homework, and assigned/submitted a bulk Reading Passage set after Worker deploy.
- Book public-governance proof is no longer fixture-only. Later live browser/RTDB proof approved a public Book as super admin, loaded it as another teacher through the Book Public tab, and opened public-safe detail through `material_catalog/public_book_projections`.
- Security proof is no longer fixture/skipped-emulator only. Expanded RTDB/Firestore emulator proof passed on 2026-06-04 with 3 files / 39 tests, then hardened RTDB rules were deployed to `temp-a1437-default-rtdb`.
- Repair/backfill proof is not visual evidence and should not be inferred from screenshots. Current data-plane proof lives in `prd0052-gap-closure-evidence-2026-06-02.md`, including approved backfill no-op, repair convergence `operations=0`, and controlled composition-version fixture proof.

## Difference Status

- Fixed: default Test Type logos now render as image assets instead of broken images/alt text.
- Fixed: `375px` horizontal overflow in normal list rows.
- Closed for local visual QA: Book grid and Reading Passage list-row body layout were verified against the current app using the dev-only fixture flag and current production components/CSS.
- Superseded: later PRD-0052 evidence records live post-deploy Book public projection proof, live Reading Passage proof through `material_catalog/material_indexes`, real full-test publish to generated Reading Passage rows, homework/runtime/result proof, emulator rules proof, and repair convergence proof. Keep this file as visual-layout evidence only, not as current data-plane status.
