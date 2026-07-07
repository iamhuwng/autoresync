# Task List: PRD-0050 Teacher Lobby Materials Compact List View

Created: 2026-05-29
Source PRD: `documentation/tasks/0050-prd-teacher-lobby-materials-list-view.md`
Status: Implemented

## Relevant Files

- `documentation/tasks/0050-prd-teacher-lobby-materials-list-view.md` - Product requirements for the Teacher Lobby Materials list view.
- `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/concept-current-style.png` - Approved visual target.
- `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-mockups.html` - Full-page HTML mockup reference.
- `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-components.html` - Component master reference.
- `documentation/tasks/0033-prd-teacher-lobby-refactor/design/teacher-lobby-materials-list-view/teacher-lobby-materials-list-view-proposal.md` - Design proposal, recommendations, and QA notes.
- `documentation/architecture/ui-design-standards.md` - Teacher UI design and Mantine replacement rule source.
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md` - Teacher Lobby navigation and authoring context.
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md` - Materials listing and diagnostics contract.
- `documentation/rules/codebase-hygiene.md` - Mantine ban and replacement hygiene rule.
- `documentation/rules/observability.md` - User-facing action and page tracking rule.
- `documentation/rules/react-patterns.md` - Component and React state pattern rule.
- `src/pages/TeacherLobbyPage.jsx` - Main Teacher Lobby page, tabs, filters, current grid rendering, and diagnostics.
- `src/components/modern/SearchFilterBar.jsx` - Current search/filter/create toolbar to extend with view-mode toggle.
- `src/components/modern/SearchFilterBar.css` - Toolbar layout and desktop overflow guard styles.
- `src/components/modern/TestCard.jsx` - Existing grid card behavior and action semantics for regular tests.
- `src/components/modern/ThcsTestCard.jsx` - Existing THCS grid card behavior and assignment action semantics.
- `src/components/modern/DraftCard.jsx` - Existing draft card behavior and resume/delete semantics.
- `src/components/modern/icons.jsx` - Existing icon source for list toggle and row icons.
- `src/components/modern/index.js` - Modern component exports if new list components are exported.
- `src/components/modern/MaterialViewModeToggle.jsx` - New segmented grid/list toggle.
- `src/components/modern/MaterialViewModeToggle.css` - New toggle styles.
- `src/components/modern/MaterialListView.jsx` - New list container and column header component.
- `src/components/modern/MaterialListView.css` - New list container, row grid, desktop fallback, and no-overflow styles.
- `src/components/modern/MaterialListRow.jsx` - New compact row component.
- `src/components/modern/MaterialListRow.css` - New compact row visual styles.
- `src/components/modern/materialListAdapter.js` - New pure adapter from current material/draft objects to list row view models.
- `src/hooks/test/useTeacherTests.ts` - Existing data-loading contract to preserve.
- `src/utils/teacherMaterialsDiagnostics.js` - Existing diagnostics helper to preserve and extend safely.
- `src/pages/TeacherLobbyPage.test.jsx` - Page-level tests to update for view switching and diagnostics.
- `src/components/modern/MaterialViewModeToggle.test.jsx` - New toggle tests.
- `src/components/modern/MaterialListView.test.jsx` - New list container tests.
- `src/components/modern/MaterialListRow.test.jsx` - New row rendering/action tests.
- `src/components/modern/materialListAdapter.test.js` - New adapter tests.
- `src/hooks/__tests__/useTeacherTests.test.ts` - Existing data contract tests; only update if implementation changes observable loading assumptions.
- `src/utils/__tests__/teacherMaterialsDiagnostics.test.ts` - Existing diagnostics tests; update only if diagnostics helper contract changes.

## Notes

- Before implementation, read the PRD and only the design/rule docs triggered by the work.
- Treat the approved mockup image, mockup HTML, and component HTML as the visual implementation contract, not mood-board references.
- Do not reinterpret the list as a widened one-column grid. Use the compact list/table row structure from the artifacts.
- If production code cannot match an artifact detail exactly, document the deviation, reason, and replacement behavior before handoff.
- This task targets teacher desktop. Do not spend effort designing a phone layout.
- No new `@mantine/*` imports are allowed. If touched teacher UI still uses Mantine, replace within touched scope when practical or document residue clearly.
- Do not add browser-storage persistence for view mode in this PRD.
- Do not add fake status/folder filters. Ship only backed controls.
- For Windows test commands in this repo, follow the repo rule and use the exact target root because shell cwd can drift: `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run ... --reporter=basic"`.
- Use targeted UTF-8 checks for touched docs/code: `cmd /c npm run check:utf8 -- <paths>`.

## Implementation Notes

