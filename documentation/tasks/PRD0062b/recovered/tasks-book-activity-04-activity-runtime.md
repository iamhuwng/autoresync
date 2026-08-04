> IMMUTABLE RECOVERED BASELINE / EVIDENCE ONLY
>
> Exact body from Git object 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd. Evidence only; canonical task owner is parent-directory Component file.

# Task List: PRD0062 Component 04 - Activity Runtime

Status: PLANNED. Start bounded slices only from exact reviewed producer inputs in the master dependency graph.

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/pages/StudentPracticePage.tsx` - Existing asynchronous student launcher that should dispatch to Book through one thin branch.
- `src/routes/studentRoutes.tsx` - Student route registration.
- `src/features/book-runtime/*` - New Book Runtime feature module, if feature folders are used.
- `src/components/book-runtime/BookRuntimeShell.tsx` - New runtime shell for desktop/mobile layout.
- `src/components/book-runtime/BookPdfPageViewer.tsx` - New safe single-page PDF viewer wrapper.
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
- V1 uses a single-page PDF viewer, not continuous scroll.
- Source-assisted mode does not load custom per-Activity React renderers.
- Autosave is per Activity and does not count as submission.
- Mobile uses Book Page / Activity tabs, not a squeezed split view.
- This packet must produce the real Solo/preview delivery path needed by the Integration Pilot Gate; projection fixtures alone are insufficient for runtime behavior.
- Optional personal timer is deferred to V1.1 unless pilot evidence records validated demand; V1 runtime must not expose timer state or timer controls.
- This packet stops before Book/subtree Homework, selective updates, Review Checkpoints, Course/Class delivery, public playable source-assisted Books, and integrity rollout.

## Risk-Scaled Change And Closure Rule

Follow the master risk-scaled contract. Record outcome/non-scope, exact owner/interface, compatibility boundary, focused tests, and changed failure proof here; create a separate Packet 4 contract only for conditional detail that cannot stay concise.

Keep Book Delivery/authorization proof separate from UI rendering, autosave/submission proof, launcher regressions, browser behavior, Integration Pilot evidence, and shippable source proof. Before `VERIFIED`, reconcile only touched current-state docs and run focused proof plus governance/diff checks. Create a handoff only under the master conditional-handoff rule.

## Tasks

- [ ] 1.0 Build minimum Solo/preview Book Delivery and runtime projection consumer
  - [ ] 1.1 Implement the Book-owned Solo/preview delivery resolver needed by the Integration Pilot Gate.
  - [ ] 1.2 Define the runtime projection input expected from Book Delivery.
  - [ ] 1.3 Validate projection includes authorized Source Version/rendition, page labels, navigation limits, Page Groups, ordered visible Activities, pinned Activity versions, submission state, access state, result/review availability, and safe action metadata.
  - [ ] 1.4 Ensure runtime rejects missing required projection sections rather than reading authoring data directly.
  - [ ] 1.5 Add loading, error, access-denied, and source-unavailable states.
  - [ ] 1.6 Add tests proving real Solo/preview resolution produces a student-safe projection and fails closed for unsafe/missing projection data.

- [ ] 2.0 Add Student Practice launcher dispatch
  - [ ] 2.1 Inspect existing `StudentPracticePage` dispatch behavior for Solo, Homework, Course, and existing skill runtimes.
  - [ ] 2.2 Add one thin Book dispatch branch by material kind/capability or route context.
  - [ ] 2.3 Ensure launcher passes delivery request context and does not inspect Book tree, manifest, Page Group, Source Version, Activity Version, or checkpoint storage.
  - [ ] 2.4 Make route reload-safe; `location.state` may be convenience data only and must not be the sole source of authorization, pinned version, or delivery context.
  - [ ] 2.5 Add regression tests proving Reading, Listening, Writing, THCS, and Reading V2 launches still work.

- [ ] 3.0 Build shared Activity renderer for V1 interaction families
  - [ ] 3.1 Render Activity instructions and embedded stimulus.
  - [ ] 3.2 Render `choice` interactions and variants.
  - [ ] 3.3 Render `text-entry` interactions and variants, including fill-blank/table-compatible controls where supported.
  - [ ] 3.4 Render `matching` interactions.
  - [ ] 3.5 Render `ordering` interactions.
  - [ ] 3.6 Render `long-response` interactions as review-required where appropriate.
  - [ ] 3.7 Apply shared answer rules and per-interaction point overrides where present.
  - [ ] 3.8 Add accessible names, keyboard support, validation messages, and disabled/submitted/review states.
  - [ ] 3.9 Add component tests for every supported family and unsupported-family fail-closed behavior.

- [ ] 4.0 Implement structured and source-assisted presentation modes
  - [ ] 4.1 In structured mode, render complete supported stimulus and answer controls in the right panel.
  - [ ] 4.2 Respect optional/required/none context declarations in runtime messaging and launch behavior.
  - [ ] 4.3 In source-assisted mode, show mapped source page context on the left and labelled answer controls on the right.
  - [ ] 4.4 Render and expose each source-assisted control's accessible prompt, response shape, question label, and relationship to source exercise/part labels without creating a second Activity ordering system.
  - [ ] 4.5 Block launch when required source context or required accessible metadata is unavailable.
  - [ ] 4.6 Preserve same mode and accessible metadata in review.
  - [ ] 4.7 Add tests for structured rendering, source-assisted accessible metadata, required context, and missing-context fail-closed behavior.

- [ ] 5.0 Implement single-page PDF viewer and deterministic page navigation
  - [ ] 5.1 Implement Previous and Next controls.
  - [ ] 5.2 Implement Book page number input with Enter/go behavior.
  - [ ] 5.3 Implement zoom in/out and fit page/fit width controls where supported.
  - [ ] 5.4 Keep navigation within authorized Unit pages.
  - [ ] 5.5 Reject invalid or out-of-Unit page requests.
  - [ ] 5.6 Show original Book one-based `physicalPageNumber`/label and current allowed page indication while keeping any PDF-engine coordinate and slice index internal.
  - [ ] 5.7 Preload adjacent page where practical.
  - [ ] 5.8 Change Activity set only after successful page navigation.
  - [ ] 5.9 Add tests for page 58 mapped Activities, multi-page Activity sets, out-of-Unit rejection, and Previous/Next boundaries.

- [ ] 6.0 Implement Page-to-Activity behavior and sticky navigator
  - [ ] 6.1 Render all Activities mapped to a page in one vertical stack.
  - [ ] 6.2 Preserve the mapped Activity set when moving between pages in the same Page Group.
  - [ ] 6.3 Selecting an Activity from another page opens its configured default page.
  - [ ] 6.4 Build sticky Activity/question navigator with current, unanswered, answered, flagged, submitted, and review-required states where supported.
  - [ ] 6.5 Make navigator keyboard accessible and ensure it does not obscure content or submit controls.
  - [ ] 6.6 Add tests for pill navigation focus, shared Activity state across pages, and navigator state changes.

- [ ] 7.0 Implement PDF focus and panel collapse; preserve explicit V1.1 timer deferral
  - [ ] 7.1 On reference-only pages, expand one PDF viewer across the workspace.
  - [ ] 7.2 Do not render duplicate copies of a reference-only page.
  - [ ] 7.3 Keep Unit navigator available in PDF focus.
  - [ ] 7.4 Add desktop/tablet Activity panel collapse and restore controls with SVG, tooltip, and accessible label.
  - [ ] 7.5 Preserve page, zoom, Activity scroll, and answers across collapse/restore; no timer state exists in V1.
  - [ ] 7.6 Keep the optional personal SVG timer out of V1; record it as a V1.1 candidate and require pilot evidence plus explicit scope approval before implementation.
  - [ ] 7.7 Add a negative guard that no timer control, timer persistence, timer telemetry, grade/deadline effect, auto-submit, anti-cheat record, or teacher visibility is reachable in V1.
  - [ ] 7.8 Add tests for reference-only PDF focus, panel collapse state preservation, and the V1.1 timer-deferral/no-timer-reachability guard.

- [ ] 8.0 Implement Activity autosave, retry, and reload resume
  - [ ] 8.1 Update answer immediately in client state.
  - [ ] 8.2 Debounce server save by Activity.
  - [ ] 8.3 Show `Saving...` and `Saved` states.
  - [ ] 8.4 Flush pending save before page navigation or Activity unmount.
  - [ ] 8.5 Retry transient failures.
  - [ ] 8.6 Keep unsaved answers in memory on failure.
  - [ ] 8.7 Show persistent warning until safe.
  - [ ] 8.8 Resume last saved draft on reload.
  - [ ] 8.9 Avoid stale closures and undefined Firebase fields.
  - [ ] 8.10 Include student ID, Activity ID, Activity Version ID, surface, exact placement/delivery ID, homework assignment binding revision where applicable, attempt or draft ID, and client draft revision in every autosave request.
  - [ ] 8.11 Reject stale autosaves into a newer Activity Version or assignment binding on the server.
  - [ ] 8.12 Preserve the old draft/attempt, reload the current binding explicitly, and prevent late saves from overwriting new work.
  - [ ] 8.13 Add tests for debounce, flush-before-navigation, failed save warning/retry, reload resume, stale-binding rejection, and old-work preservation.

- [ ] 9.0 Implement Activity submission and review mode
  - [ ] 9.1 Submit each Activity independently.
  - [ ] 9.2 Create one immutable Activity attempt per submission with a globally unique `attemptId`.
  - [ ] 9.3 Store student, Activity, Activity Version, surface, placement/delivery context, applicable assignment/Course material context, creation/submission timestamps, and visibility-owner context.
  - [ ] 9.4 Enforce attempt limits through delivery context where applicable.
  - [ ] 9.5 Preserve unfinished answers as drafts.
  - [ ] 9.6 Display review availability according to delivery projection and feedback policy.
  - [ ] 9.7 Link to result/review surfaces through existing result conventions.
  - [ ] 9.8 Add tests proving submission remains per Activity, attempt IDs are unique, contexts do not collide, and no whole-Book submit exists.

- [ ] 10.0 Implement mobile tabbed runtime and accessibility coverage
  - [ ] 10.1 Add Book Page / Activity tabs on mobile.
  - [ ] 10.2 Preserve answers and active Book page across tab switching.
  - [ ] 10.3 Indicate when source-assisted Activities require the Book Page tab for context.
  - [ ] 10.4 Adapt sticky navigation for mobile touch targets and overflow.
  - [ ] 10.5 Follow student mobile design and data-loading rules.
  - [ ] 10.6 Add mobile component tests and browser verification notes for student mobile tabs.

- [ ] 11.0 Prove the foundation Integration Pilot Gate; shippable production-source proof remains Component 08
  - [ ] 11.1 Run one representative Unit from one supplied source through immutable Source Version creation using production ingress or a deterministic private adapter, manifest and Unit JSON import, mapping repair, preview, and publication.
  - [ ] 11.2 Complete the Unit through desktop and mobile Solo/preview runtime with server-backed autosave and Activity-level submission/result.
  - [ ] 11.3 Record correction rate, unsupported interaction patterns, import errors, runtime issues, and teacher effort.
  - [ ] 11.4 Record automated and browser proof required by the master Integration Pilot Gate.
  - [ ] 11.5 Stop before deferred Homework, update, Course/Class, public-playable, and integrity behavior.

- [ ] 12.0 Preserve regression boundaries
  - [ ] 12.1 Prove existing launcher routes still mount their specialized runtimes.
  - [ ] 12.2 Prove Book Runtime does not import authoring-only Assembly or Activity candidate services.
  - [ ] 12.3 Prove Reading V2 and Listening do not import from Book Runtime.
  - [ ] 12.4 Update findings with final runtime component/service ownership paths and unresolved risks.

### Evidence-hardening subtasks (append-only; parent boxes remain open)

- [ ] 1.7 Keep one data owner for each runtime surface: Book Delivery loads the projection once, and shell/activity/navigator widgets consume that snapshot rather than issuing overlapping reads. Expose separate summary/detail selectors from the same owner.
- [ ] 1.8 Revisit a previously loaded page/activity with stale-while-revalidate: retain last good content while refreshing in background, show a lightweight refresh state, and use a blocking loader only on first load or when no usable data exists.
- [ ] 1.9 Prove runtime reads only scoped delivery/projection nodes; reject broad top-level reads and per-Activity/per-card history or progress fetches. Add a guard against `map(async item => fetch...)` N+1 patterns and assert bounded read counts in tests.
- [ ] 5.10 Preserve canonical app order and one-based `physicalPageNumber` for edge cases (printed labels differing from physical-page numbers, ranges, inserted/deleted pages, rotation/landscape, duplicate labels, and reference-only pages). Show labels as citations/helper metadata, never as a second ordering or identity system.
- [ ] 8.14 Use these provisional pre-pilot autosave guardrails: debounce at least 1.5 seconds after the latest edit, steady-state no more than 6 writes/minute/active Activity, p95 save acknowledgement at or below 1 second in the pilot environment, estimated backend cost at or below $0.05 per active student-hour, and record bytes/write plus retry rate. Pilot evidence may tighten or relax a value only with owner/date/sample/environment/rationale; no copied target counts as measured proof.
- [ ] 8.15 Make unsaved/conflict recovery explicit: preserve local answers while offline or on transient failure, offer retry/discard/reload-current-binding choices, reject stale version/binding writes, and verify old draft/attempt remains readable after conflict resolution.
- [ ] 8.16 Coalesce keystrokes, permit at most one in-flight save per Activity draft, revision-bind queued writes, use bounded exponential retry, and give navigation flush a deadline. On deadline/failure, preserve recoverable local state and visible warning instead of silently discarding work or blocking forever.
- [ ] 10.7 Verify 200% browser zoom and screen-reader text alternatives for source-assisted controls and PDF context: every response has an accessible prompt, expected response shape, source label relationship, live save/conflict status, and keyboard path that does not depend on the PDF image.
