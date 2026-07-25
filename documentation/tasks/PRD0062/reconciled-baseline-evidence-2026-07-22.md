# PRD0062 reconciled-baseline evidence — 2026-07-22

## Reconciliation boundary

- Reconciled worktree: `C:\Users\The Lord\Desktop\luyentap-writing-prd0062-reconciled`
- Branch: `codex/prd0062-reconciled-baseline`
- Retirement baseline: `fdacfb63c592f18c610c5f8d38009e1c02e2f4d0`
- Source worktree preserved in place: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased`
- Source branch/HEAD at final inspection: `codex/prd0062b-implementation` / `7386a8e5b7a60b8fc07018a9878fad467157266c`
- The source worktree remains dirty. No reset, clean, deletion, stage, commit, merge, or broad rewrite was performed.
- The reconciled overlay remains unstaged and uncommitted.
- After fresh dependency-graph reads, ticket 03C was completed locally and ticket 04 was started because its blockers 01 and 03B were locally resolved. No ticket blocked by unresolved 50A was started.

## Live-proof decision

Live 03B proof is **not authorized** in this reconciliation. No approval was inferred for credential provisioning, production deployment, or a disposable Backblaze B2 object mutation. The seam therefore remains disabled by default:

- `BOOK_SOURCE_B2_PROVIDER_STATE = "disabled"`;
- no production route;
- no provisioned credential;
- no remote PUT, HEAD, range-read, or delete;
- no deployment.

Published ticket 03B requires local stubs/fakes and Worker dry-run proof. Published ticket 06C owns the live disposable-object proof after 06A and 06B, with a separate explicit approval gate.

## Scope resolution

### PRD0062-03A

03A is not treated as a new standalone implementation. Only the provider-neutral contract required by 03B is preserved:

- source identity/version types;
- `SourceProviderPort`;
- fake provider for contract tests;
- exact immutable provider-version deletion primitive bound to the complete
  storage identity; lifecycle orchestration, publication ordering, delivery
  revocation, retry, and cleanup remain ticket 07/47 ownership;
- source-version equality service;
- dependency-boundary test preventing provider, network, parser, renderer, split, or rendition concerns from entering this contract.

This contract remains provider-neutral and contains no Backblaze B2, R2,
route, browser, parsing, rendering, or activity-runtime behavior. The delete
primitive accepts only the complete immutable identity and cannot select a
bare key, filename, bucket, or provider-wide object set.

### PRD0062-01

Reconciled code preserves the canonical `materials | pdf` Book mode discriminator and the teacher creation chooser. Creation requires a canonical mode, mode is immutable after creation, malformed persisted values fail closed, and missing legacy mode reads as `materials` without eagerly rewriting stored metadata/tree records.

The reconciled target contains ticket-owned `cloudflare/src/upload-worker/book-rules/fragments/01.json` plus executable contract tests. It intentionally does not edit generated `database.rules.json`: published ticket 09E owns generated rule composition, emulator proof, and deployment.

Historical approved production proof remains authoritative evidence for ticket 01:

- Result: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\artifacts\prd0062-ticket-01\2026-07-22T06-54-39Z\result.json`
- SHA-256: `E99DAB9A845B17140C17FE64B1B4515AB29A8CB0B9662B22926DD7987690FDD5`
- Proof class: `DEPLOYED_CURRENT` at evidence time.
- Explicit user approval recorded.
- Deployed isolated rule readback matched candidate.
- Eight negative canaries passed; disposable cleanup readback was absent.
- Local emulator: 28 passed.
- Browser: 1 passed at `http://localhost:5173`.
- No migration, credential provisioning, secret exposure, staging, or commit.

The proof artifact belongs to the preserved source worktree. It was not rewritten or copied into the reconciled worktree.

### PRD0062-50A

Reconciled code contains the retirement-safe, default-deny scaffold only:

- six gated actions: create, upload, publish, assign/place, launch/delivery, mutation;
- safe read, cleanup, revocation, recovery, and audit classifications;
- strict configuration schema and fail-closed evaluation;
- browser presentation hints that cannot enable trusted capability;
- isolated Worker adapter; 50A owns no Firebase content/config fragment;
- no later Book route, activity, assembly, delivery, parser, renderer, or runtime implementation.

Historical approved canary proof remains authoritative evidence for ticket 50A:

- Result: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\artifacts\prd0062-ticket-50a\2026-07-22T11-36-34Z\result.json`
- SHA-256: `FB4611C502707476669F3BB4819BE29D86A277DA34CB0266E7D5778AC2E20CE2`
- User approved the canary proof and its secure provisioning.
- Staging returned fail-closed 503 and emitted privacy-safe `config_denied` audit evidence.
- Final policy remained all-actions-deny; capability was not activated.
- No secret value was printed, persisted in the repository, or placed in evidence.

The reconciled target does not transplant later route owners merely to reproduce the old mixed candidate. Full per-route enforcement remains attached to those later published route-owning tickets.

### PRD0062-03B

The published 03B production integration seam is locally resolved as an isolated, disabled-by-default Backblaze B2 provider boundary:

- B2 S3 endpoint and saved storage location/bucket identity are explicit configuration.
- Upload, metadata, and read credentials are distinct bindings.
- Shared IDs, shared secrets, master-shaped credentials, malformed configuration, broad capabilities, wrong bucket/prefix, and wrong endpoints are rejected.
- Exact-object short-lived SigV4 PUT authorization signs the PDF content type, SHA-256, byte size, and metadata.
- Exact-version HEAD verification checks provider file/version identity, SHA-256, byte size, and content type.
- Bounded range reads stream through a hard cap; a dishonest 206 response cannot buffer beyond the requested or configured range.
- Account totals use one bounded file-version page per call. The provider returns an opaque continuation; the caller owns accumulation and subsequent calls. Page size is restricted to 1 through 1,000, and malformed, partial, oversized, or immediate self-loop continuations fail closed.
- Exact-delete authority is limited to the provider-neutral port/fake primitive,
  bound to the complete immutable identity; no B2 adapter, binding, route,
  cleanup invocation, publication ordering, delivery revocation, or credential
  is present. Tickets 07/47 own the lifecycle decisions and provider-specific
  cleanup credentials.
- Errors are sanitized; fetches are abortable and time-bounded.
- The compile-only Worker exposes no operation or browser route. Disabled/malformed state returns 503/no-store; enabled configuration still exposes no operation route.
- The isolated Wrangler configuration has `workers_dev = false`, no routes, no R2 binding, and only `BOOK_SOURCE_B2_PROVIDER_STATE = "disabled"` as a concrete value.

Historical 03B evidence was inspected but not reused as reconciled closure because its candidate also contained R2 and later-route files removed by the retirement baseline:

- Result: `C:\Users\The Lord\Desktop\luyentap-writing-import-rebased\artifacts\prd0062-ticket-03b\2026-07-22T10-20-23Z\result.json`
- SHA-256: `5CD721EC1A16D3D2798717F38C9A3F1316BFD62F12E40F53106414281726AB37`

The reconciled seam is therefore proved from current source/tests/dry-run below. Live disposable-object proof remains published ticket 06C ownership; direct upload orchestration remains 06A; browser transfer remains 06B. No credential was provisioned and no remote B2 call or deployment occurred during reconciliation.

### PRD0062-03C

03C quarantines legacy R2 PDF ingress and processing without changing unrelated audio/media R2 behavior:

- owned legacy PDF ingress, rendition, split, processor, page-count, and Durable Object module paths remain absent;
- static tests reject forbidden imports, routes, bindings, paid processing, Browser Run, server page count, render, and split fallbacks;
- the isolated B2 configuration remains original-PDF-only and disabled;
- unrelated media Wrangler configurations retain their existing `R2_BUCKET` / `kahoot-media` bindings;
- Book-PDF backup and restore paths remain explicitly excluded for ticket 48A.

No browser surface was added. Wrangler dry-run proved no active Mode 2 R2 processor/rendition route or binding and made no remote mutation.

### PRD0062-04 — local implementation in progress

Ticket 04 was started only after the live graph confirmed blockers 01 and 03B were locally resolved. The local, non-provisioning portion now includes:

- exact 500 MiB and 9,000,000,000-byte boundaries;
- trusted one-read/one-CAS reservation with stale/conflict failure;
- counted ready, pending, replacement, temporary, hidden, retained, delayed-deletion, unfinished, and provider-reported bytes;
- same-logical-key replacement overlap while rejecting duplicate Source Version and object identities;
- immutable reservation fields and trusted verified-completion transition;
- NFKC-normalized, bounded safe PDF display filenames;
- one-provider-page reconciliation work units with caller-persisted continuation and fail-closed drift detection;
- ticket-owned `fragments/04.json` denying browser access to the exact `book_source_upload_accounts` boundary.

Ticket 04 is not complete. Isolated local Firebase-emulator proof now exercises
the ticket-owned deny fragment without changing `database.rules.json`. No
credential was provisioned, no remote B2 account/bucket totals were read, no
deployed capacity probe ran, and no active generated-rule composition exists
before ticket 09E.

## Review findings and resolution state

### Standards

- The ticket 01 create failure originally had no shared announcement. Resolved: rejected saves now call the shared error toast and preserve modal/form state; focused test passes.
- Ticket-owned RTDB fragments were initially in ad-hoc TypeScript files. Resolved for handoff: ticket 01 now owns `fragments/01.json`; 50A owns no Firebase fragment; ticket 04 owns `fragments/04.json`. Active ancestor enforcement remains unresolved because published ticket 09E owns generated composition/emulator/deployment proof. The baseline is not production-enable-ready.
- The original 03B account-total operation scanned an unbounded number of B2 pages. Resolved: one bounded page per request with caller-owned continuation and focused pagination tests.

### Specification

- Ticket 01 and 50A historical remote evidence proves their preserved source candidates at evidence time; it does not prove that the reconciled `fdacfb63` overlay currently has composed trusted Firebase enforcement.
- The 50A browser gate is presentation-only. It cannot enable capability, and all trusted actions remain denied. Full route enforcement stays with later route-owning tickets; generated Firebase enforcement stays with 09E.
- The narrowed 03A contract and isolated 03B provider seam match their reconciled published scope. 03B live object proof is not a 03B closure requirement and remains deferred to 06C.
- The exact-delete primitive is intentionally present in 03A because live issue
  #26 requires the provider-neutral operation. Tickets 07/47 still own the
  post-publication lifecycle decision, revocation, retry, and provider-specific
  cleanup invocation; 03B remains disabled and has no adapter deployment.

## Current verification

All commands ran from the reconciled worktree unless stated otherwise.

| Proof | Result |
|---|---|
| Root focused Vitest: 01, minimum 03A, 03B contract, 50A scaffold, and 04 domain/rules | 14 files, 93 tests passed; corrected 03A dependency scan then passed 1/1 |
| Cloudflare + unrelated R2 node-only Vitest: 50A adapter, 03B provider/wiring, 03C quarantine, 04 ledger/reconciliation, media backup/restore | 8 files, 36 tests passed |
| Focused ESLint over every reconciled implementation/test path | PASS, no issues |
| Production Vite build and bundle budget | PASS; 9,321 modules; bundle budget OK |
| Cloudflare TypeScript with declaration emission disabled for junction portability | PASS, no errors after 04 integration |
| Wrangler 4.112.0 dry-run, x64 harness, profile `media` after 03B/03C/04 local changes | PASS; upload 26.48 KiB, gzip 6.75 KiB; only provider-state binding, value `disabled`; no remote mutation |
| Dependency-boundary scan | PASS; no R2 binding, parser, renderer, split, rendition, or unbounded `arrayBuffer()` path in 03B seam |
| Reconciled browser flow | PASS; details below |

The first final dry-run attempt reused shared ARM64 dependencies and failed before project code because `@cloudflare/workerd-windows-64` was absent. Per repository harness rules, Wrangler 4.112.0 was installed into an external x64-only temporary harness and the same dry-run then passed. No application, package, lockfile, or shared dependency was changed to repair the harness.

The root declaration-emitting TypeScript command remains unsuitable in this linked-dependency worktree: it reports TS2742 portability errors because testing-library declarations resolve through the source-worktree `node_modules` junction. This is a pre-code harness failure under the repository's local harness rule. The production Vite build passes, and the Cloudflare typecheck passes with declaration emission disabled. No source, package, lockfile, or dependency repair was made for this harness condition.

The legacy PRD-0056 insecure-fixture negative suite intentionally contains 18 expected RED outcomes. Those are not current-product failures. A separate hardened Worker rerun could not load on Windows ARM because `workerd` has no `win32 arm64` binary; the failure occurred before product tests. The focused 03C quarantine suite and the unrelated node-only R2 media regressions above remain green.

## Final verification addendum — 2026-07-23

Final verification preserved both worktrees and made no remote mutation.

| Proof | Final result |
|---|---|
| Root focused Vitest, split to avoid the combined jsdom harness timeout | PASS: ticket 01 batch 4 files / 43 tests; minimum 03A + 04 domain/rules + 50A scaffold batch 10 files / 36 tests; 14 files / 79 tests total |
| Node-only Cloudflare/R2 contracts | PASS: 8 files / 36 tests, including 03B adapter/wiring, 03C quarantine, 04 ledger/reconciliation, 50A adapter, and unrelated media backup/restore |
| Focused ESLint | PASS |
| Production Vite build and bundle budget | PASS: 9,321 modules; built in 1m 27s; root entry 233 KB; public preloads within budget |
| Cloudflare TypeScript (`--declaration false --declarationMap false`) | PASS |
| Root TypeScript | Harness-blocked only by TS2742 in `src/test/test-utils.tsx:51`, where the linked worktree resolves `@testing-library/dom` declarations through the preserved source-worktree `node_modules`; no changed product-file error emitted |
| `git diff --check` and staged-file check | PASS; zero staged paths |

### Isolated x64 Worker verification

Local compile/dry-run proof completed:

- Node `v24.18.0` x64;
- Wrangler `4.112.0`;
- active profile `media`;
- dry-run PASS: 26.48 KiB / gzip 6.75 KiB;
- only binding: `BOOK_SOURCE_B2_PROVIDER_STATE = "disabled"`;
- no deployment, provisioning, object call, or remote mutation.

Real Cloudflare Worker-pool proof remains harness-blocked before test collection. Intended scope was five files / 47 tests covering 03B, 03C, 04, and the hardened Worker security contract.

Two bounded external-harness attempts were made without changing repository packages or `node_modules`:

1. Space-containing temporary path: module resolution failed at `expect-type/dist/branding`.
2. Fresh no-space path `C:\CodexHarnesses\prd0062-final-x64-20260723`: x64 `workerd` loaded, but suite initialization failed before collection with `Cannot read properties of undefined (reading 'config')` and `Vitest failed to find the current suite`.

Final pool harness versions were Vitest `4.1.9`, `@cloudflare/vitest-pool-workers` `0.16.18`, Wrangler `4.103.0`, and workerd `1.20260617.1`. Evidence class is **HARNESS_BLOCKED**, not product failure and not Worker-pool PASS. Node-only contract suites and Wrangler dry-run remain green.

## Live dependency-graph recalculation

GitHub was read again after 03C verification. The published range remains 112 open tickets, issues 25 through 136. Using locally resolved 01, 03A, 03B, and 03C, while keeping 50A unresolved pending its trusted-boundary ownership resolution, the ready set was:

- 04 / issue 29, blocked by 01 and 03B;
- 11 / issue 32, blocked by 01 and 03A;
- 12A / issue 33, blocked by 01;
- 48A / issue 43, blocked by 03C;
- 50A / issue 44, no blockers and already under reconciliation.

Ticket 04 was selected as the lowest-numbered clear ticket and is now in progress. Tickets 02 and 51A are not ready because 50A is not treated as complete on this reconciled baseline. No 04-dependent ticket was started.

Final 2026-07-23 graph read confirmed 112 open tickets, 308 published blocker edges, zero cycles, and zero missing issue references. Direct 50A dependents 02, 06A, 09D, 51A, and 52A remain paused. No new ticket was started during final verification.

## Graph-clear domain continuation — 2026-07-23

### PRD0062-11 — locally complete

Ticket 11 now owns a pure, provider-neutral Mode 2 candidate contract:

- `SourceSetCandidate` is strategy-discriminated: `full_pdf` has exactly one ownerless logical source, while `component_pdfs` has a non-empty component-only source list with one owner per source;
- candidate input carries only logical `sourceKey`, `sourceVersionId`, order, and component owner. An injected trusted authority supplies the safe Source Version projection (`bookId`, verified usability, and physical page count), never provider/storage identity;
- Source Set, Book tree, Unit, Activity slot, Page Group, and source-qualified page validation reject wrong Book/version/status, invalid page bounds, mixed strategies, unrelated owners, cycles, depth/order/key conflicts, over-limit payloads, guessed/global pages, raw Activity content, private fields, prototype-backed records, non-enumerable fields, and symbol fields with path-specific errors;
- the shared Book node registry and readiness validator now include canonical `unit` while retaining legacy `test` and the existing maximum depth;
- bounded generated/property-style cases cover both source strategies, authority/page bounds, ancestor ownership, duplicate local pages across distinct components, exact source keys, tree/order/cycle failures, and malformed records;
- production-included type assertions reject bare page identity, candidate-supplied trust facts, invalid strategy/source shapes, and Mode 1 Source Set leakage.

Review findings were remediated before closure: trusted Source Version facts moved out of candidate JSON; original node indices were preserved in errors; real Mode 1 and duplicate-order regressions were added; Source Set became a discriminated union; own/enumerable/plain-record enforcement replaced prototype-permissive checks; `Reflect.ownKeys` now detects hidden private and symbol fields; and the stale shared enum test was updated for canonical `unit`.

No browser or deployment proof is required by ticket 11. No persistence, remote call, credential, or production mutation occurred. Rollback is to stop accepting Mode 2 candidates and remove the ticket-owned pure-domain files while leaving Mode 1 Books and Source Versions unchanged.

### PRD0062-12A — locally complete

Ticket 12A establishes first-class `interactive-activity` identity and fail-closed integration truth without persistence:

- stable Material/Activity IDs, version pointers, owner, immutable creation metadata, original-import/manual provenance, fork provenance, and revision lineage remain outside editable Activity JSON;
- imported origin requires canonical Activity/source/manifest/node keys; self-forks, empty IDs, mixed/forged provenance, invalid lineage, and editable identity fields fail;
- the central registry answers structural embeddability, operational placement, playability, assignability, gradability, source context, placement-scoped progress, and launch/assignment/result/projection adapter support;
- Activity identity is structurally embeddable and source-context-aware, but every unfinished operational capability and adapter remains disabled/unsupported;
- unknown, archived, unfinished-family, and unfinished-profile queries fail closed without losing a known queried material kind; unknown kinds return explicit `unknown` identity;
- historical non-Activity capability answers and unsupported adapter answers remain unchanged;
- the Material integration registry uses explicit `identity-only` mode with no canonical root or lifecycle writer. It does not reopen the frozen `/book_activity` persistence root;
- Activity summary projections are allowlisted and exclude unpublished versions, answers, teacher notes, candidates, provenance/private source authority, and authoring content;
- the Activity-specific Book boundary rejects non-Activity references before applying central capability queries and never makes Book placement the Activity owner.

Review findings were remediated before closure: the premature `book_activity/materials` root was removed, generic Book refs can no longer pass the Activity boundary, placement-scoped progress was restored, invented legacy adapter IDs were removed, runtime identity/provenance checks were strengthened, known fail-closed queries preserve identity, import provenance became complete, and self-forks fail.

No browser or independent deployment proof is required by ticket 12A. Rollback keeps every Activity operational capability false, removes Activity entry points, and preserves existing material identities and Mode 1/Reading/Listening behavior.

### PRD0062-12B — locally complete

Ticket 12B adds only the pure Activity Domain contract owned by issue 34:

- strict, bounded, path-specific validation for one of five interaction families, one shared answer rule, one presentation mode, one context requirement, ordered Interactions, embedded stimulus/assets, and optional Task Profile;
- a trusted, injectable Task Profile registry contract. Profiles require lowercase namespaced taxonomy identity and a registered version; known family, variant, presentation, and context contradictions fail closed;
- source-assisted validation requires trusted mapped Book-page references plus labelled, accessible, family-compatible response metadata;
- normalization creates opaque cryptographically strong Interaction/item identities only after complete validation. Exact structural topology preserves all identities; count, order, variant, response-rule, prompt/item, or response-shape changes remint without fuzzy matching;
- deterministic semantic diff covers unchanged, display-only, regrade, redo-required, added, removed, reordered, presentation/context, and unsupported changes. Interaction reorder remains an Activity redo boundary and does not fabricate unrelated display/context reasons;
- identity-bound scoring validates bounded dense data-only answer shapes, duplicate/cardinality rules, stale identities, normalization, finite totals, and deterministic two-decimal display. Malformed accessors/proxies return `invalid`; objective review mode and long response return `review_required` without fabricated scores;
- the student projection is an explicit allowlist containing only runtime-required opaque identities and display content. Accepted answers, rubrics, teacher notes, provenance/private authority, candidates, owner metadata, and unnecessary internal data remain absent;
- no candidate persistence, publication, route, Worker, Firebase path, browser flow, credential, or remote operation was added.

Independent standards and published-spec reviews passed after remediation. Review-driven fixes made validation results a discriminated success/failure union, removed reorder-only false context/display reasons, hardened untrusted answer inspection, registered Task Profile validation, and added path-specific contradiction tests. The only remaining review note is a non-blocking duplicate stable serializer in canonical/diff modules; both implementations currently have identical deterministic semantics.

Focused Vitest passed 2 files / 17 tests. Scoped strict TypeScript and focused ESLint passed. The production Vite build passed with 9,321 modules and bundle budget OK (root entry 233 KB). Full-project `tsc --noEmit` still stops at the pre-existing linked-worktree harness error `TS2742` in `src/test/test-utils.tsx:51`, which references the preserved source worktree's `@testing-library/dom` types; scoped Ticket 12B TypeScript is clean.

Browser proof is not required by the published ticket. No independent deployment or secure provisioning applies. Rollback is to reject the new schema/profile registry input and remove only the eight unstaged Ticket 12B-owned files listed below; prior immutable Activity records and all existing Mode 1/Reading/Listening behavior remain unchanged. No rollback was executed.

### PRD0062-48A — local closure only; published ticket remains unresolved

The retirement baseline already contains no Book-PDF backup/restore helper, route, binding, or lifecycle configuration. Ticket 48A adds a fail-closed guard that:

- asserts 14 known retired lifecycle/config/source/test paths remain absent;
- recursively scans backup-Worker deployment/config inputs while excluding only dependency/build/coverage outputs and the negative test itself;
- rejects `BOOK_SOURCE_BACKUP_R2`, retired endpoints, any `book-source/` or `book_source/` byte prefix, and Book-PDF backup/restore/copy/stream capability;
- proves the retired endpoints return 404 with zero primary/backup object calls;
- proves ordinary media inventory remains limited to `audio/`, `images/`, and `avatars/`.

Local focused/full Worker tests, Worker TypeScript, ESLint, and the existing x64 Wrangler dry-run pass. The published ticket remains unresolved because deployed Worker configuration/route/media readback and a versioned Ticket-47-consumable remote closure artifact require deployment authority that was not granted. Never restore Book-PDF backup capability; rollback only the guard if it causes an unrelated false positive.

### Continuation verification

| Proof | Result |
|---|---|
| Ticket 11 final focused suite | PASS: 4 files / 30 tests after hidden-field and shared-enum remediation; independent final review PASS |
| Ticket 12A focused suite | PASS: 4 files / 22 tests; independent final review PASS |
| Ticket 12B focused domain suite | PASS: 2 files / 17 tests; independent standards/spec/contract reviews PASS |
| Combined Ticket 11 + 12A domain/registry suite | PASS: 6 files / 38 tests before the final Ticket 11 hidden-field regression; final Ticket 11 suite above covers the later change |
| Backup Worker full regression | PASS: 7 files / 40 tests |
| Backup Worker TypeScript | PASS |
| Focused ESLint and `git diff --check` | PASS |
| Production Vite build and bundle budget after Ticket 12B final remediation | PASS: 9,321 modules; root entry 233 KB; public preloads within budget |
| Full-project TypeScript | Harness-blocked only by existing linked-worktree `TS2742` at `src/test/test-utils.tsx:51`; Ticket 12B scoped strict TypeScript PASS |
| Browser proof | Not required for 11, 12A, 12B, or 48A |
| Deployment proof | None for 11/12A/12B; 48A deployed proof remains unapproved/open |

One review command accidentally emitted seven untracked CommonJS files beside TypeScript sources, causing Vite to resolve a stale `.js` file. The exact files were confirmed untracked with one common timestamp, removed individually, and the final production build then passed. No tracked file, user work, package, lockfile, or shared dependency was removed or reset.

Additional reconciled paths:

- `src/types/bookAssembly.types.ts`
- `src/services/book-assembly/sourceSet.service.ts`
- `src/services/book-assembly/manifestCandidate.service.ts`
- `src/services/book-assembly/sourcePageAuthority.service.ts`
- `src/services/book-assembly/ticket11-manifestCandidate.service.test.ts`
- `src/services/book-assembly/ticket11-sourceAuthority.matrix.test.ts`
- `src/services/book-assembly/ticket11.typecheck.ts`
- `src/services/materialCatalog/bookValidation.service.ts`
- `src/services/materialCatalog/bookValidation.service.test.ts`
- `src/types/materialCatalog.types.test.ts`
- `src/services/materialCatalog/materialCapabilityRegistry.service.ts`
- `src/services/materialCatalog/materialCapabilityRegistry.service.test.ts`
- `src/services/materialCatalog/bookActivityMaterialSummary.service.ts`
- `src/services/materialCatalog/bookActivityMaterialSummary.service.test.ts`
- `src/services/materialCatalog/bookActivityBookIntegration.service.ts`
- `src/services/materialCatalog/bookActivityBookIntegration.service.test.ts`
- `src/services/materialCatalog/materialIntegrationRegistry.test.ts`
- `r2-backup-worker/src/backup/book-source-media-disabled.test.ts`

Ticket 12B:

- `src/types/bookActivity.types.ts`
- `src/services/book-activity/activitySchema.service.ts`
- `src/services/book-activity/activityCanonical.service.ts`
- `src/services/book-activity/activityDiff.service.ts`
- `src/services/book-activity/activityProjection.service.ts`
- `src/services/book-activity/activityScoring.service.ts`
- `src/services/book-activity/activityDomain.service.test.ts`
- `src/services/book-activity/activityDomain.property.test.ts`

### Live dependency-graph recalculation after each completion

The first GitHub read failed at transport and was discarded; no scheduling decision used it. The successful retry read 112 open published issues, 308 blocker edges, zero missing references, and zero cycles.

After locally resolving ticket 11, ready tickets were 04, 12A, 48A, and 50A. Ticket 11 unlocked no additional ready ticket because its later dependents retain other blockers.

After locally resolving ticket 12A, ready tickets were 04, 12B, 48A, and 50A. Ticket 12B / issue 34 became newly ready and was started immediately. Ticket 04 remains locally implemented but awaits approved read-only deployed capacity proof/least-privilege provisioning. Ticket 48A remains local-only pending approved deployed proof. Ticket 50A remains unresolved/default-deny, so direct dependents 02, 06A, 09D, 51A, and 52A remain paused.

After locally resolving ticket 12B, a fresh independent GitHub read again found 112 issues, 308 blocker edges, zero missing references, and zero cycles (112/112 Kahn traversal). Ready unresolved tickets are 04 (#29), 12C (#35), 22A (#36), 26 (#37), 39A (#42), 48A (#43), and 50A (#44). Tickets 12C, 22A, 26, and 39A became newly ready through sole blocker #34. Direct 50A dependents 02 (#45), 06A (#47), 09D (#59), 51A (#127), and 52A (#135) remain paused because #44 is unresolved; their other unresolved blockers remain authoritative too.

## Browser proof

Reconciled code was served at `http://localhost:5173` with existing local runtime configuration loaded into the process without printing, copying, or provisioning values.

