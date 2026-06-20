# DESIGN.md

## Product Design Thesis

LuyenTap is an academic workspace for teachers and students. Teachers create, manage, review, and publish study materials. Students study, complete assigned work, review results, and track academic progress.

The product design promise is calm precision: dense enough for repeated academic work, clear enough for scanning, and restrained enough for long teaching and study sessions. The UI is text-led, source-grounded, and operational. It is not a marketing site, social feed clone, KPI dashboard, retail storefront, toy learning app, or decorative showcase.

This file is the root design system and source authority map for teacher and student surfaces. Market-facing guidance comes first. `Implementation Sources`, `Known Drift`, `Verification Contract`, and `Update Rules` keep the guidance tied to repo evidence. Product-specific rules in this file must be source-backed, marked `unresolved`, or listed as drift.

### Scope

In scope:
- Teacher view surfaces: Teacher Lobby, teacher navigation/header, material listing, material creation entry, teacher route chrome, and teacher-facing Reading V2 entry points.
- Student view surfaces: shared student shell pages, Dashboard, Homework, Courses, Library, Academic Record, result pages, and shell-owned right rail behavior.
- Reading V2 design packets only as feature-specific addenda for Reading V2 Studio, Build Workspace, runtime, review, and preview surfaces.

Out of scope:
- Admin design.
- One-off PRD exploration that does not change app-level teacher or student design authority.
- Reading V2 Stitch layouts applied to unrelated teacher lobby, student dashboard, or general shell surfaces.

## Audience And Jobs

| Audience | Primary jobs | UI implication |
| --- | --- | --- |
| Teacher | Find materials, create tests, choose skill/family, inspect summaries, launch or revise work, review outcomes. | Prioritize stable header chrome, searchable material lists, clear creation entry, compact controls, and predictable action placement. |
| Student | Resume study, see assignments, review academic history, understand next work, inspect results. | Prioritize shared shell continuity, readable center canvas, quiet right rail context, mobile drawer ergonomics, and academic record clarity. |
| Teacher authoring for Reading V2 | Build IELTS Reading tests from passages, task groups, answer keys, validation, preview, and publish flow. | Use the Reading V2 Build Workspace design packet only inside Reading V2 authoring. Hide unsupported controls instead of faking editor capability. |
| AI agent or engineer | Make UI changes without averaging conflicting docs or copying drift. | Start from this file, then follow owning architecture docs and code anchors named here. Treat `Known Drift` as non-baseline. |

## Brand Personality

| Attribute | Meaning in UI | Source anchors |
| --- | --- | --- |
| Academic | Layout supports reading, study, grading, and evidence. | `documentation/design/student-view-design-standard.md`; Reading V2 design packets |
| Composed | Quiet surfaces, tonal layers, restrained color, no default gradients/glass. | `documentation/design/student-view-design-standard.md`; `documentation/architecture/ui-design-standards.md` |
| Precise | Labels, states, columns, and routes map to actual product workflows. | teacher and student architecture docs |
| Scan-friendly | Lists, tables, tabs, and rails reveal status without heavy decoration. | `teacher-materials-list-view-contract.md`; student shell docs |
| Durable | Shared shells own shared chrome; feature packets cannot redefine the whole app. | `teacher-lobby-authoring-and-navigation.md`; student architecture docs |
| Source-led | Live code proves current state; architecture docs define intended baseline; drift stays visible. | `Implementation Sources`; `Known Drift` |

## Design Principles

### Global Design Rules

| Principle | Use this when... | Do not... |
| --- | --- | --- |
| Shell ownership wins | Changing shared teacher or student chrome. | Put shell padding around `TeacherHeader`, fork `StudentLayout`, or create a detached page when route architecture says shared shell applies. |
| Source-specific beats generic | A feature packet conflicts with app-level teacher/student design. | Promote Reading V2 Stitch choices into Teacher Lobby or Student Dashboard without an architecture update. |
| Current code is evidence, not permission | Live UI contradicts canonical docs. | Reframe Mantine, AppShell, emoji navigation, or glass/gradient residue as approved future design. |
| Scanning beats spectacle | Building lists, dashboards, homework, history, or authoring tools. | Add hero treatment, decorative cards, marketing copy, shimmer, or hover-lift as default workspace language. |
| Actions stay near work | Adding create, filter, validate, preview, publish, submit, or review controls. | Move page controls into shared headers or hide workflow state inside color alone. |
| Mobile keeps same IA | Adapting student or teacher surfaces below desktop width. | Create unrelated mobile-only navigation or allow hidden horizontal overflow. |
| Capability must exist before control | Adding editor affordances, task-type tools, import actions, or preview/publish states. | Show active controls without data model, persistence, validation, preview, publish, and runtime support. |

## Design Tokens

Tokens are source-scoped. Student shell tokens are canonical where `student-view-design-standard.md` and `studentLayoutStyles.ts` define values. Teacher tokens remain current-state and surface-owned until a teacher design token doc exists. Reading V2 tokens are feature-specific.

### Color

Student shared shell palette:

| Token | Value | Use |
| --- | --- | --- |
| `bg-page` | `#f8f9fa` | global student page canvas |
| `bg-shell` | `#f1f4f6` | nav, shell, quiet rail zones |
| `bg-surface` | `#ffffff` | primary content panels and focus surfaces |
| `bg-surface-muted` | `#eaeff1` | nested quiet surfaces |
| `bg-surface-strong` | `#e3e9ec` | subtle emphasis blocks |
| `text-primary` | `#2b3437` | titles, primary numbers, strong labels |
| `text-secondary` | `#586064` | body text, descriptions, metadata |
| `text-muted` | `#737c7f` | lighter metadata |
| `text-dim` | `#9b9d9e` | passive tertiary text |
| `accent-primary` | `#4d44e3` | active tabs, primary actions, focused highlights |
| `accent-ink` | `#3f34d6` | darker student accent text or hover emphasis |
| `accent-soft` | `#e2dfff` | restrained accent containers |
| `outline-soft` | `#abb3b7` | subtle separators and ghost borders |
| `outline-strong` | `#737c7f` | rare stronger boundary needs |

Teacher color guidance:

| Area | Current source | Rule |
| --- | --- | --- |
| Shared teacher header | `TeacherHeader.tsx`; `teacher-lobby-authoring-and-navigation.md` | Preserve current white/glass header chrome, dark slate title, active/inactive variants, profile shape, notification/profile placement, and nav order during density changes. |
| Teacher material taxonomy | `materialVisualTaxonomy.js`; `teacher-material-visual-taxonomy.md` | Use semantic `iconKind` and `accentKind` for material row/card accents. Do not infer accent from row order. |
| Teacher global palette | unresolved | Do not invent a new teacher palette in root docs. Add a teacher architecture update before globalizing teacher colors. |

Reading V2 feature color guidance:

| Token | Value | Scope |
| --- | --- | --- |
| Student active accent | `#4d44e3` | Student shell and Reading V2 student contexts where the source packet agrees. |
| Teacher authoring accent | `#0F766E` | Reading V2 Build Workspace teacher authoring only. |
| Exam blue and related test-taking tokens | source-local | Reading V2/runtime or exam-specific surfaces only. |

### Typography

| Token family | Value or rule | Scope |
| --- | --- | --- |
| Student UI family | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | Student shared shell and student shell pages. |
| Teacher shared type | existing repo typography | Teacher shared chrome and modern components until a teacher type token doc exists. |
| Reading passage type | source-local exam typography | Reading/runtime surfaces only. |
| Numeric global type scale | unresolved | Use owning component or architecture doc; do not invent root-level sizes. |
| Letter spacing | `0` by default | Use local uppercase micro-label tracking only where source docs or code define it. |

Typography rules:
- Page titles are compact and editorial, not hero-scale.
- Section labels and metadata are restrained; uppercase micro-labels are valid for tabs, metrics, and metadata when the source pattern uses them.
- Dense tools use smaller, tighter headings than page-level mastheads.
- Long text must wrap, clamp, or truncate without overlapping controls.

### Spacing

| Token or metric | Value | Scope |
| --- | --- | --- |
| Student right rail | `320px` | desktop student shell |
| Student mobile header | `56px` | phone shell |
| Student mobile feed inset | `16px 12px 24px` | phone content padding |
| Student top alignment | `S.feed` `24px` + `S.feedHeader` `8px` = `32px` | Dashboard, Homework, Academic Record, Library, Courses shell pages |
| Mobile touch target floor | `44px x 44px` | all visible mobile controls |
| Teacher header breakpoints | `<=768`, `769-1279`, `>=1280` | teacher header/navigation behavior |
| Teacher list columns | `Material`, `Items`, `Updated`, `Actions` | Teacher Lobby material list mode |

Spacing rules:
- Page padding, max-width, and content spacing live inside `main` or content wrappers, never around `TeacherHeader`.
- Shared student pages preserve left rail, center canvas, and right contextual rail on desktop.
- Mobile drawers and bottom-sheet style flows use sticky actions when content scrolls.
- Nested cards are not a layout primitive. Use tonal grouping, rows, and separators first.

### Radius

| Token family | Value or rule | Scope |
| --- | --- | --- |
| Teacher header tabs | `3px-5px` range remains valid during header density changes | teacher shared header |
| Student badges | date badge `42px x 42px`; initial badge may be circular | student right rail and feed patterns |
| Global radius scale | unresolved | Use source-owned values; do not over-round dense teacher forms, exam controls, rows, or tables. |

### Elevation

| Rule | Scope |
| --- | --- |
| Student shared pages use flat tonal layers, white surfaces, whisper borders, and minimal shadow. | student shell |
| Reading V2 uses tonal layers, thin borders, and whitespace before shadow. | Reading V2 feature surfaces |
| Current teacher glass/gradient styling is current-state or drift, not a reusable pattern for new UI. | teacher surfaces |
| Heavy shadow, blur, shimmer, floating card effects, and decorative hover-lift are not default product language. | app-wide teacher/student workspaces |

### Motion

| Token family | Value or rule | Scope |
| --- | --- | --- |
| Motion scale | unresolved | Use subtle source-local transitions only. |
| Reduced motion | required for new motion | New animation must respect reduced-motion media behavior. |
| Hover treatment | no decorative hover-lift | Student shell and new teacher/student workspace UI. |

## Layout System

Teacher layout:
- `TeacherHeader` is a top-level page/shell child attached to the top page edge.
- Teacher page content begins below header in `main` or a content wrapper.
- Teacher Lobby uses material grid and compact list view for scanning, not a Reading V2-only console.
- List mode keeps header and row grid aligned through one grid definition.

