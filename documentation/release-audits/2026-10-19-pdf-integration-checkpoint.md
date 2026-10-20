# PDF integration checkpoint — October 19, 2026

Status: isolated, uncommitted work in progress; **not mergeable or deployable**.

**Current checkpoint: see the local browser continuation at the end.** The original
proof counts and paused design recommendation are historical and superseded.

The maintenance baseline remains separate. At this checkpoint, the canonical
checkout `C:/Users/The Lord/repos/luyentap` is clean and local `main`,
`origin/main`, and GitHub `refs/heads/main` all resolve to
`ebcccd65d1f1db4b1072d7e8bd397040f160e793`. This work made no production
deployment, rules/data change, or provider upload.

The candidate is in
`C:/Users/The Lord/.codex/worktrees/pdf-book-integration-20261019/luyentap-prd0062`,
branch `codex/pdf-book-integration-20261019`, based on that same commit. The
original dirty feature checkout and its saved browser draft remain preserved.
Do not synchronize that donor wholesale onto main.

## Implemented preparation

- Ported the local authoring, source transport, operation contract/client,
  submission workflow, component preparation and finalizer source into the
  isolated candidate. Shared main files were reconciled selectively.
- Added the platform IndexedDB transaction adapter. Local import may omit
  canonical Book/Unit identities; supplied foreign identities still fail, and
  the default canonical import contract remains strict.
- Preserved main's catalog moderation enum and private-only new-submission
  behavior. Manifest nodes now retain validated optional titles.
- Composed the five authenticated submission routes, with
  `BOOK_SUBMISSION_ROUTES_ENABLED` explicitly disabled in both checked-in
  Wrangler configurations.
- Added strict owner/Book/operation/fingerprint/lease claims, rejecting extra
  fields and slash-bearing identifiers.
- Fixed stale finalization: an expired attempt cannot commit a newer lease or
  undo cancellation. Both repositories have focused concurrency checks.
- Reused existing upload identity, upload runtime and canonical student-safe
  projection implementations; no dependency installation or duplicate helper.

These are source and focused-check results, not complete PDF acceptance.

## Verification actually executed

| Check | Result | Limit |
| --- | --- | --- |
| Focused Node/jsdom suite | 165 passed, 2 failed; 17 files | Both failures are the missing publication approval described below. |
| Adjacent source-upload Worker and canonical Activity repository suites | 40 passed; 2 files | Mocked provider/Firebase calls, not workerd or deployed behavior. |
| Fresh-browser IndexedDB check | Passed | Exact bytes/reload and owner separation, 40 updates across two tabs, abort preservation, explicit discard. A tiny storage fixture, not the authenticated app or a valid PDF upload. |
| Targeted TypeScript comparison | Failed | Candidate reports 389 diagnostics and the same selected existing main entry points report 387. The two new diagnostics concern unsupported `serverValidation` and missing `previewApproval`. This is a diagnostic comparison, not a clean repository type check. |
| RTDB rules acceptance | Not run | The delegated rules author stopped before writing either rules or tests. `database.rules.json` is unchanged. |

The tests ran from the canonical checkout's installed Vitest 3.2.4 with the
candidate as source root. The ignored resolver configuration reused installed
dependencies, including exact `pdf-lib` 1.17.1 from the donor. No dependencies
were installed or linked into the worktree. Native canvas warnings occurred;
the listed tests executed, but this does not qualify PDF rendering. No test
skips were reported in these two suite summaries.

Ignored evidence in the canonical checkout:

- `tmp/pdf-integration-fourth-tests-20261019.log`
- `tmp/pdf-integration-adjacent-tests-20261019.log`
- `tmp/pdf-integration-lease-tests-20261019.log`
- `tmp/pdf-integration-claim-tests-20261019.log`
- `tmp/pdf-indexeddb-check-20261019/report.json`
- `tmp/pdf-integration-typecheck-20261019.{mjs,json,log}`
- `tmp/pdf-integration-typecheck-main-comparison-20261019.{json,log}`
- `tmp/pdf-integration-vitest-20261019.config.mjs`

## Blocking seams

1. **Trusted preview/publication authority is absent from the donor submission
   flow.** `book-submission/publication.ts` passes a `serverValidation` tag to
   main's full/component adapters, which require `previewApproval`. Both
   publication tests fail at the adapter's approval timestamp check. The normal
   preview Worker generates durable owner/revision/fingerprint-bound approval;
   the publication authority gate checks it and revocation. The donor workflow
   goes directly from upload/preparation to commit and calls the in-memory
   canonical publication service, bypassing that normal authority-gate path.
   Do not fabricate an approval timestamp or copy the donor's permissive
   `serverValidation` alternative merely to make the tests pass.