Observed authenticated teacher flow:

1. Teacher lobby rendered at `/lobby` with no runtime exception, failed request, HTTP response at or above 400, browser warning, or browser error.
2. Selected `Book` tab.
3. Selected `Create New Book`.
4. `Create Book` dialog displayed the explicit mode question.
5. `Materials` radio was enabled.
6. `PDF source` radio was disabled and displayed `PDF source creation is not available yet.`
7. Selected `Cancel`; dialog closed and no Book was created or changed.

After proof, browser tabs were finalized, the temporary reconciled server was stopped, and the original source-worktree Vite server was restored at `http://localhost:5173` with its source command line confirmed.

## Changed paths in reconciled overlay

Canonical authority copied without decision changes:

- `documentation/tasks/PRD0062/README.md`
- `documentation/tasks/PRD0062/prd-book-based-interactive-activity-runtime-and-assembly.md`

Minimum 03A contract:

- `src/types/bookSource.types.ts`
- `src/services/book-source-delivery/sourceProvider.port.ts`
- `src/services/book-source-delivery/sourceProvider.fake.ts`
- `src/services/book-source-delivery/sourceVersion.service.ts`
- `src/services/book-source-delivery/sourceProvider.port.test.ts`
- `src/services/book-source-delivery/bookSourceDependencyBoundary.test.ts`

Ticket 01:

- `src/types/materialCatalog.types.ts`
- `src/services/materialCatalog/materialBooks.service.ts`
- `src/services/materialCatalog/materialBooks.service.test.ts`
- `src/components/books/CreateBookModal.tsx`
- `src/components/books/CreateBookModal.test.tsx`
- `src/pages/TeacherLobbyPage.jsx`
- `src/config/featureRegistry.ts`
- `cloudflare/src/upload-worker/book-rules/fragments/01.json`
- `src/__tests__/security/bookModeRuleFragment.test.ts`
- `src/__tests__/security/bookRolloutRuleFragment.test.ts`

Ticket 50A:

- `src/services/book-rollout/bookRolloutGate.policy.ts`
- `src/services/book-rollout/bookRolloutGate.policy.test.ts`
- `src/config/bookActivityRolloutGates.ts`
- `src/config/bookActivityRolloutGates.test.ts`
- `cloudflare/src/book-rollout-gate.ts`
- `cloudflare/test/book-rollout-gate.test.ts`

Ticket 03B:

- `cloudflare/src/book-source-worker/backblaze-b2-source-provider.ts`
- `cloudflare/src/book-source-worker/backblaze-b2-provider-wiring.ts`
- `cloudflare/src/book-source-worker/backblaze-b2-provider-worker.ts`
- `cloudflare/test/book-source-backblaze-b2-source-provider.test.ts`
- `cloudflare/test/book-source-backblaze-b2-provider-wiring.test.ts`
- `cloudflare/wrangler.book-source-b2.jsonc`

Ticket 03C:

- `cloudflare/test/book-source-r2-quarantine.test.ts`

Ticket 04:

- `src/types/bookSource.types.ts`
- `src/services/book-source-delivery/sourceVersion.service.ts`
- `src/services/book-source-delivery/sourceVersion.service.test.ts`
- `src/services/book-source-delivery/sourceDisplayFilename.service.ts`
- `src/services/book-source-delivery/sourceDisplayFilename.service.test.ts`
- `src/services/book-source-delivery/sourceCapacity.service.ts`
- `src/services/book-source-delivery/sourceCapacity.service.test.ts`
- `src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts`
- `src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.test.ts`
- `src/services/book-source-delivery/sourceUpload.rtdbRepository.ts`
- `src/services/book-source-delivery/sourceUpload.rtdbRepository.test.ts`
- `cloudflare/src/book-source-worker/capacity-ledger.ts`
- `cloudflare/src/book-source-worker/provider-reconciliation.ts`
- `cloudflare/test/book-source-capacity-ledger.test.ts`
- `cloudflare/src/upload-worker/book-rules/fragments/04.json`
- `src/__tests__/security/bookSourceCapacityTicket04RuleFragment.test.ts`
- `src/__tests__/security/bookSourceCapacityTicket04FirebaseRules.emulator.test.ts`

Evidence:

- `documentation/tasks/PRD0062/reconciled-baseline-evidence-2026-07-22.md`

## Rollback and remaining boundaries

- Local rollback: discard only this unstaged reconciled overlay from the dedicated worktree after preserving any desired evidence. No rollback was executed.
- Ticket 01 production rollback artifact remains ready in its historical evidence directory; not executed.
- Ticket 50A rollback is to keep every trusted action denied; historical canary already ended in all-deny state.
- Ticket 03B rollback is to keep `BOOK_SOURCE_B2_PROVIDER_STATE=disabled`; the reconciled compile seam has no route and no deployment.
- Ticket 04 rollback is to disable reservation creation and preserve any ledger/operation/Source Version identity rows for reconciliation. No live rows were created in this pass.
- Generated Firebase rule composition remains ticket 09E ownership.
- Ticket 50A remains disabled and is not treated as a cleared dependency until its published trusted-boundary responsibility is formally resolved without pulling later route owners forward.
- Live B2 disposable-object proof and secure provisioning remain ticket 06C ownership and require a separate explicit approval gate.
- Direct-upload orchestration and browser transfer remain tickets 06A and 06B.
- No staging, commit, merge, deployment, credential provisioning, destructive migration, or irreversible remote operation occurred during this reconciliation.

## Selective-port continuation — 2026-07-23

The approved strategy is decision-based reuse, not mandatory reuse. The live
baseline remains `fdacfb63c592f18c610c5f8d38009e1c02e2f4d0`. The old
`codex/prd0062b-implementation` line was inspected only where compatibility or
edge-case value could outweigh audit cost.

Retirement evidence and `git show --name-status 4753a114` confirm that the old
PRD0062 runtime, Worker bindings, expansion routes, Activity services, and
Activity types were intentionally removed. Those removals were not reversed
wholesale.

Selective-port decisions:

- 12C: retain only pure candidate-validation, revision-conflict, and boundedness
  concepts. Do not exact-port the old publish/root-write path. The current
  lifecycle, owner CAS, idempotency, scoped Worker repository, and reload/discard
  contract were built against the retirement baseline.
- 22A: build fresh. The old Book runtime shell mixed persistence, submission, and
  family switching and had no renderer-plus-codec manifest contract. It was not
  reused.
- 26: build fresh. No old canonical matrix/validator existed. Older researched
  row/status ideas were audit input only because their status names and release
  semantics conflict with the published ticket.
- 39A: reuse only Ticket 12B pure semantic-diff meaning. No old Book Delivery
  adapter contract existed; mutation-shaped adapter ideas were rejected.

This is the lowest-risk result: narrow semantic knowledge was retained, while
retired expansion architecture, premature publication authority, hard-coded
IELTS branches, and broad persistence paths remain removed.

## Graph-clear continuation proof — 2026-07-23

### PRD0062-12C — local implementation ready; published ticket unresolved

Implemented within the ticket-owned boundary:

- stage, validate, reload, full replacement, save, and discard commands;
- stable cryptographic operation identity across ambiguous retry;
- exact replay versus conflicting replay;
- expected-revision owner CAS with authority rechecked before every ETag PUT;
- bounded typed client responses and bounded typed conflict errors;
- strict persisted owner-root, activity, candidate, operation-key, owner-ID,
  evidence-count, record-size, map-count, and total-byte validation;
- normalized drafts are revalidated from a separately retained editable draft,
  re-normalized against persisted hidden identities, and exact-compared before
  use;
- 128-activity, 128-candidate, and 256-operation owner bounds; the operation
  ledger reserves room before inserting a new command and was exercised past
  the 256-command boundary;
- no publication, material-pointer, placement, or student-answer path.

Focused proof:

- root client/rule suite: 5 files, 9 tests passed;
- isolated Windows x64 Cloudflare Worker pool: 1 file, 13 tests passed;
- scoped root and Cloudflare TypeScript: passed;
- scoped ESLint: passed.

The x64 run first exposed a real full-replacement regression: persisted
`NormalizedActivity` had been passed to the editable-input validator and every
replacement became `not-found`. The persisted decoder was corrected and the
same x64 suite then passed, including poisoned map keys/owners, malformed roots,
oversized evidence, operation rollover, revocation, crash-before-commit, and
CAS retry.

12C is not closed. Published browser proof, RTDB emulator/ancestor-denial proof,
preview Worker fixture, deployed preview, Firebase token verification, route
wiring, generated rule composition, and scoped service-identity provisioning
remain absent. Tickets 09D and 09E own route/rule composition. Provisioning and
deployment require explicit approval and were not performed.

Rollback: disable candidate mutation commands while retaining owner-read access
to staged candidates. Published versions remain untouched.

### PRD0062-22A — locally complete and evidenced

Implemented one provider-neutral renderer/codec registry and structural host:

- exact schema-version and student-projection validation with family correlation,
  answer-rule/cardinality, Task Profile, source-context, scoring, and byte bounds;
- one renderer plus one canonical codec per non-overlapping selector;
- all registrations pass through the codec-enforcement factory;
- UTF-8 serialized limits cover decode, validate, serialize, empty state, equality
  inputs, and review projection;
- exact versioned manifest shape and parity;
- retryable inline response diagnostics and projection-scoped diagnostic reset;
- projection-only `BookRuntimeFrame`;
- AST dependency guard covers import, re-export, import-equals, `require`,
  dynamic import, nonliteral loads, Worker/Cloudflare, persistence, delivery,
  scoring, result, Course/Class, Homework, and notification boundaries.

Proof:

- focused runtime/frame/host suite: 5 files, 15 tests passed;
- focused ESLint and Mantine boundary: passed;
- production application build: 9,321 modules, bundle budget passed;
- external static production bundles loaded the registry/manifest and frame/
  fallback without dynamic path guessing:
  - registry bundle: 27,337 bytes and contains the canonical manifest marker plus
    fail-closed unknown-renderer path;
  - frame bundle: 7,474 bytes and contains `BookRuntimeFrame` plus the labelled
    `Activity unavailable` fallback.

The first optional Vite SSR probe failed before product bundling because the
repository's browser-build `manualChunks` configuration tries to chunk React
while SSR externalizes it. The normal production build passed. The narrow
external esbuild proof then bundled both owned entries successfully without
modifying the repository.

Browser proof is not required by the published ticket. Secure provisioning is
none. Rollback removes family registrations or disables Book runtime capability;
unknown Activities remain fail closed and canonical Activity content is
unchanged.

### PRD0062-26 — local implementation ready; CI proof unavailable

The versioned matrix contains 32 rows covering the 28 researched Reading/
Listening profiles and distinct answer-mode variants. Validation is exact,
malformed-input-safe, and cross-checks the canonical Activity schema, taxonomy,
independent fixtures, and Ticket 22A manifest. Generic and exact selector
overlap mirrors runtime semantics.

Proof:

- Node validator suite: 15 tests passed;
- base CLI: 32 independent fixtures and 32 matrix rows passed;
- release CLI: expected nonzero while supported rows remain planned and
  unregistered;
- focused ESLint passed;
- independent standards rereview passed after generic/exact overlap remediation.

The published CI workflow exists, but CI cannot run against these uncommitted
files. Staging and commit are explicitly prohibited. Ticket 26 therefore remains
open and is not used to clear dependents. Rollback changes disputed support to
`release-blocking-unsupported`; no row is silently deleted or falsely marked
supported.

### PRD0062-39A — local implementation ready; preview proof unavailable

Implemented pure semantic impact classification and a fail-closed, versioned
adapter-conformance registry. Classification covers unchanged, display-only,
regrade, redo-required, add, remove, interaction reorder, placement reorder,
move, mapping/source context, successor, invalidation, and unsupported cases.
Cross-Book comparisons and malformed before/after self-successors fail closed.
Inputs are deep-frozen in proof, outputs contain answer-safe impact metadata
only, and registration exposes no discovery, authorization, context record,
mutation, rollback, snapshot, or activation authority.

Proof:

- focused suite: 3 files, 12 tests passed;
- focused TypeScript and ESLint passed;
- independent source review passed after frozen-input and malformed-prior-
  successor remediation.

No old exact implementation existed; fresh code remains the selected strategy.
The published preview deployment proof was not authorized and no deployment was
performed, so 39A remains open. Rollback disables impact-classification
consumers; delivery state and current publications remain unchanged.

## Final focused verification — 2026-07-23

| Proof | Result |
|---|---|
| Consolidated 12C/22A/39A Vitest | PASS: 13 files / 36 tests |
| Ticket 26 Node validator | PASS: 15 tests |
| Isolated x64 Ticket 12C Worker pool | PASS: 1 file / 13 tests |
| Full repository ESLint + Mantine boundary | PASS; 84 changed source files checked |
| Production Vite build + bundle budget | PASS; 9,321 modules; root budget OK |
| Root TypeScript | Product paths passed; unchanged linked-worktree harness still reports only TS2742 at `src/test/test-utils.tsx:51` through the preserved source-worktree `node_modules` |
| Ticket-owned scoped TypeScript | PASS for 12C root/client, 12C Cloudflare, 22A through full-check reachability, and 39A |

## Live graph recalculation after local 22A completion

GitHub was read again from the published issue bodies:

- 112 open PRD0062 tickets;
- 308 published blocker edges;
- zero missing issue references;
- zero dependency cycles.

Counting only evidenced local completions 01, 03A, 03B, 03C, 11, 12A, 12B,
and 22A, the graph-clear unresolved set is:

- 04 / issue 29;
- 12C / issue 35;
- 26 / issue 37;
- 39A / issue 42;
- 48A / issue 43;
- 50A / issue 44.

Direct 50A dependents 02, 06A, 09D, 51A, and 52A remain paused. No new ticket
was started during this proof/remediation pass. No GitHub issue was closed or
remotely marked complete.

## Ticket 04 reconciliation completion pass — 2026-07-23

### Selective-port decision

Old dirty-worktree Ticket 04 artifacts were inspected only for edge-case value.
No source file was exact-ported:

- old durable capacity code mutates the retired broad `book_source` schema and
  requires later service-account composition;
- old reconciliation performs a full provider scan in one operation, while the
  reconciled contract deliberately performs one bounded page per work unit;
- old expiry behavior frees expired reservations without proving provider
  absence, which can undercount unfinished objects;
- old filename limits and NFC policy are not canonical PRD decisions and
  conflict with the current bounded NFKC display-only validator;
- old lifecycle, R2, rendition, browser upload, and audit code belongs to
  retired or later-ticket surfaces.

Exact provider-version deletion was retained as a required future invariant,
not ported as Ticket 04 code. Published tickets 07/47 own delete invocation,
credentials, and trusted begin/completion composition. Ticket 04 remains
conservative: provider bytes and replacement overlap stay counted; it exposes
no release or deletion path.

### Review findings and remediation

Remediated within Ticket 04 scope:

- persisted RTDB operation rows now reject malformed shapes, noncanonical
  timestamps, map-key/embedded-ID mismatch, duplicate Source Version/object
  identities, unsafe keys, overlarge ledgers, and completion identity mismatch;
- idempotent verified-completion replay compares location, provider kind,
  bucket, exact provider file/version IDs, object key, byte size, and checksum;
- Worker ledger input now rejects malformed states/categories, cross-location
  rows, duplicate identities, expired new reservations, invalid cursor chains,
  stale reconciliation, unsafe identifiers/object keys, and unbounded state;
- provider reconciliation now rejects arbitrary initial continuation, forged
  continuation ancestry, loops, noncanonical completion time, location drift,
  unsafe totals, and page-bound overflow;
- local RTDB emulator proof denies direct, cross-owner, stale, ancestor-shaped,
  multi-location writes and browser reads while proving multi-location denial is
  atomic.

Reviewed but intentionally deferred:

- 06A owns the runtime adapter that composes Ticket 04 reservation with 03B
  authoritative provider completion. Ticket 04 must not add browser upload
  authorization or control routes.
- 09E owns generated `database.rules.json` composition and active deployed-rule
  proof. Ticket 04 owns only `fragments/04.json` plus isolated local semantics.
- Canonical PRD requires one normalized bounded filename validator but does not
  prescribe NFC. Obsolete PRD0062b override text was ignored.

### Focused and repository proof

| Proof | Result |
|---|---|
| Ticket 04 root Vitest | PASS: 6 files / 22 tests |
| Isolated Windows x64 Worker Vitest | PASS: 1 file / 9 tests |
| Isolated RTDB emulator | PASS: 1 file / 2 tests |
| Ticket 04 root scoped TypeScript | PASS |
| Ticket 04 Worker scoped TypeScript | PASS |
| Full root TypeScript | Ticket 04 paths pass; unchanged linked-worktree harness reports TS2742 at `src/test/test-utils.tsx:51` |
| Ticket 04 focused ESLint | PASS |
| Full repository ESLint + Mantine boundary | PASS; 85 changed source files checked |
| Production Vite build + bundle budget | PASS; 9,321 modules; root budget OK |

Browser proof is explicitly owned by ticket 06B, so none was manufactured.
No deployment, credential provisioning, B2 read, disposable-object operation,
staging, commit, merge, reset, clean, or generated-rule mutation occurred.

Ticket 04 remains published-open. Missing gates are approved least-privilege
read-only B2 metadata provisioning, read-only deployed account/bucket capacity
reconciliation, and later 09E generated-rule composition/deployed enforcement.

Rollback remains: disable new reservations while preserving ledger, operation,
and Source Version identity rows for reconciliation. No live rows were created
or changed during this pass.

### Ticket 04 execution state

`IN_PROGRESS -> BLOCKED`

Local implementation, local integration, x64 Worker, RTDB emulator, lint,
TypeScript-scoped, build, rollback, and evidence work is complete. Closure now
requires explicit approval for least-privilege read-only B2 metadata credential
provisioning followed by a deployed read-only account/bucket reconciliation
probe. Generated Firebase rule composition remains ticket 09E ownership.

Strict evidence-gated CLOSED count remains 8/112 (7.14%): 01, 03A, 03B, 03C,
11, 12A, 12B, and 22A. Ticket 04 is not counted CLOSED.

## Ticket 50A completion-first audit — 2026-07-23

### Execution state

`READY -> IN_PROGRESS -> BLOCKED`

Fresh live inspection confirmed the reconciled baseline retains only the
provider-neutral default-deny scaffold:

- exact six-action policy with independent create, upload, publish,
  assign/place, launch/delivery, and mutation decisions;
- static safe read, cleanup, revocation, recovery, and audit classifications;
- strict version/environment/revision/time/config parsing;
- privacy-safe decision and audit payload;
- deployment-only Worker adapter that rereads configuration every evaluation;
- browser presentation hints that cannot supply trusted authorization.

Fresh proof:

- root policy, presentation, and feature-registry tests: 3 files / 26 tests
  passed;
- isolated Windows x64 Worker gate test: 1 file / 4 tests passed;
- approved historical artifact hash still matches
  `FB4611C502707476669F3BB4819BE29D86A277DA34CB0266E7D5778AC2E20CE2`.

Selective-port review rejected the old mixed candidate's upload, Assembly,
Delivery, runtime, Homework, recovery, R2 PDF, and generated-rule route code.
Those paths either were intentionally retired by `fdacfb63` or belong to later
published route/rule owners. Current policy behavior is equivalent to the
approved old policy; only comments and provider-neutral file placement differ.

### Exact blocker

Published ticket 50A requires real trusted-boundary enforcement plus browser
and API-direct proof. On the reconciled baseline, concrete consumers of
`createBookRolloutWorkerGate` do not yet exist:

- ticket 02 / issue 45 owns the Mode 2 shell and teacher entry surface;
- ticket 06A / issue 47 owns trusted upload begin/completion;
- ticket 09D / issue 59 owns canonical Worker dispatch and route ordering;
- ticket 09E owns generated Firebase composition and deployed rules.

All are downstream of 50A or retain other published blockers. Porting their old
implementations into 50A would violate the published graph and path ownership.
The historical canary proves the approved old mixed source candidate, not the
current reconciled overlay. No current browser proof, deployed readback,
propagation proof, or secure-provisioning readback can therefore close 50A.

Resolution owner: product owner / published-ticket authority. Required decision
is either:

1. explicitly define the shared policy/adapter scaffold as 50A's terminal
   trusted-boundary seam, leaving concrete route consumption and direct-request
   proof with the named downstream owners; or
2. revise the published blocker/ownership graph so 50A may own and prove those
   concrete routes without cross-ticket scope theft.

No route, rule, UI, deployment configuration, source implementation, staging,
commit, deployment, provisioning, or remote state was changed during this
audit. Rollback remains all six action gates denied while safe operations stay
available.

Strict evidence-gated CLOSED count remains 8/112 (7.14%). Ticket 50A is not
counted CLOSED.

## Ticket 04 ownership and approval-timing correction — 2026-07-23

This section supersedes the earlier Ticket 04 statement that treated B2
credential provisioning as the next immediate action.

Published issue 29 functionally owns the complete capacity reservation and
reconciliation seam, including:

- the `cloudflare/src/book-source-worker/` capacity-ledger and provider
  reconciliation modules;
- a minimal capacity-only Worker consumer and read-only deployed capacity
  probe;
- deployment configuration for that probe; and
- secure proof of a least-privilege B2 metadata identity.

No usable deployed probe currently exists. `wrangler.book-source-b2.jsonc`
names `luyentap-book-source-b2`, but its present state is compile-only,
provider-disabled, `workers_dev: false`, and exposes no Ticket 04 capacity
endpoint. Therefore provisioning a B2 key now, or attaching it to an upload,
R2, 03B, or 50A Worker, would be out of order and out of scope.

Correct Ticket 04 closure sequence:

1. implement or formally integrate the Ticket04-owned capacity-only Worker and
   endpoint, reusing the provider-neutral 03B adapter where useful;
2. keep upload authorization, upload preflight, delivery, and generated-rule
   routes out of Ticket 04;
3. pass local tests, isolated Worker tests, and Wrangler dry-run;
4. identify the exact Worker name, environment, and metadata-only secret
   bindings;
5. request explicit deployment and provisioning approval;
6. only after approval, create the restricted B2 key, attach it to that
   confirmed Worker, deploy the read-only probe, reconcile ledger totals
   against B2, and record rollback proof.

No Ticket 04 deployment or secret provisioning is currently authorized.
Because safe Ticket04-owned implementation remains, its earlier
`IN_PROGRESS -> BLOCKED` classification is superseded. It returns to `READY`
while Ticket 50A remains the sole primary ticket.

## Ticket 50A reconciled closure pass — 2026-07-23

### Execution state

`BLOCKED -> IN_PROGRESS -> BLOCKED`

The earlier ownership-blocker conclusion was superseded by a proof-only,
trusted-boundary canary that does not import later upload, delivery, runtime,
Homework, generated-rule, or canonical dispatch routes. The current
reconciled implementation remains default-deny and capability-free.

### Exact changed paths in this closure pass

- `cloudflare/src/book-rollout-canary-worker.ts`
- `cloudflare/test/book-rollout-canary-worker.test.ts`
- `cloudflare/wrangler.ticket50a-canary.jsonc`
- `cloudflare/scripts/verify-ticket50a-rollout-deployment-config.mjs`
- `cloudflare/scripts/read-ticket50a-rollout-deployment.mjs`
- `cloudflare/test/book-rollout-deployment-config.test.ts`
- `cloudflare/test/book-rollout-deployment-readback.test.ts`
- `src/services/book-rollout/bookRolloutGate.policy.test.ts`
- `src/pages/TeacherLobbyPage.test.jsx`
- `src/services/materialCatalog/materialCatalogRepair.service.test.ts`
- `e2e/prd0062-ticket50a-rollout-browser.spec.ts`
- `playwright.prd0062-ticket50a.config.mjs`
- `artifacts/prd0062-ticket-50a/browser/default-deny-create.png`

The material-catalog repair test remediation is reconciled-baseline regression
coverage: explicit modern Mode 1 rows no longer resemble legacy missing-mode
rows, and a separate test proves derived indexes backfill legacy omitted
`bookMode` to `materials` without rewriting canonical Book metadata.

### Acceptance and local proof

The canary exposes only safe status and decision probes. It never performs a
Book capability action and has no R2, B2, Firebase, Durable Object, service, or
route binding. Every action decision rereads deployment configuration.

| Proof | Result |
| --- | --- |
| Root focused rollout/config/feature/UI/catalog suites | PASS: 6 files / 69 tests |
| Isolated Windows x64 Worker/config/readback suites | PASS: 4 files / 17 tests |
| Scoped Worker TypeScript | PASS |
| Focused ESLint plus full repository lint/Mantine boundary | PASS |
| Ticket 50A deployment-config validator | PASS |
| Wrangler `4.112.0` dry-run, reconciled canary config | PASS: 10.77 KiB / gzip 2.89 KiB; only staging env and version metadata |
| Named Cloudflare `media` profile sentinel | PASS: `kahoot-media` visible; raw listing suppressed |
| R2 backup regression | PASS: 7 files / 40 tests |
| Production Vite build and bundle budget | PASS: 9,321 modules; root entry 233 KiB |
| Browser default-deny proof at `http://localhost:5173` | PASS: 1/1 in 2.2 minutes |
| Material-catalog repair regression after remediation | PASS: 1 file / 10 tests |

