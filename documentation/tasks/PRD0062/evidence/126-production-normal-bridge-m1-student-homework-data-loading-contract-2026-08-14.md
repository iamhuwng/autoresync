# PRD0062 Milestone-1 Student Homework Data-Loading Contract Evidence

Date: 2026-08-14
Scope: Standards freeze blockers only

## Surfaces and non-goals

This evidence covers only `/student/homework` and `/student/homework/:homeworkId` inside `StudentShellRoute` and `StudentShellDataProvider`.

Non-goals: Courses, Library, Academic Record, other student shell surfaces, Book/bridge architecture, canonical schema, Runtime validation, Delivery ownership, and Milestone 2. The inherited compatibility behavior inside the canonical `getStudentClasses()` service is not refactored here because that would alter every student class consumer; the Homework page/list does not instantiate or call that membership service separately.

## Canonical owners and read paths

### Shell summaries and list

- Canonical owner: `StudentShellDataProvider` through `useStudentShellData`.
- Shell-owned data: enrolled class summaries and Homework list summaries.
- Membership path: the provider performs the one `getStudentClasses(studentId)` ownership read. Its canonical indexed path is `student_classes/{studentId}/{classId}`, with each visible row verified against `classes/{classId}`. Existing legacy compatibility inside that owner remains owner-internal; the Homework loader does not invoke it again.
- Homework list boundary: `useStudentHomeworkList(studentId, { studentClasses })` -> `getStudentHomeworkList(studentId, { studentClasses })` -> `getHomeworkForStudent(studentId, { studentClasses })`.
- Assignment queries: one `homework_assignments` query where `target.studentIds array-contains studentId`, plus one bounded `homework_assignments` query where `target.classId == classId` for each shell-owned enrolled class. Results are deduplicated by assignment id.
- Secondary enrichment: ordinary Homework uses one student-wide `homework_submissions` query where `studentId == studentId`, indexed in memory by `homeworkId`. There is no per-card submission or progress fetch. A Book-only list performs no legacy submission query and performs no Book progress fetch.
- Fallback: callers genuinely outside `StudentShellDataProvider` may omit `studentClasses`; only that omitted case allows `getHomeworkForStudent` to perform its existing membership read.

### Detail

- Canonical page owner: `StudentHomeworkDetailPage` through `useHomeworkSubmission` owns page-specific `homework_assignments/{homeworkId}` detail.
- Exact detail path: one `getHomeworkById(homeworkId)` document read.
- Book compatibility assignment: the resolved detail is checked in the hook; no `homework_submissions` query runs. Book progress remains detail-on-demand through the trusted Book bridge endpoint `/book-homework/assignments/{homeworkId}/students/{studentId}/projection`.
- Ordinary Homework: the same resolved detail is passed to `getStudentSubmissionsForHomework`; the service retains its ordinary bounded query where both `homeworkId == homeworkId` and `studentId == studentId`, without rereading the Homework document.
- Other secondary detail reads, such as ordinary test material, remain page-specific and unchanged.

## Refresh policy

The first Homework-list load blocks while no successful data exists. The shell waits until its membership owner has resolved before enabling the list loader, preventing a fallback membership read and preventing a false empty state during initial ownership resolution.

After the first successful list load, `refreshData()` retains the last-good `homeworkItems` and leaves the blocking `isLoading` state false while revalidating. Success replaces the list; failure reports the refresh error without first clearing last-good content. Membership changes replace the hook's bounded `studentClasses` input, so the list reloads once from the new owned set rather than combining an automatic reload with a second manual refresh.

## Read-model lifecycle and no-write-on-read

- Class membership source: canonical class membership/roster state. The `student_classes` projection is created and updated by enrollment, approval, removal, and class-delete workflows. Readers verify missing/deleted canonical classes and do not repair projection rows on mount.
- Ordinary Homework source: `homework_assignments`; ordinary `homework_submissions` remains the submission source. List aggregation is in-memory and is not persisted by the page.
- Book list source: the trusted Book Homework bridge creates/updates the discovery-only compatibility projection in `homework_assignments`. Missing or stale projection repair belongs to that bridge/maintenance pipeline, never the student list.
- Book progress source: the trusted Book bridge projection endpoint. The compatibility shell is not authoritative for progress.
- No mount, list, detail, refresh, or progress read added by this slice performs `setDoc`, `updateDoc`, `deleteDoc`, batch writes, repair, backfill, or any other persistent mutation.

