# Contract: PRD0062 Packet 2A Source PDF Delivery

Status: PLANNED. Packet 2A discovery/contract/spike-plan only; production Packet 2 is not started.
Created: 2026-07-10

Primary authority: `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md` sections 6, 15, 24, 31, 33, and 35.

## Mission Ledger

```text
ORIGINAL MISSION: Prepare safe Source PDF Delivery implementation packet.
CURRENT SLICE: Packet 2A discovery, contract, owner map, PDF-engine spike plan, proof plan, handoff.
PHASE STATE: PLANNED.
IN SCOPE: Documentation and read-only repository discovery only.
OUT OF SCOPE: Production upload, rendition, grants, Worker routes, R2 config, rules, UI, runtime, Assembly, Packet 3+.
COMPLETION BOUNDARY: Contract ready for Packet 2B/2C planning; no product behavior claimed.
SEPARATE APPROVAL GATES: Packet 2B upload skeleton; Packet 2C disposable engine spike; Packet 2D rendition/grants; Packet 2E rules/remote proof/closure.
CURRENT BLOCKERS: Private R2 bucket/binding and deployed Worker suitability unproven; PDF engine unselected; no Book Delivery/Unit Page Group authority exists yet.
NEXT DEPENDENCY: Execute isolated spike before production rendition code; decide private bucket/binding from remote evidence.
NON-ACTIONS: No legacy parser imports; no OCR/content extraction; no promise against screenshot, recording, print/save, or cameras.
```

## Entry State And Dirty Classification

Commands ran at Packet 2A start, all exit `0`:

- `rtk git status --short --branch`: `main...origin/main [ahead 7]`.
- `rtk git status --short --untracked-files=all`.
- `rtk git rev-parse HEAD`: `84167ea5cc3195689b8f3baebaa50fa0cbe50e9f`.
- `git diff --name-only`.
- `git diff --cached --name-only`: empty.

Every pre-edit dirty/untracked path is classified below. `owned by Packet 2A` means docs edited by this packet; all others remain preserved.

| Exact paths | Classification | Action |
|---|---|---|
| `AGENTS.md`; `README.md`; `package.json`; `playwright.config.js`; `src/__tests__/setup.ts`; `vitest.config.ts`; `vitest.scripts.config.ts` | user-owned unrelated work | must-not-touch |
| `documentation/rules/infrastructure.md` | pre-existing unstaged infrastructure authority update | read as required Packet 2A rule; must-not-touch |
| `database.rules.json`; `r2-backup-worker/src/backup/data-backup.ts`; `r2-backup-worker/src/backup/data-backup.test.ts`; `r2-backup-worker/src/restore/restore-execute.ts`; `r2-backup-worker/src/restore/restore-execute.test.ts`; `src/services/materialCatalog/materialIntegrationRegistry.ts`; `src/services/materialCatalog/materialSummaryPort.service.ts`; `src/types/materialCatalog.types.ts`; `src/__tests__/security/bookActivityFirebaseRules.test.ts`; `src/types/bookActivity.types.ts`; `src/services/book-activity/activityCandidate.service.ts`; `activityCandidate.service.test.ts`; `activityDiff.service.ts`; `activityDiff.service.test.ts`; `activityProjection.service.ts`; `activityProjection.service.test.ts`; `activityPublish.service.ts`; `activityPublish.service.test.ts`; `activitySchema.service.ts`; `activitySchema.service.test.ts`; `activityScoring.service.ts`; `activityScoring.service.test.ts`; `bookActivityDependencyBoundary.test.ts`; `src/services/materialCatalog/bookActivityBookIntegration.service.ts`; `bookActivityBookIntegration.service.test.ts`; `materialCapabilityRegistry.service.ts`; `materialCapabilityRegistry.service.test.ts` | pre-existing Packet 1 closed implementation/test work | must-not-touch; report verified defect instead of reopening |
| `documentation/tasks/PRD0062/contracts-book-activity-packet-1.md`; `handoff-book-activity-packet-0.md`; `handoff-book-activity-packet-1.md`; `storage-design-book-activity-packet-0.md`; `traceability-book-activity-v1.md`; `findings-book-activity-baseline.md`; `tasks-book-activity-01-domain-security-foundation.md` | pre-existing Packet 0/1 authority work | preserve; only Packet 2A cross-reference updates allowed |
| `documentation/tasks/PRD0062/contracts-book-activity-packet-template.md` | pre-existing untracked template | must-not-touch |
| `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`; `tasks-book-activity-03-book-assembly-workspace.md`; `tasks-book-activity-04-activity-runtime.md`; `tasks-book-activity-05-book-homework.md`; `tasks-book-activity-06-updates-checkpoints-notifications.md`; `tasks-book-activity-07-cross-feature-delivery-results.md`; `tasks-book-activity-08-pilot-hardening-release.md`; `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md` | pre-existing master/PRD or Packet 3+ planning work | must-not-touch |
| `documentation/tasks/PRD0062/tasks-book-activity-02-source-pdf-delivery.md`; `documentation/tasks/PRD0062/contracts-book-activity-packet-2.md`; `documentation/tasks/PRD0062/handoff-book-activity-packet-2A.md`; Packet 2A additions in findings/traceability | owned by Packet 2A | docs-only reconciliation |
| `documentation/tasks/PRD0062/handoff-book-activity-packet-2B0.md`; Packet 2B0 evidence additions in this contract/findings/traceability | owned by Packet 2B0 | docs-only remote-boundary evidence; no source implementation |
| `documentation/tasks/PRD0062/authority-reference-system.md`; `findings-packet-2B0-private-r2-boundary.md`; `handoff-book-activity-packet-2B0-1.md`; Packet 2B0.1 reference additions in contract/findings/traceability/task list | owned by Packet 2B0.1 | docs-only authority-reference structure and current harness evidence; no source implementation |

