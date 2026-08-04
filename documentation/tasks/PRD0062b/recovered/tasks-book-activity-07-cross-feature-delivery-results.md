> IMMUTABLE RECOVERED BASELINE / EVIDENCE ONLY
>
> Exact body from Git object 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd. Evidence only; canonical task owner is parent-directory Component file.

# Task List: PRD0062 Component 07 - Cross-Feature Delivery And Results

Status: PLANNED. Start bounded slices only from exact reviewed producer inputs in the master dependency graph.

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `src/services/book-delivery/bookDelivery.service.ts` - New Book-owned delivery module for Solo, Homework, Course, Class-linked Course, and future Live contracts.
- `src/types/bookDelivery.types.ts` - New delivery request, placement binding, projection, access, schedule, draft, attempt, and result metadata contracts.
- `src/pages/StudentPracticePage.tsx` - Existing shared asynchronous launcher.
- `src/pages/StudentLibraryPage.tsx` - Existing student library surface for Solo Book Practice entry.
- `src/pages/StudentCourseDetailPage.tsx` - Existing Course entry surface.
- `src/types/course.types.ts` - Existing Course material contracts to extend with Book subtree/Activity placement bindings.
- `src/services/courseMaterialAccessService.ts` - Existing Course material access owner; must not copy ambiguous bare `materialId` resolution for Book.
- `src/services/courseSyncService.ts` - Existing Course sync prior art and integration boundary.
- `src/services/materialLinkManager.ts` - Existing version/update prior art.
- `src/components/results/AttemptHistory.tsx` - Existing attempt dropdown prior art.
- `src/components/results/ResultSlidePanel.tsx` - Existing result panel surface.
- `src/components/results/ResultDetailModal.tsx` - Existing result detail display surface.
- `src/hooks/useTestAttempts.ts` - Existing attempt retrieval hook to inspect for extension or adapter points.
- `src/services/testResults.service.ts` - Existing result attempt service to adapt or wrap for Activity attempts.
- `src/services/resultVisibility.service.ts` - Existing visibility gate owner.
- `src/services/resultOwnershipResolver.ts` - Existing teacher/student ownership resolver.
- `src/services/academicRecordService.ts` - Existing academic record integration to preserve boundaries.
- `src/pages/TestPageRouter.tsx` - Live Session prior art only; Book Live execution is not V1 scope.

### Notes

- Component 04 owns the minimum Solo/preview Book Delivery path required by the Integration Pilot Gate. This component extends that module for Homework, Course/Class, public delivery, and results.
- Book Delivery owns access, pinned versions, source/page projection, schedule state, result state, and reload-safe launch restoration.
- Callers pass context and intent. They do not inspect Book tree, manifest, Page Group, Source Version, Activity Version, or Review Checkpoint storage.
- Book-originated integrations must reference a frozen Placement binding, not a bare Activity ID.
- Every attempt has a globally unique `attemptId`. `studentId + activityId` is viewer grouping only; completion remains placement/delivery-specific.
- Course/Class must resolve exact placement/context, not ambiguous `materialId`.
- Live Session data contract may be prepared, but Book Activity execution in Live is not V1.

## Risk-Scaled Change And Closure Rule

Follow the master risk-scaled contract. Record outcome/non-scope, owner/interface, compatibility boundary, focused tests, and changed failure proof here; add a separate Packet 7 contract only for triggered detail that cannot stay concise.

Keep access resolution, exact placement, draft/attempt isolation, result visibility, public-rights projections, browser behavior, and regressions as separate proof classes. Rendering never proves authorization. Before `VERIFIED`, reconcile only touched current-state docs and run focused proof plus governance/diff checks. Create a handoff only under the master conditional-handoff rule.

## Tasks

- [ ] 1.0 Extend the foundation Book Delivery module interface
  - [ ] 1.1 Extend `resolveBookDelivery(request)` from Solo/preview to Homework, Course, Class-linked Course, public, and future Live surface values without reimplementing the foundation path.
  - [ ] 1.2 Define one revision-bound `applyBookDeliveryAction(deliveryId, action, expectedRevision)` command surface rather than exposing storage-shaped lifecycle methods.
  - [ ] 1.3 Keep Activity listing, pin resolution, entitlement/schedule checks, attempt targeting, result visibility, and checkpoint interpretation internal to Book Delivery.
  - [ ] 1.4 Make Book Delivery call Book Source Delivery for authorized excerpts; it never constructs private object keys, range grants, or signed resources.
  - [ ] 1.5 Normalize caller context while keeping caller-owned IDs opaque to runtime.
  - [ ] 1.6 Return student-safe runtime projection with authorized source slice, ordered Activities, pinned versions, access/deadline state, submission/result state, and update/review metadata.
  - [ ] 1.7 Add tests proving callers cannot bypass Book Delivery by passing mismatched context/placement/student combinations.

