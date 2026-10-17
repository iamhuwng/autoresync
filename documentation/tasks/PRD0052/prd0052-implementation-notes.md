# PRD-0052 Implementation Notes

Created: 2026-06-01
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

## Read Gates

- Read source PRD: `documentation/tasks/0052-prd-teacher-materials-books-and-reading-passage-library.md`.
- Read visual plan: `documentation/tasks/0052-visual-similarity-extraction-and-rebuild-plan.md`.
- Read root design file: `DESIGN.md`.
- Read UI standards and Teacher Lobby architecture docs.
- Read infrastructure, observability, React patterns, codebase hygiene, mobile portability, and navigation rules before touching matching surfaces.
- Loaded local observability-tracking skill.

## Visual Locks

- Preserve PRD-0050/live Teacher Lobby shell, page density, tabs, toolbar, list rows, badge styling, and action rail.
- Keep `TeacherHeader` as a top-level shell child attached to the top page edge.
- Put page padding, max width, and content spacing inside `main` or content wrapper only.
- Keep normal material browsing list-first/list-only for PRD-0052; no normal material grid/list toggle.
- Put four Test Type logo/card blocks under the toolbar, centered in one row at supported teacher widths.
- Do not show helper filter pill text; selected-card styling is the active Test Type state.
- Test Type block body filters; settings icon opens preference modal and stops propagation.
- `Reading Passage` tab renders list rows only and has no primary create CTA in V1.
- `Book` tab renders Book cover/default-name cards only; no `Start Test` or whole-Book `Assign Homework`.
- No new `@mantine/*` imports.
- No broad canonical content hydration for list rows.

## 2026-06-05 Book Editor Modal Addendum

- **Current source of truth:** `documentation/architecture/book-editor-authoring-modal-architecture.md`.
- The previous route-backed Book editor contract is superseded for the normal Teacher Materials flow. Normal Book-card `Open Book` must stay on `/lobby`, switch/keep the `Book` tab, and open `BookEditorModal` inside Teacher Lobby.
- `/teacher/materials/books/:bookId` remains compatibility-only and should redirect into `/lobby` with route state that opens the Book editor modal once.
- Hard constraints: no `TeacherHeader` inside the Book editor modal; no normal `navigateTo('TEACHER_MATERIAL_BOOK', ...)`; no new `@mantine/*` imports; no whole-Book homework/start action.
- Modal implementation target: native/custom `BookEditorModal` frame plus reusable `BookEditorWorkspace` body. `BookEditorWorkspace` receives `bookId` as a prop and must not depend on `useParams()`.

### 2026-06-05 Teacher Authoring Modal Philosophy Hold (historical, resolved)

- **Obsolete status:** the pause ended after the three-tab modal shell and Content redesign were implemented. Keep this section as decision history only.
- The source of truth is `documentation/tasks/PRD0052/tasks-0052-book-editor-modal-in-teacher-materials.md` section `Teacher Authoring Modal Philosophy`.
- The edit-test modal shell defines the teacher authoring structure: one modal frame owns chrome, one pinned header owns identity/actions, one real tab rail owns mode switching, and the body is only the active work area.
- Book-specific editing must live inside that structure. `Overview`, `Contents`, `Assign`, and `Settings` are allowed Book modes, but they must use the same header/tab/body grammar as IELTS and THCS edit modals.
- The body must not preserve page-era chrome: no nested Book hero, no route breadcrumb/title area, no duplicated status chips, no duplicated `Save` or `Request review` command group, and no decorative tab rail plus real inner tabs.
- The desktop editing mental model is left selection/source structure and right editor/inspector detail, with the canonical left panel near `380px`. Narrow screens may stack while preserving that information architecture.
- Status and warnings must sit near the work they affect. Whole-Book assignment unavailable belongs near assign-related content, not as a persistent modal footer.
- Design acceptance requires side-by-side parity checks against IELTS and THCS edit-test modals at `848`, `1366`, and `1586` widths, plus Book modal checks at `375`, `768`, `848`, `1366`, and `1586`.
- If a patch only preserves `75vw`, `1200px`, `85vh`, glass background, or shadow while keeping page-style body structure, it has not satisfied the source of truth.
- Current edit-test shell specifics to copy in native CSS: `width: 75vw`, `max-width: 1200px`, `height: 85vh`, flex column frame, hidden frame overflow, flex-pinned header/tab rail, body-only scroll, header `padding: 1rem 1.5rem`, tab rail `padding: 0.5rem 1.5rem`, tab `gap: 2rem`, active violet underline `#8b5cf6`, and inactive slate text `#64748b`.
- Current edit-test two-pane specifics to copy for Book `Contents`: wrapper `display: flex`, `gap: 1.5rem`, `height: 100%`, `padding: 1rem`; left pane `width: 380px`, `height: 100%`, `flex-shrink: 0`; right pane `flex: 1`, `height: 100%`, `overflow: hidden`.
- Book tab compliance: `Overview` may be full-width compact summary; `Contents` must be two-pane; `Assign` may be full-width until selected-assignment details exist; `Settings` may be form-first but shell header owns the primary save action.
- Allowed compromises: native/no-Mantine clone of the shell, Book-specific labels, full-width tabs when no left selection surface exists, stacked panes on narrow screens, and body-local warning copy near affected workflow.
- Not allowed compromises: old Book hero, route breadcrumb/title area, workspace-owned real tabs, duplicate command groups, persistent footer/status strip, hidden overflow as a layout fix, or changing `TeacherHeader`/Teacher Lobby chrome to make the modal fit.

### 2026-06-05 Book Modal Design Parity Finding (historical, resolved)

- **Obsolete status:** these were pre-redesign findings. The current modal satisfies the shared teacher authoring shell contract described in `documentation/architecture/book-editor-authoring-modal-architecture.md`.
- Before screenshots captured:
  - `output/playwright/prd0052-book-modal-before-848.png`
  - `output/playwright/prd0052-book-modal-before-1366.png`
  - `output/playwright/prd0052-book-modal-before-1586.png`
- Reference screenshots captured:
  - `output/playwright/prd0052-ielts-edit-modal-reference-848.png`
  - `output/playwright/prd0052-ielts-edit-modal-reference-1366.png`
  - `output/playwright/prd0052-ielts-edit-modal-reference-1586.png`
  - `output/playwright/prd0052-thcs-edit-modal-reference-848.png`
  - `output/playwright/prd0052-thcs-edit-modal-reference-1366.png`
  - `output/playwright/prd0052-thcs-edit-modal-reference-1586.png`
- Concrete gaps to close:
  - Book modal has a modal header plus an inner Book hero.
  - Book modal keeps real tabs inside `BookEditorWorkspace` instead of the modal frame tab rail.
  - `book-editor-modal__tabs` is decorative instead of the active tab control.
  - Book modal has a bottom status strip not present in the edit-test modal frame.
  - Book body still reads as a page transplanted into a modal because page hero/status/action patterns remain.

### 2026-06-05 Book Modal Body IA Finding (historical, resolved)

- **Obsolete status:** this describes the rejected four-tab body. Current tabs are exactly `Overview`, `Content`, and `Settings`.
- `Overview` is too thin and should own metadata, statistics, and readiness.
- `Assign` should not remain a peer tab; assignment belongs to selected material work inside `Content`.
- `Settings` should own access, public/private state, review state, and maintenance controls.
- `Content` left pane should own the Book structure tree; right pane should own selected item details and actions.
- Before body screenshots captured at:
  - `output/playwright/prd0052-book-modal-body-before/before-848-overview.png`
  - `output/playwright/prd0052-book-modal-body-before/before-848-contents.png`
  - `output/playwright/prd0052-book-modal-body-before/before-848-assign.png`
  - `output/playwright/prd0052-book-modal-body-before/before-848-settings.png`
  - `output/playwright/prd0052-book-modal-body-before/before-1366-overview.png`
  - `output/playwright/prd0052-book-modal-body-before/before-1366-contents.png`
  - `output/playwright/prd0052-book-modal-body-before/before-1366-assign.png`
  - `output/playwright/prd0052-book-modal-body-before/before-1366-settings.png`
  - `output/playwright/prd0052-book-modal-body-before/before-1586-overview.png`
  - `output/playwright/prd0052-book-modal-body-before/before-1586-contents.png`
  - `output/playwright/prd0052-book-modal-body-before/before-1586-assign.png`
  - `output/playwright/prd0052-book-modal-body-before/before-1586-settings.png`

