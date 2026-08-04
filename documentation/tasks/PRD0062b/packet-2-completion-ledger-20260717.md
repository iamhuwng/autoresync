# PRD0062b Packet 2 completion ledger — historical evidence snapshot

Snapshot date: 2026-07-17. This file preserves dated implementation, bundle, deployment, rollback-readiness, and proposed-proof evidence. It is not task-status, deployment, or current-state authority.

Current authority: approved 2026-07-17 student-safe full-document decision supersedes earlier one-page renderer, rendition, and per-page grant proof as execution authority. Root C02 and C03 remain sole task-checkbox and status owners; master/orchestration does not transfer ownership to this ledger.

Classification: every `FROZEN`, `OPEN`, and `BLOCKED` label below is historical evidence classification at snapshot time only. It neither closes/reopens a root task nor asserts present implementation, deployment, bindings, rules, secrets, remote resources, proof, cleanup, or readiness. Version IDs, bindings, rule hashes, routes, secret-presence, and endpoint observations are dated recorded claims; inspect live remote state before relying on any. Rollback commands are captured readiness evidence, not proof rollback was executed. Remote guarded proof and cleanup/readback completion are absent from this snapshot.

## Historical gate-state record

| Gate | State | Freeze rule | Snapshot blocker |
|---|---|---|---|
| Local implementation | FROZEN | All rows have implementation plus passing focused/full local proof | None; reopen only on contradictory evidence. |
| Exact bundle/deployment surface | FROZEN | Both dry-run bundles and source maps prove exact closure; reviewed diff recorded | None; reopen only on contradictory evidence. |
| Predeployment snapshots and rollback | FROZEN | Live versions, bindings, rules, routes, secrets-presence, rollback commands captured read-only | None; reopen only on contradictory evidence. |
| One deployment | FROZEN | Exactly one reviewed Source/Main/rules deployment; expected versions 100% active | None; reopen only on contradictory evidence. |
| One guarded proof | BLOCKED | Exactly one namespace and publish operation; every remote row green | Waits for deployed-version validation. |
| Cleanup/readback | BLOCKED | Only proven temporary resources removed; all final reads conclusive | Waits for proof. |
| Documentation/task closure | BLOCKED | Ledger, evidence, matrices, task states, architecture, governance agree | Updated after every preceding gate. |

## Historical completion rows