## Required self-check answers

1. Duplicate shell ownership: **No.** The Homework page consumes the provider-owned list, and the list loader receives the provider-owned enrolled classes. The fallback hook is disabled inside the provider.
2. Per-item enrichment loop: **No.** Ordinary submissions are fetched once and joined in memory; Book list rows do not fetch progress or submissions.
3. Broad-node read: **No new Homework page/list broad read.** Assignment reads are direct-student or per-owned-class bounded queries. The one canonical shell membership owner retains its pre-existing class-service compatibility behavior as an explicit non-goal; the Homework path no longer invokes that owner a second time.
4. Mount-time mutation: **No.** These list/detail paths are read-only, including missing/stale projection handling.
5. Blocking revisit/refresh: **No after first success.** Last-good list content remains visible while refresh revalidates; only an initial load without usable data blocks.

## Governing citations

- `documentation/rules/student-data-loading.md`: single owner, summary-first/detail-on-demand, no write-on-read, bounded reads, bulk enrichment, stale-while-revalidate, lifecycle, and five-question review gate.
- `documentation/architecture/student-shell-data-loading.md`: `StudentShellDataProvider` ownership, provider fallback rules, service membership-input rule, Homework boundary, and browser verification standard.
- `documentation/architecture/homework-solo-practice-architecture.md`: shell Homework summary ownership and page-specific detail boundary.
- Companion patterns named by the rule apply conceptually: `pattern-student-shell-single-data-owner`, `pattern-summary-first-detail-on-demand`, and `pattern-bulk-enrichment-from-shared-student-history`; no standalone files for those aliases are present in this checkout.
- `documentation/rules/observability.md`: Homework actions and feature registry stay synchronized.

## Focused proof mapping

- No second class-membership loader: `src/hooks/useStudentShellData.test.ts` and `src/services/homeworkManager.test.ts` prove shell-owned classes are passed through and `getStudentClasses` is not called by `getHomeworkForStudent` when supplied.
- No per-card list enrichment and Book-only no legacy query: `src/services/homeworkSubmissionService.test.ts` proves one list service boundary and zero `getDocs` calls for a Book-only list.
- Book detail one exact document read and no legacy query: `src/hooks/useHomeworkSubmission.test.ts` proves one `getHomeworkById` call and zero `getStudentSubmissionsForHomework` calls for Book detail.
- Ordinary detail unchanged: the same hook test proves ordinary detail calls `getStudentSubmissionsForHomework` with the already resolved Homework; the service suite retains ordinary submission behavior.
- No write-on-read: service harness assertions for the Book list/detail paths observe no Firestore write call; source inspection shows only read/query calls in the changed loading path.
- Refresh preserves visible content: `src/hooks/useHomeworkSubmission.test.ts` holds a refresh promise pending and proves prior items remain present with non-blocking loading state.
- Book progress remains authoritative/detail-on-demand: `src/pages/StudentHomeworkDetailPage.test.tsx` and `src/services/homeworkSubmissionService.test.ts` prove trusted progress loading and launch without legacy score/submission mapping.
- Book-specific observability: `StudentHomeworkListPage.test.tsx`, `StudentHomeworkDetailPage.test.tsx`, and `featureRegistry.test.ts` prove the two registered handler emissions and safe metadata.

## Exact verification results

- Focused ESLint on the 14 changed Homework/registry/loading source and test files: **PASS**, no findings.
- Focused loading/page/registry command: **7 files, 64 tests passed**.
- Homework list/detail, shell, registry/observability command: **12 files, 103 tests passed**.
- Runtime host, canonical codec unit, and fail-closed unit command: **9 files, 46 passed, 10 emulator-gated tests skipped**; the skipped Firestore cases were then run explicitly below.
- Renderer registration/registry: **2 files, 12 tests passed**.
- Current committed-state production replay/product consumption: **1 file, 2 tests passed**.
- Ticket-59 production-normal workflow round trip: **5 files, 57 tests passed**.
- Bridge/authority/context/projection suite: **8 files, 59 tests passed**.
- Historical V17 workerd replay: **1 test passed**.
- Frozen literal production-command negative: **1 test passed**.
- Canonical Activity Version RTDB emulator codec: **1 test passed**.
- Homework Firestore rules emulator: initial run found one stale positive fixture using the retired `book_homework_service` claim while the same suite correctly denied that claim. The fixture was aligned to the accepted compatibility-service claim; rerun: **15 tests passed**, including all fail-closed negatives.
- Root `json`: restored byte-for-byte from `HEAD`; `git diff --quiet -- json` returns success and the path is absent from `git status --short`.
- Browser Runtime config: **environment-blocked before test execution**. Native Vite is healthy at `http://localhost:5174`, but Playwright Chromium exits with code 127 because `libnspr4.so` is absent. The environment has no installed copy and no non-interactive sudo. Runtime-host unit tests remain green; no browser behavior claim is made from this failed launch.