The browser proof used the built-in teacher quick-login path. It proves the
reconciled Create Book dialog keeps Materials enabled, PDF source disabled,
the unavailable status visible, and Save Book absent until an allowed mode is
selected. The screenshot is
`artifacts/prd0062-ticket-50a/browser/default-deny-create.png`.
No credential value was logged or copied into the reconciled worktree.

The full root run completed 549 files and 4,943 tests under an oversubscribed
shared harness: 503 files / 4,907 tests passed directly, 26 tests skipped, and
46 files reported failure. Every reported class was then isolated:

- 39 suites / 415 tests plus the 4-test Gemini key-rotation suite passed
  serially with process-local dummy Firebase test configuration;
- Teacher Lobby passed its focused Book test after selecting Materials;
- THCSTestEditor passed 5/5;
- TestTypeAdminPanel passed 5/5;
- ResultSlidePanel passed 37/37;
- the one ReadingV2RuntimeShell timeout passed alone (1/1; 61 skipped);
- material-catalog repair passed 10/10 after the focused fixture/backfill
  remediation.

The aggregate failures are therefore classified as missing test-environment
configuration, worker saturation, or the remediated legacy-index fixture—not
50A product regressions. Full root TypeScript still reports the unchanged
linked-worktree portability error TS2742 at `src/test/test-utils.tsx:51`;
Ticket 50A scoped TypeScript passes.

### Read-only remote evidence and exact remaining blocker

Read-only deployment inspection found active historical canary version
`b2bdf085-cb76-49e3-b2b4-7692977fa705`. Strict reconciled readback correctly
rejects it because it still carries the retired mixed candidate's Firebase,
rate-limit, and upload-grant bindings. This proves the current minimal
reconciled overlay is not deployed; the historical artifact cannot substitute
for current proof.

Closure now requires explicit approval for these remote mutations:

1. deploy `r2-upload-signer-s0-canary` in the `staging` environment from
   `cloudflare/wrangler.ticket50a-canary.jsonc`;
2. provision/rotate only its deployment secret
   `BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON` through controlled independent-gate
   policies, without printing its value;
3. verify direct forged requests remain denied, safe status remains readable,
   audit events contain privacy-safe decisions, config propagation is bounded,
   and emergency rollback restores all six actions to deny;
4. run strict deployment readback proving only
   `BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON`,
   `BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT`, and `CF_VERSION_METADATA` remain.

The canary has no capability bindings, so an allow decision cannot create,
upload, publish, place, launch, deliver, or mutate Book data. Rollback is to
restore the deployment secret to a valid all-six-deny revision and verify it
through status/direct-request/readback proof. If deployment fails before
activation, the current active version remains available. No deployment,
secret mutation, provisioning, staging, commit, merge, reset, or clean
operation occurred in this pass.

Ticket 50A is formally `BLOCKED` on deployment/provisioning approval owned by
the user. It is not CLOSED. Strict evidence-gated CLOSED count remains 8/112
(7.14%).

## Ticket 04 capacity-only deployment consumer — 2026-07-23

Ticket 04 returned from `READY` to `IN_PROGRESS` after the ownership
correction. It now has the minimal capacity-only Worker consumer required by
issue 29. The implementation does not add upload authorization, upload
preflight, delivery, deletion, generated Firebase rules, or rollout
capabilities.

### Exact changed paths

- `cloudflare/src/book-source-worker/capacity-probe-provider.ts`
- `cloudflare/src/book-source-worker/capacity-probe-worker.ts`
- `cloudflare/src/book-source-worker/provider-reconciliation.ts`
- `cloudflare/test/book-source-capacity-ledger.test.ts`
- `cloudflare/test/book-source-capacity-probe-provider.test.ts`
- `cloudflare/test/book-source-capacity-probe-worker.test.ts`
- `cloudflare/wrangler.book-source-capacity-probe.jsonc`
- this evidence file

The existing 03B Worker/config remains unchanged. No Ticket 04 secret is
attached to `luyentap-book-source-b2`, the upload signer, R2, or the Ticket 50A
canary.

### Owned Worker contract and conservative accounting

The deployment target is:

- Worker: `luyentap-book-source-capacity-s0`;
- Cloudflare account/profile: media account
  `e41db829dabe9993f03674afdfd56510`, named profile `media`;
- environment: `staging`;
- route: `POST /internal/book-source-capacity/reconciliation-page`;
- exposure: `workers_dev` staging endpoint, no CORS, bearer-authenticated,
  default-disabled until deployment-owned state is exactly `enabled`;
- operation: one B2 provider page per request, never a self-call or full scan;
- output: only a sealed continuation token or final `healthy`/`drift` status.

The response never contains raw or aggregate account totals, B2 cursor,
bucket/location identity, provider URL/body/error, object identity, or
credential material. Requests and responses are `no-store`. Input is bounded
to 64 KiB with a body-read deadline. B2 authorization/list responses are
bounded and each remote request has a ten-second deadline.

The continuation contains only AES-GCM-sealed expected totals, accumulated
totals, current opaque B2 continuation, and SHA-256 fingerprints of prior
continuations. The 256-page maximum round trip is tested. Raw historical B2
cursors are not retained.

The B2 identity must have exactly the `listFiles` capability, exactly one
configured bucket, and no name prefix. Backblaze documents
`b2_list_file_versions` under `listFiles`:
https://www.backblaze.com/docs/cloud-storage-application-key-capabilities

`upload` versions are counted, including retained older versions beneath a
hide marker. Zero-byte `hide`/`folder` rows are accepted. A provider `start`
row or unknown action fails reconciliation closed because `listFiles` cannot
prove unfinished large-file part bytes. Application-owned pending,
replacement, temporary, and unfinished bytes remain counted by the trusted
ledger. No reservation is admitted while provider reconciliation is
uncertain.

Ticket 04 exposes no release/delete route. Removing, expiring, or rewriting a
local reservation cannot reduce `providerReconciliation.totalBytes`. Old
replacement bytes remain in B2 `upload` version totals until a complete fresh
provider scan no longer reports the exact prior version. This formally
resolves the replacement seam without taking later deletion ownership or
fabricating free capacity.

### Acceptance and proof

| Proof | Result |
| --- | --- |
| Root Ticket 04 domain/repository/provider/rule suites | PASS: 7 files / 25 tests |
| RTDB emulator direct, cross-owner, stale, ancestor, multi-location, and read denial | PASS: 1 file / 2 tests |
| Isolated Windows x64 real workerd pool | PASS: 3 files / 19 tests |
| Probe coverage | PASS: exact `listFiles`/bucket/no-prefix, retained versions, unfinished/unknown fail-closed, one-page work, loop/cross-location/max-page bounds, 256-page sealed cursor, expiry/tamper, body cap/stall, remote timeout, auth/path/method/query/config denial, sanitized failure/no leakage |
| Focused Worker TypeScript | PASS |
| Focused ESLint | PASS |
| Full repository ESLint + Mantine boundary | PASS: 87 changed source files checked |
| Wrangler 4.112.0 x64 media-profile dry-run | PASS: 24.57 KiB / gzip 6.26 KiB; only staging environment and version metadata are present before secrets |
| Named profile/account guard | PASS: active profile `media`; sentinel `kahoot-media` and configured private Book bucket visible |
| Production Vite build + bundle budget | PASS: 9,321 modules; root entry 233 KiB; public preloads within budget |
| Diff/staging guard | PASS: tracked `git diff --check`; zero staged paths |

No independent Ticket 04 browser proof is published. Ticket 06B owns the
teacher over-capacity warning before transfer, so no substitute browser proof
was manufactured.

The first x64 pool attempt exposed a real config/harness mismatch:
compatibility date `2026-07-23` exceeded the repository-pinned workerd maximum
`2026-06-24`. The config now pins the newest supported date. A second attempt
then exposed duplicate Vitest module resolution in the external x64 harness;
the disposable harness was corrected without changing repository packages or
shared `node_modules`. Final real workerd execution passed 19/19.

No credential value, account total, B2 object metadata, or private authority
was printed or written. No deploy, Worker secret change, B2 key creation,
object test, remote write, staging, commit, merge, reset, clean, or source
worktree mutation occurred.

### Exact deployment/provisioning gate and rollback

Local proof is complete. Ticket 04 is now formally `BLOCKED`, not CLOSED,
because the remaining acceptance gates require user-authorized remote
mutation and credential provisioning:

1. deploy the same config once in its default-disabled state to create a
   known rollback version;
2. create one restricted Backblaze standard application key with exactly
   `listFiles`, bucket `bookpdf`, and no name prefix;
3. place all values in a secure temporary secrets file outside the
   repository, never stdout/chat, and deploy the enabled staging version with
   these secret bindings:
   - `BOOK_SOURCE_CAPACITY_PROBE_STATE`
   - `BOOK_SOURCE_CAPACITY_PROBE_TOKEN`
   - `BOOK_SOURCE_CAPACITY_CURSOR_KEY`
   - `BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY_ID`
   - `BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY`
   - `BOOK_SOURCE_B2_ENDPOINT`
   - `BOOK_SOURCE_B2_REGION`
   - `BOOK_SOURCE_B2_STORAGE_LOCATION_ID`
   - `BOOK_SOURCE_B2_PRIVATE_BUCKET_ID`
   - `BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME`
4. read back active Worker version, route, environment, and binding names;
5. run the authenticated multi-page read-only probe against trusted ledger
   totals and record only final `healthy`/`drift`, page count, version, and
   timestamp—never totals;
6. prove rollback by selecting the disabled baseline version and verifying
   the endpoint returns unavailable; revoke the newly created B2 key if the
   rollout is abandoned.

No disposable B2 object is required for Ticket 04. Upload/object mutation
belongs later tickets. User owns approval for Cloudflare deployment,
Backblaze credential creation, secure secret deployment, and rollback-key
revocation authority.

Strict CLOSED count remains 8/112 (7.14%).

### Live graph recalculation after Ticket 04 became BLOCKED

Read-only GitHub recalculation at `2026-07-23T10:53:38Z` found 112 PRD0062
issues, 308 published `Blocked by` edges, zero cycles, and zero missing or
mismatched references. GitHub still has all 112 issues open; local CLOSED and
BLOCKED states remain evidence-gated overlays.

With strict CLOSED tickets `01, 03A, 03B, 03C, 11, 12A, 12B, 22A` and formal
BLOCKED tickets `04, 50A`, the READY frontier is:

- 12C / issue 35, blocked only by CLOSED 12B;
- 26 / issue 37, blocked only by CLOSED 12B;
- 39A / issue 42, blocked only by CLOSED 12B;
- 48A / issue 43, blocked only by CLOSED 03C.

No dependent ticket was started. If the user withholds Ticket 04 live-proof
approval, closure-first scheduling may select Ticket 26 next: it has 69
downstream tickets and closing it immediately makes tickets 23, 24, 25, and
27 READY. Ticket 04 direct dependents `06A, 07, 08A, 09E` and Ticket 50A
direct dependents `02, 06A, 09D, 51A, 52A` remain paused.

## Ticket 04 disabled deployment baseline — 2026-07-23

User approval authorized Ticket 04's deployment, restricted B2 credential
provisioning, live read-only reconciliation, and rollback proof. The first
approved deployment established the disabled rollback baseline:

- Worker: `luyentap-book-source-capacity-s0`;
- environment: `staging`;
- route:
  `POST /internal/book-source-capacity/reconciliation-page`;
- Worker URL:
  `https://luyentap-book-source-capacity-s0.iamhuwng.workers.dev`;
- active version: `43a5c4e5-7bad-4376-b6c8-60b441ca45b1`;
- deployment: `6ac49dbc-3533-4b75-b1ad-b0762946fc3a`;
- traffic: 100% to the disabled baseline;
- bindings: only `BOOK_SOURCE_CAPACITY_ENVIRONMENT=staging` and
  `CF_VERSION_METADATA`;
- secret bindings: none.

Named-profile readback at `2026-07-23T12:11:32Z` used Wrangler `4.112.0`
under Windows x64 Node and the `media` profile. The profile still exposed
sentinel bucket `kahoot-media` and Cloudflare R2 bucket
`luyentap-book-source-private`. Those are Cloudflare account-routing proof,
not the Backblaze B2 capacity target.
`versions view` and `deployments status` directly confirmed the active version,
traffic, and binding list.

A direct no-proxy request to the exact route returned:

```text
HTTP/1.1 503 Service Unavailable
{"code":"unavailable"}
```

This proves the current deployed rollback baseline is fail-closed. It does not
prove B2 reconciliation.

No B2 key or Worker secret has been created. The authenticated Backblaze Chrome
tab is available, but the ChatGPT Chrome Extension timed out twice while
claiming it. Chrome, the extension, and the native-host checks all pass.
Chrome recovery guidance requires user permission before opening a new window
for the selected profile and retrying control. Ticket 04 therefore remains
`BLOCKED`, not `CLOSED`, at the credential-provisioning and enabled-live-proof
gate. No later ticket was started.

### Backblaze target and exact-capability reconciliation

After user-approved Chrome recovery, the authenticated Backblaze account
showed one private bucket:

- bucket name: `bookpdf`;
- region: `us-west-004`;
- S3 endpoint: `https://s3.us-west-004.backblazeb2.com`;
- current files and bytes: zero at inspection time.

No PRD decision prescribed a deployment-specific bucket name. The canonical
contract saves the selected storage location and private bucket identity per
Source Version. Therefore `bookpdf`, not the unrelated Cloudflare R2 bucket,
is the live V1 B2 location for this proof.

Backblaze's web form exposes only `Read and Write`, `Read Only`, and
`Write Only` capability groups. It cannot create the exact metadata-only
`listFiles` identity required by the probe's fail-closed authority check.
Weakening that check or accepting the broader `Read Only` bundle would violate
least privilege.

Official B2 CLI `4.7.1` was prepared outside the repository through `uvx`.
Its `key create` command accepts an exact comma-separated capability list and a
single `--bucket` restriction. A local credential/cache directory was created
at `%LOCALAPPDATA%\CodexSecure\prd0062-ticket04-b2` with inheritance disabled
and full control limited to the current user, `SYSTEM`, and local
Administrators. It contains no credential yet.

Remaining user-owned prerequisite: supply the already-saved Backblaze master
application key through the CLI's local interactive prompt. If that secret is
not available, generating a replacement master key would invalidate the old
master key and requires separate destructive credential-rotation approval.
No master key, standard key, Worker secret, or B2 object was created or
changed during this inspection.

## Ticket 04 live closure proof — 2026-07-23

This section supersedes Ticket 04's earlier `BLOCKED` state and all earlier
statements that provisioning or live reconciliation remained outstanding.
The user explicitly approved the Ticket 04 Cloudflare deployment, exact
least-privilege B2 credential provisioning, authenticated read-only live
probe, and rollback drill.

### Secure provisioning

Backblaze authorization completed through a restricted local prompt and cache
outside the repository. Credential values were never copied into repository
files, evidence, Worker output, or browser responses.

A standard B2 application key named
`prd0062-ticket04-capacity-20260723` was created with:

- capability exactly `listFiles`;
- exactly one bucket, `bookpdf`;
- no name prefix.

Read-only authorization revalidation at `2026-07-23T13:03:19.9650856Z`
confirmed that exact capability, bucket count/name, and null prefix. The
credential and generated probe/cursor secrets remain in
`%LOCALAPPDATA%\CodexSecure\prd0062-ticket04-b2`, whose inherited ACLs are
disabled and whose access is limited to the current user, `SYSTEM`, and local
Administrators.

The enabled Worker version contains these ten secret binding names, with every
value hidden:

- `BOOK_SOURCE_CAPACITY_PROBE_STATE`
- `BOOK_SOURCE_CAPACITY_PROBE_TOKEN`
- `BOOK_SOURCE_CAPACITY_CURSOR_KEY`
- `BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY_ID`
- `BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY`
- `BOOK_SOURCE_B2_ENDPOINT`
- `BOOK_SOURCE_B2_REGION`
- `BOOK_SOURCE_B2_STORAGE_LOCATION_ID`
- `BOOK_SOURCE_B2_PRIVATE_BUCKET_ID`
- `BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME`

It also contains only the declared plain-text staging environment and
Cloudflare version metadata. It has no R2, Firebase, service, Durable Object,
upload, delete, or private-object binding.

### Live remediation and deployment proof

Sanitized live tail diagnostics first isolated authorization failures to the
provider's `authorize/network` phase. The deployed Worker was storing native
`fetch` and invoking it as a method of the provider object. Cloudflare runtime
functions require their original receiver; the provider now invokes the
fetcher with `globalThis`. A regression assertion verifies that receiver.
Redirect following remains enabled, and the final response URL is still
strictly validated as HTTPS, a permitted Backblaze API host, the exact phase
path, and no credentials, query, or fragment.

The diagnostic event remains allowlisted to event, code, phase, kind, and
optional HTTP status. It cannot include credentials, tokens, URLs, provider
bodies, bucket/object identity, totals, continuation material, or stacks.
All failed diagnostic versions were superseded before closure.

Final deployment:

- Worker: `luyentap-book-source-capacity-s0`;
- profile/account guard: named `media` profile, with sentinel
  `kahoot-media` visible before mutation;
- environment: `staging`;
- route:
  `POST /internal/book-source-capacity/reconciliation-page`;
- URL:
  `https://luyentap-book-source-capacity-s0.iamhuwng.workers.dev`;
- active version: `7b5762ef-4f70-4477-ac5e-d623746e14b4`;
- active deployment: `2a0bd46e-db72-4512-9117-2afe36c22678`;
- traffic: 100%.

The trusted Firebase ledger path was read before reconciliation. The
authenticated, no-proxy, bounded pagination probe then reconciled that trusted
ledger view against B2:

```text
state=healthy
pages=1
http=200
version=7b5762ef-4f70-4477-ac5e-d623746e14b4
timestamp=2026-07-23T12:58:09.0115317Z
```

No account totals, credential values, B2 object metadata, continuation token,
or private authority were recorded. No disposable object was created because
Ticket 04 requires read-only reconciliation and later upload tickets own
object mutation.

### Rollback proof and final state

The approved drill deployed disabled baseline version
`43a5c4e5-7bad-4376-b6c8-60b441ca45b1` to 100% through deployment
`f1c527ad-21b1-4c58-87c0-b570c32ac320`. A direct request returned:

```text
state=unavailable
http=503
timestamp=2026-07-23T12:57:20.4053445Z
```

The validated enabled version was then restored to 100%, deployment readback
confirmed all binding names and no capability bindings, and the authenticated
probe returned `healthy` again. The restricted B2 key remains provisioned
because the final read-only probe remains deployed. If rollout is abandoned:

1. select disabled baseline version
   `43a5c4e5-7bad-4376-b6c8-60b441ca45b1`;
2. verify the route returns `503 unavailable`;
3. disable new reservation creation while preserving ledger, operation, and
   Source Version identity rows for reconciliation;
4. revoke `prd0062-ticket04-capacity-20260723`.

Rollback never deletes rows, releases capacity, fabricates free capacity, or
interrupts existing healthy source reads.

### Final acceptance and verification matrix

| Gate | Evidence |
| --- | --- |
| 500 MiB declaration boundary | Unit coverage passes exact boundary and over-limit rejection |
| Concurrent 9,000,000,000-byte ceiling | Transaction/CAS tests pass boundary, concurrency, and stale retry cases |
| Conservative byte categories | Domain and Worker tests count ready, pending, replacement, temporary, hidden, retained, delayed-deletion, unfinished, and provider-reported bytes |
| Replacement overlap | Old provider versions stay counted until exact deletion is absent from a complete fresh provider scan |
| Immutable reservation identity | Source Version/service/repository tests cover fixed sourceVersionId, sourceKey, owner, Book, storage location, bucket, generated object key, size, checksum/provider slots, expiry, revision, and lifecycle |
| Verified completion only | Repository/transaction tests reject mismatched or incomplete provider identity and allow exact idempotent verified replay |
| One bounded normalized PDF display filename | NFKC, PDF extension, separator/control, compatibility, length, empty, ingress/constructor/repository/restore coverage passes |
| Browser write denial | Fragment and RTDB emulator tests deny direct, cross-owner, stale, ancestor-shaped, multi-location, and read access; 09E retains generated-rule composition ownership |
| Reconciliation fail-closed | Unit/workerd tests cover drift, malformed provider data, timeout, cursor tamper/loop, page bounds, and no-leakage responses |
| Browser proof | Not independently required; published issue assigns the over-capacity UI proof to 06B |
| Deployment proof | Active read-only Worker reconciled trusted ledger against configured B2 account/bucket as `healthy` |
| Secure provisioning | Exact `listFiles`, one `bookpdf` bucket, null prefix; ten declared hidden bindings; no credential/account-total browser or repository exposure |
| Rollback | Disabled version selected and read back; live route proved `503 unavailable`; validated enabled version restored and reproved healthy |

Final verification after the live receiver fix:

| Proof | Result |
| --- | --- |
| Root Ticket 04 domain/repository/rule suites | PASS: 6 files / 22 tests |
| Isolated Windows x64 real workerd pool | PASS: 3 files / 20 tests |
| Isolated RTDB emulator | PASS: 1 file / 2 tests |
| Ticket 04 root scoped TypeScript | PASS |
| Ticket 04 Worker scoped TypeScript | PASS |
| Ticket 04 root and Worker focused ESLint | PASS |
| Full repository ESLint + Mantine boundary | PASS: 87 changed source files checked |
| Production Vite build + bundle budget | PASS: 9,321 modules; root entry 233 KiB |
| Wrangler 4.112.0 x64 media-profile dry-run | PASS: 27.44 KiB / gzip 6.92 KiB; disabled config has only staging environment and version metadata |
| Live enabled deployment/readback | PASS: exact ten hidden secrets, staging environment, version metadata, 100% active version |
| Authenticated reconciliation | PASS: healthy, one page, HTTP 200 |
| Rollback and restore | PASS: disabled 503, then enabled healthy |
| Final diff/staging/security guard | PASS: tracked diff and 23 Ticket 04 paths have no whitespace errors; zero staged paths; four in-memory secret values have zero repository matches |

Exact Ticket 04 paths remain:

- `src/types/bookSource.types.ts`
- `src/services/book-source-delivery/sourceVersion.service.ts`
- `src/services/book-source-delivery/sourceVersion.service.test.ts`
- `src/services/book-source-delivery/sourceDisplayFilename.service.ts`
- `src/services/book-source-delivery/sourceDisplayFilename.service.test.ts`
- `src/services/book-source-delivery/sourceCapacity.service.ts`
- `src/services/book-source-delivery/sourceCapacity.service.test.ts`
- `src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts`
- `src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.test.ts`
- `src/services/book-source-delivery/sourceUpload.rtdbRepository.ts`
- `src/services/book-source-delivery/sourceUpload.rtdbRepository.test.ts`
- `cloudflare/src/book-source-worker/capacity-ledger.ts`
- `cloudflare/src/book-source-worker/provider-reconciliation.ts`
- `cloudflare/src/book-source-worker/capacity-probe-provider.ts`
- `cloudflare/src/book-source-worker/capacity-probe-worker.ts`
- `cloudflare/test/book-source-capacity-ledger.test.ts`
- `cloudflare/test/book-source-capacity-probe-provider.test.ts`
- `cloudflare/test/book-source-capacity-probe-worker.test.ts`
- `cloudflare/src/upload-worker/book-rules/fragments/04.json`
- `src/__tests__/security/bookSourceCapacityTicket04RuleFragment.test.ts`
- `src/__tests__/security/bookSourceCapacityTicket04FirebaseRules.emulator.test.ts`
- `cloudflare/wrangler.book-source-capacity-probe.jsonc`
- this evidence file.

Ticket 04 is locally `CLOSED`. GitHub issue 29 remains remotely open because
no issue mutation, staging, commit, merge, or push was performed. Strict
evidence-gated CLOSED count is now 9/112 (8.04%).

### Final independent review remediation and graph recalculation

Independent review found one repository/ledger mismatch before the CLOSED
claim was finalized: the RTDB repository rejected duplicate Source Version and
provider object identities but could admit a second `initial` reservation with
the same `sourceKey`. The trusted capacity ledger permits a shared source key
only when the new reservation is a `replacement`.

`sourceUpload.rtdbRepository.ts` now rejects an existing `sourceKey` for every
new non-replacement reservation. Its regression test proves a second `initial`
reservation is rejected while a `replacement` using the same source key
remains allowed. The focused repository test, full six-file Ticket 04 root
suite, scoped TypeScript/ESLint, full repository lint/Mantine boundary, and
production build/bundle budget all passed after this remediation. The
independent reviewer then returned PASS with no remaining concrete Ticket 04
finding.

The published GitHub graph was read again at
`2026-07-23T13:08:26.4533107Z`:

- 112 PRD0062 tickets, all still remotely open;
- 308 published blocker edges;
- zero missing issue references;
- zero dependency cycles.

Using the strict local CLOSED overlay `01, 03A, 03B, 03C, 04, 11, 12A, 12B,
22A` and keeping 50A formally BLOCKED, the READY frontier is:

- 08A / issue 30, blocked only by CLOSED 01, 03A, and 04;
- 12C / issue 35, blocked only by CLOSED 12B;
- 26 / issue 37, blocked only by CLOSED 12B;
- 39A / issue 42, blocked only by CLOSED 12B;
- 48A / issue 43, blocked only by CLOSED 03C.

Ticket 04's other direct dependents remain graph-blocked: 06A, 07, and 09E.
No next implementation ticket was started during Ticket 04 closure.

Transitive downstream leverage for the READY frontier is 12C: 74, 08A: 73,
26: 69, 39A: 29, and 48A: 10. Under the published selection rule, 12C is the
next primary candidate; it remains `READY`, not started.

## Ticket 50A live closure proof — 2026-07-23

The user explicitly approved only the capability-free
`r2-upload-signer-s0-canary` staging deployment, secure provisioning and
rotation of `BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON`, direct-request and bounded
propagation proof, privacy-safe audit proof, emergency all-six-deny rollback,
and strict deployment readback. No allow gate, pilot, production capability,
Firebase/R2/B2 mutation, Git staging, commit, merge, or push was authorized or
performed.

### Historical deployment reconciliation