| State | Required outcome | Implementation evidence | Local proof | Deployment evidence | Remote-proof evidence | Cleanup/readback | Snapshot blocker |
|---|---|---|---|---|---|---|---|
| FROZEN-LOCAL | Immutable private PDF upload, checksum, bytes, authoritative page count, labels, Source identity, replacement/lifecycle | `sourceUpload.service.ts`; Source gateway/integrity; `direct-pdf-page-count.ts`; `bounded-pdf-page-count.ts` | Established upload/replacement suite plus count-only parser 5/5: exact four-page proof fixture, bounded ranges, encrypted/invalid/integrity denial | Source version/bindings pending | Guarded immutable upload/readback pending | Original and sidecar must remain | Deployment/proof only |
| FROZEN-LOCAL | Explicit student-safe readiness; no inferred safety; unsafe/teacher-only denial | Source classification and publication validation | Current C02 readiness/denial suites passed in established local gate | Pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | Authenticated opaque full-document resource; current user/context/entitlement/publication/Source/lifecycle checks | Book delivery resolver, resource and Worker stream route | Full/range/HEAD/negative/refresh suites passed in established local gate | Main Worker pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | Correct PDF headers, length, no-store/private caching, HEAD, bounded single ranges, malformed/multi-range rejection; streaming without full buffering | Document delivery Worker/repository | Complete/range/memory focused suites passed in established local gate | Main Worker pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | Same document resource across page changes; Page Group mapping independent of transport | Delivery publication/resource model; Assembly mappings | Mapping and preview current-contract suites passed | Pending | Pending | Pending | Deployment/proof only |
| FROZEN-SURFACE | No Browser Run, Puppeteer, rasterizer, splitter, rendition store/readiness/cache, page provider, assembly-source RPC, renderer quota, or per-page grant runtime dependency in either production bundle/binding/runtime/tooling | Source DO binding/import and processor implementation removed; bounded page-tree metadata parser replaces PDF.js display build; two empty historical class exports remain because Cloudflare requires them until an approved `deleted_classes` migration; Main delivery path already isolated | Count parser 5/5; Main dry-run 518.68 KiB/99 sources and corrected Source dry-run 300.81 KiB/48 sources have zero banned runtime source modules; syntax passes | Exact Main/Source source maps and configs reviewed; obsolete names are unbound inert historical migration/stub only | Pending | Historical unbound migration tags and empty exports remain because `deleted_classes` is explicitly deferred; no obsolete binding or runtime implementation remains | Deployment/proof only |
| FROZEN-LOCAL | Stable `publishOperationId` completely binds actor, Book, candidate/revision, Source, Unit/Version, Page Groups, placements, mappings, classification, completion | `unitPublish.service.ts`; repository; Worker authority; rules generator | Service/repository/authority focused suites passed | Main/rules pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | `publish` is one atomic mutation; committed state persists before success; observable operation and publication identities returned | Repository atomic update and service response | Atomic publish/emulator suite passed | Main/rules pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | One canonical exact `publish-operation-read`; scoped actor/Book/op; authorized absent is null; mismatch denies | Repository, Firebase authority, exact RTDB rules | Exact rules emulator passed 9/9 | Rules pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | `publish-replay-read` reads only exact published Unit after operation identity; live actor/ownership/revocation checks remain | Repository replay token and exact Unit read | Focused repository/rules negative suites passed | Main/rules pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | True lost-response recovery and sequential/concurrent same-ID replay; one readback after 403/412; no mutation retry/new ID | Browser client and Worker repository | Commit-then-discard-response, 403, 412, replay suites passed | Main/rules pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | Ambiguous classification: failed-before-mutation, committed-response-lost, partial-or-unbound; never blind retry | Publish service/repository/proof safety classifier | Classification suites passed | Pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | Publication readiness: canonical pinned Source, student-safe, complete mappings, document-delivery ready; no rendition fields | Publish validation and unit projection | Service and Assembly preview suites passed | Pending | Pending | Pending | Deployment/proof only |
| FROZEN-LOCAL | Preserve single `presentationMode` authority and explicit unresolved correction blocker; do not invent fallback | Publish validation and PRD authority boundary | Current tests preserve blocker | Pending | Proof uses an already-authoritative valid candidate only | N/A | No current authority gap for valid guarded candidate |
| FROZEN-LOCAL | Historical proof resources conclusively classified; no unresolved object; immutable evidence retained | Existing reconciliation evidence | Established read-only reconciliation complete | No mutation | Guarded proof uses new namespace | Reverify immutable evidence | Final readback pending |
| OPEN | Cleanup removes only conclusively temporary proof resources; never immutable/unresolved resources | Remote safety classifier/runner | Safety tests required in full gate | Pending | Pending | Pending | Remote proof not run |
| FROZEN-LOCAL | TypeScript, Worker builds/syntax, backup/restore, canonical plan, governance, diff check all pass from isolated artifact | Repository gates | C02 204/204; C03 87/87; count 5/5; exact rules emulator 9/9; remote-proof safety 23/23, including actual discarded-response/readback/replay ordering; backup/restore 4/4; root TS with junction-safe `--preserveSymlinks`; Source TS; canonical and governance PASS; both bundle syntax checks and `git diff --check` PASS | N/A | N/A | Local outputs and hashes recorded below | None; reopen only on contradictory evidence |

## Historical local and deployment-surface evidence

