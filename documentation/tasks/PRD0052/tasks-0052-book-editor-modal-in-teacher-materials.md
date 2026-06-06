# Task List: PRD-0052 Book Editor Modal In Teacher Materials

Created: 2026-06-05
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
Status: Complete

> **Current-contract notice (2026-06-06):** The canonical maintained contract is
> `documentation/architecture/book-editor-authoring-modal-architecture.md`.
> Earlier four-tab (`Contents` / peer `Assign`), route-first, decorative-tab,
> paused-redesign, and menu-deferred wording below is historical implementation
> sequence only. It is obsolete where it conflicts with the canonical architecture
> or the later approved three-tab/Stitch tasks.

## Goal

Open the redesigned Book editor from the Teacher Materials `Book` tab as an in-page modal on the current Teacher Lobby page, instead of navigating to a separate Book editor page. The modal must reuse the Teacher Lobby edit-test modal design used by IELTS `TestEditor` and THCS `THCSTestEditorModal`: large glass editor frame, pinned header, tab rail, scrollable body, fixed save/close actions, and two-pane editing layout.

## Non-Goals

- Do not build whole-Book homework assignment.
- Do not build student Book runtime, Book progress, or Book result aggregation.
- Do not build new public Book moderation UI.
- Do not add new `@mantine/*` imports.
- Do not move or restyle `TeacherHeader`.
- Do not route normal Book-card opening to `/teacher/materials/books/:bookId`.

## Required Reading Before Code

- `DESIGN.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
- `documentation/architecture/teacher-materials-list-view-contract.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- `documentation/rules/observability.md`
- `documentation/rules/navigation.md`
- `documentation/rules/react-patterns.md`
- `documentation/rules/mobile-portability.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/tasks/process-task-list.md`

## Historical Contract Superseded

- `src/pages/TeacherLobbyPage.jsx:1077-1085` currently opens Books through `navigateTo('TEACHER_MATERIAL_BOOK', { bookId })`.
- `src/constants/routes.ts:70` defines `TEACHER_MATERIAL_BOOK` as `/teacher/materials/books/:bookId`.
- `src/routes/teacherRoutes.tsx:129-141` currently mounts `BookEditorPage` at `/teacher/materials/books/:bookId` or redirects disabled users back to `/lobby`.
- `src/components/books/BookEditorPage.tsx:257-263` currently depends on `useParams()` and route-owned `bookId`.
- `src/components/books/BookEditorPage.tsx:825` currently renders its own `TeacherHeader`, which must not appear inside a modal opened from Teacher Lobby.
- `src/pages/TeacherLobbyPage.test.jsx:687-727` currently expects `Open Book` to call `navigateTo('TEACHER_MATERIAL_BOOK', ...)`; replace this expectation with modal opening.

## Design Source Of Truth

- `src/components/test/editor/EditTestFrame.tsx:199-388` is the visual design reference for the Book editor modal frame: wide glass card, `75vw`, `maxWidth: 1200px`, `85vh`, pinned header, tab rail, scrollable body, save action, and close icon.
- `src/components/TestEditor.tsx:961-990` shows the IELTS edit modal mount pattern and layout handoff.
- `src/components/thcs-editor/THCSTestEditorModal.tsx:688-721` shows the THCS edit modal mount pattern and `EditTestFrame` usage.
- `src/components/test/editor/layouts/BaseEditorLayout.tsx:88-148` shows the two-pane edit layout: left `380px` list/picker panel, right editor/inspector panel, scroll-safe body.
- `EditTestFrame` currently imports Mantine at `src/components/test/editor/EditTestFrame.tsx:2`; do not import it directly into new Book UI unless the touched frame is first converted to native/no-Mantine. For this task, copy the design contract into native Book modal CSS/classes.

## Teacher Authoring Modal Philosophy

This section is the source of truth for redesigning the Book editor modal. The edit-test modal is not only a visual reference or skin. It is the shared teacher-authoring shell philosophy used by Teacher Lobby edit flows so IELTS, THCS, and Book editing feel like one product family.

The current code anchors are `src/components/test/editor/EditTestFrame.tsx:199-388` and `src/components/test/editor/layouts/BaseEditorLayout.tsx:88-148`. These anchors are authoritative until a separate reusable native teacher authoring modal component exists.

Required structure:

- One modal frame owns the authoring chrome. The frame, not the body workspace, owns the title, primary actions, close action, tab rail, and scroll boundary.
- One pinned header owns identity and action state. Do not create a second hero, page title, breadcrumb, duplicated status chips, or duplicated command bar inside the modal body.
- One real tab rail owns editor mode switching. The tab rail must be interactive, accessible, and part of the modal frame, not decorative and not duplicated inside the workspace.
- The body is a work area, not a page transplanted into a modal. Body content should start with the active tool surface, not with page-level marketing, hero, or route-shell chrome.
- Authoring layouts use the same mental model: left side selects structure/source items, right side edits or inspects the selected item. The canonical desktop left panel is near `380px`; narrow screens may stack without changing information architecture.
- Status and warning messages live near the work they affect. They should not become persistent footer badges unless the edit-test modal shell also uses that pattern.
- Book-specific labels and controls are allowed only inside this shared shell grammar. The current Book modes are exactly `Overview`, `Content`, and `Settings`; selected-material assignment stays inside `Content`.
- If Book page styles conflict with this philosophy, the edit-test authoring shell wins. Remove or adapt page-era UI instead of preserving it inside the modal.

Concrete modal shell contract:

- Outer frame uses `width: 75vw`, `max-width: 1200px`, `height: 85vh`, `display: flex`, `flex-direction: column`, and `overflow: hidden`.
- The header and tab rail are flex-pinned by `flex-shrink: 0`; they are not sticky-position elements. The body is the scrolling region.
- Header uses `padding: 1rem 1.5rem`, a subtle violet/blue header wash, a thin violet border, and horizontal alignment of left identity, optional compact metadata, and right actions.
- Header identity is compact. It should use one visible title, optional small edit/status affordances, and short chips only when they fit without wrapping into action controls.
- Primary action sits in the header action group. Secondary actions may sit beside it only when they fit the same compact command row.
- The close control is an icon button with an accessible name. It should not be a plain text `x` unless styled and labelled as the shared close icon treatment.
- Tab rail sits directly under the header with `padding: 0.5rem 1.5rem`, `display: flex`, `gap: 2rem`, and a thin bottom border.
- Tab buttons use icon plus label where a known icon exists. Active tab uses violet underline `2px solid #8b5cf6`, violet text `#8b5cf6`, and weight `600`; inactive tab uses slate text `#64748b` and weight `500`.
- Body container uses `flex: 1`, `overflow: auto`, and `position: relative`.
- Body content owns only the selected work surface. It must not contain a second frame, page shell, page hero, route breadcrumb, or persistent footer.

Concrete body layout contract:

- `Questions` and `Answer Key` in the current edit-test modal use full-height two-pane layouts: wrapper `display: flex`, `gap: 1.5rem`, `height: 100%`, `padding: 1rem`.
- The left pane uses `width: 380px`, `height: 100%`, and `flex-shrink: 0`.
- The right pane uses `flex: 1`, `height: 100%`, and `overflow: hidden`.
- Left pane purpose is selection, structure, source list, or answer-key selector.
- Right pane purpose is editor, inspector, preview, or detail surface for the selected left item.
- Context/resource-style tabs may use a full-width body when there is no meaningful left selection surface.
- Empty states live inside the right pane or active work surface. They must not introduce a second modal shell or a page hero.

Book modal body mapping:

- `Overview` owns Book metadata, Book statistics, and readiness/blocker summary. It may be full-width because it summarizes the Book rather than selecting a structure item. It should use concise metadata/stat/readiness panels inside the body, not a hero.
- `Content` owns all Book content editing. It must use the two-pane contract. Left pane owns the Book structure tree: add/remove/rename/reorder/move/nest Book parts and show compact material-ref/status badges. Right pane owns selected item detail editing: section/chapter/test fields, selected material inspection, attach material, assign selected material, remove selected material, and selected-item move actions when they need more room than a compact left-pane menu.
- `Settings` owns access and lifecycle controls: private/public visibility, public review state, review blockers, archive/delete/maintenance actions if supported. It must not become the metadata form.
- Loading, error, stale-conflict, and permission-denied states render inside the body below the tab rail and within the same modal frame. They do not replace the frame, header, or tab rail.
- Dirty/discard and delete confirmations stack inside the modal frame. Escape closes the top confirmation before requesting modal close.

