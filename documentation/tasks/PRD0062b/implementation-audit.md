# PRD0062b Implementation Audit — 9e Canonical Rebuild

> **AUDIT EVIDENCE ONLY / DO NOT TREAT AS CHECKBOX AUTHORITY**
>
> **2026-07-17 transport correction:** all one-page renderer, rendition, and per-page grant findings below are historical evidence. Current product authority streams one complete pinned student-safe PDF and keeps Page Groups as mapping/navigation metadata.

## Verdict

Packet P1 / Component 01 is `VERIFIED_LOCAL_FAITHFUL`. `T-P2B0-001` is `VERIFIED_REMOTE_FAITHFUL` at its exact prerequisite boundary. Packet P2 / Components 02–03 is `CLOSURE_BLOCKED`: local implementation/review/proof advanced materially, false checked rows were reopened, and deployed Worker/private-R2/browser/P3-consumer gates remain open. Components 04–08, Foundation Pilot, and Full V1 remain open.

Continuation addendum (2026-07-15): C02 `3.3`, `7.2`, and `7.3` are `VERIFIED_LOCAL_FAITHFUL` only. Fresh local Chromium/PDF.js proof establishes acceptable sampled visual fidelity and hostile-source sanitization for one output page. Trusted Unit publication and Book Delivery revalidate canonical source rights; Book Delivery exact-matches the complete allowlist and per-page rendition from the persisted published Unit, accepts one requested page, and excludes grant/private/provider/multi-page authority from its projection. Earlier caller-supplied page-set and cyclic/grant-entrypoint descriptions are superseded by the current trusted graph recorded in the latest P2 evidence. Local `/v1/book-delivery/launch` and `/v1/book-delivery/resources/:grantId`, RTDB current-entitlement/current-pointer resolution, immutable publication resolution, restore invalidation, and the one-way Source provider are implemented and locally tested; they remain undeployed and remote-unproven. C02 `2.5` and `4.4` remain open because deployed rules/public-delivery authority is absent. Only C04 `/runtime/*` routes, production entitlement writer, and remote Worker/R2/browser/recovery/performance/quota/billing proof remain open on that delivery seam. Current real in-app quick logins succeeded; teacher Source PDF still ends `book_source_request_failed_500`; student Public Library still shows `0 materials found` / `No materials found`; route-mocked E2E remains separate.

Packet 3 canonical audit addendum (2026-07-15): the inherited C04 checkbox state was re-audited against the current PRD, live source, and a fresh 7-file/105-test run. Thirty checked leaf rows and checked parents `9.0`/`10.0` were reopened. Accepted C04 leaf coverage is now `42/95` (`44.2%`), not the inherited `72/95` (`75.8%`). Main defects: preview absent from the browser/launcher contract; legacy incomplete projections accepted and synthesized client-side; interaction variants absent; image/audio stimulus rendered as placeholders; one-page page-transition host contract absent; navigator/page-transition tests narrower than task wording; unmount/old-work preservation proof incomplete; Course context absent; result UX does not follow the required attempt-dropdown convention; mobile browser proof remains mocked/unverified. Exact evidence and classifications: `evidence/P3-canonical-audit-20260715.md`. No P3 implementation was performed.

## Audit basis and classification

Authority wording: full task files from `9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd`, with Approved Amendment `043a6d9b1f96a76f200ea753ca353e0376be65a7` winning conflicts. Current dirty docs are evidence only.

- `NOT_STARTED`: required behavior/owner absent; a generic prerequisite does not count.
- `IMPLEMENTED_UNVERIFIED`: relevant implementation/tests exist, but direct accepted proof was not run or boundary proof is missing.
- `VERIFIED_LOCAL_FAITHFUL`: live local implementation directly matches scoped wording and fresh proof passed.
- `VERIFIED_REMOTE_FAITHFUL`: deployed/current state read back and matches. Current accepted row: `T-P2B0-001` only; see `G-P2B0-001`.
- `PARTIAL`: only part of task wording is implemented/proven.
- `OFF_SPEC`: implementation conflicts with recovered/amended requirement.
- `FALSE_CHECKED`: dirty/current checkbox or closure claim exceeds live evidence.
- `SUPERSEDED_BY_APPROVED_AMENDMENT`: clean planning sequencing/grouping conflicts with amendment; underlying product task remains retained.

Parent IDs with mixed child outcomes are `PARTIAL`. Exact wording remains in canonical root Components and Git recovery snapshots. Previous 572 classifications carry only where 9e task wording is unchanged.

## 9e baseline delta audit

Target task tree contains 747 baseline rows: 683 original numeric rows plus `T-P2B0-001`, and 63 new rows. Canonical execution adds one explicit reconciled row, `C04-A-TIMER`, for retained Full V1 timer scope. No original row was removed; 40 rows changed wording and 16 changed checkbox state. Changed/new rows were re-audited against live source, tests, and proof boundaries. Historical remote claims were not inferred; fresh `T-P2B0-001` remote evidence is recorded separately in `G-P2B0-001`.

