# PRESERVED PREDECESSOR FULL-WORDING CHECKLIST

> **NOT CURRENT STATUS AUTHORITY.** Use the
> [2026-08-04 reconciliation](../remaining-implementation-reconciliation-2026-08-04.md)
> for live ticket status, ownership, order, and closure evidence.
> Validator compatibility marker: `CANONICAL FULL-WORDING CHECKLIST`.

> **Execution authority — C07**
>
> This is the sole execution checkbox owner for Component 07. It preserves the recovered `9e6e7b2d` hierarchy, with exact approved row replacements in `canonical-task-overrides.json`. Master, recovered, and audit copies provide reconciliation evidence only; their checkboxes/status are not execution boxes.
>
> Any inherited `documentation/tasks/PRD0062/**` pointer below is evidence-only; use PRD0062b-local authority and task files for execution.
>
> **Authority note:** The current canonical PRD, the 2026-07-17 student-safe full-document decision, and `canonical-task-overrides.json` govern Source Delivery rows. Amendment §§1/3 mandatory packet contracts and sequential readiness control remaining conflicts with weaker `9e6e7b2d` risk-scaled/parallel wording. Course/Class/public remain Full V1 destination. No remote/deployed claim follows from local evidence.

# Task List: PRD0062 Component 07 - Cross-Feature Delivery And Results

Status: IMPLEMENTING. Existing bounded local delivery/result work is retained; C07 `1.4` is open for proof against the authenticated full-document Source Delivery contract.

Source PRD:
- `documentation/tasks/PRD0062/supporting/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/supporting/tasks-book-activity-master-orchestration.md`

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
- Book Delivery owns access, pinned versions, Page Group/physical-page mapping, one opaque authorized student-safe document resource, schedule state, result state, and reload-safe launch restoration. It never receives or constructs private R2 authority or a teacher-only source.
- Callers pass context and intent. They do not inspect Book tree, manifest, Page Group, Source Version, Activity Version, or Review Checkpoint storage.
- Book-originated integrations must reference a frozen Placement binding, not a bare Activity ID.
- Every attempt has a globally unique `attemptId`. `studentId + activityId` is viewer grouping only; completion remains placement/delivery-specific.
- Course/Class must resolve exact placement/context, not ambiguous `materialId`.
- Live Session data contract may be prepared, but Book Activity execution in Live is not V1.

## Risk-Scaled Change And Closure Rule

Follow the master risk-scaled contract. Record outcome/non-scope, owner/interface, compatibility boundary, focused tests, and changed failure proof here; add a separate Packet 7 contract only for triggered detail that cannot stay concise.

Keep access resolution, exact placement, draft/attempt isolation, result visibility, public-safe projections, browser behavior, and regressions as separate proof classes. Rendering never proves authorization. Before `VERIFIED`, reconcile only touched current-state docs and run focused proof plus governance/diff checks. Create a handoff only under the master conditional-handoff rule.

## Tasks

- [ ] 1.0 Extend the foundation Book Delivery module interface
  - [ ] 1.1 Extend `resolveBookDelivery(request)` from Solo/preview to Homework, Course, Class-linked Course, public, and future Live surface values without reimplementing the foundation path.
  - [ ] 1.2 Define one revision-bound `applyBookDeliveryAction(deliveryId, action, expectedRevision)` command surface rather than exposing storage-shaped lifecycle methods.
  - [ ] 1.3 Keep Activity listing, pin resolution, entitlement/schedule checks, attempt targeting, result visibility, and checkpoint interpretation internal to Book Delivery.
  - [ ] 1.4 Make Book Delivery authorize one complete pinned student-safe PDF for the current student/context/entitlement and receive one opaque document resource. It never constructs private object keys, storage credentials, provider URLs, or teacher-only source resources.
  - [ ] 1.5 Normalize caller context while keeping caller-owned IDs opaque to runtime.
  - [ ] 1.6 Return a student-safe runtime projection with the pinned Source Version, one opaque document resource, Page Groups/page-to-Activity mappings, ordered Activities, access/deadline state, submission/result state, and update/review metadata.
  - [ ] 1.7 Add tests proving callers cannot bypass Book Delivery by passing mismatched context/placement/student combinations.

