> **DORMANT_AFTER_CODE_RESET:** read [DORMANT-STATUS-2026-07-18.md](DORMANT-STATUS-2026-07-18.md). All status and checkbox state below is dated evidence until fresh reactivation approval and proof.

# CANONICAL FULL-WORDING CHECKLIST

> **Execution authority — C08**
>
> This is the sole execution checkbox owner for Component 08. It preserves the recovered `9e6e7b2d` hierarchy, with exact approved row replacements in `canonical-task-overrides.json`. Master, recovered, and audit copies provide reconciliation evidence only; their checkboxes/status are not execution boxes.
>
> Any inherited `documentation/tasks/PRD0062/**` pointer below is evidence-only; use PRD0062b-local authority and task files for execution.
>
> **Authority note:** The current canonical PRD and 2026-07-17 student-safe full-document decision win for Source Delivery release rows. Earlier one-page/renderer gates are superseded. Amendment §§1/3 mandatory packet contracts control remaining conflicts with weaker `9e6e7b2d` risk-scaled/parallel wording. Course/Class/public remain Full V1 destination. No remote/deployed claim follows from local evidence.

# Task List: PRD0062 Component 08 - Full V1 Validation, Hardening, Release

Status: IMPLEMENTING. Bounded local validation evidence exists; shippable-pilot and Full V1 closure remain blocked on all open rows, including the no-cost authenticated full-document Source Delivery gate.