Approved 2026-06-05 Book modal tab ownership correction:

- The modal tab rail must be reduced to `Overview`, `Content`, and `Settings`.
- Do not keep `Assign` as a peer tab. Assignment is part of editing selected Book content and belongs inside `Content`.
- Do not spread content work across `Overview`, `Assign`, and `Content`.
- `Overview` must answer: what is this Book, what metadata does it carry, and what is its current readiness/statistical health.
- `Content` must answer: what is inside this Book, how is it structured, and what can the teacher do with the selected part/material.
- `Settings` must answer: who can access this Book, what public-review state is it in, and what maintenance controls apply.
- The left side of `Content` is the Book structure tree. The right side is selected item details. This is the main UX model for the content redesign.
- Keep copy short. Prefer labels, chips, statuses, icons, menus, and selected-state panels over instructional paragraphs.
- Use progressive disclosure: show core structure first, reveal advanced controls after selection or from compact menus.

Approved 2026-06-05 Stitch Content panel redesign:

- Source artifacts:
  - Stitch project: `projects/10653178060668333917` (`PRD0052 Book Editor Tabs Mockup`).
  - Stitch screen: `projects/10653178060668333917/screens/1dc6bbc4059a4cbdb9463da82c3c9e6a` (`Book Editor - Content Tab Redesign`).
  - Screenshot: `.stitch/designs/book-editor-content-tab-redesign.png`, verified `2560x2048`.
  - HTML: `.stitch/designs/book-editor-content-tab-redesign.html`.
- Treat the approved mockup and HTML as a concrete layout and interaction guide, not as loose inspiration. Implementation may translate Stitch utility classes into repo CSS, but it must preserve panel roles, hierarchy, density, spacing intent, selected-state treatment, and action placement.
- Scope is desktop/tablet modal UX only for this follow-up. Ignore mobile-specific stacking in this slice unless a change creates horizontal overflow at the desktop/tablet widths under test.
- `Content` left panel is a Book outline navigator, not a command surface:
  - Fixed desktop width remains near `380px`.
  - Header shows `Book outline` plus a compact count summary such as `4 parts · 3 materials`.
  - Top toolbar exposes only compact root creation actions: `+ Section`, `+ Chapter`, `+ Test`. Do not show the old broad row of `+ Intro`, `+ TOC`, `+ Note`, `+ Section`, `+ Chapter`, `+ Test` as primary visible controls.
  - Add an outline search field with placeholder `Search outline`.
  - Tree rows show hierarchy, selected state, type chip, material count/status, and one compact menu/icon action at row end.
  - Selected node row uses light indigo focus background plus a clear left accent. Keep status text readable; do not rely on color alone.
  - Material refs render as indented child rows under their parent node with kind chip and availability/update status.
  - Do not render visible text command dumps (`Up`, `Down`, `Select`, `Move to`, `Delete`, child add buttons) on every row. Those controls must move into the right panel or a compact row menu.
  - Do not render `BookMaterialPicker` inside the left tree.
- `Content` right panel is the selected-item workspace:
  - Header starts with selected item type/title such as `Selected section` and a status chip such as `ready`.
  - Placement appears near the top as a compact path line, for example `Root / Section 1 · Depth 1 · Order 1`.
  - `Details` contains the selected node title input and type select in a compact grid.
  - `Structure actions` contains selected-item actions such as `Move up`, `Move down`, and destructive `Delete`. These are not repeated in the left tree.
  - `Attach material` contains the search field `Search published materials` and compact candidate rows with title, kind/Test Type metadata, and right-aligned `Attach`.
  - `Selected material` area shows the selected/active referenced material summary and actions `Assign selected` and `Remove`.
  - Whole-Book assignment warning copy appears only near the selected-material assignment area. Do not show a large global warning block in the empty right panel.
  - Avoid the Stitch label `Currently Active Draft Item` in product copy; use `Selected material` unless product terminology later changes.
- Modal-level constraints still apply:
  - Header owns `Save` and `Request review`.
  - No body-level `Save Book Structure`.
  - No peer `Assign` tab.
  - No footer/status strip.
  - No nested cards inside cards; use panels, rows, compact groups, separators, and tonal layers.
  - No hero layout, marketing copy, gradients, or decorative background effects inside the modal.

Allowed compromises:

- Use native/custom CSS instead of importing `EditTestFrame` while `EditTestFrame` still imports Mantine.
- Use Book-specific tab labels and Book-specific copy, but keep the same shell ownership, tab rail behavior, body scroll model, and pane grammar.
- Use text labels for Book-specific actions when no established icon exists, but close/save icons should follow existing edit-test icon intent when practical.
- On narrow screens, the two-pane body may stack. The left selection surface must appear before the right detail surface, and horizontal overflow must stay `false`.
- If a Book tab does not naturally need two panes, use full-width content, but keep it inside the same body padding, card density, and scroll model.
- If the Book needs warning copy not present in the edit-test modal, place it near the relevant body workflow and keep it visually subordinate.

Not allowed compromises:

- Keeping the old page hero because it is easier than moving title/actions into the modal frame.
- Keeping workspace-owned tabs because the modal already has a decorative rail.
- Keeping duplicate header and body save actions.
- Keeping a persistent footer/status strip to avoid placing warnings in the correct tab.
- Hiding overflow to mask broken width math.
- Changing `TeacherHeader` or Teacher Lobby page chrome to make the modal fit.

Design failures:

- A modal header plus an inner Book hero.
- A decorative modal tab rail plus real workspace tabs.
- More than one visible `Save` or `Request review` command group in the modal.
- Persistent footer/status strip replacing edit-test body-only scrolling.
- Modal body that still reads as a standalone page because it keeps breadcrumb, page title, page actions, or route-shell spacing.

## Relevant Files

- `src/pages/TeacherLobbyPage.jsx` - Own Book-tab state, modal open/close state, Book-card handlers, route-state recovery, and list refresh after modal saves.
- `src/pages/TeacherLobbyPage.css` - Host-page modal stacking and Book-tab overflow checks.
- `src/pages/TeacherLobbyPage.test.jsx` - Replace route-open expectations with modal-open expectations.
- `src/components/modern/BookCard.jsx` - Keep `Open Book`, `Edit metadata`, and `Archive`; `Open Book` must call modal opener.
- `src/components/modern/BookCardGrid.jsx` - Continue passing `onOpenBook` from Teacher Lobby.
- `src/components/books/BookEditorPage.tsx` - Extract route/page editor logic into a reusable workspace.
- `src/components/books/BookEditorPage.css` - Move reusable editor body styles to workspace/modal CSS and remove page-only assumptions from modal presentation.
- `src/components/books/BookEditorWorkspace.tsx` - New extracted editor body. It receives `bookId` as prop and owns loading/saving/tabs/nodes/material refs without `TeacherHeader` or `useParams()`.
- `src/components/books/BookEditorWorkspace.css` - New reusable workspace styles for modal body.
- `src/components/books/BookEditorModal.tsx` - New Teacher Lobby modal wrapper for Book editing.
- `src/components/books/BookEditorModal.css` - New native modal frame styles matching the IELTS/THCS edit modal design.
- `src/components/books/BookNodeTree.tsx` - Preserve node/ref editing; replace modal-hostile browser confirm flows with in-modal confirmation UI for Book node deletion; redesign left tree to stay compact while right panel owns selected-item detail work.
- `src/components/books/BookNodeTree.css` - Style compact tree rows, selected states, status badges, icon/menu actions, and no-overflow narrow layouts.
- `src/components/books/BookMaterialPicker.tsx` - Preserve published-material picker in the modal right/left pane flow; redesign as selected-item attach flow inside `Content`.
- `src/components/books/BookMaterialPicker.css` - Style compact searchable attach list inside the selected-item detail panel.
- `.stitch/designs/book-editor-content-tab-redesign.png` - Approved Stitch visual reference for the `Content` left/right panel redesign.
- `.stitch/designs/book-editor-content-tab-redesign.html` - Approved Stitch HTML reference for spacing, panel anatomy, row grouping, and component hierarchy.
- `src/components/books/CreateBookModal.tsx` - Keep metadata-only create/edit modal separate; do not merge it with full Book editor modal.
- `src/components/books/BookEditorModal.test.tsx` - Verify three-tab modal rail, no `Assign` peer tab, frame-owned actions, and no duplicate body commands.
- `src/components/books/BookEditorWorkspace.test.tsx` - Verify Overview metadata/statistics, Content structure/detail ownership, Settings access ownership, save behavior, and assignment from selected material.
- `src/routes/teacherRoutes.tsx` - Replace route-backed Book editor page with a compatibility redirect into `/lobby` route state.
- `src/routes/TeacherMaterialBookRedirect.tsx` - New route adapter for legacy/deep links to open Teacher Lobby with Book editor modal state.
- `src/routes/teacherRoutes.test.tsx` - Update route tests for redirect-to-lobby modal state.
- `src/constants/routes.ts` - Keep or retire `TEACHER_MATERIAL_BOOK` only after route tests and feature registry are updated consistently.
- `src/constants/routes.test.ts` - Update route expectations according to final compatibility decision.
- `src/config/routeSecurity.ts` - Update description if the route becomes a compatibility redirect.
- `src/config/featureRegistry.ts` - Add modal open/close/failure actions if new action names are introduced.
- `src/config/featureRegistry.test.ts` - Verify feature-route and action registry updates.