## Live browser follow-up — 2026-08-14T17:13Z

- The Chromium startup blocker was removed without changing the repository or system installation by unpacking the three missing arm64 runtime packages under `tmp/prd0062-browser-libs` and supplying that directory through `LD_LIBRARY_PATH`.
- Supported local Firebase browser authentication succeeded through `http://localhost:5174` with the existing Student dev quick-login account.
- Live sibling navigation `Student Dashboard → Homework → Dashboard → Homework` succeeded against the real `StudentShellRoute`. On the warmed return, `My Homework` was immediately visible and `aria-label="Loading homework"` was not visible (`loaderOnSiblingReturn: false`); the initial loading probe emitted no browser console errors.
- The exact loading-owner/read-path assertions remain the focused unit/service proofs above; the browser run proves the mounted shell lifecycle and stale-while-revalidate presentation contract rather than attempting to infer Firestore ownership from transport internals.
- The preactivation Book Runtime Playwright fixture reached the intentional fail-closed `Activity window unavailable` screen because production remains 100% on the deny-only rollback Worker. The current deployment-equivalent workerd replay reran after the renewed config and passed **2/2**, including committed-shell repair and the minimum trusted return path. Live Runtime browser verification remains an explicit post-activation keep-or-rollback condition.

## Addendum — 2026-08-15: additive Book list facade reconciliation

The current additive design keeps the existing Homework contract while adding
`src/services/book-homework/bookHomeworkStudentList.service.ts` as the Book-aware
list facade. The shell path is now:

`useStudentShellData` → `useStudentHomeworkList({ studentClasses })` →
`getBookCompatibleStudentHomeworkList` → `getHomeworkForStudent({ studentClasses })`.

`StudentShellDataProvider` remains the canonical owner of enrolled class
summaries. The list is not enabled until that owner has resolved for the active
student, so the shell path does not trigger a fallback membership read. The
facade accepts the shell-owned class IDs and passes them through; callers outside
the provider may still omit them and retain the existing `getHomeworkForStudent`
fallback behavior.

### Exact raw-shell normalization boundary

`getHomeworkForStudent` remains the Firestore-to-assignment boundary. Each raw
assignment is passed through `normalizeHomeworkAssignment` before the facade
sees it. A strict `isBookHomeworkCompatibilityProjection` match is returned
unchanged: the Book compatibility shell keeps its exact marker and does not gain
legacy `status`, `stats`, `studentOverrides`, or other synthesized fields.
Ordinary Homework continues to receive only its existing legacy defaults
(`tags`, `archived`, and `studentOverrides`). This is the boundary between the
raw compatibility shell and the legacy Homework projector; no later list step
re-normalizes a Book row into a legacy record.

The facade then partitions the normalized assignments. Book rows become neutral
`StudentHomeworkListRecord` values (`submission: null`, zero attempts, and
`canSubmit: false`/`canViewFeedback: false`) for discovery only. Ordinary rows
alone are passed to the unchanged bulk projector with one student-wide
`getStudentSubmissions(studentId)` read and an in-memory join. The legacy public
`getStudentHomeworkList(studentId)` API remains one-argument and preserves its
prior query/projector behavior; only the pure
`buildStudentHomeworkListRecords` projector is shared by the additive facade.
Detail keeps one `getHomeworkById(homeworkId)` read, skips
`getStudentSubmissionsForHomework` for Book, and preserves that API for ordinary
Homework.

### Refresh, read-only behavior, and non-goals