- Main bundle: `C:\Temp\prd0062b-p2-main-bundle-final5\worker.js`, 531126 bytes, SHA-256 `A7FE4025B9477114775D182525989092D451C5535D70085A276413008EBA4000`; 99 source-map inputs; zero banned source modules.
- Source bundle: `C:\Temp\prd0062b-p2-source-bundle-final6\worker.js`, 308026 bytes, SHA-256 `28BD11F1F3C2D42C0A2BBE303840B222D56A586157CB8A6D2A4D84FFB7D58772`; source map SHA-256 `A3A0E27B16C73AF163EE1CA9CB287196280EA2E20553A3336BFCEA2C8AEE507E`; 48 source-map inputs; zero banned runtime source modules.
- Main deploy authority: `cloudflare/wrangler.jsonc` -> `cloudflare/worker.js`; active Packet 2 bindings are `BOOK_SOURCE_R2`, `BOOK_SOURCE_GATEWAY`, and `BOOK_DELIVERY_DOCUMENT_LEDGER`. No per-page grant binding exists.
- Source deploy authority: `cloudflare/wrangler.book-source.jsonc` -> `cloudflare/src/book-source-worker/worker.js`; only runtime binding is `BOOK_SOURCE_R2`. No processor DO binding or processor variables exist.
- Firebase deploy authority: `firebase.prd0062b-p2-rules.json`, SHA-256 `3F199AFEE0E2150B40CA26F2CB65CABE71E7085F376C5C9624CACC16B746BD68`, points to `evidence/p2-rtdb-deploy-candidate-replay-20260717.json`, 241155 bytes, SHA-256 `FA4AA1B030BB714F2A0A02433ED2BF2D08E318F2D8F995F0807FBBBF77E7B297`.
- Historical Source processor Job/Quota and Main grant-ledger migration names remain inert and unbound. No irreversible `deleted_classes` migration is included.
- Root TypeScript passes with `--preserveSymlinks`; this option is required only because isolated `node_modules` is a junction to the original Windows tree.

## Historical predeployment snapshot and rollback-readiness

- Recorded 2026-07-17: Main version `69faee42-43c0-4aba-971a-c6ad75f3bb86` was reported 100% active; recorded bindings were `BOOK_DELIVERY_DOCUMENT_LEDGER`, `UPLOAD_GRANT_REPLAY_LEDGER`, `BOOK_SOURCE_R2`, `R2_BUCKET`, `BOOK_SOURCE_GATEWAY`, and `UPLOAD_RATE_LIMITER`, with no per-page grant binding.
- Recorded 2026-07-17: Source version `edb9a26e-bfa5-426a-95ef-5986b5262c03` was reported 100% active and still had `BOOK_SOURCE_PROCESSOR_JOBS` plus processor budget variables. Required Source secrets were recorded present by name.
- Recorded 2026-07-17: Firebase rules were reported equal to `evidence/p2-rtdb-active-rules-before-replay-20260717.json` after terminal-newline normalization. Recorded normalized SHA-256: `C3D060F35C0A1B3E51388BBC23165B15E2348414A03CFABF1164884EF849CD8D`; snapshot SHA-256: `6457C4D86C817A19A6FC4B150FC48D92B07E54E49C32A04D5E0BBB4186206D4F`.
- Recorded reviewed configuration: Source had `workers_dev: false` and Main used `BOOK_SOURCE_GATEWAY`; this is not a present route assertion.
- Recorded rollback-readiness command only: pinned WSL Wrangler 4.103 `versions deploy 69faee42-43c0-4aba-971a-c6ad75f3bb86@100% --yes --config wrangler.jsonc` for Main and `versions deploy edb9a26e-bfa5-426a-95ef-5986b5262c03@100% --yes --config wrangler.book-source.jsonc` for Source; then `deployments list` and `versions view`. No rollback execution is asserted.
- Recorded rollback-readiness command only: `npx firebase deploy --only database --project temp-a1437 --config firebase.prd0062b-p2-rules.rollback.json`; then exact-read `/.settings/rules` and compare with recorded snapshot. No rollback execution is asserted.
- Any unexpected version, binding, route, rules hash, or secret-presence state aborts proof and triggers rollback before further mutation.

Deployment validation incident: the first Source upload was rejected by Cloudflare API code `10064` before a version was created because the script omitted historical `BookSourceProcessorJob` and `BookSourceProcessorQuota` exports. Readback proved Source remained `edb9a26e-bfa5-426a-95ef-5986b5262c03` at 100%. The isolated artifact now exports two empty, unbound compatibility classes only; affected Source gates and surface review were rerun. This is `failed-before-mutation`, not a deployment or proof retry, and does not authorize a `deleted_classes` migration.

