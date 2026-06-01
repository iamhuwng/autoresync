# PRD-0052 Section 20 Visual Difference Note

Date: 2026-06-02
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
Dev URL: `http://127.0.0.1:5173/lobby`

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

## Remote RTDB Caveat

- Reading Passage and Book tab bodies were visually verified with a dev-only fixture because live RTDB returned `Permission denied` for the new PRD-0052 listing paths.
- Direct browser probes also returned `Permission denied` for:
  - `material_catalog/test_types`
  - `material_catalog/book_indexes/by_owner/glMHCrzMnyS6AqFcb9I0nlOqQ6X2`
  - `reading_v2/listing_indexes/reading_passage_private/glMHCrzMnyS6AqFcb9I0nlOqQ6X2`
  - `reading_v2/listing_indexes/reading_passage_public`
- Local Firebase Database emulator startup was attempted for remote-free RTDB proof, but it failed because Java is not installed or not on PATH: `Error: Could not spawn java -version. Please make sure Java is installed and on your system PATH.`

## Difference Status

- Fixed: default Test Type logos now render as image assets instead of broken images/alt text.
- Fixed: `375px` horizontal overflow in normal list rows.
- Closed for local visual QA: Book grid and Reading Passage list-row body layout were verified against the current app using the dev-only fixture flag and current production components/CSS.
- Still a deployment/data follow-up: local rule files and security-rule tests cover the paths, but the current remote database rules used by the browser session do not yet allow the new reads. Re-run without fixture after deploying/emulating PRD-0052 RTDB rules/data.