- [ ] 2.0 Implement lean Placement binding resolution
  - [ ] 2.1 Define frozen Placement binding with `bookId`, selected subtree/Activity context, `manifestVersionId`, pinned student-safe `sourceVersionId`, Page Group/one-based physical-page mapping, `placementId`, `activityId`, `activityVersionId`, `bindingRevision`, completion aggregation policy, and `titleSnapshot`.
  - [ ] 2.2 Resolve Book path, Page Group/physical-page mapping, visible order, Source Version, source page labels, and source-assisted context through `manifestVersionId` and Placement; resolve the authorized full-document resource only through Book Source Delivery.
  - [x] 2.3 Reject bindings where Activity, Source, Manifest, or Placement versions do not match the delivery surface.
  - [ ] 2.4 Ensure Book Delivery, Homework, Course, and future composition consume the same binding shape.
  - [ ] 2.5 Add tests proving exact placement binding prevents ambiguous reuse.

- [ ] 3.0 Implement context-owned access rules
  - [ ] 3.1 Implement Solo access from Book solo/public visibility and archive status.
  - [ ] 3.2 Implement Homework access from assignment target, open/scheduled access, deadlines, and per-student overrides.
  - [ ] 3.3 Implement Course access from enrollment, module release, and exact Course material placement.
  - [ ] 3.4 Implement Class-linked Course access from class-owned Course/Homework object.
  - [ ] 3.5 Preserve archived Books for existing pinned Homework, Course, and Class-linked Course deliveries according to their owning access rules while blocking new Solo launches and new placements.
  - [ ] 3.6 Prove archive blocks new Solo launches/assignments/placements but does not itself silently mutate, repin, or revoke already assigned pinned deliveries. Explicit Source/version replacement, entitlement supersession/revocation, restore, or trusted delete cleanup must invalidate stale document authorization while historical attempts/checkpoints remain readable.
  - [ ] 3.7 Add tests for each access surface and archived Book behavior, including Homework/Course/Class pinned delivery survival and no silent invalidation.

- [ ] 4.0 Implement surface pinning and update policy
  - [ ] 4.1 For Solo, pin current Activity Version, student-safe Source Version, and Page Group/physical-page mapping at attempt start; a new attempt may use the latest published binding.
  - [ ] 4.2 For Homework, use assignment-pinned Activity Version, Source Version, and Page Group/physical-page mapping until the teacher applies a selective update.
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
  - [x] 6.1 Store each Activity submission as one immutable Activity attempt with a globally unique `attemptId`.
  - [ ] 6.2 Group attempts by `studentId + activityId` for result panel/dropdown display only; never use this grouping as persistence identity or completion authority.
  - [ ] 6.3 Store student ID, Activity ID, Activity Version ID, attempt ID, surface, exact placement/delivery context, applicable assignment/Course material ID, creation/submission timestamps, visibility-owner context, Source Version where source-assisted, and grading/regrading history per attempt.
  - [ ] 6.4 Display each attempt's answers, corrections, score, feedback, version, and source context.
  - [ ] 6.5 Keep separate Activities in separate result pages/panels.
  - [ ] 6.6 Ensure Unit/Book/Course/Homework summaries aggregate progress only and link to Activity results.
  - [x] 6.7 Ensure result viewing never transfers completion across surfaces.
  - [ ] 6.8 Add result grouping tests using the Solo Monday / Homework Wednesday example from the PRD.