- [ ] 2.0 Implement lean Placement binding resolution
  - [ ] 2.1 Define frozen Placement binding with `bookId`, selected subtree/Activity context, `manifestVersionId`, `sourceVersionId`, `placementId`, `activityId`, `activityVersionId`, `bindingRevision`, completion aggregation policy, and `titleSnapshot`.
  - [ ] 2.2 Resolve Book path, page group, visible order, source version, source page labels, and source-assisted context through `manifestVersionId` and Placement.
  - [ ] 2.3 Reject bindings where Activity, Source, Manifest, or Placement versions do not match the delivery surface.
  - [ ] 2.4 Ensure Book Delivery, Homework, Course, and future composition consume the same binding shape.
  - [ ] 2.5 Add tests proving exact placement binding prevents ambiguous reuse.

- [ ] 3.0 Implement context-owned access rules
  - [ ] 3.1 Implement Solo access from Book solo/public visibility and archive status.
  - [ ] 3.2 Implement Homework access from assignment target, open/scheduled access, deadlines, and per-student overrides.
  - [ ] 3.3 Implement Course access from enrollment, module release, and exact Course material placement.
  - [ ] 3.4 Implement Class-linked Course access from class-owned Course/Homework object.
  - [ ] 3.5 Preserve archived Books for existing pinned Homework, Course, and Class-linked Course deliveries according to their owning access rules while blocking new Solo launches and new placements.
  - [ ] 3.6 Prove archive never silently mutates, invalidates, repins, or revokes already assigned pinned deliveries.
  - [ ] 3.7 Add tests for each access surface and archived Book behavior, including Homework/Course/Class pinned delivery survival and no silent invalidation.

- [ ] 4.0 Implement surface pinning and update policy
  - [ ] 4.1 For Solo, pin current Activity and Source versions at attempt start; new attempt may use latest published version.
  - [ ] 4.2 For Homework, use assignment-pinned Activity and Source versions until teacher applies selective update.
  - [ ] 4.3 For Course/Class, pin selected Book subtree/Activity at Course material placement and update only through explicit sync/update.
  - [ ] 4.4 Prepare future Live freeze contract without executing Book in Live Sessions.
  - [ ] 4.5 For future composition, reference original by default and require fork/copy before mutation.
  - [ ] 4.6 Add tests proving source edits do not silently mutate pinned deliveries.

- [ ] 5.0 Implement context-scoped drafts, attempts, and completion
  - [ ] 5.1 Define draft key dimensions: student ID, Activity ID, Activity Version ID, surface, exact placement/delivery ID, applicable assignment binding revision, attempt/draft ID, and client draft revision.
  - [ ] 5.2 Prevent Solo drafts from overwriting Homework drafts.
  - [ ] 5.3 Prevent Homework drafts from overwriting Course drafts.
  - [ ] 5.4 Prevent two Course placements of the same Activity from sharing draft/progress state.
  - [ ] 5.5 Prevent old version drafts from appearing inside a newer pinned version.
  - [ ] 5.6 Keep attempt limits delivery-context scoped.
  - [ ] 5.7 Keep Solo, Homework, Course, and Class completion records separate.
  - [ ] 5.8 Key assigned completion by student, assignment/Course material, Placement, Activity, and Activity Version.
  - [ ] 5.9 Add tests for draft isolation, attempt isolation, completion isolation, and the same Activity appearing twice in one Book or Course.

- [ ] 6.0 Integrate Activity result attempts with existing result panels/dropdowns
  - [ ] 6.1 Store each Activity submission as one immutable Activity attempt with a globally unique `attemptId`.
  - [ ] 6.2 Group attempts by `studentId + activityId` for result panel/dropdown display only; never use this grouping as persistence identity or completion authority.
  - [ ] 6.3 Store student ID, Activity ID, Activity Version ID, attempt ID, surface, exact placement/delivery context, applicable assignment/Course material ID, creation/submission timestamps, visibility-owner context, Source Version where source-assisted, and grading/regrading history per attempt.
  - [ ] 6.4 Display each attempt's answers, corrections, score, feedback, version, and source context.
  - [ ] 6.5 Keep separate Activities in separate result pages/panels.
  - [ ] 6.6 Ensure Unit/Book/Course/Homework summaries aggregate progress only and link to Activity results.
  - [ ] 6.7 Ensure result viewing never transfers completion across surfaces.
  - [ ] 6.8 Add result grouping tests using the Solo Monday / Homework Wednesday example from the PRD.

- [ ] 7.0 Preserve result visibility and ownership boundaries
  - [ ] 7.1 Let students see their own permitted attempts.
  - [ ] 7.2 Let teachers see only attempts created under teacher-owned Homework/Course/Class/Live authority.
  - [ ] 7.3 Keep private Solo attempts private unless later policy changes.
  - [ ] 7.4 Gate Homework attempt feedback by Homework feedback release timing.
  - [ ] 7.5 Warn when delayed/manual-feedback Homework selects Activities that may already be visible through Solo or prior feedback.
  - [ ] 7.6 Make assignment preview warning the V1 fork/copy entry point when secrecy matters; the fork receives a new Activity ID and separate result history.
  - [ ] 7.7 Preserve warning-first policy; do not automatically lock Solo access.
  - [ ] 7.8 Add tests proving teacher result visibility never exposes private Solo attempts and fork/copy keeps result history separate.

