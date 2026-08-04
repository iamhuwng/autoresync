# Packet P2 findings — Unit, Page, Source, and Assembly

> **Dormant evidence notice — 2026-07-18:** this file describes removed implementation and dated proof. None of its paths, routes, versions, bindings, task statuses, or closure claims describe the reset baseline. Revalidate every claim before future reuse. The full-document decision remains preserved intent; Browser Run, one-page renditions, caches, and per-page grants remain superseded.

> **Current authority note — 2026-07-17:** authenticated streaming of the complete pinned student-safe PDF supersedes the Browser Run/one-page rendition design described in historical findings below. Renderer, rendition-cache, and per-page grant results remain evidence only. Current owners and open proof are summarized in the final section.

Date: 2026-07-13
Authority: approved amendment `043a6d9`, then canonical Components 02 and 03.
Status: `CLOSURE_BLOCKED`.

## Owner paths

- Source metadata/upload contracts: `src/types/bookSource.types.ts`, `src/services/book-source-delivery/**`.
- Production source ingress/control code: `cloudflare/src/book-source-worker/**`; config: `cloudflare/wrangler.book-source.jsonc`.
- Historical one-page renderer composition: Browser Run/PDF.js under `cloudflare/src/book-source-worker/**`; this entire production direction is now superseded evidence.
- Private-source backup/restore: `r2-backup-worker/src/backup/**`, `r2-backup-worker/src/restore/book-source-restore*`.
- Assembly contracts/services: `src/types/bookAssembly.types.ts`, `src/services/book-assembly/**`.
- Teacher Assembly UI: `src/components/books/BookAssemblyWorkspace.tsx`, `src/components/books/BookAssemblyWorkspace.css`, integrated by `src/components/books/BookEditorWorkspace.tsx`.
- Assembly Worker/rules: `cloudflare/src/upload-worker/book-assembly/**`, `database.rules.json`.
- Observability: `src/config/featureRegistry.ts` and shared announcements.

## Authority reconciliation and traceability

| Taskbox claims | PRD authority | Source owner | Direct test title / negative proof | Architecture/current state | Finding / evidence |
|---|---|---|---|---|---|
| C02 `1.0`–`1.8` immutable metadata/storage/index | PRD §15; §29.3 | `bookSource.types.ts`, `sourceVersion.service.ts`, RTDB repository | “creates immutable complete metadata at deterministic private paths”; structural-equality and replacement negatives | `documentation/architecture/book-activity-runtime-and-assembly.md`; audit C02 | This file: engine/platform + unresolved storage; `P2-closure-20260713.md` |
| C02 `2.0`–`2.12` upload/completion/management-authority/cleanup | PRD §11.3 step 1; §15 | `sourceUpload.service.ts`, split browser client, Cloudflare ingress/control | upload lease/reclaim, stale-finalize, authority-removal, byte-limit, magic/header, cleanup and zero-publication negatives | same architecture; `cloudflare/wrangler.book-source.jsonc` current state | This file: owner paths + unresolved rights-free contract deployment |
| C02 `3.0`–`3.12` PDF engine/spike | PRD §2.6; §15 | Browser Run/PDF.js in `cloudflare/src/book-source-worker/**`; removed `pdf-lib`/local-host prototype remains historical evidence only | local one-page renderer lifecycle and protected/corrupt fixture coverage; missing visual/perf/remote proof remains explicit | same architecture; approved no-cost Cloudflare/private-R2 direction | This file: engine/platform decision |
| C02 `4.0`–`4.6` excerpt/cache | PRD §15; §14.3/§14.6 | `sourceRendition.service.ts`, processor adapter | exact allowlist, gaps/duplicates/range/cache reuse; production binding and retry proof reopened | same architecture; Worker config lacks processor binding | `R-023`; closure evidence local/Worker split |
| C02 `5.0`–`5.8` grants/expiry/denial | PRD §15; §31.5 | `sourceGrant.service.ts`, local delivery host | wrong student/Book/Unit/assignment/range/answer-key/replay/expiry negatives; deployed R2/browser proof absent | same architecture; local host current state | `R-024`; all rows reopened |
| C02 `6.0`–`6.10` rules/security | PRD §31.5 | `database.rules.json`, Cloudflare private-boundary harness | Firebase emulator ancestor/root/client denials; zero fake-R2 read/write/list/delete denial assertions | infrastructure rules + P2B0 remote prerequisite | `G-P2B0-001`; emulator/remote classifications separated |
| C02 `7.0`–`7.6` Assembly/runtime seams | PRD §29.3; §11–§12.5 | source safe projection, Assembly preview port, Book Delivery | missing-source fail-closed and local source-access integration; deployed authorized rendition/student access absent | same architecture; C03/C04 interfaces | `R-025`; C02 `7.2`, `7.5`, `7.6` open |
| C02 `8.0`–`8.6` events/UX/recovery | PRD §15; amendment packet observability/rollback | operational event sink, Book editor source UI | sensitive-value redaction, retry/cancel/cleanup state tests; rendition progress/reload and remote recovery absent | observability/infrastructure/announcement rules | This file: unresolved closure risks |

