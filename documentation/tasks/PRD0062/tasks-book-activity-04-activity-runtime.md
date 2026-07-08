# Task List: PRD0062 Component 04 - Activity Runtime

Status: Draft task list. Execute only through the master orchestration packet order.

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

## Tasks

- [ ] 1.0 Build Book Delivery runtime projection consumer
  - [ ] 1.1 Define the runtime projection input expected from Book Delivery.
  - [ ] 1.2 Validate projection includes authorized Source Version/rendition, page labels, navigation limits, Page Groups, ordered visible Activities, pinned Activity versions, submission state, deadline/access state, result/review availability, and notification/action metadata.
  - [ ] 1.3 Ensure runtime rejects missing required projection sections rather than reading authoring data directly.
  - [ ] 1.4 Add loading, error, access-denied, schedule-locked, and source-unavailable states.
  - [ ] 1.5 Add tests proving runtime consumes projection only and fails closed for unsafe/missing projection data.

- [ ] 2.0 Add Student Practice launcher dispatch
  - [ ] 2.1 Inspect existing `StudentPracticePage` dispatch behavior for Solo, Homework, Course, and existing skill runtimes.
  - [ ] 2.2 Add one thin Book dispatch branch by material kind/capability or route context.
  - [ ] 2.3 Ensure launcher passes delivery request context and does not inspect Book tree, manifest, Page Group, Source Version, Activity Version, or checkpoint storage.
  - [ ] 2.4 Make route reload-safe; `location.state` may be convenience data only.
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
  - [ ] 4.4 Block launch when required source context is unavailable.
  - [ ] 4.5 Preserve same mode in review.
  - [ ] 4.6 Add tests for structured rendering, source-assisted required context, and missing-context fail-closed behavior.

- [ ] 5.0 Implement single-page PDF viewer and deterministic page navigation
  - [ ] 5.1 Implement Previous and Next controls.
  - [ ] 5.2 Implement Book page number input with Enter/go behavior.
  - [ ] 5.3 Implement zoom in/out and fit page/fit width controls where supported.
  - [ ] 5.4 Keep navigation within authorized Unit pages.
  - [ ] 5.5 Reject invalid or out-of-Unit page requests.
  - [ ] 5.6 Show original Book page number/label while keeping physical PDF index and slice index internal.
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

- [ ] 7.0 Implement PDF focus and panel collapse behavior
  - [ ] 7.1 On reference-only pages, expand one PDF viewer across the workspace.
  - [ ] 7.2 Do not render duplicate copies of a reference-only page.
  - [ ] 7.3 Keep Unit navigator available in PDF focus.
  - [ ] 7.4 Add desktop/tablet Activity panel collapse and restore controls with SVG, tooltip, and accessible label.
  - [ ] 7.5 Preserve page, zoom, Activity scroll, answers, and optional timer state across collapse/restore.
  - [ ] 7.6 Add tests for reference-only PDF focus and panel collapse state preservation.

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
  - [ ] 8.10 Add tests for debounce, flush-before-navigation, failed save warning/retry, and reload resume.

- [ ] 9.0 Implement Activity submission and review mode
  - [ ] 9.1 Submit each Activity independently.
  - [ ] 9.2 Create one immutable Activity attempt per submission.
  - [ ] 9.3 Enforce attempt limits through delivery context where applicable.
  - [ ] 9.4 Preserve unfinished answers as drafts.
  - [ ] 9.5 Display review availability according to delivery projection and feedback policy.
  - [ ] 9.6 Link to result/review surfaces through existing result conventions.
  - [ ] 9.7 Add tests proving submission remains per Activity and no whole-Book submit exists.

- [ ] 10.0 Implement mobile tabbed runtime and accessibility coverage
  - [ ] 10.1 Add Book Page / Activity tabs on mobile.
  - [ ] 10.2 Preserve answers and active Book page across tab switching.
  - [ ] 10.3 Indicate when source-assisted Activities require the Book Page tab for context.
  - [ ] 10.4 Adapt sticky navigation for mobile touch targets and overflow.
  - [ ] 10.5 Follow student mobile design and data-loading rules.
  - [ ] 10.6 Add mobile component tests and browser verification notes for student mobile tabs.

- [ ] 11.0 Preserve regression boundaries
  - [ ] 11.1 Prove existing launcher routes still mount their specialized runtimes.
  - [ ] 11.2 Prove Book Runtime does not import authoring-only Assembly or Activity candidate services.
  - [ ] 11.3 Prove Reading V2 and Listening do not import from Book Runtime.
  - [ ] 11.4 Update findings with final runtime component/service ownership paths and unresolved risks.