| Component | `VERIFIED_LOCAL_FAITHFUL` changed/new rows | Open changed/new rows and classification |
|---|---|---|
| C01 | `1.0`–`1.5`, `2.0`–`2.10`, `3.0`–`3.10`, `4.0`–`4.7`, `5.0`–`5.6`, `6.0`–`6.7`, `7.0`–`7.6`, `8.0`–`8.4`, `9.0`–`9.4`, `10.0`–`10.13` | none; all Component 01 rows accepted as `VERIFIED_LOCAL_FAITHFUL` at the P1 proof boundary |
| C02 | `1.1`–`1.4`, `1.6`–`1.8`; `2.4`–`2.8`, `2.10`–`2.12`; `3.4` | `1.5`, `3.5`, `8.6` `PARTIAL`; `2.1`–`2.3`, `2.9`, `6.9`, `6.10`, `7.6` `IMPLEMENTED_UNVERIFIED` |
| C03 | `1.0`–`1.7`, `2.7`, `5.14` | `2.8`, `7.0`, `7.1` `NOT_STARTED`; `2.9`, `2.10`, `5.9`, `5.13`, `8.10` `PARTIAL` |
| C04 | `1.2`, `1.5`; `2.0`–`2.5`; `3.4`–`3.6`; `4.3`, `4.5`, `4.7`; `6.1`; `7.1`, `7.2`, `7.4`; `8.1`–`8.3`, `8.5`–`8.8`, `8.11`, `8.16`; `9.1`, `9.2`, `9.4`–`9.6`, `9.8`; `10.1`–`10.3`, `10.5`; `11.5`; `12.0`–`12.4`; `1.7` | Fresh P3 audit reopened 30 leaf rows plus parents `9.0`, `10.0`; exact `PARTIAL`/`OFF_SPEC`/`IMPLEMENTED_UNVERIFIED` reasons are in `evidence/P3-canonical-audit-20260715.md`. P2 entry, browser, pilot, timer, performance/quota, and deployed proof remain open. |
| C05 | none | `1.7`, `2.7`, `2.8`, `5.11`, `6.4`, `8.8` `NOT_STARTED`; `7.14` `OFF_SPEC` |
| C06 | none | `2.13`, `2.14`, `4.14`, `9.11` `NOT_STARTED`; `7.11`, `7.12` `OFF_SPEC` |
| C07 | `1.4`, `5.18` (bounded local evidence) | `1.2`, `12.7` `NOT_STARTED`; `1.3`, `1.8`–`1.10`, `6.9`, `6.10` `PARTIAL` |
| C08 | `5.18` (bounded local record evidence) | `4.12`, `5.19`, `6.14`, `7.9`, `8.0`, `8.3`, `8.6` `PARTIAL`; `9.8` `NOT_STARTED` |

`[x]` recommendations come only from `VERIFIED_LOCAL_FAITHFUL` rows. `IMPLEMENTED_UNVERIFIED`, `PARTIAL`, `OFF_SPEC`, and `NOT_STARTED` remain open. C04 timer rows receive an explicit retained Full V1 reconciliation note and additive `C04-A-TIMER` row in the canonical task file; 9e V1.1 wording cannot silently delete the retained requirement.

### Delta-proof record

- C01 final packet exit: consolidated 22 files/164 tests; Book UI/regression 4/4, 24/24, 33/33; Firebase emulators 5/5 and 24/24; Worker 14/14; backup/restore 6/6; dependency isolation 2/2; strict focused TypeScript/browser/canonical validator passed.
- C03 foundation: 5 files / 70 passed / 3 skipped; Assembly: 3 files / 18 passed.
- C04 delivery/runtime/launcher fresh audit: 7 files / 105 passed; passing tests support only the 42 retained leaf rows and do not override narrower-than-task or off-spec source behavior. No fresh real browser, remote, deployed, pilot, performance/quota, or timer claim.
- C05/C06 generic legacy tests: 4 files / 29 passed; notification service: 11 passed; no Book Homework/update owner or E2E proof.
- C07 delivery/host local proof: 43 delivery tests and 13 host integration tests passed; only source-delivery ownership row is locally faithful; cross-feature rows remain partial/open.
- Governance command remains historical evidence only: current `npm run check:prd0062` fails retired PRD0062 C02 checked-parent/open-child rows.

## Live workspace inventory

Fresh live snapshot after canonical 9e rebuild:

- Captured during final canonical verification with `rtk git status --porcelain=v1 -uall`, `rtk git diff --cached --name-only`, `rtk git rev-parse HEAD`, and `rtk git rev-list --left-right --count origin/main...HEAD`.
- branch `main`, HEAD `7386a8e5b7a60b8fc07018a9878fad467157266c`;
- upstream `origin/main`; local ahead 10, behind 0;
- collapsed `git status --short`: 215 entries — 115 tracked and 100 untracked path groups;
- expanded `git status --porcelain=v1 -uall`: 428 entries — 115 tracked and 313 individual untracked paths;
- 0 staged; 29 PRD0062b files are within expanded untracked inventory;
- extensive unrelated/user-owned work preserved.

Path-level source of truth is full `git status --porcelain=v1 -uall`; relevant PRD0062 paths are grouped below by owner boundary. Every `documentation/tasks/PRD0062b/*.md` path is newly untracked and owned by this recovery. Every other dirty path remains pre-existing/user-owned or audit evidence only; none was staged, normalized, or edited by this recovery.

PRD0062 implementation groups observed:

| Area | Tracked/untracked live owners | Audit summary |
|---|---|---|
| Activity domain | `src/types/bookActivity.types.ts`, `src/services/book-activity/*`, material catalog integrations, rules/tests | Strong local schema/CAS/projection/diff/scoring; central caller/index/picker integration incomplete/off-spec |
| Source ingress/delivery | `src/services/book-source-delivery/*`, `book-source-processor/**`, `cloudflare/src/book-source-worker/**`, `cloudflare/test/book-source-*`, Worker config | Strong local validation/idempotency/private-boundary code; current local one-page delivery routes/entitlement pointer/publication resolution exist; remote R2/Worker proof and backup remain unresolved |
| Assembly | `src/services/book-assembly/**`, `src/components/books/BookAssemblyWorkspace*`, assembly E2E/tests | Direct JSON import, atomic publish, core PageGroup/Placement model; full reconciliation, page-group editor, prompt copy/revision absent |
| Runtime/results | `src/components/book-runtime/**`, `src/hooks/book-runtime/**`, `src/services/book-delivery/**`, runtime attempt/browser services, M3/M4 E2E | Local renderer/autosave/attempt/result core; preview and payload contract off-spec, timer/metadata/performance/remote gaps |
| Homework/updates | existing generic homework/notification files only | No Book bundle owner, update planner/apply/checkpoint/regrade owner, or M5/M6 browser flow |
| Course/Class/public | catalog projection and partial delivery types only | No exact Book Course/Class placement owner; no public source-rights launch gate |
| Cloud detour | `Dockerfile.book-source-processor`, `scripts/validate-prd0062-cloud-run-runtime-spike.mjs`, dirty M5A docs/config | Unauthorized/superseded direction; do not execute |
| Spark-safe Cloudflare | request-scoped Worker/R2/RTDB code and config | Approved additive direction; local only; production binding/proof still required |

## Master orchestration audit