2. **Pre-canonical upload authority is not reconciled.** The current source
   runtime's `authorizeOwner` and `authorizeDecision` require the canonical
   `material_catalog/books/{bookId}` row. The new workflow uploads against the
   operation's allocated `finalBookId` before that row exists. Generalize only
   the needed operation-bound authority, with active teacher, exact owner/Book,
   allowed lifecycle, expiry/cancel and reservation checks. Preserve completed
   Book authorization and source-safety verification.
3. **Submission rule authority and atomic-write acceptance remain unfinished.**
   The candidate emits canonical Book, authoring seed, Activity/publication,
   summary/index fanout and exact committed-operation writes. No new service
   grants have been added. The proposed grant must fence every actual path to
   the current exact owner/Book/operation/fingerprint/lease, committing state,
   strict future lease expiry and active teacher. Root validation must require
   one atomic transition to the new private Book and matching publication
   pointer, prohibit overwriting an existing Book, and preserve main's existing
   notification/Homework/moderation rules. Exact full/component finalizer
   payloads and browser/ancestor/root create/update/delete denial need emulator
   proof. OAuth-admin operation repository transactions are distinct from the
   scoped Firebase claim used for the final publication PATCH.

## Next bounded implementation

Resolve the preview seam first, then finalize the actual atomic-write payload
and its rules. The recommended direction is frozen, inactive operation-scoped
preparation during final submission, with the existing preview renderer and
approval authority adapted to that exact frozen input. It must not reintroduce
an editable server draft or expose a canonical Book early. Verify exact Unit
coverage, component-document qualification, current fingerprints, actor,
revocation and expiry before final publication. Reuse existing approval and
publication mechanisms rather than creating an alternative proof tag.

This recommendation needs its source-level design review before implementation.
The implementor escalation was dispatched to Astra, but that review and the
parallel rules author both failed with the workspace's out-of-credits response.
No design response or rules acceptance was obtained. Keep only this dependent
authority work paused; the successful independent checks above do not close it.

After those seams pass, port the remaining UI/composition changes and run the
real teacher/student flows, interrupted submission/replay/discard checks,
temporary-artifact isolation/cleanup, and full/component provider acceptance.
Reconcile capacity from the actual restricted B2 prefix before any real upload.
Hosting, Workers and Firebase rules still require separately scoped release
proof; this checkpoint authorizes none of them.

The original month-long audit and stable-clone records remain in
[the maintenance baseline](../system/maintenance-baseline-20261017.md) and
[the stable clone guide](../system/stable-clone-reproducibility-20261018.md).
Listening cleanup, public feedback pages and the design-document pack remain
separate as previously selected.

## October 19 continuation — qualified publication and rules

The Astra design review resolved the approval seam: PRD0063 requires a local,
revision-bound teacher preview followed by independent server qualification.
It does not require another remote preview approval or editable server draft.
Pure publication builders now reuse the existing validators; existing
interactive wrappers and commands still require their durable preview approval.
The submission finalizer qualifies every Unit/activity, verified source and
component document under the current exact commit lease before constructing
one atomic publication PATCH. No invented approval timestamp or validation tag
is accepted.

Pending source upload authority is bound to the stored submission operation.
Actual source projections and upload operations come from one account snapshot;
their full storage identity, checksum, bytes, safety decision and operation
binding are rechecked. Cancel/cleanup and status have separate lifecycle
permissions, and committed submission artifacts cannot be canceled through the
pending-operation path.

New local RTDB rules isolate the finalizer capability from legacy authenticated
read/write grants, then permit only scoped creation of its Book, authoring,
publication, Activity and index records. Root validation requires an active
teacher, current exact operation/fingerprint/unexpired lease, a new private PDF
Book, matching publication identity and the committed operation in one write.
Existing Books and Activity namespaces cannot be overwritten or appended to.
The initial component descriptor, including all bounded component entries, is
bound to the corresponding publication descriptor. The operation root is also
included in the explicit Book backup inventory. These are candidate changes;
no rules or Worker deployment occurred.

| Current check | Result | Limit |
| --- | --- | --- |
| Core submission, source, preview and publication checks | 31 files, 385 passed | Node/jsdom; mocked provider/Firebase, not workerd or browser acceptance. |
| Real full/component finalizer payloads against candidate RTDB rules | 26 passed | Isolated emulator on `localhost:19000`, disposable namespace; no shared local dataset or provider upload. |
| Backup inventory and backup writer | 2 files, 13 passed | Local unit checks; the deployed Worker remains pinned separately. |
| Targeted TypeScript comparison | Zero new diagnostics; candidate and main each report 390 existing diagnostics | Not a clean repository type check. |
| Adjacent catalog and Activity rule checks | 23 passed, 5 failed on both main and candidate | Existing catalog moderation mismatch below; no green overall rules claim. |
| Independent scoped rules review | No remaining must-fix bypass in the reviewed corrections | Source review and inspection of recorded 26-test output, not a fresh test execution. |