Source PRD:
- `documentation/tasks/PRD0062b/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062b/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `documentation/tasks/PRD0062b/findings-book-activity-baseline.md` - Append-only findings and verification ledger.
- `documentation/tasks/PRD0062b/tasks-book-activity-master-orchestration.md` - Packet order and closure authority.
- `documentation/tasks/PRD0062b/handoff-book-activity-packet-[N].md` - Historical or conditional handoffs only; do not require one per packet.
- `src/config/featureRegistry.ts` - Feature, route, and action observability registration.
- `src/config/routeSecurity.ts` - Route security registration.
- `src/routes/teacherRoutes.tsx` - Teacher route verification.
- `src/routes/studentRoutes.tsx` - Student route verification.
- `database.rules.json` - RTDB rules closure.
- `firestore.rules` - Firestore rules closure.
- `src/__tests__/security/*` - Rules and emulator coverage.
- `documentation/rules/announcements.md` - User action announcement rule.
- `documentation/architecture/ui-design-standards.md` - UI design gate for final browser review.
- `documentation/rules/student-mobile-design.md` - Student mobile verification gate.
- `documentation/rules/student-data-loading.md` - Student data-loading verification gate.
- `documentation/rules/observability.md` - Route/action observability gate.

### Notes

- This component closes PRD0062 only after implementation packets are complete.
- PASS requires live source behavior, tests, docs, taskboxes, findings, traceability, guardrails, and dirty-path scope to agree.
- Browser proof is required for UX surfaces, but screenshots/manual inspection cannot replace automated tests for security, rules, versioning, permissions, or update semantics.
- Component 04 and the master Integration Pilot Gate prove domain/Assembly/Runtime integration and may use deterministic private adapters. Components 02, 03, and 07 own Source ingress, publication, entitlement, and full-document delivery implementation boundaries. This component owns the shippable-pilot gate and Full-V1 end-to-end validation of those boundaries, including zero-billed-usage/free-quota proof and required deployed readback.
- Full-V1 validation inputs are representative Units from the three PRD-listed source books.

## Risk-Scaled Change And Closure Rule

Follow the master risk-scaled contract. Packet 8 may keep one concise release contract because it genuinely spans rules, browser, remote/deployed state, recovery, compatibility, performance/cost, and rollback; do not recreate one full matrix per earlier packet.

Keep local, regression, emulator/rules, browser, representative-Unit, remote/deployed, recovery, performance/cost, and release-note proof distinct. PRD0062 becomes `CLOSED` only when every V1 acceptance criterion is directly proven or explicitly approved as deferred with owner/date/rationale. Reconcile active authority and touched current-state docs; inspect historical handoffs only when needed. Create a final handoff only if release remains partial/blocked or ownership transfers.

## Tasks

- [ ] 1.0 Complete full rules and emulator coverage
  - [ ] 1.1 Inventory every new RTDB node and Firestore collection created by PRD0062.
  - [ ] 1.2 Confirm rules exist for every new path.
  - [ ] 1.3 Confirm indexes exist where needed.
  - [ ] 1.4 Confirm backup coverage exists where required.
  - [ ] 1.5 Add malicious cross-owner read/write tests.
  - [ ] 1.6 Add malicious cross-student read/write tests.
  - [ ] 1.7 Add tests rejecting student reads of answer keys, authoring records, full PDF source, teacher notes, hidden provenance, and restricted checkpoint details.
  - [ ] 1.8 Add tests rejecting teacher reads of private Solo attempts and crafted updates to another teacher's homework.
  - [ ] 1.9 Add tests proving browser clients cannot create published Activity versions directly, rewrite pinned bindings/mappings, create Review Checkpoints, mark historical rows excluded, authorize another Book/user/context, read private R2 identity, delete or revoke Source Versions/entitlements/current pointers/document-authorization state, write notification records for other users, or alter update audits. Only trusted owners/Workers may perform cleanup; historical attempts/checkpoints remain readable.
  - [ ] 1.10 Add tests proving public metadata/tree-only Books cannot launch source-assisted runtime or receive the student-safe document, and public projections leak no private refs, storage/provider authority, teacher-only sources, answer keys, or unpublished Source Versions.
  - [ ] 1.11 Run focused and full security test commands recorded in findings.

- [ ] 2.0 Complete observability, feature registry, routes, and announcements
  - [ ] 2.1 Verify every new teacher route is registered in route security and feature registry.
  - [ ] 2.2 Verify every new student route is registered in route security and feature registry.
  - [ ] 2.3 Verify every new create, save, update, publish, assign, upload, import, revise, apply-update, and notification action is observable.
  - [ ] 2.4 Verify every listed user-facing create/save/update/publish/assign/remove/upload/import/revise/apply-update outcome uses the shared announcement system, with `role="status"` for success/info/warning and `role="alert"` for failures; any outcome excluded from announcement proof must have an explicit not-user-facing rationale in the reconciliation row.
  - [ ] 2.5 Verify persistent student update notifications use Notification Bell records, not transient announcements.
  - [ ] 2.6 Verify logs exclude Book content, answers, PDFs, prompts, and sensitive source details.
  - [ ] 2.7 Run observability/announcement guardrails and record results.

- [ ] 3.0 Complete regression suite across existing systems
  - [ ] 3.1 Run existing Book create/edit/publish tests.
  - [ ] 3.2 Run existing Book ref repair tests.
  - [ ] 3.3 Run existing homework create/detail/list tests.
  - [ ] 3.4 Run Reading V2 pinned assignment launch tests.
  - [ ] 3.5 Run IELTS Listening/Reading/Writing/THCS StudentPracticePage routing tests.
  - [ ] 3.6 Run Notification Bell tests.
  - [ ] 3.7 Run result visibility and ownership tests.
  - [x] 3.8 Run Reading V2 and Listening dependency-boundary tests proving neither imports from or depends on the new Book Activity module.
  - [ ] 3.9 Prove legacy test-based Books remain ready/publishable after `unit` support.
  - [ ] 3.10 Prove Book completion progress never writes into legacy academic score/percentage fields.
  - [ ] 3.11 Prove stale autosaves cannot overwrite newer bindings and placement A completion cannot satisfy placement B.
  - [ ] 3.12 Record exact commands, pass/fail results, and remaining failures in findings.

- [ ] 4.0 Complete PRD0062 focused automated test strategy
  - [ ] 4.1 Complete and verify the versioned IELTS Reading and Listening task-type coverage matrix, then run schema and domain tests from Component 01. Every researched task type must be classified as structurally supported, source-assisted, explicitly unsupported and release-blocking, or separately approved as deferred; generic family names or isolated examples are insufficient proof.
  - [ ] 4.2 Run Book structure tests from Component 03.
  - [ ] 4.3 Run manifest and reconciliation tests from Component 03.
  - [ ] 4.4 Run runtime component tests from Component 04.
  - [ ] 4.5 Run source delivery security tests from Component 02.
  - [ ] 4.6 Run homework schedule tests from Component 05.
  - [ ] 4.7 Run homework update matrix tests from Component 06.
  - [ ] 4.8 Run cross-feature delivery tests from Component 07.
  - [ ] 4.9 Run rules and emulator tests across all PRD0062 paths.
  - [ ] 4.10 Run public publication-state/projection tests and Book integrity no-auto-submit/no-nullification tests; rights-attestation metadata and rights-specific revalidation are not part of the contract.
  - [ ] 4.11 Record exact commands and results in findings.
  - [ ] 4.12 Establish evidence-backed performance and quota guardrails before full-V1 sign-off: Assembly first usable state, runtime projection, document authorization, stream first-byte, initial viewer page, in-document page navigation, and autosave acknowledgement/write rate. Measure 20–500-page PDFs, 100–200 PDF uploads per day, and bursts of 2–5 simultaneous uploads/deliveries. Record bytes, optional range/resume behavior, bounded Worker memory/CPU/request duration, Firebase/Cloudflare operations and egress, sample size, failures/retries, concurrency, and quota headroom. The agreed workload must show zero billed usage inside Firebase Spark and Cloudflare Workers/R2 allowances. Browser Run, page rendering, a paid tier, or copied targets cannot satisfy this row.

- [ ] 5.0 Complete browser verification matrix
  - [ ] 5.1 Use teacher URL `http://localhost:5173`.
  - [ ] 5.2 Use student URL `http://localhost:5174`.
  - [ ] 5.3 Use built-in dev quick-login buttons unless the task explicitly requires other credentials.
  - [ ] 5.4 Verify teacher desktop Assembly Workspace, including required `Copy Unit JSON Prompt` and `Copy Revision Prompt` capabilities with manual-copy fallback, direct-import independence, and publication blocking for unresolved `presentationMode` until its correction mechanism is explicitly approved.
  - [ ] 5.5 Verify teacher affected-homework flow.
  - [ ] 5.6 Verify teacher result page Activity integrity report.
  - [x] 5.7 Verify student desktop split runtime.
  - [x] 5.8 Verify student reference-only/PDF focus.
  - [x] 5.9 Verify student mobile tabs.
  - [x] 5.10 Verify reload/autosave resume.
  - [ ] 5.11 Verify case-specific notification navigation.
  - [ ] 5.12 Verify previous-version review.
  - [ ] 5.13 Verify keyboard and accessible-name checks.
  - [x] 5.14 Verify source-assisted accessible prompt/label/response-shape behavior.
  - [ ] 5.15 Verify public metadata-only/tree-only launch is blocked and playable launch succeeds only after trusted publication, active entitlement, and canonical student-safe Source Version/document-delivery checks; no rights-attestation metadata, teacher-only source, answer key, or private/provider authority reaches the browser.
  - [ ] 5.16 Verify visible feedback corrections show an audit-visible correction note.
  - [ ] 5.17 Verify no console errors.
  - [x] 5.18 Record browser proof artifacts or notes in current findings/release record; a conditional handoff may link them but is not required.
  - [ ] 5.19 Verify 200% zoom, screen-reader text alternatives, source-page/printed-label citations used only for exact correspondence rather than competing Activity order, unsaved/conflict recovery, and no horizontal overflow at teacher widths `1208px`, `768px`, `375px` and student mobile widths required by the design rules.

- [ ] 6.0 Run full-V1 validation Units from representative source books
  - [ ] 6.1 Validate one representative Unit from *IELTS Grammar for Bands 6.5 and Above*.
  - [ ] 6.2 Validate one representative Unit from *IELTS Vocabulary up to Band 6.0*.
  - [ ] 6.3 Validate one representative Unit from *IELTS Vocabulary for Bands 6.5 and Above*, including inspected Listening note-completion practice and Reading practice with matching plus Y/N/NG where available.
  - [ ] 6.4 For each validation Unit, upload immutable PDF.
  - [ ] 6.5 For each validation Unit, supply page/activity manifest.
  - [ ] 6.6 For each validation Unit, supply answer-key evidence and Unit Activity JSON.
  - [ ] 6.7 Validate and preview in Assembly Workspace.
  - [ ] 6.8 Publish the Unit.
  - [ ] 6.9 Complete as student in desktop and mobile runtime.
  - [ ] 6.10 Assign as homework.
  - [ ] 6.11 Revise one Activity and exercise every update case.
  - [ ] 6.12 Execute one disposable end-to-end lifecycle: upload an immutable student-safe Source Version; replace it with a new Source Version; reconcile and publish; create an assignment and current entitlement; authorize and stream the complete pinned PDF; select mapped and unmapped pages in the viewer; supersede/revoke the prior entitlement and stale document resource; and perform trusted detach/delete cleanup. Assert old Source Version/attempt/checkpoint history remains readable, stale/unsafe/private-authority requests fail closed, and post-cleanup Source/entitlement/pointer/authorization readbacks show no disposable leftovers.
  - [ ] 6.13 Record correction rate, unsupported interaction patterns, import errors, runtime issues, and teacher effort.
  - [ ] 6.14 Capture performance and quota telemetry for each representative Book/Unit: first usable/projection/document-authorization/stream-start/viewer-page/navigation latency, autosave frequency/latency/retries/bytes, original-upload duration/bytes, range/resume behavior, bounded memory/CPU/request duration, Firebase/Cloudflare operations and egress, concurrency, quota headroom, and billed-usage readback. Compare against 4.12 without averaging away p95 or failed/retry paths; any billed usage blocks release.

- [ ] 7.0 Reconcile PRD acceptance criteria
  - [ ] 7.1 Reconcile Assembly acceptance criteria against source/test/browser evidence, including required prompt-copy capabilities and the approved single-authority `presentationMode` correction mechanism.
  - [ ] 7.2 Reconcile Runtime acceptance criteria against source/test/browser evidence, including complete IELTS Reading/Listening task-type coverage, citation-only source labels, and the optional student-controlled inert personal timer.
  - [ ] 7.3 Reconcile Homework acceptance criteria against source/test/browser evidence.
  - [ ] 7.4 Reconcile Cross-feature delivery acceptance criteria against source/test/browser evidence.
  - [ ] 7.5 Reconcile Updates acceptance criteria against source/test/browser evidence.
  - [ ] 7.6 Reconcile Quality and safety acceptance criteria against source/test/browser/rules evidence.
  - [ ] 7.7 Mark any unmet criteria as blockers or explicitly approved deferrals with owner/date/rationale.
  - [ ] 7.8 Ensure no V1 acceptance criterion is silently skipped.
  - [ ] 7.9 Treat missing performance/quota measurements, insufficient free-tier headroom, any billed usage, or an unapproved performance overage as a release blocker; a paid fallback and a pilot timer experiment cannot waive Source Delivery or retained timer requirements.

- [ ] 8.0 Reconcile taskboxes, findings, conditional handoffs, and dirty paths
  - [ ] 8.1 Ensure all completed taskboxes correspond to implemented source and passing tests.
  - [ ] 8.2 Ensure findings reflect final source truth and do not contain stale contradicted claims.
  - [ ] 8.3 For each handoff that the master conditional rule actually required, verify status, proof, remaining work, and owner/context boundary. Do not create missing handoffs or “next prompts” solely for ceremony.
  - [ ] 8.4 Inventory dirty paths and confirm all are expected for PRD0062 closure.
  - [ ] 8.5 Run diff check/UTF-8/guardrails according to repo rules.
  - [ ] 8.6 Stop as BLOCKED if taskboxes, current findings, required tests, required handoffs, and source state disagree after safe in-scope reconciliation.

- [ ] 9.0 Prepare release closure notes
  - [ ] 9.1 Summarize implemented scope.
  - [ ] 9.2 Summarize explicit non-goals preserved.
  - [ ] 9.3 Summarize technical spikes and final decisions.
  - [ ] 9.4 Summarize known risks and genuine V1.1 candidates. Do not list the retained optional personal timer as deferred scope; it is required before Full V1 closure.
  - [ ] 9.5 Summarize commands/tests/browser verification.
  - [ ] 9.6 Summarize data paths, rules, backup coverage, and observability.
  - [ ] 9.7 Provide final release recommendation: PASS, PARTIAL, or BLOCKED.
  - [ ] 9.8 Include upload, authorization, stream-start, viewer-page, navigation, and autosave latency; PDF sizes; range/resume behavior; memory/CPU/request duration; concurrency; Firebase/Cloudflare operations and egress; free-tier quota headroom; zero-billed-usage readback; sample sizes; p95 values; and approved performance exceptions in release notes. Browser Run, monetary exceptions, or paid fallbacks are not approvable under this PRD.

- [ ] 10.0 Preserve post-release boundaries
  - [x] 10.1 Confirm Book Live Session execution remains disabled/out of V1 scope.
  - [x] 10.2 Confirm automatic PDF interpretation/OCR/NotebookLM integration remains out of V1 scope.
  - [x] 10.3 Confirm no aggregate Book grade is shown.
  - [x] 10.4 Confirm no custom per-Unit React implementation exists.
  - [ ] 10.5 Confirm old PDF parser path remains unused by PRD0062.
  - [x] 10.6 Confirm existing Reading V2 and Listening contracts remain independent.
  - [ ] 10.7 Confirm public source-assisted launch requires trusted publication, active entitlement, and canonical student-safe Source Version/document-delivery readiness; public projections expose no rights-attestation metadata, teacher-only source, answer key, private object identity, or storage/provider authority.
  - [ ] 10.8 Confirm completion progress never populates legacy score/grade fields.
  - [ ] 10.9 Confirm `studentId + activityId` remains viewer grouping only and every attempt retains unique/contextual identity.

## Amendment-compliant packet contract

### Storage

Inventory every PRD0062 RTDB node and Firestore collection touched by hardening, including immutable/mutable fields, owner, indexes, projections, archive/delete semantics, backup/restore, and rollback. Reconcile changed paths against `documentation/tasks/PRD0062b/implementation-audit.md`; no missing-store or unchanged-row silence.

### Security/rules

Prove positive owner access and malicious cross-owner, cross-student, answer-key/PDF/teacher-note/provenance, published-version, binding, checkpoint, notification, update-audit, unpublished/unauthorized-entitlement, and public-leakage negatives. Name production rule authority and emulator command/status; remote/deployed proof requires approval and readback.

### UI/accessibility/announcements

Verify route/feature/action observability and shared announcements for every listed user-facing mutation (`role="status"` success/info/warning; `role="alert"` failure), with explicit `N/A` rationale for service-only work. Browser checks apply UI design, student mobile/data-loading, navigation, keyboard, accessible-name, zoom, overflow, and console requirements; persistent student updates use Notification Bell records.

### Migration/compatibility

Preserve legacy test Books, specialized launchers, non-Book Homework, result visibility, Course/Class behavior, and independent Reading V2/Listening contracts. No aggregate Book grade, completion-to-score writes, Book Live launch, OCR/NotebookLM, obsolete parser substitution, or bypass of trusted publication/entitlement/document-delivery gates. Course/Class/public remain Full V1 destination.

### Tests

Run focused owner, emulator/rules, stale/replay/idempotency, public/integrity-negative, observability, and bounded adjacent regression suites. Execute representative-book and budget tests only with named fixtures and risk rationale; record exact command, cwd, runner/config, exit, tests, omitted suites, and product-vs-harness result.

### Browser/runtime proof

Use teacher `http://localhost:5173` and student `http://localhost:5174` with dev quick-login. Record desktop/mobile/reload, accessibility/200% zoom, source citations/correspondence without competing Activity order, prompt-copy availability/fallback, presentation-mode blocking/correction, optional timer accessibility/non-authority, conflict recovery, notification navigation, console, upload/document-stream/viewer latency, autosave, range/resume, concurrency, quota, and zero-billed-usage evidence. Browser proof does not close rules, CAS, permissions, Source Delivery, update, versioning, or provider billing/readback claims.

### Authority reconciliation

Map every C08 ID and Full V1 criterion to the current canonical PRD, `canonical-task-overrides.json` where applicable, the Approved Amendment (`prd-book-based-interactive-activity-runtime-and-assembly-approved-amendment-2026-07-09.md`) §§1, 3, 9–16, local `authority-and-provenance.md`, `reconciliation-ledger.md`, `streamlined-prototype-orchestration.md`, and `implementation-audit.md` Component 08, plus source owner, exact test title, negative proof, findings/traceability row, browser/remote class, and taskbox. The approved 2026-07-14 override controls changed rows; Amendment §§1/3 mandatory packet contracts and sequential readiness control remaining conflicts.

### Evidence classification

Classify claims as `VERIFIED_LOCAL_FAITHFUL`, `PARTIAL`, `IMPLEMENTED_UNVERIFIED`, `NOT_STARTED`, `OFF_SPEC`, `FALSE_CHECKED`, browser/local, or remote/deployed. `[x]` is limited to audited local-faithful salvage, including bounded C08-5.18 evidence; no screenshot, unit PASS, or untracked path proves Full V1 release.

### Rollback/blockers

Keep prior rules, projections, bindings, attempts, and release state recoverable; rollback any failed hardening mutation without destructive repair. Block release on missing adversarial proof, dirty-path disagreement, unmeasured performance/quota telemetry, insufficient free-tier headroom, any billed usage, Browser Run/page-rendering dependency, unsafe/teacher-only PDF delivery, absent representative-book evidence, required approval, or source/docs/findings divergence. Final verdict remains `PASS`, `PARTIAL`, or `BLOCKED`; no closure while blockers remain.

## Reconciliation markers

`[x]` appears only for `VERIFIED_LOCAL_FAITHFUL` local evidence. Parent rows stay open when any child remains open. No local checkbox asserts remote/deployed behavior.

| IDs | Classification | Checkbox authority |
|---|---|---|
| `3.8`, `5.7`–`5.10`, `5.14`, `5.18`, `10.1`–`10.4`, `10.6` | VERIFIED_LOCAL_FAITHFUL | `[x]` bounded local evidence only |
| Parents `1.0`–`5.0`, `10.0`; `1.1`–`1.9`, `2.3`, `2.6`, `3.11`, `4.10`, `5.4`, `5.13`, `6.14`, `7.9`, `10.8`, `10.9`; changed `4.12`, `5.19`; `8.0`, `8.3`, `8.6` | PARTIAL | `[ ]` open |
| `2.1`, `2.2`, `3.1`–`3.7`, `3.9`, `4.1`–`4.9`, `5.1`–`5.3`, `5.17` | IMPLEMENTED_UNVERIFIED | `[ ]` open |
| `1.10`, `1.11`, `2.5`, `2.7`, `3.10`, `3.12`, `4.11`, `5.5`, `5.6`, `5.11`, `5.12`, `5.15`, `5.16`, `6.0`–`6.13`, `7.0`–`7.8`, `8.1`, `8.2`, `8.4`, `8.5`, `9.0`–`9.7`, `9.8`, `10.5`, `10.7` | NOT_STARTED | `[ ]` open |
| `2.4`, `8.4` | OFF_SPEC | `[ ]` replace; no authority |
| `8.5` | FALSE_CHECKED | `[ ]` replace; no authority |

## Implementer contract

- **Files:** this canonical C08 checklist and its immutable recovered baseline only; no code, cloud, current PRD0062, staging, or commit.
- **Counts:** 117 exact task IDs in full 9e6e7b2d hierarchy; 12 checked VERIFIED_LOCAL_FAITHFUL, 105 open or explicitly non-faithful.
- **Recovery proof:** body sourced from Git target `9e6e7b2d`; recovered file preserves target body with immutable evidence banner and no execution checkbox/status authority.
- **Residuals:** security/rules, representative books, acceptance reconciliation, release notes, dirty-path closure, and all remote/deployed proof remain open; Course/Class/public remain Full V1 destination.