| Master section | Classification | Evidence / correction |
|---|---|---|
| Purpose, authority hierarchy | PARTIAL | Clean master omits exact amendment reference; PRD0062b restores it as draft |
| Original packet numbering/grouping where it conflicts with amendment §3 | SUPERSEDED_BY_APPROVED_AMENDMENT | Use mapping in streamlined orchestration; component wording retained |
| Mandatory packet contracts | FALSE_CHECKED in dirty plan | Dirty plan risk-scaled sections away; amendment requires all sections |
| Packet 0 baseline/storage/traceability | PARTIAL | Dirty artifacts exist; authority references/statuses drift and implementation inventory incomplete |
| Packet 1 closure | FALSE_CHECKED | Core local tests pass, but capability consumers/index/picker/security-emulator/Worker proof gaps remain |
| Packet 2 closure | FALSE_CHECKED | Dirty remote/private/emulator claims exceed proof; current local one-page delivery control exists but remains undeployed and remote-unproven |
| Packet 3/M2 closure | PARTIAL | Bounded local M2 valid; broad reconciliation/prompt/rendition work open |
| Packet 4/M3–M4 closure | PARTIAL | Bounded local runtime/attempt result proof; Foundation Pilot and remote/browser-performance proof open |
| Foundation Pilot Gate | NOT_STARTED | No faithful one-Unit source→assembly→runtime flow with accepted consolidated proof |
| Packets 5–8 / Full V1 | PARTIAL | A few reusable foundations exist; Book Homework/updates/Course/public/release owners remain absent |
| Current governance | FALSE_CHECKED | `npm run check:prd0062` fails C02 checked parents `7.0` (line 137) and `7.6` (line 143) against open child `7.6c` (line 146) |

## Component 01 — Domain/security foundation

| Classification | Exact baseline IDs | Evidence |
|---|---|---|
| VERIFIED_LOCAL_FAITHFUL | `1.0`–`1.5`; `2.0`–`2.10`; `3.0`–`3.10`; `4.0`–`4.7`; `5.0`–`5.6`; `6.0`–`6.7`; `7.0`–`7.6`; `8.0`–`8.4`; `9.0`–`9.4`; `10.0`–`10.13` | Live central capability/summary/Test Type/Book consumers; fail-closed operational readiness; trusted-only Activity rules; all-index public/mismatch negatives; typed wrapper and legacy seam guards; backup/index inventory; dependency/regression proof; ordered reviews; final browser and packet-exit evidence. |

Non-numeric governance obligations: all eight Component 01 Packet Contract/Closure Addendum rows are `VERIFIED_LOCAL_FAITHFUL`. Canonical status is `VERIFIED`. Remote/deployed proof is not claimed.

Review result: specification review initially blocked public Activity-summary leakage and unsafe missing-projection/version picker/ref paths; corrections passed re-review. Independent code-quality review passed with no blocking finding. Residual risks are recorded in the P1 findings and handoff.

## Component 02 — Source PDF delivery

| Classification | Exact baseline IDs | Evidence |
|---|---|---|
| PARTIAL | parents `1.0`–`8.0`; `1.5`, `2.5`, `3.3`, `3.5`, `3.7`, `3.9`, `3.10`, `7.2`, `8.3` | Local source version/upload/rendition/grant/host/Worker foundations exist, but named child has backup, publish-rights, visual, benchmark/cache, edge, integration, or UX gaps |
| VERIFIED_LOCAL_FAITHFUL | `1.1`–`1.4`, `1.6`; `2.1`–`2.4`, `2.6`, `2.7`; `3.1`, `3.2`, `3.4`, `3.8`; `4.1`–`4.6`; `5.1`–`5.8`; `7.1`, `7.3`–`7.5`; `8.1`, `8.2`, `8.4` | Local immutable metadata, validation, cleanup, allowlist/cache, grant binding/expiry/refresh, integration boundary, redacted events and truthful upload copy pass focused proof |
| IMPLEMENTED_UNVERIFIED | `3.6`, `3.12`; `6.1`–`6.8`; `8.5` | Config/static rules/findings owners exist; deployed/private/emulator/browser proof incomplete |
| NOT_STARTED | `3.11` | Signed-URL expiry plus browser refresh/re-authorization proof absent |
| VERIFIED_REMOTE_FAITHFUL | `T-P2B0-001` | Fresh target-account R2/Worker readback, exact known-object unsigned denial, and mandatory exact-key cleanup; zone-route API read remained `403` and is retained as residual limitation. Evidence: `PRD0062b/evidence/G-P2B0-001-20260713.md` |

Non-baseline dirty governance findings: added IDs `6.9`, `6.10`, and `7.6c`, plus checked current parents `7.0` and `7.6`, do not alter recovered task wording. Their remote/emulator/production closure claims remain `FALSE_CHECKED` because emulator tests are skipped and `7.6c` remains open; the fresh 76/76 dedicated Cloudflare suite does not close those separate claims.

Full Cloudflare production composition remains open: `BOOK_SOURCE_PDF_PROCESSOR` binding absent; local filesystem/in-memory adapters cannot prove production R2/rendition/grant behavior. Cloud Run/Build implementation direction is `OFF_SPEC`/superseded.

## Component 03 — Book Assembly Workspace

| Classification | Exact baseline IDs | Evidence |
|---|---|---|
| VERIFIED_LOCAL_FAITHFUL | `1.0`–`1.7`; `2.1`–`2.3`, `2.5`, `2.6`; `3.1`–`3.3`, `3.5`–`3.7`; `4.0`–`4.8`; `5.4`–`5.6`, `5.10`; `6.2`–`6.5`; `8.1` | Unit taxonomy/validation, direct JSON import, strict validation, stable-key core, atomic publish and route attachment pass focused local proof |
| PARTIAL | parents `2.0`, `3.0`, `5.0`, `6.0`, `8.0`; `2.4`, `5.11`, `6.1`, `8.2` | Candidate generation, unresolved blocking, real authorized preview, full workspace surface incomplete |
| NOT_STARTED | `5.1`–`5.3`, `5.8`, `5.9`, `5.12`; `7.0`–`7.8` | Required three-column reconciliation/source replacement/approval and prompt-copy/revision service/UI/tests absent |
| OFF_SPEC | `5.7` | Direct cross-Unit selection exists without explicit move-resolution contract |
| FALSE_CHECKED | `3.4` | Dirty task state is checked, but no full page-group mapping editor exists |
| IMPLEMENTED_UNVERIFIED | `8.3`–`8.9` | UI/actions/accessibility/announcement/typed/findings source and tests exist, but component/browser/typecheck proof was not freshly accepted |

Non-numeric governance finding: bounded `VERIFIED_LOCAL_M2` evidence cannot close broad Component 03.