### 2026-06-05 Book Modal Three-Tab Body Redesign Evidence

- Book modal tab rail is now exactly `Overview`, `Content`, and `Settings`; peer `Assign` is removed.
- `Overview` owns metadata fields plus readiness/statistics. It no longer owns structure editing.
- `Content` owns the two-pane structure/detail editor. The left pane is the Book structure tree; the right pane owns selected node/material detail, attach, remove, and selected-material assignment.
- `Settings` owns visibility/access, public review state, and maintenance copy; metadata fields are not rendered there.
- `TeacherLobbyPage` no longer passes an empty material-candidate array into `BookEditorModal`, so the modal can load indexed owner/public published materials. Regression coverage attaches an indexed candidate from the Book modal and exposes `Assign selected`.
- Browser QA after redesign used `http://localhost:5174/lobby`, Book tab, `Testing Book`, and captured:
  - `output/playwright/prd0052-book-modal-body-after/after-375-overview.png`
  - `output/playwright/prd0052-book-modal-body-after/after-375-content.png`
  - `output/playwright/prd0052-book-modal-body-after/after-375-settings.png`
  - `output/playwright/prd0052-book-modal-body-after/after-768-overview.png`
  - `output/playwright/prd0052-book-modal-body-after/after-768-content.png`
  - `output/playwright/prd0052-book-modal-body-after/after-768-settings.png`
  - `output/playwright/prd0052-book-modal-body-after/after-848-overview.png`
  - `output/playwright/prd0052-book-modal-body-after/after-848-content.png`
  - `output/playwright/prd0052-book-modal-body-after/after-848-settings.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1366-overview.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1366-content.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1366-settings.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1586-overview.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1586-content.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1586-settings.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1366-content-selected-section.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1366-content-selected-material.png`
  - `output/playwright/prd0052-book-modal-body-after/after-1366-content-assign-selected-homework.png`
- Browser metrics passed at `375`, `768`, `848`, `1366`, and `1586`: no document/body horizontal overflow, modal frame inside viewport, `Content` tree/detail readable with side-by-side or stacked layout, no `Assign` tab, and no body-level `Save Book Structure` duplicate.
- Header save behavior was browser-verified: `Overview` save showed `Metadata saved.`, `Content` save showed `Book structure saved.`, and `Settings` save showed `Metadata saved.`. `Assign selected` opened `Create Homework Assignment`.

### 2026-06-05 Approved Stitch Content Panel Redesign

- The previous three-tab body redesign is not accepted as final UX for the `Content` tab. The approved direction is the Stitch mockup `Book Editor - Content Tab Redesign`.
- Canonical Stitch references:
  - Project: `projects/10653178060668333917` (`PRD0052 Book Editor Tabs Mockup`).
  - Screen: `projects/10653178060668333917/screens/1dc6bbc4059a4cbdb9463da82c3c9e6a`.
  - Screenshot: `.stitch/designs/book-editor-content-tab-redesign.png`, verified `2560x2048`.
  - HTML: `.stitch/designs/book-editor-content-tab-redesign.html`, downloaded from `get_screen.htmlCode.downloadUrl`.
- Design decision:
  - Left panel becomes a quiet outline navigator: `Book outline`, count summary, compact `+ Section` / `+ Chapter` / `+ Test`, `Search outline`, selected row, indented material-ref child rows, and one compact row menu/icon.
  - Right panel becomes the selected-item workspace: selected header, placement line, details inputs, structure actions, attach-material search/list, selected-material summary, and selected-material homework/removal actions.
  - Always-visible tree-row command clusters are explicitly rejected for this slice.
  - `BookMaterialPicker` belongs only in the right panel attach group.
  - Whole-Book assignment warning belongs near `Assign selected`, not as a large generic empty-panel warning.
- Approved implementation divergence:
  - The Stitch mockup labels one group `Currently Active Draft Item`. Product implementation should use `Selected material` because the referenced item may be published material, not a draft.
- Verification target:
  - Browser QA should compare actual `Content` tab screenshots at `848`, `1366`, and `1586` against the Stitch screenshot and HTML anatomy. Do not record the result as "similar"; record concrete matches and intentional deviations.

### 2026-06-05 Approved Stitch Content Panel Implementation Evidence

- Implemented the approved Stitch `Content` anatomy in `BookEditorWorkspace`, `BookNodeTree`, and `BookMaterialPicker`.
- Left panel now acts as a quiet outline navigator: `Book outline`, count summary, compact `+ Section` / `+ Chapter` / `+ Test`, `Search outline`, selected row with indigo left accent/background, indented material refs, and one compact row action button with accessible name `Open actions for <title>`.
- Removed always-visible tree command dump from the left panel: no visible row-level `Up`, `Down`, `Select`, `Move to`, or `Delete` controls.
- Right panel now owns selected-item work: `Selected section` / `Selected chapter` / `Selected test` / `Selected material`, placement line, node title/type details, structure actions, attach-material search/list, selected material summary, `Assign selected`, and `Remove`.
- `BookMaterialPicker` now uses right-panel attach copy and compact rows: placeholder `Search published materials`, title/kind/Test Type metadata, and right-aligned `Attach` buttons.
- Intentional divergence from Stitch: product copy uses `Selected material` instead of `Currently Active Draft Item`; whole-Book assignment warning remains short and appears only near selected-material assignment actions.
- Browser QA used `http://localhost:5174/lobby`, Book tab, `Open Book`, `Content`, with dev teacher session already active. Screenshots captured:
  - `output/playwright/prd0052-content-redesign-848.png`
  - `output/playwright/prd0052-content-redesign-1366.png`
  - `output/playwright/prd0052-content-redesign-1586.png`
- Browser QA matched the approved Stitch anatomy: left outline remained navigator-only, right panel owned edit/attach/action workspace, no peer `Assign` tab appeared, no body `Save Book Structure` or footer status strip appeared, modal stayed in viewport, and no document/body horizontal overflow was observed at `848`, `1366`, or `1586`.
- Browser interaction proof: attaching a published candidate exposed `Assign selected`; clicking `Assign selected` opened the homework assignment modal. Browser console error check returned zero errors.

### 2026-06-06 Content Interaction And Modal Polish Closure

- The three-dot node/ref trigger is now a functional actions menu. It is portaled to `document.body`, fixed-positioned over card/panel boundaries, and no longer resizes or clips inside the tree row.
- Menus close after an action, outside pointer interaction, or `Escape`; they do not remain visible behind the modal discard prompt.
- Node menus expose select, sibling move, child creation, and delete. Material-ref menus expose select and remove.
- Right-panel structure and selected-material command rows now use compact `36px` SVG icon buttons with accessible names/tooltips instead of full visible text.
- Modal shell colors were aligned with the common teacher authoring modal: neutral border/shadow plus violet/indigo primary accents. Legacy teal/green Book-modal chrome was removed.
- Typography hierarchy was normalized: body labels/chips/statuses use regular/medium weight; stronger weight remains for actual headings and selected-item identity.
- Canonical current contract is `documentation/architecture/book-editor-authoring-modal-architecture.md`. Earlier “paused”, four-tab, no-menu, and current-gap statements are historical/obsolete.
- Final targeted verification: 6 files / 62 tests passed; touched Book editor files had no TypeScript diagnostics; whitespace and UTF-8 checks passed.

Pre-change route/open grep from `rg -n "TEACHER_MATERIAL_BOOK|/teacher/materials/books|BookEditorPage|openBook" src`:

```text
src\constants\routes.ts:70:  TEACHER_MATERIAL_BOOK: '/teacher/materials/books/:bookId',
src\constants\routes.test.ts:22:      expect(ROUTES.TEACHER_MATERIAL_BOOK).toBe('/teacher/materials/books/:bookId');
src\constants\routes.test.ts:110:        const path = buildRoute('TEACHER_MATERIAL_BOOK', { bookId: 'book-123' });
src\constants\routes.test.ts:111:        expect(path).toBe('/teacher/materials/books/book-123');
src\constants\routes.test.ts:167:          'TEACHER_MATERIAL_BOOK',
src\config\routeSecurity.ts:172:    '/teacher/materials/books/:bookId': {
src\config\routeSecurity.ts:173:        path: '/teacher/materials/books/:bookId',
src\config\featureRegistry.ts:118:      'openBook',
src\config\featureRegistry.ts:166:      '/teacher/materials/books/:bookId',
src\config\featureRegistry.ts:202:      'openBook',
src\config\featureRegistry.test.ts:27:      expect(resolveFeatureFromRoute('/teacher/materials/books/book-123')).toBe('readingV2Studio');
src\config\featureRegistry.test.ts:95:          'openBook',
src\config\featureRegistry.test.ts:121:          'openBook',
src\components\books\BookEditorPage.tsx:32:import './BookEditorPage.css';
src\components\books\BookEditorPage.tsx:34:interface BookEditorPageProps {
src\components\books\BookEditorPage.tsx:257:const BookEditorPage = ({
src\components\books\BookEditorPage.tsx:262:}: BookEditorPageProps) => {
src\components\books\BookEditorPage.tsx:287:    trackAction('openBook', {
src\components\books\BookEditorPage.tsx:958:export default BookEditorPage;
src\components\books\BookEditorPage.test.tsx:6:import BookEditorPage from './BookEditorPage';
src\components\books\BookEditorPage.test.tsx:97:describe('BookEditorPage', () => {
src\components\books\BookEditorPage.test.tsx:103:  it('renders from the route-backed Book editor URL and tracks openBook', async () => {
src\components\books\BookEditorPage.test.tsx:105:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:108:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:109:            element={<BookEditorPage initialBook={makeBook()} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:120:      expect(mocks.trackAction).toHaveBeenCalledWith('openBook', {
src\components\books\BookEditorPage.test.tsx:131:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:134:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:135:            element={<BookEditorPage initialBook={makeBook()} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:183:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:186:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:187:            element={<BookEditorPage initialBook={makeBook({ status: 'ready' })} initialNodes={nodes} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:211:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:214:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:215:            element={<BookEditorPage initialBook={makeBook()} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:260:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:263:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:264:            element={<BookEditorPage initialBook={makeBook({ status: 'ready' })} initialNodes={nodes} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:302:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:305:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:306:            element={<BookEditorPage repository={permissionRepository} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:323:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:326:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:327:            element={<BookEditorPage initialBook={makeBook({ updatedAt: 'older' })} initialNodes={[]} repository={staleRepository} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:386:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:389:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:390:            element={<BookEditorPage repository={repository} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:440:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:443:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:444:            element={<BookEditorPage repository={repository} materialCandidates={[]} />}
src\components\books\BookEditorPage.test.tsx:470:      <MemoryRouter initialEntries={['/teacher/materials/books/book-123']}>
src\components\books\BookEditorPage.test.tsx:473:            path="/teacher/materials/books/:bookId"
src\components\books\BookEditorPage.test.tsx:474:            element={<BookEditorPage repository={repository} materialCandidates={[]} />}
src\routes\teacherRoutes.tsx:42:const BookEditorPage = lazyWithRetry(() => import('../components/books/BookEditorPage.tsx'));
src\routes\teacherRoutes.tsx:129:    path: '/teacher/materials/books/:bookId',
src\routes\teacherRoutes.tsx:131:      ? asTeacherErrorBoundaryPage(<BookEditorPage />, 'readingV2Studio', ['teacher', 'super_admin'])
src\routes\teacherRoutes.test.tsx:37:    }))).toContain('/teacher/materials/books/:bookId');
src\routes\teacherRoutes.test.tsx:42:    }))).toContain('/teacher/materials/books/:bookId');
src\routes\teacherRoutes.test.tsx:51:      '/teacher/materials/books/:bookId',
src\pages\TeacherLobbyPage.test.jsx:722:      'TEACHER_MATERIAL_BOOK',
src\pages\TeacherLobbyPage.jsx:1083:    trackAction('openBook', { bookId, source: 'teacher_materials_book_card' });
src\pages\TeacherLobbyPage.jsx:1084:    navigateTo('TEACHER_MATERIAL_BOOK', { bookId }, { reason: 'teacher_materials_open_book' });
```

## Existing Branch Progress To Preserve

- `TeacherLobbyPage.jsx` already has `contentFilter` with `reading-passage` and `book` ids documented in state comment.
- `useTeacherDrafts` is already gated with `enabled: contentFilter === 'drafts'`.
- `ContentTabs.jsx` already lists `Reading Passage` and `Book`.
- `TeacherHeader` is currently rendered before `main` under page root.

## Completed Slices

