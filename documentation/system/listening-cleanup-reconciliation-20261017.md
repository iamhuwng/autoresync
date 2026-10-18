# Listening temporary cleanup: preserved pending reconciliation

Status: **NOT MERGED INTO THE LIVE RECONSTRUCTION**. The seven origin/main-only commits establish a separate historical implementation; ancestry does not establish that its behavior belongs to the currently deployed app. No deployment proof tying this cleanup implementation to the October 6 live release was established during this review.

The reconstructed candidate at `7a44284efae29be0762f0bdc55692db90ff26475` preserves the October 6 source donors. Read-only inspection found that this candidate lacks the cleanup-specific cancel-session HTTP route/client, uploader AbortSignal propagation and builder cleanup lifecycle, leased bounded sweep module/checkpoints, and cleanup tombstone lifecycle from the main-only chain. That is a source comparison, not a production defect or evidence that these changes should be deployed.

The separately retained commits are `db6845c5`, `6658ddf8`, `bdd35ec3`, `653f7c92`, `ba2c7835`, `69754098`, and merge `3d72f11c`. The historical design keeps the sweep disabled by default and removes raw object keys from cleanup tombstones. Any future reconciliation must preserve those controls, compare later Listening/storage changes, and review Worker routes/bindings, RTDB rules and ancestor boundaries, backup/restore handling, client lifecycle, and tests together. Do not replace shared Worker, rules, or storage files wholesale with their historical versions.

No source, configuration, security rules, Functions output, backup/restore implementation, dependency tree, backend data, or remote service was changed for this review. No functional tests, Worker dry-run, emulator tests, or browser flows were executed because this slice records pending work only. Fresh live evidence is required before selecting implementation or deployment work.

## Exact historical net scope

Generated from `git diff --name-only db6845c5^ 69754098`; the merge adds no separate implementation beyond this 48-path net change. These paths are an inventory, not an apply/staging allowlist.

- `cloudflare/src/upload-worker/listening-authoring/repository.ts`
- `cloudflare/src/upload-worker/listening-upload-session-contract.ts`
- `cloudflare/src/upload-worker/listening-upload-session-grant.ts`
- `cloudflare/src/upload-worker/listening-upload-session-repository.ts`
- `cloudflare/src/upload-worker/listening-upload-session-sweep.ts`
- `cloudflare/src/upload-worker/listening-upload-session-types.ts`
- `cloudflare/src/upload-worker/listening-upload-session.ts`
- `cloudflare/test/listening-authoring-worker.test.ts`
- `cloudflare/test/listening-upload-session-bridge.test.ts`
- `cloudflare/worker.js`
- `cloudflare/wrangler.jsonc`
- `database.rules.json`
- `documentation/architecture/upload-storage-authority.md`
- `documentation/ielts-reading-v2-listening-unification-implementation-log.md`
- `functions/lib/listening-authoring/repository.firebase.js`
- `functions/lib/listening-authoring/repository.firebase.js.map`
- `functions/lib/listening-authoring/repository.firebaseLegacyFirstEdit.js`
- `functions/lib/listening-authoring/repository.firebaseLegacyFirstEdit.js.map`
- `functions/lib/listening-authoring/repository.firebaseLifecycle.js`
- `functions/lib/listening-authoring/repository.firebaseLifecycle.js.map`
- `functions/lib/listening-authoring/repository.firebasePublish.js`
- `functions/lib/listening-authoring/repository.firebasePublish.js.map`
- `functions/lib/listening-authoring/repository.firebaseVersions.js`
- `functions/lib/listening-authoring/repository.firebaseVersions.js.map`
- `functions/lib/listening-authoring/repository.shared.js`
- `functions/lib/listening-authoring/repository.shared.js.map`
- `functions/src/listening-authoring/repository.firebase.ts`
- `functions/src/listening-authoring/repository.firebaseLegacyFirstEdit.ts`
- `functions/src/listening-authoring/repository.firebaseLifecycle.ts`
- `functions/src/listening-authoring/repository.firebasePublish.ts`
- `functions/src/listening-authoring/repository.firebaseVersions.ts`
- `functions/src/listening-authoring/repository.shared.ts`
- `r2-backup-worker/src/backup/auto-backup.test.ts`
- `r2-backup-worker/src/backup/auto-backup.ts`
- `r2-backup-worker/src/restore/restore-execute.test.ts`
- `r2-backup-worker/src/restore/restore-execute.ts`
- `src/__tests__/security/prd0056a-upload-session-rules.emulator.test.ts`
- `src/__tests__/security/prd0058-media-asset-rules.emulator.test.ts`
- `src/features/assessment/listening/storage/listeningUploadSessionApi.ts`
- `src/services/r2Storage.test.ts`
- `src/services/r2Storage.ts`
- `src/services/r2UploadClient.test.ts`
- `src/services/r2UploadClient.ts`
- `src/skills/listening/builders/ListeningTestBuilder.test.tsx`
- `src/skills/listening/builders/ListeningTestBuilder.tsx`
- `tasks/0058-prd-r2-asset-lifecycle-registry-reconciliation-cleanup-delivery.md`
- `tasks/findings-of-tasks-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`
- `tasks/traceability-0055-prd-ielts-reading-v2-listening-unified-assessment-platform.md`