## Implementation Decisions

- Normal Book opening stays on the current Teacher Lobby URL. `Open Book` must set local modal state; it must not call `navigateTo('TEACHER_MATERIAL_BOOK', ...)`.
- The legacy `/teacher/materials/books/:bookId` path becomes a compatibility route that redirects to `/lobby` with `location.state.teacherMaterialsOpenBookId = bookId`.
- `TeacherLobbyPage` consumes `teacherMaterialsOpenBookId` once, switches to the `Book` tab, and opens `BookEditorModal`.
- `BookEditorModal` uses a native/custom dialog implementation with `role="dialog"`, `aria-modal="true"`, labelled title, Escape handling, focus return, and backdrop click behavior matching edit-test modal close behavior.
- `BookEditorWorkspace` must not render `TeacherHeader`.
- The modal frame must visually match the IELTS/THCS edit modal frame: wide glass editor, pinned header, inline title/status area, tab rail, scrollable body, and save/close actions.
- The modal implementation must follow `Teacher Authoring Modal Philosophy`. If a code path satisfies dimensions but keeps page-era body chrome, duplicated command groups, decorative tabs, or a persistent footer/status strip, the design contract is not complete.
- Modal body uses exactly `Overview`, `Content`, and `Settings`; peer `Assign` is retired.
- Content tab uses the edit-test two-pane design: left outline navigator near `380px`, right selected-node/material inspector panel, responsive stack on phone.
- Closing with unsaved metadata or node/ref changes opens an in-modal confirmation. Do not use `window.confirm` for modal close or node deletion.
- After a successful Book metadata or structure save, Teacher Lobby increments `bookListVersion` so Book cards refresh without leaving the page.
- Nested homework assignment from a Book material ref remains allowed for selected refs only. Its modal must stack above the Book editor modal and return focus to the Book editor after close.

## Tasks

- [x] 1.0 Lock old route behavior and modal contract
  - [x] 1.1 Read every required file listed above before editing.
  - [x] 1.2 In `documentation/tasks/PRD0052/prd0052-implementation-notes.md`, add a dated note that the previous route-backed Book editor contract is superseded for normal Teacher Materials flow.
  - [x] 1.3 In `documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md`, update the Book editor row so `FR-BOOK-EDITOR-*` maps to `BookEditorModal` and `BookEditorWorkspace`, not a standalone page-only route.
  - [x] 1.4 Record these hard constraints in the implementation notes: no `TeacherHeader` inside the modal, no normal `navigateTo('TEACHER_MATERIAL_BOOK')`, no new Mantine imports, no whole-Book homework action.
  - [x] 1.5 Grep current route/open usage:
    - `rg -n "TEACHER_MATERIAL_BOOK|/teacher/materials/books|BookEditorPage|openBook" src`
  - [x] 1.6 Save the grep results in the implementation notes before changing code.

- [x] 2.0 Extract Book editor workspace from page shell
  - [x] 2.1 Create `src/components/books/BookEditorWorkspace.tsx`.
  - [x] 2.2 Move editor state and behavior from `BookEditorPage.tsx` into `BookEditorWorkspace`: book load, public projection fallback, node load, material candidate load, metadata form, tabs, selected ref, assignment request, save metadata, save structure, request public review, and error states.
  - [x] 2.3 Give `BookEditorWorkspace` these props:
    - `bookId: string`
    - `initialBook?: MaterialBookMetadata`
    - `initialNodes?: readonly MaterialBookNode[]`
    - `materialCandidates?: readonly BookMaterialSummary[]`
    - `repository?: MaterialBooksRepository`
    - `presentation: 'modal' | 'page-compat'`
    - `onClose?: () => void`
    - `onSaved?: (bookId: string) => void`
    - `onDirtyChange?: (dirty: boolean) => void`
  - [x] 2.4 Remove `useParams()` from workspace logic. `bookId` comes only from props.
  - [x] 2.5 Remove `TeacherHeader` from workspace rendering.
  - [x] 2.6 Move reusable styles from `BookEditorPage.css` into `BookEditorWorkspace.css`.
  - [x] 2.7 Remove page-root assumptions from modal styles: no `min-height: 100vh`, no page-wide `main`, no viewport-scaled title font.
  - [x] 2.8 Keep public projection read-only behavior from `BookEditorPage.tsx:313-335`.
  - [x] 2.9 Keep owner/super-admin write behavior and existing validation through `updateBookMetadata` and `updateBookTree`.
  - [x] 2.10 Expose dirty state by comparing current metadata/nodes to the last loaded or last saved snapshot.
  - [x] 2.11 Call `onSaved(bookId)` after successful metadata save, structure save, and request-review save.

- [x] 3.0 Build native Book editor modal frame
  - [x] 3.1 Create `src/components/books/BookEditorModal.tsx`.
  - [x] 3.2 Create `src/components/books/BookEditorModal.css`.
  - [x] 3.3 Implement a native dialog wrapper with:
    - Backdrop class `book-editor-modal__backdrop`
    - Frame class `book-editor-modal__frame`
    - Header class `book-editor-modal__header`
    - Tab rail class `book-editor-modal__tabs`
    - Body class `book-editor-modal__body`
    - Footer/status class `book-editor-modal__status`
  - [x] 3.4 Match the edit-test modal dimensions: `width: min(75vw, 1200px)`, `height: min(85vh, 900px)`, desktop centered, mobile `width: calc(100vw - 24px)` and `height: calc(100dvh - 24px)`.
  - [x] 3.5 Match the edit-test modal visual language: glass card, light teal/violet-accent gradient, thin translucent border, restrained shadow, pinned header, scrollable body.
  - [x] 3.6 Use native buttons and existing repo icons/classes. Do not import `@mantine/*`.
  - [x] 3.7 Header content must show Book title, Book status, visibility, test-type chips, Save button, Request review button when valid, and icon close button.
  - [x] 3.8 Tab rail mirrors edit-test modal behavior with the final Book tabs: `Overview`, `Content`, `Settings`.
  - [x] 3.9 Body must render `BookEditorWorkspace` content without a nested page/card shell.
  - [x] 3.10 Escape key triggers close request. If dirty, show in-modal discard confirmation.
  - [x] 3.11 Backdrop click triggers close request. If dirty, show in-modal discard confirmation.
  - [x] 3.12 On open, focus the modal heading or first actionable control. On close, return focus to the `Open Book` button that launched it.