- 2.0 foundation: flags, catalog types, Reading V2 passage/composition types, storage paths, and catalog paths.
- 3.0 Test Types: admin CRUD service, teacher pinned preferences, super-admin settings panel, rules, and registry actions.
- 4.0 Reading V2 metadata/index foundation: Reading Passage metadata, source-order display, index writes, and student-safe rule guards.
- 5.0 pure Reading Passage extraction: `readingV2PassageExtraction.service.ts` splits full-test documents or publish packages into Reading Passage candidates plus one full-test composition manifest. It stores numeric/label/unknown source order, question ranges, source snapshot/title, teacher/admin provenance, and blocks ambiguous boundaries, missing answer keys, and public eligibility without Test Type.
- 6.0 publish integration: `publishReadingV2Material` can stage extracted Reading Passage materials when `readingPassageExtraction` is supplied. The commit plan now carries storage-write operations for passage canonical records, passage versions, passage student/review projections, passage metadata, Material Catalog listing indexes, full-test composition records, and composition versions. Firebase adapter writes these in the same root multi-location update and the commit marker lists all new write paths. Composition helpers support legacy document compatibility extraction, shared passage version references, fork-by-default edit planning, explicit shared-source edit confirmation, newer-version warnings, and standalone Reading Passage revision drafts/republish without mutating live published versions.
- 7.0 Reading Passage library service: `readingV2PassageLibrary.service.ts` lists private/public Reading Passage rows from Material Catalog indexes plus Reading V2 metadata/student-safe projections only. It keeps Reading Passage private/public scope local to the tab, filters by search and Test Type with AND semantics, returns list-row-ready fields/actions, renders inactive Test Types as metadata, excludes non-passage rows, and never calls canonical content readers.
- 8.0 Book service foundation: `bookValidation.service.ts` validates Book metadata, PRD visibility/status values, empty drafts, structural readiness, placeholder-only draft status, all node types, max depth 5, cycles/orphans/self-parenting/duplicate sibling order, draft refs, duplicate ref ids, public-Book private refs, inactive Test Type warnings, and super-admin-only public publish transitions. `materialBooks.service.ts` creates/updates/list Books, writes metadata/nodes, uses owner/visibility/Test Type indexes, cleans stale indexes, and keeps Book public/private scope local to the Book tab. RTDB rules now cover `material_catalog/books`, `book_nodes`, and `book_indexes`, with teacher/super-admin ownership and no student Book organizer read path.
- 8.1 public Book governance slice: `materialBooks.service.ts` now exposes pending public-review queue loading plus approve/reject/return-to-private public review helpers with required reasons. Super-admin approval validates ready Book structure, blocks private/draft/missing/unsafe refs, looks up public material summaries, writes a sanitized `material_catalog/public_book_projections/{bookId}` structure, and removes the projection on reject/return. Raw `material_catalog/books/{bookId}` reads are owner/super-admin only; normal teachers read published public Book detail through the projection fallback in `BookEditorPage.tsx`. `AdminSettingsPage.tsx` routes public Book review through a native no-Mantine `PublicBookReviewPanel` with separate visible reason fields for approve, reject, and return-to-private decisions plus `adminPanel` observability actions.
- 9.0 partial Teacher Materials listing refactor: `TeacherLobbyPage.jsx` preserves `contentFilter`, moves `ContentTabs` to a separate row under page context, keeps draft hydration gated, removes normal material grid/list toggle, renders normal material browsing through `MaterialListView`, adds `activeTestTypeId` state, switches Book CTA to `Create New Book`, and hides create CTA for Reading Passage. 2026-07-07 update: universal MaterialSummary v1 is now the listing authority. 2026-07-08 correction: top-level My Content and Public Library are published-test views only (`full-test`, `listening-part`, `writing-prompt`, `thcs-thpt-test`); Reading Passage and Book rows remain summary-backed but render through their dedicated tabs.
- 9.0/10.0 Test Type block wiring: `TestTypeBlockModule.jsx` and CSS render up to four active Test Type filter blocks under the search/create toolbar. The module supports teacher pinned order, falls back to admin default top-four Test Types, skips inactive entries, uses `logoUrl`/`logoAlt` with short-label fallback, keeps selected-card active styling, exposes a frosted hover/focus settings icon, and stops settings-click propagation. `TeacherLobbyPage.jsx` now wires `activeTestTypeId`, preserves search/Test Type filters across tab changes, combines search and Test Type filter with AND semantics, and does not render an `All` block or helper filter pill. Preference modal opening remains open for Section 11.
- 11.0 Test Type preference/admin slice: `TestTypePreferenceModal.jsx` opens from each Test Type block settings icon, lists active teacher-selectable Test Types, shows pinned order, supports keyboard button reorder and select-based replacement, blocks duplicate/unavailable selections, handles fewer-than-four active Test Types with modal-only microcopy, saves through `teacherTestTypePreferences.service.ts`, closes, and refreshes the visible block row. Admin settings now passes an RTDB-backed Test Type repository/context into `TestTypeAdminPanel`; the panel displays the full Test Type record fields, supports inline create/edit for all PRD fields including `allowedMaterialKinds[]`, deactivates instead of deleting, tracks admin create/edit/deactivate actions, and remains behind the super-admin page guard.
- 12.0 Reading Passage tab UI slice: `materialListAdapter.js` now exposes `toReadingPassageRowModel` for list-row-ready Reading Passage metadata, source labels, Test Type badges, visibility, selection, and owner-guarded actions. `MaterialListRow` supports the selection checkbox slot and Reading Passage action icons. `TeacherLobbyPage.jsx` loads Reading Passage library rows only inside the `Reading Passage` tab, keeps Private/Public scope local to that tab with Private as the default, hides any V1 create CTA, renders rows through `MaterialListView`, wires open/revise/archive/single assign/bulk assign/create-full-test entry actions, hands single and bulk assignment to `HomeworkCreateModal`, writes reusable selected-passage full-test compositions through `readingV2TeacherComposition.service.ts`, and shows a concise post-publish/import empty state.
- 13.0 partial Reading Passage homework slice: `homework.types.ts` and `homeworkManager.ts` now accept `reading-passage` and `reading-passage-set` homework with assignment-time snapshots. Single passage homework stores the passage material id plus `readingPassageSnapshot`; combined sets generate `reading-passage-set:{homeworkId}` and store ordered `readingPassageSet` items. `readingV2PassageHomework.service.ts` centralizes snapshot/set creation and rejects unpublished, archived, inaccessible, or missing-student-projection candidates. `HomeworkCreateModal.tsx` accepts preselected single/set Reading Passage input, bypasses broad material scans for those cases, and keeps Books out of V1 homework choices.
- 13.0 student runtime slice: `readingV2PassageHomeworkLaunch.service.ts` maps single/set assignment snapshots to launch items, summarizes list/detail labels, and composes Reading Passage sets into one student-safe Reading V2 runtime projection with ordered passage sections, prefixed ids, and sequential display numbers. `StudentPracticePage.tsx` reads only assignment-pinned `student_safe_tests` projections for single/set homework and tracks `launchReadingPassageHomeworkRuntime`. `StudentHomeworkListPage.tsx` and `StudentHomeworkDetailPage.tsx` show Reading Passage / Reading Passage Set summaries without legacy material scans.
- 13.0 trusted submission/result-review slice: Firestore rules now validate `reading-passage` vs `reading-passage-set` homework payload shape while preserving `createdBy` teacher ownership checks. The trusted Reading V2 submission core composes Reading Passage sets from the assigned homework doc and per-passage published snapshots/review projections, rejects unbound or display-number-mismatched answers, scores against canonical server-side interactions, and writes material-kind/passage-section review payloads. Teacher review labels Reading Passage Set distinctly, groups by assigned passage, shows source order/full-test/snapshot metadata, displays attempt number in source metadata, and shows a non-blocking newer-version note when current source name differs from assigned snapshot.
- 14.0 Book tab UI slice: `CreateBookModal.tsx` is a dedicated Book create/edit metadata modal with title, multi-Test-Type selection, Private/Public visibility, tags, description, bibliographic fields, and empty-draft save support. `BookCardGrid.jsx` and `BookCard.jsx` render Book-only cover/default-name cards with cover images, generated fallback covers, metadata chips, local search/Test Type filtering helper, and only `Open Book`, `Edit metadata`, and owner-only `Archive/Delete` actions. `TeacherLobbyPage.jsx` now loads Book rows through `listTeacherBooks` only inside the `Book` tab, keeps the Book Private/Public scope local, routes create/edit/archive through the Book service, keeps normal test creation for non-Book tabs, and opens existing Books via registered `/teacher/materials/books/:bookId`. `BookEditorPage.tsx` is route-backed as a Section 14 placeholder shell; full node/material organization remains Section 15.
- 15.0 Book editor slice: `bookEditor.service.ts` now provides pure Book editor helpers for stable node creation, depth calculation, self/descendant/depth-6 move rejection, sibling reorder, published-only material summary filtering, duplicate material placements with unique `refId`, ref removal/reorder, and node deletion without deleting source materials. `BookMaterialPicker.tsx` renders lightweight published summaries only, excludes drafts, and shows material kind/Test Type metadata. `BookNodeTree.tsx` supports all V1 node types, placeholder nodes, child sections/chapters/tests, material refs on any node, max-depth UI blocking, accessible up/down and move-to controls, confirmation for non-empty deletes, broken/unavailable ref display, and selected-ref-only assignment actions. `BookEditorPage.tsx` now has metadata editing for all PRD Book fields, readiness separate from save state, Book structure save through `updateBookTree`, published index-summary loading for picker candidates, and homework handoff for individual refs only; Reading Passage refs pass `preselectedReadingPassage` into `HomeworkCreateModal` and never create a Book assignment.
- 16.0 PRD-0050 preservation slice: `MaterialListView`/`MaterialListRow` remain fixed-column compact list rows with duration represented as metadata badges/metrics and stable icon slots, not wide cards or new columns. `materialListAdapter.js` keeps normal tests and Reading Passage rows in separate row-model builders, adds sanitized Reading Passage row sources so hidden provenance/import evidence/passage body/questions/answer keys do not flow into row handlers, and covers legacy tests, Reading V2 full-test rows, Reading Passage rows, inactive/missing Test Type fallback, missing title fallback, and hidden provenance exclusion. `useTeacherTests` remains on indexed owner/public queries for normal lobby material listing. `readingV2PassageLibrary.service.ts` still avoids canonical content hydration for Reading Passage list rows. `listTeacherBooks` and Teacher Lobby Book tab tests confirm Book grid uses index rows only and does not load Book nodes/material refs until the Book editor route opens. `BookNodeTree` renders missing, archived, inaccessible, and newer-version Book refs from fallback snapshots without leaking visibility/private metadata or mutating assignment-time snapshot refs.
- 17.0 observability/diagnostics/error-handling slice: `teacherMaterialsDiagnostics` now sanitizes payloads before console logging, redacts passage/question/answer/provenance/import-evidence/student-answer/full-name fields, and emits only non-sensitive counters/timing. `TestTypeAdminPanel`, Teacher Lobby Test Type preference loading, Reading Passage list, and Book list report success/failure counters. Teacher Materials actions now track the PRD snake_case action names for tab changes, Test Type filters/preferences, Book create/update/editor node/ref actions, Reading Passage single/set assignment, student Reading Passage homework launch/submit, and Reading Passage result viewing. Book editor errors now render user-facing permission, validation, retry, stale-conflict, and inaccessible-snapshot states; Teacher Lobby list surfaces cover retryable Reading Passage/Book load errors; Test Type admin states remain covered.
- 18.0 migration/backfill compatibility slice: `prd0052-reading-v2-backfill-dry-run-plan.md` records the dry-run plan and safety gates. `readingV2Backfill.service.ts` adds a pure dry-run planner for existing Reading V2 full tests, reports `split-ready`, `manual-review`, and `already-backfilled` totals, builds deterministic source-scoped write plans for Reading Passage materials, passage versions, student/review projections, metadata, listing indexes, full-test compositions, and composition versions, and refuses writes unless `approvedBy` is supplied. Backfill ids/paths derive from source material id plus source snapshot version, so reruns do not create duplicate Reading Passage entities. Public source rows only remain public when `publicShareable` is explicit; otherwise they are downgraded to private. Existing compatibility coverage remains in `resolveReadingV2FullTestComposition`, `useTeacherTests` registry-row behavior, and `StudentPracticePage` legacy/V2 launch tests so old full tests can appear and launch before backfill. On 2026-06-04 the final publish-gate dry-run for `temp-a1437` returned 4 rows: 0 `split-ready`, 1 `manual-review`, 3 `already-backfilled`, 0 read failures, mutation `not-run`; `studio-material-mojlf55h` / `snapshot-studio-material-mojlf55h-mojlfaqa` is manual review with 22 publish-gate blockers. Write mode requires `--from-report <dry-run-report.json>` and verifies the reviewed dry-run/not-run report before mutation; the approved write committed a reviewed no-op with `plannedWriteCount=0`.
- 18.1 Auto V4 Clippings import/publish proof slice: `readingV2AutoImport.service.ts` now canonicalizes answer-key merge keys by question number plus slash-normalized answer text before merging local/source and provider-copied key rows, so formatting-only duplicates no longer become publish blockers while real conflicting rows remain visible. Live read-only Clippings proof for `Practice Cam 10 Reading Test 04.md` parsed 3 passages / 40 questions / 40 answer values with no publish blockers after the fix; a temporary no-DB publish probe staged 3 Reading Passage entities and 3 ordered full-test composition refs through `publishReadingV2Material`. The import still reports `needs_review` when source-coverage diagnostics are weak.
- 19.0 verification slice: targeted service, UI, homework, student, result/projection, backfill, and security-rule tests were run from the current checkout. `prd0052-security-rule-validation-cases.md` records the nine required security cases. Changed-file UTF-8 check passed. Full lint was run and failed on pre-existing/global ESLint configuration scope issues; targeted JS/JSX lint for touched JS/JSX files passed, while targeted TS/TSX lint still failed because the current ESLint config does not parse TypeScript syntax.
- 20.0 live Reading V2 publish/runtime slice: live browser Auto V4 import from `Practice Cam 10 Reading Test 04.md` created and published a full Reading V2 test from Studio without fixture mode. The publish pipeline now auto-extracts generated Reading Passage materials for full-test publishes and writes canonical per-passage `reading_v2/published_snapshots/{passageMaterialId}/{snapshotVersionId}` in addition to passage metadata, Material Catalog summaries, student-safe/review projections, and full-test composition refs. RTDB proof for `studio-material-mpxjmklq` showed 3 `material_catalog/material_indexes/by_source_full_test/*` rows, 3 canonical passage snapshots, and 3 student-safe passage projections with no answer-key/provenance leakage in list or student-safe paths. Single Reading Passage homework assignment, student launch/submit, and teacher result review passed live. `StudentPracticePage.tsx` now bridges successful trusted Reading V2 submit results into the existing Firestore `homework_submissions` lifecycle through `submitHomework(...)`, so homework list/detail status no longer remains `in_progress` after a scored Reading V2 submit.
- 20.1 live Reading V2 set/full-test/homework metadata slice: after Worker deploy `0c28124d-88b7-403b-b0cb-bb7d1cd25a79`, bulk Reading Passage set homework `SiDFz9BPXOCSKhgoxTBi` launched from `/student/practice/reading-passage-set:SiDFz9BPXOCSKhgoxTBi`, submitted 26 answers through the deployed Worker, and wrote result `reading-v2-result-6211194e-a441-4192-a2d0-5353a668bf07` with score 11/26 (42%). Teacher detail/review rendered the set result and 5 task groups. A fresh full Reading V2 live-session regression `A91JFM` also launched, submitted, and reviewed through the deployed Worker. `Create full test from selected` recovered in browser, created a reusable `Selected Reading Passages` full test, and RTDB proof confirmed composition/version/projection/catalog writes with no duplicate Reading Passage entity. On 2026-06-04, teacher browser QA on `http://localhost:5174` verified homework history/detail metadata for `SiDFz9BPXOCSKhgoxTBi`: Timeline card showed title, state, material `Reading Passage Set`, source, Test Type `IELTS`, and submissions `1 / 1`; detail showed the same metadata plus `QUESTIONS 26`, completion `100%`, average `42%`, and student status `Submitted`.
- 20.2 repair/backfill caveat slice: the Reading V2 backfill runner remains dry-run by default and live writes still require explicit `--write --approved --from-report` plus owner approval. The backfill runner now normalizes Firebase CLI paths, reports read failures, aborts mutation when reads fail, verifies the reviewed dry-run/not-run report before write, tolerates legacy missing `validationState` while still running structural validation, and routes extracted publish-gate failures to `manual-review` before write planning. The refreshed 2026-06-04 dry-run returned `total=4`, `splitReady=0`, `manualReview=1`, `alreadyBackfilled=3`, `readFailures=0`, `mutation=not-run`; `studio-material-mojlf55h` has 22 `publish-gate-blocked` issues and is owner-deferred source-data manual review, with no source mutation or partial backfill write. The approved live write `output/reading-v2-backfill/prd0052-reading-v2-backfill-write-20260604-no-eligible-sources.json` committed a no-op with `plannedWriteCount=0`, `readFailures=0`, and no eligible split-ready sources. `planMaterialCatalogRepairOperations(...)` plans stale material/book indexes, orphan Book nodes, and missing full-test composition-version rows. `npm run repair:material-catalog -- [options]` is the matching dry-run/default operational runner; write mode requires `--write --approved <id> --from-report <dry-run-report.json>`, aborts on Firebase read failures, requires a reviewed dry-run/not-run report, verifies project/count/digest against the reviewed dry-run report, and commits reviewed repair operations through one root RTDB multi-location update. On 2026-06-04 the approved repair write report for `temp-a1437` committed 54 operations, 0 read failures, digest `b3094eb7135b612b3cc6df229e469f28535d8bae55a9d580ea5852bb95cc933b`, with 45 Material Catalog index writes and 9 Book index writes; direct RTDB reads confirmed representative Material Catalog and Book index rows. Stable Firebase-style compare hardening fixed post-write false positives for key order and RTDB-omitted empty containers; final repair dry-run `output/material-catalog-repair/prd0052-material-catalog-repair-dry-run-20260604-final-converged.json` returned `operations=0`. A controlled live composition-version fixture produced one reviewed `composition-version-write`, committed in `output/material-catalog-repair/prd0052-material-catalog-repair-write-20260604-composition-version-fixture.json`, was verified through Firebase CLI, and was then removed.
- 20.3 Book atomic persistence slice: `materialBooks.service.ts` now builds one sanitized multi-location update payload for Book metadata, stale-index removals, new index writes, node replacement/removal, and public projection write/removal flows. Firebase production adapters in Teacher Lobby, Book editor, and Admin Settings pass root `update(ref(database), payload)`. `materialBooks.service.test.ts` covers failed atomic metadata update with no sequential `write`/`remove` fallback, and Book tree replacement payloads include stale node removal, replacement node write, metadata, and indexes in one update.

