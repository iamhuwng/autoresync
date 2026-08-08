# PRD0062 deferred local cleanup — 2026-08-08

Status: `DEFERRED_SAFETY_GATES`

This task preserves the user-approved cleanup work that must be completed after the
PRD0062 implementation lineage reaches `origin/main`. It is operational cleanup, not
product implementation or evidence that PRD0062 is closed.

## Confirmed documentation cleanup

- The user confirmed that all 720 tracked Markdown deletions in
  `luyentap-writing-import-rebased` are intentional obsolete-document cleanup.
- A future documentation-cleanup commit must contain only those deleted Markdown
  paths. Modified Markdown, untracked files, and all non-Markdown deletions remain
  outside that commit until separately reviewed.
- Current PRD0062, #102, and #107 reconciliation/audit paths were not found in the
  deleted-path set during the 2026-08-08 read-only audit.

## Local clone removal candidates

The user approved removing these exact Desktop folders when the safety gates below
are satisfied:

| Folder suffix | Approximate regular-file size | Current state |
| --- | ---: | --- |
| `luyentap-writing-import-rebased-prd0062-local` | 289 MB | Dirty; 2 unique files |
| `luyentap-writing-import-rebased-prd0062-integrate` | 289 MB | Dirty; 11 unique files; shared `node_modules` junction |
| `luyentap-writing-import-rebased-prd0062-command` | 289 MB | Dirty; 1 unique file |
| `luyentap-writing-import-rebased-prd0062-ui` | 289 MB | Clean; shared `node_modules` junction |

Expected reclaimable regular-file storage is approximately 1.16 GB. Junction targets
are excluded and must never be traversed or removed with their parent clones.

## Unique work requiring reconciliation

The following working files did not match the accepted feature-branch content during
the audit and must be integrated, explicitly superseded, or preserved as recovery
artifacts before folder removal.

### `prd0062-local`

- `src/services/book-delivery/courseBookPlacement.service.test.ts`
- `src/services/book-delivery/courseBookPlacement.service.ts`

### `prd0062-integrate`

- `cloudflare/src/upload-worker/book-route-handlers.ts`
- `cloudflare/src/upload-worker/book-routes/manifest.ts`
- `cloudflare/src/upload-worker/course-book-placement/production.ts`
- `cloudflare/src/upload-worker/course-book-placement/repository.ts`
- `cloudflare/src/upload-worker/course-book-placement/route.ts`
- `cloudflare/src/upload-worker/course-book-placement/worker.ts`
- `cloudflare/test/book-route-manifest.test.ts`
- `cloudflare/test/course-book-placement-repository.test.ts`
- `cloudflare/test/course-book-placement-routes.test.ts`
- `cloudflare/test/course-book-placement-worker.test.ts`
- `src/services/book-delivery/courseBookPlacement.service.ts`

### `prd0062-command`

- `cloudflare/src/upload-worker/course-book-placement/command.ts`

## Mandatory removal gates

Complete every gate immediately before removal:

- [ ] Fetch `origin` and verify each clone HEAD is reachable from `origin/main`.
- [ ] Reconcile or preserve every unique file listed above, then verify all four
      repositories are clean, including staged, unstaged, and untracked state.
- [ ] Resolve and inspect each exact absolute folder path; verify each target is a
      directory and the root is not a symbolic link, junction, or reparse point.
- [ ] Detach only these verified junction entries without traversing their targets:
  - `luyentap-writing-import-rebased-prd0062-integrate/node_modules`
  - `luyentap-writing-import-rebased-prd0062-ui/node_modules`
- [ ] Verify both junctions target only
      `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\node_modules` and
      verify that shared target remains intact after junction detachment.
- [ ] Re-enumerate the four exact targets and confirm the target count is exactly four.
- [ ] Prefer recoverable Recycle Bin removal. Stop on any lock, permission error,
      unexpected reparse point, path mismatch, or non-clean repository; do not retry
      with a stronger or broader deletion command.
- [ ] After removal, verify the primary
      `luyentap-writing-import-rebased` directory, its `node_modules`, and all retained
      Git refs remain intact.

## Explicit exclusions

Do not remove or reset either of these as part of this task:

- `luyentap-writing-import-rebased`
- `C:\Temp\prd0062-107-impact-adapters-20260805`

The second worktree retains separate documentation status and remains subject to the
repository rule requiring clean state and `origin/main` reachability before removal.

## Completion evidence

Record the final `origin/main` commit, the reconciliation disposition of all 14 unique
files, clean-status output for all four clones, exact removed paths, reclaimed size,
junction-target survival check, and post-removal Git/worktree inventory.