## Production Owner And Storage Decision

Decision: **split model**. Canonical Source Version and rendition metadata use RTDB below `book_source`; delivery grants are **Worker-only, opaque, short-lived signed capabilities**, never a browser-readable RTDB/Firestore grant ledger. Firestore is rejected for Packet 2 because it would add a second canonical product, index/rules/backup surface, and has no Book Activity precedent. Native R2 presigned URLs are rejected: current primary R2 binding does not support them.

| Concern | Exact production owner | Contract |
|---|---|---|
| Types | `src/types/bookSource.types.ts` | Source Version, internal page index/teacher-safe label mapping, rendition state, delivery claim; no private key/token in client-safe types. |
| Canonical metadata | `book_source/source_versions/{bookId}/{sourceVersionId}`; `book_source/source_renditions/{sourceVersionId}/{renditionId}` | RTDB. Browser direct reads/writes false. Immutable identity, owner/book/source checksum/bytes/page count/rights confirmation/internal R2 key. Mutable operational status/error/retry/cache fields only through trusted path. |
| Teacher-safe metadata | `book_source/owner_projections/{bookId}/{sourceVersionId}` | RTDB safe projection or Worker response only: label, checksum/byte/page count, lifecycle/rights/rendition status. Never private R2 key, token, source URL, full PDF, answer-key page, or teacher-only page mapping. |
| Source metadata service | `src/services/book-source-delivery/sourceVersion.service.ts` | Enforces immutable create/new replacement version. Does not expose private key to student projection. |
| Upload/version completion | `src/services/book-source-delivery/sourceUpload.service.ts`; new isolated Worker module `cloudflare/src/upload-worker/book-source-upload.ts`; route registration `cloudflare/worker.js`; binding/config `cloudflare/wrangler.jsonc` | Must use new private bucket/binding or proven private prefix. Never `PUBLIC_URL`, generic public upload, or browser-selected key. Trusted completion calculates checksum/bytes/page count only. |
| PDF boundary | `src/services/book-source-delivery/pdfExcerptAdapter.ts` | Backend-only page-set input/output interface. No prohibited parser path, OCR, or semantic extraction. Disposable spike implementation stays outside production owners until selection evidence accepted. |
| Rendition/cache | `src/services/book-source-delivery/sourceRendition.service.ts`; isolated Worker module `cloudflare/src/upload-worker/book-source-rendition.ts` | Canonicalize source version + allowed physical-page set + options cache key. Only selected allowlist pages; immutable output; retry idempotent; delete temporary failed output. |
| Delivery grants | `src/services/book-source-delivery/sourceGrant.service.ts`; isolated Worker module `cloudflare/src/upload-worker/book-source-delivery.ts`; route registration `cloudflare/worker.js` | Issue URL capability only after authenticated Book Delivery resolver authorizes current student/book/unit/source version/page set. Content request validates signature/expiry/claims; refresh re-runs authorization. No original key, full PDF, answer-key/teacher-only page, or R2 authority reaches browser. |
| Rules/security | `database.rules.json`; `src/__tests__/security/bookSourceFirebaseRules.test.ts` | Browser direct canonical read/write false. Teacher owner/admin may read only owner-safe projection; students cannot list/read canonical metadata, private key, token, URL, or grant ledger. Rules are not written in 2A. |
| Worker/R2 tests | `cloudflare/test/book-source-delivery-worker.test.ts`; `cloudflare/__tests__/book-source-upload-worker.test.js`; `cloudflare/package.json`; `cloudflare/wrangler.jsonc` | Reuse Listening delivery pattern only as precedent, not its asset graph or paths. |
| Backup/restore | `r2-backup-worker/src/backup/data-backup.ts`; `r2-backup-worker/src/restore/restore-execute.ts`; their focused tests; `r2-backup-worker/src/backup/media-delta.ts` | Add `book_source` as a required snapshot/restore node, then prove source fixture recovery. Add private source/rendition prefix to media-delta coverage or document distinct bucket backup lifecycle before implementation. |