## 2026-10-18 reconciliation candidate — release blocked

The historical inventory above remains evidence of the initial review. Source,
tests and configuration have now been selectively ported on
`codex/listening-cleanup-reconcile-20261018`, based on stable main
`42fcf888`. Shared Book and ancestor-rule changes were preserved. This is a
separate draft candidate, not merged main or a deployed cleanup service.

The candidate adds authenticated session cancellation, abort propagation,
reference-protected deletion/tombstones, bounded sweep checkpoints and restore
coordination. The sweeper remains disabled. Current correction tests prevent
unconditional post-upload deletion of referenced bytes, reject restored records
that reference existing deletion tombstones, and report failed sweep scans as
failures. Restore fixtures now implement the real conditional lease protocol;
the stale-lease fixture uses a fixed expired timestamp rather than recalculating
one millisecond ago during each request.

Local proof: 37 actual workerd tests in two files; 95 backup Worker tests in
15 files; 94 retained Functions unit tests in six files; 50 app storage/upload
tests; 25 builder tests; and 15 real RTDB rule tests in three disposable emulator
namespaces. The six changed Functions generated JavaScript files and source maps
match current TypeScript transpilation; this is not a full Functions typecheck
or deployment. Assessment guardrails, result governance, Mantine boundary,
UTF-8 and diff checks passed again after the final review fixes on the full diff.
The owner approved the scoped 4,777-line builder exception in findings.

A full compiled acceptance app used disposable Firebase Auth/RTDB/Firestore at
the enforced acceptance ports. Starting at `http://localhost:5173/login`, the
Teacher quick login reached lobby, created a Listening builder, replaced audio,
removed a section while preserving the renumbered section, and discarded the
editor. Assertions verified cleanup identities and reasons, with no page errors.
Worker HTTP and audio responses were fixture stubs: this does not prove actual
provider upload/delete, save/publish/restore lifecycle, or student playback.
The task-owned Auth acceptance process was stopped afterward; shared local
emulators were preserved. Production build output was not replaced.

Wrangler 4.103.0 dry-run succeeds (5,878.71 KiB). Dependency-free worktree
resolution initially failed on PDF package subpaths; explicit aliases to the
existing locked owner entries corrected tool resolution without an install.
Read-only provider observation at `2026-10-18T02:00:18.640Z` found active upload
Worker version `1392faa9-bfcf-4c98-a0d8-bcea6daab615`, module SHA-256
`be736565f6fe854d48f4a7f22c7db9b7f57369215404f99ad5645c8a1fee73f8`.
The generic candidate bundle has not been reconciled against all live Book
dependencies. A successful dry-run is not permission to deploy that bundle.

**Blocking protocol defect:** streaming PUT holds a global, two-minute mutation
lease. Other teachers' create/issue/upload/save/publish operations can fail,
and an already-started PUT may complete after that lease expires. The safety
fix preserves bytes on post-upload errors; if cleanup already reached terminal
state, a late PUT can still leave an object outside terminal cleanup. No partial
TTL or lease-removal workaround establishes upload quiescence.

The next implementation must coordinate per-asset in-flight admission with
cleanup and restore, consume the grant nonce after successful admission, keep
the short reference/tombstone/delete exclusion, and prove writers have settled
before stale reservations are cleared. Add concurrent-teacher, expired-writer,
terminal late-PUT and restore-race proof. Then requalify real provider lifecycle
and isolate generic Worker/rules/backup releases from PDF Book. No live Worker,
rules, database, R2 object, or Hosting release was mutated for this candidate.
No historical taskbox or parent acceptance is closed by these local checks.

## 2026-10-18 per-asset writer correction — still a draft

The streaming global-lease defect above is superseded locally by durable
`system_flags/listening_upload_writers/{assetId}` reservations. Each reservation
contains only writer/session/owner/asset identities and a start timestamp, with
no raw object key or TTL. Admission checks the canonical active session, paired
short leases and deletion tombstones, then conditionally writes the reservation
with restore exclusion in the same system-flags CAS. Both shared leases are
released before nonce consumption and streaming PUT. A busy admission leaves the
grant nonce available for retry. Other teachers can create, issue, upload, save
and publish while one writer remains unresolved.