- [ ] 7.0 Preserve result visibility and ownership boundaries
  - [x] 7.1 Let students see their own permitted attempts.
  - [x] 7.2 Let teachers see only attempts created under teacher-owned Homework/Course/Class/Live authority.
  - [x] 7.3 Keep private Solo attempts private unless later policy changes.
  - [x] 7.4 Gate Homework attempt feedback by Homework feedback release timing.
  - [ ] 7.5 Warn when delayed/manual-feedback Homework selects Activities that may already be visible through Solo or prior feedback.
  - [ ] 7.6 Make assignment preview warning the V1 fork/copy entry point when secrecy matters; the fork receives a new Activity ID and separate result history.
  - [ ] 7.7 Preserve warning-first policy; do not automatically lock Solo access.
  - [ ] 7.8 Add tests proving teacher result visibility never exposes private Solo attempts and fork/copy keeps result history separate.

- [ ] 8.0 Add Course/Class Book placement support
  - [x] 8.1 Allow a Course material item to reference a selected Book subtree.
  - [x] 8.2 Allow a Course material item to reference a single Activity with required source context where applicable.
  - [x] 8.3 Resolve exact `courseMaterialId` or equivalent placement context, not bare `materialId`.
  - [x] 8.4 Store or resolve selected subtree/Activity Placement, pinned Manifest/Source/Activity versions, binding revision, and completion aggregation policy.
  - [x] 8.5 Mark Course item complete when required Activities under the selected Book placement are submitted.
  - [x] 8.6 Support optional Homework-created-from-Course progress credit only when placement explicitly enables it.
  - [ ] 8.7 Ensure class-linked Course copies receive Book changes only through explicit sync/update.
  - [ ] 8.8 Add tests for exact binding dimensions, duplicate same-Activity Course placements, and class-linked Course sync behavior.

- [ ] 9.0 Implement Public Library publication and entitlement-gated student-safe document delivery
  - [ ] 9.1 Validate public publication state separately from private/assigned delivery state, without storing or revalidating rights-attestation metadata.
  - [ ] 9.2 Support explicit states: metadata-only public, tree/ref public with runtime blocked, and playable public only after trusted publication, canonical student-safe Source Version readiness, authenticated document delivery, and public entitlement checks succeed.
  - [ ] 9.3 Block source-assisted runtime launch and source-document delivery when the Book/Unit is unpublished, the Source is not canonical/student-safe, or the public entitlement is inactive.
  - [ ] 9.4 Build public-safe projections that exclude private source object keys, storage/provider authority, teacher-only sources, answer keys, teacher notes, authoring candidates, homework/update metadata, and unreleased feedback.
  - [ ] 9.5 Route public launch through Book Delivery and revalidate public access, immutable publication, active public entitlement, and pinned student-safe Source Version at launch and document-resource refresh time.
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
  - [x] 11.1 Inspect `TestPageRouter`, session manager, and live runtime prior art only as context.
  - [ ] 11.2 Define future Live data contract requirements without enabling Book execution in Live.
  - [x] 11.3 Ensure no V1 UI offers Book Live Session launch.
  - [ ] 11.4 Add tests or guardrails proving Book Live execution is not reachable in V1.

- [ ] 12.0 Preserve cross-feature regressions
  - [x] 12.1 Prove Student Practice launcher dispatches Book without breaking existing material types.
  - [x] 12.2 Prove Reading V2 pinned assignment launch remains stable.
  - [ ] 12.3 Prove result visibility and ownership behavior remains stable for existing result types.
  - [ ] 12.4 Prove Course/Class existing materials still launch and sync.
  - [ ] 12.5 Prove public Book projection cannot leak private refs, storage/provider authority, teacher-only sources, answer keys, or unpublished Source Versions; playable public delivery returns only the governed complete student-safe PDF.
  - [ ] 12.6 Update findings with final Book Delivery, result, Course/Class, public projection, and Content Catalog owner paths.

### Evidence-hardening subtasks (append-only; parent boxes remain open)

