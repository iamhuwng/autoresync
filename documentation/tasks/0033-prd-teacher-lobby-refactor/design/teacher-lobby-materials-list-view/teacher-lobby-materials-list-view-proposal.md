# Teacher Lobby Materials Compact List View Proposal

## Scope

Target surface: `src/pages/TeacherLobbyPage.jsx`, Materials tab / Teacher Lobby content list.

Deliverables in this folder:

- `concept-current-style.png` - GPT-generated visual concept.
- `teacher-lobby-materials-list-view-mockups.html` - full-page compact list mockup.
- `teacher-lobby-materials-list-view-components.html` - component master and implementation mapping.
- `teacher-lobby-materials-list-view-proposal.md` - this proposal.

Approved visual target:

- source image: `C:\Users\The Lord\.codex\generated_images\019e6f01-361d-7833-b0ed-1de447bc32e7\ig_0db20219f68ecda4016a197a2930988191b1e5f008b6dcdbfc.png`
- reference render: `rendered-desktop.png`
- desktop canvas used for final visual QA: 1586px x 992px

Design gate note: this checkout does not contain repo-root `DESIGN.md`, so the active local sources are:

- `documentation/architecture/ui-design-standards.md`
- `documentation/architecture/teacher-lobby-authoring-and-navigation.md`
- `documentation/architecture/teacher-materials-listing-and-diagnostics.md`
- live reference screenshot: `output/playwright-lobby.png`
- current code in `src/pages/TeacherLobbyPage.jsx` and `src/components/modern/*`

## Research Basis

External UI standards support a distinct list design, not a vertically stretched card grid:

- Material Design: lists are continuous vertical rows for similar data. Put distinguishing content on the left and supplemental actions on the right. Dense desktop lists are valid when mouse/keyboard are primary input. Source: https://m1.material.io/components/lists.html
- Material Design data tables: tables are for raw data, column sorting, selection, and enterprise comparison. Teacher materials list should borrow some alignment discipline but should not become a full data table unless sorting/selection become core. Source: https://m1.material.io/components/data-tables.html
- Microsoft Windows lists: list views fit text-heavy collections; grid views fit image-heavy or browse-first libraries. Source: https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/lists
- Fluent List: lists should be easy to scan and access; use parallel row structures. If true columns become the main organizer, use a grid/table. Source: https://fluent2.microsoft.design/components/web/react/core/list/usage

Decision:

- keep grid view as browsing mode
- add list view as scan/comparison mode
- reuse visual primitives for harmony, but use different row anatomy for list mode

## Correct Mental Model

Reuse does not mean list rows must be widened cards.

Reuse means:

- same teacher shell
- same page gradient
- same toolbar family
- same card color variants
- same badge tokens
- same button variants
- same SVG icon style
- same action vocabulary

List-specific structure should differ:

- compact row height
- mostly neutral row surface with pastel accent and type icon wash for fast item recognition
- title/chips clustered left
- count, duration, date as aligned scan columns
- compact action cluster right
- pagination/status count at bottom

This is the pattern the preferred mockup uses, and it is the correct direction.

## Product Intent

Teacher Lobby currently uses grid cards only. Grid remains useful for browse and recognition. List mode should help teachers scan many materials quickly.

List mode optimizes:

- row-by-row title scanning
- count/duration/date comparison
- spotting incomplete rows
- direct action access without large card footers
- higher density than grid

List mode must not change:

- teacher navigation
- creation modal ownership
- material loading scope
- Reading V2 hidden-asset behavior
- draft loading ownership

## Live Components To Reuse

| Surface | Existing source | Reuse rule |
| --- | --- | --- |
| Teacher shell | `TeacherHeader`, `TeacherNavigation`, `TeacherLobbyPage` container | Implementation must use live shell, not a separate header. |
| Toolbar | `SearchFilterBar`, `Input`, `NativeSelect`, `Button` | Add view toggle while preserving conditional filters. |
| Grid mode | `TestCard`, `ThcsTestCard`, `DraftCard` | Keep existing cards for grid. |
| List row surface | `Card` tokens and variants | Use same pastel variants, but with list-row layout. |
| Badges | `TestCard.css` | Reuse `.test-card-badge*` styling. |
| Buttons | `Button` variants | Reuse `glass`, `danger`, `primary`; keep filled red `Delete`. |
| Icons | `src/components/modern/icons.jsx` | Reuse SVG style; add grid/list/type icons if missing. |

