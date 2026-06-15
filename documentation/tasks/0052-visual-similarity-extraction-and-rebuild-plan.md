# PRD-0052 Visual Similarity Extraction And Mockup Rebuild Plan

Created: 2026-06-01
Status: Required before further PRD-0052 mockup work
Owner: Product / Teacher Experience
Target surface: Teacher Lobby Materials tab

## 1. Correction

The PRD-0052 mockup work must not start from a fresh invented layout.

The approved visual base is the previous PRD-0050 Teacher Materials work plus the current live Teacher Lobby. PRD-0052 may add new product concepts, but it must preserve the existing page shell, density, spacing, tabs, toolbar treatment, list-row contract, and card language unless a documented product decision explicitly changes them.

## 2. Required Source Of Truth Stack

Use these sources in this order:

1. Current live Teacher Lobby in the running app.
2. PRD-0050 visual artifacts:
   - `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/concept-current-style.png`
   - `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/rendered-desktop.png`
   - `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/rendered-components.png`
   - `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-mockups.html`
   - `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-components.html`
   - `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-proposal.md`
3. PRD-0050 implementation contract:
   - `documentation/tasks/0050-prd-teacher-lobby-materials-list-view.md`
   - `documentation/tasks/tasks-0050-prd-teacher-lobby-materials-list-view.md`
   - `documentation/architecture/teacher-materials-list-view-contract.md`
   - `documentation/architecture/teacher-material-visual-taxonomy.md`
4. Existing runtime components:
   - `src/pages/TeacherLobbyPage.jsx`
   - `src/pages/TeacherLobbyPage.css`
   - `src/components/modern/ContentTabs.jsx`
   - `src/components/modern/ContentTabs.css`
   - `src/components/modern/SearchFilterBar.jsx`
   - `src/components/modern/SearchFilterBar.css`
   - `src/components/modern/MaterialListView.jsx`
   - `src/components/modern/MaterialListRow.jsx`
   - `src/components/modern/TestCard.jsx`
   - `src/components/modern/TestCard.css`

## 3. Non-Negotiable Visual Rule

The PRD-0052 mockup must look like PRD-0050 was extended, not replaced.

Allowed changes:

- add `Reading Passage` and `Book` tabs
- move tabs onto the same line as the subtitle if product confirms this layout
- add the 4 Test Type block module under the toolbar
- use Test Type logo cards for the module
- make Test Type block click filter the list and click again clear it
- make hover/focus settings icon open the Test Type preference modal
- make `Book` tab use Book cover cards

Forbidden changes:

- inventing a new shell/header/nav
- changing global page gradient, page padding, header spacing, button family, or tab language without explicit approval
- using generic oversized marketing cards
- using instructional filter pills such as "click again to clear"
- repeating a Test Type text title when the logo already contains the name
- wrapping the 4 Test Type blocks into a second row at supported teacher desktop widths
- replacing PRD-0050 list rows with card-like rows

## 4. Similarity Extraction Method

### 4.1 Capture Reference Evidence

Capture these screenshots:

- live Teacher Lobby Materials at `848 x 791`
- live Teacher Lobby Materials at `1366 x 900`
- live Teacher Lobby Materials at `1586 x 992`
- PRD-0050 `teacher-lobby-materials-list-view-mockups.html` at `1586 x 992`
- PRD-0050 `teacher-lobby-materials-list-view-components.html` at `1586 x 992`
- current PRD-0052 candidate mockup at the same sizes

Save all captures under:

```text
output/playwright/prd0052-visual-similarity/
```

### 4.2 Extract Computed Styles From Live And PRD-0050

For each reference, extract computed style values for:

- page background
- header height and padding
- main/page padding
- page title font size, weight, line height, margin
- subtitle font size, color, margin
- tabs display, gap, height, padding, border radius, colors, shadow
- toolbar grid/flex layout, height, gap, radius, shadow
- search input dimensions, icon position, text color
- primary CTA dimensions, color, radius, shadow
- PRD-0050 list row grid columns
- row height, accent strip width, icon tile size, action rail width
- grid/card radius, shadow, background, badge style