Hard storage boundary: current `kahoot-media` has public `r2.dev` configuration. It is **not** approved for source originals/renditions until remote evidence proves a separate non-public bucket/binding or equivalent direct-object denial. Generic `r2Storage`/`r2UploadClient` public URLs are forbidden for this feature.

## Security And Rules Contract

| Boundary | Required positive proof | Required negative proof |
|---|---|---|
| Source version | owner/admin management metadata read; trusted completion creates immutable version | student/cross-owner read; browser write; private key/token/full-PDF URL field injection denied |
| Rendition | authorized current delivery resolves one allowlisted Unit excerpt | modified Book/Unit/source version/page range; answer-key/teacher page; duplicate/retry cache corruption denied |
| Capability URL | authorized student opens Worker-served excerpt before expiry | wrong student/book/unit/assignment/source/page set; tamper/replay/expiry; stale binding refresh denied |
| R2 | Worker reads private original/rendition | direct R2 object request and public URL path denied; browser never receives object key or R2 credential |
| Full source | teacher trusted management remains separate | student full original request, arbitrary range, and version replacement denied |

Browser classification: Packet 2A has no UI and needs no browser proof. Packet 2D/2E must run browser proof only for expiry/refresh interaction; it cannot replace Worker/rules/R2 security proof. Do not claim capture/print/save/camera prevention.

## Migration And Compatibility

| Existing behavior | Compatibility/rollback contract | Required proof |
|---|---|---|
| Existing public `r2Storage` and generic upload Worker | Never add a source-PDF operation to public URL/key path. New private source boundary is isolated. | Existing R2 upload/listening tests remain green; source direct-object denial proves separation. |
| Existing Book/Packet 1 Activity state | No Packet 1 source/rule reopening. `book_source/*` is new data only and does not alter Activity versions/projections. | Packet 1 focused regression and source owner boundary scan. |
| Failed upload/rendition | Unpublished status only; no partial source becomes publishable. Retry uses idempotency key; cleanup safe temporary objects. | Service/Worker failure and retry tests. |
| Restore | Restore metadata first as `book_source`; original/rendition recovery follows private-bucket lifecycle. No restore mutates an immutable version. | Backup fixture, restore fixture, and post-restore immutability test. |

## PDF Engine Spike Matrix

No production engine selected. Spike runs isolated from production paths, with generated/non-sensitive fixtures and no `src/services/file-extractor/file.extractor.ts` or `src/parsers/pdfParser.js` import/call/wrap.