## Information Architecture

### Toolbar

For My Content, the compact-list concept can include:

- search
- type filter
- status filter
- folder filter
- grid/list view toggle
- `Create New Test`

Approved toolbar geometry:

- search: 443px
- type filter: 200px
- status filter: 214px
- folder filter: 214px
- view toggle: 112px, two 56px icon buttons
- create button: 190-195px
- at 1361-1560px desktop widths, compress toolbar columns and gaps instead of allowing horizontal scroll

Implementation note:

- current `SearchFilterBar` only has public-library type filters, so `Status` and `Folder` should be treated as design candidates unless product approves those real filters
- if first implementation must be narrow, ship search + existing filters + view toggle + create

### Desktop List Row

Recommended columns:

1. Accent strip: 4-5px, variant color.
2. Type icon tile: 44-48px, variant-tinted SVG.
3. Title + badges: primary scan zone, single-line title ellipsis.
4. Count column: item count with icon.
5. Date column: updated/created timestamp.
6. Actions: compact right-aligned action set.

Post-implementation note: the separate Duration column is obsolete. Duration remains visible as a compact badge in the Material zone, because keeping both a duration badge and a duration scan column added noise without improving scanability.

Approved row grid:

`5px 54px minmax(420px, 552px) 145px 145px 210px minmax(260px, 1fr)`

Desktop overflow guard:

- at 1361-1560px: `5px 54px minmax(300px, 1fr) 120px 110px 150px minmax(250px, auto)`
- at 1280-1360px: use the narrow desktop fallback already present in the mockup
- no horizontal document overflow is allowed from 1280px through 1920px

The header labels should map to the same structure:

- `Material` spans accent + type icon + title zone
- `Items`, `Duration`, `Updated` align to row metric columns
- `Actions` aligns above the right action cluster

Row height:

- target 64-68px for normal rows
- incomplete rows may reach about 66px because of dashed border treatment
- do not let long titles expand row height; use single-line ellipsis

Surface:

- row background should stay near-white for scanability
- color should carry through accent strip, icon tile, chips, and border
- avoid using full grid-card intensity in list mode

Title:

- single-line ellipsis
- native `title` tooltip for full title
- no card-like body paragraph

Badges:

- count
- type/skill
- grade/exam where present
- duration chip remains for current visual parity, but duration column is the primary scan column
- incomplete/status warnings

Actions:

- visible desktop actions: `Edit`, `Delete`, `Start Test`
- THCS adds `Assign HW`
- incomplete rows use `Complete` + overflow
- Public Library rows use `Use as-is` / `Clone & Customize`

Post-implementation note: desktop action overflow is obsolete for PRD-0050. Actions now use a fixed four-slot icon rail so rows with and without `Assign HW` preserve the same geometry.

## Desktop Behavior

- teacher list design is desktop-first; do not spend design energy on mobile
- full compact row columns visible at teacher desktop widths
- actions right aligned
- date visible
- row titles ellipsize instead of wrapping
- footer and pagination should remain visible in the first desktop viewport for the seven-row current sample
- verified no horizontal overflow at 1280, 1366, 1440, 1536, 1586, 1600, and 1920px for both the mockup and component master

## State Behavior

### My Content

Actions reuse current handlers:

- `Edit` / `View`
- `Delete`
- `Start Test`
- `Assign HW` for THCS rows

### Public Library

Actions follow current public-library ownership:

- THCS rows: `Use as-is`, `Clone & Customize`
- other public rows: current public behavior only
- show author only if current public data has `ownerName`

### Drafts

Draft rows keep separate draft source:

- `Resume Editing`
- `Delete`
- draft status chip
- last-edited timestamp if available in draft summary

`useTeacherDrafts` remains active only when Drafts tab is active.

