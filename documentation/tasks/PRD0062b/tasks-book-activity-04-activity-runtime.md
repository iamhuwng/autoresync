> **DORMANT_AFTER_CODE_RESET:** read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md). All status and checkbox state below is dated evidence until fresh reactivation approval and proof.
>
> **CANONICAL FULL-WORDING CHECKLIST - ONE CHECKBOX OWNER**
>
> The current canonical PRD and `canonical-task-overrides.json` win for the approved 2026-07-14 Source Delivery corrections. The recovered `9e6e7b2d` hierarchy remains the baseline where no override exists; Amendment 043 controls remaining conflicts. Master, recovered, and implementation-audit docs are evidence/reference only; they do not own execution checkboxes.
>
> Any inherited `documentation/tasks/PRD0062/**` pointer below is evidence-only; use PRD0062b-local authority and task files for execution.
>
# Task List: PRD0062 Component 04 - Activity Runtime

Status: IMPLEMENTING. Existing bounded local runtime work is retained; new execution waits for the corrected P2 producer contract and accepted P2 exit.

Source PRD:
- `documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062b/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/pages/StudentPracticePage.tsx` - Existing asynchronous student launcher that should dispatch to Book through one thin branch.
- `src/routes/studentRoutes.tsx` - Student route registration.
- `src/features/book-runtime/*` - New Book Runtime feature module, if feature folders are used.
- `src/components/book-runtime/BookRuntimeShell.tsx` - New runtime shell for desktop/mobile layout.
- `src/components/book-runtime/BookPdfDocumentViewer.tsx` - Authorized full-document PDF viewer wrapper with controlled page state.
- `src/components/book-runtime/BookActivityPanel.tsx` - New right-panel Activity stack.
- `src/components/book-runtime/BookActivityNavigator.tsx` - New sticky Activity/question navigator generalized from existing navigator prior art.
- `src/components/book-runtime/ActivityRenderer.tsx` - New shared Activity renderer for supported V1 interaction families.
- `src/hooks/book-runtime/useBookRuntimeState.ts` - New runtime state hook for page, panel, activity, and save state.
- `src/hooks/book-runtime/useBookActivityAutosave.ts` - New Activity-level autosave hook.
- `src/services/book-delivery/bookDelivery.service.ts` - Book-owned delivery module consumed by runtime.
- `src/components/test/QuestionNavigator.tsx` - Existing sticky pill navigator prior art; inspect but do not tightly couple to IELTS-only assumptions.
- `src/hooks/solo/useSoloResume.ts` - Existing context-scoped resume prior art.
- `src/hooks/solo/useSoloSubmission.ts` - Existing submission prior art.
- `src/components/reading-v2/runtime/` - Existing runtime prior art; inspect as design evidence only.

### Notes

- Runtime must consume student-safe Book Delivery projections, not authoring records.
- Book Runtime must not accumulate Homework, Course, Class, and Solo rules. Those belong behind Book Delivery.
- V1 uses one authorized full-document PDF resource. The runtime controls the selected page and may present page-at-a-time navigation without creating separate page files.
- Source-assisted mode does not load custom per-Activity React renderers.
- Autosave is per Activity and does not count as submission.
- Mobile uses Book Page / Activity tabs, not a squeezed split view.
- This packet must produce the real Solo/preview delivery path needed by the Integration Pilot Gate; projection fixtures alone are insufficient for runtime behavior.
- Full V1 retains an optional student-controlled personal SVG timer. It may follow the foundation pilot, but it must close before Full V1 and remains academically/integrity inert.
- This packet stops before Book/subtree Homework, selective updates, Review Checkpoints, Course/Class delivery, public playable source-assisted Books, and integrity rollout.

## Authority precedence

The current canonical PRD and `canonical-task-overrides.json` control overridden rows; Amendment 043 and packet contracts control remaining conflicts. Master, recovered, and implementation-audit docs remain non-execution evidence.

## Amendment 043 Packet Contract