## Engine and platform decision

The dated 2026-07-15 selected local composition used Browser Run/PDF.js in the Cloudflare Book Source Worker to produce one sanitized physical-page artifact per request. That composition is superseded by the 2026-07-17 full-document decision. `pdf-lib`, Node child-process/local-host, `BOOK_SOURCE_PDF_PROCESSOR`, Containers, and Cloud Run remain superseded or prohibited production directions.

Continuation correction (2026-07-15): fresh real local Chromium/PDF.js hostile-fixture proof now closes the local visual-quality/sanitization slice: selected physical page 2 from four pages, one-page output, output bytes `19,892`, sampled-pixel MAE `0.1280517578125` text and `1.4471435546875` image, encrypted/corrupt inputs rejected, unsafe JavaScript/attachment/annotation/URI/metadata markers removed, no full HTTP GET, unchanged source SHA-256, and `5050.4ms` elapsed. Visual artifacts were inspected acceptable. Deployment, private-R2 readback, representative p50/p95, bounded memory/CPU, quota headroom, and zero-billed proof remain open. Book Delivery now derives the complete allowed set and page rendition from the published Unit projection, accepts one requested page, and exposes one opaque host resource without grant/private/provider authority; local `/v1/book-delivery/launch` and `/v1/book-delivery/resources/:grantId`, RTDB current-entitlement/pointer resolution, immutable publication resolution, restore invalidation, and one-way Source provider are implemented and locally tested. Those mechanics remain undeployed and remote-unproven; only C04 `/runtime/*` routes and the production entitlement writer remain absent P3/C05 blockers.

## Fresh implementation findings

- Corrected malformed nested manifest/Page Group validation so untrusted rows return issues rather than throw.
- Corrected many-to-many reconciliation so multiple placements for one Activity cannot overwrite each other.
- Bound provenance and source-preview approval to the current Source Version, exact Page Group set, exact physical-page set, printed labels, actor, and valid approval time. UI approval now requires a successfully loaded authorized rendition for the current Unit mapping.
- Invalid client-side saves no longer replace visible draft state before validation; stale reload results are ignored; publication conflicts surface explicit resolution UI.
- Per-Unit bundle validation now compares only the selected Unit's manifest slots.
- Added responsive browser proof at 1208px, 768px, and 375px, including stacked reconciliation, no horizontal overflow, keyboard focus, labels, and 44px mobile actions.

## Unresolved closure risks

- No approved deployed/current Worker mutation or readback proves upload, completion, PDF processing, rendition cache, delivery grants, expiry/refresh, or production private-R2 behavior.
- Production Worker has no accepted deployed rendition/grant/resource route or private-R2 renderer readback.
- The live dev processor was unavailable during read-only browser inspection (`book_source_request_failed_500`). Focused review confirmed the dev monolith and production split-upload paths are intentionally distinct; no product path mismatch is claimed. Production was not exercised.
- No deployed browser proof binds a teacher approval audit record to the exact rendered source bytes; local UI/state checks cannot create that trust claim.
- Private originals and renditions lack accepted remote backup/restore lifecycle proof.
- Performance, memory, cache, R2 operation/egress, refresh-latency, and cost budgets lack accepted pilot evidence.
- P2 still must prove the published-only producer projection and exact one-page request boundary for Component 03 `6.4`. Full runtime consumption belongs to P3/C04 `1.3` and does not circularly block P2.

## Superseded directions

Cloud Run/Build/Artifact Registry/IAM detours remain `OFF_SPEC`/superseded evidence. Local adapters, static configuration, mocks, and screenshots do not close Worker, R2, emulator, browser, remote, or deployed requirements.

## Historical P2 authority and proof reconciliation — 2026-07-15

Current graph is acyclic: browser -> main `r2-upload-signer` -> one-way `BookSourcePageProviderEntrypoint`. Main locally implements `/v1/book-delivery/launch` and `/v1/book-delivery/resources/:grantId`, entitlement/publication/readiness revalidation, RTDB current-entitlement/current-pointer resolution, restore invalidation, immutable publication resolution, and ephemeral grant DO. Source owns no Assembly or entitlement authority. Source `9db68e3b-78e1-47af-816c-5d211e7855fc` and main `c44246db-f621-4870-9990-8a39b0a5202b` deploy the corrected rights-free shape, but the consolidated proof stopped before ingress bytes at `source_begin_operation_identity_unresolved`. C04 `/runtime/*` routes and production entitlement writer remain explicitly open P3/C05. Earlier cyclic/grant-entrypoint and caller-supplied page-set claims are superseded.

