> IMMUTABLE RECOVERED BASELINE / EVIDENCE ONLY
>
> Exact body from Git object 9e6e7b2d2532c9efcae1db2c742e0d4aafe1ecdd. Evidence only; canonical task owner is parent-directory Component file.

# Task List: PRD0062 Component 08 - Full V1 Validation, Hardening, Release

Status: PLANNED. Validation may accumulate from exact reviewed producer inputs; final release waits for all required V1 evidence and approval gates.

Source PRD:
- `documentation/tasks/prd-book-based-interactive-activity-runtime-and-assembly.md`

Master orchestration:
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md`

## Relevant Files

- `documentation/tasks/PRD0062/findings-book-activity-baseline.md` - Append-only findings and verification ledger.
- `documentation/tasks/PRD0062/tasks-book-activity-master-orchestration.md` - Packet order and closure authority.
- `documentation/tasks/PRD0062/handoff-book-activity-packet-[N].md` - Historical or conditional handoffs only; do not require one per packet.
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
- Component 04 and the master Integration Pilot Gate prove domain/Assembly/Runtime integration and may use deterministic private adapters. This component owns the shippable-pilot gate and full-V1 end-to-end validation, including production source ingress/delivery and required deployed proof.
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
  - [ ] 1.9 Add tests proving browser clients cannot create published Activity versions directly, rewrite pinned bindings, create Review Checkpoints, mark historical rows excluded, issue source delivery for arbitrary pages, write notification records for other users, or alter update audits.
  - [ ] 1.10 Add tests proving public metadata/tree-only Books cannot launch source-assisted runtime or receive excerpts and public projections leak no private refs.
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
  - [ ] 3.8 Run Reading V2 and Listening dependency-boundary tests proving neither imports from or depends on the new Book Activity module.
  - [ ] 3.9 Prove legacy test-based Books remain ready/publishable after `unit` support.
  - [ ] 3.10 Prove Book completion progress never writes into legacy academic score/percentage fields.
  - [ ] 3.11 Prove stale autosaves cannot overwrite newer bindings and placement A completion cannot satisfy placement B.
  - [ ] 3.12 Record exact commands, pass/fail results, and remaining failures in findings.

- [ ] 4.0 Complete PRD0062 focused automated test strategy
  - [ ] 4.1 Run schema and domain tests from Component 01.
  - [ ] 4.2 Run Book structure tests from Component 03.
  - [ ] 4.3 Run manifest and reconciliation tests from Component 03.
  - [ ] 4.4 Run runtime component tests from Component 04.
  - [ ] 4.5 Run source delivery security tests from Component 02.
  - [ ] 4.6 Run homework schedule tests from Component 05.
  - [ ] 4.7 Run homework update matrix tests from Component 06.
  - [ ] 4.8 Run cross-feature delivery tests from Component 07.
  - [ ] 4.9 Run rules and emulator tests across all PRD0062 paths.
  - [ ] 4.10 Run public-rights state/projection tests and Book integrity no-auto-submit/no-nullification tests.
  - [ ] 4.11 Record exact commands and results in findings.
  - [ ] 4.12 Treat these as provisional pre-pilot release guardrails, then record and enforce the evidence-approved budgets before full-V1 sign-off: Assembly first usable state <=2s p75 / <=4s p95 after authenticated navigation; cached runtime page transition <=750ms p95; runtime projection <=1.5s p95; autosave acknowledgement <=1s p95 with <=6 writes/minute/active Activity and estimated backend cost <=$0.05 per active student-hour; Unit JSON payload <=1MiB; authorized Unit rendition <=25MiB and generation <=60s p95; rendition cache hit rate >=80%; and measured rendition cost <=$0.25 per Unit. Record environment, sample size, bytes, failures/retries, and any owner/date-approved recalibration; a copied target is not measured proof.

- [ ] 5.0 Complete browser verification matrix
  - [ ] 5.1 Use teacher URL `http://localhost:5173`.
  - [ ] 5.2 Use student URL `http://localhost:5174`.
  - [ ] 5.3 Use built-in dev quick-login buttons unless the task explicitly requires other credentials.
  - [ ] 5.4 Verify teacher desktop Assembly Workspace.
  - [ ] 5.5 Verify teacher affected-homework flow.
  - [ ] 5.6 Verify teacher result page Activity integrity report.
  - [ ] 5.7 Verify student desktop split runtime.
  - [ ] 5.8 Verify student reference-only/PDF focus.
  - [ ] 5.9 Verify student mobile tabs.
  - [ ] 5.10 Verify reload/autosave resume.
  - [ ] 5.11 Verify case-specific notification navigation.
  - [ ] 5.12 Verify previous-version review.
  - [ ] 5.13 Verify keyboard and accessible-name checks.
  - [ ] 5.14 Verify source-assisted accessible prompt/label/response-shape behavior.
  - [ ] 5.15 Verify public metadata-only launch is blocked and rights-approved playable launch succeeds.
  - [ ] 5.16 Verify visible feedback corrections show an audit-visible correction note.
  - [ ] 5.17 Verify no console errors.
  - [ ] 5.18 Record browser proof artifacts or notes in current findings/release record; a conditional handoff may link them but is not required.
  - [ ] 5.19 Verify 200% zoom, screen-reader text alternatives, source-page/printed-label citations, unsaved/conflict recovery, and no horizontal overflow at teacher widths `1208px`, `768px`, `375px` and student mobile widths required by the design rules.

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
  - [ ] 6.12 Replace source PDF/manifest in a controlled test and reconcile mappings.
  - [ ] 6.13 Record correction rate, unsupported interaction patterns, import errors, runtime issues, and teacher effort.
  - [ ] 6.14 Capture budget telemetry for each representative Unit (first usable/projection/navigation latency, autosave frequency/latency/retries/bytes, import/rendition duration and bytes, cache hit/miss, and estimated cost); compare against 4.12 without averaging away p95 or failed/retry paths.