The new denial checks include wrong owner/Book/operation/fingerprint/lease,
expired/canceled authority, inactive teacher, missing atomic commit records,
existing Book/Activity overwrite, foreign Activity targets, unrelated
create/update/delete, incomplete publication identities, descriptor divergence,
browser/ancestor writes and inherited broad reads. Actual service-identity UIDs
are used in the positive cases. Native canvas warnings do not qualify rendering.

Fresh read-only Git checks still show clean canonical main at
`ebcccd65d1f1db4b1072d7e8bd397040f160e793`, matching GitHub main. The donor and
saved original browser draft remain untouched. All newly added TypeScript
files remain below 500 lines; UTF-8 and candidate diff whitespace checks pass.

Evidence under the canonical checkout's ignored `tmp/`:

- `pdf-integration-core-tests-4-20261019.log`
- `pdf-rules-5-20261019.log`
- `pdf-backup-tests-2-20261019.log`
- `pdf-integration-typecheck-20261019.json`
- `pdf-integration-typecheck-main-comparison-20261019.json`
- `pdf-integration-checkpoint-manifest-20261019.json`
- `pdf-rules-adjacent-20261019.log` (main rules)
- `pdf-rules-adjacent-candidate-3-20261019.log` (candidate rules)
- `pdf-live-rules-observation-20261019.json`

### Additional release issue: catalog moderation rule mismatch

The adjacent checks exposed five baseline failures: current Book services and
types use the moderated visibility states, while rules still validate the old
`private`/`public` Book values. The tests also demonstrate an unmoderated teacher
Book-summary write in the emulator. This is a rules/consumer mismatch, not a
claim that a production browser exploit was performed.

A read-only production rules GET at `2026-10-19T03:47:16.443Z` returned the same
rule tree as canonical main. Its canonical tree SHA-256 is
`1fdd6321aad54e7a7bca84b51836601d5dacf8491587dca6274247bbc194a4cb`, matching the
recorded RTDB release. No remote mutation was made. This issue requires a
separate bounded correction before calling the stable/PDF release ready.

### Remaining preparation

Prepare and verify that catalog rules correction separately. Then port the
remaining UI/composition changes and verify the real teacher/student app,
interrupted submission/replay/discard, artifact isolation/cleanup and both PDF
strategies against the restricted provider. The earlier IndexedDB fixture is
still storage-only proof. Keep all PDF presentation gates and submission routes
disabled until the complete release qualifies. No merge or production release
is authorized by this checkpoint.

## October 19 local browser continuation

The local authoring UI is now connected to Teacher Lobby, Create Book and the
existing Book editor modal. New PDF Books begin as owner-scoped private device
drafts; the entry makes no canonical Book write. Resume, local imports, PDF
connections, review and discard use the existing platform storage and shared
announcement/tracking paths. Main's moderated visibility contract is preserved.

A real browser check found the shared runtime ignored the authoring preview's
explicit editable response mode. The shell now honors that mode for temporary
practice answers; an unspecified candidate preview stays read-only. Answers
remain in component state with autosave/submission flags disabled. The preview
status labels those answers temporary. A new regression verifies both modes;
the local workspace test now asserts the real answer control is enabled.

Fresh Playwright teacher QA entered through `http://localhost:5173/login` and
the hidden dev Teacher button, using a new browser context. Both a complete PDF
and two component PDFs passed real PDF.js canvas rendering, Activity practice,
every-Unit review, the permission gate, reload/resume with exact stored PDF Blob
sizes, and device-draft discard. Final Create Book was deliberately not invoked.
The 390px authoring region had no horizontal overflow; this does not qualify all
mobile controls or the required narrower device widths. Existing browser
profiles and their saved drafts were not opened or modified.

The browser's non-local requests were blocked. Google Fonts and public R2 cover
requests were blocked; this is not provider-backed or production UI acceptance.
The baseline local dataset's invalid Book summary rows still produce the known
Book-list load failure, so this run does not qualify the catalog listing. UI
source came from this candidate, while the orchestrated local Worker still used
canonical main. Consequently this check cannot establish candidate Worker
upload, final commit, student delivery, interruption/replay or cleanup behavior.