Store the extraction result as:

```text
output/playwright/prd0052-visual-similarity/style-extract.json
```

### 4.3 Build A Component Map

Create a table mapping each PRD-0052 mockup element to a source element:

| PRD-0052 Element | Must derive from | Notes |
| --- | --- | --- |
| Teacher header | live `TeacherHeader` | no custom header |
| Materials title/subtitle | live `TeacherLobbyPage` | preserve hierarchy |
| Tabs | live `ContentTabs` plus PRD-0052 new labels | no new tab styling |
| Search toolbar | live `SearchFilterBar` / PRD-0050 toolbar | no new search card look |
| Normal list below blocks | PRD-0050 `MaterialListView` | must stay list-first |
| Test Type blocks | old grid card/book-card language | 4 centered logo cards |
| Book cover cards | Book-specific cover card language | not old material test cards |
| Badges/chips | live `TestCard.css` / PRD-0050 badges | reuse shape and weights |
| Actions | PRD-0050 fixed action rail where list rows apply | no width-shifting buttons |

### 4.4 Quantitative Similarity Checks

Run these checks before calling the mockup acceptable:

- bounding-box diff for header, title block, tabs, toolbar, Test Type module, list region
- color diff for background, primary button, active tab, inactive tab, card surface, badge variants
- typography diff for title, subtitle, tab label, toolbar text, card text, list title
- radius/shadow diff for tabs, toolbar, buttons, cards, list rows
- viewport overflow check at `848`, `1280`, `1366`, `1440`, `1536`, `1586`, `1600`, and `1920`

Acceptance:

- shared components must match live/PRD-0050 within obvious visual tolerance
- new PRD-0052 components may differ only where the product concept requires it
- every visible mismatch must be listed in the difference register

## 5. Difference Register Template

Every mismatch must be recorded before another mockup revision is accepted.

| ID | Area | Reference | Candidate | Difference | Required Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| D-001 | Header | Live TeacherHeader | Candidate header | TBD | Use live header dimensions/treatment | Open |
| D-002 | Main spacing | Live/PRD-0050 | Candidate page | TBD | Copy live padding/margins | Open |
| D-003 | Tabs | Live ContentTabs | Candidate tabs | TBD | Use live tab CSS, only add labels | Open |
| D-004 | Toolbar | PRD-0050 toolbar | Candidate toolbar | TBD | Reuse SearchFilterBar geometry | Open |
| D-005 | Test Type blocks | Old grid/book-card language | Candidate blocks | TBD | Make logo cards aligned with Book cards | Open |
| D-006 | List rows | PRD-0050 MaterialListView | Candidate list | TBD | Use PRD-0050 compact list contract | Open |
| D-007 | Book grid | Book cover card target | Candidate book cards | TBD | Separate Book cover grid from normal material cards | Open |
| D-008 | Responsive behavior | Supported widths | Candidate widths | TBD | Keep 4 blocks one centered row | Open |

## 6. Rebuild Tasklist

- [ ] 1.0 Stop current PRD-0052 visual work until PRD-0050 extraction is complete.
  - [ ] 1.1 Confirm current live Teacher Lobby URL and active branch.
  - [ ] 1.2 Capture live screenshots at required viewports.
  - [ ] 1.3 Capture PRD-0050 mockup/component screenshots at matching viewports.
  - [ ] 1.4 Capture current PRD-0052 candidate screenshots at matching viewports.

- [ ] 2.0 Extract visual tokens and dimensions.
  - [ ] 2.1 Write a Playwright extraction script for computed styles and bounding boxes.
  - [ ] 2.2 Extract live Teacher Lobby styles.
  - [ ] 2.3 Extract PRD-0050 mockup styles.
  - [ ] 2.4 Extract PRD-0052 candidate styles.
  - [ ] 2.5 Save `style-extract.json`.
  - [ ] 2.6 Summarize token differences in the difference register.