Student layout:
- `StudentLayout` owns shared student shell.
- Desktop has three regions: left navigation rail, center editorial canvas, and 320px right contextual rail.
- Tablet and phone keep the same IA by drawerizing shell regions.
- Dashboard order is masthead, frameless metric strip, recent grades chart where present, slim editorial tabs, vertical timeline feed.
- Detail and result pages are vertical reading flows inside shared shell where route architecture says they participate.

Reading V2 layout:
- Reading V2 Studio/Build Workspace owns canonical Reading V2 authoring.
- Teacher authoring UI can combine teacher-facing passage, task group, answer key, validation, preview, and publish areas while keeping internal models separate.
- Reading V2 runtime/review uses feature-specific exam/review shells and existing platform adapters; it does not redefine shared student shell.

## Component Patterns

### Buttons And Icon Buttons

Use:
- Primary actions for create, validate, preview, publish, submit, retry, and continue.
- Icon buttons for compact controls when a known icon exists.
- Text buttons only when the command needs a visible label.

States:
- Default, hover/focus, active/selected, disabled, loading, success, warning, error, destructive, and permission-denied states must remain distinguishable by text, icon, or structure, not color alone.
- Mobile buttons and icon buttons meet `44px x 44px`.
- Icon-only controls need `aria-label` or equivalent accessible name.

Anchors:
- Student primary buttons use `#4d44e3`.
- Reading V2 teacher authoring primary actions may use `#0F766E` inside Reading V2 Build Workspace.
- Teacher shared action styling follows owning teacher component docs until a teacher token doc exists.

### Navigation And Headers

Use:
- `TeacherHeader` and `TeacherNavigation` for teacher shared chrome.
- `StudentLayout`, `StudentSidebar`, and `StudentRightRail` for student shell.
- Route constants and centralized route docs for navigation changes.

States:
- Active nav state must be visible.
- Compact and mobile nav must keep profile/notification or equivalent user controls reachable.
- Drawers must trap or constrain interaction enough for keyboard and screen reader use.

Do not:
- Use emoji as primary navigation icon treatment.
- Move page tabs, search controls, filters, or material actions into `TeacherHeader`.
- Create a second student shell or teacher shell for surfaces already owned by route architecture.

### Search, Filters, Tabs, And Segmented Controls

Use:
- `SearchFilterBar` for Teacher Lobby non-draft tabs, including the visible search field and create button row.
- Slim student tabs for Dashboard and shell page segmentation.
- Horizontal scrolling filter rows only when intentional and scrollbar-hidden on mobile.

States:
- Selected, focus, disabled, empty-result, and loading states must be explicit.
- Search fields need labels or stable placeholders for verification.
- Filter action groups must not resize core list columns.

Anchors:
- Teacher search placeholder: `Search by title or keyword...`.
- Teacher search icon uses shared SVG `SearchIcon`, not emoji.

### Cards, Panels, Rows, Tables, And Lists

Use:
- Cards for individual repeated summary items.
- Rows/tables/lists for scanning and comparison.
- Panels for framed tools, right rails, modals, and repeated list items.

States:
- Long titles clamp safely.
- Missing row actions leave stable empty slots.
- Empty, loading, error, and permission states render inside owning shell.

Do not:
- Put cards inside cards.
- Let row actions, icon columns, or metadata resize the whole list.
- Hydrate Reading V2 canonical drafts, student-safe payloads, session payloads, or result payloads just to render Teacher Lobby listing chrome.

### Forms And Input Validation

Use:
- Native HTML/CSS or approved repo primitives.
- Explicit labels for text fields, selects, textareas, and answer-key fields.
- Teacher-readable validation messages in Reading V2 authoring.

States:
- Validation errors include the field or section, problem, and next action.
- Disabled controls explain unavailable capability through adjacent text, tooltip, or hidden state only where workflow requires it.
- Required/optional status must be visible without depending on color alone.

Do not:
- Expose internal schema labels such as raw task group, revision token, or projection names to normal teachers unless a diagnostic surface explicitly owns them.
- Show active task-type controls that are unsupported end to end.

### Modals, Drawers, Overlays, And Confirmation Flows

Use:
- `TestCreationModal` for teacher material family/skill selection.
- Student mobile left and right drawers for shell navigation and right rail context.
- Reading V2 preview overlay only for teacher preview of Reading V2 drafts.

States:
- Loading, error, conflict, permission-denied, publish-success, and destructive confirmation flows need role/label structure that tests can select.
- Mobile overlays use full-viewport or bottom-sheet patterns for long or confirm flows.
- Left and right student drawers are mutually exclusive.

Do not:
- Create a second THCS-only creation modal.
- Route teachers to a separate creation page before shared family/skill selection.
- Nest modal/card chrome inside `TestCreationModal` setup step.

### Loading, Empty, Error, Success, Warning, Disabled, And Permission States

Use:
- Loading states inside the owning shell or panel.
- Empty states that tell the user what dataset is empty and what action comes next.
- Error states that include recoverable action when recovery exists.
- Success states near the action that completed.
- Warning and destructive states with text plus structure, not color alone.

Anchors:
- Teacher full-page result access-lost/loading/error states render inside teacher shell.
- Student shared shell data has one owner; widgets consume shell data rather than starting duplicate loaders.
- Reading V2 operational state names are feature-owned by Reading V2 Studio/runtime components.