- [ ] 8.0 Add Course/Class Book placement support
  - [ ] 8.1 Allow a Course material item to reference a selected Book subtree.
  - [ ] 8.2 Allow a Course material item to reference a single Activity with required source context where applicable.
  - [ ] 8.3 Resolve exact `courseMaterialId` or equivalent placement context, not bare `materialId`.
  - [ ] 8.4 Store or resolve selected subtree/Activity Placement, pinned Manifest/Source/Activity versions, binding revision, and completion aggregation policy.
  - [ ] 8.5 Mark Course item complete when required Activities under the selected Book placement are submitted.
  - [ ] 8.6 Support optional Homework-created-from-Course progress credit only when placement explicitly enables it.
  - [ ] 8.7 Ensure class-linked Course copies receive Book changes only through explicit sync/update.
  - [ ] 8.8 Add tests for exact binding dimensions, duplicate same-Activity Course placements, and class-linked Course sync behavior.

- [ ] 9.0 Implement Public Library and source-rights publication
  - [ ] 9.1 Validate public source-rights status separately from ordinary private/assigned delivery rights.
  - [ ] 9.2 Support explicit states: metadata-only public, tree/ref public with runtime blocked, and playable public with approved source excerpt rights.
  - [ ] 9.3 Block source-assisted runtime launch and source-page delivery when source excerpt rights are not approved.
  - [ ] 9.4 Build public-safe projections that exclude private source object keys, signed URLs, answer-key pages, teacher notes, authoring candidates, homework/update metadata, and unreleased feedback.
  - [ ] 9.5 Route public launch through Book Delivery and revalidate public access/source rights at launch time.
  - [ ] 9.6 Add positive and negative tests for all three public states and public projection leakage.

- [ ] 10.0 Add Content Catalog browse/resolve seams for future composition
  - [ ] 10.1 Define `browseChildren(containerRef)`.
  - [ ] 10.2 Define `resolveSelection(selection)`.
  - [ ] 10.3 Hide RTDB/Firestore paths, Book tree storage shape, Placement resolution, version pinning, and source authorization from callers.
  - [ ] 10.4 Return structured bundles for Unit/Chapter selection by default.
  - [ ] 10.5 Allow future targets to preserve structure or flatten ordered Activities.
  - [ ] 10.6 Implement reference-first behavior and newer-version awareness.
  - [ ] 10.7 Implement revise-original versus customize-here/fork contract at the service boundary.
  - [ ] 10.8 Add tests for structured selection and required/optional/no source context reuse rules.

- [ ] 11.0 Preserve Live Session boundary
  - [ ] 11.1 Inspect `TestPageRouter`, session manager, and live runtime prior art only as context.
  - [ ] 11.2 Define future Live data contract requirements without enabling Book execution in Live.
  - [ ] 11.3 Ensure no V1 UI offers Book Live Session launch.
  - [ ] 11.4 Add tests or guardrails proving Book Live execution is not reachable in V1.

- [ ] 12.0 Preserve cross-feature regressions
  - [ ] 12.1 Prove Student Practice launcher dispatches Book without breaking existing material types.
  - [ ] 12.2 Prove Reading V2 pinned assignment launch remains stable.
  - [ ] 12.3 Prove result visibility and ownership behavior remains stable for existing result types.
  - [ ] 12.4 Prove Course/Class existing materials still launch and sync.
  - [ ] 12.5 Prove public Book projection cannot leak private refs or source PDFs.
  - [ ] 12.6 Update findings with final Book Delivery, result, Course/Class, public projection, and Content Catalog owner paths.

### Evidence-hardening subtasks (append-only; parent boxes remain open)

- [ ] 1.8 Keep one data owner per cross-feature surface: Book Delivery resolves the scoped summary/projection once, while library/course/result widgets consume it without duplicate loaders or repair writes. Callers must not read broad top-level `books`, `tests`, `classes`, or history nodes to filter client-side.
- [ ] 1.9 Expose summary and detail selectors from the same delivery owner, with stale-while-revalidate on revisits: preserve last good list/detail content, refresh in background, and use blocking loading only when no usable prior data exists.
- [ ] 1.10 Add read-budget tests proving no per-card/per-Activity result or progress fetches (N+1) and no mount-time backfill/repair writes. Bulk-enrich secondary history/progress once, index by join key, and join in memory.
- [ ] 6.9 Add visible result context labels on summary, panel, and detail surfaces: delivery surface (`Solo`, `Homework`, `Course`, or `Class`), Book/Unit/placement path, Activity title, Activity and Source Version labels, source printed page label where source-assisted, attempt status, and feedback/regrade state. Labels must remain understandable at 200% zoom and never expose hidden IDs as a substitute for context.
- [ ] 6.10 Keep summary/detail links context-safe: opening an attempt from a notification, course item, or result panel must resolve the same placement/binding and source labels, with an explicit unavailable/permission fallback instead of silently switching to another surface.
- [ ] 12.7 Add cross-feature regression assertions for one-owner reads, stale-while-revalidate revisits, bounded read counts, no broad reads, no N+1 enrichment, and result context/placement/version/source-label continuity across list, panel, detail, and notification entry points.