- [ ] 1.8 Keep one data owner per cross-feature surface: Book Delivery resolves the scoped summary/projection once, while library/course/result widgets consume it without duplicate loaders or repair writes. Callers must not read broad top-level `books`, `tests`, `classes`, or history nodes to filter client-side.
- [ ] 1.9 Expose summary and detail selectors from the same delivery owner, with stale-while-revalidate on revisits: preserve last good list/detail content, refresh in background, and use blocking loading only when no usable prior data exists.
- [ ] 1.10 Add read-budget tests proving no per-card/per-Activity result or progress fetches (N+1) and no mount-time backfill/repair writes. Bulk-enrich secondary history/progress once, index by join key, and join in memory.
- [ ] 6.9 Add visible result context labels on summary, panel, and detail surfaces: delivery surface (`Solo`, `Homework`, `Course`, or `Class`), Book/Unit/placement path, Activity title, Activity and Source Version labels, source printed-page citation where source-assisted, attempt status, and feedback/regrade state. Source labels identify exact correspondence only; they must not become competing Activity headings, navigator/progress numbering, or a second ordering system. Labels must remain understandable at 200% zoom and never expose hidden IDs as a substitute for context.
- [ ] 6.10 Keep summary/detail links context-safe: opening an attempt from a notification, course item, or result panel must resolve the same placement/binding and source labels, with an explicit unavailable/permission fallback instead of silently switching to another surface.
- [ ] 12.7 Add cross-feature regression assertions for one-owner reads, stale-while-revalidate revisits, bounded read counts, no broad reads, no N+1 enrichment, and result context/placement/version/source-label continuity across list, panel, detail, and notification entry points.

## Amendment-compliant packet contract

### Storage

Book Delivery owns scoped delivery projections, frozen Placement bindings, drafts, immutable Activity attempts, result metadata, completion, and public projections. Record immutable versus mutable fields, owner, indexes, archive/delete behavior, backup/restore path, and rollback for each changed node. Reuse accepted unchanged Activity/Source/Placement rows by reference; never introduce bare `materialId` authority.

### Security/rules

Require owner- and context-scoped reads/writes for student, teacher, Homework, Course/Class, Solo, and public states. Add positive owner checks plus wrong-student, wrong-teacher, wrong-placement, stale-version, private-Solo, unpublished/unauthorized-entitlement, and public-leakage negatives. Browser clients cannot rewrite pins, attempts, completion, visibility, publication, or entitlement authority; production rule authority and emulator status must be named before closure.

### UI/accessibility/announcements

Result/review, Course/Class, and public launch surfaces consume the Book Delivery projection and preserve existing launcher boundaries. User-facing create/save/update/publish/assign outcomes use shared announcements (`role="status"` for success/info/warning, `role="alert"` for failures); labels expose surface, placement, Activity/Source Version, and printed-page citation/correspondence without creating a second Activity order. Apply UI design, student mobile, student data-loading, navigation, and accessibility rules; service-only chunks record `N/A`.

### Migration/compatibility

Preserve Solo, non-Book Homework, Course/Class, existing result visibility, specialized launchers, Reading V2, and Listening contracts. Do not silently repin, transfer completion, write aggregate grades, expose private PDFs, or backfill publication/entitlement authority. Reference-first composition remains future scope; Course/Class/public remain Full V1 destination.

### Tests

Run focused owner tests for exact placement, draft/attempt/result isolation, visibility, public projection, stale/replay/idempotency, read budgets, and cross-feature regressions. Add adversarial negatives and named adjacent suites only for touched risk; record command, cwd, runner/config, exit, executed tests, omitted suites, and product-vs-harness result.

### Browser/runtime proof

At relevant lane exits, prove result/review on student `http://localhost:5174`, Course/Class on its role path, and trusted-publication/active-entitlement public launch only when available. Record desktop/mobile/reload/accessibility/console evidence and residuals. Browser evidence cannot substitute for rules, CAS, version, placement, or remote/deployed proof.

### Authority reconciliation