Packet contract is binding before source changes. Amendment 043 wins any conflict; this section records the minimum contract in this checklist. Detailed local evidence: implementation-audit.md, reconciliation-ledger.md, and the Approved Amendment file.

### storage

Book Delivery owns the immutable student-safe projection, pinned student-safe Source Version, Page Groups, ordered Activities, Activity Version pins, draft/attempt context, document-delivery authorization, and runtime snapshot. Autosave drafts are mutable and revision-bound; submissions/attempts are immutable. Reads are scoped to one delivery snapshot; no broad or per-card history reads.

### security/rules

Runtime reads only Book Delivery projections and the authorized student-safe document stream; it never reads Assembly authoring, candidates, answer keys, teacher-only PDFs, private source keys, or R2 authority. Validate student, delivery, placement, Source/Activity Version, assignment binding, attempt/draft, and revision context on every save/submit. Reject stale or cross-owner writes and fail closed when projection sections or source context are missing.

### UI/accessibility/announcements

Student runtime uses the full-document viewer plus Activity panel, mobile Book Page/Activity tabs, accessible controls, keyboard paths, visible save/conflict state, and no squeezed split view. Source-assisted prompts expose response shape and page/exercise labels independent of the PDF image. Save, retry, submit, and failure outcomes use shared announcements with status/alert roles; no silent loss or one-off banners.

### migration/compatibility

Existing Student Practice launcher routes and Reading, Listening, Writing, THCS, and Reading V2 runtimes remain unchanged. Book dispatch is one thin branch and reload-safe; location state is convenience only. Book Runtime does not add Homework, Course/Class, public, or integrity authority and does not reinterpret legacy drafts/attempts.

### tests

Focused tests cover projection validation, scoped/bounded reads, renderer families and fail-closed unsupported modes, deterministic page boundaries, Page Group navigation, collapse/mobile state, autosave debounce/coalescing/flush/retry/stale rejection, immutable attempts, review gating, launcher regressions, and authorization negatives. Pilot metrics, browser, remote, and deployed claims need separate proof.

### browser/runtime proof

Student browser proof uses quick-login on http://localhost:5174/ and records projection load, page navigation, source-assisted context, save/reload, Activity submission/result, desktop collapse, and mobile tabs. Teacher port 5173 is used only for teacher-side setup. Local browser proof cannot prove deployed Worker, Firebase, R2, or remote delivery.

### authority reconciliation

The recovered `9e6e7b2d` hierarchy is retained, with exact approved row replacements recorded in `canonical-task-overrides.json`. The current canonical PRD and override file supersede conflicting Source Delivery, presentation-mode, source-label, prompt-capability, task-type-coverage, and timer wording; Amendment 043 and packet contracts control remaining conflicts. Root files own execution checkboxes; recovered files, master orchestration, and implementation audit are evidence only. The optional student-controlled personal SVG timer is retained Full V1 scope and remains academically/integrity inert.

### evidence classification

Use VERIFIED_LOCAL_FAITHFUL only for checked IDs listed by the live audit, including explicitly amended IDs. Keep PARTIAL, IMPLEMENTED_UNVERIFIED, NOT_STARTED, OFF_SPEC, FALSE_CHECKED, IUV, pilot, browser, and deployed claims open. Record command, cwd, runner/config, exit code, test count, omitted scope, and residual risk before changing a checkbox.

### rollback/blockers

Autosave conflict, stale binding, failed submission, unavailable source, or denied projection preserves recoverable local answers and prior attempts; no late save overwrites newer work. Block launch/save/submit on missing projection, unauthorized context, stale revisions, unavailable/unsafe student source, or unsafe metadata. Timer never affects grade, deadline, submit, integrity, or teacher visibility. Remote/deployed blockers remain open until separately evidenced.

## Risk-Scaled Change And Closure Rule

Follow the master risk-scaled contract. Record outcome/non-scope, exact owner/interface, compatibility boundary, focused tests, and changed failure proof here; create a separate Packet 4 contract only for conditional detail that cannot stay concise.