### Notifications And Observability-Required Actions

Use:
- Toasts/notifications for short-lived action result feedback.
- Inline states for blocking errors or validation.
- Observability rules for user-facing buttons, forms, workflows, route changes, renames, and feature actions.

Do not:
- Use notification copy as the only record of a validation failure.
- Add user-facing actions without checking `documentation/rules/observability.md`.

## Responsive And Mobile Rules

Teacher:
- `width <= 768`: use mobile drawer through `MobileMenu`.
- `769 <= width < 1280`: keep teacher header visible, collapse tabs into compact hamburger dropdown in `TeacherNavigation`, and keep notification/profile controls visible.
- `width >= 1280`: render full inline teacher navigation tabs.
- Header tabs must not wrap, squeeze, or overlap user controls.

Student:
- `<=768px`: phone treatment.
- `769px-1024px`: collapsed shell/tablet treatment.
- `>=1025px`: desktop reference.
- Mobile header height is `56px`.
- Desktop right rail is `320px`.
- Right rail drawer width is `min(320px, 85vw)` with `minWidth: 0` and `maxWidth: 85vw`.
- Mobile feed padding is `16px 12px 24px`.
- All visible mobile controls meet `44px x 44px`.
- Tabs and filters may scroll horizontally only as intentional hidden-scrollbar rows.
- Unintended horizontal overflow is a failure.

Verification routes:
- Teacher: `/lobby` at `1440`, `1208`, `768`, and `375`.
- Student: `/student/dashboard` at `1440`, `1024`, `768`, `375`, and `320`; `/student/homework`, `/student/courses`, `/student/library`, `/student/academic-record` at `375`.

## Accessibility And Interaction Standards

Contrast:
- Use source token pairs with sufficient text/background contrast.
- Do not rely on color alone for status, selected state, warnings, or destructive actions.

Focus and keyboard:
- Every interactive control must expose a visible focus state.
- Header nav, compact nav, profile menu, drawers, modals, filters, tabs, forms, and Reading V2 editor controls must be keyboard reachable.
- Dialogs, drawers, and overlays need roles and labels suitable for automated and assistive checks.

Labels and semantics:
- Icon-only buttons need accessible names.
- Inputs, selects, textareas, search fields, and validation regions need labels or stable selectors.
- Lists, tables, feeds, and rails use semantic structure or clear accessible names where possible.

Touch target:
- Visible mobile controls meet `44px x 44px`.
- Dense tables and rows keep action targets stable and non-overlapping.

Reduced motion:
- New motion respects reduced-motion behavior.
- Motion is subtle and tied to state change or focus.

Overflow:
- Text must fit, wrap, clamp, or truncate inside its container.
- Mobile pages must pass `document.documentElement.scrollWidth === document.documentElement.clientWidth` unless a route intentionally owns horizontal scrolling.

## Content And Tone

Voice:
- Clear, academic, direct, task-oriented.
- Teacher language is operational: create, import, validate, preview, publish, review, grade, archive.
- Student language is academic and progress-focused: continue, review, complete, practice, result, record, assignment.

Button labels:
- Use verb-led labels tied to the action.
- Keep labels short enough for mobile.
- Avoid generic labels when the action has real product meaning.

Form labels and helper text:
- Name the data being requested.
- Put constraints near the field.
- Use helper text for workflow-critical information only.

Empty states:
- State what is missing.
- Name the next available action when one exists.
- Avoid decorative or motivational filler.

Error messages:
- State the problem in user language.
- Include recovery action when possible.
- Avoid internal implementation names unless the surface is explicitly diagnostic.

Micro-labels:
- Use small labels for status, metadata, dates, counts, tabs, and academic categories.
- Uppercase micro-labels are valid only where source patterns use them.

In-app explanations:
- Do not describe visual styling, design rationale, keyboard shortcuts, or implementation behavior in the UI unless the product workflow requires it.

## Surface Guidance

### Teacher View

| Surface | Owner and route | Core layout | Allowed visual language | Forbidden drift | Verification |
| --- | --- | --- | --- | --- | --- |
| Teacher shell/header | `TeacherHeader.tsx`; `TeacherNavigation.tsx`; teacher routes | Header attached to top edge; page content below in `main` or wrapper | Current white/glass header chrome as current-state teacher header language; compact nav by breakpoint | Per-page padding around header, overlapping tabs, emoji primary nav icons | `/lobby`; `button[aria-label="Open teacher navigation menu"]`; profile button |
| Teacher Lobby materials | `TeacherLobbyPage.jsx`; `/lobby` | Header title `Materials`, page title `Test Dashboard`, grid/list summaries | Summary cards, fixed-grid list, semantic material icons/accents | Hydrating Reading V2 canonical/student-safe/session/result payloads for listing chrome | `input[placeholder="Search by title or keyword..."]`; material list headers |
| Search/filter/create row | `SearchFilterBar.jsx`; `SearchFilterBar.css` | Search field, filters, view controls, `Create New Test` action | Shared SVG search icon, one coherent control band | Emoji search icon, moving create/filter controls into `TeacherHeader` | Search placeholder and create button |
| Teacher creation flow | `TestCreationModal.tsx` | Shared family/skill setup; THCS and Reading V2 branch inside modal | SVG quick-start icon art; modal entry from lobby | Separate creation page before family/skill selection; second THCS-only modal | `Create New Test` opens modal |
| Teacher result/history/detail | teacher result architecture | Teacher shell with `TeacherHeader`, title/introduction block, content container | Native shell equivalent; access-lost/loading/error inside teacher page | Detached full-screen result pages, Mantine `AppShell` as future baseline | targeted teacher tests and browser routes |

