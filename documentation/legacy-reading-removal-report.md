# Legacy Reading V1 removal report

Date: 2026-11-09

Reading V2 is now the only Reading authoring and delivery path. This worktree removes the retired flat IELTS Reading implementation while keeping the V2 studio/runtime, Listening, Writing, THCS, shared result shells, and security boundaries.

## Removed

- The complete `src/skills/reading` runtime, scoring, passage detection, and type tree.
- Generic Reading student delivery and mobile Reading shells, answer-state helpers, grouped-question helpers, and Reading-only editor panels.
- The V1 parser/review/publish pipeline: document conversion, AI/offline extraction, classification, validation, draft review, upload/parsing screens, old draft hooks, and V1 producer scripts.
- `saveTestToFirebase` and its Reading-shaped tests. Shared `testStorage` reads, updates, student-safe projections, and result paths remain.
- Retired Reading draft/review routes and stale feature-registry entries.
- Legacy Reading-only documentation, migration scripts, parser notes, and active guidance. Historical evidence and current V2 boundary documents remain clearly labeled.

## Guardrails added

- `/create-test` now routes only Listening and Writing builders; missing or retired skills show the existing retired-material notice.
- `TestEditor` accepts Listening only and fails closed for Reading V2 or unsupported payloads.
- Teacher Lobby blocks retired Reading edit cards instead of opening the old editor.
- Legacy Reading homework assignment and student library discovery fail closed. Reading V2 continues through its explicit summary/projection path.
- Legacy student-safe probing remains only for Listening; Reading V2 uses namespaced projections.
- Autosave and session fixtures now use the Listening mobile-state contract. Reading mobile state and layer variables are gone.

## Scope and size

The current tracked worktree diff contains 253 changed files: 63,645 deleted lines and 370 added lines. The source-only portion contains 166 changed files, with 45,183 deleted lines and 235 added lines. These counts exclude this untracked report and the four other newly created shared/Listening files.

## Intentionally retained

- `src/services/reading-v2/**`, V2 runtime integrations, snapshots/projections, trusted submit, audit paths, and current Reading results.
- Listening authoring/runtime and its shared parser/editor dependencies.
- Writing, THCS, shared result/history, Material Catalog, and security code.
- Retirement inventory/classifier tooling. It remains read-only and does not authorize remote deletion.

## Data and deployment boundary

No Firebase, Firestore, Hosting, Worker, R2, or other remote data was deleted. No deployment or commit was performed. Existing legacy records require a separately approved, evidence-driven data purge if they are to be removed from remote stores.

## Verification

- The four pre-existing Listening diagnostics were: the unsafe authoring-document-to-`TestData` assertion in `listeningTestEditing.ts`; the Firebase listener error callback reading `.code` from an `unknown` error in `ListeningAudioReplacementNotice.tsx`; and two duplicate-spread diagnostics in `listeningSubmissionClient.ts` where `...input` could overwrite the authoritative live `mode`/`testId` fields. All four are fixed in this worktree. A current worktree TypeScript check reaches one unrelated tooling error in `src/test/test-utils.tsx` caused by the canonical dependency junction's inferred `@testing-library/dom` path.
- `git diff --check` is clean for the cleaned source/storage areas and documentation scope (Git reports only CRLF normalization warnings).
- Focused Vitest invocations did not complete in this managed worktree (they produced no runner output before timeout), so no passing test result is claimed. A Vite build was not run.
- Browser QA was not run because the local build could not start in this environment.

## Follow-up Listening cleanup

The approved follow-up also removed the obsolete `listeningTestStorage` CRUD facade and its tests, moved active Listening types/presets into `src/types/listening.types.ts`, replaced the deprecated generic bulk-question parser with a Listening-scoped parser, removed the deprecated parser stubs, and trimmed unreachable non-Listening editor persistence/write paths. Existing legacy-public audio adapters and first-edit compatibility remain because they are still active for historical Listening records.

### Listening residue assessment

The remaining `legacy` references are compatibility boundaries, not an unused CRUD path:

- historical public R2 audio is still read-only through the result/live/solo adapters;
- first edit of an old Listening row still freezes version 1 into the authoring workflow;
- `audioCommand` remains readable while `masterAudioState` is the canonical live authority;
- old temporary audio URLs are detected so stale recordings fail safely;
- old persisted mobile image ranges and section-number state are normalized on read.

These can be removed only after a separate inventory proves that no retained records, results, sessions, or deployed clients need them, followed by a migration and private-delivery/readback proof. They were intentionally retained in this cleanup so Listening playback, historical result review, and live-session control do not break.