Direct JSON file/drop import is valuable additive work and must remain. It does not supersede prompt-copy or revision-prompt requirements.

## Component 04 — Activity Runtime

Current authoritative audit: [`evidence/P3-canonical-audit-20260715.md`](evidence/P3-canonical-audit-20260715.md).

| Classification | Current IDs / boundary | Evidence |
|---|---|---|
| `VERIFIED_LOCAL_FAITHFUL` | `1.2`, `1.5`; `2.0`–`2.5`; `3.4`–`3.6`; `4.3`, `4.5`, `4.7`; `6.1`; `7.1`, `7.2`, `7.4`; `8.1`–`8.3`, `8.5`–`8.8`, `8.11`, `8.16`; `9.1`, `9.2`, `9.4`–`9.6`, `9.8`; `10.1`–`10.3`, `10.5`; `11.5`; `12.0`–`12.4`; `1.7` | Fresh source inspection plus 7 files/105 tests. Local-only boundary. |
| Reopened `PARTIAL` / `IMPLEMENTED_UNVERIFIED` | `1.1`, `1.6`; `3.1`, `3.9`; `4.1`, `4.2`; `5.1`, `5.2`, `5.4`–`5.6`, `5.8`, `5.9`; `6.2`, `6.3`, `6.5`, `6.6`; `7.3`; `8.4`, `8.9`, `8.12`, `8.13`, `8.15`; `9.3`; `10.4`, `10.6`; parents `9.0`, `10.0` | Implementation or tests cover only a narrower behavior than current wording. |
| Reopened `OFF_SPEC` | `1.4`, `3.2`, `3.3`, `9.7` | Legacy projection synthesis, missing interaction variants, and noncanonical result UX conflict with current authority. |
| Already open | `1.3`, `1.8`, `1.9`; `3.0`, `3.7`, `3.8`; `4.0`, `4.4`, `4.6`; `5.0`, `5.3`, `5.7`, `5.10`; `6.0`, `6.4`; `7.0`, `7.5`–`7.8`, `C04-A-TIMER`; `8.0`, `8.10`, `8.14`; `10.7`; `11.0`–`11.4` | P2 entry, missing implementation, accessibility/browser, pilot, timer, performance/quota, or deployment proof. |

Adjacent off-spec implementation: the autosave hook still emits nonzero USD-per-write planning estimates. Current authority permits zero-billed/quota evidence, not a nonzero monetary budget. C04 `8.14` remains open.

<a id="component-05--book-homework"></a>
<a id="component-05-book-homework"></a>
## Component 05 — Book Homework

| Classification | Exact baseline IDs | Evidence |
|---|---|---|
| NOT_STARTED | `1.0`–`1.6`; `2.0`–`2.4`, `2.6`; `3.0`–`3.5`; `4.0`–`4.10`; `5.0`–`5.10`; `6.0`–`6.6`; `7.0`–`7.13`; `8.0`–`8.7`; `9.5` | No `book_activity_bundle` discriminator, Book manifest/schedule/progress/integrity adapter/UI/service owner, or M5 E2E |
| PARTIAL | `9.0` | Legacy regressions pass, but required Book-specific findings owner row `9.5` is absent |
| VERIFIED_LOCAL_FAITHFUL | `2.5`, `9.1`–`9.4` | Existing non-Book homework create/list/detail/schedule regressions pass |

Generic integrity code permits auto-submit/nullification; Book-specific signals-only adapter is absent. This is not a Book task implementation and must not be reused without amendment-compliant force-off behavior.

Non-numeric governance finding: Component 05 packet contract and closure addendum are `NOT_STARTED`.

<a id="component-06--updatescheckpointsnotifications"></a>
## Component 06 — Updates/checkpoints/notifications

| Classification | Exact baseline IDs | Evidence |
|---|---|---|
| NOT_STARTED | `1.0`–`1.7`; `2.0`–`2.12`; `3.0`–`3.6`; `4.0`–`4.13`; `5.0`–`5.11`; `6.0`–`6.8`; `7.0`–`7.10`; `8.0`–`8.7`; `9.0`–`9.10`; `10.1`, `10.2`, `10.5` | Semantic diff prerequisite exists, but no affected-homework lookup/planner/apply/checkpoint/regrade/Book notification owner or M6 E2E |
| PARTIAL | `10.0` | Generic regressions exist, but Book audit/findings owners do not |
| VERIFIED_LOCAL_FAITHFUL | `10.3`, `10.4` only for generic legacy behavior | Generic Bell and homework surfaces pass local regression tests; no Book update semantics |

Non-task adjacent finding: RTDB notification rule permits any authenticated writer; generic metadata/link is unbounded; legacy homework uses `alert()`/one-off banners. These are `OFF_SPEC` security/announcement boundaries, not second classifications for Component 06 numeric IDs.

Non-numeric governance finding: Component 06 packet contract and closure addendum are `NOT_STARTED`.

<a id="component-07--cross-feature-deliveryresults"></a>
## Component 07 — Cross-feature delivery/results

| Classification | Exact baseline IDs | Evidence |
|---|---|---|
| VERIFIED_LOCAL_FAITHFUL | `2.3`; `6.1`, `6.7`; `7.1`–`7.4`; `11.1`, `11.3`; `12.1`, `12.2` | Local exact-version rejection, immutable attempts, placement completion, result visibility/private Solo filtering, disabled Live and launcher boundaries pass |
| PARTIAL | parents `1.0`–`7.0`, `9.0`, `11.0`, `12.0`; `1.1`, `1.6`, `1.7`; `2.2`, `2.5`; `3.1`; `4.1`, `4.2`; `5.1`–`5.8`; `6.3`–`6.5`; `7.8`; `9.1`, `9.2`, `9.4`; `11.4`; `12.5` | Solo/local-Homework foundations only; exact context matrix and public delivery incomplete |
| IMPLEMENTED_UNVERIFIED | `12.3`, `12.4` | Legacy result/Course tests exist but full relevant run/direct Book placement proof absent |
| NOT_STARTED | `1.2`–`1.5`; `2.1`, `2.4`; `3.2`–`3.7`; `4.3`–`4.6`; `5.9`; `6.2`, `6.6`, `6.8`; `7.5`–`7.7`; `8.0`–`8.8`; `9.3`, `9.5`, `9.6`; `10.0`–`10.8`; `11.2`; `12.6` | No full Delivery APIs, Course/Class placement, grouping/fork warnings, Content Catalog seam, public rights gate, Live data contract, or reconciled findings |