Only a never-dispatched PUT or a successfully resolved PUT clears its matching
reservation. Generic PUT rejection, disconnect, request cancellation and elapsed
time do not prove settlement. Cleanup first queues the session to close further
admission, then checks the asset's writer under the existing deletion lease.
Pending writers prevent tombstones, byte deletion and terminal cleanup, including
the empty-assets path. Successful late PUT settlement attempts the existing
protected cleanup once; a failed continuation remains queued for retry. Restore
rejects any outstanding or malformed writer map before snapshot/product writes,
including a writer admitted during a failed restore CAS. Backup restore cannot
reintroduce historical writer reservations; stale restore-flag watchdog cleanup
preserves current reservations.

RTDB browser authority is now per non-writer flag: super-admin child and
multi-path flag updates remain allowed, while whole-parent replacement/deletion
and direct/ancestor writer-map mutation are denied. An initial whole-map equality
rule failed the real emulator's ordinary-flag update assertion; the corrected
child boundary passed. App callers contain no whole-parent system-flags writer.

Fresh local proof at this correction: **43/43 actual workerd tests in two files**,
**98/98 backup Worker tests in 15 files**, and **16/16 RTDB rule tests in three
files with the emulator branch executed**. Logs are retained under the canonical
`tmp/deployment-audit-20261017/listening-writer-{worker,backup,rules}.log`.
Worker/backup checks used the existing x64 runtime and locked dependencies; app
rules used native ARM64 Node. The initial x64 app run stopped before discovery
on the ARM64 Rollup dependency. No dependencies were installed. Focused ESLint,
UTF-8 and diff checks passed. Earlier browser/build/provider observations above
were not rerun by this server correction and remain scoped to that earlier tree.

**Remaining release blocker:** a crashed or ambiguous writer has no implemented
proof of quiescence and therefore blocks its own cleanup and all restores
indefinitely. Other authors remain usable. Age and HEAD 404 must never reclaim
it: [Cloudflare's consistency contract](https://developers.cloudflare.com/r2/reference/consistency/#negative-reads-and-in-flight-writes)
states that a negative read does not settle an earlier unknown PUT, which can
still commit later. No safe crash-recovery claim, provider lifecycle acceptance,
deployment, merge, taskbox closure or PDF Book rollout follows from these tests.
Scheduled sweep remains explicitly disabled.

## Recovery proposal — owner policy decision pending

Independent review proposes a new, isolated key namespace with create-once audio
PUTs. Every audio write would use `If-None-Match: *`; cleanup would retain an
empty guard object at the same key and a permanent database tombstone. This is
a design proposal, not implemented or qualified behavior. Each cleaned asset
would leave one storage object and one database record indefinitely; payload
size zero does not remove operation, metadata or maintenance costs.

The safety argument follows [R2's conditional-write contract](https://developers.cloudflare.com/r2/reference/consistency/#conditional-writes):
conditions are evaluated against committed state at write commit. A guard that
occupies the key prevents a delayed create-once audio write from replacing it.
The [Workers binding](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations)
accepts conditional headers and returns `null` when the PUT condition fails.
This proposed protocol still needs actual binding and lifecycle tests.

Before dispatching a guard write, cleanup must persist `guard-pending` after
reference exclusion. Only positive guard-write/HEAD evidence can advance it to
`guarded`; never clear by age or HEAD absence. Neither state may be removed by
restore, lifecycle rules or purge tooling. A matching committed audio object
can settle a writer only when no pending/guarded tombstone exists. Recovery
must run before the existing referenced-asset early exit, and restore must
reject pending guards even without a writer reservation.

Old unconditional PUTs do not obey this fence. A separate v2 namespace and
signed protocol identity are required; deploying or waiting for expiry does
not settle an old in-flight request. Older ambiguous writers remain unresolved
without independent settlement evidence. Provider lifecycle exclusions,
all key validators and deletion paths, backup resurrection, lease expiry and
delayed storage completion require qualification before release. No current
43/98/16 test result establishes this unimplemented recovery protocol.

The owner has been asked whether to accept permanent markers or defer this
cleanup draft while completing stable. No retention choice or deployment
authorization is inferred from this proposal.

The owner subsequently acknowledged the recommendation to finish stable with
this Listening cleanup draft kept separate. Permanent-marker implementation is
not included; sweep remains disabled and this draft is not approved for release.