| Candidate | Deployment fit to prove | Edge cases | Reject when | Required evidence |
|---|---|---|---|---|
| `pdf-lib` page copy | Node-capable isolated runner or Worker-compatible bundle size/memory measured | image-only/scanned, rotated, landscape, mixed sizes, noncontiguous pages, malformed/encrypted, large input | cannot load/copy without forbidden dependency; output corrupt; unsupported encryption behavior unsafe; time/memory beyond Worker limit | output page count/checksum; visual page comparison; deterministic label/index map; elapsed/memory; bundle/deploy proof |
| `qpdf` sidecar/Container | Separate trusted sidecar/Container reachable only from Worker; private R2 stream input/output | same plus password/corrupt/timeout/retry/temp cleanup | requires public source transfer; no operational deployment path; nondeterministic retry/cache | command/version image pin; selected-only output proof; idempotent retry; private-R2 integration dry-run |
| `pdfcpu` sidecar/Container | Same sidecar boundary; static binary/container feasibility | same plus malformed/repaired PDFs | unacceptable fidelity/feature gap; unbounded resource use; no maintained deploy path | repeatable fixture matrix and resource/cost record |
| `MuPDF`/`mutool` sidecar | License review plus sidecar fit | rendering/copy fidelity and page labels | licensing incompatible; only raster/OCR path; output unsuitable | license decision, extraction/fidelity/resource evidence |
| Cloudflare Worker-only custom/WASM | Worker size, CPU, memory, native dependency feasibility | same matrix, especially image-only and large files | requires native binary not supported by Workers; exceeds limits; cannot preserve PDF | Wrangler dry-run and Worker harness evidence |

Mandatory spike rejection criteria for every candidate: public R2 input/output, full-PDF browser delivery, secret/key exposure, prohibited parser reference, OCR/semantic extraction requirement, no deterministic cache identity, no allowed-pages-only proof, no bounded failure/cleanup behavior, or no deployable trusted runtime.

## Test And Proof Contract

| Proof class | Required command or evidence | Closure meaning |
|---|---|---|
| Local service tests | `npm test -- src/services/book-source-delivery/*.test.ts` | immutability, replacement, labels/indexes, cache key/idempotency/retry, stale claims; local only |
| Dependency boundary | extend `src/services/book-activity/bookActivityDependencyBoundary.test.ts` or add focused Book Source test | proposed production owners do not reference forbidden parser paths |
| PDF spike | isolated runner command recorded with fixture hashes/results | engine evidence only; no production selection without pass matrix |
| Worker harness | `npm --prefix cloudflare test -- book-source-delivery-worker.test.ts book-source-upload-worker.test.js` | expiry/refresh re-auth, tamper/replay, wrong claims/range, full-source and direct-private denial logic |
| Wrangler | `npm --prefix cloudflare run check` | config/bundle evidence, not deployed state |
| RTDB rules emulator | `npx firebase emulators:exec --only database "npm test -- src/__tests__/security/bookSourceFirebaseRules.test.ts"` | browser identity authorization and field-shape rules |
| Backup/restore | `npm --prefix r2-backup-worker test -- src/backup/data-backup.test.ts src/restore/restore-execute.test.ts` | source metadata/rendition recovery fixture and retry/rollback state |
| Remote Worker/R2 | recorded deployed Worker version/bindings plus authenticated allow and direct-object/full-source/wrong-claim deny requests | required for live Worker/R2 claims |
| Remote Firebase | recorded deployed-rule/version evidence and real authorized/denied probe | required for live Firebase permission claim |
| Browser | teacher `http://localhost:5173`, student `http://localhost:5174`, dev quick-login only when UI exists | refresh UX only; no security substitute |

Remote-only claims: deployed Worker version/binding, live R2 object/bucket privacy, deployed signed-capability expiry/refresh, and live Firebase/Cloudflare permissions. None are closed locally in Packet 2A.

Rollback/retry proof: failed upload cannot create publishable metadata; retry same idempotency key creates no duplicate version/rendition; failed rendition removes temporary object and leaves cache retryable; expired/stale capability cannot refresh without current authorization; restore fixture recreates metadata without reopening archived/immutable references.

## Authority Reconciliation