- [ ] 3.0 Rebuild PRD-0052 mockup from PRD-0050 base.
  - [ ] 3.1 Use PRD-0050 page shell and toolbar as the starting layout.
  - [ ] 3.2 Use live `ContentTabs` styling and only add `Reading Passage` and `Book`.
  - [ ] 3.3 Place tabs inline with subtitle only if the layout matches live spacing and responsive behavior.
  - [ ] 3.4 Add 4 Test Type logo blocks under the toolbar using the old grid/book-card visual language.
  - [ ] 3.5 Make the 4 blocks one centered responsive row.
  - [ ] 3.6 Remove repeated Test Type title text when logo contains the name.
  - [ ] 3.7 Add small hover/focus settings icon with stop-propagation behavior.
  - [ ] 3.8 Use selected-card styling for active Test Type; no helper pill text.
  - [ ] 3.9 Keep normal material results in PRD-0050 compact list view.
  - [ ] 3.10 Add Book tab grid with Book cover cards only.

- [ ] 4.0 Verify similarity before showing user.
  - [ ] 4.1 Run screenshot comparison at required viewports.
  - [ ] 4.2 Run overflow checks at required viewports.
  - [ ] 4.3 Confirm shared components visually match live/PRD-0050 references.
  - [ ] 4.4 Fill difference register with all remaining mismatches.
  - [ ] 4.5 Do not present the mockup as close unless the difference register has no unhandled shared-component mismatch.

- [ ] 5.0 Update PRD-0052 only after visual base is corrected.
  - [ ] 5.1 Add the approved visual source stack to PRD-0052.
  - [ ] 5.2 Add the difference register outcome.
  - [ ] 5.3 Add final mockup screenshots as evidence.
  - [ ] 5.4 Convert approved mockup behavior into implementation tasks.

## 7. Junior Execution Rule

A junior developer must not improvise any visual style in PRD-0052.

For every visible element, the junior must name one of:

- live component source
- PRD-0050 mockup source
- PRD-0050 component source
- explicit PRD-0052 product exception

If none exists, stop and ask product before implementing.

## 8. Immediate Next Action

Do not make another PRD-0052 mockup revision from memory.

First produce:

1. screenshots from live, PRD-0050, and current PRD-0052 candidate
2. `style-extract.json`
3. completed difference register
4. rebuilt mockup based on PRD-0050 shell

## 9. Execution Result

Executed: 2026-06-01

Produced:

- `output/playwright/prd0052-visual-similarity/style-extract.json`
- `output/playwright/prd0052-visual-similarity/difference-register.md`
- `output/playwright/prd0052-visual-similarity/prd0052V5-848.png`
- `output/playwright/prd0052-visual-similarity/prd0052V5-1366.png`
- `output/playwright/prd0052-visual-similarity/prd0052V5-1586.png`
- `output/playwright/prd0052-visual-similarity/browser-current-v5.png`
- `.superpowers/brainstorm/prd0052-20260601-023550/content/teacher-materials-prd0050-derived-v5.html`

Findings:

- The prior `teacher-materials-live-faithful-v4.html` drifted materially from PRD-0050 in header, page spacing, tab geometry, toolbar geometry, and list-row structure.
- The new `teacher-materials-prd0050-derived-v5.html` uses PRD-0050 shell, button family, toolbar treatment, card radius, badge styling, and compact list-row contract as its base.
- V5 keeps the 4 Test Type blocks in one row at `848`, `1366`, and `1586` viewport widths.
- V5 had `0px` horizontal document overflow at `848`, `1366`, and `1586`.
- The local app at `http://localhost:5173/teacher-lobby` rendered a blank gradient during automated capture, so live app style extraction was not useful in this run. PRD-0050 artifacts were used as the reliable visual source.

Outstanding:

- Review `teacher-materials-prd0050-derived-v5.html` visually in the browser before converting it into implementation tasks.
- If exact live Teacher Lobby extraction is required, first repair or authenticate the local app route so it renders meaningful DOM instead of a blank gradient.