Read-only preflight found historical active version
`b2bdf085-cb76-49e3-b2b4-7692977fa705` still contained Firebase, upload,
rate-limit, and Book Assembly bindings plus upload/delivery handlers. Its old
"all-deny" version was the same mixed script and was not a valid reconciled
rollback target.

The first reconciled upload was rejected before activation because Cloudflare
would not delete the historical `UploadGrantReplayLedger` Durable Object class
without a destructive migration. No destructive migration was authorized or
run. The canary now retains only that historical export name as an unbound,
fail-closed compatibility class whose sole response is `503 unavailable`.
This preserves the migration tag and storage while preventing invocation from
performing a capability. Unit coverage proves that behavior.

The second deployment succeeded. Wrangler secret inheritance then exposed one
remaining additive legacy Worker binding, `UPLOAD_GRANT_SECRET`. The approved
exact-three-binding end state required deleting that canary-only binding.
Deletion removed only the binding from this canary; it did not revoke an
external credential or mutate R2.

### Secure provisioning and deployment

Three valid all-six-deny documents were generated outside the repository in
`%LOCALAPPDATA%\CodexSecure\prd0062-ticket50a`, with inherited ACLs disabled
and access limited to the current user, `SYSTEM`, and local Administrators:

- baseline deny;
- propagation deny;
- emergency deny.

Each document uses the exact v1 schema, environment `staging`, a canonical
issued/expiry window below 24 hours, and independent `deny` values for
`create`, `upload`, `publish`, `assign-place`, `launch-delivery`, and
`mutation`. Values were never printed, copied into Git, browser-readable
storage, tickets, or evidence.

Final deployment:

- Worker: `r2-upload-signer-s0-canary`;
- URL:
  `https://r2-upload-signer-s0-canary.iamhuwng.workers.dev`;
- environment: `staging`;
- active emergency-deny version:
  `9932d453-e286-4ac9-9a24-cd153a3fd47e`;
- active deployment: `6aa0940b-96d1-4b35-b0b3-3d1f2fc4db9c`;
- traffic: 100%;
- handlers: `fetch`, unbound fail-closed `UploadGrantReplayLedger`, and
  canary factory only;
- active capability bindings: none.

Strict readback passed with exactly:

- `BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON` — `secret_text`;
- `BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT` — `plain_text`, `staging`;
- `CF_VERSION_METADATA` — `version_metadata`.

### Live direct-request, propagation, audit, and rollback proof

Under the baseline deployment-owned deny revision:

- `GET /__ticket50a/status` returned HTTP 200, safe `read` allowed,
  `capabilityActivated=false`, and declared safe operations `read`, `cleanup`,
  `revocation`, `recovery`, and `audit`;
- forged headers, request JSON, query/local-storage/Firebase-shaped claims,
  and a client-supplied all-allow policy did not affect authorization;
- all six action endpoints returned HTTP 503, `allowed=false`,
  `reason=config_denied`.

No action endpoint performs a Book capability even if policy evaluation were
allowed. No allow revision was provisioned or tested.

Rotation from baseline deny to a second all-deny revision was observed on the
first post-deployment probe in 6.21 seconds. The action stayed denied
throughout. Emergency deny rotation was visible within approximately 11
seconds; the previous revision also denied every action during propagation.
After the emergency revision became visible, all six action endpoints again
returned HTTP 503 and safe read remained HTTP 200.

Wrangler tail showed only the privacy-safe audit schema:

```text
schemaVersion, category, outcome, operation, policy, reason,
environment, revision, fingerprint
```

It showed safe read as allowed/static-safe and upload/mutation as
denied/config-denied. No raw configuration, issued/expiry time, request body,
query, identity, Book/content data, credential, or secret value appeared.

Emergency rollback procedure is to rotate
`BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON` to a valid all-six-deny document and wait
until direct action responses expose its safe revision/fingerprint. Safe
baseline version `d3c90d43-7c0d-41a2-b2b5-f8f349092d75` remains an exact-three
binding version target if version rollback is required. Rollback preserves
safe operations and performs no Firebase/R2/B2 mutation.

### Final acceptance and verification

| Gate | Evidence |
| --- | --- |
| Missing/malformed/stale/unreadable config | Policy and Worker truth tables deny all six actions |
| Server/deployment ownership | Forged browser headers/body/query/storage/Firebase/feature metadata cannot change decisions |
| Independent action gates | Exact six-action truth tables and live six-endpoint denial |
| Safe operations preserved | Static policy coverage plus live status/read proof |
| Version/environment/audit/privacy | Exact schema, staging readback, revision/fingerprint propagation, allowlisted audit payload |
| Trusted boundary | Capability-free Worker evaluates each direct request and rereads deployment config |
| Existing flows | Feature/UI/catalog suites and R2 backup regression pass |
| Browser proof | Teacher quick-login flow shows Materials enabled, PDF source disabled, unavailable copy visible, and no Save Book action |
| Deployment proof | Minimal active version, bounded deny-to-deny propagation, audit proof, emergency deny, exact-three readback |
| Secure provisioning | One hidden deployment secret only; zero browser-readable enable secret or repository value |
| Rollback | Emergency all-six-deny revision observed live; previous config stayed deny during propagation |

Final proof:

| Proof | Result |
| --- | --- |
| Root rollout/config/feature/UI/catalog/rule suites | PASS: 6 files / 92 tests |
| Isolated Windows x64 Worker/config/readback suites | PASS: 4 files / 19 tests |
| Scoped Worker TypeScript and focused ESLint | PASS |
| Ticket 50A config validator | PASS |
| Wrangler 4.112.0 x64 media-profile dry-run | PASS: 10.98 KiB / gzip 2.95 KiB; only staging environment and version metadata before secret |
| Strict deployed readback | PASS: exact three approved bindings |
| Live forged/direct proof | PASS: six HTTP 503 denials; safe read HTTP 200 |
| Bounded propagation | PASS: 6.21 seconds for deny revision rotation |
| Emergency rollback | PASS: emergency revision observed; all six denied |
| Privacy-safe audit | PASS: safe allow and action denial, allowlisted fields only |
| Teacher browser proof | PASS: 1/1 in 18.6 seconds at `http://localhost:5173` |
| R2 backup regression | PASS: 7 files / 40 tests |
| Full repository ESLint + Mantine boundary | PASS: 87 changed source files checked |
| Production Vite build + bundle budget | PASS: 9,321 modules; root entry 233 KiB |
| Final diff/staging/security guard | PASS: diff/whitespace clean, zero staged paths, three deployment-secret documents with zero changed-repository matches |

The first browser rerun failed before application rendering because the
reconciled worktree intentionally has no `.env`; Firebase web config was
absent. The final rerun loaded the preserved source worktree's existing `.env`
into the dev-server process only. No file was copied or printed, and the same
Playwright proof then passed.

Exact Ticket 50A paths:

- `src/config/featureRegistry.ts`
- `src/config/bookActivityRolloutGates.ts`
- `src/config/bookActivityRolloutGates.test.ts`
- `src/services/book-rollout/bookRolloutGate.policy.ts`
- `src/services/book-rollout/bookRolloutGate.policy.test.ts`
- `cloudflare/src/book-rollout-gate.ts`
- `cloudflare/src/book-rollout-canary-worker.ts`
- `cloudflare/test/book-rollout-gate.test.ts`
- `cloudflare/test/book-rollout-canary-worker.test.ts`
- `cloudflare/test/book-rollout-deployment-config.test.ts`
- `cloudflare/test/book-rollout-deployment-readback.test.ts`
- `cloudflare/scripts/verify-ticket50a-rollout-deployment-config.mjs`
- `cloudflare/scripts/read-ticket50a-rollout-deployment.mjs`
- `cloudflare/wrangler.ticket50a-canary.jsonc`
- `src/pages/TeacherLobbyPage.test.jsx`
- `src/services/materialCatalog/materialCatalogRepair.service.test.ts`
- `e2e/prd0062-ticket50a-rollout-browser.spec.ts`
- `playwright.prd0062-ticket50a.config.mjs`
- `artifacts/prd0062-ticket-50a/browser/default-deny-create.png`
- this evidence file.

Ticket 50A is locally `CLOSED`. GitHub issue 44 remains remotely open because
no issue mutation, staging, commit, merge, or push was performed. Strict
evidence-gated CLOSED count is now 10/112 (8.93%).

### Live graph recalculation after Ticket 50A closure

Read-only GitHub recalculation at `2026-07-23T13:54:20.6126209Z` found:

- 112 PRD0062 tickets, all remotely open;
- 308 published blocker edges;
- zero missing issue references;
- zero dependency cycles.

Using the strict CLOSED overlay `01, 03A, 03B, 03C, 04, 11, 12A, 12B, 22A,
50A`, the READY frontier is:

- 02 / issue 45 — blockers CLOSED 01 and 50A; 84 transitive descendants;
- 12C / issue 35 — blocker CLOSED 12B; 74 descendants;
- 08A / issue 30 — blockers CLOSED 01, 03A, and 04; 73 descendants;
- 26 / issue 37 — blocker CLOSED 12B; 69 descendants;
- 39A / issue 42 — blocker CLOSED 12B; 29 descendants;
- 48A / issue 43 — blocker CLOSED 03C; 10 descendants;
- 51A / issue 127 — blocker CLOSED 50A; 8 descendants.

Ticket 02 is the next primary candidate by published critical-path leverage.
It remains `READY`, not started. No next implementation ticket was started
during Ticket 50A closure.

## Ticket 50A approved staging-canary revalidation — 2026-07-23

The user reauthorized only the capability-free
`r2-upload-signer-s0-canary` staging deployment, deny-only secure
provisioning/rotation of `BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON`, live direct
request and propagation proof, privacy-safe audit proof, emergency
all-six-deny rollback, strict deployment readback, and test/browser
revalidation. No allow gate, production capability, Firebase/R2/B2 mutation,
Git staging, commit, merge, or push was authorized or performed.

### Deployment and secure provisioning

- x64 Node and Wrangler `4.112.0` were verified.
- Named profile `media` was verified through the expected `kahoot-media`
  sentinel bucket.
- Wrangler dry-run passed at `10.98 KiB`, gzip `2.95 KiB`, with only staging
  environment and version metadata visible before the secret.
- Secure deny documents remained outside the repository under
  `%LOCALAPPDATA%\CodexSecure\prd0062-ticket50a`; ACLs allow only the current
  user, `SYSTEM`, and local Administrators.
- Reconciled deployment version:
  `2db500cb-f6a9-42a0-a4a2-54a7458c5d2d`.
- Final emergency-deny active version:
  `4ae4dd86-4d98-40a3-8c99-1dd99ea75c4b`.
- Strict active readback again returned exactly:
  `BOOK_ACTIVITY_ROLLOUT_CONFIG_JSON` (`secret_text`),
  `BOOK_ACTIVITY_ROLLOUT_ENVIRONMENT` (`plain_text`, staging), and
  `CF_VERSION_METADATA` (`version_metadata`).

One proof-harness mistake was fail-closed: the first secret command supplied
the secure secrets-file wrapper instead of its in-memory binding value. Live
action evaluation returned `invalid_config` and denied capability. The command
was corrected without printing the value. A second harness mistake polled the
static-safe status decision for a rollout revision; the corrected propagation
probe polled a denied action decision. Neither mistake enabled an action or
mutated Book, Firebase, R2, or B2 data.

### Live direct, propagation, audit, and rollback proof

- `GET /__ticket50a/status` returned HTTP 200, safe read allowed,
  `capabilityActivated=false`, and safe operations `read`, `cleanup`,
  `revocation`, `recovery`, and `audit`.
- Forged headers, query parameters, request JSON, client policy, and
  Firebase-shaped claims could not authorize any action.
- `create`, `upload`, `publish`, `assign-place`, `launch-delivery`, and
  `mutation` each returned HTTP 503, `allowed=false`, and
  `reason=config_denied`.
- Deny-to-deny propagation completed in 5.95 seconds; every observed action
  response stayed denied.
- Emergency all-six-deny rollback completed in 5.55 seconds; all six actions
  were denied afterward and safe status remained HTTP 200.
- Live Worker audit messages contained only `schemaVersion`, `category`,
  `outcome`, `operation`, `policy`, `reason`, `environment`, `revision`, and
  `fingerprint`. No raw config, secret, request body, identity, Book/content
  data, issued time, or expiry time appeared in the application audit payload.

### Revalidation

| Proof | Result |
| --- | --- |
| Isolated x64 Worker/config/readback suites | PASS: 4 files / 19 tests |
| Root rollout/config/feature/UI/catalog/rule suites | PASS: 6 files / 93 tests |
| Focused Ticket 50A ESLint | PASS |
| Teacher quick-login browser proof at `http://localhost:5173` | PASS: 1/1 in 19.4 seconds |
| Browser artifact | refreshed `artifacts/prd0062-ticket-50a/browser/default-deny-create.png` |
| Latest production Vite build | PASS before this proof-only rerun; no product code changed afterward |
| Final diff/staging/security guard | PASS: `git diff --check`; zero staged paths; zero secure-value matches in changed/untracked repository files |

Ticket 50A remains `CLOSED`; strict CLOSED count remains 10/112 (8.93%).
This proof-only rerun changed no Ticket 50A product source. It refreshed the
browser artifact and this evidence document only.

Fresh GitHub read at `2026-07-23T15:10:42.1533567Z` found 112 published
PRD0062 tickets, 112 remotely open issues, 308 blocker edges, zero missing
references, and no cycle (112/112 Kahn traversal). With the existing CLOSED
overlay, graph-clear unresolved tickets are `02`, `08A`, `12C`, `26`, `39A`,
`48A`, and `51A`. Ticket 02 is already `IN_PROGRESS` as the sole primary
ticket. No other implementation ticket was started.

## Ticket 02 closure review — 2026-07-23

**State: `BLOCKED`.** Local implementation, focused tests, build, and localhost
browser proof pass. Published issue 45 additionally requires a preview
deployment with production-equivalent Firebase authentication. That remote
mutation is not covered by the Ticket 50A-only deployment approval.

### Focused responsibility and changed paths

Ticket 02 resolves the persisted, authorized Book before dispatch. URL,
history, modal state, and caller-provided values cannot select mode.
Materials and legacy missing-mode Books continue to use the existing editor;
`pdf` Books use a separate read-only Assembly shell.

Exact Ticket 02 paths:

- `src/components/books/BookEditorModal.css`
- `src/components/books/BookEditorModal.test.tsx`
- `src/components/books/BookEditorModal.tsx`
- `src/components/books/BookEditorPage.test.tsx`
- `src/components/books/BookEditorPage.tsx`
- `src/components/books/BookEditorWorkspace.tsx`
- `src/components/books/BookEditorModeDispatch.test.tsx`
- `src/components/books/BookMode2EditorShell.css`
- `src/components/books/BookMode2EditorShell.tsx`
- `src/components/books/useBookEditorModeResolution.ts`
- `src/pages/TeacherLobbyPage.jsx`
- `src/pages/TeacherLobbyPage.test.jsx`
- `src/routes/TeacherMaterialBookRedirect.tsx`
- `src/routes/teacherRoutes.test.tsx`
- `artifacts/prd0062-ticket-02/browser/materials-lobby-modal.png`
- `artifacts/prd0062-ticket-02/browser/pdf-lobby-modal.png`
- `artifacts/prd0062-ticket-02/browser/materials-direct.png`
- `artifacts/prd0062-ticket-02/browser/pdf-direct.png`
- this evidence file.

No new route/action identifier is emitted. Existing registered Book-open
action ownership remains unchanged.

### Acceptance, tests, and browser proof

| Gate | Result |
| --- | --- |
| Authorized stored-mode resolution before dispatch | PASS |
| Forged location/query/modal state rejected as mode authority | PASS |
| Materials and legacy missing-mode Books use unchanged materials editor | PASS |
| PDF Books use separate shell with no material-picker substitution | PASS |
| Unknown, malformed, cross-owner, and unauthorized IDs use safe errors | PASS |
| Modal, page, lobby-card, direct route, refresh, and history parity | PASS locally |
| Focused dispatch/modal/page/lobby/route tests | PASS: 5 files / 84 tests |
| Root Ticket 02 plus rollout regression set | PASS within final 6 files / 93 tests |
| Focused ESLint and scoped TypeScript | PASS |
| Production Vite build | PASS: 9,326 modules |
| `git diff --check` / staged paths | PASS / zero staged paths |

Browser proof used teacher quick-login at `http://localhost:5173` with one
materials Book and one PDF Book:

- lobby modal opened the materials editor with Overview/Content/Settings and
  no PDF Assembly controls;
- lobby modal opened the PDF Assembly shell with read-only copy and no
  materials tabs, Save, or Request review control;
- both direct links resolved the persisted mode;
- refresh preserved each mode;
- browser back returned from PDF to the materials editor;
- browser forward returned to the PDF shell without materials controls.

The localhost server used the preserved source worktree's existing Firebase
web environment in process only. No `.env` file or value was copied, printed,
or committed.

### Deployment and rollback review

Read-only Firebase inspection found:

- project `temp-a1437`;
- Hosting target/site `kahut1`;
- existing preview channel `prd0062-ticket-02`;
- current preview URL
  `https://kahut1--prd0062-ticket-02-kp0t9w9g.web.app`;
- current remote version `8af755306eb66f6c`, created
  `2026-07-22T10:32:26.803186Z`.

That existing preview is stale relative to the reconciled build: its root
assets are `index-CT0YNocy.js` and `index-BhI-boB2.css`, while the current
verified build uses `index-ChRg7vky.js` and `index-BEQm8bTc.css`. Therefore,
the existing channel cannot serve as deployed proof for the current diff.

Required remaining operation is a scoped Hosting preview-channel deployment
of the verified `dist` to target `kahut1`, project `temp-a1437`, channel
`prd0062-ticket-02`, followed by authenticated browser proof against that
preview URL and remote release/version readback. This requires explicit user
approval.

Feature rollback is already fail-safe:

- live Ticket 50A remains all-six-deny and hides new Mode 2 entry/launch;
- stored PDF Books render the read-only unavailable Assembly shell;
- rollback never sends a PDF Book through the materials editor.

No Ticket 02 secure provisioning is required. No Firebase deployment,
channel mutation, staging, commit, merge, or push was performed during this
review.

### Blocker and readiness

Remaining blocker owner: user. Needed approval: deploy the reconciled static
build only to Firebase Hosting preview channel `prd0062-ticket-02` on site
`kahut1` in project `temp-a1437`, then run authenticated read-only proof and
strict release readback. This is not a live-channel deployment and does not
authorize Firebase data/rules mutation.

Read-only GitHub recalculation at `2026-07-23T22:20:00.3746256+07:00` found
112 published tickets. Using the strict local CLOSED overlay
`01, 03A, 03B, 03C, 04, 11, 12A, 12B, 22A, 50A`, graph-clear unresolved
tickets are `02`, `08A`, `12C`, `26`, `39A`, `48A`, and `51A`. Ticket 02 is
formally `BLOCKED` only on preview deployment approval. No next implementation
ticket was started. CLOSED count remains 10/112 (8.93%).

## Ticket 02 approved preview resolution — 2026-07-23

**State: `CLOSED`.** The user approved deployment of the current reconciled
build to Firebase Hosting preview channel `prd0062-ticket-02` on site
`kahut1`, followed by authenticated preview verification and release readback.

### Build and deployment proof

Repository `node_modules` first failed before app code because its shared
Rollup installation lacked `@rollup/rollup-win32-x64-msvc`. No package,
lockfile, shared dependency, or product source was changed. The existing
isolated Windows x64 harness was repaired only inside its temporary directory.
Its copied `src`, `index.html`, `vite.config.js`, `package.json`, and
`package-lock.json` matched the live reconciled worktree exactly.

The production build then passed:

- Node: Windows x64;
- Vite: `7.1.11`;
- modules transformed: `9,326`;
- bundle budget: PASS, root entry `233 KiB`;
- deployed `dist` manifest SHA-256:
  `88d8f80a31680c11c321bd8c8ee6b332e36836f83623f4b71fd280f0cfd039e1`;
- root assets:
  `firebase-vendor-YSfbRWzl.js`,
  `index-CfXrcr85.js`,
  `index-CQBNuO_n.css`, and
  `react-vendor-By12h6Zw.js`.

Scoped preview deployment completed:

- Firebase project: `temp-a1437`;
- Hosting site/target: `kahut1`;
- channel: `prd0062-ticket-02`;
- URL:
  `https://kahut1--prd0062-ticket-02-kp0t9w9g.web.app`;
- release:
  `projects/temp-a1437/sites/kahut1/channels/prd0062-ticket-02/releases/1784820564444000`;
- version:
  `projects/temp-a1437/sites/kahut1/versions/e769b080d7ac054f`;
- create time: `2026-07-23T15:29:11.414569Z`;
- finalize time: `2026-07-23T15:29:24.050064Z`;
- automatic expiry: `2026-07-30T15:29:10.786621974Z`.

Direct readback from the channel and both Book deep-link paths returned HTTP
200 and the exact current root assets above. The prior stale version
`8af755306eb66f6c` is no longer the channel release.

### Production-equivalent authenticated preview proof

The Google Cloud browser key intentionally permits Firebase authentication
only from approved app/localhost origins; the ephemeral preview hostname is
not allowlisted. A direct quick-login attempt therefore failed with
`auth/requests-from-referer-...-are-blocked`. Read-only `gcloud` inspection
confirmed project `temp-a1437`, active account `iamhuwng@gmail.com`, the
Firebase auto-created browser key, its five Firebase API targets, and no
preview-channel referrer. No API-key restriction was changed.

Per user direction, proof used a temporary read-only reverse proxy on
`http://localhost:5173`, the approved teacher-auth origin. Every application
HTML/JS/CSS response came from the deployed preview channel and carried a
harness-only upstream marker. Root and deep-link asset hashes/names matched
the Firebase channel readback. The proxy accepted only GET/HEAD and performed
no Firebase mutation. It was stopped after proof.

Fresh isolated x64 Playwright then passed every browser gate:

- teacher dev quick-login authenticated;
- materials lobby card opened the materials modal with Overview/Content and
  no PDF Assembly controls;
- PDF lobby card opened the separate read-only Assembly shell with no
  materials Content tab;
- materials and PDF direct links chose the stored mode;
- refresh preserved each mode;
- browser back returned to materials;
- browser forward returned to PDF;
- no published state changed.

Result: 9/9 assertions passed. Final deployed artifacts:

- `artifacts/prd0062-ticket-02/browser/preview-materials-lobby-modal.png`
- `artifacts/prd0062-ticket-02/browser/preview-pdf-lobby-modal.png`
- `artifacts/prd0062-ticket-02/browser/preview-materials-direct.png`
- `artifacts/prd0062-ticket-02/browser/preview-pdf-direct.png`

The direct blocked-referrer capture is retained as
`preview-auth-referrer-blocked.png` to document why the approved-origin proxy
was required.

### Final tests, rollout, and rollback

| Proof | Result |
| --- | --- |
| Focused dispatch/modal/page/lobby/route suite | PASS: 5 files / 84 tests |
| First no-env focused attempt | Harness-only: 77 tests passed; route suite did not collect because Firebase web env was absent |
| Production Vite build and bundle budget | PASS: 9,326 modules; root entry 233 KiB |
| Focused ESLint | PASS: zero errors; CSS ignored by configured ESLint |
| Authenticated deployed-byte browser proof | PASS: 9/9 |
| Firebase channel/release/version readback | PASS |
| Remote deep-link rewrite/readback | PASS: both HTTP 200 with current root JS |
| Final diff/staging check | PASS: `git diff --check`; zero staged paths |

Ticket 50A remained fail-closed after the preview deployment:

- safe `read`, `cleanup`, `revocation`, `recovery`, and `audit` remained
  available;
- `capabilityActivated=false`;
- `create`, `upload`, `publish`, `assign-place`, `launch-delivery`, and
  `mutation` all returned HTTP 503 with `allowed=false`,
  `reason=config_denied`, environment `staging`, and emergency-deny revision
  `ticket50a-emergency-deny-20260723132620384`.

Rollback remains:

- Ticket 50A keeps all six capability actions denied and hides Mode 2
  entry/launch;
- persisted PDF Books stay in the safe read-only Assembly shell and never
  route through the materials editor;
- the preview channel expires automatically on 2026-07-30;
- deleting the preview channel earlier requires a separate destructive remote
  approval and was not performed.

Ticket 02 requires no secure provisioning. No Firebase database/rules/data,
R2, B2, production Hosting, Git staging, commit, merge, or push occurred.

Post-proof credential remediation: `firebase login:list --json` unexpectedly
included the local Firebase CLI OAuth session in tool output. After explicit
user approval, `firebase logout` revoked the exposed session. Human-readable
`firebase login:list` then reported no authorized accounts. No token value was
copied into source or evidence.

### Closure and recalculated readiness

Read-only GitHub recalculation at `2026-07-23T22:57:05.2444915+07:00` found
112 published tickets. Strict local CLOSED overlay is now
`01, 02, 03A, 03B, 03C, 04, 11, 12A, 12B, 22A, 50A`.

Graph-clear unresolved frontier by transitive leverage:

1. `05` / issue 46 — 83 descendants;
2. `12C` / issue 35 — 75 descendants;
3. `08A` / issue 30 — 74 descendants;
4. `26` / issue 37 — 70 descendants;
5. `39A` / issue 42 — 30 descendants;
6. `20A` / issue 69 — 26 descendants;
7. `48A` / issue 43 — 11 descendants;
8. `51A` / issue 127 — 9 descendants.

Ticket 05 is next by published critical-path leverage. No next implementation
ticket was started during Ticket 02 closure. Strict CLOSED count is now
11/112 (9.82%).

## Ticket 05 browser PDF inspection closure — 2026-07-24

**State: `CLOSED`.** Ticket 05 / issue 46 now satisfies its local inspection,
UI, dependency-boundary, production-preview, rollback, and evidence gates.
GitHub issue 46 remains remotely open because no remote issue mutation was
approved.

### Outcome and owner boundary

The authorized teacher's browser now inspects the exact selected `File` before
any upload reservation or authorization. The versioned claim is explicitly
`browser-supplied-untrusted` and contains normalized display filename, exact
bytes, SHA-256, physical page count, PDF/readability result, and complete
state. A private `WeakMap` binds the claim to the exact `File`; replacement,
mutation, cancellation, failure, retry, explicit invalidation, and panel
unmount invalidate it. Unmount also calls `onClaimChange(null)`, preventing
Ticket 06A composition from retaining stale parent state.