Keep Book Delivery/authorization proof separate from UI rendering, autosave/submission proof, launcher regressions, browser behavior, Integration Pilot evidence, and shippable source proof. Before `VERIFIED`, reconcile only touched current-state docs and run focused proof plus governance/diff checks. Create a handoff only under the master conditional-handoff rule.

## Tasks

- [ ] 1.0 Build minimum Solo/preview Book Delivery and runtime projection consumer
  - [ ] 1.1 Implement the Book-owned Solo/preview delivery resolver needed by the Integration Pilot Gate. For authenticated student Solo launch, select the trusted `current_published_units` publication pointer, derive an entitlement from the immutable publication, and atomically activate/supersede the separate current-entitlement pointer before resolving runtime delivery. Preview authority remains role-scoped and must not mint a student entitlement.
  - [x] 1.2 Define the runtime projection input expected from Book Delivery.
  - [ ] 1.3 Validate projection includes the pinned student-safe Source Version, one opaque authorized document resource, page count/labels, Page Groups and page-to-Activity mappings, ordered visible Activities, pinned Activity versions, submission state, access state, result/review availability, and safe action metadata. Reject private R2 identity, teacher-only/unsafe sources, unpublished versions, and provider authority.
  - [ ] 1.4 Ensure runtime rejects missing required projection sections rather than reading authoring data directly.
  - [x] 1.5 Add loading, error, access-denied, and source-unavailable states.
  - [ ] 1.6 Add tests proving real Solo/preview resolution produces a student-safe projection and fails closed for unsafe/missing projection data.

- [x] 2.0 Add Student Practice launcher dispatch
  - [x] 2.1 Inspect existing `StudentPracticePage` dispatch behavior for Solo, Homework, Course, and existing skill runtimes.
  - [x] 2.2 Add one thin Book dispatch branch by material kind/capability or route context.
  - [x] 2.3 Ensure launcher passes delivery request context and does not inspect Book tree, manifest, Page Group, Source Version, Activity Version, or checkpoint storage.
  - [x] 2.4 Make route reload-safe; `location.state` may be convenience data only and must not be the sole source of authorization, pinned version, or delivery context.
  - [x] 2.5 Add regression tests proving Reading, Listening, Writing, THCS, and Reading V2 launches still work.

- [ ] 3.0 Build shared Activity renderer for V1 interaction families
  - [ ] 3.1 Render Activity instructions and embedded stimulus.
  - [ ] 3.2 Render `choice` interactions and variants.
  - [ ] 3.3 Render `text-entry` interactions and variants, including fill-blank/table-compatible controls where supported.
  - [x] 3.4 Render `matching` interactions.
  - [x] 3.5 Render `ordering` interactions.
  - [x] 3.6 Render `long-response` interactions as review-required where appropriate.
  - [ ] 3.7 Apply shared answer rules and per-interaction point overrides where present.
  - [ ] 3.8 Add accessible names, keyboard support, validation messages, and disabled/submitted/review states.
  - [ ] 3.9 Add component tests for every supported family and unsupported-family fail-closed behavior.

- [ ] 4.0 Implement structured and source-assisted presentation modes
  - [ ] 4.1 In structured mode, render complete supported stimulus and answer controls in the right panel.
  - [ ] 4.2 Respect optional/required/none context declarations in runtime messaging and launch behavior.
  - [x] 4.3 In source-assisted mode, show mapped source page context on the left and labelled answer controls on the right.
  - [ ] 4.4 Render and expose each source-assisted control's accessible prompt, response shape, question label, and source citation/correspondence. Source labels may identify the exact page blank, diagram, exercise, or part, but must not become competing Activity headings, navigator numbering, progress numbering, or a second ordering system.
  - [x] 4.5 Block launch when required source context or required accessible metadata is unavailable.
  - [ ] 4.6 Preserve same mode and accessible metadata in review.
  - [x] 4.7 Add tests for structured rendering, source-assisted accessible metadata, required context, and missing-context fail-closed behavior.