## Architecture Notes

- Canonical Reading V2 publish/passage-library architecture now lives in `documentation/architecture/reading-v2-material-publish-and-passage-library.md`.
- 2026-07-07 update: `material_catalog/material_summary_indexes/v1` is now the active Teacher Materials discovery authority for My Content, Public Library, and active dedicated Reading Passage/Book views. `material_catalog/material_indexes` and `material_catalog/book_indexes` remain legacy/helper surfaces for compatibility, archive, repair, source-full-test lookup, and bounded pickers where still wired.
- `reading_v2/listing_indexes` is obsolete/compatibility-only for PRD-0052 QA unless a future migration explicitly rewires readers, rules, tests, and browser proof.
- Reading V1 and Reading V2 projection planes remain separate: legacy Reading uses `/tests` plus root `/student_safe_tests`; Reading V2 uses `reading_v2/published_snapshots` plus namespaced `reading_v2/projections/*`.

## Verification Log

- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/config/readingV2FeatureFlags.test.ts src/types/materialCatalog.types.test.ts src/services/materialCatalog/materialCatalogPaths.test.ts src/types/readingV2.types.test.ts src/services/reading-v2/readingV2StoragePaths.service.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/testTypeConfig.service.test.ts src/services/materialCatalog/teacherTestTypePreferences.service.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts src/components/admin/TestTypeAdminPanel.test.tsx src/pages/AdminSettingsPage.test.tsx --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2MaterialMetadata.service.test.ts src/services/materialCatalog/materialCatalogIndexes.service.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2PassageExtraction.service.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2PassageExtraction.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/services/reading-v2/readingV2PassageRevision.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2PassageLibrary.service.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/__tests__/security/materialCatalogFirebaseRules.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/SearchFilterBar.test.jsx src/hooks/test/useTestFilters.test.ts src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/TestTypeBlockModule.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - RED first, then passed after module/page wiring.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/TestTypePreferenceModal.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - RED first, then passed after modal/page wiring.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/admin/TestTypeAdminPanel.test.tsx src/pages/AdminSettingsPage.test.tsx --reporter=basic"` - RED first, then passed after admin editor/repository wiring.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - RED first, then passed after Reading Passage row adapter, selection UI, tab scope, and row-action wiring.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/TestTypeBlockModule.test.jsx src/components/modern/TestTypePreferenceModal.test.jsx src/components/admin/TestTypeAdminPanel.test.tsx src/pages/AdminSettingsPage.test.tsx src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - passed after optimizing `TestTypeAdminPanel.test.tsx` to avoid default-timeout failures.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/homeworkManager.test.ts --reporter=basic"` - RED first, then passed after Reading Passage homework persistence.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2PassageHomework.service.test.ts --reporter=basic"` - RED first, then passed after assignment snapshot/set validation service.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/homework/HomeworkCreateModal.test.tsx --reporter=basic"` - passed after preselected Reading Passage and set modal handoff.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - passed after replacing entry shell with `HomeworkCreateModal` handoff.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/homeworkManager.test.ts src/services/reading-v2/readingV2PassageHomework.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/components/homework/HomeworkCreateModal.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - passed after adding explicit timeout to slower Teacher Lobby Reading Passage integration cases under combined load.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2PassageHomeworkLaunch.service.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/StudentPracticePage.test.tsx --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/StudentHomeworkListPage.test.tsx --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/StudentHomeworkDetailPage.test.tsx --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/__tests__/readingV2PassageSetSubmitCore.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/components/results/LegacyResultDetailView.test.tsx src/services/reading-v2/readingV2ResultAdapter.service.test.ts --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\functions && npm run build"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/CreateBookModal.test.tsx src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorPage.test.tsx src/pages/TeacherLobbyPage.test.jsx src/constants/routes.test.ts --reporter=basic"` - RED first, then passed after Book modal/grid/page/route wiring.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/config/featureRegistry.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/constants/routes.test.ts src/components/books/CreateBookModal.test.tsx src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorPage.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1 | Select-String -Pattern 'CreateBookModal|BookEditorPage|BookCardGrid|TeacherLobbyPage|materialBooks|constants/routes|featureRegistry|routeSecurity'"` - no matching errors after fixing `BookEditorPage` header props.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/bookEditor.service.test.ts src/components/books/BookMaterialPicker.test.tsx src/components/books/BookNodeTree.test.tsx --reporter=basic"` - RED first due missing Section 15 service/components.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/components/books/BookMaterialPicker.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookEditorPage.test.tsx --reporter=basic"` - passed after Book editor implementation; fixed one render loop from unstable default `initialNodes=[]`.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/config/featureRegistry.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/bookEditor.service.test.ts src/constants/routes.test.ts src/components/books/CreateBookModal.test.tsx src/components/modern/BookCardGrid.test.jsx src/components/books/BookMaterialPicker.test.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookEditorPage.test.tsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - passed, 11 files / 127 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1" | Select-String -Pattern 'BookEditorPage|BookMaterialPicker|BookNodeTree|bookEditor\.service|featureRegistry'` - no matching errors.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run check:utf8 -- src/services/materialCatalog/bookEditor.service.ts src/services/materialCatalog/bookEditor.service.test.ts src/components/books/BookMaterialPicker.tsx src/components/books/BookMaterialPicker.css src/components/books/BookMaterialPicker.test.tsx src/components/books/BookNodeTree.tsx src/components/books/BookNodeTree.css src/components/books/BookNodeTree.test.tsx src/components/books/BookEditorPage.tsx src/components/books/BookEditorPage.css src/components/books/BookEditorPage.test.tsx src/config/featureRegistry.ts"` - passed.
- `git -C "C:\Users\The Lord\Desktop\luyentap-writing-import-rebased" diff --check -- src/services/materialCatalog/bookEditor.service.ts src/services/materialCatalog/bookEditor.service.test.ts src/components/books/BookMaterialPicker.tsx src/components/books/BookMaterialPicker.css src/components/books/BookMaterialPicker.test.tsx src/components/books/BookNodeTree.tsx src/components/books/BookNodeTree.css src/components/books/BookNodeTree.test.tsx src/components/books/BookEditorPage.tsx src/components/books/BookEditorPage.css src/components/books/BookEditorPage.test.tsx src/config/featureRegistry.ts` - passed.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/materialListAdapter.test.js src/components/modern/MaterialListView.test.jsx src/components/modern/MaterialListRow.test.jsx src/components/books/BookNodeTree.test.tsx src/services/materialCatalog/materialBooks.service.test.ts src/hooks/__tests__/useTeacherTests.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts src/pages/TeacherLobbyPage.test.jsx --reporter=basic"` - passed, 8 files / 66 tests.
- Browser overflow check on `http://localhost:5173/lobby` using Playwright after Teacher session was already active on localhost: measured widths `1280`, `1366`, `1440`, `1536`, `1586`, `1600`, and `1920`; `documentElement`, `body`, `.material-list-view`, and all `.material-list-row` entries had `scrollWidth <= clientWidth` at every width.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1" | Select-String -Pattern 'materialListAdapter|MaterialListView|MaterialListRow|BookNodeTree|TeacherLobbyPage|materialBooks\.service'` - no matching errors.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/BookNodeTree.test.tsx src/components/books/BookEditorPage.test.tsx --reporter=basic --pool=forks"` - passed, 2 files / 9 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks"` - passed, 1 file / 22 tests. Expected stderr came from the intentional retryable load-error test.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/StudentPracticePage.test.tsx --reporter=basic --pool=forks"` - passed, 1 file / 7 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/results/ReadingV2ReviewContentAdapter.test.tsx --reporter=basic --pool=forks"` - passed, 1 file / 4 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/utils/__tests__/teacherMaterialsDiagnostics.test.ts src/config/featureRegistry.test.ts --reporter=basic --pool=forks"` - passed, 2 files / 15 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/admin/TestTypeAdminPanel.test.tsx --reporter=basic --pool=forks"` - passed, 1 file / 5 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1"` - exit 2 from unrelated existing errors. Filtered touched-file patterns `TeacherLobbyPage|teacherMaterialsDiagnostics|TestTypeAdminPanel|BookNodeTree|BookEditorPage|StudentPracticePage|ReadingV2ReviewContentAdapter|featureRegistry` showed no matching errors after adding `src/utils/teacherMaterialsDiagnostics.d.ts`.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts src/hooks/__tests__/useTeacherTests.test.ts src/pages/StudentPracticePage.test.tsx --reporter=basic --pool=forks"` - passed, 4 files / 27 tests. Expected stderr came from existing error-path tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2Backfill.service.test.ts src/services/reading-v2/readingV2PassageExtraction.service.test.ts src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/reading-v2/readingV2FullTestComposition.service.test.ts --reporter=basic --pool=forks"` - passed, 5 files / 31 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1"` - exit 2 from unrelated existing errors. Filtered touched-file patterns `readingV2Backfill|prd0052-reading-v2-backfill` showed no matching errors after fixing `approvedBy` narrowing.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/testTypeConfig.service.test.ts src/services/materialCatalog/teacherTestTypePreferences.service.test.ts src/services/reading-v2/readingV2PassageExtraction.service.test.ts src/services/reading-v2/readingV2PassageLibrary.service.test.ts --reporter=basic --pool=forks"` - passed, 4 files / 33 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2PublishPipeline.service.test.ts src/services/reading-v2/readingV2FirebasePublishAdapter.service.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts --reporter=basic --pool=forks"` - passed, 4 files / 28 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/TeacherLobbyPage.test.jsx src/components/modern/TestTypeBlockModule.test.jsx src/components/modern/TestTypePreferenceModal.test.jsx --reporter=basic --pool=forks"` - passed, 3 files / 34 tests. Expected stderr came from retryable list-error test.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/CreateBookModal.test.tsx src/components/modern/BookCardGrid.test.jsx src/components/books/BookEditorPage.test.tsx src/components/books/BookNodeTree.test.tsx --reporter=basic --pool=forks"` - passed, 4 files / 16 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/homework/HomeworkCreateModal.test.tsx src/services/homeworkManager.test.ts --reporter=basic --pool=forks"` - passed, 2 files / 16 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/pages/StudentPracticePage.test.tsx src/pages/TestPageRouter.test.tsx --reporter=basic --pool=forks"` - passed, 4 files / 26 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2Projection.service.test.ts src/services/reading-v2/readingV2ResultAdapter.service.test.ts src/components/results/ReadingV2ReviewContentAdapter.test.tsx --reporter=basic --pool=forks"` - passed, 3 files / 37 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic --pool=forks"` - passed, 3 files / 16 tests passed / 5 emulator tests skipped because `FIREBASE_DATABASE_EMULATOR_HOST` was not set.
- `node scripts/check-utf8.mjs <git changed files>` - passed for 50 text files.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npm run lint -- --quiet"` - failed, exit 1, 1719 existing/global ESLint errors. First blockers include `.backup/StudentSoloTestPage.tsx`, `.backup/legacy-0025/*`, `documentation/archive/webmcp-final-backup-2026-03-14/*`, `documentation/backup_old_grading/*`, `e2e/*`, `functions/lib/*`, `r2-backup-worker/*`, `scripts/*`, and broad TypeScript parse errors because root ESLint is not configured for these TS scopes.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx eslint --quiet src/services/reading-v2/readingV2Backfill.service.ts src/services/reading-v2/readingV2Backfill.service.test.ts src/utils/teacherMaterialsDiagnostics.js src/utils/teacherMaterialsDiagnostics.d.ts src/utils/__tests__/teacherMaterialsDiagnostics.test.ts src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.test.jsx src/components/books/BookNodeTree.tsx src/components/books/BookNodeTree.test.tsx src/components/books/BookEditorPage.tsx src/components/books/BookEditorPage.test.tsx src/components/admin/TestTypeAdminPanel.tsx src/components/admin/TestTypeAdminPanel.test.tsx src/pages/StudentPracticePage.tsx src/pages/StudentPracticePage.test.tsx src/components/results/ReadingV2ReviewContentAdapter.tsx src/components/results/ReadingV2ReviewContentAdapter.test.tsx src/config/featureRegistry.ts src/config/featureRegistry.test.ts"` - failed with 14 TypeScript parse errors on touched TS/TSX/d.ts files.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx eslint --quiet src/utils/teacherMaterialsDiagnostics.js src/utils/__tests__/teacherMaterialsDiagnostics.test.ts src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.test.jsx"` - passed for touched JS/JSX files.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx --reporter=basic --pool=forks"` - passed after the Section 20 mobile row-overflow fix.
- Browser QA on `http://127.0.0.1:5173/lobby` captured final My Content screenshots at `375`, `768`, `848`, `1366`, `1586`, and `1920` widths under `output/playwright/prd0052-implementation/teacher-materials-my-content-*-section20-final.png`. Browser metrics showed no document/body horizontal overflow, four Test Type blocks in one row, five material tabs present, local logo assets loaded at `300x120`, no broken logo alt text in body text, and 16 list rows in normal material browsing.
- Browser QA captured settings hover/focus/active-filter/modal screenshots at `848` width. Metrics showed settings opacity changes from `0` to `1` on hover/focus, active `aria-pressed` toggles to `true`, clicking the active block clears the filter, no helper filter pill appears, and the preferences modal opens without clearing the active filter.
- Browser QA captured Reading Passage and Book tab screenshots at `848` width under `teacher-materials-reading-passage-848-section20-final.png` and `teacher-materials-book-848-section20-final.png`. Both tabs kept no document overflow, loaded Test Type logo assets, and showed tab-local Private/Public controls; Book showed `Create New Book`, Reading Passage showed no primary create CTA.
- Historical remote RTDB state blocked final body verification for Reading Passage list rows and Book card grid: browser probes returned `Permission denied` for `material_catalog/test_types`, `material_catalog/book_indexes/by_owner/glMHCrzMnyS6AqFcb9I0nlOqQ6X2`, and stale `reading_v2/listing_indexes/*` paths from pre-gap-closure diagnostics. This is now obsolete evidence for active Teacher Materials listing. Later public Book-specific RTDB rules were deployed and live-verified, Reading Passage production-path proof moved to `material_catalog/material_indexes` in the 2026-06-03 slice, and active discovery moved again to `material_summary_indexes/v1` on 2026-07-07.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/testTypeConfig.service.test.ts src/components/modern/TestTypeBlockModule.test.jsx --reporter=basic --pool=forks"` - passed, 2 files / 17 tests, including default logo asset existence coverage.
- Local Firebase Database emulator startup was attempted to avoid remote RTDB dependency for the final visual body checks, but it failed before serving because Java is not installed or not on PATH: `Error: Could not spawn java -version. Please make sure Java is installed and on your system PATH.`
- Added dev-only visual fixture support guarded by `VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES=true` so Section 20 Book/Reading Passage body layout can be verified with current production components/CSS without bypassing production fetch behavior by default.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/teacherMaterialsVisualFixtures.test.js --reporter=basic --pool=forks"` - passed, 1 file / 4 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/teacherMaterialsVisualFixtures.test.js src/pages/TeacherLobbyPage.test.jsx src/services/materialCatalog/testTypeConfig.service.test.ts src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/components/modern/TestTypeBlockModule.test.jsx --reporter=basic --pool=forks"` - passed, 6 files / 48 tests. Expected stderr came from the intentional retryable Reading Passage/Book list-error test.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/reading-v2/readingV2TeacherComposition.service.test.ts src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks"` - passed, 2 files / 25 tests. Expected stderr came from the intentional retryable Reading Passage/Book list-error test.
- `$out = cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1"; $out | Select-String -Pattern "readingV2TeacherComposition|TeacherLobbyPage|teacherMaterialsVisualFixtures"` - no matching touched-file TypeScript errors. Full `tsc` still exits non-zero from unrelated existing repo errors.
- Fixture browser QA restarted the local app on `http://127.0.0.1:5173/lobby` with `VITE_PRD0052_TEACHER_MATERIALS_VISUAL_FIXTURES=true`; `5174` was rejected by Firebase Auth referer restrictions, so `5173` was used for the final run.
- Fixture browser QA captured:
  - `output/playwright/prd0052-implementation/teacher-materials-reading-passage-848-section20-fixture-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-reading-passage-375-section20-fixture-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-book-848-section20-fixture-final.png`
  - `output/playwright/prd0052-implementation/teacher-materials-book-375-section20-fixture-final.png`