| Invariant | PRD | Findings | Traceability | Taskbox | State |
|---|---|---|---|---|---|
| immutable source/private original | 6, 15, 24, 31 | `F-P2-001`; `F-P2B0-001` detail | `P2-GATE-001` / `G-P2B0-001` | `T-P2B0-001`; 1.0, 2.0 | blocked |
| engine adapter/spike before production | 6, 28, 34, 35 | `F-P2-002` | `P2-GATE-002` | 3.0 | blocked pending evidence |
| excerpt-only worker delivery | 15, 24, 31 | `F-P2-003` | `P2-GATE-003` | 4.0, 5.0, 6.0 | blocked on source/page authority and remote proof |
| backup/retry/remote proof classification | 31, 33 | `F-P2-004` | `P2-GATE-004` | 1.5, 2.7, 3.6-3.11, 6.0, 8.0 | planned |

Packet 2A exit: docs-only contract complete. Packet 2 implementation taskboxes remain unchecked. Packet 1 remains CLOSED. Packet 3+ remains unstarted.

<a id="d-p2b0-001"></a>
## Packet 2B0 Private R2 Decision

Status: `BLOCKED`. `kahoot-media`, generic `r2Storage`, generic `r2UploadClient`, `r2.dev`, and native R2 presigned URLs are excluded from Book Source. No private source bucket/binding is approved. Packet 2B upload skeleton cannot start until `G-P2B0-001` has remote proof.

Evidence and blocker detail: [F-P2B0-001 through F-P2B0-004](findings-packet-2B0-private-r2-boundary.md#f-p2b0-001). Current command/auth record: [C-P2B0-003](findings-packet-2B0-private-r2-boundary.md#c-p2b0-003). Current handoff: [H-P2B0-002](handoff-book-activity-packet-2B0-2.md#h-p2b0-002).

<a id="d-p2b0-002"></a>
## Packet 2B0.3 Current Remote-Boundary Decision

Status: `CLOSURE_BLOCKED`. The prior `D-P2B0-001` is historical through Packet 2B0.2. Packet 2B0.3 safely recovered a supported WSL temporary Wrangler runtime, but Cloudflare `whoami` proves the available non-interactive session expired. No environment token/account ID is available. No identity, R2 bucket metadata, Worker status/version/binding, public-path exclusion beyond local source, or direct-object denial is therefore proven. The installed authority-reference system also remains at 2B0.1 records even though 2B0.2 and 2B0.3 records exist; its file is outside this packet's allowed documentation scope.

Decision: keep all Book Source production work blocked. Do not approve `kahoot-media`, public `r2.dev`, `r2Storage`, `r2UploadClient`, native R2 presigned URLs, or any private bucket/binding. No remote mutation is authorized. Packet 2B0 may resume only with a valid existing interactive Wrangler session or a user-provided non-interactive token scoped to the target account for `Workers R2 Storage Read` and `Workers Scripts Read`; it must be used only for read-only discovery and never printed/stored. A direct-object denial probe still needs explicit approval before any remote object mutation.

Backup decision: no source/rendition lifecycle is selected without an identified private bucket. If a later proven private source bucket is distinct, record a separate private-bucket lifecycle; if a proven private prefix shares an approved private bucket, extend `media-delta.ts` prefixes. Do not implement either change in this packet.

Current evidence: [F-P2B0-005](findings-packet-2B0-private-r2-boundary.md#f-p2b0-005), [F-P2B0-006](findings-packet-2B0-private-r2-boundary.md#f-p2b0-006), [F-P2B0-007](findings-packet-2B0-private-r2-boundary.md#f-p2b0-007), [C-P2B0-008](findings-packet-2B0-private-r2-boundary.md#c-p2b0-008), [C-P2B0-009](findings-packet-2B0-private-r2-boundary.md#c-p2b0-009), [C-P2B0-011](findings-packet-2B0-private-r2-boundary.md#c-p2b0-011), and [C-P2B0-012](findings-packet-2B0-private-r2-boundary.md#c-p2b0-012). Current handoff: [H-P2B0-003](handoff-book-activity-packet-2B0-3.md#h-p2b0-003).