Every local launch/resource request rechecks active record/current entitlement pointer/profile, immutable publication, Book status, canonical ready Source Version, complete page allowlist, and exact page rendition. Restore revokes active entitlements and clears pointers; DO grants are not backup authority. Future P3/C05 issuer must select `current_published_units`, derive entitlement from immutable publication, and atomically activate/supersede current pointer.

Firebase Hosting endpoint resolution is fixed: browser `VITE_BOOK_DELIVERY_WORKER_URL` -> `VITE_R2_UPLOAD_WORKER_URL` -> governed deployed Worker; one-page resource remains same-origin. R2 rendition put uses fixed-length `Uint8Array`.

Current proof snapshot: Cloudflare full 20 files/127 PASS; typecheck PASS; lifecycle validator PASS; root focused seam 14 files/169 PASS; Source-local 13 files/92; Assembly 8 files/46; UI 1 file/19; backup/restore 6 files/23; Firebase emulator 3 files/14, with Assembly static rules covered inside the Assembly suite. Root parser rejects `source: null` source-required projections, requires structured projections to carry a source resource, enforces read-only Solo/Homework actions, rejects unordered/duplicate/misbound placements/pages, rejects unsafe/noncanonical metadata and timestamps, rejects mismatched printed labels, rejects malformed/oversized/non-PDF resource bodies, and compares canonical page unions independent of numeric order. Renderer `result.json` has one page, MAE `0.1280517578125` text and `1.4471435546875` image, encrypted/corrupt rejection, no full GET, unchanged source hash, `19,892` output bytes, and acceptable inspected visual artifacts; deployed/private-R2/performance/quota/billing proof remains open.

Unmocked in-app browser: teacher localhost:5173 logged out, revealed quick login, quick-logged in to `/lobby`, then `Book` -> `Testing Book` -> `Edit` -> `Overview` -> `Source PDF`, with visible `book_source_request_failed_500` already present and preserved by `Reload status`; student localhost:5174 logged out, revealed quick login, quick-logged in to `/student`, then `Library` -> `Public Library` -> `Testing Book` search -> `0 materials found` / `No materials found`. No upload/data/cloud mutation. Console still showed pre-existing ReportingService permission warnings and student class-index debug warnings, so no clean-console claim is made. Route-mocked E2E remains separate. C02 `2.4` is now remotely proven by Source version `65b34084-f687-4e2c-a27d-08f14b8e2abb`: a generated four-page PDF completed in `11,222ms` through direct PDF.js range counting, with exact original integrity and verified cleanup. Preserve `presentationMode` as a separate product-approval blocker.

## Consolidated minimal deployment-approval gate (not executed)

Deployment/readback is complete for the rights-free Source/Main shape. The next permitted action is one bounded read-only Main/Source log query correlated to proof `prd0062b-p2-proof-mrnkaaox-08f48b484d` and UTC `2026-07-16T13:45:27.969Z`–`13:46:41.299Z`. Do not change code or retry the proof until that query identifies the exact begin-response failure. Affected open IDs: C02 `1.5`, `2.5`, `3.5`–`3.7`, `3.9`–`3.12`, `4.2`, `4.4`, `4.5`, `5.1`–`5.8`, `6.2`, `6.4`–`6.8`, `7.5`, `7.6`, `8.3`, `8.6`; C03 `2.10`, `4.4`, `5.2`, `5.9`, `5.11`–`5.13`, `6.1`, `6.4`, `8.4`. C03 `5.2` `presentationMode` remains a separate product-decision blocker.

## Current P2 findings — 2026-07-17 full-document decision

P2 must now prove one bounded path: private immutable student-safe PDF upload and lifecycle, stable Assembly publication binding, authenticated full/range streaming, mapped page selection, current authorization/refresh/revocation, direct-R2 and unsafe-source denial, cleanup, and the agreed 20–500-page / 100–200-upload-per-day / 2–5-concurrent workload. Browser Run, rasterization, one-page splitting, rendition caches, and per-page grants are removed from production scope.

Retain existing evidence for immutable Source Version identity, checksum/byte size, page count/labels, private R2 denial, lifecycle, Page Group/Placement mappings, Assembly staging/CAS publication, and cleanup facts that remain true. Do not use renderer visual-MAE, one-page output, rendition/grant, or Browser quota evidence to close the revised tasks.

Code still reflects parts of the superseded architecture. That is implementation debt to reconcile against the new task rows; documentation approval does not claim the Worker or runtime has already migrated.
