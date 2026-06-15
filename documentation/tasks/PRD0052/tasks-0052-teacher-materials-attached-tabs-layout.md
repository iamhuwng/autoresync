# Task List: PRD-0052 Teacher Materials Attached Tabs Layout

Created: 2026-06-06
Status: Planned
Branch: `codex/prd0052-material-tabs-inline`
Root: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`

## Goal

Implement the approved Teacher Materials control layout from
`documentation/mockups/teacher-materials-attached-tabs-mockup.html` in the real Teacher Lobby code.

The left page heading must keep the current visual rhythm:

```text
Test Dashboard
Manage your tests and start formal assessment sessions
```

The right side must show the Test Type blocks above the content tabs. The content tabs must attach visually to the search card below. The search card and material list remain below the page heading.

## Source Of Truth

- Primary design source: `documentation/mockups/teacher-materials-attached-tabs-mockup.html`
- Reference screenshot: `output/playwright/teacher-materials-attached-tabs-mockup-1586-v5.png`
- The HTML mockup wins for visual hierarchy, spacing relationship, and selected-tab styling.
- Current app behavior wins for filtering, capability gates, create labels, and Drafts behavior.

## Required Reading Before Code

- `DESIGN.md`
- `documentation/architecture/ui-design-standards.md`
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
- `documentation/rules/codebase-hygiene.md`
- `documentation/rules/observability.md`
- `documentation/rules/react-patterns.md`

## Non-Goals

- Do not change `TeacherHeader`.
- Do not move page-level tabs into `TeacherHeader`.
- Do not add an `All Materials` Test Type block.
- Do not change Test Type filter behavior: clicking the active IELTS/TOEIC/TOEFL/THCS block again still clears to all materials.
- Do not restyle the IELTS/TOEIC/TOEFL/THCS blocks themselves. Only move their placement.
- Do not change `SearchFilterBar` behavior, search placeholder, or create-button behavior.
- Do not add new `@mantine/*` imports.
- Do not add draft search unless separately approved.

## Current Code Anchors

- `src/pages/TeacherLobbyPage.jsx`
  - `teacher-lobby-page-header` currently owns title/subtitle/tabs around lines 1411-1428.
  - Search card currently renders around lines 1499-1516.
  - `TestTypeBlockModule` currently renders below search around lines 1518-1525.
- `src/pages/TeacherLobbyPage.css`
  - `.teacher-lobby-page-subhead` and responsive behavior.
- `src/components/modern/ContentTabs.jsx`
  - content tab labels and capability-gated visibility.
- `src/components/modern/ContentTabs.css`
  - current detached button layout.
- `src/components/modern/TestTypeBlockModule.jsx`
  - active filter and second-click clear behavior.
- `src/components/modern/TestTypeBlockModule.css`
  - current visual style for IELTS/TOEIC/TOEFL/THCS blocks.
- `src/components/modern/SearchFilterBar.jsx`
  - search and create action.
- `src/components/modern/SearchFilterBar.css`
  - search row spacing.
- `src/pages/TeacherLobbyPage.test.jsx`
- `src/components/modern/ContentTabs.test.jsx`
- `src/components/modern/TestTypeBlockModule.test.jsx`
- `src/components/modern/SearchFilterBar.test.jsx`

## Acceptance Criteria

- [ ] Left title/subtitle layout remains visually unchanged from the pre-mockup Teacher Lobby.
- [ ] On desktop, the Test Type blocks render on the right above `My Content / Public Library / Drafts / Reading Passage / Book`.
- [ ] The Test Type blocks preserve existing visual treatment and active/clear behavior.
- [ ] Content tabs sit on the same horizontal region as the subtitle, on the right side.
- [ ] Content tabs visually attach to the top edge of the search card below.
- [ ] Active content tab uses a white selected surface with purple top accent, not the old detached purple CTA pill.
- [ ] Inactive content tabs use flat/quiet attached-tab treatment, not floating action buttons.
- [ ] Search card remains one coherent row: search input plus create button.
- [ ] `Create New Test`, `Create New Book`, and hidden-create Reading Passage behavior remain unchanged.
- [ ] PRD-0052 capability gates still hide `Reading Passage` and `Book` tabs when disabled.
- [ ] Drafts remains behavior-compatible: no new draft search/filter behavior.
- [ ] Mobile and tablet layouts avoid horizontal page overflow.
- [ ] Browser QA screenshots at `375`, `768`, `848`, `1366`, and `1586` widths are captured and compared to the mockup.
- [ ] No new Mantine imports.
- [ ] Targeted tests pass.
- [ ] UTF-8 and diff whitespace checks pass.

## Tasks

### 0. Baseline And Guardrails

- [ ] 0.1 Confirm active root.

Run:

```powershell
Get-Location
git rev-parse --show-toplevel
git status --short --branch
```

Expected:

- Root is `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`.
- Branch is `codex/prd0052-material-tabs-inline`.
- Existing dirty files are recorded before code edits.

- [ ] 0.2 Read required design and rule files.

Run:

```powershell
Get-Content DESIGN.md -TotalCount 220
Get-Content documentation/architecture/ui-design-standards.md -TotalCount 220
Get-Content documentation/architecture/teacher-lobby-authoring-and-navigation.md -TotalCount 220
Get-Content documentation/rules/codebase-hygiene.md -TotalCount 220
Get-Content documentation/rules/observability.md -TotalCount 220
Get-Content documentation/rules/react-patterns.md -TotalCount 220
```

- [ ] 0.3 Open the committed HTML mockup and screenshot.

Open:

- `documentation/mockups/teacher-materials-attached-tabs-mockup.html`
- `output/playwright/teacher-materials-attached-tabs-mockup-1586-v5.png`

Record these implementation facts:

- Test Type row is above content tabs.
- Content tabs are attached to the search card below.
- Left title/subtitle spacing does not stretch because of right-side controls.
- Test Type block visuals are unchanged.

### 1. Test ContentTabs Semantics And Attached-State Contract

**Files:**

- Modify: `src/components/modern/ContentTabs.test.jsx`
- Modify later: `src/components/modern/ContentTabs.jsx`
- Modify later: `src/components/modern/ContentTabs.css`

- [ ] 1.1 Update `ContentTabs.test.jsx` to assert tab semantics and selected state.

Add assertions to the first test:

```jsx
const tablist = screen.getByRole('tablist', { name: /material content filters/i });
expect(tablist).toBeInTheDocument();

const myContent = screen.getByRole('tab', { name: /My Content/i });
const publicLibrary = screen.getByRole('tab', { name: /Public Library/i });

expect(myContent).toHaveAttribute('aria-selected', 'true');
expect(publicLibrary).toHaveAttribute('aria-selected', 'false');
```

Replace `getByRole('button', ...)` tab queries in this file with `getByRole('tab', ...)`.

- [ ] 1.2 Run the content-tabs test and confirm it fails before implementation.

Run:

```powershell
cmd /c npx vitest run src/components/modern/ContentTabs.test.jsx --reporter=basic
```

Expected before implementation:

- Fails because `ContentTabs` currently renders button semantics through shared `Button`.

- [ ] 1.3 Implement `ContentTabs.jsx` with native tab buttons.

Required JSX shape:

```jsx
return (
  <nav className="content-tabs" role="tablist" aria-label="Material content filters">
    {visibleTabs.map((tab) => {
      const isActive = activeTab === tab.id;

      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          className={`content-tab-button${isActive ? ' content-tab-button--active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      );
    })}
  </nav>
);
```

Keep capability filtering exactly as-is.

- [ ] 1.4 Rewrite `ContentTabs.css` to match the mockup attached tabs.

Required rules:

- `.content-tabs` is inline-flex, right-aligned, no full-width background bar.
- `.content-tab-button` uses `border: 1px solid #dbe3ed`, `border-bottom-color: #d9d0ff`, `border-radius: 10px 10px 0 0`, white/very pale inactive fill, `min-height` near `50px`, and no floating CTA hover lift.
- `.content-tab-button--active` uses white fill, purple text, top purple accent using `::before`, and `border-bottom-color: #fff`.
- Preserve existing minimum widths: normal tabs near `100px`, `Reading Passage` near `156px`.
- Add `:focus-visible` outline.

- [ ] 1.5 Re-run content-tabs test.

Run:

```powershell
cmd /c npx vitest run src/components/modern/ContentTabs.test.jsx --reporter=basic
```

Expected:

- Pass.

- [ ] 1.6 Commit this component-only slice.

Run:

```powershell
git add src/components/modern/ContentTabs.jsx src/components/modern/ContentTabs.css src/components/modern/ContentTabs.test.jsx
git commit -m "feat(materials): restyle content tabs"
```

### 2. Test Teacher Lobby Layout Ordering

**Files:**

- Modify: `src/pages/TeacherLobbyPage.test.jsx`
- Modify later: `src/pages/TeacherLobbyPage.jsx`
- Modify later: `src/pages/TeacherLobbyPage.css`

- [ ] 2.1 Update Teacher Lobby test mocks so layout tests can see the relevant classes.

Change the `ContentTabs` mock to render:

```jsx
<nav
  className="content-tabs"
  aria-label="Teacher lobby content tabs"
  data-active-tab={activeTab}
  role="tablist"
>
  <button type="button" role="tab" onClick={() => onTabChange('my')}>My Content</button>
  <button type="button" role="tab" onClick={() => onTabChange('public')}>Public Library</button>
  <button type="button" role="tab" onClick={() => onTabChange('drafts')}>Drafts</button>
  <button type="button" role="tab" onClick={() => onTabChange('reading-passage')}>Reading Passage</button>
  <button type="button" role="tab" onClick={() => onTabChange('book')}>Book</button>
</nav>
```

Change or add the `TestTypeBlockModule` mock if it exists in the file:

```jsx
vi.mock('../components/modern/TestTypeBlockModule', () => ({
  default: ({ activeTestTypeId, onActiveTestTypeChange }) => (
    <section className="test-type-block-module" aria-label="Test Type filters">
      <button
        type="button"
        aria-pressed={activeTestTypeId === 'ielts'}
        onClick={() => onActiveTestTypeChange?.(activeTestTypeId === 'ielts' ? null : 'ielts')}
      >
        Filter materials by IELTS
      </button>
    </section>
  ),
}));
```

- [ ] 2.2 Replace the old "renders content tabs next to the dashboard subtitle" test with a stricter layout test.

Required assertions:

```jsx
const header = container.querySelector('.teacher-lobby-page-header');
const subtitle = screen.getByText('Manage your tests and start formal assessment sessions');
const subhead = container.querySelector('.teacher-lobby-page-subhead');
const controls = container.querySelector('.teacher-lobby-header-controls');
const testTypeDock = container.querySelector('.teacher-lobby-test-type-dock');
const tabDock = container.querySelector('.teacher-lobby-content-tab-dock');
const tabNav = screen.getByRole('tablist', { name: 'Teacher lobby content tabs' });
const searchCard = container.querySelector('.teacher-materials-search-card');

expect(header).not.toBeNull();
expect(subhead).not.toBeNull();
expect(controls).not.toBeNull();
expect(testTypeDock).not.toBeNull();
expect(tabDock).not.toBeNull();
expect(searchCard).not.toBeNull();

expect(subhead).toContainElement(subtitle);
expect(controls).toContainElement(testTypeDock);
expect(controls).toContainElement(tabDock);
expect(tabDock).toContainElement(tabNav);

expect(
  testTypeDock.compareDocumentPosition(tabDock) & Node.DOCUMENT_POSITION_FOLLOWING
).toBeTruthy();
expect(
  header.compareDocumentPosition(searchCard) & Node.DOCUMENT_POSITION_FOLLOWING
).toBeTruthy();
```

- [ ] 2.3 Add a behavior-preservation test for Test Type second-click clear through page wiring.

Use the `TestTypeBlockModule` mock button from step 2.1.

Test body:

```jsx
const user = userEvent.setup();
render(<TeacherLobbyPage />);

const ieltsButton = screen.getByRole('button', { name: /filter materials by IELTS/i });

await user.click(ieltsButton);
await user.click(ieltsButton);

expect(mocks.trackAction).toHaveBeenCalled();
```

If `trackAction` is too broad, assert the button can be clicked twice without opening create/edit/session flows:

```jsx
expect(mocks.openTestCreation).not.toHaveBeenCalled();
expect(mocks.openEditTest).not.toHaveBeenCalled();
expect(mocks.startSession).not.toHaveBeenCalled();
```

- [ ] 2.4 Run the Teacher Lobby test and confirm it fails before JSX/CSS implementation.

Run:

```powershell
cmd /c npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks
```

Expected before implementation:

- Layout test fails because `TestTypeBlockModule` is still below the search card and no dock classes exist.

### 3. Move Test Type Blocks And Tabs In TeacherLobbyPage

**Files:**

- Modify: `src/pages/TeacherLobbyPage.jsx`

- [ ] 3.1 In `TeacherLobbyPage.jsx`, keep the left heading markup visually unchanged.

Do not change visible copy:

```jsx
<h1 ...>Test Dashboard</h1>
<p className="teacher-lobby-page-subtitle">
  Manage your tests and start formal assessment sessions
</p>
```

- [ ] 3.2 Add a right-side header control stack inside `teacher-lobby-page-subhead`.

Target shape:

```jsx
<div className="teacher-lobby-page-subhead">
  <p className="teacher-lobby-page-subtitle">
    Manage your tests and start formal assessment sessions
  </p>

  <div className="teacher-lobby-header-controls" aria-label="Teacher Materials controls">
    {contentFilter !== 'drafts' && (
      <div className="teacher-lobby-test-type-dock">
        <TestTypeBlockModule
          testTypes={testTypeConfigs}
          pinnedTestTypeIds={pinnedTestTypeIds}
          activeTestTypeId={activeTestTypeId}
          onActiveTestTypeChange={handleActiveTestTypeChange}
          onOpenPreferences={handleOpenTestTypePreferences}
        />
      </div>
    )}

    <div className="teacher-lobby-content-tab-dock">
      <ContentTabs
        activeTab={contentFilter}
        onTabChange={handleContentFilterChange}
        capabilities={teacherMaterialsCapabilities}
      />
    </div>
  </div>
</div>
```

Rationale:

- Test Type blocks stay hidden on `Drafts`, preserving current no-search/no-filter draft behavior.
- Content tabs remain visible for all content filters.

- [ ] 3.3 Remove the old `TestTypeBlockModule` render below the search card.

Delete the block currently after `</Card>` and before `contentFilter === 'reading-passage'`.

- [ ] 3.4 Add search card classes without changing search props.

Change:

```jsx
<Card variant="glass" style={{ marginBottom: '2rem', animation: 'slideUp 0.5s ease-out 0.1s backwards' }}>
  <CardBody>
```

To:

```jsx
<Card
  variant="glass"
  hover={false}
  className="teacher-materials-search-card"
  style={{ animation: 'slideUp 0.5s ease-out 0.1s backwards' }}
>
  <CardBody className="teacher-materials-search-card__body">
```

Do not change any `SearchFilterBar` props.

- [ ] 3.5 Run Teacher Lobby test.

Run:

```powershell
cmd /c npx vitest run src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks
```

Expected:

- Layout tests pass or fail only on CSS-independent DOM expectations.

### 4. Implement Attached Layout CSS

**Files:**

- Modify: `src/pages/TeacherLobbyPage.css`
- Modify only if needed: `src/components/modern/SearchFilterBar.css`
- Do not change: `src/components/modern/TestTypeBlockModule.css` unless required for context-only overrides.

- [ ] 4.1 Update `.teacher-lobby-page-header` through CSS instead of inline layout hacks.

Add:

```css
.teacher-lobby-page-header {
  position: relative;
}
```

If inline `style={{ marginBottom: '2.5rem' }}` conflicts with the attached layout, remove that `marginBottom` from JSX and own it in CSS:

```css
.teacher-lobby-page-header {
  position: relative;
  margin-bottom: 0;
  padding-bottom: 2.75rem;
}
```

- [ ] 4.2 Keep left subtitle rhythm unchanged.

Preserve:

```css
.teacher-lobby-page-subtitle {
  margin: 0;
  color: #64748b;
  font-size: 1rem;
  line-height: 1.4;
}
```

Do not add styles that stretch the title/subtitle vertical spacing to match the height of right-side controls.

- [ ] 4.3 Add desktop right-side stack.

Add:

```css
.teacher-lobby-header-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.75rem;
  min-width: 0;
}

.teacher-lobby-test-type-dock {
  max-width: min(58vw, 760px);
  min-width: 0;
  overflow: hidden;
}

.teacher-lobby-content-tab-dock {
  max-width: min(58vw, 760px);
  min-width: 0;
}
```

- [ ] 4.4 Add context-only Test Type placement overrides without changing block visuals.

Add:

```css
.teacher-lobby-test-type-dock .test-type-block-module {
  width: auto;
  max-width: 100%;
  margin: 0;
  justify-content: flex-end;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}

.teacher-lobby-test-type-dock .test-type-block-module::-webkit-scrollbar {
  display: none;
}
```

Do not change `.test-type-block`, `.test-type-block__logo`, `.test-type-block__fallback-logo`, active outline, hover, or settings icon rules.

- [ ] 4.5 Attach content tabs to the search card.

Add/adjust:

```css
.teacher-lobby-content-tab-dock .content-tabs {
  flex-wrap: nowrap;
  justify-content: flex-end;
  overflow-x: auto;
  scrollbar-width: none;
}

.teacher-lobby-content-tab-dock .content-tabs::-webkit-scrollbar {
  display: none;
}

.teacher-materials-search-card {
  margin-top: -1px;
  margin-bottom: 2rem;
  border-color: rgba(217, 208, 255, 0.9);
  border-radius: 14px;
}

.teacher-materials-search-card__body {
  padding: 2rem;
}
```

If the shared Card CSS overrides border/radius, use `.teacher-materials-search-card.modern-card.card-glass` specificity rather than `!important`.

- [ ] 4.6 Adjust `ContentTabs.css` active tab to visually merge into search card.

Ensure:

```css
.content-tab-button--active {
  border-bottom-color: #fff;
  background: #fff;
}
```

The active tab must not be purple-filled in this design.

- [ ] 4.7 Add responsive behavior.

At `max-width: 980px`:

```css
.teacher-lobby-page-subhead {
  flex-wrap: wrap;
}

.teacher-lobby-page-subtitle {
  flex-basis: 100%;
}

.teacher-lobby-header-controls {
  align-items: stretch;
  width: 100%;
}

.teacher-lobby-test-type-dock,
.teacher-lobby-content-tab-dock {
  max-width: 100%;
}

.teacher-lobby-test-type-dock .test-type-block-module,
.teacher-lobby-content-tab-dock .content-tabs {
  justify-content: flex-start;
}
```

At `max-width: 720px`, keep horizontal scrolling controls and full-width search/create behavior. Do not allow page-level horizontal overflow.

- [ ] 4.8 Run CSS-independent tests.

Run:

```powershell
cmd /c npx vitest run src/components/modern/ContentTabs.test.jsx src/components/modern/TestTypeBlockModule.test.jsx src/components/modern/SearchFilterBar.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks
```

Expected:

- Pass.

- [ ] 4.9 Commit layout implementation.

Run:

```powershell
git add src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.css src/components/modern/ContentTabs.jsx src/components/modern/ContentTabs.css src/components/modern/ContentTabs.test.jsx src/pages/TeacherLobbyPage.test.jsx
git commit -m "feat(materials): attach tabs to search controls"
```

### 5. Browser Visual QA Against Mockup

**Files:**

- No code edits unless QA finds mismatch.
- Evidence output under `output/playwright/`.

- [ ] 5.1 Start local app from this root.

Run:

```powershell
cmd /c npm run dev -- --host 127.0.0.1
```

Use the printed localhost URL. If the default port is busy, record the actual port.

- [ ] 5.2 Login through dev quick-login.

Browser flow:

1. Open local app.
2. Open login page if not already authenticated.
3. Click bottom-right settings icon.
4. Click `Teacher`.
5. Navigate to Teacher view -> Materials.

- [ ] 5.3 Capture desktop screenshots.

Capture:

- `output/playwright/teacher-materials-attached-tabs-implementation-1586.png`
- `output/playwright/teacher-materials-attached-tabs-implementation-1366.png`
- `output/playwright/teacher-materials-attached-tabs-implementation-848.png`
- `output/playwright/teacher-materials-attached-tabs-implementation-768.png`
- `output/playwright/teacher-materials-attached-tabs-implementation-375.png`

- [ ] 5.4 Compare against source mockup.

Use:

- `documentation/mockups/teacher-materials-attached-tabs-mockup.html`
- `output/playwright/teacher-materials-attached-tabs-mockup-1586-v5.png`

Visual comparison checklist:

- left title/subtitle vertical rhythm unchanged
- Test Type blocks above content tabs
- Test Type block style unchanged
- content tabs on right side of subtitle region
- active tab white with purple top accent
- inactive tabs attached and quiet, not floating CTAs
- active tab bottom edge merges with search card top edge
- search input and create button row unchanged
- no horizontal overflow at `375`, `768`, `848`

- [ ] 5.5 Fix visual drift and recapture screenshots until the checklist passes.

Do not reinterpret the mockup. If a change is needed for responsive safety, keep desktop source-of-truth unchanged and document the mobile-only adjustment in the final notes.

### 6. Final Verification And Documentation

- [ ] 6.1 Run targeted tests.

Run:

```powershell
cmd /c npx vitest run src/components/modern/ContentTabs.test.jsx src/components/modern/TestTypeBlockModule.test.jsx src/components/modern/SearchFilterBar.test.jsx src/pages/TeacherLobbyPage.test.jsx --reporter=basic --pool=forks
```

- [ ] 6.2 Run UTF-8 checks for touched files.

Run:

```powershell
npm run check:utf8 -- src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.css src/components/modern/ContentTabs.jsx src/components/modern/ContentTabs.css src/components/modern/ContentTabs.test.jsx src/pages/TeacherLobbyPage.test.jsx documentation/tasks/PRD0052/tasks-0052-teacher-materials-attached-tabs-layout.md
```

- [ ] 6.3 Run diff whitespace check.

Run:

```powershell
git diff --check -- src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.css src/components/modern/ContentTabs.jsx src/components/modern/ContentTabs.css src/components/modern/ContentTabs.test.jsx src/pages/TeacherLobbyPage.test.jsx documentation/tasks/PRD0052/tasks-0052-teacher-materials-attached-tabs-layout.md
```

- [ ] 6.4 Update implementation notes if this task is executed.

Modify:

- `documentation/tasks/PRD0052/prd0052-implementation-notes.md`

Add:

- mockup source path
- final screenshot paths
- targeted test command and result
- UTF-8 and diff-check result
- any intentional responsive deviation from desktop mockup

- [ ] 6.5 Final commit.

Run:

```powershell
git add src/pages/TeacherLobbyPage.jsx src/pages/TeacherLobbyPage.css src/components/modern/ContentTabs.jsx src/components/modern/ContentTabs.css src/components/modern/ContentTabs.test.jsx src/pages/TeacherLobbyPage.test.jsx documentation/tasks/PRD0052/prd0052-implementation-notes.md output/playwright/teacher-materials-attached-tabs-implementation-*.png
git commit -m "feat(materials): implement attached tab layout"
```

If screenshots are too large or the repo convention is not to commit them, omit `output/playwright/*.png` from the commit and reference their local paths in the final response instead.

## Rollback Plan

If the layout fails visual QA:

1. Keep `documentation/mockups/teacher-materials-attached-tabs-mockup.html` committed as the source of truth.
2. Revert only the implementation commit:

```powershell
git revert <implementation-commit>
```

3. Keep the tasklist and mockup commits for rework.

## Notes For Implementer

- Do not solve this by making a full-width content-tab bar. User rejected that.
- Do not solve this by stacking controls in a way that stretches the left heading block. User rejected that.
- Do not shrink or redesign IELTS/TOEIC/TOEFL/THCS. User explicitly said this is placement-only.
- The visual contract is asymmetric: left copy stays stable, right controls form a vertical stack, and content tabs attach to the search card below.
