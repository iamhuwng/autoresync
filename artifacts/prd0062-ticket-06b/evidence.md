# PRD0062 Ticket 06B / issue #48 closure evidence

## Selection and scope

- Primary: issue #48, ticket 06B.
- Roadmap phase: Foundation.
- Selection record: `artifacts/prd0062-selection-20260726-post-ticket06a.json`.
- Live graph: `artifacts/prd0062-graph-20260726-post-ticket06a.json`.
- Graph SHA-256: `ed3c916460d21817f522d1da7a37d12deda780c3251e7580146c49394634c761`.
- Graph state at selection: 112 issues, 91 open, 21 closed, 309 unique
  edges, no missing references, duplicate edges, or cycles, and 112/112
  topological coverage.
- Direct prerequisites: #45 and #47, both CLOSED.
- Complete transitive prerequisites: #25, #26, #27, #29, #44, #45,
  #46, and #47, all CLOSED.
- Live B2 provisioning, mutation, and CORS proof remain owned by #49/06C.
  This ticket made no live B2 object mutation.
- Ticket #44/50A remained all-six-deny/default-deny. Ticket #27/03B
  remained disabled.

## Implemented contract

- The browser binds one selected `File` to its exact completed ticket-05
  inspection claim before requesting upload authority.
- Begin, complete, and cancel requests are metadata-only. PDF bytes stream
  directly to the exact HTTPS B2 origin and object-specific URL.
- Upload authority is rejected when method, origin, object key, content type,
  byte size, checksum, or any required signed header differs.
- `File.stream()` is counted as bytes are consumed. UI reports exact request
  stream bytes while separately marking the final byte count provider-confirmed
  only after the exact non-redirected 200 response and stream completion. No
  speculative progress is shown.
- Fetch uses `credentials: "omit"`, `redirect: "error"`, `duplex: "half"`,
  and only the four signed upload headers.
- Begin, completion, and cancellation use fresh Firebase tokens and bind
  response IDs to the current Book, operation, reservation, and Source Version.
- Cancellation aborts transport, records `cancellation_requested`, and never
  claims provider deletion. Operation generation and persisted-state checks
  close cancel/complete races.
- Reload persists only safe operation state. Capabilities and selected files
  are not persisted. Byte retry and completion-only retry are distinct and
  cannot create a second usable Source Version.
- The 500 MiB boundary is generated in tests without committing a 500 MiB
  fixture or buffering the complete file in application/Worker memory.
- Shared announcements and durable inline state cover upload, cancellation,
  retry, verification, and failure.
- Rollback can hide new begin/upload UI while preserving status,
  completion-only recovery, and cleanup/reconciliation.

## Local unit and integration proof

Working directory:
`C:\Users\The Lord\Desktop\luyentap-writing-prd0062-reconciled`

Focused Vitest command:

```text
node node_modules/vitest/vitest.mjs run \
  src/services/book-source-delivery/sourceUpload.browser.test.ts \
  src/services/book-source-delivery/sourceUpload.browserWorkflow.test.ts \
  src/services/book-source-delivery/sourceUpload.client.test.ts \
  src/services/book-source-delivery/sourceUpload.browserPolicy.test.ts \
  src/components/books/BookSourceUploadPanel.test.tsx \
  src/components/books/BookMode2EditorShell.test.tsx \
  src/services/book-source-delivery/sourcePdfInspection.browser.test.ts
```

Result: PASS, 7 files and 64/64 tests.

Coverage includes success, exact request binding, streamed-byte completion,
abort, network failure, expired authority, origin/key/header mismatch, stale
file and claim, fresh token use, completion-only retry, byte retry, reload,
response binding, cancellation races, generated 500 MiB boundary, panel
announcements, immutable state, and shell rollout/CSP configuration.

Additional gates:

- `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- Ticket-scoped ESLint across implementation, tests, Vite CSP configuration,
  fixture generator, local byte sink, and disposable Worker sink: PASS.
- Canonical production build with `VITE_MATERIAL_BOOK_EDITOR=enabled`,
  `VITE_BOOK_ACTIVITY_UPLOAD_PRESENTATION=enabled`,
  control origin `https://book-source-control.example`, and B2 origin
  `https://s3.us-west-004.backblazeb2.com`: PASS; 9,339 modules transformed;
  bundle budget PASS with 234 KB root entry.
- Preview CSP readback permits only the configured control/B2 origins plus
  existing required Firebase endpoints. No credential value is present.