- [x] 4.0 Wire Teacher Lobby Book cards to the modal
  - [x] 4.1 In `src/pages/TeacherLobbyPage.jsx`, add state:
    - `bookEditorOpen`
    - `bookEditorBookId`
    - `bookEditorLauncherRef`
    - `bookEditorDirty`
  - [x] 4.2 Replace `handleOpenBook` so it tracks `openBook` and `teacher_materials_book_editor_opened`, sets `contentFilter` to `book`, stores `bookEditorBookId`, and opens `BookEditorModal`.
  - [x] 4.3 Remove `navigateTo('TEACHER_MATERIAL_BOOK', ...)` from normal Book-card opening.
  - [x] 4.4 Keep `BookCardGrid` and `BookCard` action labels unchanged: `Open Book`, `Edit metadata`, `Archive`.
  - [x] 4.5 Pass `canUseMaterialBookEditor` into Book-card action state. When editor is disabled, `Open Book` is disabled with a title/aria description and no route flash.
  - [x] 4.6 Render `BookEditorModal` near the existing modal stack in `TeacherLobbyPage.jsx`, after `CreateBookModal` and before `TestTypePreferenceModal`.
  - [x] 4.7 On modal close, preserve current `contentFilter`, `bookScope`, `searchTerm`, and `activeTestTypeId`.
  - [x] 4.8 On modal save, increment `bookListVersion`.
  - [x] 4.9 Keep `CreateBookModal` metadata-only; do not make it host node/ref editing.

- [x] 5.0 Convert legacy Book editor route into current-page modal entry
  - [x] 5.1 Create `src/routes/TeacherMaterialBookRedirect.tsx`.
  - [x] 5.2 In the redirect component, read `bookId` from `useParams()`.
  - [x] 5.3 When Book editor feature is enabled, redirect to `buildRoute('LOBBY')` with state:
    - `teacherMaterialsOpenBookId: bookId`
    - `teacherMaterialsOpenBookSource: 'legacy-book-route'`
  - [x] 5.4 When Book editor feature is disabled, redirect to `buildRoute('LOBBY')` with existing disabled notice state.
  - [x] 5.5 In `src/routes/teacherRoutes.tsx`, replace direct `BookEditorPage` route element with `TeacherMaterialBookRedirect`.
  - [x] 5.6 Remove the lazy `BookEditorPage` route import from `teacherRoutes.tsx`.
  - [x] 5.7 In `TeacherLobbyPage.jsx`, consume `location.state.teacherMaterialsOpenBookId` once, switch to `Book`, and open `BookEditorModal`.
  - [x] 5.8 Prevent repeated route-state modal openings after the first open by replacing or clearing history state through the existing navigation abstraction.
  - [x] 5.9 Update `src/config/routeSecurity.ts` description to `Teacher material Book editor compatibility redirect`.
  - [x] 5.10 Keep `ROUTES.TEACHER_MATERIAL_BOOK` only as a compatibility route until all external links are audited.

- [x] 6.0 Replace modal-hostile confirmations inside Book editing
  - [x] 6.1 In `BookNodeTree.tsx`, replace non-empty node delete `window.confirm` with a callback prop such as `onRequestDeleteNode(nodeId)`.
  - [x] 6.2 Implement the delete confirmation inside `BookEditorWorkspace` as an in-modal panel/dialog.
  - [x] 6.3 Keep source materials untouched when deleting Book nodes or refs.
  - [x] 6.4 Keep existing archive confirmation in Teacher Lobby for Book cards, because archive happens outside the editor modal.
  - [x] 6.5 Verify Escape closes only the top active confirmation first, then the Book editor modal on the next Escape.

- [x] 7.0 Update tests for modal behavior
  - [x] 7.1 Update `src/pages/TeacherLobbyPage.test.jsx` test currently named `opens Book cards through the registered Book editor route and omits whole-Book student actions`.
  - [x] 7.2 New expectation: clicking `Open Book` opens `role="dialog"` named from the Book title and does not call `navigateTo('TEACHER_MATERIAL_BOOK', ...)`.
  - [x] 7.3 Add Teacher Lobby test: close modal returns to Book tab and preserves Book Private/Public scope.
  - [x] 7.4 Add Teacher Lobby test: route state `teacherMaterialsOpenBookId` opens Book tab and modal once.
  - [x] 7.5 Add Teacher Lobby test: disabled `canUseMaterialBookEditor` disables `Open Book` and shows no modal.
  - [x] 7.6 Create `src/components/books/BookEditorModal.test.tsx`.
  - [x] 7.7 Modal tests must assert: accessible dialog, no `TeacherHeader`, edit-test frame classes present, Escape close, dirty close confirmation, focus return, and save callback refresh.
  - [x] 7.8 Create or update `src/components/books/BookEditorWorkspace.test.tsx` by moving non-route tests from `BookEditorPage.test.tsx`.
  - [x] 7.9 Workspace tests assert: load by `bookId` prop, public projection fallback, final three-tab ownership, save metadata, save structure, request review, stale conflict error, and individual ref homework handoff from `Content`.
  - [x] 7.10 Update `src/routes/teacherRoutes.test.tsx` to expect compatibility redirect behavior instead of route-rendered `BookEditorPage`.
  - [x] 7.11 Update `src/constants/routes.test.ts` only if the compatibility route constant changes.
  - [x] 7.12 Update `src/config/featureRegistry.test.ts` if modal action names or route descriptions change.

- [x] 8.0 Run targeted verification
  - [x] 8.1 Run Book modal/workspace tests:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx --reporter=basic --pool=forks"`
  - [x] 8.2 Run Teacher Lobby and Book card tests:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/TeacherLobbyPage.test.jsx src/components/modern/BookCardGrid.test.jsx --reporter=basic --pool=forks"`
  - [x] 8.3 Run route and registry tests:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/routes/teacherRoutes.test.tsx src/constants/routes.test.ts src/config/featureRegistry.test.ts --reporter=basic --pool=forks"`
  - [x] 8.4 Run Book service/editor safety tests:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx --reporter=basic --pool=forks"`
  - [x] 8.5 Run touched-file TypeScript check and filter output for touched files:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1"`
  - [x] 8.6 Run targeted UTF-8 check:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run check:utf8 -- documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md documentation/tasks/PRD0052/prd0052-implementation-notes.md documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md src/pages/TeacherLobbyPage.jsx src/components/books/BookEditorModal.tsx src/components/books/BookEditorModal.css src/components/books/BookEditorWorkspace.tsx src/components/books/BookEditorWorkspace.css src/components/books/BookNodeTree.tsx src/routes/TeacherMaterialBookRedirect.tsx src/routes/teacherRoutes.tsx src/config/routeSecurity.ts src/config/featureRegistry.ts"`
  - [x] 8.7 Run whitespace check:
    - `git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" diff --check -- documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md src/pages/TeacherLobbyPage.jsx src/components/books src/routes src/config`

- [ ] 9.0 Browser verification
  - [x] 9.1 Start the branch-local dev server.
  - [x] 9.2 Use dev quick-login on the login page: open bottom-right settings icon, click `Teacher`.
  - [x] 9.3 Navigate to `/lobby`.
  - [x] 9.4 Open the `Book` tab.
  - [x] 9.5 Click a Book card `Open Book`.
  - [x] 9.6 Verify URL remains `/lobby` and a Book editor modal opens.
  - [x] 9.7 Verify only one `TeacherHeader` exists.
  - [x] 9.8 Verify modal visual match to edit-test modal: wide glass frame, pinned header, tab rail, scrollable body, left `380px` contents panel, right inspector/editor panel, Save/Close actions.
  - [x] 9.9 Verify close returns to Book tab with same scope/search/Test Type filter.
  - [x] 9.10 Verify dirty close shows in-modal confirmation.
  - [ ] 9.11 Verify node/ref save refreshes the Book card after modal close.
  - [ ] 9.12 Verify selected material ref assignment opens `HomeworkCreateModal` above the Book editor modal and returns focus to the Book editor after close.
  - [x] 9.13 Capture screenshots at `375`, `768`, `848`, `1366`, and `1586` widths.
  - [x] 9.14 At every width, verify:
    - `document.documentElement.scrollWidth <= document.documentElement.clientWidth`
    - modal frame is inside viewport
    - no button text overflows
    - tab rail does not overlap save/close actions
    - body scroll stays inside modal

