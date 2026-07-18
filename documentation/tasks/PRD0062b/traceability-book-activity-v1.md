# PRD0062b Full-V1 Foundation Traceability

Status: `ACTIVE` — P1 `VERIFIED`; P2 `CLOSURE_BLOCKED`

Canonical wording owners: root Components 01–08 plus the explicit approved replacements in `canonical-task-overrides.json`. This local traceability owner replaces historical PRD0062 execution pointers without modifying them.

## Verified remaining and reopened requirements

| Task ID and full wording | PRD/amendment | Source owner | Exact direct proof title / negative proof | Architecture/current-state | Classification / risk |
|---|---|---|---|---|---|
| 1.0 Extend Material Catalog for generic Activity Materials | Amendment §§2.1, 4.1–4.3; PRD §§9.1, 30, 31.1 | capability/producer/summary/Test Type/Book adapter owners below | Child proofs 1.1–1.5 | Architecture Product/Storage/Current Foundation | `VERIFIED_LOCAL_FAITHFUL`; all children accepted |
| 1.3 Replace any new proposed direct kind checks with capability lookups across picker filtering, publish validation, assignment eligibility, student launch routing, result ownership, and security/student-safe projection decisions. | Amendment §4.1; PRD §§9.1, 31.1 | `materialCapabilityRegistry.service.ts`; `materialBookCapabilityAdapter.service.ts`; `bookActivityMaterialSummary.service.ts`; Book validation/workspace; Activity publish/projection/authoring | “keeps Activity structurally attachable and projection-ready while later operational adapters fail closed”; “keeps legacy picker kinds stable and adds structural Activity without enabling unsupported kinds”; “loads canonical private Activity summaries through capability-driven Book picker filtering”; mutation: injected contradictory registries rejected | Architecture Current Foundation | `VERIFIED_LOCAL_FAITHFUL`; later launch/assignment/result/placement adapters remain unsupported |
| 5.0 Implement student-safe Activity projections | PRD §§24.2–24.4, 31.1/31.9 | projection service + RTDB rules | Child proofs 5.1–5.6 | Storage inventory | `VERIFIED_LOCAL_FAITHFUL`; all children accepted |
| 5.6 Add negative security tests proving students cannot read authoring records directly. | PRD §§24.2–24.4, 31.9 | `database.rules.json`; `bookActivityFirebaseRules.test.ts` | “keeps canonical projections fail-closed until Book Delivery proves student entitlement”; malicious two-student, owner-spoof, parent enumeration | Architecture Storage/Current Foundation | `VERIFIED_LOCAL_FAITHFUL`; emulator only, no deployed rule claim |
| 7.0 Add rules, indexes, backup coverage, and observability for new Activity data | Amendment §§1, 14; PRD §§24–26, 31.9 | storage/rules/backup owners | Child proofs 7.1–7.6 | P1 storage inventory | `VERIFIED_LOCAL_FAITHFUL` |
| 7.1 Identify every new RTDB node or Firestore collection before writing data. | Amendment §14 | `storage-design-book-activity-packet-1.md`; `ActivityAuthoringRoot` | Seven Activity nodes + canonical summary indexes inventoried; no Firestore delta | P1 storage inventory | `VERIFIED_LOCAL_FAITHFUL` |
| 7.2 Add rules for owner-only authoring access and student-safe projection access. | Amendment §§4.1, 14; PRD §24.4 | `database.rules.json` | Owner/admin direct-read; trusted-only writes; canonical projection student denial in actual emulator | P1 storage inventory | `VERIFIED_LOCAL_FAITHFUL` |
| 7.3 Add malicious cross-owner and cross-student read/write tests. | PRD §31.9 | two security emulator tests | Cross-teacher, two-student, owner spoof, parent/ancestor, update/delete, unsafe projection mutations | P1 storage inventory | `VERIFIED_LOCAL_FAITHFUL` |
| 7.4 Add indexes where queries require them. | Amendment §14 | `database.rules.json`; shared summary port | Static rule contract + query inventory; no Firestore index | P1 storage inventory | `VERIFIED_LOCAL_FAITHFUL`; no speculative indexes |
| 7.5 Add backup coverage where required by the repo infrastructure rule. | Amendment §14; infrastructure Rule 12 | R2 backup/restore owners | “includes book_activity, required empty book_source metadata, and book_runtime skeleton in RTDB backup coverage”; “restores book_activity RTDB data through approved restore inventory” | P1 storage inventory | `VERIFIED_LOCAL_FAITHFUL`; local inventory only |
| 7.6 Observability registry is N/A for Packet 1 because no UI routes, user-facing actions, or analytics-emitting workflows were added; service validation/publish/projection events remain pure domain operations until Packet 3+ UI/runtime integration. | Amendment §1; PRD §26 | feature-registry diff scan | No P1 route/action/feature registry mutation; picker uses existing attach/assign actions | Architecture/UI addendum | `VERIFIED_LOCAL_FAITHFUL`; browser proof required only for changed existing picker eligibility |
| 8.0 Enforce typed integration boundaries | Amendment §4.4; PRD §§29–30 | typed Activity/Material adapter owners | Children 8.1–8.4 | Typed boundary finding below | `VERIFIED_LOCAL_FAITHFUL` |
| 8.1 Inventory touched Book/Material Catalog seams that currently use `// @ts-nocheck`. | Amendment §4.4 | inventory: `bookEditor.service.ts`, `materialBooks.service.ts` | static suppression scan | P1 findings | `VERIFIED_LOCAL_FAITHFUL` |
| 8.2 Add a fully typed wrapper or remove the suppression before enforcing new Activity, Placement, manifest, source, or homework invariants through that seam. | Amendment §4.4 | `materialBookCapabilityAdapter.service.ts`; typed `bookValidation.service.ts` | “enforces structural capability before calling the legacy no-check Book editor seam”; workspace persists through typed wrapper | Architecture Book Editor boundary | `VERIFIED_LOCAL_FAITHFUL`; suppressions remain fenced legacy debt |
| 8.3 Prohibit `// @ts-nocheck` in new Book Activity modules. | Amendment §4.4 | Activity/adapter/Worker modules | zero-match suppression scan | P1 findings | `VERIFIED_LOCAL_FAITHFUL` |
| 8.4 Run focused typechecking and tests proving typed boundaries reject invalid contract shapes. | Amendment §4.4; PRD §31.1 | focused TSC + `materialBookCapabilityAdapter.typecheck.ts` | two `@ts-expect-error` invalid-shape mutations; strict focused TSC exit 0 | P1 handoff proof table | `VERIFIED_LOCAL_FAITHFUL` |
| 9.0 Preserve regression boundaries | Amendment §§1, 15; PRD §§28, 31.10 | Book/material/dependency tests | Children 9.1–9.4 | P1 findings | `VERIFIED_LOCAL_FAITHFUL` |
| 9.1 Prove existing Book create/edit/publish behavior still works. | Amendment §15; PRD §31.10 | Material Book/validation/editor tests | “writes an empty draft Book and indexes through material_catalog paths”; “updates Book tree with conflict check and rejects invalid depth”; “approves ready Books when RTDB omits empty node fields”; workspace save test | Book Editor architecture | `VERIFIED_LOCAL_FAITHFUL` |
| 9.2 Prove existing Reading V2 and Listening code do not import from or depend on the new Book Activity module. | Amendment §15; PRD §§9.11, 28.2, 31.10 | `bookActivityDependencyBoundary.test.ts` | “keeps Reading V2 and Listening independent from Book Activity and Assembly modules” | Architecture Cross-Feature Boundary | `VERIFIED_LOCAL_FAITHFUL` |
| 9.3 Prove existing material list/picker behavior remains stable for pre-existing material kinds. | Amendment §§4.3, 15 | adapter/Book picker/material list tests | “keeps legacy picker kinds stable and adds structural Activity without enabling unsupported kinds”; existing picker/list suite | Book Editor architecture | `VERIFIED_LOCAL_FAITHFUL` |
| 9.4 Update `findings-book-activity-baseline.md` with final owner paths, test names, and unresolved risks. | Amendment §1 | PRD0062b-local findings owner | Findings file exists and maps historical pointer explicitly | Local findings | `VERIFIED_LOCAL_FAITHFUL`; final review/proof rows recorded |
| 10.0 Complete corrective hardening before student runtime integration | Amendment §§1, 3–4; PRD §§24–25 | Tasks 10.1–10.13 | All child proof; 10.12 reopened and corrected | Architecture Current Foundation | `VERIFIED_LOCAL_FAITHFUL`; all children accepted |
| 10.1 Keep canonical `student_safe_projections` owner/super-admin readable only. Students must receive Activity content through a context-bound Book Delivery projection after entitlement resolution, not by enumerating canonical projections. | PRD §§24.2–24.4, 29.4, 31.9 | RTDB rules; projection/Delivery boundary | actual emulator two-student and cross-owner direct/parent denials; local Book Delivery context mismatch tests | Storage inventory/architecture | `VERIFIED_LOCAL_FAITHFUL`; no remote/deployed claim |
| 10.12 Split structural Book embeddability from operational placement readiness. Keep `interactive-activity` operational placement fail-closed until a verified placement adapter, published-version resolver, and runtime launch path exist; reject registry boolean/adapter contradictions in tests. | Amendment §§3, 4.1–4.3 | capability registry; Book integration | production false/unsupported; coherent injected row only; contradiction mutation matrix | Architecture Current Foundation | Reopened, corrected, and accepted as `VERIFIED_LOCAL_FAITHFUL` |