Proof classes: local unit proof, local integration proof, and production-build
proof. These do not claim deployed private-B2 mutation or active B2 CORS.

## Browser proof

Surface: signed-in Chrome teacher session at
`http://localhost:5173/teacher/materials/books/book-mrw4oxr3`.

Fixture:

- `upload-fixture.pdf`
- 578 bytes
- 2 physical pages
- SHA-256
  `0d59c5ed76a5d7efae7056ce242583efe6b32b23cc28590dd36efb1a55082afc`

Observed workflow:

1. Browser inspection displayed exact name, 578 bytes, two pages, and checksum
   prefix while labeling the claim untrusted.
2. Begin POST contained only operation/source identity and the exact inspection
   metadata. No PDF bytes entered the Worker request.
3. Browser PUT used `application/pdf`, the exact checksum and Book/Source
   Version metadata headers, and the exact object-specific upload URL.
4. Cancel aborted transport and sent body `{}` to the exact reservation cancel
   endpoint. UI recorded `cancellation_requested` and stated that provider
   deletion was not confirmed.
5. Reload restored reservation/Source Version state but not selected File or
   upload capability. Retry remained unavailable until the same file was
   reselected and reinspected.
6. A disposable HTTPS Worker accepted the PUT only when all 578 streamed bytes,
   checksum, content type, and signed headers matched. It stored nothing and
   returned disposable provider IDs.
7. UI reported 100% only after exact byte transfer completed, then entered
   `completion pending`.
8. Completion-only retry sent exactly:

   ```json
   {"providerFileId":"4_file_qa_1","providerFileVersionId":"4_version_qa_1"}
   ```

   to the exact reservation completion endpoint. No PDF bytes were present.
9. Bound completion response produced phase `verified`, reservation
   `reservation-qa-1`, Source Version `source-version-qa-1`, and status
   `One verified ready Source Version is recorded for this operation.`
10. Reload preserved that same verified Source Version while clearing local
    file selection. No upload or retry action remained and no duplicate ready
    Source Version appeared.

Proof class: browser proof against a deployed disposable byte-verification sink
plus synthetic metadata-only 06A control responses. This proves browser
transport, request-body boundaries, binding, cancellation, retry, and reload
behavior. It does not claim live B2 mutation or trusted backend authorization.

## Disposable deployment and cleanup proof

- Account route: Wrangler `media` profile.
- Account sentinel readback: `kahoot-media` and
  `luyentap-book-source-private` buckets listed under the expected media
  account.
- Runtime: x64 Node with Wrangler 4.112.0.
- Disposable Worker:
  `prd0062-ticket06b-sink-20260726`.
- Latest deployed version used for the fresh browser recheck:
  `f7802021-7260-4451-b73e-1f80fe8c78b9`.
- Worker held no storage binding and accepted only the exact fixture contract.
- Fresh Chrome recheck used PDF book `PRD0062 Mode PDF mrvkd7jk` and the exact
  578-byte fixture. The latest UI displayed streamed-transfer completion
  separately from immutable provider verification, then displayed phase
  `verified`, reservation `reservation-qa-1`, Source Version
  `source-version-qa-1`, and exactly one verified ready Source Version.
  Browser reload and reopening the same PDF book preserved that single
  verified state with no duplicate or retry action.
- Cleanup attempted immediately after the fresh proof. Wrangler's dependency scan
  reported an unrelated missing KV-read permission after the Worker deletion
  path. Independent current-state readback then returned Cloudflare code
  `10007`: `This Worker does not exist on your account.`

Proof classes: deployed/current disposable integration proof and cleanup
readback proof. No durable capability, object, route, secret, or rollout gate
was created or left enabled.

## Known harness limitation and ownership exclusions

- Windows ARM64 Cloudflare test harness cannot start repository `workerd`
  because of the known local x64/ARM64 binary mismatch. Failure occurs before
  product code. No application source, package manifest, lockfile, or shared
  dependency was changed to conceal it.
- Healthy focused Vitest, browser, x64 Wrangler, disposable deployed-sink,
  typecheck, lint, and production-build gates passed.
- Live private-B2 upload mutation and active B2 CORS proof are intentionally
  excluded and remain #49/06C acceptance.
- 06A trusted backend authorization/atomicity remains evidence owned by closed
  prerequisite #47.

## Closure conclusion

All #48-owned implementation, test, browser, preview, rollback, and evidence
gates pass without enabling 03B, changing any 50A gate, mutating live B2, or
moving backend deployment ownership from #49/06C.