The inspection module uses Web Crypto and direct lazy `pdfjs-dist` with a
same-origin Vite-bundled PDF.js Worker URL. It does not render, split,
rasterize, semantically inspect, reserve, authorize, upload, or persist PDF
bytes. Upload continuation remains disabled in the Ticket 05 shell. Public
read-only access receives no inspection control.

Owned Ticket 05 paths:

- `src/services/book-source-delivery/sourcePdfInspection.browser.ts`
- `src/services/book-source-delivery/sourcePdfInspection.browser.test.ts`
- `src/components/books/BookSourceInspectionPanel.tsx`
- `src/components/books/BookSourceInspectionPanel.css`
- `src/components/books/BookSourceInspectionPanel.test.tsx`
- `src/components/books/BookMode2EditorShell.tsx`
- `src/components/books/BookMode2EditorShell.test.tsx`
- Ticket 05 action additions in `src/config/featureRegistry.ts` and its test
- `e2e/prd0062-ticket05-pdf-inspection.spec.ts`
- `playwright.prd0062-ticket05.config.mjs`
- `artifacts/prd0062-ticket-05/browser/*.png`

Compatibility impact is additive and fail-closed. Mode 1 remains unchanged.
Mode 2 upload, publication, placement, launch, delivery, and mutation remain
disabled by their existing rollout gates. Ticket 03B remains disabled by
default. Ticket 50A remains all-six-deny.

### Validation and no-egress proof

| Proof | Result |
| --- | --- |
| Focused Vitest | PASS: 4 files / 44 tests |
| Focused ESLint | PASS: zero issues |
| Focused isolated TypeScript | PASS: zero errors |
| Root TypeScript | Harness-only known `TS2742` in `src/test/test-utils.tsx`; changed files pass isolated typecheck |
| Production Vite build | PASS: 9,332 modules |
| Bundle budget | PASS: root entry 233 KiB; public preloads within budget |
| PDF chunks | `pdf-BMvbwrYZ.js` 401.11 kB; `pdf.worker.min-qwK7q_zL.mjs` 1,046.21 kB; Worker URL shim emitted |
| Reproducible standalone inspection production-bundle test | PASS: emitted inspection entry, PDF.js chunk, and PDF.js Worker chunk only |
| Forbidden built/import dependencies | PASS: zero legacy parser, file extractor, server rendition, Browser Run, capacity/reservation, upload, or Cloudflare Worker client modules |
| Production-preview browser proof | PASS: 1/1 at `http://localhost:5173` in 19.3 seconds |

Unit proof covers valid, corrupt, encrypted, unsupported, empty, zero-page,
wrong MIME, non-PDF bytes, unsafe filename, exact 500 MiB boundary, over
limit, scanned/image-only, rotated, landscape, mixed-size, cancellation,
retry, progress, forged/stale/mismatched claims, explicit invalidation, and
unmount invalidation. Runtime spies prove `fetch`, XHR, and WebSocket receive
no call from the inspection function. A closed recursive local import graph
contains only the inspection module, normalized filename validator, and Book
Source types before the allowed PDF.js dynamic imports.

The final production-preview Playwright run started a fresh strict local Vite
preview and did not reuse an existing port listener. It used teacher
quick-login and the read-only predecessor Ticket 02 PDF Book fixture
`book-mrvkdagi`; no fixture seeding or remote data mutation occurred. The
fixture ID is environment-overridable. Proof covered bounded deterministic
cancellation against the hashed production PDF chunk, fresh retry, corrupt
rejection, normalized two-page acceptance, disabled upload authorization,
and no unexpected product console/page errors.

Network proof inspected every request body for the complete raw, base64, and
hexadecimal form of every selected fixture and observed none. During the
inspection window it observed zero Cloudflare Worker-hosted requests and zero
Book Source, reservation, or upload-client paths at any origin, including
same-origin routes. Source/import-graph proof and the reproducible standalone
production-bundle test independently establish that those clients are absent
from this path.

The production build and browser process received the preserved source
worktree's existing Vite environment values in process only. No `.env` or
credential was copied into this worktree. Secure provisioning: none.
No Firebase data/rules, B2, R2, Cloudflare, Hosting, deployment, credential,
Git staging, commit, merge, or push mutation occurred.

### Rollback and recalculated readiness

Rollback: hide or disable Mode 2 source selection. Any partial or complete
local inspection claim is invalidated on selection change or unmount. Because
Ticket 05 creates no reservation, provider authorization, uploaded object, or
usable Source Version, rollback requires no remote cleanup and cannot expose a
partially uploaded source.

Fresh live GitHub read after closure found 112 published tickets, all 112
remotely OPEN, 308 unique blocker edges, zero missing blocker references, and
zero cycle discrepancy. Strict local CLOSED overlay is now
`01, 02, 03A, 03B, 03C, 04, 05, 11, 12A, 12B, 22A, 50A`: 12/112 (10.71%).

Graph-clear unresolved frontier:

- `06A` / issue 47 — blockers CLOSED 03B, 04, 05, and 50A;
- `08A` / issue 30 — blockers CLOSED 01, 03A, and 04;
- `12C` / issue 35 — blocker CLOSED 12B;
- `20A` / issue 69 — blockers CLOSED 01 and 02;
- `26` / issue 37 — blocker CLOSED 12B;
- `39A` / issue 42 — blocker CLOSED 12B;
- `48A` / issue 43 — blocker CLOSED 03C;
- `51A` / issue 127 — blocker CLOSED 50A.

No next ticket was started during Ticket 05 closure.

## Ticket 03A provider-neutral contract revalidation — 2026-07-24

**State: `CLOSED`.** Fresh audit
found that the published issue requires an exact immutable provider-version
delete primitive, while the earlier reconciliation note incorrectly said that
delete authority was absent. The current implementation now follows the live
issue without pulling provider-specific B2 or lifecycle orchestration forward.

### Current contract

- `BookSourceVersionStorageIdentity` remains immutable and includes Book,
  Source Version, storage location, provider kind, private bucket, Worker/
  provider object key, provider file/version IDs, SHA-256, and byte size.
- `SourceProviderPort.deleteExactVersion()` accepts only that complete identity.
  The deterministic fake validates every field, deletes only the exact object,
  preserves siblings, and fails closed on missing, drift, abort, or invalid
  timeout. Publication ordering, delivery revocation, retry, cleanup policy,
  and provider-specific credentials remain ticket 07/47 ownership.
- Thin provider-neutral contracts now exist at `sourceUpload.service.ts`,
  `sourceLifecycle.service.ts`, and `sourceGatewayProtocol.ts`; they delegate
  only to the narrow port and perform no persistence, browser transport,
  network, or provider-specific work.
- `sourceProvider.conformance.ts` provides one adapter-shaped wrapper so the
  same contract suite runs against both the direct deterministic fake and the
  wrapper. No B2 adapter or deployment was added; that remains 03B ownership.

### Verification gates

| Proof | Result |
| --- | --- |
| Provider port, fake, source version, owned thin contracts, conformance, and dependency-boundary suites | PASS: 5 files / 15 tests in the final focused run; direct fake and adapter-shaped wrapper execute identical 3-case conformance coverage |
| Browser/provider leak boundary | PASS: browser surfaces contain no provider bucket/key/file identity, provider URL, application-key identity, trusted provider error, or provider-port import |
| Focused ESLint | PASS: zero issues |
| Scoped strict TypeScript | PASS: no errors |
| Production Vite build and bundle budget | PASS: 9,332 modules; root entry 233 KiB; budget OK |
| Deployment / secure provisioning | Not required by 03A; no credentials, provider call, deployment, or remote object mutation |

Rollback is to stop using the provider-neutral port/fake and remove the
Ticket 03A contract overlay before 03B wiring; no Source Version or provider
object is changed. The prior stale statements that delete was absent are
superseded by this section.

## Ticket 03A remote closure and graph recalculation — 2026-07-24