Map each C07 ID to the current canonical PRD, `canonical-task-overrides.json` where applicable, the Approved Amendment (`prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md`) §§1, 3, 5–9, 12–16, local `authority-and-provenance.md`, `reconciliation-ledger.md`, `streamlined-prototype-orchestration.md`, and `implementation-audit.md` Component 07, plus source owner, test title, negative proof, findings/traceability row, and taskbox. The approved 2026-07-14 override controls changed rows; Amendment §§1/3 mandatory packet contracts and sequential readiness control remaining conflicts.

### Evidence classification

Classify each claim as `VERIFIED_LOCAL_FAITHFUL`, `PARTIAL`, `IMPLEMENTED_UNVERIFIED`, `NOT_STARTED`, browser/local, or remote/deployed. `[x]` is reserved for audited local-faithful evidence listed in the reconciliation map; local tests and untracked implementation never establish remote faithfulness.

### Rollback/blockers

Rollback preserves prior immutable bindings, drafts, attempts, and projections; stale or unauthorized writes fail closed without repair writes. Block on authority conflict, missing negative proof, unsafe dirty-path overlap, unhealthy harness, required approval, or absent Course/Class/public evidence. Do not broaden scope, edit current PRD0062/code/cloud, or claim closure while blockers remain.

## Reconciliation markers

`[x]` appears only for `VERIFIED_LOCAL_FAITHFUL` local evidence. Parent rows stay open when any child remains open. No local checkbox asserts remote/deployed behavior.

| IDs | Classification | Checkbox authority |
|---|---|---|
| `2.3`, `6.1`, `6.7`, `7.1`–`7.4`, `11.1`, `11.3`, `12.1`, `12.2` | VERIFIED_LOCAL_FAITHFUL | `[x]` bounded local evidence only |
| `1.1`, `1.3`, `1.4`, `1.6`, `1.7`, `1.8`–`1.10`, `2.2`, `2.5`, `3.1`, `4.1`, `4.2`, `5.1`–`5.8`, `6.3`–`6.5`, `6.9`, `6.10`, `7.8`, `9.1`, `9.2`, `9.4`, `11.4`, `12.5` | PARTIAL | `[ ]` open; `1.4` reopened for corrected one-page contract proof |
| `12.3`, `12.4` | IMPLEMENTED_UNVERIFIED | `[ ]` open |
| `1.2`, `1.5`, `2.1`, `2.4`, `3.2`–`3.7`, `4.3`–`4.6`, `5.9`, `6.2`, `6.6`, `6.8`, `7.5`–`7.7`, `8.0`–`8.8`, `9.3`, `9.5`, `9.6`, `10.0`–`10.8`, `11.2`, `12.6`, `12.7` | NOT_STARTED | `[ ]` open |
| Parent rows `1.0`–`7.0`, `9.0`, `11.0`, `12.0` | PARTIAL | remain `[ ]` until children close |

## Implementer contract

- **Files:** this canonical C07 checklist and its immutable recovered baseline only; no code, cloud, current PRD0062, staging, or commit.
- **Counts:** 100 exact task IDs; 11 checked VERIFIED_LOCAL_FAITHFUL and 89 open. Renderer-dependent evidence does not close the replacement full-document delivery rows.
- **Recovery proof:** body sourced from Git target `9e6e7b2d`; recovered file preserves target body with immutable evidence banner and no execution checkbox/status authority.
- **Residuals:** Course/Class/public delivery, full context matrix, Content Catalog, public publication/entitlement gate, and reconciled findings remain open; local evidence does not imply remote/deployed proof.

## Student-safe full-document decision — 2026-07-17

This decision supersedes the earlier one-page authority note and reconciliation wording above. Book Delivery authorizes one complete pinned student-safe PDF per delivery context and returns one opaque document resource. Page Groups remain page-to-Activity mapping metadata. C07 keeps all existing access, pinning, result, Course/Class, public, reload, and revocation responsibilities; only rendition identity, per-page grants, and full-source prohibition are removed.