- Branch: `codex/0050-teacher-materials-list-view-rebased` in `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`.
- Visual checklist preserved in implementation: toolbar search/create/toggle geometry, 112px grid/list toggle, column order `Material / Items / Updated / Actions`, 68px row height, fixed icon tiles, accent strips, compact badges, fixed action rail, and no horizontal overflow across required desktop widths.
- V1 decisions: Drafts stays grid-only for list rendering; view mode is memory-only; status/folder filters are omitted because no backed handlers/data exist; existing public-library filters remain public-only.
- Mantine: touched Teacher Lobby `AppShell` import was removed and replaced with native wrapper/main markup. No new `@mantine/*` imports were added.
- Intentional deviations from approved artifacts: My Content toolbar does not show `All Types`, `All Statuses`, or `All Folders` because those would be fake controls in current production data; `Duration` is badge-only rather than a scan column; row actions are icon-only in a fixed four-slot rail so `Assign HW` cannot shift layout; live screenshot footer is below the first viewport because the teacher account has 16 rows rather than the 7-row mockup sample.
- Post-review layout correction: the list now uses one shared fixed grid contract for header and row columns, removes the separate `Duration` column because duration remains a badge, and renders row actions as icon-only controls in a fixed four-slot rail so `Assign HW` cannot shift action geometry. Action slot ownership lives in the row view model from `materialListAdapter.js`.
- Post-review typography correction: list text now uses a restrained hierarchy instead of blanket bold. Titles are `600`, headers/badges/action fallback text are `500`, metrics/dates/footer are `400`, and icon-only action text remains visually hidden for accessibility only.
- Browser QA caveat: Drafts remains grid-only for PRD-0050 list rendering, but opening Drafts in the live local session still logs an existing Firestore missing-index error for `writing_drafts` (`userId`, `updatedAt`, `__name__`). This task did not change the draft query path.
- 2026-07-06 current-state note: selected-material actions were added later through the shared bulk-selection toolbar. Drafts still do not have list rows, but Draft cards can now expose selection for supported actions. See `documentation/architecture/teacher-materials-bulk-selection-actions.md`.
- Screenshot evidence captured:
  - `output/playwright/prd0050-materials-list-view/list-1366.png`
  - `output/playwright/prd0050-materials-list-view/list-1586.png`
  - `output/playwright/prd0050-materials-list-view/list-1920.png`

## Tasks

- [x] 1.0 Confirm implementation scope and protect contracts
  - [x] 1.1 Read `documentation/tasks/0050-prd-teacher-lobby-materials-list-view.md`.
  - [x] 1.2 Read `documentation/architecture/ui-design-standards.md` before UI edits.
  - [x] 1.3 Read `documentation/rules/codebase-hygiene.md` before touching any file that imports or is adjacent to `@mantine/*`.
  - [x] 1.4 Read `documentation/rules/react-patterns.md` before creating new reusable React components.
  - [x] 1.5 Read `documentation/rules/observability.md` before adding the view toggle or new action surfaces.
  - [x] 1.6 Inspect `TeacherLobbyPage.jsx`, `SearchFilterBar.jsx`, `TestCard.jsx`, `ThcsTestCard.jsx`, and `DraftCard.jsx`.
  - [x] 1.7 Identify exact action handlers currently used by grid cards and record which handlers list rows must reuse.
  - [x] 1.8 Confirm My Content, Public Library, and Drafts loading contracts from `useTeacherTests.ts` and draft hook usage.
  - [x] 1.9 Decide whether Drafts list support is included in V1. If not, record that Drafts remains grid-only for list rendering in the implementation notes.
  - [x] 1.10 Decide whether current Mantine `AppShell` replacement is in scope. If not, document as deferred residue without adding Mantine usage.
  - [x] 1.11 Create a short visual contract checklist from the mockup image, mockup HTML, and component HTML before coding.
  - [x] 1.12 Record any planned deviation from the approved artifacts before implementation, including reason and expected user impact.
  - [x] 1.13 Treat the visual contract checklist as a release gate. Do not mark implementation complete while unchecked visual requirements remain.

- [x] 2.0 Build normalized list-row adapter
  - [x] 2.1 Create `src/components/modern/materialListAdapter.js`.
  - [x] 2.2 Define a row view model shape with stable fields: `id`, `title`, `iconKind`, `accentKind`, `badges`, `itemLabel`, `durationLabel`, `updatedLabel`, `statusKind`, `actions`, and optional `disabledReason`.
  - [x] 2.3 Map regular test objects into row view models without changing source data.
  - [x] 2.4 Map THCS test objects into row view models while preserving grade/exam badges and `Assign HW` eligibility.
  - [x] 2.5 Map Reading V2 / IELTS reading listing objects using only listing-safe metadata.
  - [x] 2.6 Map incomplete items to recovery-oriented rows with disabled start behavior.
  - [x] 2.7 Map public-library items without owner-only edit/delete actions.
  - [x] 2.8 If Drafts are in V1, map draft objects to resume/delete row actions.
  - [x] 2.9 Add neutral fallbacks for missing duration, item count, updated date, and unknown material type.
  - [x] 2.10 Add `src/components/modern/materialListAdapter.test.js`.
  - [x] 2.11 Test regular, THCS, Reading V2, incomplete, public-library, and missing-metadata cases.