- [ ] 5.0 Implement full-document PDF viewer integration and deterministic page navigation
  - [ ] 5.1 Implement Previous and Next controls.
  - [ ] 5.2 Implement Book page number input with Enter/go behavior.
  - [ ] 5.3 Implement zoom in/out and fit page/fit width controls where supported.
  - [ ] 5.4 Keep navigation within the pinned document's physical page bounds. Assignment scope controls Activities and completion; it does not hide other pages of the student-safe PDF.
  - [ ] 5.5 Reject invalid or out-of-document page requests and handle unmapped pages without inventing Activities.
  - [ ] 5.6 Show original Book one-based `physicalPageNumber`/label and mapped/unmapped context while keeping viewer-engine coordinates and private delivery internals hidden.
  - [ ] 5.7 Load one authorized document resource and reuse it across page changes. Do not fetch, preload, or cache separate PDF page artifacts.
  - [ ] 5.8 Change Activity set only after successful page navigation.
  - [ ] 5.9 Add tests for page 58 mapped Activities, Activities spanning multiple pages, unmapped pages, out-of-document rejection, Previous/Next boundaries, and no document reauthorization merely for an in-document page change.

- [ ] 6.0 Implement Page-to-Activity behavior and sticky navigator
  - [x] 6.1 Render all Activities mapped to a page in one vertical stack.
  - [ ] 6.2 Preserve the mapped Activity set when moving between pages in the same Page Group.
  - [ ] 6.3 Selecting an Activity from another page opens its configured default page.
  - [ ] 6.4 Build sticky Activity/question navigator with current, unanswered, answered, flagged, submitted, and review-required states where supported.
  - [ ] 6.5 Make navigator keyboard accessible and ensure it does not obscure content or submit controls.
  - [ ] 6.6 Add tests for pill navigation focus, shared Activity state across pages, and navigator state changes.

> **Timer authority note:** Full V1 retains an optional student-controlled personal SVG timer. It is never teacher-enforced or visible, is not telemetry, and has no grade, deadline, submission, auto-submit, attempt, autosave-authority, integrity, or completion effect.

- [ ] 7.0 Implement PDF focus and panel collapse; retain the optional student-controlled personal timer for Full V1
  - [x] 7.1 On reference-only pages, expand one PDF viewer across the workspace.
  - [x] 7.2 Do not render duplicate copies of a reference-only page.
  - [ ] 7.3 Keep Unit navigator available in PDF focus.
  - [x] 7.4 Add desktop/tablet Activity panel collapse and restore controls with SVG, tooltip, and accessible label.
  - [ ] 7.5 Preserve page, zoom, Activity scroll, answers, and—when implemented—the optional personal timer state across collapse/restore.
  - [ ] 7.6 Keep the optional personal SVG timer outside the foundation pilot if necessary, but implement it before Full V1 closure. It remains student-controlled, academically/integrity inert, and independent of all runtime authority.
  - [ ] C04-A-TIMER Implement the retained personal SVG timer before Full V1 closure. The timer is optional for student use but mandatory retained scope; pilot evidence shapes acceptance details and cannot remove the row. Keep it academically/integrity inert, unrelated to grade, deadline, submission, auto-submit, anti-cheat, telemetry, and teacher visibility; preserve accessible state across collapse/navigation.
  - [ ] 7.7 Add negative guards proving the timer cannot be teacher-enforced or teacher-visible, cannot emit timer telemetry, and cannot affect grades, deadlines, submission, attempts, autosave authority, auto-submit, integrity records, or completion.
  - [ ] 7.8 Add tests for reference-only PDF focus, panel collapse state preservation, accessible timer controls/state when implemented, and all timer non-authority guards.

