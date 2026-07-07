# Student Data-Loading Rule

Use this rule for every change that touches student shell pages, Academic Record, Library, Homework, Courses, Class Detail, or any student-facing tab/list data-loading path. The goal is to stop new work from reintroducing duplicate data owners, broad scans, per-item enrichment loops, write-on-read behavior, or full blocking reloads on revisits.

Companion docs:
- `@doc/architecture/student-shell-right-rail-architecture`
- `@doc/architecture/academic-record/academic-record-page-architecture`
- `@doc/patterns/pattern-student-shell-single-data-owner`
- `@doc/patterns/pattern-summary-first-detail-on-demand`
- `@doc/patterns/pattern-bulk-enrichment-from-shared-student-history`

## 0. Review Gate

Reviewers block merge for any student data-loading change if any required artifact is missing:
- the canonical data owner for the surface
- the summary-vs-detail contract for the surface
- the refresh policy after first successful load
- the exact data path or read model being used
- the relevant rule, pattern, and architecture citations
- the verification scenarios that prove the surface avoids duplicate ownership, N+1 enrichment, and blocking revisits

Missing any of the above means the task is not review-complete.

## 1. Required Before Coding

Every student data-loading task must name:
- the exact route, page, widget, tab, or list surface
- the canonical data owner
- whether the surface consumes summaries/read models or full detail
- the exact data path(s) read
- whether any secondary enrichment is required
- the refresh model after first success
- the exact tests to run or add
- the exact docs to update
- the explicit non-goals

If any of those are missing, the task is not ready.

## 2. Single Data Owner

Shell-owned shared data must not be fetched again in page code.

Required rules:
- shell-shared data has one owner
- the shell owner lives in `StudentLayout` or a dedicated shell provider consumed by `StudentLayout`
- `StudentRightRail` and page-level widgets consume the same owner for the same dataset
- page code may derive selectors from shell-owned data, but it must not instantiate a second overlapping loader for the same source

If the same student dataset is shown in the right rail and in page content, the read happens once.

## 3. Host Owns Tab And List Data

Student tab hosts fetch base datasets once. Tab panels do not independently query list data on mount.

Required rules:
- the page host owns the base dataset for its tabs and major list surfaces
- child tabs receive filtered, grouped, or selected views of host-owned data
- tab switches must not create a new list-data owner unless the surface is a genuine detail drill-down

For Academic Record specifically:
- `AcademicRecordPage` owns the base dataset
- `Overview`, `THCS`, `IELTS`, `Writing`, and `Course` surfaces are selectors or presentational views over host-owned data

## 4. Summary First, Detail On Demand

Lists and widgets use summary DTOs or student-safe read models first. Full records load only for detail.

Use summary/read-model payloads for:
- list rows
- tab counts
- lightweight progress views
- recent activity widgets
- review queues

Reserve full detail for:
- opening a result panel
- entering an editor or grading surface
- explicit drill-down flows

If a summary or projection exists, student list surfaces must not default to the full canonical record.

## 5. No Write-On-Read

Page mount, tab switch, or list load must not repair, backfill, or mutate persistent student data.

Forbidden shapes:
- writing missing projections during render or mount-time reads
- repairing indexes during tab switches
- storing derived summary data as a side effect of list rendering
- treating page load as an acceptable place to backfill persistent data

If a read model requires backfill or lifecycle maintenance, that responsibility must live in the canonical write/update pipeline or in an explicit maintenance flow.

## 6. No Broad Top-Level Scans

Student views must not scan broad top-level nodes such as `classes` or `tests` and then filter client-side just to find the student's subset.

Required rules:
- read from a student-owned index, membership path, or bounded query
- keep read scope aligned to the current student and surface
- if a direct student-safe projection does not exist, the task must call out the missing read model before adding more client-side filtering

Broad scans that happen to work for a tiny dataset are still defects.

Current repo anchor for student class surfaces:
- `getStudentClasses()` should read `student_classes/{studentId}/{classId}` as the student-owned membership projection
- fallback scans of top-level `classes` are legacy compatibility behavior only and must not be the long-term steady-state design
- class enrollment, approval, removal, and delete flows own projection maintenance; student page loads must not repair missing membership rows
- `student_classes` rows may outlive a soft-deleted or missing canonical class if best-effort cleanup fails; student readers must verify `classes/{classId}` exists and is not `status: 'deleted'` before exposing the class

## 7. Bulk Enrichment, Never Per Card

Secondary data such as history, progress, or attempts is fetched once and joined in memory. It is never fetched once per card.

Required rules:
- fetch the base list once
- fetch the relevant student history once
- build a local index keyed by the join field
- enrich the list in memory

Forbidden shapes:
- `array.map(async item => fetchSecondaryData(item.id))`
- one result-history lookup per library card
- one progress read per tab row when the same history dataset can be shared

## 8. Revisit Behavior Uses Stale-While-Revalidate

After the first successful load, revisits keep prior content visible while refreshing in the background.

Required rules:
- a previously loaded tab or list should preserve its last good content
- refresh indicators should be lightweight once usable data already exists
- full blocking loaders are reserved for the first load or for cases where there is no usable prior data

If a user switches `Overview -> THCS -> Writing -> Overview`, the page should not behave as if each return is a first visit.

## 9. Read-Model Lifecycle Must Be Defined

If a summary/read model exists, its write, update, and backfill lifecycle must be defined alongside the canonical source.

Every read-model task must state:
- the canonical source of truth
- who creates the summary
- who updates the summary when canonical data changes
- how missing or stale summaries are detected
- how backfills are run outside of student page mounts

Student pages are consumers of read models, not silent repair workers for them.

## 10. Self-Check Before Review

Before requesting review, answer all of these:

1. Duplicate shell ownership check: did any page or widget instantiate a loader for data already owned elsewhere on the same surface?
2. Per-item enrichment loop check: does any card, row, or section perform its own history/progress fetch?
3. Broad-node read check: does the surface read a top-level node and filter client-side for the current student?
4. Mount-time mutation check: does page load, tab load, or list render write persistent data?
5. Blocking-loader-on-tab-revisit check: after one successful load, does the user still see a full blocking state on revisits?

Any "yes" must be fixed or called out as an explicit unresolved defect.

## 11. Required Citations For Future Work

Future student performance or data-loading work must cite:
- this rule doc
- the relevant pattern doc
- the relevant architecture contract

If the change touches multiple student surfaces, cite the contract for each affected owner.

## 12. Minimum Verification Scenarios

At minimum, use the relevant anchors for the change and prove these scenarios:
- a dashboard page and the right rail do not instantiate overlapping shell data loaders
- switching `Overview -> THCS -> Writing -> Overview` does not create fresh list-data ownership inside each tab panel
- a student library list does not call result-history lookup once per material card
- a student page does not read top-level `classes` or `tests` just to find that student's subset
- a student page mount does not perform repair or backfill writes
- reopening a previously loaded student tab keeps prior content visible while refreshing in the background

Static rendering checks are not enough when the risk is duplicate ownership, broad reads, or N+1 data loading.