- Fixture metrics passed: Reading Passage showed list rows and no Book grid at `848` and `375`; Book showed Book grid with two generated covers and no Materials list view at `848` and `375`; all four checks had `overflowX=0` and four Test Type blocks in one row.
- Follow-up admin browser QA used the user-provided real super-admin session on `http://localhost:5173/admin/settings`. `Book Reviews` loaded, temporary pending public Books rendered in the queue, and super-admin approval succeeded after service fixes for RTDB-omitted empty node fields and recursive undefined stripping before writes. RTDB rules now also avoid requiring empty-array/null fields that RTDB omits (`authors`, `tags`, `parentNodeId`, `materialRefs`) while preserving required id/title/status/visibility/type gates.
- RTDB rules were deployed with `cmd /c firebase deploy --only database --project temp-a1437`. Post-deploy live proof: `Book Reviews` approval moved `prd0052-admin-qa-mpx5xfse` to `public-library-published`, removed the pending-review index, wrote the published visibility index, and wrote `material_catalog/public_book_projections/{bookId}`. Another teacher on `http://localhost:5174/lobby` opened Book > Public, saw the approved Book, clicked `Open Book`, and the public detail route rendered `Public Book outline` / `QA Section` through the projection even though RTDB omitted empty `materialRefs` and `parentNodeId`. Temporary QA Books and projections were removed afterward with Firebase CLI and verified as `null`.
- `java -version` still fails on system PATH, but a workspace-local Temurin 21 runtime unblocked emulator proof. `cmd /c npx firebase-tools emulators:exec --only database,firestore --project demo-prd-0052-rules "cmd /c npx vitest run src/__tests__/security/materialCatalogFirebaseRules.test.ts src/__tests__/security/readingV2FirebaseRules.test.ts src/__tests__/security/homeworkFirestoreRules.test.ts --reporter=basic --pool=forks"` passed with 3 files / 39 tests. The first expanded emulator run exposed hidden/scoring-field leaks in Material Catalog safe paths; `database.rules.json` now denies those fields on summary/projection/node paths, and `cmd /c npx firebase-tools deploy --only database --project temp-a1437` released the hardened RTDB rules.

