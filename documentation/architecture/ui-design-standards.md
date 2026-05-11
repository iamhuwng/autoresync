# UI Design Standards

## Teacher Full-Page Result Standard

Teacher-facing result history and result detail pages opened from Teacher view must render as teacher pages, not detached standalone screens.

Required layout:

- `AppShell`
- `TeacherHeader`
- teacher page title/introduction block
- teacher page content container for analytics, filters, history, and detail content

Required behavior:

- access-lost states render inside the teacher shell
- loading and error states render inside the teacher shell
- detail pages opened from teacher history keep teacher navigation chrome

Forbidden patterns:

- full-screen gradient wrappers with no teacher shell
- standalone generic result screens opened from teacher workflows
- detached access-denied replacements that throw the user out of the teacher surface when mid-view access is revoked

## Teacher Lobby Shell And Material Card Standard

Teacher Lobby pages must keep teacher chrome stable across desktop, narrow desktop/tablet, and phone widths.

Required layout:

- `TeacherHeader`
- full inline teacher navigation only when there is room for the tab row
- compact teacher-navigation hamburger dropdown before tab text collides with notification/profile controls
- mobile drawer only for phone-sized layouts
- summary material cards in the existing lobby grid/list pattern

Required behavior:

- the compact teacher-navigation hamburger is valid for narrow desktop/tablet overflow, not only mobile
- `SearchFilterBar` search inputs use the shared SVG `SearchIcon`
- long material-card titles clamp to two visible lines and expose the full title through tooltip/title text
- Teacher Lobby card chrome remains summary-level and does not hydrate canonical Reading V2 drafts or student-safe/runtime payloads just to render cards

Forbidden patterns:

- full teacher tab rows that wrap, squeeze, or overlap user controls on narrow screens
- emoji-only input icons where a shared SVG icon exists
- card titles expanding past two lines and pushing action controls down
- nested modal/card chrome inside the shared `TestCreationModal` setup step

Current Teacher Lobby authoring and responsive navigation details live in `documentation/architecture/teacher-lobby-authoring-and-navigation.md`.