- [x] 3.0 Add grid/list view-mode toggle
  - [x] 3.1 Create `src/components/modern/MaterialViewModeToggle.jsx`.
  - [x] 3.2 Create `src/components/modern/MaterialViewModeToggle.css`.
  - [x] 3.3 Use accessible labels: `Grid view` and `List view`.
  - [x] 3.4 Use existing project icons from `icons.jsx` or the current icon source.
  - [x] 3.5 Make the active segment visually match the approved mockup.
  - [x] 3.6 Ensure toggle dimensions do not shift between active states.
  - [x] 3.7 Add `src/components/modern/MaterialViewModeToggle.test.jsx`.
  - [x] 3.8 Test active state, click behavior, keyboard reachability, and accessible names.

- [x] 4.0 Integrate toggle into the Materials toolbar
  - [x] 4.1 Extend `SearchFilterBar.jsx` with optional `viewMode` and `onViewModeChange` props.
  - [x] 4.2 Render the toggle only when those props are provided.
  - [x] 4.3 Keep existing search, type, grade, exam, and create-button behavior unchanged.
  - [x] 4.4 Do not add status/folder filters unless backed data and handlers are implemented.
  - [x] 4.5 Update `SearchFilterBar.css` so the toolbar aligns like the approved mockup on desktop.
  - [x] 4.6 Add shrink-safe CSS so the toolbar does not cause page overflow at required desktop widths.
  - [x] 4.7 Verify no mojibake is introduced or carried forward in touched visible labels.

- [x] 5.0 Build compact list components
  - [x] 5.1 Create `src/components/modern/MaterialListView.jsx`.
  - [x] 5.2 Create `src/components/modern/MaterialListView.css`.
  - [x] 5.3 Create `src/components/modern/MaterialListRow.jsx`.
  - [x] 5.4 Create `src/components/modern/MaterialListRow.css`.
  - [x] 5.5 Render visible column headers: Material, Items, Updated, Actions. Duration remains badge-only after post-review correction.
  - [x] 5.6 Use a CSS grid with shrink-safe columns and `min-width: 0` on text containers.
  - [x] 5.7 Use single-line title ellipsis plus title tooltip.
  - [x] 5.8 Render compact metadata badges without wrapping row height into card height.
  - [x] 5.9 Render row accent strip and icon tile using adapter `accentKind` and `iconKind`.
  - [x] 5.10 Render right-aligned actions from row view model.
  - [x] 5.11 Use the fixed icon-only four-slot action rail at all required desktop widths instead of text-dependent button widths or overflow menus.
  - [x] 5.12 Add a clear disabled state for incomplete or unavailable actions.
  - [x] 5.13 Keep normal row height in the `64px` to `68px` target range.
  - [x] 5.14 Compare row layout, badge shape, accent strip, icon tile, action buttons, and column alignment directly against `teacher-lobby-materials-list-view-components.html`.
  - [x] 5.15 Compare page composition, toolbar geometry, list density, footer, and no-overflow behavior directly against `teacher-lobby-materials-list-view-mockups.html`.
  - [x] 5.16 Compare final rendered screen against `concept-current-style.png`.
  - [x] 5.17 Add `src/components/modern/MaterialListView.test.jsx`.
  - [x] 5.18 Add `src/components/modern/MaterialListRow.test.jsx`.
  - [x] 5.19 Test header rendering, row rendering, badges, actions, disabled actions, and fallback metadata.

- [x] 6.0 Wire list view into `TeacherLobbyPage.jsx`
  - [x] 6.1 Add `materialsViewMode` state with default `grid`.
  - [x] 6.2 Pass `materialsViewMode` and setter into `SearchFilterBar`.
  - [x] 6.3 Keep current grid render path for `grid`.
  - [x] 6.4 Add list render path for `list`.
  - [x] 6.5 Reuse existing visible/filtered test arrays.
  - [x] 6.6 Reuse existing handlers for edit, delete, start test, assign homework, resume draft, and public-library actions.
  - [x] 6.7 Ensure switching view mode does not reset active content tab or search/filter input.
  - [x] 6.8 Ensure Drafts behavior follows the V1 decision from task 1.9.
  - [x] 6.9 Preserve current loading and empty states.
  - [x] 6.10 Preserve existing `shouldShowReadingV2TeacherLobbyItem` filtering.
  - [x] 6.11 Avoid any new broad data queries or heavy payload hydration.