<a id="component-08--full-v1-validationhardeningrelease"></a>
## Component 08 — Full V1 validation/hardening/release

| Classification | Exact baseline IDs | Evidence |
|---|---|---|
| VERIFIED_LOCAL_FAITHFUL | `3.8`; `5.7`–`5.10`, `5.14`; `10.1`–`10.4`, `10.6` | Dependency boundaries, bounded local runtime/accessibility tests, and post-release exclusion proof |
| PARTIAL | parents `1.0`–`5.0`, `10.0`; `1.1`–`1.9`; `2.3`, `2.6`; `3.11`; `4.10`; `5.4`, `5.13`; `10.8`, `10.9` | Incomplete path inventory/security/observability/regression/browser/attempt grouping coverage |
| IMPLEMENTED_UNVERIFIED | `2.1`, `2.2`; `3.1`–`3.7`, `3.9`; `4.1`–`4.9`; `5.1`–`5.3`, `5.17`, `5.18` | Route/registry/test/spec files exist, but full accepted run/ledger/browser proof absent |
| NOT_STARTED | `1.10`, `1.11`; `2.5`, `2.7`; `3.10`, `3.12`; `4.11`; `5.5`, `5.6`, `5.11`, `5.12`, `5.15`, `5.16`; `6.0`–`6.13`; `7.0`–`7.8`; `8.0`–`8.3`, `8.6`; `9.0`–`9.7`; `10.5`, `10.7` | Public rights, Book notifications/checkpoints, representative books, acceptance reconciliation, release notes and obsolete-parser proof absent |
| OFF_SPEC | `2.4`, `8.4` | Shared announcements not used consistently; worktree cannot satisfy dirty-path closure |
| FALSE_CHECKED | `8.5` | Live governance fails, so dirty diff/UTF-8/guardrail closure is not faithful |

Non-numeric governance finding: broad completion/header claims exceed live source/docs/tests agreement.

## Accepted additive hardening to preserve

- strict bounded/lossless validation and fail-closed unsupported fields;
- CAS, expected revision, concurrency rejection, immutable versions/IDs;
- idempotency keys, replay/collision defense, request-scoped authority;
- private R2 boundary, exact object keys, no public original/full PDF;
- cleanup-pending/tombstone/abort behavior;
- direct JSON file/drop import;
- immutable provenance and student-safe projection separation;
- accessibility labels/mobile overflow foundations;
- performance/cost instrumentation hooks, while measured budgets remain open;
- Spark-safe Cloudflare direction as proposed additive planning choice, not deployed fact;
- append-only findings with historical/current/superseded/open labels.

<a id="fresh-verification-evidence"></a>
## Fresh verification evidence

All commands ran from repository root unless cwd says otherwise. No test mutated cloud state.

| Scope | Command summary | Runner/config | Exit / executed | Claim boundary |
|---|---|---|---|---|
| C01 domain | Vitest, 15 explicit Activity/material test files | Vitest 3.2.4 | 0; 15 files/101 tests | Local domain only |
| C01 catalog integrations | Vitest, 8 registry/summary/test-type files | Vitest 3.2.4 | 0; 8 files/51 tests | Revealed missing amendment consumers despite green scope |
| C01/C02 rules | 3 security files | Vitest 3.2.4 | 0; 4 pass/11 skip | Emulator authority unproven; `FIREBASE_DATABASE_EMULATOR_HOST` unset |
| C02 local | `node node_modules/vitest/vitest.mjs run --config vitest.book-source-local.config.mjs --reporter=dot` | Vitest 3.2.4 | 0; 21 files/144 pass/5 skip | Local only; skipped request-scope emulator tests |
| C02 Cloudflare full (historical) | `npm --prefix cloudflare run test:book-source` | Vitest 4.1.9 / book-source config | 1; 75 pass/1 fail | Historical result before JSONC boundary-test repair; not current full-suite proof |
| C02 Cloudflare private boundary | cwd `cloudflare`; `rtk npx vitest run --config vitest.book-source.config.mjs test/book-source-private-boundary.test.js` | Vitest 4.1.9 / dedicated book-source config | 0; 1 file/31 tests | Fresh local boundary only; broader Cloudflare suite remains unclaimed |
| C02 Cloudflare excluding boundary test (historical) | cwd `cloudflare`; focused Vitest exclusion | book-source config | 0; 7 files/45 tests | Historical diagnostic only; exclusion cannot close full suite |
| C03 Assembly | `npx vitest run --config vitest.book-assembly-local.config.mjs --reporter=dot` | Assembly config | 0; 4 files/16 tests | Local bounded core |
| C04/C07 runtime | five focused shell/hook/delivery/attempt files | Vitest | 0; 5 files/71 tests | Local runtime/result core |
| M3/M4 local host | two book-source-processor integration files | book-source local config | 0; 2 files/17 tests | File/in-memory local adapters, not deployed Worker |
| C05/C06 legacy | Activity diff + homework manager | Vitest | 0; 2 files/17 tests | Generic/prerequisite only |
| C05 legacy UI | Homework create/list/detail files | Vitest | 0; 5 files/31 tests | Non-Book regression only |
| Notification Bell | focused component test | Vitest | 0; 4 tests | Generic Bell only |
| Governance | `npm run check:prd0062` | Node checker | 1 | C02 `7.0 -> 7.6c` and `7.6 -> 7.6c` errors |
| Checker unit tests | `node --test scripts/__tests__/check-prd0062-governance.test.mjs` | Node test | 0; 22/22 | Checker logic works |
| Diff whitespace | `git diff --check` | Git | 0 | Workspace diff syntax only |

Cloudflare authoring Worker test also hit `Error: Unsupported platform: win32 arm64 LE` before loading project tests. Classified local harness failure, not product PASS/failure.

<a id="accepted-local-evidence-map"></a>
### Accepted local evidence map

Each row maps only `VERIFIED_LOCAL_FAITHFUL` ranges. Quoted titles are exact test titles. `PARTIAL`, `IMPLEMENTED_UNVERIFIED`, `NOT_STARTED`, `OFF_SPEC`, and `FALSE_CHECKED` rows rely on named source gaps and are not promoted by this table.