- [ ] 8.0 Implement Activity autosave, retry, and reload resume
  - [x] 8.1 Update answer immediately in client state.
  - [x] 8.2 Debounce server save by Activity.
  - [x] 8.3 Show `Saving...` and `Saved` states.
  - [ ] 8.4 Flush pending save before page navigation or Activity unmount.
  - [x] 8.5 Retry transient failures.
  - [x] 8.6 Keep unsaved answers in memory on failure.
  - [x] 8.7 Show persistent warning until safe.
  - [x] 8.8 Resume last saved draft on reload.
  - [ ] 8.9 Avoid stale closures and undefined Firebase fields.
  - [ ] 8.10 Include student ID, Activity ID, Activity Version ID, surface, exact placement/delivery ID, homework assignment binding revision where applicable, attempt or draft ID, and client draft revision in every autosave request.
  - [x] 8.11 Reject stale autosaves into a newer Activity Version or assignment binding on the server.
  - [ ] 8.12 Preserve the old draft/attempt, reload the current binding explicitly, and prevent late saves from overwriting new work.
  - [ ] 8.13 Add tests for debounce, flush-before-navigation, failed save warning/retry, reload resume, stale-binding rejection, and old-work preservation.

- [ ] 9.0 Implement Activity submission and review mode
  - [x] 9.1 Submit each Activity independently.
  - [x] 9.2 Create one immutable Activity attempt per submission with a globally unique `attemptId`.
  - [ ] 9.3 Store student, Activity, Activity Version, surface, placement/delivery context, applicable assignment/Course material context, creation/submission timestamps, and visibility-owner context.
  - [x] 9.4 Enforce attempt limits through delivery context where applicable.
  - [x] 9.5 Preserve unfinished answers as drafts.
  - [x] 9.6 Display review availability according to delivery projection and feedback policy.
  - [ ] 9.7 Link to result/review surfaces through existing result conventions.
  - [x] 9.8 Add tests proving submission remains per Activity, attempt IDs are unique, contexts do not collide, and no whole-Book submit exists.

- [ ] 10.0 Implement mobile tabbed runtime and accessibility coverage
  - [x] 10.1 Add Book Page / Activity tabs on mobile.
  - [x] 10.2 Preserve answers and active Book page across tab switching.
  - [x] 10.3 Indicate when source-assisted Activities require the Book Page tab for context.
  - [ ] 10.4 Adapt sticky navigation for mobile touch targets and overflow.
  - [x] 10.5 Follow student mobile design and data-loading rules.
  - [ ] 10.6 Add mobile component tests and browser verification notes for student mobile tabs.

- [ ] 11.0 Prove the foundation Integration Pilot Gate; shippable production-source proof remains Component 08
  - [ ] 11.1 Run one representative Unit from one supplied source through immutable Source Version creation using production ingress or a deterministic private adapter, manifest and Unit JSON import, mapping repair, preview, and publication.
  - [ ] 11.2 Complete the Unit through desktop and mobile Solo/preview runtime with server-backed autosave and Activity-level submission/result.
  - [ ] 11.3 Record correction rate, unsupported interaction patterns, import errors, runtime issues, and teacher effort.
  - [ ] 11.4 Record automated and browser proof required by the master Integration Pilot Gate.
  - [x] 11.5 Stop before deferred Homework, update, Course/Class, public-playable, and integrity behavior.

- [x] 12.0 Preserve regression boundaries
  - [x] 12.1 Prove existing launcher routes still mount their specialized runtimes.
  - [x] 12.2 Prove Book Runtime does not import authoring-only Assembly or Activity candidate services.
  - [x] 12.3 Prove Reading V2 and Listening do not import from Book Runtime.
  - [x] 12.4 Update findings with final runtime component/service ownership paths and unresolved risks.

### Evidence-hardening subtasks (append-only; parent boxes remain open)