- [x] 7.0 Update diagnostics and observability
  - [x] 7.1 Add `viewMode` to Teacher Lobby render diagnostics.
  - [x] 7.2 Keep existing `grid_rendered` diagnostic compatibility unless a test-approved migration is done.
  - [x] 7.3 If a new `list_rendered` or `materials_rendered` event is added, test it without logging full payloads.
  - [x] 7.4 Ensure new toggle interaction is observable according to `documentation/rules/observability.md`.
  - [x] 7.5 Update `TeacherLobbyPage.test.jsx` or diagnostics tests for the final event contract.

- [x] 8.0 Test behavior
  - [x] 8.1 Run adapter tests: `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/materialListAdapter.test.js --reporter=basic"`.
  - [x] 8.2 Run toggle/list component tests: `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/MaterialViewModeToggle.test.jsx src/components/modern/MaterialListView.test.jsx src/components/modern/MaterialListRow.test.jsx src/components/modern/SearchFilterBar.test.jsx --reporter=basic"`.
  - [x] 8.3 Run Teacher Lobby page tests: `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic"`.
  - [x] 8.4 Run related existing card tests if action behavior was touched: `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/TestCard.test.jsx src/components/modern/DraftCard.test.jsx --reporter=basic"`.
  - [x] 8.5 Run hook tests only if loading assumptions changed. N/A: loading assumptions were not changed.
  - [x] 8.6 Run targeted UTF-8 verification for touched files.
  - [x] 8.7 Run `git diff --check -- <touched files>`.

- [x] 9.0 Browser visual QA
  - [x] 9.1 Start the local app using the repo's normal dev command.
  - [x] 9.2 Verify authenticated Teacher access. Existing local Teacher session was active, so the dev quick-login fallback was not needed.
  - [x] 9.3 Open Teacher Lobby Materials.
  - [x] 9.4 Verify grid is still available and visually unchanged in purpose.
  - [x] 9.5 Switch to list view.
  - [x] 9.6 Verify list rows faithfully match the approved current-style artifacts: compact rows, table-like alignment, accent strip, icon tile, badges, and right actions.
  - [x] 9.7 Verify long titles ellipsize and expose full title.
  - [x] 9.8 Verify My Content, Public Library, and Drafts behavior according to V1 scope.
  - [x] 9.9 Verify no horizontal document overflow at widths `1280`, `1366`, `1440`, `1536`, `1586`, `1600`, and `1920`.
  - [x] 9.10 Verify hover/focus/action states do not resize rows or columns.
  - [x] 9.11 Capture screenshots for at least `1366`, `1586`, and `1920`.
  - [x] 9.12 Review final screenshots side-by-side with `concept-current-style.png`, the mockup HTML render, and the component HTML render.
  - [x] 9.13 Document every visual mismatch that remains, including whether it is accepted, deferred, or must be fixed before release.
  - [x] 9.14 Pass artifact contract gate: implementation checklist covers toolbar, toggle, columns, rows, badges, actions, footer, and overflow behavior from the approved artifacts.
  - [x] 9.15 Pass component parity gate: row, badge, action, and toggle components match `teacher-lobby-materials-list-view-components.html` or deviations are documented.
  - [x] 9.16 Pass page parity gate: final page screenshots at `1366`, `1586`, and `1920` match `concept-current-style.png` and `teacher-lobby-materials-list-view-mockups.html` or deviations are documented.
  - [x] 9.17 Pass overflow gate: `document.documentElement.scrollWidth <= document.documentElement.clientWidth` and `document.body.scrollWidth <= document.body.clientWidth` at `1280`, `1366`, `1440`, `1536`, `1586`, `1600`, and `1920`.
  - [x] 9.18 Pass deviation gate: no undocumented visual mismatch remains.

- [x] 10.0 Final documentation and handoff
  - [x] 10.1 Update this tasklist with completed files and final verification commands.
  - [x] 10.2 Update the design proposal MD if implementation intentionally deviates from the approved mockup.
  - [x] 10.3 Record any deferred items: Drafts list support, status/folder filters, view-mode persistence, or Mantine shell replacement. Later selected-material Draft actions do not change this PRD-0050 list-view deferral.
  - [x] 10.4 Confirm no accidental data-contract, route, or schema changes were included.
  - [x] 10.5 Include the visual contract checklist and accepted/deferred deviations in final handoff.
  - [x] 10.6 Provide final summary with changed files, tests, screenshots, and residual risk.
