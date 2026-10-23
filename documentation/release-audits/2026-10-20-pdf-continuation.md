# PDF release continuation — October 20, 2026

Status: work in progress, no merge or deployment performed. The prior stable reconstruction is retained; this continuation does not repeat it or restore an older live baseline.

## New baseline

Canonical main was inspected at `ccc0351eba078ef10bd5662a241b9d50e2bf5319`. The PDF candidate was fast-forwarded from `ebcccd65d1f1db4b1072d7e8bd397040f160e793` to that main revision after manually inspecting the 62 incoming paths. None overlapped the 72 modified tracked files or 47 new files. All 119 owned file hashes were identical before/after. Binary tracked/staged patches and an archive of the 47 new files are retained outside Git at `C:/Users/The Lord/LuyenTap-Recovery/20261020-pdf-before-main-sync`; `proof.json` records the comparison.

The candidate therefore contains the merged Reading multiple-answer normalization, prompts, publication, runtime/results/scoring, final badge change and current release guards. It must preserve the current per-service release map rather than deploy an older candidate Worker. These are source inclusion claims; this continuation did not repeat Reading live acceptance or refresh its provider identities.

The original donor remains preserved at `C:/Users/The Lord/repos/luyentap-prd0062`. Eighteen older worktrees were previously retired with recoverable history/dirty-file backups. Disk free space was approximately 19.05 billion bytes at this continuation's first check; old low-space observations are not current.

## Executed check

After the base fast-forward, the existing integration configuration ran through canonical installed Vitest against candidate source: **33 files, 427 tests passed**, exit 0, no skipped tests reported. Evidence: canonical ignored `tmp/pdf-core-after-reading-sync-20261020.log`. This covers the existing submission/source/publication integration slice, not browser acceptance or the newly ported runtime work. No dependency installation or worktree creation was needed.

## Direct online configuration observation

A read-only Wrangler `secret list` was executed for the existing configured service `luyentap-book-source-canonical-preview` using the declared installed Windows x64 route. It returned 15 secret names. Values were neither read nor printed. Canonical ignored evidence: `tmp/pdf-online-secret-names-20261020.json` and its stderr log.

- Source upload, activity authoring, Assembly, delivery, Homework, runtime and result-read service-account secret names are present, as is `FIREBASE_WEB_API_KEY`.
- Restricted B2 upload, metadata and read key names and the private bucket ID are present.
- **`BOOK_SUBMISSION_GOOGLE_SA_KEY` is absent.** Candidate production submission/repository/publication paths require that role plus a matching `BOOK_SUBMISSION_SERVICE_IDENTITY`; the checked-in preview configuration also lacks that identity variable.
- **`BOOK_SOURCE_B2_DELETE_APPLICATION_KEY_ID` and `BOOK_SOURCE_B2_DELETE_APPLICATION_KEY` are absent.** The actual exact-version cleanup adapter requires this separate role. Existing provider upload credentials do not establish authorized cleanup.
- Presence of a secret name does not establish valid key contents, IAM, B2 capabilities, account/prefix binding, Firebase restrictions or successful execution. No secret was created/changed and no provider upload/deletion was attempted.

The checked-in `wrangler.book-source.jsonc` remains a preview configuration with a localhost control origin, expired October 5–6 staging rollout document and disabled submission route. It is not a finished online release configuration. Localhost development support should remain separate from the reviewed real-service configuration. Do not enable production gates merely to pass a source check.

## Current owned work

1. Reconcile aggregate Activity draft/operation identity/terminal-answer recovery with its connected client, service, types, UI and Worker contract; retain exact owner/context authorization. The existing repository subagent owns this bounded group in the candidate.
2. Selectively consolidate local Firebase recovery/generation/checkpoint workflow into a branch from current main, retaining main's secret-first startup and AI isolation. The existing cleanup/recovery subagent owns this separate source group. No emulator dataset, scheduled task or original donor may be moved/reset during implementation checks.
3. Follow with contextual activity-cache isolation/retry and supported non-choice renderer qualification. Historical multi-page/multi-source result review must retain the combined student-document privacy boundary and receive an explicit scope disposition.
4. Resolve real-service credential/configuration coverage, then isolated online teacher/student acceptance. Local/emulator checks are not substitutes for this release gate.

Current runtime inspection found RTDB/Firestore listening on 9000/8080, but no Auth 9099, app 5173/5174 or Book Worker 8787 listener. The donor's checkpoint status reports Auth unavailable. No dataset restore or launch was performed as part of these implementation checks; current browser acceptance is therefore not established.

### First runtime recovery group

The existing repository subagent adapted six connected source files and five existing regression suites: aggregate Activity draft encode/decode; immutable save snapshots and distinct operation IDs for changed payloads; submission using the acknowledged revision without a redundant save; committed response return and validation; exact delivered-interaction reconstruction in BookRuntimeActivityCard. This changes no rules and preserves existing terminal-read ownership/context authorization. It intentionally uses one canonical aggregate draft format rather than adding a legacy per-question dual-read path.