### Incomplete

Preserve current incomplete cues:

- lower opacity
- mild grayscale
- dashed border
- warning icon/chip
- no active `Start Test`
- recovery action: `Complete`

## Implementation Recommendation

1. Add a material summary adapter:
   - `title`
   - `titleTooltip`
   - `countLabel`
   - `durationLabel`
   - `dateLabel`
   - `dateTimeLabel`
   - `chips`
   - `variant`
   - `typeIcon`
   - `isIncomplete`
   - `actionSet`
2. Add `MaterialViewModeToggle` to the existing toolbar path.
3. Keep grid mode on current card components.
4. Add list-mode components:
   - `MaterialListRow`
   - `ThcsMaterialListRow`
   - `DraftMaterialListRow`
5. Reuse existing handlers from `TeacherLobbyPage`:
   - edit
   - delete
   - start
   - assign homework
   - use-as-is
   - clone
6. Add `viewMode` to diagnostics if needed:
   - keep existing `grid_rendered` event for compatibility
   - add `viewMode: "grid" | "list"` to future payloads

## Data And Architecture Constraints

Stay on summary/index rows.

Do not hydrate:

- Reading V2 canonical drafts
- standalone passage assets
- student-safe payloads
- session-safe payloads
- result projections

Do not change:

- `useTeacherTests` indexed loading contract
- public library `isPublic` query contract
- draft loading ownership
- Reading V2 standalone-passage hiding

## Tests

Recommended focused tests:

- grid remains default or selected grid mode renders existing cards
- list mode renders one row per visible material
- toggling view mode does not refetch materials
- desktop rows expose title, count, duration, date, and actions
- incomplete row disables start action and shows recovery action
- THCS My Content row exposes `Assign HW`
- THCS Public Library row exposes public actions
- Draft tab renders draft rows only when active
- Reading V2 passage assets remain hidden in both modes
- desktop list has no horizontal overflow at 1280px and 1536px
- desktop list has no horizontal overflow at 1280, 1366, 1440, 1536, 1586, 1600, and 1920px
- 1586px x 992px reference render keeps all seven rows plus footer visible

## Recommendation

Ship list view as opt-in first. Do not replace grid mode.

Reason:

- grid is current browsing pattern
- list is better for compact scanning and comparison
- shared components preserve design unity without forcing same layout
- no database or canonical-payload changes are needed

Persist view preference later only if product wants sticky mode. First version can stay in memory to avoid new storage and portability rules.

## Implementation Outcome

PRD-0050 shipped the list view as opt-in, memory-only view state on Teacher Lobby Materials.

Accepted deviations from the concept artifacts:

- My Content keeps only backed toolbar controls: search, view toggle, and create. `All Types`, `All Statuses`, and `All Folders` were not added because current production data/handlers do not back those filters.
- Drafts remains grid-only for PRD-0050 list rendering. Draft list rows are deferred until draft-specific row behavior is product-approved; later Draft card selected-material actions are governed separately by `documentation/architecture/teacher-materials-bulk-selection-actions.md`.
- The live implementation uses one shared CSS grid contract for the header and every row via `--material-list-grid`, so column labels and cells cannot drift by row content.
- The `Duration` scan column was removed because duration is already carried as a compact badge. The remaining desktop columns are `Material`, `Items`, `Updated`, and a fixed-width action rail.
- Row actions are icon-only controls with accessible names and a four-slot fixed rail. Slot ownership lives in the row view model from `materialListAdapter.js`: slot 1 is edit/view/use-as-is/complete, slot 2 is delete, slot 3 is start/clone, and slot 4 is assign homework.
- Typography uses a constrained hierarchy instead of blanket bold: row titles are strongest at `600`, headers and badges sit at `500`, metrics/dates/footer drop to `400`, and icon-only actions do not use visible text emphasis.
- The live teacher account has more rows than the seven-row mockup sample, so the footer may sit below the first viewport even when row density and layout match the approved components.
- Public Library keeps current production action ownership: regular public rows expose view/start behavior, while THCS public rows keep `Use as-is` and `Clone` behavior.