The original runtime stopped between checks. Its snapshot generation had been
superseded by the recovery/checkpoint owner. The new selected generation
`94439a2b-4e6d-44d2-b475-ef3cb322ec3d` passed file-digest and identity-inventory
validation: seven files, five accounts and 24 protected records. It was restored
only into a previously empty local RTDB; matching Auth and Firestore exports
were imported at startup. No bootstrap, reseeding or live-to-local copy ran.
The three missing-Book Homework references and two provider-ledger drift issues
remain present and were not repaired by inventing data.

The local cross-worktree Vite runner needed an exact PDF worker `?url`
dependency-optimization exclusion. This is ignored runner configuration; the
browser loaded the actual installed worker and rendered the selected PDFs.

### Updated proof

| Check | Current result | Limit |
| --- | --- | --- |
| Lobby/modal/local-draft entry | 4 files, 80 passed | jsdom; not IndexedDB browser proof. |
| Shared shell and local authoring | 2 files, 33 passed | Includes default read-only and explicit temporary-answer regression. |
| Existing assembly preview host | Candidate 3 passed / 2 failed; main 2 passed / 3 failed | Both navigation failures expect the removed `Next Activity` control. The candidate fixes the baseline answer-preservation failure. No clean full-suite claim. |
| Composed catalog rules | 71 adjacent checks plus 7 moderation regressions passed | Full candidate rules on isolated RTDB; combined 78, no provider/browser moderation proof. |
| Submission atomic rules | 26 passed after catalog composition | Actual full/component payloads, isolated RTDB. |
| Core and backup checks | 385 core and 13 backup passed | Prior local proofs remain scoped as above. |
| Targeted TypeScript comparison | Candidate/main each 390 existing diagnostics; zero new | Not a clean repository type check. |
| UTF-8, whitespace and Mantine boundary | Passed; 55 changed source paths scanned for Mantine | No new TypeScript source file exceeds 500 lines. |

Additional ignored canonical evidence:

- `pdf-local-workflow-browser-20261019.json` and full/component preview/mobile PNGs
- `pdf-entry-ui-preview-fix-20261019.log`
- `pdf-preview-fix-focused-20261019.log`
- `pdf-preview-fix-tests-20261019.log` and `pdf-preview-host-baseline-20261019.log`
- `pdf-catalog-composed-20261019.log` and `pdf-catalog-moderation-composed-20261019.log`
- `pdf-rules-composed-20261019.log`
- `pdf-integration-typecheck-preview-fix-20261019.log` and matching main comparison
- `pdf-ui-runtime-restore-2-20261019.json`

### Separate correction and remaining release work