### Student View

| Surface | Owner and route | Core layout | Allowed visual language | Forbidden drift | Verification |
| --- | --- | --- | --- | --- | --- |
| Student shared shell | `StudentLayout.tsx`; `StudentShellRoute.tsx` | Left nav, center canvas, right contextual rail; drawers on mobile | Student v2 tokens, Inter, flat tonal surfaces | AppShell, gradients, glass, emoji nav, duplicate shell data loaders | `.student-view-root`; `[data-testid="student-layout-right-rail"]` |
| Dashboard | `StudentDashboardPage.jsx`; `StudentDashboardFeedView.jsx`; `/student/dashboard` | Sticky masthead, frameless metrics, recent grades chart where present, tabs, vertical feed | Editorial feed companion to Academic Record | Social feed clone, KPI-heavy dashboard, retail/toy styling | dashboard route at desktop/mobile |
| Right rail | `StudentRightRail.tsx`; `PendingReviewsWidget.tsx` | `Live Now`, `Up Next`, `My Classes`, supplemental `Pending Reviews` | Quiet context rail, date/initial badges | Emoji squares, gradient thumbnails as baseline | right rail selector and drawer checks |
| Homework | `StudentHomeworkListPage.tsx`; `/student/homework` | List-first workboard | Academic assignment scanning | Card-heavy storefront layout | mobile route at 375 |
| Courses | `StudentCoursesPage.tsx`; `/student/courses` | Restrained academic resource page | Study context and class/course status | Marketplace/storefront pattern | mobile route at 375 |
| Library | `StudentLibraryPage.tsx`; `/student/library` | Restrained resource catalog | Academic browsing and review | Retail merchandising pattern | mobile route at 375 |
| Academic Record | `AcademicRecordPage.tsx`; `/student/academic-record` | Primary visual anchor; center-column history dataset | Progress history and study evidence | Right rail as primary IA | mobile route at 375 |
| Detail/result pages | route-owned student pages | Detail-first vertical reading flows | Shared shell where architecture says shell applies | Legacy delivery chrome defining shared shell baseline | targeted student tests |

### Reading V2 And Feature-Specific Design Packets

| Surface | Owner | Boundary |
| --- | --- | --- |
| Reading V2 Studio/Build Workspace | `ReadingV2StudioShell.tsx`; `ReadingV2BuildWorkspace.tsx`; Stitch/handoff docs | Visual source applies only to Reading V2 teacher authoring. |
| Reading V2 teacher entry | Teacher Lobby and `TestCreationModal` | Entry starts from existing teacher creation flow; Teacher Lobby remains material management, not a Reading-only console. |
| Reading V2 preview/runtime | `ReadingV2PreviewOverlay.tsx`; `ReadingV2RuntimeShell.tsx` | Feature-specific delivery/preview surface; integrates through platform adapters. |
| Reading V2 results/review | shared result adapters and Reading V2 review content | Uses existing result/review boundaries; no detached product unless architecture adds one. |

Rules:
- Stitch files are visual source of truth only for Reading V2 Build Workspace where the handoff says so.
- Unsupported Stitch elements must be disabled, hidden, or documented; do not show fake active capability.
- Reading V2 task-type labels and validation copy must be teacher-readable.
- Reading V2 passage-collection controls are capability-gated: `Add Passage` belongs only to manual blank test creation, paste/import Studio outcomes, and Auto V4 Studio outcomes. Individual Reading Passage Studio is a one-passage editor and must hide passage add/remove collection controls.

### Out-Of-Scope Admin

Admin design is excluded from this file. Add a separate source if admin design becomes active work.

## Do And Do Not

| Do | Do not |
| --- | --- |
| Start from this file, then read the owning architecture doc before UI work. | Average old PRDs, task docs, Stitch files, and live code into a generic compromise. |
| Keep teacher and student shells as shared owners. | Fork shell chrome for one page without architecture backing. |
| Use student v2 tokens on student shell pages. | Use `#667eea`, `#764ba2`, gradient backgrounds, glassmorphism, AppShell, or emoji navigation on student shell pages. |
| Preserve current teacher header visual language during density changes. | Treat teacher glass/gradient residue as a reusable app-wide design system. |
| Use `SearchFilterBar`, `MaterialListView`, `MaterialListRow`, and taxonomy anchors for Teacher Lobby. | Hydrate heavy Reading V2 payloads for listing UI or infer material icons from row order. |
| Keep Reading V2 design tokens inside Reading V2 surfaces. | Apply Reading V2 Build Workspace layout to Student Dashboard or Teacher Lobby. |
| Use clear labels, accessible names, stable selectors, and testable states. | Hide workflow meaning inside color, decoration, or transient toasts. |
| Record contradictions in `Known Drift`. | Delete drift from docs before code verification proves it gone. |

## Implementation Sources

### Source Hierarchy

Use this order when design sources conflict:

1. This root `DESIGN.md` is app-level design system index and conflict ledger.
2. `documentation/design/student-view-design-standard.md` is canonical for student visual language.
3. Student architecture docs are canonical for student ownership, layout behavior, routing, data ownership, and mobile contracts.
4. `documentation/architecture/ui-design-standards.md` is canonical for global teacher/student UI safety rules.
5. `documentation/architecture/teacher-lobby-authoring-and-navigation.md` is canonical for teacher header, lobby, and creation entry.
6. Teacher architecture docs are canonical for teacher material listing, list view, visual taxonomy, route resilience, and creation parsing/review.
7. `documentation/architecture/ielts-reading-v2-listening-unification.md` is canonical for cross-skill assessment presentation boundaries between Reading V2 and Listening.
8. Reading V2 Stitch/design files are visual sources only for Reading V2 Studio/build-workspace surfaces; they do not define Listening runtime authority or generic assessment UI by themselves.
9. PRDs and task docs are secondary evidence and must not override architecture docs.
10. Live code is current-state evidence. If code contradicts canonical docs, record it in `Known Drift` instead of promoting it to design truth.

Conflict policy:
- Current architecture docs beat old PRDs and task docs.
- Live code proves what exists now, not what future work is allowed to copy.
- Unsupported design claims must be removed, marked `unresolved`, or kept in the owning feature doc.
- Conversation logs are rationale trails only when canonical docs link to them; they are not design authority.

Canonical source packet:

| Area | Sources |
| --- | --- |
| Root and rules | `AGENTS.md`; `documentation/architecture/ui-design-standards.md`; `documentation/rules/codebase-hygiene.md`; `documentation/rules/student-mobile-design.md`; `documentation/rules/student-data-loading.md`; `documentation/rules/mobile-portability.md`; `documentation/rules/observability.md` |
| Teacher docs | `documentation/architecture/teacher-lobby-authoring-and-navigation.md`; `documentation/architecture/teacher-materials-listing-and-diagnostics.md`; `documentation/architecture/teacher-materials-list-view-contract.md`; `documentation/architecture/teacher-material-visual-taxonomy.md`; `documentation/architecture/teacher-route-runtime-resilience.md`; `documentation/architecture/teacher-test-creation-parsing-and-review.md`; `documentation/tasks/PRD0048/reading-v2-teacher-lobby-integration.md` |
| Student docs | `documentation/design/student-view-design-standard.md`; `documentation/architecture/student-experience-architecture.md`; `documentation/architecture/student-dashboard-architecture.md`; `documentation/architecture/student-mobile-responsiveness-architecture.md`; `documentation/architecture/student-shell-right-rail-architecture.md`; `documentation/architecture/student-shell-data-loading.md`; `documentation/architecture/browser-document-title-architecture.md`; `documentation/architecture/academic-record/page-architecture.md`; `documentation/architecture/academic-record/README.md` |
| Shared assessment docs | `documentation/architecture/ielts-reading-v2-listening-unification.md`; `documentation/architecture/reading-v2-runtime-integrations.md`; `documentation/architecture/mobile-ielts-listening-audio-navigation.md`; `documentation/architecture/mobile-ielts-listening-runtime-diagnostics.md` |
| Reading V2 docs | `documentation/tasks/0048-prd-reading-v2-studio-and-runtime.md`; `documentation/tasks/PRD0048/reading-v2-page-schema-studio.md`; `documentation/tasks/PRD0048/reading-v2-studio-ui-assessment.md`; `documentation/tasks/PRD0048/design/reading-v2-build-workspace-handoff.md`; `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/design.md`; `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/academic_precision/DESIGN.md`; `documentation/tasks/PRD0048/design/stitch/reading-v2-build-workspace/each_question_task_type_design/academic_precision/DESIGN.md` |
| Teacher code anchors | `src/components/navigation/TeacherHeader.tsx`; `src/components/navigation/TeacherNavigation.tsx`; `src/components/navigation/MobileMenu.tsx`; `src/pages/TeacherLobbyPage.jsx`; `src/components/modern/SearchFilterBar.jsx`; `src/components/modern/SearchFilterBar.css`; `src/components/modern/MaterialListView.jsx`; `src/components/modern/MaterialListRow.jsx`; `src/components/modern/materialListAdapter.js`; `src/components/modern/materialVisualTaxonomy.js`; `src/components/test-creation/TestCreationModal.tsx`; `src/routes/teacherRoutes.tsx` |
| Student code anchors | `src/components/layout/StudentLayout.tsx`; `src/components/layout/studentLayoutStyles.ts`; `src/components/layout/StudentSidebar.tsx`; `src/components/layout/StudentRightRail.tsx`; `src/context/StudentShellDataContext.tsx`; `src/hooks/useStudentShellData.ts`; `src/pages/StudentDashboardPage.jsx`; `src/components/dashboard/StudentDashboardFeedView.jsx`; `src/components/dashboard/PendingReviewsWidget.tsx`; `src/pages/AcademicRecordPage.tsx`; `src/pages/StudentHomeworkListPage.tsx`; `src/pages/StudentCoursesPage.tsx`; `src/pages/StudentLibraryPage.tsx`; `src/pages/StudentTestResultsPage.tsx`; `src/routes/StudentShellRoute.tsx`; `src/routes/studentRoutes.tsx`; `src/styles/student-view-override.css`; `src/constants/routes.ts` |
| Shared assessment code anchors | `src/features/assessment/shared/components/AssessmentAuthoringSection.tsx`; `src/features/assessment/shared/components/AssessmentStatusState.tsx`; `src/features/assessment/shared/components/AssessmentValidationSummary.tsx`; `src/pages/ReadingV2StudioPage.tsx`; `src/components/reading-v2/studio/ReadingV2SettingsPanel.tsx`; `src/skills/listening/builders/ListeningTestBuilder.tsx` |