| Component / IDs | Exact test files and titles | Command/config and result | Boundary |
|---|---|---|---|
| C01 `1.1`, `1.2`, `1.4`, `1.5` | `materialCapabilityRegistry.service.test.ts`: “exposes M3 interactive-activity placement, immutable resolution, and launch as one coherent capability”, “keeps legacy behavior explicit without inventing registry adapters”, “rejects incomplete registry coverage”; `bookActivityBookIntegration.service.test.ts`: “rejects invalid structural shapes through the central capability boundary” | C01-E1 below; exit 0, 12 files/81 tests | Local registry/core only; C01 `1.3` remains `OFF_SPEC` |
| C01 `2.0`–`2.10`; `3.0`–`3.10` | `activitySchema.service.test.ts`: “generates internal Activity identity outside editable JSON”, “rejects mixed interaction families and multiple answer rules”, “rejects hidden Interaction IDs in editable JSON and preserves IDs only for exact-structure-safe revisions”; `activityCandidate.service.test.ts`: “validates declared Activity schema without semantic guessing or silent generation” | C01-E1; exit 0 | Local schema/identity/candidate only |
| C01 `4.0`–`4.7` | `activityAuthoring.service.test.ts`, `activityAuthoring.publish.test.ts`, `activityPublish.service.test.ts`: “publishes immutable Activity versions and rejects version mutation” | C01-E1; exit 0 | Local repository/CAS; no remote Worker claim |
| C01 `5.1`–`5.5` | `activityProjection.service.test.ts`: “generates exact student-safe projection without answers or author-only fields”, “strips unknown fields at every canonical level, including unfamiliar nested answer data” | C01-E1; exit 0 | Local projection; emulator negative row remains unverified |
| C01 `6.0`–`6.7` | `activityDiff.service.test.ts`: “classifies Activity changes into no-redo regrade and redo-required outcomes”; `activityScoring.service.test.ts`: “scores opaque matching identities, not display labels” | C01-E1; exit 0 | Local semantic diff/scoring |
| C02 `1.1`–`1.4`, `1.6`; `2.1`–`2.4`, `2.6`, `2.7`; `3.1`, `3.2`, `3.4`, `3.8`; `4.1`–`4.6`; `5.1`–`5.8`; `7.1`, `7.3`–`7.5`; `8.1`, `8.2`, `8.4` | `sourceVersion.service.test.ts`: “creates immutable complete metadata at deterministic private paths”; `sourceRendition.service.test.ts`: “canonicalizes exact allowlists, allows gaps, and rejects duplicates/out-of-range”; `sourceGrant.service.test.ts`: “issues safe grant, authorizes exact binding, expires, revokes, and rejects replay”; `pdfLibSourceAdapter.test.ts`: “counts ordinary, scanned/image-only, rotated, landscape, and mixed-size pages without OCR”; `sourceDeliveryOperationalEvents.test.ts`: “keeps serialized records free of crafted sensitive values and keys” | `node node_modules/vitest/vitest.mjs run --config vitest.book-source-local.config.mjs --reporter=dot`; exit 0, 21 files/144 pass/5 emulator skips | Local/file/in-memory adapters only; production and emulator rows remain open |
| C03 `1.0`–`1.7`; `2.1`–`2.3`, `2.5`, `2.6`; `3.1`–`3.3`, `3.5`–`3.7`; `4.0`–`4.8`; `5.4`–`5.6`, `5.10`; `6.2`–`6.5`; `8.1` | `bookAssemblyCore.service.test.ts`: “enforces source bounds, exact page partition, duplicate keys, and tree cycles”, “parses typed bundle without permanent IDs and rejects malformed/type/size/encoding/hidden IDs”, “keeps exact stable-key identity through rename/reorder; title match stays suggestion”; `unitPublish.service.test.ts`: “publishes structured Unit, Activity records, placements, and safe projection in one aggregate write”, “blocks source-assisted publication and failed trusted ID generation leaves no permanent records”; `bookAssemblyFirebaseRules.test.ts`: “denies direct browser writes and student/public projection reads” | `npx vitest run --config vitest.book-assembly-local.config.mjs --reporter=dot`; exit 0, 4 files/16 tests | Local core/rules parsing; UI `8.3`–`8.9` downgraded unverified |
| C04 `1.2`, `1.4`–`1.6`; `2.0`–`2.5`; `3.1`–`3.6`, `3.9`; `4.1`–`4.3`, `4.5`, `4.7`; `5.1`, `5.2`, `5.4`–`5.6`, `5.8`, `5.9`; `6.1`–`6.3`, `6.5`, `6.6`; `7.1`–`7.4`; `8.1`–`8.9`, `8.11`–`8.13`; `9.0`–`9.8`; `10.0`–`10.6`; `11.5`; `12.0`–`12.4` | `BookRuntimeShell.test.tsx`: “renders all five student-safe interaction families and keeps responses in the runtime”, “accepts only mapped direct pages, supports navigator focus, and keeps reference pages answer-free”, “preserves desktop collapse state and mobile tab state without viewport-local storage”; `useBookActivityRuntime.test.tsx`: “debounces 1.5 seconds and coalesces response edits”, “never overlaps save requests for one placement”, “keeps duplicate activity placements independent”; `activityRuntimeAttempt.service.test.ts`: “submits idempotently, scores authoritatively, enforces operation and attempt limits” | cwd repo; `npx vitest run src/components/book-runtime/BookRuntimeShell.test.tsx src/hooks/book-runtime/useBookActivityRuntime.test.tsx src/services/book-delivery/bookDelivery.service.test.ts src/services/book-delivery/bookDelivery.browser.test.ts src/services/book-activity/activityRuntimeAttempt.service.test.ts --reporter=dot`; exit 0, 5 files/71 tests | Local runtime only; no live browser/deployed Worker |
| C05 `2.5`, `9.1`–`9.4` | `homeworkManager.test.ts`: “creates class-target homework, resolves assigned count, and strips undefined title fields”, “combines direct and class homework for a student while filtering exemptions”, “extends a deadline and recalculates status”; `HomeworkCreateModal.test.tsx`: “creates a Reading Passage set from selected passage summaries” plus student/teacher list/detail test files | cwd repo; `npm exec vitest run src/services/book-activity/activityDiff.service.test.ts src/services/homeworkManager.test.ts --runInBand` (exit 0, 2 files/17 tests); `npm exec vitest run src/components/homework/HomeworkCreateModal.test.tsx src/pages/StudentHomeworkListPage.test.tsx src/pages/StudentHomeworkDetailPage.test.tsx src/pages/TeacherHomeworkDetailPage.test.tsx src/pages/TeacherHomeworkListPage.test.tsx --runInBand` (exit 0, 5 files/31 tests) | Existing non-Book regression only |
| C06 `10.3`, `10.4` | `NotificationBell.test.tsx`: “renders bell icon”, “subscribes to notifications on mount”, “shows badge when unread notifications exist”, “opens panel on click”; generic homework list/detail tests | cwd repo; `npm exec vitest run src/components/notifications/NotificationBell.test.tsx --runInBand` (exit 0, 1 file/4 tests); same five-file homework UI command in C05 row (exit 0, 5 files/31 tests) | Generic regression only, not Book update behavior |
| C07 `2.3`; `6.1`, `6.7`; `7.1`–`7.4`; `11.1`, `11.3`; `12.1`, `12.2` | `bookDelivery.service.test.ts`: “delivers exact published Unit, pinned Source/Activity versions, rendition, grant, and one snapshot read”, “rejects stale rendition pages or source pin before granting access”; `activityRuntimeAttempt.service.test.ts`: “excludes solo results and only exposes owned homework; unresolved fails closed”, “snapshots Homework feedback release and withholds student score and responses until released” | cwd repo; exact five-file runtime command in C04 row (exit 0, 5 files/71 tests); `npx vitest run --config vitest.book-source-local.config.mjs book-source-processor/test/m4-book-activity-runtime.integration.test.ts book-source-processor/test/book-delivery-host.integration.test.ts` (exit 0, 2 files/17 tests) | Solo/local-Homework only; Course/public/remote absent |
| C08 `3.8`; `5.7`–`5.10`, `5.14`; `10.1`–`10.4`, `10.6` | `bookActivityDependencyBoundary.test.ts`: “keeps Book Activity independent from legacy PDF parser paths”; `BookRuntimeShell.test.tsx`: “preserves desktop collapse state and mobile tab state without viewport-local storage”, “renders explicit shell states and fails closed for unavailable source context”; `activityRuntimeAttempt.service.test.ts`: “saves/loads exact context, isolates placements, and rejects stale binding writes”, “excludes solo results and only exposes owned homework; unresolved fails closed” | cwd repo; C01-E1 exact command and C04 exact five-file runtime command; both exit 0 | Bounded local hardening only; no release/browser/remote closure |