The bounded catalog correction is committed separately as `792ba2a7` in draft
[PR #160](https://github.com/iamhuwng/autoresync/pull/160). All eight GitHub CI
checks passed on that head. Independent review found no remaining must-fix in
the current service contract. Its audit retains the full-rule PBCF fixture and
browser/deployed acceptance limits. The same correction and seven regression
tests are composed into this PDF candidate; it has not been merged or deployed.

Provider measurement failed before any Backblaze request: canonical main's
provider constructor rejects the shared credential. All three local role
settings exist, but use one identical key ID/secret. Production role-separation
checks were not weakened. The ignored read-only diagnostic reports
`source_provider_unauthorized` and zero provider calls; no fresh capacity totals
or healthy reconciliation are claimed. Local deployment guidance permits shared
acceptance credentials, but current main's provider does not implement that
exception; this source/documentation disagreement remains explicit.

Next: resolve the restricted provider credentials, measure actual configured
prefix totals, reconcile the local ledger through its trusted authority, then
qualify the candidate Worker with full/component submission, interruption,
retry/discard, cleanup and student delivery. Finish catalog correction acceptance
and scoped release review separately. All production PDF gates and candidate
submission routes remain disabled. Stable main remains clean at `ebcccd65`;
no production mutation accompanied this continuation.

## October 19 restricted Backblaze setup — superseding credential blocker

The owner authorized handling the keys and requested the Backblaze CLI as the
preferred surface. Installed `b2 4.7.1` already had key-management authority.
That cached account credential was never copied to app bindings. No master key
was regenerated. The signed-in browser was inspected but created no key.

Five new standard keys were created through the CLI and verified through fresh
Backblaze authorization responses. They replace the shared broad credential in
the canonical checkout's ignored **local** `.dev.vars` only:

| Local role | Exact capabilities | Resource scope |
| --- | --- | --- |
| Upload | `writeFiles` | `bookpdf`, configured `book-source/prd0062-preview-20260729/` prefix |
| Metadata | `listFiles`, `readFiles` | Same bucket and prefix |
| Read | `readFiles` | Same bucket and prefix |
| Cleanup | `deleteFiles` | Same bucket and prefix |
| Capacity | `listFiles` | `bookpdf` only; bucket-wide metadata listing as required by the existing capacity probe |

All key IDs and secrets are distinct. No key has key-management authority. No
secret was printed, committed or placed in a browser bundle. A restricted-key
recovery file is also retained under ignored `cloudflare/tmp/`. Existing donor
secret files and existing provider keys were not modified or revoked.

The candidate Source provider now accepts exact minimal upload/metadata/read
capability sets alongside its exact existing console bundles. It still rejects
arbitrary supersets, role mismatches, shared credentials, foreign buckets and
incorrect prefixes. There is no permissive local-mode flag. Existing cleanup
and capacity adapters already support their minimal role capabilities.

Three provider/wiring test files pass **20/20**, including the exact minimal
roles and rejection of extra permissions, wrong role, foreign bucket and wrong
prefix. A real metadata listing and exact-version two-byte range read through
the candidate adapter passed using the new credentials. CLI listing with all
versions independently returned the same provider totals. These checks uploaded
and deleted no objects.

The credential blocker is closed for the candidate. Full submission acceptance
is still blocked by a separately confirmed pre-existing ledger mismatch:

- actual configured prefix: **3 objects / 3,159,861 bytes**;
- local primary account's verified operations: **2 objects / 2,068,437 bytes**;
- one **1,091,424-byte** provider object has no matching operation or source
  projection in any local upload account. The other two exact versions match
  verified operations.

The unmatched object belongs to historical Book
`book-386d79f7-1b21-4869-8bfa-acdccec9b264`. Its current ownership/use has not been
established. It was not deleted, adopted into a fabricated operation, or hidden
by rewriting capacity totals. The local ledger remains in drift. A new isolated
acceptance prefix/account is the preferred next test arrangement if that
historical object cannot be reconciled from trustworthy records.

Evidence in ignored canonical `tmp/`: `pdf-b2-provision-roles-20261019.json`,
`pdf-b2-role-tests-20261019.log`, `pdf-b2-cli-totals-20261019.json`,
`pdf-provider-readonly-20261019.json` and `pdf-b2-drift-trace-20261019.json`.
The CLI did add restricted keys to the existing Backblaze account. No existing
bucket settings, provider objects, production secret bindings, Hosting, Worker
deployment, Firebase rules or live app data changed. The running local Worker
has not yet been restarted onto the candidate; old runtime bindings are not
claimed as proof of the new configuration. Stable main is unchanged.

## October 19 isolated provider acceptance — local runtime corrections

The preceding runtime statement is superseded. Both the teacher app and Book
Worker now run this candidate locally through the normal orchestration, with
ignored QA configuration and the existing canonical dependencies. Production
configuration and PDF route gates remain unchanged.

Four additional CLI-created keys restrict upload, metadata, read and delete to
`book-source/prd0062-preview-20260729/pdf-qa-20261019/` in `bookpdf`. The existing
bucket-only capacity listing key is reused. Their secrets remain in ignored
local files, separately from the canonical local key set. The new emulator
account is `book_b2_pdf_qa_20261019`. Fresh provider listing first proved zero
objects/bytes before initializing this account through its validated CAS path.
No primary-account capacity totals were rewritten.

The real teacher flow resumed the same persistent QA draft and submission
`f07dcdd2-1f48-4c7d-ba11-305cdfd6691c`; it did not restart creation after each
failure. This exposed and corrected local wiring gaps:

- The shared browser source client rejected the documented HTTP localhost
  control Worker. HTTP is now limited to explicit local-only mode and the
  `localhost` hostname; URL credentials, queries, fragments and remote HTTP
  targets remain rejected. All 43 client cases passed.
- The source Worker lacked local emulator composition. Its opt-in mode now
  requires demo project identity and the exact localhost port/namespace, skips
  production OAuth, and retains namespace through reads and ETag transactions.
- Shared RTDB URL construction placed paths after the namespace query and lost
  it when adding scoped auth/query parameters. Standard URL pathname/search
  construction now preserves both. The focused three-file boundary suite passed
  27 cases, including actual source runtime composition with mocked provider I/O.
- The local Worker omitted the checked-in renderer-version binding. It now
  carries that production-format version for preview qualification.

The actual B2 PUT, completion verification and student-safe decision passed.
Final publication then exposed the invalid local query-token shortcut (`owner`
was rejected with HTTP 401). Scoped local Auth exchange is being qualified
before repeating the final write. Creation is not yet claimed complete here.
Candidate rules were installed only in `demo-luyentap-local`; the previous local
rules are saved in ignored `tmp/pdf-qa-original-local-rules-20261019.json`.

At `2026-10-19T05:30:23.982Z`, real QA reconciliation was healthy at **1 object /
853 bytes**. The original primary ledger's SHA-256 remained
`cac327013edc4622c9c6ff768b2f2444278c86df5a2d875ea3a40537fb614b0b`.
The child prefix is within the original parent prefix, so its new QA objects
also increase parent-prefix totals; the earlier three-object measurement is
historical. None of the three historical objects was deleted or adopted.

The 33-file core run passed 410 tests before the subsequent scoped local Auth
correction. Evidence: `pdf-core-local-firebase-fix-2-20261019.log`,
`pdf-local-boundary-combined-20261019.log`, `pdf-qa-reconciliation-20261019.json`,
`pdf-qa-local-rules-proof-20261019.json` and the guarded provider browser report.
These are local/provider-backed proofs, not production release evidence.

### Superseding scoped publication and recovery proof

Both creation strategies subsequently passed in the real browser against the
candidate Worker and installed candidate rules. Local publication now exchanges
the same bounded submission claims through the fixed local Auth emulator, with
the service UID; it no longer supplies `owner` as a query token. Production
still uses RS256 signing and Google's existing exchange endpoint. The dedicated
token suite passed 12 cases. A read-only review found no production token or
namespace regression; its localhost-port finding was corrected in both browser
control clients. Their local HTTP exception now additionally requires a Vite
development build and port `8787`; the two client files pass 51 tests.

The full-PDF retry committed the existing operation and reused its verified
source, with no second PUT. The component path uploaded both PDFs, created the
combined two-page student document, and committed its two Units. Both browser
runs confirmed removal of their local drafts; authoritative local reads found
exactly one committed operation per Book and their publication records:

- Full: `book-bd3e4c4b-3367-4fd7-927e-3af365426847`.
- Component: `book-edeea614-5b50-4c6f-a02c-1e8e5b11f32a`.

Actual isolated-prefix reconciliation at `2026-10-19T05:37:31.121Z` was healthy:
**4 objects / 3,639 bytes**. Independent CLI all-version listing measured the
parent prefix at **7 objects / 3,163,500 bytes**, including those QA objects.
The original primary ledger hash remained unchanged. These remote QA objects
remain intentionally retained; no historical objects were deleted.

The UI no longer permanently disables discard after submission failure. It
requires authoritative resolution before deleting local data, prevents concurrent
save/create/discard, and retains the draft if resolution fails. Its 20 focused
component tests pass. A real pre-reservation interruption then confirmed server
cancellation, draft/PDF cleanup, and zero additional provider uploads.

Remaining release blocker: after an actual reservation/upload, the creation hook
does not configure a reconciliation endpoint, and the canonical source runtime
denies reconciliation. The separate reconciliation Worker's current ownership
check also requires an existing canonical Book, which a canceled new submission
does not have. Local data must stay retained until authoritative provider cleanup
finishes. This recovery path, post-reservation interruption, exact-version
cleanup and student delivery remain unqualified. Successful creation does not
close those gates.

Current evidence: `pdf-provider-full-browser-20261019.json`,
`pdf-provider-browser-20261019.json` (component),
`pdf-provider-discard-browser-20261019.json`, `pdf-qa-state-proof-20261019.json`,
`pdf-local-discard-tests-20261019.log`,
`pdf-local-http-boundary-final-tests-20261019.log` and
`pdf-core-scoped-local-auth-20261019.log` (33 files / 412 tests before the last
HTTP-boundary tightening). Two pre-existing assembly preview tests still fail on
stale `Next Activity` controls; the affected local modal and shared shell tests
pass. Final type comparison remains 390 diagnostics on each tree with no added
diagnostics; the repository is not globally type-clean. The current checkpoint
contains 102 paths and no newly added source file above 500 lines. Stable local
main and GitHub main were rechecked equal at `ebcccd65`, with canonical main clean.

## October 19 evening continuation — reserved cleanup qualified, verified retirement blocked

The local stack had stopped during the inactive interval. The existing recovery
command restored validated generation `73e1ba18-85e3-4da3-be9e-b689b3024b96`
without reseeding or live-data sync; its final checks confirmed exact RTDB and
Auth identity restoration. The independent checkpoint writer resumed saving the
preserved dataset. Candidate rules were reinstalled only in the demo emulator.

The dedicated reconciler now receives exact reservation/operation context before
authorizing an unpublished canceled submission. It requires active teacher
identity, exact immutable source link, parent operation/owner/final Book identity,
valid fingerprint and canceled state. Foreign, preparing, committing, committed,
inactive-owner and conflicting-Book cases are denied before provider work.
Production HTTPS/OAuth remains the default. Local mode requires the exact demo
project, localhost port and namespace. The local orchestrated Worker mounts the
existing reconciler at its reconciliation route with the existing local verifier
and separate delete credentials; scheduled cleanup remains disabled.

The unfinished wiring initially passed the verifier as an unsupported positional
argument to the control host; this was corrected to its existing options field.
A missing reconciliation operation now returns its actual `operation_not_found`
code and HTTP 404. The five-file lifecycle/repository/Worker/capacity suite passes
**63 tests**, including ten exact canceled-submission authorization cases.

An independent capacity invariant was corrected: `cleanup_pending` reservations
continue to consume their pending/replacement allowance until actual provider
cleanup releases them. Previously canceling an unverified reservation could free
its allowance while its signed upload remained valid. The normal verified-source
cleanup prohibition remains intact; no verified identity was stripped or
downgraded to bypass it.

Real browser verification after restoration used `/login` and the Teacher quick
login at `http://localhost:5173`. It resumed the retained cancellation draft and
confirmed its presence. The actual local reconciliation endpoint returned 401
without authentication, 403 for a committed-source reconciliation probe, and 404
for a missing reservation. No deletion was requested for the retained canceled
verified source. The namespace, verifier and UI restoration are therefore runtime
proof, not only mocked-test proof.

The two earlier assembly-preview failures were not solely stale controls:
inspection found that `BookAssemblyStudentPreviewHost` omitted the existing PDF
page callbacks and allowed-page scope. These are now forwarded to the viewer.
Tests use page controls and verify that page changes update mapped Activity
content for full and combined documents. All three preview files now pass
**41 tests**. The specific assembly-host change has unit/integration proof; a
separate real authorized-delivery browser pass remains outstanding.

At `2026-10-19T11:23:45.076Z`, isolated-provider reconciliation measured **5
objects / 4,491 bytes**, matching the local QA ledger. A fresh all-version CLI
parent-prefix listing measured **8 objects / 3,164,352 bytes**. Authoritative
local readback confirmed the two committed QA Books plus the retained canceled
submission's **852-byte** verified source. Its signed upload expired at
`2026-10-19T06:02:32.185Z` (13:02:32 Bangkok). The original primary ledger hash
remains unchanged. No remote object, historical object, production rules/data,
Hosting or deployed Worker was deleted or changed during this continuation.

Verified canceled-source retirement remains blocked. Existing publication
retirement requires a genuine publication guard and cannot be given a fabricated
guard for an unpublished Book. The repository escalation protocol requires an
Astra one-pass plan before proceeding with this affected design. Both attempts
failed with the tool resource error `Your workspace is out of credits`; the
partial review identified the capacity issue above but did not complete a safe
retirement plan. Independent work continued. The owner has been asked to restore
subagent credits or keep this work deferred. PDF remains undeployed and not
release-ready; exact-version verified retirement and student delivery are not
claimed complete.

Current evidence in canonical ignored `tmp/`:
`pdf-runtime-recovery-evening-20261019.log`,
`pdf-cleanup-capacity-evening-tests-20261019.log`,
`pdf-cleanup-runtime-browser-20261019.json`, `pdf-qa-state-proof-20261019.json`,
`pdf-core-evening-final-20261019.log` (**33 files / 419 tests**),
`pdf-hook-evening-final-20261019.log` (**5 tests**), and
`pdf-all-preview-evening-tests-20261019.log` (**41 tests**). Broader current entry
type comparison is **424 diagnostics on both candidate and main**, with no added
diagnostics at the preceding checkpoint; this supersedes the earlier narrower
390-diagnostic entry comparison. No globally clean TypeScript claim is made.
Stable main was rechecked clean and equal to GitHub `main` at `ebcccd65`.

## October 19 canceled-upload retirement and obsolete local catalog correction

This continuation supersedes the preceding Astra blocker. The owner replaced
the local AGENTS instructions and removed that escalation requirement. Existing
subagents resumed with isolated repository and safety-review assignments; no
additional model-specific approval is required by the updated instructions.

Canceled, unpublished verified sources now have their own retirement guard.
Before removing an Assembly projection, the trusted service checks the exact
terminal parent and permanently fences creation of its Book ID. It then checks
Book, publication and delivery absence. Retirement keeps verified identity and
tracked bytes until signed-link expiry and exact operation-key version cleanup.
Ordinary verified cleanup remains prohibited. RTDB omits empty arrays, so canceled
guards deliberately omit their empty reference list and accept that persisted
representation; the publication guard remains unchanged.

The server-composed student PDF is included in component cancellation. Bounded
scheduled discovery advances a durable reservation cursor even on a rejected
source, and runs independently of a failing primary candidate. Canceled terminal
records retain private cleanup coordinates and an hourly retry lease so a PUT
already in flight at expiry can be cleaned up later. This is recurring recovery,
not a claim that expiry proves all uploads have settled. Local cron execution
remains disabled; explicit reconciliation uses the same lifecycle.

At `2026-10-19T11:53:49.715Z`, the real teacher browser discarded the retained
852-byte cancellation draft: cancel/status/reconcile returned 200, the provider
file was deleted, and only then was the local draft removed. Committed cancel
returned 403, while reconciliation of a committed source preserved its exact
verified PDF. A CLI upload subsequently simulated a late 876-byte arrival at
that canceled key. At `2026-10-19T12:18:42.254Z`, browser reconciliation removed
it and scheduled the next sweep. Fresh all-version CLI readback returned seven
parent-prefix objects / 3,163,500 bytes; isolated QA reconciliation measured four
objects / 3,639 bytes and a healthy matching ledger. The original primary ledger
hash remained `cac327013edc4622c9c6ff768b2f2444278c86df5a2d875ea3a40537fb614b0b`.

The owner authorized removal of obsolete local Book data. Two October 11/13
acceptance Books still used the obsolete `public` visibility and caused the
strict shared summary reader to reject the entire listing. A reviewed local-only
31-path atomic PATCH removed their canonical/catalog/index rows and one incoming
public delivery scope. Exact deleted values were backed up; full-root comparison
confirmed no unplanned change. Four other Books, Test1, 29 profiles, six Auth
accounts, all source ledgers and inactive historical records were preserved.
The real teacher browser at `2026-10-19T12:21:07.680Z` loaded four Books, including
both new QA Books, with no listing errors. No production data or original B2
objects were deleted. The owning recovery checkpoint must record exactly these
authorized deletions before its next normal persistence pass can succeed.

Current canonical ignored evidence: `pdf-canceled-retirement-browser-20261019.json`,
`pdf-terminal-late-arrival-browser-20261019.json`,
`pdf-qa-reconciliation-20261019.json`, `pdf-b2-cli-totals-20261019.json`,
`pdf-obsolete-books-cleanup-20261019.{json,mjs}` and its timestamped value backup,
and `pdf-catalog-current-browser-20261019.json`. Focused cleanup checks pass
**7 files / 93 tests**; core integration **33 files / 427 tests**; backup/restore
**2 files / 14 tests**; preview **3 files / 41 tests**. The actual submission
rule-emulator suite passes **28 tests**, including permanent-fence create and
ancestor-write denials. Type comparison reports 422 candidate diagnostics versus
424 for matching main entries, with no added diagnostics; this is not a globally
clean typecheck. `git diff --check` passes. The 115-path candidate remains
uncommitted, separate from main; the user's AGENTS edits are preserved. PDF
production presentation/submission gates remain disabled. No production release
occurred. Separate authorized student-delivery browser proof and release review
remain outstanding; this section does not declare overall PDF readiness.

### Cross-store cleanup correction

The initial dependency inventory above inspected RTDB and missed three active
Firestore Homework compatibility projections and their three paired authorities
for the two obsolete Books. Generic Homework archival would violate these
projections' exact contract. The owner explicitly allowed obsolete local Book
cleanup, so the six disposable fixture documents were backed up and deleted in
one Firestore commit with exact `updateTime` preconditions. No other active
dependency was found; 16 historical report references were retained unchanged.
All 666 remaining Firestore documents, all RTDB data, 29 profiles, six Auth
accounts, Test1 and source ledgers were verified unchanged by this second step.

The same resumed subagent published a new recovery generation in the original
dataset. Its one-off approved-removal inventory lists exactly the two Book rows,
one public delivery record and six Firestore fixture documents; previous
generation manifests and the general preservation guard were not modified.
Generation `3750a1f2-8a58-4dce-9ed8-6088489eef0a` was saved at
`2026-10-19T12:28:43.014Z`. Readiness returned to the five pre-existing issues
(three unrelated missing Books and two provider ledger drifts), rather than
claiming the rich dataset is globally clean. Evidence and exact document backups
are in canonical ignored `tmp/pdf-obsolete-homework-cleanup-20261019.{json,mjs}`
and the cleanup-backup directory.

The unmodified normal donor `save` command subsequently passed (exit 0), selecting
generation `8bf0b87d-1942-4a3e-9df5-c511b351463d` with the same dataset and five
baseline issues. Its readback proof is
`tmp/pdf-obsolete-homework-cleanup-proof-20261019.json`. This confirms the normal
preservation guard accepts the newly approved baseline without a recurring
exception or weakened check.