## Known Drift

Teacher drift:

| File | Design says | Code does now | Status |
| --- | --- | --- | --- |
| `src/components/test-creation/TestCreationModal.tsx` | Touched teacher UI must not keep Mantine as approved design option. | Imports `Modal` and `Text` from `@mantine/core`. | known drift, not approved baseline |
| `src/pages/TestReviewPage.tsx` | Teacher flows stay inside teacher shell chrome and no-Mantine direction. | Standalone Mantine-heavy review route with no `TeacherHeader` import/reference. | known drift, not approved baseline |
| `src/pages/TeacherClassesPage.tsx` | `TeacherHeader` is top page/shell child; legacy Mantine `AppShell` is transitional only. | Wraps `TeacherHeader` and main content in Mantine `AppShell`. | known drift, not approved baseline |
| `src/pages/TeacherCoursesPage.tsx` | `TeacherHeader` is top page/shell child; legacy Mantine `AppShell` is transitional only. | Wraps `TeacherHeader` and main content in Mantine `AppShell`. | known drift, not approved baseline |
| `src/pages/TeacherGradingPage.tsx` | `TeacherHeader` is top page/shell child; legacy Mantine `AppShell` is transitional only. | Wraps `TeacherHeader` and main content in Mantine `AppShell`; also uses gradient/glass-era styling. | known drift, not approved baseline |
| `src/skills/listening/builders/ListeningTestBuilder.tsx` | Shared assessment presentation may be neutral, but teacher authoring surfaces must follow the no-Mantine direction and must preserve Listening-specific ownership. | Uses neutral authoring-section and empty-state primitives but still wraps the flow in legacy Mantine `AppShell` with gradient/emoji-era presentation; Listening-side validation-summary adoption remains intentionally deferred. | known drift, not approved baseline |
| `src/components/navigation/TeacherHeader.tsx` | Teacher setup and navigation iconography uses SVG icon art, not emoji labels as primary icon treatment. | Mobile drawer item data still uses emoji icon strings. | known drift, not approved baseline |
| `src/pages/TeacherLobbyPage.jsx`; `src/components/modern/SearchFilterBar.css` | Mobile workspace pages must avoid unintended horizontal overflow unless a row explicitly owns horizontal scrolling. | Browser check at `/lobby` 375px found `documentElement.scrollWidth=369` and `clientWidth=365`; `.content-tabs` and `button.modern-btn.btn-glass.btn-sm` (`Drafts`) extend to `right=369`. Screenshot: `output/playwright/teacher-lobby-375.png`. | known drift, not approved baseline |

Student drift:

| File | Design says | Code does now | Status |
| --- | --- | --- | --- |
| `src/components/layout/StudentRightRail.tsx` | Student right-rail item conventions use date/initial badges and no emoji squares. | Uses gradient thumbnail squares and emoji-like glyph treatments for some rail rows. | known drift, not approved baseline |
| `src/components/navigation/StudentHeader.tsx` | `StudentLayout` is current shared shell authority. | Legacy `StudentHeader` remains in repo and includes older glass/emoji-era patterns. | known drift, not approved baseline |
| `src/pages/StudentCourseDetailPage.tsx` | Student shell pages must not add or preserve Mantine as future design language. | Imports `Badge`, `Loader`, and `Progress` from `@mantine/core` while using `StudentLayout`. | known drift, not approved baseline |
| `src/pages/StudentTestResultsPage.tsx` | Shared shell result pages use current student token/shell language without legacy compatibility defining baseline. | Uses `StudentLayout` and `studentTokens`, but retains legacy result/session lookup behavior and compatibility styling pockets. | known drift, not approved baseline |
| `src/pages/StudentWaitingRoomPage.jsx` | Shared student shell pages ban Mantine AppShell, glassmorphism, and gradient backgrounds; standalone delivery surfaces cannot define shared shell baseline. | File documents legacy styling, imports Mantine `AppShell`, and uses glass/gradient delivery styling. | known drift, not approved baseline |
| Standalone delivery routes such as `/student-wait/:gameSessionId`, `/student-quiz/:gameSessionId`, `/student-test/:sessionCode`, and related result/review routes | Shared student shell pages define student baseline; intentional delivery chrome follows its own architecture. | Some standalone delivery surfaces remain visually divergent from shared student shell. | known drift, not approved baseline |

Scan-derived guardrail:
- Repo-wide token and component scans contain many one-off colors, gradients, shadows, Mantine imports, AppShell usage, and emoji/glyph treatments. Those findings are evidence of local code state only. They are not promoted to root design tokens unless named in canonical sources above.

## Verification Contract

Document checks:

```powershell
cmd /c npm run check:utf8 -- DESIGN.md
git diff --check -- DESIGN.md
rg -n "[T]BD|[T]ODO|[m]aybe|[p]robably|[s]hould be|[n]ice to have" DESIGN.md
```

Market-standard structure checks:

```powershell
rg -n "^## (Product Design Thesis|Audience And Jobs|Brand Personality|Design Principles|Design Tokens|Layout System|Component Patterns|Responsive And Mobile Rules|Accessibility And Interaction Standards|Content And Tone|Surface Guidance|Do And Do Not|Implementation Sources|Known Drift|Verification Contract|Update Rules)$" DESIGN.md
rg -n "Color|Typography|Spacing|Radius|Elevation|Motion|Buttons|Navigation|Forms|Modals|Drawers|Loading|Empty|Error|Focus|Keyboard|Contrast|Reduced motion|Touch target" DESIGN.md
```

Source-grounding checks:

```powershell
rg -n "student-view-design-standard|teacher-lobby-authoring-and-navigation|ui-design-standards|student-experience-architecture|student-dashboard-architecture|student-mobile-responsiveness-architecture|student-shell-right-rail-architecture|teacher-materials-list-view-contract|teacher-material-visual-taxonomy|reading-v2-build-workspace-handoff" DESIGN.md
rg -n "Known Drift|Source Hierarchy|Teacher View|Student View|Reading V2 And Feature-Specific Design Packets|not approved baseline|unresolved|source-backed|Implementation Sources|Update Rules" DESIGN.md
```

Market-standard AI rubric:

| Area | Pass evidence |
| --- | --- |
| Product/design thesis | First 40 lines name product, audiences, design promise, scope, and source authority. |
| Brand personality | Brand attributes map directly to UI implications and source anchors. |
| Audience and jobs | Teacher, student, Reading V2 authoring, and AI/engineer jobs are concrete. |
| Tokens | Color, typography, spacing, radius, elevation, and motion sections exist; source-backed values are scoped; unresolved globals are explicit. |
| Components | Buttons, icon buttons, navigation, headers, search, filters, tabs, cards, panels, rows, tables, lists, forms, modals, drawers, states, and notifications have usage/state guidance. |
| Responsive | Desktop, tablet, phone, touch targets, overflow, and drawers are covered with objective breakpoints. |
| Accessibility | Contrast, focus, keyboard, labels, semantic structure, touch target, reduced motion, and overflow are covered. |
| Content | Labels, microcopy, errors, helper text, empty states, and in-app explanation limits are covered. |
| Surface separation | Teacher, student, Reading V2, and out-of-scope admin boundaries are explicit. |
| Do and Do Not | Examples are actionable and trace to source anchors or drift. |
| Sources and drift | Source hierarchy, implementation anchors, drift entries, and verification commands remain traceable. |

Targeted teacher test command:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/navigation/TeacherHeader.test.tsx src/components/navigation/TeacherNavigation.test.tsx src/components/modern/SearchFilterBar.test.jsx src/components/modern/MaterialListRow.test.jsx src/components/modern/MaterialListView.test.jsx src/components/test-creation/TestCreationModal.test.tsx --reporter=basic"
```

Targeted student test command:

```powershell
cmd /c "cd /d C:\Users\The Lord\Desktop\luyentap-writing-import-rebased && npx vitest run src/components/layout/StudentLayout.test.tsx src/components/layout/StudentSidebar.test.tsx src/pages/StudentDashboardPage.navigation.test.jsx src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentCoursesPage.test.tsx src/pages/AcademicRecordPage.test.tsx src/pages/StudentTestResultsPage.test.tsx --reporter=basic"
```

Browser verification matrix:

Teacher checks:
- `/lobby` at 1440px: full teacher tabs visible.
- `/lobby` at 1208px: compact teacher nav dropdown visible and no tab overflow.
- `/lobby` at 768px and 375px: mobile drawer path visible.
- Search input exists: `input[placeholder="Search by title or keyword..."]`.
- Profile button exists: `button[aria-label="Open profile menu"]`.
- Compact nav button exists when expected: `button[aria-label="Open teacher navigation menu"]`.

Student checks:
- `/student/dashboard` at 1440px: shared shell with left nav, center canvas, right rail.
- `/student/dashboard` at 375px and 320px: mobile header visible, drawers open/close, no unintended horizontal overflow.
- Student shell selector exists: `.student-view-root`.
- Right rail selector exists: `[data-testid="student-layout-right-rail"]`.
- Overflow assertion passes:

```javascript
document.documentElement.scrollWidth === document.documentElement.clientWidth
```

Vision review prompt:

```text
Review screenshots against DESIGN.md only. Return route, viewport, pass/fail, evidence, mismatch, and required DESIGN.md update or Known Drift entry. Do not propose code fixes. Do not judge taste beyond the written standard.
```

## Update Rules

Update this file when:
- Teacher or student shell contract changes.
- Canonical design docs change.
- Global visual tokens change.
- Known drift is fixed or new drift is found.
- Feature-specific design packets become app-level design authority.
- Cross-skill shared assessment presentation or ownership boundaries change.

Do not update this file for:
- Admin-only design changes.
- Isolated feature mockups that do not change app-level design rules.
- One-off PRD exploration.

Maintenance protocol:
- Keep this file compact. Link to canonical docs instead of duplicating full sections.
- Add implementation drift to `Known Drift` with file path, design claim, current code fact, and status.
- Remove drift entries only after source-grounded code verification proves mismatch is gone.
- Do not use PRD/task docs to override architecture docs.
- Do not let feature-specific visual packets become app-level rules without explicit architecture update.