- [ ] 10.0 Final documentation and cleanup
  - [x] 10.1 Update `documentation/tasks/PRD0052/prd0052-implementation-notes.md` with tests run, browser screenshots, route compatibility decision, and any remaining caveats.
  - [x] 10.2 Update `documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md` with modal test and browser evidence IDs.
  - [x] 10.3 Run final grep:
    - `rg -n "navigateTo\\('TEACHER_MATERIAL_BOOK'|BookEditorPage|/teacher/materials/books/:bookId" src documentation/tasks/PRD0052`
  - [x] 10.4 Confirm remaining `/teacher/materials/books/:bookId` hits are compatibility-route-only and documented.
  - [x] 10.5 Confirm no new `@mantine/*` imports:
    - `rg -n "@mantine/" src/components/books src/pages/TeacherLobbyPage.jsx src/routes`
  - [ ] 10.6 Follow `documentation/tasks/process-task-list.md`: mark subtasks complete only after matching tests/evidence pass, then commit with conventional commit message.

- [x] 11.0 Redesign Book editor modal to match Teacher Lobby edit-test modal
  - [x] 11.1 Capture current side-by-side visual evidence before code changes:
    - Read `Teacher Authoring Modal Philosophy` above and treat it as the redesign source of truth.
    - Pause code changes if the implementation plan would only copy colors/dimensions without adopting the shared shell structure.
    - Book editor modal at `/lobby`, Book tab, `Open Book`.
    - IELTS edit-test modal opened from a Teacher Lobby IELTS material.
    - THCS edit-test modal opened from a Teacher Lobby THCS material.
    - Required screenshot widths: `848`, `1366`, and `1586`.
    - Save screenshots under `output/playwright/` with names that include `book-modal-before`, `ielts-edit-modal-reference`, and `thcs-edit-modal-reference`.
  - [x] 11.2 In `documentation/tasks/PRD0052/prd0052-implementation-notes.md`, add a dated finding that current Book modal satisfies modal routing but does not yet satisfy edit-test modal design reuse or the Teacher authoring modal philosophy. Record these concrete gaps:
    - Book modal has a modal header plus an inner Book hero.
    - Book modal keeps real tabs inside `BookEditorWorkspace` instead of the modal frame tab rail.
    - `book-editor-modal__tabs` is decorative instead of the active tab control.
    - Book modal has a bottom status strip not present in the edit-test modal frame.
    - Book body still reads as a page transplanted into a modal because page hero/status/action patterns remain.
  - [x] 11.3 Refactor `BookEditorModal` so its structure mirrors `EditTestFrame`:
    - Single pinned header.
    - Inline title/status area.
    - Save action.
    - Request review action when valid.
    - Icon close button.
    - Real frame-level tab rail.
    - Scrollable body.
    - No bottom status strip.
  - [x] 11.4 Move Book tabs from `BookEditorWorkspace` into `BookEditorModal`:
    - `Overview`
    - `Contents`
    - `Assign`
    - `Settings`
    - Active tab state must remain controlled by Book editor state so keyboard, save behavior, and tests remain deterministic.
  - [x] 11.5 Remove the modal presentation inner hero from `BookEditorWorkspace`:
    - No duplicated Book title.
    - No duplicated status chips.
    - No duplicated `Save`, `Request review`, or `Preview` command bar inside modal body.
    - Keep the page-compat presentation title area only when `presentation === 'page-compat'`.
  - [x] 11.6 Restyle `BookEditorModal.css` to match `src/components/test/editor/EditTestFrame.tsx:199-388` without importing Mantine:
    - `width: min(75vw, 1200px)`
    - `height: min(85vh, 900px)`
    - glass card background matching edit-test teal/violet tone.
    - thin translucent teal/violet border.
    - restrained edit-test shadow scale.
    - header padding and density matching the edit-test header.
    - tab rail padding, spacing, active underline, and active color matching the edit-test tab rail.
  - [x] 11.7 Restyle `BookEditorWorkspace.css` modal body to match `src/components/test/editor/layouts/BaseEditorLayout.tsx:88-148`:
    - Contents tab uses left panel `width: 380px`, `flex-shrink: 0`.
    - Right inspector/editor panel fills remaining width.
    - Panels use glass/white card treatment matching edit-test body cards.
    - Body scroll stays inside modal.
    - Phone and tablet widths stack panels without horizontal overflow.
  - [x] 11.8 Convert the whole-Book unavailable warning into an inline body notice:
    - It must appear near assign-related work.
    - It must not render as a persistent footer.
    - It must not duplicate the same warning in modal header and body simultaneously.
  - [x] 11.9 Update `src/components/books/BookEditorModal.test.tsx`:
    - Assert real tab buttons are inside the modal frame.
    - Assert no `book-editor-modal__status` footer renders.
    - Assert only one modal-level heading/title area renders for modal presentation.
    - Assert Save and Request review are not duplicated in the modal body.
  - [x] 11.10 Update `src/components/books/BookEditorWorkspace.test.tsx`:
    - Assert `presentation="modal"` omits the page hero.
    - Assert `presentation="page-compat"` keeps the page-compat title area.
    - Assert external active-tab control still renders `Overview`, `Contents`, `Assign`, and `Settings` content correctly.
  - [x] 11.11 Update `src/pages/TeacherLobbyPage.test.jsx`:
    - Assert Teacher Lobby Book modal opens with the edit-test frame class structure.
    - Assert Book tab click inside the modal does not change the Teacher Lobby material tab.
    - Assert closing the modal preserves Teacher Lobby Book tab state.
  - [x] 11.12 Run targeted redesign tests:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks"`
  - [x] 11.13 Run targeted UTF-8 check:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run check:utf8 -- documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md documentation/tasks/PRD0052/prd0052-implementation-notes.md src/components/books/BookEditorModal.tsx src/components/books/BookEditorModal.css src/components/books/BookEditorWorkspace.tsx src/components/books/BookEditorWorkspace.css src/pages/TeacherLobbyPage.jsx"`
  - [x] 11.14 Run whitespace check:
    - `git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" diff --check -- documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md documentation/tasks/PRD0052/prd0052-implementation-notes.md src/components/books/BookEditorModal.tsx src/components/books/BookEditorModal.css src/components/books/BookEditorWorkspace.tsx src/components/books/BookEditorWorkspace.css src/pages/TeacherLobbyPage.jsx`
  - [x] 11.15 Re-run browser visual QA after redesign:
    - Use dev quick-login `Teacher`.
    - Open `/lobby`, Book tab, `Open Book`.
    - Verify URL remains `/lobby`.
    - Verify only one `TeacherHeader` exists.
    - Capture Book modal screenshots at `375`, `768`, `848`, `1366`, and `1586`.
    - Verify side-by-side parity against IELTS/THCS edit-test modal at `848`, `1366`, and `1586`.
    - Verify `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
    - Verify modal frame stays inside viewport.
    - Verify modal body scroll stays inside the frame.
    - Verify no button text or tab text overlaps.

- [x] 12.0 Redesign Book modal tab bodies around approved three-tab UX model
  - [x] 12.1 Re-read the approved `Book modal body mapping` and `Approved 2026-06-05 Book modal tab ownership correction` sections before code.
  - [x] 12.2 Capture current Book modal body screenshots before code at `848`, `1366`, and `1586`:
    - `Overview`
    - `Contents`
    - `Assign`
    - `Settings`
    - Save under `output/playwright/` with names that include `book-modal-body-before`.
  - [x] 12.3 Record a dated UX finding in `documentation/tasks/PRD0052/prd0052-implementation-notes.md`:
    - Current tab IA spreads one content workflow across `Overview`, `Contents`, and `Assign`.
    - `Overview` is too thin and should own metadata, statistics, and readiness.
    - `Assign` should not remain a peer tab; assignment belongs to selected material work inside `Content`.
    - `Settings` should own access, public/private state, review state, and maintenance controls.
    - `Content` left pane should own the Book structure tree; right pane should own selected item details and actions.
  - [x] 12.4 Write failing tests in `src/components/books/BookEditorModal.test.tsx`:
    - Modal rail has exactly three tabs: `Overview`, `Content`, `Settings`.
    - No `Assign` peer tab exists.
    - Header still owns the only global `Save` and `Request review` actions.
    - `Content` tab click changes only Book modal tab state, not Teacher Lobby material tab state.
  - [x] 12.5 Write failing tests in `src/components/books/BookEditorWorkspace.test.tsx` for new tab ownership:
    - `Overview` renders editable metadata plus compact statistics/readiness.
    - `Overview` does not render Book structure tree controls.
    - `Content` renders the two-pane structure/detail editor.
    - `Content` owns assignment for selected material refs.
    - `Settings` renders access/review controls and does not render metadata form fields such as `Authors`, `Publisher`, or `ISBN`.
  - [x] 12.6 Refactor Book tab constants and save behavior in `BookEditorWorkspace.tsx` and `BookEditorModal.tsx`:
    - Replace `contents` tab id with `content` or present the label as `Content` consistently.
    - Remove `assign` from `BOOK_EDITOR_TABS`.
    - Route header `Save` to metadata save on `Overview`, structure save on `Content`, and access/settings save on `Settings`.
    - Keep page-compat route behavior working or document any legacy tab-label compatibility.
  - [x] 12.7 Redesign `Overview` body:
    - Move metadata fields here: title, subtitle, authors, description, Test Types, tags, cover/series summary as needed.
    - Add compact statistics: section count, material count, unavailable refs, newer-version refs, readiness/status, visibility summary.
    - Add readiness blockers as short rows or chips.
    - Remove duplicate content-building actions from `Overview`.
    - Keep text minimal; no instructional paragraph unless state is empty or blocked.
  - [x] 12.8 Redesign `Content` body as the primary two-pane editor:
    - Left pane near `380px` owns only Book structure tree, selection, compact add/remove/rename/reorder/move/nest controls, and compact material-ref/status badges.
    - Right pane owns selected section/chapter/test/material details.
    - When a Book part is selected, right pane lets teacher edit title/type/details and attach published materials.
    - When a material ref is selected, right pane shows title/type/path/availability/update state plus `Assign`, `Remove`, and move actions.
    - Empty right pane shows one concise next action.
    - Whole-Book assignment unavailable copy appears only near assignment action or empty assignment state.
  - [x] 12.9 Redesign `BookNodeTree.tsx` for clean structure-tree UX:
    - Remove always-visible long text action buttons from each tree row.
    - Use compact icon buttons or a compact action menu for row-level add, reorder, move, and delete actions.
    - Keep full accessible names through `aria-label`, not visible long button text.
    - Keep selected node/ref visually clear.
    - Keep max-depth and unsupported-node errors near the affected row or toolbar.
  - [x] 12.10 Redesign `BookMaterialPicker.tsx` as an attach flow inside the selected-item right panel:
    - Search remains visible.
    - Rows show title, kind, Test Type chips, and compact `Attach`.
    - Do not render one large picker under every tree node by default.
    - Empty state is short and actionable.
  - [x] 12.11 Redesign `Settings` body:
    - Move visibility/access controls here.
    - Show public review state and blockers here.
    - Keep request-review explanation short and adjacent to public review state.
    - Add maintenance/danger zone only for supported actions; keep destructive actions visually separated.
    - Do not duplicate header `Request review` unless header action is removed or disabled by state.
  - [x] 12.12 Update CSS in `BookEditorWorkspace.css`, `BookNodeTree.css`, and `BookMaterialPicker.css`:
    - Preserve edit-test modal body grammar.
    - Avoid nested card stacks.
    - Keep sections scan-friendly and quiet.
    - Prevent button text overflow at `375`, `768`, `848`, `1366`, and `1586`.
    - Stack two-pane `Content` layout on narrow screens with tree before details.
  - [x] 12.13 Update Teacher Lobby integration tests in `src/pages/TeacherLobbyPage.test.jsx`:
    - Opening Book modal shows three Book tabs only.
    - `Content` tab remains modal-local.
    - Closing modal preserves Teacher Lobby Book tab/scope/search/Test Type filter.
  - [x] 12.14 Run targeted redesign tests:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks"`
  - [x] 12.15 Run touched-file TypeScript check and filter output for touched files:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1"`
  - [x] 12.16 Run targeted UTF-8 check:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run check:utf8 -- documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md documentation/tasks/PRD0052/prd0052-implementation-notes.md documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md src/components/books/BookEditorModal.tsx src/components/books/BookEditorModal.css src/components/books/BookEditorWorkspace.tsx src/components/books/BookEditorWorkspace.css src/components/books/BookNodeTree.tsx src/components/books/BookNodeTree.css src/components/books/BookMaterialPicker.tsx src/components/books/BookMaterialPicker.css src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/books/BookEditorPage.test.tsx src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.test.jsx"`
  - [x] 12.17 Run whitespace check:
    - `git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" diff --check -- documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md documentation/tasks/PRD0052/prd0052-implementation-notes.md documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md src/components/books/BookEditorModal.tsx src/components/books/BookEditorModal.css src/components/books/BookEditorWorkspace.tsx src/components/books/BookEditorWorkspace.css src/components/books/BookNodeTree.tsx src/components/books/BookNodeTree.css src/components/books/BookMaterialPicker.tsx src/components/books/BookMaterialPicker.css src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/books/BookEditorPage.test.tsx src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.test.jsx`
  - [x] 12.18 Run browser QA after body redesign:
    - Use dev quick-login `Teacher`.
    - Open `/lobby`, Book tab, `Open Book`.
    - Capture screenshots at `375`, `768`, `848`, `1366`, and `1586` for `Overview`, `Content`, and `Settings`.
    - Verify no document/body horizontal overflow.
    - Verify modal frame stays inside viewport.
    - Verify `Content` left tree and right detail panel are readable and do not overlap.
    - Verify no visible long action text bloats tree rows.
    - Verify selected material assignment still opens `HomeworkCreateModal`.
    - Verify metadata save from `Overview`.
    - Verify structure save from `Content`.
    - Verify access/review save behavior from `Settings`.
  - [x] 12.19 Update `documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md` with three-tab body redesign evidence.
  - [x] 12.20 After all evidence passes, mark `12.0` subtasks complete following `documentation/tasks/process-task-list.md`.