## Previously checked Component 01 ranges re-audited

| IDs | Canonical requirement family | Fresh proof boundary | Current classification |
|---|---|---|---|
| 1.1–1.2, 1.4–1.5 | kind/registry/legacy compatibility/tests | consolidated capability/material suite | `VERIFIED_LOCAL_FAITHFUL` accepted by packet review |
| 2.0–2.10 | Activity schema/contracts | schema/candidate suite with negative malformed/forbidden cases | `VERIFIED_LOCAL_FAITHFUL` accepted by packet review |
| 3.0–3.10 | validation/hidden IDs | schema/candidate/diff mutation tests | `VERIFIED_LOCAL_FAITHFUL` accepted by packet review |
| 4.0–4.7 | candidate/draft/publish | authoring/publish CAS/idempotency/immutability tests + Worker | `VERIFIED_LOCAL_FAITHFUL` accepted by packet review |
| 5.1–5.5 | safe projection construction | exact nested allowlist/synthetic extra-field tests | `VERIFIED_LOCAL_FAITHFUL` accepted by packet review |
| 6.0–6.7 | semantic diff/scoring | diff/scoring change lattice tests | `VERIFIED_LOCAL_FAITHFUL` accepted by packet review |
| 10.2–10.11, 10.13 | corrective hardening | full Activity domain/authoring/storage/projection/diff/scoring suite | `VERIFIED_LOCAL_FAITHFUL` accepted by packet review; no checked row accepted solely from history |