Focused canonical Vitest execution against candidate source passed **5 files / 62 tests**, exit 0. Owner response, cross-recipient denial, wrong-context denial and absence of leaked response data are asserted. A stale Class-lock test fixture was corrected to actually reach membership revalidation; no authorization change was made to satisfy it. No `draftOperationId` callers remain in the scanned TypeScript source/test paths. Candidate `git diff --check` passed with existing CRLF notices on the two publication adapters. No browser or globally clean typecheck result is claimed. Contextual Activity caching, generic renderer support and historical result-source review remain separate pending groups.

Listening cleanup and student essay/design artifacts remain separate as requested. PDF merge/deployment, provider credential mutation and production data/rules changes are not performed or claimed by this checkpoint. Fresh-clone end-to-end qualification remains unfinished.

## October 21 continuation

The same two interrupted subagents resumed; no replacement subagent or worktree was created. Local recovery consolidation is separately preserved in draft PR #167, commit `68f5cce8`, without changing main or the original donor's data/task ownership. Its source checks pass 38 tests; all 666 saved local Firestore documents also compare field-for-field with current local REST values. Actual stopped-stack bootstrap/restore and browser startup remain unqualified.

### Contextual runtime cache

The second runtime group changes BookPlacementRuntimeHost, its existing tests, the BookRuntimeShell action union and the existing feature registry. Cached content identity now includes recipient, context and Book as well as Activity pins; prior-identity content is hidden synchronously and stale responses are discarded. Pending reads are deduplicated with binding identity, failures support a scoped retry, and same-content authority refresh retains current response state. Existing rollout/presentation gates remain intact. StudentPracticePage required no source change. Focused Host/Shell/StudentPractice checks pass **3 files / 66 tests**. Evidence: canonical `tmp/pdf-runtime-cache-vitest-20261021.log` and the owning port report. Browser behavior is not inferred from these component tests.

### Generic imported Activities

Generic text-entry short-answer/sentence-completion, matching-pairs, ordering sequence and long-response draft-response registrations are now reconciled from the donor. Generic registrations match only null task profiles; unknown taxonomy profiles remain rejected. Matching response codec option-reuse is bound to the published rule while keeping renderer identity stable. Existing codecs and renderers are reused; no dependency or alternate runtime is added.

The manifest now contains 50 registrations, raw SHA-256 `8024a3676ee93496c00ca1f958385e86a4ab78560153e856c18eb219ef34323f`. The local Worker generator, checked-in preview configuration and connected current QA/publication fixtures use that same version. Old renderer approvals must not be relabelled as approval of this changed manifest. Historical records are not rewritten. Pre-port files are backed up outside Git at `C:/Users/The Lord/LuyenTap-Recovery/20261021-generic-renderers`.

Focused renderer/manifest/matching-codec/configuration checks pass **6 files / 32 tests**. Initial failures were a long-response test fixture using auto-scoring instead of required review and a predecessor test asserting no ordering renderer at all; the corrected fixtures retain rejection of unsupported taxonomy ordering. Donor test mojibake in an unrelated UTF-8 overflow fixture was deliberately not copied. Canonical log: `tmp/pdf-generic-renderers-20261021.log`.

The existing core integration suite then passed again: **33 files / 427 tests** (`tmp/pdf-core-after-renderer-port-20261021.log`). A comparative TypeScript check initially found two new unreachable-branch diagnostics in the answer-recovery hook; that dead branch was removed and the affected 28 hook tests reran successfully. Final comparison reports **433 candidate diagnostics versus 435 matching main-entry diagnostics, with no added diagnostics**. Neither tree is globally type-clean. Evidence: `tmp/pdf-integration-typecheck-20261021-final.json` and `tmp/pdf-integration-typecheck-main-20261021.json`.

Current Reading multiple-answer source, prompts, trusted scoring and release-observer scripts have no candidate diff from the new base. No provider credentials or service were modified. Historical multi-page result-source review, complete browser workflows, online credential/configuration coverage, scoped rule release and real-service acceptance remain required before merge/deployment readiness.

### Reviewable source checkpoint

The existing runtime subagent reviewed the staged terminal-response and cache changes without actionable findings. This was a source review, not an additional browser/test run. Reading source paths remain unchanged, while database rules are intentionally different: all 57 changed Reading permission leaves add an exact `book_submission_service` denial wrapper around the prior expression; no other Reading subtree change was found in that scoped structural review. These rules have not been deployed.

The result-view surface map, visibility policy, closure matrix and preflight ledger now document the existing Book runtime host, data/authorization boundary and unchanged PRD-0040 closure status. Pre-commit enforcement, staged UTF-8 validation and staged whitespace checks passed. The source checkpoint excludes the user's unstaged `AGENTS.md`; it preserves unfinished work for review and storage recovery, without declaring the feature merge-ready or deployment-ready.