- [x] 13.0 Implement approved Stitch redesign for `Content` left/right panels

  Implementation guide for this parent task:

  - This task is a UX rework of the existing `Content` tab only. Do not redesign `Overview`, `Settings`, the modal frame, Teacher Lobby cards, `TeacherHeader`, or route behavior unless a failing test proves the `Content` rework broke those contracts.
  - Treat `.stitch/designs/book-editor-content-tab-redesign.html` as the component anatomy reference. Translate Tailwind/Material Symbols into repo CSS and existing icon patterns; do not paste Tailwind classes or add new icon/font dependencies.
  - Preserve the existing three modal tabs: `Overview`, `Content`, `Settings`. Do not re-add a peer `Assign` tab.
  - Preserve frame-owned global commands. `Save` and `Request review` remain in `BookEditorModal`; the `Content` body must not render `Save Book Structure`, `Save item`, a second `Request review`, or a footer status strip.
  - Preserve current data behavior: node/ref changes still save through the existing structure-save path, candidate materials still load from indexed published summaries, assignment still targets only the selected material ref, and source materials are never mutated when refs are removed.
  - The left panel must be passive until selection or a compact icon/menu is used. The right panel is where teachers edit, move, attach, assign, or remove.
  - Use product copy from this tasklist, not raw Stitch copy, when there is conflict. Required divergence: use `Selected material`, not `Currently Active Draft Item`.

  Target `Content` layout:

  - `book-editor-page__workspace` remains the two-column modal body container for `Content`.
  - Left panel width stays near `380px` on desktop/tablet. It is the outline navigator, with `Book outline`, count summary, compact root toolbar, search, tree rows, and compact row menu/icon affordances.
  - Right panel is flexible width and scrolls internally when needed. It contains selected header, placement line, details form, structure actions, attach-material list, selected-material summary, and selected-material assignment/removal actions.
  - At widths `848`, `1366`, and `1586`, both panels must be visible, readable, and inside the modal viewport with no document/body horizontal overflow.

  Left panel required anatomy:

  - Header:
    - Heading text: `Book outline`.
    - Count text: compute from current nodes/refs, for example `4 parts - 3 materials`. If exact count plumbing is too risky, show a truthful available count such as `${nodes.length} parts` and document the deferred material count.
  - Root toolbar:
    - Visible root add buttons are exactly the compact primary set: `+ Section`, `+ Chapter`, `+ Test`.
    - Do not show `+ Intro`, `+ TOC`, or `+ Note` as primary toolbar buttons in the modal outline. If those node types remain supported, move them behind a compact `More`/menu affordance or defer with a note.
  - Search:
    - Placeholder: `Search outline`.
    - Search filters tree rows by node title and material-ref title. If implementing true filtering is too broad, render the control disabled only with an explicit implementation note; preferred implementation is working filter.
  - Node rows:
    - Row is a selection target with accessible name from title.
    - Show one leading icon/caret area, title, type chip, and short metadata like `2 materials - ready`, `0 materials - needs content`, `newer version`, or `unavailable`.
    - Selected node row uses a light indigo/tint background plus a 2px indigo left accent. The selected state must also be exposed with `aria-current`, `aria-selected`, or equivalent.
    - Long titles truncate visually and keep full text through `title` or accessible text.
  - Material-ref child rows:
    - Render as indented children under the owning node.
    - Show title, material kind chip, Test Type when available, and availability/update status.
    - Selecting a ref updates the right panel to the selected-material workspace.
  - Row actions:
    - Each row may expose only one compact row action affordance by default: kebab/menu icon or equivalent icon button.
    - The icon button must have a specific accessible name such as `Open actions for Section 1`.
    - Do not render visible row command dumps: `Up`, `Down`, `Select`, `Move to`, `Delete`, `+ Section`, `+ Chapter`, `+ Test`, or child add clusters on every row.
    - If full menu behavior is deferred, the icon may open a minimal menu or do nothing only if the right panel still exposes all necessary actions and tests assert the absence of visible command dumps.

  Right panel required anatomy:

  - Selected header:
    - Node selection heading: `Selected section`, `Selected chapter`, or `Selected test`.
    - Material-ref selection heading: `Selected material`.
    - Include a concise status chip such as `ready`, `needs content`, `available`, `newer version`, or `unavailable`.
  - Placement line:
    - Render near the top, before form controls.
    - Format should include path/parent, depth, and order, for example `Root / Section 1 - Depth 1 - Order 1`.
  - Details group:
    - Node selection shows editable `Title` input and `Type` select in a compact grid.
    - Do not duplicate title/type editing controls inside the left tree.
    - Material-ref selection shows a summary instead of node title/type editing: title, material kind, Test Type, availability, updated/version state, and owning node path.
  - Structure actions group:
    - Show selected-item actions in the right panel: `Move up`, `Move down`, `Move`, `Add child`, `Duplicate` if supported, and `Delete`.
    - Disable unsupported actions with clear accessible names or omit them if the underlying operation does not exist.
    - Destructive `Delete` uses rose/destructive styling and existing in-modal confirmation behavior.
  - Attach material group:
    - Heading: `Attach material`.
    - Search placeholder: `Search published materials`.
    - Candidate rows render only in the right panel, never inside the left tree.
    - Candidate row content: title, material kind, Test Type metadata, status if useful, updated date if already available, and right-aligned `Attach`.
    - Empty state is one short sentence; no large empty card.
  - Selected material group:
    - Heading: `Selected material`.
    - Summary row/card shows selected material title, kind, Test Type, availability/update status, and source node/path.
    - Actions: primary `Assign selected`, secondary `Remove`.
    - Whole-Book warning is one short line near these actions: `Whole-Book assignment is not available in V1.` Do not place this warning in the empty right panel or as a global footer.
    - `Assign selected` must open `HomeworkCreateModal` for the selected material ref and return focus to the Book editor after close.

  File ownership for this task:

  - `src/components/books/BookEditorWorkspace.tsx` owns right-panel composition, selected-node/ref derivation, placement/path display, selected material group, and attach group placement.
  - `src/components/books/BookEditorWorkspace.css` owns two-panel body geometry, right-panel grouping, separators, form grid, selected-material summary, and desktop/tablet no-overflow behavior.
  - `src/components/books/BookNodeTree.tsx` owns outline-only navigator rendering, root toolbar scope, search field, selected state attributes, compact row action affordance, and material-ref child rows.
  - `src/components/books/BookNodeTree.css` owns left-panel row density, hierarchy indentation, selected accent, truncation, hover/focus, status chips, and row action visibility.
  - `src/components/books/BookMaterialPicker.tsx` owns candidate search/list semantics and compact attach row markup.
  - `src/components/books/BookMaterialPicker.css` owns candidate list density, metadata row, right-aligned `Attach`, and compact empty state.
  - `src/pages/TeacherLobbyPage.jsx` should only change if candidate loading or modal props are currently blocking the right-panel attach flow.

  - [x] 13.1 Re-read the `Approved 2026-06-05 Stitch Content panel redesign` section and this whole `13.0` implementation guide before code.
  - [x] 13.2 Inspect approved Stitch artifacts and record implementation-relevant deltas in `prd0052-implementation-notes.md`:
    - `.stitch/designs/book-editor-content-tab-redesign.png`
    - `.stitch/designs/book-editor-content-tab-redesign.html`
    - Capture exact screen id `1dc6bbc4059a4cbdb9463da82c3c9e6a` and verified screenshot size `2560x2048`.
    - Record exact mockup anatomy used: `Book outline`, `Search outline`, selected row with indigo accent, right-panel `Selected section`, placement line, `Attach material`, and `Selected material`.
    - Record intentional divergences before implementation, not after. Required divergence: use `Selected material`, not `Currently Active Draft Item`.
  - [x] 13.3 Write failing tests in `src/components/books/BookEditorWorkspace.test.tsx` for the right-panel selected workspace:
    - Node-selected state renders a right-panel region labelled `Selected section`, `Selected chapter`, or `Selected test` and includes a status chip.
    - Material-ref-selected state renders a right-panel region labelled `Selected material`.
    - Placement line renders path/parent, depth, and order in the right panel.
    - Node title input and Type select are discoverable inside the right-panel details group.
    - Node title input and Type select are not rendered inside the left outline tree.
    - `Move up`, `Move down`, and `Delete` selected-item actions render in the right-panel structure actions group.
    - Row-level command text is not used as the only way to move/delete selected content.
    - `Attach material` search and candidate rows render in the right panel.
    - Attaching a candidate updates the selected-material summary or creates/selects the new ref according to current editor behavior.
    - `Assign selected` and `Remove` render in the selected-material group when a material ref is selected.
    - `Assign selected` opens `HomeworkCreateModal` with the selected material, not the whole Book.
    - Whole-Book assignment warning copy appears near selected-material actions and is absent from the empty right panel.
    - Body-level duplicate commands are absent: no `Save Book Structure`, no body `Save item`, no footer status strip.
  - [x] 13.4 Write failing tests in `src/components/books/BookNodeTree.test.tsx` for the left-panel outline navigator:
    - Heading `Book outline` renders with a count summary.
    - Root toolbar exposes compact `+ Section`, `+ Chapter`, and `+ Test`.
    - Old broad primary root controls `+ Intro`, `+ TOC`, and `+ Note` are not visible as primary toolbar buttons in modal outline mode.
    - Outline search field renders with placeholder `Search outline` and filters visible node/ref rows.
    - Selected node row exposes selected state through DOM/accessibility (`aria-current`, `aria-selected`, selected class, or equivalent) and shows type/status metadata.
    - Material refs render as indented child rows under their owning node with kind/status metadata.
    - Visible row command dump is absent from every tree row: no always-visible `Up`, `Down`, `Select`, `Move to`, `Delete`, or child add clusters.
    - Each node/ref row has at most one compact menu/icon action visible by default, with accessible name like `Open actions for <title>`.
    - Full row action names may exist in `aria-label`; tests must assert visible text absence, not break accessibility labels.
  - [x] 13.5 Write or update `src/components/books/BookMaterialPicker.test.tsx` so the attach list matches the right-panel mockup:
    - Search placeholder is `Search published materials`.
    - Candidate rows show title, material kind, Test Type metadata, and compact right-aligned `Attach`.
    - Candidate row metadata does not wrap into the action column at desktop/tablet widths.
    - Empty state remains short and does not expand into a large card.
    - The component does not render its own duplicate `Attach material` heading when the parent section already provides that heading.
  - [x] 13.6 Refactor `BookNodeTree.tsx` into outline-navigator mode for modal `Content`:
    - Keep hierarchy, selected state, root add behavior for Section/Chapter/Test, row selection, and material-ref selection.
    - Add local outline search state in `BookNodeTree` unless a parent-owned search prop already exists; keep it scoped to visible outline rows only.
    - Compute and show a truthful count summary from available data.
    - Move detailed edit/reorder/delete/move controls out of always-visible tree rows.
    - Keep existing node/ref operations available from right panel handlers or compact menu path; do not remove behavior from the editor.
    - Provide one compact row menu/icon action per row. If menu behavior is deferred, document exactly which row-menu actions remain deferred and prove right-panel alternatives exist.
    - Preserve accessible names for all icon/menu controls.
    - Remove or hide the old instruction paragraph `Use explicit controls for V1...` from the modal outline panel.
  - [x] 13.7 Refactor `BookEditorWorkspace.tsx` selected-item inspector into the approved right-panel workspace:
    - Build right-panel groups in this order: selected header, placement line, details, structure actions, attach material, selected material.
    - For node selection, show title/type/details and attach material candidates.
    - For material-ref selection, show material title/kind/Test Type/availability/update state plus owning node path.
    - Put `Assign selected`, `Remove`, and material-ref move controls in the selected-material group.
    - Put node move/delete/add-child controls in the structure-actions group.
    - Keep header `Save` behavior unchanged: `Overview` metadata, `Content` structure, `Settings` metadata/access.
    - Keep indexed candidate loading enabled from Teacher Lobby; do not pass `materialCandidates={[]}` from `TeacherLobbyPage`.
    - Keep public projection/read-only behavior intact; read-only states must disable edit/attach/assign controls without breaking layout.
    - Keep stale conflict, permission, and validation errors near the affected right-panel group.
  - [x] 13.8 Refactor `BookMaterialPicker.tsx` to match the approved attach section:
    - Use compact row layout, title-first hierarchy, metadata chips, and right-aligned `Attach`.
    - Keep search always available in the right panel attach group.
    - Filter by title/kind/Test Type from the search input.
    - Do not include picker heading/copy that duplicates the right-panel `Attach material` section heading.
    - Exclude drafts exactly as before; do not broaden candidate source reads.
  - [x] 13.9 Update `BookEditorWorkspace.css`, `BookNodeTree.css`, and `BookMaterialPicker.css` from the mockup:
    - Two panels: left near `380px`, right flexible.
    - Left panel uses quiet slate/white surface, thin separators, selected indigo background, 2px indigo left accent.
    - Rows are compact and vertically scannable; long titles truncate with full title available via `title`/accessible text.
    - Right panel uses compact groups with separators instead of nested card stacks.
    - Form rows use compact grid where there is room; controls stack only when needed to prevent overflow.
    - Buttons and inputs use 6-8px radius, thin borders, teal primary action, rose destructive outline, and slate secondary actions.
    - Icon-only controls are square, stable-size, and do not shift row height on hover/focus.
    - Desktop/tablet widths under test must have no horizontal overflow.
    - Do not copy Stitch's blurred background environment or page-level backdrop; only the modal Content anatomy is in scope.
  - [x] 13.10 Update `src/pages/TeacherLobbyPage.test.jsx` only if implementation changes modal integration:
    - Opening Book modal still shows exactly `Overview`, `Content`, `Settings`.
    - `Content` still remains modal-local and does not switch Teacher Lobby material tab state.
    - Indexed material candidates still load into the modal attach flow.
    - `Open Book` still does not navigate to `TEACHER_MATERIAL_BOOK` during normal Teacher Lobby use.
  - [x] 13.11 Run targeted redesign tests:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/books/BookEditorModal.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks"`
  - [x] 13.12 Run compatibility page test:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/BookEditorPage.test.tsx --reporter=basic --pool=forks"`
  - [x] 13.13 Run touched-file TypeScript filter:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1"`
    - Filter for touched files: `BookEditorWorkspace|BookNodeTree|BookMaterialPicker|BookEditorModal|BookEditorPage|TeacherLobbyPage`.
    - Full `tsc` may still fail from existing repo-wide debt; touched-file matches must be zero before marking complete.
  - [x] 13.14 Run targeted UTF-8 check:
    - `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run check:utf8 -- documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md documentation/tasks/PRD0052/prd0052-implementation-notes.md documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md src/components/books/BookEditorWorkspace.tsx src/components/books/BookEditorWorkspace.css src/components/books/BookNodeTree.tsx src/components/books/BookNodeTree.css src/components/books/BookMaterialPicker.tsx src/components/books/BookMaterialPicker.css src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/books/BookEditorPage.test.tsx src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.test.jsx"`
  - [x] 13.15 Run whitespace check:
    - `git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" diff --check -- documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md documentation/tasks/PRD0052/prd0052-implementation-notes.md documentation/tasks/PRD0052/prd0052-implementation-coverage-matrix.md src/components/books/BookEditorWorkspace.tsx src/components/books/BookEditorWorkspace.css src/components/books/BookNodeTree.tsx src/components/books/BookNodeTree.css src/components/books/BookMaterialPicker.tsx src/components/books/BookMaterialPicker.css src/components/books/BookEditorWorkspace.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx src/components/books/BookEditorPage.test.tsx src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.test.jsx`
  - [x] 13.16 Run browser QA after implementation, desktop/tablet only:
    - Use dev quick-login `Teacher`.
    - Open `http://localhost:5174/lobby`, Book tab, `Open Book`, `Content`.
    - Capture screenshots at `848`, `1366`, and `1586`.
    - Verify against `.stitch/designs/book-editor-content-tab-redesign.png` and `.stitch/designs/book-editor-content-tab-redesign.html`, not a vague visual similarity claim.
    - Verify left panel is navigator-only: header/count, compact root toolbar, search, selected row, child material refs, row menu/icon, no visible command dump.
    - Verify right panel owns selected editing: selected header, placement, title/type, structure actions, attach list, selected material assignment/removal.
    - Verify no peer `Assign` tab, no body `Save Book Structure`, no footer status strip, no modal hero.
    - Verify no document/body horizontal overflow and modal frame stays inside viewport.
    - Verify attaching a published candidate exposes `Assign selected`, and `Assign selected` opens `HomeworkCreateModal`.
  - [x] 13.17 Update `prd0052-implementation-notes.md` with implementation evidence:
    - Tests run.
    - Browser screenshots.
    - Stitch-reference conformance notes.
    - Any intentional divergences from the approved mockup.
  - [x] 13.18 Update `prd0052-implementation-coverage-matrix.md` with approved-Stitch Content panel implementation evidence.
  - [x] 13.19 Mark `13.0` complete only after all tests, TypeScript touched-file filter, UTF-8, whitespace, and browser QA pass.