## Packet-exit evidence

Specification/boundary review and independent code-quality review passed after correction of public Activity-summary leakage and unsafe Activity picker/ref bypasses. Consolidated local proof passed 22 files/164 tests; Book UI/regression proof passed 4/4, 24/24, and 33/33; actual Firebase emulators passed 5/5 Book Activity and 24/24 Material Catalog; Worker 14/14; backup/restore 6/6; dependency isolation 2/2; focused strict TypeScript and canonical validator exited 0. Browser proof covered the final teacher Book picker on `http://localhost:5173` with no console warning/error and no persisted mutation. Remote/deployed proof is not claimed.

## Component 02 prerequisite — current evidence

| Task ID | Requirement | Source/config owner | Direct proof | Classification / residual |
|---|---|---|---|---|
| `T-P2B0-001` | Distinct non-public source R2 bucket/binding and direct arbitrary disposable-object denial before Packet 2B source metadata/upload skeleton | `cloudflare/wrangler.book-source.jsonc`; deployed `book-source-private-gateway`; `BOOK_SOURCE_R2` | `G-P2B0-001`: current R2/Worker readback, exact known-object authenticated put/get, unsigned canonical `HEAD`/`GET` denial, exact-key delete/post-delete absence, final zero-object metrics | `VERIFIED_REMOTE_FAITHFUL` for this row only; zone-route API returned `403`, so no fresh zero-zone-route claim; Component 02 remains open |

## Cross-component Source Delivery foundation — superseded and corrected 2026-07-17