## Historical deployment-validation evidence (recorded 2026-07-17; not current-state proof)

- Recorded 2026-07-17: Source version `0492f0b5-47b8-4ebf-b3ef-a6d31fffddb9` was reported 100% active; `versions view` record listed `BOOK_SOURCE_R2` plus reviewed environment values/secrets, without processor DO binding or processor budget variables.
- Recorded 2026-07-17: Main version `48c059f6-2187-4de2-8b65-1cf0a102b15f` was reported 100% active on `https://r2-upload-signer.iamhuwng.workers.dev`; `versions view` record listed `BOOK_DELIVERY_DOCUMENT_LEDGER` and `BOOK_SOURCE_GATEWAY`, without per-page grant binding.
- Recorded 2026-07-17: Firebase rules were reported semantically equal to reviewed candidate; recorded canonical SHA-256 was `19E46C293AD8D8C69EF13DAA6972E34589FC9A9B8564684E96545975BA9A492E`.
- Recorded validation probe result only: Source root `404`, exact Assembly reconciliation `401`, invalid document resource `403`. This is not remote-proof or cleanup evidence.
- Recorded rollback-readiness targets: Main `69faee42-43c0-4aba-971a-c6ad75f3bb86`, Source `edb9a26e-bfa5-426a-95ef-5986b5262c03`, and captured rules snapshot; no rollback outcome asserted.

## Historical proposed guarded remote-proof contract

Planned procedure only. Steps below were not executed under this ledger and create no remote-proof, remote-readback, cleanup, or current-state claim.

One new unique proof namespace and one stable `publishOperationId` derived from it. No second operation ID or second logical publish operation; the same-ID replay below is idempotency validation after exact readback, not a new publish intent.

Sequence:

1. Assert expected Main/Source versions are 100% active, exact reviewed bindings/rules/routes are live, and private R2 has no public authority.
2. Create only disposable teacher/Book/authority data in the proof namespace.
3. Upload one complete student-safe PDF; verify checksum, size, page count, immutable R2 original and integrity sidecar; replace once and prove old immutable original remains.
4. Mark only the selected Source Version student-safe; prove unsafe/stale/retired/unpublished variants deny.
5. Stage Page Groups, placements, and page-to-Activity mappings; publish once with the stable complete operation binding.
6. Simulate committed response loss by discarding the mutation response. Read exact operation through `publish-operation-read`; then replay the same ID and read only the exact published Unit. Prove no duplicate mutation.
7. Verify operation, Unit/Version, Source, candidate/revision, Page Groups, placements, mappings, classification and completion timestamp all match.
8. Authorize one opaque document resource; prove full stream, HEAD, valid bounded single range, malformed/multi-range rejection, and mapped page selection without new resource/grant.
9. Prove wrong user, Book, context, Source, entitlement, inactive/revoked/force-reauth/ownership-changed actor, unsafe/stale/retired/unpublished Source, and direct-R2 access deny with zero unauthorized R2 reads/writes/lists/deletes.
10. Reconcile cleanup. Delete only conclusively temporary namespace resources. Preserve both immutable originals and required operation/publication evidence.
11. Final exact readback: Worker versions, bindings, rules hash, operation, published Unit, mappings, delivery resource state, authorization denial state, R2 originals/sidecars, RTDB namespace, and cleanup inventory.

Immediate stop conditions:

- missing operation after publish response loss;
- operation or Unit binding mismatch;
- ambiguous/partial publication;
- unexpected Worker version, rule hash, route, binding, or secret-presence state;
- any unknown or unresolved resource;
- cleanup uncertainty or immutable object absence;
- authority/presentationMode gap;
- mutation outside the unique proof namespace;
- any need for a new operation ID, second publish mutation, irreversible Durable Object migration, real-user mutation, or unrelated deployment.

On stop: freeze remote state, perform read-only classification, do not retry or edit rules remotely. Deployment mismatch would use captured rollback-readiness targets; implementation defect returns to local investigation; genuine authority gap stops for product decision. This is proposed procedure, not proof that remote proof, rollback, or cleanup occurred.