- [ ] 7.0 Reconcile PRD acceptance criteria
  - [ ] 7.1 Reconcile Assembly acceptance criteria against source/test/browser evidence.
  - [ ] 7.2 Reconcile Runtime acceptance criteria against source/test/browser evidence.
  - [ ] 7.3 Reconcile Homework acceptance criteria against source/test/browser evidence.
  - [ ] 7.4 Reconcile Cross-feature delivery acceptance criteria against source/test/browser evidence.
  - [ ] 7.5 Reconcile Updates acceptance criteria against source/test/browser evidence.
  - [ ] 7.6 Reconcile Quality and safety acceptance criteria against source/test/browser/rules evidence.
  - [ ] 7.7 Mark any unmet criteria as blockers or explicitly approved deferrals with owner/date/rationale.
  - [ ] 7.8 Ensure no V1 acceptance criterion is silently skipped.
  - [ ] 7.9 Treat missing budget measurements or an unapproved budget overage as a release blocker; a pilot timer experiment cannot be used to waive the V1.1 personal-timer deferral.

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
  - [ ] 9.4 Summarize known risks and V1.1 candidates.
  - [ ] 9.5 Summarize commands/tests/browser verification.
  - [ ] 9.6 Summarize data paths, rules, backup coverage, and observability.
  - [ ] 9.7 Provide final release recommendation: PASS, PARTIAL, or BLOCKED.
  - [ ] 9.8 Include latency, autosave frequency/latency, rendition cost, JSON/rendition size, generation duration, cache hit rate, sample sizes, p95 values, and approved exceptions in release notes.

- [ ] 10.0 Preserve post-release boundaries
  - [ ] 10.1 Confirm Book Live Session execution remains disabled/out of V1 scope.
  - [ ] 10.2 Confirm automatic PDF interpretation/OCR/NotebookLM integration remains out of V1 scope.
  - [ ] 10.3 Confirm no aggregate Book grade is shown.
  - [ ] 10.4 Confirm no custom per-Unit React implementation exists.
  - [ ] 10.5 Confirm old PDF parser path remains unused by PRD0062.
  - [ ] 10.6 Confirm existing Reading V2 and Listening contracts remain independent.
  - [ ] 10.7 Confirm public source-assisted launch requires approved excerpt rights and public projections remain safe.
  - [ ] 10.8 Confirm completion progress never populates legacy score/grade fields.
  - [ ] 10.9 Confirm `studentId + activityId` remains viewer grouping only and every attempt retains unique/contextual identity.