The [student-safe full-PDF streaming decision](approval-record-2026-07-17-student-safe-full-pdf-streaming.md) supersedes the 2026-07-14 one-page transport decision. `canonical-task-overrides.json` records exact approved task outcomes; `check-canonical-plan.mjs` enforces current authority, statuses, P2 pointer, transport boundaries, and task-row integrity.

| Foundation requirement | Canonical task owners | Source/proof owner | Required negative or release proof | Current state |
|---|---|---|---|---|
| One private immutable student-safe PDF is the student document resource | C02 `1.1`, `1.5`, `3.0`–`8.6`; C03 `2.10`, `5.9`, `6.1`, `6.4`; C04 `1.3`, `5.0`, `5.4`–`5.7`, `5.9`; C07 delivery rows; C08 release rows | Book Source Delivery, Book Assembly, Book Delivery, normal PDF viewer | Deny unpublished/stale/retired/unentitled sources, teacher-only assets, storage authority, and unrelated Books; prove authenticated full/range stream and mapped page opening | `CLOSURE_BLOCKED`; revised production stream and real browser proof remain open |
| Page Groups and `physicalPageNumber` are mapping/navigation metadata, not transport objects | C02 `7.2`, `7.3`; C03 mapping/publication rows; C04 viewer/navigation rows; C05 manifest rows; C06 update rows | Assembly publication, runtime projection, viewer selection, Activity panel | Selecting page 32 opens PDF page 32 and resolves only Activities mapped to physical page 32; changing page does not mutate Activity order or answer state | Mapping foundation retained; viewer integration proof open |
| Homework freezes Source Version, Unit version, and exact page-to-Activity mappings without persisting storage credentials or temporary stream authority | C05 `1.3`, `1.7`, `2.3`, `3.1`, `3.2`, `3.5` | Book Homework manifest and Book Delivery | Assignment cannot broaden or silently repoint Source Version/mappings; stale authorization denied; no private R2 key or credential stored | `PLANNED` for P4 |
| Selective source or mapping update invalidates stale document authorization | C06 `1.2`, `1.4`, `1.7`, `4.6`, `4.13`, `5.8`, `9.10` | Homework update planner/apply, Source Delivery revocation, checkpoint projection | Old authorization cannot resolve a replaced/retired Source Version; checkpoint retains citations but no current delivery authority | `PLANNED` for P6 |
| Workload proof matches actual launch need | C02 performance/observability rows; C08 `4.12`, `6.14`, `9.8` | Worker/R2 telemetry and release evidence | Exercise 20–500 page PDFs, 100–200 uploads/day, bursts of 2–5 simultaneous uploads or deliveries; record latency, ranges, bytes, operations, retries, failures, and quota headroom | Revised proof open; Browser Run capacity is irrelevant because Browser Run is absent |
| P2 controls execution sequencing | README; master P2 row, stop conditions, and next pointer | Canonical orchestration | P3 cannot start from incomplete/unreviewed P2 behavior; old renderer proof cannot substitute for full-document stream proof | Pointer remains P2; P2 remains `CLOSURE_BLOCKED` |
| Semantic authority governance | 2026-07-17 approval record; `canonical-task-overrides.json`; `check-canonical-plan.mjs` | Documentation governance | Fail on stale packet pointer, missing full-document authority, active task rows that require Browser Run/renditions/per-page grants, wrong status, or reopened rows rechecked without proof | Governance proof must pass after this reconciliation |

## Conversation-decision reconciliation — approved 2026-07-14