- [x] 1.7 Keep one data owner for each runtime surface: Book Delivery loads the projection once, and shell/activity/navigator widgets consume that snapshot rather than issuing overlapping reads. Expose separate summary/detail selectors from the same owner.
- [ ] 1.8 Revisit a previously loaded page/activity with stale-while-revalidate: retain last good content while refreshing in background, show a lightweight refresh state, and use a blocking loader only on first load or when no usable data exists.
- [ ] 1.9 Prove runtime reads only scoped delivery/projection nodes; reject broad top-level reads and per-Activity/per-card history or progress fetches. Add a guard against `map(async item => fetch...)` N+1 patterns and assert bounded read counts in tests.
- [ ] 5.10 Preserve canonical app order and one-based `physicalPageNumber` for edge cases (printed labels differing from physical-page numbers, ranges, inserted/deleted pages, rotation/landscape, duplicate labels, and reference-only pages). Show labels as citations/helper metadata, never as a second ordering or identity system.
- [ ] 8.14 Use these provisional pre-pilot autosave guardrails: debounce at least 1.5 seconds after the latest edit, steady-state no more than 6 writes/minute/active Activity, p95 save acknowledgement at or below 1 second in the pilot environment, and record bytes/write, retry rate, Firebase/Cloudflare quota consumption, and zero billed usage for the agreed workload. Pilot evidence may tighten performance or write-rate values only with owner/date/sample/environment/rationale; it may not authorize a paid tier or nonzero monetary budget.
- [ ] 8.15 Make unsaved/conflict recovery explicit: preserve local answers while offline or on transient failure, offer retry/discard/reload-current-binding choices, reject stale version/binding writes, and verify old draft/attempt remains readable after conflict resolution.
- [x] 8.16 Coalesce keystrokes, permit at most one in-flight save per Activity draft, revision-bind queued writes, use bounded exponential retry, and give navigation flush a deadline. On deadline/failure, preserve recoverable local state and visible warning instead of silently discarding work or blocking forever.
- [ ] 10.7 Verify 200% browser zoom and screen-reader text alternatives for source-assisted controls and PDF context: every response has an accessible prompt, expected response shape, source citation/correspondence, live save/conflict status, and keyboard path that does not depend on the PDF image or create a second Activity ordering system.

### P2 producer / P3 consumer boundary — corrected 2026-07-17

P2 closes after it deploys and proves a published-only producer projection containing the pinned student-safe Source Version, page count/labels, and complete creator-selected Page Group/page-to-Activity mapping. Component 04 `1.3` remains P3 consumer-side validation and does not circularly block P2. P3 obtains one authorized full-document resource from Book Delivery, opens the requested `physicalPageNumber`, rejects stale/unsafe/private-authority sources, and never requires a derived page artifact.

### Packet P3 canonical audit — 2026-07-15

Audit verdict: `REVIEW_BLOCKED`. Governing component status remains `IMPLEMENTING`; formal P3 execution still waits for accepted P2 exit.

Fresh row-by-row review against the current PRD, live source, and 7 files/105 passing local tests reopened 30 checked leaf rows plus parents `9.0` and `10.0`. Accepted executable-leaf coverage is now `42/95` (`44.2%`), not the inherited `72/95` (`75.8%`). Passing tests were not accepted where they proved only an older, narrower, mocked, or nonfunctional contract.

Primary reopened boundaries:

- preview launch is absent from the browser/launcher path and legacy incomplete projections are synthesized instead of rejected;
- interaction variants are absent and image/audio stimulus handling is placeholder-only;
- the shell consumes one requested page but cannot request and reauthorize another page, so checked navigation/Page-to-Activity claims were overstated;
- unmount durability and old-version draft/attempt preservation are not fully proven;
- result UI does not follow the required Activity attempt-dropdown convention and Course/Class context is absent;
- mobile proof remains component-level rather than a fresh real student-browser run;
- autosave still contains obsolete nonzero monetary planning assumptions, while current authority requires quota and zero-billed-usage evidence.

Exact classifications, retained rows, command evidence, and correction lanes are recorded in [`evidence/P3-canonical-audit-20260715.md`](evidence/P3-canonical-audit-20260715.md). This audit changed task/evidence authority only; it did not implement P3 behavior, deploy, mutate cloud state, or authorize P3 entry.

### Student-safe full-document decision — 2026-07-17

This decision supersedes the earlier P2/P3 one-page producer-consumer note. The runtime obtains one authorized document resource for the pinned student-safe Source Version and reuses it while changing viewer page state. Page Groups still determine which Activities appear beside the selected `physicalPageNumber`; they are not transport authorization sets. Previously accepted runtime work remains valid only where it is independent of per-page resource fetching, rendition identity, or per-page reauthorization.