The list hook blocks only before the first successful load for a student. On
refresh, including a refresh caused by a changed shell-owned membership set,
`lastSuccessfulStudentIdRef` leaves `isLoading` non-blocking and retains the
last-good list until the new result replaces it. Membership ownership changes
therefore produce one facade reload rather than a second loader or a manual
duplicate refresh. This remains stale-while-revalidate behavior for the warmed
Homework surface.

The facade, list hook, detail hook, and normalization boundary perform no
persistent writes, repair, backfill, projection creation, or projection cleanup
on read. Projection lifecycle remains owned by the trusted Book bridge and its
maintenance path. Non-goals remain Courses, Library, Academic Record, unrelated
student-shell surfaces, canonical Book schema or Runtime authority, and any
refactor of the legacy membership-service compatibility fallback.

### Required self-check reconciliation

1. Duplicate shell ownership: **No.** The shell resolves memberships once and
   passes them into the facade; the facade forwards them to
   `getHomeworkForStudent` without instantiating another membership owner.
2. Per-item enrichment loop: **No.** Ordinary submissions are fetched once and
   joined in memory; Book rows perform neither per-card submission reads nor
   progress reads.
3. Broad-node read: **No new Homework broad read.** Assignment queries remain
   direct-student plus bounded per-shell-class queries. The pre-existing
   compatibility behavior inside the canonical class service remains an
   explicit non-goal, not a new Homework-page read.
4. Mount-time mutation: **No.** Normalization, facade partitioning, list/detail
   loading, and refresh are read-only; bridge projection repair is outside the
   student page mount.
5. Blocking loader on tab/list revisit: **No after first success.** Last-good
   content stays visible while the warmed list revalidates; only the first load
   without usable data blocks.

### Latest focused verification

- `node_modules/.bin/vitest run src/services/book-homework/bookHomeworkStudentList.service.test.ts src/services/homeworkSubmissionService.test.ts src/hooks/useHomeworkSubmission.test.ts src/hooks/useStudentShellData.test.ts src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx --maxWorkers=1`: **6 files, 35 tests passed**.
- `node_modules/.bin/vitest run src/services/homeworkManager.test.ts src/services/book-homework/bookHomeworkStudentList.service.test.ts src/hooks/useHomeworkSubmission.test.ts src/hooks/useStudentShellData.test.ts --maxWorkers=1`: **4 files, 23 tests passed**.
- Focused ESLint over the current Homework loading/facade/normalization source and test files: **PASS**, no findings.
- The equivalent harness-mediated Vitest invocation was attempted but stopped in harness preflight because the isolated cache lacks `@esbuild/win32-x64/esbuild.exe`; the direct local Vitest runs above completed successfully. No browser or production transport claim is inferred from this unit-test verification.

This addendum supersedes the earlier list-boundary wording that named
`getStudentHomeworkList(studentId, { studentClasses })`, and the earlier detail
wording that passed `resolvedHomework` into the legacy submission service. The
final implementation keeps `getStudentHomeworkList(studentId)` and
`getStudentSubmissionsForHomework(homeworkId, studentId)` at their original
public signatures. Membership is carried only through the existing hook and
assignment-query boundary into the additive Book facade; Book detail suppresses
the legacy query before calling the unchanged submission API.

The post-audit re-enable case is also covered: disabling the shell clears
`classesOwnerStudentId`; re-enabling cannot enable Homework until fresh class
ownership resolves. The focused owner/facade/service rerun passed **5 files, 36
tests**. Independent Book handoff verification passed **10 files, 102 tests**;
independent ordinary-only regression verification passed **49 tests with zero
failures** (16 Book-specific cases intentionally excluded from that legacy-only
run). Final focused ESLint and `git diff --check` passed.

The final teacher-detail boundary uses the same additive rule inside
`useHomeworkDetail`: after the one exact assignment document read, a strict
compatibility projection resolves without creating a legacy
`homework_submissions` subscription. Ordinary assignments and missing ordinary
IDs still create the original subscription, and a same-ID refetch retains that
listener instead of adding another read. An exact compatibility fixture without
legacy `status` or `stats` renders the teacher Book surface safely. The hook and
Homework list/detail/service regression set passed **11 files, 90 tests**; the
locator/StudentPractice/Runtime-host/registry set passed **4 files, 64 tests**.
The new teacher Book-detail boundary action is registered as
`bookHomeworkTeacherDetailOpened`; the required student actions remain
`bookHomeworkStudentDetailOpened` and
`bookHomeworkStudentLaunchRequested`.