| Accepted/reopened decision | Canonical PRD owner | Canonical task owners | Required proof or blocker | Current state |
|---|---|---|---|---|
| `presentationMode` correction was not resolved as JSON-re-import-only | §§9.7, 33 Runtime, 34, 35, 36 | C03 `5.2`, `5.12`; C08 `5.4`, `7.1` | Uncertain/wrong mode blocks publish until a separately approved single-authority correction mechanism exists; no independent Placement/UI authority | Product decision reopened; implementation blocked only for this correction mechanism |
| Unit and Revision prompt-copy controls are required capabilities, although teacher use is optional | §§11.6, 13.1, 13.4, 33 Assembly, 34, 36 | C03 `7.0`, `7.1`, `7.8`, `2.8`; C08 `5.4`, `7.1` | Both controls present when context exists; clipboard fallback; direct import remains independent | Existing bounded local capability evidence retained; Full V1 browser/release proof remains open |
| IELTS Reading/Listening representability requires complete coverage proof | §§9.5, 33 Runtime, 36 | C08 `4.1`, `7.2` | Versioned matrix classifies every researched task type as structured, source-assisted, release-blocking unsupported, or separately approved deferral | Matrix and closure proof remain open |
| Source labels are citations/correspondence only | §§10.6, 33 Runtime | C04 `4.4`, `10.7`; C07 `6.9`; C08 `5.19`, `7.2` | No competing Activity headings, navigator/progress numbering, or second order; accessible exact source relationship remains available | Direct task wording corrected; remaining browser/accessibility proof open |
| Full V1 retains an optional student-controlled personal SVG timer | §§14.8, 33 Runtime, 34, 36 | C04 `7.0`, `7.5`–`7.8`, `C04-A-TIMER`; C08 `7.2`, `9.4` | Accessible state; no teacher enforcement/visibility, telemetry, grade/deadline/submission/attempt/autosave/integrity/completion effect | Retained Full V1 scope; implementation/proof open |
| Student-safe full-document Source Delivery supersedes one-page transport terminology | §§3.3, 14.10, 15, 23.1, 29.3, 31.5, 34 | C02–C08 rows mapped above | One authorized document resource; viewer selects `physicalPageNumber`; Page Groups resolve right-panel Activities; no Browser Run, split, rendition, or per-page grant dependency | Authority corrected; implementation and production proof remain `CLOSURE_BLOCKED` |

## Packet P3 canonical audit — approved 2026-07-15

| Audit requirement | Canonical owner | Direct evidence | Current state |
|---|---|---|---|
| Inherited M1–M5 runtime checkboxes require fresh row-level proof | C04 all currently checked rows | `evidence/P3-canonical-audit-20260715.md`; fresh 7-file/105-test run plus live source inspection | 30 leaf rows and parents `9.0`, `10.0` reopened; accepted leaf coverage `42/95` (`44.2%`) |
| Projection consumer must be current, strict, and preview-capable | C04 `1.1`, `1.3`, `1.4`, `1.6` | Browser parser/launcher inspection; preview scan; delivery tests | Preview and strict-current-shape work open; legacy field synthesis rejected as authority |
| Runtime schema/presentation must implement canonical variants and supported stimuli | C04 `3.0`–`4.7` | Activity types/projection/shell/tests | Matching/ordering/long-response salvage retained; variant and complete stimulus rows reopened |
| Full-document navigation must select the requested PDF page and mapped Activity set without changing answer state | C04 `5.0`–`7.5` | Shell/launcher/Book Delivery inspection and component tests | Existing one-page shell evidence is historical only; document viewer integration, cross-page Activity behavior, and Unit navigator rows remain open |
| Autosave, attempt, result, and mobile claims require complete current contracts | C04 `8.0`–`10.7` | Hook/browser/service/types/UI tests | Local salvage retained; unmount/old-work, Course context, attempt-dropdown UX, mobile browser, and zero-billed evidence remain open |

## Current component phase map

| Component | Governed phase | Foundation implication |
|---|---|---|
| C01 | `VERIFIED` | Activity/security foundation accepted at recorded evidence boundary |
| C02 | `CLOSURE_BLOCKED` | Private upload, exact integrity, page count, lifecycle, and immutable completion evidence remain usable. Renderer/rendition/grant proof is historical; authenticated full-document stream/range, student-safe readiness, workload, denial, and browser proof remain open. |
| C03 | `CLOSURE_BLOCKED` | Local Assembly staging/mapping foundation retained; presentation-mode authority, mapped preview, stable publish-state reconciliation, full-document producer binding, and deployed/browser proof remain open. |
| C04 | `IMPLEMENTING` | Fresh audit retains 42/95 executable leaf rows (`44.2%`); 30 inherited rows reopened. Corrected P2 producer and accepted P2 exit are required before P3 implementation. |
| C05 | `PLANNED` | Homework page-set binding requirements preserved for P4 |
| C06 | `PLANNED` | Stale grant/resource invalidation requirements preserved for P6 |
| C07 | `IMPLEMENTING` | Local result/delivery work retained; `1.4` reopened for stronger contract |
| C08 | `IMPLEMENTING` | Local validation evidence exists; shippable and Full V1 release gates remain open |
