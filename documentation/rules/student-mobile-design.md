# Student Mobile Design Rule

Use this rule for every change that touches student shell layout, responsive styles, headers, tabs, cards, drawers, right-rail composition, or any mobile-specific fix on Dashboard, Homework, Courses, Library, Academic Record, Class Detail, Course Detail, or other student shell pages.

The goal is to keep mobile as a supplementary presentation of the desktop student workspace, not a separate product with its own information architecture.

Companion docs:
- `documentation/design/student-view-design-standard.md`
- `documentation/rules/student-data-loading.md`
- `documentation/rules/mobile-portability.md`

## 0. Core Principle

Mobile student UI is a compressed form of the desktop student workspace.

That means:
- preserve the same route, page purpose, data owner, and interaction contract unless a PRD explicitly changes them
- preserve the 3-part shell language: left navigation, center work canvas, right contextual rail
- preserve the same design tokens, typography, and visual family as desktop
- solve mobile constraints by stacking, collapsing, truncating, or drawerizing, not by inventing a different workflow

If a mobile change would create a different product experience from desktop, stop and justify it explicitly.

## 1. Required Before Coding

Every student mobile task must name:
- the desktop source surface being supplemented
- whether the change touches shell structure, a page header, tab/filter rows, cards/lists, drawers, or action controls
- the exact breakpoints that matter
- which shared helpers or tokens will be reused
- the exact live verification routes

Minimum verification widths:
- `1440px` when the task changes shell composition or title alignment relative to desktop
- `375px` for baseline phone verification
- `320px` whenever headers, drawers, or dense controls are touched

## 2. Shared Shell Contract

Student shell work must keep these invariants:
- use the shared `StudentLayout` shell for shell pages
- keep left and right mobile drawers mutually exclusive
- keep the right rail structurally present on shell pages, even if its content is quiet
- preserve the same page title and IA from desktop; mobile may compress presentation, not semantics
- do not create mobile-only routes, page variants, or duplicate shell implementations unless the PRD explicitly requires them

## 3. Header And Title Contract

Student mobile headers must behave as a compressed desktop header.

Required rules:
- keep the same page title as desktop
- hide or de-emphasize subtitles before renaming, replacing, or removing title content
- visible header buttons must meet the `44px x 44px` minimum target
- title text must truncate safely instead of colliding with edge buttons
- if header controls grow on mobile, re-check title centering, padding, and truncation together

Preferred pattern:
- page title reduced to the mobile shell scale
- subtitle hidden on phones when needed
- utilities remain in the same header family or move into drawers/menus without changing workflow meaning

## 4. Layout Collapse Rules

Mobile layout changes should compress the desktop layout in a predictable way.

Required rules:
- default to a single-column reading flow on narrow widths
- stack summary strips, metric rows, and card groups vertically before inventing new containers
- convert side-by-side desktop groups into `1fr` mobile layouts
- apply the shared student mobile inset and spacing helpers before adding page-specific overrides
- only tabs and filter bars may intentionally scroll horizontally
- intentional horizontal rows must use hidden scrollbars and keep every option reachable
- avoid fixed `repeat(N, 1fr)` or fixed pixel-column grids on student mobile surfaces

Forbidden shapes:
- independent mobile-only card taxonomies
- new boxed widget stacks that do not exist in desktop IA
- horizontal page overflow caused by cards, drawers, or action rows

## 5. Control And CTA Rules

Every visible interactive control inside the student mobile shell must satisfy the shared touch-target contract.

Required rules:
- every visible button, tab, CTA, icon button, drawer control, modal action, list row action, and load-more control must render at least `44px x 44px` at `375px` and `320px`
- use shared student mobile helpers first (`mobileStyles.touchTarget`, `mobileStyles.fullWidthButton`, shared shell button styles) before inventing custom dimensions
- primary narrow-screen actions should become full-width when stacking improves tap accuracy
- if a control is intentionally smaller visually, its interactive box must still satisfy the `44px` floor

## 6. Drawer And Right-Rail Rules

Student mobile drawers and the right rail must stay readable without destabilizing the page.

Required rules:
- mobile drawer width must stay within the shared contract: `width: min(320px, 85vw)`, `minWidth: 0`, `maxWidth: 85vw`
- closed drawers must not intercept taps or pointer events
- opening either drawer must not create horizontal page overflow
- right-rail modules must stay readable and tappable at `375px` and `320px`
- do not drop the right rail just because the mobile layout is tight; compress it, drawerize it, or quiet it

## 7. Approved Student Mobile Primitives

When implementing student mobile work:
- reuse the shared student tokens and `mobileStyles` layout helpers
- derive breakpoint state through the student shell's approved responsive hook (`useMediaQuery('(max-width: 768px)')` today) instead of direct browser measurement
- use `useNavigation('student')` instead of direct router hooks when rewriting or adding student navigation flows
- stay within the existing native HTML/CSS and inline SVG approach used by current student pages
- do not add new `@mantine/*` imports or alternate mobile-only UI frameworks

This rule complements portability rules. Do not bypass `documentation/rules/mobile-portability.md` when browser APIs or storage are involved.

## 8. Minimum Verification Contract

Before review, prove all relevant items below:
- the mobile surface still reads as the same page as desktop
- there is no unintended horizontal overflow at the required widths
- every visible interactive control on the touched surface meets the `44px` floor
- drawers remain mutually exclusive and readable if the task touched shell controls or right-rail behavior
- desktop layout still behaves correctly when the task changes shared shell/header styles
- focused tests cover the responsive contract when a shared component or repeated surface changed

Recommended live check sequence on this repo:
1. open `http://localhost:5173/`
2. use the Student quick-login from the index page
3. verify the touched route at `1440px` if desktop relationship changed
4. verify the touched route at `375px`
5. verify the touched route at `320px` when headers, drawers, or dense actions changed

Useful overflow assertion when no intentional horizontal row exists:
- `document.documentElement.scrollWidth === document.documentElement.clientWidth`

## 9. Review Questions

Before you mark the work ready, answer these:
1. Did mobile preserve the same desktop information architecture and workflow?
2. Did any visible control remain below `44px` after the layout change?
3. Did any new horizontal overflow appear at `375px` or `320px`?
4. Did the shell title, drawers, and right rail stay readable after the responsive change?
5. Did the change reuse shared student mobile helpers before adding page-specific overrides?

Any `no` or uncertain answer means the task is not review-complete.