C01-E1 exact fresh command, cwd repository root, Vitest 3.2.4:

```powershell
rtk node node_modules/vitest/vitest.mjs run src/services/materialCatalog/materialCapabilityRegistry.service.test.ts src/services/materialCatalog/bookActivityBookIntegration.service.test.ts src/services/book-activity/activitySchema.service.test.ts src/services/book-activity/activityCandidate.service.test.ts src/services/book-activity/activityAuthoring.service.test.ts src/services/book-activity/activityAuthoring.publish.test.ts src/services/book-activity/activityPublish.service.test.ts src/services/book-activity/activityProjection.service.test.ts src/services/book-activity/activityDiff.service.test.ts src/services/book-activity/activityScoring.service.test.ts src/services/book-activity/activityStorage.service.test.ts src/services/book-activity/bookActivityDependencyBoundary.test.ts --reporter=dot
```

Result: exit 0; 12 files, 81 tests executed. This supersedes the earlier non-reproducible 15-file aggregate for accepted C01 local claims.

## Governance/count reconciliation

User-supplied established note reported 12 core authority files, `1,253/684`, 0 original numeric IDs missing, 79 added, 43 wording changes, 184 checkbox changes. Fresh live methodology found:

- same conceptual 12-file set (PRD, architecture, master, Components 01–08, traceability): `+1300/-680`;
- numeric regex: 260 baseline unique IDs, 295 current, 0 missing, 35 added;
- wording heuristic: 238 same-ID/reference lines differ;
- checkbox totals: baseline 979 (80 checked), current 902 (335 checked), raw diff +350/-422.

Counting scopes: recovered Components 01–08 contain 683 numeric checkbox IDs plus `T-P2B0-001`, 684 total, all represented in component matrices above. Checkbox totals 979/902 use the task/master/traceability checklist set; `+1300/-680` uses the separately named 12 core authority files. Numeric unique-ID comparison uses baseline/current task-reference text and must not treat amendment section headings as task IDs.

These counts disagree because methodology and/or live dirty state changed. Audit does not normalize them. Exact file-set, regex, checkbox parsing, and semantic wording definition must be frozen before any count becomes governance authority. Both agree on critical facts: no recovered numeric task ID disappeared; many unapproved additions/wording/check states exist.

## Drift and quality findings

1. Current authority system lacks exact amendment reference and cites incomplete baseline lineage.
2. Mandatory packet sections were weakened despite amendment §1.
3. Cloud Run/Build detour is unauthorized/superseded.
4. Spark-safe Cloudflare direction is approved, but still needs real production binding/readback before deployment claims.
5. C02 remote/emulator/private-boundary checkbox claims are false or partial.
6. C03 bounded M2 work is valuable; header/taskbox language must not imply full Component closure.
7. C04 local runtime is valuable; preview, projection, autosave identity, source labels, timer, and pilot proof remain open/off-spec.
8. C05/C06 Full V1 owners are absent.
9. Notification RTDB write authority and one-off announcement patterns are security/UX drift.
10. Public catalog projection is not public source-assisted rights/launch delivery.

## Residual risks

- No live browser verification performed in this recovery audit; existing E2E evidence uses local deterministic hosts/adapters.
- No Firebase emulator proof accepted for skipped suites.
- No deployed Worker/R2/Firebase readback or rollback proof.
- Worktree remains broad and unsafe for feature correction without explicit file fencing.
- PRD0062b itself remains draft even after structural tests.

## Packet P2 live audit addendum — 2026-07-13

This section supersedes older C02/C03 counts and classifications where live code or final proof differs.