## 2026-06-05 Book Editor Modal Addendum Implementation

- Normal Teacher Materials Book-card opening now stays on `/lobby` and opens `BookEditorModal`. It no longer calls `navigateTo('TEACHER_MATERIAL_BOOK', ...)`.
- `/teacher/materials/books/:bookId` is compatibility-only. Enabled routes render `TeacherMaterialBookRedirect`, which redirects to `/lobby` with `teacherMaterialsOpenBookId` state. `TeacherLobbyPage` consumes that state once, opens the Book tab and modal, then replaces lobby history state through `navigateTo('LOBBY', ..., { replace: true, force: true, state: {} })`.
- `BookEditorWorkspace` owns the reused editor state: prop-driven `bookId`, metadata/node/material loading, public projection fallback, tabs, save metadata, save structure, request-review save, per-ref homework handoff, stale/permission error states, and dirty-state reporting. It does not render `TeacherHeader` or use `useParams()`.
- `BookEditorPage` is now a compatibility page wrapper around `BookEditorWorkspace` with a top-level `TeacherHeader`; it is no longer the normal Teacher Materials editor surface.
- `BookEditorModal` is a native/custom no-Mantine modal with `role="dialog"`, pinned header, frame/body/status classes, Escape/backdrop close, dirty discard confirmation, focus return to the launching `Open Book` button, header Save/Request review actions wired into workspace saves, and no nested `TeacherHeader`.
- `BookNodeTree` now supports `onRequestDeleteNode`; the modal workspace uses an in-modal delete confirmation for non-empty node deletion while preserving the legacy `window.confirm` fallback outside modal hosts.
- `BookCardGrid` passes `canUseMaterialBookEditor` into `BookCard`; disabled capability makes `Open Book` disabled with title `Book editor is not available` and no route flash.