**State: `CLOSED`.** Live issue [#26](https://github.com/iamhuwng/autoresync/issues/26)
received the closure proof comment
([comment](https://github.com/iamhuwng/autoresync/issues/26#issuecomment-5064818471))
and was closed after the gates above passed. Ticket 05 remains closed at
issue #46.

Fresh live graph query after the #26 mutation found:

- 112 published PRD0062 tickets: 110 `OPEN`, 2 `CLOSED` (#26 / 03A and
  #46 / 05);
- 308 raw and unique Blocked-by edges;
- 0 missing blocker references, 0 duplicate edges, and 0 cycles (112/112
  Kahn traversal).

Remote-clear unresolved frontier is #25 / 01, #27 / 03B, #28 / 03C, and
#44 / 50A. No next ticket was closed in this graph pass. Historical local
overlay entries elsewhere in this evidence file are retained as dated audit
history; they do not override the current live GitHub state or the fresh
acceptance audits.

## Ticket 03B provider adapter revalidation - 2026-07-24

**State: `CLOSED`.** The fresh
recheck followed #26 closure and kept the B2 seam disabled by default.

- The adapter now implements an explicit 03B subset of the provider-neutral
  operations: object-scoped upload authorization, completion metadata,
  bounded reads, and one-page account totals. Exact deletion is intentionally
  not implemented here; tickets 07/47 own cleanup/replacement deletion and
  its separate authority.
- Configuration validates one saved storage location and private bucket,
  rejects master-shaped, missing, shared, broad, wrong-bucket, prefix, and
  endpoint-drift authorities, and keeps upload, metadata, and read keys
  distinct. No credential value is present in source, tests, logs, or output.
- The Worker has no browser transfer, document route, PDF buffer, parser,
  renderer, splitter, or page processor. Disabled state returns a sanitized
  no-store response and never contacts B2.

### Verification gates

| Proof | Result |
| --- | --- |
| B2 adapter, wiring, and R2-quarantine node-only tests | PASS: 3 files / 17 tests |
| Scoped strict TypeScript for B2 provider, wiring, Worker, and 03A types/port | PASS: no errors |
| Focused ESLint | PASS: no issues |
| x64 Wrangler account preflight | PASS: profile `media`; sentinel buckets `kahoot-media` and `luyentap-book-source-private` listed |
| Isolated x64 Wrangler dry-run | PASS: `wrangler.book-source-b2.jsonc`; 26.62 KiB upload / 6.78 KiB gzip; only `BOOK_SOURCE_B2_PROVIDER_STATE=disabled`; no remote mutation |
| Cloudflare Worker-pool suite | BLOCKED before collection by repository ARM64 `workerd`; harness limitation, not product proof |

Rollback is to leave `BOOK_SOURCE_B2_PROVIDER_STATE=disabled` and remove the
03B adapter/config overlay before 50A enablement. No B2 credential, upload,
object, deletion, deployment, or remote data mutation occurred.

## Ticket 03B remote closure and graph recalculation - 2026-07-24

**State: `CLOSED`.** Live issue [#27](https://github.com/iamhuwng/autoresync/issues/27)
received the closure proof comment
([comment](https://github.com/iamhuwng/autoresync/issues/27#issuecomment-5064893973))
and was closed after the revalidation gates passed.

Fresh live graph query after the #27 mutation found:

- 112 published PRD0062 tickets: 109 `OPEN`, 3 `CLOSED` (#26 / 03A,
  #27 / 03B, and #46 / 05);
- 308 raw and unique Blocked-by edges;
- 0 missing blocker references, 0 duplicate edges, and 0 cycles (112/112
  Kahn traversal).

Remote-clear unresolved frontier is #25 / 01, #28 / 03C, and #44 / 50A.
No other ticket was closed in this graph pass. Historical local overlay
entries elsewhere in this evidence file remain dated audit history; they do
not override current live GitHub state or fresh acceptance audits.

## Ticket 48A deployed readback revalidation - 2026-07-24

**State: `BLOCKED_BY_USER_ACTION` for closure proof; local implementation
gates pass.** Fresh local proof is 3 files / 9 tests: retired Book-PDF
helpers, routes, bindings, prefixes, and byte-copy capability are absent;
retired endpoints return `404` with zero object calls in the local Worker
harness; ordinary media inventory remains `audio/`, `images/`, and `avatars/`;
and audio/media governance plus scheduled backup regressions pass.

Fresh x64 Wrangler proof also passes:

- backup Worker dry-run: 277.89 KiB upload / 58.58 KiB gzip, only
  `PRIMARY_R2=kahoot-media` plus ordinary metadata/backup vars, and no
  `BOOK_SOURCE_BACKUP_R2` binding;
- active `r2-backup-worker` deployment readback (100% version
  `4c32276b-5ef9-41bc-9b26-f7265687b1bf`) lists `PRIMARY_R2=kahoot-media` and
  no `BOOK_SOURCE_BACKUP_R2` binding.

Required deployed route/media proof is not yet reproducible: anonymous POST
probes to both retired endpoints and the ordinary media/health endpoints
return the deployed Worker auth response `403 Missing Authorization header`.
No admin credential or remote deployment mutation is authorized here, so the
route-unavailable/media-functioning assertion and versioned Ticket-47
consumable closure artifact remain user-owned actions. Do not close #43 or
restore Book-PDF backup fallback until those read-only authenticated probes
pass.

## Ticket 03C quarantine revalidation - 2026-07-24

**State: `CLOSED`.** Fresh proof
confirms the quarantine boundary without restoring any retired path named in
the older issue wording.

- Retired Mode 2 R2 ingress, page-count, renderer/rendition, split,
  processor/Durable Object, and production gateway/worker modules remain
  absent.
- The active Book Source and delivery source graph has no legacy route/import,
  R2 Book-PDF binding, paid/Browser Run/server page-count/render/split
  fallback, or derived-page production path.
- `wrangler.book-source-b2.jsonc` is isolated B2-only, disabled by default,
  and has no R2 bucket, Durable Object, migration, or route binding.
- Existing audio/media configs still use `R2_BUCKET=kahoot-media`; Book-PDF
  backup/restore paths remain outside this ticket and stay 48A ownership.

### Verification gates

| Proof | Result |
| --- | --- |
| Quarantine and unrelated media/backup regression tests | PASS: 2 files / 8 tests |
| Focused ESLint | PASS: no issues |
| Isolated x64 Wrangler dry-run | PASS: disabled-only B2 config; no active processor/rendition route or binding; no remote mutation |
| Cloudflare Worker-pool suite | BLOCKED before collection by repository ARM64 `workerd`; harness limitation, not product proof |

No browser or live B2 object proof is required by 03C; those gates belong to
06B/06C/10. Rollback is to retain quarantine and never re-enable R2 PDF
processing as a production fallback.

## Ticket 03C remote closure and graph recalculation - 2026-07-24

**State: `CLOSED`.** Live issue [#28](https://github.com/iamhuwng/autoresync/issues/28)
received the closure proof comment
([comment](https://github.com/iamhuwng/autoresync/issues/28#issuecomment-5064910733))
and was closed after the revalidation gates passed.

Fresh live graph query after the #28 mutation found:

- 112 published PRD0062 tickets: 108 `OPEN`, 4 `CLOSED` (#26 / 03A,
  #27 / 03B, #28 / 03C, and #46 / 05);
- 308 raw and unique Blocked-by edges;
- 0 missing blocker references, 0 duplicate edges, and 0 cycles (112/112
  Kahn traversal).

Remote-clear unresolved frontier is #25 / 01, #43 / 48A, and #44 / 50A.
No other ticket was closed in this graph pass. Historical local overlay
entries elsewhere in this evidence file remain dated audit history; they do
not override current live GitHub state or fresh acceptance audits.

## Ticket 01 current acceptance audit - 2026-07-24

**State: `LOCAL_READY_REMOTE_PROOF_MISSING`; issue #25 remains `OPEN`.** Fresh
mode behavior and fragment proof passes: 5 focused files / 53 tests, including
creation choice-before-metadata, both canonical modes, malformed input,
legacy missing-mode fallback without eager rewrite, immutable service updates,
shared announcement behavior, and the `fragments/01.json` contract.

The reconciled worktree intentionally does not edit generated
`database.rules.json`; live issue #25 assigns generated composition and
emulator/deployment enforcement to 09E. The current generated root therefore
contains no `bookMode` rule, and no fresh deployed negative proof exists for
this reconciled overlay. This is a direct mismatch with #25 deployment
acceptance, so #25 is not closed or represented as a remote blocker-resolved
ticket. No Firebase rules or data mutation was performed.

## Ticket 05 remote closure and graph recalculation - 2026-07-24

**State: `CLOSED`.** Fresh live GitHub read confirms issue [#46](https://github.com/iamhuwng/autoresync/issues/46) is `CLOSED` with the recorded closure proof comment ([comment](https://github.com/iamhuwng/autoresync/issues/46#issuecomment-5064624737)). The earlier local Ticket 05 section's statement that remote mutation remained unapproved is retained as dated history and is superseded by this live state.

The current local Ticket 05 proof remains unchanged and was revalidated in the
reconciled worktree: 4 focused files / 44 tests PASS, including the standalone
production inspection bundle/import-graph check; no staged paths; and
`git diff --check` PASS. No reservation, upload authorization, source object,
credential, deployment, or data mutation was performed.

Fresh live graph after the already-recorded #46 closure and the subsequent
#26/#27/#28 closures found:

- 112 published PRD0062 tickets: 108 `OPEN`, 4 `CLOSED` (#26 / 03A, #27 / 03B,
  #28 / 03C, and #46 / 05);
- 308 raw and unique `Blocked by` edges;
- 0 missing blocker references, 0 duplicate edges, and 0 cycles (112/112
  Kahn traversal).

Remote-clear unresolved frontier is #25 / 01, #43 / 48A, and #44 / 50A.

## Ticket 01 current acceptance revalidation - 2026-07-24

**State: `LOCAL_READY_REMOTE_PROOF_MISSING`; issue #25 remains `OPEN`.** A
fresh focused rerun passed 5 files / 53 tests covering mode choice, service
immutability, legacy fallback, and the 01 fragment. The fragment remains an
untracked merge contract with `requiresExistingRule=true`; it is not active
enforcement. The current generated `database.rules.json` still has no
`bookMode` rule. Closure still requires 09E-owned composition, fresh composed
rules/emulator negative coverage, rules compile/dry-run, and matching deployed
negative readback. No Firebase rules or data mutation was performed.

## Ticket 50A current acceptance audit - 2026-07-24

**State: `LOCAL_SCAFFOLD_PASS_TRUSTED_SEAMS_MISSING`; issue #44 remains `OPEN`.**
Fresh root policy/config proof passed 2 files / 11 tests, and fresh node-only
Worker gate/canary/deployment-config/readback proof passed 4 files / 19 tests.
The deployment-owned policy is strict, reads fresh config, preserves safe
read/cleanup/revocation/recovery/audit operations, emits privacy-safe audit
metadata, and keeps all six action gates deny-by-default.

The current Worker is explicitly a proof-only canary: even an allowed action
returns `capabilityActivated:false` and performs no Book operation. The browser
spec covers only the disabled Create Book presentation. No trusted create,
upload, publish, assign/place, launch/document-delivery, or mutation seam is
wired to this gate, so the live #44 acceptance contract is not met. Do not
close #44 or enable any action. All-six-deny state remains preserved.

## Local CLOSED overlay versus live issue action - 2026-07-24

The historical local overlay contains more tickets labelled `CLOSED` than the
live GitHub state. This table reconciles those labels against the published
blocker graph and current acceptance evidence. A local label is not a remote
closure and does not override a live blocker or an unmet deployment gate.

| Ticket / issue | Historical local label | Live blocker/state | Current action |
| --- | --- | --- | --- |
| 01 / #25 | local implementation pass | no blocker; `OPEN` | Keep open: fragment-only proof is not active generated rules; 09E composition, emulator negatives, rules dry-run, and deployed negative readback are missing. |
| 02 / #45 | local `CLOSED` after preview proof | #25 and #44; `OPEN` | Do not close while published blockers remain. |
| 04 / #29 | local `CLOSED` after capacity proof | #25 remains; `OPEN` | Do not close until its published blocker graph is clear. |
| 11 / #32 | local `CLOSED` | #25 remains; `OPEN` | Do not close until #25 is remotely resolved. |
| 12A / #33 | local `CLOSED` | #25 remains; `OPEN` | Do not close until #25 is remotely resolved. |

## Ticket 01 root-first browser revalidation - 2026-07-24

**State: `LOCAL_READY_REMOTE_PROOF_MISSING`; issue #25 remains `OPEN`.** The
teacher flow was revalidated at `http://localhost:5173/lobby` with the
authenticated teacher session. `Create New Book` showed the mode chooser before
metadata; `Materials` revealed the metadata form; the shared creation path
created one disposable Materials Book; refresh and reopen returned to the
Materials editor with the expected Overview/Content/Settings tabs. Browser
console errors: 0. Redacted artifact:
`artifacts/prd0062-ticket-01/browser-flow.json`.

PDF creation was not attempted because the 50A all-six-deny policy kept the PDF
source option disabled and announced its unavailable state. The live generated
`database.rules.json` still has no `bookMode` enforcement; the ticket-owned
`fragments/01.json` remains only a merge contract. Composed rules, emulator
negative matrix, rules dry-run, and deployed negative readback remain
unexecuted under 09E ownership. #25 is therefore not closed, and no claim is
made that the browser proof establishes active Firebase enforcement.
| 12B / #34 | local `CLOSED` | #33 remains; `OPEN` | Do not close until 12A is remotely resolved. |
| 22A / #36 | local `CLOSED` | #34 remains; `OPEN` | Do not close until 12B is remotely resolved. |
| 50A / #44 | historical local `CLOSED` | no blocker; `CLOSED` | Fresh trusted seam, deployment, deny-only, and teacher-browser proof passed; remote closure and graph recalculation recorded below. |

Remote GitHub action already completed for the locally evidenced Ticket 05,
03A, 03B, and 03C work: issues #46, #26, #27, and #28 are `CLOSED`. Ticket
48A / #43 has local retirement proof but is not in the strict local CLOSED
overlay because authenticated deployed route/media readback and its
Ticket-47-consumable artifact remain user-owned blocked.

## Ticket 50A trusted seam enforcement revalidation - 2026-07-24

**State: `READY_FOR_REMOTE_CLOSURE`; issue #44 remained `OPEN` at this audit.**
The earlier scaffold-only audit above is superseded by this fresh implementation
and proof pass. The all-six-deny rollout state remains active; no pilot or Book
capability was enabled.

### Trusted enforcement

- `cloudflare/src/book-rollout-seams.ts` declares trusted source, assembly,
  delivery, runtime, homework, and recovery boundaries. Seven boundary entries
  map to exactly six independent action gates; homework and recovery share only
  `mutation`.
- `cloudflare/src/book-rollout-action-gateway.ts` authorizes at the trusted
  boundary before a handler can run. Missing handlers fail with HTTP 503, so an
  allowed gate cannot become a pilot by omission.
- `cloudflare/src/book-rollout-canary-worker.ts` routes each six action probes
  through the action gateway. Its allowed path remains proof-only and returns
  `capabilityActivated:false`.
- `cloudflare/src/upload-worker/book-activity-authoring/worker.ts` checks the
  deployment-owned `mutation` gate before parsing and again immediately before
  every CAS write. `loadCandidate` remains an authenticated safe read.
- Browser flags, Firebase content, query parameters, request headers, and
  local/session storage are not accepted by the Worker gate. Audit payloads
  contain policy metadata only.

### Verification

| Gate | Result |
| --- | --- |
| Root rollout, authoring, and security tests | PASS: 5 files / 21 tests |
| Cloudflare node-only rollout, gateway, authoring, and deployment tests | PASS: 7 files / 40 tests |
| Targeted TypeScript check for rollout/gateway/canary/authoring files | PASS |
| Targeted ESLint | PASS |
| Wrangler deployment-config validator | PASS |
| x64 Wrangler canary dry-run | PASS: 14.88 KiB upload / 3.66 KiB gzip; no secret value in config output |
| Teacher browser at `http://localhost:5173` | PASS: dev quick-login, Book tab, Create Book, Materials enabled, PDF source disabled with unavailable notice; no Save Book action |

The dedicated checkout had no `.env`; the browser run used the existing local
build artifact only to hydrate process-local Firebase web configuration and
presentation-only Book flags. No configuration value was written to the
worktree, tickets, or output.

### Deployed proof and rollback

- Correct Cloudflare profile preflight: `media`; R2 sentinel buckets included
  `kahoot-media` and `luyentap-book-source-private`.
- Refreshed proof-only canary deployment:
  `r2-upload-signer-s0-canary`, URL
  `https://r2-upload-signer-s0-canary.iamhuwng.workers.dev`, version
  `b17a6635-ce4e-46b5-9036-4f5fbe698e14`.
- Deployment readback returned only binding names/types: rollout secret,
  staging environment, and version metadata. No raw secret/config value was
  read back.
- Fresh remote `GET /__ticket50a/status` returned HTTP 200 with safe `read`
  allowed and `capabilityActivated:false`.
- Fresh remote POST probes for `create`, `upload`, `publish`, `assign-place`,
  `launch-delivery`, and `mutation` each returned HTTP 503 with
  `reason:config_denied`; a forged rollout header returned the same denial.
- Rollback proof is the current emergency revision with all six action values
  denied. Safe `read`, `cleanup`, `revocation`, `recovery`, and `audit` remain
  explicit static-safe policy operations. No remote secret rotation, R2 object,
  Firebase rule/data, or paid processing mutation was performed.

The normal Cloudflare Worker-pool command remains blocked before collection by
the repository's ARM64 `workerd` binary; this is a local harness limitation.
The full root typecheck remains blocked by the unrelated pre-existing
`src/test/test-utils.tsx:51` TS2742 declaration portability error. Neither
failure reproduces in the focused harnesses above.

## Ticket 50A remote closure and graph recalculation - 2026-07-24

**State: `CLOSED`.** Live issue [#44](https://github.com/iamhuwng/autoresync/issues/44)
received the closure proof comment
([comment](https://github.com/iamhuwng/autoresync/issues/44#issuecomment-5065640697))
and was formally closed after the fresh acceptance audit.

Immediate full live graph recalculation found:

- 112 published PRD0062 tickets: 107 `OPEN`, 5 `CLOSED` (#26 / 03A,
  #27 / 03B, #28 / 03C, #44 / 50A, and #46 / 05);
- 308 raw and unique `Blocked by` edges;
- 0 missing blocker references, 0 duplicate edges, and 0 cycles (112/112
  Kahn traversal);
- current remote-clear frontier: #25 / 01, #43 / 48A, and #127 / 51A.

No other issue was mutated in this closure pass. The next primary must be one
of the current frontier tickets after a fresh live-state audit.

## Ticket 51A acceptance matrix revalidation - 2026-07-24

**State: `READY_FOR_REMOTE_CLOSURE`; issue #127 was `OPEN` before closure.**
Fresh live audit confirmed #44 / 50A is closed, so #127's stale blocker text
did not remain a live graph blocker. The 51A implementation is definition-only:
it freezes evidence and does not claim that downstream product journeys passed.

### Matrix and validator

- `documentation/tasks/PRD0062/supporting/51a-acceptance.matrix.json` defines
  24 bounded cases, 8 deterministic fixtures, 11 metric records, six PRD
  acceptance trace sections, downstream owners 51B1/51B2/51C1/51C2/51D1/51D2/51E,
  exact role ports, retry/infrastructure classification, artifact paths,
  pass thresholds, canary dry-run scope, and rollback policy.
- The matrix traces all 166 checkbox requirements parsed from the canonical
  PRD Acceptance criteria sections: Assembly 53, Runtime 40, Homework 25,
  Cross-feature delivery 16, Updates 18, and Quality and safety 14.
- Canonical source fixtures preserve the exact names *IELTS Grammar for Bands
  6.5 and Above*, *IELTS Vocabulary up to Band 6.0*, and *IELTS Vocabulary
  for Bands 6.5 and Above*. Each names source-qualified local pages, the
  Listening note-completion, Reading matching, and Reading Yes/No/Not Given
  inspection notes, required correction/import/runtime/effort metrics,
  failure/retry classification, and an approved exception reference.
- Fixture definitions cover both `full_pdf` and `component_pdfs`, structured,
  source-assisted, and reference-only presentation, supported Activity
  families, rotated/mixed-size/scanned/image-only/corrupt/encrypted inputs,
  deterministic seeds/checksums, bounded sizes, and scoped cleanup. No PDF
  bytes, protected content, secret values, or copied historical evidence
  counts are stored.
- `scripts/lib/prd0062-51a/validator.mjs` rejects missing PRD trace, unknown
  ticket/case/fixture, duplicate IDs, absent commands/artifacts/thresholds,
  wrong role ports, unbounded fixtures, unsupported browser claims, missing
  canonical-source evidence, manual-only assertions, execution claims, and
  paid fallback paths.
- `scripts/lib/prd0062-51a/determinism.mjs` provides SHA-256 fixture IDs,
  state checksums, canonical key ordering, and cleanup paths constrained to
  `prd0062-51a/`. It has no `Date.now()` or `Math.random()`.

### Verification gates

| Proof | Result |
| --- | --- |
| 51A CLI matrix validation | PASS: definition-only; 24 cases / 8 fixtures / 166 PRD requirements / 6 trace sections |
| 51A validator and determinism tests | PASS: 12 tests |
| Existing PRD0062 activity coverage CLI | PASS: 32 independent fixtures / 32 rows |
| Existing activity coverage regression tests | PASS: 15 tests |
| Focused ESLint | PASS: schema, validator, determinism, CLI, and tests |
| Playwright config parse/list | PASS: 2 role-setup tests, teacher and student projects |
| Browser role setup | PASS: 2/2 in 30.7 seconds; teacher quick-login reached `http://localhost:5173/lobby`, student quick-login reached `http://localhost:5174/student`; no Book journey pass claimed |
| x64 Cloudflare profile preflight | PASS: profile `media`; sentinel buckets `kahoot-media` and `luyentap-book-source-private` listed |
| x64 Wrangler canary dry-run | PASS: 14.88 KiB upload / 3.66 KiB gzip; staging and version metadata bindings only in dry-run output; no remote data mutation or secret value output |
| Whitespace/security guard | PASS: `git diff --check`; no package/lockfile change, credential, or protected content added |

The browser setup used process-local Firebase web configuration from an
existing local build artifact because this dedicated checkout has no `.env`.
Values were not printed, persisted, or placed in the matrix/evidence. The
initial setup assertion expected `/lobby` for both roles; live readback showed
the correct student `/student` route, the assertion was corrected, and the
final 2/2 proof passed.

The canary proof uses the isolated x64 Node runtime with the Wrangler JS entry
point and the named `media` profile. It is dry-run-only. 51A does not deploy,
rotate secrets, mutate R2/Firebase data, activate Book Mode 2, run Browser Run,
run paid PDF processing, or authorize a silent paid fallback. Ticket 50A's
all-six deny state and 03B disabled state remain unchanged.

Rollback is limited to reverting the matrix/fixture definitions and removing
definition-only evidence artifacts. Rollback must keep Mode 2 disabled and all
six 50A trusted actions denied; it must never weaken acceptance criteria or
restore deleted PDF bytes.

## Ticket 51A remote closure and graph recalculation - 2026-07-24

**State: `CLOSED`.** Live issue [#127](https://github.com/iamhuwng/autoresync/issues/127)
received the closure proof comment
([comment](https://github.com/iamhuwng/autoresync/issues/127#issuecomment-5065798063))
and was formally closed only after the fresh matrix, validator, browser role
setup, dry-run, security, and rollback gates above passed.

Immediate full live graph recalculation after the #127 mutation found:

- 112 published PRD0062 tickets: 106 `OPEN`, 6 `CLOSED` (#26 / 03A,
  #27 / 03B, #28 / 03C, #44 / 50A, #46 / 05, and #127 / 51A);
- 308 raw and unique `Blocked by` edges;
- 0 missing blocker references, 0 duplicate edges, and 0 cycles (112/112
  Kahn traversal);
- current remote-clear frontier: #25 / 01, #43 / 48A, and #128 / 51B1,
  #129 / 51B2, #130 / 51C1, #131 / 51C2, #132 / 51D1, and #133 / 51D2.

No other issue was mutated in this closure pass. The matrix remains
definition-only; downstream 51B1/51B2/51C1/51C2/51D1/51D2/51E execution and
the later 52A/52B release gates remain open work.

## Ticket 51B1 current acceptance audit - 2026-07-24

**State: `BLOCKED_BY_POLICY`; issue #128 remains `OPEN`.** Fresh live issue
read confirms #127 / 51A is closed and no remote mutation has been made for
#128. The published #128 body is stale about #127 as a blocker, but the
current governing 50A policy still denies all six trusted create, upload,
publish, assign-place, launch-delivery, and mutation actions. No full
authoring/assignment success claim is honest until an approved activation
ticket changes that state and the healthy Worker harness is available.

### Scoped evidence package

- `e2e/prd0062-teacher-authoring-assignment-fixtures.mjs` derives 51B1 cases
  and fixture IDs from the frozen 51A matrix, produces deterministic snapshots
  and scoped cleanup targets, and preserves the three exact canonical source
  names without duplicating matrix evidence counts.
- `e2e/prd0062-teacher-authoring-assignment.spec.ts` records the safe teacher
  preflight only. It does not skip or relabel the missing full journeys as
  passed.
- `playwright.prd0062-teacher-authoring-assignment.config.mjs` owns the
  teacher role at `http://localhost:5173` and uses the built-in Teacher
  quick-login path.

### Safe verification

| Proof | Result |
| --- | --- |
| 51B1 fixture determinism/cleanup tests | PASS: 2/2 |
| Mode2/rollout/source-inspection focused tests | PASS: 4 files / 18 tests |
| Existing Book editor/legacy assignment tests | PASS: 6 files / 49 tests |
| 51B1 Playwright config/list | PASS: 2 tests |
| Teacher browser preflight | PASS: 2/2 in 25.6 seconds; quick-login reaches `http://localhost:5173/lobby`, Materials is enabled, PDF source is disabled, unavailable notice is visible, and no Save Book action exists |
| Focused ESLint and `git diff --check` | PASS |
| Cloudflare Worker-pool gate suite | `HARNESS_BLOCKED` before collection: `Unsupported platform: win32 arm64 LE`; no product result inferred |

The full #128 acceptance remains unexecuted: both source strategies,
direct upload, hierarchy/mapping/Unit import, candidate preview/publication,
repair/revision/successor, whole-Book/subtree assignment, schedule and
integrity configuration, canary repetition, and their network/metric artifacts
require trusted capabilities that 50A intentionally keeps denied. Existing
50A browser proof and the new preflight prove the denial is visible and safe;
they do not prove authoring or assignment success.

Rollback remains deny-only: preserve the scoped fixtures/artifacts, keep
Mode 2 disabled, keep all six 50A actions denied, and do not mutate product
code or acceptance criteria. #128 must be re-audited after approved activation
and a healthy isolated Worker harness; it is not closed in this pass.

## Ticket 51B2 current acceptance audit - 2026-07-24

**State: `BLOCKED_BY_POLICY`; issue [#129](https://github.com/iamhuwng/autoresync/issues/129) remains `OPEN`.**
Fresh live issue review confirms #127 / 51A is closed. The issue's stale
`Blocked by #127` text is no longer a live graph blocker, but the governing
50A policy still denies all six trusted Book actions. No remote comment,
closure, activation, paid PDF processing, Browser Run, or production mutation
was performed for #129.

### Scoped evidence package

- `e2e/prd0062-teacher-updates-replacement-results-fixtures.mjs` derives the
  three 51B2 matrix cases, deterministic snapshots, scoped cleanup targets,
  update/replacement/result flow signals, all three exact canonical source
  names, explicit Listening note-completion / Reading matching / Reading
  Yes-No-Not Given notes, the 11 metric IDs, retry/idempotency obligations,
  teacher localhost role, and deny-only rollout state.
- `e2e/prd0062-teacher-updates-replacement-results.spec.ts` records the safe
  teacher preflight only. It does not relabel missing update, replacement,
  delete, checkpoint, notification, grading/release, or historical-PDF
  journeys as passed.
- `playwright.prd0062-teacher-updates-replacement-results.config.mjs` owns
  the teacher role at `http://localhost:5173`; its committed default does not
  reuse an existing server. The final direct run used that process-owned
  server; Firebase web configuration was loaded only into the helper process.
- `artifacts/prd0062-ticket-51b2/browser/50a-deny-preflight.png` retains the
  dialog-only safe browser screenshot. No secret values, PDF bytes, or
  protected content are stored.

### Safe verification

| Proof | Result |
| --- | --- |
| 51B2 fixture determinism/cleanup tests | PASS: 2/2 |
| 51B2 Playwright config parse/list | PASS: 2 tests |
| Teacher browser deny preflight, direct process-owned run | PASS: 2/2 in 55.8 seconds; quick-login reaches `http://localhost:5173/lobby`, Materials is enabled, PDF source is disabled, unavailable notice is visible, no Save Book action exists, and no console/page errors were observed |
| Adjacent update/replacement/result contracts | PASS: 8 files / 119 tests; contract evidence only, not 51B2 journey proof |
| 51A matrix validation | PASS: definition-only; 24 cases / 8 fixtures / 166 PRD requirements / 6 trace sections |
| Existing activity coverage | PASS: 32 fixtures / 32 rows |
| Focused ESLint and whitespace guard | PASS; `git diff --check` clean |
| Cloudflare Worker-pool gate suite | `HARNESS_BLOCKED` before collection: `Unsupported platform: win32 arm64 LE`; no product result inferred |

The full #129 acceptance remains unexecuted. It requires approved trusted
activation, a healthy isolated Worker harness, real teacher-browser execution
of all update/replacement/result journeys, deterministic machine-readable
metrics and artifacts, retry/concurrency no-duplicate proof, accessibility and
network assertions, shared announcement outcomes, and production-equivalent
canary evidence. Existing adjacent tests verify generic contracts only; they
do not prove Book Mode 2 update/replacement/result behavior.

Rollback remains deny-only: preserve the scoped fixture and screenshot,
keep Mode 2 disabled, keep all six 50A actions denied, and do not mutate
product code or acceptance criteria. #129 must remain open until the policy
activation, healthy Worker harness, and every published acceptance gate are
actually available and pass.

## Ticket 51C1 current acceptance audit - 2026-07-24

**State: `BLOCKED_BY_POLICY`; issue [#130](https://github.com/iamhuwng/autoresync/issues/130) remains `OPEN`.**
Fresh live issue review confirms #127 / 51A is closed. The issue's stale
`Blocked by #127` text is no longer a live graph blocker, but 50A still denies
create, upload, publish, assign-place, launch-delivery, and mutation. 03B
also remains disabled. No trusted Book route was enabled, no PDF was
processed, and no remote closure or data mutation was made for #130.

### Scoped evidence package

- `e2e/prd0062-student-runtime-persistence-fixtures.mjs` derives all five
  51C1 matrix cases, deterministic snapshots, scoped cleanup targets, desktop
  and mobile runtime contracts, persistence/retry/idempotency obligations,
  all three exact canonical source names, and the exact nine source-associated
  interaction notes.
- `e2e/prd0062-student-runtime-persistence.spec.ts` records the safe Student
  quick-login preflight only. It does not label missing Book runtime,
  autosave, submission, results, notification, or replacement-invalidation
  journeys as passed.
- `playwright.prd0062-student-runtime-persistence.config.mjs` owns the
  student role at `http://localhost:5174`; committed default does not reuse an
  existing server. The final direct run used that process-owned server;
  Firebase web configuration was loaded only into the helper process.
- `artifacts/prd0062-ticket-51c1/browser/50a-deny-preflight.png` retains a
  heading-only screenshot, with no private dashboard data, secrets, PDF
  bytes, or protected content.

### Safe verification

| Proof | Result |
| --- | --- |
| 51C1 fixture determinism/cleanup tests | PASS: 2/2 |
| 51C1 Playwright config parse/list | PASS: 2 tests |
| Student browser deny preflight, direct process-owned run | PASS: 2/2 in 55.6 seconds; quick-login reaches `http://localhost:5174/student`, Dashboard is visible, no Book Mode 2/PDF source text is exposed, and no console/page errors were observed |
| Focused Book runtime/student suites with process-local Firebase config | PASS: 12 files / 78 tests |
| Initial envless focused suite | `HARNESS_BLOCKED` before two suites imported: missing `VITE_FIREBASE_*` web config; the other 10 files completed 66 tests |
| Rollout presentation/policy tests | PASS: 2 files / 11 tests |
| 51A matrix validation | PASS: definition-only; 24 cases / 8 fixtures / 166 PRD requirements / 6 trace sections |
| Cloudflare Worker-pool gate suite | `HARNESS_BLOCKED` before collection: `Unsupported platform: win32 arm64 LE`; no product result inferred |
| Focused ESLint and whitespace guard | PASS; `git diff --check` clean |

Browser-state disagreement is recorded: a separate read-only investigator run
reported a blank local page and quick-login timeout, while the controlled
process-owned run above passed after loading the process-local Firebase web
configuration. Neither run proves the unimplemented Book journeys; the
disagreement is classified as local browser/app harness state, not normalized
into a product claim.

The full #130 acceptance remains unexecuted. The repository has no executable
Book student route/runtime integration, concrete Activity renderers, trusted
autosave/submit/result path, or production-equivalent student canary. Full
proof requires approved activation, healthy Worker tooling, real desktop and
mobile journeys, machine-readable performance/network artifacts, retry and
idempotency evidence, and replacement-invalidation proof.

Rollback remains deny-only: preserve the scoped fixtures and sanitized
screenshot, keep Mode 2 disabled, keep all six 50A actions denied, keep 03B
disabled, and do not mutate product code or acceptance criteria. #130 stays
open until every published gate is actually available and passes.

## Ticket 51C2 current acceptance audit - 2026-07-24

**State: `BLOCKED_BY_POLICY`; issue [#131](https://github.com/iamhuwng/autoresync/issues/131) remains `OPEN`.**
Fresh live issue review confirms #127 / 51A is closed. The issue's stale
`Blocked by #127` text is no longer a live graph blocker, but 50A still denies
create, upload, publish, assign-place, launch-delivery, and mutation. 03B
remains disabled. No trusted Book runtime was enabled, no PDF was processed,
and no remote closure or data mutation was made for #131.

### Scoped evidence package

- `e2e/prd0062-student-accessibility-device-fixtures.mjs` derives the two
  51C2 matrix cases, deterministic snapshots, scoped cleanup targets, exact
  desktop and mobile Chromium projects, all three exact canonical source names,
  the exact nine source-associated interaction notes, 11 metric IDs, and the
  deny-only rollout state.
- `e2e/prd0062-student-accessibility-device.spec.ts` records the safe Student
  quick-login preflight only. It does not label missing Book runtime keyboard,
  focus, accessible-name, touch, overflow, responsive, persistence, schedule,
  notification, results, or replacement journeys as passed. Each controlled
  preflight writes machine-readable JSON with the policy state and observed
  errors/artifact path.
- `playwright.prd0062-student-accessibility-device.config.mjs` owns the
  student role at `http://localhost:5174`, uses explicit desktop/mobile
  Chromium projects, and has `reuseExistingServer: false`.
- `artifacts/prd0062-ticket-51c2/browser/50a-deny-preflight-*.json` records
  `blocked_by_policy`, `runtimeAcceptance: not-executed`, all six 50A actions
  denied, 03B/B2 disabled, 200% zoom, no Book/PDF text, no console/page
  errors, and the sanitized heading-only screenshots.

### Safe verification

| Proof | Result |
| --- | --- |
| 51C2 fixture determinism/cleanup tests | PASS: 2/2 |
| 51C2 Playwright config parse/list | PASS: 4 tests across desktop and mobile projects |
| Student browser deny preflight, direct process-owned run | PASS: 4/4 in 36.5 seconds; quick-login reaches `http://localhost:5174/student` on both projects, Dashboard is visible at 200% zoom, no Book Mode 2/PDF source text is exposed, and no console/page errors were observed |
| Machine-readable preflight artifacts | PASS: 2 JSON artifacts; both record the deny boundary and `runtimeAcceptance: not-executed` |
| 51A matrix validation | PASS: definition-only; 24 cases / 8 fixtures / 166 PRD requirements / 6 trace sections |
| Focused ESLint and whitespace guard | PASS; `git diff --check` clean |
| Cloudflare Worker-pool gate suite | `HARNESS_BLOCKED` before collection: `Unsupported platform: win32 arm64 LE`; no product result inferred |

Browser-state disagreement is recorded: the separate read-only investigator
reported IAB `ERR_CONNECTION_REFUSED` while the controlled direct Playwright
run passed 4/4. This remains a local browser/app harness disagreement, not a
runtime acceptance claim.

The full #131 acceptance remains unexecuted. It requires approved trusted
activation, a healthy Worker harness, real Book runtime accessibility/device
journeys, keyboard/focus/touch/overflow assertions, source correspondence,
machine-readable metrics, retry/idempotency evidence, and deployment/canary
proof. Current artifacts prove only the safe deny preflight.

Rollback remains deny-only: preserve the scoped fixtures, JSON artifacts, and
sanitized screenshots; keep Mode 2 disabled, keep all six 50A actions denied,
keep 03B disabled, and do not mutate product code or acceptance criteria. #131
stays open until every published gate is actually available and passes.

## Ticket 51D1 current acceptance audit - 2026-07-24

**State: `BLOCKED_BY_POLICY_AND_HARNESS`; issue [#132](https://github.com/iamhuwng/autoresync/issues/132) remains `OPEN`.**
Fresh live issue review confirms the remote #132 body still says
`Blocked by: 51A` while #127 / 51A is closed in the live graph; the dependency
text is stale relative to the graph, and was not remotely edited in this pass.
Current blockers are 50A all-six deny, 03B/B2 disabled, and the Worker
dependency harness. No trusted Book operation, paid PDF processing, Browser
Run, deployed rules readback, remote mutation, or issue closure was performed
for #132.

### Scoped evidence package

- `artifacts/prd0062-ticket-51d1/runtime-security-boundary.json` records the
  `runtime-security-boundary` case, exact canonical source names and required
  Listening note-completion / Reading matching / Reading Yes/No/Not Given
  inspection labels, policy state, safe-check results, uncollected metrics,
  and `runtimeAcceptance: not-executed`.
- `artifacts/prd0062-ticket-51d1/security-rules-negative.json` records the
  `security-rules-negative` case, named rule paths, explicit negative actor /
  operation expectations, no raw protected payload, and no fabricated
  allow/deny outcome for skipped authority proof.
- `artifacts/prd0062-ticket-51d1/harness-arm64-workerd.json` records the
  repository ARM64 Node surface, isolated x64 attempt, exact pre-collection
  native-binding failure, normal ARM64 workerd sentinel, and read-only media
  profile bucket preflight. No secret values are recorded.

### Safe verification

| Proof | Result |
| --- | --- |
| 51A matrix validation | PASS: definition-only; 24 cases / 8 fixtures / 166 PRD requirements / 6 trace sections |
| 51A validator/determinism tests | PASS: 12/12 |
| Root security suite | PARTIAL PASS: 12 files / 161 passed / 24 skipped; skipped emulator/deployed branches are not promoted to security PASS |
| Book domain/service contract suites | PARTIAL PASS: 45 files / 265 passed; local contract proof only |
| Cloudflare Worker suite | `HARNESS_BLOCKED` before collection: normal ARM64 `Unsupported platform: win32 arm64 LE`; isolated x64 attempt missing `@rolldown/binding-win32-x64-msvc` |
| Wrangler account preflight | PASS read-only: x64 profile `media`, Wrangler 4.112.0, sentinel buckets `kahoot-media` and `luyentap-book-source-private`; no mutation |
| JSON artifact validation | PASS: 3/3 artifacts parse; `git diff --check` clean |

The full #132 acceptance remains unexecuted. Firebase emulator/deployed rules
readback, complete Worker/provider negative and positive paths, stale/replay
trusted commands, document auth/ranges, update/replacement saga, exact
delete, and production-equivalent canary proof require approved authority and
a healthy isolated Worker harness. No product failure is inferred from the
harness errors.

Rollback remains deny-only: preserve the three redacted artifacts, keep Mode 2
disabled, keep all six 50A actions denied, keep 03B disabled, do not repair
shared dependencies or alter package/application code for the harness, and do
not weaken acceptance criteria. #132 stays open until every published security
and deployment gate is actually available and passes.

## Ticket 51D2 current acceptance audit - 2026-07-24

**State: `CLOSURE_BLOCKED`; issue [#133](https://github.com/iamhuwng/autoresync/issues/133) remains `OPEN`.**
Fresh live issue review confirms the remote #133 body still says
`Blocked by: 51A`; #127 / 51A and #44 / 50A are both `CLOSED` in the live
graph, so the body dependency text is stale and was not remotely edited in
this pass. Governing rollout policy remains all-six deny and 03B/B2 remains
disabled. No PDF bytes were restored, no paid processing or Browser Run was
used, no remote data was mutated, and #133 was not closed.

### Scoped evidence package

- `artifacts/prd0062-ticket-51d2/backup-recovery.json` records the
  `backup-recovery` case with `envelopeId`, checksum/idempotency fields,
  metadata-only local observation, explicit `pdfBytesRestored` expected false
  but not executed, policy state, commands, and deployment gap.
- `artifacts/prd0062-ticket-51d2/legacy-regressions.json` records the
  `legacy-regressions` case, named legacy surfaces, no copied before/after
  counts, Mode 1/local regression results, and non-Book backup-worker result.
- `artifacts/prd0062-ticket-51d2/harness-deployment-recovery.json` records
  the x64 `media`-profile dry-run, binding names only, no remote mutation, and
  the missing deployed/current recovery-canary proof.
- `artifacts/prd0062-ticket-51a/backup-recovery.json` and
  `artifacts/prd0062-ticket-51a/legacy-regressions.json` are matrix-path
  pointers to the two canonical 51D2 artifacts; they preserve the published
  matrix paths without duplicating mutable evidence.
- Book-PDF quarantine remains test-backed: retired backup/restore endpoints
  are absent/404, ordinary media inventory remains limited to preserved
  prefixes, and no Book-PDF object calls occur in the local Worker tests.

### Safe verification

| Proof | Result |
| --- | --- |
| 51A matrix validation | PASS: definition-only; 24 cases / 8 fixtures / 166 PRD requirements / 6 trace sections |
| Matrix backup/recovery command | PARTIAL PASS: 12 security files / 161 passed / 24 skipped; `scripts/__tests__` was not discovered by the Vitest config, so skipped branches remain unproven |
| Matrix legacy command | PASS: 29 files / 201 passed |
| Focused backup/restore Worker tests | PASS: 2 files / 4 passed; memory-only fixture harness |
| Full `r2-backup-worker` suite | PASS: 7 files / 40 passed |
| x64 Wrangler backup Worker dry-run | PASS: profile `media`, Wrangler 4.112.0, binding-name readback only, `--dry-run`, no remote mutation |
| JSON artifact validation and whitespace guard | PASS: 3/3 artifacts parse; `git diff --check` clean |

The full #133 acceptance remains unexecuted. Current local tests do not prove
all issue-named legacy product surfaces, an explicit recovery envelope/ledger
and two-pass implementation, exact old-version object deletion, post-restore
trusted-side-effect suppression, deployed/current Worker state, scoped
recovery canary behavior, or production-equivalent rollback. The dry-run is
local bundle/config proof only. No product failure is inferred from absent
deployment/current proof or the intentionally skipped emulator branches.

Rollback remains deny-only: preserve the three redacted artifacts, keep Mode 2
disabled, keep all six 50A actions denied, keep 03B disabled, never restore
deleted PDF bytes, and do not change package/lockfiles to repair harnesses.
#133 stays open until every legacy, backup, recovery, deployment, and rollback
gate is actually available and passes.

## Ticket 48A root-first closure audit - 2026-07-24

**State: `CLOSURE_BLOCKED_DEPLOYED_AUTHENTICATED_PROOF_MISSING`; issue [#43](https://github.com/iamhuwng/autoresync/issues/43) remains `OPEN`.**

Live issue review confirms the only listed prerequisite, #28 / 03C, is
`CLOSED` in the live graph. Its issue body still contains the stale dependency
text; that text was not remotely edited. This audit therefore targets the true
current root, not a downstream ticket.

### Scoped evidence package

- `artifacts/prd0062-ticket-48a/closure-audit.json` records the current live
  issue state, local Worker retirement proof, x64 Wrangler dry-run, deployed
  version/binding-name readback, unauthenticated endpoint observations, and
  every proof still required before closure.
- The local Worker suite passed 7 files / 40 tests. The retirement test proves
  retired Book-PDF paths are absent from local deployment inputs, retired routes
  return 404 without R2 calls, and ordinary media inventory remains limited to
  audio, image, and avatar prefixes.
- The x64 Wrangler dry-run passed with `PRIMARY_R2 = kahoot-media` and no
  `BOOK_SOURCE_BACKUP_R2` binding. The required Worker deployment then
  succeeded as version `80adceb6-6894-48a0-bd53-bd2a1e09387d`; active
  deployment readback reports 100% on that version, handlers `fetch` and
  `scheduled`, and no `BOOK_SOURCE_BACKUP_R2` binding name. Generic
  `BACKUP_R2_*` secret names remain; their non-Book provenance is not proven by
  binding-name readback alone. The deploy command used this checkout, but
  Cloudflare metadata exposes no Git SHA or historical module-content readback;
  independent source correspondence remains unproven.
- Cloudflare current-script content readback returned HTTP 200 with ETag
  `ecc8130b04e2affd10b24f5e2cb81954b9cc0332f194f2af5711c7fc0e9f23ed`, exactly
  matching the active version readback. The 284,740-byte deployed bundle has
  no `BOOK_SOURCE_BACKUP_R2`, Book-PDF capability, or retired backup/restore
  route; it retains the ordinary media routes and `PRIMARY_R2` reference.
  This is deployed bundle evidence, not authenticated route-behavior proof.
- Unauthenticated GETs to the retired endpoints and `/api/backup/health`
  returned `403` against the current deployed version; these are
  authentication-gate observations, not proof that the authenticated deployed
  retired endpoints are unavailable.
- A valid `teacher@test.com` ID token, obtained through the allowed localhost
  referrer and held only in memory, returned `403 Forbidden: super_admin
  required` for both retired POST routes and `/api/backup/health`. The
  repository's `admin@test.com` test-account attempt returned
  `INVALID_LOGIN_CREDENTIALS`; the deployed `ADMIN_UID` is the literal
  `ADMIN_UID` placeholder. This establishes the exact credential boundary but
  does not substitute for admin-authenticated route/media proof.
- A read-only shallow `users.json` read against `temp-a1437` returned `401
  Permission denied`; no user records were printed. No canonical super-admin
  UID is available from the current local authority surface.

### Closure boundary

One Worker deployment occurred; no Firebase/R2 object/secret/bucket mutation,
restore, or issue closure occurred. The Cloudflare quarantine runner remains
blocked before collection by the Windows ARM64 `workerd` binary. Authenticated
deployed retired-route/preserved-media probes using a valid `super_admin` token,
independent source correspondence, the consumable #47 deletion artifact, and
rollback execution remain unexecuted. Keep #43 open.

The named Wrangler `media` OAuth profile used for the readback was revoked and
deleted after an accidental local auth-config inspection exposed credential
material in tool output. No credential value is recorded in repository evidence.
The host credential store was then inspected by target name only. The exact
revoked `LegacyGeneric:target=media.wrangler` entry was deleted successfully;
the separate `backup.wrangler` entry was preserved. Explicit x64 Wrangler
`auth list` now shows only the `default` profile. No credential values were
read or recorded.

## Ticket 01 root-first revalidation - 2026-07-24

Fresh GitHub read found 112 published tickets, 106 `OPEN`, 6 `CLOSED`, 308
blocker edges, no missing references, and the graph-clear frontier #25, #43,
#128, #129, #130, #131, #132, and #133. #25 and #43 are the true product
roots; #128-#133 are downstream evidence suites whose full acceptance still
requires trusted Mode 2 activation and deployed Worker/B2 proof.

Ticket 01 remains `CLOSURE_BLOCKED_09E_OWNED_GENERATED_RULE_PROOF` and remains
open. Fresh local verification passed:

- rollout and rule-fragment deny suite: 3 files / 12 tests;
- mode creation and material-book service suite: 5 files / 52 tests;
- 51A acceptance-matrix validator: pass;
- prior authenticated teacher browser proof: Materials creation/persistence
  passed while PDF creation remained denied by 50A.

The remaining Ticket 01 gates are the composed generated `database.rules.json`
Book-mode enforcement, composed emulator negative matrix, rules dry-run, and
deployed negative readback. Ticket 01 owns only `fragments/01.json`; published
ticket 09E / issue #118 owns generated composition and deployment proof. Issue
#118 is not graph-clear because its published blocker list includes #25. No
generated root edit or dependency bypass was made. 50A remains all-six-deny and
03B remains disabled.

### 48A local bundle correspondence check

After the `media` profile was revoked, explicit x64 Node still ran Wrangler
4.112.0 with only the `default` profile. A no-profile local dry-run wrote a
284,557-byte bundle from the current checkout and an 89-input metafile. It found
zero forbidden Book-PDF inputs, no retired backup/restore routes, and ordinary
audio/image/avatar markers. SHA-256:
`71c391c656be1c322239f09565c0f396941542c92414178fa3b6b9c8e4a54d43`.

The previously captured deployed current-script readback was 284,740 bytes
with ETag `ecc8130b04e2affd10b24f5e2cb81954b9cc0332f194f2af5711c7fc0e9f23ed`.
Because the artifact sizes and representations differ, this strengthens local
retirement proof but does not establish exact source-to-deployed correspondence.
No remote mutation occurred.

### Ticket 48A superseding live closure proof - 2026-07-24

The preceding profile/deployment paragraph is historical. This section is the
current live state and supersedes its unresolved-proof conclusion.

- Cloudflare OAuth profile `media` was recreated after approval and activated
  only from the dedicated `r2-backup-worker` directory. Sentinel bucket
  readback showed `kahoot-media` and `luyentap-book-source-private`; no token or
  secret value was recorded. Source repository profile activation remains false.
- Fresh x64 Wrangler 4.112.0 dry-run output wrote
  `artifacts/prd0062-ticket-48a/local-bundle-20260724-revalidated/index.js`.
  It contains 284,557 bytes, 89 inputs, zero forbidden inputs, and SHA-256
  `71c391c656be1c322239f09565c0f396941542c92414178fa3b6b9c8e4a54d43`.
- Version-specific Cloudflare content readback
  (`content/v2?version=80adceb6-6894-48a0-bd53-bd2a1e09387d`) returned HTTP
  200, entrypoint `index.js`, and exactly the same 284,557-byte module hash.
  This proves independent source-to-deployed correspondence. The multipart
  HTTP envelope is 284,740 bytes and its ETag remains
  `ecc8130b04e2affd10b24f5e2cb81954b9cc0332f194f2af5711c7fc0e9f23ed`.
- Chrome tab `Dashboard | MySTUdent Workspace` was already authenticated as
  `iamhuwng@gmail.com`; live React/Firebase authority readback showed UID
  `ADMIN_UID`, `role=super_admin`, and `profileStatus=active`. Firebase RTDB
  authority readback of `users/ADMIN_UID` returned HTTP 200; raw profile data
  was not recorded and ID-token values remained in page memory.
- Authenticated deployed probes returned `404 {"error":"Not found"}` for
  `POST /api/backup/book-source-media` and
  `POST /api/restore/book-source-media`. Existing audio object download
  returned HTTP 200 with `text/plain` and the expected canary body prefix.
  This proves retired routes unavailable and ordinary media route functioning
  past the auth boundary.
- Rollback drill deployed version
  `24a4d5e2-caf4-4ed1-bb82-1a0715838f92` to 100% through deployment
  `fdb2d276-ffd7-4f70-959d-e9db48e8db94`; authenticated probes returned retired
  routes 404 and existing media 200. Version
  `80adceb6-6894-48a0-bd53-bd2a1e09387d` was restored to 100% through
  deployment `e6579469-9499-4044-9190-cb81b14dd6dd` and reproved identically.
  Both versions have the same retirement bundle hash; no Book-PDF capability
  was restored.
- Closure artifact:
  `artifacts/prd0062-ticket-48a/closure-audit.json`.
  Exact correspondence/rollback companion:
  `artifacts/prd0062-ticket-48a/deployed-content-correspondence-20260724.json`.

Ticket 48A now has all listed local, dry-run, deployed, authenticated,
source-correspondence, preserved-media, and rollback gates proven. Issue #43
was then closed with the exact proof comment. The #47/#119 handoff is
consumable for its 48A dependency only; #07, #46B, exact-item deletion proof,
and separate irreversible-deletion authority remain required.
No Firebase, R2 object, secret, or bucket mutation occurred; only Worker
traffic deployments were performed and final traffic is 100% on version 44.

### Live graph after Ticket 48A closure - 2026-07-24

Fresh GitHub API read after closing issue [#43](https://github.com/iamhuwng/autoresync/issues/43)
found 112 PRD0062 tickets, 105 `OPEN`, 7 `CLOSED`, 308 unique blocker edges,
zero missing references, zero duplicate edges, and zero cycles (112/112
topological traversal). Current graph-clear frontier:

- #25 / PRD0062 01 — true product root; remains open because generated
  `database.rules.json` composition/deployed negative proof is owned by #118;
- #128 / 51B1, #129 / 51B2, #130 / 51C1, #131 / 51C2, #132 / 51D1, and
  #133 / 51D2 — downstream evidence suites, still requiring trusted Mode 2
  activation/deployed Worker/B2 proof.

Closure-first scheduling therefore does not jump to downstream tickets while
#25 remains the unresolved root. Ticket 03B remains disabled and Ticket 50A
remains all-six deny. Issue #43 is now `CLOSED`; its #47/#119 handoff is
available as dependency evidence but does not authorize irreversible deletion.

### Ticket 01 root decision after 48A closure - 2026-07-24

Fresh primary audit re-read live issue [#25](https://github.com/iamhuwng/autoresync/issues/25)
after #43 closure. Issue #25 remains `OPEN` with no published blocker. Local
implementation proof remains complete: mode chooser precedes metadata,
Materials creation/refresh/reopen persists mode, malformed mode and in-place
mutation are rejected, legacy missing `bookMode` resolves to Materials without
eager rewrite, shared announcements/events pass, and ticket-owned
`fragments/01.json` passes contract tests. Focused proof remains 5 files / 52
tests plus 3 files / 12 rollout/fragment tests and the 51A validator.

Remaining gates:

- PDF browser create/refresh/reopen, intentionally not run while 50A remains
  all-six-deny;
- generated `database.rules.json` `bookMode` enforcement;
- composed emulator direct-child, whole-record, root-update, ancestor-shaped,
  and cross-owner negative matrix;
- rules compile/dry-run and deployed negative readback.

Current `database.rules.json` contains zero `bookMode` matches. Published issue
#118 / 09E explicitly owns generated composition, emulator, dry-run, and
deployment proof, while its own Blocked by list includes #25. Ticket #25 must
not edit the generated root. This is an ownership/authority boundary, not a
license to start #118 or target its prerequisites. Keep #25 open; preserve 50A
all-six-deny and 03B disabled. Existing root decision is recorded in
[the #25 evidence artifact](../../artifacts/prd0062-ticket-01/browser-flow.json)
and [the live closure comment](https://github.com/iamhuwng/autoresync/issues/25#issuecomment-5066898080).

### Ticket 51B1 safe-deny preflight and current blocker - 2026-07-24

Fresh live graph revalidation shows issue [#127](https://github.com/iamhuwng/autoresync/issues/127)
is `CLOSED`; the `Blocked by #127` text still present in issue [#128](https://github.com/iamhuwng/autoresync/issues/128)
is stale and is not a live graph blocker. Ticket 51B1 therefore remains
graph-clear, but its positive acceptance is not closure-ready.

The safe preflight passed with one test and zero failures:

`rtk npx playwright test e2e/prd0062-teacher-authoring-assignment.spec.ts --config playwright.config.js --project chromium --grep "51B1 teacher preflight"`

The authenticated teacher quick-login flow showed Materials enabled, PDF source
disabled, the PDF-unavailable announcement, and no Save button. Evidence is
stored in
`artifacts/prd0062-ticket-51b1/browser/50a-deny-preflight.json` and
`artifacts/prd0062-ticket-51b1/browser/50a-deny-preflight.png`.

This proves safe deny visibility only. Full Mode 2 authoring, source/upload,
assembly/publication, assignment, production canary/deployment/rollback, and
result/observability/accessibility/network/console acceptance remain
unexecuted. The blocker is the active goal safety boundary: Ticket 50A must
remain all-six-deny/default-deny and Ticket 03B must remain disabled. No
capability activation or remote mutation was made. Keep #128 open until the
PRD owner supplies canonical authority to change the #50A boundary, or revises
the acceptance contract to permit deny-only closure.

### Deterministic roadmap selection snapshot — #25/#118 root boundary — 2026-07-24

Fresh live read of all 112 PRD0062 issue bodies recorded the complete graph in
artifacts/prd0062-selection-20260724-root-boundary.json:

- 112 tickets; 105 OPEN, 7 CLOSED;
- 308 unique blocker edges; zero duplicate edges, missing references, or cycles;
- topological traversal 112/112;
- graph-clear frontier: #25 (99 descendants), #128–#133 (2 descendants each).

Roadmap phase is Foundation. Select #25 / Ticket 01 as the sole primary root:
it has no live prerequisites and the highest verified leverage. Local mode,
service, announcement, fragment-contract, and browser deny evidence pass, but
closure requires the #118-owned generated database.rules.json, composed
emulator negatives, rules dry-run, and deployed negative readback.

Reject #118 / 09E for this selection: its live Blocked by list contains
unresolved prerequisites, including #25, so its generated-root acceptance is
not executable. #25 owns only fragments/01.json; it must not edit the generated
root. Reject #128–#133 despite graph-clear status: their positive acceptance
requires the preserved #50A boundary to change and trusted Mode 2/deployed
Worker/B2 proof, which is not authorized.

Required root resolution is a canonical #25/#118 ownership or dependency-graph
decision. Preserve #03B disabled and #50A all-six-deny/default-deny. Do not
start shared-blocker descendants until this Foundation boundary is resolved.

Blocker audit:

- Owner: PRD0062 canonical owner / Ticket 09E authority.
- Required action: publish the canonical #25/#118 ownership or dependency-graph
  resolution, then provide the 09E-owned generated rules composition, composed
  emulator negative matrix, rules dry-run, deployed negative readback, and
  rollback artifact.
- Evidence: fresh individual reads of issues #25–#136 reproduce the graph above;
  #25 is OPEN with no blockers and delegates generated database.rules.json to
  #09E; #118 is OPEN with 25 unresolved published prerequisites including #25;
  current generated database.rules.json has zero bookMode matches; local Ticket
  01 focused proof passes, but generated/deployed gates are absent.
- Impact: #25 cannot formally close; #118 cannot be selected without bypassing
  its live prerequisites; #128–#133 cannot be selected without bypassing the
  preserved #50A capability boundary.

### Mandatory transitive dependency gate — 2026-07-24

Fresh individual live reads of issues #25–#136 were used to calculate the
complete direct and transitive prerequisite closure for every unresolved
ticket. The machine-readable result is
`artifacts/prd0062-selection-20260724-transitive-gate.json`.

- Graph: 112 tickets, 105 OPEN, 7 CLOSED, 308 raw/unique edges, zero missing
  references, duplicate edges, or cycles; topological traversal 112/112.
- Coverage: all 105 unresolved tickets have sorted direct, complete transitive,
  and OPEN-transitive prerequisite lists plus phase and rejection reasons.
- Only #25 and #128–#133 have no OPEN transitive prerequisite.
- #25 is still ineligible: current Foundation phase matches and its prerequisite
  chain is empty, but its own acceptance and ownership gates are not executable
  until the #25/#118 generated-rule boundary is canonically resolved.
- #118 is ineligible: its complete transitive chain contains 86 prerequisites,
  82 of them OPEN, including #25.
- #128–#133 are ineligible: their transitive prerequisites #44 and #127 are
  CLOSED, but they belong to Final Closure rather than the current Foundation
  phase, and their positive acceptance shares the preserved #50A boundary.
- Every other unresolved ticket has at least one OPEN direct or transitive
  prerequisite and is excluded before implementation or acceptance work.

Selection result: no eligible primary. Owner remains the PRD0062 canonical
owner / Ticket 09E authority. Required action remains a canonical #25/#118
ownership or dependency-graph resolution followed by the 09E-owned generated
rules, emulator, dry-run, deployed readback, and rollback proof. No descendant,
#128–#133 suite, 03B capability, or 50A action was started.

### Ticket 01 post-contract readiness audit — 2026-07-24

Canonical owner decision applied live to [issue #25](https://github.com/iamhuwng/autoresync/issues/25):
09E-generated composition, generated-rule dry-run/deployed proof, active
version/hash readback, and generated-rule rollback are no longer Ticket 01
closure gates. They remain Ticket 09E / #118 ownership. All other Ticket 01
gates remain in force.

The complete graph was refetched after the live contract edit and remains
112 tickets, 105 `OPEN`, 7 `CLOSED`, 308 unique edges, zero missing or
duplicate references, zero cycles, and topological traversal `112/112`.

Ticket 01 now has no direct or transitive OPEN prerequisite, but it is still
not acceptance-ready. Live teacher browser proof at
`http://localhost:5173/lobby` after built-in Teacher quick-login opened the
Create Book dialog and showed `PDF source` disabled with the status
`PDF source creation is not available yet.` This is the preserved Ticket 50A
all-six-deny/default-deny boundary. No 50A capability was enabled, no PDF
creation was attempted through a bypass, and no closure claim was made.

Selection artifact:
`artifacts/prd0062-selection-20260724-post-25-contract.json`

Current blocker:

- Owner: PRD0062 canonical owner.
- Required action: either canonically approve a 50A boundary change, or revise
  Ticket 01 browser acceptance to a safety-compatible proof that does not claim
  PDF creation while 50A remains all-six-deny/default-deny.
- Impact: Ticket 01 remains `OPEN`; no other Foundation/enabler ticket is
  eligible without bypassing the current roadmap phase, transitive graph, or
  preserved 50A safety boundary.

### Canonical revised Ticket 01 rule and reselection — 2026-07-24

The canonical owner revised Ticket 01 acceptance:

- Materials creation, persistence, refresh/reopen, legacy missing-mode fallback,
  immutable mode, and fail-closed PDF denial remain Ticket 01 proof.
- Positive PDF creation proof moves to activation ticket 50B / issue #126,
  after generated rules and trusted seams are complete.
- Ticket 09E / issue #118 remains sole owner of generated
  `database.rules.json`, full composed emulator proof, deployment readback, and
  rollback.
- Ticket 50A remains all-six-deny/default-deny. Ticket 03B remains disabled.

After the live #25 contract edit, all 112 issue bodies were refetched and the
complete graph recomputed: 112 tickets, 105 `OPEN`, 7 `CLOSED`, 308 unique
edges, zero missing or duplicate references, zero cycles, and topological
traversal `112/112`. #25 has no direct or transitive `OPEN` prerequisite and
has downstream leverage 99. It is reselected as the sole Foundation primary.

Selection artifact:
`artifacts/prd0062-selection-20260724-ticket01-reselected.json`

Required #25 gates for this primary:

- focused type/service/component and Ticket 01 fragment-contract/emulator tests;
- Mode 1 and legacy fallback regressions;
- teacher Materials create/refresh/reopen with persisted `materials` mode;
- visible and announced PDF fail-closed denial with no PDF Book creation;
- shared announcements/observability and rollback semantics with 50A unchanged.

Do not select #118 or #128–#133 during this primary. #118 has 82 `OPEN`
transitive prerequisites. #128–#133 are Final Closure tickets and remain behind
the preserved 50A activation boundary.

### Ticket 01 canonical browser proof — 2026-07-24

The revised Ticket 01 browser gates passed at
`http://localhost:5173/lobby` using the built-in Teacher Test authority.
Machine-readable evidence:
`artifacts/prd0062-ticket-01/2026-07-24-canonical-browser-proof.json`

- Materials creation passed with unique title
  `PRD0062 01 canonical materials 20260724-A`.
- Shared success announcement reported the created Book.
- Full lobby reload preserved the Book; the exact title was found in Book
  catalog and reopened successfully.
- My Content also exposed the same persisted record as `0 questions` with
  `IELTS - General`, proving legacy missing-mode fallback.
- PDF source remained disabled and the dialog emitted
  `PDF source creation is not available yet.` No bypass or 50A enablement was
  used.
- Reopened Book settings retained private/draft-empty/IELTS state and exposed
  no mode-switch control.
- Teacher Materials diagnostics recorded successful list/load operations; no
  browser error-level entries were observed.

This proof respects the canonical closure boundary: #25 does not claim
positive PDF creation, generated `database.rules.json` composition, deployed
readback, or rollback proof. Positive PDF creation remains #126/50B-owned;
generated-rule proof remains #118/09E-owned.

### Post-Ticket-01 graph and next Foundation primary — 2026-07-24

Issue #25 closed only after its revised canonical gates passed. All 112 live
issue bodies were then refetched and the complete graph recomputed:

- 104 `OPEN`, 8 `CLOSED`, 308 unique blocker edges;
- zero missing references or dependency cycles;
- topological traversal `112/112`;
- graph-clear frontier #29, #32, #33, #45, and #128–#133.

Selection artifact:
`artifacts/prd0062-selection-20260724-post-ticket01.json`

Ticket 04 / #29 had the highest Foundation leverage (84), but its fresh
authority preflight failed without mutation. Windows x64 Wrangler 4.112.0
loaded, while `wrangler auth list` exposed only `backup`; the required named
`media` profile could not authenticate `r2 bucket list --profile media`.

- Owner: Cloudflare `media` profile authority.
- Required action: restore/authorize `media`, verify the `kahoot-media`
  sentinel, then repeat deployed Worker/B2 readback.
- Evidence: live profile-aware preflight above; no deploy, secret, bucket, or
  object mutation occurred.
- Impact: #29 cannot receive fresh deployed-state proof or close; its
  descendants remain ineligible.

The independent Foundation candidates #32 and #33 have no authority blocker.
#33 has stronger downstream leverage (83 versus 74) and only local executable
gates, so #33 / Ticket 12A is the next primary. #45 is rejected as Runtime
phase. #128–#133 remain Final Closure and behind the preserved 50A boundary.
Every other unresolved ticket has an OPEN direct or transitive prerequisite
and is recorded as ineligible in the selection artifact.

Fresh Ticket 12A verification passed its four focused files / 22 tests,
focused ESLint, and `git diff --check`. The production build already passed
against the same source state during the immediately preceding Ticket 01
closure pass. Independent closure review is pending.

### Ticket 12A closure remediation — 2026-07-24

Independent review found two closure blockers despite the original green
suite:

- editable Activity JSON could include the system-owned
  `currentDraftVersionId` and `currentPublishedVersionId` pointers;
- explicit `taskProfile: null` bypassed unknown-profile fail-closed handling.

Both were remediated within Ticket 12A ownership. The central forbidden-field
contract now rejects both version pointers, and any explicitly supplied
Activity `taskProfile` value, including `null`, fails closed until a registered
profile exists. Focused regressions cover all three cases.

Final proof:

- four Ticket 12A files / 23 tests pass;
- focused Ticket 12A ESLint passes;
- `git diff --check` passes;
- production build passes with 9,332 modules and bundle budget OK;
- targeted independent re-review returns `PASS` with both findings resolved
  and no adjacent regression.

No browser, deployment, remote mutation, or secure provisioning is required
by Ticket 12A. Rollback keeps every Activity operational capability false,
hides Activity entry points, and preserves existing material identities and
Mode 1/Reading/Listening behavior.

### Post-Ticket-12A graph and next Foundation primary — 2026-07-24

After #33 closed, all 112 live issue bodies were refetched and the complete
graph was recomputed:

- 103 `OPEN`, 9 `CLOSED`, 309 unique blocker edges;
- zero missing references or dependency cycles;
- topological traversal `112/112`;
- graph-clear frontier #29, #32, #34, #45, and #129–#133.

Selection artifact:
`artifacts/prd0062-selection-20260724-post-ticket12a.json`

Ticket 04 / #29 remains the highest-leverage Foundation candidate (85), but
its acceptance is blocked by missing named `media` authority and therefore
cannot be selected. #32 has lower leverage (75). #45 is Runtime phase. #128
is no longer graph-clear because its live body has open #126/50B; #129–#133
share that open activation prerequisite and remain Final Closure/50A-bound.

Ticket 12B / #34 is selected as the sole next Foundation primary: direct and
transitive prerequisites #33 and #25 are CLOSED, acceptance is local and
executable, and verified downstream leverage is 83. Every other unresolved
ticket is recorded as rejected by the transitive prerequisite, authority, or
roadmap-phase rule in the selection artifact.

Fresh Ticket 12B verification is now complete: two focused domain/property
files / 17 tests pass, scoped ESLint passes, and `git diff --check` passes.
Production build proof remains valid from the immediately preceding source
verification pass; no Ticket 12B source changed after that build. Independent
spec/standards review is pending before closure.

### Ticket 12B closure remediation — 2026-07-24

Independent review found one projection closure blocker: nested canonical
`taskProfile`, `stimulus`, and `sourceAssisted` objects were spread into the
student projection, allowing future owner/authoring/provenance fields to leak.

The projection now rebuilds each nested object from explicit runtime
allowlists. A hostile nested-field regression proves `teacherNotes`, `ownerId`,
`provenance`, and corresponding secret values do not cross the student
projection boundary.

Final proof:

- two focused domain/property files / 18 tests pass;
- focused Ticket 12B ESLint passes;
- `git diff --check` passes;
- production build passes with 9,332 modules and bundle budget OK;
- targeted independent re-review returns `PASS` with no adjacent projection
  issue.

No browser, deployment, or secure provisioning is required by Ticket 12B.

### Post-Ticket-12B graph and next Foundation primary — 2026-07-24

After #34 closed, all 112 live issue bodies were refetched and the graph
recomputed: 102 `OPEN`, 10 `CLOSED`, 309 unique edges, zero missing references
or cycles, and topological traversal `112/112`.

Selection artifact:
`artifacts/prd0062-selection-20260724-post-ticket12b.json`

Ticket 04 / #29 remains blocked by missing named `media` authority. Tickets
#32 and #35 both have leverage 75 and executable local Foundation gates, but
#32 is the earlier unresolved root/enabler while #35 is a descendant of newly
closed #34. The roadmap contract therefore selects #32 / Ticket 11 first.

#36 and #37 are later Foundation enablers; #42 is Operations; #45 is Runtime;
#128–#133 remain directly or transitively behind open #126/50B, the preserved
50A boundary, and Final Closure phase. Every other unresolved ticket has an
OPEN direct or transitive prerequisite.

Fresh Ticket 11 verification passes five relevant test files / 32 tests
(including shared Book validation), scoped ESLint, and `git diff --check`.
Production build proof remains valid from the immediately preceding source
verification pass; no Ticket 11 source changed after that build. Independent
spec/standards review is pending before closure.

Independent Ticket 11 review returns `PASS`: source strategy, ownership, tree
depth/order/cycles, source-qualified pages, Activity mapping, forbidden fields,
limits, and legacy types satisfy the live #32 contract. Narrow TypeScript,
including `ticket11.typecheck.ts`, passes. Root TypeScript still stops at the
known unrelated harness-only `TS2742` in `src/test/test-utils.tsx:51`; scoped
Ticket 11 types are clean. No browser, deployment, or secure provisioning is
required.

### Post-Ticket-11 graph and next Foundation enabler — 2026-07-24

After #32 closed, all 112 live issue bodies were refetched and the graph
recomputed: 101 `OPEN`, 11 `CLOSED`, 309 unique edges, zero missing references
or cycles, and topological traversal `112/112`.

Selection artifact:
`artifacts/prd0062-selection-20260724-post-ticket11.json`

Ticket 04 / #29 remains authority-blocked. Ticket 12C / #35 is graph-clear
with leverage 75, but its own preview Worker deployment/readback and secure
provisioning gates are not executable while the named Wrangler `media` profile
is absent. It is therefore ineligible under the acceptance-readiness rule,
not merely deprioritized.

- Owner: Cloudflare `media` profile authority.
- Required action: restore/authorize `media`, then run preview Worker
  deployment/readback and scoped service-identity proof.
- Evidence: live profile preflight exposed only `backup`; no remote mutation
  occurred.
- Impact: #35 and its descendants remain blocked.

#36 and #37 are independent local Foundation enablers with equal leverage 70.
#36 / Ticket 22A is the earlier renderer-contract enabler and is selected as
the sole next primary. #42 is Operations, #45 is Runtime, and final suites
remain behind open #126/50B and preserved 50A.

Fresh Ticket 22A proof passes five focused registry/codec/dependency/component
files / 15 tests, scoped ESLint, and `git diff --check`. Production build proof
remains valid at the same source state. Independent closure review is pending.

Independent Ticket 22A review found three fail-closed gaps: registered renderers
decoded without semantic validation, review projections accepted malformed
nested values, and unknown variants lacked a direct diagnostic regression.
Remediation now invokes each codec's validator before rendering, reconstructs
review projections from runtime-checked allowlists, and adds direct regressions.
A follow-up review found sparse `items` arrays could bypass `.every`; validation
and copying now use `Array.from`, with a sparse-array regression.

Final proof passes five focused registry/codec/dependency/component files / 17
tests, scoped ESLint, `git diff --check`, and the production build (9,332
modules; bundle budget OK). Independent targeted re-review returns `PASS` with
no adjacent issue. Ticket 22A requires no browser or secure provisioning proof.

### Post-Ticket-22A graph and next Foundation enabler — 2026-07-24

After #36 closed, all 112 live issue bodies were refetched. Complete transitive
prerequisite chains were recalculated for every unresolved ticket: 100 `OPEN`,
12 `CLOSED`, 309 unique edges, zero missing references or cycles, and
topological traversal `112/112`.

Selection artifact:
`artifacts/prd0062-selection-20260724-post-ticket22a.json`

#29 and #35 remain acceptance-ineligible under the same missing Cloudflare
`media` authority. #42 is Operations, #45 is Runtime, and #129–#133 are Final
Closure tickets whose positive acceptance still shares unresolved #126/50B and
the preserved #50A boundary despite #127 being closed. All other unresolved
tickets have an open direct or transitive prerequisite.

#37 / Ticket 26 is therefore selected as the sole primary: its direct and
transitive prerequisites are closed, it is the earliest remaining Foundation
enabler, every acceptance gate is locally executable, and it requires no
browser, runtime deployment, or secure provisioning authority.

Ticket 26 initial independent review found three gaps: kebab-case alone allowed
invented variants, deleting an answer-mode row could evade exact coverage
validation, and fixture validation ignored scoring mode. Remediation added
canonical family-variant allowlists, the exact 32-row researched
profile/family/variant set, scoring-mode fixture comparison, and regressions for
all three failures.

Final Ticket 26 proof: focused suite 17/17 pass; base validator CLI exits 0;
release validator CLI exits 1 until supported rows register; scoped ESLint
passes; `git diff --check` passes; independent re-review returns `PASS`.
Workflow wiring runs the focused tests and base validator on relevant pull
requests and pushes to `main`. No browser, deployment, or secure provisioning
gate is required.

### Post-Ticket-26 graph and Foundation pause — 2026-07-24

After #37 closed, all 112 live issue bodies were refetched and complete
transitive prerequisite chains recalculated for every unresolved ticket: 99
`OPEN`, 13 `CLOSED`, 309 unique edges, zero missing references or cycles, and
topological traversal `112/112`.

Selection artifact:
`artifacts/prd0062-selection-20260724-post-ticket26.json`

#38–#41 are newly graph-clear with equal leverage 66. #38 is the earliest
candidate, but a fresh `http://localhost:5174` student runtime reports missing
all required `VITE_FIREBASE_*` web-config fields, so its browser gate is not
executable. #39 and #40 share that blocker family. #41 requires existing
media/auth bindings and shares the unavailable Cloudflare media authority with
#29 and #35.

- Owner: local Firebase web-config authority.
- Required action: provide valid student dev-server `VITE_FIREBASE_*` values
  without committing secrets.
- Evidence: fresh runtime console reports missing `apiKey`, `authDomain`,
  `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId`.
- Impact: #38–#40 cannot begin acceptance or close.

#42 is Operations, #45 is Runtime, and #129–#133 are Final Closure. No
independent acceptance-ready Foundation root/enabler remains with a different
blocker family, so selection pauses rather than violating roadmap phase order.

### Firebase browser-gate restoration and Ticket 23 selection — 2026-07-24

The local Firebase blocker was re-audited through authenticated `gcloud`.
Project `temp-a1437` is active; Firebase, Hosting, and Identity Toolkit are
enabled; and the auto-created browser key permits `http://localhost:5174/*`.
The public SDK configuration was inherited in memory from the already verified
5173 runtime into a new 5174 process. No value was printed, written, or
committed.

Fresh browser proof loaded `/student` as `student@test.com` with zero console
errors. Because the blocker changed, all 112 live issue bodies were refetched
and every unresolved transitive chain recalculated: 99 `OPEN`, 13 `CLOSED`,
309 unique edges, zero missing references or cycles, and topological traversal
`112/112`.

Selection artifact:
`artifacts/prd0062-selection-20260724-post-ticket26-firebase-restored.json`

#38–#40 now have executable local/browser gates and equal downstream leverage
66. #38 / Ticket 23 is selected as the sole primary because it is the earliest
Foundation enabler. #29, #35, and #41 remain blocked by Cloudflare media/auth
authority; later roadmap phases remain ineligible.

### Ticket 23 acceptance pause — 2026-07-24

Ticket 23 implementation and local acceptance are materially complete, but the
required browser gate is not executable. The live prerequisite graph remains
unchanged at 112 tickets, 99 `OPEN`, 13 `CLOSED`, 309 edges, zero missing
references/cycles, and topological traversal `112/112`; #38 remains the sole
primary and is not closed.

- Owner: #73 / Ticket 22B Book Runtime shell lane.
- Required action: close #73's own #54/#72/#36 prerequisites, implement and
  expose `BookRuntimeShell`, then run Ticket 23's structured and source-assisted
  choice/text-entry proof at `http://localhost:5174` on desktop and mobile.
- Evidence: live #73 is `OPEN`; its published contract owns
  `src/components/book-runtime/BookRuntimeShell.tsx`, but no such source path
  exists in the current checkout. Current browser proof reaches the student
  dashboard only. Ticket 23's 10-file focused suite passes 35/35, coverage
  validation passes 32/32, scoped ESLint and `git diff --check` pass, and the
  production build passes with bundle budget OK. TypeScript reaches only the
  unrelated local harness `src/test/test-utils.tsx:51` TS2742. Independent
  re-review returns `PASS` with no remaining code defect.
- Impact: #38 cannot satisfy its mandatory shell/browser acceptance gate and
  cannot close. Do not select a descendant or shared-blocker downstream ticket.

### Post-Ticket-23 blocker audit and Ticket 02 selection — 2026-07-24

Fresh authenticated graph rebuild remains `112` tickets, `99` `OPEN`, `13`
`CLOSED`, `309` edges, zero missing references/cycles, and topological traversal
`112/112`; complete transitive chains were calculated for every unresolved
ticket.

Selection artifact:
`artifacts/prd0062-selection-20260724-ticket02.json`

#29 and #35 are graph-clear but acceptance-ineligible because required
Cloudflare media/B2 authority is unavailable: x64 Wrangler media profile
requires a missing `CLOUDFLARE_API_TOKEN`. #38–#40 share the unavailable #73
Book Runtime shell browser gate; #41 shares Cloudflare/runtime authority.
#42 belongs to Operations. #129–#133 remain Final Closure and share the
preserved #50A/#126 boundary.

#45 / Ticket 02 is selected as the sole Foundation primary. Direct and
transitive prerequisites #25 and #44 are formally CLOSED; downstream leverage
is `85`; teacher browser port `5173` and local verification are executable;
#50A remains all-six-deny/default-deny and no capability activation is needed.

### Ticket 02 deployment-auth pause — 2026-07-24

Ticket 02 implementation, local browser proof, focused tests, build, and
independent review pass. Firebase Hosting preview deployment succeeds at
`https://kahut1--prd0062-ticket02-20260724-0760tbq0.web.app`; unauthenticated
clean-load has zero console errors. Authenticated Teacher quick-login succeeds
against local production preview on `http://localhost:4173`.

- Owner: Firebase Identity Toolkit/API-key and Hosting preview-domain
  authority.
- Required action: make Firebase Auth accept deployed preview origin
  `https://kahut1--prd0062-ticket02-20260724-0760tbq0.web.app`, then rerun
  authenticated Teacher proof.
- Evidence: remote Teacher quick-login still returns
  `auth/requests-from-referer-https://kahut1--prd0062-ticket02-20260724-0760tbq0.web.app-are-blocked`;
  browser-key referrers were read, preserved, and updated with exact origin
  plus wildcard. Local production preview reaches Materials.
- Impact: deployment acceptance lacks production-equivalent authenticated
  proof. #45 remains `OPEN`; no issue close or commit. No independent
  Foundation candidate has different executable gates: #29/#35/#41 need
  unavailable Cloudflare media authority, #38–#40 need #73 shell, and #42 is
  Operations.

Blocker artifact:
`artifacts/prd0062-ticket02-blocker-20260724.json`

### Ticket 02 final authenticated preview proof — 2026-07-24

The prior preview referrer blocker was resolved without changing the 50A
capability boundary. Firebase Auth `authorizedDomains` readback includes the
exact preview hostname, and an Identity Toolkit probe carrying that Referer
reaches authentication and returns `INVALID_LOGIN_CREDENTIALS` for deliberately
invalid probe credentials rather than a referrer-blocked response.

Fresh authenticated Chrome proof:

- preview Teacher quick-login reached `/lobby` as `Teacher Test`;
- fresh preview PDF and Materials deep links both resolved to `/lobby` with
  `Book editing is disabled for this rollout.`;
- preview deep-link checks had zero console errors in fresh tabs;
- the result preserves 50A all-six-deny/default-deny and its safe rollback
  behavior.

Fresh local `http://localhost:5173` Teacher proof:

- PDF deep link `book-mrw4oxr3` rendered the distinct `PDF Book` read-only
  Assembly shell, with `Continue to upload` disabled and no materials editor
  controls;
- Materials deep link `book-mryups3d` rendered the normal Materials Book editor
  with `Overview`, `Content`, and `Settings`, plus `Save` and `Request review`;
- both fresh direct-route checks had zero console errors.

The one exploratory click on the generic Materials-list `Edit` action for a
legacy fixture exposed an unrelated deployed `TestEditor` `questions.length`
runtime error; it was not the owned Book-mode route. Fresh direct-route tabs
for both mode paths were clean and are the authoritative Ticket 02 proof.

Ticket 02 is now acceptance-ready for formal GitHub closure. No 50A capability
was enabled, no 03B behavior changed, and no repository commit has been made
before live issue closure.

### Ticket 04 final closure evidence — 2026-07-25

Ticket 04 / GitHub #29 was reselected as the sole Foundation primary after a
fresh 112-ticket transitive dependency graph. Its direct and transitive
prerequisites were formally CLOSED; the selection snapshot records graph
frontier, candidate rejection reasons, roadmap phase, leverage, acceptance
readiness, and authority. The #25/#118 generated-rule boundary remains
preserved. #50A remains all-six-deny/default-deny and #03B remains disabled.

Final implementation and remediation proof:

- Materials/source-capacity domain paths preserve immutable Source Version
  identity, bounded normalized display filenames, trusted CAS transactions,
  replacement overlap accounting, provider-total derivation, RTDB-safe keys,
  and fail-closed state validation.
- Browser Firebase Web SDK transactions were removed from the canonical ledger
  path. The trusted backend REST adapter uses service-account OAuth and ETag
  compare-and-set.
- New account state must be provisioned from trusted provider reconciliation;
  caller-supplied initial capacity is not accepted. Firebase omission of an
  empty operations map is normalized to the canonical empty map.
- Reservation and completion recheck trusted time inside the CAS callback.
  Exact-expiry, future, pre-reservation, invalid-clock, expired-completion, and
  persisted out-of-window completion cases fail closed.
- Root focused suites: 5 files, 29 tests passed. Worker suites: 3 files, 22
  tests passed. Firebase emulator rule proof: 2 tests passed, including the
  actual deny branch. Scoped root and Worker TypeScript checks passed;
  focused ESLint passed; production Vite build passed for 9,332 modules; the
  bundle budget passed with root entry 233 KB and public preloads within
  budget.
- Independent re-review after all remediation: no actionable findings.

Trusted remote proof:

- Google service account
  `book-source-worker-runtime@temp-a1437.iam.gserviceaccount.com` uses the
  database-only `roles/firebasedatabase.admin` platform role; code restricts
  the Worker read to the canonical `book_source_upload_accounts/book_b2_primary`
  path. The newly created key ID is
  `50bb67a49bca9560aa9fe5f780ea2f34a35b0cc7`; no key value is recorded here.
- The canonical RTDB row was read as null only after independently confirming
  the configured B2 account totals were zero, then provisioned with revision
  zero, zero tracked bytes, zero temporary bytes, and no operations. Firebase
  readback showed the expected empty-map omission; the Worker normalization
  handles that representation.
- Exact current source deployment:
  `luyentap-book-source-capacity-s0`, version
  `446d72f6-5f6f-4060-bc71-00064506e052`, live response
  `{ "state": "complete", "status": "healthy" }` at
  `https://luyentap-book-source-capacity-s0.iamhuwng.workers.dev`.
- Approved rollback drill remains proven: enabled version
  `3783f566-a1b0-45cd-bbba-8481e0d9f2bb` was healthy; disabled version
  `ee5db07b-7abc-4690-b10f-d2f70909d75f` returned 503/unavailable; restored
  version `52c2a930-f15a-4706-a63b-ce1db48cba3a` returned healthy. The latest
  exact deployment is healthy after the final source normalization.
- All 11 required Cloudflare secret names are present. Secure combined-secret
  scan checked 8 credential values and found zero repository matches.

Ticket 04 is acceptance-ready for formal GitHub closure. No 50A capability was
enabled, no 03B behavior changed, and the full 112-ticket goal remains open.

### Ticket 08A final closure evidence — 2026-07-25

Ticket 08A / GitHub #30 was selected as the sole Foundation primary only after
the fresh live 112-ticket graph confirmed that #25, #26, and #29 were formally
CLOSED. The selection snapshot records the complete graph, graph-clear
frontier, candidate rejection reasons, roadmap phase, critical-path leverage,
acceptance readiness, and required authority. No descendant was started while
an ownership or authority boundary remained unresolved. The #25/#118
generated-rule boundary remains preserved; #50A remains all-six-deny/default-
deny and #03B remains disabled.

Final implementation proof:

- Added the immutable Book Delivery v2 binding types and strict schema for
  binding identity/revision/status, issuer and recipient ownership, PDF Book
  publication revision, structural and placement scope, ordered placements,
  activity versions, source strategy and source lifecycle/readiness, contexts,
  and future-live draft-only semantics.
- Added strict recipient-specific public publication projection and a pure
  entitlement factory. Caller objects are cloned; returned authority records
  are recursively frozen; no storage, provider, browser, or capability
  provisioning is performed.
- Added an explicit read-only legacy v1 adapter. It accepts only the exact
  legacy shape, rejects private/unknown/version-2 fields and malformed
  descriptors, and never rewrites legacy records.
- Schema validation is fail-closed for unknown, private, duplicate,
  contradictory, malformed, cyclic, accessor, hidden, sparse, cross-source,
  cross-identity, and invalid page/scope data. Full-PDF bindings require the
  `all` scope; placement scopes require the exact placement set.

Verification:

- Book Delivery suite: PASS, 4 files / 23 tests.
- Scoped root TypeScript: PASS.
- Focused ESLint on all six Ticket 08A files: PASS.
- Production Vite build: PASS, 9,332 modules; bundle budget PASS with root
  entry 233 KB and public preloads within budget.
- Worker dry-run bundle: PASS, 19.25 KiB total / 4.76 KiB gzip; no bindings and
  no remote writes.
- Root TypeScript reaches an unrelated pre-existing harness error at
  `src/test/test-utils.tsx:51` (`TS2742` referencing the preserved linked
  worktree's `@testing-library/dom`). All Ticket 08A paths pass the scoped
  check.
- Independent review after remediation: no actionable findings.

No browser proof was independently required by the published #30 contract.
Rollback is read-only compatibility: stop producing v1 bindings while
immutable records remain parseable; no inferred browser authority is added.
No 50A capability was enabled, no 03B behavior changed, and the full 112-ticket
goal remains open.

### Ticket 08B blocker and independent-primary decision — 2026-07-25

Ticket 08B / GitHub #31 was selected after #30 closure as the earliest trusted
Book Delivery enabler. Its local persistence/lifecycle seam now has immutable
record handling, current-pointer CAS, idempotent operation receipts,
supersession, revocation, bounded recipient resolution, context gating, a
trusted Worker contract, and an owned 08B rule fragment.

Local proof passed:

- Book Delivery focused suite: 30 tests;
- Worker-handler focused suite: 2 tests;
- root scoped TypeScript: PASS;
- Cloudflare-owned TypeScript: PASS;
- WSL Wrangler 4.103.0 dry-run: PASS, 92.60 KiB / 20.06 KiB gzip, no
  bindings, no remote writes.

Formal #31 closure is blocked. The issue requires active deployed-rules and
scoped-service-identity readback before issuance is enabled. That proof belongs
to the unresolved #118 / 09E generated-rule owner. Owner: #118. Required
action: compose and deploy generated Book RTDB rules, then read back the
active rules hash/version and scoped Book Delivery service identity. Impact:
#31 and its trusted-delivery descendants cannot formally close. #35 was
rejected as the same blocker family and was not started.

The fresh post-blocker graph remains complete: 112 tickets, 96 open, 16
closed, 309 edges, zero missing references, zero cycles, and 112/112
topological traversal. #42 / 39A was selected as the sole independent
Foundation enabler because its pure contract has no runtime identity, generated
rules, or mutation authority.

### Ticket 39A final closure evidence — 2026-07-25

Ticket 39A / GitHub #42 was selected as the sole independent Foundation
enabler after #31's #118 blocker was recorded. Its direct and transitive
prerequisites are formally CLOSED; #35 was explicitly rejected for sharing the
same unresolved generated-rules boundary.

Final proof:

- Pure impact classification covers unchanged, display-only, regrade,
  redo-required, add, remove, interaction reorder, placement reorder, move,
  mapping/source context, successor, invalidation, and unsupported effects.
- Frozen old/new inputs remain unchanged. Cross-Book comparisons, malformed
  successor references, and mode changes without an explicit successor fail
  closed.
- Versioned adapter declarations require immutable inputs, supported effects,
  explicit source-replacement policy, answer-safe output, verified conformance,
  current versions, and unique IDs. Missing, uncertain, stale, incompatible,
  duplicate, or authority-bearing declarations are rejected.
- Focused 39A tests: 11 tests passed.
- Consolidated current Book Delivery tests: 30 tests passed.
- Scoped TypeScript: PASS.
- Focused ESLint: PASS.
- Production Vite/bundle proof for the unchanged reachable application surface:
  PASS, 9,332 modules; root entry 233 KB and public preloads within budget.
- No browser proof is independently required. No runtime identity, mutation
  authority, generated rule, secret, or remote state was used.

Rollback disables impact-classification consumers; publications, contexts,
adapter declarations, and delivery state remain unchanged. No 50A capability
was enabled, no 03B behavior changed, and the full 112-ticket goal remains
open.

### Ticket 08B contract-transfer correction and closure evidence — 2026-07-25

The ownership boundary was corrected before #31 closure. The live transfer
ledger is recorded on #31, #35, #59, and #118. #31/#35 retain functional
lifecycle, CAS, authorization, repository, Worker-handler, fragment, negative
test, and domain service-identity work. #118 now explicitly owns generated
`database.rules.json`, complete assembled-rules emulator proof, active hash and
readback, legacy-rule preservation, and the rules rollback artifact. #59 now
explicitly owns live top-level route composition and deployed Worker-to-Firebase
identity integration. Final launch/runtime behavior remains with its existing
owner.

Ticket 08B local implementation proof:

- Immutable Book Delivery records, current pointers, scoped binding indexes,
  recipient/context-bounded resolution, lifecycle CAS, supersession, revoke,
  and durable idempotency receipts are implemented.
- Production repository mutations use one ETag-guarded recipient/context
  scope write for record/current-pointer/operation changes. No broad
  `book_delivery` root scan is used.
- Exact binding indexes resolve a binding to its bounded scope. Malformed,
  oversized, unknown, cross-scope, and invalid persisted data fails closed.
- Replays compare canonical request fingerprints; exact replays return replay
  results and conflicting operation IDs return `idempotency-conflict`.
- The 08B fragment declares browser-deny ancestor roots plus scoped
  service-only descendant boundaries. Fragment-level tests do not claim
  assembled generated-rules enforcement.
- Worker handlers enforce owner identity and active-role authorization,
  reject forged owners and `future_live`, and expose only the domain seams.

Verification:

- Root focused Book Delivery/security suite: 31 tests passed.
- Cloudflare Worker/repository suite: 9 tests passed, including exact-path
  query checks, one-scope CAS transitions, exact/conflicting replay, and
  current-pointer removal on revoke.
- Root scoped TypeScript: PASS.
- Cloudflare-owned TypeScript: PASS.
- Focused ESLint: PASS.
- WSL Wrangler 4.103.0 Worker dry-run: PASS, 99.95 KiB / 21.54 KiB gzip,
  no bindings, no remote writes.

Transferred gates are not claimed here: assembled/generated rules proof,
active rules hash/readback, legacy-path preservation, rules rollback artifact,
live top-level route composition, and deployed Worker-to-Firebase identity
integration remain open under #118/#59. No 50A capability was enabled, no
03B behavior changed, and the full 112-ticket goal remains open.

### Ticket 12C / #35 current closure evidence — 2026-07-25

#35 is the sole selected Foundation primary after a fresh complete graph:
112 tickets, 94 open, 18 closed, 309 edges, zero cycles, zero missing
references, and 112/112 topological traversal. Direct and transitive
prerequisites #34, #33, and #25 are formally CLOSED.

Owned seam progress:

- Activity-candidate stage, reload, validate, replacement save, discard, owner
  authorization, optimistic revision checks, idempotent operation fingerprints,
  and owner-scoped ETag CAS remain Worker/repository-owned.
- Candidate records now retain legacy evidence refs plus separately typed
  `sourceEvidenceRefs` and `answerEvidenceRefs` through stage, reload,
  validation, replacement, and save.
- Discard revalidates retained candidate content and target ownership before
  writing a tombstone; poisoned retained candidates fail closed with no write.
- Student authoring reads remain denied; unrelated-owner reads remain
  owner-scoped and answer-bearing candidate content is not exposed through the
  authoring read seam.
- Repository reads are allowlisted to `users/$ownerId` and
  `book_activity_authoring/owners/$ownerId`; arbitrary database paths fail
  closed.
- `12C.json` declares root browser-deny boundaries plus owner-scoped trusted
  service read/write expressions and least-privilege paths. It does not claim
  assembled generated-rules enforcement.

Current verification:

- Focused root suite: 5 files / 24 tests passed.
- Cloudflare Worker suite: 18 tests passed, including rollback mutation
  disablement with retained owner-read and published-state isolation.
- Focused ESLint: passed.
- WSL Wrangler 4.103.0 dry-run: passed, 21.41 KiB / 5.39 KiB gzip, no
  bindings or remote writes.
- Scoped TypeScript: passed after a safe discriminated-union narrowing fix in
  `src/services/book-rollout/bookRolloutGate.policy.ts`; no #35 source errors.

Ticket 12C / #35 browser closure proof — 2026-07-25:

- Canonical Firebase web-app config was obtained read-only through Firebase CLI
  for project `temp-a1437`; browser used `http://localhost:5173` and the
  repository-mandated teacher quick-login path.
- Browser proof passed in
  `e2e/prd0062-ticket12c-browser.spec.ts`: teacher quick-login; fixture-backed
  candidate stage; page reload and candidate recovery; stale-revision
  conflict; current-revision validation; discard tombstone; published
  activity state unchanged.
- Evidence artifact:
  `artifacts/prd0062-ticket-12c/browser/workflow.json`.
- Root focused suite: 5 files / 24 tests PASS.
- Cloudflare Worker suite: 1 file / 18 tests PASS.
- Focused ESLint PASS; repository TypeScript PASS; production build PASS
  (`9,332` modules; bundle budget PASS); esbuild preflight PASS with host/native
  `0.25.11`, Windows ARM64 package, in-repository resolution, and handshake
  `ok`; `git diff --check` PASS.
- WSL Wrangler dry-run remains PASS from the isolated x64 verification lane.
- Proof boundary remains explicit: fixture-backed browser proof validates #35
  domain behavior only; #118 owns generated/assembled rules proof and #59
  owns live top-level route/identity integration.

Generated/assembled rules, active rules hash/readback, legacy-path
preservation, rules rollback artifact, live top-level route composition, and
deployed Worker-to-Firebase identity integration remain transferred to #118/#59.
No 50A capability was enabled, no 03B behavior changed, and the full 112-ticket
goal remains open.