| Component | Verified local/emulator rows | Reopened false checked rows | Closure blockers |
|---|---|---|---|
| C02 | `2.1`, `2.9`, `6.1`, `6.3`, `6.9`, `6.10`, `8.5`, plus previously checked pure/local rows not reopened | `4.0`, `4.2`, `4.5`, `5.0`–`5.8`, `7.5` | Missing production PDF processor/rendition/grant/resource route; deployed Worker/R2/expiry-refresh/browser/backup proof; performance/cost evidence |
| C03 | `2.4`; `3.0`, `3.4`; `5.1`, `5.3`, `5.7`, `5.8`; `7.0`–`7.8`; `8.2`, `8.3`, `8.5`–`8.9`; `2.8`, `2.9`, `8.10` | `4.0`, `4.4`, `6.4` | Trusted source-preview approval, complete reconciliation previews/blocking, production authorized Unit preview, focus management, and deployed published-only producer projection for P3; P3 consumer implementation is not a P2 blocker |

Independent specification/trust review blocked absent production source delivery and untrusted preview approval; focused re-review passed the approval correction and retracted an overbroad upload-path finding after distinguishing dev monolith from production split upload. Independent code-quality review found six local blockers plus four residuals on re-review. The local blockers were corrected and affected Assembly proof passed: 8 files/38 tests, UI 12 tests, root TypeScript, and responsive Playwright. Remote findings remain closure blockers, not waived requirements. Full command accounting: `evidence/P2-closure-20260713.md`.

### Packet P2 continuation audit — 2026-07-15

Current candidate production path is `cloudflare/src/book-source-worker/**` with two explicit modes: bounded direct legacy PDF.js range reads from private R2 for trusted page counting, and Browser Run/PDF.js for sanitized one-page rendition output. Count mode does not launch or reserve Browser Rendering. The split is not accepted as no-cost production until quota, billing, performance, and deployed proof pass. Historical `book-source-processor/**`, whole-document `pdf-lib`, Node child-process, and Cloud Run references remain prototype or superseded evidence only; they are not current production dependencies or authority.

Fresh post-edit proof passed Assembly-local 8 files/41 tests, Workspace UI 19 tests, focused Cloudflare renderer/production Worker 2 files/4 tests, root and Worker typechecks, PRD0062 governance, and PRD0062b canonical validation. Route-mocked teacher E2E passed 1 test. Real in-app teacher flow reached Source PDF but failed `book_source_request_failed_500`, so no production Assembly/source browser claim is accepted.

Earlier checked-parent/`7.6c` PRD0062 findings describe historical drift. Current `npm run check:prd0062` passes 35 files/116 anchors/9 task lists. P2/P3 ownership is also reconciled: P2 must leave a deployed and tested published-only producer interface; C04 `1.3` validates that interface as the P3 consumer and does not block P2 closure.

### Packet P2 trusted-authority continuation — 2026-07-15

The local caller-authority defect recorded for C02 `4.4` is corrected at the browser/Worker boundary. Browser requests no longer carry Source Version or Unit page-set authority. The Assembly Worker derives the complete set from the persisted current candidate for teacher preview; Unit publication derives it inside the publication transaction; default/public Source Worker Unit rendition routes are disabled; only a dedicated trusted service-binding Entrypoint reaches one-page rendering. Strict RPC/PDF/request/output bounds and publish-conflict recovery negatives pass.

Both independent re-reviews pass this local patch under the explicit trusted-service-binding threat model. Exact fresh commands and counts are in `evidence/P2-closure-20260713.md`.

Classification does not change to closed: C02 `2.5`/`4.4` remain open for deployed/public/rules evidence, C02 `7.3` remains local-only, and C03 published-only student delivery rows remain open. Historical state at this review point lacked canonical current-entitlement wiring and therefore hard-denied grant authorization; the current reconciliation below supersedes that implementation statement. No deployment, cloud mutation, staging, commit, or push occurred.

### Packet P2 current reconciliation — 2026-07-15

Current marks are local-only classifications except the explicitly recorded remote Source count canary. C02 `2.4` is remotely proven through direct PDF.js range counting; Browser Run/PDF.js remains the separate one-page rendition path. C02 `2.5` and `4.4` remain open remote/public-delivery rows. C02 `7.3` is accepted only as a local one-page producer projection. Current graph is acyclic: browser -> main `r2-upload-signer` -> one-way `BookSourcePageProviderEntrypoint`; main owns entitlement/publication/rights revalidation and ephemeral grant DO; Source owns no Assembly or entitlement authority. C04 `/runtime/*` routes and the production entitlement writer remain open P3/C05.

Every launch/resource rechecks active record/current entitlement pointer/profile, immutable publication, Book status, current Source rights, full page allowlist, and exact page rendition. Restore revokes active entitlements and clears pointers; DO grants are not backup authority. Future P3/C05 issuer must select `current_published_units`, derive entitlement from immutable publication, and atomically activate/supersede the current pointer.

Current proof snapshot: Cloudflare 20 files/127 PASS; root `tsc --noEmit` PASS; Cloudflare `tsc -p tsconfig.book-source.json --noEmit` PASS; lifecycle validator PASS; root focused seam 14 files/169 PASS; Source-local 13 files/92; Assembly 8 files/46; UI 1 file/19; backup/restore 6 files/23; Firebase emulator 3 files/14, with Assembly static rules covered inside the Assembly suite. Root parser rejects source-required projections with `source: null`, requires structured projections to carry a source resource, enforces read-only Solo/Homework actions, rejects unordered/duplicate/misbound placements/pages, rejects unsafe/noncanonical metadata and timestamps, rejects mismatched printed labels, rejects malformed/oversized/non-PDF resource bodies, and compares canonical page unions independent of numeric order. Renderer result values: one page; `19,892` output bytes; MAE `0.1280517578125` text and `1.4471435546875` image; encrypted/corrupt rejected; no full GET; source hash unchanged; visual artifacts inspected acceptable. Real browser quick logins succeeded on teacher/student ports; teacher Source PDF ends `book_source_request_failed_500`, student Public Library search returns `0 materials found` / `No materials found`; pre-existing console warnings remain; no mutation; route-mocked E2E remains separate.

Firebase Hosting endpoint resolution is fixed: `VITE_BOOK_DELIVERY_WORKER_URL` -> `VITE_R2_UPLOAD_WORKER_URL` -> governed deployed Worker; one-page resource remains same-origin. R2 rendition puts use fixed-length `Uint8Array`. Preserve `presentationMode` separate-approval blocker; C03 status may remain `CLOSURE_BLOCKED` and no checkbox changes are implied.