Verification evidence:

- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/books/BookEditorModal.test.tsx src/components/books/BookEditorWorkspace.test.tsx --reporter=basic --pool=forks"` - passed, 2 files / 8 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks"` - passed, 1 file / 27 tests after route-state cleanup and disabled-capability coverage. Expected stderr came from intentional retryable error-path tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/pages/TeacherLobbyPage.test.jsx src/components/modern/BookCardGrid.test.jsx --reporter=basic --pool=forks"` - passed, 2 files / 32 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/routes/teacherRoutes.test.tsx src/constants/routes.test.ts src/config/featureRegistry.test.ts --reporter=basic --pool=forks"` - passed, 3 files / 77 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/services/materialCatalog/bookEditor.service.test.ts src/services/materialCatalog/bookValidation.service.test.ts src/services/materialCatalog/materialBooks.service.test.ts src/components/books/BookNodeTree.test.tsx src/components/books/BookMaterialPicker.test.tsx --reporter=basic --pool=forks"` - passed, 5 files / 34 tests.
- `cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx tsc --noEmit --pretty false 2>&1"` - failed from existing repo-wide TypeScript debt. Touched-file extraction errors in `BookEditorPage.tsx` and `BookEditorWorkspace.tsx` were fixed; final filtered touched-file patterns showed no matching errors. Remaining visible failures are existing/global errors such as route import-extension configuration, Mantine v8 prop drift, unrelated strict-null checks, duplicate solo type fields, and service type debt.
- Browser QA on `http://localhost:5174/lobby` with active teacher session opened Book tab and `Testing Book` through `Open Book`; URL stayed `/lobby`, modal rendered without nested `TeacherHeader`, and legacy direct `/teacher/materials/books/book-mpx8g283` redirected to `/lobby` with modal open.
- Browser close-state QA reopened `Testing Book`, closed the modal, and confirmed `/lobby` remained on the Book tab with Private scope. Dirty-close QA edited the Title field, clicked close, and saw the in-modal `Discard Book editor changes` confirmation.
- Browser screenshots captured:
  - `output/playwright/prd0052-book-editor-modal-375.png`
  - `output/playwright/prd0052-book-editor-modal-768.png`
  - `output/playwright/prd0052-book-editor-modal-848.png`
  - `output/playwright/prd0052-book-editor-modal-1366.png`
  - `output/playwright/prd0052-book-editor-modal-1586.png`
- Browser metrics for widths `375`, `768`, `848`, `1366`, and `1586`: `overflowX=false`, modal frame inside viewport, header/body/footer stacked without overlap, `wholeBookWarning=true`, `nestedTeacherHeader=false`.

Remaining browser caveats:

- Live browser did not cover material-ref assignment above the Book modal because the available QA Book had no attached refs.
- Live browser did not cover node/ref save refresh after modal close; unit coverage verifies `onSaved(bookId)` for metadata save, structure save, and request-review save.

## 2026-06-06 Teacher Materials Attached Tabs Layout

- Source of truth: `documentation/mockups/teacher-materials-attached-tabs-mockup.html`.
- Moved the existing Test Type blocks above the content tabs without changing their component styling or second-click clear behavior.
- Rebuilt `ContentTabs` as accessible attached tabs with a white active surface and purple top accent.
- Kept the left `Test Dashboard` title/subtitle block independent from the right control stack so it does not stretch vertically.
- Attached the content-tab rail to the search card top edge while preserving search and create-button behavior.
- Teacher mobile view is out of scope by user direction; desktop and tablet are the required Teacher UI QA surfaces.

Verification evidence:

- `cmd /c npx vitest run src/components/modern/ContentTabs.test.jsx src/components/modern/TestTypeBlockModule.test.jsx src/components/modern/SearchFilterBar.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks` - passed, 4 files / 38 tests.
- `cmd /c npm run build` - passed; bundle budget passed.
- `cmd /c npm run check:utf8 -- <touched files>` - passed, 7 files.
- `git diff --check -- <touched files>` - passed.
- Touched-file ESLint remains blocked by the pre-existing unused `bookEditorDirty` value in `TeacherLobbyPage.jsx`; the same declaration exists in `HEAD` and was not changed by this layout task.
- Browser QA on `http://localhost:5174/lobby` verified the left title block, Test Type placement, attached tabs, search row, and second-click IELTS clear behavior.
- Browser screenshots:
  - `output/playwright/teacher-materials-attached-tabs-implementation-768.png`
  - `output/playwright/teacher-materials-attached-tabs-implementation-848.png`
  - `output/playwright/teacher-materials-attached-tabs-implementation-1366.png`
  - `output/playwright/teacher-materials-attached-tabs-implementation-1586.png`
